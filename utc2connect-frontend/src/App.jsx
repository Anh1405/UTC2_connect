import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import io from 'socket.io-client'; // Thêm thư viện socket.io-client
import './App.css';

// Kết nối tới cổng 8081 của Spring Boot SocketIO Server
// Tự động lấy "localhost" hoặc "192.168.1.17" từ thanh địa chỉ trình duyệt, rồi ghép với cổng 8081
const socket = io('/', { 
  autoConnect: false,
  transports: ['websocket']
});
// Cấu hình STUN Server của Google để hỗ trợ kết nối NAT/Mạng Internet bên ngoài
const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};
function App() {
  const [isSearching, setIsSearching] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [videoLayout, setVideoLayout] = useState('pip');
  const [mode, setMode] = useState('login'); 

  // Form Đăng ký, Đăng nhập & Quên mật khẩu
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Trạng thái logic
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [userData, setUserData] = useState(null);

  // States bổ sung cho tính năng Chat và Trạng thái Phòng cuộc gọi
  const [roomID, setRoomID] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);

  // Các biến useRef quản lý phần cứng và kết nối mạng WebRTC
  const otpRefs = useRef([]);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnection = useRef(null);
  const localStream = useRef(null);
  const currentRoomID = useRef(null); 
  const pendingCandidates = useRef([]);

  // 1. Tự động soát vé lại khi F5 trang web nếu có token
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (savedToken && savedUser) {
      setUserData(JSON.parse(savedUser));
      setLoginSuccess(true);
    }
  }, []);

  // Effect mới: Tự động mở Camera/Mic khi đăng nhập thành công
