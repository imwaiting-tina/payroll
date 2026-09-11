import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Space, Input, Select, message, Upload, Typography, Progress } from 'antd';
import { DownloadOutlined, UploadOutlined, SearchOutlined } from '@ant-design/icons';
import api from '../api/client';
import { exportXlsx, importXlsx, type ExportDef } from '../utils/importExport';
import { withSource } from '../components/SourceTag';
import { useHorizontalScroll } from '../utils/useHorizontalScroll';
import { isActiveInPeriod } from '../utils/employee';
import { round2 } from '../utils/round';
import { useStore } from '../stores/appStore';
import { ensureRoster } from '../utils/roster';
import { DataStatusTag, anyLocked } from '../components/DataStatusTag';

/**
 * 附加薪酬板块
 * 12项收入（不含基本工资），导入导出，附加薪酬合计 = 12项之和
 */

const defaultPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

const fmtMoney = (v: any) => {
  if (v === undefined || v === null || v === '' || Number(v) === 0) return '—';
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// 导出表头（全字段）
const EXPORT_DEF: ExportDef = {
  module: '附加薪酬',
  columns: [
    { key: 'unique_hash', label: '唯一值', hidden: false },
    { key: 'employee_name', label: '姓名', required: true },
    { key: 'pay_company', label: '发薪公司', required: true },
    { key: 'cost_center', label: '成本中心' },
    { key: 'department', label: '部门' },
    { key: 'report_to', label: '汇报人' },
    { key: 'position', label: '职位' },
    { key: 'entry_date', label: '入职日期' },
    { key: 'attendance_type', label: '考勤制' },
    { key: 'allowance_supp', label: '补贴/补公积金' },
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
  ],
};

// 附加薪酬字段注释（展示在分页器下方）
const FIELD_NOTES: [string, string][] = [
  ['补贴/补公积金', '2015年10月前入职可享'],
  ['其他补贴/调整', '自用保安加班费及岗位津贴'],
  ['商保金额', '员工福利保险费用'],
  ['KPI预提', '人才系专享'],
  ['商办佣金', '商业办公渠道佣金'],
  ['绩效', '绩效考核奖金'],
  ['公寓佣金', '公寓渠道销售佣金'],
  ['人才系KPI', '人才系专项考核指标-每年2、5、8、11月'],
  ['防暑降温费', '每年6-9月发放，户外岗位专享'],
  ['津贴', '芦智蔚、王倩、物业部值班津贴'],
  ['保安奖金', '保安月度绩效奖金'],
  ['保洁奖金', '保洁月度绩效奖金'],
  ['服务费', '老龙馄饨发薪平台服务费用'],
];

const AdditionalSalaryPage: React.FC = () => {
  const { ref: scrollRef, onWheel } = useHorizontalScroll<HTMLDivElement>();
  const [records, setRecords] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Record<string, any>>({});
  const period = useStore(s => s.currentPeriod);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  // 导入进度
  const [importProgress, setImportProgress] = useState<{ done: number; total: number; importing: boolean }>({ done: 0, total: 0, importing: false });

  // 筛选
  const [fPayCompany, setFPayCompany] = useState<string>();
  const [fCostCenter, setFCostCenter] = useState<string>();
  const [fDepartment, setFDepartment] = useState<string>();
  const [fDataStatus, setFDataStatus] = useState<string>();
  const [keyword, setKeyword] = useState('');

  useEffect(() => { loadData(); }, [period, fPayCompany, fCostCenter, fDepartment, fDataStatus, keyword]);

  const loadData = async () => {
    setLoading(true);
    try {
      await ensureRoster(period);
      const [empRes, recRes] = await Promise.all([
        api.get(`/employees?select=unique_hash,name,status,pay_company,cost_center,department,report_to,position,entry_date,leave_date,attendance_type&period=eq.${period}`),
        api.get(`/additional_salary_records?select=*&period=eq.${period}`),
      ]);
      const empList: any[] = empRes.data;
      const empMap: Record<string, any> = {};
      empList.forEach((e: any) => { empMap[e.unique_hash] = e; });
      setEmployees(empMap);

      const recMap: Record<string, any> = {};
      recRes.data.forEach((r: any) => { recMap[r.unique_hash] = r; });
      // 该月是否冻结（提前算，用于给每行设数据状态）
      const monthLocked = anyLocked(recRes.data);

      let merged = empList
        .filter((e: any) => isActiveInPeriod(e, period))
        .map((e: any) => {
          const r = recMap[e.unique_hash];
          // 附加薪酬合计 = 13项之和（含服务费）
          const additionalTotal = round2(
            (r?.allowance_supp || 0) + (r?.other_adjust || 0) + (r?.insurance_amount || 0) +
            (r?.kpi_provision || 0) + (r?.office_comm || 0) + (r?.performance_pay || 0) +
            (r?.apartment_comm || 0) + (r?.talent_kpi || 0) + (r?.heat_allowance || 0) +
            (r?.other_allowance || 0) + (r?.security_bonus || 0) + (r?.cleaning_bonus || 0) +
            (r?.service_fee || 0)
          );
          // 绩效&佣金合计 = 商办佣金 + 绩效 + 公寓佣金 + 人才系KPI + 防暑降温费 + 津贴 + 保安奖金 + 保洁奖金
          const perfCommTotal = round2(
            (r?.office_comm || 0) + (r?.performance_pay || 0) + (r?.apartment_comm || 0) +
            (r?.talent_kpi || 0) + (r?.heat_allowance || 0) + (r?.other_allowance || 0) +
            (r?.security_bonus || 0) + (r?.cleaning_bonus || 0)
          );
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
            additional_total: additionalTotal,
            perf_comm_total: perfCommTotal,
            // 数据状态：冻结=已锁定，有记录=正常，无=未录入
            data_status: monthLocked ? '已锁定' : (r ? '正常' : '未录入'),
          };
        });

      // 前端筛选
      if (fPayCompany) merged = merged.filter((r: any) => r.pay_company === fPayCompany);
      if (fCostCenter) merged = merged.filter((r: any) => (r.cost_center || '').includes(fCostCenter));
      if (fDepartment) merged = merged.filter((r: any) => (r.department || '').includes(fDepartment));
      if (fDataStatus) merged = merged.filter((r: any) => r.data_status === fDataStatus);
      if (keyword) merged = merged.filter((r: any) => (r.employee_name || '').includes(keyword));

      setRecords(merged);
      setLocked(monthLocked);
    } catch { message.error('加载附加薪酬数据失败'); }
    finally { setLoading(false); }
  };

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
          const { employee_name, pay_company, cost_center, department, report_to, position, entry_date, attendance_type, ...dbRow } = row;
          const existing = await api.get(`/additional_salary_records?unique_hash=eq.${row.unique_hash}&period=eq.${period}`);
          if (existing.data.length > 0) {
            await api.patch(`/additional_salary_records?id=eq.${existing.data[0].id}`, { ...dbRow, period });
          } else {
            await api.post('/additional_salary_records', { ...dbRow, period });
          }
          success++;
        } catch {
          failures.push(`${row.employee_name || '?'}：导入失败`);
        }
        // 更新导入进度
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
    { title: withSource('补贴/补公积金', '导入'), dataIndex: 'allowance_supp', key: 'as', width: 110, render: fmtMoney },
    { title: withSource('其他补贴/调整', '导入'), dataIndex: 'other_adjust', key: 'oa', width: 110, render: fmtMoney },
    { title: withSource('商保金额', '导入'), dataIndex: 'insurance_amount', key: 'ia', width: 90, render: fmtMoney },
    { title: withSource('KPI预提', '导入'), dataIndex: 'kpi_provision', key: 'kp', width: 90, render: fmtMoney },
    { title: withSource('商办佣金', '导入'), dataIndex: 'office_comm', key: 'oc', width: 90, render: fmtMoney },
    { title: withSource('绩效', '导入'), dataIndex: 'performance_pay', key: 'pp', width: 90, render: fmtMoney },
    { title: withSource('公寓佣金', '导入'), dataIndex: 'apartment_comm', key: 'ac', width: 90, render: fmtMoney },
    { title: withSource('人才系KPI', '导入'), dataIndex: 'talent_kpi', key: 'tk', width: 90, render: fmtMoney },
    { title: withSource('防暑降温费', '导入'), dataIndex: 'heat_allowance', key: 'ha', width: 100, render: fmtMoney },
    { title: withSource('津贴', '导入'), dataIndex: 'other_allowance', key: 'oal', width: 80, render: fmtMoney },
    { title: withSource('保安奖金', '导入'), dataIndex: 'security_bonus', key: 'sb', width: 90, render: fmtMoney },
    { title: withSource('保洁奖金', '导入'), dataIndex: 'cleaning_bonus', key: 'cb', width: 90, render: fmtMoney },
    { title: withSource('服务费', '导入'), dataIndex: 'service_fee', key: 'sf', width: 90, render: fmtMoney },
    { title: withSource('绩效&佣金合计', '系统计算'), dataIndex: 'perf_comm_total', key: 'pct', width: 120, fixed: 'right', render: fmtMoney },
    { title: withSource('附加薪酬合计', '系统计算'), dataIndex: 'additional_total', key: 'at', width: 120, fixed: 'right',
      render: (v: any) => <strong>{fmtMoney(v)}</strong> },
    { title: withSource('数据状态', '系统计算'), dataIndex: 'data_status', key: 'ds', width: 110, render: (v: string) => <DataStatusTag status={v} /> },
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
          <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={(file) => {
            if (locked) { message.warning('该月已冻结，不能导入'); return false; }
            handleImport(file); return false;
          }}>
            <Button icon={<UploadOutlined />} disabled={locked}>导入</Button>
          </Upload>
        </Space>
      </Card>

      {/* 导入进度 */}
      {importProgress.importing && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Progress percent={Math.round((importProgress.done / (importProgress.total || 1)) * 100)} status="active" />
          <div style={{ textAlign: 'center', color: '#888', marginTop: 4 }}>
            正在导入，已处理 {importProgress.done} / {importProgress.total} 条
          </div>
        </Card>
      )}

      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Select placeholder="发薪公司" allowClear showSearch optionFilterProp="label" value={fPayCompany} onChange={setFPayCompany} style={{ width: 150 }}
            options={Object.values(employees).map((e: any) => ({ value: e.pay_company, label: e.pay_company })).filter((v, i, a) => a.findIndex(x => x.value === v.value) === i)} />
          <Input placeholder="成本中心" value={fCostCenter} onChange={e => setFCostCenter(e.target.value)} style={{ width: 120 }} allowClear />
          <Input placeholder="部门" value={fDepartment} onChange={e => setFDepartment(e.target.value)} style={{ width: 120 }} allowClear />
          <Select placeholder="数据状态" allowClear value={fDataStatus} onChange={setFDataStatus} style={{ width: 120 }}
            options={['已锁定', '正常', '未录入'].map(s => ({ value: s, label: s }))} />
          <Input prefix={<SearchOutlined />} placeholder="搜索姓名" value={keyword} onChange={e => setKeyword(e.target.value)} style={{ width: 140 }} allowClear />
        </Space>
      </Card>

      <div ref={scrollRef} onWheel={onWheel}>
        <Table columns={columns} dataSource={records} loading={loading} scroll={{ x: 2200, y: 480 }} size="small" pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: [10, 20, 30, 50, 100], showTotal: t => `共 ${t} 条` }} />
      </div>

      {/* 字段注释（分页器下方） */}
      <Card size="small" style={{ marginTop: 12 }}>
        <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 8 }}>字段注释</Typography.Title>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px 24px', fontSize: 13 }}>
          {FIELD_NOTES.map(([field, note]) => (
            <div key={field} style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: '#333', whiteSpace: 'nowrap', fontWeight: 500 }}>{field}：</span>
              <span style={{ color: '#888' }}>{note}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default AdditionalSalaryPage;
