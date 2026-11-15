# 2026-11-15 新服务器 192.168.1.77 按 README 安装测试

## 环境

- Ubuntu 26.04.1 LTS / x86_64 / 3.3 GiB RAM / 49 GB 磁盘
- 初始没有 Node、npm、DSH、Docker
- 只有 Gitea 可访问；GitHub HTTPS 超时

## 实际步骤

1. apt 安装 Node 22.22.1 / npm 9.2.0 / Docker 29.1.3 / Compose 2.40.3；
2. `npm install @deepseek-ai/dsh@0.2.1-rc.2` 到 `~/dsh`；
3. 从 Gitea 克隆 `linux-port`，执行 `scripts/linux/install.sh`；
4. 启动 DSH（Web 3080）；
5. 用 `GH_PROXY=https://gh-proxy.com/` 执行 `scripts/linux/install-snowluma.sh`；
6. SnowLuma2 容器构建成功，WebUI 5099 / noVNC 6081 返回 200。

## 发现并修复的问题

### 1. 全新 DSH profile 缺少 base/web-app bundle

现象：`dsh` 启动后一直 pending：

```
surfcore pending (waiting for services: webServer, connection, sessionController)
```

根因：`scripts/setup-dsh.mjs` 新建 profile 时 bundles 只写入 `surfcore`。
修复：profile 的 `bundles` 为空（或 `web` profile）时补：

```
@deepseek-ai/dsh-base
@deepseek-ai/dsh-web-app
```

提交：`4310478`。

### 2. raw `node .../bin.js --profile web` 不激活新 profile

现象：直接执行 bin.js 一直 pending 然后退出；`dsh web` 正常启动。

修复：Linux 指南的 systemd 示例改为：

```
ExecStart=%h/dsh/node_modules/.bin/dsh web --no-open --port 3080 --trusted-host <IP>:3080
```

### 3. SnowLuma2 构建被网络卡住

依次遇到：

- Docker Hub 拉 `node:24.22.1-bookworm-slim` 超时；
- Dockerfile 的 Debian apt 用 `deb.debian.org` 很慢；
- GitHub 克隆 noVNC / websockify 超时；
- Dockerfile 的 QQ 镜像 URL 依赖 GitHub release。

修复：

- `install-oneclick-ghproxy.sh` 默认 `DOCKER_MIRROR=docker.m.daocloud.io`；
- `install-snowluma.sh` 在 `GH_PROXY` 下自动补：
  - Dockerfile noVNC/websockify → gh-proxy；
  - Debian apt → 清华 HTTP 镜像（slim 镜像没有 CA，HTTPS 会证书失败）；
- `DOCKER_MIRROR` 可覆盖基础镜像。

提交：`4310478`。

### 4. OneBot 3000 在 QQ 登录前不可用

SnowLuma2 容器启动、WebUI/noVNC 正常，但未扫码登录 QQ 时：

```
curl http://127.0.0.1:3000/ -> Empty reply / connection reset
```

这是预期行为，不是安装失败；需要先通过 noVNC 扫码登录 QQ。

### 5. DSH 没有持久化

现象：手动 `setsid dsh web` 重启 SSH/服务器后不会自动恢复。

修复：新增 `scripts/linux/install-dsh-service.sh`，安装 `dsh-web.service`：

```
ExecStart=%h/dsh/node_modules/.bin/dsh web --no-open --port 3080 --trusted-host <IP>:3080
```

并执行 `sudo loginctl enable-linger $USER`，实现无桌面登录也开机自启。
桥接仍由 SurfCore 插件 `autoStartBridge` 托管，不安装旧的 `surfcore-bridge.service`，避免争抢 `state/bridge.lock`。

## 当前新服务器状态

| 项目 | 状态 |
|---|---|
| Node | 22.22.1 |
| DSH | 0.2.1-rc.2 |
| Docker / Compose | 29.1.3 / 2.40.3 |
| DSH Web 3080 | `dsh-web.service` active / enabled |
| 开机自启 | `Linger=yes` |
| SurfCore 插件 | `/dsh-surfcore/api/overview` 200 |
| QQ 桥接 | 运行（3100，DSH 插件托管） |
| SnowLuma2 容器 | Up |
| SnowLuma WebUI 5099 | 200 |
| noVNC 6081 | 200 |
| OneBot 3000 | 登录 QQ 前不可用 |

## 剩余步骤（需要用户）

1. SSH 隧道：

```bash
ssh -L 6081:127.0.0.1:6081 -L 5099:127.0.0.1:5099 ubuntu-ds@192.168.1.77
```

2. 浏览器打开 `http://127.0.0.1:6081/vnc.html`，密码在服务器：

```bash
cat ~/.dsh/surfcore/snowluma-vnc.pass
```

3. 扫码登录 QQ；
4. 从 `~/snowluma-data/config/onebot.json` 读取 HTTP/WS token，填 `config.json`；
5. 填 `ownerQQ`、白名单，重启桥接。

## 验证限制

- 没有可用的第二个 QQ 账号扫码，因此未完成 OneBot 端到端收消息测试；
- 没有中断 192.0.2.10 的生产 QQ；
- 公开 GitHub 仓库需要重新脱敏快照。
