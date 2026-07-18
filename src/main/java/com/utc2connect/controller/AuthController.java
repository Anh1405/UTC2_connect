package com.utc2connect.controller;

import com.utc2connect.dto.LoginRequest;
import com.utc2connect.entity.User;
import com.utc2connect.repository.userRepository;
import com.utc2connect.security.JwtTokenProvider;
import com.utc2connect.service.OtpService;
import com.utc2connect.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins= "*")
public class AuthController {
    @Autowired
    private OtpService otpService;
    @Autowired
    private UserService userService ;
    @Autowired
    private userRepository userRepo;
    @Autowired
    private PasswordEncoder passwordEncoder;
    @Autowired
    private JwtTokenProvider tokenProvider;
    @PostMapping("/send-otp")
    public ResponseEntity<?> sendOtp(@RequestBody Map<String, String> request){
        String email = request.get("email");

        if(email == null || !email.endsWith("@st.utc2.edu.vn")){
            return ResponseEntity.badRequest().body(Map.of("message", "Email không hợp lệ, phải dùng mail sinh viên UTC2."));
        }

        // Kiểm tra tài khoản đã đăng ký chưa (vẫn giữ lại để chặn tài khoản trùng)
        if (userRepo.findByEmail(email).isPresent()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Email này đã được đăng ký tài khoản!"));
        }

        // Gọi hàm này: Nếu còn hạn thì nó trả về mã cũ (không gửi mail), nếu hết hạn nó tự tạo mã mới & gửi mail.
        // Cả 2 trường hợp đều trả về HTTP 200 OK cho Client.
        String code = otpService.generatedAndSaveOtp(email);

        return ResponseEntity.ok(Map.of("message", "Mã xác thực đã được xử lý thành công. Vui lòng kiểm tra Gmail của bạn!"));
    }

    @PostMapping ("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> request){
        String email = request.get("email");
        String password = request.get("password");
        String username = request.get("username");
        String otpCode = request.get("otp");

        // Kiểm tra lại một lần nữa phòng trường hợp cố tình gọi thẳng API register
        if (userRepo.findByEmail(email).isPresent()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Email này đã được đăng ký tài khoản!"));
        }

        boolean isOtpValid = otpService.validateOtp(email, otpCode);
        if(!isOtpValid){
            return ResponseEntity.badRequest().body(Map.of("message", "Mã OTP không chính xác hoặc đã hết hạn."));
        }

        String result = userService.registerUser(email, password, username);
        if(result.equals("User registered successfully")){
            return ResponseEntity.ok(Map.of("message", "Đăng kí tài khoản thành công và bạn có thể đăng nhập."));
        } else {
            return ResponseEntity.badRequest().body(Map.of("message", result));
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> request) {
        // SỬA Ở ĐÂY: Dùng .get("username") thay vì .getUsername()
        String username = request.get("username");
        String password = request.get("password");

        Optional<User> userOptional = userRepo.findByUsername(username);

        if (userOptional.isEmpty()) {
            Map<String, String> response = new HashMap<>();
            response.put("message", "Tên đăng nhập không tồn tại!");
            return ResponseEntity.badRequest().body(response);
        }

        User user = userOptional.get();

        // SỬA Ở ĐÂY: Truyền biến password vừa lấy được từ Map vào
        if (!passwordEncoder.matches(password, user.getPassword())) {
            return ResponseEntity.badRequest().body(Map.of("message", "Mật khẩu không chính xác!"));
        }

        String jwt = tokenProvider.generateToken(user.getUsername());
        Map<String, Object> response = new HashMap<>();
        response.put("message", "Đăng nhập thành công!");
        response.put("username", user.getUsername());
        response.put("email", user.getEmail());

        // Trả kèm token và loại token về cho client lưu trữ
        response.put("accessToken", jwt);
        response.put("tokenType", "Bearer");

        return ResponseEntity.ok(response);
    }
    @PostMapping("/forgot-password/send-otp")
    public ResponseEntity<?> sendForgotOtp(@RequestBody Map<String, String> request) {
        String email = request.get("email");

        // Khác với đăng ký, quên mật khẩu thì tài khoản PHẢI tồn tại rồi
        if (userRepo.findByEmail(email).isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Email này chưa được đăng ký tài khoản!"));
        }

        // Tận dụng lại hàm cũ, tự dùng lại mã cũ nếu chưa hết 5p
        String code = otpService.generatedAndSaveOtp(email);
        return ResponseEntity.ok(Map.of("message", "Mã OTP đặt lại mật khẩu đã được xử lý. Hãy check mail nhé!"));
    }
    @PostMapping("/forgot-password/reset")
    public ResponseEntity<?> resetPassword(@RequestBody Map<String, String> request) {
        String email = request.get("email");
        String otpCode = request.get("otp");
        String newPassword = request.get("newPassword");

        // 1. Xác thực OTP
        boolean isOtpValid = otpService.validateOtp(email, otpCode);
        if (!isOtpValid) {
            return ResponseEntity.badRequest().body(Map.of("message", "Mã OTP không chính xác hoặc đã hết hạn."));
        }

        // 2. Cập nhật mật khẩu mới
        Optional<User> userOptional = userRepo.findByEmail(email);
        if (userOptional.isPresent()) {
            User user = userOptional.get();
            user.setPassword(passwordEncoder.encode(newPassword)); // Đừng quên mã hóa nhé!
            userRepo.save(user);

            // (Tùy chọn) Đánh dấu OTP này đã dùng luôn
            // otpService.setOtpUsed(email, otpCode);

            return ResponseEntity.ok(Map.of("message", "Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới!"));
        }

        return ResponseEntity.badRequest().body(Map.of("message", "Có lỗi xảy ra, vui lòng thử lại."));
    }
}