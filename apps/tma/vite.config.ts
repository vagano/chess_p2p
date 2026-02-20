import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/tma/',
  server: {
    port: 5174,
    proxy: {
      '/ws': {
        target: 'http://localhost:3000',
        ws: true,
        rewrite: (path) => path.replace(/^\/ws/, ''),
      },
      '/api': { target: 'http://localhost:8080' },
    },
  },
})
