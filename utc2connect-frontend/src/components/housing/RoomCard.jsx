import React, { memo, useEffect, useMemo, useState } from 'react';
import { AMENITIES, ROOM_TYPES, formatVnd } from '../../data/seedCampus';
import Icon from './HousingIcons';
import { formatKm, getListingImages, isNewListing, timeAgo } from './housingUtils';

const MAX_AMENITY_TAGS = 2;

function RoomCard({ item, onClick, isMine = false, isSaved = false, onToggleSave }) {
  const images = useMemo(() => getListingImages(item), [item]);
  const cover = images[0] || '';

  // empty: chưa có ảnh | loading: đang tải (hiện skeleton) | ready | error
  const [imgState, setImgState] = useState(cover ? 'loading' : 'empty');
  useEffect(() => {
    setImgState(cover ? 'loading' : 'empty');
  }, [cover]);

  const typeLabel = ROOM_TYPES.find((t) => t.id === item.type)?.label;
  const pricePerM2 = item.area > 0 ? formatVnd(Math.round(item.price / item.area)) : '';
  const amenityLabels = (item.amenities || []).map((id) => AMENITIES.find((a) => a.id === id)?.label || id);
  const hiddenAmenities = Math.max(0, amenityLabels.length - MAX_AMENITY_TAGS);
  const showPlaceholder = imgState === 'empty' || imgState === 'error';

  const open = () => onClick?.(item);

  return (
    <article className={`u2-listing-card${isMine ? ' is-mine' : ''}`} onClick={open}>
      <div className={`u2-listing-thumb is-${imgState}`}>
        {cover && imgState !== 'error' && (
          <img
            src={cover}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={() => setImgState('ready')}
            onError={() => setImgState('error')}
          />
        )}

        {showPlaceholder && (
          <div className="u2-thumb-empty">
            <Icon name="image" size={28} />
            <span>{imgState === 'error' ? 'Không tải được ảnh' : 'Chưa có ảnh'}</span>
          </div>
        )}

        <div className="u2-card-badges">
          {isMine && <span className="u2-pill is-mine">Tin của bạn</span>}
          {isNewListing(item) && <span className="u2-pill is-new">Mới đăng</span>}
        </div>

        {onToggleSave && (
          <button
            type="button"
            className={`u2-save-btn${isSaved ? ' is-saved' : ''}`}
            aria-pressed={isSaved}
            aria-label={isSaved ? 'Bỏ lưu tin' : 'Lưu tin'}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSave(item.id);
            }}
          >
            <Icon name="heart" size={18} filled={isSaved} />
          </button>
        )}

        {images.length > 1 && (
          <span className="u2-badge-count">
            <Icon name="image" size={12} /> {images.length}
          </span>
        )}
      </div>

      <div className="u2-listing-body">
        <div className="u2-listing-price-row">
          <strong className="u2-listing-price">
            {formatVnd(item.price)}
            <span>/tháng</span>
          </strong>
          {pricePerM2 && <span className="u2-listing-ppm">{pricePerM2}/m²</span>}
        </div>

        <h3>
          <button
            type="button"
            className="u2-listing-open"
            onClick={(event) => {
              event.stopPropagation();
              open();
            }}
          >
            {item.title}
          </button>
        </h3>

        <p className="u2-listing-address">
          <Icon name="pin" size={14} />
          <span>{item.address || 'Chưa cập nhật địa chỉ'}</span>
        </p>

        <ul className="u2-listing-meta">
          <li>
            <Icon name="route" size={13} /> {formatKm(item.distanceKm)} km tới UTC2
          </li>
          <li>
            <Icon name="area" size={13} /> {item.area} m²
          </li>
          {typeLabel && item.type !== 'all' && <li>{typeLabel}</li>}
        </ul>

        {amenityLabels.length > 0 && (
          <ul className="u2-listing-tags" aria-label="Tiện ích">
            {amenityLabels.slice(0, MAX_AMENITY_TAGS).map((label) => (
              <li key={label} className="u2-tag">
                {label}
              </li>
            ))}
            {hiddenAmenities > 0 && <li className="u2-tag is-more">+{hiddenAmenities}</li>}
          </ul>
        )}

        {item.createdAt && <p className="u2-listing-time">{timeAgo(item.createdAt)}</p>}
      </div>
    </article>
  );
}

export default memo(RoomCard);
