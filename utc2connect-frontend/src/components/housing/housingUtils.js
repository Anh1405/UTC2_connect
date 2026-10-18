import { useCallback, useEffect, useRef, useState } from 'react';

// ============================================================================
// HẰNG SỐ DÙNG CHUNG
// Mọi "con số ma thuật" nằm ở đây để filter, form và validate luôn khớp nhau.
// ============================================================================

export const PAGE_SIZE = 12;
export const NEW_LISTING_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // tin < 3 ngày = "Mới đăng"

export const STORAGE_KEYS = Object.freeze({
  contracts: 'utc2_housing_contracts',
  favorites: 'utc2_housing_favorites',
});

export const SORT_OPTIONS = Object.freeze([
  { id: 'newest', label: 'Mới nhất' },
  { id: 'price_asc', label: 'Giá thấp đến cao' },
  { id: 'price_desc', label: 'Giá cao đến thấp' },
  { id: 'nearest', label: 'Gần UTC2 nhất' },
  { id: 'area_desc', label: 'Diện tích lớn nhất' },
]);

export const FILTER_LIMITS = Object.freeze({
  minPrice: 1000000,
  maxPrice: 30000000,
  priceStep: 200000,
  minKm: 0.5,
  maxKm: 15,
  kmStep: 0.5,
});

export const DEFAULT_FILTERS = Object.freeze({
  q: '',
  type: 'all',
  maxPrice: 15000000,
  maxKm: 8,
});

export const PRICE_PRESETS = Object.freeze([2000000, 3000000, 5000000, 8000000]);

// Giới hạn khi đăng tin. Giá và khoảng cách trần = trần của bộ lọc,
// nhờ đó tin nào đăng được thì cũng luôn tìm thấy được.
export const LISTING_LIMITS = Object.freeze({
  titleMin: 10,
  titleMax: 100,
  descriptionMax: 2000,
  priceMin: 500000,
  priceMax: FILTER_LIMITS.maxPrice,
  areaMin: 5,
  areaMax: 500,
  distanceMax: FILTER_LIMITS.maxKm,
  maxDetailImages: 8,
});

export const IMAGE_RULES = Object.freeze({
  maxFileBytes: 8 * 1024 * 1024,
  maxWidth: 800,
  quality: 0.7,
});

export const BOOKING_HOURS = Object.freeze({ min: '07:00', max: '21:00' });

export const CONTRACT_STATUS = Object.freeze({
  BOOKED: 'Đã hẹn xem phòng',
  CANCELLED: 'Đã huỷ lịch hẹn',
  ACTIVE: 'Đã cọc / Đang thuê',
});

export const INITIAL_RENTAL_CONTRACTS = Object.freeze([
  {
    contractId: 'CTR-1029',
    houseTitle: 'Phòng trọ cao cấp gần Cổng chính UTC2',
    monthlyPrice: 2500000,
    startDate: '01/10/2026',
    status: CONTRACT_STATUS.ACTIVE,
    landlord: { name: 'Cô Lan Chủ Trọ', email: 'chutro_lan@gmail.com', phone: '0938123456' },
    tenant: { name: 'Bạn (Người thuê)', email: 'user_current@st.utc2.edu.vn', phone: '0912999888', mssv: '705105001' },
  },
]);

// ============================================================================
// CHUỖI & SỐ
// ============================================================================

/** Bỏ dấu tiếng Việt + hạ chữ thường để tìm "phong tro" ra "Phòng trọ". */
export const normalizeText = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();

/** Chuyển "12,5" hoặc "12.5" thành số; rỗng/không hợp lệ trả về NaN. */
export const parseDecimal = (value) => {
  const text = String(value ?? '').trim().replace(',', '.');
  return text === '' ? NaN : Number(text);
};

/** 3.3000000000000003 -> "3.3" (tránh lỗi số thực khi hiển thị khoảng cách). */
export const formatKm = (km) => {
  const n = Number(km);
  return Number.isFinite(n) ? String(Math.round(n * 10) / 10) : '—';
};

/** Chỉ giữ chữ số, dùng cho ô nhập tiền. */
export const digitsOnly = (value, maxLength = 9) => String(value ?? '').replace(/\D/g, '').slice(0, maxLength);

export const formatThousands = (digits) => (digits ? Number(digits).toLocaleString('vi-VN') : '');

const DIGIT_WORDS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const UNIT_WORDS = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

