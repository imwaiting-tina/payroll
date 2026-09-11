import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Space, message, Input, Tag, Select, Modal, Input as AntInput, Drawer, Descriptions } from 'antd';
import { DownloadOutlined, CheckCircleOutlined, RollbackOutlined, SendOutlined, SearchOutlined, SyncOutlined, FileExcelOutlined } from '@ant-design/icons';
import api from '../api/client';
import { exportXlsx, type ExportDef } from '../utils/importExport';
import { withSource } from '../components/SourceTag';
import { useHorizontalScroll } from '../utils/useHorizontalScroll';
import { isActiveInPeriod } from '../utils/employee';
import { calcServiceTax } from '../utils/taxCalc';
import { round2 } from '../utils/round';
import { exportSummaryPdf, type SummaryRow } from '../utils/pdfExport';
import RawExcelModal from '../components/RawExcelModal';
import CalcProgress from '../components/CalcProgress';
import { useStore } from '../stores/appStore';
import { canSubmit, canApprove } from '../utils/permissions';
import { fetchApprovalStatus } from '../utils/approvalStatus';

/**
 * 薪资计算板块（改造版）
 * 从各模块取数计算，仅导出不支持导入，审批流带弹窗
 */

const defaultPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

const fmtMoney = (v: any) => {
  if (v === undefined || v === null || v === '' || Number(v) === 0) return '—';
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// 导出表头（全字段）
const EXPORT_DEF: ExportDef = {
  module: '薪资计算',
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
    { key: 'basic_salary', label: '基本工资' },
    { key: 'attendance_adjust_total', label: '考勤调整合计' },
    { key: 'additional_total', label: '附加薪酬合计' },
    { key: 'personal_welfare_total', label: '个人福利合计' },
    { key: 'company_welfare_total', label: '公司福利合计' },
    { key: 'monthly_tax', label: '当月个人所得税' },
    { key: 'insurance_amount', label: '商保金额' },
    { key: 'service_fee', label: '服务费' },
    { key: 'service_fee_adjust', label: '服务费调整' },
    { key: 'wage_subtotal', label: '薪资小计' },
    { key: 'net_pay', label: '实收工资' },
    { key: 'total_cost', label: '企业人力成本总计' },
    { key: 'data_status', label: '数据状态' },
  ],
};

