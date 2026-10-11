import { useState, useRef, useEffect } from 'react';
import { getDeviceId } from '../utils/deviceId';
import { isTokenExpired } from '../utils/token';
import * as authApi from '../api/authApi';

// Toàn bộ logic Đăng nhập / Đăng ký / Quên mật khẩu / OTP thiết bị lạ
export default function useAuth() {
  const [mode, setMode] = useState('login'); // login | register | forgot

  // Form
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Trạng thái
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [userData, setUserData] = useState(null);

  // OTP thiết bị lạ
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [deviceOtp, setDeviceOtp] = useState('');
  const [deviceOtpError, setDeviceOtpError] = useState('');
  const [deviceOtpLoading, setDeviceOtpLoading] = useState(false);

  const otpRefs = useRef([]);

  // Soát vé lại khi F5 trang nếu còn token hợp lệ
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (!savedToken || !savedUser) return;

    if (isTokenExpired(savedToken)) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      return;
    }
    setUserData(JSON.parse(savedUser));
    setLoginSuccess(true);
  }, []);

  const saveSession = (accessToken) => {
    localStorage.setItem('token', accessToken);
    const currentUser = { username };
    localStorage.setItem('user', JSON.stringify(currentUser));
    setUserData(currentUser);
    setLoginSuccess(true);
  };

  // Xoá phiên đăng nhập + quay về màn hình Đăng nhập
  const clearSession = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUserData(null);
    setLoginSuccess(false);
    setMode('login');
    setMessage('');
    setError('');
  };

  const switchMode = (targetMode) => {
    setMode(targetMode);
    setMessage('');
    setError('');
    setIsOtpSent(false);
    setUsername('');
    setPassword('');
    setNewPassword('');
    setOtp('');
  };

  // Chạy 1 request có loading + thông báo lỗi chung
  const runRequest = async (request, fallbackError, onSuccess) => {
    setMessage('');
    setError('');
    setLoading(true);
    try {
      const response = await request();
      setMessage(response.data.message);
      onSuccess?.();
    } catch (err) {
      setError(err.response?.data?.message || fallbackError);
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = () =>
    runRequest(() => authApi.sendRegisterOtp(email), 'Có lỗi xảy ra khi gửi OTP!', () => setIsOtpSent(true));

  const handleSendForgotOtp = () =>
    runRequest(() => authApi.sendForgotOtp(email), 'Có lỗi xảy ra khi gửi mã đặt lại!', () => setIsOtpSent(true));

  const handleRegister = () =>
    runRequest(
      () => authApi.registerAccount({ email, username, password, otp }),
      'Đăng ký thất bại, vui lòng kiểm tra lại!',
      () => setTimeout(() => switchMode('login'), 2000)
    );

  const handleResetPassword = () =>
    runRequest(
      () => authApi.resetPassword({ email, otp, newPassword }),
      'Đặt lại mật khẩu thất bại!',
      () => setTimeout(() => switchMode('login'), 2000)
    );

  const handleLogin = async () => {
    try {
      const { ok, data } = await authApi.loginRequest({ username, password, deviceId: getDeviceId() });
      if (!ok) {
        alert(data.message);
        return;
      }
      if (data.requireOtp) {
        alert(data.message);
        setShowOtpModal(true);
      } else {
        saveSession(data.accessToken);
        alert('Đăng nhập thành công!');
      }
    } catch (err) {
      alert('Không thể kết nối đến máy chủ đăng nhập!');
    }
  };

  const handleVerifyDeviceOtp = async (otpCode) => {
    setDeviceOtpLoading(true);
    setDeviceOtpError('');
    try {
      const { ok, data } = await authApi.verifyDeviceOtpRequest({
        username,
        otp: otpCode,
        deviceId: getDeviceId(),
      });
      if (ok) {
        saveSession(data.accessToken);
        alert('Xác nhận thiết bị thành công!');
        setShowOtpModal(false);
        setDeviceOtp('');
      } else {
        setDeviceOtpError(data.message || 'Mã OTP không đúng');
        alert(data.message);
      }
    } catch (err) {
      setDeviceOtpError('Lỗi kết nối, vui lòng thử lại');
    } finally {
      setDeviceOtpLoading(false);
    }
  };

  // ----- Ô nhập OTP 6 số -----
  const otpDigits = Array.from({ length: 6 }, (_, i) => otp[i] || '');

  const handleOtpChange = (index, raw) => {
    const digit = raw.replace(/[^0-9]/g, '').slice(-1);
    const arr = otp.padEnd(6, ' ').split('');
    arr[index] = digit || ' ';
    setOtp(arr.join('').trimEnd());
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
    if (e.key === 'Enter') {
      if (mode === 'register') handleRegister();
      if (mode === 'forgot') handleResetPassword();
    }
  };

  return {
    mode,
    email, setEmail,
    username, setUsername,
    password, setPassword,
    otp,
    newPassword, setNewPassword,
    isOtpSent, setIsOtpSent,
    message,
    error,
    loading,
    loginSuccess,
    userData,
    showOtpModal, setShowOtpModal,
    deviceOtp, setDeviceOtp,
    deviceOtpError,
    deviceOtpLoading,
    otpRefs,
    otpDigits,
    switchMode,
    clearSession,
    handleSendOtp,
    handleSendForgotOtp,
    handleRegister,
    handleResetPassword,
    handleLogin,
    handleVerifyDeviceOtp,
    handleOtpChange,
    handleOtpKeyDown,
  };
}
