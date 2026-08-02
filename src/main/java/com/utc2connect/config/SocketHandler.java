package com.utc2connect.config;

import com.corundumstudio.socketio.SocketIOClient;
import com.corundumstudio.socketio.SocketIOServer;
import com.utc2connect.entity.Report;
import com.utc2connect.entity.User;
import com.utc2connect.repository.ReportRepository;
import com.utc2connect.repository.userRepository;
import com.utc2connect.security.MessageRateLimiter;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import com.utc2connect.service.ModerationService;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;

@Component
public class SocketHandler {

    private final SocketIOServer server;
    private final ReportRepository reportRepository;
    private final userRepository userRepo;
    private final MessageRateLimiter rateLimiter; // 👈 1. Đã khai báo

    // Hàng đợi matchmaking
    private final ConcurrentLinkedQueue<SocketIOClient> waitingUsers = new ConcurrentLinkedQueue<>();

    // Mapping
    private final ConcurrentHashMap<UUID, String> sessionUsernames = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<UUID, String> activeRooms = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Long> roomStartTimes = new ConcurrentHashMap<>();
 Update-new-code-04
    private final ModerationService moderationService;

    @Autowired
    public SocketHandler(SocketIOServer server,
                         ReportRepository reportRepository,
                         userRepository userRepo,
 Update-new-code-04
                         MessageRateLimiter rateLimiter,
                         ModerationService moderationService) { // 👈 THÊM PARAMETER NÀY

                         MessageRateLimiter rateLimiter) { // 👈 2. Đã tiêm RateLimiter vào Constructor
        this.server = server;
        this.reportRepository = reportRepository;
        this.userRepo = userRepo;
        this.rateLimiter = rateLimiter;
 Update-new-code-04
        this.moderationService = moderationService; // 👈 GÁN GIÁ TRỊ VÀO ĐÂY

    }

