import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

const shared = resolve(__dirname, 'src/shared')

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': shared } },
    // pdfjs 必须打进 out/main：打包态 asar 里没有可靠的 node_modules/pdfjs-dist 可 require，
    // 而它的 worker/cmaps 已经作为 extraResources 以普通文件形式带上了。
    build: { externalizeDeps: { exclude: ['pdfjs-dist'] } }
  },
  preload: {
    resolve: { alias: { '@shared': shared } }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@shared': shared
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
