package com.utc2connect.config;

import com.corundumstudio.socketio.SocketIOClient;
import com.corundumstudio.socketio.SocketIOServer;
import com.utc2connect.entity.Report;
import com.utc2connect.repository.ReportRepository;
import com.utc2connect.repository.userRepository;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.util.concurrent.ConcurrentLinkedQueue;

@Component
public class SocketHandler {

    private final SocketIOServer server;
    private final ReportRepository reportRepository; // ✨ THÊM BIẾN NÀY

    private final ConcurrentLinkedQueue<SocketIOClient> waitingUsers = new ConcurrentLinkedQueue<>();
    private final java.util.concurrent.ConcurrentHashMap<java.util.UUID, String> activeRooms = new java.util.concurrent.ConcurrentHashMap<>();
    private final userRepository userRepo;
    private final java.util.concurrent.ConcurrentHashMap<String, Long> roomStartTimes = new java.util.concurrent.ConcurrentHashMap<>();
    private final java.util.concurrent.ConcurrentHashMap<String, Long> userLastReportTimes = new java.util.concurrent.ConcurrentHashMap<>();
    @Autowired
    public SocketHandler(SocketIOServer server, ReportRepository reportRepository,userRepository userRepo) { // ✨ CẬP NHẬT HÀM NÀY
        this.server = server;
        this.reportRepository = reportRepository;
        this.userRepo = userRepo;
    }

