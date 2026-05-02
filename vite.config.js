import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Sistem Penggajian',
        short_name: 'Gajian SD-IT QA',
        description: 'Sistem Informasi SDM dan Finansial Sekolah',
        theme_color: '#2563eb', // Warna header di peramban HP
        background_color: '#f8fafc',
        display: 'standalone', // Hilangkan address bar saat diinstal
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
})