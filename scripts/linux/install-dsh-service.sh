#!/usr/bin/env bash
# 把 DSH Web 安装成 systemd --user 服务（Linux 移植版推荐）。
#
# 为什么不装 surfcore-bridge.service：
#   当前架构里桥接由 DSH 插件 autoStartBridge 启动，并由 DSH 托管；
#   再装一个 bridge 服务会争抢 state/bridge.lock，造成“已有实例在运行”。
#   需要桥接独立于 DSH 时，先关掉插件 autoStartBridge，再考虑旧脚本。
#
# 用法：
#   scripts/linux/install-dsh-service.sh
#   DSH_TRUSTED_HOST=192.168.1.77 scripts/linux/install-dsh-service.sh
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$UNIT_DIR"

if [ -n "${DSH_BIN:-}" ] && [ -x "$DSH_BIN" ]; then
  :
elif command -v dsh >/dev/null 2>&1; then
  DSH_BIN="$(command -v dsh)"
elif [ -x "$HOME/dsh/node_modules/.bin/dsh" ]; then
  DSH_BIN="$HOME/dsh/node_modules/.bin/dsh"
else
  echo "找不到 dsh。请先安装 DSH（≥0.2.1-rc.2），或设置 DSH_BIN=/path/to/dsh。" >&2
  exit 1
fi

HOST="${DSH_TRUSTED_HOST:-}"
if [ -z "$HOST" ] && command -v hostname >/dev/null 2>&1; then
  HOST="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi
[ -n "$HOST" ] || HOST="127.0.0.1"
PORT="${DSH_PORT:-3080}"
LOG="$HOME/dsh-web.log"

cat > "$UNIT_DIR/dsh-web.service" <<EOF
[Unit]
Description=DeepSeek Harness Web (SurfCore Linux)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$HOME
Environment=TZ=Asia/Shanghai
Environment=PATH=$HOME/dsh/node_modules/.bin:$HOME/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=$DSH_BIN web --no-open --port $PORT --trusted-host $HOST:$PORT
Restart=always
RestartSec=3
StandardOutput=append:$LOG
StandardError=append:$LOG
KillMode=mixed
TimeoutStopSec=20

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now dsh-web.service
sleep 3
systemctl --user --no-pager status dsh-web.service | head -15

cat <<EOF

已安装：$UNIT_DIR/dsh-web.service
端口：$PORT（trusted-host $HOST:$PORT）
日志：$LOG
查看：journalctl --user -u dsh-web.service -f
重启：systemctl --user restart dsh-web.service

注意：
- 桥接仍由 SurfCore 插件 autoStartBridge 启动，不要再装旧的
  surfcore-bridge.service，否则会争抢 state/bridge.lock。
- 需要开机即启动（不登录桌面）：
    sudo loginctl enable-linger $USER
- QQ / SnowLuma2 容器是独立 Docker 服务，不受本服务影响。
EOF
