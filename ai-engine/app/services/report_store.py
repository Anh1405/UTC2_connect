"""Lưu báo cáo cuộc gọi, cắt clip bằng chứng, dọn file cũ."""
import json
import os
import threading
import uuid
from datetime import datetime, timedelta

from pydub import AudioSegment

from app.config import (
    EVIDENCE_CLIP_PADDING_MS, EVIDENCE_DIR, EVIDENCE_RETENTION_DAYS, REPORTS_DIR,
)

report_lock = threading.Lock()

def clean_old_evidence_files():
    now = datetime.now()
    for folder in [EVIDENCE_DIR, REPORTS_DIR]:
        if not os.path.exists(folder):
            continue
        for fname in os.listdir(folder):
            fpath = os.path.join(folder, fname)
            if os.path.isfile(fpath):
                file_time = datetime.fromtimestamp(os.path.getmtime(fpath))
                if now - file_time > timedelta(days=EVIDENCE_RETENTION_DAYS):
                    try:
                        os.remove(fpath)
                    except Exception:
                        pass

def extract_evidence_clip(audio_path: str, start_sec: float, end_sec: float, call_id: str, seg_idx: int) -> str:
    audio = AudioSegment.from_file(audio_path)
    start_ms = max(0, int((start_sec * 1000) - EVIDENCE_CLIP_PADDING_MS))
    end_ms = min(len(audio), int((end_sec * 1000) + EVIDENCE_CLIP_PADDING_MS))
    
    clip = audio[start_ms:end_ms]
    out_filename = f"{call_id}_seg{seg_idx}_{uuid.uuid4().hex[:6]}.mp3"
    out_path = os.path.join(EVIDENCE_DIR, out_filename)
    clip.export(out_path, format="mp3")
    return out_filename

def save_call_report(call_id: str, caller_id: str, receiver_id: str, chunk_transcript: str, toxic_segments: list) -> dict:
    report_path = os.path.join(REPORTS_DIR, f"{call_id}.json")
    now_iso = datetime.now().isoformat()
    with report_lock:
        report = None
        if os.path.exists(report_path):
            try:
                with open(report_path, "r", encoding="utf-8") as f:
                    report = json.load(f)
            except Exception:
                report = None
        if not isinstance(report, dict):
            report = {
                "call_id": call_id,
                "caller_id": caller_id,
                "receiver_id": receiver_id,
                "timestamp": now_iso,
                "full_transcript": "",
                "is_toxic": False,
                "toxic_segments_count": 0,
                "violations": [],
                "chunks_count": 0,
            }
        report["chunks_count"] = report.get("chunks_count", 0) + 1
        report["last_updated"] = now_iso
        report["full_transcript"] = " ".join(
            t for t in [report.get("full_transcript", ""), chunk_transcript] if t
        ).strip()
        for seg in toxic_segments:
            report["violations"].append({**seg, "chunk_index": report["chunks_count"]})
        report["toxic_segments_count"] = len(report["violations"])
        report["is_toxic"] = report["toxic_segments_count"] > 0
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
    return report
