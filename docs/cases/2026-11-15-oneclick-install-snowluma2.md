# 2026-11-15 Linux 一键安装脚本 + SnowLuma2 迁移

## 背景

- 原 SnowLuma 仓库/镜像已不可用，不能继续让新用户 `docker pull motricseven7/snowluma:latest`；
- 公开可用替代：`https://github.com/lingyu20/SnowLuma2`；
- 需要 GitHub 直连和 `gh-proxy.com` 两个安装入口；
- README 的 Linux 安装环境/步骤需要同步，避免继续写 Windows/旧 SnowLuma。

## 新增

### 一键安装

- `scripts/linux/install-oneclick.sh`（GitHub 直连）
- `scripts/linux/install-oneclick-ghproxy.sh`（`https://gh-proxy.com/` 代理）

流程：

1. 检查 Node ≥22.13、DSH、curl/tar；
2. Docker 缺失时询问后用 apt 安装（安装后需重新登录 SSH 使 docker 组生效）；
3. 下载 SurfCore 源码到 `~/surfcore-linux-port`；
4. 执行 `scripts/linux/install.sh`；
5. 执行 `scripts/linux/install-snowluma.sh`，从 SnowLuma2 源码构建；
6. 生成 `config.json`，打印扫码/编辑配置/启动步骤。

QQ 扫码和 `config.json` 仍必须手动完成。

### SnowLuma2 部署

- `scripts/linux/install-snowluma.sh`：
  - 下载 `lingyu20/SnowLuma2` 到 `~/snowluma2`；
  - `deploy/snowluma.compose.yml` 用其 Dockerfile 构建 `snowluma:2.2.0`；
  - 持久化 `~/snowluma-data` / `~/snowluma-config` / `~/snowluma-local`；
  - 端口仍只绑 `127.0.0.1`；
  - 支持 `GH_PROXY` 覆盖源码/QQ 安装包镜像。
- `deploy/snowluma.compose.yml` 从旧镜像改为 SnowLuma2 build。

## 文档

- README 增加「一键安装（推荐）」和 gh-proxy 命令；
- README 环境表、端口表、SnowLuma2 来源和 EULA 说明同步；
- Linux 指南第 3/4 节改为 one-click + SnowLuma2。

## 验证

- `bash -n` 三个脚本通过；
- `docker compose -f deploy/snowluma.compose.yml config` 通过（dummy env）；
- gh-proxy 的 SurfCore / SnowLuma2 archive URL 均返回 200；
- 未在当前生产服务器执行重建（当前 QQ 容器仍在跑旧镜像，避免中断）；
- 回归 `npm run test:audit` 待跑。

## 回滚

- 回退 scripts/README/docs；
- 已部署的旧容器不改动；新安装才会使用 SnowLuma2。
