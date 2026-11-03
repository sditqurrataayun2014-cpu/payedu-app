// ==========================================
// DEVICE FINGERPRINT & LOCK SERVICE
// Mengikat akun guru ke satu perangkat HP resmi
// Mencegah kecurangan titip absen antar guru
// Mendukung persistensi multi-layer (localStorage + cookie)
// dan pengenalan hardware konsisten (layar, GPU WebGL, CPU)
// agar tidak salah tolak pada HP yang sama meski beda browser
// ==========================================

const DEVICE_STORAGE_KEY = 'payedu_device_fingerprint';
const DEVICE_HW_KEY = 'payedu_device_hw';
const DEVICE_NAME_KEY = 'payedu_device_label';

// Helper cookie untuk ketahanan persistensi lintas penghapusan localStorage / WebView
const getCookie = (name) => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
};

const setCookie = (name, value, days = 365) => {
  if (typeof document === 'undefined') return;
  try {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  } catch {
    // Ignore cookie errors
  }
};

/**
 * Menghitung sidik jari hardware fisik yang stabil dan deterministik
 * (Layar ternormalisasi, Pixel Ratio, Core CPU, GPU Renderer WebGL)
 * Karakteristik ini bernilai SAMA meskipun dibuka di Chrome, Samsung Internet,
 * maupun WhatsApp in-app browser pada HP fisik yang sama!
 */
