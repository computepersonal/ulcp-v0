import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'LocalCommerce',
        short_name: 'Shop',
        theme_color: '#6366F1',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [{ src: '/icon.png', sizes: '192x192', type: 'image/png' }]
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\/catalogue/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'catalogue',
              expiration: { maxAgeSeconds: 300 }
            }
          },
          {
            urlPattern: /\.(png|jpg|jpeg|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxAgeSeconds: 604800 }
            }
          }
        ]
      }
    })
  ],
  server: { port: 5180 }
})
