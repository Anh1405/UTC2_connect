"""ASR chính: Gipformer/ZipFormer (sherpa-onnx, chạy CPU)."""
import os

import sherpa_onnx
import soundfile as sf

from app.config import (
    ASR_MODEL_DIR, ASR_PRECISION, ASR_DECODING,
    ASR_USE_HOTWORDS, ASR_HOTWORDS_FILE, ASR_HOTWORDS_SCORE,
)

print(f"⏳ [ASR] Đang tải ASR chính từ: {ASR_MODEL_DIR} ({ASR_PRECISION}, {ASR_DECODING})")

def _find_onnx(prefix: str) -> str:
    import glob
    int8 = sorted(glob.glob(f"{ASR_MODEL_DIR}/{prefix}*.int8.onnx"))
    fp32 = [f for f in sorted(glob.glob(f"{ASR_MODEL_DIR}/{prefix}*.onnx")) if ".int8." not in f]
    order = (int8 + fp32) if ASR_PRECISION == "int8" else (fp32 + int8)
    if not order:
        raise FileNotFoundError(f"Không thấy {prefix}*.onnx trong {ASR_MODEL_DIR}")
    return order[0]

def _build_zipformer(use_hotwords: bool):
    kwargs = dict(
        encoder=_find_onnx("encoder"),
        decoder=_find_onnx("decoder"),
        joiner=_find_onnx("joiner"),
        tokens=f"{ASR_MODEL_DIR}/tokens.txt",
        num_threads=4,
        sample_rate=16000,
        feature_dim=80,
        provider="cpu",
    )
    if not use_hotwords:
        return sherpa_onnx.OfflineRecognizer.from_transducer(decoding_method=ASR_DECODING, **kwargs)

    kwargs.update(
        decoding_method="modified_beam_search",
        max_active_paths=8,
        hotwords_file=ASR_HOTWORDS_FILE,
        hotwords_score=ASR_HOTWORDS_SCORE,
    )
    try:
        with open(f"{ASR_MODEL_DIR}/tokens.txt", encoding="utf-8") as f:
            is_bpe = any(line.startswith("▁") for line in f)
    except Exception:
        is_bpe = False
    bpe_model = f"{ASR_MODEL_DIR}/bpe.model"
    if is_bpe and os.path.exists(bpe_model):
        kwargs.update(modeling_unit="bpe", bpe_vocab=bpe_model)
    return sherpa_onnx.OfflineRecognizer.from_transducer(**kwargs)

asr_recognizer = None
try:
    if ASR_USE_HOTWORDS and os.path.exists(ASR_HOTWORDS_FILE):
        try:
            asr_recognizer = _build_zipformer(True)
            print(f"✅ [ASR] {os.path.basename(ASR_MODEL_DIR)} + hotwords ({ASR_HOTWORDS_FILE}, score={ASR_HOTWORDS_SCORE})")
        except Exception as e:
            print(f"⚠️ [ASR] Hotwords lỗi ({e}) — quay về greedy_search.")
            asr_recognizer = _build_zipformer(False)
            print(f"✅ [ASR] Tải {os.path.basename(ASR_MODEL_DIR)} (không hotword) thành công!")
    else:
        asr_recognizer = _build_zipformer(False)
        print(f"✅ [ASR] Tải {os.path.basename(ASR_MODEL_DIR)} thành công!")
except Exception as e:
    print(f"❌ [ASR] Lỗi khởi tạo ZipFormer: {e}")
    asr_recognizer = None

def run_zipformer(wav_path: str) -> str:
    """Nhận diện chính bằng ZipFormer."""
    if asr_recognizer is None:
        return ""
    try:
        samples, sample_rate = sf.read(wav_path, dtype="float32")
        if samples.ndim > 1:
            samples = samples.mean(axis=1)
        stream = asr_recognizer.create_stream()
        stream.accept_waveform(sample_rate, samples)
        asr_recognizer.decode_stream(stream)
        return stream.result.text.strip().lower()
    except Exception as e:
        print(f"⚠️ [ZipFormer] Lỗi: {e}")
        return ""
