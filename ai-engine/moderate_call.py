"""
Công cụ CLI để test kiểm duyệt giọng nói cuộc gọi.
Gọi qua API /moderate-call (api.py phải đang chạy sẵn) — KHÔNG tự load model
để tránh chiếm VRAM 2 lần cùng lúc với api.py.

Cách dùng:
    python moderate_call.py path/to/cuoc_goi.wav
    python moderate_call.py path/to/cuoc_goi.wav --call-id test_001
"""

import sys
import requests

API_URL = "http://127.0.0.1:8000/moderate-call"


def moderate_call(audio_path: str, call_id: str = None):
    print(f"📤 Đang gửi {audio_path} tới API để kiểm duyệt...")
    print("   (Đảm bảo api.py đang chạy ở terminal khác: python api.py)\n")

    with open(audio_path, "rb") as f:
        files = {"audio": f}
        data = {"call_id": call_id} if call_id else {}
        try:
            response = requests.post(API_URL, files=files, data=data, timeout=600)
        except requests.exceptions.ConnectionError:
            print("❌ Không kết nối được API. Bạn đã chạy 'python api.py' ở terminal khác chưa?")
            sys.exit(1)

    if response.status_code != 200:
        print(f"❌ Lỗi từ API ({response.status_code}): {response.text}")
        sys.exit(1)

    report = response.json()

    print(f"===== KẾT QUẢ - {report['call_id']} =====\n")
    for seg in report["segments"]:
        mark = "🔴 TOXIC" if seg["is_toxic"] else "🟢 safe "
        time_str = ""
        if seg.get("start") is not None and seg.get("end") is not None:
            time_str = f"[{seg['start']:.1f}s-{seg['end']:.1f}s] "
        print(f"  {mark} {time_str}{seg['text']} (score={seg['toxic_score']:.4f})")

    print(f"\n📊 TỔNG KẾT: {report['toxic_count']}/{report['total_segments']} đoạn vi phạm.")
    if report["evidence_clips"]:
        print("🗂️  Clip bằng chứng đã lưu:")
        for clip in report["evidence_clips"]:
            print(f"   - {clip}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Cách dùng: python moderate_call.py <đường_dẫn_audio> [--call-id ten_id]")
        sys.exit(1)

    audio_path = sys.argv[1]
    call_id = None
    if "--call-id" in sys.argv:
        idx = sys.argv.index("--call-id")
        call_id = sys.argv[idx + 1]

    moderate_call(audio_path, call_id)
