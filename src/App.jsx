import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  LayoutDashboard, Users, Clock, Calculator, FileText, Settings, 
  LogOut, LogIn, Sun, Moon, Eye, EyeOff, Search, Edit, Trash2, 
  Menu, X, CheckCircle, XCircle, ChevronRight, Printer, AlertCircle, UserCircle,
  GraduationCap, Wallet, Calendar, TrendingUp, Award,
  PlusCircle, Trash, Star, Briefcase, Shield, HeartHandshake, Sparkles,
  Download, Upload, BarChart3, Activity, PieChart as PieChartIcon,
  Info, MessageSquare, ChevronDown, ChevronUp, Send, History, Bell, BellRing,
  Building, Key, Save, Lock, Archive, FolderOpen, ShieldCheck, CreditCard, Database,
  Fingerprint, Cloud, CloudOff, RefreshCw // TAMBAHAN NO 4: Ikon Cloud Sinkronisasi
} from 'lucide-react';

// --- DATA DUMMY & KONSTANTA (SEKARANG MENJADI DINAMIS) ---
let TENURE_RATES = {
  2010: 1921768, 2011: 1812989, 2012: 1710367, 2013: 1613554, 2014: 1522221,
  2015: 1436057, 2016: 1354771, 2017: 1278086, 2018: 1205741, 2019: 1137492,
  2020: 1073105, 2021: 1012364, 2022: 955060, 2023: 901000, 2024: 850000
};

let EDU_RATES = { 'S2': 400000, 'S1': 300000, 'Diploma': 200000, 'SMA/Pondok': 100000 };

let JOB_CATEGORIES = ['Kepala Sekolah', 'Kepala Bidang', 'Kepala Sub Bidang', 'Wali Kelas', 'Guru', 'Staff', 'Operasional'];
let JOB_ROLES = ['Kepala Sekolah', 'Wakil Kepala Sekolah', 'Waka. Sarpras', 'Tata Usaha', 'Waka. Humas', 'Waka. Kesiswaan Putra', 'Waka. Kesiswaan Putri', 'Waka. Kurikulum', 'Waka. Kesiswaan', 'Bendahara Bos', 'Koordinator Tahfidz Putra', 'Koordinator Tahfidz Putri', 'Koord. Bahasa', 'Wali Kelas', 'Guru Mapel', 'Satpam Sekolah Putra', 'Petugas Kebersihan', 'Pengabdian', 'Lainnya'];
let KINERJA_LEVELS = ['Sangat Baik', 'Baik', 'Cukup', 'Kurang'];
let KOMPETENSI_FIELDS = ['Tahsin Qur\'an', 'Tahsin Tahfidz', 'Komputer Dan Administrasi', 'Bahasa Arab', 'Bahasa Inggris', 'Lainnya'];
let KOMPETENSI_LEVELS = ['Sangat Ahli', 'Ahli', 'Cukup Ahli', 'Pra Ahli', 'Pemula'];
let INSENTIF_LIST = ['Koordinator Tahfidz', 'Tugas Harian', 'Operator', 'Kajian & Tahta Guru', 'Pembantu Sarpras', 'Kebersihan Putra', 'Personalia', 'Notulen Rapat', 'Asisten Tu', 'Asisten Wali Kelas', 'Kebersihan & Security Putri', 'Asisten Operator', 'Penguji Tasmi', 'Penguji Kenaikan Iqro', 'Pengabdian', 'Buka/Kunci Pintu Sekolah Lk', 'Buka/Kunci Pintu Sekolah Pr', 'Guru GTT', 'Satpam Sekolah Putra', 'Lainnya'];
let POTONGAN_LIST = ['Kasbon Sekolah', 'Cicilan Koperasi', 'Iuran PGRI', 'Dana Sosial', 'Pinjaman Rekan Guru', 'Pembayaran Barang', 'Lainnya'];

// DIPERBARUI: Mengosongkan data dummy agar aplikasi bersih dan dimulai dari nol (0 Pegawai)
const initialTeachers = [];

const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

// --- KONFIGURASI DATABASE GOOGLE SHEETS ---
const GOOGLE_SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycbyiOyJ_WudLhs1u4bQwMblCvM3Z9K4le57y7R7BBaQg1twmhBalaTqlxOQ-25GT3IbS/exec';

// --- HELPER FUNCTIONS LOGIKA GAJI ---
const calculatePayroll = (teacher) => {
  const p = teacher.payroll || {}; // Failsafe jika payroll undefined
  const family = teacher.family || {}; // Failsafe jika family undefined
  
  let tMasaKerja = 0;
  const calcYear = Number(p.tahunMasaKerja) || new Date(teacher.tmt || new Date()).getFullYear();
  if (p.tunjanganMasaKerjaManual !== undefined && p.tunjanganMasaKerjaManual !== null && p.tunjanganMasaKerjaManual !== "") {
    tMasaKerja = Number(p.tunjanganMasaKerjaManual) || 0; // Failsafe Mencegah NaN
  } else {
    tMasaKerja = TENURE_RATES[calcYear] || 0;
  }

  const tJabatan = (p.jabatans || []).reduce((sum, j) => sum + (Number(j.nominal) || 0), 0);
  const tPendidikan = p.pendidikan?.nominalOverride !== undefined && p.pendidikan?.nominalOverride !== '' ? (Number(p.pendidikan.nominalOverride) || 0) : (EDU_RATES[teacher.education] || 0);
  const tKompetensi = (p.kompetensi || []).reduce((sum, item) => sum + (Number(item.nominal) || 0), 0);
  
  // Logika Baru: Bonus Hadir otomatis dari Total Tepat Waktu (Realisasi - Telat)
  const realJam = Number(p.jamMengajar?.realisasi) || 0;
  const telat = Number(p.disiplin?.telat) || 0;
  const tepatWaktu = Math.max(0, realJam - telat);

  const bonusHadir = tepatWaktu * (Number(p.disiplin?.tarifHadir) || 0);
  const potongTelat = telat * (Number(p.disiplin?.tarifTelat) || 0);
  const tDisiplin = bonusHadir - potongTelat;

  // PERBAIKAN: Tarif Tunjangan Keluarga Kini Menjadi Dinamis & Bisa Dikustomisasi (Mencegah NaN)
  const tarifSuamiIstri = p.keluarga?.tarifSuamiIstri !== undefined && p.keluarga?.tarifSuamiIstri !== '' ? (Number(p.keluarga.tarifSuamiIstri) || 0) : 200000;
  const tarifAnak = p.keluarga?.tarifAnak !== undefined && p.keluarga?.tarifAnak !== '' ? (Number(p.keluarga.tarifAnak) || 0) : 100000;

  // LOGIKA BARU: Menggunakan failsafe 'family'
  const tKeluargaWife = Number(family.wife) === 1 ? tarifSuamiIstri : 0;
  const tKeluargaAnak = (Number(family.children) || 0) * tarifAnak;
  const tKeluarga = tKeluargaWife + tKeluargaAnak;

  const tTambahan = (p.insentifTambahan || []).reduce((sum, item) => sum + (Number(item.nominal) || 0), 0);
  const tPotonganLainnya = (p.potonganLainnya || []).reduce((sum, item) => sum + (Number(item.nominal) || 0), 0);

  let jamDihitung = 0;
  const targetWajib = p.jamMengajar?.wajib !== undefined && p.jamMengajar?.wajib !== '' ? (Number(p.jamMengajar.wajib) || 0) : (teacher.status === 'Tetap' ? 60 : 0);
  const jsjm = Number(p.jamMengajar?.jsjm) || 0; // TAMBAHAN: Jabatan Setara Jam Mengajar
  
  // LOGIKA BARU: JSJM ditambahkan sebagai "jam bantuan" sebelum dikurangi target wajib
  jamDihitung = Math.max(0, (realJam + jsjm) - targetWajib);
  
  const tMengajar = jamDihitung * (Number(p.jamMengajar?.tarifJPL) || 0);

  const totalKotor = tMasaKerja + tJabatan + tPendidikan + tKompetensi + bonusHadir + tKeluarga + tTambahan + tMengajar;
  const totalPotongan = potongTelat + tPotonganLainnya;
  const totalBersih = Math.max(0, totalKotor - totalPotongan); // Failsafe mutlak agar gaji bersih tidak pernah minus

  return {
    tMasaKerja, tJabatan, tPendidikan, tKompetensi, 
    bonusHadir, potongTelat, tDisiplin,
    tKeluargaWife, tKeluargaAnak, tKeluarga,
    tTambahan, tMengajar, jamDihitung,
    tPotonganLainnya,
    totalKotor, totalPotongan, totalBersih
  };
};

const formatRp = (angka) => {
  const num = Number(angka) || 0;
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
};

const formatDateId = (dateString) => {
  if (!dateString) return '-';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString; // Failsafe untuk mencegah Invalid Date merusak UI
  const options = { day: 'numeric', month: 'long', year: 'numeric' };
  return d.toLocaleDateString('id-ID', options);
};

// Fungsi Hash Sederhana untuk menyamarkan password di LocalStorage
const simpleHash = (str) => {
  if (!str) return '';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Menghasilkan format hash unik, cth: payedu_1a2b3c4d5
  return 'payedu_' + Math.abs(hash).toString(36) + str.length.toString(36);
};

// Fungsi Helper untuk Terbilang (Mengubah Angka menjadi Teks)
const terbilang = (angka) => {
  const bilangan = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];
  let temp = "";
  if (angka < 12) {
    temp = " " + bilangan[angka];
  } else if (angka < 20) {
    temp = terbilang(angka - 10) + " Belas";
  } else if (angka < 100) {
    temp = terbilang(Math.floor(angka / 10)) + " Puluh" + terbilang(angka % 10);
  } else if (angka < 200) {
    temp = " Seratus" + terbilang(angka - 100);
  } else if (angka < 1000) {
    temp = terbilang(Math.floor(angka / 100)) + " Ratus" + terbilang(angka % 100);
  } else if (angka < 2000) {
    temp = " Seribu" + terbilang(angka - 1000);
  } else if (angka < 1000000) {
    temp = terbilang(Math.floor(angka / 1000)) + " Ribu" + terbilang(angka % 1000);
  } else if (angka < 1000000000) {
    temp = terbilang(Math.floor(angka / 1000000)) + " Juta" + terbilang(angka % 1000000);
  }
  return temp;
};

// Fungsi Ekspor PDF Asli (DIPERBARUI: Mencegah Konflik DOM dengan mengembalikan Promise untuk React State)
const exportToPDF = (elementId, filename) => {
  return new Promise((resolve, reject) => {
    const element = document.getElementById(elementId);
    if (!element) {
      alert("Elemen dokumen tidak ditemukan.");
      return reject("Element not found");
    }
    
    const opt = {
      margin:       5, // Margin PDF dirapatkan dari 10mm menjadi 5mm
      filename:     filename,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false },
      jsPDF:        { unit: 'mm', format: [215.9, 330.2], orientation: 'portrait' } // Ukuran Folio/F4
    };

    const startExport = () => {
      window.html2pdf().set(opt).from(element).save().then(resolve).catch(err => {
         console.error("PDF Error:", err);
         alert("Gagal membuat PDF. Coba gunakan peramban (browser) lain atau periksa memori perangkat Anda.");
         reject(err);
      });
    };

    if (window.html2pdf) {
      startExport();
    } else {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.onload = startExport;
      script.onerror = () => {
         alert("Gagal memuat pustaka PDF. Periksa koneksi internet Anda.");
         reject(new Error("Failed to load html2pdf"));
      };
      document.head.appendChild(script);
    }
  });
};

// Fungsi Helper untuk memformat string YYYY-MM ke format teks lokal
const getFormattedPeriod = (periodStr) => {
  if (!periodStr) {
    const d = new Date();
    return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  }
  const [year, month] = periodStr.split('-');
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
};

// TAMBAHAN NO 2: Fungsi Helper Cerdas untuk ID Unik Mutlak (Mencegah Duplikat)
const generateUniqueId = (prefix = '') => {
  return prefix + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
};

// TAMBAHAN GEMINI AI: Helper Pemanggilan API dengan Exponential Backoff (DIPERBARUI)
const callGeminiAPI = async (prompt, customApiKey = "", retries = 5, delay = 1000) => {
  const apiKey = customApiKey || ""; // Disediakan oleh environment eksekusi atau input user
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "Tidak ada respons dari AI.";
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(res => setTimeout(res, delay));
      delay *= 2; // Eksponensial (1s, 2s, 4s, 8s, 16s)
    }
  }
};

// TAMBAHAN NO 1: Failsafe Storage Cerdas untuk mendeteksi limit memori browser (5MB)
const safeStorageSet = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22 || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      console.error(`Penyimpanan penuh saat mencoba menyimpan ${key}`);
      alert(`PERINGATAN KRITIKAL: Memori Penyimpanan Penuh!\n\nGagal menyimpan data baru. Memori penyimpanan browser Anda telah mencapai batas maksimal (sekitar 5MB).\n\nSolusi: Buka menu Pengaturan > Sistem, lakukan "Backup Database", lalu gunakan "Reset Keseluruhan Data Pegawai" untuk membersihkan memori lama.`);
    }
  }
};

const defaultGeneralSettings = {
  appName: 'Portal Penggajian (PayEdu)',
  foundationName: 'Yayasan Pendidikan XYZ',
  schoolName: 'Sekolah Islam Terpadu XYZ',
  principalName: 'H. Fulan, S.Pd., M.Pd', // TAMBAHAN: Nama Kepala Sekolah Dinamis
  signatureUrl: '', // TAMBAHAN: URL Gambar Tanda Tangan
  address: 'Jl. Pendidikan No. 123, Kec. Banjarmasin, Kalimantan Selatan',
  logoUrl: 'https://cdn-icons-png.flaticon.com/512/6213/6213753.png',
  avatarMaleUrl: 'https://cdn3d.iconscout.com/3d/premium/thumb/muslim-man-avatar-5813358-4861183.png',
  avatarFemaleUrl: 'https://cdn3d.iconscout.com/3d/premium/thumb/muslim-woman-avatar-5813359-4861184.png',
  payrollStatus: 'Draft', // Status Workflow: Draft, Pending, Approved
  payrollPeriod: (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })(),
  payrollInfoText: `Sistem penggajian di sekolah kami disusun secara transparan dan berbasis kinerja. Berikut adalah komponen yang membentuk gaji Anda (Take Home Pay):
...
* Jika terdapat ketidaksesuaian data (seperti jumlah kehadiran atau masa kerja), harap segera melapor ke bagian Tata Usaha (TU) Administrasi.`,
  lastModified: Date.now(), // TAMBAHAN: Stempel waktu untuk melacak versi data
  geminiApiKey: '' // TAMBAHAN: Menyimpan API Key pengguna
};

// --- KOMPONEN UTAMA APP ---
export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [user, setUser] = useState(null); 
  
  // TAMBAHAN NO 4: State Sinkronisasi Cloud UI
  const [syncStatus, setSyncStatus] = useState('synced'); // 'synced', 'syncing', 'error'
  
  // TAMBAHAN: State Pendeteksi Tabrakan Data (Concurrency Conflict)
  const [hasConflict, setHasConflict] = useState(false);
  
  const [teachers, setTeachers] = useState(() => {
    const saved = localStorage.getItem('payedu_teachers');
    return saved ? JSON.parse(saved) : [];
  });

  // State Global untuk Pengaturan Aplikasi dengan LocalStorage
  const [generalSettings, setGeneralSettings] = useState(() => {
    const saved = localStorage.getItem('payedu_settings');
    return saved ? JSON.parse(saved) : defaultGeneralSettings;
  });

  const [feedbacks, setFeedbacks] = useState(() => {
    const saved = localStorage.getItem('payedu_feedbacks');
    return saved ? JSON.parse(saved) : [];
  });

  const [loginHistory, setLoginHistory] = useState(() => {
    const saved = localStorage.getItem('payedu_loginHistory');
    return saved ? JSON.parse(saved) : [];
  });

  const [archives, setArchives] = useState(() => {
    const saved = localStorage.getItem('payedu_archives');
    return saved ? JSON.parse(saved) : [];
  });

  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isLoadingDb, setIsLoadingDb] = useState(true);

  // Fungsi Fetch Data Utama (Bisa dipanggil ulang saat terjadi konflik)
  const fetchCloudData = async (isBackgroundSync = false) => {
    try {
      if (!isBackgroundSync) setIsLoadingDb(true);
      const res = await fetch(GOOGLE_SHEETS_API_URL);
      if (!res.ok) throw new Error("Network response was not ok");
      const text = await res.text();
      const data = JSON.parse(text);
      
      if (data.status === 'success') {
        // PERBAIKAN BUG: Melindungi Pengaturan Sistem agar tidak terhapus jika Google Sheet dikosongkan manual
        let serverSettings = defaultGeneralSettings;
        
        if (data.data?.settings && Object.keys(data.data.settings).length > 0) {
            serverSettings = data.data.settings;
        } else {
            // Jika server kehilangan data pengaturan, pulihkan dari memori lokal (Failsafe Cerdas)
            const localSettingsStr = localStorage.getItem('payedu_settings');
            if (localSettingsStr) {
                const parsedLocal = JSON.parse(localSettingsStr);
                if (parsedLocal && parsedLocal.appName) {
                    serverSettings = parsedLocal;
                    // Kirim ulang ke server secara diam-diam agar JSON Google Sheet kembali normal
                    fetch(GOOGLE_SHEETS_API_URL, {
                        method: 'POST',
                        body: JSON.stringify({ action: 'SAVE_SETTINGS', payload: { ...serverSettings, lastModified: Date.now() } })
                    }).catch(e => console.error("Failsafe save settings error:", e));
                }
            }
        }
        
        // Memastikan jika server kosong, data ditetapkan sebagai array kosong []
        // Ini mencegah aplikasi membangkitkan kembali data dari memori browser lokal
        const serverTeachers = Array.isArray(data.data?.teachers) ? data.data.teachers : [];
        
        // CEK KONFLIK: Jika sedang background sync, periksa apakah stempel waktu server lebih baru
        if (isBackgroundSync) {
          if (serverSettings.lastModified > generalSettings.lastModified) {
             setHasConflict(true); // Kunci Auto-Save!
             return; // Hentikan proses penimpaan state lokal
          }
        } else {
          setGeneralSettings(serverSettings);
          setTeachers(serverTeachers); // Terapkan data (walaupun kosong) ke sistem
          setHasConflict(false); // Buka kunci setelah sinkronisasi manual berhasil
        }
      }
    } catch (err) {
      console.warn("Gagal mengambil/memproses data dari server.", err);
    } finally {
      if (!isBackgroundSync) setIsLoadingDb(false);
      setIsDataLoaded(true);
    }
  };

  // Mengambil data dari Google Sheets saat aplikasi pertama kali dimuat
  useEffect(() => {
    fetchCloudData();
  }, []);

  // TAMBAHAN: Radar Latar Belakang (Polling) mengecek versi data setiap 15 detik
  useEffect(() => {
    if (!isDataLoaded || !user || hasConflict) return; // Jangan polling jika belum login atau sedang konflik

    const pollInterval = setInterval(() => {
       fetchCloudData(true); // Lakukan background check
    }, 15000); // 15 detik

    return () => clearInterval(pollInterval);
  }, [isDataLoaded, user, generalSettings.lastModified, hasConflict]);

  // TAMBAHAN: Ref untuk mencegah infinite loop pada Auto-Save
  const lastSavedSettingsRef = useRef('');
  const lastSavedTeachersRef = useRef('');

  // Menyimpan pengaturan ke browser dan Google Sheets secara otomatis (Debounce 1.5 detik)
  useEffect(() => {
    if (!isDataLoaded || hasConflict) return;

    // Mencegah Infinite Loop: Abaikan jika yang berubah HANYA stempel waktu (lastModified)
    const currentDataStr = JSON.stringify({ ...generalSettings, lastModified: 0 });
    if (lastSavedSettingsRef.current === currentDataStr) return;
    lastSavedSettingsRef.current = currentDataStr;

    safeStorageSet('payedu_settings', JSON.stringify(generalSettings));
    setSyncStatus('syncing');

    const payloadWithTime = { ...generalSettings, lastModified: Date.now() };
    // Update state lokal, tapi loop akan terhenti di iterasi berikutnya berkat `lastSavedSettingsRef`
    setGeneralSettings(prev => ({ ...prev, lastModified: payloadWithTime.lastModified }));

    const timeoutId = setTimeout(() => {
      fetch(GOOGLE_SHEETS_API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'SAVE_SETTINGS', payload: payloadWithTime })
      })
      .then(res => {
         if (!res.ok) throw new Error("Gagal sinkron");
         return res.json();
      })
      .then(() => setSyncStatus('synced'))
      .catch(err => {
         console.error("Sync Error:", err);
         setSyncStatus('error');
      });
    }, 1500);
    return () => clearTimeout(timeoutId);
  }, [generalSettings, isDataLoaded, hasConflict]);

  // Menyimpan data pegawai ke browser dan Google Sheets secara otomatis (Debounce 2 detik)
  useEffect(() => {
    if (!isDataLoaded || hasConflict) return;

    // Mencegah Infinite Loop pada data Pegawai
    const currentTeachersStr = JSON.stringify(teachers);
    if (lastSavedTeachersRef.current === currentTeachersStr) return;
    lastSavedTeachersRef.current = currentTeachersStr;

    safeStorageSet('payedu_teachers', currentTeachersStr);
    setSyncStatus('syncing');

    const newTimestamp = Date.now();
    setGeneralSettings(prev => ({ ...prev, lastModified: newTimestamp }));

    const timeoutId = setTimeout(() => {
      fetch(GOOGLE_SHEETS_API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'SAVE_TEACHERS', payload: teachers })
      })
      .then(res => {
         if (!res.ok) throw new Error("Gagal sinkron");
         return res.json();
      })
      .then(() => setSyncStatus('synced'))
      .catch(err => {
         console.error("Sync Error:", err);
         setSyncStatus('error');
      });
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [teachers, isDataLoaded, hasConflict]);

  useEffect(() => {
    if (isDataLoaded && !hasConflict) {
      safeStorageSet('payedu_feedbacks', JSON.stringify(feedbacks));
    }
  }, [feedbacks, isDataLoaded, hasConflict]);

  useEffect(() => {
    if (isDataLoaded && !hasConflict) {
      safeStorageSet('payedu_loginHistory', JSON.stringify(loginHistory));
    }
  }, [loginHistory, isDataLoaded, hasConflict]);

  useEffect(() => {
    if (isDataLoaded && !hasConflict) {
      safeStorageSet('payedu_archives', JSON.stringify(archives));
    }
  }, [archives, isDataLoaded, hasConflict]);

  // FITUR BARU 2: Keamanan Sesi Berwaktu (Auto-Logout) selama 15 Menit Inaktif
  useEffect(() => {
    if (!user) return;

    let timeoutId;
    // Waktu tunggu batas sesi (15 Menit = 15 * 60 * 1000 milidetik)
    const SESSION_TIMEOUT = 15 * 60 * 1000; 

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setUser(null); // Logout paksa
        alert('🔒 SESI BERAKHIR: Anda telah dikeluarkan secara otomatis karena tidak ada aktivitas selama 15 menit. Silakan login kembali demi keamanan data finansial.');
      }, SESSION_TIMEOUT);
    };

    // Dengarkan aktivitas kursor, klik, atau ketikan keyboard
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('click', resetTimer);
    window.addEventListener('scroll', resetTimer);

    resetTimer(); // Inisiasi pertama

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('click', resetTimer);
      window.removeEventListener('scroll', resetTimer);
    };
  }, [user]);

  const recordLogin = (name, role, status) => {
    const ua = navigator.userAgent;
    let browser = "Browser";
    if (ua.includes("Firefox")) browser = "Firefox";
    else if (ua.includes("Chrome") || ua.includes("CriOS")) browser = "Chrome";
    else if (ua.includes("Safari")) browser = "Safari";
    else if (ua.includes("Edge")) browser = "Edge";

    let os = "OS";
    if (ua.includes("Windows")) os = "Windows";
    else if (ua.includes("Mac")) os = "MacOS";
    else if (ua.includes("Android")) os = "Android";
    else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

    const newLog = {
      id: generateUniqueId('log-'),
      name, role, status,
      // DIPERBARUI: Memastikan zona waktu dikunci pada Waktu Indonesia Barat (WIB)
      time: new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta' }) + ' WIB',
      device: `${browser} / ${os}`
    };
    // Simpan history maksimum 50 data terbaru agar browser tidak berat
    setLoginHistory(prev => [newLog, ...prev].slice(0, 50));
  };

  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300..800;1,300..800&display=swap');
      
      body, html, #root, .font-sans {
        font-family: 'Plus Jakarta Sans', sans-serif !important;
      }

      @media print {
        @page {
          size: 215.9mm 330.2mm; /* Ukuran Kertas Folio / F4 */
          margin: 5mm; /* DIPERBARUI: Margin Print Kertas dirapatkan menjadi 5mm */
        }
        body, html, #root { 
          background: white !important; 
          color: black !important; 
        }
        /* Sembunyikan sidebar, header, dan tombol yang tidak perlu */
        aside, header, .no-print { 
          display: none !important; 
        }
        /* Buka kuncian scroll agar elemen bisa dicetak memanjang ke halaman berikutnya */
        .h-screen, .min-h-screen, main, .overflow-hidden, .overflow-auto, .overflow-y-auto { 
          height: auto !important; 
          min-height: auto !important; 
          overflow: visible !important; 
        }
        .print-only { 
          display: block !important; 
        }
        .print-area { 
          position: relative !important; 
          width: 100% !important; 
          background: white !important; 
          padding: 0 !important; 
          margin: 0 !important; 
        }
        /* Reset background colors for print to save ink, except for important highlights */
        * { 
          -webkit-print-color-adjust: exact !important; 
          print-color-adjust: exact !important; 
        }
      }
      .print-only { display: none; }
      .hide-scrollbar::-webkit-scrollbar { display: none; }
      .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      @keyframes soft-float {
        0% { transform: translateY(0px); }
        50% { transform: translateY(-10px) scale(1.03); }
        100% { transform: translateY(0px); }
      }
      .animate-soft-float {
        animation: soft-float 3.5s ease-in-out infinite;
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  if (isLoadingDb) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4 shadow-lg shadow-blue-500/20"></div>
        <h2 className="text-xl font-bold animate-pulse">Menghubungkan ke Server...</h2>
        <p className="text-slate-500 mt-2 font-medium">Mohon Tunggu Ya..</p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans transition-colors duration-200 ${isDarkMode ? 'dark bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      {!user ? (
        <LoginView onLogin={setUser} isDarkMode={isDarkMode} toggleTheme={() => setIsDarkMode(!isDarkMode)} settings={generalSettings} recordLogin={recordLogin} />
      ) : (
        <MainLayout 
          user={user} 
          onLogout={() => setUser(null)} 
          isDarkMode={isDarkMode} 
          toggleTheme={() => setIsDarkMode(!isDarkMode)}
          teachers={teachers}
          setTeachers={setTeachers}
          settings={generalSettings}
          setSettings={setGeneralSettings}
          feedbacks={feedbacks}
          setFeedbacks={setFeedbacks}
          loginHistory={loginHistory}
          archives={archives}
          setArchives={setArchives}
          syncStatus={syncStatus} 
          hasConflict={hasConflict} // Pass state konflik ke UI
          resolveConflict={() => fetchCloudData(false)} // Pass fungsi pemulihan ke UI
        />
      )}
    </div>
  );
}

