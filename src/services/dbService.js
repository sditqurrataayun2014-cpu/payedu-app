import { supabase, isSupabaseConfigured } from '../lib/supabase';

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
// PRESENSI GURU: PENYIMPANAN TERPISAH
// Menggunakan baris terpisah di tabel `settings` dengan id='presensi_guru'
// agar tidak bertabrakan dengan settings umum (id='general')
// ==========================================

// 🔋 OPTIMASI BANDWIDTH: Pelacak hash push terakhir agar tidak push data identik berulang-ulang
let _lastPushedPresensiHash = '';

/**
 * Menyimpan data presensi guru ke LocalStorage dan Supabase (baris terpisah).
 * Fungsi ini dipanggil langsung setiap kali ada perubahan presensi.
 * 🔋 OPTIMASI: Dilengkapi hash tracking untuk skip push jika data tidak berubah.
 */
export const pushPresensiGuru = async (presensiArray, options = {}) => {
  if (!Array.isArray(presensiArray)) return { status: 'error', message: 'Data presensi bukan array' };

  // 1. Simpan ke LocalStorage seketika (sumber kebenaran offline perangkat)
  safeStorageSet('payedu_presensi_guru', presensiArray);

  // Jangan pernah menimpa cloud jika data presensi lokal masih kosong melompong (Mencegah wipeout saat login awal)
  if (presensiArray.length === 0 && !options.allowEmpty) {
    return { status: 'success', message: 'Array presensi lokal kosong, skip sync ke cloud' };
  }

  // 2. Simpan ke Supabase sebagai baris terpisah di tabel settings
  if (!isSupabaseConfigured() || !navigator.onLine) {
    return { status: 'success', message: 'Presensi tersimpan di LocalStorage (offline)' };
  }

  // 🔋 OPTIMASI BANDWIDTH: Skip push jika data identik dengan push terakhir yang berhasil
  const currentPresensiHash = JSON.stringify(presensiArray);
  if (!options.overwrite && _lastPushedPresensiHash === currentPresensiHash) {
    return { status: 'success', message: 'Data presensi tidak berubah, skip sync ke cloud' };
  }

  // 🛡️ ANTI-RACE CONDITION RETRY LOOP (Hingga 3 kali dengan Exponential Jitter)
  // Menghindari tabrakan saat puluhan guru menekan tombol absen secara serempak di jam 7 pagi
  const maxRetries = options.overwrite ? 1 : 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      let dataToPush = presensiArray;
      // 🛡️ ANTI OVERWRITE / CONCURRENCY SAFE:
      // Ambil data presensi server terkini dan gabungkan (merge)
      if (!options.overwrite) {
        try {
          const { data: serverRow } = await supabase
            .from('settings')
            .select('data')
            .eq('id', 'presensi_guru')
            .single();

          if (serverRow?.data) {
            const serverData = typeof serverRow.data === 'string' ? JSON.parse(serverRow.data) : serverRow.data;
            if (Array.isArray(serverData) && serverData.length > 0) {
              dataToPush = mergePresensiArrays(serverData, presensiArray);
              safeStorageSet('payedu_presensi_guru', dataToPush);
            }
          }
        } catch (fetchErr) {
          console.warn(`Peringatan pembacaan data presensi cloud sebelum push (attempt ${attempt}):`, fetchErr);
        }
      }

      const now = new Date().toISOString();
      const { error } = await supabase
        .from('settings')
        .upsert({ 
          id: 'presensi_guru', 
          data: dataToPush, 
          updated_at: now 
        });

      if (!error) {
        // 🔋 Update hash setelah push berhasil
        _lastPushedPresensiHash = JSON.stringify(dataToPush);
        return { status: 'success', message: 'Presensi berhasil disinkronkan ke cloud', data: dataToPush };
      } else {
        lastError = error;
        if (attempt < maxRetries) {
          // Jitter delay acak 150-450ms untuk memecah tabrakan serentak
          await new Promise(r => setTimeout(r, 150 + Math.random() * 300));
        }
      }
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 150 + Math.random() * 300));
      }
    }
  }

  console.error('Supabase presensi_guru upsert error:', lastError);
  return { status: 'partial', message: 'Tersimpan lokal, gagal sync ke cloud' };
};

/**
 * Mengambil data presensi guru dari Supabase (baris terpisah) dengan fallback LocalStorage.
 */
