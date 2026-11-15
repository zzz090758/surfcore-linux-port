# 2026-11-14 睡眠静默 & 群活跃度过滤

## 需求

1. 00:30 睡觉不强制发消息；AI 没再发消息就标记已睡着，安静会话不再补提醒。
2. AI 一天内在一个群发言不超过 15 条 → 标记该群不活跃，不主动分享视频/动态。

## 睡眠部分

### 原行为

- 23:30 向活跃会话发“准备睡了”；
- 23:40 后被打扰回“真要睡了”；
- 00:20 给最近 60 分钟活跃会话再补一条 firm；
- 00:30 只写日志，不主动发消息。

问题：00:20 的补发不看 AI 是否已经安静，可能对早已没聊的会话硬发一条。

### 新行为

- 00:20 只给 **23:40 之后仍有活动**的会话补提醒：
  - `lastAiReplyAt >= 23:40`（AI 还发过消息），或
  - 最近一条人类消息 >= 23:40；
- 没有活动的会话写 `st.sleepAsleepDay` / `sleepAsleepAt` / `sleepAsleepReason`，不再发；
- 00:30 强制入睡时，给所有会话补 `sleepAsleepDay`，但不发任何 QQ 消息；
- 23:30 的“准备睡了”保持不变。

## 群活跃度部分

### 计数

`recordSentMessagesV2()` 在群聊里每成功发一条 AI 文本，就累加：

```
st.aiSentDay / st.aiSentCount
st.aiSentPrevDay / st.aiSentPrevCount
```

跨天时把昨天计数挪到 prev，不统计私聊、不统计 B站卡片/系统消息。

### 判定

```json
"socialV2": {
  "groupActivity": {
    "enabled": true,
    "inactiveMaxAiMessages": 15
  }
}
```

- 当天 AI 消息数 <= 15 **且** 前一天 <= 15 → 不活跃群；
- 任一天 > 15 → 活跃群。

### 拦截点

- `src/bili-share-scheduler.js`：`shouldShareGroup(gid)`，不活跃群跳过 B站定时分享；
- `src/bili-dynamics.js`：`shouldSendGroup(gid)`，不活跃群跳过 B站动态同步；
- 被动回复、@、私聊触发的消息不拦。

## 影响面

- 睡眠：只影响 00:20 的补提醒和 00:30 的标记，不影响 23:30 提示；
- 群活跃：只影响主动分享类内容，不影响正常聊天；
- 初始/历史无计数的群按“不活跃”处理，不会突然收到主动分享；
- 所有判定都在桥接进程内，不新增外部服务。

## 验证

- `node --check src/bridge.js src/bili-share-scheduler.js src/bili-dynamics.js` 通过；
- 扩展/QQ 页「群活跃度」字段可见（高级设置展开后）；
- 回归 `npm run test:audit` 通过；
- 没有在真实群触发主动分享做端到端测试（遵守测试只发 100000000 群）。

## 回滚

- 关闭 `socialV2.groupActivity.enabled`；
- 或回退本提交；睡眠字段 `sleepAsleepDay` 仅新增，不影响旧状态。
