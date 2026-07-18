package com.utc2connect.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.time.LocalDateTime;

@Entity
@Table(name = "reports")
@Data
public class Report {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String roomID;
    private String reason;

    // LƯU TÊN CHO DỄ NHÌN TRONG DATABASE
    @Column(name = "reporter_username")
    private String reporterUsername;

    // KHÓA NGOẠI ĐỂ LƯU ID
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reporter_id", nullable = false)
    private User reporter;

    // Lưu người bị tố cáo (Reported) - Bạn nên bổ sung nếu trước đó chưa thêm
    @Column(name = "reported_username")
    private String reportedUsername;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reported_id", nullable = true)
    private User reported;

    // ✨ Chỉ giữ lại một cột duy nhất để lưu đường dẫn file ảnh
    @Column(name = "screenshot_url")
    private String screenshotUrl;

    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}