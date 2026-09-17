import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const gatewayProxy = {
  '/gateway': {
    target: 'http://127.0.0.1:8787',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/gateway/, ''),
    ws: true,
  },
}

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: gatewayProxy,
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
    strictPort: true,
    proxy: gatewayProxy,
  },
  build: {
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three') || id.includes('@react-three')) return 'three'
          if (id.includes('node_modules/echarts') || id.includes('echarts-for-react')) return 'echarts'
          if (id.includes('node_modules/reactflow') || id.includes('@reactflow')) return 'reactflow'
          if (id.includes('node_modules/antd') || id.includes('@ant-design')) return 'antd'
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'react-vendor'
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/tests/setup.ts',
  },
})
