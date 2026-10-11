// Cấu hình ICE (STUN/TURN) cho WebRTC.
// Có thể ghi đè bằng VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL trong file .env
const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME || '31d00c2d771b258511393e6a';
const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL || 'cP/hRVNrNseRYzO9';

export const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'turn:global.relay.metered.ca:80', username: TURN_USERNAME, credential: TURN_CREDENTIAL },
    { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: TURN_USERNAME, credential: TURN_CREDENTIAL },
    { urls: 'turn:global.relay.metered.ca:443', username: TURN_USERNAME, credential: TURN_CREDENTIAL },
    { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: TURN_USERNAME, credential: TURN_CREDENTIAL },
  ],
};
