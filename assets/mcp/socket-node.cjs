#!/usr/bin/env node
/**
 * socket-node.cjs — src/socket.ts 的 Node 移植版(无需 Bun)
 * WebSocket 桥接:Figma 插件 ←→ MCP server,频道隔离广播。
 * 协议与原版逐条对齐(join/欢迎语/广播格式/progress_update 转发)。
 */
const http = require('http');
const { WebSocketServer, WebSocket } = require('./node_modules/ws');

const PORT = Number(process.env.PORT || 3055);

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }
  res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
  res.end('WebSocket server running');
});

/* 端口被占用(桥接已在运行)时静默退出,便于自愈启动器幂等拉起 */
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('[socket-node] port 3055 already in use, exiting (existing relay keeps serving)');
    process.exit(0);
  }
  throw err;
});

const wss = new WebSocketServer({ server });
const channels = new Map(); // channel -> Set<ws>

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

wss.on('connection', (ws) => {
  console.log('New client connected');
  send(ws, { type: 'system', message: 'Please join a channel to start chatting' });

  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch (err) {
      console.error('Error handling message:', err);
      return;
    }
    try {
      console.log(`Type: ${data.type}, Channel: ${data.channel || 'N/A'}`);

      if (data.type === 'join') {
        const channelName = data.channel;
        if (!channelName || typeof channelName !== 'string') {
          return send(ws, { type: 'error', message: 'Channel name is required' });
        }
        if (!channels.has(channelName)) channels.set(channelName, new Set());
        const clients = channels.get(channelName);
        clients.add(ws);
        console.log(`Client joined channel "${channelName}" (${clients.size} total clients)`);
        send(ws, { type: 'system', message: `Joined channel: ${channelName}`, channel: channelName });
        send(ws, {
          type: 'system',
          message: { id: data.id, result: 'Connected to channel: ' + channelName },
          channel: channelName,
        });
        clients.forEach((client) => {
          if (client !== ws) {
            send(client, { type: 'system', message: 'A new user has joined the channel', channel: channelName });
          }
        });
        return;
      }

      if (data.type === 'message') {
        const channelName = data.channel;
        if (!channelName || typeof channelName !== 'string') {
          return send(ws, { type: 'error', message: 'Channel name is required' });
        }
        const clients = channels.get(channelName);
        if (!clients || !clients.has(ws)) {
          return send(ws, { type: 'error', message: 'You must join the channel first' });
        }
        let count = 0;
        clients.forEach((client) => {
          if (client !== ws) {
            count++;
            send(client, { type: 'broadcast', message: data.message, sender: 'peer', channel: channelName });
          }
        });
        if (count === 0) console.log(`No other clients in channel "${channelName}" to receive message!`);
        else console.log(`Broadcast to ${count} peer(s) in channel "${channelName}"`);
        return;
      }

      /* progress_update 等其它类型:同频道转发给其他客户端 */
      if (data.channel) {
        const clients = channels.get(data.channel);
        if (clients && clients.has(ws)) {
          clients.forEach((client) => {
            if (client !== ws) send(client, data);
          });
        }
      }
    } catch (err) {
      console.error('Error handling message:', err);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    channels.forEach((clients, name) => {
      if (clients.has(ws)) {
        clients.delete(ws);
        clients.forEach((client) => {
          send(client, { type: 'system', message: 'A user has left the channel', channel: name });
        });
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${server.address().port}`);
});
