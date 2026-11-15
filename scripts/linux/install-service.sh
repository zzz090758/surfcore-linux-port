#!/usr/bin/env bash
# 把 SurfCore 桥接安装成 systemd --user 服务（登录后自启，崩溃自动重启）。
# 依赖：DSH 已经在同一用户下运行；否则桥接会一直重试连接。
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$UNIT_DIR"

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "找不到 node" >&2
  exit 1
fi

cat > "$UNIT_DIR/surfcore-bridge.service" <<EOF
[Unit]
Description=SurfCore QQ bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$REPO
Environment=TZ=Asia/Shanghai
Environment=NODE_ENV=production
ExecStart=$NODE_BIN $REPO/src/bridge.js
Restart=on-failure
RestartSec=5
# 桥接把 PID 写在 state/bridge.lock；异常退出后由 Restart 接管
KillSignal=SIGTERM
TimeoutStopSec=20

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now surfcore-bridge.service
sleep 2
systemctl --user --no-pager status surfcore-bridge.service | head -15

cat <<EOF

已安装：$UNIT_DIR/surfcore-bridge.service
查看日志：journalctl --user -u surfcore-bridge -f
停止：    systemctl --user stop surfcore-bridge
开机自启（无桌面登录也要跑）：sudo loginctl enable-linger $USER
EOF
