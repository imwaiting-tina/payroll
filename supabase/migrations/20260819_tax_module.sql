-- ============================================================
-- 个税扣缴板块 — 2026-08-19
-- 4 张表：预扣率表、期初累计数表、专项附加扣除表、月度计算表
-- 关联键统一用 unique_hash（不用工号）
-- ============================================================

-- ============================================================
-- Tab 4：预扣率表（参数表，固定七级累进税率）
-- ============================================================
DROP TABLE IF EXISTS tax_brackets CASCADE;

CREATE TABLE tax_brackets (
    level            INT PRIMARY KEY,
    min_income       DECIMAL(14,2) NOT NULL,     -- 累计预扣预缴应纳税所得额下限
    max_income       DECIMAL(14,2),              -- 上限（NULL 表示无上限）
    rate             DECIMAL(5,4)  NOT NULL,     -- 预扣率
    quick_deduction  DECIMAL(12,2) NOT NULL,     -- 速算扣除数
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO tax_brackets (level, min_income, max_income, rate, quick_deduction) VALUES
(1, 0,        36000,   0.03, 0),
(2, 36000,    144000,  0.10, 2520),
(3, 144000,   300000,  0.20, 16920),
(4, 300000,   420000,  0.25, 31920),
(5, 420000,   660000,  0.30, 52920),
(6, 660000,   960000,  0.35, 85920),
(7, 960000,   NULL,    0.45, 181920);

-- ============================================================
-- Tab 1：期初累计数表（1-5月累计，一次性录入）
-- ============================================================
DROP TABLE IF EXISTS tax_opening_balances CASCADE;

CREATE TABLE tax_opening_balances (
    id                       BIGSERIAL PRIMARY KEY,
    unique_hash              VARCHAR(16) NOT NULL,        -- 关联员工
    cumul_income             DECIMAL(14,2) DEFAULT 0,     -- 累计应税收入(1-5月)
    cumul_five_insurance     DECIMAL(14,2) DEFAULT 0,     -- 累计五险一金(1-5月)
    cumul_special_deduction  DECIMAL(14,2) DEFAULT 0,     -- 累计专项附加扣除(1-5月)
    cumul_other_deduction    DECIMAL(14,2) DEFAULT 0,     -- 累计其他扣除(1-5月)
    cumul_tax_relief         DECIMAL(14,2) DEFAULT 0,     -- 累计减免税额(1-5月)
    cumul_tax_paid           DECIMAL(14,2) DEFAULT 0,     -- 累计预扣缴个税(1-5月)
    employed_months          INT DEFAULT 5,               -- 已任职月份数（期初为1-5月）
    remark                   TEXT,
    created_at               TIMESTAMPTZ DEFAULT NOW(),
    updated_at               TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(unique_hash)
);

-- ============================================================
-- Tab 2：专项附加扣除维护表（报税系统导入，按月覆盖）
-- ============================================================
DROP TABLE IF EXISTS tax_special_deductions CASCADE;

CREATE TABLE tax_special_deductions (
    id                   BIGSERIAL PRIMARY KEY,
    unique_hash          VARCHAR(16) NOT NULL,
    period               VARCHAR(7)  NOT NULL,            -- 所得期间 YYYY-MM
    id_type              VARCHAR(20),                     -- 证件类型
    id_number            VARCHAR(50),                     -- 证件号码
    cumul_child_edu      DECIMAL(12,2) DEFAULT 0,         -- 累计子女教育
    cumul_continuing_edu DECIMAL(12,2) DEFAULT 0,         -- 累计继续教育
    cumul_mortgage       DECIMAL(12,2) DEFAULT 0,         -- 累计住房贷款利息
    cumul_rent           DECIMAL(12,2) DEFAULT 0,         -- 累计住房租金
    cumul_elder_care     DECIMAL(12,2) DEFAULT 0,         -- 累计赡养老人
    cumul_infant_care    DECIMAL(12,2) DEFAULT 0,         -- 累计3岁以下婴幼儿照护
    cumul_pension        DECIMAL(12,2) DEFAULT 0,         -- 累计个人养老金
    cumul_annuity        DECIMAL(12,2) DEFAULT 0,         -- 企业(职业)年金
    cumul_health_ins     DECIMAL(12,2) DEFAULT 0,         -- 商业健康保险
    cumul_tax_defer_ins  DECIMAL(12,2) DEFAULT 0,         -- 税延养老保险
    cumul_donation       DECIMAL(12,2) DEFAULT 0,         -- 准予扣除的捐赠额
    tax_relief           DECIMAL(12,2) DEFAULT 0,         -- 减免税额
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(unique_hash, period)
);

-- ============================================================
-- Tab 3：个税月度计算表（6月起每月一行，滚动累计）
-- ============================================================
DROP TABLE IF EXISTS tax_monthly_calcs CASCADE;

CREATE TABLE tax_monthly_calcs (
    id                       BIGSERIAL PRIMARY KEY,
    unique_hash              VARCHAR(16) NOT NULL,
    period                   VARCHAR(7)  NOT NULL,        -- 所得期间 YYYY-MM

    -- 本期数
    current_taxable_income   DECIMAL(14,2) DEFAULT 0,     -- 本期应税收入
    current_tax_free_income  DECIMAL(14,2) DEFAULT 0,     -- 本期免税收入
    current_five_insurance   DECIMAL(14,2) DEFAULT 0,     -- 本期五险一金（=个人福利合计）
    current_special_deduct   DECIMAL(14,2) DEFAULT 0,     -- 本期专项附加扣除
    current_other_deduct     DECIMAL(14,2) DEFAULT 0,     -- 本期其他扣除
    current_tax_relief       DECIMAL(14,2) DEFAULT 0,     -- 本期减免税额

    -- 累计数
    cumul_taxable_income     DECIMAL(14,2) DEFAULT 0,     -- 累计应税收入
    cumul_tax_free_income    DECIMAL(14,2) DEFAULT 0,     -- 累计免税收入
    cumul_basic_deduction    DECIMAL(14,2) DEFAULT 0,     -- 累计减除费用(5000×月数)
    cumul_five_insurance     DECIMAL(14,2) DEFAULT 0,     -- 累计五险一金
    cumul_special_deduct     DECIMAL(14,2) DEFAULT 0,     -- 累计专项附加扣除
    cumul_other_deduct       DECIMAL(14,2) DEFAULT 0,     -- 累计其他扣除
    cumul_tax_relief         DECIMAL(14,2) DEFAULT 0,     -- 累计减免税额
    cumul_tax_paid           DECIMAL(14,2) DEFAULT 0,     -- 累计已预扣预缴税额

    -- 计算结果
    cumul_taxable_income_net DECIMAL(14,2) DEFAULT 0,     -- 累计预扣预缴应纳税所得额
    tax_rate                 DECIMAL(5,4),                -- 适用预扣率
    quick_deduction          DECIMAL(12,2),               -- 速算扣除数
    monthly_tax              DECIMAL(12,2) DEFAULT 0,     -- 当月个人所得税

    created_at               TIMESTAMPTZ DEFAULT NOW(),
    updated_at               TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(unique_hash, period)
);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE tax_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_opening_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_special_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_monthly_calcs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_tax_brackets ON tax_brackets;
DROP POLICY IF EXISTS hr_tax_opening ON tax_opening_balances;
DROP POLICY IF EXISTS hr_tax_special ON tax_special_deductions;
DROP POLICY IF EXISTS hr_tax_monthly ON tax_monthly_calcs;

CREATE POLICY hr_tax_brackets ON tax_brackets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY hr_tax_opening ON tax_opening_balances FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY hr_tax_special ON tax_special_deductions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY hr_tax_monthly ON tax_monthly_calcs FOR ALL TO authenticated USING (true) WITH CHECK (true);
