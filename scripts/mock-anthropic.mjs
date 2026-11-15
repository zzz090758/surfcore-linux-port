// 本地假 DeepSeek（Anthropic Messages 协议）——仅用于 Linux 移植的端到端联调。
// DSH 的 dsh-llm-deepseek 走 /v1/messages（SSE）；本服务返回一条固定文本。
import http from 'node:http';

const PORT = Number(process.env.MOCK_LLM_PORT || 18080);
const TEXT = process.env.MOCK_LLM_TEXT || '收到，我在。这是一条 Linux 端到端测试回复。';

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let payload = {};
    try { payload = JSON.parse(body || '{}'); } catch {}
    const isMessages = req.url.includes('/v1/messages');
    console.log(new Date().toISOString(), req.method, req.url, 'stream=', payload.stream,
      'messages=', Array.isArray(payload.messages) ? payload.messages.length : '?');
    if (!isMessages) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    if (payload.stream === false) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'msg_mock', type: 'message', role: 'assistant', model: payload.model || 'mock',
        content: [{ type: 'text', text: TEXT }],
        stop_reason: 'end_turn', stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 12 },
      }));
      return;
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    sse(res, 'message_start', {
      type: 'message_start',
      message: {
        id: 'msg_mock', type: 'message', role: 'assistant', model: payload.model || 'mock',
        content: [], stop_reason: null, stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 0 },
      },
    });
    sse(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
    for (const chunk of TEXT.match(/.{1,8}/gu) || [TEXT]) {
      sse(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: chunk } });
    }
    sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 });
    sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 12 } });
    sse(res, 'message_stop', { type: 'message_stop' });
    res.end();
  });
});
server.listen(PORT, '127.0.0.1', () => console.log(`mock anthropic on 127.0.0.1:${PORT}`));
