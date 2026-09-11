-- ============================================================
-- 薪资计算改造 — 2026-08-19
-- salary_records 增加从各模块取数的汇总字段
-- ============================================================

ALTER TABLE salary_records
  ADD COLUMN IF NOT EXISTS attendance_adjust_total DECIMAL(12,2) DEFAULT 0,   -- 考勤调整合计
  ADD COLUMN IF NOT EXISTS additional_total        DECIMAL(12,2) DEFAULT 0,   -- 附加薪酬合计
  ADD COLUMN IF NOT EXISTS personal_welfare_total  DECIMAL(12,2) DEFAULT 0,   -- 个人福利合计
  ADD COLUMN IF NOT EXISTS company_welfare_total   DECIMAL(12,2) DEFAULT 0,   -- 公司福利合计
  ADD COLUMN IF NOT EXISTS data_status             VARCHAR(20) DEFAULT '草稿'; -- 数据状态
