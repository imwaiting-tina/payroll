import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Space, message, Upload, Input, Select, Progress } from 'antd';
import { DownloadOutlined, UploadOutlined, SearchOutlined } from '@ant-design/icons';
import api from '../../api/client';
import { exportXlsx, importXlsx, type ExportDef } from '../../utils/importExport';
import { withSource } from '../../components/SourceTag';
import { isActiveInPeriod } from '../../utils/employee';

/**
 * 个税扣缴 — Tab 1：期初累计数（1-5月一次性录入）
 */

const EXPORT_DEF: ExportDef = {
  module: '个税期初累计数',
  columns: [
    { key: 'unique_hash', label: '唯一值', hidden: false },
    { key: 'employee_name', label: '姓名', required: true },
    { key: 'pay_company', label: '发薪公司', required: true },
    { key: 'cumul_income', label: '累计应税收入(1-5月)' },
    { key: 'cumul_five_insurance', label: '累计五险一金(1-5月)' },
    { key: 'cumul_special_deduction', label: '累计专项附加扣除(1-5月)' },
    { key: 'cumul_other_deduction', label: '累计其他扣除(1-5月)' },
    { key: 'cumul_tax_relief', label: '累计减免税额(1-5月)' },
    { key: 'cumul_tax_paid', label: '累计预扣缴个税(1-5月)' },
    { key: 'employed_months', label: '已任职月份数' },
  ],
};

