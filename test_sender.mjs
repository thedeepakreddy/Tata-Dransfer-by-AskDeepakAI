import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:3000/signaling');
ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'join', roomId: '123456', role: 'sender' }));
});
ws.on('message', (data) => {
  console.log('Sender Received:', data.toString());
  const msg = JSON.parse(data.toString());
  if (msg.type === 'ready') {
    setTimeout(() => {
      ws.send(JSON.stringify({
        type: 'chat',
        roomId: '123456',
        payload: { id: 'msg1', senderRole: 'sender', text: 'Hello from sender!', timestamp: Date.now() }
      }));
    }, 500);
  }
});
