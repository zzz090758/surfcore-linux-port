#!/usr/bin/env bash
# 在 Linux 上部署 SnowLuma2（Docker）。只做部署，不代登录、不代扫码。
#
# SnowLuma2 源码：https://github.com/lingyu20/SnowLuma2
# 原 SnowLuma 仓库已不可用；本脚本从 SnowLuma2 的 Dockerfile 构建。
#
# 产物：
#   · ~/snowluma2              → SnowLuma2 源码/构建上下文
#   · ~/snowluma-data         → 容器 /app/data（OneBot token 在这里，SurfCore 自动发现）
#   · ~/snowluma-config       → 容器 /app/.config
#   · ~/snowluma-local        → 容器 /app/.local/share
#   · ~/.dsh/surfcore/snowluma-vnc.pass → noVNC 密码（600 权限）
#
# 国内网络：
#   GH_PROXY=https://gh-proxy.com/ scripts/linux/install-snowluma.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

GH_PROXY="${GH_PROXY:-}"
case "$GH_PROXY" in
  ''|*/) ;;
  *) GH_PROXY="$GH_PROXY/" ;;
esac

if ! command -v docker >/dev/null 2>&1; then
  echo "没有 docker。Ubuntu: sudo apt install docker.io docker-compose-v2" >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "没有 docker compose 插件。Ubuntu: sudo apt install docker-compose-v2" >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "没有 curl。Ubuntu: sudo apt install curl" >&2
  exit 1
fi

SRC="${SNOWLUMA2_DIR:-$HOME/snowluma2}"
DATA="${SNOWLUMA_DATA:-$HOME/snowluma-data}"
CONFIG="${SNOWLUMA_CONFIG:-$HOME/snowluma-config}"
LOCAL="${SNOWLUMA_LOCAL:-$HOME/snowluma-local}"
PASS_FILE="$HOME/.dsh/surfcore/snowluma-vnc.pass"
mkdir -p "$DATA" "$CONFIG" "$LOCAL" "$(dirname "$PASS_FILE")"

if [ ! -f "$SRC/Dockerfile" ]; then
  if [ -e "$SRC" ]; then
    echo "$SRC 已存在但没有 Dockerfile；为避免覆盖用户文件，请移走它或设置 SNOWLUMA2_DIR 到空目录。" >&2
    exit 1
  fi
  echo "== 下载 SnowLuma2 源码 =="
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  curl -fL --retry 3 --retry-delay 2 \
    "${GH_PROXY}https://github.com/lingyu20/SnowLuma2/archive/refs/heads/main.tar.gz" \
    -o "$TMP/snowluma2.tar.gz"
  tar -xzf "$TMP/snowluma2.tar.gz" -C "$TMP" --strip-components=1
  rm -f "$TMP/snowluma2.tar.gz"
  mkdir -p "$(dirname "$SRC")"
  mv "$TMP" "$SRC"
  trap - EXIT
  echo "源码：$SRC"
else
  echo "== 复用已有 SnowLuma2 源码：$SRC =="
fi

# 国内网络补丁：Docker Hub / Debian / GitHub 都可能被墙。
# 只改构建上下文，不改运行中的容器。
if [ -n "$GH_PROXY" ]; then
  if ! grep -q 'gh-proxy.com/https://github.com/novnc' "$SRC/Dockerfile"; then
    sed -i 's#https://github.com/novnc/#'"${GH_PROXY}"'https://github.com/novnc/#g' "$SRC/Dockerfile"
    echo "已把 noVNC/websockify 克隆地址切到 GH_PROXY"
  fi
  if ! grep -q 'mirrors.tuna.tsinghua.edu.cn' "$SRC/Dockerfile"; then
    sed -i 's#http://deb.debian.org#http://mirrors.tuna.tsinghua.edu.cn#g; s#http://security.debian.org#http://mirrors.tuna.tsinghua.edu.cn#g' "$SRC/Dockerfile"
    echo "已把容器内 Debian apt 源切到清华 HTTP 镜像"
  fi
fi
if [ -n "${DOCKER_MIRROR:-}" ] && ! grep -q "${DOCKER_MIRROR}/library/node" "$SRC/Dockerfile"; then
  sed -i "s#^FROM node:#FROM ${DOCKER_MIRROR}/library/node:#" "$SRC/Dockerfile"
  echo "已把基础镜像切到 Docker mirror: ${DOCKER_MIRROR}"
fi

if [ -n "${VNC_PASSWD:-}" ]; then
  VNC_PASS="${VNC_PASSWD}"
elif [ -f "$PASS_FILE" ]; then
  VNC_PASS="$(cat "$PASS_FILE")"
else
  VNC_PASS="$(head -c 9 /dev/urandom | base64 | tr -d '/+=' | head -c 12)"
  printf '%s' "$VNC_PASS" > "$PASS_FILE"
  chmod 600 "$PASS_FILE"
fi

export SNOWLUMA2_DIR="$SRC"
export SNOWLUMA_DATA="$DATA"
export SNOWLUMA_CONFIG="$CONFIG"
export SNOWLUMA_LOCAL="$LOCAL"
export SNOWLUMA_UID="${SNOWLUMA_UID:-$(id -u)}"
export SNOWLUMA_GID="${SNOWLUMA_GID:-$(id -g)}"
export VNC_PASSWD="$VNC_PASS"
if [ -n "$GH_PROXY" ]; then
  export SNOWLUMA_QQ_MIRROR_URL="${SNOWLUMA_QQ_MIRROR_URL:-${GH_PROXY}https://github.com/Rodert/qq-versions/releases/download/qq-packages-20260813-1d08f1d4}"
fi

echo "== 构建并启动 SnowLuma2（首次编译/下载约 15-30 分钟）=="
docker compose -f deploy/snowluma.compose.yml up -d --build
sleep 8
docker ps --format '{{.Names}}  {{.Status}}'

cat <<EOF

SnowLuma2 已启动。

数据目录：
  data:   $DATA
  config: $CONFIG
  local:  $LOCAL

首次登录（QQ 扫码）：
  1) 在你自己电脑上开 SSH 隧道：
       ssh -L 6081:127.0.0.1:6081 -L 5099:127.0.0.1:5099 $USER@<服务器地址>
  2) 浏览器打开 http://127.0.0.1:6081/vnc.html
     noVNC 密码：$VNC_PASS
  3) 在远程桌面里扫码登录 QQ。
  4) SnowLuma WebUI：http://127.0.0.1:5099
     初始账号 admin，临时密码看：docker logs snowluma 2>&1 | grep 'initial credentials'
  5) OneBot 会监听 3000/3001；SurfCore 桥接会自动连接，
     token 从 $DATA/config/onebot_<QQ号>.json 自动发现。

停止：docker compose -f deploy/snowluma.compose.yml down
重建：docker compose -f deploy/snowluma.compose.yml up -d --build
EOF
