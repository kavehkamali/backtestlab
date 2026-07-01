import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  appType: 'spa',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  build: {
    // Split heavy vendors into separate cacheable, parallel-loaded chunks so the
    // initial payload isn't one ~1.2MB blob.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('lightweight-charts')) return 'charts'
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) return 'recharts'
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'react'
          if (id.includes('lucide-react')) return 'icons'
          return 'vendor'
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
})
