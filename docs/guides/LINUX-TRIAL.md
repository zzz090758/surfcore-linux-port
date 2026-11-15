# SurfCore Linux 移植 · 可复现试验报告

- 日期：2026-11-09
- 主机：`192.0.2.10`（Ubuntu 26.04，4 vCPU / 5.3 GiB / 23 GiB 磁盘）
- 运行时：Node `v22.22.1`、DSH `0.2.1-rc.2`、Docker `29.9.3`
- 仓库：`ssh://git@gitea/gitadmin/surfcore-linux.git`，分支 `linux-port`
- 被测目录：`/home/ubuntu-deepseek/work/surfcore`

## 1. 环境准备（可复现）

```bash
# DSH（本地项目安装；也可 npx）
mkdir -p ~/dsh && cd ~/dsh && npm init -y
npm i @deepseek-ai/dsh@0.2.1-rc.2 --no-audit --no-fund

# 仓库
git clone ssh://git@gitea/gitadmin/surfcore-linux.git ~/work/surfcore
cd ~/work/surfcore && git checkout linux-port
npm install --no-audit --no-fund

# 时区必须是 Asia/Shanghai（否则每日额度/作息错 8 小时）
sudo timedatectl set-timezone Asia/Shanghai

# 注册插件（需要 pnpm）
npm i -g pnpm@9 --prefix ~/.local
export PATH="$HOME/.local/bin:$HOME/dsh/node_modules/.bin:$PATH"
node scripts/setup-dsh.mjs web

# 启动 DSH 与桥接
cd ~/dsh && nohup ./node_modules/.bin/dsh --profile web --no-open --port 3080 &
cd ~/work/surfcore && scripts/linux/install-service.sh
```

## 2. 离线回归

```bash
cd ~/work/surfcore
TZ=Asia/Shanghai node scripts/test-audit.mjs
```

实测：

```
Audit suite: 153/153 scripts passed.
```

Windows 专属项（`chcp`、`start.bat` CRLF、PowerShell 压缩包）在 Linux 上自动 skip 或被
`unzip`/`fs.cpSync` 等价实现替换；对应改动见 `scripts/test-console-encoding.mjs`、
`scripts/test-audit-setup-guards.mjs`、`scripts/test-update-apply-result.mjs`、`scripts/apply-update.mjs`。

## 3. DSH 协议复核

```bash
node scripts/verify-dsh-020-adaptation.mjs
node scripts/patch-dsh-session-guard.mjs --check
```

实测：**61 通过 / 4 失败**。4 项都不是 Linux 移植引入：

1–2. `preset qq-chat / qq-chat-v2: 保留 {{model}} / {{cwd}}`：仓库源文件已注明
`{{cwd}}` 在 DSH 0.2.1-rc.2 不再注册，校验脚本自身过期。
3. 守卫名单“假名”：名单覆盖其它 DSH 组合/版本的工具名；执行期白名单仍 fail-closed。
4. `DSH 实测段无未捕获异常`：`session/model-unavailable`，因为本机没有模型凭据。

`guard:check` 在 Linux 上输出：

```
[guard] 当前平台没有 DSH Desktop 的 app.asar（Linux Web 形态），跳过会话护栏补丁检查。
```

## 4. QQ 桥接双向回环（Mock OneBot）

没有真实 QQ 登录时，用仓库内的 `scripts/mock-onebot.mjs`（OneBot 11 HTTP :3000 + WS :3001）
验证桥接的收/发两条链路。Mock 需要 `ws`：

```bash
npm i ws --no-save --no-audit --no-fund
```

步骤：

```bash
docker stop snowluma                     # 让出 3000/3001
systemctl --user stop surfcore-bridge
# 临时把 100000000 加入 config.json 的 allow.groups
node scripts/mock-onebot.mjs > /tmp/mock.log 2>&1 &
systemctl --user start surfcore-bridge
sleep 20                                 # mock 连上 8 秒后推一条群消息
```

### 4.1 入站：QQ → 白名单 → DSH 会话

桥接日志：

```
[reserved2] 计划唤醒 group:100000000（bootstrap），6s 后发送
[reserved2] 唤醒 group:100000000（bootstrap）
会话 group:100000000 已挂载 preset qq-chat-v2
设置会话模型失败 session-100000000-…: session/model-unavailable: Select an available model before sending a message.
新会话 group:100000000 -> session-100000000-05a6-4449-8f6c-17e116ff2e1e（模式 reserved2，preset: qq-chat-v2）
```

结论：消息解析、白名单、唤醒调度、preset 挂载、DSH 会话创建全部正常；只因本机没有模型凭据，
回合在 `selectModel` 处停止。配置模型后即可继续到回复。

### 4.2 出站：桥接 → OneBot → 群

```bash
CT=$(cat state/console-token)
curl -sS -X POST "http://127.0.0.1:3100/api/test-send?token=$CT" \
  -H 'content-type: application/json' \
  -d '{"kind":"group","id":100000000,"message":"Linux 回环测试"}'
```

返回：

```json
{"ok": true, "kind": "group", "id": 100000000, "message_id": {}}
```

Mock 侧收到：

```
WS action send_group_msg {"group_id":100000000,"message":[{"type":"text","data":{"text":"Linux 回环测试"}}]}
```

结论：桥接 → OneBot WS 的出站调用与序列化正常。

### 4.3 清理

```bash
docker start snowluma
# 从 config.json 的 allow.groups 移除 100000000（restore 备份）
systemctl --user restart surfcore-bridge
```

### 4.4 完整链路：QQ → DSH → LLM → QQ（Mock LLM）

为了验证「模型回复也能回到 QQ」，额外用 `scripts/mock-anthropic.mjs` 起了一个本地假
DeepSeek（Anthropic Messages SSE，端口 18080），让 DSH 指向它：