const PayrollPage: React.FC = () => {
  const { ref: scrollRef, onWheel } = useHorizontalScroll<HTMLDivElement>();
  const [records, setRecords] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Record<string, any>>({});
  // 全局月份：来自顶部月份选择器
  const period = useStore(s => s.currentPeriod);
  const [loading, setLoading] = useState(false);
  // 刷新同步进度
  const [calcProgress, setCalcProgress] = useState<{ done: number; total: number; active: boolean; label: string }>({ done: 0, total: 0, active: false, label: '' });

  // 筛选
  const [fPayCompany, setFPayCompany] = useState<string>();
  const [fCostCenter, setFCostCenter] = useState<string>();
  const [fDepartment, setFDepartment] = useState<string>();
  const [keyword, setKeyword] = useState('');

  // 审批弹窗
  const [approveModal, setApproveModal] = useState<{ type: 'submit' | 'approve' | 'reject' } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  // 前置审批状态（提交薪资需花名册+考勤都已锁定）
  const [rosterLocked, setRosterLocked] = useState(false);
  const [attendanceLocked, setAttendanceLocked] = useState(false);
  const [payrollSubmitted, setPayrollSubmitted] = useState(false);
  const [payrollLocked, setPayrollLocked] = useState(false);
  // 薪资审批通过后询问是否下载 summary PDF 的弹窗
  const [summaryModal, setSummaryModal] = useState(false);
  // 原始表格弹窗
  const [rawModalOpen, setRawModalOpen] = useState(false);
  // 详情抽屉
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<any>(null);

  useEffect(() => { loadData(); }, [period, fPayCompany, fCostCenter, fDepartment, keyword]);

  // 拉取各模块数据源并按当月口径计算（返回员工映射 + 合并后的所有在职行）
  const fetchAndCompute = async (): Promise<{ empMap: Record<string, any>; merged: any[] }> => {
    const [empRes, attRes, addRes, welfareRes, taxRes, salaryRes] = await Promise.all([
      api.get(`/employees?select=unique_hash,name,status,pay_company,cost_center,department,report_to,position,entry_date,leave_date,attendance_type,tax_method,basic_salary&period=eq.${period}`),
      api.get(`/attendance_records?select=unique_hash,attendance_adjust_total,data_status&period=eq.${period}`),
      api.get(`/additional_salary_records?select=*&period=eq.${period}`),
      api.get(`/employee_welfare_records?select=unique_hash,personal_total,company_total,personal_social_adj,personal_housing_adj,company_social_adj,company_housing_adj,effective_month,pension_p_amt,medical_p_amt,unemployment_p_amt,normal_housing_p_amt,supp_housing_p_amt,pension_c_amt,medical_c_amt,unemployment_c_amt,injury_c_amt,maternity_c_amt,normal_housing_c_amt,supp_housing_c_amt&period=eq.${period}`),
      api.get(`/tax_monthly_calcs?select=unique_hash,monthly_tax&period=eq.${period}`),
      api.get(`/salary_records?select=*&period=eq.${period}`),
    ]);

    const empList: any[] = empRes.data;
    const empMap: Record<string, any> = {};
    empList.forEach((e: any) => { empMap[e.unique_hash] = e; });

    const attMap: Record<string, any> = {};
    attRes.data.forEach((r: any) => { attMap[r.unique_hash] = r; });
    const addMap: Record<string, any> = {};
    addRes.data.forEach((r: any) => { addMap[r.unique_hash] = r; });
    const welfareMap: Record<string, any> = {};
    welfareRes.data.forEach((r: any) => { welfareMap[r.unique_hash] = r; });
    const taxMap: Record<string, any> = {};
    taxRes.data.forEach((r: any) => { taxMap[r.unique_hash] = r; });
    // 已保存的薪资快照（含 data_status），用于锁定月份冻结数据
    const salaryMap: Record<string, any> = {};
    salaryRes.data.forEach((r: any) => { salaryMap[r.unique_hash] = r; });

    const merged = empList
      .filter((e: any) => isActiveInPeriod(e, period))
      .map((e: any) => {
        const add = addMap[e.unique_hash] || {};
        const welfare = welfareMap[e.unique_hash] || {};
        // 已保存的快照
        const snap = salaryMap[e.unique_hash];
        const snapLocked = snap && (snap.data_status === '已锁定' || snap.data_status === '已提交老板查看' || snap.data_status === '已提交审批');

        // 已锁定/已提交的月份：直接用快照数据，不跟随花名册等实时数据变动
        if (snapLocked) {
          return {
            key: `emp-${e.unique_hash}`,
            unique_hash: e.unique_hash,
            employee_name: e.name,
            pay_company: e.pay_company || '',
            cost_center: e.cost_center || '',
            department: e.department || '',
            report_to: e.report_to || '',
            position: e.position || '',
            entry_date: e.entry_date || '',
            attendance_type: e.attendance_type || '',
            tax_method: e.tax_method || 'normal',
            basic_salary: snap.base_salary ?? e.basic_salary ?? 0,
            attendance_adjust_total: snap.attendance_adjust_total ?? 0,
            additional_total: snap.additional_total ?? 0,
            personal_welfare_total: snap.personal_welfare_total ?? 0,
            company_welfare_total: snap.company_welfare_total ?? 0,
            monthly_tax: snap.monthly_tax ?? 0,
            insurance_amount: snap.insurance_amount ?? 0,
            insurance_adjust: snap.insurance_adjust ?? 0,
            service_fee: snap.service_fee ?? 0,
            service_fee_adjust: snap.service_fee_adjust ?? 0,
            wage_subtotal: snap.wage_subtotal ?? 0,
            net_pay: snap.net_pay ?? 0,
            total_cost: snap.total_cost ?? 0,
            data_status: snap.data_status,
            // 明细（抽屉用）
            allowance_supp: snap.allowance_supp ?? 0,
            other_adjust: snap.other_adjust ?? 0,
            kpi_provision: snap.kpi_provision ?? 0,
            office_comm: snap.office_comm ?? 0,
            performance_pay: snap.performance_pay ?? 0,
            apartment_comm: snap.apartment_comm ?? 0,
            talent_kpi: snap.talent_kpi ?? 0,
            heat_allowance: snap.heat_allowance ?? 0,
            other_allowance: snap.other_allowance ?? 0,
            security_bonus: snap.security_bonus ?? 0,
            cleaning_bonus: snap.cleaning_bonus ?? 0,
            pension_p: snap.pension_p ?? 0,
            medical_p: snap.medical_p ?? 0,
            unemployment_p: snap.unemployment_p ?? 0,
            housing_fund_p: snap.housing_fund_p ?? 0,
            supp_housing_p: snap.supp_housing_p ?? 0,
            pension_c: snap.pension_c ?? 0,
            medical_c: snap.medical_c ?? 0,
            unemployment_c: snap.unemployment_c ?? 0,
            injury_c: snap.injury_c ?? 0,
            maternity_c: snap.maternity_c ?? 0,
            housing_fund_c: snap.housing_fund_c ?? 0,
            supp_housing_c: snap.supp_housing_c ?? 0,
            _locked: true,
          };
        }

        // 附加薪酬合计 = 13项之和（含服务费，服务费进入薪资小计，与商保同理）
        const additionalTotal = round2(
          (add.allowance_supp || 0) + (add.other_adjust || 0) + (add.insurance_amount || 0) +
          (add.kpi_provision || 0) + (add.office_comm || 0) + (add.performance_pay || 0) +
          (add.apartment_comm || 0) + (add.talent_kpi || 0) + (add.heat_allowance || 0) +
          (add.other_allowance || 0) + (add.security_bonus || 0) + (add.cleaning_bonus || 0) +
          (add.service_fee || 0)
        );

        const basicSalary = Number(e.basic_salary || 0);
        const attendanceAdjust = Number(attMap[e.unique_hash]?.attendance_adjust_total || 0);
        // 生效日期识别：生效日期 > 当前月份 → 个人/公司福利合计为 0（与社保板块一致）
        const notYetEffective = !!(welfare.effective_month && welfare.effective_month > period);
        // 个人福利合计(含调整) = personal_total + 个人社保调整 + 个人公积金调整，与社保板块口径一致
        const personalWelfare = notYetEffective
          ? 0
          : round2(Number(welfare.personal_total || 0) + Number(welfare.personal_social_adj || 0) + Number(welfare.personal_housing_adj || 0));
        // 公司福利合计(含调整) = company_total + 公司社保调整 + 公司公积金调整
        const companyWelfare = notYetEffective
          ? 0
          : round2(Number(welfare.company_total || 0) + Number(welfare.company_social_adj || 0) + Number(welfare.company_housing_adj || 0));
        const insuranceAmount = Number(add.insurance_amount || 0);
        // 商保调整 = 商保金额的负数
        const insuranceAdjust = -insuranceAmount;
        // 服务费（来自附加薪酬），服务费调整 = -服务费
        const serviceFee = Number(add.service_fee || 0);
        const serviceFeeAdjust = -serviceFee;

        // 薪资小计 = 基本工资 + 考勤调整合计 + 附加薪酬合计（薪资板块以基本工资为基数）
        const wageSubtotal = round2(basicSalary + attendanceAdjust + additionalTotal);

        // 当月个税按计税方式分支：
        // - 劳务计税(service)：一般预扣法（三级超额累进），与劳务个税板块一致
        // - 现金计税(cash)：薪资小计 × 3%
        // - 不计税(non_taxable)：0
        // - 灵工计税(flexible)：（基本工资 + 考勤调整合计 − 6250）× 2.4%，特殊应用基本工资+考勤调整合计
        // - 实习生计税(intern)：从个税月度计算表取（实习生个税板块也写这张表）
        // - 正常计税(normal)：从个税月度计算表取
        const taxMethod = e.tax_method || 'normal';
        let monthlyTax: number;
        if (taxMethod === 'service') {
          monthlyTax = calcServiceTax(wageSubtotal).monthly_tax;
        } else if (taxMethod === 'cash') {
          monthlyTax = round2(wageSubtotal * 0.03);
        } else if (taxMethod === 'non_taxable') {
          monthlyTax = 0;
        } else if (taxMethod === 'flexible') {
          monthlyTax = round2(Math.max(0, (basicSalary + attendanceAdjust - 6250) * 0.024));
        } else {
          monthlyTax = Number(taxMap[e.unique_hash]?.monthly_tax || 0);
        }

        // 实收工资 = 薪资小计 - 个人福利合计 - 当月个人所得税 - 商保金额 - 服务费
        const netPay = round2(wageSubtotal - personalWelfare - monthlyTax - insuranceAmount - serviceFee);
        // 企业人力成本总计 = 薪资小计 + 公司福利合计
        const totalCost = round2(wageSubtotal + companyWelfare);

        return {
          key: `emp-${e.unique_hash}`,
          unique_hash: e.unique_hash,
          employee_name: e.name,
          pay_company: e.pay_company || '',
          cost_center: e.cost_center || '',
          department: e.department || '',
          report_to: e.report_to || '',
          position: e.position || '',
          entry_date: e.entry_date || '',
          attendance_type: e.attendance_type || '',
          tax_method: taxMethod,
          basic_salary: basicSalary,
          attendance_adjust_total: attendanceAdjust,
          additional_total: additionalTotal,
          personal_welfare_total: personalWelfare,
          company_welfare_total: companyWelfare,
          monthly_tax: monthlyTax,
          insurance_amount: insuranceAmount,
          insurance_adjust: insuranceAdjust,
          service_fee: serviceFee,
          service_fee_adjust: serviceFeeAdjust,
          wage_subtotal: wageSubtotal,
          net_pay: netPay,
          total_cost: totalCost,
          data_status: attMap[e.unique_hash]?.data_status || '未录入',
          // 明细（抽屉用）
          allowance_supp: add.allowance_supp || 0,
          other_adjust: add.other_adjust || 0,
          kpi_provision: add.kpi_provision || 0,
          office_comm: add.office_comm || 0,
          performance_pay: add.performance_pay || 0,
          apartment_comm: add.apartment_comm || 0,
          talent_kpi: add.talent_kpi || 0,
          heat_allowance: add.heat_allowance || 0,
          other_allowance: add.other_allowance || 0,
          security_bonus: add.security_bonus || 0,
          cleaning_bonus: add.cleaning_bonus || 0,
          pension_p: welfare.pension_p_amt || 0,
          medical_p: welfare.medical_p_amt || 0,
          unemployment_p: welfare.unemployment_p_amt || 0,
          housing_fund_p: welfare.normal_housing_p_amt || 0,
          supp_housing_p: welfare.supp_housing_p_amt || 0,
          pension_c: welfare.pension_c_amt || 0,
          medical_c: welfare.medical_c_amt || 0,
          unemployment_c: welfare.unemployment_c_amt || 0,
          injury_c: welfare.injury_c_amt || 0,
          maternity_c: welfare.maternity_c_amt || 0,
          housing_fund_c: welfare.normal_housing_c_amt || 0,
          supp_housing_c: welfare.supp_housing_c_amt || 0,
        };
      });

    return { empMap, merged };
  };

  // 应用前端筛选
  const applyFilters = (rows: any[]) => {
    let merged = rows;
    if (fPayCompany) merged = merged.filter((r: any) => r.pay_company === fPayCompany);
    if (fCostCenter) merged = merged.filter((r: any) => (r.cost_center || '').includes(fCostCenter));
    if (fDepartment) merged = merged.filter((r: any) => (r.department || '').includes(fDepartment));
    if (keyword) merged = merged.filter((r: any) => (r.employee_name || '').includes(keyword));
    return merged;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const { empMap, merged } = await fetchAndCompute();
      setEmployees(empMap);
      setRecords(applyFilters(merged));

      // 前置审批状态（提交薪资需花名册+考勤已锁定）
      const gateStatus = await fetchApprovalStatus(period);
      setRosterLocked(gateStatus.rosterLocked);
      setAttendanceLocked(gateStatus.attendanceLocked);
      setPayrollSubmitted(gateStatus.payrollSubmitted);
      setPayrollLocked(gateStatus.payrollLocked);
    } catch { message.error('加载薪资数据失败'); }
    finally { setLoading(false); }
  };

  // 刷新同步数据：重新拉取各模块数据源 → 重新计算 → 落库 salary_records
  const handleRefreshSync = async () => {
    setLoading(true);
    try {
      const { empMap, merged } = await fetchAndCompute();
      setEmployees(empMap);

      let success = 0;
      let skippedLocked = 0;
      setCalcProgress({ done: 0, total: merged.length, active: true, label: '正在刷新同步薪资' });
      for (const r of merged) {
        try {
          // 已锁定的记录跳过，不覆盖（冻结数据不随刷新变动）
          if (r._locked) {
            skippedLocked++;
            continue;
          }
          const payload = {
            unique_hash: r.unique_hash,
            period,
            month_number: parseInt(period.split('-')[1]) || 1,
            base_salary: r.basic_salary,
            attendance_adjust_total: r.attendance_adjust_total,
            additional_total: r.additional_total,
            personal_welfare_total: r.personal_welfare_total,
            company_welfare_total: r.company_welfare_total,
            monthly_tax: r.monthly_tax,
            insurance_amount: r.insurance_amount,
            service_fee: r.service_fee,
            service_fee_adjust: r.service_fee_adjust,
            wage_subtotal: r.wage_subtotal,
            net_pay: r.net_pay,
            total_cost: r.total_cost,
            data_status: '已计算',
          };
          const existing = await api.get(`/salary_records?unique_hash=eq.${r.unique_hash}&period=eq.${period}`);
          if (existing.data.length > 0) {
            await api.patch(`/salary_records?id=eq.${existing.data[0].id}`, payload);
          } else {
            await api.post('/salary_records', payload);
          }
          success++;
        } catch { /* skip */ }
        setCalcProgress((p) => ({ ...p, done: p.done + 1 }));
      }

      setRecords(applyFilters(merged));
      setCalcProgress({ done: 0, total: 0, active: false, label: '' });
      if (skippedLocked > 0) {
        message.success(`刷新同步完成：已保存 ${success} 条，跳过 ${skippedLocked} 条（已锁定，冻结不更新）`);
      } else {
        message.success(`刷新同步完成：已保存 ${success} / ${merged.length} 条计算结果`);
      }
    } catch { message.error('刷新同步数据失败'); }
    finally { setLoading(false); }
  };

  const handleExport = () => exportXlsx(EXPORT_DEF, records, period);

  // 工资条导出定义（抽屉详情数据）
  const PAYSLIP_EXPORT_DEF: ExportDef = {
    module: '工资条',
    columns: [
      { key: 'unique_hash', label: '唯一值', hidden: false },
      { key: 'employee_name', label: '姓名' },
      { key: 'net_pay', label: '实收' },
      { key: 'basic_salary', label: '基本工资' },
      { key: 'allowance_supp', label: '补贴/补充公积金' },
      { key: 'attendance_adjust_total', label: '考勤调整合计' },
      { key: 'other_adjust', label: '其他补贴/调整' },
      { key: 'insurance_amount', label: '商保金额' },
      { key: 'kpi_provision', label: 'KPI预提' },
      { key: 'office_comm', label: '商办佣金' },
      { key: 'performance_pay', label: '绩效' },
      { key: 'apartment_comm', label: '公寓佣金' },
      { key: 'talent_kpi', label: '人才系KPI' },
      { key: 'heat_allowance', label: '防暑降温费' },
      { key: 'other_allowance', label: '津贴' },
      { key: 'security_bonus', label: '保安奖金' },
      { key: 'cleaning_bonus', label: '保洁奖金' },
      { key: 'service_fee', label: '服务费' },
      { key: 'wage_subtotal', label: '薪资小计' },
      { key: 'pension_p', label: '个人养老' },
      { key: 'medical_p', label: '个人医疗' },
      { key: 'unemployment_p', label: '个人失业' },
      { key: 'housing_fund_p', label: '个人公积金' },
      { key: 'supp_housing_p', label: '个人补充公积金' },
      { key: 'personal_welfare_total', label: '个人福利合计' },
      { key: 'monthly_tax', label: '当月个人所得税' },
      { key: 'insurance_adjust', label: '商保调整' },
      { key: 'service_fee_adjust', label: '服务费调整' },
    ],
  };

  const handleExportPayslip = () => exportXlsx(PAYSLIP_EXPORT_DEF, records, period);

  const openDetail = (r: any) => {
    setDetailRecord(r);
    setDetailOpen(true);
  };

  // 保存计算结果（落库 salary_records）
  const handleSaveResult = async () => {
    let success = 0;
    for (const r of records) {
      try {
        const payload = {
          unique_hash: r.unique_hash,
          period,
          month_number: parseInt(period.split('-')[1]) || 1,
          base_salary: r.basic_salary,
          attendance_adjust_total: r.attendance_adjust_total,
          additional_total: r.additional_total,
          personal_welfare_total: r.personal_welfare_total,
          company_welfare_total: r.company_welfare_total,
          monthly_tax: r.monthly_tax,
          insurance_amount: r.insurance_amount,
          service_fee: r.service_fee,
          service_fee_adjust: r.service_fee_adjust,
          wage_subtotal: r.wage_subtotal,
          net_pay: r.net_pay,
          total_cost: r.total_cost,
          data_status: '已计算',
        };
        const existing = await api.get(`/salary_records?unique_hash=eq.${r.unique_hash}&period=eq.${period}`);
        if (existing.data.length > 0) {
          await api.patch(`/salary_records?id=eq.${existing.data[0].id}`, payload);
        } else {
          await api.post('/salary_records', payload);
        }
        success++;
      } catch { /* skip */ }
    }
    message.success(`已保存 ${success} / ${records.length} 条计算结果到数据库`);
  };

  // 审批流（薪资模块，遵循新权限体系）
  const isOperator = canSubmit('payroll');
  const isApprover = canApprove('payroll');

  // 提交薪资的前置关卡：花名册+考勤都已审批锁定
  const payrollGatePass = rosterLocked && attendanceLocked;

  const updateTableStatus = async (table: string, status: string) => {
    try {
      await api.patch(`/${table}?period=eq.${period}`, { data_status: status });
    } catch { /* 忽略 */ }
  };

  const handleSubmit = async () => {
    setApproveModal({ type: 'submit' });
  };
  const handleApprove = async () => {
    setApproveModal({ type: 'approve' });
  };
  const handleReject = async () => {
    setRejectReason('');
    setApproveModal({ type: 'reject' });
  };

  const confirmSubmit = async () => {
    // 只提交薪资模块的审批（花名册/考勤各自独立审批，不连带改状态）
    await updateTableStatus('salary_records', '已提交审批');
    message.success('已提交薪资审批');
    setApproveModal(null);
    loadData();
  };

  const confirmApprove = async () => {
    // 薪资是最终审批：通过后冻结当月所有模块数据，之后都不能再改
    const tables = [
      'employees',              // 花名册
      'attendance_records',     // 考勤
      'employee_welfare_records', // 社保/福利
      'additional_salary_records', // 附加薪酬
      'tax_monthly_calcs',      // 个税
      'salary_records',         // 薪资
    ];
    await Promise.all(tables.map(t => updateTableStatus(t, '已锁定')));
    message.success('审批通过，当月所有数据已冻结');
    setApproveModal(null);
    // 审批通过后弹窗询问是否下载 summary PDF
    setSummaryModal(true);
    loadData();
  };

  // 薪资审批通过后，直接从当前月份数据组装并按公司/部门导出 summary PDF
  const handleDownloadSummaryPdf = async () => {
    try {
      const empRes = await api.get(`/employees?select=unique_hash,name,pay_company,cost_center,department,status,entry_date,leave_date,provision_welfare&period=eq.${period}`);
      const empList: any[] = empRes.data;
      const empMap: Record<string, any> = {};
      empList.forEach((e: any) => { empMap[e.unique_hash] = e; });
      const activeEmps = empList.filter((e: any) => isActiveInPeriod(e, period));

      const salRes = await api.get(`/salary_records?select=*&period=eq.${period}`);
      const salList: any[] = salRes.data;

      const [addRes, welfareRes, attRes] = await Promise.all([
        api.get(`/additional_salary_records?select=*&period=eq.${period}`),
        api.get(`/employee_welfare_records?select=unique_hash,personal_total,company_total&period=eq.${period}`),
        api.get(`/attendance_records?select=unique_hash,attendance_adjust_total&period=eq.${period}`),
      ]);
      const addMap: Record<string, any> = {};
      addRes.data.forEach((r: any) => { addMap[r.unique_hash] = r; });
      const welfareMap: Record<string, any> = {};
      welfareRes.data.forEach((r: any) => { welfareMap[r.unique_hash] = r; });
      const attMap: Record<string, any> = {};
      attRes.data.forEach((r: any) => { attMap[r.unique_hash] = r; });

      // 绩效&佣金 与「附加薪酬」页保持一致（8项）：商办佣金 + 绩效 + 公寓佣金 + 人才系KPI + 防暑降温费 + 津贴 + 保安奖金 + 保洁奖金
      const perfComm = (add: any) => (add.office_comm || 0) + (add.performance_pay || 0) + (add.apartment_comm || 0) + (add.talent_kpi || 0) + (add.heat_allowance || 0) + (add.other_allowance || 0) + (add.security_bonus || 0) + (add.cleaning_bonus || 0);

      const buildRows = (key: 'pay_company' | 'department'): SummaryRow[] => {
        const by: Record<string, SummaryRow> = {};
        activeEmps.forEach((e: any) => {
          const g = e[key] || '未知';
          if (!by[g]) by[g] = { group: g, count: 0, net: 0, company_welfare: 0, personal_welfare: 0, perf_comm: 0, attendance_adjust: 0, insurance: 0, provision: 0, total_cost: 0 };
          by[g].count++;
        });
        salList.forEach((r: any) => {
          const emp = empMap[r.unique_hash];
          if (!emp) return;
          const g = emp[key] || '未知';
          if (!by[g]) by[g] = { group: g, count: 0, net: 0, company_welfare: 0, personal_welfare: 0, perf_comm: 0, attendance_adjust: 0, insurance: 0, provision: 0, total_cost: 0 };
          const add = addMap[r.unique_hash] || {};
          by[g].net += Number(r.net_pay || 0);
          by[g].company_welfare += Number(r.company_welfare_total || 0);
          by[g].personal_welfare += Number(r.personal_welfare_total || 0);
          by[g].perf_comm += perfComm(add);
          by[g].attendance_adjust += Number(attMap[r.unique_hash]?.attendance_adjust_total || 0);
          by[g].insurance += Number(add.insurance_amount || 0);
          by[g].provision += Number(emp.provision_welfare || 0);
          by[g].total_cost += Number(r.total_cost || 0);
        });
        return Object.values(by);
      };

      const companyRows = buildRows('pay_company');
      const deptRows = buildRows('department');
      await exportSummaryPdf(companyRows, deptRows, period);
      setSummaryModal(false);
      message.success('Summary PDF 已下载');
    } catch (e: any) {
      message.error(e?.message || 'PDF 导出失败');
    }
  };

  const confirmReject = async () => {
    if (!rejectReason.trim()) {
      message.warning('请填写退回理由');
      return;
    }
    // 只退回薪资模块（花名册/考勤由各自审批人处理）
    await updateTableStatus('salary_records', '退回修改');
    message.success('已退回修改');
    setApproveModal(null);
    setRejectReason('');
    loadData();
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
    { title: withSource('计税方式', '花名册同步'), dataIndex: 'tax_method', key: 'tm', width: 90,
      render: (v: string) => {
        const map: Record<string, { label: string; color: string }> = {
          normal: { label: '正常计税', color: 'blue' },
          service: { label: '劳务计税', color: 'orange' },
          intern: { label: '实习生计税', color: 'purple' },
          flexible: { label: '灵工计税', color: 'cyan' },
          cash: { label: '现金计税', color: 'gold' },
          non_taxable: { label: '不计税', color: 'green' },
        };
        const m = map[v] || { label: v, color: 'default' };
        return <Tag color={m.color}>{m.label}</Tag>;
      } },
    { title: withSource('基本工资', '花名册同步'), dataIndex: 'basic_salary', key: 'bs', width: 110, render: fmtMoney },
    { title: withSource('考勤调整合计', '考勤同步'), dataIndex: 'attendance_adjust_total', key: 'aat', width: 120, render: fmtMoney },
    { title: withSource('附加薪酬合计', '附加薪酬同步'), dataIndex: 'additional_total', key: 'at', width: 120, render: fmtMoney },
    { title: withSource('个人福利合计', '社保同步'), dataIndex: 'personal_welfare_total', key: 'pwt', width: 120, render: fmtMoney },
    { title: withSource('公司福利合计', '社保同步'), dataIndex: 'company_welfare_total', key: 'cwt', width: 120, render: fmtMoney },
    { title: withSource('当月个人所得税', '个税同步'), dataIndex: 'monthly_tax', key: 'mt', width: 130, render: (v: any) => <span style={{ color: '#e74c3c' }}>{fmtMoney(v)}</span> },
    { title: withSource('商保金额', '附加薪酬同步'), dataIndex: 'insurance_amount', key: 'ia', width: 100, render: fmtMoney },
    { title: withSource('服务费', '附加薪酬同步'), dataIndex: 'service_fee', key: 'sf', width: 100, render: fmtMoney },
    { title: withSource('薪资小计', '系统计算'), dataIndex: 'wage_subtotal', key: 'wst', width: 110, render: (v: any) => <strong>{fmtMoney(v)}</strong> },
    { title: withSource('实收工资', '系统计算'), dataIndex: 'net_pay', key: 'np', width: 110, render: (v: any) => <strong style={{ color: '#27ae60' }}>{fmtMoney(v)}</strong> },
    { title: withSource('企业人力成本总计', '系统计算'), dataIndex: 'total_cost', key: 'tc', width: 140, render: (v: any) => <strong>{fmtMoney(v)}</strong> },
    { title: withSource('数据状态', '系统计算'), dataIndex: 'data_status', key: 'ds', width: 100, fixed: 'right',
      render: (v: string) => <Tag color={v === '已锁定' ? 'red' : v === '已提交老板查看' ? 'gold' : 'blue'}>{v}</Tag> },
    {
      title: '操作', key: 'act', width: 80, fixed: 'right',
      render: (_: any, r: any) => (
        <Button size="small" onClick={() => openDetail(r)}>查看</Button>
      ),
    },
  ];

  return (
    <div>
      <CalcProgress {...calcProgress} />
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Button type="primary" icon={<SyncOutlined />} onClick={handleRefreshSync} loading={loading} disabled={payrollLocked}>刷新同步数据</Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>导出工资报表</Button>
          <Button icon={<DownloadOutlined />} onClick={handleExportPayslip}>导出工资条</Button>
          <Button type="primary" onClick={handleSaveResult} disabled={payrollLocked}>保存计算结果</Button>
          <Button type="primary" icon={<FileExcelOutlined />} onClick={() => setRawModalOpen(true)}>原始表格</Button>
          {isOperator && (
            <Button type="primary" icon={<SendOutlined />} disabled={!payrollGatePass || payrollSubmitted || payrollLocked} onClick={() => {
              if (!rosterLocked) { message.warning('请先完成花名册的审批'); return; }
              if (!attendanceLocked) { message.warning('请先完成考勤的审批'); return; }
              handleSubmit();
            }}>提交审批</Button>
          )}
          {isApprover && payrollSubmitted && (
            <>
              <Button type="primary" style={{ background: '#27ae60', borderColor: '#27ae60' }} icon={<CheckCircleOutlined />} onClick={handleApprove}>通过审批</Button>
              <Button danger icon={<RollbackOutlined />} onClick={handleReject}>退回修改</Button>
            </>
          )}
        </Space>
      </Card>

      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Select placeholder="发薪公司" allowClear showSearch optionFilterProp="label" value={fPayCompany} onChange={setFPayCompany} style={{ width: 150 }}
            options={Object.values(employees).map((e: any) => ({ value: e.pay_company, label: e.pay_company })).filter((v, i, a) => a.findIndex(x => x.value === v.value) === i)} />
          <Input placeholder="成本中心" value={fCostCenter} onChange={e => setFCostCenter(e.target.value)} style={{ width: 120 }} allowClear />
          <Input placeholder="部门" value={fDepartment} onChange={e => setFDepartment(e.target.value)} style={{ width: 120 }} allowClear />
          <Input prefix={<SearchOutlined />} placeholder="搜索姓名" value={keyword} onChange={e => setKeyword(e.target.value)} style={{ width: 140 }} allowClear />
        </Space>
      </Card>

      <div ref={scrollRef} onWheel={onWheel}>
        <Table columns={columns} dataSource={records} loading={loading} scroll={{ x: 2400, y: 480 }} size="small" pagination={{ defaultPageSize: 30, showSizeChanger: true, pageSizeOptions: [10, 20, 30, 50, 100], showTotal: t => `共 ${t} 条` }} />
      </div>

      {/* 审批弹窗 */}
      <Modal
        title={approveModal?.type === 'submit' ? '提交审批' : approveModal?.type === 'approve' ? '通过审批' : '退回修改'}
        open={!!approveModal}
        onOk={approveModal?.type === 'submit' ? confirmSubmit : approveModal?.type === 'approve' ? confirmApprove : confirmReject}
        onCancel={() => { setApproveModal(null); setRejectReason(''); }}
        okText="确认"
        cancelText="取消"
      >
        {approveModal?.type === 'submit' && <div>是否确认提交本月薪资数据给终审人审批？</div>}
        {approveModal?.type === 'approve' && <div>是否确认通过？确认后本月数据将冻结，仅可查看。</div>}
        {approveModal?.type === 'reject' && (
          <div>
            <div style={{ marginBottom: 8 }}>请填写退回理由：</div>
            <AntInput.TextArea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="退回理由将发送至人事专员" />
          </div>
        )}
      </Modal>

      {/* 薪资审批通过后：询问是否下载 summary PDF */}
      <Modal
        title="审批已通过"
        open={summaryModal}
        onOk={handleDownloadSummaryPdf}
        onCancel={() => setSummaryModal(false)}
        okText="下载 Summary PDF"
        cancelText="暂不下载"
      >
        <div>薪资审批已通过，当月数据已冻结。是否下载「数据统计 Summary」PDF（含按公司、按部门汇总）？</div>
      </Modal>

      {/* 工资条详情抽屉 */}
      <Drawer title="工资条详情" open={detailOpen} onClose={() => setDetailOpen(false)} width={620}>
        {detailRecord && (
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="姓名">{detailRecord.employee_name}</Descriptions.Item>
            <Descriptions.Item label="实收"><strong style={{ color: '#27ae60' }}>{fmtMoney(detailRecord.net_pay)}</strong></Descriptions.Item>
            <Descriptions.Item label="基本工资">{fmtMoney(detailRecord.basic_salary)}</Descriptions.Item>
            <Descriptions.Item label="补贴/补充公积金">{fmtMoney(detailRecord.allowance_supp)}</Descriptions.Item>
            <Descriptions.Item label="考勤调整合计">{fmtMoney(detailRecord.attendance_adjust_total)}</Descriptions.Item>
            <Descriptions.Item label="其他补贴/调整">{fmtMoney(detailRecord.other_adjust)}</Descriptions.Item>
            <Descriptions.Item label="商保金额">{fmtMoney(detailRecord.insurance_amount)}</Descriptions.Item>
            <Descriptions.Item label="KPI预提">{fmtMoney(detailRecord.kpi_provision)}</Descriptions.Item>
            <Descriptions.Item label="商办佣金">{fmtMoney(detailRecord.office_comm)}</Descriptions.Item>
            <Descriptions.Item label="绩效">{fmtMoney(detailRecord.performance_pay)}</Descriptions.Item>
            <Descriptions.Item label="公寓佣金">{fmtMoney(detailRecord.apartment_comm)}</Descriptions.Item>
            <Descriptions.Item label="人才系KPI">{fmtMoney(detailRecord.talent_kpi)}</Descriptions.Item>
            <Descriptions.Item label="防暑降温费">{fmtMoney(detailRecord.heat_allowance)}</Descriptions.Item>
            <Descriptions.Item label="津贴">{fmtMoney(detailRecord.other_allowance)}</Descriptions.Item>
            <Descriptions.Item label="保安奖金">{fmtMoney(detailRecord.security_bonus)}</Descriptions.Item>
            <Descriptions.Item label="保洁奖金">{fmtMoney(detailRecord.cleaning_bonus)}</Descriptions.Item>
            <Descriptions.Item label="服务费">{fmtMoney(detailRecord.service_fee)}</Descriptions.Item>
            <Descriptions.Item label="薪资小计"><strong>{fmtMoney(detailRecord.wage_subtotal)}</strong></Descriptions.Item>
            <Descriptions.Item label="个人养老">{fmtMoney(detailRecord.pension_p)}</Descriptions.Item>
            <Descriptions.Item label="个人医疗">{fmtMoney(detailRecord.medical_p)}</Descriptions.Item>
            <Descriptions.Item label="个人失业">{fmtMoney(detailRecord.unemployment_p)}</Descriptions.Item>
            <Descriptions.Item label="个人公积金">{fmtMoney(detailRecord.housing_fund_p)}</Descriptions.Item>
            <Descriptions.Item label="个人补充公积金">{fmtMoney(detailRecord.supp_housing_p)}</Descriptions.Item>
            <Descriptions.Item label="个人福利合计"><strong>{fmtMoney(detailRecord.personal_welfare_total)}</strong></Descriptions.Item>
            <Descriptions.Item label="当月个人所得税"><span style={{ color: '#e74c3c' }}>{fmtMoney(detailRecord.monthly_tax)}</span></Descriptions.Item>
            <Descriptions.Item label="商保调整"><span style={{ color: detailRecord.insurance_adjust < 0 ? '#e74c3c' : undefined }}>{fmtMoney(detailRecord.insurance_adjust)}</span></Descriptions.Item>
            <Descriptions.Item label="服务费调整"><span style={{ color: detailRecord.service_fee_adjust < 0 ? '#e74c3c' : undefined }}>{fmtMoney(detailRecord.service_fee_adjust)}</span></Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>

      {/* 原始表格弹窗 */}
      <RawExcelModal open={rawModalOpen} module="payroll" moduleLabel="薪资计算" onClose={() => setRawModalOpen(false)} />
    </div>
  );
};

export default PayrollPage;
