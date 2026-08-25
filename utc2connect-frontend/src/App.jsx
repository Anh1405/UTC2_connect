import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import io from 'socket.io-client'; // Thêm thư viện socket.io-client
import './App.css';
 Update-new-code-04

import * as toxicity from '@tensorflow-models/toxicity';
import EmojiPicker, { Categories } from 'emoji-picker-react';
import { GiphyFetch } from '@giphy/js-fetch-api';
import DOMPurify from 'dompurify';
import GifPicker from './components/GifPicker';
import { Grid, Carousel } from '@giphy/react-components'; // Thêm Carousel
import { searchGifs } from './services/giphy';            // Thêm API search
import useDebounce from './hooks/useDebounce';            // Thêm custom hook

// Các import khác giữ nguyên...
// Khởi tạo Giphy API (Nên dùng key của riêng bạn)
const gf = new GiphyFetch(import.meta.env.VITE_GIPHY_KEY);
const backendUrl = `http://${window.location.hostname}:8081`;

const socket = io('/', { 
  autoConnect: false,
  path: '/socket.io', // Đường dẫn này trùng với cấu hình '/socket.io' trong vite.config.js
  transports: ['websocket', 'polling'] // Nên thêm 'polling' để dự phòng nếu mạng bên ngoài chặn websocket
});
// Cấu hình STUN Server của Google để hỗ trợ kết nối NAT/Mạng Internet bên ngoài
const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};
function App() {
  const [isSearching, setIsSearching] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [videoLayout, setVideoLayout] = useState('pip');
  const [isFullScreen, setIsFullScreen] = useState(false);
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
  const autoSearchTimeoutRef = useRef(null);
  // state quản lý bộ lọc camera vào phần khai báo state đầu component App() của bạn:
  const [cameraFilter, setCameraFilter] = useState('none');
  const [remoteFilter, setRemoteFilter] = useState('none');
  const [showFilters, setShowFilters] = useState(false);
 Update-new-code-04

  // State quản lý AI Content Moderator
  const [toxicityModel, setToxicityModel] = useState(null);
  const [isAILoading, setIsAILoading] = useState(true);
  // State cho Modal Báo cáo vi phạm
const [showReportModal, setShowReportModal] = useState(false);
const [reportReasonId, setReportReasonId] = useState(null);
const [reportDetail, setReportDetail] = useState('');
const [reportScreenshot, setReportScreenshot] = useState(null);
const [reportStatus, setReportStatus] = useState('idle'); // idle | sending | done
const [remoteUsername, setRemoteUsername] = useState(null);
const [searchElapsed, setSearchElapsed] = useState(0);
const [showEmojiPicker, setShowEmojiPicker] = useState(false);
const [showGifPicker, setShowGifPicker] = useState(false);
const [gifSearchTerm, setGifSearchTerm] = useState('');
 Update-new-code-06
const debouncedChatInput = useDebounce(chatInput, 600); // Đợi 600ms sau khi ngừng gõ mới tìm
const [hideAutoGif, setHideAutoGif] = useState(false);  // Dùng để ẩn gợi ý nếu user bấm tắt (X)
 Update-new-code-04
 master
// THÊM 2 DÒNG NÀY VÀO:
const [showOtpModal, setShowOtpModal] = useState(false);
const [deviceOtp, setDeviceOtp] = useState('');


// Nếu có từ khóa thì gọi API search, nếu không có thì gọi API trending
// Nếu có từ khóa thì gọi API search, nếu không có thì gọi API trending
//const fetchGifs = (offset) => {
  //if (gifSearchTerm.trim()) {
    // Thêm tham số lang: 'vi' vào đây để Giphy trả kết quả theo tiếng Việt
 Update-new-code-06
   // return gf.search(gifSearchTerm, { offset, limit: 10, lang: 'vi' });
  //}
  //return gf.trending({ offset, limit: 10 });
//};

    return gf.search(gifSearchTerm, { offset, limit: 10, lang: 'vi' });
  }
  return gf.trending({ offset, limit: 10 });
};
 Update-new-code-04
 master
  // Kiểm tra "vé" (JWT) đã hết hạn hay chưa, chỉ đọc phần payload (không cần verify chữ ký,
  // việc verify thật sự vẫn do backend làm) — dùng để tự phát hiện sớm ở phía Client.
  const isTokenExpired = (token) => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (!payload.exp) return false; // Không có exp thì không tự kết luận là hết hạn
      return Date.now() >= payload.exp * 1000;
    } catch (err) {
      // Token lỗi định dạng / bị chỉnh sửa -> coi như hết hạn luôn cho an toàn
      return true;
    }
  };

  // Dọn dẹp toàn bộ state đăng nhập + quay về màn hình Đăng nhập.
  // Dùng chung cho: token hết hạn khi F5, và bị Server từ chối kết nối Socket (connect_error).
  const forceLogoutToLogin = (reason) => {
    resetCurrentCall();
    socket.disconnect();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUserData(null);
    setLoginSuccess(false);
    setMode('login');
    setRoomID(null);
    currentRoomID.current = null;
    if (reason) alert(reason);
  };


  // 1. Tự động soát vé lại khi F5 trang web nếu có token
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (savedToken && savedUser) {
      if (isTokenExpired(savedToken)) {
        // 🎫 Vé đã hết hạn từ trước -> không cho vào thẳng, dọn dẹp và để màn hình Đăng nhập hiện ra
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        return;
      }
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
        audio: false // Để true nếu muốn test cả âm thanh cuộc gọi
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

    // 🔒 BẢO MẬT: Lấy token và gắn vào URL Query (Dành cho Java Spring Boot)
    const token = localStorage.getItem('token');
    
    // Gắn token vào query thay vì auth
    socket.io.opts.query = { token: token };
    
    socket.connect();

    // 🎫 Server từ chối bắt tay (vé giả / vé hết hạn) -> không lặng thinh nữa,
    // tự động dọn state và đưa người dùng quay lại màn hình Đăng nhập.
    socket.on('connect_error', (err) => {
      console.error("❌ Socket bị từ chối kết nối:", err.message);
      forceLogoutToLogin("Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại!");
    });

    // 🔄 Server đã chặn tin nhắn (spam / AI phát hiện vi phạm / hệ thống kiểm duyệt lỗi)
    // -> gỡ đúng tin nhắn đó khỏi khung chat của mình (đã lỡ hiển thị lạc quan trước đó)
    // và báo rõ lý do, tránh gây ảo giác "tin đã gửi thành công" trong khi thực ra chưa hề tới người kia.
    // 🔄 Xử lý tin nhắn bị Backend từ chối
socket.on('message_blocked', (data) => {
  const { tempId, message } = data || {};
  
  let blockedText = ''; // Biến để "cứu" lại nội dung tin nhắn

  setChatMessages(prev => {
    // 1. Tìm lại tin nhắn bị gỡ để lấy nội dung
    const blockedMsg = prev.find(m => m.tempId === tempId);
    if (blockedMsg) {
      blockedText = blockedMsg.text;
    }

    // 2. Gỡ bỏ tin nhắn giả định (Optimistic UI)
    const filteredMessages = prev.filter(m => m.tempId !== tempId);
    
    // 3. Hiển thị thông báo lý do chặn
    return [...filteredMessages, {
      sender: 'system',
      text: `⚠️ ${message || 'Tin nhắn của bạn không được gửi.'}`
    }];
  });

  // 4. KIỂM TRA: Nếu tin nhắn bị chặn do API đang khởi động hoặc lỗi mạng (Fail-Closed)
  // (Dựa vào các từ khoá lỗi mà Backend trả về)
  const isSystemError = message && (
    message.toLowerCase().includes('khởi động') || 
    message.toLowerCase().includes('thử lại') || 
    message.toLowerCase().includes('lỗi')
  );

  // Nếu là lỗi server chứ không phải do người dùng chửi thề -> Trả lại text vào ô nhập
  if (isSystemError && blockedText) {
    // Dùng setTimeout để đảm bảo State chatInput update độc lập và mượt mà
    setTimeout(() => {
      setChatInput(blockedText);
    }, 100);
  }
});

    socket.on('matched', async (data) => {
      console.log("👉 [WebRTC] 1. Ghép cặp thành công:", data);
      setRoomID(data.roomID); 
      setRemoteUsername(data.opponentUsername || null);
      currentRoomID.current = data.roomID; // Lưu ref chống trôi biến
      pendingCandidates.current = []; // Reset hàng đợi
      
      setIsSearching(false);
      setIsConnected(true);
      setChatMessages([{ sender: 'system', text: 'Hệ thống: Đã kết nối với một bạn học ẩn danh!' }]);
      
      const rtcConfig = {
  iceServers: [
      {
        urls: "stun:stun.relay.metered.ca:80",
      },
      {
        urls: "turn:global.relay.metered.ca:80",
        username: "31d00c2d771b258511393e6a",
        credential: "cP/hRVNrNseRYzO9",
      },
      {
        urls: "turn:global.relay.metered.ca:80?transport=tcp",
        username: "31d00c2d771b258511393e6a",
        credential: "cP/hRVNrNseRYzO9",
      },
      {
        urls: "turn:global.relay.metered.ca:443",
        username: "31d00c2d771b258511393e6a",
        credential: "cP/hRVNrNseRYzO9",
      },
      {
        urls: "turns:global.relay.metered.ca:443?transport=tcp",
        username: "31d00c2d771b258511393e6a",
        credential: "cP/hRVNrNseRYzO9",
      },
  ]
};
      
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
        // Tự động nhận diện nếu link chứa 'giphy.com' thì ép kiểu thành GIF
        const isGifLink = data.content.includes('giphy.com/media');
        
        setChatMessages(prev => [...prev, { 
          sender: 'stranger', 
          text: data.content,
          type: data.type || (isGifLink ? 'gif' : 'text') // 👈 Cập nhật dòng này
        }]);
      }
    });

    socket.on('peer_disconnected', () => {
  if (!currentRoomID.current) return;

  console.log("👉 [WebRTC] Đối phương đã ngắt kết nối!");
  resetCurrentCall();
  setRoomID(null);
  currentRoomID.current = null;
  
  setIsConnected(false);

  setChatMessages(prev => [...prev, { 
    sender: 'system', 
    text: 'Hệ thống: Hành khách kia đã rời đi. Đang tìm chuyến mới...' 
  }]);

  // Tự động tìm lại sau 400ms
  autoSearchTimeoutRef.current = setTimeout(() => {
    handleStartSearching();
  }, 400);
});
    socket.on('receive_filter', (data) => {
      if (data && data.filterType) {
        setRemoteFilter(data.filterType);
      }
    });
    socket.on('report_result', ({ success, message }) => {
  if (success) {
    setReportStatus('done');
    setTimeout(() => {
      setShowReportModal(false);
      handleNextUser();
    }, 1100);
  } else {
    setReportStatus('idle');
    alert('❌ Gửi báo cáo thất bại: ' + (message || 'Vui lòng thử lại.'));
  }
});
    return () => {
      socket.off('connect_error');
      socket.off('message_blocked');
      socket.off('matched');
      socket.off('receive_offer');
      socket.off('receive_answer');
      socket.off('receive_ice_candidate');
      socket.off('receive_message');
      socket.off('peer_disconnected');
      socket.off('receive_filter');
      socket.off('report_result');
    };
  }, [loginSuccess]);
 Update-new-code-04

