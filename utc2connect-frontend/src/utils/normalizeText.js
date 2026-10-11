/** Chuẩn hóa văn bản chat/moderation cho mọi thiết bị (IME laptop vs bàn phím ảo). */
export function normalizeChatText(raw) {
  if (raw == null) return '';
  return String(raw)
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripForLexicon(text) {
  return normalizeChatText(text)
    .toLowerCase()
    .replace(/[!@#$%^&*(),.?":{}|<>'\-=_+[\]\\;/~`]/g, '');
}

export function isImeComposing(event) {
  return Boolean(event.isComposing || event.nativeEvent?.isComposing || event.keyCode === 229);
}
