# SurfCore on Linux（移植版）

> 目标：**除桌宠外**与 Windows 版功能等价。QQ 运行时可换（官方 Linux 形态是 SnowLuma Docker），
> 协议仍是 OneBot 11，桥接代码不变。

## 1. 支持矩阵

| 能力 | Linux | 说明 |
| --- | --- | --- |
| QQ 收发 / 群聊 / 私聊 / 图片 / 表情 / 语音 | ✅ | 通过 SnowLuma Docker 暴露的 OneBot 3000/3001 |
| B站 刷视频 / 评论 / 动态 / 私信 | ✅ | 纯 HTTP + 扫码登录 |
| 记忆卡 / 全员卡 / 人格 / 角色包 | ✅ | 纯文件 + JSON |
| 每日额度 / Token 看板 / 账单 | ✅ | 需要 `TZ=Asia/Shanghai`（否则每日边界错 8 小时） |
| 设置页 / 控制台 / 诊断 | ✅ | DSH Web UI + 本地 3100 控制台 |
| 主动搭话 / 目的机制 | ✅ | 载体只有 QQ（桌宠已移除） |
| 桌宠 | ❌ | 按移植要求移除 |
| 本地 TTS 语音包 | ⚠️ | 依赖 GPT-SoVITS/显卡与 `run.bat`，需自行移植；云端语音包可用 |
| DSH 桌面版 app.asar 补丁 | ❌ | Linux 用 `npx dsh`（Web），没有 app.asar |

## 2. 前置

- Ubuntu 22.04+ / Debian 12+（x86_64 或 arm64）
- Node.js ≥ 22.13
- DSH ≥ 0.2.1-rc.2（`dsh --version`）
- Docker + compose 插件（QQ 需要）
- 时区：`sudo timedatectl set-timezone Asia/Shanghai`

## 3. 安装

### 3.1 一键安装（推荐）

