import { useMemo, useState } from 'react';
import { generateUUID } from '../../utils/deviceId';
import { isImeComposing, normalizeChatText } from '../../utils/normalizeText';
import { loadConfessions, saveConfessions } from '../../data/seedCampus';
import { UserChip } from '../profile/UserProfileDrawer';
import './teachat.css';

const MAX_LEN = 1000;

const REACTIONS = [
  { id: 'like', icon: '👍' },
  { id: 'love', icon: '❤️' },
  { id: 'haha', icon: '😂' },
  { id: 'wow', icon: '😮' },
  { id: 'sad', icon: '😢' },
];

const EMPTY_REACTIONS = { like: 0, love: 0, haha: 0, wow: 0, sad: 0 };

/* ---------- tiện ích ---------- */
const formatTime = (ts, withDate = true) =>
  new Date(ts).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    ...(withDate ? { day: '2-digit', month: '2-digit' } : {}),
  });

const countComments = (list = []) =>
  list.reduce((sum, c) => sum + 1 + countComments(c.replies), 0);

/** Thêm bình luận vào gốc (parentId = null) hoặc vào đúng nút cha ở bất kỳ độ sâu nào. */
const insertComment = (list, parentId, node) => {
  if (!parentId) return [...list, node];
  return list.map((c) =>
    c.id === parentId
      ? { ...c, replies: [...(c.replies || []), node] }
      : { ...c, replies: insertComment(c.replies || [], parentId, node) }
  );
};

const getName = (user) => (typeof user === 'string' ? user : user?.username || '');
const getInitial = (name) => (name ? name.charAt(0).toUpperCase() : 'U');

/* ==========================================================
   FEED
   ========================================================== */
export default function ConfessionFeed({ currentUser, onOpenProfile }) {
  const [posts, setPosts] = useState(() => loadConfessions());
  const myName = getName(currentUser);

  const persist = (next) => {
    setPosts(next);
    saveConfessions(next);
  };

  const publish = ({ content, anonymous }) => {
    const post = {
      id: generateUUID(),
      anonymous,
      author: anonymous ? 'Ẩn danh' : myName,
      authorId: anonymous ? null : myName,
      content,
      createdAt: Date.now(),
      reactions: { ...EMPTY_REACTIONS },
      myReaction: null,
      comments: [],
    };
    persist([post, ...posts]);
  };

  const updatePost = (next) =>
    persist(posts.map((p) => (p.id === next.id ? next : p)));

  return (
    <div className="tc-feed">
      <div className="tc-feed__col">
        <Composer myName={myName} onPublish={publish} />

        {posts.length === 0 && (
          <div className="tc-card tc-empty">
            <span className="tc-empty__icon">🍵</span>
            Chưa có confession nào. Hãy là người mở màn cuộc tán gẫu!
          </div>
        )}

        {posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            myName={myName}
            onOpenProfile={onOpenProfile}
            onChange={updatePost}
          />
        ))}
      </div>

      <div className="tc-copyright">© UTC2 Connect • Không gian sinh viên văn minh</div>
    </div>
  );
}

/* ==========================================================
   KHUNG SOẠN THẢO
   ========================================================== */
function Composer({ myName, onPublish }) {
  const [text, setText] = useState('');
  const [anonymous, setAnonymous] = useState(true);

  const trimmed = text.trim();
  const tooLong = text.length > MAX_LEN;

  const submit = () => {
    const content = normalizeChatText(text);
    if (!content || tooLong) return;
    onPublish({ content, anonymous });
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
            className="tc-textarea"
            rows={3}
            value={text}
            placeholder={
              anonymous
                ? 'Bạn đang có tâm sự gì? Hãy chia sẻ ẩn danh nhé...'
                : 'Chia sẻ suy nghĩ của bạn...'
            }
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Ctrl/Cmd + Enter để đăng nhanh
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isImeComposing(e)) {
                e.preventDefault();
                submit();
              }
            }}
          />
          {text.length > 0 && (
            <div className={`tc-counter ${tooLong ? 'tc-counter--warn' : ''}`}>
              {text.length}/{MAX_LEN}
            </div>
          )}
        </div>
      </div>

      <div className="tc-composer__foot">
        <label className="tc-switch">
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
          />
          <span>Đăng ẩn danh</span>
        </label>

        <button
          type="button"
          className="tc-btn-primary"
          disabled={!trimmed || tooLong}
          onClick={submit}
        >
          Đăng bài
        </button>
      </div>
    </section>
  );
}

