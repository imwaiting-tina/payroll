import React, { useCallback, useEffect, useState } from 'react';
import { Tabs, Card, Space, Button, message } from 'antd';
import {
  FileTextOutlined, FormOutlined, CalculatorOutlined, TableOutlined, DollarOutlined,
  ExperimentOutlined, ThunderboltOutlined, WalletOutlined, SyncOutlined,
} from '@ant-design/icons';
import TaxOpeningPage from './tax/TaxOpeningPage';
import TaxSpecialDeductionsPage from './tax/TaxSpecialDeductionsPage';
import TaxMonthlyCalcPage from './tax/TaxMonthlyCalcPage';
import TaxBracketsPage from './tax/TaxBracketsPage';
import ServiceTaxPage from './tax/ServiceTaxPage';
import InternTaxPage from './tax/InternTaxPage';
import FlexibleTaxPage from './tax/FlexibleTaxPage';
import CashTaxPage from './tax/CashTaxPage';
import api from '../api/client';
import { useStore } from '../stores/appStore';
import { isActiveInPeriod } from '../utils/employee';

// 各税种（与页签一致，不含"不计税"）
const TAX_TYPES = [
  { value: 'normal', label: '正常计税' },
  { value: 'service', label: '劳务' },
  { value: 'intern', label: '实习' },
  { value: 'flexible', label: '灵工' },
  { value: 'cash', label: '现金' },
];

const fmtTax = (v?: number) => Number(v || 0).toLocaleString('zh-CN', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

interface TypeSummary { count: number; tax: number }

const TaxPage: React.FC = () => {
  const period = useStore(s => s.currentPeriod);
  const [summary, setSummary] = useState<Record<string, TypeSummary>>({});
  const [summaryLoading, setSummaryLoading] = useState(false);

  // 各税种当月应扣个税：正常/实习取个税月计算表，劳务/灵工/现金取薪资表
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const [empRes, calcRes, salRes] = await Promise.all([
        api.get(`/employees?select=unique_hash,name,status,leave_date,tax_method&period=eq.${period}`),
        api.get(`/tax_monthly_calcs?select=unique_hash,monthly_tax&period=eq.${period}`),
        api.get(`/salary_records?select=unique_hash,monthly_tax&period=eq.${period}`),
      ]);
      const calcMap: Record<string, any> = {};
      calcRes.data.forEach((r: any) => { calcMap[r.unique_hash] = r; });
      const salMap: Record<string, any> = {};
      salRes.data.forEach((r: any) => { salMap[r.unique_hash] = r; });

      const acc: Record<string, TypeSummary> = {};
      TAX_TYPES.forEach(t => { acc[t.value] = { count: 0, tax: 0 }; });

      empRes.data.filter((e: any) => isActiveInPeriod(e, period)).forEach((e: any) => {
        const method = e.tax_method || 'normal';
        // 不计税等其他类型不纳入汇总
        if (!acc[method]) return;
        const tax = method === 'normal' || method === 'intern'
          ? Number(calcMap[e.unique_hash]?.monthly_tax ?? salMap[e.unique_hash]?.monthly_tax ?? 0)
          : Number(salMap[e.unique_hash]?.monthly_tax ?? 0);
        acc[method].count += 1;
        acc[method].tax += tax;
      });
      setSummary(acc);
    } catch {
      message.error('加载各税种汇总失败');
    } finally {
      setSummaryLoading(false);
    }
  }, [period]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const totalTax = TAX_TYPES.reduce((s, t) => s + (summary[t.value]?.tax || 0), 0);

  return (
    <div>
      {/* 各税种汇总（随所选月份变化，计算后可点刷新） */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space size="large" wrap>
          {TAX_TYPES.map(t => {
            const item = summary[t.value];
            return (
              <span key={t.value}>
                {t.label}：<strong style={{ color: item?.tax ? '#e74c3c' : undefined }}>{fmtTax(item?.tax)}</strong>
                <span style={{ color: '#999' }}>（{item?.count || 0} 人）</span>
              </span>
            );
          })}
          <span style={{ borderLeft: '1px solid #eee', paddingLeft: 16 }}>
            合计应扣：<strong style={{ color: '#e74c3c' }}>{fmtTax(totalTax)}</strong>
          </span>
          <Button size="small" icon={<SyncOutlined />} loading={summaryLoading} onClick={loadSummary}>刷新</Button>
        </Space>
      </Card>

      <Tabs
        defaultActiveKey="opening"
        style={{ marginBottom: 16 }}
        onChange={() => loadSummary()}
        items={[
          { key: 'opening', label: <span><FormOutlined />期初累计数</span>, children: <TaxOpeningPage /> },
          { key: 'special', label: <span><FileTextOutlined />专项附加扣除维护</span>, children: <TaxSpecialDeductionsPage /> },
          { key: 'calc', label: <span><CalculatorOutlined />个税月度计算</span>, children: <TaxMonthlyCalcPage /> },
          { key: 'service', label: <span><DollarOutlined />劳务个税计算</span>, children: <ServiceTaxPage /> },
          { key: 'intern', label: <span><ExperimentOutlined />实习生个税</span>, children: <InternTaxPage /> },
          { key: 'flexible', label: <span><ThunderboltOutlined />灵工个税</span>, children: <FlexibleTaxPage /> },
          { key: 'cash', label: <span><WalletOutlined />现金计税</span>, children: <CashTaxPage /> },
          { key: 'brackets', label: <span><TableOutlined />预扣率表</span>, children: <TaxBracketsPage /> },
        ]}
      />
    </div>
  );
};

export default TaxPage;
