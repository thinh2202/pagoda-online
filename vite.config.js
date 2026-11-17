import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { apiPlugin } from './server/vite-api-plugin.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), apiPlugin()],
  base: './',
  server: {
    port: 5173,
    host: '0.0.0.0',
    strictPort: true,
  },
})
