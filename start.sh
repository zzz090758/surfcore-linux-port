#!/usr/bin/env bash
# SurfCore QQ 桥接启动器（Linux / macOS）
#
# 用法：
#   ./start.sh                 # 前台运行（Ctrl+C 退出）
#   DSH_WEB_URL=http://127.0.0.1:3080 ./start.sh
#
# 说明：
#   · DSH 端口不需要手填：src/dsh-port.js 会扫描回环监听端口并用 /api/status 形状探活。
#   · 时区显式设成 Asia/Shanghai，避免服务器默认 UTC 让「每日额度 / 作息窗口」错 8 小时。
set -euo pipefail
cd "$(dirname "$0")"

export TZ="${TZ:-Asia/Shanghai}"
# 可选：把本地覆盖项放在 .env.linux（不要提交）
if [ -f .env.linux ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.linux
  set +a
fi

exec node src/bridge.js
