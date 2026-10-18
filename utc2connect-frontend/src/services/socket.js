import io from 'socket.io-client';

// Một socket dùng chung cho toàn app (kết nối thủ công sau khi đăng nhập)
const socket = io('/', {
  autoConnect: false,
  path: '/socket.io',
  transports: ['websocket', 'polling'],
});

export default socket;
