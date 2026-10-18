import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './HousingModule.css';
import {
  AMENITIES,
  ROOM_TYPES,
  UTC2_CAMPUS,
  formatVnd,
  loadHousing,
  saveHousing,
} from '../../data/seedCampus';
import { UserChip } from '../profile/UserProfileDrawer';
import HousingFilter from './HousingFilter';
import RoomCard from './RoomCard';
import Icon from './HousingIcons';
import {
  BOOKING_HOURS,
  CONTRACT_STATUS,
  DEFAULT_FILTERS,
  IMAGE_RULES,
  INITIAL_RENTAL_CONTRACTS,
  LISTING_LIMITS,
  PAGE_SIZE,
  SORT_OPTIONS,
  STORAGE_KEYS,
  buildMapSrc,
  buildMapsLink,
  compressImage,
  copyText,
  createContractId,
  digitsOnly,
  filterListings,
  formatDateVi,
  formatKm,
  formatThousands,
  getAuthor,
  getCoords,
  getListingImages,
  getStatusMeta,
  getTodayInputValue,
  isBookingCancellable,
  isNewListing,
  isOwnedBy,
  numberToVietnameseWords,
  parseDecimal,
  resolveUserObject,
  sortListings,
  timeAgo,
  useDebouncedValue,
  useEscapeKey,
  useFocusTrap,
  useLatest,
  useLocalStorageState,
  useLockBodyScroll,
  validateBooking,
  validateListing,
} from './housingUtils';

// Giữ tương thích cho những file cũ còn import hàm này từ HousingModule.
export { numberToVietnameseWords } from './housingUtils';

// ============================================================================
// THÔNG BÁO (TOAST) - thay cho alert() chặn giao diện
// ============================================================================

const TOAST_ICONS = { success: 'check', info: 'info', warning: 'alert', error: 'alert' };

function useToasts() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message, tone = 'success', duration = 4000) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((list) => [...list.slice(-3), { id, message, tone }]);
      timers.current.set(id, setTimeout(() => dismiss(id), duration));
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => clearTimeout(timer));
      map.clear();
    };
  }, []);

  return { toasts, notify, dismiss };
}

function ToastStack({ toasts, onDismiss }) {
  return (
    <div className="u2-toast-stack" role="region" aria-label="Thông báo" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`u2-toast is-${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
          <Icon name={TOAST_ICONS[t.tone] || 'info'} size={18} />
          <span>{t.message}</span>
          <button type="button" aria-label="Đóng thông báo" onClick={() => onDismiss(t.id)}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// KHUNG HỘP THOẠI DÙNG CHUNG
// Esc đóng đúng lớp trên cùng, khoá cuộn nền, giữ focus trong hộp thoại.
// ============================================================================

function Modal({ titleId, onClose, size = 'md', layer = 1, children }) {
  const dialogRef = useRef(null);
  const pressedOnBackdrop = useRef(false);

  useEscapeKey(onClose);
  useLockBodyScroll(true);
  useFocusTrap(dialogRef, true);

  // Dùng mousedown + mouseup để kéo chọn chữ trong form rồi nhả ra ngoài không làm đóng nhầm.
  return (
    <div
      className="u2-overlay"
      style={{ zIndex: 1000 + layer * 100 }}
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (pressedOnBackdrop.current && e.target === e.currentTarget) onClose();
        pressedOnBackdrop.current = false;
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`u2-dialog is-${size}`}
      >
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ id, title, onClose }) {
  return (
    <header className="u2-dialog-head">
      <h2 id={id}>{title}</h2>
      <button type="button" className="u2-icon-btn on-dark" aria-label="Đóng" onClick={onClose}>
        <Icon name="close" size={16} />
      </button>
    </header>
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Quay lại',
  tone = 'danger',
  onConfirm,
  onCancel,
}) {
  return (
    <Modal titleId="u2-confirm-title" size="sm" layer={3} onClose={onCancel}>
      <div className="u2-confirm">
        <span className={`u2-confirm-icon is-${tone}`}>
          <Icon name={tone === 'danger' ? 'trash' : 'info'} size={22} />
        </span>
        <h2 id="u2-confirm-title">{title}</h2>
        <p>{message}</p>
      </div>
      <footer className="u2-dialog-foot is-actions">
        {/* Focus mặc định vào nút an toàn để Enter lỡ tay không xoá dữ liệu. */}
        <button type="button" className="u2-btn ghost" data-autofocus onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className={`u2-btn ${tone === 'danger' ? 'danger' : 'primary'}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </footer>
    </Modal>
  );
}

// ============================================================================
// THÀNH PHẦN NHỎ: TAB, TRẠNG THÁI RỖNG, Ô NHẬP
// ============================================================================

