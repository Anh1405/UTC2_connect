import React, { useEffect, useState, useCallback } from 'react';
import { Grid } from '@giphy/react-components';
import { searchGifs, trendingGifs } from '../services/giphy';
import useDebounce from '../hooks/useDebounce';

export default function GifPicker({ open, initialQuery = '', onSelect, width = 300 }) {
  const [term, setTerm] = useState(initialQuery);
  const debounced = useDebounce(term, 350);

  useEffect(() => {
    setTerm(initialQuery || '');
  }, [initialQuery]);

  const fetchGifs = useCallback(({ offset }) => {
    if (debounced && debounced.trim()) {
      return searchGifs(debounced, { offset, limit: 10 });
    }
    return trendingGifs({ offset, limit: 10 });
  }, [debounced]);

  if (!open) return null;

  return (
    <div className="u2-picker-popup" style={{ width }}>
      
      {/* 1. THÊM CLASS u2-gif-wrapper ĐỂ TẠO GIAO DIỆN "CỬA SỔ TOA TÀU" */}
      <div className="u2-gif-wrapper">
        
        {/* 2. CẬP NHẬT CLASS CHO Ô TÌM KIẾM */}
        <div className="u2-gif-search-box">
          <span className="u2-gif-search-icon">🔍</span>
          <input
            className="u2-gif-search"
            type="text"
            placeholder="Tìm kiếm GIF..."
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>

        {/* 3. THÊM CLASS u2-gif-grid-container ĐỂ CÓ THANH CUỘN VÀ HIỆU ỨNG ẢNH ĐẸP */}
        <div className="u2-gif-grid-container">
          <Grid
            key={debounced} // reset grid when query changes
            
            // Trừ đi 24px (padding trái phải của u2-gif-wrapper) để ảnh không bị tràn viền
            width={width - 24} 
            
            columns={2}
            gutter={8}
            fetchGifs={fetchGifs}
            onGifClick={(gif, e) => {
              e.preventDefault();
              if (onSelect) onSelect(gif);
            }}
          />
        </div>

      </div>
    </div>
  );
}