import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Pages 站点都挂在「仓库子路径」下，所以 base 必须和仓库名一致：
 *   GitHub Pages → https://<user>.github.io/<repo>/   例：/payroll/
 *   Gitee  Pages → https://<user>.gitee.io/<repo>/    例：/payroll/
 * 如果部署在根目录（自定义域名 / Vercel），用 VITE_BASE=/ 覆盖。
 *
 * 取值优先级：VITE_BASE 环境变量 > CI 注入的仓库名(GITHUB_REPOSITORY) > 默认 'payroll'
 */
const repoName =
  (process.env.GITHUB_REPOSITORY || '').split('/').filter(Boolean).pop() || 'payroll';

const normalizeBase = (path: string) => (path.endsWith('/') ? path : `${path}/`);

const base = normalizeBase(process.env.VITE_BASE || `/${repoName}/`);

/** Supabase 主域 —— 本地开发时把同源 API 请求转发到这里（等价于线上的 Pages Functions 代理） */
const SUPABASE_ORIGIN = 'https://avuldnywmiflbmmlgmas.supabase.co';

export default defineConfig({
  plugins: [react()],
  base,
  server: {
    port: 3000,
    open: true,
    // 前端 config.ts 默认用「同源」API（PROXY_BASE_URL = ''），
    // 开发环境下由这里的 proxy 把 /rest /auth /storage 转发到 Supabase。
    proxy: {
      '/rest': { target: SUPABASE_ORIGIN, changeOrigin: true, secure: true },
      '/auth': { target: SUPABASE_ORIGIN, changeOrigin: true, secure: true },
      '/storage': { target: SUPABASE_ORIGIN, changeOrigin: true, secure: true },
    },
  },
  build: {
    outDir: 'dist',
  },
  resolve: {
    alias: {
      src: '/src',
    },
  },
});