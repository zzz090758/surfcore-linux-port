// SurfCore 独立 Web：账号/密码登录 + 只反代 /dsh-surfcore/api/*。
//
// 设计边界：
//   · 浏览器只和本服务说话；DSH 的 URL token / 会话 Cookie 永远不下发给浏览器。
//   · 上游固定 127.0.0.1:3080，Host 改写成回环，绕过插件的「只接受本机回环」闸门。
//   · 只允许 /dsh-surfcore/api/ 前缀，不暴露 DSH 的其它 API。
//   · 密码用 scrypt 存哈希；会话是 HMAC 签名的时间戳，不落库。
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { discoverDshSessionCookie } from '../src/dsh-client.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, 'public');
const CLIENT_JS = path.resolve(HERE, '..', 'plugins', 'surfcore', 'lib', 'client.js');
const DSH_BASE = process.env.DSH_BASE || 'http://127.0.0.1:3080';
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3090);
const TTL_MS = 12 * 60 * 60 * 1000;
const PASSWORD_FILE = process.env.SURFCORE_WEB_PASSWORD_FILE
  || path.join(os.homedir(), '.dsh', 'surfcore', 'web-password.json');
const SECRET_FILE = process.env.SURFCORE_WEB_SECRET_FILE
  || path.join(os.homedir(), '.dsh', 'surfcore', 'web-secret');

const COOKIE = 'surfcore_web';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function ensureSecret() {
  try {
    const text = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (text.length >= 32) return text;
  } catch {}
  const secret = crypto.randomBytes(32).toString('base64');
  fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
  fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
  return secret;
}
const SECRET = ensureSecret();

function loadPasswordRecord() {
  try {
    const record = JSON.parse(fs.readFileSync(PASSWORD_FILE, 'utf8'));
    if (record?.salt && record?.hash) return record;
  } catch {}
  return null;
}

function verifyPassword(password, record) {
  if (!record) return false;
  const expected = Buffer.from(record.hash, 'base64');
  const actual = crypto.scryptSync(String(password), Buffer.from(record.salt, 'base64'), expected.length || 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function verifyLogin(username, password, record) {
  const expectedUser = String(record?.username || 'admin');
  return String(username) === expectedUser && verifyPassword(password, record);
}

function sign(exp) {
  return crypto.createHmac('sha256', SECRET).update(String(exp)).digest('base64url');
}
function issueSession() {
  const exp = Date.now() + TTL_MS;
  return `${exp}.${sign(exp)}`;
}
function validSession(value) {
  const text = String(value || '');
  const dot = text.indexOf('.');
  if (dot <= 0) return false;
  const exp = Number(text.slice(0, dot));
  const sig = text.slice(dot + 1);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = sign(exp);
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

const loginHits = new Map();
function loginAllowed(ip) {
  const now = Date.now();
  const row = loginHits.get(ip) || { count: 0, reset: now + 10 * 60_000 };
  if (now > row.reset) { row.count = 0; row.reset = now + 10 * 60_000; }
  row.count += 1;
  loginHits.set(ip, row);
  return row.count <= 10;
}

function html(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    ...extraHeaders,
  });
  res.end(body);
}

function json(res, status, obj, extraHeaders = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders });
  res.end(JSON.stringify(obj));
}

