// Hàng 6 ô nhập OTP
export default function OtpInput({ digits, inputRefs, onChange, onKeyDown, onPaste }) {
  return (
      <div
          className="u2-otp-row"
          style={{
            display: 'flex',
            gap: '8px',
            justifyContent: 'center',
            margin: '12px 0',
          }}
      >
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
                onPaste={onPaste}
                style={{
                  width: '44px',
                  height: '50px',
                  textAlign: 'center',
                  fontSize: '22px',
                  fontWeight: 'bold',
                  borderRadius: '6px',
                  border: '1.5px solid var(--ink-muted, #ccc)',
                  background: '#fff',
                  color: 'var(--ink, #111)',
                  outline: 'none',
                }}
            />
        ))}
      </div>
  );
}