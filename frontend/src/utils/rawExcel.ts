/**
 * 原始表格（原始 Excel）上传/下载/预览 — 基于 Supabase Storage + 备注映射表
 *
 * bucket: excel-raw
 * 存储路径：{module}/{period}/{safeFilename}
 *   其中 module: 'payroll'（薪资计算）| 'attendance'（考勤管理）
 *   period: 'YYYY-MM'
 *
 * Supabase Storage 对象 key 不允许中文，所以：
 *   - 存储文件名用系统英文安全名  {module}_{period}_{时间戳}.xlsx
 *   - 中文备注存到 raw_excel_notes 表，展示/下载时用备注
 */
const SUPABASE_URL = 'https://avuldnywmiflbmmlgmas.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2dWxkbnl3bWlmbGJtbWxnbWFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzY0NDgsImV4cCI6MjEwMTkxMjQ0OH0.8qqzH3zMc274Di-TK_6huMhrOWppJI1L3tjIfcBV2ts';

export type RawModule = 'payroll' | 'attendance';

const bucket = 'excel-raw';
const NOTES_TABLE = 'raw_excel_notes';

/** 得到登录 token（上传时需要认证） */
function getToken(): string | null {
  return localStorage.getItem('supabase_token');
}

function getHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = {
    apikey: ANON_KEY,
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** 把原始文件名转成安全的存储文件名（不含中文/特殊字符） */
function toSafeFilename(module: RawModule, period: string, originalName: string): string {
  const extMatch = originalName.match(/\.(xlsx|xls)$/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'xlsx';
  const ts = Date.now();
  return `${module}_${period}_${ts}.${ext}`;
}

function objectPath(module: RawModule, period: string, filename: string): string {
  return `${module}/${period}/${filename}`;
}

/** 取存储对象的公开下载 URL */
export function getRawExcelUrl(module: RawModule, period: string, filename: string): string {
  const path = objectPath(module, period, filename);
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

/**
 * 上传原始 Excel，并写入中文备注到 raw_excel_notes 表。
 * 返回实际存储的文件名（英文安全名）。
 */
export async function uploadRawExcel(
  module: RawModule,
  period: string,
  originalName: string,
  note: string,
  file: File
): Promise<string> {
  const token = getToken();
  if (!token) throw new Error('未登录，无法上传');
  const safeName = toSafeFilename(module, period, originalName);
  const path = objectPath(module, period, safeName);

  // 1. 上传文件到 Storage
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: file,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`上传失败：${t || res.status}`);
  }

  // 2. 写入备注映射
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${NOTES_TABLE}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ module, period, object_name: safeName, note }),
    });
  } catch {
    // 备注写入失败不阻塞上传，仅提示
    console.warn('备注写入失败');
  }

  return safeName;
}

/**
 * 列出指定模块 + 月份的原始文件，返回带有中文备注的列表。
 */
export async function listRawExcel(
  module: RawModule,
  period: string
): Promise<{ name: string; id: string; note: string }[]> {
  // 1. 列 Storage 对象
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ prefix: `${module}/${period}/` }),
  });
  if (!res.ok) throw new Error('列表获取失败');
  const objs = (await res.json()) || [];

  // 2. 拉备注映射
  let noteMap: Record<string, string> = {};
  try {
    const q = `?select=object_name,note&module=eq.${module}&period=eq.${period}`;
    const nr = await fetch(`${SUPABASE_URL}/rest/v1/${NOTES_TABLE}${q}`, { headers: getHeaders() });
    if (nr.ok) {
      const notes = await nr.json();
      noteMap = {};
      notes.forEach((n: any) => { noteMap[n.object_name] = n.note; });
    }
  } catch { /* 忽略 */ }

  return objs.map((o: any) => {
    const name: string = o.name;
    return { name, id: o.id, note: noteMap[name] || '' };
  });
}

/** 下载文件（用备注作为下载文件名），返回 Blob 供前端触发下载 */
export async function downloadRawExcel(
  module: RawModule,
  period: string,
  filename: string,
  note: string
): Promise<void> {
  const url = getRawExcelUrl(module, period, filename);
  const res = await fetch(url);
  if (!res.ok) throw new Error('下载失败');
  const blob = await res.blob();
  // 用备注作为下载文件名（备注可能没有扩展名，自动补 .xlsx）
  const extMatch = filename.match(/\.(xlsx|xls)$/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'xlsx';
  const dlName = note ? `${note}.${ext}` : filename;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = dlName;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

/**
 * 删除原始 Excel 文件及其备注。
 * 需登录，权限由 storage RLS 控制（仅人事专员/管理员可删）。
 */
export async function deleteRawExcel(
  module: RawModule,
  period: string,
  filename: string
): Promise<void> {
  const token = getToken();
  if (!token) throw new Error('未登录，无法删除');
  const path = objectPath(module, period, filename);

  // 1. 删除 Storage 对象
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'DELETE',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`删除失败：${t || res.status}`);
  }

  // 2. 删除备注映射
  try {
    const q = `?module=eq.${module}&period=eq.${period}&object_name=eq.${encodeURIComponent(filename)}`;
    await fetch(`${SUPABASE_URL}/rest/v1/${NOTES_TABLE}${q}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
  } catch { /* 忽略 */ }
}
