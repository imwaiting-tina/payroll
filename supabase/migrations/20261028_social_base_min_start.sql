-- ============================================================
-- 社保福利套：各险种最低基数的开始日期 — 2026-10-28
-- 与 20260824_social_base_min.sql 的五项最低基数一一对应
-- 仅作记录与导入导出使用，不改变现有计算逻辑
-- ============================================================

ALTER TABLE social_welfare_sets
  ADD COLUMN IF NOT EXISTS pension_base_min_start      DATE,  -- 养老最低基数开始日期
  ADD COLUMN IF NOT EXISTS medical_base_min_start      DATE,  -- 医疗最低基数开始日期
  ADD COLUMN IF NOT EXISTS unemployment_base_min_start DATE,  -- 失业最低基数开始日期
  ADD COLUMN IF NOT EXISTS injury_base_min_start       DATE,  -- 工伤最低基数开始日期
  ADD COLUMN IF NOT EXISTS maternity_base_min_start    DATE;  -- 生育最低基数开始日期
