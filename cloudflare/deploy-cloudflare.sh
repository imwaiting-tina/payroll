#!/usr/bin/env bash
# =============================================================
# Cloudflare 一键部署脚本
#   1. 部署 Worker（Supabase API 代理）
#   2. 构建前端 + 部署到 Cloudflare Pages
#
# 用法:  bash deploy-cloudflare.sh
# 依赖:
#   - wrangler（全局 `npm i -g wrangler`，或直接用 npx，脚本会自动回退）
#   - .env.cloudflare 已填好 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID
#     （可选 CLOUDFLARE_PAGES_PROJECT_NAME、VITE_BASE）
# =============================================================
set -e

# 脚本可能从仓库根或任意位置调用：CF_DIR = 脚本所在目录，ROOT = 仓库根
CF_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$CF_DIR/.." && pwd)"
ENV_FILE="$ROOT/.env.cloudflare"

# 1. 读取凭证
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ 找不到 $ENV_FILE，请先填写 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID"
  exit 1
fi
set -a
source "$ENV_FILE"
set +a

if [ -z "$CLOUDFLARE_API_TOKEN" ] || [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
  echo "❌ .env.cloudflare 缺少 CLOUDFLARE_API_TOKEN 或 CLOUDFLARE_ACCOUNT_ID"
  exit 1
fi

PAGES_PROJECT="${CLOUDFLARE_PAGES_PROJECT_NAME:-payroll-system}"

# wrangler：优先用全局命令，没有则回退到 npx（本机常见情况）
if command -v wrangler >/dev/null 2>&1; then
  WRANGLER="wrangler"
else
  WRANGLER="npx --yes wrangler"
fi
echo "▶ wrangler: $WRANGLER    Pages 项目: $PAGES_PROJECT"

echo "===== 1/3 部署 Worker (supabase-proxy) ====="
cd "$CF_DIR"
CF_API_TOKEN="$CLOUDFLARE_API_TOKEN" CF_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID" \
  $WRANGLER deploy

echo ""
echo "===== 2/3 构建前端（Cloudflare Pages 挂在根目录 → VITE_BASE=/）====="
cd "$ROOT/frontend"
# Pages 项目域名是 xxx.pages.dev / staff.hro.net.cn 的根路径，
# 资源前缀必须为 / （GitHub Pages 才用 /<repo>/）；
# 如需自定义，可在 .env.cloudflare 里覆盖 VITE_BASE。
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
# _worker.js = Advanced Mode 同源代理：把 /rest /auth /storage 转发到 Supabase
cp "$CF_DIR/pages/_worker.js" dist/_worker.js
[ -f dist/_worker.js ] || { echo "❌ 缺少 dist/_worker.js（同源 API 代理）"; exit 1; }
echo "✅ 同源 API 代理已就位：dist/_worker.js"
echo ""
echo "===== 3/3 部署前端到 Cloudflare Pages ($PAGES_PROJECT) ====="
# 项目不存在时先创建（幂等，已存在会报错但被忽略）
CF_API_TOKEN="$CLOUDFLARE_API_TOKEN" CF_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID" \
  $WRANGLER pages project create "$PAGES_PROJECT" --production-branch main >/dev/null 2>&1 || true

CF_API_TOKEN="$CLOUDFLARE_API_TOKEN" CF_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID" \
  $WRANGLER pages deploy dist --project-name "$PAGES_PROJECT" --branch main --commit-dirty=true

# 取 workers.dev 子域，拼出 Worker 完整地址
SUB_DOMAIN="$(curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/subdomain" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | sed -n 's/.*"subdomain": *"\([^"]*\)".*/\1/p')"

# 取 Pages 项目真实域名（Cloudflare 可能分配 payroll-bz2 这类带后缀的子域）
PAGES_DOMAIN="$(curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PAGES_PROJECT" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | sed -n 's/.*"subdomain": *"\([^"]*\)".*/\1/p' | head -1)"

echo ""
echo "✅ 部署完成！"
if [ -n "$SUB_DOMAIN" ]; then
  echo "  Worker 地址: https://supabase-proxy.$SUB_DOMAIN.workers.dev"
else
  echo "  Worker 地址: https://supabase-proxy.<你的子域>.workers.dev（可在 Workers 面板查看）"
fi
echo "  Pages 地址:  https://${PAGES_DOMAIN:-$PAGES_PROJECT.pages.dev}  （及已绑定的自定义域名）"
echo "  下一步: 把 Worker 地址填到 frontend/src/config.ts 的 PROXY_URL，重新构建部署即可"
echo "  自定义域名: Pages → Custom domains 添加 staff.hro.net.cn"
