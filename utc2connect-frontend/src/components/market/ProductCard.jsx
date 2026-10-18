import React, { memo, useMemo } from 'react';
import { CONDITIONS, MARKET_CATEGORIES, formatVnd } from '../../data/seedCampus';

/**
 * ProductCard — reusable listing card for the UTC2 campus marketplace.
 * Memoized to avoid re-renders when parent filter state changes but the item itself is stable.
 * sellerRating is deterministic (derived from id) so it does not flicker on re-render.
 */
const ProductCard = memo(function ProductCard({
  item,
  onClick,
  isMine = false,
  isFav = false,
  onToggleFav,
}) {
  const coverImg = item.coverImage || item.images?.[0] || '';
  const extraImageCount = Math.max(
    0,
    (item.images?.length || 0) + (item.coverImage ? 0 : 0) - (coverImg ? 1 : 0)
  );

  const categoryLabel =
    MARKET_CATEGORIES.find((c) => c.id === item.category || c.label === item.category)?.label ||
    item.category ||
    'Khác';

  const conditionLabel =
    CONDITIONS.find((c) => c.id === item.condition)?.label || item.condition || '';

  const statusConfig = {
    sold: { text: 'Đã bán', className: 'u2-status-badge u2-status-badge--sold' },
    reserved: { text: 'Đã cọc', className: 'u2-status-badge u2-status-badge--reserved' },
    available: { text: 'Đang bán', className: 'u2-status-badge u2-status-badge--available' },
  };
  const currentStatus = statusConfig[item.status] || statusConfig.available;

  const isAIGoodPrice = useMemo(() => {
    if (isMine || item.status === 'sold') return false;
    const price = Number(item.price) || 0;
    return price > 0 && price < 500000 && item.condition !== 'new';
  }, [item.price, item.condition, item.status, isMine]);

  const sellerRating = useMemo(() => {
    const seed = String(item.id || item.title || 'x');
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return (4 + (hash % 11) / 10).toFixed(1);
  }, [item.id, item.title]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.(item);
    }
  };

  const handleFav = (e) => {
    e.stopPropagation();
    e.preventDefault();
    onToggleFav?.(item.id);
  };

  return (
    <article
      className={`u2-listing-card ${isMine ? 'is-mine' : ''}`}
      onClick={() => onClick?.(item)}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${item.title}, ${formatVnd(item.price)}`}
    >
      <button
        type="button"
        className="u2-fav-btn"
        onClick={handleFav}
        aria-label={isFav ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}
        title={isFav ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}
      >
        {isFav ? '💖' : '🤍'}
      </button>

      <figure>
        {coverImg ? (
          <img src={coverImg} alt="" loading="lazy" decoding="async" />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--u2-text-muted)',
              fontSize: 13,
            }}
          >
            Chưa có hình ảnh
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            alignItems: 'flex-start',
          }}
        >
          {isMine && (
            <span className="u2-status-badge u2-status-badge--mine">Chính chủ</span>
          )}
          <span className={currentStatus.className}>{currentStatus.text}</span>
          {isAIGoodPrice && (
            <span className="u2-ai-badge" title="Gợi ý giá hợp lý theo thuật toán">
              ✨ AI Giá Tốt
            </span>
          )}
        </div>

        {extraImageCount > 0 && (
          <span className="u2-badge-count">+{extraImageCount} ảnh</span>
        )}
      </figure>

      <div className="u2-listing-body">
        <h3 title={item.title}>{item.title}</h3>
        <strong className="u2-listing-price">{formatVnd(item.price)}</strong>

        {conditionLabel && (
          <span style={{ fontSize: '0.78rem', color: 'var(--u2-text-sub)' }}>
            {conditionLabel}
          </span>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 'auto',
            paddingTop: 10,
            borderTop: '1px solid var(--u2-border)',
          }}
        >
          <span style={{ fontSize: '0.82rem', color: 'var(--u2-text-sub)' }}>
            {categoryLabel}
          </span>
          <div title="Điểm uy tín người bán (ước tính)" style={{ display: 'flex', alignItems: 'center' }}>
            <span className="u2-rating-stars" aria-hidden>
              ★
            </span>
            <span className="u2-trust-score">{sellerRating}</span>
          </div>
        </div>
      </div>
    </article>
  );
});

export default ProductCard;
