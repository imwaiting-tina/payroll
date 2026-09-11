import React, { useEffect, useState } from 'react';
import {
  Table, Button, Drawer, Form, Input, Select, Space, message, Tag, Card, DatePicker, Upload, Dropdown, Popconfirm, InputNumber, Modal, Progress,
} from 'antd';
import { PlusOutlined, SearchOutlined, DownloadOutlined, UploadOutlined, SendOutlined, SyncOutlined, UnlockOutlined } from '@ant-design/icons';
import type { Employee, CompanyMapping } from '../types';
import dayjs, { Dayjs } from 'dayjs';
import { exportXlsx, importXlsx, type ExportDef } from '../utils/importExport';
import { genUniqueHash } from '../utils/hash';
import { withSource } from '../components/SourceTag';
import { useStore } from '../stores/appStore';
import { canSubmit, canApprove } from '../utils/permissions';
import { fetchApprovalStatus } from '../utils/approvalStatus';
import { ensureRoster } from '../utils/roster';
import api from '../api/client';

const { RangePicker } = DatePicker;

// ====== 下拉选项 ======
const STATUS_OPTIONS = ['在职', '离职'];
const ATTENDANCE_OPTIONS = ['全日制', '非全日制', '代收代付残疾人', '不定时工作制'];
const JOB_LEVELS = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ'];
const TAX_METHODS = [
  { value: 'normal', label: '正常计税' },
  { value: 'service', label: '劳务计税' },
  { value: 'intern', label: '实习生计税' },
  { value: 'flexible', label: '灵工计税' },
  { value: 'cash', label: '现金计税' },
  { value: 'non_taxable', label: '不计税' },
];
const TAX_VALUE_TO_LABEL: Record<string, string> = {
  normal: '正常计税', service: '劳务计税', intern: '实习生计税', flexible: '灵工计税', cash: '现金计税', non_taxable: '不计税',
};
// 中文/英文 → 枚举
const TAX_LABEL_TO_VALUE: Record<string, string> = {
  '正常计税': 'normal', '累计预扣': 'normal', 'normal': 'normal',
  '劳务计税': 'service', '劳务报酬': 'service', 'service': 'service',
  '实习生计税': 'intern', '实习': 'intern', 'intern': 'intern',
  '灵工计税': 'flexible', '灵工': 'flexible', 'flexible': 'flexible',
  '现金计税': 'cash', '现金': 'cash', 'cash': 'cash',
  '不计税': 'non_taxable', '国内不计税': 'non_taxable', 'non_taxable': 'non_taxable',
};

// ====== 表头定义（导出/导入用） ======
const EXPORT_DEF: ExportDef = {
  module: '员工花名册',
  columns: [
    { key: 'unique_hash', label: '唯一值', hidden: false },
    { key: 'name', label: '姓名', required: true },
    { key: 'status', label: '状态' },
    { key: 'cost_center', label: '成本中心' },
    { key: 'pay_company', label: '发薪公司', required: true },
    { key: 'tax_method', label: '计税方式' },
    { key: 'department', label: '部门' },
    { key: 'report_to', label: '汇报人' },
    { key: 'position', label: '职位' },
    { key: 'job_level', label: '职级' },
    { key: 'attendance_type', label: '考勤制' },
    { key: 'basic_salary', label: '基本工资' },
    { key: 'provision_welfare', label: '预提福利费' },
    { key: 'entry_date', label: '入职日期', required: true },
    { key: 'leave_date', label: '离职日期' },
  ],
};

