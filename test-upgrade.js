import http from 'http';
const server = http.createServer();
server.on('upgrade', (req, socket, head) => {
  const host = req.headers.host || 'localhost';
  const pathname = req.url ? new URL(req.url, `http://${host}`).pathname : '';
  console.log('URL:', req.url, 'Pathname:', pathname);
  socket.end();
});
server.listen(3001, () => {
  http.get({
    port: 3001,
    path: '/signaling',
    headers: { 'Connection': 'Upgrade', 'Upgrade': 'websocket' }
  });
});
