/**
 * 审批线 — 记录并查询三个模块的审批动作
 *
 * 每次提交/审批通过/退回/解冻成功后写一条记录，用于「审批线」弹窗回答
 * "这个月是谁审批的、什么时候审批的"。解冻行为同样留痕。
 */
import api from '../api/client';
import { getRole, Role } from './permissions';

export type ApprovalModule = 'roster' | 'attendance' | 'payroll';
export type ApprovalAction = 'submit' | 'approve' | 'reject' | 'unlock';

export interface ApprovalLog {
  id: number;
  period: string;
  module: ApprovalModule;
  action: ApprovalAction;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  note: string | null;
  created_at: string;
}

export interface CurrentUser {
  id?: string;
  email?: string;
  role: Role;
}

export const MODULE_LABELS: Record<ApprovalModule, string> = {
  roster: '员工花名册',
  attendance: '考勤管理',
  payroll: '薪资计算',
};

export const ACTION_LABELS: Record<ApprovalAction, string> = {
  submit: '提交审批',
  approve: '审批通过',
  reject: '退回修改',
  unlock: '解冻',
};

export const ACTION_COLORS: Record<ApprovalAction, string> = {
  submit: 'blue',
  approve: 'green',
  reject: 'red',
  unlock: 'orange',
};

/**
 * 从 localStorage 中的 JWT 解析当前操作者身份。
 * 解析失败（无 token / 格式异常）时只保留角色，其余字段留空。
 */
export function getCurrentUser(): CurrentUser {
  const role = getRole();
  try {
    const token = localStorage.getItem('supabase_token') || '';
    const part = token.split('.')[1];
    if (!part) return { role };
    // JWT 用的是 base64url，先还原成标准 base64 再解码
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64));
    return { id: payload?.sub, email: payload?.email, role };
  } catch {
    return { role };
  }
}

/**
 * 写一条审批记录。
 * 留痕失败只告警，绝不阻断审批主流程——状态已经改成功了，不能因为日志写不进去就报错。
 */
export async function logApproval(input: {
  period: string;
  module: ApprovalModule;
  action: ApprovalAction;
  note?: string;
}): Promise<void> {
  try {
    const user = getCurrentUser();
    await api.post('/approval_logs', {
      period: input.period,
      module: input.module,
      action: input.action,
      actor_id: user.id || null,
      actor_email: user.email || null,
      actor_role: user.role,
      note: input.note || null,
    });
  } catch (e) {
    console.warn('[approval_logs] 写入失败', e);
  }
}

/** 查询某个月的全部审批记录，最新在前 */
export async function fetchApprovalLogs(period: string): Promise<ApprovalLog[]> {
  const res = await api.get(`/approval_logs?period=eq.${period}&order=created_at.desc`);
  return res.data || [];
}
