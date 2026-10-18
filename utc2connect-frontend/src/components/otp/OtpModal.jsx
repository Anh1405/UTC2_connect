import { useEffect, useRef, useState } from 'react';
import useOtpCountdown from '../../hooks/useOtpCountdown';

/**
 * Modal xác thực OTP dùng chung cho toàn hệ thống
 */
export default function OtpModal({
  open,
  title = 'XÁC THỰC BẢO MẬT',
  subtitle = 'Nhập mã 6 chữ số đã được gửi tới địa chỉ của bạn.',
  destination = '',
  loading = false,
  error = '',
  onClose,
  onVerify,
  onResend,
}) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef([]);
  const { seconds, start, canResend } = useOtpCountdown(60);

  // Khởi tạo lại trạng thái khi mở Modal
  useEffect(() => {
    if (open) {
      setDigits(['', '', '', '', '', '']);
      start(60);
      const timer = setTimeout(() => inputRefs.current[0]?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [open, start]);

  if (!open) return null;

  const fullOtp = digits.join('');

  const handleChange = (index, value) => {
    const cleanValue = value.replace(/\D/g, ''); // Chỉ nhận ký tự số
    if (!cleanValue && value !== '') return;

    const nextDigits = [...digits];

    if (cleanValue.length > 1) {
      // Trường hợp dán hoặc gõ nhanh nhiều số vào 1 ô
      const pasted = cleanValue.slice(0, 6).split('');
      for (let i = 0; i < 6; i++) {
        nextDigits[i] = pasted[i] || '';
      }
      setDigits(nextDigits);
      const focusIndex = Math.min(cleanValue.length, 5);
      inputRefs.current[focusIndex]?.focus();
      return;
    }

    nextDigits[index] = cleanValue.slice(-1);
    setDigits(nextDigits);

    // Tự động chuyển focus sang ô tiếp theo
    if (cleanValue && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    } else if (e.key === 'Enter' && fullOtp.length === 6 && !loading) {
      onVerify?.(fullOtp);
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pastedData) return;

    const nextDigits = ['', '', '', '', '', ''];
    pastedData.split('').forEach((char, i) => {
      nextDigits[i] = char;
    });
    setDigits(nextDigits);
    inputRefs.current[Math.min(pastedData.length, 5)]?.focus();
  };

  const handleResendClick = () => {
    if (!canResend) return;
    onResend?.();
    start(60);
    setDigits(['', '', '', '', '', '']);
    inputRefs.current[0]?.focus();
  };

  return (
    <div
      className="fixed inset-0 bg-[rgba(16,27,51,0.65)] backdrop-blur-sm flex items-center justify-center z-[1000] p-4 transition-opacity"
      onClick={() => !loading && onClose?.()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-[var(--paper,#fff)] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-[var(--fb-divider,#e5e7eb)] animate-[u2-pop-in_0.2s_ease]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="bg-[var(--navy,#101B33)] p-5 relative text-center">
          <span className="text-[var(--amber,#FFB400)] text-xs font-mono tracking-widest uppercase block mb-1">
            BẢO MẬT HỆ THỐNG
          </span>
          <h3 className="font-[Bebas_Neue,sans-serif] text-2xl text-white tracking-wider m-0">
            {title}
          </h3>
          <button
            onClick={onClose}
            disabled={loading}
            type="button"
            className="absolute top-4 right-5 text-gray-400 hover:text-white text-xl transition-colors disabled:opacity-30"
          >
            ✕
          </button>
        </div>

        {/* Body Modal */}
        <div className="p-6">
          <p className="text-center text-[var(--ink-muted,#555)] text-sm mb-2">
            {subtitle}
          </p>
          {destination && (
            <p className="text-center font-semibold text-[var(--navy,#101B33)] text-sm mb-6 bg-amber-50 py-1.5 px-3 rounded-md border border-amber-200">
              {destination}
            </p>
          )}

          {/* Dãy 6 Ô nhập OTP */}
          <div className="flex justify-between gap-2 mb-6" onPaste={handlePaste}>
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                type="text"
                inputMode="numeric"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                maxLength={1}
                value={digit}
                disabled={loading}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className="w-11 h-14 sm:w-12 sm:h-14 text-center text-xl font-bold border-[1.5px] border-[#E1E0D6] rounded-lg bg-[#FBFAF4] focus:border-[var(--teal,#0F8B6C)] focus:ring-[3px] focus:ring-[rgba(15,139,108,0.18)] outline-none transition-all text-[var(--navy,#101B33)] disabled:opacity-50"
              />
            ))}
          </div>

          {/* Hiển thị lỗi nếu có */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs text-center font-medium">
              ⚠️ {error}
            </div>
          )}

          {/* Button Xác nhận */}
          <button
            type="button"
            disabled={fullOtp.length !== 6 || loading}
            onClick={() => onVerify?.(fullOtp)}
            className="w-full py-3 bg-[var(--amber,#FFB400)] text-[var(--navy,#101B33)] font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-amber-400 transition-all shadow-md active:scale-[0.99] flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                <span>Đang xác thực...</span>
              </>
            ) : (
              'Xác nhận & Lưu'
            )}
          </button>

          {/* Đếm ngược gửi lại mã */}
          <div className="text-center mt-5 text-sm text-[var(--ink-muted,#666)]">
            {canResend ? (
              <button
                type="button"
                className="text-[var(--teal,#0F8B6C)] font-semibold hover:underline"
                onClick={handleResendClick}
              >
                Gửi lại mã OTP mới
              </button>
            ) : (
              <span>
                Gửi lại mã sau <b className="text-[var(--navy,#101B33)]">{seconds}s</b>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}