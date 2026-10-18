import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generateUUID } from '../../utils/deviceId';
import { isImeComposing, normalizeChatText } from '../../utils/normalizeText';
import { loadConfessions, saveConfessions } from '../../data/seedCampus';
import { UserChip } from '../profile/UserProfileDrawer';
import './teachat.css';
import './teachat.extra.css';

/* ==========================================================
   HẰNG SỐ
   ========================================================== */
const MAX_LEN = 1000;
const PAGE_SIZE = 8; // số bài hiển thị mỗi lần ("Xem thêm" để tải tiếp)
const LONG_POST = 320; // bài dài hơn mức này sẽ được thu gọn
const COMMENTS_PREVIEW = 3; // số bình luận hiển thị trước khi bấm "Xem tất cả"
const POST_COOLDOWN_MS = 15000; // chống spam đăng bài
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000; // chặn đăng lại nội dung y hệt trong 10 phút
const UNDO_MS = 6000; // thời gian cho phép "Hoàn tác" sau khi xóa
const NOW_TICK_MS = 30000; // làm mới "x phút trước"
const CHANNEL = 'tc_confession_sync';
const DRAFT_KEY = (me) => `tc_confession_draft_${me || 'guest'}`;
const ANON_KEY = 'tc_confession_anon';
const REPORTED_KEY = 'tc_confession_reported';
const SORT_KEY = 'tc_confession_sort';

const REACTIONS = [
  { id: 'like', icon: '👍', label: 'Thích' },
  { id: 'love', icon: '❤️', label: 'Yêu thích' },
  { id: 'haha', icon: '😂', label: 'Haha' },
  { id: 'wow', icon: '😮', label: 'Wow' },
  { id: 'sad', icon: '😢', label: 'Buồn' },
];

const EMPTY_REACTIONS = { like: 0, love: 0, haha: 0, wow: 0, sad: 0 };

const SORTS = [
  { id: 'new', label: '🕒 Mới nhất' },
  { id: 'hot', label: '🔥 Nổi bật' },
];

/* ---------- tiện ích ---------- */
const formatTime = (ts, withDate = true) =>
    new Date(ts).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      ...(withDate ? { day: '2-digit', month: '2-digit' } : {}),
    });

/** "Vừa xong", "5 phút trước", "3 giờ trước"... như Facebook; quá 7 ngày thì hiện ngày giờ cụ thể */
const relTime = (ts, now) => {
  const diff = Math.max(0, now - ts);
  const s = Math.floor(diff / 1000);
  if (s < 45) return 'Vừa xong';
  const m = Math.floor(s / 60);
  if (m < 60) return `${Math.max(1, m)} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} ngày trước`;
  return formatTime(ts);
};

const countComments = (list = []) =>
    list.reduce((sum, c) => sum + (c.deleted ? 0 : 1) + countComments(c.replies), 0);

/** Thêm bình luận vào gốc (parentId = null) hoặc vào đúng nút cha ở bất kỳ độ sâu nào. */
const insertComment = (list, parentId, node) => {
  if (!parentId) return [...list, node];
  return list.map((c) =>
      c.id === parentId
          ? { ...c, replies: [...(c.replies || []), node] }
          : { ...c, replies: insertComment(c.replies || [], parentId, node) }
  );
};

/** Xóa bình luận: nếu còn bình luận con thì giữ khung "đã xóa" để không mất mạch trả lời */
const removeComment = (list, id) =>
    list
        .map((c) => {
          if (c.id === id) {
            if ((c.replies || []).length > 0) return { ...c, deleted: true, text: '', likes: [] };
            return null;
          }
          return { ...c, replies: removeComment(c.replies || [], id) };
        })
        .filter(Boolean);

const toggleCommentLike = (list, id, user) =>
    list.map((c) => {
      if (c.id === id) {
        const likes = new Set(c.likes || []);
        if (likes.has(user)) likes.delete(user);
        else likes.add(user);
        return { ...c, likes: [...likes] };
      }
      return { ...c, replies: toggleCommentLike(c.replies || [], id, user) };
    });

const getName = (user) => (typeof user === 'string' ? user : user?.username || '');
const getInitial = (name) => (name ? name.charAt(0).toUpperCase() : 'U');

const isOwner = (post, me) => Boolean(me) && (post.ownerId === me || post.authorId === me);

