import React from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Tabs } from 'antd';
import { SafetyCertificateOutlined, SettingOutlined } from '@ant-design/icons';
import EmployeeWelfare from './social/EmployeeWelfare';
import WelfareSetPage from './social/WelfareSetPage';

const SocialPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const activeKey = location.pathname === '/social/welfare-sets' ? 'welfare-sets' : 'employee-welfare';

  return (
    <div>
      <Tabs
        activeKey={activeKey}
        onChange={(key) => navigate(`/social/${key}`)}
        style={{ marginBottom: 16 }}
        items={[
          { key: 'employee-welfare', label: <span><SafetyCertificateOutlined />员工福利缴纳明细</span> },
          { key: 'welfare-sets', label: <span><SettingOutlined />福利套设置</span> },
        ]}
      />
      <Routes>
        <Route path="/" element={<Navigate to="employee-welfare" replace />} />
        <Route path="employee-welfare" element={<EmployeeWelfare />} />
        <Route path="welfare-sets" element={<WelfareSetPage />} />
      </Routes>
    </div>
  );
};

export default SocialPage;
