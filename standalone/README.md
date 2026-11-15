# SurfCore 独立 Web

把 DSH 里的 SurfCore 设置页单独挂到一个网页上，**不需要打开 DSH 界面**。  
仍然需要本机 DSH 进程在跑——SurfCore 的业务 API、调度器、agent 会话都在 DSH 里。

## 结构

```
浏览器 ──登录──> surfcore-web (:3090)
                    │ 只反代 /dsh-surfcore/api/*
                    ▼
            127.0.0.1:3080 (DSH 插件 API，Host 改写 + 服务端注入会话 Cookie)
```

- 浏览器拿不到 DSH 的 URL token / Cookie；
- 只允许 `/dsh-surfcore/api/` 前缀，不暴露 DSH 其它接口；
- 登录密码 scrypt 哈希存 `~/.dsh/surfcore/web-password.json`；
- 会话是 HMAC 签名，默认 12 小时；
- 可选用 `TLS_CERT` / `TLS_KEY` 直接跑 HTTPS。

## 构建

```bash
cd standalone
npm install
npm run build        # 生成 public/app.js（React + 宿主 shim）
```

## 设置密码

```bash
node standalone/setup-password.mjs            # 随机密码，打印一次
node standalone/setup-password.mjs '自定义密码'
```

## 运行

```bash
cd standalone
HOST=192.0.2.10 PORT=3090 node server.mjs
```

systemd 用户服务示例：

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

然后打开 `http://192.0.2.10:3090/`，用密码登录。

## 已知边界

- 服务器没有桌面，设置页里的「浏览…」原生文件选择框会失败；路径可以手填。
- 仍然依赖 DSH 与 SurfCore 插件；DSH 停了页面 API 会 502。
- 没有实现多用户/角色，只有一个共享密码。
- 公网使用必须再套 HTTPS + 强认证/VPN，不要直接映射端口。
