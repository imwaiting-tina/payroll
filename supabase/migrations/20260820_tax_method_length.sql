-- ============================================================
-- 修复 tax_method 字段长度 — 2026-08-20
-- non_taxable 是 11 个字符，超过 VARCHAR(10) 导致写入失败
-- ============================================================

ALTER TABLE employees ALTER COLUMN tax_method TYPE VARCHAR(20);
