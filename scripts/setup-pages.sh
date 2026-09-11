#!/usr/bin/env bash
# ============================================================
# 一键配置 GitHub Pages（用 Actions 部署 gitee-pages 分支）
# ------------------------------------------------------------
# 需要「仓库管理员」权限的账号（普通协作者无法修改 Pages / 环境设置）：
#   gh auth login                 # 换用管理员账号
#   bash scripts/setup-pages.sh   # 默认 owner/repo = imwaiting-tina/payroll
#
# 它做了三件事：
#   1. Settings → Pages → Source 切换为 GitHub Actions（build_type=workflow）
#   2. 允许 gitee-pages 分支部署到 github-pages 环境（否则报
#      “Branch "gitee-pages" is not allowed to deploy to github-pages”）
#   3. 手动触发一次 deploy-pages 工作流
# ============================================================
set -euo pipefail

REPO="${1:-imwaiting-tina/payroll}"
BRANCH="${2:-gitee-pages}"
ENV_NAME="github-pages"
OWNER="${REPO%%/*}"

echo "▶ 仓库：$REPO   部署分支：$BRANCH"

echo "1/3 将 Pages 构建方式切换为 GitHub Actions …"
gh api -X PUT "repos/$REPO/pages" -f build_type=workflow >/dev/null

echo "2/3 允许 $BRANCH 分支部署到 $ENV_NAME 环境 …"
gh api -X POST "repos/$REPO/environments/$ENV_NAME/deployment-branch-policies" \
  -f name="$BRANCH" -f type=branch >/dev/null 2>&1 || echo "   （分支策略已存在，跳过）"

echo "3/3 触发部署工作流 …"
gh workflow run deploy-pages.yml --repo "$REPO" --ref "$BRANCH"

echo "✅ 配置完成，1~2 分钟后访问：https://$OWNER.github.io/${REPO##*/}/#/"
