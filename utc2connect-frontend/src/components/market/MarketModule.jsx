import React, { useMemo, useState } from 'react';
import './MarketModule.css';
import {
  CONDITIONS,
  MARKET_CATEGORIES,
  formatVnd,
  loadMarket,
  saveMarket,
} from '../../data/seedCampus';
import { UserChip } from '../profile/UserProfileDrawer';

// ============================================================================
// TIỆN ÍCH DÙNG CHUNG (UTILS)
// ============================================================================

// Nén ảnh Base64 tự động
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
  });
};

// Đọc giá tiền bằng chữ Tiếng Việt
export function numberToVietnameseWords(number) {
  if (number === null || number === undefined || isNaN(number) || number < 0) return '';
  if (number === 0) return 'Không đồng';

  const defaultNumbers = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const units = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

  function readThreeDigits(num, showZeroHundreds) {
    let hundred = Math.floor(num / 100);
    let ten = Math.floor((num % 100) / 10);
    let unit = num % 10;
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
  let tempNum = Math.floor(number);
  const groups = [];

  while (tempNum > 0) {
    groups.push(tempNum % 1000);
    tempNum = Math.floor(tempNum / 1000);
  }

  for (let idx = groups.length - 1; idx >= 0; idx--) {
    const val = groups[idx];
    if (val > 0) {
      const showZeroHundreds = idx < groups.length - 1;
      const groupStr = readThreeDigits(val, showZeroHundreds);
      str += groupStr + units[idx] + ' ';
    }
  }

  str = str.trim().replace(/\s+/g, ' ');
  if (!str) return 'Không đồng';

  return str.charAt(0).toUpperCase() + str.slice(1) + ' đồng';
}

// Chuẩn hóa thông tin người dùng
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
    buyer: { name: 'Bạn (Người mua)', email: 'user_current@st.utc2.edu.vn', phone: '0933445566', address: 'Ký túc xá Cổng 2, Trường UTC2' },
  },
];

// ============================================================================
// MAIN COMPONENT MARKET MODULE
// ============================================================================

