import * as XLSX from 'xlsx';

/**
 * 通用导入导出工具
 *
 * 每个模块定义自己的表头定义（ExportDef），然后调用
 *   - exportXlsx(def, data, filename)
 *   - importXlsx(def, file): Promise<{data, errors}>
 *
 * 表头定义：
 *   - label:  导出的列名（表头文字）
 *   - key:    数据字段名
 *   - hidden: 可选，true 表示导出时不导出（如唯一值设为 false 即可导出）
 */

export interface ColumnDef {
  key: string;         // 数据字段名
  label: string;       // 表头文字
  hidden?: boolean;    // true = 导出时不导出
  required?: boolean;  // true = 导入时必填
}

export interface ExportDef {
  module: string;        // 模块名，如 '员工花名册'
  columns: ColumnDef[];
}

/**
 * 导出为 XLSX 并触发浏览器下载。
 * @param def    表头定义
 * @param data   数据数组
 * @param period 月份（如 2026-08），会自动拼进文件名
 */
export function exportXlsx(def: ExportDef, data: any[], period?: string) {
  const visibleColumns = def.columns.filter(c => !c.hidden);

  // 列标题行
  const headerRow = visibleColumns.map(c => c.label);

  // 数据行
  const rows = data.map(row =>
    visibleColumns.map(c => {
      const val = row[c.key];
      return val !== undefined && val !== null ? val : '';
    })
  );

  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, def.module);

  const suffix = period ? `_${period}` : '';
  const filename = `${def.module}${suffix}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * 把单元格值里的日期（Date 对象或 Excel 序列号）转成 YYYY-MM-DD 字符串。
 */
function formatDateCell(val: any): any {
  // Date 对象（cellDates: true 时日期单元格会读成 Date）
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // Excel 日期序列号（5 位数字，约 40000~60000 范围）
  if (typeof val === 'number' && val >= 40000 && val <= 60000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(val) * 86400000);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return val;
}

/**
 * 清洗单元格值：把带千分位逗号的数字字符串（如 " 7,500.00 "）转成数字。
 * raw:false 读取时，超过1000的数字会带逗号，导致 Number() 变成 NaN。
 */
function cleanNumberString(val: any): any {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    // 匹配带千分位逗号的数字（如 7,500.00、1,448.3、-3,295.01）
    if (/^-?[\d,]+\.?\d*$/.test(trimmed) && trimmed.includes(',')) {
      const num = Number(trimmed.replace(/,/g, ''));
      if (!isNaN(num)) return num;
    }
  }
  return val;
}

/**
 * 把任意常见日期表示统一成严格的 YYYY-MM-DD，无法识别时返回 null。
 * 覆盖：Date 对象、Excel 序列号、YYYY/MM/DD、YYYY-MM-DD（含无补零）、YYYYMMDD、M/D/YYYY。
 */
export function normalizeDateToIso(val: any): string | null {
  if (val === undefined || val === null || val === '') return null;
  // Date 对象
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // Excel 日期序列号（5 位数字，约 40000~60000）
  if (typeof val === 'number' && val >= 40000 && val <= 60000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(val) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  if (!s) return null;
  // YYYY-MM-DD（可带时间；月/日无补零也能识别）
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  // YYYY/M/D
  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  // YYYYMMDD
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // 中文年月日：2026年6月1日 / 2026年06月01日
  m = s.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  // M/D/YYYY（无年份在前的写法，按美式月/日/年）
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return null;
}

/**
 * 导入 XLSX 文件，返回解析后的数据。
 * 自动匹配表头文字 → key，日期单元格自动转成 YYYY-MM-DD。
 *
 * @param def   表头定义
 * @param file  File 对象
 * @returns     { data: Record<string, any>[], import_errors: string[] }
 */
export function importXlsx(def: ExportDef, file: File): Promise<{
  data: Record<string, any>[];
  import_errors: string[];
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });

        if (rows.length < 2) {
          resolve({ data: [], import_errors: [] });
          return;
        }

        // 第一行是表头，建立 label → key 映射
        const headerRow = rows[0] as string[];
        const labelToKey: Record<string, string> = {};
        const labelToRequired: Record<string, boolean> = {};

        for (const col of def.columns) {
          if (col.hidden) continue;
          labelToKey[col.label] = col.key;
          labelToRequired[col.label] = col.required || false;
        }

        const data: Record<string, any>[] = [];
        const import_errors: string[] = [];

        // 跳过标题行（行 2+）
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.every(cell => cell === undefined || cell === null || cell === '')) continue;

          const record: Record<string, any> = {};
          for (let j = 0; j < headerRow.length; j++) {
            const label = (headerRow[j] || '').toString().trim();
            const key = labelToKey[label];
            if (key) {
              const val = row[j];
              record[key] = val !== undefined && val !== null && val !== '' ? cleanNumberString(formatDateCell(val)) : undefined;
            }
          }

          // 校验必填
          for (let j = 0; j < headerRow.length; j++) {
            const label = (headerRow[j] || '').toString().trim();
            if (labelToRequired[label]) {
              const key = labelToKey[label];
              if (record[key] === undefined || record[key] === null || record[key] === '') {
                import_errors.push(`第 ${i + 1} 行 "${label}" 为空`);
              }
            }
          }

          if (Object.keys(record).length > 0) {
            data.push(record);
          }
        }

        resolve({ data, import_errors });
      } catch (err: any) {
        reject(new Error(`解析文件失败: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsBinaryString(file);
  });
}