function loginPage(error = '') {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>登录 · SurfCore</title><link rel="stylesheet" href="/style.css">
<style>
  body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0f1115}
  .login{width:min(360px,92vw);background:#171a1f;border:1px solid #2b2f36;border-radius:14px;padding:22px}
  h1{font-size:18px;margin:0 0 6px}p{color:#9aa0a6;font-size:12px;margin:0 0 16px}
  input{width:100%;padding:10px 12px;margin-top:8px;border-radius:8px;border:1px solid #3a3f47;background:#0f1115;color:#e8eaed;font-size:14px}
  button{margin-top:12px;width:100%;padding:10px 12px;border:0;border-radius:8px;background:#4f8cff;color:#fff;font-size:14px;cursor:pointer}
  .err{margin-top:10px;color:#e5484d;font-size:12px;min-height:16px}
</style></head><body>
<form class="login" method="post" action="/login">
  <h1>SurfCore</h1>
  <p>独立设置页 · 请使用账户密码登录</p>
  <input type="text" name="username" placeholder="账户" value="admin" autocomplete="username">
  <input type="password" name="password" placeholder="密码" autocomplete="current-password" autofocus>
  <button type="submit">登录</button>
  <div class="err">${error ? String(error).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])) : ''}</div>
</form></body></html>`;
}

function readBody(req, limit = 5 * 1024 * 1024) {
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

function sendFile(res, file, type) {
  try {
    const data = fs.readFileSync(file);
    res.writeHead(200, { 'content-type': type, 'content-length': data.length, 'cache-control': 'no-cache' });
    res.end(data);
  } catch {
    json(res, 404, { ok: false, error: 'not found' });
  }
}

// ── DSH API 代理 ────────────────────────────────────────────────────────────
let dshCookie = '';
function dshSessionCookie(force = false) {
  if (!force && dshCookie) return dshCookie;
  try { dshCookie = discoverDshSessionCookie(DSH_BASE) || ''; } catch { dshCookie = ''; }
  return dshCookie;
}

function proxyToDsh(req, res, body, retried = false) {
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.cookie;
  delete headers['content-length'];
  delete headers.connection;
  headers.host = '127.0.0.1:3080';
  headers.origin = 'http://127.0.0.1:3080';
  headers.referer = 'http://127.0.0.1:3080/';
  // 强制上游不要压缩：我们原样转发字节，若带 gzip 又删掉 content-encoding，浏览器会解析失败。
  headers['accept-encoding'] = 'identity';
  const cookie = dshSessionCookie();
  if (cookie) headers.cookie = cookie;
  if (body?.length) headers['content-length'] = body.length;

  const upstream = http.request({
    host: '127.0.0.1',
    port: 3080,
    method: req.method,
    path: req.url,
    headers,
    timeout: 200_000,
  }, (up) => {
    const chunks = [];
    up.on('data', (c) => chunks.push(c));
    up.on('end', () => {
      const data = Buffer.concat(chunks);
      // DSH 重启后旧会话 Cookie 会 401：重新铸造一次再试。
      if (up.statusCode === 401 && !retried) {
        dshSessionCookie(true);
        proxyToDsh(req, res, body, true);
        return;
      }
      const out = { ...up.headers };
      delete out['transfer-encoding'];
      delete out.connection;
      delete out['content-encoding'];
      delete out['content-length'];
      out['content-length'] = data.length;
      out['cache-control'] = 'no-store';
      res.writeHead(up.statusCode || 502, out);
      res.end(data);
    });
  });
  upstream.on('timeout', () => { upstream.destroy(new Error('DSH upstream timeout')); });
  upstream.on('error', (error) => {
    if (!res.headersSent) json(res, 502, { ok: false, code: 'DSH_UNAVAILABLE', error: `DSH 不可用：${error.message}` });
    else res.end();
  });
  if (body?.length) upstream.write(body);
  upstream.end();
}

// ── 路由 ───────────────────────────────────────────────────────────────────
const server = (() => {
  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const authed = validSession(parseCookies(req)[COOKIE]);

    if (url.pathname === '/health') {
      json(res, 200, { ok: true, name: 'surfcore-web', dsh: DSH_BASE, auth: Boolean(loadPasswordRecord()) });
      return;
    }
    if (url.pathname === '/login' && req.method === 'POST') {
      if (!loginAllowed(req.socket.remoteAddress || '?')) { html(res, 429, loginPage('尝试太频繁，10 分钟后再试')); return; }
      const record = loadPasswordRecord();
      if (!record) { html(res, 503, loginPage('还没设置密码：在服务器运行 node standalone/setup-password.mjs')); return; }
      const body = await readBody(req, 64 * 1024).catch(() => Buffer.alloc(0));
      const form = new URLSearchParams(body.toString('utf8'));
      const username = form.get('username') || '';
      const password = form.get('password') || '';
      if (!verifyLogin(username, password, record)) { html(res, 401, loginPage('账户或密码不对')); return; }
      const secure = req.socket.encrypted ? '; Secure' : '';
      res.writeHead(303, {
        location: '/',
        'set-cookie': `${COOKIE}=${issueSession()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${TTL_MS / 1000}${secure}`,
        'cache-control': 'no-store',
      });
      res.end();
      return;
    }
    if (url.pathname === '/logout') {
      res.writeHead(303, { location: '/login', 'set-cookie': `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`, 'cache-control': 'no-store' });
      res.end();
      return;
    }
    if (!authed) {
      // 登录页也要 CSS；静态样式不是敏感数据，放行。
      if (url.pathname === '/style.css') { sendFile(res, path.join(PUBLIC, 'style.css'), MIME['.css']); return; }
      html(res, 200, loginPage());
      return;
    }

    if (url.pathname === '/') { sendFile(res, path.join(PUBLIC, 'index.html'), MIME['.html']); return; }
    if (url.pathname === '/app.js') { sendFile(res, path.join(PUBLIC, 'app.js'), MIME['.js']); return; }
    if (url.pathname === '/boot.js') { sendFile(res, path.join(PUBLIC, 'boot.js'), MIME['.js']); return; }
    if (url.pathname === '/style.css') { sendFile(res, path.join(PUBLIC, 'style.css'), MIME['.css']); return; }
    if (url.pathname === '/client.js') { sendFile(res, CLIENT_JS, MIME['.js']); return; }

    if (url.pathname.startsWith('/dsh-surfcore/api/') || url.pathname.startsWith('/dsh-surfcore/ext/')) {
      const body = (req.method === 'GET' || req.method === 'HEAD') ? null : await readBody(req).catch(() => Buffer.alloc(0));
      proxyToDsh(req, res, body);
      return;
    }
    json(res, 404, { ok: false, error: 'not found' });
  };

  const cert = process.env.TLS_CERT;
  const key = process.env.TLS_KEY;
  if (cert && key) {
    return https.createServer({ cert: fs.readFileSync(cert), key: fs.readFileSync(key) }, handler);
  }
  return http.createServer(handler);
})();

server.listen(PORT, HOST, () => {
  console.log(`[surfcore-web] http://${HOST}:${PORT} -> ${DSH_BASE}`);
  console.log(`[surfcore-web] password file: ${PASSWORD_FILE}`);
});
