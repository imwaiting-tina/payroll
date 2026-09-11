/**
 * 考勤计算引擎
 *
 * 根据考勤数据 + 花名册字段，自动计算各假期金额、加班金额、入离职调整、调整金额和合计。
 * 所有金额四舍五入保留两位小数。
 *
 * 计算规则优先读取 attendance_rules 表（通过 parseAttendanceRules 解析后传入），
 * 数据库未配置时回退到 DEFAULT_ATTENDANCE_RULES 内置默认值。
 */

import { round2 } from './round';

/** 连续病假"超6个月"的天数阈值（按 180 天近似 6 个自然月） */
const SIX_MONTHS_DAYS = 180;

/** 病假支付系数分档（按本企业连续工龄） */
export interface SickPayTier {
  min_years: number;           // 工龄下限（含）
  max_years: number | null;    // 工龄上限（不含，null 表示无上限）
  pay_rate: number;            // 支付系数 0-1
}

/** 加班倍率 */
export interface OvertimeRate {
  type: string;                // 平时加班/周末加班/法定节假日加班
  rate: number;                // 倍率
}

/** 考勤计算规则（对应 attendance_rules 表） */
export interface AttendanceRules {
  sick_lt_6m: SickPayTier[];       // 连续病假 ≤ 6 个月（疾病休假工资）
  sick_gte_6m: SickPayTier[];      // 连续病假 > 6 个月（疾病救济费）
  pay_days_options: number[];      // 计薪天数选项
  overtime_rates: OvertimeRate[];  // 加班倍率
}

/** 内置默认规则（与 attendance_rules 表种子数据一致） */
export const DEFAULT_ATTENDANCE_RULES: AttendanceRules = {
  sick_lt_6m: [
    { min_years: 0, max_years: 2, pay_rate: 0.60 },
    { min_years: 2, max_years: 4, pay_rate: 0.70 },
    { min_years: 4, max_years: 6, pay_rate: 0.80 },
    { min_years: 6, max_years: 8, pay_rate: 0.90 },
    { min_years: 8, max_years: null, pay_rate: 1.00 },
  ],
  sick_gte_6m: [
    { min_years: 0, max_years: 1, pay_rate: 0.40 },
    { min_years: 1, max_years: 3, pay_rate: 0.50 },
    { min_years: 3, max_years: null, pay_rate: 0.60 },
  ],
  pay_days_options: [21.75, 26, 30],
  overtime_rates: [
    { type: '平时加班', rate: 1 },
    { type: '周末加班', rate: 2 },
    { type: '法定节假日加班', rate: 3 },
    { type: '保安法定加班', rate: 2 },
  ],
};

/** 安全解析 JSONB 值（PostgREST 可能已解析成对象，也可能是 JSON 字符串） */
function asValue(v: any): any {
  if (v == null) return null;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return null; }
  }
  return v;
}

function normalizeTier(t: any): SickPayTier {
  return {
    min_years: Number(t?.min_years ?? 0),
    max_years: t?.max_years == null ? null : Number(t.max_years),
    pay_rate: Number(t?.pay_rate ?? 0),
  };
}

/** 从 attendance_rules 表原始行解析成计算用的规则对象（缺项回退默认值） */
export function parseAttendanceRules(raw: any[]): AttendanceRules {
  const out: AttendanceRules = {
    sick_lt_6m: DEFAULT_ATTENDANCE_RULES.sick_lt_6m.map(t => ({ ...t })),
    sick_gte_6m: DEFAULT_ATTENDANCE_RULES.sick_gte_6m.map(t => ({ ...t })),
    pay_days_options: [...DEFAULT_ATTENDANCE_RULES.pay_days_options],
    overtime_rates: DEFAULT_ATTENDANCE_RULES.overtime_rates.map(o => ({ ...o })),
  };
  if (!Array.isArray(raw)) return out;

  const byKey: Record<string, any> = {};
  raw.forEach(r => { if (r?.rule_key) byKey[r.rule_key] = r; });

  const lt = asValue(byKey['sick_lt_6m']?.rule_value);
  if (Array.isArray(lt) && lt.length) out.sick_lt_6m = lt.map(normalizeTier);

  const gte = asValue(byKey['sick_gte_6m']?.rule_value);
  if (Array.isArray(gte) && gte.length) out.sick_gte_6m = gte.map(normalizeTier);

  const pd = asValue(byKey['pay_days_options']?.rule_value);
  if (pd?.options && Array.isArray(pd.options)) out.pay_days_options = pd.options.map((n: any) => Number(n));

  const or = asValue(byKey['overtime_rates']?.rule_value);
  if (Array.isArray(or) && or.length) {
    out.overtime_rates = or.map((o: any) => ({ type: String(o?.type ?? ''), rate: Number(o?.rate ?? 1) }));
  }

  return out;
}

