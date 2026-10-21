import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/**
 * electron-vite builds three targets:
 *  - main     → Node.js/Electron main process (Jio API, window lifecycle, IPC)
 *  - preload  → the contextBridge surface exposed to the renderer
 *  - renderer → the React application (Chromium)
 *
 * Aliases are mirrored in tsconfig files and in vite.web.config.ts so the
 * renderer can also be run in a plain browser for UI development.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
