package com.utc2connect.config;

import com.corundumstudio.socketio.SocketIOServer;
import com.utc2connect.security.JwtTokenProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SocketIOConfig {

    private final JwtTokenProvider jwtTokenProvider;

    public SocketIOConfig(JwtTokenProvider jwtTokenProvider) {
        this.jwtTokenProvider = jwtTokenProvider;
    }

    @Bean
    public SocketIOServer socketIOServer() {
        com.corundumstudio.socketio.Configuration config = new com.corundumstudio.socketio.Configuration();

        config.setHostname("0.0.0.0");
        config.setPort(8081);
        config.setOrigin("*");

        // 🔒 CHỐT CHẶN BẢO MẬT SOCKET HOÀN THIỆN:
        config.setAuthorizationListener(handshakeData -> {
            // Lấy token từ Query Parameter trên URL
            String token = handshakeData.getSingleUrlParam("token");

            if (token == null || token.trim().isEmpty()) {
                System.out.println("🛑 Cảnh báo: Từ chối kết nối Socket do không có vé (Token)!");
                return false;
            }

            boolean isValid = jwtTokenProvider.validateToken(token);

            if (!isValid) {
                System.out.println("🛑 Cảnh báo: Kẻ gian dùng vé giả hoặc vé đã hết hạn!");
            }

            return isValid;
        });

        return new SocketIOServer(config);
    }
}