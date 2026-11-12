import React, { useState, useMemo } from 'react';
import { 
  Settings, X, Trash, PlusCircle, Save, BarChart3, 
  Calendar, Printer, Download, History, TrendingUp, TrendingDown,
  Activity, Users, Trash2, CheckCircle, PieChart as PieChartIcon, 
  Wallet, Edit, ChevronDown, Table, Layers, ArrowUpRight, ArrowDownRight, 
  Award, Info, AlertCircle, CalendarDays, Check 
} from 'lucide-react';
import { 
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend 
} from 'recharts';
import { 
  formatRp, getFormattedPeriod, calculatePayroll, 
  exportToPDF, generateUniqueId, isTeacherActive, parsePeriodToDate 
} from '../../utils/payrollUtils';
import { deduplicateArchives } from '../../services/dbService';

// --- LAPORAN VIEW ---
function LaporanView({ teachers, fundingSources, setFundingSources, settings, archives = [] }) {
  const bulan = getFormattedPeriod(settings?.payrollPeriod);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [tempFunding, setTempFunding] = useState([]);
  
  // FITUR BARU: Sub-Tab Pembedahan Arus Pemotongan ('berjalan' | 'riwayat')
  const [potonganTab, setPotonganTab] = useState('berjalan');

  // FITUR BARU: Tampilan Komposisi Komponen Gaji ('visual' | 'tabel')
  const [komposisiView, setKomposisiView] = useState('visual');

  // FITUR BARU: State untuk Micro-Interaction Tombol Simpan
  const [isSaving, setIsSaving] = useState(false);
  
  // State Loading PDF
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  const FUNDING_COLORS = [
    { bg: 'bg-blue-500', hex: '#3b82f6' },
    { bg: 'bg-emerald-500', hex: '#10b981' },
    { bg: 'bg-amber-500', hex: '#f59e0b' },
    { bg: 'bg-purple-500', hex: '#a855f7' },
    { bg: 'bg-pink-500', hex: '#ec4899' },
    { bg: 'bg-rose-500', hex: '#f43f5e' },
    { bg: 'bg-indigo-500', hex: '#6366f1' },
  ];

  const handleOpenEdit = () => {
    setTempFunding(JSON.parse(JSON.stringify(fundingSources)));
    setIsEditModalOpen(true);
  };

  const handleAddFunding = () => {
    const colorObj = FUNDING_COLORS[tempFunding.length % FUNDING_COLORS.length];
    setTempFunding([...tempFunding, { id: generateUniqueId('fund-'), nama: '', nominal: 0, warna: colorObj.bg, hex: colorObj.hex }]);
  };

  const handleRemoveFunding = (idx) => {
    setTempFunding(tempFunding.filter((_, i) => i !== idx));
  };

  const handleUpdateFunding = (idx, field, value) => {
    const newData = [...tempFunding];
    newData[idx][field] = value;
    setTempFunding(newData);
  };

  const totalTempNominal = tempFunding.reduce((sum, item) => sum + Number(item.nominal), 0);

  const handleSaveFunding = () => {
    setIsSaving(true);
    setTimeout(() => {
      setFundingSources(tempFunding);
      setIsSaving(false);
      setIsEditModalOpen(false);
    }, 600);
  };

  const activeTeachers = useMemo(() => (teachers || []).filter(isTeacherActive), [teachers]);

  // 🪄 KALKULASI LAPORAN UTAMA: KOMPOSISI 8 PILAR KOMPONEN SECARA DETAIL
  const reportData = useMemo(() => {
    let totalKotor = 0, totalPotongan = 0, totalBersih = 0;
    
    // Rincian Akumulasi Masing-masing Komponen Gaji
    let sumMasaKerja = 0, countMasaKerja = 0;
    let sumJabatan = 0, countJabatan = 0;
    let sumPendidikan = 0, countPendidikan = 0;
    let sumKompetensi = 0, countKompetensi = 0;
    let sumKeluarga = 0, countKeluarga = 0;
    let sumBonusHadir = 0, countBonusHadir = 0;
    let sumMengajar = 0, countMengajar = 0;
    let sumTambahan = 0, countTambahan = 0;

    let costTetap = 0, costTidakTetap = 0;
    let potongTelat = 0, potongKasbon = 0;
    let guruTerpotongCount = 0;

    activeTeachers.forEach(t => {
      const slip = calculatePayroll(t, settings);
      totalKotor += slip.totalKotor;
      totalPotongan += slip.totalPotongan;
      totalBersih += slip.totalBersih;

      if (slip.tMasaKerja > 0) { sumMasaKerja += slip.tMasaKerja; countMasaKerja++; }
      if (slip.tJabatan > 0) { sumJabatan += slip.tJabatan; countJabatan++; }
      if (slip.tPendidikan > 0) { sumPendidikan += slip.tPendidikan; countPendidikan++; }
      if (slip.tKompetensi > 0) { sumKompetensi += slip.tKompetensi; countKompetensi++; }
      if (slip.tKeluarga > 0) { sumKeluarga += slip.tKeluarga; countKeluarga++; }
      if (slip.bonusHadir > 0) { sumBonusHadir += slip.bonusHadir; countBonusHadir++; }
      if (slip.tMengajar > 0) { sumMengajar += slip.tMengajar; countMengajar++; }
      if (slip.tTambahan > 0) { sumTambahan += slip.tTambahan; countTambahan++; }

      if (t.status === 'Tetap') costTetap += slip.totalBersih;
      else costTidakTetap += slip.totalBersih;

      potongTelat += slip.potongTelat;
      potongKasbon += slip.tPotonganLainnya;
      if (slip.totalPotongan > 0) guruTerpotongCount++;
    });

    const totalKomposisi = totalKotor;

    // 🪄 8 KOMPONEN GAJI UTAMA DENGAN RINCIAN DETAIL & WARNA HARMONIS
    const KOMPOSISI_PALETTE = [
      { name: 'Tunjangan Masa Kerja', key: 'masaKerja', value: sumMasaKerja, count: countMasaKerja, hex: '#4F46E5', bg: 'bg-indigo-600', textClass: 'text-indigo-600 dark:text-indigo-400', desc: 'Dihitung dari TMT masa pengabdian guru tetap' },
      { name: 'Tunjangan Jabatan', key: 'jabatan', value: sumJabatan, count: countJabatan, hex: '#8B5CF6', bg: 'bg-violet-500', textClass: 'text-violet-600 dark:text-violet-400', desc: 'Tugas struktural, kepsek, waka, wali kelas' },
      { name: 'Tunjangan Pendidikan', key: 'pendidikan', value: sumPendidikan, count: countPendidikan, hex: '#0EA5E9', bg: 'bg-sky-500', textClass: 'text-sky-600 dark:text-sky-400', desc: 'Kualifikasi ijazah terakhir (SMA/D3/S1/S2)' },
      { name: 'Tunjangan Kompetensi', key: 'kompetensi', value: sumKompetensi, count: countKompetensi, hex: '#F59E0B', bg: 'bg-amber-500', textClass: 'text-amber-600 dark:text-amber-400', desc: 'Sertifikasi profesi & keahlian khusus' },
      { name: 'Tunjangan Keluarga', key: 'keluarga', value: sumKeluarga, count: countKeluarga, hex: '#EC4899', bg: 'bg-pink-500', textClass: 'text-pink-600 dark:text-pink-400', desc: 'Tunjangan suami/istri dan anak tanggungan' },
      { name: 'Insentif & Bonus Hadir', key: 'bonusHadir', value: sumBonusHadir, count: countBonusHadir, hex: '#10B981', bg: 'bg-emerald-500', textClass: 'text-emerald-600 dark:text-emerald-400', desc: 'Apresiasi presensi kehadiran tepat waktu' },
      { name: 'Honor Jam Lebih', key: 'mengajar', value: sumMengajar, count: countMengajar, hex: '#14B8A6', bg: 'bg-teal-500', textClass: 'text-teal-600 dark:text-teal-400', desc: 'Kelebihan jam tatap muka di atas jam wajib' },
      { name: 'Tunjangan Tambahan', key: 'tambahan', value: sumTambahan, count: countTambahan, hex: '#F97316', bg: 'bg-orange-500', textClass: 'text-orange-600 dark:text-orange-400', desc: 'Tugas khusus insidental & penugasan lain' }
    ];

    const komposisi = KOMPOSISI_PALETTE.map(item => ({
      ...item,
      persentase: totalKomposisi > 0 ? ((item.value / totalKomposisi) * 100).toFixed(1) : 0,
      rataRata: item.count > 0 ? Math.round(item.value / item.count) : 0
    }));

    const komposisiChart = komposisi.filter(item => item.value > 0);

    // Format Data Distribusi Status
    const totalStatusCost = costTetap + costTidakTetap;
    const distribusiStatus = [
      { name: 'Pegawai Tetap', value: costTetap, persentase: totalStatusCost > 0 ? ((costTetap / totalStatusCost) * 100).toFixed(1) : 0, color: 'bg-emerald-500', textClass: 'text-emerald-600 dark:text-emerald-400' },
      { name: 'Pegawai Tidak Tetap', value: costTidakTetap, persentase: totalStatusCost > 0 ? ((costTidakTetap / totalStatusCost) * 100).toFixed(1) : 0, color: 'bg-amber-500', textClass: 'text-amber-600 dark:text-amber-400' }
    ];

    // Format Data Pemotongan Gaji Periode Berjalan
    const totalPotonganDetail = potongTelat + potongKasbon;
    const pembedahanPotongan = [
      { name: 'Denda Kedisiplinan (Terlambat)', value: potongTelat, persentase: totalPotonganDetail > 0 ? ((potongTelat / totalPotonganDetail) * 100).toFixed(1) : 0, color: 'bg-red-500', hex: '#EF4444', textClass: 'text-red-600 dark:text-red-400' },
      { name: 'Pinjaman / Kasbon / Lainnya', value: potongKasbon, persentase: totalPotonganDetail > 0 ? ((potongKasbon / totalPotonganDetail) * 100).toFixed(1) : 0, color: 'bg-orange-500', hex: '#F97316', textClass: 'text-orange-600 dark:text-orange-400' }
    ];

    const totalPendanaan = fundingSources.reduce((sum, item) => sum + Number(item.nominal), 0);
    const sumberDana = fundingSources.map(item => ({
      ...item,
      persentase: totalPendanaan > 0 ? ((item.nominal / totalPendanaan) * 100).toFixed(1) : 0
    }));

    return {
      totalKotor, totalPotongan, totalBersih,
      rataRata: activeTeachers.length > 0 ? totalBersih / activeTeachers.length : 0,
      komposisi,
      komposisiChart,
      distribusiStatus,
      pembedahanPotongan,
      potongTelat,
      potongKasbon,
      guruTerpotongCount,
      sumberDana,
      totalPendanaan
    };
  }, [activeTeachers, settings, fundingSources]);

  // 🪄 FITUR BARU 2: PEMBEDAHAN ARUS PEMOTONGAN LINTAS BULAN (MONITORING & EVALUASI)
  const monthlyDeductions = useMemo(() => {
    const cleanArchivesList = deduplicateArchives(archives || []);
    
    // Urutkan arsip dari yang terlama ke terbaru
    const sortedArchives = [...cleanArchivesList].sort((a, b) => {
      const dateA = parsePeriodToDate(a.periode || '');
      const dateB = parsePeriodToDate(b.periode || '');
      return dateA - dateB;
    });

    const list = sortedArchives.map(arc => {
      let telat = 0;
      let kasbon = 0;
      let affectedCount = 0;
      const arcTeachers = arc.dataGuru || [];

      arcTeachers.forEach(t => {
        const slip = calculatePayroll(t, settings);
        if (slip.potongTelat > 0) telat += slip.potongTelat;
        if (slip.tPotonganLainnya > 0) kasbon += slip.tPotonganLainnya;
        if (slip.totalPotongan > 0) affectedCount++;
      });

      return {
        id: arc.id,
        periode: arc.periode || 'Arsip',
        isCurrent: false,
        potongTelat: telat,
        potongKasbon: kasbon,
        totalPotongan: telat + kasbon,
        affectedCount,
        totalPegawai: arcTeachers.length
      };
    });

    // Tambahkan periode berjalan saat ini
    let curTelat = 0, curKasbon = 0, curAffected = 0;
    activeTeachers.forEach(t => {
      const slip = calculatePayroll(t, settings);
      if (slip.potongTelat > 0) curTelat += slip.potongTelat;
      if (slip.tPotonganLainnya > 0) curKasbon += slip.tPotonganLainnya;
      if (slip.totalPotongan > 0) curAffected++;
    });

    list.push({
      id: 'current',
      periode: bulan,
      isCurrent: true,
      potongTelat: curTelat,
      potongKasbon: curKasbon,
      totalPotongan: curTelat + curKasbon,
      affectedCount: curAffected,
      totalPegawai: activeTeachers.length
    });

    // Hitung perbandingan dan evaluasi tren vs bulan sebelumnya
    return list.map((item, idx, arr) => {
      const prev = idx > 0 ? arr[idx - 1] : null;
      let diffTelat = null;
      let diffTotal = null;
      let evalStatus = 'Data Awal';
      let evalColor = 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300';

      if (prev) {
        diffTelat = item.potongTelat - prev.potongTelat;
        diffTotal = item.totalPotongan - prev.totalPotongan;

        if (diffTelat < 0) {
          evalStatus = 'Kedisiplinan Membaik';
          evalColor = 'text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800';
        } else if (diffTelat > 0) {
          evalStatus = 'Keterlambatan Naik';
          evalColor = 'text-rose-700 bg-rose-100 dark:text-rose-300 dark:bg-rose-900/40 border border-rose-200 dark:border-rose-800';
        } else {
          evalStatus = 'Kedisiplinan Stabil';
          evalColor = 'text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800';
        }
      }

      return {
        ...item,
        diffTelat,
        diffTotal,
        evalStatus,
        evalColor
      };
    });
  }, [archives, activeTeachers, settings, bulan]);

  // Statistik Ringkasan Riwayat Pemotongan
  const deductionHistoryMetrics = useMemo(() => {
    if (!monthlyDeductions || monthlyDeductions.length === 0) {
      return { totalTelatAll: 0, totalKasbonAll: 0, grandTotalPotongan: 0, avgMonthlyPotongan: 0, totalBulan: 0 };
    }
    const totalTelatAll = monthlyDeductions.reduce((sum, m) => sum + m.potongTelat, 0);
    const totalKasbonAll = monthlyDeductions.reduce((sum, m) => sum + m.potongKasbon, 0);
    const grandTotalPotongan = totalTelatAll + totalKasbonAll;
    const avgMonthlyPotongan = Math.round(grandTotalPotongan / monthlyDeductions.length);

    return {
      totalTelatAll,
      totalKasbonAll,
      grandTotalPotongan,
      avgMonthlyPotongan,
      totalBulan: monthlyDeductions.length
    };
  }, [monthlyDeductions]);

  const CustomPieTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl">
          <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{data.name}</p>
          <p className="text-sm font-black text-indigo-600 dark:text-indigo-400 mt-0.5">{formatRp(data.value)}</p>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
            <span>Porsi: <strong>{data.persentase}%</strong></span>
            {data.count !== undefined && <span>• Penerima: <strong>{data.count} Pegawai</strong></span>}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in relative">
      
      {/* Modal Edit Sumber Dana */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50 shrink-0">
              <h3 className="font-bold text-lg dark:text-white flex items-center gap-2">
                <Settings className="text-indigo-500" /> Pengaturan Sumber Dana
              </h3>
              <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-500 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Atur rincian nominal sumber pendanaan gaji bulan ini. Total pengeluaran gaji kotor saat ini adalah <span className="font-bold text-indigo-600 dark:text-indigo-400">{formatRp(reportData.totalKotor)}</span>.
              </p>
              
              <div className="space-y-3">
                {tempFunding.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="flex-1">
                      <input 
                        type="text" 
                        placeholder="Nama Sumber Dana (misal: Yayasan, BOS)" 
                        value={item.nama}
                        onChange={(e) => handleUpdateFunding(idx, 'nama', e.target.value)}
                        className="w-full text-sm font-semibold p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <div className="w-40">
                      <input 
                        type="number" 
                        placeholder="Nominal" 
                        value={item.nominal || ''}
                        onChange={(e) => handleUpdateFunding(idx, 'nominal', Number(e.target.value))}
                        className="w-full text-sm font-bold p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-right"
                      />
                    </div>
                    <button 
                      onClick={() => handleRemoveFunding(idx)}
                      className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors"
                      title="Hapus Sumber"
                    >
                      <Trash size={18} />
                    </button>
                  </div>
                ))}
              </div>

              <button 
                onClick={handleAddFunding}
                className="mt-4 flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 transition-colors"
              >
                <PlusCircle size={16} /> Tambah Sumber Dana Baru
              </button>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-between items-center shrink-0">
              <div className="text-xs text-slate-500">
                Total Terinput: <strong className="text-slate-800 dark:text-slate-200">{formatRp(totalTempNominal)}</strong>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors"
                >
                  Batal
                </button>
                <button 
                  onClick={handleSaveFunding}
                  disabled={isSaving}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
                >
                  {isSaving ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={14} />}
                  <span>{isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HEADER LAPORAN */}
      <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-purple-600 rounded-2xl p-4 sm:p-6 text-white shadow-lg relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-bold text-indigo-100 mb-2">
            <CalendarDays size={13} /> Periode: {bulan}
          </div>
          <h1 className="text-xl sm:text-2xl font-black mb-1 flex items-center gap-2.5">
            <BarChart3 className="text-indigo-200" size={26} /> Laporan & Analitik Penggajian
          </h1>
          <p className="text-indigo-100 text-xs sm:text-sm max-w-xl">
            Pembedahan komprehensif struktur pengeluaran gaji sekolah, komposisi komponen tunjangan, arus pemotongan, dan riwayat evaluasi lintas periode.
          </p>
        </div>
        <div className="flex items-center gap-2 relative z-10 w-full md:w-auto justify-end no-print">
          <button 
            type="button" 
            onClick={() => window.print()}
            className="flex-1 md:flex-initial bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/20 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <Printer size={16} /> <span>Cetak Laporan</span>
          </button>
        </div>
        <BarChart3 size={140} className="absolute -right-8 -bottom-8 text-white/5 transform rotate-12 pointer-events-none hidden sm:block" />
      </div>

      <div id="printable-report" className="space-y-6">
        
        {/* RINGKASAN METRIK FINANSIAL KUNCI */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Gaji Kotor</span>
            <span className="text-lg sm:text-xl font-black text-slate-800 dark:text-slate-100 mt-1 block truncate">
              {formatRp(reportData.totalKotor)}
            </span>
            <span className="text-[10px] text-slate-500 mt-0.5 block">{activeTeachers.length} Pegawai Aktif</span>
          </div>

          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
            <span className="text-[11px] font-bold text-rose-500 uppercase tracking-wider block">Total Pemotongan</span>
            <span className="text-lg sm:text-xl font-black text-rose-600 dark:text-rose-400 mt-1 block truncate">
              -{formatRp(reportData.totalPotongan)}
            </span>
            <span className="text-[10px] text-slate-500 mt-0.5 block">{reportData.guruTerpotongCount} Pegawai Terdampak</span>
          </div>

          <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/60 shadow-xs">
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Total THP Bersih</span>
            <span className="text-lg sm:text-xl font-black text-emerald-700 dark:text-emerald-300 mt-1 block truncate">
              {formatRp(reportData.totalBersih)}
            </span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-500 mt-0.5 block">Realisasi Ditransfer</span>
          </div>

          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Rata-Rata per Guru</span>
            <span className="text-lg sm:text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1 block truncate">
              {formatRp(reportData.rataRata)}
            </span>
            <span className="text-[10px] text-slate-500 mt-0.5 block">Berdasarkan THP Bersih</span>
          </div>
        </div>

        {/* 🪄 1. KOMPOSISI KOMPONEN GAJI: 8 PILAR RINCIAN LENGKAP */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-700 overflow-hidden print:break-inside-avoid">
          {/* Header Komposisi */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="text-sm sm:text-base font-bold dark:text-white flex items-center gap-2">
                <PieChartIcon size={18} className="text-indigo-600 dark:text-indigo-400"/> Komposisi Komponen Gaji (8 Komponen Lengkap)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Pembedahan transparan setiap tunjangan dan insentif pembentuk total gaji kotor.</p>
            </div>

            {/* Toggle Tampilan: Visual vs Tabel */}
            <div className="flex items-center p-1 bg-slate-200/80 dark:bg-slate-700/60 rounded-xl shadow-inner border border-slate-300/60 dark:border-slate-600 no-print">
              <button
                type="button"
                onClick={() => setKomposisiView('visual')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  komposisiView === 'visual'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                <PieChartIcon size={13} /> Visual Grafik
              </button>
              <button
                type="button"
                onClick={() => setKomposisiView('tabel')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  komposisiView === 'tabel'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                <Table size={13} /> Tabel Rincian
              </button>
            </div>
          </div>

          {/* Tampilan Visual (Chart + 8 Komponen Grid) */}
          {komposisiView === 'visual' ? (
            <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              {/* Kolom Kiri: 8 Komponen Grid Card */}
              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {reportData.komposisi.map((item, idx) => (
                  <div key={idx} className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-100 dark:border-slate-700/60 flex flex-col justify-between hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
                    <div>
                      <div className="flex justify-between items-start gap-1 mb-1">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight">{item.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-extrabold border border-slate-200 dark:border-slate-700 shrink-0">
                          {item.persentase}%
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 line-clamp-1 mb-2">{item.desc}</p>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] text-slate-500">Penerima: <strong className="text-slate-700 dark:text-slate-300">{item.count} Orang</strong></span>
                        <span className={`text-xs font-black ${item.textClass}`}>{formatRp(item.value)}</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                        <div className={`${item.bg} h-full rounded-full transition-all duration-500`} style={{ width: `${item.persentase}%` }}></div>
                      </div>
                      {item.count > 0 && (
                        <span className="text-[9px] text-slate-400 block text-right mt-1">Rata-rata: {formatRp(item.rataRata)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Kolom Kanan: Donut Chart Komprehensif */}
              <div className="lg:col-span-5 flex flex-col items-center justify-center p-2">
                <div className="relative w-56 h-56 sm:w-64 sm:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={reportData.komposisiChart}
                        cx="50%" cy="50%"
                        innerRadius={65} outerRadius={92}
                        paddingAngle={2.5} dataKey="value"
                        nameKey="name"
                      >
                        {reportData.komposisiChart.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.hex} stroke="none" />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<CustomPieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  
                  {/* Center Stat Inside Donut */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center p-2">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Total Gaji Kotor</span>
                    <span className="text-base sm:text-lg font-black text-slate-800 dark:text-white mt-0.5">{formatRp(reportData.totalKotor)}</span>
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">{activeTeachers.length} Pegawai</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 text-center mt-3">Arahkan kursor ke grafik untuk melihat rincian per komponen</p>
              </div>
            </div>
          ) : (
            /* Tampilan Tabel Rincian Lengkap */
            <div className="overflow-x-auto p-4 sm:p-6">
              <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                    <th className="p-3 font-bold text-center w-12">No</th>
                    <th className="p-3 font-bold">Komponen Gaji</th>
                    <th className="p-3 font-bold">Dasar Penilaian / Keterangan</th>
                    <th className="p-3 font-bold text-center">Jumlah Penerima</th>
                    <th className="p-3 font-bold text-right">Rata-rata per Guru</th>
                    <th className="p-3 font-bold text-right">Total Anggaran</th>
                    <th className="p-3 font-bold text-right w-24">Porsi (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium">
                  {reportData.komposisi.map((item, idx) => (
                    <tr key={item.key} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors">
                      <td className="p-3 text-center text-slate-400">{idx + 1}</td>
                      <td className="p-3 font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${item.bg} shrink-0`}></span>
                        <span>{item.name}</span>
                      </td>
                      <td className="p-3 text-slate-500 text-[11px]">{item.desc}</td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px]">
                          {item.count} dari {activeTeachers.length} Guru
                        </span>
                      </td>
                      <td className="p-3 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {item.count > 0 ? formatRp(item.rataRata) : '-'}
                      </td>
                      <td className={`p-3 text-right font-black ${item.textClass}`}>
                        {formatRp(item.value)}
                      </td>
                      <td className="p-3 text-right font-black text-slate-700 dark:text-slate-200">
                        {item.persentase}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-100 dark:bg-slate-900 font-bold border-t-2 border-slate-300 dark:border-slate-600">
                  <tr>
                    <td colSpan="5" className="p-3 text-right uppercase tracking-wider text-slate-700 dark:text-slate-300 font-black">
                      Total Akumulasi Gaji Kotor:
                    </td>
                    <td className="p-3 text-right font-black text-sm text-indigo-700 dark:text-indigo-400">
                      {formatRp(reportData.totalKotor)}
                    </td>
                    <td className="p-3 text-right font-black text-slate-800 dark:text-slate-200">
                      100%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* 🪄 2. PEMBEDAHAN ARUS PEMOTONGAN & RIWAYAT LINTAS BULAN */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-700 overflow-hidden print:break-inside-avoid">
          {/* Header Section */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-xl">
                <Trash2 size={18} />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold dark:text-white">Pembedahan Arus Pemotongan & Riwayat Evaluasi</h3>
                <p className="text-xs text-slate-500 mt-0.5">Analisis denda kedisiplinan dan pelunasan pinjaman kasbon setiap bulannya.</p>
              </div>
            </div>

            {/* Sub-Tab Switcher */}
            <div className="flex items-center p-1 bg-slate-200/80 dark:bg-slate-700/60 rounded-xl shadow-inner border border-slate-300/60 dark:border-slate-600 no-print">
              <button
                type="button"
                onClick={() => setPotonganTab('berjalan')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  potonganTab === 'berjalan'
                    ? 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                <Activity size={13} /> Periode Berjalan
              </button>
              <button
                type="button"
                onClick={() => setPotonganTab('riwayat')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  potonganTab === 'riwayat'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                <History size={13} /> Riwayat Lintas Bulan
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 font-extrabold ml-1">
                  {monthlyDeductions.length}
                </span>
              </button>
            </div>
          </div>

          {/* Konten Tab 1: Periode Berjalan */}
          {potonganTab === 'berjalan' ? (
            <div className="p-4 sm:p-6">
              {reportData.totalPotongan > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  <div className="space-y-4">
                    {reportData.pembedahanPotongan.map((item, idx) => (
                      <div key={idx} className="bg-slate-50 dark:bg-slate-900/40 p-3.5 rounded-xl border border-slate-100 dark:border-slate-700">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">{item.name}</span>
                          <span className={`text-xs sm:text-sm font-black ${item.textClass}`}>-{formatRp(item.value)}</span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
                          <div className={`${item.color} h-full rounded-full transition-all duration-700`} style={{ width: `${item.persentase}%` }}></div>
                        </div>
                        <p className="text-[10px] sm:text-xs text-slate-400 text-right mt-1 font-semibold">{item.persentase}% dari total potongan</p>
                      </div>
                    ))}
                  </div>

                  {/* Kartu Analitik Periode Berjalan */}
                  <div className="grid grid-cols-2 gap-3 bg-rose-50/40 dark:bg-rose-950/20 p-4 rounded-xl border border-rose-100 dark:border-rose-900/40">
                    <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-rose-100 dark:border-rose-800/40">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Potongan</span>
                      <span className="text-base sm:text-lg font-black text-rose-600 dark:text-rose-400 mt-0.5 block truncate">
                        -{formatRp(reportData.totalPotongan)}
                      </span>
                    </div>

                    <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-rose-100 dark:border-rose-800/40">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Beban dari Gaji Kotor</span>
                      <span className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200 mt-0.5 block">
                        {reportData.totalKotor > 0 ? ((reportData.totalPotongan / reportData.totalKotor) * 100).toFixed(1) : 0}%
                      </span>
                    </div>

                    <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-rose-100 dark:border-rose-800/40">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Denda Terlambat</span>
                      <span className="text-sm font-bold text-red-600 dark:text-red-400 mt-0.5 block truncate">
                        {formatRp(reportData.potongTelat)}
                      </span>
                    </div>

                    <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-rose-100 dark:border-rose-800/40">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Angsuran Pinjaman</span>
                      <span className="text-sm font-bold text-orange-600 dark:text-orange-400 mt-0.5 block truncate">
                        {formatRp(reportData.potongKasbon)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-8">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500 flex items-center justify-center mb-3">
                    <CheckCircle size={32}/>
                  </div>
                  <p className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-0.5">Kedisiplinan Sempurna!</p>
                  <p className="text-xs text-slate-500 max-w-sm">Tidak ada pemotongan denda kedisiplinan maupun pinjaman kasbon pada periode {bulan}.</p>
                </div>
              )}
            </div>
          ) : (
            /* Konten Tab 2: Riwayat Lintas Bulan (Monitoring & Evaluasi) */
            <div className="p-4 sm:p-6 space-y-6">
              
              {/* Statistik Ringkasan Evaluasi */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Periode Dipantau</span>
                  <span className="text-lg sm:text-xl font-black text-slate-800 dark:text-slate-200 mt-0.5 block">
                    {deductionHistoryMetrics.totalBulan} <span className="text-xs font-normal text-slate-400">Bulan</span>
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Rata-Rata Potongan</span>
                  <span className="text-base sm:text-lg font-black text-rose-600 dark:text-rose-400 mt-0.5 block truncate">
                    {formatRp(deductionHistoryMetrics.avgMonthlyPotongan)} <span className="text-xs font-normal text-slate-400">/bln</span>
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider block">Akumulasi Denda Telat</span>
                  <span className="text-base sm:text-lg font-black text-red-600 dark:text-red-400 mt-0.5 block truncate">
                    {formatRp(deductionHistoryMetrics.totalTelatAll)}
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-bold text-orange-500 uppercase tracking-wider block">Akumulasi Kasbon Lunas</span>
                  <span className="text-base sm:text-lg font-black text-orange-600 dark:text-orange-400 mt-0.5 block truncate">
                    {formatRp(deductionHistoryMetrics.totalKasbonAll)}
                  </span>
                </div>
              </div>

              {/* Grafik Tren Pemotongan Bulanan */}
              {monthlyDeductions.length > 1 && (
                <div className="bg-slate-50/60 dark:bg-slate-900/30 p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-1.5">
                    <TrendingUp size={14} className="text-indigo-500" /> Komparasi Visual Tren Pemotongan Tiap Bulan
                  </h4>
                  <div className="w-full h-56 sm:h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyDeductions} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.6} />
                        <XAxis dataKey="periode" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(val) => `${val / 1000}k`} />
                        <RechartsTooltip formatter={(val, name) => [formatRp(val), name === 'potongTelat' ? 'Denda Terlambat' : name === 'potongKasbon' ? 'Pinjaman / Kasbon' : 'Total']} />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                        <Bar dataKey="potongTelat" name="Denda Terlambat" fill="#EF4444" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="potongKasbon" name="Pinjaman / Kasbon" fill="#F97316" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Tabel Riwayat Lintas Bulan */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-900/90 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                      <th className="p-3 font-bold">Periode / Bulan</th>
                      <th className="p-3 font-bold text-right text-red-600 dark:text-red-400">Denda Kedisiplinan</th>
                      <th className="p-3 font-bold text-right text-orange-600 dark:text-orange-400">Kasbon / Pinjaman</th>
                      <th className="p-3 font-bold text-right">Total Pemotongan</th>
                      <th className="p-3 font-bold text-center">Pegawai Terdampak</th>
                      <th className="p-3 font-bold text-center">Monitoring & Evaluasi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium">
                    {monthlyDeductions.map((m) => (
                      <tr key={m.id} className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${m.isCurrent ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''}`}>
                        <td className="p-3 font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <span>{m.periode}</span>
                          {m.isCurrent && (
                            <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded-md bg-amber-200 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 uppercase">
                              Berjalan
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right font-semibold text-red-600 dark:text-red-400">
                          {m.potongTelat > 0 ? `-${formatRp(m.potongTelat)}` : '-'}
                        </td>
                        <td className="p-3 text-right font-semibold text-orange-600 dark:text-orange-400">
                          {m.potongKasbon > 0 ? `-${formatRp(m.potongKasbon)}` : '-'}
                        </td>
                        <td className="p-3 text-right font-black text-rose-700 dark:text-rose-400">
                          {m.totalPotongan > 0 ? `-${formatRp(m.totalPotongan)}` : 'Rp 0'}
                        </td>
                        <td className="p-3 text-center text-slate-500">
                          {m.affectedCount > 0 ? `${m.affectedCount} dari ${m.totalPegawai} Guru` : '0 (Tertib)'}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-block ${m.evalColor}`}>
                            {m.evalStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 dark:bg-slate-900 font-bold border-t-2 border-slate-300 dark:border-slate-600">
                    <tr>
                      <td className="p-3 font-black text-slate-800 dark:text-slate-200 uppercase">
                        Total Seluruh Periode:
                      </td>
                      <td className="p-3 text-right font-black text-red-600 dark:text-red-400">
                        -{formatRp(deductionHistoryMetrics.totalTelatAll)}
                      </td>
                      <td className="p-3 text-right font-black text-orange-600 dark:text-orange-400">
                        -{formatRp(deductionHistoryMetrics.totalKasbonAll)}
                      </td>
                      <td className="p-3 text-right font-black text-rose-700 dark:text-rose-400">
                        -{formatRp(deductionHistoryMetrics.grandTotalPotongan)}
                      </td>
                      <td colSpan="2" className="p-3 text-center text-[11px] text-slate-400">
                        Akumulasi pemotongan dari {deductionHistoryMetrics.totalBulan} periode tercatat
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* 3. ALOKASI BERDASARKAN STATUS PEGAWAI */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-700 p-4 sm:p-6 print:break-inside-avoid">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
              <Users size={18}/>
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-800 dark:text-white">Alokasi Gaji Berdasarkan Status Pegawai</h3>
              <p className="text-xs text-slate-500 mt-0.5">Proporsi anggaran gaji antara Pegawai Tetap dan Pegawai Tidak Tetap / Kontrak / Honor.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reportData.distribusiStatus.map((item, idx) => (
              <div key={idx} className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">{item.name}</span>
                  <span className={`text-xs sm:text-sm font-black ${item.textClass}`}>{formatRp(item.value)}</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
                  <div className={`${item.color} h-full rounded-full transition-all duration-700`} style={{ width: `${item.persentase}%` }}></div>
                </div>
                <p className="text-[10px] sm:text-xs text-slate-400 text-right mt-1.5 font-bold">{item.persentase}% dari Total Pengeluaran Bersih</p>
              </div>
            ))}
          </div>
        </div>

        {/* 4. SUMBER ALOKASI DANA GAJI */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-700 overflow-hidden print:break-inside-avoid">
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
            <h3 className="text-xs sm:text-base font-bold dark:text-white flex items-center gap-2">
              <Wallet size={18} className="text-emerald-500" /> Sumber Alokasi Dana Penggajian
            </h3>
            <button onClick={handleOpenEdit} className="no-print text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/40 dark:hover:bg-indigo-900/60 dark:text-indigo-300 px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-colors cursor-pointer">
              <Edit size={13} /> Atur Sumber Dana
            </button>
          </div>
          <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
             <div className="space-y-3.5">
               {reportData.sumberDana.map((sumber, idx) => (
                 <div key={idx} className="bg-slate-50 dark:bg-slate-900/30 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                   <div className="flex justify-between items-center mb-1">
                     <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">{sumber.nama}</span>
                     <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-white">{formatRp(sumber.nominal)}</span>
                   </div>
                   <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                     <div className={`${sumber.warna} h-full rounded-full`} style={{ width: `${sumber.persentase}%` }}></div>
                   </div>
                   <p className="text-[10px] text-slate-400 text-right mt-1 font-medium">{sumber.persentase}% dari total anggaran</p>
                 </div>
               ))}
             </div>
             <div className="flex justify-center">
                 <div className="relative w-48 h-48 sm:w-60 sm:h-60">
                     <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={reportData.sumberDana}
                            cx="50%" cy="50%"
                            innerRadius={55} outerRadius={80}
                            paddingAngle={3} dataKey="nominal"
                            nameKey="nama"
                          >
                            {reportData.sumberDana.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.hex} stroke="none" />
                            ))}
                          </Pie>
                          <RechartsTooltip formatter={(value) => formatRp(value)} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                         <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Dana</span>
                         <span className="text-sm sm:text-base font-extrabold text-slate-800 dark:text-white">{formatRp(reportData.totalPendanaan)}</span>
                      </div>
                 </div>
             </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default LaporanView;