// Effect mới: Khởi tạo mô hình Trí tuệ nhân tạo kiểm duyệt từ ngữ
  useEffect(() => {
    const loadAI = async () => {
      try {
        // TĂNG ĐỘ GẮT GAO: Giảm từ 0.85 xuống 0.65
        const threshold = 0.65; 
        
        const model = await toxicity.load(threshold, ['toxicity', 'insult', 'threat', 'obscene']);
        setToxicityModel(model);
        setIsAILoading(false);
        console.log("🤖 [AI Moderator] Bộ lọc ngôn ngữ AI đã sẵn sàng hoạt động với độ nhạy cao!");
      } catch (err) {
        console.error("❌ [AI Moderator] Lỗi tải AI:", err);
        setIsAILoading(false);
      }
    };
    loadAI();
  }, []);
  useEffect(() => {
    if (chatInput.trim().length > 0) {
      setHideAutoGif(false);
    }
  }, [chatInput]);

  // 1. TẠO BỘ TỪ ĐIỂN DỊCH NGẦM TỪ TIẾNG VIỆT SANG TIẾNG ANH CHO GIPHY
  const mapVietnameseToGiphy = (text) => {
    const lowerText = text.toLowerCase().trim();

    // Bạn có thể tự do thêm bớt từ vựng vào danh sách này
    const dictionary = {
      'hello': ['chào', 'xin chào', 'hi', 'alo', 'helo', 'hé lô'],
      'laugh': ['cười', 'haha', 'hihi', 'hehe', 'lmao', 'kaka', 'mắc cười','kkk'],
      'sad': ['buồn', 'chán', 'khóc', 'tủi thân', 'rớt nước mắt', 'huhu'],
      'angry': ['tức', 'giận', 'cáu', 'điên', 'quạu', 'bực', 'ghét'],
      'love': ['yêu', 'thích', 'thả tim', 'iu', 'mãi yêu', 'yêu quá'],
      'sleep': ['ngủ', 'buồn ngủ', 'ngáp', 'khò'],
      'eat': ['ăn', 'đói', 'măm', 'thèm ăn'],
      'ok': ['ok', 'oke', 'được', 'duyệt', 'nhất trí', 'triển'],
      'facepalm': ['bó tay', 'cạn lời', 'chịu', 'bất lực', 'chán nản', 'bó chiếu'],
      'wow': ['wow', 'đỉnh', 'xuất sắc', 'ghê', 'đỉnh quá', 'ngạc nhiên'],
      'congratulations': ['chúc mừng', 'tuyệt vời', 'tung hoa', 'giỏi'],
      'sorry': ['xin lỗi', 'sorry', 'sory', 'xl', 'tội lỗi'],
      'bye': ['tạm biệt', 'bye', 'bai', 'pp', 'đi ngủ đây'],
      'what': ['cái gì', 'hả', 'ủa', 'what', 'sao', 'là sao'],
      'no': ['không', 'đéo', 'éo', 'no', 'chê', 'đừng'],
      'yes': ['có', 'dạ', 'vâng', 'yes', 'chuẩn'],
      'dance': ['quẩy', 'nhảy', 'lên luôn', 'phiêu'],
      'cry': ['khóc', 'huhu', 'mít ướt', 'nước mắt']
    };

    // Quét xem câu người dùng gõ có chứa từ khóa tiếng Việt nào không
    for (const [enWord, vnWords] of Object.entries(dictionary)) {
      if (vnWords.some(vw => lowerText.includes(vw))) {
        return enWord; // Trả về từ tiếng Anh tương ứng để Giphy hiểu
      }
    }

    return lowerText; // Nếu không nằm trong từ điển, cứ mang nguyên chữ VN đi tìm
  };

  // 2. CẬP NHẬT LẠI HÀM GỌI API ĐỂ SỬ DỤNG BỘ TỪ ĐIỂN
  const fetchAutoGifs = useCallback((offset) => {
    if (!debouncedChatInput || debouncedChatInput.trim().length < 2) {
      return Promise.resolve({ data: [] });
    }

    // Đưa chữ VN qua máy lọc để lấy chữ Tiếng Anh
    const smartQuery = mapVietnameseToGiphy(debouncedChatInput);
    
    // Gửi chữ tiếng Anh lên Giphy
    return searchGifs(smartQuery, { offset, limit: 10 });
  }, [debouncedChatInput]);
  useEffect(() => {
  if (!isSearching) { setSearchElapsed(0); return; }
  const interval = setInterval(() => setSearchElapsed(prev => prev + 1), 1000);
  return () => clearInterval(interval);
}, [isSearching]);

