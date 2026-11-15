#!/usr/bin/env bash
# 停止 SurfCore QQ 桥接（按 state/bridge.lock 里的 PID，只发 SIGTERM）。
set -euo pipefail
cd "$(dirname "$0")"

PID="$(cat state/bridge.lock 2>/dev/null || true)"
if [ -z "${PID}" ]; then
  echo "没有找到 state/bridge.lock（桥接可能没在运行）"
  exit 0
fi
if ! kill -0 "${PID}" 2>/dev/null; then
  echo "锁文件里的 PID ${PID} 已不在运行；清理过期锁"
  rm -f state/bridge.lock
  exit 0
fi
kill "${PID}"
echo "已发送 SIGTERM 给桥接 PID ${PID}"
