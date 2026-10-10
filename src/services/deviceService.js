// ==========================================
// DEVICE FINGERPRINT & LOCK SERVICE
// Mengikat akun guru ke satu perangkat HP resmi
// Mencegah kecurangan titip absen antar guru
// ==========================================

const DEVICE_STORAGE_KEY = 'payedu_device_fingerprint';
const DEVICE_NAME_KEY = 'payedu_device_label';

/**
 * Menghasilkan atau mengambil token sidik unik perangkat browser.
 */
export const getOrCreateDeviceId = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return 'DEV-SERVER-NODE';
  }

  try {
    const existing = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (existing && existing.trim()) {
      return existing.trim();
    }

    // Buat sidik perangkat semi-deterministik dari properti browser
    const screenInfo = `${window.screen?.width || 0}x${window.screen?.height || 0}x${window.screen?.colorDepth || 0}`;
    const navInfo = `${navigator.userAgent || ''}-${navigator.hardwareConcurrency || 0}-${navigator.language || ''}`;
    let hash = 0;
    const raw = `${screenInfo}-${navInfo}`;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }

    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    const token = `DEV-${Math.abs(hash).toString(36).toUpperCase()}-${rand}`;
    
    localStorage.setItem(DEVICE_STORAGE_KEY, token);
    return token;
  } catch {
    return 'DEV-FALLBACK-' + Date.now();
  }
};

/**
 * Mendeteksi nama manusiawi dari perangkat dan browser yang digunakan.
 */
export const getDeviceReadableName = () => {
  if (typeof window === 'undefined' || !navigator) return 'Perangkat Browser';

  const stored = localStorage.getItem(DEVICE_NAME_KEY);
  if (stored && stored.trim()) return stored.trim();

  const ua = navigator.userAgent || '';
  let os = 'Perangkat';
  if (/Android/i.test(ua)) os = 'HP Android';
  else if (/iPhone/i.test(ua)) os = 'Apple iPhone';
  else if (/iPad/i.test(ua)) os = 'Apple iPad';
  else if (/Windows/i.test(ua)) os = 'Komputer Windows';
  else if (/Macintosh|Mac OS/i.test(ua)) os = 'Apple Mac';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/Edg/i.test(ua)) browser = 'Edge';
  else if (/Chrome/i.test(ua)) browser = 'Chrome';
  else if (/Safari/i.test(ua)) browser = 'Safari';
  else if (/Firefox/i.test(ua)) browser = 'Firefox';

  const label = `${os} (${browser})`;
  try {
    localStorage.setItem(DEVICE_NAME_KEY, label);
  } catch {
    // Ignore quota errors
  }
  return label;
};

/**
 * Memeriksa apakah perangkat saat ini cocok dengan perangkat terdaftar guru.
 */
export const verifyTeacherDevice = (teacher, isDeviceLockEnabled = true) => {
  if (!isDeviceLockEnabled) {
    return { isAllowed: true, reason: 'DEVICE_LOCK_DISABLED' };
  }

  // Jika guru memiliki izin pengecualian khusus (bypass) dari Admin
  if (teacher?.deviceLockBypass) {
    return { isAllowed: true, reason: 'BYPASSED_BY_ADMIN' };
  }

  const currentDeviceId = getOrCreateDeviceId();
  const currentDeviceName = getDeviceReadableName();
  const registeredId = teacher?.registeredDeviceId ? String(teacher.registeredDeviceId).trim() : '';

  // Belum terdaftar (akan auto-enroll)
  if (!registeredId) {
    return {
      isAllowed: true,
      needsEnroll: true,
      currentDeviceId,
      currentDeviceName,
      reason: 'UNBOUND_AUTO_ENROLL'
    };
  }

  // Sudah terdaftar: periksa kecocokan
  if (registeredId === currentDeviceId) {
    return {
      isAllowed: true,
      needsEnroll: false,
      currentDeviceId,
      currentDeviceName,
      reason: 'MATCH'
    };
  }

  // Tidak cocok (mencoba login di HP lain / titip absen)
  return {
    isAllowed: false,
    needsEnroll: false,
    currentDeviceId,
    currentDeviceName,
    registeredId,
    registeredDeviceName: teacher?.registeredDeviceName || 'HP Terdaftar',
    reason: 'DEVICE_MISMATCH'
  };
};
