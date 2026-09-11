

# 开弈薪酬系统迁移到 Cloudflare 方案


> 目标：把当前「GitHub Pages 前端 + 腾讯云 SCF API 代理」整体迁移到 Cloudflare，
> 并绑定公司域名 `staff.hro.net.cn`，后续继续维护。

---

## 一、当前架构（迁移前）

```
浏览器
  │
  ├── 前端静态站: GitHub Pages  (hro-jay.github.io/PMS/，push gitee-pages 自动部署)
  │
  └── API 调用:   腾讯云 SCF 云函数代理
          https://1466594404-6b17scw4l5.ap-guangzhou.tencentscf.com
             │  (转发 /rest/v1 /auth/v1 /storage/v1)
             ▼
          Supabase (数据库 + Auth + Storage)
          https://avuldnywmiflbmmlgmas.supabase.co
```

- **前端**：Vite 打包的纯静态 SPA（React 18 + Ant Design），HashRouter 路由。
- **API**：前端不直连 Supabase 主域，而是通过「腾讯云 SCF 云函数代理」转发，以绕过某些网络/跨域限制。
- **数据层**：Supabase，包含 PostgreSQL、Auth、Storage 三个部分。**本次迁移不涉及数据层。**

---

## 二、目标架构（迁移后）

```
浏览器
  │
  ├── 前端静态站: Cloudflare Pages   (staff.hro.net.cn)
  │
  └── API 调用:   Cloudflare Worker   (staff.hro.net.cn 或 子域 xxx.workers.dev)
          │  (转发 /rest/v1 /auth/v1 /storage/v1 到 Supabase)
          ▼
          Supabase (数据库 + Auth + Storage)  ← 不动
```

- **前端** → Cloudflare Pages：托管 Vite 的 dist，支持自动构建、自定义域名。
- **API 代理** → Cloudflare Worker：把腾讯云 SCF 的转发逻辑搬到 Worker（一个 fetch 转发函数）。
- **域名** `staff.hro.net.cn` → 绑定到 Cloudflare Pages（前端）+ Worker（API）。

---

## 三、能/不能由代码解决的事项

### ✅ 代码侧能解决（我能做）
1. 新增 Cloudflare Worker 代理函数（替换腾讯云 SCF 的转发逻辑）。
2. 前端 `config.ts` 的 `PROXY_URL` 改为 Cloudflare Worker 地址。
3. 前端相关硬编码 URL 统一改成用 config 引用。
4. 新增 Cloudflare Pages 部署配置（GitHub Actions 或 wrangler）。

### ❌ 需要公司 IT / 网络部提前完成（代码解决不了）
1. **域名注册**：`staff.hro.net.cn` 需要在 `hro.net.cn` 主域名下注册/解析。
   - 若 `hro.net.cn` 尚未注册，需先注册该主域名。
   - 需在域名注册商处，为 `staff` 子域开通解析。
2. **域名接入 Cloudflare**：把 `hro.net.cn` 的 DNS 托管到 Cloudflare（改 NS），
   或用 Cloudflare 的 CNAME 接入方式（custom hostname）。
3. **备案（可能）**：`hro.net.cn` 若走国内访问/国内节点，可能需要 ICP 备案；
   走 Cloudflare 国际节点相对宽松，但国内访问速度会受影响。需公司决策。
4. **Cloudflare 账号 + API Token**：需要公司提供 Cloudflare 账号及具备
   Pages/Workers/DNS 权限的 API Token，才能自动化创建和部署。
5. **域名所有权验证**：Cloudflare 绑定 `staff.hro.net.cn` 需验证域名归属。

---

## 四、迁移步骤（云端，需 Cloudflare 权限）

### 第 1 步：创建 Cloudflare Worker（API 代理）
- 用 Cloudflare Dashboard 或 `wrangler init`，新建一个 Worker。
- 把下方《Cloudflare Worker 代理代码》部署上去，得到 `xxx.workers.dev` 地址。
- 该 Worker 负责把 `/rest/v1`、`/auth/v1`、`/storage/v1` 转发到 Supabase，
  并透传请求头（apikey / Authorization / Content-Type），支持 CORS。

### 第 2 步：创建 Cloudflare Pages（前端）
- 在 Cloudflare Pages 新建项目，连接 GitHub 仓库（或上传 dist）。
- Build 命令：`cd frontend && npm run build`；输出目录：`frontend/dist`。
- 得到 `xxx.pages.dev` 地址。

