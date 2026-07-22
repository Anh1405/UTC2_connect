package com.utc2connect.security;

import org.springframework.stereotype.Component;

import java.util.LinkedList;
import java.util.Queue;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class MessageRateLimiter {

    // Lưu danh sách thời điểm gửi tin của từng Username
    private final ConcurrentHashMap<String, Queue<Long>> userRequestTimes = new ConcurrentHashMap<>();

    private static final int MAX_MESSAGES = 5;      // Tối đa 5 tin
    private static final long TIME_WINDOW_MS = 3000; // Trong vòng 3 giây (3000 ms)

    /**
     * Kiểm tra xem user có đang spam hay không
     * @param username Tên tài khoản người gửi
     * @return true nếu hợp lệ, false nếu đang spam
     */
    public boolean isAllowed(String username) {
        long currentTime = System.currentTimeMillis();

        userRequestTimes.putIfAbsent(username, new LinkedList<>());
        Queue<Long> times = userRequestTimes.get(username);

        synchronized (times) {
            // Loại bỏ các mốc thời gian đã quá 3 giây
            while (!times.isEmpty() && (currentTime - times.peek() > TIME_WINDOW_MS)) {
                times.poll();
            }

            // Nếu số tin nhắn trong 3 giây qua < 5 tin -> Cho phép
            if (times.size() < MAX_MESSAGES) {
                times.add(currentTime);
                return true;
            }

            // Nếu gửi quá 5 tin/3 giây -> Chặn lại
            return false;
        }
    }
}