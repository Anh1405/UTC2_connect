import { useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import socket from '../services/socket';
import { searchGifs } from '../services/giphy';
import useDebounce from './useDebounce';
import useLatest from './useLatest';
import { generateUUID } from '../utils/deviceId';
import { containsBadContent } from '../utils/chatFilter';
import { mapVietnameseToGiphy } from '../utils/gifKeywords';

// Chat văn bản / emoji / GIF trong cuộc gọi
export default function useChat() {
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
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
    showEmojiPicker,
    setShowEmojiPicker,
    showGifPicker,
    setShowGifPicker,
    gifSearchTerm,
    fetchAutoGifs,
    addSystemMessage,
    startConversation,
    handleSendMessage,
    handleEmojiClick,
    handleGifClick,
  };
}