function Tabs({ tabs, active, onChange }) {
  const onKeyDown = (event) => {
    const index = tabs.findIndex((t) => t.id === active);
    let next = null;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    onChange(tabs[next].id);
    requestAnimationFrame(() => document.getElementById(`u2-tab-${tabs[next].id}`)?.focus());
  };

  return (
    <div className="u2-tabs" role="tablist" aria-label="Danh mục nhà trọ" onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button
          key={t.id}
          id={`u2-tab-${t.id}`}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          aria-controls="u2-tabpanel"
          tabIndex={active === t.id ? 0 : -1}
          className={`u2-tab${active === t.id ? ' is-active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {typeof t.count === 'number' && <span className="u2-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ icon = 'home', title, text, action }) {
  return (
    <div className="u2-empty">
      <span className="u2-empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

function Field({ id, label, error, hint, required = false, children }) {
  return (
    <div className={`u2-field${error ? ' has-error' : ''}`}>
      <label className="u2-label" htmlFor={id}>
        {label}
        {required && <span className="u2-req" aria-hidden="true"> *</span>}
      </label>
      {children}
      {error ? (
        <p className="u2-field-error" id={`${id}-msg`} role="alert">{error}</p>
      ) : hint ? (
        <p className="u2-field-hint" id={`${id}-msg`}>{hint}</p>
      ) : null}
    </div>
  );
}

// ============================================================================
// CHI TIẾT TIN ĐĂNG
// ============================================================================

function Gallery({ images, title }) {
  const [index, setIndex] = useState(0);
  const total = images.length;
  const go = useCallback((step) => setIndex((i) => (i + step + total) % total), [total]);

  if (total === 0) {
    return (
      <div className="u2-gallery is-empty">
        <Icon name="image" size={36} />
        <span>Tin này chưa có hình ảnh</span>
      </div>
    );
  }

  const onKeyDown = (event) => {
    if (total < 2) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(1);
    }
  };

  return (
    <div className="u2-gallery" onKeyDown={onKeyDown} aria-roledescription="carousel" aria-label={`Ảnh phòng trọ: ${title}`}>
      <div className="u2-gallery-stage">
        <img key={index} className="u2-gallery-img" src={images[index]} alt={`${title}, ảnh ${index + 1} trên ${total}`} />
        {total > 1 && (
          <>
            <button type="button" className="u2-gallery-nav prev" aria-label="Ảnh trước" onClick={() => go(-1)}>
              <Icon name="chevron-left" size={20} />
            </button>
            <button type="button" className="u2-gallery-nav next" aria-label="Ảnh sau" onClick={() => go(1)}>
              <Icon name="chevron-right" size={20} />
            </button>
            <span className="u2-gallery-count" aria-hidden="true">{index + 1} / {total}</span>
          </>
        )}
      </div>

      {total > 1 && (
        <div className="u2-gallery-thumbs" role="group" aria-label="Chọn ảnh">
          {images.map((src, i) => (
            <button
              key={i}
              type="button"
              className={`u2-thumb${i === index ? ' is-active' : ''}`}
              aria-label={`Xem ảnh ${i + 1}`}
              aria-current={i === index}
              onClick={() => setIndex(i)}
            >
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HousingDetail({ item, isMine, isSaved, onClose, onDelete, onToggleSave, onShare, onOpenProfile, onStartChat, onBookView }) {
  const images = useMemo(() => getListingImages(item), [item]);
  const author = getAuthor(item);
  const phone = item.contact?.phone || author.phone;
  const typeLabel = ROOM_TYPES.find((t) => t.id === item.type)?.label;
  const coords = useMemo(() => getCoords(item, UTC2_CAMPUS), [item]);
  const pricePerM2 = item.area > 0 ? formatVnd(Math.round(item.price / item.area)) : '—';
  const amenities = item.amenities || [];

  return (
    <Modal titleId="u2-detail-title" size="lg" onClose={onClose}>
      <button type="button" className="u2-icon-btn floating" aria-label="Đóng chi tiết" onClick={onClose}>
        <Icon name="close" size={16} />
      </button>

      <div className="u2-dialog-scroll">
        <Gallery images={images} title={item.title} />

        <div className="u2-detail-body">
          <div className="u2-detail-badges">
            {isMine && <span className="u2-pill is-mine">Tin của bạn</span>}
            {isNewListing(item) && <span className="u2-pill is-new">Mới đăng</span>}
            {typeLabel && item.type !== 'all' && <span className="u2-pill">{typeLabel}</span>}
            {item.createdAt && <span className="u2-detail-time"><Icon name="clock" size={13} /> {timeAgo(item.createdAt)}</span>}
          </div>

          <div className="u2-detail-head">
            <div>
              <p className="u2-detail-price">{formatVnd(item.price)}<span>/tháng</span></p>
              <p className="u2-price-words">{numberToVietnameseWords(item.price)}</p>
            </div>
            <div className="u2-detail-tools">
              <button
                type="button"
                className={`u2-btn ghost sm${isSaved ? ' is-saved' : ''}`}
                aria-pressed={isSaved}
                onClick={() => onToggleSave(item.id)}
              >
                <Icon name="heart" size={15} filled={isSaved} /> {isSaved ? 'Đã lưu' : 'Lưu tin'}
              </button>
              <button type="button" className="u2-btn ghost sm" onClick={() => onShare(item)}>
                <Icon name="share" size={15} /> Chia sẻ
              </button>
            </div>
          </div>

          <h2 id="u2-detail-title" className="u2-detail-title">{item.title}</h2>
          <p className="u2-detail-address"><Icon name="pin" size={15} /> {item.address || 'Chưa cập nhật địa chỉ'}</p>

          <dl className="u2-stats">
            <div className="u2-stat"><dt>Diện tích</dt><dd>{item.area} m²</dd></div>
            <div className="u2-stat"><dt>Cách UTC2</dt><dd>{formatKm(item.distanceKm)} km</dd></div>
            <div className="u2-stat"><dt>Giá mỗi m²</dt><dd>{pricePerM2}</dd></div>
          </dl>

          {item.description && (
            <section>
              <h3 className="u2-section-title">Mô tả</h3>
              <p className="u2-detail-desc">{item.description}</p>
            </section>
          )}

          {amenities.length > 0 && (
            <section>
              <h3 className="u2-section-title">Tiện ích</h3>
              <ul className="u2-chip-wrap u2-plain-list">
                {amenities.map((id) => (
                  <li key={id} className="u2-tag">{AMENITIES.find((a) => a.id === id)?.label || id}</li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <div className="u2-section-row">
              <h3 className="u2-section-title">Vị trí</h3>
              <a className="u2-link" href={buildMapsLink(coords)} target="_blank" rel="noopener noreferrer">
                Mở Google Maps <Icon name="external" size={13} />
              </a>
            </div>
            <iframe title={`Bản đồ vị trí ${item.title}`} className="u2-map" src={buildMapSrc(coords)} loading="lazy" referrerPolicy="no-referrer" />
          </section>

          <section>
            <h3 className="u2-section-title">Người đăng tin</h3>
            <div className="u2-seller-box">
              <UserChip username={author.name} onOpen={() => onOpenProfile(item.author ?? author)} />
              <button type="button" className="u2-link-btn" onClick={() => onOpenProfile(item.author ?? author)}>
                Xem hồ sơ
              </button>
            </div>
          </section>
        </div>
      </div>

      <footer className="u2-dialog-foot is-actions">
        {isMine ? (
          <button type="button" className="u2-btn danger" onClick={onDelete}>
            <Icon name="trash" size={16} /> Xoá tin này
          </button>
        ) : (
          <>
            <button type="button" className="u2-btn ghost" onClick={() => onStartChat(item.author ?? author)}>
              <Icon name="message" size={16} /> Nhắn tin
            </button>
            {phone && (
              <a className="u2-btn ghost is-call" href={`tel:${phone}`}>
                <Icon name="phone" size={16} /> Gọi
              </a>
            )}
            <button type="button" className="u2-btn primary" onClick={() => onBookView(item)}>
              <Icon name="calendar" size={16} /> Đặt lịch xem
            </button>
          </>
        )}
      </footer>
    </Modal>
  );
}

// ============================================================================
// HỒ SƠ NGƯỜI ĐĂNG
// ============================================================================

function ProfileModal({ user, currentUser, onClose, onStartChat, onEditProfile }) {
  const me = resolveUserObject(currentUser);
  const initial = (user.name || 'C').charAt(0).toUpperCase();
  const isOwnProfile =
    (user.username && me.username && user.username === me.username) ||
    (user.email && me.email && user.email === me.email);

  return (
    <Modal titleId="u2-profile-title" size="sm" layer={2} onClose={onClose}>
      <ModalHeader id="u2-profile-title" title="Hồ sơ người đăng" onClose={onClose} />

      <div className="u2-profile-hero">
        <span className="u2-avatar" aria-hidden="true">{initial}</span>
        <div>
          <p className="u2-profile-name">{user.name}</p>
          <p className="u2-profile-handle">@{user.username}</p>
        </div>
      </div>

      <dl className="u2-profile-info">
        <div><dt>Email</dt><dd>{user.email || '—'}</dd></div>
        <div>
          <dt>Số điện thoại</dt>
          <dd>{user.phone ? <a href={`tel:${user.phone}`}>{user.phone}</a> : '—'}</dd>
        </div>
      </dl>

      <footer className="u2-dialog-foot">
        {isOwnProfile ? (
          <button type="button" className="u2-btn primary block" onClick={() => onEditProfile(user)}>
            Chỉnh sửa hồ sơ
          </button>
        ) : (
          <button
            type="button"
            className="u2-btn dark block"
            onClick={() => {
              onClose();
              onStartChat?.(user);
            }}
          >
            <Icon name="message" size={16} /> Nhắn tin với người này
          </button>
        )}
      </footer>
    </Modal>
  );
}

// ============================================================================
// LỊCH HẸN / HỢP ĐỒNG
// ============================================================================

function StatusBadge({ status }) {
  const meta = getStatusMeta(status);
  return <span className={`u2-status is-${meta.tone}`}>{meta.label}</span>;
}

function HistoryPanel({ contracts, onView, onCancel, onBrowse }) {
  if (contracts.length === 0) {
    return (
      <EmptyState
        icon="file"
        title="Chưa có lịch hẹn nào"
        text="Khi bạn đặt lịch xem phòng, lịch hẹn và thỏa thuận sẽ hiện ở đây."
        action={<button type="button" className="u2-btn primary" onClick={onBrowse}>Tìm phòng ngay</button>}
      />
    );
  }

  return (
    <div className="u2-table-wrap">
      <table className="u2-table">
        <caption className="u2-sr-only">Danh sách lịch hẹn xem phòng và hợp đồng thuê trọ</caption>
        <thead>
          <tr>
            <th scope="col">Mã</th>
            <th scope="col">Phòng trọ</th>
            <th scope="col">Giá thuê</th>
            <th scope="col">Ngày hẹn / Bắt đầu</th>
            <th scope="col">Trạng thái</th>
            <th scope="col"><span className="u2-sr-only">Thao tác</span></th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((ctr) => (
            <tr key={ctr.contractId}>
              <td data-label="Mã" className="u2-cell-strong">{ctr.contractId}</td>
              <td data-label="Phòng trọ">{ctr.houseTitle}</td>
              <td data-label="Giá thuê" className="u2-cell-price">{formatVnd(ctr.monthlyPrice)}/tháng</td>
              <td data-label="Ngày hẹn">{ctr.startDate}</td>
              <td data-label="Trạng thái"><StatusBadge status={ctr.status} /></td>
              <td data-label="Thao tác" className="u2-cell-actions">
                <button type="button" className="u2-btn ghost sm" onClick={() => onView(ctr)}>Chi tiết</button>
                {isBookingCancellable(ctr.status) && (
                  <button type="button" className="u2-btn ghost sm is-danger-text" onClick={() => onCancel(ctr)}>
                    Huỷ lịch
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContractDetailModal({ contract, onClose, onCopied }) {
  const tenant = contract.tenant || {};
  const landlord = contract.landlord || {};
  const hasMssv = /^\d{6,}$/.test(tenant.mssv || '');
  // Dữ liệu cũ lưu ghi chú vào trường mssv; hiển thị lại cho đúng.
  const note = tenant.note || (!hasMssv ? tenant.mssv : '');

  const copyId = async () => {
    const ok = await copyText(contract.contractId);
    onCopied(ok);
  };

  return (
    <Modal titleId="u2-contract-title" size="md" layer={2} onClose={onClose}>
      <ModalHeader id="u2-contract-title" title={`Thỏa thuận thuê trọ ${contract.contractId}`} onClose={onClose} />

      <div className="u2-dialog-body">
        <dl className="u2-summary">
          <div><dt>Phòng trọ</dt><dd>{contract.houseTitle}</dd></div>
          <div><dt>Giá thuê</dt><dd className="u2-cell-price">{formatVnd(contract.monthlyPrice)}/tháng</dd></div>
          <div><dt>Ngày hẹn / Bắt đầu</dt><dd>{contract.startDate}</dd></div>
          <div><dt>Trạng thái</dt><dd><StatusBadge status={contract.status} /></dd></div>
        </dl>

        <section className="u2-party">
          <h3><Icon name="home" size={16} /> Bên cho thuê (chủ trọ)</h3>
          <dl>
            <div><dt>Họ tên</dt><dd>{landlord.name || '—'}</dd></div>
            <div><dt>Email</dt><dd>{landlord.email || 'Chưa cung cấp'}</dd></div>
            <div><dt>SĐT / Zalo</dt><dd>{landlord.phone ? <a href={`tel:${landlord.phone}`}>{landlord.phone}</a> : 'Chưa cung cấp'}</dd></div>
          </dl>
        </section>

        <section className="u2-party">
          <h3><Icon name="user" size={16} /> Bên thuê (sinh viên)</h3>
          <dl>
            <div><dt>Họ tên</dt><dd>{tenant.name || '—'}</dd></div>
            <div><dt>Email</dt><dd>{tenant.email || '—'}</dd></div>
            <div><dt>Số điện thoại</dt><dd>{tenant.phone || '—'}</dd></div>
            {hasMssv && <div><dt>MSSV</dt><dd>{tenant.mssv}</dd></div>}
            {note && <div><dt>Ghi chú cho chủ trọ</dt><dd>{note}</dd></div>}
          </dl>
        </section>
      </div>

      <footer className="u2-dialog-foot is-actions">
        <button type="button" className="u2-btn ghost" onClick={copyId}>
          <Icon name="copy" size={15} /> Sao chép mã
        </button>
        <button type="button" className="u2-btn primary" data-autofocus onClick={onClose}>Đóng</button>
      </footer>
    </Modal>
  );
}

function BookingModal({ item, currentUser, onClose, onConfirm }) {
  const user = resolveUserObject(currentUser);
  const author = getAuthor(item);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [note, setNote] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const errors = validateBooking({ date, time });

  const submit = () => {
    setShowErrors(true);
    if (Object.keys(errors).length > 0) {
      document.getElementById(errors.date ? 'u2-book-date' : 'u2-book-time')?.focus();
      return;
    }
    onConfirm({ date, time, note: note.trim() });
  };

  return (
    <Modal titleId="u2-booking-title" size="sm" layer={2} onClose={onClose}>
      <ModalHeader id="u2-booking-title" title="Đặt lịch xem phòng" onClose={onClose} />

      <div className="u2-dialog-body">
        <div className="u2-mini-listing">
          <p className="u2-mini-title">{item.title}</p>
          <p className="u2-mini-price">{formatVnd(item.price)}/tháng</p>
          <p className="u2-mini-meta">Chủ trọ: {author.name}</p>
        </div>

        <Field id="u2-book-user" label="Người đặt lịch">
          <input id="u2-book-user" className="u2-input" value={user.name} disabled readOnly />
        </Field>

        <div className="u2-form-row">
          <Field id="u2-book-date" label="Ngày xem" required error={showErrors ? errors.date : ''}>
            <input
              id="u2-book-date"
              className="u2-input"
              type="date"
              min={getTodayInputValue()}
              value={date}
              aria-invalid={showErrors && Boolean(errors.date)}
              aria-describedby="u2-book-date-msg"
              onChange={(e) => setDate(e.target.value)}
              data-autofocus
            />
          </Field>
          <Field id="u2-book-time" label="Giờ xem" required error={showErrors ? errors.time : ''}>
            <input
              id="u2-book-time"
              className="u2-input"
              type="time"
              min={BOOKING_HOURS.min}
              max={BOOKING_HOURS.max}
              value={time}
              aria-invalid={showErrors && Boolean(errors.time)}
              aria-describedby="u2-book-time-msg"
              onChange={(e) => setTime(e.target.value)}
            />
          </Field>
        </div>

        <Field id="u2-book-note" label="Ghi chú cho chủ trọ" hint={`${note.length}/200 ký tự`}>
          <textarea
            id="u2-book-note"
            className="u2-input"
            rows={3}
            maxLength={200}
            placeholder="VD: Em qua cùng bạn, khoảng 15 phút."
            value={note}
            aria-describedby="u2-book-note-msg"
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>

      <footer className="u2-dialog-foot is-actions">
        <button type="button" className="u2-btn ghost" onClick={onClose}>Huỷ</button>
        <button type="button" className="u2-btn primary" onClick={submit}>Gửi lịch hẹn</button>
      </footer>
    </Modal>
  );
}

// ============================================================================
// ĐĂNG TIN PHÒNG TRỌ
// ============================================================================

function ListingComposer({ currentUser, onOpenProfile, onClose, onSubmit, notify }) {
  const user = resolveUserObject(currentUser);
  const defaultType =
    ROOM_TYPES.find((t) => t.id === 'phong_tro')?.id || ROOM_TYPES.find((t) => t.id !== 'all')?.id || 'phong_tro';

  // Ô số lưu dạng chuỗi để người dùng xoá hết và gõ lại được (bản cũ ép Number nên không xoá được số 0).
  const [form, setForm] = useState({
    title: '',
    price: '2500000',
    area: '20',
    type: defaultType,
    distanceKm: '1',
    amenities: [],
    address: '',
    description: '',
    contactPhone: user.phone || '',
    coverImage: '',
    images: [],
  });
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const errors = useMemo(() => validateListing(form), [form]);
  const show = (key) => (showErrors ? errors[key] : '');
  const setField = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const isDirty = Boolean(
    form.title.trim() || form.address.trim() || form.description.trim() || form.coverImage || form.images.length,
  );
  const requestClose = () => (isDirty ? setConfirmClose(true) : onClose());

  const toggleAmenity = (id) => {
    setForm((f) => ({
      ...f,
      amenities: f.amenities.includes(id) ? f.amenities.filter((x) => x !== id) : [...f.amenities, id],
    }));
  };

  const handleCover = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const data = await compressImage(file);
      setForm((f) => ({ ...f, coverImage: data }));
    } catch (err) {
      notify(err.message || 'Không xử lý được ảnh bìa.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDetailFiles = async (files) => {
    if (files.length === 0) return;
    const max = LISTING_LIMITS.maxDetailImages;
    const room = max - form.images.length;
    if (room <= 0) {
      notify(`Mỗi tin chỉ đăng tối đa ${max} ảnh chi tiết.`, 'warning');
      return;
    }
    if (files.length > room) notify(`Đã bỏ ${files.length - room} ảnh vì vượt giới hạn ${max} ảnh.`, 'warning');

    setBusy(true);
    const results = await Promise.allSettled(files.slice(0, room).map((file) => compressImage(file)));
    const done = results.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
    const failed = results.length - done.length;
    if (done.length) setForm((f) => ({ ...f, images: [...f.images, ...done].slice(0, max) }));
    if (failed) notify(`${failed} ảnh không dùng được (sai định dạng hoặc quá 8MB).`, 'error');
    setBusy(false);
  };

  const removeDetailImage = (index) => setForm((f) => ({ ...f, images: f.images.filter((_, i) => i !== index) }));

  const handleSubmit = () => {
    setShowErrors(true);
    const firstInvalid = Object.keys(errors)[0];
    if (firstInvalid) {
      document.getElementById(`u2-field-${firstInvalid}`)?.focus();
      return;
    }
    onSubmit({
      title: form.title.trim(),
      price: Number(form.price),
      area: parseDecimal(form.area),
      type: form.type,
      distanceKm: parseDecimal(form.distanceKm),
      amenities: form.amenities,
      address: form.address.trim(),
      description: form.description.trim(),
      coverImage: form.coverImage,
      images: form.images,
      authorEmail: user.email,
      author: user,
      // Chưa có dịch vụ geocoding nên toạ độ là điểm ngẫu nhiên quanh khuôn viên UTC2.
      lat: UTC2_CAMPUS.lat + (Math.random() * 0.008 - 0.004),
      lng: UTC2_CAMPUS.lng + (Math.random() * 0.008 - 0.004),
      contact: { phone: form.contactPhone.trim(), zalo: form.contactPhone.trim() },
    });
  };

  const priceNumber = Number(form.price);

  return (
    <>
      <Modal titleId="u2-composer-title" size="md" layer={2} onClose={requestClose}>
        <ModalHeader id="u2-composer-title" title="Đăng tin phòng trọ" onClose={requestClose} />

        <div className="u2-dialog-body">
          <div className="u2-field">
            <span className="u2-label">Người đăng tin</span>
            <div className="u2-seller-box">
              <UserChip username={user.name} onOpen={() => onOpenProfile?.(currentUser)} />
              <span className="u2-seller-link">{user.email}</span>
            </div>
          </div>

          <Field id="u2-field-title" label="Tiêu đề tin đăng" required error={show('title')} hint={`${form.title.length}/${LISTING_LIMITS.titleMax} ký tự`}>
            <input
              id="u2-field-title"
              className="u2-input"
              placeholder="VD: Phòng trọ có ban công, gần UTC2"
              maxLength={LISTING_LIMITS.titleMax}
              value={form.title}
              aria-invalid={Boolean(show('title'))}
              aria-describedby="u2-field-title-msg"
              onChange={setField('title')}
              data-autofocus
            />
          </Field>

          <Field id="u2-field-price" label="Giá thuê mỗi tháng (đồng)" required error={show('price')}>
            <input
              id="u2-field-price"
              className="u2-input"
              inputMode="numeric"
              autoComplete="off"
              value={formatThousands(form.price)}
              aria-invalid={Boolean(show('price'))}
              aria-describedby="u2-field-price-msg u2-price-preview"
              onChange={(e) => setForm((f) => ({ ...f, price: digitsOnly(e.target.value) }))}
            />
            {Number.isFinite(priceNumber) && priceNumber > 0 && (
              <p id="u2-price-preview" className="u2-price-words">{numberToVietnameseWords(priceNumber)}</p>
            )}
          </Field>

          <div className="u2-form-row">
            <Field id="u2-field-type" label="Loại phòng">
              <select id="u2-field-type" className="u2-input" value={form.type} onChange={setField('type')}>
                {ROOM_TYPES.filter((t) => t.id !== 'all').map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </Field>
            <Field id="u2-field-area" label="Diện tích (m²)" required error={show('area')}>
              <input
                id="u2-field-area"
                className="u2-input"
                inputMode="decimal"
                value={form.area}
                aria-invalid={Boolean(show('area'))}
                aria-describedby="u2-field-area-msg"
                onChange={setField('area')}
              />
            </Field>
          </div>

          <div className="u2-form-row">
            <Field id="u2-field-distanceKm" label="Cách UTC2 (km)" required error={show('distanceKm')}>
              <input
                id="u2-field-distanceKm"
                className="u2-input"
                inputMode="decimal"
                value={form.distanceKm}
                aria-invalid={Boolean(show('distanceKm'))}
                aria-describedby="u2-field-distanceKm-msg"
                onChange={setField('distanceKm')}
              />
            </Field>
            <Field id="u2-field-contactPhone" label="Số điện thoại / Zalo" required error={show('contactPhone')}>
              <input
                id="u2-field-contactPhone"
                className="u2-input"
                type="tel"
                inputMode="tel"
                placeholder="0901234567"
                value={form.contactPhone}
                aria-invalid={Boolean(show('contactPhone'))}
                aria-describedby="u2-field-contactPhone-msg"
                onChange={setField('contactPhone')}
              />
            </Field>
          </div>

          <Field id="u2-field-address" label="Địa chỉ chi tiết" required error={show('address')}>
            <input
              id="u2-field-address"
              className="u2-input"
              placeholder="VD: Đường 447, Phường Tăng Nhơn Phú A"
              value={form.address}
              aria-invalid={Boolean(show('address'))}
              aria-describedby="u2-field-address-msg"
              onChange={setField('address')}
            />
          </Field>

          <Field
            id="u2-field-description"
            label="Mô tả chi tiết"
            error={show('description')}
            hint={`${form.description.length}/${LISTING_LIMITS.descriptionMax} ký tự`}
          >
            <textarea
              id="u2-field-description"
              className="u2-input"
              rows={4}
              placeholder="Giờ giấc tự do, điện nước theo giá nhà nước, có chỗ để xe..."
              value={form.description}
              aria-invalid={Boolean(show('description'))}
              aria-describedby="u2-field-description-msg"
              onChange={setField('description')}
            />
          </Field>

          <fieldset className="u2-field u2-fieldset">
            <legend className="u2-label">Tiện ích có sẵn</legend>
            <div className="u2-chip-wrap">
              {AMENITIES.map((a) => {
                const on = form.amenities.includes(a.id);
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

          <div className="u2-upload-box">
            <label className="u2-label" htmlFor="u2-upload-cover">Ảnh bìa</label>
            <input
              id="u2-upload-cover"
              className="u2-file"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                handleCover(file);
              }}
            />
            {form.coverImage && (
              <div className="u2-detail-thumb-item is-cover">
                <img src={form.coverImage} alt="Ảnh bìa đã chọn" />
                <button type="button" className="u2-thumb-delete" aria-label="Xoá ảnh bìa" onClick={() => setForm((f) => ({ ...f, coverImage: '' }))}>
                  <Icon name="close" size={10} strokeWidth={3} />
                </button>
              </div>
            )}
          </div>

          <div className="u2-upload-box">
            <label className="u2-label" htmlFor="u2-upload-detail">
              Ảnh phòng, nhà vệ sinh, bếp ({form.images.length}/{LISTING_LIMITS.maxDetailImages})
            </label>
            <input
              id="u2-upload-detail"
              className="u2-file"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = '';
                handleDetailFiles(files);
              }}
            />
            <p className="u2-field-hint">Ảnh được nén về tối đa {IMAGE_RULES.maxWidth}px để tiết kiệm bộ nhớ.</p>
            {form.images.length > 0 && (
              <div className="u2-detail-grid-thumbs">
                {form.images.map((src, index) => (
                  <div className="u2-detail-thumb-item" key={index}>
                    <img src={src} alt={`Ảnh chi tiết ${index + 1}`} />
                    <button type="button" className="u2-thumb-delete" aria-label={`Xoá ảnh chi tiết ${index + 1}`} onClick={() => removeDetailImage(index)}>
                      <Icon name="close" size={10} strokeWidth={3} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <footer className="u2-dialog-foot is-actions">
          <button type="button" className="u2-btn ghost" onClick={requestClose}>Huỷ</button>
          <button type="button" className="u2-btn primary" disabled={busy} onClick={handleSubmit}>
            {busy ? (<><span className="u2-spinner" aria-hidden="true" /> Đang xử lý ảnh...</>) : 'Đăng tin'}
          </button>
        </footer>
      </Modal>

      {/* Render ngang hàng với Modal để lớp phủ không bị cắt bởi hộp thoại cha. */}
      {confirmClose && (
        <ConfirmDialog
          title="Bỏ tin đang soạn?"
          message="Nội dung và ảnh bạn vừa nhập sẽ bị xoá và không khôi phục được."
          confirmLabel="Bỏ tin"
          cancelLabel="Tiếp tục soạn"
          onConfirm={onClose}
          onCancel={() => setConfirmClose(false)}
        />
      )}
    </>
  );
}

// ============================================================================
// COMPONENT CHÍNH
// ============================================================================

export default function HousingModule({ userData, currentUser, onOpenProfile, onOpenChat }) {
  const activeUser = useMemo(() => resolveUserObject(userData || currentUser), [userData, currentUser]);
  const currentUserEmail = activeUser.email;
  const { toasts, notify, dismiss } = useToasts();

  const [activeTab, setActiveTab] = useState('all'); // all | saved | my_houses | history

  const [items, setItems] = useState(() => {
    try {
      const loaded = loadHousing();
      return Array.isArray(loaded) ? loaded : [];
    } catch {
      return [];
    }
  });
  const [storedContracts, setContracts] = useLocalStorageState(STORAGE_KEYS.contracts, INITIAL_RENTAL_CONTRACTS);
  const [storedFavorites, setFavorites] = useLocalStorageState(STORAGE_KEYS.favorites, []);
  const contracts = Array.isArray(storedContracts) ? storedContracts : INITIAL_RENTAL_CONTRACTS;
  const favorites = useMemo(() => (Array.isArray(storedFavorites) ? storedFavorites : []), [storedFavorites]);
  const getFavorites = useLatest(favorites);

  // Bộ lọc & hiển thị
  const [q, setQ] = useState(DEFAULT_FILTERS.q);
  const [type, setType] = useState(DEFAULT_FILTERS.type);
  const [maxPrice, setMaxPrice] = useState(DEFAULT_FILTERS.maxPrice);
  const [maxKm, setMaxKm] = useState(DEFAULT_FILTERS.maxKm);
  const [amenity, setAmenity] = useState([]);
  const [view, setView] = useState('grid');
  const [sort, setSort] = useState('newest');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const debouncedQ = useDebouncedValue(q);

  // Hộp thoại
  const [active, setActive] = useState(null);
  const [composer, setComposer] = useState(false);
  const [profileTarget, setProfileTarget] = useState(null);
  const [bookingItem, setBookingItem] = useState(null);
  const [selectedContract, setSelectedContract] = useState(null);
  const [confirm, setConfirm] = useState(null); // { kind: 'delete' | 'cancel', ... }

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const isMine = useCallback((item) => isOwnedBy(item, activeUser), [activeUser]);
  const myCount = useMemo(() => items.filter(isMine).length, [items, isMine]);
  const savedCount = useMemo(() => items.filter((it) => favoriteSet.has(it.id)).length, [items, favoriteSet]);

  const filtered = useMemo(() => {
    let source = items;
    if (activeTab === 'my_houses') source = items.filter(isMine);
    else if (activeTab === 'saved') source = items.filter((it) => favoriteSet.has(it.id));
    const matches = filterListings(source, { q: debouncedQ, type, maxPrice, maxKm, amenity });
    return sortListings(matches, sort);
  }, [items, activeTab, isMine, favoriteSet, debouncedQ, type, maxPrice, maxKm, amenity, sort]);

  // Đổi bộ lọc/tab/sắp xếp thì quay về trang đầu.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedQ, type, maxPrice, maxKm, amenity, sort, activeTab]);

  // Danh sách bộ lọc đang bật, mỗi mục có nút gỡ nhanh.
  const activeChips = useMemo(() => {
    const chips = [];
    if (q.trim()) chips.push({ id: 'q', label: `"${q.trim()}"`, remove: () => setQ('') });
    if (type !== DEFAULT_FILTERS.type) {
      chips.push({ id: 'type', label: ROOM_TYPES.find((t) => t.id === type)?.label || type, remove: () => setType(DEFAULT_FILTERS.type) });
    }
    if (maxPrice !== DEFAULT_FILTERS.maxPrice) {
      chips.push({ id: 'price', label: `Đến ${formatVnd(maxPrice)}`, remove: () => setMaxPrice(DEFAULT_FILTERS.maxPrice) });
    }
    if (maxKm !== DEFAULT_FILTERS.maxKm) {
      chips.push({ id: 'km', label: `Trong ${maxKm} km`, remove: () => setMaxKm(DEFAULT_FILTERS.maxKm) });
    }
    amenity.forEach((id) => {
      chips.push({
        id: `am-${id}`,
        label: AMENITIES.find((a) => a.id === id)?.label || id,
        remove: () => setAmenity((prev) => prev.filter((x) => x !== id)),
      });
    });
    return chips;
  }, [q, type, maxPrice, maxKm, amenity]);

  const resetFilters = useCallback(() => {
    setQ(DEFAULT_FILTERS.q);
    setType(DEFAULT_FILTERS.type);
    setMaxPrice(DEFAULT_FILTERS.maxPrice);
    setMaxKm(DEFAULT_FILTERS.maxKm);
    setAmenity([]);
  }, []);

  // ---- Lưu trữ ----

  const persistItems = useCallback(
    (next) => {
      setItems(next);
      try {
        if (typeof saveHousing === 'function') saveHousing(next);
        return true;
      } catch (err) {
        console.warn('[Housing] Không lưu được danh sách tin:', err);
        notify('Bộ nhớ trình duyệt đã đầy nên tin này sẽ mất khi tải lại trang. Hãy xoá bớt tin cũ hoặc đăng ít ảnh hơn.', 'warning', 7000);
        return false;
      }
    },
    [notify],
  );

  // ---- Hành động ----

  const openDetail = useCallback((item) => setActive(item), []);

  const toggleFavorite = useCallback(
    (id) => {
      const current = getFavorites();
      const saved = current.includes(id);
      setFavorites(saved ? current.filter((x) => x !== id) : [id, ...current]);
      notify(saved ? 'Đã bỏ lưu tin.' : 'Đã lưu tin. Xem lại ở tab "Đã lưu".', saved ? 'info' : 'success', 2600);
    },
    [getFavorites, setFavorites, notify],
  );

  const handleOpenProfileModal = (user) => {
    if (onOpenProfile) onOpenProfile(user);
    setProfileTarget(resolveUserObject(user));
  };

  const handleEditProfile = (user) => {
    setProfileTarget(null);
    if (onOpenProfile) onOpenProfile(user);
    else notify('Hãy mở trang cá nhân từ menu tài khoản để chỉnh sửa hồ sơ.', 'info');
  };

  const handleStartChat = (landlord) => {
    if (onOpenChat) {
      onOpenChat(landlord);
      return;
    }
    notify('Tính năng nhắn tin chưa sẵn sàng. Bạn có thể gọi trực tiếp cho chủ trọ.', 'info');
  };

  const handleShare = async (item) => {
    const author = getAuthor(item);
    const phone = item.contact?.phone || author.phone;
    const text = [
      item.title,
      `${formatVnd(item.price)}/tháng · ${item.area} m² · cách UTC2 ${formatKm(item.distanceKm)} km`,
      item.address,
      phone ? `Liên hệ: ${phone}` : '',
    ].filter(Boolean).join('\n');

    if (navigator.share) {
      try {
        await navigator.share({ title: item.title, text });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return; // người dùng tự đóng bảng chia sẻ
      }
    }
    const ok = await copyText(text);
    notify(ok ? 'Đã sao chép thông tin phòng, bạn có thể dán gửi bạn bè.' : 'Không sao chép được, hãy thử lại.', ok ? 'success' : 'error');
  };

  const handleCreateSubmit = (payload) => {
    const newItem = {
      ...payload,
      id: `h_${Date.now()}`,
      createdAt: Date.now(),
      authorEmail: currentUserEmail,
      author: {
        name: activeUser.name,
        username: activeUser.username,
        email: currentUserEmail,
        phone: activeUser.phone,
      },
    };
    const saved = persistItems([newItem, ...items]);
    setComposer(false);
    // Chuyển sang "Tin của tôi" và gỡ bộ lọc để chắc chắn thấy tin vừa đăng.
    resetFilters();
    setSort('newest');
    setActiveTab('my_houses');
    if (saved) notify('Đăng tin thành công. Tin của bạn đã hiển thị cho mọi người.');
  };

  const confirmDelete = () => {
    const target = confirm.item;
    persistItems(items.filter((h) => h.id !== target.id));
    setFavorites(getFavorites().filter((id) => id !== target.id));
    setActive((cur) => (cur?.id === target.id ? null : cur));
    setConfirm(null);
    notify('Đã xoá tin phòng trọ.');
  };

  const handleConfirmBooking = (room, { date, time, note }) => {
    const hasOpenBooking = contracts.some(
      (c) => c.houseId && c.houseId === room.id && c.tenant?.email === currentUserEmail && getStatusMeta(c.status).tone === 'info',
    );
    if (hasOpenBooking) {
      notify('Bạn đã có lịch hẹn xem phòng này. Hãy huỷ lịch cũ trong tab "Lịch hẹn" nếu muốn đổi giờ.', 'warning', 6000);
      return;
    }

    const landlord = getAuthor(room);
    const newContract = {
      contractId: createContractId(),
      houseId: room.id,
      houseTitle: room.title,
      monthlyPrice: room.price,
      startDate: `${formatDateVi(date)} (${time})`,
      viewingAt: `${date}T${time}`,
      createdAt: Date.now(),
      status: CONTRACT_STATUS.BOOKED,
      landlord: {
        name: landlord.name,
        email: landlord.email,
        phone: room.contact?.phone || landlord.phone,
      },
      tenant: {
        name: activeUser.name,
        email: currentUserEmail,
        phone: activeUser.phone,
        mssv: '',
        note,
      },
    };

    setContracts([newContract, ...contracts]);
    setBookingItem(null);
    setActive(null);
    notify(`Đã gửi lịch hẹn xem "${room.title}". Theo dõi ở tab "Lịch hẹn & hợp đồng".`, 'success', 5500);
  };

  const confirmCancelBooking = () => {
    const target = confirm.contract;
    setContracts(
      contracts.map((c) =>
        c.contractId === target.contractId ? { ...c, status: CONTRACT_STATUS.CANCELLED, cancelledAt: Date.now() } : c,
      ),
    );
    setConfirm(null);
    notify('Đã huỷ lịch hẹn xem phòng.', 'info');
  };

  // ---- Hiển thị ----

  const tabs = [
    { id: 'all', label: 'Tất cả phòng trọ', count: items.length },
    { id: 'saved', label: 'Đã lưu', count: savedCount },
    { id: 'my_houses', label: 'Tin của tôi', count: myCount },
    { id: 'history', label: 'Lịch hẹn & hợp đồng', count: contracts.length },
  ];

  const visible = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visible.length;

  const renderEmpty = () => {
    const postButton = (
      <button type="button" className="u2-btn primary" onClick={() => setComposer(true)}>
        <Icon name="plus" size={16} /> Đăng tin phòng
      </button>
    );
    if (activeTab === 'saved' && savedCount === 0) {
      return <EmptyState icon="heart" title="Bạn chưa lưu tin nào" text="Nhấn biểu tượng trái tim trên tin đăng để lưu lại và so sánh sau." />;
    }
    if (activeTab === 'my_houses' && myCount === 0) {
      return <EmptyState icon="home" title="Bạn chưa đăng tin nào" text="Đăng tin đầu tiên để sinh viên khác tìm thấy phòng của bạn." action={postButton} />;
    }
    if (items.length === 0) {
      return <EmptyState icon="home" title="Chưa có tin đăng nào" text="Hãy là người đầu tiên đăng tin phòng trọ quanh UTC2." action={postButton} />;
    }
    return (
      <EmptyState
        icon="search"
        title="Không có phòng phù hợp"
        text="Thử nới khoảng giá, tăng khoảng cách hoặc bỏ bớt tiện ích."
        action={activeChips.length > 0 ? <button type="button" className="u2-btn ghost" onClick={resetFilters}>Xoá bộ lọc</button> : null}
      />
    );
  };

  return (
    <section className="u2-module" aria-labelledby="u2-module-title">
      <div className="u2-module-toolbar">
        <div>
          <p className="u2-module-kicker">Nhà ở sinh viên</p>
          <h1 id="u2-module-title" className="u2-module-title">Tìm phòng trọ</h1>
          <p className="u2-module-sub">Khoảng cách tính từ {UTC2_CAMPUS.name}</p>
        </div>
        <button className="u2-btn primary" type="button" onClick={() => setComposer(true)}>
          <Icon name="plus" size={16} /> Đăng tin phòng
        </button>
      </div>

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      <div id="u2-tabpanel" role="tabpanel" aria-labelledby={`u2-tab-${activeTab}`}>
        {activeTab === 'history' ? (
          <HistoryPanel
            contracts={contracts}
            onView={setSelectedContract}
            onCancel={(contract) => setConfirm({ kind: 'cancel', contract })}
            onBrowse={() => setActiveTab('all')}
          />
        ) : (
          <div className="u2-chotot-layout">
            <HousingFilter
              q={q} setQ={setQ}
              type={type} setType={setType}
              maxPrice={maxPrice} setMaxPrice={setMaxPrice}
              maxKm={maxKm} setMaxKm={setMaxKm}
              amenity={amenity} setAmenity={setAmenity}
              view={view} setView={setView}
              activeCount={activeChips.length}
              onReset={resetFilters}
            />

            <div className="u2-results">
              <div className="u2-results-head">
                <p className="u2-results-count" aria-live="polite">
                  <strong>{filtered.length}</strong> phòng trọ phù hợp
                </p>
                <label className="u2-sort">
                  <span>Sắp xếp</span>
                  <select className="u2-input" value={sort} onChange={(e) => setSort(e.target.value)}>
                    {SORT_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              {activeChips.length > 0 && (
                <ul className="u2-active-filters" aria-label="Bộ lọc đang áp dụng">
                  {activeChips.map((chip) => (
                    <li key={chip.id}>
                      <button type="button" className="u2-filter-pill" onClick={chip.remove} aria-label={`Gỡ bộ lọc ${chip.label}`}>
                        {chip.label} <Icon name="close" size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {filtered.length === 0 ? (
                renderEmpty()
              ) : (
                <>
                  <div className={`u2-listing-grid ${view}`}>
                    {visible.map((it) => (
                      <RoomCard
                        key={it.id}
                        item={it}
                        isMine={isMine(it)}
                        isSaved={favoriteSet.has(it.id)}
                        onToggleSave={toggleFavorite}
                        onClick={openDetail}
                      />
                    ))}
                  </div>
                  {remaining > 0 && (
                    <div className="u2-load-more">
                      <button type="button" className="u2-btn ghost" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
                        Xem thêm {Math.min(remaining, PAGE_SIZE)} phòng ({remaining} phòng còn lại)
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {active && (
        <HousingDetail
          key={active.id}
          item={active}
          isMine={isMine(active)}
          isSaved={favoriteSet.has(active.id)}
          onClose={() => setActive(null)}
          onDelete={() => setConfirm({ kind: 'delete', item: active })}
          onToggleSave={toggleFavorite}
          onShare={handleShare}
          onOpenProfile={handleOpenProfileModal}
          onStartChat={handleStartChat}
          onBookView={setBookingItem}
        />
      )}

      {profileTarget && (
        <ProfileModal
          user={profileTarget}
          currentUser={activeUser}
          onClose={() => setProfileTarget(null)}
          onStartChat={handleStartChat}
          onEditProfile={handleEditProfile}
        />
      )}

      {selectedContract && (
        <ContractDetailModal
          contract={selectedContract}
          onClose={() => setSelectedContract(null)}
          onCopied={(ok) => notify(ok ? 'Đã sao chép mã hợp đồng.' : 'Không sao chép được mã.', ok ? 'success' : 'error', 2500)}
        />
      )}

      {bookingItem && (
        <BookingModal
          item={bookingItem}
          currentUser={activeUser}
          onClose={() => setBookingItem(null)}
          onConfirm={(values) => handleConfirmBooking(bookingItem, values)}
        />
      )}

      {composer && (
        <ListingComposer
          currentUser={activeUser}
          onOpenProfile={handleOpenProfileModal}
          onClose={() => setComposer(false)}
          onSubmit={handleCreateSubmit}
          notify={notify}
        />
      )}

      {confirm?.kind === 'delete' && (
        <ConfirmDialog
          title="Xoá tin phòng trọ này?"
          message={`"${confirm.item.title}" sẽ bị gỡ khỏi danh sách và không khôi phục được.`}
          confirmLabel="Xoá tin"
          onConfirm={confirmDelete}
          onCancel={() => setConfirm(null)}
        />
      )}

      {confirm?.kind === 'cancel' && (
        <ConfirmDialog
          title="Huỷ lịch hẹn xem phòng?"
          message={`Lịch hẹn ${confirm.contract.contractId} (${confirm.contract.startDate}) sẽ chuyển sang trạng thái đã huỷ.`}
          confirmLabel="Huỷ lịch"
          cancelLabel="Giữ lịch"
          onConfirm={confirmCancelBooking}
          onCancel={() => setConfirm(null)}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </section>
  );
}
