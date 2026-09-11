-- =============================================================
-- 更新花名册 = 依照「上一个有花名册数据的月份」整体刷新目标月
--
-- 用途：员工花名册页面点击「更新花名册」按钮时调用。
-- 逻辑：
--   1. 删除目标月(p_period)现有花名册记录
--   2. 找到「上一个有数据的花名册月份」作为源
--   3. 把源月份中「在职（含离职月未到/当月）」的员工复制到目标月
--      （用入职/离职日期判断：entry<=月末 且 (leave为空 或 leave>=月初)）
--   4. 写入状态为「草稿」，可再手动调整
-- 注意：源月份默认选「目标月之前最近一个有记录的月」，不会用写死的 2026-06。
-- =============================================================
CREATE OR REPLACE FUNCTION update_roster_from_prev_month(p_period text) RETURNS integer AS $fn$
DECLARE
  v_period text := p_period;
  v_month_start date;
  v_month_end date;
  v_src_period text;
  v_added integer := 0;
BEGIN
  IF v_period IS NULL OR v_period = '' THEN
    v_period := to_char(CURRENT_DATE, 'YYYY-MM');
  END IF;
  v_month_start := to_date(v_period || '-01', 'YYYY-MM-DD');
  v_month_end := (v_month_start + interval '1 month' - interval '1 day')::date;

  -- 找到「目标月之前最近一个有花名册数据的月份」
  SELECT period INTO v_src_period
  FROM employees
  WHERE period < v_period
  GROUP BY period
  ORDER BY period DESC
  LIMIT 1;

  IF v_src_period IS NULL THEN
    RETURN 0;  -- 没有上一个月的数据可复制
  END IF;

  -- 删除目标月现有花名册（整体覆盖）
  DELETE FROM employees WHERE period = v_period;

  -- 从源月份复制「在职」的员工（离职月未到或恰好在职的会保留，已离职的不复制）
  INSERT INTO employees (
    unique_hash, name, status, cost_center, pay_company, tax_method,
    department, report_to, position, job_level, attendance_type,
    entry_date, leave_date, is_disabled, basic_salary, provision_welfare,
    period, data_status
  )
  SELECT
    src.unique_hash, src.name, src.status, src.cost_center, src.pay_company, src.tax_method,
    src.department, src.report_to, src.position, src.job_level, src.attendance_type,
    src.entry_date, src.leave_date, src.is_disabled, src.basic_salary, src.provision_welfare,
    v_period, '草稿'
  FROM employees src
  WHERE src.period = v_src_period
    AND (src.entry_date IS NULL OR src.entry_date <= v_month_end)
    AND (src.leave_date IS NULL OR src.leave_date >= v_month_start)
  ON CONFLICT (unique_hash, period) DO NOTHING;

  GET DIAGNOSTICS v_added = ROW_COUNT;
  RETURN v_added;
END;
$fn$ LANGUAGE plpgsql;
