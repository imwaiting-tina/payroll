import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Space, message, Card, InputNumber,
  Tabs, Tag, Switch, DatePicker, Upload, Dropdown, Popconfirm, Progress,
} from 'antd';
import { PlusOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import api from '../../api/client';
import type { SocialWelfareSet, HousingFundSet } from '../../types';
import { calcSocial, calcHousingFund } from '../../utils/welfareCalc';
import { exportXlsx, importXlsx, type ExportDef } from '../../utils/importExport';
import { withSource } from '../../components/SourceTag';
import dayjs from 'dayjs';

const REGIONS = ['上海', '北京', '天津', '深圳', '南京', '香港'];
const ROUND_OPTIONS = [
  { value: 'ROUND', label: '四舍五入' },
  { value: 'ROUNDUP', label: '向上取整' },
  { value: 'ROUNDDOWN', label: '向下取整' },
  { value: 'TRUNC_UP', label: '截位后进位' },
];
const PRECISION_OPTIONS = [0, 1, 2].map(p => ({ value: p, label: `${p} 位` }));

const rateInput = (step = 0.0001) => ({ step, min: 0, max: 1, style: { width: 110 } });

// 金额格式化：固定两位小数
const fmtMoney = (v: any) => {
  if (v === undefined || v === null || v === '' || Number(v) === 0) return '—';
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// 社保福利套导出表头
const SOCIAL_EXPORT_DEF: ExportDef = {
  module: '社保福利套',
  columns: [
    { key: 'code', label: '福利套编码', required: true },
    { key: 'name', label: '福利套名称', required: true },
    { key: 'region', label: '地区' },
    { key: 'status', label: '状态' },
    { key: 'base_min', label: '社保基数下限' },
    { key: 'base_max', label: '社保基数上限' },
    { key: 'pension_enabled', label: '养老缴纳开关' },
    { key: 'medical_enabled', label: '医疗缴纳开关' },
    { key: 'unemployment_enabled', label: '失业缴纳开关' },
    { key: 'injury_enabled', label: '工伤缴纳开关' },
    { key: 'maternity_enabled', label: '生育缴纳开关' },
    { key: 'pension_base_min', label: '养老最低基数' },
    { key: 'medical_base_min', label: '医疗最低基数' },
    { key: 'unemployment_base_min', label: '失业最低基数' },
    { key: 'injury_base_min', label: '工伤最低基数' },
    { key: 'maternity_base_min', label: '生育最低基数' },
    { key: 'pension_rate_p', label: '个人养老比例' },
    { key: 'medical_rate_p', label: '个人医疗比例' },
    { key: 'medical_fixed_p', label: '个人医疗固定附加' },
    { key: 'unemployment_rate_p', label: '个人失业比例' },
    { key: 'pension_rate_c', label: '公司养老比例' },
    { key: 'medical_rate_c', label: '公司医疗比例' },
    { key: 'unemployment_rate_c', label: '公司失业比例' },
    { key: 'injury_rate_c', label: '公司工伤比例' },
    { key: 'maternity_rate_c', label: '公司生育比例' },
    { key: 'rounding_method', label: '取整方式' },
    { key: 'rounding_precision', label: '保留精度' },
  ],
};

// 公积金福利套导出表头
const HOUSING_EXPORT_DEF: ExportDef = {
  module: '公积金福利套',
  columns: [
    { key: 'code', label: '福利套编码', required: true },
    { key: 'name', label: '福利套名称', required: true },
    { key: 'region', label: '地区' },
    { key: 'status', label: '状态' },
    { key: 'base_min', label: '公积金基数下限' },
    { key: 'base_max', label: '公积金基数上限' },
    { key: 'normal_rate_p', label: '个人正常比例' },
    { key: 'normal_rate_c', label: '公司正常比例' },
    { key: 'supp_enabled', label: '是否启用补充公积金' },
    { key: 'supp_rate_p', label: '个人补充比例' },
    { key: 'supp_rate_c', label: '公司补充比例' },
    { key: 'normal_round_method', label: '正常取整方式' },
    { key: 'normal_round_precision', label: '正常保留精度' },
    { key: 'supp_round_method', label: '补充取整方式' },
    { key: 'supp_round_precision', label: '补充保留精度' },
  ],
};

const WelfareSetPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('social');
  const [socialSets, setSocialSets] = useState<SocialWelfareSet[]>([]);
  const [housingSets, setHousingSets] = useState<HousingFundSet[]>([]);
  const [loading, setLoading] = useState(false);
  // 导入进度
  const [importProgress, setImportProgress] = useState<{ done: number; total: number; importing: boolean }>({ done: 0, total: 0, importing: false });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sRes, hRes] = await Promise.all([
        api.get('/social_welfare_sets?select=*&order=code'),
        api.get('/housing_fund_sets?select=*&order=code'),
      ]);
      setSocialSets(sRes.data.map((s: any) => ({ ...s, key: s.id })));
      setHousingSets(hRes.data.map((h: any) => ({ ...h, key: h.id })));
    } catch { message.error('加载福利套失败'); }
    finally { setLoading(false); }
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      status: '启用',
      pension_enabled: true, medical_enabled: true, unemployment_enabled: true,
      injury_enabled: true, maternity_enabled: true,
      rounding_method: 'ROUND', rounding_precision: 2,
      supp_enabled: false, normal_round_method: 'ROUND', normal_round_precision: 2,
      supp_round_method: 'ROUND', supp_round_precision: 2,
      supp_base_source: '同正常公积金基数',
    });
    setModalOpen(true);
  };

  const openEdit = (record: any) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      effective_date: record.effective_date ? dayjs(record.effective_date) : undefined,
      expiry_date: record.expiry_date ? dayjs(record.expiry_date) : undefined,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const table = activeTab === 'social' ? 'social_welfare_sets' : 'housing_fund_sets';
    try {
      if (editing) {
        if (editing.is_builtin) {
          message.error(`${editing.code} 为系统内置福利套，不允许修改`);
          return;
        }
        await api.patch(`/${table}?id=eq.${editing.id}`, values);
        message.success('已更新');
      } else {
        await api.post(`/${table}`, values);
        message.success('已创建');
      }
      setModalOpen(false);
      loadData();
    } catch (e: any) {
      message.error(e.response?.data?.message || '操作失败');
    }
  };

  // ====== 试算 ======
  const [previewBase, setPreviewBase] = useState<number>(7460);
  const [previewResult, setPreviewResult] = useState<any>(null);

  // ====== 导出 ======
  const handleExport = (mode: 'template' | 'full') => {
    const def = activeTab === 'social' ? SOCIAL_EXPORT_DEF : HOUSING_EXPORT_DEF;
    const data = activeTab === 'social' ? socialSets : housingSets;
    if (mode === 'template') {
      exportXlsx(def, []);
    } else {
      exportXlsx(def, data);
    }
  };

  // ====== 导入 ======
  const handleImport = async (file: File) => {
    const def = activeTab === 'social' ? SOCIAL_EXPORT_DEF : HOUSING_EXPORT_DEF;
    const table = activeTab === 'social' ? 'social_welfare_sets' : 'housing_fund_sets';
    try {
      const { data, import_errors } = await importXlsx(def, file);
      if (import_errors.length > 0) message.warning(`有 ${import_errors.length} 行数据存在问题`);
      if (data.length === 0) { message.info('未找到有效数据'); return; }

      let added = 0, updated = 0, failed = 0;
      const failReasons: string[] = [];
      setImportProgress({ done: 0, total: data.length, importing: true });

      for (const row of data) {
        try {
          // 内置福利套保护
          if (row.code === 'SI-00' || row.code === 'HF-00') {
            failed++;
            failReasons.push(`${row.code} 为系统内置福利套，不允许导入修改`);
            continue;
          }
          const existing = await api.get(`/${table}?code=eq.${row.code}`);
          // 布尔字段转换
          const boolFields = ['pension_enabled', 'medical_enabled', 'unemployment_enabled', 'injury_enabled', 'maternity_enabled', 'supp_enabled', 'allow_special_base', 'allow_stop_supp', 'allow_override_round'];
          const payload: any = { ...row };
          for (const f of boolFields) {
            if (payload[f] !== undefined) {
              const v = String(payload[f]).trim().toLowerCase();
              payload[f] = v === 'true' || v === '是' || v === '1' || v === '启用' || v === 'yes';
            }
          }
          if (existing.data.length > 0) {
            await api.patch(`/${table}?id=eq.${existing.data[0].id}`, payload);
            updated++;
          } else {
            await api.post(`/${table}`, payload);
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

  const runPreview = () => {
    try {
      if (activeTab === 'social') {
        const s = form.getFieldsValue(true);
        const result = calcSocial(s as any, previewBase);
        setPreviewResult(result);
      } else {
        const h = form.getFieldsValue(true);
        const result = calcHousingFund(h as any, previewBase);
        setPreviewResult(result);
      }
    } catch {
      message.warning('请先填写完整规则再试算');
    }
  };

  // ====== 社保列表列 ======
  const socialColumns: any[] = [
    { title: withSource('编码', '导入'), dataIndex: 'code', key: 'code', width: 100 },
    { title: withSource('名称', '导入'), dataIndex: 'name', key: 'name', width: 130 },
    { title: '来源', dataIndex: 'is_builtin', key: 'src', width: 80, render: (v: boolean) => v ? <Tag color="blue">内置</Tag> : <Tag>自定义</Tag> },
    { title: withSource('地区', '导入'), dataIndex: 'region', key: 'region', width: 70 },
    { title: withSource('个人费率', '导入'), key: 'pr', width: 180, render: (_: any, r: SocialWelfareSet) =>
      `${(r.pension_rate_p * 100).toFixed(1)}% / ${(r.medical_rate_p * 100).toFixed(1)}% / ${(r.unemployment_rate_p * 100).toFixed(1)}%` },
    { title: withSource('公司费率', '导入'), key: 'cr', width: 200, render: (_: any, r: SocialWelfareSet) =>
      `${(r.pension_rate_c * 100).toFixed(1)}% / ${(r.medical_rate_c * 100).toFixed(1)}% / ${(r.unemployment_rate_c * 100).toFixed(1)}% / ${(r.injury_rate_c * 100).toFixed(1)}% / ${(r.maternity_rate_c * 100).toFixed(1)}%` },
    { title: withSource('状态', '导入'), dataIndex: 'status', key: 'status', width: 70, render: (v: string) => <Tag color={v === '启用' ? 'green' : 'red'}>{v}</Tag> },
    {
      title: '操作', key: 'act', width: 120, fixed: 'right' as const,
      render: (_: any, r: SocialWelfareSet) => (
        <Space>
          <Button size="small" onClick={() => openEdit(r)}>{r.is_builtin ? '查看' : '编辑'}</Button>
          {!r.is_builtin && <Button size="small" danger onClick={async () => {
            await api.delete(`/social_welfare_sets?id=eq.${r.id}`);
            message.success('已删除'); loadData();
          }}>删除</Button>}
        </Space>
      ),
    },
  ];

  // ====== 公积金列表列 ======
  const housingColumns: any[] = [
    { title: withSource('编码', '导入'), dataIndex: 'code', key: 'code', width: 100 },
    { title: withSource('名称', '导入'), dataIndex: 'name', key: 'name', width: 130 },
    { title: '来源', dataIndex: 'is_builtin', key: 'src', width: 80, render: (v: boolean) => v ? <Tag color="blue">内置</Tag> : <Tag>自定义</Tag> },
    { title: withSource('地区', '导入'), dataIndex: 'region', key: 'region', width: 70 },
    { title: withSource('正常比例', '导入'), key: 'nr', width: 120, render: (_: any, r: HousingFundSet) =>
      `个${(r.normal_rate_p * 100).toFixed(1)}% / 司${(r.normal_rate_c * 100).toFixed(1)}%` },
    { title: withSource('补充公积金', '导入'), key: 'sp', width: 100, render: (_: any, r: HousingFundSet) =>
      r.supp_enabled ? `个${(r.supp_rate_p * 100).toFixed(1)}% / 司${(r.supp_rate_c * 100).toFixed(1)}%` : <Tag>未启用</Tag> },
    { title: withSource('状态', '导入'), dataIndex: 'status', key: 'status', width: 70, render: (v: string) => <Tag color={v === '启用' ? 'green' : 'red'}>{v}</Tag> },
    {
      title: '操作', key: 'act', width: 120, fixed: 'right' as const,
      render: (_: any, r: HousingFundSet) => (
        <Space>
          <Button size="small" onClick={() => openEdit(r)}>{r.is_builtin ? '查看' : '编辑'}</Button>
          {!r.is_builtin && <Button size="small" danger onClick={async () => {
            await api.delete(`/housing_fund_sets?id=eq.${r.id}`);
            message.success('已删除'); loadData();
          }}>删除</Button>}
        </Space>
      ),
    },
  ];

  return (
    <div>
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
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建{activeTab === 'social' ? '社保' : '公积金'}福利套
          </Button>
          <Dropdown menu={{
            items: [
              { key: 'template', label: '导出空白模板' },
              { key: 'full', label: '导出全量数据' },
            ],
            onClick: ({ key }) => handleExport(key as 'template' | 'full'),
          }}>
            <Button icon={<DownloadOutlined />}>导出</Button>
          </Dropdown>
          <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={(file) => { handleImport(file); return false; }}>
            <Button icon={<UploadOutlined />}>导入</Button>
          </Upload>
        </Space>
      </Card>

      <Tabs
        activeKey={activeTab}
        onChange={(k) => { setActiveTab(k); setPreviewResult(null); }}
        items={[
          { key: 'social', label: '社保福利套' },
          { key: 'housing', label: '公积金福利套' },
        ]}
      />

      {activeTab === 'social' ? (
        <Table columns={socialColumns} dataSource={socialSets} loading={loading} scroll={{ x: 1200, y: 480 }} size="small" pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: [10, 20, 30, 50, 100], showTotal: t => `共 ${t} 条` }} />
      ) : (
        <Table columns={housingColumns} dataSource={housingSets} loading={loading} scroll={{ x: 1200, y: 480 }} size="small" pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: [10, 20, 30, 50, 100], showTotal: t => `共 ${t} 条` }} />
      )}

      <Modal
        title={(editing ? (editing.is_builtin ? '查看' : '编辑') : '新建') + (activeTab === 'social' ? '社保福利套' : '公积金福利套')}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={900}
        okText={editing?.is_builtin ? '关闭' : '保存'}
        cancelText="取消"
        okButtonProps={{ disabled: editing?.is_builtin }}
        forceRender
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Space style={{ width: '100%' }} size="large" wrap>
            <Form.Item name="code" label="福利套编码" rules={[{ required: true }]}>
              <Input placeholder={activeTab === 'social' ? '如 SI-SH-01' : '如 HF-SH-01'} disabled={!!editing} />
            </Form.Item>
            <Form.Item name="name" label="福利套名称" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="region" label="地区">
              <Select options={REGIONS.map(r => ({ value: r, label: r }))} style={{ width: 110 }} />
            </Form.Item>
            <Form.Item name="status" label="状态">
              <Select options={[{ value: '启用', label: '启用' }, { value: '停用', label: '停用' }]} style={{ width: 90 }} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="effective_date" label="生效日期">
              <DatePicker style={{ width: 150 }} />
            </Form.Item>
            <Form.Item name="expiry_date" label="失效日期">
              <DatePicker style={{ width: 150 }} />
            </Form.Item>
          </Space>

          {activeTab === 'social' ? (
            <>
              <Card title="基数规则" size="small" style={{ marginBottom: 12 }}>
                <Space wrap>
                  <Form.Item name="base_min" label="基数下限"><InputNumber style={{ width: 130 }} min={0} /></Form.Item>
                  <Form.Item name="base_max" label="基数上限"><InputNumber style={{ width: 130 }} min={0} /></Form.Item>
                  <Form.Item name="allow_special_base" label="允许险种特殊基数" valuePropName="checked"><Switch /></Form.Item>
                </Space>
              </Card>
              <Card title="险种缴纳开关" size="small" style={{ marginBottom: 12 }}>
                <Space wrap>
                  <Form.Item name="pension_enabled" label="养老" valuePropName="checked"><Switch /></Form.Item>
                  <Form.Item name="medical_enabled" label="医疗" valuePropName="checked"><Switch /></Form.Item>
                  <Form.Item name="unemployment_enabled" label="失业" valuePropName="checked"><Switch /></Form.Item>
                  <Form.Item name="injury_enabled" label="工伤" valuePropName="checked"><Switch /></Form.Item>
                  <Form.Item name="maternity_enabled" label="生育" valuePropName="checked"><Switch /></Form.Item>
                </Space>
              </Card>
              <Card title="各险种最低基数（个人与公司一致）" size="small" style={{ marginBottom: 12 }}>
                <Space wrap>
                  <Form.Item name="pension_base_min" label="养老最低基数"><InputNumber style={{ width: 140 }} min={0} /></Form.Item>
                  <Form.Item name="medical_base_min" label="医疗最低基数"><InputNumber style={{ width: 140 }} min={0} /></Form.Item>
                  <Form.Item name="unemployment_base_min" label="失业最低基数"><InputNumber style={{ width: 140 }} min={0} /></Form.Item>
                  <Form.Item name="injury_base_min" label="工伤最低基数"><InputNumber style={{ width: 140 }} min={0} /></Form.Item>
                  <Form.Item name="maternity_base_min" label="生育最低基数"><InputNumber style={{ width: 140 }} min={0} /></Form.Item>
                </Space>
              </Card>
              <Card title="个人费率" size="small" style={{ marginBottom: 12 }}>
                <Space wrap>
                  <Form.Item name="pension_rate_p" label="养老"><InputNumber {...rateInput()} /></Form.Item>
                  <Form.Item name="medical_rate_p" label="医疗"><InputNumber {...rateInput()} /></Form.Item>
                  <Form.Item name="medical_fixed_p" label="医疗固定附加"><InputNumber min={0} style={{ width: 110 }} /></Form.Item>
                  <Form.Item name="unemployment_rate_p" label="失业"><InputNumber {...rateInput()} /></Form.Item>
                </Space>
              </Card>
              <Card title="公司费率" size="small" style={{ marginBottom: 12 }}>
                <Space wrap>
                  <Form.Item name="pension_rate_c" label="养老"><InputNumber {...rateInput()} /></Form.Item>
                  <Form.Item name="medical_rate_c" label="医疗"><InputNumber {...rateInput()} /></Form.Item>
                  <Form.Item name="unemployment_rate_c" label="失业"><InputNumber {...rateInput()} /></Form.Item>
                  <Form.Item name="injury_rate_c" label="工伤"><InputNumber {...rateInput()} /></Form.Item>
                  <Form.Item name="maternity_rate_c" label="生育"><InputNumber {...rateInput()} /></Form.Item>
                </Space>
              </Card>
              <Card title="取整规则" size="small" style={{ marginBottom: 12 }}>
                <Space wrap>
                  <Form.Item name="rounding_method" label="取整方式"><Select options={ROUND_OPTIONS} style={{ width: 130 }} /></Form.Item>
                  <Form.Item name="rounding_precision" label="保留精度"><Select options={PRECISION_OPTIONS} style={{ width: 100 }} /></Form.Item>
                  <Form.Item name="allow_override_round" label="允许险种覆盖取整" valuePropName="checked"><Switch /></Form.Item>
                </Space>
              </Card>
            </>
          ) : (
            <>
              <Card title="基数规则" size="small" style={{ marginBottom: 12 }}>
                <Space wrap>
                  <Form.Item name="base_min" label="基数下限"><InputNumber style={{ width: 130 }} min={0} /></Form.Item>
                  <Form.Item name="base_max" label="基数上限"><InputNumber style={{ width: 130 }} min={0} /></Form.Item>
                  <Form.Item name="supp_base_source" label="补充基数来源">
                    <Select options={[{ value: '同正常公积金基数', label: '同正常公积金基数' }, { value: '员工单独填写', label: '员工单独填写' }]} style={{ width: 150 }} />
                  </Form.Item>
                  <Form.Item name="allow_stop_supp" label="允许员工停缴补充" valuePropName="checked"><Switch /></Form.Item>
                </Space>
              </Card>
              <Card title="正常公积金费率" size="small" style={{ marginBottom: 12 }}>
                <Space wrap>
                  <Form.Item name="normal_rate_p" label="个人"><InputNumber {...rateInput()} /></Form.Item>
                  <Form.Item name="normal_rate_c" label="公司"><InputNumber {...rateInput()} /></Form.Item>
                </Space>
              </Card>
              <Card title="补充公积金" size="small" style={{ marginBottom: 12 }}>
                <Space wrap>
                  <Form.Item name="supp_enabled" label="启用补充公积金" valuePropName="checked"><Switch /></Form.Item>
                  <Form.Item name="supp_rate_p" label="个人补充"><InputNumber {...rateInput()} /></Form.Item>
                  <Form.Item name="supp_rate_c" label="公司补充"><InputNumber {...rateInput()} /></Form.Item>
                </Space>
              </Card>
              <Card title="取整规则" size="small" style={{ marginBottom: 12 }}>
                <Space wrap>
                  <Form.Item name="normal_round_method" label="正常取整"><Select options={ROUND_OPTIONS} style={{ width: 130 }} /></Form.Item>
                  <Form.Item name="normal_round_precision" label="正常精度"><Select options={PRECISION_OPTIONS} style={{ width: 100 }} /></Form.Item>
                  <Form.Item name="supp_round_method" label="补充取整"><Select options={ROUND_OPTIONS} style={{ width: 130 }} /></Form.Item>
                  <Form.Item name="supp_round_precision" label="补充精度"><Select options={PRECISION_OPTIONS} style={{ width: 100 }} /></Form.Item>
                </Space>
              </Card>
            </>
          )}

          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>

          {/* 试算预览 */}
          <Card title="试算预览" size="small" style={{ marginBottom: 12, background: '#fafafa' }}>
            <Space style={{ marginBottom: 12 }}>
              <span>试算基数：</span>
              <InputNumber value={previewBase} onChange={(v) => setPreviewBase(Number(v) || 0)} style={{ width: 150 }} min={0} />
              <Button onClick={runPreview}>试算</Button>
            </Space>
            {previewResult && activeTab === 'social' && (
              <div>
                <div>基数：{fmtMoney(previewResult.base)}</div>
                <div>个人：养老 {fmtMoney(previewResult.pension_p)}，医疗 {fmtMoney(previewResult.medical_p)}，失业 {fmtMoney(previewResult.unemployment_p)}，合计 <strong>{fmtMoney(previewResult.personal_total)}</strong></div>
                <div>公司：养老 {fmtMoney(previewResult.pension_c)}，医疗 {fmtMoney(previewResult.medical_c)}，失业 {fmtMoney(previewResult.unemployment_c)}，工伤 {fmtMoney(previewResult.injury_c)}，生育 {fmtMoney(previewResult.maternity_c)}，合计 <strong>{fmtMoney(previewResult.company_total)}</strong></div>
              </div>
            )}
            {previewResult && activeTab === 'housing' && (
              <div>
                <div>正常基数：{fmtMoney(previewResult.normal_base)}</div>
                <div>正常：个人 {fmtMoney(previewResult.normal_p)}，公司 {fmtMoney(previewResult.normal_c)}</div>
                <div>补充：个人 {fmtMoney(previewResult.supp_p)}，公司 {fmtMoney(previewResult.supp_c)}</div>
                <div>个人合计 <strong>{fmtMoney(previewResult.personal_total)}</strong>，公司合计 <strong>{fmtMoney(previewResult.company_total)}</strong></div>
              </div>
            )}
          </Card>
        </Form>
        {editing && !editing.is_builtin && (
          <div style={{ textAlign: 'right' }}>
            <Popconfirm
              title="确认删除该福利套？"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={async () => {
                const table = activeTab === 'social' ? 'social_welfare_sets' : 'housing_fund_sets';
                await api.delete(`/${table}?id=eq.${editing.id}`);
                message.success('已删除');
                setModalOpen(false);
                loadData();
              }}
            >
              <Button danger size="small">删除该福利套</Button>
            </Popconfirm>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default WelfareSetPage;
