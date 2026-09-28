-- ============================================================
-- 花名册去重 + 清理重复行产生的下游孤儿记录 — 2026-09-28
--
-- 背景：导入时曾「按最新数据重算唯一值」，导致同一人（发薪公司+姓名+入职日期
--       相同）被拆成两条 unique_hash 不同的记录，出现重复（约 10 条）。
--
-- 处理：同一 (period, name, pay_company, entry_date) 只保留最早（id 最小）的一条，
--       删除其余；并同步清理这些被删行的 unique_hash 在下游按月表里的孤儿记录。
--       幂等，可重复执行。
-- ============================================================

-- 1. 找出要删除的重复行（每组里 id 不是最小的那些）
CREATE TEMP TABLE _dup_emp_del AS
SELECT a.id AS emp_id, a.unique_hash, a.period
FROM employees a
JOIN employees b
  ON a.period = b.period
 AND a.name = b.name
 AND a.pay_company = b.pay_company
 AND a.entry_date = b.entry_date
 AND a.id > b.id;

-- 2. 清理这些重复行在下游按月表里的孤儿记录（按 unique_hash + period）
DELETE FROM tax_monthly_calcs      t USING _dup_emp_del d WHERE t.unique_hash = d.unique_hash AND t.period = d.period;
DELETE FROM tax_special_deductions t USING _dup_emp_del d WHERE t.unique_hash = d.unique_hash AND t.period = d.period;
DELETE FROM salary_records         t USING _dup_emp_del d WHERE t.unique_hash = d.unique_hash AND t.period = d.period;
DELETE FROM attendance_records     t USING _dup_emp_del d WHERE t.unique_hash = d.unique_hash AND t.period = d.period;
DELETE FROM attendance_adjustments t USING _dup_emp_del d WHERE t.unique_hash = d.unique_hash AND t.period = d.period;
DELETE FROM employee_welfare_records t USING _dup_emp_del d WHERE t.unique_hash = d.unique_hash AND t.period = d.period;
DELETE FROM additional_salary_records t USING _dup_emp_del d WHERE t.unique_hash = d.unique_hash AND t.period = d.period;
DELETE FROM social_records         t USING _dup_emp_del d WHERE t.unique_hash = d.unique_hash AND t.period = d.period;

-- 3. 期初累计表无 period，按 unique_hash 清理
DELETE FROM tax_opening_balances   t USING _dup_emp_del d WHERE t.unique_hash = d.unique_hash;

-- 4. 删除重复的花名册行本身
DELETE FROM employees e USING _dup_emp_del d WHERE e.id = d.emp_id;

DROP TABLE _dup_emp_del;
