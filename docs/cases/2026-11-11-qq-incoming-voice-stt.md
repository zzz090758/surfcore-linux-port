# 2026-11-11 QQ 收到语音自动转文字

## 现象

QQ 群/私聊里别人发语音，SurfCore 只把消息记成 `[语音]`，模型不知道对方说了什么。

## 根因

`src/bridge.js` 的 `segmentsToText()` 对 `record` 段硬编码：

```js
case 'record': out.push('[语音]'); break;
```

SnowLuma 本身提供 `POST /fetch_ptt_text`（依赖 QQ 侧对**收到的**语音生成的转写），
但 SurfCore 只在自己发完语音后的可选 readback 里调用它，收消息链路从未调用。

## 修法

1. 新增 `fetchPttTextForMessage(messageId)`：
   - 调 SnowLuma `fetch_ptt_text`，`{message_id}`；
   - 12 秒超时，空文本/失败重试 1 次（间隔 600ms）；
   - 返回空串表示没转写，调用方回退 `[语音]`；
   - 只读 message_id，不把音频路径/URL 带进上下文。
2. `handleIncoming()` 在文本化之前：
   - 找 `record` 段；
   - 如果段里没有自带 text，且 `socialV2.voice.transcribeIncoming !== false`，取转写；
   - 把 `voiceText` 传给 `segmentsToText()`。
3. `segmentsToText()` 的 `record` 分支输出：
   - 有转写：`[语音转文字] <text>`
   - 没有：`[语音]`
4. 设置页「语音」组新增开关：
   - `socialV2.voice.transcribeIncoming`，默认开。

## 影响面

- 只有收到 `record` 段时多一次 SnowLuma HTTP 调用；失败不阻塞消息，仍按 `[语音]` 处理。
- 转写文本会进入模型上下文（和普通文字一样）；不会把音频文件路径/URL 暴露给模型。
- 发语音（TTS）逻辑不变。

## 验证

- SnowLuma 接口实测（历史收到的语音）：
  - `message_id=-100000000` → `就是那个，刚刚我出来拿水杯…`
  - `message_id=100000000` → `我要笑死了。`
- `node --check src/bridge.js`、`node --check plugins/surfcore/lib/client.js` 通过。
- 回归测试待跑 `npm run test:audit`。
- 没有真实再发一条 QQ 语音做端到端验收（避免在非测试群产生测试消息）。

## 回滚

- 设置 `socialV2.voice.transcribeIncoming=false` 并重启桥接；或回退本提交。
- 失败时行为与旧版一致：仍显示 `[语音]`。
