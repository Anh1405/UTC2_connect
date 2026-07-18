package com.utc2connect.repository;

import com.utc2connect.entity.Otp;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface otpRepository extends JpaRepository<Otp,String> {
    Optional<Otp> findFirstByEmailOrderByCreatedAtDesc(String email);
}
