# 2026-11-12 QQ 空间自动发说说调度器

## 现象

`autoPost=true` 时，只有用户主动问“今天发动态没”才会发一条；没有任何人唤醒时不会自己发。

## 根因

`autoPost` 只是 `qqSocialAutopostLine()` 注入唤醒提示词：

```
【QQ空间】你可以在自己想发的时候直接发一条说说……
```

它没有独立定时器，也不检查“今天还差几条”；和「主动找主人」的 `purposeTick` 不是同一套机制。

## 修法

### 扩展侧调度（qq-social）

新增独立 `autoPostTick`：

- 窗口：`autoPostWindowStart`–`autoPostWindowEnd`，默认 `12:00–23:00`；
- 低频检查：`autoPostPollMinutes`，默认 20 分钟；
- 随机性：
  - 每天目标在 `1..autoPostMaxPerDay` 间随机（默认 1~2）；
  - 每次检查再按 `autoPostChance`（默认 0.25）决定是否真的发；
- 间隔：两条自动说说至少间隔 `autoPostMinGapMinutes`（默认 120 分钟）；
- 上限：同时受 `maxPostsPerDay` 和每日目标约束；
- 内容：调用桥接 `/api/qzone/generate` 的 `mode=post`，由独立 qzone 会话生成；
- 发布：`send_qzone_msg`，默认隐私 `defaultPrivacy`；`ugc_right=1` 且 `allowPublic!=true` 时降级为 4；
- 失败只写日志/审计，下次窗口再试，不连续重试。

### 桥接侧生成

`generateQzoneComment` 拆成通用 `generateQzoneText`；新增 `generateQzonePost(hint)`，
`/api/qzone/generate` 支持 `{mode:"post"}`。token 仍归 `qzone:comment` 会话，日汇总计入「其他花费」。

### UI

扩展页新增：

- 数字：自动发动态每天最多、检查间隔；
- 文本：自动发动态窗口开始/结束；
- `autoPost` 开关描述改为“随机调度 + 想发就发”。

## 影响面

- 只影响 QQ 空间说说，不碰 QQ 群/私聊消息；
- 不依赖用户唤醒；扩展启用 + `autoPost` 开 + 窗口内才可能发；
- 默认每天最多 2 条（受用户设置的 `maxPostsPerDay` 上限约束）；
- 每条都会写 `qzone-audit.jsonl`，`source: auto-schedule`。

## 验证

- 桥接 `mode=post` 生成实测返回：
  `晚上八点多泡了杯茶坐窗边吹风，忽然觉得日子慢下来也挺好`
- 调度器已随扩展 reload 启动；首次检查概率未命中，等待下个检查周期。
- `node --check` 通过；回归待跑。

## 回滚

- 设置 `autoPost=false` 或 `autoPostChance=0`；
- 或回退本提交；旧行为回到“只在被唤醒时按提示自行决定”。
