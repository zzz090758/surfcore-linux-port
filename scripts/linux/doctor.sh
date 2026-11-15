#!/usr/bin/env bash
# SurfCore Linux 体检：只读，不启动/不修改任何服务。
# 用法：scripts/linux/doctor.sh
set -uo pipefail
cd "$(dirname "$0")/../.."

ok()   { printf '  ✅ %s\n' "$1"; }
warn() { printf '  ⚠️  %s\n' "$1"; }
bad()  { printf '  ❌ %s\n' "$1"; }
sec()  { printf '\n== %s ==\n' "$1"; }

sec "系统"
printf '  %s\n' "$(uname -srm)"
printf '  时区：%s（必须是 Asia/Shanghai，否则每日额度/作息错 8 小时）\n' "$(timedatectl show -p Timezone --value 2>/dev/null || cat /etc/timezone 2>/dev/null || echo unknown)"
node -v >/dev/null 2>&1 && ok "node $(node -v)" || bad "找不到 node"
docker version --format '{{.Server.Version}}' >/dev/null 2>&1 && ok "docker $(docker version --format '{{.Server.Version}}' 2>/dev/null)" || warn "docker 不可用（QQ 需要）"

sec "DSH"
if ss -ltn 2>/dev/null | grep -q '127.0.0.1:3080'; then
  ok "DSH Web 监听 127.0.0.1:3080"
  printf '     token URL：%s\n' "$(grep -a 'dsh web:' "$HOME/dsh-web.log" 2>/dev/null | tail -1 || echo '见 DSH 启动日志')"
else
  bad "3080 没在监听：DSH 没启动 / 端口不是 3080"
fi

sec "桥接"
if systemctl --user is-active surfcore-bridge.service >/dev/null 2>&1; then
  ok "systemd 服务 active"
elif ss -ltn 2>/dev/null | grep -q '127.0.0.1:3100'; then
  ok "控制台 3100 在监听（非 systemd 启动）"
else
  bad "桥接没运行：systemctl --user start surfcore-bridge 或 ./start.sh"
fi
if [ -f state/console-token ]; then
  CT="$(cat state/console-token)"
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3100/?token=$CT" 2>/dev/null)"
  [ "$code" = "200" ] && ok "控制台令牌有效（HTTP 200）" || warn "控制台返回 $code"
fi

sec "SnowLuma（QQ 运行时）"
if docker inspect snowluma >/dev/null 2>&1; then
  running="$(docker inspect -f '{{.State.Running}}' snowluma 2>/dev/null)"
  [ "$running" = "true" ] && ok "容器 snowluma 运行中" || bad "容器 snowluma 不在运行：docker start snowluma"
  for p in 6081 5099; do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$p/" 2>/dev/null)"
    [ "$code" = "200" ] && ok "127.0.0.1:$p 可访问" || warn "127.0.0.1:$p 返回 $code"
  done
  printf '     noVNC 密码：%s（%s）\n' "$(cat "$HOME/.dsh/surfcore/snowluma-vnc.pass" 2>/dev/null || echo '未生成')" "首次扫码用"
else
  warn "没有 snowluma 容器：scripts/linux/install-snowluma.sh"
fi

sec "OneBot（登录后才有意义）"
login="$(curl -sS -m 5 -X POST http://127.0.0.1:3000/get_login_info \
  -H 'content-type: application/json' -d '{}' 2>/dev/null)"
if printf '%s' "$login" | grep -q '"user_id"'; then
  ok "QQ 已登录：$(printf '%s' "$login" | head -c 160)"
else
  warn "QQ 未登录 / OneBot 未就绪：先到 noVNC 扫码"
  printf '     若已扫码仍失败：把 ~/snowluma-data/config/onebot_<QQ号>.json 的 host 改成 0.0.0.0 后 docker restart snowluma\n'
fi

sec "磁盘 / 内存"
df -h / | tail -1
free -h | head -2

cat <<'EOF'

下一步：
  · DSH 里配置一个可用模型（否则会话建了也不会回答）
  · noVNC 扫码登录 QQ
  · DSH → 设置 → SurfCore → QQ / B站 配白名单与扫码
日志：
  journalctl --user -u surfcore-bridge -f
  docker logs -f snowluma
EOF
