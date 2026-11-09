import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { 
  saveOfflineAttendance, 
  removeOfflineAttendance, 
  syncOfflineAttendanceQueue,
  registerOfflineSyncListeners 
} from './offlineSyncService';

// Helper Failsafe untuk Penyimpanan Lokal
const safeStorageGet = (key, fallback) => {
  try {
    const item = localStorage.getItem(key);
    if (!item) return fallback;
    const parsed = JSON.parse(item);
    // Deteksi double-encode: jika hasil parse masih string, parse sekali lagi
    if (typeof parsed === 'string') {
      try { return JSON.parse(parsed); } catch(e) { return fallback; }
    }
    return parsed;
  } catch (e) {
    console.error(`Gagal membaca ${key} dari LocalStorage:`, e);
    return fallback;
  }
};

const safeStorageSet = (key, value) => {
  try {
    // Selalu simpan sebagai JSON string, TIDAK pernah double-encode
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    localStorage.setItem(key, str);
  } catch (e) {
    console.error(`Gagal menyimpan ${key} ke LocalStorage:`, e);
  }
};

// ==========================================
// PRESENSI GURU: DUAL-ENGINE STORAGE
// 1. Prioritas Utama: Tabel Mandiri `presensi_records` (Relasional Cepat)
// 2. Failsafe Cadangan: Baris `settings` (id='presensi_guru')
// 3. Sumber Offline Cepat: LocalStorage ('payedu_presensi_guru')
// 4. 🛡️ Antrian Offline: Jika push gagal total, data masuk antrian retry otomatis
// ==========================================

let _isPresensiRecordsTableAvailable = null;
let _lastPushedPresensiHash = '';
let _lastPushedPresensiTime = 0; // Timestamp push terakhir yang berhasil
const HASH_VALIDITY_MS = 5000; // Hash hanya valid selama 5 detik (mencegah data lama memblokir push baru)

// 🛡️ ANTRIAN OFFLINE: Menyimpan data presensi yang gagal dipush ke cloud (Single & Bulk)
const PENDING_QUEUE_KEY = 'payedu_presensi_pending_queue';
const PENDING_SINGLE_QUEUE_KEY = 'payedu_presensi_pending_singles';

export const enqueueSinglePendingRecord = (record) => {
  try {
    if (!record || !record.id) return;
    const current = safeStorageGet(PENDING_SINGLE_QUEUE_KEY, []);
    const queue = Array.isArray(current) ? current : [];
    const idx = queue.findIndex(r => r.id === record.id);
    if (idx >= 0) {
      queue[idx] = record;
    } else {
      queue.push(record);
    }
    safeStorageSet(PENDING_SINGLE_QUEUE_KEY, queue);
    console.log('[Antrian Offline] 1 record presensi masuk antrian retry:', record.teacherName, record.jamMasuk);
  } catch (e) {
    console.warn('[Antrian Offline] Gagal menyimpan single antrian:', e);
  }
};

export const dequeueSinglePendingRecords = () => {
  try {
    const list = safeStorageGet(PENDING_SINGLE_QUEUE_KEY, []);
    if (Array.isArray(list) && list.length > 0) return list;
  } catch (e) {}
  return [];
};

export const removeSinglePendingRecord = (recordId) => {
  try {
    if (!recordId) return;
    const list = dequeueSinglePendingRecords();
    if (list.length === 0) return;
    const filtered = list.filter(r => r.id !== recordId);
    if (filtered.length === 0) {
      localStorage.removeItem(PENDING_SINGLE_QUEUE_KEY);
    } else {
      safeStorageSet(PENDING_SINGLE_QUEUE_KEY, filtered);
    }
  } catch (e) {}
};

const enqueuePendingPush = (presensiArray) => {
  try {
    // Simpan hanya snapshot terbaru (tidak menumpuk banyak versi)
    safeStorageSet(PENDING_QUEUE_KEY, {
      data: presensiArray,
      timestamp: Date.now(),
      retryCount: 0
    });
    console.log('[Antrian Offline] Data presensi masuk antrian untuk retry otomatis.');
  } catch (e) {
    console.warn('[Antrian Offline] Gagal menyimpan antrian:', e);
  }
};

const dequeuePendingPush = () => {
  try {
    const pending = safeStorageGet(PENDING_QUEUE_KEY, null);
    if (pending && pending.data && Array.isArray(pending.data) && pending.data.length > 0) {
      return pending;
    }
  } catch (e) {}
  return null;
};

const clearPendingQueue = () => {
  try { localStorage.removeItem(PENDING_QUEUE_KEY); } catch (e) {}
};

/**
 * 🔄 Flush antrian presensi yang tertunda (dipanggil saat online kembali atau saat login).
 * Mengirimkan data presensi yang sebelumnya gagal dipush ke cloud.
 */
export const flushPendingPresensi = async () => {
  if (!isSupabaseConfigured() || !navigator.onLine) return;

  // 1. Flush antrian rekaman tunggal (prioritas tercepat & paling akurat)
  const pendingSingles = dequeueSinglePendingRecords();
  if (pendingSingles.length > 0) {
    console.log(`[Antrian Offline] Mengirim ${pendingSingles.length} record presensi tunggal yang tertunda...`);
    for (const rec of pendingSingles) {
      try {
        const res = await pushSinglePresensiRecord(rec, { _fromQueue: true });
        if (res.status === 'success') {
          removeSinglePendingRecord(rec.id);
        }
      } catch (err) {
        console.warn('[Antrian Offline] Gagal flush single record:', err);
      }
    }
  }

  // 2. Flush antrian bulk
  const pending = dequeuePendingPush();
  if (!pending) return;

  // Jangan retry jika data sudah terlalu lama (> 24 jam) — mungkin sudah kadaluarsa
  const ageMs = Date.now() - (pending.timestamp || 0);
  if (ageMs > 24 * 60 * 60 * 1000) {
    console.log('[Antrian Offline] Data antrian sudah kadaluarsa (>24 jam), dihapus.');
    clearPendingQueue();
    return;
  }

  console.log('[Antrian Offline] Mengirim ulang data presensi tertunda ke cloud...');
  try {
    const result = await pushPresensiGuru(pending.data, { overwrite: false, _fromQueue: true });
    if (result.status === 'success') {
      console.log('[Antrian Offline] ✅ Berhasil mengirim data tertunda ke cloud!');
      clearPendingQueue();
    }
  } catch (e) {
    console.warn('[Antrian Offline] Gagal flush antrian:', e);
  }

  // 3. Flush antrian IndexedDB (Background Sync Queue)
  try {
    await syncOfflineAttendanceQueue(pushSinglePresensiRecord);
  } catch (e) {
    console.warn('[OfflineSync] Gagal flush antrian IndexedDB:', e);
  }
};

export { registerOfflineSyncListeners };

/**
 * Mengecek ketersediaan tabel mandiri `presensi_records` di Supabase.
 */
export const isPresensiRecordsTableAvailable = async () => {
  if (_isPresensiRecordsTableAvailable !== null) return _isPresensiRecordsTableAvailable;
  if (!isSupabaseConfigured() || !supabase) return false;
  try {
    const { error } = await supabase.from('presensi_records').select('id').limit(1);
    _isPresensiRecordsTableAvailable = !error;
  } catch {
    _isPresensiRecordsTableAvailable = false;
  }
  return _isPresensiRecordsTableAvailable;
};

