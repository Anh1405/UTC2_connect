"""POST /moderate-audio  (kiểm duyệt cuộc gọi bằng giọng nói)"""
import asyncio
import os
import re
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile

from app.asr.finetuned import ft_pipe
from app.asr.guards import is_degenerate_transcript
from app.asr.hybrid import asr_executor, run_hybrid_asr
from app.asr.zipformer import asr_recognizer
from app.config import MAX_AUDIO_FILE_MB, TEMP_AUDIO_DIR, TOXIC_THRESHOLD, YOUTUBE_HALLUCINATIONS
from app.security import sanitize_id, verify_api_key
from app.services.audio_prep import prepare_audio
from app.services.report_store import (
    clean_old_evidence_files, extract_evidence_clip, save_call_report,
)
from app.text.scoring import deep_score_text

router = APIRouter()


def _remove_files(*paths: str) -> None:
    for p in paths:
        if os.path.exists(p):
            os.remove(p)


@router.post("/moderate-audio")
async def moderate_audio(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    call_id: str = Form(None),
    caller_id: str = Form("Unknown"),
    receiver_id: str = Form("Unknown"),
    _auth=Depends(verify_api_key)
):
    if ft_pipe is None and asr_recognizer is None:
        raise HTTPException(status_code=503, detail="Mô hình nhận dạng giọng nói (ASR) chưa sẵn sàng.")

    call_id = sanitize_id(call_id, fallback_prefix="call")
    _, original_ext = os.path.splitext(file.filename or "")
    safe_ext = original_ext if re.match(r"^\.[A-Za-z0-9]{1,5}$", original_ext or "") else ".webm"

    unique_suffix = uuid.uuid4().hex[:8]
    temp_file_path = os.path.join(TEMP_AUDIO_DIR, f"{call_id}_{unique_suffix}{safe_ext}")
    wav_16k_path = os.path.join(TEMP_AUDIO_DIR, f"{call_id}_{unique_suffix}_16k.wav")
    enhanced_wav_path = os.path.join(TEMP_AUDIO_DIR, f"{call_id}_{unique_suffix}_enhanced.wav")

    # 1. Lưu file upload (giới hạn dung lượng)
    max_bytes = MAX_AUDIO_FILE_MB * 1024 * 1024
    with open(temp_file_path, "wb") as buffer:
        total_written = 0
        while chunk := file.file.read(1024 * 1024):
            total_written += len(chunk)
            if total_written > max_bytes:
                buffer.close()
                _remove_files(temp_file_path)
                raise HTTPException(status_code=413, detail=f"File âm thanh vượt quá {MAX_AUDIO_FILE_MB}MB.")
            buffer.write(chunk)

    # 2. Tiền xử lý âm thanh (chuẩn hóa, VAD, DeepFilter)
    try:
        prep = prepare_audio(temp_file_path, wav_16k_path, enhanced_wav_path, call_id, unique_suffix)

        if prep.is_silent:
            print(f"🔇 [AUDIO] call={call_id} bị coi là im lặng — bỏ qua ASR.")
            save_call_report(call_id, caller_id, receiver_id, "", [])
            _remove_files(temp_file_path, wav_16k_path)
            return {
                "status": "success",
                "call_id": call_id,
                "is_toxic": False,
                "transcript": "",
                "violations": []
            }
    except Exception as e:
        _remove_files(temp_file_path, wav_16k_path, enhanced_wav_path)
        raise HTTPException(status_code=500, detail=f"Lỗi chuẩn hóa âm thanh: {str(e)}")

    # 3. ASR nặng chạy ở thread pool để không chặn event loop
    full_transcript = ""
    try:
        loop = asyncio.get_running_loop()
        full_transcript = await loop.run_in_executor(
            asr_executor,
            run_hybrid_asr,
            prep.asr_path,
            prep.duration_sec,
            prep.raw_peak_dbfs,
            prep.speech_sec
        )

        if (
            len(full_transcript.strip()) <= 1
            or full_transcript.strip() in ["<", ">", ".", ",", " "]
            or full_transcript.lower() in YOUTUBE_HALLUCINATIONS
        ):
            full_transcript = ""

        if is_degenerate_transcript(full_transcript, prep.duration_sec):
            print(f"⚠️ [ASR] Transcript bất thường, bỏ qua: '{full_transcript[:80]}...'")
            full_transcript = ""

    except Exception as e:
        _remove_files(temp_file_path, wav_16k_path, enhanced_wav_path)
        raise HTTPException(status_code=500, detail=f"Lỗi ASR: {str(e)}")

    print(f"📝 [ASR] call={call_id} | Transcript xử lý: '{full_transcript}'")

    # 4. Đánh giá độc hại
    toxic_segments = []
    has_violation = False

    if full_transcript:
        score = deep_score_text(full_transcript)
        if score > TOXIC_THRESHOLD:
            has_violation = True
            clip_name = extract_evidence_clip(wav_16k_path, 0.0, prep.duration_sec, call_id, 0)
            toxic_segments.append({
                "segment_index": 0,
                "start_time": 0.0,
                "end_time": prep.duration_sec,
                "text": full_transcript,
                "score": score,
                "evidence_clip": clip_name
            })

    # 5. Ghi báo cáo + dọn file
    save_call_report(call_id, caller_id, receiver_id, full_transcript, toxic_segments)
    _remove_files(temp_file_path, wav_16k_path, enhanced_wav_path)
    background_tasks.add_task(clean_old_evidence_files)

    return {
        "status": "success",
        "call_id": call_id,
        "is_toxic": has_violation,
        "transcript": full_transcript,
        "total_violations": len(toxic_segments),
        "violations": toxic_segments
    }
