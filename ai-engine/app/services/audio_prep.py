"""Tiền xử lý âm thanh: chuẩn hóa 16kHz mono -> VAD -> normalize -> DeepFilter."""
import os
import shutil
from dataclasses import dataclass
from typing import Optional

from pydub import AudioSegment, effects

from app.asr.vad import extract_speech
from app.config import ASR_MIN_SPEECH_SEC, SAVE_DEBUG_AUDIO, TEMP_AUDIO_DIR
from app.loaders import deepfilter


@dataclass
class PreparedAudio:
    is_silent: bool
    duration_sec: float
    raw_peak_dbfs: float
    speech_sec: Optional[float]
    asr_path: Optional[str]  # file wav đưa vào ASR (None nếu is_silent)


def prepare_audio(src_path: str, wav_16k_path: str, enhanced_wav_path: str,
                  call_id: str, unique_suffix: str) -> PreparedAudio:
    audio = AudioSegment.from_file(src_path)
    audio = audio.set_frame_rate(16000).set_channels(1)
    audio_duration_sec = len(audio) / 1000.0
    loudness_dbfs = audio.dBFS

    print(f"🎙️ [AUDIO] call={call_id} | {audio_duration_sec:.1f}s | dBFS={loudness_dbfs:.1f} | peak={audio.max_dBFS:.1f}")

    raw_peak_dbfs = audio.max_dBFS

    # VAD: chỉ giữ đoạn có tiếng người
    speech_audio, speech_sec = extract_speech(audio)
    if speech_sec is not None:
        print(f"🗣️ [VAD] call={call_id} | tiếng người: {speech_sec:.2f}s / {audio_duration_sec:.1f}s")
    no_speech = speech_sec is not None and speech_sec < ASR_MIN_SPEECH_SEC

    is_silent = (
        audio_duration_sec < 0.4
        or audio.max_dBFS < -38.0
        or no_speech
    )
    if is_silent:
        return PreparedAudio(True, audio_duration_sec, raw_peak_dbfs, speech_sec, None)

    if speech_sec is not None:
        audio = speech_audio

    # 1. Chỉ normalize nhẹ nếu thực sự cần (dBFS quá thấp); headroom=3.0 tránh clipping
    if audio.dBFS < -30:
        audio = effects.normalize(audio, headroom=3.0)
    audio.export(wav_16k_path, format="wav")

    audio_for_asr = wav_16k_path

    # 2. DeepFilter (giảm ảo giác PhoWhisper)
    if deepfilter.df_model is not None and deepfilter.df_state is not None:
        try:
            deepfilter.enhance_wav(wav_16k_path, enhanced_wav_path)
            audio_for_asr = enhanced_wav_path
            print(f"🧹 [DeepFilter] Đã làm sạch nhiễu cho: {call_id}")
        except Exception as e:
            print(f"⚠️ [DeepFilter] Lỗi chạy khử nhiễu, dùng bản gốc: {e}")

    if SAVE_DEBUG_AUDIO:
        debug_path = os.path.join(TEMP_AUDIO_DIR, f"debug_{call_id}_{unique_suffix}.wav")
        shutil.copy(wav_16k_path, debug_path)
        print(f"💾 [DEBUG] Đã lưu: {debug_path}")

    return PreparedAudio(False, audio_duration_sec, raw_peak_dbfs, speech_sec, audio_for_asr)
