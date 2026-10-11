"""Hybrid ASR: ZipFormer (nhanh) + PhoWhisper fine-tune (thẩm định) + các chốt chặn ảo giác."""
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from app.asr.finetuned import ft_pipe, run_ft_with_confidence
from app.asr.guards import (
    EXPLICIT_SWEAR_WORDS, asr_agreement, collapse_repetitions,
    is_suspicious, sounds_like_toxic,
)
from app.asr.zipformer import run_zipformer
from app.config import FT_TRUST, VITOSA_MIN_AGREEMENT

# BƯỚC 1.1: KHỞI TẠO EXECUTOR TOÀN CỤC (Thay thế asr_lock)
# ==============================================================================
# Giới hạn 2 worker xử lý đồng thời để tránh tràn VRAM/RAM trên RTX 3060 6GB
asr_executor = ThreadPoolExecutor(max_workers=2)

def run_hybrid_asr(wav_path: str, audio_duration: float, peak_dbfs: float,
                   speech_sec: Optional[float] = None) -> str:
    """
    Hybrid ASR Full-Guardrails + Short-Circuiting:
    - Vẫn giữ Fast-Path để trả kết quả ngay < 100ms cho câu sạch.
    - Giữ trọn vẹn tất cả logic đối soát, đồng thuận (agreement) và chốt chặn ảo giác từ bản gốc.
    - Thêm bộ lọc Log-Probability để loại bỏ triệt để ảo giác do nhiễu.
    """
    # ==========================================
    # 1. FAST PATH: ZipFormer (CPU)
    # ==========================================
    t0 = time.time()
    zip_text = run_zipformer(wav_path)
    zip_raw = (zip_text or "").strip().lower()
    
    if zip_raw in {"<", ">", ".", ",", "", " "}:
        zip_raw = ""

    zip_clean = collapse_repetitions(zip_raw)
    print(f"⏱️ [ZipFormer] {time.time()-t0:.2f}s | Raw: '{zip_clean}'")

    # Báo hiệu nghi vấn từ ZipFormer
    words = zip_clean.split()
    zip_is_toxic = is_suspicious(zip_clean) or any(w in zip_clean for w in EXPLICIT_SWEAR_WORDS)
    zip_near_toxic = (not zip_is_toxic) and sounds_like_toxic(zip_clean)

    CLEAN_WORDS = {
        "không", "chào", "alo", "ừ", "ủa", "ơ", "à", "anh", "em",
        "xin chào", "anh ơi", "cảm ơn", "vâng", "dạ",
        "đây", "ok", "đúng", "này", "vậy", "rồi", "ừm", "dạ vâng", "phải alo"
    }
    zip_looks_clean = (zip_clean in CLEAN_WORDS) and not zip_near_toxic

    # ==========================================
    # 2. SHORT-CIRCUIT: Cắt tầng sớm nếu chắc chắn an toàn
    # ==========================================
    # Nếu ZipFormer ra từ sạch rõ ràng và KHÔNG dính nghi vấn toxic -> Trả về ngay
    need_verify = (zip_is_toxic or zip_near_toxic or (not zip_clean) or (1 <= len(words) <= 3 and not zip_looks_clean))
    
    if not need_verify:
        print(f"🚀 [Short-Circuit] ZipFormer sạch & rõ ràng -> Trả về ngay: '{zip_clean}'")
        return zip_clean

    # ==========================================
    # 3. SLOW PATH: PhoWhisper Thẩm định (GPU)
    # ==========================================
    t1 = time.time()
    vi_clean, vi_avg_logprob = run_ft_with_confidence(wav_path)
    vi_clean = collapse_repetitions(vi_clean)
    print(f"⏱️ [PhoWhisper] {time.time()-t1:.2f}s | Raw: '{vi_clean}' | LogProb: {vi_avg_logprob:.2f}")

    vi_is_toxic = is_suspicious(vi_clean) or any(w in vi_clean for w in EXPLICIT_SWEAR_WORDS)

    # ==========================================
    # 4. FULL GUARDRAILS (Giữ nguyên toàn bộ logic cũ)
    # ==========================================
    
    # 🛑 GUARD 0: Lọc bằng Log-Probability (Mới bổ sung)
    LOGPROB_THRESHOLD = -0.85
    if vi_is_toxic and vi_avg_logprob < LOGPROB_THRESHOLD:
        print(f"🛑 [Block LogProb] PhoWhisper toxic nhưng log_prob quá thấp ({vi_avg_logprob:.2f} < {LOGPROB_THRESHOLD}) -> Bỏ PhoWhisper: '{zip_clean}'")
        return zip_clean

    # 🛑 GUARD 1: Tín hiệu âm thanh quá yếu
    audio_weak = peak_dbfs < -28 or audio_duration < 1.5
    if vi_is_toxic and audio_weak and not zip_is_toxic:
        print(f"⚠️ [Hybrid] Bỏ ViToSA/PhoWhisper toxic (audio yếu): '{vi_clean}'")
        return zip_clean

    # 🛑 GUARD 2: ZipFormer ra từ sạch rõ ràng mà PhoWhisper ra toxic / chênh lệch số từ lớn
    zip_word_count = len(words)
    vi_word_count = len(vi_clean.split())

    if zip_looks_clean and vi_is_toxic:
        if vi_word_count >= 2 or audio_duration < 2.0 or abs(zip_word_count - vi_word_count) >= 2:
            print(f"🛑 [Block Ảo Giác] ZipFormer ra từ sạch '{zip_clean}', PhoWhisper ảo giác thành '{vi_clean}' -> Giữ ZipFormer!")
            return zip_clean

    # 🛑 GUARD 3: PhoWhisper đứng MỘT MÌNH ra từ tục trên audio ngắn/yếu
    if vi_is_toxic and not zip_is_toxic and not zip_near_toxic:
        if (vi_word_count <= 3 and audio_duration < 2.0) or (speech_sec is not None and speech_sec < 0.55):
            print(f"🛑 [Block] Chặn PhoWhisper ảo giác từ ngắn/yếu: '{vi_clean}' (Audio: {audio_duration:.1f}s, speech={speech_sec})")
            return zip_clean

    # 🛑 GUARD 4: Tin PhoWhisper Fine-tune khi audio đủ rõ
    if (FT_TRUST and ft_pipe is not None and vi_is_toxic and not zip_is_toxic and not audio_weak
            and not zip_looks_clean and (speech_sec is None or speech_sec >= 0.55)):
        print(f"🔄 [Hybrid] Tin PhoWhisper fine-tune: '{vi_clean}' (ZipFormer: '{zip_clean}')")
        return vi_clean

    # 🛑 GUARD 5: Near-miss hoặc cả 2 cùng toxic
    if vi_is_toxic and zip_near_toxic and not audio_weak:
        print(f"🔄 [Hybrid] ZipFormer near-miss '{zip_clean}' + PhoWhisper toxic -> Chọn PhoWhisper: '{vi_clean}'")
        return vi_clean

    if vi_is_toxic and zip_is_toxic:
        print(f"🔄 [Hybrid] Cả 2 cùng toxic -> Chọn PhoWhisper: '{vi_clean}'")
        return vi_clean

    # 🛑 GUARD 6: Kiểm tra tỷ lệ đồng thuận (Sequence Agreement Ratio)
    if vi_is_toxic and not zip_is_toxic:
        agree = asr_agreement(zip_clean, vi_clean)
        audio_strong = peak_dbfs >= -25 and (speech_sec is None or speech_sec >= 0.7)
        if not audio_weak and (agree >= VITOSA_MIN_AGREEMENT or (not zip_clean and audio_strong)):
            print(f"🔄 [Hybrid] Chọn PhoWhisper: '{vi_clean}' (ZipFormer: '{zip_clean}', đồng thuận={agree:.2f})")
            return vi_clean
        print(f"⚠️ [Hybrid] PhoWhisper toxic đơn độc, nghi ảo giác -> Bỏ: '{vi_clean}' (ZipFormer: '{zip_clean}', đồng thuận={agree:.2f})")
        return zip_clean

    return zip_clean if zip_clean else (vi_clean if not vi_is_toxic else "")
