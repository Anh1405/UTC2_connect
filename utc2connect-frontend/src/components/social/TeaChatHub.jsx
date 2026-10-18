import { useCallback, useEffect, useState } from 'react';
import ConfessionFeed from './ConfessionFeed';
import GlobalChatRoom from './GlobalChatRoom';
import usePresence, { CONN } from '../../hooks/usePresence';
import './teachat.css';
import './teachat.extra.css';

const TABS = [
  { id: 'confession', icon: '🎭', label: 'Confession' },
  { id: 'chat', icon: '💬', label: 'Chat All' },
];

const TAB_KEY = 'tc_last_tab';

const CONN_LABEL = {
  [CONN.ONLINE]: 'Đã kết nối',
  [CONN.CONNECTING]: 'Đang kết nối...',
  [CONN.RECONNECTING]: 'Mất kết nối, đang thử lại...',
  [CONN.OFFLINE]: 'Không có mạng',
};

const readTab = () => {
  try {
    const t = localStorage.getItem(TAB_KEY);
    return TABS.some((x) => x.id === t) ? t : 'confession';
  } catch {
    return 'confession';
  }
};

export default function TeaChatHub({ socket, currentUser, onOpenProfile }) {
  const [tab, setTab] = useState(readTab);
  const [chatUnread, setChatUnread] = useState(0);

  /**
   * Presence được giữ ở Hub: đăng nhập thành công → Hub mount → khai báo "online" ngay,
   * không cần người dùng mở tab Chat All. Chat All chỉ việc nhận kết quả để hiển thị.
   */
  const presence = usePresence(socket, currentUser);

  const switchTab = useCallback((id) => {
    setTab(id);
    if (id === 'chat') setChatUnread(0);
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch {
      /* bỏ qua */
    }
  }, []);

  // Phím tắt kiểu app lớn: Alt+1 / Alt+2 đổi tab
  useEffect(() => {
    const onKey = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const idx = Number(e.key) - 1;
      if (TABS[idx]) {
        e.preventDefault();
        switchTab(TABS[idx].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [switchTab]);

  // Điều hướng tab bằng phím mũi tên (chuẩn WAI-ARIA tabs)
  const onTabKeyDown = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length];
    switchTab(next.id);
  };

  const connOk = presence.conn === CONN.ONLINE;

  return (
      <div className="tc-hub">
        <div className="tc-topbar">
          <div className="tc-topbar__inner">
            <div className="tc-brand">
              <div className="tc-brand__logo">🍵</div>
              <div>
                <h1 className="tc-brand__title">TRÀ CHANH TÁN GẪU</h1>
                <p className="tc-brand__sub">Ga Xã Hội • UTC2 Connect</p>
              </div>
            </div>

            <div className="tc-topbar__right">
            <span
                className={`tc-conn tc-conn--${presence.conn}`}
                title={presence.latency != null && connOk ? `Độ trễ ~${presence.latency}ms` : CONN_LABEL[presence.conn]}
            >
              <i className="tc-conn__dot" />
              {connOk ? `${presence.online.length} đang online` : CONN_LABEL[presence.conn]}
            </span>

              <nav className="tc-tabs" role="tablist" aria-label="Trà Chanh Tán Gẫu" onKeyDown={onTabKeyDown}>
                {TABS.map((t, i) => (
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        id={`tc-tab-${t.id}`}
                        aria-selected={tab === t.id}
                        aria-controls={`tc-panel-${t.id}`}
                        tabIndex={tab === t.id ? 0 : -1}
                        title={`Alt+${i + 1}`}
                        className={`tc-tab ${tab === t.id ? 'tc-tab--active' : ''}`}
                        onClick={() => switchTab(t.id)}
                    >
                      <span className="tc-tab__icon">{t.icon}</span>
                      {t.label}
                      {t.id === 'chat' && chatUnread > 0 && tab !== 'chat' && (
                          <span className="tc-tab__badge">{chatUnread > 99 ? '99+' : chatUnread}</span>
                      )}
                    </button>
                ))}
              </nav>
            </div>
          </div>
        </div>

        {!connOk && (
            <div className={`tc-banner tc-banner--${presence.conn}`} role="status">
              {presence.conn === CONN.OFFLINE
                  ? '📴 Thiết bị đang offline. Tin nhắn sẽ không gửi được cho đến khi có mạng.'
                  : '🔄 Đang kết nối lại với máy chủ, bạn chưa hiện là trực tuyến...'}
            </div>
        )}

        {/*
        Cả hai tab luôn được mount, chỉ ẩn bằng CSS: đổi tab không mất tin nhắn Chat All,
        không mất bản nháp Confession, không phải join/leave phòng liên tục.
      */}
        <div className="tc-stage">
          <div
              className="tc-panel"
              role="tabpanel"
              id="tc-panel-confession"
              aria-labelledby="tc-tab-confession"
              hidden={tab !== 'confession'}
          >
            <ConfessionFeed currentUser={currentUser} onOpenProfile={onOpenProfile} />
          </div>
          <div
              className="tc-panel"
              role="tabpanel"
              id="tc-panel-chat"
              aria-labelledby="tc-tab-chat"
              hidden={tab !== 'chat'}
          >
            <GlobalChatRoom
                socket={socket}
                currentUser={currentUser}
                onOpenProfile={onOpenProfile}
                presence={presence}
                active={tab === 'chat'}
                onUnreadChange={setChatUnread}
            />
          </div>
        </div>
      </div>
  );
}
