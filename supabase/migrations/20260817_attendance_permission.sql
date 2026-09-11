-- ============================================================
-- 考勤板块 + 权限 v1 迁移 — 2026-08-17
-- 1. 重建 attendance_records 表（完整考勤字段）
-- 2. 新建 attendance_adjustments 表（特殊调整）
-- 3. 新建 attendance_rules 表（规则配置）
-- 4. 用户角色（用 auth.users 的 raw_user_meta_data 存 role）
-- ============================================================

-- ============================================================
-- 1. 考勤记录主表
-- ============================================================
DROP TABLE IF EXISTS attendance_records CASCADE;

CREATE TABLE attendance_records (
    id                    BIGSERIAL PRIMARY KEY,
    unique_hash           VARCHAR(16) NOT NULL,           -- 唯一值：姓名+发薪公司+入职日期
    period                VARCHAR(7)  NOT NULL,           -- 结算月份 YYYY-MM

    -- 薪酬基础
    basic_salary          DECIMAL(12,2),                  -- 基本工资（数据源）
    pay_days              DECIMAL(5,2),                   -- 计薪天数：21.75/26/30
    currency              VARCHAR(10) DEFAULT '人民币',    -- 币种

    -- 病假
    sick_days             DECIMAL(5,1) DEFAULT 0,         -- 病假天数
    is_continuous_sick    BOOLEAN DEFAULT FALSE,          -- 是否连续病假
    continuous_sick_start DATE,                           -- 连续病假开始日期
    continuous_sick_end   DATE,                           -- 连续病假结束日期
    sick_pay_rate         DECIMAL(5,4),                   -- 病假支付系数（系统计算）
    sick_amount           DECIMAL(12,2) DEFAULT 0,        -- 病假金额（系统计算）

    -- 事假
    personal_days         DECIMAL(5,1) DEFAULT 0,         -- 事假天数
    personal_amount       DECIMAL(12,2) DEFAULT 0,        -- 事假金额（系统计算）

    -- 年假/调休
    annual_leave          DECIMAL(5,1) DEFAULT 0,         -- 年假（不扣款）
    compensatory_leave    DECIMAL(5,1) DEFAULT 0,         -- 调休（系数0）

    -- 旷工
    absenteeism_days      DECIMAL(5,1) DEFAULT 0,         -- 旷工天数
    absenteeism_amount    DECIMAL(12,2) DEFAULT 0,        -- 旷工金额（系统计算）

    -- 其他假期（默认不扣款）
    funeral_leave         DECIMAL(5,1) DEFAULT 0,         -- 丧假
    parental_leave        DECIMAL(5,1) DEFAULT 0,         -- 育儿假
    marriage_leave        DECIMAL(5,1) DEFAULT 0,         -- 婚假
    maternity_leave       DECIMAL(5,1) DEFAULT 0,         -- 产假

    -- 加班
    overtime_type         VARCHAR(20),                    -- 平时加班/周末加班/法定节假日加班
    overtime_unit         VARCHAR(10) DEFAULT '天',       -- 天/小时
    overtime_qty          DECIMAL(8,1) DEFAULT 0,         -- 加班数量（天数或小时）
    hourly_rate           DECIMAL(12,2),                  -- 时薪（按小时加班时）
    holiday_fixed_amount  DECIMAL(12,2),                  -- 法定节假日固定金额（保洁）
    overtime_amount       DECIMAL(12,2) DEFAULT 0,        -- 加班金额（系统计算）

    -- 入离职
    actual_attendance_days DECIMAL(5,1),                  -- 实际出勤天数
    transfer_date          DATE,                          -- 发薪公司转移日期
    on_off_adjust          DECIMAL(12,2) DEFAULT 0,       -- 入离职调整（系统计算）

    -- 特殊调整
    special_adjust_amount  DECIMAL(12,2) DEFAULT 0,       -- 特殊考勤调整金额

    -- 合计（系统计算）
    attendance_adjust_total DECIMAL(12,2) DEFAULT 0,      -- 考勤调整合计

    -- 状态与来源
    data_status           VARCHAR(20) DEFAULT '草稿',     -- 草稿/已计算/已提交老板查看/退回修改/已导出/已锁定
    data_source           VARCHAR(20) DEFAULT '导入',     -- 导入/单独新增/系统计算
    abnormal_status       VARCHAR(20),                    -- 异常状态（正常/异常原因）
    remark                TEXT,                           -- 备注
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(unique_hash, period)
);

