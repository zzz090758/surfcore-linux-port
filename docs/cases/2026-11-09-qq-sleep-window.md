# 2026-11-10 QQ 睡眠作息改为插件内逻辑（不关进程）

## 现象

用户要求不要用“停桥接进程”的方式睡觉，改成插件内逻辑：

- 23:30 准备睡觉，可以再聊/再刷一会儿；
- **00:30 必须入睡**；
- 10:30 起床；
- 睡眠期间收到的消息不丢，**第二天起床后回**。

## 根因

第一版用 systemd timer 在 23:30 `stop surfcore-bridge`、10:30 `start`。  
问题是“睡觉”等于整个 QQ 桥接下线：控制台 3100 不可用、语音管理不可用，而且要靠屏蔽插件自愈防止它被拉起。
用户要的是“人在线但睡着”，不是“进程没了”。

## 链路

```
QQ 消息 → handleIncoming → 入库 unread → scheduleWakeV2
                                          │
                    qqSleepPhase === 'sleep' ? ──是──> 只记录，不唤醒
                                          │否
                                          ▼
                                   sendWakePromptV2

每 15s sleepTick 计算 sleepPhase：
  23:30 soft（只记日志，不拦消息）
  00:30 sleep（硬闸门）
  10:30 awake → resumeAfterSleep()：遍历有 unread 的会话，scheduleWakeV2(key,'sleep-wake')
```

代码位置：`src/bridge.js`

- `sleepScheduleConfig()` / `computeSleepPhase()`：按 `socialV2.wake.sleepSchedule` 算阶段；
- `sleepTick()`：阶段切换日志；
- `scheduleWakeV2()`、`sendWakePromptV2()`：睡眠阶段硬闸门；
- `resumeAfterSleep()`：10:30 按未读补唤醒。

## 配置

`config.json`：

```json
"socialV2": {
  "wake": {
    "sleepSchedule": {
      "enabled": true,
      "softStart": "23:30",
      "hardStart": "00:30",
      "wakeAt": "10:30"
    }
  }
}
```

- `softStart`：准备睡觉，仍可正常聊天/主动；
- `hardStart`：强制入睡，消息只入库不唤醒；
- `wakeAt`：起床，按未读补唤醒；
- 缺省/`enabled:false` 时完全关闭。

## 影响面

- 桥接进程**一直在线**，控制台 3100、语音管理、QQ 连接不受影响；
- 睡眠期间消息仍进 SnowLuma/桥接 unread，只是不创建 DSH 回合；
- 10:30 起床后按未读补唤醒；如果某个会话没有未读，就不叫；
- B站生物钟独立，不受影响；
- 没有“主人例外”：睡眠期间所有人（含主人）都不回。

## 取舍

- **采用**：桥接内全局相位闸门。保留在线能力，消息不丢，改配置即时生效。
- **放弃**：systemd 停进程。简单但控制台/语音全断，且要防插件自愈。
- 代价：睡眠期间桥接仍占内存/连接；消息积压到 10:30 才处理。

## 验证

1. 临时把 `softStart/hardStart/wakeAt` 设成当前时间 +2/+3/+4 分钟，重启桥接；
2. 日志应依次出现：
   - `[睡眠] HH:MM 准备睡觉...`
   - `[睡眠] HH:MM 强制入睡...`
   - `[睡眠] HH:MM 起床` + `起床：N 个会话有未读，已安排补唤醒`
3. 恢复 23:30/00:30/10:30，重启桥接；
4. `systemctl --user is-active surfcore-bridge` 必须始终 active（睡觉不再停进程）。

本次实测日志：

```
13:52:11 [睡眠] 13:52 准备睡觉：可以再聊/再刷一会儿，13:53 必须睡
13:53:11 [睡眠] 13:53 强制入睡：消息照常收，但不再唤醒；13:54 起床后回
13:54:11 [睡眠] 13:54 起床
13:54:11 [睡眠] 起床：0 个会话有未读，已安排补唤醒
```

## 回滚

```json
"sleepSchedule": { "enabled": false }
```

重启桥接即可；不涉及进程/系统服务改动。

## 残余

- 睡眠期间如果恰好有回合在跑，无法中途掐断；它会在 00:30 前自然结束。
- 10:30 补唤醒只针对有 unread 的会话；已被标读的消息不会补。
- 如果希望主人私聊例外，需要在两个闸门里加 owner 判断，当前未做。
