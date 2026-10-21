import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Browser-only config used to iterate on the renderer without booting Electron.
 * The renderer detects the missing `window.api` bridge and falls back to demo
 * services, which makes hot-reload UI work fast and keeps Electron-only code
 * isolated in the preload/main processes.
 */
export default defineConfig({
  root: resolve('src/renderer'),
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
})
