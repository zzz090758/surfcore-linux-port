#!/usr/bin/env bash
# SurfCore Linux 一键安装（gh-proxy.com 代理版）
#
# 直接运行：
#   bash <(curl -fsSL https://gh-proxy.com/https://raw.githubusercontent.com/zzz090758/surfcore-linux-port/main/scripts/linux/install-oneclick-ghproxy.sh)
set -euo pipefail

GH_PROXY="${GH_PROXY:-https://gh-proxy.com/}"
case "$GH_PROXY" in
  */) ;;
  *) GH_PROXY="$GH_PROXY/" ;;
esac
export GH_PROXY
# 国内 Docker Hub 通常不可达；可用 DOCKER_MIRROR 覆盖。
export DOCKER_MIRROR="${DOCKER_MIRROR:-docker.m.daocloud.io}"

HERE="$(cd "$(dirname "$0")" 2>/dev/null && pwd || true)"
if [ -n "$HERE" ] && [ -f "$HERE/install-oneclick.sh" ]; then
  exec bash "$HERE/install-oneclick.sh"
fi

# 通过管道运行时没有本地 install-oneclick.sh，从代理拉取主脚本
exec bash -c 'curl -fsSL "$1" | bash' _ \
  "${GH_PROXY}https://raw.githubusercontent.com/zzz090758/surfcore-linux-port/main/scripts/linux/install-oneclick.sh"
