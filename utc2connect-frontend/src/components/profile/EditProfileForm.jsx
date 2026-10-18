import { useState } from 'react';
import OtpModal from './OtpModal';

export default function EditProfileForm({ currentUser, onSaveSuccess }) {
  const [formData, setFormData] = useState({
    displayName: currentUser?.displayName || '',
    phone: currentUser?.phone || '',
    major: currentUser?.major || 'CNTT',
  });

  const [showOtp, setShowOtp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // Validate form trước khi bật OTP
  const validateForm = () => {
    const errors = {};
    if (!formData.displayName.trim()) {
      errors.displayName = 'Tên hiển thị không được để trống';
    }
    if (formData.phone && !/^(0[3|5|7|8|9])+([0-9]{8})$/.test(formData.phone)) {
      errors.phone = 'Số điện thoại không hợp lệ (VD: 0912345678)';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleTriggerSave = (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setErrorMsg('');
    setShowOtp(true);
  };

  const handleVerifyOtpAndSave = async (otpCode) => {
    setLoading(true);
    setErrorMsg('');
    try {
      // Giả lập gọi API backend thực tế: POST /api/user/profile/update
      // await updateProfileApi({ ...formData, otp: otpCode });
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Demo async delay

      setShowOtp(false);
      if (onSaveSuccess) onSaveSuccess();
      alert('Cập nhật hồ sơ thành công!');
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Mã OTP không đúng hoặc đã hết hạn.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[var(--fb-card,#fff)] border border-[var(--fb-divider,#e5e7eb)] rounded-2xl p-6 w-full max-w-2xl mx-auto shadow-sm">
      <h2 className="text-xl font-bold text-[var(--navy,#101B33)] mb-6 border-b border-[var(--fb-divider,#e5e7eb)] pb-3 flex items-center justify-between">
        <span>Chỉnh sửa Hồ sơ</span>
        <span className="text-xs font-normal text-gray-500">Bảo mật 2 lớp OTP</span>
      </h2>

      <form onSubmit={handleTriggerSave} className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Tên hiển thị <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.displayName}
            onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
            className="w-full px-4 py-2.5 bg-[#FBFAF4] border-[1.5px] border-[#E1E0D6] rounded-lg focus:border-[var(--amber,#FFB400)] focus:ring-[3px] focus:ring-[rgba(255,180,0,0.18)] outline-none text-[var(--ink,#222)]"
            required
          />
          {fieldErrors.displayName && (
            <p className="text-xs text-red-500 mt-1">{fieldErrors.displayName}</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Số điện thoại</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-4 py-2.5 bg-[#FBFAF4] border-[1.5px] border-[#E1E0D6] rounded-lg focus:border-[var(--amber,#FFB400)] focus:ring-[3px] focus:ring-[rgba(255,180,0,0.18)] outline-none text-[var(--ink,#222)]"
              placeholder="0912345678"
            />
            {fieldErrors.phone && (
              <p className="text-xs text-red-500 mt-1">{fieldErrors.phone}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Chuyên ngành</label>
            <select
              value={formData.major}
              onChange={(e) => setFormData({ ...formData, major: e.target.value })}
              className="w-full px-4 py-2.5 bg-[#FBFAF4] border-[1.5px] border-[#E1E0D6] rounded-lg focus:border-[var(--amber,#FFB400)] focus:ring-[3px] focus:ring-[rgba(255,180,0,0.18)] outline-none text-[var(--ink,#222)]"
            >
              <option value="CNTT">Công nghệ thông tin</option>
              <option value="KT">Kinh tế xây dựng</option>
              <option value="CDT">Cơ điện tử</option>
              <option value="OT">Kỹ thuật Ô tô</option>
              <option value="CX">Kỹ thuật Cầu đường</option>
            </select>
          </div>
        </div>

        <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
          <button
            type="button"
            className="px-5 py-2.5 rounded-lg font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Hủy
          </button>
          <button
            type="submit"
            className="px-6 py-2.5 rounded-lg font-bold bg-[var(--amber,#FFB400)] text-[var(--navy,#101B33)] shadow-md hover:bg-amber-400 transition-colors"
          >
            Lưu thay đổi
          </button>
        </div>
      </form>

      {/* Modal OTP dùng chung */}
      <OtpModal
        open={showOtp}
        title="XÁC NHẬN CẬP NHẬT"
        subtitle="Mã xác nhận đã gửi đến Email của bạn để hoàn tất lưu thông tin."
        destination={currentUser?.email || 'sinhvien@st.utc2.edu.vn'}
        loading={loading}
        error={errorMsg}
        onClose={() => setShowOtp(false)}
        onVerify={handleVerifyOtpAndSave}
        onResend={() => console.log('Resending OTP...')}
      />
    </div>
  );
}