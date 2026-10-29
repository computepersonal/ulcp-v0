import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Served under /onboarding/ on the same origin as the staff POS (via the gateway),
// so both apps share the staff_auth entry in localStorage.
export default defineConfig({
  base: '/onboarding/',
  plugins: [tailwindcss(), react()],
  server: { port: 5174, allowedHosts: ['app.ulcplatform.com'] }
})
