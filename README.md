# SurfCore Linux 移植版 — QQ × B站 × DSH（无桌宠）

> 移植自 [Mieksido/SurfCore](https://github.com/Mieksido/surfcore)。Linux 版移除桌宠，QQ 运行时改用 SnowLuma Docker；
> 上游 Windows 版/桌宠说明见原仓库。原作者与版权信息见 [`CREDITS.md`](CREDITS.md)。

**中文** | [English](README.en.md)

> 一句话：**它不是"把大模型接进 QQ"的机器人框架，而是给模型一个身份、一套会遗忘的记忆、
> 一份作息、两只手（QQ / B站）。**

| | |
| --- | --- |
| 版本 | `0.8.9` |
| 目标 DSH | `0.2.1-rc.2 或更新（rc.3 已能安装，功能未完整回归）`（`npm run verify:adaptation` 可逐项复核） |
| 平台 | Windows（原版）/ Linux（移植版：无桌宠、QQ 走 SnowLuma Docker，见 [docs/guides/LINUX.md](docs/guides/LINUX.md)） |
| 许可 | MIT（SnowLuma 是第三方专有运行时，**不随本仓库分发**） |
| 配套仓库 | [surfvoicelocal](https://github.com/Mieksido/surfvoicelocal) · [surfvoicecloud](https://github.com/Mieksido/surfvoicecloud) · [surfpet](https://github.com/Mieksido/surfpet) |

> 🔒 **本仓库不含任何真实数据**：角色卡是脱敏示例（`roles/`），记忆卡是空壳（`examples/`），
> 群号 / 群友名单 / QQ 号 / B站 mid 全部为占位符。运行时数据永远只在你自己的机器上。

---

## 致谢 / Credits

本仓库是 **SurfCore 的 Linux 移植版**，基于原作者 [Mieksido](https://github.com/Mieksido) 的 [SurfCore](https://github.com/Mieksido/surfcore)。

- 原项目：https://github.com/Mieksido/surfcore
- 原项目相关仓库：surfvoicelocal / surfvoicecloud / surfpet
- 本仓库不是原作者的官方仓库；Linux 适配改动由 `zzz090758` 维护
- MIT 许可与原始版权声明保留在 [`LICENSE`](LICENSE)

完整说明见 [`CREDITS.md`](CREDITS.md)。感谢原作者和所有上游贡献者。

---

## 让 DSH 自己装（也可以只发一条链接）

把这句话发给 DSH：

> 帮我安装 https://github.com/zzz090758/surfcore-linux-port ，按 README 的「Linux 一键安装」执行；遇到 sudo / Docker 权限时先问我。

注意：

- 这是 **Linux 移植版**，不是上游 Windows 版；不包含桌宠；
- DSH 需要能在本机执行 shell，并且有 sudo 权限安装 Docker；没有权限就自己跑一键脚本；
- 安装完成后仍要手动扫码登录 QQ、编辑 `config.json`（SnowLuma token / `ownerQQ` / 白名单）。

推荐顺序：

1. 确认 Node ≥22.13、DSH ≥0.2.1-rc.2；
2. 跑一键脚本（或手动 `scripts/linux/install.sh` + `scripts/linux/install-snowluma.sh`）；
3. 重启 DSH → 设置 → SurfCore；
4. 配置 SnowLuma / `ownerQQ` / 白名单 → 启动桥接。

> Linux 不需要 `.bat`、junction 或 `plugin_manager install_bundle` 手工步骤；这些是上游 Windows 安装方式的说明。
> 必须从仓库根目录安装：插件通过 `../../../src/...` 引用根目录模块，只装 `plugins/surfcore` 会找不到模块。

## 第一次装（Linux 最快路径）

### 一键安装（推荐）

前置只有：**Node.js ≥22.13 + DSH ≥0.2.1-rc.2**。脚本会检测/安装 Docker、拉取代码、构建 SnowLuma2；QQ 扫码和 `config.json` 仍需手动完成。

GitHub 直连：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/zzz090758/surfcore-linux-port/main/scripts/linux/install-oneclick.sh)
```

国内网络走 `gh-proxy.com`：

```bash
bash <(curl -fsSL https://gh-proxy.com/https://raw.githubusercontent.com/zzz090758/surfcore-linux-port/main/scripts/linux/install-oneclick-ghproxy.sh)
```

脚本会：

1. 检查 Node/DSH/Docker（缺 Docker 时询问后用 apt 安装）；
2. 下载 SurfCore Linux 移植版到 `~/surfcore-linux-port`；
3. 执行 `scripts/linux/install.sh`（npm + DSH bundle/MCP/preset）；
4. 下载 [lingyu20/SnowLuma2](https://github.com/lingyu20/SnowLuma2) 源码，构建并启动 SnowLuma2 容器；
5. 生成 `config.json`，打印扫码和启动步骤。

> SnowLuma2 首次构建需要下载 QQ/运行依赖，通常 15–30 分钟；国内网络建议用 gh-proxy 版。
> gh-proxy 版默认把 Docker Hub 基础镜像走 `docker.m.daocloud.io`、Debian apt 走清华 HTTP 镜像、
> noVNC 克隆走 gh-proxy；如需换镜像：`DOCKER_MIRROR=... GH_PROXY=...`。

### 手动安装

```bash
git clone --depth 1 https://github.com/zzz090758/surfcore-linux-port.git
cd surfcore-linux-port
scripts/linux/install.sh
scripts/linux/install-snowluma.sh
cp config.example.json config.json   # 编辑 4 处，见 2.3
./start.sh
```

重启 DSH → 设置 → SurfCore → **诊断 → 一键安装（全部）**（自动发现 SnowLuma、写白名单、起桥接）。

前置：Linux（Ubuntu 22.04+ / Debian 12+）+ Node ≥22.13 + DSH 0.2.1-rc.2 或更新 + Docker/Compose + SnowLuma2（第三方，来源 [lingyu20/SnowLuma2](https://github.com/lingyu20/SnowLuma2)，需自己扫码登录）。完整步骤见 [docs/guides/LINUX.md](docs/guides/LINUX.md)。

> Windows 原版/桌宠：见上游 [Mieksido/surfcore](https://github.com/Mieksido/surfcore)。

---

## 目录

- [一、这是什么](#一这是什么)
- [二、安装（新用户从这里开始）](#二安装新用户从这里开始)
- [三、日常使用](#三日常使用)
- [四、能力总览](#四能力总览)
- [五、架构一图](#五架构一图)
- [六、文档地图](#六文档地图)
- [七、安全与边界](#七安全与边界摘要)
- [八、常见问题（FAQ）](#八常见问题faq)
- [九、开发](#九开发)
- [十、许可与合规](#十许可与合规)

---

## 一、这是什么

一个跑在**你自己电脑上**的双进程系统：

- **一条腿在 DSH 里**：`surfcore` 插件 —— 设置窗口、B站 生物钟、记忆卡维护（Linux 移植版无桌宠接口）。
- **一条腿是独立进程**：`src/bridge.js` —— QQ 收发、会话映射、控制台、安全闸门。

合起来，它让 agent 能：

1. **在 QQ 里当一个群友**：自己判断要不要看、要不要说、说几条、引用谁；说完能判断"这段可以结束了"，带着"下次怎么接"潜水。
2. **在 B站 当一个用户**：有自己的作息、偏好、每日额度；看视频会打分、会评论、会回帖、会发动态。
3. **记得住也忘得掉**：一份会衰减的记忆卡（进提示词）+ 一份永不遗忘的全量卡（只存档）。
4. **会主动找你**：从近期记忆里提炼"我想弄明白/想做点什么"，安静时段主动分享或索取；Linux 版载体只有 QQ。
5. **桌宠仅上游 Windows 版提供**：Linux 移植版按要求移除了 Electron 桌宠，QQ/B站/记忆/目的机制不受影响。

> 它**不做**：不代你登录/扫码/绕过平台风控，不做多用户，不把控制台暴露到内网以外，
> 不删除任何不可恢复的数据。完整边界见 [BOUNDARIES.md](docs/guides/BOUNDARIES.md)。

---

## 二、安装（新用户从这里开始）

### 2.1 环境要求（Linux 移植版）

| 需要 | 版本 / 说明 | 必装？ |
| --- | --- | --- |
| Linux | Ubuntu 22.04+ / Debian 12+（x86_64 或 arm64；本仓库在 Ubuntu 26.04 实测） | ✅ |
| Node.js | **≥ 22.13**（`node -v` 确认） | ✅ |
| DeepSeek Harness（DSH） | **`0.2.1-rc.2 或更新`**，能以 Web 模式启动（`dsh --version`） | ✅ |
| Docker + Compose 插件 | QQ 运行时用容器跑 SnowLuma2；`docker compose version` 可用 | ✅（只收 QQ 才需要） |
| SnowLuma2 | 第三方 QQ 运行时，来源 [lingyu20/SnowLuma2](https://github.com/lingyu20/SnowLuma2)；一键脚本会拉源码并构建，登录/扫码自己完成 | ✅（只收 QQ 才需要） |
| QQ 账号 | 需要能扫码登录；建议单独小号 | ✅（只收 QQ 才需要） |
| 时区 | `Asia/Shanghai`（否则每日额度/睡眠边界会错） | ✅ |
| 资源 | 最低 2 vCPU / 2 GiB；建议 4 vCPU / 4 GiB，磁盘 ≥ 10 GiB | 建议 |
| 语音 | 云端语音包可用；本地 GPT-SoVITS 需自行移植 | ⭕ 可选 |
| 桌宠 | **Linux 移植版已移除**；需要桌宠请用上游 Windows 版 | ❌ |

> ⚠️ **本仓库不分发 SnowLuma2 二进制**（EULA §5.4）；一键脚本只从公开仓库拉取源码并构建，
> QQ 登录与扫码始终由你自己完成。

**端口约定（默认只绑本机，局域网/Tailscale 访问见 [LINUX.md](docs/guides/LINUX.md)）**：

| 端口 | 用途 |
| --- | --- |
| `3080` | DSH Web UI |
| `3090` | SurfCore 独立设置页（可选） |
| `3100` | QQ 桥接控制台 |
| `3000` / `3001` | SnowLuma2 OneBot HTTP / WebSocket |
| `5099` | SnowLuma2 WebUI（扫码/管理） |

### 2.2 安装步骤（Linux）

> 完整命令、SnowLuma 扫码、systemd、Tailscale 和排错见 [docs/guides/LINUX.md](docs/guides/LINUX.md)。

```bash
# 1) 取 Linux 移植版代码
git clone https://github.com/zzz090758/surfcore-linux-port.git
cd surfcore-linux-port

# 2) 安装 Node 依赖 + 注册 DSH bundle / MCP / preset
scripts/linux/install.sh

# 3) 启动 SnowLuma2（Docker），首次用 VNC/WebUI 扫码登录 QQ
scripts/linux/install-snowluma.sh

# 4) 复制配置模板，编辑 config.json（见 2.3，只填 4 处）
cp config.example.json config.json

# 5) 重启 DSH，然后在 DSH 设置 → SurfCore → 概览启动 QQ
./start.sh        # 前台跑桥接；或装成服务：
# scripts/linux/install-dsh-service.sh
```

`scripts/linux/install.sh` 会做：

1. `npm install`（含 SnowLuma SDK 的 ESM 修补）；
2. 把 `qq-chat` / `qq-chat-v2` 两条 **agent preset** 插进 DSH profile；
3. 在 profile 的 `cordis.patch.yml` 挂 **三个 MCP server**（QQ 工具 / SnowLuma 探活 / 只读联网搜索）；
4. 在 profile `package.json` 注册 `surfcore` bundle。

> 装到别的 profile：`node scripts/setup-dsh.mjs <profile名>`（默认 `web`）。
> 需要桌面版/桌宠/Windows 启动器请看上游 [Mieksido/surfcore](https://github.com/Mieksido/surfcore)。

### 2.3 最小配置（只填这 4 处）

打开仓库根目录的 `config.json`：

| 位置 | 填什么 | 不填会怎样 |
| --- | --- | --- |
| `snowluma.wsUrl` / `httpUrl` / `accessToken` | SnowLuma 的 OneBot WS、HTTP、token（**HTTP 与 WS 可能是两个不同的值**） | 桥接连不上 QQ，控制台显示"未连接" |
| `ownerQQ` | 你自己的 QQ 号；管理员私聊会**单独自动放行**，不需要写进 `allow.private` | 管理员身份失效 |
| `allow.private` / `allow.groups` | 允许她接触的**其他私聊** / 群（数组）；`ownerQQ` 不要重复填进 private | 取决于 `allowAllWhenEmpty` |
| `allowAllWhenEmpty` | `true` = 名单为空时放行所有群/私聊；`false` = 只允许管理员私聊 | 默认按配置模板；开启前想清楚 |
| `consoleToken` | 控制台令牌；留空会自动生成到 `state/console-token` | 控制台需要令牌才能进 |

最小可用示例（把占位符换成你的）：

```jsonc
{
  "snowluma": { "wsUrl": "ws://127.0.0.1:3001", "httpUrl": "http://127.0.0.1:3000", "accessToken": "<SnowLuma token>" },
  "ownerQQ": 1000000001,
  "allow": { "private": [], "groups": [100000004] },
  "allowAllWhenEmpty": false,
  "consoleToken": ""
}
```

> `allow.private` 只放“其他私聊”，不要把管理员填进去；管理员私聊由 `ownerQQ` 单独放行。
> 填了群之后，`allowAllWhenEmpty=false` 表示：群只响应指定群，私聊只允许管理员。

> 其余几百个键都有默认值，全部含义见 [DATA-AND-CONFIG.md §1](docs/guides/DATA-AND-CONFIG.md)。
> 装好之后**建议一切都在设置页里改**（保存即生效，且会自动备份）。

### 2.4 首次验证

```bash
npm run test:audit                              # 离线回归（不联网、不发消息）
node scripts/check-onebot-status.mjs            # OneBot 连通性（只读）
node scripts/verify-dsh-020-adaptation.mjs      # 对本机 DSH 版本逐项复核
```

真机验证三件事：**在群里 @ 她 → DSH 里出现对应会话 → 回复回到 QQ**。

### 2.5 安装常见失败

| 症状 | 原因 | 处理 |
| --- | --- | --- |
| 设置页找不到 SurfCore | bundle 没装上 / DSH 没重启 | 重跑 `setup-dsh.mjs`，重启 DSH |
| 桥接起来了但收不到消息 | SnowLuma 未登录 / token 不对 / WS 端口不是 3001 | 控制台「运行总览」看状态；对照 `config.json` 的 `snowluma.*` |
| 群里 @ 她没反应 | 白名单没加这个群 / 模式不对 / 已暂停 | 看「访问与安全」页；确认 `allow.groups` |
| agent 只会说话、不调工具 | MCP 没挂上 / 工具被安全守卫隐藏 / 工具开关关了 | 重跑 `setup-dsh.mjs`；看设置页工具开关 |
| 控制台 401 | 没带令牌 | 用 `http://127.0.0.1:3100/?token=<consoleToken>` |
| `npm install` 后启动报 ESM 错 | postinstall 补丁没跑 | `npm rebuild` 或手动 `node scripts/patch-snowluma-sdk.mjs` |

更多故障与恢复见 [BOUNDARIES.md §3](docs/guides/BOUNDARIES.md)。

---

## 三、日常使用

### 3.1 设置页（DSH → 设置 → SurfCore）

14 个标签：概览 / 角色 / 目的 / QQ / 语音 / 桌宠 / B站 / Token 额度 / 观看历史 / 记忆 / 对齐 / 扩展 / 全部参数 / 诊断。
逐个说明见 [UI-AND-CONSOLE.md](docs/guides/UI-AND-CONSOLE.md)。

### 3.2 四种运行模式

| 模式 | 她是谁 | 能干什么 |
| --- | --- | --- |
| `chat` | 群友 | 白名单内聊天，工具面受安全守卫限制 |
| `closed-agent` | 只理管理员 | 私聊 owner，可用完整 DSH 工具 |
| `reserved` | 一代仿真群友 | 状态机 + 空格分条 + `[SILENT]` |
| `reserved2` | 二代仿真群友（**默认**） | 一切皆工具：自己看消息、发言、等待、潜水、收尾 |

### 3.3 让她主动找你（可选）

设置页「目的」：选载体（Linux 版只有 QQ）、节奏、安静时段；先点**预览**（零副作用）再"试一次"。
硬闸门：安静时段 / 每日上限 / 主人在聊 / token 额度 / 专注模式。

### 3.4 可选装语音

两个独立仓库（[surfvoicelocal](https://github.com/Mieksido/surfvoicelocal) / [surfvoicecloud](https://github.com/Mieksido/surfvoicecloud)），装在仓库**外面**：

| 仓库 | 端口 | 特点 |
| --- | --- | --- |
| `surfvoicelocal` | 8765 | 本地 GPT-SoVITS，免费、断网可用 |
| `surfvoicecloud` | 8767 | 云端声音复刻，质量最好、按字符计费 |

装法：`git clone` 到 `surfcore/state/voice-packs/voice-local`（或 `voice-cloud`）→ 按该仓库 README 下载模型 →
`run.bat` → 回到 SurfCore **设置 → 语音** 选本地/云端并点「启动」。
**AI 发语音默认关闭**（`socialV2.voice.enabled=false` + 工具开关 `tools.sendVoice`），要显式打开。

> 模型不进 GitHub（太大）。仓库里只有启动脚本、配置与说明；模型按各自 README 的 `fetch-models` 下载。

### 3.5 可选装桌宠（仅上游 Windows 版）

> **Linux 移植版已移除桌宠**，以下内容仅适用于上游 Windows 版；Linux 下不需要装，也没有对应设置。

[surfpet](https://github.com/Mieksido/surfpet)：Electron 桌面分身（Release 里有安装包）。**用户装 Release 的 zip，开发者 clone 源码自己构建。**

装法：设置页 **桌宠** → 填 zip 地址/目录 → 安装 → 选 `electron.exe` → 启动。
装好后：右键「文本对话 / 语音对话」，气泡上所有她的话都有「回复」按钮，右键/托盘有**专注模式**。

> 桌宠通过 `~/.dsh/surfcore/pet/host.json` 发现插件接口（本机 + 一次性令牌），不需要 DSH 的登录态。

### 3.6 B站（可选）

设置页 **B站** → 扫码登录 → 填作息窗口（例如 `20:00–24:00`）→ 选偏好 → 设额度。
她会在窗口内自己看视频、打分、评论、发动态；**默认不分享到 QQ**（可开）。

### 3.7 角色与记忆

- **角色包** = 人格卡 + 记忆卡 + B站 行为账本，整包切换。
- 新建：设置页「角色」→ 新建（或复制 `examples/character/` 到 `~/.dsh/surfcore/characters/<id>/`）。
- 记忆：QQ/B站/桌宠 三个场景写进**同一张卡**；每 10 分钟摄取一次，会衰减、会遗忘、80/90/100% 告警。
- 示例人格卡在 `roles/`（已脱敏），记忆卡空壳在 `examples/`。

### 3.8 浏览器控制台（可选）

`http://127.0.0.1:3100/?token=<consoleToken>`：运行总览、会话与审批、令牌与花费、访问与安全、调试与运维、工具参考。
只接受本机回环访问。

### 3.9 检查更新

**设置 → 概览 → 更新**：一次同时查 SurfCore / 两个语音包 / 桌宠。

- 本体与语音包走 **git**（`fetch` 只读 + `merge --ff-only`；本地有改动会拒绝）；
- 桌宠走 **Release 的 `version.json`**（比版本号 → 下 zip → sha256 校验 → 替换，**保留 `data/`**）；
- DSH 启动后 20 秒自动查一次，有更新时打开概览会弹窗，可勾「不再提示本次」。

---

## 四、能力总览

| 子系统 | 你能看到的能力 | 细节 |
| --- | --- | --- |
| **QQ** | 群/私聊收发、引用回复、分条、表情包、图片/动图、语音、拍一拍、合并转发展开、上线补历史、提问/审批回传、四种运行模式 | [MODULE-BRIDGE.md](docs/guides/MODULE-BRIDGE.md) |
| **B站** | 扫码登录、看视频/打分/收藏、评论与回帖、发动态、分享到 QQ、私信、直播间监听、34 个 CLI 命令 | [SUBSYSTEM-BILI.md](docs/guides/SUBSYSTEM-BILI.md) |
| **记忆** | 衰减卡（清晰度/遗忘/容量告警/压缩）、全量卡（append-only）、三场景共享、隐私 scope、双向记忆 | [MEMORY_CARD.md](docs/guides/MEMORY_CARD.md) |
| **人格** | 多角色整包切换、自动存档/回档、管理员双身份、身份对齐 | [CHARACTER_PERSONA.md](docs/guides/CHARACTER_PERSONA.md) |
| **主动** | 目的机制（目标假设/载体 QQ·桌宠/互斥回落）、对话收尾、二代 proactive | [PURPOSE_OUTREACH.md](docs/guides/PURPOSE_OUTREACH.md) |
| **语音** | 语音库发送、本地/云端 TTS 现场合成、语音包安装启停、音量/响度、频率上限；`qq_send_voice` / `qq_list_voices`（**AI 发语音默认关闭**） | [SUBSYSTEM-VOICE.md](docs/guides/SUBSYSTEM-VOICE.md) |
| **桌宠** | 文本/语音对话、气泡与回复按钮、专注模式、目的载体、断线重连 | [SUBSYSTEM-PET.md](docs/guides/SUBSYSTEM-PET.md) |
| **额度** | 每日 token 额度（QQ/B站/其他/总额，双单位，80% 提醒、100% 停）、消费看板 | [DATA-AND-CONFIG.md](docs/guides/DATA-AND-CONFIG.md) |
| **工具面** | 39 个 `qq_*` 工具、三个 MCP server、两代 preset、fail-closed 工具守卫 | [AGENT-TOOLS-AND-PRESETS.md](docs/guides/AGENT-TOOLS-AND-PRESETS.md) |
| **界面** | 设置页 14 个标签、控制台 10 个页面 | [UI-AND-CONSOLE.md](docs/guides/UI-AND-CONSOLE.md) |

---

## 五、架构一图

```
┌──────────────── 用户可见 ────────────────┐
│ DSH Web GUI    控制台 :3100    桌宠窗口   │
└──────┬──────────────┬─────────────┬──────┘
┌──────▼──────────────▼─────────────▼──────────────────────────┐
│ DSH 宿主  └─ surfcore 插件（bundle）                            │
│     设置页 · 设置页 API · 桌宠 API · B站调度 · 记忆卡 · 额度    │
└──────┬───────────────────────────────────────────────────────┘
       │ HTTP（会话 Cookie） + 子进程管理
┌──────▼───────────────────────────────────────────────────────┐
│ QQ 桥接进程（node src/bridge.js，单实例）                       │
│   OneBot WS · DSH 客户端 · 控制台 :3100 · 三个 MCP server       │
└──┬────────────┬──────────────┬───────────────────────────────┘
   │ WS         │ stdio        │ HTTP
┌──▼────────┐ ┌─▼──────────┐ ┌─▼─────────────────┐
│ SnowLuma2 │ │ DSH MCP    │ │ 语音引擎 8765/8767 │
│（第三方）  │ │ 客户端      │ │（surfvoice*）      │
└───────────┘ └────────────┘ └───────────────────┘
```

- **两套状态根**：桥接数据在 `<仓库根>/state/`，插件数据在 `~/.dsh/surfcore/`。
- **三份配置**：`config.json`（QQ）、`~/.dsh/surfcore/config.json`（合体层）、`~/.dsh/surfcore/bili.config.json`（B站）。
- **DSH 端口会漂移**：桥接与插件都用 `discoverDshBaseUrl()` 发现，不要硬编码。

完整说明（含 6 条数据流与重启矩阵）：[ARCHITECTURE.md](docs/guides/ARCHITECTURE.md)。

---

## 六、文档地图

> **2026-10-26 全仓库逐行梳理**：12 篇、约 8,700 行、3,150 处 `文件:行号`。

| 步 | 读什么 | 读到什么程度 |
| --- | --- | --- |
| 1️⃣ 5 分钟 | **本文** | 它是什么、怎么装 |
| 2️⃣ 15 分钟 | [ARCHITECTURE.md](docs/guides/ARCHITECTURE.md) | 几个进程、怎么分层、改什么要重启什么 |
| 3️⃣ 按需 | 下面分册 | 改哪个子系统翻哪本 |

| # | 文档 | 行数 | 什么时候翻它 |
| --- | --- | --- | --- |
| 1 | [ARCHITECTURE.md](docs/guides/ARCHITECTURE.md) | 335 | 总纲 |
| 2 | [DATA-AND-CONFIG.md](docs/guides/DATA-AND-CONFIG.md) | 351 | 三份配置每个键、约 95 个状态文件 |
| 3 | [BOUNDARIES.md](docs/guides/BOUNDARIES.md) | 181 | 做不到什么、坏了怎么恢复 |
| 4 | [MODULE-BRIDGE.md](docs/guides/MODULE-BRIDGE.md) | 1,020 | 桥接全文 |
| 5 | [MODULE-CORE-A.md](docs/guides/MODULE-CORE-A.md) | 1,001 | 记忆/人格/目的/收尾/额度/账本/计价/身份 |
| 6 | [MODULE-CORE-B.md](docs/guides/MODULE-CORE-B.md) | 1,098 | B站/鱼群/表情/黑话/文本化/SSRF/DSH 客户端 |
| 7 | [MODULE-PLUGIN.md](docs/guides/MODULE-PLUGIN.md) | 1,101 | 插件宿主：装配、配置模型、设置页 API、B站 调度 |
| 8 | [UI-AND-CONSOLE.md](docs/guides/UI-AND-CONSOLE.md) | 677 | 设置页 14 标签 + 控制台 10 页 |
| 9 | [SUBSYSTEM-VOICE.md](docs/guides/SUBSYSTEM-VOICE.md) | 855 | 语音三条链路 |
| 10 | [SUBSYSTEM-PET.md](docs/guides/SUBSYSTEM-PET.md) | 904 | 桌宠全链路 |
| 11 | [SUBSYSTEM-BILI.md](docs/guides/SUBSYSTEM-BILI.md) | 981 | B站 34 命令 / 23 库 |
| 12 | [AGENT-TOOLS-AND-PRESETS.md](docs/guides/AGENT-TOOLS-AND-PRESETS.md) | 233 | 39 个工具、守卫、两代 preset |

其它：DSH 装配 [DSH_SETUP.md](docs/guides/DSH_SETUP.md) · 安全基线 [SECURITY_BASELINE.md](docs/guides/SECURITY_BASELINE.md) ·
踩坑 [PITFALLS.md](docs/PITFALLS.md) · 风险台账 [RISK_REGISTER.md](docs/RISK_REGISTER.md) · 全部索引 [docs/README.md](docs/README.md)。

---

## 七、安全与边界（摘要）

- **群友碰不到你的机器**：仿真会话的工具面是白名单、fail-closed，本地执行能力全部被 restrict。
- **发送必须命中白名单**：没有"管理员例外"这种后门。
- **控制台只接受本机回环** + 令牌（定长比较）+ Host/Origin 校验 + 写操作强制 JSON。
- **密钥不落日志**；`state/` 用 icacls 切断 ACL 继承。
- **不可逆删除 = 事故**：清理一律先隔离到 `_backups/`。
- **不承诺**提示注入的语义层 100% 防护（真正的边界是工具面与白名单）。

详见 [SECURITY_BASELINE.md](docs/guides/SECURITY_BASELINE.md)、[BOUNDARIES.md](docs/guides/BOUNDARIES.md)、[RULES.md](RULES.md)。

---

## 八、常见问题（FAQ）

| 问题 | 回答 |
| --- | --- |
| 能不装 SnowLuma 吗？ | QQ 部分不能（它负责登录与收发）。只要 B站/记忆/桌宠可以。 |
| 能不用 DSH 吗？ | 不能，插件与 preset 都跑在 DSH 里。 |
| 会自己发消息吗？ | 默认不会。主动搭话要显式开「目的」；二代下发言必须调工具。 |
| 数据会上传吗？ | 只有拼进提示词的文本会发给模型 API；不想让黑话词条出机就关 `slang.autoResearch`。 |
| 支持 Linux/macOS 吗？ | Linux 有移植版：见 [docs/guides/LINUX.md](docs/guides/LINUX.md)（移除桌宠、SnowLuma2 用 Docker、systemd 启动）。macOS 未验证。 |
| 能多用户/远程吗？ | 不做。控制台只接受回环。 |
| 语音包/桌宠必须装吗？ | 不必须。不装则语音不可用、目的机制走 QQ。 |
| 改名/换角色会丢记忆吗？ | 不会。角色包整包隔离，切换带快照，可回档。 |

---

## 九、开发

```bash
npm run test:audit              # 默认门禁（75 个脚本，离线）
npm run test:regressions        # 桥接/协议回归
cd plugins/surfcore && npm test # 插件侧（含更新检查、桌宠更新保留数据的回归）

npm run privacy-scan:strict     # 发布前隐私扫描（0 命中才可发布）
npm run guard:check             # DSH 升级后先跑（asar 会话护栏补丁是否还在）
node scripts/setup-dsh.mjs      # 重装 preset + MCP
```

目录结构见 [docs/FOLDER_MAP.md](docs/FOLDER_MAP.md)；代码分层与"改什么要重启什么"见
[ARCHITECTURE.md](docs/guides/ARCHITECTURE.md)。

---

## 十、许可与合规

- 本仓库 **MIT**。
- **SnowLuma2 是第三方专有组件**，不随仓库分发、不打包；一键脚本仅从公开的 [lingyu20/SnowLuma2](https://github.com/lingyu20/SnowLuma2) 拉取源码构建，不代登录/不代扫码。
- 请自行遵守 QQ / B站 服务条款与当地法律；本项目不提供绕过风控的能力。

> 老版本（≤0.6.18）无法自动更新：用 [强制更新提示词.txt](dist/强制更新提示词.txt)（复制给 DSH）或 [在线版说明](docs/guides/FORCE_UPDATE_PROMPT.md)。
