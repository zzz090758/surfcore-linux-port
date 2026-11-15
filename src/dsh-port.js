// 找到「当前正在运行的那只 DSH」的 Web 地址。
//
// 为什么需要独立模块：DSH 桌面端每次启动会挑一个空闲回环端口（实测 28918 → 15016 →
// 41742 → 42212），而桥接铸造的会话 Cookie 把 host:port 绑进签名载荷，端口错只会 401。
// 正常路径有两条：DSH 拉起桥接时带 `DSH_WEB_URL`，或 `start-with-dsh-port.bat` 先跑
// `scripts/sync-dsh-port.mjs`。但直接 `npm start` / `node src/bridge.js` 时两条都没走，
// config.json 里的旧端口会让桥接一直 401/超时——表现却是「QQ 有消息、DSH 没反应」，
// 极难自查。所以这里把探测抽成共用逻辑：脚本用它写回配置，桥接启动时用它兜底。
//
// 平台：
//   · Windows：netstat + tasklist 过滤进程名（历史实现，保持不变）。
//   · Linux/macOS：`ss -ltnp`（iproute2）或 /proc/net/tcp 拿到回环监听端口，再逐个做
//     HTTP 形状探活。DSH CLI 的进程名可能是 node / dsh / npx，按名字过滤不可靠，
//     所以不按名字过滤——探活只认 /api/status 的 JSON 形状，不会误认其它服务。
import { execSync } from 'node:child_process';
import fs from 'node:fs';

/** 列出「某个进程在 127.0.0.1 上监听的端口」。 */
export function listeningLoopbackPorts() {
  if (process.platform === 'win32') return windowsListeningLoopbackPorts();
  const rows = posixListeningLoopbackPorts();
  if (rows.length) return rows;
  return procNetLoopbackPorts();
}

function windowsListeningLoopbackPorts() {
  let out = '';
  try {
    out = execSync('netstat -ano -p TCP', { encoding: 'utf8', windowsHide: true });
  } catch {
    return [];
  }
  const rows = [];
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes('LISTENING')) continue;
    const cols = line.trim().split(/\s+/);
    const local = cols[1] ?? '';
    const pid = cols[4] ?? '';
    if (!/^127\.0\.0\.1:\d+$/.test(local)) continue;
    rows.push({ port: Number(local.split(':').pop()), pid });
  }
  return rows;
}

/** `ss -ltnp` 输出：LISTEN 0 511 127.0.0.1:3080 0.0.0.0:* users:(("node",pid=123,fd=20)) */
function posixListeningLoopbackPorts() {
  let out = '';
  try {
    out = execSync('ss -ltnp 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
  } catch {
    return [];
  }
  const rows = [];
  for (const line of out.split(/\r?\n/)) {
    const m = /^LISTEN\s+\d+\s+\d+\s+(\S+)\s+\S+\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    const local = m[1];
    const proc = m[2] ?? '';
    let host = '';
    let port = '';
    if (local.startsWith('[')) {
      const end = local.lastIndexOf(']:');
      if (end < 0) continue;
      host = local.slice(1, end);
      port = local.slice(end + 2);
    } else {
      const end = local.lastIndexOf(':');
      if (end < 0) continue;
      host = local.slice(0, end);
      port = local.slice(end + 1);
    }
    if (host !== '127.0.0.1' && host !== '::1') continue;
    rows.push({ port: Number(port), pid: /pid=(\d+)/.exec(proc)?.[1] ?? '' });
  }
  return rows;
}

/**
 * 没有 iproute2 时的兜底：直接读 /proc/net/tcp{,6}。
 * 只认 127.0.0.1 与 ::1；state 0A = LISTEN。
 */
function procNetLoopbackPorts() {
  const rows = [];
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let text = '';
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n').slice(1)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10 || parts[3] !== '0A') continue;
      const [addr, portHex] = String(parts[1]).split(':');
      const port = Number.parseInt(portHex, 16);
      if (!Number.isFinite(port) || port <= 0) continue;
      let loopback = false;
      if (addr.length === 8) {
        const bytes = [addr.slice(6, 8), addr.slice(4, 6), addr.slice(2, 4), addr.slice(0, 2)]
          .map((hex) => Number.parseInt(hex, 16));
        loopback = bytes[0] === 127 && bytes[1] === 0 && bytes[2] === 0 && bytes[3] === 1;
      } else {
        loopback = addr === '00000000000000000000000001000000';
      }
      if (loopback) rows.push({ port, pid: '' });
    }
  }
  return rows;
}

