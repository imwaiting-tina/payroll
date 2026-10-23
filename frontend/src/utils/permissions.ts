/**
 * 权限角色定义 — v2 审批体系
 *
 * 六类角色：
 *   admin          管理员 — 最高权限，创建/停用账号，所有模块可看可操作
 *   hr_staff       人事专员 — 修改数据，提交 花名册/考勤/薪资 的审批
 *   roster_approver  花名册审批 — 员工花名册审批，通过后当月花名册冻结
 *   attendance_approver 考勤审批 — 考勤管理审批，通过后当月考勤冻结
 *   payroll_approver   薪资审批 — 薪资计算审批，通过后当月薪资冻结
 *   viewer         查阅 — 只读，可查看、可导出，不能导入或修改任何数据
 */

export type Role =
  | 'admin'
  | 'hr_staff'
  | 'roster_approver'
  | 'attendance_approver'
  | 'payroll_approver'
  | 'viewer';

export const DEFAULT_ROLE: Role = 'hr_staff';

export const ROLE_LABELS: Record<Role, string> = {
  admin: '管理员',
  hr_staff: '人事专员',
  roster_approver: '花名册审批',
  attendance_approver: '考勤审批',
  payroll_approver: '薪资审批',
  viewer: '查阅',
};

export const ROLE_COLORS: Record<Role, string> = {
  admin: 'red',
  hr_staff: 'cyan',
  roster_approver: 'blue',
  attendance_approver: 'green',
  payroll_approver: 'orange',
  viewer: 'purple',
};

/** 账号管理里的角色选项 */
export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'admin', label: '管理员（全部权限）' },
  { value: 'hr_staff', label: '人事专员（修改数据+提交审批）' },
  { value: 'roster_approver', label: '花名册审批' },
  { value: 'attendance_approver', label: '考勤审批' },
  { value: 'payroll_approver', label: '薪资审批' },
  { value: 'viewer', label: '查阅（只读，可下载，不可导入）' },
];

/** 从 localStorage 读取当前用户角色 */
export function getRole(): Role {
  const r = localStorage.getItem('user_role');
  if (r && r in ROLE_LABELS) return r as Role;
  return DEFAULT_ROLE;
}

/** 当前用户是否管理员 */
export function isAdmin(): boolean {
  return getRole() === 'admin';
}

/** 当前用户是否人事专员 */
export function isHrStaff(): boolean {
  return getRole() === 'hr_staff';
}

/** 是否为花名册审批人 */
export function isRosterApprover(): boolean {
  return getRole() === 'roster_approver';
}

/** 是否为考勤审批人 */
export function isAttendanceApprover(): boolean {
  return getRole() === 'attendance_approver';
}

/** 是否为薪资审批人 */
export function isPayrollApprover(): boolean {
  return getRole() === 'payroll_approver';
}

/** 是否为查阅角色（只读） */
export function isViewer(): boolean {
  return getRole() === 'viewer';
}

/**
 * 当前用户是否可修改数据。
 * 查阅角色一律只读：可以查看和导出，但不能导入、编辑、删除、计算或保存。
 */
export function canEdit(): boolean {
  return getRole() !== 'viewer';
}

/**
 * 是否可以提交该模块的审批。
 * 只有人事专员可提交；管理员只负责分配权限，不提交也不审批。
 */
export function canSubmit(module: 'roster' | 'attendance' | 'payroll'): boolean {
  return isHrStaff();
}

/**
 * 是否可以审批该模块（仅对应审批角色；管理员不审批）。
 */
export function canApprove(module: 'roster' | 'attendance' | 'payroll'): boolean {
  switch (module) {
    case 'roster': return isRosterApprover();
    case 'attendance': return isAttendanceApprover();
    case 'payroll': return isPayrollApprover();
    default: return false;
  }
}
