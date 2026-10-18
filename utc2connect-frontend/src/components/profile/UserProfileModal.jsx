export default function UserProfileModal({ user, onClose }) {
  if (!user) return null;

  return (
    <div
      className="fixed inset-0 bg-[rgba(16,27,51,0.65)] backdrop-blur-sm flex items-center justify-center z-[900] p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--fb-card,#fff)] w-full max-w-sm rounded-2xl shadow-xl overflow-hidden border border-gray-100 animate-[u2-pop-in_0.2s_ease]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cover Header */}
        <div className="h-24 bg-gradient-to-r from-slate-800 to-slate-900 relative">
          <button
            onClick={onClose}
            className="absolute top-2 right-3 text-white/70 hover:text-white bg-black/20 rounded-full w-8 h-8 flex items-center justify-center backdrop-blur-md transition-colors"
          >
            ✕
          </button>
          <div className="absolute -bottom-10 left-6 w-20 h-20 rounded-full border-4 border-white bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center text-slate-900 text-3xl font-bold shadow-md">
            {user.username?.charAt(0).toUpperCase()}
          </div>
        </div>

        {/* Nội dung thông tin */}
        <div className="pt-12 px-6 pb-6">
          <h2 className="text-xl font-bold text-slate-900 mb-1">{user.username}</h2>
          <p className="text-sm text-teal-600 font-medium mb-4 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></span> Đang trực tuyến
          </p>

          <div className="space-y-3 text-sm text-slate-700">
            <div className="flex items-center gap-3">
              <span className="text-lg">🎓</span>
              <span>Sinh viên UTC2 (Khóa {user.cohort || '62'})</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-lg">💻</span>
              <span>Chuyên ngành: {user.major || 'Công nghệ thông tin'}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-lg">📍</span>
              <span>Khu vực: {user.location || 'TP. Thủ Đức, TP.HCM'}</span>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button className="flex-1 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-sm">
              <span>💬</span> Nhắn tin
            </button>
            <button className="px-4 py-2.5 bg-gray-100 text-slate-700 font-semibold rounded-lg hover:bg-gray-200 transition-colors">
              Báo cáo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}