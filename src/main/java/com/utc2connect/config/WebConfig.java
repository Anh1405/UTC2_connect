package com.utc2connect.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // Ánh xạ đường dẫn URL "/uploads/**" trỏ tới thư mục vật lý "uploads/" trên máy chủ
        registry.addResourceHandler("/uploads/**")
                .addResourceLocations("file:uploads/");
    }
}