const fmtMoney = (v: any) => {
  if (v === undefined || v === null || v === '' || Number(v) === 0) return '—';
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const TaxOpeningPage: React.FC = () => {
  const [records, setRecords] = useState<any[]>([]);
  const [allRecords, setAllRecords] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);

  // 导入进度
  const [importProgress, setImportProgress] = useState<{ done: number; total: number; importing: boolean }>({ done: 0, total: 0, importing: false });
  const [fKeyword, setFKeyword] = useState('');
  const [fPayCompany, setFPayCompany] = useState<string>();
  const [fDepartment, setFDepartment] = useState<string>();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [empRes, recRes] = await Promise.all([
        api.get('/employees?select=unique_hash,name,status,pay_company,cost_center,department,report_to,position,entry_date,attendance_type&period=eq.2026-06'),
        api.get('/tax_opening_balances?select=*'),
      ]);
      const empMap: Record<string, any> = {};
      empRes.data.forEach((e: any) => { empMap[e.unique_hash] = e; });

      const recMap: Record<string, any> = {};
      recRes.data.forEach((r: any) => { recMap[r.unique_hash] = r; });

      // 左连接：在职员工全列出
      const merged = empRes.data
        .filter((e: any) => isActiveInPeriod(e))
        .map((e: any) => {
          const r = recMap[e.unique_hash];
          return {
            ...(r || {}),
            key: r?.id ?? `emp-${e.unique_hash}`,
            unique_hash: e.unique_hash,
            employee_name: e.name,
            pay_company: e.pay_company || '',
            cost_center: e.cost_center || '',
            department: e.department || '',
            report_to: e.report_to || '',
            position: e.position || '',
            entry_date: e.entry_date || '',
            attendance_type: e.attendance_type || '',
          };
        });
      setEmployees(empMap);
      setAllRecords(merged);
      setRecords(merged);
    } catch { message.error('加载期初累计数失败'); }
    finally { setLoading(false); }
  };

  // 筛选
  const filteredRecords = allRecords.filter((r: any) => {
    if (fKeyword && !(r.employee_name || '').includes(fKeyword)) return false;
    if (fPayCompany && r.pay_company !== fPayCompany) return false;
    if (fDepartment && r.department !== fDepartment) return false;
    return true;
  });

  // 导出
  const handleExport = () => exportXlsx(EXPORT_DEF, records);

  // 导入
  const handleImport = async (file: File) => {
    try {
      const { data, import_errors } = await importXlsx(EXPORT_DEF, file);
      if (import_errors.length > 0) message.warning(`有 ${import_errors.length} 行数据存在问题`);
      if (data.length === 0) { message.info('未找到有效数据'); return; }

      let success = 0;
      const failures: string[] = [];
      setImportProgress({ done: 0, total: data.length, importing: true });
      for (const row of data) {
        try {
          if (!row.unique_hash) {
            failures.push(`${row.employee_name || '?'}：缺唯一值`);
            continue;
          }
          // 校验非负
          const numFields = ['cumul_income', 'cumul_five_insurance', 'cumul_special_deduction', 'cumul_other_deduction', 'cumul_tax_relief', 'cumul_tax_paid', 'employed_months'];
          for (const f of numFields) {
            if (Number(row[f]) < 0) {
              failures.push(`${row.employee_name}：${f} 不能为负`);
              continue;
            }
          }
          // 剔除展示字段
          const { employee_name, pay_company, ...dbRow } = row;
          const existing = await api.get(`/tax_opening_balances?unique_hash=eq.${row.unique_hash}`);
          if (existing.data.length > 0) {
            await api.patch(`/tax_opening_balances?id=eq.${existing.data[0].id}`, dbRow);
          } else {
            await api.post('/tax_opening_balances', dbRow);
          }
          success++;
        } catch {
          failures.push(`${row.employee_name || '?'}：导入失败`);
        }
        setImportProgress((p) => ({ ...p, done: p.done + 1 }));
      }
      if (failures.length > 0) {
        message.warning(`导入完成：成功 ${success} 条，失败 ${failures.length} 条。${failures.slice(0, 8).join('；')}`);
      } else {
        message.success(`导入完成：${success} / ${data.length} 条`);
      }
      loadData();
    } catch (e: any) {
      message.error(e.message || '导入失败');
    } finally {
      setImportProgress({ done: 0, total: 0, importing: false });
    }
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
    { title: withSource('累计应税收入', '导入'), dataIndex: 'cumul_income', key: 'ci', width: 120, render: fmtMoney },
    { title: withSource('累计五险一金', '导入'), dataIndex: 'cumul_five_insurance', key: 'cfi', width: 120, render: fmtMoney },
    { title: withSource('累计专项附加扣除', '导入'), dataIndex: 'cumul_special_deduction', key: 'csd', width: 140, render: fmtMoney },
    { title: withSource('累计其他扣除', '导入'), dataIndex: 'cumul_other_deduction', key: 'cod', width: 120, render: fmtMoney },
    { title: withSource('累计减免税额', '导入'), dataIndex: 'cumul_tax_relief', key: 'ctr', width: 120, render: fmtMoney },
    { title: withSource('累计预扣缴个税', '导入'), dataIndex: 'cumul_tax_paid', key: 'ctp', width: 130, render: fmtMoney },
    { title: withSource('已任职月份数', '导入'), dataIndex: 'employed_months', key: 'em', width: 110 },
  ];

  return (
    <Card size="small" title="期初累计数（2026年1-5月，一次性录入后锁定）">
      {importProgress.importing && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Progress percent={Math.round((importProgress.done / (importProgress.total || 1)) * 100)} status="active" />
          <div style={{ textAlign: 'center', color: '#888', marginTop: 4 }}>
            正在导入，已处理 {importProgress.done} / {importProgress.total} 条
          </div>
        </Card>
      )}
      <Space style={{ marginBottom: 12 }} wrap>
        <Input placeholder="搜索姓名" prefix={<SearchOutlined />} value={fKeyword} onChange={e => setFKeyword(e.target.value)} style={{ width: 140 }} allowClear />
        <Select placeholder="发薪公司" allowClear showSearch optionFilterProp="label" value={fPayCompany} onChange={setFPayCompany} style={{ width: 150 }}
          options={Object.values(employees).map((e: any) => ({ value: e.pay_company, label: e.pay_company })).filter((v, i, a) => a.findIndex(x => x.value === v.value) === i)} />
        <Select placeholder="部门" allowClear showSearch optionFilterProp="label" value={fDepartment} onChange={setFDepartment} style={{ width: 130 }}
          options={Object.values(employees).map((e: any) => ({ value: e.department, label: e.department })).filter((v, i, a) => v.value && a.findIndex(x => x.value === v.value) === i)} />
        <Button icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
        <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={(file) => { handleImport(file); return false; }}>
          <Button icon={<UploadOutlined />}>导入</Button>
        </Upload>
      </Space>
      <Table columns={columns} dataSource={filteredRecords} loading={loading} scroll={{ x: 1400, y: 480 }} size="small" pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: [10, 20, 30, 50, 100], showTotal: t => `共 ${t} 条` }} />
    </Card>
  );
};

export default TaxOpeningPage;
