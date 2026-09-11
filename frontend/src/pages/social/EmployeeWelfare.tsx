import React, { useEffect, useState } from 'react';
import {
  Table, Button, Drawer, Form, Input, Select, Space, message, Card, InputNumber, Switch, Tag, Descriptions, DatePicker, Upload, Dropdown, Popconfirm, Progress,
} from 'antd';
import { PlusOutlined, DownloadOutlined, UploadOutlined, CalculatorOutlined, SearchOutlined } from '@ant-design/icons';
import api from '../../api/client';
import type { SocialWelfareSet, HousingFundSet, EmployeeWelfareRecord } from '../../types';
import { calcSocial, calcHousingFund } from '../../utils/welfareCalc';
import { exportXlsx, importXlsx, type ExportDef } from '../../utils/importExport';
import { withSource } from '../../components/SourceTag';
import CalcProgress from '../../components/CalcProgress';
import { DataStatusTag, anyLocked } from '../../components/DataStatusTag';
import { useHorizontalScroll } from '../../utils/useHorizontalScroll';
import { isActiveInPeriod } from '../../utils/employee';
import { round2 } from '../../utils/round';
import dayjs from 'dayjs';
import { useStore } from '../../stores/appStore';
import { ensureRoster } from '../../utils/roster';

const defaultPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

const SOCIAL_NO_REASONS = ['退休返聘', '实习或劳务关系', '异地缴纳', '其他单位缴纳', '其他'];
const HOUSING_NO_REASONS = ['异地缴纳', '其他单位缴纳', '其他'];

