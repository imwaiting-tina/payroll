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
