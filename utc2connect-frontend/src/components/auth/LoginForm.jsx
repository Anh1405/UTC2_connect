export default function LoginForm({ auth }) {
  const { username, setUsername, password, setPassword, loading, handleLogin, switchMode } = auth;

  return (
    <div>
      <label className="u2-label">Tên đăng nhập</label>
      <input
        type="text"
        placeholder="Nhập tên tài khoản..."
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="u2-input"
      />
      <div style={{ height: 14 }} />
      <label className="u2-label">Mật khẩu</label>
      <input
        type="password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && username && password && handleLogin()}
        className="u2-input"
      />
      <div style={{ textAlign: 'right', marginTop: 6 }}>
        <span className="u2-link" style={{ fontSize: 12, color: 'var(--ink-muted)' }} onClick={() => switchMode('forgot')}>
          Quên mật khẩu?
        </span>
      </div>
      <div style={{ height: 16 }} />
      <button className="u2-btn primary" disabled={loading || !username || !password} onClick={handleLogin}>
        {loading ? 'Đang kiểm tra...' : 'Đăng nhập vào hệ thống'}
      </button>
      <div className="u2-switch-text">
        Chưa có tài khoản? <span className="u2-link" onClick={() => switchMode('register')}>Đăng ký ngay</span>
      </div>
    </div>
  );
}
