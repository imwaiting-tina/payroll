-- ============================================================
-- 考勤工资字段 — 2026-08-20
-- 在「基本工资」和「计薪天数」之间新增「考勤工资」（数据来源-导入）
-- 凡涉及基本工资的计算均改用考勤工资（计薪基数）
-- ============================================================

-- 考勤表：新增考勤工资（导入，作为病假/事假/加班/入离职等计薪基数）
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS attendance_wage DECIMAL(12,2);

-- 薪资计算表：同步落库考勤工资
ALTER TABLE salary_records
  ADD COLUMN IF NOT EXISTS attendance_wage DECIMAL(12,2);
