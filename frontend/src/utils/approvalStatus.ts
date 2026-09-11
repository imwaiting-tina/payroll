/**
 * 审批状态查询 — 供花名册/考勤/薪资三个模块共用，用于判断提交审批的先后顺序。
 */
import api from '../api/client';

export interface ApprovalStatus {
  period: string;
  rosterLocked: boolean;       // 花名册已锁定（审批通过）
  rosterSubmitted: boolean;    // 花名册已提交（待审批）
  attendanceLocked: boolean;   // 考勤已锁定
  attendanceSubmitted: boolean;// 考勤已提交
  payrollLocked: boolean;      // 薪资已锁定
  payrollSubmitted: boolean;   // 薪资已提交
}

function isLocked(v: string | undefined): boolean {
  return v === '已锁定' || v === '已提交老板查看';
}
function isSubmitted(v: string | undefined): boolean {
  return v === '已提交审批';
}

/**
 * 一次性拉取当月三个模块的审批状态（需先 ensure 花名册，由调用方负责）。
 */
export async function fetchApprovalStatus(period: string): Promise<ApprovalStatus> {
  const [rosterRes, attRes, salRes] = await Promise.all([
    api.get(`/employees?select=data_status&period=eq.${period}`),
    api.get(`/attendance_records?select=data_status&period=eq.${period}`),
    api.get(`/salary_records?select=data_status&period=eq.${period}`),
  ]);

  const rosterStatuses = rosterRes.data.map((r: any) => r.data_status);
  const attStatuses = attRes.data.map((r: any) => r.data_status);
  const salStatuses = salRes.data.map((r: any) => r.data_status);

  const has = (arr: string[], pred: (v: string) => boolean) => arr.some(v => pred(v ?? ''));

  return {
    period,
    rosterLocked: has(rosterStatuses, isLocked),
    rosterSubmitted: has(rosterStatuses, isSubmitted),
    attendanceLocked: has(attStatuses, isLocked),
    attendanceSubmitted: has(attStatuses, isSubmitted),
    payrollLocked: has(salStatuses, isLocked),
    payrollSubmitted: has(salStatuses, isSubmitted),
  };
}

/**
 * 前置是否完成：
 *  - 提交考勤审批的前提：花名册已锁定
 *  - 提交薪资审批的前提：花名册已锁定 且 考勤已锁定
 *  - 提交花名册审批：无前置
 */
export function getRosterGate(status: ApprovalStatus): { pass: boolean; reason: string } {
  return { pass: true, reason: '' };
}
export function getAttendanceGate(status: ApprovalStatus): { pass: boolean; reason: string } {
  if (!status.rosterLocked) return { pass: false, reason: '花名册还未审批通过' };
  return { pass: true, reason: '' };
}
export function getPayrollGate(status: ApprovalStatus): { pass: boolean; reason: string } {
  if (!status.rosterLocked) return { pass: false, reason: '花名册还未审批通过' };
  if (!status.attendanceLocked) return { pass: false, reason: '考勤还未审批通过' };
  return { pass: true, reason: '' };
}
