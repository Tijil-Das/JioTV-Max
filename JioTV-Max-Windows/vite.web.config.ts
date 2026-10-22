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
  // Keep the browser-only dev server's optimiser in step with electron-vite.
  // Both shaka-player and hls.js are heavy media engines; prebundling them
  // avoids a first-playback stall (and a missing dep URL after a cache reset).
  optimizeDeps: {
    include: ['hls.js', 'shaka-player']
  },
  server: {
    port: 5173,
    strictPort: true
  }
})