```bash
node scripts/mock-anthropic.mjs > /tmp/mock-llm.log 2>&1 &
# 重启 DSH 时带上（仅测试环境）
DEEPSEEK_BASE_URL=http://127.0.0.1:18080 DEEPSEEK_API_KEY=mock-key \
  dsh --profile web --no-open --port 3080
# 用 DSH settings/update 把 qq-mode 改成 chat（或在设置页切换）
```

再跑一次 mock OneBot。桥接日志：

```
会话 group:100000000 已挂载 preset qq-chat
已设置会话模型 session-e1d2a8fb-… -> deepseek-official/deepseek-flash (max)（跟随 DSH 默认模型）
新会话 group:100000000 -> session-e1d2a8fb-…（模式 chat，preset: qq-chat）
agent 回复 (group:100000000) 25 字
```

Mock OneBot 收到：

```
WS action send_group_msg {"group_id":100000000,"message":[{"type":"text","data":{"text":"收到，我在。这是一条 Linux 端到端测试回复。"}}]}
```

Mock LLM 收到：

```
POST /v1/messages stream= true messages= 1
```

结论：**入站消息 → 白名单 → preset → 模型流式调用 → 回复切分 → OneBot 出站** 整条链路在 Linux
上成立。这里用的是假模型，只证明协议/传输；真实回复仍需配置你自己的模型 Key。

清理：停 mock、恢复 `config.json`/`state/mode.json`、`docker start snowluma`、重启桥接与 DSH
（不带 `DEEPSEEK_BASE_URL`）。

### 4.5 设置页 / 数据面 API 冒烟

用 DSH 登录 Cookie 逐个打插件 API（Linux 上不得出现路径/权限 500）：

| 端点 | HTTP | ok |
| --- | --- | --- |
| `/dsh-surfcore/api/overview` | 200 | true |
| `/dsh-surfcore/api/config` | 200 | true |
| `/dsh-surfcore/api/characters` | 200 | true |
| `/dsh-surfcore/api/memory` | 200 | true |
| `/dsh-surfcore/api/memory-card` | 200 | true |
| `/dsh-surfcore/api/token-budget` | 200 | true |
| `/dsh-surfcore/api/watch-history` | 200 | true |
| `/dsh-surfcore/api/align` | 200 | true |
| `/dsh-surfcore/api/extensions` | 200 | true |
| `/dsh-surfcore/api/platforms` | 200 | true |

`diagnostics` 返回 200 + `ok:false` 是预期：没有白名单 / B站未登录。B站 CLI 也能在 Linux 直接跑：

```
node plugins/surfcore/tools/bili.mjs --help
用法: node bili.mjs <命令> [参数...]
```

## 5. 真实账号验收（2026-11-09 22:17）

### QQ

- 机器人 `100000000（哦鲸鲸）` 已登录；SnowLuma `connected=true, accountOnline=true, good=true`。
- 群 `100000000`、`100000000` 已加白名单；管理员 `100000000` 的私聊测试发送成功（message_id `100000000`）。
- 真实往返已验证：
  - 群里 `hello` → 机器人回「哼，主人今天怎么想起来找我了？」「……才、才没有一直在等你呢！」
  - 群里「画只戴帽子的猫」→ 文字回复正常；图片生成失败（见 §6）。
- 模型：`deepseek-official/deepseek-flash`，桥接日志有 `agent 回复` 与 `工具统一发送 … 成功`。

### B站

- 小肥鱼账号 `哦鲸鲸----`（mid `3747581414870216`）凭据有效（`bili.mjs session`），
  `fetchMyDynamics()` 返回 `ok:true, items:1`，动态基线已建立。
- 主人 B站：`owner.mid=100000000` 已填，但 `owner.name` 为空、`owner-credentials.json` 不存在，
  「抓取主人偏好」仍不可用。
- B站→QQ 记忆简报：`blocked:true`，标签 `疑似账号/号码`，`briefPreview` 为空（隐私闸门拦截）。

### 模型

- QQ / DSH Web 会话：可用（有真实回复）。
- `dsh headless`：仍 `MISSING_CREDENTIAL`。它是独立进程，不共享 Web 会话凭据；不影响 QQ。

## 6. 当前已知异常（2026-11-09 22:17 只读检查）

| 功能 | 状态 | 证据 |
| --- | --- | --- |
| 向量记忆 | 已关闭但残留 188 条未索引 | `enabled:false, indexed:0, pending:188, lastError=vector.service-missing` |
| 语音 / TTS | 三条链路都未启动 | voxd 8765、GPT-SoVITS 9880、cloud 8767 均未监听；`voice-packs` 为空 |
| B站 主人绑定 | 仅填了 mid，没有凭据 | `owner-credentials.json` 缺失、`owner.name` 空 |
| B站→QQ 记忆 | 隐私拦截 | `blocked:true, labels=["疑似账号/号码"]` |
| 图片生成 | 失败 | 机器人自报「密钥不对」；聊天模型与图片 Key 是两套 |
| 控制台诊断 | 误报 | 诊断说令牌未生成，但 `3100` 带 `state/console-token` 实际 200 |
| 桥接守护 | 非 systemd | `surfcore-bridge.service` inactive，实际是手工 PID 持有 3100；崩溃不会自动重启 |

## 7. 结论

Linux 代码路径（端口发现、ACL、进程/服务、SnowLuma Docker、更新器、启动器、扫码浏览器）已跑通，
离线回归 153/153；真实 QQ 文本往返与 B站 小肥鱼账号已通过。剩余问题集中在**可选运行时**
（语音、向量记忆）、**B站 主人绑定/隐私拦截**、**图片 Key** 与**进程守护**，均属配置或运维项，
不是移植代码缺失。
