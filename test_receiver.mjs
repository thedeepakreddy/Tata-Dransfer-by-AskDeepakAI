import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:3000/signaling');
ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'join', roomId: '123456', role: 'receiver' }));
});
ws.on('message', (data) => {
  console.log('Received:', data.toString());
});
