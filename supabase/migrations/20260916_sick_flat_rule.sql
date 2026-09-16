-- ============================================================
-- 病假直接替换规则（2026-09-01 起生效）
--   医疗期内病假工资不得低于当地最低工资的 80%（目前最低工资 2740），
--   因此自生效日起，病假工资直接按「最低工资 × 支付系数(80%)」计发，
--   替换原先按本企业连续工龄分档（60%–100%）的规则。
-- ============================================================

INSERT INTO attendance_rules (rule_type, rule_key, rule_name, rule_value)
SELECT 'sick', 'sick_flat_rule', '病假直接替换规则（2026-09-01 起）',
       '{"effective_date":"2026-09-01","min_wage":2740,"pay_rate":0.8}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM attendance_rules WHERE rule_key = 'sick_flat_rule');
