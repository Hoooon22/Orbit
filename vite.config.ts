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
    // 창마다 HTML 엔트리가 하나씩: 워크스페이스(index.html), 오브(orb.html)
    rollupOptions: {
      input: { main: 'index.html', orb: 'orb.html' },
    },
  },
})
