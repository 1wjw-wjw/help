import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [vue()],
  clearScreen: false,
  /** 避免 dev 时访问 public/data 等路径被判定为「超出 allow list」而报错（多根目录/上层依赖时放宽） */
  server: {
    // 监听全部网卡（含 IPv4），与跨端口跳转一致
    host: true,
    port: 5173,
    strictPort: true,
    fs: {
      allow: [__dirname, path.join(__dirname, 'public'), path.resolve(__dirname, '..')],
    },
  },
  preview: {
    host: true,
    port: 5173,
    strictPort: true,
  },
})
