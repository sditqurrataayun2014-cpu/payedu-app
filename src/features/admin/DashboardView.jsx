import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  AlertCircle, Award, BarChart3, Calculator, Calendar, CheckCircle,
  ChevronRight, Clock, CreditCard, Edit, GraduationCap, HeartHandshake,
  Info, Shield, ShieldCheck, Sparkles, Trash2, Users, Wallet, X
} from 'lucide-react';

import {
  calculatePayroll, formatRp, getFormattedPeriod, isTeacherActive,
  parsePeriodToDate, safeStorageSet
} from '../../utils/payrollUtils';
import { pushCloudData as pushToSupabase } from '../../services/dbService';

export default function DashboardView({ teachers, user, settings, setSettings, archives, setActiveTab, onAbsensiAlertClick }) {
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState('Tetap');

  const [isEduModalOpen, setIsEduModalOpen] = useState(false);
  const [activeEduTab, setActiveEduTab] = useState('S1');
  
  // TAMBAHAN: State Modal & Notifikasi Custom untuk Kepala Sekolah
  const [isConfirmApproveOpen, setIsConfirmApproveOpen] = useState(false);
  const [notification, setNotification] = useState({ isOpen: false, type: '', message: '' });

  const activeTeachers = useMemo(() => (teachers || []).filter(isTeacherActive), [teachers]);

  const eduDetails = useMemo(() => {
    const grouped = { 'S2': [], 'S1': [], 'Diploma': [], 'SMA/Pondok': [] };
    activeTeachers.forEach(t => {
      if (grouped[t.education]) {
        grouped[t.education].push(t);
      }
    });
    return grouped;
  }, [activeTeachers]);

  const stats = useMemo(() => {
    let lk = 0, pr = 0, tetap = 0, tdkTetap = 0, totalGaji = 0, totalKotor = 0;
    const eduCount = { 'S2': 0, 'S1': 0, 'Diploma': 0, 'SMA/Pondok': 0 };
    const opsCount = { kebersihan: 0, security: 0, pengabdian: 0 };
    
    const listTetap = [];
    const listTidakTetap = [];

    activeTeachers.forEach(t => {
      if (t.gender === 'L') lk++; else pr++;
      
      if (t.status === 'Tetap') {
        tetap++;
        listTetap.push(t);
      } else {
        tdkTetap++;
        listTidakTetap.push(t);
      }

      if (eduCount[t.education] !== undefined) eduCount[t.education]++;
      
      const roleStr = `${t.position} ${t.payroll.jabatans?.[0]?.detail || ''}`.toLowerCase();
      if (roleStr.includes('kebersihan')) opsCount.kebersihan++;
      if (roleStr.includes('security') || roleStr.includes('satpam')) opsCount.security++;
      if (roleStr.includes('pengabdian')) opsCount.pengabdian++;

      const calc = calculatePayroll(t, settings);
      totalGaji += calc.totalBersih;
      totalKotor += calc.totalKotor;
    });

    return { 
      lk, pr, tetap, tdkTetap, eduCount, totalGaji, totalKotor, total: activeTeachers.length, 
      opsCount, listTetap, listTidakTetap 
    };
  }, [activeTeachers, settings]);

  // TAMBAHAN: Kalkulasi Metrik Peringatan (Alerts)
  const alerts = useMemo(() => {
     let lateTeachers = 0;
     let totalUnpaidLoans = 0;
     activeTeachers.forEach(t => {
        if ((t.payroll?.disiplin?.telat || 0) >= 3) lateTeachers++;
        const loans = t.payroll?.potonganLainnya?.filter(p => p.ket.toLowerCase().match(/kasbon|koperasi|pinjaman/)) || [];
        loans.forEach(l => totalUnpaidLoans += (l.sisaHutang !== undefined ? l.sisaHutang : l.nominal * 4)); 
     });
     return { lateTeachers, totalUnpaidLoans };
  }, [activeTeachers]);

  // 🪄 FIX NO 5: Menggunakan Gaji Kotor (Gross Pay) murni untuk Visualisasi Tren Pengeluaran Gaji
  const chartData = useMemo(() => {
     const currentMonthStr = getFormattedPeriod(settings?.payrollPeriod);
     
     if (!archives || !Array.isArray(archives) || archives.length === 0) {
        return [{
           bulan: currentMonthStr,
           total: stats.totalKotor,
           isCurrent: true
        }]; 
     }

     // Urutkan arsip secara kronologis kalender (Mencegah salah urut abjad dan Invalid Date)
     const sortedArchives = [...archives].sort((a, b) => {
        const pA = a.periode || a.period || '';
        const pB = b.periode || b.period || '';
        const timeA = parsePeriodToDate(pA).getTime();
        const timeB = parsePeriodToDate(pB).getTime();
        return timeA - timeB;
     });

     const historyData = sortedArchives.map(arc => {
        let totalGajiKotor = arc?.totalKotor;
        if (!totalGajiKotor && Array.isArray(arc?.dataGuru) && arc.dataGuru.length > 0) {
           totalGajiKotor = arc.dataGuru.reduce((sum, t) => sum + (calculatePayroll(t, settings).totalKotor || 0), 0);
        }
        return {
           bulan: getFormattedPeriod(arc?.periode || arc?.period),
           total: Number(totalGajiKotor || 0),
           isCurrent: false
        };
     });

     const currentPeriodCode = settings?.payrollPeriod || '';
     const currentFormatted = getFormattedPeriod(currentPeriodCode);
     const hasCurrentInArchive = sortedArchives.some(a => {
        const arcBulan = getFormattedPeriod(a?.periode || a?.period || '');
        return arcBulan === currentFormatted || (currentPeriodCode && (a?.periode || a?.period || '').includes(currentPeriodCode));
     });

     if (!hasCurrentInArchive) {
        historyData.push({
           bulan: currentMonthStr,
           total: stats.totalKotor,
           isCurrent: true
        });
     }

     return historyData.slice(-12);
  }, [archives, stats.totalKotor, settings]);

  const currentMonthYear = getFormattedPeriod(settings?.payrollPeriod);

  // PERBAIKAN: Mengganti window.confirm dengan modal custom
  const handleApprove = () => {
    setIsConfirmApproveOpen(true);
  };

  const executeApprove = () => {
    setIsConfirmApproveOpen(false);
    
    // PERBAIKAN: Paksa simpan langsung ke Local Storage dan Server agar permanen tanpa jeda
    const newSettings = { ...settings, payrollStatus: 'Approved', lastModified: Date.now() };
    setSettings(newSettings);
    safeStorageSet('payedu_settings', newSettings);
    pushToSupabase('SAVE_SETTINGS', newSettings).catch(e => console.error("Gagal simpan approval ke server:", e));
    
    setNotification({ isOpen: true, type: 'success', message: 'Berhasil! Rincian gaji bulan ini telah disahkan secara permanen.' });
  };

  return (
    <div className="space-y-4 md:space-y-5 animate-in fade-in relative pb-10">
      
      {/* TAMBAHAN: Custom Notifikasi / Toast */}
      {notification.isOpen && (
        <div className="fixed top-20 right-4 md:right-10 z-50 animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="p-4 rounded-xl shadow-xl border flex items-center gap-3 max-w-sm bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/90 dark:border-emerald-700 dark:text-emerald-200">
             <CheckCircle size={24} className="shrink-0" />
             <p className="text-sm font-medium">{notification.message}</p>
             <button onClick={() => setNotification({ isOpen: false, type: '', message: '' })} className="p-1 hover:bg-black/10 rounded-full transition-colors ml-auto"><X size={16}/></button>
          </div>
        </div>
      )}

      {/* TAMBAHAN: Modal Konfirmasi Approval Kepsek */}
      {isConfirmApproveOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center mx-auto mb-4 shadow-inner">
                <ShieldCheck size={40} />
              </div>
              <h3 className="text-xl font-bold dark:text-white mb-2">Sahkan Gaji Bulan Ini?</h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto text-sm">
                Apakah Anda yakin menyetujui rekapitulasi gaji <strong className="text-slate-700 dark:text-slate-200">{currentMonthYear}</strong>? Setelah disetujui, admin dapat menutup buku dan guru dapat melihat rincian gajinya di portal.
              </p>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-center gap-3 shrink-0">
              <button onClick={() => setIsConfirmApproveOpen(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors w-full">Batal</button>
              <button onClick={executeApprove} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-sm transition-colors w-full flex items-center justify-center gap-2">
                <CheckCircle size={18}/> Ya, Sahkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIPERBARUI: Desain Banner Dashboard Admin Dibuat Lebih Mewah & Compact Ergonomis di Mobile */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-700 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 md:p-8 text-white shadow-xl relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 sm:gap-6 mb-3 sm:mb-5">
        {/* TAMBAHAN: Wrapper Background Khusus agar overflow-hidden tidak memotong Card yang scale saat di-hover */}
        <div className="absolute inset-0 rounded-xl sm:rounded-2xl overflow-hidden pointer-events-none">
           <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 mix-blend-overlay"></div>
           {/* Ornamen Latar Belakang */}
           <div className="absolute -right-10 -top-24 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
           <div className="absolute right-32 -bottom-24 w-48 h-48 bg-indigo-500/30 rounded-full blur-2xl pointer-events-none"></div>
        </div>
        
        <div className="relative z-10">
          {/* Sapaan Personal */}
          <p className="text-blue-200 text-[11px] sm:text-xs md:text-sm font-bold mb-0.5 sm:mb-1 tracking-widest uppercase drop-shadow-md">
             {user?.role === 'Kepala Sekolah' ? 'Ruang Kendali Pimpinan' : 'Ruang Kendali Administrator'}
          </p>
          <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-black text-white tracking-tight drop-shadow-[0_0_15px_rgba(255,255,255,0.7)] mb-1 sm:mb-2 md:mb-3 leading-snug">
             Halo, {user?.role === 'Kepala Sekolah' || user?.name === 'Kepala Sekolah' ? (settings?.principalName ? `Kepala Sekolah (${settings.principalName.split(',')[0]})` : 'Kepala Sekolah') : (user?.name?.split(' ')[0] || 'User')}!
          </h1>
          <p className="text-blue-100 opacity-90 max-w-xl text-xs sm:text-sm md:text-base leading-relaxed">
            Pantau statistik kepegawaian, distribusi status guru, tingkat pendidikan, dan estimasi total pengeluaran gaji sekolah periode ini secara *real-time*.
          </p>
        </div>
        
        <div className="relative z-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full lg:w-auto mt-1 lg:mt-0">
          <div className="flex items-center gap-2.5 sm:gap-3.5 bg-white/10 p-2 sm:p-3 rounded-xl sm:rounded-2xl backdrop-blur-md border border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] w-full sm:w-auto transition-transform hover:scale-105 group relative overflow-hidden">
            <div className="bg-blue-500/50 p-2 sm:p-2.5 rounded-lg sm:rounded-xl shrink-0 shadow-inner group-hover:scale-110 transition-transform">
              <Calendar size={18} className="text-blue-50 sm:hidden" />
              <Calendar size={22} className="text-blue-50 hidden sm:block" />
            </div>
            <div className="flex flex-col">
              <div className="text-[9px] sm:text-[10px] text-blue-200 uppercase tracking-widest font-bold mb-0.5 flex items-center gap-1">
                Periode Gaji {(user?.role === 'admin' || user?.role === 'Kepala Sekolah') && <Edit size={10} className="opacity-50" />}
              </div>
              {(user?.role === 'admin' || user?.role === 'Kepala Sekolah') ? (
                <input 
                  type="month" 
                  value={settings?.payrollPeriod || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`} 
                  onChange={e => setSettings({...settings, payrollPeriod: e.target.value})}
                  className="bg-transparent text-sm sm:text-base md:text-lg font-black text-white outline-none cursor-pointer border-b border-dashed border-white/40 hover:border-white focus:border-white w-28 sm:w-36 md:w-44 transition-colors [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:invert"
                  title="Klik untuk mengubah periode penggajian"
                />
              ) : (
                <div className="text-sm sm:text-base md:text-lg font-black truncate">{currentMonthYear}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2.5 sm:gap-3.5 bg-white/10 p-2 sm:p-3.5 rounded-xl sm:rounded-2xl backdrop-blur-md border border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] w-full sm:w-auto transition-transform hover:scale-105">
            <div className="bg-emerald-500/50 p-2 sm:p-2.5 rounded-lg sm:rounded-xl shrink-0 shadow-inner">
              <Wallet size={18} className="text-emerald-50 sm:hidden" />
              <Wallet size={22} className="text-emerald-50 hidden sm:block" />
            </div>
            <div className="truncate">
              <div className="text-[9px] sm:text-[10px] text-emerald-200 uppercase tracking-widest font-bold mb-0.5">Estimasi Pengeluaran</div>
              <div className="text-sm sm:text-base md:text-lg font-black truncate">{formatRp(stats.totalKotor)}</div>
            </div>
          </div>
        </div>
      </div>

      {user?.role === 'Kepala Sekolah' && settings?.payrollStatus === 'Pending' && (
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden mb-6 flex flex-col md:flex-row items-center justify-between gap-6 border-2 border-white/20 animate-in slide-in-from-top-4">
          <div className="relative z-10 flex items-center gap-4">
             <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center shrink-0 shadow-inner">
                <ShieldCheck size={32} className="text-white drop-shadow-md" />
             </div>
             <div>
                <h2 className="text-xl md:text-2xl font-bold mb-1">Persetujuan Gaji Tertunda!</h2>
                <p className="text-amber-50 text-sm md:text-base opacity-90">Bendahara telah menyelesaikan draf rekapitulasi gaji periode <strong className="bg-white/20 px-2 py-0.5 rounded">{currentMonthYear}</strong>. Menunggu pengesahan dari Anda.</p>
             </div>
          </div>
          <div className="relative z-10 w-full md:w-auto shrink-0">
             <button onClick={handleApprove} className="w-full md:w-auto bg-white text-orange-600 hover:bg-orange-50 px-6 py-3.5 rounded-xl font-extrabold shadow-lg transition-transform hover:scale-105 flex items-center justify-center gap-2">
                <CheckCircle size={20} /> Sahkan & Setujui Gaji
             </button>
          </div>
          <div className="absolute right-0 top-0 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/3"></div>
        </div>
      )}

      {isStatusModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-bold text-lg dark:text-white flex items-center gap-2">
                <Award className="text-emerald-500" /> Detail Status Pegawai
              </h3>
              <button onClick={() => setIsStatusModalOpen(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex border-b border-slate-200 dark:border-slate-700">
              <button 
                onClick={() => setActiveModalTab('Tetap')}
                className={`flex-1 py-3 text-sm font-bold transition-colors ${activeModalTab === 'Tetap' ? 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50/50 dark:bg-emerald-900/10' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
              >
                Guru Tetap ({stats.tetap})
              </button>
              <button 
                onClick={() => setActiveModalTab('Tidak Tetap')}
                className={`flex-1 py-3 text-sm font-bold transition-colors ${activeModalTab === 'Tidak Tetap' ? 'text-amber-600 border-b-2 border-amber-600 bg-amber-50/50 dark:bg-amber-900/10' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
              >
                Tidak Tetap ({stats.tdkTetap})
              </button>
            </div>

            <div className="p-2 h-80 overflow-y-auto">
              <div className="space-y-1">
                {(activeModalTab === 'Tetap' ? stats.listTetap : stats.listTidakTetap).map(t => (
                  <div key={t.id} className="p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg flex justify-between items-center border border-transparent hover:border-slate-100 dark:hover:border-slate-700 transition-colors">
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 text-sm">{t.name}</div>
                      <div className="text-xs text-slate-500">{t.nipy} • {t.position}</div>
                    </div>
                    <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${activeModalTab === 'Tetap' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40'}`}>
                      {t.status}
                    </span>
                  </div>
                ))}
                {(activeModalTab === 'Tetap' && stats.listTetap.length === 0) && <p className="p-6 text-center text-slate-500">Belum ada data guru tetap.</p>}
                {(activeModalTab === 'Tidak Tetap' && stats.listTidakTetap.length === 0) && <p className="p-6 text-center text-slate-500">Belum ada data guru tidak tetap.</p>}
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-right">
               <button onClick={() => setIsStatusModalOpen(false)} className="px-5 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors">
                 Tutup
               </button>
            </div>
          </div>
        </div>
      )}

      {isEduModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-bold text-lg dark:text-white flex items-center gap-2">
                <GraduationCap className="text-purple-500" /> Detail Kualifikasi Pendidikan
              </h3>
              <button onClick={() => setIsEduModalOpen(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto hide-scrollbar">
              {['S2', 'S1', 'Diploma', 'SMA/Pondok'].map(lvl => (
                <button 
                  key={lvl}
                  onClick={() => setActiveEduTab(lvl)}
                  className={`flex-1 py-3 px-4 min-w-[100px] text-sm font-bold transition-colors whitespace-nowrap ${activeEduTab === lvl ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50/50 dark:bg-purple-900/10' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                >
                  {lvl === 'S2' ? 'Magister (S2)' : lvl === 'S1' ? 'Sarjana (S1)' : lvl === 'SMA/Pondok' ? 'SMA/Setara' : lvl} ({eduDetails[lvl].length})
                </button>
              ))}
            </div>

            <div className="p-2 h-80 overflow-y-auto">
              <div className="space-y-1">
                {eduDetails[activeEduTab].map(t => (
                  <div key={t.id} className="p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg flex justify-between items-center border border-transparent hover:border-slate-100 dark:hover:border-slate-700 transition-colors">
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 text-sm">{t.name}</div>
                      <div className="text-xs text-slate-500">{t.nipy} • {t.position}</div>
                    </div>
                    <span className="text-[10px] px-2.5 py-1 rounded-full font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400">
                      {t.status}
                    </span>
                  </div>
                ))}
                {eduDetails[activeEduTab].length === 0 && <p className="p-6 text-center text-slate-500">Belum ada data pegawai untuk tingkat pendidikan ini.</p>}
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-right">
               <button onClick={() => setIsEduModalOpen(false)} className="px-5 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors">
                 Tutup
               </button>
            </div>
          </div>
        </div>
      )}

      {/* PANEL JALAN PINTAS (QUICK ACTIONS) - DIPERBARUI: Tampil juga untuk Kepsek */}
      {(user?.role === 'admin' || user?.role === 'Kepala Sekolah') && (
        <div className="grid grid-cols-4 gap-1.5 sm:gap-3 mb-2.5">
          <button onClick={() => setActiveTab('dataguru')} className="bg-white dark:bg-slate-800 p-2 sm:p-3.5 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-md transition-all flex flex-col items-center justify-center gap-1 sm:gap-2 group cursor-pointer">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Users size={16} className="sm:hidden"/><Users size={20} className="hidden sm:block"/>
            </div>
            <span className="text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 text-center truncate w-full">Data Pegawai</span>
          </button>
          <button onClick={() => setActiveTab('gaji')} className="bg-white dark:bg-slate-800 p-2 sm:p-3.5 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-600 hover:shadow-md transition-all flex flex-col items-center justify-center gap-1 sm:gap-2 group cursor-pointer">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Calculator size={16} className="sm:hidden"/><Calculator size={20} className="hidden sm:block"/>
            </div>
            <span className="text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 text-center truncate w-full">Kelola Gaji</span>
          </button>
          <button onClick={() => setActiveTab('pinjaman')} className="bg-white dark:bg-slate-800 p-2 sm:p-3.5 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:border-teal-400 dark:hover:border-teal-600 hover:shadow-md transition-all flex flex-col items-center justify-center gap-1 sm:gap-2 group cursor-pointer">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <CreditCard size={16} className="sm:hidden"/><CreditCard size={20} className="hidden sm:block"/>
            </div>
            <span className="text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 text-center truncate w-full">Rekap Kasbon</span>
          </button>
          <button onClick={() => setActiveTab('rekapabsensi')} className="bg-white dark:bg-slate-800 p-2 sm:p-3.5 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:border-orange-400 dark:hover:border-orange-600 hover:shadow-md transition-all flex flex-col items-center justify-center gap-1 sm:gap-2 group cursor-pointer">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Clock size={16} className="sm:hidden"/><Clock size={20} className="hidden sm:block"/>
            </div>
            <span className="text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 text-center truncate w-full">Tarik Absen</span>
          </button>
        </div>
      )}

      {/* METRIK PERINGATAN CERDAS (SMART ALERTS) - DIPERBARUI: Tampil juga untuk Kepsek */}
      {(user?.role === 'admin' || user?.role === 'Kepala Sekolah') && (alerts.lateTeachers > 0 || alerts.totalUnpaidLoans > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3 mb-2.5">
          {alerts.lateTeachers > 0 && (
            <div onClick={onAbsensiAlertClick} className="cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-all duration-300 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl flex items-center gap-2.5 sm:gap-4 shadow-sm animate-in fade-in zoom-in-95 group">
              <div className="p-2 sm:p-2.5 bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 rounded-full shrink-0 shadow-inner group-hover:scale-110 transition-transform">
                <AlertCircle size={18} className="sm:hidden"/><AlertCircle size={20} className="hidden sm:block"/>
              </div>
              <div className="flex-1 w-full min-w-0">
                <h4 className="text-xs sm:text-sm font-bold text-rose-800 dark:text-rose-300 flex justify-between items-center">
                   Peringatan Kedisiplinan 
                   <span className="text-[9px] sm:text-[10px] bg-rose-200/50 text-rose-700 px-2 py-0.5 rounded-full flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">Tindak Lanjut <ChevronRight size={12}/></span>
                </h4>
                <p className="text-[11px] sm:text-xs text-rose-600 dark:text-rose-400 mt-0.5">Terdapat <span className="font-extrabold px-1 rounded bg-rose-200 dark:bg-rose-800 text-rose-900 dark:text-rose-100">{alerts.lateTeachers} pegawai</span> dengan keterlambatan tinggi bulan ini.</p>
              </div>
            </div>
          )}
          {alerts.totalUnpaidLoans > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl flex items-center gap-2.5 sm:gap-4 shadow-sm animate-in fade-in zoom-in-95">
              <div className="p-2 sm:p-2.5 bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 rounded-full shrink-0 shadow-inner">
                <CreditCard size={18} className="sm:hidden"/><CreditCard size={20} className="hidden sm:block"/>
              </div>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-bold text-amber-800 dark:text-amber-300">Piutang Kasbon Terbuka</h4>
                <p className="text-[11px] sm:text-xs text-amber-600 dark:text-amber-400 mt-0.5">Total dana piutang sekolah yang belum lunas: <span className="font-extrabold">{formatRp(alerts.totalUnpaidLoans)}</span>.</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3.5 md:gap-5">

        {/* Card 1: Total SDM (Desain Berwarna Premium) */}
        <div 
          onClick={() => setActiveTab('dataguru')}
          className="bg-gradient-to-br from-blue-500 to-blue-600 p-2.5 sm:p-4 md:p-6 rounded-xl sm:rounded-2xl shadow-md border-0 transition-all duration-300 flex flex-col group cursor-pointer hover:shadow-lg hover:-translate-y-1 relative overflow-hidden text-white"
        >
          <div className="absolute top-0 right-0 w-24 sm:w-32 h-24 sm:h-32 bg-white/10 rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
          <div className="absolute top-2 right-2 sm:top-4 sm:right-4 opacity-0 group-hover:opacity-100 transition-opacity text-[8px] sm:text-[10px] font-bold text-blue-700 bg-white/90 px-1.5 py-0.5 rounded z-20 shadow-sm">Kelola</div>
          <div className="flex justify-between items-start mb-2 sm:mb-4 md:mb-6 relative z-10">
            <div>
              <p className="text-[9px] sm:text-xs font-semibold text-blue-100 uppercase tracking-wider mb-0.5 sm:mb-1.5">Total Guru & Staff</p>
              <div className="flex items-baseline gap-1 sm:gap-1.5">
                <h4 className="text-xl sm:text-2xl md:text-4xl font-extrabold tracking-tight drop-shadow-md">{stats.total}</h4>
                <span className="text-[10px] sm:text-xs md:text-sm font-medium text-blue-100">Orang</span>
              </div>
            </div>
            <div className="w-7 h-7 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg sm:rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center text-white group-hover:scale-105 transition-transform duration-300 shrink-0">
              <Users size={16} className="drop-shadow-sm sm:hidden" />
              <Users size={22} className="drop-shadow-sm hidden sm:block" />
            </div>
          </div>
          <div className="mt-auto space-y-1.5 sm:space-y-3 pt-2.5 sm:pt-4 border-t border-white/20 relative z-10 text-xs sm:text-sm">
            <div className="flex justify-between">
              <span className="text-blue-50 flex items-center gap-1.5 sm:gap-2"><span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-blue-200"></span> Laki-laki</span>
              <span className="font-bold">{stats.lk}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-50 flex items-center gap-1.5 sm:gap-2"><span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-indigo-200"></span> Perempuan</span>
              <span className="font-bold">{stats.pr}</span>
            </div>
            <div className="w-full bg-black/20 rounded-full h-1 sm:h-1.5 mt-1 sm:mt-2 flex overflow-hidden">
              <div className="bg-blue-200 h-full transition-all duration-500" style={{ width: `${(stats.lk / stats.total) * 100}%` }}></div>
              <div className="bg-indigo-300 h-full transition-all duration-500" style={{ width: `${(stats.pr / stats.total) * 100}%` }}></div>
            </div>
          </div>
        </div>

        {/* Card 2: Status Kepegawaian (Desain Berwarna Premium) */}
        <div 
          onClick={() => setIsStatusModalOpen(true)}
          className="bg-gradient-to-br from-emerald-500 to-teal-600 p-2.5 sm:p-4 md:p-6 rounded-xl sm:rounded-2xl shadow-md border-0 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-pointer flex flex-col group relative overflow-hidden text-white"
        >
          <div className="absolute top-0 right-0 w-24 sm:w-32 h-24 sm:h-32 bg-white/10 rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
          <div className="absolute top-2 right-2 sm:top-4 sm:right-4 opacity-0 group-hover:opacity-100 transition-opacity text-[8px] sm:text-[10px] font-bold text-emerald-700 bg-white/90 px-1.5 py-0.5 rounded z-20 shadow-sm">Detail</div>
          <div className="flex justify-between items-start mb-2 sm:mb-4 md:mb-6 relative z-10">
            <div>
              <p className="text-[9px] sm:text-xs font-semibold text-emerald-100 uppercase tracking-wider mb-0.5 sm:mb-1.5">Status Pegawai</p>
              <div className="flex items-baseline gap-1 sm:gap-1.5">
                <h4 className="text-xl sm:text-2xl md:text-4xl font-extrabold tracking-tight drop-shadow-md">{stats.tetap}</h4>
                <span className="text-[10px] sm:text-xs md:text-sm font-medium text-emerald-100">Tetap</span>
              </div>
            </div>
            <div className="w-7 h-7 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg sm:rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center text-white group-hover:scale-105 transition-transform duration-300 shrink-0">
              <Award size={16} className="drop-shadow-sm sm:hidden" />
              <Award size={22} className="drop-shadow-sm hidden sm:block" />
            </div>
          </div>
          <div className="mt-auto space-y-1 sm:space-y-2 pt-2 sm:pt-4 border-t border-white/20 relative z-10 text-xs sm:text-sm">
             <div className="flex items-center justify-between p-1 sm:p-2 rounded-lg bg-black/10 border border-white/10 backdrop-blur-sm">
                <span className="text-[10px] sm:text-xs font-semibold text-emerald-50 flex items-center gap-1 sm:gap-1.5"><CheckCircle size={11} className="sm:hidden" /><CheckCircle size={14} className="hidden sm:inline"/> Guru Tetap</span>
                <span className="text-[11px] sm:text-sm font-bold text-white">{stats.tetap}</span>
             </div>
             <div className="flex items-center justify-between p-1 sm:p-2 rounded-lg bg-black/10 border border-white/10 backdrop-blur-sm">
                <span className="text-[10px] sm:text-xs font-semibold text-emerald-50 flex items-center gap-1 sm:gap-1.5"><Clock size={11} className="sm:hidden" /><Clock size={14} className="hidden sm:inline"/> Tidak Tetap</span>
                <span className="text-[11px] sm:text-sm font-bold text-white">{stats.tdkTetap}</span>
             </div>
          </div>
        </div>

        {/* Card 3: Kualifikasi Pendidikan (Desain Berwarna Premium) */}
        <div 
          onClick={() => setIsEduModalOpen(true)}
          className="bg-gradient-to-br from-purple-500 to-indigo-600 p-2.5 sm:p-4 md:p-6 rounded-xl sm:rounded-2xl shadow-md border-0 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-pointer flex flex-col group relative overflow-hidden text-white"
        >
          <div className="absolute top-0 right-0 w-24 sm:w-32 h-24 sm:h-32 bg-white/10 rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
          <div className="absolute top-2 right-2 sm:top-4 sm:right-4 opacity-0 group-hover:opacity-100 transition-opacity text-[8px] sm:text-[10px] font-bold text-purple-700 bg-white/90 px-1.5 py-0.5 rounded z-20 shadow-sm">Detail</div>
          <div className="flex justify-between items-start mb-2 sm:mb-4 relative z-10">
            <div>
              <p className="text-[9px] sm:text-xs font-semibold text-purple-100 uppercase tracking-wider mb-0.5 sm:mb-1.5">Pendidikan (S1/S2)</p>
              <div className="flex items-baseline gap-1 sm:gap-1.5">
                <h4 className="text-xl sm:text-2xl md:text-4xl font-extrabold tracking-tight drop-shadow-md">
                  {stats.eduCount['S2'] + stats.eduCount['S1']}
                </h4>
                <span className="text-[10px] sm:text-xs md:text-sm font-medium text-purple-100">Sarjana+</span>
              </div>
            </div>
            <div className="w-7 h-7 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg sm:rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center text-white group-hover:scale-105 transition-transform duration-300 shrink-0">
              <GraduationCap size={16} className="drop-shadow-sm sm:hidden" />
              <GraduationCap size={22} className="drop-shadow-sm hidden sm:block" />
            </div>
          </div>
          <div className="mt-auto grid grid-cols-2 gap-1 sm:gap-2 pt-2 sm:pt-4 border-t border-white/20 relative z-10">
             <div className="p-1 sm:p-2 border border-white/20 rounded-lg bg-black/10 backdrop-blur-sm text-center transition-colors hover:bg-black/20">
                <span className="block text-[8px] sm:text-[10px] font-bold text-purple-200 uppercase tracking-wider">Magister</span>
                <span className="block text-xs sm:text-base font-bold mt-0.5">{stats.eduCount['S2']}</span>
             </div>
             <div className="p-1 sm:p-2 border border-white/20 rounded-lg bg-black/10 backdrop-blur-sm text-center transition-colors hover:bg-black/20">
                <span className="block text-[8px] sm:text-[10px] font-bold text-purple-200 uppercase tracking-wider">Sarjana</span>
                <span className="block text-xs sm:text-base font-bold mt-0.5">{stats.eduCount['S1']}</span>
             </div>
             <div className="p-1 sm:p-2 border border-white/20 rounded-lg bg-black/10 backdrop-blur-sm text-center transition-colors hover:bg-black/20">
                <span className="block text-[8px] sm:text-[10px] font-bold text-purple-200 uppercase tracking-wider">Diploma</span>
                <span className="block text-xs sm:text-base font-bold mt-0.5">{stats.eduCount['Diploma']}</span>
             </div>
             <div className="p-1 sm:p-2 border border-white/20 rounded-lg bg-black/10 backdrop-blur-sm text-center transition-colors hover:bg-black/20">
                <span className="block text-[8px] sm:text-[10px] font-bold text-purple-200 uppercase tracking-wider">SMA/Setara</span>
                <span className="block text-xs sm:text-base font-bold mt-0.5">{stats.eduCount['SMA/Pondok']}</span>
             </div>
          </div>
        </div>

        {/* Card 4: Staff Operasional (Desain Berwarna Premium) */}
        <div 
          onClick={() => setActiveTab('dataguru')}
          className="bg-gradient-to-br from-orange-500 to-rose-500 p-2.5 sm:p-4 md:p-6 rounded-xl sm:rounded-2xl shadow-md border-0 transition-all duration-300 flex flex-col group cursor-pointer hover:shadow-lg hover:-translate-y-1 relative overflow-hidden text-white"
        >
          <div className="absolute top-0 right-0 w-24 sm:w-32 h-24 sm:h-32 bg-white/10 rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
          <div className="absolute top-2 right-2 sm:top-4 sm:right-4 opacity-0 group-hover:opacity-100 transition-opacity text-[8px] sm:text-[10px] font-bold text-orange-700 bg-white/90 px-1.5 py-0.5 rounded z-20 shadow-sm">Kelola</div>
          <div className="flex justify-between items-start mb-2 sm:mb-4 md:mb-6 relative z-10">
            <div>
              <p className="text-[9px] sm:text-xs font-semibold text-orange-100 uppercase tracking-wider mb-0.5 sm:mb-1.5">Staff Operasional</p>
              <div className="flex items-baseline gap-1 sm:gap-1.5">
                <h4 className="text-xl sm:text-2xl md:text-4xl font-extrabold tracking-tight drop-shadow-md">
                  {stats.opsCount.security + stats.opsCount.kebersihan + stats.opsCount.pengabdian}
                </h4>
                <span className="text-[10px] sm:text-xs md:text-sm font-medium text-orange-100">Orang</span>
              </div>
            </div>
            <div className="w-7 h-7 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg sm:rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center text-white group-hover:scale-105 transition-transform duration-300 shrink-0">
              <HeartHandshake size={16} className="drop-shadow-sm sm:hidden" />
              <HeartHandshake size={22} className="drop-shadow-sm hidden sm:block" />
            </div>
          </div>
          <div className="mt-auto space-y-1 sm:space-y-2 pt-2 sm:pt-4 border-t border-white/20 relative z-10 text-xs sm:text-sm">
             <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-xs font-semibold text-orange-100 flex items-center gap-1 sm:gap-2"><Shield size={11} className="sm:hidden opacity-70"/><Shield size={14} className="hidden sm:inline opacity-70"/> Security</span>
                <span className="text-[11px] sm:text-sm font-bold">{stats.opsCount.security}</span>
             </div>
             <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-semibold text-orange-100 flex items-center gap-1.5 sm:gap-2"><Trash2 size={12} className="sm:hidden opacity-70"/><Trash2 size={14} className="hidden sm:inline opacity-70"/> Kebersihan</span>
                <span className="font-bold">{stats.opsCount.kebersihan}</span>
             </div>
             <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-semibold text-orange-100 flex items-center gap-1.5 sm:gap-2"><Sparkles size={12} className="sm:hidden opacity-70"/><Sparkles size={14} className="hidden sm:inline opacity-70"/> Pengabdian</span>
                <span className="font-bold">{stats.opsCount.pengabdian}</span>
             </div>
          </div>
        </div>
      </div>

      {/* TREN PENGELUARAN GAJI (DIUBAH MENJADI GRAFIK INTERAKTIF RECHARTS) */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col p-6 mt-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h3 className="text-lg font-bold dark:text-white flex items-center gap-2"><BarChart3 className="text-blue-500"/> Visualisasi Tren Pengeluaran Gaji</h3>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1.5">
              <Info size={14}/>
              {!archives || archives.length === 0 ? "Proyeksi data simulasi. Lakukan fitur 'Tutup Buku' untuk mengaktifkan data asli." : "Grafik riwayat pengeluaran dari data arsip bulanan sekolah yang sah."}
            </p>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
             <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-blue-700 dark:text-blue-400">
               <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Riwayat Lama
             </div>
             <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
               <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span> Bulan Ini
             </div>
          </div>
        </div>
        
        <div className="w-full relative space-y-4 max-h-80 overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
          {chartData.map((entry, index) => {
            const maxTotal = Math.max(...chartData.map(d => d.total), 1);
            const percentage = (entry.total / maxTotal) * 100;
            const isCurrentMonth = entry.isCurrent || (index === chartData.length - 1 && !chartData.some(d => d.isCurrent));
            
            return (
              <div key={index} className="flex flex-col gap-1.5 group">
                <div className="flex justify-between items-end">
                  <span className={`text-sm font-bold ${isCurrentMonth ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
                    {entry.bulan} {isCurrentMonth && '(Saat Ini)'}
                  </span>
                  <span className={`text-sm font-black ${isCurrentMonth ? 'text-emerald-700 dark:text-emerald-400' : 'text-blue-700 dark:text-blue-400'}`}>
                    {formatRp(entry.total)}
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-3 md:h-4 overflow-hidden shadow-inner">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ease-out relative ${isCurrentMonth ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-blue-400 to-blue-500 group-hover:from-blue-500 group-hover:to-blue-600'}`}
                    style={{ width: `${percentage}%` }}
                  >
                    <div className="absolute top-0 right-0 bottom-0 left-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                  </div>
                </div>
              </div>
            );
          })}
          {(!chartData || chartData.length === 0) && (
            <div className="text-center py-10 text-slate-500 font-medium">Belum ada data visualisasi yang dapat ditampilkan.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export { DashboardView };
