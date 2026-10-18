import React, { useState } from 'react';
import { AMENITIES, ROOM_TYPES, formatVnd } from '../../data/seedCampus';
import Icon from './HousingIcons';
import { FILTER_LIMITS, PRICE_PRESETS, numberToVietnameseWords } from './housingUtils';

export default function HousingFilter({
  q, setQ,
  type, setType,
  maxPrice, setMaxPrice,
  maxKm, setMaxKm,
  amenity, setAmenity,
  view, setView,
  activeCount = 0, // số bộ lọc đang bật (hiện trên nút thu gọn ở mobile)
  onReset,         // có truyền thì hiện nút "Xoá bộ lọc"
}) {
  // Trên mobile bảng lọc thu gọn mặc định; desktop luôn hiện (do CSS quyết định).
  const [open, setOpen] = useState(false);

  const toggleAmenity = (id) => {
    setAmenity((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <aside className="u2-filter-panel" aria-label="Bộ lọc phòng trọ">
      <button
        type="button"
        className="u2-filter-toggle"
        aria-expanded={open}
        aria-controls="u2-filter-body"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="sliders" size={16} />
        <span>Bộ lọc</span>
        {activeCount > 0 && <span className="u2-count-dot">{activeCount}</span>}
        <Icon name="chevron-down" size={16} className={`u2-filter-caret${open ? ' is-open' : ''}`} />
      </button>

      <div id="u2-filter-body" className={`u2-filter-body${open ? ' is-open' : ''}`}>
        <div className="u2-field">
          <label className="u2-label" htmlFor="u2-filter-q">Từ khoá</label>
          <div className="u2-search">
            <Icon name="search" size={16} />
            <input
              id="u2-filter-q"
              className="u2-input"
              type="search"
              placeholder="Quận, đường, tiện ích trọ..."
              autoComplete="off"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q && (
              <button type="button" className="u2-search-clear" aria-label="Xoá từ khoá" onClick={() => setQ('')}>
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        </div>

        <fieldset className="u2-field u2-fieldset">
          <legend className="u2-label">Loại phòng</legend>
          <div className="u2-chip-wrap">
            {ROOM_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`u2-reason-chip ${type === t.id ? 'active' : ''}`}
                aria-pressed={type === t.id}
                onClick={() => setType(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="u2-field">
          <label className="u2-label u2-label-row" htmlFor="u2-filter-price">
            <span>Giá tối đa</span>
            <strong>{formatVnd(maxPrice)}/tháng</strong>
          </label>
          <input
            id="u2-filter-price"
            className="u2-range"
            type="range"
            min={FILTER_LIMITS.minPrice}
            max={FILTER_LIMITS.maxPrice}
            step={FILTER_LIMITS.priceStep}
            value={maxPrice}
            aria-valuetext={`${formatVnd(maxPrice)} một tháng`}
            onChange={(e) => setMaxPrice(Number(e.target.value))}
          />
          <div className="u2-chip-wrap" role="group" aria-label="Chọn nhanh mức giá">
            {PRICE_PRESETS.map((price) => (
              <button
                key={price}
                type="button"
                className={`u2-reason-chip is-small ${maxPrice === price ? 'active' : ''}`}
                aria-pressed={maxPrice === price}
                onClick={() => setMaxPrice(price)}
              >
                Dưới {price / 1000000} triệu
              </button>
            ))}
          </div>
          <p className="u2-price-words">{numberToVietnameseWords(maxPrice)}</p>
        </div>

        <div className="u2-field">
          <label className="u2-label u2-label-row" htmlFor="u2-filter-km">
            <span>Cách UTC2 tối đa</span>
            <strong>{maxKm} km</strong>
          </label>
          <input
            id="u2-filter-km"
            className="u2-range"
            type="range"
            min={FILTER_LIMITS.minKm}
            max={FILTER_LIMITS.maxKm}
            step={FILTER_LIMITS.kmStep}
            value={maxKm}
            aria-valuetext={`${maxKm} ki-lô-mét`}
            onChange={(e) => setMaxKm(Number(e.target.value))}
          />
        </div>

        <fieldset className="u2-field u2-fieldset">
          <legend className="u2-label">Tiện ích phòng trọ</legend>
          <div className="u2-chip-wrap">
            {AMENITIES.map((a) => {
              const on = amenity.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`u2-reason-chip ${on ? 'active' : ''}`}
                  aria-pressed={on}
                  onClick={() => toggleAmenity(a.id)}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="u2-view-toggle" role="group" aria-label="Kiểu hiển thị">
          <button type="button" className={view === 'grid' ? 'on' : ''} aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
            Lưới
          </button>
          <button type="button" className={view === 'list' ? 'on' : ''} aria-pressed={view === 'list'} onClick={() => setView('list')}>
            Danh sách
          </button>
        </div>

        {onReset && (
          <button type="button" className="u2-btn ghost block" disabled={activeCount === 0} onClick={onReset}>
            Xoá bộ lọc{activeCount > 0 ? ` (${activeCount})` : ''}
          </button>
        )}
      </div>
    </aside>
  );
}
