import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiPort = process.env.AUTOSPORT_API_PORT || '8102'
const proxy = { '/api': `http://127.0.0.1:${apiPort}` }
export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: ['index.html', 'portraits.html'] } },
  server: { proxy },
  preview: { proxy },
})
