-- ============================================================
-- 员工福利缴纳调整金额 — 2026-08-17
-- employee_welfare_records 增加调整金额相关字段
-- ============================================================

ALTER TABLE employee_welfare_records
  ADD COLUMN IF NOT EXISTS personal_social_adj     DECIMAL(12,2) DEFAULT 0,   -- 个人社保调整金额
  ADD COLUMN IF NOT EXISTS company_social_adj      DECIMAL(12,2) DEFAULT 0,   -- 公司社保调整金额
  ADD COLUMN IF NOT EXISTS personal_housing_adj    DECIMAL(12,2) DEFAULT 0,   -- 个人公积金调整金额
  ADD COLUMN IF NOT EXISTS company_housing_adj     DECIMAL(12,2) DEFAULT 0,   -- 公司公积金调整金额
  ADD COLUMN IF NOT EXISTS adj_start_month         VARCHAR(7),                -- 调整涉及开始月份
  ADD COLUMN IF NOT EXISTS adj_end_month           VARCHAR(7),                -- 调整涉及结束月份
  ADD COLUMN IF NOT EXISTS adj_reason              TEXT,                      -- 调整原因
  ADD COLUMN IF NOT EXISTS adj_remark              TEXT,                      -- 调整备注
  ADD COLUMN IF NOT EXISTS adj_import_time         TIMESTAMPTZ,               -- 调整金额导入时间
  ADD COLUMN IF NOT EXISTS adj_import_by           VARCHAR(100);              -- 调整金额导入人
