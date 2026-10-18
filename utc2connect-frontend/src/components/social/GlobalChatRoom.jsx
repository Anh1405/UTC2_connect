import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EmojiPicker from 'emoji-picker-react';
import { searchGifs, trendingGifs } from '../../services/giphy';
import useDebounce from '../../hooks/useDebounce';
import { CONN } from '../../hooks/usePresence';
import { generateUUID } from '../../utils/deviceId';
import { isImeComposing, normalizeChatText } from '../../utils/normalizeText';
import { analyzeGifIntent, learnGif, personalizeGifs, topicOf } from '../../utils/gifIntent';
import { UserChip } from '../profile/UserProfileDrawer';
import './teachat.css';
import './teachat.extra.css';

/* ==========================================================
   HẰNG SỐ
   ========================================================== */
const MAX_LEN = 500; // giới hạn ký tự mỗi tin
const SEND_COOLDOWN_MS = 700; // chống spam (slow-mode kiểu Discord)
const MAX_MESSAGES = 300; // giữ tối đa 300 tin trong bộ nhớ
const HISTORY_KEEP = 100; // số tin lưu lại để F5 không mất khung chat
const GROUP_GAP_MS = 5 * 60 * 1000; // gộp tin liên tiếp của cùng 1 người
const TYPING_TTL_MS = 4000;
const GAME_COOLDOWN_MS = 10 * 60 * 1000; // mỗi người chơi 1 trò / 10 phút
const GIF_SUGGEST_DELAY_MS = 500;
const GIF_PAGE = 24;
const ACK_TIMEOUT_MS = 6000; // chờ server xác nhận đã nhận tin
const RECALL_WINDOW_MS = 5 * 60 * 1000; // chỉ thu hồi được trong 5 phút
const UNREAD_DIVIDER_MS = 6000; // vạch "Tin nhắn mới" tự biến mất sau 6s khi quay lại tab
const DRAFT_DELAY_MS = 400;

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const STICKERS = ['🚂', '🍵', '😂', '❤️', '🔥', '🎓', '👍', '🥹', '😭', '💀', '🫡', '📚', '☕', '🍜'];

// Chỉ hiển thị GIF đến từ Giphy để tránh ảnh/tracker lạ do người khác gửi
const GIPHY_HOST = /^https:\/\/([a-z0-9-]+\.)*giphy\.com\//i;

// Giá trị mặc định khi component được dùng độc lập (không có Hub cấp presence)
const FALLBACK_PRESENCE = { conn: CONN.ONLINE, online: [], statusOf: () => 'online' };

// Bộ lọc nhanh phía client (đồng bộ với lớp 1 của chuyến tàu ngẫu nhiên)
const BAD_WORDS = new Set([
  'ngu', 'địt', 'đụ', 'lồn', 'cặc', 'đm', 'vcl', 'đĩ', 'phò', 'đcm', 'đmm', 'cc', 'cl',
  'lồz', 'cứt', 'bitch', 'fuck', 'shit', 'loz', 'lon', 'cac', 'vkl', 'dkm', 'vl', 'clgt', 'concac',
]);
const VIOLENT_PHRASES = ['đánh chết', 'giết', 'mẹ mày', 'bố mày', 'thằng ranh', 'đấm chết', 'đập chết'];

