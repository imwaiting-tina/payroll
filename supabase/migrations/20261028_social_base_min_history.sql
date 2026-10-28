-- ============================================================
-- 社保福利套：各险种最低基数历史调整 — 2026-10-28
-- 福利套上的 *_base_min 为默认标准（历史调整开始之前适用）
-- 本表记录带开始日期的最低基数调整，计算时取
-- “开始月份 <= 当期月份”的最近一条；没有则回退到默认标准
-- ============================================================

CREATE TABLE IF NOT EXISTS social_base_min_history (
  id          BIGSERIAL PRIMARY KEY,
  social_code VARCHAR(30) NOT NULL REFERENCES social_welfare_sets(code) ON DELETE CASCADE,
  insurance   VARCHAR(20) NOT NULL,   -- pension/medical/unemployment/injury/maternity
  base_min    DECIMAL(12,2) NOT NULL, -- 该险种最低基数
  start_date  DATE NOT NULL,          -- 开始日期（按月份生效）
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (social_code, insurance, start_date)
);

CREATE INDEX IF NOT EXISTS idx_social_base_min_history_code
  ON social_base_min_history(social_code, insurance, start_date);

ALTER TABLE social_base_min_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hr_full_access_social_base_min_history ON social_base_min_history;
CREATE POLICY hr_full_access_social_base_min_history ON social_base_min_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
