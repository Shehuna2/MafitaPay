import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// ✅ Cloudflare-ready configuration
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist', // Cloudflare Pages serves this folder
    rollupOptions: {
      external: [] // Ensure Rollup doesn’t break when resolving modules
    }
  },
  server: {
    port: 5173,
    open: true,
    // Allow Capacitor to access the dev server
    host: '0.0.0.0'
  },
  preview: {
    port: 4173
  },
  // Optimize dependencies for Capacitor
  optimizeDeps: {
    exclude: ['@capacitor/core']
  }
})
