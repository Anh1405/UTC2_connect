import { useCallback, useEffect, useState } from 'react';

export default function useOtpCountdown(initialSeconds = 60) {
  const [seconds, setSeconds] = useState(0);

  const start = useCallback((from = initialSeconds) => {
    setSeconds(from);
  }, [initialSeconds]);

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  return { seconds, start, canResend: seconds <= 0 };
}
