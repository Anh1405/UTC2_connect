import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './MarketModule.css';
import {
  CONDITIONS,
  MARKET_CATEGORIES,
  formatVnd,
  loadMarket,
  saveMarket,
} from '../../data/seedCampus';
import { UserChip } from '../profile/UserProfileDrawer';
import ProductCard from './ProductCard';

// ============================================================================
// SHARED UTILITIES
// ============================================================================

/** Compress image to JPEG data-URL (max width + quality) to keep localStorage small. */
const compressImage = (file, maxWidth = 800, quality = 0.7) => {
  return new Promise((resolve) => {
    if (!file) return resolve('');
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(e.target.result);
    };
    reader.onerror = () => resolve('');
  });
};

/** Convert number to Vietnamese currency words. */
export function numberToVietnameseWords(number) {
  if (number === null || number === undefined || isNaN(number) || number < 0) return '';
  if (number === 0) return 'Không đồng';

  const defaultNumbers = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const units = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

  function readThreeDigits(num, showZeroHundreds) {
    const hundred = Math.floor(num / 100);
    const ten = Math.floor((num % 100) / 10);
    const unit = num % 10;
    let str = '';

    if (hundred > 0 || showZeroHundreds) {
      str += defaultNumbers[hundred] + ' trăm ';
    }

    if (ten > 1) {
      str += defaultNumbers[ten] + ' mươi ';
      if (unit === 1) str += 'mốt ';
      else if (unit === 5) str += 'lăm ';
      else if (unit > 0) str += defaultNumbers[unit] + ' ';
    } else if (ten === 1) {
      str += 'mười ';
      if (unit === 1) str += 'một ';
      else if (unit === 5) str += 'lăm ';
      else if (unit > 0) str += defaultNumbers[unit] + ' ';
    } else if (ten === 0 && unit > 0) {
      if (hundred > 0 || showZeroHundreds) str += 'lẻ ';
      if (unit === 5 && (hundred > 0 || showZeroHundreds)) str += 'năm ';
      else str += defaultNumbers[unit] + ' ';
    }

    return str;
  }

  let str = '';
  let tempNum = Math.floor(Number(number));
  const groups = [];

  while (tempNum > 0) {
    groups.push(tempNum % 1000);
    tempNum = Math.floor(tempNum / 1000);
  }

  for (let idx = groups.length - 1; idx >= 0; idx--) {
    const val = groups[idx];
    if (val > 0) {
      const showZeroHundreds = idx < groups.length - 1;
      str += readThreeDigits(val, showZeroHundreds) + units[idx] + ' ';
    }
  }

  str = str.trim().replace(/\s+/g, ' ');
  if (!str) return 'Không đồng';
  return str.charAt(0).toUpperCase() + str.slice(1) + ' đồng';
}

/** Normalize any user-like value into a consistent shape. */
const resolveUserObject = (user) => {
  if (!user) {
    return {
      name: 'Nguyễn Văn A',
      username: 'nguyenvana',
      email: 'nguyenvana@st.utc2.edu.vn',
      phone: '0912345678',
      department: 'CNTT',
      academicYear: 'K63',
    };
  }
  if (typeof user === 'string') {
    return {
      name: user,
      username: user,
      email: user.includes('@') ? user : `${user.toLowerCase().replace(/\s+/g, '')}@st.utc2.edu.vn`,
      phone: '0901234567',
      department: 'UTC2',
      academicYear: 'Sinh viên',
    };
  }
  return {
    name: user.name || user.displayName || user.username || 'Sinh viên UTC2',
    username: user.username || user.name || 'user_utc2',
    email: user.email || `${user.username || 'user'}@st.utc2.edu.vn`,
    phone: user.phone || '0901234567',
    department: user.department || 'UTC2',
    academicYear: user.academicYear || 'Sinh viên',
  };
};

const INITIAL_ORDERS = [
  {
    orderId: 'ORD-8821',
    itemTitle: 'Tai nghe Bluetooth Sony WH-CH510',
    price: 350000,
    date: '10/10/2026',
    status: 'Hoàn tất',
    seller: { name: 'Lê Văn C', email: 'levanc@st.utc2.edu.vn', phone: '0901112233' },
    buyer: {
      name: 'Bạn (Người mua)',
      email: 'user_current@st.utc2.edu.vn',
      phone: '0933445566',
      address: 'Ký túc xá Cổng 2, Trường UTC2',
    },
  },
];

