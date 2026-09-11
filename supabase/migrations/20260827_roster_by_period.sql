-- ============================================================
-- 花名册按月存储 — 2026-08
-- 1. employees 加 period / data_status，唯一键改为 (unique_hash, period)
-- 2. 现有 150 行标为 2026-06（6 月真实数据）
-- 3. 创建按需生成函数 generate_roster_for_month
-- 已备份原表为 employees_backup_202608（迁移前执行）
-- ============================================================

-- 备份原表（迁移前手动执行过一次，此处留档）
-- CREATE TABLE employees_backup_202608 AS SELECT * FROM employees;

ALTER TABLE employees ADD COLUMN IF NOT EXISTS period VARCHAR(7);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS data_status VARCHAR(20) DEFAULT '草稿';

-- 现有数据 = 6 月真实数据
UPDATE employees SET period='2026-06', data_status='草稿' WHERE period IS NULL;

-- 唯一键：unique_hash → (unique_hash, period)
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_unique_hash_key;
ALTER TABLE employees ADD CONSTRAINT employees_unique_hash_period_key UNIQUE (unique_hash, period);

-- 按需生成某月花名册（以 6 月基准为源；离职日期=最后一天在岗）
CREATE OR REPLACE FUNCTION generate_roster_for_month(p_period text) RETURNS integer AS $fn$
DECLARE
  v_period text := p_period;
  v_month_start date;
  v_month_end date;
  v_added integer := 0;
BEGIN
  IF v_period IS NULL OR v_period = '' THEN
    v_period := to_char(CURRENT_DATE, 'YYYY-MM');
  END IF;
  v_month_start := to_date(v_period || '-01', 'YYYY-MM-DD');
  v_month_end := (v_month_start + interval '1 month' - interval '1 day')::date;

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
  WHERE NOT EXISTS (
    SELECT 1 FROM employees dst
    WHERE dst.unique_hash = src.unique_hash AND dst.period = v_period
  )
  AND (src.entry_date IS NULL OR src.entry_date <= v_month_end)
  AND (src.leave_date IS NULL OR src.leave_date >= v_month_start)
  AND src.period = '2026-06';

  GET DIAGNOSTICS v_added = ROW_COUNT;
  RETURN v_added;
END;
$fn$ LANGUAGE plpgsql;
