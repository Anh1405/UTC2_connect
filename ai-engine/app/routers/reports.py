"""GET /evidence/{filename}, /reports/{call_id}, /reports"""
import json
import os

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse

from app.config import EVIDENCE_DIR, REPORTS_DIR, SAFE_ID_PATTERN
from app.security import verify_api_key

router = APIRouter()

@router.get("/evidence/{filename}")
def get_evidence_clip(filename: str, _auth=Depends(verify_api_key)):
    if not SAFE_ID_PATTERN.match(filename) or ".." in filename:
        raise HTTPException(status_code=400, detail="Tên tệp không hợp lệ.")
    file_path = os.path.join(EVIDENCE_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Không tìm thấy tệp âm thanh bằng chứng.")
    return FileResponse(file_path, media_type="audio/mpeg", filename=filename)

@router.get("/reports/{call_id}")
def get_call_report(call_id: str, _auth=Depends(verify_api_key)):
    if not SAFE_ID_PATTERN.match(call_id) or ".." in call_id:
        raise HTTPException(status_code=400, detail="call_id không hợp lệ.")
    report_path = os.path.join(REPORTS_DIR, f"{call_id}.json")
    if not os.path.exists(report_path):
        raise HTTPException(status_code=404, detail="Không tìm thấy báo cáo cuộc gọi.")
    with open(report_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data

@router.get("/reports")
def list_call_reports(limit: int = Query(50, ge=1, le=200), _auth=Depends(verify_api_key)):
    reports = []
    if os.path.exists(REPORTS_DIR):
        files = sorted(
            [f for f in os.listdir(REPORTS_DIR) if f.endswith(".json")],
            key=lambda x: os.path.getmtime(os.path.join(REPORTS_DIR, x)),
            reverse=True
        )[:limit]
        
        for fname in files:
            fpath = os.path.join(REPORTS_DIR, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    reports.append(json.load(f))
            except Exception:
                pass
    return {"total": len(reports), "reports": reports}
