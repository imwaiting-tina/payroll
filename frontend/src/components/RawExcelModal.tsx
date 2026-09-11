import React, { useEffect, useState } from 'react';
import { Modal, Button, Upload, Space, Table, message, Empty, Typography, Input } from 'antd';
import { UploadOutlined, DownloadOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
import { uploadRawExcel, listRawExcel, downloadRawExcel, deleteRawExcel, type RawModule } from '../utils/rawExcel';
import { canSubmit } from '../utils/permissions';
import { useStore } from '../stores/appStore';

interface RawExcelModalProps {
  open: boolean;
  module: RawModule;
  moduleLabel: string;  // 如 '薪资计算' / '考勤管理'
  onClose: () => void;
}

interface RowDef {
  key: string;
  name: string;   // 存储英文安全名
  note: string;   // 中文备注
}

const RawExcelModal: React.FC<RawExcelModalProps> = ({ open, module, moduleLabel, onClose }) => {
  const period = useStore(s => s.currentPeriod);
  const [fileList, setFileList] = useState<RowDef[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  // 上传时填写的备注
  const [note, setNote] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const canUpload = canSubmit(module); // 仅人事专员可上传

  const loadList = async () => {
    setLoading(true);
    try {
      const lst = await listRawExcel(module, period);
      setFileList(lst.map(f => ({ key: f.id || f.name, name: f.name, note: f.note || '' })));
    } catch {
      setFileList([]);
    }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open) { loadList(); setNote(''); setPendingFile(null); } }, [open, period, module]);

  // 用户选择文件后，暂存并等待填写备注
  const handleSelectFile = (file: File) => {
    setPendingFile(file);
    return false; // 阻止默认上传
  };

  // 确认上传：备注必填
  const handleUpload = async () => {
    if (!pendingFile) { message.warning('请先选择文件'); return; }
    if (!note.trim()) { message.warning('请填写备注'); return; }
    setUploading(true);
    try {
      await uploadRawExcel(module, period, pendingFile.name, note.trim(), pendingFile);
      message.success('上传成功');
      setPendingFile(null);
      setNote('');
      await loadList();
    } catch (e: any) {
      message.error(e?.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  // 下载（用备注作为文件名）
  const handleDownload = async (r: RowDef) => {
    try {
      await downloadRawExcel(module, period, r.name, r.note);
    } catch (e: any) {
      message.error(e?.message || '下载失败');
    }
  };

  // 删除（仅人事专员/管理员）
  const handleDelete = async (r: RowDef) => {
    try {
      await deleteRawExcel(module, period, r.name);
      message.success('已删除');
      await loadList();
    } catch (e: any) {
      message.error(e?.message || '删除失败');
    }
  };

  return (
    <Modal
      title={`${moduleLabel} · 原始表格（${period}）`}
      open={open}
      onCancel={onClose}
      footer={null}
      width={700}
    >
      {canUpload && (
        <Space style={{ marginBottom: 12 }} wrap>
          <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={handleSelectFile}>
            <Button type="primary" icon={<UploadOutlined />}>选择文件</Button>
          </Upload>
          <Input
            placeholder="填写备注，如：6月考勤表"
            value={note}
            onChange={e => setNote(e.target.value)}
            style={{ width: 220 }}
            maxLength={50}
          />
          <Button
            type="primary"
            onClick={handleUpload}
            loading={uploading}
            disabled={!pendingFile || !note.trim()}
          >
            上传
          </Button>
          {pendingFile && <Typography.Text type="secondary">{pendingFile.name}</Typography.Text>}
        </Space>
      )}

      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={loadList} loading={loading}>刷新</Button>
        {!canUpload && <Typography.Text type="secondary">上传仅限人事专员，你可下载</Typography.Text>}
      </Space>

      {fileList.length === 0 ? (
        <Empty description={`${period} 暂无原始表格文件`} />
      ) : (
        <Table
          size="small"
          rowKey="key"
          columns={[
            { title: '备注', dataIndex: 'note', key: 'note', ellipsis: true, render: (v: string) => v || '—' },
            {
              title: '操作', key: 'act', width: 160,
              render: (_: any, r: RowDef) => (
                <Space size={4}>
                  <Button size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(r)}>下载</Button>
                  {canUpload && <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r)}>删除</Button>}
                </Space>
              ),
            },
          ]}
          dataSource={fileList}
          loading={loading}
          pagination={false}
        />
      )}
    </Modal>
  );
};

export default RawExcelModal;
