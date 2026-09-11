import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, message, Space } from 'antd';
import { UserOutlined, LockOutlined, DollarOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const AUTH_URL = 'https://avuldnywmiflbmmlgmas.supabase.co/auth/v1';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2dWxkbnl3bWlmbGJtbWxnbWFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzY0NDgsImV4cCI6MjEwMTkxMjQ0OH0.8qqzH3zMc274Di-TK_6huMhrOWppJI1L3tjIfcBV2ts';

const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      // 直接用 axios 调 Supabase Auth API，不依赖 supabase-js
      const res = await axios.post(`${AUTH_URL}/token?grant_type=password`, {
        email: values.email,
        password: values.password,
      }, {
        headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      });

      if (res.data.access_token) {
        localStorage.setItem('supabase_token', res.data.access_token);
        // 解析 JWT 里的角色信息
        try {
          const payload = JSON.parse(atob(res.data.access_token.split('.')[1]));
          const role = payload?.user_metadata?.role || 'hr_staff';
          localStorage.setItem('user_role', role);
        } catch {
          localStorage.setItem('user_role', 'hr_staff');
        }
        message.success('登录成功');
        navigate('/');
      }
    } catch (err: any) {
      message.error(err.response?.data?.error_description || err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', justifyContent: 'center',
      alignItems: 'center', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <Card style={{ width: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <Space direction="vertical" size="large" style={{ width: '100%', textAlign: 'center' }}>
          <div>
            <DollarOutlined style={{ fontSize: 48, color: '#1677ff' }} />
            <Typography.Title level={3} style={{ marginTop: 8, marginBottom: 4 }}>
              开弈集团薪酬管理系统
            </Typography.Title>
            <Typography.Text type="secondary">多公司薪酬计算 · 社保公积金 · 个税引擎</Typography.Text>
          </div>

          <Form onFinish={onFinish} layout="vertical" size="large">
            <Form.Item name="email" rules={[{ required: true, message: '请输入邮箱' }]}>
              <Input prefix={<UserOutlined />} placeholder="邮箱" autoComplete="email" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="current-password" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block>
                登录
              </Button>
            </Form.Item>
          </Form>
        </Space>
      </Card>
    </div>
  );
};

export default LoginPage;
