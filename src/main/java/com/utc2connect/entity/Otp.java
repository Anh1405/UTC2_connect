package com.utc2connect.entity;


import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDateTime;

@Entity
@Table(name ="Otps")
@Data
public class Otp {
    @Id
    @GeneratedValue
    @UuidGenerator
    private String id;
    @Column(nullable = false )
    private String email;
    @Column(nullable = false,length = 6)
    private String code;
    @Column(nullable = false)
    private LocalDateTime expiredAt;
    @Column(nullable = false)
    private boolean isUsed = false;
    private LocalDateTime createdAt= LocalDateTime.now();
}
