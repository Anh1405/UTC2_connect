import React, { useMemo, useState } from 'react';
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

// Chuẩn hóa đối tượng người dùng
const resolveUserObject = (user) => {
  if (!user) {
    return {
      name: 'Nguyễn Lê Quốc Anh',
      username: 'quocanh_utc2',
      email: '6551071003@st.utc2.edu.vn',
      phone: '0987654321',
      department: 'CNTT',
      academicYear: 'K63',
    };
  }
  if (typeof user === 'string') {
    return {
      name: user,
      username: user,
      email: user.includes('@') ? user : `${user.toLowerCase().replace(/\s+/g, '')}@st.utc2.edu.vn`,
      phone: '0987654321',
      department: 'UTC2',
      academicYear: 'Sinh viên',
    };
  }
  return {
    name: user.name || user.displayName || user.username || 'Sinh viên UTC2',
    username: user.username || user.name || 'user_utc2',
    email: user.email || `${user.username || 'user'}@st.utc2.edu.vn`,
    phone: user.phone || '0987654321',
    department: user.department || 'UTC2',
    academicYear: user.academicYear || 'Sinh viên',
  };
};

const INITIAL_RENTAL_CONTRACTS = [
  {
    contractId: 'CTR-1029',
    houseTitle: 'Phòng trọ cao cấp gần Cổng chính UTC2',
    monthlyPrice: 2500000,
    startDate: '01/10/2026',
    status: 'Đã cọc / Đang thuê',
    landlord: {
      name: 'Cô Lan Chủ Trọ',
      email: 'chutro_lan@gmail.com',
      phone: '0938123456',
    },
    tenant: {
      name: 'Bạn (Người thuê)',
      email: 'user_current@st.utc2.edu.vn',
      phone: '0912999888',
      mssv: '705105001',
    },
  },
];

// ============================================================================
// MAIN COMPONENT HOUSING MODULE
// ============================================================================

