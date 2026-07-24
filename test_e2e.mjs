import WebSocket from 'ws';

// Simulate receiver joining
const receiver = new WebSocket('ws://localhost:3000/signaling');
receiver.on('open', () => {
  console.log('[RECEIVER] Connected');
  receiver.send(JSON.stringify({ type: 'join', roomId: 'TEST99', role: 'receiver' }));
});
receiver.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('[RECEIVER] Got:', msg.type, JSON.stringify(msg).slice(0, 150));
});

// Simulate sender joining after 500ms
setTimeout(() => {
  const sender = new WebSocket('ws://localhost:3000/signaling');
  sender.on('open', () => {
    console.log('[SENDER] Connected');
    sender.send(JSON.stringify({ type: 'join', roomId: 'TEST99', role: 'sender' }));
  });
  sender.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log('[SENDER] Got:', msg.type, JSON.stringify(msg).slice(0, 150));
    if (msg.type === 'ready') {
      // Simulate sending a chat
      setTimeout(() => {
        sender.send(JSON.stringify({
          type: 'chat',
          roomId: 'TEST99',
          payload: { id: 'testmsg1', senderRole: 'sender', text: 'Hello from sender!', timestamp: Date.now() }
        }));
        console.log('[SENDER] Sent chat message');
      }, 300);
    }
  });

  // Close everything after 3s
  setTimeout(() => {
    sender.close();
    receiver.close();
    console.log('\n=== TEST COMPLETE ===');
    process.exit(0);
  }, 3000);
}, 500);
