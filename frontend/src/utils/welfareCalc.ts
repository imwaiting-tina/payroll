/**
 * 社保/公积金计算引擎
 *
 * 根据福利套规则 + 基数，计算个人/公司各险种金额，支持取整、基数上下限、试算。
 */

export type RoundMethod = 'ROUND' | 'ROUNDUP' | 'ROUNDDOWN' | 'TRUNC_UP';

export interface SocialWelfareSet {
  code: string;
  name: string;
  region?: string;
  is_builtin: boolean;
  base_min?: number | null;
  base_max?: number | null;
  pension_enabled: boolean;
  medical_enabled: boolean;
  unemployment_enabled: boolean;
  injury_enabled: boolean;
  maternity_enabled: boolean;
  // 各险种最低基数（个人和公司一致），作为历史调整开始之前的默认标准
  pension_base_min?: number | null;
  medical_base_min?: number | null;
  unemployment_base_min?: number | null;
  injury_base_min?: number | null;
  maternity_base_min?: number | null;
  pension_rate_p: number;
  medical_rate_p: number;
  medical_fixed_p: number;
  unemployment_rate_p: number;
  pension_rate_c: number;
  medical_rate_c: number;
  unemployment_rate_c: number;
  injury_rate_c: number;
  maternity_rate_c: number;
  rounding_method: RoundMethod;
  rounding_precision: number;
}

export interface HousingFundSet {
  code: string;
  name: string;
  region?: string;
  is_builtin: boolean;
  base_min?: number | null;
  base_max?: number | null;
  normal_rate_p: number;
  normal_rate_c: number;
  supp_enabled: boolean;
  supp_rate_p: number;
  supp_rate_c: number;
  normal_round_method: RoundMethod;
  normal_round_precision: number;
  supp_round_method: RoundMethod;
  supp_round_precision: number;
}

/** 取整函数 — 统一消除浮点误差，保证返回干净的两位小数 */
function roundBy(method: RoundMethod, value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  const v = value * factor;
  let result: number;
  switch (method) {
    case 'ROUND':
      // 用 1e-9 抵消浮点误差，避免 24.345 被截成 24.34
      result = Math.round(v + 1e-9) / factor;
      break;
    case 'ROUNDUP':
      result = Math.ceil(v) / factor;
      break;
    case 'ROUNDDOWN':
      result = Math.floor(v) / factor;
      break;
    case 'TRUNC_UP':
      // 截位后进位：如 1.234 保留2位 → 1.24（截断后末位进1）
      result = (Math.trunc(v) + 1) / factor;
      break;
    default:
      result = Math.round(v + 1e-9) / factor;
  }
  // 消除浮点误差（如 109.9999999999 → 110.00）
  return Number(result.toFixed(precision));
}

/** 应用基数上下限 */
function clampBase(base: number, min?: number | null, max?: number | null): number {
  let b = base;
  if (min != null && b < min) b = min;
  if (max != null && b > max) b = max;
  return b;
}

// ====== 各险种最低基数：默认标准 + 按开始月份生效的历史调整 ======
export type SocialInsuranceKey = 'pension' | 'medical' | 'unemployment' | 'injury' | 'maternity';

export interface BaseMinHistoryRow {
  social_code: string;
  insurance: SocialInsuranceKey;
  base_min: number;
  start_date: string;
}

const BASE_MIN_KEY: Record<SocialInsuranceKey, keyof SocialWelfareSet> = {
  pension: 'pension_base_min',
  medical: 'medical_base_min',
  unemployment: 'unemployment_base_min',
  injury: 'injury_base_min',
  maternity: 'maternity_base_min',
};

/**
 * 取某险种在指定月份适用的最低基数：
 * 取“开始月份 <= 当期月份”的最近一条历史调整；没有历史调整则用福利套的默认值。
 */
export function resolveBaseMin(
  set: SocialWelfareSet,
  history: BaseMinHistoryRow[] | undefined,
  insurance: SocialInsuranceKey,
  period?: string,
): number | null | undefined {
  if (period) {
    const matched = (history || [])
      .filter(h => h.social_code === set.code && h.insurance === insurance && String(h.start_date).slice(0, 7) <= period)
      .sort((a, b) => (String(a.start_date) < String(b.start_date) ? 1 : -1));
    if (matched.length > 0) return Number(matched[0].base_min);
  }
  return set[BASE_MIN_KEY[insurance]] as number | null | undefined;
}

export interface SocialCalcContext {
  period?: string;
  history?: BaseMinHistoryRow[];
}