// 金额格式化：固定两位小数
const fmtMoney = (v: any) => {
  if (v === undefined || v === null || v === '' || Number(v) === 0) return '—';
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// 导出表头定义
const EXPORT_DEF: ExportDef = {
  module: '员工福利缴纳明细',
  columns: [
    { key: 'unique_hash', label: '唯一值', hidden: false },
    { key: 'employee_name', label: '姓名', required: true },
    { key: 'pay_company', label: '发薪公司', required: true },
    { key: 'department', label: '部门' },
    { key: 'effective_month', label: '生效日期' },
    { key: 'expiry_month', label: '结束日期' },
    { key: 'social_welfare_code', label: '社保福利套', required: true },
    { key: 'housing_fund_code', label: '公积金福利套', required: true },
    { key: 'social_base', label: '社保基数' },
    { key: 'housing_base', label: '公积金基数' },
    { key: 'supp_enabled', label: '是否缴纳补充公积金' },
    { key: 'supp_base', label: '补充公积金基数' },
    { key: 'social_no_reason', label: '社保不缴纳原因' },
    { key: 'housing_no_reason', label: '公积金不缴纳原因' },
    { key: 'personal_social_adj', label: '个人社保调整金额' },
    { key: 'company_social_adj', label: '公司社保调整金额' },
    { key: 'personal_housing_adj', label: '个人公积金调整金额' },
    { key: 'company_housing_adj', label: '公司公积金调整金额' },
    { key: 'adj_start_month', label: '调整开始月份' },
    { key: 'adj_end_month', label: '调整结束月份' },
    { key: 'adj_reason', label: '调整原因' },
  ],
};

// 详情导出表头（抽屉里的所有明细数据）
const DETAIL_EXPORT_DEF: ExportDef = {
  module: '社保详情',
  columns: [
    { key: 'unique_hash', label: '唯一值', hidden: false },
    { key: 'employee_name', label: '姓名' },
    { key: 'pay_company', label: '发薪公司' },
    { key: 'social_welfare_code', label: '社保福利套' },
    { key: 'housing_fund_code', label: '公积金福利套' },
    { key: 'social_status', label: '社保状态' },
    { key: 'housing_status', label: '公积金状态' },
    { key: 'social_base', label: '社保基数' },
    { key: 'housing_base', label: '公积金基数' },
    { key: 'pension_p_amt', label: '个人养老' },
    { key: 'medical_p_amt', label: '个人医疗' },
    { key: 'unemployment_p_amt', label: '个人失业' },
    { key: 'pension_c_amt', label: '公司养老' },
    { key: 'medical_c_amt', label: '公司医疗' },
    { key: 'unemployment_c_amt', label: '公司失业' },
    { key: 'injury_c_amt', label: '公司工伤' },
    { key: 'maternity_c_amt', label: '公司生育' },
    { key: 'normal_housing_p_amt', label: '正常公积金个人' },
    { key: 'normal_housing_c_amt', label: '正常公积金公司' },
    { key: 'supp_housing_p_amt', label: '补充公积金个人' },
    { key: 'supp_housing_c_amt', label: '补充公积金公司' },
    { key: 'personal_total', label: '个人合计' },
    { key: 'company_total', label: '公司合计' },
    { key: 'personal_social_adj', label: '个人社保调整' },
    { key: 'company_social_adj', label: '公司社保调整' },
    { key: 'personal_housing_adj', label: '个人公积金调整' },
    { key: 'company_housing_adj', label: '公司公积金调整' },
    { key: 'social_adj_total', label: '社保调整金额' },
    { key: 'housing_adj_total', label: '公积金调整金额' },
    { key: 'adj_start_month', label: '调整开始月份' },
    { key: 'adj_end_month', label: '调整结束月份' },
    { key: 'adj_reason', label: '调整原因' },
    { key: 'personal_total_with_adj', label: '个人合计(含调整)' },
    { key: 'company_total_with_adj', label: '公司合计(含调整)' },
    { key: 'data_status', label: '数据状态' },
  ],
};

const EmployeeWelfare: React.FC = () => {
  const { ref: scrollRef, onWheel } = useHorizontalScroll<HTMLDivElement>();
  const [records, setRecords] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [socialSets, setSocialSets] = useState<SocialWelfareSet[]>([]);
  const [housingSets, setHousingSets] = useState<HousingFundSet[]>([]);
  const period = useStore(s => s.currentPeriod);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  // 计算进度
  const [calcProgress, setCalcProgress] = useState<{ done: number; total: number; active: boolean; label: string }>({ done: 0, total: 0, active: false, label: '' });
  // 导入进度
  const [importProgress, setImportProgress] = useState<{ done: number; total: number; importing: boolean }>({ done: 0, total: 0, importing: false });

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const [formValues, setFormValues] = useState<any>({});

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<any>(null);

  // 筛选器
  const [fPayCompany, setFPayCompany] = useState<string>();
  const [fDepartment, setFDepartment] = useState<string>();
  const [fSocialStatus, setFSocialStatus] = useState<string>();
  const [fHousingStatus, setFHousingStatus] = useState<string>();
  const [fDataStatus, setFDataStatus] = useState<string>();
  const [keyword, setKeyword] = useState('');

  useEffect(() => { loadData(); }, [period]);

  const loadData = async () => {
    setLoading(true);
    try {
      await ensureRoster(period);
      const [empRes, sRes, hRes, recRes] = await Promise.all([
        api.get(`/employees?select=unique_hash,name,status,pay_company,cost_center,department,report_to,position,entry_date,leave_date,attendance_type&period=eq.${period}`),
        api.get('/social_welfare_sets?select=*&order=code'),
        api.get('/housing_fund_sets?select=*&order=code'),
        api.get(`/employee_welfare_records?select=*&period=eq.${period}`),
      ]);
      const empList: any[] = empRes.data;
      setEmployees(empList);
      setSocialSets(sRes.data);
      setHousingSets(hRes.data);

      const empMap: Record<string, any> = {};
      empList.forEach((e: any) => { empMap[e.unique_hash] = e; });
      const recMap: Record<string, any> = {};
      recRes.data.forEach((r: any) => { recMap[r.unique_hash] = r; });

      // 左连接：以花名册在职员工为准自动列出，离职但当月有记录也显示
      const merged = empList
        .filter((e: any) => isActiveInPeriod(e, period))
        .map((e: any) => {
          const r = recMap[e.unique_hash];
          // 生效日期识别：生效日期(如2026-07) > 当前月份(如2026-06) 时，该月社保/公积金金额为 0
          const notYetEffective = !!(r?.effective_month && r.effective_month > period);
          const psAdj = notYetEffective ? 0 : Number(r?.personal_social_adj || 0);
          const csAdj = notYetEffective ? 0 : Number(r?.company_social_adj || 0);
          const phAdj = notYetEffective ? 0 : Number(r?.personal_housing_adj || 0);
          const chAdj = notYetEffective ? 0 : Number(r?.company_housing_adj || 0);
          const psBase = notYetEffective ? 0 : Number(r?.personal_social_total || 0);
          const csBase = notYetEffective ? 0 : Number(r?.company_social_total || 0);
          const phBase = notYetEffective ? 0 : Number(r?.personal_housing_total || 0);
          const chBase = notYetEffective ? 0 : Number(r?.company_housing_total || 0);
          const socialAdjTotal = round2(psAdj + csAdj);
          const housingAdjTotal = round2(phAdj + chAdj);
          const psWithAdj = round2(psBase + psAdj);
          const csWithAdj = round2(csBase + csAdj);
          const phWithAdj = round2(phBase + phAdj);
          const chWithAdj = round2(chBase + chAdj);
          return {
            ...(r || { id: undefined, data_status: '未录入', supp_enabled: undefined }),
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
            not_yet_effective: notYetEffective,
            social_adj_total: socialAdjTotal,
            housing_adj_total: housingAdjTotal,
            personal_social_with_adj: psWithAdj,
            company_social_with_adj: csWithAdj,
            personal_housing_with_adj: phWithAdj,
            company_housing_with_adj: chWithAdj,
            social_total_with_adj: round2(psWithAdj + csWithAdj),
            housing_total_with_adj: round2(phWithAdj + chWithAdj),
            personal_total_with_adj: round2(psWithAdj + phWithAdj),
            company_total_with_adj: round2(csWithAdj + chWithAdj),
            // 覆盖原始金额为 0（未生效月显示 0）
            pension_p_amt: notYetEffective ? 0 : r?.pension_p_amt,
            medical_p_amt: notYetEffective ? 0 : r?.medical_p_amt,
            unemployment_p_amt: notYetEffective ? 0 : r?.unemployment_p_amt,
            pension_c_amt: notYetEffective ? 0 : r?.pension_c_amt,
            medical_c_amt: notYetEffective ? 0 : r?.medical_c_amt,
            unemployment_c_amt: notYetEffective ? 0 : r?.unemployment_c_amt,
            injury_c_amt: notYetEffective ? 0 : r?.injury_c_amt,
            maternity_c_amt: notYetEffective ? 0 : r?.maternity_c_amt,
            normal_housing_p_amt: notYetEffective ? 0 : r?.normal_housing_p_amt,
            normal_housing_c_amt: notYetEffective ? 0 : r?.normal_housing_c_amt,
            supp_housing_p_amt: notYetEffective ? 0 : r?.supp_housing_p_amt,
            supp_housing_c_amt: notYetEffective ? 0 : r?.supp_housing_c_amt,
            personal_social_total: psBase,
            personal_housing_total: phBase,
            company_social_total: csBase,
            company_housing_total: chBase,
            personal_total: notYetEffective ? 0 : r?.personal_total,
            company_total: notYetEffective ? 0 : r?.company_total,
          };
        });

      setRecords(merged);
      setLocked(anyLocked(recRes.data));
    } catch { message.error('加载数据失败'); }
    finally { setLoading(false); }
  };

  // 前端筛选（姓名/公司/部门/社保状态/公积金状态/数据状态）
  const filteredRecords = records
    .filter((r: any) => {
      if (fPayCompany && r.pay_company !== fPayCompany) return false;
      if (fDepartment && (r.department || '') !== fDepartment) return false;
      if (fSocialStatus && r.social_status !== fSocialStatus) return false;
      if (fHousingStatus && r.housing_status !== fHousingStatus) return false;
      if (fDataStatus && r.data_status !== fDataStatus) return false;
      if (keyword && !(r.employee_name || '').includes(keyword)) return false;
      return true;
    });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ period });
    setFormValues({});
    setEditOpen(true);
  };

  const openEdit = (record: any) => {
    setEditing(record);
    form.setFieldsValue({ ...record });
    setFormValues({ ...record });
    setEditOpen(true);
  };

  const onFormChange = (_: any, allValues: any) => {
    setFormValues(allValues);
  };

  // 实时计算
  const handleCalc = () => {
    const v = formValues;
    if (!v.social_welfare_code || !v.housing_fund_code) {
      message.warning('请先选择社保和公积金福利套');
      return;
    }
    const sSet = socialSets.find(s => s.code === v.social_welfare_code);
    const hSet = housingSets.find(h => h.code === v.housing_fund_code);
    if (!sSet || !hSet) { message.error('未找到福利套'); return; }

    const socialBase = Number(v.social_base || 0);
    const housingBase = Number(v.housing_base || 0);
    const suppBase = Number(v.supp_base || housingBase);

    const social = sSet.code === 'SI-00' ? null : calcSocial(sSet as any, socialBase);
    const housing = hSet.code === 'HF-00' ? null : calcHousingFund(hSet as any, housingBase, suppBase, v.supp_enabled);

    // 组装计算结果
    const result: any = {
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
      personal_social_total: social?.personal_total || 0,
      personal_housing_total: housing?.personal_total || 0,
      company_social_total: social?.company_total || 0,
      company_housing_total: housing?.company_total || 0,
    };
    result.personal_total = round2(result.personal_social_total + result.personal_housing_total);
    result.company_total = round2(result.company_social_total + result.company_housing_total);

    // 调整金额（手工导入，不参与本月计算）
    const psAdj = Number(v.personal_social_adj || 0);
    const csAdj = Number(v.company_social_adj || 0);
    const phAdj = Number(v.personal_housing_adj || 0);
    const chAdj = Number(v.company_housing_adj || 0);

    // 含调整合计
    result.personal_social_adj = round2(psAdj);
    result.company_social_adj = round2(csAdj);
    result.personal_housing_adj = round2(phAdj);
    result.company_housing_adj = round2(chAdj);
    result.social_adj_total = round2(psAdj + csAdj);       // 社保调整金额
    result.housing_adj_total = round2(phAdj + chAdj);      // 公积金调整金额
    result.personal_social_with_adj = round2(result.personal_social_total + psAdj);
    result.company_social_with_adj = round2(result.company_social_total + csAdj);
    result.personal_housing_with_adj = round2(result.personal_housing_total + phAdj);
    result.company_housing_with_adj = round2(result.company_housing_total + chAdj);
    result.social_total_with_adj = round2(result.personal_social_with_adj + result.company_social_with_adj);
    result.housing_total_with_adj = round2(result.personal_housing_with_adj + result.company_housing_with_adj);
    result.personal_total_with_adj = round2(result.personal_social_with_adj + result.personal_housing_with_adj);
    result.company_total_with_adj = round2(result.company_social_with_adj + result.company_housing_with_adj);
    result.grand_total_with_adj = round2(result.personal_total_with_adj + result.company_total_with_adj);

    // 状态校验
    let data_status = '正常';
    if (v.social_welfare_code !== 'SI-00' && !v.social_base) data_status = '社保基数缺失';
    else if (v.housing_fund_code !== 'HF-00' && !v.housing_base) data_status = '公积金基数缺失';
    else if (v.supp_enabled && !v.supp_base) data_status = '补充公积金基数缺失';
    else if (v.social_welfare_code === 'SI-00' && !v.social_no_reason) data_status = '不缴纳原因缺失';
    else if (v.housing_fund_code === 'HF-00' && !v.housing_no_reason) data_status = '不缴纳原因缺失';
    else if (psAdj !== 0 || csAdj !== 0 || phAdj !== 0 || chAdj !== 0) {
      if (!v.adj_reason) data_status = '调整原因缺失';
      else if (!v.adj_start_month || !v.adj_end_month) data_status = '调整期间缺失';
      else data_status = '含调整';
    }

    // 回填到表单
    form.setFieldsValue({ ...result, data_status });
    setFormValues({ ...v, ...result, data_status });
    message.success('计算完成');
  };

  // 一键自动计算：遍历所有记录，逐条计算并保存
  const handleBatchCalc = async () => {
    let success = 0;
    let skipped = 0;
    setCalcProgress({ done: 0, total: records.length, active: true, label: '正在一键计算社保' });
    for (const rec of records) {
      try {
        const v = rec;
        if (!v.social_welfare_code || !v.housing_fund_code) {
          skipped++;
          continue;
        }
        const sSet = socialSets.find(s => s.code === v.social_welfare_code);
        const hSet = housingSets.find(h => h.code === v.housing_fund_code);
        if (!sSet || !hSet) { skipped++; continue; }

        const socialBase = Number(v.social_base || 0);
        const housingBase = Number(v.housing_base || 0);
        const suppBase = Number(v.supp_base || housingBase);

        const social = sSet.code === 'SI-00' ? null : calcSocial(sSet as any, socialBase);
        const housing = hSet.code === 'HF-00' ? null : calcHousingFund(hSet as any, housingBase, suppBase, v.supp_enabled);

        const psAdj = Number(v.personal_social_adj || 0);
        const csAdj = Number(v.company_social_adj || 0);
        const phAdj = Number(v.personal_housing_adj || 0);
        const chAdj = Number(v.company_housing_adj || 0);

        const personalSocial = social?.personal_total || 0;
        const personalHousing = housing?.personal_total || 0;
        const companySocial = social?.company_total || 0;
        const companyHousing = housing?.company_total || 0;

        // 状态校验
        let data_status = '正常';
        if (v.social_welfare_code !== 'SI-00' && !v.social_base) data_status = '社保基数缺失';
        else if (v.housing_fund_code !== 'HF-00' && !v.housing_base) data_status = '公积金基数缺失';
        else if (v.supp_enabled && !v.supp_base) data_status = '补充公积金基数缺失';
        else if (v.social_welfare_code === 'SI-00' && !v.social_no_reason) data_status = '不缴纳原因缺失';
        else if (v.housing_fund_code === 'HF-00' && !v.housing_no_reason) data_status = '不缴纳原因缺失';
        else if (psAdj !== 0 || csAdj !== 0 || phAdj !== 0 || chAdj !== 0) {
          if (!v.adj_reason) data_status = '调整原因缺失';
          else if (!v.adj_start_month || !v.adj_end_month) data_status = '调整期间缺失';
          else data_status = '含调整';
        }

        const payload = {
          // 状态随福利套刷新（与单条保存逻辑一致）
          social_status: v.social_welfare_code === 'SI-00' ? '不参保' : '参保',
          housing_status: v.housing_fund_code === 'HF-00' ? '不缴存' : '缴存',
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

        const existing = await api.get(`/employee_welfare_records?unique_hash=eq.${v.unique_hash}&period=eq.${period}`);
        if (existing.data.length > 0) {
          await api.patch(`/employee_welfare_records?id=eq.${existing.data[0].id}`, payload);
        } else {
          await api.post('/employee_welfare_records', { ...payload, unique_hash: v.unique_hash, period });
        }
        success++;
      } catch { skipped++; }
      setCalcProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    message.success(`一键计算完成：${success} 条，跳过 ${skipped} 条（缺少福利套或基数）`);
    setCalcProgress({ done: 0, total: 0, active: false, label: '' });
    loadData();
  };

  const handleSave = async () => {
    await form.validateFields();
    const values = formValues;
    // 只提交数据库表真实存在的字段（排除前端计算展示用的中间字段）
    const payload = {
      unique_hash: values.unique_hash,
      period,
      effective_month: values.effective_month,
      expiry_month: values.expiry_month,
      social_welfare_code: values.social_welfare_code,
      housing_fund_code: values.housing_fund_code,
      social_status: values.social_welfare_code === 'SI-00' ? '不参保' : '参保',
      housing_status: values.housing_fund_code === 'HF-00' ? '不缴存' : '缴存',
      social_no_reason: values.social_no_reason,
      housing_no_reason: values.housing_no_reason,
      social_base: values.social_base,
      housing_base: values.housing_base,
      supp_enabled: values.supp_enabled,
      supp_base: values.supp_base,
      // 社保金额快照
      pension_p_amt: values.pension_p_amt,
      medical_p_amt: values.medical_p_amt,
      unemployment_p_amt: values.unemployment_p_amt,
      pension_c_amt: values.pension_c_amt,
      medical_c_amt: values.medical_c_amt,
      unemployment_c_amt: values.unemployment_c_amt,
      injury_c_amt: values.injury_c_amt,
      maternity_c_amt: values.maternity_c_amt,
      // 公积金金额快照
      normal_housing_p_amt: values.normal_housing_p_amt,
      normal_housing_c_amt: values.normal_housing_c_amt,
      supp_housing_p_amt: values.supp_housing_p_amt,
      supp_housing_c_amt: values.supp_housing_c_amt,
      // 汇总
      personal_social_total: values.personal_social_total,
      personal_housing_total: values.personal_housing_total,
      personal_total: values.personal_total,
      company_social_total: values.company_social_total,
      company_housing_total: values.company_housing_total,
      company_total: values.company_total,
      // 调整金额
      personal_social_adj: values.personal_social_adj,
      company_social_adj: values.company_social_adj,
      personal_housing_adj: values.personal_housing_adj,
      company_housing_adj: values.company_housing_adj,
      adj_start_month: values.adj_start_month,
      adj_end_month: values.adj_end_month,
      adj_reason: values.adj_reason,
      adj_remark: values.adj_remark,
      data_status: values.data_status,
      remark: values.remark,
      last_calc_time: new Date().toISOString(),
    };
    try {
      if (editing) {
        await api.patch(`/employee_welfare_records?id=eq.${editing.id}`, payload);
        message.success('已更新');
      } else {
        await api.post('/employee_welfare_records', payload);
        message.success('已保存');
      }
      setEditOpen(false);
      loadData();
    } catch (e: any) {
      message.error(e.response?.data?.message || '保存失败');
    }
  };

  const openDetail = (record: any) => {
    setDetailRecord(record);
    setDetailOpen(true);
  };

  // ====== 导出 ======
  const handleExport = (mode: 'template' | 'full' | 'detail') => {
    if (mode === 'template') {
      exportXlsx(EXPORT_DEF, [], period);
    } else if (mode === 'full') {
      exportXlsx(EXPORT_DEF, records, period);
    } else {
      // 详情导出：抽屉里的所有数据
      exportXlsx(DETAIL_EXPORT_DEF, records, period);
    }
  };

  // ====== 导入（增量：有唯一值→更新，无唯一值→新增） ======
  const handleImport = async (file: File) => {
    try {
      const { data, import_errors } = await importXlsx(EXPORT_DEF, file);
      if (import_errors.length > 0) message.warning(`有 ${import_errors.length} 行数据存在问题`);
      if (data.length === 0) { message.info('未找到有效数据'); return; }

      let added = 0, updated = 0, failed = 0;
      const failReasons: string[] = [];
      setImportProgress({ done: 0, total: data.length, importing: true });

      for (const row of data) {
        try {
          if (!row.unique_hash) {
            failed++;
            failReasons.push('缺唯一值（该行可能是新增员工，请先在花名册添加）');
            continue;
          }
          const existing = await api.get(`/employee_welfare_records?unique_hash=eq.${row.unique_hash}&period=eq.${period}`);
          // 剔除展示字段（姓名/公司/部门不属于数据库表，仅供导出查看）
          const { employee_name, pay_company, department, ...dbRow } = row;
          const payload = {
            ...dbRow,
            period,
            supp_enabled: String(row.supp_enabled).toLowerCase() === 'true' || row.supp_enabled === '是' || row.supp_enabled === 1,
          };
          if (existing.data.length > 0) {
            await api.patch(`/employee_welfare_records?id=eq.${existing.data[0].id}`, payload);
            updated++;
          } else {
            await api.post('/employee_welfare_records', payload);
            added++;
          }
        } catch {
          failed++;
        }
        setImportProgress((p) => ({ ...p, done: p.done + 1 }));
      }
      message.info(`导入完成：新增 ${added}，更新 ${updated}，失败 ${failed}${failReasons.length ? '。' + failReasons.slice(0, 5).join('；') : ''}`);
      loadData();
    } catch (e: any) {
      message.error(e.message || '导入失败');
    } finally {
      setImportProgress({ done: 0, total: 0, importing: false });
    }
  };

  const statusTag = (s: string) => {
    const color = s === '正常' ? 'green' : 'orange';
    return <Tag color={color}>{s}</Tag>;
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
    { title: withSource('生效日期', '导入'), dataIndex: 'effective_month', key: 'em', width: 100, render: (v: string) => v || '—' },
    { title: withSource('结束日期', '导入'), dataIndex: 'expiry_month', key: 'xm', width: 100, render: (v: string) => v || '—' },
    { title: withSource('社保福利套', '导入'), dataIndex: 'social_welfare_code', key: 'sw', width: 120 },
    { title: withSource('公积金福利套', '导入'), dataIndex: 'housing_fund_code', key: 'hw', width: 120 },
    { title: withSource('社保状态', '系统计算'), dataIndex: 'social_status', key: 'ss', width: 90, render: (v: string) => <Tag color={v === '参保' ? 'green' : 'red'}>{v}</Tag> },
    { title: withSource('公积金状态', '系统计算'), dataIndex: 'housing_status', key: 'hs', width: 90, render: (v: string) => <Tag color={v === '缴存' ? 'green' : 'red'}>{v}</Tag> },
    { title: withSource('社保基数', '导入'), dataIndex: 'social_base', key: 'sb', width: 100, render: (v: any) => v ? `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—' },
    { title: withSource('公积金基数', '导入'), dataIndex: 'housing_base', key: 'hb', width: 100, render: (v: any) => v ? `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—' },
    { title: withSource('个人社保本月', '系统计算'), dataIndex: 'personal_social_total', key: 'psm', width: 110, render: (v: any) => fmtMoney(v) },
    { title: withSource('公司社保本月', '系统计算'), dataIndex: 'company_social_total', key: 'csm', width: 110, render: (v: any) => fmtMoney(v) },
    { title: withSource('个人社保调整金额', '导入'), dataIndex: 'personal_social_adj', key: 'psa', width: 130, render: (v: any) => fmtMoney(v) },
    { title: withSource('公司社保调整金额', '导入'), dataIndex: 'company_social_adj', key: 'csa', width: 130, render: (v: any) => fmtMoney(v) },
    { title: withSource('个人社保合计(含调整)', '系统计算'), dataIndex: 'personal_social_with_adj', key: 'pswa', width: 150, render: (v: any) => <strong>{fmtMoney(v)}</strong> },
    { title: withSource('公司社保合计(含调整)', '系统计算'), dataIndex: 'company_social_with_adj', key: 'cswa', width: 150, render: (v: any) => <strong>{fmtMoney(v)}</strong> },
    { title: withSource('个人公积金调整金额', '导入'), dataIndex: 'personal_housing_adj', key: 'pha', width: 140, render: (v: any) => fmtMoney(v) },
    { title: withSource('公司公积金调整金额', '导入'), dataIndex: 'company_housing_adj', key: 'cha', width: 140, render: (v: any) => fmtMoney(v) },
    { title: withSource('个人公积金合计(含调整)', '系统计算'), dataIndex: 'personal_housing_with_adj', key: 'phwa', width: 150, render: (v: any) => <strong>{fmtMoney(v)}</strong> },
    { title: withSource('公司公积金合计(含调整)', '系统计算'), dataIndex: 'company_housing_with_adj', key: 'chwa', width: 150, render: (v: any) => <strong>{fmtMoney(v)}</strong> },
    { title: withSource('个人福利合计', '系统计算'), key: 'ptwa', width: 120,
      render: (_: any, r: any) => <strong>{fmtMoney(Number((r.personal_social_with_adj || 0) + (r.personal_housing_with_adj || 0)).toFixed(2))}</strong> },
    { title: withSource('公司福利合计', '系统计算'), key: 'ctwa', width: 120,
      render: (_: any, r: any) => <strong>{fmtMoney(Number((r.company_social_with_adj || 0) + (r.company_housing_with_adj || 0)).toFixed(2))}</strong> },
    { title: withSource('数据状态', '系统计算'), dataIndex: 'data_status', key: 'ds', width: 110, render: (v: string) => <DataStatusTag status={v} /> },
    {
      title: '操作', key: 'act', width: 120, fixed: 'right',
      render: (_: any, r: any) => (
        <Space>
          <Button size="small" onClick={() => openDetail(r)}>查看</Button>
          <Button size="small" disabled={locked} onClick={() => openEdit(r)}>编辑</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <CalcProgress {...calcProgress} />
      {importProgress.importing && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Progress percent={Math.round((importProgress.done / (importProgress.total || 1)) * 100)} status="active" />
          <div style={{ textAlign: 'center', color: '#888', marginTop: 4 }}>
            正在导入，已处理 {importProgress.done} / {importProgress.total} 条
          </div>
        </Card>
      )}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} disabled={locked} onClick={openCreate}>添加记录</Button>
          <Button type="primary" icon={<CalculatorOutlined />} disabled={locked} onClick={handleBatchCalc}>一键计算</Button>
          <Dropdown menu={{
            items: [
              { key: 'template', label: '导出空白模板' },
              { key: 'full', label: '导出报表' },
              { key: 'detail', label: '导出详情' },
            ],
            onClick: ({ key }) => handleExport(key as 'template' | 'full' | 'detail'),
          }}>
            <Button icon={<DownloadOutlined />}>导出</Button>
          </Dropdown>
          <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={(file) => {
            if (locked) { message.warning('该月已冻结，不能导入'); return false; }
            handleImport(file); return false;
          }}>
            <Button icon={<UploadOutlined />} disabled={locked}>导入</Button>
          </Upload>
        </Space>
      </Card>

      {/* 筛选区 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Input placeholder="搜索姓名" prefix={<SearchOutlined />} value={keyword} onChange={e => setKeyword(e.target.value)} style={{ width: 140 }} allowClear />
          <Select placeholder="发薪公司" allowClear showSearch optionFilterProp="label" value={fPayCompany} onChange={setFPayCompany} style={{ width: 150 }}
            options={Object.values(employees).map((e: any) => ({ value: e.pay_company, label: e.pay_company })).filter((v, i, a) => a.findIndex(x => x.value === v.value) === i)} />
          <Select placeholder="部门" allowClear showSearch optionFilterProp="label" value={fDepartment} onChange={setFDepartment} style={{ width: 130 }}
            options={Object.values(employees).map((e: any) => ({ value: e.department, label: e.department })).filter((v, i, a) => v.value && a.findIndex(x => x.value === v.value) === i)} />
          <Select placeholder="社保状态" allowClear value={fSocialStatus} onChange={setFSocialStatus} style={{ width: 110 }}
            options={['参保', '不参保'].map(s => ({ value: s, label: s }))} />
          <Select placeholder="公积金状态" allowClear value={fHousingStatus} onChange={setFHousingStatus} style={{ width: 120 }}
            options={['缴存', '不缴存'].map(s => ({ value: s, label: s }))} />
          <Select placeholder="数据状态" allowClear value={fDataStatus} onChange={setFDataStatus} style={{ width: 140 }}
            options={['正常', '社保基数缺失', '公积金基数缺失', '补充公积金基数缺失', '不缴纳原因缺失', '含调整', '调整原因缺失', '调整期间缺失', '未录入'].map(s => ({ value: s, label: s }))} />
        </Space>
      </Card>

      <div ref={scrollRef} onWheel={onWheel}>
        <Table columns={columns} dataSource={filteredRecords} loading={loading} scroll={{ x: 1800, y: 480 }} size="small" pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: [10, 20, 30, 50, 100], showTotal: t => `共 ${t} 条` }} />
      </div>

      {/* 编辑抽屉 */}
      <Drawer
        title={editing ? '编辑员工福利缴纳' : '添加员工福利缴纳'}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        width={680}
        extra={
          <Space>
            <Button onClick={() => setEditOpen(false)}>取消</Button>
            <Button onClick={handleCalc}>计算</Button>
            <Button type="primary" onClick={handleSave}>保存</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" onValuesChange={onFormChange}>
          <Form.Item name="unique_hash" label="员工" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" placeholder="选择员工"
              options={employees.map((e: any) => ({ value: e.unique_hash, label: `${e.name} — ${e.pay_company}` }))} />
          </Form.Item>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="effective_month" label="生效月份">
              <Input type="month" style={{ width: 180 }} />
            </Form.Item>
            <Form.Item name="expiry_month" label="结束月份">
              <Input type="month" style={{ width: 180 }} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="social_welfare_code" label="社保福利套" rules={[{ required: true }]}>
              <Select style={{ width: 220 }} options={socialSets.map(s => ({ value: s.code, label: `${s.code} ${s.name}` }))} />
            </Form.Item>
            <Form.Item name="housing_fund_code" label="公积金福利套" rules={[{ required: true }]}>
              <Select style={{ width: 220 }} options={housingSets.map(h => ({ value: h.code, label: `${h.code} ${h.name}` }))} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="social_base" label="社保基数">
              <InputNumber style={{ width: 180 }} min={0} />
            </Form.Item>
            <Form.Item name="housing_base" label="公积金基数">
              <InputNumber style={{ width: 180 }} min={0} />
            </Form.Item>
          </Space>
          <Form.Item name="supp_enabled" label="是否缴纳补充公积金" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="supp_base" label="补充公积金基数">
            <InputNumber style={{ width: 180 }} min={0} />
          </Form.Item>

          {/* 不缴纳原因 */}
          {formValues.social_welfare_code === 'SI-00' && (
            <Form.Item name="social_no_reason" label="社保不缴纳原因" rules={[{ required: true }]}>
              <Select options={SOCIAL_NO_REASONS.map(r => ({ value: r, label: r }))} />
            </Form.Item>
          )}
          {formValues.housing_fund_code === 'HF-00' && (
            <Form.Item name="housing_no_reason" label="公积金不缴纳原因" rules={[{ required: true }]}>
              <Select options={HOUSING_NO_REASONS.map(r => ({ value: r, label: r }))} />
            </Form.Item>
          )}

          {/* 调整金额 */}
          <Card title="调整金额（手工导入，非0需填原因和期间）" size="small" style={{ marginBottom: 12 }}>
            <Space style={{ width: '100%' }} size="large">
              <Form.Item name="personal_social_adj" label="个人社保调整">
                <InputNumber style={{ width: 140 }} />
              </Form.Item>
              <Form.Item name="company_social_adj" label="公司社保调整">
                <InputNumber style={{ width: 140 }} />
              </Form.Item>
            </Space>
            <Space style={{ width: '100%' }} size="large">
              <Form.Item name="personal_housing_adj" label="个人公积金调整">
                <InputNumber style={{ width: 140 }} />
              </Form.Item>
              <Form.Item name="company_housing_adj" label="公司公积金调整">
                <InputNumber style={{ width: 140 }} />
              </Form.Item>
            </Space>
            <Space style={{ width: '100%' }} size="large">
              <Form.Item name="adj_start_month" label="调整开始月份">
                <Input type="month" style={{ width: 150 }} />
              </Form.Item>
              <Form.Item name="adj_end_month" label="调整结束月份">
                <Input type="month" style={{ width: 150 }} />
              </Form.Item>
            </Space>
            <Form.Item name="adj_reason" label="调整原因">
              <Input placeholder="如：七月、八月社保公积金基数调整" />
            </Form.Item>
            <Form.Item name="adj_remark" label="备注">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Card>

          {/* 计算结果展示 */}
          {formValues.personal_total !== undefined && (
            <Card title="计算结果（含调整）" size="small" style={{ background: '#fafafa' }}>
              <Descriptions column={2} size="small">
                <Descriptions.Item label="个人社保本月">{fmtMoney(formValues.personal_social_total)}</Descriptions.Item>
                <Descriptions.Item label="个人公积金本月">{fmtMoney(formValues.personal_housing_total)}</Descriptions.Item>
                <Descriptions.Item label="个人社保调整">{fmtMoney(formValues.personal_social_adj)}</Descriptions.Item>
                <Descriptions.Item label="个人公积金调整">{fmtMoney(formValues.personal_housing_adj)}</Descriptions.Item>
                <Descriptions.Item label="个人合计(含调整)"><strong>{fmtMoney(formValues.personal_total_with_adj)}</strong></Descriptions.Item>
                <Descriptions.Item label="公司社保本月">{fmtMoney(formValues.company_social_total)}</Descriptions.Item>
                <Descriptions.Item label="公司公积金本月">{fmtMoney(formValues.company_housing_total)}</Descriptions.Item>
                <Descriptions.Item label="公司社保调整">{fmtMoney(formValues.company_social_adj)}</Descriptions.Item>
                <Descriptions.Item label="公司公积金调整">{fmtMoney(formValues.company_housing_adj)}</Descriptions.Item>
                <Descriptions.Item label="公司合计(含调整)"><strong>{fmtMoney(formValues.company_total_with_adj)}</strong></Descriptions.Item>
              </Descriptions>
            </Card>
          )}
        </Form>
        {editing && (
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Popconfirm
              title="确认删除该记录？"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={async () => {
                await api.delete(`/employee_welfare_records?id=eq.${editing.id}`);
                message.success('已删除');
                setEditOpen(false);
                loadData();
              }}
            >
              <Button danger size="small">删除该记录</Button>
            </Popconfirm>
          </div>
        )}
      </Drawer>

      {/* 详情抽屉 */}
      <Drawer
        title="员工福利缴纳详情"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={680}
      >
        {detailRecord && (
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="姓名">{detailRecord.employee_name}</Descriptions.Item>
            <Descriptions.Item label="公司">{detailRecord.pay_company}</Descriptions.Item>
            <Descriptions.Item label="社保福利套">{detailRecord.social_welfare_code}</Descriptions.Item>
            <Descriptions.Item label="公积金福利套">{detailRecord.housing_fund_code}</Descriptions.Item>
            <Descriptions.Item label="社保状态">{detailRecord.social_status}</Descriptions.Item>
            <Descriptions.Item label="公积金状态">{detailRecord.housing_status}</Descriptions.Item>
            <Descriptions.Item label="社保基数">{fmtMoney(detailRecord.social_base)}</Descriptions.Item>
            <Descriptions.Item label="公积金基数">{fmtMoney(detailRecord.housing_base)}</Descriptions.Item>
            <Descriptions.Item label="个人养老">{fmtMoney(detailRecord.pension_p_amt)}</Descriptions.Item>
            <Descriptions.Item label="个人医疗">{fmtMoney(detailRecord.medical_p_amt)}</Descriptions.Item>
            <Descriptions.Item label="个人失业">{fmtMoney(detailRecord.unemployment_p_amt)}</Descriptions.Item>
            <Descriptions.Item label="公司养老">{fmtMoney(detailRecord.pension_c_amt)}</Descriptions.Item>
            <Descriptions.Item label="公司医疗">{fmtMoney(detailRecord.medical_c_amt)}</Descriptions.Item>
            <Descriptions.Item label="公司失业">{fmtMoney(detailRecord.unemployment_c_amt)}</Descriptions.Item>
            <Descriptions.Item label="公司工伤">{fmtMoney(detailRecord.injury_c_amt)}</Descriptions.Item>
            <Descriptions.Item label="公司生育">{fmtMoney(detailRecord.maternity_c_amt)}</Descriptions.Item>
            <Descriptions.Item label="正常公积金个人">{fmtMoney(detailRecord.normal_housing_p_amt)}</Descriptions.Item>
            <Descriptions.Item label="正常公积金公司">{fmtMoney(detailRecord.normal_housing_c_amt)}</Descriptions.Item>
            <Descriptions.Item label="补充公积金个人">{fmtMoney(detailRecord.supp_housing_p_amt)}</Descriptions.Item>
            <Descriptions.Item label="补充公积金公司">{fmtMoney(detailRecord.supp_housing_c_amt)}</Descriptions.Item>
            <Descriptions.Item label="个人合计"><strong>{fmtMoney(detailRecord.personal_total)}</strong></Descriptions.Item>
            <Descriptions.Item label="公司合计"><strong>{fmtMoney(detailRecord.company_total)}</strong></Descriptions.Item>

            {/* 调整金额 */}
            <Descriptions.Item label="个人社保调整">{fmtMoney(detailRecord.personal_social_adj)}</Descriptions.Item>
            <Descriptions.Item label="公司社保调整">{fmtMoney(detailRecord.company_social_adj)}</Descriptions.Item>
            <Descriptions.Item label="个人公积金调整">{fmtMoney(detailRecord.personal_housing_adj)}</Descriptions.Item>
            <Descriptions.Item label="公司公积金调整">{fmtMoney(detailRecord.company_housing_adj)}</Descriptions.Item>
            <Descriptions.Item label="社保调整金额">{fmtMoney(detailRecord.social_adj_total)}</Descriptions.Item>
            <Descriptions.Item label="公积金调整金额">{fmtMoney(detailRecord.housing_adj_total)}</Descriptions.Item>
            <Descriptions.Item label="调整期间">{detailRecord.adj_start_month || '—'} 至 {detailRecord.adj_end_month || '—'}</Descriptions.Item>
            <Descriptions.Item label="调整原因">{detailRecord.adj_reason || '—'}</Descriptions.Item>
            <Descriptions.Item label="个人合计(含调整)"><strong>{fmtMoney(detailRecord.personal_total_with_adj)}</strong></Descriptions.Item>
            <Descriptions.Item label="公司合计(含调整)"><strong>{fmtMoney(detailRecord.company_total_with_adj)}</strong></Descriptions.Item>
            <Descriptions.Item label="数据状态" span={2}>{statusTag(detailRecord.data_status)}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
};

export default EmployeeWelfare;
