import { useEffect, useState } from 'react';
import { fetchUserProfile, sendProfileUpdateOtp, updateMyProfile } from '../../api/userApi';
import OtpModal from "../otp/OtpModal";

const EMPTY_FORM = {
  displayName: '',
  phone: '',
  email: '',
  khoaNganh: '',
  namHoc: '',
};

export default function UserProfileDrawer({ username, selfUsername, onClose, onUpdated }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  
  // Trạng thái Modal OTP
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');

  const isSelf = Boolean(username && selfUsername && username === selfUsername);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      setError('');
      try {
        const data = await fetchUserProfile(username);
        if (!isMounted) return;
        setProfile(data);
        setForm({
          displayName: data.displayName || data.username || '',
          phone: data.phone || '',
          email: data.email || '',
          khoaNganh: data.khoaNganh || '',
          namHoc: data.namHoc || '',
        });
      } catch (err) {
        if (!isMounted) return;
        const fallback = {
          username,
          displayName: username,
          email: '',
          phone: '',
          khoaNganh: '',
          namHoc: '',
        };
        setProfile(fallback);
        setForm({ ...EMPTY_FORM, displayName: username });
        setError(err.response?.data?.message || 'Không tải được thông tin đầy đủ.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (username) loadData();
    return () => { isMounted = false; };
  }, [username]);

  if (!username) return null;

  const handleSaveClick = async () => {
    setOtpError('');
    try {
      await sendProfileUpdateOtp();
      setOtpOpen(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Không gửi được OTP. Vui lòng thử lại sau.');
    }
  };

  const handleVerifyOtp = async (otpCode) => {
    setOtpLoading(true);
    setOtpError('');
    try {
      const response = await updateMyProfile({ ...form, otp: otpCode });
      const updatedUser = response.user || { ...profile, ...form };
      setProfile(updatedUser);
      onUpdated?.(updatedUser);
      setOtpOpen(false);
      setEditing(false);
    } catch (err) {
      setOtpError(err.response?.data?.message || 'OTP không đúng hoặc đã hết hạn.');
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <>
      <div className="u2-drawer-overlay fixed inset-0 bg-black/50 z-[800] backdrop-blur-xs flex justify-end" onClick={onClose}>
        <aside className="u2-drawer w-full max-w-md bg-white h-full p-6 shadow-2xl flex flex-col justify-between overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div>
            <header className="u2-drawer-head flex justify-between items-center pb-4 mb-4 border-b">
              <span className="text-amber-600 font-mono text-xs tracking-widest font-bold">HỒ SƠ HÀNH KHÁCH</span>
              <button type="button" className="text-gray-400 hover:text-black text-lg" onClick={onClose}>✕</button>
            </header>

            {loading ? (
              <p className="text-gray-500 text-center py-8">Đang tải hồ sơ...</p>
            ) : (
              <>
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-full bg-amber-400 text-navy font-bold text-2xl flex items-center justify-center shadow-md">
                    {(profile?.displayName || profile?.username || '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-navy">{profile?.displayName || profile?.username}</h2>
                    <p className="text-xs text-gray-500">@{profile?.username}</p>
                  </div>
                </div>

                {error && <div className="p-3 mb-4 text-xs bg-red-50 text-red-600 rounded-lg">{error}</div>}

                {!editing ? (
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between py-1 border-b"><dt className="text-gray-500">Email</dt><dd className="font-semibold">{profile?.email || '—'}</dd></div>
                    <div className="flex justify-between py-1 border-b"><dt className="text-gray-500">Số điện thoại</dt><dd className="font-semibold">{profile?.phone || '—'}</dd></div>
                    <div className="flex justify-between py-1 border-b"><dt className="text-gray-500">Khoa / Ngành</dt><dd className="font-semibold">{profile?.khoaNganh || '—'}</dd></div>
                    <div className="flex justify-between py-1 border-b"><dt className="text-gray-500">Năm học</dt><dd className="font-semibold">{profile?.namHoc || '—'}</dd></div>
                  </dl>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Tên hiển thị</label>
                      <input className="w-full border rounded-lg p-2 text-sm" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Email</label>
                      <input className="w-full border rounded-lg p-2 text-sm" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Số điện thoại</label>
                      <input className="w-full border rounded-lg p-2 text-sm" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Khoa / Ngành</label>
                      <input className="w-full border rounded-lg p-2 text-sm" value={form.khoaNganh} onChange={(e) => setForm({ ...form, khoaNganh: e.target.value })} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {isSelf && !loading && (
            <div className="pt-4 border-t flex gap-2">
              {!editing ? (
                <button className="w-full py-2.5 bg-amber-400 font-bold rounded-lg hover:bg-amber-500" onClick={() => setEditing(true)}>
                  Chỉnh sửa hồ sơ
                </button>
              ) : (
                <>
                  <button className="w-1/2 py-2.5 bg-gray-100 font-semibold rounded-lg hover:bg-gray-200" onClick={() => setEditing(false)}>Huỷ</button>
                  <button className="w-1/2 py-2.5 bg-amber-400 font-bold rounded-lg hover:bg-amber-500" onClick={handleSaveClick}>Lưu thay đổi</button>
                </>
              )}
            </div>
          )}
        </aside>
      </div>

      <OtpModal
        open={otpOpen}
        title="XÁC NHẬN CẬP NHẬT"
        subtitle="Nhập 6 chữ số OTP được gửi tới email để cập nhật."
        destination={form.email || profile?.email}
        loading={otpLoading}
        error={otpError}
        onClose={() => setOtpOpen(false)}
        onResend={sendProfileUpdateOtp}
        onVerify={handleVerifyOtp}
      />
    </>
  );
}

export function UserChip({ username, onOpen, className = '' }) {
  const name = typeof username === 'string' ? username : username?.username;
  if (!name) return null;

  if (name === 'Ẩn danh') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-xs ${className}`}>
        <span>🎭</span>
        <span>Ẩn danh</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-900 hover:bg-amber-100 transition-colors text-xs font-medium ${className}`}
      onClick={() => onOpen?.(name)}
    >
      <span className="w-5 h-5 rounded-full bg-amber-400 text-black font-bold flex items-center justify-center text-[10px]">
        {name.charAt(0).toUpperCase()}
      </span>
      <span>{name}</span>
    </button>
  );
}