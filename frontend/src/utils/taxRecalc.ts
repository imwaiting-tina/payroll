/**
 * 个税批量重算 — 供「导入完成 → 自动触发下游个税计算」使用。
 *
 * 与各税务页面「计算」按钮的算法保持一致：拉取当月最新数据 → 计算 → 一次批量 upsert 落库。
 * 各函数内部不抛错（单类失败不影响其他），可安全地在导入完成后调用。
 */
import api, { bulkUpsert } from '../api/client';
import { calcIncomeTax, calcInternTax, calcServiceTax } from './taxCalc';
import { round2 } from './round';
import { isActiveInPeriod } from './employee';
import { ensureRoster } from './roster';

function prevPeriod(p: string): string {
  const [y, m] = p.split('-').map(Number);
  const prev = new Date(y, m - 2, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

function monthsFromJan(p: string): string[] {
  const [y, m] = p.split('-').map(Number);
  const arr: string[] = [];
  for (let i = 1; i <= m; i++) arr.push(`${y}-${String(i).padStart(2, '0')}`);
  return arr;
}

/** 按入职日期计算到指定月份的任职月数（含当月）。入职早于当年1月则从1月起算。 */
function calcMonthsWorked(entryDate: string | undefined, period: string): number {
  if (!entryDate) return 1;
  const entryYear = parseInt(entryDate.slice(0, 4));
  const entryMonth = parseInt(entryDate.slice(5, 7));
  const [pYear, pMonth] = period.split('-').map(Number);
  const startYear = entryYear < pYear ? pYear : entryYear;
  const startMonth = entryYear < pYear ? 1 : entryMonth;
  return (pYear - startYear) * 12 + (pMonth - startMonth) + 1;
}

/** 正常计税（累计预扣法） → tax_monthly_calcs */
async function recalcNormalTax(period: string): Promise<number> {
  const periodsFromJan = monthsFromJan(period);
  const [empRes, openingRes, specialRes, prevSpecialRes, historyCalcRes, welfareRes, attRes, addRes] = await Promise.all([
    api.get(`/employees?select=unique_hash,name,status,pay_company,entry_date,leave_date,basic_salary&tax_method=eq.normal&period=eq.${period}`),
    api.get('/tax_opening_balances?select=*'),
    api.get(`/tax_special_deductions?select=*&period=eq.${period}`),
    api.get(`/tax_special_deductions?select=*&period=eq.${prevPeriod(period)}`),
    api.get(`/tax_monthly_calcs?select=*&period=in.(${periodsFromJan.join(',')})`),
    api.get(`/employee_welfare_records?select=unique_hash,personal_total,personal_social_adj,personal_housing_adj,effective_month&period=eq.${period}`),
    api.get(`/attendance_records?select=unique_hash,attendance_adjust_total&period=eq.${period}`),
    api.get(`/additional_salary_records?select=*&period=eq.${period}`),
  ]);

  const openingMap: Record<string, any> = {};
  openingRes.data.forEach((r: any) => { openingMap[r.unique_hash] = r; });
  const specialMap: Record<string, any> = {};
  specialRes.data.forEach((r: any) => { specialMap[r.unique_hash] = r; });
  const prevSpecialMap: Record<string, any> = {};
  prevSpecialRes.data.forEach((r: any) => { prevSpecialMap[r.unique_hash] = r; });
  const historyMap: Record<string, any[]> = {};
  (historyCalcRes.data || []).forEach((r: any) => {
    if (!historyMap[r.unique_hash]) historyMap[r.unique_hash] = [];
    historyMap[r.unique_hash].push({
      period: r.period,
      current_taxable_income: Number(r.current_taxable_income || 0),
      current_five_insurance: Number(r.current_five_insurance || 0),
      monthly_tax: Number(r.monthly_tax || 0),
    });
  });
  const welfareMap: Record<string, any> = {};
  welfareRes.data.forEach((r: any) => { welfareMap[r.unique_hash] = r; });
  const attMap: Record<string, any> = {};
  attRes.data.forEach((r: any) => { attMap[r.unique_hash] = r; });
  const addMap: Record<string, any> = {};
  addRes.data.forEach((r: any) => { addMap[r.unique_hash] = r; });

  const rows: any[] = [];
  for (const e of empRes.data) {
    if (!isActiveInPeriod(e, period)) continue;
    const opening = openingMap[e.unique_hash] || {};
    const special = specialMap[e.unique_hash] || {};
    const prevSpecial = prevSpecialMap[e.unique_hash] || {};
    const add = addMap[e.unique_hash] || {};

    // 附加薪酬合计 = 12项之和（不含服务费，与个税月度计算口径一致）
    const additionalTotal = round2(
      (add.allowance_supp || 0) + (add.other_adjust || 0) + (add.insurance_amount || 0) +
      (add.kpi_provision || 0) + (add.office_comm || 0) + (add.performance_pay || 0) +
      (add.apartment_comm || 0) + (add.talent_kpi || 0) + (add.heat_allowance || 0) +
      (add.other_allowance || 0) + (add.security_bonus || 0) + (add.cleaning_bonus || 0)
    );
    const currentTaxableIncome = round2(Number(e.basic_salary || 0) + Number(attMap[e.unique_hash]?.attendance_adjust_total || 0) + additionalTotal);

    const welfare = welfareMap[e.unique_hash] || {};
    const notYetEffective = !!(welfare.effective_month && welfare.effective_month > period);
    const currentFiveInsurance = notYetEffective
      ? 0
      : round2(Number(welfare.personal_total || 0) + Number(welfare.personal_social_adj || 0) + Number(welfare.personal_housing_adj || 0));

    const specialTotal = (special.cumul_child_edu || 0) + (special.cumul_continuing_edu || 0) + (special.cumul_mortgage || 0) + (special.cumul_rent || 0) + (special.cumul_elder_care || 0) + (special.cumul_infant_care || 0);
    const prevSpecialTotal = (prevSpecial.cumul_child_edu || 0) + (prevSpecial.cumul_continuing_edu || 0) + (prevSpecial.cumul_mortgage || 0) + (prevSpecial.cumul_rent || 0) + (prevSpecial.cumul_elder_care || 0) + (prevSpecial.cumul_infant_care || 0);
    const currentSpecialDeduct = Math.max(0, round2(specialTotal - prevSpecialTotal));

    const otherTotal = (special.cumul_pension || 0) + (special.cumul_annuity || 0) + (special.cumul_health_ins || 0) + (special.cumul_tax_defer_ins || 0) + (special.cumul_donation || 0);
    const prevOtherTotal = (prevSpecial.cumul_pension || 0) + (prevSpecial.cumul_annuity || 0) + (prevSpecial.cumul_health_ins || 0) + (prevSpecial.cumul_tax_defer_ins || 0) + (prevSpecial.cumul_donation || 0);
    const currentOtherDeduct = Math.max(0, round2(otherTotal - prevOtherTotal));
    const currentTaxRelief = Math.max(0, round2((special.tax_relief || 0) - (prevSpecial.tax_relief || 0)));

    const hist = (historyMap[e.unique_hash] || []).filter((x: any) => x.period >= '2026-06' && x.period < period);
    const cumulTaxableIncome = Number(opening.cumul_income || 0) + hist.reduce((s: number, x: any) => s + (x.current_taxable_income || 0), 0) + Number(currentTaxableIncome || 0);
    const cumulFiveInsurance = Number(opening.cumul_five_insurance || 0) + hist.reduce((s: number, x: any) => s + (x.current_five_insurance || 0), 0) + Number(currentFiveInsurance || 0);
    const cumulTaxPaid = Number(opening.cumul_tax_paid || 0) + hist.reduce((s: number, x: any) => s + (x.monthly_tax || 0), 0);
    const cumulSpecialDeduct = specialTotal;
    const cumulOtherDeduct = otherTotal;
    const cumulTaxRelief = Number(special.tax_relief || 0);

    const statYear = parseInt(period.split('-')[0]);
    const monthNum = parseInt(period.split('-')[1]);
    let employedMonths = monthNum;
    const entryDateStr = String(e.entry_date || '');
    if (entryDateStr) {
      const entryYear = parseInt(entryDateStr.slice(0, 4));
      const entryMonth = parseInt(entryDateStr.slice(5, 7));
      if (!isNaN(entryYear) && !isNaN(entryMonth) && entryYear === statYear) {
        employedMonths = Math.max(1, monthNum - entryMonth + 1);
      }
    }
    const cumulBasicDeduction = 5000 * employedMonths;

    const result = calcIncomeTax({
      cumul_taxable_income: cumulTaxableIncome,
      cumul_tax_free_income: 0,
      cumul_basic_deduction: cumulBasicDeduction,
      cumul_five_insurance: cumulFiveInsurance,
      cumul_special_deduct: cumulSpecialDeduct,
      cumul_other_deduct: cumulOtherDeduct,
      cumul_tax_relief: cumulTaxRelief,
      cumul_tax_paid: cumulTaxPaid,
    });

    rows.push({
      unique_hash: e.unique_hash,
      period,
      current_taxable_income: currentTaxableIncome,
      current_tax_free_income: 0,
      current_five_insurance: currentFiveInsurance,
      current_special_deduct: currentSpecialDeduct,
      current_other_deduct: currentOtherDeduct,
      current_tax_relief: currentTaxRelief,
      cumul_taxable_income: cumulTaxableIncome,
      cumul_tax_free_income: 0,
      cumul_basic_deduction: cumulBasicDeduction,
      cumul_five_insurance: cumulFiveInsurance,
      cumul_special_deduct: cumulSpecialDeduct,
      cumul_other_deduct: cumulOtherDeduct,
      cumul_tax_relief: cumulTaxRelief,
      cumul_tax_paid: cumulTaxPaid,
      cumul_taxable_income_net: result.cumul_taxable_income_net,
      tax_rate: result.tax_rate,
      quick_deduction: result.quick_deduction,
      monthly_tax: result.monthly_tax,
    });
  }
  await bulkUpsert('tax_monthly_calcs', rows);
  return rows.length;
}

/** 实习生个税 → tax_monthly_calcs */
async function recalcInternTax(period: string): Promise<number> {
  const [empRes, openingRes, prevCalcRes, salaryRes] = await Promise.all([
    api.get(`/employees?select=unique_hash,name,status,pay_company,department,entry_date,leave_date&tax_method=eq.intern&period=eq.${period}`),
    api.get('/tax_opening_balances?select=*'),
    api.get(`/tax_monthly_calcs?select=*&period=eq.${prevPeriod(period)}`),
    api.get(`/salary_records?select=unique_hash,wage_subtotal&period=eq.${period}`),
  ]);

  const openingMap: Record<string, any> = {};
  openingRes.data.forEach((r: any) => { openingMap[r.unique_hash] = r; });
  const prevMap: Record<string, any> = {};
  prevCalcRes.data.forEach((r: any) => { prevMap[r.unique_hash] = r; });
  const salaryMap: Record<string, any> = {};
  salaryRes.data.forEach((r: any) => { salaryMap[r.unique_hash] = r; });

  const rows: any[] = [];
  for (const e of empRes.data) {
    if (!isActiveInPeriod(e, period)) continue;
    const opening = openingMap[e.unique_hash] || {};
    const prev = prevMap[e.unique_hash] || {};
    const currentIncome = Number(salaryMap[e.unique_hash]?.wage_subtotal || 0);

    const isFirstMonth = period === '2026-06';
    const cumulIncome = isFirstMonth
      ? round2((Number(opening.cumul_income || 0) + currentIncome) * (1 - 0.20))
      : round2(Number(prev.cumul_taxable_income || 0) + currentIncome * (1 - 0.20));
    const cumulBasicDeduction = 5000 * calcMonthsWorked(e.entry_date, period);
    const cumulTaxRelief = isFirstMonth ? Number(opening.cumul_tax_relief || 0) : Number(prev.cumul_tax_relief || 0);
    const cumulTaxPaid = isFirstMonth ? Number(opening.cumul_tax_paid || 0) : Number(prev.cumul_tax_paid || 0) + Number(prev.monthly_tax || 0);

    const result = calcInternTax({
      cumul_income: cumulIncome,
      cumul_basic_deduction: cumulBasicDeduction,
      cumul_tax_relief: cumulTaxRelief,
      cumul_tax_paid: cumulTaxPaid,
    });

    rows.push({
      unique_hash: e.unique_hash,
      period,
      current_taxable_income: currentIncome,
      cumul_taxable_income: cumulIncome,
      cumul_basic_deduction: cumulBasicDeduction,
      cumul_taxable_income_net: result.cumul_taxable_income_net,
      tax_rate: result.tax_rate,
      quick_deduction: result.quick_deduction,
      cumul_tax_relief: cumulTaxRelief,
      cumul_tax_paid: cumulTaxPaid,
      monthly_tax: result.monthly_tax,
    });
  }
  await bulkUpsert('tax_monthly_calcs', rows);
  return rows.length;
}

/** 现金计税 → salary_records.monthly_tax */
async function recalcCashTax(period: string): Promise<number> {
  const monthNumber = parseInt(period.split('-')[1]) || 1;
  const [empRes, salaryRes] = await Promise.all([
    api.get(`/employees?select=unique_hash,name,status,pay_company,department,tax_method,leave_date&tax_method=eq.cash&period=eq.${period}`),
    api.get(`/salary_records?select=unique_hash,wage_subtotal&period=eq.${period}`),
  ]);
  const salaryMap: Record<string, any> = {};
  salaryRes.data.forEach((r: any) => { salaryMap[r.unique_hash] = r; });

  const rows: any[] = [];
  for (const e of empRes.data) {
    if (!isActiveInPeriod(e, period)) continue;
    const wageSubtotal = Number(salaryMap[e.unique_hash]?.wage_subtotal || 0);
    const monthlyTax = round2(wageSubtotal * 0.03);
    rows.push({ unique_hash: e.unique_hash, period, month_number: monthNumber, wage_subtotal: wageSubtotal, monthly_tax: monthlyTax });
  }
  await bulkUpsert('salary_records', rows);
  return rows.length;
}

/** 劳务计税 → salary_records.monthly_tax */
async function recalcServiceTax(period: string): Promise<number> {
  const monthNumber = parseInt(period.split('-')[1]) || 1;
  const [empRes, salaryRes] = await Promise.all([
    api.get(`/employees?select=unique_hash,name,status,pay_company,department,tax_method,leave_date&tax_method=eq.service&period=eq.${period}`),
    api.get(`/salary_records?select=unique_hash,wage_subtotal&period=eq.${period}`),
  ]);
  const salaryMap: Record<string, any> = {};
  salaryRes.data.forEach((r: any) => { salaryMap[r.unique_hash] = r; });

  const rows: any[] = [];
  for (const e of empRes.data) {
    if (!isActiveInPeriod(e, period)) continue;
    const wageSubtotal = Number(salaryMap[e.unique_hash]?.wage_subtotal || 0);
    const tax = calcServiceTax(wageSubtotal);
    rows.push({ unique_hash: e.unique_hash, period, month_number: monthNumber, wage_subtotal: wageSubtotal, monthly_tax: tax.monthly_tax });
  }
  await bulkUpsert('salary_records', rows);
  return rows.length;
}

/** 灵工计税 → salary_records.monthly_tax */
async function recalcFlexibleTax(period: string): Promise<number> {
  const monthNumber = parseInt(period.split('-')[1]) || 1;
  const [empRes, attRes] = await Promise.all([
    api.get(`/employees?select=unique_hash,name,status,pay_company,department,tax_method,basic_salary,leave_date&tax_method=eq.flexible&period=eq.${period}`),
    api.get(`/attendance_records?select=unique_hash,attendance_adjust_total&period=eq.${period}`),
  ]);
  const attMap: Record<string, any> = {};
  attRes.data.forEach((r: any) => { attMap[r.unique_hash] = r; });

  const rows: any[] = [];
  for (const e of empRes.data) {
    if (!isActiveInPeriod(e, period)) continue;
    const basicSalary = Number(e.basic_salary || 0);
    const attendanceAdjustTotal = Number(attMap[e.unique_hash]?.attendance_adjust_total || 0);
    const monthlyTax = round2(Math.max(0, (basicSalary + attendanceAdjustTotal - 6250) * 0.024));
    rows.push({ unique_hash: e.unique_hash, period, month_number: monthNumber, monthly_tax: monthlyTax });
  }
  await bulkUpsert('salary_records', rows);
  return rows.length;
}

/**
 * 重算当月全部个税（正常/实习/现金/劳务/灵工）。
 * 导入完成后调用，自动触发下游个税计算。内部吞掉单类失败，不会向外抛错。
 */
export async function recalcAllTaxes(period: string): Promise<void> {
  if (!period) return;
  await ensureRoster(period);
  const tasks: (() => Promise<number>)[] = [
    () => recalcNormalTax(period),
    () => recalcInternTax(period),
    () => recalcCashTax(period),
    () => recalcServiceTax(period),
    () => recalcFlexibleTax(period),
  ];
  for (const fn of tasks) {
    try { await fn(); } catch { /* 单类失败不影响其他 */ }
  }
}