useEffect(() => {
  if (!loginSuccess) {
    // Nếu đăng xuất, tắt camera để giải phóng tài nguyên phần cứng
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => track.stop());
      localStream.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    return;
  }

  async function startLocalVideo() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true // Để true nếu muốn test cả âm thanh cuộc gọi
      });
      localStream.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("❌ Không thể truy cập Camera/Microphone:", err);
      alert("Vui lòng cấp quyền truy cập Camera và Microphone để sử dụng tính năng này!");
    }
  }

  startLocalVideo();
}, [loginSuccess]);
  // 2. Kích hoạt camera/mic và lắng nghe các sự kiện báo hiệu (Signaling) khi Đăng nhập thành công
  useEffect(() => {
    if (!loginSuccess) {
      socket.disconnect();
      return;
    }

    socket.connect();

    socket.on('matched', async (data) => {
      console.log("👉 [WebRTC] 1. Ghép cặp thành công:", data);
      setRoomID(data.roomID); 
      currentRoomID.current = data.roomID; // Lưu ref chống trôi biến
      pendingCandidates.current = []; // Reset hàng đợi
      
      setIsSearching(false);
      setIsConnected(true);
      setChatMessages([{ sender: 'system', text: 'Hệ thống: Đã kết nối với một bạn học ẩn danh!' }]);

      peerConnection.current = new RTCPeerConnection(rtcConfig);

      // Nhận luồng video từ đối phương
      peerConnection.current.ontrack = (event) => {
        console.log("👉 [WebRTC] Xong! Đã nhận được video từ đối phương.");
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      // Tìm và đẩy luồng Candidate mạng
      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('send_ice_candidate', { roomID: currentRoomID.current, candidate: event.candidate });
        }
      };

      // Đẩy luồng video của chính mình vào
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => {
          peerConnection.current.addTrack(track, localStream.current);
        });
      }

      // NẾU LÀ NGƯỜI CHỦ ĐỘNG GỌI
      if (data.isInitiator) {
        console.log("👉 [WebRTC] 2. Tôi là Initiator, đang tạo Offer...");
        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);
        socket.emit('send_offer', { roomID: currentRoomID.current, offer: offer });
      } else if (data.isInitiator === undefined) {
        console.error("❌ LỖI NGHIÊM TRỌNG: Backend Spring Boot không trả về cờ 'isInitiator'!");
      }
    });

    socket.on('receive_offer', async (data) => {
      console.log("👉 [WebRTC] 3. Nhận được Offer, chuẩn bị trả lời...");
      if (!peerConnection.current) return;
      try {
        const offerData = data.offer ? data.offer : data;
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offerData));
        
        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);
        
        // Dùng currentRoomID ref để đảm bảo luôn gửi đúng phòng
        socket.emit('send_answer', { roomID: currentRoomID.current, answer: answer });

        // Xử lý các gói mạng bị kẹt
        pendingCandidates.current.forEach(c => peerConnection.current.addIceCandidate(c));
        pendingCandidates.current = [];
      } catch (err) {
        console.error("❌ Lỗi receive_offer:", err);
      }
    });

    socket.on('receive_answer', async (data) => {
      console.log("👉 [WebRTC] 4. Nhận được Answer, kết nối SDP thành công!");
      if (!peerConnection.current) return;
      try {
        const answerData = data.answer ? data.answer : data;
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answerData));

        // Xử lý các gói mạng bị kẹt
        pendingCandidates.current.forEach(c => peerConnection.current.addIceCandidate(c));
        pendingCandidates.current = [];
      } catch (err) {
        console.error("❌ Lỗi receive_answer:", err);
      }
    });

    socket.on('receive_ice_candidate', async (data) => {
      if (!peerConnection.current || !data) return;
      try {
        const candidateData = data.candidate ? data.candidate : data;
        const candidate = new RTCIceCandidate(candidateData);
        
        if (peerConnection.current.remoteDescription) {
          await peerConnection.current.addIceCandidate(candidate);
        } else {
          // Nếu SDP chưa setup xong, cất ICE vào hàng đợi để không bị rớt luồng
          pendingCandidates.current.push(candidate);
        }
      } catch (e) {
        console.error("❌ Lỗi add ICE Candidate: ", e);
      }
    });

    socket.on('receive_message', (data) => {
      if (data && data.content) {
        setChatMessages(prev => [...prev, { sender: 'stranger', text: data.content }]);
      }
    });

    socket.on('peer_disconnected', () => {
      console.log("👉 [WebRTC] Đối phương đã ngắt kết nối!");
      resetCurrentCall();
      setRoomID(null);
      setIsSearching(false);
      handleStartSearching();
      setChatMessages(prev => [...prev, { sender: 'system', text: 'Hệ thống: Bạn học đã rời phòng.' }]);
    });

    return () => {
      socket.off('matched');
      socket.off('receive_offer');
      socket.off('receive_answer');
      socket.off('receive_ice_candidate');
      socket.off('receive_message');
      socket.off('peer_disconnected');
    };
  }, [loginSuccess]);

  // Hàm dọn dẹp cuộc gọi hiện tại
  const resetCurrentCall = () => {
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setIsConnected(false);
  };

  // Phát lệnh tìm kiếm bạn bè lên Hàng đợi của Spring Boot
  const handleStartSearching = () => {
    setIsSearching(true);
    socket.emit('join_matchmaking', username);
  };

  // Hủy tìm kiếm
  const handleStopSearching = () => {
    setIsSearching(false);
    // Bạn có thể viết sự kiện leave hàng đợi ở đây nếu muốn
  };
const handleEndCall = () => {
    resetCurrentCall();
    if (roomID) {
      socket.emit('disconnect_call', roomID); // Dòng này báo cho server
    }
    setRoomID(null);
    setIsSearching(false);
  };
  // Xử lý khi bấm nút "Bỏ qua / Tìm người khác"