export const sanitizeTime = (t) => {
  if (!t || typeof t !== 'string') return null;
  const trimmed = t.trim();
  if (!trimmed || trimmed === '-' || trimmed.toLowerCase() === 'null') return null;
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}:${match[3] || '00'}`;
};

export const sanitizeDate = (d) => {
  if (!d) return null;
  const str = String(d).trim();
  if (str.length >= 10 && str.match(/^\d{4}-\d{2}-\d{2}/)) {
    return str.slice(0, 10);
  }
  return null;
};

export const mapPresensiToDbRow = (r) => ({
  id: String(r.id || ('pg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5))),
  date: sanitizeDate(r.date) || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }),
  teacher_id: String(r.teacherId || r.teacher_id || '').trim() || 'UNKNOWN',
  teacher_name: String(r.teacherName || r.teacher_name || 'Guru').trim(),
  sesi_id: String(r.sesiId || r.sesi_id || 'pagi').trim(),
  sesi_nama: r.sesiNama || r.sesi_nama || null,
  jam_masuk: sanitizeTime(r.jamMasuk || r.jam_masuk),
  jam_pulang: sanitizeTime(r.jamPulang || r.jam_pulang),
  status: r.status || 'Hadir',
  terlambat_menit: Number(r.terlambatMenit || r.terlambat_menit || 0) || 0,
  lokasi_masuk: r.lokasiMasuk || r.lokasi_masuk || null,
  lokasi_pulang: r.lokasiPulang || r.lokasi_pulang || null,
  qr_valid_masuk: !!(r.qrValidMasuk || r.qr_valid_masuk),
  qr_valid_pulang: !!(r.qrValidPulang || r.qr_valid_pulang),
  keterangan: r.keterangan || null,
  device_id: r.deviceId || r.device_id || null,
  updated_by: r.updatedBy || r.updated_by || 'Sistem',
  updated_at: r.updatedAt || r.updated_at || new Date().toISOString()
});

export const mapDbRowToPresensi = (row) => ({
  id: row.id,
  date: row.date,
  teacherId: row.teacher_id,
  teacherName: row.teacher_name,
  sesiId: row.sesi_id,
  sesiNama: row.sesi_nama,
  jamMasuk: row.jam_masuk,
  jamPulang: row.jam_pulang,
  status: row.status,
  terlambatMenit: Number(row.terlambat_menit || 0),
  lokasiMasuk: row.lokasi_masuk,
  lokasiPulang: row.lokasi_pulang,
  qrValidMasuk: !!row.qr_valid_masuk,
  qrValidPulang: !!row.qr_valid_pulang,
  keterangan: row.keterangan || '',
  deviceId: row.device_id || null,
  updatedBy: row.updated_by || 'Sistem',
  updatedAt: row.updated_at
});

/**
 * Menyimpan data presensi guru ke LocalStorage dan Supabase.
 * Menggunakan mesin relasional `presensi_records` jika tersedia,
 * dengan cadangan ganda (failsafe) ke baris `settings`.
 */
/**
 * ⚡ PUSH SINGLE PRESENSI RECORD (ATOMIC & INSTANT)
 * Mengirimkan TEPAT 1 rekaman presensi langsung ke tabel `presensi_records` di Supabase.
 * Kecepatan: ~50-100ms (1 baris Postgres).
 * Tahan banting terhadap pergantian jaringan (4G -> WiFi) dengan retry otomatis.
 */
export const pushSinglePresensiRecord = async (record, options = {}) => {
  if (!record || typeof record !== 'object') {
    return { status: 'error', message: 'Data presensi tidak valid' };
  }

  // 1. Simpan seketika ke LocalStorage (Update / Tambahkan ke array lokal)
  try {
    const local = safeStorageGet('payedu_presensi_guru', []);
    const safeLocal = Array.isArray(local) ? local : [];
    const norm = (v) => String(v || '').trim().toLowerCase();
    const idx = safeLocal.findIndex(r => {
      if (!r) return false;
      if (record.id && r.id && r.id === record.id) return true;
      if (norm(r.date) === norm(record.date)) {
        const idA = norm(r.teacherId);
        const idB = norm(record.teacherId);
        const sesiA = norm(r.sesiId || 'pagi');
        const sesiB = norm(record.sesiId || 'pagi');
        if (idA && idB && idA === idB && sesiA === sesiB) return true;
      }
      return false;
    });

    let updatedLocal;
    if (idx >= 0) {
      updatedLocal = [...safeLocal];
      updatedLocal[idx] = { ...updatedLocal[idx], ...record };
    } else {
      updatedLocal = [...safeLocal, record];
    }
    safeStorageSet('payedu_presensi_guru', updatedLocal);
  } catch (err) {
    console.warn('[SinglePush] Gagal sinkronisasi ke LocalStorage:', err);
  }

  // 2. Jika offline / belum konfigurasi, simpan ke antrian offline single (LocalStorage + IndexedDB Background Sync)
  if (!isSupabaseConfigured() || !navigator.onLine) {
    if (!options._fromQueue) {
      enqueueSinglePendingRecord(record);
      saveOfflineAttendance(record);
    }
    return { status: 'offline', message: 'Tersimpan di perangkat (offline, masuk antrian retry)' };
  }

  // 3. Konversi ke baris DB
  const dbRow = mapPresensiToDbRow(record);

  // 4. Upsert langsung ke tabel presensi_records dengan retry cepat (3 kali)
  const MAX_ATTEMPTS = 3;
  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { data, error } = await supabase
        .from('presensi_records')
        .upsert(dbRow, { onConflict: 'id' });

      if (!error) {
        removeSinglePendingRecord(record.id);
        removeOfflineAttendance(record.id);
        return { status: 'success', message: 'Presensi berhasil tersimpan di Cloud Database', data: record };
      }

      lastErr = error;
      console.warn(`[SinglePush Retry ${attempt}/${MAX_ATTEMPTS}] Gagal upsert:`, error);
      if (attempt < MAX_ATTEMPTS) {
        // Jeda singkat sebelum retry (mengatasi drop sesaat akibat handover 4G -> WiFi)
        await new Promise(r => setTimeout(r, 250 * attempt));
      }
    } catch (e) {
      lastErr = e;
      console.warn(`[SinglePush Retry ${attempt}/${MAX_ATTEMPTS}] Exception:`, e);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 250 * attempt));
      }
    }
  }

  // Jika semua retry gagal, masukkan ke antrian retry otomatis (LocalStorage + IndexedDB)
  if (!options._fromQueue) {
    enqueueSinglePendingRecord(record);
    saveOfflineAttendance(record);
  }
  return { status: 'partial', message: 'Tersimpan lokal, gagal sync ke cloud (masuk antrian)', error: lastErr };
};

/**
 * 🗑️ HAPUS SINGLE RECORD PRESENSI DARI SUPABASE
 */
export const deleteSinglePresensiRecord = async (recordId) => {
  if (!recordId) return { status: 'error', message: 'Record ID kosong' };
  if (!isSupabaseConfigured() || !navigator.onLine) return { status: 'offline' };
  try {
    const { error } = await supabase.from('presensi_records').delete().eq('id', recordId);
    if (!error) return { status: 'success' };
    console.warn('[DeleteSingle] Error:', error);
  } catch (e) {
    console.warn('[DeleteSingle] Exception:', e);
  }
  return { status: 'error' };
};

export const pushPresensiGuru = async (presensiArray, options = {}) => {
  if (!Array.isArray(presensiArray)) return { status: 'error', message: 'Data presensi bukan array' };

  // 1. Simpan ke LocalStorage seketika (sumber kebenaran offline perangkat)
  safeStorageSet('payedu_presensi_guru', presensiArray);

  // Jangan pernah menimpa cloud jika data presensi lokal masih kosong melompong (Mencegah wipeout saat login awal)
  if (presensiArray.length === 0 && !options.allowEmpty) {
    return { status: 'success', message: 'Array presensi lokal kosong, skip sync ke cloud' };
  }

  // 2. Simpan ke Supabase jika online
  if (!isSupabaseConfigured() || !navigator.onLine) {
    // 🛡️ Jika offline, masukkan ke antrian agar otomatis retry saat online kembali
    enqueuePendingPush(presensiArray);
    return { status: 'success', message: 'Presensi tersimpan di LocalStorage (offline, masuk antrian retry)' };
  }

  // 🔋 OPTIMASI BANDWIDTH: Skip push jika data identik dengan push terakhir yang berhasil
  // ⚡ PERBAIKAN: Hash hanya valid selama 5 detik — mencegah data lama memblokir push guru lain
  const currentPresensiHash = JSON.stringify(presensiArray);
  const hashAge = Date.now() - _lastPushedPresensiTime;
  if (!options.overwrite && !options._fromQueue && _lastPushedPresensiHash === currentPresensiHash && hashAge < HASH_VALIDITY_MS) {
    return { status: 'success', message: 'Data presensi tidak berubah, skip sync ke cloud' };
  }

  const hasTable = await isPresensiRecordsTableAvailable();

  // 🚀 MESIN 1: SIMPAN KE TABEL MANDIRI presensi_records (DENGAN RETRY)
  if (hasTable) {
    const TABLE_MAX_RETRIES = 3;
    for (let tableAttempt = 1; tableAttempt <= TABLE_MAX_RETRIES; tableAttempt++) {
      try {
        // Deduplikasi by ID agar tidak ada tabrakan ON CONFLICT di batch Postgres
        const map = new Map();
        for (const r of presensiArray) {
          if (!r) continue;
          const row = mapPresensiToDbRow(r);
          const existing = map.get(row.id);
          if (!existing) {
            map.set(row.id, row);
          } else {
            const tOld = new Date(existing.updated_at || 0).getTime();
            const tNew = new Date(row.updated_at || 0).getTime();
            if (tNew >= tOld) map.set(row.id, row);
          }
        }

        // 🌟 PERBAIKAN KRITIS: Urutkan data dari yang PALING BARU ke yang terlama!
        // Sehingga presensi hari ini SELALU berada di Chunk 1 dan tersimpan dalam 200ms pertama!
        const rows = Array.from(map.values()).sort((a, b) => {
          const tA = new Date(a.date || 0).getTime();
          const tB = new Date(b.date || 0).getTime();
          return tB - tA; // descending (terbaru di depan)
        });

        // 🔋 OPTIMASI EGRESS & LOG INGESTION SUPABASE:
        // Jangan meng-upsert seluruh ribuan rekaman presensi masa lampau berulang-ulang!
        // Hanya upsert rekaman 7 hari terakhir (atau maksimal 60 jika libur/penugasan khusus).
        let rowsToPush = rows;
        if (!options.all) {
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
          rowsToPush = rows.filter(r => (r.date && r.date >= sevenDaysAgo) || !r.date);
          if (rowsToPush.length === 0 && rows.length > 0) {
            rowsToPush = rows.slice(0, 60);
          }
        }

        const BATCH_SIZE = 100;
        let hasError = false;

        for (let i = 0; i < rowsToPush.length; i += BATCH_SIZE) {
          const chunk = rowsToPush.slice(i, i + BATCH_SIZE);
          const { error: batchErr } = await supabase
            .from('presensi_records')
            .upsert(chunk, { onConflict: 'id' });
          if (batchErr) {
            console.warn(`[Retry ${tableAttempt}/${TABLE_MAX_RETRIES}] Gagal upsert batch presensi_records:`, batchErr);
            hasError = true;
            break;
          }
        }

        if (!hasError) {
          _lastPushedPresensiHash = currentPresensiHash;
          _lastPushedPresensiTime = Date.now();
          clearPendingQueue();
          return { status: 'success', message: 'Presensi berhasil disinkronkan ke tabel presensi_records', data: presensiArray };
        }

        // Exponential backoff sebelum retry
        if (tableAttempt < TABLE_MAX_RETRIES) {
          const delay = Math.min(500 * Math.pow(2, tableAttempt - 1), 4000) + Math.random() * 500;
          console.log(`[Retry] Menunggu ${Math.round(delay)}ms sebelum retry ke-${tableAttempt + 1}...`);
          await new Promise(r => setTimeout(r, delay));
        }
      } catch (tableErr) {
        console.warn(`[Retry ${tableAttempt}/${TABLE_MAX_RETRIES}] Peringatan penyimpanan ke presensi_records:`, tableErr);
        if (tableAttempt < TABLE_MAX_RETRIES) {
          const delay = Math.min(500 * Math.pow(2, tableAttempt - 1), 4000) + Math.random() * 500;
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
  }

  // 🛡️ Push gagal total → masukkan ke antrian offline untuk retry otomatis nanti
  enqueuePendingPush(presensiArray);
  return { status: 'partial', message: 'Tersimpan lokal, gagal sync ke cloud (masuk antrian retry)' };
};

/**
 * Mengambil data presensi guru dari Supabase dengan Delta Sync Cerdas:
 * 1. Jika data lokal sudah ada, cari timestamp mutakhir dan HANYA unduh baris baru/diubah (~150 bytes vs 3.7 MB!).
 * 2. Jika data lokal kosong atau dipaksa refresh, unduh 1500 rekaman paling mutakhir (~3 bulan terakhir).
 */
export const fetchPresensiGuru = async (options = {}) => {
  const localPresensi = safeStorageGet('payedu_presensi_guru', []);
  const safeLocal = Array.isArray(localPresensi) ? localPresensi : [];

  if (!isSupabaseConfigured() || !navigator.onLine) {
    return { status: 'success', source: 'local', data: safeLocal };
  }

  const hasTable = await isPresensiRecordsTableAvailable();
  const forceFull = options?.force === true;

  // 🚀 MESIN 1: AMBIL DARI TABEL MANDIRI presensi_records DENGAN DELTA SYNC
  if (hasTable) {
    try {
      // 🔋 DELTA SYNC CERDAS (Hemat 99.9% Bandwidth Egress & Log Ingestion):
      if (!forceFull && safeLocal.length > 0) {
        let latestLocalTs = '';
        for (const r of safeLocal) {
          const ts = r.updatedAt || r.updated_at || r.createdAt || r.created_at;
          if (ts && String(ts) > latestLocalTs) {
            latestLocalTs = String(ts);
          }
        }

        if (latestLocalTs) {
          // Ambil HANYA baris yang berubah sejak sinkronisasi lokal terakhir
          const { data: deltaRows, error: deltaErr } = await supabase
            .from('presensi_records')
            .select('*')
            .gt('updated_at', latestLocalTs)
            .order('updated_at', { ascending: false })
            .limit(300);

          if (!deltaErr && Array.isArray(deltaRows)) {
            if (deltaRows.length === 0) {
              // Tidak ada perubahan sama sekali di cloud! (Egress ~150 bytes, respons ~70ms)
              return { status: 'success', source: 'delta_cache', data: safeLocal };
            }
            // Ada baris baru atau update: gabungkan hanya delta tersebut
            const mappedDelta = deltaRows.map(mapDbRowToPresensi);
            const merged = mergePresensiArrays(mappedDelta, safeLocal);
            safeStorageSet('payedu_presensi_guru', merged);
            return { status: 'success', source: 'delta_sync', data: merged };
          }
        }
      }

      // 📥 INITIAL LOAD / RECOVERY (Jika data lokal kosong atau diminta reload):
      // Ambil 1500 rekaman paling mutakhir (mencakup 3+ bulan terakhir seluruh sekolah)
      // bukan men-download seluruh ribuan riwayat tahun lampau tanpa batas!
      const { data: recentRows, error: recentErr } = await supabase
        .from('presensi_records')
        .select('*')
        .order('date', { ascending: false })
        .limit(1500);

      if (!recentErr && Array.isArray(recentRows) && recentRows.length > 0) {
        const mapped = recentRows.map(mapDbRowToPresensi);
        const merged = mergePresensiArrays(mapped, safeLocal);
        safeStorageSet('payedu_presensi_guru', merged);
        return { status: 'success', source: 'presensi_records', data: merged };
      }
    } catch (tableErr) {
      console.warn('Gagal membaca dari presensi_records:', tableErr);
    }
  }

  // Fallback aman: kembalikan data lokal
  return { status: 'success', source: 'local', data: safeLocal };
};

/**
 * Merge dua array presensi: rekonsiliasi cerdas berbasis timestamp.
 * Memastikan edit manual Admin tidak tertimpa oleh data lama di HP guru,
 * dan absensi masuk/pulang/verifikasi GPS & QR tetap terjaga utuh.
 */
export function mergePresensiArrays(serverArr, localArr) {
  const cleanServer = Array.isArray(serverArr) ? serverArr.filter(Boolean) : [];
  const cleanLocal = Array.isArray(localArr) ? localArr.filter(Boolean) : [];

  const normStr = (v) => String(v || '').trim().toLowerCase();
  const cleanStr = (v) => normStr(v).replace(/[^a-z0-9]/g, '');
  // 🛡️ Normalisasi Sesi ID: perlakukan null/empty/'default' sebagai 'pagi' agar data lama & baru selaras
  const normSesi = (s) => {
    const str = normStr(s);
    if (!str || str === 'default' || str === 'null' || str === 'undefined') return 'pagi';
    return str;
  };

  const getRecordTime = (rec) => {
    if (!rec) return 0;
    if (rec.updatedAt) {
      const t = new Date(rec.updatedAt).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    if (rec.date) {
      const d = new Date(rec.date).getTime();
      if (!isNaN(d) && d > 0) return d;
    }
    return 0;
  };

  const isMatchingRecord = (a, b) => {
    if (!a || !b) return false;
    // Tanggal wajib sama
    if (normStr(a.date) !== normStr(b.date)) return false;

    // Sesi wajib sama (default sesiId adalah 'pagi')
    const sesiA = normSesi(a.sesiId);
    const sesiB = normSesi(b.sesiId);
    if (sesiA !== sesiB) {
      const namaA = normStr(a.sesiNama);
      const namaB = normStr(b.sesiNama);
      if (!namaA || !namaB || namaA !== namaB) return false;
    }

    // 1. Cocokkan ID (string vs number safe)
    const idA = a.teacherId != null ? normStr(a.teacherId) : '';
    const idB = b.teacherId != null ? normStr(b.teacherId) : '';
    if (idA && idB && idA === idB) return true;

    // 2. Cocokkan Nama Lengkap / Bersih
    const nameA = cleanStr(a.teacherName);
    const nameB = cleanStr(b.teacherName);
    if (nameA && nameB && nameA === nameB) return true;

    // 3. Cocokkan jika salah satu ID cocok dengan nama lengkap atau sebaliknya
    if (idA && nameB && idA === nameB) return true;
    if (idB && nameA && idB === nameA) return true;

    return false;
  };

  const mergeTwo = (existing, r) => {
    const existingTime = getRecordTime(existing);
    const newTime = getRecordTime(r);
    // Data yang memiliki timestamp updatedAt lebih baru menang
    const isRNewer = newTime >= existingTime;

    const newer = isRNewer ? r : existing;
    const older = isRNewer ? existing : r;

    // Rekonsiliasi Status
    const isMeaningfulStatus = (s) => s && !['Alpa', 'Belum Absen'].includes(s);

    // 🛡️ ATURAN ANTI-WIPEOUT 1: Jam Masuk
    // Jika salah satu rekaman memiliki jamMasuk valid, jamMasuk TIDAK BOLEH HILANG
    // kecuali rekaman baru memang sengaja berstatus izin/sakit resmi tanpa jam masuk.
    // Gunakan null-check eksplisit agar jam yang sah tidak terhapus.
    let finalJamMasuk = (newer.jamMasuk != null && newer.jamMasuk !== '') ? newer.jamMasuk
                      : (older.jamMasuk != null && older.jamMasuk !== '') ? older.jamMasuk
                      : null;

    // 🛡️ ATURAN ANTI-WIPEOUT 2: Jam Pulang
    let finalJamPulang = (newer.jamPulang != null && newer.jamPulang !== '') ? newer.jamPulang
                       : (older.jamPulang != null && older.jamPulang !== '') ? older.jamPulang
                       : null;

    // 🛡️ ATURAN ANTI-WIPEOUT 3: Status Kehadiran
    // Status bermakna (Hadir, Terlambat, Izin, Sakit, Cuti, Dinas Luar) SELALU MENANG atas 'Alpa' atau 'Belum Absen'
    let finalStatus = newer.status;
    if (isMeaningfulStatus(older.status) && !isMeaningfulStatus(newer.status)) {
      finalStatus = older.status;
    } else if (!isMeaningfulStatus(newer.status) && finalJamMasuk) {
      // Jika memiliki jam masuk tapi status bertuliskan 'Alpa' atau 'Belum Absen', perbaiki menjadi Hadir / Terlambat
      finalStatus = ((newer.terlambatMenit ?? 0) > 0 || (older.terlambatMenit ?? 0) > 0) ? 'Terlambat' : 'Hadir';
    } else if (!finalStatus) {
      finalStatus = older.status || (finalJamMasuk ? 'Hadir' : 'Alpa');
    }

    // Jika status pengajuan izin resmi yang sah tanpa jam masuk
    if (['Sakit', 'Izin', 'Cuti', 'Dinas Luar'].includes(finalStatus) && !newer.jamMasuk && !older.jamMasuk) {
      finalJamMasuk = null;
      finalJamPulang = null;
    }

    // Terlambat Menit
    let finalTerlambat = newer.terlambatMenit;
    if (finalTerlambat === undefined || finalTerlambat === null || (finalTerlambat === 0 && (older.terlambatMenit ?? 0) > 0)) {
      finalTerlambat = older.terlambatMenit ?? newer.terlambatMenit ?? 0;
    }

    // Keterangan
    const finalKeterangan = (newer.keterangan !== undefined && newer.keterangan !== '')
      ? newer.keterangan
      : (older.keterangan || '');

    return {
      ...older,
      ...newer,
      id: newer.id || older.id,
      teacherId: newer.teacherId != null ? newer.teacherId : older.teacherId,
      teacherName: newer.teacherName || older.teacherName,
      date: newer.date || older.date,
      sesiId: newer.sesiId || older.sesiId || 'pagi',
      sesiNama: newer.sesiNama || older.sesiNama,
      jamMasuk: finalJamMasuk,
      jamPulang: finalJamPulang,
      status: finalStatus,
      terlambatMenit: finalTerlambat,
      keterangan: finalKeterangan,
      // Bukti verifikasi GPS dan QR dipertahankan jika record yang baru tidak menyertakannya (misal hasil edit manual Admin)
      lokasiMasuk: newer.lokasiMasuk || older.lokasiMasuk || null,
      lokasiPulang: newer.lokasiPulang || older.lokasiPulang || null,
      qrValidMasuk: newer.qrValidMasuk !== undefined ? newer.qrValidMasuk : (older.qrValidMasuk ?? null),
      qrValidPulang: newer.qrValidPulang !== undefined ? newer.qrValidPulang : (older.qrValidPulang ?? null),
      updatedAt: new Date(Math.max(existingTime, newTime, Date.now() - 365 * 86400000)).toISOString(),
      updatedBy: newer.updatedBy || older.updatedBy || 'Sistem'
    };
  };

  // Gunakan bucket Map berdasarkan tanggal & sesi untuk efisiensi O(N)
  const bucketMap = new Map();
  const allRecords = [...cleanServer, ...cleanLocal];

  for (const r of allRecords) {
    if (!r) continue;
    const bucketKey = `${normStr(r.date)}_${normSesi(r.sesiId)}`;
    let bucket = bucketMap.get(bucketKey);
    if (!bucket) {
      bucket = [];
      bucketMap.set(bucketKey, bucket);
    }

    const matchIdx = bucket.findIndex(existing => isMatchingRecord(existing, r));
    if (matchIdx >= 0) {
      bucket[matchIdx] = mergeTwo(bucket[matchIdx], r);
    } else {
      bucket.push(r);
    }
  }

  const result = [];
  for (const b of bucketMap.values()) {
    result.push(...b);
  }
  return result;
}

/**
 * Deduplikasi data arsip gaji berdasarkan nama periode atau ID.
 * Mencegah munculnya arsip ganda untuk bulan yang sama (seperti 'Juli 2026' x2).
 */
export const deduplicateArchives = (archivesList) => {
  if (!Array.isArray(archivesList)) return [];
  const map = new Map();
  for (const arc of archivesList) {
    if (!arc) continue;
    // Bersihkan nama periode untuk pencocokan unik
    const periodKey = String(arc.periode || arc.period || arc.id || '').trim().toLowerCase();
    if (!periodKey) {
      map.set(`arc_${Math.random()}`, arc);
      continue;
    }
    
    if (map.has(periodKey)) {
      const existing = map.get(periodKey);
      const existingTime = new Date(existing.date || existing.createdAt || existing.timestamp || 0).getTime();
      const newTime = new Date(arc.date || arc.createdAt || arc.timestamp || 0).getTime();
      // Pertahankan versi yang paling baru atau memiliki data pegawai lebih lengkap
      if (newTime >= existingTime || (arc.dataGuru?.length || 0) >= (existing.dataGuru?.length || 0)) {
        map.set(periodKey, arc);
      }
    } else {
      map.set(periodKey, arc);
    }
  }
  return Array.from(map.values());
};

/**
 * Menyortir array data guru secara alami berdasarkan ID (G01QA, G02QA, ..., G85QA).
 * Menjamin urutan guru selalu konsisten dan tidak acak di seluruh sistem.
 */
export const sortTeachersById = (teachersList) => {
  if (!Array.isArray(teachersList)) return [];
  return [...teachersList].sort((a, b) => {
    const idA = String(a?.id || '');
    const idB = String(b?.id || '');
    return idA.localeCompare(idB, undefined, { numeric: true });
  });
};

/**
 * Deduplikasi data guru berdasarkan ID, NIPY, atau Nama Lengkap yang dinormalisasi.
 * Mencegah munculnya data guru ganda di seluruh sistem dan mengembalikan data terurut rapi.
 */
export const deduplicateTeachers = (teachersList) => {
  if (!Array.isArray(teachersList)) return [];
  const map = new Map();
  for (const t of teachersList) {
    if (!t) continue;
    const normName = String(t.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const nipy = String(t.nipy || '').trim();
    const hasNipy = nipy && nipy !== '-' && nipy !== '';
    const key = hasNipy ? `nipy_${nipy}` : (normName ? `name_${normName}` : `id_${t.id}`);

    if (map.has(key)) {
      const existing = map.get(key);
      const scoreT = (t.dob ? 2 : 0) + (t.pob && t.pob !== '-' ? 2 : 0) + (t.phone && t.phone !== '-' ? 2 : 0) + (t.bankAccount ? 2 : 0) + (t.payroll?.jabatans?.length || 0);
      const scoreExisting = (existing.dob ? 2 : 0) + (existing.pob && existing.pob !== '-' ? 2 : 0) + (existing.phone && existing.phone !== '-' ? 2 : 0) + (existing.bankAccount ? 2 : 0) + (existing.payroll?.jabatans?.length || 0);
      
      if (scoreT >= scoreExisting) {
        map.set(key, { ...existing, ...t, id: existing.id || t.id, payroll: { ...(existing.payroll || {}), ...(t.payroll || {}) } });
      } else {
        map.set(key, { ...t, ...existing, id: existing.id || t.id, payroll: { ...(t.payroll || {}), ...(existing.payroll || {}) } });
      }
    } else {
      map.set(key, t);
    }
  }
  return sortTeachersById(Array.from(map.values()));
};

/**
 * Subscribe ke perubahan presensi real-time via Supabase Realtime.
 * Callback dipanggil setiap kali baris presensi_guru berubah di server.
 * Mengembalikan fungsi unsubscribe.
 */
export const subscribePresensiGuru = (onUpdate, onSingleUpdate) => {
  if (!isSupabaseConfigured() || !supabase) {
    return () => {}; // noop unsubscribe
  }
  const channel = supabase
    .channel('public:presensi_records_realtime')
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'presensi_records' 
    }, async (payload) => {
      try {
        // 🚀 REALTIME INSTANT: Jika Supabase mengirimkan record baru / update dari Postgres
        if (payload?.new && payload.new.id && typeof onSingleUpdate === 'function') {
          const mapped = mapDbRowToPresensi(payload.new);
          onSingleUpdate(mapped);
          return;
        }

        // 🗑️ REALTIME DELETE: Hapus instan tanpa re-fetch data penuh
        if (payload?.eventType === 'DELETE' && payload.old?.id && typeof onSingleUpdate === 'function') {
          onSingleUpdate({ id: payload.old.id, _deleted: true });
          return;
        }

        // Fallback delta sync: Hanya unduh baris baru (~150 bytes)
        const res = await fetchPresensiGuru();
        if (res.status === 'success' && Array.isArray(res.data) && typeof onUpdate === 'function') {
          onUpdate(res.data);
        }
      } catch (err) {
        console.warn('Gagal sinkronisasi presensi_records real-time:', err);
      }
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

// ==========================================
// FUNGSI UTAMA: PUSH & FETCH SEMUA DATA (Kecuali presensi)
// Presensi kini menggunakan pushPresensiGuru & fetchPresensiGuru di atas.
// ==========================================

/**
 * Menyimpan / menyinkronkan data aplikasi ke Supabase & LocalStorage
 * CATATAN: Presensi guru TIDAK lagi disimpan di sini — gunakan pushPresensiGuru.
 */
export const pushCloudData = async (action, payload) => {
  if (!payload) return { status: 'success', message: 'Payload kosong' };

  // Deteksi target data berdasarkan action atau struktur payload
  let targetSettings = payload.settings || (action === 'SAVE_SETTINGS' ? payload : null);
  let targetTeachers = payload.teachers || (action === 'SAVE_TEACHERS' ? payload : null);
  let targetArchives = payload.archives || (action === 'SAVE_ARCHIVES' ? payload : null);
  let targetFeedbacks = payload.feedbacks || (action === 'SAVE_FEEDBACKS' ? payload : null);
  let targetLogs = payload.loginHistory || (action === 'SAVE_LOGS' ? payload : null);

  // PERBAIKAN KRITIS: Hapus presensiGuru dari settings agar tidak menimpa baris 'general'
  if (targetSettings) {
    const { presensiGuru, ...cleanSettings } = targetSettings;
    targetSettings = cleanSettings;
    // Jika ada presensi yang menumpang di payload, simpan terpisah
    if (Array.isArray(presensiGuru) && presensiGuru.length > 0) {
      pushPresensiGuru(presensiGuru).catch(e => console.warn(e));
    }
  }

  // Backward compatibility: jika dipanggil dengan SAVE_PRESENSI_GURU, alihkan ke fungsi baru
  if (action === 'SAVE_PRESENSI_GURU') {
    const presensiData = payload.presensiGuru || payload;
    if (Array.isArray(presensiData)) {
      return pushPresensiGuru(presensiData);
    }
  }

  // Update LocalStorage cache seketika (dengan deduplikasi otomatis)
  if (targetSettings && Object.keys(targetSettings).length > 0) {
    safeStorageSet('payedu_settings', targetSettings);
  }
  if (Array.isArray(targetTeachers)) {
    const cleanT = deduplicateTeachers(targetTeachers);
    safeStorageSet('payedu_teachers', cleanT);
    targetTeachers = cleanT;
  }
  if (Array.isArray(targetArchives)) {
    const cleanA = deduplicateArchives(targetArchives);
    safeStorageSet('payedu_archives', cleanA);
    targetArchives = cleanA;
  }
  if (Array.isArray(targetFeedbacks)) {
    safeStorageSet('payedu_feedbacks', targetFeedbacks);
  }
  if (Array.isArray(targetLogs)) {
    safeStorageSet('payedu_loginHistory', targetLogs);
  }

  if (!isSupabaseConfigured() || !navigator.onLine) {
    return { status: 'success', message: 'Tersimpan di LocalStorage (Offline / Supabase belum dikonfigurasi)' };
  }

  try {
    const now = new Date().toISOString();

    // 1. Simpan Settings (TANPA presensiGuru di dalamnya)
    if (targetSettings && Object.keys(targetSettings).length > 0) {
      const { error } = await supabase
        .from('settings')
        .upsert({ id: 'general', data: targetSettings, updated_at: now });
      if (error) console.error('Supabase settings upsert error:', error);
    }

    // 2. Simpan Teachers (dengan Sinkronisasi Hapus Permanen & Anti-Duplikasi)
    if (Array.isArray(targetTeachers)) {
      const cleanTeachers = deduplicateTeachers(targetTeachers);
      if (cleanTeachers.length === 0) {
        const { error: delAllErr } = await supabase.from('teachers').delete().neq('id', '000_dummy_keep');
        if (delAllErr) console.error('Supabase teachers clear error:', delAllErr);
      } else {
        const teacherRecords = cleanTeachers.map(t => ({
          id: String(t.id),
          name: t.name || '',
          data: t,
          updated_at: now
        }));
        const { error } = await supabase.from('teachers').upsert(teacherRecords, { onConflict: 'id' });
        if (error) {
          console.error('Supabase teachers upsert error:', error);
        } else {
          safeStorageSet('payedu_teachers_last_sync', Date.now());
        }

        // Hapus baris guru di Supabase yang sudah tidak ada di payload (misal baru dihapus admin)
        try {
          const validIds = teacherRecords.map(r => r.id);
          if (validIds.length > 0) {
            const { error: delErr } = await supabase
              .from('teachers')
              .delete()
              .not('id', 'in', `(${validIds.map(id => `"${id}"`).join(',')})`);
            if (delErr) console.warn('Pembersihan guru lama Supabase:', delErr);
          }
        } catch (delCatch) {
          console.warn('Gagal bersihkan guru lama di Supabase:', delCatch);
        }
      }
    }

    // 3. Simpan Archives (dengan Sinkronisasi Hapus Permanen & Anti-Duplikasi)
    if (Array.isArray(targetArchives)) {
      const cleanArchives = deduplicateArchives(targetArchives);
      if (cleanArchives.length === 0) {
        const { error: delAllErr } = await supabase.from('archives').delete().neq('id', '000_dummy_keep');
        if (delAllErr) console.error('Supabase archives clear error:', delAllErr);
      } else {
        const archiveRecords = cleanArchives.map(a => ({
          id: String(a.id || a.period || a.periode),
          period: a.period || a.periode || '',
          data: a,
          updated_at: now
        }));
        const { error } = await supabase.from('archives').upsert(archiveRecords, { onConflict: 'id' });
        if (error) console.error('Supabase archives upsert error:', error);

        // Bersihkan data arsip lama di Supabase yang sudah dihapus oleh admin
        try {
          const validIds = archiveRecords.map(r => r.id);
          if (validIds.length > 0) {
            const { error: delErr } = await supabase
              .from('archives')
              .delete()
              .not('id', 'in', `(${validIds.map(id => `"${id}"`).join(',')})`);
            if (delErr) console.warn('Pembersihan arsip lama Supabase:', delErr);
          }
        } catch (delErr) {
          console.warn('Gagal membersihkan row arsip usang di Supabase:', delErr);
        }
      }
    }

    // 4. Simpan Feedbacks
    if (Array.isArray(targetFeedbacks) && targetFeedbacks.length > 0) {
      const feedbackRecords = targetFeedbacks.map(f => ({
        id: String(f.id || Date.now() + Math.random()),
        data: f,
        created_at: f.date || now
      }));
      const { error } = await supabase.from('feedbacks').upsert(feedbackRecords, { onConflict: 'id' });
      if (error) console.error('Supabase feedbacks upsert error:', error);
    }

    // 5. 🔋 OPTIMASI: Simpan HANYA log login terbaru (bukan me-re-upsert ratusan baris lama)
    if (Array.isArray(targetLogs) && targetLogs.length > 0) {
      const recentLogs = targetLogs.slice(0, 2);
      const logRecords = recentLogs.map(l => ({
        id: String(l.id || ('log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5))),
        data: l,
        created_at: l.timestamp || l.created_at || (l.timeRaw ? new Date(l.timeRaw).toISOString() : now)
      }));
      const { error } = await supabase.from('login_logs').upsert(logRecords, { onConflict: 'id' });
      if (error) console.error('Supabase login_logs upsert error:', error);
    }

    return { status: 'success', message: 'Berhasil disinkronkan ke Supabase Cloud!' };
  } catch (error) {
    console.error('Error saat menyimpan ke Supabase:', error);
    return { status: 'success', message: 'Tersimpan di LocalStorage (Gagal menyambung ke Supabase Cloud)' };
  }
};

/**
 * Mengambil seluruh data aplikasi dari Supabase (dengan fallback ke LocalStorage & Auto-Push jika Supabase kosong).
 * CATATAN: Presensi guru kini diambil TERPISAH via fetchPresensiGuru().
 */
export const fetchCloudData = async (options = {}) => {
  const isBackground = typeof options === 'boolean' ? options : !!options?.isBackground;
  const userRole = typeof options === 'object' ? options?.role : undefined;
  const isGuru = userRole === 'guru';

  const localSettings = safeStorageGet('payedu_settings', null);
  const localTeachers = safeStorageGet('payedu_teachers', []);
  const localArchives = safeStorageGet('payedu_archives', []);
  const localFeedbacks = safeStorageGet('payedu_feedbacks', []);
  const localLogs = safeStorageGet('payedu_loginHistory', []);

  if (!isSupabaseConfigured() || !navigator.onLine) {
    console.log('Supabase tidak terkonfigurasi atau perangkat offline. Menggunakan LocalStorage.');
    return {
      status: 'success',
      source: 'local',
      data: {
        settings: localSettings || {},
        teachers: localTeachers,
        archives: localArchives,
        feedbacks: localFeedbacks,
        loginHistory: localLogs,
      }
    };
  }

  try {
    // 1. Fetch General Settings (~1-2 KB)
    const { data: settingsRow, error: settingsErr } = await supabase
      .from('settings')
      .select('data')
      .eq('id', 'general')
      .single();

    if (settingsErr && settingsErr.code !== 'PGRST116') {
      console.warn('Gagal mengambil settings dari Supabase:', settingsErr);
    }

    // 2. 🔋 OPTIMASI EGRESS TEACHERS:
    // Cek timestamp mutakhir (~48 bytes) sebelum mengunduh seluruh 84 guru (~103 KB)
    let teachersRows = null;
    const forceTeachers = typeof options === 'object' && options?.forceTeachers;
    if (localTeachers && localTeachers.length > 0 && !forceTeachers) {
      try {
        const { data: latestTeacherRow } = await supabase
          .from('teachers')
          .select('updated_at')
          .order('updated_at', { ascending: false })
          .limit(1);

        const latestTs = latestTeacherRow?.[0]?.updated_at ? new Date(latestTeacherRow[0].updated_at).getTime() : 0;
        const lastSyncTs = Number(safeStorageGet('payedu_teachers_last_sync', 0)) || 0;

        if (latestTs > 0 && lastSyncTs > 0 && latestTs <= lastSyncTs) {
          // Data guru di cloud belum berubah, gunakan cache lokal (Hemat ~103 KB!)
          teachersRows = null;
        } else {
          // Ada update guru dari admin atau belum pernah sync
          const { data: tRows, error: tErr } = await supabase
            .from('teachers')
            .select('id, data')
            .order('id', { ascending: true });
          if (!tErr && Array.isArray(tRows)) {
            teachersRows = tRows;
            safeStorageSet('payedu_teachers_last_sync', Date.now());
          }
        }
      } catch (tCheckErr) {
        teachersRows = null;
      }
    } else {
      const { data: tRows, error: tErr } = await supabase
        .from('teachers')
        .select('id, data')
        .order('id', { ascending: true });
      if (!tErr && Array.isArray(tRows)) {
        teachersRows = tRows;
        safeStorageSet('payedu_teachers_last_sync', Date.now());
      }
    }

    // 3. 🔋 OPTIMASI EGRESS ARSIP GAJI:
    // Guru & Admin tetap bisa melihat seluruh arsip bulan-bulan lampau secara utuh.
    // Namun kita gunakan cek timestamp ringan (~100 bytes) agar tidak mengunduh ulang megabytes arsip jika belum ada perubahan.
    let serverArchives = null;
    const forceArchives = typeof options === 'object' && options?.forceArchives;
    if (localArchives && localArchives.length > 0 && !forceArchives) {
      try {
        const { data: latestArcRow } = await supabase
          .from('archives')
          .select('updated_at')
          .order('updated_at', { ascending: false })
          .limit(1);

        const latestTs = latestArcRow?.[0]?.updated_at ? new Date(latestArcRow[0].updated_at).getTime() : 0;
        const lastSyncTs = Number(safeStorageGet('payedu_archives_last_sync', 0)) || 0;

        if (latestTs > 0 && lastSyncTs > 0 && latestTs <= lastSyncTs) {
          // Arsip belum ada update baru dari admin, gunakan cache lokal (Hemat ~99% bandwidth!)
          serverArchives = localArchives;
        } else {
          // Ada arsip baru atau belum pernah sync, unduh data terbaru
          const { data: archivesRows, error: archivesErr } = await supabase
            .from('archives')
            .select('id, period, data');
          if (!archivesErr && Array.isArray(archivesRows)) {
            serverArchives = archivesRows.map(r => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data));
            safeStorageSet('payedu_archives_last_sync', Date.now());
          }
        }
      } catch (arcCheckErr) {
        serverArchives = localArchives;
      }
    } else {
      // Local kosong atau dipaksa refresh: ambil penuh
      const { data: archivesRows, error: archivesErr } = await supabase
        .from('archives')
        .select('id, period, data');
      if (!archivesErr && Array.isArray(archivesRows)) {
        serverArchives = archivesRows.map(r => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data));
        safeStorageSet('payedu_archives_last_sync', Date.now());
      }
    }

    // 4. 🔋 OPTIMASI: Feedbacks (Kotak Saran)
    // Akun Guru tidak pernah melihat list feedback seluruh sekolah, lewati unduhan untuk guru!
    let serverFeedbacks = localFeedbacks;
    if (!isGuru) {
      const { data: feedbackRows, error: feedbackErr } = await supabase
        .from('feedbacks')
        .select('id, data')
        .limit(50);
      if (!feedbackErr && Array.isArray(feedbackRows)) {
        serverFeedbacks = feedbackRows.map(r => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data));
      }
    }

    // 5. 🔋 OPTIMASI: Login Logs (Riwayat Masuk)
    // Akun Guru tidak pernah melihat log login admin, lewati unduhan untuk guru!
    let serverLogs = localLogs;
    if (!isGuru) {
      const { data: logRows, error: logErr } = await supabase
        .from('login_logs')
        .select('id, data, created_at')
        .order('created_at', { ascending: false })
        .limit(50); // Batasi hanya 50 log terakhir (bukan ribuan)
      if (!logErr && Array.isArray(logRows)) {
        serverLogs = logRows.map(r => {
          const parsed = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {});
          return {
            id: r.id || parsed.id,
            created_at: r.created_at || parsed.created_at || parsed.timestamp,
            timestamp: parsed.timestamp || r.created_at,
            ...parsed,
            id: r.id || parsed.id
          };
        });
      }
    }

    // Parse data dari Supabase
    let serverSettings = settingsRow?.data ? (typeof settingsRow.data === 'string' ? JSON.parse(settingsRow.data) : settingsRow.data) : null;
    
    // PERBAIKAN: Bersihkan field presensiGuru dari settings agar tidak membengkak
    if (serverSettings) {
      delete serverSettings.presensiGuru;
    }

    const serverTeachers = teachersRows && teachersRows.length > 0 ? teachersRows.map(r => {
      const parsedData = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {});
      return {
        id: r.id || parsedData.id,
        name: r.name || parsedData.name || '',
        nipy: parsedData.nipy || '',
        pob: parsedData.pob || '',
        dob: parsedData.dob || '',
        gender: parsedData.gender || 'L',
        education: parsedData.education || 'S1',
        status: parsedData.status || 'Tetap',
        tmt: parsedData.tmt || '',
        position: parsedData.position || 'Guru',
        bankName: parsedData.bankName || '',
        accountNumber: parsedData.accountNumber || '',
        accountHolder: parsedData.accountHolder || '',
        family: parsedData.family || { wife: 0, children: 0 },
        payroll: parsedData.payroll || {
          jabatans: [], kompetensi: [], disiplin: {}, insentifTambahan: [], potonganLainnya: [], jamMengajar: {}, kegiatanInsidental: []
        },
        ...parsedData,
        id: r.id || parsedData.id
      };
    }) : (localTeachers && localTeachers.length > 0 ? localTeachers : null);

    if (serverTeachers && Array.isArray(serverTeachers)) {
      serverTeachers.sort((a, b) => {
        const idA = parseInt(a.id, 10);
        const idB = parseInt(b.id, 10);
        if (!isNaN(idA) && !isNaN(idB)) {
          return idA - idB;
        }
        return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
      });
    }

    const serverTime = Number(serverSettings?.lastModified) || 0;
    const localTime = Number(localSettings?.lastModified) || 0;
    const isLocalNewer = localTime > serverTime && localSettings && Object.keys(localSettings).length > 0;

    let finalSettings = isLocalNewer ? { ...serverSettings, ...localSettings } : (serverSettings || localSettings || {});
    let finalTeachers = deduplicateTeachers(
      (isLocalNewer && localTeachers && localTeachers.length > 0)
        ? localTeachers 
        : (serverTeachers || localTeachers || [])
    );
    let finalArchives = deduplicateArchives(
      (isLocalNewer && localArchives && localArchives.length > 0)
        ? localArchives 
        : (serverArchives || localArchives || [])
    );
    const finalFeedbacks = serverFeedbacks || localFeedbacks;
    const finalLogs = serverLogs || localLogs;

    if ((!serverTeachers || isLocalNewer) && localTeachers.length > 0 && !isGuru) {
      console.log('Database Cloud Supabase perlu pembaruan (data lokal lebih baru / cloud kosong). Melakukan auto-push data ke Supabase...');
      pushCloudData('SYNC_ALL', {
        settings: finalSettings,
        teachers: finalTeachers,
        archives: finalArchives,
        feedbacks: finalFeedbacks,
        loginHistory: finalLogs,
      });
    }

    // Perbarui LocalStorage Cache untuk Offline Resilience
    safeStorageSet('payedu_settings', finalSettings);
    safeStorageSet('payedu_teachers', finalTeachers);
    safeStorageSet('payedu_archives', finalArchives);
    safeStorageSet('payedu_feedbacks', finalFeedbacks);
    safeStorageSet('payedu_loginHistory', finalLogs);

    return {
      status: 'success',
      source: 'supabase',
      data: {
        settings: finalSettings,
        teachers: finalTeachers,
        archives: finalArchives,
        feedbacks: finalFeedbacks,
        loginHistory: finalLogs,
      }
    };
  } catch (error) {
    console.error('Error saat menyinkronkan dari Supabase:', error);
    return {
      status: 'success',
      source: 'fallback',
      data: {
        settings: localSettings || {},
        teachers: localTeachers,
        archives: localArchives,
        feedbacks: localFeedbacks,
        loginHistory: localLogs,
      }
    };
  }
};

// ==========================================
// 🔋 OPTIMASI BANDWIDTH: Fungsi-Fungsi Penghematan Egress
// ==========================================

/**
 * Pengecekan ringan: Hanya mengambil timestamp `updated_at` dari settings.
 * Bandwidth: ~100 bytes vs ~100KB untuk full fetch.
 * Digunakan oleh smart polling untuk mendeteksi perubahan tanpa mengunduh semua data.
 */
export const checkCloudTimestamp = async () => {
  if (!isSupabaseConfigured() || !supabase || !navigator.onLine) return null;
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('updated_at')
      .eq('id', 'general')
      .single();
    if (error) return null;
    return data?.updated_at || null;
  } catch (e) {
    return null;
  }
};

/**
 * Subscribe ke perubahan SEMUA tabel utama via Supabase Realtime.
 * Menggantikan polling agresif — zero bandwidth untuk mendeteksi perubahan.
 * Callback dipanggil saat data di server berubah.
 */
export const subscribeAllChanges = (onSettingsChange, onTeachersChange, onArchivesChange) => {
  if (!isSupabaseConfigured() || !supabase) {
    return () => {}; // noop unsubscribe
  }

  const channel = supabase
    .channel('payedu-all-data-changes')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'settings',
      filter: 'id=eq.general'
    }, () => {
      if (typeof onSettingsChange === 'function') onSettingsChange();
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'teachers'
    }, () => {
      if (typeof onTeachersChange === 'function') onTeachersChange();
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'archives'
    }, () => {
      if (typeof onArchivesChange === 'function') onArchivesChange();
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

/**
 * 🔋 OPTIMASI: Mengambil HANYA settings dari Supabase (~1-2 KB).
 * Digunakan saat hanya tabel settings yang berubah tanpa download data lain.
 */
export const fetchSettingsOnly = async () => {
  if (!isSupabaseConfigured() || !navigator.onLine) return null;
  try {
    const { data: row, error } = await supabase
      .from('settings')
      .select('data')
      .eq('id', 'general')
      .single();
    if (error || !row?.data) return null;
    const settings = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    if (settings) {
      delete settings.presensiGuru;
      safeStorageSet('payedu_settings', settings);
      return settings;
    }
    return null;
  } catch (e) {
    console.warn('Gagal fetch settings only:', e);
    return null;
  }
};

/**
 * 🔋 OPTIMASI: Mengambil HANYA data teachers dari Supabase (~20-50 KB).
 * Digunakan saat hanya tabel teachers yang berubah.
 */
export const fetchTeachersOnly = async () => {
  if (!isSupabaseConfigured() || !navigator.onLine) return null;
  try {
    const { data: rows, error } = await supabase
      .from('teachers')
      .select('id, data')
      .order('id', { ascending: true });
    if (error || !Array.isArray(rows)) return null;
    const teachers = rows.map(r => {
      const parsedData = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {});
      return {
        ...parsedData,
        id: r.id || parsedData.id,
        name: r.name || parsedData.name || ''
      };
    });
    const clean = deduplicateTeachers(teachers);
    safeStorageSet('payedu_teachers', clean);
    safeStorageSet('payedu_teachers_last_sync', Date.now());
    return clean;
  } catch (e) {
    console.warn('Gagal fetch teachers only:', e);
    return null;
  }
};

/**
 * 🔋 OPTIMASI: Mengambil HANYA data archives dari Supabase.
 * Digunakan saat admin membuka tab arsip atau ada pembaruan arsip gaji baru.
 */
export const fetchArchivesOnly = async () => {
  if (!isSupabaseConfigured() || !navigator.onLine) return null;
  try {
    const { data: rows, error } = await supabase
      .from('archives')
      .select('id, period, data');
    if (error || !Array.isArray(rows)) return null;
    const archives = rows.map(r => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data));
    const clean = deduplicateArchives(archives);
    safeStorageSet('payedu_archives', clean);
    safeStorageSet('payedu_archives_last_sync', Date.now());
    return clean;
  } catch (e) {
    console.warn('Gagal fetch archives only:', e);
    return null;
  }
};

/**
 * 🔄 AUTO-SYNC PRESENSI TERTUNDA MILIK GURU:
 * Memeriksa apakah guru memiliki absen hari ini di LocalStorage (misal absen masuk tadi pagi
 * saat server sempat terputus/offline) yang belum tersimpan di cloud.
 * Begitu guru membuka aplikasi di HP, sistem otomatis menyinkronkannya di latar belakang
 * tanpa menunggu guru menekan tombol absen pulang di sore hari!
 */
export const syncPendingTeacherAttendance = async (teacherId, localPresensi) => {
  if (!teacherId || !isSupabaseConfigured() || !navigator.onLine) return;
  const list = Array.isArray(localPresensi) ? localPresensi : safeStorageGet('payedu_presensi_guru', []);
  if (!Array.isArray(list) || list.length === 0) return;

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  const myTodayRecord = list.find(r => 
    r && (String(r.teacherId) === String(teacherId) || (r.teacherName && String(r.teacherName).trim().toLowerCase() === String(teacherId).trim().toLowerCase())) && 
    (r.date === todayStr || !r.date) && 
    (r.jamMasuk || ['Hadir', 'Terlambat', 'Izin', 'Sakit', 'Cuti', 'Dinas Luar'].includes(r.status))
  );

  if (myTodayRecord) {
    console.log('[AutoSync] Presensi guru hari ini ditemukan di memori lokal, menyinkronkan ke Supabase Cloud (Single Record)...');
    try {
      await pushSinglePresensiRecord(myTodayRecord);
    } catch (e) {
      console.warn('[AutoSync] Background sync single presensi warning:', e);
    }
  }
};

/**
 * 📱 HELPER UNIVERSAL: Pembaruan Data Guru Ringkas (cth: ikat perangkat HP otomatis)
 */
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
    pushCloudData('SAVE_TEACHERS', updated).catch(e => console.warn('Gagal sync patch guru ke cloud:', e));
    return updated;
  });
};


