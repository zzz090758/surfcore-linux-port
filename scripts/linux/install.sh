#!/usr/bin/env bash
# SurfCore Linux 一键安装：依赖 + DSH 插件注册。
# 前置：Node >= 22.13、DSH 已安装（dsh 在 PATH，或 ~/dsh/node_modules/.bin/dsh）。
set -euo pipefail
cd "$(dirname "$0")/../.."
REPO="$(pwd)"

echo "== SurfCore Linux install =="
echo "repo: $REPO"
node -v
npm -v

echo "== 1/3 安装依赖 =="
npm install --no-audit --no-fund

echo "== 2/3 找到 DSH CLI =="
if command -v dsh >/dev/null 2>&1; then
  DSH_BIN="$(command -v dsh)"
elif [ -x "${HOME}/dsh/node_modules/.bin/dsh" ]; then
  DSH_BIN="${HOME}/dsh/node_modules/.bin/dsh"
else
  echo "找不到 dsh。请先安装 DSH（例如 npm i @deepseek-ai/dsh@0.2.1-rc.2），或把 dsh 放进 PATH。" >&2
  exit 1
fi
export PATH="$(dirname "$DSH_BIN"):${HOME}/.local/bin:${PATH}"
echo "dsh: $DSH_BIN ($("$DSH_BIN" --version 2>/dev/null | head -1))"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "== 安装 pnpm 到 ~/.local（DSH plugin install 需要）=="
  npm i -g pnpm@9 --prefix "${HOME}/.local" --no-audit --no-fund
  export PATH="${HOME}/.local/bin:${PATH}"
fi

echo "== 3/3 注册 surfcore bundle + MCP + preset =="
node scripts/setup-dsh.mjs "${DSH_PROFILE:-web}"

chmod +x start.sh stop.sh scripts/linux/*.sh 2>/dev/null || true

cat <<EOF

完成。下一步：
  1) 重启 DSH：systemctl --user restart dsh-web.service（或手动 pkill -f 'dsh web' 后重新 dsh web）
  2) 启动桥接：./start.sh
  3) 可选：安装 DSH 为 systemd 用户服务
       scripts/linux/install-dsh-service.sh
  4) 可选：起 SnowLuma2 Docker（QQ 登录用）
       scripts/linux/install-snowluma.sh
EOF
