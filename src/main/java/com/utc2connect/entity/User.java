package com.utc2connect.entity;

import jakarta.persistence.*;
import lombok.Data;
import jakarta.persistence.Id;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDateTime;

@Entity
@Table(name= "users")
@Data
public class User {
    @Id
    @GeneratedValue
    @UuidGenerator
    private String id;
    @Column(unique = true,nullable = false)
    private String email;
    @Column(nullable = false)
    private String username;
    private String password;
    private String khoaNganh;
    private String namHoc;
    @Enumerated(EnumType.STRING)
    private UserStatus status = UserStatus.Active;
    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();
    @PreUpdate
    protected void onUpdate () {
        updatedAt = LocalDateTime.now();
    }
}
enum UserStatus {
    Active,
    Banned
}
