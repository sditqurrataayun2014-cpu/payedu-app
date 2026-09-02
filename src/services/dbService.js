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
 * Subscribe ke perubahan presensi real-time via Supabase Realtime.
 * Callback dipanggil setiap kali baris presensi_guru berubah di server.
 * Mengembalikan fungsi unsubscribe.
 */
export const subscribePresensiGuru = (onUpdate) => {
  if (!isSupabaseConfigured() || !supabase) {
    return () => {}; // noop unsubscribe
  }

  const channel = supabase
    .channel('presensi-realtime')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'settings',
        filter: 'id=eq.presensi_guru'
      },
      (payload) => {
        if (payload.new?.data) {
          const parsed = typeof payload.new.data === 'string' 
            ? JSON.parse(payload.new.data) 
            : payload.new.data;
          if (Array.isArray(parsed)) {
            console.log('[Realtime] Menerima update presensi dari server:', parsed.length, 'records');
            safeStorageSet('payedu_presensi_guru', parsed);
            onUpdate(parsed);
          }
        }
      }
    )
    .subscribe((status) => {
      console.log('[Realtime] Presensi subscription status:', status);
    });

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

  // Update LocalStorage cache seketika
  if (targetSettings && Object.keys(targetSettings).length > 0) {
    safeStorageSet('payedu_settings', targetSettings);
  }
  if (Array.isArray(targetTeachers)) {
    safeStorageSet('payedu_teachers', targetTeachers);
  }
  if (Array.isArray(targetArchives)) {
    safeStorageSet('payedu_archives', targetArchives);
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

    // 2. Simpan Teachers
    if (Array.isArray(targetTeachers) && targetTeachers.length > 0) {
      const teacherRecords = targetTeachers.map(t => ({
        id: String(t.id),
        name: t.name || '',
        data: t,
        updated_at: now
      }));
      const { error } = await supabase.from('teachers').upsert(teacherRecords, { onConflict: 'id' });
      if (error) console.error('Supabase teachers upsert error:', error);
    }

    // 3. Simpan Archives
    if (Array.isArray(targetArchives) && targetArchives.length > 0) {
      const archiveRecords = targetArchives.map(a => ({
        id: String(a.id || a.period || a.periode || Date.now() + Math.random()),
        period: a.period || a.periode || '',
        data: a,
        updated_at: now
      }));
      const { error } = await supabase.from('archives').upsert(archiveRecords, { onConflict: 'id' });
      if (error) console.error('Supabase archives upsert error:', error);
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
    const finalTeachers = serverTeachers || localTeachers;
    const finalArchives = serverArchives || localArchives;
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

