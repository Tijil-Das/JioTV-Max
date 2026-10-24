import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Independent Vite configuration for the JioTv Max web showcase application.
 * Builds a standalone, self-contained bundle for embedding into the website.
 */
export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'html-transform-no-module',
      transformIndexHtml(html) {
        return html
          .replace(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g, '<script defer src="$1"></script>')
          .replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, '<link rel="stylesheet" href="$1">')
      }
    }
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  build: {
    outDir: resolve(__dirname, '../app'),
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        format: 'iife',
        name: 'JioTvMaxApp',
        inlineDynamicImports: true,
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  },
  server: {
    port: 5173
  }
})
