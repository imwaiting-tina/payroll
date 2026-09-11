import React, { useEffect, useState } from 'react';
import { Card, Table, message } from 'antd';
import api from '../../api/client';
import { TAX_BRACKETS } from '../../utils/taxCalc';
import { withSource } from '../../components/SourceTag';

/**
 * 个税扣缴 — Tab 4：预扣率表（参数表）
 */

const TaxBracketsPage: React.FC = () => {
  const [brackets, setBrackets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadBrackets(); }, []);

  const loadBrackets = async () => {
    setLoading(true);
    try {
      const res = await api.get('/tax_brackets?select=*&order=level');
      // 数据库有数据用数据库，没有用本地默认
      if (res.data.length > 0) {
        setBrackets(res.data.map((b: any) => ({ ...b, key: b.level })));
      } else {
        setBrackets(TAX_BRACKETS.map(b => ({ ...b, key: b.level })));
      }
    } catch {
      // 表不存在时用本地默认
      setBrackets(TAX_BRACKETS.map(b => ({ ...b, key: b.level })));
    } finally {
      setLoading(false);
    }
  };

  const columns: any[] = [
    { title: withSource('级数', '系统计算'), dataIndex: 'level', key: 'level', width: 70 },
    { title: withSource('累计预扣预缴应纳税所得额', '系统计算'), key: 'range', width: 260,
      render: (_: any, r: any) => {
        const min = Number(r.min_income).toLocaleString('zh-CN');
        const max = r.max_income === null || r.max_income === undefined
          ? '以上'
          : `至 ${Number(r.max_income).toLocaleString('zh-CN')}`;
        return `${min} 元 ${max}`;
      } },
    { title: withSource('预扣率', '系统计算'), dataIndex: 'rate', key: 'rate', width: 100,
      render: (v: number) => `${(v * 100).toFixed(0)}%` },
    { title: withSource('速算扣除数', '系统计算'), dataIndex: 'quick_deduction', key: 'qd', width: 120,
      render: (v: number) => v === 0 || v === undefined || v === null ? '—' : Number(v).toLocaleString('zh-CN') },
  ];

  return (
    <Card size="small" title="预扣率表（居民个人工资薪金所得预扣率）">
      <Table columns={columns} dataSource={brackets} loading={loading} size="small" pagination={false} />
      <div style={{ marginTop: 12, color: '#888' }}>
        注：本表为税法固定参数，累计预扣预缴应纳税所得额按年度累计口径。
      </div>
    </Card>
  );
};

export default TaxBracketsPage;
