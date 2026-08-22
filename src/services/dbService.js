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
 * Menyimpan / menyinkronkan data aplikasi ke Supabase & LocalStorage
 */
export const pushCloudData = async (action, payload) => {
  if (!payload) return { status: 'success', message: 'Payload kosong' };

  // Deteksi target data berdasarkan action atau struktur payload
  let targetSettings = payload.settings || (action === 'SAVE_SETTINGS' ? payload : null);
  let targetTeachers = payload.teachers || (action === 'SAVE_TEACHERS' ? payload : null);
  let targetArchives = payload.archives || (action === 'SAVE_ARCHIVES' ? payload : null);
  let targetFeedbacks = payload.feedbacks || (action === 'SAVE_FEEDBACKS' ? payload : null);
  let targetLogs = payload.loginHistory || (action === 'SAVE_LOGS' ? payload : null);

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

    // 1. Simpan Settings
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

    // 5. Simpan Login Logs
    if (Array.isArray(targetLogs) && targetLogs.length > 0) {
      const logRecords = targetLogs.map(l => ({
        id: String(l.id || Date.now() + Math.random()),
        data: l,
        created_at: l.timestamp || now
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
        loginHistory: localLogs
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

    // Dapatkan data dari Supabase jika ada (dengan parsing JSON aman jika dalam format string)
    const serverSettings = settingsRow?.data ? (typeof settingsRow.data === 'string' ? JSON.parse(settingsRow.data) : settingsRow.data) : null;
    
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
        ...parsedData, // Preservasi seluruh field kustom lainnya
        id: r.id || parsedData.id
      };
    }) : null;

    const serverArchives = archivesRows && archivesRows.length > 0 ? archivesRows.map(r => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data)) : null;
    const serverFeedbacks = feedbackRows && feedbackRows.length > 0 ? feedbackRows.map(r => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data)) : null;
    const serverLogs = logRows && logRows.length > 0 ? logRows.map(r => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data)) : null;

    // Failsafe: Jika Supabase masih kosong tetapi LocalStorage punya data, gunakan data lokal & Auto-Push ke Supabase!
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
        loginHistory: finalLogs
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
        loginHistory: finalLogs
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
        loginHistory: localLogs
      }
    };
  }
};
