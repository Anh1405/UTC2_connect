import { useState, useEffect } from 'react';
import socket from '../services/socket';
import { REPORT_REASONS } from '../config/reportReasons';
import useLatest from './useLatest';

// Tố cáo vi phạm: chụp ảnh bằng chứng, gửi biên bản qua socket
export default function useReport({ roomID, remoteVideoRef, remoteUsername, reporterUsername, onReportSent }) {
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReasonId, setReportReasonId] = useState(null);
  const [reportDetail, setReportDetail] = useState('');
  const [reportScreenshot, setReportScreenshot] = useState(null);
  const [reportStatus, setReportStatus] = useState('idle'); // idle | sending | done

  const statusRef = useLatest(reportStatus);
  const onReportSentRef = useLatest(onReportSent);

  // Kết quả từ server
  useEffect(() => {
    const handleReportResult = ({ success, message }) => {
      if (success) {
        setReportStatus('done');
        setTimeout(() => {
          setShowReportModal(false);
          onReportSentRef.current?.();
        }, 1100);
      } else {
        setReportStatus('idle');
        alert('❌ Gửi báo cáo thất bại: ' + (message || 'Vui lòng thử lại.'));
      }
    };
    socket.on('report_result', handleReportResult);
    return () => socket.off('report_result', handleReportResult);
  }, [onReportSentRef]);

  const handleOpenReport = () => {
    let base64Image = null;
    const remoteVideo = remoteVideoRef.current;
    if (remoteVideo && remoteVideo.videoWidth > 0) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = remoteVideo.videoWidth;
        canvas.height = remoteVideo.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(remoteVideo, 0, 0, canvas.width, canvas.height);
        base64Image = canvas.toDataURL('image/jpeg', 0.8);
      } catch (err) {
        console.error('❌ Lỗi khi chụp màn hình bằng chứng:', err);
      }
    }
    setReportScreenshot(base64Image);
    setReportReasonId(null);
    setReportDetail('');
    setReportStatus('idle');
    setShowReportModal(true);
  };

  const closeReport = () => setShowReportModal(false);

  const handleSubmitReport = () => {
    if (!reportReasonId) return;
    const reasonLabel = REPORT_REASONS.find((r) => r.id === reportReasonId)?.label;
    const finalReason = reportDetail.trim() ? `${reasonLabel} — ${reportDetail.trim()}` : reasonLabel;

    setReportStatus('sending');
    socket.emit('report_user', {
      roomID,
      reason: finalReason,
      reporterUsername,
      reportedUsername: remoteUsername,
      screenshotBase64: reportScreenshot,
    });

    // Quá 5 giây không có phản hồi thì báo lỗi
    setTimeout(() => {
      if (statusRef.current === 'sending') {
        setReportStatus('idle');
        alert('❌ Không nhận được phản hồi từ máy chủ. Vui lòng thử lại.');
      }
    }, 5000);
  };

  return {
    showReportModal,
    reportReasonId,
    setReportReasonId,
    reportDetail,
    setReportDetail,
    reportScreenshot,
    reportStatus,
    handleOpenReport,
    closeReport,
    handleSubmitReport,
  };
}