const formatElapsed = (s) => {
  const m = String(Math.floor(s / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${m}:${sec}`;
};
  // Hàm dọn dẹp cuộc gọi hiện tại
  const resetCurrentCall = () => {
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setIsConnected(false);
    setRemoteUsername(null);
  };

 Update-new-code-04
 const handleStartSearching = async () => {
    if (autoSearchTimeoutRef.current) {
      clearTimeout(autoSearchTimeoutRef.current);
    }

    if (isSearching) return;

    // 👈 THÊM ĐOẠN NÀY: Yêu cầu bật Mic và ghép vào luồng hình ảnh đang có
    try {
      const hasAudio = localStream.current?.getAudioTracks().length > 0;
      if (!hasAudio) {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioTrack = audioStream.getAudioTracks()[0];
        localStream.current.addTrack(audioTrack); // Trộn mic vào camera
      }
    } catch (err) {
      console.error("❌ Lỗi khi bật Mic:", err);
      alert("Bạn cần cấp quyền Microphone để trò chuyện trên chuyến tàu này!");
      return; // Chặn không cho ghép cặp nếu từ chối mic
    }

    setIsSearching(true);
    setIsConnected(false);
    socket.emit('join_matchmaking', userData?.username);
  };


  // Phát lệnh tìm kiếm bạn bè lên Hàng đợi của Spring Boot
 const handleStartSearching = () => {
  if (autoSearchTimeoutRef.current) {
    clearTimeout(autoSearchTimeoutRef.current);
  }

  // Bảo vệ: không join nhiều lần
  if (isSearching) return;

  setIsSearching(true);
  setIsConnected(false);
  socket.emit('join_matchmaking', userData?.username);
};


  // Hủy tìm kiếm (khi đang searching mà chưa match)
const handleStopSearching = () => {
  if (autoSearchTimeoutRef.current) {
    clearTimeout(autoSearchTimeoutRef.current);
  }
  setIsSearching(false);
  setIsConnected(false);
  socket.emit('leave_matchmaking', userData?.username);
};

// Kết thúc cuộc gọi (rời toa tàu)
const handleEndCall = () => {
  if (autoSearchTimeoutRef.current) clearTimeout(autoSearchTimeoutRef.current);
  
  resetCurrentCall();
  if (roomID) {
    socket.emit('disconnect_call', roomID);
  }
  
  setRoomID(null);
  currentRoomID.current = null;
  setIsSearching(false);
  setIsConnected(false);
};

// Bỏ qua / Tìm người khác (Next user)
const handleNextUser = () => {
  if (autoSearchTimeoutRef.current) clearTimeout(autoSearchTimeoutRef.current);
  
  resetCurrentCall();
  if (roomID) {
    socket.emit('disconnect_call', roomID);
  }
  
  setRoomID(null);
  currentRoomID.current = null;
  
  // Delay nhẹ để backend kịp dọn phòng
  setTimeout(() => {
    handleStartSearching();
  }, 300);
};
  // ==========================================================
 Update-new-code-04
  // LỚP 1: BỘ LỌC TỪ NGỮ SIÊU NHẸ TẠI FRONTEND (REGEX & SET)

  // TÍCH HỢP AI CONTENT MODERATOR VÀO HÀM GỬI TIN NHẮN
  // ==========================================================
  const handleSendMessage = async () => {
    if (!chatInput.trim() || !roomID) return;
    
 Update-new-code-04
    // Lọc XSS bằng DOMPurify
    const rawText = chatInput.trim();
    const textToCheck = DOMPurify.sanitize(rawText);
    

    // 🔒 BẢO MẬT XSS: Lọc sạch mã độc ngay khi vừa nhận được chuỗi
    const rawText = chatInput.trim();
    const textToCheck = DOMPurify.sanitize(rawText);
    
    // Nếu user cố tình chỉ gửi mã độc (bị lọc sạch sẽ thành chuỗi rỗng) thì chặn luôn

    if (!textToCheck) {
        setChatInput('');
        return;
    }
 Update-new-code-04
    
    const textLower = textToCheck.toLowerCase();

   // 1. CHUẨN BỊ BỘ LỌC TIẾNG VIỆT
    // Vá lỗ hổng: Xóa SẠCH mọi ký tự đặc biệt, dấu câu, nháy đơn, nháy kép...
const textWithoutPunctuation = textLower.replace(/[!@#$%^&*(),.?":{}|<>'\-=_+[\]\\;/~`]/g, '');    
    // Tách câu thành các từ rời rạc
    const words = textWithoutPunctuation.split(/\s+/);

    const vietnameseBadWords = new Set([
       'ngu', 'địt', 'đụ', 'lồn', 'cặc', 'đm', 'vcl', 'đĩ', 'phò',
      'đcm', 'đmm', 'cc', 'cl', 'lol', 'lồz', 'cứt', 'bitch', 'fuck', 'shit', 
      'loz', 'lon', 'cac', 'vkl', 'dkm', 'vl', 'ml', 'clgt','concac'
    ]);

    const violentPhrases = ['đánh chết', 'giết', 'mẹ mày', 'bố mày', 'thằng ranh', 'đấm chết', 'đập chết'];

    // 2. KIỂM TRA VI PHẠM (Lớp 1)
    const hasBadWord = words.some(word => vietnameseBadWords.has(word));
    // Dùng textWithoutPunctuation để check cụm từ luôn, chặn trò lách luật kiểu 'đ-ụ m-ẹ'
    const hasViolentPhrase = violentPhrases.some(phrase => textWithoutPunctuation.includes(phrase));

    if (hasBadWord || hasViolentPhrase) {
      setChatMessages(prev => [...prev, { 
        sender: 'system', 
        text: '🛑 Tin nhắn chứa ngôn từ tục tĩu hoặc bạo lực! Đã bị chặn bởi hệ thống.' 

    const textLower = textToCheck.toLowerCase();

    // 1. Chặn gửi nếu AI đang khởi động
    if (isAILoading) {
      setChatMessages(prev => [...prev, { 
        sender: 'system', 
        text: '⏳ Vui lòng đợi vài giây để hệ thống an ninh mạng khởi động...' 
      }]);
      return;
    }

    // 2. Mở rộng bộ lọc Tiếng Việt cực gắt (Bao gồm từ lóng, viết tắt, bạo lực)
    const vietnameseBadWords = [
      'chó', 'ngu', 'địt', 'đụ', 'lồn', 'cặc', 'đm', 'vcl', 'đĩ', 'phò',
      'đcm', 'đmm', 'cc', 'cl', 'lol', 'lồz', 'đánh chết', 'giết', 'mẹ mày',
      'bố mày', 'thằng ranh', 'cứt', 'bitch', 'fuck', 'shit', 'đấm','loz','lon','cac'
    ]; 

    // Quét chuỗi để tìm từ vi phạm
    const hasBadWord = vietnameseBadWords.some(word => textLower.includes(word));

    if (hasBadWord) {
      setChatMessages(prev => [...prev, { 
        sender: 'system', 
        text: '🛑Tin nhắn chứa ngôn từ tục tĩu hoặc bạo lực!' 
      }]);
      setChatInput('');
      return; 
    }

 Update-new-code-04
    // 3. NẾU QUA ĐƯỢC LỚP 1 -> GỬI LÊN CHO SPRING BOOT (LỚP 2) XỬ LÝ TIẾP
    // tempId dùng để đối chiếu lại nếu Server chặn tin nhắn này (rate limit / AI kiểm duyệt / lỗi hệ thống)
    const tempId = generateUUID();
    socket.emit('send_message', {
      roomID: roomID,
      type: 'text',
      content: textToCheck,
      tempId: tempId
    });

    // Tạm hiển thị tin nhắn của mình trước cho mượt (Optimistic UI)
    // Lưu kèm tempId để có thể GỠ lại đúng tin nhắn này nếu Server từ chối
    setChatMessages(prev => [...prev, { sender: 'me', text: textToCheck, tempId }]);

    // 3. Bộ lọc AI với độ nhạy cao (Dành cho Tiếng Anh / Ngữ cảnh ẩn)
    if (toxicityModel) {
      try {
        const predictions = await toxicityModel.classify([textToCheck]);
        
        // Xem điểm số thực tế AI chấm cho câu này trong tab Console (F12)
        console.log("🔍 Kết quả AI quét câu: [" + textToCheck + "]", predictions);

        // Kiểm tra xem có nhãn nào bị AI "tuýt còi" không
        const isToxic = predictions.some(p => p.results[0].match === true);

        if (isToxic) {
          setChatMessages(prev => [...prev, { 
            sender: 'system', 
            text: '🛑Tin nhắn có tính chất tiêu cực, bạo lực hoặc đe dọa!' 
          }]);
          setChatInput('');
          return;
        }
      } catch (error) {
        console.error("❌ Lỗi AI:", error);
      }
    }

    // 4. Cho phép gửi đi nếu an toàn
    // Ví dụ cấu trúc mới gửi lên server
  socket.emit('send_message', {
      roomID: roomID,
      type: 'text',
      content: textToCheck // <-- Đổi chuỗi cố định thành biến textToCheck ở đây
    });

    setChatMessages(prev => [...prev, { sender: 'me', text: textToCheck }]);
    setChatInput('');
  };
  // Xử lý khi user bấm chọn 1 Emoji
const handleEmojiClick = (emojiObject) => {
  setChatInput(prev => prev + emojiObject.emoji);
};
 Update-new-code-04
// Tạo UUID không phụ thuộc Web Crypto API — crypto.randomUUID() chỉ hoạt động trong "secure context"
// (HTTPS hoặc localhost). Nếu app chạy qua HTTP thường (IP LAN, domain chưa có SSL...), gọi thẳng
// crypto.randomUUID() sẽ throw lỗi -> device_id không lưu được -> mỗi lần vào lại bị coi là thiết bị mới.
const generateUUID = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        try {
            return crypto.randomUUID();
        } catch (err) {
            // Bị chặn ngoài secure context -> rơi xuống fallback bên dưới, không throw ra ngoài
        }
    }
    // Fallback UUID v4 thủ công, không cần Web Crypto, chạy được trên mọi trình duyệt/giao thức
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};
const getDeviceId = () => {
    let deviceId = localStorage.getItem("device_id");
    if (!deviceId) {
        deviceId = generateUUID(); // Tạo chuỗi UUID ngẫu nhiên, không phụ thuộc secure context
        localStorage.setItem("device_id", deviceId);
    }
    return deviceId;
};
// Xử lý khi user bấm chọn 1 ảnh GIF
 Update-new-code-06
// Thay thế hàm cũ bằng đoạn này:
const handleGifClick = (gif) => {
  // Lấy URL an toàn
  const gifUrl = gif?.images?.fixed_height?.url || gif?.images?.original?.url;
  if (!gifUrl) return;
  // Gửi lên server

const handleGifClick = (gif, e) => {
  e.preventDefault();
  // Lấy URL của ảnh GIF
  const gifUrl = gif.images.fixed_height.url; 



// Xử lý khi user bấm chọn 1 ảnh GIF
const handleGifClick = (gif, e) => {
  e.preventDefault();
  // Lấy URL của ảnh GIF
  const gifUrl = gif.images.fixed_height.url; 

  // Gửi ngay lập tức qua Socket.IO với type: 'gif'
 master
  socket.emit('send_message', {
    roomID: roomID,
    type: 'gif',
    content: gifUrl
  });
  // Hiển thị ở client
  setChatMessages(prev => [...prev, { sender: 'me', text: gifUrl, type: 'gif' }]);
  setShowGifPicker(false);
  setGifSearchTerm('');
};
// Danh sách lý do report — sát với bối cảnh sinh viên UTC2
const REPORT_REASONS = [
  { id: 'harass',  label: 'Quấy rối / lời lẽ khiếm nhã', icon: '😡' },
  { id: 'nudity',  label: 'Ăn mặc phản cảm / nội dung nhạy cảm', icon: '🔞' },
  { id: 'hate',    label: 'Ngôn từ thù ghét, phân biệt', icon: '🚫' },
  { id: 'scam',    label: 'Lừa đảo / mạo danh sinh viên UTC2', icon: '🎭' },
  { id: 'spam',    label: 'Spam / quảng cáo', icon: '📢' },
  { id: 'threat',  label: 'Đe dọa, kích động bạo lực', icon: '⚠️' },
  { id: 'other',   label: 'Khác', icon: '❓' },
];

// Mở "biên bản sự cố" — tự động chụp ảnh bằng chứng ngay lúc mở
const handleOpenReport = () => {
  let base64Image = null;
  const remoteVideo = remoteVideoRef.current;

  if (remoteVideo && remoteVideo.videoWidth > 0) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = remoteVideo.videoWidth;
      canvas.height = remoteVideo.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(remoteVideo, 0, 0, canvas.width, canvas.height);
      base64Image = canvas.toDataURL('image/jpeg', 0.8);
    } catch (err) {
      console.error("❌ Lỗi khi chụp màn hình bằng chứng:", err);
    }
  }

  setReportScreenshot(base64Image);
  setReportReasonId(null);
  setReportDetail('');
  setReportStatus('idle');
  setShowReportModal(true);
};

// Gửi báo cáo thật sự lên Spring Boot
const handleSubmitReport = () => {
  if (!reportReasonId) return;
  const reasonLabel = REPORT_REASONS.find(r => r.id === reportReasonId)?.label;
  const finalReason = reportDetail.trim() ? `${reasonLabel} — ${reportDetail.trim()}` : reasonLabel;

  setReportStatus('sending');

  socket.emit('report_user', {
    roomID: roomID,
    reason: finalReason,
    reporterUsername: userData?.username,
    reportedUsername: remoteUsername,
    screenshotBase64: reportScreenshot
  }); // 👈 KHÔNG còn callback ack ở đây nữa

  // Fallback vẫn giữ, phòng khi mất kết nối
  setTimeout(() => {
    if (reportStatus === 'sending') {
      setReportStatus('idle');
      alert('❌ Không nhận được phản hồi từ máy chủ. Vui lòng thử lại.');
    }
  }, 5000);
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
 Update-new-code-04
    const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username: username,
            password: password,
            deviceId: getDeviceId() // 👈 Gửi kèm ID thiết bị
        })
    });

    const data = await response.json();

    if (response.ok) {
        if (data.requireOtp) {
            // 🛑 PHÁT HIỆN THIẾT BỊ LẠ!
            alert(data.message);
            // Hiện Popup / Modal để User nhập mã OTP từ Email
            setShowOtpModal(true); 
        } else {
            // ✅ THIẾT BỊ QUEN -> Cho vào thẳng
            localStorage.setItem("token", data.accessToken);
            
            // --- THÊM 3 DÒNG NÀY ---
            const currentUser = { username: username };
            localStorage.setItem("user", JSON.stringify(currentUser));
            setUserData(currentUser);
            setLoginSuccess(true); 
            // -----------------------
            
            alert("Đăng nhập thành công!");
        }
    } else {
        alert(data.message);
    }
};