const isInappropriate = (text) => {
  const clean = text.toLowerCase().replace(/[!@#$%^&*(),.?":{}|<>'\-=_+[\]\\;/~`]/g, '');
  const words = clean.split(/\s+/);
  return words.some((w) => BAD_WORDS.has(w)) || VIOLENT_PHRASES.some((p) => clean.includes(p));
};

/* ---------- LỆNH VUI CHO SINH VIÊN ---------- */
const FOODS = [
  'Cơm tấm sườn bì chả 🍚', 'Bún bò Huế 🍜', 'Bánh mì thịt nướng 🥖', 'Mì cay cấp 3 🌶️',
  'Cơm gà xối mỡ 🍗', 'Phở bò tái 🍲', 'Hủ tiếu Nam Vang 🍜', 'Bún đậu mắm tôm 🥢',
  'Xôi mặn đầu ngõ 🍙', 'Trà chanh + bánh tráng trộn 🍋', 'Cơm chiên dương châu 🍳', 'Mì tôm trứng (cuối tháng) 🥚',
];
const FORTUNES = [
  'Hôm nay deadline sẽ tha cho bạn 🍀', 'Cẩn thận: thầy sắp điểm danh bất ngờ 👀',
  'Có người đang nhớ bạn đấy, nhắn thử đi 💌', 'Hôm nay học 1 tiếng bằng người ta học 3 tiếng 📚',
  'Bạn sẽ gặp may ở cái quán trà chanh quen ☕', 'Nên ngủ sớm, đừng cày đêm nữa 🌙',
  'Điểm giữa kỳ bất ngờ cao hơn dự đoán 🎯', 'Hôm nay xe buýt đến đúng giờ (hiếm lắm!) 🚌',
  'Nhóm bài tập sẽ có người gánh team, có thể là bạn 💪', 'Đi thư viện hôm nay sẽ có chỗ ngồi gần ổ điện 🔌',
];
const GAMES = [
  { cmd: '/xucxac', name: 'Xúc xắc', hint: 'Tung 2 viên xúc xắc', icon: '🎲' },
  { cmd: '/dongxu', name: 'Tung xu', hint: 'Sấp hay ngửa?', icon: '🪙' },
  { cmd: '/an', name: 'Ăn gì?', hint: 'Trưa nay ăn gì nhỉ', icon: '🍜' },
  { cmd: '/boi', name: 'Bói vui', hint: 'Xem vận may hôm nay', icon: '🔮' },
  { cmd: '/chon', name: 'Chọn giúp', hint: 'a | b | c (tự gõ lựa chọn)', icon: '🤔', needsArgs: true },
];

/* Từ điển + bộ phân tích ý định GIF nằm trong utils/gifIntent.js */
const GIF_CHIPS = [
  ['😂 Haha', 'laughing'], ['😭 Buồn', 'sad'], ['😍 Yêu', 'love'], ['🍜 Đói', 'hungry'],
  ['📚 Deadline', 'deadline panic'], ['🎉 Chúc mừng', 'congratulations'], ['😴 Buồn ngủ', 'sleepy'],
];
/** 3 tin nhắn chữ gần nhất của người khác (làm bối cảnh cho gợi ý GIF) */
const recentOthersText = (list, me) => {
  const out = [];
  for (let i = list.length - 1; i >= 0 && out.length < 3; i -= 1) {
    const m = list[i];
    if (m.type === 'text' && m.content && !(m.me || m.sender === me)) out.unshift(String(m.content));
  }
  return out;
};
const toThumb = (g) => {
  const url = g?.images?.fixed_height?.url || g?.images?.original?.url;
  if (!url) return null;
  return { id: g.id, title: g.title || 'GIF', url, preview: g.images?.fixed_height_small?.url || url };
};
const fmtRemain = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const randInt = (n) => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
};
const pick = (arr) => arr[randInt(arr.length)];

/** Trả về { content } để gửi, { error } để báo lỗi, hoặc { help: true } */
function runCommand(raw, me) {
  const [cmdRaw, ...rest] = raw.trim().split(/\s+/);
  const cmd = cmdRaw.toLowerCase();
  const arg = rest.join(' ');

  switch (cmd) {
    case '/xucxac': {
      const n = Math.min(3, Math.max(1, parseInt(arg, 10) || 2));
      const rolls = Array.from({ length: n }, () => randInt(6) + 1);
      const sum = rolls.reduce((a, b) => a + b, 0);
      return { content: `🎲 ${me} tung ${n} xúc xắc: ${rolls.join(' · ')} (tổng ${sum})` };
    }
    case '/dongxu':
      return { content: `🪙 ${me} tung đồng xu: ${randInt(2) ? 'NGỬA' : 'SẤP'}!` };
    case '/an':
      return { content: `🍜 Trưa nay ${me} nên ăn: ${pick(FOODS)}` };
    case '/boi':
      return { content: `🔮 ${me}: ${pick(FORTUNES)}` };
    case '/chon': {
      const opts = arg.split('|').map((s) => s.trim()).filter(Boolean);
      if (opts.length < 2) return { error: 'Cú pháp: /chon học bài | ngủ tiếp | đi cà phê' };
      return { content: `🤔 ${me} nhờ Ga chọn giúp (${opts.length} lựa chọn): ${pick(opts)}` };
    }
    case '/help':
      return { help: true };
    default:
      return { error: 'Lệnh không tồn tại. Gõ /help để xem danh sách lệnh.' };
  }
}

/* ==========================================================
   TIỆN ÍCH
   ========================================================== */
const capMessages = (arr) => (arr.length > MAX_MESSAGES ? arr.slice(-MAX_MESSAGES) : arr);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const timeOf = (ts) => new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const dayKey = (ts) => new Date(ts).toDateString();
const dayLabel = (ts) => {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Hôm nay';
  if (d.toDateString() === yesterday.toDateString()) return 'Hôm qua';
  return d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' });
};
const colorOf = (name = '') => {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 52% 42%)`;
};
const initialOf = (name) => (name ? name.charAt(0).toUpperCase() : '?');
const previewOf = (m) => {
  if (m.deleted) return '🚫 Tin nhắn đã thu hồi';
  if (m.type === 'gif') return '🖼️ GIF';
  if (m.type === 'sticker') return m.content;
  return String(m.content || '').slice(0, 90);
};

/* ---------- Lưu cục bộ: lịch sử khung chat + bản nháp (theo tài khoản) ---------- */
const historyKey = (me) => `tc_chat_history_${me}`;
const draftKey = (me) => `tc_chat_draft_${me}`;

const loadHistory = (me) => {
  if (!me) return [];
  try {
    const arr = JSON.parse(sessionStorage.getItem(historyKey(me)) || '[]');
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((m) => m && typeof m.id === 'string' && m.createdAt)
      // tin đang "gửi" lúc F5 thì không biết kết quả → đánh dấu lỗi để người dùng chủ động gửi lại
      .map((m) => (m.status === 'sending' ? { ...m, status: 'failed' } : m));
  } catch {
    return [];
  }
};
const saveHistory = (me, list) => {
  if (!me) return;
  try {
    const keep = list.filter((m) => m.type !== 'system').slice(-HISTORY_KEEP);
    sessionStorage.setItem(historyKey(me), JSON.stringify(keep));
  } catch {
    /* hết dung lượng / chế độ riêng tư – bỏ qua */
  }
};
const loadDraft = (me) => {
  try {
    return localStorage.getItem(draftKey(me)) || '';
  } catch {
    return '';
  }
};
const saveDraft = (me, text) => {
  try {
    if (text) localStorage.setItem(draftKey(me), text);
    else localStorage.removeItem(draftKey(me));
  } catch {
    /* bỏ qua */
  }
};

const STATUS_TEXT = { online: 'Đang hoạt động', away: 'Vắng mặt' };

/* ==========================================================
   COMPONENT CHÍNH
   ========================================================== */
export default function GlobalChatRoom({
  socket,
  currentUser,
  onOpenProfile,
  presence = FALLBACK_PRESENCE,
  active = true,
  onUnreadChange,
}) {
  const me = typeof currentUser === 'string' ? currentUser : currentUser?.username || '';
  const { conn, online: uniqueOnline, statusOf } = presence;
  const connOk = conn === CONN.ONLINE;

  const [messages, setMessages] = useState(() => loadHistory(me));
  const [input, setInput] = useState(() => loadDraft(me));
  const [replyTo, setReplyTo] = useState(null);
  const [panel, setPanel] = useState(null); // null | 'emoji' | 'gif' | 'games'
  const [gameLast, setGameLast] = useState(0);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [suggestOn, setSuggestOn] = useState(() => {
    try {
      return localStorage.getItem('tc_gif_suggest') !== 'off';
    } catch {
      return true;
    }
  });
  const [suggest, setSuggest] = useState({ q: '', items: [], loading: false });
  const [suggestDismissed, setSuggestDismissed] = useState('');
  const [gifQuery, setGifQuery] = useState('');
  const [gifItems, setGifItems] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState('');
  const [gifOffset, setGifOffset] = useState(0);
  const [gifHasMore, setGifHasMore] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [soundOn, setSoundOn] = useState(() => {
    try {
      return localStorage.getItem('tc_sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [notice, setNotice] = useState('');
  const [newCount, setNewCount] = useState(0);
  const [scrolledUp, setScrolledUp] = useState(false);
  const [activeMsg, setActiveMsg] = useState(null);
  const [mention, setMention] = useState(null); // { query, start }
  const [mentionIdx, setMentionIdx] = useState(0);
  const [unread, setUnread] = useState(0); // số tin đến khi đang ở tab khác
  const [unreadFromId, setUnreadFromId] = useState(null); // tin đầu tiên chưa đọc → đặt vạch ngăn

  const scroller = useRef(null);
  const inputRef = useRef(null);
  const searchRef = useRef(null);
  const composerRef = useRef(null);
  const atBottomRef = useRef(true);
  const lastIdRef = useRef(null);
  const lastSentRef = useRef(0);
  const typingSentRef = useRef(0);
  const typingStopRef = useRef(null);
  const noticeTimer = useRef(null);
  const unreadTimer = useRef(null);
  const prevOnlineRef = useRef(null);
  const prevConnRef = useRef(conn);
  const soundOnRef = useRef(soundOn);
  const activeRef = useRef(active);
  const audioCtxRef = useRef(null);
  const baseTitleRef = useRef('');
  const unreadTitleRef = useRef(0);
  const gifCacheRef = useRef(new Map());
  const gifReqRef = useRef(0);

  soundOnRef.current = soundOn;
  activeRef.current = active;

  /* ---------- helpers ---------- */
  const flash = useCallback((text) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 2600);
  }, []);

  const pushSystem = useCallback((content) => {
    setMessages((prev) => capMessages([...prev, { id: generateUUID(), type: 'system', content, createdAt: Date.now() }]));
  }, []);

  const beep = useCallback(() => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.04;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      /* trình duyệt chặn âm thanh – bỏ qua */
    }
  }, []);

  const patchMessage = useCallback((id, patch) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const applyReaction = useCallback((id, emoji, user, action) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const reactions = { ...(m.reactions || {}) };
        const set = new Set(reactions[emoji] || []);
        if (action === 'remove') set.delete(user);
        else set.add(user);
        if (set.size) reactions[emoji] = [...set];
        else delete reactions[emoji];
        return { ...m, reactions };
      })
    );
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    setNewCount(0);
  }, []);

  /* ---------- SOCKET: tin nhắn, đang gõ, cảm xúc, thu hồi ----------
     Việc khai báo "trực tuyến" đã chuyển lên Hub (usePresence) nên ở đây
     KHÔNG còn emit join/leave nữa → đổi tab hay mở lại tab không làm mất trạng thái online. */
  useEffect(() => {
    if (!socket) return undefined;

    const onMsg = (data) => {
      if (!data) return;
      const msg = {
        ...data,
        id: data.id || generateUUID(),
        sender: data.sender || 'Ẩn danh',
        type: data.type || 'text',
        createdAt: data.createdAt || Date.now(),
      };
      setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : capMessages([...prev, msg])));

      if (msg.sender === me) return;
      const mentioned = msg.type === 'text' && me && String(msg.content).toLowerCase().includes(`@${me.toLowerCase()}`);

      if (!activeRef.current) {
        // đang ở tab Confession: đếm tin chưa đọc + đánh dấu điểm bắt đầu chưa đọc
        setUnread((c) => c + 1);
        setUnreadFromId((cur) => cur || msg.id);
      } else if (!atBottomRef.current) {
        setNewCount((c) => c + 1);
      }
      if (document.hidden) {
        unreadTitleRef.current += 1;
        document.title = `(${unreadTitleRef.current}) ${baseTitleRef.current}`;
      }
      if (soundOnRef.current && (document.hidden || !activeRef.current || mentioned)) beep();
    };

    const onTyping = (data) => {
      if (!data?.user || data.user === me) return;
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (data.typing) next[data.user] = Date.now() + TYPING_TTL_MS;
        else delete next[data.user];
        return next;
      });
    };

    const onReaction = (data) => {
      if (!data?.messageId || !data.emoji || data.user === me) return;
      applyReaction(data.messageId, data.emoji, data.user, data.action === 'remove' ? 'remove' : 'add');
    };

    // Thu hồi: chỉ chấp nhận khi đúng người gửi gốc (chống giả mạo ở phía client)
    const onDelete = (data) => {
      if (!data?.messageId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId && m.sender === data.user
            ? { ...m, deleted: true, type: 'text', content: '', reactions: {} }
            : m
        )
      );
    };

    socket.on('chat_all_message', onMsg);
    socket.on('chat_all_typing', onTyping);
    socket.on('chat_all_reaction', onReaction);
    socket.on('chat_all_delete', onDelete);

    return () => {
      socket.off('chat_all_message', onMsg);
      socket.off('chat_all_typing', onTyping);
      socket.off('chat_all_reaction', onReaction);
      socket.off('chat_all_delete', onDelete);
    };
  }, [socket, me, beep, applyReaction]);

  /* ---------- Thông báo hệ thống: ai vừa lên tàu (suy ra từ danh sách online của Hub) ---------- */
  const onlineKey = uniqueOnline.join('\u0001');
  useEffect(() => {
    const list = onlineKey ? onlineKey.split('\u0001') : [];
    const prev = prevOnlineRef.current;
    if (prev && conn === CONN.ONLINE) {
      const joined = list.filter((u) => !prev.includes(u) && u !== me);
      if (joined.length > 0 && joined.length <= 2) pushSystem(`🚂 ${joined.join(', ')} vừa lên tàu`);
    }
    prevOnlineRef.current = list;
  }, [onlineKey, conn, me, pushSystem]);

  /* ---------- Thông báo khi mất / nối lại kết nối ---------- */
  useEffect(() => {
    const was = prevConnRef.current;
    prevConnRef.current = conn;
    if (was === conn) return;
    if (conn === CONN.ONLINE && was !== CONN.CONNECTING) pushSystem('✅ Đã kết nối lại với Ga');
    if ((conn === CONN.RECONNECTING || conn === CONN.OFFLINE) && was === CONN.ONLINE) pushSystem('⚠️ Mất kết nối, đang thử lại...');
  }, [conn, pushSystem]);

  /* ---------- Dọn "đang gõ" quá hạn ---------- */
  useEffect(() => {
    const t = setInterval(() => {
      setTypingUsers((prev) => {
        const now = Date.now();
        const keys = Object.keys(prev);
        const alive = keys.filter((k) => prev[k] > now);
        if (alive.length === keys.length) return prev;
        return Object.fromEntries(alive.map((k) => [k, prev[k]]));
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  /* ---------- Dọn timer khi rời trang ---------- */
  useEffect(
    () => () => {
      clearTimeout(noticeTimer.current);
      clearTimeout(typingStopRef.current);
      clearTimeout(unreadTimer.current);
    },
    []
  );

  /* ---------- Badge tiêu đề tab trình duyệt khi có tin mới lúc ẩn tab ---------- */
  useEffect(() => {
    baseTitleRef.current = document.title;
    const onVisible = () => {
      if (!document.hidden) {
        unreadTitleRef.current = 0;
        document.title = baseTitleRef.current;
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      document.title = baseTitleRef.current;
    };
  }, []);

  /* ---------- Báo số tin chưa đọc lên Hub (badge trên tab) + xử lý khi quay lại tab Chat ---------- */
  useEffect(() => {
    onUnreadChange?.(active ? 0 : unread);
  }, [active, unread, onUnreadChange]);

  useEffect(() => {
    if (!active) return undefined;
    setUnread(0);
    // phần tử bị display:none sẽ mất vị trí cuộn → đưa về cuối nếu trước đó đang ở cuối
    if (atBottomRef.current) requestAnimationFrame(() => scrollToBottom(false));
    clearTimeout(unreadTimer.current);
    unreadTimer.current = setTimeout(() => setUnreadFromId(null), UNREAD_DIVIDER_MS);
    return () => clearTimeout(unreadTimer.current);
  }, [active, scrollToBottom]);

  /* ---------- Lưu lịch sử khung chat (chống mất khi F5) ---------- */
  useEffect(() => {
    const t = setTimeout(() => saveHistory(me, messages), 400);
    return () => clearTimeout(t);
  }, [messages, me]);

  /* ---------- Lưu bản nháp đang gõ dở ---------- */
  const draftDebounced = useDebounce(input, DRAFT_DELAY_MS);
  useEffect(() => {
    saveDraft(me, draftDebounced);
  }, [draftDebounced, me]);

  /* ---------- Phím tắt: Ctrl/Cmd + K mở tìm kiếm (chỉ khi tab Chat đang hiện) ---------- */
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  /* ---------- Đóng popup khi bấm ra ngoài ---------- */
  useEffect(() => {
    if (!panel) return undefined;
    const onDown = (e) => {
      if (composerRef.current && !composerRef.current.contains(e.target)) setPanel(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [panel]);

  /* ---------- Tự cuộn xuống khi có tin mới ---------- */
  const searchActive = searchOpen && search.trim().length > 0;
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.id === lastIdRef.current) return;
    lastIdRef.current = last.id;
    if (searchActive) return;
    if (last.me || last.sender === me || atBottomRef.current) {
      requestAnimationFrame(() => scrollToBottom(true));
    }
  }, [messages, me, searchActive, scrollToBottom]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    atBottomRef.current = atBottom;
    setScrolledUp(!atBottom);
    if (atBottom) setNewCount(0);
  };

  /* ---------- HỒI CHIÊU TRÒ CHƠI (10 phút / lần, lưu theo tài khoản) ---------- */
  useEffect(() => {
    try {
      setGameLast(Number(localStorage.getItem(`tc_game_last_${me}`)) || 0);
    } catch {
      setGameLast(0);
    }
    setNowTick(Date.now());
  }, [me]);

  const gameRemain = Math.max(0, gameLast + GAME_COOLDOWN_MS - nowTick);
  const cooling = gameRemain > 0;
  useEffect(() => {
    if (!cooling) return undefined;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [cooling]);

  const startGameCooldown = () => {
    const t = Date.now();
    setGameLast(t);
    setNowTick(t);
    try {
      localStorage.setItem(`tc_game_last_${me}`, String(t));
    } catch {
      /* bỏ qua */
    }
  };

  /* ---------- GỢI Ý GIF THEO NỘI DUNG ĐANG GÕ (kiểu TikTok) ---------- */
  const debouncedInput = useDebounce(input, GIF_SUGGEST_DELAY_MS);
  const mentionActive = Boolean(mention);
  // 3 tin gần nhất của người khác → để "đồng cảm" khi mình trả lời cụt ("ừ", "vậy hả"...)
  const gifContextRef = useRef([]);
  gifContextRef.current = recentOthersText(messages, me);
  useEffect(() => {
    const intent =
      suggestOn && active && !panel && !mentionActive
        ? analyzeGifIntent(debouncedInput, { context: gifContextRef.current })
        : null;
    const q = intent?.query || '';
    if (!q) {
      setSuggest((s) => (s.q || s.items.length ? { q: '', items: [], loading: false } : s));
      return undefined;
    }
    const cached = gifCacheRef.current.get(q);
    if (cached) {
      setSuggest({ q, intent, items: personalizeGifs(intent.topic, cached), loading: false });
      return undefined;
    }
    let cancelled = false;
    setSuggest({ q, intent, items: [], loading: true });
    searchGifs(q, { offset: 0, limit: 12 })
      .then((res) => {
        if (cancelled) return;
        const items = res.data.map(toThumb).filter(Boolean);
        gifCacheRef.current.set(q, items);
        setSuggest({ q, intent, items: personalizeGifs(intent.topic, items), loading: false });
      })
      .catch((err) => {
        console.error('❌ [GIF gợi ý] Giphy lỗi:', err?.message || err);
        if (!cancelled) setSuggest({ q, intent, items: [], loading: false, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedInput, suggestOn, active, panel, mentionActive]);

  /* ---------- BỘ CHỌN GIF ---------- */
  const debGifQuery = useDebounce(gifQuery, 450);
  const loadGifs = useCallback(async (q, offset, append) => {
    const reqId = ++gifReqRef.current;
    setGifLoading(true);
    setGifError('');
    try {
      const mapped = topicOf(q) || q.trim();
      const opts = { offset, limit: GIF_PAGE };
      const res = mapped ? await searchGifs(mapped, opts) : await trendingGifs(opts);
      if (reqId !== gifReqRef.current) return;
      const items = res.data.map(toThumb).filter(Boolean);
      setGifItems((prev) => (append ? [...prev, ...items] : items));
      setGifOffset(offset + res.data.length);
      const p = res.pagination;
      setGifHasMore(p ? p.offset + p.count < p.total_count : res.data.length === GIF_PAGE);
    } catch (err) {
      console.error('❌ [Bộ chọn GIF] Giphy lỗi:', err?.message || err);
      if (reqId === gifReqRef.current) {
        setGifError('Không tải được GIF. Kiểm tra khóa Giphy (VITE_GIPHY_KEY) và kết nối mạng.');
      }
    } finally {
      if (reqId === gifReqRef.current) setGifLoading(false);
    }
  }, []);
  useEffect(() => {
    if (panel === 'gif') loadGifs(debGifQuery, 0, false);
  }, [panel, debGifQuery, loadGifs]);

  /* ---------- Dữ liệu dẫn xuất ---------- */
  const view = useMemo(() => {
    if (!searchActive) return messages;
    const q = search.trim().toLowerCase();
    return messages.filter(
      (m) =>
        m.type !== 'system' &&
        !m.deleted &&
        (String(m.content).toLowerCase().includes(q) || String(m.sender).toLowerCase().includes(q))
    );
  }, [messages, search, searchActive]);

  // Tin cuối cùng của mình → chỉ hiện "Đã gửi" ở đó (giống Messenger)
  const lastMineId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if ((m.me || m.sender === me) && m.type !== 'system' && m.type !== 'game') return m.id;
    }
    return null;
  }, [messages, me]);

  // Regex nhận diện link + @tên (dùng tên đang online và người đã nhắn)
  const richRe = useMemo(() => {
    const names = [...new Set([...uniqueOnline, me, ...messages.map((m) => m.sender)])]
      .filter((n) => n && n !== 'Ẩn danh')
      .sort((a, b) => b.length - a.length)
      .map(escapeRe);
    const url = 'https?:\\/\\/[^\\s<>"\']*[^\\s<>"\'.,;:!?)]';
    return new RegExp(names.length ? `(${url})|(@(?:${names.join('|')}))` : `(${url})`, 'gi');
  }, [uniqueOnline, messages, me]);

  const renderRich = (text) => {
    const out = [];
    let last = 0;
    let k = 0;
    for (const mt of String(text).matchAll(richRe)) {
      if (mt.index > last) out.push(text.slice(last, mt.index));
      if (mt[1]) {
        out.push(
          <a key={k++} className="tcc-link" href={mt[1]} target="_blank" rel="noopener noreferrer nofollow">
            {mt[1]}
          </a>
        );
      } else if (mt[2]) {
        const isMe = mt[2].slice(1).toLowerCase() === me.toLowerCase();
        out.push(
          <span key={k++} className={`tcc-mention ${isMe ? 'tcc-mention--me' : ''}`}>
            {mt[2]}
          </span>
        );
      }
      last = mt.index + mt[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  };

  const mentionOptions = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return uniqueOnline.filter((u) => u !== me && u.toLowerCase().includes(q)).slice(0, 6);
  }, [mention, uniqueOnline, me]);

  const showSuggest =
    suggestOn &&
    !panel &&
    !mentionActive &&
    input.trim().length >= 2 &&
    suggestDismissed !== debouncedInput &&
    (suggest.loading || suggest.items.length > 0 || suggest.error);

  const typingNames = Object.keys(typingUsers);
  const typingText =
    typingNames.length === 0
      ? ''
      : typingNames.length === 1
        ? `${typingNames[0]} đang gõ...`
        : typingNames.length === 2
          ? `${typingNames[0]} và ${typingNames[1]} đang gõ...`
          : 'Nhiều người đang gõ...';

  /* ---------- Hành động ---------- */
  const stopTyping = () => {
    clearTimeout(typingStopRef.current);
    if (typingSentRef.current) {
      socket?.emit('chat_all_typing', { user: me, typing: false });
      typingSentRef.current = 0;
    }
  };

  /**
   * Gửi payload lên server kèm xác nhận (ack) – giống cơ chế "đã gửi / gửi lỗi" của Messenger, Zalo.
   * - Server mới: trả ack { ok: true } / { ok: false, error } → đổi trạng thái chính xác.
   * - Server cũ (không ack): hết thời gian chờ nhưng socket vẫn nối → coi như đã gửi.
   * - Mất kết nối giữa chừng → "failed" để người dùng bấm gửi lại.
   */
  const deliver = useCallback(
  (payload) => {
    if (!socket || !socket.connected) return false;

    // Nếu socket.io-client có hỗ trợ .timeout() (phiên bản v4.4.0+)
    if (typeof socket.timeout === 'function') {
      socket.timeout(ACK_TIMEOUT_MS).emit('send_chat_all', payload, (err, res) => {
        if (err) {
          patchMessage(payload.id, { status: socket.connected ? 'sent' : 'failed' });
          return;
        }
        if (res && res.ok === false) {
          patchMessage(payload.id, { status: 'failed', error: res.error || 'Máy chủ từ chối tin nhắn' });
          flash(res.error || 'Máy chủ từ chối tin nhắn');
          return;
        }
        patchMessage(payload.id, { status: 'sent', error: undefined });
      });
    } else {
      // Fallback tự đếm timeout cho các phiên bản socket.io-client cũ
      let acked = false;
      const timer = setTimeout(() => {
        if (!acked) {
          patchMessage(payload.id, { status: socket.connected ? 'sent' : 'failed' });
        }
      }, ACK_TIMEOUT_MS);

      socket.emit('send_chat_all', payload, (res) => {
        acked = true;
        clearTimeout(timer);
        if (res && res.ok === false) {
          patchMessage(payload.id, { status: 'failed', error: res.error || 'Máy chủ từ chối tin nhắn' });
          flash(res.error || 'Máy chủ từ chối tin nhắn');
          return;
        }
        patchMessage(payload.id, { status: 'sent', error: undefined });
      });
    }
    return true;
  },
  [socket, patchMessage, flash]
);

  /** Trả về true nếu tin đã được gửi đi */
  const send = (rawContent, type = 'text', opts = {}) => {
    if (!socket) return false;
    const content = type === 'text' ? normalizeChatText(rawContent) : rawContent;
    if (!content) return false;

    if (!connOk || !socket.connected) {
      flash('📡 Chưa kết nối tới máy chủ, thử lại sau giây lát nhé');
      return false;
    }

    const now = Date.now();
    if (now - lastSentRef.current < SEND_COOLDOWN_MS) {
      flash('Từ từ thôi, chậm lại một chút nhé ⏳');
      return false;
    }
    if (type === 'text') {
      if (content.length > MAX_LEN) {
        flash(`Tin nhắn tối đa ${MAX_LEN} ký tự`);
        return false;
      }
      if (isInappropriate(content)) {
        flash('🛑 Tin nhắn chứa ngôn từ không phù hợp, vui lòng giao tiếp văn minh');
        return false;
      }
    }

    lastSentRef.current = now;
    const payload = { id: generateUUID(), sender: me, content, type, replyTo, createdAt: now };
    // hiện ngay (optimistic UI) với trạng thái "đang gửi", chờ ack để chốt
    setMessages((prev) => capMessages([...prev, { ...payload, me: true, status: 'sending' }]));
    deliver(payload);
    setPanel(null);
    if (!opts.keepInput) {
      setInput('');
      setReplyTo(null);
      setMention(null);
      stopTyping();
    }
    return true;
  };

  /** Gửi lại tin bị lỗi (giữ nguyên id nên server/máy khác không bị trùng) */
  const retry = (m) => {
    if (!connOk || !socket?.connected) {
      flash('📡 Chưa có kết nối, chưa thể gửi lại');
      return;
    }
    const { me: _me, status: _status, error: _error, reactions: _reactions, ...payload } = m;
    patchMessage(m.id, { status: 'sending', error: undefined });
    deliver(payload);
  };

  const canRecall = (m) =>
    (m.me || m.sender === me) &&
    !m.deleted &&
    m.status !== 'failed' &&
    m.status !== 'sending' &&
    (m.type === 'text' || m.type === 'gif' || m.type === 'sticker') &&
    Date.now() - m.createdAt < RECALL_WINDOW_MS;

  const recall = (m) => {
    if (!canRecall(m)) {
      flash('Chỉ thu hồi được tin của bạn trong vòng 5 phút');
      return;
    }
    socket?.emit('chat_all_delete', { messageId: m.id, user: me });
    patchMessage(m.id, { deleted: true, type: 'text', content: '', reactions: {} });
    setActiveMsg(null);
  };

  const handleCommand = (text) => {
    const res = runCommand(text, me);
    if (res.help) {
      pushSystem(
        [
          'Trò chơi của Ga Trà Chanh (mỗi người 1 lần / 10 phút):',
          ...GAMES.map((g) => `${g.icon} ${g.cmd} – ${g.hint}`),
          '💡 Gõ @tên để nhắc ai đó • Ctrl+K để tìm tin nhắn',
        ].join('\n')
      );
      setInput('');
      return;
    }
    if (res.error) {
      flash(res.error);
      return;
    }
    const remain = gameLast + GAME_COOLDOWN_MS - Date.now();
    if (remain > 0) {
      flash(`🎮 Trò chơi đang hồi chiêu, còn ${fmtRemain(remain)}`);
      return;
    }
    if (send(res.content, 'game')) startGameCooldown();
  };

  const submit = () => {
    const text = input.trim();
    if (!text) return;
    if (text.startsWith('/')) handleCommand(text);
    else send(text);
  };

  const onGameClick = (g) => {
    setPanel(null);
    if (g.needsArgs) {
      setInput(`${g.cmd} `);
      inputRef.current?.focus();
    } else {
      handleCommand(g.cmd);
    }
  };

  /** GIF chọn từ gợi ý: gửi ngay, giữ nguyên chữ đang gõ (như TikTok) */
  const sendGif = (g, opts = {}) => {
    if (!g?.url) return;
    const { topic, ...sendOpts } = opts;
    if (send(g.url, 'gif', sendOpts)) learnGif(topic, g); // nhớ gu GIF theo từng tâm trạng
  };

  const insertEmoji = (emoji) => {
    const el = inputRef.current;
    const s = el?.selectionStart ?? input.length;
    const e = el?.selectionEnd ?? s;
    setInput(input.slice(0, s) + emoji + input.slice(e));
    requestAnimationFrame(() => {
      el?.focus();
      const p = s + emoji.length;
      el?.setSelectionRange(p, p);
    });
  };

  const mentionUser = (name) => {
    setInput((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}@${name} `);
    inputRef.current?.focus();
  };

  const pickMention = (name) => {
    if (!mention) return;
    const before = input.slice(0, mention.start);
    const after = input.slice(mention.start + 1 + mention.query.length);
    const next = `${before}@${name} ${after}`;
    setInput(next);
    setMention(null);
    requestAnimationFrame(() => {
      const p = before.length + name.length + 2;
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(p, p);
    });
  };

  const onInputChange = (e) => {
    const value = e.target.value;
    setInput(value);

    const caret = e.target.selectionStart ?? value.length;
    const m = /(^|\s)@([^\s@]{0,20})$/.exec(value.slice(0, caret));
    if (m) {
      setMention({ query: m[2], start: caret - m[2].length - 1 });
      setMentionIdx(0);
    } else {
      setMention(null);
    }

    if (value.trim() && socket?.connected) {
      const now = Date.now();
      if (now - typingSentRef.current > 2000) {
        socket.emit('chat_all_typing', { user: me, typing: true });
        typingSentRef.current = now;
      }
      clearTimeout(typingStopRef.current);
      typingStopRef.current = setTimeout(stopTyping, 2500);
    } else {
      stopTyping();
    }
  };

  const onInputKeyDown = (e) => {
    if (mentionOptions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIdx((i) => (i + 1) % mentionOptions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIdx((i) => (i - 1 + mentionOptions.length) % mentionOptions.length);
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && !isImeComposing(e)) {
        e.preventDefault();
        pickMention(mentionOptions[mentionIdx]);
        return;
      }
      if (e.key === 'Escape') {
        setMention(null);
        return;
      }
    }
    if (e.key === 'Escape' && replyTo) setReplyTo(null);
    if (e.key === 'Enter' && !isImeComposing(e)) {
      e.preventDefault();
      submit();
    }
  };

  const toggleReaction = (m, emoji) => {
    if (m.deleted) return;
    const has = (m.reactions?.[emoji] || []).includes(me);
    const action = has ? 'remove' : 'add';
    applyReaction(m.id, emoji, me, action);
    socket?.emit('react_chat_all', { messageId: m.id, emoji, user: me, action });
  };

  const startReply = (m) => {
    setReplyTo({ id: m.id, sender: m.sender, content: previewOf(m) });
    setActiveMsg(null);
    inputRef.current?.focus();
  };

  const copyText = (m) => {
    navigator.clipboard?.writeText(String(m.content)).then(() => flash('Đã sao chép tin nhắn'));
    setActiveMsg(null);
  };

  const jumpTo = (id) => {
    const el = id ? document.getElementById(`msg-${id}`) : null;
    if (!el) {
      flash('Tin nhắn gốc không còn trong khung chat');
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('tcc-msg--flash');
    setTimeout(() => el.classList.remove('tcc-msg--flash'), 1600);
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    try {
      localStorage.setItem('tc_sound', next ? 'on' : 'off');
    } catch {
      /* bỏ qua */
    }
    flash(next ? '🔔 Đã bật âm báo' : '🔕 Đã tắt âm báo');
  };

  const isMine = (m) => m.me || m.sender === me;

  /* ==========================================================
     RENDER TỪNG TIN NHẮN
     ========================================================== */
  const renderMessage = (m, i) => {
    const prev = view[i - 1];
    const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
    const dayDivider = newDay ? (
      <div className="tcc-day">
        <span>{dayLabel(m.createdAt)}</span>
      </div>
    ) : null;
    const unreadDivider =
      !searchActive && unreadFromId === m.id ? (
        <div className="tcc-unread" role="separator">
          <span>Tin nhắn mới</span>
        </div>
      ) : null;

    if (m.type === 'system') {
      return (
        <Fragment key={m.id}>
          {dayDivider}
          <div className="tcc-sys">{m.content}</div>
        </Fragment>
      );
    }

    if (m.type === 'game') {
      return (
        <Fragment key={m.id}>
          {dayDivider}
          {unreadDivider}
          <div id={`msg-${m.id}`} className="tcc-game">
            {m.content}
            <time>{timeOf(m.createdAt)}</time>
          </div>
        </Fragment>
      );
    }

    const mine = isMine(m);
    const grouped =
      !newDay &&
      prev &&
      prev.type !== 'system' &&
      prev.type !== 'game' &&
      prev.sender === m.sender &&
      !m.replyTo &&
      !unreadDivider &&
      m.createdAt - prev.createdAt < GROUP_GAP_MS;
    const mentioned =
      !m.deleted && m.type === 'text' && !mine && me && String(m.content).toLowerCase().includes(`@${me.toLowerCase()}`);
    const reactions = Object.entries(m.reactions || {});
    const isGif = m.type === 'gif' && GIPHY_HOST.test(String(m.content));

    let body;
    if (m.deleted) {
      body = <div className="tcc-bubble tcc-bubble--deleted">🚫 Tin nhắn đã được thu hồi</div>;
    } else if (m.type === 'sticker') {
      body = <span className="tcc-sticker">{m.content}</span>;
    } else if (isGif) {
      body = <img className="tcc-gif" src={m.content} alt="GIF" loading="lazy" />;
    } else {
      body = (
        <div
          className={`tcc-bubble ${mine ? 'tcc-bubble--me' : 'tcc-bubble--other'} ${m.status === 'failed' ? 'tcc-bubble--failed' : ''} ${m.status === 'sending' ? 'tcc-bubble--sending' : ''}`}
          title={timeOf(m.createdAt)}
          onClick={() => setActiveMsg((cur) => (cur === m.id ? null : m.id))}
        >
          {renderRich(m.type === 'gif' ? '🖼️ (GIF không hợp lệ)' : String(m.content))}
        </div>
      );
    }

    // dòng trạng thái gửi (chỉ cho tin của mình)
    let statusLine = null;
    if (mine && !m.deleted) {
      if (m.status === 'sending') statusLine = <span className="tcc-status-line">Đang gửi...</span>;
      else if (m.status === 'failed') {
        statusLine = (
          <span className="tcc-status-line tcc-status-line--err">
            {m.error || 'Gửi không thành công'} ·{' '}
            <button type="button" className="tcc-retry" onClick={() => retry(m)}>
              Gửi lại
            </button>
          </span>
        );
      } else if (m.id === lastMineId && m.status === 'sent') {
        statusLine = <span className="tcc-status-line">✓ Đã gửi · {timeOf(m.createdAt)}</span>;
      }
    }

    return (
      <Fragment key={m.id}>
        {dayDivider}
        {unreadDivider}
        <div
          id={`msg-${m.id}`}
          className={[
            'tcc-msg',
            mine ? 'tcc-msg--me' : '',
            grouped ? 'tcc-msg--grouped' : '',
            mentioned ? 'tcc-msg--mention' : '',
            activeMsg === m.id ? 'tcc-msg--active' : '',
          ].join(' ')}
        >
          {!mine && (
            <div className="tcc-msg__avatar">
              {!grouped && (
                <button
                  type="button"
                  className="tcc-ava"
                  style={{ background: colorOf(m.sender) }}
                  onClick={() => m.sender !== 'Ẩn danh' && onOpenProfile?.(m.sender)}
                  title={`Xem hồ sơ ${m.sender}`}
                >
                  {initialOf(m.sender)}
                </button>
              )}
            </div>
          )}

          <div className="tcc-msg__col">
            {!mine && !grouped && (
              <span className="tcc-msg__name">
                {m.sender}
                <time>{timeOf(m.createdAt)}</time>
              </span>
            )}

            {m.replyTo && !m.deleted && (
              <button type="button" className="tcc-quote" onClick={() => jumpTo(m.replyTo.id)}>
                <b>↩ {m.replyTo.sender}</b>
                {m.replyTo.content}
              </button>
            )}

            <div className="tcc-line">
              {body}
              {!m.deleted && (
                <div className="tcc-tools">
                  {QUICK_REACTIONS.map((emo) => (
                    <button key={emo} type="button" className="tcc-tool" onClick={() => toggleReaction(m, emo)} aria-label={`Thả ${emo}`}>
                      {emo}
                    </button>
                  ))}
                  <span className="tcc-tools__sep" />
                  <button type="button" className="tcc-tool tcc-tool--txt" onClick={() => startReply(m)}>
                    ↩ Trả lời
                  </button>
                  {m.type === 'text' && (
                    <button type="button" className="tcc-tool" onClick={() => copyText(m)} aria-label="Sao chép" title="Sao chép">
                      📋
                    </button>
                  )}
                  {canRecall(m) && (
                    <button type="button" className="tcc-tool" onClick={() => recall(m)} aria-label="Thu hồi" title="Thu hồi (trong 5 phút)">
                      🗑️
                    </button>
                  )}
                </div>
              )}
            </div>

            {reactions.length > 0 && (
              <div className="tcc-reacts">
                {reactions.map(([emo, users]) => (
                  <button
                    key={emo}
                    type="button"
                    className={`tcc-react ${users.includes(me) ? 'tcc-react--on' : ''}`}
                    title={users.join(', ')}
                    onClick={() => toggleReaction(m, emo)}
                  >
                    {emo} {users.length}
                  </button>
                ))}
              </div>
            )}

            {statusLine}
          </div>
        </div>
      </Fragment>
    );
  };

  /* ==========================================================
     GIAO DIỆN
     ========================================================== */
  const placeholder = connOk
    ? 'Nhập tin nhắn, gõ @ để nhắc bạn, gõ / để chơi trò chơi...'
    : 'Đang kết nối lại... bạn vẫn có thể soạn tin';

  return (
    <div className="tcc-root">
      {/* ================= CỘT 1: ONLINE ================= */}
      <aside className="tcc-online" aria-label="Danh sách trực tuyến">
        <div className="tcc-online__head">
          <span className={`tcc-dot ${connOk ? '' : 'tcc-dot--off'}`} />
          {connOk ? `Trực tuyến (${uniqueOnline.length})` : 'Đang kết nối...'}
        </div>
        <div className="tcc-online__list">
          {uniqueOnline.map((u) => {
            const st = statusOf(u);
            return (
              <div key={u} className="tcc-online__item" title={`${u} • ${STATUS_TEXT[st] || STATUS_TEXT.online}`}>
                <span className={`tcc-presence tcc-presence--${st}`} aria-label={STATUS_TEXT[st] || STATUS_TEXT.online} />
                <UserChip username={u} onOpen={onOpenProfile} />
                {u === me && <span className="tcc-you">Bạn</span>}
                {u !== me && (
                  <button type="button" className="tcc-at-btn" onClick={() => mentionUser(u)} title={`Nhắc ${u}`}>
                    @
                  </button>
                )}
              </div>
            );
          })}
          {uniqueOnline.length === 0 && (
            <div className="tcc-empty">
              <span>📡</span>
              Đang tìm kết nối...
            </div>
          )}
        </div>
      </aside>

      {/* ================= CỘT 2: KHUNG CHAT ================= */}
      <section className="tcc-main">
        <header className="tcc-head">
          <h3 className="tcc-head__title"># ga-tan-gau</h3>
          <span className="tcc-head__sub">Chat chung toàn Phân hiệu</span>
          <span className="tcc-head__chip">
            <span className="tcc-dot" /> {uniqueOnline.length}
          </span>
          <span className="tcc-head__space" />
          {searchOpen && (
            <input
              ref={searchRef}
              autoFocus
              className="tcc-search"
              placeholder="Tìm tin nhắn... (Ctrl+K)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && (setSearchOpen(false), setSearch(''))}
            />
          )}
          <button
            type="button"
            className={`tcc-icon-btn ${searchOpen ? 'tcc-icon-btn--on' : ''}`}
            onClick={() => {
              setSearchOpen((v) => !v);
              setSearch('');
            }}
            title="Tìm tin nhắn (Ctrl+K)"
            aria-label="Tìm tin nhắn"
          >
            🔍
          </button>
          <button type="button" className="tcc-icon-btn" onClick={toggleSound} title={soundOn ? 'Tắt âm báo' : 'Bật âm báo'} aria-label="Bật/tắt âm báo">
            {soundOn ? '🔔' : '🔕'}
          </button>
        </header>

        <div className="tcc-scroll" ref={scroller} onScroll={onScroll} role="log" aria-live="polite" aria-relevant="additions">
          <div className="tcc-welcome">
            <span>Chào mừng bạn đến với Ga tán gẫu UTC2 👋</span>
          </div>
          {searchActive && view.length === 0 && <div className="tcc-sys">Không tìm thấy tin nhắn nào khớp "{search}"</div>}
          {view.map(renderMessage)}
        </div>

        {scrolledUp && !searchActive && (
          <button type="button" className="tcc-jump" onClick={() => scrollToBottom(true)}>
            {newCount > 0 ? `↓ ${newCount} tin mới` : '↓ Xuống cuối'}
          </button>
        )}

        <div className="tcc-typing">{typingText}</div>

        {replyTo && (
          <div className="tcc-reply">
            <div className="tcc-reply__text">
              <b>Đang trả lời {replyTo.sender}:</b> {replyTo.content}
            </div>
            <button type="button" onClick={() => setReplyTo(null)} aria-label="Hủy trả lời">
              ✕
            </button>
          </div>
        )}

        {/* ---------- Ô SOẠN TIN ---------- */}
        <div className="tcc-composer" ref={composerRef}>
          {notice && <div className="tcc-notice">{notice}</div>}

          {panel === 'emoji' && (
            <div className="tcc-popup">
              <EmojiPicker
                onEmojiClick={(emo) => insertEmoji(emo.emoji)}
                theme="light"
                width={320}
                height={380}
                searchPlaceHolder="Tìm biểu tượng cảm xúc..."
                lazyLoadEmojis
              />
            </div>
          )}
          {panel === 'gif' && (
            <div className="tcc-popup">
              <div className="tcc-gifp">
                <input
                  autoFocus
                  className="tcc-gifp__search"
                  placeholder="Tìm GIF (haha, buồn, deadline...)"
                  value={gifQuery}
                  onChange={(e) => setGifQuery(e.target.value)}
                />
                <div className="tcc-gifp__chips">
                  {GIF_CHIPS.map(([label, q]) => (
                    <button key={q} type="button" className="tcc-gifp__chip" onClick={() => setGifQuery(q)}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="tcc-gifp__grid">
                  {gifItems.map((g) => (
                    <button key={g.id} type="button" className="tcc-gifp__item" onClick={() => sendGif(g)} title={g.title}>
                      <img src={g.preview} alt={g.title} loading="lazy" />
                    </button>
                  ))}
                </div>
                {gifError && <p className="tcc-gifp__msg tcc-gifp__msg--err">{gifError}</p>}
                {gifLoading && <p className="tcc-gifp__msg">Đang tải GIF...</p>}
                {!gifLoading && !gifError && gifItems.length === 0 && <p className="tcc-gifp__msg">Không có GIF phù hợp</p>}
                {gifHasMore && !gifLoading && (
                  <button type="button" className="tcc-gifp__more" onClick={() => loadGifs(debGifQuery, gifOffset, true)}>
                    Tải thêm
                  </button>
                )}
                <div className="tcc-gifp__foot">Powered by GIPHY</div>
              </div>
            </div>
          )}

          {panel === 'games' && (
            <div className="tcc-popup">
              <div className="tcc-games">
                <div className="tcc-games__head">
                  <b>🎮 Trò chơi</b>
                  <span className={cooling ? 'tcc-games__cd' : 'tcc-games__ready'}>
                    {cooling ? `Hồi chiêu ${fmtRemain(gameRemain)}` : 'Sẵn sàng chơi!'}
                  </span>
                </div>
                <div className="tcc-games__bar">
                  <i style={{ width: `${cooling ? 100 - (gameRemain / GAME_COOLDOWN_MS) * 100 : 100}%` }} />
                </div>
                <p className="tcc-games__note">Mỗi người chơi 1 trò / 10 phút. Kết quả hiện cho cả phòng cùng xem.</p>
                <div className="tcc-games__list">
                  {GAMES.map((g) => (
                    <button key={g.cmd} type="button" className="tcc-game-card" disabled={cooling} onClick={() => onGameClick(g)}>
                      <span className="tcc-game-card__icon">{g.icon}</span>
                      <b>{g.name}</b>
                      <small>{g.hint}</small>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {showSuggest && (
            <div className="tcc-suggest">
              <div className="tcc-suggest__head">
                <span>{suggest.intent?.headline ? `✨ ${suggest.intent.headline}` : `✨ GIF gợi ý cho "${suggest.q}"`}</span>
                <button type="button" onClick={() => setSuggestDismissed(debouncedInput)} aria-label="Đóng gợi ý GIF">
                  ✕
                </button>
              </div>
              <div className="tcc-suggest__row">
                {suggest.loading && <span className="tcc-suggest__hint">Đang chọn GIF hợp tâm trạng...</span>}
                {suggest.error && <span className="tcc-suggest__hint">Không tải được GIF gợi ý, mở Console (F12) để xem lỗi.</span>}
                {suggest.items.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className={`tcc-suggest__item${g.fav ? ' tcc-suggest__item--fav' : ''}`}
                    onClick={() => sendGif(g, { keepInput: true, topic: suggest.intent?.topic })}
                    title={g.fav ? 'GIF bạn hay dùng — bấm để gửi' : 'Bấm để gửi GIF này'}
                  >
                    <img src={g.preview} alt={g.title} loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {mentionOptions.length > 0 && (
            <div className="tcc-mentions" role="listbox">
              <div className="tcc-mentions__title">Nhắc đến</div>
              {mentionOptions.map((u, idx) => (
                <button
                  key={u}
                  type="button"
                  role="option"
                  aria-selected={idx === mentionIdx}
                  className={`tcc-mention-opt ${idx === mentionIdx ? 'tcc-mention-opt--on' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickMention(u);
                  }}
                >
                  <span className="tcc-ava" style={{ background: colorOf(u) }}>
                    {initialOf(u)}
                  </span>
                  {u}
                </button>
              ))}
            </div>
          )}

          <div className="tcc-toolbar">
            <button type="button" className={`tcc-pill ${panel === 'emoji' ? 'tcc-pill--on' : ''}`} onClick={() => setPanel((p) => (p === 'emoji' ? null : 'emoji'))}>
              😀 Emoji
            </button>
            <button type="button" className={`tcc-pill ${panel === 'gif' ? 'tcc-pill--on' : ''}`} onClick={() => setPanel((p) => (p === 'gif' ? null : 'gif'))}>
              🎞️ GIF
            </button>
            <span className="tcc-toolbar__sep" />
            <button
              type="button"
              className={`tcc-pill ${panel === 'games' ? 'tcc-pill--on' : ''} ${cooling ? 'tcc-pill--cool' : ''}`}
              onClick={() => setPanel((p) => (p === 'games' ? null : 'games'))}
              title="Trò chơi (hồi chiêu 10 phút)"
            >
              🎮 Trò chơi{cooling ? ` · ${fmtRemain(gameRemain)}` : ''}
            </button>
            <button
              type="button"
              className={`tcc-pill ${suggestOn ? 'tcc-pill--on' : ''}`}
              onClick={() => {
                const next = !suggestOn;
                setSuggestOn(next);
                try {
                  localStorage.setItem('tc_gif_suggest', next ? 'on' : 'off');
                } catch {
                  /* bỏ qua */
                }
                flash(next ? '✨ Đã bật gợi ý GIF khi gõ' : 'Đã tắt gợi ý GIF');
              }}
              title="Tự gợi ý GIF theo nội dung bạn gõ"
            >
              ✨ Gợi ý GIF
            </button>
            <span className="tcc-toolbar__sep" />
            {STICKERS.map((s) => (
              <button key={s} type="button" className="tcc-stk" onClick={() => send(s, 'sticker')} aria-label={`Gửi sticker ${s}`}>
                {s}
              </button>
            ))}
          </div>

          <div className="tcc-row">
            <input
              ref={inputRef}
              className="tcc-input"
              placeholder={placeholder}
              value={input}
              maxLength={MAX_LEN + 50}
              onChange={onInputChange}
              onKeyDown={onInputKeyDown}
              aria-label="Nhập tin nhắn"
            />
            {input.length > MAX_LEN - 100 && (
              <span className={`tcc-count ${input.length > MAX_LEN ? 'tcc-count--warn' : ''}`}>
                {input.length}/{MAX_LEN}
              </span>
            )}
            <button type="button" className="tcc-send" onClick={submit} disabled={!input.trim() || !connOk}>
              Gửi
            </button>
          </div>
        </div>
      </section>

      {/* ================= CỘT 3: WIDGET ================= */}
      <aside className="tcc-side">
        <div className="tcc-widget">
          <h4>🍵 Ga Trà Chanh</h4>
          <p>Không gian tán gẫu tự do, kết nối sinh viên tại Phân hiệu.</p>
        </div>

        <div className="tcc-widget">
          <h4>🎮 Trò chơi</h4>
          <p className="tcc-widget__cd">{cooling ? `⏳ Hồi chiêu còn ${fmtRemain(gameRemain)}` : '✅ Bạn có thể chơi ngay'}</p>
          <div className="tcc-cmd-list">
            {GAMES.map((g) => (
              <button key={g.cmd} type="button" className="tcc-cmd" disabled={cooling} onClick={() => onGameClick(g)}>
                {g.icon} <code>{g.cmd}</code>
                <span>{g.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="tcc-widget">
          <h4>⚡ Mẹo nhanh</h4>
          <ul>
            <li>Gõ @tên để nhắc ai đó</li>
            <li>Rê chuột vào tin nhắn để thả cảm xúc / trả lời / thu hồi</li>
            <li>Bấm vào trích dẫn để nhảy về tin gốc</li>
            <li>Gõ "haha", "deadline", "buồn"... để nhận GIF gợi ý</li>
            <li>Ctrl+K để tìm lại tin nhắn cũ</li>
            <li>Tin bị lỗi sẽ có nút "Gửi lại"</li>
          </ul>
        </div>

        <div className="tcc-widget">
          <h4>📜 Nội quy</h4>
          <ul>
            <li>Giao tiếp lịch sự, văn minh.</li>
            <li>Không spam link hoặc quảng cáo.</li>
            <li>Vi phạm sẽ bị tạm khóa tài khoản.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}