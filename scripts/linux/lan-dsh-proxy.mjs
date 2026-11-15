// 把只监听 127.0.0.1 的 DSH Web 暴露到局域网，同时让 DSH / 插件仍然看到回环 Host。
//
// 为什么需要它：SurfCore 的插件 API 有「只接受本机回环访问」的硬闸门（http-guard），
// 直接改绑 0.0.0.0 会被 403。这个反向代理把 Host/Origin 改写成 127.0.0.1:3080，
// 再把响应里的 Location 改写回局域网地址；WebSocket 升级也转发。
//
// 用法：
//   LAN_HOST=192.0.2.10 LAN_PORT=3081 TARGET_PORT=3080 node scripts/linux/lan-dsh-proxy.mjs
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LAN_HOST = process.env.LAN_HOST || '0.0.0.0';
const LAN_PORT = Number(process.env.LAN_PORT || 3081);
const TARGET_HOST = process.env.TARGET_HOST || '127.0.0.1';
const TARGET_PORT = Number(process.env.TARGET_PORT || 3080);
const PUBLIC_BASE = `http://${LAN_HOST}:${LAN_PORT}`;
const TARGET_BASE = `http://${TARGET_HOST}:${TARGET_PORT}`;
const DSH_LOG = process.env.DSH_LOG || path.join(os.homedir(), 'dsh-web.log');

// 从 DSH 启动日志里读当前 token（DSH 每次重启都会换）。带 mtime 缓存，避免每个请求都读盘。
let tokenCache = { mtimeMs: 0, token: '' };
function currentToken() {
  try {
    const st = fs.statSync(DSH_LOG);
    if (st.mtimeMs !== tokenCache.mtimeMs) {
      const text = fs.readFileSync(DSH_LOG, 'utf8');
      const matches = [...text.matchAll(/dsh web:\s*http:\/\/[^\s?]+\?token=([A-Za-z0-9_-]+)/g)];
      tokenCache = { mtimeMs: st.mtimeMs, token: matches.length ? matches[matches.length - 1][1] : tokenCache.token };
    }
  } catch { /* 日志还没生成时保持旧值 */ }
  return tokenCache.token;
}

function rewriteHeaders(headers) {
  const out = { ...headers };
  out.host = `${TARGET_HOST}:${TARGET_PORT}`;
  if (out.origin) out.origin = TARGET_BASE;
  if (out.referer) out.referer = String(out.referer).replace(PUBLIC_BASE, TARGET_BASE);
  return out;
}

const server = http.createServer((req, res) => {
  // 裸访问 /（没有 token、也没有 Cookie）时自动跳到带当前 token 的地址。
  // 有 Cookie 就直接走上游，避免每次打开首页都重复跳转。
  try {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET' && u.pathname === '/' && !u.searchParams.get('token') && !req.headers.cookie) {
      const token = currentToken();
      if (token) {
        res.writeHead(302, { location: `/?token=${token}` });
        res.end();
        return;
      }
    }
  } catch { /* 非法 URL 交给上游处理 */ }

  const upstream = http.request({
    host: TARGET_HOST,
    port: TARGET_PORT,
    method: req.method,
    path: req.url,
    headers: rewriteHeaders(req.headers),
  }, (up) => {
    const headers = { ...up.headers };
    if (headers.location) headers.location = String(headers.location).split(TARGET_BASE).join(PUBLIC_BASE);
    res.writeHead(up.statusCode || 502, headers);
    up.pipe(res);
  });
  upstream.on('error', (error) => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(`proxy error: ${error?.message ?? error}`);
  });
  req.pipe(upstream);
});

server.on('upgrade', (req, socket, head) => {
  const up = net.connect(TARGET_PORT, TARGET_HOST, () => {
    const headers = rewriteHeaders(req.headers);
    const lines = [`GET ${req.url} HTTP/1.1`, ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`)];
    up.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head?.length) up.write(head);
    up.pipe(socket);
    socket.pipe(up);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
});

server.listen(LAN_PORT, LAN_HOST, () => {
  console.log(`[lan-dsh-proxy] ${LAN_HOST}:${LAN_PORT} -> ${TARGET_HOST}:${TARGET_PORT}`);
});
