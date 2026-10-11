// Modal xác thực OTP khi đăng nhập từ thiết bị lạ
export default function DeviceOtpModal({ auth }) {
  const {
    showOtpModal,
    setShowOtpModal,
    deviceOtp,
    setDeviceOtp,
    deviceOtpError,
    deviceOtpLoading,
    handleVerifyDeviceOtp,
  } = auth;

  if (!showOtpModal) return null;

  return (
    <div className="u2-report-overlay" onClick={() => !deviceOtpLoading && setShowOtpModal(false)}>
      <div className="u2-report-ticket" onClick={(e) => e.stopPropagation()}>
        <div className="u2-report-head">
          <span className="u2-mono" style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--amber)' }}>
            CẢNH BÁO BẢO MẬT
          </span>
          <h3 className="u2-display" style={{ margin: '2px 0 0', fontSize: 22, color: 'var(--paper)' }}>
            Thiết bị mới
          </h3>
          <button className="u2-report-close" onClick={() => setShowOtpModal(false)}>
            ✕
          </button>
        </div>
        <div className="u2-report-body" style={{ textAlign: 'center', marginTop: '16px' }}>
          <p style={{ fontSize: 14, color: 'var(--ink-muted)', marginBottom: 20 }}>
            Hệ thống phát hiện bạn đang đăng nhập từ thiết bị lạ. Vui lòng kiểm tra email sinh viên và nhập mã OTP để xác nhận.
          </p>
          <input
            type="text"
            className="u2-input"
            placeholder="Nhập mã OTP 6 số..."
            value={deviceOtp}
            onChange={(e) => setDeviceOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            maxLength={6}
            style={{ textAlign: 'center', letterSpacing: '4px', fontSize: '18px', fontWeight: 'bold' }}
          />
          {deviceOtpError && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>{deviceOtpError}</p>}
        </div>
        <div className="u2-report-footer" style={{ marginTop: '20px' }}>
          <button className="u2-btn ghost" onClick={() => setShowOtpModal(false)} disabled={deviceOtpLoading}>
            Huỷ
          </button>
          <button
            className="u2-btn primary"
            disabled={!deviceOtp || deviceOtp.length < 6 || deviceOtpLoading}
            onClick={() => handleVerifyDeviceOtp(deviceOtp)}
          >
            {deviceOtpLoading ? 'Đang xác nhận...' : 'Xác nhận thiết bị'}
          </button>
        </div>
      </div>
    </div>
  );
}
