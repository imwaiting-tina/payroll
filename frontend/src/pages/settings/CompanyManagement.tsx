import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, message, Popconfirm, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../../api/client';
import { isAdmin } from '../../utils/permissions';

/**
 * 公司管理 — 维护 company_mapping 表（公司简称对应表）
 * 前端可直接读写（RLS 已放行 authenticated），无需后台设置。
 * 新增/删除仅管理员可操作，其他人只读查看。
 */
const REGION_OPTIONS = ['上海', '北京', '天津', '深圳', '南京', '香港', '其他'];

const CompanyManagement: React.FC = () => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const canEdit = isAdmin();

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/company_mapping?select=*&order=sort_order');
      setCompanies(res.data);
    } catch { message.error('加载公司列表失败'); }
    finally { setLoading(false); }
  };

  const openCreate = () => {
    form.resetFields();
    const maxSort = companies.length ? Math.max(...companies.map((c: any) => Number(c.sort_order) || 0)) : 0;
    form.setFieldsValue({ region: '上海', sort_order: maxSort + 1 });
    setModalOpen(true);
  };

  const handleCreate = async () => {
    const values = await form.validateFields();
    if (companies.some((c: any) => c.display_value === values.display_value)) {
      message.error('该简称已存在');
      return;
    }
    try {
      await api.post('/company_mapping', {
        display_value: values.display_value,
        full_name: values.full_name,
        region: values.region || '',
        sort_order: values.sort_order,
      });
      message.success('公司新增成功');
      setModalOpen(false);
      load();
    } catch (e: any) {
      message.error(e?.message || '新增失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/company_mapping?id=eq.${id}`);
      message.success('已删除');
      load();
    } catch { message.error('删除失败'); }
  };

  const columns: any[] = [
    { title: '简称', dataIndex: 'display_value', key: 'dv', width: 140 },
    { title: '全称', dataIndex: 'full_name', key: 'fn', ellipsis: true },
    { title: '地区', dataIndex: 'region', key: 'region', width: 90, render: (v: string) => v ? <Tag>{v}</Tag> : '—' },
    { title: '排序', dataIndex: 'sort_order', key: 'so', width: 70 },
    {
      title: '操作', key: 'act', width: 80,
      render: (_: any, r: any) => canEdit ? (
        <Popconfirm title="确认删除该公司？" onConfirm={() => handleDelete(r.id)}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ) : '—',
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增公司</Button>}
        <span style={{ color: '#888', fontSize: 12 }}>公司列表用于花名册「发薪公司」下拉及筛选。</span>
      </Space>
      <Table
        columns={columns}
        dataSource={companies.map((c: any) => ({ ...c, key: c.id }))}
        loading={loading}
        size="small"
        rowKey="id"
        scroll={{ y: 320 }}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
      />
      <Modal title="新增公司" open={modalOpen} onOk={handleCreate} onCancel={() => setModalOpen(false)} okText="新增" cancelText="取消">
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="display_value" label="简称" rules={[{ required: true, message: '请输入简称' }]}>
            <Input placeholder="如 靠普现金" />
          </Form.Item>
          <Form.Item name="full_name" label="全称" rules={[{ required: true, message: '请输入全称' }]}>
            <Input placeholder="简称和全称一致则填相同" />
          </Form.Item>
          <Form.Item name="region" label="地区">
            <Select showSearch allowClear options={REGION_OPTIONS.map(r => ({ value: r, label: r }))} />
          </Form.Item>
          <Form.Item name="sort_order" label="排序" rules={[{ required: true, message: '请输入排序号' }]}>
            <Input type="number" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CompanyManagement;
