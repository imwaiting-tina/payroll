/**
 * 全局刷新服务
 * 在任何模块点击「刷新」都按正确依赖顺序，把有公式计算、需要同步的模块全部重算一遍：
 *   1. 考勤（考勤调整合计）
 *   2. 社保（五险一金金额）
 *   3. 个税月度（正常计税）
 *   4. 实习生个税
 *   5. 薪资（薪资小计/个税/实发/总成本，回写 salary_records）
 *
 * 已锁定（冻结）的记录一律跳过，不覆盖。
 */
import api from '../api/client';
import { calcAttendance, parseAttendanceRules, DEFAULT_ATTENDANCE_RULES } from './attendanceCalc';
import { calcSocial, calcHousingFund } from './welfareCalc';
import { calcIncomeTax, calcServiceTax, calcInternTax } from './taxCalc';
import { isActiveInPeriod } from './employee';
import { round2 } from './round';
import { ensureRoster } from './roster';

export interface RefreshStepResult {
  step: string;
  success: number;
  skipped: number;
}

export interface GlobalRefreshResult {
  steps: RefreshStepResult[];
}

/** 上一个月 */
function prevPeriod(p: string): string {
  const [y, m] = p.split('-').map(Number);
  const prev = new Date(y, m - 2, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

const isLocked = (r: any) => !!r && (r.data_status === '已锁定' || r.data_status === '已提交老板查看' || r.data_status === '已提交审批');

/** 1. 考勤自动计算 */
async function refreshAttendance(period: string): Promise<RefreshStepResult> {
  const [empRes, recRes, rulesRes] = await Promise.all([
    api.get(`/employees?select=unique_hash,name,status,position,entry_date&period=eq.${period}`),
    api.get(`/attendance_records?select=*&period=eq.${period}`),
    api.get('/attendance_rules?select=*'),
  ]);
  const rules = parseAttendanceRules(rulesRes.data);
  const empMap: Record<string, any> = {};
  empRes.data.forEach((e: any) => { empMap[e.unique_hash] = e; });

  let success = 0;
  let skipped = 0;
  for (const rec of recRes.data) {
    if (isLocked(rec)) { skipped++; continue; }
    try {
      const emp = empMap[rec.unique_hash] || {};
      const result = calcAttendance({
        entry_date: emp.entry_date || rec.entry_date,
        seniority_start_date: rec.seniority_start_date,
        period,
        attendance_wage: rec.attendance_wage,
        pay_days: rec.pay_days,
        rules,
        sick_days: rec.sick_days,
        is_continuous_sick: rec.is_continuous_sick,
        continuous_sick_start: rec.continuous_sick_start,
        continuous_sick_end: rec.continuous_sick_end,
        personal_days: rec.personal_days,
        absenteeism_days: rec.absenteeism_days,
        regular_overtime_days: rec.regular_overtime_days,
        weekend_overtime_days: rec.weekend_overtime_days,
        holiday_overtime_days: rec.holiday_overtime_days,
        guard_overtime_days: rec.guard_overtime_days,
        overtime_hours: rec.overtime_hours,
        hourly_rate: rec.hourly_rate,
        holiday_fixed_amount: rec.holiday_fixed_amount,
        position: emp.position || rec.position,
        actual_attendance_days: rec.actual_attendance_days,
        adjust_type: rec.adjust_type,
        adjust_amount: rec.adjust_amount,
      });
      const calcFields = {
        sick_pay_rate: result.sick_pay_rate,
        sick_amount: result.sick_amount,
        personal_amount: result.personal_amount,
        absenteeism_amount: result.absenteeism_amount,
        overtime_amount: result.overtime_amount,
        on_off_adjust: result.on_off_adjust,
        attendance_adjust_total: result.attendance_adjust_total,
        data_status: '已计算',
      };
      await api.patch(`/attendance_records?id=eq.${rec.id}`, calcFields);
      success++;
    } catch { skipped++; }
  }
  return { step: '考勤', success, skipped };
}

/** 2. 社保一键计算 */
async function refreshSocial(period: string): Promise<RefreshStepResult> {
  const [sRes, hRes, recRes] = await Promise.all([
    api.get('/social_welfare_sets?select=*'),
    api.get('/housing_fund_sets?select=*'),
    api.get(`/employee_welfare_records?select=*&period=eq.${period}`),
  ]);
  const sMap: Record<string, any> = {};
  sRes.data.forEach((s: any) => { sMap[s.code] = s; });
  const hMap: Record<string, any> = {};
  hRes.data.forEach((h: any) => { hMap[h.code] = h; });

  let success = 0;
  let skipped = 0;
  for (const rec of recRes.data) {
    if (isLocked(rec)) { skipped++; continue; }
    try {
      if (!rec.social_welfare_code || !rec.housing_fund_code) { skipped++; continue; }
      const sSet = sMap[rec.social_welfare_code];
      const hSet = hMap[rec.housing_fund_code];
      if (!sSet || !hSet) { skipped++; continue; }

      const socialBase = Number(rec.social_base || 0);
      const housingBase = Number(rec.housing_base || 0);
      const suppBase = Number(rec.supp_base || housingBase);
      const social = sSet.code === 'SI-00' ? null : calcSocial(sSet as any, socialBase);
      const housing = hSet.code === 'HF-00' ? null : calcHousingFund(hSet as any, housingBase, suppBase, rec.supp_enabled);

      const psAdj = Number(rec.personal_social_adj || 0);
      const csAdj = Number(rec.company_social_adj || 0);
      const phAdj = Number(rec.personal_housing_adj || 0);
      const chAdj = Number(rec.company_housing_adj || 0);
      const personalSocial = social?.personal_total || 0;
      const personalHousing = housing?.personal_total || 0;
      const companySocial = social?.company_total || 0;
      const companyHousing = housing?.company_total || 0;

      let data_status = '正常';
      if (sSet.code !== 'SI-00' && !rec.social_base) data_status = '社保基数缺失';
      else if (hSet.code !== 'HF-00' && !rec.housing_base) data_status = '公积金基数缺失';
      else if (rec.supp_enabled && !rec.supp_base) data_status = '补充公积金基数缺失';
      else if (sSet.code === 'SI-00' && !rec.social_no_reason) data_status = '不缴纳原因缺失';
      else if (hSet.code === 'HF-00' && !rec.housing_no_reason) data_status = '不缴纳原因缺失';
      else if (psAdj !== 0 || csAdj !== 0 || phAdj !== 0 || chAdj !== 0) {
        data_status = (!rec.adj_reason) ? '调整原因缺失' : (!rec.adj_start_month || !rec.adj_end_month) ? '调整期间缺失' : '含调整';
      }

      const payload = {
        social_status: sSet.code === 'SI-00' ? '不参保' : '参保',
        housing_status: hSet.code === 'HF-00' ? '不缴存' : '缴存',
        pension_p_amt: social?.pension_p || 0,
        medical_p_amt: social?.medical_p || 0,
        unemployment_p_amt: social?.unemployment_p || 0,
        pension_c_amt: social?.pension_c || 0,
        medical_c_amt: social?.medical_c || 0,
        unemployment_c_amt: social?.unemployment_c || 0,
        injury_c_amt: social?.injury_c || 0,
        maternity_c_amt: social?.maternity_c || 0,
        normal_housing_p_amt: housing?.normal_p || 0,
        normal_housing_c_amt: housing?.normal_c || 0,
        supp_housing_p_amt: housing?.supp_p || 0,
        supp_housing_c_amt: housing?.supp_c || 0,
        personal_social_total: personalSocial,
        personal_housing_total: personalHousing,
        company_social_total: companySocial,
        company_housing_total: companyHousing,
        personal_total: round2(personalSocial + personalHousing),
        company_total: round2(companySocial + companyHousing),
        data_status,
        last_calc_time: new Date().toISOString(),
      };
      await api.patch(`/employee_welfare_records?id=eq.${rec.id}`, payload);
      success++;
    } catch { skipped++; }
  }
  return { step: '社保', success, skipped };
}

/** 生成从当年1月到某月的所有月份（个税年度内） */
function monthsFromJan(p: string): string[] {
  const [y, m] = p.split('-').map(Number);
  const arr: string[] = [];
  for (let i = 1; i <= m; i++) arr.push(`${y}-${String(i).padStart(2, '0')}`);
  return arr;
}

/** 3. 个税月度计算（正常计税） */
async function refreshNormalTax(period: string): Promise<RefreshStepResult> {
  const prev = prevPeriod(period);
  const periodsFromJan = monthsFromJan(period);
  const [empRes, openingRes, specialRes, prevSpecialRes, prevCalcRes, historyCalcRes, welfareRes, attRes, addRes] = await Promise.all([
    api.get(`/employees?select=unique_hash,name,status,pay_company,department,entry_date,leave_date,basic_salary&period=eq.${period}&tax_method=eq.normal`),
    api.get('/tax_opening_balances?select=*'),
    api.get(`/tax_special_deductions?select=*&period=eq.${period}`),
    api.get(`/tax_special_deductions?select=*&period=eq.${prev}`),
    api.get(`/tax_monthly_calcs?select=*&period=eq.${prev}`),
    api.get(`/tax_monthly_calcs?select=*&period=in.(${periodsFromJan.join(',')})`),
    api.get(`/employee_welfare_records?select=unique_hash,personal_total,personal_social_adj,personal_housing_adj,effective_month&period=eq.${period}`),
    api.get(`/attendance_records?select=unique_hash,attendance_adjust_total,data_status&period=eq.${period}`),
    api.get(`/additional_salary_records?select=*&period=eq.${period}`),
  ]);

  const openingMap: Record<string, any> = {};
  openingRes.data.forEach((r: any) => { openingMap[r.unique_hash] = r; });
  const specialMap: Record<string, any> = {};
  specialRes.data.forEach((r: any) => { specialMap[r.unique_hash] = r; });
  const prevSpecialMap: Record<string, any> = {};
  prevSpecialRes.data.forEach((r: any) => { prevSpecialMap[r.unique_hash] = r; });
  const prevMap: Record<string, any> = {};
  prevCalcRes.data.forEach((r: any) => { prevMap[r.unique_hash] = r; });
  const welfareMap: Record<string, any> = {};
  welfareRes.data.forEach((r: any) => { welfareMap[r.unique_hash] = r; });
  const attMap: Record<string, any> = {};
  attRes.data.forEach((r: any) => { attMap[r.unique_hash] = r; });
  const addMap: Record<string, any> = {};
  addRes.data.forEach((r: any) => { addMap[r.unique_hash] = r; });
  // 历史各月本期数（用于从6月起逐月累加累计数）
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

  let success = 0;
  let skipped = 0;
  for (const e of empRes.data) {
    if (!isActiveInPeriod(e, period)) continue;
    if (isLocked(attMap[e.unique_hash])) { skipped++; continue; }
    try {
      const opening = openingMap[e.unique_hash] || {};
      const special = specialMap[e.unique_hash] || {};
      const prevSpecial = prevSpecialMap[e.unique_hash] || {};
      const prev = prevMap[e.unique_hash] || {};
      const add = addMap[e.unique_hash] || {};
      const welfare = welfareMap[e.unique_hash] || {};

      const additionalTotal = round2(
        (add.allowance_supp || 0) + (add.other_adjust || 0) + (add.insurance_amount || 0) +
        (add.kpi_provision || 0) + (add.office_comm || 0) + (add.performance_pay || 0) +
        (add.apartment_comm || 0) + (add.talent_kpi || 0) + (add.heat_allowance || 0) +
        (add.other_allowance || 0) + (add.security_bonus || 0) + (add.cleaning_bonus || 0) +
        (add.service_fee || 0)
      );
      const currentTaxableIncome = round2(Number(e.basic_salary || 0) + Number(attMap[e.unique_hash]?.attendance_adjust_total || 0) + additionalTotal);

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

      // 累计数：期初累计值 + 历史月(6月至上月)本期数 + 当前月实时本期数（与个税页面算法一致）
      const hist = (historyMap[e.unique_hash] || []).filter((x: any) => x.period >= '2026-06' && x.period < period);
      const cumulTaxableIncome = Number(opening.cumul_income || 0) + hist.reduce((s: number, x: any) => s + (x.current_taxable_income || 0), 0) + Number(currentTaxableIncome || 0);
      const cumulFiveInsurance = Number(opening.cumul_five_insurance || 0) + hist.reduce((s: number, x: any) => s + (x.current_five_insurance || 0), 0) + Number(currentFiveInsurance || 0);
      const cumulSpecialDeduct = specialTotal;
      const cumulOtherDeduct = otherTotal;
      const cumulTaxRelief = Number(special.tax_relief || 0);
      const cumulTaxPaid = Number(opening.cumul_tax_paid || 0) + hist.filter((x: any) => x.period < period).reduce((s: number, x: any) => s + (x.monthly_tax || 0), 0);
      // 累计减除费用：按个税年度，当年之前入职=统计月，当年入职=(统计月-入职月+1)
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

      const payload = {
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
      };
      const existing = await api.get(`/tax_monthly_calcs?unique_hash=eq.${e.unique_hash}&period=eq.${period}`);
      if (existing.data.length > 0) {
        await api.patch(`/tax_monthly_calcs?id=eq.${existing.data[0].id}`, payload);
      } else {
        await api.post('/tax_monthly_calcs', payload);
      }
      success++;
    } catch { skipped++; }
  }
  return { step: '个税月度', success, skipped };
}

/** 4. 实习生个税 */
async function refreshInternTax(period: string): Promise<RefreshStepResult> {
  const prev = prevPeriod(period);
  const [empRes, openingRes, prevCalcRes, salaryRes] = await Promise.all([
    api.get(`/employees?select=unique_hash,name,status,entry_date,leave_date&period=eq.${period}&tax_method=eq.intern`),
    api.get('/tax_opening_balances?select=*'),
    api.get(`/tax_monthly_calcs?select=*&period=eq.${prev}`),
    api.get(`/salary_records?select=unique_hash,wage_subtotal&period=eq.${period}`),
  ]);
  const openingMap: Record<string, any> = {};
  openingRes.data.forEach((r: any) => { openingMap[r.unique_hash] = r; });
  const prevMap: Record<string, any> = {};
  prevCalcRes.data.forEach((r: any) => { prevMap[r.unique_hash] = r; });
  const salaryMap: Record<string, any> = {};
  salaryRes.data.forEach((r: any) => { salaryMap[r.unique_hash] = r; });

  const monthsWorked = (entryDate: string | undefined) => {
    if (!entryDate) return 1;
    const ey = parseInt(entryDate.slice(0, 4));
    const em = parseInt(entryDate.slice(5, 7));
    const [py, pm] = period.split('-').map(Number);
    const sy = ey < py ? py : ey;
    const sm = ey < py ? 1 : em;
    return (py - sy) * 12 + (pm - sm) + 1;
  };

  let success = 0;
  let skipped = 0;
  for (const e of empRes.data) {
    if (!isActiveInPeriod(e, period)) continue;
    try {
      const opening = openingMap[e.unique_hash] || {};
      const prev = prevMap[e.unique_hash] || {};
      const currentIncome = Number(salaryMap[e.unique_hash]?.wage_subtotal || 0);
      const isFirstMonth = period === '2026-06';
      const cumulIncome = isFirstMonth
        ? round2((Number(opening.cumul_income || 0) + currentIncome) * 0.80)
        : round2(Number(prev.cumul_taxable_income || 0) + currentIncome * 0.80);
      const cumulBasicDeduction = 5000 * monthsWorked(e.entry_date);
      const cumulTaxRelief = isFirstMonth ? Number(opening.cumul_tax_relief || 0) : Number(prev.cumul_tax_relief || 0);
      const cumulTaxPaid = isFirstMonth ? Number(opening.cumul_tax_paid || 0) : Number(prev.cumul_tax_paid || 0) + Number(prev.monthly_tax || 0);

      const result = calcInternTax({ cumul_income: cumulIncome, cumul_basic_deduction: cumulBasicDeduction, cumul_tax_relief: cumulTaxRelief, cumul_tax_paid: cumulTaxPaid });

      const payload = {
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
      };
      const existing = await api.get(`/tax_monthly_calcs?unique_hash=eq.${e.unique_hash}&period=eq.${period}`);
      if (existing.data.length > 0) {
        await api.patch(`/tax_monthly_calcs?id=eq.${existing.data[0].id}`, payload);
      } else {
        await api.post('/tax_monthly_calcs', payload);
      }
      success++;
    } catch { skipped++; }
  }
  return { step: '实习生个税', success, skipped };
}

/** 5. 薪资刷新同步 */
async function refreshPayroll(period: string): Promise<RefreshStepResult> {
  const [empRes, attRes, addRes, welfareRes, taxRes] = await Promise.all([
    api.get(`/employees?select=unique_hash,name,status,pay_company,cost_center,department,report_to,position,entry_date,leave_date,attendance_type,tax_method,basic_salary&period=eq.${period}`),
    api.get(`/attendance_records?select=unique_hash,attendance_adjust_total,data_status&period=eq.${period}`),
    api.get(`/additional_salary_records?select=*&period=eq.${period}`),
    api.get(`/employee_welfare_records?select=unique_hash,personal_total,company_total,personal_social_adj,personal_housing_adj,company_social_adj,company_housing_adj,effective_month&period=eq.${period}`),
    api.get(`/tax_monthly_calcs?select=unique_hash,monthly_tax&period=eq.${period}`),
  ]);
  const attMap: Record<string, any> = {};
  attRes.data.forEach((r: any) => { attMap[r.unique_hash] = r; });
  const addMap: Record<string, any> = {};
  addRes.data.forEach((r: any) => { addMap[r.unique_hash] = r; });
  const welfareMap: Record<string, any> = {};
  welfareRes.data.forEach((r: any) => { welfareMap[r.unique_hash] = r; });
  const taxMap: Record<string, any> = {};
  taxRes.data.forEach((r: any) => { taxMap[r.unique_hash] = r; });

  let success = 0;
  let skipped = 0;
  for (const e of empRes.data) {
    if (!isActiveInPeriod(e, period)) continue;
    const att = attMap[e.unique_hash];
    if (isLocked(att)) { skipped++; continue; }
    try {
      const add = addMap[e.unique_hash] || {};
      const welfare = welfareMap[e.unique_hash] || {};
      const additionalTotal = round2(
        (add.allowance_supp || 0) + (add.other_adjust || 0) + (add.insurance_amount || 0) +
        (add.kpi_provision || 0) + (add.office_comm || 0) + (add.performance_pay || 0) +
        (add.apartment_comm || 0) + (add.talent_kpi || 0) + (add.heat_allowance || 0) +
        (add.other_allowance || 0) + (add.security_bonus || 0) + (add.cleaning_bonus || 0) +
        (add.service_fee || 0)
      );
      const basicSalary = Number(e.basic_salary || 0);
      const attendanceAdjust = Number(att?.attendance_adjust_total || 0);
      const notYetEffective = !!(welfare.effective_month && welfare.effective_month > period);
      const personalWelfare = notYetEffective ? 0 : round2(Number(welfare.personal_total || 0) + Number(welfare.personal_social_adj || 0) + Number(welfare.personal_housing_adj || 0));
      const companyWelfare = notYetEffective ? 0 : round2(Number(welfare.company_total || 0) + Number(welfare.company_social_adj || 0) + Number(welfare.company_housing_adj || 0));
      const insuranceAmount = Number(add.insurance_amount || 0);
      // 服务费（来自附加薪酬），服务费调整 = -服务费
      const serviceFee = Number(add.service_fee || 0);
      const serviceFeeAdjust = -serviceFee;

      const wageSubtotal = round2(basicSalary + attendanceAdjust + additionalTotal);

      const taxMethod = e.tax_method || 'normal';
      let monthlyTax = 0;
      if (taxMethod === 'service') {
        monthlyTax = calcServiceTax(wageSubtotal).monthly_tax;
      } else if (taxMethod === 'cash') {
        // 现金计税：薪资小计 × 3%
        monthlyTax = round2(wageSubtotal * 0.03);
      } else if (taxMethod === 'non_taxable') {
        monthlyTax = 0;
      } else if (taxMethod === 'flexible') {
        // 灵工计税：（基本工资 + 考勤调整合计 − 6250）× 2.4%
        monthlyTax = round2(Math.max(0, (basicSalary + attendanceAdjust - 6250) * 0.024));
      } else {
        monthlyTax = Number(taxMap[e.unique_hash]?.monthly_tax || 0);
      }

      const netPay = round2(wageSubtotal - personalWelfare - monthlyTax - insuranceAmount - serviceFee);
      const totalCost = round2(wageSubtotal + companyWelfare);

      const payload = {
        unique_hash: e.unique_hash,
        period,
        month_number: parseInt(period.split('-')[1]) || 1,
        base_salary: basicSalary,
        attendance_adjust_total: attendanceAdjust,
        additional_total: additionalTotal,
        personal_welfare_total: personalWelfare,
        company_welfare_total: companyWelfare,
        monthly_tax: monthlyTax,
        insurance_amount: insuranceAmount,
        service_fee: serviceFee,
        service_fee_adjust: serviceFeeAdjust,
        wage_subtotal: wageSubtotal,
        net_pay: netPay,
        total_cost: totalCost,
        data_status: '已计算',
      };
      const existing = await api.get(`/salary_records?unique_hash=eq.${e.unique_hash}&period=eq.${period}`);
      if (existing.data.length > 0) {
        await api.patch(`/salary_records?id=eq.${existing.data[0].id}`, payload);
      } else {
        await api.post('/salary_records', payload);
      }
      success++;
    } catch { skipped++; }
  }
  return { step: '薪资', success, skipped };
}

/** 全局刷新（按依赖顺序执行所有模块），onStep 每完成一步回调一次，用于显示进度 */
export async function globalRefresh(period?: string, onStep?: (step: string, index: number, total: number) => void): Promise<GlobalRefreshResult> {
  const p = period || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const steps: RefreshStepResult[] = [];
  // 先确保该月花名册已生成（未生成自动按需生成）
  await ensureRoster(p);
  const total = 5;
  const run = async (name: string, fn: () => Promise<RefreshStepResult>): Promise<RefreshStepResult> => {
    // 回调"开始处理该步骤"
    if (onStep) onStep(name, steps.length, total);
    const r = await fn();
    steps.push(r);
    return r;
  };
  await run('考勤', () => refreshAttendance(p));
  await run('社保', () => refreshSocial(p));
  await run('个税月度', () => refreshNormalTax(p));
  await run('实习生个税', () => refreshInternTax(p));
  await run('薪资', () => refreshPayroll(p));
  return { steps };
}

export { DEFAULT_ATTENDANCE_RULES };
