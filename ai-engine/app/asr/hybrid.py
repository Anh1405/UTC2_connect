"""
Hybrid ASR Router (Confidence-Driven + Laptop DeepFilter-Drop Recovery):
- Acoustic Anchor: Zipformer (RNN-T/CTC - Nhanh, Zero-Hallucination, chạy CPU)
- Semantic Verifier: PhoWhisper Fine-tune (Seq2Seq - Chuẩn ngữ cảnh, chạy GPU)
- Laptop Recovery: Tự động đọc từ alt_wav_path (audio gốc trước DeepFilter) khi phát hiện
  DeepFilterNet3 xóa nhầm lời nói từ mic máy tính (speech_sec dài nhưng chỉ ra 0-1 từ).
"""

import logging
import os
import re
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import Any, Dict, List, Optional, Set, Tuple

from app.asr.finetuned import LOGPROB_FALLBACK, ft_pipe, run_ft_with_confidence
from app.asr.guards import (
    EXPLICIT_SWEAR_WORDS,
    asr_agreement,
    collapse_repetitions,
    is_suspicious,
    sounds_like_toxic,
)
from app.asr.zipformer import run_zipformer
from app.config import FT_TRUST, VITOSA_MIN_AGREEMENT

try:
    from app.asr.guards import _skeleton as _guard_skeleton  # type: ignore
except ImportError:
    _guard_skeleton = None

logger = logging.getLogger(__name__)

asr_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="asr_main")
_cross_check_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="asr_crosscheck")

CROSS_CHECK: bool = os.environ.get("HYBRID_CROSS_CHECK", "1") != "0"
CROSS_CHECK_TIMEOUT_SEC: float = float(os.environ.get("HYBRID_CROSS_CHECK_TIMEOUT", "3.0"))

LOGPROB_THRESHOLD: float = -0.85
CLEAN_OVERRIDE_MIN_LOGPROB: float = -0.55
MAX_NATURAL_WPS: float = 4.2
_LOGPROB_FALLBACK: float = LOGPROB_FALLBACK

# Hạ ngưỡng phát hiện Underfit xuống 1.05s để bắt ngay trường hợp Laptop nói 1.35s-2.26s mà chỉ ra 'alo'
UNDERFIT_MIN_SPEECH_SEC: float = 1.05
UNDERFIT_MIN_WORDS: int = 2
UNDERFIT_MIN_WPS: float = 1.1

WEAK_AUDIO_DBFS: float = -28.0
WEAK_AUDIO_DURATION_SEC: float = 1.5
STRONG_AUDIO_DBFS: float = -25.0
STRONG_AUDIO_SPEECH_SEC: float = 0.7
MIN_VALID_SPEECH_SEC: float = 0.50

FT_ANTI_HALLUCINATION_FLAGS: Dict[str, Any] = {
    "condition_on_previous_text": False,
    "no_speech_threshold": 0.6,
    "compression_ratio_threshold": 2.4,
    "logprob_threshold": -1.0,
}

CLEAN_WORDS: Set[str] = {
    "không", "chào", "alo", "ừ", "ủa", "ơ", "à", "anh", "em",
    "xin chào", "anh ơi", "cảm ơn", "vâng", "dạ",
    "đây", "ok", "đúng", "này", "vậy", "rồi", "ừm", "dạ vâng", "phải alo",
}

SAFE_TOKENS: Set[str] = {
    "a", "à", "ạ", "alo", "lô", "hello", "hi", "hey", "xin", "chào", "chiều",
    "vâng", "dạ", "ừ", "ừm", "ừa", "ok", "okay", "oke", "ơi", "ơ", "ủa",
    "anh", "em", "chị", "bạn", "cảm", "ơn", "không", "đây", "này", "vậy",
    "rồi", "đúng", "phải", "nghe", "rõ", "thấy", "nhé", "nha", "nhỉ",
}

DEEPFILTER_MASKED_CANDIDATES: Set[str] = {
    "cục clip", "cục clip ạ", "học đích", "con cạc", "con cắt", "con cặt",
    "công cạc", "công cắt", "con cả", "con cá", "con cạp", "còn cạp", "cục cạc",
    "cục cắt", "con phải", "con phải tự", "không phải", "không cần", "công cần",
    "một là", "một cao", "phải lồ",
}

