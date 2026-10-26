import React from 'react';
import { Modal } from 'antd';

/**
 * 导入前的月份校验与确认。
 *
 * 背景：所有导入都是写入「顶部当前选中的月份」，与文件内容属于哪个月无关。
 * 一旦顶部月份选错，整份数据会静默写进错误的月份（例如把 8 月的文件导进 10 月）。
 * 这里做两道防线：
 *   1. 文件名里能识别出月份，且与目标月份不一致 → 直接阻止；
 *   2. 无法判断或月份一致 → 弹确认框，明确显示目标月份、文件名和行数。
 */

interface FileMonth {
  year: number | null;
  month: number;
  text: string; // 识别到的原文，用于提示
}

/**
 * 从文件名识别月份。
 * 支持：2026-10 / 2026_10 / 2026.10 / 2026年10月 / 202610 / 10月。
 * 识别不出返回 null（此时不拦截，只弹确认框）。
 */
export function parseMonthFromFilename(filename: string): FileMonth | null {
  const name = filename.replace(/\.[^.]+$/, ''); // 去掉扩展名

  // 带年份：2026-10、2026年10月、2026.10、2026_10、2026/10
  let m = name.match(/(20\d{2})\s*[-年._/]\s*(1[0-2]|0?[1-9])\s*月?/);
  if (m) return { year: Number(m[1]), month: Number(m[2]), text: m[0].trim() };

  // 紧凑写法：202610（后面不能再跟数字，避免把 20261026 这种日期误判成月份）
  m = name.match(/(?:^|\D)(20\d{2})(0[1-9]|1[0-2])(?:\D|$)/);
  if (m) return { year: Number(m[1]), month: Number(m[2]), text: `${m[1]}${m[2]}` };

  // 只有月份：8月 / 08月
  m = name.match(/(?:^|\D)(1[0-2]|0?[1-9])\s*月/);
  if (m) return { year: null, month: Number(m[1]), text: m[0].trim() };

  return null;
}

/**
 * 文件名月份与目标月份不一致时返回提示文案；一致或识别不出返回 null。
 */
export function fileMonthMismatch(filename: string, period: string): string | null {
  const fm = parseMonthFromFilename(filename);
  if (!fm) return null;

  const [py, pm] = period.split('-').map(Number);
  if (fm.year !== null && fm.year !== py) {
    return `文件名是 ${fm.year} 年 ${fm.month} 月（${fm.text}），当前选中的月份是 ${period}`;
  }
  if (fm.month !== pm) {
    return `文件名是 ${fm.month} 月（${fm.text}），当前选中的月份是 ${period}`;
  }
  return null;
}

/**
 * 导入前统一拦截，返回 true 表示可以继续写入。
 *
 * @param moduleLabel 模块名，用于弹窗标题，如「附加薪酬」
 * @param period      目标月份（顶部当前选中）
 * @param file        用户选择的文件
 * @param rowCount    解析出的有效行数
 * @param errorCount  解析时发现的问题行数（可选）
 */
export async function confirmImport(opts: {
  moduleLabel: string;
  period: string;
  file: File;
  rowCount: number;
  errorCount?: number;
}): Promise<boolean> {
  const { moduleLabel, period, file, rowCount, errorCount = 0 } = opts;

  // 第一道：文件名月份与目标月份明确冲突 → 直接拦下
  const mismatch = fileMonthMismatch(file.name, period);
  if (mismatch) {
    Modal.error({
      title: '月份不一致，已阻止导入',
      okText: '知道了',
      content: (
        <div style={{ lineHeight: 1.8 }}>
          <div>{mismatch}。</div>
          <div style={{ marginTop: 8 }}>
            数据会写入顶部选中的月份。请先切换到正确月份，或确认该文件属于当月后再导入。
          </div>
        </div>
      ),
    });
    return false;
  }

  // 第二道：确认框，写明目标月份、文件、行数
  return new Promise<boolean>((resolve) => {
    Modal.confirm({
      title: `确认导入${moduleLabel}`,
      width: 460,
      okText: '确认导入',
      cancelText: '取消',
      content: (
        <div style={{ lineHeight: 1.9 }}>
          <div>目标月份：<strong>{period}</strong></div>
          <div>导入文件：{file.name}</div>
          <div>
            数据行数：{rowCount}
            {errorCount > 0 ? `（另有 ${errorCount} 行存在问题）` : ''}
          </div>
          <div style={{ marginTop: 8, color: '#cf1322' }}>
            数据将写入顶部当前选中的月份，请确认月份无误。
          </div>
        </div>
      ),
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}
