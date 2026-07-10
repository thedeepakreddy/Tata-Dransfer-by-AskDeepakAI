import WebSocket from 'ws';
const ws = new WebSocket('wss://ais-dev-qgbmz2nt27h5ejzier2hfu-472197766304.europe-west2.run.app/signaling');
ws.on('open', () => { console.log('Connected!'); ws.close(); });
ws.on('error', (e) => { console.error('Error:', e); });
