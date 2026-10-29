import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react()
  ],
  server: {
    port: 5173,
    allowedHosts: ['app.ulcplatform.com'],
    // Onboarding is a separate app (port 5174) served under /onboarding/. Proxying it here keeps
    // POS and onboarding on one origin in dev, so they share the staff_auth login in localStorage.
    proxy: { '/onboarding': { target: 'http://localhost:5174', ws: true } }
  }
})
