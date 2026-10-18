import axios from 'axios';

// Các request liên quan tới xác thực. Mỗi hàm trả về kết quả thô để hook xử lý UI.

export const sendRegisterOtp = (email) => axios.post('/api/auth/send-otp', { email });

export const sendForgotOtp = (email) => axios.post('/api/auth/forgot-password/send-otp', { email });

export const registerAccount = ({ email, username, password, otp }) =>
  axios.post('/api/auth/register', { email, username, password, otp });

export const resetPassword = ({ email, otp, newPassword }) =>
  axios.post('/api/auth/forgot-password/reset', { email, otp, newPassword });

const postJson = async (url, body) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { ok: response.ok, data };
};

export const loginRequest = ({ username, password, deviceId }) =>
  postJson('/api/auth/login', { username, password, deviceId });

export const verifyDeviceOtpRequest = ({ username, otp, deviceId }) =>
  postJson('/api/auth/login/verify-otp', { username, otp, deviceId });
