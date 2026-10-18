import React from 'react';
import { formatVnd } from '../../data/seedCampus';

export default function RoomCard({ item, onClick }) {
  const coverImg = item.coverImage || item.images?.[0] || '';
  const detailCount = (item.images?.length || 0) + (item.coverImage ? 0 : -1);

  return (
    <article className="u2-listing-card" onClick={onClick}>
      <div 
        className="u2-listing-thumb" 
        style={{ backgroundImage: coverImg ? `url(${coverImg})` : 'none' }}
      >
        {!coverImg && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: '0.85rem' }}>
            Chưa có ảnh
          </div>
        )}
        {detailCount > 0 && (
          <span className="u2-badge-count">+{detailCount} ảnh</span>
        )}
      </div>
      <div className="u2-listing-body">
        <strong className="u2-listing-price">{formatVnd(item.price)}/tháng</strong>
        <h3>{item.title}</h3>
        <p>
          📍 {item.address} · 🚀 {item.distanceKm} km tới UTC2 · 📐 {item.area}m²
        </p>
      </div>
    </article>
  );
}