-- 索引
CREATE INDEX idx_attendance_period ON attendance_records(period);
CREATE INDEX idx_attendance_hash ON attendance_records(unique_hash);
CREATE INDEX idx_attendance_status ON attendance_records(data_status);

-- ============================================================
-- 2. 特殊调整明细表
-- ============================================================
DROP TABLE IF EXISTS attendance_adjustments CASCADE;

CREATE TABLE attendance_adjustments (
    id                BIGSERIAL PRIMARY KEY,
    unique_hash       VARCHAR(16) NOT NULL,
    period            VARCHAR(7)  NOT NULL,
    adjust_type       VARCHAR(30) NOT NULL,               -- 考勤调整/津贴/补贴/实习津贴/其他
    adjust_base       DECIMAL(12,2),                      -- 调整基数
    adjust_qty        DECIMAL(8,2),                       -- 调整数量
    adjust_unit       VARCHAR(10),                        -- 天/小时/次
    adjust_ratio      DECIMAL(5,4),                       -- 绩效/计发比例
    fixed_amount      DECIMAL(12,2),                      -- 固定调整金额
    direction         VARCHAR(10) NOT NULL DEFAULT '增发',-- 增发/扣减
    currency          VARCHAR(10) DEFAULT '人民币',
    reason            TEXT NOT NULL,                      -- 调整原因（必填）
    attachment_note   TEXT,                               -- 附件说明
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_adj_hash_period ON attendance_adjustments(unique_hash, period);

-- ============================================================
-- 3. 考勤规则配置表
-- ============================================================
DROP TABLE IF EXISTS attendance_rules CASCADE;

CREATE TABLE attendance_rules (
    id                BIGSERIAL PRIMARY KEY,
    rule_type         VARCHAR(30) NOT NULL,               -- sick/pay_days/leave/overtime/special
    rule_key          VARCHAR(50),                        -- 规则标识
    rule_name         VARCHAR(100) NOT NULL,
    rule_value        JSONB,                              -- 规则具体配置（JSON）
    effective_month   VARCHAR(7),                         -- 生效月份
    expiry_month      VARCHAR(7),                         -- 失效月份
    applicable_scope  VARCHAR(50),                        -- 适用公司/部门/岗位（可为空=全部）
    remark            TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 插入默认病假规则（工龄 + 连续病假档位）
INSERT INTO attendance_rules (rule_type, rule_key, rule_name, rule_value) VALUES
('sick', 'sick_lt_6m', '连续病假6个月内', '[
    {"min_years":0, "max_years":2, "pay_rate":0.60},
    {"min_years":2, "max_years":4, "pay_rate":0.70},
    {"min_years":4, "max_years":6, "pay_rate":0.80},
    {"min_years":6, "max_years":8, "pay_rate":0.90},
    {"min_years":8, "max_years":null, "pay_rate":1.00}
]'::jsonb),
('sick', 'sick_gte_6m', '连续病假超6个月（疾病救济费）', '[
    {"min_years":0, "max_years":1, "pay_rate":0.40},
    {"min_years":1, "max_years":3, "pay_rate":0.50},
    {"min_years":3, "max_years":null, "pay_rate":0.60}
]'::jsonb),
('pay_days', 'pay_days_options', '计薪天数', '{"options":[21.75, 26, 30]}'::jsonb),
('overtime', 'overtime_rates', '加班倍数', '[
    {"type":"平时加班", "rate":1},
    {"type":"周末加班", "rate":2},
    {"type":"法定节假日加班", "rate":3}
]'::jsonb);

-- ============================================================
-- 4. 用户角色
-- 说明：角色存在 auth.users 的 raw_user_meta_data.role 字段
-- 三个角色：admin（管理员）、boss（老板）、operator（操作）
-- 第一个账号需手动执行下面的 UPDATE 设为 admin
-- ============================================================
-- UPDATE auth.users
-- SET raw_user_meta_data = jsonb_set(
--     COALESCE(raw_user_meta_data, '{}'::jsonb),
--     '{role}',
--     '"admin"'
-- )
-- WHERE email = '你的管理员邮箱';

-- ============================================================
-- 5. RLS
-- ============================================================
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_attendance_records ON attendance_records;
DROP POLICY IF EXISTS hr_attendance_adjustments ON attendance_adjustments;
DROP POLICY IF EXISTS hr_attendance_rules ON attendance_rules;

CREATE POLICY hr_attendance_records ON attendance_records
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY hr_attendance_adjustments ON attendance_adjustments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY hr_attendance_rules ON attendance_rules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
