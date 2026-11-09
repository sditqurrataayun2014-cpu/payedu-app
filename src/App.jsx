import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Calculator, Download } from 'lucide-react';
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
  registerOfflineSyncListeners,
  createTeacherPatchHandler
} from './services/dbService';
import {
  safeStorageGet,
  safeStorageSet,
  sanitizeTeacherData,
  generateUniqueId,
  sortLoginLogs,
  defaultGeneralSettings
} from './utils/payrollUtils';
import LoginView from './components/LoginView';
import MainLayout from './components/MainLayout';

const initialTeachers = [];

const sanitizeTeacherList = (list) => {
  if (!Array.isArray(list)) return [];
  const sanitized = list.map(sanitizeTeacherData);
  return sortTeachersById(deduplicateTeachers(sanitized));
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

// [MODULARISASI] MainLayout beserta sub-views dipindahkan ke src/components/MainLayout.jsx
