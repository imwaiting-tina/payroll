import axios from 'axios';
import { API_BASE_URL, SCF_CONFIG } from '../config';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'apikey': SCF_CONFIG.supabaseAnonKey,
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('supabase_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('supabase_token');
      window.location.hash = '#/login';
    }
    return Promise.reject(error);
  }
);

// ====== 批量写入（提升上传/刷新/同步速度） ======
// 所有按月存储的表都带 UNIQUE(unique_hash, period) 约束，直接做一次批量 upsert，
// 替代原来「逐行查存在 → 逐行 patch/post」的 N+1 次请求（原来几百条数据 = 几百次往返）。

const UPSERT_CHUNK = 500; // 单次请求行数上限，超出自动分批

/**
 * 批量 upsert（insert-or-update）：一次请求写入多行。
 * 依赖目标表的 UNIQUE(unique_hash, period) 约束做冲突合并（on_conflict）。
 * @param table      表名（如 'attendance_records'）
 * @param rows       行数组，每行需含 onConflict 里的列（如 unique_hash + period）
 * @param onConflict 冲突列，逗号分隔，默认 unique_hash,period
 */
export async function bulkUpsert<T = any>(
  table: string,
  rows: T[],
  onConflict = 'unique_hash,period'
): Promise<void> {
  if (!rows || rows.length === 0) return;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    await api.post(`/${table}?on_conflict=${onConflict}`, chunk, {
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
  }
}

export default api;

