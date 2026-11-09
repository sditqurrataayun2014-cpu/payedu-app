import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  AlertCircle, Archive, Award, BellRing, Briefcase, Building, Calendar, CalendarDays,
  Check, CheckCircle, CheckCircle2, ChevronRight, Clock, Clock3, Cloud, CreditCard,
  Download, Edit, Eye, EyeOff, FileText, Fingerprint, GraduationCap, History,
  Info, LayoutDashboard, ListPlus, Lock, LogIn, LogOut, MessageSquare, Printer,
  Save, Send, ShieldCheck, Sparkles, Star, TrendingUp, UserCircle, Users, Wallet, X
} from 'lucide-react';

import PresensiGuruView from '../../PresensiGuruView';
import SlipDocument from '../../components/SlipDocument';

import { 
  calculatePayroll, 
  exportToPDF, 
  formatDateId, 
  formatRp, 
  formatToInputDate, 
  generateUniqueId, 
  getFormattedPeriod, 
  getLocalIsoDate, 
  safeStorageSet 
} from '../../utils/payrollUtils';

import { getSesiTheme } from '../../utils/sesiTheme';

import { 
  createTeacherPatchHandler,
  pushSinglePresensiRecord,
  pushCloudData as pushToSupabase
} from '../../services/dbService';

import { 
  isBiometricSupported, 
  getSavedBiometricAccount, 
  registerBiometricLogin, 
  removeBiometricAccount 
} from '../../services/biometricService';

import { verifyTeacherDevice } from '../../services/deviceService';
import { registerBackModal } from '../../services/navigationService';

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
export default function PortalGuruView({ user, teachers, setTeachers, settings, setSettings, feedbacks, setFeedbacks, activeSection, setActiveTab, archives, presensiGuru = [], setPresensiGuru, saveAuditLog }) {
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

export { PortalGuruView, PortalCard };
