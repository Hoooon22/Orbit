import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    // 창마다 HTML 엔트리가 하나씩: 메모(index.html), Orbit 대시보드(dashboard.html), 오브(orb.html)
    rollupOptions: {
      input: { main: 'index.html', dashboard: 'dashboard.html', orb: 'orb.html' },
    },
  },
})
