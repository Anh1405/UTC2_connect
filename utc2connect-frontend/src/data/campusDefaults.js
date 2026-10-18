// Dữ liệu khởi tạo mặc định cho Chợ cũ & Phòng trọ (lưu LocalStorage)

export const DEFAULT_MARKET_ITEMS = [
  {
    id: 'm1',
    title: 'Giáo trình Giải Tích 1 + 2 (K63 UTC2)',
    price: 50000,
    category: 'Sách & Giáo trình',
    condition: 'used',
    status: 'available',
    description: 'Sách còn mới 90%, đã tô highlight các phần trọng tâm thi.',
    authorEmail: 'nguyenvana@st.utc2.edu.vn',
    author: { name: 'Nguyễn Văn A', username: 'nguyenvana', email: 'nguyenvana@st.utc2.edu.vn', phone: '0912345678' },
    createdAt: Date.now() - 1000000,
  },
];

export const DEFAULT_MARKET_ORDERS = [
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

export const DEFAULT_HOUSING_ITEMS = [
  {
    id: 'h1',
    title: 'Phòng trọ cao cấp gần Cổng chính UTC2',
    price: 2500000,
    area: 25,
    type: 'phong_tro',
    distanceKm: 0.5,
    address: 'Đường D4, Phường Tăng Nhơn Phú A',
    description: 'Có máy lạnh, ban công thoáng mát, giờ giấc tự do, không chung chủ.',
    authorEmail: 'chutro_lan@gmail.com',
    author: { name: 'Cô Lan Chủ Trọ', username: 'chutro_lan', email: 'chutro_lan@gmail.com', phone: '0938123456' },
    contact: { phone: '0938123456' },
    createdAt: Date.now() - 2000000,
  },
];

export const DEFAULT_HOUSING_CONTRACTS = [
  {
    contractId: 'CTR-1029',
    houseTitle: 'Phòng trọ cao cấp gần Cổng chính UTC2',
    monthlyPrice: 2500000,
    startDate: '01/10/2026',
    status: 'Đã cọc / Đang thuê',
    landlord: { name: 'Cô Lan Chủ Trọ', email: 'chutro_lan@gmail.com', phone: '0938123456' },
    tenant: { name: 'Bạn (Người thuê)', email: 'user_current@st.utc2.edu.vn', phone: '0912999888' },
  },
];