    @PostConstruct
    public void startServer() {
        // ==================== CONNECT / DISCONNECT ====================
        server.addConnectListener(client -> {
            System.out.println("User connected: " + client.getSessionId());
        });

        server.addDisconnectListener(client -> {
            cleanupClient(client);
        });

        // ==================== MATCHMAKING ====================
        server.addEventListener("join_matchmaking", String.class, (client, username, ackSender) -> {
            sessionUsernames.put(client.getSessionId(), username);

            // Xóa khỏi hàng đợi cũ nếu có (tránh duplicate)
            waitingUsers.removeIf(c -> c.getSessionId().equals(client.getSessionId()));

            if (!waitingUsers.contains(client)) {
                waitingUsers.add(client);
                System.out.println("👤 " + username + " joined matchmaking queue. Size: " + waitingUsers.size());
            }

            tryMatch();
        });

        // ==================== LEAVE MATCHMAKING ====================
        server.addEventListener("leave_matchmaking", String.class, (client, username, ackSender) -> {
            waitingUsers.remove(client);
            System.out.println("🚪 " + username + " left matchmaking queue.");
        });

        // ==================== DISCONNECT CALL ====================
        server.addEventListener("disconnect_call", String.class, (client, roomID, ackSender) -> {
            handleDisconnectCall(client, roomID);
        });

        // ==================== WEBRTC SIGNALING ====================
        server.addEventListener("send_offer", WebRTCPayload.class,
                (client, data, ack) -> server.getRoomOperations(data.getRoomID()).sendEvent("receive_offer", client, data));
 Update-new-code-04

        server.addEventListener("send_answer", WebRTCPayload.class,
                (client, data, ack) -> server.getRoomOperations(data.getRoomID()).sendEvent("receive_answer", client, data));

        server.addEventListener("send_ice_candidate", WebRTCPayload.class,
                (client, data, ack) -> server.getRoomOperations(data.getRoomID()).sendEvent("receive_ice_candidate", client, data));

        // ==================== CHAT (ĐÃ TÍCH HỢP CHỐNG SPAM) ====================
        server.addEventListener("send_message", MessagePayload.class, (client, data, ack) -> {
            // Lấy username của client đang gửi tin (nếu chưa có thì lấy tạm SessionID)
            String username = sessionUsernames.getOrDefault(client.getSessionId(), client.getSessionId().toString());
            String tempId = data.getTempId() == null ? "" : data.getTempId();

            // 🛑 BẢO MẬT LỚP 1: Kiểm tra xem user có đang spam quá 5 tin/3s hay không
            if (!rateLimiter.isAllowed(username)) {
                System.out.println("⚠️ Phát hiện Spam từ user [" + username + "]");
                // 🔄 Gửi kèm tempId để Frontend gỡ đúng tin nhắn vừa hiển thị lạc quan (Optimistic UI),
                // tránh trường hợp người gửi vẫn thấy tin nhắn "đã gửi" dù thực chất bị chặn tại Server.
                client.sendEvent("message_blocked", Map.of(
                        "tempId", tempId,
                        "reason", "RATE_LIMIT",
                        "message", "Bạn đang gửi tin nhắn quá nhanh! Vui lòng đợi chút."
                ));
                return; // Chặn không cho gửi tin nhắn vào phòng
            }

            // 🛑 BẢO MẬT LỚP 2: KIỂM DUYỆT AI NGỮ CẢNH (Content Moderation)
            // Chỉ kiểm tra nếu type là "text" (Bỏ qua nếu type là "gif" hoặc "image")
            if ("text".equals(data.getType())) {
                String content = data.getContent();

                // 🔒 FAIL-CLOSED: moderate() trả về 3 trạng thái rõ ràng thay vì boolean cũ,
                // để phân biệt "nội dung vi phạm" với "OpenAI đang lỗi/hết quota" (429...).
                ModerationService.ModerationResult result = moderationService.moderate(content);

                if (result == ModerationService.ModerationResult.BLOCKED_TOXIC) {
                    System.out.println("🛑 AI chặn tin nhắn tiêu cực/độc hại từ [" + username + "]: " + content);
                    client.sendEvent("message_blocked", Map.of(
                            "tempId", tempId,
                            "reason", "TOXIC",
                            "message", "Tin nhắn của bạn bị giữ lại vì có dấu hiệu vi phạm quy tắc ứng xử."
                    ));
                    return; // Dừng thực thi, KHÔNG broadcast tin nhắn sang cho hành khách kia
                }

                if (result == ModerationService.ModerationResult.SERVICE_UNAVAILABLE) {
                    // Trước đây lỗi gọi OpenAI (429/timeout...) sẽ bị coi là "an toàn" và cho gửi thẳng (fail-open).
                    // Giờ mặc định CHẶN tạm khi không kiểm duyệt được, an toàn hơn là cho qua bừa.
                    System.out.println("🛑 Hệ thống kiểm duyệt tạm thời không khả dụng, chặn tạm tin nhắn từ [" + username + "]");
                    client.sendEvent("message_blocked", Map.of(
                            "tempId", tempId,
                            "reason", "SERVICE_UNAVAILABLE",
                            "message", "Hệ thống kiểm duyệt đang quá tải, vui lòng thử gửi lại sau ít phút."
                    ));
                    return;
                }
            }

            // ✅ NẾU QUA ĐƯỢC 2 LỚP BẢO MẬT -> Gửi tin nhắn đến các client trong phòng


        server.addEventListener("send_answer", WebRTCPayload.class,
                (client, data, ack) -> server.getRoomOperations(data.getRoomID()).sendEvent("receive_answer", client, data));

        server.addEventListener("send_ice_candidate", WebRTCPayload.class,
                (client, data, ack) -> server.getRoomOperations(data.getRoomID()).sendEvent("receive_ice_candidate", client, data));

        // ==================== CHAT (ĐÃ TÍCH HỢP CHỐNG SPAM) ====================
        server.addEventListener("send_message", MessagePayload.class, (client, data, ack) -> {
            // Lấy username của client đang gửi tin (nếu chưa có thì lấy tạm SessionID)
            String username = sessionUsernames.getOrDefault(client.getSessionId(), client.getSessionId().toString());

            // 🛑 BẢO MẬT: Kiểm tra xem user có đang spam quá 5 tin/3s hay không
            if (!rateLimiter.isAllowed(username)) {
                System.out.println("⚠️ Phát hiện Spam từ user [" + username + "]");
                // Gửi thông báo cảnh báo riêng cho chính user đó
                client.sendEvent("spam_warning", "Cảnh báo: Bạn đang gửi tin nhắn quá nhanh! Vui lòng đợi chút.");
                return; // Chặn không cho gửi tin nhắn vào phòng
            }

            // Nếu hợp lệ -> Gửi tin nhắn đến các client trong phòng
            server.getRoomOperations(data.getRoomID()).sendEvent("receive_message", client, data);
        });

        server.addEventListener("send_filter", FilterPayload.class, (client, data, ack) -> {
            for (SocketIOClient c : server.getRoomOperations(data.getRoomID()).getClients()) {
                if (!c.getSessionId().equals(client.getSessionId())) {
                    c.sendEvent("receive_filter", data);
                }
            }
        });

        // ==================== BÁO CÁO VI PHẠM ====================
        server.addEventListener("report_user", ReportPayload.class, (client, data, ackSender) -> {
            String reporterUsername = data.getReporterUsername();
            var reporterOpt = userRepo.findByUsername(reporterUsername);

            if (reporterOpt.isEmpty()) {
                client.sendEvent("report_result", Map.of("success", false, "message", "Không xác định được tài khoản của bạn."));
                return;
            }

            User reporter = reporterOpt.get();
            Report newReport = new Report();
            newReport.setRoomID(data.getRoomID());
            newReport.setReason(data.getReason());
            newReport.setReporter(reporter);
            newReport.setReporterUsername(reporter.getUsername());

            // LOGIC XỬ LÝ ẢNH BASE64 SANG FILE VẬT LÝ
            String base64String = data.getScreenshotBase64();
            String savedImagePath = null;

            if (base64String != null && !base64String.isEmpty()) {
                try {
                    String[] parts = base64String.split(",");
                    String imageString = parts.length > 1 ? parts[1] : parts[0];

                    byte[] imageBytes = java.util.Base64.getDecoder().decode(imageString);
                    String fileName = "report_" + java.util.UUID.randomUUID().toString() + ".jpg";

                    java.nio.file.Path uploadPath = java.nio.file.Paths.get("uploads", "reports");
                    java.nio.file.Files.createDirectories(uploadPath);

                    java.nio.file.Path destinationFile = uploadPath.resolve(fileName);
                    java.nio.file.Files.write(destinationFile, imageBytes);

                    savedImagePath = "/uploads/reports/" + fileName;

                } catch (Exception e) {
                    System.out.println("❌ Lỗi khi giải mã và lưu ảnh: " + e.getMessage());
                }
            }

            newReport.setScreenshotUrl(savedImagePath);

            if (data.getReportedUsername() != null && !data.getReportedUsername().isEmpty()) {
                userRepo.findByUsername(data.getReportedUsername()).ifPresent(reported -> {
                    newReport.setReported(reported);
                    newReport.setReportedUsername(reported.getUsername());
                });
            }

            try {
                reportRepository.save(newReport);
                System.out.println("✅ ĐÃ LƯU BÁO CÁO TỪ [" + reporter.getUsername() + "]");
                client.sendEvent("report_result", Map.of("success", true, "message", "Đã lưu thành công"));
            } catch (Exception e) {
                System.out.println("❌ Lỗi khi lưu report vào DB: " + e.getMessage());
                client.sendEvent("report_result", Map.of("success", false, "message", "Lỗi hệ thống, vui lòng thử lại."));
            }
        });

        server.start();
    }

    // ==================== HÀM HỖ TRỢ ====================
    private void tryMatch() {
        while (waitingUsers.size() >= 2) {
            SocketIOClient peer1 = waitingUsers.poll();
            SocketIOClient peer2 = waitingUsers.poll();

            if (peer1 == null || peer2 == null) continue;

            String roomID = "room_" + UUID.randomUUID();

            activeRooms.put(peer1.getSessionId(), roomID);
            activeRooms.put(peer2.getSessionId(), roomID);

            peer1.joinRoom(roomID);
            peer2.joinRoom(roomID);

            String user1 = sessionUsernames.get(peer1.getSessionId());
            String user2 = sessionUsernames.get(peer2.getSessionId());

            peer1.sendEvent("matched", new MatchedPayload(roomID, true, user2));
            peer2.sendEvent("matched", new MatchedPayload(roomID, false, user1));

            roomStartTimes.put(roomID, System.currentTimeMillis());
            System.out.println("✅ Matched: " + user1 + " vs " + user2);
        }
    }

    private void handleDisconnectCall(SocketIOClient client, String roomID) {
        if (roomID == null) return;

        server.getRoomOperations(roomID).getClients().forEach(c -> {
            if (!c.getSessionId().equals(client.getSessionId())) {
                c.sendEvent("peer_disconnected");
            }
        });

        client.leaveRoom(roomID);
        activeRooms.remove(client.getSessionId());
        waitingUsers.remove(client);
    }

    private void cleanupClient(SocketIOClient client) {
        waitingUsers.remove(client);
        sessionUsernames.remove(client.getSessionId());
        String roomID = activeRooms.remove(client.getSessionId());
        if (roomID != null) {
            server.getRoomOperations(roomID).sendEvent("peer_disconnected");
        }
    }

    @PreDestroy
    public void stopServer() {
        server.stop();
    }

    // ==================== DTOs ====================
    public static class MatchedPayload {
        private String roomID;
        private boolean isInitiator;
        private String opponentUsername;

        public MatchedPayload(String roomID, boolean isInitiator, String opponentUsername) {
            this.roomID = roomID;
            this.isInitiator = isInitiator;
            this.opponentUsername = opponentUsername;
        }

        public String getRoomID() { return roomID; }
        public boolean getIsInitiator() { return isInitiator; }
        public String getOpponentUsername() { return opponentUsername; }
    }

    public static class WebRTCPayload {
        private String roomID;
        private Object offer;
        private Object answer;
        private Object candidate;

        public String getRoomID() { return roomID; }
        public void setRoomID(String roomID) { this.roomID = roomID; }
        public Object getOffer() { return offer; }
        public void setOffer(Object offer) { this.offer = offer; }
        public Object getAnswer() { return answer; }
        public void setAnswer(Object answer) { this.answer = answer; }
        public Object getCandidate() { return candidate; }
        public void setCandidate(Object candidate) { this.candidate = candidate; }
    }

    public static class MessagePayload {
        private String roomID;
        private String content;
        private String type; // 👈 Thêm dòng này
        private String tempId; // 👈 ID tạm phía Client, dùng để rollback UI khi tin nhắn bị chặn

        public String getRoomID() { return roomID; }
        public void setRoomID(String roomID) { this.roomID = roomID; }
        public String getContent() { return content; }
        public void setContent(String content) { this.content = content; }
        public String getType() { return type; } // 👈 Thêm getter
        public void setType(String type) { this.type = type; } // 👈 Thêm setter
        public String getTempId() { return tempId; }
        public void setTempId(String tempId) { this.tempId = tempId; }
    }

    @Data
    public static class ReportPayload {
        private String roomID;
        private String reason;
        private String reporterUsername;
        private String reportedUsername;
        private String screenshotBase64;
    }

    @Data
    public static class FilterPayload {
        private String roomID;
        private String filterType;
    }
}