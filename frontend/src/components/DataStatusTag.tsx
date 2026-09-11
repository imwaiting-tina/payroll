/**
 * 数据状态工具 — 所有模块共用。
 * 已锁定（冻结）态在所有模块统一显示红色标签，并禁用编辑/导入/计算。
 */
import React from 'react';
import { Tag } from 'antd';

/** 判定某条记录是否已锁定（冻结） */
export function isDataLocked(status?: string): boolean {
  return status === '已锁定' || status === '已提交老板查看';
}

/** 判定某月是否已锁定：任意一条记录为已锁定即视为该月锁定 */
export function anyLocked(rows: any[]): boolean {
  return rows.some(r => isDataLocked(r?.data_status));
}

/** 数据状态标签 */
export function DataStatusTag({ status }: { status?: string }) {
  if (status === '已锁定' || status === '已提交老板查看') {
    return <Tag color="red">{status}</Tag>;
  }
  if (status === '正常') return <Tag color="green">正常</Tag>;
  return <Tag color="blue">{status || '未录入'}</Tag>;
}
