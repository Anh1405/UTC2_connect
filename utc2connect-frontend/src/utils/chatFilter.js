// Bộ lọc nhanh phía client cho tin nhắn chat (từ tục / bạo lực)
const VIETNAMESE_BAD_WORDS = new Set([
  'ngu', 'địt', 'đụ', 'lồn', 'cặc', 'đm', 'vcl', 'đĩ', 'phò',
  'đcm', 'đmm', 'cc', 'cl', 'lol', 'lồz', 'cứt', 'bitch', 'fuck', 'shit',
  'loz', 'lon', 'cac', 'vkl', 'dkm', 'vl', 'ml', 'clgt', 'concac',
]);

const VIOLENT_PHRASES = ['đánh chết', 'giết', 'mẹ mày', 'bố mày', 'thằng ranh', 'đấm chết', 'đập chết'];

export const containsBadContent = (text) => {
  const textLower = text.toLowerCase();
  const textWithoutPunctuation = textLower.replace(/[!@#$%^&*(),.?":{}|<>'\-=_+[\]\\;/~`]/g, '');
  const words = textWithoutPunctuation.split(/\s+/);

  const hasBadWord = words.some((word) => VIETNAMESE_BAD_WORDS.has(word));
  const hasViolentPhrase = VIOLENT_PHRASES.some((phrase) => textWithoutPunctuation.includes(phrase));
  return hasBadWord || hasViolentPhrase;
};
