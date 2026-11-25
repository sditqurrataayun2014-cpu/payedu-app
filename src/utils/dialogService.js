// Global Event-Driven Dialog Service (menggantikan window.confirm & window.alert native browser)

let _listener = null;
let _idCounter = 0;

export const registerDialogListener = (listenerFn) => {
  _listener = listenerFn;
  return () => {
    if (_listener === listenerFn) {
      _listener = null;
    }
  };
};

const stripLeadingEmoji = (text) => {
  return String(text || '')
    .replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F\u200D]+\s*/gu, '')
    .replace(/\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F\u200D]+$/gu, '')
    .trim();
};

const inferConfirmMeta = (rawMessage, options = {}) => {
  const msg = String(rawMessage || '').trim();
  const lower = msg.toLowerCase();

  let variant = options.variant;
  if (!variant) {
    if (/(hapus|bersihkan|reset|cabut|permanen|nonaktif|keluar paksa)/.test(lower)) {
      variant = 'danger';
    } else if (/(perhatian|maintenance|aktifkan kunci|buka kuncian|peringatan)/.test(lower)) {
      variant = 'warning';
    } else {
      variant = 'primary';
    }
  }

  let title = options.title;
  if (!title) {
    if (lower.includes('riwayat akses') || lower.includes('riwayat login')) {
      title = 'Hapus Riwayat Akses';
    } else if (lower.includes('log audit')) {
      title = 'Bersihkan Log Audit';
    } else if (lower.includes('sidik jari') || lower.includes('kredensial')) {
      title = 'Hapus Sidik Jari';
    } else if (lower.includes('jurnal')) {
      title = 'Hapus Catatan Jurnal';
    } else if (lower.includes('pegawai ganda') || lower.includes('duplikasi')) {
      title = 'Bersihkan Data Ganda';
    } else if (lower.includes('kunci') || lower.includes('perangkat') || lower.includes('kuncian hp')) {
      title = 'Konfirmasi Kunci Perangkat';
    } else if (lower.includes('hapus')) {
      title = 'Konfirmasi Penghapusan';
    } else {
      title = 'Konfirmasi Tindakan';
    }
  }

  let confirmText = options.confirmText;
  if (!confirmText) {
    if (lower.includes('hapus')) confirmText = 'Ya, Hapus';
    else if (lower.includes('bersihkan')) confirmText = 'Ya, Bersihkan';
    else if (lower.includes('reset') || lower.includes('buka kuncian')) confirmText = 'Ya, Reset';
    else if (lower.includes('aktifkan')) confirmText = 'Ya, Terapkan';
    else confirmText = 'Ya, Lanjutkan';
  }

  const cleanedMessage = msg.replace(/^PERHATIAN\s*:\s*/i, '');

  return {
    title,
    message: cleanedMessage,
    variant,
    confirmText,
    cancelText: options.cancelText || 'Batal',
  };
};

const inferAlertMeta = (rawMessage, options = {}) => {
  const msg = String(rawMessage || '').trim();
  const lower = msg.toLowerCase();

  let variant = options.variant;
  if (!variant) {
    if (/(gagal|ditolak|kesalahan|tidak valid|kritis|penuh!|error|❌)/.test(lower)) {
      variant = 'error';
    } else if (/(peringatan|terputus|tidak stabil|mohon|harap|belum|tidak ditemukan|tidak ada|dibatalkan|berakhir|dinonaktifkan|⚠️|🔒|🔓)/.test(lower)) {
      variant = 'warning';
    } else if (/(berhasil|sukses|mantap|alhamdulillah|luar biasa|berjaya|terima kasih|bersih!|diaktifkan|selesai|terkirim|disinkronkan|diperbarui|terpulihkan|✅|✨)/.test(lower)) {
      variant = 'success';
    } else {
      variant = 'info';
    }
  }

  let title = options.title;
  let body = msg;

  // Jika pesan diawali baris judul singkat lalu diikuti baris kosong (\n\n), angkat menjadi judul modal yang rapi
  if (!title && msg.includes('\n\n')) {
    const parts = msg.split(/\n\n+/);
    const firstLine = stripLeadingEmoji(parts[0]);
    if (firstLine && firstLine.length <= 65 && parts.slice(1).join('\n\n').trim()) {
      title = firstLine.replace(/[!.:]+$/, '');
      body = parts.slice(1).join('\n\n').trim();
    }
  }

  if (!title) {
    if (lower.includes('ditolak')) title = 'Akses Ditolak';
    else if (lower.includes('sesi berakhir')) title = 'Sesi Berakhir';
    else if (variant === 'success') title = 'Berhasil';
    else if (variant === 'error') title = 'Terjadi Kendala';
    else if (variant === 'warning') title = 'Perhatian';
    else title = 'Informasi Sistem';
  }

  body = stripLeadingEmoji(body);

  return {
    title,
    message: body,
    variant,
    buttonText: options.buttonText || (variant === 'success' ? 'Oke, Siap' : 'Mengerti'),
  };
};

/**
 * Menampilkan modal konfirmasi modern (Promise<boolean>).
 * Menerima string atau objek { title, message, variant, confirmText, cancelText }.
 */
export const showConfirm = (input, extraOptions = {}) => {
  const opts = typeof input === 'string'
    ? inferConfirmMeta(input, extraOptions)
    : inferConfirmMeta(input?.message || '', input);

  if (typeof _listener !== 'function') {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      return Promise.resolve(window.confirm(opts.message));
    }
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    _listener({
      id: `dlg_${++_idCounter}`,
      kind: 'confirm',
      ...opts,
      resolve,
    });
  });
};

/**
 * Menampilkan modal notifikasi/informasi modern (Promise<void>).
 * Menerima string atau objek { title, message, variant, buttonText }.
 */
export const showAlert = (input, extraOptions = {}) => {
  const opts = typeof input === 'string'
    ? inferAlertMeta(input, extraOptions)
    : inferAlertMeta(input?.message || '', input);

  if (typeof _listener !== 'function') {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(opts.message);
    }
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    _listener({
      id: `dlg_${++_idCounter}`,
      kind: 'alert',
      ...opts,
      resolve,
    });
  });
};
