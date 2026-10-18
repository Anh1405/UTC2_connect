import { useState, useRef, useEffect, useCallback } from 'react';
import { MAX_VOICE_VIOLATIONS } from '../config/appConfig';
import useLatest from './useLatest';

// Đếm số lần đối phương vi phạm ngôn từ trong cuộc gọi + hiện banner cảnh báo.
// Đủ MAX_VOICE_VIOLATIONS lần thì gọi onLimitReached (kết thúc cuộc gọi).
export default function useVoiceViolations({ addSystemMessage, onLimitReached }) {
  const [violationCount, setViolationCount] = useState(0);
  const [toxicWarning, setToxicWarning] = useState(null);
  const countRef = useRef(0);
  const latest = useLatest({ addSystemMessage, onLimitReached });

  // Banner tự tắt sau 6 giây
  useEffect(() => {
    if (!toxicWarning) return;
    const t = setTimeout(() => setToxicWarning(null), 6000);
    return () => clearTimeout(t);
  }, [toxicWarning]);

  const registerViolation = useCallback(
    (speakerName) => {
      if (countRef.current >= MAX_VOICE_VIOLATIONS) return null; // đã đủ -> đang kết thúc cuộc gọi

      const next = countRef.current + 1;
      countRef.current = next;
      setViolationCount(next);

      const who = speakerName || 'Đối phương';
      const warningText =
        next >= MAX_VOICE_VIOLATIONS
          ? `🚫 ${who} đã vi phạm ngôn từ trong cuộc gọi thoại (${next}/${MAX_VOICE_VIOLATIONS} lần). Đang kết thúc cuộc gọi...`
          : `⚠️ Hệ thống phát hiện ${who} dùng ngôn từ không phù hợp trong cuộc gọi (lần ${next}/${MAX_VOICE_VIOLATIONS}).`;

      setToxicWarning(warningText);
      latest.current.addSystemMessage(warningText);

      if (next >= MAX_VOICE_VIOLATIONS) {
        setTimeout(() => latest.current.onLimitReached(), 1500);
      }
      return next;
    },
    [latest]
  );

  const resetViolations = useCallback(() => {
    countRef.current = 0;
    setViolationCount(0);
    setToxicWarning(null);
  }, []);
  const notifySelfViolation = useCallback((count, max = MAX_VOICE_VIOLATIONS) => {
  const text = count >= max
    ? `🚫 Bạn đã vi phạm ngôn từ ${count}/${max} lần. Cuộc gọi sẽ bị kết thúc.`
    : `⚠️ Hệ thống phát hiện bạn dùng ngôn từ không phù hợp (lần ${count}/${max}). Vi phạm ${max} lần sẽ bị kết thúc cuộc gọi.`;
  setToxicWarning(text);
  latest.current.addSystemMessage(text);
  }, [latest]);
  return { violationCount, toxicWarning, registerViolation, resetViolations, notifySelfViolation };
}