_JUNK_ARTIFACTS: Set[str] = {"<", ">", ".", ",", "", " ", "<unk>", "[unk]"}


def _log_decision(msg: str) -> None:
    print(msg)
    logger.info(msg)


def _is_toxic_text(text: str) -> bool:
    if not text:
        return False
    return is_suspicious(text) or any(w in text for w in EXPLICIT_SWEAR_WORDS)


def _is_masked_toxic_candidate(text: str) -> bool:
    if not text:
        return False
    if text in DEEPFILTER_MASKED_CANDIDATES or sounds_like_toxic(text):
        return True
    return any(cand in text for cand in DEEPFILTER_MASKED_CANDIDATES)


def _skeleton(text: str) -> str:
    if not text:
        return ""
    if _guard_skeleton is not None:
        try:
            return str(_guard_skeleton(text))
        except Exception:
            pass

    s = text.strip().lower().replace("đ", "d")
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = unicodedata.normalize("NFC", s)
    s = re.sub(r"[^a-z0-9\s]", " ", s)

    norm_tokens: List[str] = []
    for tok in s.split():
        tok = re.sub(r"^(gi|r)", "d", tok)
        tok = re.sub(r"^tr", "ch", tok)
        tok = re.sub(r"^x", "s", tok)
        tok = re.sub(r"^(k|q)", "c", tok)
        tok = re.sub(r"^ngh", "ng", tok)
        tok = re.sub(r"^gh", "g", tok)
        tok = tok.replace("y", "i")
        norm_tokens.append(tok)
    return " ".join(norm_tokens)


def _levenshtein_distance(seq1: Any, seq2: Any) -> int:
    len1, len2 = len(seq1), len(seq2)
    if len1 == 0:
        return len2
    if len2 == 0:
        return len1

    prev_row = list(range(len2 + 1))
    for i, item1 in enumerate(seq1, start=1):
        curr_row = [i] + [0] * len2
        for j, item2 in enumerate(seq2, start=1):
            cost = 0 if item1 == item2 else 1
            curr_row[j] = min(
                prev_row[j] + 1,
                curr_row[j - 1] + 1,
                prev_row[j - 1] + cost,
            )
        prev_row = curr_row
    return prev_row[len2]


def _compute_phonetic_agreement(zip_text: str, vi_text: str) -> float:
    if not zip_text or not vi_text:
        return 0.0

    guard_agree = float(asr_agreement(zip_text, vi_text))
    skel_zip = _skeleton(zip_text)
    skel_vi = _skeleton(vi_text)
    if not skel_zip or not skel_vi:
        return guard_agree

    max_chars = max(len(skel_zip), len(skel_vi), 1)
    char_sim = 1.0 - (_levenshtein_distance(skel_zip, skel_vi) / max_chars)

    zip_tokens = skel_zip.split()
    vi_tokens = skel_vi.split()
    max_words = max(len(zip_tokens), len(vi_tokens), 1)
    word_sim = 1.0 - (_levenshtein_distance(zip_tokens, vi_tokens) / max_words)

    skeleton_sim = 0.7 * char_sim + 0.3 * word_sim
    return max(guard_agree, skeleton_sim)


def _detect_zip_underfit(word_count: int, speech_sec: Optional[float]) -> Tuple[bool, float]:
    """
    Phát hiện Zipformer (hoặc DeepFilterNet3) làm rớt chữ trên Mic Laptop:
    - Nếu VAD thấy tiếng người > 1.05s nhưng chỉ ra < 2 từ (ví dụ: 2.26s mà chỉ ra đúng chữ 'alo').
    - Hoặc mật độ WPS < 1.1 từ/giây.
    """
    if speech_sec is None or speech_sec <= 0.0:
        return False, 0.0

    wps = word_count / speech_sec
    if speech_sec >= UNDERFIT_MIN_SPEECH_SEC and (
        word_count < UNDERFIT_MIN_WORDS or wps < UNDERFIT_MIN_WPS
    ):
        return True, wps

    if speech_sec >= 0.55 and word_count == 0:
        return True, 0.0

    return False, wps


