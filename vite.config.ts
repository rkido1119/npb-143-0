import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // 独自ドメイン https://143-0.com/ でルート配信
  base: '/',
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      // クローラの生HTMLキャッシュは監視対象外
      ignored: ['**/data_raw/**'],
    },
  },
})