// Hàm khi user bấm "Xác nhận OTP thiết bị mới" trong Modal:
const handleVerifyDeviceOtp = async (otpCode) => {
    const response = await fetch("/api/auth/login/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username: username,
            otp: otpCode,
            deviceId: getDeviceId()
        })
    });

    const data = await response.json();

    if (response.ok) {
        localStorage.setItem("token", data.accessToken);
        
        // --- THÊM 3 DÒNG NÀY ---
        const currentUser = { username: username };
        localStorage.setItem("user", JSON.stringify(currentUser));
        setUserData(currentUser);
        setLoginSuccess(true);
        // -----------------------
        
        alert("Xác nhận thiết bị thành công!");
        setShowOtpModal(false);
    } else {
        alert(data.message);
    }

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
const handleFilterChange = (type) => {
    setCameraFilter(type); 
    if (roomID) {
      socket.emit('send_filter', { roomID: roomID, filterType: type });
    }
  };
  // Xử lý Đăng xuất
  const handleLogout = () => {
    if (roomID) socket.emit('disconnect_call', roomID);
    forceLogoutToLogin();
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
        <div className="u2-nav-brand">
          <span className="u2-nav-mark">U2</span>
          <span className="u2-nav-logo">
            <span className="u2-nav-logo-top">UTC2</span>
            <b>CONNECT</b>
          </span>
        </div>
        <div className="u2-user-pill">
          <span className="u2-user-avatar">{userData?.username?.charAt(0)?.toUpperCase() || '?'}</span>
          <span className="u2-user-info">
            <span className="u2-user-name">{userData?.username}</span>
            <span className="u2-user-status">Trực tuyến</span>
          </span>
          <button className="u2-logout-btn" onClick={handleLogout}>Đăng xuất</button>
        </div>
      </div>

      {/* CỘT 1: THANH BÊN TRÁI (SIDEBAR) */}
      <div className="u2-sidebar">
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fb-muted)', padding: '0 12px 8px' }}>Tính năng</div>
        <div className="u2-menu-item active">📹 Chuyến tàu ngẫu nhiên</div>
        <div className="u2-menu-item">🛒 Chợ cũ sinh viên</div>
        <div className="u2-menu-item">🏢 Tìm phòng trọ / Ở ghép</div>
        
        {/* Đã xóa trắng phần bộ lọc camera ở đây */}

        <div style={{ height: 20 }} />
        <div style={{ padding: '0 12px', fontSize: 12, color: 'var(--ink-muted)' }}>
          Lưu ý: Tuân thủ quy tắc ứng xử cộng đồng sinh viên. Mọi hành vi phản cảm sẽ bị khóa tài khoản vĩnh viễn.
        </div>
      </div>

      {/* CỘT 2 & 3: KHÔNG GIAN VIDEO CALL VÀ CHAT */}
      <div className="u2-main-content call-mode">
        {/* Dynamic class tương ứng với chế độ hiển thị pip hoặc split */}
        <div className={`u2-video-container layout-${videoLayout} ${isFullScreen ? 'fullscreen-mode' : ''}`}>
          
          <button
            className="layout-toggle-btn"
            onClick={() => setVideoLayout(videoLayout === 'pip' ? 'split' : 'pip')}
          >
            {videoLayout === 'pip' ? '🔲 Chia đôi toa tàu' : '🔳 Chế độ thu nhỏ (PiP)'}
          </button>

          {/* Nút Phóng to / Thu nhỏ toàn màn hình (Icon góc dưới trái) */}
          <button
            className="fullscreen-toggle-btn"
