/** 格式化金额：￥12,345.67；0 显示横杠 */
export function formatMoney(val?: number | null): string {
  if (val == null || Number(val) === 0) return '—';
  return `¥${Number(val).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 格式化百分比：8% */
export function formatPercent(val?: number | null): string {
  if (val == null) return '—';
  return `${(Number(val) * 100).toFixed(2)}%`;
}

/** 计税模式文本 */
export function taxTypeLabel(type: string): string {
  const map: Record<string, string> = {
    normal: '正常计税',
    service: '劳务报酬',
    cash: '现金计税',
    non_taxable: '不计税',
  };
  return map[type] ?? type;
}

/** 社保状态文本 */
export function socialStatusLabel(s: string): string {
  const map: Record<string, string> = {
    '有社保': '有社保',
    '无社保': '无社保',
    '残疾人': '残疾人',
  };
  return map[s] ?? s;
}

/** 地区颜色 */
export function regionColor(region: string): string {
  const map: Record<string, string> = {
    '上海': '#1677ff',
    '北京': '#f5222d',
    '天津': '#fa8c16',
    '深圳': '#52c41a',
    '南京': '#722ed1',
    '香港': '#13c2c2',
  };
  return map[region] ?? '#888';
}

/** 当前月份默认值 */
export function defaultPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
