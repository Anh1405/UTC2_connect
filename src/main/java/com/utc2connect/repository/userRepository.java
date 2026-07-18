package com.utc2connect.repository;

import com.utc2connect.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface userRepository extends JpaRepository<User,String> {
    Optional<User> findByEmail(String email);
    Optional<User> findByUsername(String username);
}
