-- ============================================================
-- 社保福利套：各险种最低基数 — 2026-08-24
-- 放在险种缴纳开关下面，个人和公司一致
-- ============================================================

ALTER TABLE social_welfare_sets
  ADD COLUMN IF NOT EXISTS pension_base_min      DECIMAL(12,2),  -- 养老最低基数
  ADD COLUMN IF NOT EXISTS medical_base_min      DECIMAL(12,2),  -- 医疗最低基数
  ADD COLUMN IF NOT EXISTS unemployment_base_min DECIMAL(12,2),  -- 失业最低基数
  ADD COLUMN IF NOT EXISTS injury_base_min       DECIMAL(12,2),  -- 工伤最低基数
  ADD COLUMN IF NOT EXISTS maternity_base_min    DECIMAL(12,2);  -- 生育最低基数