/* ==========================================================
   BÀI VIẾT
   ========================================================== */
function PostCard({ post, myName, onOpenProfile, onChange }) {
  const totalReactions = useMemo(
    () => Object.values(post.reactions || {}).reduce((a, b) => a + b, 0),
    [post.reactions]
  );

  const react = (id) => {
    const reactions = { ...EMPTY_REACTIONS, ...post.reactions };
    if (post.myReaction) {
      reactions[post.myReaction] = Math.max(0, (reactions[post.myReaction] || 0) - 1);
    }
    if (post.myReaction !== id) reactions[id] = (reactions[id] || 0) + 1;
    onChange({ ...post, reactions, myReaction: post.myReaction === id ? null : id });
  };

  return (
    <article className="tc-card">
      <header className="tc-post__head">
        {post.authorId ? (
          <>
            <UserChip username={post.author} onOpen={onOpenProfile} />
            <time className="tc-post__time tc-post__time--right">
              {formatTime(post.createdAt)}
            </time>
          </>
        ) : (
          <>
            <div className="tc-avatar tc-avatar--anon">🎭</div>
            <div className="tc-post__who">
              <span className="tc-post__name">{post.author}</span>
              <time className="tc-post__time">{formatTime(post.createdAt)}</time>
            </div>
          </>
        )}
      </header>

      <p className="tc-post__body">{post.content}</p>

      <div className="tc-reactions">
        {REACTIONS.map((r) => (
          <button
            key={r.id}
            type="button"
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
          myName={myName}
          onOpenProfile={onOpenProfile}
          onChange={(comments) => onChange({ ...post, comments })}
        />
      </div>
    </article>
  );
}

/* ==========================================================
   BÌNH LUẬN (đệ quy – trả lời được nhiều tầng)
   ========================================================== */
function CommentThread({ comments, myName, onOpenProfile, onChange }) {
  const [draft, setDraft] = useState('');
  const author = myName || 'Ẩn danh';
  const total = countComments(comments);

  const add = (parentId, rawText) => {
    const text = normalizeChatText(rawText);
    if (!text) return;
    const node = { id: generateUUID(), author, text, createdAt: Date.now(), replies: [] };
    onChange(insertComment(comments, parentId, node));
  };

  return (
    <>
      {total > 0 && <h4 className="tc-comments__count">{total} bình luận</h4>}

      {comments.map((c) => (
        <CommentItem
          key={c.id}
          comment={c}
          onOpenProfile={onOpenProfile}
          onReply={add}
        />
      ))}

      <div className="tc-inputrow">
        <div className="tc-avatar tc-avatar--sm" style={{ background: 'var(--navy, #101a35)', color: '#fff' }}>
          {getInitial(myName)}
        </div>
        <input
          className="tc-input"
          placeholder="Viết bình luận của bạn..."
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

function CommentItem({ comment, onOpenProfile, onReply }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const replies = comment.replies || [];

  const sendReply = () => {
    if (!text.trim()) return;
    onReply(comment.id, text);
    setText('');
    setOpen(false);
  };

  return (
    <div className="tc-comment">
      <div className="tc-comment__row">
        <div className="tc-comment__main">
          <div className="tc-bubble">
            <span className="tc-bubble__name">
              <UserChip username={comment.author} onOpen={onOpenProfile} />
            </span>
            <p className="tc-bubble__text">{comment.text}</p>
          </div>

          <div className="tc-comment__meta">
            <button type="button" className="tc-link-btn" onClick={() => setOpen((v) => !v)}>
              Trả lời
            </button>
            <span>{formatTime(comment.createdAt, false)}</span>
          </div>
        </div>
      </div>

      {open && (
        <div className="tc-inputrow tc-inputrow--reply">
          <input
            autoFocus
            className="tc-input"
            value={text}
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
        <div className="tc-replies">
          {replies.map((r) => (
            <CommentItem key={r.id} comment={r} onOpenProfile={onOpenProfile} onReply={onReply} />
          ))}
        </div>
      )}
    </div>
  );
}