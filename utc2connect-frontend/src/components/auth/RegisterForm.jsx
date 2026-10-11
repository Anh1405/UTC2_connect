import OtpInput from './OtpInput';

export default function RegisterForm({ auth }) {
  const {
    email, setEmail,
    username, setUsername,
    password, setPassword,
    otp, otpDigits, otpRefs,
    isOtpSent, setIsOtpSent,
    loading,
    handleSendOtp, handleRegister, handleOtpChange, handleOtpKeyDown,
    switchMode,
  } = auth;

  return (
    <div>
      {!isOtpSent ? (
        <div>
          <label className="u2-label">Email sinh viên</label>
          <input
            type="email"
            placeholder="vd: nva@st.utc2.edu.vn"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
            className="u2-input"
          />
          <div style={{ height: 18 }} />
          <button className="u2-btn primary" disabled={loading || !email} onClick={handleSendOtp}>
            {loading ? 'Đang gửi...' : 'Nhận mã OTP qua email'}
          </button>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: 13, color: 'var(--ink-muted)', marginBottom: 18 }}>
            Mã đã gửi tới <span style={{ color: 'var(--navy)', fontWeight: 600 }}>{email}</span>
          </p>
          <label className="u2-label">Tên đăng nhập</label>
          <input type="text" placeholder="Nhập tên tài khoản..." value={username} onChange={(e) => setUsername(e.target.value)} className="u2-input" />
          <div style={{ height: 14 }} />
          <label className="u2-label">Mật khẩu</label>
          <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="u2-input" />
          <div style={{ height: 18 }} />
          <label className="u2-label" style={{ textAlign: 'center' }}>
            Mã OTP (6 số)
          </label>
          <OtpInput digits={otpDigits} inputRefs={otpRefs} onChange={handleOtpChange} onKeyDown={handleOtpKeyDown} />
          <div style={{ height: 20 }} />
          <button className="u2-btn primary" disabled={loading || !username || !password || otp.length < 6} onClick={handleRegister}>
            {loading ? 'Đang đăng ký...' : 'Hoàn tất đăng ký'}
          </button>
          <button className="u2-btn ghost" onClick={() => setIsOtpSent(false)}>
            ← Thay đổi email
          </button>
        </div>
      )}
      <div className="u2-switch-text">
        Đã có tài khoản? <span className="u2-link" onClick={() => switchMode('login')}>Quay lại Đăng nhập</span>
      </div>
    </div>
  );
}
