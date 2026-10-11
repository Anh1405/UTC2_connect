import EmojiPicker, { Categories } from 'emoji-picker-react';
import { Carousel } from '@giphy/react-components';
import GifPicker from '../GifPicker';

const EMOJI_CATEGORIES = [
  { category: Categories.SUGGESTED, name: 'Hay dùng' },
  { category: Categories.SMILEYS_PEOPLE, name: 'Mặt cười & Con người' },
  { category: Categories.ANIMALS_NATURE, name: 'Động vật & Thiên nhiên' },
  { category: Categories.FOOD_DRINK, name: 'Đồ ăn & Thức uống' },
  { category: Categories.TRAVEL_PLACES, name: 'Du lịch & Địa điểm' },
  { category: Categories.ACTIVITIES, name: 'Hoạt động' },
  { category: Categories.OBJECTS, name: 'Đồ vật' },
  { category: Categories.SYMBOLS, name: 'Ký hiệu' },
  { category: Categories.FLAGS, name: 'Cờ' },
];

const toolButtonStyle = (isConnected) => ({
  background: 'none',
  border: 'none',
  cursor: isConnected ? 'pointer' : 'not-allowed',
  opacity: isConnected ? 1 : 0.5,
});

// Cột chat văn bản bên phải (tin nhắn, emoji, GIF)
export default function ChatPanel({ chat, roomID, isConnected }) {
  const {
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
    handleSendMessage,
    handleEmojiClick,
    handleGifClick,
  } = chat;

  return (
    <div className="u2-chat-sidebar">
      <div className="chat-header">💬 Trò chuyện trên toa</div>
      <div className="chat-messages">
        {chatMessages.map((msg, index) => (
          <div key={index} className={`chat-bubble ${msg.sender}`}>
            {msg.type === 'gif' ? (
              <img src={msg.text} alt="GIF" style={{ maxWidth: '100%', borderRadius: '8px' }} />
            ) : (
              msg.text
            )}
          </div>
        ))}
      </div>
      <div className="chat-input-area">
        <div
          className="chat-toolbar-container"
          style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}
        >
          {debouncedChatInput.trim().length >= 2 && !hideAutoGif && (
            <div className="u2-inline-gif-suggestions">
              <button className="u2-inline-gif-close" onClick={() => setHideAutoGif(true)} title="Đóng">
                ✕
              </button>
              <div className="u2-inline-gif-carousel">
                <Carousel
                  key={debouncedChatInput}
                  fetchGifs={fetchAutoGifs}
                  gifHeight={85}
                  gutter={4}
                  noLink={true}
                  onGifClick={(gif, e) => {
                    e.preventDefault();
                    handleGifClick(gif, roomID);
                    setChatInput('');
                  }}
                />
              </div>
            </div>
          )}

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
                categories={EMOJI_CATEGORIES}
              />
            </div>
          )}

          {showGifPicker && (
            <GifPicker
              open={showGifPicker}
              initialQuery={gifSearchTerm}
              onSelect={(gif) => handleGifClick(gif, roomID)}
              width={276}
            />
          )}

          <div className="toolbar-buttons" style={{ display: 'flex', gap: '10px' }}>
            <button
              title="Thêm biểu tượng cảm xúc"
              disabled={!isConnected}
              onClick={() => {
                setShowEmojiPicker(!showEmojiPicker);
                setShowGifPicker(false);
              }}
              style={{ ...toolButtonStyle(isConnected), fontSize: '20px' }}
            >
              😀
            </button>
            <button
              title="Thêm GIF"
              disabled={!isConnected}
              onClick={() => {
                setShowGifPicker(!showGifPicker);
                setShowEmojiPicker(false);
              }}
              style={{ ...toolButtonStyle(isConnected), fontSize: '14px', fontWeight: 'bold', color: 'var(--navy)' }}
            >
              GIF
            </button>
          </div>

          <div className="u2-send-row" style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              placeholder={isConnected ? 'Nhập tin nhắn...' : 'Đang chờ kết nối...'}
              disabled={!isConnected}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSendMessage(roomID);
                }
              }}
              style={{ flex: 1 }}
            />
            <button disabled={!isConnected} onClick={() => handleSendMessage(roomID)}>
              Gửi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
