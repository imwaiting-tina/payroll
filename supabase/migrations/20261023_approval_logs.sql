-- ============================================================
-- 审批线：记录花名册 / 考勤 / 薪资 三个模块的审批动作
--
-- 每次提交、审批通过、退回修改、解冻成功后写一条记录，
-- 供顶部「审批线」弹窗展示"这个月是谁审批的"。
--
-- 幂等：可重复执行。
-- ============================================================

CREATE TABLE IF NOT EXISTS approval_logs (
    id           BIGSERIAL PRIMARY KEY,
    period       VARCHAR(7)  NOT NULL,      -- 所得期间 YYYY-MM
    module       VARCHAR(20) NOT NULL,      -- roster / attendance / payroll
    action       VARCHAR(20) NOT NULL,      -- submit / approve / reject / unlock
    actor_id     UUID,                      -- 操作者 auth.users.id（取自 JWT sub）
    actor_email  VARCHAR(200),              -- 操作者邮箱（取自 JWT email）
    actor_role   VARCHAR(30),               -- 操作时的角色快照
    note         TEXT,                      -- 备注（如薪资退回理由）
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_logs_period
    ON approval_logs(period, created_at DESC);

ALTER TABLE approval_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS approval_logs_read   ON approval_logs;
DROP POLICY IF EXISTS approval_logs_insert ON approval_logs;

-- 只给读和插入，不给更新/删除 → 记录一旦写入不可篡改
CREATE POLICY approval_logs_read ON approval_logs
    FOR SELECT TO authenticated USING (true);

CREATE POLICY approval_logs_insert ON approval_logs
    FOR INSERT TO authenticated WITH CHECK (true);

COMMENT ON TABLE approval_logs IS '审批线：三个模块的审批与解冻记录';
