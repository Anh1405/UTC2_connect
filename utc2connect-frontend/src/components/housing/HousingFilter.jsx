import React from 'react';
import { AMENITIES, ROOM_TYPES, formatVnd } from '../../data/seedCampus';
import { numberToVietnameseWords } from './HousingModule';

export default function HousingFilter({
  q, setQ,
  type, setType,
  maxPrice, setMaxPrice,
  maxKm, setMaxKm,
  amenity, setAmenity,
  view, setView
}) {
  const toggleAmenity = (id) => {
    setAmenity((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <aside className="u2-filter-panel">
      <div>
        <label className="u2-label">TÌM THEO TỪ KHÓA</label>
        <input 
          className="u2-input" 
          placeholder="Quận, đường, tiện ích trọ..." 
          value={q} 
          onChange={(e) => setQ(e.target.value)} 
        />
      </div>

      <div>
        <label className="u2-label">LOẠI PHÒNG</label>
        <div className="u2-chip-wrap">
          {ROOM_TYPES.map((t) => (
            <button 
              key={t.id} 
              type="button" 
              className={`u2-reason-chip ${type === t.id ? 'active' : ''}`} 
              onClick={() => setType(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="u2-label">GIÁ TỐI ĐA: {formatVnd(maxPrice)}/tháng</label>
        <input 
          type="range" min={1000000} max={30000000} step={200000} 
          value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))} 
          style={{ width: '100%' }}
        />
        <p className="u2-price-words">{numberToVietnameseWords(maxPrice)}</p>
      </div>

      <div>
        <label className="u2-label">CÁCH UTC2 TỐI ĐA: {maxKm} km</label>
        <input 
          type="range" min={0.5} max={15} step={0.5} 
          value={maxKm} onChange={(e) => setMaxKm(Number(e.target.value))} 
          style={{ width: '100%' }}
        />
      </div>

      <div>
        <label className="u2-label">TIỆN ÍCH PHÒNG TRỌ</label>
        <div className="u2-chip-wrap">
          {AMENITIES.map((a) => (
            <button 
              key={a.id} type="button" 
              className={`u2-reason-chip ${amenity.includes(a.id) ? 'active' : ''}`} 
              onClick={() => toggleAmenity(a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="u2-view-toggle">
        <button type="button" className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')}>Lưới</button>
        <button type="button" className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>Danh sách</button>
      </div>
    </aside>
  );
}