const EmployeesPage: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companyList, setCompanyList] = useState<CompanyMapping[]>([]);
  const [loading, setLoading] = useState(false);
  // 全局月份花名册
  const period = useStore(s => s.currentPeriod);
  const [rosterLocked, setRosterLocked] = useState(false);
  const [rosterSubmitted, setRosterSubmitted] = useState(false);
  // 薪资是否已审批锁定（薪资审批通过后，花名册不能解锁）
  const [payrollLockedForPeriod, setPayrollLockedForPeriod] = useState(false);
  // 解锁确认弹窗
  const [unlockModal, setUnlockModal] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  // 更新花名册确认弹窗
  const [updateModal, setUpdateModal] = useState(false);
  const [updating, setUpdating] = useState(false);
  // 导入进度
  const [importProgress, setImportProgress] = useState<{ done: number; total: number; importing: boolean }>({ done: 0, total: 0, importing: false });

  // 筛选器状态
  const [fStatus, setFStatus] = useState<string>();
  const [fCostCenter, setFCostCenter] = useState<string>();
  const [fPayCompany, setFPayCompany] = useState<string>();
  const [fDepartment, setFDepartment] = useState<string>();
  const [fTaxMethod, setFTaxMethod] = useState<string>();
  const [fEntryRange, setFEntryRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [fLeaveRange, setFLeaveRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [search, setSearch] = useState('');

  // 抽屉状态
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form] = Form.useForm();
  // 审批确认弹窗
  const [approveConfirm, setApproveConfirm] = useState<{ type: 'submit' | 'approve' | 'reject' } | null>(null);
  // 筛选下拉选项
  const [costCenterOptions, setCostCenterOptions] = useState<string[]>([]);
  const [deptOptions, setDeptOptions] = useState<string[]>([]);

  useEffect(() => { loadCompanyMapping(); }, []);
  useEffect(() => { loadEmployees(); }, [period, fStatus, fCostCenter, fPayCompany, fDepartment, fTaxMethod, fEntryRange, fLeaveRange, search]);

  const loadCompanyMapping = async () => {
    try {
      const res = await api.get('/company_mapping?select=*&order=sort_order');
      setCompanyList(res.data);
    } catch { message.error('加载公司简称表失败'); }
  };

  const loadEmployees = async () => {
    setLoading(true);
    try {
      // 确保该月花名册已生成（未生成自动按需生成）
      await ensureRoster(period);
      const res = await api.get(`/employees?select=*&period=eq.${period}&order=id`);
      let data: Employee[] = res.data;
      // 该月状态：已锁定（彻底冻结，审批通过后）；已提交审批（冻结等待审批人处理）
      const hasLocked = data.some((e: any) => e.data_status === '已锁定');
      const hasSubmitted = data.some((e: any) => e.data_status === '已提交审批');
      setRosterLocked(hasLocked);
      setRosterSubmitted(hasSubmitted);
      // 当前月薪资是否已审批锁定（薪资审批通过后，花名册不能再解锁）
      try {
        const gate = await fetchApprovalStatus(period);
        setPayrollLockedForPeriod(gate.payrollLocked);
      } catch { setPayrollLockedForPeriod(false); }
      // 收集可选的成本中心和部门（用于筛选下拉）
      const ccOptions = Array.from(new Set(data.map(e => e.cost_center).filter(Boolean))).sort();
      const deptOptions = Array.from(new Set(data.map(e => e.department).filter(Boolean))).sort();
      setCostCenterOptions(ccOptions as string[]);
      setDeptOptions(deptOptions as string[]);
      // 前端筛选
      if (fStatus) data = data.filter(e => e.status === fStatus);
      if (fCostCenter) data = data.filter(e => (e.cost_center || '').includes(fCostCenter));
      if (fPayCompany) data = data.filter(e => e.pay_company === fPayCompany);
      if (fDepartment) data = data.filter(e => (e.department || '').includes(fDepartment));
      if (fTaxMethod) data = data.filter(e => e.tax_method === fTaxMethod);
      if (fEntryRange && fEntryRange[0] && fEntryRange[1]) {
        const s = fEntryRange[0].format('YYYY-MM-DD');
        const t = fEntryRange[1].format('YYYY-MM-DD');
        data = data.filter(e => e.entry_date && e.entry_date >= s && e.entry_date <= t);
      }
      if (fLeaveRange && fLeaveRange[0] && fLeaveRange[1]) {
        const s = fLeaveRange[0].format('YYYY-MM-DD');
        const t = fLeaveRange[1].format('YYYY-MM-DD');
        data = data.filter(e => e.leave_date && e.leave_date >= s && e.leave_date <= t);
      }
      if (search) data = data.filter(e => e.name.includes(search));
      setEmployees(data);
    } catch { message.error('加载员工数据失败'); }
    finally { setLoading(false); }
  };

  // 打开添加抽屉
  const openCreate = () => {
    setEditingEmployee(null);
    form.resetFields();
    form.setFieldsValue({
      status: '在职',
      tax_method: 'normal',
      attendance_type: '全日制',
    });
    setDrawerOpen(true);
  };

  // 打开编辑抽屉
  const openEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    form.setFieldsValue({
      ...emp,
      entry_date: emp.entry_date ? dayjs(emp.entry_date) : undefined,
      leave_date: emp.leave_date ? dayjs(emp.leave_date) : undefined,
    });
    setDrawerOpen(true);
  };

  // 保存
  const handleSave = async () => {
    // 冻结月禁止新增/编辑（已锁定 或 已提交审批）
    if (rosterLocked || rosterSubmitted) {
      message.warning('该月花名册已锁定/已提交审批，不能修改');
      return;
    }
    const values = await form.validateFields();
    const entryDateStr = values.entry_date ? values.entry_date.format('YYYY-MM-DD') : '';
    // 离职日期：有值填日期，清空(叉掉)则显式置 null，确保 POSTGREST 能清掉旧值
    const leaveDateStr = values.leave_date ? values.leave_date.format('YYYY-MM-DD') : null;

    // 填了离职日期 → 自动设为离职
    const autoStatus = leaveDateStr ? '离职' : values.status;

    // 唯一值 = 姓名 + 发薪公司简称 + 入职日期（不含月份，跨月组件一致）
    const unique_hash = await genUniqueHash(values.name, values.pay_company, entryDateStr);

    const payload = {
      ...values,
      unique_hash,
      entry_date: entryDateStr,
      leave_date: leaveDateStr,
      status: autoStatus,
      period,                        // 写入当前月
    };

    try {
      if (editingEmployee) {
        // 姓名 / 发薪公司 / 入职日期 都不可改（唯一值绑定）
        const origEntry = editingEmployee.entry_date ? String(editingEmployee.entry_date).slice(0, 10) : '';
        if (origEntry && origEntry !== entryDateStr) {
          message.error('入职日期不可修改（会影响关联数据）');
          return;
        }
        if (editingEmployee.name !== values.name) {
          message.error('姓名不可修改（会影响关联数据）');
          return;
        }
        if (editingEmployee.pay_company !== values.pay_company) {
          message.error('发薪公司不可修改（会影响关联数据）');
          return;
        }
        await api.patch(`/employees?id=eq.${editingEmployee.id}`, payload);
        message.success('更新成功');
      } else {
        // 查重：当前月该员工已存在则拒绝（unique_hash 跨月一致，需加 period）
        const dup = await api.get(`/employees?unique_hash=eq.${unique_hash}&period=eq.${period}`);
        if (dup.data.length > 0) {
          message.error('该员工该月已存在（姓名+发薪公司+入职日期重复）');
          return;
        }
        await api.post('/employees', payload);
        message.success('添加成功');
      }
      setDrawerOpen(false);
      loadEmployees();
    } catch (e: any) {
      message.error(e.response?.data?.detail || e.response?.data?.message || '操作失败');
    }
  };

  // ====== 删除（物理删除，数据库同步删除） ======
  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/employees?id=eq.${id}`);
      message.success('已删除');
      loadEmployees();
    } catch (e: any) {
      message.error(e.response?.data?.message || '删除失败');
    }
  };

  // ====== 导出（空白模板：只有表头；全量：当前所有员工，不含唯一值列） ======
  const handleExport = (mode: 'template' | 'full') => {
    if (mode === 'template') {
      // 空白模板：只导出表头
      exportXlsx(EXPORT_DEF, []);
    } else {
      // 全量：当前列表数据，唯一值列保持隐藏（不出现在表头）
      exportXlsx(EXPORT_DEF, employees);
    }
  };

  // ====== 导入（增量：有唯一值→更新，无唯一值→现算新增，重复→跳过） ======
  const handleImport = async (file: File) => {
    try {
      const { data, import_errors } = await importXlsx(EXPORT_DEF, file);
      if (import_errors.length > 0) message.warning(`有 ${import_errors.length} 行数据存在问题`);
      if (data.length === 0) { message.info('未找到有效数据'); return; }

      let added = 0, updated = 0, dupSkipped = 0, failed = 0;
      const failReasons: string[] = [];
      // 开始导入，显示进度
      setImportProgress({ done: 0, total: data.length, importing: true });

      for (const row of data) {
        try {
          // 1. 发薪公司归一化：全称→简称
          const rawCompany = String(row.pay_company || '').trim();
          let shortName = rawCompany;
          // 已经是简称
          let mapping = companyList.find(c => c.display_value === rawCompany);
          if (!mapping) {
            // 是全称
            mapping = companyList.find(c => c.full_name === rawCompany);
          }
          if (!mapping) {
            // 模糊：包含关系
            mapping = companyList.find(c =>
              rawCompany.includes(c.display_value) || c.full_name.includes(rawCompany)
            );
          }
          if (!mapping) {
            failed++;
            failReasons.push(`${row.name || '?'}（公司「${rawCompany}」无法识别）`);
            continue;
          }
          shortName = mapping.display_value;

          // 2. 计税方式中文→枚举
          const taxMethod = TAX_LABEL_TO_VALUE[String(row.tax_method || '正常计税').trim()] || 'normal';

          // 3. 考勤制校验
          const attType = ATTENDANCE_OPTIONS.includes(String(row.attendance_type || '').trim())
            ? String(row.attendance_type).trim()
            : '全日制';

          // 4. 职级校验（可为空）
          const rawJobLevel = String(row.job_level || '').trim();
          const jobLevel = JOB_LEVELS.includes(rawJobLevel) ? rawJobLevel : undefined;

          // 5. 状态校验
          const status = STATUS_OPTIONS.includes(String(row.status || '').trim())
            ? String(row.status).trim()
            : '在职';

          // 6. 日期归一化
          const entryDate = row.entry_date ? String(row.entry_date).slice(0, 10) : '';
          const leaveDate = row.leave_date ? String(row.leave_date).slice(0, 10) : null;
          if (!entryDate) {
            failed++;
            failReasons.push(`${row.name || '?'}（缺入职日期）`);
            continue;
          }

          // 7. 唯一值：以公式算出的为准。Excel里那一格要么为空（交给系统现算），
          //    要么等于公式算出的值；只要不一致（手填了旧值/错值）→ 拒绝导入。
          const calculatedHash = await genUniqueHash(row.name, shortName, entryDate);
          const importHash = row.unique_hash ? String(row.unique_hash).trim() : '';
          if (importHash !== '' && importHash !== calculatedHash) {
            failed++;
            failReasons.push(`${row.name || '?'}（唯一值与姓名+发薪公司+入职日期不符，请勿手动填写）`);
            continue;
          }
          const uniqueHash = calculatedHash;

          // 8. 查重（按 unique_hash + 当月 period）
          const existing = await api.get(`/employees?unique_hash=eq.${uniqueHash}&period=eq.${period}`);
          const payload = {
            name: row.name,
            status,
            cost_center: row.cost_center,
            pay_company: shortName,
            tax_method: taxMethod,
            department: row.department,
            report_to: row.report_to,
            position: row.position,
            job_level: jobLevel,
            attendance_type: attType,
            basic_salary: row.basic_salary !== undefined && row.basic_salary !== '' ? Number(row.basic_salary) : undefined,
            provision_welfare: row.provision_welfare !== undefined && row.provision_welfare !== '' ? Number(row.provision_welfare) : undefined,
            entry_date: entryDate,
            leave_date: leaveDate,
            unique_hash: uniqueHash,
            period,   // 写入当前月
          };

          if (existing.data.length > 0) {
            await api.patch(`/employees?id=eq.${existing.data[0].id}`, payload);
            updated++;
          } else {
            await api.post('/employees', payload);
            added++;
          }
        } catch {
          failed++;
        }
        // 更新导入进度
        setImportProgress((p) => ({ ...p, done: p.done + 1 }));
      }

      const parts: string[] = [];
      if (added > 0) parts.push(`新增 ${added} 人`);
      if (updated > 0) parts.push(`更新 ${updated} 人`);
      if (dupSkipped > 0) parts.push(`重复跳过 ${dupSkipped} 人`);
      if (failed > 0) parts.push(`失败 ${failed} 人`);
      message.info(`导入完成：${parts.join('，')}${failReasons.length ? '。' + failReasons.slice(0, 5).join('；') : ''}`);
      loadEmployees();
    } catch (e: any) {
      message.error(e.message || '导入失败');
    } finally {
      // 结束导入
      setImportProgress({ done: 0, total: 0, importing: false });
    }
  };

  // ====== 更新花名册：依照上一个有数据的月份，整体刷新当月（调用数据库函数） ======
  const handleUpdateRoster = async () => {
    setUpdating(true);
    try {
      const res = await api.post('/rpc/update_roster_from_prev_month', { p_period: period });
      const added = res.data || 0;
      message.success(`花名册已更新：从上一月复制 ${added} 人`);
      setUpdateModal(false);
      loadEmployees();
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || '更新失败，请确认已在 Supabase 执行 update_roster_from_prev_month 函数');
    } finally {
      setUpdating(false);
    }
  };

  // ====== 提交审批（人事专员）：把当月所有花名册 data_status 置为 已提交审批 ======
  const doSubmitApproval = async () => {
    try {
      const recs = await api.get(`/employees?select=id&period=eq.${period}`);
      const ids = recs.data.map((r: any) => r.id);
      if (ids.length === 0) { message.warning('该月暂无花名册数据'); return; }
      // 逐条更新（POSTGREST 不支持批量 patch 任意字段，用 in 逐条）
      const updated = ids.map((id: number) => api.patch(`/employees?id=eq.${id}`, { data_status: '已提交审批' }));
      await Promise.all(updated);
      message.success('花名册已提交审批');
      loadEmployees();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '提交失败');
    }
  };
  const handleSubmitApproval = () => setApproveConfirm({ type: 'submit' });

  // ====== 审批通过（花名册审批人）：当月花名册置为 已锁定（冻结） ======
  const doApprove = async () => {
    try {
      const recs = await api.get(`/employees?select=id&period=eq.${period}`);
      const ids = recs.data.map((r: any) => r.id);
      if (ids.length === 0) { message.warning('该月暂无花名册数据'); return; }
      const updated = ids.map((id: number) => api.patch(`/employees?id=eq.${id}`, { data_status: '已锁定' }));
      await Promise.all(updated);
      message.success('花名册审批通过，当月花名册已冻结');
      loadEmployees();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '审批失败');
    }
  };
  const handleApprove = () => setApproveConfirm({ type: 'approve' });

  // ====== 解锁（花名册审批人）：把当月花名册从 已锁定 恢复为 正常，需重新审批 ======
  const handleUnlock = async () => {
    if (payrollLockedForPeriod) { message.warning('当月薪资已审批通过并冻结，花名册不能再解锁'); return; }
    setUnlocking(true);
    try {
      const recs = await api.get(`/employees?select=id&period=eq.${period}`);
      const ids = recs.data.map((r: any) => r.id);
      if (ids.length === 0) { message.warning('该月暂无花名册数据'); return; }
      const updated = ids.map((id: number) => api.patch(`/employees?id=eq.${id}`, { data_status: '正常' }));
      await Promise.all(updated);
      message.success('花名册已解锁，需重新提交审批');
      setUnlockModal(false);
      loadEmployees();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '解锁失败');
    } finally {
      setUnlocking(false);
    }
  };

  // ====== 退回修改（花名册审批人）：恢复为 草稿 状态 ======
  const doReject = async () => {
    try {
      const recs = await api.get(`/employees?select=id&period=eq.${period}`);
      const ids = recs.data.map((r: any) => r.id);
      const updated = ids.map((id: number) => api.patch(`/employees?id=eq.${id}`, { data_status: '草稿' }));
      await Promise.all(updated);
      message.success('已退回修改');
      loadEmployees();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '退回失败');
    }
  };
  const handleReject = () => setApproveConfirm({ type: 'reject' });

  // ====== 表格列（固定顺序） ======
  const columns: any[] = [
    { title: withSource('姓名', '导入'), dataIndex: 'name', key: 'name', width: 100, fixed: 'left' },
    {
      title: withSource('状态', '导入'), dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => (
        <Tag color={v === '在职' ? 'green' : 'red'} style={{ borderRadius: '12px', padding: '0 10px' }}>{v}</Tag>
      ),
    },
    { title: withSource('成本中心', '导入'), dataIndex: 'cost_center', key: 'cost_center', width: 130 },
    { title: withSource('发薪公司', '导入'), dataIndex: 'pay_company', key: 'pay_company', width: 130 },
    {
      title: withSource('计税方式', '导入'), dataIndex: 'tax_method', key: 'tax_method', width: 100,
      render: (v: string) => TAX_VALUE_TO_LABEL[v] || v,
    },
    { title: withSource('部门', '导入'), dataIndex: 'department', key: 'department', width: 120 },
    { title: withSource('汇报人', '导入'), dataIndex: 'report_to', key: 'report_to', width: 100 },
    { title: withSource('职位', '导入'), dataIndex: 'position', key: 'position', width: 130 },
    { title: withSource('职级', '导入'), dataIndex: 'job_level', key: 'job_level', width: 70 },
    { title: withSource('考勤制', '导入'), dataIndex: 'attendance_type', key: 'attendance_type', width: 110 },
    { title: withSource('基本工资', '导入'), dataIndex: 'basic_salary', key: 'basic_salary', width: 110, render: (v: any) => v ? `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—' },
    { title: withSource('预提福利费', '导入'), dataIndex: 'provision_welfare', key: 'provision_welfare', width: 110, render: (v: any) => v ? `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—' },
    { title: withSource('入职日期', '导入'), dataIndex: 'entry_date', key: 'entry_date', width: 110 },
    {
      title: withSource('离职日期', '导入'), dataIndex: 'leave_date', key: 'leave_date', width: 110,
      render: (v: string) => v || '—',
    },
    {
      title: '操作', key: 'actions', width: 80, fixed: 'right',
      render: (_: any, r: Employee) => (
        <Button size="small" onClick={() => openEdit(r)} disabled={rosterLocked || rosterSubmitted}>编辑</Button>
      ),
    },
  ];

  return (
    <div>
      {/* 顶部工具栏 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <span style={{ color: '#666' }}>{period} 花名册{rosterLocked ? '（已锁定）' : rosterSubmitted ? '（已提交审批）' : ''}</span>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={rosterLocked || rosterSubmitted}>添加员工</Button>
          <Dropdown menu={{
            items: [
              { key: 'template', label: '导出空白模板' },
              { key: 'full', label: '导出全量数据' },
            ],
            onClick: ({ key }) => handleExport(key as 'template' | 'full'),
          }}>
            <Button icon={<DownloadOutlined />}>导出</Button>
          </Dropdown>
          <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={(file) => { if (rosterLocked || rosterSubmitted) { message.warning('该月花名册已锁定/已提交审批，不能导入'); return false; } handleImport(file); return false; }}>
            <Button icon={<UploadOutlined />} disabled={rosterLocked || rosterSubmitted}>导入</Button>
          </Upload>
          <Button icon={<SyncOutlined />} onClick={() => setUpdateModal(true)} disabled={rosterLocked || rosterSubmitted}>更新花名册</Button>
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索姓名"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 160 }}
            allowClear
          />
          {canSubmit('roster') && !rosterSubmitted && (
            <Button type="primary" ghost icon={<SendOutlined />} onClick={handleSubmitApproval} disabled={rosterLocked}>
              提交审批
            </Button>
          )}
          {canApprove('roster') && rosterSubmitted && !rosterLocked && (
            <>
              <Button type="primary" onClick={handleApprove}>审批通过</Button>
              <Button danger onClick={handleReject}>退回</Button>
            </>
          )}
          {canApprove('roster') && rosterLocked && !payrollLockedForPeriod && (
            <Button icon={<UnlockOutlined />} onClick={() => setUnlockModal(true)}>解锁</Button>
          )}
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

      {/* 筛选器 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Select placeholder="状态" allowClear value={fStatus} onChange={setFStatus} style={{ width: 100 }}
            options={STATUS_OPTIONS.map(s => ({ value: s, label: s }))} />
          <Select placeholder="成本中心" allowClear showSearch optionFilterProp="label" value={fCostCenter} onChange={setFCostCenter} style={{ width: 160 }}
            options={costCenterOptions.map(c => ({ value: c, label: c }))} />
          <Select placeholder="发薪公司" allowClear showSearch optionFilterProp="label" value={fPayCompany} onChange={setFPayCompany} style={{ width: 160 }}
            options={companyList.map(c => ({ value: c.display_value, label: c.display_value }))} />
          <Select placeholder="部门" allowClear showSearch optionFilterProp="label" value={fDepartment} onChange={setFDepartment} style={{ width: 140 }}
            options={deptOptions.map(d => ({ value: d, label: d }))} />
          <Select placeholder="计税方式" allowClear value={fTaxMethod} onChange={setFTaxMethod} style={{ width: 120 }}
            options={TAX_METHODS} />
          <RangePicker value={fEntryRange} onChange={(v) => setFEntryRange(v as any)} placeholder={['入职起', '入职止']} />
          <RangePicker value={fLeaveRange} onChange={(v) => setFLeaveRange(v as any)} placeholder={['离职起', '离职止']} />
        </Space>
      </Card>

      <Table
        columns={columns}
        dataSource={employees.map(e => ({ ...e, key: e.id }))}
        loading={loading}
        scroll={{ x: 1400, y: 480 }}
        size="small"
        pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: [10, 20, 30, 50, 100], showTotal: t => `共 ${t} 人` }}
      />

      {/* 编辑/添加抽屉 */}
      <Drawer
        title={editingEmployee ? '编辑员工' : '添加员工'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={560}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" onClick={handleSave}>保存</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}
            extra={editingEmployee ? '姓名不可修改（唯一值绑定）' : undefined}>
            <Input disabled={!!editingEmployee} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={STATUS_OPTIONS.map(s => ({ value: s, label: s }))} />
          </Form.Item>
          <Form.Item name="cost_center" label="成本中心">
            <Input />
          </Form.Item>
          <Form.Item name="pay_company" label="发薪公司" rules={[{ required: true, message: '请选择发薪公司' }]}
            extra={editingEmployee ? '发薪公司不可修改（唯一值绑定）' : undefined}>
            <Select showSearch optionFilterProp="label" placeholder="选择发薪公司" disabled={!!editingEmployee}
              options={companyList.map(c => ({ value: c.display_value, label: c.display_value }))} />
          </Form.Item>
          <Form.Item name="tax_method" label="计税方式" rules={[{ required: true }]}>
            <Select options={TAX_METHODS} />
          </Form.Item>
          <Form.Item name="department" label="部门">
            <Input />
          </Form.Item>
          <Form.Item name="report_to" label="汇报人">
            <Input />
          </Form.Item>
          <Form.Item name="position" label="职位">
            <Input />
          </Form.Item>
          <Form.Item name="job_level" label="职级">
            <Select allowClear placeholder="可留空" options={JOB_LEVELS.map(l => ({ value: l, label: l }))} />
          </Form.Item>
          <Form.Item name="attendance_type" label="考勤制" rules={[{ required: true }]}>
            <Select options={ATTENDANCE_OPTIONS.map(s => ({ value: s, label: s }))} />
          </Form.Item>
          <Form.Item name="basic_salary" label="基本工资">
            <InputNumber style={{ width: '100%' }} min={0} placeholder="后续板块基本工资来源" />
          </Form.Item>
          <Form.Item name="provision_welfare" label="预提福利费">
            <InputNumber style={{ width: '100%' }} min={0} placeholder="可留空，链接到数据总览 summary" />
          </Form.Item>
          <Form.Item name="entry_date" label="入职日期" rules={[{ required: true, message: '请选择入职日期' }]}
            extra={editingEmployee?.entry_date ? '入职日期不可修改' : undefined}>
            <DatePicker style={{ width: '100%' }} disabled={!!editingEmployee?.entry_date} />
          </Form.Item>
          <Form.Item name="leave_date" label="离职日期" extra="填写后自动标记为离职">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
        {editingEmployee && (
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Popconfirm
              title="确认删除该员工？"
              description="删除后数据库记录将同步删除，且关联的社保/考勤/薪资数据会失联。"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => { handleDelete(editingEmployee.id); setDrawerOpen(false); }}
            >
              <Button danger size="small">删除该员工</Button>
            </Popconfirm>
          </div>
        )}
      </Drawer>

      {/* 审批确认弹窗 */}
      <Modal
        title={approveConfirm?.type === 'submit' ? '提交审批' : approveConfirm?.type === 'approve' ? '通过审批' : '退回修改'}
        open={!!approveConfirm}
        onOk={async () => {
          if (approveConfirm?.type === 'submit') await doSubmitApproval();
          else if (approveConfirm?.type === 'approve') await doApprove();
          else await doReject();
          setApproveConfirm(null);
        }}
        onCancel={() => setApproveConfirm(null)}
        okText="确认"
        cancelText="取消"
      >
        {approveConfirm?.type === 'submit' && <div>是否确认提交本月员工花名册的审批？提交后当月花名册将冻结，等待审批人处理。</div>}
        {approveConfirm?.type === 'approve' && <div>是否确认通过？通过后当月员工花名册将冻结，仅可查看。</div>}
        {approveConfirm?.type === 'reject' && <div>是否确认退回？退回后当月花名册恢复为可修改状态。</div>}
      </Modal>

      {/* 更新花名册确认弹窗 */}
      <Modal
        title="更新花名册"
        open={updateModal}
        onOk={handleUpdateRoster}
        onCancel={() => setUpdateModal(false)}
        okText="是，更新"
        cancelText="否，取消"
        confirmLoading={updating}
      >
        <div>是否依照【上一个有花名册数据的月份】更新本月花名册？<br/>更新后将用上月在职员工整体替换本月，可再手动调整。</div>
      </Modal>

      {/* 解锁确认弹窗 */}
      <Modal
        title="解锁当前月份"
        open={unlockModal}
        onOk={handleUnlock}
        onCancel={() => setUnlockModal(false)}
        okText="是，解锁"
        cancelText="否，取消"
        confirmLoading={unlocking}
      >
        <div>是否解锁当前月份的数据冻结？解锁后该模块恢复为可编辑，<b>后续需要重新提交并再次审批</b>。</div>
      </Modal>
    </div>
  );
};

export default EmployeesPage;
