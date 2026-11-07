import { isTeacherActive } from '../utils/payrollUtils';

const BIOMETRIC_STORAGE_KEY = 'payedu_biometric_credential';

/**
 * 🔍 Cek ketersediaan sensor biometrik (Sidik Jari / Face Unlock / PIN Perangkat)
 */
export const isBiometricSupported = async () => {
  if (typeof window === 'undefined') return false;
  if (!window.PublicKeyCredential) return false;
  
  try {
    const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return Boolean(available);
  } catch (err) {
    console.warn('[WebAuthn] Pemeriksaan platform authenticator gagal:', err);
    return false;
  }
};

/**
 * 💾 Dapatkan info akun yang terikat biometrik di perangkat ini
 */
export const getSavedBiometricAccount = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(BIOMETRIC_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
};

/**
 * 🗑️ Hapus integrasi biometrik dari perangkat ini
 */
export const removeBiometricAccount = () => {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.removeItem(BIOMETRIC_STORAGE_KEY);
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * 🔐 Daftarkan Sidik Jari / Biometrik untuk Akun Pengguna Ini
 */
export const registerBiometricLogin = async (user) => {
  if (!user || !user.id) {
    throw new Error('Data pengguna tidak valid untuk pendaftaran biometrik.');
  }

  const supported = await isBiometricSupported();
  if (!supported) {
    throw new Error('Perangkat atau peramban ini belum mendukung sensor biometrik WebAuthn.');
  }

  // Buat random buffer untuk challenge & user ID
  const userIdBuffer = new Uint8Array(16);
  window.crypto.getRandomValues(userIdBuffer);

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  const creationOptions = {
    challenge: challenge,
    rp: {
      name: 'PayEdu SDIT Qurrata A\'yun',
      id: window.location.hostname
    },
    user: {
      id: userIdBuffer,
      name: String(user.username || user.id || 'pegawai').trim(),
      displayName: String(user.name || 'Pegawai SDIT').trim()
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' },  // ES256
      { alg: -257, type: 'public-key' } // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform', // Sensor bawaan HP (Sidik Jari / Face Unlock)
      userVerification: 'required',
      requireResidentKey: false
    },
    timeout: 60000,
    attestation: 'none'
  };

  try {
    const credential = await navigator.credentials.create({
      publicKey: creationOptions
    });

    if (!credential || !credential.rawId) {
      throw new Error('Sensor biometrik tidak merespon atau dibatalkan.');
    }

    // Ubah credential rawId menjadi Base64url yang aman disimpan di storage lokal
    const rawIdBytes = new Uint8Array(credential.rawId);
    let binary = '';
    for (let i = 0; i < rawIdBytes.byteLength; i++) {
      binary += String.fromCharCode(rawIdBytes[i]);
    }
    const credentialId = btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const credentialData = {
      credentialId,
      userId: user.id,
      username: user.username || user.id,
      name: user.name,
      role: user.role === 'Admin' ? 'admin' : user.role,
      nipy: user.nipy || '',
      registeredAt: Date.now(),
      userAgent: navigator.userAgent
    };

    localStorage.setItem(BIOMETRIC_STORAGE_KEY, JSON.stringify(credentialData));
    return credentialData;
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      throw new Error('Pendaftaran biometrik dibatalkan oleh pengguna atau sensor tidak mengenali sidik jari.');
    }
    throw new Error(`Gagal mendaftarkan biometrik: ${err.message || 'Error tidak diketahui'}`);
  }
};

/**
 * ⚡ Autentikasi Cepat dengan Sidik Jari / Biometrik di Halaman Login
 */
export const authenticateWithBiometrics = async (teachers = []) => {
  const saved = getSavedBiometricAccount();
  if (!saved || !saved.credentialId) {
    throw new Error('Belum ada akun yang didaftarkan biometrik di HP ini. Silakan login biasa terlebih dahulu dan aktifkan Biometrik.');
  }

  const supported = await isBiometricSupported();
  if (!supported) {
    throw new Error('Perangkat tidak mendukung autentikasi biometrik.');
  }

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  // Decode credentialId base64url kembali ke Uint8Array
  try {
    let base64 = saved.credentialId.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const rawIdBinary = atob(base64);
    const rawIdBytes = new Uint8Array(rawIdBinary.length);
    for (let i = 0; i < rawIdBinary.length; i++) {
      rawIdBytes[i] = rawIdBinary.charCodeAt(i);
    }

    const requestOptions = {
      challenge: challenge,
      allowCredentials: [{
        id: rawIdBytes,
        type: 'public-key',
        transports: ['internal']
      }],
      userVerification: 'required',
      timeout: 60000
    };

    const assertion = await navigator.credentials.get({
      publicKey: requestOptions
    });

    if (!assertion) {
      throw new Error('Sensor biometrik tidak mendeteksi verifikasi.');
    }

    // Verifikasi status keaktifan jika akun adalah guru
    if (saved.role === 'guru') {
      const currentTeacher = (teachers || []).find(t => String(t.id) === String(saved.userId));
      if (currentTeacher && !isTeacherActive(currentTeacher)) {
        throw new Error('Akses ditolak: Akun guru ini telah dinonaktifkan (Status: Resign/Non-Aktif). Hubungi Tata Usaha.');
      }
    }

    return {
      success: true,
      user: {
        id: saved.userId,
        name: saved.name,
        username: saved.username,
        role: saved.role,
        nipy: saved.nipy
      }
    };
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      throw new Error('Verifikasi sidik jari dibatalkan atau tidak cocok.');
    }
    throw err;
  }
};