/** 按分档取支付系数（匹配 min_years ≤ years < max_years） */
function pickPayRate(tiers: SickPayTier[], years: number): number {
  for (const t of tiers) {
    if (years >= t.min_years && (t.max_years == null || years < t.max_years)) {
      return t.pay_rate;
    }
  }
  return tiers.length ? tiers[tiers.length - 1].pay_rate : 1;
}

/** 按加班类型取倍率（优先规则表，找不到回退内置默认，再找不到回退 1 倍） */
function overtimeRate(type: string, rules?: AttendanceRules): number {
  const list = (rules?.overtime_rates && rules.overtime_rates.length)
    ? rules.overtime_rates
    : DEFAULT_ATTENDANCE_RULES.overtime_rates;
  const found = list.find(o => o.type === type);
  if (found) return Number(found.rate);
  // 规则表里缺这一项时，从内置默认兜底
  const fallback = DEFAULT_ATTENDANCE_RULES.overtime_rates.find(o => o.type === type);
  return fallback ? Number(fallback.rate) : 1;
}

/** 计算本企业连续工龄（年），按月粗略计算 */
export function calcSeniorityYears(entryDate: string, period: string): number {
  if (!entryDate) return 0;
  const entry = new Date(entryDate);
  const settle = new Date(period + '-01');
  if (isNaN(entry.getTime()) || isNaN(settle.getTime())) return 0;
  const years = (settle.getTime() - entry.getTime()) / (365.25 * 24 * 3600 * 1000);
  return Math.max(0, years);
}

/** 计算连续病假时长（天数） */
export function calcContinuousSickDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / (24 * 3600 * 1000)) + 1);
}

/**
 * 判断连续病假区间是否覆盖了某个「完整月」（从该月1号到月末都在病假内）。
 * 条件：start ≤ 该月1日 且 end ≥ 该月最后一天，两条件同时满足。
 * @returns true 表示病假覆盖了至少一个完整月
 */
export function isFullMonthSick(start: string, end: string): boolean {
  if (!start || !end) return false;
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return false;
  // 从病假开始月起，逐个检查到结束月
  const cursor = new Date(s.getFullYear(), s.getMonth(), 1);
  const last = new Date(e.getFullYear(), e.getMonth(), 1);
  while (cursor <= last) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59); // 该月最后一天
    if (s <= monthStart && e >= monthEnd) return true;
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return false;
}

/**
 * 病假支付系数（按本企业连续工龄分档，规则可配置）
 *
 * 两档规则：
 * 1. 连续病假 ≤ 6 个月（或非连续病假）→ 疾病休假工资（sick_lt_6m）
 *    按工龄：不满2年60% / 满2年不满4年70% / 满4年不满6年80% / 满6年不满8年90% / 满8年及以上100%
 * 2. 连续病假 > 6 个月 → 疾病救济费（sick_gte_6m）
 *    按工龄：不满1年40% / 满1年不满3年50% / 满3年及以上60%
 *
 * 病假金额 = 日薪 × 病假天数 × (1 - 支付系数)，即扣款部分。
 */
export function calcSickPayRate(
  entryDate: string,
  period: string,
  isContinuous: boolean,
  continuousDays: number,
  rules?: AttendanceRules,
): number {
  const r = rules || DEFAULT_ATTENDANCE_RULES;
  const years = calcSeniorityYears(entryDate, period);
  const overSixMonths = continuousDays > SIX_MONTHS_DAYS; // 约6个月
  const tiers = isContinuous && overSixMonths ? r.sick_gte_6m : r.sick_lt_6m;
  return pickPayRate(tiers, years);
}

