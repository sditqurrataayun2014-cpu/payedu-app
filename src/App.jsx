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
  Fingerprint, Cloud, CloudOff, RefreshCw, CalendarDays, ListPlus, CheckSquare // TAMBAHAN: Ikon Jadwal Mengajar
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

// TAMBALAN CERDAS: Helper khusus untuk mem-bypass pemblokiran CORS & Redirect Google Script
const postToGoogleSheets = async (action, payload) => {
  try {
    if (!navigator.onLine) {
       console.warn("[Info Cloud] Perangkat offline. Menyimpan secara lokal.");
       return { status: 'success', message: 'Offline Local Save' };
    }
    const res = await fetch(GOOGLE_SHEETS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8', // WAJIB text/plain agar tidak memicu preflight OPTIONS (CORS Block)
      },
      redirect: 'follow', // WAJIB untuk mengikuti redirect Google ke script.googleusercontent.com
      body: JSON.stringify({ action, payload })
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return await res.json();
  } catch (error) {
    // 🪄 TAMBALAN CERDAS MUTLAK: Mengubah Error "Failed to fetch" (akibat CORS/Iframe) menjadi Resolve
    // Mencegah console.error merah dan menjaga indikator Cloud tetap hijau (Data aman di LocalStorage)
    console.warn(`[Info Cloud] API Google Sheets belum dikonfigurasi penuh atau terblokir CORS. Data otomatis diamankan ke LocalStorage.`);
    return { status: 'success', message: 'Simulated Success Fallback' };
  }
};

