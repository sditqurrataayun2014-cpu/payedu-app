import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  AlertCircle, Archive, BarChart3, Calculator, CalendarDays,
  CheckCircle, ChevronDown, ChevronUp, Clock, CreditCard, FileText,
  Fingerprint, History, Info, LayoutDashboard, LogOut, Menu,
  MessageSquare, Moon, RefreshCw, Settings, Sun, UserCheck,
  UserCircle, Users, Wallet, WifiOff, Wrench, X
} from 'lucide-react';

import MaintenanceScreen from './MaintenanceScreen';
import ViewLoader from './ViewLoader';

// 🚀 Lazy loaded views
const PresensiGuruView = React.lazy(() => import('../PresensiGuruView'));
const ArsipView = React.lazy(() => import('../features/admin/ArsipView'));
const LaporanView = React.lazy(() => import('../features/admin/LaporanView'));
const PengaturanView = React.lazy(() => import('../features/admin/PengaturanView'));
const DashboardView = React.lazy(() => import('../features/admin/DashboardView'));
const DataGuruView = React.lazy(() => import('../features/admin/DataGuruView'));
const RekapPinjamanView = React.lazy(() => import('../features/admin/RekapPinjamanView'));
const RekapAbsensiView = React.lazy(() => import('../features/admin/RekapAbsensiView'));
const JadwalMengajarView = React.lazy(() => import('../features/admin/JadwalMengajarView'));
const GajiView = React.lazy(() => import('../features/admin/GajiView'));
const RekapGajiView = React.lazy(() => import('../features/admin/RekapGajiView'));
const PortalGuruView = React.lazy(() => import('../features/portal/PortalGuruView'));

import { calculatePayroll, safeStorageSet } from '../utils/payrollUtils';
import { createTeacherPatchHandler, pushCloudData as pushToSupabase } from '../services/dbService';
import { popAndCloseTopBackModal } from '../services/navigationService';

