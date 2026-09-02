import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Clock, Clock3, LogIn, LogOut, CheckCircle2, AlertTriangle, XCircle,
  Search, Download, Printer, Edit, Trash2, Settings, Save,
  CalendarClock, CalendarDays, AlertCircle, MapPin, ScanLine, Navigation, ShieldCheck,
  Loader2, Copy, RefreshCw, Camera, QrCode, Crosshair, VideoOff
} from 'lucide-react';
import jsQR from 'jsqr';
import { pushPresensiGuru } from './services/dbService';

// ==========================================
// KONSTANTA & HELPER LOKAL
// ==========================================
const formatCSVField = (val) => {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  if (str.includes(',') || str.includes(';') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
};

const cx = {
  label: "block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 pl-1",
  input: "w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 dark:text-white text-sm transition-shadow",
  inputFocus: "w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-teal-500 dark:text-white text-sm shadow-inner transition-shadow",
  sectionHeader: "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5",
  pageWrapper: "space-y-6 animate-in fade-in duration-500 pb-12 font-sans w-full",
  card3xl: "bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm",
};

const DEFAULT_SETTINGS = {
  jamMasuk: '07:00', toleransiMenit: 15, jamPulang: '14:00',
  // Validasi kehadiran fisik (opsional — dinonaktifkan otomatis selama belum diatur Admin)
  // FITUR BARU: multi-lokasi (CRUD) — sekolah bisa punya beberapa titik/gedung berbeda.
  // `lokasi` (tunggal, lama) tetap didukung sebagai fallback otomatis untuk data lama.
  lokasi: { latitude: null, longitude: null, radiusMeter: 150 },
  lokasiList: [],
  qrToken: '',
  // FITUR BARU: multi-sesi (CRUD) — mendukung sesi Pagi (KBM) & Sore (Halaqoh Al-Qur'an),
  // atau sesi lain yang diatur bebas oleh Admin. Sesi pertama = sesi utama/legacy.
  sesiList: [
    { id: 'pagi', nama: 'Pagi (KBM)', jamMasuk: '07:00', toleransiMenit: 15, jamPulang: '14:00' },
  ],
};
const STATUS_OPTIONS = ['Hadir', 'Terlambat', 'Sakit', 'Izin', 'Alpa', 'Cuti', 'Dinas Luar'];
const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const QR_PREFIX = 'EDUFINANCE-PRESENSI';

const todayStr = (d = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const toMinutes = (hhmm) => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const nowToHHMMSS = (d) => d.toTimeString().slice(0, 8);
const formatJam = (hhmmss) => hhmmss ? hhmmss.slice(0, 5) : '--:--';
const formatTanggalPanjang = (d) => d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// Jarak antar 2 koordinat GPS (rumus Haversine), hasil dalam meter
const hitungJarakMeter = (lat1, lon1, lat2, lon2) => {
  if ([lat1, lon1, lat2, lon2].some(v => v === null || v === undefined || Number.isNaN(v))) return null;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
};

// Menggabungkan lokasiList (baru) dengan lokasi tunggal (lama, fallback) agar data lama tetap jalan
const getLokasiList = (settings) => {
  const list = Array.isArray(settings?.lokasiList) ? settings.lokasiList.filter(l => l && l.latitude != null && l.longitude != null) : [];
  if (list.length > 0) return list;
  if (settings?.lokasi?.latitude != null && settings?.lokasi?.longitude != null) {
    return [{ id: 'legacy', nama: 'Lokasi Sekolah', latitude: settings.lokasi.latitude, longitude: settings.lokasi.longitude, radiusMeter: settings.lokasi.radiusMeter || 150 }];
  }
  return [];
};

// Mencari lokasi (dari beberapa lokasi terdaftar) yang PALING DEKAT dengan posisi guru saat ini
const cariLokasiTerdekat = (lat, lon, lokasiList) => {
  let terbaik = null;
  for (const lok of lokasiList) {
    const jarak = hitungJarakMeter(lat, lon, lok.latitude, lok.longitude);
    if (jarak === null) continue;
    if (!terbaik || jarak < terbaik.jarak) terbaik = { ...lok, jarak, dalamRadius: jarak <= (lok.radiusMeter || 150) };
  }
  return terbaik;
};

const generateLokasiId = () => 'lok_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const generateSesiId = () => 'sesi_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Buat token QR presensi baru (acak, unik tiap kali admin generate ulang)
const generateQrToken = () =>
  Math.random().toString(36).slice(2, 8).toUpperCase() + Date.now().toString(36).toUpperCase().slice(-5);

const buildQrPayload = (npsn, qrToken) => `${QR_PREFIX}|${npsn || 'SEKOLAH'}|${qrToken}`;
const buildQrImageUrl = (payload) => `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(payload)}`;

// Apakah validasi lokasi/QR sudah diaktifkan Admin (progresif, tidak wajib)
const isLokasiAktif = (settings) => getLokasiList(settings).length > 0;
const isQrAktif = (settings) => !!settings?.qrToken;

// Daftar sesi efektif (selalu minimal 1 sesi, migrasi otomatis dari jamMasuk/jamPulang lama)
const getSesiList = (settings) => {
  if (Array.isArray(settings?.sesiList) && settings.sesiList.length > 0) return settings.sesiList;
  return [{ id: 'pagi', nama: 'Pagi (KBM)', jamMasuk: settings?.jamMasuk || '07:00', toleransiMenit: settings?.toleransiMenit ?? 15, jamPulang: settings?.jamPulang || '14:00' }];
};

// ==========================================
// FITUR BARU: JADWAL GURU PER HARI (SENIN-SABTU) & SESI
// Admin bisa checklist guru mana saja yang wajib presensi pada kombinasi
// hari + sesi tertentu (mis. Guru A hanya masuk sesi Pagi di hari Senin-Kamis,
// Guru B masuk sesi Sore setiap hari), karena jam kerja tiap guru berbeda-beda.
// ==========================================
const HARI_LIST = [
  { id: 'senin', nama: 'Senin' },
  { id: 'selasa', nama: 'Selasa' },
  { id: 'rabu', nama: 'Rabu' },
  { id: 'kamis', nama: 'Kamis' },
  { id: 'jumat', nama: "Jum'at" },
  { id: 'sabtu', nama: 'Sabtu' },
];
// JS Date.getDay(): 0=Minggu, 1=Senin, ... 6=Sabtu. Minggu dianggap libur (tidak ada jadwal presensi).
const JS_DAY_TO_HARI = { 1: 'senin', 2: 'selasa', 3: 'rabu', 4: 'kamis', 5: 'jumat', 6: 'sabtu' };
const getHariIni = (d = new Date()) => JS_DAY_TO_HARI[d.getDay()] || null;
const getJadwalGuru = (settings) => settings?.jadwalGuru || {};

// Apakah guru dijadwalkan hadir pada kombinasi hari+sesi tertentu.
// Jika Admin BELUM pernah mengatur jadwal untuk kombinasi ini (key tidak ada),
// defaultnya SEMUA guru aktif dianggap terjadwal — supaya sekolah yang belum
// sempat mengatur jadwal detail tetap bisa memakai presensi seperti biasa.
const isGuruTerjadwal = (settings, hariKey, sesiId, teacherId) => {
  if (!hariKey) return false;
  const daftar = getJadwalGuru(settings)?.[hariKey]?.[sesiId];
  if (!Array.isArray(daftar)) return true;
  return daftar.includes(teacherId);
};

const computeStatus = (captureDate, sesi) => {
  const targetMin = toMinutes(sesi.jamMasuk) + (Number(sesi.toleransiMenit) || 0);
  const actualMin = captureDate.getHours() * 60 + captureDate.getMinutes();
  const terlambatMenit = Math.max(0, actualMin - targetMin);
  return { status: terlambatMenit > 0 ? 'Terlambat' : 'Hadir', terlambatMenit };
};

const STATUS_BADGE = {
  Hadir: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800',
  Terlambat: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
  Sakit: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800',
  Izin: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 border border-violet-200 dark:border-violet-800',
  Alpa: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border border-rose-200 dark:border-rose-800',
  Cuti: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700',
  'Dinas Luar': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800',
  'Belum Absen': 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500 border border-slate-200 dark:border-slate-700 border-dashed',
};

const Badge = ({ children, colorClass }) => (
  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${colorClass}`}>
    {children}
  </span>
);

const Modal = ({ isOpen, onClose, title, children, maxWidth }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className={`bg-white dark:bg-slate-800 rounded-[2rem] shadow-2xl w-full ${maxWidth || 'max-w-md'} overflow-hidden flex flex-col transform transition-all animate-in zoom-in-95`}>
        <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20">
          <h3 className="font-black text-lg text-slate-800 dark:text-white tracking-tight">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Tutup" className="text-slate-400 hover:text-rose-500 transition-colors p-1 rounded-full hover:bg-rose-50 dark:hover:bg-rose-900/30">
            <XCircle size={24} strokeWidth={2.5} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto max-h-[75vh] custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

// Tiap kartu statistik punya warna gradien khasnya sendiri agar halaman
// Presensi Guru & Staff terlihat lebih hidup dan mudah dibedakan sekilas mata.
const StatCard = ({ icon: Icon, label, value, gradient, iconBg }) => (
  <div className={`rounded-2xl shadow-sm p-4 flex items-center gap-3 bg-gradient-to-br ${gradient} relative overflow-hidden`}>
    <div className="absolute -right-4 -bottom-6 w-20 h-20 bg-white/10 rounded-full pointer-events-none" />
    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 relative z-10 ${iconBg}`}>
      <Icon size={20} strokeWidth={2.5} className="text-white" />
    </div>
    <div className="min-w-0 relative z-10">
      <p className="text-[10px] font-black text-white/70 uppercase tracking-widest truncate">{label}</p>
      <p className="text-xl font-black text-white">{value}</p>
    </div>
  </div>
);

// ==========================================
// VIEW UTAMA
// ==========================================
export default function PresensiGuruView({
  teachers = [], presensiGuru = [], setPresensiGuru,
  currentUser, schoolProfile, setSchoolProfile,
  showCsvPreview, triggerPrint, addAuditLog,
}) {
  // Toast & Confirm state
  const [toastMessage, setToastMessage] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const showToast = useCallback((msg, type = 'info') => {
    setToastMessage({ text: msg, type });
    setTimeout(() => {
      setToastMessage(prev => prev?.text === msg ? null : prev);
    }, 4000);
  }, []);

  const showConfirm = useCallback((msg, onConfirm) => {
    if (window.confirm) {
      if (window.confirm(msg)) {
        onConfirm();
      }
    } else {
      setConfirmDialog({
        message: msg,
        onConfirm: () => {
          onConfirm();
          setConfirmDialog(null);
        },
        onCancel: () => setConfirmDialog(null)
      });
    }
  }, []);

  const defaultShowCsvPreview = useCallback((csvContent, fileName) => {
    try {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', fileName || 'rekap_presensi.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(`File ${fileName || 'CSV'} berhasil diunduh!`, 'success');
    } catch (err) {
      console.error("Gagal unduh CSV:", err);
      showToast('Gagal mengunduh file CSV.', 'error');
    }
  }, [showToast]);

  const effectiveShowCsvPreview = showCsvPreview || defaultShowCsvPreview;
  const effectiveTriggerPrint = triggerPrint || (() => window.print());

  const isTeacher = currentUser?.portal === 'Teacher' || currentUser?.role === 'Guru' || currentUser?.role === 'Staff';
  const isAdmin = currentUser?.portal === 'Admin' || String(currentUser?.role || '').toLowerCase() === 'admin' || currentUser?.role === 'Kepala Sekolah';
  const readOnly = currentUser?.portal === 'Monitoring';

  const settings = useMemo(() => {
    let localSaved = {};
    try {
      const raw = localStorage.getItem('payedu_presensi_guru_settings');
      if (raw) localSaved = JSON.parse(raw);
    } catch (e) {}

    const merged = {
      ...DEFAULT_SETTINGS,
      ...localSaved,
      ...(schoolProfile?.presensiGuruSettings || {}),
    };
    return {
      ...merged,
      lokasi: { ...DEFAULT_SETTINGS.lokasi, ...(merged.lokasi || {}) },
      lokasiList: getLokasiList(merged),
      sesiList: getSesiList(merged),
    };
  }, [schoolProfile?.presensiGuruSettings]);
  const sesiUtamaId = settings.sesiList[0]?.id;
  const activeTeachers = useMemo(() => (teachers || []).filter(t => t.status !== 'Non-Aktif').sort((a, b) => (a.name || '').localeCompare(b.name || '')), [teachers]);

  // Jam berjalan (live clock)
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Data lama (sebelum fitur multi-sesi) tidak punya sesiId — dianggap milik sesi utama/pertama.
  const sesiRecord = (r, sesiId) => (r.sesiId || sesiUtamaId) === sesiId;

  const upsertRecord = (teacherId, teacherName, date, sesiId, patch) => {
    let updated = [];
    const idx = (presensiGuru || []).findIndex(r => r.teacherId === teacherId && r.date === date && sesiRecord(r, sesiId));
    if (idx >= 0) {
      updated = [...presensiGuru];
      updated[idx] = { ...updated[idx], ...patch, sesiId, updatedAt: new Date().toISOString(), updatedBy: currentUser?.name || 'Sistem' };
    } else {
      updated = [
        ...(presensiGuru || []),
        {
          id: 'pg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          teacherId, teacherName, date, sesiId,
          jamMasuk: null, jamPulang: null, status: 'Alpa', terlambatMenit: 0, keterangan: '',
          ...patch,
          updatedAt: new Date().toISOString(), updatedBy: currentUser?.name || 'Sistem',
        },
      ];
    }
    if (typeof setPresensiGuru === 'function') {
      setPresensiGuru(updated);
    }

    // INSTANT LOCALSTORAGE BACKUP & DIRECT CLOUD PUSH
    try {
      localStorage.setItem('payedu_presensi_guru', JSON.stringify(updated));
    } catch (e) {}
    pushPresensiGuru(updated).catch(e => console.warn('[Presensi] Push warning:', e));
  };

  // Identifikasi profil guru yang sedang aktif/login
  const matchedTeacher = (
    activeTeachers.find(t => t.linkedUsername && t.linkedUsername === currentUser?.username)
    || activeTeachers.find(t => t.id === currentUser?.id)
    || activeTeachers.find(t => (t.name || '').trim().toLowerCase() === (currentUser?.name || '').trim().toLowerCase())
    || (currentUser?.username ? activeTeachers.find(t => (t.name || '').toLowerCase().replace(/[^a-z]/g, '').includes((currentUser.username || '').toLowerCase())) : null)
    || (activeTeachers.length > 0 && !isAdmin ? activeTeachers[0] : null)
  );

  return (
    <div className={cx.pageWrapper}>
      {/* TOAST POPUP NOTIFIKASI */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-[1000] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className={`px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-2.5 text-sm font-bold ${
            toastMessage.type === 'error'
              ? 'bg-rose-600 text-white border-rose-700 shadow-rose-500/20'
              : toastMessage.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-700 shadow-emerald-500/20'
              : 'bg-slate-900 text-white border-slate-800 shadow-slate-900/20'
          }`}>
            {toastMessage.type === 'error' ? <AlertTriangle size={18} /> : toastMessage.type === 'success' ? <CheckCircle2 size={18} /> : <Clock size={18} />}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* CONFIRM DIALOG MODAL */}
      {confirmDialog && (
        <Modal isOpen={true} onClose={confirmDialog.onCancel} title="Konfirmasi Tindakan">
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
              {confirmDialog.message}
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className="flex-1 py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-colors shadow-sm"
              >
                Ya, Lanjutkan
              </button>
              <button
                type="button"
                onClick={confirmDialog.onCancel}
                className="px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold text-xs uppercase tracking-wider rounded-xl transition-colors"
              >
                Batal
              </button>
            </div>
          </div>
        </Modal>
      )}

      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            <Clock3 className="text-teal-500" size={26} /> Presensi Guru &amp; Staff
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
            Absensi digital terintegrasi — jam kedatangan &amp; keterlambatan dihitung otomatis.
          </p>
        </div>
      </div>

      {isTeacher ? (
        <TeacherSelfService
          now={now}
          settings={settings}
          teacher={matchedTeacher}
          presensiGuru={presensiGuru}
          upsertRecord={upsertRecord}
          showToast={showToast}
          addAuditLog={addAuditLog}
          currentUser={currentUser}
          schoolProfile={schoolProfile}
        />
      ) : (
        <AdminRekapPanel
          settings={settings}
          setSchoolProfile={setSchoolProfile}
          teachers={activeTeachers}
          presensiGuru={presensiGuru}
          upsertRecord={upsertRecord}
          setPresensiGuru={setPresensiGuru}
          readOnly={readOnly}
          isAdmin={isAdmin}
          showToast={showToast}
          showConfirm={showConfirm}
          showCsvPreview={effectiveShowCsvPreview}
          triggerPrint={effectiveTriggerPrint}
          addAuditLog={addAuditLog}
          currentUser={currentUser}
          schoolProfile={schoolProfile}
        />
      )}
    </div>
  );
}

// ==========================================
// SUB-VIEW: SELF SERVICE (PORTAL GURU)
// ==========================================
function TeacherSelfService({ now, settings, teacher, presensiGuru, upsertRecord, showToast, addAuditLog, currentUser, schoolProfile }) {
  const [showIzinModal, setShowIzinModal] = useState(false);
  const [izinStatus, setIzinStatus] = useState('Sakit');
  const [izinKeterangan, setIzinKeterangan] = useState('');
  const [verifikasiMode, setVerifikasiMode] = useState(null); // null | 'masuk' | 'pulang'

  const sesiSemua = settings.sesiList;
  const sesiUtamaId = sesiSemua[0]?.id;
  const hariIni = getHariIni(now instanceof Date ? now : new Date());
  // PERBAIKAN: hanya sesi yang dijadwalkan Admin untuk guru ini pada hari ini
  // yang ditampilkan — mendukung jam kerja berbeda per guru per hari.
  const sesiTerjadwalHariIni = useMemo(
    () => sesiSemua.filter(s => isGuruTerjadwal(settings, hariIni, s.id, teacher?.id)),
    [settings, hariIni, teacher?.id]
  );
  const sesiList = sesiTerjadwalHariIni;
  const multiSesi = sesiList.length > 1;
  const [selectedSesiId, setSelectedSesiId] = useState(sesiSemua[0]?.id);
  const sesiAktif = sesiList.find(s => s.id === selectedSesiId) || sesiList[0];

  const today = todayStr();
  const record = teacher && sesiAktif ? presensiGuru.find(r => r.teacherId === teacher.id && r.date === today && (r.sesiId || sesiUtamaId) === sesiAktif.id) : null;

  if (!teacher) {
    return (
      <div className={`${cx.card3xl} p-10 text-center`}>
        <AlertTriangle className="mx-auto text-amber-500 mb-3" size={40} />
        <p className="font-bold text-slate-700 dark:text-white">Akun Anda belum tertaut ke Data Guru.</p>
        <p className="text-sm text-slate-500 mt-1">
          Minta Admin membuka <b>Data Master &rarr; Data Guru</b>, edit data Anda, lalu pilih akun Anda di
          kolom <b>Akun Login Terkait</b>. Cara lama (mencocokkan nama persis antara Pengaturan &rarr; Pengguna
          Internal dan Data Guru) masih berfungsi sebagai cadangan, tapi menautkan langsung lebih pasti dan
          tidak terganggu perbedaan huruf besar/kecil, gelar, atau spasi.
        </p>
      </div>
    );
  }

  if (!sesiAktif) {
    return (
      <div className={`${cx.card3xl} p-10 text-center`}>
        <CalendarClock className="mx-auto text-slate-400 mb-3" size={40} />
        <p className="font-bold text-slate-700 dark:text-white">
          {hariIni ? 'Tidak ada jadwal presensi untuk Anda hari ini.' : 'Hari ini libur (Minggu) — tidak ada jadwal presensi.'}
        </p>
        <p className="text-sm text-slate-500 mt-1">Jika ini tidak sesuai, hubungi Admin untuk memeriksa <b>Jadwal Guru</b> di menu Pengaturan Presensi Guru.</p>
      </div>
    );
  }

  const sudahMasuk = !!record?.jamMasuk;
  const sudahPulang = !!record?.jamPulang;
  const isIzinLike = record && ['Sakit', 'Izin', 'Cuti', 'Dinas Luar'].includes(record.status) && !record.jamMasuk;

  const handleAbsenMasuk = (verifikasi = {}) => {
    if (sudahMasuk) { showToast(`Anda sudah melakukan absen masuk sesi ${sesiAktif.nama} hari ini.`, 'error'); return; }
    const capture = new Date();
    const { status, terlambatMenit } = computeStatus(capture, sesiAktif);
    const patch = { jamMasuk: nowToHHMMSS(capture), status, terlambatMenit, keterangan: '', sesiNama: sesiAktif.nama };
    if (verifikasi.lokasi) patch.lokasiMasuk = verifikasi.lokasi;
    if (verifikasi.qrValid !== undefined) patch.qrValidMasuk = verifikasi.qrValid;
    upsertRecord(teacher.id, teacher.name, today, sesiAktif.id, patch);
    showToast(
      status === 'Terlambat'
        ? `Absen masuk (${sesiAktif.nama}) tercatat pukul ${formatJam(nowToHHMMSS(capture))} — Terlambat ${terlambatMenit} menit.`
        : `Absen masuk (${sesiAktif.nama}) tercatat pukul ${formatJam(nowToHHMMSS(capture))} — Tepat waktu! 🎉`,
      status === 'Terlambat' ? 'error' : 'success'
    );
    const lokasiKet = verifikasi.lokasi ? `, ${verifikasi.lokasi.nama || 'lokasi'} ±${verifikasi.lokasi.jarakMeter}m` : '';
    const qrKet = verifikasi.qrValid ? ', QR tervalidasi' : '';
    addAuditLog?.(currentUser?.name, 'Absen Masuk', teacher.name, `Sesi ${sesiAktif.nama}, Pukul ${formatJam(nowToHHMMSS(capture))} (${status}${terlambatMenit ? `, telat ${terlambatMenit} menit` : ''}${lokasiKet}${qrKet})`, 'presensi_guru');
  };

  const handleAbsenPulang = (verifikasi = {}) => {
    if (!sudahMasuk) { showToast(`Anda belum melakukan absen masuk sesi ${sesiAktif.nama} hari ini.`, 'error'); return; }
    if (sudahPulang) { showToast(`Anda sudah melakukan absen pulang sesi ${sesiAktif.nama} hari ini.`, 'error'); return; }
    const capture = new Date();
    const patch = { jamPulang: nowToHHMMSS(capture) };
    if (verifikasi.lokasi) patch.lokasiPulang = verifikasi.lokasi;
    if (verifikasi.qrValid !== undefined) patch.qrValidPulang = verifikasi.qrValid;
    upsertRecord(teacher.id, teacher.name, today, sesiAktif.id, patch);
    showToast(`Absen pulang (${sesiAktif.nama}) tercatat pukul ${formatJam(nowToHHMMSS(capture))}. Sampai jumpa besok!`, 'success');
    const lokasiKet = verifikasi.lokasi ? `, ${verifikasi.lokasi.nama || 'lokasi'} ±${verifikasi.lokasi.jarakMeter}m` : '';
    const qrKet = verifikasi.qrValid ? ', QR tervalidasi' : '';
    addAuditLog?.(currentUser?.name, 'Absen Pulang', teacher.name, `Sesi ${sesiAktif.nama}, Pukul ${formatJam(nowToHHMMSS(capture))}${lokasiKet}${qrKet}`, 'presensi_guru');
  };

  const lokasiAktif = isLokasiAktif(settings);
  const qrAktif = isQrAktif(settings);
  const perluVerifikasi = lokasiAktif || qrAktif;

  const handleAjukan = () => {
    if (sudahMasuk) { showToast('Anda sudah absen masuk hari ini, tidak bisa mengajukan izin/sakit.', 'error'); return; }
    upsertRecord(teacher.id, teacher.name, today, sesiAktif.id, { status: izinStatus, keterangan: izinKeterangan, jamMasuk: null, jamPulang: null, terlambatMenit: 0, sesiNama: sesiAktif.nama });
    showToast(`Pengajuan ${izinStatus} hari ini berhasil dicatat.`, 'success');
    addAuditLog?.(currentUser?.name, `Ajukan ${izinStatus}`, teacher.name, izinKeterangan || '-', 'presensi_guru');
    setShowIzinModal(false);
    setIzinKeterangan('');
  };

  // Rekap ringkas 30 hari terakhir milik guru ybs (sesi yang sedang dipilih)
  const myHistory = presensiGuru
    .filter(r => r.teacherId === teacher.id && (r.sesiId || sesiUtamaId) === sesiAktif.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);

  const thisMonthKey = today.slice(0, 7);
  const monthRecords = presensiGuru.filter(r => r.teacherId === teacher.id && r.date.startsWith(thisMonthKey) && (r.sesiId || sesiUtamaId) === sesiAktif.id);
  const monthHadir = monthRecords.filter(r => r.status === 'Hadir').length;
  const monthTerlambat = monthRecords.filter(r => r.status === 'Terlambat').length;
  const monthSakitIzin = monthRecords.filter(r => ['Sakit', 'Izin', 'Cuti'].includes(r.status)).length;
  const monthAlpa = monthRecords.filter(r => r.status === 'Alpa').length;

  return (
    <div className="space-y-6">
      {/* PEMILIH SESI (hanya tampil jika Admin mengatur lebih dari 1 sesi, mis. Pagi/KBM & Sore/Halaqoh) */}
      {multiSesi && (
        <div className="flex bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-1.5 gap-1.5 shadow-sm w-fit">
          {sesiList.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedSesiId(s.id)}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${sesiAktif.id === s.id ? 'bg-teal-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'}`}
            >
              {s.nama}
            </button>
          ))}
        </div>
      )}

      {/* KARTU JAM & AKSI ABSEN */}
      <div className="bg-gradient-to-br from-teal-600 via-teal-600 to-emerald-700 rounded-[2rem] shadow-lg p-6 sm:p-8 text-white relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-52 h-52 bg-white/10 rounded-full" />
        <div className="absolute -right-4 bottom-[-40px] w-32 h-32 bg-white/10 rounded-full" />
        <div className="relative z-10 flex flex-col lg:flex-row justify-between gap-6">
          <div>
            <p className="text-teal-100 text-xs font-black uppercase tracking-widest">{formatTanggalPanjang(now)}</p>
            <p className="text-5xl sm:text-6xl font-black tracking-tight mt-1 font-mono">{now.toTimeString().slice(0, 8)}</p>
            <p className="mt-3 text-teal-100 text-sm font-bold">
              Assalamu'alaikum, <span className="text-white">{teacher.name}</span> — {teacher.position || 'Guru'}
            </p>
            <p className="text-teal-100/80 text-xs mt-1 flex items-center gap-1">
              <MapPin size={12} /> Sesi {sesiAktif.nama}: jam masuk standar {formatJam(sesiAktif.jamMasuk + ':00')} (toleransi {sesiAktif.toleransiMenit} menit)
            </p>
          </div>
          <div className="flex flex-col gap-3 min-w-[220px]">
            <div className="bg-white/15 backdrop-blur rounded-2xl p-4 border border-white/20">
              <p className="text-[10px] font-black uppercase tracking-widest text-teal-100">Status Hari Ini</p>
              <p className="text-lg font-black mt-1">
                {record?.status && (record.jamMasuk || ['Sakit', 'Izin', 'Cuti', 'Dinas Luar'].includes(record.status)) ? record.status : 'Belum Absen'}
                {record?.status === 'Terlambat' && <span className="text-amber-200 font-bold text-sm"> ({record.terlambatMenit} menit)</span>}
              </p>
              {record?.jamMasuk && <p className="text-xs text-teal-100 mt-1">Masuk: {formatJam(record.jamMasuk)} {record?.jamPulang && `• Pulang: ${formatJam(record.jamPulang)}`}</p>}
              {record?.keterangan && <p className="text-xs text-teal-100 mt-1 italic">"{record.keterangan}"</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={sudahMasuk || isIzinLike}
                onClick={() => setVerifikasiMode('masuk')}
                className="flex items-center justify-center gap-1.5 bg-white text-teal-700 font-black text-sm px-3 py-3 rounded-xl shadow-md hover:bg-teal-50 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                <LogIn size={16} strokeWidth={2.5} /> Absen Masuk
              </button>
              <button
                type="button"
                disabled={!sudahMasuk || sudahPulang}
                onClick={() => setVerifikasiMode('pulang')}
                className="flex items-center justify-center gap-1.5 bg-slate-900/80 text-white font-black text-sm px-3 py-3 rounded-xl shadow-md hover:bg-slate-900 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                <LogOut size={16} strokeWidth={2.5} /> Absen Pulang
              </button>
            </div>
            {perluVerifikasi && (
              <p className="text-[10px] text-teal-100/80 flex items-center gap-1 justify-center">
                <ShieldCheck size={12} /> Absen memerlukan verifikasi {lokasiAktif && qrAktif ? 'lokasi GPS & QR sekolah' : lokasiAktif ? 'lokasi GPS' : 'QR sekolah'}
              </p>
            )}
            {!sudahMasuk && !isIzinLike && (
              <button type="button" onClick={() => setShowIzinModal(true)} className="text-xs font-bold text-teal-100 underline underline-offset-2 hover:text-white text-center">
                Tidak masuk hari ini? Ajukan Sakit / Izin
              </button>
            )}
          </div>
        </div>
      </div>

      {/* RINGKASAN BULAN INI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={CheckCircle2} label="Hadir Bulan Ini" value={monthHadir} gradient="from-emerald-500 to-teal-600" iconBg="bg-white/20" />
        <StatCard icon={AlertTriangle} label="Terlambat" value={monthTerlambat} gradient="from-amber-500 to-orange-600" iconBg="bg-white/20" />
        <StatCard icon={CalendarClock} label="Sakit/Izin/Cuti" value={monthSakitIzin} gradient="from-sky-500 to-blue-600" iconBg="bg-white/20" />
        <StatCard icon={Clock} label="Alpa Bulan Ini" value={monthAlpa} gradient="from-rose-500 to-pink-600" iconBg="bg-white/20" />
      </div>

      {/* RIWAYAT */}
      <div className={cx.card3xl}>
        <div className="p-5 border-b border-slate-100 dark:border-slate-700">
          <h3 className="font-black text-slate-800 dark:text-white">Riwayat Presensi Saya</h3>
          <p className="text-xs text-slate-400 font-bold mt-0.5">30 catatan terakhir</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest">
                <th className="p-3 pl-6 text-left">Tanggal</th>
                <th className="p-3 text-center">Jam Masuk</th>
                <th className="p-3 text-center">Jam Pulang</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 pr-6 text-left">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/40">
              {myHistory.length === 0 ? (
                <tr><td colSpan="5" className="p-10 text-center text-slate-400 italic">Belum ada riwayat presensi.</td></tr>
              ) : myHistory.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="p-3 pl-6 font-bold text-slate-700 dark:text-white">{new Date(r.date + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="p-3 text-center font-mono">{formatJam(r.jamMasuk)}</td>
                  <td className="p-3 text-center font-mono">{formatJam(r.jamPulang)}</td>
                  <td className="p-3 text-center">
                    <Badge colorClass={STATUS_BADGE[r.status] || STATUS_BADGE['Belum Absen']}>
                      {r.status}{r.status === 'Terlambat' ? ` ${r.terlambatMenit}m` : ''}
                    </Badge>
                  </td>
                  <td className="p-3 pr-6 text-slate-500 text-xs italic">{r.keterangan || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showIzinModal} onClose={() => setShowIzinModal(false)} title="Ajukan Sakit / Izin Hari Ini">
        <div className="space-y-4">
          <div>
            <label className={cx.label}>Jenis Ketidakhadiran</label>
            <select className={`${cx.inputFocus} font-bold cursor-pointer`} value={izinStatus} onChange={e => setIzinStatus(e.target.value)}>
              <option value="Sakit">Sakit</option>
              <option value="Izin">Izin</option>
              <option value="Cuti">Cuti</option>
              <option value="Dinas Luar">Dinas Luar</option>
            </select>
          </div>
          <div>
            <label className={cx.label}>Keterangan</label>
            <textarea rows={3} className={cx.inputFocus} value={izinKeterangan} onChange={e => setIzinKeterangan(e.target.value)} placeholder="Contoh: Demam sejak semalam, sudah periksa ke puskesmas." />
          </div>
          <button type="button" onClick={handleAjukan} className="w-full bg-teal-600 hover:bg-teal-700 text-white font-black py-3 rounded-xl shadow-md transition-colors">
            Kirim Pengajuan
          </button>
        </div>
      </Modal>

      <VerifikasiKehadiranModal
        isOpen={!!verifikasiMode}
        mode={verifikasiMode}
        settings={settings}
        schoolProfile={schoolProfile}
        onClose={() => setVerifikasiMode(null)}
        onVerified={(meta) => {
          if (verifikasiMode === 'masuk') handleAbsenMasuk(meta);
          else if (verifikasiMode === 'pulang') handleAbsenPulang(meta);
          setVerifikasiMode(null);
        }}
      />
    </div>
  );
}

// ==========================================
// SUB-VIEW: MODAL VERIFIKASI GPS + QR CODE
// Dipanggil saat guru menekan Absen Masuk / Absen Pulang. Kedua validasi
// bersifat progresif — jika Admin belum mengatur lokasi/QR di Pengaturan,
// langkah terkait dilewati otomatis (tidak mem-block absen lama).
// ==========================================
function VerifikasiKehadiranModal({ isOpen, mode, settings, schoolProfile, onClose, onVerified }) {
  const lokasiAktif = isLokasiAktif(settings);
  const qrAktif = isQrAktif(settings);
  const lokasiList = getLokasiList(settings);

  const [gpsStatus, setGpsStatus] = useState('idle'); // idle | checking | ok | fail
  const [gpsInfo, setGpsInfo] = useState(null);
  const [gpsError, setGpsError] = useState('');
  const [qrStatus, setQrStatus] = useState('idle'); // idle | scanning | ok | fail
  const [cameraError, setCameraError] = useState('');

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);

  const stopScan = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const checkGps = useCallback(() => {
    setGpsStatus('checking');
    setGpsError('');
    if (!navigator.geolocation) {
      setGpsError('Perangkat/browser ini tidak mendukung fitur sensor GPS.');
      setGpsStatus('fail');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const terdekat = cariLokasiTerdekat(latitude, longitude, lokasiList);
        setGpsInfo(terdekat ? { latitude, longitude, jarakMeter: terdekat.jarak, akurasi: Math.round(accuracy || 0), namaLokasi: terdekat.nama } : null);
        setGpsStatus(terdekat?.dalamRadius ? 'ok' : 'fail');
        if (!terdekat?.dalamRadius) {
          setGpsError(terdekat
            ? `Posisi GPS Anda terdeteksi berjarak ±${terdekat.jarak}m dari "${terdekat.nama}" (Batas radius toleransi maksimal ${terdekat.radiusMeter || 150}m). Presensi otomatis DITOLAK karena Anda berada di luar lingkungan sekolah.`
            : 'Titik koordinat sekolah belum dapat diverifikasi. Hubungi Admin Sekolah.');
        }
      },
      (err) => {
        const errMsg = err.code === 1
          ? 'Izin akses lokasi (GPS) DITOLAK oleh browser/HP. Anda wajib mengizinkan akses lokasi untuk melakukan presensi.'
          : 'Gagal mendeteksi koordinat lokasi GPS. Pastikan GPS aktif dan koneksi internet stabil.';
        setGpsError(errMsg);
        setGpsStatus('fail');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [lokasiList]);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code) {
        const expectedSuffix = `|${settings.qrToken}`;
        if (code.data.startsWith(QR_PREFIX) && code.data.endsWith(expectedSuffix)) {
          setQrStatus('ok');
          setCameraError('');
          stopScan();
          return;
        }
        setCameraError('Kode QR terbaca tapi bukan QR presensi resmi sekolah ini. Pastikan scan QR yang ditempel di sekolah.');
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [settings.qrToken, stopScan]);

  const startScan = useCallback(async () => {
    if (lokasiAktif && gpsStatus !== 'ok') {
      setCameraError('Validasi GPS belum terpenuhi. Anda harus berada di radius sekolah sebelum memindai QR code.');
      return;
    }
    setCameraError('');
    setQrStatus('scanning');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setCameraError('Tidak bisa mengakses kamera. Pastikan izin kamera diaktifkan di pengaturan browser.');
      setQrStatus('fail');
    }
  }, [tick, lokasiAktif, gpsStatus]);

  // Reset & mulai verifikasi otomatis tiap kali modal dibuka
  useEffect(() => {
    if (!isOpen) { stopScan(); return; }
    setGpsStatus('idle'); setGpsInfo(null); setGpsError('');
    setQrStatus('idle'); setCameraError('');
    if (lokasiAktif) checkGps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => () => stopScan(), [stopScan]);

  if (!isOpen) return null;

  const gpsPass = !lokasiAktif || gpsStatus === 'ok';
  const qrPass = !qrAktif || qrStatus === 'ok';
  const canConfirm = gpsPass && qrPass;

  const handleConfirm = () => {
    if (!canConfirm) return;
    stopScan();
    onVerified({
      lokasi: lokasiAktif && gpsInfo ? { latitude: gpsInfo.latitude, longitude: gpsInfo.longitude, jarakMeter: gpsInfo.jarakMeter, nama: gpsInfo.namaLokasi } : undefined,
      qrValid: qrAktif ? true : undefined,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={() => { stopScan(); onClose(); }} title={mode === 'pulang' ? 'Verifikasi Absen Pulang' : 'Verifikasi Absen Masuk'}>
      <div className="space-y-4">
        {!lokasiAktif && !qrAktif && (
          <div className="text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40 rounded-xl p-3 flex items-start gap-2 border border-slate-200 dark:border-slate-700">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-slate-400" />
            Admin belum mengaktifkan validasi lokasi/QR untuk sekolah ini. Absen akan tercatat menggunakan jam perangkat Anda saat ini.
          </div>
        )}

        {/* STEP GPS */}
        {lokasiAktif && (
          <div className={`rounded-2xl border p-4 ${gpsStatus === 'ok' ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800' : gpsStatus === 'fail' ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-800' : 'border-slate-200 bg-slate-50 dark:bg-slate-900/40 dark:border-slate-700'}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <Navigation size={16} className={gpsStatus === 'ok' ? 'text-emerald-600' : gpsStatus === 'fail' ? 'text-rose-600' : 'text-slate-400'} />
              <p className="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">Verifikasi Lokasi GPS Sekolah</p>
              {gpsStatus === 'checking' && <Loader2 size={14} className="animate-spin text-teal-600 ml-auto" />}
              {gpsStatus === 'ok' && <CheckCircle2 size={16} className="text-emerald-600 ml-auto" />}
              {gpsStatus === 'fail' && <XCircle size={16} className="text-rose-600 ml-auto" />}
            </div>

            {gpsStatus === 'checking' && (
              <p className="text-xs text-slate-500 flex items-center gap-1.5 font-medium">
                <Loader2 size={12} className="animate-spin text-teal-600" /> Mendeteksi koordinat posisi Anda saat ini…
              </p>
            )}

            {gpsStatus === 'ok' && gpsInfo && (
              <div className="space-y-1">
                <p className="text-xs text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1.5">
                  <CheckCircle2 size={14} /> Posisi Valid: Berada ±{gpsInfo.jarakMeter}m dari "{gpsInfo.namaLokasi}" (dalam radius sekolah).
                </p>
              </div>
            )}

            {gpsStatus === 'fail' && (
              <div className="space-y-2 mt-2">
                <div className="p-3 bg-rose-100/80 dark:bg-rose-900/40 rounded-xl text-rose-800 dark:text-rose-200 text-xs leading-relaxed space-y-1">
                  <p className="font-black flex items-center gap-1.5 text-rose-700 dark:text-rose-300">
                    <XCircle size={15} className="shrink-0 text-rose-600" /> PRESENSI OTOMATIS DITOLAK
                  </p>
                  <p className="font-semibold">{gpsError}</p>
                  <p className="text-[10px] font-bold text-rose-700 dark:text-rose-400 pt-1 border-t border-rose-200 dark:border-rose-800">
                    ⛔ Anda dilarang melakukan presensi maupun scan barcode dari luar lingkungan sekolah (misalnya dari rumah).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={checkGps}
                  className="flex items-center justify-center gap-1.5 w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-sm"
                >
                  <RefreshCw size={13} /> Cek Ulang Posisi GPS
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP QR */}
        {qrAktif && (
          <div className={`rounded-2xl border p-4 ${qrStatus === 'ok' ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800' : (lokasiAktif && gpsStatus !== 'ok') ? 'border-slate-200 bg-slate-100/70 dark:bg-slate-900/30 opacity-75' : 'border-slate-200 bg-slate-50 dark:bg-slate-900/40 dark:border-slate-700'}`}>
            <div className="flex items-center gap-2 mb-2">
              <ScanLine size={16} className={qrStatus === 'ok' ? 'text-emerald-600' : 'text-slate-500'} />
              <p className="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">Scan Barcode QR Presensi</p>
              {qrStatus === 'ok' && <CheckCircle2 size={16} className="text-emerald-600 ml-auto" />}
            </div>

            {lokasiAktif && gpsStatus !== 'ok' ? (
              <div className="p-3 bg-slate-200/60 dark:bg-slate-800 rounded-xl text-center space-y-1">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5">
                  <ShieldCheck size={14} className="text-slate-400" /> Kamera Scan Barcode Terkunci
                </p>
                <p className="text-[10px] text-slate-400">
                  Selesaikan verifikasi lokasi GPS di sekolah terlebih dahulu untuk membuka akses scan barcode.
                </p>
              </div>
            ) : qrStatus === 'ok' ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1.5">
                <CheckCircle2 size={14} /> Barcode QR presensi sekolah berhasil diverifikasi.
              </p>
            ) : qrStatus === 'scanning' ? (
              <div className="space-y-2">
                <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
                  <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
                  <div className="absolute inset-8 border-2 border-white/70 rounded-xl pointer-events-none" />
                </div>
                <canvas ref={canvasRef} className="hidden" />
                <p className="text-[11px] text-slate-500 text-center">Arahkan kamera ke QR presensi yang ditempel di sekolah.</p>
                {cameraError && <p className="text-xs text-rose-600 text-center font-bold">{cameraError}</p>}
                <button type="button" onClick={() => { stopScan(); setQrStatus('idle'); }} className="w-full flex items-center justify-center gap-1.5 text-xs font-black text-slate-500 hover:text-rose-600 py-1">
                  <VideoOff size={13} /> Batalkan Scan
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {cameraError && <p className="text-xs text-rose-600 font-bold">{cameraError}</p>}
                <button
                  type="button"
                  onClick={startScan}
                  disabled={lokasiAktif && gpsStatus !== 'ok'}
                  className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 text-white font-black py-2.5 rounded-xl text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                >
                  <Camera size={16} /> Mulai Scan Barcode QR
                </button>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          disabled={!canConfirm}
          onClick={handleConfirm}
          className={`w-full flex items-center justify-center gap-2 font-black py-3 rounded-xl shadow-md transition-all ${
            canConfirm
              ? 'bg-teal-600 hover:bg-teal-700 text-white active:scale-95'
              : 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
          }`}
        >
          <ShieldCheck size={16} />
          {lokasiAktif && gpsStatus === 'fail'
            ? '❌ Presensi Gagal (Di Luar Radius Sekolah)'
            : lokasiAktif && gpsStatus === 'checking'
            ? '⏳ Mendeteksi Posisi GPS...'
            : qrAktif && qrStatus !== 'ok'
            ? '📷 Scan Barcode Terlebih Dahulu'
            : `Konfirmasi ${mode === 'pulang' ? 'Absen Pulang' : 'Absen Masuk'}`}
        </button>
      </div>
    </Modal>
  );
}

// ==========================================
// SUB-VIEW: PANEL ADMIN / MONITORING
// ==========================================
function AdminRekapPanel({
  settings, setSchoolProfile, teachers, presensiGuru, upsertRecord, setPresensiGuru,
  readOnly, isAdmin, showToast, showConfirm, showCsvPreview, triggerPrint, addAuditLog, currentUser, schoolProfile,
}) {
  const [viewMode, setViewMode] = useState('harian'); // 'harian' | 'rekap'
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState(settings);
  const [editRow, setEditRow] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [selectedTeacherId, setSelectedTeacherId] = useState(teachers[0]?.id || '');

  useEffect(() => {
    if (!selectedTeacherId && teachers.length > 0) {
      setSelectedTeacherId(teachers[0].id);
    }
  }, [teachers, selectedTeacherId]);

  const targetTeacher = useMemo(() => {
    return teachers.find(t => t.id === selectedTeacherId) || teachers[0];
  }, [teachers, selectedTeacherId]);

  const sesiList = settings.sesiList;
  const sesiUtamaId = sesiList[0]?.id;
  const multiSesi = sesiList.length > 1;
  const [filterSesiId, setFilterSesiId] = useState(sesiUtamaId);
  const sesiTerpilih = sesiList.find(s => s.id === filterSesiId) || sesiList[0];

  // 📅 State Filter Tanggal Harian (Default: Hari Ini)
  const [filterDate, setFilterDate] = useState(todayStr());
  const selectedDateObj = useMemo(() => {
    try {
      if (!filterDate) return new Date();
      const [y, m, d] = filterDate.split('-').map(Number);
      return new Date(y, m - 1, d);
    } catch(e) {
      return new Date();
    }
  }, [filterDate]);
  const hariIni = getHariIni(selectedDateObj);

  const getRecord = (teacherId) => presensiGuru.find(r => r.teacherId === teacherId && r.date === filterDate && (r.sesiId || sesiUtamaId) === filterSesiId);

  const filteredTeachers = teachers.filter(t =>
    (t.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || (t.nipy || t.nip || '').includes(searchQuery)
  );

  // PERBAIKAN: untuk tampilan Harian, hanya guru yang DIJADWALKAN Admin pada
  // kombinasi hari+sesi ini yang ditampilkan/dihitung (mendukung jam kerja
  // berbeda tiap guru). Rekap bulanan tetap menampilkan semua guru (historis).
  const filteredTeachersHarian = useMemo(
    () => filteredTeachers.filter(t => isGuruTerjadwal(settings, hariIni, filterSesiId, t.id)),
    [filteredTeachers, settings, hariIni, filterSesiId]
  );

  // ---- STATISTIK HARIAN SESUAI TANGGAL TERPILIH ----
  const todayRecords = filteredTeachersHarian.map(t => getRecord(t.id));
  const totalHadir = todayRecords.filter(r => r?.status === 'Hadir').length;
  const totalTerlambat = todayRecords.filter(r => r?.status === 'Terlambat').length;
  const totalIzinSakit = todayRecords.filter(r => r && ['Sakit', 'Izin', 'Cuti', 'Dinas Luar'].includes(r.status)).length;
  const totalBelumAbsen = filteredTeachersHarian.length - todayRecords.filter(r => r).length;

  const handleSaveSettings = () => {
    try {
      localStorage.setItem('payedu_presensi_guru_settings', JSON.stringify(settingsForm));
    } catch (e) {}
    setSchoolProfile(prev => ({ ...prev, presensiGuruSettings: settingsForm }));
    showToast('Pengaturan presensi guru berhasil disimpan.', 'success');
    const jumlahHariDiatur = Object.keys(settingsForm.jadwalGuru || {}).length;
    addAuditLog?.(currentUser?.name, 'Ubah Pengaturan Presensi Guru', 'Sistem', `${(settingsForm.sesiList || []).length} sesi, ${(settingsForm.lokasiList || []).length} lokasi terdaftar${jumlahHariDiatur ? `, jadwal guru diatur untuk ${jumlahHariDiatur} hari` : ''}`, 'presensi_guru');
    setShowSettings(false);
  };

  const openEdit = (teacher) => {
    const rec = getRecord(teacher.id);
    setEditRow(teacher);
    setEditForm({
      jamMasuk: rec?.jamMasuk ? rec.jamMasuk.slice(0, 5) : '',
      jamPulang: rec?.jamPulang ? rec.jamPulang.slice(0, 5) : '',
      status: rec?.status || 'Hadir',
      keterangan: rec?.keterangan || '',
    });
  };

  const handleSaveEdit = () => {
    if (!editRow) return;
    let terlambatMenit = 0;
    let jamMasuk = editForm.jamMasuk ? `${editForm.jamMasuk}:00` : null;
    let status = editForm.status;
    if (jamMasuk && (status === 'Hadir' || status === 'Terlambat')) {
      const [h, m] = editForm.jamMasuk.split(':').map(Number);
      const captureDate = new Date();
      captureDate.setHours(h, m, 0, 0);
      const computed = computeStatus(captureDate, sesiTerpilih);
      status = computed.status;
      terlambatMenit = computed.terlambatMenit;
    }
    upsertRecord(editRow.id, editRow.name, filterDate, filterSesiId, {
      jamMasuk, jamPulang: editForm.jamPulang ? `${editForm.jamPulang}:00` : null,
      status, terlambatMenit, keterangan: editForm.keterangan, sesiNama: sesiTerpilih.nama,
    });
    addAuditLog?.(currentUser?.name, 'Edit Presensi Guru (Manual)', editRow.name, `Tanggal ${filterDate}, Sesi ${sesiTerpilih.nama}, ${status}${jamMasuk ? `, masuk ${editForm.jamMasuk}` : ''}`, 'presensi_guru');
    showToast(`Presensi ${editRow.name} tanggal ${filterDate} berhasil diperbarui.`, 'success');
    setEditRow(null);
    setEditForm(null);
  };

  const handleQuickStatus = (teacher, status) => {
    upsertRecord(teacher.id, teacher.name, filterDate, filterSesiId, { status, jamMasuk: null, jamPulang: null, terlambatMenit: 0, sesiNama: sesiTerpilih.nama });
    showToast(`${teacher.name} ditandai ${status} pada tanggal ${filterDate}.`, 'success');
    addAuditLog?.(currentUser?.name, `Tandai ${status}`, teacher.name, `${filterDate} (Sesi ${sesiTerpilih.nama})`, 'presensi_guru');
  };

  const handleDeleteRecord = (teacher) => {
    const rec = getRecord(teacher.id);
    if (!rec) return;
    showConfirm(`Hapus catatan presensi ${teacher.name} pada tanggal ${filterDate}? Tindakan ini tidak bisa dibatalkan.`, () => {
      const updated = presensiGuru.filter(r => r.id !== rec.id);
      setPresensiGuru(updated);
      try {
        localStorage.setItem('payedu_presensi_guru', JSON.stringify(updated));
      } catch (e) {}
      pushPresensiGuru(updated).catch(e => console.warn('[Presensi] Delete sync warning:', e));
      showToast('Catatan presensi berhasil dihapus.', 'success');
    });
  };

  // 📥 EKSPOR LAPORAN HARIAN (CSV/EXCEL)
  const handleExportHarianCSV = () => {
    const headers = ['No', 'Nama Guru / Staff', 'NIP / NIPY', 'Jabatan', 'Sesi', 'Jam Masuk', 'Jam Pulang', 'Status Kehadiran', 'Keterlambatan (Menit)', 'Verifikasi Masuk', 'Verifikasi Pulang', 'Keterangan'];
    const rows = filteredTeachersHarian.map((t, idx) => {
      const rec = getRecord(t.id);
      const status = rec?.status && (rec.jamMasuk || ['Sakit', 'Izin', 'Cuti', 'Dinas Luar', 'Alpa'].includes(rec.status)) ? rec.status : 'Belum Absen';
      const verifMasuk = `${rec?.lokasiMasuk ? 'GPS' : ''}${rec?.qrValidMasuk ? ' QR' : ''}`.trim() || (rec?.jamMasuk ? 'Manual' : '-');
      const verifPulang = `${rec?.lokasiPulang ? 'GPS' : ''}${rec?.qrValidPulang ? ' QR' : ''}`.trim() || (rec?.jamPulang ? 'Manual' : '-');
      return [
        idx + 1,
        t.name,
        t.nipy || t.nip || '-',
        t.position || 'Guru',
        sesiTerpilih.nama,
        rec?.jamMasuk ? rec.jamMasuk.slice(0, 5) : '-',
        rec?.jamPulang ? rec.jamPulang.slice(0, 5) : '-',
        status,
        rec?.terlambatMenit || 0,
        verifMasuk,
        verifPulang,
        rec?.keterangan || '-'
      ];
    });

    const summaryRows = [
      ['LAPORAN PRESENSI HARIAN GURU & STAFF'],
      ['Tanggal', filterDate],
      ['Hari', hariIni],
      ['Sesi', sesiTerpilih.nama],
      ['Total Hadir Tepat Waktu', totalHadir],
      ['Total Terlambat', totalTerlambat],
      ['Total Sakit / Izin / Cuti', totalIzinSakit],
      ['Total Belum Absen', Math.max(0, totalBelumAbsen)],
      []
    ];

    const csv = [
      ...summaryRows.map(row => row.map(formatCSVField).join(',')),
      headers.map(formatCSVField).join(','),
      ...rows.map(row => row.map(formatCSVField).join(','))
    ].join('\n');

    showCsvPreview(csv, `Presensi_Harian_${filterDate}_Sesi_${sesiTerpilih.nama.replace(/\s+/g, '_')}.csv`);
  };

  // ---- REKAP BULANAN ----
  // CATATAN: "Telat" di rekap ini adalah JUMLAH KALI (hari) guru tercatat Terlambat,
  // BUKAN akumulasi total menit keterlambatan — sesuai kebutuhan laporan bulanan.
  const rekapData = useMemo(() => {
    const prefix = `${filterYear}-${String(filterMonth).padStart(2, '0')}`;
    return filteredTeachers.map(t => {
      const recs = presensiGuru.filter(r => r.teacherId === t.id && r.date.startsWith(prefix) && (r.sesiId || sesiUtamaId) === filterSesiId);
      const hadir = recs.filter(r => r.status === 'Hadir').length;
      const terlambat = recs.filter(r => r.status === 'Terlambat').length; // jumlah KALI terlambat
      const sakit = recs.filter(r => r.status === 'Sakit').length;
      const izin = recs.filter(r => r.status === 'Izin').length;
      const alpa = recs.filter(r => r.status === 'Alpa').length;
      const cuti = recs.filter(r => ['Cuti', 'Dinas Luar'].includes(r.status)).length;
      const totalTercatat = recs.length;
      const jamMasukRecs = recs.filter(r => r.jamMasuk);
      const avgMasukMin = jamMasukRecs.length > 0
        ? Math.round(jamMasukRecs.reduce((sum, r) => sum + toMinutes(r.jamMasuk.slice(0, 5)), 0) / jamMasukRecs.length)
        : null;
      const persentase = totalTercatat > 0 ? Math.round(((hadir + terlambat) / totalTercatat) * 100) : 0;
      return {
        id: t.id, name: t.name, nip: t.nip, position: t.position,
        hadir, terlambat, sakit, izin, alpa, cuti, totalTercatat,
        avgMasuk: avgMasukMin != null ? `${String(Math.floor(avgMasukMin / 60)).padStart(2, '0')}:${String(avgMasukMin % 60).padStart(2, '0')}` : '-',
        persentase,
      };
    });
  }, [filteredTeachers, presensiGuru, filterMonth, filterYear, filterSesiId, sesiUtamaId]);

  const handleExportRekap = () => {
    const headers = ['Nama', 'NIP', 'Jabatan', 'Hadir', 'Jumlah Kali Terlambat', 'Sakit', 'Izin', 'Alpa', 'Cuti/Dinas Luar', 'Rata-rata Jam Masuk', 'Persentase Hadir'];
    const rows = rekapData.map(r => [r.name, r.nip, r.position, r.hadir, r.terlambat, r.sakit, r.izin, r.alpa, r.cuti, r.avgMasuk, `${r.persentase}%`]);
    const csv = [headers, ...rows].map(row => row.map(formatCSVField).join(',')).join('\n');
    showCsvPreview(csv, `Rekap_Presensi_Guru_${MONTH_NAMES[filterMonth - 1]}_${filterYear}.csv`);
  };

  const detailGuruData = useMemo(() => {
    if (!targetTeacher) return null;
    const prefix = `${filterYear}-${String(filterMonth).padStart(2, '0')}`;
    const logs = presensiGuru.filter(r => (r.teacherId === targetTeacher.id || (r.teacherName && targetTeacher.name && r.teacherName.trim().toLowerCase() === targetTeacher.name.trim().toLowerCase())) && r.date.startsWith(prefix) && (r.sesiId || sesiUtamaId) === filterSesiId)
      .sort((a, b) => a.date.localeCompare(b.date));

    const hadir = logs.filter(r => r.status === 'Hadir').length;
    const terlambat = logs.filter(r => r.status === 'Terlambat').length;
    const totalMenitTerlambat = logs.filter(r => r.status === 'Terlambat').reduce((sum, r) => sum + (r.terlambatMenit || 0), 0);
    const sakit = logs.filter(r => r.status === 'Sakit').length;
    const izin = logs.filter(r => r.status === 'Izin').length;
    const alpa = logs.filter(r => r.status === 'Alpa').length;
    const cuti = logs.filter(r => ['Cuti', 'Dinas Luar'].includes(r.status)).length;
    const totalRecorded = logs.length;
    const persentase = totalRecorded > 0 ? Math.round(((hadir + terlambat) / totalRecorded) * 100) : 0;

    return {
      teacher: targetTeacher,
      logs,
      hadir,
      terlambat,
      totalMenitTerlambat,
      sakit,
      izin,
      alpa,
      cuti,
      totalRecorded,
      persentase
    };
  }, [targetTeacher, presensiGuru, filterMonth, filterYear, filterSesiId, sesiUtamaId]);

  const handleExportDetailGuruCSV = () => {
    if (!detailGuruData || !targetTeacher) return;
    const headers = ['Tanggal', 'Sesi', 'Jam Masuk', 'Jam Pulang', 'Status', 'Terlambat (Menit)', 'Verifikasi GPS/QR', 'Keterangan'];
    const rows = detailGuruData.logs.map(r => [
      r.date,
      r.sesiNama || 'Pagi',
      r.jamMasuk ? r.jamMasuk.slice(0, 5) : '-',
      r.jamPulang ? r.jamPulang.slice(0, 5) : '-',
      r.status,
      r.terlambatMenit || 0,
      `${r.lokasiMasuk ? 'GPS' : ''}${r.qrValidMasuk ? ' QR' : ''}`.trim() || 'Manual',
      r.keterangan || '-'
    ]);
    const summaryRows = [
      ['REKAPITULASI PEMANTAUAN PRESENSI GURU'],
      ['Nama Guru', targetTeacher.name],
      ['NIP / NIK', targetTeacher.nip || '-'],
      ['Jabatan', targetTeacher.position || 'Guru'],
      ['Bulan & Tahun', `${MONTH_NAMES[filterMonth - 1]} ${filterYear}`],
      ['Total Hadir Tepat Waktu', detailGuruData.hadir],
      ['Total Terlambat (Kali)', detailGuruData.terlambat],
      ['Total Menit Terlambat', `${detailGuruData.totalMenitTerlambat} menit`],
      ['Total Sakit', detailGuruData.sakit],
      ['Total Izin', detailGuruData.izin],
      ['Total Alpa', detailGuruData.alpa],
      ['Persentase Kehadiran', `${detailGuruData.persentase}%`],
      []
    ];
    const csv = [...summaryRows.map(row => row.map(formatCSVField).join(',')), headers.map(formatCSVField).join(','), ...rows.map(row => row.map(formatCSVField).join(','))].join('\n');
    showCsvPreview(csv, `Presensi_Detail_${(targetTeacher.name || 'Guru').replace(/\s+/g, '_')}_${MONTH_NAMES[filterMonth - 1]}_${filterYear}.csv`);
  };

  return (
    <div className="space-y-6">
      {/* STAT HARI INI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={CheckCircle2} label="Hadir Tepat Waktu" value={totalHadir} gradient="from-emerald-500 to-teal-600" iconBg="bg-white/20" />
        <StatCard icon={AlertTriangle} label="Terlambat" value={totalTerlambat} gradient="from-amber-500 to-orange-600" iconBg="bg-white/20" />
        <StatCard icon={CalendarClock} label="Sakit/Izin/Cuti" value={totalIzinSakit} gradient="from-violet-500 to-purple-600" iconBg="bg-white/20" />
        <StatCard icon={AlertCircle} label="Belum Absen" value={Math.max(0, totalBelumAbsen)} gradient="from-rose-500 to-red-600" iconBg="bg-white/20" />
      </div>

      {/* TOGGLE MODE + TOOLBAR */}
      <div className={`${cx.card3xl} p-4 flex flex-col lg:flex-row justify-between gap-3 lg:items-center`}>
        <div className="flex bg-slate-100 dark:bg-slate-900 rounded-xl p-1 w-fit flex-wrap gap-1">
          <button type="button" onClick={() => setViewMode('harian')} className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${viewMode === 'harian' ? 'bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500'}`}>Harian</button>
          <button type="button" onClick={() => setViewMode('rekap')} className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${viewMode === 'rekap' ? 'bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500'}`}>Rekap Bulanan</button>
          <button type="button" onClick={() => setViewMode('detail_guru')} className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${viewMode === 'detail_guru' ? 'bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500'}`}>Rekap Per Guru</button>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {viewMode === 'detail_guru' && (
            <select value={selectedTeacherId} onChange={e => setSelectedTeacherId(e.target.value)} className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold dark:text-white cursor-pointer min-w-[160px]">
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {viewMode === 'harian' && (
            <>
              <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 shadow-inner">
                <CalendarDays size={15} className="text-teal-600 dark:text-teal-400 shrink-0" />
                <input 
                  type="date" 
                  value={filterDate} 
                  onChange={e => setFilterDate(e.target.value)} 
                  className="bg-transparent text-sm font-bold dark:text-white outline-none cursor-pointer"
                />
                {filterDate !== todayStr() && (
                  <button 
                    type="button" 
                    onClick={() => setFilterDate(todayStr())} 
                    className="text-[10px] bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 font-black px-2 py-0.5 rounded-md hover:bg-teal-200 transition-colors shrink-0"
                    title="Kembali ke Hari Ini"
                  >
                    Hari Ini
                  </button>
                )}
              </div>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Cari nama / NIP..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-teal-500 text-sm dark:text-white" />
              </div>
            </>
          )}
          {multiSesi && (
            <select value={filterSesiId} onChange={e => setFilterSesiId(e.target.value)} className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold dark:text-white cursor-pointer">
              {sesiList.map(s => <option key={s.id} value={s.id}>Sesi {s.nama}</option>)}
            </select>
          )}
          {viewMode === 'harian' && (
            <>
              <button type="button" onClick={handleExportHarianCSV} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-emerald-100 transition-colors" title="Download Rekap Harian CSV/Excel"><Download size={14} /> CSV</button>
              <button type="button" onClick={triggerPrint} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-200 transition-colors" title="Cetak Presensi Harian"><Printer size={14} /> Cetak</button>
            </>
          )}
          {(viewMode === 'rekap' || viewMode === 'detail_guru') && (
            <>
              <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))} className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold dark:text-white cursor-pointer">
                {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold dark:text-white cursor-pointer">
                {[filterYear - 1, filterYear, filterYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button type="button" onClick={viewMode === 'detail_guru' ? handleExportDetailGuruCSV : handleExportRekap} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-emerald-100 transition-colors"><Download size={14} /> CSV</button>
              <button type="button" onClick={triggerPrint} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-200 transition-colors"><Printer size={14} /> Cetak</button>
            </>
          )}
          {isAdmin && (
            <button type="button" onClick={() => { setSettingsForm(settings); setShowSettings(true); }} className="flex items-center gap-1.5 px-3 py-2 bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-teal-100 transition-colors"><Settings size={14} /> Pengaturan</button>
          )}
        </div>
      </div>

      {viewMode === 'harian' ? (
        <div className={`${cx.card3xl} overflow-hidden print-section`}>
          {/* Header Cetak Dokumen Resmi */}
          <div className="hidden print:block p-5 border-b-2 border-black text-center mb-4">
            <h2 className="text-xl font-black uppercase tracking-wider text-black">{schoolProfile?.nama || 'SDIT QURRATA A\'YUN'}</h2>
            <p className="text-sm font-bold text-black uppercase mt-0.5">REKAPITULASI PRESENSI HARIAN GURU &amp; STAFF</p>
            <p className="text-xs text-black mt-1">Hari: <strong>{hariIni}</strong>, Tanggal: <strong>{filterDate}</strong> • Sesi: <strong>{sesiTerpilih.nama}</strong> ({sesiTerpilih.jamMasuk} - {sesiTerpilih.jamPulang})</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest print:border-b-2 print:border-black print:text-black">
                  <th className="p-3 pl-6 text-left print:border print:border-black">Nama Guru / Staff</th>
                  <th className="p-3 text-center print:border print:border-black">Jam Masuk</th>
                  <th className="p-3 text-center print:border print:border-black">Jam Pulang</th>
                  <th className="p-3 text-center print:border print:border-black">Status</th>
                  {!readOnly && <th className="p-3 pr-6 text-center no-print">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/40 print:divide-black">
                {filteredTeachersHarian.length === 0 ? (
                  <tr><td colSpan={5} className="p-12 text-center text-slate-400 italic print:border print:border-black">{filteredTeachers.length === 0 ? 'Tidak ada data guru/staff.' : 'Tidak ada guru yang dijadwalkan pada sesi ini hari ini.'}</td></tr>
                ) : filteredTeachersHarian.map(t => {
                  const rec = getRecord(t.id);
                  const status = rec?.status && (rec.jamMasuk || ['Sakit', 'Izin', 'Cuti', 'Dinas Luar', 'Alpa'].includes(rec.status)) ? rec.status : 'Belum Absen';
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors print:border-b print:border-black">
                      <td className="p-3 pl-6 print:border print:border-black">
                        <p className="font-bold text-slate-800 dark:text-white print:text-black">{t.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 print:text-black uppercase tracking-wider">{t.position || 'Guru'} • NIP: {t.nipy || t.nip || '-'}</p>
                      </td>
                      <td className="p-3 text-center font-mono font-bold print:border print:border-black">
                        <div className="flex items-center justify-center gap-1">
                          {formatJam(rec?.jamMasuk)}
                          {rec?.lokasiMasuk && <MapPin size={11} className="text-emerald-500 no-print" title={`Terverifikasi GPS, jarak ±${rec.lokasiMasuk.jarakMeter}m`} />}
                          {rec?.qrValidMasuk && <ScanLine size={11} className="text-emerald-500 no-print" title="Terverifikasi QR" />}
                        </div>
                      </td>
                      <td className="p-3 text-center font-mono font-bold print:border print:border-black">
                        <div className="flex items-center justify-center gap-1">
                          {formatJam(rec?.jamPulang)}
                          {rec?.lokasiPulang && <MapPin size={11} className="text-emerald-500 no-print" title={`Terverifikasi GPS, jarak ±${rec.lokasiPulang.jarakMeter}m`} />}
                          {rec?.qrValidPulang && <ScanLine size={11} className="text-emerald-500 no-print" title="Terverifikasi QR" />}
                        </div>
                      </td>
                      <td className="p-3 text-center print:border print:border-black">
                        <Badge colorClass={STATUS_BADGE[status]}>{status}{status === 'Terlambat' ? ` ${rec.terlambatMenit}m` : ''}</Badge>
                      </td>
                      {!readOnly && (
                        <td className="p-3 pr-6 no-print">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <button type="button" onClick={() => openEdit(t)} title="Edit manual" className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 transition-colors"><Edit size={14} /></button>
                            <button type="button" onClick={() => handleQuickStatus(t, 'Sakit')} title="Tandai Sakit" className="px-2 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-[10px] font-black uppercase hover:bg-blue-100 transition-colors">Sakit</button>
                            <button type="button" onClick={() => handleQuickStatus(t, 'Izin')} title="Tandai Izin" className="px-2 py-1.5 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 rounded-lg text-[10px] font-black uppercase hover:bg-violet-100 transition-colors">Izin</button>
                            {rec && <button type="button" onClick={() => handleDeleteRecord(t)} title="Hapus catatan" className="p-2 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded-lg hover:bg-rose-100 transition-colors"><Trash2 size={14} /></button>}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Lembar Tanda Tangan Cetak */}
          <div className="hidden print:flex justify-between items-end p-8 text-xs font-bold text-black mt-8">
            <div className="text-center">
              <p className="mb-20">Mengetahui,<br/>Kepala Sekolah</p>
              <p className="underline underline-offset-4 decoration-2">{schoolProfile?.kepalaSekolah || 'ILWANI, S.Pd.I'}</p>
            </div>
            <div className="text-center">
              <p className="mb-1">{schoolProfile?.alamat?.split(',')[0] || 'Kuala Pembuang'}, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              <p className="mb-20">Petugas / Tata Usaha,</p>
              <p className="underline underline-offset-4 decoration-2">{currentUser?.name || '___________________________'}</p>
            </div>
          </div>
        </div>
      ) : viewMode === 'rekap' ? (
        <div className={`${cx.card3xl} overflow-hidden print-section`}>
          <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center hidden print:flex">
            <div>
              <h2 className="font-black text-lg">{schoolProfile?.nama}</h2>
              <p className="text-sm font-bold">Rekap Presensi Guru &amp; Staff — {MONTH_NAMES[filterMonth - 1]} {filterYear}</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest print:border-black">
                  <th className="p-3 pl-6 text-left print:border print:border-black">Nama</th>
                  <th className="p-2 text-center text-emerald-600 print:border print:border-black">Hadir</th>
                  <th className="p-2 text-center text-amber-600 print:border print:border-black">Telat (Kali)</th>
                  <th className="p-2 text-center text-blue-600 print:border print:border-black">Sakit</th>
                  <th className="p-2 text-center text-violet-600 print:border print:border-black">Izin</th>
                  <th className="p-2 text-center text-rose-600 print:border print:border-black">Alpa</th>
                  <th className="p-2 text-center print:border print:border-black">Rata² Jam Masuk</th>
                  <th className="p-2 text-center pr-6 print:border print:border-black">Persentase</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/40">
                {rekapData.length === 0 ? (
                  <tr><td colSpan={8} className="p-12 text-center text-slate-400 italic">Tidak ada data rekap.</td></tr>
                ) : rekapData.map(r => {
                  let badgeColor = 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
                  if (r.persentase >= 90) badgeColor = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
                  else if (r.persentase >= 75) badgeColor = 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
                  else if (r.persentase >= 50) badgeColor = 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
                  else if (r.persentase > 0) badgeColor = 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400';
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="p-3 pl-6 print:border print:border-black">
                        <p className="font-bold text-slate-800 dark:text-white">{r.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{r.position || 'Guru'}</p>
                      </td>
                      <td className="p-3 text-center font-black text-emerald-600 print:border print:border-black">{r.hadir}</td>
                      <td className="p-3 text-center font-black text-amber-600 print:border print:border-black">{r.terlambat}x</td>
                      <td className="p-3 text-center font-black text-blue-600 print:border print:border-black">{r.sakit}</td>
                      <td className="p-3 text-center font-black text-violet-600 print:border print:border-black">{r.izin}</td>
                      <td className="p-3 text-center font-black text-rose-600 print:border print:border-black">{r.alpa}</td>
                      <td className="p-3 text-center font-mono font-bold print:border print:border-black">{r.avgMasuk}</td>
                      <td className="p-3 text-center pr-6 print:border print:border-black">
                        <span className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wide inline-block shadow-sm ${badgeColor} print:bg-transparent print:text-black`}>{r.persentase}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="hidden print:flex justify-between px-10 text-sm font-bold uppercase mt-12 pt-8 font-serif print-section border-t border-slate-800">
            <div className="text-center">
              <p className="mb-24">Mengetahui,<br />Kepala Sekolah,</p>
              <p className="underline underline-offset-4 decoration-2">{schoolProfile?.kepsek || '___________________________'}</p>
            </div>
            <div className="text-center">
              <p className="mb-1">{schoolProfile?.alamat?.split(',')[0] || 'Kota'}, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              <p className="mb-24">Admin / Tata Usaha,</p>
              <p className="underline underline-offset-4 decoration-2">{currentUser?.name || '___________________________'}</p>
            </div>
          </div>
          <style dangerouslySetInnerHTML={{
            __html: `
              @media print {
                body * { visibility: hidden; }
                .print-section, .print-section * { visibility: visible; color: black !important; background: white !important; }
                .print-section { position: absolute; left: 0; top: 0; width: 100%; border: none !important; box-shadow: none !important; padding: 0 !important; overflow: visible !important; height: auto !important; max-height: none !important; }
                .no-print { display: none !important; }
                @page { margin: 15mm; size: landscape; }
              }
            `}} />
        </div>
      ) : (
        <div className="space-y-6 print-section">
          <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-100 dark:border-slate-700 p-6 shadow-sm">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-6 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-md shrink-0">
                  {(targetTeacher?.name || 'G').charAt(0)}
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-800 dark:text-white leading-tight">{targetTeacher?.name}</h2>
                  <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wider">{targetTeacher?.position || 'Guru & Staff'} • NIP: {targetTeacher?.nip || '-'}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      (detailGuruData?.persentase || 0) >= 90
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : (detailGuruData?.persentase || 0) >= 75
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                        : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                    }`}>
                      Tingkat Kehadiran: {detailGuruData?.persentase || 0}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full md:w-auto">
                <div className="bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-2xl border border-emerald-100 dark:border-emerald-800 text-center min-w-[90px]">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">Hadir</span>
                  <span className="text-xl font-black text-emerald-600 dark:text-emerald-300">{detailGuruData?.hadir || 0}</span>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-2xl border border-amber-100 dark:border-amber-800 text-center min-w-[90px]">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 block">Terlambat</span>
                  <span className="text-xl font-black text-amber-600 dark:text-amber-300">{detailGuruData?.terlambat || 0}x</span>
                  {detailGuruData?.totalMenitTerlambat > 0 && (
                    <span className="text-[9px] font-bold text-amber-600 block">({detailGuruData.totalMenitTerlambat} m)</span>
                  )}
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-2xl border border-blue-100 dark:border-blue-800 text-center min-w-[90px]">
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-400 block">Izin/Sakit</span>
                  <span className="text-xl font-black text-blue-600 dark:text-blue-300">{(detailGuruData?.sakit || 0) + (detailGuruData?.izin || 0)}</span>
                </div>
                <div className="bg-rose-50 dark:bg-rose-900/20 p-3 rounded-2xl border border-rose-100 dark:border-rose-800 text-center min-w-[90px]">
                  <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 dark:text-rose-400 block">Alpa</span>
                  <span className="text-xl font-black text-rose-600 dark:text-rose-300">{detailGuruData?.alpa || 0}</span>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider mb-3">Log Presensi Harian — {MONTH_NAMES[filterMonth - 1]} {filterYear}</h3>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-200 dark:border-slate-700">
                      <th className="p-3 text-left pl-4">Tanggal</th>
                      <th className="p-3 text-center">Sesi</th>
                      <th className="p-3 text-center">Jam Masuk</th>
                      <th className="p-3 text-center">Jam Pulang</th>
                      <th className="p-3 text-center">Keterlambatan</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-center">Verifikasi</th>
                      <th className="p-3 text-left pr-4">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {(!detailGuruData?.logs || detailGuruData.logs.length === 0) ? (
                      <tr><td colSpan={8} className="p-12 text-center text-slate-400 italic">Belum ada catatan presensi untuk guru ini pada bulan yang dipilih.</td></tr>
                    ) : detailGuruData.logs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <td className="p-3 pl-4 font-bold text-slate-800 dark:text-white">
                          {new Date(log.date).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </td>
                        <td className="p-3 text-center text-xs font-bold text-slate-500">{log.sesiNama || 'Pagi'}</td>
                        <td className="p-3 text-center font-mono font-bold">{formatJam(log.jamMasuk)}</td>
                        <td className="p-3 text-center font-mono font-bold">{formatJam(log.jamPulang)}</td>
                        <td className="p-3 text-center">
                          {log.terlambatMenit > 0 ? (
                            <span className="text-amber-600 font-bold text-xs">+{log.terlambatMenit} m</span>
                          ) : (
                            <span className="text-slate-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <Badge colorClass={STATUS_BADGE[log.status]}>{log.status}</Badge>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {log.lokasiMasuk && <MapPin size={13} className="text-emerald-500" title={`GPS (${log.lokasiMasuk.jarakMeter}m)`} />}
                            {log.qrValidMasuk && <ScanLine size={13} className="text-emerald-500" title="QR Valid" />}
                            {!log.lokasiMasuk && !log.qrValidMasuk && <span className="text-[10px] text-slate-400 font-bold">Manual</span>}
                          </div>
                        </td>
                        <td className="p-3 pr-4 text-xs text-slate-500 dark:text-slate-400">{log.keterangan || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
      <Modal isOpen={showSettings} onClose={() => setShowSettings(false)} title="Pengaturan Presensi Guru" maxWidth="max-w-lg">
        <div className="space-y-5">
          <div>
            <p className={cx.sectionHeader}>Sesi Jam Kerja</p>
            <p className="text-[11px] text-slate-400 mb-3 pl-1">Tambahkan sesi jika sekolah punya lebih dari satu waktu presensi, misalnya <b>Pagi (KBM)</b> dan <b>Sore (Halaqoh Al-Qur'an)</b>. Guru akan memilih sesi saat absen bila lebih dari satu sesi aktif.</p>
            <SesiSettingField settingsForm={settingsForm} setSettingsForm={setSettingsForm} showConfirm={showConfirm} />
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
            <p className={cx.sectionHeader}>Jadwal Guru per Hari &amp; Sesi</p>
            <p className="text-[11px] text-slate-400 mb-3 pl-1">Checklist guru mana saja yang wajib presensi pada tiap hari (Senin&ndash;Sabtu) dan sesi &mdash; karena jam kerja tiap guru berbeda-beda. Jika belum diatur, semua guru aktif dianggap terjadwal seperti biasa.</p>
            <JadwalGuruSettingField settingsForm={settingsForm} setSettingsForm={setSettingsForm} teachers={teachers} showConfirm={showConfirm} />
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
            <p className={cx.sectionHeader}>Validasi Lokasi (GPS)</p>
            <p className="text-[11px] text-slate-400 mb-3 pl-1">Opsional. Tambahkan satu atau beberapa titik lokasi sekolah (misalnya jika ada beberapa gedung/kampus). Guru wajib berada dalam radius salah satu lokasi saat absen masuk/pulang. Kosongkan semua lokasi untuk menonaktifkan validasi.</p>
            <LokasiListSettingField settingsForm={settingsForm} setSettingsForm={setSettingsForm} showToast={showToast} showConfirm={showConfirm} />
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
            <p className={cx.sectionHeader}>Validasi QR Code Presensi</p>
            <p className="text-[11px] text-slate-400 mb-3 pl-1">Opsional. Cetak/tampilkan QR ini di gerbang atau kantor sekolah — guru wajib scan QR ini saat absen masuk/pulang.</p>
            <QrSettingField settingsForm={settingsForm} setSettingsForm={setSettingsForm} schoolProfile={schoolProfile} showConfirm={showConfirm} />
          </div>

          <button type="button" onClick={handleSaveSettings} className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-black py-3 rounded-xl shadow-md transition-colors">
            <Save size={16} /> Simpan Pengaturan
          </button>
        </div>
      </Modal>

      {/* MODAL EDIT MANUAL */}
      <Modal isOpen={!!editRow} onClose={() => setEditRow(null)} title={`Edit Presensi — ${editRow?.name || ''}`}>
        {editForm && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={cx.label}>Jam Masuk</label>
                <input type="time" className={cx.inputFocus} value={editForm.jamMasuk} onChange={e => setEditForm({ ...editForm, jamMasuk: e.target.value })} />
              </div>
              <div>
                <label className={cx.label}>Jam Pulang</label>
                <input type="time" className={cx.inputFocus} value={editForm.jamPulang} onChange={e => setEditForm({ ...editForm, jamPulang: e.target.value })} />
              </div>
            </div>
            <div>
              <label className={cx.label}>Status</label>
              <select className={`${cx.inputFocus} font-bold cursor-pointer`} value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <p className="text-[11px] text-slate-400 mt-1 pl-1">Jika Jam Masuk diisi dan status Hadir/Terlambat, status &amp; keterlambatan akan dihitung ulang otomatis.</p>
            </div>
            <div>
              <label className={cx.label}>Keterangan</label>
              <textarea rows={2} className={cx.inputFocus} value={editForm.keterangan} onChange={e => setEditForm({ ...editForm, keterangan: e.target.value })} placeholder="Opsional" />
            </div>
            <button type="button" onClick={handleSaveEdit} className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-black py-3 rounded-xl shadow-md transition-colors">
              <Save size={16} /> Simpan
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ==========================================
// SUB-KOMPONEN: PENGATURAN MULTI-LOKASI SEKOLAH (GPS) — CRUD
// ==========================================
function LokasiListSettingField({ settingsForm, setSettingsForm, showToast, showConfirm }) {
  const [locating, setLocating] = useState(false);
  const list = settingsForm.lokasiList || [];
  const [form, setForm] = useState(null); // null = tidak sedang tambah/edit

  const bukaTambah = () => setForm({ id: null, nama: '', latitude: null, longitude: null, radiusMeter: 150 });
  const bukaEdit = (lok) => setForm({ ...lok });
  const tutupForm = () => setForm(null);

  const ambilLokasiSaatIni = () => {
    if (!navigator.geolocation) { showToast('Perangkat/browser ini tidak mendukung GPS.', 'error'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(f => ({ ...f, latitude: pos.coords.latitude, longitude: pos.coords.longitude }));
        showToast('Lokasi saat ini berhasil diambil. Pastikan Anda berdiri di titik acuan sebelum menyimpan.', 'success');
        setLocating(false);
      },
      () => { showToast('Gagal mengambil lokasi. Pastikan izin GPS diaktifkan.', 'error'); setLocating(false); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const simpanForm = () => {
    if (!form.nama.trim()) { showToast('Nama lokasi wajib diisi.', 'error'); return; }
    if (form.latitude == null || form.longitude == null) { showToast('Latitude & longitude wajib diisi (atau tekan "Ambil Lokasi Saat Ini").', 'error'); return; }
    const entry = { id: form.id || generateLokasiId(), nama: form.nama.trim(), latitude: Number(form.latitude), longitude: Number(form.longitude), radiusMeter: Number(form.radiusMeter) || 150 };
    const exists = list.some(l => l.id === entry.id);
    const updated = exists ? list.map(l => l.id === entry.id ? entry : l) : [...list, entry];
    setSettingsForm({ ...settingsForm, lokasiList: updated });
    setForm(null);
  };

  const hapusLokasi = (lok) => {
    showConfirm(`Hapus lokasi "${lok.nama}"?`, () => {
      setSettingsForm({ ...settingsForm, lokasiList: list.filter(l => l.id !== lok.id) });
    });
  };

  return (
    <div className="space-y-3">
      {list.length === 0 && !form && (
        <div className="rounded-xl p-3 border border-slate-200 bg-slate-50 dark:bg-slate-900/40 dark:border-slate-700">
          <p className="text-xs font-black flex items-center gap-1.5 text-slate-500">
            <AlertCircle size={14} className="text-slate-400" /> Belum ada lokasi terdaftar — validasi GPS nonaktif.
          </p>
        </div>
      )}

      {list.length > 0 && (
        <div className="space-y-2">
          {list.map(lok => (
            <div key={lok.id} className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10 p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-black text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5"><MapPin size={12} /> {lok.nama}</p>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">{lok.latitude.toFixed(6)}, {lok.longitude.toFixed(6)} • radius {lok.radiusMeter}m</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => bukaEdit(lok)} className="p-2 bg-white dark:bg-slate-800 text-slate-500 rounded-lg hover:bg-slate-100 transition-colors"><Edit size={13} /></button>
                <button type="button" onClick={() => hapusLokasi(lok)} className="p-2 bg-white dark:bg-slate-800 text-rose-500 rounded-lg hover:bg-rose-50 transition-colors"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {form ? (
        <div className="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-900/10 p-3 space-y-3">
          <div>
            <label className={cx.label}>Nama Lokasi</label>
            <input type="text" className={cx.inputFocus} placeholder="Contoh: Gedung Utama / Kampus 2" value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={cx.label}>Latitude</label>
              <input type="number" step="any" className={cx.inputFocus} value={form.latitude ?? ''} placeholder="-2.208900"
                onChange={e => setForm({ ...form, latitude: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
            <div>
              <label className={cx.label}>Longitude</label>
              <input type="number" step="any" className={cx.inputFocus} value={form.longitude ?? ''} placeholder="113.921800"
                onChange={e => setForm({ ...form, longitude: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <label className={cx.label}>Radius Diizinkan (meter)</label>
            <input type="number" min="10" className={cx.inputFocus} value={form.radiusMeter}
              onChange={e => setForm({ ...form, radiusMeter: Number(e.target.value) || 0 })} />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={ambilLokasiSaatIni} disabled={locating} className="flex-1 flex items-center justify-center gap-1.5 bg-white dark:bg-slate-800 border border-teal-200 dark:border-teal-800 text-teal-600 dark:text-teal-400 font-black py-2.5 rounded-xl text-xs uppercase tracking-wider hover:bg-teal-100 transition-colors disabled:opacity-50">
              {locating ? <Loader2 size={14} className="animate-spin" /> : <Crosshair size={14} />}
              {locating ? 'Mendeteksi…' : 'Ambil Lokasi Saat Ini'}
            </button>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={simpanForm} className="flex-1 flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-black py-2.5 rounded-xl text-xs uppercase tracking-wider transition-colors">
              <Save size={14} /> Simpan Lokasi
            </button>
            <button type="button" onClick={tutupForm} className="px-4 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-200 transition-colors">
              Batal
            </button>
          </div>
          <p className="text-[10px] text-slate-400 pl-1">Tips: buka halaman ini dari HP Anda saat berdiri di titik acuan lokasi (misal gerbang utama), lalu tekan "Ambil Lokasi Saat Ini".</p>
        </div>
      ) : (
        <button type="button" onClick={bukaTambah} className="w-full flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 text-white font-black py-2.5 rounded-xl text-xs uppercase tracking-wider transition-colors">
          <MapPin size={14} /> Tambah Lokasi
        </button>
      )}
    </div>
  );
}

// ==========================================
// SUB-KOMPONEN: PENGATURAN MULTI-SESI JAM KERJA — CRUD
// (mis. Pagi/KBM & Sore/Halaqoh Al-Qur'an)
// ==========================================
function SesiSettingField({ settingsForm, setSettingsForm, showConfirm }) {
  const list = settingsForm.sesiList && settingsForm.sesiList.length > 0
    ? settingsForm.sesiList
    : [{ id: 'pagi', nama: 'Pagi (KBM)', jamMasuk: '07:00', toleransiMenit: 15, jamPulang: '14:00' }];
  const [form, setForm] = useState(null);

  const bukaTambah = () => setForm({ id: null, nama: '', jamMasuk: '07:00', toleransiMenit: 15, jamPulang: '14:00' });
  const bukaEdit = (sesi) => setForm({ ...sesi });

  const simpanForm = (showToastLocal) => {
    if (!form.nama.trim()) return;
    const entry = { id: form.id || generateSesiId(), nama: form.nama.trim(), jamMasuk: form.jamMasuk, toleransiMenit: Number(form.toleransiMenit) || 0, jamPulang: form.jamPulang };
    const exists = list.some(s => s.id === entry.id);
    const updated = exists ? list.map(s => s.id === entry.id ? entry : s) : [...list, entry];
    setSettingsForm({ ...settingsForm, sesiList: updated });
    setForm(null);
  };

  const hapusSesi = (sesi) => {
    if (list.length <= 1) return;
    showConfirm(`Hapus sesi "${sesi.nama}"? Riwayat presensi sesi ini tetap tersimpan namun tidak akan tampil di filter sesi.`, () => {
      setSettingsForm({ ...settingsForm, sesiList: list.filter(s => s.id !== sesi.id) });
    });
  };

  return (
    <div className="space-y-2">
      {list.map((sesi, i) => (
        <div key={sesi.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-black text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <Clock3 size={12} className="text-teal-500" /> {sesi.nama} {i === 0 && <span className="text-[9px] font-bold text-slate-400 uppercase">(Utama)</span>}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Masuk {sesi.jamMasuk} (toleransi {sesi.toleransiMenit}m) • Pulang {sesi.jamPulang}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={() => bukaEdit(sesi)} className="p-2 bg-slate-50 dark:bg-slate-800 text-slate-500 rounded-lg hover:bg-slate-100 transition-colors"><Edit size={13} /></button>
            {list.length > 1 && (
              <button type="button" onClick={() => hapusSesi(sesi)} className="p-2 bg-slate-50 dark:bg-slate-800 text-rose-500 rounded-lg hover:bg-rose-50 transition-colors"><Trash2 size={13} /></button>
            )}
          </div>
        </div>
      ))}

      {form ? (
        <div className="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-900/10 p-3 space-y-3">
          <div>
            <label className={cx.label}>Nama Sesi</label>
            <input type="text" className={cx.inputFocus} placeholder="Contoh: Sore (Halaqoh Al-Qur'an)" value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={cx.label}>Jam Masuk</label>
              <input type="time" className={cx.inputFocus} value={form.jamMasuk} onChange={e => setForm({ ...form, jamMasuk: e.target.value })} />
            </div>
            <div>
              <label className={cx.label}>Jam Pulang</label>
              <input type="time" className={cx.inputFocus} value={form.jamPulang} onChange={e => setForm({ ...form, jamPulang: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={cx.label}>Toleransi Keterlambatan (menit)</label>
            <input type="number" min="0" className={cx.inputFocus} value={form.toleransiMenit} onChange={e => setForm({ ...form, toleransiMenit: Number(e.target.value) })} />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={simpanForm} className="flex-1 flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-black py-2.5 rounded-xl text-xs uppercase tracking-wider transition-colors">
              <Save size={14} /> Simpan Sesi
            </button>
            <button type="button" onClick={() => setForm(null)} className="px-4 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-200 transition-colors">
              Batal
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={bukaTambah} className="w-full flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 text-white font-black py-2.5 rounded-xl text-xs uppercase tracking-wider transition-colors">
          <Clock3 size={14} /> Tambah Sesi
        </button>
      )}
    </div>
  );
}

// ==========================================
// SUB-KOMPONEN: JADWAL GURU PER HARI (SENIN-SABTU) & SESI — CHECKLIST
// Memudahkan Admin mengelola guru mana yang wajib presensi pada kombinasi
// hari + sesi tertentu, karena jam kerja/hari masuk tiap guru berbeda.
// ==========================================
function JadwalGuruSettingField({ settingsForm, setSettingsForm, teachers, showConfirm }) {
  const sesiList = settingsForm.sesiList && settingsForm.sesiList.length > 0
    ? settingsForm.sesiList
    : [{ id: 'pagi', nama: 'Pagi (KBM)' }];
  const activeTeachers = useMemo(
    () => (teachers || []).filter(t => t.status !== 'Non-Aktif').sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [teachers]
  );

  const [selectedHari, setSelectedHari] = useState(HARI_LIST[0].id);
  const [selectedSesiId, setSelectedSesiId] = useState(sesiList[0]?.id);
  // Jaga-jaga jika sesi terpilih dihapus dari SesiSettingField di atas
  const sesiAktifId = sesiList.some(s => s.id === selectedSesiId) ? selectedSesiId : sesiList[0]?.id;

  const jadwal = settingsForm.jadwalGuru || {};
  const daftarTerpilih = jadwal?.[selectedHari]?.[sesiAktifId];
  const sudahDiatur = Array.isArray(daftarTerpilih);
  // Belum diatur = default semua guru aktif dianggap terjadwal
  const idTerjadwal = sudahDiatur ? daftarTerpilih : activeTeachers.map(t => t.id);

  const updateDaftar = (updated) => {
    setSettingsForm({
      ...settingsForm,
      jadwalGuru: {
        ...jadwal,
        [selectedHari]: {
          ...(jadwal[selectedHari] || {}),
          [sesiAktifId]: updated,
        },
      },
    });
  };

  const toggleGuru = (teacherId) => {
    const updated = idTerjadwal.includes(teacherId) ? idTerjadwal.filter(id => id !== teacherId) : [...idTerjadwal, teacherId];
    updateDaftar(updated);
  };

  const pilihSemua = () => updateDaftar(activeTeachers.map(t => t.id));
  const kosongkanSemua = () => updateDaftar([]);
  const gunakanDefault = () => {
    // Hapus key kombinasi hari+sesi ini supaya kembali ke default (semua guru aktif)
    const hariBaru = { ...(jadwal[selectedHari] || {}) };
    delete hariBaru[sesiAktifId];
    setSettingsForm({ ...settingsForm, jadwalGuru: { ...jadwal, [selectedHari]: hariBaru } });
  };

  return (
    <div className="space-y-3">
      {/* Tab Hari */}
      <div className="flex flex-wrap gap-1.5">
        {HARI_LIST.map(h => (
          <button key={h.id} type="button" onClick={() => setSelectedHari(h.id)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${selectedHari === h.id ? 'bg-teal-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-900 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'}`}>
            {h.nama}
          </button>
        ))}
      </div>

      {/* Tab Sesi (hanya tampil jika lebih dari 1 sesi) */}
      {sesiList.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {sesiList.map(s => (
            <button key={s.id} type="button" onClick={() => setSelectedSesiId(s.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all border ${sesiAktifId === s.id ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 border-teal-300 dark:border-teal-700' : 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-50'}`}>
              Sesi {s.nama}
            </button>
          ))}
        </div>
      )}

      <div className={`rounded-xl p-3 border ${sudahDiatur ? 'border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-900/10' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40'}`}>
        <p className="text-[11px] font-bold text-slate-500">
          {idTerjadwal.length} dari {activeTeachers.length} guru aktif dijadwalkan &mdash; <b>{HARI_LIST.find(h => h.id === selectedHari)?.nama}</b>, Sesi <b>{sesiList.find(s => s.id === sesiAktifId)?.nama}</b>
          {!sudahDiatur && <span className="italic"> (default: semua guru)</span>}
        </p>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={pilihSemua} className="flex-1 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-emerald-100 transition-colors">Pilih Semua</button>
        <button type="button" onClick={kosongkanSemua} className="flex-1 px-3 py-2 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-rose-100 transition-colors">Kosongkan</button>
        {sudahDiatur && (
          <button type="button" onClick={gunakanDefault} className="flex-1 px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-slate-200 transition-colors">Reset ke Default</button>
        )}
      </div>

      <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
        {activeTeachers.length === 0 ? (
          <p className="text-xs text-slate-400 italic text-center py-4">Belum ada data guru aktif.</p>
        ) : activeTeachers.map(t => {
          const dicentang = idTerjadwal.includes(t.id);
          return (
            <label key={t.id} className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-colors ${dicentang ? 'bg-teal-50 dark:bg-teal-900/10' : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'} border border-slate-100 dark:border-slate-700`}>
              <input type="checkbox" checked={dicentang} onChange={() => toggleGuru(t.id)} className="w-4 h-4 accent-teal-600 rounded shrink-0" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{t.name}</span>
              <span className="text-[10px] text-slate-400 ml-auto shrink-0">{t.position || '-'}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ==========================================
// SUB-KOMPONEN: PENGATURAN QR CODE PRESENSI
// ==========================================
function QrSettingField({ settingsForm, setSettingsForm, schoolProfile, showConfirm }) {
  const aktif = !!settingsForm.qrToken;
  const payload = aktif ? buildQrPayload(schoolProfile?.npsn, settingsForm.qrToken) : '';
  const qrImageUrl = aktif ? buildQrImageUrl(payload) : '';
  const adaLokasi = getLokasiList(settingsForm).length > 0;

  const buatQrBaru = () => {
    setSettingsForm({ ...settingsForm, qrToken: generateQrToken() });
  };

  const regenerateQr = () => {
    showConfirm('Buat ulang kode QR akan membuat QR lama tidak berlaku lagi. Guru harus scan QR baru mulai hari ini. Lanjutkan?', () => {
      setSettingsForm({ ...settingsForm, qrToken: generateQrToken() });
    });
  };

  const nonaktifkanQr = () => {
    showConfirm('Nonaktifkan validasi QR? Guru bisa absen tanpa scan QR lagi.', () => {
      setSettingsForm({ ...settingsForm, qrToken: '' });
    });
  };

  if (!aktif) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl p-3 border border-slate-200 bg-slate-50 dark:bg-slate-900/40 dark:border-slate-700">
          <p className="text-xs font-black flex items-center gap-1.5 text-slate-500">
            <AlertCircle size={14} className="text-slate-400" /> Validasi QR belum diaktifkan
          </p>
        </div>
        <button type="button" onClick={buatQrBaru} className="w-full flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 text-white font-black py-2.5 rounded-xl text-xs uppercase tracking-wider transition-colors">
          <QrCode size={14} /> Buat Kode QR Presensi
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl p-3 border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-800">
        <p className="text-xs font-black flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 size={14} /> Validasi QR aktif
        </p>
      </div>

      {!adaLokasi && (
        <div className="rounded-xl p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 text-xs text-amber-900 dark:text-amber-300 space-y-1.5">
          <p className="font-black flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
            <AlertTriangle size={15} /> Peringatan Keamanan Presensi:
          </p>
          <p className="leading-relaxed">
            Barcode QR aktif tetapi <b>Koordinat GPS Sekolah belum diatur</b>. Guru yang memiliki foto barcode dapat memindai dari rumah jika GPS belum diatur.
          </p>
          <p className="font-bold text-amber-800 dark:text-amber-200">
            &rarr; Tambahkan minimal 1 Titik Lokasi GPS Sekolah di bagian <b>"Validasi Lokasi (GPS)"</b> di atas agar presensi dari luar sekolah otomatis ditolak.
          </p>
        </div>
      )}

      <div className="flex flex-col items-center gap-2 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-700">
        <img src={qrImageUrl} alt="QR Presensi Sekolah" width={200} height={200} className="rounded-lg" />
        <p className="text-[10px] text-slate-400 font-mono">{settingsForm.qrToken}</p>
      </div>
      <div className="flex gap-2">
        <a href={qrImageUrl} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-1.5 bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 font-black py-2.5 rounded-xl text-xs uppercase tracking-wider hover:bg-teal-100 transition-colors">
          <Download size={14} /> Cetak / Unduh
        </a>
        <button type="button" onClick={regenerateQr} className="flex items-center justify-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 font-black py-2.5 px-3 rounded-xl text-xs uppercase tracking-wider hover:bg-amber-100 transition-colors">
          <RefreshCw size={14} /> Buat Ulang
        </button>
        <button type="button" onClick={nonaktifkanQr} className="flex items-center justify-center gap-1.5 bg-rose-50 dark:bg-rose-900/20 text-rose-500 font-black py-2.5 px-3 rounded-xl text-xs uppercase tracking-wider hover:bg-rose-100 transition-colors">
          <XCircle size={14} />
        </button>
      </div>
      <p className="text-[10px] text-slate-400 pl-1">Cetak QR ini dan tempel di gerbang/kantor sekolah. Setiap kali dibuat ulang, QR lama otomatis tidak berlaku.</p>
    </div>
  );
}
