package com.utc2connect.config;

import com.corundumstudio.socketio.SocketIOServer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SocketIOConfig {

    @Bean
    public SocketIOServer socketIOServer() {
        com.corundumstudio.socketio.Configuration config = new com.corundumstudio.socketio.Configuration();

        // SỬA Ở ĐÂY: Dùng "0.0.0.0" để Server lắng nghe trên tất cả các địa chỉ IP (kể cả localhost và IP LAN)
        config.setHostname("0.0.0.0");

        config.setPort(8081);

        // THÊM DÒNG NÀY: Cấp quyền CORS để Frontend Vite gọi qua không bị lỗi
        config.setOrigin("*");

        return new SocketIOServer(config);
    }
}