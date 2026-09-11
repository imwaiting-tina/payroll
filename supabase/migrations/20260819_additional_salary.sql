-- ============================================================
-- 附加薪酬板块 — 2026-08-19
-- additional_salary_records 表
-- 附加薪酬合计不含基本工资，只含12项补贴佣金奖金
-- ============================================================

DROP TABLE IF EXISTS additional_salary_records CASCADE;

CREATE TABLE additional_salary_records (
    id                  BIGSERIAL PRIMARY KEY,
    unique_hash         VARCHAR(16) NOT NULL,
    period              VARCHAR(7)  NOT NULL,           -- 结算月份 YYYY-MM

    -- 12项收入（均来源于导入）
    allowance_supp      DECIMAL(12,2) DEFAULT 0,        -- 补贴/补公积金
    other_adjust        DECIMAL(12,2) DEFAULT 0,        -- 其他补贴/调整
    insurance_amount    DECIMAL(12,2) DEFAULT 0,        -- 商保金额
    kpi_provision       DECIMAL(12,2) DEFAULT 0,        -- KPI预提
    office_comm         DECIMAL(12,2) DEFAULT 0,        -- 商办佣金
    performance_pay     DECIMAL(12,2) DEFAULT 0,        -- 绩效
    apartment_comm      DECIMAL(12,2) DEFAULT 0,        -- 公寓佣金
    talent_kpi          DECIMAL(12,2) DEFAULT 0,        -- 人才系KPI
    heat_allowance      DECIMAL(12,2) DEFAULT 0,        -- 防暑降温费
    other_allowance     DECIMAL(12,2) DEFAULT 0,        -- 津贴
    security_bonus      DECIMAL(12,2) DEFAULT 0,        -- 保安奖金
    cleaning_bonus      DECIMAL(12,2) DEFAULT 0,        -- 保洁奖金

    data_status         VARCHAR(20) DEFAULT '草稿',     -- 草稿/已锁定
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(unique_hash, period)
);

CREATE INDEX idx_additional_salary_period ON additional_salary_records(period);

ALTER TABLE additional_salary_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hr_additional_salary ON additional_salary_records;
CREATE POLICY hr_additional_salary ON additional_salary_records
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
