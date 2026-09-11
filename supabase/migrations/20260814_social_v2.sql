-- ============================================================
-- 社保板块 v2 迁移 — 2026-08-14
-- 1. 社保福利套表 social_welfare_sets
-- 2. 公积金福利套表 housing_fund_sets
-- 3. 员工福利缴纳记录表 employee_welfare_records（含快照）
-- 内置 SI-00 / HF-00 不缴纳福利套
-- ============================================================

-- ============================================================
-- 1. 社保福利套表
-- ============================================================
DROP TABLE IF EXISTS social_welfare_sets CASCADE;

CREATE TABLE social_welfare_sets (
    id                    BIGSERIAL PRIMARY KEY,
    code                  VARCHAR(30)  NOT NULL UNIQUE,    -- 福利套编码，如 SI-SH-01
    name                  VARCHAR(100) NOT NULL,           -- 福利套名称
    region                VARCHAR(20),                     -- 地区
    is_builtin            BOOLEAN DEFAULT FALSE,           -- 系统内置（SI-00 不可改）
    effective_date        DATE,                            -- 生效日期
    expiry_date           DATE,                            -- 失效日期
    status                VARCHAR(10) DEFAULT '启用',      -- 启用/停用

    -- 基数规则
    base_min              DECIMAL(12,2),                   -- 社保基数下限
    base_max              DECIMAL(12,2),                   -- 社保基数上限
    allow_special_base    BOOLEAN DEFAULT FALSE,           -- 允许险种特殊基数

    -- 险种缴纳开关
    pension_enabled       BOOLEAN DEFAULT TRUE,
    medical_enabled       BOOLEAN DEFAULT TRUE,
    unemployment_enabled  BOOLEAN DEFAULT TRUE,
    injury_enabled        BOOLEAN DEFAULT TRUE,
    maternity_enabled     BOOLEAN DEFAULT TRUE,

    -- 个人费率
    pension_rate_p        DECIMAL(6,4) DEFAULT 0,          -- 个人养老
    medical_rate_p        DECIMAL(6,4) DEFAULT 0,          -- 个人医疗
    medical_fixed_p       DECIMAL(8,2) DEFAULT 0,          -- 个人医疗固定附加
    unemployment_rate_p   DECIMAL(6,4) DEFAULT 0,          -- 个人失业

    -- 公司费率
    pension_rate_c        DECIMAL(6,4) DEFAULT 0,          -- 公司养老
    medical_rate_c        DECIMAL(6,4) DEFAULT 0,          -- 公司医疗
    unemployment_rate_c   DECIMAL(6,4) DEFAULT 0,          -- 公司失业
    injury_rate_c         DECIMAL(6,4) DEFAULT 0,          -- 公司工伤
    maternity_rate_c      DECIMAL(6,4) DEFAULT 0,          -- 公司生育

    -- 取整规则
    rounding_method       VARCHAR(10) DEFAULT 'ROUND',     -- ROUND/ROUNDUP/ROUNDDOWN/TRUNC_UP
    rounding_precision    INT DEFAULT 2,                   -- 保留精度
    allow_override_round  BOOLEAN DEFAULT FALSE,           -- 允许险种覆盖取整规则

    remark                TEXT,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. 公积金福利套表
-- ============================================================
DROP TABLE IF EXISTS housing_fund_sets CASCADE;

CREATE TABLE housing_fund_sets (
    id                    BIGSERIAL PRIMARY KEY,
    code                  VARCHAR(30)  NOT NULL UNIQUE,    -- 福利套编码，如 HF-SH-01
    name                  VARCHAR(100) NOT NULL,           -- 福利套名称
    region                VARCHAR(20),                     -- 地区
    is_builtin            BOOLEAN DEFAULT FALSE,           -- 系统内置（HF-00 不可改）
    effective_date        DATE,
    expiry_date           DATE,
    status                VARCHAR(10) DEFAULT '启用',

    -- 基数规则
    base_min              DECIMAL(12,2),                   -- 公积金基数下限
    base_max              DECIMAL(12,2),                   -- 公积金基数上限
    supp_base_source      VARCHAR(20) DEFAULT '同正常公积金基数', -- 补充基数来源
    allow_stop_supp       BOOLEAN DEFAULT FALSE,           -- 允许员工停缴补充公积金

    -- 正常公积金费率
    normal_rate_p         DECIMAL(6,4) DEFAULT 0,          -- 个人正常
    normal_rate_c         DECIMAL(6,4) DEFAULT 0,          -- 公司正常

    -- 补充公积金
    supp_enabled          BOOLEAN DEFAULT FALSE,           -- 是否启用补充公积金
    supp_rate_p           DECIMAL(6,4) DEFAULT 0,          -- 个人补充
    supp_rate_c           DECIMAL(6,4) DEFAULT 0,          -- 公司补充

    -- 取整规则
    normal_round_method   VARCHAR(10) DEFAULT 'ROUND',
    normal_round_precision INT DEFAULT 2,
    supp_round_method     VARCHAR(10) DEFAULT 'ROUND',
    supp_round_precision  INT DEFAULT 2,

    remark                TEXT,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. 员工福利缴纳记录表（含比例/金额快照）
-- ============================================================
DROP TABLE IF EXISTS employee_welfare_records CASCADE;

CREATE TABLE employee_welfare_records (
    id                    BIGSERIAL PRIMARY KEY,
    unique_hash           VARCHAR(16) NOT NULL,            -- 关联员工
    period                VARCHAR(7)  NOT NULL,            -- 薪酬月份 YYYY-MM
    effective_month       VARCHAR(7),                      -- 生效月份
    expiry_month          VARCHAR(7),                      -- 失效月份

    -- 福利套绑定
    social_welfare_code   VARCHAR(30),                     -- 社保福利套编码
    housing_fund_code     VARCHAR(30),                     -- 公积金福利套编码

    -- 参保状态（系统生成）
    social_status         VARCHAR(10),                     -- 参保/不参保
    housing_status        VARCHAR(10),                     -- 缴存/不缴存

    -- 不缴纳原因
    social_no_reason      VARCHAR(50),                     -- 社保不缴纳原因
    housing_no_reason     VARCHAR(50),                     -- 公积金不缴纳原因
    no_pay_start_month    VARCHAR(7),                      -- 不缴纳开始月份
    no_pay_end_month      VARCHAR(7),                      -- 不缴纳结束月份

    -- 基数
    social_base           DECIMAL(12,2),                   -- 社保基数
    housing_base          DECIMAL(12,2),                   -- 公积金基数
    supp_enabled          BOOLEAN DEFAULT FALSE,           -- 是否缴纳补充公积金
    supp_base             DECIMAL(12,2),                   -- 补充公积金基数

    -- ============ 社保金额快照（个人+公司） ============
    pension_p_amt         DECIMAL(12,2) DEFAULT 0,
    medical_p_amt         DECIMAL(12,2) DEFAULT 0,
    unemployment_p_amt    DECIMAL(12,2) DEFAULT 0,
    pension_c_amt         DECIMAL(12,2) DEFAULT 0,
    medical_c_amt         DECIMAL(12,2) DEFAULT 0,
    unemployment_c_amt    DECIMAL(12,2) DEFAULT 0,
    injury_c_amt          DECIMAL(12,2) DEFAULT 0,
    maternity_c_amt       DECIMAL(12,2) DEFAULT 0,

    -- ============ 公积金金额快照 ============
    normal_housing_p_amt  DECIMAL(12,2) DEFAULT 0,
    normal_housing_c_amt  DECIMAL(12,2) DEFAULT 0,
    supp_housing_p_amt    DECIMAL(12,2) DEFAULT 0,
    supp_housing_c_amt    DECIMAL(12,2) DEFAULT 0,

    -- ============ 汇总 ============
    personal_social_total DECIMAL(12,2) DEFAULT 0,         -- 个人社保合计
    personal_housing_total DECIMAL(12,2) DEFAULT 0,        -- 个人公积金合计
    personal_total        DECIMAL(12,2) DEFAULT 0,         -- 个人福利扣除合计
    company_social_total  DECIMAL(12,2) DEFAULT 0,         -- 公司社保合计
    company_housing_total DECIMAL(12,2) DEFAULT 0,         -- 公司公积金合计
    company_total         DECIMAL(12,2) DEFAULT 0,         -- 公司福利缴纳合计

    -- 数据状态
    data_status           VARCHAR(30) DEFAULT '正常',      -- 正常/基数缺失/规则缺失等

    -- 快照（比例、规则，用于历史冻结）
    snapshot              JSONB,                           -- 福利套比例和取整规则快照

    remark                TEXT,
    last_calc_time        TIMESTAMPTZ,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(unique_hash, period)
);

-- ============================================================
-- 4. 内置不缴纳福利套
-- ============================================================
-- SI-00 不缴纳社保
INSERT INTO social_welfare_sets (
    code, name, region, is_builtin, status,
    pension_enabled, medical_enabled, unemployment_enabled, injury_enabled, maternity_enabled,
    pension_rate_p, medical_rate_p, medical_fixed_p, unemployment_rate_p,
    pension_rate_c, medical_rate_c, unemployment_rate_c, injury_rate_c, maternity_rate_c
) VALUES (
    'SI-00', '不缴纳社保', NULL, TRUE, '启用',
    FALSE, FALSE, FALSE, FALSE, FALSE,
    0, 0, 0, 0,
    0, 0, 0, 0, 0
) ON CONFLICT (code) DO NOTHING;

-- HF-00 不缴纳公积金
INSERT INTO housing_fund_sets (
    code, name, region, is_builtin, status,
    normal_rate_p, normal_rate_c, supp_enabled, supp_rate_p, supp_rate_c
) VALUES (
    'HF-00', '不缴纳公积金', NULL, TRUE, '启用',
    0, 0, FALSE, 0, 0
) ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 5. RLS 策略
-- ============================================================
ALTER TABLE social_welfare_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE housing_fund_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_welfare_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_full_access_social_welfare ON social_welfare_sets;
DROP POLICY IF EXISTS hr_full_access_housing_fund ON housing_fund_sets;
DROP POLICY IF EXISTS hr_full_access_emp_welfare ON employee_welfare_records;

CREATE POLICY hr_full_access_social_welfare ON social_welfare_sets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY hr_full_access_housing_fund ON housing_fund_sets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY hr_full_access_emp_welfare ON employee_welfare_records
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
