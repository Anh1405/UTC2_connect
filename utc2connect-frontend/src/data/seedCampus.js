export const UTC2_CAMPUS = {
  name: 'Phân hiệu ĐH GTVT tại TP.HCM',
  address: '450 Lê Văn Việt, Tăng Nhơn Phú A, TP. Thủ Đức',
  lat: 10.8452,
  lng: 106.7945,
};

const HOUSING_KEY = 'u2_housing_listings';
const MARKET_KEY = 'u2_market_listings';
const CONFESSION_KEY = 'u2_confession_posts';

const SEED_HOUSING = [
  {
    id: 'h1',
    title: 'Phòng trọ full nội thất gần cổng Lê Văn Việt',
    price: 2800000,
    area: 22,
    type: 'phong_tro',
    distanceKm: 0.8,
    amenities: ['wifi', 'may_lanh', 'gio_tu_do', 'khong_chung_chu'],
    address: 'Tăng Nhơn Phú A, Thủ Đức',
    lat: 10.847, lng: 106.792,
    description: 'Phòng mới sơn, có gác lửng, giờ giấc tự do. Cách UTC2 ~8 phút xe máy. Ưu tiên sinh viên.',
    contact: { phone: '0901234567', zalo: '0901234567' },
    images: [
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=900&q=80',
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=900&q=80',
    ],
    author: 'minh.tro',
    createdAt: Date.now() - 86400000,
  },
  {
    id: 'h2',
    title: 'Ký túc xá mini 4 người — giá sinh viên',
    price: 1500000,
    area: 18,
    type: 'ktx',
    distanceKm: 1.4,
    amenities: ['wifi', 'cho_de_xe'],
    address: 'Lã Xuân Oai, Thủ Đức',
    lat: 10.841, lng: 106.801,
    description: 'KTX tư nhân, có quản lý, Wi-Fi 24/7. Phù hợp năm nhất muốn tiết kiệm.',
    contact: { phone: '0912345678', zalo: '0912345678' },
    images: ['https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=900&q=80'],
    author: 'ktx.u2',
    createdAt: Date.now() - 172800000,
  },
  {
    id: 'h3',
    title: 'CCMN 1PN có thang máy, máy lạnh',
    price: 4500000,
    area: 30,
    type: 'ccmn',
    distanceKm: 2.1,
    amenities: ['wifi', 'may_lanh', 'thang_may', 'gio_tu_do'],
    address: 'Đỗ Xuân Hợp, Thủ Đức',
    lat: 10.835, lng: 106.785,
    description: 'Chung cư mini mới, an ninh vân tay. Có chỗ để xe máy tầng hầm.',
    contact: { phone: '0987654321', zalo: '0987654321' },
    images: [
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=900&q=80',
      'https://images.unsplash.com/photo-1560185127-6a0006511ba0?w=900&q=80',
    ],
    author: 'linh.nha',
    createdAt: Date.now() - 3600000,
  },
];

const SEED_MARKET = [
  {
    id: 'm1',
    title: 'Giáo trình Toán cao cấp 1 (gần như mới)',
    price: 65000,
    category: 'sach',
    condition: 'like_new',
    description: 'Mua đầu năm, highlight nhẹ vài trang. Giao tại cổng trường.',
    images: ['https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=800&q=80'],
    author: 'an.sv',
    createdAt: Date.now() - 7200000,
  },
  {
    id: 'm2',
    title: 'Laptop Dell i5 gen 10 — học online/code',
    price: 4500000,
    category: 'dien_tu',
    condition: 'used',
    description: '8GB/256GB, pin ~3h. Tặng chuột. Test tại quán trà chanh đối diện trường.',
    images: ['https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80'],
    author: 'khoa.it',
    createdAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'm3',
    title: 'Xe Wave RSX 2018 chính chủ',
    price: 11500000,
    category: 'xe',
    condition: 'used',
    description: 'Máy êm, giấy tờ đủ. Đi học 2 năm, bán vì chuyển KTX có xe bus.',
    images: ['https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=800&q=80'],
    author: 'bao.xe',
    createdAt: Date.now() - 86400000 * 4,
  },
];

const SEED_POSTS = [
  {
    id: 'p1',
    anonymous: true,
    author: 'Ẩn danh',
    authorId: null,
    content: 'Ai đang tìm bạn cùng phòng gần Lê Văn Việt không? Mình nữ, năm 2 Cầu đường, sạch sẽ, không hút thuốc.',
    createdAt: Date.now() - 5400000,
    reactions: { like: 12, love: 4, haha: 1, wow: 0, sad: 0 },
    myReaction: null,
    comments: [
      {
        id: 'c1',
        author: 'mai.sv',
        text: 'Inbox mình nhé, mình cũng đang tìm ạ',
        createdAt: Date.now() - 3600000,
        replies: [
          { id: 'c1r1', author: 'Ẩn danh', text: 'Ok bạn ơi, mình nhắn Zalo sau', createdAt: Date.now() - 3000000 },
        ],
      },
    ],
  },
];

function load(key, seed) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  localStorage.setItem(key, JSON.stringify(seed));
  return seed;
}

function save(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

export function loadHousing() {
  return load(HOUSING_KEY, SEED_HOUSING);
}
export function saveHousing(list) {
  save(HOUSING_KEY, list);
}
export function loadMarket() {
  return load(MARKET_KEY, SEED_MARKET);
}
export function saveMarket(list) {
  save(MARKET_KEY, list);
}
export function loadConfessions() {
  return load(CONFESSION_KEY, SEED_POSTS);
}
export function saveConfessions(list) {
  save(CONFESSION_KEY, list);
}

export const ROOM_TYPES = [
  { id: 'all', label: 'Tất cả' },
  { id: 'ktx', label: 'Ký túc xá' },
  { id: 'phong_tro', label: 'Phòng trọ' },
  { id: 'ccmn', label: 'Chung cư mini' },
];

export const AMENITIES = [
  { id: 'wifi', label: 'Wifi' },
  { id: 'may_lanh', label: 'Máy lạnh' },
  { id: 'gio_tu_do', label: 'Giờ tự do' },
  { id: 'khong_chung_chu', label: 'Không chung chủ' },
  { id: 'thang_may', label: 'Thang máy' },
  { id: 'cho_de_xe', label: 'Chỗ để xe' },
];

export const MARKET_CATEGORIES = [
  { id: 'all', label: 'Tất cả' },
  { id: 'sach', label: 'Sách vở' },
  { id: 'dien_tu', label: 'Đồ điện tử' },
  { id: 'gia_dung', label: 'Đồ gia dụng' },
  { id: 'xe', label: 'Xe máy' },
  { id: 'khac', label: 'Khác' },
];

export const CONDITIONS = [
  { id: 'new', label: 'Mới' },
  { id: 'like_new', label: 'Như mới' },
  { id: 'used', label: 'Đã qua sử dụng' },
];

export function formatVnd(n) {
  return new Intl.NumberFormat('vi-VN').format(n) + ' đ';
}
