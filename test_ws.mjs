import WebSocket from 'ws';

const ws1 = new WebSocket('ws://localhost:3000/signaling');
const ws2 = new WebSocket('ws://localhost:3000/signaling');

ws1.on('open', () => {
  console.log('WS1 connected');
  ws1.send(JSON.stringify({ type: 'join', roomId: '123456', role: 'sender' }));
});

ws2.on('open', () => {
  console.log('WS2 connected');
  ws2.send(JSON.stringify({ type: 'join', roomId: '123456', role: 'receiver' }));
});

ws1.on('message', (data) => {
  const msg = JSON.parse(data);
  console.log('WS1 received:', msg);
  if (msg.type === 'ready') {
    setTimeout(() => {
      ws1.send(JSON.stringify({
        type: 'chat',
        roomId: '123456',
        payload: { id: 'msg1', senderRole: 'sender', text: 'Hello from sender!', timestamp: Date.now() }
      }));
      console.log('WS1 sent chat message');
    }, 500);
  }
});

ws2.on('message', (data) => {
  const msg = JSON.parse(data);
  console.log('WS2 received:', msg);
  if (msg.type === 'chat') {
    console.log('WS2 successfully received chat from WS1!');
    process.exit(0);
  }
});

setTimeout(() => {
  console.error('Test timed out');
  process.exit(1);
}, 5000);
