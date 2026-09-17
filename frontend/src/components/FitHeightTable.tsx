import React, { useEffect, useRef, useState } from 'react';
import { Table } from 'antd';
import type { TableProps } from 'antd';

/**
 * 撑满剩余视口高度的表格：页面不滚动、一屏显示尽可能多的行（≥20），
 * 且表体横向滚动条常驻在视口底部可见（表体底边贴近视口底边，页面不再滚动）。
 * 用法：把 <Table scroll={{ x: N, y: 480 }} /> 换成 <FitHeightTable scroll={{ x: N }} />
 */
interface FitHeightTableProps<T extends object = any> extends TableProps<T> {
  /** 表格下方额外占用的高度（如「字段注释」卡），一并预留以免页面出现滚动 */
  extraBottom?: number;
}

export default function FitHeightTable<T extends object = any>({ scroll, extraBottom = 0, ...rest }: FitHeightTableProps<T>) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(480);

  useEffect(() => {
    const measure = () => {
      const el = wrapRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      // 底部预留：表头(~39) + 分页器(~64) + 内容区底部留白(~32) + 表格下方额外内容(extraBottom)
      setHeight(Math.max(240, window.innerHeight - top - 140 - extraBottom));
    };
    measure();
    const t1 = setTimeout(measure, 300);
    const t2 = setTimeout(measure, 1000);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', measure);
    };
  }, [extraBottom]);

  return (
    <div ref={wrapRef}>
      <Table<T> {...rest} scroll={{ ...scroll, y: height }} />
    </div>
  );
}
