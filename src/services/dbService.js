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

/**
 * Menyimpan data presensi guru ke LocalStorage dan Supabase (baris terpisah).
 * Fungsi ini dipanggil langsung setiap kali ada perubahan presensi.
 */
export const pushPresensiGuru = async (presensiArray) => {
  if (!Array.isArray(presensiArray)) return { status: 'error', message: 'Data presensi bukan array' };

  // 1. Simpan ke LocalStorage seketika (sumber kebenaran offline)
  safeStorageSet('payedu_presensi_guru', presensiArray);

  // 2. Simpan ke Supabase sebagai baris terpisah di tabel settings
  if (!isSupabaseConfigured() || !navigator.onLine) {
    return { status: 'success', message: 'Presensi tersimpan di LocalStorage (offline)' };
  }

  try {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('settings')
      .upsert({ 
        id: 'presensi_guru', 
        data: presensiArray, 
        updated_at: now 
      });
    if (error) {
      console.error('Supabase presensi_guru upsert error:', error);
      return { status: 'partial', message: 'Tersimpan lokal, gagal sync ke cloud: ' + error.message };
    }
    return { status: 'success', message: 'Presensi berhasil disinkronkan ke cloud' };
  } catch (error) {
    console.error('Error saat menyimpan presensi ke Supabase:', error);
    return { status: 'partial', message: 'Tersimpan lokal, gagal sync ke cloud' };
  }
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
 * Merge dua array presensi: server menang untuk record yang sama (by id), 
 * record unik dari keduanya dipertahankan.
 */
function mergePresensiArrays(serverArr, localArr) {
  const map = new Map();
  // Masukkan lokal dulu
  for (const r of localArr) {
    if (r && r.id) map.set(r.id, r);
    else if (r && r.teacherId && r.date) {
      const key = `${r.teacherId}_${r.date}_${r.sesiId || 'default'}`;
      map.set(key, r);
    }
  }
  // Server menimpa (lebih prioritas)
  for (const r of serverArr) {
    if (r && r.id) map.set(r.id, r);
    else if (r && r.teacherId && r.date) {
      const key = `${r.teacherId}_${r.date}_${r.sesiId || 'default'}`;
      map.set(key, r);
    }
  }
  return Array.from(map.values());
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
    .channel('public:presensi_guru')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'presensi_guru' }, async () => {
      // Saat ada perubahan di tabel presensi_guru, re-fetch data presensi terbaru
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
export const fetchCloudData = async () => {
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
    // 1. Fetch General Settings
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

    // 3. Fetch Archives
    const { data: archivesRows, error: archivesErr } = await supabase
      .from('archives')
      .select('id, period, data');

    if (archivesErr) console.warn('Gagal mengambil archives dari Supabase:', archivesErr);

    // 4. Fetch Feedbacks
    const { data: feedbackRows, error: feedbackErr } = await supabase
      .from('feedbacks')
      .select('id, data');

    if (feedbackErr) console.warn('Gagal mengambil feedbacks dari Supabase:', feedbackErr);

    // 5. Fetch Login Logs (Terurut kronologis terbaru di atas)
    const { data: logRows, error: logErr } = await supabase
      .from('login_logs')
      .select('id, data, created_at')
      .order('created_at', { ascending: false });

    if (logErr) console.warn('Gagal mengambil login_logs dari Supabase:', logErr);

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

    const serverArchives = archivesRows && archivesRows.length > 0 ? archivesRows.map(r => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data)) : null;
    const serverFeedbacks = feedbackRows && feedbackRows.length > 0 ? feedbackRows.map(r => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data)) : null;
    const serverLogs = logRows && logRows.length > 0 ? logRows.map(r => {
      const parsed = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {});
      return {
        id: r.id || parsed.id,
        created_at: r.created_at || parsed.created_at || parsed.timestamp,
        timestamp: parsed.timestamp || r.created_at,
        ...parsed,
        id: r.id || parsed.id
      };
    }) : null;

    const finalSettings = serverSettings || localSettings || {};
    const finalTeachers = deduplicateTeachers(serverTeachers || localTeachers || []);
    const finalArchives = deduplicateArchives(serverArchives || localArchives || []);
    const finalFeedbacks = serverFeedbacks || localFeedbacks;
    const finalLogs = serverLogs || localLogs;

    if (!serverTeachers && localTeachers.length > 0) {
      console.log('Database Cloud Supabase masih kosong. Melakukan auto-push data lokal ke Supabase...');
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

