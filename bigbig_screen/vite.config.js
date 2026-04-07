/*
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
})
*/

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5172,
    // 单独 npm run dev 或 dev:all 时默认打开全球大屏
    open: true,
    fs: {
      allow: [__dirname, workspaceRoot]
    }
  },
  preview: {
    port: 5172
  }
})