function readThreeDigits(num, forceHundreds) {
  const hundred = Math.floor(num / 100);
  const ten = Math.floor((num % 100) / 10);
  const unit = num % 10;
  const parts = [];

  if (hundred > 0 || forceHundreds) parts.push(DIGIT_WORDS[hundred], 'trăm');

  if (ten > 1) {
    parts.push(DIGIT_WORDS[ten], 'mươi');
    if (unit === 1) parts.push('mốt');
    else if (unit === 4) parts.push('tư');
    else if (unit === 5) parts.push('lăm');
    else if (unit > 0) parts.push(DIGIT_WORDS[unit]);
  } else if (ten === 1) {
    parts.push('mười');
    if (unit === 5) parts.push('lăm');
    else if (unit > 0) parts.push(DIGIT_WORDS[unit]);
  } else if (unit > 0) {
    if (hundred > 0 || forceHundreds) parts.push('lẻ');
    parts.push(DIGIT_WORDS[unit]);
  }

  return parts.join(' ');
}

/** 2500000 -> "Hai triệu năm trăm nghìn đồng". */
export function numberToVietnameseWords(number) {
  const value = Number(number);
  if (!Number.isFinite(value) || value < 0) return '';
  if (Math.floor(value) === 0) return 'Không đồng';

  const groups = [];
  let rest = Math.floor(value);
  while (rest > 0) {
    groups.push(rest % 1000);
    rest = Math.floor(rest / 1000);
  }
  if (groups.length > UNIT_WORDS.length) return '';

  const words = [];
  for (let idx = groups.length - 1; idx >= 0; idx -= 1) {
    if (groups[idx] === 0) continue;
    const forceHundreds = idx < groups.length - 1;
    words.push(readThreeDigits(groups[idx], forceHundreds), UNIT_WORDS[idx]);
  }

  const sentence = words.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)} đồng`;
}

// ============================================================================
// NGÀY GIỜ
// ============================================================================

export function timeAgo(timestamp, now = Date.now()) {
  if (!timestamp) return '';
  const minutes = Math.floor(Math.max(0, now - timestamp) / 60000);
  if (minutes < 1) return 'Vừa đăng';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} tháng trước`;
  return `${Math.floor(months / 12)} năm trước`;
}

export const isNewListing = (item, now = Date.now()) =>
  Boolean(item?.createdAt) && now - item.createdAt < NEW_LISTING_WINDOW_MS;

const pad2 = (n) => String(n).padStart(2, '0');

/** yyyy-mm-dd theo giờ địa phương (dùng cho thuộc tính min của input date). */
export const getTodayInputValue = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export const getNowTimeValue = () => {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

export const formatDateVi = (iso) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso || '';
};

// ============================================================================
// NGƯỜI DÙNG & TÁC GIẢ TIN ĐĂNG
// ============================================================================

const GUEST_USER = Object.freeze({
  name: 'Nguyễn Lê Quốc Anh',
  username: 'quocanh_utc2',
  email: '6551071003@st.utc2.edu.vn',
  phone: '0987654321',
  department: 'CNTT',
  academicYear: 'K63',
});

/** Chuẩn hoá mọi dạng user (null | string | object) về một object duy nhất. */
export function resolveUserObject(user) {
  if (!user) return { ...GUEST_USER };
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
}

/** Tin đăng lưu author dạng string hoặc object; hàm này trả về một dạng thống nhất. */
export function getAuthor(item) {
  const raw = item?.author;
  const isObject = raw && typeof raw === 'object';
  const name = (isObject ? raw.name || raw.username : raw) || 'Chủ trọ UTC2';
  return {
    name,
    username: (isObject ? raw.username || raw.name : raw) || '',
    email: item?.authorEmail || (isObject ? raw.email : '') || '',
    phone: (isObject ? raw.phone : '') || item?.contact?.phone || '',
  };
}

/**
 * Chủ tin được xác định theo email. Chỉ khi một bên không có email
 * mới so khớp theo tên (tránh nhận nhầm hai người trùng tên).
 */
export function isOwnedBy(item, user) {
  if (!item || !user) return false;
  const author = getAuthor(item);
  if (author.email && user.email) return author.email.toLowerCase() === user.email.toLowerCase();
  return Boolean(author.name) && (author.name === user.name || author.name === user.username);
}

// ============================================================================
// DỮ LIỆU TIN ĐĂNG: ẢNH, TOẠ ĐỘ, LỌC, SẮP XẾP
// ============================================================================

