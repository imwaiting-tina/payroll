import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Space, message, Upload, Input, Tag, Select, Progress } from 'antd';
import { DownloadOutlined, UploadOutlined, SearchOutlined } from '@ant-design/icons';
import api from '../../api/client';
import { exportXlsx, importXlsx, type ExportDef } from '../../utils/importExport';
import { withSource } from '../../components/SourceTag';
import { useStore } from '../../stores/appStore';
import { ensureRoster } from '../../utils/roster';
import { DataStatusTag, anyLocked } from '../../components/DataStatusTag';

/**
 * 个税扣缴 — Tab 2：专项附加扣除维护（报税系统导入，按月覆盖）
 */

const defaultPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

const EXPORT_DEF: ExportDef = {
  module: '专项附加扣除维护',
  columns: [
    { key: 'unique_hash', label: '唯一值', hidden: false },
    { key: 'employee_name', label: '姓名', required: true },
    { key: 'pay_company', label: '发薪公司', required: true },
    { key: 'id_type', label: '证件类型' },
    { key: 'id_number', label: '证件号码' },
    { key: 'cumul_child_edu', label: '累计子女教育' },
    { key: 'cumul_continuing_edu', label: '累计继续教育' },
    { key: 'cumul_mortgage', label: '累计住房贷款利息' },
    { key: 'cumul_rent', label: '累计住房租金' },
    { key: 'cumul_elder_care', label: '累计赡养老人' },
    { key: 'cumul_infant_care', label: '累计3岁以下婴幼儿照护' },
    { key: 'cumul_pension', label: '累计个人养老金' },
    { key: 'cumul_annuity', label: '企业(职业)年金' },
    { key: 'cumul_health_ins', label: '商业健康保险' },
    { key: 'cumul_tax_defer_ins', label: '税延养老保险' },
    { key: 'cumul_donation', label: '准予扣除的捐赠额' },
    { key: 'tax_relief', label: '减免税额' },
  ],
};

