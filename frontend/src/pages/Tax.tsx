import React from 'react';
import { Tabs } from 'antd';
import { FileTextOutlined, FormOutlined, CalculatorOutlined, TableOutlined, DollarOutlined, ExperimentOutlined, ThunderboltOutlined, WalletOutlined } from '@ant-design/icons';
import TaxOpeningPage from './tax/TaxOpeningPage';
import TaxSpecialDeductionsPage from './tax/TaxSpecialDeductionsPage';
import TaxMonthlyCalcPage from './tax/TaxMonthlyCalcPage';
import TaxBracketsPage from './tax/TaxBracketsPage';
import ServiceTaxPage from './tax/ServiceTaxPage';
import InternTaxPage from './tax/InternTaxPage';
import FlexibleTaxPage from './tax/FlexibleTaxPage';
import CashTaxPage from './tax/CashTaxPage';

const TaxPage: React.FC = () => {
  return (
    <div>
      <Tabs
        defaultActiveKey="opening"
        style={{ marginBottom: 16 }}
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
