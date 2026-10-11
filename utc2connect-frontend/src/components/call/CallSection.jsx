import { useState, useEffect } from 'react';
import RemoteVideoBox from './RemoteVideoBox';
import CallControls from './CallControls';
import CameraFilterMenu from './CameraFilterMenu';
import ChatPanel from './ChatPanel';

const iconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const ExitFullscreenIcon = () => (
  <svg {...iconProps}>
    <polyline points="4 14 10 14 10 20"></polyline>
    <polyline points="20 10 14 10 14 4"></polyline>
    <line x1="14" y1="10" x2="21" y2="3"></line>
    <line x1="3" y1="21" x2="10" y2="14"></line>
  </svg>
);

const EnterFullscreenIcon = () => (
  <svg {...iconProps}>
    <polyline points="9 4 4 4 4 9"></polyline>
    <line x1="4" y1="4" x2="10" y2="10"></line>
    <polyline points="15 20 20 20 20 15"></polyline>
    <line x1="20" y1="20" x2="14" y2="14"></line>
  </svg>
);

// Mục "Chuyến tàu ngẫu nhiên": video + điều khiển + chat
export default function CallSection({ username, call, camera, filters, chat, onOpenReport }) {
  const [videoLayout, setVideoLayout] = useState('pip'); // pip | split
  const [isFullScreen, setIsFullScreen] = useState(false);

  const { isConnected, remoteVideoRef, remoteStreamRef } = call;

  // Quay lại mục này khi đang gọi dở: gắn lại luồng video của đối phương
  useEffect(() => {
    if (isConnected && remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
  }, [isConnected, remoteVideoRef, remoteStreamRef]);

  const toggleFullScreen = () => {
    setIsFullScreen(!isFullScreen);
    if (!isFullScreen && window.innerWidth <= 900) setVideoLayout('pip');
  };

  return (
    <div className="u2-main-content call-mode">
      <div className={`u2-video-container layout-${videoLayout} ${isFullScreen ? 'fullscreen-mode' : ''}`}>
        <button className="layout-toggle-btn" onClick={() => setVideoLayout(videoLayout === 'pip' ? 'split' : 'pip')}>
          {videoLayout === 'pip' ? '🔲 Chia đôi toa tàu' : '🔳 Chế độ thu nhỏ (PiP)'}
        </button>

        <button className="fullscreen-toggle-btn" onClick={toggleFullScreen} title={isFullScreen ? 'Thu nhỏ' : 'Toàn màn hình'}>
          {isFullScreen ? <ExitFullscreenIcon /> : <EnterFullscreenIcon />}
        </button>

        {/* Khung video người lạ */}
        <RemoteVideoBox
          remoteFilter={filters.remoteFilter}
          isSearching={call.isSearching}
          isConnected={call.isConnected}
          searchElapsed={call.searchElapsed}
          remoteVideoRef={call.remoteVideoRef}
          violationCount={call.violationCount}
          toxicWarning={call.toxicWarning}
        />

        {/* Khung video của chính mình */}
        <div className={`video-box local-video filter-${filters.cameraFilter}`}>
          <div className="video-tag">Bạn ({username})</div>
          <video
            ref={camera.localVideoRef}
            autoPlay
            muted
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
          />
        </div>

        <CallControls
          isSearching={call.isSearching}
          isConnected={call.isConnected}
          onStart={call.handleStartSearching}
          onStopSearching={call.handleStopSearching}
          onEndCall={call.handleEndCall}
          onReport={onOpenReport}
          onNext={call.handleNextUser}
        />

        <CameraFilterMenu filters={filters} />
      </div>

      <ChatPanel chat={chat} roomID={call.roomID} isConnected={call.isConnected} />
    </div>
  );
}
