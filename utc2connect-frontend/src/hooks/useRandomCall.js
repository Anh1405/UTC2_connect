import { useState, useRef, useEffect, useCallback } from 'react';
import socket from '../services/socket';
import { rtcConfig } from '../config/rtcConfig';
import useLatest from './useLatest';
import useVoiceModeration from './useVoiceModeration';
import useVoiceViolations from './useVoiceViolations';
import { MAX_VOICE_VIOLATIONS } from '../config/appConfig';
// Ghép cặp ngẫu nhiên + WebRTC + kiểm duyệt giọng nói.
//  - localStream / ensureMicTrack: lấy từ useLocalCamera
//  - chat: { addSystemMessage, startConversation } lấy từ useChat
//  - onSessionExpired(reason): gọi khi socket bị từ chối (token hết hạn)
export default function useRandomCall({
  loginSuccess,
  userData,
  localStream,
  ensureMicTrack,
  chat,
  onSessionExpired,
}) {
  const [isSearching, setIsSearching] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [roomID, setRoomID] = useState(null);
  const [remoteUsername, setRemoteUsername] = useState(null);
  const [searchElapsed, setSearchElapsed] = useState(0);

  const remoteVideoRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const peerConnection = useRef(null);
  const currentRoomID = useRef(null);
  const pendingCandidates = useRef([]);
  const autoSearchTimeoutRef = useRef(null);

  // ----- Kiểm duyệt giọng nói -----
  const { violationCount, toxicWarning, registerViolation, resetViolations, notifySelfViolation } =
  useVoiceViolations({
    addSystemMessage: chat.addSystemMessage,
    onLimitReached: () => handleEndCall(),
  });
  const { startVoiceModeration, stopVoiceModeration } = useVoiceModeration({
  onToxic: (data, speakerName) => {
  const count = registerViolation(speakerName);
  if (count && currentRoomID.current) {
    socket.emit('voice_violation', { roomID: currentRoomID.current, count, max: MAX_VOICE_VIOLATIONS });
  }
},
  // 🌟 BỔ SUNG CALLBACK ONTRANSCRIPT TẠI ĐÂY:
  onTranscript: (transcriptText, speakerName, data) => {
    if (chat && (chat.addMessage || chat.sendMessage)) {
      // Gọi hàm thêm tin nhắn của useChat
      (chat.addMessage || chat.sendMessage)({
        id: Date.now(),
        text: transcriptText,
        sender: speakerName || 'Đối phương',
        isToxic: data?.is_toxic || false,
        isVoice: true,
      });
    }
  },
});

  // Hàm tiện cho việc kiểm thử banner: gõ window.__testToxicBanner() trong console
  useEffect(() => {
    window.__testToxicBanner = () => registerViolation(remoteUsername || 'Người kiểm thử');
    return () => {
      delete window.__testToxicBanner;
    };
  }, [remoteUsername, registerViolation]);

  // Đồng hồ chờ ghép cặp
  useEffect(() => {
    if (!isSearching) {
      setSearchElapsed(0);
      return;
    }
    const interval = setInterval(() => setSearchElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [isSearching]);
  // 🌟 Đảm bảo thẻ video đối phương luôn nhận stream kể cả khi React render chậm hơn WebRTC
useEffect(() => {
  if (isConnected && remoteVideoRef.current && remoteStreamRef.current) {
    remoteVideoRef.current.srcObject = remoteStreamRef.current;
  }
}, [isConnected]);
  // ----- Dọn dẹp / điều khiển cuộc gọi -----
  const resetCurrentCall = useCallback(() => {
    stopVoiceModeration();
    remoteStreamRef.current = null;
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setIsConnected(false);
    setRemoteUsername(null);
  }, [stopVoiceModeration]);

  const clearRoom = () => {
    setRoomID(null);
    currentRoomID.current = null;
  };

  const handleStartSearching = async () => {
    if (autoSearchTimeoutRef.current) clearTimeout(autoSearchTimeoutRef.current);
    if (isSearching) return;

    try {
      await ensureMicTrack();
    } catch (err) {
      console.error('❌ Lỗi khi bật Mic:', err);
      alert('Bạn cần cấp quyền Microphone để trò chuyện trên chuyến tàu này!');
      return;
    }

    setIsSearching(true);
    setIsConnected(false);
    socket.emit('join_matchmaking', userData?.username);
  };

  const handleStopSearching = () => {
    if (autoSearchTimeoutRef.current) clearTimeout(autoSearchTimeoutRef.current);
    setIsSearching(false);
    setIsConnected(false);
    socket.emit('leave_matchmaking', userData?.username);
  };

  const handleEndCall = () => {
    if (autoSearchTimeoutRef.current) clearTimeout(autoSearchTimeoutRef.current);
    resetCurrentCall();
    if (roomID) socket.emit('disconnect_call', roomID);
    clearRoom();
    setIsSearching(false);
    setIsConnected(false);
  };

  const latest = useLatest({
    userData,
    chat,
    onSessionExpired,
    notifySelfViolation,
    resetCurrentCall,
    handleStartSearching,
    startVoiceModeration,
    stopVoiceModeration,
    resetViolations,
  });

  const handleNextUser = () => {
    if (autoSearchTimeoutRef.current) clearTimeout(autoSearchTimeoutRef.current);
    resetCurrentCall();
    if (roomID) socket.emit('disconnect_call', roomID);
    clearRoom();
    setTimeout(() => latest.current.handleStartSearching(), 300);
  };

  // ----- Kết nối socket + báo hiệu WebRTC (chạy khi đăng nhập / đăng xuất) -----
  useEffect(() => {
    if (!loginSuccess) {
      socket.disconnect();
      return;
    }

    socket.io.opts.query = { token: localStorage.getItem('token') };
    socket.connect();

    const flushPendingCandidates = () => {
      pendingCandidates.current.forEach((c) => peerConnection.current.addIceCandidate(c));
      pendingCandidates.current = [];
    };

    const handleConnectError = (err) => {
      console.error('❌ Socket bị từ chối kết nối:', err.message);
      latest.current.onSessionExpired('Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại!');
    };

    const handleMatched = async (data) => {
      console.log('👉 [WebRTC] 1. Ghép cặp thành công:', data);
      const { userData: me, chat: chatApi } = latest.current;

      setRoomID(data.roomID);
      setRemoteUsername(data.opponentUsername || null);
      currentRoomID.current = data.roomID;
      pendingCandidates.current = [];

      setIsSearching(false);
      setIsConnected(true);
      chatApi.startConversation();
      latest.current.resetViolations();

      const pc = new RTCPeerConnection(rtcConfig);
      pc.oniceconnectionstatechange = () => console.log('🧊 ICE:', pc.iceConnectionState);
      pc.onconnectionstatechange = () => console.log('🔗 PC:', pc.connectionState);
      peerConnection.current = pc;

      pc.ontrack = (event) => {
  console.log('👉 [WebRTC] Xong! Đã nhận được video/audio từ đối phương.');
  const stream = event.streams[0];
  remoteStreamRef.current = stream;

  if (remoteVideoRef.current) {
    remoteVideoRef.current.srcObject = stream;
  }

  if (event.track.kind === 'audio') {
    latest.current.startVoiceModeration(stream, data.roomID, data.opponentUsername, me?.username);
  }
};

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('send_ice_candidate', { roomID: currentRoomID.current, candidate: event.candidate });
        }
      };

      if (localStream.current) {
        localStream.current.getTracks().forEach((track) => pc.addTrack(track, localStream.current));
      }

      if (data.isInitiator) {
        console.log('👉 [WebRTC] 2. Tôi là Initiator, đang tạo Offer...');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('send_offer', { roomID: currentRoomID.current, offer });
      } else if (data.isInitiator === undefined) {
        console.error("❌ LỖI NGHIÊM TRỌNG: Backend Spring Boot không trả về cờ 'isInitiator'!");
      }
    };

    const handleOffer = async (data) => {
      console.log('👉 [WebRTC] 3. Nhận được Offer, chuẩn bị trả lời...');
      if (!peerConnection.current) return;
      try {
        const offerData = data.offer ? data.offer : data;
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offerData));
        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);
        socket.emit('send_answer', { roomID: currentRoomID.current, answer });
        flushPendingCandidates();
      } catch (err) {
        console.error('❌ Lỗi receive_offer:', err);
      }
    };

    const handleAnswer = async (data) => {
      console.log('👉 [WebRTC] 4. Nhận được Answer, kết nối SDP thành công!');
      if (!peerConnection.current) return;
      try {
        const answerData = data.answer ? data.answer : data;
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answerData));
        flushPendingCandidates();
      } catch (err) {
        console.error('❌ Lỗi receive_answer:', err);
      }
    };

    const handleIceCandidate = async (data) => {
      if (!peerConnection.current || !data) return;
      try {
        const candidateData = data.candidate ? data.candidate : data;
        const candidate = new RTCIceCandidate(candidateData);
        if (peerConnection.current.remoteDescription) {
          await peerConnection.current.addIceCandidate(candidate);
        } else {
          pendingCandidates.current.push(candidate);
        }
      } catch (e) {
        console.error('❌ Lỗi add ICE Candidate: ', e);
      }
    };

    const handlePeerDisconnected = () => {
      if (!currentRoomID.current) return;
      console.log('👉 [WebRTC] Đối phương đã ngắt kết nối!');
      latest.current.resetCurrentCall();
      clearRoom();
      setIsConnected(false);
      latest.current.chat.addSystemMessage('Hệ thống: Hành khách kia đã rời đi. Đang tìm chuyến mới...');
      autoSearchTimeoutRef.current = setTimeout(() => latest.current.handleStartSearching(), 400);
    };
    // trong useEffect socket, cạnh các socket.on khác:
    const handleVoiceViolation = (d) => latest.current.notifySelfViolation(d?.count ?? 1, d?.max);
    socket.on('voice_violation', handleVoiceViolation);
    socket.on('connect_error', handleConnectError);
    socket.on('matched', handleMatched);
    socket.on('receive_offer', handleOffer);
    socket.on('receive_answer', handleAnswer);
    socket.on('receive_ice_candidate', handleIceCandidate);
    socket.on('peer_disconnected', handlePeerDisconnected);

    return () => {
      latest.current.stopVoiceModeration();
      socket.off('connect_error', handleConnectError);
      socket.off('matched', handleMatched);
      socket.off('receive_offer', handleOffer);
      socket.off('receive_answer', handleAnswer);
      socket.off('receive_ice_candidate', handleIceCandidate);
      socket.off('peer_disconnected', handlePeerDisconnected);
      socket.off('voice_violation', handleVoiceViolation);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginSuccess]);

  return {
    isSearching,
    isConnected,
    roomID,
    remoteUsername,
    searchElapsed,
    remoteVideoRef,
    remoteStreamRef,
    violationCount,
    toxicWarning,
    handleStartSearching,
    handleStopSearching,
    handleEndCall,
    handleNextUser,
  };
}