def _zip_looks_clean(
    text: str,
    near_toxic: bool,
    speech_sec: Optional[float] = None,
) -> bool:
    if near_toxic or not text or _is_masked_toxic_candidate(text):
        return False

    tokens = text.split()
    is_underfit, _ = _detect_zip_underfit(len(tokens), speech_sec)
    if is_underfit:
        return False

    if text in CLEAN_WORDS:
        return True

    return 0 < len(tokens) <= 5 and all(t in SAFE_TOKENS for t in tokens)


def _run_ft_guarded(wav_path: str) -> Tuple[str, float]:
    raw_text, avg_logprob = run_ft_with_confidence(
        wav_path,
        condition_on_previous_text=FT_ANTI_HALLUCINATION_FLAGS["condition_on_previous_text"],
        no_speech_threshold=FT_ANTI_HALLUCINATION_FLAGS["no_speech_threshold"],
        compression_ratio_threshold=FT_ANTI_HALLUCINATION_FLAGS["compression_ratio_threshold"],
        logprob_threshold=FT_ANTI_HALLUCINATION_FLAGS["logprob_threshold"],
    )
    clean_text = collapse_repetitions((raw_text or "").strip().lower())
    return clean_text, float(avg_logprob)


def _confirm_on_alt_audio(
    alt_wav_path: Optional[str],
    main_wav_path: str,
    main_vi_text: str = "",
    main_vi_logprob: float = -1.0,
) -> Tuple[bool, str]:
    if (
        not CROSS_CHECK
        or not alt_wav_path
        or alt_wav_path == main_wav_path
        or not os.path.exists(alt_wav_path)
    ):
        return True, main_vi_text

    t0 = time.time()
    try:
        future = _cross_check_executor.submit(_run_ft_guarded, alt_wav_path)
        alt_text, alt_logprob = future.result(timeout=CROSS_CHECK_TIMEOUT_SEC)

        logprob_valid = abs(alt_logprob - _LOGPROB_FALLBACK) > 1e-6
        logprob_ok = (not logprob_valid) or (alt_logprob >= LOGPROB_THRESHOLD)
        confirmed = bool(logprob_ok and _is_toxic_text(alt_text))

        _log_decision(
            f"🔎 [Cross-Check] {time.time() - t0:.2f}s | Audio gốc: '{alt_text}' "
            f"(LogProb: {alt_logprob:.2f}) -> {'XÁC NHẬN' if confirmed else 'KHÔNG xác nhận'}"
        )

        best_text = main_vi_text
        if confirmed and alt_text and alt_logprob > main_vi_logprob:
            best_text = alt_text

        return confirmed, best_text

    except FuturesTimeoutError:
        _log_decision(
            f"⚠️ [Cross-Check Timeout] Quá hạn {CROSS_CHECK_TIMEOUT_SEC:.1f}s -> "
            f"Hủy kết quả nghi vấn để tránh nghẽn pipeline"
        )
        return False, main_vi_text
    except Exception as exc:
        _log_decision(f"⚠️ [Cross-Check Error] Lỗi kiểm chứng chéo ({exc}) -> Bỏ qua")
        return True, main_vi_text


