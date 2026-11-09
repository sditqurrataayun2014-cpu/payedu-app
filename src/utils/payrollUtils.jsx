import React, { useState, useEffect } from 'react';

// --- DATA DUMMY & KONSTANTA MASTER ---
export const TENURE_RATES = {
  2010: 1921768, 2011: 1812989, 2012: 1710367, 2013: 1613554, 2014: 1522221,
  2015: 1436057, 2016: 1354771, 2017: 1278086, 2018: 1205741, 2019: 1137492,
  2020: 1073105, 2021: 1012364, 2022: 955060, 2023: 901000, 2024: 850000
};

export const EDU_RATES = { 'S2': 400000, 'S1': 300000, 'Diploma': 200000, 'SMA/Pondok': 100000 };

export const JOB_CATEGORIES = ['Kepala Sekolah', 'Kepala Bidang', 'Kepala Sub Bidang', 'Wali Kelas', 'Guru', 'Staff', 'Operasional'];
export const JOB_ROLES = ['Kepala Sekolah', 'Wakil Kepala Sekolah', 'Waka. Sarpras', 'Tata Usaha', 'Waka. Humas', 'Waka. Kesiswaan Putra', 'Waka. Kesiswaan Putri', 'Waka. Kurikulum', 'Waka. Kesiswaan', 'Bendahara Bos', 'Koordinator Tahfidz Putra', 'Koordinator Tahfidz Putri', 'Koord. Bahasa', 'Wali Kelas', 'Guru Mapel', 'Satpam Sekolah Putra', 'Petugas Kebersihan', 'Pengabdian', 'Lainnya'];
export const KINERJA_LEVELS = ['Sangat Baik', 'Baik', 'Cukup', 'Kurang'];
export const KINERJA_RATES = { 'Sangat Baik': 100000, 'Baik': 50000, 'Cukup': 0, 'Kurang': 0 };
export const KOMPETENSI_FIELDS = ['Tahsin Qur\'an', 'Tahsin Tahfidz', 'Komputer Dan Administrasi', 'Bahasa Arab', 'Bahasa Inggris', 'Lainnya'];
export const KOMPETENSI_LEVELS = ['Sangat Ahli', 'Ahli', 'Cukup Ahli', 'Pra Ahli', 'Pemula'];
export const KOMPETENSI_LEVEL_RATES = { 'Sangat Ahli': 150000, 'Ahli': 100000, 'Cukup Ahli': 75000, 'Pra Ahli': 50000, 'Pemula': 25000 };
export const INSENTIF_LIST = ['Koordinator Tahfidz', 'Tugas Harian', 'Operator', 'Kajian & Tahta Guru', 'Pembantu Sarpras', 'Kebersihan Putra', 'Personalia', 'Notulen Rapat', 'Asisten Tu', 'Asisten Wali Kelas', 'Kebersihan & Security Putri', 'Asisten Operator', 'Penguji Tasmi', 'Penguji Kenaikan Iqro', 'Pengabdian', 'Buka/Kunci Pintu Sekolah Lk', 'Buka/Kunci Pintu Sekolah Pr', 'Guru GTT', 'Satpam Sekolah Putra', 'Lainnya'];
export const POTONGAN_LIST = ['Kasbon Sekolah', 'Cicilan Koperasi', 'Iuran PGRI', 'Dana Sosial', 'Pinjaman Rekan Guru', 'Pembayaran Barang', 'Lainnya'];
export const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

// Kamus nama bulan bahasa Indonesia & Inggris untuk normalisasi tanggal kebal eror
export const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const MONTH_INDEX_MAP = {
  januari: 0, jan: 0, january: 0,
  februari: 1, feb: 1, february: 1,
  maret: 2, mar: 2, march: 2,
  april: 3, apr: 3,
  mei: 4, may: 4,
  juni: 5, jun: 5, june: 5,
  juli: 6, jul: 6, july: 6,
  agustus: 7, agu: 7, aug: 7, august: 7,
  september: 8, sep: 8, sept: 8,
  oktober: 9, okt: 9, oct: 9, october: 9,
  november: 10, nov: 10,
  desember: 11, des: 11, dec: 11, december: 11
};

