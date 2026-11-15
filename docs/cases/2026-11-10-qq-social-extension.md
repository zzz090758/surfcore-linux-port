# 2026-11-10 QQ 空间 / 个性签名扩展（阶段一、二）

## 现象

用户要求让角色像正常人一样发 QQ 动态、设置标签/背景/个性签名，并明确：

- 先做**阶段一（签名 + 文字说说）**和**阶段二（带图说说）**；
- 尽量通过 **SurfCore 扩展插件**实现，不改主流程；
- 阶段三（标签/背景）以后再说；
- 更新尽量不停机。

## 根因 / 能力

SnowLuma 的 OneBot 扩展已经提供：

- `set_self_longnick`（个性签名）
- `send_qzone_msg`（说说，支持文字/图片/可见范围）
- `get_qzone_msg_list` / `delete_qzone_msg` / `set_qzone_msg_right`
- `get_qzone_profile` / `set_qzone_profile`

SurfCore 之前没有把这些动作暴露给模型；直接写进主桥接会让 qzone 逻辑和聊天主流程耦合。

## 方案

### 扩展

`plugins/surfcore/extensions/qq-social/`：

- 默认 `enabled:false`；
- 只依赖 `api.qq.readConfig()` 里的 SnowLuma `httpUrl/accessToken` 和 `api.config`；
- 自己校验正文长度、图片数、可见范围、每日上限，写 `dataDir/qzone-audit.jsonl`；
- 提供 `GET /actions`、`GET /status`、`POST /action`。

### MCP 通用入口

`src/mcp-snowluma-safe.js` 新增两个通用工具：

- `surfcore_ext_list`：列出已启用扩展的动作；
- `surfcore_ext_call`：调用 `extension/action/args`。

这样以后给扩展加动作，只重载扩展，**不需要新增 MCP 工具或重启 DSH**。

### 链路

```
模型
  → MCP surfcore_ext_call
  → 插件宿主 /dsh-surfcore/ext/qq-social/action
  → SnowLuma OneBot /set_self_longnick 或 /send_qzone_msg
  → QQ 空间
```

## 隐私设计

- 默认 `defaultPrivacy=64`（仅自己可见）；
- `allowPublic=false`：`ugc_right=1` 直接拒绝；
- 每天默认最多 1 条说说；
- 敏感内容不额外扫描（由 QQ 平台审核），扩展只做长度/频率/权限校验。

## 验证

实测：

1. 启用扩展：`extensions` 返回 `routes: GET /actions, GET /status, POST /action`；
2. 签名：设置 `"SurfCore 扩展自检"` 后 `get_stranger_info.long_nick` 读到同值；清空后恢复空串；
3. 说说：私有(`ugc_right=64`)+1x1 PNG 图片发布成功，返回 `tid=5e8ba5d980b7f26a404a0600`，随后 `delete_qzone_msg` 删除；
4. 空列表：SnowLuma 对 0 条说说返回 `msglist:null`，扩展归一为 `{total:0,msglist:[]}`；
5. MCP 直连测试：`surfcore_ext_list` 能列出 `qq-social` 动作，`surfcore_ext_call(qzone_list)` 返回空列表；
6. DSH 重启后扩展自动激活，桥接保持 active（systemd 独立）。

## 事故与处置

设置签名时，QQ 账号开启了「个性签名同步到空间」，QQ 自动生成了一条**公开说说**（内容即签名文本）。  
已用 `delete_qzone_msg` 删除（tid `5e8ba5d9c9b7f26a2ac50500`），随后列表恢复 0 条。  
**残余风险**：扩展无法关闭 QQ 的签名同步；已在动作描述和扩展 README 里警告，建议用户先在 QQ 空间设置里关闭同步。

## 取舍

- **扩展 + 通用 MCP 工具**：qzone 逻辑隔离，动作热更新；代价是多一层 MCP 通用工具、首次安装需重启 DSH 加载工具。
- **直接写主桥接**：少一层，但耦合主流程、每次改动要重启桥接；不符合用户“扩展插件/不乱”的要求。
- **阶段三**：标签只能作为正文 `#标签#`；背景/皮肤 SnowLuma 无 API，暂不做。

## 回滚

1. SurfCore 设置 → 扩展 → 停用 `qq-social`；
2. 需要彻底移除：删除扩展目录、从 `src/mcp-snowluma-safe.js` 去掉通用工具；
3. 已发说说用 `qzone_delete` 删除；签名用 `set_signature` 空串清空。

## 残余

- 首次安装通用 MCP 工具需要重启一次 DSH；之后扩展动作更新只重载扩展。
- 没有“发布前主人确认”开关；当前靠 `allowPublic=false` + 仅自己可见兜底。
- 标签/背景未实现（阶段三）。
- 签名同步到空间是 QQ 账号设置，扩展无法控制。
