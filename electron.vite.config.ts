import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/**
 * Production-only CSP.
 *
 * Dev servers (electron-vite and `dev:web`) inject inline module preambles for
 * React Fast Refresh, so a strict `script-src 'self'` policy would blank the
 * window during development. The policy is therefore injected into the built
 * index.html instead, where the bundle is fully external.
 */
function contentSecurityPolicy(): Plugin {
  const policy = [
    "default-src 'self' app:",
    "script-src 'self' app:",
    "style-src 'self' app: 'unsafe-inline'",
    "img-src 'self' app: data: blob: https:",
    "media-src 'self' app: blob: data: https: http://127.0.0.1:* http://localhost:*",
    "connect-src 'self' app: https: http://127.0.0.1:* http://localhost:*",
    "font-src 'self' app: data:",
    "worker-src 'self' app: blob:"
  ].join('; ')
  return {
    name: 'streamdeck-csp',
    transformIndexHtml(html, context) {
      if (context.server) return html
      return html.replace(
        '</head>',
        `    <meta http-equiv="Content-Security-Policy" content="${policy}" />\n  </head>`
      )
    }
  }
}


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
    // shaka-player is loaded through a dynamic import. Vite normally discovers
    // it during the initial scan, but electron-vite's renderer can start before
    // the optimiser has written the dep, which leaves the player requesting a
    // missing /@fs/.../.vite/deps/shaka-player.js URL. Listing it explicitly
    // makes the optimiser build it before the window opens.
    optimizeDeps: {
      include: ['hls.js', 'shaka-player']
    },
    plugins: [react(), contentSecurityPolicy()]
  }
})
