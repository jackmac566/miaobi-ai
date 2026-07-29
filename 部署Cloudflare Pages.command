#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "未检测到 Node.js。请先从 https://nodejs.org 安装 LTS 版本，然后重新双击本文件。"
  read -r -p "按回车键退出…"
  exit 1
fi

if [ -f "package.json" ]; then
  if [ ! -x "node_modules/.bin/vite" ]; then
    echo "首次运行，正在安装部署所需组件…"
    npm ci --no-audit --no-fund
  fi
  node scripts/deploy-cloudflare-pages.mjs
else
  # 发布包已经包含验收后的 dist，不需要安装整套开发依赖。
  node scripts/deploy-cloudflare-pages.mjs --skip-build
fi

echo
read -r -p "部署流程结束。按回车键关闭窗口…"