Update-new-code-04
            onClick={() => {
              setIsFullScreen(!isFullScreen);
              // CHỈ ép về PiP nếu bật Toàn màn hình TRÊN ĐIỆN THOẠI (chiều rộng <= 900px)
              if (!isFullScreen && window.innerWidth <= 900) {
                setVideoLayout('pip');
              }
            }}

            onClick={() => setIsFullScreen(!isFullScreen)}
            title={isFullScreen ? "Thu nhỏ" : "Toàn màn hình"}
          >
            {isFullScreen ? (
              /* Icon Thu nhỏ (Mũi tên hướng vào) */
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20"></polyline>
                <polyline points="20 10 14 10 14 4"></polyline>
                <line x1="14" y1="10" x2="21" y2="3"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
            ) : (
              /* Icon Phóng to giống ảnh của bạn (Mũi tên hướng ra) */
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 4 4 4 4 9"></polyline>
                <line x1="4" y1="4" x2="10" y2="10"></line>
                <polyline points="15 20 20 20 20 15"></polyline>
                <line x1="20" y1="20" x2="14" y2="14"></line>
              </svg>
            )}
          </button>

          {/* Khung video người lạ (Hành khách bí ẩn) */}
          <div className={`video-box remote-video filter-${remoteFilter}`}>
            {!isSearching && !isConnected && (
              <div className="video-placeholder">
                <h3>Sẵn sàng lên chuyến tàu UTC2?</h3>
                <p>Nhấn nút "Bắt đầu hành trình" bên dưới để ghép phòng cùng một bạn học ẩn danh.</p>
              </div>
            )}
            
            {/* HIỆU ỨNG ĐOÀN TÀU CHẠY THAY SPINNER */}
            {isSearching && (
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

    {/* ===== KHUNG CẢNH NHÀ GA ===== */}
    <div className="u2-station-scene">
      <svg className="u2-scene-bg" viewBox="0 0 400 130" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="u2sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="var(--navy)" />
      <stop offset="100%" stopColor="var(--navy-light)" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="400" height="130" fill="url(#u2sky)" />

  {/* Dãy núi xa */}
  <path d="M0 95 L40 65 L75 90 L110 55 L150 92 L190 68 L230 95 L270 60 L310 90 L350 70 L400 95 L400 130 L0 130 Z"
        fill="var(--navy-light)" opacity="0.6" />

  {/* ===== DÂY ĐIỆN TRÊN CAO (CATENARY) ===== */}
  {[30, 130, 230, 330].map((x, i) => (
    <g key={i}>
      <line x1={x} y1="30" x2={x} y2="95" stroke="var(--ink-muted)" strokeWidth="1.5" opacity="0.4" />
      <line x1={x - 14} y1="32" x2={x + 14} y2="32" stroke="var(--ink-muted)" strokeWidth="1.2" opacity="0.4" />
    </g>
  ))}
  <path d="M16 34 Q100 46 116 34 Q216 46 232 34 Q316 46 332 34"
        stroke="var(--amber)" strokeWidth="1" fill="none" opacity="0.35" />

  {/* Sân ga */}
  <rect x="0" y="95" width="400" height="10" fill="var(--amber)" opacity="0.15" />
  {/* Đường ray */}
  <line x1="0" y1="112" x2="400" y2="112" stroke="var(--amber)" strokeWidth="2" opacity="0.5" />
  <line x1="0" y1="118" x2="400" y2="118" stroke="var(--amber)" strokeWidth="2" opacity="0.5" />
  {Array.from({ length: 34 }).map((_, i) => (
    <rect key={i} x={i * 12} y="110" width="6" height="10" fill="var(--ink-muted)" opacity="0.35" />
  ))}

  {/* Cột đèn ga */}
  <rect x="30" y="60" width="3" height="35" fill="var(--ink-muted)" opacity="0.5" />
  <circle cx="31.5" cy="58" r="5" fill="var(--amber)" opacity="0.6" />
  <rect x="340" y="55" width="3" height="40" fill="var(--ink-muted)" opacity="0.5" />
  <circle cx="341.5" cy="53" r="5" fill="var(--amber)" opacity="0.6" />
</svg>

      {/* ===== ĐOÀN TÀU UTC2 CHẠY QUA (Đã kéo dài) ===== */}
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

  {/* ===== VỆT SÁNG CHUYỂN ĐỘNG PHÍA ĐUÔI TÀU (Cập nhật vị trí x) ===== */}
  <rect x="302" y="38" width="78" height="3" fill="url(#u2Trail)" />
  <rect x="302" y="50" width="78" height="2" fill="url(#u2Trail)" opacity="0.7" />

  {/* Dây tiếp điện (pantograph) nối lên trần */}
  <line x1="70" y1="14" x2="70" y2="2" stroke="var(--ink-muted)" strokeWidth="1.5" />
  <line x1="70" y1="2" x2="90" y2="2" stroke="var(--ink-muted)" strokeWidth="1.5" />

  {/* ===== ĐẦU TÀU KHÍ ĐỘNG HỌC ===== */}
  <path d="M18,70 L18,44 Q18,16 48,14 L94,14 L94,70 Z" fill="url(#u2NoseGrad)" />
  {/* Kính chắn gió */}
  <path d="M30,44 Q31,22 52,18 L80,18 L80,44 Z" fill="var(--navy)" opacity="0.9" />
  {/* Đèn pha */}
  <circle cx="26" cy="52" r="10" fill="url(#u2Headlight)" />
  <circle cx="26" cy="52" r="4" fill="#FFF7D6" />
  {/* Bánh đầu tàu */}
  <circle cx="30" cy="76" r="6" fill="var(--navy)" />
  <circle cx="70" cy="76" r="6" fill="var(--navy)" />

  {/* ===== TOA CHÍNH — CHỮ UTC2 (Kéo dài width từ 120 lên 200) ===== */}
  <rect x="94" y="16" width="200" height="54" fill="var(--paper)" stroke="var(--amber)" strokeWidth="2" />
  <rect x="94" y="16" width="200" height="10" fill="var(--amber)" />
  
  {/* Thêm cửa sổ cho toa dài */}
  {[106, 130, 154, 178, 202, 226, 250, 274].map((x, i) => (
    <rect key={i} x={x} y="30" width="16" height="18" rx="2" fill="var(--navy)" opacity="0.85" />
  ))}
  
  {/* Cập nhật vị trí chữ UTC2 dựa trên chiều dài mới */}
  <text x="284" y="66" textAnchor="end" fontFamily="'Bebas Neue', sans-serif"
        fontSize="16" fill="var(--navy)" fontWeight="700" letterSpacing="1">UTC2</text>
        
  {/* Thêm bánh xe cho toa dài */}
  <circle cx="108" cy="76" r="6" fill="var(--navy)" />
  <circle cx="180" cy="76" r="6" fill="var(--navy)" />
  <circle cx="280" cy="76" r="6" fill="var(--navy)" />

  {/* ===== TOA PHỤ (đuôi tàu - đã chỉnh ngang bằng toa trắng) ===== */}
  {/* Cập nhật y="16" và height="54" để bằng kích thước toa chính */}
  <rect x="296" y="16" width="70" height="54" rx="4" fill="var(--teal)" opacity="0.9" />
  
  {/* Cập nhật y="30" và height="18" để cửa sổ cũng ngang hàng với cửa sổ toa chính */}
  <rect x="306" y="30" width="14" height="18" rx="2" fill="var(--paper)" opacity="0.9" />
  <rect x="328" y="30" width="14" height="18" rx="2" fill="var(--paper)" opacity="0.9" />
  <rect x="350" y="30" width="14" height="18" rx="2" fill="var(--paper)" opacity="0.9" />
  
  {/* Bánh xe giữ nguyên vì đã khớp sẵn */}
  <circle cx="310" cy="76" r="6" fill="var(--navy)" />
  <circle cx="352" cy="76" r="6" fill="var(--navy)" />
</svg>
      </div>
    </div>

    <p className="u2-board-status">
      Đang xếp bạn lên toa cùng một hành khách bí ẩn<span className="u2-dots">...</span>
    </p>
  </div>
)}
            
            {isConnected && (
              <div className="video-element-wrapper">
                <div className="video-tag">Hành khách bí ẩn</div>
                <video 
                  ref={remoteVideoRef} 
                  autoPlay 
                  playsInline 
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'cover',
                    transform: 'scaleX(-1)'
                  }} 
                />
              </div>
            )}
          </div>

          {/* Khung video của chính mình (Local Video) kèm Filter Class */}
          <div className={`video-box local-video filter-${cameraFilter}`}>
            <div className="video-tag">Bạn ({userData?.username})</div>
            <video 
              ref={localVideoRef} 
              autoPlay 
              muted 
              playsInline 
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'cover',
                transform: 'scaleX(-1)'
              }} 
            />            
          </div>

          {/* Thanh điều khiển cuộc gọi */}
          <div className="video-controls">
            {!isSearching && !isConnected && (
              <button className="ctrl-btn start" onClick={handleStartSearching}>
                🚂 Bắt đầu hành trình
              </button>
            )}

            {isSearching && !isConnected && (
              <button className="ctrl-btn stop" onClick={handleStopSearching}>
                Xuống tàu / Dừng tìm
              </button>
            )}

            {isConnected && (
              <>
                <button className="ctrl-btn stop" onClick={handleEndCall} style={{ marginRight: '10px' }}>
  Rời toa tàu
</button>

<button className="ctrl-btn stop" onClick={handleOpenReport} style={{ marginRight: '10px' }}>
  Tố cáo vi phạm
</button>
                
                <button className="ctrl-btn next" onClick={handleNextUser}>
                  Đổi toa / Tìm người khác
                </button>
              </>
            )}
          </div>
          {/* Nút cục tròn đổi màu kiểu Azar (Đặt bên trong u2-video-container) */}
