package com.utc2connect.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class ModerationService {

    // Lấy API Key của Hugging Face từ file application.properties
    @Value("${huggingface.api.key}")
    private String apiKey;

    private final RestTemplate restTemplate = new RestTemplate();
    // Sử dụng model toxic-bert miễn phí từ Hugging Face
    private static final String API_URL = "http://127.0.0.1:8000/moderate";

    // 🔒 FAIL-CLOSED: phân biệt rõ 3 trạng thái
    public enum ModerationResult {
        ALLOWED,             // Nội dung sạch, cho gửi bình thường
        BLOCKED_TOXIC,       // AI xác nhận vi phạm
        SERVICE_UNAVAILABLE  // Không gọi được AI (503/429/timeout/lỗi khác) -> KHÔNG tự ý cho qua
    }

    public ModerationResult moderate(String text) {
        if (text == null || text.trim().isEmpty()) {
            return ModerationResult.ALLOWED;
        }

        try {
            Map<String, String> requestBody = new HashMap<>();
            requestBody.put("inputs", text); // Hugging Face sử dụng key là "inputs" thay vì "input"

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(apiKey);

            HttpEntity<Map<String, String>> entity = new HttpEntity<>(requestBody, headers);

            // Hugging Face trả về một List thay vì Object (Map) như OpenAI
            ResponseEntity<List> response = restTemplate.postForEntity(API_URL, entity, List.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                @SuppressWarnings("unchecked")
                List<List<Map<String, Object>>> outerList = (List<List<Map<String, Object>>>) response.getBody();

                if (!outerList.isEmpty()) {
                    List<Map<String, Object>> predictions = outerList.get(0);

                    for (Map<String, Object> prediction : predictions) {
                        String label = (String) prediction.get("label");
                        Double score = ((Number) prediction.get("score")).doubleValue();

                        // Các nhãn vi phạm với độ tin cậy > 60%
                        if (("toxic".equalsIgnoreCase(label) || "insult".equalsIgnoreCase(label) || "threat".equalsIgnoreCase(label))
                                && score > 0.6) {
                            System.out.println("🤖 [HuggingFace] Bắt được tin nhắn vi phạm: " + label + " (" + score + ")");
                            return ModerationResult.BLOCKED_TOXIC;
                        }
                    }
                }
            }
            return ModerationResult.ALLOWED;

        } catch (HttpServerErrorException.ServiceUnavailable e) {
            // Lỗi 503: Đặc thù của Hugging Face khi Model đang ngủ và cần vài giây để khởi động (Cold Start)
            System.err.println("⏳ Hugging Face Model đang khởi động (503), vui lòng thử lại sau: " + e.getMessage());
            return ModerationResult.SERVICE_UNAVAILABLE;

        } catch (HttpClientErrorException.TooManyRequests e) {
            // 429: Vượt quá giới hạn request
            System.err.println("❌ Hugging Face đang bị giới hạn (429 Too Many Requests): " + e.getMessage());
            return ModerationResult.SERVICE_UNAVAILABLE;

        } catch (ResourceAccessException e) {
            // Timeout / mất kết nối mạng
            System.err.println("❌ Không kết nối được tới Hugging Face (timeout/mất mạng): " + e.getMessage());
            return ModerationResult.ALLOWED;

        } catch (Exception e) {
            // Mọi lỗi khác
            System.err.println("❌ Lỗi khi gọi Hugging Face API: " + e.getMessage());
            return ModerationResult.SERVICE_UNAVAILABLE;
        }
    }

    @Deprecated
    public boolean isToxicContent(String text) {
        return moderate(text) == ModerationResult.BLOCKED_TOXIC;
    }
}