# Tata Dransfer
By AskDeepakAI

Tata Dransfer is a lightning-fast, highly secure peer-to-peer file transfer and chat application. It allows devices on the same local network or across the internet to connect via WebRTC, enabling direct, end-to-end encrypted file sharing and messaging without any data ever touching a central server.

## Features
- **End-to-End Encrypted (E2EE):** True WebRTC DTLS/SRTP encryption.
- **Local WiFi Transfer:** Directly transfer gigabytes of data between devices in seconds.
- **Unified Chat Room:** Seamlessly chat and transfer files in a sleek, modern, glassmorphic UI.
- **Cross-Platform:** Works entirely in the browser on mobile, desktop, iOS, and Android.

## Setup & Deployment

### Frontend (React/Vite)
To run the frontend locally:
```bash
npm install
npm run dev
```

### Backend (Signaling Server)
The signaling server establishes the initial peer connection before stepping out of the way. It is built in Node.js using WebSockets.
```bash
node signaling-server.js
```

## Privacy & Security
All files travel *directly* from device A to device B. There is no cloud storage, no file limits, and absolutely no tracking.