/**
 * 通用计算/刷新进度卡片 — 用于各模块"计算XX"按钮的进度反馈
 * 用法：
 *   const [progress, setProgress] = useState({done:0,total:0,active:false,label:''});
 *   点击计算时 setProgress({done:0,total:N,active:true,label:'正在计算...'});
 *   循环里 setProgress(p=>({...p,done:p.done+1}));
 *   结束 setProgress({active:false});
 *   <CalcProgress {...progress} />
 */
import React from 'react';
import { Card, Progress as AntProgress } from 'antd';

interface Props {
  done: number;
  total: number;
  active: boolean;
  label?: string;
}

const CalcProgress: React.FC<Props> = ({ done, total, active, label }) => {
  if (!active) return null;
  const percent = total > 0 ? Math.round((done / total) * 100) : 100;
  return (
    <Card size="small" style={{ marginBottom: 12 }}>
      <AntProgress percent={percent} status="active" />
      <div style={{ textAlign: 'center', color: '#888', marginTop: 4 }}>
        {label || '正在计算'}，已处理 {done} / {total} 条
      </div>
    </Card>
  );
};

export default CalcProgress;
