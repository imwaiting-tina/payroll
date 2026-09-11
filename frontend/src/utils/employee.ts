/**
 * 员工在指定月份是否属于在职范围。
 *
 * 规则：
 * - 在职(status=在职)：任何月份都算在内。
 * - 离职(status=离职)：离职日期所在月份及之前都算在内（当月哪怕只上一天班也要有数据），
 *   离职月份之后的月份不再显示。
 * - 无离职日期、或状态未知：按"在职"处理（兼容旧数据）。
 *
 * @param emp 员工对象（需含 status、leave_date 字段）
 * @param period 月份，格式 YYYY-MM；不传则离职人员默认不显示
 */
export function isActiveInPeriod(emp: any, period?: string): boolean {
  if (!emp) return false;
  const status = emp.status;
  // 在职（或没有明确离职状态）一律显示
  if (status === '在职') return true;
  if (status === '离职') {
    const leaveDate = emp.leave_date;
    if (!leaveDate) return !period; // 没有离职日期时：无月份上下文则显示，有月份则按离职处理不显示
    const leaveMonth = String(leaveDate).slice(0, 7); // YYYY-MM
    if (!period) return false;
    return period <= leaveMonth;
  }
  // 状态未知/空，按在职处理（兼容）
  return true;
}
