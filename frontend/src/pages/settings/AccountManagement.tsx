import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, message, Tag, Popconfirm, Card } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { ROLE_LABELS, ROLE_COLORS, ROLE_OPTIONS, type Role } from '../../utils/permissions';
import { FUNCTIONS_URL } from '../../config';

// 账号管理改走 Edge Function（supabase/functions/admin-users）：
// secret 密钥只存在于服务端，前端不再接触 service_role key。
const ADMIN_URL = `${FUNCTIONS_URL}/admin-users`;

const token = () => localStorage.getItem('supabase_token') || '';

async function adminFetch(method: 'GET' | 'POST' | 'PATCH', body?: any) {
  return fetch(ADMIN_URL, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const AccountManagementPage: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await adminFetch('GET');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载失败');
      const list = data.users || [];
      setUsers(list.map((u: any) => ({
        ...u,
        key: u.id,
        role: (u.user_metadata?.role in ROLE_LABELS ? u.user_metadata?.role : 'hr_staff'),
      })));
    } catch (e: any) {
      message.error(e.message || '加载账号列表失败');
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
      const res = await adminFetch('POST', { email: values.email, password: values.password, role: values.role });
      if (res.ok) {
        message.success('账号创建成功');
        setModalOpen(false);
        loadUsers();
      } else {
        const err = await res.json();
        message.error(err.error || err.message || '创建失败');
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
        await adminFetch('PATCH', { id: currentUserId, role: 'hr_staff' });
      }
      // 如果要降级当前的唯一 admin 且没有别人是 admin，则阻止
      const adminCount = users.filter(u => u.role === 'admin').length;
      if (role !== 'admin' && currentUserId === userId && adminCount <= 1) {
        message.warning('系统至少需要一名管理员，请先将他人设为管理员');
        return;
      }

      const res = await adminFetch('PATCH', { id: userId, role });
      if (res.ok) {
        message.success(role === 'admin' && currentUserId === userId ? '管理员权限已转移，您已降为操作' : '角色已更新');
        loadUsers();
      } else {
        const err = await res.json();
        message.error(err.error || '更新失败');
      }
    } catch (e: any) {
      message.error(e.message || '更新失败');
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
      const res = await adminFetch('PATCH', { id: userId, password: newPwd });
      if (res.ok) {
        message.success('密码已重置');
      } else {
        const err = await res.json();
        message.error(err.error || '重置失败');
      }
    } catch (e: any) {
      message.error(e.message || '重置失败');
    }
  };

  // 停用/启用账号
  const handleToggleBan = async (user: any) => {
    try {
      const res = await adminFetch('PATCH', { id: user.id, ban_duration: user.banned_until ? 'none' : '876000h' });
      if (res.ok) {
        message.success(user.banned_until ? '已启用' : '已停用');
        loadUsers();
      } else {
        const err = await res.json();
        message.error(err.error || '操作失败');
      }
    } catch (e: any) {
      message.error(e.message || '操作失败');
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
