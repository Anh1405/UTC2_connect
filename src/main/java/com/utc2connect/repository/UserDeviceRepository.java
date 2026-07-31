package com.utc2connect.repository;

import com.utc2connect.entity.User;
import com.utc2connect.entity.UserDevice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserDeviceRepository extends JpaRepository<UserDevice, Long> {
    boolean existsByUserAndDeviceId(User user, String deviceId);
    Optional<UserDevice> findByUserAndDeviceId(User user, String deviceId);
}