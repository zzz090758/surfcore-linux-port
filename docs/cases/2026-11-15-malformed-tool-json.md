# 2026-11-15 MALFORMED_RESPONSE：tool input is invalid JSON

## 现象

QQ 私聊里出现：

```
⚠️ agent 处理出错：DeepSeek Messages stream: tool input is invalid JSON
```

实际出现两次，均在 `private:100000000`：

- 2026-11-14 13:03:05
- 2026-11-14 19:54:31

两次随后都在几秒内成功发出了消息。

## 根因

从 DSH 会话日志 `session-c4cab864-...` 里看到，模型生成 `qq_send_message` 的 tool arguments 时，把中文值写成了裸值：

```json
"messages": 刚刷到有人把朱元璋做成免费live2d模型, "token": "..."
```

缺少字符串开头/结尾的双引号，导致整段 tool input 不是合法 JSON；DSH 返回：

```
MALFORMED_RESPONSE / tool input is invalid JSON
```

不是 SurfCore 桥接拼参数的问题，是模型流本身生成了坏 JSON。

## 修法（2026-11-15）

1. **不再把这个可恢复错误弹给私聊对象**
   - 错误仍写 `bridge.log` / `qq-activity.log`；
   - `MALFORMED_RESPONSE` / `tool input is invalid JSON` 不发送 `⚠️ agent 处理出错`；
   - 其他错误仍按原逻辑私聊提示。

2. **给同会话下一轮补 JSON 约束**
   - 错误时写 `st.lastToolJsonErrorAt`；
   - 24 小时内 `buildWakePromptV2()` 加一段：
     `字符串值必须用双引号完整包住，中文、引号、换行要正确转义……`
   - 降低同一会话再次漏引号的概率。

3. 观察 DSH 自身是否继续自动续跑；两次实测都在几秒内恢复成功，因此不额外造重试回合。

## 影响面

- 只影响错误提示：可恢复的模型格式错误不再打扰私聊用户；
- 仍保留日志可排查；
- 其他错误提示不变；
- 不改变模型/DSH 的解析行为。

## 验证

- 从会话日志定位到具体坏 JSON（见上）；
- `node --check src/bridge.js` 通过；
- `npm run test:audit`：153/153；
- 无法稳定复现模型坏 JSON，未做“故意触发”线上测试。

## 回滚

回退 `src/bridge.js` 的该提交；或恢复私聊错误提示逻辑。
