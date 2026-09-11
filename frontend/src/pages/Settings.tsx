import React, { useState } from 'react';
import { Card, Button, Typography, Space, message, Form, Input, Modal } from 'antd';
import axios from 'axios';
import { AUTH_URL, SCF_CONFIG } from '../config';
import AccountManagement from './settings/AccountManagement';
import CompanyManagement from './settings/CompanyManagement';

const SettingsPage: React.FC = () => {
  const [apiTestResult, setApiTestResult] = useState<string>('');
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdForm] = Form.useForm();
  const role = localStorage.getItem('user_role') || 'hr_staff';

  const testApi = async () => {
    try {
      const { fetchCompanies } = await import('../api/endpoints');
      const res = await fetchCompanies();
      setApiTestResult(`✅ 连接成功 — ${res.data.total} 家公司已加载`);
      message.success('API 连接正常');
    } catch (e: any) {
      setApiTestResult(`❌ 连接失败 — ${e.message}`);
      message.error('API 连接失败');
    }
  };

  // 修改密码
  const handleChangePassword = async () => {
    try {
      const values = await pwdForm.validateFields();
      if (values.new_password !== values.confirm_password) {
        message.error('两次输入的新密码不一致');
        return;
      }
      setPwdLoading(true);

      const token = localStorage.getItem('supabase_token');
      if (!token) {
        message.error('登录已过期，请重新登录');
        setPwdLoading(false);
        return;
      }

      // 调用 Supabase Auth API 修改密码
      // 需要先用旧密码验明正身，再设置新密码
      await axios.put(
        `${AUTH_URL}/user`,
        { password: values.new_password },
        {
          headers: {
            'apikey': SCF_CONFIG.supabaseAnonKey,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Forward-To': SCF_CONFIG.supabaseAuthUrl,
          },
        }
      );

      message.success('密码修改成功，下次登录使用新密码');
      setPwdModalOpen(false);
      pwdForm.resetFields();
    } catch (e: any) {
      const errMsg = e.response?.data?.msg || e.response?.data?.message || '修改失败，请确认旧密码正确';
      message.error(errMsg);
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 1200 }}>
      <Typography.Title level={4}>系统设置</Typography.Title>

      <Card title="账户安全" style={{ marginBottom: 16 }}>
        <Space>
          <Button type="primary" onClick={() => setPwdModalOpen(true)}>
            修改密码
          </Button>
        </Space>
      </Card>

      {role === 'admin' && (
        <Card title="账号管理" style={{ marginBottom: 16 }}>
          <AccountManagement />
        </Card>
      )}

      <Card title="公司管理" style={{ marginBottom: 16 }}>
        <CompanyManagement />
      </Card>

      <Card title="API 连接测试" style={{ marginBottom: 16 }}>
        <Space>
          <Button onClick={testApi}>测试连接</Button>
          {apiTestResult && <Typography.Text>{apiTestResult}</Typography.Text>}
        </Space>
      </Card>

      <Card title="部署信息" style={{ marginBottom: 16 }}>
        <Typography.Paragraph>
          <strong>前端：</strong>GitHub Pages（国内可访问）<br />
          <strong>代理：</strong>腾讯云 SCF 云函数（函数 URL 反向代理 Supabase）<br />
          <strong>数据库：</strong>Supabase (PostgreSQL 15)<br />
          <strong>前端框架：</strong>React 18 + TypeScript + Ant Design 5<br />
          <strong>后端：</strong>Python FastAPI + SQLAlchemy 2.0
        </Typography.Paragraph>
      </Card>

      <Card title="计算规则" style={{ marginBottom: 16 }}>
        <Typography.Paragraph>
          <strong>计税模式：</strong>
          正常计税（normal）— 七级累进税率 3%-45%，累计预扣法，每月减除费用 5000 元<br />
          劳务报酬（service）—（薪资小计 - 800）× 20%<br />
          现金计税（cash）— 薪资小计 × 3%<br />
          不计税（non_taxable）— 个税为 0，适用于香港员工
        </Typography.Paragraph>
      </Card>

      {/* 修改密码弹窗 */}
      <Modal
        title="修改密码"
        open={pwdModalOpen}
        onOk={handleChangePassword}
        onCancel={() => { setPwdModalOpen(false); pwdForm.resetFields(); }}
        confirmLoading={pwdLoading}
        okText="确认修改"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={pwdForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="new_password"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少 6 位' },
            ]}
          >
            <Input.Password placeholder="至少6位" />
          </Form.Item>
          <Form.Item
            name="confirm_password"
            label="确认新密码"
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次输入不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="和上面输入一致" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SettingsPage;
