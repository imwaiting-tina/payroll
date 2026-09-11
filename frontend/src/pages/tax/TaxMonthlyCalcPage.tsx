import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Space, message, Input, Tag, Select } from 'antd';
import { CalculatorOutlined, LinkOutlined, DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import api from '../../api/client';
import { calcIncomeTax } from '../../utils/taxCalc';
import { exportXlsx, type ExportDef } from '../../utils/importExport';
import { withSource } from '../../components/SourceTag';
import { isActiveInPeriod } from '../../utils/employee';
import { round2 } from '../../utils/round';
import { useStore } from '../../stores/appStore';
import { ensureRoster } from '../../utils/roster';
import { DataStatusTag, anyLocked } from '../../components/DataStatusTag';
import CalcProgress from '../../components/CalcProgress';

/**
 * 个税扣缴 — Tab 3：月度计算（累计预扣法）
 * 6月起每月一行，输出「当月个人所得税」联动薪酬板块
 */

const defaultPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

const fmtMoney = (v: any) => {
  if (v === undefined || v === null || v === '' || Number(v) === 0) return '—';
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// 导出表头（只导出，不支持导入）
const EXPORT_DEF: ExportDef = {
  module: '个税月度计算',
  columns: [
    { key: 'unique_hash', label: '唯一值', hidden: false },
    { key: 'employee_name', label: '姓名' },
    { key: 'pay_company', label: '发薪公司' },
    { key: 'cost_center', label: '成本中心' },
    { key: 'department', label: '部门' },
    { key: 'report_to', label: '汇报人' },
    { key: 'position', label: '职位' },
    { key: 'entry_date', label: '入职日期' },
    { key: 'attendance_type', label: '考勤制' },
    { key: 'current_taxable_income', label: '本期应税收入' },
    { key: 'current_five_insurance', label: '本期五险一金' },
    { key: 'cumul_taxable_income', label: '累计应税收入' },
    { key: 'cumul_basic_deduction', label: '累计减除费用' },
    { key: 'cumul_five_insurance', label: '累计五险一金' },
    { key: 'cumul_special_deduct', label: '累计专项附加' },
    { key: 'cumul_other_deduct', label: '累计其他扣除' },
    { key: 'cumul_tax_relief', label: '累计减免税额' },
    { key: 'cumul_taxable_income_net', label: '累计应纳税所得额' },
    { key: 'tax_rate', label: '预扣率' },
    { key: 'quick_deduction', label: '速算扣除数' },
    { key: 'monthly_tax', label: '当月个人所得税' },
  ],
};

const TaxMonthlyCalcPage: React.FC = () => {
  const [records, setRecords] = useState<any[]>([]);
  const [allRecords, setAllRecords] = useState<any[]>([]);
  const period = useStore(s => s.currentPeriod);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  // 历史各月本期数（用于从1月逐月累加累计数）
  const [historyMap, setHistoryMap] = useState<Record<string, any[]>>({});
  // 计算进度
  const [calcProgress, setCalcProgress] = useState<{ done: number; total: number; active: boolean; label: string }>({ done: 0, total: 0, active: false, label: '' });
  const [fKeyword, setFKeyword] = useState('');
  const [fPayCompany, setFPayCompany] = useState<string>();
  const [fDepartment, setFDepartment] = useState<string>();

  useEffect(() => { loadData(); }, [period]);

  const loadData = async () => {
    setLoading(true);
    try {
      await ensureRoster(period);
      // 并行加载：员工、期初累计数、专项附加、上月专项附加、上月计算、当月计算、社保个人福利、考勤调整、附加薪酬
      // 说明：累计数改为「从1月到当前月逐月累加本期数」，因此额外拉取1月~当前月所有 tax_monthly_calcs
      const periodsFromJan = monthsFromJan(period);
      const [empRes, openingRes, specialRes, prevSpecialRes, prevCalcRes, calcRes, historyCalcRes, welfareRes, attRes, addRes] = await Promise.all([
        api.get(`/employees?select=unique_hash,name,status,pay_company,cost_center,department,report_to,position,entry_date,leave_date,attendance_type,basic_salary&tax_method=eq.normal&period=eq.${period}`),
        api.get('/tax_opening_balances?select=*'),
        api.get(`/tax_special_deductions?select=*&period=eq.${period}`),
        api.get(`/tax_special_deductions?select=*&period=eq.${prevPeriod(period)}`),
        api.get(`/tax_monthly_calcs?select=*&period=eq.${prevPeriod(period)}`),
        api.get(`/tax_monthly_calcs?select=*&period=eq.${period}`),
        api.get(`/tax_monthly_calcs?select=*&period=in.(${periodsFromJan.join(',')})`),
        api.get(`/employee_welfare_records?select=unique_hash,personal_total,personal_social_adj,personal_housing_adj,effective_month&period=eq.${period}`),
        api.get(`/attendance_records?select=unique_hash,attendance_adjust_total&period=eq.${period}`),
        api.get(`/additional_salary_records?select=*&period=eq.${period}`),
      ]);

      const empList: any[] = empRes.data;
      const openingMap: Record<string, any> = {};
      openingRes.data.forEach((r: any) => { openingMap[r.unique_hash] = r; });
      const specialMap: Record<string, any> = {};
      specialRes.data.forEach((r: any) => { specialMap[r.unique_hash] = r; });
      const prevSpecialMap: Record<string, any> = {};
      prevSpecialRes.data.forEach((r: any) => { prevSpecialMap[r.unique_hash] = r; });
      const prevMap: Record<string, any> = {};
      prevCalcRes.data.forEach((r: any) => { prevMap[r.unique_hash] = r; });
      const calcMap: Record<string, any> = {};
      calcRes.data.forEach((r: any) => { calcMap[r.unique_hash] = r; });
      // 历史各月本期数（用于从1月逐月累加累计数）
      // historyMap[unique_hash] = [ {period, current_taxable_income, current_five_insurance, monthly_tax}, ... ]
      const newHistoryMap: Record<string, any[]> = {};
      (historyCalcRes.data || []).forEach((r: any) => {
        if (!newHistoryMap[r.unique_hash]) newHistoryMap[r.unique_hash] = [];
        newHistoryMap[r.unique_hash].push({
          period: r.period,
          current_taxable_income: Number(r.current_taxable_income || 0),
          current_five_insurance: Number(r.current_five_insurance || 0),
          monthly_tax: Number(r.monthly_tax || 0),
        });
      });
      setHistoryMap(newHistoryMap);
      const welfareMap: Record<string, any> = {};
      welfareRes.data.forEach((r: any) => { welfareMap[r.unique_hash] = r; });
      const attMap: Record<string, any> = {};
      attRes.data.forEach((r: any) => { attMap[r.unique_hash] = r; });
      const addMap: Record<string, any> = {};
      addRes.data.forEach((r: any) => { addMap[r.unique_hash] = r; });

      const merged = empList
        .filter((e: any) => isActiveInPeriod(e, period))
        .map((e: any) => {
          const opening = openingMap[e.unique_hash] || {};
          const special = specialMap[e.unique_hash] || {};
          const prevSpecial = prevSpecialMap[e.unique_hash] || {};
          const prev = prevMap[e.unique_hash] || {};
          const calc = calcMap[e.unique_hash] || {};
          const add = addMap[e.unique_hash] || {};
          // 附加薪酬合计 = 12项之和（与薪资计算板块口径一致）
          const additionalTotal = round2(
            (add.allowance_supp || 0) + (add.other_adjust || 0) + (add.insurance_amount || 0) +
            (add.kpi_provision || 0) + (add.office_comm || 0) + (add.performance_pay || 0) +
            (add.apartment_comm || 0) + (add.talent_kpi || 0) + (add.heat_allowance || 0) +
            (add.other_allowance || 0) + (add.security_bonus || 0) + (add.cleaning_bonus || 0)
          );
          // 本期应税收入 = 当月薪资小计 = 基本工资 + 考勤调整合计 + 附加薪酬合计（实时计算，与薪酬板块一致）
          const currentTaxableIncome = round2(
            Number(e.basic_salary || 0) + Number(attMap[e.unique_hash]?.attendance_adjust_total || 0) + additionalTotal
          );
          // 本期五险一金 = 个人社保合计(含调整) + 个人公积金合计(含调整)，与社保板块口径一致
          const welfare = welfareMap[e.unique_hash] || {};
          // 生效日期识别：生效日期 > 当前月份 → 本期五险一金为 0（与社保板块一致）
          const notYetEffective = !!(welfare.effective_month && welfare.effective_month > period);
          const currentFiveInsurance = notYetEffective
            ? 0
            : round2(
                Number(welfare.personal_total || 0) + Number(welfare.personal_social_adj || 0) + Number(welfare.personal_housing_adj || 0)
              );
          // 本期专项附加 = 本月累计 - 上月累计
          const specialTotal = (special.cumul_child_edu || 0) + (special.cumul_continuing_edu || 0) + (special.cumul_mortgage || 0) + (special.cumul_rent || 0) + (special.cumul_elder_care || 0) + (special.cumul_infant_care || 0);
          const prevSpecialTotal = (prevSpecial.cumul_child_edu || 0) + (prevSpecial.cumul_continuing_edu || 0) + (prevSpecial.cumul_mortgage || 0) + (prevSpecial.cumul_rent || 0) + (prevSpecial.cumul_elder_care || 0) + (prevSpecial.cumul_infant_care || 0);
          const currentSpecialDeduct = Math.max(0, round2(specialTotal - prevSpecialTotal));
          // 本期其他扣除 = 本月累计(其他扣除项合计) - 上月累计
          const otherTotal = (special.cumul_pension || 0) + (special.cumul_annuity || 0) + (special.cumul_health_ins || 0) + (special.cumul_tax_defer_ins || 0) + (special.cumul_donation || 0);
          const prevOtherTotal = (prevSpecial.cumul_pension || 0) + (prevSpecial.cumul_annuity || 0) + (prevSpecial.cumul_health_ins || 0) + (prevSpecial.cumul_tax_defer_ins || 0) + (prevSpecial.cumul_donation || 0);
          const currentOtherDeduct = Math.max(0, round2(otherTotal - prevOtherTotal));
          // 本期减免税额 = 本月累计减免 - 上月累计减免
          const currentTaxRelief = Math.max(0, round2((special.tax_relief || 0) - (prevSpecial.tax_relief || 0)));

          // ===== 累计数：期初累计值 + 从6月到当前月逐月累加本期数 =====
          // 期初累计数(tax_opening_balances)包含1-5月的累计，作为基数；6月起按月累加本期数
          const curPeriod = period;
          const hist = (historyMap[e.unique_hash] || []).filter((x: any) => x.period >= '2026-06' && x.period < curPeriod);
          // 累计应税收入 = 期初累计应税收入 + 历史月(6月至上月)本期应税收入之和 + 当前月实时本期应税收入
          const cumulTaxableIncome = Number(opening.cumul_income || 0) + hist.reduce((s: number, x: any) => s + (x.current_taxable_income || 0), 0) + Number(currentTaxableIncome || 0);
          // 累计五险一金 = 期初累计五险一金 + 历史月本期五险一金之和 + 当前月实时本期五险一金
          const cumulFiveInsurance = Number(opening.cumul_five_insurance || 0) + hist.reduce((s: number, x: any) => s + (x.current_five_insurance || 0), 0) + Number(currentFiveInsurance || 0);
          // 累计已缴税 = 期初累计已缴税 + 历史月(6月至当前月)当月个税之和（不含当月，当月尚未缴）
          const cumulTaxPaid = Number(opening.cumul_tax_paid || 0) + hist.reduce((s: number, x: any) => s + (x.monthly_tax || 0), 0);
          // 累计专项附加 = 报税系统累计值（不逐月累加）
          const cumulSpecialDeduct = specialTotal;
          // 累计其他扣除 = 报税系统累计值（不逐月累加）
          const cumulOtherDeduct = otherTotal;
          // 累计减免税额 = 报税系统累计值（不逐月累加）
          const cumulTaxRelief = Number(special.tax_relief || 0);
          // 累计减除费用：按个税年度（每年1月起）计，不跨年。当年之前入职=统计月，当年入职=(统计月-入职月+1)。
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

          return {
            key: calc.id ?? `emp-${e.unique_hash}`,
            unique_hash: e.unique_hash,
            employee_name: e.name,
            pay_company: e.pay_company || '',
            cost_center: e.cost_center || '',
            department: e.department || '',
            report_to: e.report_to || '',
            position: e.position || '',
            entry_date: e.entry_date || '',
            attendance_type: e.attendance_type || '',
            // 已有计算结果（累计数、monthly_tax 等存库值）
            ...calc,
            // 期初（6月用）
            opening: opening,
            // 上月累计
            prev: prev,
            // 本月专项附加完整字段（供计算用）
            special: special,
            employed_months: opening.employed_months || 5,
            // 本期数必须放在 ...calc 之后，用实时计算值覆盖存库旧值（与薪资板块口径一致）
            current_taxable_income: currentTaxableIncome,
            current_five_insurance: currentFiveInsurance,
            current_special_deduct: currentSpecialDeduct,
            current_other_deduct: currentOtherDeduct,
            current_tax_relief: currentTaxRelief,
            // 累计数也用实时计算值覆盖存库旧值（期初数更新后自动刷新）
            cumul_taxable_income: cumulTaxableIncome,
            cumul_five_insurance: cumulFiveInsurance,
            cumul_special_deduct: cumulSpecialDeduct,
            cumul_other_deduct: cumulOtherDeduct,
            cumul_tax_relief: cumulTaxRelief,
            cumul_basic_deduction: cumulBasicDeduction,
          };
        });

      setAllRecords(merged);
      setRecords(merged);
      setLocked(anyLocked(calcRes.data));
    } catch { message.error('加载个税计算数据失败'); }
    finally { setLoading(false); }
  };

  const filteredRecords = allRecords.filter((r: any) => {
    if (fKeyword && !(r.employee_name || '').includes(fKeyword)) return false;
    if (fPayCompany && r.pay_company !== fPayCompany) return false;
    if (fDepartment && r.department !== fDepartment) return false;
    return true;
  });

  // 计算上一个月
  function prevPeriod(p: string): string {
    const [y, m] = p.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  }

  // 生成从当年1月到当前月的所有月份列表（个税年度内）
  function monthsFromJan(p: string): string[] {
    const [y, m] = p.split('-').map(Number);
    const arr: string[] = [];
    for (let i = 1; i <= m; i++) arr.push(`${y}-${String(i).padStart(2, '0')}`);
    return arr;
  }

  // 执行当月计算
  const handleCalc = async () => {
    let success = 0;
    setCalcProgress({ done: 0, total: records.length, active: true, label: '正在计算当月个税' });
    for (const r of records) {
      try {
        // 累计数：期初累计值 + 从6月到当前月逐月累加本期数
        const curPeriodCalc = period;
        const opening = r.opening || {};
        const hist = (historyMap[r.unique_hash] || []).filter((x: any) => x.period >= '2026-06' && x.period < curPeriodCalc);
        const cumulTaxableIncome = Number(opening.cumul_income || 0) + hist.reduce((s: number, x: any) => s + (x.current_taxable_income || 0), 0) + Number(r.current_taxable_income || 0);
        const cumulFiveInsurance = Number(opening.cumul_five_insurance || 0) + hist.reduce((s: number, x: any) => s + (x.current_five_insurance || 0), 0) + Number(r.current_five_insurance || 0);
        const cumulTaxPaid = Number(opening.cumul_tax_paid || 0) + hist.reduce((s: number, x: any) => s + (x.monthly_tax || 0), 0);
        // 累计专项附加：直接取报税系统累计值
        const specialTotal = (r.special?.cumul_child_edu || 0) + (r.special?.cumul_continuing_edu || 0) + (r.special?.cumul_mortgage || 0) + (r.special?.cumul_rent || 0) + (r.special?.cumul_elder_care || 0) + (r.special?.cumul_infant_care || 0);
        const cumulSpecialDeduct = specialTotal;
        // 累计其他扣除：本月累计（年金+个人养老金+商业健康险+税延养老+捐赠）
        const otherTotal = (r.special?.cumul_pension || 0) + (r.special?.cumul_annuity || 0) + (r.special?.cumul_health_ins || 0) + (r.special?.cumul_tax_defer_ins || 0) + (r.special?.cumul_donation || 0);
        const cumulOtherDeduct = otherTotal;
        // 累计减免税额：本月累计减免
        const cumulTaxRelief = Number(r.special?.tax_relief || 0);
        // 累计减除费用：按个税年度（每年1月起）计，不跨年
        //  - 当年之前入职：累计 = 统计月 × 5000
        //  - 当年入职：    累计 = (统计月 - 入职月 + 1) × 5000
        const statYear = parseInt(period.split('-')[0]);
        const monthNum = parseInt(period.split('-')[1]);
        let employedMonths = monthNum;
        const entryDateStr = String(r.entry_date || '');
        if (entryDateStr) {
          const entryYear = parseInt(entryDateStr.slice(0, 4));
          const entryMonth = parseInt(entryDateStr.slice(5, 7));
          if (!isNaN(entryYear) && !isNaN(entryMonth) && entryYear === statYear) {
            // 当年入职
            employedMonths = Math.max(1, monthNum - entryMonth + 1);
          }
          // 当年之前入职 = 统计月（已默认）
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
          unique_hash: r.unique_hash,
          period,
          current_taxable_income: r.current_taxable_income,
          current_tax_free_income: 0,
          current_five_insurance: r.current_five_insurance,
          current_special_deduct: r.current_special_deduct,
          current_other_deduct: r.current_other_deduct,
          current_tax_relief: r.current_tax_relief,
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

        const existing = await api.get(`/tax_monthly_calcs?unique_hash=eq.${r.unique_hash}&period=eq.${period}`);
        if (existing.data.length > 0) {
          await api.patch(`/tax_monthly_calcs?id=eq.${existing.data[0].id}`, payload);
        } else {
          await api.post('/tax_monthly_calcs', payload);
        }
        success++;
      } catch { /* skip */ }
      setCalcProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    message.success(`计算完成：${success} / ${records.length} 条`);
    setCalcProgress({ done: 0, total: 0, active: false, label: '' });
    loadData();
  };

  // 联动薪酬板块：把当月个人所得税写入 salary_records
  const handleSync = async () => {
    let success = 0;
    for (const r of records) {
      try {
        if (r.monthly_tax === undefined) continue;
        const existing = await api.get(`/salary_records?unique_hash=eq.${r.unique_hash}&period=eq.${period}`);
        if (existing.data.length > 0) {
          await api.patch(`/salary_records?id=eq.${existing.data[0].id}`, { monthly_tax: r.monthly_tax });
          success++;
        }
      } catch { /* skip */ }
    }
    message.success(`已同步 ${success} 条到薪酬板块`);
  };

  const columns: any[] = [
    { title: withSource('姓名', '花名册同步'), dataIndex: 'employee_name', key: 'name', width: 90, fixed: 'left' },
    { title: withSource('发薪公司', '花名册同步'), dataIndex: 'pay_company', key: 'co', width: 130, ellipsis: true, fixed: 'left' },
    { title: withSource('成本中心', '花名册同步'), dataIndex: 'cost_center', key: 'cc', width: 90 },
    { title: withSource('部门', '花名册同步'), dataIndex: 'department', key: 'dept', width: 90 },
    { title: withSource('汇报人', '花名册同步'), dataIndex: 'report_to', key: 'rpt', width: 80 },
    { title: withSource('职位', '花名册同步'), dataIndex: 'position', key: 'pos', width: 90 },
    { title: withSource('入职日期', '花名册同步'), dataIndex: 'entry_date', key: 'jd', width: 100 },
    { title: withSource('考勤制', '花名册同步'), dataIndex: 'attendance_type', key: 'ws', width: 100 },
    { title: withSource('本期应税收入', '系统计算'), dataIndex: 'current_taxable_income', key: 'cti', width: 120, render: fmtMoney },
    { title: withSource('本期五险一金', '系统计算'), dataIndex: 'current_five_insurance', key: 'cfi', width: 120, render: fmtMoney },
    { title: withSource('累计应税收入', '系统计算'), dataIndex: 'cumul_taxable_income', key: 'cti2', width: 130, render: fmtMoney },
    { title: withSource('累计减除费用', '系统计算'), dataIndex: 'cumul_basic_deduction', key: 'cbd', width: 120, render: fmtMoney },
    { title: withSource('累计五险一金', '系统计算'), dataIndex: 'cumul_five_insurance', key: 'cfi2', width: 120, render: fmtMoney },
    { title: withSource('累计专项附加', '系统计算'), dataIndex: 'cumul_special_deduct', key: 'csd2', width: 120, render: fmtMoney },
    { title: withSource('累计其他扣除', '系统计算'), dataIndex: 'cumul_other_deduct', key: 'cod2', width: 120, render: fmtMoney },
    { title: withSource('累计减免税额', '系统计算'), dataIndex: 'cumul_tax_relief', key: 'ctr2', width: 120, render: fmtMoney },
    { title: withSource('累计应纳税所得额', '系统计算'), dataIndex: 'cumul_taxable_income_net', key: 'ctin', width: 140, render: fmtMoney },
    { title: withSource('预扣率', '系统计算'), dataIndex: 'tax_rate', key: 'tr', width: 80, render: (v: any) => v ? `${(v * 100).toFixed(0)}%` : '—' },
    { title: withSource('速算扣除数', '系统计算'), dataIndex: 'quick_deduction', key: 'qd', width: 100, render: fmtMoney },
    { title: withSource('当月个人所得税', '系统计算'), dataIndex: 'monthly_tax', key: 'mt', width: 130,
      render: (v: any) => <strong style={{ color: '#e74c3c' }}>{fmtMoney(v)}</strong> },
    { title: withSource('数据状态', '系统计算'), dataIndex: 'data_status', key: 'ds', width: 110, render: (v: string) => <DataStatusTag status={v} /> },
  ];

  return (
    <Card size="small" title="个税月度计算（累计预扣法，正常计税人员）">
      <CalcProgress {...calcProgress} />
      <Space style={{ marginBottom: 12 }} wrap>
        <Input placeholder="搜索姓名" prefix={<SearchOutlined />} value={fKeyword} onChange={e => setFKeyword(e.target.value)} style={{ width: 140 }} allowClear />
        <Select placeholder="发薪公司" allowClear showSearch optionFilterProp="label" value={fPayCompany} onChange={setFPayCompany} style={{ width: 150 }}
          options={records.map((e: any) => ({ value: e.pay_company, label: e.pay_company })).filter((v, i, a) => a.findIndex(x => x.value === v.value) === i)} />
        <Select placeholder="部门" allowClear showSearch optionFilterProp="label" value={fDepartment} onChange={setFDepartment} style={{ width: 130 }}
          options={records.map((e: any) => ({ value: e.department, label: e.department })).filter((v, i, a) => v.value && a.findIndex(x => x.value === v.value) === i)} />
        <Button type="primary" icon={<CalculatorOutlined />} onClick={handleCalc} disabled={locked}>计算当月个税</Button>
        <Button icon={<LinkOutlined />} onClick={handleSync} disabled={locked}>同步到薪酬板块</Button>
        <Button icon={<DownloadOutlined />} onClick={() => exportXlsx(EXPORT_DEF, filteredRecords, period)}>导出</Button>
      </Space>
      <Table columns={columns} dataSource={filteredRecords} loading={loading} scroll={{ x: 2000, y: 480 }} size="small" pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: [10, 20, 30, 50, 100], showTotal: t => `共 ${t} 条` }} />
    </Card>
  );
};

export default TaxMonthlyCalcPage;
