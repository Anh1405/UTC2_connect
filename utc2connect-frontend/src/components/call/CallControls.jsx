// Thanh nút điều khiển cuộc gọi
export default function CallControls({
  isSearching,
  isConnected,
  onStart,
  onStopSearching,
  onEndCall,
  onReport,
  onNext,
}) {
  return (
    <div className="video-controls">
      {!isSearching && !isConnected && (
        <button className="ctrl-btn start" onClick={onStart}>
          🚂 Bắt đầu hành trình
        </button>
      )}
      {isSearching && !isConnected && (
        <button className="ctrl-btn stop" onClick={onStopSearching}>
          Xuống tàu / Dừng tìm
        </button>
      )}
      {isConnected && (
        <>
          <button className="ctrl-btn stop" onClick={onEndCall} style={{ marginRight: '10px' }}>
            Rời toa tàu
          </button>
          <button className="ctrl-btn stop" onClick={onReport} style={{ marginRight: '10px' }}>
            Tố cáo vi phạm
          </button>
          <button className="ctrl-btn next" onClick={onNext}>
            Đổi toa / Tìm người khác
          </button>
        </>
      )}
    </div>
  );
}