GitHub 直连：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/zzz090758/surfcore-linux-port/main/scripts/linux/install-oneclick.sh)
```

国内网络走 gh-proxy：

```bash
bash <(curl -fsSL https://gh-proxy.com/https://raw.githubusercontent.com/zzz090758/surfcore-linux-port/main/scripts/linux/install-oneclick-ghproxy.sh)
```

前置只有 Node ≥22.13 + DSH ≥0.2.1-rc.2；Docker 缺失时脚本会询问后用 apt 安装。
SnowLuma2 首次构建约 15–30 分钟，QQ 扫码和 `config.json` 仍需手动完成。

> 国内网络建议用 gh-proxy 版：它默认把 Docker Hub 基础镜像走 `docker.m.daocloud.io`、
> 容器内 Debian apt 走清华 HTTP 镜像、noVNC 克隆走 gh-proxy。可覆盖：
> `DOCKER_MIRROR=... GH_PROXY=...`。

### 3.2 手动安装

```bash
git clone <你的仓库> surfcore
cd surfcore
scripts/linux/install.sh          # npm install + 注册 DSH bundle/MCP/preset
# 重启 DSH
./start.sh                        # 前台跑桥接；日志在终端
```

装成服务：

```bash
scripts/linux/install-dsh-service.sh
journalctl --user -u surfcore-bridge -f
```

建议同时把 DSH 也装成 systemd 用户服务（崩溃自动重启；B站 扫码会拉起 Chromium，
原版 `taskkill` 在 Linux 上曾导致 DSH 整个退出，已修）：

```ini
[Service]
WorkingDirectory=%h/dsh
Environment=TZ=Asia/Shanghai
StandardOutput=append:%h/dsh-web.log
StandardError=append:%h/dsh-web.log
ExecStart=%h/dsh/node_modules/.bin/dsh web --no-open --port 3080 --trusted-host <服务器IP>:3080
Restart=always
RestartSec=3
```

> `lan-dsh-proxy.mjs` 从 `~/dsh-web.log` 读 token，所以 DSH 的输出要 append 到这个文件。

## 4. QQ（SnowLuma2 Docker）

> 原 `motricseven7/snowluma` 已不可用；Linux 安装脚本改用公开的
> [lingyu20/SnowLuma2](https://github.com/lingyu20/SnowLuma2) 源码构建。

```bash
scripts/linux/install-snowluma.sh
# 国内网络：
# GH_PROXY=https://gh-proxy.com/ scripts/linux/install-snowluma.sh
```

脚本会：
- 下载 `lingyu20/SnowLuma2` 源码到 `~/snowluma2`（可用 `SNOWLUMA2_DIR` 覆盖）；
- 用它的 Dockerfile 构建镜像 `snowluma:2.2.0`；
- 把 `~/snowluma-data`、`~/snowluma-config`、`~/snowluma-local` 分别 bind mount 到
  `/app/data`、`/app/.config`、`/app/.local/share`（token 自动发现靠 data）；
- 只把 6081/5099/3000/3001 绑到 `127.0.0.1`；
- 生成并保存 noVNC 密码到 `~/.dsh/surfcore/snowluma-vnc.pass`。

首次构建需要下载 QQ 安装包（Dockerfile 内置固定版本），通常 15–30 分钟；国内网络用
`GH_PROXY` 可把 QQ 安装包镜像也走 gh-proxy。

首次登录：

```bash
ssh -L 6081:127.0.0.1:6081 -L 5099:127.0.0.1:5099 user@server
# 浏览器打开 http://127.0.0.1:6081/vnc.html，输入上面的密码，扫码登录 QQ
```

登录后 OneBot 起来，桥接会自动连上；设置页「QQ → SnowLuma → 检测」会显示容器而不是
`launcher.bat`（Linux 走 `docker inspect`）。

### 4.1 B站扫码：需要 headless Chromium

B站 扫码登录沿用「打开官方登录页 → 取二维码」的实现，原版只认 Windows Edge。Linux 上现在会自动检测：

- `SURFCORE_EDGE` 指定的可执行文件；
- `/usr/bin/chromium`、`/usr/bin/chromium-browser`、`/usr/bin/google-chrome`；
- Playwright 下载的 Chromium：`~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome`。

服务器上没有浏览器时：

```bash
mkdir -p ~/tools/pw && cd ~/tools/pw && npm init -y && npm i playwright
PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright npx playwright install chromium
```

Linux 上启动参数会自动加 `--no-sandbox --disable-dev-shm-usage`（服务器常见的 userns/`/dev/shm` 限制）。

### 4.2 云端语音包（Linux）

发行包是 `win-x64`，但 `voxd` 本体是纯 Python，Linux 上只需自建 venv：

```bash
P=~/surfcore/state/voice-packs/voice-cloud   # 仓库 state/ 下，插件默认扫描这里
# 从 zip 解出 voice-cloud（可排除 .venv/runtime/tools 这些 Windows 产物）
cd "$P"
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp config.example.toml config.toml
# config.toml 里 [ffmpeg] path 改成 /usr/bin/ffmpeg
```

启动（systemd 用户服务，崩溃自动重启）：

```ini
[Service]
WorkingDirectory=<P>
Environment=PYTHONUTF8=1
ExecStart=<P>/.venv/bin/python -m voxd --config config.toml
Restart=always
```

`src/voice-packs.js` 已做 Linux 适配：

- 检测 `.venv/bin/python` 而不是 `.venv/Scripts/python.exe`；
- 启动云端包时把 manifest 里的 Windows Python 路径换成 `.venv/bin/python`；
- 停止时用 `ss -ltnp` 找 8767 的 PID 并 `SIGKILL`，不再依赖 PowerShell。

云端音色需要自己在设置页填：火山 `AppID` / `AccessKey` / 声音复刻 `speaker`（`S_...`）。
没填时 `voxd` 会自动走 piper 兜底（`models/zh_CN-huayan-medium.onnx`），语音可用但音色是机械音。

## 5. 配置

`config.json` 里与 Linux 相关的键：

```jsonc
{
  "snowluma": {
    "wsUrl": "ws://127.0.0.1:3001",
    "httpUrl": "http://127.0.0.1:3000",
    "accessToken": "",              // 留空 = 从 ~/snowluma-data/config/onebot_<uin>.json 自动发现
    "dockerContainer": "snowluma",  // 容器名
    "allowLaunch": true
  },
  "allow": { "private": [你的QQ], "groups": [群号] }
}
```

Token 自动发现顺序：显式配置 → `SNOWLUMA_DATA_DIR` → `docker inspect` 的 `/app/data` 挂载 →
`~/snowluma-data` → `/srv/snowluma/data`。

## 6. 验证

```bash
npm run test:audit          # 离线回归（Linux 上应全绿；Windows 专属项会明确 skip）
node scripts/check-onebot-status.mjs
curl -s http://127.0.0.1:3100/api/status?token=$(cat state/console-token)
```

无 QQ 登录时，可用 `tools/mock-onebot`（开发用）验证桥接收消息 → DSH 会话 → 回发通道。

## 7. 与 Windows 版的差异

1. **桌宠移除**：`pet*.js`、设置页桌宠标签、`host.json`、pet 更新链全部删除；目的机制载体固定 QQ。
2. **QQ 运行时**：Windows 是 SnowLuma 本机 exe；Linux 是官方 Docker（Linux QQ + Xvfb + VNC）。
   登录态不通用，需要重新扫码。
3. **进程管理**：`taskkill/powershell` 换成 signal / `docker stop`；ACL 从 `icacls` 换成 `chmod 700`。
4. **端口发现**：Windows 用 netstat+tasklist；Linux 用 `ss -ltnp`（无 iproute2 时读 `/proc/net/tcp`）+ `/api/status` 形状探活。
5. **启动器**：`.bat` 保留给 Windows；Linux 用 `start.sh` / `stop.sh` / systemd user unit。

## 8. 已知限制

- 本地 TTS 语音包（surfvoicelocal）未移植；云端包（HTTP）可用。
- `app.asar` 会话护栏补丁只对 DSH Desktop 有意义，Linux Web 形态跳过。
- SnowLuma 的 Linux QQ 与 Windows QQ 是不同客户端，个别消息类型/稳定性需实测。
- 服务器无桌面环境时 `xdg-open` 会失败，设置页仍会显示可复制的 URL。

## 9. 本次实测记录（2026-11-09，Ubuntu 26.04 / Node 22.22.1 / DSH 0.2.1-rc.2）

> 完整可复现步骤与日志见 [LINUX-TRIAL.md](LINUX-TRIAL.md)。

已通过：

- `TZ=Asia/Shanghai node scripts/test-audit.mjs` → **153/153**（Windows 专属项自动 skip）。
- DSH Web 启动，surfcore bundle 激活，设置 API `/dsh-surfcore/api/overview` 返回 `ok:true`。
- 桥接以 systemd user service 运行，控制台 `127.0.0.1:3100` 正常；`start.sh` 不设
  `DSH_WEB_URL` 也能通过 `ss` 探到 DSH。
- Mock OneBot 全链路：群消息 → 白名单 → `reserved2` 唤醒 → 创建 DSH 会话（preset `qq-chat-v2`）。
  用 Mock LLM（Anthropic SSE）进一步验证了 `chat` 模式下「模型回复 → send_group_msg」的完整往返；
  真实模型凭据仍需你配置。细节见 [LINUX-TRIAL.md](LINUX-TRIAL.md) §4.4。
- SnowLuma Docker 启动，noVNC `6081` 与 WebUI `5099` 均返回 200；容器等待扫码登录。

待人工完成：

1. QQ 扫码登录（noVNC）。
2. DSH 里配置一个可用模型（设置 → 模型连接），否则桥接只能建会话不能回答。
3. B站扫码登录（设置 → B站）。

> 登录后若 OneBot 3000/3001 仍连不上，检查 `~/snowluma-data/config/onebot_<QQ号>.json`
> 的 `networks.httpServers[].host` / `wsServers[].host` 是否为 `0.0.0.0`（容器内回环不能被
> 宿主机端口映射访问），改成 `0.0.0.0` 后 `docker restart snowluma`。

## 10. DSH 兼容性复核与 Linux 体检

```bash
node scripts/verify-dsh-020-adaptation.mjs   # 逐项复核 DSH 协议
node scripts/patch-dsh-session-guard.mjs --check   # Linux 会明确“跳过”，退出 0
scripts/linux/doctor.sh                      # 只读体检：DSH/桥接/SnowLuma/OneBot/磁盘
```

本次实测 `verify:adaptation` **61/65**；剩余 4 项都不是 Linux 移植引入：

1. `preset qq-chat / qq-chat-v2: 保留 {{model}} / {{cwd}} 变量` —— 仓库源文件已注明
   `{{cwd}}` 在 DSH 0.2.1-rc.2 不再注册，是校验脚本自身过期。
2/3. `守卫名单无拼错的假名` —— 名单里保留了其它 DSH 组合/版本才有的工具名；执行期白名单
   仍然 fail-closed，不影响安全边界。
4. `DSH 实测段无未捕获异常` —— `session/model-unavailable`，因为没有配置模型凭据；
   配置模型后这一项自然通过。

`scripts/dsh-modules.mjs` 已支持 Linux CLI 安装布局（`~/dsh/node_modules`、`~/.local/lib/node_modules`、
`/usr/local/lib/node_modules`），不再要求手工设 `DSH_INSTALL_MODULES`。

## 11. 局域网直接访问（临时，免 SSH 隧道）

默认所有端口只绑 `127.0.0.1`。要在同一局域网里直接用浏览器扫码/设置：

1. **noVNC（QQ 扫码）**：把 SnowLuma 容器的 6081 发布到服务器 LAN IP
   ```bash
   docker rm -f snowluma && docker run ... -p 192.0.2.10:6081:6081 ...
   ```
   浏览器打开 `http://<服务器IP>:6081/vnc.html`，密码在 `~/.dsh/surfcore/snowluma-vnc.pass`。

2. **DSH 设置页**：插件 API 有「只接受本机回环」硬闸门，不能直接改绑 0.0.0.0。
   用 `scripts/linux/lan-dsh-proxy.mjs` 做反向代理（把 Host/Origin 改写成 `127.0.0.1:3080`，
   响应 Location 再改回 LAN 地址，WebSocket 升级也转发）：
   ```bash
   LAN_HOST=192.0.2.10 LAN_PORT=3081 TARGET_PORT=3080 \
     node scripts/linux/lan-dsh-proxy.mjs
   ```
   浏览器直接打开 `http://<服务器IP>:3081/` 即可：代理会读取 DSH 启动日志里的当前 token
   并 302 跳到 `/?token=…`，之后靠 Cookie 访问。DSH 重启换了 token 也不用改地址。
   （仍可用显式 `?token=` 链接；代理只对「没有 token、也没有 Cookie」的首页做跳转。）

> 只建议在可信局域网临时使用：DSH 靠 URL token，noVNC 靠 VNC 密码。用完可
> `systemctl --user stop dsh-lan`（若装了服务）并重建容器把 6081 收回 `127.0.0.1`。

## 12. 独立 SurfCore Web（不带 DSH 界面）
`standalone/` 把 SurfCore 设置页单独挂成一个网页，账户密码登录，不显示 DSH UI：

```
浏览器 ──登录──> SurfCore Web (:3090)
                    │ 只反代 /dsh-surfcore/api/*
                    ▼
            127.0.0.1:3080（DSH 插件 API，Host 改写 + 服务端注入会话 Cookie）
```

构建：

```bash
cd standalone
npm install
npm run build          # 生成 public/app.js（React + 宿主 shim）
node setup-password.mjs '你的密码' admin   # 或省略密码随机生成；第三个参数是账户名
```

运行：

```bash
HOST=192.0.2.10 PORT=3090 node server.mjs
```

systemd 用户服务：

```ini
[Unit]
Description=SurfCore standalone web
After=network-online.target

[Service]
WorkingDirectory=/home/ubuntu-deepseek/work/surfcore/standalone
Environment=HOST=192.0.2.10
Environment=PORT=3090
Environment=DSH_BASE=http://127.0.0.1:3080
ExecStart=/usr/bin/node server.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
```

- 浏览器只看到 `:3090` 的登录页；DSH token / Cookie 不落浏览器。
- 只允许 `/dsh-surfcore/api/` 前缀，不代理 DSH 其它 API。
- 密码 scrypt 哈希存 `~/.dsh/surfcore/web-password.json`；会话 HMAC 签名，默认 12 小时。
- 服务器没有桌面，设置页里的「浏览…」原生文件选择框会失败，路径可手填。
- 仍然需要 DSH 进程在跑；DSH 停了页面 API 会 502。
- 公网使用必须再套 HTTPS + 强认证/VPN，不要直接映射 3090。

## 13. QQ 睡眠作息（插件内，不关进程）

不是停桥接：桥接一直在线，靠 `src/bridge.js` 的相位闸门睡觉。

```json
"socialV2": {
  "wake": {
    "sleepSchedule": {
      "enabled": true,
      "softStart": "23:30",
      "hardStart": "00:30",
      "wakeAt": "10:30",
      "announce": true,
      "announceWindowMin": 30,
      "firmAfterMin": 10
    }
  }
}
```

- `softStart`：准备睡觉，仍可正常聊天/主动；向最近活跃的私聊/群聊发一句“准备睡了”（本地轮换，不烧 token）；
- `softStart + firmAfterMin`（默认 23:40）：进入 winding，不再接话；如果还有人发消息，回一句“好了好了真得睡了”，每个会话每天一次；
- `hardStart` 前 10 分钟（默认 00:20）：只给 23:40 之后**还有活动**（AI 发过消息，或有人继续打扰）的会话补一句 firm 收尾；已经安静的会话直接标记 `sleepAsleepDay`，不硬发；
- `hardStart`：强制入睡，消息只入库不唤醒；不会额外发“睡觉了”的消息；
- `wakeAt`：起床，按未读补唤醒；
- 睡眠期间桥接**保持在线**；systemd 的 `surfcore-bridge.service` 已 disabled，桥接由插件在 DSH 启动时自管（睡眠不停进程，不需要 systemd 定时停）；
- 10:30 起床后遍历有 `unread` 的会话，逐个补 `scheduleWakeV2(key,'sleep-wake')`；
- 没有“主人例外”，睡眠期间所有人都不回；
- `softMessages` / `firmMessages` 可覆盖默认文案数组；`announce:false` 关闭全部睡眠提醒。

## 13.1 群活跃度过滤（2026-11-14）

`socialV2.groupActivity` 控制“不活跃群不主动分享”：

```json
"socialV2": {
  "groupActivity": {
    "enabled": true,
    "inactiveMaxAiMessages": 15
  }
}
```

- 按 AI 在该群**当天/前一天**真正发出的文本消息数统计；
- 当天和前一天都不超过 `inactiveMaxAiMessages`（默认 15）→ 标记为不活跃群；
- 不活跃群不再收到 B站定时视频分享、B站动态同步等主动内容；
- 群友正常聊天、@、私聊触发的回复不受影响；
- 计数来自 `recordSentMessagesV2()`，不统计系统提示/卡片本身，避免“分享一次就算活跃”自循环。

旧的 systemd 停进程脚本已删除，回滚只需把 `sleepSchedule.enabled` 设为 `false` 并重启桥接。
完整逻辑与实测见 [`docs/cases/2026-11-09-qq-sleep-window.md`](../cases/2026-11-09-qq-sleep-window.md)。

## 14. SnowLuma WebUI 局域网入口

容器把 WebUI 绑在 `127.0.0.1:5099`；别的电脑打开 `127.0.0.1:5099` 会连到自己，必然
`ERR_CONNECTION_REFUSED`。用 `scripts/linux/lan-snowluma-proxy.mjs` 在服务器 LAN IP 上再开一个入口：

```bash
# 访问令牌（600，只有本机用户可读）
printf '%s\n' "$(openssl rand -base64 24 | tr '+/' '-_' | tr -d '=')" \
  > ~/.dsh/surfcore/snowluma-lan-token
chmod 600 ~/.dsh/surfcore/snowluma-lan-token

LAN_HOST=192.0.2.10 LAN_PORT=5099 TARGET_PORT=5099 \
  node scripts/linux/lan-snowluma-proxy.mjs
```

访问：

```
http://192.0.2.10:5099/?token=<snowluma-lan-token 的内容>
```

- 首次带 `?token=` 打开：代理写 `snowluma_lan` HttpOnly Cookie，302 到 `/`，之后静态资源/API/WebSocket 都靠 Cookie；
- 没有 token/ Cookie：401；
- 支持 HTTP + WebSocket（WebUI 日志/事件流）；
- token 文件：`~/.dsh/surfcore/snowluma-lan-token`；轮换就改文件并 `systemctl --user restart snowluma-lan`；
- 过了反代令牌后仍然要过 SnowLuma 自己的账号密码；
- 仅可信局域网使用；SnowLuma 会提示远程 HTTP 凭据风险，公网请套 HTTPS/VPN。


