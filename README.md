# Payroll Management System

> 开弈集团多公司薪酬管理系统 — 替代 16 张 Excel 工作表的全栈 Web 应用

## ✨ 功能概览

| 模块 | 说明 |
|------|------|
| 🏢 花名册管理 | 27 家公司员工 CRUD、批量导入、社保基数管理 |
| 💰 薪资计算引擎 | 10 个核心公式、三种计税模式、公司差异化取整 |
| 🛡️ 社保公积金 | 上海/北京/天津/深圳/南京五地费率、个人+公司双向计算 |
| 📊 个税引擎 | 七级累进累计预扣法 + 劳务报酬 20% 法 + 免税模式 |
| 📋 考勤调整 | 病假/事假/年假/加班自动折算工资扣减 |
| 📤 报表导出 | 完整 Excel 模板导出（与原始格式一致）、工资条生成 |
| 🔐 权限控制 | Supabase Auth + RLS 行级安全、审计日志全记录 |

## 🏢 覆盖公司（27 家）

| 地区 | 公司 | 社保标准 |
|------|------|----------|
| 香港 (2) | 開弈（中國）人才服務有限公司、中國時代開弈投資集團有限公司 | 不计税 |
| 上海 (18) | 开弈信息科技（中国）有限公司、上海开弈人才服务（集团）有限公司、上海开弈人力资源管理有限公司 等 | 上海标准 (ROUND) |
| 北京 (1) | 北京开弈点才劳务服务有限公司 | 北京标准 (ROUNDUP) |
| 天津 (2) | 开弈英才（天津）劳务服务有限公司、弈享（天津）共享经济信息咨询有限公司 | 天津标准 |
| 深圳 (2) | 深圳市和弈劳务派遣有限公司、开弈信息技术（深圳）有限公司 | 深圳标准 (1位小数) |
| 南京 (1) | 南京开弈人力资源管理有限公司 | 南京标准 |

> 完整映射见 `company_mapping.json`

## 🛠️ 技术栈

```
Frontend  → React 18 + TypeScript + Ant Design 5 + AG Grid + ECharts
Backend   → Python FastAPI + SQLAlchemy 2.0 + Pydantic v2
Database  → Supabase (PostgreSQL 15) + Auth + RLS + Edge Functions
Cache     → Upstash Redis
CI/CD     → GitHub Actions → Vercel + Supabase
```

## 🚀 快速开始

### 前置条件