const fmtMoney = (v: any) => {
  if (v === undefined || v === null || v === '' || Number(v) === 0) return '—';
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const TaxSpecialDeductionsPage: React.FC = () => {
  const [records, setRecords] = useState<any[]>([]);
  const [allRecords, setAllRecords] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Record<string, any>>({});
  const period = useStore(s => s.currentPeriod);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  // 导入进度
  const [importProgress, setImportProgress] = useState<{ done: number; total: number; importing: boolean }>({ done: 0, total: 0, importing: false });
  const [fKeyword, setFKeyword] = useState('');
  const [fPayCompany, setFPayCompany] = useState<string>();
  const [fDepartment, setFDepartment] = useState<string>();

  useEffect(() => { loadData(); }, [period]);

  const loadData = async () => {
    setLoading(true);
    try {
      await ensureRoster(period);
      const [empRes, recRes] = await Promise.all([
        api.get(`/employees?select=unique_hash,name,pay_company,department&period=eq.${period}`),
        api.get(`/tax_special_deductions?select=*&period=eq.${period}`),
      ]);
      const empMap: Record<string, any> = {};
      empRes.data.forEach((e: any) => { empMap[e.unique_hash] = e; });
      setEmployees(empMap);

      const recMap: Record<string, any> = {};
      recRes.data.forEach((r: any) => { recMap[r.unique_hash] = r; });

      const merged = empRes.data.map((e: any) => {
        const r = recMap[e.unique_hash];
        const cumulSpecial = (r?.cumul_child_edu || 0) + (r?.cumul_continuing_edu || 0) + (r?.cumul_mortgage || 0) + (r?.cumul_rent || 0) + (r?.cumul_elder_care || 0) + (r?.cumul_infant_care || 0);
        return {
          ...(r || {}),
          key: r?.id ?? `emp-${e.unique_hash}`,
          unique_hash: e.unique_hash,
          employee_name: e.name,
          pay_company: e.pay_company || '',
          department: e.department || '',
          special_total: cumulSpecial,
        };
      });
      setAllRecords(merged);
      setRecords(merged);
      setLocked(anyLocked(recRes.data));
    } catch { message.error('加载专项附加扣除失败'); }
    finally { setLoading(false); }
  };

  const filteredRecords = allRecords.filter((r: any) => {
    if (fKeyword && !(r.employee_name || '').includes(fKeyword)) return false;
    if (fPayCompany && r.pay_company !== fPayCompany) return false;
    if (fDepartment && r.department !== fDepartment) return false;
    return true;
  });

  const handleExport = () => exportXlsx(EXPORT_DEF, records, period);

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
          // 校验住房贷款利息与住房租金不能同时非零
          if ((Number(row.cumul_mortgage) || 0) > 0 && (Number(row.cumul_rent) || 0) > 0) {
            failures.push(`${row.employee_name}：住房贷款利息和住房租金不能同时享受`);
            continue;
          }
          const { employee_name, pay_company, ...dbRow } = row;
          const existing = await api.get(`/tax_special_deductions?unique_hash=eq.${row.unique_hash}&period=eq.${period}`);
          if (existing.data.length > 0) {
            await api.patch(`/tax_special_deductions?id=eq.${existing.data[0].id}`, { ...dbRow, period });
          } else {
            await api.post('/tax_special_deductions', { ...dbRow, period });
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
    { title: withSource('发薪公司', '花名册同步'), dataIndex: 'pay_company', key: 'co', width: 140, ellipsis: true, fixed: 'left' },
    { title: withSource('证件类型', '导入'), dataIndex: 'id_type', key: 'it', width: 90 },
    { title: withSource('证件号码', '导入'), dataIndex: 'id_number', key: 'in', width: 170, ellipsis: true },
    { title: withSource('累计子女教育', '导入'), dataIndex: 'cumul_child_edu', key: 'cce', width: 120, render: fmtMoney },
    { title: withSource('累计继续教育', '导入'), dataIndex: 'cumul_continuing_edu', key: 'cde', width: 120, render: fmtMoney },
    { title: withSource('累计住房贷款', '导入'), dataIndex: 'cumul_mortgage', key: 'cm', width: 120, render: fmtMoney },
    { title: withSource('累计住房租金', '导入'), dataIndex: 'cumul_rent', key: 'cr', width: 120, render: fmtMoney },
    { title: withSource('累计赡养老人', '导入'), dataIndex: 'cumul_elder_care', key: 'cec', width: 120, render: fmtMoney },
    { title: withSource('累计婴幼儿照护', '导入'), dataIndex: 'cumul_infant_care', key: 'cic', width: 130, render: fmtMoney },
    { title: withSource('专项附加合计', '系统计算'), dataIndex: 'special_total', key: 'st', width: 120, render: (v: any) => <strong>{fmtMoney(v)}</strong> },
    { title: withSource('累计个人养老金', '导入'), dataIndex: 'cumul_pension', key: 'cp', width: 120, render: fmtMoney },
    { title: withSource('企业年金', '导入'), dataIndex: 'cumul_annuity', key: 'ca', width: 110, render: fmtMoney },
    { title: withSource('商业健康保险', '导入'), dataIndex: 'cumul_health_ins', key: 'chi', width: 110, render: fmtMoney },
    { title: withSource('税延养老保险', '导入'), dataIndex: 'cumul_tax_defer_ins', key: 'ctdi', width: 110, render: fmtMoney },
    { title: withSource('准予扣除的捐赠额', '导入'), dataIndex: 'cumul_donation', key: 'cd', width: 130, render: fmtMoney },
    { title: withSource('减免税额', '导入'), dataIndex: 'tax_relief', key: 'tr', width: 100, render: fmtMoney },
    { title: withSource('数据状态', '系统计算'), dataIndex: 'data_status', key: 'ds', width: 110, render: (v: string) => <DataStatusTag status={v} /> },
  ];

  return (
    <Card size="small" title="专项附加扣除维护（报税系统数据，按月导入覆盖）">
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
        <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={(file) => {
          if (locked) { message.warning('该月已冻结，不能导入'); return false; }
          handleImport(file); return false;
        }}>
          <Button icon={<UploadOutlined />} disabled={locked}>导入</Button>
        </Upload>
      </Space>
      <Table columns={columns} dataSource={filteredRecords} loading={loading} scroll={{ x: 1800, y: 480 }} size="small" pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: [10, 20, 30, 50, 100], showTotal: t => `共 ${t} 条` }} />
    </Card>
  );
};

export default TaxSpecialDeductionsPage;