export interface AttendanceInput {
  entry_date?: string;
  seniority_start_date?: string; // 工龄起算日（集团内换公司不重置工龄，填最初入职时间）
  period: string;
  attendance_wage?: number;     // 考勤工资（导入，作为计薪基数）
  pay_days?: number;            // 计薪天数（由规则 pay_days_options 校验）
  rules?: AttendanceRules;      // 考勤规则（来自 attendance_rules 表）
  // 病假
  sick_days?: number;
  is_continuous_sick?: boolean;
  continuous_sick_start?: string;
  continuous_sick_end?: string;
  // 事假
  personal_days?: number;
  // 旷工
  absenteeism_days?: number;
  // 加班（三类按天 + 保安法定按天 + 延时按小时）
  regular_overtime_days?: number;   // 平时加班（天）—— 1倍
  weekend_overtime_days?: number;   // 周末加班（天）—— 2倍
  holiday_overtime_days?: number;   // 节假日加班（天）—— 3倍
  guard_overtime_days?: number;     // 保安法定加班（天）—— 2倍
  overtime_hours?: number;          // 延时加班（小时）—— × 时薪
  hourly_rate?: number;             // 时薪（与延时加班匹配）
  holiday_fixed_amount?: number;    // 保洁节假日加班固定金额
  position?: string;                // 用于判断保洁
  // 入离职
  actual_attendance_days?: number;
  leave_date?: string;
  // 调整（调整类型 + 调整金额，调整金额汇入考勤调整合计）
  adjust_type?: string;
  adjust_amount?: number;
}

export interface AttendanceResult {
  seniority_years: number;
  daily_wage: number;
  sick_pay_rate: number;
  sick_deduct_rate: number;
  sick_amount: number;
  personal_amount: number;
  absenteeism_amount: number;
  overtime_amount: number;
  regular_overtime_amount: number;
  weekend_overtime_amount: number;
  holiday_overtime_amount: number;
  guard_overtime_amount: number;
  delayed_overtime_amount: number;
  on_off_adjust: number;
  adjust_amount: number;
  attendance_adjust_total: number;
}

/** 判断是否保洁（职位精确等于"保洁"，不含"保洁主管"） */
function isCleaner(position?: string): boolean {
  return position?.trim() === '保洁';
}

