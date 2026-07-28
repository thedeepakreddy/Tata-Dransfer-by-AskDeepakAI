# Tata Dransfer

Tata Dransfer is a secure, high-performance peer-to-peer (P2P) file sharing and real-time communication platform. Engineered for maximum reliability and privacy, it facilitates seamless data transfer, messaging, and audio/video calls directly between devices without intermediate storage servers.

## Key Features

*   **Massive File Transfers (Direct-to-Disk):** Supports transferring files of unlimited size (100GB+) by leveraging the modern File System Access API. Incoming data streams directly to the local hard drive, maintaining near-zero memory footprint and preventing browser crashes during large transfers.
*   **End-to-End Encryption (E2EE):** All communications, including chat messages and file payloads, are encrypted using AES-GCM prior to transmission. Data remains secure in transit across both WebRTC data channels and WebSocket signaling fallbacks.
*   **Hybrid Signaling Architecture:** Employs a robust signaling mechanism that prioritizes high-speed WebRTC connections. If strict network topologies prevent direct P2P connections, the system seamlessly falls back to a dedicated WebSocket relay, ensuring guaranteed message delivery.
*   **Real-Time Communication:** Features low-latency text chat with typing indicators and high-definition audio/video calling capabilities.
*   **Cross-Platform Compatibility:** Designed to work gracefully across modern desktop and mobile browsers.

## Technology Stack

*   **Frontend:** React, TypeScript, Vite, Tailwind CSS
*   **Backend / Signaling:** Node.js, Express, WebSockets (ws)
*   **Networking:** WebRTC (RTCPeerConnection, RTCDataChannel)

## Getting Started

### Prerequisites

*   Node.js (v18 or higher recommended)
*   npm or yarn

### Installation

1.  Clone the repository and navigate to the project directory:
    ```bash
    git clone <repository-url>
    cd QuickShare
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Start the development server (which concurrently runs the Vite frontend and Express signaling server):
    ```bash
    npm run dev
    ```

4.  Open your browser and navigate to `http://localhost:3000`.

### Building for Production

To create a production-ready build of both the frontend client and the backend signaling server:

```bash
npm run build
```

To start the production server:

```bash
npm run start
```

## Security and Privacy

Tata Dransfer does not store any files, messages, or communication data on central servers. The backend infrastructure is strictly utilized for initial signaling and establishing direct WebRTC connections between peers.

## License

This project is proprietary and confidential. Unauthorized copying of this file, via any medium, is strictly prohibited unless explicit permission is granted.