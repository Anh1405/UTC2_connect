package com.utc2connect.service;

import com.utc2connect.entity.Otp;
import com.utc2connect.repository.otpRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.Random;

@Service
public class OtpService {
    @Autowired
    private otpRepository otpRepository;
    @Autowired
    private JavaMailSender  mailSender;
    private void  sendMail(String toMail,String otpCode){
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom("UTC2 Connect <noreply@utc2connect.com>");
        message.setTo(toMail);
        message.setSubject("[UTC2 Connect Service] - Mã xác thực OTP");
        message.setText("Chào bạn,\n\nMã OTP để hoàn tất đăng ký tài khoản UTC2 Connect của bạn là: " + otpCode
                + "\nMã này có hiệu lực trong vòng 5 phút. Vui lòng không chia sẻ mã này cho bất kỳ ai.\n\nThân ái!");
        mailSender.send(message);
    }
    public String generatedAndSaveOtp(String email){
        // 1. Kiểm tra xem OTP cũ mới nhất còn hạn (trong vòng 5 phút) và chưa dùng hay không
        Optional<Otp> existingOtp = otpRepository.findFirstByEmailOrderByCreatedAtDesc(email);

        if (existingOtp.isPresent() && !existingOtp.get().isUsed() && existingOtp.get().getExpiredAt().isAfter(LocalDateTime.now())) {
            // Nếu còn hạn, trả về luôn mã cũ, KHÔNG tạo mới vào DB và KHÔNG gửi thêm mail
            return existingOtp.get().getCode();
        }
        Random random = new Random();
        String code = String.format("%06d", random.nextInt(1000000));
        Otp otp = new Otp();
        otp.setEmail(email);
        otp.setCode(code);
        otp.setExpiredAt(LocalDateTime.now().plusMinutes(5));
        otp.setUsed(false);
        otpRepository.save(otp);
        try {
            sendMail(email, code);
        } catch (Exception e) {
            System.out.println("Lỗi gửi Mail: " + e.getMessage());
            throw new RuntimeException(e);
        }
        return code;
    }
    public boolean validateOtp(String email,String code){
        return otpRepository.findFirstByEmailOrderByCreatedAtDesc(email).map(otp -> !otp.isUsed()&&otp.getCode().equals(code)&&otp.getExpiredAt().isAfter(LocalDateTime.now())).orElse(false);
    }
    public boolean isOtpStillValid(String email) {
        return otpRepository.findFirstByEmailOrderByCreatedAtDesc(email)
                .map(otp -> !otp.isUsed() && otp.getExpiredAt().isAfter(LocalDateTime.now()))
                .orElse(false);
    }
}
