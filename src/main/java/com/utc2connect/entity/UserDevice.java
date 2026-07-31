package com.utc2connect.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "user_devices")
@Data
@NoArgsConstructor
public class UserDevice {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private String deviceId;

    private LocalDateTime lastUsedAt;

    public UserDevice(User user, String deviceId) {
        this.user = user;
        this.deviceId = deviceId;
        this.lastUsedAt = LocalDateTime.now();
    }
}