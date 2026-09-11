-- ============================================================
-- payroll-system schema v2 migration — 2026-08-12
-- 重构为按月份存储的结构，新增社保管理/考勤管理/薪资计算字段
-- 唯一值使用 name+company_full_name 的 SHA256 前 16 位
-- ============================================================

-- ============================================================
-- 1. 员工花名册 — employees
-- ============================================================
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS unique_hash   VARCHAR(16) UNIQUE,
  ADD COLUMN IF NOT EXISTS cost_center   VARCHAR(100),        -- 成本中心
  ADD COLUMN IF NOT EXISTS reporter      VARCHAR(50),         -- 汇报人
  ADD COLUMN IF NOT EXISTS work_schedule VARCHAR(30) DEFAULT '全日制'; -- 考勤制

-- 为已有数据生成唯一值 (name + company_full_name 哈希)
-- 注意：只在 unique_hash 为空的情况下更新
UPDATE employees SET unique_hash = LEFT(
  encode(digest(name || '|' || company_full_name, 'sha256'), 'hex'),
  16
) WHERE unique_hash IS NULL;

ALTER TABLE employees ALTER COLUMN unique_hash SET NOT NULL;

-- 删除不再需要的旧字段
ALTER TABLE employees
  DROP COLUMN IF EXISTS employee_no,
  DROP COLUMN IF EXISTS social_status,
  DROP COLUMN IF EXISTS social_base,
  DROP COLUMN IF EXISTS housing_fund_base;

