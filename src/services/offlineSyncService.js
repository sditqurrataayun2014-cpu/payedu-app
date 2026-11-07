/**
 * 🛰️ offlineSyncService.js
 * Sistem Antrean Presensi Offline Tingkat Lanjut berbasis IndexedDB & Background Sync API.
 * 
 * Keunggulan:
 * 1. Data absensi tersimpan permanen di IndexedDB (kapasitas besar & non-volatile).
 * 2. Mendukung Background Sync API Android/Chrome: Absen otomatis terkirim begitu HP
 *    terhubung ke internet, bahkan jika aplikasi PayEdu sudah ditutup oleh guru.
 * 3. Tetap sinkron dengan LocalStorage sebagai cadangan ganda (Zero Data Loss).
 */

const DB_NAME = 'payedu_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'pending_attendance';
const SYNC_TAG = 'payedu-attendance-sync';

// Inisialisasi IndexedDB
const openDB = () => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB tidak didukung pada browser ini.'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('teacherId', 'teacherId', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error || new Error('Gagal membuka IndexedDB'));
    };
  });
};

/**
 * 📥 Simpan rekaman presensi ke antrean offline IndexedDB
 * @param {Object} record - Objek data presensi guru
 */
export const saveOfflineAttendance = async (record) => {
  if (!record || !record.id) {
    console.warn('[OfflineSync] Rekaman presensi tidak memiliki ID unik.');
    return false;
  }

  const enrichedRecord = {
    ...record,
    savedAt: Date.now(),
    retryCount: record.retryCount || 0
  };

  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(enrichedRecord);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });

    console.log(`[OfflineSync] ✅ Presensi ${record.teacherName || record.teacherId} (${record.status || 'Hadir'}) disimpan ke IndexedDB.`);

    // Minta sistem Service Worker untuk mendaftarkan Background Sync
    await requestBackgroundSync();
    return true;
  } catch (err) {
    console.warn('[OfflineSync] Gagal menyimpan ke IndexedDB, menggunakan cadangan localStorage:', err);
    return false;
  }
};

/**
 * 📋 Ambil semua rekaman presensi yang tertunda di IndexedDB
 */
export const getOfflineAttendanceList = async () => {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[OfflineSync] Gagal membaca dari IndexedDB:', err);
    return [];
  }
};

/**
 * 🗑️ Hapus rekaman presensi dari antrean IndexedDB setelah sukses terkirim ke Cloud
 * @param {string} id - ID presensi
 */
export const removeOfflineAttendance = async (id) => {
  if (!id) return false;
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
    console.log(`[OfflineSync] Rekaman ID ${id} selesai dikirim & dihapus dari antrean IndexedDB.`);
    return true;
  } catch (err) {
    console.warn(`[OfflineSync] Gagal menghapus record ${id} dari IndexedDB:`, err);
    return false;
  }
};

/**
 * 📡 Mendaftarkan Background Sync ke Service Worker Android/Browser
 */
export const requestBackgroundSync = async () => {
  try {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.sync) {
        await reg.sync.register(SYNC_TAG);
        console.log(`[OfflineSync] 🛰️ Service Worker Background Sync '${SYNC_TAG}' berhasil didaftarkan!`);
        return true;
      }
    }
  } catch (err) {
    console.log('[OfflineSync] Background Sync API tidak didukung pada browser ini, menggunakan listener online.');
  }
  return false;
};

/**
 * 🔄 Proses pengiriman seluruh antrean offline ke Supabase Cloud
 * @param {Function} pushSingleRecordFn - Fungsi pushSinglePresensiRecord dari dbService
 */
export const syncOfflineAttendanceQueue = async (pushSingleRecordFn) => {
  if (!navigator.onLine || typeof pushSingleRecordFn !== 'function') return;

  try {
    const pendingList = await getOfflineAttendanceList();
    if (!pendingList || pendingList.length === 0) return;

    console.log(`[OfflineSync] Memproses ${pendingList.length} presensi tertunda dari IndexedDB...`);

    for (const rec of pendingList) {
      try {
        const res = await pushSingleRecordFn(rec, { _fromQueue: true });
        if (res && res.status === 'success') {
          await removeOfflineAttendance(rec.id);
        } else {
          console.warn(`[OfflineSync] Percobaan kirim presensi ${rec.id} belum berhasil, antrean dipertahankan.`);
        }
      } catch (e) {
        console.warn(`[OfflineSync] Gagal push record ${rec.id}:`, e);
      }
    }
  } catch (err) {
    console.warn('[OfflineSync] Kesalahan dalam siklus syncOfflineAttendanceQueue:', err);
  }
};

/**
 * 🔔 Pasang listener otomatis agar antrean diproses saat internet terhubung kembali
 * @param {Function} pushSingleRecordFn 
 */
export const registerOfflineSyncListeners = (pushSingleRecordFn) => {
  if (typeof window === 'undefined') return;

  const runSync = () => {
    if (navigator.onLine) {
      syncOfflineAttendanceQueue(pushSingleRecordFn);
    }
  };

  window.addEventListener('online', runSync);
  window.addEventListener('focus', runSync);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') runSync();
  });

  // Siklus pengecekan periodik setiap 45 detik saat online
  const intervalId = setInterval(runSync, 45000);

  // Coba kirim segera saat aplikasi pertama kali dimuat
  setTimeout(runSync, 2000);

  return () => {
    window.removeEventListener('online', runSync);
    window.removeEventListener('focus', runSync);
    clearInterval(intervalId);
  };
};