const handleNextUser = () => {
    resetCurrentCall();
    if (roomID) {
      socket.emit('disconnect_call', roomID); // Báo cho server trước khi qua người mới
    }
    setRoomID(null);
    handleStartSearching();
  };
  // Gửi tin nhắn văn bản
  const handleSendMessage = () => {
  if (!chatInput.trim() || !roomID) return;

  // Đảm bảo gửi đi cấu trúc rõ ràng: roomID và nội dung tin nhắn (content)
  socket.emit('send_message', {
    roomID: roomID,
    content: chatInput
  });

  setChatMessages(prev => [...prev, { sender: 'me', text: chatInput }]);
  setChatInput('');
};
const handleReportUser = () => {
    const reason = window.prompt("🚨 BÁO CÁO VI PHẠM:\nVui lòng nhập lý do (vd: Quấy rối, Ăn mặc phản cảm, Ngôn từ kích động...):");
    
    if (reason && reason.trim() !== "") {
      let base64Image = null;

      // 1. Xử lý chụp ảnh từ luồng video của đối phương qua remoteVideoRef
      const remoteVideo = remoteVideoRef.current;
      
      // Kiểm tra xem video đã load lên chưa và có kích thước không
      if (remoteVideo && remoteVideo.videoWidth > 0) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = remoteVideo.videoWidth;
          canvas.height = remoteVideo.videoHeight;
          
          const ctx = canvas.getContext('2d');
          // Vẽ khung hình hiện tại lên canvas
          ctx.drawImage(remoteVideo, 0, 0, canvas.width, canvas.height);
          
          // Xuất ra chuỗi Base64 (định dạng JPEG, chất lượng 80% để giảm dung lượng mạng)
          base64Image = canvas.toDataURL('image/jpeg', 0.8);
        } catch (err) {
          console.error("❌ Lỗi khi chụp màn hình bằng chứng:", err);
        }
      }

      // 2. Đóng gói và gửi sự kiện kèm ảnh lên Spring Boot
      socket.emit('report_user', {
        roomID: roomID,
        reason: reason,
        reporterUsername: userData?.username, // Người đi tố cáo
        screenshotBase64: base64Image         // ✨ Chuỗi ảnh chụp bằng chứng
      });

      alert("✅ Cảm ơn bạn. Báo cáo (kèm hình ảnh chứng cứ) đã được gửi tới hệ thống!");
      handleNextUser(); // Chuyển sang người khác lập tức để tránh tiếp tục nhìn thấy vi phạm
    }
  };
  // Reset thông báo khi chuyển đổi qua lại giữa các màn hình
  const switchMode = (targetMode) => {
    setMode(targetMode);
    setMessage('');
    setError('');
    setIsOtpSent(false);
    setUsername('');
    setPassword('');
    setNewPassword('');
    setOtp('');
  };

  // Xử lý gửi OTP (Đăng ký)
  const handleSendOtp = async () => {
    setMessage('');
    setError('');
    setLoading(true);
    try {
      const response = await axios.post('/api/auth/send-otp', { email });
      setMessage(response.data.message);
      setIsOtpSent(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra khi gửi OTP!');
    } finally {
      setLoading(false);
    }
  };

  // Xử lý gửi OTP (Quên mật khẩu)
  const handleSendForgotOtp = async () => {
    setMessage('');
    setError('');
    setLoading(true);
    try {
      const response = await axios.post('/api/auth/forgot-password/send-otp', { email });
      setMessage(response.data.message);
      setIsOtpSent(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra khi gửi mã đặt lại!');
    } finally {
      setLoading(false);
    }
  };

  // Xử lý hoàn tất Đăng ký
  const handleRegister = async () => {
    setMessage('');
    setError('');
    setLoading(true);
    try {
      const response = await axios.post('/api/auth/register', {
        email, username, password, otp
      });
      setMessage(response.data.message);
      setTimeout(() => { switchMode('login'); }, 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng ký thất bại, vui lòng kiểm tra lại!');
    } finally {
      setLoading(false);
    }
  };

  // Xử lý Đặt lại mật khẩu (Quên mật khẩu)
  const handleResetPassword = async () => {
    setMessage('');
    setError('');
    setLoading(true);
    try {
      const response = await axios.post('/api/auth/forgot-password/reset', {
        email, otp, newPassword
      });
      setMessage(response.data.message);
      setTimeout(() => { switchMode('login'); }, 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'Đặt lại mật khẩu thất bại!');
    } finally {
      setLoading(false);
    }
  };

  // Xử lý Đăng nhập
  const handleLogin = async () => {
  setMessage('');
  setError('');
  setLoading(true);
  try {
    const response = await axios.post('/api/auth/login', { username, password });
    
    // SỬA ĐOẠN NÀY: Lấy trực tiếp data trả về
    const data = response.data;
    
    setMessage(data.message);
    
    // Lưu object sạch vào state để không bị undefined
    const loggedInUser = { 
      username: data.username || username, // Nếu backend lỗi key thì lấy luôn username vừa gõ ở ô input
      email: data.email || '' 
    };
    
    setUserData(loggedInUser);
    setLoginSuccess(true);

    localStorage.setItem('token', data.accessToken);
    localStorage.setItem('user', JSON.stringify(loggedInUser));
  } catch (err) {
    setError(err.response?.data?.message || 'Đăng nhập thất bại, vui lòng kiểm tra lại!');
  } finally {
    setLoading(false);
  }
};

  // Xử lý Đăng xuất
  const handleLogout = () => {
    resetCurrentCall();
    if (roomID) socket.emit('disconnect_call', roomID);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUserData(null);
    setLoginSuccess(false);
    setMode('login');
    setMessage('');
    setError('');
  };

  // Ô nhập OTP tự nhảy
  const handleOtpChange = (index, raw) => {
    const digit = raw.replace(/[^0-9]/g, '').slice(-1);
    const arr = otp.padEnd(6, ' ').split('');
    arr[index] = digit || ' ';
    setOtp(arr.join('').trimEnd());
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
    if (e.key === 'Enter') {
      if (mode === 'register') handleRegister();
      if (mode === 'forgot') handleResetPassword();
    }
  };

  const otpDigits = Array.from({ length: 6 }, (_, i) => otp[i] || '');

  const getRouteCode = () => {
    if (mode === 'login') return 'CỔNG SOÁT VÉ ĐĂNG NHẬP';
    if (mode === 'register') return 'TUYẾN TÀU SV PHÂN HIỆU GTVT';
    return 'CẤP LẠI VÉ HÀNH TRÌNH';
  };

  const getTagline = () => {
    if (mode === 'login') return 'Xác thực vé vào hệ thống sinh viên';
    if (mode === 'register') return 'Vé lên tàu vào cộng đồng sinh viên UTC2';
    return 'Đặt lại mật khẩu truy cập hệ thống qua mã xác thực';
  };

  return (
    <div className="u2-page">
    {loginSuccess ? (
      <div className="u2-home-layout">
        {/* THANH ĐIỀU HƯỚNG TRÊN CÙNG */}
        <div className="u2-navbar">
          <div className="u2-nav-logo">UTC2 CONNECT</div>
          <div className="u2-user-pill">
            <span className="u2-user-name">● {userData?.username} (Trực tuyến)</span>
            <button className="u2-logout-btn" onClick={handleLogout}>Đăng xuất</button>
          </div>
        </div>

        {/* CỘT 1: THANH BÊN TRÁI (SIDEBAR) */}
        <div className="u2-sidebar">
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fb-muted)', padding: '0 12px 8px' }}>Tính năng</div>
          <div className="u2-menu-item active">📹 Video Call ngẫu nhiên</div>
          <div className="u2-menu-item">🛒 Chợ cũ sinh viên</div>
          <div className="u2-menu-item">🏢 Tìm phòng trọ / Ở ghép</div>
          <div style={{ height: 20 }} />
          <div style={{ padding: '0 12px', fontSize: 12, color: 'var(--ink-muted)' }}>
            Lưu ý: Tuân thủ quy tắc ứng xử cộng đồng sinh viên. Mọi hành vi phản cảm sẽ bị khóa tài khoản vĩnh viễn.
          </div>
        </div>

        {/* CỘT 2 & 3: KHÔNG GIAN VIDEO CALL VÀ CHAT */}
        <div className="u2-main-content call-mode">
          <div className={`u2-video-container ${videoLayout === 'split' ? 'split-mode' : ''}`}>
            <button
              className="layout-toggle-btn"
              onClick={() => setVideoLayout(videoLayout === 'pip' ? 'split' : 'pip')}
            >
              {videoLayout === 'pip' ? 'Chia đôi màn hình' : 'Chế độ thu nhỏ'}
            </button>

            {/* Khung video người lạ */}
            <div className="video-box remote-video">
              {!isSearching && !isConnected && (
                <div className="video-placeholder">
                  <h3>Sẵn sàng kết nối bạn bè UTC2?</h3>
                  <p>Nhấn nút "Tìm kiếm bạn bè" bên dưới để bắt đầu video call ngẫu nhiên.</p>
                </div>
              )}
              {isSearching && (
                <div className="video-placeholder searching">
                  <div className="spinner"></div>
                  <p>Đang tìm kiếm sinh viên ngẫu nhiên...</p>
                </div>
              )}
              {isConnected && (
                <div className="video-element-wrapper">
                  <div className="video-tag">Bạn học ẩn danh</div>
                  {/* Bỏ comment và gắn thẻ video thật vào đây */}
{/* Khung video người lạ */}
<video 
  ref={remoteVideoRef} 
  autoPlay 
  playsInline 
  style={{ 
    width: '100%', 
    height: '100%', 
    objectFit: 'cover',
    transform: 'scaleX(-1)' /* ✨ THÊM DÒNG NÀY ĐỂ LẬT HÌNH ẢNH CỦA ĐỐI PHƯƠNG */
  }} 
/>                </div>
              )}
            </div>

            {/* Khung video của chính mình */}
            <div className="video-box local-video">
              <div className="video-tag">Bạn ({userData?.username})</div>
              {/* Bỏ comment và gắn thẻ video thật vào đây */}
<video 
  ref={localVideoRef} 
  autoPlay 
  muted 
  playsInline 
  style={{ 
    width: '100%', 
    height: '100%', 
    objectFit: 'cover',
    transform: 'scaleX(-1)' /* ✨ THÊM DÒNG NÀY ĐỂ LẬT NHƯ SOI GƯƠNG */
  }} 
/>            </div>

            {/* Thanh điều khiển cuộc gọi (MỚI) */}
            <div className="video-controls">
              {/* Trạng thái 1: Chưa làm gì cả */}
              {!isSearching && !isConnected && (
                <button className="ctrl-btn start" onClick={handleStartSearching}>
                  Tìm kiếm bạn bè
                </button>
              )}

              {/* Trạng thái 2: Đang xoay chờ tìm người */}
              {isSearching && !isConnected && (
                <button className="ctrl-btn stop" onClick={handleStopSearching}>
                  Dừng tìm kiếm
                </button>
              )}

              {/* Trạng thái 3: Đã kết nối thành công (Hiện 3 nút) */}
              {isConnected && (
                <>
                  <button className="ctrl-btn stop" onClick={handleEndCall} style={{ backgroundColor: '#6c757d', marginRight: '10px' }}>
                    Kết thúc
                  </button>
                  
                  {/* THÊM NÚT BÁO CÁO VÀO ĐÂY */}
                  <button className="ctrl-btn stop" onClick={handleReportUser} style={{ backgroundColor: '#dc3545', marginRight: '10px' }}>
                    🚨 Báo cáo
                  </button>
                  
                  <button className="ctrl-btn next" onClick={handleNextUser}>
                    Bỏ qua / Tìm người khác
                  </button>
                </>
              )}
            </div>
          </div>

          {/* CỘT CHAT VĂN BẢN ĐI KÈM CẠNH VIDEO */}
          <div className="u2-chat-sidebar">
            <div className="chat-header">💬 Hộp trò chuyện</div>
            <div className="chat-messages">
              {chatMessages.map((msg, index) => (
                <div key={index} className={`chat-bubble ${msg.sender}`}>
                  {msg.text}
                </div>
              ))}
            </div>
            <div className="chat-input-area">
              <input 
                type="text" 
                placeholder="Nhập tin nhắn..." 
                disabled={!isConnected} 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              />
              <button disabled={!isConnected} onClick={handleSendMessage}>Gửi</button>
            </div>
          </div>
        </div>
      </div>
      ) : (
        /* GIAO DIỆN VÉ TÀU (ĐÃ GIỮ NGUYÊN HOÀN TOÀN LOGIC CỦA BẠN) */
        <div className="u2-ticket">
          <div className="u2-head">
            <div className="u2-route-code u2-mono">{getRouteCode()}</div>
            <div className="u2-wordmark u2-display">UTC2 CONNECT</div>
            <div className="u2-tagline">{getTagline()}</div>

            <div className="u2-stations">
              <div className="u2-dot on" />
              <div className="u2-track">
                <div className="u2-track-fill" style={{ width: mode === 'login' ? '50%' : (isOtpSent ? '100%' : '0%') }} />
              </div>
              <div className={`u2-dot ${isOtpSent || mode === 'login' ? 'on' : ''}`} />
            </div>
            <div className="u2-station-labels">
              <span>{mode === 'login' ? 'Điền thông tin' : 'Gửi OTP'}</span>
              <span>{mode === 'login' ? 'Khởi hành' : 'Xác thực'}</span>
            </div>
          </div>

          <div className="u2-perf" />

          <div className="u2-body">
            {message && <div className="u2-banner ok">{message}</div>}
            {error && <div className="u2-banner err">{error}</div>}

            {mode === 'login' && (
              <div>
                <label className="u2-label">Tên đăng nhập</label>
                <input type="text" placeholder="Nhập tên tài khoản..." value={username} onChange={(e) => setUsername(e.target.value)} className="u2-input" />
                <div style={{ height: 14 }} />

                <label className="u2-label">Mật khẩu</label>
                <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && username && password && handleLogin()} className="u2-input" />
                
                <div style={{ textAlign: 'right', marginTop: 6 }}>
                  <span className="u2-link" style={{ fontSize: 12, color: 'var(--ink-muted)' }} onClick={() => switchMode('forgot')}>
                    Quên mật khẩu?
                  </span>
                </div>
                <div style={{ height: 16 }} />

                <button className="u2-btn primary" disabled={loading || !username || !password} onClick={handleLogin}>
                  {loading ? 'Đang kiểm tra...' : 'Đăng nhập vào hệ thống'}
                </button>

                <div className="u2-switch-text">
                  Chưa có tài khoản? <span className="u2-link" onClick={() => switchMode('register')}>Đăng ký ngay</span>
                </div>
              </div>
            )}

            {mode === 'register' && (
              <div>
                {!isOtpSent ? (
                  <div>
                    <label className="u2-label">Email sinh viên</label>
                    <input type="email" placeholder="vd: nva@st.utc2.edu.vn" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()} className="u2-input" />
                    <div style={{ height: 18 }} />
                    <button className="u2-btn primary" disabled={loading || !email} onClick={handleSendOtp}>
                      {loading ? 'Đang gửi...' : 'Nhận mã OTP qua email'}
                    </button>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: 13, color: 'var(--ink-muted)', marginBottom: 18 }}>
                      Mã đã gửi tới <span style={{ color: 'var(--navy)', fontWeight: 600 }}>{email}</span>
                    </p>

                    <label className="u2-label">Tên đăng nhập</label>
                    <input type="text" placeholder="Nhập tên tài khoản..." value={username} onChange={(e) => setUsername(e.target.value)} className="u2-input" />
                    <div style={{ height: 14 }} />

                    <label className="u2-label">Mật khẩu</label>
                    <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="u2-input" />
                    <div style={{ height: 18 }} />

                    <label className="u2-label" style={{ textAlign: 'center' }}>Mã OTP (6 số)</label>
                    <div className="u2-otp-row">
                      {otpDigits.map((d, i) => (
                        <input key={i} ref={(el) => (otpRefs.current[i] = el)} className="u2-otp-box u2-mono" inputMode="numeric" maxLength={1} value={d} onChange={(e) => handleOtpChange(i, e.target.value)} onKeyDown={(e) => handleOtpKeyDown(i, e)} />
                      ))}
                    </div>
                    <div style={{ height: 20 }} />

                    <button className="u2-btn primary" disabled={loading || !username || !password || otp.length < 6} onClick={handleRegister}>
                      {loading ? 'Đang đăng ký...' : 'Hoàn tất đăng ký'}
                    </button>
                    <button className="u2-btn ghost" onClick={() => setIsOtpSent(false)}>← Thay đổi email</button>
                  </div>
                )}

                <div className="u2-switch-text">
                  Đã có tài khoản? <span className="u2-link" onClick={() => switchMode('login')}>Quay lại Đăng nhập</span>
                </div>
              </div>
            )}

            {mode === 'forgot' && (
              <div>
                {!isOtpSent ? (
                  <div>
                    <label className="u2-label">Nhập Email tài khoản cần lấy lại</label>
                    <input type="email" placeholder="vd: nva@st.utc2.edu.vn" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendForgotOtp()} className="u2-input" />
                    <div style={{ height: 18 }} />
                    <button className="u2-btn primary" disabled={loading || !email} onClick={handleSendForgotOtp}>
                      {loading ? 'Đang xác thực...' : 'Gửi mã xác thực mật khẩu'}
                    </button>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: 13, color: 'var(--ink-muted)', marginBottom: 18 }}>
                      Mã khôi phục đã gửi tới <span style={{ color: 'var(--navy)', fontWeight: 600 }}>{email}</span>
                    </p>

                    <label className="u2-label">Mật khẩu mới</label>
                    <input type="password" placeholder="Nhập mật khẩu mới..." value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="u2-input" />
                    <div style={{ height: 18 }} />

                    <label className="u2-label" style={{ textAlign: 'center' }}>Mã xác thực OTP (6 số)</label>
                    <div className="u2-otp-row">
                      {otpDigits.map((d, i) => (
                        <input key={i} ref={(el) => (otpRefs.current[i] = el)} className="u2-otp-box u2-mono" inputMode="numeric" maxLength={1} value={d} onChange={(e) => handleOtpChange(i, e.target.value)} onKeyDown={(e) => handleOtpKeyDown(i, e)} />
                      ))}
                    </div>
                    <div style={{ height: 20 }} />

                    <button className="u2-btn primary" disabled={loading || !newPassword || otp.length < 6} onClick={handleResetPassword}>
                      {loading ? 'Đang đổi mật khẩu...' : 'Xác nhận đặt lại mật khẩu'}
                    </button>
                    <button className="u2-btn ghost" onClick={() => setIsOtpSent(false)}>← Thay đổi email</button>
                  </div>
                )}

                <div className="u2-switch-text">
                  <span className="u2-link" onClick={() => switchMode('login')}>Quay lại Đăng nhập</span>
                </div>
              </div>
            )}
          </div>

          <div className="u2-stub">
            <span className="u2-mono" style={{ fontSize: 10, color: 'var(--ink-muted)', letterSpacing: '0.08em' }}>
              {mode === 'login' ? 'VÉ ĐĂNG NHẬP • UTC2-CONNECT' : mode === 'register' ? 'VÉ ĐĂNG KÝ • UTC2-CONNECT' : 'VÉ KHÔI PHỤC • UTC2-CONNECT'}
            </span>
            <div className="u2-barcode">
              {[3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3].map((w, i) => <span key={i} style={{ width: w }} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;