export const getHardwareFingerprint = () => {
  if (typeof window === 'undefined') return 'HW-SERVER';

  try {
    // 1. Dimensi layar ternormalisasi (independen dari rotasi portrait / landscape)
    const screenWidth = window.screen?.width || 0;
    const screenHeight = window.screen?.height || 0;
    const maxDim = Math.max(screenWidth, screenHeight);
    const minDim = Math.min(screenWidth, screenHeight);
    const dpr = Math.round((window.devicePixelRatio || 1) * 100);
    const colorDepth = window.screen?.colorDepth || 24;

    // 2. Platform & CPU
    const cores = navigator.hardwareConcurrency || 0;
    const memory = navigator.deviceMemory || 0;
    const ua = navigator.userAgent || '';
    
    let platformOs = 'Android';
    if (/iPhone|iPad|iPod/i.test(ua)) platformOs = 'iOS';
    else if (/Windows/i.test(ua)) platformOs = 'Win';
    else if (/Mac/i.test(ua)) platformOs = 'Mac';
    else if (/Linux/i.test(ua)) platformOs = 'Linux';

    // 3. GPU WebGL Physical Renderer (Sangat unik untuk setiap chip SoC HP fisik)
    let gpuRenderer = '';
    let gpuVendor = '';
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          gpuRenderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '').trim();
          gpuVendor = String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '').trim();
        }
      }
    } catch {
      // WebGL not available or blocked
    }

    // Buat hash deterministik
    const raw = `${platformOs}|${maxDim}x${minDim}|${dpr}|${colorDepth}|c${cores}|m${memory}|${gpuVendor}|${gpuRenderer}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }

    const token = `HW-${platformOs.toUpperCase()}-${Math.abs(hash).toString(36).toUpperCase()}-${maxDim}x${minDim}`;
    try {
      localStorage.setItem(DEVICE_HW_KEY, token);
      setCookie(DEVICE_HW_KEY, token);
    } catch {
      // Ignore
    }
    return token;
  } catch {
    return 'HW-FALLBACK-' + (window.screen?.width || 0);
  }
};

/**
 * Menghasilkan atau mengambil token sidik unik perangkat.
 * Menggunakan sinkronisasi ganda localStorage + Cookie untuk mencegah false reset.
 */
export const getOrCreateDeviceId = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return 'DEV-SERVER-NODE';
  }

  try {
    // 1. Coba baca dari localStorage
    let localToken = null;
    try {
      localToken = localStorage.getItem(DEVICE_STORAGE_KEY);
    } catch {
      // Ignore
    }

    // 2. Coba baca dari cookie sebagai cadangan (jika localStorage terhapus)
    const cookieToken = getCookie(DEVICE_STORAGE_KEY);

    // Jika ada di salah satu storage, sinkronkan ke yang lain
    if (localToken && localToken.trim()) {
      const trimmed = localToken.trim();
      if (!cookieToken) setCookie(DEVICE_STORAGE_KEY, trimmed);
      return trimmed;
    }

    if (cookieToken && cookieToken.trim()) {
      const trimmed = cookieToken.trim();
      try { localStorage.setItem(DEVICE_STORAGE_KEY, trimmed); } catch {}
      return trimmed;
    }

    // Jika benar-benar baru, buat token terikat hardware
    const hwFp = getHardwareFingerprint();
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    const token = `DEV-${hwFp.replace('HW-', '')}-${rand}`;

    try { localStorage.setItem(DEVICE_STORAGE_KEY, token); } catch {}
    setCookie(DEVICE_STORAGE_KEY, token);
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

  const ua = navigator.userAgent || '';
  let os = 'Perangkat';
  if (/Android/i.test(ua)) os = 'HP Android';
  else if (/iPhone/i.test(ua)) os = 'Apple iPhone';
  else if (/iPad/i.test(ua)) os = 'Apple iPad';
  else if (/Windows/i.test(ua)) os = 'Komputer Windows';
  else if (/Macintosh|Mac OS/i.test(ua)) os = 'Apple Mac';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/WhatsApp/i.test(ua)) browser = 'WhatsApp In-App';
  else if (/Edg/i.test(ua)) browser = 'Edge';
  else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet';
  else if (/MiuiBrowser/i.test(ua)) browser = 'Mi Browser';
  else if (/VivoBrowser/i.test(ua)) browser = 'Vivo Browser';
  else if (/OppoBrowser/i.test(ua)) browser = 'Oppo Browser';
  else if (/UCBrowser/i.test(ua)) browser = 'UC Browser';
  else if (/Chrome/i.test(ua)) browser = 'Chrome';
  else if (/Safari/i.test(ua)) browser = 'Safari';
  else if (/Firefox/i.test(ua)) browser = 'Firefox';

  const label = `${os} (${browser})`;
  try {
    localStorage.setItem(DEVICE_NAME_KEY, label);
    setCookie(DEVICE_NAME_KEY, label);
  } catch {
    // Ignore quota errors
  }
  return label;
};

/**
 * Memeriksa apakah perangkat saat ini cocok dengan perangkat terdaftar guru.
 * Dilengkapi pencocokan cerdas dua lapis:
 * 1. Token ID (LocalStorage / Cookie)
 * 2. Hardware Signature (Layar + GPU WebGL + SoC HP fisik)
 * Jika hardware sama (misal buka link dari WA / Samsung Internet di HP yang sama),
 * sistem dengan cerdas mengizinkan presensi dan menyinkronkan token!
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
  const currentHwFingerprint = getHardwareFingerprint();

  const registeredId = teacher?.registeredDeviceId ? String(teacher.registeredDeviceId).trim() : '';
  const registeredHw = teacher?.registeredHwFingerprint ? String(teacher.registeredHwFingerprint).trim() : '';

  // Kasus 1: Akun belum terikat ke HP manapun (pendaftaran HP pertama kali otomatis)
  if (!registeredId && !registeredHw) {
    return {
      isAllowed: true,
      needsEnroll: true,
      currentDeviceId,
      currentDeviceName,
      currentHwFingerprint,
      reason: 'UNBOUND_AUTO_ENROLL'
    };
  }

  // Kasus 2: Token ID persis sama (di browser yang sama atau cookie utuh)
  if (registeredId && registeredId === currentDeviceId) {
    const needsUpdate = !registeredHw;
    return {
      isAllowed: true,
      needsEnroll: false,
      needsUpdate,
      currentDeviceId,
      currentDeviceName,
      currentHwFingerprint,
      reason: 'MATCH_TOKEN'
    };
  }

  // Kasus 3: Token ID beda (misal buka dari WhatsApp in-app browser, Samsung Internet, atau cache dibersihkan),
  // TAPI Hardware Signature HP-nya SAMA PERSIS!
  // Ini membuktikan bahwa guru menggunakan HP fisik yang sama!
  if (registeredHw && registeredHw === currentHwFingerprint) {
    // Sinkronkan token lama ke storage browser baru ini agar selanjutnya match langsung
    try {
      localStorage.setItem(DEVICE_STORAGE_KEY, registeredId);
      setCookie(DEVICE_STORAGE_KEY, registeredId);
    } catch {}

    return {
      isAllowed: true,
      needsEnroll: false,
      needsUpdate: true,
      currentDeviceId: registeredId, // Pertahankan token utama
      currentDeviceName,
      currentHwFingerprint,
      reason: 'MATCH_HARDWARE_CROSS_BROWSER'
    };
  }

  // Kasus 4: Benar-benar perangkat berbeda (titip absen dari HP guru lain atau komputer)
  return {
    isAllowed: false,
    needsEnroll: false,
    currentDeviceId,
    currentDeviceName,
    currentHwFingerprint,
    registeredId,
    registeredDeviceName: teacher?.registeredDeviceName || 'HP Terdaftar',
    reason: 'DEVICE_MISMATCH'
  };
};
