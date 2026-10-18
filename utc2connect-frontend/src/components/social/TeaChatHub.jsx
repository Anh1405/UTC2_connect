import { useState } from 'react';
import ConfessionFeed from './ConfessionFeed';
import GlobalChatRoom from './GlobalChatRoom';
import './teachat.css';

const TABS = [
  { id: 'confession', icon: '🎭', label: 'Confession' },
  { id: 'chat', icon: '💬', label: 'Chat All' },
];

export default function TeaChatHub({ socket, currentUser, onOpenProfile }) {
  const [tab, setTab] = useState('confession');

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

          <nav className="tc-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`tc-tab ${tab === t.id ? 'tc-tab--active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                <span className="tc-tab__icon">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="tc-stage">
        {tab === 'confession' ? (
          <ConfessionFeed currentUser={currentUser} onOpenProfile={onOpenProfile} />
        ) : (
          <GlobalChatRoom socket={socket} currentUser={currentUser} onOpenProfile={onOpenProfile} />
        )}
      </div>
    </div>
  );
}