/** Điểm "nổi bật": tương tác càng nhiều càng cao, bài càng cũ càng giảm (giống thuật toán Hacker News) */
const hotScore = (post, now) => {
  const react = Object.values(post.reactions || {}).reduce((a, b) => a + b, 0);
  const score = react * 2 + countComments(post.comments) * 3 + 1;
  const hours = Math.max(0, (now - post.createdAt) / 3600000);
  return score / (hours + 2) ** 1.25;
};

const readJSON = (key, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
};
const writeJSON = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* bỏ qua */
  }
};

/** Tách link và #hashtag trong nội dung để hiển thị đẹp + bấm lọc theo tag */
const RICH_RE = /(https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)])|(#[\p{L}\p{N}_]{2,30})/gu;
const renderRich = (text, onTag) => {
  const out = [];
  let last = 0;
  let k = 0;
  for (const mt of String(text).matchAll(RICH_RE)) {
    if (mt.index > last) out.push(text.slice(last, mt.index));
    if (mt[1]) {
      out.push(
          <a key={k++} className="tc-link" href={mt[1]} target="_blank" rel="noopener noreferrer nofollow">
            {mt[1]}
          </a>
      );
    } else {
      out.push(
          <button key={k++} type="button" className="tc-tag" onClick={() => onTag?.(mt[2].toLowerCase())}>
            {mt[2]}
          </button>
      );
    }
    last = mt.index + mt[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
};

/** Hook: đồng hồ "bây giờ" cập nhật định kỳ để thời gian tương đối tự chạy */
function useNow(interval = NOW_TICK_MS) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

/* ==========================================================
   FEED
   ========================================================== */
export default function ConfessionFeed({ currentUser, onOpenProfile, onReport }) {
  const [posts, setPosts] = useState(() => loadConfessions());
  const [sort, setSort] = useState(() => readJSON(SORT_KEY, 'new'));
  const [onlyMine, setOnlyMine] = useState(false);
  const [tag, setTag] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [reported, setReported] = useState(() => new Set(readJSON(REPORTED_KEY, [])));
  const [toast, setToast] = useState(null); // { text, undo? }
  const myName = getName(currentUser);
  const now = useNow();

  const lastPostRef = useRef(0);
  const toastTimer = useRef(null);
  const channelRef = useRef(null);
  const postsRef = useRef(posts);
  postsRef.current = posts;

  /* ---------- Toast ---------- */
  const showToast = useCallback((text, undo) => {
    clearTimeout(toastTimer.current);
    setToast({ text, undo });
    toastTimer.current = setTimeout(() => setToast(null), undo ? UNDO_MS : 2600);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  /* ---------- Đồng bộ nhiều tab: tab này đổi → tab khác nạp lại ---------- */
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    const ch = new BroadcastChannel(CHANNEL);
    channelRef.current = ch;
    ch.onmessage = () => setPosts(loadConfessions());
    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, []);

  const persist = useCallback((next) => {
    setPosts(next);
    saveConfessions(next);
    channelRef.current?.postMessage('changed');
  }, []);

  /* ---------- Hành động ---------- */
  const publish = ({ content, anonymous }) => {
    const t = Date.now();
    const wait = POST_COOLDOWN_MS - (t - lastPostRef.current);
    if (wait > 0) return { ok: false, error: `Bạn đăng hơi nhanh, đợi ${Math.ceil(wait / 1000)}s nữa nhé ⏳` };

    const dup = postsRef.current.some(
        (p) => isOwner(p, myName) && p.content === content && t - p.createdAt < DUPLICATE_WINDOW_MS
    );
    if (dup) return { ok: false, error: 'Bạn vừa đăng nội dung này rồi, tránh đăng trùng nhé' };

    const post = {
      id: generateUUID(),
      anonymous,
      author: anonymous ? 'Ẩn danh' : myName,
      authorId: anonymous ? null : myName,
      // ownerId chỉ dùng để biết "bài này của tôi" (để xóa) – không bao giờ hiển thị ra giao diện.
      // Khi chuyển sang server thật, hãy giữ trường này ở phía server, đừng trả về cho người khác.
      ownerId: myName || null,
      content,
      createdAt: t,
      reactions: { ...EMPTY_REACTIONS },
      myReaction: null,
      comments: [],
    };
    lastPostRef.current = t;
    persist([post, ...postsRef.current]);
    setSort('new');
    setOnlyMine(false);
    setTag('');
    showToast('Đã đăng confession 🎉');
    return { ok: true };
  };

  const updatePost = (next) => persist(postsRef.current.map((p) => (p.id === next.id ? next : p)));

  const deletePost = (post) => {
    const list = postsRef.current;
    const index = list.findIndex((p) => p.id === post.id);
    if (index < 0) return;
    persist(list.filter((p) => p.id !== post.id));
    showToast('Đã xóa bài viết', () => {
      const cur = postsRef.current;
      if (cur.some((p) => p.id === post.id)) return;
      const copy = [...cur];
      copy.splice(Math.min(index, copy.length), 0, post);
      persist(copy);
      showToast('Đã khôi phục bài viết');
    });
  };

  const reportPost = (post) => {
    const next = new Set(reported);
    next.add(post.id);
    setReported(next);
    writeJSON(REPORTED_KEY, [...next]);
    onReport?.(post);
    showToast('Cảm ơn bạn đã báo cáo. Bài viết này sẽ được ẩn khỏi bảng tin của bạn');
  };

  const copyPost = (post) => {
    navigator.clipboard?.writeText(post.content).then(
        () => showToast('Đã sao chép nội dung bài viết'),
        () => showToast('Không sao chép được, hãy thử lại')
    );
  };

  const changeSort = (id) => {
    setSort(id);
    writeJSON(SORT_KEY, id);
    setVisible(PAGE_SIZE);
  };

  /* ---------- Danh sách hiển thị: lọc → sắp xếp → cắt trang ---------- */
  const filtered = useMemo(() => {
    let list = posts.filter((p) => !reported.has(p.id));
    if (onlyMine) list = list.filter((p) => isOwner(p, myName));
    if (tag) list = list.filter((p) => p.content.toLowerCase().includes(tag));
    if (sort === 'hot') {
      const t = Date.now();
      list = [...list].sort((a, b) => hotScore(b, t) - hotScore(a, t));
    } else {
      list = [...list].sort((a, b) => b.createdAt - a.createdAt);
    }
    return list;
  }, [posts, reported, onlyMine, tag, sort, myName]);

  const shown = filtered.slice(0, visible);
  const hasMore = filtered.length > shown.length;

  // Cuộn gần cuối thì tự tải thêm (infinite scroll), bấm nút vẫn dùng được
  const sentinelRef = useRef(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) setVisible((v) => v + PAGE_SIZE);
        },
        { rootMargin: '240px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, shown.length]);

  return (
      <div className="tc-feed">
        <div className="tc-feed__col">
          <Composer myName={myName} onPublish={publish} />

          <div className="tc-toolbar2" role="toolbar" aria-label="Lọc bảng tin">
            <div className="tc-seg">
              {SORTS.map((s) => (
                  <button
                      key={s.id}
                      type="button"
                      className={`tc-seg__btn ${sort === s.id ? 'tc-seg__btn--on' : ''}`}
                      onClick={() => changeSort(s.id)}
                  >
                    {s.label}
                  </button>
              ))}
            </div>
            <label className="tc-chk">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
              <span>Bài của tôi</span>
            </label>
            {tag && (
                <button type="button" className="tc-chip" onClick={() => setTag('')} title="Bỏ lọc">
                  {tag} ✕
                </button>
            )}
            <span className="tc-toolbar2__count">{filtered.length} bài</span>
          </div>

          {filtered.length === 0 && (
              <div className="tc-card tc-empty">
                <span className="tc-empty__icon">🍵</span>
                {onlyMine || tag
                    ? 'Không có bài viết nào khớp bộ lọc.'
                    : 'Chưa có confession nào. Hãy là người mở màn cuộc tán gẫu!'}
              </div>
          )}

          {shown.map((p) => (
              <PostCard
                  key={p.id}
                  post={p}
                  now={now}
                  myName={myName}
                  mine={isOwner(p, myName)}
                  onOpenProfile={onOpenProfile}
                  onChange={updatePost}
                  onDelete={deletePost}
                  onReport={reportPost}
                  onCopy={copyPost}
                  onTag={setTag}
                  toast={showToast}
              />
          ))}

          {hasMore && (
              <div ref={sentinelRef} className="tc-more">
                <button type="button" className="tc-btn-ghost" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                  Xem thêm {Math.min(PAGE_SIZE, filtered.length - shown.length)} bài viết
                </button>
              </div>
          )}
        </div>

        {toast && (
            <div className="tc-toast" role="status">
              <span>{toast.text}</span>
              {toast.undo && (
                  <button
                      type="button"
                      onClick={() => {
                        toast.undo();
                      }}
                  >
                    Hoàn tác
                  </button>
              )}
            </div>
        )}

        <div className="tc-copyright">© UTC2 Connect • Không gian sinh viên văn minh</div>
      </div>
  );
}

/* ==========================================================
   KHUNG SOẠN THẢO
   ========================================================== */
function Composer({ myName, onPublish }) {
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(DRAFT_KEY(myName)) || '';
    } catch {
      return '';
    }
  });
  const [anonymous, setAnonymous] = useState(() => readJSON(ANON_KEY, true));
  const [error, setError] = useState('');
  const areaRef = useRef(null);

  const trimmed = text.trim();
  const tooLong = text.length > MAX_LEN;
  const nearLimit = text.length > MAX_LEN * 0.9;

  // Lưu nháp tự động: lỡ chuyển tab / F5 cũng không mất bài đang viết
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (text) localStorage.setItem(DRAFT_KEY(myName), text);
        else localStorage.removeItem(DRAFT_KEY(myName));
      } catch {
        /* bỏ qua */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [text, myName]);

  // Ô nhập tự giãn chiều cao theo nội dung (tối đa 320px)
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(320, Math.max(108, el.scrollHeight))}px`;
  }, [text]);

  const toggleAnon = (v) => {
    setAnonymous(v);
    writeJSON(ANON_KEY, v);
  };

  const submit = () => {
    const content = normalizeChatText(text);
    if (!content || tooLong) return;
    const res = onPublish({ content, anonymous });
    if (res?.ok === false) {
      setError(res.error);
      return;
    }
    setError('');
    setText('');
  };

  return (
      <section className="tc-card tc-composer">
        <div className="tc-composer__row">
          <div className={`tc-avatar ${anonymous ? 'tc-avatar--anon' : ''}`}>
            {anonymous ? '🎭' : getInitial(myName)}
          </div>

          <div className="tc-composer__field">
          <textarea
              ref={areaRef}
              className="tc-textarea"
              rows={3}
              value={text}
              aria-label="Nội dung confession"
              placeholder={
                anonymous
                    ? 'Bạn đang có tâm sự gì? Hãy chia sẻ ẩn danh nhé... (dùng #hashtag để dễ tìm)'
                    : 'Chia sẻ suy nghĩ của bạn...'
              }
              onChange={(e) => {
                setText(e.target.value);
                if (error) setError('');
              }}
              onKeyDown={(e) => {
                // Ctrl/Cmd + Enter để đăng nhanh
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isImeComposing(e)) {
                  e.preventDefault();
                  submit();
                }
              }}
          />
            <div className="tc-composer__meta">
              {error ? <span className="tc-composer__err">{error}</span> : <span className="tc-composer__hint">Ctrl + Enter để đăng nhanh</span>}
              {text.length > 0 && (
                  <span className={`tc-counter ${tooLong ? 'tc-counter--warn' : nearLimit ? 'tc-counter--near' : ''}`}>
                {text.length}/{MAX_LEN}
              </span>
              )}
            </div>
          </div>
        </div>

        <div className="tc-composer__foot">
          <label className="tc-switch">
            <input type="checkbox" checked={anonymous} onChange={(e) => toggleAnon(e.target.checked)} />
            <span>Đăng ẩn danh</span>
          </label>

          <button type="button" className="tc-btn-primary" disabled={!trimmed || tooLong} onClick={submit}>
            Đăng bài
          </button>
        </div>
      </section>
  );
}

/* ==========================================================
   BÀI VIẾT
   ========================================================== */
function PostCard({ post, now, myName, mine, onOpenProfile, onChange, onDelete, onReport, onCopy, onTag, toast }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const menuRef = useRef(null);

  const totalReactions = useMemo(
      () => Object.values(post.reactions || {}).reduce((a, b) => a + b, 0),
      [post.reactions]
  );

  // Đóng menu "⋯" khi bấm ra ngoài hoặc nhấn Esc
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
        setConfirmDel(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setConfirmDel(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const react = (id) => {
    const reactions = { ...EMPTY_REACTIONS, ...post.reactions };
    if (post.myReaction) {
      reactions[post.myReaction] = Math.max(0, (reactions[post.myReaction] || 0) - 1);
    }
    if (post.myReaction !== id) reactions[id] = (reactions[id] || 0) + 1;
    onChange({ ...post, reactions, myReaction: post.myReaction === id ? null : id });
  };

  const isLong = post.content.length > LONG_POST;
  const body = isLong && !expanded ? `${post.content.slice(0, LONG_POST).trimEnd()}…` : post.content;
  const fullTime = new Date(post.createdAt).toLocaleString('vi-VN');
  const timeLabel = relTime(post.createdAt, now);

  return (
      <article className="tc-card">
        <header className="tc-post__head">
          {post.authorId ? (
              <>
                <UserChip username={post.author} onOpen={onOpenProfile} />
                <time className="tc-post__time tc-post__time--right" dateTime={new Date(post.createdAt).toISOString()} title={fullTime}>
                  {timeLabel}
                </time>
              </>
          ) : (
              <>
                <div className="tc-avatar tc-avatar--anon">🎭</div>
                <div className="tc-post__who">
              <span className="tc-post__name">
                {post.author}
                {mine && <span className="tc-post__you">Bài của bạn</span>}
              </span>
                  <time className="tc-post__time" dateTime={new Date(post.createdAt).toISOString()} title={fullTime}>
                    {timeLabel}
                  </time>
                </div>
              </>
          )}

          <div className="tc-menu" ref={menuRef}>
            <button
                type="button"
                className="tc-menu__btn"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Tùy chọn bài viết"
                onClick={() => {
                  setMenuOpen((v) => !v);
                  setConfirmDel(false);
                }}
            >
              ⋯
            </button>
            {menuOpen && (
                <div className="tc-menu__list" role="menu">
                  <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onCopy(post);
                        setMenuOpen(false);
                      }}
                  >
                    📋 Sao chép nội dung
                  </button>
                  {mine ? (
                      confirmDel ? (
                          <button
                              type="button"
                              role="menuitem"
                              className="tc-menu__danger"
                              onClick={() => {
                                setMenuOpen(false);
                                onDelete(post);
                              }}
                          >
                            ⚠️ Bấm lần nữa để xóa
                          </button>
                      ) : (
                          <button type="button" role="menuitem" className="tc-menu__danger" onClick={() => setConfirmDel(true)}>
                            🗑️ Xóa bài viết
                          </button>
                      )
                  ) : (
                      <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            onReport(post);
                          }}
                      >
                        🚩 Báo cáo bài viết
                      </button>
                  )}
                </div>
            )}
          </div>
        </header>

        <p className="tc-post__body">
          {renderRich(body, onTag)}
          {isLong && (
              <button type="button" className="tc-link-btn tc-post__more" onClick={() => setExpanded((v) => !v)}>
                {expanded ? ' Thu gọn' : ' Xem thêm'}
              </button>
          )}
        </p>

        <div className="tc-reactions">
          {REACTIONS.map((r) => (
              <button
                  key={r.id}
                  type="button"
                  title={r.label}
                  aria-pressed={post.myReaction === r.id}
                  className={`tc-react ${post.myReaction === r.id ? 'tc-react--on' : ''}`}
                  onClick={() => react(r.id)}
              >
                <span className="tc-react__icon">{r.icon}</span>
                {post.reactions?.[r.id] || 0}
              </button>
          ))}
          {totalReactions > 0 && (
              <span className="tc-reactions__total">{totalReactions} lượt cảm xúc</span>
          )}
        </div>

        <div className="tc-comments">
          <CommentThread
              comments={post.comments || []}
              now={now}
              myName={myName}
              onOpenProfile={onOpenProfile}
              onChange={(comments) => onChange({ ...post, comments })}
              onTag={onTag}
              toast={toast}
          />
        </div>
      </article>
  );
}

/* ==========================================================
   BÌNH LUẬN (đệ quy – trả lời được nhiều tầng)
   ========================================================== */
function CommentThread({ comments, now, myName, onOpenProfile, onChange, onTag, toast }) {
  const [draft, setDraft] = useState('');
  const [showAll, setShowAll] = useState(false);
  const author = myName || 'Ẩn danh';
  const total = countComments(comments);

  const add = (parentId, rawText) => {
    const text = normalizeChatText(rawText);
    if (!text) return;
    if (text.length > 500) {
      toast?.('Bình luận tối đa 500 ký tự');
      return;
    }
    const node = { id: generateUUID(), author, text, createdAt: Date.now(), replies: [], likes: [] };
    onChange(insertComment(comments, parentId, node));
    if (parentId === null) setShowAll(true); // bình luận mới luôn hiện ra, không bị che
  };

  const remove = (id) => onChange(removeComment(comments, id));
  const like = (id) => onChange(toggleCommentLike(comments, id, author));

  const hidden = !showAll && comments.length > COMMENTS_PREVIEW ? comments.length - COMMENTS_PREVIEW : 0;
  const list = hidden ? comments.slice(-COMMENTS_PREVIEW) : comments;

  return (
      <>
        {total > 0 && <h4 className="tc-comments__count">{total} bình luận</h4>}

        {hidden > 0 && (
            <button type="button" className="tc-link-btn tc-comments__more" onClick={() => setShowAll(true)}>
              Xem {hidden} bình luận trước đó
            </button>
        )}

        {list.map((c) => (
            <CommentItem
                key={c.id}
                comment={c}
                now={now}
                me={author}
                onOpenProfile={onOpenProfile}
                onReply={add}
                onDelete={remove}
                onLike={like}
                onTag={onTag}
            />
        ))}

        <div className="tc-inputrow">
          <div className="tc-avatar tc-avatar--sm" style={{ background: 'var(--navy, #101a35)', color: '#fff' }}>
            {getInitial(myName)}
          </div>
          <input
              className="tc-input"
              placeholder="Viết bình luận của bạn..."
              aria-label="Viết bình luận"
              maxLength={520}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isImeComposing(e)) {
                  e.preventDefault();
                  if (draft.trim()) {
                    add(null, draft);
                    setDraft('');
                  }
                }
              }}
          />
        </div>
      </>
  );
}

function CommentItem({ comment, now, me, onOpenProfile, onReply, onDelete, onLike, onTag }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const replies = comment.replies || [];
  const likes = comment.likes || [];
  const liked = likes.includes(me);
  const mineC = comment.author === me && me !== 'Ẩn danh';

  const sendReply = () => {
    if (!text.trim()) return;
    onReply(comment.id, text);
    setText('');
    setOpen(false);
    setCollapsed(false);
  };

  return (
      <div className="tc-comment">
        <div className="tc-comment__row">
          <div className="tc-comment__main">
            {comment.deleted ? (
                <div className="tc-bubble tc-bubble--deleted">Bình luận đã bị xóa</div>
            ) : (
                <div className="tc-bubble">
              <span className="tc-bubble__name">
                <UserChip username={comment.author} onOpen={onOpenProfile} />
              </span>
                  <p className="tc-bubble__text">{renderRich(comment.text, onTag)}</p>
                  {likes.length > 0 && (
                      <span className="tc-bubble__likes" title={likes.join(', ')}>
                  👍 {likes.length}
                </span>
                  )}
                </div>
            )}

            {!comment.deleted && (
                <div className="tc-comment__meta">
                  <button
                      type="button"
                      className={`tc-link-btn ${liked ? 'tc-link-btn--on' : ''}`}
                      aria-pressed={liked}
                      onClick={() => onLike(comment.id)}
                  >
                    Thích
                  </button>
                  <button type="button" className="tc-link-btn" onClick={() => setOpen((v) => !v)}>
                    Trả lời
                  </button>
                  {mineC && (
                      <button type="button" className="tc-link-btn tc-link-btn--danger" onClick={() => onDelete(comment.id)}>
                        Xóa
                      </button>
                  )}
                  <span title={new Date(comment.createdAt).toLocaleString('vi-VN')}>{relTime(comment.createdAt, now)}</span>
                </div>
            )}
          </div>
        </div>

        {open && (
            <div className="tc-inputrow tc-inputrow--reply">
              <input
                  autoFocus
                  className="tc-input"
                  value={text}
                  maxLength={520}
                  placeholder={`Trả lời ${comment.author}...`}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isImeComposing(e)) {
                      e.preventDefault();
                      sendReply();
                    }
                    if (e.key === 'Escape') setOpen(false);
                  }}
              />
            </div>
        )}

        {replies.length > 0 && (
            <>
              {replies.length >= 2 && (
                  <button type="button" className="tc-link-btn tc-replies__toggle" onClick={() => setCollapsed((v) => !v)}>
                    {collapsed ? `▸ Hiện ${countComments(replies)} phản hồi` : '▾ Ẩn phản hồi'}
                  </button>
              )}
              {!collapsed && (
                  <div className="tc-replies">
                    {replies.map((r) => (
                        <CommentItem
                            key={r.id}
                            comment={r}
                            now={now}
                            me={me}
                            onOpenProfile={onOpenProfile}
                            onReply={onReply}
                            onDelete={onDelete}
                            onLike={onLike}
                            onTag={onTag}
                        />
                    ))}
                  </div>
              )}
            </>
        )}
      </div>
  );
}