<div className="azar-filter-wrapper">
  {/* Nút tròn nổi */}
  <button 
    className="azar-magic-btn" 
    onClick={() => setShowFilters(!showFilters)}
    title="Chỉnh màu Camera"
  >
    ✨
  </button>

  {/* Menu xổ lên khi bấm vào nút */}
  {showFilters && (
    <div className="azar-filter-menu">
      <button 
        className={cameraFilter === 'none' ? 'active' : ''} 
        onClick={() => handleFilterChange('none')}
      >
        Gốc
      </button>
      <button 
        className={cameraFilter === 'beauty' ? 'active' : ''} 
        onClick={() => handleFilterChange('beauty')}
      >
        Làm mịn da
      </button>
    </div>
  )}
</div>
        </div>

        {/* CỘT CHAT VĂN BẢN ĐI KÈM CẠNH VIDEO */}
        <div className="u2-chat-sidebar">
          <div className="chat-header">💬 Trò chuyện trên toa</div>
          <div className="chat-messages">
  {chatMessages.map((msg, index) => (
    <div key={index} className={`chat-bubble ${msg.sender}`}>
      
      {/* Kiểm tra phân loại tin nhắn */}
      {msg.type === 'gif' ? (
        <img 
          src={msg.text} 
          alt="GIF" 
          style={{ maxWidth: '100%', borderRadius: '8px' }} 
        />
      ) : (
        msg.text
      )}
      
    </div>
  ))}
