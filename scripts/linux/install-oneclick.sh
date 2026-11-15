#!/usr/bin/env bash
# SurfCore Linux 一键安装（GitHub 直连版）
#
# 直接运行：
#   bash <(curl -fsSL https://raw.githubusercontent.com/zzz090758/surfcore-linux-port/main/scripts/linux/install-oneclick.sh)
#
# 国内网络请用 install-oneclick-ghproxy.sh，或：
#   GH_PROXY=https://gh-proxy.com/ bash <(curl -fsSL https://raw.githubusercontent.com/.../install-oneclick.sh)
#
# 说明：脚本会安装依赖、拉 SurfCore、构建 SnowLuma2；QQ 扫码和 config.json 仍需你完成。
set -euo pipefail

GH_PROXY="${GH_PROXY:-}"
case "$GH_PROXY" in
  ''|*/) ;;
  *) GH_PROXY="$GH_PROXY/" ;;
esac
INSTALL_DIR="${INSTALL_DIR:-$HOME/surfcore-linux-port}"
REPO_ARCHIVE="${GH_PROXY}https://github.com/zzz090758/surfcore-linux-port/archive/refs/heads/main.tar.gz"

say() { printf '\n== %s ==\n' "$*"; }
die() { printf '\n✗ %s\n' "$*" >&2; exit 1; }

say "环境检查"
command -v curl >/dev/null 2>&1 || die "缺少 curl，请先安装：sudo apt install -y curl"
command -v tar >/dev/null 2>&1 || die "缺少 tar，请先安装：sudo apt install -y tar"
command -v node >/dev/null 2>&1 || die "缺少 Node.js ≥22.13。建议用 NodeSource/nvm 安装后重跑。"
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)' \
  || die "Node.js 版本过低（当前 $(node -v)），需要 ≥22.13"

if command -v dsh >/dev/null 2>&1; then
  DSH_BIN="$(command -v dsh)"
elif [ -x "$HOME/dsh/node_modules/.bin/dsh" ]; then
  DSH_BIN="$HOME/dsh/node_modules/.bin/dsh"
else
  die "找不到 DSH。请先安装 DSH（≥0.2.1-rc.2），例如：npm i -g @deepseek-ai/dsh@0.2.1-rc.2"
fi
echo "node: $(node -v)"
echo "dsh:  $DSH_BIN"

if ! command -v docker >/dev/null 2>&1; then
  say "未检测到 Docker"
  echo "SnowLuma2 需要 Docker + Compose 插件。"
  if [ "${ASSUME_YES:-0}" != "1" ]; then
    read -r -p "现在用 apt 安装 docker.io + docker-compose-v2？[Y/n] " ans
    case "$ans" in n|N|no|NO) die "已取消。安装 Docker 后重跑本脚本。" ;; esac
  fi
  command -v sudo >/dev/null 2>&1 || die "没有 sudo，无法自动安装 Docker。请手动安装后重跑。"
  sudo apt-get update
  sudo apt-get install -y docker.io docker-compose-v2
  sudo systemctl enable --now docker
  sudo usermod -aG docker "$USER" || true
  echo "Docker 已安装。当前 shell 可能还没有 docker 组权限：请重新登录 SSH 后重跑本脚本。"
  exit 0
fi
docker compose version >/dev/null 2>&1 || die "缺少 docker compose 插件。Ubuntu: sudo apt install -y docker-compose-v2"
if ! docker info >/dev/null 2>&1; then
  die "当前用户没有 Docker 权限。执行 sudo usermod -aG docker $USER 后重新登录 SSH，再重跑。"
fi

say "获取 SurfCore Linux 移植版"
if [ -e "$INSTALL_DIR" ]; then
  [ -f "$INSTALL_DIR/scripts/linux/install-oneclick.sh" ] \
    || die "$INSTALL_DIR 已存在但不是 SurfCore 安装目录；请换 INSTALL_DIR 或手动处理。"
  echo "复用已有目录：$INSTALL_DIR"
else
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  echo "下载：$REPO_ARCHIVE"
  curl -fL --retry 3 --retry-delay 2 "$REPO_ARCHIVE" -o "$TMP/surfcore.tar.gz"
  tar -xzf "$TMP/surfcore.tar.gz" -C "$TMP" --strip-components=1
  rm -f "$TMP/surfcore.tar.gz"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  mv "$TMP" "$INSTALL_DIR"
  trap - EXIT
fi

cd "$INSTALL_DIR"
if [ -f config.json ]; then
  echo "已有 config.json，保留不覆盖"
else
  cp config.example.json config.json
  echo "已生成 config.json（稍后编辑）"
fi

say "安装 SurfCore 依赖 / 注册 DSH"
bash scripts/linux/install.sh

say "构建并启动 SnowLuma2（首次较久）"
GH_PROXY="$GH_PROXY" bash scripts/linux/install-snowluma.sh

cat <<EOF

============================================================
安装完成，最后 3 步（必须手动）：

1) 编辑 $INSTALL_DIR/config.json：
   - snowluma.wsUrl / httpUrl / accessToken
   - ownerQQ（你的 QQ）
   - allow.groups / allow.private（其他私聊）
   - allowAllWhenEmpty 按需设置

2) 重启 DSH，然后在 DSH → 设置 → SurfCore 启动 QQ。

3) 首次 QQ 登录：
   ssh -L 6081:127.0.0.1:6081 -L 5099:127.0.0.1:5099 \$USER@<服务器>
   浏览器打开 http://127.0.0.1:6081/vnc.html 扫码。
   扫码后回到 SurfCore 概览，启动桥接：cd $INSTALL_DIR && ./start.sh

可选：把 DSH 装成 systemd 用户服务（开机自启）
   cd $INSTALL_DIR && bash scripts/linux/install-dsh-service.sh

SnowLuma2 源码：https://github.com/lingyu20/SnowLuma2
============================================================
EOF
