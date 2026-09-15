import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Col, Row, Table, Tabs, Input, Select, Alert, Segmented, Tag } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import * as echarts from 'echarts';
import { ATTENDANCE_HISTORY } from './attendanceHistoryData';

/**
 * 历史考勤数据总览（2021.03–2026.05）
 * 数据来源于 Kimi 看板「考勤数据」板块的 6 个 tag，静态数据 + 按系统配色重绘。
 */

const D: any = ATTENDANCE_HISTORY;

// ===== 系统配色（与 Dashboard 保持一致） =====
const INK = '#1f2937';
const INK_SUB = '#6b7280';
const BORDER = '#e6e9ef';
// 用户指定配色：蓝系主色 + 橙色强调 + 红色负向 + 中性灰
const PRIMARY = '#1B3A5C';   // 主色：迟到折线、出勤率线
const SECONDARY = '#2F6A9E'; // 辅色：次要系列、加班柱
const LIGHT = '#7BA5C6';     // 浅调：加班时长、已通过项
const ACCENT = '#C0703A';    // 强调色：合计虚线、峰值标注
const NEGATIVE = '#A6452F';  // 负向指标：迟到、缺卡未补卡
const GRAY = '#8A94A0';      // 中性灰：参考线、非重点系列

// 兼容旧槽位，映射到用户配色
const GREEN = LIGHT;    // 已通过项 → 浅调
const RED = NEGATIVE;   // 未补卡/负向 → 负向
const GOLD = ACCENT;    // 合计虚线 → 强调色
const PALETTE = [PRIMARY, PRIMARY, SECONDARY, LIGHT, ACCENT, NEGATIVE, GRAY, '#8E7A9E', '#5B8E8E', '#7A9B6E'];

const LEAVES = ['年假', '调休', '事假', '病假', '婚假', '丧假', '产假', '陪产假', '育儿假'];
const LCOLOR: Record<string, string> = {
  年假: PRIMARY, 调休: SECONDARY, 事假: LIGHT, 病假: NEGATIVE, 婚假: ACCENT,
  丧假: GRAY, 产假: '#8E7A9E', 陪产假: '#5B8E8E', 育儿假: '#7A9B6E',
};

const cardStyle: React.CSSProperties = {
  borderRadius: 12,
  boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 4px 12px rgba(16,24,40,0.04)',
  border: `1px solid ${BORDER}`,
};

const baseTip = {
  trigger: 'axis' as const,
  backgroundColor: 'rgba(23,32,46,0.92)',
  borderWidth: 0,
  textStyle: { color: '#fff', fontSize: 12 },
};
const axStyle = {
  axisLine: { lineStyle: { color: BORDER } },
  axisTick: { show: false },
  axisLabel: { color: INK_SUB, fontSize: 11 },
  splitLine: { lineStyle: { color: '#eceff3', type: 'dashed' as const } },
};

const sum = (a: any[]) => a.reduce((x: number, y: any) => x + (Number(y) || 0), 0);
const fmtNum = (v: any) => (v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('zh-CN'));
const fmtPct = (v: any) => (v === null || v === undefined ? '—' : `${(Number(v) * 100).toFixed(1)}%`);

/** ECharts 容器：挂载即渲染，容器尺寸变化时自动 resize（处理 Tab 懒渲染/窗口缩放） */
const ChartBox: React.FC<{ option: any; height?: number }> = ({ option, height = 300 }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = echarts.getInstanceByDom(el) || echarts.init(el);
    chart.setOption(option);
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => { ro.disconnect(); chart.dispose(); };
  }, [option]);
  return <div ref={ref} style={{ width: '100%', height }} />;
};

