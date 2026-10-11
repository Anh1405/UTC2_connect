import { useState, useEffect } from 'react';

// useState nhưng tự đọc/ghi LocalStorage
export default function usePersistentState(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : defaultValue;
    } catch (err) {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      /* bỏ qua lỗi đầy bộ nhớ / chế độ riêng tư */
    }
  }, [key, value]);

  return [value, setValue];
}
