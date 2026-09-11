import React from 'react';
import { Tag } from 'antd';

/**
 * 数据来源胶囊标签组件
 * 用于表格列标题下方，标出该列数据来源
 */

export type SourceType = '花名册同步' | '导入' | '单独新增' | '系统计算' | '花名册同步+导入' | '系统计算+导入' | '考勤同步' | '附加薪酬同步' | '社保同步' | '个税同步' | '薪资计算同步';

const SOURCE_COLORS: Record<string, string> = {
  '花名册同步': 'blue',
  '导入': 'orange',
  '单独新增': 'cyan',
  '系统计算': 'purple',
  '花名册同步+导入': 'geekblue',
  '系统计算+导入': 'magenta',
  '考勤同步': 'green',
  '附加薪酬同步': 'volcano',
  '社保同步': 'gold',
  '个税同步': 'lime',
  '薪资计算同步': 'blue',
};

/**
 * 生成带来源标签的列标题
 * @param title 列标题
 * @param source 数据来源
 */
export function withSource(title: string, source?: SourceType): React.ReactNode {
  if (!source) return title;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.3 }}>
      <span style={{ fontWeight: 600 }}>{title}</span>
      <Tag
        color={SOURCE_COLORS[source] || 'default'}
        style={{ fontSize: 10, lineHeight: '14px', marginTop: 2, marginInlineEnd: 0, padding: '0 4px' }}
      >
        {source}
      </Tag>
    </div>
  );
}

/** 来源标签组件（单独使用） */
export const SourceTag: React.FC<{ source?: SourceType }> = ({ source }) => {
  if (!source) return null;
  return (
    <Tag color={SOURCE_COLORS[source] || 'default'} style={{ fontSize: 10, lineHeight: '14px', marginInlineEnd: 0, padding: '0 4px' }}>
      {source}
    </Tag>
  );
};

export default withSource;
