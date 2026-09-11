/**
 * 个税计算引擎 — 累计预扣法
 * 居民个人工资、薪金所得个人所得税预扣预缴
 */

import { round2 } from './round';

export interface TaxBracket {
  level: number;
  min_income: number;
  max_income: number | null;
  rate: number;
  quick_deduction: number;
}

/** 七级累进预扣率表（年度累计口径） */
export const TAX_BRACKETS: TaxBracket[] = [
  { level: 1, min_income: 0, max_income: 36000, rate: 0.03, quick_deduction: 0 },
  { level: 2, min_income: 36000, max_income: 144000, rate: 0.10, quick_deduction: 2520 },
  { level: 3, min_income: 144000, max_income: 300000, rate: 0.20, quick_deduction: 16920 },
  { level: 4, min_income: 300000, max_income: 420000, rate: 0.25, quick_deduction: 31920 },
  { level: 5, min_income: 420000, max_income: 660000, rate: 0.30, quick_deduction: 52920 },
  { level: 6, min_income: 660000, max_income: 960000, rate: 0.35, quick_deduction: 85920 },
  { level: 7, min_income: 960000, max_income: null, rate: 0.45, quick_deduction: 181920 },
];

/** 查预扣率表 */
export function findTaxBracket(cumulTaxableIncome: number): TaxBracket {
  const income = Math.max(0, cumulTaxableIncome);
  return TAX_BRACKETS.find(
    b => income >= b.min_income && (b.max_income === null || income <= b.max_income)
  ) || TAX_BRACKETS[TAX_BRACKETS.length - 1];
}

/**
 * ===== 劳务报酬所得预扣预缴（三级超额累进） =====
 * 适用于普通居民个人劳务报酬的一般预扣法。
 *
 * 第一步：算"预扣预缴应纳税所得额"（收入额）
 *   - 每次收入 ≤ 4000 元：减除费用 800 元 → 应纳税所得额 = 收入 - 800
 *   - 每次收入 > 4000 元：减除 20% → 应纳税所得额 = 收入 × (1 - 20%)
 * 第二步：套三级预扣率表
 * 第三步：应预扣税额 = 应纳税所得额 × 预扣率 - 速算扣除数
 */

export interface ServiceTaxBracket {
  level: number;
  min_income: number;        // 应纳税所得额下限（含）
  max_income: number | null; // 上限（不含，null 无上限）
  rate: number;              // 预扣率
  quick_deduction: number;   // 速算扣除数
}

/** 三级预扣率表 */
export const SERVICE_TAX_BRACKETS: ServiceTaxBracket[] = [
  { level: 1, min_income: 0,     max_income: 20000, rate: 0.20, quick_deduction: 0 },
  { level: 2, min_income: 20000, max_income: 50000, rate: 0.30, quick_deduction: 2000 },
  { level: 3, min_income: 50000, max_income: null,   rate: 0.40, quick_deduction: 7000 },
];

/** 查劳务三级预扣率表 */
export function findServiceTaxBracket(taxableIncome: number): ServiceTaxBracket {
  const income = Math.max(0, taxableIncome);
  return SERVICE_TAX_BRACKETS.find(
    b => income >= b.min_income && (b.max_income === null || income < b.max_income)
  ) || SERVICE_TAX_BRACKETS[SERVICE_TAX_BRACKETS.length - 1];
}

export interface ServiceTaxResult {
  taxable_income: number;   // 应纳税所得额（收入额）
  tax_rate: number;         // 适用预扣率
  quick_deduction: number;  // 速算扣除数
  monthly_tax: number;      // 应预扣税额
}

/** 劳务报酬一般预扣法计算 */
export function calcServiceTax(income: number): ServiceTaxResult {
  const amount = Math.max(0, income);
  // 第一步：应纳税所得额
  const taxableIncome = amount <= 4000
    ? amount - 800
    : amount * (1 - 0.20);
  // 负值按 0（收入不足 800 时无税）
  const taxable = Math.max(0, taxableIncome);
  // 应税所得额先四舍五入（保留2位），再查表和算税
  const taxableRounded = round2(taxable);
  // 第二步：套三级预扣率表
  const bracket = findServiceTaxBracket(taxableRounded);
  // 第三步：应预扣税额
  const monthlyTax = round2(taxableRounded * bracket.rate - bracket.quick_deduction);
  return {
    taxable_income: round2(taxableRounded),
    tax_rate: bracket.rate,
    quick_deduction: bracket.quick_deduction,
    monthly_tax: Math.max(0, monthlyTax),
  };
}

