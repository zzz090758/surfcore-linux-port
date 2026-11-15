# 2026-11-14 QQ 功能批次汇总

本轮把 QQ 侧的语音、空间、白名单、额度、睡眠和群活跃度一起补齐。以下按用户可见行为整理，详细根因/验收看各 case 文档。

## 1. QQ 收到语音自动转文字

- 收到 `record` 段时，按 `message_id` 调 SnowLuma `fetch_ptt_text`；
- 转写成功：消息内容变成 `[语音转文字] ...`，进入模型上下文；
- 转写失败/为空/超时：回退 `[语音]`，不阻塞消息；
- 只对**新收到的实时语音**生效；历史回填不补转写；
- 开关：`socialV2.voice.transcribeIncoming`（默认开）。

case: [`2026-11-11-qq-incoming-voice-stt.md`](2026-11-11-qq-incoming-voice-stt.md)

## 2. QQ 空间 @我 自动点赞/评论

- 每 N 分钟扫好友动态，命中 `@昵称`、`@QQ号` 或正文提到昵称/QQ；
- 自动点赞 + 评论；
- 评论由独立 DSH 会话现场生成（`mentionGenerate`），token 记 `qzone:comment`，日汇总计入「其他花费」；
- 生成失败回退 `mentionComment` 固定模板；
- `mention-seen.json` 去重，同一 tid 不重复；
- 受 `maxCommentsPerDay` / `maxLikesPerDay` 限制。

case: 见 `2026-11-10-qq-social-extension.md` 及 README。

## 3. QQ 空间自动发说说调度

- 不再只靠用户来问；扩展内独立 `autoPostTick`；
- 默认窗口 `12:00–23:00`，每 20 分钟检查一次；
- 每天目标随机 `1~2` 条，且不超过 `maxPostsPerDay`；
- 每次检查按 `autoPostChance`（默认 0.25）决定是否发；
- 两条自动说说至少间隔 120 分钟；
- 内容由 `/api/qzone/generate` 的 `mode=post` 生成，token 计入 qzone / 其他花费；
- 默认隐私 4；`ugc_right=1` 且未开 `allowPublic` 时降级为 4。

case: [`2026-11-12-qq-autopost-scheduler.md`](2026-11-12-qq-autopost-scheduler.md)

## 4. 私聊白名单：管理员与其他分开

- 管理员 QQ 单独识别、始终放行，不再依赖 `allow.private` 是否包含；
- 「其他私聊」只放普通对象；
- 其他为空时：
  - `allowAllWhenEmpty=true` → 所有私聊放行；
  - `false` → 只允许管理员；
- 配置仍保留 owner 在 `allow.private` 里兼容旧逻辑，但 owner 不参与“其他是否为空”的判断。

case: [`2026-11-11-private-whitelist-owner-separate.md`](2026-11-11-private-whitelist-owner-separate.md)

## 5. 单会话额度

- QQ 页新增「单会话额度」；
- 按 `group:<群号>` / `private:<QQ号>` 设置每日花费与每日唤醒次数；
- 0/留空 = 不限制；
- 定制额度优先于全局「每会话额度」；
- 到顶拦截原因 `session-limit`，并触发额度耗尽收尾句。

case: [`2026-11-11-private-whitelist-owner-separate.md`](2026-11-11-private-whitelist-owner-separate.md) 同批提交。

## 6. 额度耗尽收尾

- 会话因全局/单会话额度或每日唤醒次数被拦时，如果还有未读，发一句本地轮换的收尾话；
- 每个会话每天最多一次；
- 本地文案，不额外调模型、不烧 token；
- 可在 `socialV2.quotaFarewell` 配置文案/关闭。

case: 见 `2026-11-11` 相关提交。

## 7. 睡眠提醒与安静标记

- 23:30：向最近活跃会话发“准备睡了”；
- 23:40 后：不再接话；有人打扰才回“真要睡了”；
- 00:20：只给 23:40 后仍有活动的会话补最后一句；
- 已经安静的会话写 `sleepAsleepDay`，不再硬发；
- 00:30：强制入睡并标记所有会话，不发任何 QQ 消息；
- 10:30 起床按未读补唤醒。

case: [`2026-11-14-sleep-quiet-group-activity.md`](2026-11-14-sleep-quiet-group-activity.md)

## 8. 群活跃度过滤

- 统计 AI 在每个群每天真正发出的文本消息数；
- 当天和前一天都不超过 `inactiveMaxAiMessages`（默认 15）→ 不活跃群；
- 不活跃群跳过：
  - B站定时视频分享；
  - B站动态同步；
- 群友正常聊天、@、私聊回复不受影响；
- 配置：`socialV2.groupActivity.enabled` / `inactiveMaxAiMessages`；
- 新部署/无历史计数的群默认先按不活跃处理。

case: 同上。

## 9. 测试约束

- 所有测试消息只发到群 `100000000`；
- 不向其他群/私聊发测试消息；
- 本批没有在真实群强制触发 B站分享/语音端到端测试。

## 10. 验证与提交

- `npm run test:audit`：**153/153**；
- 桥接、扩展、B站调度器语法检查通过；
- 主要提交：
  - `c932942` @我自动点赞评论轮询
  - `b300a0d` @我评论模型生成 + qzone/其他花费
  - `814540f` 额度耗尽收尾
  - `936bbb4` 睡眠提醒
  - `c2b2283` 单会话额度
  - `1972dc7` 收到语音转文字
  - `b54f292` 私聊白名单分离
  - `86228cf` 自动发说说调度
  - `93d4fee` 安静会话/群活跃度
  - `11ffe27` 群活跃度跨天计数修正
- 清单：`release/install-manifest.json` 随各批更新并推送。
