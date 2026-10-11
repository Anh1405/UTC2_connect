"""VAD (Silero): chỉ giữ lại đoạn có tiếng người."""
import threading
from typing import Optional, Tuple

import numpy as np
import torch
from pydub import AudioSegment

from app.config import ASR_USE_VAD, VAD_THRESHOLD

vad_model = None
vad_lock = threading.Lock()
if ASR_USE_VAD:
    try:
        from silero_vad import load_silero_vad, get_speech_timestamps
        vad_model = load_silero_vad()
        print("✅ [VAD] Silero VAD sẵn sàng.")
    except Exception as e:
        print(f"⚠️ [VAD] Không nạp được silero-vad ({e}).")
        vad_model = None

def extract_speech(audio: AudioSegment) -> Tuple[AudioSegment, Optional[float]]:
    if vad_model is None:
        return audio, None
    try:
        samples = np.array(audio.get_array_of_samples(), dtype=np.float32) / 32768.0
        with vad_lock:
            stamps = get_speech_timestamps(
                torch.from_numpy(samples), vad_model,
                sampling_rate=16000,
                threshold=VAD_THRESHOLD,
                min_speech_duration_ms=120,
                min_silence_duration_ms=250,
                speech_pad_ms=200,
            )
        if not stamps:
            return audio[0:0], 0.0
        out = audio[0:0]
        gap = AudioSegment.silent(duration=150, frame_rate=16000)
        total_ms = 0
        for st in stamps:
            start_ms, end_ms = int(st["start"] / 16), int(st["end"] / 16)
            seg = audio[start_ms:end_ms]
            total_ms += len(seg)
            out = out.append(seg, crossfade=0).append(gap, crossfade=0)
        return out, total_ms / 1000.0
    except Exception as e:
        print(f"⚠️ [VAD] Lỗi: {e} — bỏ qua VAD cho chunk này.")
        return audio, None
