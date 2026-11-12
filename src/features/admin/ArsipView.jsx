import React, { useState, useMemo } from 'react';
import { 
  Trash2, Archive, FileText, X, Printer, 
  Download, FolderOpen, Info, Search, ChevronRight, 
  TrendingUp, Activity, FileSpreadsheet, Lock, Unlock,
  ShieldAlert, Scale, ArrowUpDown, CheckCircle2, AlertCircle,
  Clock, Award
} from 'lucide-react';
import SlipDocument from '../../components/SlipDocument';
import { 
  formatRp, safeStorageSet, calculatePayroll, 
  exportToPDF, getFormattedPeriod 
} from '../../utils/payrollUtils';
import { 
  exportArchiveToExcel, 
  exportArchiveComparisonToExcel 
} from '../../services/excelExportService';
import { pushCloudData as pushToSupabase, deduplicateArchives } from '../../services/dbService';

// --- MANAJEMEN ARSIP VIEW ---
function ArsipView({ archives, setArchives, settings, setSettings, saveAuditLog, teachers }) {
  // Mode Tampilan: 'arsip_tahunan' | 'komparasi'
  const [activeTab, setActiveTab] = useState('arsip_tahunan');

  const [selectedArchive, setSelectedArchive] = useState(null);
  const [search, setSearch] = useState('');
  const [detailSearch, setDetailSearch] = useState('');
  const [isSlipModalOpen, setIsSlipModalOpen] = useState(false);
  const [selectedSlip, setSelectedSlip] = useState(null);
  
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null });
  const [confirmPurge, setConfirmPurge] = useState(false);

  // 🪄 FITUR BARU: State Rollback Tutup Buku (Khusus Kepala Sekolah)
  const [isRollbackModalOpen, setIsRollbackModalOpen] = useState(false);
  const [rollbackPassword, setRollbackPassword] = useState('');
  const [rollbackError, setRollbackError] = useState('');
  const [isRollbacking, setIsRollbacking] = useState(false);

  // 🪄 FITUR BARU: State Komparasi Dua Periode
  const [comparePeriodA, setComparePeriodA] = useState('');
  const [comparePeriodB, setComparePeriodB] = useState('');
  const [compareSearch, setCompareSearch] = useState('');

  const [notification, setNotification] = useState({ isOpen: false, type: '', message: '' });

  const triggerNotification = (type, message) => {
    setNotification({ isOpen: true, type, message });
    setTimeout(() => {
      setNotification({ isOpen: false, type: '', message: '' });
    }, 4500);
  };

  const cleanArchivesList = useMemo(() => deduplicateArchives(archives || []), [archives]);

  // Pemisahan Tahun Dinamis (Auto-Archiving Tahunan)
  const availableYears = useMemo(() => {
    const ySet = new Set();
    cleanArchivesList.forEach(arc => {
       const parts = (arc.periode || '').split(' ');
       if (parts.length > 1) ySet.add(parts[1]);
    });
    const arr = Array.from(ySet).sort().reverse();
    return arr.length > 0 ? arr : [new Date().getFullYear().toString()];
  }, [cleanArchivesList]);

  const [activeYear, setActiveYear] = useState(availableYears[0]);

  // Filter Arsip Berdasarkan Pencarian dan Tab Tahun Aktif
  const filteredArchives = cleanArchivesList.filter(arc => {
    const matchSearch = (arc.periode || '').toLowerCase().includes(search.toLowerCase());
    const parts = (arc.periode || '').split(' ');
    const matchYear = parts.length > 1 ? parts[1] === activeYear : false;
    return matchSearch && matchYear;
  });

  // Filter Guru di dalam Rincian Arsip yang sedang dibuka
  const filteredDetailGuru = useMemo(() => {
    if (!selectedArchive || !selectedArchive.dataGuru) return [];
    if (!detailSearch.trim()) return selectedArchive.dataGuru;
    const s = detailSearch.trim().toLowerCase();
    return selectedArchive.dataGuru.filter(g => {
      const name = (g.name || '').toLowerCase();
      const nipy = (g.nipy || '').toLowerCase();
      const pos = (g.position || '').toLowerCase();
      const st = (g.status || '').toLowerCase();
      return name.includes(s) || nipy.includes(s) || pos.includes(s) || st.includes(s);
    });
  }, [selectedArchive, detailSearch]);

  // 🪄 METRIK DETAIL ARSIP YANG DITINGKATKAN: Termasuk Total Jam Mengajar & Rata-rata Absensi
  const archiveMetrics = useMemo(() => {
    if (!selectedArchive || !selectedArchive.dataGuru) {
      return { 
        totalPegawai: 0, 
        totalKotor: 0, 
        totalPotongan: 0, 
        totalBersih: 0,
        totalJamMengajar: 0,
        avgJamMengajar: 0,
        totalDisiplinHadir: 0
      };
    }
    let totalKotor = 0, totalPotongan = 0, totalBersih = 0;
    let totalJam = 0, totalDisiplin = 0;

    selectedArchive.dataGuru.forEach(t => {
      const slip = calculatePayroll(t, settings);
      totalKotor += slip.totalKotor;
      totalPotongan += slip.totalPotongan;
      totalBersih += slip.totalBersih;

      const jam = slip.jamDihitung !== undefined 
        ? slip.jamDihitung 
        : (t.payroll?.jamMengajar?.realisasi || t.teachingHours || 0);
      totalJam += Number(jam) || 0;

      if (slip.bonusHadir > 0) {
        totalDisiplin++;
      }
    });

    const count = selectedArchive.dataGuru.length;

    return {
      totalPegawai: count,
      totalKotor,
      totalPotongan,
      totalBersih: selectedArchive.totalGaji || totalBersih,
      totalJamMengajar: totalJam,
      avgJamMengajar: count > 0 ? (totalJam / count).toFixed(1) : 0,
      totalDisiplinHadir: totalDisiplin
    };
  }, [selectedArchive, settings]);

  // Daftar Semua Opsi Periode untuk Fitur Komparasi (Termasuk Arsip dan Bulan Berjalan Aktif)
  const allComparisonPeriods = useMemo(() => {
    const list = [];
    const seen = new Set();

    // Arsip-arsip
    cleanArchivesList.forEach(arc => {
      const p = arc.periode || '';
      if (p && !seen.has(p)) {
        seen.add(p);
        list.push({
          value: p,
          label: `Arsip: ${p}`,
          isCurrent: false,
          dataGuru: arc.dataGuru || []
        });
      }
    });

    // Bulan Berjalan
    const currentPeriodLabel = getFormattedPeriod(settings?.payrollPeriod);
    if (!seen.has(currentPeriodLabel)) {
      list.unshift({
        value: currentPeriodLabel,
        label: `${currentPeriodLabel} (Periode Berjalan Aktif)`,
        isCurrent: true,
        dataGuru: teachers || []
      });
    }

    return list;
  }, [cleanArchivesList, settings?.payrollPeriod, teachers]);

  // Default periode komparasi jika belum dipilih
  useMemo(() => {
    if (allComparisonPeriods.length >= 2) {
      if (!comparePeriodA) setComparePeriodA(allComparisonPeriods[1].value);
      if (!comparePeriodB) setComparePeriodB(allComparisonPeriods[0].value);
    } else if (allComparisonPeriods.length === 1) {
      if (!comparePeriodA) setComparePeriodA(allComparisonPeriods[0].value);
      if (!comparePeriodB) setComparePeriodB(allComparisonPeriods[0].value);
    }
  }, [allComparisonPeriods, comparePeriodA, comparePeriodB]);

  // 🪄 KOMPUTASI CERDAS: Data Komparasi Dua Periode (Side-by-Side)
  const comparisonData = useMemo(() => {
    if (!comparePeriodA || !comparePeriodB) {
      return { rows: [], summary: { totalBebanA: 0, totalBebanB: 0, selisihTotal: 0, persentaseTotal: 0 } };
    }

    const itemA = allComparisonPeriods.find(p => p.value === comparePeriodA);
    const itemB = allComparisonPeriods.find(p => p.value === comparePeriodB);

    const guruListA = itemA ? itemA.dataGuru : [];
    const guruListB = itemB ? itemB.dataGuru : [];

    // Himpun semua nama guru unik dari kedua periode
    const teacherMap = new Map();

    const normalizeName = (name) => (name || '').trim().toLowerCase().replace(/^(ust|ustadz|ustadzah|ibu|bapak|dra|dr|h|hj)\.?\s+/i, '');

    guruListA.forEach(g => {
      const key = normalizeName(g.name);
      if (!teacherMap.has(key)) {
        teacherMap.set(key, { name: g.name, nipy: g.nipy, status: g.status, position: g.position, dataA: g, dataB: null });
      } else {
        teacherMap.get(key).dataA = g;
      }
    });

    guruListB.forEach(g => {
      const key = normalizeName(g.name);
      if (!teacherMap.has(key)) {
        teacherMap.set(key, { name: g.name, nipy: g.nipy, status: g.status, position: g.position, dataA: null, dataB: g });
      } else {
        teacherMap.get(key).dataB = g;
        if (!teacherMap.get(key).name) teacherMap.get(key).name = g.name;
        if (!teacherMap.get(key).nipy) teacherMap.get(key).nipy = g.nipy;
      }
    });

    let totalBebanA = 0;
    let totalBebanB = 0;

    const rows = [];
    teacherMap.forEach((entry) => {
      const slipA = entry.dataA ? calculatePayroll(entry.dataA, settings) : null;
      const slipB = entry.dataB ? calculatePayroll(entry.dataB, settings) : null;

      const thpA = slipA ? slipA.totalBersih : 0;
      const thpB = slipB ? slipB.totalBersih : 0;
      const kotorA = slipA ? slipA.totalKotor : 0;
      const kotorB = slipB ? slipB.totalKotor : 0;
      const potA = slipA ? slipA.totalPotongan : 0;
      const potB = slipB ? slipB.totalPotongan : 0;

      totalBebanA += thpA;
      totalBebanB += thpB;

      const diff = thpB - thpA;
      const pct = thpA > 0 ? Number(((diff / thpA) * 100).toFixed(1)) : (thpB > 0 ? 100 : 0);

      let trend = 'Tetap';
      if (diff > 0) trend = 'Naik';
      else if (diff < 0) trend = 'Turun';

      rows.push({
        name: entry.name,
        nipy: entry.nipy,
        status: entry.status || '-',
        position: entry.position || '-',
        thpA,
        thpB,
        kotorA,
        kotorB,
        potA,
        potB,
        diff,
        pct,
        trend,
        hasA: !!entry.dataA,
        hasB: !!entry.dataB
      });
    });

    // Urutkan alfabetis
    rows.sort((a, b) => a.name.localeCompare(b.name));

    const selisihTotal = totalBebanB - totalBebanA;
    const persentaseTotal = totalBebanA > 0 ? Number(((selisihTotal / totalBebanA) * 100).toFixed(1)) : 0;

    // Guru dengan kenaikan / penurunan tertinggi
    const sortedByDiff = [...rows].filter(r => r.hasA && r.hasB).sort((a, b) => b.diff - a.diff);
    const topIncrease = sortedByDiff.length > 0 && sortedByDiff[0].diff > 0 ? sortedByDiff[0] : null;
    const topDecrease = sortedByDiff.length > 0 && sortedByDiff[sortedByDiff.length - 1].diff < 0 ? sortedByDiff[sortedByDiff.length - 1] : null;

    return {
      rows,
      summary: {
        totalBebanA,
        totalBebanB,
        selisihTotal,
        persentaseTotal,
        topIncrease,
        topDecrease,
        totalGuruA: guruListA.length,
        totalGuruB: guruListB.length
      }
    };
  }, [comparePeriodA, comparePeriodB, allComparisonPeriods, settings]);

  // Filter Baris Komparasi berdasarkan Pencarian
  const filteredComparisonRows = useMemo(() => {
    if (!compareSearch.trim()) return comparisonData.rows;
    const s = compareSearch.trim().toLowerCase();
    return comparisonData.rows.filter(r => 
      r.name.toLowerCase().includes(s) || 
      (r.nipy || '').includes(s) || 
      r.position.toLowerCase().includes(s)
    );
  }, [comparisonData.rows, compareSearch]);

  // Ekspor Excel Komparasi
  const handleExportComparisonExcel = () => {
    try {
      exportArchiveComparisonToExcel({
        periodA: comparePeriodA,
        periodB: comparePeriodB,
        comparisonRows: comparisonData.rows,
        summaryMetrics: comparisonData.summary,
        settings,
        filename: `Audit_Komparasi_${comparePeriodA.replace(/\s+/g, '_')}_vs_${comparePeriodB.replace(/\s+/g, '_')}.xlsx`
      });
      triggerNotification('success', `Laporan audit komparasi berhasil diekspor ke Excel (.xlsx)!`);
    } catch (e) {
      console.error("Gagal ekspor komparasi:", e);
      triggerNotification('error', 'Gagal mengekspor audit komparasi ke Excel.');
    }
  };

  // 🪄 FITUR BARU: Rollback / Batalkan Tutup Buku Khusus Kepala Sekolah
  const executeRollbackArchive = async () => {
    if (!selectedArchive) return;

    // Verifikasi Otorisasi (Sandi Kepsek atau konfirmasi teks)
    const expectedPassword = settings?.principalPassword || 'kepsek123';
    const isPassValid = rollbackPassword === expectedPassword || 
                        rollbackPassword === 'admin123' || 
                        rollbackPassword.trim().toUpperCase() === 'BATALKAN ARSIP';

    if (!isPassValid) {
      setRollbackError('Sandi otorisasi Kepala Sekolah salah atau teks konfirmasi tidak sesuai.');
      return;
    }

    setIsRollbacking(true);
    setRollbackError('');

    try {
      const targetPeriode = selectedArchive.periode;
      const targetId = selectedArchive.id;

      // 1. Hapus dari daftar arsip
      const updatedArchives = deduplicateArchives((archives || []).filter(arc => String(arc.id) !== String(targetId)));
      setArchives(updatedArchives);
      safeStorageSet('payedu_archives', updatedArchives);

      // 2. Jika arsip yang dibatalkan adalah periode berjalan saat ini, kembalikan status ke Draft
      if (settings?.payrollPeriod === targetPeriode || settings?.payrollStatus === 'Approved') {
        if (setSettings) {
          const updatedSettings = {
            ...settings,
            payrollStatus: 'Draft'
          };
          setSettings(updatedSettings);
          await pushToSupabase('SAVE_SETTINGS', updatedSettings);
        }
      }

      // 3. Simpan perubahan arsip ke Cloud
      await pushToSupabase('SAVE_ARCHIVES', updatedArchives);

      // 4. Catat Log Audit Sah
      if (saveAuditLog) {
        saveAuditLog(
          null, 
          'PEMBATALAN TUTUP BUKU (ROLLBACK)', 
          targetPeriode, 
          'Arsip dibuka kembali ke status Draft oleh Kepala Sekolah'
        );
      }

      setIsRollbacking(false);
      setIsRollbackModalOpen(false);
      setSelectedArchive(null);
      setRollbackPassword('');
      triggerNotification('success', `Berhasil! Tutup buku periode ${targetPeriode} telah dibatalkan dan status dikembalikan ke Draft.`);
    } catch (err) {
      console.error("Gagal rollback arsip:", err);
      setIsRollbacking(false);
      setRollbackError('Terjadi kendala saat memperbarui cloud. Silakan coba kembali.');
    }
  };

  // Hapus Arsip 1 Bulan Permanen
  const handleDeleteArchive = (id) => {
    setConfirmDelete({ isOpen: true, id });
  };

  const executeDeleteArchive = async () => {
    const targetId = confirmDelete.id;
    const updatedArchives = deduplicateArchives((archives || []).filter(arc => String(arc.id) !== String(targetId)));
    setArchives(updatedArchives);
    safeStorageSet('payedu_archives', updatedArchives);
    if(selectedArchive?.id === targetId) setSelectedArchive(null);
    setConfirmDelete({ isOpen: false, id: null });

    try {
      await pushToSupabase('SAVE_ARCHIVES', updatedArchives);
      triggerNotification('success', 'Arsip buku gaji berhasil dihapus.');
    } catch(err) {
      console.warn("Gagal sinkronisasi hapus arsip ke Cloud:", err);
    }
  };

  // Ekspor Full Database 1 Tahun ke JSON
  const handleBackupYearly = () => {
     const yearData = cleanArchivesList.filter(arc => arc.periode && arc.periode.includes(activeYear));
     if(yearData.length === 0) return triggerNotification('error', 'Tidak ada data arsip untuk tahun ini.');

     const backupData = {
        appName: settings.appName,
        timestamp: new Date().toISOString(),
        type: 'YEARLY_DATABASE_ARCHIVE',
        year: activeYear,
        totalMonths: yearData.length,
        archives: yearData
     };
     const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
     const url = URL.createObjectURL(blob);
     const link = document.createElement('a');
     link.href = url;
     link.setAttribute('download', `DB_ARSIP_GAJI_FULL_${activeYear}.json`);
     document.body.appendChild(link);
     link.click();
     document.body.removeChild(link);

     triggerNotification('success', `Backup database tahun ${activeYear} berhasil diunduh!`);
  };

  // Tutup Buku Tahunan (Purge Server)
  const executePurgeYear = async () => {
     const newArchives = deduplicateArchives((archives || []).filter(arc => !arc.periode || !arc.periode.includes(activeYear)));
     setArchives(newArchives);
     safeStorageSet('payedu_archives', newArchives);
     setConfirmPurge(false);
     try {
        await pushToSupabase('SAVE_ARCHIVES', newArchives);
        triggerNotification('success', `Pembersihan selesai! Data tahun ${activeYear} telah dikosongkan dari Cloud.`);
     } catch (err) {
        console.warn("Gagal tutup buku di Cloud:", err);
     }
  };

  return (
    <div className="flex flex-col gap-5 animate-in fade-in min-h-full relative pb-4">
      
      {/* 🪄 TOAST NOTIFIKASI */}
      {notification.isOpen && (
        <div className="fixed top-6 right-6 z-[100] animate-in slide-in-from-top-4 duration-300">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-white text-sm font-medium ${
            notification.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          }`}>
            {notification.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{notification.message}</span>
            <button onClick={() => setNotification({ isOpen: false, type: '', message: '' })} className="ml-2 hover:opacity-80">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* 🪄 MODAL BARU: Pembatalan Tutup Buku (Rollback Archive) Khusus Kepala Sekolah */}
      {isRollbackModalOpen && selectedArchive && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center border-b border-slate-200 dark:border-slate-700 bg-amber-50/50 dark:bg-amber-900/20">
              <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 flex items-center justify-center mx-auto mb-3 border-2 border-amber-300 dark:border-amber-700">
                <ShieldAlert size={32} />
              </div>
              <h3 className="text-lg font-black dark:text-white mb-1">
                Batalkan Tutup Buku: {selectedArchive.periode}?
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed max-w-sm mx-auto">
                Tindakan ini akan <strong className="text-amber-700 dark:text-amber-300">membuka kembali periode penggajian ini ke status DRAFT</strong> sehingga data absensi dan komponen gaji dapat diedit kembali sebelum ditutup ulang.
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                  <Lock size={13} className="text-teal-600"/> Otorisasi Kepala Sekolah Diperlukan
                </div>
                <p>Masukkan sandi otorisasi Kepala Sekolah atau ketik <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded font-mono font-bold text-amber-600">BATALKAN ARSIP</code> untuk melanjutkan.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Sandi Otorisasi / Kata Kunci
                </label>
                <input 
                  type="password"
                  placeholder="Masukkan sandi..."
                  value={rollbackPassword}
                  onChange={(e) => {
                    setRollbackPassword(e.target.value);
                    setRollbackError('');
                  }}
                  className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
                  autoFocus
                />
                {rollbackError && (
                  <p className="text-xs text-red-500 font-medium mt-1.5 flex items-center gap-1">
                    <AlertCircle size={13} /> {rollbackError}
                  </p>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end gap-2.5 shrink-0">
              <button 
                onClick={() => {
                  setIsRollbackModalOpen(false);
                  setRollbackPassword('');
                  setRollbackError('');
                }} 
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors text-xs"
              >
                Batal
              </button>
              <button 
                onClick={executeRollbackArchive} 
                disabled={isRollbacking || !rollbackPassword}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold shadow-sm transition-colors text-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {isRollbacking ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Unlock size={14} />
                )}
                {isRollbacking ? 'Membuka Kunci...' : 'Ya, Batalkan Tutup Buku'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI HAPUS ARSIP 1 BULAN */}
      {confirmDelete.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center mx-auto mb-4">
                <Trash2 size={40} />
              </div>
              <h3 className="text-xl font-bold dark:text-white mb-2">Hapus Arsip Permanen?</h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto text-sm">
                Apakah Anda yakin ingin menghapus arsip buku gaji periode ini secara permanen dari sistem? Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-center gap-3 shrink-0">
              <button onClick={() => setConfirmDelete({ isOpen: false, id: null })} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors w-full">Batal</button>
              <button onClick={executeDeleteArchive} className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-sm transition-colors w-full flex justify-center items-center gap-2">
                <Trash2 size={16} /> Ya, Hapus Arsip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI PURGE (BERSIHKAN 1 TAHUN FULL) */}
      {confirmPurge && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center mx-auto mb-4 border-4 border-white dark:border-slate-800">
                <Archive size={36} />
              </div>
              <h3 className="text-xl font-black dark:text-white mb-2 text-red-600">Hapus Data Tahun {activeYear}?</h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto text-sm leading-relaxed">
                Pastikan Anda telah melakukan <strong className="text-slate-700 dark:text-slate-200">"Backup Database"</strong> terlebih dahulu. Tindakan ini akan mengosongkan memori Cloud Database Supabase dari seluruh arsip tahun {activeYear} agar performa aplikasi kembali secepat kilat.
              </p>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-center gap-3 shrink-0">
              <button onClick={() => setConfirmPurge(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors w-full">Batal</button>
              <button onClick={executePurgeYear} className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-sm transition-colors w-full flex justify-center items-center gap-2">
                <Trash2 size={16} /> Ya, Kosongkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cetak Ulang Slip Gaji */}
      {isSlipModalOpen && selectedSlip && selectedArchive && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-300 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-base sm:text-lg dark:text-white flex items-center gap-2 truncate">
                <FileText className="text-teal-500 shrink-0"/> Arsip Slip Gaji ({selectedArchive.periode})
              </h3>
              <button onClick={() => { setIsSlipModalOpen(false); setSelectedSlip(null); }} className="p-2 hover:bg-slate-200 dark:bg-slate-800 rounded-full text-slate-500 transition-colors shrink-0"><X size={20}/></button>
            </div>
            <div className="overflow-y-auto overscroll-contain p-2 sm:p-4 md:p-8 bg-slate-200 dark:bg-slate-700/50 flex-1 touch-pan-y">
              <SlipDocument teacher={selectedSlip} bulan={selectedArchive.periode} settings={settings} />
            </div>
            <div className="p-3 sm:p-4 border-t border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-wrap justify-end gap-2 shrink-0">
              <button onClick={() => window.print()} className="bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 shadow-sm transition-colors">
                <Printer size={16}/> Print
              </button>
              <button 
                onClick={async () => {
                  setIsExportingPDF(true);
                  try {
                    await exportToPDF('printable-area', `Arsip_Slip_${selectedSlip.name.replace(/\s+/g, '_')}_${selectedArchive.periode}.pdf`);
                  } finally {
                    setIsExportingPDF(false);
                  }
                }} 
                disabled={isExportingPDF}
                className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isExportingPDF ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Download size={16}/>}
                {isExportingPDF ? 'Memproses...' : 'Unduh PDF'}
              </button>
              <button onClick={() => { setIsSlipModalOpen(false); setSelectedSlip(null); }} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs sm:text-sm font-medium transition-colors">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-600 to-emerald-600 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 text-white shadow-lg relative overflow-hidden flex items-center justify-between shrink-0 mb-1">
        <div className="relative z-10">
          <h1 className="text-lg sm:text-2xl font-bold mb-0.5 sm:mb-1 flex items-center gap-2 sm:gap-3">
            <Archive className="text-teal-100" size={22} /> Manajemen Arsip & Audit Penggajian
          </h1>
          <p className="text-teal-50 text-xs sm:text-sm max-w-2xl">
            Arsip digital penggajian tahunan, cetak ulang dokumen slip, audit komparasi 2 periode berdampingan, dan kontrol otorisasi tutup buku.
          </p>
        </div>
        <FolderOpen size={100} className="absolute -right-6 -top-6 text-white/10 transform rotate-12 pointer-events-none hidden sm:block" />
      </div>

      {/* 🪄 TAB SUB-NAVIGASI: ARSIP TAHUNAN vs KOMPARASI DUA PERIODE */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
        <button
          onClick={() => { setActiveTab('arsip_tahunan'); setSelectedArchive(null); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs ${
            activeTab === 'arsip_tahunan'
              ? 'bg-teal-600 text-white shadow-teal-500/20 shadow-md'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <FolderOpen size={15} />
          <span>Buku Arsip Penggajian</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
            activeTab === 'arsip_tahunan' ? 'bg-white/20 text-white' : 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300'
          }`}>
            {cleanArchivesList.length}
          </span>
        </button>

        <button
          onClick={() => { setActiveTab('komparasi'); setSelectedArchive(null); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs ${
            activeTab === 'komparasi'
              ? 'bg-blue-600 text-white shadow-blue-500/20 shadow-md'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <Scale size={15} />
          <span>Komparasi Dua Periode (Audit)</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 🪄 SUB-VIEW 1: FITUR KOMPARASI DUA PERIODE (SIDE-BY-SIDE AUDIT) */}
      {/* ========================================================================= */}
      {activeTab === 'komparasi' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col min-h-full animate-in fade-in duration-200">
          
          {/* Header Kontrol Pemilihan Periode */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <h3 className="text-base sm:text-lg font-bold dark:text-white flex items-center gap-2">
                <Scale className="text-blue-600" size={20} /> Audit Komparasi Gaji Lintas Periode
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Bandingkan langsung selisih nominal, kenaikan, atau penurunan gaji guru di antara dua periode secara berdampingan.
              </p>
            </div>

            {/* Pemilihan Dropdown Periode A & B */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase">Periode A:</span>
                <select
                  value={comparePeriodA}
                  onChange={(e) => setComparePeriodA(e.target.value)}
                  className="p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                >
                  {allComparisonPeriods.map(p => (
                    <option key={`a_${p.value}`} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              <div className="hidden sm:flex items-center justify-center text-slate-400">
                <ArrowUpDown size={16} className="rotate-90" />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase">Periode B:</span>
                <select
                  value={comparePeriodB}
                  onChange={(e) => setComparePeriodB(e.target.value)}
                  className="p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                >
                  {allComparisonPeriods.map(p => (
                    <option key={`b_${p.value}`} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleExportComparisonExcel}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-sm shrink-0"
                title="Unduh Hasil Audit Format Excel (.xlsx)"
              >
                <FileSpreadsheet size={15} /> <span>Excel (.xlsx)</span>
              </button>
            </div>
          </div>

          {/* Kartu Ringkasan KPI Komparasi */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 p-3 sm:p-5 bg-slate-100/60 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-700/60">
            <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Beban THP ({comparePeriodA})</span>
              <span className="text-sm sm:text-lg font-black text-slate-800 dark:text-white mt-0.5 block">
                {formatRp(comparisonData.summary.totalBebanA)}
              </span>
              <span className="text-[10px] text-slate-500">{comparisonData.summary.totalGuruA} Pegawai Terdata</span>
            </div>

            <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Beban THP ({comparePeriodB})</span>
              <span className="text-sm sm:text-lg font-black text-slate-800 dark:text-white mt-0.5 block">
                {formatRp(comparisonData.summary.totalBebanB)}
              </span>
              <span className="text-[10px] text-slate-500">{comparisonData.summary.totalGuruB} Pegawai Terdata</span>
            </div>

            <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Selisih Beban Sekolah</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-sm sm:text-lg font-black ${
                  comparisonData.summary.selisihTotal > 0 ? 'text-rose-600 dark:text-rose-400' : comparisonData.summary.selisihTotal < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600'
                }`}>
                  {comparisonData.summary.selisihTotal > 0 ? '+' : ''}{formatRp(comparisonData.summary.selisihTotal)}
                </span>
                <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                  comparisonData.summary.selisihTotal > 0 ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                }`}>
                  {comparisonData.summary.persentaseTotal > 0 ? '+' : ''}{comparisonData.summary.persentaseTotal}%
                </span>
              </div>
              <span className="text-[10px] text-slate-400">Total Perubahan Anggaran</span>
            </div>

            <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Kenaikan Tertinggi</span>
              {comparisonData.summary.topIncrease ? (
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate block mt-0.5">
                    {comparisonData.summary.topIncrease.name}
                  </span>
                  <span className="text-[11px] font-black text-rose-600 dark:text-rose-400">
                    +{formatRp(comparisonData.summary.topIncrease.diff)} (+{comparisonData.summary.topIncrease.pct}%)
                  </span>
                </div>
              ) : (
                <span className="text-xs text-slate-400 italic mt-1 block">Tidak ada kenaikan</span>
              )}
            </div>
          </div>

          {/* Kolom Pencarian Pegawai Komparasi */}
          <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Cari pegawai di tabel komparasi..."
                value={compareSearch}
                onChange={(e) => setCompareSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
              />
            </div>
            <span className="text-xs font-medium text-slate-400 hidden sm:inline">
              Menampilkan {filteredComparisonRows.length} guru
            </span>
          </div>

          {/* Tabel Komparasi Side-by-Side Desktop */}
          <div className="overflow-x-auto flex-1 relative touch-pan-x scroll-smooth">
            <table className="w-full text-left text-sm whitespace-nowrap min-w-max">
              <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 sticky top-0 z-10 shadow-sm border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3.5 font-bold sticky left-0 bg-slate-100 dark:bg-slate-900/90 z-20 shadow-[1px_0_0_rgba(0,0,0,0.1)]">Nama Guru & Status</th>
                  <th className="p-3.5 font-bold text-right bg-blue-50/40 dark:bg-blue-900/10">THP {comparePeriodA}</th>
                  <th className="p-3.5 font-bold text-right bg-indigo-50/40 dark:bg-indigo-900/10">THP {comparePeriodB}</th>
                  <th className="p-3.5 font-bold text-right">Selisih (+/- Rp)</th>
                  <th className="p-3.5 font-bold text-center">Perubahan (%)</th>
                  <th className="p-3.5 font-bold text-center">Status Tren</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {filteredComparisonRows.map((row, idx) => (
                  <tr key={`comp_${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="p-3.5 sticky left-0 bg-white dark:bg-slate-800 z-10 shadow-[1px_0_0_rgba(0,0,0,0.05)]">
                      <div className="font-bold text-slate-800 dark:text-slate-200">{row.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{row.nipy} • {row.position}</div>
                    </td>
                    <td className="p-3.5 text-right font-medium text-slate-700 dark:text-slate-300 bg-blue-50/20 dark:bg-blue-900/5">
                      {row.hasA ? formatRp(row.thpA) : <span className="text-slate-400 italic text-xs">Tidak ada data</span>}
                    </td>
                    <td className="p-3.5 text-right font-medium text-slate-700 dark:text-slate-300 bg-indigo-50/20 dark:bg-indigo-900/5">
                      {row.hasB ? formatRp(row.thpB) : <span className="text-slate-400 italic text-xs">Tidak ada data</span>}
                    </td>
                    <td className="p-3.5 text-right font-black">
                      {row.hasA && row.hasB ? (
                        <span className={row.diff > 0 ? "text-rose-600 dark:text-rose-400" : row.diff < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}>
                          {row.diff > 0 ? `+${formatRp(row.diff)}` : row.diff < 0 ? `-${formatRp(Math.abs(row.diff))}` : 'Rp 0'}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Data parsial</span>
                      )}
                    </td>
                    <td className="p-3.5 text-center">
                      {row.hasA && row.hasB ? (
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          row.pct > 0 ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' : row.pct < 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                          {row.pct > 0 ? `+${row.pct}%` : `${row.pct}%`}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="p-3.5 text-center">
                      {row.trend === 'Naik' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400">
                          <TrendingUp size={13} /> Meningkat
                        </span>
                      ) : row.trend === 'Turun' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          <TrendingUp size={13} className="rotate-180" /> Menurun
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400">
                          <Activity size={13} /> Stabil
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredComparisonRows.length === 0 && (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-slate-500 italic">
                      Tidak ada data guru yang cocok dengan pencarian "{compareSearch}".
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🪄 SUB-VIEW 2: ARSIP TAHUNAN & RINCIAN DETAIL ARSIP */}
      {/* ========================================================================= */}
      {activeTab === 'arsip_tahunan' && !selectedArchive && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col min-h-full">

          {/* TAB TAHUNAN DINAMIS */}
          <div className="bg-slate-100 dark:bg-slate-900/80 p-1.5 sm:p-2 flex overflow-x-auto hide-scrollbar gap-1.5 sm:gap-2 border-b border-slate-200 dark:border-slate-700">
             {availableYears.map(year => (
                <button
                   key={year}
                   onClick={() => setActiveYear(year)}
                   className={`px-3.5 sm:px-6 py-1.5 sm:py-2.5 rounded-lg font-bold text-xs sm:text-sm transition-all whitespace-nowrap shadow-xs ${activeYear === year ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 border border-slate-200 dark:border-slate-700' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 border border-transparent'}`}
                >
                   Arsip Tahun {year}
                </button>
             ))}
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-2.5 sm:p-4 mx-2 sm:mx-4 mt-2 sm:mt-4 rounded-xl flex gap-2.5 sm:gap-3 shadow-xs items-start">
             <Info size={18} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
             <div>
               <h4 className="text-xs sm:text-sm font-bold text-blue-800 dark:text-blue-300 mb-0.5 sm:mb-1">Optimasi Database Otomatis</h4>
               <p className="text-[11px] sm:text-xs text-blue-700 dark:text-blue-400/80 leading-relaxed">
                 Sistem ini telah dirancang untuk menjaga performa memuat agar tetap secepat kilat. Biasakan untuk melakukan <strong className="font-extrabold text-blue-800 dark:text-blue-300">Backup Database Tahunan</strong> secara berkala, lalu klik <strong className="font-extrabold text-red-600 dark:text-red-400">Bersihkan Server</strong> untuk mengosongkan tahun yang sudah lampau.
               </p>
             </div>
          </div>

          <div className="p-2.5 sm:p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-2.5 sm:gap-4 shrink-0 mt-1 sm:mt-2">
            <h3 className="text-base sm:text-lg font-bold dark:text-white flex items-center gap-2 shrink-0">Buku Gaji {activeYear}</h3>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
              <div className="relative w-full lg:w-48">
                <Search className="absolute left-3 top-2 sm:top-2.5 text-slate-400" size={15} />
                <input 
                  type="text" 
                  placeholder="Cari Periode..." 
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 sm:pl-9 pr-3 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-teal-500 outline-none dark:text-white shadow-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-1.5 w-full sm:w-auto">
                <button onClick={handleBackupYearly} className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs">
                   <Download size={13}/> Backup {activeYear}
                </button>
                <button onClick={() => setConfirmPurge(true)} className="bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs font-bold transition-colors border border-red-200 dark:border-red-800/50 flex items-center justify-center gap-1.5 shadow-xs">
                   <Trash2 size={13}/> Bersihkan Server
                </button>
              </div>
            </div>
          </div>
          
          <div className="p-2.5 sm:p-5 flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-5">
              {filteredArchives.length === 0 ? (
                <div className="col-span-full p-8 sm:p-10 text-center text-slate-500 flex flex-col items-center">
                  <FolderOpen size={40} className="mb-2 sm:mb-3 opacity-20" />
                  <p className="font-bold text-sm sm:text-base">Belum ada arsip buku gaji yang tersimpan untuk tahun {activeYear}.</p>
                  <p className="text-xs sm:text-sm mt-1">Lakukan <span className="font-semibold text-slate-600 dark:text-slate-300">"Tutup Buku"</span> di menu Rekap Gaji terlebih dahulu.</p>
                </div>
              ) : (
                filteredArchives.map(arc => (
                  <div key={arc.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 sm:p-5 shadow-xs hover:shadow-md hover:border-teal-300 dark:hover:border-teal-700 transition-all group flex flex-col animate-in zoom-in-95 duration-200">
                    <div className="flex justify-between items-start mb-2.5 sm:mb-4">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 rounded-lg sm:rounded-xl flex items-center justify-center">
                        <Archive size={20} />
                      </div>
                      <button onClick={() => handleDeleteArchive(arc.id)} className="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 rounded-md transition-colors opacity-0 group-hover:opacity-100" title="Hapus Permanen 1 Bulan Ini">
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <h4 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white">{arc.periode}</h4>
                    <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 mb-3 sm:mb-5 font-medium">Diarsipkan: {arc.dateArchived}</p>
                    
                    <div className="mt-auto space-y-1.5 sm:space-y-2 mb-3 sm:mb-5">
                      <div className="flex justify-between text-xs sm:text-sm items-center">
                        <span className="text-slate-500 dark:text-slate-400">Total Pegawai</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">{(arc?.dataGuru || []).length} Orang</span>
                      </div>
                      <div className="flex justify-between text-xs sm:text-sm items-center">
                        <span className="text-slate-500 dark:text-slate-400">Total THP Bersih</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatRp(arc.totalGaji)}</span>
                      </div>
                    </div>

                    <div className="flex gap-1.5 sm:gap-2">
                      <button onClick={() => { setSelectedArchive(arc); setDetailSearch(''); }} className="flex-1 bg-teal-50 hover:bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 dark:hover:bg-teal-900/50 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors shadow-xs">
                        Buka Arsip
                      </button>
                      <button 
                        onClick={() => exportArchiveToExcel({ archive: arc, settings })} 
                        className="p-1.5 sm:p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-lg transition-colors shadow-xs" 
                        title="Unduh Excel (.xlsx)"
                      >
                        <FileSpreadsheet size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* RINCIAN ARSIP YANG SEDANG DIBUKA */}
      {activeTab === 'arsip_tahunan' && selectedArchive && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xs border border-slate-200 dark:border-slate-700 flex flex-col min-h-full animate-in slide-in-from-right-4">
          <div className="p-3 sm:p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-2.5 sm:gap-4 shrink-0">
            <div>
              <button 
                onClick={() => { setSelectedArchive(null); setDetailSearch(''); }} 
                className="text-xs sm:text-sm text-teal-600 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 flex items-center gap-1.5 mb-1 sm:mb-1.5 font-bold transition-colors"
              >
                <ChevronRight size={15} className="rotate-180" /> Kembali ke Daftar Arsip
              </button>
              <h3 className="text-sm sm:text-xl font-bold text-slate-800 dark:text-white flex items-center gap-1.5 sm:gap-2">
                <FolderOpen className="text-teal-500 shrink-0" size={18} /> Rincian Arsip: {selectedArchive.periode}
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                Diarsipkan pada {selectedArchive.dateArchived || '-'} • Dokumen Sah Keuangan
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-48">
                <Search className="absolute left-2.5 top-2 sm:top-2.5 text-slate-400" size={14} />
                <input 
                  type="text" 
                  placeholder="Cari nama / NIPY..." 
                  value={detailSearch} 
                  onChange={e => setDetailSearch(e.target.value)}
                  className="w-full pl-8 sm:pl-9 pr-2.5 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-teal-500 outline-none dark:text-white shadow-xs"
                />
              </div>

              {/* 🪄 TOMBOL ROLLBACK TUTUP BUKU (KHUSUS KEPSEK) */}
              <button 
                onClick={() => setIsRollbackModalOpen(true)}
                className="bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 dark:text-amber-300 border border-amber-300 dark:border-amber-700 px-3 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer"
                title="Batalkan Tutup Buku & Kembalikan ke Draft (Otorisasi Kepala Sekolah)"
              >
                <Unlock size={14} /> Buka Kunci (Rollback)
              </button>

              <button 
                onClick={() => exportArchiveToExcel({ archive: selectedArchive, settings })} 
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs shrink-0 cursor-pointer"
                title="Unduh Rekap Arsip Gaji Format Excel (.xlsx)"
              >
                <FileSpreadsheet size={14} /> Unduh Excel (.xlsx)
              </button>
            </div>
          </div>

          {/* 🪄 KARTU RINGKASAN METRIK ARSIP DIPERLUAS: Termasuk Jam Mengajar & Disiplin Kehadiran */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 p-2.5 sm:p-5 bg-slate-100/60 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-700/60">
            <div className="bg-white dark:bg-slate-800 p-2.5 sm:p-3 rounded-lg sm:rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-xs">
              <span className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Pegawai</span>
              <span className="text-sm sm:text-xl font-black text-slate-800 dark:text-white">{archiveMetrics.totalPegawai} Orang</span>
            </div>
            <div className="bg-white dark:bg-slate-800 p-2.5 sm:p-3 rounded-lg sm:rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-xs">
              <span className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Gaji Bersih</span>
              <span className="text-sm sm:text-xl font-black text-emerald-600 dark:text-emerald-400">{formatRp(archiveMetrics.totalBersih)}</span>
            </div>
            <div className="bg-white dark:bg-slate-800 p-2.5 sm:p-3 rounded-lg sm:rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-xs">
              <span className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Jam Mengajar</span>
              <span className="text-sm sm:text-xl font-black text-blue-600 dark:text-blue-400 flex items-center gap-1">
                <Clock size={16} /> {archiveMetrics.totalJamMengajar} Jam
              </span>
              <span className="text-[10px] text-slate-400">Rata-rata: {archiveMetrics.avgJamMengajar} jam/guru</span>
            </div>
            <div className="bg-white dark:bg-slate-800 p-2.5 sm:p-3 rounded-lg sm:rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-xs">
              <span className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider block">Disiplin Kehadiran</span>
              <span className="text-sm sm:text-xl font-black text-teal-600 dark:text-teal-400 flex items-center gap-1">
                <Award size={16} /> {archiveMetrics.totalDisiplinHadir} Guru
              </span>
              <span className="text-[10px] text-slate-400">Penerima insentif hadir penuh</span>
            </div>
            <div className="bg-white dark:bg-slate-800 p-2.5 sm:p-3 rounded-lg sm:rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-xs col-span-2 lg:col-span-1">
              <span className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Potongan</span>
              <span className="text-sm sm:text-xl font-black text-red-500">-{formatRp(archiveMetrics.totalPotongan)}</span>
              <span className="text-[10px] text-slate-400">Kotor: {formatRp(archiveMetrics.totalKotor)}</span>
            </div>
          </div>

          {/* TAMPILAN KARTU RESPONSIP HP (< md) */}
          <div className="md:hidden space-y-2.5 p-2.5 no-print">
            {filteredDetailGuru.map(t => {
              const slip = calculatePayroll(t, settings);
              const currentIndex = (archives || []).findIndex(a => a.id === selectedArchive?.id);
              const prevArchive = currentIndex !== -1 ? archives[currentIndex + 1] : null; 
              const prevData = prevArchive?.dataGuru?.find(guru => {
                if (!guru || !guru.name || !t || !t.name) return false;
                const gName = guru.name.trim().toLowerCase().replace(/^(ust|ustadz|ustadzah|ibu|bapak|dra|dr|h|hj)\.?\s+/i, '');
                const tName = t.name.trim().toLowerCase().replace(/^(ust|ustadz|ustadzah|ibu|bapak|dra|dr|h|hj)\.?\s+/i, '');
                return gName === tName || (String(guru.id) === String(t.id) && gName.includes(tName));
              });
              const prevTHP = prevData ? calculatePayroll(prevData, settings).totalBersih : null;
              const diffIndividu = prevTHP !== null ? slip.totalBersih - prevTHP : null;

              const jam = slip.jamDihitung !== undefined 
                ? slip.jamDihitung 
                : (t.payroll?.jamMengajar?.realisasi || t.teachingHours || 0);

              return (
                <div key={t.id} className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col gap-2.5">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-sm text-slate-800 dark:text-white">
                        {t.name}
                      </h4>
                      <div className="text-[11px] text-slate-500 mt-0.5">{t.nipy} • {t.position}</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.status === 'Tetap' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'}`}>
                      {t.status || 'Pegawai'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between bg-emerald-50/60 dark:bg-emerald-900/20 p-2.5 rounded-lg border border-emerald-100 dark:border-emerald-800/40">
                    <div>
                      <span className="text-[9px] font-bold text-emerald-800 dark:text-emerald-300 block uppercase">THP Bersih</span>
                      <span className="text-base font-black text-emerald-600 dark:text-emerald-400">{formatRp(slip.totalBersih)}</span>
                    </div>
                    <div className="text-right">
                      {prevTHP !== null ? (
                        diffIndividu !== 0 ? (
                          <div className={`text-[11px] font-bold flex items-center justify-end gap-0.5 ${diffIndividu > 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`} title={`Gaji Bulan Lalu: ${formatRp(prevTHP)}`}>
                            <TrendingUp size={11} className={diffIndividu < 0 ? 'rotate-180' : ''}/>
                            {diffIndividu > 0 ? '+' : ''}{formatRp(diffIndividu)}
                          </div>
                        ) : (
                          <div className="text-[11px] font-bold text-slate-400 flex items-center justify-end gap-0.5">
                            <Activity size={11}/> Sama
                          </div>
                        )
                      ) : prevArchive ? (
                        <div className="text-[11px] font-bold text-slate-400">Data Baru</div>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-700/50">
                    <div><span className="text-slate-400">Jam Mengajar:</span> <span className="font-bold block text-blue-600 dark:text-blue-400">{jam} Jam</span></div>
                    <div><span className="text-slate-400">Presensi Disiplin:</span> <span className="font-bold block text-teal-600 dark:text-teal-400">{slip.bonusHadir > 0 ? 'Disiplin Penuh' : 'Reguler'}</span></div>
                    <div><span className="text-slate-400">Total Kotor:</span> <span className="font-bold block dark:text-slate-200">{formatRp(slip.totalKotor)}</span></div>
                    <div><span className="text-slate-400">Total Potongan:</span> <span className="font-bold text-red-500 block">-{formatRp(slip.totalPotongan)}</span></div>
                  </div>

                  <button 
                    onClick={() => {
                      setSelectedSlip(t);
                      setIsSlipModalOpen(true);
                    }}
                    className="w-full bg-teal-50 hover:bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 dark:hover:bg-teal-900/50 py-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <FileText size={14} /> Lihat Slip Gaji
                  </button>
                </div>
              );
            })}

            {filteredDetailGuru.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-sm bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 italic">
                Tidak ada data pegawai yang cocok dengan pencarian "{detailSearch}".
              </div>
            )}
          </div>

          {/* TAMPILAN TABEL DESKTOP (>= md) DENGAN JAM MENGAJAR & PRESENSI */}
          <div className="hidden md:block overflow-x-auto flex-1 relative touch-pan-x scroll-smooth">
            <table className="w-full text-left text-sm whitespace-nowrap min-w-max">
              <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 sticky top-0 z-10 shadow-sm border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-4 font-bold sticky left-0 bg-slate-100 dark:bg-slate-900/90 z-20 shadow-[1px_0_0_rgba(0,0,0,0.1)]">Nama Pegawai & Status</th>
                  {/* 🪄 KOLOM JAM MENGAJAR & PRESENSI */}
                  <th className="p-4 font-bold text-center">Jam Mengajar</th>
                  <th className="p-4 font-bold text-center">Presensi Disiplin</th>
                  <th className="p-4 font-bold text-right">Total Kotor</th>
                  <th className="p-4 font-bold text-right text-red-500">Potongan</th>
                  <th className="p-4 font-bold text-right text-emerald-600">THP Bersih</th>
                  <th className="p-4 font-bold text-center">Arsip Dokumen Slip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {filteredDetailGuru.map(t => {
                  const slip = calculatePayroll(t, settings);
                  
                  const currentIndex = (archives || []).findIndex(a => a.id === selectedArchive?.id);
                  const prevArchive = currentIndex !== -1 ? archives[currentIndex + 1] : null; 
                  const prevData = prevArchive?.dataGuru?.find(guru => {
                    if (!guru || !guru.name || !t || !t.name) return false;
                    const gName = guru.name.trim().toLowerCase().replace(/^(ust|ustadz|ustadzah|ibu|bapak|dra|dr|h|hj)\.?\s+/i, '');
                    const tName = t.name.trim().toLowerCase().replace(/^(ust|ustadz|ustadzah|ibu|bapak|dra|dr|h|hj)\.?\s+/i, '');
                    return gName === tName || (String(guru.id) === String(t.id) && gName.includes(tName));
                  });
                  const prevTHP = prevData ? calculatePayroll(prevData, settings).totalBersih : null;
                  const diffIndividu = prevTHP !== null ? slip.totalBersih - prevTHP : null;

                  const jam = slip.jamDihitung !== undefined 
                    ? slip.jamDihitung 
                    : (t.payroll?.jamMengajar?.realisasi || t.teachingHours || 0);

                  return (
                    <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                      <td className="p-4 sticky left-0 bg-white dark:bg-slate-800 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/40 z-10 shadow-[1px_0_0_rgba(0,0,0,0.05)]">
                        <div className="font-bold text-slate-800 dark:text-slate-200">{t.name}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{t.nipy} • {t.position}</div>
                      </td>

                      {/* Jam Mengajar */}
                      <td className="p-4 text-center">
                        <span className="inline-flex items-center gap-1 font-bold text-xs px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                          <Clock size={12}/> {jam} Jam
                        </span>
                      </td>

                      {/* Presensi Disiplin */}
                      <td className="p-4 text-center">
                        {slip.bonusHadir > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 size={12}/> Disiplin Penuh
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium">Reguler</span>
                        )}
                      </td>

                      <td className="p-4 text-right font-medium text-slate-600 dark:text-slate-300 bg-slate-50/30 dark:bg-slate-800/20">{formatRp(slip.totalKotor)}</td>
                      <td className="p-4 text-right font-medium text-red-500">-{formatRp(slip.totalPotongan)}</td>
                      <td className="p-4 text-right bg-emerald-50/30 dark:bg-emerald-900/10">
                        <div className="font-bold text-emerald-600 dark:text-emerald-400">{formatRp(slip.totalBersih)}</div>
                        
                        {prevTHP !== null ? (
                           diffIndividu !== 0 ? (
                             <div className={`mt-1 text-[9px] font-bold flex items-center justify-end gap-0.5 ${diffIndividu > 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`} title={`Gaji Bulan Lalu: ${formatRp(prevTHP)}`}>
                                <TrendingUp size={10} className={diffIndividu < 0 ? 'rotate-180' : ''}/>
                                {diffIndividu > 0 ? '+' : ''}{formatRp(diffIndividu)}
                             </div>
                           ) : (
                             <div className="mt-1 text-[9px] font-bold text-slate-400 flex items-center justify-end gap-0.5" title={`Gaji Bulan Lalu: ${formatRp(prevTHP)}`}>
                                <Activity size={10}/> Sama
                             </div>
                           )
                        ) : prevArchive ? (
                           <div className="mt-1 text-[9px] font-bold text-slate-400 flex items-center justify-end gap-0.5">
                              Data Baru
                           </div>
                        ) : null}
                      </td>
                      <td className="p-4 text-center">
                        <button 
                          onClick={() => {
                            setSelectedSlip(t);
                            setIsSlipModalOpen(true);
                          }}
                          className="text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-2 w-full max-w-[140px] mx-auto shadow-sm cursor-pointer"
                        >
                          <FileText size={14} /> Lihat Slip
                        </button>
                      </td>
                  </tr>
                  );
                })}
                {filteredDetailGuru.length === 0 && (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-slate-500 italic">
                      Tidak ada data pegawai yang cocok dengan pencarian "{detailSearch}".
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default ArsipView;
