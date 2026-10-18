package com.utc2connect.controller;

import com.utc2connect.entity.User;
import com.utc2connect.repository.userRepository;
import com.utc2connect.service.OtpService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final userRepository userRepo;
    private final OtpService otpService;

    public UserController(userRepository userRepo, OtpService otpService) {
        this.userRepo = userRepo;
        this.otpService = otpService;
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(Authentication authentication) {
        return userRepo.findByUsername(authentication.getName())
                .map(user -> ResponseEntity.ok(toPublic(user)))
                .orElseGet(() -> ResponseEntity.badRequest().body(Map.of("message", "Không tìm thấy tài khoản.")));
    }

    @GetMapping("/{username}")
    public ResponseEntity<?> byUsername(@PathVariable String username) {
        return userRepo.findByUsername(username)
                .map(user -> ResponseEntity.ok(toPublic(user)))
                .orElseGet(() -> ResponseEntity.badRequest().body(Map.of("message", "Người dùng không tồn tại.")));
    }

    @PostMapping("/me/send-otp")
    public ResponseEntity<?> sendUpdateOtp(Authentication authentication) {
        return userRepo.findByUsername(authentication.getName())
                .map(user -> {
                    otpService.generatedAndSaveOtp(user.getEmail());
                    return ResponseEntity.ok(Map.of("message", "Đã gửi mã OTP xác nhận đổi hồ sơ về email của bạn."));
                })
                .orElseGet(() -> ResponseEntity.badRequest().body(Map.of("message", "Không tìm thấy tài khoản.")));
    }

    @PutMapping("/me")
    public ResponseEntity<?> updateMe(Authentication authentication, @RequestBody Map<String, String> request) {
        User user = userRepo.findByUsername(authentication.getName()).orElse(null);
        if (user == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "Không tìm thấy tài khoản."));
        }

        String otp = request.get("otp");
        if (otp == null || !otpService.validateOtp(user.getEmail(), otp)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Mã OTP không chính xác hoặc đã hết hạn."));
        }

        if (request.get("displayName") != null) user.setDisplayName(request.get("displayName"));
        if (request.get("phone") != null) user.setPhone(request.get("phone"));
        if (request.get("khoaNganh") != null) user.setKhoaNganh(request.get("khoaNganh"));
        if (request.get("namHoc") != null) user.setNamHoc(request.get("namHoc"));

        String newEmail = request.get("email");
        if (newEmail != null && !newEmail.isBlank() && !newEmail.equals(user.getEmail())) {
            if (!newEmail.endsWith("@st.utc2.edu.vn")) {
                return ResponseEntity.badRequest().body(Map.of("message", "Email phải là mail sinh viên UTC2."));
            }
            if (userRepo.findByEmail(newEmail).isPresent()) {
                return ResponseEntity.badRequest().body(Map.of("message", "Email này đã được dùng."));
            }
            user.setEmail(newEmail);
        }

        userRepo.save(user);
        return ResponseEntity.ok(Map.of(
                "message", "Cập nhật hồ sơ thành công.",
                "user", toPublic(user)
        ));
    }

    private Map<String, Object> toPublic(User user) {
        return Map.of(
                "username", user.getUsername(),
                "displayName", user.getDisplayName() != null ? user.getDisplayName() : user.getUsername(),
                "email", user.getEmail(),
                "phone", user.getPhone() != null ? user.getPhone() : "",
                "khoaNganh", user.getKhoaNganh() != null ? user.getKhoaNganh() : "",
                "namHoc", user.getNamHoc() != null ? user.getNamHoc() : "",
                "createdAt", user.getCreatedAt() != null ? user.getCreatedAt().toString() : ""
        );
    }
}
