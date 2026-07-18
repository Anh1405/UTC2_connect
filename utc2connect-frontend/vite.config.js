import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import mkcert from 'vite-plugin-mkcert'

export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(), // Kích hoạt Tailwind CSS của bạn
    mkcert()
  ],
  server: {
    host: true, // Cho phép điện thoại truy cập qua IP mạng cục bộ
    port: 5173,
    https: true,
    proxy: {
      // Khi dùng đường dẫn tương đối '/api', Vite Server sẽ tự đứng ra trung gian
      // và bắn request sang Spring Boot ở localhost. Đổi Wi-Fi không hề bị ảnh hưởng.
      '/api': {
        target: 'http://127.0.0.1:8080', 
        changeOrigin: true,
        secure: false
      },
      '/socket.io': {
        target: 'http://127.0.0.1:8081', 
        ws: true,
        changeOrigin: true,
        secure: false
      }
    }
  }
})