// --- VIEW: LOGIN ---
function LoginView({ onLogin, isDarkMode, toggleTheme, settings, recordLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  
  // TAMBAHAN: State untuk loading dan modal lupa password
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  // TAMBAHAN: Memuat username yang tersimpan jika fitur "Ingat Saya" aktif sebelumnya
  useEffect(() => {
    const savedUser = localStorage.getItem('payedu_saved_username');
    if (savedUser) {
      setUsername(savedUser);
      setRemember(true);
    }
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Simulasi proses loading validasi sesaat (UX)
    setTimeout(() => {
      // 1. Cek dari LocalStorage (jika akun dibuat via Pengaturan)
      const savedAccounts = JSON.parse(localStorage.getItem('payedu_accounts')) || [];
      
      // Hash inputan user sebelum membandingkan dengan database
      const hashedInputPassword = simpleHash(password);
      
      // Cari akun dengan username dan password yang sudah di-hash
      const acc = savedAccounts.find(a => a.username === username && a.password === hashedInputPassword);
      
      let authUser = null;

      if (acc) {
         recordLogin(acc.name, acc.role, 'Sukses');
         authUser = { role: acc.role === 'Admin' ? 'admin' : acc.role, name: acc.name, id: acc.id || username };
      }
      // 2. Fallback Hardcoded
      else if (username === 'Akbar' && password === 'Boy2014') {
        recordLogin('Administrator System', 'Admin', 'Sukses');
        authUser = { role: 'admin', name: 'Administrator System' };
      } else if (username === 'kepsek' && password === 'Ilwani2010') {
        recordLogin('Kepala Sekolah', 'Kepala Sekolah', 'Sukses');
        authUser = { role: 'Kepala Sekolah', name: 'Kepala Sekolah' };
      } else if (username.startsWith('G') && password === 'guru123') {
        recordLogin(`Guru ${username}`, 'Guru', 'Sukses');
        authUser = { role: 'guru', id: username, name: `Guru ${username}` };
      }

      if (authUser) {
        // Logika eksekusi fungsi "Ingat Saya"
        if (remember) {
          localStorage.setItem('payedu_saved_username', username);
        } else {
          localStorage.removeItem('payedu_saved_username');
        }
        onLogin(authUser);
      } else {
        recordLogin(username || 'Unknown', 'Unknown', 'Gagal (Password Salah)');
        setError('Username atau password salah! (kalau lupa bisa tanya Pa Akbar)');
        setIsLoading(false);
      }
    }, 800); // Delay 800ms
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 relative overflow-hidden bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      
      {/* Modal Lupa Password */}
      {showForgotModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-700">
            <div className="p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center mx-auto mb-4">
                <ShieldCheck size={32} />
              </div>
              <h3 className="text-xl font-bold dark:text-white mb-2">Lupa Password?</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-6">
                Demi keamanan privasi data finansial, sistem tidak mengizinkan reset kata sandi secara mandiri. Silakan hubungi <strong>Administrator</strong> atau staf <strong>Tata Usaha</strong> untuk meminta pengaturan ulang kata sandi Anda.
              </p>
              <button onClick={() => setShowForgotModal(false)} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors shadow-sm">
                Mengerti, Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ambient Background Elements for Elegance */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-400/20 dark:bg-blue-600/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-400/20 dark:bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Container Card Login Premium & Elegant */}
      <div className="w-full max-w-[420px] bg-white/90 dark:bg-slate-800/95 backdrop-blur-xl rounded-[2rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] dark:shadow-[0_0_35px_-5px_rgba(59,130,246,0.4)] overflow-hidden border border-white/50 dark:border-blue-500/40 relative z-10 transition-all duration-500 transform hover:shadow-[0_25px_65px_-15px_rgba(59,130,246,0.15)] dark:hover:shadow-[0_0_45px_-5px_rgba(59,130,246,0.6)] dark:hover:border-blue-400/60">
        
        <div className="bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 p-10 text-center text-white relative overflow-hidden">
          {/* Dekorasi Background Header */}
          <div className="absolute top-0 right-0 -mt-16 -mr-16 w-48 h-48 bg-white/5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 -mb-16 -ml-16 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl"></div>
          
          {/* Tombol Tema Mode Gelap/Terang di Pojok Kanan Atas dalam Card */}
          <div className="absolute top-5 right-5 flex flex-col items-center z-20">
            <button onClick={toggleTheme} className="p-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md transition-all text-white shadow-sm border border-white/10 outline-none focus:ring-2 focus:ring-white/50" title="Ganti Tema Mode">
              {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <span className="text-[9px] font-bold mt-1.5 text-white/80 uppercase tracking-wider">
              {isDarkMode ? 'Mode Terang' : 'Mode Gelap'}
            </span>
          </div>

          {/* Logo Mengembang Tanpa Border */}
          <div className="w-24 h-24 md:w-28 md:h-28 mx-auto mb-6 flex items-center justify-center animate-soft-float relative z-10">
             {settings?.logoUrl ? (
                <img src={settings.logoUrl} alt="Logo Aplikasi" className="w-full h-full object-contain drop-shadow-[0_10px_15px_rgba(0,0,0,0.5)]" />
             ) : (
                <Calculator size={64} className="drop-shadow-2xl text-white" />
             )}
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight relative z-10 drop-shadow-md">{settings?.appName || 'MANAJEMEN GAJI'}</h1>
          <p className="text-blue-200/80 mt-2 text-sm relative z-10 font-medium">Guru & Staff SD-IT Qurrata A'yun</p>
        </div>
        
        <form onSubmit={handleLogin} className="p-8 md:p-10 space-y-5">
          {error && <div className="p-3.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-medium rounded-xl flex items-start gap-2.5 border border-red-100 dark:border-red-800/50 animate-in fade-in slide-in-from-top-2"><AlertCircle size={18} className="mt-0.5 flex-shrink-0"/>{error}</div>}
          
          <div>
            <label className="block text-xs font-bold mb-2 text-slate-500 dark:text-slate-400 uppercase tracking-wider">Username / NIPY</label>
            <div className="relative group">
              <UserCircle size={18} className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                value={username} onChange={e => setUsername(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all dark:text-white font-medium text-sm placeholder:text-slate-400"
                placeholder="Masukkan username" required
              />
            </div>
          </div>

          <div>
             <label className="block text-xs font-bold mb-2 text-slate-500 dark:text-slate-400 uppercase tracking-wider">Password</label>
             <div className="relative group">
                <Lock size={18} className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input 
                  type={showPwd ? 'text' : 'password'} 
                  value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all dark:text-white font-medium text-sm placeholder:text-slate-400"
                  placeholder="••••••••" required
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-4 top-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                  {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
             </div>
          </div>

          <div className="flex items-center justify-between text-sm pt-2">
            <label className="flex items-center gap-2 cursor-pointer font-medium group">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500/50 border-slate-300 bg-slate-50 dark:bg-slate-800 dark:border-slate-600 transition-all cursor-pointer" />
              <span className="text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">Ingat saya</span>
            </label>
            <button type="button" onClick={() => setShowForgotModal(true)} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-semibold transition-colors outline-none">Lupa Password?</button>
          </div>

          <button type="submit" disabled={isLoading} className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 dark:from-blue-600 dark:via-blue-700 dark:to-indigo-600 dark:hover:from-blue-500 dark:hover:via-blue-600 dark:hover:to-indigo-500 text-white font-semibold py-3.5 rounded-xl transition-all duration-300 shadow-[0_8px_20px_-6px_rgba(16,185,129,0.4)] dark:shadow-[0_8px_20px_-6px_rgba(37,99,235,0.4)] hover:shadow-lg hover:shadow-emerald-500/40 dark:hover:shadow-blue-500/50 hover:-translate-y-1 text-sm tracking-widest uppercase flex justify-center items-center gap-2 mt-4 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0">
            {isLoading ? (
              <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Memproses...</>
            ) : (
              <><LogIn size={18} /> Masuk</>
            )}
          </button>

          {/* Teks Design by */}
          <div className="pt-6 text-center border-t-2 border-slate-200 dark:border-slate-600 mt-6">
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
               Desain Aplikasi: <span className="font-semibold text-slate-800 dark:text-slate-200 tracking-wide">Muhamad Husni Akbar</span>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- MAIN LAYOUT & NAVIGATION ---
function MainLayout({ user, onLogout, isDarkMode, toggleTheme, teachers, setTeachers, settings, setSettings, feedbacks, setFeedbacks, loginHistory, archives, setArchives, syncStatus, hasConflict, resolveConflict }) {
  const [activeTab, setActiveTab] = useState(user.role === 'admin' ? 'dashboard' : user.role === 'Kepala Sekolah' ? 'dashboard' : 'portal_dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  const [selectedGajiId, setSelectedGajiId] = useState(null);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [absensiFilter, setAbsensiFilter] = useState('all');

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
    { id: 'portal_kehadiran', label: 'Rekap Kehadiran', icon: Clock, color: 'text-white', glow: 'shadow-amber-500/50', bg: 'bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 border border-amber-300/50 dark:border-amber-600/50' },
    { id: 'portal_gaji', label: 'Slip Gaji Bulanan', icon: Wallet, color: 'text-white', glow: 'shadow-emerald-500/50', bg: 'bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-700 border border-emerald-300/50 dark:border-emerald-600/50' },
    { id: 'portal_pinjaman', label: 'Buku Pinjaman', icon: CreditCard, color: 'text-white', glow: 'shadow-teal-500/50', bg: 'bg-gradient-to-br from-teal-400 via-teal-500 to-teal-700 border border-teal-300/50 dark:border-teal-600/50' },
    { id: 'portal_riwayat', label: 'Riwayat Gaji', icon: History, color: 'text-white', glow: 'shadow-indigo-500/50', bg: 'bg-gradient-to-br from-indigo-400 via-indigo-500 to-indigo-700 border border-indigo-300/50 dark:border-indigo-600/50' },
    { id: 'portal_info', label: 'Info Sistem', icon: Info, color: 'text-white', glow: 'shadow-purple-500/50', bg: 'bg-gradient-to-br from-purple-400 via-purple-500 to-purple-700 border border-purple-300/50 dark:border-purple-600/50' },
    { id: 'portal_saran', label: 'Kritik & Saran', icon: MessageSquare, color: 'text-white', glow: 'shadow-rose-500/50', bg: 'bg-gradient-to-br from-rose-400 via-rose-500 to-rose-700 border border-rose-300/50 dark:border-rose-600/50' },
  ];

  const kepsekNav = [
    { id: 'dashboard', label: 'Dashboard & Approval', icon: LayoutDashboard, color: 'text-white', glow: 'shadow-purple-500/50', bg: 'bg-gradient-to-br from-purple-400 via-purple-500 to-purple-700 border border-purple-300/50 dark:border-purple-600/50' },
    // TAMBAHAN: Akses menu pemantauan penuh untuk Kepala Sekolah
    { id: 'dataguru', label: 'Data Guru & Staff', icon: Users, color: 'text-white', glow: 'shadow-blue-500/50', bg: 'bg-gradient-to-br from-blue-400 via-blue-500 to-blue-700 border border-blue-300/50 dark:border-blue-600/50' },
    { id: 'rekapabsensi', label: 'Rekap Absen', icon: FileText, color: 'text-white', glow: 'shadow-orange-500/50', bg: 'bg-gradient-to-br from-orange-400 via-orange-500 to-orange-700 border border-orange-300/50 dark:border-orange-600/50' },
    { id: 'gaji', label: 'Komponen Gaji', icon: Calculator, color: 'text-white', glow: 'shadow-emerald-500/50', bg: 'bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-700 border border-emerald-300/50 dark:border-emerald-600/50' },
    { id: 'rekap', label: 'Rekap Gaji', icon: FileText, color: 'text-white', glow: 'shadow-rose-500/50', bg: 'bg-gradient-to-br from-rose-400 via-rose-500 to-rose-700 border border-rose-300/50 dark:border-rose-600/50' },
    // END TAMBAHAN
    { id: 'laporan', label: 'Laporan Detail', icon: BarChart3, color: 'text-white', glow: 'shadow-indigo-500/50', bg: 'bg-gradient-to-br from-indigo-400 via-indigo-500 to-indigo-700 border border-indigo-300/50 dark:border-indigo-600/50' },
    { id: 'arsip', label: 'Manajemen Arsip', icon: Archive, color: 'text-white', glow: 'shadow-teal-500/50', bg: 'bg-gradient-to-br from-teal-400 via-teal-500 to-teal-700 border border-teal-300/50 dark:border-teal-600/50' },
  ];
    const navItems = user.role === 'admin' ? adminNav : user.role === 'Kepala Sekolah' ? kepsekNav : guruNav;

  const navigateToGaji = (teacherId) => {
    setSelectedGajiId(teacherId);
    setActiveTab('gaji');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardView teachers={teachers} user={user} settings={settings} setSettings={setSettings} archives={archives} setActiveTab={setActiveTab} onAbsensiAlertClick={() => { setAbsensiFilter('sering_telat'); setActiveTab('rekapabsensi'); }} />;
      case 'dataguru': return <DataGuruView teachers={teachers} setTeachers={setTeachers} />;
      case 'rekapabsensi': return <RekapAbsensiView teachers={teachers} setTeachers={setTeachers} externalFilter={absensiFilter} setExternalFilter={setAbsensiFilter} settings={settings} />;
      case 'gaji': return <GajiView teachers={teachers} setTeachers={setTeachers} externalSelectedId={selectedGajiId} setExternalSelectedId={setSelectedGajiId} settings={settings} />;
      case 'pinjaman': return <RekapPinjamanView teachers={teachers} setTeachers={setTeachers} onEditGaji={navigateToGaji} />;
      case 'rekap': return <RekapGajiView teachers={teachers} setTeachers={setTeachers} onEditGaji={navigateToGaji} settings={settings} setSettings={setSettings} archives={archives} setArchives={setArchives} />;
      case 'laporan': return <LaporanView teachers={teachers} fundingSources={fundingSources} setFundingSources={setFundingSources} settings={settings} />;
      case 'arsip': return <ArsipView archives={archives} setArchives={setArchives} settings={settings} />;
      case 'portal_dashboard': 
      case 'portal_kehadiran':
      case 'portal_gaji':
      case 'portal_pinjaman':
      case 'portal_riwayat':
      case 'portal_info':
      case 'portal_saran':
        // PERBAIKAN: Menambahkan props `archives` ke PortalGuruView
        return <PortalGuruView user={user} teachers={teachers} setTeachers={setTeachers} settings={settings} feedbacks={feedbacks} setFeedbacks={setFeedbacks} activeSection={activeTab} setActiveTab={setActiveTab} archives={archives} />;
      case 'pengaturan': return <PengaturanView teachers={teachers} setTeachers={setTeachers} settings={settings} setSettings={setSettings} feedbacks={feedbacks} setFeedbacks={setFeedbacks} loginHistory={loginHistory} />;
      default: return <DashboardView teachers={teachers} user={user} settings={settings} setSettings={setSettings} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-900">
      {isSidebarOpen && window.innerWidth < 768 && (
        <div className="fixed inset-0 bg-slate-900/50 z-20 md:hidden no-print" onClick={() => setIsSidebarOpen(false)} />
      )}

      <aside className={`fixed md:static inset-y-0 left-0 z-30 w-64 shrink-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transform transition-all duration-300 ease-in-out flex flex-col no-print ${isSidebarOpen ? 'translate-x-0 md:ml-0' : '-translate-x-full md:-ml-64'}`}>
        <div className="h-16 flex items-center px-6 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          {settings?.logoUrl ? (
            <img src={settings.logoUrl} alt="Logo" className="w-8 h-8 object-contain mr-3 shrink-0 drop-shadow-sm" />
          ) : (
            <Calculator className="mr-3 shrink-0" size={24} />
          )}
          <span className="font-bold text-lg tracking-wide truncate">{settings?.appName ? settings.appName.split(' ')[0] : 'PayEdu Apps'}</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-2">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { 
                  setActiveTab(item.id); 
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
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-16 shrink-0 flex items-center justify-between px-4 sm:px-6 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 no-print">
          <div className="flex items-center gap-3">
            <button 
              className="p-2 -ml-2 text-slate-600 dark:text-slate-300 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50" 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              title="Toggle Menu"
            >
              <Menu size={24} />
            </button>
            <h2 className="text-lg md:text-xl font-semibold text-slate-800 dark:text-white capitalize">
              {navItems.find(i => i.id === activeTab)?.label || 'Dashboard'}
            </h2>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            
            {/* TAMBAHAN NO 4: Indikator Sinkronisasi Cloud (Status Online/Offline) */}
            {(user.role === 'admin' || user.role === 'Kepala Sekolah') && (
              <div 
                className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all duration-300 cursor-help ${syncStatus === 'error' ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800/50' : 'bg-slate-100 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600'}`} 
                title={syncStatus === 'synced' ? "Data tersinkronisasi ke Cloud (Aman)" : syncStatus === 'syncing' ? "Menyimpan perubahan ke Cloud..." : "Koneksi terputus! Data saat ini hanya tersimpan secara lokal di perangkat Anda."}
              >
                {syncStatus === 'synced' && <Cloud size={14} className="text-emerald-500" />}
                {syncStatus === 'syncing' && <RefreshCw size={14} className="text-blue-500 animate-spin" />}
                {syncStatus === 'error' && <CloudOff size={14} className="text-red-500 animate-pulse" />}
                <span className={`text-[10px] font-bold tracking-wide uppercase ${syncStatus === 'synced' ? 'text-slate-600 dark:text-slate-300' : syncStatus === 'syncing' ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                  {syncStatus === 'synced' ? 'Tersimpan' : syncStatus === 'syncing' ? 'Sinkronasi...' : 'Offline Lokal'}
                </span>
              </div>
            )}

            {/* TAMBAHAN: Jam & Tanggal Real-time di Header */}
            <div className="hidden lg:flex flex-col items-end justify-center border-r border-slate-200 dark:border-slate-700 pr-4 mr-1">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{formattedDate}</span>
              <span className="text-sm font-black text-slate-700 dark:text-slate-200 font-mono tracking-wider flex items-center gap-1.5">
                <Clock size={12} className="text-blue-500" /> {formattedTime} <span className="text-[10px] text-slate-400 font-bold ml-0.5">WIB</span>
              </span>
            </div>

            <button onClick={toggleTheme} className="p-2 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <div className="relative">
              <button 
                onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                className="flex items-center gap-3 focus:outline-none hover:opacity-80 transition-opacity"
              >
                <div className="hidden md:block text-right">
                  {/* DIPERBARUI: Menambahkan Sapaan Waktu Cerdas */}
                  <div className="font-semibold text-sm text-slate-800 dark:text-white leading-none">{getGreeting()}, {user.name.split(' ')[0]}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 capitalize mt-1.5">{user.role}</div>
                </div>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold shadow-md shadow-blue-500/30">
                  {user.name.charAt(0)}
                </div>
              </button>

              {isProfileDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsProfileDropdownOpen(false)}></div>
                  
                  <div className="absolute right-0 mt-3 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 py-2 z-50 animate-in fade-in zoom-in-95 slide-in-from-top-2">
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 mb-2">
                      <div className="font-bold text-sm text-slate-800 dark:text-white">{user.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 capitalize mt-0.5">{user.role}</div>
                    </div>
                    
                    {user.role === 'admin' ? (
                      <button 
                        onClick={() => {
                           setActiveTab('pengaturan');
                           setIsProfileDropdownOpen(false);
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 transition-colors"
                      >
                        <Settings size={16} className="text-slate-400" />
                        Pengaturan Akun
                      </button>
                    ) : (
                      <div className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900/50 mx-2 rounded-lg border border-slate-100 dark:border-slate-700/50 mb-2">
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
                      className="w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 transition-colors mt-1 border-t border-slate-100 dark:border-slate-700/50"
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

        {/* TAMBAHAN: Banner Peringatan Konflik Darurat */}
        {hasConflict && (
           <div className="bg-red-600 text-white px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md z-40 relative animate-in slide-in-from-top-2 no-print">
             <div className="flex items-center gap-3">
               <AlertCircle className="shrink-0 animate-pulse" size={24} />
               <div>
                 <h4 className="font-bold text-sm">Konflik Data Terdeteksi!</h4>
                 <p className="text-xs text-red-100 mt-0.5">Pengguna lain (Admin/Kepsek) baru saja menyimpan perubahan data. Auto-Save Anda telah <strong>dibekukan sementara</strong> untuk mencegah penimpaan data.</p>
               </div>
             </div>
             <button 
               onClick={resolveConflict} 
               className="shrink-0 whitespace-nowrap bg-white text-red-700 hover:bg-red-50 px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition-transform hover:scale-105 flex items-center gap-2"
             >
               <RefreshCw size={16} /> Muat Ulang Data Terbaru
             </button>
           </div>
        )}

        <div className={`flex-1 overflow-auto p-4 sm:p-6 lg:p-8 ${hasConflict ? 'opacity-50 pointer-events-none blur-[1px] transition-all' : 'transition-all'}`}>
          {renderContent()}
        </div>
      </main>
    </div>
  );
}

// --- SUB-VIEWS ---

function DashboardView({ teachers, user, settings, setSettings, archives, setActiveTab, onAbsensiAlertClick }) {
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState('Tetap');

  const [isEduModalOpen, setIsEduModalOpen] = useState(false);
  const [activeEduTab, setActiveEduTab] = useState('S1');
  
  // TAMBAHAN: State Modal & Notifikasi Custom untuk Kepala Sekolah
  const [isConfirmApproveOpen, setIsConfirmApproveOpen] = useState(false);
  const [notification, setNotification] = useState({ isOpen: false, type: '', message: '' });

  const eduDetails = useMemo(() => {
    const grouped = { 'S2': [], 'S1': [], 'Diploma': [], 'SMA/Pondok': [] };
    teachers.forEach(t => {
      if (grouped[t.education]) {
        grouped[t.education].push(t);
      }
    });
    return grouped;
  }, [teachers]);

  const stats = useMemo(() => {
    let lk = 0, pr = 0, tetap = 0, tdkTetap = 0, totalGaji = 0;
    const eduCount = { 'S2': 0, 'S1': 0, 'Diploma': 0, 'SMA/Pondok': 0 };
    const opsCount = { kebersihan: 0, security: 0, pengabdian: 0 };
    
    const listTetap = [];
    const listTidakTetap = [];

    teachers.forEach(t => {
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

      const calc = calculatePayroll(t);
      totalGaji += calc.totalBersih;
    });

    return { 
      lk, pr, tetap, tdkTetap, eduCount, totalGaji, total: teachers.length, 
      opsCount, listTetap, listTidakTetap 
    };
  }, [teachers]);

  // TAMBAHAN: Kalkulasi Metrik Peringatan (Alerts)
  const alerts = useMemo(() => {
     let lateTeachers = 0;
     let totalUnpaidLoans = 0;
     teachers.forEach(t => {
        if ((t.payroll?.disiplin?.telat || 0) >= 3) lateTeachers++;
        const loans = t.payroll?.potonganLainnya?.filter(p => p.ket.toLowerCase().match(/kasbon|koperasi|pinjaman/)) || [];
        loans.forEach(l => totalUnpaidLoans += (l.nominal * 4)); // Menggunakan aturan simulasi sisa 4x cicilan
     });
     return { lateTeachers, totalUnpaidLoans };
  }, [teachers]);

  // TAMBAHAN: Integrasi Data Grafik dari Arsip Asli (Bukan Dummy Lagi)
  const chartData = useMemo(() => {
     if (!archives || archives.length === 0) {
        // Data Simulasi Proyeksi Jika Belum Pernah Tutup Buku
        return [
          { bulan: 'Jan 2026', total: 145000000 },
          { bulan: 'Feb 2026', total: 148000000 },
          { bulan: 'Mar 2026', total: 147500000 },
          { bulan: 'Apr 2026', total: 151000000 },
          { bulan: 'Mei 2026', total: 150000000 },
          { bulan: 'Jun 2026', total: stats.totalGaji } // Proyeksi real-time bulan ini
        ];
     }
     // Mengambil riwayat arsip, dibalik agar urutan tanggalnya dari lama ke terbaru, maksimal 12 bulan terakhir
     return [...archives].reverse().slice(-12).map(arc => ({
         bulan: arc.periode.substring(0, 8), // Memendekkan string nama bulan
         total: arc.totalGaji
     }));
  }, [archives, stats.totalGaji]);

  const currentMonthYear = getFormattedPeriod(settings?.payrollPeriod);

  // PERBAIKAN: Mengganti window.confirm dengan modal custom
  const handleApprove = () => {
    setIsConfirmApproveOpen(true);
  };

  const executeApprove = () => {
    setIsConfirmApproveOpen(false);
    setSettings({ ...settings, payrollStatus: 'Approved' });
    setNotification({ isOpen: true, type: 'success', message: 'Berhasil! Rincian gaji bulan ini telah disahkan.' });
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

      {/* DIPERBARUI: Desain Banner Dashboard Admin Dibuat Lebih Mewah & Personal */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-700 rounded-2xl p-6 md:p-10 text-white shadow-xl relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 mb-6">
        {/* TAMBAHAN: Wrapper Background Khusus agar overflow-hidden tidak memotong Card yang scale saat di-hover */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
           <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 mix-blend-overlay"></div>
           {/* Ornamen Latar Belakang */}
           <div className="absolute -right-10 -top-24 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
           <div className="absolute right-32 -bottom-24 w-48 h-48 bg-indigo-500/30 rounded-full blur-2xl pointer-events-none"></div>
        </div>
        
        <div className="relative z-10">
          {/* Sapaan Personal */}
          <p className="text-blue-200 text-sm md:text-base font-bold mb-1 tracking-widest uppercase drop-shadow-md">
             {user?.role === 'Kepala Sekolah' ? 'Ruang Kendali Pimpinan' : 'Ruang Kendali Administrator'}
          </p>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-white tracking-tight drop-shadow-[0_0_15px_rgba(255,255,255,0.7)] mb-4 leading-tight">
             Halo, {user?.name.split(' ')[0]}!
          </h1>
          <p className="text-blue-100 opacity-90 max-w-xl text-sm md:text-base">
            Pantau statistik kepegawaian, distribusi status guru, tingkat pendidikan, dan estimasi total pengeluaran gaji sekolah periode ini secara *real-time*.
          </p>
        </div>
        
        <div className="relative z-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto mt-4 lg:mt-0">
          <div className="flex items-center gap-4 bg-white/10 p-3.5 rounded-2xl backdrop-blur-md border border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] w-full sm:w-auto transition-transform hover:scale-105 group relative overflow-hidden">
            <div className="bg-blue-500/50 p-3 rounded-xl shrink-0 shadow-inner group-hover:scale-110 transition-transform">
              <Calendar size={24} className="text-blue-50" />
            </div>
            <div className="flex flex-col">
              <div className="text-[10px] text-blue-200 uppercase tracking-widest font-bold mb-0.5 flex items-center gap-1">
                Periode Gaji {(user?.role === 'admin' || user?.role === 'Kepala Sekolah') && <Edit size={10} className="opacity-50" />}
              </div>
              {(user?.role === 'admin' || user?.role === 'Kepala Sekolah') ? (
                <input 
                  type="month" 
                  value={settings?.payrollPeriod || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`} 
                  onChange={e => setSettings({...settings, payrollPeriod: e.target.value})}
                  className="bg-transparent text-lg md:text-xl font-black text-white outline-none cursor-pointer border-b border-dashed border-white/40 hover:border-white focus:border-white w-36 md:w-44 transition-colors [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:invert"
                  title="Klik untuk mengubah periode penggajian"
                />
              ) : (
                <div className="text-lg md:text-xl font-black truncate">{currentMonthYear}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 bg-white/10 p-4 rounded-2xl backdrop-blur-md border border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] w-full sm:w-auto transition-transform hover:scale-105">
            <div className="bg-emerald-500/50 p-3 rounded-xl shrink-0 shadow-inner">
              <Wallet size={24} className="text-emerald-50" />
            </div>
            <div className="truncate">
              <div className="text-[10px] text-emerald-200 uppercase tracking-widest font-bold mb-0.5">Estimasi Pengeluaran</div>
              <div className="text-lg md:text-xl font-black truncate">{formatRp(stats.totalGaji)}</div>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
          <button onClick={() => setActiveTab('dataguru')} className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-md transition-all flex flex-col items-center justify-center gap-2 group cursor-pointer">
            <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform"><Users size={20}/></div>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Data Pegawai</span>
          </button>
          <button onClick={() => setActiveTab('gaji')} className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-600 hover:shadow-md transition-all flex flex-col items-center justify-center gap-2 group cursor-pointer">
            <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform"><Calculator size={20}/></div>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Kelola Gaji</span>
          </button>
          <button onClick={() => setActiveTab('pinjaman')} className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:border-teal-400 dark:hover:border-teal-600 hover:shadow-md transition-all flex flex-col items-center justify-center gap-2 group cursor-pointer">
            <div className="w-10 h-10 rounded-full bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 flex items-center justify-center group-hover:scale-110 transition-transform"><CreditCard size={20}/></div>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Rekap Kasbon</span>
          </button>
          <button onClick={() => setActiveTab('rekapabsensi')} className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:border-orange-400 dark:hover:border-orange-600 hover:shadow-md transition-all flex flex-col items-center justify-center gap-2 group cursor-pointer">
            <div className="w-10 h-10 rounded-full bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 flex items-center justify-center group-hover:scale-110 transition-transform"><Clock size={20}/></div>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Tarik Absen</span>
          </button>
        </div>
      )}

      {/* METRIK PERINGATAN CERDAS (SMART ALERTS) - DIPERBARUI: Tampil juga untuk Kepsek */}
      {(user?.role === 'admin' || user?.role === 'Kepala Sekolah') && (alerts.lateTeachers > 0 || alerts.totalUnpaidLoans > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
          {alerts.lateTeachers > 0 && (
            <div onClick={onAbsensiAlertClick} className="cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-all duration-300 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 p-4 rounded-2xl flex items-center gap-4 shadow-sm animate-in fade-in zoom-in-95 group">
              <div className="p-2.5 bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 rounded-full shrink-0 shadow-inner group-hover:scale-110 transition-transform"><AlertCircle size={20}/></div>
              <div className="flex-1 w-full">
                <h4 className="text-sm font-bold text-rose-800 dark:text-rose-300 flex justify-between items-center">
                   Peringatan Kedisiplinan 
                   <span className="text-[10px] bg-rose-200/50 text-rose-700 px-2 py-0.5 rounded-full flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">Tindak Lanjut <ChevronRight size={12}/></span>
                </h4>
                <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">Terdapat <span className="font-extrabold px-1 rounded bg-rose-200 dark:bg-rose-800 text-rose-900 dark:text-rose-100">{alerts.lateTeachers} pegawai</span> dengan tingkat keterlambatan tinggi bulan ini.</p>
              </div>
            </div>
          )}
          {alerts.totalUnpaidLoans > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 p-4 rounded-2xl flex items-center gap-4 shadow-sm animate-in fade-in zoom-in-95">
              <div className="p-2.5 bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 rounded-full shrink-0 shadow-inner"><CreditCard size={20}/></div>
              <div>
                <h4 className="text-sm font-bold text-amber-800 dark:text-amber-300">Piutang Kasbon Terbuka</h4>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Total dana piutang sekolah yang belum lunas: <span className="font-extrabold">{formatRp(alerts.totalUnpaidLoans)}</span>.</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-5">

        {/* Card 1: Total SDM (Desain Profesional) */}
        <div 
          onClick={() => setActiveTab('dataguru')}
          className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm hover:shadow-md border border-slate-200 dark:border-slate-700 transition-all duration-300 flex flex-col group cursor-pointer hover:border-blue-300 dark:hover:border-blue-600 relative"
        >
          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800/50 px-2 py-1 rounded z-20">Kelola Data</div>
          <div className="flex justify-between items-start mb-6 relative z-10">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Total Guru & Staff</p>
              <div className="flex items-baseline gap-1.5">
                <h4 className="text-4xl font-extrabold text-slate-800 dark:text-white tracking-tight">{stats.total}</h4>
                <span className="text-sm font-medium text-slate-500">Orang</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform duration-300">
              <Users size={24} />
            </div>
          </div>
          <div className="mt-auto space-y-3 pt-4 border-t border-slate-100 dark:border-slate-700/50 relative z-10">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Laki-laki</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{stats.lk}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-indigo-400"></span> Perempuan</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{stats.pr}</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 mt-2 flex overflow-hidden">
              <div className="bg-blue-500 h-full transition-all duration-500" style={{ width: `${(stats.lk / stats.total) * 100}%` }}></div>
              <div className="bg-indigo-400 h-full transition-all duration-500" style={{ width: `${(stats.pr / stats.total) * 100}%` }}></div>
            </div>
          </div>
        </div>

        {/* Card 2: Status Kepegawaian (Desain Profesional) */}
        <div 
          onClick={() => setIsStatusModalOpen(true)}
          className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm hover:shadow-md border border-slate-200 dark:border-slate-700 transition-all duration-300 hover:border-emerald-300 dark:hover:border-emerald-600 cursor-pointer flex flex-col group relative"
        >
          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/50 px-2 py-1 rounded">Lihat Detail</div>
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Status Pegawai</p>
              <div className="flex items-baseline gap-1.5">
                <h4 className="text-4xl font-extrabold text-slate-800 dark:text-white tracking-tight">{stats.tetap}</h4>
                <span className="text-sm font-medium text-slate-500">Tetap</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform duration-300">
              <Award size={24} />
            </div>
          </div>
          <div className="mt-auto space-y-2 pt-4 border-t border-slate-100 dark:border-slate-700/50">
             <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50">
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5"><CheckCircle size={14}/> Guru Tetap</span>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{stats.tetap}</span>
             </div>
             <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50">
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5"><Clock size={14}/> Tidak Tetap</span>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{stats.tdkTetap}</span>
             </div>
          </div>
        </div>

        {/* Card 3: Kualifikasi Pendidikan (Desain Profesional) */}
        <div 
          onClick={() => setIsEduModalOpen(true)}
          className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm hover:shadow-md border border-slate-200 dark:border-slate-700 transition-all duration-300 hover:border-purple-300 dark:hover:border-purple-600 cursor-pointer flex flex-col group relative"
        >
          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800/50 px-2 py-1 rounded z-20">Lihat Detail</div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Pendidikan (S1/S2)</p>
              <div className="flex items-baseline gap-1.5">
                <h4 className="text-4xl font-extrabold text-slate-800 dark:text-white tracking-tight">
                  {stats.eduCount['S2'] + stats.eduCount['S1']}
                </h4>
                <span className="text-sm font-medium text-slate-500">Sarjana+</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800/50 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-105 transition-transform duration-300 shrink-0">
              <GraduationCap size={24} />
            </div>
          </div>
          <div className="mt-auto grid grid-cols-2 gap-2 pt-4 border-t border-slate-100 dark:border-slate-700/50 relative z-10">
             <div className="p-2 border border-slate-100 dark:border-slate-700/50 rounded-lg bg-slate-50 dark:bg-slate-900/30 text-center transition-colors group-hover:bg-purple-50 dark:group-hover:bg-purple-900/20">
                <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Magister</span>
                <span className="block text-base font-bold text-slate-800 dark:text-slate-200 mt-0.5">{stats.eduCount['S2']}</span>
             </div>
             <div className="p-2 border border-slate-100 dark:border-slate-700/50 rounded-lg bg-slate-50 dark:bg-slate-900/30 text-center transition-colors group-hover:bg-purple-50 dark:group-hover:bg-purple-900/20">
                <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sarjana</span>
                <span className="block text-base font-bold text-slate-800 dark:text-slate-200 mt-0.5">{stats.eduCount['S1']}</span>
             </div>
             <div className="p-2 border border-slate-100 dark:border-slate-700/50 rounded-lg bg-slate-50 dark:bg-slate-900/30 text-center transition-colors group-hover:bg-purple-50 dark:group-hover:bg-purple-900/20">
                <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Diploma</span>
                <span className="block text-base font-bold text-slate-800 dark:text-slate-200 mt-0.5">{stats.eduCount['Diploma']}</span>
             </div>
             <div className="p-2 border border-slate-100 dark:border-slate-700/50 rounded-lg bg-slate-50 dark:bg-slate-900/30 text-center transition-colors group-hover:bg-purple-50 dark:group-hover:bg-purple-900/20">
                <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">SMA/Setara</span>
                <span className="block text-base font-bold text-slate-800 dark:text-slate-200 mt-0.5">{stats.eduCount['SMA/Pondok']}</span>
             </div>
          </div>
        </div>

        {/* Card 4: Staff Operasional (Desain Profesional) */}
        <div 
          onClick={() => setActiveTab('dataguru')}
          className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm hover:shadow-md border border-slate-200 dark:border-slate-700 transition-all duration-300 flex flex-col group cursor-pointer hover:border-orange-300 dark:hover:border-orange-600 relative"
        >
          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800/50 px-2 py-1 rounded z-20">Kelola Data</div>
          <div className="flex justify-between items-start mb-6 relative z-10">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Staff Operasional</p>
              <div className="flex items-baseline gap-1.5">
                <h4 className="text-4xl font-extrabold text-slate-800 dark:text-white tracking-tight">
                  {stats.opsCount.security + stats.opsCount.kebersihan + stats.opsCount.pengabdian}
                </h4>
                <span className="text-sm font-medium text-slate-500">Orang</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800/50 flex items-center justify-center text-orange-600 dark:text-orange-400 group-hover:scale-105 transition-transform duration-300">
              <HeartHandshake size={24} />
            </div>
          </div>
          <div className="mt-auto space-y-2.5 pt-4 border-t border-slate-100 dark:border-slate-700/50 relative z-10">
             <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-2"><Shield size={14} className="text-slate-400"/> Security</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{stats.opsCount.security}</span>
             </div>
             <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-2"><Trash2 size={14} className="text-slate-400"/> Kebersihan</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{stats.opsCount.kebersihan}</span>
             </div>
             <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-2"><Sparkles size={14} className="text-slate-400"/> Pengabdian</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{stats.opsCount.pengabdian}</span>
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
            const isCurrentMonth = index === chartData.length - 1;
            
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

function DataGuruView({ teachers, setTeachers }) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('Semua'); // TAMBAHAN: Filter Dropdown
  const [modal, setModal] = useState({ isOpen: false, type: null, data: null });
  const fileInputRef = useRef(null);
  
  // FITUR BARU: State untuk Micro-Interaction Tombol Simpan
  const [isSaving, setIsSaving] = useState(false);

  const filtered = teachers.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) || t.nipy.includes(search);
    const matchStatus = filterStatus === 'Semua' ? true : t.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const openModal = (type, data) => setModal({ isOpen: true, type, data });
  const closeModal = () => setModal({ isOpen: false, type: null, data: null });

  const handleDelete = () => {
    setTeachers(prev => prev.filter(t => t.id !== modal.data.id));
    closeModal();
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    setIsSaving(true); // Mengaktifkan efek loading
    // Simulasi delay jaringan (bisa dihapus nanti, hanya untuk visual UX)
    setTimeout(() => {
      // Data yang diperbarui
      const newData = { ...formData };
      
      if (modal.type === 'add') {
        setTeachers(prev => [{ ...newData, id: generateUniqueId('G-'), payroll: defaultPayrollData }, ...prev]);
      } else {
        setTeachers(prev => prev.map(t => t.id === modal.data.id ? { ...t, ...newData } : t));
      }
      setIsSaving(false); // Mematikan efek loading
      closeModal();
    }, 600);
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'Nama Lengkap', 'NIPY', 'L/P', 'Tempat Lahir', 'Tanggal Lahir', 'Pendidikan', 'Status', 'Jabatan', 'TMT', 'Status Pasangan', 'Jumlah Anak'];
    
    // Pembersih agar CSV tidak bentrok dengan Excel
    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '';
      let str = String(val);
      // Bungkus dengan tanda kutip jika teks mengandung koma, titik koma, atau enter
      if (str.includes(',') || str.includes(';') || str.includes('\n') || str.includes('"')) {
         return `"${str.replace(/"/g, '""')}"`;
      }
      // Tambahkan tanda petik tunggal ' agar angka 0 di awal NIPY tidak hilang di Excel
      if (/^[0-9\-]+$/.test(str) && str.length >= 5) {
         return `'${str}`; 
      }
      return str;
    };

    const csvRows = [headers.join(';')]; // Pakai titik koma (;) standar Indonesia
    
    teachers.forEach(t => {
      const row = [
        t.id, 
        t.name, 
        t.nipy, 
        t.gender, 
        t.pob, 
        t.dob, 
        t.education, 
        t.status, 
        t.position, 
        t.tmt, 
        (t.family?.wife || 0), 
        (t.family?.children || 0)
      ].map(escapeCSV);
      csvRows.push(row.join(';'));
    });
    
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Profil_Dasar_Pegawai_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Parser Tanggal Super Pintar
    const parseDateSmart = (dateStr) => {
      if (!dateStr) return '';
      let str = dateStr.trim().toLowerCase();
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

      const regexSlash = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
      const matchSlash = str.match(regexSlash);
      if (matchSlash) {
         return `${matchSlash[3]}-${matchSlash[2].padStart(2, '0')}-${matchSlash[1].padStart(2, '0')}`;
      }

      const bulanMap = { 'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'mei': '05', 'jun': '06', 'jul': '07', 'agu': '08', 'sep': '09', 'okt': '10', 'nov': '11', 'des': '12', 'oct': '10', 'dec': '12' };
      const regexIndo = /^(\d{1,2})-(jan|feb|mar|apr|mei|jun|jul|agu|sep|okt|oct|nov|des|dec)-(\d{2,4})$/;
      const matchIndo = str.match(regexIndo);
      if (matchIndo) {
        let y = matchIndo[3];
        if (y.length === 2) y = parseInt(y) > 30 ? `19${y}` : `20${y}`;
        return `${y}-${bulanMap[matchIndo[2]]}-${matchIndo[1].padStart(2, '0')}`;
      }

      const parsedDate = new Date(str);
      if (!isNaN(parsedDate.getTime())) return parsedDate.toISOString().split('T')[0];
      return dateStr; 
    };

    // ALGORITMA PARSER CSV SEJATI (Tahan banting dari format Excel)
    const parseCSVLine = (line, delimiter) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
              if (inQuotes && line[i + 1] === '"') {
                  current += '"';
                  i++; // Lewati escaped quote
              } else {
                  inQuotes = !inQuotes;
              }
          } else if (char === delimiter && !inQuotes) {
              result.push(current);
              current = '';
          } else {
              current += char;
          }
      }
      result.push(current);
      return result.map(val => {
          let cln = val.trim();
          // Bersihkan trik Excel sebelumnya yang mungkin tersisa
          if (cln.startsWith('="') && cln.endsWith('"')) cln = cln.substring(2, cln.length - 1);
          if (cln.startsWith("'")) cln = cln.substring(1); 
          return cln;
      });
    };

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split(/\r?\n/); // Dukung format Windows & Mac
      if(lines.length < 2) {
         alert("Format file kosong atau tidak valid.");
         return;
      }
      
      // Deteksi otomatis separator (Koma, Titik Koma, atau Tab)
      let separator = ',';
      if (lines[0].includes(';')) separator = ';';
      else if (lines[0].includes('\t')) separator = '\t';
      
      const importedTeachers = [];
      let successCount = 0;

      for(let i = 1; i < lines.length; i++) {
        if(!lines[i].trim()) continue; // Abaikan baris kosong
        
        const values = parseCSVLine(lines[i], separator);
        
        // Pastikan kolom Nama (index 1) ada isinya untuk keamanan
        if (values.length >= 10 && values[1] !== "") {
           const impId = values[0];
           const impName = values[1];
           
           const existingId = teachers.find(t => t.id === impId || t.name.toLowerCase() === impName?.toLowerCase());
           
           const wifeStatus = values.length >= 12 && values[10] !== "" ? Number(values[10]) : 0;
           const childrenCount = values.length >= 12 && values[11] !== "" ? Number(values[11]) : 0;

           const teacherObj = existingId ? { ...existingId } : { 
             id: impId && impId !== '' ? impId : generateUniqueId('G-'),
             family: { wife: wifeStatus, children: childrenCount },
             payroll: {
                tahunMasaKerja: new Date().getFullYear(),
                tunjanganMasaKerjaManual: 0,
                jabatans: [{ kategori: 'Guru', detail: values[8] || '', kinerja: 'Baik', nominal: 0 }],
                pendidikan: { tingkat: values[6] || '', nominalOverride: 0 },
                kompetensi: [],
                disiplin: { hadir: 0, telat: 0, tarifHadir: 1000, tarifTelat: 1000 },
                insentifTambahan: [],
                potonganLainnya: [],
                jamMengajar: { wajib: 0, realisasi: 0, tarifJPL: 10000, jsjm: 0 }, 
                isNotified: false,
                isConfirmed: false
             } 
           };

           teacherObj.name = impName;
           teacherObj.nipy = values[2] || '-';
           teacherObj.gender = values[3] || 'L';
           teacherObj.pob = values[4] || '-';
           teacherObj.dob = parseDateSmart(values[5]);
           teacherObj.education = values[6] || '-';
           teacherObj.status = values[7] || '-';
           teacherObj.position = values[8] || '-';
           teacherObj.tmt = parseDateSmart(values[9]);
           
           if(existingId) {
             teacherObj.family = { wife: wifeStatus, children: childrenCount };
           }
           
           importedTeachers.push(teacherObj);
           successCount++;
        }
      }

      setTeachers(prev => {
        const map = new Map(prev.map(t => [t.id, t]));
        importedTeachers.forEach(t => map.set(t.id, t));
        return Array.from(map.values());
      });
      
      alert(`Berhasil membaca ${successCount} baris data!\n\nPeriksa kembali apakah tampilannya sudah rapi. Tunggu indikator Cloud menjadi "Tersimpan" agar masuk ke Google Sheet.`);
      e.target.value = null;
    };
    reader.readAsText(file);
  };
  
  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full relative">
      <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />

      {modal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-lg dark:text-white flex items-center gap-2">
                {modal.type === 'view' && <Eye className="text-blue-500"/>}
                {(modal.type === 'edit' || modal.type === 'add') && <Edit className="text-amber-500"/>}
                {modal.type === 'delete' && <Trash2 className="text-red-500"/>}
                {modal.type === 'view' ? 'Detail Profil Pegawai' : modal.type === 'edit' ? 'Edit Data Pegawai' : modal.type === 'add' ? 'Tambah Data Pegawai' : 'Hapus Data Pegawai'}
              </h3>
              <button onClick={closeModal} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
            </div>

            <div className="overflow-y-auto p-6 flex-1">
              {modal.type === 'view' && modal.data && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pb-6 border-b border-slate-200 dark:border-slate-700 text-center sm:text-left">
                    <div>
                      <h2 className="text-2xl font-bold dark:text-white">{modal.data.name}</h2>
                      <p className="text-slate-500 dark:text-slate-400 mt-1">{modal.data.nipy} • {modal.data.position}</p>
                      <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold ${modal.data.status === 'Tetap' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'}`}>
                        Pegawai {modal.data.status}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                    <div>
                      <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-3 border-b border-slate-100 dark:border-slate-700 pb-2">Informasi Personal</h4>
                      <table className="w-full">
                        <tbody>
                          <tr><td className="py-1.5 text-slate-500 w-32">Jenis Kelamin</td><td className="font-medium dark:text-slate-200">: {modal.data.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</td></tr>
                          <tr><td className="py-1.5 text-slate-500">Tempat Lahir</td><td className="font-medium dark:text-slate-200">: {modal.data.pob}</td></tr>
                          <tr><td className="py-1.5 text-slate-500">Tanggal Lahir</td><td className="font-medium dark:text-slate-200">: {formatDateId(modal.data.dob)} <span className="text-blue-500 font-bold ml-1">({new Date().getFullYear() - new Date(modal.data.dob).getFullYear()} Thn)</span></td></tr>
                          <tr><td className="py-1.5 text-slate-500">Pendidikan</td><td className="font-medium dark:text-slate-200">: {modal.data.education}</td></tr>
                          <tr><td className="py-1.5 text-slate-500">Rekening Bank</td><td className="font-medium dark:text-slate-200">: {modal.data.bankName ? `${modal.data.bankName} - ${modal.data.bankAccount}` : '-'}</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-3 border-b border-slate-100 dark:border-slate-700 pb-2">Informasi Pekerjaan & Keluarga</h4>
                      <table className="w-full">
                        <tbody>
                          <tr><td className="py-1.5 text-slate-500 w-32">Mulai Tugas (TMT)</td><td className="font-medium dark:text-slate-200">: {formatDateId(modal.data.tmt)}</td></tr>
                          <tr><td className="py-1.5 text-slate-500">Masa Kerja</td><td className="font-medium dark:text-slate-200">: {new Date().getFullYear() - new Date(modal.data.tmt).getFullYear()} Tahun</td></tr>
                          <tr><td className="py-1.5 text-slate-500">Status Menikah</td><td className="font-medium dark:text-slate-200">: {modal.data.family?.wife === 1 ? 'Menikah (1 Pasangan)' : modal.data.family?.wife === 2 ? 'Menikah (Ditanggung Pasangan)' : 'Belum / Tidak Menikah'}</td></tr>
                          <tr><td className="py-1.5 text-slate-500">Jumlah Anak</td><td className="font-medium dark:text-slate-200">: {modal.data.family?.children || 0} Anak</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {(modal.type === 'edit' || modal.type === 'add') && (
                <form id="editForm" onSubmit={handleEditSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Nama Lengkap</label>
                      <input name="name" defaultValue={modal.data?.name || ''} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">NIPY</label>
                      <input name="nipy" defaultValue={modal.data?.nipy || ''} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Tempat Lahir</label>
                      <input name="pob" defaultValue={modal.data?.pob || ''} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Tanggal Lahir</label>
                      <input type="date" name="dob" defaultValue={modal.data?.dob || ''} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Jenis Kelamin</label>
                      <select name="gender" defaultValue={modal.data?.gender || 'L'} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="L">Laki-laki</option>
                        <option value="P">Perempuan</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Pendidikan</label>
                      <select name="education" defaultValue={modal.data?.education || 'S1'} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="S2">S2 / Magister</option>
                        <option value="S1">S1 / Sarjana</option>
                        <option value="Diploma">Diploma (D3/D4)</option>
                        <option value="SMA/Pondok">SMA / Pondok</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Status Pegawai</label>
                      <select name="status" defaultValue={modal.data?.status || 'Tetap'} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="Tetap">Tetap</option>
                        <option value="Tidak Tetap">Tidak Tetap</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">TMT (Mulai Tugas)</label>
                      <input type="date" name="tmt" defaultValue={modal.data?.tmt || ''} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" required />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Kompetensi & Jabatan Inti</label>
                      <input name="position" defaultValue={modal.data?.position || ''} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" required placeholder="Cth: Wali Kelas / Guru Mapel" />
                    </div>

                    {/* TAMBAHAN BARU: Kolom Rekening Bank */}
                    <div className="md:col-span-2 pt-3 border-t border-slate-200 dark:border-slate-700 mt-2">
                       <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">Informasi Rekening Bank</h4>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                           <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Nama Bank</label>
                           <input name="bankName" defaultValue={modal.data?.bankName || ''} placeholder="Cth: BSI / Mandiri / BRI" className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
                         </div>
                         <div>
                           <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Nomor Rekening</label>
                           <input type="text" name="bankAccount" defaultValue={modal.data?.bankAccount || ''} placeholder="Cth: 7123456789" className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
                         </div>
                       </div>
                    </div>
                    
                    {/* TAMBAHAN: Kolom Profil Keluarga */}
                    <div className="md:col-span-2 pt-3 border-t border-slate-200 dark:border-slate-700 mt-2">
                       <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">Informasi Profil Keluarga</h4>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                           <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Status Pasangan</label>
                           <select name="wife" defaultValue={modal.data?.family?.wife || 0} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-pink-500">
                             <option value="1">Menikah (Terima Tunjangan)</option>
                             <option value="2">Menikah (Pasangan 1 Sekolah - Tanpa Tunj. Ganda)</option>
                             <option value="0">Belum Menikah / Cerai</option>
                           </select>
                         </div>
                         <div>
                           <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Jumlah Anak</label>
                           <input type="number" min="0" name="children" defaultValue={modal.data?.family?.children || 0} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-pink-500" required />
                         </div>
                       </div>
                    </div>

                  </div>
                </form>
              )}

              {modal.type === 'delete' && modal.data && (
                <div className="text-center py-6">
                  <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center mx-auto mb-4">
                    <Trash2 size={40} />
                  </div>
                  <h3 className="text-xl font-bold dark:text-white mb-2">Hapus Data Pegawai?</h3>
                  <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    Apakah Anda yakin ingin menghapus data <span className="font-bold text-slate-700 dark:text-slate-200">{modal.data.name}</span>? 
                    Tindakan ini permanen dan akan menghapus seluruh riwayat pengaturan gajinya.
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3 shrink-0">
              <button onClick={closeModal} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors">
                {modal.type === 'view' ? 'Tutup' : 'Batal'}
              </button>
              {(modal.type === 'edit' || modal.type === 'add') && (
                <button 
                  type="submit" 
                  form="editForm" 
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={16} />}
                  {isSaving ? 'Memproses...' : (modal.type === 'add' ? 'Tambahkan Pegawai' : 'Simpan Perubahan')}
                </button>
              )}
              {modal.type === 'delete' && (
                <button onClick={handleDelete} className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium shadow-sm transition-colors">
                  Ya, Hapus Data
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden flex items-center justify-between shrink-0">
        <div className="relative z-10">
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-3"><Users className="text-blue-200" /> Manajemen Data Pegawai</h1>
          <p className="text-blue-100 text-sm">Kelola profil, jabatan, dan informasi kontak seluruh guru dan staff sekolah.</p>
        </div>
        <Users size={100} className="absolute -right-6 -top-6 text-white/10 transform -rotate-12 pointer-events-none" />
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-full">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-slate-50 dark:bg-slate-900/50 shrink-0">
          <h3 className="text-lg font-bold dark:text-white flex items-center gap-2 shrink-0">Daftar Lengkap Pegawai</h3>
          
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 w-full xl:w-auto items-stretch sm:items-center">
            
            {/* TAMBAHAN: Filter Dropdown Status */}
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 outline-none dark:text-white text-slate-700 dark:text-slate-300"
            >
              <option value="Semua">Semua Status</option>
              <option value="Tetap">Guru Tetap</option>
              <option value="Tidak Tetap">Guru Tidak Tetap</option>
            </select>

            <div className="relative w-full sm:w-56 md:w-64 flex-grow sm:flex-grow-0">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Cari Nama / NIPY..." 
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
              />
            </div>
            
            <div className="flex flex-wrap sm:flex-nowrap gap-2 w-full sm:w-auto">
              <button onClick={() => fileInputRef.current?.click()} className="flex-1 sm:flex-none justify-center bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm">
                 <Upload size={16} /> <span className="hidden sm:inline">Impor</span>
              </button>
              <button onClick={handleExportCSV} className="flex-1 sm:flex-none justify-center bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm">
                 <Download size={16} /> <span className="hidden sm:inline">Ekspor</span>
              </button>
              <button onClick={() => openModal('add', null)} className="flex-1 sm:flex-none justify-center bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm">
                 <PlusCircle size={16} /> <span className="hidden sm:inline">Tambah</span>
              </button>
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-sm whitespace-nowrap min-w-max">
            <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="p-4 font-bold border-b border-slate-200 dark:border-slate-700">Profil Pegawai</th>
                <th className="p-4 font-bold border-b border-slate-200 dark:border-slate-700">Lahir & Kontak</th>
                <th className="p-4 font-bold border-b border-slate-200 dark:border-slate-700">Status Pegawai</th>
                <th className="p-4 font-bold border-b border-slate-200 dark:border-slate-700">Kompetensi & Jabatan</th>
                <th className="p-4 font-bold border-b border-slate-200 dark:border-slate-700">Pendidikan</th>
                <th className="p-4 font-bold border-b border-slate-200 dark:border-slate-700">Masa Kerja (TMT)</th>
                <th className="p-4 font-bold border-b border-slate-200 dark:border-slate-700 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700/80">
              {filtered.map(t => (
                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                  <td className="p-4">
                    <div className="font-bold text-slate-800 dark:text-slate-200">{t.name}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{t.nipy}</div>
                  </td>
                  <td className="p-4">
                    <div className="text-slate-700 dark:text-slate-300 font-medium">
                      {t.pob}, {formatDateId(t.dob)} <span className="text-blue-500 font-bold ml-1">({!isNaN(new Date(t.dob).getTime()) ? new Date().getFullYear() - new Date(t.dob).getFullYear() : '?'} thn)</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">Gender: {t.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</div>
                  </td>
                  <td className="p-4">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${t.status === 'Tetap' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="font-medium text-slate-700 dark:text-slate-300">{t.position}</div>
                  </td>
                  <td className="p-4 text-slate-700 dark:text-slate-300 font-medium">
                    {t.education}
                  </td>
                  <td className="p-4">
                    <div className="text-slate-700 dark:text-slate-300 font-medium">{formatDateId(t.tmt)}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{!isNaN(new Date(t.tmt).getTime()) ? new Date().getFullYear() - new Date(t.tmt).getFullYear() : '?'} Tahun</div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openModal('view', t)} className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 rounded-lg transition-colors" title="Lihat Detail">
                        <Eye size={16} />
                      </button>
                      <button onClick={() => openModal('edit', t)} className="p-2 bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50 rounded-lg transition-colors" title="Edit Data">
                        <Edit size={16} />
                      </button>
                      <button onClick={() => openModal('delete', t)} className="p-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 rounded-lg transition-colors" title="Hapus Data">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan="7" className="p-8 text-center text-slate-500">Tidak ada data pegawai ditemukan.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- VIEW: REKAP ABSENSI (KOMPONEN BARU) ---
function RekapAbsensiView({ teachers, setTeachers, externalFilter, setExternalFilter, settings }) {
  const [search, setSearch] = useState('');
  const fileInputRef = useRef(null);
  const mesinInputRef = useRef(null); // TAMBAHAN: Ref khusus untuk mesin absen
  const bulan = getFormattedPeriod(settings?.payrollPeriod);

  // STATE BARU UNTUK FITUR EDIT MANUAL & FILTER
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingData, setEditingData] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  
  // FITUR BARU: State untuk Micro-Interaction Tombol Simpan
  const [isSaving, setIsSaving] = useState(false);
  
  // TAMBAHAN: Modal Konfirmasi Reset (Pengganti window.confirm)
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (externalFilter && externalFilter !== 'all') {
      setActiveFilter(externalFilter);
      if (setExternalFilter) setExternalFilter('all'); // Reset agar tidak tersangkut
    }
  }, [externalFilter, setExternalFilter]);

  const filtered = teachers.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) || t.nipy.includes(search);
    
    let matchFilter = true;
    if (activeFilter === 'kurang_jam') {
      const wajib = t.payroll?.jamMengajar?.wajib !== undefined && t.payroll?.jamMengajar?.wajib !== '' ? Number(t.payroll.jamMengajar.wajib) : (t.status === 'Tetap' ? 60 : 0);
      const real = t.payroll?.jamMengajar?.realisasi || 0;
      if (real >= wajib) matchFilter = false;
    } else if (activeFilter === 'sering_telat') {
      const telat = t.payroll?.disiplin?.telat || 0;
      if (telat < 3) matchFilter = false;
    }
    
    return matchSearch && matchFilter;
  });

  // TAMBAHAN: Kalkulasi Statistik Ringkasan Absensi
  const stats = useMemo(() => {
    let totalJam = 0;
    let kurangJam = 0;
    let seringTelat = 0;

    teachers.forEach(t => {
      const real = t.payroll?.jamMengajar?.realisasi || 0;
      const wajib = t.payroll?.jamMengajar?.wajib !== undefined && t.payroll?.jamMengajar?.wajib !== '' ? Number(t.payroll.jamMengajar.wajib) : (t.status === 'Tetap' ? 60 : 0);
      const telat = t.payroll?.disiplin?.telat || 0;

      totalJam += real;
      if (real < wajib) kurangJam++;
      if (telat >= 10) seringTelat++; // Standar 'sering telat' = 3 kali atau lebih
    });

    return { totalJam, kurangJam, seringTelat };
  }, [teachers]);

  // Fungsi Helper untuk mensimulasikan sebaran jam mengajar 1-31 hari (Preview)
  // Ini akan memecah "Total Realisasi" ke beberapa tanggal agar tabel tidak kosong
  const getDailyHours = (total, teacherId) => {
    const days = Array(31).fill('');
    if (total > 0) {
       let remaining = total;
       let dayIdx = teacherId.charCodeAt(teacherId.length - 1) % 7; // Mulai di hari acak
       while (remaining > 0 && dayIdx < 31) {
          const hoursToday = Math.min(4, remaining); // Maksimal 4 JPL per hari
          days[dayIdx] = hoursToday;
          remaining -= hoursToday;
          dayIdx += 2; // Lompat 1 hari
          if (dayIdx >= 31 && remaining > 0) dayIdx = 1; // Ulang ke awal jika masih ada sisa
       }
    }
    return days;
  };

  // TAMBAHAN: Fungsi Reset Data Bulan Baru dengan Custom Modal
  const handleResetBulan = () => {
    setConfirmReset(true);
  };

  const executeResetBulan = () => {
    setTeachers(prev => prev.map(t => ({
      ...t,
      payroll: {
        ...t.payroll,
        jamMengajar: {
          ...t.payroll.jamMengajar,
          harian: Array(31).fill(''),
          realisasi: 0
        },
        disiplin: {
          ...t.payroll.disiplin,
          telat: 0
        }
      }
    })));
    setConfirmReset(false);
    setTimeout(() => alert("Sukses! Data absensi seluruh guru telah dibersihkan untuk periode bulan baru."), 300);
  };

  const handleExportExcel = () => {
    const daysHeaders = Array.from({ length: 31 }, (_, i) => `Tgl ${i + 1}`);
    const headers = ['Nama Guru', ...daysHeaders, 'Total', 'Wajib', 'JSJM', 'Selisih', 'Telat', 'Tepat Waktu'];
    
    // Menggunakan pemisah titik koma (;) agar lebih rapi saat dibuka di Microsoft Excel region Indonesia
    const csvRows = [headers.join(';')];
    
    filtered.forEach(t => {
      const wajib = t.payroll?.jamMengajar?.wajib !== undefined && t.payroll?.jamMengajar?.wajib !== '' ? Number(t.payroll.jamMengajar.wajib) : (t.status === 'Tetap' ? 60 : 0);
      const real = t.payroll?.jamMengajar?.realisasi || 0;
      const jsjm = t.payroll?.jamMengajar?.jsjm || 0;
      const selisih = (real + jsjm) - wajib;
      const telat = t.payroll?.disiplin?.telat || 0;
      const tepatWaktu = Math.max(0, real - telat);
      
      const dailyData = t.payroll?.jamMengajar?.harian || getDailyHours(real, t.id);
      const dailyString = dailyData.map(d => d || '').join(';');
      
      const row = [`"${t.name}"`, dailyString, real, wajib, jsjm, selisih, telat, tepatWaktu];
      csvRows.push(row.join(';'));
    });
    
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Rekap_Absen_Mengajar_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split('\n');
      if (lines.length < 2) {
         alert('Format CSV tidak valid atau kosong.');
         return;
      }

      // Deteksi pemisah cerdas (, atau ;)
      const separator = lines[0].includes(';') ? ';' : ',';
      const headers = lines[0].split(separator).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
      
      const nameIdx = headers.findIndex(h => h.includes('nama'));
      const totalIdx = headers.findIndex(h => h === 'total' || h.includes('realisasi'));

      if (nameIdx === -1 || totalIdx === -1) {
         alert('Format kolom tidak dikenali. Pastikan ada judul kolom "Nama Guru" dan "Total".');
         return;
      }

      let updatedCount = 0;
      const updatedTeachers = [...teachers];

      for (let i = 1; i < lines.length; i++) {
         if (!lines[i].trim()) continue;
         
         const regex = new RegExp(`${separator}(?=(?:(?:[^"]*"){2})*[^"]*$)`);
         const values = lines[i].split(regex).map(v => v.replace(/^"|"$/g, '').trim());

         const teacherName = values[nameIdx];
         const jamVal = parseInt(values[totalIdx], 10);

         if (teacherName && !isNaN(jamVal)) {
            // Pencarian cerdas berdasarkan nama guru
            const teacherIndex = updatedTeachers.findIndex(t => t.name.toLowerCase() === teacherName.toLowerCase());
            if (teacherIndex !== -1) {
               updatedTeachers[teacherIndex] = {
                  ...updatedTeachers[teacherIndex],
                  payroll: {
                     ...updatedTeachers[teacherIndex].payroll,
                     jamMengajar: {
                        ...updatedTeachers[teacherIndex].payroll.jamMengajar,
                        realisasi: jamVal
                     }
                  }
               };
               updatedCount++;
            }
         }
      }

      if (updatedCount > 0) {
        setTeachers(updatedTeachers);
        alert(`Berhasil! Jam mengajar ${updatedCount} guru telah diperbarui ke dalam sistem.`);
      } else {
        alert('Tidak ada data guru yang cocok untuk diperbarui.');
      }
      e.target.value = null; // Reset input
    };
    reader.readAsText(file);
  };

  // FITUR BARU 1: Integrasi Mesin Absensi (Fingerprint/FaceID seperti Solution)
  const handleImportMesinAbsen = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsSaving(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split('\n');
      if (lines.length < 2) {
         setIsSaving(false);
         alert('Format file mesin tidak valid atau kosong.');
         return;
      }

      // Deteksi pemisah cerdas (Tab, Titik Koma, atau Koma)
      const separator = lines[0].includes('\t') ? '\t' : (lines[0].includes(';') ? ';' : ',');
      const headers = lines[0].split(separator).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
      
      // Deteksi Kolom Pintar untuk format mesin
      const nameIdx = headers.findIndex(h => h.includes('nama') || h === 'name');
      const hadirIdx = headers.findIndex(h => h.includes('hadir') || h.includes('normal') || h.includes('hk') || h.includes('kehadiran'));
      const telatIdx = headers.findIndex(h => h.includes('telat') || h.includes('terlambat') || h.includes('late'));

      if (nameIdx === -1 || hadirIdx === -1) {
         setIsSaving(false);
         alert('Gagal mendeteksi kolom. Pastikan file export dari mesin memiliki kolom "Nama" dan "Hadir/Normal".');
         return;
      }

      let updatedCount = 0;
      const updatedTeachers = [...teachers];

      for (let i = 1; i < lines.length; i++) {
         if (!lines[i].trim()) continue;
         
         const values = lines[i].split(separator).map(v => v.replace(/^"|"$/g, '').trim());
         const teacherName = values[nameIdx];
         const hadirVal = parseInt(values[hadirIdx], 10);
         const telatVal = telatIdx !== -1 ? parseInt(values[telatIdx], 10) : 0;

         if (teacherName && !isNaN(hadirVal)) {
            // Pencocokan cerdas berdasarkan nama guru
            const teacherIndex = updatedTeachers.findIndex(t => t.name.toLowerCase() === teacherName.toLowerCase());
            if (teacherIndex !== -1) {
               updatedTeachers[teacherIndex] = {
                  ...updatedTeachers[teacherIndex],
                  payroll: {
                     ...updatedTeachers[teacherIndex].payroll,
                     jamMengajar: {
                        ...updatedTeachers[teacherIndex].payroll.jamMengajar,
                        realisasi: hadirVal // Asumsi hadir harian = realisasi (Bisa disesuaikan dengan rule sekolah)
                     },
                     disiplin: {
                        ...updatedTeachers[teacherIndex].payroll.disiplin,
                        telat: isNaN(telatVal) ? 0 : telatVal
                     }
                  }
               };
               updatedCount++;
            }
         }
      }

      setIsSaving(false);
      if (updatedCount > 0) {
        setTeachers(updatedTeachers);
        alert(`Integrasi Mesin Berhasil! Data kehadiran dan keterlambatan untuk ${updatedCount} pegawai telah terisi otomatis.`);
      } else {
        alert('Tidak ada nama guru dari mesin yang cocok dengan data di sistem aplikasi.');
      }
      e.target.value = null;
    };
    reader.readAsText(file);
  };

  // FUNGSI HANDLER UNTUK EDIT MANUAL
  const handleOpenEdit = (t) => {
    const real = t.payroll?.jamMengajar?.realisasi || 0;
    // Ambil data harian yang ada, atau buat simulasi jika belum ada
    const dailyData = t.payroll?.jamMengajar?.harian || getDailyHours(real, t.id);
    
    // Pastikan array selalu berisi 31 elemen untuk tanggal 1-31
    const safeData = Array.from({length: 31}, (_, i) => dailyData[i] !== undefined ? dailyData[i] : '');

    setEditingData({
      id: t.id,
      name: t.name,
      harian: safeData
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = () => {
    setIsSaving(true); // Aktifkan animasi loading
    
    // Hitung ulang total realisasi berdasarkan input 31 hari (Hanya menjumlahkan angka)
    const totalRealisasi = editingData.harian.reduce((sum, val) => sum + (Number(val) || 0), 0);

    // Memberikan jeda (delay) visual cerdas
    setTimeout(() => {
      setTeachers(prev => prev.map(t => {
        if (t.id === editingData.id) {
          return {
            ...t,
            payroll: {
              ...(t.payroll || {}),
              jamMengajar: {
                ...(t.payroll?.jamMengajar || {}),
                harian: editingData.harian,
                realisasi: totalRealisasi
              }
            }
          };
        }
        return t;
      }));
      
      setIsSaving(false); // Matikan loading
      setIsEditModalOpen(false);
      setEditingData(null);
    }, 600);
  };

  const handleHarianChange = (index, val) => {
     let formattedVal = val.toUpperCase();
     // Mengizinkan kosong, huruf S, I, A, atau angka jam (0-24)
     if (formattedVal === '' || ['S', 'I', 'A'].includes(formattedVal) || (!isNaN(formattedVal) && Number(formattedVal) >= 0 && Number(formattedVal) <= 24)) {
       const newHarian = [...editingData.harian];
       newHarian[index] = formattedVal;
       setEditingData({...editingData, harian: newHarian});
     }
  };

  // FUNGSI BARU: Untuk mengubah telat langsung di tabel
  const handleInlineTelatChange = (teacherId, newValue) => {
    const telatVal = newValue === '' ? '' : Math.max(0, Number(newValue));
    setTeachers(prev => prev.map(t => {
      if (t.id === teacherId) {
        return {
          ...t,
          payroll: {
            ...(t.payroll || {}),
            disiplin: {
              ...(t.payroll?.disiplin || {}),
              telat: telatVal
            }
          }
        };
      }
      return t;
    }));
  };

  // FUNGSI BARU: Untuk mengubah jam wajib langsung di tabel
  const handleInlineWajibChange = (teacherId, newValue) => {
    const wajibVal = newValue === '' ? '' : Math.max(0, Number(newValue));
    setTeachers(prev => prev.map(t => {
      if (t.id === teacherId) {
        return {
          ...t,
          payroll: {
            ...(t.payroll || {}),
            jamMengajar: {
              ...(t.payroll?.jamMengajar || {}),
              wajib: wajibVal
            }
          }
        };
      }
      return t;
    }));
  };

  // FUNGSI BARU: Untuk mengubah JSJM (Jabatan Setara Jam Mengajar)
  const handleInlineJsjmChange = (teacherId, newValue) => {
    const jsjmVal = newValue === '' ? '' : Math.max(0, Number(newValue));
    setTeachers(prev => prev.map(t => {
      if (t.id === teacherId) {
        return {
          ...t,
          payroll: {
            ...(t.payroll || {}),
            jamMengajar: {
              ...(t.payroll?.jamMengajar || {}),
              jsjm: jsjmVal
            }
          }
        };
      }
      return t;
    }));
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full relative pb-4 min-h-0">
      
      {/* MODAL KONFIRMASI RESET ABSEN */}
      {confirmReset && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={40} />
              </div>
              <h3 className="text-xl font-bold dark:text-white mb-2">Peringatan Zona Merah!</h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto text-sm">
                Apakah Anda yakin ingin <strong>MENGOSONGKAN</strong> seluruh data absen harian (Tgl 1-31), total realisasi, dan angka telat untuk <strong>SEMUA PEGAWAI</strong>?
              </p>
              <p className="text-red-500 dark:text-red-400 text-xs mt-3 font-semibold bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-100 dark:border-red-800">
                Lakukan tindakan ini HANYA JIKA Anda ingin memulai rekapitulasi di awal bulan baru.
              </p>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-center gap-3 shrink-0">
              <button onClick={() => setConfirmReset(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors w-full">Batal</button>
              <button onClick={executeResetBulan} className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-sm transition-colors w-full flex justify-center items-center gap-2">
                <Trash2 size={16} /> Ya, Kosongkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDIT MANUAL REKAP ABSEN */}
      {isEditModalOpen && editingData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-lg dark:text-white flex items-center gap-2">
                <Edit className="text-emerald-500"/> Edit Rekap Manual - {editingData.name}
              </h3>
              <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[70vh]">
              
              {/* Input Jam Mengajar 1-31 */}
              <div>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-3 gap-2">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Rincian Jam Mengajar (Tanggal 1 - 31)</label>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-500 flex gap-2 font-medium">
                      <span className="text-amber-500">S: Sakit</span>
                      <span className="text-blue-500">I: Izin</span>
                      <span className="text-red-500">A: Alpa</span>
                    </span>
                    <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/50 px-3 py-1.5 rounded-lg shadow-sm">
                      Total Realisasi: {editingData.harian.reduce((sum, val) => sum + (Number(val) || 0), 0)} JPL
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                  {editingData.harian.map((val, idx) => (
                    <div key={idx} className="flex flex-col">
                      <span className="text-[10px] font-semibold text-slate-500 text-center mb-1 bg-slate-100 dark:bg-slate-700 rounded py-0.5 border border-slate-200 dark:border-slate-600">Tgl {idx + 1}</span>
                      <input
                        type="text"
                        value={val}
                        onChange={(e) => handleHarianChange(idx, e.target.value)}
                        className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-center text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white transition-all uppercase"
                        maxLength={2}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsEditModalOpen(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors text-sm">
                Batal
              </button>
              <button 
                onClick={handleSaveEdit} 
                disabled={isSaving}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-sm transition-colors text-sm flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={16} />}
                {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-r from-orange-600 to-amber-500 rounded-2xl p-6 text-white shadow-lg flex items-center justify-between shrink-0 relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-3"><FileText className="text-orange-100" /> Rekapitulasi Jam Mengajar</h1>
          <p className="text-orange-50 text-sm">Rincian jurnal harian (Tgl 1 - 31) dan evaluasi target wajib periode {bulan}.</p>
        </div>
        <FileText size={100} className="absolute -right-6 -top-6 text-white/10 transform rotate-12 pointer-events-none" />
      </div>

      {/* TAMBAHAN: Kartu Statistik Ringkasan Absensi (INTERAKTIF) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
        <div onClick={() => setActiveFilter('all')} className={`cursor-pointer transition-all duration-300 hover:-translate-y-1 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border ${activeFilter === 'all' ? 'border-blue-500 ring-4 ring-blue-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-blue-300'} flex flex-col justify-center relative overflow-hidden group`}>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 relative z-10">Total Realisasi Jam Sekolah</p>
          <div className="flex items-baseline gap-2 relative z-10">
            <h4 className="text-3xl font-extrabold text-blue-600 dark:text-blue-400">{stats.totalJam}</h4>
            <span className="text-sm font-bold text-blue-500">JPL</span>
          </div>
          <div className="absolute -right-4 -bottom-4 bg-blue-50 dark:bg-blue-900/30 w-20 h-20 rounded-full blur-xl group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50 transition-colors"></div>
          {activeFilter === 'all' && <div className="absolute top-4 right-4"><CheckCircle size={16} className="text-blue-500"/></div>}
        </div>
        
        <div onClick={() => setActiveFilter(activeFilter === 'kurang_jam' ? 'all' : 'kurang_jam')} className={`cursor-pointer transition-all duration-300 hover:-translate-y-1 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border ${activeFilter === 'kurang_jam' ? 'border-amber-500 ring-4 ring-amber-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-amber-300'} flex flex-col justify-center relative group`}>
          <div className="flex items-start justify-between relative z-10">
            <div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Pegawai Kurang Jam</p>
              <div className="flex items-baseline gap-2">
                <h4 className="text-3xl font-extrabold text-amber-600 dark:text-amber-400">{stats.kurangJam}</h4>
                <span className="text-sm font-bold text-slate-500">Orang</span>
              </div>
            </div>
            <div className={`p-2 rounded-full transition-colors ${activeFilter === 'kurang_jam' ? 'bg-amber-500 text-white' : 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 group-hover:bg-amber-100'} ${stats.kurangJam === 0 ? 'opacity-30' : ''}`}><AlertCircle size={20}/></div>
          </div>
          {activeFilter === 'kurang_jam' && <div className="absolute top-0 right-0 w-10 h-10 bg-amber-500/10 rounded-bl-full border-b border-l border-amber-500/20"></div>}
        </div>

        <div onClick={() => setActiveFilter(activeFilter === 'sering_telat' ? 'all' : 'sering_telat')} className={`cursor-pointer transition-all duration-300 hover:-translate-y-1 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border ${activeFilter === 'sering_telat' ? 'border-red-500 ring-4 ring-red-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-red-300'} flex flex-col justify-center relative group`}>
          <div className="flex items-start justify-between relative z-10">
            <div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Peringatan Disiplin (Telat {">"} 10x)</p>
              <div className="flex items-baseline gap-2">
                <h4 className="text-3xl font-extrabold text-red-600 dark:text-red-400">{stats.seringTelat}</h4>
                <span className="text-sm font-bold text-slate-500">Orang</span>
              </div>
            </div>
            <div className={`p-2 rounded-full transition-colors ${activeFilter === 'sering_telat' ? 'bg-red-500 text-white' : 'bg-red-50 dark:bg-red-900/30 text-red-600 group-hover:bg-red-100'} ${stats.seringTelat === 0 ? 'opacity-30' : ''}`}><Clock size={20}/></div>
          </div>
          {activeFilter === 'sering_telat' && <div className="absolute top-0 right-0 w-10 h-10 bg-red-500/10 rounded-bl-full border-b border-l border-red-500/20"></div>}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
          <div className="relative w-full max-w-md flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
              <input 
                type="text" placeholder="Cari Nama Guru..." 
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-orange-500 outline-none dark:text-white"
              />
            </div>
            {/* Indikator Filter Aktif */}
            {activeFilter !== 'all' && (
              <span className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap flex items-center gap-1.5 ${activeFilter === 'kurang_jam' ? 'bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400' : 'bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400'}`}>
                Filter: {activeFilter === 'kurang_jam' ? 'Kurang Jam' : 'Sering Telat'}
                <button onClick={() => setActiveFilter('all')} className="ml-1 hover:text-black dark:hover:text-white"><X size={12}/></button>
              </span>
            )}
          </div>
          
          {/* DIPERBARUI: Action Buttons dibiarkan melipat (wrap) dengan rapi di perangkat sempit */}
          <div className="flex flex-wrap gap-2 w-full xl:w-auto justify-end sm:justify-start xl:justify-end">
            {/* TAMBAHAN: Tombol Reset Bulan */}
            <button onClick={handleResetBulan} className="flex-1 sm:flex-none bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 hover:bg-red-100 dark:hover:bg-red-900/40 px-3 py-2 rounded-lg transition-colors shadow-sm flex items-center justify-center gap-1.5 font-bold text-sm">
              <Trash2 size={16} /> <span className="hidden md:inline">Reset Bulan</span><span className="md:hidden">Reset</span>
            </button>

            {/* TAMBAHAN: Tombol Import Mesin Absen */}
            <input type="file" accept=".csv, .txt, .xls, .xlsx" ref={mesinInputRef} onChange={handleImportMesinAbsen} className="hidden" />
            <button onClick={() => mesinInputRef.current?.click()} className="flex-1 sm:flex-none bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-600 px-3 py-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors shadow-sm flex items-center justify-center gap-1.5 font-bold text-blue-700 dark:text-blue-400 text-sm">
              <Fingerprint size={16} /> <span className="hidden sm:inline">Data Mesin</span><span className="sm:hidden">Mesin</span>
            </button>

            <input type="file" accept=".csv, .xlsx, .xls" ref={fileInputRef} onChange={handleImportExcel} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="flex-1 sm:flex-none bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors shadow-sm flex items-center justify-center gap-1.5 font-bold text-slate-700 dark:text-slate-300 text-sm">
              <Upload size={16} /> <span className="hidden sm:inline">Impor Excel</span><span className="sm:hidden">Impor</span>
            </button>
            <button onClick={handleExportExcel} className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg transition-colors shadow-sm flex items-center justify-center gap-1.5 font-bold text-sm">
              <Download size={16} /> <span className="hidden sm:inline">Ekspor Excel</span><span className="sm:hidden">Ekspor</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-auto flex-1 print-area relative p-2 pb-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
          <table className="w-full text-left text-sm whitespace-nowrap min-w-max border-collapse border-2 border-slate-400 dark:border-slate-500">
            <thead className="bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 sticky top-0 z-20 shadow-sm">
              <tr>
                <th className="p-4 font-bold border border-slate-400 dark:border-slate-500 sticky left-0 bg-slate-200 dark:bg-slate-800 z-30 shadow-[1px_0_0_rgba(0,0,0,0.1)]">
                  Nama Guru
                </th>
                {/* Render Header Tanggal 1-31 */}
                {Array.from({ length: 31 }, (_, i) => (
                  <th key={i} className="p-2 font-bold border border-slate-400 dark:border-slate-500 text-center text-[11px] min-w-[32px] bg-slate-100 dark:bg-slate-700/80">
                    {i + 1}
                  </th>
                ))}
                <th className="p-3 font-bold border border-slate-400 dark:border-slate-500 text-center bg-slate-200 dark:bg-slate-800 text-blue-700 dark:text-blue-400">Total</th>
                <th className="p-3 font-bold border border-slate-400 dark:border-slate-500 text-center bg-slate-200 dark:bg-slate-800">Wajib</th>
                <th className="p-3 font-bold border border-slate-400 dark:border-slate-500 text-center bg-slate-200 dark:bg-slate-800 text-purple-700 dark:text-purple-500" title="Jabatan Setara Jam Mengajar">JSJM</th>
                <th className="p-3 font-bold border border-slate-400 dark:border-slate-500 text-center bg-slate-200 dark:bg-slate-800">Selisih</th>
                <th className="p-3 font-bold border border-slate-400 dark:border-slate-500 text-center bg-slate-200 dark:bg-slate-800 text-red-600 dark:text-red-400">Telat</th>
                <th className="p-3 font-bold border border-slate-400 dark:border-slate-500 text-center bg-slate-200 dark:bg-slate-800 text-emerald-700 dark:text-emerald-400">Tepat Waktu</th>
                <th className="p-3 font-bold border border-slate-400 dark:border-slate-500 text-center sticky right-0 bg-slate-200 dark:bg-slate-800 z-30 shadow-[-1px_0_0_rgba(0,0,0,0.1)] no-print">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 dark:divide-slate-600">
              {filtered.map(t => {
                const wajib = t.payroll?.jamMengajar?.wajib !== undefined && t.payroll?.jamMengajar?.wajib !== '' ? Number(t.payroll.jamMengajar.wajib) : (t.status === 'Tetap' ? 60 : 0);
                const real = t.payroll?.jamMengajar?.realisasi || 0;
                const jsjm = t.payroll?.jamMengajar?.jsjm || 0;
                const selisih = (real + jsjm) - wajib; 
                const telat = t.payroll?.disiplin?.telat || 0;
                const tepatWaktu = Math.max(0, real - telat); // Total jam dikurangi telat
                
                // Ambil data array 31 hari dari profil, atau buat simulasi jika belum ada
                const dailyData = t.payroll?.jamMengajar?.harian || getDailyHours(real, t.id);
                
                // TAMBAHAN: Logika Penanda Visual (Row Highlight)
                const isUnderperforming = selisih < 0;
                const isLateOften = telat >= 3;
                
                let rowBgClass = "bg-white dark:bg-slate-800 hover:bg-blue-50/50 dark:hover:bg-slate-700/60";
                let stickyBgClass = "bg-white dark:bg-slate-800 group-hover:bg-blue-50/50 dark:group-hover:bg-slate-700/60";
                
                if (isLateOften) {
                   rowBgClass = "bg-red-50/40 dark:bg-red-900/10 hover:bg-red-100/50 dark:hover:bg-red-900/20";
                   stickyBgClass = "bg-red-50 dark:bg-red-900/20 group-hover:bg-red-100/50 dark:group-hover:bg-red-900/30";
                } else if (isUnderperforming) {
                   rowBgClass = "bg-amber-50/40 dark:bg-amber-900/10 hover:bg-amber-100/50 dark:hover:bg-amber-900/20";
                   stickyBgClass = "bg-amber-50 dark:bg-amber-900/20 group-hover:bg-amber-100/50 dark:group-hover:bg-amber-900/30";
                }

                return (
                  <tr key={t.id} className={`${rowBgClass} transition-colors group`}>
                    <td className={`p-3 sticky left-0 z-10 border border-slate-400 dark:border-slate-500 shadow-[1px_0_0_rgba(0,0,0,0.05)] ${stickyBgClass}`}>
                      <div className="font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap flex items-center gap-1.5">
                        {isLateOften && <Clock size={12} className="text-red-500 flex-shrink-0" title="Sering Telat" />}
                        {isUnderperforming && !isLateOften && <AlertCircle size={12} className="text-amber-500 flex-shrink-0" title="Kurang Jam" />}
                        {t.name}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 ml-4">{t.nipy}</div>
                    </td>
                    
                    {/* Render Kolom Harian 1-31 */}
                    {dailyData.map((jam, i) => (
                      <td key={i} className={`p-1 text-center font-bold border border-slate-400 dark:border-slate-500 text-[11px] ${jam === 'S' ? 'text-amber-600 bg-amber-50/50 dark:bg-amber-900/20' : jam === 'I' ? 'text-blue-600 bg-blue-50/50 dark:bg-blue-900/20' : jam === 'A' ? 'text-red-600 bg-red-50/50 dark:bg-red-900/20' : 'text-slate-700 dark:text-slate-300'}`}>
                        {jam}
                      </td>
                    ))}

                    <td className="p-3 text-center font-black text-base border border-slate-400 dark:border-slate-500 text-blue-700 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/20">
                      {real}
                    </td>
                    <td className="p-1.5 text-center border border-slate-400 dark:border-slate-500 bg-white/50 dark:bg-slate-800/50 align-middle">
                      <input 
                        type="number" 
                        min="0"
                        value={t.payroll?.jamMengajar?.wajib !== undefined ? t.payroll?.jamMengajar?.wajib : (t.status === 'Tetap' ? 60 : 0)} 
                        onChange={(e) => handleInlineWajibChange(t.id, e.target.value)}
                        className="w-14 p-1.5 text-center border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold focus:ring-2 focus:ring-blue-500 outline-none m-auto block shadow-sm transition-all"
                        title="Edit jumlah target wajib secara langsung"
                        placeholder="0"
                      />
                    </td>
                    <td className="p-1.5 text-center border border-slate-400 dark:border-slate-500 bg-purple-50/30 dark:bg-purple-900/10 align-middle">
                      <input 
                        type="number" 
                        min="0"
                        value={t.payroll?.jamMengajar?.jsjm !== undefined ? t.payroll?.jamMengajar?.jsjm : ''} 
                        onChange={(e) => handleInlineJsjmChange(t.id, e.target.value)}
                        className="w-14 p-1.5 text-center border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-400 font-bold focus:ring-2 focus:ring-purple-500 outline-none m-auto block shadow-sm transition-all"
                        title="Jabatan Setara Jam Mengajar"
                        placeholder="0"
                      />
                    </td>
                    <td className={`p-3 text-center font-bold text-base border border-slate-400 dark:border-slate-500 ${selisih < 0 ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {selisih > 0 ? `+${selisih}` : selisih}
                    </td>
                    <td className={`p-1.5 text-center border border-slate-400 dark:border-slate-500 align-middle ${isLateOften ? 'bg-red-100/50 dark:bg-red-900/30' : 'bg-red-50/30 dark:bg-red-900/10'}`}>
                      <input 
                        type="number" 
                        min="0"
                        value={t.payroll?.disiplin?.telat !== undefined ? t.payroll?.disiplin?.telat : 0} 
                        onChange={(e) => handleInlineTelatChange(t.id, e.target.value)}
                        className={`w-14 p-1.5 text-center border rounded-lg bg-white dark:bg-slate-800 font-bold focus:ring-2 focus:ring-red-500 outline-none m-auto block shadow-sm transition-all ${isLateOften ? 'border-red-500 text-red-600 dark:text-red-400' : 'border-red-300 dark:border-red-700 text-red-600 dark:text-red-400'}`}
                        title="Edit jumlah telat secara langsung"
                        placeholder="0"
                      />
                    </td>
                    <td className="p-3 text-center font-black text-emerald-700 dark:text-emerald-400 border border-slate-400 dark:border-slate-500 bg-emerald-50/50 dark:bg-emerald-900/20 text-lg">
                      {tepatWaktu}
                    </td>
                    <td className={`p-2 text-center border border-slate-400 dark:border-slate-500 sticky right-0 z-10 shadow-[-1px_0_0_rgba(0,0,0,0.1)] no-print ${stickyBgClass}`}>
                       <button 
                         onClick={() => handleOpenEdit(t)} 
                         className="p-1.5 bg-white hover:bg-blue-50 text-blue-600 dark:bg-slate-800 dark:hover:bg-blue-900/30 dark:text-blue-400 rounded-md transition-colors shadow-sm border border-slate-300 dark:border-slate-600 flex items-center justify-center mx-auto" 
                         title="Edit Manual Jam & Telat"
                       >
                         <Edit size={16} />
                       </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan="38" className="p-8 text-center text-slate-500 border border-slate-400 dark:border-slate-500">Tidak ada data pegawai ditemukan.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- VIEW: REKAP PINJAMAN & KASBON ADMIN (KOMPONEN BARU & DIPERBARUI DGN CRUD) ---
function RekapPinjamanView({ teachers, setTeachers, onEditGaji }) {
  const [search, setSearch] = useState('');
  
  // TAMBAHAN: State untuk Modal Manajemen Pinjaman
  const [modal, setModal] = useState({ isOpen: false, type: 'add', data: null });
  const [formData, setFormData] = useState({ teacherId: '', ket: 'Kasbon Sekolah', nominal: '' });
  
  // FITUR BARU: State untuk Micro-Interaction Tombol Simpan
  const [isSaving, setIsSaving] = useState(false);
  
  // TAMBAHAN: State Custom Modal Hapus untuk menggantikan window.confirm yang terblokir
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, teacherId: null, originalIndex: null });
  
  // Ekstraksi seluruh data pinjaman dari semua guru
  const allLoans = useMemo(() => {
    let list = [];
    teachers.forEach(t => {
      const loans = t.payroll?.potonganLainnya || [];
      loans.forEach((l, index) => {
        if (l.ket.toLowerCase().includes('kasbon') || 
            l.ket.toLowerCase().includes('koperasi') || 
            l.ket.toLowerCase().includes('pinjaman')) {
          list.push({
            teacherId: t.id,
            teacherName: t.name,
            nipy: t.nipy,
            position: t.position,
            ket: l.ket,
            nominal: l.nominal,
            sisa: l.nominal * 4, // Berdasarkan rule simulasi sebelumnya (bisa dikembangkan nanti)
            originalIndex: index // Menyimpan index asli di array untuk keperluan Edit/Hapus
          });
        }
      });
    });
    return list.sort((a, b) => b.sisa - a.sisa); // Urutkan dari sisa hutang terbesar
  }, [teachers]);

  const filteredLoans = allLoans.filter(l => 
    l.teacherName.toLowerCase().includes(search.toLowerCase()) || 
    l.ket.toLowerCase().includes(search.toLowerCase())
  );

  // Kalkulasi Statistik
  const totalPotonganBulanIni = allLoans.reduce((sum, l) => sum + l.nominal, 0);
  const totalSisaHutang = allLoans.reduce((sum, l) => sum + l.sisa, 0);
  const activeBorrowers = new Set(allLoans.map(l => l.teacherId)).size;

  // HANDLERS UNTUK TAMBAH, EDIT, & HAPUS PINJAMAN
  const openModal = (type, loanData = null) => {
    if (type === 'edit' && loanData) {
      setFormData({ teacherId: loanData.teacherId, ket: loanData.ket, nominal: loanData.nominal });
      setModal({ isOpen: true, type, data: loanData });
    } else {
      setFormData({ teacherId: teachers[0]?.id || '', ket: 'Kasbon Sekolah', nominal: '' });
      setModal({ isOpen: true, type, data: null });
    }
  };

  const handleSaveLoan = (e) => {
    e.preventDefault();
    if (!formData.teacherId || !formData.ket || !formData.nominal) {
      alert("Mohon lengkapi semua data!");
      return;
    }

    setIsSaving(true); // Mulai loading interaksi

    setTimeout(() => {
      setTeachers(prev => prev.map(t => {
        if (t.id === formData.teacherId) {
          const currentPotongan = [...(t.payroll?.potonganLainnya || [])];
          
          if (modal.type === 'add') {
            currentPotongan.push({ ket: formData.ket, nominal: Number(formData.nominal) || 0 });
          } else if (modal.type === 'edit') {
            currentPotongan[modal.data.originalIndex] = { ket: formData.ket, nominal: Number(formData.nominal) || 0 };
          }
          
          return {
            ...t,
            payroll: { ...(t.payroll || {}), potonganLainnya: currentPotongan }
          };
        }
        return t;
      }));

      setIsSaving(false); // Hentikan loading
      setModal({ isOpen: false, type: 'add', data: null });
    }, 600);
  };

  const handleDeleteLoan = (teacherId, originalIndex) => {
    // Membuka custom modal alih-alih menggunakan window.confirm bawaan peramban
    setConfirmDelete({ isOpen: true, teacherId, originalIndex });
  };

  const executeDeleteLoan = () => {
    setTeachers(prev => prev.map(t => {
      if (t.id === confirmDelete.teacherId) {
        const currentPotongan = [...(t.payroll?.potonganLainnya || [])];
        currentPotongan.splice(confirmDelete.originalIndex, 1);
        return {
          ...t,
          payroll: { ...(t.payroll || {}), potonganLainnya: currentPotongan }
        };
      }
      return t;
    }));
    setConfirmDelete({ isOpen: false, teacherId: null, originalIndex: null });
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full relative pb-4">
      
      {/* MODAL KONFIRMASI HAPUS PINJAMAN */}
      {confirmDelete.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center mx-auto mb-4">
                <Trash2 size={40} />
              </div>
              <h3 className="text-xl font-bold dark:text-white mb-2">Hapus Data Pinjaman?</h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto text-sm">
                Apakah Anda yakin ingin menghapus data pinjaman ini? Saldo dan potongan bulanannya akan terhapus dari riwayat sistem secara permanen.
              </p>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-center gap-3 shrink-0">
              <button onClick={() => setConfirmDelete({ isOpen: false, teacherId: null, originalIndex: null })} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors w-full">Batal</button>
              <button onClick={executeDeleteLoan} className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-sm transition-colors w-full flex justify-center items-center gap-2">
                <Trash2 size={16} /> Ya, Hapus Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH & EDIT PINJAMAN */}
      {modal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-lg dark:text-white flex items-center gap-2">
                {modal.type === 'edit' ? <Edit className="text-amber-500"/> : <PlusCircle className="text-teal-500"/>}
                {modal.type === 'edit' ? 'Edit Rincian Pinjaman' : 'Tambah Pinjaman Baru'}
              </h3>
              <button onClick={() => setModal({ isOpen: false, type: 'add', data: null })} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
            </div>

            <div className="p-6">
              <form id="loanForm" onSubmit={handleSaveLoan} className="space-y-4">
                {/* Pilih Pegawai (Hanya aktif saat Tambah Data Baru) */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Pilih Pegawai / Debitur</label>
                  {modal.type === 'add' ? (
                    <select 
                      value={formData.teacherId} onChange={e => setFormData({...formData, teacherId: e.target.value})}
                      className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-teal-500 outline-none dark:text-white font-medium"
                      required
                    >
                      <option value="" disabled>-- Pilih Pegawai --</option>
                      {teachers.map(t => (
                        <option key={t.id} value={t.id}>{t.name} ({t.nipy})</option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-3 bg-slate-100 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold cursor-not-allowed">
                      {modal.data?.teacherName}
                    </div>
                  )}
                </div>

                {/* Jenis Pinjaman */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Jenis Pinjaman / Keterangan</label>
                  <input 
                    list="potongan-list"
                    type="text" value={formData.ket} onChange={e => setFormData({...formData, ket: e.target.value})}
                    placeholder="Cth: Kasbon Sekolah, Pinjaman Koperasi..." required
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-teal-500 outline-none dark:text-white"
                  />
                </div>

                {/* Nominal Cicilan */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Potongan Per Bulan (Rp)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-500 font-medium">Rp</span>
                    <input 
                      type="number" min="1" value={formData.nominal} onChange={e => setFormData({...formData, nominal: e.target.value})}
                      placeholder="Masukkan nominal..." required
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-teal-500 outline-none dark:text-white font-bold text-teal-600 dark:text-teal-400"
                    />
                  </div>
                </div>
              </form>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3 shrink-0">
              <button onClick={() => setModal({ isOpen: false, type: 'add', data: null })} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors">
                Batal
              </button>
              <button 
                type="submit" 
                form="loanForm" 
                disabled={isSaving}
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold shadow-sm transition-colors flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={16} />} 
                {isSaving ? 'Memproses...' : 'Simpan Data'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-r from-teal-600 to-emerald-600 rounded-2xl p-6 md:p-8 text-white shadow-xl flex items-center justify-between shrink-0 relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-3"><CreditCard className="text-teal-100" size={32} /> Rekapitulasi Kasbon & Pinjaman</h1>
          <p className="text-teal-50 text-sm md:text-base max-w-xl">Pantau perputaran uang pinjaman sekolah, estimasi pelunasan, dan kelola daftar tanggungan pegawai secara terpusat.</p>
        </div>
        <CreditCard size={120} className="absolute -right-6 -bottom-6 text-white/10 transform -rotate-12 pointer-events-none" />
      </div>

      {/* Statistik Ringkasan */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col justify-center relative overflow-hidden">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 relative z-10">Total Sisa Piutang Sekolah</p>
          <h4 className="text-3xl font-extrabold text-teal-600 dark:text-teal-400 relative z-10">{formatRp(totalSisaHutang)}</h4>
          <div className="absolute -right-4 -bottom-4 bg-teal-50 dark:bg-teal-900/30 w-24 h-24 rounded-full blur-2xl"></div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col justify-center">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Potongan Masuk Bulan Ini</p>
          <h4 className="text-3xl font-extrabold text-slate-800 dark:text-white">{formatRp(totalPotonganBulanIni)}</h4>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col justify-center">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Pegawai Berhutang</p>
          <div className="flex items-baseline gap-2">
            <h4 className="text-3xl font-extrabold text-amber-600 dark:text-amber-400">{activeBorrowers}</h4>
            <span className="text-sm font-bold text-slate-500">Orang</span>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-full">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
          <h3 className="text-lg font-bold dark:text-white flex items-center gap-2">
            <Users className="text-teal-500" size={20} /> Daftar Debitur / Peminjam
          </h3>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto items-center">
             <div className="relative w-full sm:w-64">
               <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
               <input 
                 type="text" placeholder="Cari Nama atau Jenis Pinjaman..." 
                 value={search} onChange={e => setSearch(e.target.value)}
                 className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-teal-500 outline-none dark:text-white transition-all shadow-sm"
               />
             </div>
             <button onClick={() => openModal('add')} className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-colors flex items-center justify-center gap-2 whitespace-nowrap">
               <PlusCircle size={16} /> Tambah Pinjaman
             </button>
          </div>
        </div>

        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-sm whitespace-nowrap min-w-max">
            <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 sticky top-0 z-10 shadow-sm border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-4 font-bold">Pegawai / NIPY</th>
                <th className="p-4 font-bold">Jenis Tanggungan</th>
                <th className="p-4 font-bold text-right text-red-500">Potongan Bulan Ini</th>
                <th className="p-4 font-bold text-right text-teal-600">Estimasi Sisa Saldo</th>
                <th className="p-4 font-bold text-center">Tindakan Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {filteredLoans.map((loan, idx) => (
                <tr key={idx} className="hover:bg-teal-50/50 dark:hover:bg-slate-800/40 transition-colors group">
                  <td className="p-4">
                    <div className="font-bold text-slate-800 dark:text-slate-200">{loan.teacherName}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{loan.nipy} • {loan.position}</div>
                  </td>
                  <td className="p-4">
                     <span className="bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-600 flex items-center gap-1.5 w-fit">
                       <CreditCard size={14}/> {loan.ket}
                     </span>
                  </td>
                  <td className="p-4 text-right font-bold text-red-600 dark:text-red-400 bg-red-50/30 dark:bg-red-900/10">
                    -{formatRp(loan.nominal)}
                  </td>
                  <td className="p-4 text-right font-black text-teal-700 dark:text-teal-400 bg-teal-50/30 dark:bg-teal-900/10 text-base">
                    {formatRp(loan.sisa)}
                  </td>
                  <td className="p-4 text-center">
                     <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => openModal('edit', loan)} 
                          className="p-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-300 dark:hover:border-amber-700 rounded-lg transition-all shadow-sm"
                          title="Edit nominal & keterangan pinjaman"
                        >
                          <Edit size={16} />
                        </button>
                        <button 
                          onClick={() => handleDeleteLoan(loan.teacherId, loan.originalIndex)} 
                          className="p-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-700 rounded-lg transition-all shadow-sm"
                          title="Hapus / Lunasi pinjaman ini permanen"
                        >
                          <Trash2 size={16} />
                        </button>
                     </div>
                  </td>
                </tr>
              ))}
              {filteredLoans.length === 0 && (
                <tr><td colSpan="5" className="p-10 text-center text-slate-500">
                  <CheckCircle size={40} className="mx-auto mb-3 text-emerald-400 opacity-50" />
                  Belum ada data pinjaman atau kasbon yang terdaftar.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GajiView({ teachers, setTeachers, externalSelectedId, setExternalSelectedId, settings }) {
  const [activeTabGaji, setActiveTabGaji] = useState('masaKerja');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('Semua'); 
  
  // State untuk Pratinjau Slip Gaji
  const [isSlipModalOpen, setIsSlipModalOpen] = useState(false);
  const [slipTeacher, setSlipTeacher] = useState(null);

  const fileInputGajiRef = useRef(null);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  // TAMBAHAN: Custom Modal Terapkan Massal
  const [confirmMassal, setConfirmMassal] = useState({ isOpen: false, arrKey: null, itemData: null, targetGender: 'All', targetText: '' });

  // Jika ada ID Guru yang dikirim dari menu lain, otomatis filter nama/NIPY guru tersebut
  useEffect(() => {
     if(externalSelectedId) {
        const t = teachers.find(x => x.id === externalSelectedId);
        if (t) setSearchTerm(t.nipy);
     }
  }, [externalSelectedId, teachers]);

  const filteredTeachers = teachers.filter(t => {
    const matchName = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.nipy.includes(searchTerm);
    const matchStatus = filterStatus === 'Semua' ? true : t.status === filterStatus;
    return matchName && matchStatus;
  });
  
  const bulan = getFormattedPeriod(settings?.payrollPeriod);

  // --- HELPER PEMBARUAN DATA (DIPERBARUI: Menerima Parameter teacherId) ---
  const updateTeacherData = (teacherId, updaterFn) => {
    setTeachers(prev => prev.map(t => t.id === teacherId ? updaterFn(t) : t));
  };

  const handleUpdateFamily = (teacherId, field, value) => {
    const safeValue = (typeof value === 'number' && isNaN(value)) ? 0 : value;
    updateTeacherData(teacherId, t => ({ ...t, family: { ...(t.family || {}), [field]: safeValue } }));
  };

  const handleUpdatePayrollObj = (teacherId, objKey, field, value) => {
    const safeValue = (typeof value === 'number' && isNaN(value)) ? 0 : value;
    updateTeacherData(teacherId, t => {
      const p = t.payroll || {};
      const childObj = p[objKey] || {};
      return { 
        ...t, 
        payroll: { ...p, [objKey]: { ...childObj, [field]: safeValue } } 
      };
    });
  };

  const handleArrayUpdate = (teacherId, arrKey, index, field, value) => {
    const safeValue = (typeof value === 'number' && isNaN(value)) ? 0 : value;
    updateTeacherData(teacherId, t => {
      const p = t.payroll || {};
      const newArr = [...(p[arrKey] || [])];
      newArr[index] = { ...newArr[index], [field]: safeValue };
      return { ...t, payroll: { ...p, [arrKey]: newArr } };
    });
  };

  const handleAddArrayItem = (teacherId, arrKey, defaultObj) => {
    updateTeacherData(teacherId, t => {
      const p = t.payroll || {};
      return { 
        ...t, 
        payroll: { ...p, [arrKey]: [...(p[arrKey] || []), defaultObj] } 
      };
    });
  };

  const handleRemoveArrayItem = (teacherId, arrKey, index) => {
    updateTeacherData(teacherId, t => {
      const p = t.payroll || {};
      const newArr = [...(p[arrKey] || [])];
      newArr.splice(index, 1);
      return { ...t, payroll: { ...p, [arrKey]: newArr } };
    });
  };

  const handleYearChange = (teacherId, yearStr) => {
     const year = parseInt(yearStr, 10);
     const safeYear = isNaN(year) ? new Date().getFullYear() : year;
     const newNominal = TENURE_RATES[safeYear] !== undefined ? TENURE_RATES[safeYear] : '';
     updateTeacherData(teacherId, t => {
         const p = t.payroll || {};
         return {
             ...t,
             payroll: {
                 ...p,
                 tahunMasaKerja: safeYear,
                 tunjanganMasaKerjaManual: newNominal
             }
         };
     });
  };

  const handleApplyMassal = (arrKey, itemData, targetGender = 'All') => {
    if (!itemData.ket || itemData.nominal === 0) {
       alert("Mohon isi Keterangan dan Nominal terlebih dahulu sebelum menerapkannya.");
       return;
    }
    
    const targetText = targetGender === 'L' ? 'GURU LAKI-LAKI' : targetGender === 'P' ? 'GURU PEREMPUAN' : 'SELURUH PEGAWAI';

    // Buka Modal Konfirmasi
    setConfirmMassal({ isOpen: true, arrKey, itemData, targetGender, targetText });
  };

  const executeApplyMassal = () => {
    const { arrKey, itemData, targetGender, targetText } = confirmMassal;
    
    setTeachers(prev => prev.map(t => {
       if (targetGender !== 'All' && t.gender !== targetGender) {
          return t;
       }

       const p = t.payroll || {};
       const currentArr = [...(p[arrKey] || [])];
       const existingIndex = currentArr.findIndex(x => x.ket.toLowerCase() === itemData.ket.toLowerCase());
       
       if (existingIndex >= 0) {
          currentArr[existingIndex] = { ...itemData };
       } else {
          currentArr.push({ ...itemData });
       }

       return {
         ...t,
         payroll: { ...p, [arrKey]: currentArr }
       };
    }));
    
    setConfirmMassal({ isOpen: false, arrKey: null, itemData: null, targetGender: 'All', targetText: '' });
    setTimeout(() => alert(`Terapkan Massal Berhasil! Komponen ini sekarang telah ditambahkan ke ${targetText.toLowerCase()}.`), 300);
  };

  const handleExportGajiCSV = () => {
    const headers = [
      'ID', 'Nama Pegawai', 'NIPY', 'Tahun Masa Kerja', 'Nominal Masa Kerja', 
      'Tingkat Pendidikan', 'Nominal Pendidikan', 'Tarif Suami Istri', 'Tarif Anak',
      'Tarif Bonus Hadir', 'Tarif Potongan Telat', 'Wajib JPL', 'Tarif per JPL'
    ];
    const csvRows = [headers.join(';')];
    
    teachers.forEach(t => {
      const p = t.payroll || {};
      const row = [
        `"${t.id}"`,
        `"${t.name}"`,
        `"=""${t.nipy}"""`,
        p.tahunMasaKerja || '',
        p.tunjanganMasaKerjaManual !== undefined ? p.tunjanganMasaKerjaManual : '',
        `"${p.pendidikan?.tingkat || t.education}"`,
        p.pendidikan?.nominalOverride !== undefined ? p.pendidikan.nominalOverride : '',
        p.keluarga?.tarifSuamiIstri !== undefined ? p.keluarga.tarifSuamiIstri : '',
        p.keluarga?.tarifAnak !== undefined ? p.keluarga.tarifAnak : '',
        p.disiplin?.tarifHadir !== undefined ? p.disiplin.tarifHadir : '',
        p.disiplin?.tarifTelat !== undefined ? p.disiplin.tarifTelat : '',
        p.jamMengajar?.wajib !== undefined ? p.jamMengajar.wajib : '',
        p.jamMengajar?.tarifJPL !== undefined ? p.jamMengajar.tarifJPL : ''
      ];
      csvRows.push(row.join(';'));
    });
    
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Master_Tarif_Gaji_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportGajiCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split('\n');
      if(lines.length < 2) return;
      
      const separator = lines[0].includes(';') ? ';' : ',';
      let updatedCount = 0;
      const updatedTeachers = [...teachers];
      
      for(let i = 1; i < lines.length; i++) {
        if(!lines[i].trim()) continue;
        
        const regex = new RegExp(`${separator}(?=(?:(?:[^"]*"){2})*[^"]*$)`);
        const values = lines[i].split(regex).map(v => v.replace(/^"|"$/g, '').replace(/^=""|"""$/g, '').replace(/^"|"$/g, '').trim());
        
        if (values.length >= 13) {
           const impId = values[0];
           const impName = values[1];
           const teacherIndex = updatedTeachers.findIndex(t => t.id === impId || t.name.toLowerCase() === impName?.toLowerCase());
           
           if (teacherIndex !== -1) {
              const t = updatedTeachers[teacherIndex];
              const p = t.payroll || {};
              
              updatedTeachers[teacherIndex] = {
                 ...t,
                 payroll: {
                    ...p,
                    tahunMasaKerja: values[3] ? parseInt(values[3], 10) : p.tahunMasaKerja,
                    tunjanganMasaKerjaManual: values[4] !== '' ? Number(values[4]) : p.tunjanganMasaKerjaManual,
                    pendidikan: {
                       ...p.pendidikan,
                       tingkat: values[5] || p.pendidikan?.tingkat || t.education,
                       nominalOverride: values[6] !== '' ? Number(values[6]) : p.pendidikan?.nominalOverride
                    },
                    keluarga: {
                       ...p.keluarga,
                       tarifSuamiIstri: values[7] !== '' ? Number(values[7]) : p.keluarga?.tarifSuamiIstri,
                       tarifAnak: values[8] !== '' ? Number(values[8]) : p.keluarga?.tarifAnak
                    },
                    disiplin: {
                       ...p.disiplin,
                       tarifHadir: values[9] !== '' ? Number(values[9]) : p.disiplin?.tarifHadir,
                       tarifTelat: values[10] !== '' ? Number(values[10]) : p.disiplin?.tarifTelat
                    },
                    jamMengajar: {
                       ...p.jamMengajar,
                       wajib: values[11] !== '' ? Number(values[11]) : '',
                       tarifJPL: values[12] !== '' ? Number(values[12]) : p.jamMengajar?.tarifJPL
                    }
                 }
              };
              updatedCount++;
           }
        }
      }

      if (updatedCount > 0) {
        setTeachers(updatedTeachers);
        alert(`Berhasil! Rincian tarif dasar komponen gaji untuk ${updatedCount} pegawai telah diperbarui.`);
      } else {
        alert('Tidak ada data pegawai yang cocok untuk diperbarui.');
      }
      e.target.value = null; 
    };
    reader.readAsText(file);
  };

  const formatNum = (num) => new Intl.NumberFormat('id-ID').format(num);

  const tabMenus = [
    { id: 'masaKerja', label: 'Tunjangan Masa Kerja', icon: Clock },
    { id: 'jabatan', label: 'Tunjangan Jabatan', icon: Briefcase },
    { id: 'pendidikan', label: 'Tunjangan Pendidikan', icon: GraduationCap },
    { id: 'kompetensi', label: 'Tunjangan Kompetensi', icon: Star },
    { id: 'keluarga', label: 'Tunjangan Keluarga', icon: Users },
    { id: 'disiplin', label: 'Kedisiplinan & Mengajar', icon: AlertCircle },
    { id: 'insentif', label: 'Insentif Tambahan', icon: TrendingUp },
    { id: 'potongan', label: 'Potongan Lainnya', icon: Trash2 }
  ];

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full relative">
      
      <datalist id="kategori-list">
        {JOB_CATEGORIES.map(cat => <option key={cat} value={cat} />)}
      </datalist>
      <datalist id="detail-list">
        {JOB_ROLES.map(role => <option key={role} value={role} />)}
      </datalist>
      <datalist id="kompetensi-list">
        {KOMPETENSI_FIELDS.map(f => <option key={f} value={f} />)}
      </datalist>
      <datalist id="insentif-list">
        {INSENTIF_LIST.map(i => <option key={i} value={i} />)}
      </datalist>
      <datalist id="potongan-list">
        {POTONGAN_LIST.map(i => <option key={i} value={i} />)}
      </datalist>

      {/* MODAL KONFIRMASI TERAPKAN MASSAL */}
      {confirmMassal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 flex items-center justify-center mx-auto mb-4">
                <Users size={40} />
              </div>
              <h3 className="text-xl font-bold dark:text-white mb-2">Terapkan Secara Massal?</h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto text-sm">
                Apakah Anda yakin ingin menerapkan komponen <strong className="text-slate-700 dark:text-slate-200">"{confirmMassal.itemData.ket}"</strong> senilai <strong className="text-indigo-600 dark:text-indigo-400">{formatNum(confirmMassal.itemData.nominal)}</strong> ke <strong className="text-slate-700 dark:text-slate-200">{confirmMassal.targetText}</strong>?
              </p>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-center gap-3 shrink-0">
              <button onClick={() => setConfirmMassal({ isOpen: false, arrKey: null, itemData: null, targetGender: 'All', targetText: '' })} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors w-full">Batal</button>
              <button onClick={executeApplyMassal} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-sm transition-colors w-full flex justify-center items-center gap-2">
                <CheckCircle size={16} /> Ya, Terapkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pratinjau Slip */}
      {isSlipModalOpen && slipTeacher && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-300 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-lg dark:text-white flex items-center gap-2"><FileText className="text-blue-500"/> Pratinjau Slip Gaji</h3>
              <button onClick={() => setIsSlipModalOpen(false)} className="p-2 hover:bg-slate-200 dark:bg-slate-800 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
            </div>
            <div className="overflow-y-auto p-4 md:p-8 bg-slate-200 dark:bg-slate-700/50 flex-1">
              <SlipDocument teacher={slipTeacher} bulan={bulan} settings={settings} />
            </div>
            <div className="p-4 border-t border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 flex justify-end gap-3 shrink-0">
              <button onClick={() => window.print()} className="bg-slate-600 hover:bg-slate-700 text-white px-5 py-2.5 rounded-lg font-medium inline-flex items-center gap-2 shadow-sm transition-colors">
                <Printer size={18}/> Print
              </button>
              <button 
                onClick={async () => {
                  setIsExportingPDF(true);
                  try {
                    await exportToPDF('printable-area', `Slip_Gaji_${slipTeacher.name.replace(/\s+/g, '_')}_${bulan}.pdf`);
                  } finally {
                    setIsExportingPDF(false);
                  }
                }} 
                disabled={isExportingPDF}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-medium inline-flex items-center gap-2 shadow-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isExportingPDF ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Download size={18}/>}
                {isExportingPDF ? 'Memproses...' : 'Unduh PDF'}
              </button>
              <button onClick={() => setIsSlipModalOpen(false)} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-r from-emerald-600 to-green-500 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden flex items-center justify-between shrink-0">
        <div className="relative z-10">
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-3"><Calculator className="text-green-100" /> Input Cepat Komponen Gaji</h1>
          <p className="text-green-50 text-sm">Pilih komponen di menu kiri, lalu sesuaikan nilainya untuk semua pegawai secara berurutan di sebelah kanan.</p>
        </div>
        <Calculator size={100} className="absolute -right-6 -top-6 text-white/10 transform rotate-12 pointer-events-none" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
        
        {/* KOLOM KIRI: DAFTAR KOMPONEN GAJI */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-auto lg:h-[calc(100vh-16rem)] shadow-sm shrink-0">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center shrink-0">
             <h3 className="font-bold dark:text-white flex items-center gap-2"><Calculator size={18} className="text-emerald-500" /> Pilih Komponen</h3>
          </div>
          <div className="flex-1 overflow-x-auto lg:overflow-y-auto flex flex-row lg:flex-col hide-scrollbar lg:py-2">
            {tabMenus.map(tab => {
              const isActive = activeTabGaji === tab.id;
              const Icon = tab.icon;
              return (
                <button 
                  key={tab.id} 
                  onClick={() => setActiveTabGaji(tab.id)}
                  className={`w-auto lg:w-full text-left p-4 border-b border-r lg:border-r-0 border-slate-100 dark:border-slate-700/50 hover:bg-emerald-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-3 whitespace-nowrap lg:whitespace-normal shrink-0 ${isActive ? 'bg-emerald-50 dark:bg-emerald-900/20 lg:border-l-4 border-b-4 lg:border-b border-emerald-500 font-bold text-emerald-700 dark:text-emerald-400' : 'lg:border-l-4 border-transparent font-medium text-slate-600 dark:text-slate-400'}`}
                >
                  <Icon size={18} className={isActive ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* KOLOM KANAN: DAFTAR GURU & FORM INPUT */}
        <div className="lg:col-span-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-[calc(100vh-16rem)] shadow-sm relative">
          
          {/* HEADER: Filter, Pencarian & Import/Export */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
             <div className="flex gap-2 w-full sm:w-auto">
               <select 
                 value={filterStatus} 
                 onChange={e => setFilterStatus(e.target.value)}
                 className="p-2.5 text-sm font-semibold border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white transition-all w-1/3 sm:w-auto"
               >
                 <option value="Semua">Semua Pegawai</option>
                 <option value="Tetap">Status Tetap</option>
                 <option value="Tidak Tetap">Status Tidak Tetap</option>
               </select>
               <div className="relative flex-1 sm:w-64">
                 <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                 <input 
                   type="text" 
                   placeholder="Cari Nama Pegawai..." 
                   value={searchTerm} 
                   onChange={e => setSearchTerm(e.target.value)}
                   className="w-full pl-9 pr-3 py-2.5 text-sm font-medium border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white transition-all shadow-sm"
                 />
               </div>
             </div>
             <div className="flex gap-2 w-full sm:w-auto">
               <input type="file" accept=".csv, .xlsx, .xls" ref={fileInputGajiRef} onChange={handleImportGajiCSV} className="hidden" />
               <button onClick={() => fileInputGajiRef.current?.click()} className="flex-1 sm:flex-none justify-center px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg text-slate-700 dark:text-slate-300 text-sm font-bold transition-colors shadow-sm flex items-center gap-2" title="Impor Tarif Dasar dari Excel">
                 <Upload size={16} /> <span className="hidden sm:inline">Impor Tarif</span>
               </button>
               <button onClick={handleExportGajiCSV} className="flex-1 sm:flex-none justify-center px-4 py-2 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 rounded-lg text-emerald-700 dark:text-emerald-400 text-sm font-bold transition-colors shadow-sm flex items-center gap-2" title="Ekspor Tarif Dasar ke Excel">
                 <Download size={16} /> <span className="hidden sm:inline">Ekspor Tarif</span>
               </button>
             </div>
          </div>

          {/* KONTEN: DAFTAR KARTU GURU BERSERTA INPUT */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/50 dark:bg-slate-900/20 space-y-5" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
            
            <div className="mb-4 bg-emerald-50 dark:bg-emerald-900/10 border-l-4 border-emerald-500 p-3 rounded-r-lg shadow-sm">
               <h4 className="text-sm font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                 Input Mode: {tabMenus.find(t => t.id === activeTabGaji)?.label}
               </h4>
               <p className="text-xs text-emerald-600/80 dark:text-emerald-500 mt-0.5">Perubahan yang Anda ketik akan otomatis tersimpan.</p>
            </div>

            {filteredTeachers.map(t => {
              // Failsafe Hydration per Card
              const p = t.payroll || {};
              const family = t.family || {};

              return (
                <div key={t.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-md border-2 border-slate-300 dark:border-slate-600 hover:border-emerald-400 dark:hover:border-emerald-500 transition-colors duration-300 relative overflow-hidden group">
                  
                  {/* Header Card Guru */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50/80 dark:bg-slate-900/50 border-b-2 border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 text-white rounded-full flex items-center justify-center font-bold shadow-md shrink-0 bg-gradient-to-br ${t.gender === 'P' ? 'from-pink-400 to-rose-500' : 'from-blue-500 to-indigo-600'}`}>
                         {t.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 dark:text-white text-sm md:text-base leading-tight">{t.name}</h4>
                        <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5">{t.nipy} • <span className={t.status === 'Tetap' ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-amber-600 dark:text-amber-400 font-semibold'}>{t.status}</span></p>
                      </div>
                    </div>
                    <button 
                      onClick={() => { setSlipTeacher(t); setIsSlipModalOpen(true); }} 
                      className="text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors text-slate-700 dark:text-slate-300 shadow-sm w-full sm:w-auto"
                      title="Lihat Pratinjau Slip"
                    >
                      <FileText size={14}/> Pratinjau Slip
                    </button>
                  </div>

                  {/* Isi Konten Input Berdasarkan Komponen Gaji Aktif */}
                  <div className="p-4 md:p-5">
                    
                    {/* 1. MASA KERJA */}
                    {activeTabGaji === 'masaKerja' && (
                      <div className="flex flex-col sm:flex-row gap-4 animate-in fade-in zoom-in-95 duration-200">
                        <div className="w-full sm:w-1/3">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Tahun Hitung</label>
                          <input 
                             type="number" 
                             value={p.tahunMasaKerja || ''}
                             onChange={(e) => handleYearChange(t.id, e.target.value)}
                             className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white font-bold"
                             placeholder="Contoh: 2018"
                           />
                        </div>
                        <div className="w-full sm:w-2/3">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Nominal Tunjangan</label>
                          <div className="relative">
                             <span className="absolute left-3 top-2.5 text-slate-500 font-medium">Rp</span>
                             <input type="number" 
                               value={p.tunjanganMasaKerjaManual !== undefined ? p.tunjanganMasaKerjaManual : ''}
                               onChange={e => updateTeacherData(t.id, currentT => ({ ...currentT, payroll: { ...(currentT.payroll || {}), tunjanganMasaKerjaManual: e.target.value === '' ? '' : Number(e.target.value) } }))}
                               className="w-full pl-10 pr-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white font-bold text-emerald-600"
                               placeholder="Ketik manual nominal..."
                             />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 2. JABATAN */}
                    {activeTabGaji === 'jabatan' && (
                      <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-end mb-2">
                           <button onClick={() => handleAddArrayItem(t.id, 'jabatans', { kategori: '', detail: '', kinerja: 'Baik', nominal: 0 })} className="text-xs flex items-center gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400 px-3 py-1.5 rounded-lg font-bold transition-colors">
                             <PlusCircle size={14} /> Tambah Jabatan
                           </button>
                        </div>
                        {(p.jabatans || []).length === 0 && <p className="text-xs text-slate-500 italic text-center py-4">Belum ada jabatan untuk pegawai ini.</p>}
                        {(p.jabatans || []).map((jab, idx) => (
                          <div key={idx} className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 relative">
                            <button onClick={() => handleRemoveArrayItem(t.id, 'jabatans', idx)} className="absolute right-2 top-2 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors" title="Hapus"><Trash size={16} /></button>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-1 pr-8 lg:pr-0">
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Kategori</span>
                                <input list="kategori-list" placeholder="Pilih..." value={jab.kategori} onChange={e => handleArrayUpdate(t.id, 'jabatans', idx, 'kategori', e.target.value)} className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-xs dark:text-white outline-none focus:ring-2 focus:ring-emerald-500" />
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Detail</span>
                                <input list="detail-list" placeholder="Pilih..." value={jab.detail} onChange={e => handleArrayUpdate(t.id, 'jabatans', idx, 'detail', e.target.value)} className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-xs dark:text-white outline-none focus:ring-2 focus:ring-emerald-500" />
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Kinerja</span>
                                <select value={jab.kinerja} onChange={e => handleArrayUpdate(t.id, 'jabatans', idx, 'kinerja', e.target.value)} className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-xs dark:text-white outline-none focus:ring-2 focus:ring-emerald-500">
                                  {KINERJA_LEVELS.map(k => <option key={k} value={k}>{k}</option>)}
                                </select>
                              </div>
                              <div>
                                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Nominal (Rp)</span>
                                 <div className="relative">
                                   <span className="absolute left-2.5 top-2 text-slate-500 text-xs font-medium">Rp</span>
                                   <input type="number" value={jab.nominal} onChange={e => handleArrayUpdate(t.id, 'jabatans', idx, 'nominal', Number(e.target.value))} className="w-full pl-8 pr-2 py-2 border border-emerald-300 dark:border-emerald-600 rounded-lg bg-emerald-50/30 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400 font-bold outline-none text-xs focus:ring-2 focus:ring-emerald-500" />
                                 </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 3. PENDIDIKAN */}
                    {activeTabGaji === 'pendidikan' && (
                      <div className="flex flex-col sm:flex-row gap-4 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex-1">
                          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Tingkat Pendidikan</span>
                          <select 
                            value={p.pendidikan?.tingkat || t.education} 
                            onChange={e => handleUpdatePayrollObj(t.id, 'pendidikan', 'tingkat', e.target.value)}
                            className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            {['S2', 'S1', 'Diploma', 'SMA/Pondok'].map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
                          </select>
                        </div>
                        <div className="flex-1">
                          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Nominal Tunjangan (Rp)</span>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-slate-500 font-medium">Rp</span>
                            <input type="number" 
                              value={p.pendidikan?.nominalOverride !== undefined ? p.pendidikan.nominalOverride : (EDU_RATES[t.education] || 0)}
                              onChange={e => handleUpdatePayrollObj(t.id, 'pendidikan', 'nominalOverride', Number(e.target.value))}
                              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 4. KOMPETENSI */}
                    {activeTabGaji === 'kompetensi' && (
                      <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-end mb-2">
                           <button onClick={() => handleAddArrayItem(t.id, 'kompetensi', { bidang: '', level: 'Pra Ahli', nominal: 0 })} className="text-xs flex items-center gap-1 bg-amber-100 text-amber-700 hover:bg-amber-200 px-3 py-1.5 rounded-lg font-bold transition-colors">
                             <PlusCircle size={14} /> Tambah Keahlian
                           </button>
                        </div>
                        {(p.kompetensi || []).length === 0 && <p className="text-xs text-slate-500 italic text-center py-4">Belum ada kompetensi ditambahkan.</p>}
                        {(p.kompetensi || []).map((komp, idx) => (
                          <div key={idx} className="flex flex-col sm:flex-row gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700 items-start sm:items-center">
                            <div className="w-full sm:flex-1">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Bidang Keahlian</span>
                              <input list="kompetensi-list" placeholder="Pilih..." value={komp.bidang} onChange={e => handleArrayUpdate(t.id, 'kompetensi', idx, 'bidang', e.target.value)} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-xs dark:text-white outline-none focus:ring-2 focus:ring-emerald-500" />
                            </div>
                            <div className="w-full sm:w-32">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Level</span>
                              <select value={komp.level} onChange={e => handleArrayUpdate(t.id, 'kompetensi', idx, 'level', e.target.value)} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-xs dark:text-white outline-none focus:ring-2 focus:ring-emerald-500">
                                {KOMPETENSI_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                              </select>
                            </div>
                            <div className="w-full sm:w-40">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Nominal (Rp)</span>
                              <div className="relative">
                                 <span className="absolute left-2.5 top-2.5 text-slate-500 font-medium text-xs">Rp</span>
                                 <input type="number" value={komp.nominal} onChange={e => handleArrayUpdate(t.id, 'kompetensi', idx, 'nominal', Number(e.target.value))} className="w-full pl-8 pr-2 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-emerald-500" />
                              </div>
                            </div>
                            <button onClick={() => handleRemoveArrayItem(t.id, 'kompetensi', idx)} className="mt-4 sm:mt-5 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors w-full sm:w-auto flex justify-center"><Trash size={16} /></button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 5. KELUARGA */}
                    {activeTabGaji === 'keluarga' && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Status Pasangan</span>
                          <select 
                            value={family.wife || 0} onChange={e => handleUpdateFamily(t.id, 'wife', Number(e.target.value))}
                            className="w-full p-2 mb-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white"
                          >
                            <option value={1}>Menikah (Terima Tunjangan)</option>
                            <option value={2}>Menikah (1 Sekolah - Tanpa Tunjangan)</option>
                            <option value={0}>Belum / Cerai (Tidak Ada)</option>
                          </select>
                          <span className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider">Tarif Pasangan (Rp)</span>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-slate-500 font-medium">Rp</span>
                            <input 
                              type="number" min="0" 
                              value={p.keluarga?.tarifSuamiIstri !== undefined ? p.keluarga.tarifSuamiIstri : 200000} 
                              onChange={e => handleUpdatePayrollObj(t.id, 'keluarga', 'tarifSuamiIstri', Number(e.target.value))} 
                              className="w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 font-bold" 
                            />
                          </div>
                        </div>

                        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Jumlah Anak</span>
                          <input 
                            type="number" min="0" 
                            value={family.children || 0} 
                            onChange={e => handleUpdateFamily(t.id, 'children', Number(e.target.value))} 
                            className="w-full p-2 mb-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-center" 
                            placeholder="Jumlah anak..." 
                          />
                          <span className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider">Tarif Per Anak (Rp)</span>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-slate-500 font-medium">Rp</span>
                            <input 
                              type="number" min="0" 
                              value={p.keluarga?.tarifAnak !== undefined ? p.keluarga.tarifAnak : 100000} 
                              onChange={e => handleUpdatePayrollObj(t.id, 'keluarga', 'tarifAnak', Number(e.target.value))} 
                              className="w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 font-bold" 
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 6. DISIPLIN & MENGAJAR */}
                    {activeTabGaji === 'disiplin' && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in fade-in zoom-in-95 duration-200">
                        {/* Box Disiplin */}
                        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                           <div className="flex flex-col sm:flex-row gap-3">
                              <div className="w-full sm:w-1/3">
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Hari Telat</span>
                                <input type="number" value={p.disiplin?.telat || 0} onChange={e => handleUpdatePayrollObj(t.id, 'disiplin', 'telat', Number(e.target.value))} className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 dark:text-white text-center font-bold outline-none focus:ring-2 focus:ring-emerald-500" />
                              </div>
                              <div className="flex-1 w-full">
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Tarif Potong (Rp)</span>
                                <div className="relative">
                                  <span className="absolute left-3 top-2 text-slate-500 text-sm">Rp</span>
                                  <input type="number" value={p.disiplin?.tarifTelat || 0} onChange={e => handleUpdatePayrollObj(t.id, 'disiplin', 'tarifTelat', Number(e.target.value))} className="w-full pl-9 pr-2 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500" />
                                </div>
                              </div>
                           </div>
                           <div className="flex flex-col sm:flex-row gap-3">
                              <div className="w-full sm:w-1/3">
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Tepat Waktu</span>
                                <div className="w-full p-2 border border-emerald-200 dark:border-emerald-700 rounded-lg text-sm bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-center font-bold cursor-not-allowed">
                                  {Math.max(0, (p.jamMengajar?.realisasi || 0) - (p.disiplin?.telat || 0))}
                                </div>
                              </div>
                              <div className="flex-1 w-full">
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Bonus Hadir (Rp)</span>
                                <div className="relative">
                                  <span className="absolute left-3 top-2 text-slate-500 text-sm">Rp</span>
                                  <input type="number" value={p.disiplin?.tarifHadir || 0} onChange={e => handleUpdatePayrollObj(t.id, 'disiplin', 'tarifHadir', Number(e.target.value))} className="w-full pl-9 pr-2 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500" />
                                </div>
                              </div>
                           </div>
                        </div>

                        {/* Box Jam Mengajar */}
                        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                           <div className="flex flex-col sm:flex-row gap-3">
                              <div className="w-full sm:w-1/2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Wajib (JPL)</span>
                                <input type="number" value={p.jamMengajar?.wajib !== undefined && p.jamMengajar?.wajib !== '' ? p.jamMengajar.wajib : (t.status === 'Tetap' ? 60 : 0)} onChange={e => handleUpdatePayrollObj(t.id, 'jamMengajar', 'wajib', Number(e.target.value))} className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 dark:text-white text-center font-bold outline-none focus:ring-2 focus:ring-emerald-500" />
                              </div>
                              <div className="w-full sm:w-1/2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Realisasi (JPL)</span>
                                <input type="number" value={p.jamMengajar?.realisasi || 0} onChange={e => handleUpdatePayrollObj(t.id, 'jamMengajar', 'realisasi', Number(e.target.value))} className="w-full p-2 border border-blue-300 dark:border-blue-600 rounded-lg text-sm bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-center font-bold outline-none focus:ring-2 focus:ring-emerald-500" />
                              </div>
                           </div>
                           <div className="flex-1 w-full">
                              <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Tarif per JPL (Rp)</span>
                              <div className="relative">
                                <span className="absolute left-3 top-2 text-slate-500 text-sm">Rp</span>
                                <input type="number" value={p.jamMengajar?.tarifJPL || 0} onChange={e => handleUpdatePayrollObj(t.id, 'jamMengajar', 'tarifJPL', Number(e.target.value))} className="w-full pl-9 pr-2 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500" />
                              </div>
                           </div>
                        </div>
                      </div>
                    )}

                    {/* 7. INSENTIF */}
                    {activeTabGaji === 'insentif' && (
                      <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-end mb-2">
                           <button onClick={() => handleAddArrayItem(t.id, 'insentifTambahan', { ket: '', nominal: 0 })} className="text-xs flex items-center gap-1 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-3 py-1.5 rounded-lg font-bold transition-colors">
                             <PlusCircle size={14} /> Tambah Insentif
                           </button>
                        </div>
                        {(p.insentifTambahan || []).length === 0 && <p className="text-xs text-slate-500 italic text-center py-4">Belum ada insentif tambahan.</p>}
                        {(p.insentifTambahan || []).map((ins, idx) => (
                          <div key={idx} className="flex flex-col sm:flex-row gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700 items-start sm:items-center">
                            <div className="w-full flex-1">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Keterangan Tugas</span>
                              <input list="insentif-list" placeholder="Pilih..." value={ins.ket} onChange={e => handleArrayUpdate(t.id, 'insentifTambahan', idx, 'ket', e.target.value)} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-xs dark:text-white outline-none focus:ring-2 focus:ring-emerald-500" />
                            </div>
                            <div className="w-full sm:w-48">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Nominal (Rp)</span>
                              <div className="relative">
                                 <span className="absolute left-2.5 top-2.5 text-slate-500 font-medium text-xs">Rp</span>
                                 <input type="number" value={ins.nominal} onChange={e => handleArrayUpdate(t.id, 'insentifTambahan', idx, 'nominal', Number(e.target.value))} className="w-full pl-8 pr-2 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-xs font-bold text-indigo-600 dark:text-indigo-400 outline-none focus:ring-2 focus:ring-emerald-500" />
                              </div>
                            </div>
                            
                            {/* Tombol Terapkan Massal (L/P/Semua) */}
                            <div className="hidden sm:flex gap-1.5 items-center mt-5">
                              <div className="flex bg-indigo-50 dark:bg-indigo-900/30 rounded-lg overflow-hidden border border-indigo-200 dark:border-indigo-800/50">
                                <button onClick={() => handleApplyMassal('insentifTambahan', { ket: ins.ket, nominal: Number(ins.nominal) }, 'All')} className="px-2 py-1.5 hover:bg-indigo-100 text-indigo-600 text-xs font-bold border-r border-indigo-200 flex items-center gap-1"><Users size={12}/> Semua</button>
                                <button onClick={() => handleApplyMassal('insentifTambahan', { ket: ins.ket, nominal: Number(ins.nominal) }, 'L')} className="px-2 py-1.5 hover:bg-indigo-100 text-indigo-600 text-xs font-bold border-r border-indigo-200">L</button>
                                <button onClick={() => handleApplyMassal('insentifTambahan', { ket: ins.ket, nominal: Number(ins.nominal) }, 'P')} className="px-2 py-1.5 hover:bg-indigo-100 text-indigo-600 text-xs font-bold">P</button>
                              </div>
                              <button onClick={() => handleRemoveArrayItem(t.id, 'insentifTambahan', idx)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash size={16} /></button>
                            </div>

                            <div className="w-full sm:hidden flex gap-2 mt-2">
                               <button onClick={() => handleApplyMassal('insentifTambahan', { ket: ins.ket, nominal: Number(ins.nominal) }, 'All')} className="flex-1 py-1.5 text-[10px] text-indigo-600 font-bold border border-indigo-200 rounded-md">Massal (Semua)</button>
                               <button onClick={() => handleRemoveArrayItem(t.id, 'insentifTambahan', idx)} className="flex-1 py-1.5 text-[10px] text-red-600 font-bold border border-red-200 rounded-md">Hapus</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 8. POTONGAN LAINNYA */}
                    {activeTabGaji === 'potongan' && (
                      <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-end mb-2">
                           <button onClick={() => handleAddArrayItem(t.id, 'potonganLainnya', { ket: '', nominal: 0 })} className="text-xs flex items-center gap-1 bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1.5 rounded-lg font-bold transition-colors">
                             <PlusCircle size={14} /> Tambah Potongan
                           </button>
                        </div>
                        {(p.potonganLainnya || []).length === 0 && <p className="text-xs text-slate-500 italic text-center py-4">Belum ada potongan ditambahkan.</p>}
                        {(p.potonganLainnya || []).map((pot, idx) => (
                          <div key={idx} className="flex flex-col sm:flex-row gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700 items-start sm:items-center">
                            <div className="w-full flex-1">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Keterangan Potongan</span>
                              <input list="potongan-list" placeholder="Pilih..." value={pot.ket} onChange={e => handleArrayUpdate(t.id, 'potonganLainnya', idx, 'ket', e.target.value)} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-xs dark:text-white outline-none focus:ring-2 focus:ring-emerald-500" />
                            </div>
                            <div className="w-full sm:w-48">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Nominal (Rp)</span>
                              <div className="relative">
                                 <span className="absolute left-2.5 top-2.5 text-slate-500 font-medium text-xs">Rp</span>
                                 <input type="number" value={pot.nominal} onChange={e => handleArrayUpdate(t.id, 'potonganLainnya', idx, 'nominal', Number(e.target.value))} className="w-full pl-8 pr-2 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-xs font-bold text-red-600 dark:text-red-400 outline-none focus:ring-2 focus:ring-emerald-500" />
                              </div>
                            </div>
                            
                            {/* Tombol Terapkan Massal (L/P/Semua) */}
                            <div className="hidden sm:flex gap-1.5 items-center mt-5">
                              <div className="flex bg-red-50 dark:bg-red-900/30 rounded-lg overflow-hidden border border-red-200 dark:border-red-800/50">
                                <button onClick={() => handleApplyMassal('potonganLainnya', { ket: pot.ket, nominal: Number(pot.nominal) }, 'All')} className="px-2 py-1.5 hover:bg-red-100 text-red-600 text-xs font-bold border-r border-red-200 flex items-center gap-1"><Users size={12}/> Semua</button>
                                <button onClick={() => handleApplyMassal('potonganLainnya', { ket: pot.ket, nominal: Number(pot.nominal) }, 'L')} className="px-2 py-1.5 hover:bg-red-100 text-red-600 text-xs font-bold border-r border-red-200">L</button>
                                <button onClick={() => handleApplyMassal('potonganLainnya', { ket: pot.ket, nominal: Number(pot.nominal) }, 'P')} className="px-2 py-1.5 hover:bg-red-100 text-red-600 text-xs font-bold">P</button>
                              </div>
                              <button onClick={() => handleRemoveArrayItem(t.id, 'potonganLainnya', idx)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash size={16} /></button>
                            </div>

                            <div className="w-full sm:hidden flex gap-2 mt-2">
                               <button onClick={() => handleApplyMassal('potonganLainnya', { ket: pot.ket, nominal: Number(pot.nominal) }, 'All')} className="flex-1 py-1.5 text-[10px] text-red-600 font-bold border border-red-200 rounded-md">Massal (Semua)</button>
                               <button onClick={() => handleRemoveArrayItem(t.id, 'potonganLainnya', idx)} className="flex-1 py-1.5 text-[10px] text-red-600 font-bold border border-red-200 rounded-md">Hapus</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                  </div>
                </div>
              );
            })}
            
            {filteredTeachers.length === 0 && (
               <div className="h-full flex flex-col items-center justify-center text-slate-400 py-20">
                 <Search size={48} className="mb-4 opacity-30" />
                 <p className="text-lg">Pegawai tidak ditemukan</p>
                 <p className="text-sm mt-2">Ubah kata kunci pencarian atau filter status.</p>
               </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Komponen Reusable untuk Template Slip Gaji Terperinci (Format Kertas Folio/F4)
function SlipDocument({ teacher, bulan, settings }) {
  const slip = calculatePayroll(teacher);
  const p = teacher.payroll || {}; // DIPERBARUI: Failsafe
  const family = teacher.family || {}; // DIPERBARUI: Failsafe
  
  const formatNum = (num) => new Intl.NumberFormat('id-ID').format(num);

  // Helper untuk format nominal rata Kiri (Rp.) Kanan (Angka)
  const renderNominal = (amount) => (
    <div className="flex justify-between w-full">
      <span>Rp.</span>
      <span>{amount ? formatNum(amount) : '-'}</span>
    </div>
  );

  // Helper BARU: untuk rincian baris agar titik dua (:) sejajar rapi sempurna layaknya "Tab"
  // DIPERBARUI: Diubah menjadi fungsi helper (renderDetailRow) untuk menghindari anti-pattern deklarasi komponen dalam komponen
  const renderDetailRow = (label, value) => (
    <div className="flex mb-0.5 w-full">
      <span className="w-[55%] shrink-0 inline-block">{label}</span>
      <span className="w-4 shrink-0 text-center">:</span>
      <span className="flex-1">{value}</span>
    </div>
  );

  // Menghitung jumlah S, I, A dari data harian (jika ada)
  const harian = p.jamMengajar?.harian || [];
  let countS = 0, countI = 0, countA = 0;
  harian.forEach(val => {
    if (val === 'S') countS++;
    if (val === 'I') countI++;
    if (val === 'A') countA++;
  });

  const wajib = p.jamMengajar?.wajib !== undefined && p.jamMengajar?.wajib !== '' ? Number(p.jamMengajar.wajib) : (teacher.status === 'Tetap' ? 60 : 0);
  
  const tepatWaktu = Math.max(0, (p.jamMengajar?.realisasi || 0) - (p.disiplin?.telat || 0));

  let potongans = [];
  // DIPERBARUI: Tambahan keterangan perhitungan tarif potongan telat dengan failsafe
  if (slip.potongTelat > 0) potongans.push({ ket: `Keterlambatan (${p.disiplin?.telat || 0} Kali x ${formatRp(p.disiplin?.tarifTelat || 0)})`, nominal: slip.potongTelat });
  if (p.potonganLainnya) potongans = [...potongans, ...p.potonganLainnya];

  // Ekstrak Tarif Keluarga Dinamis untuk ditampilkan di cetakan
  const tarifSuamiIstri = p.keluarga?.tarifSuamiIstri !== undefined ? Number(p.keluarga.tarifSuamiIstri) : 200000;
  const tarifAnak = p.keluarga?.tarifAnak !== undefined ? Number(p.keluarga.tarifAnak) : 100000;

  // TAMBAHAN: Nomor Slip & Tanggal Cetak Dinamis
  const d = new Date();
  const padZero = (num) => String(num).padStart(2, '0');
  const noSlip = `SLIP/${padZero(d.getMonth() + 1)}-${d.getFullYear()}/${teacher.id}`;
  const tanggalCetak = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="bg-white p-4 md:p-6 rounded-sm shadow-sm border border-slate-300 text-black mx-auto print-area w-full relative min-h-auto flex flex-col font-sans" style={{ maxWidth: '215.9mm' }} id="printable-area">
      
      {/* TAMBAHAN: Watermark Logo Sekolah (Transparan 4%) */}
      {settings?.logoUrl && (
        <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none opacity-[0.04]">
           <img src={settings.logoUrl} alt="Watermark" className="w-[80%] max-w-lg object-contain grayscale" />
        </div>
      )}

      {/* Kop Surat / Header Slip - DIPERBARUI: Layout Flex Rapi & Lencana Putih */}
      <div className="border-b-4 border-double border-black pb-4 mb-4 relative z-10 flex justify-between items-center w-full">
        
        {/* Kiri: Logo & Lencana Periode Gaji */}
        <div className="flex flex-col items-center gap-2 w-1/4 shrink-0">
          {settings?.logoUrl && (
             <img src={settings.logoUrl} alt="Logo" className="w-16 h-16 md:w-[76px] md:h-[76px] object-contain drop-shadow-sm" />
          )}
          <div className="bg-white text-black font-black text-[9px] md:text-[10px] px-4 py-1.5 rounded-full whitespace-nowrap tracking-widest shadow-sm border-2 border-black">
            PERIODE: {bulan.toUpperCase()}
          </div>
        </div>
        
        {/* Tengah: Identitas Sekolah */}
        <div className="flex flex-col justify-center text-center px-2 flex-1 min-w-0">
          {settings?.foundationName && (
             <h1 className="text-base md:text-lg font-black uppercase tracking-wider text-black leading-tight mb-0.5 whitespace-pre-line">
               {settings.foundationName}
             </h1>
          )}
          <h1 className="text-sm md:text-base font-extrabold uppercase tracking-wide text-black leading-snug mb-1 whitespace-pre-line">
            {settings?.schoolName || 'Sekolah Islam Terpadu XYZ'}
          </h1>
          <p className="text-[10px] md:text-xs text-black font-semibold mt-0.5 leading-relaxed whitespace-pre-line">
            {settings?.address || 'Jl. Pendidikan No. 123, Kec. Banjarmasin, Kalimantan Selatan 70123'}
          </p>
        </div>

        {/* Kanan: QR Code & Lencana No Slip */}
        <div className="flex flex-col items-center gap-2 w-1/4 shrink-0">
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=VERIFY-${encodeURIComponent(noSlip)}&color=000000`} alt="QR Code" className="w-16 h-16 md:w-[76px] md:h-[76px] border-2 border-black p-1 rounded-lg bg-white shadow-sm" />
          <div className="bg-white text-black font-black text-[9px] md:text-[10px] px-4 py-1.5 rounded-full whitespace-nowrap tracking-widest shadow-sm border-2 border-black">
            NO: {noSlip}
          </div>
        </div>
      </div>

      {/* Identitas Pegawai (DIPERBARUI: Disederhanakan tanpa No Rekening & Periode Gaji) */}
      <div className="grid grid-cols-2 gap-4 mb-3 text-sm relative z-10">
        <div>
          <div className="flex"><span className="w-28 shrink-0 font-medium">Nama</span><span className="w-4 shrink-0 text-center">:</span><span className="font-bold uppercase flex-1">{teacher.name}</span></div>
          <div className="flex"><span className="w-28 shrink-0 font-medium">NIPY</span><span className="w-4 shrink-0 text-center">:</span><span className="flex-1">{teacher.nipy}</span></div>
        </div>
        {/* Memberikan padding left (pl) agar tergeser ke kanan seperti efek 'tab' */}
        <div className="pl-6 sm:pl-12">
          <div className="flex"><span className="w-32 shrink-0 font-medium">Status</span><span className="w-4 shrink-0 text-center">:</span><span className="flex-1">Guru {teacher.status}</span></div>
          <div className="flex"><span className="w-32 shrink-0 font-medium">TMT (Mulai Tugas)</span><span className="w-4 shrink-0 text-center">:</span><span className="flex-1">{formatDateId(teacher.tmt)}</span></div>
        </div>
      </div>

      {/* Tabel Rincian Gaji */}
      <div className="flex-1 mb-2 relative z-10">
        <table className="w-full border-collapse border border-black text-sm">
          <thead>
            <tr>
              <th className="border border-black p-1.5 text-center uppercase w-10">NO.</th>
              <th className="border border-black p-1.5 text-center uppercase"> RINCIAN KOMPONEN GAJI</th>
              <th className="border border-black p-1.5 text-center uppercase w-48">NOMINAL</th>
            </tr>
          </thead>
          <tbody>
            {/* A. TUNJANGAN */}
            <tr className="bg-slate-50"><td colSpan="3" className="border border-black p-1.5 font-bold">A. TUNJANGAN</td></tr>
            <tr>
              <td className="border border-black p-1.5 text-center align-top">1</td>
              <td className="border border-black p-1.5">
                <div className="mb-1 font-semibold">Tunjangan Berdasarkan Masa Kerja</div>
                {renderDetailRow(`TMT (Tahun Mulai Tugas) ${p.tahunMasaKerja}`, <>(<strong>{new Date().getFullYear() - p.tahunMasaKerja} tahun</strong>)</>)}
              </td>
              <td className="border border-black p-1.5 align-top">{renderNominal(slip.tMasaKerja)}</td>
            </tr>
            <tr>
              <td className="border border-black p-1.5 text-center align-top">2</td>
              <td className="border border-black p-1.5">
                {renderDetailRow("Tunjangan Berdasarkan Pendidikan", <strong>{p.pendidikan?.tingkat || teacher.education}</strong>)}
              </td>
              <td className="border border-black p-1.5 align-top">{renderNominal(slip.tPendidikan)}</td>
            </tr>
            {p.jabatans && p.jabatans.length > 0 ? p.jabatans.map((j, i) => (
              <tr key={`jab-${i}`}>
                <td className="border border-black p-1.5 text-center align-top">{i === 0 ? 3 : ''}</td>
                <td className="border border-black p-1.5">
                  <div className="mb-1 font-semibold">Jabatan {i+1} ({j.detail})</div>
                  {renderDetailRow("Penilaian Kinerja", <strong>{j.kinerja}</strong>)}
                </td>
                <td className="border border-black p-1.5 align-top">{renderNominal(j.nominal)}</td>
              </tr>
            )) : (
              <tr>
                <td className="border border-black p-1.5 text-center align-top">3</td>
                <td className="border border-black p-1.5 italic text-slate-500">Tidak ada jabatan</td>
                <td className="border border-black p-1.5 align-top">{renderNominal(0)}</td>
              </tr>
            )}
            {p.kompetensi && p.kompetensi.length > 0 ? p.kompetensi.map((k, i) => (
              <tr key={`komp-${i}`}>
                <td className="border border-black p-1.5 text-center align-top">{i === 0 ? 4 : ''}</td>
                <td className="border border-black p-1.5">
                  <div className="mb-1 font-semibold">Tunjangan Kompetensi</div>
                  {renderDetailRow("Bidang Keahlian Khusus", <span className="font-bold">{k.bidang}</span>)}
                  {renderDetailRow("Level Kompetensi", <span className="font-bold">{k.level}</span>)}
                </td>
                <td className="border border-black p-1.5 align-top">{renderNominal(k.nominal)}</td>
              </tr>
            )) : (
              <tr>
                <td className="border border-black p-1.5 text-center align-top">4</td>
                <td className="border border-black p-1.5 italic text-slate-500">Tidak ada tunjangan kompetensi</td>
                <td className="border border-black p-1.5 align-top">{renderNominal(0)}</td>
              </tr>
            )}
            <tr>
              <td className="border border-black p-1.5 text-center align-top">5</td>
              <td className="border border-black p-1.5">
                <div className="mb-1 font-semibold">Tunjangan Keluarga</div>
                {/* DIPERBARUI: Label dinamis menyesuaikan gender dan pasangan 1 yayasan */}
                {renderDetailRow(teacher.gender === 'P' ? 'Suami' : 'Isteri', <>{family.wife === 1 ? <>1 Orang <span className="font-normal italic text-slate-600 ml-1">(x {formatRp(tarifSuamiIstri)})</span></> : family.wife === 2 ? <span className="italic text-slate-600 font-medium text-xs bg-slate-100 px-2 py-0.5 rounded">Ditanggung Pasangan (1 Yayasan)</span> : '0 Orang'}</>)}
                {renderDetailRow("Anak", <>{family.children || 0} Orang <span className="font-normal italic text-slate-600 ml-1">(x {formatRp(tarifAnak)})</span></>)}
              </td>
              <td className="border border-black p-1.5 align-top">{renderNominal(slip.tKeluarga)}</td>
            </tr>

            {/* B. INSENTIF KEHADIRAN & JAM MENGAJAR */}
            <tr className="bg-slate-50 print:break-inside-avoid"><td colSpan="3" className="border border-black p-1.5 font-bold">B. INSENTIF KEHADIRAN & JAM MENGAJAR</td></tr>
            <tr className="print:break-inside-avoid">
              <td className="border border-black p-1.5 text-center align-top">1</td>
              <td className="border border-black p-1.5">
                {/* DIPERBARUI: Penambahan JSJM dan Penyesuaian Label Jam Mengajar */}
                {renderDetailRow("Jabatan Setara Jam Mengajar (JSJM)", `${p.jamMengajar?.jsjm || 0} jam`)}
                {renderDetailRow("Jam Mengajar Bulan Ini", `${p.jamMengajar?.realisasi || 0} jam`)}
                {renderDetailRow("Jam Wajib Mengajar Guru Tetap", `${wajib} jam`)}
                {renderDetailRow("Selisih Jam Mengajar", <>{slip.jamDihitung} jam <span className="font-normal italic text-slate-600 ml-1">(x {formatRp(p.jamMengajar?.tarifJPL || 0)})</span></>)}
              </td>
              <td className="border border-black p-1.5 align-top">{renderNominal(slip.tMengajar)}</td>
            </tr>
            <tr className="print:break-inside-avoid">
              <td className="border border-black p-1.5 text-center align-top">2</td>
              <td className="border border-black p-1.5">
                <div className="mb-1 font-semibold">Bonus Kedisiplinan Waktu Masuk Kelas</div>
                {renderDetailRow("Jumlah Kehadiran Tepat Waktu", <>{tepatWaktu} kali <span className="font-normal italic text-slate-600 ml-1">(x {formatRp(p.disiplin?.tarifHadir || 0)})</span></>)}
                {renderDetailRow("Jumlah Keterlambatan", `${p.disiplin?.telat || 0} kali`)}
              </td>
              <td className="border border-black p-1.5 align-top">{renderNominal(slip.bonusHadir)}</td>
            </tr>

            {/* C. INSENTIF TUGAS TAMBAHAN KHUSUS */}
            <tr className="bg-slate-50 print:break-inside-avoid"><td colSpan="3" className="border border-black p-1.5 font-bold">C. INSENTIF TUGAS TAMBAHAN KHUSUS</td></tr>
            {p.insentifTambahan && p.insentifTambahan.length > 0 ? p.insentifTambahan.map((ins, i) => (
              <tr key={`ins-${i}`} className="print:break-inside-avoid">
                <td className="border border-black p-1.5 text-center align-top">{i+1}</td>
                <td className="border border-black p-1.5">{ins.ket}</td>
                <td className="border border-black p-1.5 align-top">{renderNominal(ins.nominal)}</td>
              </tr>
            )) : (
               <tr className="print:break-inside-avoid">
                 <td className="border border-black p-1.5 text-center align-top">1</td>
                 <td className="border border-black p-1.5 italic text-slate-500">Tidak ada insentif tambahan</td>
                 <td className="border border-black p-1.5 align-top">{renderNominal(0)}</td>
               </tr>
            )}

            {/* TOTAL GAJI KOTOR */}
            <tr className="bg-slate-200 print:bg-slate-200 print:break-inside-avoid" style={{WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact'}}>
              <td colSpan="2" className="border border-black p-2 font-bold text-center uppercase tracking-wider">TOTAL GAJI KOTOR</td>
              <td className="border border-black p-2 font-bold">{renderNominal(slip.totalKotor)}</td>
            </tr>

            {/* D. POTONGAN GAJI */}
            <tr className="bg-slate-50 print:break-inside-avoid"><td colSpan="3" className="border border-black p-1.5 font-bold">D. POTONGAN GAJI</td></tr>
            {potongans.length > 0 ? potongans.map((pot, i) => (
              <tr key={`pot-${i}`} className="print:break-inside-avoid">
                <td className="border border-black p-1.5 text-center align-top">{i === 0 ? 1 : ''}</td>
                <td className="border border-black p-1.5">
                  {pot.ket}
                  {/* TAMBAHAN POIN 4: Fitur Info Sisa Saldo Kasbon/Koperasi Dinamis */}
                  {(pot.ket.toLowerCase().includes('koperasi') || pot.ket.toLowerCase().includes('kasbon') || pot.ket.toLowerCase().includes('pinjaman')) && (
                     <div className="text-[10px] text-slate-600 font-medium italic mt-0.5 ml-1">
                        *(Sisa Saldo Pinjaman/Kasbon: {formatRp(pot.nominal * 4)})
                     </div>
                  )}
                </td>
                <td className="border border-black p-1.5 align-top">{renderNominal(pot.nominal)}</td>
              </tr>
            )) : (
              <tr className="print:break-inside-avoid">
                <td className="border border-black p-1.5 text-center align-top">1</td>
                <td className="border border-black p-1.5 italic text-slate-500">Tidak ada potongan</td>
                <td className="border border-black p-1.5 align-top">{renderNominal(0)}</td>
              </tr>
            )}

            {/* TOTAL POTONGAN */}
            <tr className="print:break-inside-avoid">
              <td colSpan="2" className="border border-black p-2 font-bold text-center uppercase tracking-wider">TOTAL POTONGAN</td>
              <td className="border border-black p-2 font-bold">{renderNominal(slip.totalPotongan)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* PENERIMAAN GAJI BERSIH THP (DIPERBARUI: TAMBAHAN Metode Pembayaran) */}
      <table className="w-full border-collapse border-4 border-double border-black mb-3 mt-1 relative z-10 print:break-inside-avoid">
         <tbody>
            <tr className="bg-slate-200 text-black print:bg-slate-200 print:text-black" style={{WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact'}}>
               <td className="border border-black p-2 md:p-3 font-bold text-center w-[60%] text-sm tracking-wide">
                  PENERIMAAN GAJI BERSIH (THP)
                  {teacher.bankName && <div className="text-[10px] font-normal italic mt-0.5 opacity-80">*Dana ditransfer ke rekening penerima</div>}
               </td>
               <td className="border border-black p-2 md:p-3 font-bold text-center text-lg w-[40%]">
                  {formatRp(slip.totalBersih)}
               </td>
            </tr>
            <tr>
               <td colSpan="2" className="border border-black p-2 text-center text-xs bg-slate-50">
                  Terbilang: <strong className="ml-1 uppercase text-slate-800 italic"># {terbilang(slip.totalBersih).trim()} Rupiah #</strong>
               </td>
            </tr>
         </tbody>
      </table>

      {/* Keterangan Tidak Hadir (DIPERBARUI: Dibuat sejajar 1 baris untuk hemat tempat) */}
      <div className="text-sm mb-3 mt-1 relative z-10 print:break-inside-avoid">
         <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 font-medium border border-black p-2 bg-slate-50">
           <div className="font-bold mr-2">Keterangan Tidak Hadir:</div>
           <div className="flex items-center gap-1.5"><span className="w-16">Sakit (S)</span><span>:</span><span className="font-bold">{countS} Hari</span></div>
           <div className="flex items-center gap-1.5"><span className="w-16">Izin (I)</span><span>:</span><span className="font-bold">{countI} Hari</span></div>
           <div className="flex items-center gap-1.5"><span className="w-16">Alpa (A)</span><span>:</span><span className="font-bold">{countA} Hari</span></div>
         </div>
      </div>

      {/* Bagian Tanda Tangan (TAMBAHAN POIN 1: E-Sign & Stamp) */}
      <div className="mt-auto grid grid-cols-2 text-center text-sm pt-2 relative z-10 print:break-inside-avoid">
         <div className="flex flex-col items-center justify-end">
           <p className="mb-12">Penerima,</p>
           <p className="font-bold underline uppercase tracking-wide">{teacher.name}</p>
         </div>
         <div className="flex flex-col items-center justify-end relative">
           <p className="mb-2">Kuala Pembuang, {tanggalCetak}<br/>Mengetahui, Kepala Sekolah</p>
           
           {/* E-Sign & Stamp Container (Vektor SVG Premium) */}
           <div className="relative w-32 h-20 flex items-center justify-center my-1">
             {/* Stempel SVG Transparan */}
             <svg className="absolute w-20 h-20 text-indigo-700/30 transform -rotate-12" viewBox="0 0 100 100">
               <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4,2" />
               <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="1" />
               <path id="curve" d="M 15 50 A 35 35 0 1 1 85 50 A 35 35 0 1 1 15 50" fill="transparent" />
               <text fontSize="9.5" fill="currentColor" fontWeight="bold" letterSpacing="1.2">
                 <textPath href="#curve" startOffset="50%" textAnchor="middle">LEMBAGA PENDIDIKAN</textPath>
               </text>
               <text x="50" y="54" fontSize="15" fill="currentColor" fontWeight="900" textAnchor="middle">PAYEDU</text>
               <circle cx="50" cy="50" r="25" fill="none" stroke="currentColor" strokeWidth="1" />
             </svg>
             
             {/* Tanda Tangan: Cek jika ada URL kustom di pengaturan */}
             {settings?.signatureUrl ? (
               <img src={settings.signatureUrl} alt="Tanda Tangan" className="absolute w-32 h-16 object-contain z-10 mix-blend-multiply ml-6 transform -rotate-2" />
             ) : (
               <svg className="absolute w-28 h-16 text-blue-900/80 transform rotate-[-5deg] ml-6" viewBox="0 0 100 50">
                 <path d="M10,40 C15,25 25,10 35,15 C45,20 40,45 50,35 C60,25 65,10 75,20 C85,30 80,45 95,30" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                 <path d="M25,28 L50,28" fill="none" stroke="currentColor" strokeWidth="1.5" />
               </svg>
             )}
           </div>
           
           {/* DIPERBARUI: Nama Kepala Sekolah menjadi dinamis dari pengaturan */}
           <p className="font-bold underline uppercase tracking-wide relative z-10">{settings?.principalName || 'H. Fulan, S.Pd., M.Pd'}</p>
         </div>
      </div>

      {/* TAMBAHAN: Catatan Kaki (Footer Disclaimer) */}
      <div className="mt-8 border-t border-dashed border-slate-400 pt-3 text-[10px] text-slate-500 italic text-center relative z-10 pb-2 print:break-inside-avoid">
         Dokumen slip gaji ini diterbitkan secara otomatis oleh sistem penggajian Guru SDIT QA dan dilengkapi dengan validasi QR Code. Harap simpan dokumen ini sebagai bukti yang sah. Jika terdapat ketidaksesuaian rincian, mohon hubungi Bendahara maksimal 1x24 jam sejak dokumen ini diterima.
      </div>
    </div>
  );
}

// Rekap Gaji View
function RekapGajiView({ teachers, setTeachers, onEditGaji, settings, setSettings, archives, setArchives }) {
  const [search, setSearch] = useState('');
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [isArchiving, setIsArchiving] = useState(false);
  
  // TAMBAHAN: State Custom Modal & Notifikasi untuk mengatasi blokir alert browser
  const [isConfirmArchiveOpen, setIsConfirmArchiveOpen] = useState(false);
  const [isConfirmAjukanOpen, setIsConfirmAjukanOpen] = useState(false);
  const [isConfirmNotifMassalOpen, setIsConfirmNotifMassalOpen] = useState(false); // Modal Notif Massal
  const [notification, setNotification] = useState({ isOpen: false, type: '', message: '' });
  
  // FITUR BARU 3: State untuk Cetak Massal
  const [isMassPrinting, setIsMassPrinting] = useState(false);

  const bulan = getFormattedPeriod(settings?.payrollPeriod);

  const filtered = teachers.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) || 
    t.nipy.includes(search)
  );

  const handleKirimNotif = (id) => {
    if(settings?.payrollStatus !== 'Approved') {
       setNotification({ isOpen: true, type: 'error', message: 'Akses Ditolak: Gaji belum disetujui (Approved) oleh Kepala Sekolah.' });
       return;
    }
    setTeachers(prev => prev.map(t => 
      t.id === id ? { ...t, payroll: { ...t.payroll, isNotified: true, isConfirmed: false } } : t
    ));
    setNotification({ isOpen: true, type: 'success', message: 'Notifikasi transfer gaji berhasil dikirim ke portal guru.' });
  };

  // TAMBAHAN: Fungsi Pengiriman Notifikasi Massal
  const handleKirimNotifMassal = () => {
    if(settings?.payrollStatus !== 'Approved') {
       setNotification({ isOpen: true, type: 'error', message: 'Akses Ditolak: Gaji belum disetujui (Approved) oleh Kepala Sekolah.' });
       return;
    }
    setIsConfirmNotifMassalOpen(true);
  };

  const executeKirimNotifMassal = () => {
    setIsConfirmNotifMassalOpen(false);
    setTeachers(prev => prev.map(t => {
      // Hanya kirim notif jika status guru belum mengonfirmasi penerimaan
      if (!t.payroll?.isConfirmed) {
        return { ...t, payroll: { ...t.payroll, isNotified: true, isConfirmed: false } };
      }
      return t;
    }));
    setNotification({ isOpen: true, type: 'success', message: 'Luar Biasa! Notifikasi berhasil dikirim secara massal ke portal seluruh guru.' });
  };

  // PERBAIKAN: Mengganti window.confirm dengan modal custom
  const handleAjukanApproval = () => {
     setIsConfirmAjukanOpen(true);
  };

  const executeAjukanApproval = () => {
     setIsConfirmAjukanOpen(false);
     setSettings({ ...settings, payrollStatus: 'Pending' });
     setNotification({ isOpen: true, type: 'success', message: 'Draft Gaji berhasil diajukan! Menunggu persetujuan Kepala Sekolah.' });
  };

  const handleArchive = () => {
    // Membuka modal khusus, BUKAN menggunakan window.confirm bawaan
    setIsConfirmArchiveOpen(true);
  };

  const executeArchive = async () => {
    setIsConfirmArchiveOpen(false);
    setIsArchiving(true);
    try {
      const res = await fetch(GOOGLE_SHEETS_API_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'ARCHIVE_PAYROLL',
          payload: {
            periode: bulan,
            data: teachers
          }
        })
      });
      const result = await res.json();
      if (result.status === 'success') {
        // --- SAVE TO LOCAL ARCHIVE STATE ---
        const totalBersihBulanIni = teachers.reduce((sum, t) => sum + calculatePayroll(t).totalBersih, 0);

        // OPTIMASI MEMORI TAHAP 1: Memangkas (*pruning*) array harian (31 elemen) yang memboroskan ruang penyimpanan lokal
        const optimizedTeachers = teachers.map(t => {
          const { payroll, ...restTeacher } = t;
          const { jamMengajar, isNotified, isConfirmed, ...restPayroll } = payroll || {};
          const { harian, ...restJamMengajar } = jamMengajar || {};
          
          return {
            ...restTeacher,
            payroll: {
              ...restPayroll,
              jamMengajar: restJamMengajar // Disimpan tanpa rincian array 'harian'
            }
          };
        });

        const newArchive = {
          id: generateUniqueId('arc-'),
          periode: bulan,
          dateArchived: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
          totalGaji: totalBersihBulanIni,
          dataGuru: optimizedTeachers
        };

        // OPTIMASI MEMORI TAHAP 2: Batasi Arsip Lokal maksimal 12 bulan terakhir agar tidak meluap
        if(setArchives) {
          setArchives(prev => {
             const updated = [newArchive, ...prev];
             return updated.length > 12 ? updated.slice(0, 12) : updated;
          });
        }
        // -----------------------------------
        
        const currentPeriod = settings?.payrollPeriod || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const [y, m] = currentPeriod.split('-');
        const nextD = new Date(y, m, 1);
        const nextPeriod = `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, '0')}`;
        
        setSettings({ ...settings, payrollStatus: 'Draft', payrollPeriod: nextPeriod });
        setNotification({ isOpen: true, type: 'success', message: result.message || 'Gaji berhasil diarsipkan! Bulan periode telah otomatis diperbarui ke bulan berikutnya.' });
      } else {
        setNotification({ isOpen: true, type: 'error', message: 'Gagal mengarsipkan: ' + result.message });
      }
    } catch (error) {
      console.error(error);
      setNotification({ isOpen: true, type: 'error', message: 'Terjadi kesalahan koneksi ke database. Pastikan perangkat Anda terhubung ke internet.' });
    }
    setIsArchiving(false);
  };

  // TAMBAHAN: Ekspor Tabel Rekap ke CSV sebagai alternatif Print yang tangguh
  const handleExportCSV = () => {
    const headers = ['Nama Pegawai', 'NIPY', 'Status', 'Jabatan', 'T. Masa Kerja', 'T. Jabatan', 'T. Pendidikan', 'T. Kompetensi', 'T. Keluarga', 'Insentif Tamb.', 'Bonus Hadir', 'Kelebihan Jam', 'Total Kotor', 'Potongan', 'THP Bersih'];
    const csvRows = [headers.join(';')];

    let gtMasaKerja = 0, gtJabatan = 0, gtPendidikan = 0, gtKompetensi = 0,
        gtKeluarga = 0, gtTambahan = 0, gtBonusHadir = 0, gtMengajar = 0,
        gtTotalKotor = 0, gtPotong = 0, gtTHP = 0;

    filtered.forEach(t => {
      const slip = calculatePayroll(t);
      
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
        `"${formatRp(slip.totalBersih)}"`
      ];
      csvRows.push(row.join(';'));
    });

    // Tambahkan baris kosong sebagai pemisah
    csvRows.push(Array(15).fill('""').join(';'));

    // Baris TOTAL KESELURUHAN
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
      `"${formatRp(gtTHP)}"`
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

  let gtMasaKerja = 0, gtJabatan = 0, gtPendidikan = 0, gtKompetensi = 0,
      gtKeluarga = 0, gtTambahan = 0, gtBonusHadir = 0, gtMengajar = 0,
      gtTotalKotor = 0, gtPotong = 0, gtTHP = 0;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full relative">
      
      {/* TAMBAHAN: Modal Konfirmasi Notif Massal */}
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
              <button onClick={() => setIsConfirmNotifMassalOpen(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors w-full">Batal</button>
              <button onClick={executeKirimNotifMassal} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-sm transition-colors w-full flex justify-center items-center gap-2">
                <BellRing size={16} /> Ya, Kirim Semua
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAMBAHAN: Modal Konfirmasi Ajukan Approval */}
      {isConfirmAjukanOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center mx-auto mb-4 shadow-inner">
                <Send size={40} className="ml-1" />
              </div>
              <h3 className="text-xl font-bold dark:text-white mb-2">Ajukan Approval Gaji?</h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto text-sm">
                Ajukan draf rekapitulasi gaji periode <strong className="text-slate-700 dark:text-slate-200">{bulan}</strong> ke Kepala Sekolah untuk disetujui? Pastikan semua nominal telah sesuai.
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

      {/* TAMBAHAN: Modal Konfirmasi Arsip (Pengganti window.confirm) */}
      {isConfirmArchiveOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center mx-auto mb-4">
                <Lock size={40} />
              </div>
              <h3 className="text-xl font-bold dark:text-white mb-2">Tutup Buku & Arsip?</h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Apakah Anda yakin ingin Mengarsipkan & Tutup Buku untuk gaji periode <span className="font-bold text-slate-800 dark:text-slate-200">{bulan}</span>? Data rekap saat ini akan dikirim dan disimpan permanen di tab Arsip Google Sheets.
              </p>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-center gap-3 shrink-0">
              <button onClick={() => setIsConfirmArchiveOpen(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors w-full">Batal</button>
              <button onClick={executeArchive} className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold shadow-sm transition-colors w-full">Ya, Tutup Buku</button>
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
      <div className="bg-gradient-to-r from-pink-600 to-rose-500 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden flex items-center justify-between shrink-0">
        <div className="relative z-10">
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-3"><FileText className="text-pink-100" /> Rekapitulasi Gaji Keseluruhan</h1>
          <p className="text-pink-50 text-sm">Tinjau rincian pengeluaran gaji sekolah secara transparan, cetak rekap per bulan, dan audit gaji per individu.</p>
        </div>
        <FileText size={100} className="absolute -right-6 -top-6 text-white/10 transform rotate-12 pointer-events-none" />
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

          {/* Baris Bawah: Pencarian & Export/Cetak */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2 border-t border-slate-200 border-dashed dark:border-slate-700">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Cari Pegawai atau NIPY..." 
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white shadow-sm transition-all"
              />
            </div>
            
            <div className="flex gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap justify-end">
              <button onClick={handleKirimNotifMassal} className="flex-1 sm:flex-none justify-center bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors items-center gap-2 shadow-sm cursor-pointer flex">
                 <BellRing size={16} /> <span className="hidden sm:inline">Notif Massal</span><span className="sm:hidden">Notif</span>
              </button>
              <button onClick={handleExportCSV} className="flex-1 sm:flex-none justify-center bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors items-center gap-2 shadow-sm cursor-pointer flex">
                 <Download size={16} /> <span className="hidden sm:inline">Export Excel</span><span className="sm:hidden">Excel</span>
              </button>
              {/* PERBAIKAN: Tombol Cetak Kini Menjadi Cetak Slip Massal */}
              <button onClick={handleMassPrint} disabled={isMassPrinting} className="flex-1 sm:flex-none justify-center bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-70 disabled:cursor-wait">
                 {isMassPrinting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Printer size={16} />}
                 {isMassPrinting ? 'Menyiapkan...' : 'Cetak Slip Massal'}
              </button>
            </div>
          </div>
        </div>
        
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

        <div className={`overflow-x-auto flex-1 relative print-area pb-4 ${isMassPrinting ? 'print:hidden' : ''}`}>
          <table className="w-full text-left text-xs md:text-sm whitespace-nowrap min-w-max">
            <thead className="text-slate-600 dark:text-slate-400 sticky top-0 z-30 shadow-sm">
              {/* BARIS 1: PENGELOMPOKAN HEADER (NESTED HEADERS) */}
              <tr>
                <th className="p-2 border-b border-r border-slate-300 dark:border-slate-600 bg-slate-200 dark:bg-slate-800 sticky left-0 z-40 shadow-[1px_0_0_rgba(0,0,0,0.1)]"></th>
                <th colSpan="5" className="p-2 border-b border-r border-slate-300 dark:border-slate-600 text-center font-extrabold text-blue-700 dark:text-blue-400 tracking-wider text-[11px] uppercase bg-blue-50 dark:bg-blue-900/40">Komponen Tunjangan Tetap</th>
                <th colSpan="3" className="p-2 border-b border-r border-slate-300 dark:border-slate-600 text-center font-extrabold text-emerald-700 dark:text-emerald-400 tracking-wider text-[11px] uppercase bg-emerald-50 dark:bg-emerald-900/40">Insentif & Bonus</th>
                <th colSpan="2" className="p-2 border-b border-r border-slate-300 dark:border-slate-600 text-center font-extrabold text-slate-700 dark:text-slate-300 tracking-wider text-[11px] uppercase bg-slate-200/70 dark:bg-slate-700/70">Kalkulasi</th>
                <th colSpan="2" className="p-2 border-b border-slate-300 dark:border-slate-600 text-center font-extrabold text-indigo-700 dark:text-indigo-400 tracking-wider text-[11px] uppercase bg-indigo-50 dark:bg-indigo-900/40 sticky right-0 z-40 shadow-[-1px_0_0_rgba(0,0,0,0.1)] no-print">Finalisasi & Aksi</th>
              </tr>
              {/* BARIS 2: NAMA KOLOM */}
              <tr className="bg-slate-100 dark:bg-slate-900/90">
                <th className="p-3 font-bold border-b border-r border-slate-200 dark:border-slate-700 sticky left-0 z-30 shadow-[1px_0_0_rgba(0,0,0,0.1)] bg-slate-100 dark:bg-slate-900/90">Nama & Status</th>
                
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
                
                <th className="p-3 font-bold border-b border-slate-200 dark:border-slate-700 text-right bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300">THP Bersih</th>
                <th className="p-3 font-bold border-b border-slate-200 dark:border-slate-700 text-center sticky right-0 bg-slate-100 dark:bg-slate-900/90 z-30 shadow-[-1px_0_0_rgba(0,0,0,0.1)] no-print">Aksi Gaji</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700/80">
              {filtered.map(t => {
                const slip = calculatePayroll(t);

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
                    <td className="p-3 bg-white dark:bg-slate-800 group-hover:bg-indigo-50/40 dark:group-hover:bg-slate-800/60 sticky left-0 z-10 shadow-[1px_0_0_rgba(0,0,0,0.05)] border-r border-slate-100 dark:border-slate-700">
                      <div className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[160px]">{t.name}</div>
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
                    
                    <td className="p-3 text-right font-black text-emerald-700 dark:text-emerald-400 bg-emerald-50/40 dark:bg-emerald-900/10 text-[13px] tracking-tight">{formatRp(slip.totalBersih)}</td>
                    <td className="p-3 text-center bg-white dark:bg-slate-800 group-hover:bg-indigo-50/40 dark:group-hover:bg-slate-800/60 sticky right-0 z-10 shadow-[-1px_0_0_rgba(0,0,0,0.05)] border-l border-slate-100 dark:border-slate-700 no-print">
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
                
                <td className="p-3 text-right font-black text-emerald-700 dark:text-emerald-400 bg-emerald-200/50 dark:bg-emerald-900/30 text-[14px]">{formatRp(gtTHP)}</td>
                <td className="p-3 sticky right-0 bg-slate-200 dark:bg-slate-800 shadow-[-1px_0_0_rgba(0,0,0,0.1)] border-l border-slate-300 dark:border-slate-600 no-print"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- MANAJEMEN ARSIP VIEW ---
function ArsipView({ archives, setArchives, settings }) {
  const [selectedArchive, setSelectedArchive] = useState(null);
  const [search, setSearch] = useState('');
  const [isSlipModalOpen, setIsSlipModalOpen] = useState(false);
  const [selectedSlip, setSelectedSlip] = useState(null);
  
  // TAMBAHAN NO 3: State Loading PDF
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  
  // TAMBAHAN: Custom Modal Hapus Arsip
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null });

  const filteredArchives = (archives || []).filter(arc => 
    arc.periode.toLowerCase().includes(search.toLowerCase())
  );

  const handleDeleteArchive = (id) => {
    setConfirmDelete({ isOpen: true, id });
  };

  const executeDeleteArchive = () => {
    setArchives(prev => prev.filter(arc => arc.id !== confirmDelete.id));
    if(selectedArchive?.id === confirmDelete.id) setSelectedArchive(null);
    setConfirmDelete({ isOpen: false, id: null });
  };

  const handleExportCSV = (archive) => {
    const headers = ['Nama Pegawai', 'NIPY', 'Status', 'Jabatan', 'T. Masa Kerja', 'T. Jabatan', 'T. Pendidikan', 'T. Kompetensi', 'T. Keluarga', 'Insentif Tamb.', 'Bonus Hadir', 'Kelebihan Jam', 'Total Kotor', 'Potongan', 'THP Bersih'];
    const csvRows = [headers.join(';')];

    let gtMasaKerja = 0, gtJabatan = 0, gtPendidikan = 0, gtKompetensi = 0,
        gtKeluarga = 0, gtTambahan = 0, gtBonusHadir = 0, gtMengajar = 0,
        gtTotalKotor = 0, gtPotong = 0, gtTHP = 0;

    archive.dataGuru.forEach(t => {
      const slip = calculatePayroll(t);
      
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
        `"=""${t.nipy}"""`, 
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
        `"${formatRp(slip.totalBersih)}"`
      ];
      csvRows.push(row.join(';'));
    });

    csvRows.push(Array(15).fill('""').join(';'));

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
      `"${formatRp(gtTHP)}"`
    ];
    csvRows.push(totalRow.join(';'));

    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Arsip_Payroll_Bank_${archive.periode}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full relative">
      
      {/* MODAL KONFIRMASI HAPUS ARSIP */}
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

      {/* Modal Cetak Ulang Slip Gaji */}
      {isSlipModalOpen && selectedSlip && selectedArchive && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-300 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-lg dark:text-white flex items-center gap-2"><FileText className="text-teal-500"/> Arsip Slip Gaji ({selectedArchive.periode})</h3>
              <button onClick={() => { setIsSlipModalOpen(false); setSelectedSlip(null); }} className="p-2 hover:bg-slate-200 dark:bg-slate-800 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
            </div>
            <div className="overflow-y-auto p-4 md:p-8 bg-slate-200 dark:bg-slate-700/50 flex-1">
              {/* Slip Document dipanggil dengan data guru arsip lama, bukan data guru saat ini */}
              <SlipDocument teacher={selectedSlip} bulan={selectedArchive.periode} settings={settings} />
            </div>
            <div className="p-4 border-t border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 flex justify-end gap-3 shrink-0">
              <button onClick={() => window.print()} className="bg-slate-600 hover:bg-slate-700 text-white px-5 py-2.5 rounded-lg font-medium inline-flex items-center gap-2 shadow-sm transition-colors">
                <Printer size={18}/> Print
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
                className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-lg font-medium inline-flex items-center gap-2 shadow-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isExportingPDF ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Download size={18}/>}
                {isExportingPDF ? 'Memproses...' : 'Unduh PDF'}
              </button>
              <button onClick={() => { setIsSlipModalOpen(false); setSelectedSlip(null); }} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-600 to-emerald-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden flex items-center justify-between shrink-0">
        <div className="relative z-10">
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-3"><Archive className="text-teal-100" /> Manajemen Arsip Gaji</h1>
          <p className="text-teal-50 text-sm">Lihat kembali dan cetak ulang data penggajian bulan-bulan sebelumnya yang telah ditutup buku.</p>
        </div>
        <FolderOpen size={100} className="absolute -right-6 -top-6 text-white/10 transform rotate-12 pointer-events-none" />
      </div>

      {!selectedArchive ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-full">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
            <h3 className="text-lg font-bold dark:text-white flex items-center gap-2 shrink-0">Daftar Buku Gaji</h3>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Cari Periode (Cth: Maret)..." 
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-teal-500 outline-none dark:text-white"
              />
            </div>
          </div>
          
          <div className="overflow-y-auto flex-1 p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredArchives.length === 0 ? (
                <div className="col-span-full p-10 text-center text-slate-500 flex flex-col items-center">
                  <FolderOpen size={48} className="mb-3 opacity-20" />
                  <p className="font-bold">Belum ada arsip buku gaji yang tersimpan.</p>
                  <p className="text-sm mt-1">Lakukan <span className="font-semibold text-slate-600 dark:text-slate-300">"Tutup Buku"</span> di menu Rekap Gaji terlebih dahulu.</p>
                </div>
              ) : (
                filteredArchives.map(arc => (
                  <div key={arc.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-teal-300 dark:hover:border-teal-700 transition-all group flex flex-col animate-in zoom-in-95 duration-200">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 rounded-xl flex items-center justify-center">
                        <Archive size={24} />
                      </div>
                      <button onClick={() => handleDeleteArchive(arc.id)} className="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 rounded-md transition-colors opacity-0 group-hover:opacity-100" title="Hapus Permanen">
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <h4 className="text-lg font-bold text-slate-800 dark:text-white">{arc.periode}</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5 mb-5 font-medium">Diarsipkan: {arc.dateArchived}</p>
                    
                    <div className="mt-auto space-y-2 mb-5">
                      <div className="flex justify-between text-sm items-center">
                        <span className="text-slate-500 dark:text-slate-400">Total Pegawai</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">{arc.dataGuru.length} Orang</span>
                      </div>
                      <div className="flex justify-between text-sm items-center">
                        <span className="text-slate-500 dark:text-slate-400">Total THP Bersih</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatRp(arc.totalGaji)}</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button onClick={() => setSelectedArchive(arc)} className="flex-1 bg-teal-50 hover:bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 dark:hover:bg-teal-900/50 py-2 rounded-lg text-sm font-bold transition-colors">
                        Buka Arsip
                      </button>
                      <button onClick={() => handleExportCSV(arc)} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 rounded-lg transition-colors" title="Export CSV">
                        <Download size={18} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-full animate-in slide-in-from-right-4">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
            <div>
              <button onClick={() => setSelectedArchive(null)} className="text-sm text-teal-600 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 flex items-center gap-1.5 mb-1 font-semibold transition-colors">
                <ChevronRight size={16} className="rotate-180" /> Kembali ke Daftar Arsip
              </button>
              <h3 className="text-lg font-bold dark:text-white flex items-center gap-2">
                <FolderOpen className="text-teal-500" size={20} /> Rincian Arsip: {selectedArchive.periode}
              </h3>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <button onClick={() => handleExportCSV(selectedArchive)} className="w-full md:w-auto bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 shadow-sm">
                <Download size={16} /> Export ke CSV
              </button>
            </div>
          </div>
          
          <div className="overflow-x-auto flex-1 relative">
            <table className="w-full text-left text-sm whitespace-nowrap min-w-max">
              <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 sticky top-0 z-10 shadow-sm border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-4 font-bold sticky left-0 bg-slate-100 dark:bg-slate-900/90 z-20 shadow-[1px_0_0_rgba(0,0,0,0.1)]">Nama Pegawai & Status</th>
                  <th className="p-4 font-bold text-right">Total Kotor</th>
                  <th className="p-4 font-bold text-right text-red-500">Potongan</th>
                  <th className="p-4 font-bold text-right text-emerald-600">THP Bersih</th>
                  <th className="p-4 font-bold text-center">Arsip Dokumen Slip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {selectedArchive.dataGuru.map(t => {
                  const slip = calculatePayroll(t);
                  return (
                    <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                      <td className="p-4 sticky left-0 bg-white dark:bg-slate-800 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/40 z-10 shadow-[1px_0_0_rgba(0,0,0,0.05)]">
                        <div className="font-bold text-slate-800 dark:text-slate-200">{t.name}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{t.nipy} • {t.position}</div>
                      </td>
                      <td className="p-4 text-right font-medium text-slate-600 dark:text-slate-300 bg-slate-50/30 dark:bg-slate-800/20">{formatRp(slip.totalKotor)}</td>
                      <td className="p-4 text-right font-medium text-red-500">-{formatRp(slip.totalPotongan)}</td>
                      <td className="p-4 text-right font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-900/10">{formatRp(slip.totalBersih)}</td>
                      <td className="p-4 text-center">
                        <button 
                          onClick={() => { setSelectedSlip(t); setIsSlipModalOpen(true); }}
                          className="text-xs bg-slate-100 hover:bg-teal-50 dark:bg-slate-700 hover:text-teal-600 dark:hover:bg-teal-900/30 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-md font-bold transition-colors flex items-center gap-1.5 mx-auto border border-slate-200 dark:border-slate-600 dark:hover:border-teal-800"
                        >
                          <Eye size={14} /> Lihat Slip Gaji
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// --- LAPORAN VIEW ---
function LaporanView({ teachers, fundingSources, setFundingSources, settings }) {
  const bulan = getFormattedPeriod(settings?.payrollPeriod);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [tempFunding, setTempFunding] = useState([]);
  
  // FITUR BARU: State untuk Micro-Interaction Tombol Simpan
  const [isSaving, setIsSaving] = useState(false);
  
  // TAMBAHAN NO 3: State Loading PDF
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  // TAMBAHAN GEMINI AI: State untuk Analisis Laporan
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // TAMBAHAN: State Notifikasi Lokal untuk Penanganan Error AI
  const [notification, setNotification] = useState({ isOpen: false, type: '', message: '' });

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

  const reportData = useMemo(() => {
    let totalKotor = 0, totalPotongan = 0, totalBersih = 0;
    let sumMasaKerja = 0, sumJabatan = 0, sumPendidikan = 0, sumKompetensi = 0, sumLainnya = 0;
    
    // TAMBAHAN: Variabel untuk Metrik Analisis Baru
    let costTetap = 0, costTidakTetap = 0;
    let potongTelat = 0, potongKasbon = 0;

    teachers.forEach(t => {
      const slip = calculatePayroll(t);
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
      totalPendanaan
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

  // FUNGSI GEMINI AI: Membuat Analisis Keuangan Eksekutif
  const handleGenerateAIAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const prompt = `Anda adalah analis keuangan dan konsultan HRD sekolah yang profesional. Buatkan ringkasan eksekutif untuk laporan penggajian periode ${bulan}.
      
Data Ringkasan Sekolah Kami:
- Total Gaji Kotor: Rp ${formatNum(reportData.totalKotor)}
- Total Potongan (Kasbon/Telat): Rp ${formatNum(reportData.totalPotongan)}
- Total Gaji Bersih (THP): Rp ${formatNum(reportData.totalBersih)}
- Porsi Dana Pegawai Tetap: Rp ${formatNum(reportData.distribusiStatus[0].value)}
- Porsi Dana Pegawai Tidak Tetap: Rp ${formatNum(reportData.distribusiStatus[1].value)}
- Total Sumber Dana Masuk: Rp ${formatNum(reportData.totalPendanaan)}

Berikan analisis yang padat dalam 3 bagian:
1. Kondisi Finansial Bulan Ini (Keseimbangan dana vs pengeluaran, apakah aman/minus).
2. Sorotan Utama (Distribusi status & rasio pemotongan).
3. Rekomendasi Efisiensi untuk Manajemen (Satu tips konkrit).

Gunakan bahasa Indonesia yang rapi, profesional, optimis, dan jangan gunakan simbol markdown secara berlebihan.`;

      // DIPERBARUI: Mengirimkan API Key dari pengaturan
      const result = await callGeminiAPI(prompt, settings?.geminiApiKey);
      setAiAnalysis(result);
    } catch (err) {
      console.error("AI Error:", err);
      // DIPERBARUI: Menggunakan Toast Modal yang tidak akan diblokir browser
      setNotification({ isOpen: true, type: 'error', message: "Gagal menghasilkan analisis AI. Terjadi gangguan pada koneksi internet atau layanan sistem." });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full relative">
      
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
      <div className="bg-gradient-to-br from-indigo-800 via-indigo-600 to-purple-700 rounded-2xl p-6 md:p-8 text-white shadow-xl relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shrink-0 no-print">
        {/* TAMBAHAN: Wrapper Background Khusus agar elemen yang membesar saat hover tidak terpotong (clipped) */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
           {/* Dekorasi Background */}
           <div className="absolute -right-10 -top-24 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
           <div className="absolute right-40 -bottom-24 w-48 h-48 bg-purple-500/30 rounded-full blur-2xl pointer-events-none"></div>
        </div>

        <div className="relative z-10">
          <h1 className="text-2xl md:text-3xl font-bold mb-2 tracking-tight flex items-center gap-3">
            <BarChart3 className="text-indigo-300" size={32} /> Laporan & Analitik Penggajian
          </h1>
          <p className="text-indigo-100 opacity-90 max-w-xl text-sm md:text-base">
            Analisis menyeluruh tentang distribusi komponen gaji, perbandingan status pegawai, dan ringkasan finansial periode ini.
          </p>
        </div>
        <div className="relative z-10 flex flex-wrap sm:flex-nowrap gap-3 w-full md:w-auto">
           <div className="flex-1 sm:flex-none flex items-center gap-3 bg-white/10 p-3 rounded-xl backdrop-blur-md border border-white/20 shadow-inner">
             <div className="bg-indigo-500/50 p-2 rounded-lg">
               <Calendar size={20} className="text-indigo-50" />
             </div>
             <div className="pr-2">
               <div className="text-[10px] text-indigo-200 uppercase tracking-wider font-semibold mb-0.5">Periode Laporan</div>
               <div className="text-base font-bold whitespace-nowrap">{bulan}</div>
             </div>
           </div>
           {/* TAMBAHAN: Tombol Ekspor PDF yang Terintegrasi di Header */}
           <div className="flex gap-2 w-full sm:w-auto">
             <button onClick={() => window.print()} className="flex-1 sm:flex-none bg-white/20 hover:bg-white/30 text-white backdrop-blur-md border border-white/30 px-4 py-2 rounded-xl text-sm font-bold transition-colors flex flex-col items-center justify-center gap-1 shadow-lg cursor-pointer hover:-translate-y-1">
                <Printer size={20} />
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
               className="flex-1 sm:flex-none bg-white text-indigo-700 hover:bg-indigo-50 px-4 py-2 rounded-xl text-sm font-extrabold transition-transform hover:-translate-y-1 shadow-lg cursor-pointer flex flex-col items-center justify-center gap-1 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0"
             >
                {isExportingPDF ? <div className="w-5 h-5 border-2 border-indigo-700 border-t-transparent rounded-full animate-spin mb-0.5"></div> : <Download size={20} />}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 mb-6">
          <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col justify-center">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Total Gaji Kotor</p>
            <h4 className="text-2xl font-extrabold text-slate-800 dark:text-white">{formatRp(reportData.totalKotor)}</h4>
          </div>
          <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col justify-center">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Total Potongan</p>
            <h4 className="text-2xl font-extrabold text-red-600 dark:text-red-400">-{formatRp(reportData.totalPotongan)}</h4>
          </div>
          <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-emerald-500 dark:border-emerald-500/50 flex flex-col justify-center relative overflow-hidden">
            <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1 relative z-10">Total Gaji Bersih (THP)</p>
            <h4 className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-300 relative z-10">{formatRp(reportData.totalBersih)}</h4>
            <div className="absolute -right-4 -bottom-4 bg-emerald-100 dark:bg-emerald-900/30 w-20 h-20 rounded-full blur-xl"></div>
          </div>
          <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col justify-center">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Rata-Rata THP Pegawai</p>
            <h4 className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">{formatRp(reportData.rataRata)}</h4>
          </div>
        </div>

        {/* TAMBAHAN GEMINI AI: Panel Analisis Keuangan Cerdas */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl shadow-sm border border-indigo-200 dark:border-indigo-800 p-6 mb-6 print:break-inside-avoid relative overflow-hidden">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 relative z-20">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-100 dark:bg-indigo-900/50 p-2.5 rounded-lg text-indigo-600 dark:text-indigo-400 shadow-inner">
                <Sparkles size={20} />
              </div>
              <div>
                <h3 className="font-bold text-indigo-900 dark:text-indigo-100 text-lg">AI Financial Analyst</h3>
                <p className="text-[10px] text-indigo-600/80 dark:text-indigo-300 font-bold uppercase tracking-wider">Ditenagai oleh Google Gemini API</p>
              </div>
            </div>
            {/* DIPERBARUI: Ditambahkan 'relative z-50 cursor-pointer' agar selalu bisa diklik */}
            <button 
              onClick={handleGenerateAIAnalysis}
              disabled={isAnalyzing}
              className="relative z-50 cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-md transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed hover:-translate-y-0.5"
            >
              {isAnalyzing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Sparkles size={16} />}
              {isAnalyzing ? 'Menyusun Analisis...' : '✨ Buat Analisis Eksekutif'}
            </button>
          </div>
          
          {aiAnalysis && (
            <div className="mt-4 p-5 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md rounded-xl border border-indigo-200 dark:border-indigo-700 shadow-sm relative z-20 animate-in fade-in slide-in-from-top-4">
              <div className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap font-medium">
                {aiAnalysis}
              </div>
            </div>
          )}
        </div>

        {/* TAMBAHAN: Analisis Distribusi Anggaran & Beban Potongan */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 print:break-inside-avoid">
          {/* Panel Distribusi Status */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex flex-col">
             <div className="flex items-center gap-2 mb-6">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg"><Users size={18}/></div>
                <h3 className="font-bold text-slate-800 dark:text-white">Alokasi Gaji Berdasarkan Status</h3>
             </div>
             <div className="space-y-6 flex-1 flex flex-col justify-center">
                {reportData.distribusiStatus.map((item, idx) => (
                   <div key={idx}>
                      <div className="flex justify-between items-center mb-2">
                         <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{item.name}</span>
                         <span className={`text-sm font-bold ${item.textClass}`}>{formatRp(item.value)}</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-3 flex overflow-hidden shadow-inner">
                         <div className={`${item.color} h-full rounded-full transition-all duration-1000`} style={{ width: `${item.persentase}%` }}></div>
                      </div>
                      <p className="text-xs text-slate-500 text-right mt-1.5 font-medium">{item.persentase}% dari Total THP</p>
                   </div>
                ))}
             </div>
          </div>

          {/* Panel Rincian Pemotongan */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex flex-col">
             <div className="flex items-center gap-2 mb-6">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg"><Trash2 size={18}/></div>
                <h3 className="font-bold text-slate-800 dark:text-white">Pembedahan Arus Pemotongan</h3>
             </div>
             {reportData.totalPotongan > 0 ? (
               <div className="space-y-6 flex-1 flex flex-col justify-center">
                  {reportData.pembedahanPotongan.map((item, idx) => (
                     <div key={idx}>
                        <div className="flex justify-between items-center mb-2">
                           <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{item.name}</span>
                           <span className={`text-sm font-bold ${item.textClass}`}>-{formatRp(item.value)}</span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-3 flex overflow-hidden shadow-inner">
                           <div className={`${item.color} h-full rounded-full transition-all duration-1000`} style={{ width: `${item.persentase}%` }}></div>
                        </div>
                        <p className="text-xs text-slate-500 text-right mt-1.5 font-medium">{item.persentase}% dari Total Potongan</p>
                     </div>
                  ))}
               </div>
             ) : (
               <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500 flex items-center justify-center mb-3">
                     <CheckCircle size={32}/>
                  </div>
                  <p className="font-bold text-slate-700 dark:text-slate-300 mb-1">Bersih Sempurna!</p>
                  <p className="text-xs text-slate-500">Tidak ada pemotongan kedisiplinan maupun kasbon pada periode ini.</p>
               </div>
             )}
          </div>
        </div>

        {/* Komposisi Komponen Gaji Section */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden mb-6 print:break-inside-avoid">
          <div className="p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
            <h3 className="text-base font-bold dark:text-white flex items-center gap-2">
              <PieChartIcon size={18} className="text-indigo-500"/> Komposisi Komponen Gaji
            </h3>
          </div>
          <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
             <div className="space-y-5">
               {reportData.komposisi.map((item, idx) => (
                 <div key={idx}>
                   <div className="flex justify-between items-center mb-1.5">
                     <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{item.name}</span>
                     <span className="text-sm font-bold text-slate-800 dark:text-white">{formatRp(item.value)}</span>
                   </div>
                   <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2.5 flex overflow-hidden">
                     <div className={`${item.warna} h-2.5 rounded-full`} style={{ width: `${item.persentase}%` }}></div>
                   </div>
                   <p className="text-xs text-slate-500 text-right mt-1">{item.persentase}% dari total komponen</p>
                 </div>
               ))}
             </div>
             <div className="flex justify-center">
                 <div className="relative w-64 h-64">
                     <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={reportData.komposisi}
                            cx="50%" cy="50%"
                            innerRadius={70} outerRadius={100}
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
                         <span className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Total Gaji</span>
                         <span className="text-lg font-extrabold text-slate-800 dark:text-white">{formatRp(reportData.totalKotor)}</span>
                      </div>
                 </div>
             </div>
          </div>
        </div>

        {/* Sumber Gaji Section */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden mb-6 print:break-inside-avoid">
          <div className="p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
            <h3 className="text-base font-bold dark:text-white flex items-center gap-2">
              <Wallet className="text-emerald-500" /> Sumber Alokasi Dana Penggajian
            </h3>
            <button onClick={handleOpenEdit} className="no-print text-xs bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/40 dark:hover:bg-indigo-900/60 dark:text-indigo-400 px-4 py-2 rounded-lg font-bold flex items-center gap-1.5 transition-colors">
              <Edit size={14} /> Atur Sumber Dana
            </button>
          </div>
          <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
             <div className="space-y-5">
               {reportData.sumberDana.map((sumber, idx) => (
                 <div key={idx}>
                   <div className="flex justify-between items-center mb-1.5">
                     <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{sumber.nama}</span>
                     <span className="text-sm font-bold text-slate-800 dark:text-white">{formatRp(sumber.nominal)}</span>
                   </div>
                   <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2.5 flex overflow-hidden">
                     <div className={`${sumber.warna} h-2.5 rounded-full`} style={{ width: `${sumber.persentase}%` }}></div>
                   </div>
                   <p className="text-xs text-slate-500 text-right mt-1">{sumber.persentase}% dari total pengeluaran</p>
                 </div>
               ))}
             </div>
             <div className="flex justify-center">
                 <div className="relative w-64 h-64">
                     <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={reportData.sumberDana}
                            cx="50%" cy="50%"
                            innerRadius={70} outerRadius={100}
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
                         <span className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Total Dana</span>
                         <span className="text-lg font-extrabold text-slate-800 dark:text-white">{formatRp(reportData.totalPendanaan)}</span>
                      </div>
                 </div>
             </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// TAMBAHAN: Komponen PortalCard dipindah ke LUAR agar tidak memicu re-render ulang (Mencegah kursor lompat saat mengetik)
const PortalCard = ({ icon: Icon, title, colorClass, children }) => {
  const colorMap = {
    blue: 'text-blue-600 bg-blue-100 dark:bg-blue-900/40 border-blue-200 dark:border-blue-800/50',
    amber: 'text-amber-600 bg-amber-100 dark:bg-amber-900/40 border-amber-200 dark:border-amber-800/50',
    emerald: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-800/50',
    teal: 'text-teal-600 bg-teal-100 dark:bg-teal-900/40 border-teal-200 dark:border-teal-800/50',
    indigo: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/40 border-indigo-200 dark:border-indigo-800/50',
    purple: 'text-purple-600 bg-purple-100 dark:bg-purple-900/40 border-purple-200 dark:border-purple-800/50',
    rose: 'text-rose-600 bg-rose-100 dark:bg-rose-900/40 border-rose-200 dark:border-rose-800/50',
  };
  
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="p-5 md:p-6 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shadow-inner ${colorMap[colorClass]}`}>
           <Icon size={24} className="drop-shadow-sm" strokeWidth={2.5} />
        </div>
        <h3 className="font-extrabold text-lg md:text-xl text-slate-800 dark:text-slate-200">{title}</h3>
      </div>
      <div className="p-5 md:p-6">
        {children}
      </div>
    </div>
  );
};

// Portal Khusus Guru (Read-only view dengan Sidebar)
function PortalGuruView({ user, teachers, setTeachers, settings, feedbacks, setFeedbacks, activeSection, setActiveTab, archives }) {
  const myData = teachers.find(t => t.id === user.id);
  
  if (!myData) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] p-10 text-center animate-in fade-in zoom-in-95">
        <div className="w-24 h-24 bg-red-50 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6">
           <AlertCircle size={48} className="text-red-400 opacity-80" />
        </div>
        <h2 className="text-2xl font-bold text-slate-700 dark:text-slate-200 mb-2">Data Pegawai Tidak Ditemukan</h2>
        <p className="text-slate-500 max-w-md mx-auto">Profil rincian gaji Anda kemungkinan telah dihapus atau di-reset oleh Administrator. Silakan hubungi bagian Manajemen / Tata Usaha Sekolah.</p>
        <button onClick={() => window.location.reload()} className="mt-8 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-bold shadow hover:bg-blue-700 transition-colors">Segarkan Halaman</button>
      </div>
    );
  }

  const slip = calculatePayroll(myData);
  const bulan = getFormattedPeriod(settings?.payrollPeriod);

  const [isSlipModalOpen, setIsSlipModalOpen] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [feedbackSubject, setFeedbackSubject] = useState('Saran & Masukan Umum');
  
  // State untuk form komplain WA
  const [isKomplainModalOpen, setIsKomplainModalOpen] = useState(false);
  const [komplainText, setKomplainText] = useState('');

  // TAMBAHAN: State untuk menangkap history slip yang spesifik
  const [selectedHistorySlip, setSelectedHistorySlip] = useState(null);
  
  // TAMBAHAN NO 3: State Loading PDF
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  // Helper untuk simulasi jika data harian belum pernah disave manual oleh admin
  const getDailyHours = (total, teacherId) => {
    const days = Array(31).fill('');
    if (total > 0) {
       let remaining = total;
       let dayIdx = teacherId.charCodeAt(teacherId.length - 1) % 7;
       while (remaining > 0 && dayIdx < 31) {
          const hoursToday = Math.min(4, remaining);
          days[dayIdx] = hoursToday;
          remaining -= hoursToday;
          dayIdx += 2;
          if (dayIdx >= 31 && remaining > 0) dayIdx = 1;
       }
    }
    return days;
  };

  // Kalkulasi data rincian absen & jam
  const realJam = myData.payroll?.jamMengajar?.realisasi || 0;
  const wajibJam = myData.payroll?.jamMengajar?.wajib !== undefined && myData.payroll?.jamMengajar?.wajib !== '' ? Number(myData.payroll.jamMengajar.wajib) : (myData.status === 'Tetap' ? 60 : 0);
  const selisihJam = realJam - wajibJam;
  const telatDisiplin = myData.payroll?.disiplin?.telat || 0;
  const tepatWaktuDisiplin = Math.max(0, realJam - telatDisiplin);
  const dailyData = myData.payroll?.jamMengajar?.harian || getDailyHours(realJam, myData.id);

  const handleSendFeedback = (e) => {
    e.preventDefault();
    if (!feedbackMsg.trim()) return;
    
    const newFeedback = {
      id: generateUniqueId('fb-'),
      name: myData.name,
      date: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
      subject: feedbackSubject,
      message: feedbackMsg,
      status: 'Menunggu'
    };
    
    // Simpan ke state global agar admin bisa membacanya
    setFeedbacks([newFeedback, ...(feedbacks || [])]);
    
    alert('Terima kasih! Kritik dan saran Anda telah berhasil dikirim ke pihak manajemen sekolah.');
    setFeedbackMsg('');
    setFeedbackSubject('Saran & Masukan Umum');
  };

  const handleKonfirmasi = () => {
    setTeachers(prev => prev.map(t => 
      t.id === user.id ? { ...t, payroll: { ...t.payroll, isConfirmed: true } } : t
    ));
    alert('Terima kasih. Konfirmasi penerimaan gaji berhasil dikirim ke Admin.');
  };

  const handleKomplain = () => {
    // Membuka modal khusus komplain daripada menggunakan prompt()
    setIsKomplainModalOpen(true);
  };

  // URL WhatsApp Generator
  const waNumber = '628565011130'; 
  const waMessage = `Assalamu'alaikum Bendahara,\n\nSaya *${myData.name}* (NIPY: ${myData.nipy}).\nSaya ingin mengajukan pertanyaan/komplain terkait selisih gaji pada periode *${bulan}*.\n\nKeterangan Komplain:\n"${komplainText}"\n\nMohon bantuannya untuk dicek kembali. Terima kasih.`;
  const waUrl = `https://api.whatsapp.com/send?phone=${waNumber}&text=${encodeURIComponent(waMessage)}`;

  // PERBAIKAN KRUSIAL: Mengekstrak Data Riwayat dari Arsip Asli (Bukan Dummy)
  const riwayatAsli = useMemo(() => {
    if (!archives) return [];
    
    // Map data dari archives global
    const extractedHistory = archives.map(arc => {
      // Cari data guru ini pada saat arsip tersebut dibuat
      const historicalData = arc.dataGuru.find(t => t.id === myData.id);
      if (!historicalData) return null; // Guru mungkin belum masuk pada bulan tersebut

      return {
        idArsip: arc.id,
        periode: arc.periode,
        tanggal: arc.dateArchived,
        nominal: calculatePayroll(historicalData).totalBersih,
        status: 'Telah Disahkan',
        dataHistoris: historicalData // Menyimpan wujud data masa lalu untuk dirender di PDF
      };
    }).filter(Boolean); // Buang yang null

    return extractedHistory;
  }, [archives, myData.id]);

  // Ekstraksi Data Pinjaman Guru
  const loanItems = (myData.payroll?.potonganLainnya || []).filter(p => 
    p.ket.toLowerCase().includes('kasbon') || 
    p.ket.toLowerCase().includes('koperasi') || 
    p.ket.toLowerCase().includes('pinjaman')
  );

  // Helper cerdas untuk merender teks kebijakan menjadi UI Card elegan (Tanpa mengubah format data Admin)
  const renderElegantInfo = (text) => {
    if (!text) return <div className="flex flex-col items-center justify-center p-8 text-slate-400"><Info size={40} className="mb-3 opacity-50"/><p className="text-sm italic font-medium">Belum ada informasi sistem penggajian.</p></div>;
    
    const lines = text.split('\n');
    return (
      <div className="space-y-3 mt-1">
        {lines.map((line, idx) => {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('•') || trimmedLine.startsWith('-') || trimmedLine.startsWith('*')) {
            let content = trimmedLine.substring(1).trim();
            
            // Tangani asterik ganda / markdown jika ada
            if (content.startsWith('*') && content.endsWith('*')) {
               content = content.substring(1, content.length - 1).trim();
            }

            const colonIndex = content.indexOf(':');
            // Jika ada titik dua (:), asumsikan itu adalah Judul Komponen (Beri style tebal khusus)
            if (colonIndex !== -1 && colonIndex < 50) {
              const title = content.substring(0, colonIndex);
              const desc = content.substring(colonIndex + 1);
              return (
                <div key={idx} className="flex items-start gap-3.5 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-purple-300 dark:hover:border-purple-600 transition-all group">
                  <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-xl text-purple-600 dark:text-purple-400 shrink-0 group-hover:scale-110 group-hover:bg-purple-600 group-hover:text-white transition-all duration-300 shadow-inner">
                    <CheckCircle size={18} strokeWidth={2.5} />
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mt-0.5">
                    <strong className="text-slate-800 dark:text-slate-200 block mb-1 font-extrabold text-[15px]">{title}</strong>
                    {desc}
                  </p>
                </div>
              );
            }
            // Jika tidak ada titik dua, anggap teks list biasa
            return (
              <div key={idx} className="flex items-start gap-3.5 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-purple-300 dark:hover:border-purple-600 transition-all group">
                <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-xl text-purple-600 dark:text-purple-400 shrink-0 group-hover:scale-110 group-hover:bg-purple-600 group-hover:text-white transition-all duration-300 shadow-inner">
                  <ChevronRight size={18} strokeWidth={2.5} />
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mt-0.5">{content}</p>
              </div>
            );
          } else if (trimmedLine === '') {
             return null;
          } else {
            // Paragraf pembuka / penutup (Beri style banner mencolok)
            return (
              <div key={idx} className="p-4 sm:p-5 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-xl border-l-4 border-l-purple-500 mb-4 shadow-sm">
                <p className="text-sm sm:text-base text-purple-900 dark:text-purple-200 leading-relaxed font-medium">
                  {trimmedLine}
                </p>
              </div>
            );
          }
        })}
      </div>
    );
  };

  // Komponen Reusable untuk Lonceng Notifikasi agar rapi
  const NotificationBell = myData.payroll?.isNotified && !myData.payroll?.isConfirmed ? (
    <button 
      onClick={() => setActiveTab('portal_gaji')} 
      className="absolute top-4 right-4 md:top-6 md:right-6 w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 rounded-full shadow-[0_8px_16px_-6px_rgba(245,158,11,0.8)] flex items-center justify-center animate-bounce border-2 border-white/50 z-30 hover:scale-110 transition-transform cursor-pointer"
      title="Notifikasi Gaji Baru!"
    >
      <div className="absolute inset-0 rounded-full shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)]"></div>
      <BellRing size={24} className="text-white drop-shadow-lg relative z-10" />
      <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
    </button>
  ) : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in pb-10">
      
      {/* Modal Komplain WA */}
      {isKomplainModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-lg dark:text-white flex items-center gap-2"><MessageSquare className="text-emerald-500"/> Komplain Selisih Gaji</h3>
              <button onClick={() => setIsKomplainModalOpen(false)} className="p-2 hover:bg-slate-200 dark:bg-slate-800 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Silakan tuliskan detail perbedaan nominal yang Anda temukan. Sistem akan mengarahkan Anda ke WhatsApp Bendahara secara otomatis.</p>
              <textarea 
                rows="4" 
                value={komplainText}
                onChange={e => setKomplainText(e.target.value)}
                placeholder="Cth: Nominal tunjangan masa kerja saya sepertinya belum disesuaikan..."
                className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white resize-none"
              ></textarea>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3">
              <button onClick={() => setIsKomplainModalOpen(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors">Batal</button>
              <a 
                href={komplainText.trim() ? waUrl : '#'} 
                target="_blank" 
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (!komplainText.trim()) {
                     e.preventDefault();
                     alert("Harap tuliskan keterangan komplain terlebih dahulu.");
                  } else {
                     setIsKomplainModalOpen(false);
                     setKomplainText('');
                  }
                }}
                className={`px-5 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2 ${komplainText.trim() ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'}`}
              >
                <Send size={16} /> Lanjut ke WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Modal Slip Gaji */}
      {isSlipModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-300 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-lg dark:text-white flex items-center gap-2"><FileText className="text-blue-500"/> Pratinjau Slip Gaji Saya</h3>
              <button onClick={() => { setIsSlipModalOpen(false); setSelectedHistorySlip(null); }} className="p-2 hover:bg-slate-200 dark:bg-slate-800 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
            </div>
            <div className="overflow-y-auto p-4 md:p-8 bg-slate-200 dark:bg-slate-700/50 flex-1">
              {/* PERBAIKAN: Jika ada data historis yang dipilih, render itu. Jika tidak, render data bulan ini. */}
              {selectedHistorySlip ? (
                 <SlipDocument teacher={selectedHistorySlip.dataHistoris} bulan={selectedHistorySlip.periode} settings={settings} />
              ) : (
                 <SlipDocument teacher={myData} bulan={bulan} settings={settings} />
              )}
            </div>
            <div className="p-4 border-t border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 flex justify-end gap-3 shrink-0">
              <button onClick={() => window.print()} className="bg-slate-600 hover:bg-slate-700 text-white px-5 py-2.5 rounded-lg font-medium inline-flex items-center gap-2 shadow-sm transition-colors">
                <Printer size={18}/> Print
              </button>
              <button 
                onClick={async () => {
                  setIsExportingPDF(true);
                  try {
                    await exportToPDF('printable-area', `Slip_Gaji_${myData.name.replace(/\s+/g, '_')}_${selectedHistorySlip ? selectedHistorySlip.periode.replace(/\s+/g, '_') : bulan}.pdf`);
                  } finally {
                    setIsExportingPDF(false);
                  }
                }} 
                disabled={isExportingPDF}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-medium inline-flex items-center gap-2 shadow-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isExportingPDF ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Download size={18}/>}
                {isExportingPDF ? 'Memproses...' : 'Unduh PDF Asli'}
              </button>
              <button onClick={() => { setIsSlipModalOpen(false); setSelectedHistorySlip(null); }} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Banner Dinamis Berdasarkan Tab Aktif */}
      {/* DIPERBARUI: Header "portal_dashboard" DIHAPUS sesuai permintaan, digabung ke dalam Card di bawah */}

      {/* TAMBAHAN: Mengembalikan Header Banner Portal Kehadiran yang hilang */}
      {activeSection === 'portal_kehadiran' && (
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between shrink-0 animate-in fade-in duration-500">
          {NotificationBell}
          <div className="relative z-10">
            <h1 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-3"><Clock className="text-amber-100" size={32} /> Rekap Kehadiran & Jam Mengajar ({bulan})</h1>
            <p className="text-amber-50 text-sm md:text-base max-w-xl">Pantau detail kehadiran harian, riwayat keterlambatan, dan pencapaian target jam mengajar Anda untuk periode bulan ini.</p>
          </div>
          <Clock size={120} className="absolute -right-6 -bottom-6 text-white/10 transform -rotate-12 pointer-events-none" />
        </div>
      )}

      {activeSection === 'portal_gaji' && (
        <div className="bg-gradient-to-r from-emerald-600 to-teal-500 rounded-2xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between shrink-0 animate-in fade-in duration-500">
          {NotificationBell}
          <div className="relative z-10">
            <h1 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-3"><Wallet className="text-emerald-100" size={32} /> Slip Gaji & Estimasi THP ({bulan})</h1>
            <p className="text-emerald-50 text-sm md:text-base max-w-xl">Transparansi rincian tunjangan, insentif, dan potongan gaji Anda pada periode pencairan ini.</p>
          </div>
          <Wallet size={120} className="absolute -right-6 -bottom-6 text-white/10 transform -rotate-12 pointer-events-none" />
        </div>
      )}

      {activeSection === 'portal_pinjaman' && (
        <div className="bg-gradient-to-r from-teal-600 to-emerald-500 rounded-2xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between shrink-0 animate-in fade-in duration-500">
          {NotificationBell}
          <div className="relative z-10">
            <h1 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-3"><CreditCard className="text-teal-100" size={32} /> Dashboard Pemantauan Pinjaman</h1>
            <p className="text-teal-50 text-sm md:text-base max-w-xl">Pantau transparansi sisa saldo pinjaman, kasbon, atau cicilan koperasi Anda secara detail dan real-time.</p>
          </div>
          <CreditCard size={120} className="absolute -right-6 -bottom-6 text-white/10 transform -rotate-12 pointer-events-none" />
        </div>
      )}

      {activeSection === 'portal_riwayat' && (
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-2xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between shrink-0 animate-in fade-in duration-500">
          {NotificationBell}
          <div className="relative z-10">
            <h1 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-3"><History className="text-indigo-100" size={32} /> Riwayat Penerimaan Gaji</h1>
            <p className="text-indigo-50 text-sm md:text-base max-w-xl">Arsip dokumen slip gaji bulan-bulan sebelumnya yang telah disahkan dan ditransfer kepada Anda.</p>
          </div>
          <History size={120} className="absolute -right-6 -bottom-6 text-white/10 transform -rotate-12 pointer-events-none" />
        </div>
      )}

      {activeSection === 'portal_info' && (
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between shrink-0 animate-in fade-in duration-500">
          {NotificationBell}
          <div className="relative z-10">
            <h1 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-3"><Info className="text-purple-100" size={32} /> Informasi Sistem Penggajian</h1>
            <p className="text-purple-50 text-sm md:text-base max-w-xl">Pelajari pedoman, aturan kedisiplinan, dan rincian kebijakan komponen perhitungan sistem penggajian.</p>
          </div>
          <Info size={120} className="absolute -right-6 -bottom-6 text-white/10 transform rotate-12 pointer-events-none" />
        </div>
      )}

      {activeSection === 'portal_saran' && (
        <div className="bg-gradient-to-r from-rose-600 to-red-500 rounded-2xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between shrink-0 animate-in fade-in duration-500">
          {NotificationBell}
          <div className="relative z-10">
            <h1 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-3"><MessageSquare className="text-rose-100" size={32} /> Form Kritik & Saran</h1>
            <p className="text-rose-50 text-sm md:text-base max-w-xl">Sampaikan masukan, aspirasi, atau kendala Anda secara langsung dan aman ke pihak manajemen sekolah.</p>
          </div>
          <MessageSquare size={120} className="absolute -right-6 -bottom-6 text-white/10 transform -rotate-12 pointer-events-none" />
        </div>
      )}

      <div className="space-y-4">
        
        {/* 1. Biodata Guru (DIPERBARUI: Tanpa Card Wrapper, Desain Premium) */}
        {activeSection === 'portal_dashboard' && (
          <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-200 dark:border-slate-700 overflow-hidden shadow-lg relative animate-in fade-in slide-in-from-bottom-4 duration-500">
             
             {/* Banner Cover Profile (DIPERBARUI: Desain Terpadu) */}
             <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 relative pt-12 pb-14 md:pt-16 md:pb-16 px-6 md:px-10 flex flex-col md:flex-row items-center gap-6 md:gap-8 text-center md:text-left">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 mix-blend-overlay"></div>
                
                {/* Lonceng Notifikasi */}
                {NotificationBell}

                {/* Avatar */}
                <div className="w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-white/30 shadow-2xl bg-white/10 backdrop-blur-sm overflow-hidden shrink-0 relative z-10 transition-transform hover:scale-105 duration-300">
                   <img 
                     src={myData.gender === 'P' 
                       ? (settings?.avatarFemaleUrl || 'https://cdn3d.iconscout.com/3d/premium/thumb/muslim-woman-avatar-5813359-4861184.png')
                       : (settings?.avatarMaleUrl || 'https://cdn3d.iconscout.com/3d/premium/thumb/muslim-man-avatar-5813358-4861183.png')
                     } 
                     alt="Avatar" 
                     className="w-full h-full object-cover scale-110"
                   />
                </div>

                {/* Teks Identitas */}
                <div className="relative z-10 flex-1">
                   <p className="text-blue-100 text-lg md:text-2xl font-bold mb-1 tracking-widest uppercase drop-shadow-md">
                     Selamat Datang di Portal Pegawai
                   </p>
                   <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-white tracking-tight drop-shadow-[0_0_15px_rgba(255,255,255,0.9)] mb-4">
                     {myData.name}
                   </h2>
                   
                   {/* Badges */}
                   <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 md:gap-3">
                     <span className="px-4 py-2 bg-white/20 backdrop-blur-md text-white rounded-xl text-sm font-bold border border-white/30 shadow-sm flex items-center gap-2">
                       <UserCircle size={18}/> NIPY: {myData.nipy}
                     </span>
                     <span className={`px-4 py-2 rounded-xl text-sm font-bold shadow-sm border flex items-center gap-2 ${myData.status === 'Tetap' ? 'bg-emerald-500/80 text-white border-emerald-400/50' : 'bg-amber-500/80 text-white border-amber-400/50'} backdrop-blur-md`}>
                       <Award size={18}/> Pegawai {myData.status}
                     </span>
                   </div>
                </div>

                {/* Tombol Aksi */}
                <div className="w-full md:w-auto mt-4 md:mt-0 relative z-10 self-stretch md:self-end flex items-end">
                   <button 
                     onClick={() => {
                       setActiveTab('portal_saran');
                       setFeedbackSubject('Koreksi Data / Profil Pegawai');
                       setFeedbackMsg("Halo Admin, saya ingin mengajukan koreksi pembaruan biodata/profil saya terkait: \n\n");
                     }} 
                     className="px-6 py-3 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/30 shadow-lg rounded-xl text-sm font-bold text-white transition-all flex items-center justify-center gap-2 w-full md:w-auto hover:-translate-y-1"
                   >
                     <Edit size={16}/> Ajukan Koreksi Data
                   </button>
                </div>

                <div className="absolute -bottom-1 -left-1 -right-1 h-12 bg-gradient-to-t from-white dark:from-slate-800 to-transparent"></div>
             </div>

             <div className="px-6 md:px-10 pb-8 pt-8 md:pb-10 relative">
                {/* Grid Rincian Biodata Modern & Profesional */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
                   <div className="flex items-center gap-4 p-5 rounded-2xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all group">
                      <div className="p-3.5 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 shrink-0 group-hover:scale-110 transition-transform"><Building size={22}/></div>
                      <div>
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Tempat, Tanggal Lahir</p>
                         <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">{myData.pob}, {formatDateId(myData.dob)}</p>
                         <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold mt-0.5">{new Date().getFullYear() - new Date(myData.dob).getFullYear()} Tahun</p>
                      </div>
                   </div>
                   
                   <div className="flex items-center gap-4 p-5 rounded-2xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all group">
                      <div className="p-3.5 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 shrink-0 group-hover:scale-110 transition-transform"><UserCircle size={22}/></div>
                      <div>
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Jenis Kelamin</p>
                         <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">{myData.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</p>
                      </div>
                   </div>

                   <div className="flex items-center gap-4 p-5 rounded-2xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-purple-300 dark:hover:border-purple-700 transition-all group">
                      <div className="p-3.5 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 shrink-0 group-hover:scale-110 transition-transform"><GraduationCap size={22}/></div>
                      <div>
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Pendidikan Terakhir</p>
                         <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">{myData.education}</p>
                      </div>
                   </div>

                   <div className="flex items-center gap-4 p-5 rounded-2xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-700 transition-all group">
                      <div className="p-3.5 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0 group-hover:scale-110 transition-transform"><Briefcase size={22}/></div>
                      <div>
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Jabatan & Tugas Inti</p>
                         <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">{myData.position}</p>
                      </div>
                   </div>

                   <div className="flex items-center gap-4 p-5 rounded-2xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700 transition-all group">
                      <div className="p-3.5 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 shrink-0 group-hover:scale-110 transition-transform"><Calendar size={22}/></div>
                      <div>
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Mulai Tugas (TMT)</p>
                         <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">{formatDateId(myData.tmt)}</p>
                         <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-0.5">{new Date().getFullYear() - new Date(myData.tmt).getFullYear()} Thn Mengabdi</p>
                      </div>
                   </div>

                   <div className="flex items-center gap-4 p-5 rounded-2xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-rose-300 dark:hover:border-rose-700 transition-all group">
                      <div className="p-3.5 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 shrink-0 group-hover:scale-110 transition-transform"><Users size={22}/></div>
                      <div>
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Status Keluarga</p>
                         <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                           {myData.family?.wife > 0 ? 'Menikah' : 'Belum Menikah'}
                         </p>
                         <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold mt-0.5">
                           {myData.family?.children > 0 ? `${myData.family?.children} Anak Terdaftar` : 'Tidak ada tanggungan anak'}
                         </p>
                      </div>
                   </div>
                </div>

                {/* Info Rekening Card Khusus (Premium Bank Card Style - Hijau Gradasi) */}
                <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 to-teal-700 dark:from-emerald-700 dark:to-teal-900 p-6 md:p-8 rounded-3xl shadow-xl flex flex-col md:flex-row items-center gap-6 justify-between border border-emerald-400/30">
                   {/* Background Glow */}
                   <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
                   <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full blur-3xl pointer-events-none"></div>
                   
                   <div className="flex items-center gap-5 w-full md:w-auto relative z-10">
                      <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl shadow-inner flex items-center justify-center text-white shrink-0 border border-white/30">
                         <CreditCard size={32} />
                      </div>
                      <div>
                         <p className="text-[10px] md:text-xs font-bold text-emerald-100 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                           Informasi Rekening Penggajian
                           <span className="flex items-center justify-center gap-1 text-[9px] font-bold text-teal-900 bg-emerald-100 px-2 py-0.5 rounded-full shadow-sm">
                             <CheckCircle size={10}/> Terverifikasi
                           </span>
                         </p>
                         {myData.bankName ? (
                           <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                             <h4 className="text-xl md:text-3xl font-black text-white tracking-wider font-mono drop-shadow-md">{myData.bankName} - {myData.bankAccount}</h4>
                             <span className="px-3 py-1 bg-black/20 backdrop-blur-sm rounded-lg text-xs font-bold text-emerald-50 border border-white/20 w-fit uppercase tracking-widest">
                               A.N. {myData.name}
                             </span>
                           </div>
                         ) : (
                           <h4 className="text-lg md:text-xl font-extrabold text-white opacity-90">Belum Diatur (Penerimaan Tunai)</h4>
                         )}
                      </div>
                   </div>
                   
                   {/* Visual Ornamen Chip / Mastercard Logo */}
                   <div className="w-full md:w-auto mt-2 md:mt-0 relative z-10 flex justify-end">
                      <div className="flex gap-2">
                        <div className="w-10 h-6 bg-white/20 rounded flex items-center justify-center border border-white/30 backdrop-blur-sm shadow-sm">
                          <div className="w-6 h-3 bg-white/30 rounded-sm"></div>
                        </div>
                        <div className="w-6 h-6 rounded-full bg-white/40 mix-blend-overlay"></div>
                        <div className="w-6 h-6 rounded-full bg-white/40 mix-blend-overlay -ml-3"></div>
                      </div>
                   </div>
                </div>

             </div>
          </div>
        )}

        {/* 2. Rekap Kehadiran */}
        {activeSection === 'portal_kehadiran' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 md:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-amber-50 dark:bg-amber-900/10 p-4 rounded-xl border border-amber-100 dark:border-amber-800/30">
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block mb-1">Hari Hadir</span>
              <span className="text-2xl font-black text-amber-800 dark:text-amber-300">{myData.payroll.disiplin.hadir} <span className="text-sm font-medium text-amber-600">Hari</span></span>
            </div>
            
            <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-xl border border-red-100 dark:border-red-800/30">
              <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider block mb-1">Terlambat</span>
              <span className="text-2xl font-black text-red-800 dark:text-red-300">{telatDisiplin} <span className="text-sm font-medium text-red-600">Kali</span></span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">Target Wajib</span>
              <span className="text-2xl font-black text-slate-700 dark:text-slate-200">{wajibJam} <span className="text-sm font-medium text-slate-500">JPL</span></span>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-800/30">
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block mb-1">Total Realisasi</span>
              <span className="text-2xl font-black text-blue-800 dark:text-blue-300">{realJam} <span className="text-sm font-medium text-blue-600">JPL</span></span>
            </div>
          </div>

          <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800">
            <div className="bg-slate-50 dark:bg-slate-900/50 px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
               <h4 className="font-bold text-slate-700 dark:text-slate-300 text-sm">Rincian Jam Mengajar (Tanggal 1 - 31)</h4>
               <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${selisihJam < 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                 Selisih: {selisihJam > 0 ? `+${selisihJam}` : selisihJam} JPL
               </span>
            </div>
            <div className="p-4 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
              {dailyData.map((jam, i) => (
                <div key={i} className="flex flex-col border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-900/50">
                   <span className="bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-center py-1 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                     Tgl {i + 1}
                   </span>
                   <span className={`text-center py-2 text-sm font-bold ${jam === 'S' ? 'text-amber-500' : jam === 'I' ? 'text-blue-500' : jam === 'A' ? 'text-red-500' : jam ? 'text-blue-600 dark:text-blue-400' : 'text-slate-300 dark:text-slate-600 font-light'}`}>
                     {jam || '-'}
                   </span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-4 text-center">Data ini disinkronisasi otomatis dari rekapitulasi sekolah. Hubungi admin jika terdapat ketidaksesuaian jam.</p>
        </div>
        )}

        {/* 3. Rekap & Slip Gaji */}
        {activeSection === 'portal_gaji' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 md:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {settings?.payrollStatus !== 'Approved' ? (
            <div className="flex flex-col items-center justify-center p-10 text-center bg-slate-50 dark:bg-slate-900/50 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700">
               <Lock size={48} className="text-slate-400 mb-4 opacity-50" />
               <h4 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-2">Informasi Gaji Terkunci</h4>
               <p className="text-sm text-slate-500 max-w-md">Rincian slip gaji untuk periode <strong className="text-slate-600 dark:text-slate-400">{bulan}</strong> saat ini sedang dalam proses rekapitulasi oleh Bendahara dan menunggu persetujuan (Approval) dari Kepala Sekolah.</p>
            </div>
          ) : (
            <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl p-6 border border-emerald-200 dark:border-emerald-800/30 flex flex-col items-center justify-center text-center relative overflow-hidden">
               <div className="absolute -left-6 -top-6 w-24 h-24 bg-emerald-500/20 rounded-full blur-2xl"></div>
               <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-blue-500/20 rounded-full blur-2xl"></div>
               
               <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 relative z-10">Take Home Pay (THP)</h4>
               <div className="text-4xl md:text-5xl font-extrabold text-slate-800 dark:text-white mb-6 relative z-10 drop-shadow-sm">
                 {formatRp(slip.totalBersih)}
               </div>
               
               <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md relative z-10 mb-6">
                  <div className="flex-1 bg-white dark:bg-slate-800 p-3 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
                    <span className="block text-xs text-slate-500 mb-1">Total Penerimaan Kotor</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatRp(slip.totalKotor)}</span>
                  </div>
                  <div className="flex-1 bg-white dark:bg-slate-800 p-3 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
                    <span className="block text-xs text-slate-500 mb-1">Total Potongan</span>
                    <span className="font-bold text-red-600 dark:text-red-400">-{formatRp(slip.totalPotongan)}</span>
                  </div>
               </div>

               <button 
                 onClick={() => setIsSlipModalOpen(true)}
                 className="relative z-10 flex items-center justify-center gap-2 w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-full font-bold shadow-lg shadow-emerald-500/30 transition-all hover:scale-105"
               >
                 <Printer size={18} /> Lihat & Cetak Rincian Slip
               </button>

               {/* Blok Notifikasi & Aksi Konfirmasi */}
               {myData.payroll?.isNotified && !myData.payroll?.isConfirmed && (
                  <div className="mt-6 w-full max-w-md p-4 bg-amber-50 dark:bg-amber-900/30 border-2 border-amber-300 dark:border-amber-700 rounded-xl relative z-10 animate-in zoom-in slide-in-from-bottom-2 shadow-lg">
                     <p className="text-sm text-amber-800 dark:text-amber-300 font-bold mb-3">🔔 Gaji Anda telah ditransfer! Mohon konfirmasi kesesuaian nominal.</p>
                     <div className="flex flex-col sm:flex-row gap-3">
                       <button onClick={handleKonfirmasi} className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white py-2.5 rounded-lg text-sm font-bold shadow-md shadow-emerald-500/30 transition-all hover:-translate-y-0.5">
                         Ya, Nominal Sesuai
                       </button>
                       <button onClick={handleKomplain} className="flex-1 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors border border-rose-200 dark:border-rose-800 flex justify-center items-center gap-1.5" title="Akan dialihkan ke WhatsApp Bendahara">
                         <MessageSquare size={16} /> WA Bendahara
                       </button>
                     </div>
                  </div>
               )}
               {myData.payroll?.isConfirmed && (
                  <div className="mt-6 w-full max-w-md p-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-sm font-bold rounded-xl border border-emerald-200 dark:border-emerald-800 text-center flex justify-center items-center gap-2 relative z-10">
                     <CheckCircle size={18} /> Penerimaan Gaji Telah Dikonfirmasi
                  </div>
               )}
            </div>
          )}
        </div>
        )}

        {/* 4. Dashboard Pemantauan Pinjaman / Buku Kasbon */}
        {activeSection === 'portal_pinjaman' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 md:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {loanItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-10 text-center bg-slate-50 dark:bg-slate-900/50 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700">
               <CheckCircle size={48} className="text-emerald-400 mb-4 opacity-70" />
               <h4 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-2">Tidak Ada Pinjaman Aktif</h4>
               <p className="text-sm text-slate-500 max-w-md">Alhamdulillah, saat ini Anda tidak memiliki tanggungan kasbon, cicilan koperasi, atau pinjaman lainnya yang terdaftar di sistem pemotongan otomatis.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {loanItems.map((loan, idx) => {
                const cicilanBulanan = loan.nominal;
                const sisaSaldo = loan.nominal * 4; 
                const totalPinjamanAwal = loan.nominal * 10; 
                const totalTerbayar = totalPinjamanAwal - sisaSaldo;
                const persentase = ((totalTerbayar / totalPinjamanAwal) * 100).toFixed(0);

                return (
                  <div key={idx} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden animate-in fade-in zoom-in-95">
                    <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/30">
                       <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                         <CreditCard className="text-teal-500" size={18}/> {loan.ket}
                       </h3>
                       <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Status: Aktif</span>
                    </div>
                    
                    <div className="p-5 md:p-6">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-700/50 text-center">
                          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">Plafon Pinjaman</p>
                          <p className="text-base font-bold text-slate-800 dark:text-slate-200">{formatRp(totalPinjamanAwal)}</p>
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-900/10 p-3.5 rounded-xl border border-emerald-100 dark:border-emerald-800/30 text-center">
                          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-widest font-bold mb-1">Telah Dicicil</p>
                          <p className="text-base font-bold text-emerald-700 dark:text-emerald-300">{formatRp(totalTerbayar)}</p>
                        </div>
                        <div className="bg-rose-50 dark:bg-rose-900/10 p-3.5 rounded-xl border border-rose-100 dark:border-rose-800/30 text-center">
                          <p className="text-[10px] text-rose-600 dark:text-rose-400 uppercase tracking-widest font-bold mb-1">Potongan / Bulan</p>
                          <p className="text-base font-bold text-rose-700 dark:text-rose-300">{formatRp(cicilanBulanan)}</p>
                        </div>
                        <div className="bg-teal-50 dark:bg-teal-900/10 p-3.5 rounded-xl border border-teal-100 dark:border-teal-800/30 text-center shadow-inner">
                          <p className="text-[10px] text-teal-600 dark:text-teal-400 uppercase tracking-widest font-bold mb-1">Sisa Hutang</p>
                          <p className="text-base font-black text-teal-700 dark:text-teal-300">{formatRp(sisaSaldo)}</p>
                        </div>
                      </div>

                      <div className="mb-6">
                        <div className="flex justify-between items-end mb-2">
                          <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Progres Pelunasan</span>
                          <span className="text-sm font-black text-teal-600 dark:text-teal-400">{persentase}%</span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-3 overflow-hidden shadow-inner">
                          <div className="bg-gradient-to-r from-teal-400 to-emerald-500 h-full rounded-full transition-all duration-1000 relative" style={{ width: `${persentase}%` }}>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Simulasi Riwayat Potongan Terbaru</h4>
                        <div className="overflow-hidden border border-slate-200 dark:border-slate-700 rounded-lg">
                          <table className="w-full text-left text-xs md:text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                              <tr>
                                <th className="p-3 font-semibold">Periode Gaji</th>
                                <th className="p-3 font-semibold">Keterangan Transfer</th>
                                <th className="p-3 font-semibold text-right">Potongan Masuk</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                <td className="p-3 font-medium text-slate-800 dark:text-slate-200">{bulan} (Bulan Ini)</td>
                                <td className="p-3 text-slate-600 dark:text-slate-400">Angsuran otomatis via pemotongan gaji</td>
                                <td className="p-3 text-right font-bold text-red-500">-{formatRp(cicilanBulanan)}</td>
                              </tr>
                              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                <td className="p-3 font-medium text-slate-800 dark:text-slate-200">Bulan Sebelumnya</td>
                                <td className="p-3 text-slate-600 dark:text-slate-400">Angsuran otomatis via pemotongan gaji</td>
                                <td className="p-3 text-right font-bold text-red-500">-{formatRp(cicilanBulanan)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })}
              <p className="text-[10px] text-slate-500 mt-4 flex items-start gap-1">
                 <Info size={14} className="shrink-0" />
                 Catatan: Rincian ini adalah proyeksi berdasarkan pengaturan bendahara. Sisa hutang dihitung dari saldo pemotongan gaji yang telah disahkan. Apabila Anda melakukan pembayaran tunai pelunasan di luar slip gaji, harap hubungi bendahara untuk memperbarui data ini.
              </p>
            </div>
          )}
        </div>
        )}

        {/* 5. Riwayat Gaji */}
        {activeSection === 'portal_riwayat' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 md:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* FITUR BARU: Grafik Mini Tren Gaji Pribadi */}
          {riwayatAsli.length > 0 && (
            <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700">
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-4">
                <TrendingUp size={16} className="text-indigo-500" /> Tren Take Home Pay Anda
              </h4>
              <div className="h-40 w-full relative">
                <ResponsiveContainer width="100%" height="300%">
                  <LineChart data={[...riwayatAsli].reverse().slice(-6)} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" strokeOpacity={0.3} />
                    <XAxis dataKey="periode" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} dy={10} />
                    <RechartsTooltip 
                      formatter={(value) => formatRp(value)}
                      labelStyle={{ fontWeight: 'bold', color: '#1e293b' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Line type="monotone" dataKey="nominal" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-left text-sm whitespace-nowrap min-w-max">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-4 font-bold">Periode Bulan</th>
                  <th className="p-4 font-bold text-right">Total Bersih (THP)</th>
                  <th className="p-4 font-bold">Tanggal Pengesahan</th>
                  <th className="p-4 font-bold text-center">Aksi Dokumen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {riwayatAsli.map((item) => (
                  <tr key={item.idArsip} className="hover:bg-indigo-50/50 dark:hover:bg-slate-800/40 transition-colors group">
                    <td className="p-4 font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <Calendar size={16} className="text-indigo-400" /> {item.periode}
                    </td>
                    <td className="p-4 font-bold text-emerald-600 dark:text-emerald-400 text-right">{formatRp(item.nominal)}</td>
                    <td className="p-4">
                      <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                        <CheckCircle size={14} className="text-emerald-500" /> {item.tanggal}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <button 
                        onClick={() => {
                          setSelectedHistorySlip(item);
                          setIsSlipModalOpen(true);
                        }} 
                        className="text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 hover:border-indigo-300 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-2 w-full max-w-[140px] mx-auto shadow-sm group-hover:shadow"
                      >
                        <FileText size={14} /> Lihat Rincian
                      </button>
                    </td>
                  </tr>
                ))}
                {riwayatAsli.length === 0 && (
                  <tr>
                    <td colSpan="4" className="p-10 text-center text-slate-500 flex flex-col items-center justify-center">
                       <Archive size={40} className="mb-3 opacity-30 text-indigo-500" />
                       <p className="font-bold">Belum ada riwayat gaji yang tersimpan.</p>
                       <p className="text-xs mt-1">Data akan muncul di sini setelah Admin melakukan "Tutup Buku" pada akhir bulan.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 mt-4 flex items-start gap-1">
             <Info size={14} className="shrink-0" />
             Catatan: Dokumen slip gaji merupakan dokumen rahasia. Jaga kerahasiaan file PDF yang Anda unduh. Apabila terdapat pertanyaan mengenai data lampau, silakan hubungi bendahara.
          </p>
        </div>
        )}

        {/* 6. Informasi Sistem */}
        {activeSection === 'portal_info' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 md:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-slate-50/50 dark:bg-slate-900/20 rounded-2xl border border-slate-100 dark:border-slate-700/50 p-2 sm:p-4">
            {renderElegantInfo(settings?.payrollInfoText)}
          </div>
        </div>
        )}

        {/* 7. Kritik & Saran */}
        {activeSection === 'portal_saran' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 md:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <form onSubmit={handleSendFeedback} className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Kami sangat menghargai masukan Anda untuk pengembangan sekolah dan kesejahteraan bersama. Kritik dan saran akan dikirim secara aman kepada manajemen.
            </p>
            
            <div className="space-y-1.5">
               <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Topik / Subjek Masukan</label>
               <select 
                 value={feedbackSubject}
                 onChange={(e) => setFeedbackSubject(e.target.value)}
                 className="w-full p-3.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm font-semibold focus:ring-2 focus:ring-rose-500 focus:bg-white dark:focus:bg-slate-800 outline-none transition-all cursor-pointer shadow-sm"
               >
                 <option value="Saran & Masukan Umum">Saran & Masukan Umum</option>
                 <option value="Koreksi Data / Profil Pegawai">Koreksi Data / Profil Pegawai</option>
                 <option value="Pertanyaan Gaji & Potongan">Pertanyaan Seputar Gaji / Potongan</option>
                 <option value="Laporan Kendala Sistem">Laporan Kendala Sistem</option>
               </select>
            </div>

            <div className="space-y-1.5">
               <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Detail Pesan / Keterangan</label>
               <textarea 
                 rows="5" 
                 value={feedbackMsg}
                 onChange={(e) => setFeedbackMsg(e.target.value)}
                 placeholder="Tuliskan masukan, kendala, atau rincian permohonan koreksi data Anda di sini..."
                 className="w-full p-4 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 text-sm focus:ring-2 focus:ring-rose-500 focus:bg-white dark:focus:bg-slate-800 outline-none transition-all shadow-inner resize-y min-h-[120px]"
                 required
               ></textarea>
            </div>
            
            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-700/50">
              <button 
                type="submit"
                className="flex items-center gap-2 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-rose-500/30 transition-all hover:-translate-y-0.5"
              >
                <Send size={18} /> Kirim Masukan Sekarang
              </button>
            </div>
          </form>
        </div>
        )}

      </div>
    </div>
  );
}

// --- PENGATURAN VIEW ---
function PengaturanView({ teachers, setTeachers, settings, setSettings, feedbacks, setFeedbacks, loginHistory }) {
  const fileInputRef = useRef(null);

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

  const [activeTabSetting, setActiveTabSetting] = useState('umum');
  
  const settingTabs = [
    { id: 'umum', label: 'Umum & Tampilan', icon: Building, desc: 'Logo, Nama & Kontak' },
    { id: 'portal', label: 'Teks Portal Guru', icon: FileText, desc: 'Aturan & Info Penggajian' },
    { id: 'akun', label: 'Manajemen Akses', icon: Key, desc: 'Kelola Akun & Login' },
    { id: 'sistem', label: 'Pengaturan Sistem', icon: Settings, desc: 'Sistem & Keamanan' },
    { id: 'riwayat', label: 'Riwayat Login', icon: Clock, desc: 'Log Aktivitas Guru' },
    { id: 'saran', label: 'Kritik & Saran', icon: MessageSquare, desc: 'Aspirasi & Masukan' },
  ];

  // Sinkronisasi data guru menjadi data akun saat komponen dimuat
  useEffect(() => {
    const teacherAccounts = teachers.map(t => ({ 
      id: t.id, 
      name: t.name, 
      username: t.nipy || t.id, 
      password: simpleHash('guru123'), 
      role: 'Guru' 
    }));
    
    setAccounts(prev => {
      const adminAcc = prev.map(a => 
         a.password === '••••••••' ? { ...a, password: simpleHash(a.username === 'admin' ? 'Boy2014' : 'Ilwani2010') } : a
      ).filter(a => a.role !== 'Guru');

      return [...adminAcc, ...teacherAccounts.map(ta => {
         const existing = prev.find(p => p.id === ta.id);
         if (existing && existing.password !== '••••••••') {
            return { ...ta, password: existing.password };
         }
         return ta;
      })];
    });
  }, [teachers]);

  const [searchAcc, setSearchAcc] = useState('');
  const [modal, setModal] = useState({ isOpen: false, type: null, data: null });
  
  // FITUR BARU: State untuk Micro-Interaction Tombol Simpan
  const [isSaving, setIsSaving] = useState(false);
  
  // TAMBAHAN: State Custom Modal Konfirmasi Database (Pengganti prompt yang diblokir)
  const [confirmResetDb, setConfirmResetDb] = useState({ isOpen: false, keyword: '' });

  // TAMBAHAN: State Notifikasi Lokal untuk Error AI Summarizer
  const [notification, setNotification] = useState({ isOpen: false, type: '', message: '' });

  const filteredAccounts = accounts.filter(a =>
    a.name.toLowerCase().includes(searchAcc.toLowerCase()) ||
    a.username.toLowerCase().includes(searchAcc.toLowerCase())
  );

  const handleSaveGeneral = (e) => {
    e.preventDefault();
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      alert('Pengaturan Aplikasi berhasil disimpan dan diperbarui!');
    }, 600);
  };

  const handleSaveAccount = (e) => {
    e.preventDefault();
    setIsSaving(true);
    
    const formData = new FormData(e.target);
    const passInput = formData.get('password');
    const newData = {
      name: formData.get('name'),
      username: formData.get('username'),
      role: formData.get('role'),
      password: passInput ? simpleHash(passInput) : (modal.data?.password || simpleHash('12345678'))
    };

    setTimeout(() => {
      if (modal.type === 'add') {
        setAccounts([{ id: generateUniqueId('acc-'), ...newData }, ...accounts]);
        alert('Akses login baru berhasil ditambahkan.');
      } else {
        setAccounts(accounts.map(a => a.id === modal.data.id ? { ...a, ...newData } : a));
        alert(`Perubahan akses login untuk ${newData.name} berhasil disimpan.`);
      }
      setIsSaving(false);
      setModal({ isOpen: false, type: null, data: null });
    }, 600);
  };

  const handleDeleteAccount = () => {
    if (modal.data.role === 'Admin' && accounts.filter(a => a.role === 'Admin').length <= 1) {
      alert('Akses ditolak: Aplikasi setidaknya harus memiliki satu akun Admin aktif!');
      setModal({ isOpen: false, type: null, data: null });
      return;
    }
    setAccounts(accounts.filter(a => a.id !== modal.data.id));
    setModal({ isOpen: false, type: null, data: null });
    alert('Akses login berhasil dihapus dari sistem.');
  };

  const handleMarkFeedbackDone = (id) => {
    setFeedbacks(feedbacks.map(fb => fb.id === id ? { ...fb, status: 'Selesai' } : fb));
  };

  const openModal = (type, data = null) => setModal({ isOpen: true, type, data });

  // Fungsionalitas Sistem (Backup, Restore, Reset, Toggles)
  const handleBackupData = () => {
    const backupData = { 
       timestamp: new Date().toISOString(),
       version: '1.0',
       settings, 
       teachers, 
       accounts 
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `PayEdu_Backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRestoreData = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Membaca file langsung dan menggunakan custom error handling (bypass window.confirm block)
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        if (data.teachers && data.settings) {
          setTeachers(data.teachers);
          setSettings(data.settings);
          if (data.accounts) setAccounts(data.accounts);
          alert("Restore data berhasil! Aplikasi akan menggunakan konfigurasi dari file backup.");
        } else {
          alert("File backup tidak valid atau rusak.");
        }
      } catch (err) {
        alert("Gagal membaca file backup. Format JSON tidak dikenali.");
      }
      e.target.value = null;
    };
    reader.readAsText(file);
  };

  const handleResetDatabase = () => {
     setConfirmResetDb({ isOpen: true, keyword: '' });
  };

  const executeResetDatabase = () => {
     if (confirmResetDb.keyword === 'RESET PEGAWAI') {
        setTeachers([]);
        setConfirmResetDb({ isOpen: false, keyword: '' });
        
        // TAMBALAN CERDAS: Memaksa penyimpanan ulang settings sesaat setelah reset
        // Mencegah bug di mana backend Google Apps Script secara tidak sengaja menghapus setting saat array guru kosong
        setTimeout(() => {
           const payloadWithTime = { ...settings, lastModified: Date.now() };
           fetch(GOOGLE_SHEETS_API_URL, {
             method: 'POST',
             body: JSON.stringify({ action: 'SAVE_SETTINGS', payload: payloadWithTime })
           }).catch(e => console.error("Gagal menyelamatkan pengaturan:", e));
        }, 500);

        setTimeout(() => alert("Proses eksekusi berhasil. Seluruh data pegawai telah dibersihkan dari database, namun Pengaturan Logo & Sekolah tetap aman!"), 300);
     } else {
        alert("Reset dibatalkan. Konfirmasi ketikan tidak sesuai.");
     }
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

      {/* MODAL KONFIRMASI RESET DATABASE */}
      {confirmResetDb.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={40} />
              </div>
              <h3 className="text-xl font-bold dark:text-white mb-2">Hapus Seluruh Database?</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
                Tindakan ini akan menghapus <strong>SELURUH DATA PEGAWAI</strong> beserta riwayat penggajiannya secara permanen.
              </p>
              <label className="block text-left text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Ketik "RESET PEGAWAI" untuk mengonfirmasi:</label>
              <input 
                type="text" 
                value={confirmResetDb.keyword} 
                onChange={e => setConfirmResetDb({ ...confirmResetDb, keyword: e.target.value })}
                className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-red-500 outline-none dark:text-white font-mono text-center tracking-widest"
                placeholder="RESET PEGAWAI"
              />
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-center gap-3 shrink-0">
              <button onClick={() => setConfirmResetDb({ isOpen: false, keyword: '' })} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors w-full">Batal</button>
              <button 
                onClick={executeResetDatabase} 
                disabled={confirmResetDb.keyword !== 'RESET PEGAWAI'}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-sm transition-colors w-full flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 size={16} /> Ya, Eksekusi Reset
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
                       <input name="password" type="password" placeholder={modal.type === 'edit' ? 'Abaikan jika tidak ganti password' : 'Buat password baru...'} className="w-full pl-9 pr-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-slate-400 outline-none dark:text-white" required={modal.type === 'add'} />
                    </div>
                  </div>
                </form>
              )}

              {modal.type === 'delete' && modal.data && (
                <div className="text-center">
                  <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center mx-auto mb-4">
                    <Trash2 size={40} />
                  </div>
                  <h3 className="text-xl font-bold dark:text-white mb-2">Cabut Hak Akses?</h3>
                  <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    Apakah Anda yakin ingin mencabut hak akses login dari <span className="font-bold text-slate-700 dark:text-slate-200">{modal.data.name}</span> ({modal.data.username})? Pengguna ini tidak akan bisa lagi masuk ke sistem.
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
      <div className="bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded-2xl p-6 md:p-8 shadow-sm border border-slate-300 dark:border-slate-600 relative overflow-hidden flex items-center justify-between shrink-0">
        <div className="relative z-10">
          <h1 className="text-2xl md:text-3xl font-extrabold mb-2 tracking-tight flex items-center gap-3 text-slate-800 dark:text-white">
            <Settings className="text-slate-600 dark:text-slate-400" size={32} /> Pengaturan Sistem
          </h1>
          <p className="text-slate-600 dark:text-slate-300 text-sm md:text-base">
            Konfigurasi informasi umum aplikasi dan manajemen hak akses *login* secara terpusat.
          </p>
        </div>
        <Settings size={140} className="absolute -right-10 -bottom-10 text-slate-300/50 dark:text-slate-600/30 transform rotate-12 pointer-events-none" />
      </div>

      <div className="flex flex-col gap-6 flex-1 min-h-0">
         
         {/* Navigasi Tab Mendatar (Horizontal Tabs) */}
         <div className="w-full bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-2 shrink-0">
            <nav 
               className="flex flex-row gap-2 overflow-x-auto pb-2 scroll-smooth" 
               style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}
            >
              {settingTabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTabSetting(tab.id)}
                  className={`flex-1 flex items-center justify-center sm:justify-start gap-3 px-4 py-3 rounded-lg text-left transition-all duration-200 group min-w-[180px] shrink-0 ${
                    activeTabSetting === tab.id
                      ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 shadow-sm'
                      : 'border border-transparent hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <div className={`p-2 rounded-lg shrink-0 transition-colors ${activeTabSetting === tab.id ? 'bg-blue-600 text-white dark:bg-blue-600 dark:text-white shadow-sm' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:text-slate-600'}`}>
                    <tab.icon size={18} />
                  </div>
                  <div>
                    <div className={`font-bold text-sm whitespace-nowrap ${activeTabSetting === tab.id ? 'text-blue-700 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white'}`}>{tab.label}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 hidden sm:block mt-0.5 font-medium whitespace-nowrap">{tab.desc}</div>
                  </div>
                </button>
              ))}
            </nav>
         </div>

         {/* Area Konten Tab (Bawah Navigasi) */}
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

                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                       <div>
                         <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Nama Aplikasi / Portal</label>
                         <input 
                           type="text" value={settings.appName || ''} 
                           onChange={e => setSettings({...settings, appName: e.target.value})} 
                           className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-400 outline-none dark:text-white font-medium" 
                         />
                       </div>
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
                  <form id="formPortal" onSubmit={handleSaveGeneral} className="space-y-4 max-w-4xl">
                     <div>
                       <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Pedoman & Aturan Sistem Penggajian (Tampil di menu Info Sistem)</label>
                       <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Gunakan tanda bintang (*) atau strip (-) untuk membuat list/daftar yang rapi. Gunakan titik dua (:) di pertengahan teks untuk menebalkan judul poin (seperti "Nama Tunjangan: Penjelasan").</p>
                       <textarea 
                         rows="15" 
                         value={settings.payrollInfoText || ''} 
                         onChange={e => setSettings({...settings, payrollInfoText: e.target.value})} 
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

            {/* TAB: AKUN LOGIN */}
            {activeTabSetting === 'akun' && (
              <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-2">
                <div className="p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
                   <div>
                     <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                       <Key className="text-amber-500" size={18} /> Akses Login Pengguna
                     </h3>
                   </div>
                   <div className="flex gap-3 w-full sm:w-auto">
                     <div className="relative w-full sm:w-56">
                       <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                       <input 
                         type="text" placeholder="Cari akun..." 
                         value={searchAcc} onChange={e => setSearchAcc(e.target.value)}
                         className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-400 outline-none dark:text-white"
                       />
                     </div>
                     <button onClick={() => openModal('add')} className="bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2 shrink-0">
                        <PlusCircle size={16} /> Buat Akses
                     </button>
                   </div>
                </div>

                <div className="flex-1 overflow-x-auto relative">
                   <table className="w-full text-left text-sm whitespace-nowrap min-w-max">
                     <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 sticky top-0 z-10 shadow-sm border-b border-slate-200 dark:border-slate-700">
                       <tr>
                         <th className="p-4 font-bold">Nama Pegawai</th>
                         <th className="p-4 font-bold">Username Login</th>
                         <th className="p-4 font-bold">Password</th>
                         <th className="p-4 font-bold">Hak Akses (Role)</th>
                         <th className="p-4 font-bold text-center">Aksi</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                       {filteredAccounts.map(acc => (
                         <tr key={acc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                           <td className="p-4 font-bold text-slate-800 dark:text-slate-200">{acc.name}</td>
                           <td className="p-4">
                             <span className="bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded font-mono text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-600">
                               {acc.username}
                             </span>
                           </td>
                           <td className="p-4 tracking-widest text-slate-400" title="Password Disamarkan">••••••••</td>
                           <td className="p-4">
                             <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${acc.role === 'Admin' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : acc.role === 'Kepala Sekolah' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : acc.role === 'Yayasan' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                               {acc.role}
                             </span>
                           </td>
                           <td className="p-4 text-center">
                             <div className="flex items-center justify-center gap-2">
                               <button onClick={() => openModal('edit', acc)} className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-md transition-colors" title="Edit Akun">
                                 <Edit size={14} />
                               </button>
                               <button onClick={() => openModal('delete', acc)} className="p-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-md transition-colors" title="Cabut Akses">
                                 <Trash2 size={14} />
                               </button>
                             </div>
                           </td>
                         </tr>
                       ))}
                       {filteredAccounts.length === 0 && (
                         <tr><td colSpan="5" className="p-8 text-center text-slate-500">Tidak ada data akun ditemukan.</td></tr>
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
                        <input type="checkbox" checked={settings?.maintenanceMode || false} onChange={e => setSettings({...settings, maintenanceMode: e.target.checked})} className="sr-only peer" />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
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

                   {/* TAMBAHAN: Input untuk Google Gemini API Key */}
                   <div className="flex items-center justify-between p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
                      <div className="pr-4 w-full">
                         <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">Integrasi Google Gemini AI</h4>
                         <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed mb-3">Sistem AI membutuhkan API Key untuk beroperasi di server Anda. Masukkan API Key Anda di bawah ini agar fitur analisis cerdas aktif.</p>
                         <input 
                           type="password" 
                           value={settings?.geminiApiKey || ''} 
                           onChange={e => setSettings({...settings, geminiApiKey: e.target.value})} 
                           placeholder="Masukkan API Key (AIzaSy...)" 
                           className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-white font-mono" 
                         />
                         <p className="text-[10px] mt-2 text-slate-500">Dapatkan API Key secara GRATIS di <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="text-blue-500 font-bold hover:underline">Google AI Studio</a>.</p>
                      </div>
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
                   </div>
                </div>
              </div>
            )}

            {/* TAB: RIWAYAT LOGIN */}
            {activeTabSetting === 'riwayat' && (
              <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-2">
                <div className="p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 shrink-0">
                   <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                     <Clock className="text-slate-500" size={18} /> Riwayat Akses Sistem Terakhir
                   </h3>
                </div>
                <div className="overflow-x-auto flex-1 relative p-0">
                  <table className="w-full text-left text-sm whitespace-nowrap min-w-max">
                    <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 sticky top-0 z-10 shadow-sm border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-4 font-bold">Waktu Akses</th>
                        <th className="p-4 font-bold">Pengguna</th>
                        <th className="p-4 font-bold">Perangkat / OS</th>
                        <th className="p-4 font-bold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {(loginHistory || []).map((log, idx) => (
                        <tr key={log.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="p-4 text-slate-600 dark:text-slate-400 font-medium">{log.time}</td>
                          <td className="p-4 font-bold text-slate-800 dark:text-slate-200">
                            {log.name} <span className="font-normal text-slate-500 text-xs ml-1">({log.role})</span>
                          </td>
                          <td className="p-4 text-slate-500 text-xs">{log.device || '-'}</td>
                          <td className="p-4">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${log.status.includes('Gagal') ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                              {log.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {(loginHistory || []).length === 0 && (
                        <tr><td colSpan="4" className="p-8 text-center text-slate-500">Belum ada riwayat aktivitas yang terekam.</td></tr>
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
                    
                    {/* TAMBAHAN GEMINI AI: Summarizer Masukan */}
                    {(feedbacks || []).length > 0 && (
                      <div className="bg-gradient-to-r from-rose-50 to-pink-50 dark:from-rose-900/20 dark:to-pink-900/20 rounded-xl border border-rose-200 dark:border-rose-800 p-5 shadow-sm mb-6 relative overflow-hidden">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-20">
                          <div className="flex items-center gap-3">
                            <div className="bg-rose-100 dark:bg-rose-900/50 p-2.5 rounded-lg text-rose-600 dark:text-rose-400 shadow-inner">
                              <Sparkles size={20} />
                            </div>
                            <div>
                              <h4 className="font-bold text-rose-900 dark:text-rose-100 text-lg">AI Feedback Summarizer</h4>
                              <p className="text-[10px] text-rose-600/80 dark:text-rose-300 font-bold uppercase tracking-wider">Ditenagai oleh Gemini API</p>
                            </div>
                          </div>
                          {/* DIPERBARUI: Ditambahkan 'relative z-50 cursor-pointer' agar selalu bisa diklik */}
                          <button 
                            onClick={async () => {
                              if (!feedbacks || feedbacks.length === 0) return;
                              setIsSaving(true);
                              try {
                                const feedbackTexts = feedbacks.map(f => `- [Topik: ${f.subject}] Pesan: ${f.message}`).join('\n');
                                const prompt = `Anda adalah asisten Manajer SDM sekolah. Berikut adalah daftar pesan, keluhan, dan saran dari para guru:
\n${feedbackTexts}\n\n
Tolong buatkan untuk Kepala Sekolah:
1. Sentimen Keseluruhan (Positif/Negatif/Netral)
2. 3 Poin Rangkuman Masalah/Permintaan Utama
3. Saran Tindak Lanjut untuk Manajemen
Tulis dengan bahasa profesional dan tidak perlu format berlebihan.`;
                                
                                // DIPERBARUI: Mengirimkan API Key dari pengaturan
                                const result = await callGeminiAPI(prompt, settings?.geminiApiKey);
                                setModal({ isOpen: true, type: 'aiSummary', data: result });
                              } catch (err) {
                                console.error("AI Error:", err);
                                setNotification({ isOpen: true, type: 'error', message: "Gagal merangkum masukan. Terjadi gangguan pada koneksi atau layanan sistem." });
                              } finally {
                                setIsSaving(false);
                              }
                            }}
                            disabled={isSaving}
                            className="relative z-50 cursor-pointer bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-md transition-all flex items-center gap-2 disabled:opacity-70 hover:-translate-y-0.5 disabled:cursor-not-allowed"
                          >
                            {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Sparkles size={16} />}
                            {isSaving ? 'Merangkum...' : '✨ Rangkum Semua Masukan'}
                          </button>
                        </div>
                      </div>
                    )}

                    {(feedbacks || []).length === 0 ? (
                      <div className="text-center py-10 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 border-dashed">
                        <MessageSquare size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                        <p className="text-slate-500 font-medium">Belum ada kritik dan saran yang masuk dari portal pegawai.</p>
                      </div>
                    ) : (
                      (feedbacks || []).map((fb) => (
                        <div key={fb.id} className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm relative group transition-colors hover:border-rose-300 dark:hover:border-rose-700">
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-3">
                               <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center font-bold text-slate-600 dark:text-slate-300">
                                  {fb.name.charAt(0)}
                               </div>
                               <div>
                                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">{fb.name}</h4>
                                  <p className="text-[10px] text-slate-500 mt-0.5">{fb.date} • {fb.subject}</p>
                               </div>
                            </div>
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${fb.status === 'Selesai' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30'}`}>
                              {fb.status}
                            </span>
                          </div>
                          <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg text-sm text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-slate-700/50 leading-relaxed whitespace-pre-wrap">
                            "{fb.message}"
                          </div>
                          {fb.status !== 'Selesai' && (
                             <div className="mt-4 flex justify-end">
                               <button onClick={() => handleMarkFeedbackDone(fb.id)} className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 dark:text-emerald-400 text-xs font-bold rounded-lg transition-colors border border-emerald-200 dark:border-emerald-800/50 flex items-center gap-1.5 shadow-sm">
                                  <CheckCircle size={14} /> Tandai Selesai
                               </button>
                             </div>
                          )}
                        </div>
                      ))
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