- [GitHub 账号](https://github.com) + [gh CLI](https://cli.github.com)
- [Supabase 账号](https://supabase.com) (免费层即可起步)
- [Vercel 账号](https://vercel.com) (免费层)
- Node.js 20+ / Python 3.11+ / Docker

### 一键部署流程

```bash
# 1️⃣ 克隆仓库
git clone https://github.com/YOUR_ORG/payroll-system.git
cd payroll-system
cp .env.example .env  # 填入你的密钥

# 2️⃣ 启动 Supabase 本地环境
supabase start

# 3️⃣ 初始化数据库 + 种子数据
supabase db push
python scripts/seed_companies.py

# 4️⃣ 启动后端 (Terminal 2)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload

# 5️⃣ 启动前端 (Terminal 3)
cd frontend
npm install
npm start
```

打开 http://localhost:3000 即可使用。

### 部署到生产

```bash
# 推送 main 分支 → GitHub Actions 自动部署
git push origin main
# → 前端自动部署到 Vercel
# → 数据库迁移自动推送到 Supabase
```

## 🌐 静态站点（GitHub Pages / Gitee Pages）

前端是纯静态 SPA（`HashRouter`），可以直接托管在 Pages 上：

| 站点 | 地址 | 说明 |
|------|------|------|
| GitHub Pages | `https://<GitHub 用户名>.github.io/payroll/#/` | 推送 `gitee-pages` 分支后由 `.github/workflows/deploy-pages.yml` 自动构建部署 |
| Gitee Pages | `https://<Gitee 用户名>.gitee.io/payroll/` | 用仓库自带的 `docs/` 目录发布（Gitee 仓库 → 服务 → Gitee Pages → 分支 `gitee-pages` + 目录 `docs`） |

> **首次启用需要仓库管理员做两处设置（普通协作者无权限）：**
> 1. **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**；
> 2. **Settings → Environments → github-pages → Deployment branches and tags** 里加入 `gitee-pages`
>    （否则工作流会报 `Branch "gitee-pages" is not allowed to deploy to github-pages due to environment protection rules`）。
>
> 管理员也可以直接跑脚本一键完成（并触发一次部署）：
>
> ```bash
> gh auth login                        # 换用管理员账号
> bash scripts/setup-pages.sh          # 默认 imwaiting-tina/payroll + gitee-pages
> ```

Pages 站点挂在仓库子路径 `/payroll/` 下，`frontend/vite.config.ts` 会按仓库名自动计算 `base`，
也可以显式覆盖（部署在根目录时用 `VITE_BASE=/`）：

```bash
cd frontend
npm ci

# GitHub Pages / Gitee Pages：资源前缀 /payroll/，产物在 frontend/dist
npm run build

# 刷新 Gitee Pages 用的发布目录（产物写入仓库根 docs/）
npm run build:docs

# 自定义域名 / Vercel 等根目录部署
VITE_BASE=/ npm run build
```

> **过渡说明**：当前 fork 的 Pages 仍是旧模式（`Deploy from a branch: main /`，且账号没有管理员权限改设置），
> 因此 `main` 分支根目录额外放了一份构建产物（`index.html` + `assets/` + `.nojekyll`）先让站点可用：
> `https://imwaiting-tina.github.io/payroll/#/`。
> 管理员按上面的两步切换到 **GitHub Actions** 之后，可以删除这三个文件，之后推送 `gitee-pages` 即自动部署。

## ☁️ Cloudflare 部署（Worker + Pages）

前端与 API 代理都可托管在 Cloudflare（替代 GitHub Pages + 腾讯云 SCF）：

| 资源 | 地址 | 说明 |
|------|------|------|
| Pages（前端） | `https://payroll-bz2.pages.dev`、`https://staff.hro.net.cn` | 项目名 `payroll`，已绑定自定义域名 `staff.hro.net.cn` |
| Worker（API 代理） | `https://supabase-proxy.hro-payroll.workers.dev` | 把 `/rest/v1`、`/auth/v1`、`/storage/v1` 转发到 Supabase 并处理 CORS |

一键部署（先在仓库根目录建 `.env.cloudflare`，写入 `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN`，
可选 `CLOUDFLARE_PAGES_PROJECT_NAME`，该文件已在 `.gitignore` 中）：

```bash
bash cloudflare/deploy-cloudflare.sh
# 1) 部署 Worker supabase-proxy（输出 workers.dev 地址）
# 2) 构建前端（Cloudflare Pages 在根路径 → VITE_BASE=/），并自检资源前缀
# 3) 部署到 Pages 项目（默认 payroll，可覆盖）
```

> **两个坑（脚本已处理）**
> 1. Pages 站点在根路径，`VITE_BASE` 必须是 `/`；Git Bash(MSYS) 会把 `/` 自动转成 `D:/Git/`，
>    脚本用 `MSYS_NO_PATHCONV` / `MSYS2_ENV_CONV_EXCL` 关掉，并在构建后自检 `dist/index.html`。
> 2. 账号若还没有 workers.dev 子域，需先注册（本仓库当前为 `hro-payroll`）：
>    Dashboard → Workers & Pages 首次打开会自动创建，或 `PUT /accounts/{id}/workers/subdomain`。
>
> **国内可达性**：`*.workers.dev` 在部分网络会被 DNS 污染导致不可达，
> 若要给国内用户用，建议把代理改为 **Pages Functions**（同域 `https://staff.hro.net.cn/rest/v1/...`），
> 或把域名接入 Cloudflare 后给 Worker 绑自定义域名。

## 📁 项目结构

```
payroll-system/
├── .github/workflows/ci.yml   # CI/CD 流水线
├── backend/                    # FastAPI 后端
├── frontend/                   # React 前端
├── supabase/                   # DB 迁移 + Edge Functions
├── scripts/                    # 工具脚本
├── company_mapping.json        # ★ 27 家公司简称↔全称映射
├── CLAUDE.md                  # ★ Claude Code 开发指引
└── README.md
```

## 🧪 测试

```bash
cd backend
pytest tests/ -v --cov=app --cov-fail-under=90
```

## 📄 文档

- `CLAUDE.md` — 给 Claude Code 的完整开发指引（公式、Schema、部署全在里面）
- `company_mapping.json` — 公司全称映射表（唯一权威来源）
- `supabase/seed.sql` — 数据库种子数据

## 🔐 安全

- 银行账号、身份证号 → AES-256 加密存储
- 所有表启用 RLS 行级安全
- 每次写入记录审计日志 (before/after JSONB)
- 锁定记录不可修改（需审批解锁）

## 📜 License

Private — 仅供开弈集团内部使用