</div>
         <div className="chat-input-area">
            <div className="chat-toolbar-container" style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
  
               {/* --- BẢNG GỢI Ý GIF TỰ ĐỘNG (GỌN GÀNG NHƯ TIKTOK) --- */}
              {debouncedChatInput.trim().length >= 2 && !hideAutoGif && (
                <div className="u2-inline-gif-suggestions">
                  
                  {/* Nút X nổi lơ lửng góc phải (Floating Button) */}
                  <button className="u2-inline-gif-close" onClick={() => setHideAutoGif(true)} title="Đóng">✕</button>

                  <div className="u2-inline-gif-carousel">
                    <Carousel
                      key={debouncedChatInput}
                      fetchGifs={fetchAutoGifs}
                      gifHeight={85} /* 👈 Đã giảm từ 110 xuống 85 để dải GIF lùn & gọn hơn */
                      gutter={4}     /* 👈 Giảm khoảng cách giữa các ảnh */
                      noLink={true}
                      onGifClick={(gif, e) => {
                        e.preventDefault();
                        handleGifClick(gif);
                        setChatInput('');
                      }}
                    />
                  </div>
                </div>
              )}
              {/* ------------------------------------------- */}
  
  {/* BẢNG CHỌN EMOJI */}
{showEmojiPicker && (
  <div className="u2-picker-popup">
    <EmojiPicker
      onEmojiClick={handleEmojiClick}
      theme="light"
      width={300}
      height={380}
      searchPlaceHolder="Tìm biểu tượng cảm xúc..."
      previewConfig={{ showPreview: false }}
      skinTonesDisabled
      lazyLoadEmojis
      categories={[
        { category: Categories.SUGGESTED, name: 'Hay dùng' },
        { category: Categories.SMILEYS_PEOPLE, name: 'Mặt cười & Con người' },
        { category: Categories.ANIMALS_NATURE, name: 'Động vật & Thiên nhiên' },
        { category: Categories.FOOD_DRINK, name: 'Đồ ăn & Thức uống' },
        { category: Categories.TRAVEL_PLACES, name: 'Du lịch & Địa điểm' },
        { category: Categories.ACTIVITIES, name: 'Hoạt động' },
        { category: Categories.OBJECTS, name: 'Đồ vật' },
        { category: Categories.SYMBOLS, name: 'Ký hiệu' },
        { category: Categories.FLAGS, name: 'Cờ' },
      ]}
    />
  </div>
)}