export const fetchPresensiGuru = async () => {
  const localPresensi = safeStorageGet('payedu_presensi_guru', []);
  // Pastikan localPresensi benar-benar array
  const safeLocal = Array.isArray(localPresensi) ? localPresensi : [];

  if (!isSupabaseConfigured() || !navigator.onLine) {
    return { status: 'success', source: 'local', data: safeLocal };
  }

  try {
    const { data: row, error } = await supabase
      .from('settings')
      .select('data, updated_at')
      .eq('id', 'presensi_guru')
      .single();

    if (error && error.code !== 'PGRST116') {
      console.warn('Gagal mengambil presensi_guru dari Supabase:', error);
    }

    let serverPresensi = null;
    if (row?.data) {
      const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      if (Array.isArray(parsed)) {
        serverPresensi = parsed;
      }
    }

    // Jika server punya data, merge dengan lokal (prioritas server)
    if (serverPresensi !== null) {
      const merged = mergePresensiArrays(serverPresensi, safeLocal);
      safeStorageSet('payedu_presensi_guru', merged);
      return { status: 'success', source: 'supabase', data: merged };
    }

    // Server kosong — coba migrasi dari settings lama (field presensiGuru di general)
    try {
      const { data: generalRow } = await supabase
        .from('settings')
        .select('data')
        .eq('id', 'general')
        .single();
      if (generalRow?.data) {
        const generalData = typeof generalRow.data === 'string' ? JSON.parse(generalRow.data) : generalRow.data;
        if (Array.isArray(generalData?.presensiGuru) && generalData.presensiGuru.length > 0) {
          console.log('Migrasi presensi dari settings.general ke settings.presensi_guru...');
          const migrated = mergePresensiArrays(generalData.presensiGuru, safeLocal);
          await pushPresensiGuru(migrated);
          return { status: 'success', source: 'migrated', data: migrated };
        }
      }
    } catch (migErr) {
      console.warn('Migrasi presensi gagal (tidak fatal):', migErr);
    }

    // Server benar-benar kosong, push lokal ke server
    if (safeLocal.length > 0) {
      console.log('Presensi cloud kosong, auto-push data lokal...');
      pushPresensiGuru(safeLocal).catch(e => console.warn(e));
    }

    return { status: 'success', source: 'local', data: safeLocal };
  } catch (error) {
    console.error('Error saat fetch presensi dari Supabase:', error);
    return { status: 'success', source: 'fallback', data: safeLocal };
  }
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

    // Sesi wajib sama (default sesiId adalah 'default' atau 'pagi')
    const sesiA = normStr(a.sesiId || 'default');
    const sesiB = normStr(b.sesiId || 'default');
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
    let finalJamMasuk = newer.jamMasuk || older.jamMasuk || null;

    // 🛡️ ATURAN ANTI-WIPEOUT 2: Jam Pulang
    let finalJamPulang = newer.jamPulang || older.jamPulang || null;

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
      sesiId: newer.sesiId || older.sesiId,
      sesiNama: newer.sesiNama || older.sesiNama,
      jamMasuk: finalJamMasuk || null,
      jamPulang: finalJamPulang || null,
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
    const bucketKey = `${normStr(r.date)}_${normStr(r.sesiId || 'default')}`;
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
 * Deduplikasi data guru berdasarkan ID, NIPY, atau Nama Lengkap yang dinormalisasi.
 * Mencegah munculnya data guru ganda di seluruh sistem.
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
  return Array.from(map.values());
};

/**
 * Subscribe ke perubahan presensi real-time via Supabase Realtime.
 * Callback dipanggil setiap kali baris presensi_guru berubah di server.
 * Mengembalikan fungsi unsubscribe.
 */
export const subscribePresensiGuru = (onUpdate) => {
  if (!isSupabaseConfigured() || !supabase) {
    return () => {}; // noop unsubscribe
  }
  const channel = supabase
    .channel('public:settings:presensi_guru')
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'settings', 
      filter: 'id=eq.presensi_guru' 
    }, async () => {
      // Saat ada perubahan di baris presensi_guru pada tabel settings, re-fetch data presensi terbaru
      try {
        const res = await fetchPresensiGuru();
        if (res.status === 'success' && Array.isArray(res.data)) {
          onUpdate(res.data);
        }
      } catch (err) {
        console.warn('Gagal sinkronisasi presensi real-time:', err);
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
        if (error) console.error('Supabase teachers upsert error:', error);

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

    // 5. Simpan / Hapus Login Logs Permanen
    if (Array.isArray(targetLogs)) {
      if (targetLogs.length === 0) {
        const { error } = await supabase.from('login_logs').delete().neq('id', '000000_dummy_never_matches');
        if (error) console.error('Supabase login_logs delete error:', error);
      } else {
        const logRecords = targetLogs.map(l => ({
          id: String(l.id || Date.now() + Math.random()),
          data: l,
          created_at: l.timestamp || l.created_at || (l.timeRaw ? new Date(l.timeRaw).toISOString() : now)
        }));
        const { error } = await supabase.from('login_logs').upsert(logRecords, { onConflict: 'id' });
        if (error) console.error('Supabase login_logs upsert error:', error);
      }
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

    // 2. Fetch Teachers
    const { data: teachersRows, error: teachersErr } = await supabase
      .from('teachers')
      .select('id, data');

    if (teachersErr) console.warn('Gagal mengambil teachers dari Supabase:', teachersErr);

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
    }) : null;

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
      .select('id, data');
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

  const todayStr = new Date().toISOString().slice(0, 10);
  const myTodayRecord = list.find(r => 
    r && (String(r.teacherId) === String(teacherId) || (r.teacherName && String(r.teacherName).trim().toLowerCase() === String(teacherId).trim().toLowerCase())) && 
    (r.date === todayStr || !r.date) && 
    (r.jamMasuk || ['Hadir', 'Terlambat', 'Izin', 'Sakit', 'Cuti', 'Dinas Luar'].includes(r.status))
  );

  if (myTodayRecord) {
    console.log('[AutoSync] Presensi guru hari ini ditemukan di memori lokal, menyinkronkan ke Supabase Cloud...');
    try {
      await pushPresensiGuru(list);
    } catch (e) {
      console.warn('[AutoSync] Background sync presensi warning:', e);
    }
  }
};

