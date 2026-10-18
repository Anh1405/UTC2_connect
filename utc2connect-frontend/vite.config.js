import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import mkcert from 'vite-plugin-mkcert';

export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    mkcert(),
  ],
  server: {
    host: true,
    port: 5173,
    https: true,
    proxy: {
      '/ai': {
      target: 'http://127.0.0.1:8000',
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/ai/, ''),
    },
      '/api': {
        target: 'http://127.0.0.1:8080', 
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            if (err.code === 'ECONNRESET' || err.code === 'EPIPE') return;
            console.error('API Proxy error:', err);
          });
        }
      },
      '/socket.io': {
        target: 'http://127.0.0.1:8081', 
        ws: true,
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          // Bỏ qua lỗi ngắt kết nối HTTP Proxy
          proxy.on('error', (err) => {
            if (err.code === 'ECONNRESET' || err.code === 'EPIPE') return;
          });
          // Bỏ qua lỗi ngắt kết nối WebSocket Socket Proxy trên di động
          proxy.on('proxyReqWsError', (err) => {
            if (err.code === 'ECONNRESET' || err.code === 'EPIPE') return;
          });
        }
      }
    }
  }
});