import React, { useState, useMemo } from 'react';
import { 
  Settings, X, Trash, PlusCircle, Save, BarChart3, 
  Calendar, Printer, Download, History, TrendingUp, 
  Activity, Users, Trash2, CheckCircle, PieChart as PieChartIcon, 
  Wallet, Edit 
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts';
import { 
  formatRp, getFormattedPeriod, calculatePayroll, COLORS, 
  exportToPDF, generateUniqueId, isTeacherActive 
} from '../../utils/payrollUtils';

// --- LAPORAN VIEW ---
function LaporanView({ teachers, fundingSources, setFundingSources, settings }) {
  const bulan = getFormattedPeriod(settings?.payrollPeriod);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [tempFunding, setTempFunding] = useState([]);
  
  // FITUR BARU: State untuk Micro-Interaction Tombol Simpan
  const [isSaving, setIsSaving] = useState(false);
  
  // TAMBAHAN NO 3: State Loading PDF
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
    setIsSaving(true); // Mulai loading visual
    setTimeout(() => {
      setFundingSources(tempFunding);
      setIsSaving(false);
      setIsEditModalOpen(false);
    }, 600);
  };

  const PIE_COLORS_MAPPING = [
    { hex: '#8b5cf6', bg: 'bg-violet-500' },
    { hex: '#0ea5e9', bg: 'bg-sky-500' },
    { hex: '#10b981', bg: 'bg-emerald-500' },
    { hex: '#f59e0b', bg: 'bg-amber-500' },
    { hex: '#f43f5e', bg: 'bg-rose-500' }
  ];

  const activeTeachers = useMemo(() => (teachers || []).filter(isTeacherActive), [teachers]);

  const reportData = useMemo(() => {
    let totalKotor = 0, totalPotongan = 0, totalBersih = 0;
    let sumMasaKerja = 0, sumJabatan = 0, sumPendidikan = 0, sumKompetensi = 0, sumLainnya = 0;
    
    // TAMBAHAN: Variabel untuk Metrik Analisis Baru
    let costTetap = 0, costTidakTetap = 0;
    let potongTelat = 0, potongKasbon = 0;

    activeTeachers.forEach(t => {
      const slip = calculatePayroll(t, settings);
      totalKotor += slip.totalKotor;
      totalPotongan += slip.totalPotongan;
      totalBersih += slip.totalBersih;

      sumMasaKerja += slip.tMasaKerja;
      sumJabatan += slip.tJabatan;
      sumPendidikan += slip.tPendidikan;
      sumKompetensi += slip.tKompetensi;
      sumLainnya += (slip.tKeluarga + slip.tTambahan + slip.bonusHadir + slip.tMengajar);

      // Kalkulasi Distribusi Status
      if (t.status === 'Tetap') costTetap += slip.totalBersih;
      else costTidakTetap += slip.totalBersih;

      // Kalkulasi Pembedahan Potongan
      potongTelat += slip.potongTelat;
      potongKasbon += slip.tPotonganLainnya;
    });

    // 🪄 LOGIKA BARU: Total Sebelum Perbaikan dihitung mutlak berdasarkan akumulasi selisih dari Audit Log
    const selisihManual = (settings.auditLogs || []).reduce((sum, log) => {
        // Gunakan selisih Total Kotor jika ada (data baru), jika tidak gunakan selisih THP (data lama)
        const diff = log.newTotalKotor !== undefined 
            ? (Number(log.newTotalKotor) - Number(log.oldTotalKotor)) 
            : (Number(log.newTotal) - Number(log.oldTotal));
        return sum + diff;
    }, 0);
    
    // Total Sebelum Perbaikan = Total Saat Ini - Total Perubahan di Riwayat
    const totalKotorDefault = totalKotor - selisihManual;

    const totalKomposisi = sumMasaKerja + sumJabatan + sumPendidikan + sumKompetensi + sumLainnya;
    const komposisiRaw = [
      { name: 'Masa Kerja', value: sumMasaKerja },
      { name: 'Jabatan', value: sumJabatan },
      { name: 'Pendidikan', value: sumPendidikan },
      { name: 'Kompetensi', value: sumKompetensi },
      { name: 'Lainnya (Keluarga, Bonus, dll)', value: sumLainnya },
    ].filter(item => item.value > 0);

    const komposisi = komposisiRaw.map((item, index) => {
      const colorObj = PIE_COLORS_MAPPING[index % PIE_COLORS_MAPPING.length];
      return {
        ...item,
        persentase: totalKomposisi > 0 ? ((item.value / totalKomposisi) * 100).toFixed(1) : 0,
        hex: colorObj.hex,
        warna: colorObj.bg
      };
    });

    // Format Data Distribusi Status
    const totalStatusCost = costTetap + costTidakTetap;
    const distribusiStatus = [
      { name: 'Pegawai Tetap', value: costTetap, persentase: totalStatusCost > 0 ? ((costTetap / totalStatusCost) * 100).toFixed(1) : 0, color: 'bg-emerald-500', textClass: 'text-emerald-600 dark:text-emerald-400' },
      { name: 'Pegawai Tidak Tetap', value: costTidakTetap, persentase: totalStatusCost > 0 ? ((costTidakTetap / totalStatusCost) * 100).toFixed(1) : 0, color: 'bg-amber-500', textClass: 'text-amber-600 dark:text-amber-400' }
    ];

    // Format Data Pemotongan Gaji
    const totalPotonganDetail = potongTelat + potongKasbon;
    const pembedahanPotongan = [
      { name: 'Denda Kedisiplinan (Terlambat)', value: potongTelat, persentase: totalPotonganDetail > 0 ? ((potongTelat / totalPotonganDetail) * 100).toFixed(1) : 0, color: 'bg-red-500', textClass: 'text-red-600 dark:text-red-400' },
      { name: 'Pinjaman / Kasbon / Lainnya', value: potongKasbon, persentase: totalPotonganDetail > 0 ? ((potongKasbon / totalPotonganDetail) * 100).toFixed(1) : 0, color: 'bg-orange-500', textClass: 'text-orange-600 dark:text-orange-400' }
    ];

    const totalPendanaan = fundingSources.reduce((sum, item) => sum + Number(item.nominal), 0);
    const sumberDana = fundingSources.map(item => ({
      ...item,
      persentase: totalPendanaan > 0 ? ((item.nominal / totalPendanaan) * 100).toFixed(1) : 0
    }));

    return {
      totalKotor, totalPotongan, totalBersih,
      rataRata: teachers.length > 0 ? totalBersih / teachers.length : 0,
      komposisi,
      distribusiStatus,
      pembedahanPotongan,
      sumberDana,
      totalPendanaan,
      totalKotorDefault,
      selisihManual
    };
  }, [teachers, fundingSources]);

  const CustomPieTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{payload[0].name}</p>
          <p className="text-sm text-indigo-600 dark:text-indigo-400">{formatRp(payload[0].value)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full relative">
      
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
                  <div key={item.id} className="flex flex-col sm:flex-row items-center gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="flex-1 w-full">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Nama Sumber Dana</span>
                      <input 
                        type="text" 
                        value={item.nama} onChange={e => handleUpdateFunding(idx, 'nama', e.target.value)}
                        placeholder="Cth: SPP Siswa..."
                        className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                      />
                    </div>
                    <div className="w-full sm:w-48">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Nominal (Rp)</span>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-slate-400 font-medium">Rp</span>
                        <input 
                          type="number" min="0" 
                          value={item.nominal} onChange={e => handleUpdateFunding(idx, 'nominal', Number(e.target.value))}
                          className="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm font-bold text-indigo-600 dark:text-indigo-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                    </div>
                    <button onClick={() => handleRemoveFunding(idx)} className="mt-4 sm:mt-5 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors w-full sm:w-auto flex justify-center">
                      <Trash size={18} />
                    </button>
                  </div>
                ))}
              </div>

              <button onClick={handleAddFunding} className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 border-2 border-dashed border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl text-sm font-bold transition-colors">
                <PlusCircle size={18} /> Tambah Sumber Dana Baru
              </button>
            </div>

            <div className="p-5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-between items-center shrink-0">
              <div className="text-sm">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Total Diinput: </span>
                <span className={`font-bold text-lg ${totalTempNominal >= reportData.totalKotor ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {formatRp(totalTempNominal)}
                </span>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setIsEditModalOpen(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors">
                  Batal
                </button>
                <button 
                  onClick={handleSaveFunding} 
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={16} />}
                  {isSaving ? 'Menyimpan...' : 'Simpan Data'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header Laporan */}
      <div className="bg-gradient-to-br from-indigo-800 via-indigo-600 to-purple-700 rounded-2xl p-3.5 sm:p-6 md:p-8 text-white shadow-xl relative flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-6 shrink-0 no-print mb-3 sm:mb-6">
        {/* TAMBAHAN: Wrapper Background Khusus agar elemen yang membesar saat hover tidak terpotong (clipped) */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
           {/* Dekorasi Background */}
           <div className="absolute -right-10 -top-24 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
           <div className="absolute right-40 -bottom-24 w-48 h-48 bg-purple-500/30 rounded-full blur-2xl pointer-events-none"></div>
        </div>

        <div className="relative z-10">
          <h1 className="text-lg sm:text-2xl md:text-3xl font-bold mb-1 sm:mb-2 tracking-tight flex items-center gap-2 sm:gap-3">
            <BarChart3 className="text-indigo-300" size={24} /> Laporan &amp; Analitik Penggajian
          </h1>
          <p className="text-indigo-100 opacity-90 max-w-xl text-xs sm:text-sm md:text-base leading-relaxed">
            Analisis menyeluruh tentang distribusi komponen gaji, perbandingan status pegawai, dan ringkasan finansial periode ini.
          </p>
        </div>
        <div className="relative z-10 flex flex-wrap sm:flex-nowrap gap-2 sm:gap-3 w-full md:w-auto">
           <div className="flex-1 sm:flex-none flex items-center gap-2.5 sm:gap-3 bg-white/10 p-2 sm:p-3 rounded-xl backdrop-blur-md border border-white/20 shadow-inner">
             <div className="bg-indigo-500/50 p-1.5 sm:p-2 rounded-lg">
               <Calendar size={18} className="text-indigo-50" />
             </div>
             <div className="pr-1 sm:pr-2">
               <div className="text-[9px] sm:text-[10px] text-indigo-200 uppercase tracking-wider font-semibold mb-0.5">Periode Laporan</div>
               <div className="text-xs sm:text-base font-bold whitespace-nowrap">{bulan}</div>
             </div>
           </div>
           {/* TAMBAHAN: Tombol Ekspor PDF yang Terintegrasi di Header */}
           <div className="flex gap-1.5 sm:gap-2 w-full sm:w-auto">
             <button onClick={() => window.print()} className="flex-1 sm:flex-none bg-white/20 hover:bg-white/30 text-white backdrop-blur-md border border-white/30 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors flex flex-row sm:flex-col items-center justify-center gap-1 shadow-lg cursor-pointer hover:-translate-y-0.5">
                <Printer size={16} />
                <span>Cetak</span>
             </button>
             <button 
               onClick={async () => {
                 setIsExportingPDF(true);
                 try {
                   await exportToPDF('laporan-printable-area', `Laporan_Eksekutif_Gaji_${bulan.replace(/\s+/g, '_')}.pdf`);
                 } finally {
                   setIsExportingPDF(false);
                 }
               }} 
               disabled={isExportingPDF}
               className="flex-1 sm:flex-none bg-white text-indigo-700 hover:bg-indigo-50 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-extrabold transition-transform hover:-translate-y-0.5 shadow-lg cursor-pointer flex flex-row sm:flex-col items-center justify-center gap-1 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0"
             >
                {isExportingPDF ? <div className="w-4 h-4 border-2 border-indigo-700 border-t-transparent rounded-full animate-spin mb-0.5"></div> : <Download size={16} />}
                <span>{isExportingPDF ? 'Memproses...' : 'Unduh PDF'}</span>
             </button>
           </div>
        </div>
      </div>

      {/* Konten Laporan (Dibungkus dengan ID untuk target PDF html2pdf) */}
      <div id="laporan-printable-area" className="print-area w-full pb-10 px-0.5 bg-transparent print:bg-white">
        
        {/* Header Print Only */}
        <div className="print-only text-center border-b-2 border-slate-800 pb-4 mb-6 pt-4">
          <h1 className="text-2xl font-bold uppercase tracking-wider text-slate-900">Laporan Eksekutif Penggajian Sekolah</h1>
          <p className="text-sm text-slate-600 font-medium mt-1">Periode Pencairan: {bulan}</p>
        </div>

        {/* 4 Kartu Metrik Ringkasan */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 md:gap-5 mb-3 sm:mb-6">
          <div className="bg-white dark:bg-slate-800 p-3 sm:p-5 rounded-xl shadow-xs border border-slate-200 dark:border-slate-700 flex flex-col justify-center">
            <p className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 sm:mb-1">Total Gaji Kotor</p>
            <h4 className="text-base sm:text-2xl font-extrabold text-slate-800 dark:text-white">{formatRp(reportData.totalKotor)}</h4>
          </div>
          <div className="bg-white dark:bg-slate-800 p-3 sm:p-5 rounded-xl shadow-xs border border-slate-200 dark:border-slate-700 flex flex-col justify-center">
            <p className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 sm:mb-1">Total Potongan</p>
            <h4 className="text-base sm:text-2xl font-extrabold text-red-600 dark:text-red-400">-{formatRp(reportData.totalPotongan)}</h4>
          </div>
          <div className="bg-white dark:bg-slate-800 p-3 sm:p-5 rounded-xl shadow-xs border border-emerald-500 dark:border-emerald-500/50 flex flex-col justify-center relative overflow-hidden">
            <p className="text-[10px] sm:text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-0.5 sm:mb-1 relative z-10">Total Gaji Bersih (THP)</p>
            <h4 className="text-base sm:text-2xl font-extrabold text-emerald-700 dark:text-emerald-300 relative z-10">{formatRp(reportData.totalBersih)}</h4>
            <div className="absolute -right-4 -bottom-4 bg-emerald-100 dark:bg-emerald-900/30 w-20 h-20 rounded-full blur-xl"></div>
          </div>
          <div className="bg-white dark:bg-slate-800 p-3 sm:p-5 rounded-xl shadow-xs border border-slate-200 dark:border-slate-700 flex flex-col justify-center">
            <p className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 sm:mb-1">Rata-Rata THP Pegawai</p>
            <h4 className="text-base sm:text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">{formatRp(reportData.rataRata)}</h4>
          </div>
        </div>

        {/* TAMBAHAN BARU: Dampak Penyesuaian Manual (Sistem vs Edit Manual) */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xs border border-slate-200 dark:border-slate-700 overflow-hidden mb-3 sm:mb-6 print:break-inside-avoid animate-in fade-in zoom-in-95">
          <div className="p-3 sm:p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
            <h3 className="text-xs sm:text-base font-bold dark:text-white flex items-center gap-1.5 sm:gap-2">
              <History size={16} className="text-amber-500"/> Riwayat Perbandingan Total Gaji Kotor
            </h3>
          </div>
          <div className="p-3 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-6">
             <div className="flex flex-col items-center justify-center p-3 sm:p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner">
                <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 sm:mb-2 text-center">Total Sebelum Perbaikan</span>
                <span className="text-base sm:text-2xl font-black text-slate-800 dark:text-slate-200">{formatRp(reportData.totalKotorDefault)}</span>
             </div>
             
             <div className="flex flex-col items-center justify-center">
                <div className="flex items-center justify-center w-full">
                   <div className="h-px flex-1 bg-slate-300 dark:bg-slate-600 hidden sm:block"></div>
                   <div className={`px-3 sm:px-4 py-1.5 sm:py-2 mx-1 sm:mx-2 rounded-full border text-[11px] sm:text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shadow-xs ${reportData.selisihManual > 0 ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400' : reportData.selisihManual < 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400' : 'bg-slate-100 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'}`}>
                      {reportData.selisihManual > 0 ? <TrendingUp size={13}/> : reportData.selisihManual < 0 ? <TrendingUp size={13} className="rotate-180"/> : <Activity size={13}/>}
                      {reportData.selisihManual > 0 ? `+${formatRp(reportData.selisihManual)} (Beban Naik)` : reportData.selisihManual < 0 ? `${formatRp(reportData.selisihManual)} (Beban Turun)` : 'Tidak Ada Perubahan'}
                   </div>
                   <div className="h-px flex-1 bg-slate-300 dark:bg-slate-600 hidden sm:block"></div>
                </div>
                <p className="text-[9px] sm:text-[10px] text-slate-400 text-center mt-2 sm:mt-3 max-w-[250px]">Akumulasi dampak selisih dari riwayat perbaikan/perubahan data yang dilakukan oleh Admin di menu Kelola Gaji.</p>
             </div>

             <div className="flex flex-col items-center justify-center p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800/50 shadow-inner">
                <span className="text-[10px] sm:text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1 sm:mb-2 text-center">Total Setelah Perbaikan</span>
                <span className="text-base sm:text-2xl font-black text-blue-700 dark:text-blue-300">{formatRp(reportData.totalKotor)}</span>
             </div>
          </div>
        </div>

        {/* TAMBAHAN: Analisis Distribusi Anggaran & Beban Potongan */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6 mb-3 sm:mb-6 print:break-inside-avoid">
          {/* Panel Distribusi Status */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xs border border-slate-200 dark:border-slate-700 p-3.5 sm:p-6 flex flex-col">
             <div className="flex items-center gap-2 mb-3.5 sm:mb-6">
                <div className="p-1.5 sm:p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg"><Users size={16}/></div>
                <h3 className="font-bold text-xs sm:text-base text-slate-800 dark:text-white">Alokasi Gaji Berdasarkan Status</h3>
             </div>
             <div className="space-y-3.5 sm:space-y-6 flex-1 flex flex-col justify-center">
                {reportData.distribusiStatus.map((item, idx) => (
                   <div key={idx}>
                      <div className="flex justify-between items-center mb-1 sm:mb-2">
                         <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">{item.name}</span>
                         <span className={`text-xs sm:text-sm font-bold ${item.textClass}`}>{formatRp(item.value)}</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2.5 sm:h-3 flex overflow-hidden shadow-inner">
                         <div className={`${item.color} h-full rounded-full transition-all duration-1000`} style={{ width: `${item.persentase}%` }}></div>
                      </div>
                      <p className="text-[10px] sm:text-xs text-slate-500 text-right mt-1 font-medium">{item.persentase}% dari Total THP</p>
                   </div>
                ))}
             </div>
          </div>

          {/* Panel Rincian Pemotongan */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xs border border-slate-200 dark:border-slate-700 p-3.5 sm:p-6 flex flex-col">
             <div className="flex items-center gap-2 mb-3.5 sm:mb-6">
                <div className="p-1.5 sm:p-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg"><Trash2 size={16}/></div>
                <h3 className="font-bold text-xs sm:text-base text-slate-800 dark:text-white">Pembedahan Arus Pemotongan</h3>
             </div>
             {reportData.totalPotongan > 0 ? (
               <div className="space-y-3.5 sm:space-y-6 flex-1 flex flex-col justify-center">
                  {reportData.pembedahanPotongan.map((item, idx) => (
                     <div key={idx}>
                        <div className="flex justify-between items-center mb-1 sm:mb-2">
                           <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">{item.name}</span>
                           <span className={`text-xs sm:text-sm font-bold ${item.textClass}`}>-{formatRp(item.value)}</span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2.5 sm:h-3 flex overflow-hidden shadow-inner">
                           <div className={`${item.color} h-full rounded-full transition-all duration-1000`} style={{ width: `${item.persentase}%` }}></div>
                        </div>
                        <p className="text-[10px] sm:text-xs text-slate-500 text-right mt-1 font-medium">{item.persentase}% dari Total Potongan</p>
                     </div>
                  ))}
               </div>
             ) : (
               <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500 flex items-center justify-center mb-2.5 sm:mb-3">
                     <CheckCircle size={28}/>
                  </div>
                  <p className="font-bold text-xs sm:text-sm text-slate-700 dark:text-slate-300 mb-0.5">Bersih Sempurna!</p>
                  <p className="text-[11px] sm:text-xs text-slate-500">Tidak ada pemotongan kedisiplinan maupun kasbon pada periode ini.</p>
               </div>
             )}
          </div>
        </div>

        {/* Komposisi Komponen Gaji Section */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xs border border-slate-200 dark:border-slate-700 overflow-hidden mb-3 sm:mb-6 print:break-inside-avoid">
          <div className="p-3 sm:p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
            <h3 className="text-xs sm:text-base font-bold dark:text-white flex items-center gap-2">
              <PieChartIcon size={16} className="text-indigo-500"/> Komposisi Komponen Gaji
            </h3>
          </div>
          <div className="p-3.5 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8 items-center">
             <div className="space-y-3 sm:space-y-5">
               {reportData.komposisi.map((item, idx) => (
                 <div key={idx}>
                   <div className="flex justify-between items-center mb-1">
                     <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">{item.name}</span>
                     <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-white">{formatRp(item.value)}</span>
                   </div>
                   <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 sm:h-2.5 flex overflow-hidden">
                     <div className={`${item.warna} h-full rounded-full`} style={{ width: `${item.persentase}%` }}></div>
                   </div>
                   <p className="text-[10px] sm:text-xs text-slate-500 text-right mt-0.5 sm:mt-1">{item.persentase}% dari total komponen</p>
                 </div>
               ))}
             </div>
             <div className="flex justify-center">
                 <div className="relative w-48 h-48 sm:w-64 sm:h-64">
                     <ResponsiveContainer width="100%" height="100%" minWidth={160} minHeight={160}>
                        <PieChart>
                          <Pie
                            data={reportData.komposisi}
                            cx="50%" cy="50%"
                            innerRadius={55} outerRadius={80}
                            paddingAngle={3} dataKey="value"
                            nameKey="name"
                          >
                            {reportData.komposisi.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.hex} />
                            ))}
                          </Pie>
                          <RechartsTooltip formatter={(value) => formatRp(value)} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                         <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Total Gaji</span>
                         <span className="text-sm sm:text-lg font-extrabold text-slate-800 dark:text-white">{formatRp(reportData.totalKotor)}</span>
                      </div>
                 </div>
             </div>
          </div>
        </div>

        {/* Sumber Gaji Section */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xs border border-slate-200 dark:border-slate-700 overflow-hidden mb-3 sm:mb-6 print:break-inside-avoid">
          <div className="p-3 sm:p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
            <h3 className="text-xs sm:text-base font-bold dark:text-white flex items-center gap-1.5 sm:gap-2">
              <Wallet size={16} className="text-emerald-500" /> Sumber Alokasi Dana Penggajian
            </h3>
            <button onClick={handleOpenEdit} className="no-print text-xs bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/40 dark:hover:bg-indigo-900/60 dark:text-indigo-400 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg font-bold flex items-center gap-1 transition-colors">
              <Edit size={13} /> Atur Sumber Dana
            </button>
          </div>
          <div className="p-3.5 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8 items-center">
             <div className="space-y-3 sm:space-y-5">
               {reportData.sumberDana.map((sumber, idx) => (
                 <div key={idx}>
                   <div className="flex justify-between items-center mb-1">
                     <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">{sumber.nama}</span>
                     <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-white">{formatRp(sumber.nominal)}</span>
                   </div>
                   <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 sm:h-2.5 flex overflow-hidden">
                     <div className={`${sumber.warna} h-full rounded-full`} style={{ width: `${sumber.persentase}%` }}></div>
                   </div>
                   <p className="text-[10px] sm:text-xs text-slate-500 text-right mt-0.5 sm:mt-1">{sumber.persentase}% dari total pengeluaran</p>
                 </div>
               ))}
             </div>
             <div className="flex justify-center">
                 <div className="relative w-48 h-48 sm:w-64 sm:h-64">
                     <ResponsiveContainer width="100%" height="100%" minWidth={160} minHeight={160}>
                        <PieChart>
                          <Pie
                            data={reportData.sumberDana}
                            cx="50%" cy="50%"
                            innerRadius={55} outerRadius={80}
                            paddingAngle={3} dataKey="nominal"
                            nameKey="nama"
                          >
                            {reportData.sumberDana.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.hex} />
                            ))}
                          </Pie>
                          <RechartsTooltip formatter={(value) => formatRp(value)} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                         <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Total Dana</span>
                         <span className="text-sm sm:text-lg font-extrabold text-slate-800 dark:text-white">{formatRp(reportData.totalPendanaan)}</span>
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