// Cek status keaktifan pegawai
export const isTeacherActive = (t) => {
  if (!t) return false;
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

// Helper Failsafe untuk Penyimpanan Lokal
export const safeStorageGet = (key, fallback) => {
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

export const safeStorageSet = (key, value) => {
  try {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    localStorage.setItem(key, str);
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22 || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      console.error(`Penyimpanan penuh saat mencoba menyimpan ${key}`);
      alert(`PERINGATAN KRITIKAL: Memori Penyimpanan Penuh!\n\nGagal menyimpan data baru. Memori penyimpanan browser Anda telah mencapai batas maksimal.\n\nSolusi: Buka menu Pengaturan > Sistem, lakukan "Backup Database", lalu bersihkan data lama.`);
    } else {
      console.error(`Gagal menyimpan ${key} ke LocalStorage:`, e);
    }
  }
};

export const getLocalIsoDate = (d = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const formatRp = (angka) => {
  const num = Number(angka) || 0;
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
};

export const formatInputRupiah = (val) => {
  if (val === null || val === undefined || val === '') return '';
  if (val === 0 || val === '0') return '0';
  const cleanStr = String(val).replace(/\D/g, '');
  if (!cleanStr) return '';
  return new Intl.NumberFormat('id-ID').format(cleanStr);
};

export const parseInputRupiah = (valStr) => {
  if (valStr === null || valStr === undefined || valStr === '') return 0;
  const cleanStr = String(valStr).replace(/\D/g, '');
  return cleanStr ? Number(cleanStr) : 0;
};

export function FormattedRupiahInput({ value, onChange, className = "", placeholder = "0", ...props }) {
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
}

export const parseSmartDate = (dateStr) => {
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

export const formatDateId = (dateString, options = { day: 'numeric', month: 'long', year: 'numeric' }) => {
  if (!dateString || dateString === '-') return '-';
  const d = parseSmartDate(dateString);
  if (!d) return String(dateString);
  return d.toLocaleDateString('id-ID', options);
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

// Fungsi Helper untuk Terbilang (Mengubah Angka menjadi Teks)
export const terbilang = (angka) => {
  const bilangan = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];
  let temp = "";
  angka = Math.floor(Math.abs(Number(angka) || 0));
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
  } else if (angka < 1000000000000) {
    temp = terbilang(Math.floor(angka / 1000000000)) + " Miliar" + terbilang(angka % 1000000000);
  }
  return temp;
};

export const simpleHash = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return 'qa_' + Math.abs(hash).toString(16);
};

export const generateUniqueId = (prefix = '') => {
  return `${prefix}${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

// Helper untuk mengurai berbagai format string periode menjadi Date object valid (Mencegah "Invalid Date")
export const parsePeriodToDate = (periodStr) => {
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

export const getFormattedPeriod = (periodStr) => {
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

  // Jika berformat "YYYY-MM"
  const ymMatch = str.match(/^(\d{4})-(\d{1,2})$/);
  if (ymMatch) {
    const year = ymMatch[1];
    const monthIdx = parseInt(ymMatch[2], 10) - 1;
    if (monthIdx >= 0 && monthIdx < 12) {
      return `${MONTH_NAMES_ID[monthIdx]} ${year}`;
    }
  }

  return str;
};

export const calculatePayroll = (teacher, settings) => {
  if (!teacher) return { tMasaKerja: 0, tJabatan: 0, tPendidikan: 0, tKompetensi: 0, bonusHadir: 0, potongTelat: 0, tDisiplin: 0, tKeluargaWife: 0, tKeluargaAnak: 0, tKeluarga: 0, tTambahan: 0, tMengajar: 0, jamDihitung: 0, jamPlus: 0, tPotonganLainnya: 0, totalKotor: 0, totalPotongan: 0, totalBersih: 0 };
  const p = teacher.payroll || {}; 
  const family = teacher.family || {}; 
  
  const isTetap = teacher.status === 'Tetap';
  
  let tMasaKerja = 0;
  const tmtYear = new Date(teacher.tmt || new Date()).getFullYear();
  
  let manualTenure = p.tunjanganMasaKerjaManual;
  if (manualTenure !== undefined && manualTenure !== null && manualTenure !== "") {
    tMasaKerja = Number(manualTenure) || 0; 
  } else if (!isTetap) {
    tMasaKerja = 0;
  } else {
    tMasaKerja = (settings?.masterRates?.TENURE_RATES || TENURE_RATES)[tmtYear] || 0;
  }

  const tJabatan = (p.jabatans || []).reduce((sum, j) => sum + (Number(j.nominal) || 0), 0);
  
  let tPendidikan = 0;
  if (!isTetap) {
    tPendidikan = 0;
  } else {
    let manualEdu = p.pendidikan?.nominalOverride;
    if (manualEdu === 0) manualEdu = '';
    tPendidikan = manualEdu !== undefined && manualEdu !== '' ? (Number(manualEdu) || 0) : ((settings?.masterRates?.EDU_RATES || EDU_RATES)[teacher.education] || 0);
  }
  
  const tKompetensi = (p.kompetensi || []).reduce((sum, item) => sum + (Number(item.nominal) || 0), 0);
  
  const realJam = Number(p.jamMengajar?.realisasi) || 0;
  const telat = Number(p.disiplin?.telat) || 0;
  const tepatWaktu = Math.max(0, realJam - telat);

  const bonusHadir = tepatWaktu * (Number(p.disiplin?.tarifHadir) || 0);
  const potongTelat = telat * (Number(p.disiplin?.tarifTelat) || 0);
  const tDisiplin = bonusHadir - potongTelat;

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
  
  const tInsidentalJam = (p.kegiatanInsidental || []).reduce((sum, item) => sum + (Number(item.jam) || 0), 0);

  let jamDihitung = 0;
  const targetWajib = p.jamMengajar?.wajib !== undefined && p.jamMengajar?.wajib !== '' ? (Number(p.jamMengajar.wajib) || 0) : (teacher.status === 'Tetap' ? 60 : 0);
  const jsjm = Number(p.jamMengajar?.jsjm) || 0; 
  const jamPlus = Number(p.jamMengajar?.jamPlus) || 0; 
  
  jamDihitung = Math.max(0, (realJam + jsjm) - targetWajib) + jamPlus + tInsidentalJam;
  
  const tMengajar = jamDihitung * (Number(p.jamMengajar?.tarifJPL) || 0);

  const totalKotor = tMasaKerja + tJabatan + tPendidikan + tKompetensi + bonusHadir + tKeluarga + tTambahan + tMengajar;
  const totalPotongan = potongTelat + tPotonganLainnya;
  const totalBersih = Math.max(0, totalKotor - totalPotongan);

  return {
    tMasaKerja, tJabatan, tPendidikan, tKompetensi, 
    bonusHadir, potongTelat, tDisiplin,
    tKeluargaWife, tKeluargaAnak, tKeluarga,
    tTambahan, tMengajar, jamDihitung, jamPlus,
    tPotonganLainnya,
    totalKotor, totalPotongan, totalBersih
  };
};

export const exportToPDF = (elementId, filename) => {
  return new Promise((resolve, reject) => {
    const element = document.getElementById(elementId);
    if (!element) {
      alert("Elemen dokumen tidak ditemukan.");
      return reject("Element not found");
    }
    
    const opt = {
      margin:       5,
      filename:     filename,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false },
      jsPDF:        { unit: 'mm', format: [215.9, 330.2], orientation: 'portrait' }
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

export const sanitizeTeacherData = (t) => {
  if (!t || typeof t !== 'object') return t;
  let result = { ...t };

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

  if (result.education && typeof result.education === 'object') {
    result.education = result.education.tingkat || 'S1';
  }

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

export const parseLogTimestamp = (log) => {
  if (!log) return 0;
  if (log.timestamp) {
    const t = Number(log.timestamp);
    if (!isNaN(t) && t > 0) return t;
  }
  if (log.created_at) {
    const t = new Date(log.created_at).getTime();
    if (!isNaN(t)) return t;
  }
  if (typeof log.id === 'string' && log.id.startsWith('log-')) {
    try {
      const b36 = log.id.replace('log-', '').substring(0, 8);
      const parsed = parseInt(b36, 36);
      if (!isNaN(parsed) && parsed > 1000000000000) return parsed;
    } catch (e) {}
  }
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

export const sortLoginLogs = (logs) => {
  if (!Array.isArray(logs)) return [];
  return [...logs].sort((a, b) => parseLogTimestamp(b) - parseLogTimestamp(a));
};

export const calculateYearsFromDate = (dateStr) => {
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

export const generateTeacherId = (currentTeachers) => {
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

// 🪄 FITUR MASTER & SETTINGS DEFAULT UNIVERSAL
export const defaultMasterRates = {
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

export const defaultGeneralSettings = {
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


