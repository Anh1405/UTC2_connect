import { useRef, useEffect } from 'react';

// Quản lý camera/mic của chính mình.
// enabled: đã đăng nhập; active: đang ở mục "Chuyến tàu ngẫu nhiên"
export default function useLocalCamera({ enabled, active }) {
  const localVideoRef = useRef(null);
  const localStream = useRef(null);

  useEffect(() => {
    if (!enabled) {
      if (localStream.current) {
        localStream.current.getTracks().forEach((track) => track.stop());
        localStream.current = null;
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      return;
    }

    if (!active) return;

    async function restoreOrStartLocalVideo() {
      const stream = localStream.current;
      if (stream && stream.active && stream.getVideoTracks().some((t) => t.readyState === 'live')) {
        if (localVideoRef.current && localVideoRef.current.srcObject !== stream) {
          localVideoRef.current.srcObject = stream;
        }
        return;
      }

      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        localStream.current = newStream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = newStream;
        }
      } catch (err) {
        console.error('❌ Không thể truy cập Camera/Microphone:', err);
        alert('Vui lòng cấp quyền truy cập Camera và Microphone để sử dụng tính năng này!');
      }
    }

    restoreOrStartLocalVideo();
  }, [enabled, active]);

  // Bật mic (nếu chưa có) trước khi ghép cặp. Ném lỗi nếu bị từ chối quyền.
  const ensureMicTrack = async () => {
    const hasAudio = localStream.current?.getAudioTracks().length > 0;
    if (hasAudio) return;
    const audioStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true },
    });
    localStream.current.addTrack(audioStream.getAudioTracks()[0]);
  };

  return { localVideoRef, localStream, ensureMicTrack };
}
