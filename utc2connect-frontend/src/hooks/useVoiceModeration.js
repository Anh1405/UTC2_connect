import { useRef, useCallback } from 'react';
import { aiApiUrl, aiApiKey, VOICE_CHUNK_MS, SILENCE_DELAY_MS } from '../config/appConfig';
import {
  mimeToExt,
  pickAudioMimeType,
  rmsFromFrequencyData,
  shouldSkipVoiceChunk,
  SPEAKING_RMS_THRESHOLD,
} from '../utils/voiceRecorder';
import useLatest from './useLatest';

// Ghi âm giọng nói đối phương theo từng đoạn, gửi lên api.py kiểm duyệt.
// - onToxic(data, speakerName): gọi khi phát hiện vi phạm.
// - onTranscript(transcript, speakerName, data): gọi khi PhoWhisper bóc băng ra chữ thành công.
export default function useVoiceModeration({ onToxic, onTranscript }) {
  const voiceRecorderRef = useRef(null);
  const activeRef = useRef(false);
  const chunkBufferRef = useRef([]);
  const audioContextRef = useRef(null);
  const animationFrameRef = useRef(null);
  
  const onToxicRef = useLatest(onToxic);
  const onTranscriptRef = useLatest(onTranscript); // 🌟 Thêm Ref cho onTranscript

  const stopVoiceModeration = useCallback(() => {
    activeRef.current = false;
    chunkBufferRef.current = [];
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close().catch((e) => console.error(e));
      audioContextRef.current = null;
    }
    const recorder = voiceRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch (err) {
        /* bỏ qua */
      }
    }
    voiceRecorderRef.current = null;
  }, []);

  const sendChunk = useCallback(
    async (blob, roomId, speakerName, listenerName) => {
      if (!blob || blob.size < 2000) return;
      try {
        const form = new FormData();
        form.append('file', blob, `chunk.${mimeToExt(blob.type)}`);
        form.append('call_id', roomId || 'unknown_room');
        form.append('caller_id', speakerName || 'Unknown');
        form.append('receiver_id', listenerName || 'Unknown');
        form.append('mime_type', blob.type || '');
        form.append('client_platform', /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop');

        // 🌟 Bổ sung Header bắt buộc cho Ngrok để tránh bị chặn 0 B
        const headers = {
          'ngrok-skip-browser-warning': 'true',
        };
        if (aiApiKey) {
          headers['X-API-Key'] = aiApiKey;
        }

        const res = await fetch(`${aiApiUrl}/moderate-audio`, {
          method: 'POST',
          headers,
          body: form,
        });

        if (!res.ok) {
          console.error('❌ [Kiểm duyệt giọng nói] api.py trả lỗi:', res.status, await res.text().catch(() => ''));
          return;
        }

        const data = await res.json();
        console.log('[moderate-audio response]', data);
        // 🌟 GỬI TRANSCRIPT BÓC BĂNG RA KHUNG CHAT UI
        if (data?.transcript && data.transcript.trim() !== '') {
          console.log(`🎙️ [PhoWhisper] ${speakerName}: "${data.transcript}"`);
          onTranscriptRef.current?.(data.transcript, speakerName, data);
        }

        // Xử lý khi có vi phạm độc hại
        if (data?.is_toxic) {
          onToxicRef.current?.(data, speakerName);
        }
      } catch (err) {
        console.error('❌ [Kiểm duyệt giọng nói] Không gửi được đoạn ghi âm:', err?.message || err);
      }
    },
    [onToxicRef, onTranscriptRef]
  );

  const startVoiceModeration = useCallback(
    (remoteStream, roomId, speakerName, listenerName) => {
      if (!remoteStream || activeRef.current) return;
      const audioTracks = remoteStream.getAudioTracks();
      if (audioTracks.length === 0) return;

      const audioOnlyStream = new MediaStream(audioTracks);
      const supportedType = pickAudioMimeType();

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
      const source = audioContextRef.current.createMediaStreamSource(audioOnlyStream);
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      activeRef.current = true;

      const recordOneChunk = () => {
        if (!activeRef.current) return;
        let recorder;
        try {
          recorder = new MediaRecorder(audioOnlyStream, supportedType ? { mimeType: supportedType } : undefined);
        } catch (err) {
          console.error('❌ [Kiểm duyệt] Trình duyệt không hỗ trợ MediaRecorder:', err);
          activeRef.current = false;
          return;
        }
        voiceRecorderRef.current = recorder;
        chunkBufferRef.current = [];

        let silenceTimer = null;
        let maxDurationTimer = null;
        let isSpeaking = false;
        let hasSpokenInThisChunk = false;
        let peakRms = 0;

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunkBufferRef.current.push(e.data);
        };

        recorder.onstop = () => {
          clearTimeout(silenceTimer);
          clearTimeout(maxDurationTimer);
          if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

          const blob = new Blob(chunkBufferRef.current, {
            type: recorder.mimeType || supportedType || 'audio/webm',
          });
          chunkBufferRef.current = [];

          if (!shouldSkipVoiceChunk({ blob, hasSpoken: hasSpokenInThisChunk, peakRms })) {
            sendChunk(blob, roomId, speakerName, listenerName);
          }

          if (activeRef.current) recordOneChunk();
        };

        const checkAudioLevel = () => {
          if (!activeRef.current || recorder.state !== 'recording') return;
          analyser.getByteFrequencyData(dataArray);
          const average = rmsFromFrequencyData(dataArray);
          if (average > peakRms) peakRms = average;
          if (average > SPEAKING_RMS_THRESHOLD) {
            hasSpokenInThisChunk = true;
            if (!isSpeaking) {
              isSpeaking = true;
              clearTimeout(silenceTimer);
            }
          } else if (isSpeaking) {
            isSpeaking = false;
            silenceTimer = setTimeout(() => {
              if (recorder.state === 'recording') recorder.stop();
            }, SILENCE_DELAY_MS);
          }
          animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
        };

        recorder.start();
        checkAudioLevel();

        maxDurationTimer = setTimeout(() => {
          if (recorder.state === 'recording') recorder.stop();
        }, VOICE_CHUNK_MS);
      };

      recordOneChunk();
    },
    [sendChunk]
  );

  return { startVoiceModeration, stopVoiceModeration };
}