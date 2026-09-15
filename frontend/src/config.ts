/**
 * 应用配置 — 所有 API 地址统一在这里管理
 *
 * API 代理地址（PROXY_URL）取值规则：
 *   - 默认空串 = **同源**：前端把请求打到自己的域名，由该域上的代理转发到 Supabase
 *       · Cloudflare Pages：cloudflare/pages/_worker.js 同源代理（无需 CORS / 不依赖 workers.dev）
 *       · 本地开发：vite.config.ts 里的 server.proxy 转发
 *   - 需要指向别处时用构建期环境变量覆盖，例如 GitHub Pages 仍走腾讯云 SCF 代理：
 *       VITE_API_PROXY=https://1466594404-6b17scw4l5.ap-guangzhou.tencentscf.com npm run build
 */
const PROXY_URL = (import.meta.env.VITE_API_PROXY ?? '').replace(/\/+$/, '');

const SUPABASE_URL = 'https://avuldnywmiflbmmlgmas.supabase.co';
// 新版 Publishable key（替代旧版 anon JWT，作为 apikey 头下发）
const SUPABASE_ANON_KEY = 'sb_publishable_CZvxeQitH63TK4C2TUI1qw_GsxLEQ4G';

export const PROXY_BASE_URL = PROXY_URL;
export const API_BASE_URL    = `${PROXY_URL}/rest/v1`;
export const AUTH_URL        = `${PROXY_URL}/auth/v1`;
export const STORAGE_URL     = `${PROXY_URL}/storage/v1`;
export const FUNCTIONS_URL   = `${PROXY_URL}/functions/v1`;

export const SCF_CONFIG = {
  supabaseUrl:      SUPABASE_URL,
  supabaseAnonKey:  SUPABASE_ANON_KEY,
  supabaseRestUrl:  `${SUPABASE_URL}/rest/v1`,
  supabaseAuthUrl:  `${SUPABASE_URL}/auth/v1`,
};

export default { API_BASE_URL, AUTH_URL, SCF_CONFIG };
