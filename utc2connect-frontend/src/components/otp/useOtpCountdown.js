import { useState, useEffect, useCallback, useRef } from 'react';

export default function useOtpCountdown(initialSeconds = 60) {
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef(null);

  const start = useCallback((customSeconds) => {
    const duration = customSeconds || initialSeconds;
    setSeconds(duration);
  }, [initialSeconds]);

  useEffect(() => {
    if (seconds > 0) {
      timerRef.current = setTimeout(() => {
        setSeconds((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [seconds]);

  return {
    seconds,
    start,
    canResend: seconds === 0,
  };
}