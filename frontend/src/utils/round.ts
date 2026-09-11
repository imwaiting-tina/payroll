/**
 * 统一金额四舍五入工具
 *
 * 修正 JavaScript 浮点误差导致的四舍五入错误。
 * 例如 811.5 × 0.03 实际等于 24.344999...，用 toFixed(2) 会错误得到 24.34，
 * 正确的四舍五入应该是 24.35（看第三位小数：0.345 → 进位）。
 *
 * 用法：
 *   import { round2 } from './round';
 *   round2(24.345)  // => 24.35
 *   round2(-0.345)  // => -0.35（按绝对值四舍五入，再恢复符号）
 */

export function round2(v: number): number {
  if (v === undefined || v === null || Number.isNaN(Number(v))) return 0;
  const num = Number(v);
  const sign = num < 0 ? -1 : 1;
  const abs = Math.abs(num);
  // 用 1e-9 抵消浮点误差
  const rounded = Math.round((abs + 1e-9) * 100) / 100;
  const result = sign * rounded;
  return Object.is(result, -0) ? 0 : result;
}