/** Ảnh bìa đứng đầu, không trùng lặp, bỏ giá trị rỗng. */
export const getListingImages = (item) =>
  Array.from(new Set([item?.coverImage, ...(item?.images || [])].filter(Boolean)));

export function getCoords(item, fallback) {
  const lat = Number(item?.lat);
  const lng = Number(item?.lng);
  return {
    lat: Number.isFinite(lat) && item?.lat !== null && item?.lat !== '' ? lat : fallback.lat,
    lng: Number.isFinite(lng) && item?.lng !== null && item?.lng !== '' ? lng : fallback.lng,
  };
}

export function buildMapSrc({ lat, lng }, delta = 0.01) {
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join('%2C');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
}

export const buildMapsLink = ({ lat, lng }) => `https://www.google.com/maps?q=${lat},${lng}`;

/** Lọc thuần (pure) để dễ test: từ khoá không dấu, chia theo từ, mọi từ đều phải khớp. */
export function filterListings(items, { q = '', type = 'all', maxPrice, maxKm, amenity = [] }) {
  const tokens = normalizeText(q).split(' ').filter(Boolean);
  return items.filter((item) => {
    if (type !== 'all' && item.type !== type) return false;
    if (Number(item.price) > maxPrice) return false;
    if (Number(item.distanceKm) > maxKm) return false;
    if (amenity.length && !amenity.every((id) => item.amenities?.includes(id))) return false;
    if (tokens.length) {
      const haystack = normalizeText(`${item.title || ''} ${item.address || ''} ${item.description || ''}`);
      if (!tokens.every((token) => haystack.includes(token))) return false;
    }
    return true;
  });
}

const SORTERS = {
  newest: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
  price_asc: (a, b) => a.price - b.price,
  price_desc: (a, b) => b.price - a.price,
  nearest: (a, b) => a.distanceKm - b.distanceKm,
  area_desc: (a, b) => (b.area || 0) - (a.area || 0),
};

export const sortListings = (items, sortId = 'newest') => [...items].sort(SORTERS[sortId] || SORTERS.newest);

// ============================================================================
// HỢP ĐỒNG / LỊCH HẸN
// ============================================================================