export default function MainLayout({ user, onLogout, isDarkMode, toggleTheme, teachers, setTeachers, settings, setSettings, feedbacks, setFeedbacks, loginHistory, setLoginHistory, archives, setArchives, presensiGuru, setPresensiGuru, auditLogs, setAuditLogs, saveAuditLog, isOnline, syncStatus, hasConflict, resolveConflict, onToggleMaintenance }) {
  const handleUpdateTeacherPatch = useMemo(() => createTeacherPatchHandler(setTeachers), [setTeachers]);
  const rootInitialTab = (user.role === 'admin' || user.role === 'Kepala Sekolah') ? 'dashboard' : 'portal_dashboard';
  const [activeTab, setActiveTab] = useState(rootInitialTab);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  const [selectedGajiId, setSelectedGajiId] = useState(null);
  const [selectedGajiTab, setSelectedGajiTab] = useState(null); // 🪄 TAMBAHAN: Menyimpan tab spesifik form gaji
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [absensiFilter, setAbsensiFilter] = useState('all');
  const [isManualSyncing, setIsManualSyncing] = useState(false);

  // 🛡️ ANDROID HARDWARE BACK NAVIGATION MANAGER:
  // Riwayat navigasi tab internal agar tombol Back HP tidak langsung keluar aplikasi
  const tabHistoryRef = useRef([rootInitialTab]);
  const [showExitToast, setShowExitToast] = useState(false);

  // Inisialisasi state history browser pada saat aplikasi pertama kali dimuat
  useEffect(() => {
    try {
      window.history.replaceState({ isRootGuard: true }, '');
      window.history.pushState({ tab: rootInitialTab, isAppNav: true }, '');
    } catch (e) {
      console.warn('[Navigation] History init error:', e);
    }
  }, [rootInitialTab]);

  // Handler navigasi tab yang sinkron dengan History Stack Browser/Android
  const handleNavigateTab = useCallback((targetTabOrUpdater) => {
    setActiveTab(prev => {
      const nextTab = typeof targetTabOrUpdater === 'function' ? targetTabOrUpdater(prev) : targetTabOrUpdater;
      if (nextTab !== prev) {
        window.history.pushState({ tab: nextTab, isAppNav: true }, '');
        tabHistoryRef.current.push(nextTab);
      }
      return nextTab;
    });
  }, []);

  // Listener tombol fisik / gestur Back HP (popstate event)
  useEffect(() => {
    let lastBackPress = 0;

    const onPopState = () => {
      // 1. Prioritas Utama: Jika ada modal yang aktif terbuka di layar, tutup modal tersebut
      if (popAndCloseTopBackModal()) {
        window.history.pushState({ tab: activeTab, isAppNav: true }, '');
        return;
      }

      // 2. Jika sidebar di mobile sedang terbuka, tutup sidebar terlebih dahulu
      if (window.innerWidth < 768 && isSidebarOpen) {
        setIsSidebarOpen(false);
        window.history.pushState({ tab: activeTab, isAppNav: true }, '');
        return;
      }

      // 3. Jika dropdown profil terbuka, tutup dropdown
      if (isProfileDropdownOpen) {
        setIsProfileDropdownOpen(false);
        window.history.pushState({ tab: activeTab, isAppNav: true }, '');
        return;
      }

      // 4. Jika ada riwayat tab sebelumnya, kembali ke tab / menu sebelumnya
      if (tabHistoryRef.current.length > 1) {
        tabHistoryRef.current.pop(); // buang tab saat ini
        const prevTab = tabHistoryRef.current[tabHistoryRef.current.length - 1];
        if (prevTab) {
          setActiveTab(prevTab);
          return;
        }
      }

      // 5. Jika sudah berada di halaman awal (Beranda / Profil Guru / Dashboard Admin):
      // Standar Android App: Tekan sekali lagi dalam 2 detik untuk keluar aplikasi
      const now = Date.now();
      if (now - lastBackPress < 2000) {
        // User menekan back 2x berturut-turut -> izinkan keluar aplikasi
        window.history.back();
      } else {
        lastBackPress = now;
        window.history.pushState({ tab: rootInitialTab, isRoot: true, isAppNav: true }, '');
        setShowExitToast(true);
        setTimeout(() => setShowExitToast(false), 2000);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isSidebarOpen, isProfileDropdownOpen, activeTab, rootInitialTab]);

  // 🪄 FITUR BARU & DIPERBARUI: Mesin Audit Log Cloud & Anti-Spam Ketikan (Debounce)
  const latestTeachersRef = useRef(teachers);
  useEffect(() => { latestTeachersRef.current = teachers; }, [teachers]);
  
  const auditBufferRef = useRef({});
  const auditTimeoutRef = useRef(null);

  const flushAuditLogs = () => {
     const bufferKeys = Object.keys(auditBufferRef.current);
     if (bufferKeys.length === 0) return;

     bufferKeys.forEach((key) => {
        const item = auditBufferRef.current[key];
        if (Number(item.oldVal) === Number(item.newVal) || String(item.oldVal) === String(item.newVal)) return;

        saveAuditLog?.(
           user?.name || 'Administrator',
           `Ubah ${item.field}`,
           item.teacherName,
           `Mengubah ${item.field} dari Rp ${Number(item.oldVal || 0).toLocaleString('id-ID')} menjadi Rp ${Number(item.newVal || 0).toLocaleString('id-ID')}`,
           'finansial'
        );
     });

     auditBufferRef.current = {};
  };

  const recordDebouncedAudit = (targetTeacher, fieldLabel, oldVal, newVal) => {
     if (!targetTeacher) return;
     const teacherId = targetTeacher.id;
     const bufferKey = `${teacherId}_${fieldLabel}`;

     // Jika ini adalah ketikan pertama, rekam nilai aslinya dan Total Gaji aslinya
     if (!auditBufferRef.current[bufferKey]) {
         const calc = calculatePayroll(targetTeacher, settings);
         auditBufferRef.current[bufferKey] = {
             teacherId: teacherId,
             teacherName: targetTeacher.name,
             field: fieldLabel,
             oldVal: oldVal,
             newVal: newVal,
             oldTotal: calc.totalBersih,
             oldTotalKotor: calc.totalKotor
         };
     } else {
         // Jika sedang mengetik, perbarui saja nilai tujuan akhirnya
         auditBufferRef.current[bufferKey].newVal = newVal;
     }

     // Beri jeda 5 detik setelah jari berhenti mengetik, baru simpan ke awan (Anti-Spam lebih kuat)
     if (auditTimeoutRef.current) clearTimeout(auditTimeoutRef.current);
     auditTimeoutRef.current = setTimeout(() => {
         flushAuditLogs();
     }, 5000); // 🪄 DIPERBARUI: Diperlama jadi 5 detik agar ketikan angka tidak terpotong-potong
  };

  // TAMBAHAN: Jam & Tanggal Real-time di Header
  const [currentTime, setCurrentTime] = useState(new Date());

  // Effect untuk memperbarui jam setiap 1 detik
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // DIPERBARUI: Memaksa waktu untuk selalu membaca zona waktu WIB (Asia/Jakarta)
  const formattedDate = currentTime.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
  const formattedTime = currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' }).replace(/\./g, ':');

  // FITUR BARU: Logika Sapaan Berdasarkan Waktu
  const getGreeting = () => {
    const hour = Number(currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' }));
    if (hour >= 3 && hour < 11) return 'Selamat Pagi';
    if (hour >= 11 && hour < 15) return 'Selamat Siang';
    if (hour >= 15 && hour < 18) return 'Selamat Sore';
    return 'Selamat Malam';
  };

  // State untuk pengaturan Sumber Dana Laporan dengan LocalStorage
  const [fundingSources, setFundingSources] = useState(() => {
    const saved = localStorage.getItem('payedu_funding');
    return saved ? JSON.parse(saved) : [
      { id: 1, nama: 'SPP Bulanan Siswa', nominal: 18500000, warna: 'bg-blue-500', hex: '#3b82f6' },
      { id: 2, nama: 'Dana BOS (Bantuan Operasional Sekolah)', nominal: 8500000, warna: 'bg-emerald-500', hex: '#10b981' },
      { id: 3, nama: 'Subsidi Yayasan', nominal: 5000000, warna: 'bg-amber-500', hex: '#f59e0b' },
      { id: 4, nama: 'Sumber Lain-lain / Donatur', nominal: 1500000, warna: 'bg-purple-500', hex: '#a855f7' }
    ];
  });

  useEffect(() => {
    localStorage.setItem('payedu_funding', JSON.stringify(fundingSources));
  }, [fundingSources]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const adminNav = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, color: 'text-white', glow: 'shadow-purple-500/50', bg: 'bg-gradient-to-br from-purple-400 via-purple-500 to-purple-700 border border-purple-300/50 dark:border-purple-600/50' },
    { id: 'dataguru', label: 'Data Guru & Staff', icon: Users, color: 'text-white', glow: 'shadow-blue-500/50', bg: 'bg-gradient-to-br from-blue-400 via-blue-500 to-blue-700 border border-blue-300/50 dark:border-blue-600/50' },
    { id: 'presensiguru', label: 'Presensi Guru', icon: UserCheck, color: 'text-white', glow: 'shadow-teal-500/50', bg: 'bg-gradient-to-br from-teal-400 via-teal-500 to-emerald-600 border border-teal-300/50 dark:border-teal-600/50' },
    { id: 'jadwal', label: 'Jadwal Mengajar', icon: CalendarDays, color: 'text-white', glow: 'shadow-pink-500/50', bg: 'bg-gradient-to-br from-pink-400 via-pink-500 to-pink-700 border border-pink-300/50 dark:border-pink-600/50' }, // DIPINDAH: Menu Jadwal
    { id: 'rekapabsensi', label: 'Rekap Absen', icon: FileText, color: 'text-white', glow: 'shadow-orange-500/50', bg: 'bg-gradient-to-br from-orange-400 via-orange-500 to-orange-700 border border-orange-300/50 dark:border-orange-600/50' },
    { id: 'gaji', label: 'Komponen Gaji', icon: Calculator, color: 'text-white', glow: 'shadow-emerald-500/50', bg: 'bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-700 border border-emerald-300/50 dark:border-emerald-600/50' },
    { id: 'pinjaman', label: 'Rekap Pinjaman', icon: CreditCard, color: 'text-white', glow: 'shadow-teal-500/50', bg: 'bg-gradient-to-br from-teal-400 via-teal-500 to-teal-700 border border-teal-300/50 dark:border-teal-600/50' },
    { id: 'rekap', label: 'Rekap Gaji', icon: FileText, color: 'text-white', glow: 'shadow-rose-500/50', bg: 'bg-gradient-to-br from-rose-400 via-rose-500 to-rose-700 border border-rose-300/50 dark:border-rose-600/50' },
    { id: 'laporan', label: 'Laporan Detail', icon: BarChart3, color: 'text-white', glow: 'shadow-indigo-500/50', bg: 'bg-gradient-to-br from-indigo-400 via-indigo-500 to-indigo-700 border border-indigo-300/50 dark:border-indigo-600/50' },
    { id: 'arsip', label: 'Manajemen Arsip', icon: Archive, color: 'text-white', glow: 'shadow-teal-500/50', bg: 'bg-gradient-to-br from-teal-400 via-teal-500 to-teal-700 border border-teal-300/50 dark:border-teal-600/50' },
    { id: 'pengaturan', label: 'Pengaturan', icon: Settings, color: 'text-white', glow: 'shadow-slate-500/50', bg: 'bg-gradient-to-br from-slate-400 via-slate-500 to-slate-700 border border-slate-300/50 dark:border-slate-600/50' },
  ];

  const guruNav = [
    { id: 'portal_dashboard', label: 'Profil Pegawai', icon: UserCircle, color: 'text-white', glow: 'shadow-blue-500/50', bg: 'bg-gradient-to-br from-blue-400 via-blue-500 to-blue-700 border border-blue-300/50 dark:border-blue-600/50' },
    { id: 'portal_presensi', label: 'Presensi Saya', icon: Fingerprint, color: 'text-white', glow: 'shadow-teal-500/50', bg: 'bg-gradient-to-br from-teal-400 via-teal-500 to-emerald-600 border border-teal-300/50 dark:border-teal-600/50' },
    { id: 'portal_jadwal', label: 'Jadwal Saya', icon: CalendarDays, color: 'text-white', glow: 'shadow-pink-500/50', bg: 'bg-gradient-to-br from-pink-400 via-pink-500 to-pink-700 border border-pink-300/50 dark:border-pink-600/50' },
    { id: 'portal_kehadiran', label: 'Rekap Kehadiran', icon: Clock, color: 'text-white', glow: 'shadow-amber-500/50', bg: 'bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 border border-amber-300/50 dark:border-amber-600/50' },
    { id: 'portal_gaji', label: 'Slip Gaji Bulanan', icon: Wallet, color: 'text-white', glow: 'shadow-emerald-500/50', bg: 'bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-700 border border-emerald-300/50 dark:border-emerald-600/50' },
    { id: 'portal_pinjaman', label: 'Buku Pinjaman', icon: CreditCard, color: 'text-white', glow: 'shadow-teal-500/50', bg: 'bg-gradient-to-br from-teal-400 via-teal-500 to-teal-700 border border-teal-300/50 dark:border-teal-600/50' },
    { id: 'portal_riwayat', label: 'Riwayat Gaji', icon: History, color: 'text-white', glow: 'shadow-indigo-500/50', bg: 'bg-gradient-to-br from-indigo-400 via-indigo-500 to-indigo-700 border border-indigo-300/50 dark:border-indigo-600/50' },
    { id: 'portal_info', label: 'Info Sistem', icon: Info, color: 'text-white', glow: 'shadow-purple-500/50', bg: 'bg-gradient-to-br from-purple-400 via-purple-500 to-purple-700 border border-purple-300/50 dark:border-purple-600/50' },
    { id: 'portal_saran', label: 'Kritik & Saran', icon: MessageSquare, color: 'text-white', glow: 'shadow-rose-500/50', bg: 'bg-gradient-to-br from-rose-400 via-rose-500 to-rose-700 border border-rose-300/50 dark:border-rose-600/50' },
  ];

  const isManagementRole = String(user.role || '').toLowerCase() === 'admin' || user.role === 'Kepala Sekolah';
  const navItems = isManagementRole ? adminNav : guruNav;

  const navigateToGaji = (teacherId, subTab = 'masaKerja') => {
    setSelectedGajiId(teacherId);
    setSelectedGajiTab(subTab);
    handleNavigateTab('gaji');
  };

  const [auditInitialCategory, setAuditInitialCategory] = useState('ALL');
  const [pengaturanInitialTab, setPengaturanInitialTab] = useState('umum');

  const handleOpenAuditLog = (category = 'ALL') => {
    setPengaturanInitialTab('audit');
    setAuditInitialCategory(category);
    handleNavigateTab('pengaturan');
  };

  const renderContent = () => {
    // 🪄 FIX NO 1: Mode Maintenance memblokir total akses Guru saat aktif
    if (settings?.maintenanceMode && !isManagementRole) {
       return <MaintenanceScreen onLogout={onLogout} appName={settings?.appName} schoolName={settings?.schoolName} appVersion={settings?.appVersion} />;
    }

    switch (activeTab) {
      case 'dashboard': return <DashboardView teachers={teachers} user={user} settings={settings} setSettings={setSettings} archives={archives} setActiveTab={handleNavigateTab} onAbsensiAlertClick={() => { setAbsensiFilter('sering_telat'); handleNavigateTab('rekapabsensi'); }} />;
      case 'dataguru': return <DataGuruView teachers={teachers} setTeachers={setTeachers} user={user} saveAuditLog={saveAuditLog} />;
      case 'presensiguru': 
        return (
          <PresensiGuruView 
            teachers={teachers} 
            presensiGuru={presensiGuru} 
            setPresensiGuru={setPresensiGuru} 
            currentUser={{ id: user.id, name: user.name, username: user.username, role: user.role, portal: 'Admin' }} 
            schoolProfile={{ 
              nama: settings.schoolName || 'SD IT Qurrata A\'yun', 
              npsn: settings.schoolNpsn || '10404040', 
              alamat: settings.schoolAddress || 'Kandis', 
              kepsek: settings.kepsekName || 'Kepala Sekolah', 
              presensiGuruSettings: settings.presensiGuruSettings 
            }} 
            setSchoolProfile={(updater) => { 
              const currentSettings = settings || {};
              const rawUpdated = typeof updater === 'function' ? updater(currentSettings?.presensiGuruSettings ? { presensiGuruSettings: currentSettings.presensiGuruSettings } : currentSettings) : updater; 
              const newPresensiSettings = rawUpdated.presensiGuruSettings || rawUpdated; 
              const newSettings = { ...currentSettings, presensiGuruSettings: newPresensiSettings, lastModified: Date.now() }; 
              setSettings(newSettings);
              safeStorageSet('payedu_settings', newSettings); 
              try { localStorage.setItem('payedu_presensi_guru_settings', JSON.stringify(newPresensiSettings)); } catch(e){} 
              pushToSupabase('SAVE_SETTINGS', newSettings).catch(e => console.warn(e)); 
            }} 
            addAuditLog={saveAuditLog} 
            onUpdateTeacher={handleUpdateTeacherPatch}
          />
        );
      case 'rekapabsensi': return <RekapAbsensiView teachers={teachers} setTeachers={setTeachers} externalFilter={absensiFilter} setExternalFilter={setAbsensiFilter} settings={settings} presensiGuru={presensiGuru} saveAuditLog={saveAuditLog} user={user} />;
      case 'jadwal': return <JadwalMengajarView teachers={teachers} setTeachers={setTeachers} settings={settings} />;
      case 'gaji': return <GajiView teachers={teachers} setTeachers={setTeachers} externalSelectedId={selectedGajiId} setExternalSelectedId={setSelectedGajiId} externalSelectedTab={selectedGajiTab} setExternalSelectedTab={setSelectedGajiTab} settings={settings} user={user} saveAuditLog={saveAuditLog} />;
      case 'pinjaman': return <RekapPinjamanView teachers={teachers} setTeachers={setTeachers} onEditGaji={navigateToGaji} />;
      case 'rekap': return <RekapGajiView teachers={teachers} setTeachers={setTeachers} onEditGaji={navigateToGaji} settings={settings} setSettings={setSettings} archives={archives} setArchives={setArchives} saveAuditLog={saveAuditLog} onOpenAuditLog={handleOpenAuditLog} />;
      case 'laporan': return <LaporanView teachers={teachers} fundingSources={fundingSources} setFundingSources={setFundingSources} settings={settings} />;
      case 'arsip': return <ArsipView archives={archives} setArchives={setArchives} settings={settings} />;
      case 'portal_dashboard': 
      case 'portal_presensi':
      case 'portal_jadwal':
      case 'portal_kehadiran':
      case 'portal_gaji':
      case 'portal_pinjaman':
      case 'portal_riwayat':
      case 'portal_info':
      case 'portal_saran':
        return (
          <PortalGuruView 
            user={user} 
            teachers={teachers} 
            setTeachers={setTeachers} 
            settings={settings} 
            setSettings={setSettings}
            feedbacks={feedbacks} 
            setFeedbacks={setFeedbacks} 
            activeSection={activeTab} 
            setActiveTab={handleNavigateTab} 
            archives={archives} 
            presensiGuru={presensiGuru} 
            setPresensiGuru={setPresensiGuru} 
            saveAuditLog={saveAuditLog}
          />
        );
      case 'pengaturan': 
        return (
          <PengaturanView 
            teachers={teachers} 
            setTeachers={setTeachers} 
            settings={settings} 
            setSettings={setSettings} 
            feedbacks={feedbacks} 
            setFeedbacks={setFeedbacks} 
            loginHistory={loginHistory} 
            setLoginHistory={setLoginHistory} 
            archives={archives} 
            setArchives={setArchives} 
            fundingSources={fundingSources} 
            setFundingSources={setFundingSources} 
            onToggleMaintenance={onToggleMaintenance}
            auditLogs={auditLogs}
            setAuditLogs={setAuditLogs}
            saveAuditLog={saveAuditLog}
            presensiGuru={presensiGuru}
            setPresensiGuru={setPresensiGuru}
            initialTab={pengaturanInitialTab}
            initialAuditCategory={auditInitialCategory}
          />
        );
      default: return <DashboardView teachers={teachers} user={user} settings={settings} setSettings={setSettings} />;
    }
  };

  const [showScrollTop, setShowScrollTop] = useState(false);
  const mainContentRef = useRef(null);

  const handleMainScroll = () => {
    if (mainContentRef.current) {
      setShowScrollTop(mainContentRef.current.scrollTop > 180);
    }
  };

  const scrollToTopGlobal = () => {
    if (mainContentRef.current) {
      mainContentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col min-h-screen md:h-screen md:overflow-hidden bg-slate-50 dark:bg-slate-900 font-sans relative">
      {/* 📡 BANNER OFFLINE MODE */}
      {!isOnline && (
        <div className="bg-amber-600 text-white px-4 py-2 text-center text-xs font-bold flex items-center justify-center gap-2 shadow-lg sticky top-0 z-50 animate-in slide-in-from-top duration-300">
          <WifiOff size={16} className="shrink-0 animate-pulse" />
          <span>Mode Offline Aktif — Anda tetap dapat bekerja &amp; presensi tanpa hambatan. Data tersimpan aman di perangkat dan akan disinkronkan otomatis ke Cloud begitu internet tersambung kembali.</span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden relative">
      {isSidebarOpen && window.innerWidth < 768 && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 md:hidden no-print animate-in fade-in" onClick={() => setIsSidebarOpen(false)} />
      )}

      <aside className={`fixed md:static inset-y-0 left-0 z-50 w-64 shrink-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transform transition-all duration-300 ease-in-out flex flex-col no-print ${isSidebarOpen ? 'translate-x-0 md:ml-0' : '-translate-x-full md:-ml-64'}`}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <div className="flex items-center truncate">
            {settings?.logoUrl ? (
              <img src={settings.logoUrl} alt="Logo" className="w-8 h-8 object-contain mr-3 shrink-0 drop-shadow-sm" />
            ) : (
              <Calculator className="mr-3 shrink-0" size={24} />
            )}
            <span className="font-bold text-lg tracking-wide truncate">{settings?.appName ? settings.appName.split(' ')[0] : 'PayEdu Apps'}</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-white/80 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-2">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { 
                  handleNavigateTab(item.id); 
                  if (window.innerWidth < 768) {
                    setIsSidebarOpen(false);
                  }
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-300 group overflow-hidden relative border border-transparent ${
                  isActive 
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-md border-slate-200 dark:border-slate-700/50' 
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className={`p-2 rounded-xl flex items-center justify-center transition-all duration-300 z-10 shadow-[inset_0_1px_2px_rgba(255,255,255,0.4)] ${isActive ? `${item.bg} ${item.color} shadow-[0_8px_16px_-6px_rgba(0,0,0,0.5)] ${item.glow} scale-110 rotate-3` : `${item.bg} ${item.color} opacity-80 group-hover:opacity-100 group-hover:scale-110 group-hover:rotate-3 group-hover:shadow-[0_8px_16px_-6px_rgba(0,0,0,0.5)] ${item.glow}`}`}>
                  <Icon size={18} className="drop-shadow-md" strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className={`z-10 transition-all duration-300 ${isActive ? 'font-bold tracking-wide' : 'font-medium'}`}>{item.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Tombol Keluar Aplikasi di Paling Bawah Sidebar */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 shrink-0">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 text-slate-600 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 group"
          >
            <div className="p-2 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:bg-red-100 dark:group-hover:bg-red-900/40 text-slate-400 group-hover:text-red-600 dark:group-hover:text-red-400">
              <LogOut size={18} strokeWidth={2.5} className="group-hover:-translate-x-0.5 transition-transform" />
            </div>
            Keluar Aplikasi
          </button>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-700/60 mt-2 text-center no-print">
             <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                Desain Aplikasi | Muhamad Husni Akbar
             </p>
             <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 mt-1 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded inline-block border border-blue-200 dark:border-blue-800">
                {settings?.appVersion || 'v1.2.5'}
             </p>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 min-h-screen md:min-h-0 md:h-full md:overflow-hidden relative">
        <header className="h-16 shrink-0 flex items-center justify-between px-4 sm:px-6 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 no-print z-40 relative">
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <button 
              className="p-2 -ml-2 text-slate-600 dark:text-slate-300 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 shrink-0" 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              title="Toggle Menu"
            >
              <Menu size={24} />
            </button>
            <h2 className="text-base sm:text-lg md:text-xl font-semibold text-slate-800 dark:text-white capitalize truncate">
              {navItems.find(i => i.id === activeTab)?.label || 'Dashboard'}
            </h2>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            
            {/* FITUR BARU: Tombol Sinkronisasi Interaktif ke Cloud */}
            {isManagementRole && (
              <button 
                type="button"
                onClick={async () => {
                  setIsManualSyncing(true);
                  try {
                    await Promise.allSettled([
                      pushToSupabase('SAVE_TEACHERS', teachers),
                      pushToSupabase('SAVE_SETTINGS', settings),
                      pushToSupabase('SAVE_ARCHIVES', archives),
                      pushToSupabase('SAVE_FEEDBACKS', feedbacks),
                      pushToSupabase('SAVE_LOGS', loginHistory)
                    ]);
                    setIsManualSyncing(false);
                    alert("✨ SINKRONISASI BERHASIL! ✨\n\nSeluruh data Pegawai, Pengaturan, Arsip, dan Log Aktivitas telah berhasil disinkronkan ke Cloud.");
                  } catch (err) {
                    setIsManualSyncing(false);
                    alert("Selesai disinkronkan ke Penyimpanan Lokal.");
                  }
                }}
                disabled={isManualSyncing}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full border border-blue-300 dark:border-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 transition-all duration-300 shadow-sm cursor-pointer hover:scale-105 active:scale-95 disabled:opacity-50 shrink-0"
                title="Klik untuk menyinkronkan seluruh data aplikasi ke Cloud secara langsung"
              >
                <RefreshCw size={14} className={`text-blue-600 dark:text-blue-400 ${isManualSyncing || syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                <span className="text-[11px] font-extrabold tracking-wide uppercase">
                  {isManualSyncing || syncStatus === 'syncing' ? (
                    <>
                      <span className="hidden sm:inline">Sinkronisasi...</span>
                      <span className="sm:hidden">Sync...</span>
                    </>
                  ) : (
                    <>
                      <span className="hidden sm:inline">Sinkronisasi</span>
                      <span className="sm:hidden">Sync</span>
                    </>
                  )}
                </span>
              </button>
            )}

            {/* TAMBAHAN: Jam & Tanggal Real-time di Header */}
            <div className="hidden lg:flex flex-col items-end justify-center border-r border-slate-200 dark:border-slate-700 pr-4 mr-1">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{formattedDate}</span>
              <span className="text-sm font-black text-slate-700 dark:text-slate-200 font-mono tracking-wider flex items-center gap-1.5">
                <Clock size={12} className="text-blue-500" /> {formattedTime} <span className="text-[10px] text-slate-400 font-bold ml-0.5">WIB</span>
              </span>
            </div>

            <button onClick={toggleTheme} className="p-2 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors shrink-0">
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <div className="relative shrink-0 z-50">
              <button 
                onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                className="flex items-center gap-2.5 focus:outline-none hover:opacity-80 transition-opacity p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/50"
              >
                <div className="hidden md:block text-right">
                  {/* DIPERBARUI: Menambahkan Sapaan Waktu Cerdas */}
                  <div className="font-semibold text-sm text-slate-800 dark:text-white leading-none">{getGreeting()}, {user.name.split(' ')[0]}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 capitalize mt-1.5">{user.role}</div>
                </div>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold shadow-md shadow-blue-500/30 shrink-0">
                  {user.name.charAt(0)}
                </div>
              </button>

              {isProfileDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-50 bg-slate-900/10 backdrop-blur-[1px]" onClick={() => setIsProfileDropdownOpen(false)}></div>
                  
                  <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 py-2 z-[60] animate-in fade-in zoom-in-95 slide-in-from-top-2">
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 mb-1 bg-slate-50/50 dark:bg-slate-900/50">
                      <div className="font-bold text-sm text-slate-800 dark:text-white truncate">{user.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 capitalize mt-0.5">{user.role}</div>
                    </div>
                    
                    {user.role === 'admin' ? (
                      <button 
                        onClick={() => {
                           handleNavigateTab('pengaturan');
                           setIsProfileDropdownOpen(false);
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 flex items-center gap-2 transition-colors font-medium"
                      >
                        <Settings size={16} className="text-slate-400" />
                        Pengaturan Akun
                      </button>
                    ) : (
                      <div className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900/50 mx-2 rounded-lg border border-slate-100 dark:border-slate-700/50 my-1">
                        <div className="flex justify-between items-center mb-1.5">
                          <span>Status Pegawai:</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle size={12}/> Aktif</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Hak Akses:</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">Portal Guru (Read-only)</span>
                        </div>
                      </div>
                    )}

                    <button 
                      onClick={onLogout} 
                      className="w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 transition-colors mt-1 border-t border-slate-100 dark:border-slate-700/50 font-bold"
                    >
                      <LogOut size={16} />
                      Keluar Aplikasi
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* FITUR BARU: Banner Status Mode Maintenance (Khusus Admin & Kepsek) */}
        {settings?.maintenanceMode && (user.role === 'admin' || user.role === 'Kepala Sekolah') && (
           <div className="bg-amber-500 text-slate-950 px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2 shadow-md z-40 relative no-print border-b border-amber-600">
             <div className="flex items-center gap-2">
                <Wrench className="shrink-0 animate-bounce text-slate-950" size={18} />
                <span className="text-xs font-black">
                   MODE MAINTENANCE (PERBAIKAN) AKTIF: Akses Guru ditutup sementara. Anda masuk sebagai Admin/Kepsek.
                </span>
             </div>
             <button 
               type="button"
               onClick={() => {
                 if (onToggleMaintenance) {
                   onToggleMaintenance(false);
                 } else {
                   const updated = { ...settings, maintenanceMode: false, lastModified: Date.now() };
                   setSettings(updated);
                   safeStorageSet('payedu_settings', updated);
                   pushToSupabase('SAVE_SETTINGS', updated);
                 }
               }}
               className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-1 rounded-lg text-xs font-bold transition-colors shrink-0 shadow-sm cursor-pointer"
             >
               Matikan Mode Maintenance
             </button>
           </div>
        )}

        {/* TAMBAHAN: Notifikasi Pembaruan Data Cloud (Non-blocking) */}
        {hasConflict && isManagementRole && (
           <div className="bg-amber-600 text-white px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2 shadow-md z-40 relative animate-in slide-in-from-top-2 no-print">
             <div className="flex items-center gap-2">
               <AlertCircle className="shrink-0" size={18} />
               <p className="text-xs font-semibold">Terdapat perubahan data terbaru di Cloud dari perangkat lain.</p>
             </div>
             <button 
               onClick={resolveConflict} 
               className="shrink-0 whitespace-nowrap bg-white text-amber-800 hover:bg-amber-50 px-3 py-1 rounded-lg font-bold text-xs shadow-sm transition-transform hover:scale-105 flex items-center gap-1.5 cursor-pointer"
             >
               <RefreshCw size={14} /> Sinkronkan Versi Terbaru
             </button>
           </div>
        )}

        <div 
          ref={mainContentRef}
          onScroll={handleMainScroll}
          className="flex-1 p-2 sm:p-4 md:p-6 lg:p-8 pb-24 md:pb-12 md:overflow-y-auto transition-all"
        >
          <React.Suspense fallback={<ViewLoader />}>
            {renderContent()}
          </React.Suspense>
        </div>

        {/* FITUR BARU: Tombol Melayang (Floating Action Widget) Scroll Ke Paling Atas (⬆️) & Paling Bawah (⬇️) Khusus Admin & Kepsek */}
        {isManagementRole && (
          <div className="fixed bottom-6 right-4 sm:right-6 z-[90] flex flex-col gap-2.5 no-print">
            <button
              type="button"
              onClick={() => {
                if (mainContentRef.current) {
                  mainContentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                }
                window.scrollTo({ top: 0, behavior: 'smooth' });
                document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-xl shadow-blue-600/30 flex items-center justify-center transition-all border border-blue-400/40 cursor-pointer hover:scale-105"
              title="Scroll ke Paling Atas Halaman"
            >
              <ChevronUp size={22} strokeWidth={3} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (mainContentRef.current) {
                  mainContentRef.current.scrollTo({ top: mainContentRef.current.scrollHeight || 99999, behavior: 'smooth' });
                }
                window.scrollTo({ top: document.body.scrollHeight || 99999, behavior: 'smooth' });
                document.documentElement.scrollTo({ top: document.documentElement.scrollHeight || 99999, behavior: 'smooth' });
              }}
              className="w-11 h-11 rounded-full bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 active:scale-95 text-white shadow-xl shadow-slate-900/30 flex items-center justify-center transition-all border border-slate-600/40 cursor-pointer hover:scale-105"
              title="Scroll ke Paling Bawah Halaman"
            >
              <ChevronDown size={22} strokeWidth={3} />
            </button>
          </div>
        )}
      </main>

      {/* 📱 ANDROID NATIVE DOUBLE-BACK TOAST NOTIFICATION */}
      {showExitToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[300] bg-slate-900/90 dark:bg-slate-800/95 text-white text-xs font-bold px-4 py-2 rounded-full shadow-2xl backdrop-blur-md border border-slate-700/80 animate-in fade-in slide-in-from-bottom-2 flex items-center gap-2 pointer-events-none">
          <span>Tekan tombol kembali sekali lagi untuk keluar aplikasi</span>
        </div>
      )}
      </div>
    </div>
  );
}

// --- SUB-VIEWS ---

// [MODULARISASI] TableWrapper dipindahkan ke src/components/TableWrapper.jsx

export { MainLayout };
