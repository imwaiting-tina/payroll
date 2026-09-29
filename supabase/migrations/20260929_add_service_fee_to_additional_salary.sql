-- ============================================================
-- 附加薪酬补充「服务费」字段 — 2026-09-29
--
-- 背景：前端「附加薪酬」板块已把 service_fee（服务费，老龙馄饨发薪平台
--       服务费用）加入导入/导出/合计，但 additional_salary_records 表
--       建表时漏了该列，导致导入时 PostgREST 报 400（列不存在）。
-- 处理：补齐该列。幂等，可重复执行。
-- ============================================================

ALTER TABLE additional_salary_records
  ADD COLUMN IF NOT EXISTS service_fee DECIMAL(12,2) DEFAULT 0;