/**
 * 实习生个税（实习劳务报酬，一般累计预扣法）
 * 本期应预扣预缴税额 =（累计收入额 − 累计减除费用）× 预扣率 − 速算扣除数 − 累计减免税额 − 累计已预扣预缴税额
 */
export interface InternTaxInput {
  cumul_income: number;        // 累计收入额
  cumul_basic_deduction: number; // 累计减除费用（5000×月数）
  cumul_tax_relief: number;    // 累计减免税额
  cumul_tax_paid: number;      // 累计已预扣预缴税额
}

export interface InternTaxResult {
  cumul_taxable_income_net: number; // 累计应纳税所得额
  tax_rate: number;
  quick_deduction: number;
  monthly_tax: number;              // 本期应预扣预缴税额
}

export function calcInternTax(input: InternTaxInput): InternTaxResult {
  // 累计应纳税所得额 = 累计收入额 − 累计减除费用
  const cumulTaxable = Math.max(0, input.cumul_income - input.cumul_basic_deduction);
  // 应税所得额先四舍五入（保留2位），再查表和算税
  const taxableRounded = round2(cumulTaxable);
  // 套七级累进预扣率表
  const bracket = findTaxBracket(taxableRounded);
  // 本期应预扣预缴税额
  const monthlyTax = round2(
    taxableRounded * bracket.rate - bracket.quick_deduction - input.cumul_tax_relief - input.cumul_tax_paid
  );
  return {
    cumul_taxable_income_net: round2(taxableRounded),
    tax_rate: bracket.rate,
    quick_deduction: bracket.quick_deduction,
    monthly_tax: Math.max(0, monthlyTax),
  };
}

/**
 * ===== 现金计税 =====
 * 适用计税方式为"现金计税"(cash) 的人员。
 * 个税 = 薪资小计 × 3%
 */
export function calcCashTax(income: number): number {
  const amount = Math.max(0, Number(income) || 0);
  return round2(amount * 0.03);
}

export interface TaxCalcInput {
  cumul_taxable_income: number;   // 累计应税收入
  cumul_tax_free_income: number;  // 累计免税收入
  cumul_basic_deduction: number;  // 累计减除费用（5000×月数）
  cumul_five_insurance: number;   // 累计五险一金
  cumul_special_deduct: number;   // 累计专项附加扣除
  cumul_other_deduct: number;     // 累计其他扣除
  cumul_tax_relief: number;       // 累计减免税额
  cumul_tax_paid: number;         // 累计已预扣预缴税额
}

export interface TaxCalcResult {
  cumul_taxable_income_net: number;  // 累计预扣预缴应纳税所得额
  tax_rate: number;
  quick_deduction: number;
  monthly_tax: number;               // 当月个人所得税
}

/** 累计预扣法计算 */
export function calcIncomeTax(input: TaxCalcInput): TaxCalcResult {
  // 累计预扣预缴应纳税所得额 = 累计应税收入 - 累计免税收入 - 累计减除费用 - 累计五险一金 - 累计专项附加 - 累计其他扣除
  let cumulTaxableIncomeNet =
    input.cumul_taxable_income
    - input.cumul_tax_free_income
    - input.cumul_basic_deduction
    - input.cumul_five_insurance
    - input.cumul_special_deduct
    - input.cumul_other_deduct;

  // 负值按 0
  cumulTaxableIncomeNet = Math.max(0, cumulTaxableIncomeNet);

  // 应税所得额先四舍五入（保留2位），再查表和算税
  const taxableRounded = round2(cumulTaxableIncomeNet);

  // 查表
  const bracket = findTaxBracket(taxableRounded);

  // 当月个税 = 累计应纳税所得额 × 预扣率 - 速算扣除数 - 累计减免税额 - 累计已预扣税额
  let monthlyTax =
    taxableRounded * bracket.rate
    - bracket.quick_deduction
    - input.cumul_tax_relief
    - input.cumul_tax_paid;

  // 负值按 0
  monthlyTax = Math.max(0, monthlyTax);

  return {
    cumul_taxable_income_net: round2(taxableRounded),
    tax_rate: bracket.rate,
    quick_deduction: bracket.quick_deduction,
    monthly_tax: round2(monthlyTax),
  };
}
