import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Activity, AlertCircle, Archive, Bell, BellRing, Calendar,
  CheckCircle, Clock, Download, Edit, FileSpreadsheet, FileText,
  History, Lock, Printer, Search, Send, Trash2, TrendingUp, Wallet, X,
  Eye, EyeOff, Layers, TableProperties, Sparkles, Filter
} from 'lucide-react';

import SlipDocument from '../../components/SlipDocument';
import TableWrapper from '../../components/TableWrapper';
import {
  EDU_RATES, calculatePayroll, exportToPDF, formatRp,
  formatToInputDate, generateUniqueId, getFormattedPeriod,
  isTeacherActive, safeStorageGet, safeStorageSet, parsePeriodToDate
} from '../../utils/payrollUtils';
import { 
  exportPayrollToExcel, 
  exportMultiMonthPayrollMatrixToExcel 
} from '../../services/excelExportService';
import { pushCloudData as pushToSupabase } from '../../services/dbService';

export default function RekapGajiView({ teachers, setTeachers, onEditGaji, settings, setSettings, archives, setArchives, saveAuditLog, onOpenAuditLog }) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('Semua'); // TAMBAHAN: State Filter Status Guru
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [isArchiving, setIsArchiving] = useState(false);
  
  // TAMBAHAN: State Custom Modal & Notifikasi untuk mengatasi blokir alert browser
  const [isConfirmArchiveOpen, setIsConfirmArchiveOpen] = useState(false);
  const [isConfirmAjukanOpen, setIsConfirmAjukanOpen] = useState(false);
  const [isConfirmNotifMassalOpen, setIsConfirmNotifMassalOpen] = useState(false); // Modal Notif Massal
  const [isSendingNotif, setIsSendingNotif] = useState(false); // 🪄 TAMBAHAN: State Loading Notif
  const [isConfirmClearHistoryOpen, setIsConfirmClearHistoryOpen] = useState(false); // TAMBAHAN: Modal Bersihkan Riwayat
  const [notification, setNotification] = useState({ isOpen: false, type: '', message: '' });
  
  // 🪄 FITUR BARU: Custom Data Pengarsipan Dinamis
  const [archiveDate, setArchiveDate] = useState('');
  const [archivePeriod, setArchivePeriod] = useState('');

  // 🪄 FITUR BARU: State untuk Riwayat Gaji per Individu
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedTeacherHistory, setSelectedTeacherHistory] = useState(null);

  const [isMassPrinting, setIsMassPrinting] = useState(false);

  // 🪄 FITUR BARU: Sub-Tab Navigasi (Rekap Periode Berjalan vs Matriks Riwayat Lintas Bulan)
  const [activeSubTab, setActiveSubTab] = useState('rekap_berjalan'); // 'rekap_berjalan' | 'matriks_lintas_bulan'

  // 🪄 FITUR BARU: Mode Privasi & Sensor Angka Fleksibel (Global & Individual)
  const [isMaskedAll, setIsMaskedAll] = useState(() => safeStorageGet('payedu_salary_privacy_masked', false));
  const [individualMaskOverrides, setIndividualMaskOverrides] = useState({});

  // 🪄 FITUR BARU: Pilihan Metrik untuk Matriks Lintas Bulan
  const [matrixMetric, setMatrixMetric] = useState('totalBersih'); // 'totalBersih' | 'totalKotor' | 'totalPotongan'

  // Helper Cerdas: Deteksi status sensor per guru
  const isTeacherMasked = (teacherId) => {
    if (individualMaskOverrides[teacherId] !== undefined) {
      return individualMaskOverrides[teacherId];
    }
    return isMaskedAll;
  };

  const toggleTeacherMask = (teacherId) => {
    setIndividualMaskOverrides(prev => ({
      ...prev,
      [teacherId]: !isTeacherMasked(teacherId)
    }));
  };

  const toggleMaskAll = () => {
    const next = !isMaskedAll;
    setIsMaskedAll(next);
    setIndividualMaskOverrides({});
    safeStorageSet('payedu_salary_privacy_masked', next);
  };

  const renderNominal = (amount, teacherId, customClass = "") => {
    if (amount === null || amount === undefined || isNaN(amount)) return <span className="text-slate-400">-</span>;
    if (isTeacherMasked(teacherId)) {
      return (
        <span className={`inline-flex items-center gap-1 font-mono tracking-wider text-slate-400 dark:text-slate-500 select-none ${customClass}`} title="Nominal disensor demi privasi">
          Rp •••••••
        </span>
      );
    }
    return <span className={customClass}>{formatRp(amount)}</span>;
  };

  const renderTotalNominal = (amount, customClass = "") => {
    if (amount === null || amount === undefined || isNaN(amount)) return <span className="text-slate-400">-</span>;
    if (isMaskedAll) {
      return (
        <span className={`inline-flex items-center gap-1 font-mono tracking-wider text-slate-400 dark:text-slate-500 select-none ${customClass}`} title="Nominal disensor demi privasi">
          Rp •••••••••
        </span>
      );
    }
    return <span className={customClass}>{formatRp(amount)}</span>;
  };



  const bulan = getFormattedPeriod(settings?.payrollPeriod);
  
  // 🪄 TAMBALAN CERDAS: Ambil arsip bulan lalu untuk perbandingan
  const prevArchive = archives && archives.length > 0 ? archives[0] : null;
  const prevTotalTHP = prevArchive ? prevArchive.totalGaji : 0;

  // 🪄 PERBAIKAN: Menampilkan Pegawai Aktif secara default (Non-Aktif / Resign disembunyikan kecuali dipilih)
  const filtered = useMemo(() => {
    return teachers.filter(t => {
      const isAct = isTeacherActive(t);
      const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) || t.nipy.includes(search);
      
      let matchStatus = true;
      if (filterStatus === 'Semua') {
        matchStatus = isAct; // Default hanya pegawai aktif
      } else if (filterStatus === 'Semua (Termasuk Non-Aktif)') {
        matchStatus = true;
      } else if (filterStatus === 'Non-Aktif') {
        matchStatus = !isAct;
      } else {
        matchStatus = (t.status === filterStatus) && isAct;
      }

      return matchSearch && matchStatus;
    });
  }, [teachers, search, filterStatus]);

  // 🪄 KOMPUTASI CERDAS: Matriks Riwayat Multi-Bulan (Tanpa Request Cloud Baru, 0 Byte Egress)
  const matrixData = useMemo(() => {
    const cols = [];
    const seenPeriods = new Set();

    // A. Arsip-arsip terdahulu (Urutkan dari yang terlama ke yang terbaru)
    const sortedArchives = [...(archives || [])].sort((a, b) => {
      const dateA = parsePeriodToDate(a.periode || a.period);
      const dateB = parsePeriodToDate(b.periode || b.period);
      return dateA - dateB;
    });

    sortedArchives.forEach(arc => {
      const p = arc.periode || arc.period || '';
      const pLabel = getFormattedPeriod(p);
      if (p && !seenPeriods.has(pLabel)) {
        seenPeriods.add(pLabel);
        cols.push({
          key: `arc_${arc.id || pLabel}`,
          rawPeriod: p,
          label: pLabel,
          isCurrent: false,
          dataGuru: arc.dataGuru || arc.teachers || []
        });
      }
    });

    // B. Bulan Berjalan (Periode Aktif Operasional)
    const currentPeriodLabel = bulan;
    if (!seenPeriods.has(currentPeriodLabel)) {
      cols.push({
        key: 'current_active',
        rawPeriod: settings?.payrollPeriod || '',
        label: `${currentPeriodLabel} (Aktif)`,
        isCurrent: true,
        dataGuru: teachers
      });
    }

    // C. Susun baris per guru yang telah difilter pencarian & status
    const rows = filtered.map(t => {
      const tName = (t.name || '').trim().toLowerCase().replace(/^(ust|ustadz|ustadzah|ibu|bapak|dra|dr|h|hj)\.?\s+/i, '');
      const values = {};
      let rowTotal = 0;
      let activeMonthsCount = 0;

      cols.forEach(col => {
        let teacherData = null;
        if (col.isCurrent) {
          teacherData = t;
        } else {
          teacherData = (col.dataGuru || []).find(g => {
            if (!g) return false;
            if (String(g.id) === String(t.id)) return true;
            const gName = (g.name || '').trim().toLowerCase().replace(/^(ust|ustadz|ustadzah|ibu|bapak|dra|dr|h|hj)\.?\s+/i, '');
            return gName === tName;
          });
        }

        if (teacherData) {
          const calc = calculatePayroll(teacherData, settings);
          const val = matrixMetric === 'totalKotor' 
            ? calc.totalKotor 
            : matrixMetric === 'totalPotongan' 
              ? calc.totalPotongan 
              : calc.totalBersih;
          
          values[col.key] = val;
          rowTotal += val;
          activeMonthsCount++;
        } else {
          values[col.key] = null;
        }
      });

      const avg = activeMonthsCount > 0 ? Math.round(rowTotal / activeMonthsCount) : 0;

      return {
        teacher: t,
        values,
        total: rowTotal,
        avg,
        activeMonthsCount
      };
    });

    // D. Hitung Total Pengeluaran Sekolah per Kolom Bulan
    const columnTotals = {};
    cols.forEach(col => {
      columnTotals[col.key] = rows.reduce((sum, r) => sum + (r.values[col.key] || 0), 0);
    });
    const grandTotalSum = rows.reduce((sum, r) => sum + r.total, 0);
    const grandAverage = cols.length > 0 ? Math.round(grandTotalSum / cols.length) : 0;

    return {
      columns: cols,
      rows,
      columnTotals,
      grandTotalSum,
      grandAverage
    };
  }, [archives, teachers, filtered, settings, bulan, matrixMetric]);

  const handleExportMatrixExcel = () => {
    try {
      exportMultiMonthPayrollMatrixToExcel({
        columns: matrixData.columns,
        matrixRows: matrixData.rows,
        metricType: matrixMetric,
        settings,
        filename: `Matriks_Riwayat_Gaji_${getFormattedPeriod(settings?.payrollPeriod).replace(/\s+/g, '_')}.xlsx`
      });
      setNotification({
        isOpen: true,
        type: 'success',
        message: 'Matriks riwayat gaji multi-bulan berhasil diekspor ke Excel (.xlsx).'
      });
    } catch (e) {
      console.error("Gagal ekspor matriks:", e);
      setNotification({
        isOpen: true,
        type: 'error',
        message: 'Gagal mengekspor matriks ke Excel. Silakan periksa data Anda.'
      });
    }
  };

  // 🪄 FITUR BARU: Fungsi untuk mengedit nilai kolom secara manual langsung dari tabel Rekap Gaji
  const handleInlineOverride = (teacherId, field, value) => {
    // Lacak data asli sebelum diubah
    const targetTeacher = teachers.find(t => t.id === teacherId);
    if (targetTeacher) {
       const p = targetTeacher.payroll || {};
       let oldVal = 0; let fieldLabel = field;
       
       if (field === 'pendidikanOverride') {
          oldVal = p.pendidikan?.nominalOverride !== undefined ? p.pendidikan.nominalOverride : ((settings?.masterRates?.EDU_RATES || EDU_RATES)[targetTeacher.education] || 0);
          fieldLabel = 'Tunjangan Pendidikan';
       } else {
          oldVal = p[field] || 0;
          const labelMap = {
             tunjanganMasaKerjaManual: 'Tunjangan Masa Kerja', overrideJabatan: 'Tunjangan Jabatan',
             overrideKompetensi: 'Tunjangan Kompetensi', overrideKeluarga: 'Tunjangan Keluarga',
             overrideTambahan: 'Insentif Khusus', overrideBonusHadir: 'Bonus Hadir',
             overrideMengajar: 'Jam Lebih (Mengajar)', overridePotongan: 'Potongan Manual'
          };
          fieldLabel = labelMap[field] || field;
       }
       saveAuditLog(targetTeacher, fieldLabel, oldVal, value);
    }

    setTeachers(prev => prev.map(t => {
      if (t.id === teacherId) {
        if (field === 'pendidikanOverride') {
          return {
            ...t,
            payroll: {
              ...(t.payroll || {}),
              pendidikan: {
                ...(t.payroll?.pendidikan || {}),
                nominalOverride: value === '' ? '' : Number(value)
              }
            }
          };
        }
        return {
          ...t,
          payroll: {
            ...(t.payroll || {}),
            [field]: value === '' ? '' : Number(value)
          }
        };
      }
      return t;
    }));
  };

  const handleKirimNotif = async (id) => {
    if(settings?.payrollStatus !== 'Approved') {
       setNotification({ isOpen: true, type: 'error', message: 'Akses Ditolak: Gaji belum disetujui (Approved) oleh Kepala Sekolah.' });
       return;
    }
    const updatedTeachers = teachers.map(t => 
      t.id === id ? { ...t, payroll: { ...t.payroll, isNotified: true, isConfirmed: false } } : t
    );
    
    setTeachers(updatedTeachers);

    try {
        // 🪄 TAMBALAN CERDAS: Push Langsung ke Cloud Saat Itu Juga
        safeStorageSet('payedu_teachers', updatedTeachers);
        await pushToSupabase('SAVE_TEACHERS', updatedTeachers);
        setNotification({ isOpen: true, type: 'success', message: 'Notifikasi transfer gaji berhasil dikirim ke portal guru.' });
    } catch (e) {
        console.error(e);
        setNotification({ isOpen: true, type: 'error', message: 'Gagal sinkronisasi ke Cloud. Pastikan koneksi Anda stabil.' });
    }
  };

  // TAMBAHAN: Fungsi Pengiriman Notifikasi Massal
  const handleKirimNotifMassal = () => {
    if(settings?.payrollStatus !== 'Approved') {
       setNotification({ isOpen: true, type: 'error', message: 'Akses Ditolak: Gaji belum disetujui (Approved) oleh Kepala Sekolah.' });
       return;
    }
    setIsConfirmNotifMassalOpen(true);
  };

  const executeKirimNotifMassal = async () => {
    setIsSendingNotif(true);

    const updatedTeachers = teachers.map(t => {
      // Hanya kirim notif jika status guru belum mengonfirmasi penerimaan
      if (!t.payroll?.isConfirmed) {
        return { ...t, payroll: { ...t.payroll, isNotified: true, isConfirmed: false } };
      }
      return t;
    });
    
    setTeachers(updatedTeachers);

    try {
        // 🪄 TAMBALAN CERDAS: Push Langsung ke Cloud Saat Itu Juga secara Massal
        safeStorageSet('payedu_teachers', updatedTeachers);
        await pushToSupabase('SAVE_TEACHERS', updatedTeachers);
        
        setIsConfirmNotifMassalOpen(false);
        setNotification({ isOpen: true, type: 'success', message: 'Luar Biasa! Notifikasi berhasil dikirim secara massal ke portal seluruh guru dan disinkronkan ke server.' });
    } catch (e) {
        console.error(e);
        setIsConfirmNotifMassalOpen(false);
        setNotification({ isOpen: true, type: 'error', message: 'Gagal sinkronisasi ke Cloud. Pastikan koneksi Anda stabil.' });
    } finally {
        setIsSendingNotif(false);
    }
  };

  // PERBAIKAN: Mengganti window.confirm dengan modal custom
  const handleAjukanApproval = () => {
     setIsConfirmAjukanOpen(true);
  };

  const executeAjukanApproval = async () => {
     setIsConfirmAjukanOpen(false);
     
     // PERBAIKAN: Paksa simpan langsung ke Local Storage dan Server agar permanen tanpa jeda (bypass debounce)
     const newSettings = { ...settings, payrollStatus: 'Pending', lastModified: Date.now() };
     setSettings(newSettings);
     safeStorageSet('payedu_settings', newSettings);
     
     try {
         await pushToSupabase('SAVE_SETTINGS', newSettings);
         setNotification({ isOpen: true, type: 'success', message: 'Draft Gaji berhasil diajukan! Status telah dikunci ke server.' });
     } catch (e) {
         console.error("Gagal simpan ajuan ke server:", e);
         setNotification({ isOpen: true, type: 'error', message: 'Gagal sinkronisasi ke server. Pastikan koneksi internet stabil.' });
     }
  };

  const handleArchive = () => {
    // 🪄 Inisialisasi default tanggal dan periode dengan waktu saat ini
    setArchiveDate(new Date().toISOString().split('T')[0]);
    setArchivePeriod(settings?.payrollPeriod || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
    // Membuka modal khusus
    setIsConfirmArchiveOpen(true);
  };

  const executeArchive = async () => {
    setIsConfirmArchiveOpen(false);
    setIsArchiving(true);
    
    // 🪄 Konversi Input Custom ke String yang Terbaca
    const customBulan = getFormattedPeriod(archivePeriod);
    const customTanggal = new Date(archiveDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    try {
      // 🪄 TAMBALAN CERDAS: Susun Data Arsip Terlebih Dahulu (Hanya Pegawai Aktif)
      const activeTeachersForArchive = teachers.filter(isTeacherActive);
      const totalBersihBulanIni = activeTeachersForArchive.reduce((sum, t) => sum + calculatePayroll(t, settings).totalBersih, 0);

      // 🪄 OPTIMASI MEMORI SUPER KETAT: Memangkas data sensitif & menyaring pegawai aktif
      const optimizedTeachers = activeTeachersForArchive.map(t => {
        return {
          id: t.id,
          name: t.name,
          nipy: t.nipy,
          gender: t.gender,
          education: t.education,
          status: t.status,
          position: t.position,
          tmt: t.tmt,
          family: t.family,
          payroll: {
             tahunMasaKerja: t.payroll?.tahunMasaKerja,
             tunjanganMasaKerjaManual: t.payroll?.tunjanganMasaKerjaManual,
             jabatans: t.payroll?.jabatans,
             pendidikan: t.payroll?.pendidikan,
             kompetensi: t.payroll?.kompetensi,
             keluarga: t.payroll?.keluarga,
             disiplin: { telat: t.payroll?.disiplin?.telat, tarifHadir: t.payroll?.disiplin?.tarifHadir, tarifTelat: t.payroll?.disiplin?.tarifTelat },
             insentifTambahan: t.payroll?.insentifTambahan,
             potonganLainnya: t.payroll?.potonganLainnya,
             kegiatanInsidental: t.payroll?.kegiatanInsidental,
             jamMengajar: {
                wajib: t.payroll?.jamMengajar?.wajib,
                realisasi: t.payroll?.jamMengajar?.realisasi,
                tarifJPL: t.payroll?.jamMengajar?.tarifJPL,
                jsjm: t.payroll?.jamMengajar?.jsjm,
                jamPlus: t.payroll?.jamMengajar?.jamPlus
             }
          }
        };
      });

      const newArchive = {
        id: generateUniqueId('arc-'),
        periode: customBulan, // Pakai bulan custom
        dateArchived: customTanggal, // Pakai tanggal custom
        totalGaji: totalBersihBulanIni,
        dataGuru: optimizedTeachers
      };

      // Tentukan array arsip final untuk Cloud Database Supabase
      const updatedArchivesArray = [newArchive, ...(archives || [])].slice(0, 12);

      // 🪄 TAMBALAN CERDAS: Menggunakan endpoint "SAVE_ARCHIVES" secara utuh, bukan "ARCHIVE_PAYROLL" yang sudah usang
      const result = await pushToSupabase('SAVE_ARCHIVES', updatedArchivesArray);
      
      if (result.status === 'success') {
        // --- TERAPKAN KE STATE LOKAL SECARA PERMANEN ---
        if (setArchives) setArchives(updatedArchivesArray);
        safeStorageSet('payedu_archives', updatedArchivesArray);

        // 🪄 Reset Absensi dan Sisa Hutang untuk Bulan Baru
        setTeachers(prev => prev.map(t => {
           // 1. Logika Pemotongan Sisa Hutang Kasbon
           let updatedPotongan = t.payroll?.potonganLainnya || [];
           if (updatedPotongan.length > 0) {
              updatedPotongan = updatedPotongan.map(pot => {
                 if ((pot.ket.toLowerCase().includes('kasbon') || pot.ket.toLowerCase().includes('koperasi') || pot.ket.toLowerCase().includes('pinjaman'))) {
                    const currentSisa = pot.sisaHutang !== undefined ? pot.sisaHutang : (pot.nominal * 4);
                    const newSisa = Math.max(0, currentSisa - pot.nominal);
                    return { ...pot, sisaHutang: newSisa };
                 }
                 return pot;
              });
           }

           // 2. Reset Absensi, Jam Tambahan, dan Notifikasi
           return {
              ...t,
              payroll: {
                 ...(t.payroll || {}),
                 isNotified: false,
                 isConfirmed: false,
                 jamMengajar: {
                    ...(t.payroll?.jamMengajar || {}),
                    harian: Array(31).fill(''),
                    realisasi: 0,
                    jamPlus: 0
                 },
                 disiplin: {
                    ...(t.payroll?.disiplin || {}),
                    telat: 0,
                    hadir: 0
                 },
                 potonganLainnya: updatedPotongan
              }
           };
        }));
        
        // 🪄 Auto-Shift periode ke bulan berikutnya berdasarkan input Admin
        const [y, m] = archivePeriod.split('-');
        const nextD = new Date(y, m, 1);
        const nextPeriod = `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, '0')}`;
        
        // PERBAIKAN: Paksa simpan perubahan periode dan status kembali ke Draft secara permanen
        const newSettings = { ...settings, payrollStatus: 'Draft', payrollPeriod: nextPeriod, lastModified: Date.now() };
        setSettings(newSettings);
        safeStorageSet('payedu_settings', newSettings);
        pushToSupabase('SAVE_SETTINGS', newSettings).catch(e => console.warn("Sinkronisasi tertunda:", e));
        
        setNotification({ isOpen: true, type: 'success', message: 'Tutup buku berhasil! Data telah diarsipkan secara permanen.' });
      } else {
        throw new Error("Respon server gagal");
      }
    } catch (err) {
      setNotification({ isOpen: true, type: 'error', message: 'Terjadi kesalahan saat memproses arsip. Pastikan koneksi internet stabil.' });
    } finally {
      setIsArchiving(false);
    }
  };

  // TAMBAHAN: Ekspor Tabel Rekap ke CSV sebagai alternatif Print yang tangguh
  // 📊 FITUR BARU: Ekspor Rekap Gaji Lengkap ke Excel (.xlsx) Murni
  const handleExportExcelPure = () => {
    try {
      exportPayrollToExcel({
        teachers: filtered,
        settings,
        periode: settings?.payrollPeriod
      });
    } catch (err) {
      console.error("Gagal ekspor Excel:", err);
      alert("Gagal mengekspor file Excel: " + (err.message || "Error tidak diketahui"));
    }
  };

  const handleExportCSV = () => {
    const headers = ['Nama Pegawai', 'NIPY', 'Status', 'Jabatan', 'T. Masa Kerja', 'T. Jabatan', 'T. Pendidikan', 'T. Kompetensi', 'T. Keluarga', 'Insentif Tamb.', 'Bonus Hadir', 'Kelebihan Jam', 'Total Kotor', 'Potongan', 'THP Bersih', 'Bulan Sebelumnya', 'Selisih'];
    const csvRows = [headers.join(';')];

    let gtMasaKerja = 0, gtJabatan = 0, gtPendidikan = 0, gtKompetensi = 0,
        gtKeluarga = 0, gtTambahan = 0, gtBonusHadir = 0, gtMengajar = 0,
        gtTotalKotor = 0, gtPotong = 0, gtTHP = 0;

    filtered.forEach(t => {
      const slip = calculatePayroll(t, settings);
      
      // 🪄 TAMBALAN CERDAS: Kalkulasi data CSV bulan lalu per individu berdasarkan kecocokan Nama / ID+Nama
      const prevData = prevArchive?.dataGuru?.find(guru => {
        if (!guru || !guru.name || !t || !t.name) return false;
        const gName = guru.name.trim().toLowerCase().replace(/^(ust|ustadz|ustadzah|ibu|bapak|dra|dr|h|hj)\.?\s+/i, '');
        const tName = t.name.trim().toLowerCase().replace(/^(ust|ustadz|ustadzah|ibu|bapak|dra|dr|h|hj)\.?\s+/i, '');
        
        const sameName = gName === tName;
        const sameIdAndName = String(guru.id) === String(t.id) && (gName.includes(tName) || tName.includes(gName));
        
        return sameName || sameIdAndName;
      });

      const prevTHP = prevData ? calculatePayroll(prevData, settings).totalBersih : null;
      const diffIndividu = prevTHP !== null ? slip.totalBersih - prevTHP : null;

      // Akumulasi Total
      gtMasaKerja += slip.tMasaKerja;
      gtJabatan += slip.tJabatan;
      gtPendidikan += slip.tPendidikan;
      gtKompetensi += slip.tKompetensi;
      gtKeluarga += slip.tKeluarga;
      gtTambahan += slip.tTambahan;
      gtBonusHadir += slip.bonusHadir;
      gtMengajar += slip.tMengajar;
      gtTotalKotor += slip.totalKotor;
      gtPotong += slip.totalPotongan;
      gtTHP += slip.totalBersih;

      const row = [
        `"${t.name}"`, 
        `"=""${t.nipy}"""`, // Force string di Excel agar angka 0 di depan tidak hilang
        `"${t.status}"`,
        `"${t.position}"`,
        `"${formatRp(slip.tMasaKerja)}"`, 
        `"${formatRp(slip.tJabatan)}"`, 
        `"${formatRp(slip.tPendidikan)}"`, 
        `"${formatRp(slip.tKompetensi)}"`, 
        `"${formatRp(slip.tKeluarga)}"`, 
        `"${formatRp(slip.tTambahan)}"`, 
        `"${formatRp(slip.bonusHadir)}"`, 
        `"${formatRp(slip.tMengajar)}"`, 
        `"${formatRp(slip.totalKotor)}"`, 
        `"${formatRp(slip.totalPotongan)}"`, 
        `"${formatRp(slip.totalBersih)}"`,
        `"${prevTHP !== null ? formatRp(prevTHP) : '-'}"`,
        `"${diffIndividu !== null ? formatRp(diffIndividu) : '-'}"`
      ];
      csvRows.push(row.join(';'));
    });

    // Tambahkan baris kosong sebagai pemisah
    csvRows.push(Array(17).fill('""').join(';'));

    // Baris TOTAL KESELURUHAN
    const diffTHPTotal = prevArchive ? gtTHP - prevTotalTHP : 0;
    const totalRow = [
      `"TOTAL KESELURUHAN"`, `""`, `""`, `""`,
      `"${formatRp(gtMasaKerja)}"`,
      `"${formatRp(gtJabatan)}"`,
      `"${formatRp(gtPendidikan)}"`,
      `"${formatRp(gtKompetensi)}"`,
      `"${formatRp(gtKeluarga)}"`,
      `"${formatRp(gtTambahan)}"`,
      `"${formatRp(gtBonusHadir)}"`,
      `"${formatRp(gtMengajar)}"`,
      `"${formatRp(gtTotalKotor)}"`,
      `"${formatRp(gtPotong)}"`,
      `"${formatRp(gtTHP)}"`,
      `"${prevArchive ? formatRp(prevTotalTHP) : '-'}"`,
      `"${prevArchive ? formatRp(diffTHPTotal) : '-'}"`
    ];
    csvRows.push(totalRow.join(';'));

    // Tambahan BOM (Byte Order Mark) agar Excel otomatis membaca sebagai UTF-8
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Payroll_Bank_Rekap_Gaji_${bulan}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // FITUR BARU 3: Fungsi Eksekusi Cetak Massal (Bulk Print)
  const handleMassPrint = () => {
    setIsMassPrinting(true);
    // Memberikan waktu React untuk me-render DOM slip massal secara penuh (tersembunyi)
    setTimeout(() => {
      window.print();
      // Menghilangkan kontainer cetak setelah menu print browser ditutup
      setIsMassPrinting(false);
    }, 1000); 
  };

  const executeClearHistory = () => {
     const current = settings || {};
     const newState = { ...current, auditLogs: [], lastModified: Date.now() };
     setSettings(newState);
     safeStorageSet('payedu_settings', newState);
     pushToSupabase('SAVE_SETTINGS', newState).catch(e => console.error("Gagal hapus log:", e));
     setIsConfirmClearHistoryOpen(false);
     setNotification({ isOpen: true, type: 'success', message: 'Seluruh riwayat perbaikan berhasil dibersihkan secara permanen.' });
  };

  // 🪄 FUNGSI BARU: Mengambil Data Riwayat Individu dari Arsip dengan Perisai Data
  const getIndividualHistory = (teacherId) => {
    if (!archives || !Array.isArray(archives)) return [];
    
    const targetTeacher = teachers.find(t => t.id === teacherId);
    const teacherTmtMonth = targetTeacher?.tmt ? formatToInputDate(targetTeacher.tmt).substring(0, 7) : '';

    const history = [];
    const reversedArchives = [...archives].reverse();
    
    for (let i = 0; i < reversedArchives.length; i++) {
        const arc = reversedArchives[i];
        const arcPeriod = (arc?.periode || arc?.period || '').substring(0, 7);

        // Filter out archives before teacher's TMT
        if (teacherTmtMonth && arcPeriod && arcPeriod < teacherTmtMonth) {
            continue;
        }

        const historicalData = (arc?.dataGuru || []).find(t => 
          String(t.id) === String(teacherId) && 
          (!t.name || !targetTeacher?.name || t.name.trim().toLowerCase() === targetTeacher.name.trim().toLowerCase())
        );

        if (historicalData) {
            const calc = calculatePayroll(historicalData, settings);
            history.push({
                periode: (arc?.periode || '').substring(0, 8), // Singkat untuk sumbu X grafik
                periodeFull: arc?.periode || arc?.period || '',
                totalBersih: calc.totalBersih,
                totalKotor: calc.totalKotor,
                totalPotongan: calc.totalPotongan
            });
        }
    }
    return history;
  };

  let gtMasaKerja = 0, gtJabatan = 0, gtPendidikan = 0, gtKompetensi = 0,
      gtKeluarga = 0, gtTambahan = 0, gtBonusHadir = 0, gtMengajar = 0,
      gtTotalKotor = 0, gtPotong = 0, gtTHP = 0;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full relative">
      
      {/* TAMBAHAN: Modal Konfirmasi Notif Massal */}
      {/* MODAL KONFIRMASI AJUKAN APPROVAL */}
      {isConfirmAjukanOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center mx-auto mb-4 shadow-inner">
                <Send size={40} />
              </div>
              <h3 className="text-xl font-bold dark:text-white mb-2">Ajukan Approval Gaji?</h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto text-sm">
                Apakah Anda yakin ingin mengajukan rekapitulasi gaji periode <strong className="text-slate-700 dark:text-slate-200">{bulan}</strong> kepada Kepala Sekolah untuk mendapat persetujuan? Status akan dikunci menjadi <strong className="text-amber-600">Pending</strong>.
              </p>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-center gap-3 shrink-0">
              <button onClick={() => setIsConfirmAjukanOpen(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors w-full">Batal</button>
              <button onClick={executeAjukanApproval} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-sm transition-colors w-full flex justify-center items-center gap-2">
                <Send size={16} /> Ya, Ajukan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI TUTUP BUKU & ARSIPKAN (DIPERBARUI FLEKSIBEL) */}
      {isConfirmArchiveOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center mx-auto mb-4 shadow-inner">
                <Archive size={40} />
              </div>
              <h3 className="text-xl font-bold dark:text-white mb-2">Tutup Buku & Arsipkan?</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-5">
                Silakan sesuaikan periode dan tanggal pengarsipan di bawah ini jika diperlukan, lalu lanjutkan untuk menyimpan data.
              </p>

              <div className="space-y-4 text-left">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Periode Buku Gaji</label>
                  <input 
                    type="month" 
                    value={archivePeriod}
                    onChange={e => setArchivePeriod(e.target.value)}
                    className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-amber-500 outline-none dark:text-white font-bold transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Tanggal Pengesahan / Cetak Slip</label>
                  <input 
                    type="date" 
                    value={archiveDate}
                    onChange={e => setArchiveDate(e.target.value)}
                    className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-amber-500 outline-none dark:text-white font-bold transition-all"
                  />
                </div>
              </div>

              <p className="text-amber-600 dark:text-amber-400 text-xs mt-5 font-semibold bg-amber-50 dark:bg-amber-900/20 p-2.5 rounded-lg border border-amber-100 dark:border-amber-800">
                PENTING: Periode penggajian otomatis akan bergeser ke bulan berikutnya dan status kembali ke Draft setelah diarsipkan.
              </p>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-center gap-3 shrink-0">
              <button onClick={() => setIsConfirmArchiveOpen(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors w-full">Batal</button>
              <button onClick={executeArchive} disabled={isArchiving || !archivePeriod || !archiveDate} className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold shadow-sm transition-colors w-full flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                {isArchiving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Archive size={16} />}
                {isArchiving ? 'Memproses...' : 'Ya, Arsipkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isConfirmNotifMassalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-inner">
                <BellRing size={40} />
              </div>
              <h3 className="text-xl font-bold dark:text-white mb-2">Kirim Notifikasi Massal?</h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto text-sm">
                Sistem akan mengirimkan pesan notifikasi penerimaan gaji ke portal <strong className="text-slate-700 dark:text-slate-200">SELURUH</strong> pegawai yang belum melakukan konfirmasi pada periode ini.
              </p>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-center gap-3 shrink-0">
              <button onClick={() => setIsConfirmNotifMassalOpen(false)} disabled={isSendingNotif} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors w-full disabled:opacity-70">Batal</button>
              <button onClick={executeKirimNotifMassal} disabled={isSendingNotif} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-sm transition-colors w-full flex justify-center items-center gap-2 disabled:opacity-70">
                {isSendingNotif ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <BellRing size={16} />}
                {isSendingNotif ? 'Mengirim...' : 'Ya, Kirim Semua'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAMBAHAN: Modal Konfirmasi Bersihkan Riwayat */}
      {isConfirmClearHistoryOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center mx-auto mb-4">
                <Trash2 size={40} />
              </div>
              <h3 className="text-xl font-bold dark:text-white mb-2">Bersihkan Riwayat Edit?</h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto text-sm">
                Apakah Anda yakin ingin menghapus seluruh rekaman jejak perbaikan ini secara permanen dari server? Data yang dihapus tidak dapat dikembalikan.
              </p>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-center gap-3 shrink-0">
              <button onClick={() => setIsConfirmClearHistoryOpen(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors w-full">Batal</button>
              <button onClick={executeClearHistory} className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-sm transition-colors w-full flex justify-center items-center gap-2">
                <Trash2 size={16} /> Ya, Bersihkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🪄 MODAL BARU: RIWAYAT GAJI PER INDIVIDU (DESAIN ELEGAN TANPA GRAFIK) */}
      {isHistoryModalOpen && selectedTeacherHistory && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-5 md:p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-900 shrink-0">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <History size={20} />
                 </div>
                 <div>
                    <h3 className="font-extrabold text-lg md:text-xl dark:text-white leading-tight">
                      Riwayat Penggajian
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">{selectedTeacherHistory.name} • {selectedTeacherHistory.nipy}</p>
                 </div>
              </div>
              <button onClick={() => setIsHistoryModalOpen(false)} className="p-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
            </div>
            
            <div className="overflow-y-auto p-5 md:p-8 flex-1 bg-slate-50/50 dark:bg-slate-900/20">
               {(() => {
                  const historyData = getIndividualHistory(selectedTeacherHistory.id);
                  if (historyData.length === 0) {
                     return (
                        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 border-dashed">
                           <History size={56} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
                           <p className="text-slate-500 font-medium text-lg">Belum ada data riwayat untuk pegawai ini.</p>
                           <p className="text-slate-400 text-sm mt-1">Data akan muncul setelah Anda melakukan Tutup Buku di akhir bulan.</p>
                        </div>
                     );
                  }

                  const totalArsip = historyData.length;
                  const avgTHP = historyData.reduce((acc, curr) => acc + curr.totalBersih, 0) / totalArsip;
                  const latestRecord = historyData[historyData.length - 1];
                  const latestTHPValue = latestRecord?.totalBersih || 0;

                  return (
                     <div className="space-y-8">
                        {/* STATISTIK RINGKASAN EKSKLUSIF */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                           <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:border-blue-300 transition-colors">
                              <span className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-1 relative z-10">Total Arsip</span>
                              <div className="flex items-baseline gap-1 relative z-10">
                                <span className="text-3xl font-black text-slate-800 dark:text-slate-100">{totalArsip}</span>
                                <span className="text-sm font-bold text-slate-500">Bulan</span>
                              </div>
                              <Archive className="absolute -right-4 -bottom-4 text-slate-50 dark:text-slate-700/30 transform -rotate-12 group-hover:scale-110 transition-transform" size={90}/>
                           </div>
                           <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:border-indigo-300 transition-colors">
                              <span className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-1 relative z-10">Rata-Rata THP</span>
                              <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400 relative z-10">{formatRp(avgTHP)}</span>
                              <Activity className="absolute -right-4 -bottom-4 text-indigo-50 dark:text-indigo-900/10 transform -rotate-12 group-hover:scale-110 transition-transform" size={90}/>
                           </div>
                           <div className="bg-emerald-50 dark:bg-emerald-900/20 p-6 rounded-2xl border border-emerald-200 dark:border-emerald-800/50 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:border-emerald-400 transition-colors">
                              <span className="text-xs font-extrabold text-emerald-600/80 dark:text-emerald-500 uppercase tracking-widest mb-1 relative z-10">THP Terakhir</span>
                              <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400 relative z-10">{formatRp(latestTHPValue)}</span>
                              <Wallet className="absolute -right-4 -bottom-4 text-emerald-100/50 dark:text-emerald-900/30 transform -rotate-12 group-hover:scale-110 transition-transform" size={90}/>
                           </div>
                        </div>

                        {/* TABEL RINCIAN EKSKLUSIF */}
                        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                           <div className="p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between">
                              <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 text-sm">
                                <FileText size={16} className="text-indigo-500"/> Rincian Komparasi Gaji Bulanan
                              </h4>
                           </div>
                           <div className="overflow-x-auto">
                              <table className="w-full text-left text-sm whitespace-nowrap">
                                 <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                    <tr>
                                       <th className="p-4 font-extrabold uppercase tracking-wider text-[11px] pl-6">Periode Buku Gaji</th>
                                       <th className="p-4 font-extrabold uppercase tracking-wider text-[11px] text-right">Total Kotor</th>
                                       <th className="p-4 font-extrabold uppercase tracking-wider text-[11px] text-right text-red-400">Total Potongan</th>
                                       <th className="p-4 font-extrabold uppercase tracking-wider text-[11px] text-right text-emerald-600">Gaji Bersih (THP)</th>
                                       <th className="p-4 font-extrabold uppercase tracking-wider text-[11px] text-right pr-6">Selisih & Tren</th>
                                    </tr>
                                 </thead>
                                 <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                    {/* Reverse kembali array hanya untuk dirender di tabel agar bulan terbaru di atas */}
                                    {[...historyData].reverse().map((item, idx, arr) => {
                                       const prevItem = arr[idx + 1]; 
                                       const diff = prevItem ? item.totalBersih - prevItem.totalBersih : null;

                                       return (
                                          <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors group">
                                             <td className="p-4 pl-6">
                                               <div className="flex items-center gap-3">
                                                 <div className="w-8 h-8 flex items-center justify-center bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg group-hover:scale-110 group-hover:bg-indigo-100 transition-all">
                                                   <Calendar size={16} />
                                                 </div>
                                                 <span className="font-extrabold text-slate-700 dark:text-slate-200">{item.periodeFull}</span>
                                               </div>
                                             </td>
                                             <td className="p-4 text-right font-semibold text-slate-600 dark:text-slate-400">{formatRp(item.totalKotor)}</td>
                                             <td className="p-4 text-right font-semibold text-red-500">-{formatRp(item.totalPotongan)}</td>
                                             <td className="p-4 text-right">
                                               <span className="font-black text-[13px] tracking-tight text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-lg border border-emerald-100 dark:border-emerald-800/50">
                                                 {formatRp(item.totalBersih)}
                                               </span>
                                             </td>
                                             <td className="p-4 text-right pr-6">
                                                {diff !== null ? (
                                                   <div className={`flex items-center justify-end gap-1.5 font-bold text-xs ${diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : diff < 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                                                      {diff !== 0 && <TrendingUp size={16} className={diff < 0 ? 'rotate-180' : ''}/>}
                                                      {diff > 0 ? '+' : ''}{diff === 0 ? 'Sama Persis' : formatRp(diff)}
                                                   </div>
                                                ) : (
                                                   <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 inline-block">Data Awal</span>
                                                )}
                                             </td>
                                          </tr>
                                       );
                                    })}
                                 </tbody>
                              </table>
                           </div>
                        </div>
                     </div>
                  );
               })()}
            </div>
            
            <div className="p-5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end shrink-0">
               <button onClick={() => setIsHistoryModalOpen(false)} className="px-8 py-3 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-xl font-bold transition-transform hover:-translate-y-0.5 text-sm shadow-md">
                 Tutup Riwayat
               </button>
            </div>
          </div>
        </div>
      )}

      {/* TAMBAHAN: Custom Notifikasi / Toast (Pengganti window.alert) */}
      {notification.isOpen && (
        <div className="fixed top-20 right-4 md:right-10 z-50 animate-in slide-in-from-top-4 fade-in duration-300">
          <div className={`p-4 rounded-xl shadow-xl border flex items-center gap-3 max-w-sm ${notification.type === 'error' ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/90 dark:border-red-700 dark:text-red-200' : 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/90 dark:border-emerald-700 dark:text-emerald-200'}`}>
             {notification.type === 'error' ? <AlertCircle size={24} className="shrink-0" /> : <CheckCircle size={24} className="shrink-0" />}
             <p className="text-sm font-medium">{notification.message}</p>
             <button onClick={() => setNotification({ isOpen: false, type: '', message: '' })} className="p-1 hover:bg-black/10 rounded-full transition-colors ml-auto"><X size={16}/></button>
          </div>
        </div>
      )}

      {selectedSlip && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-300 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-lg dark:text-white flex items-center gap-2"><FileText className="text-blue-500"/> Pratinjau Slip Gaji</h3>
              <button onClick={() => setSelectedSlip(null)} className="p-2 hover:bg-slate-200 dark:bg-slate-800 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
            </div>
            <div className="overflow-y-auto p-4 md:p-8 bg-slate-200 dark:bg-slate-700/50 flex-1">
              <SlipDocument teacher={selectedSlip} bulan={bulan} settings={settings} />
            </div>
            <div className="p-4 border-t border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 flex justify-end gap-3 shrink-0">
              <button onClick={() => window.print()} className="bg-slate-600 hover:bg-slate-700 text-white px-5 py-2.5 rounded-lg font-medium inline-flex items-center gap-2 shadow-sm transition-colors">
                <Printer size={18}/> Print
              </button>
              <button onClick={(e) => exportToPDF('printable-area', `Slip_Gaji_${selectedSlip.name.replace(/\s+/g, '_')}_${bulan}.pdf`, e.currentTarget)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-medium inline-flex items-center gap-2 shadow-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed">
                <Download size={18}/> Unduh PDF
              </button>
              <button onClick={() => setSelectedSlip(null)} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Profesional Rekap Gaji */}
      <div className="bg-gradient-to-r from-pink-600 to-rose-500 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 text-white shadow-lg relative overflow-hidden flex items-center justify-between shrink-0 mb-3 sm:mb-5">
        <div className="relative z-10">
          <h1 className="text-lg sm:text-2xl font-bold mb-0.5 sm:mb-1 flex items-center gap-2 sm:gap-3"><FileText className="text-pink-100" size={22} /> Rekapitulasi Gaji Keseluruhan</h1>
          <p className="text-pink-50 text-xs sm:text-sm">Tinjau rincian pengeluaran gaji sekolah secara transparan, cetak rekap per bulan, dan audit gaji per individu.</p>
        </div>
        <FileText size={100} className="absolute -right-6 -top-6 text-white/10 transform rotate-12 pointer-events-none hidden sm:block" />
      </div>

      
      {/* 🪄 NAVIGASI SUB-TAB & MASTER PRIVASI CONTROLS */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 mb-1 shrink-0">
        <div className="flex items-center p-1 bg-slate-200/80 dark:bg-slate-800/90 rounded-xl shadow-inner border border-slate-300/60 dark:border-slate-700 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab('rekap_berjalan')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeSubTab === 'rekap_berjalan'
                ? 'bg-white dark:bg-slate-700 text-pink-600 dark:text-pink-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <TableProperties size={16} />
            <span>Rekap Periode Berjalan</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 font-extrabold hidden md:inline-block">
              {bulan}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('matriks_lintas_bulan')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeSubTab === 'matriks_lintas_bulan'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Layers size={16} />
            <span>Matriks Riwayat Lintas Bulan</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-extrabold hidden md:inline-block">
              {matrixData.columns.length} Bulan
            </span>
          </button>
        </div>

        {/* Master Tombol Mode Privasi / Sensor Nominal */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMaskAll}
            className={`w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs cursor-pointer border ${
              isMaskedAll
                ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-md ring-2 ring-amber-300 dark:ring-amber-800'
                : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700'
            }`}
            title={isMaskedAll ? "Mode privasi aktif: Seluruh nominal gaji disensor. Klik untuk membuka semua." : "Sembunyikan/sensor semua angka nominal gaji untuk menjaga kerahasiaan saat ada orang lain."}
          >
            {isMaskedAll ? <EyeOff size={16} className="animate-pulse" /> : <Eye size={16} />}
            <span>{isMaskedAll ? 'Sensor Privasi Aktif (Klik Buka Semua)' : 'Sensor Angka Gaji (Mode Privasi)'}</span>
          </button>
        </div>
      </div>

<div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-full">
        {/* HEADER TABEL YANG DIRAPIKAN (TWO-TIER LAYOUT) */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex flex-col gap-4 bg-slate-50 dark:bg-slate-900/50 shrink-0">
          
          {/* Baris Atas: Judul & Alur Kerja (Workflow) */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h3 className="text-lg font-bold dark:text-white flex items-center gap-2">
                <FileText className="text-emerald-600 dark:text-emerald-500" /> Tabel Rincian Rekap
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Periode: <strong className="text-slate-700 dark:text-slate-300">{bulan}</strong></p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="flex items-center bg-white dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm shrink-0">
                 <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-2">Status:</span>
                 <span className={`text-xs font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5 ${settings?.payrollStatus === 'Approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : settings?.payrollStatus === 'Pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'}`}>
                   {settings?.payrollStatus === 'Approved' ? <CheckCircle size={14}/> : settings?.payrollStatus === 'Pending' ? <Clock size={14}/> : <FileText size={14}/>}
                   {settings?.payrollStatus === 'Approved' ? 'Disetujui' : settings?.payrollStatus === 'Pending' ? 'Menunggu Approval' : 'Draft'}
                 </span>
              </div>

              {(settings?.payrollStatus === 'Draft' || !settings?.payrollStatus) && (
                <button onClick={handleAjukanApproval} className="flex-1 md:flex-none justify-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm">
                   <Send size={16} /> Ajukan Approval
                </button>
              )}
              {settings?.payrollStatus === 'Pending' && (
                <button disabled className="flex-1 md:flex-none justify-center bg-amber-100 text-amber-500 dark:bg-amber-900/20 dark:text-amber-600 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm cursor-not-allowed opacity-70">
                   <Lock size={16} /> Pending Kepsek
                </button>
              )}
              {settings?.payrollStatus === 'Approved' && (
                <button onClick={handleArchive} disabled={isArchiving} className="flex-1 md:flex-none justify-center bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm disabled:opacity-50">
                   <Lock size={16} /> {isArchiving ? 'Memproses...' : 'Tutup Buku & Arsipkan'}
                </button>
              )}
            </div>
          </div>

          {/* Baris Bawah: Pencarian & Filter & Export/Cetak */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2 border-t border-slate-200 border-dashed dark:border-slate-700">
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-60">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Cari Pegawai atau NIPY..." 
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 outline-none dark:text-white transition-all shadow-sm"
                />
              </div>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-sm outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="Semua">Pegawai Aktif Saja</option>
                <option value="Tetap">Tetap (Aktif)</option>
                <option value="Kontrak">Kontrak (Aktif)</option>
                <option value="Honor">Honor (Aktif)</option>
                <option value="Non-Aktif">Non-Aktif / Resign</option>
                <option value="Semua (Termasuk Non-Aktif)">Semua (Termasuk Non-Aktif)</option>
              </select>
            </div>
            
            <div className="grid grid-cols-4 gap-1.5 w-full sm:flex sm:w-auto">
              <button onClick={handleKirimNotifMassal} className="justify-center bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1.5 rounded-lg text-xs font-bold transition-colors items-center gap-1 shadow-sm cursor-pointer flex">
                 <BellRing size={14} /> <span>Notif</span>
              </button>
              <button 
                type="button"
                onClick={() => {
                  if (onOpenAuditLog) {
                    onOpenAuditLog('finansial');
                  }
                }} 
                className="justify-center bg-amber-100 hover:bg-amber-200 text-amber-700 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 dark:text-amber-400 px-2 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-colors items-center gap-1 cursor-pointer flex" 
                title="Buka Jejak Audit Finansial & Mutasi Gaji di Pengaturan"
              >
                 <History size={14} /> <span>Audit</span>
              </button>
              <button onClick={handleExportExcelPure} className="justify-center bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors items-center gap-1 shadow-sm cursor-pointer flex" title="Unduh Rekap Gaji Lengkap Format Excel (.xlsx)">
                 <FileSpreadsheet size={14} /> <span>Excel (.xlsx)</span>
              </button>
              <button onClick={handleMassPrint} disabled={isMassPrinting} className="justify-center bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1.5 rounded-lg text-xs font-bold transition-colors items-center gap-1 shadow-sm cursor-pointer flex disabled:opacity-70 disabled:cursor-not-allowed">
                 {isMassPrinting ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Printer size={14} />}
                 <span>Cetak</span>
              </button>
            </div>
          </div>
        </div>

        
        {/* 🪄 TAMPILAN KONDISIONAL: 1. REKAP PERIODE BERJALAN ATAU 2. MATRIKS RIWAYAT LINTAS BULAN */}
        {activeSubTab === 'rekap_berjalan' ? (
          <>
            {/* FITUR BARU 3: Kontainer Rendering Cetak Slip Massal (Hanya muncul saat mem-print massal) */}
        {isMassPrinting && (
           <div className="hidden print:block w-full h-full bg-white print-area z-50 absolute top-0 left-0">
             {filtered.map((t, idx) => (
                <div key={t.id} className="w-full flex justify-center mb-8" style={{ pageBreakAfter: idx < filtered.length - 1 ? 'always' : 'auto' }}>
                  <SlipDocument teacher={t} bulan={bulan} settings={settings} />
                </div>
             ))}
           </div>
        )}

        {/* FITUR BARU: Tampilan Kartu Responsif Khusus Layar HP (< md) */}
        <div className="md:hidden space-y-2.5 mb-4 no-print">
          {filtered.map(t => {
             const slip = calculatePayroll(t, settings);
             const prevData = prevArchive?.dataGuru?.find(guru => {
               if (!guru || !guru.name || !t || !t.name) return false;
               const gName = guru.name.trim().toLowerCase().replace(/^(ust|ustadz|ustadzah|ibu|bapak|dra|dr|h|hj)\.?\s+/i, '');
               const tName = t.name.trim().toLowerCase().replace(/^(ust|ustadz|ustadzah|ibu|bapak|dra|dr|h|hj)\.?\s+/i, '');
               return gName === tName || (String(guru.id) === String(t.id) && gName.includes(tName));
             });
             const prevTHP = prevData ? calculatePayroll(prevData, settings).totalBersih : null;
             const diffIndividu = prevTHP !== null ? slip.totalBersih - prevTHP : null;

             return (
               <div key={t.id} className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-2.5">
                 <div className="flex justify-between items-start">
                   <div>
                     <button 
                       onClick={() => onEditGaji(t.id)} 
                       className="font-bold text-sm text-indigo-600 dark:text-indigo-400 flex items-center gap-1 text-left hover:underline"
                     >
                       {t.name} <Edit size={14} className="shrink-0" />
                     </button>
                     <div className="text-xs text-slate-500 mt-0.5">{t.status} • {t.position}</div>
                   </div>
                   <div className="text-right">
                     <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">THP Bersih</div>
                     <div className="flex items-center justify-end gap-1.5">
                       <button
                         type="button"
                         onClick={(e) => { e.stopPropagation(); toggleTeacherMask(t.id); }}
                         className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-md transition-colors"
                         title={isTeacherMasked(t.id) ? "Buka sensor untuk guru ini" : "Sensor angka guru ini"}
                       >
                         {isTeacherMasked(t.id) ? <EyeOff size={13} className="text-amber-500" /> : <Eye size={13} />}
                       </button>
                       <div className="text-base font-black text-emerald-600 dark:text-emerald-400">{renderNominal(slip.totalBersih, t.id)}</div>
                     </div>
                     {prevTHP !== null ? (
                        diffIndividu !== 0 ? (
                          <div className={`text-[10px] font-bold ${diffIndividu > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                            {diffIndividu > 0 ? '+' : ''}{formatRp(diffIndividu)}
                          </div>
                        ) : (
                          <div className="text-[10px] font-bold text-slate-400">Sama</div>
                        )
                     ) : (
                        <div className="text-[10px] font-bold text-slate-400">Data Baru</div>
                     )}
                   </div>
                 </div>

                 <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700/50">
                    <div><span className="text-slate-400">Total Kotor:</span> <span className="font-bold block dark:text-slate-200">{formatRp(slip.totalKotor)}</span></div>
                    <div><span className="text-slate-400">Total Potongan:</span> <span className="font-bold text-red-500 block">-{formatRp(slip.totalPotongan)}</span></div>
                    <div><span className="text-slate-400">T. Masa Kerja:</span> <span className="font-medium block dark:text-slate-300">{formatRp(slip.tMasaKerja)}</span></div>
                    <div><span className="text-slate-400">T. Jabatan:</span> <span className="font-medium block dark:text-slate-300">{formatRp(slip.tJabatan)}</span></div>
                    <div><span className="text-slate-400">Bonus Hadir:</span> <span className="font-medium text-emerald-600 block">+{formatRp(slip.bonusHadir)}</span></div>
                    <div><span className="text-slate-400">Jam Lebih:</span> <span className="font-medium text-emerald-600 block">+{formatRp(slip.tMengajar)}</span></div>
                 </div>

                 <div className="flex items-center justify-between pt-1">
                   <div className="flex gap-2">
                     <button 
                       onClick={() => setSelectedSlip(t)} 
                       className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                     >
                       <FileText size={14}/> Slip Gaji
                     </button>
                     <button 
                       onClick={() => onEditGaji(t.id)} 
                       className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-amber-600 dark:text-amber-400 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                     >
                       <Edit size={14}/> Edit Gaji
                     </button>
                   </div>
                   {t.payroll?.isConfirmed && (
                     <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/40 px-2 py-1 rounded border border-emerald-200 dark:border-emerald-800">
                       ✓ Terkonfirmasi
                     </span>
                   )}
                 </div>
               </div>
             );
          })}
        </div>

        <div className={`hidden md:block overflow-x-auto flex-1 relative print-area pb-4 scrollbar-thin ${isMassPrinting ? 'print:hidden' : ''}`}>
          <table className="w-full text-left text-xs md:text-sm whitespace-nowrap min-w-max">
            <thead className="text-slate-600 dark:text-slate-400 sticky top-0 z-30 shadow-sm">
              {/* BARIS 1: PENGELOMPOKAN HEADER (NESTED HEADERS) */}
              <tr>
                <th className="p-2 border-b border-r border-slate-300 dark:border-slate-600 bg-slate-200 dark:bg-slate-800 md:sticky md:left-0 z-40 shadow-[1px_0_0_rgba(0,0,0,0.1)]"></th>
                <th colSpan="5" className="p-2 border-b border-r border-slate-300 dark:border-slate-600 text-center font-extrabold text-blue-700 dark:text-blue-400 tracking-wider text-[11px] uppercase bg-blue-50 dark:bg-blue-900/40">Komponen Tunjangan Tetap</th>
                <th colSpan="3" className="p-2 border-b border-r border-slate-300 dark:border-slate-600 text-center font-extrabold text-emerald-700 dark:text-emerald-400 tracking-wider text-[11px] uppercase bg-emerald-50 dark:bg-emerald-900/40">Insentif & Bonus</th>
                <th colSpan="2" className="p-2 border-b border-r border-slate-300 dark:border-slate-600 text-center font-extrabold text-slate-700 dark:text-slate-300 tracking-wider text-[11px] uppercase bg-slate-200/70 dark:bg-slate-700/70">Kalkulasi</th>
                <th colSpan="2" className="p-2 border-b border-slate-300 dark:border-slate-600 text-center font-extrabold text-indigo-700 dark:text-indigo-400 tracking-wider text-[11px] uppercase bg-indigo-50 dark:bg-indigo-900/40 md:sticky md:right-0 z-40 shadow-[-1px_0_0_rgba(0,0,0,0.1)] no-print min-w-[280px]">Finalisasi & Aksi</th>
              </tr>
              {/* BARIS 2: NAMA KOLOM */}
              <tr className="bg-slate-100 dark:bg-slate-900/90">
                <th className="p-3 font-bold border-b border-r border-slate-200 dark:border-slate-700 md:sticky md:left-0 z-30 shadow-[1px_0_0_rgba(0,0,0,0.1)] bg-slate-100 dark:bg-slate-900/90">Nama & Status</th>
                
                <th className="p-3 font-bold border-b border-slate-200 dark:border-slate-700 text-right">T. Masa Kerja</th>
                <th className="p-3 font-bold border-b border-slate-200 dark:border-slate-700 text-right">T. Jabatan</th>
                <th className="p-3 font-bold border-b border-slate-200 dark:border-slate-700 text-right">T. Pendidikan</th>
                <th className="p-3 font-bold border-b border-slate-200 dark:border-slate-700 text-right">T. Kompetensi</th>
                <th className="p-3 font-bold border-b border-r border-slate-300 dark:border-slate-600 text-right">T. Keluarga</th>
                
                <th className="p-3 font-bold border-b border-slate-200 dark:border-slate-700 text-right">Insentif Khusus</th>
                <th className="p-3 font-bold border-b border-slate-200 dark:border-slate-700 text-right text-emerald-600 dark:text-emerald-400">Bonus Hadir</th>
                <th className="p-3 font-bold border-b border-r border-slate-300 dark:border-slate-600 text-right text-emerald-600 dark:text-emerald-400">Jam Lebih</th>
                
                <th className="p-3 font-bold border-b border-slate-200 dark:border-slate-700 text-right bg-slate-200/50 dark:bg-slate-800/50">Total Kotor</th>
                <th className="p-3 font-bold border-b border-r border-slate-300 dark:border-slate-600 text-right text-red-600 dark:text-red-400">Potongan</th>
                
                <th className="p-3 font-bold border-b border-slate-200 dark:border-slate-700 text-right bg-emerald-100 dark:bg-emerald-900/90 text-emerald-800 dark:text-emerald-300 md:sticky md:right-[150px] z-30 shadow-[-1px_0_0_rgba(0,0,0,0.1)] min-w-[130px]">THP Bersih</th>
                <th className="p-3 font-bold border-b border-slate-200 dark:border-slate-700 text-center md:sticky md:right-0 bg-slate-100 dark:bg-slate-900/90 z-30 shadow-[-1px_0_0_rgba(0,0,0,0.1)] no-print w-[150px] min-w-[150px]">Aksi Gaji</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700/80">
              {filtered.map(t => {
                const slip = calculatePayroll(t, settings);

                // 🪄 TAMBALAN CERDAS: Ambil data bulan lalu per individu berdasarkan kecocokan Nama / ID+Nama
                const prevData = prevArchive?.dataGuru?.find(guru => {
                  if (!guru || !guru.name || !t || !t.name) return false;
                  const gName = guru.name.trim().toLowerCase().replace(/^(ust|ustadz|ustadzah|ibu|bapak|dra|dr|h|hj)\.?\s+/i, '');
                  const tName = t.name.trim().toLowerCase().replace(/^(ust|ustadz|ustadzah|ibu|bapak|dra|dr|h|hj)\.?\s+/i, '');
                  
                  const sameName = gName === tName;
                  const sameIdAndName = String(guru.id) === String(t.id) && (gName.includes(tName) || tName.includes(gName));
                  
                  return sameName || sameIdAndName;
                });

                const prevTHP = prevData ? calculatePayroll(prevData, settings).totalBersih : null;
                const diffIndividu = prevTHP !== null ? slip.totalBersih - prevTHP : null;

                gtMasaKerja += slip.tMasaKerja;
                gtJabatan += slip.tJabatan;
                gtPendidikan += slip.tPendidikan;
                gtKompetensi += slip.tKompetensi;
                gtKeluarga += slip.tKeluarga;
                gtTambahan += slip.tTambahan;
                gtBonusHadir += slip.bonusHadir;
                gtMengajar += slip.tMengajar;
                gtTotalKotor += slip.totalKotor;
                gtPotong += slip.totalPotongan;
                gtTHP += slip.totalBersih;

                return (
                  <tr key={t.id} className="hover:bg-indigo-50/40 dark:hover:bg-slate-800/60 transition-colors group">
                    <td className="p-3 bg-white dark:bg-slate-800 group-hover:bg-indigo-50/40 dark:group-hover:bg-slate-800/60 md:sticky md:left-0 z-10 shadow-[1px_0_0_rgba(0,0,0,0.05)] border-r border-slate-100 dark:border-slate-700">
                      {/* FITUR BARU: Nama Pegawai Dapat Diklik Langsung Untuk Edit Komponen Gaji */}
                      <button 
                        onClick={() => onEditGaji(t.id)} 
                        className="font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 hover:underline transition-colors text-left flex items-center gap-1.5 group/btn cursor-pointer"
                        title="Klik untuk membuka & mengubah rincian komponen gaji pegawai ini"
                      >
                        <span className="truncate max-w-[150px]">{t.name}</span>
                        <Edit size={13} className="text-indigo-400 opacity-60 group-hover/btn:opacity-100 group-hover/btn:scale-110 transition-all shrink-0" />
                      </button>
                      <div className="text-[10px] text-slate-500 mt-0.5">{t.status} • {t.position}</div>
                      {/* FITUR BARU: Lencana "Telah Konfirmasi" untuk Admin */}
                      {t.payroll?.isConfirmed && (
                         <div className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 shadow-sm">
                           <CheckCircle size={10}/> Telah Konfirmasi
                         </div>
                      )}
                    </td>
                    
                    <td className="p-3 text-right font-medium text-slate-600 dark:text-slate-300">{formatRp(slip.tMasaKerja)}</td>
                    <td className="p-3 text-right font-medium text-slate-600 dark:text-slate-300">{formatRp(slip.tJabatan)}</td>
                    <td className="p-3 text-right font-medium text-slate-600 dark:text-slate-300">{formatRp(slip.tPendidikan)}</td>
                    <td className="p-3 text-right font-medium text-slate-600 dark:text-slate-300">{formatRp(slip.tKompetensi)}</td>
                    <td className="p-3 text-right font-medium text-slate-600 dark:text-slate-300 border-r border-slate-100 dark:border-slate-700">{formatRp(slip.tKeluarga)}</td>
                    
                    <td className="p-3 text-right font-medium text-slate-600 dark:text-slate-300">{formatRp(slip.tTambahan)}</td>
                    <td className="p-3 text-right font-medium text-emerald-600 dark:text-emerald-400">+{formatRp(slip.bonusHadir)}</td>
                    <td className="p-3 text-right font-medium text-emerald-600 dark:text-emerald-400 border-r border-slate-100 dark:border-slate-700">+{formatRp(slip.tMengajar)}</td>
                    
                    <td className="p-3 text-right font-bold text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-800/20">{formatRp(slip.totalKotor)}</td>
                    <td className="p-3 text-right font-medium text-red-600 dark:text-red-400 border-r border-slate-100 dark:border-slate-700">-{formatRp(slip.totalPotongan)}</td>
                    
                    {/* 🪄 TAMBALAN CERDAS 2: Sticky Right untuk Kolom THP Bersih */}
                    <td className="p-3 text-right bg-emerald-50 dark:bg-emerald-900/90 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-800 border-l border-r border-slate-200 dark:border-slate-700 md:sticky md:right-[150px] z-10 shadow-[-1px_0_0_rgba(0,0,0,0.05)] min-w-[130px]">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleTeacherMask(t.id); }}
                          className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-md transition-colors"
                          title={isTeacherMasked(t.id) ? "Buka sensor gaji guru ini" : "Sensor angka gaji guru ini"}
                        >
                          {isTeacherMasked(t.id) ? <EyeOff size={13} className="text-amber-500" /> : <Eye size={13} />}
                        </button>
                        <div className="font-black text-emerald-700 dark:text-emerald-400 text-[13px] tracking-tight">{renderNominal(slip.totalBersih, t.id)}</div>
                      </div>
                      {/* 🪄 Indikator Perbandingan Individual */}
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
                    {/* 🪄 TAMBALAN CERDAS 2: Sticky Kolom Aksi yang Lebarnya Diatur Pasti (Fixed) */}
                    <td className="p-3 text-center bg-white dark:bg-slate-800 group-hover:bg-indigo-50/40 dark:group-hover:bg-slate-800/60 md:sticky md:right-0 z-20 shadow-[-1px_0_0_rgba(0,0,0,0.05)] border-l border-slate-200 dark:border-slate-700 no-print w-[150px] min-w-[150px]">
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <button 
                            onClick={() => setSelectedSlip(t)}
                            className="text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 p-1.5 rounded-md font-medium transition-colors"
                            title="Lihat Pratinjau Slip"
                          >
                            <FileText size={15} />
                          </button>
                          <button 
                            onClick={() => onEditGaji(t.id)}
                            className="text-xs bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-amber-600 dark:text-amber-400 p-1.5 rounded-md font-medium transition-colors"
                            title="Edit Komponen Gaji"
                          >
                            <Edit size={15} />
                          </button>
                          
                          {/* 🪄 TAMBAHAN: Tombol Riwayat Gaji Individu */}
                          <button 
                            onClick={() => {
                              setSelectedTeacherHistory(t);
                              setIsHistoryModalOpen(true);
                            }}
                            className="text-xs bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 p-1.5 rounded-md font-medium transition-colors"
                            title="Riwayat & Tren Gaji"
                          >
                            <History size={15} />
                          </button>

                          <button 
                            onClick={() => handleKirimNotif(t.id)}
                            disabled={(t.payroll?.isNotified && !t.payroll?.isConfirmed) || settings?.payrollStatus !== 'Approved'}
                            className={`text-xs p-1.5 rounded-md font-medium transition-colors ${(t.payroll?.isNotified && !t.payroll?.isConfirmed) ? 'bg-indigo-100/50 text-indigo-300 dark:bg-indigo-900/20 dark:text-indigo-700 cursor-not-allowed' : t.payroll?.isConfirmed ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : settings?.payrollStatus !== 'Approved' ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 cursor-not-allowed' : 'bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400'}`}
                            title={settings?.payrollStatus !== 'Approved' ? "Gaji Belum Disetujui" : t.payroll?.isConfirmed ? "Gaji Telah Dikonfirmasi" : (t.payroll?.isNotified ? "Menunggu Konfirmasi Guru" : "Kirim Notifikasi Transfer")}
                          >
                            {settings?.payrollStatus !== 'Approved' ? <Lock size={15} /> : t.payroll?.isConfirmed ? <CheckCircle size={15} /> : <Bell size={15} />}
                          </button>
                        </div>
                        {/* Indikator Status Transfer */}
                        {t.payroll?.isConfirmed ? (
                          <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 tracking-wider uppercase">Selesai</span>
                        ) : t.payroll?.isNotified ? (
                          <span className="text-[9px] font-bold text-indigo-500 dark:text-indigo-400 tracking-wider uppercase">Menunggu</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan="13" className="p-8 text-center text-slate-500">Tidak ada data pegawai ditemukan.</td></tr>
              )}
            </tbody>
            <tfoot className="bg-slate-200 dark:bg-slate-800 sticky bottom-0 z-20 shadow-[0_-1px_2px_rgba(0,0,0,0.1)]">
              <tr>
                <td className="p-3 font-extrabold text-slate-800 dark:text-slate-200 text-right uppercase tracking-wider sticky left-0 bg-slate-200 dark:bg-slate-800 shadow-[1px_0_0_rgba(0,0,0,0.1)] border-r border-slate-300 dark:border-slate-600">Total Keseluruhan</td>
                <td className="p-3 text-right font-bold text-slate-800 dark:text-slate-200">{formatRp(gtMasaKerja)}</td>
                <td className="p-3 text-right font-bold text-slate-800 dark:text-slate-200">{formatRp(gtJabatan)}</td>
                <td className="p-3 text-right font-bold text-slate-800 dark:text-slate-200">{formatRp(gtPendidikan)}</td>
                <td className="p-3 text-right font-bold text-slate-800 dark:text-slate-200">{formatRp(gtKompetensi)}</td>
                <td className="p-3 text-right font-bold text-slate-800 dark:text-slate-200 border-r border-slate-300 dark:border-slate-600">{formatRp(gtKeluarga)}</td>
                
                <td className="p-3 text-right font-bold text-slate-800 dark:text-slate-200">{formatRp(gtTambahan)}</td>
                <td className="p-3 text-right font-bold text-emerald-600 dark:text-emerald-400">+{formatRp(gtBonusHadir)}</td>
                <td className="p-3 text-right font-bold text-emerald-600 dark:text-emerald-400 border-r border-slate-300 dark:border-slate-600">+{formatRp(gtMengajar)}</td>
                
                <td className="p-3 text-right font-black text-slate-800 dark:text-slate-200 bg-slate-300/50 dark:bg-slate-700/50">{formatRp(gtTotalKotor)}</td>
                <td className="p-3 text-right font-black text-red-600 dark:text-red-400 border-r border-slate-300 dark:border-slate-600">-{formatRp(gtPotong)}</td>
                
                <td className="p-3 text-right font-black text-emerald-700 dark:text-emerald-400 bg-emerald-200 dark:bg-emerald-900/90 text-[14px] sticky right-[150px] z-20 shadow-[-1px_0_0_rgba(0,0,0,0.1)] min-w-[130px] border-l border-slate-300 dark:border-slate-600">{renderTotalNominal(gtTHP)}</td>
                <td className="p-3 sticky right-0 bg-slate-200 dark:bg-slate-800 shadow-[-1px_0_0_rgba(0,0,0,0.1)] border-l border-slate-300 dark:border-slate-600 no-print z-30 w-[150px] min-w-[150px]"></td>
              </tr>
            </tfoot>
          </table>
        </div>
          </>
        ) : (
          <div className="flex flex-col flex-1 p-3.5 sm:p-5 gap-4">
            {/* TOOLBAR KHUSUS MATRIKS LINTAS BULAN */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-indigo-50/50 dark:bg-slate-900/40 p-4 rounded-2xl border border-indigo-100 dark:border-slate-700/60 shadow-xs">
              
              {/* Pilihan Metrik (Pills) */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full lg:w-auto">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 shrink-0">
                  <Filter size={14} className="text-indigo-500" /> Tampilkan Metrik:
                </span>
                <div className="grid grid-cols-3 gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setMatrixMetric('totalBersih')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                      matrixMetric === 'totalBersih'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    THP Bersih
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatrixMetric('totalKotor')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                      matrixMetric === 'totalKotor'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    Gaji Kotor
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatrixMetric('totalPotongan')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                      matrixMetric === 'totalPotongan'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    Potongan
                  </button>
                </div>
              </div>

              {/* Tombol Ekspor Matriks ke Excel */}
              <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
                <button
                  type="button"
                  onClick={handleExportMatrixExcel}
                  className="w-full sm:w-auto justify-center bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer active:scale-95"
                  title="Unduh seluruh matriks komparasi lintas bulan ke dalam format Excel murni (.xlsx)"
                >
                  <FileSpreadsheet size={16} />
                  <span>Unduh Matriks Excel (.xlsx)</span>
                </button>
              </div>
            </div>

            {/* KARTU STATISTIK RINGKASAN MATRIKS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Pegawai Terdata</span>
                <span className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100">{matrixData.rows.length} <span className="text-xs font-semibold text-slate-400">Orang</span></span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Periode Tercatat</span>
                <span className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400">{matrixData.columns.length} <span className="text-xs font-semibold text-slate-400">Bulan</span></span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Rata-Rata per Bulan</span>
                <span className="text-base sm:text-lg font-black text-slate-700 dark:text-slate-200 block truncate">
                  {renderTotalNominal(matrixData.grandAverage)}
                </span>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/30 p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800/60">
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Akumulasi Total</span>
                <span className="text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-300 block truncate">
                  {renderTotalNominal(matrixData.grandTotalSum)}
                </span>
              </div>
            </div>

            {/* TABEL MATRIKS HORISONTAL (DILENGKAPI TABLEWRAPPER AGAR MUDAH DIGESER DI HP) */}
            <TableWrapper className="min-h-[380px]">
              <table className="w-full text-left text-xs md:text-sm whitespace-nowrap min-w-max border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-900/90 text-slate-600 dark:text-slate-400 sticky top-0 z-30 shadow-xs">
                  {/* BARIS HEADER TINGKAT 1 */}
                  <tr>
                    <th colSpan="3" className="p-2.5 text-center font-extrabold uppercase tracking-wider text-[11px] bg-slate-200/90 dark:bg-slate-800 border-b border-r border-slate-300 dark:border-slate-700 sticky left-0 z-40">
                      Identitas Pendidik & Tenaga Kependidikan
                    </th>
                    <th colSpan={matrixData.columns.length} className="p-2.5 text-center font-extrabold uppercase tracking-wider text-[11px] bg-indigo-100/70 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300 border-b border-r border-indigo-200 dark:border-slate-700">
                      Riwayat Rekapitulasi Tiap Periode Gaji
                    </th>
                    <th colSpan="2" className="p-2.5 text-center font-extrabold uppercase tracking-wider text-[11px] bg-emerald-100/70 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border-b border-slate-300 dark:border-slate-700 sticky right-0 z-40">
                      Ringkasan Finansial
                    </th>
                  </tr>
                  {/* BARIS HEADER TINGKAT 2 */}
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="p-3 font-bold sticky left-0 z-30 bg-slate-100 dark:bg-slate-900/90 w-12 text-center border-r border-slate-200 dark:border-slate-700">
                      No
                    </th>
                    <th className="p-3 font-bold sticky left-12 z-30 bg-slate-100 dark:bg-slate-900/90 border-r border-slate-200 dark:border-slate-700 min-w-[200px]">
                      Nama Pegawai & NIPY
                    </th>
                    <th className="p-3 font-bold border-r border-slate-300 dark:border-slate-700 min-w-[120px]">
                      Status / Jabatan
                    </th>

                    {/* Kolom Tiap Bulan */}
                    {matrixData.columns.map(col => (
                      <th 
                        key={col.key} 
                        className={`p-3 font-bold text-right border-r border-slate-200 dark:border-slate-700 min-w-[140px] ${
                          col.isCurrent 
                            ? 'bg-amber-50/70 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300' 
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex flex-col items-end">
                          <span>{col.label}</span>
                          {col.isCurrent && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-amber-200/80 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 font-extrabold uppercase">
                              Berjalan
                            </span>
                          )}
                        </div>
                      </th>
                    ))}

                    {/* Kolom Total Akumulasi & Rata-rata */}
                    <th className="p-3 font-black text-right bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-l border-r border-slate-200 dark:border-slate-700 min-w-[140px] sticky right-[130px] z-30 shadow-[-1px_0_0_rgba(0,0,0,0.05)]">
                      Total Akumulasi
                    </th>
                    <th className="p-3 font-black text-right bg-slate-100 dark:bg-slate-900/90 text-slate-800 dark:text-slate-200 min-w-[130px] sticky right-0 z-30 shadow-[-1px_0_0_rgba(0,0,0,0.05)]">
                      Rata-Rata
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700/80">
                  {matrixData.rows.map((row, idx) => {
                    const t = row.teacher;
                    return (
                      <tr key={t.id} className="hover:bg-indigo-50/40 dark:hover:bg-slate-800/60 transition-colors group">
                        {/* No */}
                        <td className="p-3 text-center text-slate-500 font-medium sticky left-0 z-20 bg-white dark:bg-slate-800 group-hover:bg-indigo-50/40 dark:group-hover:bg-slate-800/60 border-r border-slate-100 dark:border-slate-700">
                          {idx + 1}
                        </td>

                        {/* Nama Pegawai & Tombol Sensor Individu */}
                        <td className="p-3 font-bold sticky left-12 z-20 bg-white dark:bg-slate-800 group-hover:bg-indigo-50/40 dark:group-hover:bg-slate-800/60 border-r border-slate-100 dark:border-slate-700 shadow-[1px_0_0_rgba(0,0,0,0.05)]">
                          <div className="flex items-center justify-between gap-2">
                            <div className="truncate max-w-[170px]">
                              <button 
                                onClick={() => onEditGaji(t.id)} 
                                className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline text-left cursor-pointer"
                                title="Klik untuk membuka rincian gaji guru ini"
                              >
                                {t.name}
                              </button>
                              <div className="text-[10px] text-slate-400 font-normal">{t.nipy || t.id}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleTeacherMask(t.id)}
                              className="p-1 rounded-md text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors shrink-0"
                              title={isTeacherMasked(t.id) ? "Buka sensor untuk guru ini" : "Sensor angka guru ini"}
                            >
                              {isTeacherMasked(t.id) ? <EyeOff size={13} className="text-amber-500" /> : <Eye size={13} />}
                            </button>
                          </div>
                        </td>

                        {/* Status / Jabatan */}
                        <td className="p-3 text-slate-600 dark:text-slate-300 border-r border-slate-100 dark:border-slate-700 text-xs">
                          <span className="font-semibold block">{t.status || 'Tetap'}</span>
                          <span className="text-[10px] text-slate-400 truncate block max-w-[120px]">{t.position || 'Guru'}</span>
                        </td>

                        {/* Nilai Tiap Bulan */}
                        {matrixData.columns.map(col => {
                          const val = row.values[col.key];
                          return (
                            <td 
                              key={col.key} 
                              className={`p-3 text-right font-medium border-r border-slate-100 dark:border-slate-700 ${
                                col.isCurrent ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''
                              }`}
                            >
                              {val !== null ? (
                                <span className={`font-semibold ${
                                  matrixMetric === 'totalPotongan' 
                                    ? 'text-red-500' 
                                    : matrixMetric === 'totalKotor' 
                                      ? 'text-slate-700 dark:text-slate-200' 
                                      : 'text-emerald-600 dark:text-emerald-400'
                                }`}>
                                  {renderNominal(val, t.id)}
                                </span>
                              ) : (
                                <span className="text-slate-300 dark:text-slate-600 font-mono text-xs">-</span>
                              )}
                            </td>
                          );
                        })}

                        {/* Total Akumulasi (Sticky Right) */}
                        <td className="p-3 text-right font-black bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-l border-r border-slate-200 dark:border-slate-700 sticky right-[130px] z-20 shadow-[-1px_0_0_rgba(0,0,0,0.05)]">
                          {renderNominal(row.total, t.id)}
                        </td>

                        {/* Rata-Rata Bulanan (Sticky Right) */}
                        <td className="p-3 text-right font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 sticky right-0 z-20 shadow-[-1px_0_0_rgba(0,0,0,0.05)]">
                          {renderNominal(row.avg, t.id)}
                        </td>
                      </tr>
                    );
                  })}

                  {matrixData.rows.length === 0 && (
                    <tr>
                      <td colSpan={matrixData.columns.length + 5} className="p-12 text-center text-slate-400">
                        Tidak ada data pegawai yang sesuai dengan pencarian atau filter status.
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* FOOTER TOTAL PENGELUARAN SEKOLAH PER BULAN */}
                <tfoot className="bg-slate-200 dark:bg-slate-850 sticky bottom-0 z-30 shadow-[0_-1px_3px_rgba(0,0,0,0.1)] font-bold">
                  <tr className="border-t-2 border-slate-300 dark:border-slate-600">
                    <td colSpan="3" className="p-3.5 text-right font-black uppercase tracking-wider text-xs sticky left-0 z-40 bg-slate-200 dark:bg-slate-850 border-r border-slate-300 dark:border-slate-700">
                      TOTAL PENGELUARAN SEKOLAH:
                    </td>

                    {/* Total Tiap Kolom Bulan */}
                    {matrixData.columns.map(col => (
                      <td key={col.key} className="p-3.5 text-right font-black text-slate-800 dark:text-slate-100 border-r border-slate-300 dark:border-slate-700">
                        {renderTotalNominal(matrixData.columnTotals[col.key])}
                      </td>
                    ))}

                    {/* Grand Total Akumulasi (Sticky Right) */}
                    <td className="p-3.5 text-right font-black text-emerald-800 dark:text-emerald-300 bg-emerald-200 dark:bg-emerald-900 sticky right-[130px] z-40 border-l border-r border-slate-300 dark:border-slate-700 shadow-[-1px_0_0_rgba(0,0,0,0.1)]">
                      {renderTotalNominal(matrixData.grandTotalSum)}
                    </td>

                    {/* Grand Rata-Rata (Sticky Right) */}
                    <td className="p-3.5 text-right font-black text-slate-800 dark:text-slate-100 bg-slate-300 dark:bg-slate-800 sticky right-0 z-40 shadow-[-1px_0_0_rgba(0,0,0,0.1)]">
                      {renderTotalNominal(matrixData.grandAverage)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </TableWrapper>
          </div>
        )}

      </div>
    </div>
  );
}

// [MODULARISASI] ArsipView telah dimodularisasi ke src/features/admin/ArsipView.jsx
// [MODULARISASI] LaporanView telah dimodularisasi ke src/features/admin/LaporanView.jsx
// TAMBAHAN: Komponen PortalCard dipindah ke LUAR agar tidak memicu re-render ulang (Mencegah kursor lompat saat mengetik)

export { RekapGajiView };
