/** Ngưỡng RMS: laptop mic/bàn phím rất nhạy (trước đây = 3 → gửi cả tiếng gõ phím). */
export const SPEAKING_RMS_THRESHOLD = 12;
export const MIN_VOICE_BLOB_BYTES = 8000;

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

export function pickAudioMimeType() {
  return MIME_CANDIDATES.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
}

export function mimeToExt(mime) {
  if (!mime) return 'webm';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

export function rmsFromFrequencyData(dataArray) {
  if (!dataArray?.length) return 0;
  let sum = 0;
  for (let i = 0; i < dataArray.length; i += 1) sum += dataArray[i];
  return sum / dataArray.length;
}

export function shouldSkipVoiceChunk({ blob, hasSpoken, peakRms }) {
  if (!blob || blob.size < MIN_VOICE_BLOB_BYTES) return true;
  if (!hasSpoken) return true;
  if (peakRms < SPEAKING_RMS_THRESHOLD) return true;
  return false;
}
