import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * usePresence – quản lý "trực tuyến" ở mức toàn Hub (không phụ thuộc tab đang mở).
 *
 * NGUYÊN NHÂN LỖI CŨ
 *  1. `join_chat_all` chỉ được emit khi người dùng MỞ tab "Chat All" → đăng nhập xong vẫn chưa "online".
 *  2. Không nghe sự kiện `connect` → rớt mạng / server restart rồi nối lại thì không join lại.
 *  3. Danh sách online chỉ phản chiếu server; trước khi server phản hồi, chính mình không có trong danh sách.
 *
 * CÁCH SỬA (giống Discord / Messenger / Slack)
 *  - Khai báo online ngay khi có socket + người dùng (đăng nhập thành công).
 *  - Join lại tự động mỗi lần socket `connect` (kể cả reconnect).
 *  - Heartbeat định kỳ để server dọn người "treo" và để phát hiện mất kết nối ngầm.
 *  - Trạng thái `away` khi ẩn tab / `online` khi quay lại.
 *  - Luôn tự thêm chính mình vào danh sách (optimistic) khi socket đang kết nối.
 *  - Rời phòng sạch sẽ khi đăng xuất / đóng tab (pagehide).
 *
 * Tương thích server cũ: vẫn dùng `join_chat_all`, `leave_chat_all`, `chat_all_presence`.
 * Các sự kiện mới (`presence_heartbeat`, `presence_status`) là tuỳ chọn — server cũ bỏ qua cũng không sao.
 */

export const CONN = {
  CONNECTING: 'connecting',
  ONLINE: 'online',
  RECONNECTING: 'reconnecting',
  OFFLINE: 'offline',
};

const HEARTBEAT_MS = 25000;
const PRESENCE_STALE_MS = 70000;

const nameOf = (u) => (typeof u === 'string' ? u : u?.username || '');

/** Chuẩn hoá payload presence của server về { online: string[], status: Record<string,string> } */
const parsePresence = (data) => {
  const raw = Array.isArray(data) ? data : data?.online || [];
  const status = {};
  const online = [];
  raw.forEach((item) => {
    const name = typeof item === 'string' ? item : item?.username || item?.user;
    if (!name) return;
    if (!online.includes(name)) online.push(name);
    status[name] = (typeof item === 'object' && item?.status) || 'online';
  });
  if (data && typeof data === 'object' && data.status) Object.assign(status, data.status);
  return { online, status };
};

export default function usePresence(socket, currentUser) {
  const me = nameOf(currentUser);

  const [conn, setConn] = useState(() =>
    socket?.connected ? CONN.ONLINE : socket ? CONN.CONNECTING : CONN.OFFLINE
  );
  const [serverList, setServerList] = useState([]);
  const [statusMap, setStatusMap] = useState({});
  const [latency, setLatency] = useState(null);
  const [joinedAt, setJoinedAt] = useState(0);

  const lastPresenceRef = useRef(0);
  const joinedRef = useRef(false);
  const meRef = useRef(me);
  const userRef = useRef(currentUser);
  meRef.current = me;
  userRef.current = currentUser;

  /** Gửi khai báo online – gọi lại nhiều lần vẫn an toàn (server nên idempotent). */
  const announce = useCallback(
    (status = 'online') => {
      if (!socket || !meRef.current || !socket.connected) return;
      socket.emit('join_chat_all', userRef.current);
      socket.emit('presence_status', { user: meRef.current, status });
      joinedRef.current = true;
      setJoinedAt(Date.now());
    },
    [socket]
  );

  /* ---------- vòng đời chính ---------- */
  useEffect(() => {
    if (!socket || !me) {
      setConn(socket ? CONN.CONNECTING : CONN.OFFLINE);
      return undefined;
    }

    const onConnect = () => {
      setConn(CONN.ONLINE);
      announce(document.hidden ? 'away' : 'online'); // lần đầu + mọi lần reconnect
    };
    const onDisconnect = () => {
      joinedRef.current = false;
      setConn(CONN.RECONNECTING);
    };
    const onConnectError = () => setConn(CONN.RECONNECTING);
    const onReconnectFailed = () => setConn(CONN.OFFLINE);

    const onPresence = (data) => {
      const { online, status } = parsePresence(data);
      lastPresenceRef.current = Date.now();
      setServerList(online);
      setStatusMap(status);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.io?.on?.('reconnect_failed', onReconnectFailed);
    socket.on('chat_all_presence', onPresence);

    // Socket có thể đã kết nối TRƯỚC khi hook chạy (trường hợp đăng nhập xong mới mount Hub)
    if (socket.connected) onConnect();
    else setConn(CONN.CONNECTING);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.io?.off?.('reconnect_failed', onReconnectFailed);
      socket.off('chat_all_presence', onPresence);
      if (socket.connected) socket.emit('leave_chat_all', userRef.current);
      joinedRef.current = false;
    };
  }, [socket, me, announce]);

  /* ---------- heartbeat + đo độ trễ + tự "xin lại" danh sách nếu server im lặng ---------- */
  useEffect(() => {
    if (!socket || !me) return undefined;
    const t = setInterval(() => {
      if (!socket.connected) return;
      const sent = performance.now();
      // ack là tuỳ chọn: server cũ không phản hồi thì latency đơn giản không cập nhật
      socket.timeout?.(4000).emit('presence_heartbeat', { user: me }, (err) => {
        if (!err) setLatency(Math.round(performance.now() - sent));
      });
      if (Date.now() - lastPresenceRef.current > PRESENCE_STALE_MS) announce(document.hidden ? 'away' : 'online');
    }, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [socket, me, announce]);

  /* ---------- ẩn/hiện tab, mạng trình duyệt, đóng trang ---------- */
  useEffect(() => {
    if (!socket || !me) return undefined;

    const onVisibility = () => {
      if (!socket.connected) return;
      socket.emit('presence_status', { user: me, status: document.hidden ? 'away' : 'online' });
      if (!document.hidden && !joinedRef.current) announce('online');
    };
    const onBrowserOnline = () => {
      if (!socket.connected) socket.connect();
    };
    const onBrowserOffline = () => setConn(CONN.OFFLINE);
    const onPageHide = () => {
      if (socket.connected) socket.emit('leave_chat_all', userRef.current);
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onBrowserOnline);
    window.addEventListener('offline', onBrowserOffline);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onBrowserOnline);
      window.removeEventListener('offline', onBrowserOffline);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [socket, me, announce]);

  /* ---------- danh sách hiển thị: luôn chứa chính mình khi socket đang nối ---------- */
  // useMemo để tham chiếu mảng ổn định → component con không bị tính lại vô ích
  const online = useMemo(() => {
    const list = [...new Set(serverList.filter(Boolean))];
    if (me && conn === CONN.ONLINE && !list.includes(me)) list.unshift(me);
    // mình lên đầu, còn lại theo bảng chữ cái, người "away" xuống dưới
    return list.sort((a, b) => {
      if (a === me) return -1;
      if (b === me) return 1;
      const aw = statusMap[a] === 'away' ? 1 : 0;
      const bw = statusMap[b] === 'away' ? 1 : 0;
      return aw - bw || a.localeCompare(b, 'vi');
    });
  }, [serverList, statusMap, me, conn]);

  const statusOf = useCallback(
    (name) => (name === me ? (document.hidden ? 'away' : 'online') : statusMap[name] || 'online'),
    [me, statusMap]
  );

  return { conn, online, statusOf, latency, joinedAt, reannounce: announce };
}
