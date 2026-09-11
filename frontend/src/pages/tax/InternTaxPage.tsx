import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Space, message, Input, Tag, Select } from 'antd';
import { CalculatorOutlined, LinkOutlined, DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import api from '../../api/client';
import { calcInternTax } from '../../utils/taxCalc';
import { exportXlsx, type ExportDef } from '../../utils/importExport';
import { withSource } from '../../components/SourceTag';
import { isActiveInPeriod } from '../../utils/employee';
import { round2 } from '../../utils/round';
import { useStore } from '../../stores/appStore';
import { ensureRoster } from '../../utils/roster';
import CalcProgress from '../../components/CalcProgress';

/**
 * 个税扣缴 — 实习生个税计算（计税方式为"实习生计税"的人员）
 * 本期应预扣预缴税额 =（累计收入额 − 累计减除费用）× 预扣率 − 速算扣除数 − 累计减免税额 − 累计已预扣预缴税额
 */

const defaultPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

const fmtMoney = (v: any) => {
  if (v === undefined || v === null || v === '' || Number(v) === 0) return '—';
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** 按入职日期计算到指定月份的任职月数（含当月）。入职早于当年1月则从1月起算。 */
function calcMonthsWorked(entryDate: string | undefined, period: string): number {
  if (!entryDate) return 1;
  const entryYear = parseInt(entryDate.slice(0, 4));
  const entryMonth = parseInt(entryDate.slice(5, 7));
  const [pYear, pMonth] = period.split('-').map(Number);
  // 任职起始月：入职早于当年 → 从当年1月起算；否则从入职月起算
  const startYear = entryYear < pYear ? pYear : entryYear;
  const startMonth = entryYear < pYear ? 1 : entryMonth;
  return (pYear - startYear) * 12 + (pMonth - startMonth) + 1;
}

// 导出表头（只导出）
const EXPORT_DEF: ExportDef = {
  module: '实习生个税计算',
  columns: [
    { key: 'unique_hash', label: '唯一值', hidden: false },
    { key: 'employee_name', label: '姓名' },
    { key: 'pay_company', label: '发薪公司' },
    { key: 'department', label: '部门' },
    { key: 'current_taxable_income', label: '本期收入额' },
    { key: 'cumul_taxable_income', label: '累计收入额' },
    { key: 'cumul_basic_deduction', label: '累计减除费用' },
    { key: 'cumul_taxable_income_net', label: '累计应纳税所得额' },
    { key: 'tax_rate', label: '预扣率' },
    { key: 'quick_deduction', label: '速算扣除数' },
    { key: 'cumul_tax_relief', label: '累计减免税额' },
    { key: 'cumul_tax_paid', label: '累计已预扣预缴税额' },
    { key: 'monthly_tax', label: '本期应预扣预缴税额' },
  ],
};

const InternTaxPage: React.FC = () => {
  const [records, setRecords] = useState<any[]>([]);
  const [allRecords, setAllRecords] = useState<any[]>([]);
  const period = useStore(s => s.currentPeriod);
  const [loading, setLoading] = useState(false);
  // 计算进度
  const [calcProgress, setCalcProgress] = useState<{ done: number; total: number; active: boolean; label: string }>({ done: 0, total: 0, active: false, label: '' });
  const [fKeyword, setFKeyword] = useState('');
  const [fPayCompany, setFPayCompany] = useState<string>();
  const [fDepartment, setFDepartment] = useState<string>();

  useEffect(() => { loadData(); }, [period]);

  function prevPeriod(p: string): string {
    const [y, m] = p.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  }

  const loadData = async () => {
    setLoading(true);
    try {
      await ensureRoster(period);
      const [empRes, openingRes, prevCalcRes, calcRes, salaryRes] = await Promise.all([
        api.get(`/employees?select=unique_hash,name,status,pay_company,department,entry_date,leave_date&tax_method=eq.intern&period=eq.${period}`),
        api.get('/tax_opening_balances?select=*'),
        api.get(`/tax_monthly_calcs?select=*&period=eq.${prevPeriod(period)}`),
        api.get(`/tax_monthly_calcs?select=*&period=eq.${period}`),
        api.get(`/salary_records?select=unique_hash,wage_subtotal&period=eq.${period}`),
      ]);

      const empList: any[] = empRes.data;
      const openingMap: Record<string, any> = {};
      openingRes.data.forEach((r: any) => { openingMap[r.unique_hash] = r; });
      const prevMap: Record<string, any> = {};
      prevCalcRes.data.forEach((r: any) => { prevMap[r.unique_hash] = r; });
      const calcMap: Record<string, any> = {};
      calcRes.data.forEach((r: any) => { calcMap[r.unique_hash] = r; });
      const salaryMap: Record<string, any> = {};
      salaryRes.data.forEach((r: any) => { salaryMap[r.unique_hash] = r; });

      const merged = empList
        .filter((e: any) => isActiveInPeriod(e, period))
        .map((e: any) => {
          const opening = openingMap[e.unique_hash] || {};
          const prev = prevMap[e.unique_hash] || {};
          const calc = calcMap[e.unique_hash] || {};
          const currentIncome = Number(salaryMap[e.unique_hash]?.wage_subtotal || 0);

          // 实习生个税（实习劳务报酬，一般累计预扣法）
          // 累计收入额 = 实习以来劳务报酬总和 × (1 − 20%)
          //   - 首次月：期初累计(税前) + 本月(税前)，再整体 × 0.8
          //   - 非首次月：上月累计收入额(已税后) + 本月(税前) × 0.8
          const isFirstMonth = period === '2026-06';
          const cumulIncome = isFirstMonth
            ? round2((Number(opening.cumul_income || 0) + currentIncome) * (1 - 0.20))
            : round2(Number(prev.cumul_taxable_income || 0) + currentIncome * (1 - 0.20));
          // 累计减除费用 = 5000 × 从开始实习起到本月的月数（按入职日期计算）
          const monthsWorked = calcMonthsWorked(e.entry_date, period);
          const cumulBasicDeduction = 5000 * monthsWorked;
          // 累计减免税额
          const cumulTaxRelief = isFirstMonth
            ? Number(opening.cumul_tax_relief || 0)
            : Number(prev.cumul_tax_relief || 0);
          // 累计已预扣
          const cumulTaxPaid = isFirstMonth
            ? Number(opening.cumul_tax_paid || 0)
            : Number(prev.cumul_tax_paid || 0) + Number(prev.monthly_tax || 0);

          const result = calcInternTax({
            cumul_income: cumulIncome,
            cumul_basic_deduction: cumulBasicDeduction,
            cumul_tax_relief: cumulTaxRelief,
            cumul_tax_paid: cumulTaxPaid,
          });

          return {
            key: calc.id ?? `emp-${e.unique_hash}`,
            unique_hash: e.unique_hash,
            employee_name: e.name,
            pay_company: e.pay_company || '',
            department: e.department || '',
            current_taxable_income: currentIncome,
            ...calc,
            cumul_taxable_income: cumulIncome,
            cumul_basic_deduction: cumulBasicDeduction,
            cumul_taxable_income_net: result.cumul_taxable_income_net,
            tax_rate: result.tax_rate,
            quick_deduction: result.quick_deduction,
            cumul_tax_relief: cumulTaxRelief,
            cumul_tax_paid: cumulTaxPaid,
            monthly_tax: result.monthly_tax,
            // 内部保留计算输入
            _cumul_income: cumulIncome,
            _cumul_basic_deduction: cumulBasicDeduction,
            _cumul_tax_relief: cumulTaxRelief,
            _cumul_tax_paid: cumulTaxPaid,
            _opening: opening,
            _prev: prev,
          };
        });

      setAllRecords(merged);
      setRecords(merged);
    } catch { message.error('加载实习生个税数据失败'); }
    finally { setLoading(false); }
  };

  const filteredRecords = allRecords.filter((r: any) => {
    if (fKeyword && !(r.employee_name || '').includes(fKeyword)) return false;
    if (fPayCompany && r.pay_company !== fPayCompany) return false;
    if (fDepartment && r.department !== fDepartment) return false;
    return true;
  });

  // 执行当月计算
  const handleCalc = async () => {
    let success = 0;
    setCalcProgress({ done: 0, total: records.length, active: true, label: '正在计算实习生个税' });
    for (const r of records) {
      try {
        const result = calcInternTax({
          cumul_income: r._cumul_income,
          cumul_basic_deduction: r._cumul_basic_deduction,
          cumul_tax_relief: r._cumul_tax_relief,
          cumul_tax_paid: r._cumul_tax_paid,
        });
        const payload = {
          unique_hash: r.unique_hash,
          period,
          current_taxable_income: r.current_taxable_income,
          cumul_taxable_income: r._cumul_income,
          cumul_basic_deduction: r._cumul_basic_deduction,
          cumul_taxable_income_net: result.cumul_taxable_income_net,
          tax_rate: result.tax_rate,
          quick_deduction: result.quick_deduction,
          cumul_tax_relief: r._cumul_tax_relief,
          cumul_tax_paid: r._cumul_tax_paid,
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

  // 联动薪酬板块
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
    { title: withSource('部门', '花名册同步'), dataIndex: 'department', key: 'dept', width: 100 },
    { title: withSource('本期收入额', '系统计算'), dataIndex: 'current_taxable_income', key: 'cti', width: 110, render: fmtMoney },
    { title: withSource('累计收入额', '系统计算'), dataIndex: 'cumul_taxable_income', key: 'ci', width: 110, render: fmtMoney },
    { title: withSource('累计减除费用', '系统计算'), dataIndex: 'cumul_basic_deduction', key: 'cbd', width: 120, render: fmtMoney },
    { title: withSource('累计应纳税所得额', '系统计算'), dataIndex: 'cumul_taxable_income_net', key: 'ctin', width: 140, render: fmtMoney },
    { title: withSource('预扣率', '系统计算'), dataIndex: 'tax_rate', key: 'tr', width: 80, render: (v: any) => v ? `${(v * 100).toFixed(0)}%` : '—' },
    { title: withSource('速算扣除数', '系统计算'), dataIndex: 'quick_deduction', key: 'qd', width: 100, render: fmtMoney },
    { title: withSource('累计减免税额', '系统计算'), dataIndex: 'cumul_tax_relief', key: 'ctr', width: 120, render: fmtMoney },
    { title: withSource('累计已预扣预缴税额', '系统计算'), dataIndex: 'cumul_tax_paid', key: 'ctp', width: 140, render: fmtMoney },
    { title: withSource('本期应预扣预缴税额', '系统计算'), dataIndex: 'monthly_tax', key: 'mt', width: 150, fixed: 'right',
      render: (v: any) => <strong style={{ color: '#e74c3c' }}>{fmtMoney(v)}</strong> },
  ];

  return (
    <Card size="small" title="实习生个税计算（实习劳务报酬，一般累计预扣法）">
      <CalcProgress {...calcProgress} />
      <Space style={{ marginBottom: 12 }} wrap>
        <Input placeholder="搜索姓名" prefix={<SearchOutlined />} value={fKeyword} onChange={e => setFKeyword(e.target.value)} style={{ width: 140 }} allowClear />
        <Select placeholder="发薪公司" allowClear showSearch optionFilterProp="label" value={fPayCompany} onChange={setFPayCompany} style={{ width: 150 }}
          options={allRecords.map((e: any) => ({ value: e.pay_company, label: e.pay_company })).filter((v, i, a) => a.findIndex(x => x.value === v.value) === i)} />
        <Select placeholder="部门" allowClear showSearch optionFilterProp="label" value={fDepartment} onChange={setFDepartment} style={{ width: 130 }}
          options={allRecords.map((e: any) => ({ value: e.department, label: e.department })).filter((v, i, a) => v.value && a.findIndex(x => x.value === v.value) === i)} />
        <Button type="primary" icon={<CalculatorOutlined />} onClick={handleCalc}>计算实习生个税</Button>
        <Button icon={<LinkOutlined />} onClick={handleSync}>同步到薪酬板块</Button>
        <Button icon={<DownloadOutlined />} onClick={() => exportXlsx(EXPORT_DEF, filteredRecords, period)}>导出</Button>
      </Space>
      <div style={{ marginBottom: 12, color: '#888' }}>
        计算口径：本期应预扣预缴税额 =（累计收入额 − 累计减除费用）× 预扣率 − 速算扣除数 − 累计减免税额 − 累计已预扣预缴税额。
      </div>
      <Table columns={columns} dataSource={filteredRecords} loading={loading} scroll={{ x: 1800, y: 480 }} size="small" pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: [10, 20, 30, 50, 100], showTotal: t => `共 ${t} 条` }} />
    </Card>
  );
};

export default InternTaxPage;
