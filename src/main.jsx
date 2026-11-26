import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'

const PRELOAD_RECOVERY_KEY = 'payedu_asset_recovery_ts';

// Tangani kegagalan lazy-chunk setelah deploy versi baru di Vercel
window.addEventListener('vite:preloadError', (event) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  try {
    const last = Number(sessionStorage.getItem(PRELOAD_RECOVERY_KEY) || 0);
    if (Date.now() - last < 15000) return;
    sessionStorage.setItem(PRELOAD_RECOVERY_KEY, String(Date.now()));
  } catch {
    // Abaikan kendala sessionStorage (mode privat/terbatas)
  }
  event.preventDefault();
  window.location.reload();
});

// Segera aktifkan Service Worker versi terbaru saat ada pembaruan di Vercel
registerSW({
  immediate: true,
  onRegistered(registration) {
    if (!registration) return;

    // Pastikan cache navigasi awal tersedia untuk akses offline pertama
    navigator.serviceWorker?.ready
      .then(() => fetch('/index.html', { cache: 'no-cache' }))
      .catch(() => {});

    const checkUpdate = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      registration.update().catch(() => {});
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkUpdate();
      }
    });
    setInterval(checkUpdate, 15 * 60 * 1000);
  }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
