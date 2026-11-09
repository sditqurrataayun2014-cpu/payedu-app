import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  LayoutDashboard, Users, Clock, Calculator, FileText, Settings, 
  LogOut, LogIn, Sun, Moon, Eye, EyeOff, Search, Edit, Trash2, 
  Menu, X, CheckCircle, CheckCircle2, MessageCircle, XCircle, ChevronLeft, ChevronRight, Printer, AlertCircle, UserCircle,
  GraduationCap, Wallet, Calendar, TrendingUp, Award,
  PlusCircle, Trash, Star, Briefcase, Shield, HeartHandshake, Sparkles,
  Download, Upload, BarChart3, Activity, PieChart as PieChartIcon,
  Info, MessageSquare, ChevronDown, ChevronUp, Send, History, Bell, BellRing,
  Building, Key, Save, Lock, Archive, FolderOpen, ShieldCheck, CreditCard, Database,
  Fingerprint, Cloud, CloudOff, RefreshCw, CalendarDays, ListPlus, CheckSquare, Wrench, UserCheck, Clock3, Check,
  WifiOff, FileSpreadsheet, Filter, Smartphone, Unlock
} from 'lucide-react';
import { 
  fetchCloudData as fetchFromSupabase, 
  pushCloudData as pushToSupabase,
  fetchPresensiGuru,
  pushPresensiGuru,
  pushSinglePresensiRecord,
  subscribePresensiGuru,
  subscribeAllChanges,
  checkCloudTimestamp,
  deduplicateArchives,
  deduplicateTeachers,
  sortTeachersById,
  fetchSettingsOnly,
  fetchTeachersOnly,
  fetchArchivesOnly,
  syncPendingTeacherAttendance,
  flushPendingPresensi,
  registerOfflineSyncListeners
} from './services/dbService';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { getSesiTheme } from './utils/sesiTheme';
import SlipDocument from './components/SlipDocument';
import { 
  exportPayrollToExcel, 
  exportTeachingHoursToExcel, 
  exportAttendanceToExcel 
} from './services/excelExportService';
import { 
  isBiometricSupported, 
  getSavedBiometricAccount, 
  registerBiometricLogin, 
  authenticateWithBiometrics, 
  removeBiometricAccount 
} from './services/biometricService';

// 🚀 MODULARISASI ARSITEKTUR: Dynamic Import (React.lazy) untuk mempercepat loading di HP Guru
const PresensiGuruView = React.lazy(() => import('./PresensiGuruView'));
const ArsipView = React.lazy(() => import('./features/admin/ArsipView'));
const LaporanView = React.lazy(() => import('./features/admin/LaporanView'));
const PengaturanView = React.lazy(() => import('./features/admin/PengaturanView'));

const ViewLoader = ({ title = 'Memuat Modul...' }) => (
  <div className="flex flex-col items-center justify-center min-h-[320px] p-8 text-center animate-in fade-in duration-300">
    <div className="relative w-12 h-12 mb-3">
      <div className="absolute inset-0 rounded-full border-4 border-teal-200 dark:border-teal-900/40"></div>
      <div className="absolute inset-0 rounded-full border-4 border-teal-600 border-t-transparent animate-spin"></div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-2 h-2 bg-teal-600 rounded-full animate-ping"></div>
      </div>
    </div>
    <p className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 tracking-wide">{title}</p>
    <p className="text-[11px] text-slate-400 mt-0.5">Mengunduh komponen sistem terenkripsi...</p>
  </div>
);
import { verifyTeacherDevice } from './services/deviceService';
import { registerBackModal, popAndCloseTopBackModal } from './services/navigationService';

// 🪄 HELPER UNIVERSAL: Mengecek status keaktifan pegawai (Mencegah pegawai Non-Aktif / Resign muncul di operasional gaji & presensi)
export const isTeacherActive = (t) => {
  if (!t) return false;
  if (t.isActive === false) return false;
  
  const ws = String(t.workStatus || '').trim().toLowerCase();
  if (ws === 'non-aktif' || ws === 'tidak aktif' || ws === 'nonaktif' || ws === 'resign' || ws === 'keluar' || ws === 'berhenti') {
    return false;
  }
  
  const st = String(t.status || '').trim().toLowerCase();
  if (st === 'non-aktif' || st === 'tidak aktif' || st === 'nonaktif' || st === 'resign' || st === 'keluar' || st === 'berhenti') {
    return false;
  }

  return true;
};

// Helper Failsafe untuk Penyimpanan Lokal & Timezone Lokal Indonesia (WIB)
const safeStorageGet = (key, fallback) => {
  try {
    const item = localStorage.getItem(key);
    if (!item) return fallback;
    const parsed = JSON.parse(item);
    if (typeof parsed === 'string') {
      try { return JSON.parse(parsed); } catch(e) { return fallback; }
    }
    return parsed;
  } catch (e) {
    return fallback;
  }
};

const safeStorageSet = (key, value) => {
  try {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    localStorage.setItem(key, str);
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22 || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      console.error(`Penyimpanan penuh saat mencoba menyimpan ${key}`);
      alert(`PERINGATAN KRITIKAL: Memori Penyimpanan Penuh!\n\nGagal menyimpan data baru. Memori penyimpanan browser Anda telah mencapai batas maksimal (sekitar 5MB).\n\nSolusi: Buka menu Pengaturan > Sistem, lakukan "Backup Database", lalu gunakan "Reset Keseluruhan Data Pegawai" untuk membersihkan memori lama.`);
    } else {
      console.error(`Gagal menyimpan ${key} ke LocalStorage:`, e);
    }
  }
};

const getLocalIsoDate = (d = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// 📱 HELPER UNIVERSAL: Pembaruan Data Guru Ringkas (cth: ikat perangkat HP otomatis)
export const createTeacherPatchHandler = (setTeachers) => (teacherId, patch) => {
  if (typeof setTeachers !== 'function') return;
  setTeachers(prev => {
    const updated = (prev || []).map(t => {
      if (String(t.id) === String(teacherId)) {
        return { ...t, ...patch };
      }
      return t;
    });
    safeStorageSet('payedu_teachers', updated);
    pushToSupabase('SAVE_TEACHERS', updated).catch(e => console.warn('Gagal sync patch guru ke cloud:', e));
    return updated;
  });
};

// 🪄 AUTO-REPAIR & SANITIZER DATA GURU (Membersihkan JSON nyasar di kolom pendidikan & merapikan data)
const sanitizeTeacherData = (t) => {
  if (!t || typeof t !== 'object') return t;
  let result = { ...t };

  // Jika field education berisi JSON string (korupsi akibat import/backup)
  if (typeof result.education === 'string' && result.education.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(result.education);
      if (parsed && typeof parsed === 'object') {
        const cleanEdu = parsed.education || parsed.payroll?.pendidikan?.tingkat || 'S1';
        result = {
          ...parsed,
          ...result,
          education: cleanEdu,
          pob: (result.pob && result.pob !== 'Tetap' && result.pob !== 'Tidak Tetap') ? result.pob : (parsed.pob || '-'),
          dob: result.dob || parsed.dob || '',
          status: (result.status === 'Tetap' || result.status === 'Tidak Tetap') ? result.status : (parsed.status || 'Tetap'),
          position: (result.position && result.position !== 'Tetap' && result.position !== 'Tidak Tetap') ? result.position : (parsed.position || 'Guru'),
          family: result.family || parsed.family || { wife: 0, children: 0 },
          payroll: result.payroll || parsed.payroll || {}
        };
      }
    } catch(e) {}
  }

  // Jika education adalah object
  if (result.education && typeof result.education === 'object') {
    result.education = result.education.tingkat || 'S1';
  }

  // Pastikan field-field dasar terisi dengan benar
  if (!result.education || result.education === '-') {
    result.education = result.payroll?.pendidikan?.tingkat || 'S1';
  }
  if (!result.status || result.status === '-') {
    result.status = 'Tetap';
  }
  if (!result.position || result.position === '-') {
    result.position = result.payroll?.jabatans?.[0]?.detail || result.payroll?.jabatans?.[0]?.kategori || 'Guru';
  }

  return result;
};

const sanitizeTeacherList = (list) => {
  if (!Array.isArray(list)) return [];
  const sanitized = list.map(sanitizeTeacherData);
  return sortTeachersById(deduplicateTeachers(sanitized));
};

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
let KINERJA_RATES = { 'Sangat Baik': 100000, 'Baik': 50000, 'Cukup': 0, 'Kurang': 0 };
let KOMPETENSI_FIELDS = ['Tahsin Qur\'an', 'Tahsin Tahfidz', 'Komputer Dan Administrasi', 'Bahasa Arab', 'Bahasa Inggris', 'Lainnya'];
let KOMPETENSI_LEVELS = ['Sangat Ahli', 'Ahli', 'Cukup Ahli', 'Pra Ahli', 'Pemula'];
let KOMPETENSI_LEVEL_RATES = { 'Sangat Ahli': 150000, 'Ahli': 100000, 'Cukup Ahli': 75000, 'Pra Ahli': 50000, 'Pemula': 25000 };
let INSENTIF_LIST = ['Koordinator Tahfidz', 'Tugas Harian', 'Operator', 'Kajian & Tahta Guru', 'Pembantu Sarpras', 'Kebersihan Putra', 'Personalia', 'Notulen Rapat', 'Asisten Tu', 'Asisten Wali Kelas', 'Kebersihan & Security Putri', 'Asisten Operator', 'Penguji Tasmi', 'Penguji Kenaikan Iqro', 'Pengabdian', 'Buka/Kunci Pintu Sekolah Lk', 'Buka/Kunci Pintu Sekolah Pr', 'Guru GTT', 'Satpam Sekolah Putra', 'Lainnya'];
let POTONGAN_LIST = ['Kasbon Sekolah', 'Cicilan Koperasi', 'Iuran PGRI', 'Dana Sosial', 'Pinjaman Rekan Guru', 'Pembayaran Barang', 'Lainnya'];

// DIPERBARUI: Mengosongkan data dummy agar aplikasi bersih dan dimulai dari nol (0 Pegawai)
const initialTeachers = [];

const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

// --- KONFIGURASI DATABASE SUPABASE (CLOUD & OFFLINE FALLBACK) ---

