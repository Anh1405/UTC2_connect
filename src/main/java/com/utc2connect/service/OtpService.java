package com.utc2connect.service;

import com.utc2connect.entity.Otp;
import com.utc2connect.repository.otpRepository;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Optional;

@Service
public class OtpService {

    private static final int OTP_EXPIRY_MINUTES = 5;
    private static final int RESEND_COOLDOWN_SECONDS = 60;

    @Autowired
    private otpRepository otpRepository;

    @Autowired
    private JavaMailSender mailSender;

    /**
     * Tạo mới và gửi mã OTP qua Email cho người dùng.
     * Tự động kiểm tra chống Spam (Cooldown 60s) và vô hiệu hóa các mã cũ.
     */
    @Transactional
    public String generateAndSaveOtp(String email) {
        Optional<Otp> existingOtpOpt = otpRepository.findFirstByEmailOrderByCreatedAtDesc(email);

        // 1. Kiểm tra Rate Limiting (Giới hạn gửi lại trong 60 giây)
        if (existingOtpOpt.isPresent()) {
            Otp lastOtp = existingOtpOpt.get();
            LocalDateTime cooldownTime = lastOtp.getCreatedAt().plusSeconds(RESEND_COOLDOWN_SECONDS);

            if (LocalDateTime.now().isBefore(cooldownTime) && !lastOtp.isUsed()) {
                throw new IllegalStateException("Vui lòng đợi 60 giây trước khi yêu cầu mã OTP mới.");
            }

            // Vô hiệu hóa mã cũ nếu còn hạn nhưng người dùng yêu cầu mã mới
            if (!lastOtp.isUsed()) {
                lastOtp.setUsed(true);
                otpRepository.save(lastOtp);
            }
        }

        // 2. Sinh mã OTP 6 số ngẫu nhiên bằng SecureRandom
        String code = generateSecureOtpCode();

        // 3. Khởi tạo Entity Otp và lưu vào database
        Otp otp = new Otp();
        otp.setEmail(email);
        otp.setCode(code);
        otp.setCreatedAt(LocalDateTime.now());
        otp.setExpiredAt(LocalDateTime.now().plusMinutes(OTP_EXPIRY_MINUTES));
        otp.setUsed(false);

        otpRepository.save(otp);

        // 4. Gửi email HTML giao diện chỉn chu
        sendHtmlMail(email, code);

        return code;
    }

    /**
     * Alias giữ tương thích ngược với tên method cũ trong controller
     */
    @Transactional
    public String generatedAndSaveOtp(String email) {
        return generateAndSaveOtp(email);
    }

    /**
     * Xác thực mã OTP người dùng nhập vào.
     * Đảm bảo tính năng OTP 1 lần (Burn after reading).
     */
    @Transactional
    public boolean validateOtp(String email, String inputCode) {
        if (email == null || inputCode == null || inputCode.trim().length() != 6) {
            return false;
        }

        Optional<Otp> otpOpt = otpRepository.findFirstByEmailOrderByCreatedAtDesc(email);
        if (otpOpt.isEmpty()) {
            return false;
        }

        Otp otp = otpOpt.get();

        // Check điều kiện: Chưa sử dụng + Mã trùng khớp + Chưa hết hạn
        boolean isValid = !otp.isUsed()
                && otp.getCode().equals(inputCode.trim())
                && otp.getExpiredAt().isAfter(LocalDateTime.now());

        if (isValid) {
            otp.setUsed(true); // Đánh dấu đã sử dụng thành công
            otpRepository.save(otp);
            return true;
        }

        return false;
    }

    /**
     * Kiểm tra xem email có mã OTP gần nhất nào vẫn còn hiệu lực hay không.
     */
    @Transactional(readOnly = true)
    public boolean isOtpStillValid(String email) {
        return otpRepository.findFirstByEmailOrderByCreatedAtDesc(email)
                .map(otp -> !otp.isUsed() && otp.getExpiredAt().isAfter(LocalDateTime.now()))
                .orElse(false);
    }

    // ==========================================
    // HELPER PRIVATE METHODS
    // ==========================================

    /**
     * Sinh chuỗi 6 chữ số ngẫu nhiên an toàn mật mã học
     */
    private String generateSecureOtpCode() {
        SecureRandom random = new SecureRandom();
        int number = random.nextInt(1_000_000);
        return String.format("%06d", number);
    }

    /**
     * Gửi Mail định dạng HTML định dạng đẹp mắt
     */
    private void sendHtmlMail(String toMail, String otpCode) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

            helper.setFrom("UTC2 Connect <noreply@utc2connect.com>");
            helper.setTo(toMail);
            helper.setSubject("[UTC2 Connect] - Mã xác thực OTP bảo mật");

            String htmlBody = """
                <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h2 style="color: #0F8B6C; font-size: 24px; margin: 0;">UTC2 Connect</h2>
                        <p style="color: #666666; font-size: 13px; margin-top: 4px;">Hệ thống Kết nối & Xác thực Sinh viên</p>
                    </div>
                    
                    <p style="color: #333333; font-size: 15px;">Chào bạn,</p>
                    <p style="color: #555555; font-size: 14px; line-height: 1.5;">
                        Bạn đang thực hiện thao tác cần xác thực bảo mật tài khoản. Mã xác thực OTP của bạn là:
                    </p>
                    
                    <div style="text-align: center; margin: 28px 0;">
                        <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #101B33; background: #FBFAF4; padding: 12px 28px; border-radius: 8px; border: 1.5px dashed #FFB400; display: inline-block;">
                            %s
                        </span>
                    </div>
                    
                    <p style="color: #777777; font-size: 13px; line-height: 1.4;">
                        ⏰ Mã xác thực này có hiệu lực trong <b>5 phút</b>.<br/>
                        🔒 Tuyệt đối không chia sẻ mã này cho bất kỳ ai để bảo vệ tài khoản.
                    </p>
                    
                    <hr style="border: none; border-top: 1px solid #eeeeee; margin: 24px 0;" />
                    <p style="font-size: 11px; color: #999999; text-align: center; margin: 0;">
                        Đây là email tự động từ hệ thống UTC2 Connect. Vui lòng không phản hồi email này.
                    </p>
                </div>
            """.formatted(otpCode);

            helper.setText(htmlBody, true);
            mailSender.send(message);
        } catch (MessagingException e) {
            System.err.println("Lỗi khi gửi HTML Mail OTP: " + e.getMessage());
            throw new RuntimeException("Không thể gửi email OTP, vui lòng kiểm tra lại cấu hình mail server.", e);
        }
    }
}