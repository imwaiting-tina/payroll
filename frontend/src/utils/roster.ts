/**
 * 花名册按月存储 - 工具函数
 * 确保某月花名册已生成（未生成则自动调用 RPC 按需生成）。
 */
import api from '../api/client';

/**
 * 确保某月花名册存在。
 * 如果该月还没有花名册记录，则调用数据库函数 generate_roster_for_month 按需生成。
 * @param period 月份 YYYY-MM
 */
export async function ensureRoster(period: string): Promise<void> {
  if (!period) return;
  try {
    // 先查该月是否有花名册
    const res = await api.get(`/employees?select=unique_hash&period=eq.${period}&limit=1`);
    if (res.data.length === 0) {
      // 没有则按需生成（以 6 月基准为源）
      await api.post('/rpc/generate_roster_for_month', { p_period: period });
    }
  } catch {
    // 静默失败，不影响主流程
  }
}