    @PostConstruct
    public void startServer() {
        // Sự kiện khi có người kết nối
        server.addConnectListener(client -> {
            System.out.println("User kết nối socket: " + client.getSessionId());
        });

        // Sự kiện khi ngắt kết nối
        server.addDisconnectListener(client -> {
            // Xóa khỏi hàng đợi (nếu đang chờ)
            waitingUsers.remove(client);

            // Dò trong sổ xem người này có đang trong phòng gọi nào không
            String roomID = activeRooms.remove(client.getSessionId());
            if (roomID != null) {
                // Nếu có, hét lên cho đối phương (người còn lại) biết
                server.getRoomOperations(roomID).sendEvent("peer_disconnected");
            }
        });

        // BƯỚC 3: XỬ LÝ HÀNG ĐỢI KẾT NỐI NGẪU NHIÊN
        server.addEventListener("join_matchmaking", String.class, (client, data, ackSender) -> {
            if (!waitingUsers.contains(client)) {
                waitingUsers.add(client);
            }

            // Nếu đủ 2 người trở lên thì bắt cặp
            if (waitingUsers.size() >= 2) {
                SocketIOClient peer1 = waitingUsers.poll();
                SocketIOClient peer2 = waitingUsers.poll();

                if (peer1 != null && peer2 != null) {
                    String roomID = "room_" + peer1.getSessionId() + "_" + peer2.getSessionId();
                    activeRooms.put(peer1.getSessionId(), roomID);
                    activeRooms.put(peer2.getSessionId(), roomID);
                    // Cho 2 người vào cùng 1 phòng ngẫu nhiên
                    peer1.joinRoom(roomID);
                    peer2.joinRoom(roomID);

                    // Gửi thông tin về cho 2 bên (Bên 1 chủ động gọi, Bên 2 đợi nhận)
                    peer1.sendEvent("matched", new MatchedPayload(roomID, true));
                    peer2.sendEvent("matched", new MatchedPayload(roomID, false));

                    System.out.println("Đã bắt cặp thành công phòng: " + roomID);
                    roomStartTimes.put(roomID, System.currentTimeMillis());
                }
            }
        });

        // BƯỚC 4: THIẾT LẬP LUỒNG BÁO HIỆU WEBRTC (SIGNALING)
        // Trung chuyển Lời mời (Offer)
        server.addEventListener("send_offer", WebRTCPayload.class, (client, data, ackSender) -> {
            server.getRoomOperations(data.getRoomID()).sendEvent("receive_offer", client, data);
        });

        // Trung chuyển Lời phản hồi (Answer)
        server.addEventListener("send_answer", WebRTCPayload.class, (client, data, ackSender) -> {
            server.getRoomOperations(data.getRoomID()).sendEvent("receive_answer", client, data);
        });

        // Trung chuyển Địa chỉ mạng (ICE Candidate)
        server.addEventListener("send_ice_candidate", WebRTCPayload.class, (client, data, ackSender) -> {
            server.getRoomOperations(data.getRoomID()).sendEvent("receive_ice_candidate", client, data);
        });
        server.addEventListener("disconnect_call", String.class, (client, roomID, ackSender) -> {
            // Tìm người còn lại trong phòng (ngoại trừ chính người vừa bấm nút thoát)
            server.getRoomOperations(roomID).getClients().forEach(c -> {
                if (!c.getSessionId().equals(client.getSessionId())) {
                    c.sendEvent("peer_disconnected"); // Chỉ gửi cho người còn lại
                }
            });

            // Sau đó mới cho chính người bấm nút thoát rời phòng
            client.leaveRoom(roomID);
            activeRooms.remove(client.getSessionId());
        });
        // BƯỚC 5: TRUNG CHUYỂN TIN NHẮN CHAT VĂN BẢN
        server.addEventListener("send_message", MessagePayload.class, (client, data, ackSender) -> {
            System.out.println("Nhận tin nhắn cho phòng: " + data.getRoomID() + " nội dung: " + data.getContent());
            // Gửi tiếp dữ liệu chat tới thiết bị còn lại trong phòng (loại trừ người gửi)
            server.getRoomOperations(data.getRoomID()).sendEvent("receive_message", client, data);
        });
        // BƯỚC 6: XỬ LÝ BÁO CÁO VI PHẠM (CẬP NHẬT LƯU FILE ẢNH)
        server.addEventListener("report_user", ReportPayload.class, (client, data, ackSender) -> {
            String reporterUsername = data.getReporterUsername();

            userRepo.findByUsername(reporterUsername).ifPresent(reporter -> {
                Report newReport = new Report();
                newReport.setRoomID(data.getRoomID());
                newReport.setReason(data.getReason());
                newReport.setReporter(reporter);
                newReport.setReporterUsername(reporter.getUsername());

                // ---- LOGIC XỬ LÝ ẢNH BASE64 SANG FILE VẬT LÝ ----
                String base64String = data.getScreenshotBase64();
                String savedImagePath = null;

                if (base64String != null && !base64String.isEmpty()) {
                    try {
                        // 1. Tách bỏ phần mào đầu "data:image/jpeg;base64,"
                        String[] parts = base64String.split(",");
                        String imageString = parts.length > 1 ? parts[1] : parts[0];

                        // 2. Giải mã chuỗi thành mảng byte nhị phân
                        byte[] imageBytes = java.util.Base64.getDecoder().decode(imageString);

                        // 3. Đặt tên file bằng UUID để đảm bảo không bao giờ trùng lặp
                        String fileName = "report_" + java.util.UUID.randomUUID().toString() + ".jpg";

                        // 4. Tạo thư mục lưu trữ (nằm ngay ngoài thư mục gốc dự án)
                        java.nio.file.Path uploadPath = java.nio.file.Paths.get("uploads", "reports");
                        java.nio.file.Files.createDirectories(uploadPath); // Tự động tạo nếu chưa có

                        // 5. Ghi file ra ổ cứng
                        java.nio.file.Path destinationFile = uploadPath.resolve(fileName);
                        java.nio.file.Files.write(destinationFile, imageBytes);

                        // 6. Tạo đường dẫn để lưu vào DB
                        savedImagePath = "/uploads/reports/" + fileName;

                    } catch (Exception e) {
                        System.out.println("❌ Lỗi khi giải mã và lưu ảnh: " + e.getMessage());
                    }
                }

                // Lưu đường dẫn ảnh vào entity
                newReport.setScreenshotUrl(savedImagePath);
                // ------------------------------------------------

                // Tìm và gán người bị tố cáo (nếu có)
                if (data.getReportedUsername() != null && !data.getReportedUsername().isEmpty()) {
                    userRepo.findByUsername(data.getReportedUsername()).ifPresent(reported -> {
                        newReport.setReporter(reported);
                        newReport.setReporterUsername(reported.getUsername());
                    });
                }

                reportRepository.save(newReport);
                System.out.println("✅ ĐÃ LƯU BÁO CÁO TỪ [" + reporter.getUsername() + "] KÈM ẢNH CHỨNG CỨ: " + savedImagePath);
            });
        });
        server.start();
    }

    @PreDestroy
    public void stopServer() {
        server.stop();
    }

    // Các class DTO bổ trợ để cấu trúc dữ liệu JSON gửi đi
    public static class MatchedPayload {
        private String roomID;
        private boolean isInitiator;

        public MatchedPayload(String roomID, boolean isInitiator) {
            this.roomID = roomID;
            this.isInitiator = isInitiator;
        }

        public String getRoomID() { return roomID; }
        public boolean getIsInitiator() { return isInitiator; }
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

        public String getRoomID() { return roomID; }
        public void setRoomID(String roomID) { this.roomID = roomID; }
        public String getContent() { return content; }
        public void setContent(String content) { this.content = content; }
    }
    @Data
    public static class ReportPayload {
        private String roomID;
        private String reason;
        private String reporterUsername;
        private String reportedUsername;
        private String screenshotBase64; // ✨ Nhận ảnh từ Frontend gửi lên
    }

}