import { useState, useRef, useEffect } from 'react';

export default function OtpVerificationModal({ email, onVerify, onCancel }) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(60);
  const inputRefs = useRef([]);

  // Đếm ngược thời gian gửi lại mã
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleChange = (index, value) => {
    if (isNaN(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Tự động nhảy sang ô tiếp theo
    if (value !== '' && index < 5) {
      inputRefs.current[index + 1].focus();
    }
  };

  const handleKeyDown = (index, e) => {
    // Xóa lùi về ô trước đó
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1].focus();
    }
    // Nhấn Enter để submit nếu đã nhập đủ
    if (e.key === 'Enter' && otp.join('').length === 6) {
      onVerify(otp.join(''));
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6).split('');
    // Chỉ cho phép dán số
    if (pastedData.some(char => isNaN(char))) return;
    
    const newOtp = [...otp];
    pastedData.forEach((char, i) => {
      if (i < 6) newOtp[i] = char;
    });
    setOtp(newOtp);
    // Focus vào ô tiếp theo sau khi dán
    inputRefs.current[Math.min(pastedData.length, 5)].focus();
  };

  return (
    <div className="fixed inset-0 bg-[rgba(16,27,51,0.65)] backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
      <div className="bg-[var(--paper)] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-[u2-pop-in_0.2s_ease]">
        <div className="bg-[var(--navy)] p-5 relative text-center">
          <h3 className="font-['Bebas_Neue'] text-2xl text-[var(--amber)] tracking-wider m-0">XÁC THỰC BẢO MẬT</h3>
          <button onClick={onCancel} className="absolute top-4 right-5 text-[var(--ink-muted)] hover:text-white text-xl">✕</button>
        </div>
        
        <div className="p-6">
          <p className="text-center text-[var(--ink-muted)] text-sm mb-6">
            Mã OTP gồm 6 chữ số đã được gửi đến <span className="font-semibold text-[var(--navy)]">{email}</span>. Vui lòng nhập để xác nhận hành động này.
          </p>
          
          <div className="flex justify-between gap-2 mb-6">
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(el) => inputRefs.current[index] = el}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
                className="w-11 h-14 sm:w-12 sm:h-14 text-center text-xl font-bold border-[1.5px] border-[#E1E0D6] rounded-lg bg-[#FBFAF4] focus:border-[var(--teal)] focus:ring-[3px] focus:ring-[rgba(15,139,108,0.18)] outline-none transition-all text-[var(--navy)]"
              />
            ))}
          </div>
          
          <button 
            disabled={otp.join('').length !== 6}
            onClick={() => onVerify(otp.join(''))}
            className="w-full py-3 bg-[var(--amber)] text-[var(--navy)] font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--amber-dark)] transition-all shadow-[0_4px_14px_rgba(255,180,0,0.3)] hover:shadow-[0_6px_20px_rgba(255,180,0,0.4)]"
          >
            Xác thực & Lưu thay đổi
          </button>
          
          <div className="text-center mt-5">
            <span className="text-sm text-[var(--ink-muted)]">
              {countdown > 0 ? (
                `Gửi lại mã sau ${countdown}s`
              ) : (
                <button className="text-[var(--teal)] font-semibold hover:underline" onClick={() => setCountdown(60)}>
                  Gửi lại mã ngay
                </button>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}