-- ============================================================
-- 2. 福利套设置 — welfare_sets
-- ============================================================
CREATE TABLE IF NOT EXISTS welfare_sets (
    id                  BIGSERIAL PRIMARY KEY,
    name                VARCHAR(50)  NOT NULL UNIQUE,      -- 福利套名称（上海社保/上海社保1/深圳社保...）
    region              VARCHAR(20)  NOT NULL,             -- 地区
    description         TEXT,

    -- 个人费率
    pension_rate_p      DECIMAL(6,4),                       -- 个人养老
    medical_rate_p      DECIMAL(6,4),                       -- 个人医疗
    medical_fixed_p     DECIMAL(8,2) DEFAULT 0,            -- 个人医疗固定附加费
    unemployment_rate_p DECIMAL(6,4),                       -- 个人失业
    housing_fund_rate_p DECIMAL(6,4),                       -- 个人公积金
    supp_housing_rate_p DECIMAL(6,4) DEFAULT 0,            -- 个人补充公积金

    -- 公司费率
    pension_rate_c      DECIMAL(6,4),                       -- 公司养老
    medical_rate_c      DECIMAL(6,4),                       -- 公司医疗
    unemployment_rate_c DECIMAL(6,4),                       -- 公司失业
    injury_rate_c       DECIMAL(6,4),                       -- 公司工伤
    maternity_rate_c    DECIMAL(6,4),                       -- 公司生育
    housing_fund_rate_c DECIMAL(6,4),                       -- 公司公积金
    supp_housing_rate_c DECIMAL(6,4) DEFAULT 0,            -- 公司补充公积金

    rounding_method     VARCHAR(10) DEFAULT 'ROUND',
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. 社保管理 — social_records（每月每条员工一条）
-- ============================================================
CREATE TABLE IF NOT EXISTS social_records (
    id                  BIGSERIAL PRIMARY KEY,
    unique_hash         VARCHAR(16) NOT NULL,               -- 关联员工
    period              VARCHAR(7)  NOT NULL,               -- YYYY-MM
    welfare_set         VARCHAR(50) NOT NULL,               -- 福利套名称
    social_base         DECIMAL(12,2),                      -- 社保基数
    housing_fund_base   DECIMAL(12,2),                      -- 公积金基数

    -- 个人部分
    pension_p           DECIMAL(12,2),                      -- 个人养老
    medical_p           DECIMAL(12,2),                      -- 个人医疗
    unemployment_p      DECIMAL(12,2),                      -- 个人失业
    housing_fund_p      DECIMAL(12,2),                      -- 个人公积金
    supp_housing_p      DECIMAL(12,2),                      -- 个人补充公积金

    -- 公司部分
    pension_c           DECIMAL(12,2),                      -- 公司养老
    medical_c           DECIMAL(12,2),                      -- 公司医疗
    unemployment_c      DECIMAL(12,2),                      -- 公司失业
    injury_c            DECIMAL(12,2),                      -- 公司工伤
    maternity_c         DECIMAL(12,2),                      -- 公司生育
    housing_fund_c      DECIMAL(12,2),                      -- 公司公积金
    supp_housing_c      DECIMAL(12,2),                      -- 公司补充公积金

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(unique_hash, period)
);

-- ============================================================
-- 4. 考勤管理 — 重建 attendance_records
-- ============================================================
DROP TABLE IF EXISTS attendance_records CASCADE;

CREATE TABLE IF NOT EXISTS attendance_records (
    id                  BIGSERIAL PRIMARY KEY,
    unique_hash         VARCHAR(16) NOT NULL,               -- 关联员工
    period              VARCHAR(7)  NOT NULL,               -- YYYY-MM

    -- 各类型假的天数
    sick_days           DECIMAL(5,1) DEFAULT 0,             -- 病假
    personal_days       DECIMAL(5,1) DEFAULT 0,             -- 事假
    annual_leave        DECIMAL(5,1) DEFAULT 0,             -- 年假
    compensatory_leave  DECIMAL(5,1) DEFAULT 0,             -- 调休
    absenteeism_days    DECIMAL(5,1) DEFAULT 0,             -- 旷工
    funeral_leave       DECIMAL(5,1) DEFAULT 0,             -- 丧假
    parental_leave      DECIMAL(5,1) DEFAULT 0,             -- 育儿假
    marriage_leave      DECIMAL(5,1) DEFAULT 0,             -- 婚假
    maternity_leave     DECIMAL(5,1) DEFAULT 0,             -- 产假
    overtime_days       DECIMAL(5,1) DEFAULT 0,             -- 加班

    -- 金额
    sick_adjust         DECIMAL(12,2) DEFAULT 0,            -- 病假调整金额
    personal_adjust     DECIMAL(12,2) DEFAULT 0,            -- 事假调整金额
    on_off_adjust       DECIMAL(12,2) DEFAULT 0,            -- 入离职调整

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(unique_hash, period)
);

-- ============================================================
-- 5. 薪资计算 — 重建 salary_records
-- ============================================================
DROP TABLE IF EXISTS salary_records CASCADE;

CREATE TABLE IF NOT EXISTS salary_records (
    id                  BIGSERIAL PRIMARY KEY,
    unique_hash         VARCHAR(16) NOT NULL,               -- 关联员工
    period              VARCHAR(7)  NOT NULL,               -- YYYY-MM

    -- 基本信息（从花名册/社保/考勤关联）
    month_number        INT          NOT NULL,              -- 1-12

    -- 收入项（始终展示）
    base_salary         DECIMAL(12,2),                      -- 基本工资
    allowance_supp      DECIMAL(12,2) DEFAULT 0,            -- 补贴/补充公积金
    attendance_adjust   DECIMAL(12,2) DEFAULT 0,            -- 考勤调整
    other_adjust        DECIMAL(12,2) DEFAULT 0,            -- 其他补贴/调整
    insurance_amount    DECIMAL(12,2) DEFAULT 0,            -- 商保金额
    kpi_provision       DECIMAL(12,2) DEFAULT 0,            -- KPI预提
    monthly_wage        DECIMAL(12,2),                      -- 本月工资
    office_comm         DECIMAL(12,2) DEFAULT 0,            -- 商办佣金
    performance_pay     DECIMAL(12,2) DEFAULT 0,            -- 绩效
    apartment_comm      DECIMAL(12,2) DEFAULT 0,            -- 公寓佣金
    talent_kpi          DECIMAL(12,2) DEFAULT 0,            -- 人才系KPI
    heat_allowance      DECIMAL(12,2) DEFAULT 0,            -- 防暑降温费
    other_allowance     DECIMAL(12,2) DEFAULT 0,            -- 津贴
    security_bonus      DECIMAL(12,2) DEFAULT 0,            -- 保安奖金
    cleaning_bonus      DECIMAL(12,2) DEFAULT 0,            -- 保洁奖金

    -- 薪资小计（计算字段）
    wage_subtotal       DECIMAL(12,2),                      -- 薪资小计

    -- 社保基数（从社保管理关联）
    social_base         DECIMAL(12,2),                      -- 社保基数
    housing_fund_base   DECIMAL(12,2),                      -- 公积金基数

    -- 个人福利明细（折叠，数据可从社保管理关联）
    pension_p           DECIMAL(12,2),                      -- 个人养老
    medical_p           DECIMAL(12,2),                      -- 个人医疗
    unemployment_p      DECIMAL(12,2),                      -- 个人失业
    housing_fund_p      DECIMAL(12,2),                      -- 个人公积金
    supp_housing_p      DECIMAL(12,2),                      -- 个人补充公积金

    -- 隐藏字段 — 专项附加扣除（累计）
    cumul_child_edu      DECIMAL(12,2) DEFAULT 0,           -- 累计子女教育
    cumul_mortgage       DECIMAL(12,2) DEFAULT 0,           -- 累计住房贷款利息
    cumul_rent           DECIMAL(12,2) DEFAULT 0,           -- 累计住房租金
    cumul_elder_care     DECIMAL(12,2) DEFAULT 0,           -- 累计赡养老人
    cumul_continuing_edu DECIMAL(12,2) DEFAULT 0,           -- 累计继续教育

    -- 隐藏字段 — 个税计算中间值
    month_taxable_wage   DECIMAL(12,2),                     -- 本期纳税工资
    cumul_income         DECIMAL(14,2),                     -- 累计收入
    taxable_income       DECIMAL(14,2),                     -- 应纳税所得额
    cumul_tax_paid       DECIMAL(14,2),                     -- 累计已扣税额

    -- 当月个税
    monthly_tax          DECIMAL(12,2),                     -- 当月个人所得税

    -- 商保调整
    insurance_adjust     DECIMAL(12,2) DEFAULT 0,           -- 商保调整

    -- 实收工资
    net_pay              DECIMAL(12,2),                     -- 实收工资

    -- 公司福利明细（折叠）
    pension_c            DECIMAL(12,2),                     -- 公司养老
    medical_c            DECIMAL(12,2),                     -- 公司医疗
    unemployment_c       DECIMAL(12,2),                     -- 公司失业
    injury_c             DECIMAL(12,2),                     -- 公司工伤
    maternity_c          DECIMAL(12,2),                     -- 公司生育
    housing_fund_c       DECIMAL(12,2),                     -- 公司公积金
    supp_housing_c       DECIMAL(12,2),                     -- 公司补充公积金

    -- 企业人力成本相关
    total_cost           DECIMAL(12,2),                     -- 企业人力成本总计
    provision_welfare    DECIMAL(12,2) DEFAULT 0,           -- 预提福利费

    -- 锁定
    is_locked            BOOLEAN DEFAULT FALSE,
    locked_reason        TEXT,

    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(unique_hash, period)
);

-- ============================================================
-- 6. RLS Policies — 新表和重建的表
-- ============================================================
ALTER TABLE welfare_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY hr_full_access_welfare     ON welfare_sets        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY hr_full_access_social_rec  ON social_records      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY hr_full_access_attendance  ON attendance_records  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY hr_full_access_salary      ON salary_records      FOR ALL TO authenticated USING (true) WITH CHECK (true);