### 第 3 步：改前端 API 指向
- 把 `frontend/src/config.ts` 的 `PROXY_URL` 改成第 1 步 Worker 的地址。
- 重新构建 + 部署到 Cloudflare Pages。

### 第 4 步：绑定域名 `staff.hro.net.cn`
- 在 Cloudflare Pages 设置 → Custom domains 添加 `staff.hro.net.cn`。
- 在 Cloudflare DNS 添加对应记录（CNAME到 pages.dev / 或 A记录到 Worker IP）。
- 域名验证 + 生效（可能需几分钟到几小时）。

### 第 5 步：后续维护
- 前端改版后，push 到 GitHub → Cloudflare Pages 自动重建（或手动 `wrangler pages deploy`）。
- Worker 改版后，`wrangler deploy` 生效。
- 域名、备案、DNS 由公司 IT 维护；代码由我们维护。

---

## 五、Cloudflare Worker 代理代码（核心）

> 把下面代码部署到 Worker，即可替代腾讯云 SCF 的转发逻辑。
> 它把所有 Supabase 请求透传到 supabase.co，并处理 CORS。

```js
// worker.js — Cloudflare Worker 代理
const SUPABASE_URL = 'https://avuldnywmiflbmmlgmas.supabase.co';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    // 透传路径: /rest/v1/... /auth/v1/... /storage/v1/...
    const target = `${SUPABASE_URL}${url.pathname}${url.search}`;

    // 复制请求头（去掉 host，带上 apikey/authorization/content-type）
    const headers = new Headers(request.headers);
    headers.set('host', new URL(SUPABASE_URL).host);
    // 允许范围（可按需放宽）
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,PUT,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-upsert, preference, range',
      'Access-Control-Expose-Headers': 'Content-Range, Range, Link',
    };

    // 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      const resp = await fetch(target, {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
      });
      const newResp = new Response(resp.body, resp);
      const newHeaders = new Headers(newResp.headers);
      Object.keys(corsHeaders).forEach(k => newHeaders.set(k, corsHeaders[k]));
      return new Response(newResp.body, { status: resp.status, headers: newHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), { status: 502, headers: corsHeaders });
    }
  }
};
```

---

## 六、前端改动的关键文件

1. `frontend/src/config.ts` — `PROXY_URL` 改为 Worker 地址（其他用 config 引用）。
2. `frontend/src/api/client.ts` — 目前直连 `SUPABASE_URL/rest/v1`，建议改为走 Worker 统一代理。
3. `frontend/src/utils/rawExcel.ts` — 用了 Supabase Storage 的直连 URL，迁移后建议也走代理。
4. `frontend/src/pages/Login.tsx`、`settings/AccountManagement.tsx` — Auth 调用地址，需统一改。

> 说明：当前前端有一部分走腾讯云代理（config.ts 的 PROXY_URL），
> 有一部分是**直连 Supabase 主域**（client.ts、rawExcel.ts、Login.tsx、AccountManagement.tsx）。
> **迁移时必须把"直连"的部分也统一改走 Cloudflare Worker**，否则会造成跨域/CORS 问题。

---

## 七、风险与注意

- **CORS**：前端跨域访问 Supabase，靠 Worker 处理 CORS 头。务必让 Worker 透传/设置好。
- **Authorization 头**：Supabase Auth 需 `apikey` 和 `Authorization: Bearer token`，Worker 要完整透传。
- **Storage**：`rawExcel.ts` 直连 `SUPABASE_URL/storage/v1/...`，迁移后建议统一走 Worker；
  若走直连 main 域，需 Supabase storage 域允许跨域。
- **域名/备案**：如前所述，属于公司 IT 职责，代码无法替代。
- **数据安全**：数据库在 Supabase 不动；前端迁移不触碰数据，风险低。但 `config.ts` 里含
  `SUPABASE_ANON_KEY` 等，部署到公网时注意不要泄露 service_role key（当前代码里
  `AccountManagement.tsx` 硬编码了 `SERVICE_ROLE_KEY`，**这是安全隐患，建议迁移时一并处理**）。

---

## 八、结论

**技术上完全可以迁移**，Cloudflare Pages + Worker 能完整替换现有 GitHub Pages + 腾讯云 SCF。
**但域名 `staff.hro.net.cn` 的注册、Cloudflare 接入、备案、API Token** 必须由公司完成。

建议**双轨并行**：
- **公司 IT**：注册域名、接入 Cloudflare、备案、提供 API Token。
- **我们**：写 Cloudflare Worker 代理、改前端 config 指向、配置部署、后续维护。
