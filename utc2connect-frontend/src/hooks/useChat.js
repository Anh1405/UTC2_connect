import { useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import socket from '../services/socket';
import { searchGifs } from '../services/giphy';
import useDebounce from './useDebounce';
import useLatest from './useLatest';
import { generateUUID } from '../utils/deviceId';
import { containsBadContent } from '../utils/chatFilter';
import { mapVietnameseToGiphy } from '../utils/gifKeywords';

// Hook xử lý Chat văn bản / Emoji / GIF / Trò chơi trong cuộc gọi hoặc phòng chat
export default function useChat() {
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');

  // Trạng thái bật/tắt các Menu phụ (Emoji, GIF, Trò chơi)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showGamePicker, setShowGamePicker] = useState(false);

  const [gifSearchTerm, setGifSearchTerm] = useState('');
  const [hideAutoGif, setHideAutoGif] = useState(false);
  const debouncedChatInput = useDebounce(chatInput, 600);

  const messagesRef = useLatest(chatMessages);

  const addSystemMessage = useCallback((text) => {
    setChatMessages((prev) => [...prev, { sender: 'system', text }]);
  }, []);

  const startConversation = useCallback(() => {
    setChatMessages([{ sender: 'system', text: 'Hệ thống: Đã kết nối với một bạn học ẩn danh!' }]);
  }, []);

  // Bật/tắt Picker độc lập (Mở cái này thì tự động đóng 2 cái kia)
  // Đồng thời ẩn gợi ý GIF tự động để tránh chồng chéo với bottom-sheet trên mobile
  const toggleEmojiPicker = useCallback(() => {
    setShowEmojiPicker((prev) => {
      const next = !prev;
      if (next) setHideAutoGif(true); // ẩn auto-GIF khi mở picker
      return next;
    });
    setShowGifPicker(false);
    setShowGamePicker(false);
  }, []);

  const toggleGifPicker = useCallback(() => {
    setShowGifPicker((prev) => {
      const next = !prev;
      if (next) setHideAutoGif(true);
      return next;
    });
    setShowEmojiPicker(false);
    setShowGamePicker(false);
  }, []);

  const toggleGamePicker = useCallback(() => {
    setShowGamePicker((prev) => {
      const next = !prev;
      if (next) setHideAutoGif(true);
      return next;
    });
    setShowEmojiPicker(false);
    setShowGifPicker(false);
  }, []);

  // Lắng nghe tin nhắn từ server
  useEffect(() => {
    const handleBlocked = (data) => {
      const { tempId, message } = data || {};
      const blockedText = tempId ? messagesRef.current.find((m) => m.tempId === tempId)?.text || '' : '';

      setChatMessages((prev) => [
        ...(tempId ? prev.filter((m) => m.tempId !== tempId) : prev),
        { sender: 'system', text: `⚠️ ${message || 'Tin nhắn của bạn không được gửi.'}` },
      ]);

      const lower = (message || '').toLowerCase();
      const isSystemError = lower.includes('khởi động') || lower.includes('thử lại') || lower.includes('lỗi');
      if (isSystemError && blockedText) {
        setTimeout(() => setChatInput(blockedText), 100);
      }
    };

    const handleReceive = (data) => {
      if (data && data.content) {
        const isGifLink = data.content.includes('giphy.com/media');
        setChatMessages((prev) => [
          ...prev,
          { sender: 'stranger', text: data.content, type: data.type || (isGifLink ? 'gif' : 'text') },
        ]);
      }
    };

    socket.on('message_blocked', handleBlocked);
    socket.on('receive_message', handleReceive);
    return () => {
      socket.off('message_blocked', handleBlocked);
      socket.off('receive_message', handleReceive);
    };
  }, [messagesRef]);

  // Gõ lại thì hiện lại gợi ý GIF
  useEffect(() => {
    if (chatInput.trim().length > 0) setHideAutoGif(false);
  }, [chatInput]);

  const fetchAutoGifs = useCallback(
      (offset) => {
        if (!debouncedChatInput || debouncedChatInput.trim().length < 2) {
          return Promise.resolve({ data: [] });
        }
        const smartQuery = mapVietnameseToGiphy(debouncedChatInput);
        return searchGifs(smartQuery, { offset, limit: 10 });
      },
      [debouncedChatInput]
  );

  const handleSendMessage = (roomID) => {
    if (!chatInput.trim() || !roomID) return;

    const textToCheck = DOMPurify.sanitize(chatInput.trim());
    if (!textToCheck) {
      setChatInput('');
      return;
    }

    if (containsBadContent(textToCheck)) {
      addSystemMessage('🛑 Tin nhắn chứa ngôn từ tục tĩu hoặc bạo lực! Đã bị chặn bởi hệ thống.');
      setChatInput('');
      return;
    }

    const tempId = generateUUID();
    socket.emit('send_message', { roomID, type: 'text', content: textToCheck, tempId });
    setChatMessages((prev) => [...prev, { sender: 'me', text: textToCheck, tempId }]);
    setChatInput('');
  };

  const handleEmojiClick = (emojiObject) => {
    setChatInput((prev) => prev + emojiObject.emoji);
  };

  const handleGifClick = (gif, roomID) => {
    const gifUrl = gif?.images?.fixed_height?.url || gif?.images?.original?.url;
    if (!gifUrl) return;
    socket.emit('send_message', { roomID, type: 'gif', content: gifUrl });
    setChatMessages((prev) => [...prev, { sender: 'me', text: gifUrl, type: 'gif' }]);
    setShowGifPicker(false);
    setGifSearchTerm('');
  };

  return {
    chatMessages,
    chatInput,
    setChatInput,
    debouncedChatInput,
    hideAutoGif,
    setHideAutoGif,

    // State & Toggle điều khiển menu
    showEmojiPicker,
    setShowEmojiPicker,
    showGifPicker,
    setShowGifPicker,
    showGamePicker,
    setShowGamePicker,
    toggleEmojiPicker,
    toggleGifPicker,
    toggleGamePicker,

    gifSearchTerm,
    setGifSearchTerm,
    fetchAutoGifs,
    addSystemMessage,
    startConversation,
    handleSendMessage,
    handleEmojiClick,
    handleGifClick,
  };
}