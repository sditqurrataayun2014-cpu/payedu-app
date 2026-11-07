import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  AlertCircle, X, Trash2, RefreshCw, Key, Sparkles, 
  Lock, Save, Settings, Building, FileText, Database, 
  Info, Wallet, TrendingUp, PlusCircle, Briefcase, 
  Search, Download, Smartphone, Unlock, Send, Edit, 
  Upload, ShieldCheck, Clock, UserCheck, MessageSquare, CheckCircle 
} from 'lucide-react';
import { 
  FormattedRupiahInput, formatDateId, simpleHash, safeStorageSet, 
  generateUniqueId, isTeacherActive, sanitizeTeacherData, sortLoginLogs,
  TENURE_RATES, EDU_RATES, JOB_CATEGORIES, JOB_ROLES, 
  KINERJA_RATES, KOMPETENSI_FIELDS, KOMPETENSI_LEVEL_RATES, 
  INSENTIF_LIST, POTONGAN_LIST 
} from '../../utils/payrollUtils';
import { 
  pushCloudData as pushToSupabase, 
  pushPresensiGuru, sortTeachersById, deduplicateTeachers 
} from '../../services/dbService';

const sanitizeTeacherList = (list) => {
  if (!Array.isArray(list)) return [];
  const sanitized = list.map(sanitizeTeacherData);
  return sortTeachersById(deduplicateTeachers(sanitized));
};

const postToGoogleSheets = async (action, payload) => {
  return await pushToSupabase(action, payload);
};

