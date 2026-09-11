-- ============================================================
-- 花名册板块 v3 迁移 — 2026-08-13
-- 1. 重建 employees 表（15 核心字段 + unique_hash + id）
-- 2. 新建 company_mapping 表（28 条，含开弈中国-美元）
-- 发薪公司存简称，唯一值 = 姓名 + 发薪公司简称 + 入职日期 哈希
-- ============================================================

-- ============================================================
-- 1. 公司简称对应表 company_mapping（28 条）
-- ============================================================
DROP TABLE IF EXISTS company_mapping;

CREATE TABLE company_mapping (
    id            BIGSERIAL PRIMARY KEY,
    display_value VARCHAR(50)  NOT NULL UNIQUE,   -- 简称（存储值/展示值）
    full_name     VARCHAR(200) NOT NULL,          -- 全称（备用，不展示）
    region        VARCHAR(20),                    -- 地区
    sort_order    INT DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO company_mapping (display_value, full_name, region, sort_order) VALUES
('开弈中国',       '開弈（中國）人才服務有限公司',          '香港', 1),
('开弈中国-美元',  '開弈（中國）人才服務有限公司',          '香港', 2),
('时代开弈',       '中國時代開弈投資集團有限公司',          '香港', 3),
('开弈信息',       '开弈信息科技（中国）有限公司',          '上海', 4),
('开弈人才',       '上海开弈人才服务（集团）有限公司',      '上海', 5),
('开弈人力',       '上海开弈人力资源管理有限公司',          '上海', 6),
('开博人才',       '上海开博人才服务有限公司',              '上海', 7),
('靠普人力',       '上海靠普人力资源管理有限公司',          '上海', 8),
('开弈投资',       '上海开弈投资管理有限公司',              '上海', 9),
('开弈外包',       '上海开弈企业服务外包有限公司',          '上海', 10),
('开弈医疗',       '上海开弈医疗器械有限公司',              '上海', 11),
('开弈市场营销',   '上海开弈市场营销策划有限公司',          '上海', 12),
('弈工分信息',     '上海弈工分信息科技有限公司',            '上海', 13),
('弈工分健康',     '上海弈工分健康信息咨询有限公司',        '上海', 14),
('智名',           '智名信息技术（上海）有限公司',          '上海', 15),
('弈工分文化',     '上海弈工分文化体育发展有限公司',        '上海', 16),
('天津英才',       '开弈英才（天津）劳务服务有限公司',      '天津', 17),
('弈享天津',       '弈享（天津）共享经济信息咨询有限公司',  '天津', 18),
('深圳和弈',       '深圳市和弈劳务派遣有限公司',            '深圳', 19),
('深圳开弈信息',   '开弈信息技术（深圳）有限公司',          '深圳', 20),
('南京开弈人力',   '南京开弈人力资源管理有限公司',          '南京', 21),
('北京点才',       '北京开弈点才劳务服务有限公司',          '北京', 22),
('时代人才',       '上海时代人才有限公司',                  '上海', 23),
('朴素文化',       '上海朴素文化传播有限公司',              '上海', 24),
('开弈人力资源',   '上海开弈人力资源研究院',                '上海', 25),
('微芮洺',         '上海微芮洺信息科技有限公司',            '上海', 26),
('弈业信息',       '上海弈业信息技术有限公司',              '上海', 27),
('老龙馄饨',       '上海老龙馄饨有限公司',                  '上海', 28);

-- ============================================================
-- 2. 重建 employees 表（花名册 15 核心字段 + unique_hash + id）
-- ============================================================
DROP TABLE IF EXISTS employees;

CREATE TABLE employees (
    id              BIGSERIAL PRIMARY KEY,
    unique_hash     VARCHAR(16)  UNIQUE NOT NULL,    -- 唯一值：姓名+发薪公司简称+入职日期 哈希
    name            VARCHAR(50)  NOT NULL,           -- 姓名
    status          VARCHAR(10)  NOT NULL DEFAULT '在职',  -- 在职/离职
    cost_center     VARCHAR(100),                    -- 成本中心
    pay_company     VARCHAR(50)  NOT NULL,           -- 发薪公司（简称）
    tax_method      VARCHAR(10)  NOT NULL DEFAULT 'normal', -- normal/service/non_taxable
    department      VARCHAR(100),                    -- 部门
    report_to       VARCHAR(50),                     -- 汇报人
    position        VARCHAR(100),                    -- 职位
    job_level       VARCHAR(10),                      -- 职级 Ⅰ-Ⅶ（可为空）
    attendance_type VARCHAR(20)  NOT NULL DEFAULT '全日制',  -- 考勤制
    entry_date      DATE         NOT NULL,           -- 入职日期（唯一值组成部分，不可改）
    leave_date      DATE,                            -- 离职日期（填写后自动离职）
    is_disabled     BOOLEAN      DEFAULT FALSE,      -- 停用标记
    created_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_employees_status ON employees(status);
CREATE INDEX idx_employees_pay_company ON employees(pay_company);
CREATE INDEX idx_employees_department ON employees(department);
CREATE INDEX idx_employees_cost_center ON employees(cost_center);
CREATE INDEX idx_employees_entry_date ON employees(entry_date);
CREATE INDEX idx_employees_leave_date ON employees(leave_date);
CREATE INDEX idx_employees_active ON employees(status) WHERE status = '在职';

-- ============================================================
-- 3. RLS 策略
-- ============================================================
ALTER TABLE company_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_full_access_company_mapping ON company_mapping;
DROP POLICY IF EXISTS hr_full_access_employees ON employees;

CREATE POLICY hr_full_access_company_mapping ON company_mapping
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY hr_full_access_employees ON employees
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
