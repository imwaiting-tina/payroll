-- ============================================================
-- 考勤「同步上月数据」依赖的列（补齐，幂等）
--   is_attendance / seniority_start_date 此前仅在线上库手工存在，
--   仓库无迁移记录，此处补一条权威的幂等 DDL。
-- ============================================================

ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS is_attendance VARCHAR(10) DEFAULT '是';
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS seniority_start_date DATE;