// --- PENGATURAN VIEW ---
function PengaturanView({ teachers, setTeachers, settings, setSettings, feedbacks, setFeedbacks, loginHistory, setLoginHistory, archives, setArchives, fundingSources, setFundingSources, onToggleMaintenance, auditLogs = [], setAuditLogs, saveAuditLog, presensiGuru = [], setPresensiGuru, initialTab = 'umum', initialAuditCategory = 'ALL' }) {
  const fileInputRef = useRef(null);

  // TAMBAHAN: State Lokal khusus untuk Teks Portal agar kursor tidak melompat saat mengetik
  const [localPortalText, setLocalPortalText] = useState(settings.payrollInfoText || '');

  // Teks Default Resmi Sekolah
  const DEFAULT_PORTAL_TEXT = `Sistem penggajian di sekolah ini kami susun secara transparan dan berbasis kinerja. Berikut adalah pedoman dan komponen yang membentuk gaji bersih (Take Home Pay) Anda:

* Tunjangan Masa Kerja: Dihitung berdasarkan tahun Mulai Tugas (TMT) pengabdian Anda di sekolah ini.
* Tunjangan Masa Kerja: Diberikan kepada Guru/Pegawai yang berstatus TETAP. Adapun syarat untuk diangkat sebagai Guru/ Pegawai Tetap adalah minimal masa kerja 2 tahun.
* Tunjangan Pendidikan: Penyesuaian berdasarkan kualifikasi pendidikan terakhir (SMA/Diploma/S1/S2).
* Tunjangan Jabatan: Diberikan kepada pemangku amanah struktural sekolah (Kepsek, Waka, Wali Kelas, dll).
* Tunjangan Keluarga: Diberikan khusus bagi pegawai yang telah menikah (Tunjangan Suami/Istri & Anak).
* Insentif Kehadiran (Tepat Waktu): Apresiasi atas dedikasi dan kedisiplinan waktu kehadiran masuk kelas.
* Insentif Tugas Tambahan: Disesuaikan dengan penugasan dari Kepala Sekolah yang sifanya insidental atau tugas khusus lainnya.
* Pemotongan Kedisiplinan: Pengurangan nominal atas keterlambatan atau ketidakhadiran tanpa keterangan.
* Pemotongan Pinjaman: Angsuran otomatis untuk pelunasan Kasbon sekolah, iuran baju Guru, atau lainnya.
* Adapun Hal lainnya yang belum terakomodir di dalam sistem aplikasi penggajian ini, akan menyesuaikan dengan kebijakan Sekolah/Yayasan. (misalnya: Guru cuti, libur Panjang, dll.) yang berdampak terhadap rekapitulasi jam mengajar.

Jika terdapat ketidaksesuaian data (seperti jumlah kehadiran atau masa kerja), harap segera melapor ke bagian Tata Usaha (TU) Administrasi maksimal 1x24 jam sejak slip gaji diterbitkan/dikonfirmasi.`;

  // PERBAIKAN FLEKSIBILITAS: Memastikan teks editor lokal selalu sinkron dengan data server (Anti-Bug Tersangkut)
  useEffect(() => {
    if (settings.payrollInfoText !== undefined) {
       setLocalPortalText(settings.payrollInfoText);
    }
  }, [settings.payrollInfoText]);

  // Hubungkan daftar akun ke LocalStorage
  const [accounts, setAccounts] = useState(() => {
    const saved = localStorage.getItem('payedu_accounts');
    if (saved) return JSON.parse(saved);
    return [
      { id: 'admin-1', name: 'Administrator System', username: 'Akbar', password: simpleHash('Boy2014'), role: 'Admin' },
      { id: 'kepsek-1', name: 'Kepala Sekolah', username: 'kepsek', password: simpleHash('Ilwani2010'), role: 'Kepala Sekolah' }
    ];
  });

  useEffect(() => {
    localStorage.setItem('payedu_accounts', JSON.stringify(accounts));
  }, [accounts]);

  const [activeTabSetting, setActiveTabSetting] = useState(initialTab || 'umum');
  const [logSearch, setLogSearch] = useState('');
  const [logStatusFilter, setLogStatusFilter] = useState('ALL'); // ALL, SUCCESS, FAILED
  
  // 🛡️ State Log Audit Finansial & Sistem
  const [auditSearch, setAuditSearch] = useState('');
  const [auditCategoryFilter, setAuditCategoryFilter] = useState(initialAuditCategory || 'ALL'); // ALL, finansial, presensi_guru, pegawai, sistem

  useEffect(() => {
    if (initialTab) setActiveTabSetting(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (initialAuditCategory) setAuditCategoryFilter(initialAuditCategory);
  }, [initialAuditCategory]);

  const filteredAuditLogs = useMemo(() => {
    return (auditLogs || []).filter(log => {
      const actor = (log.actor || '').toLowerCase();
      const action = (log.action || '').toLowerCase();
      const target = (log.target || '').toLowerCase();
      const detail = (log.detail || '').toLowerCase();
      const cat = (log.category || '').toLowerCase();
      const s = auditSearch.toLowerCase().trim();
      const matchSearch = !s || actor.includes(s) || action.includes(s) || target.includes(s) || detail.includes(s);
      
      let matchCategory = true;
      if (auditCategoryFilter === 'ALL') {
        matchCategory = true;
      } else if (auditCategoryFilter === 'finansial') {
        matchCategory = cat === 'finansial' || cat === 'gaji' || action.includes('gaji') || action.includes('tunjangan') || action.includes('potongan') || action.includes('insentif') || action.includes('arsip') || action.includes('approval') || action.includes('pinjaman');
      } else if (auditCategoryFilter === 'presensi_guru') {
        matchCategory = cat === 'presensi_guru' || cat === 'presensi' || action.includes('presensi') || action.includes('absen') || action.includes('hadir') || action.includes('izin') || action.includes('sakit') || action.includes('terlambat') || action.includes('cuti');
      } else if (auditCategoryFilter === 'pegawai') {
        matchCategory = cat === 'pegawai' || cat === 'guru' || action.includes('pegawai') || action.includes('guru') || action.includes('biodata') || action.includes('duplikat') || action.includes('nipy');
      } else if (auditCategoryFilter === 'sistem') {
        matchCategory = cat === 'sistem' || cat === 'pengaturan' || !cat || action.includes('login') || action.includes('restore') || action.includes('reset') || action.includes('maintenance') || action.includes('profil') || action.includes('logo') || action.includes('akun') || action.includes('sistem');
      } else {
        matchCategory = cat === auditCategoryFilter.toLowerCase();
      }

      return matchSearch && matchCategory;
    });
  }, [auditLogs, auditSearch, auditCategoryFilter]);

  const handleExportAuditCSV = () => {
    const headers = ['Waktu & Tanggal', 'Aktor / Petugas', 'Kategori', 'Tindakan', 'Sasaran', 'Rincian Perubahan'];
    const rows = filteredAuditLogs.map(log => [
      log.timestamp ? `${formatDateId(log.timestamp.split('T')[0])} ${new Date(log.timestamp).toLocaleTimeString('id-ID')}` : '-',
      log.actor || '-',
      log.category || 'sistem',
      log.action || '-',
      log.target || '-',
      log.detail || '-'
    ]);

    const csvContent = [headers.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','), ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Log_Audit_Finansial_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const settingTabs = [
    { id: 'umum', label: 'Umum & Tampilan', icon: Building, desc: 'Logo, Nama & Kontak' },
    { id: 'tarif', label: 'Master Tarif', icon: Database, desc: 'Variabel Dinamis Gaji' }, // 🪄 TAMBAHAN: Tab Tarif
    { id: 'portal', label: 'Teks Portal Guru', icon: FileText, desc: 'Aturan & Info Penggajian' },
    { id: 'akun', label: 'Manajemen Akses', icon: Key, desc: 'Kelola Akun & Login' },
    { id: 'sistem', label: 'Pengaturan Sistem', icon: Settings, desc: 'Sistem & Keamanan' },
    { id: 'audit', label: 'Log Audit Finansial', icon: ShieldCheck, desc: 'Jejak Audit Keuangan & Sistem' },
    { id: 'riwayat', label: 'Riwayat Login', icon: Clock, desc: 'Log Aktivitas Guru' },
    { id: 'saran', label: 'Kritik & Saran', icon: MessageSquare, desc: 'Aspirasi & Masukan' },
  ];

  // 🪄 Riwayat Akses Terurut Kronologis & Terfilter
  const sortedLogs = useMemo(() => {
    return sortLoginLogs(loginHistory || []);
  }, [loginHistory]);

  const filteredLogs = useMemo(() => {
    return sortedLogs.filter(log => {
      const name = (log.name || '').toLowerCase();
      const role = (log.role || '').toLowerCase();
      const device = (log.device || '').toLowerCase();
      const s = logSearch.toLowerCase().trim();
      const matchSearch = !s || name.includes(s) || role.includes(s) || device.includes(s);
      
      const isFailed = String(log.status || '').toLowerCase().includes('gagal');
      const matchStatus = logStatusFilter === 'ALL' 
        ? true 
        : logStatusFilter === 'SUCCESS' ? !isFailed : isFailed;
      
      return matchSearch && matchStatus;
    });
  }, [sortedLogs, logSearch, logStatusFilter]);

  // PENYEDERHANAAN MUTLAK: Sinkronisasi Akun yang Jauh Lebih Mudah Dikelola
  useEffect(() => {
    // 1. Ambil data Admin/Kepsek dari memori lokal (bebas dari sinkronisasi awan)
    const adminAccs = JSON.parse(localStorage.getItem('payedu_admin_accounts')) || [
      { id: 'admin-1', name: 'Administrator System', username: 'Akbar', password: simpleHash('Boy2014'), role: 'Admin' },
      { id: 'kepsek-1', name: 'Kepala Sekolah', username: 'kepsek', password: simpleHash('Ilwani2010'), role: 'Kepala Sekolah' }
    ];

    // 2. Petakan data Guru secara langsung dari database guru dengan urutan rapi dan status keaktifan
    const sortedTeachers = sortTeachersById(teachers);
    const teacherAccounts = sortedTeachers.map(t => {
      const cleanName = t.name ? t.name.replace(/[^a-zA-Z]/g, '') : 'GU';
      const defaultPass = `${cleanName.length >= 2 ? cleanName.substring(0, 2).toUpperCase() : 'GU'}123`;
      const isAct = isTeacherActive(t);
      
      return { 
        id: t.id, 
        name: t.name, 
        username: t.id, 
        password: t.customPassword || simpleHash(defaultPass),
        plainPassword: t.plainPassword || defaultPass, // Password akan selalu tampil JELAS untuk Admin
        role: 'Guru',
        phone: t.phone || '',
        isActive: isAct,
        workStatus: t.workStatus || (isAct ? 'Aktif' : 'Resign'),
        registeredDeviceId: t.registeredDeviceId || null,
        registeredDeviceName: t.registeredDeviceName || null,
        registeredDeviceAt: t.registeredDeviceAt || null
      };
    });
    
    setAccounts([...adminAccs, ...teacherAccounts]);
  }, [teachers]);

  const [searchAcc, setSearchAcc] = useState('');
  const [accStatusFilter, setAccStatusFilter] = useState('AKTIF'); // 'AKTIF', 'ALL', 'ADMIN', 'RESIGN'
  const [modal, setModal] = useState({ isOpen: false, type: null, data: null });
  
  // FITUR BARU: State untuk Micro-Interaction Tombol Simpan
  const [isSaving, setIsSaving] = useState(false);
  
  // TAMBAHAN: State Custom Modal Konfirmasi Database (Pengganti prompt yang diblokir)
  const [confirmResetDb, setConfirmResetDb] = useState({ isOpen: false, keyword: '' });

  // FITUR BARU: State Modal Konfirmasi Migrasi ID
  const [confirmMigrate, setConfirmMigrate] = useState(false);

  // 🪄 TAMBAHAN: State untuk Simulasi Kenaikan Gaji
  const [simulasiPersen, setSimulasiPersen] = useState(10);

  // 🪄 TAMBAHAN: State untuk Master Tarif Dinamis (Masa Kerja diubah menjadi Array of Objects untuk Tabel Cerdas)
  const [localRatesText, setLocalRatesText] = useState({
     tenure: Object.entries(settings?.masterRates?.TENURE_RATES || TENURE_RATES)
               .map(([k,v]) => ({ year: k, nominal: v }))
               .sort((a,b) => Number(b.year) - Number(a.year)), // Urutkan dari tahun terbaru ke terlama
     edu: Object.entries(settings?.masterRates?.EDU_RATES || EDU_RATES).map(([k,v]) => `${k}=${v}`).join('\n'),
     jobCat: (settings?.masterRates?.JOB_CATEGORIES || JOB_CATEGORIES).join('\n'),
     jobRoles: (settings?.masterRates?.JOB_ROLES || JOB_ROLES).join('\n'),
     kinerja: settings?.masterRates?.KINERJA_RATES 
       ? Object.entries(settings.masterRates.KINERJA_RATES).map(([k,v]) => `${k}=${v}`).join('\n')
       : (Array.isArray(settings?.masterRates?.KINERJA_LEVELS) 
           ? settings.masterRates.KINERJA_LEVELS.map(k => `${k}=${KINERJA_RATES[k] || 0}`).join('\n')
           : 'Sangat Baik=100000\nBaik=50000\nCukup=0\nKurang=0'),
     kompFields: (settings?.masterRates?.KOMPETENSI_FIELDS || KOMPETENSI_FIELDS).join('\n'),
     kompLevels: settings?.masterRates?.KOMPETENSI_LEVEL_RATES
       ? Object.entries(settings.masterRates.KOMPETENSI_LEVEL_RATES).map(([k,v]) => `${k}=${v}`).join('\n')
       : (Array.isArray(settings?.masterRates?.KOMPETENSI_LEVELS)
           ? settings.masterRates.KOMPETENSI_LEVELS.map(k => `${k}=${KOMPETENSI_LEVEL_RATES[k] || 0}`).join('\n')
           : 'Sangat Ahli=150000\nAhli=100000\nCukup Ahli=75000\nPra Ahli=50000\nPemula=25000'),
     insentif: (settings?.masterRates?.INSENTIF_LIST || INSENTIF_LIST).join('\n'),
     potongan: (settings?.masterRates?.POTONGAN_LIST || POTONGAN_LIST).join('\n'),
  });

  // TAMBAHAN: State Notifikasi Lokal untuk Error AI Summarizer
  const [notification, setNotification] = useState({ isOpen: false, type: '', message: '' });

  // PERBAIKAN CERDAS: Filter Akun dengan urutan deterministik & filter status keaktifan
  const filteredAccounts = useMemo(() => {
    return (accounts || []).filter(a => {
      const name = (a.name || '').toLowerCase();
      const uname = (a.username || '').toLowerCase();
      const s = searchAcc.toLowerCase().trim();
      const matchSearch = !s || name.includes(s) || uname.includes(s);
      if (!matchSearch) return false;

      if (accStatusFilter === 'ADMIN') {
        return a.role === 'Admin' || a.role === 'Kepala Sekolah' || a.role === 'Yayasan';
      }
      if (accStatusFilter === 'RESIGN') {
        return a.role === 'Guru' && a.isActive === false;
      }
      if (accStatusFilter === 'AKTIF') {
        return a.role !== 'Guru' || a.isActive !== false;
      }
      return true; // 'ALL'
    }).sort((a, b) => {
      const isAAdmin = a.role === 'Admin' || a.role === 'Kepala Sekolah' || a.role === 'Yayasan';
      const isBAdmin = b.role === 'Admin' || b.role === 'Kepala Sekolah' || b.role === 'Yayasan';
      if (isAAdmin && !isBAdmin) return -1;
      if (!isAAdmin && isBAdmin) return 1;
      return String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true });
    });
  }, [accounts, searchAcc, accStatusFilter]);

  // 📱 Handler Reset Kunci Perangkat HP Guru
  const handleResetTeacherDevice = async (acc) => {
    const isConfirmed = window.confirm(`Reset kunci perangkat untuk "${acc.name || 'guru ini'}"?\n\nSetelah direset, guru dapat mengaitkan HP barunya saat login atau presensi berikutnya.`);
    if (!isConfirmed) return;

    setTeachers(prev => {
      const updated = prev.map(t => {
        if (String(t.id) === String(acc.id)) {
          const copy = { ...t };
          delete copy.registeredDeviceId;
          delete copy.registeredDeviceName;
          delete copy.registeredHwFingerprint;
          delete copy.registeredDeviceAt;
          return copy;
        }
        return t;
      });
      safeStorageSet('payedu_teachers', updated);
      pushToSupabase('SAVE_TEACHERS', updated).catch(e => console.warn(e));
      return updated;
    });

    alert(`Berhasil! Kunci HP untuk "${acc.name}" telah dibuka.\nGuru dapat mendaftarkan HP barunya saat presensi berikutnya.`);
  };

  // 📱 Handler Reset Kunci Perangkat HP untuk SEMUA Guru Sekaligus
  const handleResetAllTeacherDevices = () => {
    const isConfirmed = window.confirm(
      "PERHATIAN: Apakah Anda yakin ingin membuka kuncian HP untuk SEMUA guru?\n\nSemua guru akan dapat mendaftarkan HP barunya secara otomatis pada saat presensi berikutnya."
    );
    if (!isConfirmed) return;

    setTeachers(prev => {
      const updated = prev.map(t => {
        const copy = { ...t };
        delete copy.registeredDeviceId;
        delete copy.registeredDeviceName;
        delete copy.registeredHwFingerprint;
        delete copy.registeredDeviceAt;
        return copy;
      });
      safeStorageSet('payedu_teachers', updated);
      pushToSupabase('SAVE_TEACHERS', updated).catch(e => console.warn(e));
      return updated;
    });

    alert("✅ Berhasil! Kunci HP seluruh guru telah di-reset.\nGuru dapat menautkan HP baru saat presensi.");
  };

  // 🛡️ Handler Master Switch Kunci 1 Akun 1 HP Guru (Aktifkan / Nonaktifkan Global)
  const isGlobalDeviceLockActive = !!settings?.presensiGuruSettings?.deviceLockEnabled;

  const handleToggleGlobalDeviceLock = () => {
    const nextVal = !isGlobalDeviceLockActive;
    const confirmMsg = nextVal 
      ? "Aktifkan Kunci 1 Akun 1 HP Guru (Device Lock)?\n\nKetika aktif, setiap guru hanya bisa absen dari 1 HP terdaftar miliknya. Titip absen dari HP guru lain akan otomatis ditolak."
      : "Nonaktifkan Kunci HP Guru?\n\nKetika dinonaktifkan, guru bebas presensi dari HP atau browser mana saja tanpa batasan perangkat.";
    if (!window.confirm(confirmMsg)) return;

    const currentPresensiSettings = settings?.presensiGuruSettings || {};
    const updatedPresensiSettings = {
      ...currentPresensiSettings,
      deviceLockEnabled: nextVal
    };
    const updatedSettings = {
      ...settings,
      presensiGuruSettings: updatedPresensiSettings,
      lastModified: Date.now()
    };
    setSettings(updatedSettings);
    safeStorageSet('payedu_settings', updatedSettings);
    try {
      localStorage.setItem('payedu_presensi_guru_settings', JSON.stringify(updatedPresensiSettings));
    } catch (e) {}
    pushToSupabase('SAVE_SETTINGS', updatedSettings).catch(e => console.warn(e));
    alert(nextVal 
      ? "✅ KUNCI 1 AKUN 1 HP GURU BERHASIL DIAKTIFKAN!\n\nSetiap guru kini wajib absen dari HP resmi miliknya." 
      : "🔓 KUNCI HP GURU TELAH DINONAKTIFKAN!\n\nGuru kini bebas presensi dari browser atau HP mana saja."
    );
  };

  // 🪄 TAMBALAN CERDAS: Export Data Login ke CSV Sesuai Gambar 🪄
  const handleExportLoginCSV = () => {
    const headers = ['ID', 'Nama Lengkap', 'USER NAME', 'PASSWORD'];
    const csvRows = [headers.join(';')];
    
    filteredAccounts.forEach(acc => {
        if (acc.role === 'Guru') {
            let passText = acc.plainPassword || `${(acc.name.replace(/[^a-zA-Z]/g, '').substring(0,2).toUpperCase() || 'GU')}123`;
            csvRows.push([acc.id, `"${acc.name}"`, acc.username, `"${passText}"`].join(';'));
        }
    });
    
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Data_Akses_Login_Guru_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveGeneral = (e) => {
    e.preventDefault();
    setIsSaving(true);
    
    const newSettings = { ...settings, lastModified: Date.now() };
    setSettings(newSettings);
    safeStorageSet('payedu_settings', newSettings);
    
    // PAKSA SIMPAN LANGSUNG KE SERVER (Bypass Auto-save)
    postToGoogleSheets('SAVE_SETTINGS', newSettings)
    .then(() => {
       setIsSaving(false);
       alert('Pengaturan Umum berhasil disimpan permanen!');
    }).catch(() => {
       setIsSaving(false);
       alert('Gagal sinkronisasi ke server, namun tersimpan di perangkat.');
    });
  };

  // 🪄 FUNGSI BARU: Handler untuk Tabel Cerdas Masa Kerja
  const handleAddTenureRow = () => {
    setLocalRatesText(prev => ({
        ...prev,
        tenure: [{ year: '', nominal: 0 }, ...prev.tenure]
    }));
  };

  const handleUpdateTenureRow = (index, field, value) => {
    setLocalRatesText(prev => {
        const newTenure = [...prev.tenure];
        newTenure[index][field] = value;
        return { ...prev, tenure: newTenure };
    });
  };

  const handleRemoveTenureRow = (index) => {
    setLocalRatesText(prev => {
        const newTenure = [...prev.tenure];
        newTenure.splice(index, 1);
        return { ...prev, tenure: newTenure };
    });
  };

  // 🪄 FUNGSI BARU: Simpan Master Tarif Dinamis
  const handleSaveRates = (e) => {
    e.preventDefault();
    setIsSaving(true);
    
    const parseMap = (text) => {
       const map = {};
       (text || '').split('\n').forEach(line => {
          if(!line.trim()) return;
          const parts = line.split('=');
          if(parts.length >= 2) {
             map[parts[0].trim()] = Number(parts[1].replace(/\D/g, '')) || 0;
          }
       });
       return map;
    };
    
    const parseList = (text) => (text || '').split('\n').map(l => l.trim()).filter(l => l !== '');

    const kinerjaMap = parseMap(localRatesText.kinerja);
    const kinerjaList = Object.keys(kinerjaMap).length > 0 ? Object.keys(kinerjaMap) : parseList(localRatesText.kinerja);

    const kompLevelsMap = parseMap(localRatesText.kompLevels);
    const kompLevelsList = Object.keys(kompLevelsMap).length > 0 ? Object.keys(kompLevelsMap) : parseList(localRatesText.kompLevels);

    const newMasterRates = {
       TENURE_RATES: localRatesText.tenure.reduce((acc, curr) => {
           if(curr.year && String(curr.year).trim() !== '') {
               acc[curr.year] = Number(curr.nominal) || 0;
           }
           return acc;
       }, {}),
       EDU_RATES: parseMap(localRatesText.edu),
       JOB_CATEGORIES: parseList(localRatesText.jobCat),
       JOB_ROLES: parseList(localRatesText.jobRoles),
       KINERJA_LEVELS: kinerjaList,
       KINERJA_RATES: kinerjaMap,
       KOMPETENSI_FIELDS: parseList(localRatesText.kompFields),
       KOMPETENSI_LEVELS: kompLevelsList,
       KOMPETENSI_LEVEL_RATES: kompLevelsMap,
       INSENTIF_LIST: parseList(localRatesText.insentif),
       POTONGAN_LIST: parseList(localRatesText.potongan),
    };

    const newSettings = { ...settings, masterRates: newMasterRates, lastModified: Date.now() };
    setSettings(newSettings);
    safeStorageSet('payedu_settings', newSettings);
    
    postToGoogleSheets('SAVE_SETTINGS', newSettings)
    .then(() => {
       setIsSaving(false);
       alert('Mantap! Master Tarif dan Variabel berhasil diperbarui secara global!');
    }).catch(() => {
       setIsSaving(false);
       alert('Koneksi terputus. Data tersimpan secara lokal.');
    });
  };

  const handleSaveAccount = (e) => {
    e.preventDefault();
    setIsSaving(true);
    
    const formData = new FormData(e.target);
    const passInput = formData.get('password');
    const roleInput = formData.get('role');

    setTimeout(() => {
      if (roleInput === 'Guru' || modal.data?.role === 'Guru') {
         // SEDERHANA: Langsung ubah password Guru di state teachers
         if (passInput) {
            setTeachers(prev => prev.map(t => {
               if (t.id === modal.data.id) {
                  return { ...t, customPassword: simpleHash(passInput), plainPassword: passInput };
               }
               return t;
            }));
            alert(`Selesai! Password untuk ${modal.data?.name} berhasil diubah menjadi: ${passInput}`);
         }
      } else {
         // SEDERHANA: Simpan Admin ke Local Storage terpisah
         const adminAccs = JSON.parse(localStorage.getItem('payedu_admin_accounts')) || [
           { id: 'admin-1', name: 'Administrator System', username: 'Akbar', password: simpleHash('Boy2014'), role: 'Admin' },
           { id: 'kepsek-1', name: 'Kepala Sekolah', username: 'kepsek', password: simpleHash('Ilwani2010'), role: 'Kepala Sekolah' }
         ];
         
         const newData = {
            name: formData.get('name'),
            username: formData.get('username'),
            role: roleInput,
            password: passInput ? simpleHash(passInput) : (modal.data?.password || simpleHash('12345678'))
         };
         
         let updatedAdmins;
         if (modal.type === 'add') {
           updatedAdmins = [{ id: generateUniqueId('acc-'), ...newData }, ...adminAccs];
         } else {
           updatedAdmins = adminAccs.map(a => a.id === modal.data.id ? { ...a, ...newData } : a);
         }
         
         localStorage.setItem('payedu_admin_accounts', JSON.stringify(updatedAdmins));
         setAccounts([...updatedAdmins, ...accounts.filter(a => a.role === 'Guru')]);
         alert('Data akses Admin berhasil disimpan.');
      }
      setIsSaving(false);
      setModal({ isOpen: false, type: null, data: null });
    }, 300);
  };

  const handleDeleteAccount = () => {
    if (modal.data.role === 'Guru') {
       // Jika Guru, kita reset saja passwordnya ke default
       setTeachers(prev => prev.map(t => {
           if (t.id === modal.data.id) {
              return { ...t, customPassword: null, plainPassword: null };
           }
           return t;
       }));
       alert(`Selesai! Password untuk ${modal.data.name} telah direset kembali ke default.`);
    } else {
       if (modal.data.role === 'Admin' && accounts.filter(a => a.role === 'Admin').length <= 1) {
         alert('Akses ditolak: Aplikasi harus memiliki setidaknya satu akun Admin aktif!');
         setModal({ isOpen: false, type: null, data: null });
         return;
       }
       const adminAccs = JSON.parse(localStorage.getItem('payedu_admin_accounts')) || [];
       const updatedAdmins = adminAccs.filter(a => a.id !== modal.data.id);
       localStorage.setItem('payedu_admin_accounts', JSON.stringify(updatedAdmins));
       setAccounts([...updatedAdmins, ...accounts.filter(a => a.role === 'Guru')]);
       alert('Akun Admin berhasil dihapus dari sistem.');
    }
    setModal({ isOpen: false, type: null, data: null });
  };

  const handleMarkFeedbackDone = (id) => {
    setFeedbacks(feedbacks.map(fb => fb.id === id ? { ...fb, status: 'Selesai' } : fb));
  };

  const openModal = (type, data = null) => setModal({ isOpen: true, type, data });

  // Fungsionalitas Sistem (Backup, Restore, Reset, Toggles)
  const handleBackupData = () => {
    // 🪄 TAMBALAN CERDAS: Memastikan seluruh instrumen aplikasi tercadangkan tanpa ada yang tertinggal
    const backupData = { 
       timestamp: new Date().toISOString(),
       version: '2.0.Pro',
       settings, 
       teachers, 
       accounts,
       archives,
       presensiGuru,
       auditLogs,
       fundingSources,
       feedbacks,
       loginHistory
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `PayEdu_Full_Backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    saveAuditLog?.('Administrator', 'Backup Database', 'Seluruh Database', 'Mengunduh file backup JSON lengkap (Pegawai, Gaji, Arsip, Presensi, Log)', 'sistem');
  };

  const handleRestoreData = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        let rawContent = evt.target.result;
        if (typeof rawContent === 'string') {
          // Bersihkan BOM jika file diekspor dengan encoding UTF-8 with BOM
          rawContent = rawContent.replace(/^\uFEFF/, '').trim();
        }
        
        let data = JSON.parse(rawContent);
        // Jika file berformat JSON bertingkat (string di dalam JSON), parse sekali lagi
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch(e) {}
        }

        // Ekstraksi jika data berada di dalam wrapper seperti data.data atau data.payload
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
            data = { ...data.data, ...data };
          } else if (data.payload && typeof data.payload === 'object' && !Array.isArray(data.payload)) {
            data = { ...data.payload, ...data };
          }
        }

        // 1. Ekstraksi Data Guru / Pegawai (fleksibel menerima beragam nama field backup lama)
        let rawTeachers = null;
        if (Array.isArray(data)) {
          rawTeachers = data;
        } else if (data && typeof data === 'object') {
          rawTeachers = data.teachers || data.dataGuru || data.guruList || data.pegawai || (Array.isArray(data.data) ? data.data : null);
          if (typeof rawTeachers === 'string') {
            try { rawTeachers = JSON.parse(rawTeachers); } catch(e) {}
          }
        }

        // 2. Ekstraksi Pengaturan (Settings)
        let rawSettings = null;
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          rawSettings = data.settings || data.pengaturan || data.generalSettings || data.appSettings;
          if (typeof rawSettings === 'string') {
            try { rawSettings = JSON.parse(rawSettings); } catch(e) {}
          }
        }

        // Validasi kelayakan file backup (minimal ada data guru atau data pengaturan)
        if ((rawTeachers && Array.isArray(rawTeachers)) || (rawSettings && typeof rawSettings === 'object')) {
          setIsSaving(true);

          let restoredTeachersCount = 0;
          let cleanTeachers = teachers;
          if (rawTeachers && Array.isArray(rawTeachers)) {
            cleanTeachers = sanitizeTeacherList(rawTeachers);
            setTeachers(cleanTeachers);
            safeStorageSet('payedu_teachers', cleanTeachers);
            restoredTeachersCount = cleanTeachers.length;
          }

          let cleanSettings = settings;
          if (rawSettings && typeof rawSettings === 'object') {
            cleanSettings = { ...settings, ...rawSettings, lastModified: Date.now() };
            setSettings(cleanSettings);
            safeStorageSet('payedu_settings', cleanSettings);
          }

          // Ekstraksi Akun Admin & Guru
          let rawAccounts = data?.accounts || data?.akun;
          if (typeof rawAccounts === 'string') {
            try { rawAccounts = JSON.parse(rawAccounts); } catch(e) {}
          }
          if (rawAccounts && Array.isArray(rawAccounts)) {
            setAccounts(rawAccounts);
            const adminAccs = rawAccounts.filter(a => a.role !== 'Guru');
            localStorage.setItem('payedu_admin_accounts', JSON.stringify(adminAccs));
          }

          // Ekstraksi Arsip Gaji
          let rawArchives = data?.archives || data?.arsip;
          if (typeof rawArchives === 'string') {
            try { rawArchives = JSON.parse(rawArchives); } catch(e) {}
          }
          if (rawArchives && Array.isArray(rawArchives) && setArchives) {
            setArchives(rawArchives);
            safeStorageSet('payedu_archives', rawArchives);
          }

          // Ekstraksi Presensi Guru
          let rawPresensi = data?.presensiGuru || data?.presensi;
          if (typeof rawPresensi === 'string') {
            try { rawPresensi = JSON.parse(rawPresensi); } catch(e) {}
          }
          if (rawPresensi && Array.isArray(rawPresensi) && setPresensiGuru) {
            setPresensiGuru(rawPresensi);
            safeStorageSet('payedu_presensi_guru', rawPresensi);
            pushPresensiGuru(rawPresensi).catch(err => console.warn("Sync presensi error:", err));
          }

          // Ekstraksi Audit Logs
          let rawLogs = data?.auditLogs || data?.logs;
          if (typeof rawLogs === 'string') {
            try { rawLogs = JSON.parse(rawLogs); } catch(e) {}
          }
          if (rawLogs && Array.isArray(rawLogs) && setAuditLogs) {
            setAuditLogs(rawLogs);
            safeStorageSet('payedu_audit_logs', rawLogs);
          }

          // Ekstraksi Sumber Dana
          let rawFunding = data?.fundingSources || data?.funding;
          if (typeof rawFunding === 'string') {
            try { rawFunding = JSON.parse(rawFunding); } catch(e) {}
          }
          if (rawFunding && Array.isArray(rawFunding) && setFundingSources) {
            setFundingSources(rawFunding);
            localStorage.setItem('payedu_funding', JSON.stringify(rawFunding));
          }

          // Ekstraksi Feedback & Login History
          if (data?.feedbacks && Array.isArray(data.feedbacks) && setFeedbacks) {
            setFeedbacks(data.feedbacks);
            safeStorageSet('payedu_feedbacks', data.feedbacks);
          }
          if (data?.loginHistory && Array.isArray(data.loginHistory) && setLoginHistory) {
            setLoginHistory(data.loginHistory);
            safeStorageSet('payedu_loginHistory', data.loginHistory);
          }

          // 3. Sinkronisasi ke Supabase Cloud jika online
          if (navigator.onLine) {
            const syncPayload = {
              settings: cleanSettings,
              teachers: cleanTeachers,
              accounts: rawAccounts || accounts,
              archives: rawArchives || archives,
              fundingSources: rawFunding || fundingSources,
              feedbacks: data?.feedbacks || feedbacks,
              loginHistory: data?.loginHistory || loginHistory
            };
            await pushToSupabase('RESTORE_ALL', syncPayload).catch(e => console.warn("Supabase sync warning:", e));
          }

          saveAuditLog?.('Administrator', 'Restore Database', 'Seluruh Database', `Memulihkan database dari file backup JSON (${restoredTeachersCount} data pegawai)`, 'sistem');

          setIsSaving(false);
          alert(`✅ RESTORE & SYNC DATA BERHASIL!\n\nFile cadangan JSON telah berhasil dipulihkan ke perangkat dan disinkronkan ke Cloud Supabase:\n• Data Pegawai: ${restoredTeachersCount} orang\n• Pengaturan Aplikasi: Sukses\n• Data Pendukung: Terpulihkan.`);
        } else {
          setIsSaving(false);
          alert("File backup tidak memiliki struktur data pegawai atau pengaturan yang valid. Pastikan file yang dipilih adalah file .json backup PayEdu.");
        }
      } catch (err) {
        setIsSaving(false);
        console.error("Restore error:", err);
        alert(`Gagal membaca file backup:\n${err.message || 'Format JSON tidak dikenali atau rusak.'}\n\nPastikan file yang dipilih adalah file .json yang valid.`);
      }
      e.target.value = null;
    };
    reader.readAsText(file);
  };

  const handleResetDatabase = () => {
     setConfirmResetDb({ isOpen: true, keyword: '' });
  };

  // 🪄 PERBAIKAN MUTLAK: FACTORY RESET (Sapu bersih lokal & server)
  const executeResetDatabase = async () => {
     if (confirmResetDb.keyword === 'RESET TOTAL') {
        setIsSaving(true);
        
        // 1. Kosongkan Data di Tampilan (State)
        setTeachers([]);
        if(setArchives) setArchives([]);
        if(setFeedbacks) setFeedbacks([]);
        if(setLoginHistory) setLoginHistory([]);

        // 2. Sapu Bersih Memori Lokal (LocalStorage) di Laptop yang sedang dipakai
        localStorage.removeItem('payedu_teachers');
        localStorage.removeItem('payedu_archives');
        localStorage.removeItem('payedu_feedbacks');
        localStorage.removeItem('payedu_loginHistory');

        setConfirmResetDb({ isOpen: false, keyword: '' });
        
        // 3. Tembak Perintah Sapu Bersih ke Server (Google Sheets)
        try {
           await Promise.allSettled([
              postToGoogleSheets('SAVE_TEACHERS', []),
              postToGoogleSheets('SAVE_ARCHIVES', []),
              postToGoogleSheets('SAVE_FEEDBACKS', []),
              postToGoogleSheets('SAVE_LOGS', [])
           ]);
           setIsSaving(false);
           alert("✨ FACTORY RESET BERHASIL! ✨\n\nSeluruh data pegawai, arsip, dan riwayat di perangkat ini maupun di Server Cloud telah dibersihkan secara total.\n\nAplikasi Anda kini kembali seperti baru pertama kali digunakan!");
           window.location.reload(); // Muat ulang paksa halaman
        } catch (e) {
           setIsSaving(false);
           alert("Gagal terhubung ke server, namun memori perangkat ini telah dibersihkan.");
           window.location.reload();
        }
     } else {
        alert("Reset dibatalkan. Kata kunci yang Anda ketik salah. Pastikan mengetik: RESET TOTAL");
     }
  };

  // FUNGSI BARU: Eksekusi Migrasi ID Automatik
  const executeMigrateIDs = () => {
     let currentNumber = 1;
     const updatedTeachers = teachers.map(t => {
         const newId = `G${String(currentNumber).padStart(2, '0')}QA`;
         currentNumber++;
         return { ...t, id: newId };
     });
     
     setTeachers(updatedTeachers);
     setConfirmMigrate(false);
     
     // Disebabkan ada useEffect di App.jsx yang memantau state 'teachers', sistem 
     // akan automatik menolak (sync) ID baru ini ke Google Sheets, sekaligus
     // mengemas kini username login mereka.
     setTimeout(() => alert("Berjaya! Semua ID pegawai telah ditukar ke format berurutan (G01QA, G02QA, dst). Username login mereka juga telah dikemas kini!"), 300);
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full relative pb-10">
      
      {/* TAMBAHAN: Custom Notifikasi / Toast untuk Menangkap Error AI */}
      {notification.isOpen && (
        <div className="fixed top-20 right-4 md:right-10 z-[100] animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="p-4 rounded-xl shadow-xl border flex items-center gap-3 max-w-sm bg-red-50 border-red-200 text-red-800 dark:bg-red-900/90 dark:border-red-700 dark:text-red-200">
             <AlertCircle size={24} className="shrink-0" />
             <p className="text-sm font-medium">{notification.message}</p>
             <button onClick={() => setNotification({ isOpen: false, type: '', message: '' })} className="p-1 hover:bg-black/10 rounded-full transition-colors ml-auto"><X size={16}/></button>
          </div>
        </div>
      )}

      {/* 🪄 MODAL BARU: KONFIRMASI FACTORY RESET DATABASE */}
      {confirmResetDb.isOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[150] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 border-2 border-red-500">
            <div className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center mx-auto mb-4 border-4 border-white dark:border-slate-800 shadow-sm">
                <Trash2 size={36} />
              </div>
              <h3 className="text-xl font-black dark:text-white mb-2 text-red-600">FACTORY RESET (BAHAYA)</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-4 leading-relaxed">
                Tindakan ini akan <strong>MENGHAPUS PERMANEN</strong> seluruh data Pegawai, Rekap Gaji, Arsip Bulan Lalu, dan Riwayat Login dari Server dan Perangkat ini. Aplikasi akan kembali kosong seperti baru.
              </p>
              
              <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl border border-red-200 dark:border-red-800/50 mt-4 text-left">
                 <label className="block text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wider mb-2">
                    Ketik <span className="bg-red-200 dark:bg-red-800 px-1.5 py-0.5 rounded text-black dark:text-white">RESET TOTAL</span> untuk melanjutkan:
                 </label>
                 <input 
                    type="text" 
                    value={confirmResetDb.keyword}
                    onChange={(e) => setConfirmResetDb({...confirmResetDb, keyword: e.target.value})}
                    placeholder="Ketik di sini..."
                    className="w-full p-3 border border-red-300 dark:border-red-600 rounded-lg text-sm font-black focus:ring-2 focus:ring-red-500 outline-none text-center"
                 />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-center gap-3 shrink-0">
              <button onClick={() => setConfirmResetDb({ isOpen: false, keyword: '' })} className="px-5 py-3 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-colors w-full">Batal</button>
              <button 
                onClick={executeResetDatabase} 
                disabled={isSaving || confirmResetDb.keyword !== 'RESET TOTAL'}
                className="px-5 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-md transition-colors w-full flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? <RefreshCw size={18} className="animate-spin" /> : <Trash2 size={18} />}
                {isSaving ? 'Menyapu Bersih...' : 'Ya, Sapu Bersih!'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI MIGRASI ID */}
      {confirmMigrate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center mx-auto mb-4 shadow-inner">
                <RefreshCw size={40} />
              </div>
              <h3 className="text-xl font-bold dark:text-white mb-2">Migrasi ID Pegawai?</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-4 leading-relaxed">
                Tindakan ini akan menyusun semula dan menukar semua ID rawak sedia ada menjadi format berurutan <strong className="text-slate-700 dark:text-slate-200">(G01QA, G02QA, dst)</strong>.<br/><br/>
                <strong className="text-red-500">PENTING:</strong> Username log masuk setiap guru juga akan dikemas kini serta-merta mengikut ID yang baharu!
              </p>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-center gap-3 shrink-0">
              <button onClick={() => setConfirmMigrate(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors w-full">Batal</button>
              <button 
                onClick={executeMigrateIDs} 
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-sm transition-colors w-full flex justify-center items-center gap-2"
              >
                <RefreshCw size={16} /> Ya, Teruskan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input File Tersembunyi untuk Restore JSON */}
      <input type="file" accept=".json" ref={fileInputRef} onChange={handleRestoreData} className="hidden" />

      {/* Modal Aksi Akun */}
      {modal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-lg dark:text-white flex items-center gap-2">
                {modal.type === 'add' || modal.type === 'edit' ? <Key className="text-amber-500" /> : modal.type === 'aiSummary' ? <Sparkles className="text-rose-500" /> : <Trash2 className="text-red-500" />}
                {modal.type === 'add' ? 'Tambah Hak Akses Baru' : modal.type === 'edit' ? 'Edit Hak Akses Login' : modal.type === 'aiSummary' ? 'Rangkuman Analisis Masukan' : 'Cabut Hak Akses Login'}
              </h3>
              <button onClick={() => setModal({ isOpen: false, type: null, data: null })} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
            </div>

            <div className="p-6 overflow-y-auto">
              {/* TAMBAHAN GEMINI AI: Tampilan Modal untuk Hasil Rangkuman AI */}
              {modal.type === 'aiSummary' && modal.data && (
                <div className="p-2 animate-in fade-in slide-in-from-bottom-2">
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 flex items-center justify-center mx-auto mb-3 shadow-inner border border-rose-200 dark:border-rose-800">
                      <Sparkles size={32} />
                    </div>
                    <h3 className="text-xl font-bold dark:text-white">Rangkuman Cerdas AI</h3>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-1">Ditenagai oleh Google Gemini API</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner">
                    <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed font-medium">
                      {modal.data}
                    </p>
                  </div>
                </div>
              )}

              {(modal.type === 'add' || modal.type === 'edit') && (
                <form id="accForm" onSubmit={handleSaveAccount} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Nama Lengkap Pengguna</label>
                    <input name="name" defaultValue={modal.data?.name || ''} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-slate-400 outline-none dark:text-white" required placeholder="Cth: Ahmad Dahlan" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Username</label>
                      <input name="username" defaultValue={modal.data?.username || ''} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-slate-400 outline-none dark:text-white font-bold" required placeholder="Cth: ahmad123" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Tipe Akses (Role)</label>
                      <select name="role" defaultValue={modal.data?.role || 'Guru'} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-slate-400 outline-none dark:text-white font-bold">
                        <option value="Guru">Akses Guru (Portal)</option>
                        <option value="Admin">Akses Admin (Full)</option>
                        <option value="Kepala Sekolah">Akses Kepala Sekolah</option>
                        <option value="Yayasan">Akses Yayasan</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Password</label>
                    <div className="relative">
                       <Lock size={16} className="absolute left-3 top-3 text-slate-400" />
                       <input name="password" type="text" placeholder={modal.type === 'edit' ? 'Abaikan jika tidak ganti password' : 'Buat password baru...'} className="w-full pl-9 pr-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-slate-400 outline-none dark:text-white" required={modal.type === 'add'} />
                    </div>
                  </div>
                </form>
              )}

              {modal.type === 'delete' && modal.data && (
                <div className="text-center">
                  <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center mx-auto mb-4">
                    <Trash2 size={40} />
                  </div>
                  <h3 className="text-xl font-bold dark:text-white mb-2">{modal.data.role === 'Guru' ? 'Reset Password Pegawai?' : 'Cabut Hak Akses?'}</h3>
                  <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    {modal.data.role === 'Guru' 
                      ? `Apakah Anda yakin ingin mereset password ${modal.data.name} kembali ke default bawaan sistem?` 
                      : `Apakah Anda yakin ingin mencabut hak akses login dari ${modal.data.name} (${modal.data.username})? Pengguna ini tidak akan bisa lagi masuk ke sistem.`}
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3 shrink-0">
              <button onClick={() => setModal({ isOpen: false, type: null, data: null })} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors text-sm">
                Batal
              </button>
              {(modal.type === 'edit' || modal.type === 'add') && (
                <button 
                  type="submit" 
                  form="accForm" 
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-600 dark:hover:bg-slate-500 text-white rounded-lg font-bold shadow-sm transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={16} />} 
                  {isSaving ? 'Memproses...' : (modal.type === 'add' ? 'Buat Akses' : 'Simpan Perubahan')}
                </button>
              )}
              {modal.type === 'delete' && (
                <button onClick={handleDeleteAccount} className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-sm transition-colors text-sm">
                  Ya, Cabut Akses
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header Abu Muda Cerah yang Profesional */}
      <div className="bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded-2xl p-3.5 sm:p-6 md:p-8 shadow-xs border border-slate-300 dark:border-slate-600 relative overflow-hidden flex items-center justify-between shrink-0 mb-3 sm:mb-6">
        <div className="relative z-10">
          <h1 className="text-lg sm:text-2xl md:text-3xl font-extrabold mb-1 sm:mb-2 tracking-tight flex items-center gap-2 sm:gap-3 text-slate-800 dark:text-white">
            <Settings className="text-slate-600 dark:text-slate-400" size={24} /> Pengaturan Sistem
          </h1>
          <p className="text-slate-600 dark:text-slate-300 text-xs sm:text-sm md:text-base leading-relaxed">
            Konfigurasi informasi umum aplikasi dan manajemen hak akses login secara terpusat.
          </p>
        </div>
        <Settings size={140} className="hidden sm:block absolute -right-10 -bottom-10 text-slate-300/50 dark:text-slate-600/30 transform rotate-12 pointer-events-none" />
      </div>

      <div className="flex flex-col md:flex-row gap-3 sm:gap-6 flex-1 min-h-0">
         
         {/* Navigasi Tab Vertikal (Desktop) & Swipeable Tab Pills (Mobile) */}
         <div className="w-full md:w-64 xl:w-72 shrink-0">
            {/* Tab Bar Horizontal Mobile */}
            <div className="flex md:hidden overflow-x-auto hide-scrollbar gap-1.5 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl mb-1">
               {settingTabs.map(tab => (
                  <button
                     key={tab.id}
                     type="button"
                     onClick={() => setActiveTabSetting(tab.id)}
                     className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all shrink-0 ${
                        activeTabSetting === tab.id
                           ? 'bg-blue-600 text-white shadow-xs'
                           : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                     }`}
                  >
                     <tab.icon size={13} />
                     <span>{tab.label}</span>
                  </button>
               ))}
            </div>

            <div className="hidden md:block bg-white dark:bg-slate-800 rounded-xl shadow-xs border border-slate-200 dark:border-slate-700 p-2 sm:p-3 md:sticky md:top-0">
               {/* Sidebar Desktop */}
               <nav className="flex flex-col gap-1.5">
                  {settingTabs.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTabSetting(tab.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 group ${
                        activeTabSetting === tab.id
                          ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 shadow-xs'
                          : 'border border-transparent hover:bg-slate-50 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      <div className={`p-2 rounded-lg shrink-0 transition-colors ${activeTabSetting === tab.id ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:text-slate-600'}`}>
                        <tab.icon size={18} />
                      </div>
                      <div>
                        <div className={`font-bold text-sm ${activeTabSetting === tab.id ? 'text-blue-700 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white'}`}>{tab.label}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">{tab.desc}</div>
                      </div>
                    </button>
                  ))}
               </nav>
            </div>
         </div>

         {/* Area Konten Tab */}
         <div className="flex-1 w-full bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col min-h-[500px]">
            
            {/* TAB: UMUM */}
            {activeTabSetting === 'umum' && (
              <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-2">
                <div className="p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 shrink-0">
                   <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                     <Building className="text-slate-500" size={18} /> Konfigurasi Umum Aplikasi
                   </h3>
                </div>
                <div className="p-6 overflow-y-auto flex-1">
                  <form id="formUmum" onSubmit={handleSaveGeneral} className="space-y-6 max-w-2xl">
                     <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-2">
                       <div className="w-20 h-20 rounded-xl bg-slate-100 dark:bg-slate-700 border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center overflow-hidden shrink-0">
                          {settings.logoUrl ? <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-contain p-2" /> : <Building size={24} className="text-slate-400" />}
                       </div>
                       <div className="flex-1 w-full">
                          <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">URL Logo (Link Gambar)</label>
                          <input 
                            type="url" value={settings.logoUrl || ''} 
                            onChange={e => setSettings({...settings, logoUrl: e.target.value})} 
                            className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-400 outline-none dark:text-white" 
                            placeholder="https://contoh.com/logo.png"
                          />
                       </div>
                     </div>

                     <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Nama Aplikasi / Portal</label>
                          <input 
                            type="text" value={settings.appName || ''} 
                            onChange={e => setSettings({...settings, appName: e.target.value})} 
                            className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-400 outline-none dark:text-white font-medium" 
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Versi Aplikasi</label>
                          <input 
                            type="text" value={settings.appVersion || 'v1.2.5'} 
                            onChange={e => setSettings({...settings, appVersion: e.target.value})} 
                            className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-blue-50/50 dark:bg-blue-900/10 text-blue-700 dark:text-blue-300 text-sm font-bold font-mono focus:ring-2 focus:ring-blue-400 outline-none" 
                            placeholder="Cth: v1.2.5"
                          />
                        </div>
                     </div>

                     <div className="grid grid-cols-1 gap-5">
                       <div>
                         <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Nama Yayasan</label>
                         <input 
                           type="text" value={settings.foundationName || ''} 
                           onChange={e => setSettings({...settings, foundationName: e.target.value})} 
                           className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-semibold focus:ring-2 focus:ring-blue-400 outline-none dark:text-white" 
                           placeholder="Cth: Yayasan Pendidikan XYZ"
                         />
                       </div>
                     </div>

                     <div>
                       <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Nama Resmi Sekolah</label>
                       <textarea 
                         rows="2" value={settings.schoolName || ''} 
                         onChange={e => setSettings({...settings, schoolName: e.target.value})} 
                         className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-semibold focus:ring-2 focus:ring-blue-400 outline-none dark:text-white resize-y" 
                         placeholder="Bisa dienter ke bawah..."
                       ></textarea>
                     </div>

                     {/* TAMBAHAN: Input Nama dan Tanda Tangan Kepala Sekolah */}
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                       <div>
                         <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Nama Kepala Sekolah</label>
                         <input 
                           type="text" value={settings.principalName || ''} 
                           onChange={e => setSettings({...settings, principalName: e.target.value})} 
                           className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-800 dark:text-emerald-300 text-sm font-bold focus:ring-2 focus:ring-blue-400 outline-none" 
                           placeholder="Cth: H. Fulan, S.Pd., M.Pd"
                         />
                       </div>
                       <div>
                         <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">URL Tanda Tangan (Format PNG Transparan)</label>
                         <input 
                           type="url" value={settings.signatureUrl || ''} 
                           onChange={e => setSettings({...settings, signatureUrl: e.target.value})} 
                           className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-800 dark:text-emerald-300 text-sm font-medium focus:ring-2 focus:ring-blue-400 outline-none" 
                           placeholder="https://contoh.com/ttd-kepsek.png"
                         />
                       </div>
                     </div>

                     <div>
                       <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Alamat Lengkap</label>
                       <textarea 
                         rows="3" value={settings.address || ''} 
                         onChange={e => setSettings({...settings, address: e.target.value})} 
                         className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-400 outline-none dark:text-white resize-none leading-relaxed" 
                       ></textarea>
                     </div>

                     {/* TAMBAHAN: Input Custom Link Avatar Pegawai Laki-laki dan Perempuan */}
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-3 border-t border-slate-200 dark:border-slate-700 mt-2">
                       <div>
                         <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">URL Avatar Pria (Link Gambar)</label>
                         <input 
                           type="url" value={settings.avatarMaleUrl || ''} 
                           onChange={e => setSettings({...settings, avatarMaleUrl: e.target.value})} 
                           className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-400 outline-none dark:text-white" 
                           placeholder="https://contoh.com/avatar-pria.png"
                         />
                       </div>
                       <div>
                         <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">URL Avatar Wanita (Link Gambar)</label>
                         <input 
                           type="url" value={settings.avatarFemaleUrl || ''} 
                           onChange={e => setSettings({...settings, avatarFemaleUrl: e.target.value})} 
                           className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-400 outline-none dark:text-white" 
                           placeholder="https://contoh.com/avatar-wanita.png"
                         />
                       </div>
                     </div>
                  </form>
                </div>
                {/* PERBAIKAN: Tombol Simpan untuk tab UMUM */}
                <div className="p-5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end shrink-0">
                   <button 
                     type="submit" 
                     form="formUmum" 
                     disabled={isSaving}
                     className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-md transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-70 disabled:cursor-not-allowed"
                   >
                      {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={18} />} 
                      {isSaving ? 'Menyimpan...' : 'Simpan Konfigurasi Umum'}
                   </button>
                </div>
              </div>
            )}

            {/* TAB: TEKS PORTAL GURU (DIKEMBALIKAN) */}
            {activeTabSetting === 'portal' && (
              <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-2">
                <div className="p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 shrink-0">
                   <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                     <FileText className="text-slate-500" size={18} /> Pengaturan Teks Informasi Portal Guru
                   </h3>
                </div>
                <div className="p-6 overflow-y-auto flex-1">
                  <form id="formPortal" onSubmit={(e) => {
                     e.preventDefault();
                     setIsSaving(true);
                     
                     const newSettings = {...settings, payrollInfoText: localPortalText, lastModified: Date.now()};
                     setSettings(newSettings);
                     safeStorageSet('payedu_settings', newSettings);
                     
                     // PAKSA SIMPAN LANGSUNG KE SERVER (Mutlak Tersimpan)
                     postToGoogleSheets('SAVE_SETTINGS', newSettings)
                     .then(() => {
                        setIsSaving(false);
                        alert('Mantap! Teks Portal Guru berhasil diperbarui dan dikunci ke server database!');
                     }).catch(() => {
                        setIsSaving(false);
                        alert('Koneksi terputus. Data tersimpan secara lokal.');
                     });
                  }} className="space-y-4 max-w-4xl">
                     <div>
                       <div className="flex justify-between items-end mb-2">
                         <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">Pedoman & Aturan Sistem Penggajian</label>
                         <button type="button" onClick={() => setLocalPortalText(DEFAULT_PORTAL_TEXT)} className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors shadow-sm">
                           🔄 Reset ke Teks Standar Sekolah
                         </button>
                       </div>
                       <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Gunakan tanda bintang (*) atau strip (-) untuk membuat list/daftar yang rapi. Gunakan titik dua (:) di pertengahan teks untuk menebalkan judul poin (seperti "Nama Tunjangan: Penjelasan").</p>
                       <textarea 
                         rows="15" 
                         value={localPortalText} 
                         onChange={e => setLocalPortalText(e.target.value)} 
                         className="w-full p-4 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-400 outline-none dark:text-white leading-relaxed resize-y font-medium shadow-inner" 
                         placeholder="Tuliskan aturan, pedoman, dan informasi penggajian di sini..."
                       ></textarea>
                     </div>
                  </form>
                </div>
                <div className="p-5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end shrink-0">
                   <button 
                     type="submit" 
                     form="formPortal" 
                     disabled={isSaving}
                     className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-lg font-bold shadow-md transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-70 disabled:cursor-not-allowed"
                   >
                      {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={18} />} 
                      {isSaving ? 'Menyimpan...' : 'Simpan Pembaruan Teks'}
                   </button>
                </div>
              </div>
            )}

            {/* 🪄 TAB BARU: MASTER TARIF & VARIABEL DINAMIS (DIPERBARUI LEBIH ELEGAN) */}
            {activeTabSetting === 'tarif' && (
              <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-2">
                <div className="p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 shrink-0">
                   <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                     <Database className="text-emerald-500" size={18} /> Master Tarif & Variabel Dropdown
                   </h3>
                </div>
                <div className="p-6 overflow-y-auto flex-1 bg-slate-50/30 dark:bg-slate-900/10">
                  <form id="formTarif" onSubmit={handleSaveRates} className="space-y-6 max-w-5xl mx-auto">
                     
                     {/* Petunjuk Penggunaan */}
                     <div className="bg-emerald-50 dark:bg-emerald-900/10 border-l-4 border-emerald-500 p-4 rounded-r-xl shadow-sm flex gap-3">
                        <Info size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <p className="text-sm text-emerald-800 dark:text-emerald-300 font-medium leading-relaxed">
                          Ubah nominal dan daftar isian di bawah ini untuk menyesuaikan aturan penggajian sekolah Anda. Gunakan baris baru (<em>enter</em>) untuk memisahkan setiap item khusus untuk TextBox.
                        </p>
                     </div>

                     {/* Kelompok 1: Tarif Dasar (DIPERBARUI DENGAN TABEL CERDAS & SIMULASI) */}
                     <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
                           <Wallet size={18} className="text-emerald-500" />
                           <h4 className="font-bold text-slate-700 dark:text-slate-200">Tarif Tunjangan Dasar</h4>
                        </div>
                        <div className="p-5 flex flex-col gap-6">
                           
                           {/* Tabel Cerdas Masa Kerja */}
                           <div className="w-full">
                              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-3 gap-3">
                                <div>
                                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Masa Kerja (Tahun Masuk)</label>
                                  <p className="text-[10px] text-slate-500">Atur nominal berdasarkan tahun masuk (TMT). Gunakan slider untuk simulasi persentase kenaikan.</p>
                                </div>
                                <div className="flex items-center gap-3 w-full sm:w-auto">
                                  <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/50 shadow-inner w-full sm:w-auto">
                                     <TrendingUp size={14} className="text-emerald-600 dark:text-emerald-400" />
                                     <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">Simulasi:</span>
                                     <input 
                                        type="range" min="0" max="100" 
                                        value={simulasiPersen} 
                                        onChange={e => setSimulasiPersen(Number(e.target.value))} 
                                        className="w-20 sm:w-28 accent-emerald-500 cursor-pointer" 
                                     />
                                     <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 w-8 text-right bg-white dark:bg-slate-800 px-1 py-0.5 rounded border border-emerald-200 dark:border-emerald-700">
                                        +{simulasiPersen}%
                                     </span>
                                  </div>
                                  <button type="button" onClick={handleAddTenureRow} className="bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white p-2 rounded-lg transition-colors shrink-0 shadow-sm" title="Tambah Baris Tahun">
                                     <PlusCircle size={16} />
                                  </button>
                                </div>
                              </div>

                              <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl max-h-80 relative shadow-sm">
                                <table className="w-full text-left text-sm whitespace-nowrap">
                                  <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 sticky top-0 z-10 shadow-sm border-b border-slate-200 dark:border-slate-700">
                                    <tr>
                                      <th className="p-3 font-extrabold uppercase tracking-wider text-[11px] w-32 border-r border-slate-200 dark:border-slate-700">Tahun (TMT)</th>
                                      <th className="p-3 font-extrabold uppercase tracking-wider text-[11px] border-r border-slate-200 dark:border-slate-700">Nominal Saat Ini</th>
                                      <th className="p-3 font-extrabold uppercase tracking-wider text-[11px] bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 border-r border-teal-100 dark:border-teal-800">Kenaikan (+{simulasiPersen}%)</th>
                                      <th className="p-3 font-extrabold uppercase tracking-wider text-[11px] bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-r border-emerald-100 dark:border-emerald-800">Total Simulasi</th>
                                      <th className="p-3 font-extrabold uppercase tracking-wider text-[11px] text-center w-16">Aksi</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50 bg-white dark:bg-slate-800">
                                    {localRatesText.tenure.map((row, idx) => {
                                       const kenaikanValue = Number(row.nominal) * (simulasiPersen / 100);
                                       const simValue = Number(row.nominal) + kenaikanValue;
                                       return (
                                         <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                                            <td className="p-2 border-r border-slate-100 dark:border-slate-700/50">
                                              <input 
                                                 type="text" 
                                                 value={row.year} 
                                                 onChange={e => handleUpdateTenureRow(idx, 'year', e.target.value)} 
                                                 placeholder="Cth: 2024" 
                                                 className="w-full p-2 border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-emerald-500 rounded bg-transparent text-sm outline-none dark:text-white font-mono font-bold text-center transition-colors" 
                                              />
                                            </td>
                                            <td className="p-2 border-r border-slate-100 dark:border-slate-700/50">
                                              <div className="relative flex items-center">
                                                 <span className="absolute left-3 text-slate-400 text-xs font-medium pointer-events-none">Rp</span>
                                                 <FormattedRupiahInput 
                                                    value={row.nominal} 
                                                    onChange={val => handleUpdateTenureRow(idx, 'nominal', val)} 
                                                    className="w-full pl-8 pr-3 py-2 border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-emerald-500 rounded bg-transparent text-sm outline-none dark:text-white font-bold transition-colors" 
                                                 />
                                              </div>
                                            </td>
                                            <td className="p-2 bg-teal-50/20 dark:bg-teal-900/10 border-r border-teal-50 dark:border-teal-900/20">
                                              <div className="font-bold text-teal-600 dark:text-teal-400 px-3 py-2 flex items-center justify-between">
                                                <span>+Rp</span>
                                                <span>{new Intl.NumberFormat('id-ID').format(kenaikanValue)}</span>
                                              </div>
                                            </td>
                                            <td className="p-2 bg-emerald-50/20 dark:bg-emerald-900/10 border-r border-emerald-50 dark:border-emerald-900/20">
                                              <div className="font-black text-emerald-600 dark:text-emerald-400 px-3 py-2 bg-white dark:bg-slate-800 rounded border border-emerald-100 dark:border-emerald-800/50 shadow-sm flex items-center justify-between">
                                                <span>Rp</span>
                                                <span>{new Intl.NumberFormat('id-ID').format(simValue)}</span>
                                              </div>
                                            </td>
                                            <td className="p-2 text-center">
                                              <button type="button" onClick={() => handleRemoveTenureRow(idx)} className="p-2 text-slate-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                                                <Trash2 size={16} />
                                              </button>
                                            </td>
                                         </tr>
                                       )
                                    })}
                                    {localRatesText.tenure.length === 0 && (
                                       <tr>
                                          <td colSpan="5" className="text-center p-6 text-slate-500 italic text-sm">Tidak ada data tarif masa kerja. Tekan ikon (+) untuk menambahkan baris baru.</td>
                                       </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                           </div>

                           <div className="w-full pt-2 border-t border-slate-100 dark:border-slate-700">
                              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Tarif Pendidikan (Gelar=Nominal)</label>
                              <textarea 
                                rows="5" 
                                value={localRatesText.edu} 
                                onChange={e => setLocalRatesText({...localRatesText, edu: e.target.value})} 
                                className="w-full p-3.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-[13px] focus:ring-2 focus:ring-emerald-400 outline-none dark:text-emerald-300 text-emerald-700 font-mono shadow-inner resize-y leading-relaxed" 
                                placeholder="S2=400000&#10;S1=300000"
                              ></textarea>
                           </div>
                        </div>
                     </div>

                     {/* Kelompok 2: Struktur Jabatan & Kinerja */}
                     <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
                           <Briefcase size={18} className="text-blue-500" />
                           <h4 className="font-bold text-slate-700 dark:text-slate-200">Struktur Jabatan & Kinerja</h4>
                        </div>
                        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-6">
                           <div>
                              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Kategori Jabatan</label>
                              <textarea 
                                rows="6" 
                                value={localRatesText.jobCat} 
                                onChange={e => setLocalRatesText({...localRatesText, jobCat: e.target.value})} 
                                className="w-full p-3.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-[13px] focus:ring-2 focus:ring-blue-400 outline-none dark:text-slate-200 text-slate-700 shadow-inner resize-y leading-relaxed" 
                              ></textarea>
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Detail Jabatan Inti</label>
                              <textarea 
                                rows="6" 
                                value={localRatesText.jobRoles} 
                                onChange={e => setLocalRatesText({...localRatesText, jobRoles: e.target.value})} 
                                className="w-full p-3.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-[13px] focus:ring-2 focus:ring-blue-400 outline-none dark:text-slate-200 text-slate-700 shadow-inner resize-y leading-relaxed" 
                              ></textarea>
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Level Penilaian Kinerja (Level=Nominal)</label>
                              <textarea 
                                rows="6" 
                                value={localRatesText.kinerja} 
                                onChange={e => setLocalRatesText({...localRatesText, kinerja: e.target.value})} 
                                className="w-full p-3.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-[13px] focus:ring-2 focus:ring-blue-400 outline-none dark:text-emerald-300 text-emerald-700 font-mono shadow-inner resize-y leading-relaxed" 
                                placeholder="Sangat Baik=100000&#10;Baik=50000&#10;Cukup=0&#10;Kurang=0"
                              ></textarea>
                           </div>
                        </div>
                     </div>

                     {/* Kelompok 3: Kompetensi & Aturan Lainnya */}
                     <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
                           <Sparkles size={18} className="text-amber-500" />
                           <h4 className="font-bold text-slate-700 dark:text-slate-200">Kompetensi & Aturan Lainnya</h4>
                        </div>
                        <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                           <div>
                              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Bidang Kompetensi</label>
                              <textarea 
                                rows="6" 
                                value={localRatesText.kompFields} 
                                onChange={e => setLocalRatesText({...localRatesText, kompFields: e.target.value})} 
                                className="w-full p-3.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-[13px] focus:ring-2 focus:ring-amber-400 outline-none dark:text-slate-200 text-slate-700 shadow-inner resize-y leading-relaxed" 
                              ></textarea>
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Level Kompetensi (Level=Nominal)</label>
                              <textarea 
                                rows="6" 
                                value={localRatesText.kompLevels} 
                                onChange={e => setLocalRatesText({...localRatesText, kompLevels: e.target.value})} 
                                className="w-full p-3.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-[13px] focus:ring-2 focus:ring-amber-400 outline-none dark:text-emerald-300 text-emerald-700 font-mono shadow-inner resize-y leading-relaxed" 
                                placeholder="Sangat Ahli=150000&#10;Ahli=100000&#10;Cukup Ahli=75000&#10;Pra Ahli=50000&#10;Pemula=25000"
                              ></textarea>
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Insentif Tambahan</label>
                              <textarea 
                                rows="6" 
                                value={localRatesText.insentif} 
                                onChange={e => setLocalRatesText({...localRatesText, insentif: e.target.value})} 
                                className="w-full p-3.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-[13px] focus:ring-2 focus:ring-amber-400 outline-none dark:text-slate-200 text-slate-700 shadow-inner resize-y leading-relaxed" 
                              ></textarea>
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Daftar Potongan</label>
                              <textarea 
                                rows="6" 
                                value={localRatesText.potongan} 
                                onChange={e => setLocalRatesText({...localRatesText, potongan: e.target.value})} 
                                className="w-full p-3.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-[13px] focus:ring-2 focus:ring-amber-400 outline-none dark:text-slate-200 text-slate-700 shadow-inner resize-y leading-relaxed" 
                              ></textarea>
                           </div>
                        </div>
                     </div>

                  </form>
                </div>
                <div className="p-5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end shrink-0">
                   <button 
                     type="submit" 
                     form="formTarif" 
                     disabled={isSaving}
                     className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-md transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-70 disabled:cursor-not-allowed"
                   >
                      {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={18} />} 
                      {isSaving ? 'Menyimpan...' : 'Simpan Master Tarif'}
                   </button>
                </div>
              </div>
            )}

            {/* TAB: AKUN LOGIN */}
            {activeTabSetting === 'akun' && (
              <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-2">
                <div className="p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 shrink-0">
                   <div>
                     <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                       <Key className="text-amber-500" size={18} /> Akses Login Pengguna
                     </h3>
                     <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                       Kelola akun pengguna, reset sandi, dan kirim kredensial login via WhatsApp
                     </p>
                   </div>
                   <div className="flex gap-2 w-full xl:w-auto flex-wrap sm:flex-nowrap items-center">
                      <select
                        value={accStatusFilter}
                        onChange={e => setAccStatusFilter(e.target.value)}
                        className="py-2 px-3 text-xs md:text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-400 font-semibold shadow-sm shrink-0"
                        title="Filter Status Akun"
                      >
                        <option value="AKTIF">Hanya Akun Aktif</option>
                        <option value="ALL">Semua Akun (Termasuk Resign)</option>
                        <option value="ADMIN">Hanya Admin & Kepsek</option>
                        <option value="RESIGN">Pegawai Non-Aktif / Resign</option>
                      </select>
                      <div className="relative w-full sm:flex-1">
                        <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                        <input 
                          type="text" placeholder="Cari akun..." 
                          value={searchAcc} onChange={e => setSearchAcc(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-400 outline-none dark:text-white shadow-sm"
                        />
                      </div>
                     <button onClick={handleExportLoginCSV} className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-1.5 shrink-0" title="Export tabel ini ke Excel (CSV)">
                        <Download size={16} /> Export
                     </button>
                     <button onClick={() => openModal('add')} className="bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-1.5 shrink-0">
                        <PlusCircle size={16} /> Tambah Admin
                     </button>
                   </div>
                </div>

                {/* 📱 KARTU KONTROL PENUH KUNCI HP GURU (DEVICE LOCK) */}
                <div className="mx-3 sm:mx-5 mt-2 sm:mt-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-blue-50/30 dark:from-slate-900/40 dark:to-slate-800/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 sm:gap-3 shadow-xs">
                   <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                         isGlobalDeviceLockActive 
                            ? 'bg-teal-600 text-white shadow-teal-500/20' 
                            : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                      }`}>
                         <Smartphone size={22} />
                      </div>
                      <div>
                         <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-extrabold text-sm text-slate-800 dark:text-white">
                               Pengaturan Kunci 1 Akun 1 HP Guru
                            </h4>
                            <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                               isGlobalDeviceLockActive 
                                  ? 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800' 
                                  : 'bg-slate-200 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                            }`}>
                               {isGlobalDeviceLockActive ? 'AKTIF (Terkunci)' : 'NONAKTIF (Bebas HP)'}
                            </span>
                         </div>
                         <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-2xl leading-relaxed">
                            {isGlobalDeviceLockActive 
                               ? 'Fitur Aktif: Guru hanya bisa presensi dari 1 HP miliknya (mencegah titip absen). Jika guru ganti HP atau beda browser, Admin dapat klik tombol "Reset HP" di tabel bawah.' 
                               : 'Fitur Nonaktif: Guru bebas presensi dari HP atau browser mana saja tanpa batasan perangkat.'}
                         </p>
                      </div>
                   </div>
                   <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
                      <button
                         type="button"
                         onClick={handleToggleGlobalDeviceLock}
                         className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm flex items-center gap-1.5 cursor-pointer ${
                            isGlobalDeviceLockActive 
                               ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800' 
                               : 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-500/25'
                         }`}
                      >
                         {isGlobalDeviceLockActive ? 'Nonaktifkan Kunci HP' : 'Aktifkan Kunci HP'}
                      </button>
                      {isGlobalDeviceLockActive && (
                         <button
                            type="button"
                            onClick={handleResetAllTeacherDevices}
                            className="px-3.5 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer shadow-xs"
                            title="Buka kuncian HP seluruh guru sekaligus jika ingin mereset semuanya"
                         >
                            <Unlock size={14} /> Reset Semua HP
                         </button>
                      )}
                   </div>
                </div>

                {/* FITUR BARU: Tampilan Kartu Mobile Akun (< md) */}
                <div className="md:hidden space-y-3 p-3 no-print overflow-y-auto">
                   {filteredAccounts.map(acc => (
                      <div key={acc.id || generateUniqueId('m-row-')} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-3">
                         <div className="flex justify-between items-start">
                            <div>
                               <h4 className="font-bold text-base text-slate-800 dark:text-white">{acc.name || 'Tanpa Nama'}</h4>
                               <div className="text-xs font-mono text-slate-500 mt-0.5">Username: <span className="font-bold text-slate-700 dark:text-slate-200">{acc.username || '-'}</span></div>
                            </div>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${acc.role === 'Admin' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : acc.role === 'Kepala Sekolah' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : acc.role === 'Yayasan' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : acc.isActive === false ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                               {acc.isActive === false ? 'Guru (Resign)' : (acc.role || 'Guru')}
                            </span>
                         </div>

                         <div className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-700/50">
                            <span className="text-slate-400 font-medium">Password:</span>
                            {acc.role === 'Guru' ? (
                               <span className="text-blue-600 dark:text-blue-400 font-mono font-bold bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                                  {acc.plainPassword}
                               </span>
                            ) : (
                               <span className="text-slate-400 font-mono">••••••••</span>
                            )}
                         </div>

                         <div className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-700/50">
                            <span className="text-slate-400 font-medium">Perangkat HP:</span>
                            {acc.role === 'Guru' ? (
                               acc.registeredDeviceId ? (
                                  <div className="flex items-center gap-1.5">
                                     <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
                                        <Smartphone size={12} /> {acc.registeredDeviceName || 'HP Terdaftar'}
                                     </span>
                                     <button
                                        type="button"
                                        onClick={() => handleResetTeacherDevice(acc)}
                                        className="px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 rounded font-bold text-[10px] flex items-center gap-0.5 transition-colors cursor-pointer"
                                        title="Buka kuncian HP agar guru bisa pakai HP baru"
                                     >
                                        <Unlock size={10} /> Reset HP
                                     </button>
                                  </div>
                               ) : (
                                  <span className="text-slate-400 italic text-[11px]">Belum Terikat</span>
                               )
                            ) : (
                               <span className="text-slate-400 italic text-[11px]">Bebas Akses</span>
                            )}
                         </div>

                         <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-700/50">
                            <button 
                              onClick={() => {
                                 const passText = acc.plainPassword || `${(acc.name.replace(/[^a-zA-Z]/g, '').substring(0,2).toUpperCase() || 'GU')}123`;
                                 const text = `Halo ${acc.name},\nBerikut adalah akses login Portal Pegawai Anda:\n\nUsername: ${acc.username}\nPassword: ${passText}\n\nHarap simpan dengan baik.`;
                                 window.open(`https://api.whatsapp.com/send?phone=${acc.phone || ''}&text=${encodeURIComponent(text)}`);
                              }}
                              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                            >
                              <Send size={14}/> Kirim WA
                            </button>
                            <button onClick={() => openModal('edit', acc)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors">
                              <Edit size={14}/> Edit
                            </button>
                            <button onClick={() => openModal('delete', acc)} className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors">
                              <Trash2 size={14}/> {acc.role === 'Guru' ? 'Reset' : 'Cabut'}
                            </button>
                         </div>
                      </div>
                   ))}
                </div>

                <div className="hidden md:block flex-1 overflow-x-auto relative touch-pan-x scroll-smooth">
                   <table className="w-full text-left text-sm whitespace-nowrap min-w-max">
                     <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 sticky top-0 z-10 shadow-sm border-b border-slate-200 dark:border-slate-700">
                       <tr>
                         <th className="p-4 font-bold">Nama Pegawai</th>
                         <th className="p-4 font-bold">Username Login</th>
                         <th className="p-4 font-bold">Password</th>
                         <th className="p-4 font-bold">Hak Akses (Role)</th>
                         <th className="p-4 font-bold">Perangkat HP</th>
                         <th className="p-4 font-bold text-center">Aksi</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                       {filteredAccounts.map(acc => (
                         <tr key={acc.id || generateUniqueId('row-')} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                           <td className="p-4 font-bold text-slate-800 dark:text-slate-200">{acc.name || 'Tanpa Nama'}</td>
                           <td className="p-4">
                             <span className="bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded font-mono text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-600">
                               {acc.username || '-'}
                             </span>
                           </td>
                           <td className="p-4 tracking-widest text-[13px] font-mono" title="Password">
                             {/* PENYEDERHANAAN: Tampilkan password guru secara langsung agar Admin mudah memantau */}
                             {acc.role === 'Guru' ? (
                                <span className="text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded border border-blue-200 dark:border-blue-800">
                                  {acc.plainPassword}
                                </span>
                             ) : (
                                <span className="text-slate-400">••••••••</span>
                             )}
                           </td>
                           <td className="p-4">
                             <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${acc.role === 'Admin' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : acc.role === 'Kepala Sekolah' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : acc.role === 'Yayasan' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : acc.isActive === false ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                               {acc.isActive === false ? 'Guru (Resign)' : (acc.role || 'Guru')}
                             </span>
                           </td>
                           <td className="p-4">
                             {acc.role === 'Guru' ? (
                               acc.registeredDeviceId ? (
                                 <div className="flex items-center gap-2">
                                   <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1 text-xs">
                                     <Smartphone size={13} /> {acc.registeredDeviceName || 'HP Terdaftar'}
                                   </span>
                                   <button
                                     type="button"
                                     onClick={() => handleResetTeacherDevice(acc)}
                                     className="px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 rounded font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                                     title="Buka kuncian HP agar guru bisa pakai HP baru"
                                   >
                                     <Unlock size={11} /> Reset HP
                                   </button>
                                 </div>
                               ) : (
                                 <span className="text-slate-400 italic text-xs">Belum Terikat</span>
                               )
                             ) : (
                               <span className="text-slate-400 italic text-xs">Bebas Akses</span>
                             )}
                           </td>
                           <td className="p-4 text-center">
                             <div className="flex items-center justify-center gap-2">
                               {/* TAMBAHAN: Tombol Kirim Akses via WhatsApp */}
                                {acc.isActive !== false ? (
                                 <button 
                                   onClick={() => {
                                      const passText = acc.plainPassword || `${(acc.name.replace(/[^a-zA-Z]/g, '').substring(0,2).toUpperCase() || 'GU')}123`;
                                      const text = `Halo ${acc.name},\nBerikut adalah akses login Portal Pegawai Anda:\n\nUsername: ${acc.username}\nPassword: ${passText}\n\nHarap simpan dengan baik.`;
                                      window.open(`https://api.whatsapp.com/send?phone=${acc.phone || ''}&text=${encodeURIComponent(text)}`);
                                   }}
                                   className="p-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-md transition-colors"
                                   title="Kirim Akses via WhatsApp"
                                 >
                                   <Send size={14} />
                                 </button>
                                ) : (
                                  <span className="text-[11px] text-slate-400 italic px-1">Non-Aktif</span>
                                )}

                               <button onClick={() => openModal('edit', acc)} className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-md transition-colors" title="Edit Akun">
                                 <Edit size={14} />
                               </button>
                               <button onClick={() => openModal('delete', acc)} className="p-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-md transition-colors" title={acc.role === 'Guru' ? "Reset Password ke Default" : "Cabut Akses"}>
                                 <Trash2 size={14} />
                               </button>
                             </div>
                           </td>
                         </tr>
                       ))}
                       {filteredAccounts.length === 0 && (
                         <tr><td colSpan="6" className="p-8 text-center text-slate-500">Tidak ada data akun ditemukan.</td></tr>
                       )}
                     </tbody>
                   </table>
                </div>
              </div>
            )}

            {/* TAB: PENGATURAN SISTEM */}
            {activeTabSetting === 'sistem' && (
              <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-2">
                <div className="p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 shrink-0">
                   <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                     <Settings className="text-slate-500" size={18} /> Pengaturan Inti & Keamanan Sistem
                   </h3>
                </div>
                <div className="p-6 overflow-y-auto flex-1 space-y-5 max-w-3xl">
                   <div className="flex items-center justify-between p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
                      <div className="pr-4">
                         <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">Mode Maintenance (Perbaikan)</h4>
                         <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">Aktifkan untuk menutup akses login guru sementara waktu saat Admin sedang melakukan rekapitulasi data penggajian akhir bulan.</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input 
                          type="checkbox" 
                          checked={settings?.maintenanceMode || false} 
                          onChange={async (e) => {
                             const isChecked = e.target.checked;
                             if (onToggleMaintenance) {
                               await onToggleMaintenance(isChecked);
                             } else {
                               const updated = { ...settings, maintenanceMode: isChecked, lastModified: Date.now() };
                               setSettings(updated);
                               safeStorageSet('payedu_settings', updated);
                               
                               try {
                                 await postToGoogleSheets('SAVE_SETTINGS', updated);
                                 if (isChecked) {
                                    alert("🛠️ MODE MAINTENANCE AKTIF BERHASIL DISIMPAN KE CLOUD!\n\nSeluruh perangkat HP & Komputer Guru di manapun berada kini langsung terintegrasi dan diblokir oleh Layar Perbaikan.");
                                 } else {
                                    alert("✅ MODE MAINTENANCE DIMATIKAN!\n\nAkses Portal Guru telah dibuka kembali di seluruh perangkat.");
                                 }
                               } catch(err) {
                                 console.error("Gagal sync maintenance mode ke cloud:", err);
                               }
                             }
                           }} 
                          className="sr-only peer" 
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-amber-500"></div>
                      </label>
                   </div>

                   <div className="flex items-center justify-between p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
                      <div className="pr-4">
                         <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">Notifikasi Otomatis (WhatsApp)</h4>
                         <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">Aktifkan untuk mengizinkan sistem mengirimkan slip gaji via API WhatsApp otomatis saat tombol 'Kirim Notifikasi' ditekan.</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input type="checkbox" checked={settings?.waGateway || false} onChange={e => setSettings({...settings, waGateway: e.target.checked})} className="sr-only peer" />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
                      </label>
                   </div>

                   <div className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm space-y-4">
                      <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-2 border-b border-slate-100 dark:border-slate-700 pb-2">Manajemen Basis Data Lokal</h4>
                      <div className="flex flex-col sm:flex-row gap-3">
                         <button onClick={handleBackupData} className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 dark:text-emerald-400 py-3 rounded-lg text-sm font-bold transition-colors flex justify-center items-center gap-2 border border-emerald-200 dark:border-emerald-800/50 shadow-sm">
                           <Download size={18} /> Backup Database (JSON)
                         </button>
                         <button onClick={() => fileInputRef.current?.click()} className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 dark:text-amber-400 py-3 rounded-lg text-sm font-bold transition-colors flex justify-center items-center gap-2 border border-amber-200 dark:border-amber-800/50 shadow-sm">
                           <Upload size={18} /> Restore / Pulihkan Data
                         </button>
                      </div>
                      <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 p-4 rounded-xl mt-4">
                         <h5 className="text-sm font-bold text-red-700 dark:text-red-400 mb-1 flex items-center gap-1.5"><AlertCircle size={16}/> Zona Berbahaya (Kritikal)</h5>
                         <p className="text-xs text-red-600 dark:text-red-400/80 mb-3">Tindakan ini akan menghapus seluruh data guru & rekapitulasi gaji yang sedang berjalan di penyimpanan peramban ini secara permanen!</p>
                         <button onClick={handleResetDatabase} className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-md transition-colors flex justify-center items-center gap-2">
                           <Trash2 size={16} /> Reset Keseluruhan Data Pegawai
                         </button>
                      </div>

                      {/* TOMBOL MIGRASI ID BARU */}
                      <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30 p-4 rounded-xl mt-4">
                         <h5 className="text-sm font-bold text-blue-700 dark:text-blue-400 mb-1 flex items-center gap-1.5"><RefreshCw size={16}/> Migrasi ID Pegawai Automatik</h5>
                         <p className="text-xs text-blue-600 dark:text-blue-400/80 mb-3">Tindakan ini akan menukar semua ID lama yang rawak menjadi format berurutan (G01QA, G02QA, dst). Username log masuk guru akan dikemas kini serta-merta.</p>
                         <button onClick={() => setConfirmMigrate(true)} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-md transition-colors flex justify-center items-center gap-2">
                           <RefreshCw size={16} /> Mulakan Migrasi ID
                         </button>
                      </div>
                   </div>
                </div>
              </div>
            )}

            {/* TAB: LOG AUDIT FINANSIAL & SISTEM (AUDIT TRAIL) */}
            {activeTabSetting === 'audit' && (
              <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-2">
                <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 shrink-0 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                   <div className="flex items-center gap-2.5">
                     <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                       <ShieldCheck size={18} />
                     </div>
                     <div>
                       <div className="flex items-center gap-2">
                         <h3 className="font-bold text-slate-800 dark:text-white text-base">Jejak Audit Finansial &amp; Sistem</h3>
                         <span className="text-[11px] bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 font-bold px-2 py-0.5 rounded-full">
                           {filteredAuditLogs.length} / {auditLogs.length}
                         </span>
                       </div>
                       <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Rekaman transparan mutasi gaji, penyesuaian nominal, presensi, dan aktivitas admin.</p>
                     </div>
                   </div>
                   
                   <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
                     <button 
                       type="button"
                       onClick={handleExportAuditCSV}
                       className="bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer flex-1 md:flex-none justify-center border border-emerald-200 dark:border-emerald-800"
                     >
                       <Download size={14} /> Ekspor CSV
                     </button>
                     <button 
                       type="button"
                       onClick={() => {
                         if (window.confirm("Apakah Anda yakin ingin MEMBERSIHKAN LOG AUDIT? Catatan mutasi finansial akan direset.")) {
                            setAuditLogs([]);
                            localStorage.removeItem('payedu_audit_logs');
                            safeStorageSet('payedu_audit_logs', []);
                            alert("✨ Seluruh Log Audit Finansial berhasil dibersihkan!");
                         }
                       }}
                       className="bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer flex-1 md:flex-none justify-center"
                     >
                       <Trash2 size={14} /> Bersihkan Log
                     </button>
                   </div>
                </div>

                {/* Filter Toolbar */}
                <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800 flex flex-col sm:flex-row gap-3 items-center justify-between shrink-0">
                   <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl gap-1 w-full sm:w-auto overflow-x-auto">
                     {[
                       { id: 'ALL', label: 'Semua' },
                       { id: 'finansial', label: '💰 Finansial / Gaji' },
                       { id: 'presensi_guru', label: '📋 Presensi' },
                       { id: 'pegawai', label: '👥 Pegawai' },
                       { id: 'sistem', label: '⚙️ Sistem' }
                     ].map(cat => (
                       <button
                         key={cat.id}
                         type="button"
                         onClick={() => setAuditCategoryFilter(cat.id)}
                         className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${auditCategoryFilter === cat.id ? 'bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-300 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                       >
                         {cat.label}
                       </button>
                     ))}
                   </div>
                   <div className="relative w-full sm:w-72">
                     <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                     <input 
                       type="text" 
                       placeholder="Cari aktor, target, atau detail..." 
                       value={auditSearch} 
                       onChange={e => setAuditSearch(e.target.value)}
                       className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
                     />
                   </div>
                </div>

                {/* Table Log */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                  {filteredAuditLogs.length === 0 ? (
                    <div className="text-center py-16 text-slate-400 dark:text-slate-500">
                      <ShieldCheck size={40} className="mx-auto mb-2 opacity-30" />
                      <p className="font-bold text-sm">Belum Ada Rekaman Log Audit</p>
                      <p className="text-xs mt-1">Seluruh aktivitas perubahan gaji, mutasi data, dan presensi akan otomatis tercatat di sini.</p>
                    </div>
                  ) : (
                    <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-x-auto shadow-sm">
                      <table className="w-full text-left text-xs min-w-max">
                        <thead>
                          <tr className="bg-slate-100 dark:bg-slate-900 text-slate-500 uppercase tracking-wider text-[10px] font-black border-b border-slate-200 dark:border-slate-700">
                            <th className="p-3 pl-4">Waktu</th>
                            <th className="p-3">Aktor</th>
                            <th className="p-3">Kategori</th>
                            <th className="p-3">Tindakan</th>
                            <th className="p-3">Sasaran</th>
                            <th className="p-3 pr-4">Rincian Perubahan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-800/60">
                          {filteredAuditLogs.map(log => {
                            const badgeColor = log.category === 'finansial' 
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : log.category === 'presensi_guru'
                              ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                              : log.category === 'pegawai'
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';

                            return (
                              <tr key={log.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800 transition-colors">
                                <td className="p-3 pl-4 font-mono text-[11px] text-slate-500 shrink-0 whitespace-nowrap">
                                  {formatDateId(log.timestamp?.split('T')[0])} {log.timestamp ? new Date(log.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''}
                                </td>
                                <td className="p-3 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                  {log.actor || 'Administrator'}
                                </td>
                                <td className="p-3 whitespace-nowrap">
                                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-wider ${badgeColor}`}>
                                    {log.category || 'sistem'}
                                  </span>
                                </td>
                                <td className="p-3 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                  {log.action}
                                </td>
                                <td className="p-3 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                  {log.target || '-'}
                                </td>
                                <td className="p-3 pr-4 text-slate-600 dark:text-slate-300 leading-relaxed font-mono text-[11px]">
                                  {log.detail || '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: RIWAYAT LOGIN */}
            {activeTabSetting === 'riwayat' && (
              <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-2">
                <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 shrink-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                   <div className="flex items-center gap-2.5">
                     <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                       <Clock size={18} />
                     </div>
                     <div>
                       <div className="flex items-center gap-2">
                         <h3 className="font-bold text-slate-800 dark:text-white text-base">Riwayat Akses Sistem Terakhir</h3>
                         <span className="text-[11px] bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold px-2 py-0.5 rounded-full">
                           {filteredLogs.length} / {sortedLogs.length}
                         </span>
                       </div>
                       <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Catatan aktivitas masuk pengguna terurut kronologis (terbaru di atas).</p>
                     </div>
                   </div>
                   
                   <button 
                     type="button"
                     onClick={async () => {
                       if (window.confirm("Apakah Anda yakin ingin MENGHAPUS SELURUH RIWAYAT AKSES LOG IN? Data riwayat log akan dihapus secara PERMANEN dari memori browser dan Cloud Supabase.")) {
                          setLoginHistory([]);
                          localStorage.removeItem('payedu_loginHistory');
                          localStorage.removeItem('payedu_login_history');
                          safeStorageSet('payedu_loginHistory', []);
                          try {
                             await postToGoogleSheets('SAVE_LOGS', []);
                          } catch (err) {
                             console.warn("Gagal clear cloud logs:", err);
                          }
                          alert("✨ Riwayat Akses Sistem berhasil dibersihkan total dan dihapus permanen dari Cloud!");
                       }
                     }}
                     className="bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer w-full sm:w-auto justify-center"
                   >
                      <Trash2 size={14} /> Bersihkan Riwayat
                   </button>
                </div>

                {/* Filter & Toolbar Pencarian Log */}
                <div className="p-3 sm:p-4 bg-white dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
                    <input 
                      type="text"
                      placeholder="Cari pengguna, role, perangkat..."
                      value={logSearch}
                      onChange={e => setLogSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                    />
                    {logSearch && (
                      <button onClick={() => setLogSearch('')} className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600">
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto hide-scrollbar">
                    <button
                      type="button"
                      onClick={() => setLogStatusFilter('ALL')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${logStatusFilter === 'ALL' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
                    >
                      Semua ({sortedLogs.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setLogStatusFilter('SUCCESS')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${logStatusFilter === 'SUCCESS' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100'}`}
                    >
                      Sukses ({sortedLogs.filter(l => !String(l.status || '').toLowerCase().includes('gagal')).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setLogStatusFilter('FAILED')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${logStatusFilter === 'FAILED' ? 'bg-red-600 text-white shadow-xs' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-100'}`}
                    >
                      Gagal ({sortedLogs.filter(l => String(l.status || '').toLowerCase().includes('gagal')).length})
                    </button>
                  </div>
                </div>

                {/* Tampilan Kartu Mobile Riwayat Login (< md) */}
                <div className="md:hidden space-y-3 p-3 no-print overflow-y-auto">
                   {filteredLogs.map((log, idx) => {
                      const isFailed = String(log.status || '').toLowerCase().includes('gagal');
                      return (
                        <div key={log.id || idx} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col gap-2.5">
                           <div className="flex justify-between items-start">
                              <div>
                                 <h4 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-1.5">
                                    <UserCheck size={15} className="text-blue-500 shrink-0"/>
                                    {log.name || 'Pengguna'}
                                 </h4>
                                 <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                    Role: <span className="font-bold text-slate-700 dark:text-slate-300">{log.role || 'User'}</span>
                                 </span>
                              </div>
                              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${isFailed ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'}`}>
                                 {log.status || 'Sukses'}
                              </span>
                           </div>

                           <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-700/50">
                              <div>
                                 <span className="text-[10px] font-bold text-slate-400 block uppercase">Waktu Akses</span>
                                 <span className="font-medium text-slate-700 dark:text-slate-300 text-[11px] leading-tight block mt-0.5">
                                   {log.time || log.timestamp || log.created_at || '-'}
                                 </span>
                              </div>
                              <div>
                                 <span className="text-[10px] font-bold text-slate-400 block uppercase">Perangkat / OS</span>
                                 <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400 truncate block mt-0.5" title={log.device}>
                                   {log.device || '-'}
                                 </span>
                              </div>
                           </div>
                        </div>
                      );
                   })}
                   {filteredLogs.length === 0 && (
                      <div className="p-8 text-center text-slate-500 text-sm bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 italic">
                         {sortedLogs.length === 0 ? 'Belum ada riwayat aktivitas yang terekam.' : `Tidak ada riwayat aktivitas yang cocok dengan pencarian "${logSearch}".`}
                      </div>
                   )}
                </div>

                {/* Tampilan Tabel Desktop (>= md) */}
                <div className="hidden md:block overflow-x-auto flex-1 relative p-0 touch-pan-x scroll-smooth">
                  <table className="w-full text-left text-sm whitespace-nowrap min-w-max">
                    <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 sticky top-0 z-10 shadow-xs border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-4 font-bold">Waktu Akses (WIB)</th>
                        <th className="p-4 font-bold">Pengguna</th>
                        <th className="p-4 font-bold">Role</th>
                        <th className="p-4 font-bold">Perangkat / Browser</th>
                        <th className="p-4 font-bold text-center">Status Akses</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {filteredLogs.map((log, idx) => {
                        const isFailed = String(log.status || '').toLowerCase().includes('gagal');
                        return (
                          <tr key={log.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="p-4 text-slate-600 dark:text-slate-400 font-medium text-xs">
                              {log.time || log.timestamp || log.created_at || '-'}
                            </td>
                            <td className="p-4 font-bold text-slate-800 dark:text-slate-200">
                              {log.name || 'Pengguna'}
                            </td>
                            <td className="p-4 text-xs font-semibold text-slate-600 dark:text-slate-400">
                              <span className="bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300">
                                {log.role || 'User'}
                              </span>
                            </td>
                            <td className="p-4 text-slate-500 font-mono text-xs">
                              {log.device || '-'}
                            </td>
                            <td className="p-4 text-center">
                              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${isFailed ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                                {log.status || 'Sukses'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredLogs.length === 0 && (
                        <tr>
                          <td colSpan="5" className="p-8 text-center text-slate-500 italic">
                            {sortedLogs.length === 0 ? 'Belum ada riwayat aktivitas yang terekam.' : `Tidak ada riwayat aktivitas yang cocok dengan pencarian "${logSearch}".`}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: KRITIK & SARAN */}
            {activeTabSetting === 'saran' && (
              <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-2">
                <div className="p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 shrink-0">
                   <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                     <MessageSquare className="text-rose-500" size={18} /> Aspirasi, Kritik & Saran Masuk
                   </h3>
                </div>
                <div className="overflow-y-auto flex-1 p-6 bg-slate-50/50 dark:bg-slate-900/20">
                  <div className="space-y-4 max-w-4xl mx-auto">
                    
                    {(feedbacks || []).map((fb) => (
                      <div key={fb.id} className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all">
                        <div className="flex justify-between items-start mb-3 border-b border-slate-100 dark:border-slate-700 pb-3">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">{fb.date}</span>
                            <h4 className="font-bold text-slate-800 dark:text-slate-200">{fb.subject}</h4>
                            <p className="text-xs text-slate-500 mt-0.5">Dari: <span className="font-semibold">{fb.name}</span></p>
                          </div>
                          <span className={`px-2.5 py-1 text-[10px] font-bold rounded-md border ${fb.status === 'Selesai' ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800' : 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:border-amber-800'}`}>
                            {fb.status}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium whitespace-pre-wrap">{fb.message}</p>
                        {fb.status !== 'Selesai' && (
                          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-end">
                            <button onClick={() => handleMarkFeedbackDone(fb.id)} className="text-xs bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-lg font-bold transition-colors flex items-center gap-1.5">
                              <CheckCircle size={14} /> Tandai Selesai
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    {(feedbacks || []).length === 0 && (
                      <div className="text-center py-10 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 border-dashed">
                        <MessageSquare size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                        <p className="text-slate-500 font-medium">Belum ada kritik dan saran yang masuk.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
         </div>
      </div>
    </div>
  );
}
export default PengaturanView;
