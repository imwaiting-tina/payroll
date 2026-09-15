#!/usr/bin/env bash
# =============================================================
# Cloudflare Pages 一键部署脚本（同源代理架构）
#
#   1. 构建前端（VITE_BASE=/，资源挂在域名根路径）
#   2. 把同源代理 _worker.js + _redirects + _headers 拷进 dist
#   3. wrangler pages deploy 上传到 Cloudflare Pages
#
# 架构说明：不再部署独立 Worker 代理、也不走腾讯云 SCF。
#   前端 config.ts 默认 PROXY_URL=''（同源），请求打到本域
#   /rest /auth /storage /functions，由 dist/_worker.js（Advanced Mode）
#   统一转发到 Supabase。
#
# 用法:  bash deploy-cloudflare.sh
# 依赖:
#   - wrangler（全局 `npm i -g wrangler`，或脚本自动回退到 npx）
#   - 已登录 wrangler（首次运行 `npx wrangler login` 授权一次即可，之后长期有效）
# =============================================================
set -e

# 脚本可能从仓库根或任意位置调用：CF_DIR = 脚本所在目录，ROOT = 仓库根
CF_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$CF_DIR/.." && pwd)"

# 可选覆盖项（凭证走 wrangler 已保存的登录态，无需 API Token）：
#   CLOUDFLARE_PAGES_PROJECT_NAME   Pages 项目名，默认 payroll
#   VITE_BASE                       资源前缀，默认 /
# 若存在 .env.cloudflare，则读取其中的覆盖值（不读密钥）
ENV_FILE="$ROOT/.env.cloudflare"
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

PAGES_PROJECT="${CLOUDFLARE_PAGES_PROJECT_NAME:-payroll}"

# wrangler：优先用全局命令，没有则回退到 npx（本机常见情况）
if command -v wrangler >/dev/null 2>&1; then
  WRANGLER="wrangler"
else
  WRANGLER="npx --yes wrangler"
fi
echo "▶ wrangler: $WRANGLER    Pages 项目: $PAGES_PROJECT"

echo ""
echo "===== 1/2 构建前端（同源代理 → VITE_BASE=/）====="
cd "$ROOT/frontend"
# Pages 域名挂在根路径（staff.hro.net.cn / xxx.pages.dev），资源前缀必须是 /
# （GitHub/Gitee Pages 才用 /<repo>/）。
# 注意：Git Bash(MSYS) 会把环境变量里的 "/" 自动转换成 D:/Git/ 之类的 Windows 路径，
#      必须关掉该转换，否则产物会写成 /Git/assets/... 上线即 404。
export MSYS_NO_PATHCONV=1
export MSYS2_ENV_CONV_EXCL="VITE_BASE"
VITE_BASE="${VITE_BASE:-/}" npm run build

# 构建后自检：资源前缀必须是 / 开头且不含盘符
if ! grep -q 'src="/assets/' dist/index.html; then
  echo "❌ 构建产物的资源前缀不对（dist/index.html）："
  grep -o 'src="[^"]*"' dist/index.html || true
  exit 1
fi
echo "✅ 资源前缀自检通过：$(grep -o 'src="[^"]*"' dist/index.html | head -1)"

# 把 Pages 的 _redirects/_headers/_worker.js 拷进 dist（Cloudflare Pages 读取它们）
cp "$CF_DIR/pages/_redirects" dist/_redirects 2>/dev/null || true
cp "$CF_DIR/pages/_headers" dist/_headers 2>/dev/null || true
# _worker.js = Advanced Mode 同源代理：把 /rest /auth /storage /functions 转发到 Supabase
cp "$CF_DIR/pages/_worker.js" dist/_worker.js
[ -f dist/_worker.js ] || { echo "❌ 缺少 dist/_worker.js（同源 API 代理）"; exit 1; }
echo "✅ 同源 API 代理已就位：dist/_worker.js"

echo ""
echo "===== 2/2 部署前端到 Cloudflare Pages ($PAGES_PROJECT) ====="
# 项目不存在时先创建（幂等，已存在会报错但被忽略）
$WRANGLER pages project create "$PAGES_PROJECT" --production-branch main >/dev/null 2>&1 || true

$WRANGLER pages deploy dist --project-name "$PAGES_PROJECT" --branch main --commit-dirty=true

echo ""
echo "✅ 部署完成！线上地址见上方 wrangler 输出的 Deployment URL（及自定义域名 staff.hro.net.cn）"
