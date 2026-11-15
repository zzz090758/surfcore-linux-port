# 2026-11-11 私聊白名单：管理员 QQ 与其他私聊分开

## 现象

QQ 页的「私聊白名单（allow.private）」把管理员 QQ 和普通私聊混在一起：

- 管理员被当成普通白名单条目，显示在同一个输入框里；
- 管理员在列表里会让 `allow.private.length > 0`，于是「其他私聊为空时按默认规则放行」永远不成立；
- 主人私聊的放行依赖白名单数组，而不是独立的“管理员身份”。

## 根因

`src/bridge.js` 的 `allowed()`：

```js
const allowList = cfg.allow[kind] ?? ...
if (allowList.length > 0) return allowList.map(String).includes(s);
return cfg.allowAllWhenEmpty;
```

`allow.private` 同时承担“管理员”和“其他私聊”两个职责；`normalizeAllowlist()` 还会自动把主人补进该数组。
因此只要管理员存在，其他私聊名单在逻辑上就永远不是空。

## 修法

1. `allowed()` 对 `private`：
   - 先判断 `deny.private`；
   - 如果私聊对象等于 `cfg.ownerQQ`，直接放行（管理员身份优先，不依赖数组）；
   - 其他私聊从 `allow.private` 滤掉 owner 后再判断：
     - 有其他人 → 只放行这些人；
     - 其他人为空 → 回落到 `allowAllWhenEmpty`（程序默认放行开关）。
2. UI `WhitelistCard`：
   - 单独显示“管理员私聊（自动放行）”一行；
   - 「私聊白名单 · 其他」编辑框不显示管理员；
   - 保存时仍把 owner 保留在 `allow.private` 里（兼容旧配置和自愈逻辑），但 owner 不参与“其他是否为空”的判断。
3. 移除管理员卡片里“管理员不在 allow.private 会被拦截”的旧警告。

## 影响面

- 管理员私聊始终放行，即使从“其他私聊”列表里删光；
- 其他私聊为空时：
  - `allowAllWhenEmpty=true` → 所有私聊放行；
  - `false` → 只有管理员私聊放行；
- 群白名单逻辑不变；
- `deny.private` / `deny.users` 仍优先。

## 验证

- UI 实测（192.0.2.10:3090）：
  - 显示「管理员私聊（自动放行）」；
  - 显示「管理员 100000000」；
  - 「私聊白名单 · 其他」输入框不再包含管理员，只剩 13 个其他 QQ；
  - 页面无 JS 错误。
- `node --check src/bridge.js`、`node --check plugins/surfcore/lib/client.js` 通过。
- 回归待跑 `npm run test:audit`。

## 回滚

- 回退本提交，或把 `allowed()` 恢复为原来的数组判断；
- 配置无需迁移：`allow.private` 仍保留 owner，旧版本可直接读取。
