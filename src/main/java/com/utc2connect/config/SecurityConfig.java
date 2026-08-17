package com.utc2connect.config;

import com.utc2connect.security.JwtAuthenticationFilter;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
public class SecurityConfig {
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();

        // ❌ KHÔNG DÙNG: configuration.addAllowedOrigin("*");
        //  THAY BẰNG: Dùng allowedOriginPatterns để khớp với devtunnels/localhost
        configuration.setAllowedOriginPatterns(List.of("*"));

        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .cors(cors -> cors.configure(http)) // Kích hoạt cấu hình CORS cấu hình từ Controller
                .csrf(csrf -> csrf.disable())       // Tắt CSRF vì bạn đang dùng cơ chế Token (JWT)

                // 🔒 API dùng JWT thuần, không cần HttpSession -> chuyển hẳn sang STATELESS
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

                // 🔒 QUAN TRỌNG: tắt AnonymousAuthenticationFilter.
                // Mặc định Spring Security coi request "ẩn danh" là isAuthenticated() = true,
                // nên trước đây .anyRequest().authenticated() không chặn được gì cả.
                // Tắt anonymous -> request không có JWT hợp lệ sẽ KHÔNG có Authentication -> bị chặn thật sự.
                .anonymous(AbstractHttpConfigurer::disable)

                // 🔒 Trả lỗi 401 dạng JSON (đồng bộ style message tiếng Việt của AuthController)
                // thay vì để Spring Security tự redirect/trả trang lỗi mặc định.
                .exceptionHandling(ex -> ex.authenticationEntryPoint((request, response, authException) -> {
                    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                    response.setCharacterEncoding("UTF-8");
                    response.getWriter().write("{\"message\": \"Vé không hợp lệ hoặc đã hết hạn, vui lòng đăng nhập lại!\"}");
                }))

                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/auth/**").permitAll() // Mở trống hoàn toàn các cổng auth
                        .anyRequest().authenticated()
                )

                // 🔒 Gắn "nhân viên soát vé" JWT vào chain, chạy trước bước xử lý authentication mặc định
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}