/** 计算社保各险种金额 */
export function calcSocial(
  set: SocialWelfareSet,
  rawBase: number,
  ctx?: SocialCalcContext,
): {
  base: number;
  pension_p: number;
  medical_p: number;
  unemployment_p: number;
  pension_c: number;
  medical_c: number;
  unemployment_c: number;
  injury_c: number;
  maternity_c: number;
  personal_total: number;
  company_total: number;
} {
  const base = clampBase(rawBase, set.base_min, set.base_max);
  const r = set.rounding_method;
  const p = set.rounding_precision;

  // 各险种独立的计费基数（先应用整体上下限，再应用该险种最低基数）
  // 最低基数按月份取：历史调整优先，未设置历史则用福利套默认值
  const pMin = resolveBaseMin(set, ctx?.history, 'pension', ctx?.period);
  const mMin = resolveBaseMin(set, ctx?.history, 'medical', ctx?.period);
  const uMin = resolveBaseMin(set, ctx?.history, 'unemployment', ctx?.period);
  const iMin = resolveBaseMin(set, ctx?.history, 'injury', ctx?.period);
  const mtMin = resolveBaseMin(set, ctx?.history, 'maternity', ctx?.period);
  const pensionBase = pMin != null ? Math.max(base, pMin) : base;
  const medicalBase = mMin != null ? Math.max(base, mMin) : base;
  const unemploymentBase = uMin != null ? Math.max(base, uMin) : base;
  const injuryBase = iMin != null ? Math.max(base, iMin) : base;
  const maternityBase = mtMin != null ? Math.max(base, mtMin) : base;

  const pension_p = set.pension_enabled ? roundBy(r, pensionBase * set.pension_rate_p, p) : 0;
  const medical_p = set.medical_enabled
    ? roundBy(r, medicalBase * set.medical_rate_p + (set.medical_fixed_p || 0), p)
    : 0;
  const unemployment_p = set.unemployment_enabled
    ? roundBy(r, unemploymentBase * set.unemployment_rate_p, p)
    : 0;
  const pension_c = set.pension_enabled ? roundBy(r, pensionBase * set.pension_rate_c, p) : 0;
  const medical_c = set.medical_enabled ? roundBy(r, medicalBase * set.medical_rate_c, p) : 0;
  const unemployment_c = set.unemployment_enabled
    ? roundBy(r, unemploymentBase * set.unemployment_rate_c, p)
    : 0;
  const injury_c = set.injury_enabled ? roundBy(r, injuryBase * set.injury_rate_c, p) : 0;
  const maternity_c = set.maternity_enabled ? roundBy(r, maternityBase * set.maternity_rate_c, p) : 0;

  const personal_total = roundBy('ROUND', pension_p + medical_p + unemployment_p, 2);
  const company_total = roundBy('ROUND', pension_c + medical_c + unemployment_c + injury_c + maternity_c, 2);

  return {
    base,
    pension_p, medical_p, unemployment_p,
    pension_c, medical_c, unemployment_c, injury_c, maternity_c,
    personal_total, company_total,
  };
}

/** 计算公积金各金额 */
export function calcHousingFund(
  set: HousingFundSet,
  rawNormalBase: number,
  suppBase?: number | null,
  suppEnabled?: boolean,
): {
  normal_base: number;
  supp_base: number;
  normal_p: number;
  normal_c: number;
  supp_p: number;
  supp_c: number;
  personal_total: number;
  company_total: number;
} {
  const normal_base = clampBase(rawNormalBase, set.base_min, set.base_max);
  const normal_p = roundBy(set.normal_round_method, normal_base * set.normal_rate_p, set.normal_round_precision);
  const normal_c = roundBy(set.normal_round_method, normal_base * set.normal_rate_c, set.normal_round_precision);

  const isSupp = suppEnabled ?? set.supp_enabled;
  const sb = clampBase(suppBase ?? normal_base, set.base_min, set.base_max);
  const supp_p = isSupp ? roundBy(set.supp_round_method, sb * set.supp_rate_p, set.supp_round_precision) : 0;
  const supp_c = isSupp ? roundBy(set.supp_round_method, sb * set.supp_rate_c, set.supp_round_precision) : 0;

  const personal_total = roundBy('ROUND', normal_p + supp_p, 2);
  const company_total = roundBy('ROUND', normal_c + supp_c, 2);

  return { normal_base, supp_base: isSupp ? sb : 0, normal_p, normal_c, supp_p, supp_c, personal_total, company_total };
}

/** 试算（供福利套设置页预览用） */
export function calcPreview(
  socialSet: SocialWelfareSet,
  housingSet: HousingFundSet,
  socialBase: number,
  housingBase: number,
): {
  social: ReturnType<typeof calcSocial>;
  housing: ReturnType<typeof calcHousingFund>;
  personal_total: number;
  company_total: number;
} {
  const social = calcSocial(socialSet, socialBase);
  const housing = calcHousingFund(housingSet, housingBase);
  return {
    social,
    housing,
    personal_total: social.personal_total + housing.personal_total,
    company_total: social.company_total + housing.company_total,
  };
}