function processNames() {
  const map = new Map();
  try {
    const out = execSync('tasklist /fo csv /nh', { encoding: 'utf8', windowsHide: true });
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^"([^"]+)","(\d+)"/);
      if (m) map.set(m[2], m[1]);
    }
  } catch { /* 拿不到进程名就只按端口探测 */ }
  return map;
}

/** DSH 的 Web 服务对未鉴权请求返回 401（有时 200），并带自己的响应头。 */
export async function looksLikeDsh(port, timeoutMs = 1500) {
  return probeDshBaseUrl(`http://127.0.0.1:${port}`, timeoutMs);
}

/** 枚举本机正在监听的 DSH，返回 `http://127.0.0.1:<port>`；找不到返回 null。 */
export async function discoverDshBaseUrl() {
  const windows = process.platform === 'win32';
  const names = windows ? processNames() : new Map();
  const candidates = listeningLoopbackPorts()
    // Windows 上进程名足以排除无关服务；Linux 上 node/npx/dsh 的进程名不稳定，交给探活判定。
    .filter(({ pid }) => !windows || /harness|dsh/i.test(names.get(pid) ?? ''))
    .map(({ port }) => port)
    .filter((port) => Number.isInteger(port) && port > 0)
    .filter((port, i, all) => all.indexOf(port) === i);
  for (const port of candidates) {
    if (await looksLikeDsh(port)) return `http://127.0.0.1:${port}`;
  }
  return null;
}

/**
 * 这个地址上是否有一个活着的 DSH。
 *
 * 401 = 教科书式的「DSH 在，但要鉴权」；200 只有 Server 头或 /api/status
 * 的 JSON 形状像 DSH 时才认——否则回环上任何一个别的 Web 服务（开发服务器、
 * 别的控制台）都会被当成 DSH，桥接就会把消息投给错误的目标。
 */
export async function probeDshBaseUrl(baseUrl, timeoutMs = 2000) {
  const base = String(baseUrl ?? '').trim().replace(/\/+$/, '');
  if (!base) return false;
  const probe = async (path, readJson = false) => {
    try {
      const res = await fetch(`${base}${path}`, { method: 'GET', signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 401) { await res.body?.cancel?.(); return true; }
      if (res.status !== 200) { await res.body?.cancel?.(); return false; }
      if (readJson) {
        const body = await res.json().catch(() => null);
        const looks = body && typeof body === 'object'
          && ('modelConnection' in body || 'latestEventCursor' in body || 'sessions' in body);
        if (looks) return true;
      } else {
        const server = String(res.headers.get('server') ?? '');
        await res.body?.cancel?.();
        if (/dsh/i.test(server)) return true;
      }
    } catch {}
    return false;
  };
  // 桌面内嵌宿主可能没有 `server: dsh` 头，但 /api/status 一定存在；
  // 先看 API 形状，再看旧版根路径头，避免把「HTTP 通但缺 remote.mux」误报成连不上。
  if (await probe('/api/status', true)) return true;
  return probe('/', false);
}

/** 只对回环地址做「端口漂移」兜底；远程 DSH 由用户显式配置，不能被本地探测覆盖。 */
export function isLoopbackBaseUrl(baseUrl) {
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i.test(String(baseUrl ?? '').trim());
}
