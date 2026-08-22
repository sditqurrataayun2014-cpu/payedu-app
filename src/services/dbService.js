import { supabase, isSupabaseConfigured } from '../lib/supabase';

// Helper Failsafe untuk Penyimpanan Lokal
const safeStorageGet = (key, fallback) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (e) {
    console.error(`Gagal membaca ${key} dari LocalStorage:`, e);
    return fallback;
  }
};

const safeStorageSet = (key, value) => {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch (e) {
    console.error(`Gagal menyimpan ${key} ke LocalStorage:`, e);
  }
};

/**
 * Mengambil seluruh data aplikasi dari Supabase (dengan fallback ke LocalStorage).
 */
export const fetchCloudData = async () => {
  if (!isSupabaseConfigured() || !navigator.onLine) {
    console.log('Supabase tidak terkonfigurasi atau perangkat offline. Menggunakan LocalStorage.');
    return {
      status: 'success',
      source: 'local',
      data: {
        settings: safeStorageGet('payedu_settings', {}),
        teachers: safeStorageGet('payedu_teachers', []),
        archives: safeStorageGet('payedu_archives', []),
        feedbacks: safeStorageGet('payedu_feedbacks', []),
        loginHistory: safeStorageGet('payedu_loginHistory', [])
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

    // 5. Fetch Login Logs
    const { data: logRows, error: logErr } = await supabase
      .from('login_logs')
      .select('id, data');

    if (logErr) console.warn('Gagal mengambil login_logs dari Supabase:', logErr);

    const fetchedSettings = settingsRow?.data || safeStorageGet('payedu_settings', {});
    const fetchedTeachers = teachersRows ? teachersRows.map(r => ({ ...r.data, id: r.id })) : safeStorageGet('payedu_teachers', []);
    const fetchedArchives = archivesRows ? archivesRows.map(r => r.data) : safeStorageGet('payedu_archives', []);
    const fetchedFeedbacks = feedbackRows ? feedbackRows.map(r => r.data) : safeStorageGet('payedu_feedbacks', []);
    const fetchedLoginHistory = logRows ? logRows.map(r => r.data) : safeStorageGet('payedu_loginHistory', []);

    // Perbarui LocalStorage Cache untuk Offline Resilience
    safeStorageSet('payedu_settings', fetchedSettings);
    safeStorageSet('payedu_teachers', fetchedTeachers);
    safeStorageSet('payedu_archives', fetchedArchives);
    safeStorageSet('payedu_feedbacks', fetchedFeedbacks);
    safeStorageSet('payedu_loginHistory', fetchedLoginHistory);

    return {
      status: 'success',
      source: 'supabase',
      data: {
        settings: fetchedSettings,
        teachers: fetchedTeachers,
        archives: fetchedArchives,
        feedbacks: fetchedFeedbacks,
        loginHistory: fetchedLoginHistory
      }
    };
  } catch (error) {
    console.error('Error saat menyinkronkan dari Supabase:', error);
    return {
      status: 'success',
      source: 'fallback',
      data: {
        settings: safeStorageGet('payedu_settings', {}),
        teachers: safeStorageGet('payedu_teachers', []),
        archives: safeStorageGet('payedu_archives', []),
        feedbacks: safeStorageGet('payedu_feedbacks', []),
        loginHistory: safeStorageGet('payedu_loginHistory', [])
      }
    };
  }
};

/**
 * Menyimpan / menyinkronkan data aplikasi ke Supabase & LocalStorage
 */
export const pushCloudData = async (action, payload) => {
  // Selalu update LocalStorage dulu demi kecepatan UI
  if (payload) {
    if (payload.settings) safeStorageSet('payedu_settings', payload.settings);
    if (payload.teachers) safeStorageSet('payedu_teachers', payload.teachers);
    if (payload.archives) safeStorageSet('payedu_archives', payload.archives);
    if (payload.feedbacks) safeStorageSet('payedu_feedbacks', payload.feedbacks);
    if (payload.loginHistory) safeStorageSet('payedu_loginHistory', payload.loginHistory);
  }

  if (!isSupabaseConfigured() || !navigator.onLine) {
    return { status: 'success', message: 'Tersimpan lokal di LocalStorage (Offline / Supabase belum dikonfigurasi)' };
  }

  try {
    const now = new Date().toISOString();

    // 1. Simpan Settings
    if (payload?.settings) {
      await supabase
        .from('settings')
        .upsert({ id: 'general', data: payload.settings, updated_at: now });
    }

    // 2. Simpan Teachers
    if (Array.isArray(payload?.teachers)) {
      const teacherRecords = payload.teachers.map(t => ({
        id: String(t.id),
        name: t.name || '',
        data: t,
        updated_at: now
      }));
      if (teacherRecords.length > 0) {
        await supabase.from('teachers').upsert(teacherRecords, { onConflict: 'id' });
      }
    }

    // 3. Simpan Archives
    if (Array.isArray(payload?.archives)) {
      const archiveRecords = payload.archives.map(a => ({
        id: String(a.id || a.period || Date.now()),
        period: a.period || '',
        data: a,
        updated_at: now
      }));
      if (archiveRecords.length > 0) {
        await supabase.from('archives').upsert(archiveRecords, { onConflict: 'id' });
      }
    }

    // 4. Simpan Feedbacks
    if (Array.isArray(payload?.feedbacks)) {
      const feedbackRecords = payload.feedbacks.map(f => ({
        id: String(f.id || Date.now()),
        data: f,
        created_at: f.date || now
      }));
      if (feedbackRecords.length > 0) {
        await supabase.from('feedbacks').upsert(feedbackRecords, { onConflict: 'id' });
      }
    }

    // 5. Simpan Login Logs
    if (Array.isArray(payload?.loginHistory)) {
      const logRecords = payload.loginHistory.map(l => ({
        id: String(l.id || Date.now()),
        data: l,
        created_at: l.timestamp || now
      }));
      if (logRecords.length > 0) {
        await supabase.from('login_logs').upsert(logRecords, { onConflict: 'id' });
      }
    }

    return { status: 'success', message: 'Berhasil disinkronkan ke Supabase Cloud!' };
  } catch (error) {
    console.error('Error saat menyimpan ke Supabase:', error);
    return { status: 'success', message: 'Tersimpan di LocalStorage (Gagal menyambung ke Supabase Cloud)' };
  }
};
