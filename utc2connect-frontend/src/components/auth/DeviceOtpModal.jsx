import { useRef, useEffect } from 'react';
import OtpInput from './OtpInput';

// Modal xác thực OTP khi đăng nhập từ thiết bị lạ
export default function DeviceOtpModal({ auth }) {
  const {
    showOtpModal,
    setShowOtpModal,
    deviceOtp = '',
    setDeviceOtp,
    deviceOtpError,
    deviceOtpLoading,
    handleVerifyDeviceOtp,
  } = auth;

  const inputRefs = useRef([]);
  const digits = Array.from({ length: 6 }, (_, i) => deviceOtp[i] || '');

  useEffect(() => {
    if (showOtpModal) {
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    }
  }, [showOtpModal]);

  if (!showOtpModal) return null;

  const handleOtpChange = (index, value) => {
    const cleanVal = value.replace(/\D/g, '');
    if (cleanVal.length > 1) {
      const pasted = cleanVal.slice(0, 6);
      setDeviceOtp(pasted);
      const nextIdx = Math.min(pasted.length, 5);
      inputRefs.current[nextIdx]?.focus();
      return;
    }

    const char = cleanVal.slice(-1);
    const newDigits = [...digits];
    newDigits[index] = char;
    const newOtp = newDigits.join('');
    setDeviceOtp(newOtp);

    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    } else if (e.key === 'Enter') {
      if (deviceOtp && deviceOtp.length === 6 && !deviceOtpLoading) {
        handleVerifyDeviceOtp(deviceOtp);
      }
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pastedData) return;
    setDeviceOtp(pastedData);
    const nextIdx = Math.min(pastedData.length, 5);
    inputRefs.current[nextIdx]?.focus();
  };

  return (
      <div
          className="u2-report-overlay"
          onClick={() => !deviceOtpLoading && setShowOtpModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
            backdropFilter: 'blur(3px)',
          }}
      >
        <div
            className="u2-report-ticket"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '460px',
              overflow: 'hidden',
              borderRadius: '12px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
        >
          {/* HEADER: Đặt màu nền tối đặc (đục 100%) để không bị xuyên thấu */}
          <div
              className="u2-report-head"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '18px 24px',
                backgroundColor: 'var(--ink, #161b26)', // Màu nền tối đặc che phủ hoàn toàn
                borderBottom: '1px dashed rgba(255, 255, 255, 0.2)', // Nét đứt ngăn cách phong cách ticket
              }}
          >
            <div>
            <span
                className="u2-mono"
                style={{
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  color: 'var(--amber, #f59e0b)',
                  display: 'block',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
            >
              CẢNH BÁO BẢO MẬT
            </span>
              <h3
                  className="u2-display"
                  style={{
                    margin: '4px 0 0',
                    fontSize: 22,
                    color: 'var(--paper, #ffffff)',
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                  }}
              >
                THIẾT BỊ MỚI
              </h3>
            </div>

            <button
                className="u2-report-close"
                onClick={() => setShowOtpModal(false)}
                type="button"
                title="Đóng"
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.8)',
                  fontSize: '16px',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.2s',
                }}
            >
              ✕
            </button>
          </div>

          {/* BODY: Toàn bộ nội dung bên dưới nền trắng */}
          <div
              className="u2-report-body"
              style={{
                textAlign: 'center',
                padding: '28px 24px 24px',
                backgroundColor: 'var(--paper, #ffffff)',
              }}
          >
            <p
                style={{
                  fontSize: 14,
                  color: 'var(--ink-muted, #4b5563)',
                  marginBottom: 20,
                  lineHeight: 1.55,
                }}
            >
              Hệ thống phát hiện bạn đang đăng nhập từ thiết bị lạ. Vui lòng kiểm tra email sinh viên và nhập mã OTP để xác nhận.
            </p>

            <OtpInput
                digits={digits}
                inputRefs={inputRefs}
                onChange={handleOtpChange}
                onKeyDown={handleOtpKeyDown}
                onPaste={handleOtpPaste}
            />

            {deviceOtpError && (
                <p style={{ color: 'var(--red, #ef4444)', fontSize: 13, marginTop: 10, fontWeight: 500 }}>
                  {deviceOtpError}
                </p>
            )}

            {/* Cụm nút xác nhận */}
            <div
                className="u2-report-footer"
                style={{
                  marginTop: '28px',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: '12px',
                }}
            >
              <button
                  type="button"
                  className="u2-btn ghost"
                  onClick={() => setShowOtpModal(false)}
                  disabled={deviceOtpLoading}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'transparent',
                    color: '#374151',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 14,
                  }}
              >
                Huỷ
              </button>
              <button
                  type="button"
                  className="u2-btn primary"
                  disabled={!deviceOtp || deviceOtp.length < 6 || deviceOtpLoading}
                  onClick={() => handleVerifyDeviceOtp(deviceOtp)}
                  style={{
                    padding: '10px 22px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor:
                        !deviceOtp || deviceOtp.length < 6 || deviceOtpLoading
                            ? '#e5e7eb'
                            : 'var(--red, #c53030)',
                    color:
                        !deviceOtp || deviceOtp.length < 6 || deviceOtpLoading
                            ? '#9ca3af'
                            : '#ffffff',
                    cursor:
                        !deviceOtp || deviceOtp.length < 6 || deviceOtpLoading
                            ? 'not-allowed'
                            : 'pointer',
                    fontWeight: 600,
                    fontSize: 14,
                    boxShadow:
                        deviceOtp && deviceOtp.length === 6 && !deviceOtpLoading
                            ? '0 4px 12px rgba(197, 48, 48, 0.3)'
                            : 'none',
                  }}
              >
                {deviceOtpLoading ? 'Đang xác nhận...' : 'Xác nhận thiết bị'}
              </button>
            </div>
          </div>
        </div>
      </div>
  );
}