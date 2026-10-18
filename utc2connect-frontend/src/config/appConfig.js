// Cấu hình chung của ứng dụng (đọc từ biến môi trường Vite)

// Kiểm duyệt giọng nói (AI NLP - api.py)
export const aiApiUrl = (
  import.meta.env.VITE_AI_API_URL || `http://${window.location.hostname}:8000`
).replace(/\/$/, '');
export const aiApiKey = import.meta.env.VITE_AI_API_KEY || '';

export const VOICE_CHUNK_MS = 7000;
export const SILENCE_DELAY_MS = 1200;
export const MAX_VOICE_VIOLATIONS = 3;
