import React from 'react';

// Khai báo trực tiếp danh sách tab khớp 100% với activeSection trong App.jsx
const NAV_ITEMS = [
  { id: 'call', label: 'Hò hẹn', icon: '📹' },
  { id: 'social', label: 'Trà chanh', icon: '💬' },
  { id: 'market', label: 'Chợ UTC2', icon: '🛒' },
  { id: 'housing', label: 'Trọ tốt', icon: '🏠' },
];

export default function MobileBottomNav({ activeSection, onSelect }) {
  return (
    <nav className="u2-mobile-bottom-nav">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`u2-mobile-nav-item ${activeSection === item.id ? 'active' : ''}`}
          onClick={() => onSelect && onSelect(item.id)}
        >
          <span className="nav-icon">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}