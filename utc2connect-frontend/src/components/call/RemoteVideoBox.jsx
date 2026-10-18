import DepartureBoard from './DepartureBoard';
import { MAX_VOICE_VIOLATIONS } from '../../config/appConfig';

const violationBadgeStyle = {
  position: 'absolute',
  top: 10,
  right: 10,
  zIndex: 5,
  background: 'rgba(220,38,38,0.85)',
  color: '#fff',
  padding: '4px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 600,
};

const toxicBannerStyle = {
  position: 'absolute',
  top: 10,
  left: 10,
  right: 10,
  zIndex: 5,
  background: 'rgba(220,38,38,0.92)',
  color: '#fff',
  padding: '8px 12px',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 500,
  textAlign: 'center',
  boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
};

const videoStyle = { width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' };

// Khung video của người lạ (kèm màn hình chờ + cảnh báo vi phạm giọng nói)
export default function RemoteVideoBox({
  remoteFilter,
  isSearching,
  isConnected,
  searchElapsed,
  remoteVideoRef,
  violationCount,
  toxicWarning,
}) {
  return (
    <div className={`video-box remote-video filter-${remoteFilter}`}>
      {!isSearching && !isConnected && (
        <div className="video-placeholder">
          <h3>Sẵn sàng lên chuyến tàu UTC2?</h3>
          <p>Nhấn nút "Bắt đầu hành trình" bên dưới để ghép phòng cùng một bạn học ẩn danh.</p>
        </div>
      )}

      {isSearching && <DepartureBoard searchElapsed={searchElapsed} />}

      {isConnected && (
        <div className="video-element-wrapper">
          <div className="video-tag">Hành khách bí ẩn</div>
          {violationCount > 0 && (
            <div style={violationBadgeStyle}>
              Vi phạm giọng nói: {violationCount}/{MAX_VOICE_VIOLATIONS}
            </div>
          )}
          {toxicWarning && <div style={toxicBannerStyle}>{toxicWarning}</div>}
          <video ref={remoteVideoRef} autoPlay playsInline style={videoStyle} />
        </div>
      )}
    </div>
  );
}
