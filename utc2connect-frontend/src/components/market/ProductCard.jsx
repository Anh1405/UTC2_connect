import React from 'react';
import { CONDITIONS, MARKET_CATEGORIES, formatVnd } from '../../data/seedCampus';

export default function ProductCard({ item, onClick }) {
  // Lấy ảnh tiêu đề/đại diện, nếu không có lấy ảnh đầu tiên trong danh sách ảnh chi tiết
  const coverImg = item.coverImage || item.images?.[0] || '';
  const detailCount = (item.images?.length || 0) + (item.coverImage ? 0 : -1);

  const categoryLabel = MARKET_CATEGORIES.find((c) => c.id === item.category)?.label || item.category;
  const conditionLabel = CONDITIONS.find((c) => c.id === item.condition)?.label || item.condition;

  return (
    <article className="u2-listing-card" onClick={onClick} style={{ cursor: 'pointer' }}>
      <div 
        className="u2-listing-thumb" 
        style={{ 
          backgroundImage: coverImg ? `url(${coverImg})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          position: 'relative',
          aspectRatio: '4/3',
          backgroundColor: '#f1f5f9',
          borderRadius: '12px 12px 0 0'
        }} 
      >
        {!coverImg && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
            Không có ảnh
          </div>
        )}
        {detailCount > 0 && (
          <span className="u2-badge-count" style={{
            position: 'absolute',
            bottom: '8px',
            right: '8px',
            backgroundColor: 'rgba(0,0,0,0.65)',
            color: '#fff',
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '12px',
            backdropFilter: 'blur(4px)'
          }}>
            +{detailCount} ảnh chi tiết
          </span>
        )}
      </div>
      <div className="u2-listing-body" style={{ padding: '12px 16px' }}>
        <strong className="u2-listing-price" style={{ fontSize: '1.1rem', color: '#d97706', fontWeight: '700' }}>
          {formatVnd(item.price)}
        </strong>
        <h3 style={{ fontSize: '1rem', margin: '6px 0', lineHeight: '1.4', color: '#1e293b', fontWeight: '600' }}>
          {item.title}
        </h3>
        <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
          {categoryLabel} · {conditionLabel}
        </p>
      </div>
    </article>
  );
}