const STORAGE_KEYS = {
  orders: 'utc2_market_orders',
  favorites: 'utc2_market_favorites',
};

const loadJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const saveJSON = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`[Market] Failed to persist ${key}:`, err);
  }
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MarketModule({ userData, currentUser, onOpenProfile, onOpenChat }) {
  const activeUserObj = resolveUserObject(userData || currentUser);
  const currentUserEmail = activeUserObj.email;

  const [activeTab, setActiveTab] = useState('all');
  const [isHydrating, setIsHydrating] = useState(true);

  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState(INITIAL_ORDERS);
  const [favorites, setFavorites] = useState([]);

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [category, setCategory] = useState('all');
  const [condition, setCondition] = useState('all');
  const [maxPrice, setMaxPrice] = useState(100000000);
  const [sortBy, setSortBy] = useState('newest');

  const [active, setActive] = useState(null);
  const [composer, setComposer] = useState(false);
  const [selectedModalImg, setSelectedModalImg] = useState(null);
  const [buyConfirmItem, setBuyConfirmItem] = useState(null);
  const [profileTarget, setProfileTarget] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    try {
      const loaded = loadMarket();
      setItems(Array.isArray(loaded) && loaded.length > 0 ? loaded : []);
    } catch {
      setItems([]);
    }
    setOrders(loadJSON(STORAGE_KEYS.orders, INITIAL_ORDERS));
    setFavorites(loadJSON(STORAGE_KEYS.favorites, []));
    setIsHydrating(false);
  }, []);

  useEffect(() => {
    const open = !!(active || composer || buyConfirmItem || profileTarget || selectedOrder);
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [active, composer, buyConfirmItem, profileTarget, selectedOrder]);

  const isMyItem = useCallback(
    (item) => {
      if (!item) return false;
      const authorEmail =
        item.authorEmail || (typeof item.author === 'object' ? item.author?.email : null);
      if (authorEmail && authorEmail === currentUserEmail) return true;
      const authorName =
        typeof item.author === 'string' ? item.author : item.author?.name || item.authorName;
      return authorName === activeUserObj.name || authorName === activeUserObj.username;
    },
    [currentUserEmail, activeUserObj.name, activeUserObj.username]
  );

  const toggleFavorite = useCallback((id) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      saveJSON(STORAGE_KEYS.favorites, next);
      return next;
    });
  }, []);

  const handleChangeStatus = useCallback((itemId, newStatus) => {
    setItems((prev) => {
      const next = prev.map((it) => (it.id === itemId ? { ...it, status: newStatus } : it));
      try {
        if (typeof saveMarket === 'function') saveMarket(next);
      } catch (e) {
        console.warn(e);
      }
      return next;
    });
    setActive((prev) => (prev?.id === itemId ? { ...prev, status: newStatus } : prev));
  }, []);

  const handleDeleteItem = useCallback((itemId) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa tin đăng này khỏi Chợ Tốt?')) return;
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== itemId);
      try {
        if (typeof saveMarket === 'function') saveMarket(next);
      } catch (e) {
        console.warn(e);
      }
      return next;
    });
    setActive((prev) => (prev?.id === itemId ? null : prev));
    setFavorites((prev) => {
      const next = prev.filter((id) => id !== itemId);
      saveJSON(STORAGE_KEYS.favorites, next);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    let list = items.filter((it) => {
      if (activeTab === 'my_posts' && !isMyItem(it)) return false;
      if (activeTab === 'wishlist' && !favorites.includes(it.id)) return false;

      if (category !== 'all') {
        const catMatch =
          it.category === category ||
          MARKET_CATEGORIES.some(
            (c) =>
              (c.id === category || c.label === category) &&
              (c.id === it.category || c.label === it.category)
          );
        if (!catMatch) return false;
      }

      if (condition !== 'all' && it.condition !== condition) return false;
      if (Number(it.price) > maxPrice) return false;

      if (debouncedQ) {
        const hay = `${it.title || ''} ${it.description || ''}`.toLowerCase();
        if (!hay.includes(debouncedQ.toLowerCase())) return false;
      }
      return true;
    });

    if (sortBy === 'price_asc') list = [...list].sort((a, b) => a.price - b.price);
    else if (sortBy === 'price_desc') list = [...list].sort((a, b) => b.price - a.price);
    else list = [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return list;
  }, [items, category, condition, maxPrice, debouncedQ, activeTab, favorites, sortBy, isMyItem]);

  const myPostsCount = useMemo(() => items.filter(isMyItem).length, [items, isMyItem]);

  const handleOpenDetail = useCallback((item) => {
    setActive(item);
    setSelectedModalImg(item.coverImage || item.images?.[0] || null);
  }, []);

  const handleOpenProfileModal = useCallback(
    (user) => {
      if (onOpenProfile) onOpenProfile(user);
      setProfileTarget(resolveUserObject(user));
    },
    [onOpenProfile]
  );

  const handleCreateSubmit = useCallback(
    (payload) => {
      const newItem = {
        ...payload,
        id: `m_${Date.now()}`,
        createdAt: Date.now(),
        status: 'available',
        authorEmail: currentUserEmail,
        author: {
          name: activeUserObj.name,
          username: activeUserObj.username,
          email: currentUserEmail,
          phone: activeUserObj.phone,
        },
      };

      setItems((prev) => {
        const next = [newItem, ...prev];
        try {
          if (typeof saveMarket === 'function') saveMarket(next);
        } catch (e) {
          console.warn(e);
        }
        return next;
      });
      setComposer(false);
      setActiveTab('my_posts');
    },
    [currentUserEmail, activeUserObj]
  );

  const handleStartChat = useCallback(
    (seller) => {
      if (onOpenChat) onOpenChat(seller);
      else alert(`Đã kết nối cuộc trò chuyện với ${resolveUserObject(seller).name}!`);
    },
    [onOpenChat]
  );

  const handleConfirmPurchase = useCallback(
    (item, location, offerPrice, note) => {
      const finalPrice = offerPrice ? Number(offerPrice) : item.price;
      const newOrd = {
        orderId: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
        itemTitle: item.title,
        price: finalPrice,
        date: new Date().toLocaleDateString('vi-VN'),
        status: 'Đã giao dịch',
        seller: {
          name:
            typeof item.author === 'string'
              ? item.author
              : item.author?.name || 'Người bán UTC2',
          email: item.authorEmail || item.author?.email || 'seller@st.utc2.edu.vn',
          phone: item.author?.phone || '0900000000',
        },
        buyer: {
          name: activeUserObj.name,
          email: currentUserEmail,
          phone: activeUserObj.phone,
          address: `${location}${note ? ` (${note})` : ''}`,
        },
      };

      setOrders((prev) => {
        const next = [newOrd, ...prev];
        saveJSON(STORAGE_KEYS.orders, next);
        return next;
      });

      setBuyConfirmItem(null);
      setActive(null);
      setActiveTab('history');
    },
    [activeUserObj, currentUserEmail]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (selectedOrder) setSelectedOrder(null);
      else if (buyConfirmItem) setBuyConfirmItem(null);
      else if (profileTarget) setProfileTarget(null);
      else if (composer) setComposer(false);
      else if (active) setActive(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, composer, buyConfirmItem, profileTarget, selectedOrder]);

  const tabs = [
    { id: 'all', label: '🛒 Tất cả rao bán' },
    { id: 'my_posts', label: `📝 Tin của tôi (${myPostsCount})` },
    { id: 'wishlist', label: `💖 Đã lưu (${favorites.length})` },
    { id: 'history', label: `📜 Lịch sử đơn hàng (${orders.length})` },
  ];

  return (
    <div className="u2-module">
      <header className="u2-module-toolbar">
        <div>
          <p className="u2-module-kicker">CHỢ TỐT UTC2 • {currentUserEmail}</p>
          <h1 className="u2-module-title">Chợ Đồ Cũ Sinh Viên</h1>
          <p className="u2-module-sub">
            Mua bán thanh lý đồ dùng, laptop, xe máy, giáo trình dễ dàng.
          </p>
        </div>
        <button
          className="u2-btn primary"
          type="button"
          onClick={() => setComposer(true)}
          aria-label="Đăng tin bán đồ mới"
        >
          + Đăng tin ngay
        </button>
      </header>

      <nav className="u2-tabs" role="tablist" aria-label="Chợ Tốt navigation">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            className={`u2-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {activeTab !== 'history' ? (
        <div className="u2-chotot-layout">
          <aside className="u2-filter-panel" aria-label="Bộ lọc sản phẩm">
            <label className="u2-label" htmlFor="market-search">
              🔍 Tìm kiếm từ khóa
            </label>
            <input
              id="market-search"
              className="u2-input"
              placeholder="Sách, Tai nghe, Xe máy..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoComplete="off"
            />

            <label className="u2-label" style={{ marginTop: 16 }}>
              📂 Danh mục sản phẩm
            </label>
            <div className="u2-chip-wrap" role="group" aria-label="Danh mục">
              {MARKET_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`u2-reason-chip ${category === c.id ? 'active' : ''}`}
                  onClick={() => setCategory(c.id)}
                  aria-pressed={category === c.id}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <label className="u2-label" style={{ marginTop: 16 }} htmlFor="market-condition">
              ✨ Tình trạng món đồ
            </label>
            <select
              id="market-condition"
              className="u2-input"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
            >
              <option value="all">Tất cả tình trạng</option>
              {CONDITIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>

            <label className="u2-label" style={{ marginTop: 16 }} htmlFor="market-sort">
              ⚡ Sắp xếp theo
            </label>
            <select
              id="market-sort"
              className="u2-input"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="newest">Mới đăng nhất</option>
              <option value="price_asc">Giá từ thấp đến cao</option>
              <option value="price_desc">Giá từ cao đến thấp</option>
            </select>

            <label className="u2-label" style={{ marginTop: 16 }} htmlFor="market-price">
              💰 Giá tối đa: {formatVnd(maxPrice)}
            </label>
            <input
              id="market-price"
              type="range"
              min={10000}
              max={100000000}
              step={500000}
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              aria-valuetext={formatVnd(maxPrice)}
            />
            <p className="u2-price-words">{numberToVietnameseWords(maxPrice)}</p>
          </aside>

          <div>
            <div className="u2-result-bar">
              <span>
                Hiển thị <strong>{filtered.length}</strong> sản phẩm
                {debouncedQ ? ` cho "${debouncedQ}"` : ''}
              </span>
            </div>

            <section className="u2-listing-grid" aria-live="polite">
              {isHydrating &&
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={`sk-${i}`} className="u2-skeleton-card" aria-hidden>
                    <div className="u2-skeleton-thumb" />
                    <div className="u2-skeleton-line" style={{ width: '70%' }} />
                    <div className="u2-skeleton-line" style={{ width: '40%' }} />
                    <div className="u2-skeleton-line" style={{ width: '55%' }} />
                  </div>
                ))}

              {!isHydrating && filtered.length === 0 && (
                <div className="u2-empty-state">
                  <div className="u2-empty-state__icon">📭</div>
                  <p className="u2-empty-state__title">Không tìm thấy sản phẩm phù hợp</p>
                  <p className="u2-empty-state__desc">
                    Thử nới lỏng bộ lọc hoặc đổi từ khóa tìm kiếm.
                  </p>
                </div>
              )}

              {!isHydrating &&
                filtered.map((it) => (
                  <ProductCard
                    key={it.id}
                    item={it}
                    isMine={isMyItem(it)}
                    isFav={favorites.includes(it.id)}
                    onToggleFav={toggleFavorite}
                    onClick={handleOpenDetail}
                  />
                ))}
            </section>
          </div>
        </div>
      ) : (
        <div className="u2-orders-wrap">
          {orders.length === 0 ? (
            <div className="u2-empty-state" style={{ margin: 12 }}>
              <div className="u2-empty-state__icon">📜</div>
              <p className="u2-empty-state__title">Chưa có đơn hàng nào</p>
              <p className="u2-empty-state__desc">
                Khi bạn mua hoặc trả giá sản phẩm, lịch sử sẽ hiện tại đây.
              </p>
            </div>
          ) : (
            <table className="u2-orders-table">
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Sản phẩm</th>
                  <th>Giá giao dịch</th>
                  <th>Ngày mua</th>
                  <th>Trạng thái</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((ord) => (
                  <tr key={ord.orderId}>
                    <td style={{ fontWeight: 700 }}>{ord.orderId}</td>
                    <td>{ord.itemTitle}</td>
                    <td style={{ color: 'var(--u2-danger)', fontWeight: 700 }}>
                      {formatVnd(ord.price)}
                    </td>
                    <td>{ord.date}</td>
                    <td>
                      <span className="u2-status-badge u2-status-badge--available">
                        {ord.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="u2-btn primary"
                        style={{ padding: '6px 12px', fontSize: 12 }}
                        onClick={() => setSelectedOrder(ord)}
                      >
                        👁️ Xem chi tiết 2 bên
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {active && (
        <div
          className="u2-report-overlay"
          onClick={() => setActive(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-title"
        >
          <div className="u2-detail-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="u2-report-close"
              style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}
              onClick={() => setActive(null)}
              aria-label="Đóng"
            >
              ✕
            </button>

            <div className="u2-carousel">
              {selectedModalImg ? (
                <img src={selectedModalImg} alt="" className="u2-carousel-main-img" />
              ) : (
                <div
                  style={{
                    height: 200,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#94a3b8',
                  }}
                >
                  Không có hình ảnh
                </div>
              )}

              <div className="u2-carousel-thumbs">
                {active.coverImage && (
                  <img
                    src={active.coverImage}
                    alt="Ảnh bìa"
                    onClick={() => setSelectedModalImg(active.coverImage)}
                    className={`u2-thumb-img ${
                      selectedModalImg === active.coverImage ? 'active' : ''
                    }`}
                  />
                )}
                {active.images?.map((img, idx) => (
                  <img
                    key={idx}
                    src={img}
                    alt={`Ảnh ${idx + 1}`}
                    onClick={() => setSelectedModalImg(img)}
                    className={`u2-thumb-img ${selectedModalImg === img ? 'active' : ''}`}
                  />
                ))}
              </div>
            </div>

            <div className="u2-detail-body">
              {isMyItem(active) && (
                <div
                  style={{
                    background: 'var(--u2-secondary-soft)',
                    color: '#1d4ed8',
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    marginBottom: 12,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <span>🏷️ Tin đăng của bạn ({currentUserEmail})</span>
                  <select
                    value={active.status || 'available'}
                    onChange={(e) => handleChangeStatus(active.id, e.target.value)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '1px solid #3b82f6',
                      background: '#fff',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                    aria-label="Đổi trạng thái tin"
                  >
                    <option value="available">🟢 Đang bán</option>
                    <option value="reserved">🟡 Đã nhận cọc</option>
                    <option value="sold">🔴 Đã bán xong</option>
                  </select>
                </div>
              )}

              <p className="u2-listing-price" style={{ margin: 0 }}>
                {formatVnd(active.price)}
              </p>
              <p className="u2-price-words" style={{ display: 'inline-block', margin: '4px 0 12px' }}>
                👉 {numberToVietnameseWords(active.price)}
              </p>

              <h2
                id="detail-title"
                style={{ fontSize: '1.25rem', margin: '0 0 8px', color: 'var(--u2-text-main)' }}
              >
                {active.title}
              </h2>
              <p
                style={{
                  color: '#475569',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-line',
                  margin: 0,
                }}
              >
                {active.description || 'Không có mô tả chi tiết.'}
              </p>

              <div
                className="u2-seller-box"
                onClick={() => handleOpenProfileModal(active.author)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleOpenProfileModal(active.author);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <UserChip
                  username={
                    typeof active.author === 'string' ? active.author : active.author?.name
                  }
                  onOpen={() => handleOpenProfileModal(active.author)}
                />
                <span className="u2-seller-link">Trang cá nhân người bán ➔</span>
              </div>

              <div className="u2-action-group">
                {isMyItem(active) ? (
                  <button
                    type="button"
                    className="u2-btn danger flex-1"
                    onClick={() => handleDeleteItem(active.id)}
                  >
                    🗑️ Xóa tin đăng này
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="u2-btn ghost flex-1"
                      onClick={() => handleStartChat(active.author)}
                    >
                      💬 Nhắn tin Chợ Tốt
                    </button>
                    <button
                      type="button"
                      className="u2-btn primary flex-1"
                      onClick={() => setBuyConfirmItem(active)}
                      disabled={active.status === 'sold'}
                    >
                      🛒 Trả giá / Mua ngay
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {profileTarget && (
        <PassengerProfileModal
          user={profileTarget}
          currentUser={activeUserObj}
          onClose={() => setProfileTarget(null)}
          onStartChat={handleStartChat}
        />
      )}

      {selectedOrder && (
        <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}

      {buyConfirmItem && (
        <BuyModal
          item={buyConfirmItem}
          currentUser={activeUserObj}
          onClose={() => setBuyConfirmItem(null)}
          onConfirm={handleConfirmPurchase}
        />
      )}

      {composer && (
        <CreateListing
          currentUser={activeUserObj}
          onOpenProfile={handleOpenProfileModal}
          onClose={() => setComposer(false)}
          onSubmit={handleCreateSubmit}
        />
      )}
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function OrderDetailModal({ order, onClose }) {
  return (
    <div
      className="u2-report-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-detail-title"
    >
      <div
        className="u2-report-ticket"
        style={{ maxWidth: 500 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="u2-report-head">
          <h3 id="order-detail-title">📄 Chi tiết giao dịch #{order.orderId}</h3>
          <button type="button" className="u2-report-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="u2-report-body">
          <div
            style={{
              background: 'var(--u2-surface-2)',
              padding: 12,
              borderRadius: 8,
              border: '1px solid var(--u2-border)',
            }}
          >
            <p style={{ margin: '4px 0' }}>
              <strong>Sản phẩm:</strong> {order.itemTitle}
            </p>
            <p style={{ margin: '4px 0' }}>
              <strong>Giá chốt:</strong>{' '}
              <span style={{ color: 'var(--u2-danger)', fontWeight: 700 }}>
                {formatVnd(order.price)}
              </span>
            </p>
            <p style={{ margin: '4px 0' }}>
              <strong>Ngày tạo:</strong> {order.date}
            </p>
          </div>

          <div
            style={{
              border: '1px solid var(--u2-border-strong)',
              borderRadius: 8,
              padding: 12,
            }}
          >
            <h4 style={{ margin: '0 0 6px', color: 'var(--u2-secondary)' }}>👤 BÊN BÁN</h4>
            <p style={{ margin: '2px 0', fontSize: 13 }}>Họ tên: {order.seller.name}</p>
            <p style={{ margin: '2px 0', fontSize: 13 }}>Email: {order.seller.email}</p>
            <p style={{ margin: '2px 0', fontSize: 13 }}>SĐT/Zalo: {order.seller.phone}</p>
          </div>

          <div
            style={{
              border: '1px solid var(--u2-border-strong)',
              borderRadius: 8,
              padding: 12,
            }}
          >
            <h4 style={{ margin: '0 0 6px', color: '#16a34a' }}>🛍️ BÊN MUA</h4>
            <p style={{ margin: '2px 0', fontSize: 13 }}>Họ tên: {order.buyer.name}</p>
            <p style={{ margin: '2px 0', fontSize: 13 }}>Email: {order.buyer.email}</p>
            <p style={{ margin: '2px 0', fontSize: 13 }}>SĐT/Zalo: {order.buyer.phone}</p>
            <p style={{ margin: '2px 0', fontSize: 13 }}>
              Địa điểm giao dịch: {order.buyer.address}
            </p>
          </div>
        </div>

        <div className="u2-report-footer">
          <button className="u2-btn primary" type="button" onClick={onClose} style={{ width: '100%' }}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

function PassengerProfileModal({ user, currentUser, onClose, onStartChat }) {
  const initialLetter = (user.name || 'N').charAt(0).toUpperCase();
  const me = resolveUserObject(currentUser);
  const isOwnProfile =
    currentUser && (user.email === me.email || user.username === me.username);

  return (
    <div
      className="u2-report-overlay"
      onClick={onClose}
      style={{ zIndex: 1100 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-title"
    >
      <div
        className="u2-report-ticket"
        style={{ maxWidth: 440, background: '#fff9ef', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            background: '#0b1329',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              color: '#f59e0b',
              fontWeight: 800,
              fontSize: '0.85rem',
              letterSpacing: '2px',
            }}
          >
            HỒ SƠ THÀNH VIÊN
          </span>
          <button type="button" className="u2-report-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <div
          style={{
            background: '#fffdf0',
            padding: '24px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            borderBottom: '1px solid #fef08a',
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: '#1e293b',
              color: '#f59e0b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.8rem',
              fontWeight: 700,
            }}
            aria-hidden
          >
            {initialLetter}
          </div>
          <div>
            <h3
              id="profile-title"
              style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}
            >
              {user.name}
            </h3>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.85rem' }}>
              @{user.username}
            </p>
          </div>
        </div>

        <div
          style={{
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            background: '#fffdf0',
          }}
        >
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>EMAIL</label>
            <p style={{ margin: '2px 0 0', fontWeight: 600, color: '#0f172a' }}>
              {user.email || '—'}
            </p>
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>
              SỐ ĐIỆN THOẠI
            </label>
            <p style={{ margin: '2px 0 0', fontWeight: 600, color: '#0f172a' }}>
              {user.phone || '—'}
            </p>
          </div>
        </div>

        <div
          style={{
            padding: '16px 20px',
            background: '#fffdf0',
            borderTop: '1px solid #fef08a',
          }}
        >
          {isOwnProfile ? (
            <button
              type="button"
              className="u2-btn primary"
              style={{ width: '100%', background: '#f59e0b', color: '#0f172a' }}
              onClick={() => alert('Chỉnh sửa thông tin')}
            >
              Chỉnh sửa hồ sơ
            </button>
          ) : (
            <button
              type="button"
              className="u2-btn primary"
              style={{ width: '100%', background: '#0f172a' }}
              onClick={() => {
                onClose();
                if (onStartChat) onStartChat(user);
              }}
            >
              💬 Nhắn tin qua Chợ Tốt
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BuyModal({ item, onClose, onConfirm }) {
  const [location, setLocation] = useState('Cổng chính UTC2');
  const [offerPrice, setOfferPrice] = useState(item.price);
  const [note, setNote] = useState('');

  const numericOffer = Number(offerPrice) || 0;

  return (
    <div
      className="u2-report-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="buy-title"
    >
      <div
        className="u2-report-ticket"
        style={{ maxWidth: 440 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="u2-report-head">
          <h3 id="buy-title">Đặt mua / Trả giá sản phẩm</h3>
          <button type="button" className="u2-report-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="u2-report-body">
          <div
            style={{
              background: 'var(--u2-surface-2)',
              padding: 12,
              borderRadius: 8,
              border: '1px solid var(--u2-border)',
            }}
          >
            <h4 style={{ margin: '0 0 6px', fontSize: '1rem', color: 'var(--u2-text-main)' }}>
              {item.title}
            </h4>
            <p style={{ margin: 0, fontWeight: 700, color: 'var(--u2-danger)' }}>
              Giá niêm yết: {formatVnd(item.price)}
            </p>
          </div>

          <div>
            <label className="u2-label" htmlFor="offer-price">
              Giá bạn muốn đề xuất (VNĐ)
            </label>
            <input
              id="offer-price"
              className="u2-input"
              type="number"
              min={0}
              step={10000}
              value={offerPrice}
              onChange={(e) => setOfferPrice(e.target.value)}
            />
            <p className="u2-price-words">👉 {numberToVietnameseWords(numericOffer)}</p>
          </div>

          <div>
            <label className="u2-label" htmlFor="meetup-location">
              Địa điểm hẹn giao dịch tại UTC2
            </label>
            <select
              id="meetup-location"
              className="u2-input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              <option value="Cổng chính UTC2">Cổng chính UTC2</option>
              <option value="Sân nhà xe sinh viên">Sân nhà xe sinh viên</option>
              <option value="Tòa A - Sảnh trung tâm">Tòa A - Sảnh trung tâm</option>
              <option value="Thư viện trường">Thư viện trường</option>
              <option value="Căn tin sinh viên">Căn tin sinh viên</option>
            </select>
          </div>

          <div>
            <label className="u2-label" htmlFor="buy-note">
              Ghi chú gửi người bán
            </label>
            <textarea
              id="buy-note"
              className="u2-input"
              rows={2}
              placeholder="Nhắn thời gian bạn rảnh hoặc thương lượng..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <div className="u2-report-footer">
          <button className="u2-btn ghost" type="button" onClick={onClose}>
            Hủy
          </button>
          <button
            className="u2-btn primary"
            type="button"
            onClick={() => onConfirm(item, location, offerPrice, note)}
            disabled={numericOffer <= 0}
          >
            Xác nhận gửi yêu cầu
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateListing({ currentUser, onOpenProfile, onClose, onSubmit }) {
  const userObj = resolveUserObject(currentUser);

  const defaultCategoryId =
    MARKET_CATEGORIES.find((c) => c.id !== 'all')?.id || 'books';

  const [form, setForm] = useState({
    title: '',
    price: 100000,
    category: defaultCategoryId,
    condition: 'used',
    description: '',
    coverImage: '',
    images: [],
  });
  const [loading, setLoading] = useState(false);

  const onCoverFile = async (file) => {
    if (!file) return;
    setLoading(true);
    try {
      const compressed = await compressImage(file, 800, 0.7);
      setForm((f) => ({ ...f, coverImage: compressed }));
    } finally {
      setLoading(false);
    }
  };

  const onDetailFiles = async (files) => {
    if (!files || files.length === 0) return;
    setLoading(true);
    try {
      const fileList = Array.from(files).slice(0, 8);
      const compressedList = await Promise.all(
        fileList.map((f) => compressImage(f, 800, 0.7))
      );
      setForm((f) => ({ ...f, images: [...f.images, ...compressedList].slice(0, 10) }));
    } finally {
      setLoading(false);
    }
  };

  const removeDetailImage = (index) => {
    setForm((f) => ({
      ...f,
      images: f.images.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = () => {
    if (!form.title.trim()) return alert('Vui lòng nhập Tiêu đề tin đăng!');
    if (!form.price || form.price <= 0) return alert('Vui lòng nhập Giá bán hợp lệ!');

    onSubmit({
      ...form,
      category: form.category,
      authorEmail: userObj.email,
      author: userObj,
    });
  };

  return (
    <div
      className="u2-report-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-title"
    >
      <div className="u2-report-ticket" onClick={(e) => e.stopPropagation()}>
        <div className="u2-report-head">
          <h3 id="create-title">+ Đăng tin bán đồ Chợ Tốt</h3>
          <button type="button" className="u2-report-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="u2-report-body">
          <div>
            <label className="u2-label">Tài khoản đăng bán (*)</label>
            <div
              className="u2-seller-box"
              onClick={() => onOpenProfile && onOpenProfile(currentUser)}
              style={{ marginTop: 0 }}
              role="button"
              tabIndex={0}
            >
              <UserChip
                username={userObj.name}
                onOpen={() => onOpenProfile && onOpenProfile(currentUser)}
              />
              <span className="u2-seller-link">🏷️ {userObj.email}</span>
            </div>
          </div>

          <div>
            <label className="u2-label" htmlFor="create-title-input">
              Tiêu đề tin rao bán (*)
            </label>
            <input
              id="create-title-input"
              className="u2-input"
              placeholder="VD: Laptop Dell Core i5 còn mới 95%..."
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              maxLength={120}
            />
          </div>

          <div>
            <label className="u2-label" htmlFor="create-price">
              Giá bán (VNĐ) (*)
            </label>
            <input
              id="create-price"
              className="u2-input"
              type="number"
              step={10000}
              min={0}
              value={form.price}
              onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
            />
            <p className="u2-price-words">
              👉 Bằng chữ: {numberToVietnameseWords(form.price)}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="u2-label" htmlFor="create-category">
                Danh mục
              </label>
              <select
                id="create-category"
                className="u2-input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {MARKET_CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="u2-label" htmlFor="create-condition">
                Tình trạng
              </label>
              <select
                id="create-condition"
                className="u2-input"
                value={form.condition}
                onChange={(e) => setForm({ ...form, condition: e.target.value })}
              >
                {CONDITIONS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="u2-label" htmlFor="create-desc">
              Mô tả chi tiết sản phẩm
            </label>
            <textarea
              id="create-desc"
              className="u2-input"
              rows={3}
              placeholder="Mô tả phụ kiện đi kèm, lý do bán, tình trạng pin..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="u2-upload-box">
            <label className="u2-label" htmlFor="create-cover">
              🖼 Ảnh bìa chính
            </label>
            <input
              id="create-cover"
              className="u2-input"
              type="file"
              accept="image/*"
              onChange={(e) => onCoverFile(e.target.files?.[0])}
            />
            {form.coverImage && (
              <img
                src={form.coverImage}
                alt="Xem trước ảnh bìa"
                style={{
                  width: 80,
                  height: 60,
                  marginTop: 8,
                  borderRadius: 6,
                  objectFit: 'cover',
                }}
              />
            )}
          </div>

          <div className="u2-upload-box">
            <label className="u2-label" htmlFor="create-details">
              📸 Các ảnh chi tiết sản phẩm
            </label>
            <input
              id="create-details"
              className="u2-input"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => onDetailFiles(e.target.files)}
            />
            {form.images.length > 0 && (
              <div className="u2-detail-grid-thumbs">
                {form.images.map((src, idx) => (
                  <div key={idx} className="u2-detail-thumb-item">
                    <img src={src} alt={`Chi tiết ${idx + 1}`} />
                    <button
                      type="button"
                      className="u2-thumb-delete"
                      onClick={() => removeDetailImage(idx)}
                      aria-label={`Xóa ảnh ${idx + 1}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="u2-report-footer">
          <button className="u2-btn ghost" type="button" onClick={onClose}>
            Huỷ
          </button>
          <button
            className="u2-btn primary"
            type="button"
            disabled={loading}
            onClick={handleSubmit}
          >
            {loading ? 'Đang xử lý ảnh...' : 'Đăng tin ngay'}
          </button>
        </div>
      </div>
    </div>
  );
}
