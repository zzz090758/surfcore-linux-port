# qq-social — QQ 社交资料扩展

让角色像正常人一样管理自己的 QQ 资料：

- 设置 **个性签名**（`set_self_longnick`）；
- 发 **QQ 空间说说**（纯文字 / 文字+图片，支持可见范围）；
- 读取/删除自己的说说、修改可见范围；
- 读取/修改空间名称与说明。

默认 **关闭**。到 SurfCore 设置 → 扩展 → 启用 `qq-social`，再在「配置 JSON」里调整隐私和频率。

## 动作

| action | 说明 |
|---|---|
| `set_signature` | 设置个性签名；空字符串清空 |
| `qzone_post` | 发说说：`content`、`images`（可选）、`ugc_right`、`target_uins` |
| `qzone_list` | 读自己的说说列表 |
| `qzone_feeds` | 读 QQ 空间好友动态流（只读，分页；会缓存原始 feed 供转发） |
| `qzone_detail` | 读一条说说的详情与评论 |
| `qzone_like` | 给说说点赞 / 取消赞 |
| `qzone_comment` | 评论说说（支持图片；楼中楼仅一级回复） |
| `qzone_forward` | 尝试转发已缓存的推荐/好友动态 |
| `qzone_capabilities` | 读当前账号的 QQ 空间能力开关 |
| `qzone_delete` | 删除一条说说（`tid`） |
| `qzone_set_right` | 修改说说可见范围 |
| `qzone_profile_get` / `qzone_profile_set` | 读/改空间名称、空间说明 |

模型通过 MCP 工具调用：

1. `surfcore_ext_list` 查扩展动作；
2. `surfcore_ext_call({ extension: "qq-social", action: "qzone_post", args: { ... } })`。

## 配置

```json
{
  "defaultPrivacy": 4,
  "allowPublic": false,
  "allowInteract": true,
  "allowComment": true,
  "allowLike": true,
  "autoPost": true,
  "autoPostMaxPerDay": 2,
  "autoPostPollMinutes": 20,
  "autoPostWindowStart": "12:00",
  "autoPostWindowEnd": "23:00",
  "autoPostChance": 0.25,
  "autoPostMinGapMinutes": 120,
  "autoMention": true,
  "mentionGenerate": true,
  "mentionPollMinutes": 10,
  "mentionComment": "来啦～看到你 @ 我啦",
  "maxPostsPerDay": 1,
  "maxCommentsPerDay": 10,
  "maxLikesPerDay": 20,
  "maxChars": 1000,
  "maxImages": 9
}
```

- `defaultPrivacy`：1 公开 / 4 好友 / 16 部分可见 / 64 仅自己 / 128 部分不可见；默认 4（好友可见）；
- `allowPublic`：`true` 才允许 `ugc_right=1`；
- `allowInteract`：总开关；关闭时只允许操作自己的说说；
- `allowComment` / `allowLike`：分别控制评论、点赞；关闭后对应动作一律拒绝；
- `autoPost`：`true` 时角色可以自己想发就发，并且扩展会跑独立随机调度：在窗口内低频检查，按概率决定这一次发不发；
- `autoPostMaxPerDay`：随机目标上限（默认 2）；实际目标每天在 1~该值间随机，且不超过 `maxPostsPerDay`；
- `autoPostPollMinutes`：自动发动态检查间隔（默认 20 分钟），不是每次检查都发；
- `autoPostWindowStart` / `autoPostWindowEnd`：自动发动态时间窗，默认 `12:00–23:00`；
- `autoPostChance`：每次检查触发概率，默认 `0.25`；
- `autoPostMinGapMinutes`：两条自动说说最小间隔，默认 120 分钟；
- `autoMention`：每 N 分钟扫一次好友动态，发现 `@昵称`、`@QQ号` 或正文里直接提到昵称/QQ 号，就自动点赞并按 `mentionComment` 评论；同一 tid 只处理一次；
- `mentionGenerate`：评论由独立 DSH 会话现场生成（不是固定模板）；该会话的 token 记为 `qzone` 渠道，日汇总计入「其他花费」；
- `mentionPollMinutes`：扫描间隔（分钟），默认 10；
- `mentionComment`：`mentionGenerate=false` 时使用的固定兜底评论；生成失败也会退回它；
- `maxPostsPerDay`：每天最多几条说说（0 = 不限制，默认 1）；
- `maxCommentsPerDay` / `maxLikesPerDay`：每天最多评论/点赞次数（0 = 不限制，默认 10 / 20）；
- `maxChars` / `maxImages`：正文长度、图片数量上限。

扩展页会把以上开关、数量限制和时间窗直接渲染成 checkbox / number input / 文本框，保存即生效。
`@我` 扫描只看好友动态正文（`get_qzone_feeds`）里的 `@昵称`、`@QQ号` 或昵称/QQ 号；没有接 Qzone 消息中心的“@我”通知接口。命中过的 tid 记在 `mention-seen.json`，不会重复点赞/评论。

## 隐私与风险

- 设置个性签名时，如果 QQ 账号开启了「个性签名同步到空间」，QQ 会自动生成一条 **公开说说**；本扩展无法关闭该同步，建议先在 QQ 空间设置里关闭，或接受它。
- 说说默认 **好友可见**；公开发布必须显式打开 `allowPublic`，防止模型随口公开。
- 自动发布可能触发 QQ 风控；保持低频（默认 1 条/天），不要刷。
- `allowInteract=true` 时模型可以对**所有人的动态**点赞/评论；这是真实社交动作，没有二次确认，介意就关掉。
- `autoPost=true` 是“允许/鼓励主动发”，不是定时器：她在一个会话里想发时直接调用；不会凭空每隔 N 分钟自动发。
- 扩展只调用 SnowLuma 的 OneBot 扩展 action，不直接保存 QQ 密码/token；token 从 QQ `config.json` 的 `snowluma` 读取。
- `qzone_like` / `qzone_comment` 会对**别人的动态**产生真实互动；默认 `allowInteract=false`，只允许操作自己的说说，要操作别人必须显式打开。

## 已验证 / 未验证

已验证（本机）：

- `qzone_post` 私有文字 + 图片；
- `qzone_feeds` 读取好友动态；
- `qzone_like` / `qzone_unlike` 在自己的测试说说上成功；
- `qzone_comment` + `qzone_detail` 成功，评论随后随测试说说一起删除；
- `@我` 自动扫描命中 2 条并自动点赞/评论；
- 自动评论改由独立 DSH 会话生成，实测输出如「拖了三天还是今天收掉了，能松这口气就值…」；token 计入 `qzone:comment`，插件日汇总的 `other` 从 0 变为 ¥0.021 / 76917 tokens。

未打通：

- `qzone_forward`：SnowLuma 要求“推荐列表或详情返回的完整动态”，好友动态缺少 `cell_common.union_id`，当前账号的公开推荐流也是空的；调用会返回 `ONEBOT_FAILED`，没有实际转发。
- 空间背景/皮肤：SnowLuma 没有对应 action，只有 `set_qzone_profile`（空间名称/说明），无法直接改背景；需要 Qzone Web 私有接口，风险高。
- 可视化浏览 QQ 空间网页：没有做登录态代理；当前只能通过 `qzone_feeds`/`qzone_detail` 读结构化数据。

## 不停机更新

- 扩展代码在插件宿主里 `import()` 热加载：改完点「重载」即可，不需要重启 DSH / 桥接；
- MCP 只暴露两个通用工具 `surfcore_ext_list` / `surfcore_ext_call`；以后给扩展加动作，只要重载扩展，**不用再加 MCP 工具或重启 DSH**。
