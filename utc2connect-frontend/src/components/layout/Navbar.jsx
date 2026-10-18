// Thanh điều hướng trên cùng
export default function Navbar({ username, onOpenProfile, onLogout }) {
  return (
    <div className="u2-navbar">
      <div className="u2-nav-brand">
        <span className="u2-nav-mark">U2</span>
        <span className="u2-nav-logo">
          <span className="u2-nav-logo-top">UTC2</span>
          <b>CONNECT</b>
        </span>
      </div>
      <div className="u2-user-pill">
        <span className="u2-user-avatar" style={{ cursor: 'pointer' }} onClick={() => onOpenProfile(username)} title="Xem hồ sơ">
          {username?.charAt(0)?.toUpperCase() || '?'}
        </span>
        <span className="u2-user-info">
          <span className="u2-user-name" style={{ cursor: 'pointer' }} onClick={() => onOpenProfile(username)}>
            {username}
          </span>
          <span className="u2-user-status">Trực tuyến</span>
        </span>
        <button className="u2-logout-btn" onClick={onLogout}>
          Đăng xuất
        </button>
      </div>
    </div>
  );
}