// 🪄 TAMBALAN CERDAS: Menambahkan Perisai Data utama pada kalkulasi
const calculatePayroll = (teacher, settings) => {
  if (!teacher) return { tMasaKerja: 0, tJabatan: 0, tPendidikan: 0, tKompetensi: 0, bonusHadir: 0, potongTelat: 0, tDisiplin: 0, tKeluargaWife: 0, tKeluargaAnak: 0, tKeluarga: 0, tTambahan: 0, tMengajar: 0, jamDihitung: 0, jamPlus: 0, tPotonganLainnya: 0, totalKotor: 0, totalPotongan: 0, totalBersih: 0 };
  const p = teacher.payroll || {}; 
  const family = teacher.family || {}; 
  
  const isTetap = teacher.status === 'Tetap'; // TAMBAHAN: Cek status mutlak pegawai
  
  let tMasaKerja = 0;
  const tmtYear = new Date(teacher.tmt || new Date()).getFullYear();
  
  // 🪄 PERBAIKAN: Tunjangan Masa Kerja bisa di-edit manual (override) mutlak oleh Admin
  let manualTenure = p.tunjanganMasaKerjaManual;
  if (manualTenure !== undefined && manualTenure !== null && manualTenure !== "") {
    tMasaKerja = Number(manualTenure) || 0; 
  } else if (!isTetap) {
    tMasaKerja = 0;
  } else {
    tMasaKerja = (settings?.masterRates?.TENURE_RATES || TENURE_RATES)[tmtYear] || 0;
  }

  const tJabatan = (p.jabatans || []).reduce((sum, j) => sum + (Number(j.nominal) || 0), 0);
  
  // 🪄 PERBAIKAN: Tunjangan Pendidikan HANYA untuk pegawai Tetap
  let tPendidikan = 0;
  if (!isTetap) {
    tPendidikan = 0;
  } else {
    let manualEdu = p.pendidikan?.nominalOverride;
    if (manualEdu === 0) manualEdu = '';
    tPendidikan = manualEdu !== undefined && manualEdu !== '' ? (Number(manualEdu) || 0) : ((settings?.masterRates?.EDU_RATES || EDU_RATES)[teacher.education] || 0);
  }
  
  const tKompetensi = (p.kompetensi || []).reduce((sum, item) => sum + (Number(item.nominal) || 0), 0);
  
  // Logika Baru: Bonus Hadir otomatis dari Total Tepat Waktu (Realisasi - Telat)
  const realJam = Number(p.jamMengajar?.realisasi) || 0;
  const telat = Number(p.disiplin?.telat) || 0;
  const tepatWaktu = Math.max(0, realJam - telat);

  const bonusHadir = tepatWaktu * (Number(p.disiplin?.tarifHadir) || 0);
  const potongTelat = telat * (Number(p.disiplin?.tarifTelat) || 0);
  const tDisiplin = bonusHadir - potongTelat;

  // 🪄 PERBAIKAN: Tunjangan Keluarga HANYA untuk pegawai Tetap
  let tKeluarga = 0, tKeluargaWife = 0, tKeluargaAnak = 0;
  if (!isTetap) {
    tKeluarga = 0; tKeluargaWife = 0; tKeluargaAnak = 0;
  } else {
    const tarifSuamiIstri = p.keluarga?.tarifSuamiIstri !== undefined && p.keluarga?.tarifSuamiIstri !== '' ? (Number(p.keluarga.tarifSuamiIstri) || 0) : 200000;
    const tarifAnak = p.keluarga?.tarifAnak !== undefined && p.keluarga?.tarifAnak !== '' ? (Number(p.keluarga.tarifAnak) || 0) : 100000;

    tKeluargaWife = Number(family.wife) === 1 ? tarifSuamiIstri : 0;
    tKeluargaAnak = Number(family.wife) === 1 ? (Number(family.children) || 0) * tarifAnak : 0;
    tKeluarga = tKeluargaWife + tKeluargaAnak;
  }

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

// Helper Super Cerdas Konversi Tanggal ke Format ISO (YYYY-MM-DD) untuk <input type="date">
export const formatToInputDate = (dateStr) => {
  if (!dateStr) return '';
  let str = String(dateStr).trim();
  
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return str.split('T')[0];
  
  const matchSlash = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (matchSlash) {
    return `${matchSlash[3]}-${matchSlash[2].padStart(2, '0')}-${matchSlash[1].padStart(2, '0')}`;
  }

  const bulanMap = { 
    'jan': '01', 'januari': '01',
    'feb': '02', 'februari': '02',
    'mar': '03', 'maret': '03',
    'apr': '04', 'april': '04',
    'mei': '05', 'may': '05',
    'jun': '06', 'juni': '06',
    'jul': '07', 'juli': '07',
    'agu': '08', 'agustus': '08', 'aug': '08',
    'sep': '09', 'september': '09',
    'okt': '10', 'oktober': '10', 'oct': '10',
    'nov': '11', 'november': '11',
    'des': '12', 'desember': '12', 'dec': '12' 
  };
  const parts = str.toLowerCase().split(/[\s\-]+/);
  if (parts.length >= 3) {
    const d = parts[0].padStart(2, '0');
    const m = bulanMap[parts[1]] || '01';
    let y = parts[2];
    if (y.length === 2) y = parseInt(y, 10) > 30 ? `19${y}` : `20${y}`;
    if (parseInt(d, 10) > 0 && parseInt(y, 10) > 1900) {
      return `${y}-${m}-${d}`;
    }
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return '';
};

const formatRp = (angka) => {
  const num = Number(angka) || 0;
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
};

// Helper untuk memformat angka nominal menjadi format ribuan titik secara otomatis saat diketik (cth: "1.000.000")
const formatInputRupiah = (val) => {
  if (val === null || val === undefined || val === '') return '';
  if (val === 0 || val === '0') return '0';
  const cleanStr = String(val).replace(/\D/g, '');
  if (!cleanStr) return '';
  return new Intl.NumberFormat('id-ID').format(cleanStr);
};

const parseInputRupiah = (valStr) => {
  if (valStr === null || valStr === undefined || valStr === '') return 0;
  const cleanStr = String(valStr).replace(/\D/g, '');
  return cleanStr ? Number(cleanStr) : 0;
};

// Komponen Input Nominal Rupiah Otomatis Bertitik saat Diketik Admin
function FormattedRupiahInput({ value, onChange, className = "", placeholder = "0", ...props }) {
  const [displayValue, setDisplayValue] = useState(() => formatInputRupiah(value));

  useEffect(() => {
    setDisplayValue(formatInputRupiah(value));
  }, [value]);

  const handleChange = (e) => {
    const raw = e.target.value;
    const cleanNumber = raw.replace(/\D/g, '');
    const formatted = cleanNumber ? new Intl.NumberFormat('id-ID').format(cleanNumber) : '';
    setDisplayValue(formatted);
    if (onChange) {
      onChange(cleanNumber ? Number(cleanNumber) : '');
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
      {...props}
    />
  );
};

const parseSmartDate = (dateStr) => {
  if (!dateStr) return null;
  if (dateStr instanceof Date && !isNaN(dateStr.getTime())) return dateStr;
  
  let str = String(dateStr).trim();
  if (!str || str === '-' || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined') return null;

  // Format YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  // Format DD-MM-YYYY atau DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const [_, d, m, y] = dmyMatch.map(Number);
    return new Date(y, m - 1, d);
  }

  // Format DD-Bulan-YYYY (misal: 10 Mei 2020 atau 10-May-2020)
  const bulanMap = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, jun: 6, jul: 7, agu: 8, ags: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };
  const dmyTextMatch = str.toLowerCase().match(/^(\d{1,2})[\/\-\s]+([a-z]+)[\/\-\s]+(\d{2,4})$/);
  if (dmyTextMatch) {
    const d = Number(dmyTextMatch[1]);
    const bKey = dmyTextMatch[2].substring(0, 3);
    const m = bulanMap[bKey] || 1;
    let y = Number(dmyTextMatch[3]);
    if (y < 100) y = y > 30 ? 1900 + y : 2000 + y;
    return new Date(y, m - 1, d);
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed;
  return null;
};

const formatDateId = (dateString) => {
  if (!dateString || dateString === '-') return '-';
  const d = parseSmartDate(dateString);
  if (!d) return dateString;
  const options = { day: 'numeric', month: 'long', year: 'numeric' };
  return d.toLocaleDateString('id-ID', options);
};

const calculateYearsFromDate = (dateStr) => {
  if (!dateStr || dateStr === '-') return '?';
  const d = parseSmartDate(dateStr);
  if (!d) return '?';
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) {
    years--;
  }
  return years >= 0 ? years : '?';
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

// Kamus nama bulan bahasa Indonesia & Inggris untuk normalisasi tanggal kebal eror
const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const MONTH_INDEX_MAP = {
  januari: 0, jan: 0, january: 0,
  februari: 1, feb: 1, february: 1,
  maret: 2, mar: 2, march: 2,
  april: 3, apr: 3,
  mei: 4, may: 4,
  juni: 5, jun: 5, june: 5,
  juli: 6, jul: 6, july: 6,
  agustus: 7, agu: 7, agt: 7, august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  oktober: 9, okt: 9, oct: 9, october: 9,
  november: 10, nov: 10,
  desember: 11, des: 11, dec: 11, december: 11
};

// Helper untuk mengurai berbagai format string periode menjadi Date object valid (Mencegah "Invalid Date")
const parsePeriodToDate = (periodStr) => {
  if (!periodStr) return new Date();
  if (periodStr instanceof Date && !isNaN(periodStr.getTime())) return periodStr;

  const str = String(periodStr).trim();

  // 1. Cek format nama bulan + tahun, contoh: "Agustus 2026", "Juli 2026", "Des 2025"
  const textMatch = str.match(/^([a-zA-Z]+)\s+(\d{4})$/);
  if (textMatch) {
    const monthName = textMatch[1].toLowerCase();
    const year = parseInt(textMatch[2], 10);
    if (MONTH_INDEX_MAP[monthName] !== undefined && !isNaN(year)) {
      return new Date(year, MONTH_INDEX_MAP[monthName], 1);
    }
  }

  // 2. Cek format YYYY-MM atau YYYY/MM (contoh: "2026-08")
  const yyyyMmMatch = str.match(/^(\d{4})[-/](\d{1,2})$/);
  if (yyyyMmMatch) {
    const year = parseInt(yyyyMmMatch[1], 10);
    const month = parseInt(yyyyMmMatch[2], 10) - 1;
    if (!isNaN(year) && !isNaN(month) && month >= 0 && month <= 11) {
      return new Date(year, month, 1);
    }
  }

  // 3. Cek format MM-YYYY atau MM/YYYY (contoh: "08-2026")
  const mmYyyyMatch = str.match(/^(\d{1,2})[-/](\d{4})$/);
  if (mmYyyyMatch) {
    const month = parseInt(mmYyyyMatch[1], 10) - 1;
    const year = parseInt(mmYyyyMatch[2], 10);
    if (!isNaN(year) && !isNaN(month) && month >= 0 && month <= 11) {
      return new Date(year, month, 1);
    }
  }

  // 4. Standar Date parse (ISO string dsb)
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return new Date();
};

// Fungsi Helper untuk memformat string periode ke format teks lokal "Bulan YYYY" (Anti "Invalid Date")
const getFormattedPeriod = (periodStr) => {
  if (!periodStr) {
    const d = new Date();
    return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  }

  const str = String(periodStr).trim();

  // Jika string SUDAH berformat "Bulan YYYY" (misal "Agustus 2026", "Juli 2026"), langsung rapikan dan kembalikan
  const textMatch = str.match(/^([a-zA-Z]+)\s+(\d{4})$/);
  if (textMatch) {
    const monthLower = textMatch[1].toLowerCase();
    const year = textMatch[2];
    if (MONTH_INDEX_MAP[monthLower] !== undefined) {
      const properMonth = MONTH_NAMES_ID[MONTH_INDEX_MAP[monthLower]];
      return `${properMonth} ${year}`;
    }
  }

  // Jika berupa YYYY-MM atau format lainnya, urai via parsePeriodToDate
  const d = parsePeriodToDate(str);
  if (isNaN(d.getTime())) {
    return str; // Jangan pernah return "Invalid Date", fallback ke string aslinya
  }

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

// TAMBALAN CERDAS: Helper Parser & Sorter Riwayat Akses Sistem (Memastikan Kronologis Mutlak)
const parseLogTimestamp = (log) => {
  if (!log) return 0;
  if (log.timeRaw && typeof log.timeRaw === 'number') return log.timeRaw;
  if (log.timestamp) {
    const t = new Date(log.timestamp).getTime();
    if (!isNaN(t)) return t;
  }
  if (log.created_at) {
    const t = new Date(log.created_at).getTime();
    if (!isNaN(t)) return t;
  }
  // Cek ID berformat base36 timestamp (log-m7x...)
  if (typeof log.id === 'string' && log.id.startsWith('log-')) {
    try {
      const b36 = log.id.replace('log-', '').substring(0, 8);
      const parsed = parseInt(b36, 36);
      if (!isNaN(parsed) && parsed > 1000000000000) return parsed;
    } catch (e) {}
  }
  // Parsing string penanggalan lokal bahasa Indonesia (contoh: "1 September 2026 06.40 WIB", "01/09/2026, 06.40", "1 Sep 2026 pukul 06.40 WIB")
  if (log.time && typeof log.time === 'string') {
    try {
      const cleanTime = log.time.replace(/\s*WIB/i, '').replace(/pukul\s*/i, '').trim();
      const idMonths = {
        januari: 0, jan: 0,
        februari: 1, feb: 1,
        maret: 2, mar: 2,
        april: 3, apr: 3,
        mei: 4, may: 4,
        juni: 5, jun: 5,
        juli: 6, jul: 6,
        agustus: 7, agu: 7, ags: 7,
        september: 8, sep: 8,
        oktober: 9, okt: 9, oct: 9,
        november: 10, nov: 10,
        desember: 11, des: 11, dec: 11
      };
      const match = cleanTime.match(/(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})(?:[,\s]+(\d{1,2})[.:](\d{1,2}))?/);
      if (match) {
        const day = parseInt(match[1], 10);
        const monthKey = match[2].toLowerCase();
        const year = parseInt(match[3], 10);
        const hour = match[4] ? parseInt(match[4], 10) : 0;
        const minute = match[5] ? parseInt(match[5], 10) : 0;
        if (idMonths[monthKey] !== undefined) {
          return new Date(year, idMonths[monthKey], day, hour, minute).getTime();
        }
      }
      const directParsed = new Date(cleanTime).getTime();
      if (!isNaN(directParsed)) return directParsed;
    } catch (e) {}
  }
  return 0;
};

const sortLoginLogs = (logs) => {
  if (!Array.isArray(logs)) return [];
  return [...logs].sort((a, b) => parseLogTimestamp(b) - parseLogTimestamp(a));
};

// 🪄 FITUR BARU: Variabel Master Default untuk inisialisasi awal
const defaultMasterRates = {
  TENURE_RATES: TENURE_RATES,
  EDU_RATES: EDU_RATES,
  JOB_CATEGORIES: JOB_CATEGORIES,
  JOB_ROLES: JOB_ROLES,
  KINERJA_LEVELS: KINERJA_LEVELS,
  KINERJA_RATES: KINERJA_RATES,
  KOMPETENSI_FIELDS: KOMPETENSI_FIELDS,
  KOMPETENSI_LEVELS: KOMPETENSI_LEVELS,
  KOMPETENSI_LEVEL_RATES: KOMPETENSI_LEVEL_RATES,
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
    return sanitizeTeacherList(safeStorageGet('payedu_teachers', initialTeachers));
  });
  const [user, setUser] = useState(() => {
    return safeStorageGet('payedu_session', null);
  });
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('payedu_theme') === 'dark');
  const [generalSettings, setGeneralSettings] = useState(() => {
    return safeStorageGet('payedu_settings', defaultGeneralSettings);
  });
  const [feedbacks, setFeedbacks] = useState(() => {
    return safeStorageGet('payedu_feedbacks', []);
  });
  const [loginHistory, setLoginHistory] = useState(() => {
    return sortLoginLogs(safeStorageGet('payedu_loginHistory', []));
  });
  const [archives, setArchives] = useState(() => {
    return safeStorageGet('payedu_archives', []);
  });
  const [presensiGuru, setPresensiGuru] = useState(() => {
    return safeStorageGet('payedu_presensi_guru', []);
  });
  const [auditLogs, setAuditLogs] = useState(() => {
    return safeStorageGet('payedu_audit_logs', []);
  });

  // 📱 Handler Pembaruan Data Guru Ringkas (cth: ikat perangkat HP otomatis)
  const handleUpdateTeacherPatch = useMemo(() => createTeacherPatchHandler(setTeachers), [setTeachers]);

  const [isOnline, setIsOnline] = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true);

  // 📡 Deteksi Koneksi Internet, Auto-Sync & Antrean Presensi Offline (IndexedDB + Background Sync API)
  useEffect(() => {
    // 🛰️ Daftarkan listener sinkronisasi IndexedDB + Background Sync API
    const unregisterOfflineSync = registerOfflineSyncListeners(pushSinglePresensiRecord);

    const handleOnline = () => {
      setIsOnline(true);
      // 🛡️ Flush antrian presensi yang gagal saat offline
      flushPendingPresensi().catch(e => console.warn('[Flush Queue] Warning:', e));
      fetchCloudData(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      if (typeof unregisterOfflineSync === 'function') unregisterOfflineSync();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 🛡️ Fungsi Universal Pencatat Jejak Audit (Audit Trail)
  const saveAuditLog = useCallback((param1, param2, param3, param4, param5) => {
    let entry = {};
    // Signature 1: saveAuditLog(teacherObj, fieldLabel, oldVal, newVal)
    if (param1 && typeof param1 === 'object' && param1.name) {
      entry = {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        timestamp: new Date().toISOString(),
        actor: user?.name || 'Administrator',
        action: 'Ubah ' + (param2 || 'Komponen Gaji'),
        target: param1.name,
        detail: `Mengubah ${param2} dari Rp ${Number(param3 || 0).toLocaleString('id-ID')} menjadi Rp ${Number(param4 || 0).toLocaleString('id-ID')}`,
        category: 'finansial',
      };
    } 
    // Signature 2: saveAuditLog(actor, action, target, detail, category)
    else {
      entry = {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        timestamp: new Date().toISOString(),
        actor: param1 || user?.name || 'Administrator',
        action: param2 || 'Aktivitas Sistem',
        target: param3 || '-',
        detail: typeof param4 === 'object' ? JSON.stringify(param4) : String(param4 || '-'),
        category: param5 || 'finansial',
      };
    }

    setAuditLogs(prev => {
      const updated = [entry, ...(prev || [])].slice(0, 400);
      safeStorageSet('payedu_audit_logs', updated);
      return updated;
    });
  }, [user]);

  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState('synced');
  const [hasConflict, setHasConflict] = useState(false);

  // 🪄 PERBAIKAN MUTLAK: Menggembok status awal sejak detik pertama agar kebal dari Wipe Out / Hard Refresh
  const isPushingDataRef = useRef(false);
  const lastSavedSettingsRef = useRef(JSON.stringify({ ...generalSettings, lastModified: 0 }));
  const lastSavedTeachersRef = useRef(JSON.stringify(teachers));
  const lastSavedArchivesRef = useRef(JSON.stringify(archives));
  const lastSavedFeedbacksRef = useRef(JSON.stringify(feedbacks));
  const lastSavedLogsRef = useRef(JSON.stringify(loginHistory));
  const lastSavedPresensiRef = useRef(JSON.stringify(presensiGuru));
  const lastKnownCloudTimestampRef = useRef(null); // 🔋 Smart Polling: Pelacak timestamp cloud terakhir

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
      
      const res = await fetchFromSupabase({ isBackground: isBackgroundSync, role: user?.role });
      
      if (res.status === 'success' && res.data) {
        const serverSettings = res.data.settings && Object.keys(res.data.settings).length > 0 ? res.data.settings : defaultGeneralSettings;
        const serverTeachers = Array.isArray(res.data.teachers) ? res.data.teachers : [];
        const serverArchives = Array.isArray(res.data.archives) ? res.data.archives : [];
        const serverFeedbacks = Array.isArray(res.data.feedbacks) ? res.data.feedbacks : [];
        const serverLogs = Array.isArray(res.data.loginHistory) ? res.data.loginHistory : [];
        
        if (isBackgroundSync) {
          if (serverSettings.maintenanceMode !== undefined) {
             setGeneralSettings(prev => {
                if (prev.maintenanceMode !== serverSettings.maintenanceMode) {
                   const updated = { ...prev, maintenanceMode: serverSettings.maintenanceMode };
                   safeStorageSet('payedu_settings', updated);
                   return updated;
                }
                return prev;
             });
          }
          
          const cleanTeachers = sanitizeTeacherList(serverTeachers);
          const cleanArchives = deduplicateArchives(serverArchives);

          // 🪄 PERBAIKAN MUTLAK: Guru tidak pernah memicu banner konflik (Presensi & Slip Guru selalu berjalan mulus)
          if (!user || user.role === 'guru') {
            setGeneralSettings(serverSettings);
            setTeachers(cleanTeachers);
            setArchives(cleanArchives);
            setFeedbacks(serverFeedbacks);
            safeStorageSet('payedu_settings', serverSettings);
            safeStorageSet('payedu_teachers', cleanTeachers);
            safeStorageSet('payedu_archives', cleanArchives);
            safeStorageSet('payedu_feedbacks', serverFeedbacks);
            setHasConflict(false);
          } else {
            // Untuk Admin / Kepsek: Selama Admin tidak sedang mem-push perubahan, terapkan update cloud secara halus
            if (serverSettings.lastModified > (generalSettings.lastModified + 3000) && !isPushingDataRef.current) {
               lastSavedSettingsRef.current = JSON.stringify({ ...serverSettings, lastModified: 0 });
               lastSavedTeachersRef.current = JSON.stringify(cleanTeachers);
               lastSavedArchivesRef.current = JSON.stringify(cleanArchives);
               
               setGeneralSettings(serverSettings);
               setTeachers(cleanTeachers);
               setArchives(cleanArchives);
               setFeedbacks(serverFeedbacks);
               safeStorageSet('payedu_settings', serverSettings);
               safeStorageSet('payedu_teachers', cleanTeachers);
               safeStorageSet('payedu_archives', cleanArchives);
               safeStorageSet('payedu_feedbacks', serverFeedbacks);
               setHasConflict(false);
            }
          }
        } else {
          // 🛡️ ANTI-WIPEOUT & TIMESTAMP COMPARISON PADA REFRESH / INITIAL LOAD:
          const localSettings = safeStorageGet('payedu_settings', null);
          const localTeachers = safeStorageGet('payedu_teachers', []);
          const localArchives = safeStorageGet('payedu_archives', []);

          const serverTime = Number(serverSettings?.lastModified) || 0;
          const localTime = Number(localSettings?.lastModified) || 0;

          // 1. Cek apakah data lokal lebih baru daripada data di cloud
          const isLocalNewer = localTime > serverTime && localSettings && Object.keys(localSettings).length > 0;
          // 2. Cek apakah server kosong padahal lokal memiliki data guru
          const isServerTeachersEmpty = (!serverTeachers || serverTeachers.length === 0) && (localTeachers && localTeachers.length > 0);

          let finalSettings = serverSettings;
          let finalTeachers = serverTeachers;
          let finalArchives = serverArchives;

          // 🛡️ ANTI-WIPEOUT: Hanya ADMIN yang boleh push SYNC_ALL ke cloud! Guru tidak pernah push SYNC_ALL!
          if (user && user.role !== 'guru' && (isLocalNewer || isServerTeachersEmpty)) {
            console.log("🛡️ Proteksi Sinkronisasi: Mempertahankan data lokal Admin yang lebih baru & auto-push ke Supabase Cloud");
            if (isLocalNewer && localSettings) {
              finalSettings = { ...serverSettings, ...localSettings };
            }
            if (isServerTeachersEmpty || (isLocalNewer && localTeachers && localTeachers.length > 0)) {
              finalTeachers = localTeachers;
            }
            if (isLocalNewer && localArchives && localArchives.length > 0) {
              finalArchives = localArchives;
            }

            // Segera dorong data lokal terbaru ke Supabase agar tersimpan permanen di cloud
            pushToSupabase('SYNC_ALL', {
              settings: finalSettings,
              teachers: finalTeachers,
              archives: finalArchives
            }).catch(e => console.warn("Auto-sync initial cloud push:", e));
          }

          const cleanTeachers = sanitizeTeacherList(finalTeachers);
          const cleanArchives = deduplicateArchives(finalArchives);
          lastSavedSettingsRef.current = JSON.stringify({ ...finalSettings, lastModified: 0 });
          lastSavedTeachersRef.current = JSON.stringify(cleanTeachers);
          lastSavedArchivesRef.current = JSON.stringify(cleanArchives);
          lastKnownCloudTimestampRef.current = String(finalSettings?.lastModified || serverSettings?.lastModified || Date.now());

          setGeneralSettings(finalSettings);
          setTeachers(cleanTeachers); 
          setArchives(cleanArchives);
          setFeedbacks(serverFeedbacks);
          const sortedServerLogs = sortLoginLogs(serverLogs);
          setLoginHistory(sortedServerLogs);
          
          safeStorageSet('payedu_settings', finalSettings);
          safeStorageSet('payedu_teachers', cleanTeachers);
          safeStorageSet('payedu_archives', cleanArchives);
          safeStorageSet('payedu_feedbacks', serverFeedbacks);
          safeStorageSet('payedu_loginHistory', sortedServerLogs);
          
          setHasConflict(false); 
        }
      }

      // 🌟 Fetch Presensi Guru dari baris terpisah di Cloud (kebal dari conflict settings)
      try {
        const presensiRes = await fetchPresensiGuru();
        if (presensiRes.status === 'success' && Array.isArray(presensiRes.data)) {
          setPresensiGuru(presensiRes.data);
          lastSavedPresensiRef.current = JSON.stringify(presensiRes.data);
          safeStorageSet('payedu_presensi_guru', presensiRes.data);
        }
      } catch (pErr) {
        console.warn("[Info Presensi] Gagal sinkronisasi presensi cloud:", pErr);
      }
    } catch (err) {
      console.warn("[Info Cloud] Gagal menjangkau Supabase/Cloud. Menggunakan data sisa di LocalStorage.", err);
      setHasConflict(false); 
    } finally {
      if (!isBackgroundSync) setIsLoadingDb(false);
      setIsDataLoaded(true);
    }
  };

  useEffect(() => {
    fetchCloudData();
  }, []);

  // 📡 Real-time Subscription: Menerima perubahan presensi langsung dari Supabase tanpa delay
  useEffect(() => {
    const unsubscribe = subscribePresensiGuru((updatedPresensi) => {
      if (Array.isArray(updatedPresensi)) {
        setPresensiGuru(updatedPresensi);
        lastSavedPresensiRef.current = JSON.stringify(updatedPresensi);
        safeStorageSet('payedu_presensi_guru', updatedPresensi);
      }
    }, (singleRecord) => {
      if (!singleRecord || !singleRecord.id) return;
      if (singleRecord._deleted) {
        setPresensiGuru(prev => {
          const currentList = Array.isArray(prev) ? prev : [];
          const nextList = currentList.filter(r => r.id !== singleRecord.id);
          safeStorageSet('payedu_presensi_guru', nextList);
          return nextList;
        });
        return;
      }
      setPresensiGuru(prev => {
        const currentList = Array.isArray(prev) ? prev : [];
        const norm = (v) => String(v || '').trim().toLowerCase();
        const idx = currentList.findIndex(r => {
          if (!r) return false;
          if (r.id && singleRecord.id && r.id === singleRecord.id) return true;
          if (norm(r.date) === norm(singleRecord.date)) {
            const idA = norm(r.teacherId);
            const idB = norm(singleRecord.teacherId);
            const sesiA = norm(r.sesiId || 'pagi');
            const sesiB = norm(singleRecord.sesiId || 'pagi');
            if (idA && idB && idA === idB && sesiA === sesiB) return true;
          }
          return false;
        });
        let nextList;
        if (idx >= 0) {
          nextList = [...currentList];
          nextList[idx] = { ...nextList[idx], ...singleRecord };
        } else {
          nextList = [...currentList, singleRecord];
        }
        safeStorageSet('payedu_presensi_guru', nextList);
        return nextList;
      });
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // 📡 Real-time Subscription: Menerima perubahan data spesifik via Supabase Realtime (Ultra Hemat Bandwidth)
  useEffect(() => {
    let settingsTimer = null;
    let teachersTimer = null;
    let archivesTimer = null;

    const unsubscribeAll = subscribeAllChanges(
      // 1. Settings berubah -> fetch HANYA settings (~1-2 KB)
      () => {
        if (settingsTimer) return;
        settingsTimer = setTimeout(() => {
          settingsTimer = null;
          if (!isPushingDataRef.current) {
            fetchSettingsOnly().then(newSettings => {
              if (newSettings) {
                setGeneralSettings(newSettings);
                safeStorageSet('payedu_settings', newSettings);
              }
            });
          }
        }, 1500);
      },
      // 2. Teachers berubah -> fetch HANYA teachers (~20-50 KB)
      () => {
        if (teachersTimer) return;
        teachersTimer = setTimeout(() => {
          teachersTimer = null;
          if (!isPushingDataRef.current) {
            fetchTeachersOnly().then(newTeachers => {
              if (newTeachers) {
                const clean = sanitizeTeacherList(newTeachers);
                setTeachers(clean);
                safeStorageSet('payedu_teachers', clean);
              }
            });
          }
        }, 1500);
      },
      // 3. Archives berubah -> fetch HANYA archives
      () => {
        if (archivesTimer) return;
        archivesTimer = setTimeout(() => {
          archivesTimer = null;
          if (!isPushingDataRef.current) {
            fetchArchivesOnly().then(newArchives => {
              if (newArchives) {
                const clean = deduplicateArchives(newArchives);
                setArchives(clean);
                safeStorageSet('payedu_archives', clean);
              }
            });
          }
        }, 1500);
      }
    );
    return () => {
      if (settingsTimer) clearTimeout(settingsTimer);
      if (teachersTimer) clearTimeout(teachersTimer);
      if (archivesTimer) clearTimeout(archivesTimer);
      unsubscribeAll();
    };
  }, []);

  // 🔄 AUTO-SYNC PRESENSI TERTUNDA UNTUK GURU:
  // Mengirimkan otomatis absen masuk yang tersimpan lokal (misal tadi pagi saat server terputus)
  // tanpa menunggu guru menekan tombol absen pulang di sore hari!
  useEffect(() => {
    if (!user || user.role !== 'guru' || !isDataLoaded) return;
    syncPendingTeacherAttendance(user.id, presensiGuru);
    // 🛡️ Flush antrian presensi yang gagal saat offline (jika ada)
    flushPendingPresensi().catch(e => console.warn('[Flush Queue Login] Warning:', e));
  }, [user, isDataLoaded]);

  // 🔋 Radar Latar Belakang (Smart Polling Hemat Bandwidth)
  // - Interval 5 menit (hanya sebagai cadangan jika WebSocket Realtime terputus)
  // - Otomatis PAUSE jika tab berada di background / layar HP mati (hemat ribuan log ingestion)
  // - Hanya fetch settings jika timestamp general settings berubah (~1 KB, bukan megabytes)
  useEffect(() => {
    if (!isDataLoaded || hasConflict) return; 

    const checkUpdate = async () => {
      // 🛡️ Hemat Bandwidth: Lewati jika tab sedang diminimize / layar HP mati
      if (typeof document !== 'undefined' && document.hidden) return;
      if (isPushingDataRef.current) return;

      try {
        const cloudTs = await checkCloudTimestamp();
        if (cloudTs && cloudTs !== lastKnownCloudTimestampRef.current) {
          lastKnownCloudTimestampRef.current = cloudTs;
          fetchSettingsOnly().then(newSettings => {
            if (newSettings) {
              setGeneralSettings(newSettings);
              safeStorageSet('payedu_settings', newSettings);
            }
          });
        }
      } catch (e) { /* skip jika gagal cek timestamp */ }
    };

    // 1. Polling santai setiap 5 menit (300.000 ms) saat tab aktif
    const pollInterval = setInterval(checkUpdate, 300000);

    // 2. Cek seketika saat user membuka kembali tab PayEdu dari background
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        checkUpdate();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isDataLoaded, hasConflict]);

  // 🪄 FUNGSI MUTLAK: Mengubah Status Mode Maintenance & Push Langsung ke Cloud Supabase
  const handleToggleMaintenanceMode = async (newVal) => {
    const newTimestamp = Date.now();
    const updatedSettings = { ...generalSettings, maintenanceMode: newVal, lastModified: newTimestamp };
    
    lastSavedSettingsRef.current = JSON.stringify({ ...updatedSettings, lastModified: 0 });
    isPushingDataRef.current = true;

    setGeneralSettings(updatedSettings);
    safeStorageSet('payedu_settings', updatedSettings);

    try {
       await pushToSupabase('SAVE_SETTINGS', updatedSettings);
       setSyncStatus('synced');
       if (newVal) {
          alert("🛠️ MODE MAINTENANCE AKTIF BERHASIL DISIMPAN KE CLOUD!\n\nSeluruh perangkat HP & Komputer Guru di manapun berada kini langsung terintegrasi dan diblokir oleh Layar Perbaikan.");
       } else {
          alert("✅ MODE MAINTENANCE DIMATIKAN!\n\nStatus telah tersimpan ke Cloud. Portal Guru kini dibuka kembali di seluruh perangkat.");
       }
    } catch (err) {
       console.error("Gagal update maintenance mode di cloud:", err);
       setSyncStatus('error');
    } finally {
       setTimeout(() => { isPushingDataRef.current = false; }, 2000);
    }
  };

  // 🪄 PERBAIKAN PERMANEN 1: Auto-Save Pengaturan (Hanya untuk Admin/Kepsek)
  // PERBAIKAN KRITIKAL: Jangan panggil setGeneralSettings di dalam body effect!
  // Memanggil setGeneralSettings memicu re-render → cleanup (clearTimeout) → push ke Supabase DIBATALKAN!
  // Akibatnya data hanya tersimpan di localStorage tapi TIDAK PERNAH sampai ke Supabase Cloud.
  // Saat refresh, app mengambil data lama dari Supabase → perubahan Admin hilang.
  useEffect(() => {
    if (!isDataLoaded || hasConflict || !user || user.role === 'guru') return;

    const currentDataStr = JSON.stringify({ ...generalSettings, lastModified: 0 });
    if (lastSavedSettingsRef.current === currentDataStr) return;
    lastSavedSettingsRef.current = currentDataStr;

    // Set isPushing SEGERA agar polling background tidak menimpa perubahan Admin
    isPushingDataRef.current = true;

    safeStorageSet('payedu_settings', generalSettings);
    setSyncStatus('syncing');

    // Siapkan payload dengan timestamp terbaru TANPA mengubah state React
    const payloadWithTime = { ...generalSettings, lastModified: Date.now() };

    const timeoutId = setTimeout(() => {
      pushToSupabase('SAVE_SETTINGS', payloadWithTime)
      .then(() => {
         setSyncStatus('synced');
         // Update lastModified di state SETELAH push berhasil
         // Pre-update ref agar effect tidak re-trigger secara sia-sia
         lastSavedSettingsRef.current = JSON.stringify({ ...payloadWithTime, lastModified: 0 });
         setGeneralSettings(prev => ({ ...prev, lastModified: payloadWithTime.lastModified }));
      })
      .catch(err => {
         console.warn("Info Sync:", err.message);
         setSyncStatus('error');
      })
      .finally(() => {
         setTimeout(() => { isPushingDataRef.current = false; }, 3000);
      });
    }, 1500);
    return () => clearTimeout(timeoutId);
  }, [generalSettings, isDataLoaded, hasConflict, user]);

  // 🪄 PERBAIKAN PERMANEN 2: Auto-Save Pegawai (Hanya untuk Admin/Kepsek)
  // PERBAIKAN KRITIKAL: Jangan panggil setGeneralSettings sebelum push!
  // Update lastModified dilakukan SETELAH push ke Supabase berhasil.
  useEffect(() => {
    // GEMBOK KEAMANAN: Cegah Tamu (Belum Login) dan Guru merusak data server!
    if (!isDataLoaded || hasConflict || !user || user.role === 'guru') return;

    const currentTeachersStr = JSON.stringify(teachers);
    if (lastSavedTeachersRef.current === currentTeachersStr) return;
    lastSavedTeachersRef.current = currentTeachersStr;

    // Set isPushing SEGERA agar polling tidak menimpa
    isPushingDataRef.current = true;

    safeStorageSet('payedu_teachers', teachers);
    setSyncStatus('syncing');

    const timeoutId = setTimeout(() => {
      pushToSupabase('SAVE_TEACHERS', teachers)
      .then(() => {
         setSyncStatus('synced');
         // Update lastModified SETELAH push berhasil
         const newTimestamp = Date.now();
         setGeneralSettings(prev => {
           const updated = { ...prev, lastModified: newTimestamp };
           // Pre-update ref agar settings auto-save tidak re-trigger
           lastSavedSettingsRef.current = JSON.stringify({ ...updated, lastModified: 0 });
           safeStorageSet('payedu_settings', updated);
           return updated;
         });
      })
      .catch(err => {
         console.warn("Info Sync:", err.message);
         setSyncStatus('error');
      })
      .finally(() => {
         setTimeout(() => { isPushingDataRef.current = false; }, 3000);
      });
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [teachers, isDataLoaded, hasConflict, user]);

  // 🪄 PERBAIKAN PERMANEN 3: Auto-Save Arsip dan Feedback (🔋 dengan Debounce untuk hemat bandwidth)
  useEffect(() => {
    // Hanya Admin yang boleh memanipulasi Arsip secara global
    if (!isDataLoaded || hasConflict || !user || user.role === 'guru') return;
    const currentStr = JSON.stringify(archives);
    if (lastSavedArchivesRef.current === currentStr) return;
    lastSavedArchivesRef.current = currentStr;

    safeStorageSet('payedu_archives', archives);
    const timeoutId = setTimeout(() => {
      pushToSupabase('SAVE_ARCHIVES', archives).catch(e => console.warn(e));
    }, 3000); // 🔋 Debounce 3 detik agar tidak push terlalu sering
    return () => clearTimeout(timeoutId);
  }, [archives, isDataLoaded, hasConflict, user]);

  useEffect(() => {
    // Hanya Admin yang memanipulasi status Feedback secara global (Guru kirim via fungsi khusus, bukan auto-save)
    if (!isDataLoaded || hasConflict || !user || user.role === 'guru') return;
    const currentStr = JSON.stringify(feedbacks);
    if (lastSavedFeedbacksRef.current === currentStr) return;
    lastSavedFeedbacksRef.current = currentStr;

    safeStorageSet('payedu_feedbacks', feedbacks);
    const timeoutId = setTimeout(() => {
      pushToSupabase('SAVE_FEEDBACKS', feedbacks).catch(e => console.warn(e));
    }, 3000); // 🔋 Debounce 3 detik
    return () => clearTimeout(timeoutId);
  }, [feedbacks, isDataLoaded, hasConflict, user]);

  // Auto-Save Riwayat Login (🔋 dengan Debounce)
  useEffect(() => {
    if (!isDataLoaded || hasConflict) return;
    const currentStr = JSON.stringify(loginHistory);
    if (lastSavedLogsRef.current === currentStr) return;

    lastSavedLogsRef.current = currentStr;
    safeStorageSet('payedu_loginHistory', loginHistory);
    const timeoutId = setTimeout(() => {
      pushToSupabase('SAVE_LOGS', loginHistory).catch(e => console.warn(e));
    }, 5000); // 🔋 Debounce 5 detik (login logs jarang berubah)
    return () => clearTimeout(timeoutId);
  }, [loginHistory, isDataLoaded, hasConflict]);

  // Auto-Save Presensi Guru (🛡️ PERBAIKAN: Kini berlaku untuk SEMUA role, termasuk Guru)
  // HP Guru menggunakan debounce lebih panjang (5 detik) agar tidak mengganggu push langsung saat absen.
  // Ini adalah safety net: jika push langsung saat upsertRecord() gagal, auto-save ini akan mengirim ulang.
  useEffect(() => {
    if (!isDataLoaded || !user) return;
    if (user.role === 'guru') return; // HP Guru bebas dari beban bulk upload!
    const currentStr = JSON.stringify(presensiGuru);
    if (lastSavedPresensiRef.current === currentStr) return;

    lastSavedPresensiRef.current = currentStr;
    safeStorageSet('payedu_presensi_guru', presensiGuru);
    // Guru menggunakan debounce lebih panjang (5 detik) agar push langsung di upsertRecord() selesai duluan
    // Admin menggunakan debounce 3 detik (lebih cepat karena mengedit manual lewat portal)
    const debounceMs = (user.role === 'guru') ? 5000 : 3000;
    const timeoutId = setTimeout(() => {
      pushPresensiGuru(presensiGuru).catch(e => console.warn('[Auto-Save Presensi] Warning:', e));
    }, debounceMs);
    return () => clearTimeout(timeoutId);
  }, [presensiGuru, isDataLoaded, user]);

  // 🛡️ PROTEKSI PERMANEN: Flush data sebelum reload / tutup browser
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (generalSettings) safeStorageSet('payedu_settings', generalSettings);
      if (teachers && teachers.length > 0) safeStorageSet('payedu_teachers', teachers);
      if (archives && archives.length > 0) safeStorageSet('payedu_archives', archives);
      if (presensiGuru && presensiGuru.length > 0) safeStorageSet('payedu_presensi_guru', presensiGuru);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [generalSettings, teachers, archives, presensiGuru]);

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

    const now = new Date();
    const newLog = {
      id: generateUniqueId('log-'),
      name, role, status,
      timestamp: now.toISOString(),
      timeRaw: now.getTime(),
      // DIPERBARUI: Memastikan zona waktu dikunci pada Waktu Indonesia Barat (WIB)
      time: now.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta' }) + ' WIB',
      device: `${browser} / ${os}`
    };
    // Simpan history maksimum 50 data terbaru agar browser tidak berat dan terurut kronologis
    setLoginHistory(prev => sortLoginLogs([newLog, ...(prev || [])]).slice(0, 50));
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
        <LoginView 
          onLogin={(u) => { setUser(u); safeStorageSet('payedu_session', u); }} 
          isDarkMode={isDarkMode} 
          toggleTheme={() => setIsDarkMode(!isDarkMode)} 
          settings={generalSettings} 
          recordLogin={recordLogin} 
          teachers={teachers} 
          setTeachers={setTeachers} 
        />
      ) : (
        <MainLayout 
          user={user} 
          onLogout={() => { setUser(null); localStorage.removeItem('payedu_session'); }} 
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
          presensiGuru={presensiGuru}
          setPresensiGuru={setPresensiGuru}
          auditLogs={auditLogs}
          setAuditLogs={setAuditLogs}
          saveAuditLog={saveAuditLog}
          isOnline={isOnline}
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

  // 🔐 FITUR WEBAUTHN: Login Cepat Sidik Jari / Biometrik
  const [isBioAvailable, setIsBioAvailable] = useState(false);
  const [savedBioAccount, setSavedBioAccount] = useState(null);
  const [isBioLoading, setIsBioLoading] = useState(false);

  useEffect(() => {
    isBiometricSupported().then(supported => {
      setIsBioAvailable(supported);
      if (supported) {
        const saved = getSavedBiometricAccount();
        setSavedBioAccount(saved);
      }
    });
  }, []);

  const handleBiometricLogin = async () => {
    setIsBioLoading(true);
    setError('');
    try {
      const result = await authenticateWithBiometrics(teachers);
      if (result && result.success && result.user) {
        if (settings?.maintenanceMode && result.user.role === 'guru') {
          recordLogin(result.user.name, 'Guru', 'Gagal (Sistem Maintenance)');
          setError('Mohon maaf, Portal Pegawai saat ini sedang dalam Mode Perbaikan. Silakan coba kembali beberapa saat lagi.');
          setIsBioLoading(false);
          return;
        }

        recordLogin(result.user.name, result.user.role === 'admin' ? 'Admin' : 'Guru', 'Sukses (Biometrik WebAuthn)');
        onLogin({
          role: result.user.role === 'admin' ? 'admin' : 'guru',
          id: result.user.id,
          name: result.user.name,
          username: result.user.username,
          nipy: result.user.nipy
        });
      }
    } catch (err) {
      console.warn("Biometric login gagal:", err);
      setError(err.message || 'Verifikasi sidik jari dibatalkan atau tidak cocok.');
    } finally {
      setIsBioLoading(false);
    }
  };

  const handleRemoveBiometric = () => {
    if (confirm('Hapus kredensial sidik jari dari HP ini? Anda harus login manual untuk menghubungkannya kembali.')) {
      removeBiometricAccount();
      setSavedBioAccount(null);
    }
  };

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
      // 1. Cek dari LocalStorage (termasuk payedu_admin_accounts jika dibuat via Pengaturan)
      const rawAccounts = safeStorageGet('payedu_accounts', []);
      const rawAdminAccounts = safeStorageGet('payedu_admin_accounts', []);
      const savedAccounts = [
        ...(Array.isArray(rawAccounts) ? rawAccounts : []),
        ...(Array.isArray(rawAdminAccounts) ? rawAdminAccounts : [])
      ];
      
      // Hash inputan user sebelum membandingkan dengan database
      const hashedInputPassword = simpleHash(password);
      
      // Cari akun berdasarkan username terlebih dahulu
      const accInStorage = savedAccounts.find(a => a.username === username);
      
      let authUser = null;

      if (accInStorage) {
         // Jika akun ada di storage, password HARUS cocok dengan hash yang tersimpan (Mencegah Bypass)
         if (accInStorage.password === hashedInputPassword) {
            recordLogin(accInStorage.name, accInStorage.role, 'Sukses');
            authUser = { role: accInStorage.role === 'Admin' ? 'admin' : accInStorage.role, name: accInStorage.name, id: accInStorage.id || username, username: username.trim() };
         }
      } 
      // 2. Jika akun Guru (Bisa login via ID Pegawai, NIPY, Linked Username, atau Nama)
      const inputLower = username.trim().toLowerCase();
      const teacherData = teachers.find(t => 
        String(t.id).toLowerCase() === inputLower ||
        (t.nipy && String(t.nipy).trim().toLowerCase() === inputLower) ||
        (t.linkedUsername && String(t.linkedUsername).trim().toLowerCase() === inputLower) ||
        (t.name && t.name.trim().toLowerCase() === inputLower)
      );

      if (teacherData && !authUser) {
         // 🛡️ KEAMANAN: Tolak login jika guru berstatus Non-Aktif / Resign
         if (!isTeacherActive(teacherData)) {
            recordLogin(teacherData.name, 'Guru', 'Gagal (Status Non-Aktif/Resign)');
            setError('Akses ditolak: Akun pegawai ini telah dinonaktifkan (Status: Resign/Non-Aktif). Hubungi Tata Usaha.');
            setIsLoading(false);
            return;
         }

         // Cek password custom ATAU plain password ATAU default password (2 huruf inisial kapital + 123)
         const cleanName = teacherData.name ? teacherData.name.replace(/[^a-zA-Z]/g, '') : 'GU';
         const defaultPass = `${cleanName.length >= 2 ? cleanName.substring(0, 2).toUpperCase() : 'GU'}123`;
         
         const isPasswordCorrect = 
             (teacherData.customPassword && teacherData.customPassword === hashedInputPassword) || 
             (teacherData.plainPassword && String(teacherData.plainPassword).trim() === password.trim()) ||
             (password.trim() === defaultPass) ||
             (teacherData.customPassword && teacherData.customPassword === password.trim());

         if (isPasswordCorrect) {
            recordLogin(teacherData.name, 'Guru', 'Sukses');
            authUser = { role: 'guru', id: teacherData.id, name: teacherData.name, username: username.trim(), nipy: teacherData.nipy };
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
        // 🪄 TAMBALAN CERDAS: Cek Mode Maintenance sebelum mengizinkan masuk
        if (settings?.maintenanceMode && authUser.role === 'guru') {
           recordLogin(authUser.name, 'Guru', 'Gagal (Sistem Maintenance)');
           setError('Mohon maaf, Portal Pegawai saat ini sedang dalam Mode Perbaikan / Rekapitulasi oleh Administrator. Silakan coba kembali beberapa saat lagi.');
           setIsLoading(false);
           return; // Hentikan proses login untuk guru
        }

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

  const handleRegister = async (e) => {
    e.preventDefault();
    setIsRegistering(true);
    
    const formElement = e.target;
    const newData = {
      name: (formElement.name.value || '').trim(),
      nipy: (formElement.nipy.value || '').trim() || '-',
      pob: (formElement.pob.value || '').trim(),
      dob: formElement.dob.value,
      gender: formElement.gender.value,
      phone: (formElement.phone.value || '').trim(),
      education: formElement.education.value,
      status: formElement.status.value,
      tmt: formElement.tmt.value,
      position: (formElement.position.value || '').trim(),
      bankName: '',
      bankAccount: '',
      family: { wife: 0, children: 0 }
    };

    const newId = generateTeacherId(teachers);
    const cleanName = newData.name ? newData.name.replace(/[^a-zA-Z]/g, '') : 'GU';
    const twoLetters = cleanName.length >= 2 ? cleanName.substring(0, 2).toUpperCase() : 'GU';
    const defaultPass = `${twoLetters}123`;

    const newTeacherObj = { 
       ...newData, 
       id: newId, 
       plainPassword: defaultPass,
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
    };

    const updatedTeachers = [...teachers, newTeacherObj];

    // 1. Simpan ke state & local storage
    setTeachers(updatedTeachers);
    safeStorageSet('payedu_teachers', updatedTeachers);

    // 2. Tembak langsung ke Supabase Cloud (Real-time)
    try {
       await pushToSupabase('SAVE_TEACHERS', updatedTeachers);
    } catch(err) {
       console.warn("Gagal simpan registrasi ke cloud:", err);
    }

    setIsRegistering(false);
    setShowRegisterModal(false);

    // 3. Auto-fill Form Login dengan Username & Password baru
    setUsername(newId);
    setPassword(defaultPass);

    alert(`✨ PENDAFTARAN PEGAWAI BARU BERHASIL! ✨\n\n- ID / Username Login: ${newId}\n- Password Default: ${defaultPass}\n\nData telah didaftarkan ke Cloud secara otomatis. Form login telah diisikan dengan akun baru Anda, silakan klik tombol "MASUK".`);
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
          {/* 🔐 WIDGET LOGIN CEPAT BIOMETRIK / SIDIK JARI */}
          {isBioAvailable && savedBioAccount && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-950/40 dark:via-teal-950/40 dark:to-cyan-950/40 border border-teal-200 dark:border-teal-800 text-center animate-in fade-in zoom-in-95 duration-300 shadow-sm">
              <div className="flex items-center justify-center gap-2 mb-2">
                <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center shadow-inner">
                  <Fingerprint size={24} className="animate-pulse" />
                </div>
              </div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Sidik Jari HP Terhubung
              </p>
              <p className="text-sm font-extrabold text-teal-700 dark:text-teal-300 truncate max-w-xs mx-auto mb-3">
                {savedBioAccount.name}
              </p>
              <button
                type="button"
                onClick={handleBiometricLogin}
                disabled={isBioLoading}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 shadow-md shadow-teal-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
              >
                <Fingerprint size={18} />
                {isBioLoading ? 'Memindai Sensor HP...' : 'Masuk dengan Sidik Jari / Wajah'}
              </button>
              <div className="flex items-center justify-between mt-2.5 px-1">
                <span className="text-[10px] text-slate-400">Atau ketik manual di bawah</span>
                <button 
                  type="button"
                  onClick={handleRemoveBiometric}
                  className="text-[10px] text-red-500 hover:underline cursor-pointer"
                >
                  Lepas Sidik Jari
                </button>
              </div>
            </div>
          )}
          {isBioAvailable && !savedBioAccount && (
            <div className="p-3 rounded-xl bg-teal-50/80 dark:bg-teal-950/30 border border-teal-200/60 dark:border-teal-800/50 text-[11px] text-teal-700 dark:text-teal-300 flex items-center gap-2 shadow-xs">
              <Fingerprint size={18} className="shrink-0 text-teal-600 dark:text-teal-400" />
              <span>Sensor biometrik HP aktif. Anda dapat menghubungkan sidik jari di menu profil setelah login.</span>
            </div>
          )}
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

          {/* Teks Design by & Version */}
          <div className="pt-6 text-center border-t-2 border-slate-200 dark:border-slate-600 mt-6">
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium tracking-wide">
               Desain Aplikasi | Muhamad Husni Akbar
            </p>
            <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 mt-1 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-0.5 rounded inline-block border border-blue-200 dark:border-blue-800">
               {settings?.appVersion || 'v1.2.5'}
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

// 🪄 FITUR BARU: Komponen Layar Mode Maintenance / Perbaikan
function MaintenanceScreen({ onLogout, appName, schoolName, appVersion }) {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="max-w-md w-full bg-slate-800/90 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl text-center relative z-10 animate-in zoom-in-95 duration-300">
        <div className="w-20 h-20 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto mb-6 shadow-inner animate-pulse">
           <Wrench size={40} />
        </div>

        <span className="px-3 py-1 bg-amber-500/20 text-amber-400 text-[11px] font-extrabold uppercase tracking-widest rounded-full border border-amber-500/30 inline-block mb-3">
           Mode Pemeliharaan Sistem
        </span>

        <h1 className="text-xl sm:text-2xl font-black tracking-tight mb-2 text-white">
           Aplikasi Dalam Perbaikan
        </h1>
        <p className="text-xs text-slate-400 font-medium mb-6 leading-relaxed">
           Sistem Penggajian & Portal Pegawai <strong className="text-slate-200">{schoolName || 'SD-IT QA'}</strong> saat ini sedang dalam pemeliharaan rutin oleh Administrator.
        </p>

        <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-700/50 mb-6 text-left space-y-2">
           <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
              <CheckCircle size={14} className="text-amber-400 shrink-0"/>
              <span>Data gaji Anda aman & tersimpan dengan rapi.</span>
           </div>
           <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
              <Clock size={14} className="text-amber-400 shrink-0"/>
              <span>Akses portal akan dibuka kembali setelah perbaikan selesai.</span>
           </div>
        </div>

        <div className="flex flex-col gap-2.5">
           <a 
             href="https://api.whatsapp.com/send?text=Halo%20Admin,%20saya%20ingin%20menanyakan%20status%20pemeliharaan%20aplikasi" 
             target="_blank" 
             rel="noopener noreferrer"
             className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold py-3 rounded-xl transition-all text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
           >
              <Send size={16} /> Hubungi Admin TU via WA
           </a>
           <button 
             onClick={onLogout}
             className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
           >
              <LogOut size={16} /> Keluar Sementara
           </button>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-700/50 text-[10px] text-slate-500">
           <p>Desain Aplikasi | Muhamad Husni Akbar</p>
           <p className="font-bold text-blue-400 mt-0.5">{appVersion || 'v1.2.5'}</p>
        </div>
      </div>
    </div>
  );
}

// --- MAIN LAYOUT & NAVIGATION ---
function MainLayout({ user, onLogout, isDarkMode, toggleTheme, teachers, setTeachers, settings, setSettings, feedbacks, setFeedbacks, loginHistory, setLoginHistory, archives, setArchives, presensiGuru, setPresensiGuru, auditLogs, setAuditLogs, saveAuditLog, isOnline, syncStatus, hasConflict, resolveConflict, onToggleMaintenance }) {
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

// Komponen Wrapper Tabel Responsif dengan Tombol Navigasi Kembali/Ke Atas untuk HP
function TableWrapper({ children, className = "" }) {
  const containerRef = useRef(null);
  const [isScrolledRight, setIsScrolledRight] = useState(false);

  const handleScroll = () => {
    if (containerRef.current) {
      const scrolledRight = containerRef.current.scrollLeft > 35;
      if (scrolledRight !== isScrolledRight) {
        setIsScrolledRight(scrolledRight);
      }
    }
  };

  const scrollToStart = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (containerRef.current) {
      containerRef.current.parentElement?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="relative group/table my-3">
      {/* Tombol Melayang Kembali ke Kiri & Ke Atas jika Tabel Di-scroll ke Kanan di HP */}
      {isScrolledRight && (
        <div className="sticky left-2 top-2 z-30 flex items-center gap-2 mb-2 animate-in fade-in duration-200">
          <button
            type="button"
            onClick={scrollToStart}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs font-bold shadow-lg shadow-blue-500/30 transition-transform active:scale-95 border border-white/20 cursor-pointer"
          >
            <ChevronLeft size={16} /> Kembali ke Kiri
          </button>
          <button
            type="button"
            onClick={scrollToTop}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800/90 hover:bg-slate-900 text-white rounded-full text-xs font-bold shadow-lg backdrop-blur-md transition-transform active:scale-95 border border-white/10 cursor-pointer"
          >
            <ChevronUp size={16} /> Ke Atas
          </button>
        </div>
      )}
      
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className={`overflow-x-auto scrollbar-thin rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 ${className}`}
      >
        {children}
      </div>
    </div>
  );
}

function DashboardView({ teachers, user, settings, setSettings, archives, setActiveTab, onAbsensiAlertClick }) {
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

function DataGuruView({ teachers, setTeachers, user, saveAuditLog }) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('Semua'); // TAMBAHAN: Filter Dropdown
  const [filterWorkStatus, setFilterWorkStatus] = useState('Aktif'); // 🪄 FITUR BARU: Filter Keaktifan (Aktif/Tidak Aktif/Resign)
  const [modal, setModal] = useState({ isOpen: false, type: null, data: null });
  const fileInputRef = useRef(null);
  
  // FITUR BARU: State untuk Micro-Interaction Tombol Simpan
  const [isSaving, setIsSaving] = useState(false);

  const sortedTeachers = useMemo(() => sortTeachersById(teachers), [teachers]);

  const filtered = sortedTeachers.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) || t.nipy.includes(search);
    const matchStatus = filterStatus === 'Semua' ? true : t.status === filterStatus;
    
    // 🪄 FITUR BARU: Logika Pencarian & Filter Keaktifan Pegawai
    const isAct = isTeacherActive(t);
    let matchWorkStatus = true;
    if (filterWorkStatus === 'Aktif') {
      matchWorkStatus = isAct;
    } else if (filterWorkStatus === 'Non-Aktif' || filterWorkStatus === 'Resign' || filterWorkStatus === 'Tidak Aktif') {
      matchWorkStatus = !isAct;
    }
    
    return matchSearch && matchStatus && matchWorkStatus;
  });

  const openModal = (type, data) => setModal({ isOpen: true, type, data });
  const closeModal = () => setModal({ isOpen: false, type: null, data: null });

  const handleDelete = async () => {
    if (!modal.data) return;
    const targetId = modal.data.id;
    const targetName = modal.data.name;
    const updated = teachers.filter(t => t.id !== targetId);
    setTeachers(updated);
    safeStorageSet('payedu_teachers', updated);
    closeModal();

    saveAuditLog?.(
      user?.name || 'Administrator',
      'Hapus Data Pegawai',
      targetName,
      `Menghapus data pegawai ${targetName} (ID: ${targetId}, NIPY: ${modal.data.nipy || '-'})`,
      'pegawai'
    );

    try {
      await pushToSupabase('SAVE_TEACHERS', updated);
      if (isSupabaseConfigured() && supabase) {
        await supabase.from('teachers').delete().eq('id', String(targetId));
      }
    } catch (err) {
      console.warn('Gagal menghapus data guru di Cloud:', err);
    }
  };

  // 🪄 FITUR BARU: Pembersihan Data Guru Ganda Seketika (1-Klik Anti-Duplikasi)
  const handleCleanDuplicates = async () => {
    const cleanList = deduplicateTeachers(teachers);
    const countRemoved = teachers.length - cleanList.length;
    if (countRemoved <= 0) {
      alert("✅ Data Pegawai Bersih!\n\nTidak ditemukan data guru yang ganda pada sistem.");
      return;
    }
    if (window.confirm(`Ditemukan ${countRemoved} data pegawai ganda di sistem.\n\nApakah Anda ingin menggabungkan dan membersihkan duplikasi tersebut secara permanen ke Cloud?`)) {
      setTeachers(cleanList);
      safeStorageSet('payedu_teachers', cleanList);
      saveAuditLog?.(
        user?.name || 'Administrator',
        'Bersihkan Duplikat Pegawai',
        'Data Master Guru',
        `Membersihkan dan menggabungkan ${countRemoved} data ganda pegawai`,
        'pegawai'
      );
      try {
        await pushToSupabase('SAVE_TEACHERS', cleanList);
        alert(`✨ Alhamdulillah! Berhasil membersihkan ${countRemoved} data ganda dan tersimpan permanen ke Cloud Supabase.`);
      } catch (err) {
        console.warn("Gagal sinkronisasi pembersihan duplikat:", err);
      }
    }
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
      workStatus: formElement.workStatus ? formElement.workStatus.value : 'Aktif', // 🪄 FITUR BARU: Status Keaktifan
      tmt: formElement.tmt.value,
      position: formElement.position.value,
      bankName: formElement.bankName ? formElement.bankName.value : '',
      bankAccount: formElement.bankAccount ? formElement.bankAccount.value : '',
      family: {
        wife: formElement.wife ? Number(formElement.wife.value) : 0,
        children: formElement.children ? Number(formElement.children.value) : 0
      }
    };

    let updatedTeachers = [];
    if (modal.type === 'add') {
      const newId = generateTeacherId(teachers);
      const newTeacher = { 
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
      };
      updatedTeachers = [...teachers, newTeacher];
      saveAuditLog?.(
        user?.name || 'Administrator',
        'Tambah Pegawai Baru',
        newData.name,
        `Menambahkan pegawai baru ${newData.name} (NIPY: ${newData.nipy || '-'}, Jabatan: ${newData.position || 'Guru'})`,
        'pegawai'
      );
    } else {
      updatedTeachers = teachers.map(t => {
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
      });
      saveAuditLog?.(
        user?.name || 'Administrator',
        'Perbarui Data Pegawai',
        newData.name,
        `Memperbarui profil kepegawaian ${newData.name} (Jabatan: ${newData.position || '-'}, Status: ${newData.status})`,
        'pegawai'
      );
    }

    setTeachers(updatedTeachers);
    safeStorageSet('payedu_teachers', updatedTeachers);
    pushToSupabase('SAVE_TEACHERS', updatedTeachers).catch(err => {
      console.warn("Gagal simpan langsung guru ke cloud:", err);
    });

    setIsSaving(false);
    closeModal();
  };


  const handleExportCSV = () => {
    // TAMBAHAN: Memasukkan No WA dan Keaktifan ke dalam export CSV
    const headers = ['ID', 'Nama Lengkap', 'NIPY', 'L/P', 'Tempat Lahir', 'Tanggal Lahir', 'No WA', 'Pendidikan', 'Status Golongan', 'Keaktifan', 'Jabatan', 'TMT', 'Status Pasangan', 'Jumlah Anak'];
    
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
        (t.workStatus || 'Aktif'), // 🪄 FITUR BARU: Export Keaktifan
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
           const isNewFormat = values.length >= 13;
           const impPhone = isNewFormat ? (values[6] || '-') : '-';
           const impEdu = isNewFormat ? (values[7] || 'S1') : (values[6] || 'S1');
           const impStatus = isNewFormat ? (values[8] || 'Tetap') : (values[7] || 'Tetap');
           const impWorkStatus = isNewFormat ? (values[9] || 'Aktif') : 'Aktif';
           const impPosition = isNewFormat ? (values[10] || 'Guru') : (values[8] || 'Guru');
           const impTmt = isNewFormat ? parseDateSmart(values[11]) : parseDateSmart(values[9]);
           const wifeStatus = isNewFormat ? Number(values[12] || 0) : Number(values[10] || 0);
           const childrenCount = isNewFormat ? Number(values[13] || 0) : Number(values[11] || 0);

           const existingId = teachers.find(t => t.id === impId || t.name.toLowerCase() === impName?.toLowerCase());
           
           const teacherObj = existingId ? { ...existingId } : { 
             id: impId && impId !== '' ? impId : generateUniqueId('G-'),
             family: { wife: wifeStatus, children: childrenCount },
             payroll: {
                tahunMasaKerja: new Date().getFullYear(),
                tunjanganMasaKerjaManual: '',
                jabatans: [{ kategori: 'Guru', detail: impPosition, kinerja: 'Baik', nominal: 0 }],
                pendidikan: { tingkat: impEdu, nominalOverride: '' },
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
           teacherObj.phone = impPhone;
           teacherObj.education = impEdu;
           teacherObj.status = impStatus;
           teacherObj.workStatus = impWorkStatus;
           teacherObj.position = impPosition;
           teacherObj.tmt = impTmt;
           teacherObj.family = { wife: wifeStatus, children: childrenCount };
           if (teacherObj.payroll) {
              teacherObj.payroll.pendidikan = { tingkat: impEdu, nominalOverride: teacherObj.payroll?.pendidikan?.nominalOverride || '' };
              if (!teacherObj.payroll.jabatans || teacherObj.payroll.jabatans.length === 0) {
                 teacherObj.payroll.jabatans = [{ kategori: 'Guru', detail: impPosition, kinerja: 'Baik', nominal: 0 }];
              }
           }
           
           importedTeachers.push(sanitizeTeacherData(teacherObj));
           successCount++;
        }
      }

      setTeachers(prev => {
        const map = new Map(prev.map(t => [t.id, t]));
        importedTeachers.forEach(t => map.set(t.id, t));
        return sanitizeTeacherList(Array.from(map.values()));
      });
      
      alert(`Berhasil membaca ${successCount} baris data!\n\nPeriksa kembali apakah tampilannya sudah rapi. Data akan otomatis disinkronkan ke Supabase Cloud.`);
      e.target.value = null;
    };
    reader.readAsText(file);
  };
  
  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full relative">
      <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />

      {modal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          {/* 🪄 TAMBALAN CERDAS: max-h-[90dvh] agar form tidak tertutup keyboard HP dan bisa di-scroll mutlak */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90dvh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
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
                          <tr><td className="py-1.5 text-slate-500">Tanggal Lahir</td><td className="font-medium dark:text-slate-200">: {formatDateId(modal.data.dob)} <span className="text-blue-500 font-bold ml-1">({calculateYearsFromDate(modal.data.dob)} Thn)</span></td></tr>
                          {/* TAMBAHAN: Detail No WA */}
                          <tr><td className="py-1.5 text-slate-500">No. WhatsApp</td><td className="font-medium dark:text-slate-200">: {modal.data.phone || '-'}</td></tr>
                          <tr><td className="py-1.5 text-slate-500">Pendidikan</td><td className="font-medium dark:text-slate-200">: {modal.data.education}</td></tr>
                          {/* 🪄 FITUR BARU: Tampilan Status Keaktifan di Detail Profil */}
                          <tr><td className="py-1.5 text-slate-500">Status Keaktifan</td><td className="font-medium dark:text-slate-200">: <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold shadow-sm ${modal.data.workStatus === 'Resign' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' : modal.data.workStatus === 'Tidak Aktif' ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'}`}>{modal.data.workStatus || 'Aktif'}</span></td></tr>
                          <tr><td className="py-1.5 text-slate-500">Rekening Bank</td><td className="font-medium dark:text-slate-200">: {modal.data.bankName ? `${modal.data.bankName} - ${modal.data.bankAccount}` : '-'}</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-3 border-b border-slate-100 dark:border-slate-700 pb-2">Informasi Pekerjaan & Keluarga</h4>
                      <table className="w-full">
                        <tbody>
                          <tr><td className="py-1.5 text-slate-500 w-32">Mulai Tugas (TMT)</td><td className="font-medium dark:text-slate-200">: {formatDateId(modal.data.tmt)}</td></tr>
                          <tr><td className="py-1.5 text-slate-500">Masa Kerja</td><td className="font-medium dark:text-slate-200">: {calculateYearsFromDate(modal.data.tmt)} Tahun</td></tr>
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
                      <input type="date" name="dob" defaultValue={formatToInputDate(modal.data?.dob)} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" required />
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
                    {/* 🪄 FITUR BARU: Dropdown Status Keaktifan */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Keaktifan Pegawai</label>
                      <select name="workStatus" defaultValue={modal.data?.workStatus || 'Aktif'} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="Aktif">Aktif</option>
                        <option value="Tidak Aktif">Tidak Aktif (Cuti/Nonaktif)</option>
                        <option value="Resign">Resign (Berhenti)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">TMT (Mulai Tugas)</label>
                      <input type="date" name="tmt" defaultValue={formatToInputDate(modal.data?.tmt)} className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" required />
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

      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 text-white shadow-lg relative overflow-hidden flex items-center justify-between shrink-0 mb-3 sm:mb-5">
        <div className="relative z-10">
          <h1 className="text-lg sm:text-2xl font-bold mb-0.5 sm:mb-1 flex items-center gap-2 sm:gap-3"><Users className="text-blue-200" size={22} /> Manajemen Data Pegawai</h1>
          <p className="text-blue-100 text-xs sm:text-sm">Kelola profil, jabatan, dan informasi kontak seluruh guru dan staff sekolah.</p>
        </div>
        <Users size={100} className="absolute -right-6 -top-6 text-white/10 transform -rotate-12 pointer-events-none hidden sm:block" />
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-full">
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3 bg-slate-50 dark:bg-slate-900/50 shrink-0">
          <h3 className="text-sm sm:text-base font-bold dark:text-white flex items-center gap-2 shrink-0">Daftar Lengkap Pegawai</h3>
          
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 w-full xl:w-auto items-stretch sm:items-center">
            
            {/* Filter Dropdown Status Golongan & Keaktifan (2 Kolom Rapi di Mobile) */}
            <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 outline-none dark:text-white text-slate-700 dark:text-slate-300 shadow-sm"
              >
                <option value="Semua">Semua Golongan</option>
                <option value="Tetap">Guru Tetap</option>
                <option value="Tidak Tetap">Guru Tidak Tetap</option>
              </select>

              <select 
                value={filterWorkStatus}
                onChange={(e) => setFilterWorkStatus(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 outline-none dark:text-white text-slate-700 dark:text-slate-300 shadow-sm"
              >
                <option value="Semua">Semua Kondisi</option>
                <option value="Aktif">Aktif Saja</option>
                <option value="Tidak Aktif">Tidak Aktif (Cuti)</option>
                <option value="Resign">Telah Resign</option>
              </select>
            </div>

            <div className="relative w-full sm:w-56 md:w-64 flex-grow sm:flex-grow-0">
              <Search className="absolute left-2.5 top-2 text-slate-400" size={15} />
              <input 
                type="text" 
                placeholder="Cari Nama / NIPY..." 
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
              />
            </div>
            
            <div className="grid grid-cols-4 gap-1.5 w-full sm:flex sm:w-auto">
              <button 
                type="button"
                onClick={handleCleanDuplicates}
                className="justify-center bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-sm cursor-pointer"
                title="Pindai dan bersihkan data ganda / duplikat"
              >
                 <Sparkles size={14} className="text-amber-600 dark:text-amber-400" /> <span className="hidden sm:inline">Bersihkan</span><span className="sm:hidden">Bersih</span>
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="justify-center bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-sm">
                 <Upload size={14} /> <span>Impor</span>
              </button>
              <button onClick={handleExportCSV} className="justify-center bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-sm">
                 <Download size={14} /> <span>Ekspor</span>
              </button>
              <button onClick={() => openModal('add', null)} className="justify-center bg-blue-600 hover:bg-blue-700 text-white px-2 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-sm">
                 <PlusCircle size={14} /> <span>Tambah</span>
              </button>
            </div>
          </div>
        </div>
        
        {/* FITUR BARU: Tampilan Kartu Responsif Khusus Layar HP (< md) */}
        <div className="md:hidden space-y-2.5 p-2.5 sm:p-4">
          {filtered.map(t => (
            <div key={t.id} className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-2.5">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-sm text-slate-800 dark:text-white">{t.name}</h4>
                  <div className="text-[11px] text-slate-500 mt-0.5">{t.nipy} • {t.position}</div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.status === 'Tetap' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'}`}>
                  {t.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700/50">
                <div><span className="text-slate-400">Pendidikan:</span> <span className="font-medium block dark:text-slate-200 truncate">{t.education}</span></div>
                <div><span className="text-slate-400">Keaktifan:</span> <span className="font-medium block text-blue-600 dark:text-blue-400">{t.workStatus || 'Aktif'}</span></div>
                <div><span className="text-slate-400">No WA:</span> <span className="font-medium block dark:text-slate-200 truncate">{t.phone || '-'}</span></div>
                <div><span className="text-slate-400">TMT:</span> <span className="font-medium block dark:text-slate-200">{formatDateId(t.tmt)}</span></div>
              </div>

              <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-700/50">
                <button onClick={() => openModal('view', t)} className="px-2.5 py-1 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg text-xs font-bold flex items-center gap-1">
                  <Eye size={13}/> Detail
                </button>
                <button onClick={() => openModal('edit', t)} className="px-2.5 py-1 bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 rounded-lg text-xs font-bold flex items-center gap-1">
                  <Edit size={13}/> Edit
                </button>
                <button onClick={() => openModal('delete', t)} className="px-2.5 py-1 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-lg text-xs font-bold flex items-center gap-1">
                  <Trash2 size={13}/> Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
        
        <div className="hidden md:block overflow-x-auto flex-1 scrollbar-thin">
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
                    {/* 🪄 FITUR BARU: Lencana Visual untuk Keaktifan Pegawai */}
                    {(t.workStatus === 'Resign' || t.workStatus === 'Tidak Aktif') && (
                      <span className={`inline-block mt-1.5 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shadow-sm ${t.workStatus === 'Resign' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'}`}>
                        {t.workStatus}
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="text-slate-700 dark:text-slate-300 font-medium">
                      {t.pob}, {formatDateId(t.dob)} <span className="text-blue-500 font-bold ml-1">({calculateYearsFromDate(t.dob)} thn)</span>
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
                    <div className="text-xs text-slate-500 mt-0.5">{calculateYearsFromDate(t.tmt)} Tahun</div>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button onClick={() => openModal('view', t)} className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 rounded-lg transition-colors shadow-sm" title="Lihat Detail">
                        <Eye size={16} />
                      </button>
                      <button onClick={() => openModal('edit', t)} className="p-2 bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50 rounded-lg transition-colors shadow-sm" title="Edit Data">
                        <Edit size={16} />
                      </button>
                      <button onClick={() => openModal('delete', t)} className="p-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 rounded-lg transition-colors shadow-sm" title="Hapus Data">
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
  
  // 🪄 TAMBALAN CERDAS: State untuk Fitur Tambah, Detail Riwayat, dan Hapus
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({ teacherId: '', ket: 'Kasbon Sekolah', nominal: '', totalPinjaman: '' });
  
  const [selectedLoanHistory, setSelectedLoanHistory] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, teacherId: null, ket: '' });
  const [isSaving, setIsSaving] = useState(false);

  // 🪄 TAMBAHAN: State untuk Fitur Edit & Ref Import
  const fileInputRef = useRef(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);

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
                const totalPinjaman = item.totalPinjaman !== undefined ? item.totalPinjaman : (item.nominal * 10); // Plafon fallback
                records.push({
                   teacherId: t.id,
                   name: t.name,
                   nipy: t.nipy,
                   status: t.status,
                   ket: item.ket,
                   nominal: item.nominal,
                   sisaHutang: sisaHutang,
                   totalPinjaman: totalPinjaman,
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

  // 🪄 FUNGSI BARU: Tambah Pinjaman Baru
  const handleAddSubmit = (e) => {
     e.preventDefault();
     if (!addForm.teacherId || !addForm.nominal || !addForm.totalPinjaman) return;

     setIsSaving(true);
     setTimeout(() => {
        setTeachers(prev => prev.map(t => {
           if (t.id === addForm.teacherId) {
              const p = t.payroll || {};
              const currentPot = p.potonganLainnya || [];
              
              // Mencegah duplikasi nama pinjaman untuk guru yang sama
              if (currentPot.some(x => x.ket.toLowerCase() === addForm.ket.toLowerCase())) {
                 alert('Peringatan: Pinjaman dengan keterangan ini sudah ada. Harap bedakan namanya (cth: Kasbon Tahap 2).');
                 return t;
              }

              const newLoan = {
                 ket: addForm.ket,
                 nominal: Number(addForm.nominal),
                 sisaHutang: Number(addForm.totalPinjaman),
                 totalPinjaman: Number(addForm.totalPinjaman)
              };

              return { ...t, payroll: { ...p, potonganLainnya: [...currentPot, newLoan] } };
           }
           return t;
        }));

        setIsSaving(false);
        setIsAddModalOpen(false);
        setAddForm({ teacherId: '', ket: 'Kasbon Sekolah', nominal: '', totalPinjaman: '' });
     }, 600);
  };

  // 🪄 FUNGSI BARU: Edit Pinjaman Permanen
  const handleEditSubmit = (e) => {
     e.preventDefault();
     // PERBAIKAN: Mengizinkan angka 0 untuk disimpan dengan memeriksa secara spesifik jika nilai string kosong ('')
     if (editForm.nominal === '' || editForm.totalPinjaman === '' || editForm.sisaHutang === '') return;

     setIsSaving(true);
     setTimeout(() => {
        setTeachers(prev => prev.map(t => {
           if (t.id === editForm.teacherId) {
              const p = t.payroll || {};
              let currentPot = p.potonganLainnya || [];
              
              currentPot = currentPot.map(pot => {
                  if (pot.ket === editForm.originalKet) {
                      return {
                          ...pot,
                          ket: editForm.ket,
                          nominal: Number(editForm.nominal),
                          sisaHutang: Number(editForm.sisaHutang),
                          totalPinjaman: Number(editForm.totalPinjaman)
                      }
                  }
                  return pot;
              });

              return { ...t, payroll: { ...p, potonganLainnya: currentPot } };
           }
           return t;
        }));

        setIsSaving(false);
        setIsEditModalOpen(false);
        setEditForm(null);
     }, 500);
  };

  // 🪄 FUNGSI BARU: Hapus Pinjaman Permanen
  const executeDeleteLoan = () => {
     setIsSaving(true);
     setTimeout(() => {
        setTeachers(prev => prev.map(t => {
           if (t.id === confirmDelete.teacherId) {
              const p = t.payroll || {};
              const newPot = (p.potonganLainnya || []).filter(item => item.ket !== confirmDelete.ket);
              return { ...t, payroll: { ...p, potonganLainnya: newPot } };
           }
           return t;
        }));
        setIsSaving(false);
        setConfirmDelete({ isOpen: false, teacherId: null, ket: '' });
     }, 500);
  };

  const handleExportCSV = () => {
    const headers = ['ID Pegawai', 'Nama Lengkap', 'NIPY', 'Status', 'Keterangan Pinjaman', 'Plafon Awal', 'Potongan / Bulan', 'Sisa Hutang', 'Status Pelunasan'];
    const csvRows = [headers.join(';')];
    
    filteredLoans.forEach(r => {
      const row = [
        r.teacherId, 
        `"${r.name}"`, 
        `"=""${r.nipy}"""`, 
        r.status, 
        `"${r.ket}"`, 
        r.totalPinjaman,
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

  // 🪄 FUNGSI BARU: Import Data Pinjaman dari Excel (CSV)
  const handleImportCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;

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
          if (cln.startsWith('="') && cln.endsWith('"')) cln = cln.substring(2, cln.length - 1);
          if (cln.startsWith("'")) cln = cln.substring(1); 
          return cln;
      });
    };

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split(/\r?\n/);
      if(lines.length < 2) {
         alert("Format file kosong atau tidak valid.");
         return;
      }
      
      let separator = ',';
      if (lines[0].includes(';')) separator = ';';
      else if (lines[0].includes('\t')) separator = '\t';
      
      let updatedTeachers = [...teachers];
      let successCount = 0;

      for(let i = 1; i < lines.length; i++) {
        if(!lines[i].trim()) continue;
        
        const values = parseCSVLine(lines[i], separator);
        
        if (values.length >= 8 && values[0] !== "") {
           const impId = values[0];
           const ket = values[4];
           const plafon = Number(values[5]);
           const potongan = Number(values[6]);
           const sisa = Number(values[7]);
           
           const teacherIndex = updatedTeachers.findIndex(t => t.id === impId);
           if (teacherIndex !== -1 && ket) {
               const teacher = updatedTeachers[teacherIndex];
               const currentPot = [...(teacher.payroll?.potonganLainnya || [])];
               const potIndex = currentPot.findIndex(p => p.ket.toLowerCase() === ket.toLowerCase());
               
               if (potIndex !== -1) {
                   currentPot[potIndex] = {
                       ...currentPot[potIndex],
                       nominal: isNaN(potongan) ? currentPot[potIndex].nominal : potongan,
                       sisaHutang: isNaN(sisa) ? currentPot[potIndex].sisaHutang : sisa,
                       totalPinjaman: isNaN(plafon) ? currentPot[potIndex].totalPinjaman : plafon
                   };
               } else {
                   currentPot.push({
                       ket: ket,
                       nominal: isNaN(potongan) ? 0 : potongan,
                       sisaHutang: isNaN(sisa) ? 0 : sisa,
                       totalPinjaman: isNaN(plafon) ? 0 : plafon
                   });
               }
               
               updatedTeachers[teacherIndex] = {
                   ...teacher,
                   payroll: {
                       ...(teacher.payroll || {}),
                       potonganLainnya: currentPot
                   }
               };
               successCount++;
           }
        }
      }

      if (successCount > 0) {
        setTeachers(updatedTeachers);
        alert(`Sukses! Berhasil membaca dan meng-update ${successCount} data pinjaman dari file Excel!`);
      } else {
        alert('Tidak ada data pinjaman yang valid (Pastikan ID Pegawai dan Format Keterangan sama).');
      }
      e.target.value = null;
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full relative pb-4 min-h-0">
      
      {/* 🪄 MODAL BARU: Tambah Pinjaman */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-lg dark:text-white flex items-center gap-2">
                <PlusCircle className="text-teal-500" /> Input Pinjaman Baru
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-slate-200 dark:bg-slate-700 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
            </div>
            
            <div className="p-6 overflow-y-auto">
               <form id="addLoanForm" onSubmit={handleAddSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Pilih Pegawai Peminjam</label>
                    <select 
                      value={addForm.teacherId} 
                      onChange={e => setAddForm({...addForm, teacherId: e.target.value})}
                      className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-teal-500 outline-none dark:text-white cursor-pointer font-medium"
                      required
                    >
                      <option value="">-- Pilih Pegawai --</option>
                      {teachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.nipy})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Jenis Pinjaman / Keterangan</label>
                    <input 
                      list="loan-types"
                      value={addForm.ket} 
                      onChange={e => setAddForm({...addForm, ket: e.target.value})}
                      className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-teal-500 outline-none dark:text-white"
                      placeholder="Cth: Kasbon Sekolah" required
                    />
                    <datalist id="loan-types">
                       <option value="Kasbon Sekolah" />
                       <option value="Pinjaman Koperasi" />
                       <option value="Potongan Barang" />
                    </datalist>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Total Pinjaman (Plafon)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-400 font-medium">Rp</span>
                        <FormattedRupiahInput 
                          value={addForm.totalPinjaman} 
                          onChange={val => setAddForm({...addForm, totalPinjaman: val})}
                          className="w-full pl-9 pr-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-bold text-amber-600 dark:text-amber-400 focus:ring-2 focus:ring-amber-500 outline-none"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Cicilan Per Bulan</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-400 font-medium">Rp</span>
                        <FormattedRupiahInput 
                          value={addForm.nominal} 
                          onChange={val => setAddForm({...addForm, nominal: val})}
                          className="w-full pl-9 pr-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-bold text-rose-600 dark:text-rose-400 focus:ring-2 focus:ring-rose-500 outline-none"
                          required
                        />
                      </div>
                    </div>
                  </div>
                  {addForm.totalPinjaman && addForm.nominal && (
                     <div className="mt-2 p-3 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg text-xs text-teal-700 dark:text-teal-400 font-medium flex items-center gap-2">
                        <Info size={14}/>
                        Estimasi Pelunasan: <strong>{Math.ceil(Number(addForm.totalPinjaman) / Number(addForm.nominal))} Bulan</strong>
                     </div>
                  )}
               </form>
            </div>
            
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsAddModalOpen(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors text-sm">Batal</button>
              <button type="submit" form="addLoanForm" disabled={isSaving} className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold shadow-sm transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-70">
                {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={16} />}
                {isSaving ? 'Menyimpan...' : 'Simpan Pinjaman'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🪄 MODAL BARU: Edit Pinjaman */}
      {isEditModalOpen && editForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-lg dark:text-white flex items-center gap-2">
                <Edit className="text-amber-500" /> Edit Detail Pinjaman
              </h3>
              <button onClick={() => {setIsEditModalOpen(false); setEditForm(null);}} className="p-2 hover:bg-slate-200 dark:bg-slate-700 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
            </div>
            
            <div className="p-6 overflow-y-auto">
               <form id="editLoanForm" onSubmit={handleEditSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Keterangan Pinjaman</label>
                    <input 
                      type="text"
                      value={editForm.ket} 
                      onChange={e => setEditForm({...editForm, ket: e.target.value})}
                      className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-amber-500 outline-none dark:text-white"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Plafon (Total Pinjaman)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-400 font-medium">Rp</span>
                        <FormattedRupiahInput 
                          value={editForm.totalPinjaman} 
                          onChange={val => setEditForm({...editForm, totalPinjaman: val})}
                          className="w-full pl-9 pr-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-bold focus:ring-2 focus:ring-amber-500 outline-none dark:text-white"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Cicilan Per Bulan</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-400 font-medium">Rp</span>
                        <FormattedRupiahInput 
                          value={editForm.nominal} 
                          onChange={val => setEditForm({...editForm, nominal: val})}
                          className="w-full pl-9 pr-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-bold text-rose-600 dark:text-rose-400 focus:ring-2 focus:ring-rose-500 outline-none"
                          required
                        />
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Sisa Hutang Saat Ini</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-400 font-medium">Rp</span>
                        <FormattedRupiahInput 
                          value={editForm.sisaHutang} 
                          onChange={val => setEditForm({...editForm, sisaHutang: val})}
                          className="w-full pl-9 pr-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-black text-teal-600 dark:text-teal-400 focus:ring-2 focus:ring-teal-500 outline-none"
                          required
                        />
                      </div>
                    </div>
                  </div>
               </form>
            </div>
            
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3 shrink-0">
              <button onClick={() => {setIsEditModalOpen(false); setEditForm(null);}} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors text-sm">Batal</button>
              <button type="submit" form="editLoanForm" disabled={isSaving} className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold shadow-sm transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-70">
                {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={16} />}
                {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🪄 MODAL BARU: Hapus Pinjaman */}
      {confirmDelete.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center mx-auto mb-4">
                <Trash2 size={40} />
              </div>
              <h3 className="text-xl font-bold dark:text-white mb-2">Hapus Pinjaman?</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-4 leading-relaxed">
                Anda yakin ingin menghapus data <strong className="text-slate-700 dark:text-slate-200">"{confirmDelete.ket}"</strong> secara permanen dari sistem?
              </p>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-center gap-3 shrink-0">
              <button onClick={() => setConfirmDelete({ isOpen: false, teacherId: null, ket: '' })} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors w-full">Batal</button>
              <button onClick={executeDeleteLoan} disabled={isSaving} className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-sm transition-colors w-full flex justify-center items-center gap-2 disabled:opacity-70">
                {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Trash2 size={16} />}
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🪄 MODAL BARU: Detail & Riwayat Pinjaman (Visualisasi Progres) */}
      {selectedLoanHistory && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-teal-50 dark:bg-teal-900/30 shrink-0">
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 rounded-lg shadow-sm">
                    <Activity size={20} />
                 </div>
                 <div>
                    <h3 className="font-bold text-teal-800 dark:text-teal-300 leading-tight">Detail Riwayat Pinjaman</h3>
                    <p className="text-[10px] text-teal-600/80 dark:text-teal-500 font-medium">{selectedLoanHistory.name}</p>
                 </div>
              </div>
              <button onClick={() => setSelectedLoanHistory(null)} className="p-2 hover:bg-teal-100 dark:hover:bg-teal-800/50 rounded-full text-teal-600 transition-colors"><X size={20}/></button>
            </div>
            
            <div className="p-6 overflow-y-auto">
               <h4 className="text-xl font-black text-slate-800 dark:text-white text-center mb-1">{selectedLoanHistory.ket}</h4>
               <p className="text-xs text-slate-500 text-center mb-6">Informasi progres pelunasan dan sisa saldo hutang pegawai.</p>
               
               <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                     <span className="text-sm font-semibold text-slate-500">Plafon Pinjaman Awal</span>
                     <span className="font-bold text-slate-800 dark:text-white">{formatRp(selectedLoanHistory.totalPinjaman)}</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-rose-50 dark:bg-rose-900/10 rounded-xl border border-rose-100 dark:border-rose-800/30">
                     <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">Potongan Bulanan</span>
                     <span className="font-bold text-rose-700 dark:text-rose-300">-{formatRp(selectedLoanHistory.nominal)}</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-teal-50 dark:bg-teal-900/10 rounded-xl border border-teal-100 dark:border-teal-800/30 shadow-inner">
                     <span className="text-sm font-semibold text-teal-600 dark:text-teal-400">Sisa Hutang Saat Ini</span>
                     <span className="font-black text-lg text-teal-700 dark:text-teal-300">{formatRp(selectedLoanHistory.sisaHutang)}</span>
                  </div>
               </div>

               {/* Progress Bar Visual */}
               <div className="mt-8">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Progres Pelunasan</span>
                    <span className="text-sm font-black text-teal-600 dark:text-teal-400">
                       {selectedLoanHistory.totalPinjaman > 0 ? (((selectedLoanHistory.totalPinjaman - selectedLoanHistory.sisaHutang) / selectedLoanHistory.totalPinjaman) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-4 overflow-hidden shadow-inner">
                    <div className="bg-gradient-to-r from-teal-400 to-emerald-500 h-full rounded-full transition-all duration-1000 relative" style={{ width: `${selectedLoanHistory.totalPinjaman > 0 ? (((selectedLoanHistory.totalPinjaman - selectedLoanHistory.sisaHutang) / selectedLoanHistory.totalPinjaman) * 100) : 0}%` }}>
                    </div>
                  </div>
                  <p className="text-center text-[10px] text-slate-400 font-medium mt-3 flex justify-center items-center gap-1">
                     <Info size={12}/> Estimasi Lunas: <strong className="text-slate-600 dark:text-slate-300">{Math.ceil(selectedLoanHistory.sisaHutang / selectedLoanHistory.nominal)} Bulan Kedepan</strong>
                  </p>
               </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end shrink-0">
              <button onClick={() => setSelectedLoanHistory(null)} className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-lg font-bold transition-colors text-sm shadow-sm w-full sm:w-auto">
                Tutup Detail
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-600 to-emerald-600 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 text-white shadow-lg relative overflow-hidden flex items-center justify-between shrink-0 mb-3 sm:mb-5">
        <div className="relative z-10">
          <h1 className="text-lg sm:text-2xl font-bold mb-0.5 sm:mb-1 flex items-center gap-2 sm:gap-3"><CreditCard className="text-teal-100" size={22} /> Buku Pemantauan Kasbon</h1>
          <p className="text-teal-50 text-xs sm:text-sm">Monitor transparansi piutang, kelola pinjaman baru, dan sisa hutang pegawai.</p>
        </div>
        <CreditCard size={100} className="absolute -right-6 -top-6 text-white/10 transform rotate-12 pointer-events-none hidden sm:block" />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-4 shrink-0 mb-3 sm:mb-4">
         <div className="bg-white dark:bg-slate-800 p-2.5 sm:p-5 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-2 sm:gap-4">
            <div className="w-8 h-8 sm:w-12 sm:h-12 bg-amber-50 dark:bg-amber-900/30 text-amber-500 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0">
               <Wallet size={16} className="sm:hidden" />
               <Wallet size={24} className="hidden sm:block" />
            </div>
            <div className="min-w-0">
               <p className="text-[9px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-0.5 truncate">Sisa Piutang</p>
               <h3 className="text-sm sm:text-2xl font-black text-amber-600 dark:text-amber-400 truncate">{formatRp(totalPiutang)}</h3>
            </div>
         </div>
         <div className="bg-white dark:bg-slate-800 p-2.5 sm:p-5 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-2 sm:gap-4">
            <div className="w-8 h-8 sm:w-12 sm:h-12 bg-teal-50 dark:bg-teal-900/30 text-teal-500 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0">
               <Activity size={16} className="sm:hidden" />
               <Activity size={24} className="hidden sm:block" />
            </div>
            <div className="min-w-0">
               <p className="text-[9px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-0.5 truncate">Potongan Bulan Ini</p>
               <h3 className="text-sm sm:text-2xl font-black text-teal-600 dark:text-teal-400 truncate">{formatRp(totalPotonganBulanan)}</h3>
            </div>
         </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col flex-1 min-h-0">
         <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5 sm:gap-4 bg-slate-50 dark:bg-slate-900/50 shrink-0">
          <h3 className="text-sm sm:text-base font-bold dark:text-white flex items-center gap-2 shrink-0">Daftar Tagihan Pegawai</h3>
          
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 w-full sm:w-auto items-center justify-end">
            <div className="relative w-full sm:w-64 flex-1">
              <Search className="absolute left-2.5 top-2 text-slate-400" size={15} />
              <input 
                type="text" 
                placeholder="Cari Pegawai atau Keterangan..." 
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-teal-500 outline-none dark:text-white transition-all shadow-sm"
              />
            </div>
            
            <div className="grid grid-cols-3 gap-1.5 w-full sm:flex sm:w-auto">
              <button onClick={() => setIsAddModalOpen(true)} className="justify-center bg-blue-600 hover:bg-blue-700 text-white px-2 py-1.5 rounded-lg text-xs font-bold transition-colors items-center gap-1 shadow-sm cursor-pointer flex">
                 <PlusCircle size={14} /> <span>Tambah</span>
              </button>
              <input type="file" accept=".csv, .xlsx, .xls" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} className="justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors items-center gap-1 shadow-sm cursor-pointer flex border border-slate-300 dark:border-slate-600">
                 <Upload size={14} /> <span>Impor</span>
              </button>
              <button onClick={handleExportCSV} className="justify-center bg-teal-600 hover:bg-teal-700 text-white px-2 py-1.5 rounded-lg text-xs font-bold transition-colors items-center gap-1 shadow-sm cursor-pointer flex">
                 <Download size={14} /> <span>Ekspor</span>
              </button>
            </div>
          </div>
         </div>

        {/* FITUR BARU: Tampilan Kartu Mobile Rekap Pinjaman (< md) */}
        <div className="md:hidden space-y-2.5 p-2.5 sm:p-4 no-print">
           {filteredLoans.map((loan, idx) => (
              <div key={`${loan.teacherId}-${idx}`} className={`bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-2.5 ${loan.isLunas ? 'opacity-75 bg-slate-50/50' : ''}`}>
                 <div className="flex justify-between items-start">
                    <div>
                       <h4 className="font-bold text-sm text-slate-800 dark:text-white">{loan.name}</h4>
                       <div className="text-[11px] text-slate-500 mt-0.5">{loan.nipy} • {loan.ket}</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${loan.isLunas ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'}`}>
                       {loan.isLunas ? 'LUNAS' : 'Belum Lunas'}
                    </span>
                 </div>

                 <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700/50">
                    <div><span className="text-slate-400">Total Plafon:</span> <span className="font-bold block dark:text-slate-200">{formatRp(loan.totalPinjaman)}</span></div>
                    <div><span className="text-slate-400">Cicilan/Bulan:</span> <span className="font-bold block text-rose-600 dark:text-rose-400">{formatRp(loan.nominal)}</span></div>
                    <div className="col-span-2"><span className="text-slate-400">Sisa Hutang:</span> <span className="font-black text-xs block text-teal-600 dark:text-teal-400">{formatRp(loan.sisaHutang)}</span></div>
                 </div>

                 <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-700/50">
                    <button onClick={() => setSelectedLoanHistory(loan)} className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors">
                       <History size={13}/> Riwayat
                    </button>
                    <button onClick={() => { setEditForm({ teacherId: loan.teacherId, loanIdx: loan.loanIdx, ket: loan.ket, nominal: loan.nominal, totalPinjaman: loan.totalPinjaman, sisaHutang: loan.sisaHutang, originalKet: loan.ket }); setIsEditModalOpen(true); }} className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 dark:text-amber-400 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors">
                       <Edit size={13}/> Edit
                    </button>
                    <button onClick={() => setConfirmDelete({ isOpen: true, teacherId: loan.teacherId, ket: loan.ket })} className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors">
                       <Trash2 size={13}/> Hapus
                    </button>
                 </div>
              </div>
           ))}
        </div>

        <div className="hidden md:block overflow-x-auto flex-1 relative touch-pan-x scroll-smooth">
          <table className="w-full text-left text-sm whitespace-nowrap min-w-max">
            <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 sticky top-0 z-10 shadow-sm border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-4 font-bold">Nama Pegawai & Status</th>
                <th className="p-4 font-bold">Keterangan Pinjaman</th>
                <th className="p-4 font-bold text-right text-slate-500 dark:text-slate-400">Plafon</th>
                <th className="p-4 font-bold text-right text-rose-500">Potongan/Bulan</th>
                <th className="p-4 font-bold text-right text-teal-600">Sisa Hutang</th>
                <th className="p-4 font-bold text-center">Status</th>
                <th className="p-4 font-bold text-center">Aksi Manajemen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
               {filteredLoans.map((loan, idx) => (
                  <tr key={`${loan.teacherId}-${idx}`} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group ${loan.isLunas ? 'opacity-60 grayscale-[50%]' : ''}`}>
                     <td className="p-4">
                        <div className={`font-bold ${loan.isLunas ? 'text-slate-500' : 'text-slate-800 dark:text-slate-200'}`}>{loan.name}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{loan.nipy} • {loan.status}</div>
                     </td>
                     <td className="p-4">
                        <div className="font-semibold text-slate-700 dark:text-slate-300 max-w-[200px] truncate" title={loan.ket}>{loan.ket}</div>
                     </td>
                     <td className="p-4 text-right font-medium text-slate-500 dark:text-slate-400">
                        {formatRp(loan.totalPinjaman)}
                     </td>
                     <td className="p-4 text-right font-medium text-rose-500">
                        {formatRp(loan.nominal)}
                     </td>
                     <td className="p-4 text-right">
                        <span className={`font-black tracking-tight text-[13px] px-3 py-1.5 rounded-lg border shadow-sm ${loan.isLunas ? 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:border-slate-700' : 'bg-teal-50 text-teal-700 border-teal-100 dark:bg-teal-900/30 dark:border-teal-800 dark:text-teal-400'}`}>
                           {formatRp(loan.sisaHutang)}
                        </span>
                     </td>
                     <td className="p-4 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-bold ${loan.isLunas ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
                           {loan.isLunas ? 'LUNAS' : 'Belum Lunas'}
                        </span>
                     </td>
                     <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                           <button 
                             onClick={() => setSelectedLoanHistory(loan)}
                             className="p-2 bg-teal-50 hover:bg-teal-100 dark:bg-teal-900/30 dark:hover:bg-teal-900/50 text-teal-600 dark:text-teal-400 rounded-md transition-colors shadow-sm border border-teal-100 dark:border-teal-800"
                             title="Lihat Detail & Riwayat Progres"
                           >
                             <Activity size={16} />
                           </button>
                           
                           {/* 🪄 TOMBOL PINTASAN CERDAS: Kalkulator Biru untuk Redirect Spesifik ke Tab Potongan Gaji Pegawai */}
                           <button 
                             onClick={() => onEditGaji(loan.teacherId, 'potongan')}
                             className="p-2 bg-blue-50 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-800 text-blue-600 dark:text-blue-300 rounded-md transition-all shadow-sm border border-blue-200 dark:border-blue-700 hover:-translate-y-0.5"
                             title="Buka Form Potongan Gaji Pegawai Ini"
                           >
                             <Calculator size={16} />
                           </button>

                           <button 
                             onClick={() => {
                                setEditForm({
                                   teacherId: loan.teacherId,
                                   originalKet: loan.ket,
                                   ket: loan.ket,
                                   nominal: loan.nominal,
                                   totalPinjaman: loan.totalPinjaman,
                                   sisaHutang: loan.sisaHutang
                                });
                                setIsEditModalOpen(true);
                             }}
                             className="p-2 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-amber-600 dark:text-amber-400 rounded-md transition-colors shadow-sm border border-amber-100 dark:border-amber-800"
                             title="Edit Sisa Saldo Pinjaman"
                           >
                             <Edit size={16} />
                           </button>
                           <button 
                             onClick={() => setConfirmDelete({ isOpen: true, teacherId: loan.teacherId, ket: loan.ket })}
                             className="p-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-md transition-colors shadow-sm border border-red-100 dark:border-red-800"
                             title="Hapus Tagihan Permanen"
                           >
                             <Trash2 size={16} />
                           </button>
                        </div>
                     </td>
                  </tr>
               ))}
               {filteredLoans.length === 0 && (
                  <tr><td colSpan="7" className="p-8 text-center text-slate-500">Tidak ada tanggungan pinjaman atau kasbon pegawai ditemukan.</td></tr>
               )}
            </tbody>
          </table>
         </div>
      </div>
    </div>
  );
}

// --- VIEW: REKAP ABSENSI (KOMPONEN BARU) ---
function RekapAbsensiView({ teachers, setTeachers, externalFilter, setExternalFilter, settings, presensiGuru = [], saveAuditLog, user }) {
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

  // 🪄 FITUR BARU: Sinkronisasi Keterlambatan dari Presensi Guru & Staff
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncMethod, setSyncMethod] = useState('sesi'); // 'sesi' = per sesi keterlambatan | 'hari' = per hari unik
  const [syncFilterTab, setSyncFilterTab] = useState('all'); // 'all' | 'diff' | 'late'
  const [syncModalSearch, setSyncModalSearch] = useState('');
  const [selectedSyncIds, setSelectedSyncIds] = useState([]);
  const [syncToast, setSyncToast] = useState(null);

  // Periode bulan aktif format 'YYYY-MM'
  const currentPeriod = settings?.payrollPeriod || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  const activeTeachers = useMemo(() => (teachers || []).filter(isTeacherActive), [teachers]);

  // Mapping data keterlambatan dari presensiGuru untuk setiap guru pada periode aktif
  const teacherPresensiMap = useMemo(() => {
    const map = {};
    if (!Array.isArray(presensiGuru) || presensiGuru.length === 0) return map;
    
    activeTeachers.forEach(t => {
      const tIdStr = String(t.id).trim();
      const tNameClean = (t.name || '').trim().toLowerCase();

      const matched = presensiGuru.filter(r => {
        if (!r) return false;
        const rDate = String(r.date || r.tanggal || '');
        if (!rDate.startsWith(currentPeriod)) return false;

        const rIdStr = String(r.teacherId || '').trim();
        const rNameClean = String(r.teacherName || '').trim().toLowerCase();

        return (rIdStr && rIdStr === tIdStr) ||
          (tNameClean && rNameClean && (rNameClean === tNameClean || rNameClean.replace(/[^a-z0-9]/g, '') === tNameClean.replace(/[^a-z0-9]/g, '')));
      });

      const lateRecords = matched.filter(r => r.status === 'Terlambat' || (Number(r.terlambatMenit) || 0) > 0);
      const totalSessionsLate = lateRecords.length;
      const uniqueDaysLate = new Set(lateRecords.map(r => r.date || r.tanggal)).size;
      const totalMinutesLate = lateRecords.reduce((sum, r) => sum + (Number(r.terlambatMenit) || 0), 0);

      const details = lateRecords.map(r => {
        const rawDate = r.date || r.tanggal || '';
        const tglNum = rawDate.split('-')[2] || rawDate;
        const sesi = r.sesiNama || (r.sesiId === 'sore' ? 'Sesi Sore' : 'Sesi Pagi');
        const jam = r.jamMasuk ? r.jamMasuk.slice(0, 5) : '-';
        const menit = r.terlambatMenit ? `${r.terlambatMenit}m` : '';
        return `Tgl ${tglNum} (${sesi}, ${jam}${menit ? `, +${menit}` : ''})`;
      });

      map[t.id] = {
        matchedCount: matched.length,
        totalSessionsLate,
        uniqueDaysLate,
        totalMinutesLate,
        details,
        lateRecords
      };
    });

    return map;
  }, [presensiGuru, activeTeachers, currentPeriod]);

  // Total guru yang terlambat di Presensi Guru bulan ini
  const totalGuruTelatPresensi = useMemo(() => {
    return Object.values(teacherPresensiMap).filter(v => v.totalSessionsLate > 0).length;
  }, [teacherPresensiMap]);

  // Daftar komparasi antara Rekap Tabel vs Presensi Guru
  const syncComparisonList = useMemo(() => {
    return activeTeachers.map(t => {
      const pInfo = teacherPresensiMap[t.id] || { totalSessionsLate: 0, uniqueDaysLate: 0, totalMinutesLate: 0, details: [] };
      const presensiLate = syncMethod === 'hari' ? pInfo.uniqueDaysLate : pInfo.totalSessionsLate;
      const tableLate = t.payroll?.disiplin?.telat !== undefined ? Number(t.payroll.disiplin.telat) : 0;
      const isDiff = presensiLate !== tableLate;
      return {
        id: t.id,
        name: t.name,
        nipy: t.nipy || t.nip || '-',
        position: t.position || 'Guru',
        tableLate,
        presensiLate,
        isDiff,
        details: pInfo.details,
        totalMinutesLate: pInfo.totalMinutesLate
      };
    });
  }, [activeTeachers, teacherPresensiMap, syncMethod]);

  // Filter list per pencarian dan tab di dalam modal
  const filteredSyncList = useMemo(() => {
    return syncComparisonList.filter(item => {
      const matchSearch = item.name.toLowerCase().includes(syncModalSearch.toLowerCase()) || item.nipy.toLowerCase().includes(syncModalSearch.toLowerCase());
      if (!matchSearch) return false;
      if (syncFilterTab === 'diff') return item.isDiff;
      if (syncFilterTab === 'late') return item.presensiLate > 0;
      return true;
    });
  }, [syncComparisonList, syncModalSearch, syncFilterTab]);

  // Buka modal sinkronisasi dan pre-select guru yang berbeda / terlambat
  const handleOpenSyncModal = () => {
    const diffIds = syncComparisonList
      .filter(item => item.isDiff || item.presensiLate > 0)
      .map(item => item.id);
    setSelectedSyncIds(diffIds.length > 0 ? diffIds : syncComparisonList.map(item => item.id));
    setIsSyncModalOpen(true);
  };

  // Terapkan sinkronisasi massal dari Presensi Guru ke tabel Rekap Jam Mengajar
  const handleApplySync = () => {
    if (selectedSyncIds.length === 0) {
      alert("Silakan pilih minimal 1 pegawai untuk disinkronkan.");
      return;
    }

    setIsSaving(true);
    const selectedSet = new Set(selectedSyncIds);

    const updatedTeachers = teachers.map(t => {
      if (selectedSet.has(t.id)) {
        const pInfo = teacherPresensiMap[t.id];
        const newLate = pInfo ? (syncMethod === 'hari' ? pInfo.uniqueDaysLate : pInfo.totalSessionsLate) : 0;
        return {
          ...t,
          payroll: {
            ...(t.payroll || {}),
            disiplin: {
              ...(t.payroll?.disiplin || {}),
              telat: newLate
            }
          }
        };
      }
      return t;
    });

    setTeachers(updatedTeachers);
    safeStorageSet('payedu_teachers', updatedTeachers);
    pushToSupabase('SAVE_TEACHERS', updatedTeachers).catch(err => {
      console.warn("Gagal simpan sync telat ke cloud:", err);
    });

    saveAuditLog?.(
      user?.name || 'Administrator',
      'Tarik Telat dari Presensi',
      `${selectedSyncIds.length} Pegawai`,
      `Sinkronisasi otomatis kolom Telat dari menu Presensi Guru & Staff periode ${bulan} (${syncMethod === 'hari' ? 'Metode Hari Unik' : 'Metode Sesi'})`,
      'finansial'
    );

    setIsSaving(false);
    setIsSyncModalOpen(false);
    setSyncToast(`Berhasil! Data keterlambatan untuk ${selectedSyncIds.length} pegawai telah disinkronkan langsung ke tabel.`);
    setTimeout(() => setSyncToast(null), 4000);
  };

  useEffect(() => {
    if (externalFilter && externalFilter !== 'all') {
      setActiveFilter(externalFilter);
      if (setExternalFilter) setExternalFilter('all'); // Reset agar tidak tersangkut
    }
  }, [externalFilter, setExternalFilter]);

  const filtered = activeTeachers.filter(t => {
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

    activeTeachers.forEach(t => {
      const real = t.payroll?.jamMengajar?.realisasi || 0;
      const wajib = t.payroll?.jamMengajar?.wajib !== undefined && t.payroll?.jamMengajar?.wajib !== '' ? Number(t.payroll.jamMengajar.wajib) : (t.status === 'Tetap' ? 60 : 0);
      const telat = t.payroll?.disiplin?.telat || 0;

      totalJam += real;
      if (real < wajib) kurangJam++;
      if (telat >= 10) seringTelat++; // Standar 'sering telat' = 3 kali atau lebih
    });

    return { totalJam, kurangJam, seringTelat };
  }, [activeTeachers]);

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
    try {
      exportTeachingHoursToExcel({
        teachers: filtered,
        settings,
        presensiGuru,
        bulan
      });
      return;
    } catch (err) {
      console.warn("Ekspor xlsx gagal, fallback ke CSV:", err);
    }
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
      harian: safeData,
      telat: t.payroll?.disiplin?.telat !== undefined ? t.payroll?.disiplin?.telat : 0
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

    const newTelat = editingData.telat !== '' && editingData.telat !== undefined ? Math.max(0, Number(editingData.telat)) : 0;

    // Memberikan jeda (delay) visual cerdas
    setTimeout(() => {
      const updated = teachers.map(t => {
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
                hadir: autoHadir,
                telat: newTelat
              }
            }
          };
        }
        return t;
      });

      setTeachers(updated);
      safeStorageSet('payedu_teachers', updated);
      pushToSupabase('SAVE_TEACHERS', updated).catch(e => console.warn(e));
      
      setIsSaving(false); // Matikan loading
      setIsEditModalOpen(false);
      setEditingData(null);
    }, 400);
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

  // 🪄 TAMBALAN CERDAS: Fungsi untuk mengubah jumlah telat langsung di tabel (Manual/Quick-Sync)
  const handleInlineTelatChange = (teacherId, newValue) => {
    const telatVal = newValue === '' ? '' : Math.max(0, Number(newValue));
    const target = teachers.find(t => t.id === teacherId);
    const oldVal = target?.payroll?.disiplin?.telat || 0;

    const updated = teachers.map(t => {
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
    });

    setTeachers(updated);
    safeStorageSet('payedu_teachers', updated);

    if (saveAuditLog && target && Number(oldVal) !== Number(telatVal)) {
      saveAuditLog(
        user?.name || 'Administrator',
        'Ubah Keterlambatan',
        target.name,
        `Mengubah keterlambatan ${target.name} dari ${oldVal} menjadi ${telatVal} kali`,
        'finansial'
      );
    }
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
                {/* 🪄 INPUT TAMBAHAN: Keterlambatan (Disiplin) dengan tombol Tarik dari Presensi */}
                <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <div className="bg-red-50/50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5 uppercase tracking-wider">
                        <Clock className="text-red-500" size={15} /> Keterlambatan Kehadiran (Disiplin)
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Jumlah keterlambatan masuk kelas untuk perhitungan potongan disiplin periode {bulan}.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      <div className="flex items-center gap-1.5">
                        <input 
                          type="number"
                          min="0"
                          value={editingData.telat !== undefined ? editingData.telat : 0}
                          onChange={(e) => setEditingData(prev => ({ ...prev, telat: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0) }))}
                          className="w-16 p-1.5 text-center border border-red-300 dark:border-red-600 rounded-lg bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 font-black text-sm focus:ring-2 focus:ring-red-500 outline-none shadow-xs"
                          placeholder="0"
                        />
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Kali</span>
                      </div>
                      {(teacherPresensiMap[editingData.id]?.totalSessionsLate || 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => setEditingData(prev => ({ ...prev, telat: teacherPresensiMap[editingData.id].totalSessionsLate }))}
                          className="px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-900/40 dark:hover:bg-amber-900/60 dark:text-amber-300 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-xs whitespace-nowrap"
                          title={`Presensi mencatat ${teacherPresensiMap[editingData.id].totalSessionsLate} kali terlambat bulan ini`}
                        >
                          <Sparkles size={13} className="text-amber-500" />
                          Tarik Presensi ({teacherPresensiMap[editingData.id].totalSessionsLate}x)
                        </button>
                      )}
                    </div>
                  </div>
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

      {/* 🪄 MODAL BARU: SINKRONISASI KETERLAMBATAN DARI PRESENSI GURU & STAFF */}
      {isSyncModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 duration-200">
            {/* Header Modal */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-teal-600 via-teal-700 to-emerald-700 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl shadow-inner border border-white/20">
                  <UserCheck size={22} className="text-emerald-300" />
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg flex items-center gap-2">
                    Tarik Keterlambatan dari Presensi Guru
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/20 font-medium">Periode {bulan}</span>
                  </h3>
                  <p className="text-xs text-teal-100 mt-0.5">
                    Sinkronkan jumlah keterlambatan dari modul Presensi Guru & Staff langsung ke kolom Telat tabel Rekap Jam Mengajar.
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsSyncModalOpen(false)} 
                className="p-1.5 hover:bg-white/20 rounded-full text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <X size={20}/>
              </button>
            </div>

            {/* Pilihan Metode Perhitungan & Summary */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 space-y-4 shrink-0">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-teal-600 dark:text-teal-400" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Metode Perhitungan Keterlambatan:
                  </span>
                </div>
                <div className="flex items-center gap-2 bg-slate-200 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setSyncMethod('sesi')}
                    className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${syncMethod === 'sesi' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                  >
                    <span>Jumlah Sesi Terlambat</span>
                    <span className="text-[10px] opacity-75 font-normal">(Standar)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSyncMethod('hari')}
                    className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${syncMethod === 'hari' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                  >
                    <span>Jumlah Hari Unik</span>
                    <span className="text-[10px] opacity-75 font-normal">(1x/hari)</span>
                  </button>
                </div>
              </div>

              {/* Ringkasan Indikator */}
              <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
                <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Total Pegawai</span>
                  <div className="text-lg font-black text-slate-800 dark:text-slate-200">{activeTeachers.length}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-bold text-amber-500 uppercase">Terlambat di Presensi</span>
                  <div className="text-lg font-black text-amber-600 dark:text-amber-400">{totalGuruTelatPresensi}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-bold text-blue-500 uppercase">Perlu Update (Beda)</span>
                  <div className="text-lg font-black text-blue-600 dark:text-blue-400">
                    {syncComparisonList.filter(item => item.isDiff).length}
                  </div>
                </div>
              </div>
            </div>

            {/* Filter Tabs & Search */}
            <div className="p-3 sm:px-5 sm:py-3 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-800 shrink-0">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <button
                  type="button"
                  onClick={() => setSyncFilterTab('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${syncFilterTab === 'all' ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                >
                  Semua ({syncComparisonList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSyncFilterTab('diff')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-colors flex items-center gap-1 ${syncFilterTab === 'diff' ? 'bg-amber-500 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                >
                  <span>Perlu Update</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 font-black">
                    {syncComparisonList.filter(item => item.isDiff).length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSyncFilterTab('late')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-colors flex items-center gap-1 ${syncFilterTab === 'late' ? 'bg-red-500 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                >
                  <span>Ada Telat</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200 font-black">
                    {syncComparisonList.filter(item => item.presensiLate > 0).length}
                  </span>
                </button>
              </div>

              <div className="relative w-full sm:w-64">
                <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari guru / NIPY..."
                  value={syncModalSearch}
                  onChange={(e) => setSyncModalSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            {/* List Tabel Perbandingan */}
            <div className="overflow-y-auto overflow-x-auto flex-1 p-0">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-bold sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      <input 
                        type="checkbox"
                        checked={filteredSyncList.length > 0 && filteredSyncList.every(item => selectedSyncIds.includes(item.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const addIds = filteredSyncList.map(item => item.id);
                            setSelectedSyncIds(prev => Array.from(new Set([...prev, ...addIds])));
                          } else {
                            const removeIds = new Set(filteredSyncList.map(item => item.id));
                            setSelectedSyncIds(prev => prev.filter(id => !removeIds.has(id)));
                          }
                        }}
                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer w-4 h-4"
                      />
                    </th>
                    <th className="p-3">Nama Pegawai</th>
                    <th className="p-3 text-center">Di Tabel Saat Ini</th>
                    <th className="p-3">Hasil Rekap Presensi Guru</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filteredSyncList.map(item => {
                    const isChecked = selectedSyncIds.includes(item.id);
                    return (
                      <tr 
                        key={item.id} 
                        className={`transition-colors cursor-pointer ${isChecked ? 'bg-teal-50/40 dark:bg-teal-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'}`}
                        onClick={() => {
                          setSelectedSyncIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]);
                        }}
                      >
                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            checked={isChecked}
                            onChange={() => {
                              setSelectedSyncIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]);
                            }}
                            className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer w-4 h-4"
                          />
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-800 dark:text-slate-200">{item.name}</div>
                          <div className="text-[10px] text-slate-500">{item.nipy} • {item.position}</div>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`inline-block px-2.5 py-1 rounded-lg font-black text-xs ${item.tableLate > 0 ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800/50' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                            {item.tableLate} Kali
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`font-black text-xs ${item.presensiLate > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`}>
                                {item.presensiLate} Kali Keterlambatan
                              </span>
                              {item.totalMinutesLate > 0 && (
                                <span className="text-[10px] text-slate-400">({item.totalMinutesLate} menit total)</span>
                              )}
                            </div>
                            {item.details && item.details.length > 0 ? (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {item.details.slice(0, 4).map((d, dIdx) => (
                                  <span key={dIdx} className="text-[10px] px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40 rounded">
                                    {d}
                                  </span>
                                ))}
                                {item.details.length > 4 && (
                                  <span className="text-[10px] text-slate-400 self-center">+{item.details.length - 4} sesi lagi</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 italic">Disiplin / Tidak ada telat</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          {item.isDiff ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800/50">
                              <AlertCircle size={11} /> Beda ({item.tableLate} → {item.presensiLate})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/50">
                              <CheckCircle size={11} /> Sesuai
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredSyncList.length === 0 && (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-slate-400 text-xs">
                        Tidak ada data pegawai yang sesuai dengan filter pencarian.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer Modal */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  <strong className="text-teal-600 dark:text-teal-400">{selectedSyncIds.length}</strong> dari {filteredSyncList.length} pegawai dipilih
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const diffIds = syncComparisonList.filter(item => item.isDiff).map(item => item.id);
                    setSelectedSyncIds(diffIds);
                  }}
                  className="text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400 font-bold underline cursor-pointer"
                >
                  Pilih yang Berbeda Saja
                </button>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setIsSyncModalOpen(false)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isSaving || selectedSyncIds.length === 0}
                  onClick={handleApplySync}
                  className="px-5 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Check size={14} />
                  )}
                  <span>Terapkan ke Kolom Telat ({selectedSyncIds.length})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🪄 TOAST NOTIFIKASI SINKRONISASI SUKSES */}
      {syncToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900/95 dark:bg-slate-100/95 text-white dark:text-slate-900 px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-3 border border-slate-700 dark:border-slate-300 animate-in slide-in-from-bottom-5 duration-300">
          <CheckCircle className="text-emerald-400 dark:text-emerald-600 shrink-0" size={20} />
          <span className="text-xs sm:text-sm font-bold">{syncToast}</span>
          <button type="button" onClick={() => setSyncToast(null)} className="ml-2 text-slate-400 hover:text-white dark:hover:text-black">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="bg-gradient-to-r from-orange-600 to-amber-500 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 text-white shadow-lg flex items-center justify-between shrink-0 relative overflow-hidden mb-3 sm:mb-5">
        <div className="relative z-10">
          <h1 className="text-lg sm:text-2xl font-bold mb-0.5 sm:mb-1 flex items-center gap-2 sm:gap-3"><FileText className="text-orange-100" size={22} /> Rekapitulasi Jam Mengajar</h1>
          <p className="text-orange-50 text-xs sm:text-sm">Rincian jurnal harian (Tgl 1 - 31) dan evaluasi target wajib periode {bulan}.</p>
        </div>
        <FileText size={100} className="absolute -right-6 -top-6 text-white/10 transform rotate-12 pointer-events-none hidden sm:block" />
      </div>

      {/* TAMBAHAN: Kartu Statistik Ringkasan Absensi (INTERAKTIF) */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-4 md:gap-6 mb-3 sm:mb-5">
        <div onClick={() => setActiveFilter('all')} className={`cursor-pointer transition-all duration-300 hover:-translate-y-1 bg-white dark:bg-slate-800 p-2 sm:p-5 rounded-xl sm:rounded-2xl shadow-sm border ${activeFilter === 'all' ? 'border-blue-500 ring-2 sm:ring-4 ring-blue-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-blue-300'} flex flex-col justify-center relative overflow-hidden group`}>
          <p className="text-[9px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 sm:mb-2 relative z-10 truncate">Total Realisasi</p>
          <div className="flex items-baseline gap-1 sm:gap-2 relative z-10">
            <h4 className="text-base sm:text-3xl font-extrabold text-blue-600 dark:text-blue-400">{stats.totalJam}</h4>
            <span className="text-[10px] sm:text-sm font-bold text-blue-500">JPL</span>
          </div>
          <div className="absolute -right-4 -bottom-4 bg-blue-50 dark:bg-blue-900/30 w-16 h-16 sm:w-20 sm:h-20 rounded-full blur-xl group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50 transition-colors"></div>
          {activeFilter === 'all' && <div className="absolute top-2 right-2 sm:top-4 sm:right-4"><CheckCircle size={14} className="text-blue-500"/></div>}
        </div>
        
        <div onClick={() => setActiveFilter(activeFilter === 'kurang_jam' ? 'all' : 'kurang_jam')} className={`cursor-pointer transition-all duration-300 hover:-translate-y-1 bg-white dark:bg-slate-800 p-2 sm:p-5 rounded-xl sm:rounded-2xl shadow-sm border ${activeFilter === 'kurang_jam' ? 'border-amber-500 ring-2 sm:ring-4 ring-amber-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-amber-300'} flex flex-col justify-center relative group`}>
          <div className="flex items-start justify-between relative z-10">
            <div>
              <p className="text-[9px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 sm:mb-2 truncate">Kurang Jam</p>
              <div className="flex items-baseline gap-1 sm:gap-2">
                <h4 className="text-base sm:text-3xl font-extrabold text-amber-600 dark:text-amber-400">{stats.kurangJam}</h4>
                <span className="text-[10px] sm:text-sm font-bold text-slate-500">Org</span>
              </div>
            </div>
            <div className={`p-1.5 sm:p-2 rounded-full transition-colors ${activeFilter === 'kurang_jam' ? 'bg-amber-500 text-white' : 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 group-hover:bg-amber-100'} ${stats.kurangJam === 0 ? 'opacity-30' : ''}`}><AlertCircle size={16} className="sm:hidden" /><AlertCircle size={20} className="hidden sm:block" /></div>
          </div>
          {activeFilter === 'kurang_jam' && <div className="absolute top-0 right-0 w-8 h-8 sm:w-10 sm:h-10 bg-amber-500/10 rounded-bl-full border-b border-l border-amber-500/20"></div>}
        </div>

        <div onClick={() => setActiveFilter(activeFilter === 'sering_telat' ? 'all' : 'sering_telat')} className={`cursor-pointer transition-all duration-300 hover:-translate-y-1 bg-white dark:bg-slate-800 p-2 sm:p-5 rounded-xl sm:rounded-2xl shadow-sm border ${activeFilter === 'sering_telat' ? 'border-red-500 ring-2 sm:ring-4 ring-red-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-red-300'} flex flex-col justify-center relative group`}>
          <div className="flex items-start justify-between relative z-10">
            <div>
              <p className="text-[9px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 sm:mb-2 truncate">Disiplin (&gt;10x)</p>
              <div className="flex items-baseline gap-1 sm:gap-2">
                <h4 className="text-base sm:text-3xl font-extrabold text-red-600 dark:text-red-400">{stats.seringTelat}</h4>
                <span className="text-[10px] sm:text-sm font-bold text-slate-500">Org</span>
              </div>
            </div>
            <div className={`p-1.5 sm:p-2 rounded-full transition-colors ${activeFilter === 'sering_telat' ? 'bg-red-500 text-white' : 'bg-red-50 dark:bg-red-900/30 text-red-600 group-hover:bg-red-100'} ${stats.seringTelat === 0 ? 'opacity-30' : ''}`}><Clock size={16} className="sm:hidden" /><Clock size={20} className="hidden sm:block" /></div>
          </div>
          {activeFilter === 'sering_telat' && <div className="absolute top-0 right-0 w-8 h-8 sm:w-10 sm:h-10 bg-red-500/10 rounded-bl-full border-b border-l border-red-500/20"></div>}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5 sm:gap-4 shrink-0">
          <div className="relative w-full max-w-md flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2.5 top-2 text-slate-400" size={15} />
              <input 
                type="text" placeholder="Cari Nama Guru..." 
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs sm:text-sm focus:ring-2 focus:ring-orange-500 outline-none dark:text-white"
              />
            </div>
            {/* Indikator Filter Aktif */}
            {activeFilter !== 'all' && (
              <span className={`px-2 py-1 rounded-lg text-[10px] sm:text-xs font-bold whitespace-nowrap flex items-center gap-1 ${activeFilter === 'kurang_jam' ? 'bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400' : 'bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400'}`}>
                Filter: {activeFilter === 'kurang_jam' ? 'Kurang Jam' : 'Sering Telat'}
                <button onClick={() => setActiveFilter('all')} className="ml-0.5 hover:text-black dark:hover:text-white"><X size={11}/></button>
              </span>
            )}
          </div>
          
          {/* Action Buttons: 5 Tombol Grid Presisi di Mobile */}
          <div className="grid grid-cols-5 gap-1 w-full xl:w-auto sm:flex sm:flex-wrap justify-end">
            {/* 🪄 FITUR BARU: Tombol Tarik Telat dari Presensi Guru & Staff */}
            <button 
              type="button"
              onClick={handleOpenSyncModal} 
              className="bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white px-2 py-1.5 rounded-lg transition-all shadow-sm flex items-center justify-center gap-1 font-bold text-[11px] sm:text-xs cursor-pointer hover:shadow-md"
              title="Tarik dan sinkronkan data keterlambatan langsung dari menu Presensi Guru & Staff"
            >
              <UserCheck size={14} /> 
              <span className="hidden sm:inline">Presensi</span>
              <span className="sm:hidden">Absen</span>
              {totalGuruTelatPresensi > 0 && (
                <span className="ml-0.5 px-1 bg-white/25 text-white text-[9px] rounded-full font-black">
                  {totalGuruTelatPresensi}
                </span>
              )}
            </button>

            {/* TAMBAHAN: Tombol Reset Bulan */}
            <button onClick={handleResetBulan} className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 hover:bg-red-100 dark:hover:bg-red-900/40 px-2 py-1.5 rounded-lg transition-colors shadow-sm flex items-center justify-center gap-1 font-bold text-[11px] sm:text-xs">
              <Trash2 size={14} /> <span>Reset</span>
            </button>

            {/* TAMBAHAN: Tombol Import Mesin Absen */}
            <input type="file" accept=".csv, .txt, .xls, .xlsx" ref={mesinInputRef} onChange={handleImportMesinAbsen} className="hidden" />
            <button onClick={() => mesinInputRef.current?.click()} className="bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-600 px-2 py-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors shadow-sm flex items-center justify-center gap-1 font-bold text-blue-700 dark:text-blue-400 text-[11px] sm:text-xs">
              <Fingerprint size={14} /> <span>Mesin</span>
            </button>

            <input type="file" accept=".csv, .xlsx, .xls" ref={fileInputRef} onChange={handleImportExcel} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors shadow-sm flex items-center justify-center gap-1 font-bold text-slate-700 dark:text-slate-300 text-[11px] sm:text-xs">
              <Upload size={14} /> <span>Impor</span>
            </button>
            <button onClick={handleExportExcel} className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1.5 rounded-lg transition-colors shadow-sm flex items-center justify-center gap-1 font-bold text-[11px] sm:text-xs">
              <Download size={14} /> <span>Ekspor</span>
            </button>
          </div>
        </div>

        {/* FITUR BARU: Tampilan Kartu Mobile Rekap Absensi (< md) */}
        <div className="md:hidden space-y-2.5 p-2.5 sm:p-4 no-print">
          {filtered.map(t => {
             const wajib = t.payroll?.jamMengajar?.wajib !== undefined && t.payroll?.jamMengajar?.wajib !== '' ? Number(t.payroll.jamMengajar.wajib) : (t.status === 'Tetap' ? 60 : 0);
             const real = t.payroll?.jamMengajar?.realisasi || 0;
             const jsjm = t.payroll?.jamMengajar?.jsjm || 0;
             const jamPlus = t.payroll?.jamMengajar?.jamPlus || 0;
             const tInsidentalJam = (t.payroll?.kegiatanInsidental || []).reduce((sum, item) => sum + (Number(item.jam) || 0), 0);
             const selisih = (real + jsjm) - wajib + jamPlus + tInsidentalJam; 
             const telat = t.payroll?.disiplin?.telat || 0;
             const tepatWaktu = Math.max(0, real - telat);

             const isUnderperforming = selisih < 0;
             const isLateOften = telat >= 3;

             return (
               <div key={t.id} className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-2.5">
                 <div className="flex justify-between items-start">
                   <div>
                     <h4 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-1.5">
                       {isLateOften && <Clock size={14} className="text-red-500 shrink-0" title="Sering Telat" />}
                       {isUnderperforming && !isLateOften && <AlertCircle size={14} className="text-amber-500 shrink-0" title="Kurang Jam" />}
                       {t.name}
                     </h4>
                     <div className="text-xs text-slate-500 mt-0.5">{t.nipy} • {t.position || t.status}</div>
                   </div>
                   <button 
                     onClick={() => handleOpenEdit(t)} 
                     className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shrink-0"
                   >
                     <Edit size={14}/> Edit Jam
                   </button>
                 </div>

                 <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700/50">
                    <div><span className="text-slate-400">Total Realisasi:</span> <span className="font-black text-blue-600 dark:text-blue-400 block text-sm">{real} JPL</span></div>
                    <div><span className="text-slate-400">Tepat Waktu:</span> <span className="font-black text-emerald-600 dark:text-emerald-400 block text-sm">{tepatWaktu} JPL</span></div>
                    <div><span className="text-slate-400">Jam Wajib Target:</span> <span className="font-bold block dark:text-slate-200">{wajib} JPL</span></div>
                    <div><span className="text-slate-400">Jam Plus & Insidental:</span> <span className="font-bold text-emerald-600 block">+{jamPlus + tInsidentalJam} JPL</span></div>
                    <div>
                      <span className="text-slate-400">Jumlah Telat:</span> 
                      <span className={`font-bold block ${isLateOften ? 'text-red-600' : 'text-slate-700 dark:text-slate-300'}`}>{telat} Kali</span>
                      {(() => {
                        const pInfo = teacherPresensiMap[t.id];
                        const pLate = pInfo ? (syncMethod === 'hari' ? pInfo.uniqueDaysLate : pInfo.totalSessionsLate) : 0;
                        if (pLate > 0 && pLate !== telat) {
                          return (
                            <button
                              type="button"
                              onClick={() => handleInlineTelatChange(t.id, pLate)}
                              className="mt-1 text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer shadow-xs"
                            >
                              ⚡ Tarik Presensi ({pLate}x)
                            </button>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    <div><span className="text-slate-400">Selisih Target:</span> <span className={`font-bold block ${selisih < 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{selisih > 0 ? `+${selisih}` : selisih} JPL</span></div>
                 </div>
               </div>
             );
          })}
        </div>

        <div className="hidden md:block overflow-x-auto overflow-y-auto flex-1 print-area relative p-2 pb-4 scrollbar-thin">
          <table className="w-full text-left text-sm whitespace-nowrap min-w-max border-collapse border-2 border-slate-400 dark:border-slate-500">
            <thead className="bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 sticky top-0 z-20 shadow-sm">
              <tr>
                <th className="p-4 font-bold border border-slate-400 dark:border-slate-500 md:sticky md:left-0 bg-slate-200 dark:bg-slate-800 z-30 shadow-[1px_0_0_rgba(0,0,0,0.1)]">
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
                <th className="p-3 font-bold border border-slate-400 dark:border-slate-500 text-center md:sticky md:right-0 bg-slate-200 dark:bg-slate-800 z-30 shadow-[-1px_0_0_rgba(0,0,0,0.1)] no-print">Aksi</th>
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
                    <td className={`p-3 md:sticky md:left-0 z-10 border border-slate-400 dark:border-slate-500 shadow-[1px_0_0_rgba(0,0,0,0.05)] ${stickyBgClass}`}>
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
                      <div className="flex flex-col items-center justify-center gap-1 py-0.5">
                        <input 
                          type="number" 
                          min="0"
                          value={t.payroll?.disiplin?.telat !== undefined ? t.payroll?.disiplin?.telat : 0} 
                          onChange={(e) => handleInlineTelatChange(t.id, e.target.value)}
                          className={`w-14 p-1.5 text-center border rounded-lg bg-white dark:bg-slate-800 font-bold focus:ring-2 focus:ring-red-500 outline-none m-auto block shadow-sm transition-all ${isLateOften ? 'border-red-500 text-red-600 dark:text-red-400' : 'border-red-300 dark:border-red-700 text-red-600 dark:text-red-400'}`}
                          title="Edit manual jumlah keterlambatan (dapat diubah bebas oleh Admin)"
                          placeholder="0"
                        />
                        {(() => {
                          const pInfo = teacherPresensiMap[t.id];
                          const pLate = pInfo ? (syncMethod === 'hari' ? pInfo.uniqueDaysLate : pInfo.totalSessionsLate) : 0;
                          const curLate = Number(t.payroll?.disiplin?.telat) || 0;
                          
                          if (pLate > 0) {
                            if (pLate !== curLate) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => handleInlineTelatChange(t.id, pLate)}
                                  className="text-[10px] text-amber-800 dark:text-amber-300 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-900/60 px-1.5 py-0.5 rounded font-bold transition-colors cursor-pointer flex items-center gap-0.5 shadow-xs whitespace-nowrap"
                                  title={`Presensi Guru mencatat ${pLate}x keterlambatan. Klik untuk langsung menerapkan nilai ini.`}
                                >
                                  ⚡ Presensi: {pLate}x
                                </button>
                              );
                            } else {
                              return (
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold whitespace-nowrap" title="Nilai sudah sinkron dengan Presensi Guru">
                                  ✓ Presensi ({pLate}x)
                                </span>
                              );
                            }
                          } else if (curLate > 0) {
                            return (
                              <span className="text-[9px] text-slate-400 italic" title="Diinput manual oleh Admin (Catatan Presensi: 0)">
                                Manual
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </td>
                    <td className="p-3 text-center font-black text-emerald-700 dark:text-emerald-400 border border-slate-400 dark:border-slate-500 bg-emerald-50/50 dark:bg-emerald-900/20 text-lg">
                      {tepatWaktu}
                    </td>
                    <td className={`p-2 text-center border border-slate-400 dark:border-slate-500 md:sticky md:right-0 z-10 shadow-[-1px_0_0_rgba(0,0,0,0.05)] no-print ${stickyBgClass}`}>
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
  const [confirmPublish, setConfirmPublish] = useState(false); 

  // State untuk Preview, Edit, dan Hapus Kegiatan Massal
  const [previewActivity, setPreviewActivity] = useState(null);
  const [editActivity, setEditActivity] = useState(null);
  const [deleteActivity, setDeleteActivity] = useState(null);

  // 🪄 TAMBALAN CERDAS: Ref untuk Input File Excel Roster
  const rosterFileInputRef = useRef(null);

  const bulan = getFormattedPeriod(settings?.payrollPeriod);
  const [y, m] = (settings?.payrollPeriod || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`).split('-');
  const year = Number(y);
  const month = Number(m) - 1; // 0-indexed month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const filtered = teachers.filter(t => isTeacherActive(t) && (t.name.toLowerCase().includes(search.toLowerCase()) || t.nipy.includes(search)));

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

  // 🪄 FUNGSI BARU: Ekspor Template Roster ke CSV/Excel
  const handleExportRosterCSV = () => {
    const headers = ['ID Pegawai', 'Nama Lengkap', 'NIPY', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
    const csvRows = [headers.join(';')];

    // Menggunakan seluruh data teachers agar menjadi template utuh
    teachers.forEach(t => {
      const r = t.payroll?.roster || {};
      const row = [
        t.id,
        `"${t.name}"`,
        `"=""${t.nipy}"""`,
        r['senin'] || 0,
        r['selasa'] || 0,
        r['rabu'] || 0,
        r['kamis'] || 0,
        r['jumat'] || 0,
        r['sabtu'] || 0,
        r['minggu'] || 0
      ];
      csvRows.push(row.join(';'));
    });

    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Template_Roster_Mengajar_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 🪄 FUNGSI BARU: Impor Roster dari CSV/Excel dengan Smart Parser
  const handleImportRosterCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsSaving(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split(/\r?\n/);
      if (lines.length < 2) {
         setIsSaving(false);
         alert("Format file kosong atau tidak valid.");
         return;
      }

      let separator = ',';
      if (lines[0].includes(';')) separator = ';';
      else if (lines[0].includes('\t')) separator = '\t';

      // Parser CSV kebal banting
      const parseCSVLine = (line, delimiter) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
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
            if (cln.startsWith('="') && cln.endsWith('"')) cln = cln.substring(2, cln.length - 1);
            if (cln.startsWith("'")) cln = cln.substring(1);
            return cln;
        });
      };

      const headers = parseCSVLine(lines[0], separator).map(h => h.toLowerCase());
      const idIdx = headers.indexOf('id pegawai');
      const nameIdx = headers.findIndex(h => h.includes('nama'));
      
      const dayIndices = {
         senin: headers.indexOf('senin'),
         selasa: headers.indexOf('selasa'),
         rabu: headers.indexOf('rabu'),
         kamis: headers.indexOf('kamis'),
         jumat: headers.indexOf('jumat'),
         sabtu: headers.indexOf('sabtu'),
         minggu: headers.indexOf('minggu')
      };

      if (nameIdx === -1) {
         setIsSaving(false);
         alert('Gagal mendeteksi kolom. Pastikan file Excel yang diunggah memiliki kolom "Nama Lengkap". Disarankan untuk mengunduh template terlebih dahulu.');
         return;
      }

      let updatedCount = 0;
      const updatedTeachers = [...teachers];

      for (let i = 1; i < lines.length; i++) {
         if (!lines[i].trim()) continue;

         const values = parseCSVLine(lines[i], separator);
         const teacherId = idIdx !== -1 ? values[idIdx] : null;
         const teacherName = values[nameIdx];

         if (teacherName) {
            // Pencocokan cerdas: Coba pakai ID dulu, kalau gagal, pakai Nama
            const teacherIndex = updatedTeachers.findIndex(t => 
                (teacherId && t.id === teacherId) || t.name.toLowerCase() === teacherName.toLowerCase()
            );

            if (teacherIndex !== -1) {
               const newRoster = { ...(updatedTeachers[teacherIndex].payroll?.roster || {}) };
               
               // Tarik data per hari
               Object.keys(dayIndices).forEach(day => {
                  const colIdx = dayIndices[day];
                  if (colIdx !== -1 && values[colIdx] !== undefined && values[colIdx] !== '') {
                      // Paksa menjadi angka, jika bukan angka jadikan 0
                      newRoster[day] = Math.max(0, Number(values[colIdx]) || 0);
                  }
               });

               updatedTeachers[teacherIndex] = {
                  ...updatedTeachers[teacherIndex],
                  payroll: {
                     ...(updatedTeachers[teacherIndex].payroll || {}),
                     roster: newRoster
                  }
               };
               updatedCount++;
            }
         }
      }

      setIsSaving(false);
      if (updatedCount > 0) {
        setTeachers(updatedTeachers);
        alert(`Luar Biasa! Pemetaan Roster mingguan untuk ${updatedCount} guru telah berhasil diimpor dan diperbarui secara otomatis.`);
      } else {
        alert('Tidak ada data guru yang cocok untuk diperbarui. Pastikan nama atau ID sesuai dengan sistem.');
      }
      e.target.value = null; // Reset input agar bisa import file yang sama lagi
    };
    reader.readAsText(file);
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

  // 🪄 FUNGSI BARU: Eksekusi Publikasi ke Portal Guru & Real-Time Cloud Sync
  const executePublish = async () => {
     setIsSaving(true);
     setConfirmPublish(false);
     
     const dayMap = { 0: 'minggu', 1: 'senin', 2: 'selasa', 3: 'rabu', 4: 'kamis', 5: 'jumat', 6: 'sabtu' };
     
     const updatedTeachers = teachers.map(t => {
        const roster = t.payroll?.roster || {};
        const newHarian = Array(31).fill('');
        let newRealisasi = 0;

        for (let i = 1; i <= daysInMonth; i++) {
           const date = new Date(year, month, i);
           const dayKey = dayMap[date.getDay()];
           const jam = Number(roster[dayKey]) || 0;
           
           if (jam > 0) {
              newHarian[i - 1] = jam;
              newRealisasi += jam;
           }
        }

        const tInsidentalJam = (t.payroll?.kegiatanInsidental || []).reduce((sum, item) => sum + (Number(item.jam) || 0), 0);

        return {
           ...t,
           payroll: {
              ...(t.payroll || {}),
              jamMengajar: {
                 ...(t.payroll?.jamMengajar || {}),
                 harian: newHarian,
                 realisasi: newRealisasi + tInsidentalJam
              }
           }
        };
     });

     setTeachers(updatedTeachers);
     safeStorageSet('payedu_teachers', updatedTeachers);

     try {
        await pushToSupabase('SAVE_TEACHERS', updatedTeachers);
     } catch (err) {
        console.warn("Gagal publish roster ke cloud:", err);
     }

     setIsSaving(false);
     alert("✨ BERHASIL DIPUBLIKASIKAN & DISINKRONKAN KE CLOUD! ✨\n\nPemetaan Roster dan Jam Mengajar Harian telah terbit dan otomatis terintegrasi ke menu 'Jadwal Saya' pada seluruh Portal Guru di semua perangkat.");
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

      {/* MODAL KONFIRMASI PUBLIKASI ROSTER KE PORTAL GURU */}
      {confirmPublish && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center mx-auto mb-4">
                <Send size={40} />
              </div>
              <h3 className="text-xl font-bold dark:text-white mb-2">Terapkan ke Portal Guru?</h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto text-sm">
                Pemetaan roster ini akan dipublikasikan dan otomatis terintegrasi ke menu <strong className="text-slate-700 dark:text-slate-200">"Jadwal Saya"</strong> di masing-masing portal guru. Lanjutkan?
              </p>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-center gap-3 shrink-0">
              <button onClick={() => setConfirmPublish(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors w-full">Batal</button>
              <button onClick={executePublish} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-sm transition-colors w-full flex justify-center items-center gap-2">
                <Send size={16} /> Ya, Terapkan
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
      <div className="bg-gradient-to-r from-pink-600 to-rose-500 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 text-white shadow-lg flex items-center justify-between shrink-0 relative overflow-hidden mb-3 sm:mb-5">
        <div className="relative z-10">
          <h1 className="text-lg sm:text-2xl font-bold mb-0.5 sm:mb-1 flex items-center gap-2 sm:gap-3"><CalendarDays className="text-pink-100" size={22} /> Pengaturan Jadwal Mengajar</h1>
          <p className="text-pink-50 text-xs sm:text-sm">Petakan jadwal mingguan (Roster) dan input kegiatan insidental secara massal.</p>
        </div>
        <CalendarDays size={100} className="absolute -right-6 -top-6 text-white/10 transform rotate-12 pointer-events-none hidden sm:block" />
      </div>

      <div className="flex flex-col xl:flex-row gap-6 flex-1 min-h-0">
         
         {/* TABS NAVIGASI (KIRI DI DESKTOP, ATAS DI MOBILE) */}
         <div className="w-full xl:w-64 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-row xl:flex-col overflow-x-auto xl:overflow-hidden shrink-0 hide-scrollbar">
            <button 
               onClick={() => setActiveTab('roster')}
               className={`flex-1 xl:flex-none p-2.5 sm:p-4 text-left font-bold transition-all border-b-4 xl:border-b-0 xl:border-l-4 ${activeTab === 'roster' ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-400 border-pink-500 xl:border-l-pink-500' : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
            >
               <div className="flex items-center gap-1.5 sm:gap-2 whitespace-nowrap text-xs sm:text-sm"><CalendarDays size={16}/> Pemetaan Roster</div>
               <p className="text-[10px] font-normal mt-1 opacity-80 hidden xl:block">Atur jadwal rutin mingguan guru (Senin - Minggu).</p>
            </button>
            <button 
               onClick={() => setActiveTab('insidental')}
               className={`flex-1 xl:flex-none p-2.5 sm:p-4 text-left font-bold transition-all border-b-4 xl:border-b-0 xl:border-l-4 ${activeTab === 'insidental' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border-indigo-500 xl:border-l-indigo-500' : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
            >
               <div className="flex items-center gap-1.5 sm:gap-2 whitespace-nowrap text-xs sm:text-sm"><ListPlus size={16}/> Input Massal</div>
               <p className="text-[10px] font-normal mt-1 opacity-80 hidden xl:block">Tambahkan jam kegiatan non-rutin ke banyak guru sekaligus.</p>
            </button>
            <button 
               onClick={() => setActiveTab('riwayat_massal')}
               className={`flex-1 xl:flex-none p-2.5 sm:p-4 text-left font-bold transition-all border-b-4 xl:border-b-0 xl:border-l-4 ${activeTab === 'riwayat_massal' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-500 xl:border-l-amber-500' : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
            >
               <div className="flex items-center gap-1.5 sm:gap-2 whitespace-nowrap text-xs sm:text-sm"><History size={16}/> Riwayat Kegiatan</div>
               <p className="text-[10px] font-normal mt-1 opacity-80 hidden xl:block">Edit, hapus, dan pantau riwayat kegiatan massal.</p>
            </button>
         </div>

         {/* AREA KONTEN */}
         <div className="flex-1 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col min-h-0">
            
            {activeTab === 'roster' && (
               <>
                  <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
                     <div className="relative w-full md:w-56 shrink-0">
                       <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                       <input 
                         type="text" placeholder="Cari Nama Guru..." 
                         value={search} onChange={e => setSearch(e.target.value)}
                         className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-pink-500 outline-none dark:text-white"
                       />
                     </div>
                     <div className="grid grid-cols-2 sm:flex sm:w-auto gap-1.5 w-full justify-end">
                       
                       {/* 🪄 TAMBALAN CERDAS: Tombol Impor & Ekspor Roster */}
                       <input type="file" accept=".csv, .xlsx, .xls" ref={rosterFileInputRef} onChange={handleImportRosterCSV} className="hidden" />
                       <button onClick={() => rosterFileInputRef.current?.click()} disabled={isSaving} className="justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 px-2 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1 border border-slate-300 dark:border-slate-600 disabled:opacity-70">
                         <Upload size={14} /> <span>Impor</span>
                       </button>
                       <button onClick={handleExportRosterCSV} disabled={isSaving} className="justify-center bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1 disabled:opacity-70">
                         <Download size={14} /> <span>Ekspor</span>
                       </button>

                       <button onClick={() => setConfirmPublish(true)} disabled={isSaving} className="justify-center bg-blue-600 hover:bg-blue-700 text-white px-2 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1 disabled:opacity-70">
                         {isSaving ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Send size={14} />}
                         <span>Ke Portal</span>
                       </button>
                       <button onClick={() => setConfirmGenerate(true)} disabled={isSaving} className="justify-center bg-pink-600 hover:bg-pink-700 text-white px-2 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1 disabled:opacity-70">
                         {isSaving ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <CheckSquare size={14} />}
                         <span>Ke Absen</span>
                       </button>
                     </div>
                  </div>
                  
                  {/* FITUR BARU: Tampilan Kartu Mobile Pemetaan Roster (< md) */}
                  <div className="md:hidden space-y-3 p-3 no-print">
                     {filtered.map(t => {
                        const r = t.payroll?.roster || {};
                        const totalMingguan = ['senin','selasa','rabu','kamis','jumat','sabtu','minggu'].reduce((sum, d) => sum + (Number(r[d]) || 0), 0);
                        return (
                           <div key={t.id} className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-2.5">
                              <div className="flex justify-between items-start">
                                 <div>
                                    <h4 className="font-bold text-sm text-slate-800 dark:text-white">{t.name}</h4>
                                    <div className="text-xs text-slate-500 mt-0.5">{t.nipy} • {t.position || 'Guru'}</div>
                                 </div>
                                 <span className="px-3 py-1 bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-400 rounded-full text-xs font-black">
                                    {totalMingguan} JPL/Pekan
                                 </span>
                              </div>

                              <div className="grid grid-cols-4 gap-1.5 text-xs bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700/50">
                                 {['senin','selasa','rabu','kamis','jumat','sabtu','minggu'].map(day => (
                                    <div key={day} className="flex flex-col items-center p-1 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                                       <span className="text-[9px] uppercase font-bold text-slate-400">{day.substring(0,3)}</span>
                                       <input 
                                          type="number" min="0" 
                                          value={r[day] !== undefined ? r[day] : ''} 
                                          onChange={e => handleInlineRosterChange(t.id, day, e.target.value)}
                                          className="w-full text-center bg-transparent text-xs font-bold text-slate-800 dark:text-white outline-none"
                                          placeholder="0"
                                       />
                                    </div>
                                 ))}
                              </div>
                           </div>
                        );
                     })}
                  </div>

                  <div className="hidden md:block overflow-x-auto overflow-y-auto flex-1 p-2 pb-4 touch-pan-x touch-pan-y scroll-smooth">
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
                  <div className="p-3.5 sm:p-5 md:p-6 flex-1 bg-white dark:bg-slate-800 flex flex-col h-full overflow-hidden">
                      <div className="flex items-center justify-between mb-3 sm:mb-4 shrink-0">
                         <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2 text-base sm:text-lg">
                           <History className="text-amber-500"/> <span className="hidden sm:inline">Manajemen Riwayat Kegiatan (Bulan Ini)</span><span className="sm:hidden">Riwayat Kegiatan</span>
                         </h3>
                         <span className="text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-amber-200 dark:border-amber-800 shrink-0">
                           Total: {massActivities.length}
                         </span>
                      </div>
                      
                      {/* Mobile Card Feed (< md) */}
                      <div className="md:hidden space-y-3 overflow-y-auto flex-1 pr-0.5">
                         {massActivities.map((act) => (
                            <div key={act.originalId} className="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col gap-2.5">
                               <div className="flex justify-between items-start">
                                  <div>
                                     <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 inline-block mb-1">
                                        Tgl {act.tgl}
                                     </span>
                                     <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">{act.ket}</h4>
                                  </div>
                                  <span className="text-xs font-black text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/40 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800/50 shrink-0">
                                     +{act.jam} JPL
                                  </span>
                               </div>
                               <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-700/60">
                                  <button onClick={() => setPreviewActivity(act)} className="text-xs font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 flex items-center gap-1 shadow-xs">
                                     <Eye size={13} className="text-indigo-500"/> {act.teacherNames.length} Peserta
                                  </button>
                                  <div className="flex items-center gap-1.5">
                                     <button onClick={() => setEditActivity(act)} className="p-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200 dark:border-blue-800" title="Edit Kegiatan">
                                        <Edit size={14}/>
                                     </button>
                                     <button onClick={() => setDeleteActivity(act)} className="p-1.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 rounded-lg transition-colors border border-red-200 dark:border-red-800" title="Batalkan/Hapus Kegiatan">
                                        <Trash2 size={14}/>
                                     </button>
                                  </div>
                               </div>
                            </div>
                         ))}
                         {massActivities.length === 0 && (
                            <div className="p-6 text-center text-slate-500 bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-slate-200 dark:border-slate-700 text-xs italic">
                               Belum ada kegiatan massal yang dicatat bulan ini.
                            </div>
                         )}
                      </div>

                      {/* Desktop Table (>= md) */}
                      <div className="hidden md:block overflow-x-auto overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/20 shadow-sm flex-1">
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
function GajiView({ teachers, setTeachers, externalSelectedId, setExternalSelectedId, externalSelectedTab, setExternalSelectedTab, settings, user, saveAuditLog }) {
  const [activeTabGaji, setActiveTabGaji] = useState('masaKerja');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('Semua');

  // 🪄 TAMBALAN CERDAS: State untuk Pratinjau Slip Gaji
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [isSlipModalOpen, setIsSlipModalOpen] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const bulan = getFormattedPeriod(settings?.payrollPeriod);

  // 🪄 FITUR BARU: State untuk Potongan Massal
  const [isMassPotonganOpen, setIsMassPotonganOpen] = useState(false);
  const [massForm, setMassForm] = useState({ ket: 'Potongan / Iuran Wajib', nominal: '', targetGroup: 'Semua' });
  const [excludedIds, setExcludedIds] = useState([]);
  const [massSearch, setMassSearch] = useState('');
  const [isSavingMass, setIsSavingMass] = useState(false);

  // 🪄 FITUR BARU: Menghitung daftar target potongan massal secara dinamis (Hanya Pegawai Aktif)
  const targetedTeachers = useMemo(() => {
      return teachers.filter(t => {
          if (!isTeacherActive(t)) return false;
          if (massForm.targetGroup === 'L' && t.gender !== 'L') return false;
          if (massForm.targetGroup === 'P' && t.gender !== 'P') return false;
          if (massSearch && !t.name.toLowerCase().includes(massSearch.toLowerCase()) && !t.nipy.includes(massSearch)) return false;
          return true;
      });
  }, [teachers, massForm.targetGroup, massSearch]);

  const toggleExclude = (id) => {
      setExcludedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSaveMassPotongan = (e) => {
      e.preventDefault();
      if(!massForm.ket || !massForm.nominal) return;
      setIsSavingMass(true);
      setTimeout(() => {
          let appliedCount = 0;
          setTeachers(prev => prev.map(t => {
              let match = false;
              if (massForm.targetGroup === 'Semua') match = true;
              else if (massForm.targetGroup === 'L' && t.gender === 'L') match = true;
              else if (massForm.targetGroup === 'P' && t.gender === 'P') match = true;

              // Abaikan jika masuk daftar Exception
              if (excludedIds.includes(t.id)) match = false;

              if (match) {
                  appliedCount++;
                  const p = t.payroll || {};
                  const newPot = [...(p.potonganLainnya || []), { ket: massForm.ket, nominal: Number(massForm.nominal) }];
                  
                  // Rekam jejak di Audit Log jika disetel
                  if (saveAuditLog) {
                     saveAuditLog(t, `Potongan Massal: ${massForm.ket}`, 0, Number(massForm.nominal));
                  }
                  
                  return { ...t, payroll: { ...p, potonganLainnya: newPot } };
              }
              return t;
          }));
          setIsSavingMass(false);
          setIsMassPotonganOpen(false);
          setMassForm({ ket: 'Potongan / Iuran Wajib', nominal: '', targetGroup: 'Semua' });
          setExcludedIds([]);
          setMassSearch('');
          alert(`Luar Biasa! Potongan massal "${massForm.ket}" berhasil diterapkan kepada ${appliedCount} pegawai.`);
      }, 800);
  };

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
    
    // 🪄 TAMBALAN CERDAS: Menangkap instruksi untuk membuka tab secara spesifik
    if (externalSelectedTab) {
      setActiveTabGaji(externalSelectedTab);
      if (setExternalSelectedTab) setExternalSelectedTab(null);
    }
  }, [externalSelectedId, setExternalSelectedId, externalSelectedTab, setExternalSelectedTab, teachers]);

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
    const isAct = isTeacherActive(t);
    const matchSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.nipy.includes(searchTerm);
    const matchStatus = filterStatus === 'Semua' ? isAct : (filterStatus === 'Non-Aktif' ? !isAct : (t.status === filterStatus && isAct));
    return matchSearch && matchStatus;
  });

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full relative pb-4 min-h-0">
      
      {/* 🪄 MODAL BARU: POTONGAN MASSAL DENGAN EXCEPTION LIST */}
      {isMassPotonganOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-lg dark:text-white flex items-center gap-2"><Trash className="text-red-500"/> Penerapan Potongan Massal</h3>
              <button onClick={() => setIsMassPotonganOpen(false)} className="p-2 hover:bg-slate-200 dark:bg-slate-800 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
            </div>
            
            <div className="flex flex-col md:flex-row overflow-hidden flex-1">
               {/* KIRI: Form Pengaturan Potongan */}
               <div className="w-full md:w-[45%] lg:w-1/2 p-5 lg:p-6 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-700 overflow-y-auto bg-slate-50/50 dark:bg-slate-900/20">
                  <form id="massPotonganForm" onSubmit={handleSaveMassPotongan} className="space-y-5">
                     <div className="bg-red-50 dark:bg-red-900/10 border-l-4 border-red-500 p-3 rounded-r-lg shadow-sm">
                        <p className="text-[11px] text-red-800 dark:text-red-300 font-medium leading-relaxed">Gunakan fitur ini untuk menerapkan tagihan iuran wajib, sumbangan, atau potongan lainnya ke banyak pegawai secara serentak.</p>
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Keterangan / Nama Potongan</label>
                        <input type="text" value={massForm.ket} onChange={e => setMassForm({...massForm, ket: e.target.value})} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-red-500 outline-none dark:text-white shadow-sm" required placeholder="Cth: Iuran PGRI" />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Nominal Pemotongan (Rp)</label>
                        <div className="relative">
                           <span className="absolute left-3 top-2.5 text-slate-400 font-bold">Rp</span>
                           <input type="number" min="1" value={massForm.nominal} onChange={e => setMassForm({...massForm, nominal: e.target.value})} className="w-full pl-9 pr-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm font-black text-red-600 dark:text-red-400 focus:ring-2 focus:ring-red-500 outline-none shadow-sm" required placeholder="150000" />
                        </div>
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Target Golongan</label>
                        <select value={massForm.targetGroup} onChange={e => setMassForm({...massForm, targetGroup: e.target.value})} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-red-500 outline-none dark:text-white font-bold cursor-pointer shadow-sm">
                           <option value="Semua">Semua Pegawai (Laki-laki & Perempuan)</option>
                           <option value="L">Hanya Golongan Laki-laki</option>
                           <option value="P">Hanya Golongan Perempuan</option>
                        </select>
                     </div>
                     <div className="flex items-start gap-2 pt-2">
                        <Info size={16} className="text-slate-400 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                           Sistem otomatis memfilter {targetedTeachers.length} target pegawai. Gunakan daftar di sebelah kanan untuk mengecualikan (membebaskan) guru tertentu dari pemotongan massal ini.
                        </p>
                     </div>
                  </form>
               </div>

               {/* KANAN: Daftar Pengecualian */}
               <div className="w-full md:w-[55%] lg:w-1/2 flex flex-col h-full bg-white dark:bg-slate-800 max-h-[50vh] md:max-h-full relative">
                  <div className="p-4 lg:p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/50 shrink-0 flex flex-col gap-3">
                     <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5"><Users size={16}/> Daftar Pengecualian (Exception)</h4>
                        <span className="text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 px-2.5 py-1 rounded-md border border-red-200 dark:border-red-800/50">
                           {excludedIds.length} Dikecualikan
                        </span>
                     </div>
                     <div className="relative">
                        <Search className="absolute left-3 top-2 text-slate-400" size={14} />
                        <input type="text" placeholder="Cari nama untuk dibebaskan dari potongan..." value={massSearch} onChange={e => setMassSearch(e.target.value)} className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 outline-none dark:text-white focus:ring-1 focus:ring-red-500" />
                     </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                     {targetedTeachers.map(t => {
                        const isExcluded = excludedIds.includes(t.id);
                        return (
                           // PERBAIKAN: Mengganti tag label menjadi div dan menambahkan event onClick untuk memicu checklist pengecualian
                           <div key={t.id} onClick={() => toggleExclude(t.id)} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all hover:-translate-y-0.5 ${isExcluded ? 'border-red-500 bg-red-50 dark:bg-red-900/20 shadow-sm' : 'border-slate-100 dark:border-slate-700 hover:border-red-300 dark:hover:border-red-600 bg-white dark:bg-slate-800'}`}>
                              <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border ${isExcluded ? 'bg-red-500 border-red-500 text-white' : 'border-slate-300 dark:border-slate-500 bg-slate-50 dark:bg-slate-900'}`}>
                                 {isExcluded && <CheckCircle size={14}/>}
                              </div>
                              <div className="flex-1 min-w-0">
                                 <p className={`font-bold text-sm truncate ${isExcluded ? 'text-red-700 dark:text-red-400 line-through opacity-80' : 'text-slate-800 dark:text-slate-200'}`}>{t.name}</p>
                                 <p className="text-[10px] text-slate-500">{t.position} • {t.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</p>
                              </div>
                              {isExcluded && <span className="text-[10px] font-black uppercase tracking-wider text-red-600 dark:text-red-400 mr-1">Dikecualikan</span>}
                           </div>
                        )
                     })}
                     {targetedTeachers.length === 0 && (
                        <div className="text-center py-10 opacity-60">
                           <Users size={32} className="mx-auto mb-2 text-slate-400"/>
                           <p className="text-xs font-bold text-slate-500">Tidak ada pegawai yang cocok dengan filter target.</p>
                        </div>
                     )}
                  </div>
               </div>
            </div>

            <div className="p-4 md:p-5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsMassPotonganOpen(false)} className="px-6 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-bold transition-colors text-sm">Batal</button>
              <button type="submit" form="massPotonganForm" disabled={isSavingMass || targetedTeachers.length === 0} className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-md transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-70 disabled:cursor-not-allowed">
                {isSavingMass ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Trash size={16} />}
                {isSavingMass ? 'Memproses...' : `Terapkan ke ${targetedTeachers.length - excludedIds.length} Pegawai`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🪄 TAMBALAN CERDAS: Modal Pratinjau Slip Gaji */}
      {isSlipModalOpen && selectedSlip && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-300 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-lg dark:text-white flex items-center gap-2"><FileText className="text-blue-500"/> Pratinjau Slip Gaji</h3>
              <button onClick={() => { setIsSlipModalOpen(false); setSelectedSlip(null); }} className="p-2 hover:bg-slate-200 dark:bg-slate-800 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
            </div>
            <div className="overflow-auto p-4 md:p-8 bg-slate-200 dark:bg-slate-700/50 flex-1">
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

      <div className="bg-gradient-to-r from-emerald-600 to-teal-500 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 text-white shadow-lg relative overflow-hidden flex items-center justify-between shrink-0 mb-3 sm:mb-5">
        <div className="relative z-10">
          <h1 className="text-lg sm:text-2xl font-bold mb-0.5 sm:mb-1 flex items-center gap-2 sm:gap-3"><Calculator className="text-emerald-100" size={22} /> Input Cepat Komponen Gaji</h1>
          <p className="text-emerald-50 text-xs sm:text-sm">Pilih komponen di menu kiri, lalu sesuaikan nilainya untuk semua pegawai secara berurutan di sebelah kanan.</p>
        </div>
        <Calculator size={100} className="absolute -right-6 -top-6 text-white/10 transform -rotate-12 pointer-events-none hidden sm:block" />
      </div>

      <div className="flex flex-col md:flex-row gap-6 flex-1 min-h-0">
        {/* 🪄 PERBAIKAN RESPONSIVE: Sidebar Tab Menu diubah jadi Dropdown elegan di Mobile */}
        <div className="w-full md:w-56 lg:w-64 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col shrink-0">
          
          {/* Header Sidebar Desktop */}
          <div className="p-4 font-bold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-700 hidden md:flex items-center gap-2 sticky top-0 bg-white dark:bg-slate-800 z-10 rounded-t-xl">
            <FileText size={18} className="text-emerald-500" /> Pilih Komponen
          </div>

          {/* Dropdown Khusus Mobile */}
          <div className="md:hidden p-2.5 sm:p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 rounded-t-xl">
             <label className="block text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Kategori Komponen Gaji</label>
             <div className="relative">
                <select
                   value={activeTabGaji}
                   onChange={(e) => setActiveTabGaji(e.target.value)}
                   className="w-full py-2 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 font-bold outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm appearance-none cursor-pointer text-xs sm:text-sm"
                >
                   {tabMenus.map(tab => (
                      <option key={tab.id} value={tab.id}>{tab.label}</option>
                   ))}
                </select>
                <div className="absolute right-2.5 top-2 bg-emerald-100 dark:bg-emerald-900/50 p-1 rounded pointer-events-none">
                  <ChevronDown size={14} className="text-emerald-600 dark:text-emerald-400" />
               </div>
             </div>
          </div>
          
          {/* Menu Vertikal Desktop */}
          <div className="hidden md:flex flex-col overflow-y-auto hide-scrollbar">
            {tabMenus.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTabGaji(tab.id)}
                className={`w-full flex items-center gap-3 p-4 text-left font-semibold transition-all border-l-4 ${activeTabGaji === tab.id ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-500 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5)]' : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
              >
                <tab.icon size={18} className={activeTabGaji === tab.id ? 'text-emerald-500' : 'opacity-60'} />
                <span className="text-sm">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden min-h-0">
          {/* Header Input Area */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
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
            
            {/* 🪄 TOMBOL TRIGGER POTONGAN MASSAL */}
            <div className="w-full md:w-auto flex justify-end">
               <button onClick={() => setIsMassPotonganOpen(true)} className="w-full sm:w-auto bg-red-50 hover:bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 px-4 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors focus:ring-2 focus:ring-red-500 outline-none">
                  <Trash size={16}/> Potongan Massal
               </button>
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
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex justify-between">
                              <span>Nominal Override</span>
                              {t.status !== 'Tetap' && <span className="text-amber-500 flex items-center gap-1"><Edit size={10}/> Khusus Manual</span>}
                            </label>
                            <div className="relative">
                               <span className="absolute left-3 top-2.5 text-slate-500 font-medium">Rp</span>
                               <FormattedRupiahInput 
                                 value={(p.tunjanganMasaKerjaManual !== undefined && p.tunjanganMasaKerjaManual !== '') ? p.tunjanganMasaKerjaManual : (t.status === 'Tetap' ? ((settings?.masterRates?.TENURE_RATES || TENURE_RATES)[new Date(t.tmt || new Date()).getFullYear()] || 0) : '')}
                                 onChange={val => {
                                    if (saveAuditLog) saveAuditLog(t, 'Tunjangan Masa Kerja', p.tunjanganMasaKerjaManual || 0, val);
                                    setTeachers(prev => prev.map(tc => tc.id === t.id ? { ...tc, payroll: { ...tc.payroll, tunjanganMasaKerjaManual: val } } : tc));
                                 }}
                                 className={`w-full pl-10 pr-3 py-2.5 border rounded-lg text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none transition-colors ${t.status !== 'Tetap' && (p.tunjanganMasaKerjaManual === undefined || p.tunjanganMasaKerjaManual === '') ? 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white'}`}
                                 placeholder={t.status === 'Tetap' ? '' : '0 (Default Tidak Tetap)'}
                               />
                            </div>
                          </div>

                          {t.status !== 'Tetap' && (
                             <div className="hidden lg:flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-lg border border-amber-200 dark:border-amber-800 text-xs font-medium">
                                <Info size={14} className="shrink-0"/> Non-Tetap: Isi "Override" untuk memberi tunjangan manual.
                             </div>
                          )}
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
                                <FormattedRupiahInput 
                                  value={jab.nominal} 
                                  onChange={val => handleArrayUpdate(t.id, 'jabatans', idx, 'nominal', val)} 
                                  className="w-full p-2 border rounded-lg bg-white dark:bg-slate-800 text-xs font-bold text-blue-600 dark:text-blue-400 outline-none focus:ring-1 focus:ring-emerald-500" 
                                />
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
                      t.status === 'Tetap' ? (
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
                              <FormattedRupiahInput 
                                value={(p.pendidikan?.nominalOverride !== undefined && p.pendidikan?.nominalOverride !== '' && p.pendidikan?.nominalOverride !== 0) ? p.pendidikan.nominalOverride : ((settings?.masterRates?.EDU_RATES || EDU_RATES)[t.education] || 0)}
                                onChange={val => handleUpdatePayrollObj(t.id, 'pendidikan', 'nominalOverride', val)}
                                className="w-full pl-10 pr-4 py-2.5 border rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white"
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center p-5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95">
                           <Lock className="text-slate-400 dark:text-slate-500 mr-3" size={24} />
                           <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Tunjangan Pendidikan Terkunci (Hanya Pegawai Tetap)</p>
                        </div>
                      )
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
                                <FormattedRupiahInput 
                                  value={komp.nominal} 
                                  onChange={val => handleArrayUpdate(t.id, 'kompetensi', idx, 'nominal', val)} 
                                  className="w-full p-2 border rounded-lg bg-white dark:bg-slate-800 text-xs font-bold text-amber-600 dark:text-amber-400 outline-none" 
                                />
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
                      t.status === 'Tetap' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in zoom-in-95 items-end">
                           <div>
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tarif Pasangan</label>
                              <FormattedRupiahInput 
                                value={p.keluarga?.tarifSuamiIstri !== undefined ? p.keluarga.tarifSuamiIstri : 200000} 
                                onChange={val => handleUpdatePayrollObj(t.id, 'keluarga', 'tarifSuamiIstri', val)} 
                                className="w-full p-2.5 border rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-bold dark:text-white outline-none" 
                              />
                           </div>
                           <div>
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tarif Per Anak</label>
                              <FormattedRupiahInput 
                                value={p.keluarga?.tarifAnak !== undefined ? p.keluarga.tarifAnak : 100000} 
                                onChange={val => handleUpdatePayrollObj(t.id, 'keluarga', 'tarifAnak', val)} 
                                className="w-full p-2.5 border rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-bold dark:text-white outline-none" 
                              />
                           </div>
                           <div className="lg:col-span-2 flex items-center gap-4 bg-slate-100 dark:bg-slate-700/50 p-2.5 rounded-lg border border-slate-200 dark:border-slate-600">
                              <div className="text-[10px] text-slate-500 font-bold uppercase w-24">Profil Sistem:</div>
                              <div className="flex-1 font-bold text-sm text-slate-700 dark:text-slate-200">
                                 {t.family?.wife === 1 ? 'Menikah' : t.family?.wife === 2 ? 'Menikah (Pasangan 1 Yayasan)' : 'Lajang'}, {t.family?.children || 0} Anak
                              </div>
                           </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center p-5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95">
                           <Lock className="text-slate-400 dark:text-slate-500 mr-3" size={24} />
                           <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Tunjangan Keluarga Terkunci (Hanya Pegawai Tetap)</p>
                        </div>
                      )
                    )}

                    {/* 6. DISIPLIN & MENGAJAR */}
                    {activeTabGaji === 'disiplin' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in zoom-in-95">
                         <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-800">
                            <label className="block text-[10px] font-bold text-blue-500 uppercase mb-1">Total Jam Mengajar</label>
                            <input type="number" value={p.jamMengajar?.realisasi || 0} onChange={e => handleUpdatePayrollObj(t.id, 'jamMengajar', 'realisasi', Number(e.target.value))} className="w-full p-2 border rounded-md bg-white dark:bg-slate-800 dark:text-white text-sm font-bold" />
                         </div>
                         <div className="p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-100 dark:border-red-800">
                            <label className="block text-[10px] font-bold text-red-500 uppercase mb-1">Jumlah Telat</label>
                            <input type="number" value={p.disiplin?.telat || 0} onChange={e => handleUpdatePayrollObj(t.id, 'disiplin', 'telat', Number(e.target.value))} className="w-full p-2 border rounded-md bg-white dark:bg-slate-800 dark:text-white text-sm font-bold" />
                         </div>
                         <div className="p-3 bg-emerald-50 dark:bg-emerald-900/10 rounded-lg border border-emerald-100 dark:border-emerald-800">
                            <label className="block text-[10px] font-bold text-emerald-500 uppercase mb-1">Tarif Bonus Hadir /Hr</label>
                            <FormattedRupiahInput 
                              value={p.disiplin?.tarifHadir !== undefined ? p.disiplin.tarifHadir : 1000} 
                              onChange={val => handleUpdatePayrollObj(t.id, 'disiplin', 'tarifHadir', val)} 
                              className="w-full p-2 border rounded-md bg-white dark:bg-slate-800 text-sm font-bold text-emerald-600 outline-none" 
                            />
                         </div>
                         <div className="p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-100 dark:border-amber-800">
                            <label className="block text-[10px] font-bold text-amber-500 uppercase mb-1">Denda Telat /Hr</label>
                            <FormattedRupiahInput 
                              value={p.disiplin?.tarifTelat !== undefined ? p.disiplin.tarifTelat : 1000} 
                              onChange={val => handleUpdatePayrollObj(t.id, 'disiplin', 'tarifTelat', val)} 
                              className="w-full p-2 border rounded-md bg-white dark:bg-slate-800 text-sm font-bold text-amber-600 outline-none" 
                            />
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
                                <FormattedRupiahInput 
                                  value={ins.nominal} 
                                  onChange={val => handleArrayUpdate(t.id, 'insentifTambahan', idx, 'nominal', val)} 
                                  className="w-full p-2 border border-emerald-200 rounded-lg bg-white dark:bg-slate-800 text-sm font-bold text-emerald-600 outline-none" 
                                />
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
                                <FormattedRupiahInput 
                                  value={pot.nominal} 
                                  onChange={val => handleArrayUpdate(t.id, 'potonganLainnya', idx, 'nominal', val)} 
                                  className="w-full p-2 border border-red-200 rounded-lg bg-white dark:bg-slate-800 text-sm font-bold text-red-600 outline-none" 
                                />
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
// [MODULARISASI] SlipDocument telah dimodularisasi ke src/components/SlipDocument.jsx
function RekapGajiView({ teachers, setTeachers, onEditGaji, settings, setSettings, archives, setArchives, saveAuditLog, onOpenAuditLog }) {
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
                     <div className="text-base font-black text-emerald-600 dark:text-emerald-400">{formatRp(slip.totalBersih)}</div>
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

// [MODULARISASI] ArsipView telah dimodularisasi ke src/features/admin/ArsipView.jsx
// [MODULARISASI] LaporanView telah dimodularisasi ke src/features/admin/LaporanView.jsx
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
function PortalGuruView({ user, teachers, setTeachers, settings, setSettings, feedbacks, setFeedbacks, activeSection, setActiveTab, archives, presensiGuru = [], setPresensiGuru, saveAuditLog }) {
  const handleUpdateTeacherPatch = useMemo(() => createTeacherPatchHandler(setTeachers), [setTeachers]);
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

  // 🪄 FITUR PRIVASI: Sembunyikan / Tampilkan Nominal Gaji
  const [showNominalGaji, setShowNominalGaji] = useState(true);

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

  // 🪄 FITUR BARU: Auto Trigger Verifikasi Modal Presensi saat klik Absen dari Kartu Profil
  const [autoTriggerPresensiMode, setAutoTriggerPresensiMode] = useState(null);

  // 🛡️ ANDROID HARDWARE BACK BUTTON HANDLERS FOR PORTAL GURU MODALS:
  // Menutup modal dengan mulus saat tombol Back HP ditekan, tanpa keluar dari aplikasi
  useEffect(() => {
    if (!isSlipModalOpen) return;
    return registerBackModal(() => {
      setIsSlipModalOpen(false);
      setSelectedHistorySlip(null);
    });
  }, [isSlipModalOpen]);

  useEffect(() => {
    if (!isKomplainModalOpen) return;
    return registerBackModal(() => setIsKomplainModalOpen(false));
  }, [isKomplainModalOpen]);

  // 🪄 WIDGET PRESENSI CEPAT: Live clock & kalkulasi presensi hari ini (Mendukung Sesi Pagi & Sore / Seluruh Sesi)
  const [liveNow, setLiveNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setLiveNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const liveDateStr = liveNow.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
  const liveTimeStr = liveNow.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' }).replace(/\./g, ':');
  const todayIsoDate = getLocalIsoDate(liveNow);

  const presensiSettings = settings?.presensiGuruSettings || {};
  const defaultSesiList = [
    { id: 'pagi', nama: 'Pagi (KBM)', jamMasuk: presensiSettings?.jamMasuk || '07:00', toleransiMenit: presensiSettings?.toleransiMenit ?? 15, jamPulang: presensiSettings?.jamPulang || '14:00' },
    { id: 'sore', nama: 'Sore (Halaqoh)', jamMasuk: '15:30', toleransiMenit: 15, jamPulang: '17:30' },
    { id: 'rapat', nama: 'Rapat / Kajian', jamMasuk: '13:00', toleransiMenit: 15, jamPulang: '15:00' }
  ];
  const rawSesiList = presensiSettings?.sesiList && presensiSettings.sesiList.length > 0 
    ? presensiSettings.sesiList 
    : defaultSesiList;

  // Pastikan opsi multi-sesi lengkap tersedia agar guru bisa memilih sesi Pagi, Sore, maupun Rapat
  const sesiList = rawSesiList.length === 1 && rawSesiList[0].id === 'pagi'
    ? defaultSesiList
    : rawSesiList;

  // 🎯 SMART SESSION DETECTOR (Anti-Absen Hilang di Siang/Sore Hari):
  // 1. Prioritas Tertinggi: Jika guru SUDAH absen masuk di suatu sesi hari ini tapi BELUM absen pulang (jamMasuk && !jamPulang),
  //    maka aplikasi WAJIB TETAP memilih sesi tersebut! Ini menjamin guru yang masuk pagi TETAP melihat Sesi Pagi saat ingin absen pulang di siang/sore hari.
  // 2. Jika semua sesi sudah selesai pulang atau belum absen sama sekali:
  //    - Sebelum jam 15:00 -> tetap prioritaskan Sesi Pagi (KBM utama sekolah).
  //    - Jam 15:00 ke atas -> jika ada sesi Sore/Halaqoh, barulah beralih ke Sesi Sore.
  const [selectedQuickSesiId, setSelectedQuickSesiId] = useState(() => {
    const todayStr = getLocalIsoDate(new Date());
    const myId = String(myData?.id || '').trim();
    const myCleanName = myData?.name ? String(myData.name).trim().toLowerCase().replace(/[^a-z0-9]/g, '') : '';

    const activeUnfinishedRecord = (presensiGuru || []).find(r => {
      if (!r || r.date !== todayStr) return false;
      const rId = String(r.teacherId || '').trim();
      const rClean = String(r.teacherName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const isMe = (myId && rId && rId === myId) || (myCleanName && rClean && myCleanName === rClean);
      return isMe && r.jamMasuk && !r.jamPulang;
    });

    if (activeUnfinishedRecord && activeUnfinishedRecord.sesiId) {
      return activeUnfinishedRecord.sesiId;
    }

    const currentHour = new Date().getHours();
    if (currentHour >= 15 && sesiList.some(s => s.id === 'sore' || s.nama?.toLowerCase().includes('sore') || s.nama?.toLowerCase().includes('halaqoh'))) {
      const sore = sesiList.find(s => s.id === 'sore' || s.nama?.toLowerCase().includes('sore') || s.nama?.toLowerCase().includes('halaqoh'));
      return sore ? sore.id : (sesiList[0]?.id || 'pagi');
    }
    return sesiList[0]?.id || 'pagi';
  });

  // Sinkronkan otomatis jika ada sesi aktif yang belum absen pulang
  useEffect(() => {
    if (!presensiGuru || presensiGuru.length === 0) return;
    const myId = String(myData?.id || '').trim();
    const myCleanName = myData?.name ? String(myData.name).trim().toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    const activeUnfinished = (presensiGuru || []).find(r => {
      if (!r || r.date !== todayIsoDate) return false;
      const rId = String(r.teacherId || '').trim();
      const rClean = String(r.teacherName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const isMe = (myId && rId && rId === myId) || (myCleanName && rClean && myCleanName === rClean);
      return isMe && r.jamMasuk && !r.jamPulang;
    });
    if (activeUnfinished?.sesiId) {
      setSelectedQuickSesiId(prev => {
        const curRec = (presensiGuru || []).find(r => {
          if (!r || r.date !== todayIsoDate) return false;
          const rId = String(r.teacherId || '').trim();
          const rClean = String(r.teacherName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          const isMe = (myId && rId && rId === myId) || (myCleanName && rClean && myCleanName === rClean);
          return isMe && (r.sesiId === prev || (!r.sesiId && prev === sesiList[0]?.id));
        });
        return curRec?.jamMasuk ? prev : activeUnfinished.sesiId;
      });
    }
  }, [presensiGuru, todayIsoDate, myData, sesiList]);

  const currentQuickSesi = sesiList.find(s => s.id === selectedQuickSesiId) || sesiList[0];

  const myIdStr = myData?.id != null ? String(myData.id).trim() : '';
  const myCleanNameStr = myData?.name ? String(myData.name).trim().toLowerCase().replace(/[^a-z0-9]/g, '') : '';

  const todayAttendance = (presensiGuru || []).find(r => {
    if (!r || r.date !== todayIsoDate) return false;
    const rId = r.teacherId != null ? String(r.teacherId).trim() : '';
    const rClean = r.teacherName ? String(r.teacherName).trim().toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    const isMe = (myIdStr && rId && rId === myIdStr) || (myCleanNameStr && rClean && myCleanNameStr === rClean);
    if (!isMe) return false;
    const rSesi = r.sesiId || sesiList[0]?.id;
    return rSesi === currentQuickSesi.id || (r.sesiNama && currentQuickSesi.nama && r.sesiNama.trim().toLowerCase() === currentQuickSesi.nama.trim().toLowerCase());
  });

  const sudahAbsenMasuk = !!todayAttendance?.jamMasuk;
  const sudahAbsenPulang = !!todayAttendance?.jamPulang;
  const isIzinToday = todayAttendance && ['Sakit', 'Izin', 'Cuti', 'Dinas Luar'].includes(todayAttendance.status) && !todayAttendance.jamMasuk;

  const isGpsActive = (Array.isArray(presensiSettings?.lokasiList) && presensiSettings.lokasiList.length > 0) || (presensiSettings?.lokasi?.latitude != null);
  const isQrActive = !!presensiSettings?.qrToken;
  const needVerification = isGpsActive || isQrActive;

  const handleQuickAbsenMasuk = () => {
    if (presensiSettings?.deviceLockEnabled) {
      const devCheck = verifyTeacherDevice(myData, true);
      if (!devCheck.isAllowed) {
        alert(`Presensi Ditolak! Akun Anda terdaftar pada perangkat: ${devCheck.registeredDeviceName || 'HP Terdaftar'}.\nPerangkat saat ini: ${devCheck.currentDeviceName}.\n\nDilarang titip absen dari HP lain. Jika Anda menggunakan HP yang sama tetapi berbeda browser (misal WhatsApp), silakan buka aplikasi di Google Chrome, atau hubungi Admin sekolah.`);
        return;
      }
      if (devCheck.needsEnroll || devCheck.needsUpdate) {
        handleUpdateTeacherPatch(myData.id, {
          registeredDeviceId: devCheck.currentDeviceId,
          registeredDeviceName: devCheck.currentDeviceName,
          registeredHwFingerprint: devCheck.currentHwFingerprint,
          registeredDeviceAt: new Date().toISOString()
        });
      }
    }
    if (needVerification) {
      setAutoTriggerPresensiMode('masuk');
      setActiveTab('portal_presensi');
      return;
    }
    const capture = new Date();
    const nowHHMMSS = capture.toTimeString().slice(0, 8);
    const targetMin = (Number(currentQuickSesi.jamMasuk?.split(':')[0]) || 7) * 60 + (Number(currentQuickSesi.jamMasuk?.split(':')[1]) || 0) + (Number(currentQuickSesi.toleransiMenit) || 0);
    const actualMin = capture.getHours() * 60 + capture.getMinutes();
    const terlambatMenit = Math.max(0, actualMin - targetMin);
    const status = terlambatMenit > 0 ? 'Terlambat' : 'Hadir';

    const updated = [...(presensiGuru || [])];
    const idx = updated.findIndex(r => {
      if (!r || r.date !== todayIsoDate) return false;
      const rId = r.teacherId != null ? String(r.teacherId).trim() : '';
      const rClean = r.teacherName ? String(r.teacherName).trim().toLowerCase().replace(/[^a-z0-9]/g, '') : '';
      const isMe = (myIdStr && rId && rId === myIdStr) || (myCleanNameStr && rClean && myCleanNameStr === rClean);
      if (!isMe) return false;
      const rSesi = r.sesiId || sesiList[0]?.id;
      return rSesi === currentQuickSesi.id || (r.sesiNama && currentQuickSesi.nama && r.sesiNama.trim().toLowerCase() === currentQuickSesi.nama.trim().toLowerCase());
    });
    const existingRec = idx >= 0 ? updated[idx] : null;
    const patch = {
      id: existingRec?.id || ('pg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
      teacherId: myData.id,
      teacherName: myData.name,
      date: todayIsoDate,
      sesiId: currentQuickSesi.id,
      sesiNama: currentQuickSesi.nama,
      jamMasuk: nowHHMMSS,
      jamPulang: existingRec?.jamPulang || null,
      status,
      terlambatMenit,
      keterangan: existingRec?.keterangan || '',
      updatedAt: new Date().toISOString(),
      updatedBy: myData.name || 'Guru'
    };
    if (idx >= 0) {
      updated[idx] = { ...updated[idx], ...patch };
    } else {
      updated.push(patch);
    }
    if (typeof setPresensiGuru === 'function') {
      setPresensiGuru(updated);
    }
    safeStorageSet('payedu_presensi_guru', updated);
    pushSinglePresensiRecord(patch).catch(e => console.warn('[PortalGuru] Single push error:', e));
    alert(status === 'Terlambat' ? `Absen Masuk (${currentQuickSesi.nama}) berhasil dicatat pukul ${nowHHMMSS.slice(0, 5)} (Terlambat ${terlambatMenit} menit).` : `Alhamdulillah! Absen Masuk (${currentQuickSesi.nama}) berhasil dicatat pukul ${nowHHMMSS.slice(0, 5)} — Tepat Waktu! 🎉`);
  };

  const handleQuickAbsenPulang = () => {
    if (presensiSettings?.deviceLockEnabled) {
      const devCheck = verifyTeacherDevice(myData, true);
      if (!devCheck.isAllowed) {
        alert(`Presensi Ditolak! Akun Anda terdaftar pada perangkat: ${devCheck.registeredDeviceName || 'HP Terdaftar'}.\nPerangkat saat ini: ${devCheck.currentDeviceName}.\n\nDilarang titip absen dari HP lain. Hubungi Admin jika Anda berganti HP.`);
        return;
      }
      if (devCheck.needsEnroll || devCheck.needsUpdate) {
        handleUpdateTeacherPatch(myData.id, {
          registeredDeviceId: devCheck.currentDeviceId,
          registeredDeviceName: devCheck.currentDeviceName,
          registeredHwFingerprint: devCheck.currentHwFingerprint,
          registeredDeviceAt: new Date().toISOString()
        });
      }
    }
    if (needVerification) {
      setAutoTriggerPresensiMode('pulang');
      setActiveTab('portal_presensi');
      return;
    }
    const capture = new Date();
    const nowHHMMSS = capture.toTimeString().slice(0, 8);
    const updated = [...(presensiGuru || [])];
    const idx = updated.findIndex(r => {
      if (!r || r.date !== todayIsoDate) return false;
      const rId = r.teacherId != null ? String(r.teacherId).trim() : '';
      const rClean = r.teacherName ? String(r.teacherName).trim().toLowerCase().replace(/[^a-z0-9]/g, '') : '';
      const isMe = (myIdStr && rId && rId === myIdStr) || (myCleanNameStr && rClean && myCleanNameStr === rClean);
      if (!isMe) return false;
      const rSesi = r.sesiId || sesiList[0]?.id;
      return rSesi === currentQuickSesi.id || (r.sesiNama && currentQuickSesi.nama && r.sesiNama.trim().toLowerCase() === currentQuickSesi.nama.trim().toLowerCase());
    });
    if (idx >= 0) {
      updated[idx] = { ...updated[idx], jamPulang: nowHHMMSS, updatedAt: new Date().toISOString(), updatedBy: myData.name || 'Guru' };
      if (typeof setPresensiGuru === 'function') {
        setPresensiGuru(updated);
      }
      safeStorageSet('payedu_presensi_guru', updated);
      pushSinglePresensiRecord(updated[idx]).catch(e => console.warn('[PortalGuru] Single push error:', e));
      alert(`Absen Pulang (${currentQuickSesi.nama}) berhasil dicatat pukul ${nowHHMMSS.slice(0, 5)}. Selamat beristirahat!`);
    }
  };

  // 🪄 TAMBALAN CERDAS MUTLAK: State Loading Konfirmasi & Kirim Pesan
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);

  // 🪄 FITUR BARU: State & Handler Mandiri Edit Biodata Guru
  const [isEditBiodataOpen, setIsEditBiodataOpen] = useState(false);
  const [savedBioAccount, setSavedBioAccount] = useState(() => getSavedBiometricAccount());
  const [isBioSupported, setIsBioSupported] = useState(false);
  const [isEnrollingBio, setIsEnrollingBio] = useState(false);

  useEffect(() => {
    isBiometricSupported().then(supported => {
      setIsBioSupported(supported);
      if (supported) {
        setSavedBioAccount(getSavedBiometricAccount());
      }
    });
  }, []);

  const handleRegisterBiometric = async () => {
    setIsEnrollingBio(true);
    try {
      const bioData = await registerBiometricLogin({
        id: myData.id,
        name: myData.name,
        username: myData.linkedUsername || myData.id,
        role: 'guru',
        nipy: myData.nipy
      });
      setSavedBioAccount(bioData);
      alert('Alhamdulillah! Sidik Jari Anda berhasil terdaftar di HP ini.\n\nMulai sekarang Anda bisa masuk ke PayEdu tanpa perlu mengetik kata sandi.');
    } catch (err) {
      console.warn("Gagal daftarkan biometrik:", err);
      alert(err.message || 'Pendaftaran sidik jari dibatalkan.');
    } finally {
      setIsEnrollingBio(false);
    }
  };

  const handleUnlinkBiometric = () => {
    if (confirm('Lepaskan hubungan sidik jari dari HP ini?')) {
      removeBiometricAccount();
      setSavedBioAccount(null);
      alert('Kredensial sidik jari berhasil dilepas dari perangkat ini.');
    }
  };
  useEffect(() => {
    if (!isEditBiodataOpen) return;
    return registerBackModal(() => setIsEditBiodataOpen(false));
  }, [isEditBiodataOpen]);
  const [isSavingBiodata, setIsSavingBiodata] = useState(false);
  const [biodataForm, setBiodataForm] = useState({
     name: '', pob: '', dob: '', phone: '', address: '', education: 'S1', bankName: '', bankAccount: ''
  });

  const handleOpenEditBiodata = () => {
     setBiodataForm({
        name: myData.name || '',
        pob: myData.pob || '',
        dob: formatToInputDate(myData.dob) || '',
        phone: myData.phone || '',
        address: myData.address || '',
        education: myData.education || 'S1',
        bankName: myData.bankName || '',
        bankAccount: myData.bankAccount || '',
     });
     setIsEditBiodataOpen(true);
  };

  const handleSaveBiodata = async (e) => {
     e.preventDefault();
     setIsSavingBiodata(true);

     const updatedTeachers = teachers.map(t => {
        if (t.id === myData.id) {
           return {
              ...t,
              name: biodataForm.name,
              pob: biodataForm.pob,
              dob: biodataForm.dob,
              phone: biodataForm.phone,
              address: biodataForm.address,
              education: biodataForm.education,
              bankName: biodataForm.bankName,
              bankAccount: biodataForm.bankAccount
           };
        }
        return t;
     });

     setTeachers(updatedTeachers);

     try {
        safeStorageSet('payedu_teachers', updatedTeachers);
        await pushToSupabase('SAVE_TEACHERS', updatedTeachers);
        alert('Alhamdulillah! Biodata Anda berhasil diperbarui dan tersimpan langsung ke sistem sekolah.');
        setIsEditBiodataOpen(false);
     } catch (err) {
        alert('Gagal menyimpan ke server. Pastikan koneksi internet aktif.');
     } finally {
        setIsSavingBiodata(false);
     }
  };

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

  // 🪄 PERBAIKAN UX: Push Mutlak Saran ke Server
  const handleSendFeedback = async (e) => {
    e.preventDefault();
    if (!feedbackMsg.trim()) return;
    setIsSendingFeedback(true);
    
    const newFeedback = {
      id: generateUniqueId('fb-'),
      name: myData.name,
      date: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
      subject: feedbackSubject,
      message: feedbackMsg,
      status: 'Menunggu'
    };
    
    const updatedFeedbacks = [newFeedback, ...(feedbacks || [])];
    setFeedbacks(updatedFeedbacks);
    
    try {
       // Tembak langsung ke awan tanpa menunggu debounce App.jsx
       safeStorageSet('payedu_feedbacks', updatedFeedbacks);
       await pushToSupabase('SAVE_FEEDBACKS', updatedFeedbacks);
       
       alert('Terima kasih! Kritik dan saran Anda telah berhasil dikirim ke pihak manajemen sekolah.');
       setFeedbackMsg('');
       setFeedbackSubject('Saran & Masukan Umum');
    } catch(err) {
       alert('Gagal mengirim ke server. Periksa koneksi internet Anda.');
    } finally {
       setIsSendingFeedback(false);
    }
  };

  // 🪄 PERBAIKAN UX MUTLAK: Gamifikasi Konfeti saat Konfirmasi Gaji & Bypass Auto-Save
  const handleKonfirmasi = async () => {
    setIsConfirming(true);
    const updatedTeachers = teachers.map(t => 
      t.id === user.id ? { ...t, payroll: { ...t.payroll, isConfirmed: true } } : t
    );
    
    // Update state UI seketika
    setTeachers(updatedTeachers);
    
    try {
       // PAKSA TEMBAK KE SERVER (BYPASS DEBOUNCE 2 DETIK)
       safeStorageSet('payedu_teachers', updatedTeachers);
       await pushToSupabase('SAVE_TEACHERS', updatedTeachers);

       // Memicu selebrasi
       setShowCelebration(true);
       
       // Menghilangkan selebrasi setelah 5 detik
       setTimeout(() => {
          setShowCelebration(false);
       }, 5000);
    } catch(e) {
       console.error("Gagal simpan konfirmasi:", e);
       alert("Koneksi tidak stabil. Konfirmasi Anda mungkin belum masuk ke server.");
    } finally {
       setIsConfirming(false);
    }
  };

  const handleKomplain = () => {
    // Membuka modal khusus komplain daripada menggunakan prompt()
    setIsKomplainModalOpen(true);
  };

  // URL WhatsApp Generator
  const waNumber = '628565011130'; 
  const waMessage = `Assalamu'alaikum Bendahara,\n\nSaya *${myData.name}* (NIPY: ${myData.nipy}).\nSaya ingin mengajukan pertanyaan/komplain terkait selisih gaji pada periode *${bulan}*.\n\nKeterangan Komplain:\n"${komplainText}"\n\nMohon bantuannya untuk dicek kembali. Terima kasih.`;
  const waUrl = `https://api.whatsapp.com/send?phone=${waNumber}&text=${encodeURIComponent(waMessage)}`;

  // PERBAIKAN KRUSIAL: Mengekstrak Data Riwayat dari Arsip Asli (Bukan Dummy) dengan Perisai Data
  const riwayatAsli = useMemo(() => {
    if (!archives || !Array.isArray(archives)) return [];
    
    const myTmtMonth = myData.tmt ? formatToInputDate(myData.tmt).substring(0, 7) : '';

    // Map data dari archives global
    const extractedHistory = archives.map(arc => {
      const arcPeriod = (arc?.periode || arc?.period || '').substring(0, 7);

      // Jika TMT guru setelah periode arsip ini, guru belum bekerja di bulan tersebut
      if (myTmtMonth && arcPeriod && arcPeriod < myTmtMonth) {
        return null;
      }

      // Cari data guru ini pada saat arsip tersebut dibuat (cocokkan ID & Nama)
      const historicalData = (arc?.dataGuru || []).find(t => 
        String(t.id) === String(myData.id) && 
        (!t.name || !myData.name || t.name.trim().toLowerCase() === myData.name.trim().toLowerCase())
      );
      if (!historicalData) return null;

      return {
        idArsip: arc.id,
        periode: arc.periode || arc.period,
        tanggal: arc.dateArchived || arc.updated_at,
        nominal: calculatePayroll(historicalData, settings).totalBersih,
        status: 'Telah Disahkan',
        dataHistoris: historicalData
      };
    }).filter(Boolean);

    return extractedHistory;
  }, [archives, myData.id, myData.name, myData.tmt]);

  // Ekstraksi Data Pinjaman Guru
  const loanItems = (myData.payroll?.potonganLainnya || []).filter(p => 
    p.ket.toLowerCase().includes('kasbon') || 
    p.ket.toLowerCase().includes('koperasi') || 
    p.ket.toLowerCase().includes('pinjaman')
  );

  const totalSisaHutang = useMemo(() => {
    return loanItems.reduce((acc, loan) => {
      const sisa = loan.sisaHutang !== undefined ? Number(loan.sisaHutang) : (Number(loan.nominal) * 4);
      return acc + (isNaN(sisa) ? 0 : sisa);
    }, 0);
  }, [loanItems]);

  const totalCicilanBulanan = useMemo(() => {
    return loanItems.reduce((acc, loan) => {
      const nom = Number(loan.nominal) || 0;
      return acc + nom;
    }, 0);
  }, [loanItems]);

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
  const NotificationBell = (settings?.payrollStatus === 'Approved' || myData.payroll?.isNotified) && !myData.payroll?.isConfirmed ? (
    <button 
      onClick={() => setActiveTab('portal_gaji')} 
      className="absolute top-3 right-3 sm:top-4 sm:right-4 md:top-6 md:right-6 w-9 h-9 sm:w-12 sm:h-12 md:w-14 md:h-14 bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 rounded-full shadow-[0_8px_16px_-6px_rgba(245,158,11,0.8)] flex items-center justify-center animate-bounce border-2 border-white/50 z-30 hover:scale-110 transition-transform cursor-pointer"
      title="Notifikasi Gaji Baru! Mohon Konfirmasi Kesesuaian."
    >
      <div className="absolute inset-0 rounded-full shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)]"></div>
      <BellRing size={18} className="text-white drop-shadow-lg relative z-10 sm:hidden" />
      <BellRing size={24} className="text-white drop-shadow-lg relative z-10 hidden sm:block" />
      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
    </button>
  ) : null;

  // 🪄 KONFIGURASI MENU BOTTOM NAVIGATION (ANDROID STYLE)
  const bottomNavItems = [
    { id: 'portal_presensi', label: 'Presensi', icon: Fingerprint },
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

      {/* 🪄 MODAL BARU: Edit Biodata Mandiri Guru */}
      {isEditBiodataOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[100] flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-700">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-base sm:text-lg dark:text-white flex items-center gap-2">
                <Edit className="text-blue-500" /> Perbarui Biodata Mandiri Saya
              </h3>
              <button onClick={() => setIsEditBiodataOpen(false)} className="p-1.5 hover:bg-slate-200 dark:bg-slate-700 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
            </div>
            
            <div className="p-4 sm:p-6 overflow-y-auto max-h-[70vh]">
               <form id="editBiodataForm" onSubmit={handleSaveBiodata} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Nama Lengkap & Gelar</label>
                    <input 
                      type="text"
                      value={biodataForm.name} 
                      onChange={e => setBiodataForm({...biodataForm, name: e.target.value})}
                      className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Tempat Lahir</label>
                      <input 
                        type="text"
                        value={biodataForm.pob} 
                        onChange={e => setBiodataForm({...biodataForm, pob: e.target.value})}
                        className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                        placeholder="Cth: Pekanbaru"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Tanggal Lahir</label>
                      <input 
                        type="date"
                        value={biodataForm.dob} 
                        onChange={e => setBiodataForm({...biodataForm, dob: e.target.value})}
                        className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">No. WhatsApp / HP</label>
                      <input 
                        type="text"
                        value={biodataForm.phone} 
                        onChange={e => setBiodataForm({...biodataForm, phone: e.target.value})}
                        className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                        placeholder="0812xxxxxxxx"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Pendidikan Terakhir</label>
                      <select 
                        value={biodataForm.education} 
                        onChange={e => setBiodataForm({...biodataForm, education: e.target.value})}
                        className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-white font-bold"
                      >
                        <option value="S2">S2</option>
                        <option value="S1">S1</option>
                        <option value="Diploma">Diploma</option>
                        <option value="SMA/Pondok">SMA/Pondok</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Alamat Tempat Tinggal</label>
                    <textarea 
                      rows="2"
                      value={biodataForm.address} 
                      onChange={e => setBiodataForm({...biodataForm, address: e.target.value})}
                      className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-white resize-none"
                      placeholder="Alamat lengkap rumah..."
                    />
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                    <h4 className="font-bold text-sm dark:text-white mb-3 text-emerald-600 flex items-center gap-1.5"><CreditCard size={16}/> Informasi Rekening Bank Penggajian</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Nama Bank</label>
                        <input 
                          type="text"
                          value={biodataForm.bankName} 
                          onChange={e => setBiodataForm({...biodataForm, bankName: e.target.value})}
                          className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white"
                          placeholder="Cth: Bank Riau Kepri / BSI / BCA"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Nomor Rekening</label>
                        <input 
                          type="text"
                          value={biodataForm.bankAccount} 
                          onChange={e => setBiodataForm({...biodataForm, bankAccount: e.target.value})}
                          className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-mono font-bold focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white"
                          placeholder="1234567890"
                        />
                      </div>
                    </div>
                  </div>
               </form>
            </div>
            
            <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex flex-col-reverse sm:flex-row justify-end gap-2.5 shrink-0">
              <button type="button" onClick={() => setIsEditBiodataOpen(false)} className="w-full sm:w-auto px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-colors text-sm text-center cursor-pointer">Batal</button>
              <button type="submit" form="editBiodataForm" disabled={isSavingBiodata} className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-70 cursor-pointer">
                {isSavingBiodata ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={16} />}
                {isSavingBiodata ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Komplain WA */}
      {isKomplainModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[100] flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-700">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-base sm:text-lg dark:text-white flex items-center gap-2"><MessageSquare className="text-emerald-500"/> Komplain Selisih Gaji</h3>
              <button onClick={() => setIsKomplainModalOpen(false)} className="p-1.5 hover:bg-slate-200 dark:bg-slate-700 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
            </div>
            <div className="p-4 sm:p-6">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Silakan tuliskan detail perbedaan nominal yang Anda temukan. Sistem akan mengarahkan Anda ke WhatsApp Bendahara secara otomatis.</p>
              <textarea 
                rows="4" 
                value={komplainText}
                onChange={e => setKomplainText(e.target.value)}
                placeholder="Cth: Nominal tunjangan masa kerja saya sepertinya belum disesuaikan..."
                className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white resize-none"
              ></textarea>
            </div>
            <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex flex-col-reverse sm:flex-row justify-end gap-2.5 shrink-0">
              <button onClick={() => setIsKomplainModalOpen(false)} className="w-full sm:w-auto px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-colors text-sm text-center">Batal</button>
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
                className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-bold shadow-md transition-colors flex items-center justify-center gap-2 ${komplainText.trim() ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'}`}
              >
                <Send size={16} /> Lanjut ke WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Modal Slip Gaji */}
      {isSlipModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex items-center justify-center p-2 sm:p-4">
          <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl h-[92vh] max-h-[92vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-700">
            <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-900 shrink-0">
              <h3 className="font-bold text-sm sm:text-base dark:text-white flex items-center gap-2">
                <FileText className="text-blue-500" size={18} /> Pratinjau Lembar Slip Gaji Resmi
              </h3>
              <button 
                onClick={() => { setIsSlipModalOpen(false); setSelectedHistorySlip(null); }} 
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                title="Tutup (Esc / Back)"
              >
                <X size={18}/>
              </button>
            </div>
            
            <div className="overflow-y-auto overflow-x-auto p-2 sm:p-4 md:p-6 bg-slate-200 dark:bg-slate-700/50 flex-1 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
              {/* Petunjuk khusus pengguna ponsel */}
              <div className="md:hidden mb-2.5 px-3 py-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 text-xs font-bold rounded-xl border border-emerald-200 dark:border-emerald-800/60 flex items-center gap-2 shadow-xs">
                <span className="text-base">💡</span>
                <span>Lembar cetak resmi A4: Anda dapat menggeser ke bawah &amp; ke samping, atau klik <b>Unduh PDF</b>.</span>
              </div>
              <div className="min-w-fit flex justify-center pb-10">
                {selectedHistorySlip ? (
                   <SlipDocument teacher={selectedHistorySlip.dataHistoris} bulan={selectedHistorySlip.periode} settings={settings} />
                ) : (
                   <SlipDocument teacher={myData} bulan={bulan} settings={settings} />
                )}
              </div>
            </div>

            <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-wrap sm:flex-nowrap justify-between sm:justify-end gap-2 shrink-0">
              <button 
                onClick={() => window.print()} 
                className="flex-1 sm:flex-initial bg-slate-700 hover:bg-slate-800 text-white px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <Printer size={16}/> Print
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
                className="flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-700 text-white px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 shadow-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
              >
                {isExportingPDF ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Download size={16}/>}
                {isExportingPDF ? 'Memproses...' : 'Unduh PDF'}
              </button>
              <button 
                onClick={() => { setIsSlipModalOpen(false); setSelectedHistorySlip(null); }} 
                className="w-full sm:w-auto px-4 py-2 sm:py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Banner Dinamis Berdasarkan Tab Aktif */}
      {/* DIPERBARUI: Header "portal_dashboard" & "portal_presensi" digabung ke dalam Card di bawahnya agar tidak ganda */}

      {/* Header Banner Portal Jadwal (Responsive & Mobile Ergonomic) */}
      {activeSection === 'portal_jadwal' && (
        <div className="bg-gradient-to-br from-pink-600 via-rose-600 to-rose-700 rounded-2xl p-4 sm:p-6 text-white shadow-lg relative overflow-hidden flex items-center justify-between shrink-0 animate-in fade-in duration-300 border border-pink-400/30">
          {NotificationBell}
          <div className="relative z-10 pr-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-2 border border-white/20 shadow-xs">
              <CalendarDays size={11} className="text-pink-100" />
              <span>Roster Rutin &amp; Pemetaan</span>
            </div>
            <h1 className="text-base sm:text-xl md:text-2xl font-black tracking-tight flex items-center gap-2">
              <CalendarDays className="text-pink-100 shrink-0" size={20} /> Jadwal Mengajar &amp; Penugasan
            </h1>
            <p className="text-pink-100/90 text-[11px] sm:text-xs md:text-sm mt-1 max-w-lg line-clamp-2">
              Pantau jadwal rutin mingguan (Roster) dan rincian alokasi jam mengajar harian Anda secara transparan.
            </p>
          </div>
          <CalendarDays size={80} className="absolute -right-3 -bottom-3 text-white/10 transform rotate-12 pointer-events-none" />
        </div>
      )}

      {/* Header Banner Portal Kehadiran (Responsive & Mobile Ergonomic) */}
      {activeSection === 'portal_kehadiran' && (
        <div className="bg-gradient-to-br from-amber-500 via-amber-600 to-orange-600 rounded-2xl p-4 sm:p-6 text-white shadow-lg relative overflow-hidden flex items-center justify-between shrink-0 animate-in fade-in duration-300 border border-amber-400/30">
          {NotificationBell}
          <div className="relative z-10 pr-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-2 border border-white/20 shadow-xs">
              <Calendar size={11} className="text-amber-100" />
              <span>Periode: {bulan}</span>
            </div>
            <h1 className="text-base sm:text-xl md:text-2xl font-black tracking-tight flex items-center gap-2">
              <Clock className="text-amber-100 shrink-0" size={20} /> Rekap Kehadiran &amp; Jam Mengajar
            </h1>
            <p className="text-amber-100/90 text-[11px] sm:text-xs md:text-sm mt-1 max-w-lg line-clamp-2">
              Detail kehadiran harian, ketepatan waktu, dan pencapaian target jam mengajar Anda bulan ini.
            </p>
          </div>
          <Clock size={80} className="absolute -right-3 -bottom-3 text-white/10 transform -rotate-12 pointer-events-none" />
        </div>
      )}

      {activeSection === 'portal_gaji' && (
        <div className="bg-gradient-to-r from-emerald-600 to-teal-500 rounded-2xl p-4 sm:p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between shrink-0 animate-in fade-in duration-500">
          {NotificationBell}
          <div className="relative z-10 pr-2">
            <h1 className="text-lg sm:text-2xl md:text-3xl font-black mb-1 sm:mb-2 flex items-center gap-2 sm:gap-3"><Wallet className="text-emerald-100 shrink-0" size={24} /> Slip Gaji & Estimasi THP ({bulan})</h1>
            <p className="text-emerald-50 text-xs sm:text-sm md:text-base max-w-xl line-clamp-2 sm:line-clamp-none">Transparansi rincian tunjangan, insentif, dan potongan gaji Anda pada periode pencairan ini.</p>
          </div>
          <Wallet size={90} className="absolute -right-4 -bottom-4 text-white/10 transform -rotate-12 pointer-events-none" />
        </div>
      )}

      {activeSection === 'portal_pinjaman' && (
        <div className="bg-gradient-to-r from-teal-600 to-emerald-500 rounded-2xl p-4 sm:p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between shrink-0 animate-in fade-in duration-500">
          {NotificationBell}
          <div className="relative z-10 pr-2">
            <h1 className="text-lg sm:text-2xl md:text-3xl font-black mb-1 sm:mb-2 flex items-center gap-2 sm:gap-3"><CreditCard className="text-teal-100 shrink-0" size={24} /> Dashboard Pemantauan Pinjaman</h1>
            <p className="text-teal-50 text-xs sm:text-sm md:text-base max-w-xl line-clamp-2 sm:line-clamp-none">Pantau transparansi sisa saldo pinjaman, kasbon, atau cicilan koperasi Anda secara detail dan real-time.</p>
          </div>
          <CreditCard size={90} className="absolute -right-4 -bottom-4 text-white/10 transform -rotate-12 pointer-events-none" />
        </div>
      )}

      {/* Header Banner Portal Riwayat Gaji (Responsive & Mobile Ergonomic) */}
      {activeSection === 'portal_riwayat' && (
        <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-blue-700 rounded-2xl p-4 sm:p-6 text-white shadow-lg relative overflow-hidden flex items-center justify-between shrink-0 animate-in fade-in duration-300 border border-indigo-400/30">
          {NotificationBell}
          <div className="relative z-10 pr-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-2 border border-white/20 shadow-xs">
              <History size={11} className="text-indigo-100" />
              <span>Arsip Slip Resmi</span>
            </div>
            <h1 className="text-base sm:text-xl md:text-2xl font-black tracking-tight flex items-center gap-2">
              <History className="text-indigo-100 shrink-0" size={20} /> Riwayat Penerimaan Gaji
            </h1>
            <p className="text-indigo-100/90 text-[11px] sm:text-xs md:text-sm mt-1 max-w-lg line-clamp-2">
              Arsip dokumen slip gaji bulan-bulan sebelumnya yang telah disahkan dan ditransfer kepada Anda.
            </p>
          </div>
          <History size={80} className="absolute -right-3 -bottom-3 text-white/10 transform -rotate-12 pointer-events-none" />
        </div>
      )}

      {activeSection === 'portal_info' && (
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl p-4 sm:p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between shrink-0 animate-in fade-in duration-500">
          {NotificationBell}
          <div className="relative z-10 pr-2">
            <h1 className="text-lg sm:text-2xl md:text-3xl font-black mb-1 sm:mb-2 flex items-center gap-2 sm:gap-3"><Info className="text-purple-100 shrink-0" size={24} /> Informasi Sistem Penggajian</h1>
            <p className="text-purple-50 text-xs sm:text-sm md:text-base max-w-xl line-clamp-2 sm:line-clamp-none">Pelajari pedoman, aturan kedisiplinan, dan rincian kebijakan komponen perhitungan sistem penggajian.</p>
          </div>
          <Info size={90} className="absolute -right-4 -bottom-4 text-white/10 transform rotate-12 pointer-events-none" />
        </div>
      )}

      {activeSection === 'portal_saran' && (
        <div className="bg-gradient-to-r from-rose-600 to-red-500 rounded-2xl p-4 sm:p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between shrink-0 animate-in fade-in duration-500">
          {NotificationBell}
          <div className="relative z-10 pr-2">
            <h1 className="text-lg sm:text-2xl md:text-3xl font-black mb-1 sm:mb-2 flex items-center gap-2 sm:gap-3"><MessageSquare className="text-rose-100 shrink-0" size={24} /> Form Kritik & Saran</h1>
            <p className="text-rose-50 text-xs sm:text-sm md:text-base max-w-xl line-clamp-2 sm:line-clamp-none">Sampaikan masukan, aspirasi, atau kendala Anda secara langsung dan aman ke pihak manajemen sekolah.</p>
          </div>
          <MessageSquare size={90} className="absolute -right-4 -bottom-4 text-white/10 transform -rotate-12 pointer-events-none" />
        </div>
      )}

      <div className="space-y-4">
        
        {/* 1. Biodata Guru (DIPERBARUI: Tanpa Card Wrapper, Desain Premium) */}
        {activeSection === 'portal_dashboard' && (
          <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-200 dark:border-slate-700 overflow-hidden shadow-lg relative animate-in fade-in slide-in-from-bottom-4 duration-500">
             
             {/* Banner Cover Profile (DIPERBARUI: Desain Terpadu) */}
             <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 relative pt-6 pb-7 sm:pt-10 sm:pb-12 md:pt-14 md:pb-16 px-4 sm:px-6 md:px-10 flex flex-col md:flex-row items-center gap-4 sm:gap-6 md:gap-8 text-center md:text-left">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 mix-blend-overlay"></div>
                
                {/* Lonceng Notifikasi */}
                {NotificationBell}

                {/* Avatar */}
                <div className="w-20 h-20 sm:w-28 sm:h-28 md:w-36 md:h-36 rounded-full border-4 border-white/30 shadow-2xl bg-white/10 backdrop-blur-sm overflow-hidden shrink-0 relative z-10 transition-transform hover:scale-105 duration-300">
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
                   <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-white tracking-tight drop-shadow-md mb-1.5">{myData.name}</h2>
                   <div className="flex flex-wrap items-center justify-center md:justify-start gap-1.5 sm:gap-2 text-blue-100 font-medium text-xs sm:text-sm">
                      <span className="flex items-center gap-1 bg-black/20 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full border border-white/10 shadow-sm"><Briefcase size={12}/> {myData.position}</span>
                      <span className="flex items-center gap-1 bg-black/20 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full border border-white/10 shadow-sm"><CheckCircle size={12}/> Guru {myData.status}</span>
                      <span className="flex items-center gap-1 bg-black/20 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full border border-white/10 shadow-sm font-mono text-[11px] sm:text-xs">{myData.nipy}</span>
                   </div>
                </div>
                
                {/* Aksen transisi di bagian bawah banner */}
                <div className="absolute -bottom-1 -left-1 -right-1 h-8 sm:h-12 bg-gradient-to-t from-white dark:from-slate-800 to-transparent pointer-events-none z-10"></div>
             </div>

              <div className="px-3.5 sm:px-6 md:px-8 pb-6 pt-5 sm:pt-7 md:pb-10 relative">
                  
                  {/* 🪄 WIDGET PRESENSI CEPAT GURU (KOMPAK, RAPI & ERGONOMIS) */}
                  {(() => {
                     const currentTheme = getSesiTheme(currentQuickSesi);
                     const currentHourMin = liveTimeStr ? liveTimeStr.slice(0, 5) : '';
                     const jamPulangTarget = currentQuickSesi.jamPulang || '14:00';
                     const isWaktuPulangTiba = currentHourMin >= jamPulangTarget;

                     return (
                        <div className={`mb-6 rounded-3xl p-4 sm:p-5 shadow-sm relative overflow-hidden backdrop-blur-sm transition-all duration-300 border ${
                           currentTheme.type === 'sore'
                              ? 'bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-violet-500/10 dark:from-indigo-950/40 dark:via-slate-800/60 dark:to-purple-950/40 border-purple-200/80 dark:border-purple-800/60'
                              : currentTheme.type === 'rapat'
                              ? 'bg-gradient-to-br from-rose-500/10 via-pink-500/5 to-rose-500/10 dark:from-rose-950/40 dark:via-slate-800/60 dark:to-pink-950/40 border-rose-200/80 dark:border-rose-800/60'
                              : 'bg-gradient-to-br from-teal-500/10 via-emerald-500/5 to-cyan-500/10 dark:from-teal-950/40 dark:via-slate-800/60 dark:to-emerald-950/40 border-teal-200/80 dark:border-teal-800/60'
                        }`}>
                           <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>

                           {/* 1. BARIS HEADER: SESI SELECTOR, TANGGAL & JAM REALTIME, CLOUD BADGE */}
                           <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-200/70 dark:border-slate-700/60 relative z-10">
                              {/* Pilihan Sesi (Pagi, Sore/Halaqoh, Rapat) */}
                              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                 <span className="text-[11px] sm:text-xs font-black text-slate-700 dark:text-slate-200 flex items-center gap-1 uppercase tracking-wider">
                                    <Clock3 size={13} className={currentTheme.type === 'sore' ? 'text-purple-600' : currentTheme.type === 'rapat' ? 'text-rose-600' : 'text-teal-600'} />
                                    Presensi:
                                 </span>
                                 <div className="flex items-center gap-1 bg-white/90 dark:bg-slate-900/80 p-0.5 sm:p-1 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-2xs overflow-x-auto hide-scrollbar max-w-full">
                                    {sesiList.map(s => {
                                       const isSel = s.id === currentQuickSesi.id;
                                       const theme = getSesiTheme(s);
                                       const sRec = (presensiGuru || []).find(r => 
                                          (r.teacherId === myData.id || (r.teacherName && myData.name && r.teacherName.trim().toLowerCase() === myData.name.trim().toLowerCase())) && 
                                          r.date === todayIsoDate && 
                                          (r.sesiId === s.id || (!r.sesiId && s.id === sesiList[0]?.id))
                                       );
                                       const isDone = !!sRec?.jamMasuk;
                                       const namaSingkat = s.nama ? s.nama.split(' ')[0] : 'Sesi';
                                       return (
                                          <button
                                             key={s.id}
                                             type="button"
                                             onClick={() => setSelectedQuickSesiId(s.id)}
                                             className={`px-2 py-1 sm:px-2.5 sm:py-1 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0 ${
                                                isSel 
                                                   ? `${theme.bgActive} shadow-xs scale-102` 
                                                   : `${theme.bgInactive}`
                                             }`}
                                          >
                                             <span className="text-[11px]">{theme.iconEmoji}</span>
                                             <span className="sm:inline hidden">{s.nama}</span>
                                             <span className="sm:hidden inline">{namaSingkat}</span>
                                             {isDone && <span className={`w-1.5 h-1.5 rounded-full ${sRec?.jamPulang ? 'bg-indigo-300' : theme.dotPulse}`}></span>}
                                          </button>
                                       );
                                    })}
                                 </div>
                              </div>

                              {/* Jam Realtime & Tanggal & Cloud Badge */}
                              <div className="flex items-center justify-between sm:justify-end gap-2 text-xs">
                                 <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">
                                    {liveDateStr}
                                 </span>
                                 <div className="flex items-center gap-1.5 shrink-0">
                                    <div className={`font-mono text-sm sm:text-base font-black tracking-tight ${
                                       currentTheme.type === 'sore'
                                          ? 'text-purple-700 dark:text-purple-300'
                                          : currentTheme.type === 'rapat'
                                          ? 'text-rose-700 dark:text-rose-300'
                                          : 'text-teal-700 dark:text-teal-300'
                                    }`}>
                                       {liveTimeStr} <span className="text-[9px] font-sans font-bold text-slate-400">WIB</span>
                                    </div>
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-100/90 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 font-black text-[9px] border border-emerald-300/80 dark:border-emerald-800/70" title="Data presensi tersimpan permanen di Cloud Database">
                                       <Cloud size={9} className="text-emerald-600 dark:text-emerald-400" /> Cloud
                                    </span>
                                 </div>
                              </div>
                           </div>

                           {/* 2. PENGINGAT RINGKAS (SLIM INLINE BANNER - RAMPING & TIDAK MENUMPUK) */}
                           <div className="pt-2.5 pb-1 relative z-10">
                              {!sudahAbsenMasuk && !isIzinToday ? (
                                 <div className="px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-300 dark:border-amber-700/60 flex items-center justify-between gap-2 text-xs">
                                    <div className="flex items-center gap-2 min-w-0">
                                       <BellRing size={15} className="text-amber-600 dark:text-amber-400 shrink-0 animate-bounce" />
                                       <p className="text-amber-900 dark:text-amber-200 font-bold truncate">
                                          Pengingat: Belum Absen Masuk Sesi <b>{currentQuickSesi.nama}</b> (Batas: {currentQuickSesi.jamMasuk || '07:00'} WIB)
                                       </p>
                                    </div>
                                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-500 text-white shrink-0">Wajib Masuk</span>
                                 </div>
                              ) : sudahAbsenMasuk && !sudahAbsenPulang ? (
                                 <div className={`px-3.5 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                                    isWaktuPulangTiba 
                                       ? 'bg-blue-500/15 border-blue-400 dark:border-blue-700/70' 
                                       : 'bg-teal-500/10 border-teal-200 dark:border-teal-800/40'
                                 }`}>
                                    <div className="flex items-center gap-2 min-w-0">
                                       <LogOut size={15} className={`${isWaktuPulangTiba ? 'text-blue-600 dark:text-blue-400 animate-pulse' : 'text-teal-600 dark:text-teal-400'} shrink-0`} />
                                       <p className={`font-bold truncate ${isWaktuPulangTiba ? 'text-blue-900 dark:text-blue-200' : 'text-slate-700 dark:text-slate-300'}`}>
                                          {isWaktuPulangTiba 
                                             ? `Waktunya Pulang! Sesi ${currentQuickSesi.nama} selesai pukul ${jamPulangTarget} WIB. Silakan absen pulang.` 
                                             : `Absen masuk tercatat pukul ${todayAttendance?.jamMasuk?.slice(0, 5)} WIB. Pulang pukul ${jamPulangTarget} WIB.`}
                                       </p>
                                    </div>
                                    <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded shrink-0 ${
                                       isWaktuPulangTiba ? 'bg-blue-600 text-white animate-pulse' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                                    }`}>
                                       {isWaktuPulangTiba ? 'Waktunya Pulang' : 'Sedang KBM'}
                                    </span>
                                 </div>
                              ) : sudahAbsenMasuk && sudahAbsenPulang ? (
                                 <div className="px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between gap-2 text-xs">
                                    <div className="flex items-center gap-2 min-w-0">
                                       <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                                       <p className="text-emerald-900 dark:text-emerald-200 font-bold truncate">
                                          Alhamdulillah, Presensi Sesi <b>{currentQuickSesi.nama}</b> telah LENGKAP (Masuk {todayAttendance?.jamMasuk?.slice(0, 5)} • Pulang {todayAttendance?.jamPulang?.slice(0, 5)} WIB).
                                       </p>
                                    </div>
                                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-600 text-white shrink-0">Lengkap</span>
                                 </div>
                              ) : isIzinToday ? (
                                 <div className="px-3.5 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 flex items-center justify-between gap-2 text-xs text-blue-800 dark:text-blue-200 font-bold">
                                    <div className="flex items-center gap-2 truncate">
                                       <Info size={15} className="text-blue-600 shrink-0" />
                                       <span>Status hari ini: <b>{todayAttendance?.status}</b> {todayAttendance?.keterangan ? `("${todayAttendance.keterangan}")` : ''}</span>
                                    </div>
                                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-blue-600 text-white shrink-0">Izin Resmi</span>
                                 </div>
                              ) : null}
                           </div>

                           {/* 3. DUA KARTU AKSI TERPADU (SEJAJAR): KIRI = MASUK, KANAN = PULANG */}
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1.5 relative z-10">
                              {/* KARTU MASUK */}
                              <div className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between gap-2 ${
                                 sudahAbsenMasuk 
                                    ? 'bg-white/80 dark:bg-slate-900/60 border-emerald-200 dark:border-emerald-800/60' 
                                    : 'bg-white/95 dark:bg-slate-900/80 border-slate-200/90 dark:border-slate-700/80 shadow-xs'
                              }`}>
                                 <div className="flex items-center justify-between gap-2">
                                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                                       <LogIn size={15} className="text-emerald-500" />
                                       Jam Masuk
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-medium">
                                       Batas: {currentQuickSesi.jamMasuk || '07:00'} WIB
                                    </span>
                                 </div>

                                 <div className="flex items-baseline justify-between gap-2">
                                    <div className="font-mono text-2xl font-black text-slate-800 dark:text-white">
                                       {todayAttendance?.jamMasuk ? todayAttendance.jamMasuk.slice(0, 5) : '--:--'}
                                       <span className="text-xs font-sans text-slate-400 ml-1">WIB</span>
                                    </div>
                                    <div>
                                       {sudahAbsenMasuk ? (
                                          todayAttendance?.status === 'Terlambat' ? (
                                             <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-extrabold text-[10px]">
                                                <AlertCircle size={11} /> Telat {todayAttendance.terlambatMenit}m
                                             </span>
                                          ) : (
                                             <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-extrabold text-[10px]">
                                                <CheckCircle size={11} /> Tepat Waktu
                                             </span>
                                          )
                                       ) : (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 font-bold text-[10px]">
                                             Belum Masuk
                                          </span>
                                       )}
                                    </div>
                                 </div>

                                 {/* Tombol Aksi Masuk */}
                                 <button
                                    type="button"
                                    onClick={handleQuickAbsenMasuk}
                                    disabled={sudahAbsenMasuk || isIzinToday}
                                    className={`w-full py-2.5 px-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                       sudahAbsenMasuk || isIzinToday
                                          ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-400 dark:text-slate-600 border border-slate-200 dark:border-slate-700/60 cursor-not-allowed'
                                          : currentTheme.type === 'sore'
                                          ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md shadow-purple-500/20 active:scale-98'
                                          : currentTheme.type === 'rapat'
                                          ? 'bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white shadow-md shadow-rose-500/20 active:scale-98'
                                          : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md shadow-emerald-500/20 active:scale-98'
                                    }`}
                                 >
                                    {sudahAbsenMasuk ? (
                                       <>
                                          <Check size={14} className="text-emerald-600 dark:text-emerald-400" />
                                          <span>Tercatat Masuk</span>
                                       </>
                                    ) : (
                                       <>
                                          <LogIn size={14} />
                                          <span>Absen Masuk Sekarang</span>
                                       </>
                                    )}
                                 </button>
                              </div>

                              {/* KARTU PULANG */}
                              <div className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between gap-2 ${
                                 sudahAbsenPulang 
                                    ? 'bg-white/80 dark:bg-slate-900/60 border-indigo-200 dark:border-indigo-800/60' 
                                    : isWaktuPulangTiba && sudahAbsenMasuk
                                    ? 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700/80 shadow-sm'
                                    : 'bg-white/95 dark:bg-slate-900/80 border-slate-200/90 dark:border-slate-700/80 shadow-xs'
                              }`}>
                                 <div className="flex items-center justify-between gap-2">
                                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                                       <LogOut size={15} className="text-blue-500" />
                                       Jam Pulang
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-medium">
                                       Jadwal: {jamPulangTarget} WIB
                                    </span>
                                 </div>

                                 <div className="flex items-baseline justify-between gap-2">
                                    <div className="font-mono text-2xl font-black text-slate-800 dark:text-white">
                                       {todayAttendance?.jamPulang ? todayAttendance.jamPulang.slice(0, 5) : '--:--'}
                                       <span className="text-xs font-sans text-slate-400 ml-1">WIB</span>
                                    </div>
                                    <div>
                                       {sudahAbsenPulang ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 font-extrabold text-[10px]">
                                             <CheckCircle size={11} /> Selesai Pulang
                                          </span>
                                       ) : sudahAbsenMasuk ? (
                                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] ${
                                             isWaktuPulangTiba 
                                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 animate-pulse' 
                                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                          }`}>
                                             {isWaktuPulangTiba ? 'Belum Pulang' : 'Belum Waktunya'}
                                          </span>
                                       ) : (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 font-bold text-[10px]">
                                             --
                                          </span>
                                       )}
                                    </div>
                                 </div>

                                 {/* Tombol Aksi Pulang */}
                                 <button
                                    type="button"
                                    onClick={handleQuickAbsenPulang}
                                    disabled={!sudahAbsenMasuk || sudahAbsenPulang}
                                    className={`w-full py-2.5 px-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                       !sudahAbsenMasuk || sudahAbsenPulang
                                          ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-400 dark:text-slate-600 border border-slate-200 dark:border-slate-700/60 cursor-not-allowed'
                                          : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20 active:scale-98'
                                    }`}
                                 >
                                    {sudahAbsenPulang ? (
                                       <>
                                          <Check size={14} className="text-indigo-600 dark:text-indigo-400" />
                                          <span>Tercatat Pulang</span>
                                       </>
                                    ) : (
                                       <>
                                          <LogOut size={14} />
                                          <span>Absen Pulang Sekarang</span>
                                       </>
                                    )}
                                 </button>
                              </div>
                           </div>

                           {/* 4. FOOTER: LINK HALAMAN LENGKAP */}
                           <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-700/50 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                              <span className="flex items-center gap-1.5 text-[11px] font-medium">
                                 <Sparkles size={13} className="text-amber-500" />
                                 Presensi otomatis tersinkron ke cloud sekolah secara real-time.
                              </span>
                              <button 
                                 type="button"
                                 onClick={() => setActiveTab('portal_presensi')}
                                 className={`flex items-center gap-1 hover:underline transition-colors cursor-pointer text-xs font-black uppercase tracking-wider ${
                                    currentTheme.type === 'sore'
                                       ? 'text-purple-700 dark:text-purple-400'
                                       : currentTheme.type === 'rapat'
                                       ? 'text-rose-700 dark:text-rose-400'
                                       : 'text-teal-700 dark:text-teal-400'
                                 }`}
                              >
                                 <span>Presensi Lengkap & Ajukan Izin</span>
                                 <ChevronRight size={14} />
                              </button>
                           </div>
                        </div>
                     );
                  })()}

                {/* 🪄 BIODATA GURU (DIKEMBALIKAN & DIRAPIKAN) */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                   
                   {/* KIRI: Informasi Profil Lengkap */}
                   <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
                      <div className="p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between gap-2">
                         <div className="flex items-center gap-3">
                           <div className="p-2.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl">
                             <UserCircle size={20} />
                           </div>
                           <h3 className="font-bold text-slate-800 dark:text-white">Data Personal & Kepegawaian</h3>
                         </div>
                         <div className="flex items-center gap-2">
                           <button 
                             onClick={handleOpenEditBiodata} 
                             className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                           >
                             <Edit size={14}/> <span className="hidden sm:inline">Edit Biodata Saya</span><span className="sm:hidden">Edit</span>
                           </button>
                           <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold border border-emerald-200 dark:border-emerald-800/50">
                             <CheckCircle size={14}/> Terverifikasi
                           </div>
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

                   {/* KARTU KEAMANAN & BIOMETRIK HP */}
                {isBioSupported && (
                  <div className="bg-white dark:bg-slate-800 rounded-3xl p-4 sm:p-6 border border-slate-200 dark:border-slate-700 shadow-sm mb-6 animate-in fade-in">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0 shadow-inner">
                          <Fingerprint size={26} />
                        </div>
                        <div>
                          <h4 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            Login Cepat Biometrik / Sidik Jari HP
                            {savedBioAccount && String(savedBioAccount.userId) === String(myData.id) ? (
                              <span className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 font-bold px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700">
                                Aktif di HP Ini
                              </span>
                            ) : (
                              <span className="text-[10px] bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400 font-bold px-2 py-0.5 rounded-full">
                                Belum Terhubung
                              </span>
                            )}
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-lg">
                            {savedBioAccount && String(savedBioAccount.userId) === String(myData.id)
                              ? 'Sensor biometrik HP Anda telah terhubung. Anda dapat masuk ke PayEdu cukup dengan satu sentuhan sensor tanpa perlu mengetik kata sandi.'
                              : 'Hubungkan sensor sidik jari atau Face Unlock bawaan HP Anda agar bisa masuk ke aplikasi PayEdu secara instan tanpa ribet mengetik.'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                        {savedBioAccount && String(savedBioAccount.userId) === String(myData.id) ? (
                          <button
                            type="button"
                            onClick={handleUnlinkBiometric}
                            className="w-full sm:w-auto px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                          >
                            Lepas Sidik Jari
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleRegisterBiometric}
                            disabled={isEnrollingBio}
                            className="w-full sm:w-auto px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-md shadow-teal-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-70"
                          >
                            <Fingerprint size={16} />
                            {isEnrollingBio ? 'Menghubungkan Sensor...' : 'Hubungkan Sidik Jari'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

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

        {/* FITUR BARU: Portal Presensi Saya */}
        {activeSection === 'portal_presensi' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <PresensiGuruView 
              teachers={teachers} 
              presensiGuru={presensiGuru} 
              setPresensiGuru={setPresensiGuru} 
              initialSesiId={selectedQuickSesiId}
              initialAction={autoTriggerPresensiMode}
              onActionConsumed={() => setAutoTriggerPresensiMode(null)}
              currentUser={{ id: user.id, teacherId: user.id, name: user.name, username: user.username, role: user.role, portal: 'Teacher' }} 
              schoolProfile={{ 
                nama: settings.schoolName || 'SD IT Qurrata A\'yun', 
                npsn: settings.schoolNpsn || '10404040', 
                alamat: settings.schoolAddress || 'Kandis', 
                kepsek: settings.kepsekName || 'Kepala Sekolah', 
                presensiGuruSettings: settings.presensiGuruSettings 
              }} 
              setSchoolProfile={(updater) => { 
                if (typeof setSettings === 'function') {
                  const currentSettings = settings || {};
                  const rawUpdated = typeof updater === 'function' ? updater(currentSettings?.presensiGuruSettings ? { presensiGuruSettings: currentSettings.presensiGuruSettings } : currentSettings) : updater; 
                  const newPresensiSettings = rawUpdated.presensiGuruSettings || rawUpdated; 
                  const newSettings = { ...currentSettings, presensiGuruSettings: newPresensiSettings, lastModified: Date.now() }; 
                  setSettings(newSettings);
                  safeStorageSet('payedu_settings', newSettings); 
                  try { localStorage.setItem('payedu_presensi_guru_settings', JSON.stringify(newPresensiSettings)); } catch(e){} 
                  pushToSupabase('SAVE_SETTINGS', newSettings).catch(e => console.warn(e)); 
                } 
              }} 
              addAuditLog={saveAuditLog} 
              onUpdateTeacher={handleUpdateTeacherPatch}
            />
          </div>
        )}

        {/* FITUR BARU: Jadwal Saya (Roster Mingguan & Insidental) */}
        {activeSection === 'portal_jadwal' && (() => {
          const rosterDays = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
          const rosterObj = myData.payroll?.roster || {};
          const totalRosterJpl = rosterDays.reduce((acc, h) => acc + (Number(rosterObj[h.toLowerCase()]) || 0), 0);
          const activeTeachingDays = rosterDays.filter(h => (Number(rosterObj[h.toLowerCase()]) || 0) > 0).length;

          return (
            <div className="space-y-4 sm:space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-300">
              {/* KARTU 1: KPI RINGKASAN ROSTER MINGGUAN */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4">
                <div className="bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Beban Mingguan</span>
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 flex items-center justify-center shrink-0">
                      <Clock size={16} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100">{totalRosterJpl}</span>
                      <span className="text-xs font-bold text-slate-400">JPL / Pekan</span>
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                      Roster terjadwal rutin
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Hari Mengajar</span>
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                      <CalendarDays size={16} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400">{activeTeachingDays}</span>
                      <span className="text-xs font-bold text-slate-400">Hari / Pekan</span>
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                      {6 - activeTeachingDays} hari bebas mengajar
                    </div>
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-1 bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Rata-Rata Harian</span>
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                      <Award size={16} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100">
                        {activeTeachingDays > 0 ? (totalRosterJpl / activeTeachingDays).toFixed(1) : 0}
                      </span>
                      <span className="text-xs font-bold text-slate-400">JPL / Hari Aktif</span>
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                      Intensitas mengajar harian
                    </div>
                  </div>
                </div>
              </div>

              {/* KARTU 2: ROSTER RUTIN MINGGUAN (Senin - Sabtu) */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs overflow-hidden">
                <div className="px-3.5 sm:px-5 py-3 sm:py-3.5 bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm flex items-center gap-2">
                    <ListPlus size={16} className="text-pink-500" />
                    <span>Roster Rutin Mingguan</span>
                  </h4>
                  <span className="text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300">
                    Senin - Sabtu
                  </span>
                </div>

                {/* Grid 2 Kolom di Mobile, 3 Kolom di Tablet/Desktop */}
                <div className="p-2.5 sm:p-4 grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
                  {rosterDays.map((hari) => {
                    const hariKey = hari.toLowerCase();
                    const jpl = Number(rosterObj[hariKey]) || 0;
                    const hasJpl = jpl > 0;

                    return (
                      <div 
                        key={hari} 
                        className={`p-3 rounded-xl border transition-all flex flex-col justify-between ${
                          hasJpl 
                            ? 'bg-gradient-to-br from-pink-50/50 to-rose-50/30 dark:from-pink-950/20 dark:to-slate-900/40 border-pink-200/80 dark:border-pink-800/40 shadow-xs' 
                            : 'bg-slate-50/60 dark:bg-slate-900/30 border-slate-100 dark:border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${hasJpl ? 'bg-pink-500' : 'bg-slate-300 dark:bg-slate-600'}`}></span>
                            <span>{hari}</span>
                          </span>
                          <span className={`text-[10px] sm:text-xs font-black px-2 py-0.5 rounded-md ${
                            hasJpl 
                              ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300' 
                              : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                          }`}>
                            {jpl} JPL
                          </span>
                        </div>

                        {hasJpl ? (
                          <div className="mt-1 pt-2 border-t border-pink-100/80 dark:border-pink-900/30 space-y-1">
                            <span className="text-[9px] font-bold text-pink-600 dark:text-pink-400 bg-pink-100/70 dark:bg-pink-900/40 px-1.5 py-0.5 rounded inline-block">
                              Terjadwal
                            </span>
                            <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 line-clamp-1">
                              Pembelajaran Kelas
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <Users size={11} className="text-pink-500 shrink-0" />
                              <span>{jpl} Jam Pelajaran</span>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-1 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500 italic">
                            Tidak ada jadwal wajib
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* KARTU 3: KALENDER PEMETAAN JAM MENGAJAR HARIAN (Bulan Ini) - Grid 7 Kolom */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs overflow-hidden">
                <div className="px-3.5 sm:px-5 py-3 sm:py-3.5 bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm flex items-center gap-2">
                      <CalendarDays size={16} className="text-blue-500" />
                      <span>Kalender Pemetaan Jam Mengajar Harian</span>
                      <span className="text-[11px] font-normal text-slate-400 hidden sm:inline">(Tgl 1 - 31)</span>
                    </h4>
                    <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Rincian alokasi Jam Pelajaran (JPL) hasil pemetaan roster dan kegiatan khusus per tanggal.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Mengajar</span>
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600"></span> Libur / 0 JPL</span>
                  </div>
                </div>

                {/* Grid 7 Kolom Presisi Mobile */}
                <div className="p-2.5 sm:p-4 grid grid-cols-7 gap-1 sm:gap-2">
                  {Array.from({ length: 31 }, (_, idx) => {
                    const dayNum = idx + 1;
                    const harianArr = myData.payroll?.jamMengajar?.harian || [];
                    const jamHarian = Number(harianArr[idx]) || 0;
                    const hasJpl = jamHarian > 0;

                    return (
                      <div 
                        key={dayNum} 
                        className={`flex flex-col items-center justify-center p-1 sm:p-2 rounded-xl border text-center transition-all ${
                          hasJpl 
                            ? 'bg-blue-50/80 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/40 text-blue-900 dark:text-blue-200 shadow-xs' 
                            : 'bg-slate-50/50 dark:bg-slate-900/30 border-slate-100 dark:border-slate-800 text-slate-400'
                        }`}
                      >
                        <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-0.5">
                          {dayNum}
                        </span>
                        {hasJpl ? (
                          <span className="text-xs sm:text-sm font-black text-blue-600 dark:text-blue-400">
                            {jamHarian}
                            <span className="text-[8px] font-medium ml-0.5 text-blue-600/70 hidden sm:inline">JPL</span>
                          </span>
                        ) : (
                          <span className="text-xs sm:text-sm font-normal text-slate-300 dark:text-slate-600">-</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* KARTU 4: RIWAYAT KEGIATAN INSIDENTAL & TAMBAHAN (Dual-Mode: Mobile Card Feed + Desktop Table) */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs overflow-hidden">
                <div className="px-3.5 sm:px-5 py-3 sm:py-3.5 bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm flex items-center gap-2">
                    <Star size={16} className="text-amber-500" />
                    <span>Kegiatan Insidental &amp; Tambahan Bulan Ini</span>
                  </h4>
                  <span className="text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                    {(myData.payroll?.kegiatanInsidental || []).length} Kegiatan
                  </span>
                </div>

                {/* Mobile View: Clean Card Feed (md:hidden) */}
                <div className="p-3 space-y-2 md:hidden">
                  {(myData.payroll?.kegiatanInsidental || []).length > 0 ? (
                    myData.payroll.kegiatanInsidental.map((keg, i) => (
                      <div key={i} className="p-3 rounded-xl border border-amber-100 dark:border-amber-900/30 bg-amber-50/30 dark:bg-amber-950/20 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 line-clamp-2">
                            {keg.ket}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="inline-block px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 font-black text-xs shadow-xs border border-amber-200/60 dark:border-amber-800/60">
                            +{keg.jam} JPL
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-6 px-4 text-center">
                      <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center mx-auto mb-2 text-slate-400">
                        <Star size={18} />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Belum ada penugasan kegiatan massal/insidental di bulan ini.</p>
                    </div>
                  )}
                </div>

                {/* Desktop View: Full Table (hidden md:block) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50/80 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-700/80">
                      <tr>
                        <th className="p-3.5 font-semibold">Keterangan / Nama Kegiatan Khusus</th>
                        <th className="p-3.5 font-semibold text-center w-36">Tambahan Jam</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {(myData.payroll?.kegiatanInsidental || []).length > 0 ? (
                        myData.payroll.kegiatanInsidental.map((keg, i) => (
                          <tr key={i} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="p-3.5 font-medium text-slate-700 dark:text-slate-200">{keg.ket}</td>
                            <td className="p-3.5 text-center">
                              <span className="px-3 py-1 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 font-bold text-xs shadow-xs border border-amber-200/50 dark:border-amber-800/50">
                                +{keg.jam} JPL
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="2" className="p-8 text-center text-slate-400 dark:text-slate-500 italic">
                            Belum ada penugasan kegiatan massal/insidental yang tercatat di bulan ini.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 2. Rekap Kehadiran */}
        {activeSection === 'portal_kehadiran' && (
        <div className="space-y-4 sm:space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-300">
          {/* KARTU 1: 4 KPI METRICS UTAMA (Responsive 2x2 di Mobile, 4 Kolom di Tablet/Desktop) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
            {/* Realisasi Jam */}
            <div className="bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between hover:border-blue-400/50 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Realisasi Jam</span>
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Award size={16} />
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100">{realJam}</span>
                  <span className="text-xs font-bold text-slate-400">JPL</span>
                </div>
                {/* Progress bar pencapaian target */}
                <div className="mt-2">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-semibold mb-1">
                    <span>Target: {wajibJam} JPL</span>
                    <span className="text-blue-600 dark:text-blue-400 font-bold">
                      {wajibJam > 0 ? Math.round((realJam / wajibJam) * 100) : 100}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-700/60 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min(100, wajibJam > 0 ? (realJam / wajibJam) * 100 : 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Total Hari Hadir */}
            <div className="bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between hover:border-emerald-400/50 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Hari Hadir</span>
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={16} />
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-400">{autoHadir}</span>
                  <span className="text-xs font-bold text-slate-400">Hari</span>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/50 flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>Tercatat aktif mengajar</span>
                </div>
              </div>
            </div>

            {/* Terlambat */}
            <div className="bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between hover:border-red-400/50 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Terlambat</span>
                <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl ${telatDisiplin > 0 ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700/50 dark:text-slate-400'} flex items-center justify-center shrink-0`}>
                  <AlertCircle size={16} />
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-xl sm:text-2xl font-black ${telatDisiplin > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-200'}`}>{telatDisiplin}</span>
                  <span className="text-xs font-bold text-slate-400">Kali</span>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/50 flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${telatDisiplin > 0 ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
                  <span>{telatDisiplin > 0 ? 'Potongan disiplin berlaku' : 'Disiplin tepat waktu'}</span>
                </div>
              </div>
            </div>

            {/* Selisih Jam */}
            <div className="bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between hover:border-amber-400/50 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Selisih JPL</span>
                <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl ${selisihJam >= 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'} flex items-center justify-center shrink-0`}>
                  <TrendingUp size={16} />
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-xl sm:text-2xl font-black ${selisihJam >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {selisihJam > 0 ? `+${selisihJam}` : selisihJam}
                  </span>
                  <span className="text-xs font-bold text-slate-400">JPL</span>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/50 flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${selisihJam >= 0 ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                  <span>{selisihJam >= 0 ? 'Target terpenuhi' : 'Kurang dari target'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* KARTU 2: RINCIAN SAKIT, IZIN, ALPA (Kapsul Presisi Mobile) */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/40 p-2.5 sm:p-3.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-1 shadow-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                <span className="text-[11px] sm:text-xs font-bold text-amber-800 dark:text-amber-300">Sakit (S)</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-base sm:text-lg font-black text-amber-700 dark:text-amber-400">{autoSakit}</span>
                <span className="text-[10px] sm:text-xs font-medium text-amber-600 dark:text-amber-400">Hari</span>
              </div>
            </div>

            <div className="bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-800/40 p-2.5 sm:p-3.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-1 shadow-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
                <span className="text-[11px] sm:text-xs font-bold text-blue-800 dark:text-blue-300">Izin (I)</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-base sm:text-lg font-black text-blue-700 dark:text-blue-400">{autoIzin}</span>
                <span className="text-[10px] sm:text-xs font-medium text-blue-600 dark:text-blue-400">Hari</span>
              </div>
            </div>

            <div className="bg-red-50/70 dark:bg-red-950/20 border border-red-200/80 dark:border-red-800/40 p-2.5 sm:p-3.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-1 shadow-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>
                <span className="text-[11px] sm:text-xs font-bold text-red-800 dark:text-red-300">Alpa (A)</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-base sm:text-lg font-black text-red-700 dark:text-red-400">{autoAlpa}</span>
                <span className="text-[10px] sm:text-xs font-medium text-red-600 dark:text-red-400">Hari</span>
              </div>
            </div>
          </div>

          {/* KARTU 3: KALENDER / MATRIX RINCIAN JAM MENGAJAR HARIAN (TANGGAL 1 - 31) */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs overflow-hidden">
            <div className="px-3.5 sm:px-5 py-3 sm:py-3.5 bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm flex items-center gap-2">
                  <CalendarDays size={16} className="text-amber-500" />
                  <span>Rincian Jam Mengajar Harian</span>
                  <span className="text-[11px] font-normal text-slate-400 hidden sm:inline">(Tgl 1 - 31)</span>
                </h4>
                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Angka menunjukkan jam tatap muka (JPL) yang diajarkan pada tanggal tersebut.
                </p>
              </div>

              {/* Legend Ringkas */}
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Mengajar</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Sakit (S)</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Izin (I)</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Alpa (A)</span>
              </div>
            </div>

            {/* Grid Kalender Presisi 7 Kolom (Format Mingguan Standar) */}
            <div className="p-2.5 sm:p-4 grid grid-cols-7 gap-1 sm:gap-2">
              {dailyData.map((jam, i) => {
                const str = String(jam || '').trim().toUpperCase();
                const isSakit = str === 'S';
                const isIzin = str === 'I';
                const isAlpa = str === 'A';
                const numVal = !isNaN(Number(str)) && Number(str) > 0 ? Number(str) : 0;
                const hasHours = numVal > 0;

                return (
                  <div 
                    key={i} 
                    className={`flex flex-col items-center justify-center p-1 sm:p-2 rounded-xl border text-center transition-all ${
                      hasHours 
                        ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40 shadow-xs' 
                        : isSakit 
                        ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40' 
                        : isIzin 
                        ? 'bg-blue-50/80 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/40' 
                        : isAlpa 
                        ? 'bg-red-50/80 dark:bg-red-950/30 border-red-200 dark:border-red-800/40' 
                        : 'bg-slate-50/50 dark:bg-slate-900/30 border-slate-100 dark:border-slate-800'
                    }`}
                  >
                    <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-0.5">
                      {i + 1}
                    </span>
                    
                    {hasHours ? (
                      <span className="text-xs sm:text-sm font-black text-emerald-700 dark:text-emerald-400">
                        {numVal}
                        <span className="text-[8px] font-medium ml-0.5 text-emerald-600/70 hidden sm:inline">JPL</span>
                      </span>
                    ) : isSakit ? (
                      <span className="text-xs sm:text-sm font-black text-amber-600 dark:text-amber-400">S</span>
                    ) : isIzin ? (
                      <span className="text-xs sm:text-sm font-black text-blue-600 dark:text-blue-400">I</span>
                    ) : isAlpa ? (
                      <span className="text-xs sm:text-sm font-black text-red-600 dark:text-red-400">A</span>
                    ) : (
                      <span className="text-xs sm:text-sm font-normal text-slate-300 dark:text-slate-600">-</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* KARTU 4: KEGIATAN INSIDENTAL & TAMBAHAN (Dual-Mode: Mobile Cards + Desktop Table) */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs overflow-hidden">
            <div className="px-3.5 sm:px-5 py-3 sm:py-3.5 bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
              <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm flex items-center gap-2">
                <Star size={16} className="text-amber-500" />
                <span>Rincian Kegiatan Insidental &amp; Tambahan</span>
              </h4>
              <span className="text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                {(myData.payroll?.kegiatanInsidental || []).length} Kegiatan
              </span>
            </div>

            {/* Mobile View: Clean Card Feed (md:hidden) */}
            <div className="p-3 space-y-2 md:hidden">
              {(myData.payroll?.kegiatanInsidental || []).length > 0 ? (
                myData.payroll.kegiatanInsidental.map((keg, i) => (
                  <div key={i} className="p-3 rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100/70 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-[10px] font-bold mb-1">
                        <Calendar size={10} />
                        <span>Tgl {keg.tgl}</span>
                      </div>
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 line-clamp-2">
                        {keg.ket}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="inline-block px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-black text-xs shadow-xs border border-blue-200/50 dark:border-blue-800/50">
                        +{keg.jam} JPL
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-6 px-4 text-center">
                  <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center mx-auto mb-2 text-slate-400">
                    <Star size={18} />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Belum ada kegiatan insidental/massal yang tercatat di bulan ini.</p>
                </div>
              )}
            </div>

            {/* Desktop View: Full Table (hidden md:block) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50/80 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-700/80">
                  <tr>
                    <th className="p-3.5 font-semibold w-28 text-center">Tanggal</th>
                    <th className="p-3.5 font-semibold">Keterangan / Nama Kegiatan Khusus</th>
                    <th className="p-3.5 font-semibold text-center w-36">Tambahan Jam</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {(myData.payroll?.kegiatanInsidental || []).length > 0 ? (
                    myData.payroll.kegiatanInsidental.map((keg, i) => (
                      <tr key={i} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="p-3.5 text-center font-bold text-slate-600 dark:text-slate-300">
                          <span className="px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold">
                            Tgl {keg.tgl}
                          </span>
                        </td>
                        <td className="p-3.5 font-medium text-slate-700 dark:text-slate-200">{keg.ket}</td>
                        <td className="p-3.5 text-center">
                          <span className="px-3 py-1 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-bold text-xs shadow-xs border border-blue-200/50 dark:border-blue-800/50">
                            +{keg.jam} JPL
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="3" className="p-8 text-center text-slate-400 dark:text-slate-500 italic">
                        Belum ada penugasan kegiatan massal/insidental yang tercatat di bulan ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Catatan Sinkronisasi */}
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 pt-1 pb-2">
            <Info size={13} className="shrink-0" />
            <span>Data disinkronisasi secara otomatis dari pembukuan sekolah. Hubungi admin jika terdapat selisih jam.</span>
          </div>
        </div>
        )}

        {/* 3. Rekap & Slip Gaji */}
        {activeSection === 'portal_gaji' && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {settings?.payrollStatus !== 'Approved' ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 sm:p-12 text-center">
              <div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-200 dark:border-amber-700/60">
                <Lock size={32} className="text-amber-500" />
              </div>
              <h4 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-100 mb-2">Informasi Gaji Masih Terkunci</h4>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                Rincian slip gaji untuk periode <b className="text-slate-700 dark:text-slate-200">{bulan}</b> saat ini sedang dalam proses verifikasi &amp; rekapitulasi oleh Bendahara dan menunggu persetujuan resmi (Approval) dari Kepala Sekolah.
              </p>
            </div>
          ) : (
            <>
              {/* KARTU 1: HERO TAKE HOME PAY (THP) - ULTRA LUXURY FINTECH EDITION */}
              <div className="bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900 text-white rounded-3xl p-5 sm:p-7 shadow-[0_20px_45px_-12px_rgba(16,185,129,0.35)] relative overflow-hidden border border-emerald-400/30">
                {/* Latar Belakang Dekoratif & Ambient Aura */}
                <div className="absolute -right-10 -top-10 w-52 h-52 bg-emerald-400/20 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute -left-10 -bottom-10 w-52 h-52 bg-teal-400/20 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute right-4 bottom-4 text-white/[0.04] pointer-events-none select-none">
                  <Wallet size={160} strokeWidth={1} />
                </div>

                <div className="relative z-10 flex flex-col items-center text-center">
                  {/* Badge Header Periode & Status Resmi */}
                  <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
                    <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider bg-black/25 backdrop-blur-md px-3 py-1 rounded-full border border-white/20 shadow-xs flex items-center gap-1.5 text-emerald-100">
                      <Calendar size={13} className="text-emerald-300" />
                      <span>Periode: {bulan}</span>
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-400/20 backdrop-blur-md text-emerald-200 px-3 py-1 rounded-full border border-emerald-300/30 flex items-center gap-1.5 shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <ShieldCheck size={13} className="text-emerald-300" />
                      <span>Disahkan &amp; Resmi</span>
                    </span>
                  </div>

                  {/* Label THP dengan Tombol Privasi Mata (Show/Hide) */}
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <span className="text-[11px] font-black tracking-widest text-emerald-100/90 uppercase">
                      Total Gaji Bersih (Take Home Pay)
                    </span>
                    <button 
                      type="button"
                      onClick={() => setShowNominalGaji(!showNominalGaji)} 
                      className="p-1 rounded-full hover:bg-white/15 text-emerald-200 hover:text-white transition-colors cursor-pointer"
                      title={showNominalGaji ? "Sembunyikan Nominal" : "Tampilkan Nominal"}
                    >
                      {showNominalGaji ? <Eye size={15} /> : <EyeOff size={15} />}
                    </button>
                  </div>

                  {/* Nominal Utama THP */}
                  <div className="text-3xl sm:text-4xl md:text-5xl font-black font-mono tracking-tight text-white my-3 drop-shadow-[0_4px_12px_rgba(0,0,0,0.3)] select-none">
                    {showNominalGaji ? formatRp(slip.totalBersih) : 'Rp ••••••••'}
                  </div>

                  {/* Dua Kapsul Fintech: Penerimaan Kotor vs Total Potongan */}
                  <div className="grid grid-cols-2 gap-2.5 sm:gap-4 w-full max-w-md mt-1">
                    <div className="bg-emerald-950/40 backdrop-blur-md rounded-2xl p-3 sm:p-3.5 border border-emerald-400/30 text-left shadow-inner relative overflow-hidden group">
                      <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-emerald-200 font-bold mb-1">
                        <TrendingUp size={14} className="text-emerald-400" />
                        <span>Penerimaan Kotor</span>
                      </div>
                      <span className="font-mono text-xs sm:text-sm font-black text-white">
                        {showNominalGaji ? formatRp(slip.totalKotor) : 'Rp ••••••'}
                      </span>
                    </div>
                    <div className="bg-rose-950/40 backdrop-blur-md rounded-2xl p-3 sm:p-3.5 border border-rose-400/30 text-left shadow-inner relative overflow-hidden group">
                      <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-rose-200 font-bold mb-1">
                        <CreditCard size={14} className="text-rose-400" />
                        <span>Total Potongan</span>
                      </div>
                      <span className="font-mono text-xs sm:text-sm font-black text-rose-200">
                        {showNominalGaji ? `-${formatRp(slip.totalPotongan)}` : '-Rp ••••'}
                      </span>
                    </div>
                  </div>

                  {/* Tombol Aksi Utama: Cetak Lembar A4 & Unduh PDF Resmi */}
                  <div className="flex flex-wrap items-center justify-center gap-2.5 mt-5 w-full max-w-md">
                    <button 
                      type="button"
                      onClick={() => setIsSlipModalOpen(true)}
                      className="flex-1 min-w-[140px] bg-white hover:bg-emerald-50 text-emerald-900 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-md hover:shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer border border-white/50"
                    >
                      <Printer size={16} className="text-emerald-700" />
                      <span>Cetak Slip (A4)</span>
                    </button>
                    <button 
                      type="button"
                      onClick={async () => {
                        setIsExportingPDF(true);
                        try {
                          await exportToPDF('printable-area', `Slip_Gaji_${myData.name.replace(/\s+/g, '_')}_${bulan.replace(/\s+/g, '_')}.pdf`);
                        } finally {
                          setIsExportingPDF(false);
                        }
                      }}
                      disabled={isExportingPDF}
                      className="flex-1 min-w-[140px] bg-emerald-900/80 hover:bg-emerald-900 text-white border border-emerald-400/30 backdrop-blur-md px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-md hover:shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isExportingPDF ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Download size={16} className="text-emerald-300" />}
                      <span>{isExportingPDF ? 'Memproses...' : 'Unduh PDF'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* KARTU 2: RINCIAN PENGHASILAN & TUNJANGAN */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="p-3.5 sm:p-4 bg-slate-50/70 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                      <Wallet size={15} />
                    </div>
                    <h3 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-white uppercase tracking-wider">
                      Rincian Penerimaan (Pendapatan)
                    </h3>
                  </div>
                  <span className="font-mono text-xs sm:text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                    {formatRp(slip.totalKotor)}
                  </span>
                </div>

                <div className="p-4 sm:p-5 space-y-2.5 text-xs sm:text-sm">
                  {/* Tunjangan Masa Kerja */}
                  <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-700/60">
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Tunjangan Masa Kerja</span>
                      <p className="text-[10px] text-slate-400">Status {myData.status} • TMT {formatDateId(myData.tmt)}</p>
                    </div>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{formatRp(slip.tMasaKerja)}</span>
                  </div>

                  {/* Tunjangan Jabatan */}
                  {slip.tJabatan > 0 && (
                    <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-700/60">
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Tunjangan Jabatan</span>
                        <p className="text-[10px] text-slate-400">{myData.position}</p>
                      </div>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{formatRp(slip.tJabatan)}</span>
                    </div>
                  )}

                  {/* Tunjangan Pendidikan */}
                  {slip.tPendidikan > 0 && (
                    <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-700/60">
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Tunjangan Pendidikan</span>
                        <p className="text-[10px] text-slate-400">Kualifikasi {myData.education}</p>
                      </div>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{formatRp(slip.tPendidikan)}</span>
                    </div>
                  )}

                  {/* Tunjangan Keluarga */}
                  {slip.tKeluarga > 0 && (
                    <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-700/60">
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Tunjangan Keluarga</span>
                        <p className="text-[10px] text-slate-400">
                          {myData.family?.wife === 1 ? 'Suami/Istri' : ''} {myData.family?.children > 0 ? `• ${myData.family.children} Anak` : ''}
                        </p>
                      </div>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{formatRp(slip.tKeluarga)}</span>
                    </div>
                  )}

                  {/* Insentif Kehadiran (Tepat Waktu) */}
                  <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-700/60">
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Insentif Kehadiran Tepat Waktu</span>
                      <p className="text-[10px] text-slate-400">Total kehadiran tepat waktu bulan ini</p>
                    </div>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{formatRp(slip.bonusHadir)}</span>
                  </div>

                  {/* Tunjangan Jam Mengajar / Kelebihan Jam */}
                  {slip.tMengajar > 0 && (
                    <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-700/60">
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Honor Jam Mengajar</span>
                        <p className="text-[10px] text-slate-400">Realisasi jam mengajar &amp; kelebihan jam</p>
                      </div>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{formatRp(slip.tMengajar)}</span>
                    </div>
                  )}

                  {/* Insentif Tugas Tambahan */}
                  {slip.tTambahan > 0 && (
                    <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-700/60">
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Insentif Tugas Tambahan</span>
                        <p className="text-[10px] text-slate-400">Penugasan khusus / kepanitiaan</p>
                      </div>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{formatRp(slip.tTambahan)}</span>
                    </div>
                  )}

                  {/* Total Penerimaan Kotor Footer */}
                  <div className="flex items-center justify-between pt-2 text-emerald-700 dark:text-emerald-400 font-extrabold border-t border-slate-200 dark:border-slate-700">
                    <span>Subtotal Penerimaan Kotor</span>
                    <span className="font-mono text-sm sm:text-base">{formatRp(slip.totalKotor)}</span>
                  </div>
                </div>
              </div>

              {/* KARTU 3: RINCIAN PEMOTONGAN GAJI */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="p-3.5 sm:p-4 bg-slate-50/70 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold">
                      <CreditCard size={15} />
                    </div>
                    <h3 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-white uppercase tracking-wider">
                      Rincian Pemotongan
                    </h3>
                  </div>
                  <span className="font-mono text-xs sm:text-sm font-extrabold text-rose-600 dark:text-rose-400">
                    -{formatRp(slip.totalPotongan)}
                  </span>
                </div>

                <div className="p-4 sm:p-5 space-y-2.5 text-xs sm:text-sm">
                  {/* Potongan Keterlambatan */}
                  <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-700/60">
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Pemotongan Kedisiplinan (Telat)</span>
                      <p className="text-[10px] text-slate-400">{myData.payroll?.disiplin?.telat || 0} kali keterlambatan</p>
                    </div>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {slip.potongTelat > 0 ? `-${formatRp(slip.potongTelat)}` : 'Rp 0'}
                    </span>
                  </div>

                  {/* Potongan Lainnya / Kasbon */}
                  {(myData.payroll?.potonganLainnya || []).map((pot, pIdx) => (
                    <div key={pIdx} className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-700/60">
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{pot.ket || 'Potongan Lainnya'}</span>
                        <p className="text-[10px] text-slate-400">Angsuran / iuran otomatis</p>
                      </div>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        -{formatRp(Number(pot.nominal) || 0)}
                      </span>
                    </div>
                  ))}

                  {/* Total Potongan Footer */}
                  <div className="flex items-center justify-between pt-2 text-rose-600 dark:text-rose-400 font-extrabold border-t border-slate-200 dark:border-slate-700">
                    <span>Subtotal Pemotongan</span>
                    <span className="font-mono text-sm sm:text-base">-{formatRp(slip.totalPotongan)}</span>
                  </div>
                </div>
              </div>

              {/* KARTU 4: INFORMASI REKENING PENERIMA */}
              <div className="bg-slate-50 dark:bg-slate-900/40 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 text-xs sm:text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Building size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Rekening Tujuan Transfer</p>
                    <p className="font-black text-slate-800 dark:text-slate-200 font-mono truncate">
                      {myData.bankName ? `${myData.bankName} • ${myData.bankAccount}` : 'Penerimaan via Tunai'}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">a.n. {myData.name}</p>
                  </div>
                </div>
              </div>

              {/* KARTU 5: KONFIRMASI GAJI */}
              {!myData.payroll?.isConfirmed ? (
                <div className="p-4 sm:p-5 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/20 border-2 border-amber-300 dark:border-amber-700/60 rounded-2xl text-center space-y-3 shadow-sm">
                  <div className="flex items-center justify-center gap-2">
                    <BellRing className="text-amber-600 dark:text-amber-400 animate-bounce" size={18} />
                    <span className="text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">
                      Konfirmasi Penerimaan Gaji
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 font-bold">
                    Silakan periksa rincian di atas. Jika sudah sesuai, klik tombol konfirmasi di bawah ini.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2.5 max-w-md mx-auto">
                    <button 
                      type="button"
                      onClick={handleKonfirmasi} 
                      disabled={isConfirming} 
                      className="flex-1 bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white py-2.5 px-4 rounded-xl text-xs sm:text-sm font-extrabold shadow-md shadow-emerald-500/25 transition-all hover:scale-[1.02] active:scale-95 flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {isConfirming ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <CheckCircle size={16} />}
                      {isConfirming ? 'Menyimpan...' : 'Ya, Nominal Sesuai'}
                    </button>
                    <button 
                      type="button"
                      onClick={handleKomplain} 
                      className="flex-1 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-all border border-rose-200 dark:border-rose-800 flex justify-center items-center gap-2 cursor-pointer hover:scale-[1.02]" 
                      title="Akan dialihkan ke WhatsApp Bendahara"
                    >
                      <MessageSquare size={16} /> WA Bendahara
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-xs sm:text-sm font-bold rounded-2xl border border-emerald-200 dark:border-emerald-800/60 text-center flex justify-center items-center gap-2 shadow-xs">
                  <CheckCircle2 size={18} className="text-emerald-500" />
                  <span>Alhamdulillah, Penerimaan Gaji Periode Ini Telah Dikonfirmasi Resmi.</span>
                </div>
              )}
            </>
          )}
        </div>
        )}

        {/* 4. Dashboard Pemantauan Pinjaman / Buku Kasbon */}
        {activeSection === 'portal_pinjaman' && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {loanItems.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 sm:p-12 text-center">
               <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-200 dark:border-emerald-800/60 shadow-xs">
                 <CheckCircle size={32} />
               </div>
               <h4 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-100 mb-2">Alhamdulillah, Tidak Ada Pinjaman Aktif</h4>
               <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                 Saat ini Anda tidak memiliki tanggungan kasbon, cicilan koperasi, atau kewajiban pinjaman lain yang terdaftar pada sistem pemotongan otomatis.
               </p>
            </div>
          ) : (
            <>
              {/* HERO KARTU BUKU PINJAMAN PEGAWAI */}
              <div className="bg-gradient-to-br from-teal-700 via-teal-800 to-slate-900 text-white rounded-3xl p-5 sm:p-7 shadow-[0_20px_45px_-12px_rgba(20,184,166,0.35)] relative overflow-hidden border border-teal-400/30">
                <div className="absolute -right-8 -top-8 w-44 h-44 bg-teal-400/20 rounded-full blur-2xl pointer-events-none"></div>
                <div className="absolute -left-8 -bottom-8 w-44 h-44 bg-emerald-400/20 rounded-full blur-2xl pointer-events-none"></div>
                <div className="absolute right-4 bottom-4 text-white/[0.04] pointer-events-none select-none">
                  <CreditCard size={150} strokeWidth={1} />
                </div>

                <div className="relative z-10 flex flex-col items-center text-center">
                  <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
                    <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider bg-black/25 backdrop-blur-md px-3 py-1 rounded-full border border-white/20 shadow-xs flex items-center gap-1.5 text-teal-100">
                      <CreditCard size={13} className="text-teal-300" />
                      <span>Buku Kasbon &amp; Pinjaman</span>
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-wider bg-teal-400/20 backdrop-blur-md text-teal-200 px-3 py-1 rounded-full border border-teal-300/30 flex items-center gap-1.5 shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse"></span>
                      <span>{loanItems.length} Tagihan Aktif</span>
                    </span>
                  </div>

                  <p className="text-xs font-bold text-teal-100/90 uppercase tracking-wider mt-1">
                    Total Sisa Saldo Pinjaman Anda
                  </p>

                  <div className="text-3xl sm:text-4xl md:text-5xl font-black font-mono tracking-tight text-white my-2.5 drop-shadow-md">
                    {formatRp(totalSisaHutang)}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 sm:gap-4 w-full max-w-md mt-1">
                    <div className="bg-teal-950/40 backdrop-blur-md rounded-2xl p-3 sm:p-3.5 border border-teal-400/30 text-left shadow-inner">
                      <span className="block text-[10px] sm:text-xs text-teal-200 font-bold mb-0.5">Potongan Gaji Bulan Ini</span>
                      <span className="font-mono text-xs sm:text-sm font-black text-rose-300">-{formatRp(totalCicilanBulanan)}</span>
                    </div>
                    <div className="bg-teal-950/40 backdrop-blur-md rounded-2xl p-3 sm:p-3.5 border border-teal-400/30 text-left shadow-inner">
                      <span className="block text-[10px] sm:text-xs text-teal-200 font-bold mb-0.5">Metode Pelunasan</span>
                      <span className="text-xs sm:text-sm font-bold text-emerald-300">Potong Slip Gaji</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* DAFTAR RINCIAN PINJAMAN */}
              <div className="space-y-4">
                {loanItems.map((loan, idx) => {
                  const cicilanBulanan = loan.nominal;
                  const totalPinjamanAwal = loan.totalPinjaman !== undefined ? loan.totalPinjaman : (loan.nominal * 10);
                  const sisaSaldo = loan.sisaHutang !== undefined ? loan.sisaHutang : (loan.nominal * 4); 
                  const totalTerbayar = Math.max(0, totalPinjamanAwal - sisaSaldo);
                  const persentase = totalPinjamanAwal > 0 ? ((totalTerbayar / totalPinjamanAwal) * 100).toFixed(0) : 0;

                  return (
                    <div key={idx} className="bg-white dark:bg-slate-800 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden animate-in fade-in zoom-in-95">
                      <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-700/80 flex justify-between items-center bg-slate-50/70 dark:bg-slate-900/30">
                         <h3 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-white flex items-center gap-2">
                           <div className="w-7 h-7 rounded-lg bg-teal-100 dark:bg-teal-900/50 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                             <CreditCard size={15} />
                           </div>
                           <span>{loan.ket}</span>
                         </h3>
                         <span className="text-[10px] sm:text-xs font-black px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
                           Status: Aktif
                         </span>
                      </div>
                      
                      <div className="p-4 sm:p-6 space-y-4">
                        {/* 4 Kotak Metrik yang Nyaman di HP */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                          <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/60 text-left">
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-0.5">Plafon Pinjaman</p>
                            <p className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200 font-mono">{formatRp(totalPinjamanAwal)}</p>
                          </div>
                          <div className="bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-xl border border-emerald-200/60 dark:border-emerald-800/40 text-left">
                            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-bold mb-0.5">Telah Dicicil</p>
                            <p className="text-xs sm:text-sm font-black text-emerald-700 dark:text-emerald-300 font-mono">{formatRp(totalTerbayar)}</p>
                          </div>
                          <div className="bg-rose-50 dark:bg-rose-950/20 p-3 rounded-xl border border-rose-200/60 dark:border-rose-800/40 text-left">
                            <p className="text-[10px] text-rose-600 dark:text-rose-400 uppercase tracking-wider font-bold mb-0.5">Potongan / Bulan</p>
                            <p className="text-xs sm:text-sm font-black text-rose-700 dark:text-rose-300 font-mono">{formatRp(cicilanBulanan)}</p>
                          </div>
                          <div className="bg-teal-50 dark:bg-teal-950/30 p-3 rounded-xl border border-teal-200/80 dark:border-teal-700/60 text-left shadow-xs">
                            <p className="text-[10px] text-teal-600 dark:text-teal-400 uppercase tracking-wider font-bold mb-0.5">Sisa Hutang</p>
                            <p className="text-xs sm:text-sm font-black text-teal-700 dark:text-teal-300 font-mono">{formatRp(sisaSaldo)}</p>
                          </div>
                        </div>

                        {/* Progres Pelunasan */}
                        <div className="bg-slate-50/70 dark:bg-slate-900/30 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-700/50">
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Progres Pelunasan</span>
                            <span className="text-xs font-black font-mono text-teal-600 dark:text-teal-400">{persentase}%</span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
                            <div className="bg-gradient-to-r from-teal-500 to-emerald-500 h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, Math.max(0, persentase))}%` }}>
                            </div>
                          </div>
                        </div>

                        {/* Riwayat Pemotongan: Mobile-Friendly Cards + Desktop Table */}
                        <div>
                          <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                            Simulasi Pemotongan Terbaru
                          </h4>
                          
                          {/* Tampilan Ponsel (Card Feed - No Scroll Horisontal) */}
                          <div className="sm:hidden space-y-2">
                            <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between text-xs">
                              <div>
                                <p className="font-bold text-slate-800 dark:text-slate-200">{bulan} (Bulan Ini)</p>
                                <p className="text-[10px] text-slate-400">Potongan otomatis slip gaji</p>
                              </div>
                              <span className="font-mono font-black text-rose-500">-{formatRp(cicilanBulanan)}</span>
                            </div>
                            <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between text-xs">
                              <div>
                                <p className="font-bold text-slate-800 dark:text-slate-200">Bulan Sebelumnya</p>
                                <p className="text-[10px] text-slate-400">Potongan otomatis slip gaji</p>
                              </div>
                              <span className="font-mono font-black text-rose-500">-{formatRp(cicilanBulanan)}</span>
                            </div>
                          </div>

                          {/* Tampilan Tablet / Laptop (Table View) */}
                          <div className="hidden sm:block overflow-hidden border border-slate-200 dark:border-slate-700 rounded-xl">
                            <table className="w-full text-left text-xs">
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
                                  <td className="p-3 text-right font-bold text-rose-500">-{formatRp(cicilanBulanan)}</td>
                                </tr>
                                <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                  <td className="p-3 font-medium text-slate-800 dark:text-slate-200">Bulan Sebelumnya</td>
                                  <td className="p-3 text-slate-600 dark:text-slate-400">Angsuran otomatis via pemotongan gaji</td>
                                  <td className="p-3 text-right font-bold text-rose-500">-{formatRp(cicilanBulanan)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>

                      </div>
                    </div>
                  );
                })}

                <div className="p-3.5 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-2 leading-relaxed">
                   <Info size={15} className="shrink-0 text-teal-500 mt-0.5" />
                   <span>Catatan: Rincian ini adalah proyeksi berdasarkan data bendahara. Sisa hutang berkurang setiap kali slip gaji bulanan disahkan. Apabila melakukan pelunasan tunai di luar slip gaji, harap konfirmasi ke Bendahara Sekolah.</span>
                </div>
              </div>
            </>
          )}
        </div>
        )}

        {/* 5. Riwayat Gaji */}
        {activeSection === 'portal_riwayat' && (
        <div className="space-y-4 sm:space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-300">
          {/* KARTU 1: KPI RINGKASAN ARSIP GAJI */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4">
            <div className="bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Arsip</span>
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <Archive size={16} />
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100">{riwayatAsli.length}</span>
                  <span className="text-xs font-bold text-slate-400">Bulan</span>
                </div>
                <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                  Dokumen slip tersimpan
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Arsip Terakhir</span>
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Calendar size={16} />
                </div>
              </div>
              <div>
                <div className="text-sm sm:text-base font-black text-slate-800 dark:text-slate-100 truncate">
                  {riwayatAsli[0]?.periode || 'Belum Ada'}
                </div>
                <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">
                  {riwayatAsli[0]?.tanggal || '-'}
                </div>
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1 bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status Dokumen</span>
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <ShieldCheck size={16} />
                </div>
              </div>
              <div>
                <div className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <span>Resmi &amp; Sah</span>
                </div>
                <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                  Disetujui Kepala Sekolah
                </div>
              </div>
            </div>
          </div>

          {/* KARTU 2: DAFTAR DOKUMEN ARSIP (Dual-Mode: Mobile Card Feed + Desktop Table) */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs overflow-hidden">
            <div className="px-3.5 sm:px-5 py-3 sm:py-3.5 bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
              <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm flex items-center gap-2">
                <History size={16} className="text-indigo-500" />
                <span>Daftar Slip Gaji Diarsipkan</span>
              </h4>
              <span className="text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
                {riwayatAsli.length} Dokumen
              </span>
            </div>

            {/* Mobile View: Dedicated Card Feed (md:hidden) */}
            <div className="p-3 space-y-3 md:hidden">
              {riwayatAsli.map((item) => (
                <div 
                  key={item.idArsip} 
                  className="bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-3.5 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-600 transition-all space-y-3"
                >
                  {/* Baris 1: Periode & Badge Disahkan */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                        <Calendar size={15} />
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Periode Gaji</span>
                        <h4 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100">{item.periode}</h4>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px] font-bold border border-emerald-200/50 dark:border-emerald-800/40">
                      <CheckCircle2 size={11} className="text-emerald-500" /> Disahkan
                    </span>
                  </div>

                  {/* Baris 2: Nominal THP & Tanggal */}
                  <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Gaji Bersih (THP)</span>
                      <span className="text-base font-black text-emerald-600 dark:text-emerald-400">{formatRp(item.nominal)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-medium text-slate-400 block">Tgl Pengesahan</span>
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{item.tanggal}</span>
                    </div>
                  </div>

                  {/* Baris 3: Tombol Aksi Buka Slip */}
                  <button 
                    onClick={() => {
                      setSelectedHistorySlip(item);
                      setIsSlipModalOpen(true);
                    }} 
                    className="w-full py-2.5 px-4 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer active:scale-[0.98]"
                  >
                    <FileText size={15} />
                    <span>Buka &amp; Cetak Slip Gaji (A4)</span>
                  </button>
                </div>
              ))}

              {riwayatAsli.length === 0 && (
                <div className="py-8 px-4 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center mx-auto mb-3 text-indigo-400">
                    <Archive size={24} />
                  </div>
                  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Belum ada riwayat gaji tersimpan</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">Data akan muncul di sini setelah Admin/Bendahara melakukan Tutup Buku bulanan.</p>
                </div>
              )}
            </div>

            {/* Desktop View: Full Table (hidden md:block) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap min-w-max">
                <thead className="bg-slate-50/80 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-700/80">
                  <tr>
                    <th className="p-3.5 font-semibold">Periode Bulan</th>
                    <th className="p-3.5 font-semibold text-right">Total Bersih (THP)</th>
                    <th className="p-3.5 font-semibold">Tanggal Pengesahan</th>
                    <th className="p-3.5 font-semibold text-center">Status</th>
                    <th className="p-3.5 font-semibold text-center">Aksi Dokumen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {riwayatAsli.map((item) => (
                    <tr key={item.idArsip} className="hover:bg-indigo-50/40 dark:hover:bg-slate-800/40 transition-colors group">
                      <td className="p-3.5 font-medium text-slate-800 dark:text-slate-200">
                        <div className="flex items-center gap-2">
                          <Calendar size={15} className="text-indigo-400" />
                          <span className="font-semibold">{item.periode}</span>
                        </div>
                      </td>
                      <td className="p-3.5 font-black text-emerald-600 dark:text-emerald-400 text-right">
                        {formatRp(item.nominal)}
                      </td>
                      <td className="p-3.5 text-xs text-slate-600 dark:text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 size={13} className="text-emerald-500" />
                          <span>{item.tanggal}</span>
                        </div>
                      </td>
                      <td className="p-3.5 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-xs font-bold border border-emerald-200/50 dark:border-emerald-800/40">
                          Disahkan
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <button 
                          onClick={() => {
                            setSelectedHistorySlip(item);
                            setIsSlipModalOpen(true);
                          }} 
                          className="text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 hover:border-indigo-300 text-slate-700 dark:text-slate-200 px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 mx-auto shadow-xs group-hover:shadow cursor-pointer"
                        >
                          <FileText size={13} /> Lihat Rincian
                        </button>
                      </td>
                    </tr>
                  ))}
                  {riwayatAsli.length === 0 && (
                    <tr>
                      <td colSpan="5" className="p-10 text-center text-slate-400">
                        <Archive size={36} className="mb-2 opacity-30 text-indigo-500 mx-auto" />
                        <p className="font-bold text-sm text-slate-600 dark:text-slate-300">Belum ada riwayat gaji yang tersimpan.</p>
                        <p className="text-xs mt-0.5 text-slate-400">Data akan muncul di sini setelah Admin melakukan "Tutup Buku" pada akhir bulan.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Catatan Privasi Dokumen */}
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 pt-1 pb-2">
            <ShieldCheck size={13} className="shrink-0 text-indigo-500" />
            <span>Dokumen slip gaji merupakan dokumen rahasia. Jaga kerahasiaan berkas yang Anda unduh.</span>
          </div>
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
                disabled={isSendingFeedback}
                className="flex items-center gap-2 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-rose-500/30 transition-all hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSendingFeedback ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Send size={18} />}
                {isSendingFeedback ? 'Mengirim...' : 'Kirim Masukan Sekarang'}
              </button>
            </div>
          </form>
        </div>
      )}

      </div>
    </div>

    {/* 📱 PREMIUM SLIM & ERGONOMIC BOTTOM NAVIGATION (KHUSUS MOBILE) */}
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-[100] pointer-events-none">
      
      {/* Background Dasar Nav Bar */}
      <div className="absolute bottom-0 w-full h-[62px] bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl rounded-t-2xl shadow-[0_-8px_25px_rgba(0,0,0,0.08)] pointer-events-auto border-t border-slate-200/80 dark:border-slate-700/80"></div>
      
      {/* Scrollable Container dengan Tinggi Ergonomis */}
      <div className="relative flex items-center justify-between px-1.5 h-[62px] overflow-x-auto hide-scrollbar snap-x touch-pan-x scroll-smooth pointer-events-auto gap-0.5">
        {bottomNavItems.map(item => {
           const isActive = activeSection === item.id;

           // Helper penentuan warna dinamis
           const getGradient = (id) => {
             switch(id) {
               case 'portal_dashboard': return 'from-blue-500 to-indigo-600';
               case 'portal_jadwal': return 'from-pink-500 to-rose-600';
               case 'portal_kehadiran': return 'from-amber-500 to-orange-600';
               case 'portal_gaji': return 'from-emerald-500 to-teal-600';
               case 'portal_pinjaman': return 'from-teal-500 to-cyan-600';
               case 'portal_riwayat': return 'from-indigo-500 to-blue-600';
               case 'portal_info': return 'from-purple-500 to-pink-600';
               case 'portal_saran': return 'from-rose-500 to-red-600';
               default: return 'from-slate-500 to-slate-700';
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
               className="snap-center relative flex flex-col items-center justify-center shrink-0 min-w-[58px] sm:min-w-[66px] h-full outline-none group py-1"
             >
               {/* Icon Container */}
               <div className={`flex items-center justify-center transition-all duration-200 relative ${
                 isActive 
                   ? `w-9 h-9 rounded-xl bg-gradient-to-br ${getGradient(item.id)} text-white shadow-md shadow-blue-500/20 scale-105` 
                   : 'w-8 h-8 rounded-lg bg-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
               }`}>
                 <item.icon 
                   size={isActive ? 19 : 18} 
                   strokeWidth={isActive ? 2.5 : 2} 
                   className="transition-transform duration-200" 
                 />
                 
                 {/* Red Dot Notifikasi */}
                 {(item.id === 'portal_gaji' && myData.payroll?.isNotified && !myData.payroll?.isConfirmed) && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-slate-800 animate-pulse shadow-xs"></span>
                 )}
               </div>

               {/* Teks Label (Selalu terbaca, rapi & presisi) */}
               <span className={`text-[10px] tracking-tight mt-0.5 transition-colors duration-200 truncate max-w-[56px] text-center ${
                 isActive 
                   ? `font-black ${getTextColor(item.id)}` 
                   : 'font-semibold text-slate-400 dark:text-slate-500'
               }`}>
                 {item.label}
               </span>
               
               {/* Indikator Titik Aktif */}
               <div className={`w-1 h-1 rounded-full mt-0.5 transition-all duration-200 ${isActive ? `bg-current ${getTextColor(item.id)} opacity-100 scale-100` : 'opacity-0 scale-0'}`}></div>
             </button>
           );
        })}
      </div>
    </div>
    </>
  );
}

// [MODULARISASI] PengaturanView telah dimodularisasi ke src/features/admin/PengaturanView.jsx