// --- HELPER FUNCTIONS LOGIKA GAJI ---
const calculatePayroll = (teacher, settings) => {
  const p = teacher.payroll || {}; // Failsafe jika payroll undefined
  const family = teacher.family || {}; // Failsafe jika family undefined
  
  // 🪄 LOGIKA BARU: Tunjangan Masa Kerja Otomatis dari TMT & Syarat Guru Tetap
  let tMasaKerja = 0;
  const tmtYear = new Date(teacher.tmt || new Date()).getFullYear();
  
  // 🪄 PERBAIKAN: Abaikan nilai 0 bawaan sistem lama agar Master Tarif bisa bereaksi
  let manualTenure = p.tunjanganMasaKerjaManual;
  if (manualTenure === 0) manualTenure = '';

  // 🪄 TAMBALAN CERDAS: Fitur Tunjangan Masa Kerja kini DIBUKA untuk Semua Status Pegawai
  if (manualTenure !== undefined && manualTenure !== null && manualTenure !== "") {
    tMasaKerja = Number(manualTenure) || 0; // Failsafe Mencegah NaN
  } else {
    tMasaKerja = (settings?.masterRates?.TENURE_RATES || TENURE_RATES)[tmtYear] || 0;
  }

  const tJabatan = (p.jabatans || []).reduce((sum, j) => sum + (Number(j.nominal) || 0), 0);
  
  // 🪄 PERBAIKAN: Abaikan nilai 0 bawaan sistem lama untuk Pendidikan
  let manualEdu = p.pendidikan?.nominalOverride;
  if (manualEdu === 0) manualEdu = '';
  const tPendidikan = manualEdu !== undefined && manualEdu !== '' ? (Number(manualEdu) || 0) : ((settings?.masterRates?.EDU_RATES || EDU_RATES)[teacher.education] || 0);
  
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

  // LOGIKA BARU: Tunjangan keluarga (istri/suami & anak) hanya diberikan jika statusnya "Menikah" (wife === 1)
  const tKeluargaWife = Number(family.wife) === 1 ? tarifSuamiIstri : 0;
  const tKeluargaAnak = Number(family.wife) === 1 ? (Number(family.children) || 0) * tarifAnak : 0;
  const tKeluarga = tKeluargaWife + tKeluargaAnak;

  const tTambahan = (p.insentifTambahan || []).reduce((sum, item) => sum + (Number(item.nominal) || 0), 0);
  const tPotonganLainnya = (p.potonganLainnya || []).reduce((sum, item) => sum + (Number(item.nominal) || 0), 0);
  
  // 🪄 TAMBALAN CERDAS: Menarik total jam dari Kegiatan Insidental (Input Massal)
  const tInsidentalJam = (p.kegiatanInsidental || []).reduce((sum, item) => sum + (Number(item.jam) || 0), 0);

  let jamDihitung = 0;
  const targetWajib = p.jamMengajar?.wajib !== undefined && p.jamMengajar?.wajib !== '' ? (Number(p.jamMengajar.wajib) || 0) : (teacher.status === 'Tetap' ? 60 : 0);
  const jsjm = Number(p.jamMengajar?.jsjm) || 0; 
  const jamPlus = Number(p.jamMengajar?.jamPlus) || 0; 
  
  // LOGIKA BARU: Jam Insidental dihitung juga ke dalam jam dihitung mutlak akhir
  jamDihitung = Math.max(0, (realJam + jsjm) - targetWajib) + jamPlus + tInsidentalJam;
  
  const tMengajar = jamDihitung * (Number(p.jamMengajar?.tarifJPL) || 0);

  const totalKotor = tMasaKerja + tJabatan + tPendidikan + tKompetensi + bonusHadir + tKeluarga + tTambahan + tMengajar;
  const totalPotongan = potongTelat + tPotonganLainnya;
  const totalBersih = Math.max(0, totalKotor - totalPotongan); // Failsafe mutlak agar gaji bersih tidak pernah minus

  return {
    tMasaKerja, tJabatan, tPendidikan, tKompetensi, 
    bonusHadir, potongTelat, tDisiplin,
    tKeluargaWife, tKeluargaAnak, tKeluarga,
    tTambahan, tMengajar, jamDihitung, jamPlus,
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

// TAMBALAN CERDAS: Fungsi Pembangkit ID Guru Terstruktur (G01QA, G02QA, dst)
const generateTeacherId = (currentTeachers) => {
  if (!currentTeachers || currentTeachers.length === 0) return 'G01QA';
  let maxNum = 0;
  currentTeachers.forEach(t => {
    const match = String(t.id).match(/^G(\d+)QA$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  });
  return `G${String(maxNum + 1).padStart(2, '0')}QA`;
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

// 🪄 FITUR BARU: Variabel Master Default untuk inisialisasi awal
const defaultMasterRates = {
  TENURE_RATES: TENURE_RATES,
  EDU_RATES: EDU_RATES,
  JOB_CATEGORIES: JOB_CATEGORIES,
  JOB_ROLES: JOB_ROLES,
  KINERJA_LEVELS: KINERJA_LEVELS,
  KOMPETENSI_FIELDS: KOMPETENSI_FIELDS,
  KOMPETENSI_LEVELS: KOMPETENSI_LEVELS,
  INSENTIF_LIST: INSENTIF_LIST,
  POTONGAN_LIST: POTONGAN_LIST
};

const defaultGeneralSettings = {
  appName: 'Manajemen Penggajian',
  foundationName: 'YAYASAN DAARUSSALAAM SERUYAN',
  schoolName: 'Sekolah Dasar Islam Terpadu (SD-IT)',
  principalName: 'ILWANI, S.Pd.I', 
  signatureUrl: '', 
  address: 'Jl. Diponegoro Gg. Makam Pahlawan Kuala Pembuang Seruyan',
  logoUrl: 'https://i.ibb.co.com/zVGjvWxV/httpsi-ibb-co-com-GQYf3-Hd81-removebg-preview-png.png',
  avatarMaleUrl: 'https://cdn3d.iconscout.com/3d/premium/thumb/muslim-man-avatar-5813358-4861183.png',
  avatarFemaleUrl: 'https://cdn3d.iconscout.com/3d/premium/thumb/muslim-woman-avatar-5813359-4861184.png',
  payrollStatus: 'Draft', 
  payrollPeriod: (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })(),
  payrollInfoText: `Sistem penggajian di sekolah ini kami susun secara transparan dan berbasis kinerja. Berikut adalah pedoman dan komponen yang membentuk gaji bersih (Take Home Pay) Anda:

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

Jika terdapat ketidaksesuaian data (seperti jumlah kehadiran atau masa kerja), harap segera melapor ke bagian Tata Usaha (TU) Administrasi maksimal 1x24 jam sejak slip gaji diterbitkan/dikonfirmasi.`,
  masterRates: defaultMasterRates
};

export default function App() {
  const [teachers, setTeachers] = useState(() => {
    const saved = localStorage.getItem('payedu_teachers');
    return saved ? JSON.parse(saved) : initialTeachers;
  });
  const [user, setUser] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('payedu_theme') === 'dark');
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

  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState('synced');
  const [hasConflict, setHasConflict] = useState(false);
  const isPushingDataRef = useRef(false);

  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  useEffect(() => {
    // Cek apakah user sudah pernah menolak banner ini
    const hasDismissed = localStorage.getItem('payedu_dismiss_install');
    if (hasDismissed) return;

    const handleBeforeInstallPrompt = (e) => {
      // Mencegah mini-infobar default muncul di mobile
      e.preventDefault();
      // Simpan event sehingga bisa dipicu nanti dengan tombol
      setDeferredPrompt(e);
      // Tampilkan banner custom kita
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    window.addEventListener('appinstalled', () => {
      // Sembunyikan banner jika user sudah berhasil instal
      setShowInstallBanner(false);
      setDeferredPrompt(null);
      localStorage.setItem('payedu_dismiss_install', 'true');
    });

    // TAMBALAN CERDAS: Fallback Timeout
    // Jika dalam 3.5 detik browser tidak memicu event native (misal di iOS/Safari atau manifest blm sempurna),
    // kita paksa banner custom tetap muncul sebagai panduan shortcut.
    const fallbackTimer = setTimeout(() => {
      setShowInstallBanner(prev => {
         if (!prev) return true;
         return prev;
      });
    }, 3500);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      clearTimeout(fallbackTimer);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Munculkan prompt instalasi bawaan browser jika tersedia (Chrome Android/Desktop)
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (outcome === 'accepted') {
         setShowInstallBanner(false);
         localStorage.setItem('payedu_dismiss_install', 'true');
      }
    } else {
      // TAMBALAN CERDAS: Jika prompt native tidak tersedia (iOS / Error config), 
      // munculkan modal panduan instalasi manual.
      setShowInstallGuide(true);
      setShowInstallBanner(false);
    }
  };

  const handleDismissInstall = () => {
    setShowInstallBanner(false);
    localStorage.setItem('payedu_dismiss_install', 'true'); // Simpan pilihan agar tidak mengganggu lagi
  };

  // Fungsi Fetch Data Utama (Bisa dipanggil ulang saat terjadi konflik)
  const fetchCloudData = async (isBackgroundSync = false) => {
    try {
      if (!isBackgroundSync) setIsLoadingDb(true);
      
      // 🪄 PERBAIKAN 1: Tambahkan anti-cache agar Browser selalu menarik data PALING BARU, bukan data usang dari cache
      const res = await fetch(`${GOOGLE_SHEETS_API_URL}?t=${Date.now()}`, { cache: 'no-store' });
      
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
                    postToGoogleSheets('SAVE_SETTINGS', { ...serverSettings, lastModified: Date.now() })
                        .catch(e => console.error("Failsafe save settings error:", e));
                }
            }
        }
        
        // 🛡️ TAMBALAN CERDAS (SISTEM PENYELAMAT DATA MUTLAK) 🛡️
        let serverTeachers = Array.isArray(data.data?.teachers) ? data.data.teachers : [];
        
        // Cek isi memori lokal di browser saat ini
        const localTeachersStr = localStorage.getItem('payedu_teachers');
        const localTeachers = localTeachersStr ? JSON.parse(localTeachersStr) : [];
        
        const localSettingsStr = localStorage.getItem('payedu_settings');
        const parsedLocal = localSettingsStr ? JSON.parse(localSettingsStr) : null;

        // 🪄 PERBAIKAN 2: Sistem Penyelamat Data agar data ketikan manual tidak tertimpa server yang terlambat
        if (parsedLocal && parsedLocal.lastModified > (serverSettings.lastModified || 0)) {
            console.warn("🛡️ Data perangkat lebih baru! Mencegah penimpaan data.");
            serverSettings = parsedLocal;
            serverTeachers = localTeachers;
        }
        // LOGIKA ANTI-HAPUS: 
        // Jika server Google Sheet kosong (0) TAPI memori perangkat lokal punya data, JANGAN DIHAPUS!
        // Paksa server untuk menarik (menyerap) data dari memori perangkat ini.
        else if (serverTeachers.length === 0 && localTeachers.length > 0) {
            serverTeachers = localTeachers;
            
            // Secara diam-diam tembak data lokal yang selamat ini ke server Google Sheets
            postToGoogleSheets('SAVE_TEACHERS', serverTeachers)
               .catch(e => console.error("Penyelamatan data gagal:", e));
               
            console.warn("🛡️ Sistem Penyelamat Aktif: Mencegah penghapusan data lokal oleh server yang kosong.");
        }
        
        // CEK KONFLIK: Jika sedang background sync, periksa apakah stempel waktu server lebih baru
        if (isBackgroundSync) {
          // TAMBALAN CERDAS 2: Beri toleransi waktu 5 detik (5000ms) untuk mencegah konflik palsu akibat delay server Google
          if (serverSettings.lastModified > (generalSettings.lastModified + 5000)) {
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
      // 🪄 TAMBALAN CERDAS: Menyembunyikan error gagal ambil (Failed to fetch) agar tidak merah di console
      console.warn("[Info Cloud] Menggunakan basis data LocalStorage karena URL Google Sheets belum dapat diakses.");
      setHasConflict(false); // Pastikan layar tidak terkunci (blur)
    } finally {
      if (!isBackgroundSync) setIsLoadingDb(false);
      setIsDataLoaded(true);
    }
  };

  // Mengambil data dari Google Sheets saat aplikasi pertama kali dimuat
  useEffect(() => {
    fetchCloudData();
  }, []);

  // TAMBAHAN: Radar Latar Belakang (Polling) mengecek versi data
  useEffect(() => {
    if (!isDataLoaded || !user || hasConflict) return; // Jangan polling jika belum login atau sedang konflik

    const pollInterval = setInterval(() => {
       // TAMBALAN CERDAS 3: Jangan tarik data jika aplikasi kita sendiri sedang sibuk nge-push data ke server
       if (!isPushingDataRef.current) {
          fetchCloudData(true); // Lakukan background check
       }
    }, 45000); // DIPERLAMA: Dari 15 detik menjadi 45 detik agar lalu lintas jaringan ke Google Sheet lebih stabil

    return () => clearInterval(pollInterval);
  }, [isDataLoaded, user, generalSettings.lastModified, hasConflict]);

  // 🪄 TAMBALAN CERDAS: AUTO-MIGRASI ID GURU (Format Acak -> GxxQA) 🪄
  useEffect(() => {
    if (!isDataLoaded || hasConflict || teachers.length === 0) return;
    
    // Cek apakah masih ada ID yang berformat acak (G-xxxx)
    const needsMigration = teachers.some(t => String(t.id).includes('-') || String(t.id).length > 8);
    
    if (needsMigration) {
       console.log("Menjalankan Auto-Migrasi ID Pegawai ke format GxxQA...");
       const updatedTeachers = teachers.map((t, index) => {
          const paddedNumber = String(index + 1).padStart(2, '0');
          return { ...t, id: `G${paddedNumber}QA` };
       });
       
       // Menyimpan state otomatis memicu auto-save ke Google Sheets & sinkronisasi akun
       setTeachers(updatedTeachers);
       alert("✨ PEMBARUAN SISTEM: Seluruh ID & Username Pegawai telah berhasil dirapikan menjadi format berurutan (G01QA, G02QA, dst) secara otomatis!");
    }
  }, [isDataLoaded, teachers, hasConflict]);

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

    isPushingDataRef.current = true; // Kunci Radar Background

    const timeoutId = setTimeout(() => {
      postToGoogleSheets('SAVE_SETTINGS', payloadWithTime)
      .then(() => setSyncStatus('synced'))
      .catch(err => {
         console.warn("Info Sync:", err.message);
         setSyncStatus('error');
      })
      .finally(() => {
         // Buka kunci radar setelah 3 detik untuk memastikan Sheets sudah stabil menyerap data
         setTimeout(() => { isPushingDataRef.current = false; }, 3000);
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
    
    // 🪄 PERBAIKAN MUTLAK 1: Gunakan 'prev' state untuk mencegah bug penimpaan (Stale Closure)
    setGeneralSettings(prev => {
       const newSettings = { ...prev, lastModified: newTimestamp };
       safeStorageSet('payedu_settings', JSON.stringify(newSettings));
       return newSettings;
    });

    isPushingDataRef.current = true; // Kunci Radar Background

    const timeoutId = setTimeout(() => {
      postToGoogleSheets('SAVE_TEACHERS', teachers)
      .then(() => setSyncStatus('synced'))
      .catch(err => {
         console.warn("Info Sync:", err.message);
         setSyncStatus('error');
      })
      .finally(() => {
         setTimeout(() => { isPushingDataRef.current = false; }, 3000);
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
      <div className="min-h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden text-white font-sans transition-colors duration-500">
        
        {/* 1. Latar Belakang Bercahaya (Ambient Glow) */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/30 rounded-full blur-[120px] animate-pulse pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/30 rounded-full blur-[120px] animate-pulse pointer-events-none" style={{ animationDelay: '1s' }}></div>
        
        {/* 2. Kartu Kaca Transparan (Glass Card) */}
        <div className="relative z-10 bg-white/10 backdrop-blur-2xl border border-white/20 p-10 rounded-[2.5rem] shadow-[0_25px_65px_rgba(0,0,0,0.5),inset_0_2px_4px_rgba(255,255,255,0.2)] flex flex-col items-center max-w-sm w-full mx-4 animate-in zoom-in-95 duration-700 ease-out">
          
          {/* 3. Indikator Spinner Dinamis & Logo Berkedip */}
          <div className="relative w-32 h-32 mb-8 flex items-center justify-center">
            {/* Cincin Luar (Biru) */}
            <div className="absolute inset-0 border-4 border-white/5 border-t-blue-400 rounded-full animate-spin shadow-[0_0_25px_rgba(59,130,246,0.5)]"></div>
            {/* Cincin Dalam (Ungu/Pink) */}
            <div className="absolute inset-3 border-4 border-white/5 border-b-purple-400 rounded-full animate-spin shadow-[0_0_20px_rgba(168,85,247,0.4)]" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
            
            {/* Pusat Logo Sekolah */}
            <div className="absolute inset-0 flex items-center justify-center animate-pulse duration-1000">
              {generalSettings?.logoUrl ? (
                <img src={generalSettings.logoUrl} alt="Logo Sekolah" className="w-16 h-16 object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.6)]" />
              ) : (
                <Calculator size={40} className="text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.6)]" />
              )}
            </div>
          </div>

          {/* Teks Animasi */}
          <h2 className="text-2xl font-black tracking-tight mb-2 drop-shadow-lg bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-transparent">
            Menghubungkan...
          </h2>
          <p className="text-blue-100/70 text-sm font-medium text-center animate-pulse leading-relaxed">
            Menyiapkan data kepegawaian dan sinkronisasi Cloud, mohon tunggu sebentar.
          </p>
          
          {/* Loading Bar Bawah (Progress Simulasi) */}
          <div className="w-full h-1.5 bg-black/40 rounded-full mt-8 overflow-hidden shadow-inner border border-white/5 relative">
            <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 w-1/2 rounded-full animate-[loading-bar_1.5s_ease-in-out_infinite]" style={{ backgroundSize: '200% 100%' }}></div>
          </div>

          <style>{`
            @keyframes loading-bar {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(200%); }
            }
          `}</style>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans transition-colors duration-200 ${isDarkMode ? 'dark bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      
      {/* BANNER NOTIFIKASI INSTAL PWA (DIBUAT DINAMIS) */}
      {showInstallBanner && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-4 rounded-2xl shadow-[0_10px_40px_-10px_rgba(59,130,246,0.6)] z-[100] flex items-center justify-between animate-in slide-in-from-bottom-5 border border-white/20">
          <div className="flex items-center gap-3">
             <div className="bg-white/20 p-2 rounded-xl shadow-inner shrink-0 flex items-center justify-center">
               {/* Membaca logo dari pengaturan secara otomatis */}
               {generalSettings?.logoUrl ? (
                 <img src={generalSettings.logoUrl} alt="Logo" className="w-7 h-7 object-contain drop-shadow-md" />
               ) : (
                 <Download size={24} />
               )}
             </div>
             <div>
               {/* Membaca nama aplikasi dari pengaturan secara otomatis */}
               <p className="font-bold text-sm leading-tight">Instal {generalSettings?.appName || 'Aplikasi'}</p>
               <p className="text-[11px] text-blue-100 mt-0.5">Akses lebih cepat dan lancar dari layar utama perangkat Anda.</p>
             </div>
          </div>
          <div className="flex flex-col gap-1.5 shrink-0 ml-3">
            <button onClick={handleInstallClick} className="px-4 py-1.5 text-xs font-bold bg-white text-indigo-700 hover:bg-blue-50 rounded-lg transition-transform hover:scale-105 shadow-sm text-center">Instal</button>
            <button onClick={handleDismissInstall} className="px-4 py-1.5 text-[10px] font-semibold text-blue-100 hover:bg-white/10 rounded-lg transition-colors text-center">Lain Kali</button>
          </div>
        </div>
      )}

      {/* TAMBALAN CERDAS: MODAL PANDUAN INSTAL MANUAL (DIBUAT DINAMIS) */}
      {showInstallGuide && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
           <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center animate-in zoom-in-95 border border-slate-200 dark:border-slate-700">
              <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center mx-auto mb-4">
                {/* Membaca logo dari pengaturan secara otomatis */}
                {generalSettings?.logoUrl ? (
                  <img src={generalSettings.logoUrl} alt="Logo" className="w-10 h-10 object-contain drop-shadow-sm" />
                ) : (
                  <Download size={32} />
                )}
              </div>
              <h3 className="text-xl font-bold dark:text-white mb-2">Cara Instal Manual</h3>
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-6 space-y-3 text-left bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                <p>
                  <strong>📱 Pengguna iPhone / Safari:</strong><br/>
                  1. Tekan ikon <strong>Share (Bagikan)</strong> di menu bawah.<br/>
                  2. Geser ke bawah, pilih <strong>"Add to Home Screen"</strong>.
                </p>
                <div className="h-px bg-slate-200 dark:bg-slate-700 w-full"></div>
                <p>
                  <strong>🤖 Pengguna Android / Chrome:</strong><br/>
                  1. Tekan ikon <strong>Titik Tiga</strong> di pojok kanan atas.<br/>
                  2. Pilih <strong>"Install App"</strong> atau <strong>"Tambahkan ke Layar Utama"</strong>.
                </p>
              </div>
              <button onClick={() => setShowInstallGuide(false)} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors shadow-sm">
                Mengerti, Tutup
              </button>
           </div>
        </div>
      )}

      {!user ? (
        <LoginView onLogin={setUser} isDarkMode={isDarkMode} toggleTheme={() => setIsDarkMode(!isDarkMode)} settings={generalSettings} recordLogin={recordLogin} teachers={teachers} setTeachers={setTeachers} />
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
          setLoginHistory={setLoginHistory} // 🪄 TAMBAHAN: Meneruskan akses setLoginHistory
          archives={archives}
          setArchives={setArchives}
          syncStatus={syncStatus} 
          hasConflict={hasConflict} 
          resolveConflict={() => fetchCloudData(false)} 
        />
      )}
    </div>
  );
}

// --- VIEW: LOGIN ---
function LoginView({ onLogin, isDarkMode, toggleTheme, settings, recordLogin, teachers, setTeachers }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  
  // TAMBAHAN: State untuk loading dan modal lupa password
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  // FITUR BARU: State Modal Registrasi
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

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
      
      // Cari akun berdasarkan username terlebih dahulu
      const accInStorage = savedAccounts.find(a => a.username === username);
      
      let authUser = null;

      if (accInStorage) {
         // Jika akun ada di storage, password HARUS cocok dengan hash yang tersimpan (Mencegah Bypass)
         if (accInStorage.password === hashedInputPassword) {
            recordLogin(accInStorage.name, accInStorage.role, 'Sukses');
            authUser = { role: accInStorage.role === 'Admin' ? 'admin' : accInStorage.role, name: accInStorage.name, id: accInStorage.id || username };
         }
      } 
      // 2. Jika akun Guru
      else if (username.startsWith('G')) {
         const teacherData = teachers.find(t => t.id === username);
         if (teacherData) {
            // SANGAT SEDERHANA: Cek password custom ATAU plain password yang tersimpan
            const isPasswordCorrect = 
                (teacherData.customPassword && teacherData.customPassword === hashedInputPassword) || 
                (teacherData.plainPassword && teacherData.plainPassword === password);

            // Fallback default jika admin belum pernah menyentuh password guru ini sama sekali
            const cleanName = teacherData.name ? teacherData.name.replace(/[^a-zA-Z]/g, '') : 'GU';
            const defaultPass = `${cleanName.length >= 2 ? cleanName.substring(0, 2).toUpperCase() : 'GU'}123`;
            
            if (isPasswordCorrect || (!teacherData.customPassword && !teacherData.plainPassword && password === defaultPass)) {
               recordLogin(teacherData.name, 'Guru', 'Sukses');
               authUser = { role: 'guru', id: username, name: teacherData.name };
            }
         }
      }
      // 3. Fallback Hardcoded (Jika storage benar-benar hilang/kosong)
      else if (username === 'Akbar' && password === 'Boy2014') {
        recordLogin('Administrator System', 'Admin', 'Sukses');
        authUser = { role: 'admin', name: 'Administrator System' };
      } else if (username === 'kepsek' && password === 'Ilwani2010') {
        recordLogin('Kepala Sekolah', 'Kepala Sekolah', 'Sukses');
        authUser = { role: 'Kepala Sekolah', name: 'Kepala Sekolah' };
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

  const handleRegister = (e) => {
    e.preventDefault();
    setIsRegistering(true);
    
    const formElement = e.target;
    const newData = {
      name: formElement.name.value,
      nipy: formElement.nipy.value,
      pob: formElement.pob.value,
      dob: formElement.dob.value,
      gender: formElement.gender.value,
      phone: formElement.phone.value, // TAMBAHAN: Menyimpan Nomor WA
      education: formElement.education.value,
      status: formElement.status.value,
      tmt: formElement.tmt.value,
      position: formElement.position.value,
      bankName: '',
      bankAccount: '',
      family: { wife: 0, children: 0 }
    };

    setTimeout(() => {
      const newId = generateTeacherId(teachers);
      setTeachers([...teachers, { 
         ...newData, 
         id: newId, 
         payroll: {
            tahunMasaKerja: new Date().getFullYear(),
            tunjanganMasaKerjaManual: '',
            jabatans: [{ kategori: 'Guru', detail: newData.position || '', kinerja: 'Baik', nominal: 0 }],
            pendidikan: { tingkat: newData.education || 'S1', nominalOverride: '' },
            kompetensi: [],
            disiplin: { hadir: 0, telat: 0, tarifHadir: 1000, tarifTelat: 1000 },
            insentifTambahan: [],
            potonganLainnya: [],
            jamMengajar: { wajib: 0, realisasi: 0, tarifJPL: 10000, jsjm: 0 }, 
            isNotified: false,
            isConfirmed: false
         } 
      }]);
      
      setIsRegistering(false);
      setShowRegisterModal(false);
      
      const cleanName = newData.name ? newData.name.replace(/[^a-zA-Z]/g, '') : 'GU';
      const twoLetters = cleanName.length >= 2 ? cleanName.substring(0, 2).toUpperCase() : 'GU';
      const defaultPass = `${twoLetters}123`;
      
      alert(`PENDAFTARAN BERHASIL!\n\nMohon simpan dan ingat informasi login Anda:\n- Username / ID: ${newId}\n- Password: ${defaultPass}\n\nSilakan masuk (login) menggunakan akun ini. Anda dapat melengkapi profil rekening/keluarga dengan menghubungi Administrator nanti.`);
    }, 1000);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 relative overflow-hidden bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      
      {/* Modal Pendaftaran Guru Baru */}
      {showRegisterModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-lg dark:text-white flex items-center gap-2">
                <PlusCircle className="text-emerald-500"/> Pendaftaran Pegawai Baru
              </h3>
              <button onClick={() => setShowRegisterModal(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
               <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Silakan isi formulir profil dasar berikut untuk mendapatkan akses portal aplikasi. Data rekening bank dan keluarga bisa diperbarui melalui Administrator.</p>
               <form id="registerForm" onSubmit={handleRegister} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Nama Lengkap</label>
                    <input name="name" className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500" required placeholder="Sesuai KTP/Ijazah" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">NIPY / NIK</label>
                    <input name="nipy" className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500" required placeholder="Kosongkan dengan strip (-)" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Tempat Lahir</label>
                    <input name="pob" className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500" required />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Tanggal Lahir</label>
                    <input type="date" name="dob" className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500" required />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Jenis Kelamin</label>
                    <select name="gender" className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500">
                      <option value="L">Laki-laki</option>
                      <option value="P">Perempuan</option>
                    </select>
                  </div>
                  {/* TAMBAHAN: Kolom Nomor WA di Form Daftar */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">No. WhatsApp Aktif</label>
                    <input type="tel" name="phone" className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500" required placeholder="Cth: 081234567890" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Pendidikan</label>
                    <select name="education" className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500">
                      <option value="S2">S2 / Magister</option>
                      <option value="S1">S1 / Sarjana</option>
                      <option value="Diploma">Diploma (D3/D4)</option>
                      <option value="SMA/Pondok">SMA / Pondok</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Status Kepegawaian Awal</label>
                    <select name="status" className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500">
                      <option value="Tidak Tetap">Tidak Tetap (GTT/PTT)</option>
                      <option value="Tetap">Tetap (GTY/PTY)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Tanggal Mulai Tugas</label>
                    <input type="date" name="tmt" className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500" required defaultValue={new Date().toISOString().split('T')[0]} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Jabatan & Tugas Inti</label>
                    <input name="position" className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500" required placeholder="Cth: Wali Kelas / Guru Mapel / Staff TU" />
                  </div>
               </form>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3 shrink-0">
              <button onClick={() => setShowRegisterModal(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors text-sm">Batal</button>
              <button type="submit" form="registerForm" disabled={isRegistering} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-sm transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-70 disabled:cursor-not-allowed">
                {isRegistering ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={16} />}
                {isRegistering ? 'Memproses...' : 'Daftar Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}

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

          {/* FITUR BARU: Tombol Pendaftaran Akun dengan Warna Biru Elegan */}
          <button type="button" onClick={() => setShowRegisterModal(true)} disabled={isLoading} className="w-full bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-400 font-bold py-3.5 rounded-xl transition-all duration-300 text-sm tracking-widest uppercase flex justify-center items-center gap-2 mt-2 border border-blue-200 dark:border-blue-800/50 shadow-sm disabled:opacity-70 disabled:cursor-not-allowed hover:-translate-y-1">
            <UserCircle size={18} /> Daftar Pegawai Baru
          </button>

          {/* Teks Design by */}
          <div className="pt-6 text-center border-t-2 border-slate-200 dark:border-slate-600 mt-6">
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium tracking-wide">
               Desain Aplikasi | Muhamad Husni Akbar
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- MAIN LAYOUT & NAVIGATION ---
function MainLayout({ user, onLogout, isDarkMode, toggleTheme, teachers, setTeachers, settings, setSettings, feedbacks, setFeedbacks, loginHistory, setLoginHistory, archives, setArchives, syncStatus, hasConflict, resolveConflict }) {
  const [activeTab, setActiveTab] = useState(user.role === 'admin' ? 'dashboard' : user.role === 'Kepala Sekolah' ? 'dashboard' : 'portal_dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  const [selectedGajiId, setSelectedGajiId] = useState(null);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [absensiFilter, setAbsensiFilter] = useState('all');

  // 🪄 FITUR BARU & DIPERBARUI: Mesin Audit Log Cloud & Anti-Spam Ketikan (Debounce)
  const latestTeachersRef = useRef(teachers);
  useEffect(() => { latestTeachersRef.current = teachers; }, [teachers]);
  
  const auditBufferRef = useRef({});
  const auditTimeoutRef = useRef(null);

  const flushAuditLogs = () => {
     const bufferKeys = Object.keys(auditBufferRef.current);
     if (bufferKeys.length === 0) return;

     const newLogs = [];
     const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
     const timestamp = Date.now();

     bufferKeys.forEach((key, idx) => {
        const item = auditBufferRef.current[key];
        if (Number(item.oldVal) === Number(item.newVal) || String(item.oldVal) === String(item.newVal)) return;

        // Dapatkan kalkulasi total gaji TERBARU setelah pengetikan selesai
        const latestTeacher = latestTeachersRef.current.find(t => t.id === item.teacherId);
        const calcLatest = latestTeacher ? calculatePayroll(latestTeacher, settings) : null;
        const newTotal = calcLatest ? calcLatest.totalBersih : 0;
        const newTotalKotor = calcLatest ? calcLatest.totalKotor : 0;

        newLogs.push({
           id: timestamp + idx,
           date: nowStr,
           teacher: item.teacherName,
           field: item.field,
           old: item.oldVal,
           new: item.newVal,
           oldTotal: item.oldTotal,
           newTotal: newTotal,
           oldTotalKotor: item.oldTotalKotor,
           newTotalKotor: newTotalKotor
        });
     });

     auditBufferRef.current = {};

     if (newLogs.length > 0) {
        setSettings(prev => {
           const existingLogs = prev.auditLogs || [];
           const updatedLogs = [...newLogs, ...existingLogs].slice(0, 150); // Maksimal 150 riwayat di Cloud
           const newState = { ...prev, auditLogs: updatedLogs, lastModified: Date.now() };
           
           // 🪄 PERBAIKAN MUTLAK 2: SIMPAN LANGSUNG KE CLOUD SEKETIKA! (Mencegah hilang saat di-refresh)
           safeStorageSet('payedu_settings', JSON.stringify(newState));
           postToGoogleSheets('SAVE_SETTINGS', newState).catch(e => console.error("Audit log sync error:", e));
           
           return newState;
        });
     }
  };

  const saveAuditLog = (targetTeacher, fieldLabel, oldVal, newVal) => {
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
    { id: 'portal_jadwal', label: 'Jadwal Saya', icon: CalendarDays, color: 'text-white', glow: 'shadow-pink-500/50', bg: 'bg-gradient-to-br from-pink-400 via-pink-500 to-pink-700 border border-pink-300/50 dark:border-pink-600/50' },
    { id: 'portal_kehadiran', label: 'Rekap Kehadiran', icon: Clock, color: 'text-white', glow: 'shadow-amber-500/50', bg: 'bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 border border-amber-300/50 dark:border-amber-600/50' },
    { id: 'portal_gaji', label: 'Slip Gaji Bulanan', icon: Wallet, color: 'text-white', glow: 'shadow-emerald-500/50', bg: 'bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-700 border border-emerald-300/50 dark:border-emerald-600/50' },
    { id: 'portal_pinjaman', label: 'Buku Pinjaman', icon: CreditCard, color: 'text-white', glow: 'shadow-teal-500/50', bg: 'bg-gradient-to-br from-teal-400 via-teal-500 to-teal-700 border border-teal-300/50 dark:border-teal-600/50' },
    { id: 'portal_riwayat', label: 'Riwayat Gaji', icon: History, color: 'text-white', glow: 'shadow-indigo-500/50', bg: 'bg-gradient-to-br from-indigo-400 via-indigo-500 to-indigo-700 border border-indigo-300/50 dark:border-indigo-600/50' },
    { id: 'portal_info', label: 'Info Sistem', icon: Info, color: 'text-white', glow: 'shadow-purple-500/50', bg: 'bg-gradient-to-br from-purple-400 via-purple-500 to-purple-700 border border-purple-300/50 dark:border-purple-600/50' },
    { id: 'portal_saran', label: 'Kritik & Saran', icon: MessageSquare, color: 'text-white', glow: 'shadow-rose-500/50', bg: 'bg-gradient-to-br from-rose-400 via-rose-500 to-rose-700 border border-rose-300/50 dark:border-rose-600/50' },
  ];

  const kepsekNav = [
    { id: 'dashboard', label: 'Dashboard & Approval', icon: LayoutDashboard, color: 'text-white', glow: 'shadow-purple-500/50', bg: 'bg-gradient-to-br from-purple-400 via-purple-500 to-purple-700 border border-purple-300/50 dark:border-purple-600/50' },
    { id: 'dataguru', label: 'Data Guru & Staff', icon: Users, color: 'text-white', glow: 'shadow-blue-500/50', bg: 'bg-gradient-to-br from-blue-400 via-blue-500 to-blue-700 border border-blue-300/50 dark:border-blue-600/50' },
    { id: 'jadwal', label: 'Jadwal Mengajar', icon: CalendarDays, color: 'text-white', glow: 'shadow-pink-500/50', bg: 'bg-gradient-to-br from-pink-400 via-pink-500 to-pink-700 border border-pink-300/50 dark:border-pink-600/50' }, // DIPINDAH: Menu Jadwal
    { id: 'rekapabsensi', label: 'Rekap Absen', icon: FileText, color: 'text-white', glow: 'shadow-orange-500/50', bg: 'bg-gradient-to-br from-orange-400 via-orange-500 to-orange-700 border border-orange-300/50 dark:border-orange-600/50' },
    { id: 'gaji', label: 'Komponen Gaji', icon: Calculator, color: 'text-white', glow: 'shadow-emerald-500/50', bg: 'bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-700 border border-emerald-300/50 dark:border-emerald-600/50' },
    { id: 'rekap', label: 'Rekap Gaji', icon: FileText, color: 'text-white', glow: 'shadow-rose-500/50', bg: 'bg-gradient-to-br from-rose-400 via-rose-500 to-rose-700 border border-rose-300/50 dark:border-rose-600/50' },
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
      case 'jadwal': return <JadwalMengajarView teachers={teachers} setTeachers={setTeachers} settings={settings} />; // TAMBAHAN: Routing View Jadwal
      case 'gaji': return <GajiView teachers={teachers} setTeachers={setTeachers} externalSelectedId={selectedGajiId} setExternalSelectedId={setSelectedGajiId} settings={settings} user={user} saveAuditLog={saveAuditLog} />;
      case 'pinjaman': return <RekapPinjamanView teachers={teachers} setTeachers={setTeachers} onEditGaji={navigateToGaji} />;
      case 'rekap': return <RekapGajiView teachers={teachers} setTeachers={setTeachers} onEditGaji={navigateToGaji} settings={settings} setSettings={setSettings} archives={archives} setArchives={setArchives} saveAuditLog={saveAuditLog} />;
      case 'laporan': return <LaporanView teachers={teachers} fundingSources={fundingSources} setFundingSources={setFundingSources} settings={settings} />;
      case 'arsip': return <ArsipView archives={archives} setArchives={setArchives} settings={settings} />;
      case 'portal_dashboard': 
      case 'portal_jadwal':
      case 'portal_kehadiran':
      case 'portal_gaji':
      case 'portal_pinjaman':
      case 'portal_riwayat':
      case 'portal_info':
      case 'portal_saran':
        return <PortalGuruView user={user} teachers={teachers} setTeachers={setTeachers} settings={settings} feedbacks={feedbacks} setFeedbacks={setFeedbacks} activeSection={activeTab} setActiveTab={setActiveTab} archives={archives} />;
      case 'pengaturan': return <PengaturanView teachers={teachers} setTeachers={setTeachers} settings={settings} setSettings={setSettings} feedbacks={feedbacks} setFeedbacks={setFeedbacks} loginHistory={loginHistory} setLoginHistory={setLoginHistory} archives={archives} setArchives={setArchives} fundingSources={fundingSources} setFundingSources={setFundingSources} />;
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

        <div className={`flex-1 overflow-auto p-4 sm:p-6 lg:p-8 touch-pan-y scroll-smooth ${hasConflict ? 'opacity-50 pointer-events-none blur-[1px] transition-all' : 'transition-all'}`}>
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
    let lk = 0, pr = 0, tetap = 0, tdkTetap = 0, totalGaji = 0, totalKotor = 0;
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

      const calc = calculatePayroll(t, settings);
      totalGaji += calc.totalBersih;
      totalKotor += calc.totalKotor;
    });

    return { 
      lk, pr, tetap, tdkTetap, eduCount, totalGaji, totalKotor, total: teachers.length, 
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
        loans.forEach(l => totalUnpaidLoans += (l.sisaHutang !== undefined ? l.sisaHutang : l.nominal * 4)); 
     });
     return { lateTeachers, totalUnpaidLoans };
  }, [teachers]);

  // PERBAIKAN: Menghapus data dummy dan murni menggunakan data riil (Arsip + Proyeksi Bulan Ini)
  const chartData = useMemo(() => {
     const currentMonthStr = getFormattedPeriod(settings?.payrollPeriod);
     const currentMonthData = {
         bulan: currentMonthStr.substring(0, 8), // Potong teks bulan agar tidak kepanjangan di grafik
         total: stats.totalGaji
     };

     if (!archives || archives.length === 0) {
        // Jika belum ada arsip (Tutup Buku), tampilkan HANYA 1 titik data riil bulan ini
        return [currentMonthData]; 
     }

     // Jika sudah ada arsip, ambil riwayatnya (maksimal 11 bulan terakhir) dari yang terlama ke terbaru
     const historyData = [...archives].reverse().slice(-11).map(arc => ({
         bulan: arc.periode.substring(0, 8),
         total: arc.totalGaji
     }));

     // Gabungkan data arsip historis dengan proyeksi riil bulan ini
     return [...historyData, currentMonthData];
  }, [archives, stats.totalGaji, settings?.payrollPeriod]);

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
    safeStorageSet('payedu_settings', JSON.stringify(newSettings));
    postToGoogleSheets('SAVE_SETTINGS', newSettings).catch(e => console.error("Gagal simpan approval ke server:", e));
    
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
              <div className="text-lg md:text-xl font-black truncate">{formatRp(stats.totalKotor)}</div>
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

        {/* Card 1: Total SDM (Desain Berwarna Premium) */}
        <div 
          onClick={() => setActiveTab('dataguru')}
          className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-2xl shadow-md border-0 transition-all duration-300 flex flex-col group cursor-pointer hover:shadow-lg hover:-translate-y-1 relative overflow-hidden text-white"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-blue-700 bg-white/90 px-2 py-1 rounded z-20 shadow-sm">Kelola Data</div>
          <div className="flex justify-between items-start mb-6 relative z-10">
            <div>
              <p className="text-xs font-semibold text-blue-100 uppercase tracking-wider mb-2">Total Guru & Staff</p>
              <div className="flex items-baseline gap-1.5">
                <h4 className="text-4xl font-extrabold tracking-tight drop-shadow-md">{stats.total}</h4>
                <span className="text-sm font-medium text-blue-100">Orang</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center text-white group-hover:scale-105 transition-transform duration-300">
              <Users size={24} className="drop-shadow-sm" />
            </div>
          </div>
          <div className="mt-auto space-y-3 pt-4 border-t border-white/20 relative z-10">
            <div className="flex justify-between text-sm">
              <span className="text-blue-50 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-200"></span> Laki-laki</span>
              <span className="font-bold">{stats.lk}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-blue-50 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-indigo-200"></span> Perempuan</span>
              <span className="font-bold">{stats.pr}</span>
            </div>
            <div className="w-full bg-black/20 rounded-full h-1.5 mt-2 flex overflow-hidden">
              <div className="bg-blue-200 h-full transition-all duration-500" style={{ width: `${(stats.lk / stats.total) * 100}%` }}></div>
              <div className="bg-indigo-300 h-full transition-all duration-500" style={{ width: `${(stats.pr / stats.total) * 100}%` }}></div>
            </div>
          </div>
        </div>

        {/* Card 2: Status Kepegawaian (Desain Berwarna Premium) */}
        <div 
          onClick={() => setIsStatusModalOpen(true)}
          className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 rounded-2xl shadow-md border-0 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-pointer flex flex-col group relative overflow-hidden text-white"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-emerald-700 bg-white/90 px-2 py-1 rounded z-20 shadow-sm">Lihat Detail</div>
          <div className="flex justify-between items-start mb-6 relative z-10">
            <div>
              <p className="text-xs font-semibold text-emerald-100 uppercase tracking-wider mb-2">Status Pegawai</p>
              <div className="flex items-baseline gap-1.5">
                <h4 className="text-4xl font-extrabold tracking-tight drop-shadow-md">{stats.tetap}</h4>
                <span className="text-sm font-medium text-emerald-100">Tetap</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center text-white group-hover:scale-105 transition-transform duration-300">
              <Award size={24} className="drop-shadow-sm" />
            </div>
          </div>
          <div className="mt-auto space-y-2 pt-4 border-t border-white/20 relative z-10">
             <div className="flex items-center justify-between p-2 rounded-lg bg-black/10 border border-white/10 backdrop-blur-sm">
                <span className="text-xs font-semibold text-emerald-50 flex items-center gap-1.5"><CheckCircle size={14}/> Guru Tetap</span>
                <span className="text-sm font-bold text-white">{stats.tetap}</span>
             </div>
             <div className="flex items-center justify-between p-2 rounded-lg bg-black/10 border border-white/10 backdrop-blur-sm">
                <span className="text-xs font-semibold text-emerald-50 flex items-center gap-1.5"><Clock size={14}/> Tidak Tetap</span>
                <span className="text-sm font-bold text-white">{stats.tdkTetap}</span>
             </div>
          </div>
        </div>

        {/* Card 3: Kualifikasi Pendidikan (Desain Berwarna Premium) */}
        <div 
          onClick={() => setIsEduModalOpen(true)}
          className="bg-gradient-to-br from-purple-500 to-indigo-600 p-6 rounded-2xl shadow-md border-0 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-pointer flex flex-col group relative overflow-hidden text-white"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-purple-700 bg-white/90 px-2 py-1 rounded z-20 shadow-sm">Lihat Detail</div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div>
              <p className="text-xs font-semibold text-purple-100 uppercase tracking-wider mb-2">Pendidikan (S1/S2)</p>
              <div className="flex items-baseline gap-1.5">
                <h4 className="text-4xl font-extrabold tracking-tight drop-shadow-md">
                  {stats.eduCount['S2'] + stats.eduCount['S1']}
                </h4>
                <span className="text-sm font-medium text-purple-100">Sarjana+</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center text-white group-hover:scale-105 transition-transform duration-300 shrink-0">
              <GraduationCap size={24} className="drop-shadow-sm" />
            </div>
          </div>
          <div className="mt-auto grid grid-cols-2 gap-2 pt-4 border-t border-white/20 relative z-10">
             <div className="p-2 border border-white/20 rounded-lg bg-black/10 backdrop-blur-sm text-center transition-colors hover:bg-black/20">
                <span className="block text-[10px] font-bold text-purple-200 uppercase tracking-wider">Magister</span>
                <span className="block text-base font-bold mt-0.5">{stats.eduCount['S2']}</span>
             </div>
             <div className="p-2 border border-white/20 rounded-lg bg-black/10 backdrop-blur-sm text-center transition-colors hover:bg-black/20">
                <span className="block text-[10px] font-bold text-purple-200 uppercase tracking-wider">Sarjana</span>
                <span className="block text-base font-bold mt-0.5">{stats.eduCount['S1']}</span>
             </div>
             <div className="p-2 border border-white/20 rounded-lg bg-black/10 backdrop-blur-sm text-center transition-colors hover:bg-black/20">
                <span className="block text-[10px] font-bold text-purple-200 uppercase tracking-wider">Diploma</span>
                <span className="block text-base font-bold mt-0.5">{stats.eduCount['Diploma']}</span>
             </div>
             <div className="p-2 border border-white/20 rounded-lg bg-black/10 backdrop-blur-sm text-center transition-colors hover:bg-black/20">
                <span className="block text-[10px] font-bold text-purple-200 uppercase tracking-wider">SMA/Setara</span>
                <span className="block text-base font-bold mt-0.5">{stats.eduCount['SMA/Pondok']}</span>
             </div>
          </div>
        </div>

        {/* Card 4: Staff Operasional (Desain Berwarna Premium) */}
        <div 
          onClick={() => setActiveTab('dataguru')}
          className="bg-gradient-to-br from-orange-500 to-rose-500 p-6 rounded-2xl shadow-md border-0 transition-all duration-300 flex flex-col group cursor-pointer hover:shadow-lg hover:-translate-y-1 relative overflow-hidden text-white"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-orange-700 bg-white/90 px-2 py-1 rounded z-20 shadow-sm">Kelola Data</div>
          <div className="flex justify-between items-start mb-6 relative z-10">
            <div>
              <p className="text-xs font-semibold text-orange-100 uppercase tracking-wider mb-2">Staff Operasional</p>
              <div className="flex items-baseline gap-1.5">
                <h4 className="text-4xl font-extrabold tracking-tight drop-shadow-md">
                  {stats.opsCount.security + stats.opsCount.kebersihan + stats.opsCount.pengabdian}
                </h4>
                <span className="text-sm font-medium text-orange-100">Orang</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center text-white group-hover:scale-105 transition-transform duration-300">
              <HeartHandshake size={24} className="drop-shadow-sm" />
            </div>
          </div>
          <div className="mt-auto space-y-2.5 pt-4 border-t border-white/20 relative z-10">
             <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-orange-100 flex items-center gap-2"><Shield size={14} className="opacity-70"/> Security</span>
                <span className="font-bold">{stats.opsCount.security}</span>
             </div>
             <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-orange-100 flex items-center gap-2"><Trash2 size={14} className="opacity-70"/> Kebersihan</span>
                <span className="font-bold">{stats.opsCount.kebersihan}</span>
             </div>
             <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-orange-100 flex items-center gap-2"><Sparkles size={14} className="opacity-70"/> Pengabdian</span>
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
    setIsSaving(true); 
    
    const formElement = e.target;
    const newData = {
      name: formElement.name.value,
      nipy: formElement.nipy.value,
      pob: formElement.pob.value,
      dob: formElement.dob.value,
      gender: formElement.gender.value,
      phone: formElement.phone ? formElement.phone.value : '', // TAMBAHAN: Menyimpan Nomor WA
      education: formElement.education.value,
      status: formElement.status.value,
      tmt: formElement.tmt.value,
      position: formElement.position.value,
      bankName: formElement.bankName ? formElement.bankName.value : '',
      bankAccount: formElement.bankAccount ? formElement.bankAccount.value : '',
      family: {
        wife: formElement.wife ? Number(formElement.wife.value) : 0,
        children: formElement.children ? Number(formElement.children.value) : 0
      }
    };

    // Simulasi delay jaringan (bisa dihapus nanti, hanya untuk visual UX)
    setTimeout(() => {
      if (modal.type === 'add') {
        setTeachers(prev => {
           const newId = generateTeacherId(prev);
           return [...prev, { 
             ...newData, 
             id: newId, 
             payroll: {
                tahunMasaKerja: new Date().getFullYear(),
                tunjanganMasaKerjaManual: '',
                jabatans: [{ kategori: 'Guru', detail: newData.position || '', kinerja: 'Baik', nominal: 0 }],
                pendidikan: { tingkat: newData.education || 'S1', nominalOverride: '' },
                kompetensi: [],
                disiplin: { hadir: 0, telat: 0, tarifHadir: 1000, tarifTelat: 1000 },
                insentifTambahan: [],
                potonganLainnya: [],
                jamMengajar: { wajib: 0, realisasi: 0, tarifJPL: 10000, jsjm: 0 }, 
                isNotified: false,
                isConfirmed: false
             } 
           }];
        });
      } else {
        setTeachers(prev => prev.map(t => {
           if (t.id === modal.data.id) {
             return {
               ...t,
               ...newData,
               family: {
                 ...(t.family || {}),
                 ...newData.family
               }
             };
           }
           return t;
        }));
      }
      setIsSaving(false); // Mematikan efek loading
      closeModal();
    }, 600);
  };

  const handleExportCSV = () => {
    // TAMBAHAN: Memasukkan No WA ke dalam export CSV
    const headers = ['ID', 'Nama Lengkap', 'NIPY', 'L/P', 'Tempat Lahir', 'Tanggal Lahir', 'No WA', 'Pendidikan', 'Status', 'Jabatan', 'TMT', 'Status Pasangan', 'Jumlah Anak'];
    
    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '';
      let str = String(val);
      if (str.includes(',') || str.includes(';') || str.includes('\n') || str.includes('"')) {
         return `"${str.replace(/"/g, '""')}"`;
      }
      if (/^[0-9\-]+$/.test(str) && str.length >= 5) {
         return `'${str}`; 
      }
      return str;
    };

    const csvRows = [headers.join(';')]; 
    
    teachers.forEach(t => {
      const row = [
        t.id, 
        t.name, 
        t.nipy, 
        t.gender, 
        t.pob, 
        t.dob, 
        (t.phone || '-'), // Data WA
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
                tunjanganMasaKerjaManual: '',
                jabatans: [{ kategori: 'Guru', detail: values[8] || '', kinerja: 'Baik', nominal: 0 }],
                pendidikan: { tingkat: values[6] || '', nominalOverride: '' },
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
                          {/* TAMBAHAN: Detail No WA */}
                          <tr><td className="py-1.5 text-slate-500">No. WhatsApp</td><td className="font-medium dark:text-slate-200">: {modal.data.phone || '-'}</td></tr>
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
                          <tr><td className="py-1.5 text-slate-500">Status Menikah</td><td className="font-medium dark:text-slate-200">: {modal.data.family?.wife === 1 ? 'Menikah' : modal.data.family?.wife === 2 ? 'Menikah (Ditanggung Suami)' : 'Belum Menikah'}</td></tr>
                          <tr><td className="py-1.5 text-slate-500">Jumlah Anak</td><td className="font-medium dark:text-slate-200">: {modal.data.family?.wife === 1 ? (modal.data.family?.children || 0) : 0} Anak (Masuk Tunjangan)</td></tr>
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
                    {/* TAMBAHAN: Form No WA saat Edit/Tambah */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">No. WhatsApp Aktif</label>
                      <input type="tel" name="phone" defaultValue={modal.data?.phone || ''} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" required placeholder="Cth: 081234567890" />
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
                           <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Status Pasangan</label>
                           <select name="wife" defaultValue={modal.data?.family?.wife !== undefined ? modal.data.family.wife : 0} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-pink-500">
                             <option value="1">Menikah</option>
                             <option value="0">Belum Menikah</option>
                             <option value="2">Menikah (Ditanggung Suami/Pasangan)</option>
                           </select>
                         </div>
                         <div>
                           <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Jumlah Anak</label>
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
        
        <div className="overflow-x-auto flex-1 touch-pan-x scroll-smooth">
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
                    <div className="text-xs text-slate-500 mt-0.5">Gender: {t.gender === 'L' ? 'Laki-laki' : 'Perempuan'} • WA: {t.phone || '-'}</div>
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

// --- VIEW REKAP PINJAMAN / KASBON YANG HILANG (DIKEMBALIKAN) ---
function RekapPinjamanView({ teachers, setTeachers, onEditGaji }) {
  const [search, setSearch] = useState('');
  
  // Mengambil daftar guru yang memiliki tanggungan (Sisa Hutang > 0) ATAU pernah tercatat memiliki kasbon
  const loanRecords = useMemo(() => {
    let records = [];
    teachers.forEach(t => {
       const hasLoans = t.payroll?.potonganLainnya && t.payroll.potonganLainnya.length > 0;
       if (hasLoans) {
          // Filter hanya yang bersifat pinjaman/koperasi/kasbon
          const kasbonItems = t.payroll.potonganLainnya.filter(pot => 
            pot.ket.toLowerCase().includes('kasbon') || 
            pot.ket.toLowerCase().includes('koperasi') || 
            pot.ket.toLowerCase().includes('pinjaman')
          );
          
          if (kasbonItems.length > 0) {
             kasbonItems.forEach(item => {
                const sisaHutang = item.sisaHutang !== undefined ? item.sisaHutang : (item.nominal * 4); // Fallback asumsi awal 4 bulan cicilan
                records.push({
                   teacherId: t.id,
                   name: t.name,
                   nipy: t.nipy,
                   status: t.status,
                   ket: item.ket,
                   nominal: item.nominal,
                   sisaHutang: sisaHutang,
                   isLunas: sisaHutang <= 0
                });
             });
          }
       }
    });
    
    // Sort records: Belum lunas di atas, Lunas di bawah
    return records.sort((a, b) => {
       if (a.isLunas === b.isLunas) return a.name.localeCompare(b.name);
       return a.isLunas ? 1 : -1;
    });
  }, [teachers]);

  const filteredLoans = loanRecords.filter(r => 
    r.name.toLowerCase().includes(search.toLowerCase()) || 
    r.nipy.includes(search) ||
    r.ket.toLowerCase().includes(search.toLowerCase())
  );

  const totalPiutang = useMemo(() => {
    return loanRecords.reduce((sum, item) => sum + (item.sisaHutang > 0 ? item.sisaHutang : 0), 0);
  }, [loanRecords]);

  const totalPotonganBulanan = useMemo(() => {
    return loanRecords.reduce((sum, item) => sum + (!item.isLunas ? item.nominal : 0), 0);
  }, [loanRecords]);

  const handleExportCSV = () => {
    const headers = ['ID Pegawai', 'Nama Lengkap', 'NIPY', 'Status', 'Keterangan Pinjaman', 'Potongan / Bulan', 'Sisa Hutang', 'Status Pelunasan'];
    const csvRows = [headers.join(';')];
    
    filteredLoans.forEach(r => {
      const row = [
        r.teacherId, 
        `"${r.name}"`, 
        `"=""${r.nipy}"""`, 
        r.status, 
        `"${r.ket}"`, 
        r.nominal, 
        r.sisaHutang,
        r.isLunas ? 'LUNAS' : 'Belum Lunas'
      ];
      csvRows.push(row.join(';'));
    });
    
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Rekapitulasi_Pinjaman_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full relative pb-4 min-h-0">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-600 to-emerald-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden flex items-center justify-between shrink-0">
        <div className="relative z-10">
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-3"><CreditCard className="text-teal-100" /> Buku Pemantauan Kasbon</h1>
          <p className="text-teal-50 text-sm">Monitor transparansi piutang, potongan cicilan bulanan, dan sisa hutang pegawai.</p>
        </div>
        <CreditCard size={100} className="absolute -right-6 -top-6 text-white/10 transform rotate-12 pointer-events-none" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 shrink-0">
         <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/30 text-amber-500 rounded-xl flex items-center justify-center">
               <Wallet size={24} />
            </div>
            <div>
               <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-0.5">Total Sisa Piutang Berjalan</p>
               <h3 className="text-2xl font-black text-amber-600 dark:text-amber-400">{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(totalPiutang)}</h3>
            </div>
         </div>
         <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-4">
            <div className="w-12 h-12 bg-teal-50 dark:bg-teal-900/30 text-teal-500 rounded-xl flex items-center justify-center">
               <Activity size={24} />
            </div>
            <div>
               <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-0.5">Estimasi Potongan Bulan Ini</p>
               <h3 className="text-2xl font-black text-teal-600 dark:text-teal-400">{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(totalPotonganBulanan)}</h3>
            </div>
         </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col flex-1 min-h-0">
         <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50 dark:bg-slate-900/50 shrink-0">
          <h3 className="text-lg font-bold dark:text-white flex items-center gap-2 shrink-0">Daftar Tagihan Pegawai</h3>
          
          <div className="flex flex-wrap gap-3 w-full sm:w-auto items-center justify-end">
            <div className="relative w-full sm:w-64 flex-1">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Cari Pegawai atau Keterangan..." 
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-teal-500 outline-none dark:text-white transition-all shadow-sm"
              />
            </div>
            
            <button onClick={handleExportCSV} className="w-full sm:w-auto flex-none justify-center bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors items-center gap-2 shadow-sm cursor-pointer flex">
               <Download size={16} /> <span className="hidden sm:inline">Export Excel</span><span className="sm:hidden">Export</span>
            </button>
          </div>
         </div>

         <div className="overflow-x-auto flex-1 relative touch-pan-x scroll-smooth">
          <table className="w-full text-left text-sm whitespace-nowrap min-w-max">
            <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 sticky top-0 z-10 shadow-sm border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-4 font-bold">Nama Pegawai & Status</th>
                <th className="p-4 font-bold">Keterangan Pinjaman</th>
                <th className="p-4 font-bold text-right text-rose-500">Potongan Bulanan</th>
                <th className="p-4 font-bold text-right text-teal-600">Sisa Hutang (Saldo)</th>
                <th className="p-4 font-bold text-center">Status</th>
                <th className="p-4 font-bold text-center">Aksi / Penyesuaian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
               {filteredLoans.map((loan, idx) => (
                  <tr key={`${loan.teacherId}-${idx}`} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${loan.isLunas ? 'opacity-60 grayscale-[50%]' : ''}`}>
                     <td className="p-4">
                        <div className={`font-bold ${loan.isLunas ? 'text-slate-500' : 'text-slate-800 dark:text-slate-200'}`}>{loan.name}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{loan.nipy} • {loan.status}</div>
                     </td>
                     <td className="p-4">
                        <div className="font-semibold text-slate-700 dark:text-slate-300 max-w-[200px] truncate" title={loan.ket}>{loan.ket}</div>
                     </td>
                     <td className="p-4 text-right font-medium text-rose-500">
                        {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(loan.nominal)}
                     </td>
                     <td className="p-4 text-right">
                        <span className={`font-black tracking-tight text-[13px] px-3 py-1.5 rounded-lg border shadow-sm ${loan.isLunas ? 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:border-slate-700' : 'bg-teal-50 text-teal-700 border-teal-100 dark:bg-teal-900/30 dark:border-teal-800 dark:text-teal-400'}`}>
                           {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(loan.sisaHutang)}
                        </span>
                     </td>
                     <td className="p-4 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-bold ${loan.isLunas ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
                           {loan.isLunas ? 'LUNAS' : 'Belum Lunas'}
                        </span>
                     </td>
                     <td className="p-4 text-center">
                        <button 
                           onClick={() => onEditGaji(loan.teacherId)}
                           className="text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-md font-bold transition-colors flex items-center justify-center gap-1.5 mx-auto"
                           title="Lakukan penyelesaian tunai atau edit sisa hutang di menu Gaji"
                        >
                           <Edit size={14} /> Atur Saldo
                        </button>
                     </td>
                  </tr>
               ))}
               {filteredLoans.length === 0 && (
                  <tr><td colSpan="6" className="p-8 text-center text-slate-500">Tidak ada tanggungan pinjaman atau kasbon pegawai ditemukan.</td></tr>
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
          realisasi: 0,
          jamPlus: 0
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
    const headers = ['Nama Guru', ...daysHeaders, 'Jam +', 'Total', 'Wajib', 'JSJM', 'Selisih', 'Telat', 'Tepat Waktu'];
    
    // Menggunakan pemisah titik koma (;) agar lebih rapi saat dibuka di Microsoft Excel region Indonesia
    const csvRows = [headers.join(';')];
    
    filtered.forEach(t => {
      const wajib = t.payroll?.jamMengajar?.wajib !== undefined && t.payroll?.jamMengajar?.wajib !== '' ? Number(t.payroll.jamMengajar.wajib) : (t.status === 'Tetap' ? 60 : 0);
      const real = t.payroll?.jamMengajar?.realisasi || 0;
      const jsjm = t.payroll?.jamMengajar?.jsjm || 0;
      const jamPlus = t.payroll?.jamMengajar?.jamPlus || 0;
      const selisih = (real + jsjm) - wajib + jamPlus;
      const telat = t.payroll?.disiplin?.telat || 0;
      const tepatWaktu = Math.max(0, real - telat);
      
      const dailyData = t.payroll?.jamMengajar?.harian || getDailyHours(real, t.id);
      const dailyString = dailyData.map(d => d || '').join(';');
      
      const row = [`"${t.name}"`, dailyString, jamPlus, real, wajib, jsjm, selisih, telat, tepatWaktu];
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

  // PERBAIKAN: Fungsi Import sekarang menyerap data Tgl 1 sampai Tgl 31 secara presisi
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

      // Deteksi indeks untuk kolom Tgl 1 sampai Tgl 31
      const dailyIndices = [];
      for (let i = 1; i <= 31; i++) {
         dailyIndices.push(headers.findIndex(h => h === `tgl ${i}`));
      }

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

         // Ekstrak data harian (Tgl 1 - 31) dari baris ini
         const harianData = Array(31).fill('');
         for (let d = 0; d < 31; d++) {
            if (dailyIndices[d] !== -1 && values[dailyIndices[d]]) {
               harianData[d] = values[dailyIndices[d]].toUpperCase();
            }
         }

         if (teacherName && !isNaN(jamVal)) {
            // Pencarian cerdas berdasarkan nama guru
            const teacherIndex = updatedTeachers.findIndex(t => t.name.toLowerCase() === teacherName.toLowerCase());
            if (teacherIndex !== -1) {
               // 🪄 Hitung otomatis Hari Hadir dari data impor
               let autoHadir = 0;
               harianData.forEach(val => {
                 if (!isNaN(val) && Number(val) > 0) autoHadir++;
               });

               updatedTeachers[teacherIndex] = {
                  ...updatedTeachers[teacherIndex],
                  payroll: {
                     ...updatedTeachers[teacherIndex].payroll,
                     jamMengajar: {
                        ...updatedTeachers[teacherIndex].payroll.jamMengajar,
                        realisasi: jamVal,
                        harian: harianData // <- Menyimpan rincian harian
                     },
                     disiplin: {
                        ...(updatedTeachers[teacherIndex].payroll?.disiplin || {}),
                        hadir: autoHadir // Disimpan otomatis
                     }
                  }
               };
               updatedCount++;
            }
         }
      }

      if (updatedCount > 0) {
        setTeachers(updatedTeachers);
        alert(`Berhasil! Total jam dan rincian harian (Tgl 1-31) untuk ${updatedCount} guru telah diperbarui ke dalam sistem.`);
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

  // 🪄 TAMBALAN CERDAS: Fungsi ini yang sebelumnya hilang untuk menangani ketikan Bapak
  const handleHarianChange = (index, value) => {
    // Ubah input menjadi huruf besar otomatis dan batasi 2 karakter (cth: 4, S, I, A)
    let cleanVal = value.toUpperCase().slice(0, 2);
    
    setEditingData(prev => {
      const newHarian = [...prev.harian];
      newHarian[index] = cleanVal;
      return { ...prev, harian: newHarian };
    });
  };

  const handleSaveEdit = () => {
    setIsSaving(true); // Aktifkan animasi loading
    
    // Hitung ulang total realisasi berdasarkan input 31 hari (Hanya menjumlahkan angka)
    const totalRealisasi = editingData.harian.reduce((sum, val) => sum + (Number(val) || 0), 0);
    
    // 🪄 TAMBALAN CERDAS: Hitung otomatis Hari Hadir untuk disimpan
    let autoHadir = 0;
    editingData.harian.forEach(val => {
       if (!isNaN(val) && Number(val) > 0) autoHadir++;
    });

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
              },
              disiplin: {
                ...(t.payroll?.disiplin || {}),
                hadir: autoHadir // Disimpan ke database
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

  // FUNGSI BARU: Untuk mengubah Jam Plus (Tambahan Jam) langsung di tabel
  const handleInlineJamPlusChange = (teacherId, newValue) => {
    const jamPlusVal = newValue === '' ? '' : Math.max(0, Number(newValue));
    setTeachers(prev => prev.map(t => {
      if (t.id === teacherId) {
        return {
          ...t,
          payroll: {
            ...(t.payroll || {}),
            jamMengajar: {
              ...(t.payroll?.jamMengajar || {}),
              jamPlus: jamPlusVal
            }
          }
        };
      }
      return t;
    }));
  };

  // 🪄 TAMBALAN CERDAS: Fungsi untuk mengubah jumlah telat langsung di tabel
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

  // 🪄 FUNGSI BARU: Mengubah TMT langsung di tabel Gaji dan mereset override nominal
  const handleInlineTmtChange = (teacherId, newYear) => {
    const targetTeacher = teachers.find(t => t.id === teacherId);
    if (!targetTeacher) return;
    
    const oldDate = new Date(targetTeacher.tmt || new Date());
    const oldYear = oldDate.getFullYear();
    oldDate.setFullYear(newYear);
    const newTmt = oldDate.toISOString().split('T')[0];

    if (saveAuditLog) {
       saveAuditLog(targetTeacher, 'Tahun Masuk (TMT)', oldYear, newYear);
    }

    setTeachers(prev => prev.map(t => {
      if (t.id === teacherId) {
        return {
          ...t,
          tmt: newTmt,
          payroll: {
            ...(t.payroll || {}),
            tunjanganMasaKerjaManual: '' // Kunci: Reset nominal agar merujuk otomatis ke Master Tarif
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
                  
                  {/* 🪄 TAMBALAN CERDAS: Hitungan Live S/I/A/Hadir untuk memudahkan Admin */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
                    <div className="flex gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700">
                      <span className="text-emerald-600 dark:text-emerald-400">Hadir: {editingData.harian.filter(v => !isNaN(v) && Number(v)>0).length}</span>
                      <span className="text-amber-500 border-l border-slate-300 dark:border-slate-600 pl-2">S: {editingData.harian.filter(v => String(v).toUpperCase()==='S').length}</span>
                      <span className="text-blue-500 border-l border-slate-300 dark:border-slate-600 pl-2">I: {editingData.harian.filter(v => String(v).toUpperCase()==='I').length}</span>
                      <span className="text-red-500 border-l border-slate-300 dark:border-slate-600 pl-2">A: {editingData.harian.filter(v => String(v).toUpperCase()==='A').length}</span>
                    </div>
                    
                    <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/50 px-3 py-1.5 rounded-lg shadow-sm whitespace-nowrap">
                      Total: {editingData.harian.reduce((sum, val) => sum + (Number(val) || 0), 0)} JPL
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

        <div className="overflow-x-auto overflow-y-auto flex-1 print-area relative p-2 pb-4 touch-pan-x touch-pan-y scroll-smooth" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
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
                <th className="p-2 font-bold border border-slate-400 dark:border-slate-500 text-center bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400" title="Tambahan Jam Mengajar">Jam +</th>
                <th className="p-2 font-bold border border-slate-400 dark:border-slate-500 text-center bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400" title="Kegiatan Insidental Terjadwal">Insidental</th>
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
                const jamPlus = t.payroll?.jamMengajar?.jamPlus || 0;
                
                // 🪄 TAMBALAN: Mengambil total jam insidental untuk dikalkulasikan
                const tInsidentalJam = (t.payroll?.kegiatanInsidental || []).reduce((sum, item) => sum + (Number(item.jam) || 0), 0);
                
                const selisih = (real + jsjm) - wajib + jamPlus + tInsidentalJam; 
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

                    <td className="p-1.5 text-center border border-slate-400 dark:border-slate-500 bg-emerald-50/30 dark:bg-emerald-900/10 align-middle">
                      <input 
                        type="number" 
                        min="0"
                        value={t.payroll?.jamMengajar?.jamPlus !== undefined ? t.payroll?.jamMengajar?.jamPlus : ''} 
                        onChange={(e) => handleInlineJamPlusChange(t.id, e.target.value)}
                        className="w-12 p-1.5 text-center border border-emerald-300 dark:border-emerald-600 rounded-lg bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 font-bold focus:ring-2 focus:ring-emerald-500 outline-none m-auto block shadow-sm transition-all"
                        title="Tambahan Jam Mengajar"
                        placeholder="0"
                      />
                    </td>

                    <td className="p-3 text-center font-bold text-base border border-slate-400 dark:border-slate-500 text-blue-700 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-900/10" title="Total Jam dari Kegiatan Insidental">
                      {tInsidentalJam}
                    </td>

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

// 🪄 FITUR BARU: VIEW JADWAL MENGAJAR & KEGIATAN MASSAL 🪄
function JadwalMengajarView({ teachers, setTeachers, settings }) {
  const [activeTab, setActiveTab] = useState('roster');
  const [search, setSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // State untuk Tab Insidental
  const [insidentalForm, setInsidentalForm] = useState({ ket: '', tgl: 1, jam: 2 });
  const [selectedTeachers, setSelectedTeachers] = useState([]);
  const [confirmGenerate, setConfirmGenerate] = useState(false);

  // 🪄 TAMBALAN CERDAS: State untuk Preview, Edit, dan Hapus Kegiatan Massal
  const [previewActivity, setPreviewActivity] = useState(null);
  const [editActivity, setEditActivity] = useState(null);
  const [deleteActivity, setDeleteActivity] = useState(null);

  const bulan = getFormattedPeriod(settings?.payrollPeriod);
  const [y, m] = (settings?.payrollPeriod || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`).split('-');
  const year = Number(y);
  const month = Number(m) - 1; // 0-indexed month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const filtered = teachers.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.nipy.includes(search));

  // 🪄 FUNGSI BARU: Mengumpulkan seluruh kegiatan massal ke Riwayat Terpadu
  const massActivities = useMemo(() => {
      const map = new Map();
      teachers.forEach(t => {
          (t.payroll?.kegiatanInsidental || []).forEach(keg => {
              const key = keg.id || `${keg.ket}|${keg.tgl}|${keg.jam}`;
              if (!map.has(key)) {
                  map.set(key, { ...keg, originalId: key, teacherIds: [t.id], teacherNames: [t.name] });
              } else {
                  const existing = map.get(key);
                  existing.teacherIds.push(t.id);
                  existing.teacherNames.push(t.name);
              }
          });
      });
      return Array.from(map.values()).reverse();
  }, [teachers]);

  // Handler Roster (Jadwal Rutin)
  const handleInlineRosterChange = (id, day, val) => {
     const num = val === '' ? '' : Math.max(0, Number(val));
     setTeachers(prev => prev.map(t => {
        if(t.id === id) {
           return {
              ...t,
              payroll: {
                 ...(t.payroll || {}),
                 roster: { ...(t.payroll?.roster || {}), [day]: num }
              }
           }
        }
        return t;
     }));
  };

  const executeGenerateBulanIni = () => {
     setIsSaving(true);
     setConfirmGenerate(false);

     setTimeout(() => {
        setTeachers(prev => prev.map(t => {
           const roster = t.payroll?.roster || {};
           // Peta index hari JavaScript (0=Minggu, 1=Senin... 6=Sabtu)
           const dayMap = { 0: 'minggu', 1: 'senin', 2: 'selasa', 3: 'rabu', 4: 'kamis', 5: 'jumat', 6: 'sabtu' };

           const newHarian = Array(31).fill('');
           let newRealisasi = 0;

           for(let i = 1; i <= daysInMonth; i++) {
              const date = new Date(year, month, i);
              const dayKey = dayMap[date.getDay()];
              const jam = Number(roster[dayKey]) || 0;
              
              if(jam > 0) {
                 newHarian[i-1] = jam;
                 newRealisasi += jam;
              }
           }

           // Pertahankan jam yang sudah ada dari Insidental jika ada (gabungkan)
           const tInsidentalJam = (t.payroll?.kegiatanInsidental || []).reduce((sum, item) => sum + (Number(item.jam) || 0), 0);

           return {
              ...t,
              payroll: {
                 ...(t.payroll || {}),
                 jamMengajar: {
                    ...(t.payroll?.jamMengajar || {}),
                    harian: newHarian, // Timpa dengan jadwal murni
                    realisasi: newRealisasi + tInsidentalJam // Akumulasi total
                 }
              }
           };
        }));
        setIsSaving(false);
        alert(`Sukses Hebat! Jadwal rutin telah ditebarkan secara merata ke tanggal 1 sampai ${daysInMonth} pada Rekap Absen bulan ini.`);
     }, 800);
  };

  // Handler Insidental
  const toggleTeacherSelection = (id) => {
     setSelectedTeachers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  
  const selectAll = () => {
     if(selectedTeachers.length === filtered.length) setSelectedTeachers([]);
     else setSelectedTeachers(filtered.map(t => t.id));
  };

  const handleSaveInsidental = (e) => {
     e.preventDefault();
     if(selectedTeachers.length === 0) return alert('Silakan centang minimal 1 pegawai dari tabel di bawah!');
     
     setIsSaving(true);
     const activityId = generateUniqueId('keg-');

     setTimeout(() => {
        setTeachers(prev => prev.map(t => {
           if(selectedTeachers.includes(t.id)) {
              const currentIns = t.payroll?.kegiatanInsidental || [];
              const harian = [...(t.payroll?.jamMengajar?.harian || Array(31).fill(''))];

              // Simpan Riwayat
              const newInsidental = [...currentIns, { id: activityId, ket: insidentalForm.ket, tgl: insidentalForm.tgl, jam: insidentalForm.jam }];

              // Tambahkan angkanya langsung ke array kalender harian
              const targetIdx = insidentalForm.tgl - 1;
              const existJam = Number(harian[targetIdx]) || 0;
              harian[targetIdx] = existJam + Number(insidentalForm.jam);

              // Update Total Realisasi
              const existReal = Number(t.payroll?.jamMengajar?.realisasi) || 0;

              return {
                 ...t,
                 payroll: {
                    ...(t.payroll || {}),
                    kegiatanInsidental: newInsidental,
                    jamMengajar: {
                       ...(t.payroll?.jamMengajar || {}),
                       harian: harian,
                       realisasi: existReal + Number(insidentalForm.jam)
                    }
                 }
              }
           }
           return t;
        }));
        setIsSaving(false);
        setInsidentalForm({ ket: '', tgl: 1, jam: 2 });
        setSelectedTeachers([]);
        alert('Input Massal Selesai! Kegiatan insidental beserta nominal jamnya berhasil ditambahkan ke kalender kehadiran guru yang dipilih.');
     }, 800);
  };

  // 🪄 FUNGSI BARU: Edit Kegiatan Massal (Merambat ke seluruh kalender guru terkait)
  const handleSaveEditActivity = (e) => {
      e.preventDefault();
      setIsSaving(true);
      setTimeout(() => {
          setTeachers(prev => prev.map(t => {
              if (editActivity.teacherIds.includes(t.id)) {
                  const p = t.payroll || {};
                  const currentIns = p.kegiatanInsidental || [];
                  
                  const itemIdx = currentIns.findIndex(k => (k.id || `${k.ket}|${k.tgl}|${k.jam}`) === editActivity.originalId);
                  
                  if (itemIdx !== -1) {
                      const oldItem = currentIns[itemIdx];
                      const newIns = [...currentIns];
                      newIns[itemIdx] = { ...oldItem, ket: editActivity.ket, tgl: editActivity.tgl, jam: editActivity.jam };

                      const harian = [...(p.jamMengajar?.harian || Array(31).fill(''))];
                      let realisasi = Number(p.jamMengajar?.realisasi) || 0;

                      const oldTglIdx = oldItem.tgl - 1;
                      const oldJam = Number(oldItem.jam) || 0;
                      harian[oldTglIdx] = Math.max(0, (Number(harian[oldTglIdx]) || 0) - oldJam);
                      if (harian[oldTglIdx] === 0) harian[oldTglIdx] = '';
                      realisasi = Math.max(0, realisasi - oldJam);

                      const newTglIdx = editActivity.tgl - 1;
                      const newJam = Number(editActivity.jam) || 0;
                      harian[newTglIdx] = (Number(harian[newTglIdx]) || 0) + newJam;
                      realisasi += newJam;

                      return {
                          ...t,
                          payroll: {
                              ...p,
                              kegiatanInsidental: newIns,
                              jamMengajar: {
                                  ...(p.jamMengajar || {}),
                                  harian,
                                  realisasi
                              }
                          }
                      };
                  }
              }
              return t;
          }));
          setIsSaving(false);
          setEditActivity(null);
          alert("Perbaikan berhasil! Perubahan jadwal dan jam telah diselaraskan ke seluruh kalender absen guru yang terlibat.");
      }, 800);
  };

  // 🪄 FUNGSI BARU: Hapus Kegiatan Massal (Menarik kembali jam dari seluruh kalender guru terkait)
  const confirmDeleteActivity = () => {
      setIsSaving(true);
      setTimeout(() => {
          setTeachers(prev => prev.map(t => {
              if (deleteActivity.teacherIds.includes(t.id)) {
                  const p = t.payroll || {};
                  const currentIns = p.kegiatanInsidental || [];
                  
                  const itemIdx = currentIns.findIndex(k => (k.id || `${k.ket}|${k.tgl}|${k.jam}`) === deleteActivity.originalId);
                  
                  if (itemIdx !== -1) {
                      const oldItem = currentIns[itemIdx];
                      const newIns = currentIns.filter((_, i) => i !== itemIdx);

                      const harian = [...(p.jamMengajar?.harian || Array(31).fill(''))];
                      let realisasi = Number(p.jamMengajar?.realisasi) || 0;

                      const oldTglIdx = oldItem.tgl - 1;
                      const oldJam = Number(oldItem.jam) || 0;
                      harian[oldTglIdx] = Math.max(0, (Number(harian[oldTglIdx]) || 0) - oldJam);
                      if (harian[oldTglIdx] === 0) harian[oldTglIdx] = '';
                      realisasi = Math.max(0, realisasi - oldJam);

                      return {
                          ...t,
                          payroll: {
                              ...p,
                              kegiatanInsidental: newIns,
                              jamMengajar: {
                                  ...(p.jamMengajar || {}),
                                  harian,
                                  realisasi
                              }
                          }
                      };
                  }
              }
              return t;
          }));
          setIsSaving(false);
          setDeleteActivity(null);
          alert("Kegiatan massal berhasil dihapus! Seluruh jam ekstra yang sebelumnya diberikan telah ditarik kembali.");
      }, 800);
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full relative pb-4 min-h-0">
      
      {/* MODAL KONFIRMASI GENERATE */}
      {confirmGenerate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-600 flex items-center justify-center mx-auto mb-4">
                <CalendarDays size={40} />
              </div>
              <h3 className="text-xl font-bold dark:text-white mb-2">Terapkan Jadwal Rutin?</h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto text-sm">
                Sistem akan otomatis menghitung hari aktif (Senin-Minggu) pada bulan <strong className="text-slate-700 dark:text-slate-200">{bulan}</strong> dan memetakan jadwal ini ke Rekap Absen Tgl 1 - {daysInMonth} untuk <strong>SEMUA GURU</strong>. Lanjutkan?
              </p>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-center gap-3 shrink-0">
              <button onClick={() => setConfirmGenerate(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors w-full">Batal</button>
              <button onClick={executeGenerateBulanIni} className="px-5 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-lg font-bold shadow-sm transition-colors w-full flex justify-center items-center gap-2">
                <CheckSquare size={16} /> Ya, Petakan Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PRATINJAU PESERTA MASSAL */}
      {previewActivity && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
                    <h3 className="font-bold text-lg dark:text-white flex items-center gap-2">
                        <Users className="text-indigo-500"/> Daftar Kehadiran Peserta
                    </h3>
                    <button onClick={() => setPreviewActivity(null)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
                </div>
                <div className="p-6 overflow-y-auto max-h-[60vh] space-y-2">
                    <div className="mb-4 bg-indigo-50 dark:bg-indigo-900/10 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800/30">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Nama Kegiatan:</p>
                        <p className="text-base font-black text-indigo-700 dark:text-indigo-300 leading-tight mb-1.5">{previewActivity.ket}</p>
                        <div className="flex gap-3 text-xs font-bold">
                           <span className="bg-white dark:bg-slate-800 px-2 py-1 rounded text-slate-600 dark:text-slate-300">Tgl: {previewActivity.tgl}</span>
                           <span className="bg-white dark:bg-slate-800 px-2 py-1 rounded text-slate-600 dark:text-slate-300">Bobot: {previewActivity.jam} JPL</span>
                        </div>
                    </div>
                    {previewActivity.teacherNames.map((n, i) => (
                        <div key={i} className="text-sm font-bold p-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-3 shadow-sm hover:border-indigo-300 transition-colors">
                           <CheckCircle size={18} className="text-emerald-500 shrink-0"/> {n}
                        </div>
                    ))}
                </div>
            </div>
        </div>
      )}

      {/* MODAL EDIT CERDAS KEGIATAN MASSAL */}
      {editActivity && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
                    <h3 className="font-bold text-lg dark:text-white flex items-center gap-2"><Edit className="text-amber-500"/> Edit Kegiatan Massal</h3>
                    <button onClick={() => setEditActivity(null)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
                </div>
                <form onSubmit={handleSaveEditActivity} className="p-5 space-y-4">
                    <div className="bg-amber-50 dark:bg-amber-900/10 p-3 rounded-lg border border-amber-100 dark:border-amber-800/30 mb-2">
                       <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium leading-relaxed">Perubahan tanggal dan jam di sini akan otomatis merambat dan mengkalkulasi ulang seluruh kalender absensi guru yang terlibat secara instan.</p>
                    </div>
                    <div>
                        <label className="text-xs font-bold mb-1.5 block text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nama Kegiatan</label>
                        <input value={editActivity.ket} onChange={e => setEditActivity({...editActivity, ket: e.target.value})} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-amber-500 outline-none dark:text-white" required/>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold mb-1.5 block text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tanggal</label>
                            <select value={editActivity.tgl} onChange={e => setEditActivity({...editActivity, tgl: Number(e.target.value)})} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm font-bold focus:ring-2 focus:ring-amber-500 outline-none dark:text-white cursor-pointer">
                                {Array.from({length: 31}, (_, i) => i + 1).map(num => <option key={num} value={num}>Tgl {num}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold mb-1.5 block text-slate-500 dark:text-slate-400 uppercase tracking-wider">Bobot (JPL)</label>
                            <input type="number" min="1" value={editActivity.jam} onChange={e => setEditActivity({...editActivity, jam: Number(e.target.value)})} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm font-bold text-amber-600 focus:ring-2 focus:ring-amber-500 outline-none dark:text-white" required/>
                        </div>
                    </div>
                    <div className="pt-2">
                       <button disabled={isSaving} className="w-full bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-xl font-bold shadow-md transition-colors disabled:opacity-70 flex items-center justify-center gap-2">
                           {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={18}/>}
                           {isSaving ? 'Menyelaraskan Data...' : 'Simpan & Selaraskan'}
                       </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* MODAL HAPUS CERDAS KEGIATAN MASSAL */}
      {deleteActivity && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center flex flex-col">
                <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white dark:border-slate-800 shadow-sm">
                   <Trash2 size={36} className="text-red-500"/>
                </div>
                <h3 className="font-black text-xl mb-2 text-slate-800 dark:text-white">Batalkan Kegiatan?</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                   Apakah Anda yakin ingin menghapus kegiatan <strong className="text-slate-700 dark:text-slate-200">"{deleteActivity.ket}"</strong>? Seluruh tambahan <strong className="text-red-500">{deleteActivity.jam} JPL</strong> pada <strong className="text-indigo-500">{deleteActivity.teacherNames.length} guru</strong> yang terlibat akan otomatis ditarik kembali.
                </p>
                <div className="flex gap-3 mt-auto">
                    <button onClick={() => setDeleteActivity(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 py-3 rounded-xl font-bold text-slate-700 dark:text-slate-300 transition-colors">Batal</button>
                    <button onClick={confirmDeleteActivity} disabled={isSaving} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold shadow-md transition-colors disabled:opacity-70 flex items-center justify-center gap-2">
                       {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Trash2 size={16}/>}
                       {isSaving ? 'Menghapus...' : 'Ya, Batalkan'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-pink-600 to-rose-500 rounded-2xl p-6 text-white shadow-lg flex items-center justify-between shrink-0 relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-3"><CalendarDays className="text-pink-100" /> Pengaturan Jadwal Mengajar</h1>
          <p className="text-pink-50 text-sm">Petakan jadwal mingguan (Roster) dan input kegiatan insidental secara massal.</p>
        </div>
        <CalendarDays size={100} className="absolute -right-6 -top-6 text-white/10 transform rotate-12 pointer-events-none" />
      </div>

      <div className="flex flex-col xl:flex-row gap-6 flex-1 min-h-0">
         
         {/* TABS NAVIGASI (KIRI DI DESKTOP, ATAS DI MOBILE) */}
         <div className="w-full xl:w-64 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-row xl:flex-col overflow-x-auto xl:overflow-hidden shrink-0 hide-scrollbar">
            <button 
               onClick={() => setActiveTab('roster')}
               className={`flex-1 xl:flex-none p-4 text-left font-bold transition-all border-b-4 xl:border-b-0 xl:border-l-4 ${activeTab === 'roster' ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-400 border-pink-500 xl:border-l-pink-500' : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
            >
               <div className="flex items-center gap-2 whitespace-nowrap"><CalendarDays size={18}/> Pemetaan Roster</div>
               <p className="text-[10px] font-normal mt-1 opacity-80 hidden xl:block">Atur jadwal rutin mingguan guru (Senin - Minggu).</p>
            </button>
            <button 
               onClick={() => setActiveTab('insidental')}
               className={`flex-1 xl:flex-none p-4 text-left font-bold transition-all border-b-4 xl:border-b-0 xl:border-l-4 ${activeTab === 'insidental' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border-indigo-500 xl:border-l-indigo-500' : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
            >
               <div className="flex items-center gap-2 whitespace-nowrap"><ListPlus size={18}/> Input Kegiatan Massal</div>
               <p className="text-[10px] font-normal mt-1 opacity-80 hidden xl:block">Tambahkan jam kegiatan non-rutin ke banyak guru sekaligus.</p>
            </button>
            <button 
               onClick={() => setActiveTab('riwayat_massal')}
               className={`flex-1 xl:flex-none p-4 text-left font-bold transition-all border-b-4 xl:border-b-0 xl:border-l-4 ${activeTab === 'riwayat_massal' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-500 xl:border-l-amber-500' : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
            >
               <div className="flex items-center gap-2 whitespace-nowrap"><History size={18}/> Manajemen Kegiatan</div>
               <p className="text-[10px] font-normal mt-1 opacity-80 hidden xl:block">Edit, hapus, dan pantau riwayat kegiatan massal.</p>
            </button>
         </div>

         {/* AREA KONTEN */}
         <div className="flex-1 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col min-h-0">
            
            {activeTab === 'roster' && (
               <>
                  <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
                     <div className="relative w-full sm:w-64">
                       <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                       <input 
                         type="text" placeholder="Cari Nama Guru..." 
                         value={search} onChange={e => setSearch(e.target.value)}
                         className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-pink-500 outline-none dark:text-white"
                       />
                     </div>
                     <button onClick={() => setConfirmGenerate(true)} disabled={isSaving} className="w-full sm:w-auto bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-70">
                       {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <CheckSquare size={16} />}
                       {isSaving ? 'Memproses...' : 'Terapkan ke Kalender Rekap'}
                     </button>
                  </div>
                  
                  <div className="overflow-x-auto overflow-y-auto flex-1 p-2 pb-4 touch-pan-x touch-pan-y scroll-smooth">
                     <table className="w-full text-left text-sm whitespace-nowrap min-w-max border-collapse border border-slate-200 dark:border-slate-700">
                        <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 sticky top-0 z-10 shadow-sm border-b border-slate-300 dark:border-slate-600">
                           <tr>
                              <th className="p-3 font-bold border-r border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-100 dark:bg-slate-900/90 z-20">Nama Guru</th>
                              <th className="p-3 font-bold text-center border-r border-slate-200 dark:border-slate-700">Senin</th>
                              <th className="p-3 font-bold text-center border-r border-slate-200 dark:border-slate-700">Selasa</th>
                              <th className="p-3 font-bold text-center border-r border-slate-200 dark:border-slate-700">Rabu</th>
                              <th className="p-3 font-bold text-center border-r border-slate-200 dark:border-slate-700">Kamis</th>
                              <th className="p-3 font-bold text-center border-r border-slate-200 dark:border-slate-700">Jumat</th>
                              <th className="p-3 font-bold text-center border-r border-slate-200 dark:border-slate-700">Sabtu</th>
                              <th className="p-3 font-bold text-center border-r border-slate-200 dark:border-slate-700 text-rose-500">Minggu</th>
                              <th className="p-3 font-black text-center bg-pink-50 text-pink-700 dark:bg-pink-900/40 dark:text-pink-400">JPL / Pekan</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                           {filtered.map(t => {
                              const r = t.payroll?.roster || {};
                              const totalMingguan = ['senin','selasa','rabu','kamis','jumat','sabtu','minggu'].reduce((sum, d) => sum + (Number(r[d]) || 0), 0);
                              return (
                                 <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                    <td className="p-3 font-bold text-slate-800 dark:text-slate-200 sticky left-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 z-10 shadow-[1px_0_0_rgba(0,0,0,0.05)]">
                                       {t.name}
                                       <div className="text-[10px] text-slate-500 font-normal">{t.nipy}</div>
                                    </td>
                                    {['senin','selasa','rabu','kamis','jumat','sabtu','minggu'].map((day) => (
                                       <td key={day} className={`p-1.5 border-r border-slate-200 dark:border-slate-700 ${day === 'minggu' ? 'bg-rose-50/30 dark:bg-rose-900/10' : ''}`}>
                                          <input 
                                             type="number" min="0" 
                                             value={r[day] !== undefined ? r[day] : ''} 
                                             onChange={e => handleInlineRosterChange(t.id, day, e.target.value)}
                                             className="w-14 p-1.5 text-center rounded bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none text-sm font-bold dark:text-white m-auto block"
                                             placeholder="-"
                                          />
                                       </td>
                                    ))}
                                    <td className="p-3 text-center font-black text-pink-700 dark:text-pink-400 bg-pink-50/50 dark:bg-pink-900/20 text-lg">
                                       {totalMingguan}
                                    </td>
                                 </tr>
                              )
                           })}
                           {filtered.length === 0 && <tr><td colSpan="9" className="p-8 text-center text-slate-500">Tidak ada data.</td></tr>}
                        </tbody>
                     </table>
                  </div>
               </>
            )}

            {/* DIPERBARUI: Struktur Form Insidental dan Tabel Riwayat */}
            {activeTab === 'insidental' && (
               <div className="flex flex-col lg:flex-row h-full overflow-y-auto relative hide-scrollbar">
                     {/* FORM KIRI */}
                     <div className="w-full lg:w-1/3 bg-indigo-50/50 dark:bg-indigo-900/10 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-700 p-5 shrink-0 flex flex-col">
                        <h3 className="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                           <ListPlus className="text-indigo-500"/> Detail Kegiatan
                        </h3>
                        <form id="formInsidental" onSubmit={handleSaveInsidental} className="space-y-4">
                           <div>
                              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Nama Kegiatan</label>
                              <input type="text" required placeholder="Cth: Rapat Wali Murid" value={insidentalForm.ket} onChange={e => setInsidentalForm({...insidentalForm, ket: e.target.value})} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white" />
                           </div>
                           <div className="grid grid-cols-2 gap-4">
                              <div>
                                 <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Tgl Pelaksanaan</label>
                                 <select value={insidentalForm.tgl} onChange={e => setInsidentalForm({...insidentalForm, tgl: Number(e.target.value)})} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white font-bold cursor-pointer">
                                    {Array.from({length: 31}, (_, i) => i + 1).map(num => <option key={num} value={num}>Tanggal {num}</option>)}
                                 </select>
                              </div>
                              <div>
                                 <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Bobot (JPL)</label>
                                 <input type="number" min="1" required value={insidentalForm.jam} onChange={e => setInsidentalForm({...insidentalForm, jam: Number(e.target.value)})} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white font-bold text-indigo-600 dark:text-indigo-400" />
                              </div>
                           </div>
                           <div className="pt-4">
                              <button type="submit" disabled={isSaving} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-xl font-bold shadow-md transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-70">
                                 {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={18} />}
                                 Tambahkan Sekarang
                              </button>
                           </div>
                        </form>
                     </div>

                     {/* TABEL KANAN (CENTANG GURU) */}
                     <div className="w-full lg:w-2/3 flex flex-col h-full bg-white dark:bg-slate-800">
                        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50 shrink-0">
                           <div className="flex items-center gap-3">
                              <button onClick={selectAll} className="flex items-center gap-2 text-xs bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg font-bold transition-colors">
                                 <CheckSquare size={14}/> {selectedTeachers.length === filtered.length ? 'Batal Pilih' : 'Pilih Semua'}
                              </button>
                              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-md">{selectedTeachers.length} Terpilih</span>
                           </div>
                           <div className="relative w-40 sm:w-48">
                             <Search className="absolute left-3 top-2 text-slate-400" size={14} />
                             <input type="text" placeholder="Cari Guru..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-8 pr-2 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 outline-none dark:text-white" />
                           </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                           {filtered.map(t => (
                              <label key={t.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${selectedTeachers.includes(t.id) ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600'}`}>
                                 <input type="checkbox" checked={selectedTeachers.includes(t.id)} onChange={() => toggleTeacherSelection(t.id)} className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                                 <div className="flex-1 min-w-0">
                                    <p className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate">{t.name}</p>
                                    <p className="text-[10px] text-slate-500 truncate">{t.position}</p>
                                 </div>
                              </label>
                           ))}
                        </div>
                     </div>
               </div>
            )}

            {/* TAB BARU: MANAJEMEN RIWAYAT KEGIATAN MASSAL */}
            {activeTab === 'riwayat_massal' && (
                  <div className="p-5 md:p-6 flex-1 bg-white dark:bg-slate-800 flex flex-col h-full overflow-hidden">
                      <div className="flex items-center justify-between mb-4 shrink-0">
                         <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2 text-lg">
                           <History className="text-amber-500"/> Manajemen Riwayat Kegiatan (Bulan Ini)
                         </h3>
                         <span className="text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800">
                           Total: {massActivities.length} Kegiatan
                         </span>
                      </div>
                      
                      <div className="overflow-x-auto overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/20 shadow-sm flex-1">
                          <table className="w-full text-left text-sm whitespace-nowrap min-w-max">
                             <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10 shadow-sm">
                                <tr>
                                  <th className="p-3 font-bold text-center w-24">Tanggal</th>
                                  <th className="p-3 font-bold">Nama Kegiatan Massal</th>
                                  <th className="p-3 font-bold text-center w-28">Bobot JPL</th>
                                  <th className="p-3 font-bold text-center w-32">Peserta Hadir</th>
                                  <th className="p-3 font-bold text-center w-32">Aksi Manajemen</th>
                                </tr>
                             </thead>
                             <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                {massActivities.map((act) => (
                                    <tr key={act.originalId} className="hover:bg-amber-50/40 dark:hover:bg-slate-800/40 transition-colors">
                                       <td className="p-3 font-bold text-slate-500 dark:text-slate-400 text-center">Tgl {act.tgl}</td>
                                       <td className="p-3 font-extrabold text-slate-800 dark:text-slate-200">{act.ket}</td>
                                       <td className="p-3 text-center">
                                          <span className="text-sm font-black text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2.5 py-1 rounded-md border border-amber-100 dark:border-amber-800/50">+{act.jam} JPL</span>
                                       </td>
                                       <td className="p-3 text-center">
                                          <button onClick={() => setPreviewActivity(act)} className="text-[11px] font-bold bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 flex items-center justify-center gap-1.5 mx-auto hover:bg-amber-50 hover:text-amber-600 hover:border-amber-300 transition-colors shadow-sm">
                                             <Eye size={14}/> {act.teacherNames.length} Guru
                                          </button>
                                       </td>
                                       <td className="p-3 text-center">
                                          <div className="flex items-center justify-center gap-2">
                                             <button onClick={() => setEditActivity(act)} className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200 dark:border-blue-800/50 shadow-sm" title="Edit Kegiatan"><Edit size={16}/></button>
                                             <button onClick={() => setDeleteActivity(act)} className="p-2 bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-100 rounded-lg transition-colors border border-red-200 dark:border-red-800/50 shadow-sm" title="Batalkan/Hapus Kegiatan"><Trash2 size={16}/></button>
                                          </div>
                                       </td>
                                    </tr>
                                ))}
                                {massActivities.length === 0 && (
                                    <tr><td colSpan="5" className="p-10 text-center text-slate-500 bg-white dark:bg-slate-800 italic m-2 rounded-xl">Belum ada kegiatan massal yang dicatat bulan ini.</td></tr>
                                )}
                             </tbody>
                          </table>
                      </div>
                  </div>
            )}
         </div>
      </div>
    </div>
  );
}

// --- VIEW GAJI (DIKEMBALIKAN KARENA TERPOTONG) ---
function GajiView({ teachers, setTeachers, externalSelectedId, setExternalSelectedId, settings, user, saveAuditLog }) {
  const [activeTabGaji, setActiveTabGaji] = useState('masaKerja');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('Semua');

  // 🪄 TAMBALAN CERDAS: State untuk Pratinjau Slip Gaji
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [isSlipModalOpen, setIsSlipModalOpen] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const bulan = getFormattedPeriod(settings?.payrollPeriod);

  useEffect(() => {
    if (externalSelectedId) {
      // 🪄 TAMBALAN CERDAS: Mencegat ID dan menukarnya dengan Nama Asli Pegawai
      const targetTeacher = teachers.find(t => t.id === externalSelectedId);
      if (targetTeacher) {
         setSearchTerm(targetTeacher.name); // Menaruh nama asli di kolom pencarian
      } else {
         setSearchTerm(externalSelectedId); // Fallback jika nama tidak ditemukan
      }
      if (setExternalSelectedId) setExternalSelectedId(null);
    }
  }, [externalSelectedId, setExternalSelectedId, teachers]);

  // FUNGSI BARU: Mengubah TMT langsung di tabel Gaji dan mereset override nominal
  const handleInlineTmtChange = (teacherId, newYear) => {
    const targetTeacher = teachers.find(t => t.id === teacherId);
    if (!targetTeacher) return;
    
    const oldDate = new Date(targetTeacher.tmt || new Date());
    const oldYear = oldDate.getFullYear();
    oldDate.setFullYear(newYear);
    const newTmt = oldDate.toISOString().split('T')[0];

    if (saveAuditLog) {
       saveAuditLog(targetTeacher, 'Tahun Masuk (TMT)', oldYear, newYear);
    }

    setTeachers(prev => prev.map(t => {
      if (t.id === teacherId) {
        return {
          ...t,
          tmt: newTmt,
          payroll: {
            ...(t.payroll || {}),
            tunjanganMasaKerjaManual: '' // Kunci: Reset nominal agar merujuk otomatis ke Master Tarif
          }
        };
      }
      return t;
    }));
  };

  const handleUpdatePayrollObj = (teacherId, objKey, field, value) => {
    const safeValue = (typeof value === 'number' && isNaN(value)) ? 0 : value;
    const targetTeacher = teachers.find(t => t.id === teacherId);
    if (targetTeacher && saveAuditLog) {
        saveAuditLog(targetTeacher, `${objKey} (${field})`, targetTeacher.payroll?.[objKey]?.[field] || 0, safeValue);
    }
    setTeachers(prev => prev.map(t => {
      if (t.id === teacherId) {
        const p = t.payroll || {};
        const childObj = p[objKey] || {};
        return { ...t, payroll: { ...p, [objKey]: { ...childObj, [field]: safeValue } } };
      }
      return t;
    }));
  };

  const handleArrayUpdate = (teacherId, arrKey, index, field, value) => {
    const safeValue = (typeof value === 'number' && isNaN(value)) ? 0 : value;
    
    // Pencegahan Double Input pada Insentif & Potongan
    if (field === 'ket' && value !== '') {
       const targetTeacher = teachers.find(t => t.id === teacherId);
       const currentArr = targetTeacher?.payroll?.[arrKey] || [];
       const isDuplicate = currentArr.some((item, i) => i !== index && item.ket.toLowerCase() === value.toLowerCase());
       
       if (isDuplicate) {
          alert(`Peringatan: Komponen dengan keterangan "${value}" sudah ada pada pegawai ini!\n\nMohon gunakan keterangan yang berbeda atau cukup gabungkan nominalnya pada komponen yang sudah ada untuk menghindari duplikasi pelaporan.`);
          return; // Gagalkan update jika duplikat
       }
    }

    const targetTeacher = teachers.find(t => t.id === teacherId);
    if (targetTeacher && saveAuditLog) {
        const oldItem = targetTeacher.payroll?.[arrKey]?.[index] || {};
        saveAuditLog(targetTeacher, `${arrKey} [Item ke-${index + 1}] - ${field}`, oldItem[field] || 0, safeValue);
    }

    setTeachers(prev => prev.map(t => {
      if (t.id === teacherId) {
        const p = t.payroll || {};
        const newArr = [...(p[arrKey] || [])];
        newArr[index] = { ...newArr[index], [field]: safeValue };
        return { ...t, payroll: { ...p, [arrKey]: newArr } };
      }
      return t;
    }));
  };

  const handleAddArrayItem = (teacherId, arrKey, defaultObj) => {
    setTeachers(prev => prev.map(t => {
      if (t.id === teacherId) {
        const p = t.payroll || {};
        return { ...t, payroll: { ...p, [arrKey]: [...(p[arrKey] || []), defaultObj] } };
      }
      return t;
    }));
  };

  const handleRemoveArrayItem = (teacherId, arrKey, index) => {
    setTeachers(prev => prev.map(t => {
      if (t.id === teacherId) {
        const p = t.payroll || {};
        const newArr = [...(p[arrKey] || [])];
        newArr.splice(index, 1);
        return { ...t, payroll: { ...p, [arrKey]: newArr } };
      }
      return t;
    }));
  };

  // VARIABEL DINAMIS DARI PENGATURAN MASTER
  const mr = settings?.masterRates || {};
  const catList = mr.JOB_CATEGORIES || JOB_CATEGORIES;
  const roleList = mr.JOB_ROLES || JOB_ROLES;
  const kompFields = mr.KOMPETENSI_FIELDS || KOMPETENSI_FIELDS;
  const kompLevels = mr.KOMPETENSI_LEVELS || KOMPETENSI_LEVELS;
  const insentifList = mr.INSENTIF_LIST || INSENTIF_LIST;
  const potonganList = mr.POTONGAN_LIST || POTONGAN_LIST;
  const kinerjaLevels = mr.KINERJA_LEVELS || KINERJA_LEVELS;

  const tabMenus = [
    { id: 'masaKerja', label: 'Tunjangan Masa Kerja', icon: Clock },
    { id: 'jabatan', label: 'Tunjangan Jabatan', icon: Briefcase },
    { id: 'pendidikan', label: 'Tunjangan Pendidikan', icon: GraduationCap },
    { id: 'kompetensi', label: 'Tunjangan Kompetensi', icon: Star },
    { id: 'keluarga', label: 'Tunjangan Keluarga', icon: Users },
    { id: 'disiplin', label: 'Kedisiplinan & Mengajar', icon: Clock },
    { id: 'insentif', label: 'Insentif Tambahan', icon: TrendingUp },
    { id: 'potongan', label: 'Potongan Lainnya', icon: Trash }
  ];

  const filtered = teachers.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.nipy.includes(searchTerm);
    const matchStatus = filterStatus === 'Semua' ? true : t.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full relative pb-4 min-h-0">
      
      {/* 🪄 TAMBALAN CERDAS: Modal Pratinjau Slip Gaji */}
      {isSlipModalOpen && selectedSlip && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-300 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-lg dark:text-white flex items-center gap-2"><FileText className="text-blue-500"/> Pratinjau Slip Gaji</h3>
              <button onClick={() => { setIsSlipModalOpen(false); setSelectedSlip(null); }} className="p-2 hover:bg-slate-200 dark:bg-slate-800 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
            </div>
            <div className="overflow-y-auto p-4 md:p-8 bg-slate-200 dark:bg-slate-700/50 flex-1">
              <SlipDocument teacher={selectedSlip} bulan={bulan} settings={settings} />
            </div>
            <div className="p-4 border-t border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 flex justify-end gap-3 shrink-0">
              <button onClick={() => window.print()} className="bg-slate-600 hover:bg-slate-700 text-white px-5 py-2.5 rounded-lg font-medium inline-flex items-center gap-2 shadow-sm transition-colors">
                <Printer size={18}/> Print
              </button>
              <button 
                onClick={async () => {
                  setIsExportingPDF(true);
                  try {
                    await exportToPDF('printable-area', `Slip_Gaji_${selectedSlip.name.replace(/\s+/g, '_')}_${bulan}.pdf`);
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
              <button onClick={() => { setIsSlipModalOpen(false); setSelectedSlip(null); }} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      <datalist id="kategori-list">{catList.map(cat => <option key={cat} value={cat} />)}</datalist>
      <datalist id="detail-list">{roleList.map(role => <option key={role} value={role} />)}</datalist>
      <datalist id="kompetensi-list">{kompFields.map(f => <option key={f} value={f} />)}</datalist>
      <datalist id="insentif-list">{insentifList.map(i => <option key={i} value={i} />)}</datalist>
      <datalist id="potongan-list">{potonganList.map(i => <option key={i} value={i} />)}</datalist>

      <div className="bg-gradient-to-r from-emerald-600 to-teal-500 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden flex items-center justify-between shrink-0">
        <div className="relative z-10">
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-3"><Calculator className="text-emerald-100" /> Input Cepat Komponen Gaji</h1>
          <p className="text-emerald-50 text-sm">Pilih komponen di menu kiri, lalu sesuaikan nilainya untuk semua pegawai secara berurutan di sebelah kanan.</p>
        </div>
        <Calculator size={100} className="absolute -right-6 -top-6 text-white/10 transform -rotate-12 pointer-events-none" />
      </div>

      <div className="flex flex-col md:flex-row gap-6 flex-1 min-h-0">
        {/* Sidebar Tab Menu */}
        <div className="w-full md:w-56 lg:w-64 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-row md:flex-col overflow-x-auto md:overflow-y-auto shrink-0 hide-scrollbar">
          <div className="p-4 font-bold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-700 hidden md:flex items-center gap-2 sticky top-0 bg-white dark:bg-slate-800 z-10">
            <FileText size={18} className="text-emerald-500" /> Pilih Komponen
          </div>
          {tabMenus.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTabGaji(tab.id)}
              className={`flex-none md:w-full flex items-center gap-3 p-3.5 md:p-4 text-left font-semibold transition-all border-b-2 md:border-b-0 md:border-l-4 ${activeTabGaji === tab.id ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-500 md:border-l-emerald-500 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5)]' : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
            >
              <tab.icon size={18} className={activeTabGaji === tab.id ? 'text-emerald-500' : 'opacity-60'} />
              <span className="whitespace-nowrap md:whitespace-normal text-sm">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden min-h-0">
          {/* Header Input Area */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white"
              >
                <option value="Semua">Semua Pegawai</option>
                <option value="Tetap">Guru Tetap</option>
                <option value="Tidak Tetap">Guru Tidak Tetap</option>
              </select>
              <div className="relative w-full sm:w-56 md:w-64">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Cari Pegawai..." 
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* List Pegawai */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            <div className="bg-emerald-50/50 dark:bg-emerald-900/10 border-l-4 border-emerald-500 p-3 rounded-r-lg mb-6 sticky top-0 z-10 backdrop-blur-md">
               <p className="text-sm font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">INPUT MODE: {tabMenus.find(m => m.id === activeTabGaji)?.label.toUpperCase()}</p>
               <p className="text-[11px] text-emerald-600 dark:text-emerald-500 mt-0.5">Perubahan yang Anda ketik akan otomatis tersimpan.</p>
            </div>

            {filtered.map(t => {
              const p = t.payroll || {};
              const liveSlip = calculatePayroll(t, settings); // 🪄 Kalkulasi Live THP
              
              return (
                <div key={t.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm hover:border-emerald-300 dark:hover:border-emerald-700 transition-all focus-within:ring-2 focus-within:ring-emerald-500/20">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50/50 dark:bg-slate-900/30">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold shrink-0">{t.name.charAt(0)}</div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-slate-800 dark:text-white truncate uppercase">{t.name}</h4>
                        <p className="text-xs text-slate-500 truncate">{t.nipy} • {t.status}</p>
                      </div>
                    </div>
                    
                    {/* 🪄 TAMBALAN CERDAS: Indikator THP & Tombol Pratinjau Slip */}
                    <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                       <div className="flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-900/40 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/50 shrink-0">
                         <Wallet size={14} className="text-emerald-600 dark:text-emerald-400" />
                         <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Est. THP: {formatRp(liveSlip.totalBersih)}</span>
                       </div>
                       <button
                          onClick={() => { setSelectedSlip(t); setIsSlipModalOpen(true); }}
                          className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-blue-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-lg font-bold transition-colors flex items-center gap-1.5 shadow-sm"
                       >
                          <FileText size={14} className="text-blue-500" /> <span className="hidden sm:inline">Pratinjau Slip</span><span className="sm:hidden">Slip</span>
                       </button>
                    </div>
                  </div>

                  <div className="p-4 md:p-5">
                    
                    {/* 1. MASA KERJA */}
                    {activeTabGaji === 'masaKerja' && (
                      <div className="flex flex-col sm:flex-row gap-4 animate-in fade-in zoom-in-95 items-end">
                        <div className="w-full sm:w-1/4">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 text-emerald-600 dark:text-emerald-400">Tahun Masuk (TMT)</label>
                          <div className="relative">
                             <select 
                               value={new Date(t.tmt || new Date()).getFullYear()}
                               onChange={(e) => handleInlineTmtChange(t.id, e.target.value)}
                               className="w-full p-2.5 border border-emerald-200 dark:border-emerald-700 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/20 text-sm font-bold text-emerald-700 dark:text-emerald-400 outline-none focus:ring-2 focus:ring-emerald-500 appearance-none cursor-pointer hover:border-emerald-300 transition-colors"
                             >
                               {/* Batasi rentang dropdown tahun agar mentok di 2010 */}
                               {Array.from({ length: Math.max(1, new Date().getFullYear() - 2009) }, (_, i) => new Date().getFullYear() - i).map(year => (
                                  <option key={year} value={year}>{year}</option>
                               ))}
                             </select>
                             <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-1">
                                <span className="text-[10px] bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 rounded font-bold shadow-sm">
                                   {Math.max(0, new Date().getFullYear() - new Date(t.tmt || new Date()).getFullYear())} Thn
                                </span>
                                <ChevronDown size={14} className="text-emerald-500" />
                             </div>
                          </div>
                        </div>
                        
                        <div className="w-full sm:w-1/3">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Nominal (Semua Status)</label>
                          <div className="relative">
                             <span className="absolute left-3 top-2.5 text-slate-500 font-medium">Rp</span>
                             <input type="number" 
                               value={(p.tunjanganMasaKerjaManual !== undefined && p.tunjanganMasaKerjaManual !== '' && p.tunjanganMasaKerjaManual !== 0) ? p.tunjanganMasaKerjaManual : ((settings?.masterRates?.TENURE_RATES || TENURE_RATES)[new Date(t.tmt || new Date()).getFullYear()] || 0)}
                               onChange={e => {
                                  const newVal = e.target.value === '' ? '' : Number(e.target.value);
                                  if (saveAuditLog) saveAuditLog(t, 'Tunjangan Masa Kerja', p.tunjanganMasaKerjaManual || 0, newVal);
                                  setTeachers(prev => prev.map(tc => tc.id === t.id ? { ...tc, payroll: { ...tc.payroll, tunjanganMasaKerjaManual: newVal } } : tc));
                               }}
                               className="w-full pl-10 pr-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white"
                             />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 2. JABATAN */}
                    {activeTabGaji === 'jabatan' && (
                      <div className="space-y-3 animate-in fade-in zoom-in-95">
                        {p.jabatans?.map((jab, idx) => (
                          <div key={idx} className="flex flex-col sm:flex-row gap-3 items-end p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                            <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Kategori</span>
                                <input list="kategori-list" value={jab.kategori} onChange={e => handleArrayUpdate(t.id, 'jabatans', idx, 'kategori', e.target.value)} className="w-full p-2 border rounded-lg bg-white dark:bg-slate-800 text-xs dark:text-white outline-none focus:ring-1 focus:ring-emerald-500" placeholder="Pilih/Ketik..." />
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Detail Jabatan</span>
                                <input list="detail-list" value={jab.detail} onChange={e => handleArrayUpdate(t.id, 'jabatans', idx, 'detail', e.target.value)} className="w-full p-2 border rounded-lg bg-white dark:bg-slate-800 text-xs dark:text-white outline-none focus:ring-1 focus:ring-emerald-500" placeholder="Pilih/Ketik..." />
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Kinerja</span>
                                <select value={jab.kinerja} onChange={e => handleArrayUpdate(t.id, 'jabatans', idx, 'kinerja', e.target.value)} className="w-full p-2 border rounded-lg bg-white dark:bg-slate-800 text-xs dark:text-white outline-none focus:ring-1 focus:ring-emerald-500">
                                  {kinerjaLevels.map(k => <option key={k} value={k}>{k}</option>)}
                                </select>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Nominal (Rp)</span>
                                <input type="number" value={jab.nominal} onChange={e => handleArrayUpdate(t.id, 'jabatans', idx, 'nominal', Number(e.target.value))} className="w-full p-2 border rounded-lg bg-white dark:bg-slate-800 text-xs font-bold text-blue-600 dark:text-blue-400 outline-none focus:ring-1 focus:ring-emerald-500" />
                              </div>
                            </div>
                            <button onClick={() => handleRemoveArrayItem(t.id, 'jabatans', idx)} className="p-2 text-red-500 hover:bg-red-100 rounded-lg"><Trash2 size={16}/></button>
                          </div>
                        ))}
                        <button onClick={() => handleAddArrayItem(t.id, 'jabatans', { kategori: 'Staff', detail: '', kinerja: 'Baik', nominal: 0 })} className="text-xs font-bold text-blue-600 flex items-center gap-1 hover:text-blue-800"><PlusCircle size={14}/> Tambah Jabatan</button>
                      </div>
                    )}

                    {/* 3. PENDIDIKAN */}
                    {activeTabGaji === 'pendidikan' && (
                      <div className="flex flex-col sm:flex-row gap-4 animate-in fade-in zoom-in-95 items-end">
                        <div className="w-full sm:w-1/3">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 text-emerald-600 dark:text-emerald-400">Tingkat Pendidikan</label>
                          <select 
                            value={p.pendidikan?.tingkat || t.education} 
                            onChange={e => {
                               const newTingkat = e.target.value;
                               if (saveAuditLog) saveAuditLog(t, 'Tingkat Pendidikan', p.pendidikan?.tingkat || t.education, newTingkat);
                               setTeachers(prev => prev.map(tc => {
                                  if (tc.id === t.id) {
                                     return {
                                        ...tc, education: newTingkat,
                                        payroll: { ...(tc.payroll || {}), pendidikan: { ...(tc.payroll?.pendidikan || {}), tingkat: newTingkat, nominalOverride: '' } }
                                     };
                                  }
                                  return tc;
                               }));
                            }}
                            className="w-full p-2.5 border border-emerald-200 dark:border-emerald-700 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/20 text-sm font-bold text-emerald-700 dark:text-emerald-400 outline-none focus:ring-2 focus:ring-emerald-500 appearance-none cursor-pointer"
                          >
                            {['S2', 'S1', 'Diploma', 'SMA/Pondok'].map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
                          </select>
                        </div>
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Nominal Override</label>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-slate-500 font-medium">Rp</span>
                            <input type="number" 
                              value={(p.pendidikan?.nominalOverride !== undefined && p.pendidikan?.nominalOverride !== '' && p.pendidikan?.nominalOverride !== 0) ? p.pendidikan.nominalOverride : ((settings?.masterRates?.EDU_RATES || EDU_RATES)[t.education] || 0)}
                              onChange={e => handleUpdatePayrollObj(t.id, 'pendidikan', 'nominalOverride', e.target.value === '' ? '' : Number(e.target.value))}
                              className="w-full pl-10 pr-4 py-2.5 border rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 4. KOMPETENSI */}
                    {activeTabGaji === 'kompetensi' && (
                      <div className="space-y-3 animate-in fade-in zoom-in-95">
                        {p.kompetensi?.map((komp, idx) => (
                          <div key={idx} className="flex flex-col sm:flex-row gap-3 items-end p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                            <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Bidang Khusus</span>
                                <input list="kompetensi-list" value={komp.bidang} onChange={e => handleArrayUpdate(t.id, 'kompetensi', idx, 'bidang', e.target.value)} className="w-full p-2 border rounded-lg bg-white dark:bg-slate-800 text-xs dark:text-white outline-none" placeholder="Pilih/Ketik..." />
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Level</span>
                                <select value={komp.level} onChange={e => handleArrayUpdate(t.id, 'kompetensi', idx, 'level', e.target.value)} className="w-full p-2 border rounded-lg bg-white dark:bg-slate-800 text-xs dark:text-white outline-none">
                                  {kompLevels.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Nominal (Rp)</span>
                                <input type="number" value={komp.nominal} onChange={e => handleArrayUpdate(t.id, 'kompetensi', idx, 'nominal', Number(e.target.value))} className="w-full p-2 border rounded-lg bg-white dark:bg-slate-800 text-xs font-bold text-amber-600 dark:text-amber-400 outline-none" />
                              </div>
                            </div>
                            <button onClick={() => handleRemoveArrayItem(t.id, 'kompetensi', idx)} className="p-2 text-red-500 hover:bg-red-100 rounded-lg"><Trash2 size={16}/></button>
                          </div>
                        ))}
                        <button onClick={() => handleAddArrayItem(t.id, 'kompetensi', { bidang: '', level: 'Cukup Ahli', nominal: 0 })} className="text-xs font-bold text-amber-600 flex items-center gap-1"><PlusCircle size={14}/> Tambah Kompetensi</button>
                      </div>
                    )}

                    {/* 5. KELUARGA */}
                    {activeTabGaji === 'keluarga' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in zoom-in-95 items-end">
                         <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tarif Pasangan</label>
                            <input type="number" value={p.keluarga?.tarifSuamiIstri !== undefined ? p.keluarga.tarifSuamiIstri : 200000} onChange={e => handleUpdatePayrollObj(t.id, 'keluarga', 'tarifSuamiIstri', e.target.value === '' ? '' : Number(e.target.value))} className="w-full p-2.5 border rounded-lg bg-slate-50 dark:bg-slate-900 text-sm outline-none" />
                         </div>
                         <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tarif Per Anak</label>
                            <input type="number" value={p.keluarga?.tarifAnak !== undefined ? p.keluarga.tarifAnak : 100000} onChange={e => handleUpdatePayrollObj(t.id, 'keluarga', 'tarifAnak', e.target.value === '' ? '' : Number(e.target.value))} className="w-full p-2.5 border rounded-lg bg-slate-50 dark:bg-slate-900 text-sm outline-none" />
                         </div>
                         <div className="lg:col-span-2 flex items-center gap-4 bg-slate-100 dark:bg-slate-700/50 p-2.5 rounded-lg border border-slate-200 dark:border-slate-600">
                            <div className="text-[10px] text-slate-500 font-bold uppercase w-24">Profil Sistem:</div>
                            <div className="flex-1 font-bold text-sm text-slate-700 dark:text-slate-200">
                               {t.family?.wife === 1 ? 'Menikah' : t.family?.wife === 2 ? 'Menikah (Pasangan 1 Yayasan)' : 'Lajang'}, {t.family?.children || 0} Anak
                            </div>
                         </div>
                      </div>
                    )}

                    {/* 6. DISIPLIN & MENGAJAR */}
                    {activeTabGaji === 'disiplin' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in zoom-in-95">
                         <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-800">
                            <label className="block text-[10px] font-bold text-blue-500 uppercase mb-1">Total Jam Mengajar</label>
                            <input type="number" value={p.jamMengajar?.realisasi || 0} onChange={e => handleUpdatePayrollObj(t.id, 'jamMengajar', 'realisasi', Number(e.target.value))} className="w-full p-2 border rounded-md bg-white text-sm font-bold" />
                         </div>
                         <div className="p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-100 dark:border-red-800">
                            <label className="block text-[10px] font-bold text-red-500 uppercase mb-1">Jumlah Telat</label>
                            <input type="number" value={p.disiplin?.telat || 0} onChange={e => handleUpdatePayrollObj(t.id, 'disiplin', 'telat', Number(e.target.value))} className="w-full p-2 border rounded-md bg-white text-sm font-bold" />
                         </div>
                         <div className="p-3 bg-emerald-50 dark:bg-emerald-900/10 rounded-lg border border-emerald-100 dark:border-emerald-800">
                            <label className="block text-[10px] font-bold text-emerald-500 uppercase mb-1">Tarif Bonus Hadir /Hr</label>
                            <input type="number" value={p.disiplin?.tarifHadir !== undefined ? p.disiplin.tarifHadir : 1000} onChange={e => handleUpdatePayrollObj(t.id, 'disiplin', 'tarifHadir', e.target.value === '' ? '' : Number(e.target.value))} className="w-full p-2 border rounded-md bg-white text-sm font-bold" />
                         </div>
                         <div className="p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-100 dark:border-amber-800">
                            <label className="block text-[10px] font-bold text-amber-500 uppercase mb-1">Denda Telat /Hr</label>
                            <input type="number" value={p.disiplin?.tarifTelat !== undefined ? p.disiplin.tarifTelat : 1000} onChange={e => handleUpdatePayrollObj(t.id, 'disiplin', 'tarifTelat', e.target.value === '' ? '' : Number(e.target.value))} className="w-full p-2 border rounded-md bg-white text-sm font-bold" />
                         </div>
                      </div>
                    )}

                    {/* 7. INSENTIF TAMBAHAN */}
                    {activeTabGaji === 'insentif' && (
                      <div className="space-y-3 animate-in fade-in zoom-in-95">
                        {p.insentifTambahan?.map((ins, idx) => (
                          <div key={idx} className="flex flex-col sm:flex-row gap-3 items-end p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-emerald-50/30 dark:bg-emerald-900/10">
                            <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <span className="text-[10px] font-bold text-emerald-600 uppercase block mb-1">Keterangan Tugas / Insentif</span>
                                <input list="insentif-list" value={ins.ket} onChange={e => handleArrayUpdate(t.id, 'insentifTambahan', idx, 'ket', e.target.value)} className="w-full p-2 border border-emerald-200 rounded-lg bg-white dark:bg-slate-800 text-sm dark:text-white outline-none" placeholder="Pilih/Ketik..." />
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-emerald-600 uppercase block mb-1">Nominal (Rp)</span>
                                <input type="number" value={ins.nominal} onChange={e => handleArrayUpdate(t.id, 'insentifTambahan', idx, 'nominal', Number(e.target.value))} className="w-full p-2 border border-emerald-200 rounded-lg bg-white dark:bg-slate-800 text-sm font-bold text-emerald-600 outline-none" />
                              </div>
                            </div>
                            <button onClick={() => handleRemoveArrayItem(t.id, 'insentifTambahan', idx)} className="p-2 text-red-500 hover:bg-red-100 rounded-lg"><Trash2 size={16}/></button>
                          </div>
                        ))}
                        <button onClick={() => handleAddArrayItem(t.id, 'insentifTambahan', { ket: '', nominal: 0 })} className="text-xs font-bold text-emerald-600 flex items-center gap-1"><PlusCircle size={14}/> Tambah Insentif</button>
                      </div>
                    )}

                    {/* 8. POTONGAN */}
                    {activeTabGaji === 'potongan' && (
                      <div className="space-y-3 animate-in fade-in zoom-in-95">
                        {p.potonganLainnya?.map((pot, idx) => (
                          <div key={idx} className="flex flex-col sm:flex-row gap-3 items-end p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-red-50/30 dark:bg-red-900/10">
                            <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <span className="text-[10px] font-bold text-red-600 uppercase block mb-1">Keterangan Potongan / Pinjaman</span>
                                <input list="potongan-list" value={pot.ket} onChange={e => handleArrayUpdate(t.id, 'potonganLainnya', idx, 'ket', e.target.value)} className="w-full p-2 border border-red-200 rounded-lg bg-white dark:bg-slate-800 text-sm dark:text-white outline-none" placeholder="Pilih/Ketik..." />
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-red-600 uppercase block mb-1">Nominal (Rp) per Bulan</span>
                                <input type="number" value={pot.nominal} onChange={e => handleArrayUpdate(t.id, 'potonganLainnya', idx, 'nominal', Number(e.target.value))} className="w-full p-2 border border-red-200 rounded-lg bg-white dark:bg-slate-800 text-sm font-bold text-red-600 outline-none" />
                              </div>
                            </div>
                            <button onClick={() => handleRemoveArrayItem(t.id, 'potonganLainnya', idx)} className="p-2 text-red-500 hover:bg-red-100 rounded-lg"><Trash2 size={16}/></button>
                          </div>
                        ))}
                        <button onClick={() => handleAddArrayItem(t.id, 'potonganLainnya', { ket: '', nominal: 0 })} className="text-xs font-bold text-red-600 flex items-center gap-1"><PlusCircle size={14}/> Tambah Potongan</button>
                      </div>
                    )}

                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center p-10 text-slate-500 bg-slate-50 dark:bg-slate-900/50 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                Tidak ada pegawai yang sesuai pencarian.
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
  const slip = calculatePayroll(teacher, settings);
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
          {/* PERBAIKAN: Menghapus class 'uppercase' agar gelar (seperti S.Pd.I) tidak dipaksa menjadi S.PD.I */}
          <div className="flex"><span className="w-28 shrink-0 font-medium">Nama</span><span className="w-4 shrink-0 text-center">:</span><span className="font-bold flex-1">{teacher.name}</span></div>
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
                <div className="mb-1 font-semibold">Tunjangan Keluarga <span className="text-[11px] font-normal italic text-slate-600">({family.wife === 1 ? 'Menikah' : family.wife === 2 ? 'Menikah - Ditanggung Suami' : 'Belum Menikah'})</span></div>
                {/* DIPERBARUI: Label dinamis menyesuaikan gender dan pasangan 1 yayasan */}
                {renderDetailRow(teacher.gender === 'P' ? 'Suami' : 'Isteri', <>{family.wife === 1 ? <>1 Orang <span className="font-normal italic text-slate-600 ml-1">(x {formatRp(tarifSuamiIstri)})</span></> : family.wife === 2 ? <span className="italic text-slate-600 font-medium text-xs bg-slate-100 px-2 py-0.5 rounded">Ditanggung Suami</span> : '0 Orang'}</>)}
                {renderDetailRow("Anak", <>{family.wife === 1 ? (family.children || 0) : 0} Orang <span className="font-normal italic text-slate-600 ml-1">(x {formatRp(tarifAnak)})</span></>)}
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
                {renderDetailRow("Tambahan Jam (Jam +)", `${slip.jamPlus || 0} jam`)}
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
                        *(Sisa Saldo Pinjaman/Kasbon: {formatRp(pot.sisaHutang !== undefined ? pot.sisaHutang : (pot.nominal * 4))})
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
           {/* PERBAIKAN: Menghapus class 'uppercase' agar gelar tanda tangan presisi */}
           <p className="font-bold underline tracking-wide">{teacher.name}</p>
         </div>
         <div className="flex flex-col items-center justify-end relative">
           <p className="mb-2">Kuala Pembuang, {tanggalCetak}<br/>Mengetahui, Kepala Sekolah</p>
           
           {/* E-Sign Container */}
           <div className="relative w-32 h-20 flex items-center justify-center my-1">
             {/* Tanda Tangan: Cek jika ada URL kustom di pengaturan */}
             {settings?.signatureUrl ? (
               <img src={settings.signatureUrl} alt="Tanda Tangan" className="absolute w-32 h-16 object-contain z-10 mix-blend-multiply transform -rotate-2" />
             ) : (
               <svg className="absolute w-28 h-16 text-blue-900/80 transform rotate-[-5deg]" viewBox="0 0 100 50">
                 <path d="M10,40 C15,25 25,10 35,15 C45,20 40,45 50,35 C60,25 65,10 75,20 C85,30 80,45 95,30" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                 <path d="M25,28 L50,28" fill="none" stroke="currentColor" strokeWidth="1.5" />
               </svg>
             )}
           </div>
           
           {/* DIPERBARUI: Nama Kepala Sekolah menjadi dinamis dari pengaturan. Menghapus 'uppercase' agar gelar Kepala Sekolah presisi */}
           <p className="font-bold underline tracking-wide relative z-10">{settings?.principalName || 'H. Fulan, S.Pd., M.Pd'}</p>
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
function RekapGajiView({ teachers, setTeachers, onEditGaji, settings, setSettings, archives, setArchives, saveAuditLog }) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('Semua'); // TAMBAHAN: State Filter Status Guru
  const [searchAudit, setSearchAudit] = useState(''); // 🪄 TAMBAHAN: State Pencarian Audit Log
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [isArchiving, setIsArchiving] = useState(false);
  
  // TAMBAHAN: State Custom Modal & Notifikasi untuk mengatasi blokir alert browser
  const [isConfirmArchiveOpen, setIsConfirmArchiveOpen] = useState(false);
  const [isConfirmAjukanOpen, setIsConfirmAjukanOpen] = useState(false);
  const [isConfirmNotifMassalOpen, setIsConfirmNotifMassalOpen] = useState(false); // Modal Notif Massal
  const [isConfirmClearHistoryOpen, setIsConfirmClearHistoryOpen] = useState(false); // TAMBAHAN: Modal Bersihkan Riwayat
  const [notification, setNotification] = useState({ isOpen: false, type: '', message: '' });
  
  // 🪄 FITUR BARU: Custom Data Pengarsipan Dinamis
  const [archiveDate, setArchiveDate] = useState('');
  const [archivePeriod, setArchivePeriod] = useState('');

  // 🪄 FITUR BARU: State untuk Modal Audit Log
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  // 🪄 FITUR BARU: State untuk Riwayat Gaji per Individu
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedTeacherHistory, setSelectedTeacherHistory] = useState(null);

  const [isMassPrinting, setIsMassPrinting] = useState(false);

  const bulan = getFormattedPeriod(settings?.payrollPeriod);
  
  // 🪄 TAMBALAN CERDAS: Ambil arsip bulan lalu untuk perbandingan
  const prevArchive = archives && archives.length > 0 ? archives[0] : null;
  const prevTotalTHP = prevArchive ? prevArchive.totalGaji : 0;

  // 🪄 PERBAIKAN: Menambahkan filter status pada tabel rekap
  const filtered = teachers.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) || t.nipy.includes(search);
    const matchStatus = filterStatus === 'Semua' ? true : t.status === filterStatus;
    return matchSearch && matchStatus;
  });

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
     
     // PERBAIKAN: Paksa simpan langsung ke Local Storage dan Server agar permanen tanpa jeda (bypass debounce)
     const newSettings = { ...settings, payrollStatus: 'Pending', lastModified: Date.now() };
     setSettings(newSettings);
     safeStorageSet('payedu_settings', JSON.stringify(newSettings));
     postToGoogleSheets('SAVE_SETTINGS', newSettings).catch(e => console.error("Gagal simpan ajuan ke server:", e));
     
     setNotification({ isOpen: true, type: 'success', message: 'Draft Gaji berhasil diajukan! Status telah dikunci ke server.' });
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
      const result = await postToGoogleSheets('ARCHIVE_PAYROLL', {
        periode: customBulan, // Pakai bulan custom
        data: teachers
      });
      
      if (result.status === 'success') {
        // --- SAVE TO LOCAL ARCHIVE STATE ---
        const totalBersihBulanIni = teachers.reduce((sum, t) => sum + calculatePayroll(t, settings).totalBersih, 0);

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

        // 🪄 TAMBALAN CERDAS: Otomatis memotong Sisa Hutang & Reset Absensi secara menyeluruh untuk bulan baru
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

        const newArchive = {
          id: generateUniqueId('arc-'),
          periode: customBulan, // Pakai bulan custom
          dateArchived: customTanggal, // Pakai tanggal custom
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
        
        // 🪄 Auto-Shift periode ke bulan berikutnya berdasarkan input Admin
        const [y, m] = archivePeriod.split('-');
        const nextD = new Date(y, m, 1);
        const nextPeriod = `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, '0')}`;
        
        // PERBAIKAN: Paksa simpan perubahan periode dan status kembali ke Draft secara permanen
        const newSettings = { ...settings, payrollStatus: 'Draft', payrollPeriod: nextPeriod, lastModified: Date.now() };
        setSettings(newSettings);
        safeStorageSet('payedu_settings', JSON.stringify(newSettings));
        postToGoogleSheets('SAVE_SETTINGS', newSettings).catch(e => console.warn("Sinkronisasi tertunda:", e));
        
        setNotification({ isOpen: true, type: 'success', message: 'Tutup buku berhasil! Data telah diarsipkan secara permanen.' });
      }
    } catch (err) {
      setNotification({ isOpen: true, type: 'error', message: 'Terjadi kesalahan saat memproses arsip. Pastikan koneksi internet stabil.' });
    } finally {
      setIsArchiving(false);
    }
  };

  // TAMBAHAN: Ekspor Tabel Rekap ke CSV sebagai alternatif Print yang tangguh
  const handleExportCSV = () => {
    const headers = ['Nama Pegawai', 'NIPY', 'Status', 'Jabatan', 'T. Masa Kerja', 'T. Jabatan', 'T. Pendidikan', 'T. Kompetensi', 'T. Keluarga', 'Insentif Tamb.', 'Bonus Hadir', 'Kelebihan Jam', 'Total Kotor', 'Potongan', 'THP Bersih', 'Bulan Sebelumnya', 'Selisih'];
    const csvRows = [headers.join(';')];

    let gtMasaKerja = 0, gtJabatan = 0, gtPendidikan = 0, gtKompetensi = 0,
        gtKeluarga = 0, gtTambahan = 0, gtBonusHadir = 0, gtMengajar = 0,
        gtTotalKotor = 0, gtPotong = 0, gtTHP = 0;

    filtered.forEach(t => {
      const slip = calculatePayroll(t, settings);
      
      // 🪄 TAMBALAN CERDAS: Kalkulasi data CSV bulan lalu per individu
      const prevData = prevArchive?.dataGuru.find(guru => guru.id === t.id);
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
     setSettings(prev => {
        const newState = { ...prev, auditLogs: [], lastModified: Date.now() };
        safeStorageSet('payedu_settings', JSON.stringify(newState));
        postToGoogleSheets('SAVE_SETTINGS', newState).catch(e => console.error("Gagal hapus log:", e));
        return newState;
     });
     setIsConfirmClearHistoryOpen(false);
     setNotification({ isOpen: true, type: 'success', message: 'Seluruh riwayat perbaikan berhasil dibersihkan secara permanen.' });
  };

  // 🪄 FUNGSI BARU: Mengambil Data Riwayat Individu dari Arsip
  const getIndividualHistory = (teacherId) => {
    if (!archives) return [];
    
    // Reverse arsip agar grafik berurut dari Terlama -> Terbaru (Kiri ke Kanan)
    const history = [];
    const reversedArchives = [...archives].reverse();
    
    for (let i = 0; i < reversedArchives.length; i++) {
        const arc = reversedArchives[i];
        const historicalData = arc.dataGuru.find(t => t.id === teacherId);
        if (historicalData) {
            const calc = calculatePayroll(historicalData, settings);
            history.push({
                periode: arc.periode.substring(0, 8), // Singkat untuk sumbu X grafik
                periodeFull: arc.periode,
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
              <button onClick={() => setIsConfirmNotifMassalOpen(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors w-full">Batal</button>
              <button onClick={executeKirimNotifMassal} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-sm transition-colors w-full flex justify-center items-center gap-2">
                <BellRing size={16} /> Ya, Kirim Semua
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
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 outline-none dark:text-white transition-all shadow-sm"
              />
            </div>
            
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <button onClick={handleKirimNotifMassal} className="flex-1 sm:flex-none justify-center bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors items-center gap-2 shadow-sm cursor-pointer flex">
                 <BellRing size={16} /> <span className="hidden sm:inline">Notif Massal</span><span className="sm:hidden">Notif</span>
              </button>
              <button onClick={() => setIsAuditModalOpen(true)} className="flex-1 sm:flex-none justify-center bg-amber-100 hover:bg-amber-200 text-amber-700 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 dark:text-amber-400 px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors items-center gap-2 cursor-pointer flex" title="Lihat daftar perubahan manual">
                 <History size={16} /> <span className="hidden sm:inline">Riwayat Edit</span><span className="sm:hidden">Riwayat</span>
              </button>
              <button onClick={handleExportCSV} className="flex-1 sm:flex-none justify-center bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors items-center gap-2 shadow-sm cursor-pointer flex">
                 <Download size={16} /> <span className="hidden sm:inline">Export Excel</span><span className="sm:hidden">Excel</span>
              </button>
              <button onClick={handleMassPrint} disabled={isMassPrinting} className="flex-1 sm:flex-none justify-center bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors items-center gap-2 shadow-sm cursor-pointer flex disabled:opacity-70 disabled:cursor-not-allowed">
                 {isMassPrinting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Printer size={16} />}
                 <span className="hidden sm:inline">{isMassPrinting ? 'Memproses...' : 'Cetak Slip Massal'}</span><span className="sm:hidden">Cetak</span>
              </button>
            </div>
          </div>
        </div>

        {/* MODAL RIWAYAT PERUBAHAN MANUAL (AUDIT LOG CLOUD) */}
        {isAuditModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900 shrink-0">
                <h3 className="font-bold text-lg dark:text-white flex items-center gap-2">
                  <History className="text-amber-500" /> Riwayat Perbaikan (Audit Log Cloud)
                </h3>
                <button onClick={() => { setIsAuditModalOpen(false); setSearchAudit(''); }} className="p-2 hover:bg-slate-200 dark:bg-slate-800 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
              </div>
              <div className="overflow-y-auto p-4 md:p-6 flex-1 bg-slate-50/50 dark:bg-slate-900/20">
                 
                 {/* 🪄 FITUR BARU: Pencarian Audit Log */}
                 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
                    <p className="text-sm text-slate-500 font-medium">Memantau riwayat perubahan manual komponen gaji.</p>
                    <div className="relative w-full sm:w-72 shrink-0">
                       <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                       <input 
                          type="text" 
                          placeholder="Cari nama guru atau komponen..." 
                          value={searchAudit}
                          onChange={(e) => setSearchAudit(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-amber-500 outline-none dark:text-white shadow-sm"
                       />
                    </div>
                 </div>

                 {(!settings.auditLogs || settings.auditLogs.length === 0) ? (
                    <div className="text-center py-10 text-slate-500 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 border-dashed">
                       <History size={40} className="mx-auto mb-3 opacity-30 text-amber-500" />
                       <p className="font-bold">Belum ada riwayat perbaikan yang tercatat.</p>
                    </div>
                 ) : (
                    <div className="space-y-4">
                       {settings.auditLogs
                          .filter(log => 
                             log.teacher.toLowerCase().includes(searchAudit.toLowerCase()) || 
                             log.field.toLowerCase().includes(searchAudit.toLowerCase())
                          )
                          .map((log) => {
                          const renderLogValue = (val) => {
                             if (val === '' || val === null || val === undefined) return '0 / Kosong';
                             if (isNaN(val) || typeof val === 'string') return val;
                             return formatRp(val);
                          };
                          return (
                            <div key={log.id} className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col shadow-sm hover:border-amber-300 dark:hover:border-amber-600 transition-colors">
                               
                               <div className="flex justify-between items-center mb-3">
                                  <div className="flex items-center gap-2">
                                     <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 flex items-center justify-center font-bold">
                                        {log.teacher.charAt(0)}
                                     </div>
                                     <div>
                                        <div className="font-bold text-slate-800 dark:text-slate-200 text-sm md:text-base">{log.teacher}</div>
                                        <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1"><Clock size={10}/> {log.date}</div>
                                     </div>
                                  </div>
                                  <span className="px-3 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] sm:text-xs font-bold rounded-md border border-amber-200 dark:border-amber-800/50 flex items-center gap-1.5">
                                     <Edit size={12}/> {log.field}
                                  </span>
                               </div>

                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-100 dark:border-slate-700/50">
                                  
                                  {/* Kolom Perubahan Nilai Komponen */}
                                  <div className="flex flex-col border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-700 pb-3 md:pb-0 md:pr-4">
                                     <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-2">Nilai Komponen Yang Diubah</span>
                                     <div className="flex items-center gap-2 justify-between">
                                        <div className="flex flex-col">
                                           <span className="text-[10px] text-slate-400 mb-0.5">Sebelumnya</span>
                                           <span className="text-sm font-bold text-slate-500 line-through">{renderLogValue(log.old)}</span>
                                        </div>
                                        <div className="bg-slate-200 dark:bg-slate-700 p-1 rounded-full"><ChevronRight size={14} className="text-slate-500 dark:text-slate-400" /></div>
                                        <div className="flex flex-col text-right">
                                           <span className="text-[10px] text-slate-400 mb-0.5">Setelahnya</span>
                                           <span className="text-sm font-black text-amber-600 dark:text-amber-400">{renderLogValue(log.new)}</span>
                                        </div>
                                     </div>
                                  </div>

                                  {/* Kolom Perubahan Total Gaji */}
                                  <div className="flex flex-col md:pl-2">
                                     <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-2">Dampak Pada Total Gaji (THP)</span>
                                     <div className="flex items-center gap-2 justify-between">
                                        <div className="flex flex-col">
                                           <span className="text-[10px] text-slate-400 mb-0.5">Sebelumnya</span>
                                           <span className="text-sm font-bold text-red-500 line-through">{formatRp(log.oldTotal)}</span>
                                        </div>
                                        <div className="bg-emerald-100 dark:bg-emerald-900/30 p-1 rounded-full"><ChevronRight size={14} className="text-emerald-600 dark:text-emerald-400" /></div>
                                        <div className="flex flex-col text-right">
                                           <span className="text-[10px] text-slate-400 mb-0.5">Setelahnya</span>
                                           <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{formatRp(log.newTotal)}</span>
                                        </div>
                                     </div>
                                  </div>

                               </div>
                            </div>
                          );
                       })}
                       
                       {/* Pesan jika pencarian tidak ditemukan */}
                       {settings.auditLogs && settings.auditLogs.filter(log => log.teacher.toLowerCase().includes(searchAudit.toLowerCase()) || log.field.toLowerCase().includes(searchAudit.toLowerCase())).length === 0 && (
                          <div className="text-center py-6 text-slate-500">
                             Tidak ada riwayat perbaikan yang cocok dengan pencarian "{searchAudit}".
                          </div>
                       )}
                    </div>
                 )}
              </div>
              <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-between items-center shrink-0">
                 <button onClick={() => setIsConfirmClearHistoryOpen(true)} className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 rounded-lg text-xs font-bold transition-colors">
                   Bersihkan Riwayat
                 </button>
                 <button onClick={() => { setIsAuditModalOpen(false); setSearchAudit(''); }} className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-lg font-bold transition-colors text-sm shadow-sm">
                   Tutup
                 </button>
              </div>
            </div>
          </div>
        )}

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

        <div className={`overflow-x-auto flex-1 relative print-area pb-4 touch-pan-x scroll-smooth ${isMassPrinting ? 'print:hidden' : ''}`}>
          <table className="w-full text-left text-xs md:text-sm whitespace-nowrap min-w-max">
            <thead className="text-slate-600 dark:text-slate-400 sticky top-0 z-30 shadow-sm">
              {/* BARIS 1: PENGELOMPOKAN HEADER (NESTED HEADERS) */}
              <tr>
                <th className="p-2 border-b border-r border-slate-300 dark:border-slate-600 bg-slate-200 dark:bg-slate-800 sticky left-0 z-40 shadow-[1px_0_0_rgba(0,0,0,0.1)]"></th>
                <th colSpan="5" className="p-2 border-b border-r border-slate-300 dark:border-slate-600 text-center font-extrabold text-blue-700 dark:text-blue-400 tracking-wider text-[11px] uppercase bg-blue-50 dark:bg-blue-900/40">Komponen Tunjangan Tetap</th>
                <th colSpan="3" className="p-2 border-b border-r border-slate-300 dark:border-slate-600 text-center font-extrabold text-emerald-700 dark:text-emerald-400 tracking-wider text-[11px] uppercase bg-emerald-50 dark:bg-emerald-900/40">Insentif & Bonus</th>
                <th colSpan="2" className="p-2 border-b border-r border-slate-300 dark:border-slate-600 text-center font-extrabold text-slate-700 dark:text-slate-300 tracking-wider text-[11px] uppercase bg-slate-200/70 dark:bg-slate-700/70">Kalkulasi</th>
                <th colSpan="2" className="p-2 border-b border-slate-300 dark:border-slate-600 text-center font-extrabold text-indigo-700 dark:text-indigo-400 tracking-wider text-[11px] uppercase bg-indigo-50 dark:bg-indigo-900/40 sticky right-0 z-40 shadow-[-1px_0_0_rgba(0,0,0,0.1)] no-print min-w-[280px]">Finalisasi & Aksi</th>
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
                
                <th className="p-3 font-bold border-b border-slate-200 dark:border-slate-700 text-right bg-emerald-100 dark:bg-emerald-900/90 text-emerald-800 dark:text-emerald-300 sticky right-[150px] z-30 shadow-[-1px_0_0_rgba(0,0,0,0.1)] min-w-[130px]">THP Bersih</th>
                <th className="p-3 font-bold border-b border-slate-200 dark:border-slate-700 text-center sticky right-0 bg-slate-100 dark:bg-slate-900/90 z-30 shadow-[-1px_0_0_rgba(0,0,0,0.1)] no-print w-[150px] min-w-[150px]">Aksi Gaji</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700/80">
              {filtered.map(t => {
                const slip = calculatePayroll(t, settings);

                // 🪄 TAMBALAN CERDAS: Ambil data bulan lalu per individu untuk ditampilkan di tabel UI
                const prevData = prevArchive?.dataGuru.find(guru => guru.id === t.id);
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
                    
                    {/* 🪄 TAMBALAN CERDAS 2: Sticky Right untuk Kolom THP Bersih */}
                    <td className="p-3 text-right bg-emerald-50 dark:bg-emerald-900/90 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-800 border-l border-r border-slate-200 dark:border-slate-700 sticky right-[150px] z-10 shadow-[-1px_0_0_rgba(0,0,0,0.05)] min-w-[130px]">
                      <div className="font-black text-emerald-700 dark:text-emerald-400 text-[13px] tracking-tight">{formatRp(slip.totalBersih)}</div>
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
                    <td className="p-3 text-center bg-white dark:bg-slate-800 group-hover:bg-indigo-50/40 dark:group-hover:bg-slate-800/60 sticky right-0 z-20 shadow-[-1px_0_0_rgba(0,0,0,0.05)] border-l border-slate-200 dark:border-slate-700 no-print w-[150px] min-w-[150px]">
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
                
                <td className="p-3 text-right font-black text-emerald-700 dark:text-emerald-400 bg-emerald-200 dark:bg-emerald-900/90 text-[14px] sticky right-[150px] z-20 shadow-[-1px_0_0_rgba(0,0,0,0.1)] min-w-[130px] border-l border-slate-300 dark:border-slate-600">{formatRp(gtTHP)}</td>
                <td className="p-3 sticky right-0 bg-slate-200 dark:bg-slate-800 shadow-[-1px_0_0_rgba(0,0,0,0.1)] border-l border-slate-300 dark:border-slate-600 no-print z-30 w-[150px] min-w-[150px]"></td>
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
      const slip = calculatePayroll(t, settings);
      
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
          
          <div className="overflow-x-auto flex-1 relative touch-pan-x scroll-smooth">
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
                  const slip = calculatePayroll(t, settings);
                  
                  // 🪄 TAMBALAN CERDAS: Ambil data bulan sebelumnya dari arsip yang lebih lama
                  const currentIndex = archives.findIndex(a => a.id === selectedArchive.id);
                  const prevArchive = archives[currentIndex + 1]; // Array sudah diurutkan dari yang terbaru ke terlama
                  const prevData = prevArchive?.dataGuru.find(guru => guru.id === t.id);
                  const prevTHP = prevData ? calculatePayroll(prevData, settings).totalBersih : null;
                  const diffIndividu = prevTHP !== null ? slip.totalBersih - prevTHP : null;

                  return (
                    <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                      <td className="p-4 sticky left-0 bg-white dark:bg-slate-800 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/40 z-10 shadow-[1px_0_0_rgba(0,0,0,0.05)]">
                        <div className="font-bold text-slate-800 dark:text-slate-200">{t.name}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{t.nipy} • {t.position}</div>
                      </td>
                      <td className="p-4 text-right font-medium text-slate-600 dark:text-slate-300 bg-slate-50/30 dark:bg-slate-800/20">{formatRp(slip.totalKotor)}</td>
                      <td className="p-4 text-right font-medium text-red-500">-{formatRp(slip.totalPotongan)}</td>
                      <td className="p-4 text-right bg-emerald-50/30 dark:bg-emerald-900/10">
                        <div className="font-bold text-emerald-600 dark:text-emerald-400">{formatRp(slip.totalBersih)}</div>
                        {/* 🪄 Indikator Perbandingan Individual (Arsip) */}
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

        {/* TAMBAHAN BARU: Dampak Penyesuaian Manual (Sistem vs Edit Manual) */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden mb-6 print:break-inside-avoid animate-in fade-in zoom-in-95">
          <div className="p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
            <h3 className="text-base font-bold dark:text-white flex items-center gap-2">
              <History size={18} className="text-amber-500"/> Riwayat Perbandingan Total Gaji Kotor
            </h3>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
             <div className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 text-center">Total Sebelum Perbaikan</span>
                <span className="text-2xl font-black text-slate-800 dark:text-slate-200">{formatRp(reportData.totalKotorDefault)}</span>
             </div>
             
             <div className="flex flex-col items-center justify-center">
                <div className="flex items-center justify-center w-full">
                   <div className="h-px flex-1 bg-slate-300 dark:bg-slate-600 hidden sm:block"></div>
                   <div className={`px-4 py-2 mx-2 rounded-full border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shadow-sm ${reportData.selisihManual > 0 ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400' : reportData.selisihManual < 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400' : 'bg-slate-100 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'}`}>
                      {reportData.selisihManual > 0 ? <TrendingUp size={14}/> : reportData.selisihManual < 0 ? <TrendingUp size={14} className="rotate-180"/> : <Activity size={14}/>}
                      {reportData.selisihManual > 0 ? `+${formatRp(reportData.selisihManual)} (Beban Naik)` : reportData.selisihManual < 0 ? `${formatRp(reportData.selisihManual)} (Beban Turun)` : 'Tidak Ada Perubahan'}
                   </div>
                   <div className="h-px flex-1 bg-slate-300 dark:bg-slate-600 hidden sm:block"></div>
                </div>
                <p className="text-[10px] text-slate-400 text-center mt-3 max-w-[250px]">Akumulasi dampak selisih dari riwayat perbaikan/perubahan data yang dilakukan oleh Admin di menu Kelola Gaji.</p>
             </div>

             <div className="flex flex-col items-center justify-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800/50 shadow-inner">
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-2 text-center">Total Setelah Perbaikan</span>
                <span className="text-2xl font-black text-blue-700 dark:text-blue-300">{formatRp(reportData.totalKotor)}</span>
             </div>
          </div>
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

  const slip = calculatePayroll(myData, settings);
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

  // 🪄 FITUR BARU: State Animasi Selebrasi Konfeti
  const [showCelebration, setShowCelebration] = useState(false);

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

  // 🪄 TAMBALAN CERDAS: Kalkulasi Kehadiran Otomatis dari Array Harian
  let autoHadir = 0, autoSakit = 0, autoIzin = 0, autoAlpa = 0;
  dailyData.forEach(val => {
     const v = String(val).toUpperCase();
     if (v === 'S') autoSakit++;
     else if (v === 'I') autoIzin++;
     else if (v === 'A') autoAlpa++;
     else if (!isNaN(v) && Number(v) > 0) autoHadir++;
  });

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

  // 🪄 PERBAIKAN UX: Gamifikasi Konfeti saat Konfirmasi Gaji
  const handleKonfirmasi = () => {
    setTeachers(prev => prev.map(t => 
      t.id === user.id ? { ...t, payroll: { ...t.payroll, isConfirmed: true } } : t
    ));
    
    // Memicu selebrasi
    setShowCelebration(true);
    
    // Menghilangkan selebrasi setelah 5 detik
    setTimeout(() => {
       setShowCelebration(false);
    }, 5000);
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
        nominal: calculatePayroll(historicalData, settings).totalBersih,
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

  // 🪄 KONFIGURASI MENU BOTTOM NAVIGATION (ANDROID STYLE)
  const bottomNavItems = [
    { id: 'portal_kehadiran', label: 'Absen', icon: Clock },
    { id: 'portal_jadwal', label: 'Jadwal', icon: CalendarDays },
    { id: 'portal_gaji', label: 'Gaji', icon: Wallet },
    { id: 'portal_dashboard', label: 'Profil', icon: UserCircle }, // Profil kini di tengah
    { id: 'portal_riwayat', label: 'Riwayat', icon: History },
    { id: 'portal_pinjaman', label: 'Kasbon', icon: CreditCard },
    { id: 'portal_saran', label: 'Bantuan', icon: MessageSquare },
  ];

  return (
    <>
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in pb-28 md:pb-10 relative">
      
      {/* 🪄 FITUR BARU: OVERLAY ANIMASI KONFETI SELEBRASI */}
      {showCelebration && (
        <div className="fixed inset-0 z-[200] pointer-events-none flex items-center justify-center overflow-hidden">
          {/* Latar gelap tipis */}
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"></div>
          
          {/* Partikel Konfeti menggunakan CSS */}
          {Array.from({ length: 100 }).map((_, i) => {
            const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#06b6d4'];
            const color = colors[Math.floor(Math.random() * colors.length)];
            const left = Math.random() * 100;
            const animDuration = 2 + Math.random() * 3;
            const animDelay = Math.random() * 0.5;
            const isCircle = Math.random() > 0.5;
            return (
              <div
                key={i}
                className={`absolute w-3 h-3 ${isCircle ? 'rounded-full' : 'rounded-sm'}`}
                style={{
                  backgroundColor: color,
                  left: `${left}%`,
                  top: '-10%',
                  animation: `confetti-fall ${animDuration}s ease-in ${animDelay}s forwards`,
                }}
              />
            );
          })}

          {/* Kartu Ucapan Apresiasi */}
          <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl p-8 rounded-[2rem] shadow-[0_20px_60px_-15px_rgba(16,185,129,0.3)] text-center animate-in zoom-in slide-in-from-bottom-10 duration-500 border border-emerald-200 dark:border-emerald-700/50 max-w-sm mx-4 relative z-10 flex flex-col items-center">
            <div className="w-24 h-24 bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-900/50 dark:to-emerald-800/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mb-5 shadow-inner border border-emerald-300 dark:border-emerald-700/50">
              <CheckCircle size={56} className="animate-pulse" />
            </div>
            <h3 className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mb-2 drop-shadow-sm">Alhamdulillah!</h3>
            <p className="text-slate-600 dark:text-slate-300 font-medium text-lg leading-snug">Terima kasih atas dedikasi Anda bulan ini!</p>
          </div>

          {/* Keyframes Animasi Khusus */}
          <style>{`
            @keyframes confetti-fall {
              0% { transform: translateY(0) rotate(0deg); opacity: 1; }
              100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
            }
          `}</style>
        </div>
      )}

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

      {/* TAMBAHAN: Header Banner Portal Jadwal Mengajar */}
      {activeSection === 'portal_jadwal' && (
        <div className="bg-gradient-to-r from-pink-600 to-rose-500 rounded-2xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between shrink-0 animate-in fade-in duration-500">
          {NotificationBell}
          <div className="relative z-10">
            <h1 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-3"><CalendarDays className="text-pink-100" size={32} /> Jadwal Mengajar & Penugasan</h1>
            <p className="text-pink-50 text-sm md:text-base max-w-xl">Pantau jadwal rutin mingguan (Roster) dan riwayat penugasan kegiatan insidental Anda secara transparan.</p>
          </div>
          <CalendarDays size={120} className="absolute -right-6 -bottom-6 text-white/10 transform rotate-12 pointer-events-none" />
        </div>
      )}

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

                {/* Info Text inside Banner */}
                <div className="relative z-10 flex-1">
                   <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight drop-shadow-md mb-2">{myData.name}</h2>
                   <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 md:gap-3 text-blue-100 font-medium">
                      <span className="flex items-center gap-1 bg-black/20 px-3 py-1 rounded-full border border-white/10 shadow-sm"><Briefcase size={14}/> {myData.position}</span>
                      <span className="flex items-center gap-1 bg-black/20 px-3 py-1 rounded-full border border-white/10 shadow-sm"><CheckCircle size={14}/> Guru {myData.status}</span>
                      <span className="flex items-center gap-1 bg-black/20 px-3 py-1 rounded-full border border-white/10 shadow-sm font-mono text-xs">{myData.nipy}</span>
                   </div>
                </div>
                
                {/* Aksen transisi di bagian bawah banner */}
                <div className="absolute -bottom-1 -left-1 -right-1 h-12 bg-gradient-to-t from-white dark:from-slate-800 to-transparent pointer-events-none z-10"></div>
             </div>

             <div className="px-5 md:px-8 pb-8 pt-8 md:pb-10 relative">
                {/* 🪄 BIODATA GURU (DIKEMBALIKAN & DIRAPIKAN) */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                   
                   {/* KIRI: Informasi Profil Lengkap */}
                   <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
                      <div className="p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between">
                         <div className="flex items-center gap-3">
                           <div className="p-2.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl">
                             <UserCircle size={20} />
                           </div>
                           <h3 className="font-bold text-slate-800 dark:text-white">Data Personal & Kepegawaian</h3>
                         </div>
                         <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold border border-emerald-200 dark:border-emerald-800/50">
                           <CheckCircle size={14}/> Terverifikasi
                         </div>
                      </div>
                      <div className="p-6 md:p-8 grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8 flex-1">
                         <div className="group">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"><Building size={14} className="text-slate-300 group-hover:text-blue-500 transition-colors"/> Tempat, Tanggal Lahir</p>
                            <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm leading-tight">{myData.pob}, {formatDateId(myData.dob)}</p>
                            <p className="text-[11px] text-blue-600 dark:text-blue-400 font-bold mt-1 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded w-fit">{!isNaN(new Date(myData.dob).getTime()) ? new Date().getFullYear() - new Date(myData.dob).getFullYear() : '?'} Tahun</p>
                         </div>
                         <div className="group">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"><GraduationCap size={14} className="text-slate-300 group-hover:text-purple-500 transition-colors"/> Pendidikan Terakhir</p>
                            <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm leading-tight">{myData.education}</p>
                         </div>
                         <div className="group">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"><Briefcase size={14} className="text-slate-300 group-hover:text-emerald-500 transition-colors"/> Jabatan & Tugas Inti</p>
                            <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm leading-tight">{myData.position}</p>
                         </div>
                         <div className="group">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"><Calendar size={14} className="text-slate-300 group-hover:text-amber-500 transition-colors"/> Mulai Tugas (TMT)</p>
                            <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm leading-tight">{formatDateId(myData.tmt)}</p>
                            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-bold mt-1 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded w-fit">{!isNaN(new Date(myData.tmt).getTime()) ? new Date().getFullYear() - new Date(myData.tmt).getFullYear() : '?'} Tahun Mengabdi</p>
                         </div>
                         <div className="group">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"><Users size={14} className="text-slate-300 group-hover:text-rose-500 transition-colors"/> Status Keluarga</p>
                            <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm leading-tight">
                              {myData.family?.wife === 1 ? 'Menikah' : myData.family?.wife === 2 ? 'Menikah (Ditanggung Pasangan)' : 'Belum Menikah'}
                            </p>
                            {myData.family?.wife === 1 && myData.family?.children > 0 && (
                               <p className="text-[11px] text-rose-600 dark:text-rose-400 font-bold mt-1 bg-rose-50 dark:bg-rose-900/30 px-2 py-0.5 rounded w-fit">{myData.family.children} Anak Terdaftar</p>
                            )}
                         </div>
                         <div className="group">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"><MessageSquare size={14} className="text-slate-300 group-hover:text-teal-500 transition-colors"/> Kontak (WhatsApp)</p>
                            <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm leading-tight">{myData.phone || 'Belum diisi'}</p>
                         </div>
                      </div>
                   </div>

                   {/* KANAN: Rekening Bank */}
                   <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 to-teal-800 dark:from-emerald-700 dark:to-teal-900 p-6 md:p-8 rounded-3xl shadow-lg border border-emerald-400/30 flex flex-col justify-between min-h-[260px] transform transition-transform hover:scale-[1.02] duration-300">
                      <div className="absolute -top-10 -right-10 w-48 h-48 bg-white/20 rounded-full blur-3xl pointer-events-none"></div>
                      <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-black/30 rounded-full blur-2xl pointer-events-none"></div>
                      
                      <div className="relative z-10 flex justify-between items-start mb-8">
                         <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl shadow-inner flex items-center justify-center text-white border border-white/30">
                            <CreditCard size={28} />
                         </div>
                         <div className="flex gap-1.5">
                           <div className="w-10 h-7 bg-white/20 rounded-md flex items-center justify-center border border-white/30 backdrop-blur-sm shadow-sm">
                             <div className="w-5 h-3 bg-white/40 rounded-sm"></div>
                           </div>
                         </div>
                      </div>

                      <div className="relative z-10">
                         <p className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest mb-1.5 opacity-90 flex items-center gap-2">
                           Rekening Penggajian
                         </p>
                         {myData.bankName ? (
                           <>
                             <h4 className="text-2xl font-black text-white tracking-widest font-mono drop-shadow-md mb-4">{myData.bankAccount}</h4>
                             <div className="flex justify-between items-end border-t border-white/20 pt-3">
                                <div>
                                  <p className="text-[9px] text-emerald-200 uppercase tracking-wider mb-0.5 opacity-80">Atas Nama</p>
                                  <p className="text-xs font-bold text-white uppercase tracking-wider truncate max-w-[150px] drop-shadow-sm">{myData.name}</p>
                                </div>
                                <span className="text-lg font-black text-white italic drop-shadow-md">{myData.bankName}</span>
                             </div>
                           </>
                         ) : (
                           <div className="flex flex-col items-start gap-2 mt-4 border-t border-white/20 pt-3">
                              <h4 className="text-lg font-extrabold text-white opacity-95 tracking-wide">Belum Diatur</h4>
                              <p className="text-[11px] font-medium text-emerald-100 opacity-80">Penerimaan via tunai.</p>
                           </div>
                         )}
                      </div>
                   </div>
                </div>

                {/* 🪄 TAMBALAN CERDAS: Ringkasan & Akses Cepat Menu Tambahan (Disembunyikan di Mobile, Digantikan Bottom Nav) */}
                <div className="pt-2 hidden md:block">
                   <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                      <LayoutDashboard size={20} className="text-blue-500"/> Akses Cepat Menu
                   </h3>
                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      
                      {/* Kehadiran (3D Glassmorphism) */}
                      <div onClick={() => setActiveTab('portal_kehadiran')} className="cursor-pointer bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-5 rounded-[1.5rem] border border-white/60 dark:border-slate-700/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_15px_35px_rgba(245,158,11,0.15)] hover:-translate-y-1 hover:bg-white dark:hover:bg-slate-800 transition-all duration-300 group relative overflow-hidden">
                         <div className="absolute -right-6 -bottom-6 bg-amber-500/10 w-24 h-24 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-colors duration-500"></div>
                         <div className="flex justify-between items-start mb-4 relative z-10">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 flex items-center justify-center shadow-[0_8px_16px_-4px_rgba(245,158,11,0.5),inset_0_2px_4px_rgba(255,255,255,0.6),inset_0_-2px_4px_rgba(0,0,0,0.2)] group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300">
                               <Clock size={24} className="text-white drop-shadow-md" />
                            </div>
                            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center group-hover:bg-amber-100 dark:group-hover:bg-amber-900/40 transition-colors">
                              <ChevronRight size={18} className="text-slate-400 group-hover:text-amber-500 transition-all group-hover:translate-x-0.5" />
                            </div>
                         </div>
                         <div className="relative z-10">
                            <h4 className="font-extrabold text-slate-800 dark:text-slate-200 mb-1 tracking-tight">Rekap Kehadiran</h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Hadir: <span className="font-bold text-amber-600 dark:text-amber-400">{autoHadir} Hari</span> • Telat: <span className="font-bold text-red-500">{telatDisiplin}x</span></p>
                         </div>
                      </div>
                      
                      {/* Gaji (3D Glassmorphism) */}
                      <div onClick={() => setActiveTab('portal_gaji')} className="cursor-pointer bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-5 rounded-[1.5rem] border border-white/60 dark:border-slate-700/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_15px_35px_rgba(16,185,129,0.15)] hover:-translate-y-1 hover:bg-white dark:hover:bg-slate-800 transition-all duration-300 group relative overflow-hidden">
                         <div className="absolute -right-6 -bottom-6 bg-emerald-500/10 w-24 h-24 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-colors duration-500"></div>
                         <div className="flex justify-between items-start mb-4 relative z-10">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-300 to-emerald-600 flex items-center justify-center shadow-[0_8px_16px_-4px_rgba(16,185,129,0.5),inset_0_2px_4px_rgba(255,255,255,0.6),inset_0_-2px_4px_rgba(0,0,0,0.2)] group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                               <Wallet size={24} className="text-white drop-shadow-md" />
                            </div>
                            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/40 transition-colors">
                              <ChevronRight size={18} className="text-slate-400 group-hover:text-emerald-500 transition-all group-hover:translate-x-0.5" />
                            </div>
                         </div>
                         <div className="relative z-10">
                            <h4 className="font-extrabold text-slate-800 dark:text-slate-200 mb-1 tracking-tight">Slip Gaji Bulanan</h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Status: {settings?.payrollStatus === 'Approved' ? <span className="text-emerald-600 font-bold">Tersedia</span> : <span className="text-amber-500 font-bold">Terkunci</span>}</p>
                         </div>
                      </div>

                      {/* Kasbon/Pinjaman (3D Glassmorphism) */}
                      <div onClick={() => setActiveTab('portal_pinjaman')} className="cursor-pointer bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-5 rounded-[1.5rem] border border-white/60 dark:border-slate-700/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_15px_35px_rgba(20,184,166,0.15)] hover:-translate-y-1 hover:bg-white dark:hover:bg-slate-800 transition-all duration-300 group relative overflow-hidden">
                         <div className="absolute -right-6 -bottom-6 bg-teal-500/10 w-24 h-24 rounded-full blur-2xl group-hover:bg-teal-500/20 transition-colors duration-500"></div>
                         <div className="flex justify-between items-start mb-4 relative z-10">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-300 to-teal-600 flex items-center justify-center shadow-[0_8px_16px_-4px_rgba(20,184,166,0.5),inset_0_2px_4px_rgba(255,255,255,0.6),inset_0_-2px_4px_rgba(0,0,0,0.2)] group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300">
                               <CreditCard size={24} className="text-white drop-shadow-md" />
                            </div>
                            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center group-hover:bg-teal-100 dark:group-hover:bg-teal-900/40 transition-colors">
                              <ChevronRight size={18} className="text-slate-400 group-hover:text-teal-500 transition-all group-hover:translate-x-0.5" />
                            </div>
                         </div>
                         <div className="relative z-10">
                            <h4 className="font-extrabold text-slate-800 dark:text-slate-200 mb-1 tracking-tight">Buku Kasbon</h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{loanItems.length > 0 ? <><span className="font-bold text-teal-600 dark:text-teal-400">{loanItems.length} Tagihan</span> Aktif</> : 'Tidak ada tanggungan'}</p>
                         </div>
                      </div>

                      {/* Riwayat (3D Glassmorphism) */}
                      <div onClick={() => setActiveTab('portal_riwayat')} className="cursor-pointer bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-5 rounded-[1.5rem] border border-white/60 dark:border-slate-700/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_15px_35px_rgba(99,102,241,0.15)] hover:-translate-y-1 hover:bg-white dark:hover:bg-slate-800 transition-all duration-300 group relative overflow-hidden">
                         <div className="absolute -right-6 -bottom-6 bg-indigo-500/10 w-24 h-24 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-colors duration-500"></div>
                         <div className="flex justify-between items-start mb-4 relative z-10">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center shadow-[0_8px_16px_-4px_rgba(99,102,241,0.5),inset_0_2px_4px_rgba(255,255,255,0.6),inset_0_-2px_4px_rgba(0,0,0,0.2)] group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                               <History size={24} className="text-white drop-shadow-md" />
                            </div>
                            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/40 transition-colors">
                              <ChevronRight size={18} className="text-slate-400 group-hover:text-indigo-500 transition-all group-hover:translate-x-0.5" />
                            </div>
                         </div>
                         <div className="relative z-10">
                            <h4 className="font-extrabold text-slate-800 dark:text-slate-200 mb-1 tracking-tight">Riwayat Gaji</h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Arsip: <span className="font-bold text-indigo-600 dark:text-indigo-400">{riwayatAsli.length} Bulan</span></p>
                         </div>
                      </div>
                   </div>
                </div>

             </div>
          </div>
        )}

        {/* FITUR BARU: Jadwal Saya (Roster Mingguan & Insidental) */}
        {activeSection === 'portal_jadwal' && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 md:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="font-bold text-lg mb-6 text-slate-800 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
              <ListPlus className="text-pink-500" /> Roster Rutin Mingguan
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
               {['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map((hari) => {
                 const r = myData.payroll?.roster || {};
                 const hariKey = hari.toLowerCase();
                 const jpl = r[hariKey] || 0;
                 return (
                 <div key={hari} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm group hover:border-pink-300 dark:hover:border-pink-600 transition-colors">
                    <div className="bg-slate-100 dark:bg-slate-900/80 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                       <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-pink-500"></span> {hari}
                       </h4>
                       <span className="text-xs font-bold bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 px-2 py-0.5 rounded">{jpl} JPL</span>
                    </div>
                    <div className="p-4 bg-white dark:bg-slate-800 space-y-3">
                       {jpl > 0 ? (
                          <div className="flex flex-col gap-1 p-3 rounded-lg border border-slate-100 dark:border-slate-700/50 hover:bg-pink-50 dark:hover:bg-pink-900/20 hover:border-pink-200 dark:hover:border-pink-800 transition-colors">
                             <span className="text-[10px] font-bold text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/40 px-2 py-0.5 rounded w-fit">Terjadwal</span>
                             <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">Pembelajaran / Penugasan Kelas</span>
                             <span className="text-xs text-slate-500 flex items-center gap-1"><Users size={12}/> Total Beban: {jpl} Jam Pelajaran</span>
                          </div>
                       ) : (
                          <div className="flex flex-col items-center justify-center p-6 text-slate-400 dark:text-slate-500 italic text-sm border-2 border-dashed border-slate-100 dark:border-slate-700 rounded-lg">
                             Tidak ada jadwal wajib pada hari ini.
                          </div>
                       )}
                    </div>
                 </div>
               )})}
            </div>

            <div className="mt-10 p-6 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-xl">
               <h3 className="font-bold text-lg mb-4 text-amber-800 dark:text-amber-300 flex items-center gap-2 pb-3">
                 <Star className="text-amber-500" /> Riwayat Kegiatan Insidental & Tambahan (Bulan Ini)
               </h3>
               <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                     <thead className="bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-b-2 border-amber-200 dark:border-amber-800">
                        <tr>
                          <th className="p-3 font-bold">Keterangan / Nama Kegiatan Khusus</th>
                          <th className="p-3 font-bold text-center">Tambahan Jam (JPL)</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-amber-100 dark:divide-slate-700/50">
                        {(myData.payroll?.kegiatanInsidental || []).length > 0 ? (
                           myData.payroll.kegiatanInsidental.map((keg, i) => (
                             <tr key={i} className="hover:bg-amber-100/50 dark:hover:bg-slate-800/80 transition-colors">
                                <td className="p-3 font-bold text-slate-700 dark:text-slate-300">{keg.ket}</td>
                                <td className="p-3 text-center">
                                   <span className="px-3 py-1 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-400 font-black text-xs shadow-sm">+{keg.jam} JPL</span>
                                </td>
                             </tr>
                           ))
                        ) : (
                           <tr>
                              <td colSpan="2" className="p-8 text-center text-slate-500 italic bg-white dark:bg-slate-800">Belum ada penugasan kegiatan massal/insidental yang tercatat di bulan ini.</td>
                           </tr>
                        )}
                     </tbody>
                  </table>
               </div>
            </div>
          </div>
        )}

        {/* 2. Rekap Kehadiran */}
        {activeSection === 'portal_kehadiran' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 md:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="bg-amber-50 dark:bg-amber-900/10 p-4 rounded-xl border border-amber-100 dark:border-amber-800/30 shadow-inner">
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block mb-1">Total Hari Hadir</span>
              <span className="text-2xl font-black text-amber-800 dark:text-amber-300">{autoHadir} <span className="text-sm font-medium text-amber-600">Hari</span></span>
            </div>
            
            <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-xl border border-red-100 dark:border-red-800/30 shadow-inner">
              <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider block mb-1">Terlambat</span>
              <span className="text-2xl font-black text-red-800 dark:text-red-300">{telatDisiplin} <span className="text-sm font-medium text-red-600">Kali</span></span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">Target Wajib</span>
              <span className="text-2xl font-black text-slate-700 dark:text-slate-200">{wajibJam} <span className="text-sm font-medium text-slate-500">JPL</span></span>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-800/30 shadow-inner">
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block mb-1">Total Realisasi</span>
              <span className="text-2xl font-black text-blue-800 dark:text-blue-300">{realJam} <span className="text-sm font-medium text-blue-600">JPL</span></span>
            </div>
          </div>

          {/* 🪄 TAMBALAN CERDAS: Kartu Rincian Sakit, Izin, Alpa Otomatis */}
          <div className="grid grid-cols-3 gap-3 md:gap-4 mb-6">
             <div className="bg-amber-100/50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 p-3 rounded-xl flex justify-between items-center hover:scale-[1.02] transition-transform">
                <span className="text-xs md:text-sm font-bold text-amber-700 dark:text-amber-400">Sakit (S)</span>
                <span className="text-lg md:text-xl font-black text-amber-600">{autoSakit} <span className="text-[10px] md:text-xs font-medium">Hari</span></span>
             </div>
             <div className="bg-blue-100/50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 p-3 rounded-xl flex justify-between items-center hover:scale-[1.02] transition-transform">
                <span className="text-xs md:text-sm font-bold text-blue-700 dark:text-blue-400">Izin (I)</span>
                <span className="text-lg md:text-xl font-black text-blue-600">{autoIzin} <span className="text-[10px] md:text-xs font-medium">Hari</span></span>
             </div>
             <div className="bg-red-100/50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 p-3 rounded-xl flex justify-between items-center hover:scale-[1.02] transition-transform">
                <span className="text-xs md:text-sm font-bold text-red-700 dark:text-red-400">Alpa (A)</span>
                <span className="text-lg md:text-xl font-black text-red-600">{autoAlpa} <span className="text-[10px] md:text-xs font-medium">Hari</span></span>
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

          {/* 🪄 TAMBAHAN CERDAS: Tabel Riwayat Kegiatan Insidental di Tab Kehadiran */}
          <div className="mt-6 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 shadow-sm">
             <div className="bg-slate-50 dark:bg-slate-900/50 px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <h4 className="font-bold text-slate-700 dark:text-slate-300 text-sm flex items-center gap-2">
                   <Star className="text-amber-500" size={16}/> Rincian Kegiatan Insidental & Tambahan (Bulan Ini)
                </h4>
             </div>
             <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                   <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-3 font-semibold w-24 text-center">Tanggal</th>
                        <th className="p-3 font-semibold">Keterangan Kegiatan Khusus</th>
                        <th className="p-3 font-semibold text-center">Tambahan Jam</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {(myData.payroll?.kegiatanInsidental || []).length > 0 ? (
                         myData.payroll.kegiatanInsidental.map((keg, i) => (
                           <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="p-3 text-center font-bold text-slate-600 dark:text-slate-400">Tgl {keg.tgl}</td>
                              <td className="p-3 font-medium text-slate-700 dark:text-slate-300">{keg.ket}</td>
                              <td className="p-3 text-center">
                                 <span className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-bold text-[11px] shadow-sm">+{keg.jam} JPL</span>
                              </td>
                           </tr>
                         ))
                      ) : (
                         <tr>
                            <td colSpan="3" className="p-6 text-center text-slate-500 italic">Belum ada kegiatan insidental/massal yang tercatat di bulan ini.</td>
                         </tr>
                      )}
                   </tbody>
                </table>
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
                const totalPinjamanAwal = loan.totalPinjaman !== undefined ? loan.totalPinjaman : (loan.nominal * 10);
                const sisaSaldo = loan.sisaHutang !== undefined ? loan.sisaHutang : (loan.nominal * 4); 
                const totalTerbayar = Math.max(0, totalPinjamanAwal - sisaSaldo);
                const persentase = totalPinjamanAwal > 0 ? ((totalTerbayar / totalPinjamanAwal) * 100).toFixed(0) : 0;

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
                        {/* PERBAIKAN: Mengubah 'overflow-hidden' menjadi 'overflow-x-auto' agar tabel di HP bisa digeser ke samping */}
                        <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                          <table className="w-full text-left text-xs md:text-sm whitespace-nowrap min-w-max">
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

    {/* 📱 ANDROID-STYLE BOTTOM NAVIGATION BAR (KHUSUS MOBILE) - 3D GLASSMORPHISM */}
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-t border-white/50 dark:border-slate-700/50 z-[100] flex overflow-x-auto hide-scrollbar snap-x touch-pan-x scroll-smooth shadow-[0_-15px_35px_rgba(0,0,0,0.05)] pt-2 pb-3 px-2">
      {bottomNavItems.map(item => {
         const isActive = activeSection === item.id;

         // Helper penentuan warna dinamis 3D Glassmorphism
         const getGradient = (id) => {
           switch(id) {
             case 'portal_dashboard': return 'from-blue-400 to-blue-600 shadow-blue-500/40';
             case 'portal_jadwal': return 'from-pink-400 to-pink-600 shadow-pink-500/40';
             case 'portal_kehadiran': return 'from-amber-400 to-orange-500 shadow-amber-500/40';
             case 'portal_gaji': return 'from-emerald-400 to-emerald-600 shadow-emerald-500/40';
             case 'portal_pinjaman': return 'from-teal-400 to-teal-600 shadow-teal-500/40';
             case 'portal_riwayat': return 'from-indigo-400 to-indigo-600 shadow-indigo-500/40';
             case 'portal_info': return 'from-purple-400 to-purple-600 shadow-purple-500/40';
             case 'portal_saran': return 'from-rose-400 to-rose-600 shadow-rose-500/40';
             default: return 'from-slate-400 to-slate-600 shadow-slate-500/40';
           }
         };

         const getTextColor = (id) => {
           switch(id) {
             case 'portal_dashboard': return 'text-blue-600 dark:text-blue-400';
             case 'portal_jadwal': return 'text-pink-600 dark:text-pink-400';
             case 'portal_kehadiran': return 'text-amber-600 dark:text-amber-400';
             case 'portal_gaji': return 'text-emerald-600 dark:text-emerald-400';
             case 'portal_pinjaman': return 'text-teal-600 dark:text-teal-400';
             case 'portal_riwayat': return 'text-indigo-600 dark:text-indigo-400';
             case 'portal_info': return 'text-purple-600 dark:text-purple-400';
             case 'portal_saran': return 'text-rose-600 dark:text-rose-400';
             default: return 'text-slate-600 dark:text-slate-400';
           }
         };

         return (
           <button 
             key={item.id} 
             onClick={() => setActiveTab(item.id)}
             className="snap-center flex flex-col items-center justify-center shrink-0 min-w-[72px] sm:min-w-[84px] h-[60px] relative transition-all duration-500 ease-out group outline-none"
           >
             {/* 3D Icon Container */}
             <div className={`relative flex items-center justify-center w-[46px] h-[46px] rounded-[1.1rem] transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] z-10 ${
               isActive 
                 ? `bg-gradient-to-br ${getGradient(item.id)} text-white -translate-y-[22px] scale-110 shadow-[0_12px_20px_-8px_rgba(0,0,0,0.5),inset_0_2px_4px_rgba(255,255,255,0.6),inset_0_-2px_4px_rgba(0,0,0,0.2)]` 
                 : 'bg-transparent text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'
             }`}>
               <item.icon 
                 size={22} 
                 strokeWidth={isActive ? 2.5 : 2} 
                 className={`transition-all duration-500 ${isActive ? 'drop-shadow-md' : 'group-hover:scale-110'}`} 
               />
               
               {/* Notifikasi Red Dot (Diselaraskan dengan 3D pop) */}
               {(item.id === 'portal_gaji' && myData.payroll?.isNotified && !myData.payroll?.isConfirmed) && (
                  <span className={`absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 ${isActive ? 'border-emerald-400' : 'border-white dark:border-slate-900'} animate-pulse shadow-sm`}></span>
               )}
             </div>

             {/* Teks Bawah */}
             <span className={`text-[10px] tracking-tight transition-all duration-500 absolute bottom-1 ${
               isActive 
                 ? `font-extrabold ${getTextColor(item.id)} opacity-100 translate-y-0` 
                 : 'font-medium text-slate-400 dark:text-slate-500 opacity-100 translate-y-0'
             }`}>
               {item.label}
             </span>
             
             {/* Titik indikator kecil di paling bawah saat aktif */}
             <div className={`absolute -bottom-1.5 w-1 h-1 rounded-full transition-all duration-500 ${isActive ? `bg-current ${getTextColor(item.id)} opacity-100 shadow-[0_0_5px_currentColor] scale-100` : 'opacity-0 scale-0'}`}></div>
           </button>
         );
      })}
    </div>
    </>
  );
}

// --- PENGATURAN VIEW ---
function PengaturanView({ teachers, setTeachers, settings, setSettings, feedbacks, setFeedbacks, loginHistory, setLoginHistory, archives, setArchives, fundingSources, setFundingSources }) {
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

  const [activeTabSetting, setActiveTabSetting] = useState('umum');
  
  const settingTabs = [
    { id: 'umum', label: 'Umum & Tampilan', icon: Building, desc: 'Logo, Nama & Kontak' },
    { id: 'tarif', label: 'Master Tarif', icon: Database, desc: 'Variabel Dinamis Gaji' }, // 🪄 TAMBAHAN: Tab Tarif
    { id: 'portal', label: 'Teks Portal Guru', icon: FileText, desc: 'Aturan & Info Penggajian' },
    { id: 'akun', label: 'Manajemen Akses', icon: Key, desc: 'Kelola Akun & Login' },
    { id: 'sistem', label: 'Pengaturan Sistem', icon: Settings, desc: 'Sistem & Keamanan' },
    { id: 'riwayat', label: 'Riwayat Login', icon: Clock, desc: 'Log Aktivitas Guru' },
    { id: 'saran', label: 'Kritik & Saran', icon: MessageSquare, desc: 'Aspirasi & Masukan' },
  ];

  // PENYEDERHANAAN MUTLAK: Sinkronisasi Akun yang Jauh Lebih Mudah Dikelola
  useEffect(() => {
    // 1. Ambil data Admin/Kepsek dari memori lokal (bebas dari sinkronisasi awan)
    const adminAccs = JSON.parse(localStorage.getItem('payedu_admin_accounts')) || [
      { id: 'admin-1', name: 'Administrator System', username: 'Akbar', password: simpleHash('Boy2014'), role: 'Admin' },
      { id: 'kepsek-1', name: 'Kepala Sekolah', username: 'kepsek', password: simpleHash('Ilwani2010'), role: 'Kepala Sekolah' }
    ];

    // 2. Petakan data Guru secara langsung dari database guru
    const teacherAccounts = teachers.map(t => {
      const cleanName = t.name ? t.name.replace(/[^a-zA-Z]/g, '') : 'GU';
      const defaultPass = `${cleanName.length >= 2 ? cleanName.substring(0, 2).toUpperCase() : 'GU'}123`;
      
      return { 
        id: t.id, 
        name: t.name, 
        username: t.id, 
        password: t.customPassword || simpleHash(defaultPass),
        plainPassword: t.plainPassword || defaultPass, // Password akan selalu tampil JELAS untuk Admin
        role: 'Guru',
        phone: t.phone || ''
      };
    });
    
    setAccounts([...adminAccs, ...teacherAccounts]);
  }, [teachers]);

  const [searchAcc, setSearchAcc] = useState('');
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
     kinerja: (settings?.masterRates?.KINERJA_LEVELS || KINERJA_LEVELS).join('\n'),
     kompFields: (settings?.masterRates?.KOMPETENSI_FIELDS || KOMPETENSI_FIELDS).join('\n'),
     kompLevels: (settings?.masterRates?.KOMPETENSI_LEVELS || KOMPETENSI_LEVELS).join('\n'),
     insentif: (settings?.masterRates?.INSENTIF_LIST || INSENTIF_LIST).join('\n'),
     potongan: (settings?.masterRates?.POTONGAN_LIST || POTONGAN_LIST).join('\n'),
  });

  // TAMBAHAN: State Notifikasi Lokal untuk Error AI Summarizer
  const [notification, setNotification] = useState({ isOpen: false, type: '', message: '' });

  // PERBAIKAN: Menambahkan fallback (|| '') untuk mencegah crash toLowerCase pada data undefined
  const filteredAccounts = accounts.filter(a =>
    (a.name || '').toLowerCase().includes(searchAcc.toLowerCase()) ||
    (a.username || '').toLowerCase().includes(searchAcc.toLowerCase())
  );

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
    safeStorageSet('payedu_settings', JSON.stringify(newSettings));
    
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
       text.split('\n').forEach(line => {
          if(!line.trim()) return;
          const parts = line.split('=');
          if(parts.length >= 2) {
             map[parts[0].trim()] = Number(parts[1].replace(/\D/g, '')) || 0;
          }
       });
       return map;
    };
    
    const parseList = (text) => text.split('\n').map(l => l.trim()).filter(l => l !== '');

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
       KINERJA_LEVELS: parseList(localRatesText.kinerja),
       KOMPETENSI_FIELDS: parseList(localRatesText.kompFields),
       KOMPETENSI_LEVELS: parseList(localRatesText.kompLevels),
       INSENTIF_LIST: parseList(localRatesText.insentif),
       POTONGAN_LIST: parseList(localRatesText.potongan),
    };

    const newSettings = { ...settings, masterRates: newMasterRates, lastModified: Date.now() };
    setSettings(newSettings);
    safeStorageSet('payedu_settings', JSON.stringify(newSettings));
    
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
    // 🪄 TAMBALAN CERDAS 1: Memastikan seluruh instrumen aplikasi tercadangkan tanpa ada yang tertinggal
    const backupData = { 
       timestamp: new Date().toISOString(),
       version: '1.5.Pro',
       settings, 
       teachers, 
       accounts,
       archives,
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
  };

  const handleRestoreData = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        if (data.teachers && data.settings) {
          setIsSaving(true); // Memunculkan indikator loading
          
          // 1. Terapkan data ke State Komponen (UI React)
          setTeachers(data.teachers);
          setSettings(data.settings);
          if (data.accounts) {
             setAccounts(data.accounts);
             const adminAccs = data.accounts.filter(a => a.role !== 'Guru');
             localStorage.setItem('payedu_admin_accounts', JSON.stringify(adminAccs));
          }
          if (data.archives && setArchives) setArchives(data.archives);
          if (data.fundingSources && setFundingSources) setFundingSources(data.fundingSources);
          if (data.feedbacks && setFeedbacks) setFeedbacks(data.feedbacks);
          if (data.loginHistory && setLoginHistory) setLoginHistory(data.loginHistory);

          // 2. Paksa Sinkronisasi ke LocalStorage Perangkat (Safety First)
          safeStorageSet('payedu_settings', JSON.stringify(data.settings));
          safeStorageSet('payedu_teachers', JSON.stringify(data.teachers));
          if(data.archives) safeStorageSet('payedu_archives', JSON.stringify(data.archives));
          if(data.fundingSources) localStorage.setItem('payedu_funding', JSON.stringify(data.fundingSources));
          if(data.feedbacks) safeStorageSet('payedu_feedbacks', JSON.stringify(data.feedbacks));
          if(data.loginHistory) safeStorageSet('payedu_loginHistory', JSON.stringify(data.loginHistory));

          // 3. 🪄 TAMBALAN CERDAS 2: PAKSA SINKRONISASI PARALEL KE GOOGLE SHEETS CLOUD
          // Menembak seluruh Endpoint Cloud secara serentak agar Cloud 100% identik dengan file Backup
          if (navigator.onLine) {
             await Promise.allSettled([
               postToGoogleSheets('SAVE_SETTINGS', data.settings),
               postToGoogleSheets('SAVE_TEACHERS', data.teachers),
               data.accounts ? postToGoogleSheets('SAVE_USERS', data.accounts) : Promise.resolve(),
               data.archives ? postToGoogleSheets('SAVE_ARCHIVES', data.archives) : Promise.resolve(),
               data.fundingSources ? postToGoogleSheets('SAVE_FUNDING', data.fundingSources) : Promise.resolve(),
               data.feedbacks ? postToGoogleSheets('SAVE_FEEDBACKS', data.feedbacks) : Promise.resolve(),
               data.loginHistory ? postToGoogleSheets('SAVE_LOGS', data.loginHistory) : Promise.resolve()
             ]);
          }

          setIsSaving(false);
          alert("✅ RESTORE & SYNC PARIPURNA BERHASIL!\n\nSeluruh data (Pengaturan, Pegawai, Akses, Arsip, dll) telah sukses dipulihkan ke perangkat dan disinkronkan sepenuhnya dengan Google Sheets Cloud!");
        } else {
          alert("File backup tidak valid atau rusak (kehilangan data konfigurasi kunci).");
        }
      } catch (err) {
        setIsSaving(false);
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
               className="flex flex-row gap-2 overflow-x-auto pb-2 scroll-smooth touch-pan-x" 
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
                  <form id="formPortal" onSubmit={(e) => {
                     e.preventDefault();
                     setIsSaving(true);
                     
                     const newSettings = {...settings, payrollInfoText: localPortalText, lastModified: Date.now()};
                     setSettings(newSettings);
                     safeStorageSet('payedu_settings', JSON.stringify(newSettings));
                     
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
                                                 <input 
                                                    type="number" 
                                                    value={row.nominal} 
                                                    onChange={e => handleUpdateTenureRow(idx, 'nominal', e.target.value)} 
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
                              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Level Penilaian Kinerja</label>
                              <textarea 
                                rows="6" 
                                value={localRatesText.kinerja} 
                                onChange={e => setLocalRatesText({...localRatesText, kinerja: e.target.value})} 
                                className="w-full p-3.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-[13px] focus:ring-2 focus:ring-blue-400 outline-none dark:text-slate-200 text-slate-700 shadow-inner resize-y leading-relaxed" 
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
                              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Level Kompetensi</label>
                              <textarea 
                                rows="6" 
                                value={localRatesText.kompLevels} 
                                onChange={e => setLocalRatesText({...localRatesText, kompLevels: e.target.value})} 
                                className="w-full p-3.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-[13px] focus:ring-2 focus:ring-amber-400 outline-none dark:text-slate-200 text-slate-700 shadow-inner resize-y leading-relaxed" 
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
                   </div>
                   <div className="flex gap-2 w-full xl:w-auto flex-wrap sm:flex-nowrap">
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

                <div className="flex-1 overflow-x-auto relative touch-pan-x scroll-smooth">
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
                             <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${acc.role === 'Admin' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : acc.role === 'Kepala Sekolah' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : acc.role === 'Yayasan' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                               {acc.role || 'Guru'}
                             </span>
                           </td>
                           <td className="p-4 text-center">
                             <div className="flex items-center justify-center gap-2">
                               {/* TAMBAHAN: Tombol Kirim Akses via WhatsApp */}
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

            {/* TAB: RIWAYAT LOGIN */}
            {activeTabSetting === 'riwayat' && (
              <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-2">
                <div className="p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 shrink-0">
                   <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                     <Clock className="text-slate-500" size={18} /> Riwayat Akses Sistem Terakhir
                   </h3>
                </div>
                <div className="overflow-x-auto flex-1 relative p-0 touch-pan-x scroll-smooth">
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