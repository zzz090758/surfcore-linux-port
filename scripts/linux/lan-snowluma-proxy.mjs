// SnowLuma WebUI 的局域网入口：192.0.2.10:5099 -> 127.0.0.1:5099。
// 容器只把 5099 绑在回环，浏览器直接开 127.0.0.1 会连到自己的电脑；这个代理解决访问问题。
// 支持 WebSocket（WebUI 的日志/事件流）。
//
// 额外访问令牌：
//   首次打开 http://192.0.2.10:5099/?token=<token>，代理校验后写 HttpOnly Cookie 并 302 到 /；
//   之后的静态资源/API/WebSocket 都靠这个 Cookie，不需要每次带 token。
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const LAN_HOST = process.env.LAN_HOST || '192.0.2.10';
const LAN_PORT = Number(process.env.LAN_PORT || 5099);
const TARGET_HOST = process.env.TARGET_HOST || '127.0.0.1';
const TARGET_PORT = Number(process.env.TARGET_PORT || 5099);
const TARGET_BASE = `http://${TARGET_HOST}:${TARGET_PORT}`;
const PUBLIC_BASE = `http://${LAN_HOST}:${LAN_PORT}`;
const TOKEN_FILE = process.env.SNOWLUMA_LAN_TOKEN_FILE
  || path.join(os.homedir(), '.dsh', 'surfcore', 'snowluma-lan-token');
const COOKIE = 'snowluma_lan';
const MAX_AGE = 30 * 24 * 60 * 60;

function loadToken() {
  try { return fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { return ''; }
}

function cookieValue(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return '';
}

function sameSecret(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

function authorized(req, url) {
  const token = loadToken();
  if (!token) return { ok: false, reason: 'missing-config' };
  if (sameSecret(url.searchParams.get('token') || '', token)) return { ok: true, fromQuery: true };
  if (sameSecret(cookieValue(req, COOKIE), token)) return { ok: true, fromQuery: false };
  return { ok: false };
}

function unauthorized(res) {
  res.writeHead(401, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end('<!doctype html><meta charset="utf-8"><title>需要访问令牌</title>'
    + '<body style="background:#111;color:#ddd;font:14px system-ui;padding:40px">'
    + '<h2>需要访问令牌</h2><p>请使用带 <code>?token=...</code> 的完整地址访问。</p></body>');
}

function rewriteHeaders(headers) {
  const out = { ...headers };
  out.host = `${TARGET_HOST}:${TARGET_PORT}`;
  if (out.origin) out.origin = TARGET_BASE;
  if (out.referer) out.referer = String(out.referer).split(PUBLIC_BASE).join(TARGET_BASE);
  return out;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const auth = authorized(req, url);
  if (!auth.ok) {
    if (auth.reason === 'missing-config') {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`缺少令牌文件：${TOKEN_FILE}`);
      return;
    }
    unauthorized(res);
    return;
  }

  // 首次用 ?token= 打开：种 Cookie 后把 token 从地址栏去掉。
  if (auth.fromQuery && req.method === 'GET' && url.pathname === '/') {
    res.writeHead(302, {
      location: '/',
      'set-cookie': `${COOKIE}=${encodeURIComponent(loadToken())}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`,
      'cache-control': 'no-store',
    });
    res.end();
    return;
  }

  // 不要把 token 查询串透传给上游。
  if (url.searchParams.has('token')) url.searchParams.delete('token');

  const upstream = http.request({
    host: TARGET_HOST,
    port: TARGET_PORT,
    method: req.method,
    path: `${url.pathname}${url.search}`,
    headers: rewriteHeaders(req.headers),
  }, (up) => {
    const headers = { ...up.headers };
    if (headers.location) headers.location = String(headers.location).split(TARGET_BASE).join(PUBLIC_BASE);
    res.writeHead(up.statusCode || 502, headers);
    up.pipe(res);
  });
  upstream.on('error', (error) => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`SnowLuma WebUI 不可达：${error?.message ?? error}`);
  });
  req.pipe(upstream);
});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  const auth = authorized(req, url);
  if (!auth.ok) { try { socket.destroy(); } catch {} return; }

  const headers = rewriteHeaders(req.headers);
  const lines = [`${req.method} ${req.url} HTTP/1.1`];
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) for (const v of value) lines.push(`${key}: ${v}`);
    else if (value !== undefined) lines.push(`${key}: ${value}`);
  }
  const up = net.connect(TARGET_PORT, TARGET_HOST, () => {
    up.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head?.length) up.write(head);
    up.pipe(socket);
    socket.pipe(up);
  });
  up.on('error', () => { try { socket.destroy(); } catch {} });
  socket.on('error', () => { try { up.destroy(); } catch {} });
});

server.listen(LAN_PORT, LAN_HOST, () => {
  console.log(`[snowluma-lan] ${PUBLIC_BASE} -> ${TARGET_BASE} (token: ${TOKEN_FILE})`);
});
