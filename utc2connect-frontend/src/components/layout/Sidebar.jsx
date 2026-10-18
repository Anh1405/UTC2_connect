import { SIDEBAR_ITEMS } from '../../config/navigation';

// Cột menu bên trái
export default function Sidebar({ activeSection, onSelect }) {
  return (
    <div className="u2-sidebar">
      <div className="u2-sidebar__label">Khám phá</div>

      <nav className="u2-sidebar__nav">
        {SIDEBAR_ITEMS.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <div key={item.id} className={`u2-menu-item ${isActive ? 'active' : ''}`} onClick={() => onSelect(item.id)}>
              <span className="u2-menu-item__icon">{item.icon}</span>
              <div className="u2-menu-item__text">
                <span className="u2-menu-item__label">{item.label}</span>
                <span className="u2-menu-item__desc">{item.desc}</span>
              </div>
              {isActive && <span className="u2-menu-item__dot" />}
            </div>
          );
        })}
      </nav>

      <div className="u2-sidebar__note">
        <div className="u2-sidebar__note-inner">
          <span className="u2-sidebar__note-icon">⚠️</span>
          <p className="u2-sidebar__note-text">
            <strong>Lưu ý:</strong> Tuân thủ quy tắc ứng xử cộng đồng sinh viên. Mọi hành vi phản cảm sẽ bị khóa tài khoản
            vĩnh viễn.
          </p>
        </div>
      </div>
    </div>
  );
}