export default function HousingModule({ userData, currentUser, onOpenProfile, onOpenChat }) {
  const activeUserObj = resolveUserObject(userData || currentUser);
  const currentUserEmail = activeUserObj.email;

  const [activeTab, setActiveTab] = useState('all'); // all | my_houses | history

  // Nạp danh sách phòng trọ từ LocalStorage
  const [items, setItems] = useState(() => {
    try {
      const loaded = loadHousing();
      return loaded && loaded.length > 0 ? loaded : [];
    } catch {
      return [];
    }
  });

  // Nạp danh sách Lịch hẹn / Hợp đồng từ LocalStorage
  const [contracts, setContracts] = useState(() => {
    try {
      const saved = localStorage.getItem('utc2_housing_contracts');
      return saved ? JSON.parse(saved) : INITIAL_RENTAL_CONTRACTS;
    } catch {
      return INITIAL_RENTAL_CONTRACTS;
    }
  });

  const [selectedContract, setSelectedContract] = useState(null);

  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [maxPrice, setMaxPrice] = useState(15000000);
  const [maxKm, setMaxKm] = useState(8);
  const [amenity, setAmenity] = useState([]);
  const [view, setView] = useState('grid');

  const [active, setActive] = useState(null);
  const [composer, setComposer] = useState(false);
  const [profileTarget, setProfileTarget] = useState(null);
  const [bookingItem, setBookingItem] = useState(null);

  // Kiểm tra bài đăng chính chủ
  const isMyHouse = (item) => {
    if (!item) return false;
    const authorEmail = item.authorEmail || (typeof item.author === 'object' ? item.author?.email : null);
    if (authorEmail && authorEmail === currentUserEmail) return true;

    const authorName = typeof item.author === 'string' ? item.author : item.author?.name;
    return authorName === activeUserObj.name || authorName === activeUserObj.username;
  };

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (activeTab === 'my_houses' && !isMyHouse(it)) return false;
      if (type !== 'all' && it.type !== type) return false;
      if (it.price > maxPrice) return false;
      if (it.distanceKm > maxKm) return false;
      if (amenity.length && !amenity.every((a) => it.amenities?.includes(a))) return false;
      if (q.trim() && !`${it.title} ${it.address} ${it.description}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [items, type, maxPrice, maxKm, amenity, q, activeTab, currentUserEmail]);

  const handleOpenProfileModal = (user) => {
    if (onOpenProfile) onOpenProfile(user);
    setProfileTarget(resolveUserObject(user));
  };

  const handleDeleteHouse = (houseId) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa tin phòng trọ này?')) {
      const nextItems = items.filter((h) => h.id !== houseId);
      setItems(nextItems);
      try {
        if (typeof saveHousing === 'function') saveHousing(nextItems);
      } catch (e) {
        console.warn('Lỗi lưu storage:', e);
      }
      if (active?.id === houseId) setActive(null);
      alert('Đã xóa bài đăng phòng trọ thành công!');
    }
  };

  const handleStartChat = (landlord) => {
    if (onOpenChat) {
      onOpenChat(landlord);
    } else {
      const u = resolveUserObject(landlord);
      alert(`Đã kết nối trò chuyện với ${u.name}!`);
    }
  };

  const handleCreateSubmit = (payload) => {
    const newItem = {
      ...payload,
      id: `h_${Date.now()}`,
      createdAt: Date.now(),
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
      if (typeof saveHousing === 'function') saveHousing(nextItems);
    } catch (e) {
      console.warn('Lưu LocalStorage đầy:', e);
    }

    setComposer(false);
    alert('Đăng tin phòng trọ thành công!');
  };

  // Xác nhận đặt lịch xem phòng + ĐỒNG BỘ VÀO LOCALSTORAGE
  const handleConfirmBooking = (room, date, time, note) => {
    const newContract = {
      contractId: `CTR-${Math.floor(1000 + Math.random() * 9000)}`,
      houseTitle: room.title,
      monthlyPrice: room.price,
      startDate: `${date} (${time})`,
      status: 'Đã hẹn xem phòng',
      landlord: {
        name: typeof room.author === 'string' ? room.author : room.author?.name || 'Chủ trọ UTC2',
        email: room.authorEmail || room.author?.email || 'chutro@gmail.com',
        phone: room.contact?.phone || '0900000000',
      },
      tenant: {
        name: activeUserObj.name,
        email: currentUserEmail,
        phone: activeUserObj.phone,
        mssv: note || 'Sinh viên UTC2',
      },
    };

    const nextContracts = [newContract, ...contracts];
    setContracts(nextContracts);

    // Lưu vào LocalStorage ngay lập tức
    try {
      localStorage.setItem('utc2_housing_contracts', JSON.stringify(nextContracts));
    } catch (e) {
      console.warn('Lỗi khi lưu hợp đồng vào LocalStorage:', e);
    }

    setBookingItem(null);
    setActive(null);
    alert(`🎉 Bạn đã gửi yêu cầu hẹn xem phòng "${room.title}" thành công!`);
  };

  return (
    <div className="u2-module">
      <div className="u2-module-toolbar">
        <div>
          <p className="u2-module-kicker">GA NHÀ Ở SINH VIÊN • {currentUserEmail}</p>
          <h1 className="u2-module-title">Tìm phòng trọ</h1>
          <p className="u2-module-sub">Khoảng cách tính từ {UTC2_CAMPUS.name}</p>
        </div>
        <button className="u2-btn primary" type="button" onClick={() => setComposer(true)}>
          + Đăng tin phòng
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, borderBottom: '2px solid #e2e8f0', marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab('all')}
          style={{ padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 'bold', borderBottom: activeTab === 'all' ? '3px solid #059669' : 'none', color: activeTab === 'all' ? '#059669' : '#64748b' }}
        >
          Tất cả phòng trọ
        </button>
        <button
          onClick={() => setActiveTab('my_houses')}
          style={{ padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 'bold', borderBottom: activeTab === 'my_houses' ? '3px solid #059669' : 'none', color: activeTab === 'my_houses' ? '#059669' : '#64748b' }}
        >
          Tin của tôi ({items.filter(isMyHouse).length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          style={{ padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 'bold', borderBottom: activeTab === 'history' ? '3px solid #059669' : 'none', color: activeTab === 'history' ? '#059669' : '#64748b' }}
        >
          📋 Lịch sử thuê & Hợp đồng ({contracts.length})
        </button>
      </div>

      {activeTab !== 'history' ? (
        <div className="u2-chotot-layout">
          <HousingFilter
            q={q} setQ={setQ}
            type={type} setType={setType}
            maxPrice={maxPrice} setMaxPrice={setMaxPrice}
            maxKm={maxKm} setMaxKm={setMaxKm}
            amenity={amenity} setAmenity={setAmenity}
            view={view} setView={setView}
          />

          <section className={`u2-listing-grid ${view}`}>
            {filtered.length === 0 && (
              <p style={{ padding: '20px', color: '#64748b' }}>Không tìm thấy phòng trọ phù hợp bộ lọc.</p>
            )}
            {filtered.map((it) => {
              const mine = isMyHouse(it);
              return (
                <div key={it.id} style={{ position: 'relative' }}>
                  {mine && (
                    <span style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, background: '#059669', color: '#fff', fontSize: 11, fontWeight: 'bold', padding: '3px 8px', borderRadius: 6 }}>
                      🏷️ Bài đăng của bạn
                    </span>
                  )}
                  <RoomCard item={it} onClick={() => setActive(it)} />
                </div>
              );
            })}
          </section>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: 12 }}>Mã HĐ / Lịch xem</th>
                <th style={{ padding: 12 }}>Tên phòng trọ</th>
                <th style={{ padding: 12 }}>Giá thuê</th>
                <th style={{ padding: 12 }}>Ngày hẹn / Bắt đầu</th>
                <th style={{ padding: 12 }}>Trạng thái</th>
                <th style={{ padding: 12 }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((ctr) => (
                <tr key={ctr.contractId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: 12, fontWeight: 'bold' }}>{ctr.contractId}</td>
                  <td style={{ padding: 12 }}>{ctr.houseTitle}</td>
                  <td style={{ padding: 12, color: '#059669', fontWeight: 'bold' }}>{formatVnd(ctr.monthlyPrice)}/tháng</td>
                  <td style={{ padding: 12 }}>{ctr.startDate}</td>
                  <td style={{ padding: 12 }}><span style={{ background: '#d1fae5', color: '#047857', padding: '4px 8px', borderRadius: 6, fontSize: 12 }}>{ctr.status}</span></td>
                  <td style={{ padding: 12 }}>
                    <button
                      onClick={() => setSelectedContract(ctr)}
                      style={{ background: '#059669', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
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

      {active && (
        <HousingDetail
          item={active}
          isMine={isMyHouse(active)}
          currentUserEmail={currentUserEmail}
          onClose={() => setActive(null)}
          onDelete={() => handleDeleteHouse(active.id)}
          onOpenProfile={handleOpenProfileModal}
          onStartChat={handleStartChat}
          onBookView={(room) => setBookingItem(room)}
        />
      )}

      {profileTarget && (
        <ProfileModal
          user={profileTarget}
          currentUser={activeUserObj}
          onClose={() => setProfileTarget(null)}
          onStartChat={handleStartChat}
        />
      )}

      {selectedContract && (
        <ContractDetailModal contract={selectedContract} onClose={() => setSelectedContract(null)} />
      )}

      {bookingItem && (
        <BookingModal
          item={bookingItem}
          currentUser={activeUserObj}
          onClose={() => setBookingItem(null)}
          onConfirm={(date, time, note) => handleConfirmBooking(bookingItem, date, time, note)}
        />
      )}

      {composer && (
        <ListingComposer
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
// MODAL & SUB-COMPONENTS
// ============================================================================

function HousingDetail({ item, isMine, currentUserEmail, onClose, onDelete, onOpenProfile, onStartChat, onBookView }) {
  const [selectedImg, setSelectedImg] = useState(item.coverImage || item.images?.[0] || '');
  const allImages = useMemo(() => {
    const list = [];
    if (item.coverImage) list.push(item.coverImage);
    if (item.images?.length) list.push(...item.images);
    return Array.from(new Set(list));
  }, [item]);

  const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${(item.lng || UTC2_CAMPUS.lng) - 0.01}%2C${(item.lat || UTC2_CAMPUS.lat) - 0.01}%2C${(item.lng || UTC2_CAMPUS.lng) + 0.01}%2C${(item.lat || UTC2_CAMPUS.lat) + 0.01}&layer=mapnik&marker=${item.lat || UTC2_CAMPUS.lat}%2C${item.lng || UTC2_CAMPUS.lng}`;

  return (
    <div className="u2-report-overlay" onClick={onClose}>
      <div className="u2-detail-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="u2-report-close" style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }} onClick={onClose}>✕</button>

        <div className="u2-carousel">
          <div className="u2-carousel-main-wrapper">
            {selectedImg ? (
              <img src={selectedImg} alt="" className="u2-carousel-main-img" />
            ) : (
              <div style={{ color: '#94a3b8' }}>Chưa có hình ảnh</div>
            )}
          </div>

          {allImages.length > 1 && (
            <div className="u2-carousel-thumbs">
              {allImages.map((img, idx) => (
                <img
                  key={idx}
                  src={img}
                  alt=""
                  onClick={() => setSelectedImg(img)}
                  className={`u2-thumb-img ${selectedImg === img ? 'active' : ''}`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="u2-report-body">
          {isMine && (
            <div style={{ background: '#d1fae5', color: '#047857', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 'bold', marginBottom: 10 }}>
              🏷️ Bài đăng phòng trọ của bạn ({currentUserEmail})
            </div>
          )}

          <div>
            <p className="u2-listing-price" style={{ margin: 0 }}>{formatVnd(item.price)}/tháng</p>
            <p className="u2-price-words" style={{ display: 'inline-block', margin: '4px 0 8px 0' }}>
              👉 {numberToVietnameseWords(item.price)}
            </p>
          </div>

          <h2 style={{ fontSize: '1.25rem', margin: 0, color: '#0f172a' }}>{item.title}</h2>
          <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
            📍 {item.address} · 🚀 {item.distanceKm} km tới UTC2 · 📐 {item.area}m²
          </p>

          <p style={{ color: '#334155', lineHeight: '1.6', whiteSpace: 'pre-line', margin: 0 }}>{item.description}</p>

          <div>
            <label className="u2-label">TIỆN ÍCH ĐÃ CÓ</label>
            <div className="u2-chip-wrap" style={{ marginTop: '6px' }}>
              {item.amenities?.map((a) => {
                const meta = AMENITIES.find((x) => x.id === a);
                return <span key={a} className="u2-reason-chip">{meta?.label || a}</span>;
              })}
            </div>
          </div>

          <div>
            <label className="u2-label">VỊ TRÍ TRÊN BẢN ĐỒ</label>
            <iframe title="map" className="u2-map" src={mapSrc} />
          </div>

          <div
            className="u2-seller-box"
            onClick={() => onOpenProfile && onOpenProfile(item.author)}
            title="Bấm xem hồ sơ chủ trọ"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserChip username={typeof item.author === 'string' ? item.author : item.author?.name} onOpen={() => onOpenProfile(item.author)} />
            </div>
            <span className="u2-seller-link">Trang cá nhân chủ trọ ➔</span>
          </div>

          <div className="u2-action-group">
            {isMine ? (
              <button
                type="button"
                className="u2-btn primary flex-1"
                style={{ background: '#ef4444' }}
                onClick={onDelete}
              >
                🗑️ Xóa tin phòng trọ của tôi
              </button>
            ) : (
              <>
                <button type="button" className="u2-btn ghost" onClick={() => onStartChat(item.author)}>
                  💬 Nhắn tin
                </button>
                {item.contact?.phone && (
                  <a className="u2-btn ghost" href={`tel:${item.contact.phone}`} style={{ color: '#0284c7', borderColor: '#38bdf8' }}>
                    📞 Gọi
                  </a>
                )}
                <button type="button" className="u2-btn primary" onClick={() => onBookView(item)}>
                  🔑 Đặt lịch xem
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileModal({ user, currentUser, onClose, onStartChat }) {
  const initialLetter = (user.name || 'C').charAt(0).toUpperCase();
  const me = resolveUserObject(currentUser);

  const isOwnProfile = currentUser && (
    (user.username && me.username && user.username === me.username) ||
    (user.email && me.email && user.email === me.email)
  );

  return (
    <div className="u2-report-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="u2-report-ticket" style={{ maxWidth: '440px', background: '#fff9ef', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ background: '#0b1329', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#f59e0b', fontWeight: 800, fontSize: '0.85rem', letterSpacing: '2px' }}>
            HỒ SƠ BÀI ĐĂNG
          </span>
          <button type="button" className="u2-report-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ background: '#fffdf0', padding: '24px 20px', display: 'flex', alignItems: 'center', gap: '16px', borderBottom: '1px solid #fef08a' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#1e293b', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', fontWeight: 700, position: 'relative' }}>
            {initialLetter}
            <span style={{ position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: '50%', background: '#10b981', border: '2px solid #1e293b' }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{user.name}</h3>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>@{user.username}</p>
          </div>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', background: '#fffdf0' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', display: 'block' }}>EMAIL</label>
            <p style={{ margin: '2px 0 0 0', fontWeight: 600, color: '#0f172a' }}>{user.email || '—'}</p>
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', display: 'block' }}>SỐ ĐIỆN THOẠI</label>
            <p style={{ margin: '2px 0 0 0', fontWeight: 600, color: '#0f172a' }}>{user.phone || '—'}</p>
          </div>
        </div>

        <div style={{ padding: '16px 20px', background: '#fffdf0', borderTop: '1px solid #fef08a' }}>
          {isOwnProfile ? (
            <button
              type="button"
              className="u2-btn primary"
              style={{ width: '100%', background: '#f59e0b', color: '#0f172a', fontWeight: 700 }}
              onClick={() => alert('Đang mở trang cá nhân!')}
            >
              Chỉnh sửa hồ sơ
            </button>
          ) : (
            <button
              type="button"
              className="u2-btn primary"
              style={{ width: '100%', background: '#0f172a', color: '#ffffff', fontWeight: 700 }}
              onClick={() => {
                onClose();
                if (onStartChat) onStartChat(user);
              }}
            >
              💬 Nhắn tin với người này
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ContractDetailModal({ contract, onClose }) {
  return (
    <div className="u2-report-overlay" onClick={onClose}>
      <div className="u2-report-ticket" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
        <div className="u2-report-head">
          <h3 style={{ color: '#ffffff', margin: 0, fontSize: '1.1rem' }}>📄 Thỏa thuận thuê trọ #{contract.contractId}</h3>
          <button type="button" className="u2-report-close" onClick={onClose}>✕</button>
        </div>

        <div className="u2-report-body">
          <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <p style={{ margin: '4px 0' }}><strong>Phòng trọ:</strong> {contract.houseTitle}</p>
            <p style={{ margin: '4px 0' }}><strong>Giá thuê:</strong> <span style={{ color: '#059669', fontWeight: 'bold' }}>{formatVnd(contract.monthlyPrice)}/tháng</span></p>
            <p style={{ margin: '4px 0' }}><strong>Ngày hẹn/Bắt đầu:</strong> {contract.startDate}</p>
            <p style={{ margin: '4px 0' }}><strong>Trạng thái:</strong> <span style={{ color: '#047857', fontWeight: 'bold' }}>{contract.status}</span></p>
          </div>

          <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px', marginTop: '12px' }}>
            <h4 style={{ margin: '0 0 6px 0', color: '#2563eb' }}>🏠 BÊN CHO THUÊ (Chủ nhà)</h4>
            <p style={{ margin: '2px 0', fontSize: 13 }}>Họ tên: {contract.landlord.name}</p>
            <p style={{ margin: '2px 0', fontSize: 13 }}>Email: {contract.landlord.email}</p>
            <p style={{ margin: '2px 0', fontSize: 13 }}>SĐT/Zalo: {contract.landlord.phone}</p>
          </div>

          <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px', marginTop: '12px' }}>
            <h4 style={{ margin: '0 0 6px 0', color: '#059669' }}>👤 BÊN THUÊ (Sinh viên)</h4>
            <p style={{ margin: '2px 0', fontSize: 13 }}>Họ tên: {contract.tenant.name}</p>
            <p style={{ margin: '2px 0', fontSize: 13 }}>Email: {contract.tenant.email}</p>
            <p style={{ margin: '2px 0', fontSize: 13 }}>SĐT/Ghi chú: {contract.tenant.phone}</p>
          </div>
        </div>

        <div className="u2-report-footer">
          <button className="u2-btn primary" type="button" onClick={onClose} style={{ width: '100%', background: '#059669' }}>Đóng</button>
        </div>
      </div>
    </div>
  );
}

function BookingModal({ item, currentUser, onClose, onConfirm }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [note, setNote] = useState('');
  const userObj = resolveUserObject(currentUser);

  return (
    <div className="u2-report-overlay" onClick={onClose}>
      <div className="u2-report-ticket" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
        <div className="u2-report-head">
          <h3 style={{ color: '#ffffff', margin: 0, fontSize: '1.1rem' }}>Đặt lịch hẹn xem phòng trọ</h3>
          <button type="button" className="u2-report-close" onClick={onClose}>✕</button>
        </div>

        <div className="u2-report-body">
          <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 4px 0', color: '#0f172a' }}>{item.title}</h4>
            <p style={{ margin: 0, fontWeight: 700, color: '#d97706' }}>{formatVnd(item.price)}/tháng</p>
          </div>

          <div>
            <label className="u2-label">NGƯỜI ĐẶT LỊCH</label>
            <input className="u2-input" value={userObj.name} disabled style={{ background: '#f1f5f9' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label className="u2-label">NGÀY XEM (*)</label>
              <input className="u2-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="u2-label">GIỜ XEM (*)</label>
              <input className="u2-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="u2-label">GHI CHÚ DÀNH CHO CHỦ TRỌ</label>
            <textarea className="u2-input" rows={2} placeholder="VD: Em qua cùng bạn..." value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <div className="u2-report-footer">
          <button className="u2-btn ghost" type="button" onClick={onClose}>Huỷ</button>
          <button className="u2-btn primary" type="button" disabled={!date} onClick={() => onConfirm(date, time, note)}>Gửi lịch hẹn</button>
        </div>
      </div>
    </div>
  );
}

function ListingComposer({ currentUser, onOpenProfile, onClose, onSubmit }) {
  const userObj = resolveUserObject(currentUser);

  const [form, setForm] = useState({
    title: '', price: 2500000, area: 20, type: 'phong_tro', distanceKm: 1,
    amenities: [], address: '', description: '', contactPhone: userObj.phone || '', coverImage: '', images: [],
  });

  const [loading, setLoading] = useState(false);

  const toggleAmenity = (id) => {
    setForm((f) => ({
      ...f,
      amenities: f.amenities.includes(id)
        ? f.amenities.filter((x) => x !== id)
        : [...f.amenities, id]
    }));
  };

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
    if (!form.price || form.price <= 0) return alert('Vui lòng nhập Giá phòng hợp lệ!');

    onSubmit({
      ...form,
      authorEmail: userObj.email,
      author: userObj,
      lat: UTC2_CAMPUS.lat + (Math.random() * 0.008 - 0.004),
      lng: UTC2_CAMPUS.lng + (Math.random() * 0.008 - 0.004),
      contact: { phone: form.contactPhone, zalo: form.contactPhone },
    });
  };

  return (
    <div className="u2-report-overlay" onClick={onClose}>
      <div className="u2-report-ticket" onClick={(e) => e.stopPropagation()}>
        <div className="u2-report-head">
          <h3 style={{ color: '#ffffff', margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Đăng tin phòng trọ</h3>
          <button type="button" className="u2-report-close" onClick={onClose}>✕</button>
        </div>

        <div className="u2-report-body">
          <div>
            <label className="u2-label">NGƯỜI ĐĂNG TIN (*)</label>
            <div className="u2-seller-box" onClick={() => onOpenProfile && onOpenProfile(currentUser)} style={{ marginTop: 0 }}>
              <UserChip username={userObj.name} onOpen={() => onOpenProfile(currentUser)} />
              <span className="u2-seller-link">🏷️ {userObj.email}</span>
            </div>
          </div>

          <div>
            <label className="u2-label">TIÊU ĐỀ BÀI ĐĂNG (*)</label>
            <input className="u2-input" placeholder="VD: Phòng trọ ban công thoáng mát gần UTC2..." value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>

          <div>
            <label className="u2-label">GIÁ THUÊ TỪNG THÁNG (VNĐ) (*)</label>
            <input className="u2-input" type="number" step="100000" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
            <p className="u2-price-words">👉 Bằng chữ: {numberToVietnameseWords(form.price)}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label className="u2-label">LOẠI PHÒNG TRỌ</label>
              <select className="u2-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {ROOM_TYPES.filter((t) => t.id !== 'all').map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="u2-label">DIỆN TÍCH (M²)</label>
              <input className="u2-input" type="number" value={form.area} onChange={(e) => setForm({ ...form, area: Number(e.target.value) })} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label className="u2-label">CÁCH UTC2 (KM)</label>
              <input className="u2-input" type="number" step="0.1" value={form.distanceKm} onChange={(e) => setForm({ ...form, distanceKm: Number(e.target.value) })} />
            </div>
            <div>
              <label className="u2-label">SỐ ĐIỆN THOẠI / ZALO</label>
              <input className="u2-input" placeholder="SĐT liên hệ..." value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="u2-label">ĐỊA CHỈ CHI TIẾT</label>
            <input className="u2-input" placeholder="VD: Đường 447, Phường Tăng Nhơn Phú A..." value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>

          <div>
            <label className="u2-label">MÔ TẢ CHI TIẾT PHÒNG TRỌ</label>
            <textarea className="u2-input" rows={3} placeholder="Giờ giấc tự do, điện nước tính theo giá nhà nước..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          <div>
            <label className="u2-label">TIỆN ÍCH CÓ SẴN</label>
            <div className="u2-chip-wrap">
              {AMENITIES.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`u2-reason-chip ${form.amenities.includes(a.id) ? 'active' : ''}`}
                  onClick={() => toggleAmenity(a.id)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="u2-upload-box">
            <label className="u2-label">🖼 ẢNH TIÊU ĐỀ PHÒNG TRỌ</label>
            <input className="u2-input" type="file" accept="image/*" onChange={(e) => onCoverFile(e.target.files?.[0])} />
            {form.coverImage && <img src={form.coverImage} alt="Cover" style={{ width: 80, height: 60, marginTop: 8, borderRadius: 6, objectFit: 'cover' }} />}
          </div>

          <div className="u2-upload-box">
            <label className="u2-label">📸 ẢNH PHÒNG / WC / BẾP</label>
            <input className="u2-input" type="file" accept="image/*" multiple onChange={(e) => onDetailFiles(e.target.files)} />
          </div>
        </div>

        <div className="u2-report-footer">
          <button className="u2-btn ghost" type="button" onClick={onClose}>Huỷ</button>
          <button className="u2-btn primary" type="button" disabled={loading} onClick={handleSubmit}>
            {loading ? 'Đang xử lý...' : 'Đăng tin phòng ngay'}
          </button>
        </div>
      </div>
    </div>
  );
}