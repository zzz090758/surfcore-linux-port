/**
 * QQ 社交资料扩展：个性签名 + QQ 空间说说。
 *
 * 只通过 SnowLuma 的 OneBot HTTP 扩展 action 动手：
 *   set_self_longnick / get_qzone_profile / set_qzone_profile /
 *   send_qzone_msg / get_qzone_msg_list / delete_qzone_msg / set_qzone_msg_right
 *
 * 安全边界：
 *   · 默认“仅自己可见”(64)，公开发布必须显式 ugc_right=1 且配置 allowPublic=true；
 *   · 每天默认最多 1 条说说；正文长度/图片数量/权限参数都校验；
 *   · 所有动作写 audit（不含 token），失败返回结构化 code/error/hint。
 */
import fs from 'node:fs';
import path from 'node:path';

const PRIVACY = new Set([1, 4, 16, 64, 128]);const DEFAULTS = {
  defaultPrivacy: 4,
  allowPublic: false,
  allowInteract: true,
  allowComment: true,
  allowLike: true,
  autoPost: true,
  autoPostMaxPerDay: 2,
  autoPostPollMinutes: 20,
  autoPostWindowStart: '12:00',
  autoPostWindowEnd: '23:00',
  autoPostChance: 0.25,
  autoPostMinGapMinutes: 120,
  autoMention: true,
  mentionGenerate: true,
  mentionPollMinutes: 10,
  mentionComment: '来啦～看到你 @ 我啦',
  maxPostsPerDay: 1,
  maxCommentsPerDay: 10,
  maxLikesPerDay: 20,
  maxChars: 1000,
  maxImages: 9,
};

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function fail(code, error, hint = '') {
  return { ok: false, code, error, hint };
}

let mentionTimer = null;
let autopostTimer = null;
export function dispose() {
  if (mentionTimer) clearInterval(mentionTimer);
  mentionTimer = null;
  if (autopostTimer) clearInterval(autopostTimer);
  autopostTimer = null;
}