export const createContractId = () =>
  `CTR-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

/** Nhận diện trạng thái từ chuỗi (cả dữ liệu cũ trong localStorage) để gán màu huy hiệu. */
export function getStatusMeta(status = '') {
  const s = normalizeText(status);
  if (s.includes('huy')) return { tone: 'danger', label: status };
  if (s.includes('coc') || s.includes('dang thue')) return { tone: 'success', label: status };
  if (s.includes('hen')) return { tone: 'info', label: status };
  return { tone: 'neutral', label: status || 'Chưa xác định' };
}

export const isBookingCancellable = (status) => getStatusMeta(status).tone === 'info';

// ============================================================================
// VALIDATE FORM
// ============================================================================

export const isValidPhone = (phone) => /^(0|\+84)\d{9}$/.test(String(phone ?? '').replace(/[\s.-]/g, ''));

export function validateListing(form) {
  const L = LISTING_LIMITS;
  const errors = {};
  const price = Number(form.price);
  const area = parseDecimal(form.area);
  const distance = parseDecimal(form.distanceKm);

  if (form.title.trim().length < L.titleMin) {
    errors.title = `Tiêu đề cần ít nhất ${L.titleMin} ký tự để người thuê hiểu rõ phòng.`;
  }
  if (!Number.isFinite(price) || price < L.priceMin || price > L.priceMax) {
    errors.price = `Giá thuê từ ${L.priceMin.toLocaleString('vi-VN')} đến ${L.priceMax.toLocaleString('vi-VN')} đồng/tháng.`;
  }
  if (!Number.isFinite(area) || area < L.areaMin || area > L.areaMax) {
    errors.area = `Diện tích từ ${L.areaMin} đến ${L.areaMax} m².`;
  }
  if (!Number.isFinite(distance) || distance < 0 || distance > L.distanceMax) {
    errors.distanceKm = `Khoảng cách từ 0 đến ${L.distanceMax} km.`;
  }
  if (!isValidPhone(form.contactPhone)) {
    errors.contactPhone = 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0 hoặc +84.';
  }
  if (form.address.trim().length < 5) {
    errors.address = 'Nhập địa chỉ chi tiết để người thuê tìm được phòng.';
  }
  if (form.description.length > L.descriptionMax) {
    errors.description = `Mô tả tối đa ${L.descriptionMax} ký tự.`;
  }
  return errors;
}

export function validateBooking({ date, time }) {
  const errors = {};
  if (!date) {
    errors.date = 'Chọn ngày bạn muốn xem phòng.';
  } else if (date < getTodayInputValue()) {
    errors.date = 'Ngày xem phòng không được ở quá khứ.';
  }
  if (!time) {
    errors.time = 'Chọn giờ xem phòng.';
  } else if (time < BOOKING_HOURS.min || time > BOOKING_HOURS.max) {
    errors.time = `Chủ trọ nhận lịch từ ${BOOKING_HOURS.min} đến ${BOOKING_HOURS.max}.`;
  } else if (date === getTodayInputValue() && time <= getNowTimeValue()) {
    errors.time = 'Giờ này đã qua, hãy chọn giờ muộn hơn hoặc ngày khác.';
  }
  return errors;
}

// ============================================================================
// ẢNH & CLIPBOARD
// ============================================================================

/**
 * Nén ảnh về JPEG base64. Ném lỗi có thông điệp tiếng Việt thay vì treo mãi
 * khi tệp hỏng (bản cũ không xử lý onerror của FileReader).
 */
export function compressImage(file, maxWidth = IMAGE_RULES.maxWidth, quality = IMAGE_RULES.quality) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }
    if (!file.type || !file.type.startsWith('image/')) {
      reject(new Error('Tệp được chọn không phải hình ảnh.'));
      return;
    }
    if (file.size > IMAGE_RULES.maxFileBytes) {
      reject(new Error('Ảnh vượt quá 8MB, hãy chọn ảnh nhỏ hơn.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được tệp ảnh.'));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Ảnh bị lỗi hoặc không đúng định dạng.'));
      img.onload = () => {
        const ratio = img.width > maxWidth ? maxWidth / img.width : 1;
        const width = Math.max(1, Math.round(img.width * ratio));
        const height = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        // Nền trắng để PNG trong suốt không bị đen khi xuất JPEG.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* rơi xuống phương án dự phòng */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

// ============================================================================
// HOOKS
// ============================================================================

export function useDebouncedValue(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** State đồng bộ localStorage; lỗi đọc/ghi (quota, JSON hỏng) không làm sập giao diện. */
export function useLocalStorageState(key, fallback) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn(`[Housing] Không ghi được "${key}" vào localStorage:`, err);
    }
  }, [key, value]);

  return [value, setValue];
}

// Ngăn xếp modal: Esc chỉ đóng modal trên cùng (vd. xác nhận xoá đang mở trên chi tiết tin).
const escapeStack = [];

export function useEscapeKey(handler, enabled = true) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!enabled) return undefined;
    const token = Symbol('modal');
    escapeStack.push(token);
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && escapeStack[escapeStack.length - 1] === token) {
        event.stopPropagation();
        handlerRef.current?.(event);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      const index = escapeStack.indexOf(token);
      if (index > -1) escapeStack.splice(index, 1);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled]);
}

let scrollLocks = 0;
let previousOverflow = '';

export function useLockBodyScroll(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    if (scrollLocks === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    scrollLocks += 1;
    return () => {
      scrollLocks -= 1;
      if (scrollLocks === 0) document.body.style.overflow = previousOverflow;
    };
  }, [active]);
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),iframe,[tabindex]:not([tabindex="-1"])';

/** Giữ phím Tab trong hộp thoại, tự focus khi mở và trả focus về nút cũ khi đóng. */
export function useFocusTrap(ref, active = true) {
  const returnFocusRef = useRef(null);

  useEffect(() => {
    if (!active || !ref.current) return undefined;
    const node = ref.current;
    returnFocusRef.current = document.activeElement;

    const initial = node.querySelector('[data-autofocus]') || node;
    initial.focus({ preventScroll: true });

    const onKeyDown = (event) => {
      if (event.key !== 'Tab') return;
      const items = Array.from(node.querySelectorAll(FOCUSABLE));
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || current === node)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    node.addEventListener('keydown', onKeyDown);
    return () => {
      node.removeEventListener('keydown', onKeyDown);
      const back = returnFocusRef.current;
      if (back && typeof back.focus === 'function' && document.contains(back)) {
        back.focus({ preventScroll: true });
      }
    };
  }, [ref, active]);
}

/** Tạo tham chiếu callback ổn định trỏ tới giá trị mới nhất (tránh re-render thẻ phòng). */
export function useLatest(value) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return useCallback(() => ref.current, []);
}
