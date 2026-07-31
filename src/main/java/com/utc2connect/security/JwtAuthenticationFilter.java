package com.utc2connect.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;

// 🎫 "Nhân viên soát vé" thật sự cho các API REST (khác với AuthorizationListener chỉ soát vé cho Socket).
// Trước đây SecurityConfig có anyRequest().authenticated() nhưng KHÔNG có filter nào đọc token,
// nên request ẩn danh vẫn được Spring Security coi là "đã authenticated" -> lọt qua hết.
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider jwtTokenProvider;

    public JwtAuthenticationFilter(JwtTokenProvider jwtTokenProvider) {
        this.jwtTokenProvider = jwtTokenProvider;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain) throws ServletException, IOException {

        String token = resolveToken(request);

        if (token != null && jwtTokenProvider.validateToken(token)) {
            String username = jwtTokenProvider.getUsernameFromJWT(token);

            // Không dùng UserDetailsService/roles phức tạp vì hệ thống hiện chưa phân quyền theo role,
            // chỉ cần đánh dấu "đây là người đã đăng nhập hợp lệ" để authorizeHttpRequests() chấp nhận.
            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(username, null, Collections.emptyList());
            authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));

            SecurityContextHolder.getContext().setAuthentication(authentication);
        }
        // Nếu token thiếu/sai/hết hạn: KHÔNG set Authentication -> để SecurityConfig (đã tắt anonymous)
        // tự động chặn ở bước authorizeHttpRequests() với response 401 do AuthenticationEntryPoint xử lý.

        filterChain.doFilter(request, response);
    }

    private String resolveToken(HttpServletRequest request) {
        String bearerToken = request.getHeader("Authorization");
        if (bearerToken != null && bearerToken.startsWith("Bearer ")) {
            return bearerToken.substring(7);
        }
        return null;
    }

    @Override
    protected boolean shouldNotFilter(@NonNull HttpServletRequest request) {
        // Các cổng công khai (đăng ký / đăng nhập / quên mật khẩu) không cần vé để đi qua
        return request.getServletPath().startsWith("/api/auth/");
    }
}