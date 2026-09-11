import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, message, Tag, Popconfirm, Card } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { ROLE_LABELS, ROLE_COLORS, ROLE_OPTIONS, type Role } from '../../utils/permissions';

const SUPABASE_URL = 'https://avuldnywmiflbmmlgmas.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2dWxkbnl3bWlmbGJtbWxnbWFzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjMzNjQ0OCwiZXhwIjoyMTAxOTEyNDQ4fQ.S7e1lJxysz9v0MoXaizgMy-wbSMHxmZUBFTj_tVABnQ';

const AccountManagementPage: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      // 通过 Supabase Auth 的管理 API 列出用户
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=100`, {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      });
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.users || []);
      setUsers(list.map((u: any) => ({
        ...u,
        key: u.id,
        role: (u.user_metadata?.role in ROLE_LABELS ? u.user_metadata?.role : 'hr_staff'),
      })));
    } catch {
      message.error('加载账号列表失败');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ role: 'hr_staff' });
    setModalOpen(true);
  };

  // 创建账号
  const handleCreate = async () => {
    const values = await form.validateFields();
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          email_confirm: true,
          user_metadata: { role: values.role },
        }),
      });
      if (res.ok) {
        message.success('账号创建成功');
        setModalOpen(false);
        loadUsers();
      } else {
        const err = await res.json();
        message.error(err.msg || err.message || '创建失败');
      }
    } catch (e: any) {
      message.error(e.message || '创建失败');
    }
  };

  // 修改角色（管理员唯一：把 admin 给别人时，当前 admin 自动降为 hr_staff）
  const handleChangeRole = async (userId: string, role: string) => {
    const currentUserId = users.find(u => u.role === 'admin')?.id;
    try {
      // 如果要把某个人设为 admin，且当前有另一个 admin，则当前 admin 降为 hr_staff
      if (role === 'admin' && currentUserId && currentUserId !== userId) {
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${currentUserId}`, {
          method: 'PUT',
          headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ user_metadata: { role: 'hr_staff' } }),
        });
      }
      // 如果要降级当前的唯一 admin 且没有别人是 admin，则阻止
      const adminCount = users.filter(u => u.role === 'admin').length;
      if (role !== 'admin' && currentUserId === userId && adminCount <= 1) {
        message.warning('系统至少需要一名管理员，请先将他人设为管理员');
        return;
      }

      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_metadata: { role } }),
      });
      if (res.ok) {
        message.success(role === 'admin' && currentUserId === userId ? '管理员权限已转移，您已降为操作' : '角色已更新');
        loadUsers();
      } else {
        message.error('更新失败');
      }
    } catch {
      message.error('更新失败');
    }
  };

  // 重置密码
  const handleResetPassword = async (userId: string) => {
    const newPwd = prompt('请输入新密码（至少6位）：');
    if (!newPwd || newPwd.length < 6) {
      message.warning('密码至少6位');
      return;
    }
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: newPwd }),
      });
      if (res.ok) {
        message.success('密码已重置');
      } else {
        message.error('重置失败');
      }
    } catch {
      message.error('重置失败');
    }
  };

  // 停用/启用账号
  const handleToggleBan = async (user: any) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
        method: 'PUT',
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ban_duration: user.banned_until ? 'none' : '876000h' }),
      });
      if (res.ok) {
        message.success(user.banned_until ? '已启用' : '已停用');
        loadUsers();
      } else {
        message.error('操作失败');
      }
    } catch {
      message.error('操作失败');
    }
  };

  const columns = [
    { title: '邮箱', dataIndex: 'email', key: 'email', width: 240 },
    {
      title: '角色', dataIndex: 'role', key: 'role', width: 100,
      render: (v: string) => <Tag color={ROLE_COLORS[v as Role] || 'default'}>{ROLE_LABELS[v as Role] || v}</Tag>,
    },
    {
      title: '状态', dataIndex: 'banned_until', key: 'status', width: 90,
      render: (v: any) => v ? <Tag color="red">已停用</Tag> : <Tag color="green">正常</Tag>,
    },
    { title: '创建时间', dataIndex: 'created_at', key: 'created', width: 180, render: (v: string) => v ? new Date(v).toLocaleString() : '—' },
    {
      title: '操作', key: 'act', width: 360,
      render: (_: any, u: any) => (
        <Space size={4} wrap>
          <Select
            size="small"
            value={u.role}
            style={{ width: 110 }}
            onChange={(val) => handleChangeRole(u.id, val)}
            options={ROLE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
          />
          <Button size="small" onClick={() => handleResetPassword(u.id)}>重置密码</Button>
          <Popconfirm title={u.banned_until ? '确认启用该账号？' : '确认停用该账号？'} onConfirm={() => handleToggleBan(u)}>
            <Button size="small" danger={!u.banned_until}>{u.banned_until ? '启用' : '停用'}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>创建账号</Button>
        </Space>
      </Card>

      <Table columns={columns} dataSource={users} loading={loading} size="small" scroll={{ y: 480 }} pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 30, 50], showTotal: t => `共 ${t} 条` }} />

      <Modal
        title="创建账号"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => setModalOpen(false)}
        okText="创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
            <Input placeholder="如 boss@kaiyi.com" />
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, min: 6, message: '至少6位' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AccountManagementPage;
