import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: './',
  plugins: [vue()],
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    // 不要自动打开浏览器，避免 dev:all 时首屏跳到省份页；全球大屏在 bigbig_screen 里 open
    open: false
  },
  preview: {
    host: true,
    port: 5174,
    strictPort: true
  }
})
