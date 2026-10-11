import axios from 'axios';

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchUserProfile(username) {
  const { data } = await axios.get(`/api/users/${encodeURIComponent(username)}`, {
    headers: authHeaders(),
  });
  return data;
}

export async function fetchMe() {
  const { data } = await axios.get('/api/users/me', { headers: authHeaders() });
  return data;
}

export async function sendProfileUpdateOtp() {
  const { data } = await axios.post('/api/users/me/send-otp', {}, { headers: authHeaders() });
  return data;
}

export async function updateMyProfile(payload) {
  const { data } = await axios.put('/api/users/me', payload, { headers: authHeaders() });
  return data;
}
