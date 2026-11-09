import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  AlertCircle, Calculator, Eye, EyeOff, Fingerprint, Lock,
  LogIn, Moon, PlusCircle, Save, ShieldCheck, Sun, UserCircle, X
} from 'lucide-react';

import {
  generateTeacherId, isTeacherActive, safeStorageGet,
  safeStorageSet, simpleHash
} from '../utils/payrollUtils';
import { pushCloudData as pushToSupabase } from '../services/dbService';
import {
  authenticateWithBiometrics, getSavedBiometricAccount,
  isBiometricSupported, removeBiometricAccount
} from '../services/biometricService';

export default function LoginView({ onLogin, isDarkMode, toggleTheme, settings, recordLogin, teachers, setTeachers }) {
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
export { LoginView };
