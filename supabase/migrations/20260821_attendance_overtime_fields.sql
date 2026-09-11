-- ============================================================
-- 考勤加班字段改造 — 2026-08-21
-- 原「加班类型 + 加班数量 + 加班单位」改为：
--   平时加班(天) regular_overtime_days、周末加班(天) weekend_overtime_days、
--   节假日加班(天) holiday_overtime_days、延时加班(小时) overtime_hours
-- 加班倍数与计算逻辑不变；延时加班(小时) × 时薪 = 加班金额
-- ============================================================

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS regular_overtime_days DECIMAL(8,1) DEFAULT 0,   -- 平时加班(天)
  ADD COLUMN IF NOT EXISTS weekend_overtime_days DECIMAL(8,1) DEFAULT 0,   -- 周末加班(天)
  ADD COLUMN IF NOT EXISTS holiday_overtime_days DECIMAL(8,1) DEFAULT 0,   -- 节假日加班(天)
  ADD COLUMN IF NOT EXISTS guard_overtime_days  DECIMAL(8,1) DEFAULT 0,    -- 保安法定加班(天)
  ADD COLUMN IF NOT EXISTS overtime_hours        DECIMAL(8,1) DEFAULT 0;   -- 延时加班(小时)

-- 历史数据回填：把旧的 加班类型/数量/单位 映射到新字段
UPDATE attendance_records
SET regular_overtime_days = COALESCE(overtime_qty, 0)
WHERE overtime_type = '平时加班' AND overtime_unit = '天';
UPDATE attendance_records
SET weekend_overtime_days = COALESCE(overtime_qty, 0)
WHERE overtime_type = '周末加班' AND overtime_unit = '天';

UPDATE attendance_records
SET holiday_overtime_days = COALESCE(overtime_qty, 0)
WHERE overtime_type IN ('法定节假日加班', '节假日加班') AND overtime_unit = '天';

UPDATE attendance_records
SET overtime_hours = COALESCE(overtime_qty, 0)
WHERE overtime_unit = '小时';
