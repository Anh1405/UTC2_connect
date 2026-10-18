import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import ForgotPasswordForm from './ForgotPasswordForm';

const ROUTE_CODES = {
  login: 'CỔNG SOÁT VÉ ĐĂNG NHẬP',
  register: 'TUYẾN TÀU SV PHÂN HIỆU GTVT',
  forgot: 'CẤP LẠI VÉ HÀNH TRÌNH',
};

const TAGLINES = {
  login: 'Xác thực vé vào hệ thống sinh viên',
  register: 'Vé lên tàu vào cộng đồng sinh viên UTC2',
  forgot: 'Đặt lại mật khẩu truy cập hệ thống qua mã xác thực',
};

const STUB_LABELS = {
  login: 'VÉ ĐĂNG NHẬP • UTC2-CONNECT',
  register: 'VÉ ĐĂNG KÝ • UTC2-CONNECT',
  forgot: 'VÉ KHÔI PHỤC • UTC2-CONNECT',
};

const BARCODE_WIDTHS = [3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3];

// Màn hình "vé tàu": Đăng nhập / Đăng ký / Quên mật khẩu
export default function AuthScreen({ auth }) {
  const { mode, isOtpSent, message, error } = auth;

  return (
    <div className="u2-ticket">
      <div className="u2-head">
        <div className="u2-route-code u2-mono">{ROUTE_CODES[mode]}</div>
        <div className="u2-wordmark u2-display">UTC2 CONNECT</div>
        <div className="u2-tagline">{TAGLINES[mode]}</div>
        <div className="u2-stations">
          <div className="u2-dot on" />
          <div className="u2-track">
            <div className="u2-track-fill" style={{ width: mode === 'login' ? '50%' : isOtpSent ? '100%' : '0%' }} />
          </div>
          <div className={`u2-dot ${isOtpSent || mode === 'login' ? 'on' : ''}`} />
        </div>
        <div className="u2-station-labels">
          <span>{mode === 'login' ? 'Điền thông tin' : 'Gửi OTP'}</span>
          <span>{mode === 'login' ? 'Khởi hành' : 'Xác thực'}</span>
        </div>
      </div>

      <div className="u2-perf" />

      <div className="u2-body">
        {message && <div className="u2-banner ok">{message}</div>}
        {error && <div className="u2-banner err">{error}</div>}

        {mode === 'login' && <LoginForm auth={auth} />}
        {mode === 'register' && <RegisterForm auth={auth} />}
        {mode === 'forgot' && <ForgotPasswordForm auth={auth} />}
      </div>

      <div className="u2-stub">
        <span className="u2-mono" style={{ fontSize: 10, color: 'var(--ink-muted)', letterSpacing: '0.08em' }}>
          {STUB_LABELS[mode]}
        </span>
        <div className="u2-barcode">
          {BARCODE_WIDTHS.map((w, i) => (
            <span key={i} style={{ width: w }} />
          ))}
        </div>
      </div>
    </div>
  );
}
