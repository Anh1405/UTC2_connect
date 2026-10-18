// Hàng 6 ô nhập OTP
export default function OtpInput({ digits, inputRefs, onChange, onKeyDown }) {
  return (
    <div className="u2-otp-row">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (inputRefs.current[i] = el)}
          className="u2-otp-box u2-mono"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={(e) => onChange(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
        />
      ))}
    </div>
  );
}