{/* BẢNG CHỌN GIF */}
{showGifPicker && (
  <GifPicker
    open={showGifPicker}
    initialQuery={gifSearchTerm}
    onSelect={(gif) => handleGifClick(gif)}
    width={276}
  />
)}

  {/* CÁC NÚT MỞ MENU CÔNG CỤ */}
  <div className="toolbar-buttons" style={{ display: 'flex', gap: '10px' }}>
    <button 
      title="Thêm biểu tượng cảm xúc"
      disabled={!isConnected}
      onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowGifPicker(false); }}
      style={{ background: 'none', border: 'none', cursor: isConnected ? 'pointer' : 'not-allowed', fontSize: '20px', opacity: isConnected ? 1 : 0.5 }}
    >
      😀
    </button>
    
    <button 
      title="Thêm GIF"
      disabled={!isConnected}
      onClick={() => { setShowGifPicker(!showGifPicker); setShowEmojiPicker(false); }}
      style={{ background: 'none', border: 'none', cursor: isConnected ? 'pointer' : 'not-allowed', fontSize: '14px', fontWeight: 'bold', color: 'var(--navy)', opacity: isConnected ? 1 : 0.5 }}
    >
      GIF
    </button>
  </div>

  {/* Ô NHẬP TEXT VÀ NÚT GỬI */}
  <div className="u2-send-row" style={{ display: 'flex', gap: '10px' }}>
    <input
      type="text"
      placeholder={isConnected ? "Nhập tin nhắn..." : "Đang chờ kết nối..."}
      disabled={!isConnected}
      value={chatInput} 
      onChange={(e) => setChatInput(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault(); 
          handleSendMessage();
        }
      }}
      style={{ flex: 1 }}
    />
    <button disabled={!isConnected} onClick={handleSendMessage}>Gửi</button>
  </div>
</div>
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
      {showReportModal && (
  <div className="u2-report-overlay" onClick={() => reportStatus !== 'sending' && setShowReportModal(false)}>
    <div className="u2-report-ticket" onClick={(e) => e.stopPropagation()}>
      {reportStatus === 'done' ? (
        <div className="u2-report-done">
          <div className="u2-report-done-icon">✅</div>
          <p className="u2-display" style={{ fontSize: 20 }}>ĐÃ TIẾP NHẬN</p>
          <p style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
            Cảm ơn bạn đã giúp UTC2 Connect an toàn hơn.
          </p>
        </div>
      ) : (
        <>
          <div className="u2-report-head">
            <span className="u2-mono" style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--amber)' }}>
              BIÊN BẢN SỰ CỐ
            </span>
            <h3 className="u2-display" style={{ margin: '2px 0 0', fontSize: 22, color: 'var(--paper)' }}>
              Tố cáo hành khách
            </h3>
            <button className="u2-report-close" onClick={() => setShowReportModal(false)}>✕</button>
          </div>

          <div className="u2-report-body">
            {reportScreenshot && (
              <div className="u2-report-evidence">
                <img src={reportScreenshot} alt="Bằng chứng" />
                <span>📸 Ảnh chụp làm bằng chứng</span>
              </div>
            )}

            <p className="u2-label" style={{ marginTop: 4 }}>Lý do tố cáo</p>
            <div className="u2-report-reasons">
              {REPORT_REASONS.map(r => (
                <button
                  key={r.id}
                  className={`u2-reason-chip ${reportReasonId === r.id ? 'active' : ''}`}
                  onClick={() => setReportReasonId(r.id)}
                >
                  <span>{r.icon}</span>{r.label}
                </button>
              ))}
            </div>

            <textarea
              className="u2-input"
              style={{ resize: 'none', marginTop: 10 }}
              rows={2}
              placeholder="Mô tả thêm (không bắt buộc)..."
              value={reportDetail}
              onChange={(e) => setReportDetail(e.target.value)}
            />
          </div>

          <div className="u2-report-footer">
            <button className="u2-btn ghost" onClick={() => setShowReportModal(false)}>Huỷ</button>
            <button
              className="u2-btn primary"
              disabled={!reportReasonId || reportStatus === 'sending'}
              onClick={handleSubmitReport}
            >
              {reportStatus === 'sending' ? 'Đang gửi...' : 'Gửi biên bản'}
            </button>
          </div>
        </>
      )}
 Update-new-code-04
    </div>
  </div>
)}
{/* MODAL XÁC THỰC THIẾT BỊ LẠ */}
{showOtpModal && (
  <div className="u2-report-overlay" onClick={() => setShowOtpModal(false)}>
    <div className="u2-report-ticket" onClick={(e) => e.stopPropagation()}>
      <div className="u2-report-head">
        <span className="u2-mono" style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--amber)' }}>
          CẢNH BÁO BẢO MẬT
        </span>
        <h3 className="u2-display" style={{ margin: '2px 0 0', fontSize: 22, color: 'var(--paper)' }}>
          Thiết bị mới
        </h3>
        <button className="u2-report-close" onClick={() => setShowOtpModal(false)}>✕</button>
      </div>

      <div className="u2-report-body" style={{ textAlign: 'center', marginTop: '16px' }}>
        <p style={{ fontSize: 14, color: 'var(--ink-muted)', marginBottom: 20 }}>
          Hệ thống phát hiện bạn đang đăng nhập từ thiết bị lạ. Vui lòng kiểm tra email sinh viên và nhập mã OTP để xác nhận.
        </p>
        
        <input 
          type="text" 
          className="u2-input" 
          placeholder="Nhập mã OTP 6 số..." 
          value={deviceOtp}
          onChange={(e) => setDeviceOtp(e.target.value)}
          maxLength={6}
          style={{ textAlign: 'center', letterSpacing: '4px', fontSize: '18px', fontWeight: 'bold' }}
        />
      </div>

      <div className="u2-report-footer" style={{ marginTop: '20px' }}>
        <button className="u2-btn ghost" onClick={() => setShowOtpModal(false)}>Huỷ</button>
        <button
          className="u2-btn primary"
          disabled={!deviceOtp || deviceOtp.length < 6}
          onClick={() => handleVerifyDeviceOtp(deviceOtp)}
        >
          Xác nhận thiết bị
        </button>
      </div>
    </div>
  </div>
)}
    </div>
    </div>
  </div>
)}
    </div>
    
  );
}

export default App;