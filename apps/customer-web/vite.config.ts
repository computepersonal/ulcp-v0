import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Served under /c/ on the same origin as the other V0 apps (via the gateway), so the
// QR link is <public origin>/c/place/<slug>. In dev, API calls are proxied to the services.
const api = (port: number) => ({ target: `http://localhost:${port}`, changeOrigin: true })

export default defineConfig({
  base: '/c/',
  plugins: [tailwindcss(), react()],
  server: {
    port: 5180,
    proxy: {
      '/api/v1/auth': api(3001),
      '/api/v1/tenants': api(3002),
      '/api/v1/catalogue': api(3003),
      '/api/v1/orders': api(3004),
      '/socket.io': { target: 'http://localhost:3008', ws: true, changeOrigin: true },
    },
  },
})
