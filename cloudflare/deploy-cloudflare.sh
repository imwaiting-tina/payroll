#!/usr/bin/env bash
# =============================================================
# Cloudflare 一键部署脚本
#   1. 部署 Worker（Supabase API 代理）
#   2. 构建前端 + 部署到 Cloudflare Pages
#
# 用法:  bash deploy-cloudflare.sh
# 依赖:
#   - 已安装 wrangler  (npm i -g wrangler)
#   - .env.cloudflare 已填好 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID
#   - CLOUDFLARE_PAGES_PROJECT_NAME（要部署到的 Pages 项目名）
# =============================================================
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
CF_DIR="$ROOT/cloudflare"
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

echo "===== 1/3 部署 Worker (supabase-proxy) ====="
cd "$CF_DIR"
CF_API_TOKEN="$CLOUDFLARE_API_TOKEN" CF_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID" \
  wrangler deploy

echo ""
echo "===== 2/3 构建前端 ====="
cd "$ROOT/frontend"
npm run build

# 把 Pages 的 _redirects/_headers 拷进 dist（Cloudflare Pages 读取它们）
cp "$CF_DIR/pages/_redirects" dist/_redirects 2>/dev/null || true
cp "$CF_DIR/pages/_headers" dist/_headers 2>/dev/null || true

echo ""
echo "===== 3/3 部署前端到 Cloudflare Pages ($PAGES_PROJECT) ====="
CF_API_TOKEN="$CLOUDFLARE_API_TOKEN" CF_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID" \
  wrangler pages deploy dist --project-name "$PAGES_PROJECT" --branch main

echo ""
echo "✅ 部署完成！"
echo "  Worker 地址: https://supabase-proxy.<你的子域>.workers.dev"
echo "  Pages 地址: https://$PAGES_PROJECT.pages.dev"
echo "  请把上面两个地址用于前端 config.ts 和绑定 staff.hro.net.cn"
