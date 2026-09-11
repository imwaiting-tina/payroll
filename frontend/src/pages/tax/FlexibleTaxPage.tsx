import React, { useEffect, useState } from 'react';
import { Table, Card, Space, Input, message, Button, Tag, Select } from 'antd';
import { CalculatorOutlined, DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import api from '../../api/client';
import { exportXlsx, type ExportDef } from '../../utils/importExport';
import { withSource } from '../../components/SourceTag';
import { isActiveInPeriod } from '../../utils/employee';
import { round2 } from '../../utils/round';
import { useStore } from '../../stores/appStore';
import { ensureRoster } from '../../utils/roster';
import CalcProgress from '../../components/CalcProgress';

/**
 * 个税扣缴 — 灵工个税计算（计税方式为"灵工计税"的人员）
 * 特殊应用「基本工资 + 考勤调整合计」而非薪资小计。
 * 个税 =（基本工资 + 考勤调整合计 − 6250）× 2.4%
 */

const defaultPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

const fmtMoney = (v: any) => {
  if (v === undefined || v === null || v === '' || Number(v) === 0) return '—';
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// 导出表头（只导出）
const EXPORT_DEF: ExportDef = {
  module: '灵工个税计算',
  columns: [
    { key: 'unique_hash', label: '唯一值', hidden: false },
    { key: 'employee_name', label: '姓名' },
    { key: 'pay_company', label: '发薪公司' },
    { key: 'department', label: '部门' },
    { key: 'tax_method', label: '计税方式' },
    { key: 'basic_salary', label: '基本工资' },
    { key: 'attendance_adjust_total', label: '考勤调整合计' },
    { key: 'monthly_tax', label: '当月个人所得税' },
  ],
};

const FlexibleTaxPage: React.FC = () => {
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

  const loadData = async () => {
    setLoading(true);
    try {
      await ensureRoster(period);
      // 只取计税方式为"灵工计税"(flexible)的人员
      const [empRes, attRes, salaryRes] = await Promise.all([
        api.get(`/employees?select=unique_hash,name,status,pay_company,department,tax_method,basic_salary,leave_date&tax_method=eq.flexible&period=eq.${period}`),
        api.get(`/attendance_records?select=unique_hash,attendance_adjust_total&period=eq.${period}`),
        api.get(`/salary_records?select=unique_hash,monthly_tax&period=eq.${period}`),
      ]);

      const attMap: Record<string, any> = {};
      attRes.data.forEach((r: any) => { attMap[r.unique_hash] = r; });
      const salaryMap: Record<string, any> = {};
      salaryRes.data.forEach((r: any) => { salaryMap[r.unique_hash] = r; });

      const merged = empRes.data
        .filter((e: any) => isActiveInPeriod(e, period))
        .map((e: any) => {
          const att = attMap[e.unique_hash] || {};
          const basicSalary = Number(e.basic_salary || 0);
          const attendanceAdjustTotal = Number(att.attendance_adjust_total || 0);
          // 灵工个税 =（基本工资 + 考勤调整合计 − 6250）× 2.4%，最低 0
          const monthlyTax = round2(Math.max(0, (basicSalary + attendanceAdjustTotal - 6250) * 0.024));
          const sal = salaryMap[e.unique_hash] || {};
          return {
            key: `emp-${e.unique_hash}`,
            unique_hash: e.unique_hash,
            employee_name: e.name,
            pay_company: e.pay_company || '',
            department: e.department || '',
            tax_method: e.tax_method || 'flexible',
            basic_salary: basicSalary,
            attendance_adjust_total: attendanceAdjustTotal,
            monthly_tax: sal.monthly_tax !== undefined && sal.monthly_tax !== null ? Number(sal.monthly_tax) : monthlyTax,
          };
        });

      setAllRecords(merged);
      setRecords(merged);
    } catch { message.error('加载灵工个税数据失败'); }
    finally { setLoading(false); }
  };

  const filteredRecords = allRecords.filter((r: any) => {
    if (fKeyword && !(r.employee_name || '').includes(fKeyword)) return false;
    if (fPayCompany && r.pay_company !== fPayCompany) return false;
    if (fDepartment && r.department !== fDepartment) return false;
    return true;
  });

  // 计算并保存灵工个税
  const handleCalc = async () => {
    let success = 0;
    setCalcProgress({ done: 0, total: records.length, active: true, label: '正在计算灵工个税' });
    for (const r of records) {
      try {
        const basicSalary = Number(r.basic_salary || 0);
        const attendanceAdjustTotal = Number(r.attendance_adjust_total || 0);
        const monthlyTax = round2(Math.max(0, (basicSalary + attendanceAdjustTotal - 6250) * 0.024));
        const existing = await api.get(`/salary_records?unique_hash=eq.${r.unique_hash}&period=eq.${period}`);
        if (existing.data.length > 0) {
          await api.patch(`/salary_records?id=eq.${existing.data[0].id}`, { monthly_tax: monthlyTax });
        } else {
          await api.post('/salary_records', {
            unique_hash: r.unique_hash,
            period,
            month_number: parseInt(period.split('-')[1]) || 1,
            monthly_tax: monthlyTax,
          });
        }
        success++;
      } catch { /* skip */ }
      setCalcProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    message.success(`灵工个税计算完成：${success} / ${records.length} 条`);
    setCalcProgress({ done: 0, total: 0, active: false, label: '' });
    loadData();
  };

  const columns: any[] = [
    { title: withSource('姓名', '花名册同步'), dataIndex: 'employee_name', key: 'name', width: 90, fixed: 'left' },
    { title: withSource('发薪公司', '花名册同步'), dataIndex: 'pay_company', key: 'co', width: 140, ellipsis: true, fixed: 'left' },
    { title: withSource('部门', '花名册同步'), dataIndex: 'department', key: 'dept', width: 100 },
    { title: withSource('计税方式', '花名册同步'), dataIndex: 'tax_method', key: 'tm', width: 90,
      render: (v: string) => <Tag color="cyan">{v === 'flexible' ? '灵工计税' : v}</Tag> },
    { title: withSource('基本工资', '花名册同步'), dataIndex: 'basic_salary', key: 'bs', width: 110, render: fmtMoney },
    { title: withSource('考勤调整合计', '考勤同步'), dataIndex: 'attendance_adjust_total', key: 'aat', width: 130, render: fmtMoney },
    { title: withSource('当月个人所得税', '系统计算'), dataIndex: 'monthly_tax', key: 'mt', width: 130,
      render: (v: any) => <strong style={{ color: '#e74c3c' }}>{fmtMoney(v)}</strong> },
  ];

  return (
    <Card size="small" title="灵工个税计算（计税方式为灵工计税的人员）">
      <CalcProgress {...calcProgress} />
      <Space style={{ marginBottom: 12 }} wrap>
        <Input placeholder="搜索姓名" prefix={<SearchOutlined />} value={fKeyword} onChange={e => setFKeyword(e.target.value)} style={{ width: 140 }} allowClear />
        <Select placeholder="发薪公司" allowClear showSearch optionFilterProp="label" value={fPayCompany} onChange={setFPayCompany} style={{ width: 150 }}
          options={allRecords.map((e: any) => ({ value: e.pay_company, label: e.pay_company })).filter((v, i, a) => a.findIndex(x => x.value === v.value) === i)} />
        <Select placeholder="部门" allowClear showSearch optionFilterProp="label" value={fDepartment} onChange={setFDepartment} style={{ width: 130 }}
          options={allRecords.map((e: any) => ({ value: e.department, label: e.department })).filter((v, i, a) => v.value && a.findIndex(x => x.value === v.value) === i)} />
        <Button type="primary" icon={<CalculatorOutlined />} onClick={handleCalc}>计算灵工个税</Button>
        <Button icon={<DownloadOutlined />} onClick={() => exportXlsx(EXPORT_DEF, filteredRecords, period)}>导出</Button>
      </Space>
      <div style={{ marginBottom: 12, color: '#888' }}>
        计算口径：当月个人所得税 =（基本工资 + 考勤调整合计 − 6250）× 2.4%，不足 6250 时为 0。
      </div>
      <Table columns={columns} dataSource={filteredRecords} loading={loading} scroll={{ x: 800, y: 480 }} size="small" pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: [10, 20, 30, 50, 100], showTotal: t => `共 ${t} 条` }} />
    </Card>
  );
};

export default FlexibleTaxPage;
