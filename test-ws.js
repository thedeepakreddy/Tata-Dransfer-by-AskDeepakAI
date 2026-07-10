import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:3000/signaling');
ws.on('open', () => { console.log('Connected!'); ws.close(); });
ws.on('error', (e) => { console.error('Error:', e); });