/** 主计算函数 */
export function calcAttendance(input: AttendanceInput): AttendanceResult {
  const rules = input.rules || DEFAULT_ATTENDANCE_RULES;

  // 考勤工资作为计薪基数
  const wage = Number(input.attendance_wage || 0);
  const payDays = Number(input.pay_days || 21.75);
  // 日薪：不做四舍五入，保留所有小数参与计算；显示时才取两位
  const dailyWage = payDays > 0 ? wage / payDays : 0;
  // 工龄起算日优先（集团内换公司不重置工龄），否则用入职日期
  const seniorityBase = input.seniority_start_date || input.entry_date || '';
  const seniorityYears = calcSeniorityYears(seniorityBase, input.period);

  // 病假
  const sickDays = Number(input.sick_days || 0);
  const continuousDays = input.is_continuous_sick
    ? calcContinuousSickDays(input.continuous_sick_start || '', input.continuous_sick_end || '')
    : 0;
  const sickPayRate = calcSickPayRate(
    seniorityBase, input.period, !!input.is_continuous_sick, continuousDays, rules
  );
  const sickDeductRate = round2(1 - sickPayRate);
  // 病假金额：
  //  - 连续病假且覆盖某个完整月（1号到月末都在病假内）→ 考勤工资 × 病假扣款系数（扣款，输出时取负）
  //  - 否则 → 日薪 × 天数 × 扣款系数（扣款，输出时取负）
  const coversFullMonth = !!input.is_continuous_sick && isFullMonthSick(input.continuous_sick_start || '', input.continuous_sick_end || '');
  let sickAmount: number;
  if (coversFullMonth) {
    sickAmount = wage * sickDeductRate;
  } else {
    sickAmount = dailyWage * sickDays * sickDeductRate;
  }

  // 事假（日薪×天数，扣款为负）
  const personalDays = Number(input.personal_days || 0);
  const personalAmount = dailyWage * personalDays;             // 全精度

  // 旷工（日薪×天数×100%，扣款为负）
  const absenteeismDays = Number(input.absenteeism_days || 0);
  const absenteeismAmount = dailyWage * absenteeismDays * 1.0; // 全精度

  // 加班（三类按天：平时1倍 / 周末2倍 / 节假日3倍；保安法定2倍；延时按小时 × 时薪）
  const regularDays = Number(input.regular_overtime_days || 0);
  const weekendDays = Number(input.weekend_overtime_days || 0);
  const holidayDays = Number(input.holiday_overtime_days || 0);
  const guardDays = Number(input.guard_overtime_days || 0);
  const overtimeHours = Number(input.overtime_hours || 0);
  const hourlyRate = Number(input.hourly_rate || 0);

  const regularRate = overtimeRate('平时加班', rules);
  const weekendRate = overtimeRate('周末加班', rules);
  const holidayRate = overtimeRate('法定节假日加班', rules);
  const guardRate = overtimeRate('保安法定加班', rules);

  // 加班金额 = [平时(天)×1 + 周末(天)×2 + 节假日(天)×3 + 保安法定(天)×2] × 日薪 + 延时(小时)×时薪
  // 平时加班金额
  let regularAmount = regularDays * dailyWage * regularRate;   // 全精度
  // 周末加班金额
  let weekendAmount = weekendDays * dailyWage * weekendRate;   // 全精度
  // 节假日加班金额：
  // - 保洁（不含保洁主管）：节假日加班(天) × 法定节假日固定金额
  // - 其他人：节假日加班(天) × 日薪 × 3倍
  let holidayAmount = 0;
  if (holidayDays > 0) {
    if (isCleaner(input.position)) {
      const fixed = Number(input.holiday_fixed_amount || 0);
      holidayAmount = holidayDays * fixed;                      // 全精度
    } else {
      holidayAmount = holidayDays * dailyWage * holidayRate;    // 全精度
    }
  }
  // 保安法定加班金额 = 保安法定加班(天) × 2 × 日薪
  const guardAmount = guardDays * dailyWage * guardRate;        // 全精度
  // 延时加班金额 = 延时加班小时 × 时薪
  const delayedAmount = overtimeHours * hourlyRate;             // 全精度

  // 加班金额合计
  const overtimeAmount = regularAmount + weekendAmount + holidayAmount + guardAmount + delayedAmount;  // 全精度

  // 入离职调整（月中入职/离职：折算工资 - 整月工资，通常为负）
  let onOffAdjust = 0;
  const actualDays = Number(input.actual_attendance_days || 0);
  const hasOnOff = actualDays > 0 && actualDays < payDays;
  if (hasOnOff) {
    const prorated = dailyWage * actualDays;                    // 全精度
    onOffAdjust = prorated - wage;                              // 全精度
  }

  // 调整金额
  const adjustAmount = Number(input.adjust_amount || 0);

  // 扣款字段存负数，增发字段存正数，合计 = 直接相加（全精度）
  const sickAmountSigned = -sickAmount;
  const personalAmountSigned = -personalAmount;
  const absenteeismAmountSigned = -absenteeismAmount;
  const attendanceAdjustTotal = sickAmountSigned + personalAmountSigned + absenteeismAmountSigned + overtimeAmount + onOffAdjust + adjustAmount;  // 全精度

  return {
    seniority_years: round2(seniorityYears),
    daily_wage: dailyWage,
    sick_pay_rate: sickPayRate,
    sick_deduct_rate: sickDeductRate,
    sick_amount: round2(sickAmountSigned),          // 展示用，四舍五入
    personal_amount: round2(personalAmountSigned),  // 展示用
    absenteeism_amount: round2(absenteeismAmountSigned), // 展示用
    overtime_amount: round2(overtimeAmount),        // 展示用
    regular_overtime_amount: round2(regularAmount),
    weekend_overtime_amount: round2(weekendAmount),
    holiday_overtime_amount: round2(holidayAmount),
    guard_overtime_amount: round2(guardAmount),
    delayed_overtime_amount: round2(delayedAmount),
    on_off_adjust: round2(onOffAdjust),             // 展示用
    adjust_amount: adjustAmount,
    attendance_adjust_total: round2(attendanceAdjustTotal), // 展示用
  };
}
