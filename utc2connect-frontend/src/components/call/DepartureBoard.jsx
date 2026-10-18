import { formatElapsed } from '../../utils/formatTime';

// Bảng "chuyến tàu" hiển thị trong lúc chờ ghép cặp
export default function DepartureBoard({ searchElapsed }) {
  return (
    <div className="video-placeholder u2-departure-board">
      <div className="u2-board-header">
        <span className="u2-mono">GA UTC2 CONNECT</span>
        <span className="u2-board-live">● LIVE</span>
      </div>
      <div className="u2-board-row">
        <span className="u2-board-label u2-mono">CHUYẾN</span>
        <span className="u2-board-flip u2-mono">SV–NGẪU·NHIÊN</span>
        <span className="u2-board-label u2-mono">GIỜ CHỜ</span>
        <span className="u2-board-flip u2-mono">{formatElapsed(searchElapsed)}</span>
      </div>
      <div className="u2-station-scene">
        <svg className="u2-scene-bg" viewBox="0 0 400 130" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="u2sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--navy)" />
              <stop offset="100%" stopColor="var(--navy-light)" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="400" height="130" fill="url(#u2sky)" />
          <path d="M0 95 L40 65 L75 90 L110 55 L150 92 L190 68 L230 95 L270 60 L310 90 L350 70 L400 95 L400 130 L0 130 Z" fill="var(--navy-light)" opacity="0.6" />
          {[30, 130, 230, 330].map((x, i) => (
            <g key={i}>
              <line x1={x} y1="30" x2={x} y2="95" stroke="var(--ink-muted)" strokeWidth="1.5" opacity="0.4" />
              <line x1={x - 14} y1="32" x2={x + 14} y2="32" stroke="var(--ink-muted)" strokeWidth="1.2" opacity="0.4" />
            </g>
          ))}
          <path d="M16 34 Q100 46 116 34 Q216 46 232 34 Q316 46 332 34" stroke="var(--amber)" strokeWidth="1" fill="none" opacity="0.35" />
          <rect x="0" y="95" width="400" height="10" fill="var(--amber)" opacity="0.15" />
          <line x1="0" y1="112" x2="400" y2="112" stroke="var(--amber)" strokeWidth="2" opacity="0.5" />
          <line x1="0" y1="118" x2="400" y2="118" stroke="var(--amber)" strokeWidth="2" opacity="0.5" />
          {Array.from({ length: 34 }).map((_, i) => (
            <rect key={i} x={i * 12} y="110" width="6" height="10" fill="var(--ink-muted)" opacity="0.35" />
          ))}
          <rect x="30" y="60" width="3" height="35" fill="var(--ink-muted)" opacity="0.5" />
          <circle cx="31.5" cy="58" r="5" fill="var(--amber)" opacity="0.6" />
          <rect x="340" y="55" width="3" height="40" fill="var(--ink-muted)" opacity="0.5" />
          <circle cx="341.5" cy="53" r="5" fill="var(--amber)" opacity="0.6" />
        </svg>
        <div className="u2-train-wrapper">
          <svg className="u2-train-img" viewBox="0 0 380 90" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="u2NoseGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--amber-dark)" />
                <stop offset="55%" stopColor="var(--amber)" />
                <stop offset="100%" stopColor="#FFC93C" />
              </linearGradient>
              <radialGradient id="u2Headlight" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FFF7D6" stopOpacity="1" />
                <stop offset="100%" stopColor="#FFF7D6" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="u2Trail" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--amber)" stopOpacity="0.45" />
                <stop offset="100%" stopColor="var(--amber)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <rect x="302" y="38" width="78" height="3" fill="url(#u2Trail)" />
            <rect x="302" y="50" width="78" height="2" fill="url(#u2Trail)" opacity="0.7" />
            <line x1="70" y1="14" x2="70" y2="2" stroke="var(--ink-muted)" strokeWidth="1.5" />
            <line x1="70" y1="2" x2="90" y2="2" stroke="var(--ink-muted)" strokeWidth="1.5" />
            <path d="M18,70 L18,44 Q18,16 48,14 L94,14 L94,70 Z" fill="url(#u2NoseGrad)" />
            <path d="M30,44 Q31,22 52,18 L80,18 L80,44 Z" fill="var(--navy)" opacity="0.9" />
            <circle cx="26" cy="52" r="10" fill="url(#u2Headlight)" />
            <circle cx="26" cy="52" r="4" fill="#FFF7D6" />
            <circle cx="30" cy="76" r="6" fill="var(--navy)" />
            <circle cx="70" cy="76" r="6" fill="var(--navy)" />
            <rect x="94" y="16" width="200" height="54" fill="var(--paper)" stroke="var(--amber)" strokeWidth="2" />
            <rect x="94" y="16" width="200" height="10" fill="var(--amber)" />
            {[106, 130, 154, 178, 202, 226, 250, 274].map((x, i) => (
              <rect key={i} x={x} y="30" width="16" height="18" rx="2" fill="var(--navy)" opacity="0.85" />
            ))}
            <text x="284" y="66" textAnchor="end" fontFamily="'Bebas Neue', sans-serif" fontSize="16" fill="var(--navy)" fontWeight="700" letterSpacing="1">
              UTC2
            </text>
            <circle cx="108" cy="76" r="6" fill="var(--navy)" />
            <circle cx="180" cy="76" r="6" fill="var(--navy)" />
            <circle cx="280" cy="76" r="6" fill="var(--navy)" />
            <rect x="296" y="16" width="70" height="54" rx="4" fill="var(--teal)" opacity="0.9" />
            <rect x="306" y="30" width="14" height="18" rx="2" fill="var(--paper)" opacity="0.9" />
            <rect x="328" y="30" width="14" height="18" rx="2" fill="var(--paper)" opacity="0.9" />
            <rect x="350" y="30" width="14" height="18" rx="2" fill="var(--paper)" opacity="0.9" />
            <circle cx="310" cy="76" r="6" fill="var(--navy)" />
            <circle cx="352" cy="76" r="6" fill="var(--navy)" />
          </svg>
        </div>
      </div>
      <p className="u2-board-status">
        Đang xếp bạn lên toa cùng một hành khách bí ẩn<span className="u2-dots">...</span>
      </p>
    </div>
  );
}
