import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // GitHub Pages (https://<user>.github.io/npb-143-0/) 配信用
  base: mode === 'production' ? '/npb-143-0/' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      // クローラの生HTMLキャッシュは監視対象外
      ignored: ['**/data_raw/**'],
    },
  },
}))
