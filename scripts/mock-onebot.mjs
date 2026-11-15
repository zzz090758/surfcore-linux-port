// Minimal OneBot 11 mock: HTTP :3000 + WebSocket :3001.
// Purpose: exercise the QQ bridge end-to-end on Linux without a real QQ login.
import http from 'node:http';
import { WebSocketServer } from 'ws';

const GROUP = 100000004;
const OWNER = 1000000001;
const SELF = 1000000002;
const log = (...a) => console.log(new Date().toISOString(), ...a);

function dataFor(action) {
  switch (action) {
    case 'get_login_info': return { user_id: SELF, nickname: 'MockBot' };
    case 'get_status': return { online: true, good: true };
    case 'get_version_info': return { app_name: 'mock-onebot', app_version: '1.0.0', protocol_version: 'v11' };
    case 'get_group_list': return [{ group_id: GROUP, group_name: '测试群', member_count: 2 }];
    case 'get_friend_list': return [{ user_id: OWNER, nickname: '主人' }];
    case 'get_group_member_list': return [
      { group_id: GROUP, user_id: OWNER, nickname: '主人', card: '', role: 'owner' },
      { group_id: GROUP, user_id: SELF, nickname: 'MockBot', card: '', role: 'member' },
    ];
    case 'get_group_member_info': return { group_id: GROUP, user_id: OWNER, nickname: '主人', card: '', role: 'owner' };
    case 'get_stranger_info': return { user_id: OWNER, nickname: '主人' };
    case 'get_msg': return { message_id: 90001, message: [], sender: { user_id: OWNER, nickname: '主人' } };
    case 'get_forward_msg': return { messages: [] };
    default: return {};
  }
}

const httpServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let action = url.pathname.replace(/^\//, '');
    let params = {};
    try {
      const j = JSON.parse(body || '{}');
      if (j.action) { action = j.action; params = j.params ?? {}; }
      else params = j;
    } catch {}
    log('HTTP', action || '(none)', JSON.stringify(params).slice(0, 300));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', retcode: 0, data: dataFor(action), echo: params.echo ?? null }));
  });
});
httpServer.listen(3000, '127.0.0.1', () => log('HTTP mock on 3000'));

const wss = new WebSocketServer({ host: '127.0.0.1', port: 3001 });
wss.on('connection', (ws, req) => {
  log('WS connected', req.url);
  ws.on('message', (buf) => {
    let m = {};
    try { m = JSON.parse(buf.toString()); } catch { return; }
    log('WS action', m.action, JSON.stringify(m.params ?? {}).slice(0, 400));
    ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: dataFor(m.action), echo: m.echo }));
  });
  const hb = setInterval(() => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({
        post_type: 'meta_event', meta_event_type: 'heartbeat', time: Math.floor(Date.now() / 1000),
        self_id: SELF, status: { online: true, good: true }, interval: 30000,
      }));
    }
  }, 30000);
  ws.on('close', () => { clearInterval(hb); log('WS closed'); });
  setTimeout(() => {
    if (ws.readyState !== 1) return;
    ws.send(JSON.stringify({
      post_type: 'message', message_type: 'group', sub_type: 'normal',
      group_id: GROUP, user_id: OWNER,
      message: [{ type: 'text', data: { text: '在吗？测试一下 Linux 桥接' } }],
      raw_message: '在吗？测试一下 Linux 桥接', message_id: 10001, font: 0, self_id: SELF,
      sender: { user_id: OWNER, nickname: '主人', card: '', role: 'owner' },
      time: Math.floor(Date.now() / 1000),
    }));
    log('sent group message');
  }, 8000);
});
log('WS mock on 3001');
