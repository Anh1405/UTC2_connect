import OtpInput from './OtpInput';

export default function ForgotPasswordForm({ auth }) {
  const {
    email, setEmail,
    newPassword, setNewPassword,
    otp, otpDigits, otpRefs,
    isOtpSent, setIsOtpSent,
    loading,
    handleSendForgotOtp, handleResetPassword, handleOtpChange, handleOtpKeyDown,
    switchMode,
  } = auth;

  return (
    <div>
      {!isOtpSent ? (
        <div>
          <label className="u2-label">Nhập Email tài khoản cần lấy lại</label>
          <input
            type="email"
            placeholder="vd: nva@st.utc2.edu.vn"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendForgotOtp()}
            className="u2-input"
          />
          <div style={{ height: 18 }} />
          <button className="u2-btn primary" disabled={loading || !email} onClick={handleSendForgotOtp}>
            {loading ? 'Đang xác thực...' : 'Gửi mã xác thực mật khẩu'}
          </button>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: 13, color: 'var(--ink-muted)', marginBottom: 18 }}>
            Mã khôi phục đã gửi tới <span style={{ color: 'var(--navy)', fontWeight: 600 }}>{email}</span>
          </p>
          <label className="u2-label">Mật khẩu mới</label>
          <input type="password" placeholder="Nhập mật khẩu mới..." value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="u2-input" />
          <div style={{ height: 18 }} />
          <label className="u2-label" style={{ textAlign: 'center' }}>
            Mã xác thực OTP (6 số)
          </label>
          <OtpInput digits={otpDigits} inputRefs={otpRefs} onChange={handleOtpChange} onKeyDown={handleOtpKeyDown} />
          <div style={{ height: 20 }} />
          <button className="u2-btn primary" disabled={loading || !newPassword || otp.length < 6} onClick={handleResetPassword}>
            {loading ? 'Đang đổi mật khẩu...' : 'Xác nhận đặt lại mật khẩu'}
          </button>
          <button className="u2-btn ghost" onClick={() => setIsOtpSent(false)}>
            ← Thay đổi email
          </button>
        </div>
      )}
      <div className="u2-switch-text">
        <span className="u2-link" onClick={() => switchMode('login')}>
          Quay lại Đăng nhập
        </span>
      </div>
    </div>
  );
}
