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
    // 창마다 HTML 엔트리가 하나씩: Orbit 창(dashboard.html), 오브(orb.html)
    rollupOptions: {
      input: { dashboard: 'dashboard.html', orb: 'orb.html' },
    },
  },
})
