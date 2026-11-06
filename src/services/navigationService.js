// 📱 ANDROID HARDWARE BACK & MODAL STACK MANAGER
// Mengelola riwayat modal & tombol Back HP secara mulus tanpa konflik history browser

const modalStack = [];

/**
 * Mendaftarkan modal yang sedang terbuka ke dalam tumpukan modal aktif.
 * Mengembalikan fungsi cleanup untuk membersihkan modal dari stack saat ditutup.
 */
export function registerBackModal(closeFn) {
  if (typeof closeFn !== 'function') return () => {};
  modalStack.push(closeFn);
  return () => {
    const idx = modalStack.lastIndexOf(closeFn);
    if (idx !== -1) {
      modalStack.splice(idx, 1);
    }
  };
}

/**
 * Memeriksa apakah ada modal yang sedang aktif di layar.
 */
export function hasActiveBackModal() {
  return modalStack.length > 0;
}

/**
 * Mengambil dan mengeksekusi penutupan modal paling atas.
 * Mengembalikan true jika ada modal yang ditutup, false jika tumpukan modal kosong.
 */
export function popAndCloseTopBackModal() {
  if (modalStack.length === 0) return false;
  const topCloser = modalStack.pop();
  try {
    topCloser();
  } catch (err) {
    console.warn('[Navigation] Gagal menutup modal via back button:', err);
  }
  return true;
}