export async function activate(api) {
  const cfg = () => ({ ...DEFAULTS, ...(api.config.get() || {}) });
  const auditFile = path.join(api.dataDir, 'qzone-audit.jsonl');
  const feedCache = new Map();
  const seenMentionFile = path.join(api.dataDir, 'mention-seen.json');
  let seenMentions = new Set();
  try {
    const rows = JSON.parse(fs.readFileSync(seenMentionFile, 'utf8'));
    if (Array.isArray(rows)) seenMentions = new Set(rows.map(String).slice(-500));
  } catch {}
  function saveSeenMentions() {
    try {
      fs.writeFileSync(seenMentionFile, JSON.stringify([...seenMentions].slice(-500)), { mode: 0o600 });
    } catch (error) { api.log(`保存 mention-seen 失败：${error?.message ?? error}`); }
  }
  let selfNickCache = '';
  let selfUinCache = 0;
  async function selfUin() {
    if (selfUinCache) return selfUinCache;
    try {
      const info = await onebot('get_login_info', {}, 10_000);
      selfUinCache = Number(info?.user_id) || 0;
      selfNickCache = String(info?.nickname || '');
    } catch { selfUinCache = 0; selfNickCache = ''; }
    return selfUinCache;
  }
  async function interactionAllowed(targetUin, kind = '') {
    const c = cfg();
    if (kind === 'comment' && c.allowComment === false) {
      return { ok: false, ...fail('COMMENT_DISABLED', '评论开关已关闭', '在扩展页打开「允许评论」') };
    }
    if (kind === 'like' && c.allowLike === false) {
      return { ok: false, ...fail('LIKE_DISABLED', '点赞开关已关闭', '在扩展页打开「允许点赞」') };
    }
    if (c.allowInteract === true) return { ok: true };
    const target = Number(targetUin) || 0;
    if (!target) return { ok: true }; // 省略 target_uin = 操作自己的说说
    const self = await selfUin();
    if (self && target === self) return { ok: true };
    return {
      ok: false,
      ...fail(
        'INTERACT_DISABLED',
        '默认不允许对别人的 QQ 空间动态点赞/评论/转发',
        '在扩展页打开「允许评论/点赞所有人的动态」；自己的说说不受限',
      ),
    };
  }

  function countToday(kind, predicate = () => true) {
    try {
      const lines = fs.readFileSync(auditFile, 'utf8').split('\n').filter(Boolean);
      const today = todayKey();
      return lines.map((line) => { try { return JSON.parse(line); } catch { return null; } })
        .filter((row) => row && row.kind === kind && String(row.at || '').slice(0, 10) === today && predicate(row)).length;
    } catch { return 0; }
  }

  async function scanMentions(act = false) {
    const c = cfg();
    const self = await selfUin();
    const nick = selfNickCache;
    const data = await onebot('get_qzone_feeds', { page_num: 1, count: 20 }, 45_000);
    const feeds = Array.isArray(data?.feeds) ? data.feeds : [];
    const matches = feeds.filter((f) => {
      if (!f || (self && Number(f.uin) === self)) return false;
      const text = `${f.content || ''}\n${f.html || ''}`;
      const plain = String(f.content || '');
      const needles = [];
      if (nick) needles.push(`@${nick}`);
      if (self) needles.push(`@${self}`);
      const atMentioned = needles.some((needle) => needle.length > 2 && text.includes(needle));
      const nameMentioned = (nick.length >= 2 && plain.includes(nick)) || (self && plain.includes(String(self)));
      return atMentioned || nameMentioned;
    });
    const results = [];
    for (const f of matches) {
      const tid = String(f.tid || f.key || '').trim();
      if (!tid || seenMentions.has(tid)) continue;
      const row = { tid, uin: f.uin, nickname: f.nickname, content: String(f.content || '').slice(0, 200), liked: false, commented: false };
      if (act) {
        const target = Number(f.uin) || 0;
        const allow = await interactionAllowed(target, 'like');
        if (allow.ok && c.allowLike !== false && !(c.maxLikesPerDay > 0 && countToday('like', (r) => r.enable !== false) >= c.maxLikesPerDay)) {
          try {
            await onebot('like_qzone', { tid, target_uin: target, abstime: Number(f.time) || 0 }, 30_000);
            logAudit({ kind: 'like', tid, enable: true, source: 'mention' });
            row.liked = true;
          } catch (error) { row.likeError = String(error?.message ?? error); }
        }
        const allowComment = await interactionAllowed(target, 'comment');
        if (allowComment.ok && c.allowComment !== false && !(c.maxCommentsPerDay > 0 && countToday('comment') >= c.maxCommentsPerDay)) {
          try {
            let comment = String(c.mentionComment || '来啦～看到你 @ 我啦').slice(0, 500);
            if (c.mentionGenerate !== false) {
              try {
                const generated = await api.bridge.call('/api/qzone/generate', {
                  method: 'POST',
                  body: { author: f.nickname, content: f.content },
                  timeoutMs: 120_000,
                });
                const text = generated?.ok && generated.data?.ok ? String(generated.data.text || '').trim() : '';
                if (text) comment = text.slice(0, 500);
              } catch (error) {
                row.generateError = String(error?.message ?? error);
              }
            }
            await onebot('comment_qzone', { tid, target_uin: target, content: comment }, 60_000);
            logAudit({ kind: 'comment', tid, chars: [...comment].length, images: 0, source: 'mention', generated: c.mentionGenerate !== false });
            row.commented = true;
            row.comment = comment;
          } catch (error) { row.commentError = String(error?.message ?? error); }
        }
      }
      if (act) {
        seenMentions.add(tid);
        saveSeenMentions();
      }
      results.push(row);
    }
    return { ok: true, scanned: feeds.length, matched: matches.length, acted: act, results };
  }
  const logAudit = (entry) => {
    try {
      fs.appendFileSync(auditFile, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, { mode: 0o600 });
    } catch (error) {
      api.log(`写 audit 失败：${error?.message ?? error}`);
    }
  };

  function snowLuma() {
    const qq = api.qq.readConfig() || {};
    const raw = String(qq.snowluma?.httpUrl || 'http://127.0.0.1:3000').replace(/\/+$/, '');
    const httpUrl = raw.replace('://0.0.0.0:', '://127.0.0.1:');
    return { httpUrl, token: String(qq.snowluma?.accessToken || '') };
  }

  async function onebot(action, params = {}, timeoutMs = 30_000) {
    const { httpUrl, token } = snowLuma();
    let res;
    try {
      res = await fetch(`${httpUrl}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw Object.assign(new Error(`连不上 SnowLuma（${httpUrl}）：${error?.message ?? error}`), { code: 'SNOWLUMA_UNAVAILABLE' });
    }
    let body = null;
    try { body = await res.json(); } catch {}
    if (!res.ok) {
      throw Object.assign(new Error(`SnowLuma HTTP ${res.status}`), { code: 'SNOWLUMA_HTTP', status: res.status, data: body });
    }
    if (!body || body.status !== 'ok' || body.retcode !== 0) {
      throw Object.assign(new Error(`OneBot ${action} 失败：${body?.wording || body?.message || `retcode=${body?.retcode}`}`), {
        code: 'ONEBOT_FAILED', retcode: body?.retcode, data: body,
      });
    }
    return body.data;
  }

  function postCountToday() {
    try {
      const lines = fs.readFileSync(auditFile, 'utf8').split('\n').filter(Boolean);
      const today = todayKey();
      return lines.map((line) => { try { return JSON.parse(line); } catch { return null; } })
        .filter((row) => row && row.kind === 'post' && String(row.at || '').slice(0, 10) === today).length;
    } catch { return 0; }
  }

  function lastPostAtToday() {
    try {
      const lines = fs.readFileSync(auditFile, 'utf8').split('\n').filter(Boolean);
      const today = todayKey();
      let last = 0;
      for (const line of lines) {
        try {
          const row = JSON.parse(line);
          if (row?.kind !== 'post' || String(row.at || '').slice(0, 10) !== today) continue;
          const t = Date.parse(row.at);
          if (Number.isFinite(t) && t > last) last = t;
        } catch {}
      }
      return last;
    } catch { return 0; }
  }

  function parseHm(value, fallback) {
    const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? '').trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
  }

  function autoPostTarget(c) {
    const maxPosts = Number(c.maxPostsPerDay) > 0 ? Number(c.maxPostsPerDay) : 99;
    const cap = Math.max(1, Math.min(Number(c.autoPostMaxPerDay) || 2, maxPosts));
    let seed = 0;
    for (const ch of todayKey()) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    return 1 + (seed % cap);
  }

  const ACTIONS = {
    set_signature: {
      description: '设置 QQ 个性签名（最长 200 字，空字符串清空）。注意：若 QQ 开启了“签名同步到空间”，QQ 会自动生成一条公开说说，本工具无法关闭该同步。',
      args: { long_nick: '签名文本，严格 string' },
      run: async ({ long_nick }) => {
        if (long_nick === undefined || long_nick === null) return fail('INVALID_SIGNATURE', '缺少 long_nick', '传 long_nick="..."；空字符串表示清空签名');
        const text = String(long_nick).trim();
        if ([...text].length > 200) return fail('SIGNATURE_TOO_LONG', '签名最多 200 字', '拆短或换一句');
        await onebot('set_self_longnick', { long_nick: text });
        logAudit({ kind: 'signature', chars: [...text].length });
        return { ok: true, data: { long_nick: text } };
      },
    },
    qzone_profile_get: {
      description: '读取当前 QQ 空间的名称和说明（只读）。',
      args: {},
      run: async () => ({ ok: true, data: await onebot('get_qzone_profile') }),
    },
    qzone_profile_set: {
      description: '修改 QQ 空间名称/空间说明（至少一个字段）。',
      args: { name: '空间名称', description: '空间说明' },
      run: async ({ name, description }) => {
        const params = {};
        if (name !== undefined) params.name = String(name).slice(0, 40);
        if (description !== undefined) params.description = String(description).slice(0, 200);
        if (!Object.keys(params).length) return fail('NO_FIELDS', '至少提供 name 或 description', '例如 {"description":"记录日常"}');
        await onebot('set_qzone_profile', params);
        logAudit({ kind: 'profile', fields: Object.keys(params) });
        return { ok: true, data: params };
      },
    },
    qzone_post: {
      description: '发表 QQ 空间说说（文字，可选图片）。默认好友可见；公开发布需配置 allowPublic=true。开启 autoPost 时，你可以在自己想发的时候直接发，不需要问主人。',
      args: {
        content: '说说正文',
        images: '图片数组（可选），支持 file:// http:// base64://',
        ugc_right: '可见范围：1公开 4好友 16部分可见 64仅自己 128部分不可见',
        target_uins: '可见/不可见名单 QQ 号数组，16/128 必填',
      },
      run: async ({ content, images, ugc_right, target_uins }) => {
        const c = cfg();
        const text = String(content ?? '').trim();
        if (!text) return fail('EMPTY_CONTENT', '说说正文不能为空', '传 content="..."');
        if ([...text].length > c.maxChars) return fail('CONTENT_TOO_LONG', `正文最多 ${c.maxChars} 字`, '拆短或改 maxChars');
        const imgs = Array.isArray(images) ? images.map(String).filter(Boolean) : [];
        if (imgs.length > c.maxImages) return fail('TOO_MANY_IMAGES', `最多 ${c.maxImages} 张图`, '减少图片数量');
        const right = clampInt(ugc_right, c.defaultPrivacy, 1, 128);
        if (!PRIVACY.has(right)) return fail('INVALID_PRIVACY', 'ugc_right 只能是 1/4/16/64/128', '用默认 64 或 4');
        if (right === 1 && c.allowPublic !== true) return fail('PUBLIC_NOT_ALLOWED', '公开发布被配置禁止', '先在扩展配置里设 allowPublic=true，或改用 4/64');
        const targets = Array.isArray(target_uins) ? target_uins.map(Number).filter(Number.isFinite) : [];
        if ((right === 16 || right === 128) && !targets.length) return fail('TARGET_REQUIRED', '16/128 必须提供 target_uins', '传入名单 QQ 号');
        if (c.maxPostsPerDay > 0 && postCountToday() >= c.maxPostsPerDay) {
          return fail('DAILY_LIMIT', `今天已发 ${postCountToday()} 条，上限 ${c.maxPostsPerDay}`, '明天再发或调高「每天最多发说说」');
        }
        const params = { content: text, ugc_right: right };
        if (imgs.length) params.images = imgs;
        if (targets.length) params.target_uins = targets;
        const data = await onebot('send_qzone_msg', params, 90_000);
        logAudit({ kind: 'post', tid: data?.tid, privacy: right, images: imgs.length, chars: [...text].length, preview: text.slice(0, 60) });
        return { ok: true, data };
      },
    },
    qzone_list: {
      description: '读取自己的 QQ 空间说说列表（只读）。',
      args: { pos: '起始偏移', num: '本页数量 1-20' },
      run: async ({ pos, num }) => {
        const params = { pos: clampInt(pos, 0, 0, 1000), num: clampInt(num, 10, 1, 20) };
        try {
          return { ok: true, data: await onebot('get_qzone_msg_list', params) };
        } catch (error) {
          // 空间一条说说都没有时，SnowLuma 会返回 msglist:null 并让解析层报“结构异常”；
          // 对调用方来说这是空列表，不是失败。
          if (error?.data && error.data.msglist === null && Number(error.data.code ?? 0) === 0) {
            return { ok: true, data: { total: 0, msglist: [] } };
          }
          if (String(error?.message || '').includes('"msglist":null')) {
            return { ok: true, data: { total: 0, msglist: [] } };
          }
          throw error;
        }
      },
    },
    qzone_feeds: {
      description: '读取 QQ 空间好友动态流（只读，支持页码/游标分页）。',
      args: { page_num: '页码，1 起', count: '本页数量 1-20', cursor: '上一页返回的 next_cursor' },
      run: async ({ page_num, count, cursor }) => {
        const params = {
          page_num: clampInt(page_num, 1, 1, 100),
          count: clampInt(count, 10, 1, 20),
        };
        if (cursor) params.cursor = String(cursor).slice(0, 65536);
        const data = await onebot('get_qzone_feeds', params, 45_000);
        const rawFeeds = Array.isArray(data?.feeds) ? data.feeds : [];
        for (const f of rawFeeds) {
          const id = String(f?.tid || f?.key || '').trim();
          if (id) feedCache.set(id, f);
        }
        // html 字段很大（含整页 DOM），对模型无用；压成正文/图片/计数，省 token。
        const feeds = rawFeeds.map((f) => ({
          uin: f.uin,
          nickname: f.nickname,
          time: f.time,
          appid: f.appid,
          tid: f.tid || f.key || '',
          content: String(f.content || '').slice(0, 1000),
          content_complete: f.content_complete !== false,
          images: Array.isArray(f.images) ? f.images.slice(0, 9) : [],
          like_count: f.like_count ?? null,
          comment_count: f.comment_count ?? null,
        }));
        return { ok: true, data: { ...data, feeds } };
      },
    },
    qzone_detail: {
      description: '读取一条说说的详情与评论（只读）。',
      args: { tid: '说说 tid', target_uin: '说说所属 QQ 号（可选）', pos: '评论起始偏移', num: '评论数量' },
      run: async ({ tid, target_uin, pos, num }) => {
        const id = String(tid ?? '').trim();
        if (!id) return fail('INVALID_TID', '缺少 tid', '先用 qzone_list / qzone_feeds 查 tid');
        const params = { tid: id, pos: clampInt(pos, 0, 0, 1000), num: clampInt(num, 10, 1, 50) };
        if (target_uin !== undefined && target_uin !== '') params.target_uin = Number(target_uin);
        return { ok: true, data: await onebot('get_qzone_msg_detail', params, 45_000) };
      },
    },
    qzone_like: {
      description: '给一条说说点赞或取消赞（需要该说说的访问权限）。',
      args: { tid: '说说 tid', target_uin: '说说所属 QQ 号（可选）', abstime: '说说发表时间 unix 秒（可选）', enable: 'true 点赞 / false 取消' },
      run: async ({ tid, target_uin, abstime, enable }) => {
        const id = String(tid ?? '').trim();
        if (!id) return fail('INVALID_TID', '缺少 tid', '先用 qzone_feeds 查 tid');
        const c = cfg();
        const liked = enable !== false;
        if (liked && c.maxLikesPerDay > 0 && countToday('like', (r) => r.enable !== false) >= c.maxLikesPerDay) {
          return fail('DAILY_LIMIT', `今天已点赞 ${countToday('like', (r) => r.enable !== false)} 次，上限 ${c.maxLikesPerDay}`, '明天再点或调高「每天最多点赞」');
        }
        const allowed = await interactionAllowed(target_uin, 'like');
        if (!allowed.ok) return allowed;
        const params = { tid: id };
        if (target_uin !== undefined && target_uin !== '') params.target_uin = Number(target_uin);
        if (abstime !== undefined && abstime !== '') params.abstime = clampInt(abstime, 0, 0, 4_000_000_000);
        const action = liked ? 'like_qzone' : 'unlike_qzone';
        await onebot(action, params, 30_000);
        logAudit({ kind: 'like', tid: id, enable: liked });
        return { ok: true, data: { tid: id, liked } };
      },
    },
    qzone_comment: {
      description: '评论一条说说（支持文字/图片；楼中楼暂只支持一级评论）。',
      args: {
        tid: '说说 tid', content: '评论正文', target_uin: '说说所属 QQ 号（可选）',
        images: '图片数组（可选）', comment_id: '要回复的一级评论 ID（可选）',
        comment_uin: '一级评论作者 QQ 号（可选）',
      },
      run: async ({ tid, content, target_uin, images, comment_id, comment_uin }) => {
        const id = String(tid ?? '').trim();
        const text = String(content ?? '').trim();
        if (!id) return fail('INVALID_TID', '缺少 tid', '先用 qzone_feeds 查 tid');
        if (!text) return fail('EMPTY_COMMENT', '评论不能为空', '传 content="..."');
        if ([...text].length > 500) return fail('COMMENT_TOO_LONG', '评论最多 500 字', '拆短一点');
        if (comment_id !== undefined && comment_id !== '' && (comment_uin === undefined || comment_uin === '')) {
          return fail('COMMENT_UIN_REQUIRED', '回复一级评论时必须同时提供 comment_uin', '从 qzone_detail 的评论里取 uin');
        }
        const c = cfg();
        if (c.maxCommentsPerDay > 0 && countToday('comment') >= c.maxCommentsPerDay) {
          return fail('DAILY_LIMIT', `今天已评论 ${countToday('comment')} 条，上限 ${c.maxCommentsPerDay}`, '明天再评或调高「每天最多评论」');
        }
        const allowed = await interactionAllowed(target_uin, 'comment');
        if (!allowed.ok) return allowed;
        const params = { tid: id, content: text };
        if (target_uin !== undefined && target_uin !== '') params.target_uin = Number(target_uin);
        if (comment_id !== undefined && comment_id !== '') params.comment_id = String(comment_id);
        if (comment_uin !== undefined && comment_uin !== '') params.comment_uin = Number(comment_uin);
        const imgs = Array.isArray(images) ? images.map(String).filter(Boolean) : [];
        if (imgs.length) {
          if (comment_id !== undefined && comment_id !== '') return fail('IMAGE_REPLY_UNSUPPORTED', '楼中楼回复不支持图片', '去掉 images');
          params.images = imgs.slice(0, cfg().maxImages);
        }
        const data = await onebot('comment_qzone', params, 90_000);
        logAudit({ kind: 'comment', tid: id, chars: [...text].length, images: imgs.length });
        return { ok: true, data };
      },
    },
    qzone_forward: {
      description: '转发一条已读取过的推荐/好友动态到自己的空间（先调用 qzone_feeds 缓存原始 feed）。',
      args: { tid: '说说 tid（来自 qzone_feeds）', reason: '转发附言（可选）' },
      run: async ({ tid, reason }) => {
        const id = String(tid ?? '').trim();
        const feed = feedCache.get(id);
        if (!feed) return fail('FEED_NOT_CACHED', '这条动态的原始 feed 不在缓存里', '先调用 qzone_feeds（最近一次列表）再转发');
        const allowed = await interactionAllowed(feed.uin, 'forward');
        if (!allowed.ok) return allowed;
        const data = await onebot('forward_qzone_public_feed', { feed, reason: String(reason ?? '').slice(0, 200) }, 60_000);
        logAudit({ kind: 'forward', tid: id });
        return { ok: true, data };
      },
    },
    qzone_capabilities: {
      description: '读取 SnowLuma 对当前账号开放的 QQ 空间能力（只读，用于确认点赞/评论/转发/背景是否可用）。',
      args: {},
      run: async () => ({ ok: true, data: await onebot('get_qzone_public_capabilities', {}, 20_000) }),
    },
    qzone_mention_scan: {
      description: '扫描好友动态里 @ 或提到我的内容（只读，不点赞不评论；自动轮询会另开）。',
      args: {},
      run: async () => ({ ok: true, data: await scanMentions(false) }),
    },
    qzone_delete: {
      description: '删除自己的一条 QQ 空间说说（按 tid）。',
      args: { tid: '说说 tid（来自 qzone_list / qzone_post）' },
      run: async ({ tid }) => {
        const id = String(tid ?? '').trim();
        if (!id) return fail('INVALID_TID', '缺少 tid', '先用 qzone_list 查 tid');
        await onebot('delete_qzone_msg', { tid: id });
        logAudit({ kind: 'delete', tid: id });
        return { ok: true, data: { tid: id } };
      },
    },
    qzone_set_right: {
      description: '修改一条说说的可见范围。',
      args: { tid: '说说 tid', ugc_right: '1/4/16/64/128', target_uins: '16/128 名单' },
      run: async ({ tid, ugc_right, target_uins }) => {
        const id = String(tid ?? '').trim();
        const right = clampInt(ugc_right, 64, 1, 128);
        if (!id) return fail('INVALID_TID', '缺少 tid', '先用 qzone_list 查 tid');
        if (!PRIVACY.has(right)) return fail('INVALID_PRIVACY', 'ugc_right 只能是 1/4/16/64/128', '用 64 或 4');
        const targets = Array.isArray(target_uins) ? target_uins.map(Number).filter(Number.isFinite) : [];
        if ((right === 16 || right === 128) && !targets.length) return fail('TARGET_REQUIRED', '16/128 必须提供 target_uins', '传入名单 QQ 号');
        const params = { tid: id, ugc_right: right };
        if (targets.length) params.target_uins = targets;
        const data = await onebot('set_qzone_msg_right', params);
        logAudit({ kind: 'set-right', tid: id, privacy: right });
        return { ok: true, data };
      },
    },
  };

  const actionList = () => Object.entries(ACTIONS).map(([name, def]) => ({
    name, description: def.description, args: def.args,
  }));
  const toggles = () => [
    {
      key: 'autoPost',
      label: '想发就发（不用问主人）',
      description: '开启后角色可以自己想发就发，并有独立随机调度在窗口内低频自动发（不依赖你每次来问）；关闭则不自动发，也不主动鼓励。',
      default: true,
    },
    {
      key: 'autoMention',
      label: '有人 @ / 提到我时自动点赞评论',
      description: '每 N 分钟扫一次好友动态；发现 @ 或写到我昵称/QQ 号，自动点赞并按模板评论。受评论/点赞日限约束。',
      default: true,
    },
    {
      key: 'mentionGenerate',
      label: '评论用模型生成（计入其他花费）',
      description: '开启后 @我 的自动评论由独立 DSH 会话生成；token 计入 qzone 渠道/其他花费。关闭则用下面的固定模板。',
      default: true,
    },
    {
      key: 'allowInteract',
      label: '允许评论/点赞所有人的动态',
      description: '总开关；关闭时只允许操作自己的说说。',
      default: true,
    },
    {
      key: 'allowComment',
      label: '允许评论',
      description: '关闭后 qzone_comment 一律拒绝，自己的说说也不评。',
      default: true,
    },
    {
      key: 'allowLike',
      label: '允许点赞',
      description: '关闭后 qzone_like 一律拒绝。',
      default: true,
    },
    {
      key: 'allowPublic',
      label: '允许公开发布',
      description: '开启后 qzone_post 才允许 ugc_right=1（所有人可见）；关闭时最多好友可见。',
      default: false,
    },
  ];
  const numbers = () => [
    { key: 'maxPostsPerDay', label: '每天最多发说说', min: 0, max: 20, default: 1, hint: '0 = 不限制' },
    { key: 'autoPostMaxPerDay', label: '自动发动态每天最多', min: 1, max: 5, default: 2, hint: '随机目标不超过此值；仍受“每天最多发说说”约束' },
    { key: 'autoPostPollMinutes', label: '自动发动态检查间隔（分钟）', min: 5, max: 120, default: 20, hint: '窗口内低频检查，按概率决定' },
    { key: 'maxCommentsPerDay', label: '每天最多评论', min: 0, max: 100, default: 10, hint: '0 = 不限制' },
    { key: 'maxLikesPerDay', label: '每天最多点赞', min: 0, max: 200, default: 20, hint: '0 = 不限制' },
    { key: 'mentionPollMinutes', label: '@我扫描间隔（分钟）', min: 1, max: 120, default: 10, hint: '' },
    { key: 'maxChars', label: '说说最多字数', min: 50, max: 2000, default: 1000, hint: '' },
    { key: 'maxImages', label: '说说最多图片', min: 0, max: 9, default: 9, hint: '' },
  ];
  const texts = () => [
    { key: 'mentionComment', label: '@我时自动评论的内容', default: '来啦～看到你 @ 我啦', max: 500 },
    { key: 'autoPostWindowStart', label: '自动发动态窗口开始（HH:MM）', default: '12:00', max: 5 },
    { key: 'autoPostWindowEnd', label: '自动发动态窗口结束（HH:MM）', default: '23:00', max: 5 },
  ];

  api.registerRoute('GET', '/actions', async (req, res) => {
    json(res, 200, { ok: true, extension: 'qq-social', actions: actionList(), toggles: toggles(), numbers: numbers(), texts: texts(), config: cfg() });
  });

  api.registerRoute('GET', '/status', async (req, res) => {
    const c = cfg();
    const sl = snowLuma();
    let profile = null;
    let profileError = '';
    try { profile = await onebot('get_qzone_profile', {}, 10_000); }
    catch (error) { profileError = String(error?.message ?? error); }
    json(res, 200, {
      ok: true,
      extension: 'qq-social',
      snowluma: { httpUrl: sl.httpUrl, hasToken: Boolean(sl.token) },
      config: c,
      todayPosts: postCountToday(),
      profile,
      profileError,
    });
  });

  api.registerRoute('POST', '/action', async (req, res) => {
    const bodyText = await readBody(req).catch(() => Buffer.alloc(0));
    let body = {};
    try { body = JSON.parse(bodyText.toString('utf8') || '{}'); } catch {}
    const action = String(body.action ?? '').trim();
    const def = ACTIONS[action];
    if (!def) {
      json(res, 400, fail('UNKNOWN_ACTION', `未知动作：${action || '(空)'}`, `可用：${Object.keys(ACTIONS).join(', ')}`));
      return;
    }
    try {
      const result = await def.run(body.args && typeof body.args === 'object' ? body.args : {});
      json(res, result.ok ? 200 : 400, result);
    } catch (error) {
      const code = error?.code || 'ACTION_FAILED';
      api.log(`动作 ${action} 失败：${error?.message ?? error}`);
      json(res, 502, fail(code, String(error?.message ?? error), '检查 SnowLuma 是否在线、账号是否登录，以及权限/风控提示'));
    }
  });

  let lastMentionPoll = 0;
  async function mentionTick() {
    if (cfg().autoMention === false) return;
    const minutes = Math.max(1, Number(cfg().mentionPollMinutes) || 10);
    if (Date.now() - lastMentionPoll < minutes * 60_000) return;
    lastMentionPoll = Date.now();
    try {
      const result = await scanMentions(true);
      if (result.results.length) api.log(`@我扫描：命中 ${result.results.length} 条（点赞 ${result.results.filter((x) => x.liked).length} / 评论 ${result.results.filter((x) => x.commented).length}）`);
    } catch (error) {
      api.log(`@我扫描失败：${error?.message ?? error}`);
    }
  }
  if (mentionTimer) clearInterval(mentionTimer);
  mentionTimer = setInterval(() => { void mentionTick(); }, 60_000);
  mentionTimer.unref?.();
  setTimeout(() => { void mentionTick(); }, 15_000).unref?.();

  // ── 自动发说说：独立随机调度，不依赖 QQ 消息唤醒 ─────────────────────
  // 和目标机制类似：窗口内低频检查，按概率决定这一次要不要发；
  // 不跟每次唤醒绑定，也不为了“发满”而连续发。
  let lastAutoPostCheck = 0;
  let autoPostBusy = false;
  async function autoPostTick() {
    const c = cfg();
    if (c.autoPost === false || autoPostBusy) return;
    const pollMinutes = Math.max(5, Number(c.autoPostPollMinutes) || 20);
    if (Date.now() - lastAutoPostCheck < pollMinutes * 60_000) return;
    lastAutoPostCheck = Date.now();
    const d = new Date();
    const nowMin = d.getHours() * 60 + d.getMinutes();
    const start = parseHm(c.autoPostWindowStart, 12 * 60);
    const end = parseHm(c.autoPostWindowEnd, 23 * 60);
    const inWindow = end >= start ? (nowMin >= start && nowMin < end) : (nowMin >= start || nowMin < end);
    if (!inWindow) return;
    if (Number(c.maxPostsPerDay) > 0 && postCountToday() >= Number(c.maxPostsPerDay)) return;
    const target = autoPostTarget(c);
    if (postCountToday() >= target) return;
    const last = lastPostAtToday();
    const gapMs = Math.max(0, Number(c.autoPostMinGapMinutes) || 120) * 60_000;
    if (last && Date.now() - last < gapMs) return;
    const chance = Math.min(1, Math.max(0, Number(c.autoPostChance) || 0.25));
    if (Math.random() >= chance) return;
    autoPostBusy = true;
    try {
      const generated = await api.bridge.call('/api/qzone/generate', {
        method: 'POST',
        body: { mode: 'post' },
        timeoutMs: 120_000,
      });
      const text = String(generated?.data?.text ?? '').trim().slice(0, Math.max(1, Number(c.maxChars) || 100));
      if (!text) throw new Error('模型没有返回说说正文');
      let right = Number(c.defaultPrivacy) || 4;
      if (right === 1 && c.allowPublic !== true) right = 4;
      const data = await onebot('send_qzone_msg', { content: text, ugc_right: right }, 90_000);
      logAudit({
        kind: 'post', tid: data?.tid, privacy: right, images: 0,
        chars: [...text].length, preview: text.slice(0, 60), source: 'auto-schedule',
      });
      api.log(`自动发说说：${text.slice(0, 40)}`);
    } catch (error) {
      api.log(`自动发说说失败（下次再试）：${error?.message ?? error}`);
    } finally {
      autoPostBusy = false;
    }
  }
  if (autopostTimer) clearInterval(autopostTimer);
  autopostTimer = setInterval(() => { void autoPostTick(); }, 60_000);
  autopostTimer.unref?.();
  setTimeout(() => { void autoPostTick(); }, 30_000).unref?.();

  api.log(`QQ 社交资料扩展已激活（默认隐私 ${cfg().defaultPrivacy}，每日上限 ${cfg().maxPostsPerDay}）`);
}
