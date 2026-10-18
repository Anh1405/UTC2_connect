import { useEffect } from 'react';

export default function useVisualViewport() {
  useEffect(() => {
    if (!window.visualViewport) return;

    const handleResize = () => {
      const vv = window.visualViewport;
      // Gán chiều cao vùng hiển thị thực tế vào biến CSS --vv-height
      document.documentElement.style.setProperty('--vv-height', `${vv.height}px`);
      // Cuộn dính xuống ô nhập tin nhắn khi bật bàn phím
      window.scrollTo(0, 0);
    };

    window.visualViewport.addEventListener('resize', handleResize);
    window.visualViewport.addEventListener('scroll', handleResize);
    handleResize();

    return () => {
      window.visualViewport.removeEventListener('resize', handleResize);
      window.visualViewport.removeEventListener('scroll', handleResize);
    };
  }, []);
}