def _recover_laptop_speech_from_raw(
    alt_wav_path: Optional[str],
    main_wav_path: str,
    speech_sec: Optional[float],
) -> Tuple[str, float]:
    """
    Khi DeepFilterNet3 xóa nhầm giọng nói từ Mic Laptop (khiến wav_path bị rỗng hoặc chỉ còn 1 từ),
    chạy nhận diện trên `alt_wav_path` (audio gốc chưa qua DeepFilter nhưng đã có DSP High-Pass + Compressor).
    """
    if not alt_wav_path or alt_wav_path == main_wav_path or not os.path.exists(alt_wav_path):
        return "", -999.0

    try:
        t0 = time.time()
        # 1. Thử Zipformer trên audio gốc trước (rất nhanh ~30ms)
        raw_zip = collapse_repetitions((run_zipformer(alt_wav_path) or "").strip().lower())
        # 2. Chạy PhoWhisper kèm DSP Laptop Enhancer trên audio gốc
        future = _cross_check_executor.submit(_run_ft_guarded, alt_wav_path)
        raw_vi, raw_lp = future.result(timeout=CROSS_CHECK_TIMEOUT_SEC)

        _log_decision(
            f"💻 [Laptop Raw Recovery] {time.time() - t0:.2f}s | RawZip: '{raw_zip}' | "
            f"RawPhoWhisper: '{raw_vi}' (LogProb: {raw_lp:.2f})"
        )

        # Nếu cả 2 cùng ra kết quả hoặc PhoWhisper có LogProb tốt
        lp_valid = abs(raw_lp - _LOGPROB_FALLBACK) > 1e-6
        lp_good = (not lp_valid) or (raw_lp >= -0.55)
        raw_words = len(raw_vi.split())
        max_reasonable_words = max(int((speech_sec or 1.5) * 4.2), 4)

        if raw_vi and lp_good and raw_words <= max_reasonable_words:
            # Nếu là câu toxic trên audio gốc -> cần Zipformer audio gốc cũng toxic/near-toxic hoặc đồng thuận >= 0.45
            if _is_toxic_text(raw_vi):
                if _is_toxic_text(raw_zip) or _is_masked_toxic_candidate(raw_zip) or (
                    _compute_phonetic_agreement(raw_zip, raw_vi) >= 0.45
                ):
                    return raw_vi, raw_lp
            else:
                return raw_vi, raw_lp

        if raw_zip and len(raw_zip.split()) > 1:
            return raw_zip, -0.20

    except Exception as exc:
        _log_decision(f"⚠️ [Laptop Raw Recovery] Lỗi đọc audio gốc: {exc}")

    return "", -999.0


