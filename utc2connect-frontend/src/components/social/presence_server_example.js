/**
 * Ví dụ phía SERVER (Node + socket.io) tương thích với usePresence + GlobalChatRoom mới.
 * Không bắt buộc: client vẫn chạy với server cũ, nhưng thêm đoạn này sẽ có đủ
 * trạng thái "vắng mặt", ack "đã gửi", thu hồi tin và dọn người treo chính xác.
 *
 * Gắn vào io.on('connection', socket => registerChatAll(io, socket));
 */
const ROOM = 'chat_all';
// username -> { sockets: Set<socketId>, status: 'online' | 'away' }
// Dùng Set socketId để 1 người mở nhiều tab/thiết bị vẫn chỉ tính là 1 người online.
const presence = new Map();

const snapshot = () => ({
  online: [...presence.entries()].map(([username, p]) => ({ username, status: p.status })),
});
const broadcast = (io) => io.to(ROOM).emit('chat_all_presence', snapshot());

const nameOf = (u) => (typeof u === 'string' ? u : u?.username || '');

function registerChatAll(io, socket) {
  let username = '';

  const join = (user) => {
    const name = nameOf(user);
    if (!name) return;
    username = name;
    socket.join(ROOM);
    const entry = presence.get(name) || { sockets: new Set(), status: 'online' };
    entry.sockets.add(socket.id);
    presence.set(name, entry);
    broadcast(io);
  };

  const leave = () => {
    if (!username) return;
    const entry = presence.get(username);
    if (entry) {
      entry.sockets.delete(socket.id);
      if (entry.sockets.size === 0) presence.delete(username);
    }
    socket.leave(ROOM);
    username = '';
    broadcast(io);
  };

  socket.on('join_chat_all', join);
  socket.on('leave_chat_all', leave);
  socket.on('disconnect', leave);

  socket.on('presence_status', ({ user, status } = {}) => {
    const entry = presence.get(nameOf(user));
    if (!entry || !['online', 'away'].includes(status)) return;
    entry.status = status;
    broadcast(io);
  });

  // Ack cho heartbeat → client đo được độ trễ
  socket.on('presence_heartbeat', (_data, ack) => {
    if (typeof ack === 'function') ack({ ok: true, t: Date.now() });
  });

  // Gửi tin: kiểm tra người gửi rồi ack { ok } để client hiện "Đã gửi" / "Gửi lại"
  socket.on('send_chat_all', (payload, ack) => {
    if (!username || !payload?.id || nameOf(payload.sender) !== username) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Bạn chưa tham gia phòng chat' });
      return;
    }
    socket.to(ROOM).emit('chat_all_message', payload);
    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('chat_all_typing', (data) => socket.to(ROOM).emit('chat_all_typing', data));
  socket.on('react_chat_all', (data) => socket.to(ROOM).emit('chat_all_reaction', data));

  // Thu hồi: ép user = người đang kết nối, không tin dữ liệu client gửi lên
  socket.on('chat_all_delete', ({ messageId } = {}) => {
    if (!username || !messageId) return;
    socket.to(ROOM).emit('chat_all_delete', { messageId, user: username });
  });
}

module.exports = { registerChatAll };
