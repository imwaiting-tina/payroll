import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, message, Descriptions, Button, Space, InputNumber, Select, Input, Popconfirm } from 'antd';
import { SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../../api/client';
import { DEFAULT_ATTENDANCE_RULES, type SickPayTier, type OvertimeRate } from '../../utils/attendanceCalc';

/**
 * 考勤规则配置页面
 * 真正驱动考勤计算引擎的规则来源（attendance_rules 表）。
 * 这里改动的病假分档、计薪天数、加班倍数会被「考勤管理」自动计算实际采用。
 */

const PAY_DAYS_DEFAULT = [21.75, 26, 30];
const OVERTIME_TYPES = ['平时加班', '周末加班', '法定节假日加班', '保安法定加班'];

const AttendanceRulesPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 规则状态（编辑用）
  const [sickLt6m, setSickLt6m] = useState<SickPayTier[]>(DEFAULT_ATTENDANCE_RULES.sick_lt_6m);
  const [sickGte6m, setSickGte6m] = useState<SickPayTier[]>(DEFAULT_ATTENDANCE_RULES.sick_gte_6m);
  const [payDays, setPayDays] = useState<string>(DEFAULT_ATTENDANCE_RULES.pay_days_options.join(','));
  const [overtimeRates, setOvertimeRates] = useState<OvertimeRate[]>(DEFAULT_ATTENDANCE_RULES.overtime_rates);

  // 数据库原始行（对照表）
  const [dbRows, setDbRows] = useState<any[]>([]);

  useEffect(() => { loadRules(); }, []);

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await api.get('/attendance_rules?select=*');
      const rows = res.data || [];
      setDbRows(rows.map((r: any) => ({ ...r, key: r.id })));

      // 用数据库里的值初始化表单（缺项回退默认）
      const byKey: Record<string, any> = {};
      rows.forEach((r: any) => { if (r?.rule_key) byKey[r.rule_key] = r; });

      const parse = (v: any): any => {
        if (v == null) return null;
        if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
        return v;
      };

      const lt = parse(byKey['sick_lt_6m']?.rule_value);
      if (Array.isArray(lt) && lt.length) setSickLt6m(lt.map(normTier));
      const gte = parse(byKey['sick_gte_6m']?.rule_value);
      if (Array.isArray(gte) && gte.length) setSickGte6m(gte.map(normTier));
      const pd = parse(byKey['pay_days_options']?.rule_value);
      if (pd?.options && Array.isArray(pd.options)) setPayDays(pd.options.map((n: any) => Number(n)).join(','));
      const or = parse(byKey['overtime_rates']?.rule_value);
      if (Array.isArray(or) && or.length) {
        setOvertimeRates(or.map((o: any) => ({ type: String(o?.type ?? ''), rate: Number(o?.rate ?? 1) })));
      }
    } catch { message.error('加载规则失败'); }
    finally { setLoading(false); }
  };

  const normTier = (t: any): SickPayTier => ({
    min_years: Number(t?.min_years ?? 0),
    max_years: t?.max_years == null ? null : Number(t.max_years),
    pay_rate: Number(t?.pay_rate ?? 0),
  });

  const normRate = (o: any): OvertimeRate => ({ type: String(o?.type ?? ''), rate: Number(o?.rate ?? 1) });

  // 更新某一行分档
  const setTier = (list: SickPayTier[], setter: (v: SickPayTier[]) => void, idx: number, patch: Partial<SickPayTier>) => {
    setter(list.map((t, i) => i === idx ? { ...t, ...patch } : t));
  };

  // 写回 attendance_rules 表（有则更新，无则新增）
  const upsertRule = async (ruleKey: string, ruleName: string, ruleValue: any) => {
    const existing = await api.get(`/attendance_rules?rule_key=eq.${ruleKey}`);
    const body = { rule_key: ruleKey, rule_name: ruleName, rule_value: ruleValue };
    if (existing.data.length > 0) {
      await api.patch(`/attendance_rules?id=eq.${existing.data[0].id}`, body);
    } else {
      await api.post('/attendance_rules', { ...body, rule_type: ruleKey.startsWith('sick') ? 'sick' : ruleKey === 'pay_days_options' ? 'pay_days' : 'overtime' });
    }
  };

  const handleSave = async () => {
    // 校验：分档 min < max，比率 0-1，倍率 > 0
    for (const t of [...sickLt6m, ...sickGte6m]) {
      if (t.max_years != null && t.max_years <= t.min_years) {
        message.warning('病假分档：工龄上限必须大于下限'); return;
      }
      if (t.pay_rate < 0 || t.pay_rate > 1) {
        message.warning('病假支付系数必须在 0 到 1 之间'); return;
      }
    }
    const pdNums = payDays.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
    if (pdNums.length === 0) { message.warning('计薪天数至少填一个'); return; }
    for (const o of overtimeRates) {
      if (o.rate <= 0) { message.warning('加班倍率必须大于 0'); return; }
    }

    setSaving(true);
    try {
      await upsertRule('sick_lt_6m', '连续病假6个月内', sickLt6m);
      await upsertRule('sick_gte_6m', '连续病假超6个月（疾病救济费）', sickGte6m);
      await upsertRule('pay_days_options', '计薪天数', { options: pdNums });
      await upsertRule('overtime_rates', '加班倍数', overtimeRates);
      message.success('规则已保存，考勤自动计算将按新规则执行');
      loadRules();
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSickLt6m(DEFAULT_ATTENDANCE_RULES.sick_lt_6m);
    setSickGte6m(DEFAULT_ATTENDANCE_RULES.sick_gte_6m);
    setPayDays(DEFAULT_ATTENDANCE_RULES.pay_days_options.join(','));
    setOvertimeRates(DEFAULT_ATTENDANCE_RULES.overtime_rates);
    message.info('已恢复默认值，点「保存规则」后生效');
  };

  const tierColumns = (list: SickPayTier[], setter: (v: SickPayTier[]) => void) => [
    {
      title: '工龄下限(年)', key: 'min', width: 130,
      render: (_: any, r: SickPayTier, idx: number) => (
        <InputNumber size="small" min={0} step={1} value={r.min_years}
          onChange={(v) => setTier(list, setter, idx, { min_years: Number(v ?? 0) })} style={{ width: '100%' }} />
      ),
    },
    {
      title: '工龄上限(年)', key: 'max', width: 130,
      render: (_: any, r: SickPayTier, idx: number) => (
        <InputNumber size="small" min={0} step={1} value={r.max_years ?? undefined} placeholder="无上限"
          onChange={(v) => setTier(list, setter, idx, { max_years: v == null ? null : Number(v) })} style={{ width: '100%' }} />
      ),
    },
    {
      title: '支付系数', key: 'rate', width: 130,
      render: (_: any, r: SickPayTier, idx: number) => (
        <InputNumber size="small" min={0} max={1} step={0.05} value={r.pay_rate}
          onChange={(v) => setTier(list, setter, idx, { pay_rate: Number(v ?? 0) })} style={{ width: '100%' }} />
      ),
    },
    {
      title: '支付比例', key: 'pct', width: 90,
      render: (_: any, r: SickPayTier) => <Tag color="blue">{(r.pay_rate * 100).toFixed(0)}%</Tag>,
    },
    {
      title: '操作', key: 'act', width: 70,
      render: (_: any, __: SickPayTier, idx: number) => (
        <Button size="small" danger onClick={() => setter(list.filter((_, i) => i !== idx))}>删除</Button>
      ),
    },
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>保存规则</Button>
          <Button icon={<ReloadOutlined />} onClick={loadRules}>重新加载</Button>
          <Popconfirm title="恢复默认值？" onConfirm={handleReset}>
            <Button>恢复默认</Button>
          </Popconfirm>
          <span style={{ color: '#888' }}>保存后，「考勤管理」的自动计算会按这里的规则执行。</span>
        </Space>
      </Card>

      <Card size="small" title="连续病假 6 个月内（疾病休假工资）" style={{ marginBottom: 12 }}>
        <Table
          size="small"
          pagination={false}
          dataSource={sickLt6m.map((t, i) => ({ ...t, key: i }))}
          columns={tierColumns(sickLt6m, setSickLt6m)}
        />
        <Button size="small" style={{ marginTop: 8 }} onClick={() => setSickLt6m([...sickLt6m, { min_years: 0, max_years: null, pay_rate: 0.6 }])}>
          + 加一档
        </Button>
      </Card>

      <Card size="small" title="连续病假超 6 个月（疾病救济费）" style={{ marginBottom: 12 }}>
        <Table
          size="small"
          pagination={false}
          dataSource={sickGte6m.map((t, i) => ({ ...t, key: i }))}
          columns={tierColumns(sickGte6m, setSickGte6m)}
        />
        <Button size="small" style={{ marginTop: 8 }} onClick={() => setSickGte6m([...sickGte6m, { min_years: 0, max_years: null, pay_rate: 0.6 }])}>
          + 加一档
        </Button>
      </Card>

      <Card size="small" title="计薪天数" style={{ marginBottom: 12 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input value={payDays} onChange={(e) => setPayDays(e.target.value)} placeholder="逗号分隔，如 21.75,26,30" style={{ width: 300 }} />
          <div style={{ color: '#888' }}>用于校验导入/录入的计薪天数，也是日薪 = 考勤工资 ÷ 计薪天数的取值来源。</div>
        </Space>
      </Card>

      <Card size="small" title="加班倍数" style={{ marginBottom: 12 }}>
        <Table
          size="small"
          pagination={false}
          dataSource={overtimeRates.map((o, i) => ({ ...o, key: i }))}
          columns={[
            {
              title: '加班类型', key: 'type', width: 200,
              render: (_: any, r: OvertimeRate, idx: number) => (
                <Select size="small" value={r.type} style={{ width: '100%' }}
                  options={OVERTIME_TYPES.map(t => ({ value: t, label: t }))}
                  onChange={(v) => setOvertimeRates(overtimeRates.map((o, i) => i === idx ? { ...o, type: v } : o))} />
              ),
            },
            {
              title: '倍率', key: 'rate', width: 160,
              render: (_: any, r: OvertimeRate, idx: number) => (
                <InputNumber size="small" min={0.1} step={0.5} value={r.rate}
                  onChange={(v) => setOvertimeRates(overtimeRates.map((o, i) => i === idx ? { ...o, rate: Number(v ?? 1) } : o))} style={{ width: '100%' }} />
              ),
            },
            {
              title: '操作', key: 'act', width: 70,
              render: (_: any, __: OvertimeRate, idx: number) => (
                <Button size="small" danger onClick={() => setOvertimeRates(overtimeRates.filter((_, i) => i !== idx))}>删除</Button>
              ),
            },
          ]}
        />
        <Button size="small" style={{ marginTop: 8 }} onClick={() => setOvertimeRates([...overtimeRates, { type: '平时加班', rate: 1 }])}>
          + 加一种
        </Button>
      </Card>

      <Card size="small" title="数据库原始记录（attendance_rules）">
        <Table
          size="small"
          pagination={false}
          dataSource={dbRows}
          loading={loading}
          columns={[
            { title: '规则标识', dataIndex: 'rule_key', key: 'key', width: 150 },
            { title: '规则名称', dataIndex: 'rule_name', key: 'name', width: 220 },
            { title: '规则内容', dataIndex: 'rule_value', key: 'value',
              render: (v: any) => {
                try {
                  const obj = typeof v === 'string' ? JSON.parse(v) : v;
                  return <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(obj, null, 2)}</pre>;
                } catch { return String(v); }
              } },
          ]}
        />
      </Card>
    </div>
  );
};

export default AttendanceRulesPage;