/** 指标卡（商务化） */
const Kpi: React.FC<{ value: React.ReactNode; unit?: string; label: string; color?: string }> = ({ value, unit, label, color }) => (
  <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', border: `1px solid ${BORDER}`, boxShadow: '0 1px 2px rgba(16,24,40,0.04)', height: '100%' }}>
    <div style={{ fontSize: 20, fontWeight: 700, color: color || INK, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {value}{unit && <span style={{ fontSize: 12, color: '#9aa4b2', fontWeight: 400, marginLeft: 3 }}>{unit}</span>}
    </div>
    <div style={{ fontSize: 12, color: INK_SUB, marginTop: 2 }}>{label}</div>
  </div>
);

const KpiRow: React.FC<{ items: { value: React.ReactNode; unit?: string; label: string; color?: string }[] }> = ({ items }) => (
  <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
    {items.map((k, i) => (
      <Col key={i} xs={12} sm={8} md={8} lg={4}>
        <Kpi {...k} />
      </Col>
    ))}
  </Row>
);

/* ===================== ① 五年总趋势 ===================== */
const Tab1Trend: React.FC = () => {
  const T = D.trend;
  const yearKeys = ['2021', '2022', '2023', '2024', '2025', '2026'];
  const yearLabel: Record<string, string> = { '2021': '2021年3-12月', '2022': '2022年', '2023': '2023年', '2024': '2024年', '2025': '2025年', '2026': '2026年1-5月' };
  const [curYear, setCurYear] = useState('2026');
  const [empQ, setEmpQ] = useState('');

  const xYear = T.years.map((y: any, i: number) => (i === 0 ? '2021.3-12' : i < 5 ? `${y}年` : '2026.1-5'));

  const totLate = sum(T.late);
  const totMiss = sum(T.missTotal);
  const totFix = sum(T.fix);
  const totLeave = sum(Object.values(T.leaves).flat() as any[]);

  const optLate = {
    tooltip: baseTip, grid: { left: 8, right: 24, top: 30, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: xYear, ...axStyle },
    yAxis: { type: 'value', ...axStyle },
    series: [{ type: 'line', data: T.late, smooth: true, symbolSize: 8, lineStyle: { width: 3, color: PALETTE[0] }, itemStyle: { color: PALETTE[0] },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(27,58,92,0.22)' }, { offset: 1, color: 'rgba(27,58,92,0)' }] } },
      label: { show: true, color: PALETTE[0], fontSize: 11 } }],
  };
  const optMiss = {
    tooltip: baseTip, grid: { left: 8, right: 24, top: 40, bottom: 8, containLabel: true },
    legend: { top: 0, right: 0, textStyle: { color: INK_SUB, fontSize: 11 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
    xAxis: { type: 'category', data: xYear, ...axStyle }, yAxis: { type: 'value', ...axStyle },
    series: [
      { name: '缺卡未补卡', type: 'bar', stack: 'm', data: T.miss, itemStyle: { color: RED, borderRadius: [4, 4, 0, 0] }, barWidth: 26 },
      { name: '补卡已通过', type: 'bar', stack: 'm', data: T.fix, itemStyle: { color: GREEN } },
      { name: '缺卡合计', type: 'line', data: T.missTotal, symbolSize: 7, lineStyle: { width: 2.5, color: GOLD, type: 'dashed' }, itemStyle: { color: GOLD }, label: { show: true, color: GOLD, fontSize: 11 } },
    ],
  };
  const optLeave = {
    tooltip: baseTip, grid: { left: 8, right: 16, top: 55, bottom: 8, containLabel: true },
    legend: { top: 0, right: 0, textStyle: { color: INK_SUB, fontSize: 11 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
    xAxis: { type: 'category', data: xYear, ...axStyle }, yAxis: { type: 'value', name: '天', ...axStyle },
    series: LEAVES.map(l => ({ name: l, type: 'bar', stack: 'lv', data: T.leaves[l], itemStyle: { color: LCOLOR[l] }, barWidth: 30 })),
  };
  const optRate = {
    tooltip: baseTip, grid: { left: 8, right: 50, top: 40, bottom: 8, containLabel: true },
    legend: { top: 0, right: 0, textStyle: { color: INK_SUB, fontSize: 11 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
    xAxis: { type: 'category', data: xYear, ...axStyle },
    yAxis: [{ type: 'value', name: '%', min: 90, max: 100, ...axStyle }, { type: 'value', name: '小时', ...axStyle, splitLine: { show: false } }],
    series: [
      { name: '平均出勤率', type: 'line', data: T.rate, symbolSize: 8, lineStyle: { width: 3, color: PALETTE[1] }, itemStyle: { color: PALETTE[1] }, label: { show: true, formatter: '{c}%', color: PALETTE[1], fontSize: 11 } },
      { name: '加班总时长', type: 'bar', yAxisIndex: 1, data: T.ot, itemStyle: { color: SECONDARY, borderRadius: [4, 4, 0, 0] }, barWidth: 24 },
    ],
  };

  // 按年份查看明细
  const i = yearKeys.indexOf(curYear);
  const rows = D.empYears[curYear] || [];
  const lvs = LEAVES.map(l => Math.round((T.leaves[l][i] || 0) * 10) / 10);
  const lvsSum = Math.round(lvs.reduce((a, b) => a + b, 0) * 10) / 10;

  const optYearLeave = {
    tooltip: baseTip, grid: { left: 8, right: 40, top: 10, bottom: 8, containLabel: true },
    xAxis: { type: 'value', ...axStyle }, yAxis: { type: 'category', data: LEAVES, inverse: true, ...axStyle },
    series: [{ type: 'bar', data: lvs.map((v, j) => ({ value: v, itemStyle: { color: LCOLOR[LEAVES[j]] } })), barWidth: 16,
      label: { show: true, position: 'right', color: INK_SUB, fontSize: 11 } }],
  };
  const optYearPie = {
    tooltip: { trigger: 'item' as const, backgroundColor: 'rgba(23,32,46,0.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 12 }, formatter: '{b}<br>{c} 天（{d}%）' },
    series: [{ type: 'pie', radius: ['45%', '70%'], center: ['50%', '52%'],
      data: LEAVES.map((l, j) => ({ name: l, value: lvs[j], itemStyle: { color: LCOLOR[l] } })).filter(d => d.value > 0),
      label: { color: INK_SUB, fontSize: 11 }, itemStyle: { borderColor: '#fff', borderWidth: 2 } }],
  };

  const empCols: any[] = [
    { title: '姓名', dataIndex: 'name', width: 84, fixed: 'left' },
    { title: '部门', dataIndex: 'dept', width: 100 },
    { title: '迟到', dataIndex: 'late', width: 60, align: 'right' as const },
    { title: '缺卡', dataIndex: 'miss', width: 60, align: 'right' as const },
    { title: '补卡', dataIndex: 'fix', width: 60, align: 'right' as const },
    { title: '考勤异常/旷工', dataIndex: 'abn', width: 100, align: 'right' as const },
    ...LEAVES.map(l => ({ title: l, dataIndex: l, width: 60, align: 'right' as const })),
    { title: '应出勤', dataIndex: 'should', width: 72, align: 'right' as const },
    { title: '实出勤', dataIndex: 'actual', width: 72, align: 'right' as const },
    { title: '出勤率', dataIndex: 'rate', width: 72, align: 'right' as const, render: fmtPct },
    { title: '加班(h)', dataIndex: 'ot', width: 72, align: 'right' as const },
  ];
  const empRows = useMemo(() => rows
    .filter((r: any) => !empQ || (r.name || '').includes(empQ) || (r.dept || '').includes(empQ))
    .map((r: any, idx: number) => ({ ...r, key: idx })), [rows, empQ]);

  return (
    <div>
      <KpiRow items={[
        { value: totLate, unit: '次', label: '迟到总次数（5年3个月）' },
        { value: totMiss, unit: '次', label: '缺卡总次数（未补+已补）' },
        { value: totFix, unit: '次', label: '其中补卡已通过' },
        { value: Math.round(totLeave * 10) / 10, unit: '天', label: '假期总天数（9类合计）' },
        { value: sum(T.ot), unit: '小时', label: '加班总时长' },
        { value: T.emp[5], unit: '人', label: '2026年在统人数' },
      ]} />
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} xl={12}><Card size="small" title="迟到次数趋势" extra={<span style={{ color: INK_SUB, fontSize: 12 }}>单位：次</span>} style={cardStyle}><ChartBox option={optLate} height={280} /></Card></Col>
        <Col xs={24} xl={12}><Card size="small" title="缺卡趋势（未补卡 + 已补卡）" style={cardStyle}><ChartBox option={optMiss} height={280} /></Card></Col>
        <Col xs={24} xl={12}><Card size="small" title="假期分类趋势（分种类）" extra={<span style={{ color: INK_SUB, fontSize: 12 }}>单位：天</span>} style={cardStyle}><ChartBox option={optLeave} height={300} /></Card></Col>
        <Col xs={24} xl={12}><Card size="small" title="出勤率与加班趋势" style={cardStyle}><ChartBox option={optRate} height={300} /></Card></Col>
      </Row>
      <Card size="small" title="按年份查看明细" style={cardStyle}
        extra={<Segmented size="small" value={curYear} onChange={(v) => setCurYear(v as string)} options={yearKeys.map(y => ({ label: y, value: y }))} />}>
        <KpiRow items={[
          { value: T.emp[i], unit: '人', label: '在统人数' },
          { value: T.late[i], unit: '次', label: '迟到次数' },
          { value: T.missTotal[i], unit: '次', label: `缺卡合计（未补 ${T.miss[i]} + 已补 ${T.fix[i]}）` },
          { value: lvsSum, unit: '天', label: '假期总天数' },
          { value: T.ot[i], unit: '小时', label: '加班时长' },
          { value: `${T.rate[i]}%`, label: '平均出勤率' },
        ]} />
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} md={12}><Card size="small" title={`${yearLabel[curYear]} 假期构成`} style={cardStyle}><ChartBox option={optYearLeave} height={260} /></Card></Col>
          <Col xs={24} md={12}><Card size="small" title={`${yearLabel[curYear]} 假期占比`} style={cardStyle}><ChartBox option={optYearPie} height={260} /></Card></Col>
        </Row>
        <div style={{ marginBottom: 10, color: INK_SUB, fontSize: 13 }}>{yearLabel[curYear]} 员工个人数据（{empRows.length} 人）</div>
        <Input placeholder="搜索姓名 / 部门" prefix={<SearchOutlined />} allowClear value={empQ} onChange={e => setEmpQ(e.target.value)} style={{ width: 220, marginBottom: 10 }} />
        <Table size="small" columns={empCols} dataSource={empRows} pagination={false} scroll={{ x: 1900, y: 380 }} />
      </Card>
    </div>
  );
};

/* ===================== ② 年假调休余额调整 ===================== */
const Tab2Balance: React.FC = () => {
  const B = D.balance, BT = B.total;
  const [balQ, setBalQ] = useState('');
  const [balFilter, setBalFilter] = useState('');

  const reasonOption = (obj: Record<string, number>, color: string) => {
    const es = Object.entries(obj).sort((a, b) => b[1] - a[1]);
    return {
      tooltip: { trigger: 'item' as const, backgroundColor: 'rgba(23,32,46,0.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 12 } },
      grid: { left: 8, right: 40, top: 10, bottom: 8, containLabel: true },
      xAxis: { type: 'value', ...axStyle },
      yAxis: { type: 'category', inverse: true, data: es.map(e => e[0]), ...axStyle, axisLabel: { ...axStyle.axisLabel, width: 170, overflow: 'break' } },
      series: [{ type: 'bar', data: es.map(e => e[1]), itemStyle: { color, borderRadius: [0, 4, 4, 0] }, barWidth: 14, label: { show: true, position: 'right', color: INK_SUB, fontSize: 11 } }],
    };
  };

  const chgCell = (v: any) => {
    if (v == null || Number(v) === 0) return '0';
    const n = Number(v);
    return <span style={{ color: n > 0 ? GREEN : RED }}>{n > 0 ? '+' : ''}{v}</span>;
  };

  const cols: any[] = [
    { title: '部门', dataIndex: 'dept', width: 100 },
    { title: '序号', dataIndex: 'no', width: 60, align: 'right' as const },
    { title: '姓名', dataIndex: 'name', width: 80, fixed: 'left' as const },
    { title: '入职日期', dataIndex: 'hire', width: 100, render: (v: any) => v ? String(v).slice(0, 10) : '—' },
    { title: '调整前·年假', dataIndex: 'yq', width: 100, align: 'right' as const, render: fmtNum },
    { title: '调整前·调休', dataIndex: 'tq', width: 100, align: 'right' as const, render: fmtNum },
    { title: '确认后·年假', dataIndex: 'yh', width: 100, align: 'right' as const, render: fmtNum },
    { title: '确认后·调休', dataIndex: 'th', width: 100, align: 'right' as const, render: fmtNum },
    { title: '变化·年假', dataIndex: 'yc', width: 90, align: 'right' as const, render: chgCell },
    { title: '变化·调休', dataIndex: 'tc', width: 90, align: 'right' as const, render: chgCell },
    { title: '年假调整原因', dataIndex: 'yr', width: 150 },
    { title: '调休调整原因', dataIndex: 'tr', width: 150 },
  ];
  const rows = useMemo(() => {
    let r = B.rows;
    if (balFilter) r = r.filter((x: any) => (x.yc && x.yc !== 0) || (x.tc && x.tc !== 0));
    if (balQ) r = r.filter((x: any) => (x.name || '').includes(balQ) || (x.dept || '').includes(balQ));
    return r.map((x: any, idx: number) => ({ ...x, key: idx }));
  }, [balQ, balFilter]);

  return (
    <div>
      <KpiRow items={[
        { value: BT.yq, unit: '天', label: '调整前年假余额' },
        { value: BT.yh, unit: '天', label: '签字确认后年假余额' },
        { value: `+${BT.yc}`, unit: '天', label: '年假净变化（38人调整）', color: GREEN },
        { value: Math.round(BT.tq * 100) / 100, unit: '天', label: '调整前调休余额' },
        { value: Math.round(BT.th * 100) / 100, unit: '天', label: '签字确认后调休余额' },
        { value: BT.tc, unit: '天', label: '调休净变化（19人调整）', color: GOLD },
      ]} />
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}><Card size="small" title="年假调整原因分布" style={cardStyle}><ChartBox option={reasonOption(B.reasonY, PALETTE[0])} height={280} /></Card></Col>
        <Col xs={24} md={12}><Card size="small" title="调休调整原因分布" style={cardStyle}><ChartBox option={reasonOption(B.reasonT, GREEN)} height={280} /></Card></Col>
      </Row>
      <Card size="small" title="余额变化明细" style={cardStyle}
        extra={<span style={{ color: INK_SUB, fontSize: 12 }}>正数（返还）标绿、负数（扣除）标红</span>}>
        <div style={{ marginBottom: 12 }}>
          <Input placeholder="搜索姓名 / 部门" prefix={<SearchOutlined />} allowClear value={balQ} onChange={e => setBalQ(e.target.value)} style={{ width: 220, marginRight: 12 }} />
          <Select value={balFilter} onChange={setBalFilter} style={{ width: 160 }} options={[{ value: '', label: '全部人员' }, { value: '1', label: '仅看有调整' }]} />
        </div>
        <Table size="small" columns={cols} dataSource={rows} pagination={false} scroll={{ x: 1500, y: 420 }} />
      </Card>
    </div>
  );
};

/* ===================== ③ 2026缺卡总览 ===================== */
const Tab3MissOverview: React.FC = () => {
  const MO = D.missOverview;
  const [mpQ, setMpQ] = useState('');

  const optMissMon = {
    tooltip: baseTip, grid: { left: 8, right: 50, top: 40, bottom: 8, containLabel: true },
    legend: { top: 0, right: 0, textStyle: { color: INK_SUB, fontSize: 11 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
    xAxis: { type: 'category', data: MO.months.map((m: any) => m.m), ...axStyle },
    yAxis: [{ type: 'value', name: '次', ...axStyle }, { type: 'value', name: '人', ...axStyle, splitLine: { show: false } }],
    series: [
      { name: '已补卡', type: 'bar', stack: 'x', data: MO.months.map((m: any) => m.fixed), itemStyle: { color: GREEN, borderRadius: [4, 4, 0, 0] }, barWidth: 28 },
      { name: '未补卡', type: 'bar', stack: 'x', data: MO.months.map((m: any) => m.unfixed), itemStyle: { color: RED } },
      { name: '缺卡总数', type: 'line', data: MO.months.map((m: any) => m.total), itemStyle: { color: GOLD }, lineStyle: { width: 2.5, color: GOLD }, label: { show: true, color: GOLD, fontSize: 11 } },
      { name: '涉及人数', type: 'line', yAxisIndex: 1, data: MO.months.map((m: any) => m.ppl), itemStyle: { color: GRAY }, lineStyle: { width: 2, type: 'dashed', color: GRAY } },
    ],
  };
  const optMissCat = {
    tooltip: { trigger: 'item' as const, backgroundColor: 'rgba(23,32,46,0.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 12 }, formatter: '{b}<br>{c} 次（{d}%）' },
    series: [{ type: 'pie', radius: ['38%', '62%'], center: ['50%', '50%'],
      data: MO.cat.map((c: any, i: number) => ({ name: c.k, value: c.v, itemStyle: { color: [GREEN, RED, GOLD][i] } })),
      label: { color: INK_SUB, fontSize: 11, formatter: '{b}\n{d}%' }, itemStyle: { borderColor: '#fff', borderWidth: 2 } }],
  };

  const peopleRows = useMemo(() => {
    let r = [...MO.people].sort((a: any, b: any) => b.total - a.total);
    if (mpQ) r = r.filter((x: any) => (x.name || '').includes(mpQ));
    return r.map((x: any, idx: number) => ({ ...x, key: idx }));
  }, [mpQ]);
  const monthTotals = ['m1', 'm2', 'm3', 'm4', 'm5'].map(k => sum(MO.people.map((p: any) => p[k])));

  const mpCols: any[] = [
    { title: '姓名', dataIndex: 'name', width: 90, fixed: 'left' as const },
    { title: '1月', dataIndex: 'm1', width: 70, align: 'right' as const, render: fmtNum },
    { title: '2月', dataIndex: 'm2', width: 70, align: 'right' as const, render: fmtNum },
    { title: '3月', dataIndex: 'm3', width: 70, align: 'right' as const, render: fmtNum },
    { title: '4月', dataIndex: 'm4', width: 70, align: 'right' as const, render: fmtNum },
    { title: '5月', dataIndex: 'm5', width: 70, align: 'right' as const, render: fmtNum },
    { title: '总计', dataIndex: 'total', width: 80, align: 'right' as const, render: (v: any) => <strong>{v}</strong> },
  ];

  return (
    <div>
      <KpiRow items={[
        { value: MO.grand, unit: '次', label: '缺卡总次数' },
        { value: sum(MO.months.map((m: any) => m.fixed)), unit: '次', label: '已补卡' },
        { value: sum(MO.months.map((m: any) => m.unfixed)), unit: '次', label: '未补卡', color: RED },
        { value: MO.people.length, unit: '人', label: '涉及人数' },
        { value: '93.75%', label: '补卡率（邮件证明）', color: GREEN },
        { value: 34, unit: '次', label: '峰值月份（2月）' },
      ]} />
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={14}><Card size="small" title="月度缺卡情况" extra={<span style={{ color: INK_SUB, fontSize: 12 }}>柱：已补/未补；折线：涉及人数</span>} style={cardStyle}><ChartBox option={optMissMon} height={320} /></Card></Col>
        <Col xs={24} md={10}><Card size="small" title="缺卡处理情况" style={cardStyle}><ChartBox option={optMissCat} height={320} /></Card></Col>
      </Row>
      <Card size="small" title="涉及人员缺卡次数（按月份）" style={cardStyle}>
        <Input placeholder="搜索姓名" prefix={<SearchOutlined />} allowClear value={mpQ} onChange={e => setMpQ(e.target.value)} style={{ width: 200, marginBottom: 10 }} />
        <Table size="small" columns={mpCols} dataSource={peopleRows} pagination={false} scroll={{ x: 700, y: 380 }}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}><strong>合计</strong></Table.Summary.Cell>
              {monthTotals.map((v, idx) => <Table.Summary.Cell key={idx} index={idx + 1} align="right"><strong>{fmtNum(v)}</strong></Table.Summary.Cell>)}
              <Table.Summary.Cell index={6} align="right"><strong>{sum(MO.people.map((p: any) => p.total))}</strong></Table.Summary.Cell>
            </Table.Summary.Row>
          )} />
      </Card>
    </div>
  );
};

/* ===================== ④ 缺卡明细 ===================== */
const Tab4MissDetail: React.FC = () => {
  const [dMonth, setDMonth] = useState('');
  const [dStatus, setDStatus] = useState('');
  const [dQ, setDQ] = useState('');

  const rows = useMemo(() => {
    let r = D.missDetail;
    if (dMonth) r = r.filter((x: any) => x.m === dMonth);
    if (dStatus) r = r.filter((x: any) => x.status === dStatus);
    if (dQ) r = r.filter((x: any) => (x.name || '').includes(dQ) || (x.dept || '').includes(dQ));
    return r.map((x: any, idx: number) => ({ ...x, key: idx }));
  }, [dMonth, dStatus, dQ]);

  const cols: any[] = [
    { title: '月份', dataIndex: 'm', width: 90 },
    { title: '姓名', dataIndex: 'name', width: 90, fixed: 'left' as const },
    { title: '部门', dataIndex: 'dept', width: 100 },
    { title: '缺卡次数', dataIndex: 'miss', width: 90, align: 'right' as const, render: fmtNum },
    { title: '迟到次数', dataIndex: 'late', width: 90, align: 'right' as const, render: fmtNum },
    { title: '上级邮件证明', dataIndex: 'proof', width: 140, render: (v: any) => v || '—' },
    { title: '补卡状态', dataIndex: 'status', width: 150, render: (v: any) => v ? <Tag color={String(v).startsWith('已') ? 'green' : 'red'}>{v}</Tag> : '—' },
    { title: '考勤异常(天)', dataIndex: 'abn', width: 110, align: 'right' as const, render: fmtNum },
    { title: '备注', dataIndex: 'note', width: 200 },
  ];

  return (
    <Card size="small" title="2026年1–5月缺卡明细" style={cardStyle}>
      <div style={{ marginBottom: 12 }}>
        <Select placeholder="全部月份" allowClear value={dMonth || undefined} onChange={(v) => setDMonth(v || '')} style={{ width: 130, marginRight: 12 }}
          options={['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'].map(m => ({ value: m, label: m }))} />
        <Select placeholder="全部状态" allowClear value={dStatus || undefined} onChange={(v) => setDStatus(v || '')} style={{ width: 180, marginRight: 12 }}
          options={['已补卡（邮件证明）', '未补卡，记旷工', '未补卡，记早退'].map(s => ({ value: s, label: s }))} />
        <Input placeholder="搜索姓名 / 部门" prefix={<SearchOutlined />} allowClear value={dQ} onChange={e => setDQ(e.target.value)} style={{ width: 200 }} />
      </div>
      <Table size="small" columns={cols} dataSource={rows} pagination={false} scroll={{ x: 1200, y: 460 }}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={3}><strong>共 {rows.length} 条</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={3} align="right"><strong>{sum(rows.map((r: any) => r.miss))}</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={4} align="right"><strong>{sum(rows.map((r: any) => r.late))}</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={5} colSpan={4} />
          </Table.Summary.Row>
        )} />
    </Card>
  );
};

/* ===================== ⑤ 系统外请假 ===================== */
const Tab5Offsys: React.FC = () => {
  const OC: Record<string, number> = {};
  D.offsys.forEach((r: any) => { OC[r.type] = (OC[r.type] || 0) + 1; });

  const optOffType = {
    tooltip: { trigger: 'item' as const, backgroundColor: 'rgba(23,32,46,0.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 12 }, formatter: '{b}<br>{c} 条（{d}%）' },
    series: [{ type: 'pie', radius: ['40%', '66%'], center: ['50%', '50%'],
      data: Object.entries(OC).map(([k, v], i) => ({ name: k, value: v, itemStyle: { color: [PRIMARY, LIGHT, SECONDARY, ACCENT, NEGATIVE][i % 5] } })),
      label: { color: INK_SUB, fontSize: 11 }, itemStyle: { borderColor: '#fff', borderWidth: 2 } }],
  };

  const cols: any[] = [
    { title: '发起人', dataIndex: 'by', width: 90 },
    { title: '审批人', dataIndex: 'appr', width: 90 },
    { title: '请假类型', dataIndex: 'type', width: 110 },
    { title: '开始', dataIndex: 'start', width: 110 },
    { title: '结束', dataIndex: 'end', width: 110 },
    { title: '天数', dataIndex: 'days', width: 70, align: 'right' as const },
    { title: '邮件发送日期', dataIndex: 'mail', width: 110, render: (v: any) => v ? String(v).slice(0, 10) : '' },
    { title: '请假时间点', dataIndex: 'point', width: 140 },
    { title: '请假原因说明', dataIndex: 'reason', width: 220 },
  ];
  const rows = D.offsys.map((r: any, idx: number) => ({ ...r, key: idx }));

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={10}><Card size="small" title="请假类型分布" style={cardStyle}><ChartBox option={optOffType} height={300} /></Card></Col>
        <Col xs={24} md={14}>
          <Card size="small" title="分析要点" style={cardStyle}>
            <div style={{ fontSize: 13, color: INK, lineHeight: 2 }}>
              · 11 条记录中 <strong>5 条</strong> 与病假手续相关（年假抵病假 4 条、病假撤销改年假 1 条），多因缺少病假条改用年假抵扣；<br />
              · <strong>5 条</strong> 邮件发送日期晚于请假日期，属事后补办流程；<br />
              · 请假时间点集中在「13点之前 / 微信事先请假，邮件后补」，建议后续统一在系统内事前发起。
            </div>
          </Card>
        </Col>
      </Row>
      <Card size="small" title="系统外请假明细" style={cardStyle}>
        <Table size="small" columns={cols} dataSource={rows} pagination={false} scroll={{ x: 1200, y: 380 }} />
      </Card>
    </div>
  );
};

/* ===================== ⑥ 假期分类占比 ===================== */
const Tab6LeaveMix: React.FC = () => {
  const LM = D.leaveMix;

  const optMixBar = {
    tooltip: baseTip, grid: { left: 8, right: 16, top: 55, bottom: 8, containLabel: true },
    legend: { top: 0, right: 0, textStyle: { color: INK_SUB, fontSize: 11 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
    xAxis: { type: 'category', data: LM.months.map((m: any) => m.m), ...axStyle }, yAxis: { type: 'value', name: '天', ...axStyle },
    series: LEAVES.map(l => ({ name: l, type: 'bar', stack: 'lv', data: LM.months.map((m: any) => m[l]), itemStyle: { color: LCOLOR[l] }, barWidth: 30 })),
  };
  const optMixPie = {
    tooltip: { trigger: 'item' as const, backgroundColor: 'rgba(23,32,46,0.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 12 }, formatter: '{b}<br>{c} 天（{d}%）' },
    series: [{ type: 'pie', radius: ['38%', '62%'], center: ['50%', '50%'],
      data: LEAVES.filter(l => LM.total[l] > 0).map(l => ({ name: l, value: LM.total[l], itemStyle: { color: LCOLOR[l] } })),
      label: { color: INK_SUB, fontSize: 11, formatter: '{b}\n{d}%' }, itemStyle: { borderColor: '#fff', borderWidth: 2 } }],
  };

  const cols: any[] = [
    { title: '月份', dataIndex: 'm', width: 90, fixed: 'left' as const },
    ...LEAVES.map(l => ({ title: l, dataIndex: l, width: 64, align: 'right' as const, render: fmtNum })),
    { title: '合计', dataIndex: 'total', width: 70, align: 'right' as const, render: (v: any) => <strong>{v}</strong> },
  ];
  const rows = LM.months.map((m: any, idx: number) => ({
    ...m,
    total: Math.round(LEAVES.reduce((s, l) => s + (m[l] || 0), 0) * 10) / 10,
    key: idx,
  }));
  const grandTotal = Math.round(LEAVES.reduce((s, l) => s + (LM.total[l] || 0), 0) * 10) / 10;

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={14}><Card size="small" title="月度假期分类（堆叠）" extra={<span style={{ color: INK_SUB, fontSize: 12 }}>单位：天</span>} style={cardStyle}><ChartBox option={optMixBar} height={320} /></Card></Col>
        <Col xs={24} md={10}><Card size="small" title="五个月假期构成" style={cardStyle}><ChartBox option={optMixPie} height={320} /></Card></Col>
      </Row>
      <Card size="small" title="数据表" style={cardStyle}>
        <Table size="small" columns={cols} dataSource={rows} pagination={false} scroll={{ x: 700 }}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}><strong>总计</strong></Table.Summary.Cell>
              {LEAVES.map((l, idx) => <Table.Summary.Cell key={l} index={idx + 1} align="right"><strong>{fmtNum(LM.total[l])}</strong></Table.Summary.Cell>)}
              <Table.Summary.Cell index={10} align="right"><strong>{grandTotal}</strong></Table.Summary.Cell>
            </Table.Summary.Row>
          )} />
      </Card>
    </div>
  );
};

/* ===================== 主组件 ===================== */
const HistoricalAttendanceOverview: React.FC = () => (
  <div>
    <Alert
      type="warning"
      showIcon
      style={{ marginBottom: 16, borderRadius: 10, border: `1px solid ${GOLD}55`, background: '#fdfaf2' }}
      message={<span style={{ fontWeight: 600 }}>统计周期跨度较大，历史数据的完整性与准确性可能存在一定偏差，统计结果仅供参考。</span>}
    />
    <div style={{ fontSize: 12.5, color: INK_SUB, marginBottom: 14 }}>数据来源：考勤汇总（2021年3月—2026年5月）· 静态历史数据</div>
    <Tabs
      defaultActiveKey="t1"
      items={[
        { key: 't1', label: '① 五年总趋势', children: <Tab1Trend /> },
        { key: 't2', label: '② 年假调休余额调整', children: <Tab2Balance /> },
        { key: 't3', label: '③ 2026缺卡总览', children: <Tab3MissOverview /> },
        { key: 't4', label: '④ 缺卡明细', children: <Tab4MissDetail /> },
        { key: 't5', label: '⑤ 系统外请假', children: <Tab5Offsys /> },
        { key: 't6', label: '⑥ 假期分类占比', children: <Tab6LeaveMix /> },
      ]}
    />
  </div>
);

export default HistoricalAttendanceOverview;
