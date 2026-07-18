package com.utc2connect.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Component;

import java.security.Key;
import java.util.Date;

@Component
public class JwtTokenProvider {

    // Chuỗi bí mật dùng để ký nhận diện mã token (Yêu cầu độ dài tối thiểu 256-bit)
    private final String JWT_SECRET = "ChuoiBiMatSieuCapVipProCuaUtc2Connect2026!!!!";

    // Thời gian hết hạn của vé tàu: 1 ngày (tính bằng mili-giây)
    private final long JWT_EXPIRATION = 86400000L;

    private Key getSigningKey() {
        return Keys.hmacShaKeyFor(JWT_SECRET.getBytes());
    }

    // Hàm sinh mã Token khi Đăng nhập thành công
    public String generateToken(String username) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + JWT_EXPIRATION);

        return Jwts.builder()
                .setSubject(username)
                .setIssuedAt(now)
                .setExpiration(expiryDate)
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    // Hàm giải mã lấy Username từ chuỗi Token gửi lên
    public String getUsernameFromJWT(String token) {
        Claims claims = Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(token)
                .getBody();

        return claims.getSubject();
    }

    // Hàm kiểm tra xem Token còn hạn và hợp lệ không
    public boolean validateToken(String authToken) {
        try {
            Jwts.parserBuilder().setSigningKey(getSigningKey()).build().parseClaimsJws(authToken);
            return true;
        } catch (MalformedJwtException | ExpiredJwtException | UnsupportedJwtException | IllegalArgumentException ex) {
            // Token rách, hết hạn hoặc sai chữ ký
            return false;
        }
    }
}