export default function MarketModule({ userData, currentUser, onOpenProfile, onOpenChat }) {
  const activeUserObj = resolveUserObject(userData || currentUser);
  const currentUserEmail = activeUserObj.email;

  const [activeTab, setActiveTab] = useState('all'); // all | my_posts | wishlist | history

  // Nạp danh sách món đồ từ LocalStorage
  const [items, setItems] = useState(() => {
    try {
      const loaded = loadMarket();
      return loaded && loaded.length > 0 ? loaded : [];
    } catch {
      return [];
    }
  });

  // Nạp danh sách Đơn hàng mua từ LocalStorage
  const [orders, setOrders] = useState(() => {
    try {
      const saved = localStorage.getItem('utc2_market_orders');
      return saved ? JSON.parse(saved) : INITIAL_ORDERS;
    } catch {
      return INITIAL_ORDERS;
    }
  });

  // Nạp danh sách Yêu thích từ LocalStorage
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem('utc2_market_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [selectedOrder, setSelectedOrder] = useState(null);

  // Bộ lọc
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const [condition, setCondition] = useState('all');
  const [maxPrice, setMaxPrice] = useState(100000000);
  const [sortBy, setSortBy] = useState('newest');

  // Modal
  const [active, setActive] = useState(null);
  const [composer, setComposer] = useState(false);
  const [selectedModalImg, setSelectedModalImg] = useState(null);
  const [buyConfirmItem, setBuyConfirmItem] = useState(null);
  const [profileTarget, setProfileTarget] = useState(null);

  // Kiểm tra bài viết chính chủ
  const isMyItem = (item) => {
    if (!item) return false;
    const authorEmail = item.authorEmail || (typeof item.author === 'object' ? item.author?.email : null);
    if (authorEmail && authorEmail === currentUserEmail) return true;
    const authorName = typeof item.author === 'string' ? item.author : item.author?.name || item.authorName;
    return authorName === activeUserObj.name || authorName === activeUserObj.username;
  };

  // Toggle Yêu thích + Lưu LocalStorage
  const toggleFavorite = (id, e) => {
    if (e) e.stopPropagation();
    const nextFavs = favorites.includes(id)
      ? favorites.filter((item) => item !== id)
      : [...favorites, id];

    setFavorites(nextFavs);
    try {
      localStorage.setItem('utc2_market_favorites', JSON.stringify(nextFavs));
    } catch (err) {
      console.warn('Lỗi lưu favorites:', err);
    }
  };

  // Đổi trạng thái bài đăng
  const handleChangeStatus = (itemId, newStatus) => {
    const nextItems = items.map((it) => (it.id === itemId ? { ...it, status: newStatus } : it));
    setItems(nextItems);
    try {
      if (typeof saveMarket === 'function') saveMarket(nextItems);
    } catch (e) {
      console.warn(e);
    }
    if (active?.id === itemId) {
      setActive({ ...active, status: newStatus });
    }
  };

  // Xóa bài đăng
  const handleDeleteItem = (itemId) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa tin đăng này khỏi Chợ Tốt?')) {
      const nextItems = items.filter((i) => i.id !== itemId);
      setItems(nextItems);
      try {
        if (typeof saveMarket === 'function') saveMarket(nextItems);
      } catch (e) {
        console.warn(e);
      }
      if (active?.id === itemId) setActive(null);
      alert('Đã xóa tin thành công!');
    }
  };

  // Bỏ lọc bài
  const filtered = useMemo(() => {
    let list = items.filter((it) => {
      if (activeTab === 'my_posts' && !isMyItem(it)) return false;
      if (activeTab === 'wishlist' && !favorites.includes(it.id)) return false;
      if (category !== 'all' && it.category !== category) return false;
      if (condition !== 'all' && it.condition !== condition) return false;
      if (it.price > maxPrice) return false;
      if (q.trim() && !`${it.title} ${it.description}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
      return true;
    });

    if (sortBy === 'price_asc') list.sort((a, b) => a.price - b.price);
    else if (sortBy === 'price_desc') list.sort((a, b) => b.price - a.price);
    else list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return list;
  }, [items, category, condition, maxPrice, q, activeTab, favorites, sortBy, currentUserEmail]);

  const handleOpenDetail = (item) => {
    setActive(item);
    setSelectedModalImg(item.coverImage || item.images?.[0] || null);
  };

  const handleOpenProfileModal = (user) => {
    if (onOpenProfile) onOpenProfile(user);
    setProfileTarget(resolveUserObject(user));
  };

  const handleCreateSubmit = (payload) => {
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

    const nextItems = [newItem, ...items];
    setItems(nextItems);
    try {
      if (typeof saveMarket === 'function') saveMarket(nextItems);
    } catch (e) {
      console.warn(e);
    }
    setComposer(false);
    alert('Đăng tin bài bán đồ thành công!');
  };

  const handleStartChat = (seller) => {
    if (onOpenChat) onOpenChat(seller);
    else alert(`Đã kết nối cuộc trò chuyện với ${resolveUserObject(seller).name}!`);
  };

  // Xác nhận mua / Trả giá + ĐỒNG BỘ VÀO LOCALSTORAGE
  const handleConfirmPurchase = (item, location, offerPrice, note) => {
    const finalPrice = offerPrice ? Number(offerPrice) : item.price;
    const newOrd = {
      orderId: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
      itemTitle: item.title,
      price: finalPrice,
      date: new Date().toLocaleDateString('vi-VN'),
      status: 'Đã giao dịch',
      seller: {
        name: typeof item.author === 'string' ? item.author : item.author?.name || 'Người bán UTC2',
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

    const nextOrders = [newOrd, ...orders];
    setOrders(nextOrders);

    // Lưu ngay vào localStorage
    try {
      localStorage.setItem('utc2_market_orders', JSON.stringify(nextOrders));
    } catch (e) {
      console.warn('Lỗi khi lưu đơn hàng vào LocalStorage:', e);
    }

    setBuyConfirmItem(null);
    setActive(null);
    alert(`🎉 Đã tạo đơn mua/trả giá thành công cho sản phẩm "${item.title}"!`);
  };

  return (
    <div className="u2-module">
      {/* HEADER TOOLBAR */}
      <div className="u2-module-toolbar">
        <div>
          <p className="u2-module-kicker">CHỢ TỐT UTC2 • {currentUserEmail}</p>
          <h1 className="u2-module-title">Chợ Đồ Cũ Sinh Viên</h1>
          <p className="u2-module-sub">Mua bán thanh lý đồ dùng, laptop, xe máy, giáo trình dễ dàng.</p>
        </div>
        <button className="u2-btn primary" type="button" onClick={() => setComposer(true)}>
          + Đăng tin ngay
        </button>
      </div>

      {/* TABS ĐIỀU HƯỚNG CẤP CAO */}
      <div style={{ display: 'flex', gap: 12, borderBottom: '2px solid #e2e8f0', marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab('all')}
          style={{ padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 'bold', borderBottom: activeTab === 'all' ? '3px solid #2563eb' : 'none', color: activeTab === 'all' ? '#2563eb' : '#64748b' }}
        >
          🛒 Tất cả rao bán
        </button>
        <button
          onClick={() => setActiveTab('my_posts')}
          style={{ padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 'bold', borderBottom: activeTab === 'my_posts' ? '3px solid #2563eb' : 'none', color: activeTab === 'my_posts' ? '#2563eb' : '#64748b' }}
        >
          📝 Tin của tôi ({items.filter(isMyItem).length})
        </button>
        <button
          onClick={() => setActiveTab('wishlist')}
          style={{ padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 'bold', borderBottom: activeTab === 'wishlist' ? '3px solid #2563eb' : 'none', color: activeTab === 'wishlist' ? '#2563eb' : '#64748b' }}
        >
          💖 Đã lưu ({favorites.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          style={{ padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 'bold', borderBottom: activeTab === 'history' ? '3px solid #2563eb' : 'none', color: activeTab === 'history' ? '#2563eb' : '#64748b' }}
        >
          📜 Lịch sử đơn hàng ({orders.length})
        </button>
      </div>

      {activeTab !== 'history' ? (
        <div className="u2-chotot-layout">
          {/* BỘ LỌC BÊN TRÁI */}
          <aside className="u2-filter-panel">
            <label className="u2-label">🔍 TÌM KIẾM TỪ KHÓA</label>
            <input className="u2-input" placeholder="Sách, Tai nghe, Xe máy..." value={q} onChange={(e) => setQ(e.target.value)} />

            <label className="u2-label" style={{ marginTop: '16px' }}>📂 DANH MỤC SẢN PHẨM</label>
            <div className="u2-chip-wrap">
              {MARKET_CATEGORIES.map((c) => (
                <button key={c.id} type="button" className={`u2-reason-chip ${category === c.id ? 'active' : ''}`} onClick={() => setCategory(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>

            <label className="u2-label" style={{ marginTop: '16px' }}>✨ TÌNH TRẠNG MÓN ĐỒ</label>
            <select className="u2-input" value={condition} onChange={(e) => setCondition(e.target.value)}>
              <option value="all">Tất cả tình trạng</option>
              {CONDITIONS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>

            <label className="u2-label" style={{ marginTop: '16px' }}>⚡ SẮP XẾP THEO</label>
            <select className="u2-input" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="newest">Mới đăng nhất</option>
              <option value="price_asc">Giá từ thấp đến cao</option>
              <option value="price_desc">Giá từ cao đến thấp</option>
            </select>

            <label className="u2-label" style={{ marginTop: '16px' }}>💰 GIÁ TỐI ĐA: {formatVnd(maxPrice)}</label>
            <input type="range" min={10000} max={100000000} step={500000} value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))} style={{ width: '100%' }} />
            <p className="u2-price-words">{numberToVietnameseWords(maxPrice)}</p>
          </aside>

          {/* DANH SÁCH BÀI ĐĂNG */}
          <section className="u2-listing-grid">
            {filtered.length === 0 && (
              <p style={{ color: '#64748b', padding: '20px' }}>Không tìm thấy sản phẩm nào phù hợp với bộ lọc.</p>
            )}
            {filtered.map((it) => {
              const mine = isMyItem(it);
              const isFav = favorites.includes(it.id);

              return (
                <div key={it.id} style={{ position: 'relative', background: '#fff', border: mine ? '2px solid #2563eb' : '1px solid #e2e8f0', borderRadius: 12, padding: 12, cursor: 'pointer' }} onClick={() => handleOpenDetail(it)}>
                  <button
                    type="button"
                    onClick={(e) => toggleFavorite(it.id, e)}
                    style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}
                  >
                    {isFav ? '💖' : '🤍'}
                  </button>

                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    {mine && <span style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: 10, fontWeight: 'bold', padding: '2px 6px', borderRadius: 4 }}>Chính chủ</span>}
                    {it.status === 'sold' ? (
                      <span style={{ background: '#fef2f2', color: '#dc2626', fontSize: 10, fontWeight: 'bold', padding: '2px 6px', borderRadius: 4 }}>Đã bán</span>
                    ) : it.status === 'reserved' ? (
                      <span style={{ background: '#fef3c7', color: '#d97706', fontSize: 10, fontWeight: 'bold', padding: '2px 6px', borderRadius: 4 }}>Đã cọc</span>
                    ) : (
                      <span style={{ background: '#dcfce7', color: '#15803d', fontSize: 10, fontWeight: 'bold', padding: '2px 6px', borderRadius: 4 }}>Đang bán</span>
                    )}
                  </div>

                  <div style={{ width: '100%', height: 160, background: '#f1f5f9', borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
                    {it.coverImage || it.images?.[0] ? (
                      <img src={it.coverImage || it.images?.[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 12 }}>Chưa có hình ảnh</div>
                    )}
                  </div>

                  <h3 style={{ margin: '0 0 4px 0', fontSize: 15, color: '#0f172a', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{it.title}</h3>
                  <p style={{ margin: '0 0 6px 0', color: '#dc2626', fontWeight: 'bold', fontSize: 16 }}>{formatVnd(it.price)}</p>
                  <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>👤 {typeof it.author === 'string' ? it.author : it.author?.name || 'Sinh viên UTC2'}</p>
                </div>
              );
            })}
          </section>
        </div>
      ) : (
        /* TAB LỊCH SỬ ĐƠN HÀNG */
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: 12 }}>Mã đơn</th>
                <th style={{ padding: 12 }}>Sản phẩm</th>
                <th style={{ padding: 12 }}>Giá giao dịch</th>
                <th style={{ padding: 12 }}>Ngày mua</th>
                <th style={{ padding: 12 }}>Trạng thái</th>
                <th style={{ padding: 12 }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((ord) => (
                <tr key={ord.orderId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: 12, fontWeight: 'bold' }}>{ord.orderId}</td>
                  <td style={{ padding: 12 }}>{ord.itemTitle}</td>
                  <td style={{ padding: 12, color: '#dc2626', fontWeight: 'bold' }}>{formatVnd(ord.price)}</td>
                  <td style={{ padding: 12 }}>{ord.date}</td>
                  <td style={{ padding: 12 }}><span style={{ background: '#dcfce7', color: '#15803d', padding: '4px 8px', borderRadius: 6, fontSize: 12 }}>{ord.status}</span></td>
                  <td style={{ padding: 12 }}>
                    <button
                      onClick={() => setSelectedOrder(ord)}
                      style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
                    >
                      👁️ Xem chi tiết 2 bên
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL CHI TIẾT SẢN PHẨM */}
      {active && (
        <div className="u2-report-overlay" onClick={() => setActive(null)}>
          <div className="u2-detail-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="u2-report-close" style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }} onClick={() => setActive(null)}>✕</button>

            <div className="u2-carousel">
              {selectedModalImg ? (
                <img src={selectedModalImg} alt="" className="u2-carousel-main-img" />
              ) : (
                <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Không có hình ảnh</div>
              )}

              <div className="u2-carousel-thumbs">
                {active.coverImage && (
                  <img src={active.coverImage} alt="Cover" onClick={() => setSelectedModalImg(active.coverImage)} className={`u2-thumb-img ${selectedModalImg === active.coverImage ? 'active' : ''}`} />
                )}
                {active.images?.map((img, idx) => (
                  <img key={idx} src={img} alt="" onClick={() => setSelectedModalImg(img)} className={`u2-thumb-img ${selectedModalImg === img ? 'active' : ''}`} />
                ))}
              </div>
            </div>

            <div className="u2-detail-body">
              {isMyItem(active) && (
                <div style={{ background: '#dbeafe', color: '#1d4ed8', padding: '8px 12px', borderRadius: 6, fontSize: 13, fontWeight: 'bold', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>🏷️ Tin đăng của bạn ({currentUserEmail})</span>
                  <select
                    value={active.status || 'available'}
                    onChange={(e) => handleChangeStatus(active.id, e.target.value)}
                    style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #3b82f6', background: '#fff', fontSize: 12, fontWeight: 'bold' }}
                  >
                    <option value="available">🟢 Đang bán</option>
                    <option value="reserved">🟡 Đã nhận cọc</option>
                    <option value="sold">🔴 Đã bán xong</option>
                  </select>
                </div>
              )}

              <p className="u2-listing-price" style={{ margin: 0 }}>{formatVnd(active.price)}</p>
              <p className="u2-price-words" style={{ display: 'inline-block', margin: '4px 0 12px 0' }}>👉 {numberToVietnameseWords(active.price)}</p>

              <h2 style={{ fontSize: '1.25rem', margin: '0 0 8px 0', color: '#0f172a' }}>{active.title}</h2>
              <p style={{ color: '#475569', lineHeight: '1.6', whiteSpace: 'pre-line', margin: 0 }}>{active.description}</p>

              <div className="u2-seller-box" onClick={() => handleOpenProfileModal(active.author)}>
                <UserChip username={typeof active.author === 'string' ? active.author : active.author?.name} onOpen={() => handleOpenProfileModal(active.author)} />
                <span className="u2-seller-link">Trang cá nhân người bán ➔</span>
              </div>

              <div className="u2-action-group">
                {isMyItem(active) ? (
                  <button type="button" className="u2-btn primary flex-1" style={{ background: '#ef4444' }} onClick={() => handleDeleteItem(active.id)}>
                    🗑️ Xóa tin đăng này
                  </button>
                ) : (
                  <>
                    <button type="button" className="u2-btn ghost flex-1" onClick={() => handleStartChat(active.author)}>💬 Nhắn tin Chợ Tốt</button>
                    <button type="button" className="u2-btn primary flex-1" onClick={() => setBuyConfirmItem(active)}>🛒 Trả giá / Mua ngay</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL HỒ SƠ */}
      {profileTarget && (
        <PassengerProfileModal user={profileTarget} currentUser={activeUserObj} onClose={() => setProfileTarget(null)} onStartChat={handleStartChat} />
      )}

      {/* MODAL XEM CHI TIẾT ĐƠN HÀNG 2 BÊN */}
      {selectedOrder && (
        <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}

      {/* MODAL ĐẶT MUA / TRẢ GIÁ */}
      {buyConfirmItem && (
        <BuyModal item={buyConfirmItem} currentUser={activeUserObj} onClose={() => setBuyConfirmItem(null)} onConfirm={handleConfirmPurchase} />
      )}

      {/* MODAL ĐĂNG TIN MỚI */}
      {composer && (
        <CreateListing currentUser={activeUserObj} onOpenProfile={handleOpenProfileModal} onClose={() => setComposer(false)} onSubmit={handleCreateSubmit} />
      )}
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS MARKET
// ============================================================================

function OrderDetailModal({ order, onClose }) {
  return (
    <div className="u2-report-overlay" onClick={onClose}>
      <div className="u2-report-ticket" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
        <div className="u2-report-head">
          <h3 style={{ color: '#ffffff', margin: 0, fontSize: '1.1rem' }}>📄 Chi tiết giao dịch #{order.orderId}</h3>
          <button type="button" className="u2-report-close" onClick={onClose}>✕</button>
        </div>

        <div className="u2-report-body">
          <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <p style={{ margin: '4px 0' }}><strong>Sản phẩm:</strong> {order.itemTitle}</p>
            <p style={{ margin: '4px 0' }}><strong>Giá chốt:</strong> <span style={{ color: '#dc2626', fontWeight: 'bold' }}>{formatVnd(order.price)}</span></p>
            <p style={{ margin: '4px 0' }}><strong>Ngày tạo:</strong> {order.date}</p>
          </div>

          <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px', marginTop: '12px' }}>
            <h4 style={{ margin: '0 0 6px 0', color: '#2563eb' }}>👤 BÊN BÁN</h4>
            <p style={{ margin: '2px 0', fontSize: 13 }}>Họ tên: {order.seller.name}</p>
            <p style={{ margin: '2px 0', fontSize: 13 }}>Email: {order.seller.email}</p>
            <p style={{ margin: '2px 0', fontSize: 13 }}>SĐT/Zalo: {order.seller.phone}</p>
          </div>

          <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px', marginTop: '12px' }}>
            <h4 style={{ margin: '0 0 6px 0', color: '#16a34a' }}>🛍️ BÊN MUA</h4>
            <p style={{ margin: '2px 0', fontSize: 13 }}>Họ tên: {order.buyer.name}</p>
            <p style={{ margin: '2px 0', fontSize: 13 }}>Email: {order.buyer.email}</p>
            <p style={{ margin: '2px 0', fontSize: 13 }}>SĐT/Zalo: {order.buyer.phone}</p>
            <p style={{ margin: '2px 0', fontSize: 13 }}>Địa điểm giao dịch: {order.buyer.address}</p>
          </div>
        </div>

        <div className="u2-report-footer">
          <button className="u2-btn primary" type="button" onClick={onClose} style={{ width: '100%' }}>Đóng</button>
        </div>
      </div>
    </div>
  );
}

function PassengerProfileModal({ user, currentUser, onClose, onStartChat }) {
  const initialLetter = (user.name || 'N').charAt(0).toUpperCase();
  const me = resolveUserObject(currentUser);
  const isOwnProfile = currentUser && (user.email === me.email || user.username === me.username);

  return (
    <div className="u2-report-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="u2-report-ticket" style={{ maxWidth: '440px', background: '#fff9ef', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ background: '#0b1329', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#f59e0b', fontWeight: 800, fontSize: '0.85rem', letterSpacing: '2px' }}>HỒ SƠ THÀNH VIÊN</span>
          <button type="button" className="u2-report-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ background: '#fffdf0', padding: '24px 20px', display: 'flex', alignItems: 'center', gap: '16px', borderBottom: '1px solid #fef08a' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#1e293b', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', fontWeight: 700 }}>
            {initialLetter}
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{user.name}</h3>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>@{user.username}</p>
          </div>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', background: '#fffdf0' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>EMAIL</label>
            <p style={{ margin: '2px 0 0 0', fontWeight: 600, color: '#0f172a' }}>{user.email || '—'}</p>
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>SỐ ĐIỆN THOẠI</label>
            <p style={{ margin: '2px 0 0 0', fontWeight: 600, color: '#0f172a' }}>{user.phone || '—'}</p>
          </div>
        </div>

        <div style={{ padding: '16px 20px', background: '#fffdf0', borderTop: '1px solid #fef08a' }}>
          {isOwnProfile ? (
            <button type="button" className="u2-btn primary" style={{ width: '100%', background: '#f59e0b', color: '#0f172a' }} onClick={() => alert('Chỉnh sửa thông tin')}>
              Chỉnh sửa hồ sơ
            </button>
          ) : (
            <button type="button" className="u2-btn primary" style={{ width: '100%', background: '#0f172a' }} onClick={() => { onClose(); if (onStartChat) onStartChat(user); }}>
              💬 Nhắn tin qua Chợ Tốt
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BuyModal({ item, currentUser, onClose, onConfirm }) {
  const [location, setLocation] = useState('Cổng chính UTC2');
  const [offerPrice, setOfferPrice] = useState(item.price);
  const [note, setNote] = useState('');

  return (
    <div className="u2-report-overlay" onClick={onClose}>
      <div className="u2-report-ticket" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
        <div className="u2-report-head">
          <h3 style={{ color: '#ffffff', margin: 0, fontSize: '1.1rem' }}>Đặt mua / Trả giá sản phẩm</h3>
          <button type="button" className="u2-report-close" onClick={onClose}>✕</button>
        </div>

        <div className="u2-report-body">
          <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', color: '#0f172a' }}>{item.title}</h4>
            <p style={{ margin: 0, fontWeight: '700', color: '#dc2626' }}>Giá niêm yết: {formatVnd(item.price)}</p>
          </div>

          <div>
            <label className="u2-label">GIÁ BẠN MUỐN ĐỀ XUẤT (VNĐ)</label>
            <input className="u2-input" type="number" value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} />
            <p className="u2-price-words">👉 {numberToVietnameseWords(offerPrice)}</p>
          </div>

          <div>
            <label className="u2-label">ĐỊA ĐIỂM HẸN GIAO DỊCH TẠI UTC2</label>
            <select className="u2-input" value={location} onChange={(e) => setLocation(e.target.value)}>
              <option value="Cổng chính UTC2">Cổng chính UTC2</option>
              <option value="Sân nhà xe sinh viên">Sân nhà xe sinh viên</option>
              <option value="Tòa A - Sảnh trung tâm">Tòa A - Sảnh trung tâm</option>
              <option value="Thư viện trường">Thư viện trường</option>
              <option value="Căn tin sinh viên">Căn tin sinh viên</option>
            </select>
          </div>

          <div>
            <label className="u2-label">GHI CHÚ GỬI NGƯỜI BÁN</label>
            <textarea className="u2-input" rows={2} placeholder="Nhắn thời gian bạn rảnh hoặc thương lượng..." value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <div className="u2-report-footer">
          <button className="u2-btn ghost" type="button" onClick={onClose}>Hủy</button>
          <button className="u2-btn primary" type="button" onClick={() => onConfirm(item, location, offerPrice, note)}>
            Xác nhận gửi yêu cầu
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateListing({ currentUser, onOpenProfile, onClose, onSubmit }) {
  const userObj = resolveUserObject(currentUser);

  const [form, setForm] = useState({
    title: '', price: 100000, category: 'Sách & Giáo trình', condition: 'used', description: '', coverImage: '', images: []
  });
  const [loading, setLoading] = useState(false);

  const onCoverFile = async (file) => {
    if (!file) return;
    setLoading(true);
    const compressed = await compressImage(file, 800, 0.7);
    setForm((f) => ({ ...f, coverImage: compressed }));
    setLoading(false);
  };

  const onDetailFiles = async (files) => {
    if (!files || files.length === 0) return;
    setLoading(true);
    const fileList = Array.from(files);
    const compressedList = await Promise.all(fileList.map((f) => compressImage(f, 800, 0.7)));
    setForm((f) => ({ ...f, images: [...f.images, ...compressedList] }));
    setLoading(false);
  };

  const handleSubmit = () => {
    if (!form.title.trim()) return alert('Vui lòng nhập Tiêu đề tin đăng!');
    if (!form.price || form.price <= 0) return alert('Vui lòng nhập Giá bán hợp lệ!');

    onSubmit({
      ...form,
      authorEmail: userObj.email,
      author: userObj,
    });
  };

  return (
    <div className="u2-report-overlay" onClick={onClose}>
      <div className="u2-report-ticket" onClick={(e) => e.stopPropagation()}>
        <div className="u2-report-head">
          <h3 style={{ color: '#ffffff', margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>+ Đăng tin bán đồ Chợ Tốt</h3>
          <button type="button" className="u2-report-close" onClick={onClose}>✕</button>
        </div>

        <div className="u2-report-body">
          <div>
            <label className="u2-label">TÀI KHOẢN ĐĂNG BÁN (*)</label>
            <div className="u2-seller-box" onClick={() => onOpenProfile && onOpenProfile(currentUser)} style={{ marginTop: 0 }}>
              <UserChip username={userObj.name} onOpen={() => onOpenProfile && onOpenProfile(currentUser)} />
              <span className="u2-seller-link">🏷️ {userObj.email}</span>
            </div>
          </div>

          <div>
            <label className="u2-label">TIÊU ĐỀ TIN RỜI BÁN (*)</label>
            <input className="u2-input" placeholder="VD: Laptop Dell Core i5 còn mới 95%..." value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>

          <div>
            <label className="u2-label">GIÁ BÁN (VNĐ) (*)</label>
            <input className="u2-input" type="number" step="10000" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
            <p className="u2-price-words">👉 Bằng chữ: {numberToVietnameseWords(form.price)}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label className="u2-label">DANH MỤC</label>
              <select className="u2-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {MARKET_CATEGORIES.filter((c) => c.id !== 'all').map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="u2-label">TÌNH TRẠNG</label>
              <select className="u2-input" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
                {CONDITIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="u2-label">MÔ TẢ CHI TIẾT SẢN PHẨM</label>
            <textarea className="u2-input" rows={3} placeholder="Mô tả phụ kiện đi kèm, lý do bán, tình trạng pin..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          <div className="u2-upload-box">
            <label className="u2-label">🖼 ẢNH BÌA CHÍNH</label>
            <input className="u2-input" type="file" accept="image/*" onChange={(e) => onCoverFile(e.target.files?.[0])} />
            {form.coverImage && <img src={form.coverImage} alt="" style={{ width: 80, height: 60, marginTop: 8, borderRadius: 6, objectFit: 'cover' }} />}
          </div>

          <div className="u2-upload-box">
            <label className="u2-label">📸 CÁC ẢNH CHI TIẾT SẢN PHẨM</label>
            <input className="u2-input" type="file" accept="image/*" multiple onChange={(e) => onDetailFiles(e.target.files)} />
          </div>
        </div>

        <div className="u2-report-footer">
          <button className="u2-btn ghost" type="button" onClick={onClose}>Huỷ</button>
          <button className="u2-btn primary" type="button" disabled={loading} onClick={handleSubmit}>
            {loading ? 'Đang xử lý...' : 'Đăng tin ngay'}
          </button>
        </div>
      </div>
    </div>
  );
}