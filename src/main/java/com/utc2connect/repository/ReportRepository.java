package com.utc2connect.repository;

import com.utc2connect.entity.Report;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ReportRepository extends JpaRepository<Report, Long> {
    // Tạm thời chưa cần viết custom query, JpaRepository đã hỗ trợ đủ hàm save()
}