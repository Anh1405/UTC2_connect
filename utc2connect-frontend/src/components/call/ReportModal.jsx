import { REPORT_REASONS } from '../../config/reportReasons';

// Modal "Biên bản sự cố" - tố cáo hành khách
export default function ReportModal({ report }) {
  const {
    showReportModal,
    reportReasonId,
    setReportReasonId,
    reportDetail,
    setReportDetail,
    reportScreenshot,
    reportStatus,
    closeReport,
    handleSubmitReport,
  } = report;

  if (!showReportModal) return null;

  return (
    <div className="u2-report-overlay" onClick={() => reportStatus !== 'sending' && closeReport()}>
      <div className="u2-report-ticket" onClick={(e) => e.stopPropagation()}>
        {reportStatus === 'done' ? (
          <div className="u2-report-done">
            <div className="u2-report-done-icon">✅</div>
            <p className="u2-display" style={{ fontSize: 20 }}>
              ĐÃ TIẾP NHẬN
            </p>
            <p style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Cảm ơn bạn đã giúp UTC2 Connect an toàn hơn.</p>
          </div>
        ) : (
          <>
            <div className="u2-report-head">
              <span className="u2-mono" style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--amber)' }}>
                BIÊN BẢN SỰ CỐ
              </span>
              <h3 className="u2-display" style={{ margin: '2px 0 0', fontSize: 22, color: 'var(--paper)' }}>
                Tố cáo hành khách
              </h3>
              <button className="u2-report-close" onClick={closeReport}>
                ✕
              </button>
            </div>
            <div className="u2-report-body">
              {reportScreenshot && (
                <div className="u2-report-evidence">
                  <img src={reportScreenshot} alt="Bằng chứng" />
                  <span>📸 Ảnh chụp làm bằng chứng</span>
                </div>
              )}
              <p className="u2-label" style={{ marginTop: 4 }}>
                Lý do tố cáo
              </p>
              <div className="u2-report-reasons">
                {REPORT_REASONS.map((r) => (
                  <button
                    key={r.id}
                    className={`u2-reason-chip ${reportReasonId === r.id ? 'active' : ''}`}
                    onClick={() => setReportReasonId(r.id)}
                  >
                    <span>{r.icon}</span>
                    {r.label}
                  </button>
                ))}
              </div>
              <textarea
                className="u2-input"
                style={{ resize: 'none', marginTop: 10 }}
                rows={2}
                placeholder="Mô tả thêm (không bắt buộc)..."
                value={reportDetail}
                onChange={(e) => setReportDetail(e.target.value)}
              />
            </div>
            <div className="u2-report-footer">
              <button className="u2-btn ghost" onClick={closeReport}>
                Huỷ
              </button>
              <button className="u2-btn primary" disabled={!reportReasonId || reportStatus === 'sending'} onClick={handleSubmitReport}>
                {reportStatus === 'sending' ? 'Đang gửi...' : 'Gửi biên bản'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