def run_hybrid_asr(
    wav_path: str,
    audio_duration: float,
    peak_dbfs: float,
    speech_sec: Optional[float] = None,
    alt_wav_path: Optional[str] = None,
) -> str:
    # ==========================================
    # 1. FAST PATH: Zipformer Acoustic Anchor (CPU)
    # ==========================================
    t0 = time.time()
    try:
        zip_text = run_zipformer(wav_path)
    except Exception as exc:
        _log_decision(f"⚠️ [Zipformer Exception] Lỗi chạy Zipformer: {exc}")
        zip_text = ""

    zip_raw = (zip_text or "").strip().lower()
    if zip_raw in _JUNK_ARTIFACTS:
        zip_raw = ""

    zip_clean = collapse_repetitions(zip_raw)
    zip_words = zip_clean.split()
    zip_word_count = len(zip_words)

    zip_is_toxic = _is_toxic_text(zip_clean)
    zip_near_toxic = (not zip_is_toxic) and _is_masked_toxic_candidate(zip_clean)
    zip_underfit, wps = _detect_zip_underfit(zip_word_count, speech_sec)
    zip_looks_clean = _zip_looks_clean(zip_clean, zip_near_toxic, speech_sec=speech_sec)

    _log_decision(
        f"⏱️ [Zipformer] {time.time() - t0:.3f}s | Raw: '{zip_clean}' | "
        f"Words: {zip_word_count} | WPS: {wps:.2f} | Underfit: {zip_underfit}"
    )

    if zip_underfit:
        _log_decision(
            f"🧐 [Zipformer Underfit] VAD phát hiện {speech_sec:.2f}s tiếng người nhưng Zipformer "
            f"chỉ ra {zip_word_count} từ ('{zip_clean}', WPS={wps:.2f}) -> Chuyển PhoWhisper thẩm định"
        )

    # ==========================================
    # 2. SHORT-CIRCUIT: Thoát sớm (< 50ms) nếu an toàn rõ ràng
    # ==========================================
    need_verify = (
        zip_is_toxic
        or zip_near_toxic
        or zip_underfit
        or (not zip_clean)
        or (1 <= zip_word_count <= 3 and not zip_looks_clean)
    )

    if not need_verify:
        _log_decision(f"🚀 [Short-Circuit] Zipformer sạch & rõ ràng -> Trả về ngay: '{zip_clean}'")
        return zip_clean

    # ==========================================
    # 3. SLOW PATH: PhoWhisper Fine-tune Thẩm định (GPU)
    # ==========================================
    t1 = time.time()
    try:
        vi_clean, vi_avg_logprob = _run_ft_guarded(wav_path)
    except Exception as exc:
        _log_decision(f"⚠️ [PhoWhisper Exception] Lỗi chạy PhoWhisper ({exc}) -> Giữ Zipformer: '{zip_clean}'")
        return zip_clean

    _log_decision(
        f"⏱️ [PhoWhisper] {time.time() - t1:.3f}s | Raw: '{vi_clean}' | LogProb: {vi_avg_logprob:.2f}"
    )

    # ==========================================
    # 3.5. LAPTOP DEEPFILTER-DROP RECOVERY
    # Nếu mic Laptop bị DeepFilterNet3 xóa mất tiếng (khiến cả Zipformer và PhoWhisper trên wav_path
    # đều bị cụt <= 1 từ dù VAD thấy tiếng người >= 1.05s, hoặc rơi vào từ nghi vấn bị mất âm cuối),
    # khôi phục trực tiếp từ `alt_wav_path` (audio gốc trước DeepFilter)!
    # ==========================================
    vi_word_count = len(vi_clean.split()) if vi_clean else 0
    deepfilter_killed_laptop_voice = (
        zip_underfit and vi_word_count <= 1
    ) or (
        not _is_toxic_text(vi_clean)
        and not zip_is_toxic
        and (zip_near_toxic or _is_masked_toxic_candidate(vi_clean))
    )

    if deepfilter_killed_laptop_voice and alt_wav_path:
        rec_text, rec_lp = _recover_laptop_speech_from_raw(alt_wav_path, wav_path, speech_sec)
        if rec_text and len(rec_text.split()) >= max(vi_word_count, zip_word_count):
            vi_clean = rec_text
            vi_avg_logprob = rec_lp
            vi_word_count = len(vi_clean.split())

    if not vi_clean:
        return zip_clean

    vi_is_toxic = _is_toxic_text(vi_clean)
    vi_wps = (vi_word_count / speech_sec) if (speech_sec and speech_sec > 0) else 0.0

    # Mic laptop thường có peak_dbfs thấp hơn điện thoại, nên khi có speech_sec rõ ràng (>= 0.7s)
    # và peak_dbfs >= -32.0 dB thì vẫn coi là tín hiệu hợp lệ
    audio_weak = (peak_dbfs < -32.0) or (audio_duration < 1.2 and peak_dbfs < WEAK_AUDIO_DBFS)
    audio_strong = (peak_dbfs >= -29.0) and (
        speech_sec is None or speech_sec >= STRONG_AUDIO_SPEECH_SEC
    )

    # ==========================================
    # 4. HỆ THỐNG CHỐT CHẶN (CONFIDENCE GUARDRAILS)
    # ==========================================

    # [Guard 0: LogProb Low]
    logprob_valid = abs(vi_avg_logprob - _LOGPROB_FALLBACK) > 1e-6
    if logprob_valid and vi_avg_logprob < LOGPROB_THRESHOLD:
        _log_decision(
            f"🛑 [Guard 0: LogProb Low] PhoWhisper LogProb thấp ({vi_avg_logprob:.2f} < {LOGPROB_THRESHOLD}) "
            f"-> Hủy '{vi_clean}', giữ Zipformer: '{zip_clean}'"
        )
        return zip_clean

    # [Guard 1: Weak Audio]
    if vi_is_toxic and audio_weak and not zip_is_toxic:
        _log_decision(
            f"🛑 [Guard 1: Weak Audio] Bỏ PhoWhisper toxic '{vi_clean}' do âm thanh yếu "
            f"(dBFS={peak_dbfs:.1f}, duration={audio_duration:.2f}s) -> Giữ Zipformer: '{zip_clean}'"
        )
        return zip_clean

    # [Guard 2: Zip Clean Override]
    if zip_looks_clean and not zip_underfit and vi_is_toxic:
        _log_decision(
            f"🛑 [Guard 2: Zip Clean Override] Zipformer '{zip_clean}' sạch, "
            f"PhoWhisper ảo giác '{vi_clean}' -> Giữ Zipformer"
        )
        return zip_clean

    # [Guard 3: Short/Weak Speech Hallucination]
    if vi_is_toxic and not zip_is_toxic and not zip_near_toxic:
        if (vi_word_count <= 3 and audio_duration < 1.5) or (
            speech_sec is not None and speech_sec < MIN_VALID_SPEECH_SEC
        ):
            _log_decision(
                f"🛑 [Guard 3: Short/Weak Speech] Chặn PhoWhisper ảo giác từ ngắn/yếu: '{vi_clean}' "
                f"(Audio: {audio_duration:.1f}s, speech={speech_sec}) -> Giữ Zipformer: '{zip_clean}'"
            )
            return zip_clean

    # [Guard 5: Dual Toxic / Near-Toxic Consensus]
    if vi_is_toxic and zip_is_toxic:
        _log_decision(f"🔄 [Guard 5: Dual Toxic] Cả 2 ASR cùng phát hiện toxic -> Chọn PhoWhisper: '{vi_clean}'")
        return vi_clean

    if vi_is_toxic and zip_near_toxic and not audio_weak:
        _log_decision(
            f"🔄 [Guard 5: Near-Toxic Match] Zipformer near-miss '{zip_clean}' + "
            f"PhoWhisper toxic -> Chọn PhoWhisper: '{vi_clean}'"
        )
        return vi_clean

    agree = _compute_phonetic_agreement(zip_clean, vi_clean)
    has_agreement = agree >= VITOSA_MIN_AGREEMENT
    underfit_and_strong = (zip_underfit or not zip_clean) and audio_strong

    # [Guard 6 & Guard 4: Phonetic Agreement + Cross-Check cho Toxic đơn độc]
    if vi_is_toxic and not zip_is_toxic:
        if not audio_weak and (speech_sec is None or speech_sec >= MIN_VALID_SPEECH_SEC) and (
            has_agreement or underfit_and_strong or (FT_TRUST and ft_pipe is not None)
        ):
            confirmed, best_toxic_text = _confirm_on_alt_audio(
                alt_wav_path, wav_path, main_vi_text=vi_clean, main_vi_logprob=vi_avg_logprob
            )
            if confirmed:
                _log_decision(
                    f"🔄 [Guard 4 & 6: Verified Override] Chấp nhận PhoWhisper: '{best_toxic_text}' "
                    f"(Zipformer: '{zip_clean}', agreement={agree:.2f}, underfit_strong={underfit_and_strong})"
                )
                return best_toxic_text

            _log_decision(
                f"🛑 [Guard 4: Cross-Check Failed] PhoWhisper toxic '{vi_clean}' không được audio gốc "
                f"xác nhận -> Giữ Zipformer: '{zip_clean}'"
            )
            return zip_clean

        _log_decision(
            f"🛑 [Guard 6: Low Agreement] Bác bỏ PhoWhisper toxic đơn độc: '{vi_clean}' "
            f"(Zipformer: '{zip_clean}', agreement={agree:.2f} < {VITOSA_MIN_AGREEMENT}) -> Giữ Zipformer"
        )
        return zip_clean

    # ==========================================
    # 5. ĐỒNG THUẬN CÂU SẠCH & KHÔI PHỤC CÂU LAPTOP (REDUCING WER)
    # ==========================================
    if not vi_is_toxic:
        if has_agreement:
            _log_decision(
                f"✅ [Guard 6: Clean WER Reduction] Chuẩn hóa từ bằng PhoWhisper: '{vi_clean}' "
                f"(Zipformer: '{zip_clean}', agreement={agree:.2f})"
            )
            return vi_clean

        logprob_strong = (not logprob_valid) or (vi_avg_logprob >= CLEAN_OVERRIDE_MIN_LOGPROB)
        wps_natural = (vi_wps <= MAX_NATURAL_WPS) and (
            vi_word_count <= max(int((speech_sec or 1.0) * 4.2), 4)
        )

        if underfit_and_strong and logprob_strong and wps_natural:
            _log_decision(
                f"✅ [Guard 6: Laptop Underfit Rescue] Khôi phục câu nói bằng PhoWhisper: '{vi_clean}' "
                f"(Zipformer: '{zip_clean}', LogProb={vi_avg_logprob:.2f}, WPS={vi_wps:.2f})"
            )
            return vi_clean
        elif underfit_and_strong:
            _log_decision(
                f"🛑 [Guard 6: Block Clean Hallucination] Chặn PhoWhisper bịa câu dài khi Underfit: '{vi_clean}' "
                f"(LogProb={vi_avg_logprob:.2f}, WPS={vi_wps:.2f}, words={vi_word_count}) -> Giữ Zipformer: '{zip_clean}'"
            )

    return zip_clean if zip_clean else (vi_clean if not vi_is_toxic else "")