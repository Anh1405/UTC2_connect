import { useRef, useLayoutEffect } from 'react';

// Luôn giữ giá trị mới nhất trong ref -> dùng trong socket/timer mà không bị "stale closure"
export default function useLatest(value) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
