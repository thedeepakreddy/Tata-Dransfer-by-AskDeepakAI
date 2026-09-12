import { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useCallManager } from './useCallManager';

export type Role = 'sender' | 'receiver' | null;
export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'transferring' | 'complete' | 'error' | 'reconnecting' | 'disconnected';
// The signalling socket is a separate transport from the peer connection.
// It is only needed to introduce the two devices; once the data channel is
// open, losing it does not end the session.
export type SignalingState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';
export type ConnectionType = 'local' | 'relayed' | 'unknown';
export type CallState = 'idle' | 'ringing' | 'incoming' | 'connecting' | 'active' | 'rejected' | 'ended';
export type CallMode = 'audio' | 'video' | null;
export interface CallQuality {
  qualityTier: string;
  pathLabel: string;
}

export interface FileMetadata {
  type: 'meta';
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface FileProgress {
  fileId: string;
  name: string;
  size: number;
  bytesTransferred: number;
  status: 'pending' | 'waiting_for_accept' | 'declined' | 'transferring' | 'complete' | 'error';
  blobUrl?: string;
}

export interface ChatMessage {
  id: string;
  senderRole: Role | 'system';
  text?: string;
  fileId?: string;
  isSystemMessage?: boolean;
  timestamp: number;
}

const CHUNK_SIZE = 16384; // 16 KB

const VIDEO_CONSTRAINTS_HD = {
  width: { ideal: 1280, min: 640 },
  height: { ideal: 720, min: 480 },
  frameRate: { ideal: 30, min: 20 },
};

const VIDEO_CONSTRAINTS_FALLBACK = {
  width: { ideal: 854, min: 480 },
  height: { ideal: 480, min: 360 },
  frameRate: { ideal: 24, min: 15 },
};

const BITRATE_720P = 2_500_000; // 2.5 Mbps
const BITRATE_480P = 1_200_000; // 1.2 Mbps
const AUDIO_BITRATE = 64_000;   // 64 kbps Opus

export function useWebRTC(userName: string = '') {
  const [role, setRole] = useState<Role>(null);
  const [roomId, setRoomId] = useState<string>('');
  const [status, setStatus] = useState<ConnectionState>('idle');
  const [signalingState, setSignalingState] = useState<SignalingState>('idle');
  const [connectionType, setConnectionType] = useState<ConnectionType>('unknown');
  const [filesProgress, setFilesProgress] = useState<Record<string, FileProgress>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [peerName, setPeerName] = useState<string>('');
  const [isPeerTyping, setIsPeerTyping] = useState(false);

  // Call state
  const [callState, setCallState] = useState<CallState>('idle');
  const [callMode, setCallMode] = useState<CallMode>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callQuality, setCallQuality] = useState<CallQuality | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // Call refs
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const qualityMonitorHandleRef = useRef<NodeJS.Timeout | null>(null);
  const activeResolutionTierRef = useRef<'720p'|'480p'>('720p');
  const callManagerRef = useRef<ReturnType<typeof useCallManager> | null>(null);

  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);


  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Signalling socket lifecycle
  const shouldReconnectRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitiatorRef = useRef(false);
  // Peer connection recovery
  const peerGraceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastIceRestartRef = useRef(0);

  // Refs for state accessed inside callbacks
  const roomIdRef = useRef<string>('');
  const roleRef = useRef<Role>(null);
  const statusRef = useRef<ConnectionState>('idle');
  const userNameRef = useRef(userName);

  // Sync refs
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
  useEffect(() => { roleRef.current = role; }, [role]);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { userNameRef.current = userName; }, [userName]);
  
  // File transfer state
  const sendQueueRef = useRef<File[]>([]);
  const isSendingRef = useRef(false);
  const receiveBufferRef = useRef<{ [id: string]: { chunks: ArrayBuffer[], receivedBytes: number, meta: FileMetadata, stream?: any, writePromise?: Promise<any> } }>({});
  // The file this peer has accepted and is currently receiving chunks for.
  const activeReceiveIdRef = useRef<string | null>(null);

  const callManager = useCallManager(
    pcRef, wsRef, dcRef, userNameRef, setMessages, roleRef,
    callState, setCallState, callMode, setCallMode,
    localStream, setLocalStream, remoteStream, setRemoteStream,
    callQuality, setCallQuality, isScreenSharing, setIsScreenSharing,
    isRecording, setIsRecording
  );
  callManagerRef.current = callManager;

  const getWsUrl = () => {
    const loc = window.location;
    if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
      return `ws://${loc.host}/signaling`;
    }
    // In production, always point to the dedicated Render signaling server
    return `wss://tata-dransfer-by-askdeepakai.onrender.com`;
  };

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  // The session lives on the peer-to-peer channel, not the signalling socket.
  // The socket only introduces the two devices; once the data channel is open,
  // losing the socket is recoverable and must not end the session.
  const isPeerLive = () => dcRef.current?.readyState === 'open';

  function scheduleReconnect() {
    if (!shouldReconnectRef.current || !roomIdRef.current) return;
    if (reconnectTimerRef.current) return;
    const attempt = reconnectAttemptsRef.current;
    // 1s, 2s, 4s, 8s, then capped at 15s.
    const delay = Math.min(1000 * 2 ** attempt, 15000);
    reconnectAttemptsRef.current = attempt + 1;
    setSignalingState('reconnecting');
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connectSocket();
    }, delay);
  }

  function connectSocket() {
    const room = roomIdRef.current;
    const clientRole = roleRef.current;
    if (!room || !clientRole) return;

    clearReconnectTimer();
    setSignalingState(reconnectAttemptsRef.current > 0 ? 'reconnecting' : 'connecting');

    if (wsRef.current) {
      const stale = wsRef.current;
      wsRef.current = null;
      try { stale.close(); } catch { /* already closing */ }
    }

    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      reconnectAttemptsRef.current = 0;
      setSignalingState('open');
      ws.send(JSON.stringify({ type: 'join', roomId: room, role: clientRole }));
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'ready') {
          // Re-joining after a socket reconnect also produces 'ready'. If the
          // peer channel is already up this is not a fresh pairing, and starting
          // a new handshake would destroy the working connection.
          if (isPeerLive()) {
            if (statusRef.current === 'reconnecting') setStatus('connected');
            return;
          }
          isInitiatorRef.current = !!msg.isInitiator;
          setStatus('connected');
          if (msg.isInitiator) {
            await startWebRTC(true);
          }
        } else if (msg.type === 'offer') {
          await handleOffer(msg.payload);
        } else if (msg.type === 'answer') {
          await handleAnswer(msg.payload);
        } else if (msg.type === 'ice-candidate') {
          await handleIceCandidate(msg.payload);
        } else if (msg.type === 'chat') {
          setMessages(prev => {
            if (prev.some(m => m.id === msg.payload.id)) return prev;
            return [...prev, msg.payload];
          });
        } else if (msg.type === 'typing') {
          setIsPeerTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setIsPeerTyping(false), 2500);
        } else if (msg.type === 'name_exchange') {
          setPeerName(msg.payload.userName);
        } else if (msg.type === 'call-signal') {
          callManagerRef.current?.handleCallMessage({ type: 'call-signal', ...msg.payload });
        } else if (msg.type === 'peer-disconnected') {
          // Only the other device's *socket* dropped. They may simply have
          // backgrounded the app; the peer-to-peer link can be perfectly fine.
          if (isPeerLive()) return;
          setStatus('disconnected');
          setErrorMsg('Peer disconnected');
        } else if (msg.type === 'error') {
          setErrorMsg(msg.message);
          setStatus('error');
        }
      } catch (err) {
        console.error("Error parsing WS message", err);
      }
    };

    ws.onerror = (error) => {
      // A socket that has already been replaced (React StrictMode remounts, or a
      // reconnect) still fires onerror as it tears down. Ignore those so a dead
      // socket cannot raise an error banner over a live connection.
      if (wsRef.current !== ws) return;
      console.error('WebSocket error:', error);
      // Only surface this if we never got connected at all. Once the peer link
      // exists, or a retry is already in flight, it is not the user's problem.
      if (!isPeerLive() && reconnectAttemptsRef.current === 0 && statusRef.current === 'connecting') {
        setErrorMsg('Signaling server connection error. If you are in a preview iframe, please open the app in a new tab.');
        setStatus('error');
      }
    };

    ws.onclose = (event) => {
      if (wsRef.current !== ws) return;
      console.log('WebSocket closed:', event.code, event.reason);
      setSignalingState('closed');
      // Backgrounding a tab routinely kills this socket. Keep the session alive
      // while the peer channel is up, and try to bring the socket back.
      if (!isPeerLive() && statusRef.current !== 'error' && statusRef.current !== 'idle') {
        setStatus('reconnecting');
      }
      scheduleReconnect();
    };
  }

  const initSignaling = useCallback((room: string, clientRole: Role) => {
    setStatus('connecting');
    setRole(clientRole);
    setRoomId(room);
    roomIdRef.current = room;
    roleRef.current = clientRole;
    statusRef.current = 'connecting';
    shouldReconnectRef.current = true;
    reconnectAttemptsRef.current = 0;
    // Remember the room so a discarded or reloaded page can rejoin it.
    try {
      sessionStorage.setItem('td:session', JSON.stringify({ room, role: clientRole }));
    } catch { /* private mode */ }
    connectSocket();
  }, []);

  const clearPeerGraceTimer = () => {
    if (peerGraceTimerRef.current) {
      clearTimeout(peerGraceTimerRef.current);
      peerGraceTimerRef.current = null;
    }
  };

  // How long a wobbling peer connection is given to recover before the session
  // is called dead. Backgrounded tabs routinely take several seconds.
  const PEER_GRACE_MS = 20000;

  function startPeerGraceTimer() {
    if (peerGraceTimerRef.current) return;
    peerGraceTimerRef.current = setTimeout(() => {
      peerGraceTimerRef.current = null;
      if (pcRef.current?.connectionState === 'connected' || isPeerLive()) return;
      setStatus('disconnected');
    }, PEER_GRACE_MS);
  }

  // 'failed' is recoverable: ICE can be restarted over the existing connection,
  // which keeps the data channel and any in-flight transfer intact.
  async function attemptIceRestart() {
    const pc = pcRef.current;
    if (!pc || pc.signalingState === 'closed') return;
    // Only the side that made the original offer drives renegotiation.
    if (!isInitiatorRef.current) return;
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (now - lastIceRestartRef.current < 8000) return;
    lastIceRestartRef.current = now;
    try {
      if (typeof pc.restartIce === 'function') pc.restartIce();
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      wsRef.current?.send(JSON.stringify({
        type: 'offer',
        roomId: roomIdRef.current,
        payload: offer,
      }));
    } catch (e) {
      console.error('ICE restart failed', e);
    }
  }

  const createPeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
    }
    iceCandidateQueueRef.current = [];
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:global.stun.twilio.com:3478' },
        { urls: 'stun:openrelay.metered.ca:80' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'ice-candidate',
          roomId: roomIdRef.current,
          payload: event.candidate,
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState);
      if (pcRef.current !== pc) return;

      if (pc.connectionState === 'connected') {
        clearPeerGraceTimer();
        setStatus('connected');
        checkConnectionType(pc);
        return;
      }

      if (pc.connectionState === 'disconnected') {
        // Transient by definition: ICE keeps probing and usually recovers on its
        // own. This is exactly what a backgrounded tab looks like, so give it a
        // grace window instead of declaring the session over.
        setStatus('reconnecting');
        startPeerGraceTimer();
        return;
      }

      if (pc.connectionState === 'failed') {
        setStatus('reconnecting');
        void attemptIceRestart();
        startPeerGraceTimer();
        return;
      }

      if (pc.connectionState === 'closed') {
        clearPeerGraceTimer();
        setStatus('disconnected');
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        setConnectionType('relayed');
      }
    };

    pcRef.current = pc;
    callManagerRef.current?.attachTrackHandler();
    return pc;
  }, []);

  const checkConnectionType = async (pc: RTCPeerConnection) => {
    try {
      const stats = await pc.getStats();
      let type: ConnectionType = 'unknown';
      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          const localCandidate = stats.get(report.localCandidateId);
          if (localCandidate) {
            type = localCandidate.candidateType === 'host' ? 'local' : 'relayed';
          }
        }
      });
      setConnectionType(type);
    } catch (e) {
      console.error(e);
    }
  };

  const startWebRTC = async (isInitiator: boolean) => {
    if (!isInitiator) {
      console.log('Not initiator, waiting for offer...');
      return;
    }
    
    console.log('Is initiator, creating offer...');
    const pc = createPeerConnection();
    
    // Create DataChannel (Sender)
    const dc = pc.createDataChannel('fileTransfer', { ordered: true });
    setupDataChannel(dc);
    
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    wsRef.current?.send(JSON.stringify({
      type: 'offer',
      roomId: roomIdRef.current,
      payload: offer
    }));
  };

  const flushIceQueue = async () => {
    if (pcRef.current && iceCandidateQueueRef.current.length > 0) {
      const queue = [...iceCandidateQueueRef.current];
      iceCandidateQueueRef.current = [];
      for (const candidate of queue) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('Error flushing ice candidate', e);
        }
      }
    }
  };

  const handleOffer = async (offer: RTCSessionDescriptionInit) => {
    const existing = pcRef.current;
    // An offer arriving while the session is live is a renegotiation (an ICE
    // restart), not a new pairing. Reusing the connection keeps the open data
    // channel and any in-flight transfer alive; rebuilding it would kill both.
    const isRenegotiation = !!existing && isPeerLive() && existing.signalingState !== 'closed';
    const pc = isRenegotiation ? existing! : createPeerConnection();

    if (!isRenegotiation) {
      pc.ondatachannel = (event) => {
        setupDataChannel(event.channel);
      };
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    await flushIceQueue();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    wsRef.current?.send(JSON.stringify({
      type: 'answer',
      roomId: roomIdRef.current,
      payload: answer
    }));
  };

  const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
    if (pcRef.current) {
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      flushIceQueue();
    }
  };

  const handleIceCandidate = async (candidate: RTCIceCandidateInit) => {
    if (pcRef.current) {
      if (pcRef.current.remoteDescription && pcRef.current.remoteDescription.type) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('Error adding received ice candidate', e);
        }
      } else {
        iceCandidateQueueRef.current.push(candidate);
      }
    }
  };

  const setupDataChannel = (dc: RTCDataChannel) => {
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = 1024 * 512; // 512 KB threshold
    
    const handleOpen = () => {
      setStatus('connected');
      if (dc.readyState === 'open') {
        dc.send(JSON.stringify({ type: 'name_exchange', userName: userNameRef.current }));
      }
      if (roleRef.current === 'sender' && sendQueueRef.current.length > 0) {
        processSendQueue();
      }
    };

    if (dc.readyState === 'open') {
      handleOpen();
    } else {
      dc.onopen = handleOpen;
    }

    dc.onclose = () => {
      console.log('Data channel closed');
    };

    dc.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        const msg = JSON.parse(event.data);
        if (msg.type === 'name_exchange') {
          setPeerName(msg.userName);
        } else if (msg.type === 'meta') {
          handleFileMetadata(msg);
        } else if (msg.type === 'file-accept') {
          streamFile(msg.fileId);
        } else if (msg.type === 'file-decline') {
          handleFileDecline(msg.fileId);
        } else if (msg.type === 'eof') {
          handleFileEof(msg);
        } else if (msg.type === 'typing') {
          setIsPeerTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setIsPeerTyping(false), 2500);
        } else if (msg.type === 'chat') {
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, {
              id: msg.id,
              senderRole: roleRef.current === 'sender' ? 'receiver' : 'sender',
              text: msg.text,
              timestamp: msg.timestamp
            }];
          });
        } else if (typeof msg.type === 'string' && msg.type.startsWith('call-')) {
          console.log('Received call message:', msg);
          callManagerRef.current?.handleCallMessage(msg);
        }
      } else {
        handleFileChunk(event.data);
      }
    };

    dcRef.current = dc;
  };

  const handleFileMetadata = (meta: FileMetadata) => {
    setStatus('transferring');
    receiveBufferRef.current[meta.fileId] = {
      chunks: [],
      receivedBytes: 0,
      meta,
      writePromise: Promise.resolve()
    };
    setFilesProgress(prev => ({
      ...prev,
      [meta.fileId]: {
        fileId: meta.fileId,
        name: meta.name,
        size: meta.size,
        bytesTransferred: 0,
        status: 'waiting_for_accept'
      }
    }));
    setMessages(prev => [...prev, {
      id: uuidv4(),
      senderRole: roleRef.current === 'sender' ? 'receiver' : 'sender',
      fileId: meta.fileId,
      timestamp: Date.now()
    }]);
  };

  const handleFileChunk = (data: ArrayBuffer) => {
    // Route by the file this peer actually accepted. Scanning for "the first
    // incomplete buffer" misdirects chunks into a previous, abandoned transfer
    // (for example one interrupted by a reconnect) and corrupts the new file.
    const activeFileId =
      activeReceiveIdRef.current && receiveBufferRef.current[activeReceiveIdRef.current]
        ? activeReceiveIdRef.current
        : Object.keys(receiveBufferRef.current).find(
            id => receiveBufferRef.current[id].receivedBytes < receiveBufferRef.current[id].meta.size
          );

    if (activeFileId) {
      const fileBuffer = receiveBufferRef.current[activeFileId];
      if (fileBuffer.stream) {
        fileBuffer.writePromise = fileBuffer.writePromise!.then(() => fileBuffer.stream.write(data));
      } else {
        fileBuffer.chunks.push(data);
      }
      fileBuffer.receivedBytes += data.byteLength;
      
      setFilesProgress(prev => ({
        ...prev,
        [activeFileId]: {
          ...prev[activeFileId],
          bytesTransferred: fileBuffer.receivedBytes
        }
      }));
    }
  };

  const handleFileEof = async (msg: { type: 'eof', fileId: string }) => {
    const fileBuffer = receiveBufferRef.current[msg.fileId];
    if (fileBuffer) {
      let url = '';
      if (fileBuffer.stream) {
        await fileBuffer.writePromise;
        await fileBuffer.stream.close();
      } else {
        const blob = new Blob(fileBuffer.chunks, { type: fileBuffer.meta.mimeType });
        url = URL.createObjectURL(blob);
      }
      
      setFilesProgress(prev => ({
        ...prev,
        [msg.fileId]: {
          ...prev[msg.fileId],
          status: 'complete',
          blobUrl: url
        }
      }));

      // Auto download if it was memory buffered
      if (!fileBuffer.stream && url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = fileBuffer.meta.name;
        a.click();
      }
      
      // Cleanup buffer but keep url for preview if needed
      delete receiveBufferRef.current[msg.fileId];
      if (activeReceiveIdRef.current === msg.fileId) activeReceiveIdRef.current = null;
      
      // Check if all files complete
      if (Object.keys(receiveBufferRef.current).length === 0) {
         setStatus('complete');
      }
    }
  };

  const acceptFileOffer = async (fileId: string) => {
    const fileBuffer = receiveBufferRef.current[fileId];
    if (!fileBuffer) return;

    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: fileBuffer.meta.name,
        });
        fileBuffer.stream = await handle.createWritable();
      } catch (e) {
        console.error('File picker cancelled or failed', e);
        if (e instanceof DOMException && e.name === 'AbortError') {
          declineFileOffer(fileId);
          return;
        }
      }
    }

    activeReceiveIdRef.current = fileId;
    setFilesProgress(prev => ({
      ...prev,
      [fileId]: { ...prev[fileId], status: 'transferring' }
    }));
    dcRef.current?.send(JSON.stringify({ type: 'file-accept', fileId }));
  };

  const declineFileOffer = (fileId: string) => {
    setFilesProgress(prev => ({
      ...prev,
      [fileId]: { ...prev[fileId], status: 'declined' }
    }));
    delete receiveBufferRef.current[fileId];
    if (activeReceiveIdRef.current === fileId) activeReceiveIdRef.current = null;
    dcRef.current?.send(JSON.stringify({ type: 'file-decline', fileId }));
  };

  const handleFileDecline = (fileId: string) => {
    setFilesProgress(prev => ({
      ...prev,
      [fileId]: { ...prev[fileId], status: 'declined' }
    }));
    if (sendQueueRef.current.length > 0 && (sendQueueRef.current[0] as any)._fileId === fileId) {
      sendQueueRef.current.shift();
      processSendQueue();
    }
  };

  const sendFiles = useCallback((files: File[]) => {
    sendQueueRef.current.push(...files);
    
    files.forEach(file => {
      const fileId = uuidv4();
      (file as any)._fileId = fileId; // Attach temporary ID
      setFilesProgress(prev => ({
        ...prev,
        [fileId]: {
          fileId,
          name: file.name,
          size: file.size,
          bytesTransferred: 0,
          status: 'pending'
        }
      }));
      setMessages(prev => [...prev, {
        id: uuidv4(),
        senderRole: roleRef.current,
        fileId: fileId,
        timestamp: Date.now()
      }]);
    });

    if (dcRef.current?.readyState === 'open' && !isSendingRef.current) {
      processSendQueue();
    }
  }, []);

  const processSendQueue = async () => {
    if (sendQueueRef.current.length === 0) {
      isSendingRef.current = false;
      setStatus('complete');
      return;
    }

    isSendingRef.current = true;
    setStatus('transferring');
    const file = sendQueueRef.current[0];
    const fileId = (file as any)._fileId;
    
    const dc = dcRef.current!;
    
    // Send meta (offer)
    const meta: FileMetadata = {
      type: 'meta',
      fileId,
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream'
    };
    dc.send(JSON.stringify(meta));
    
    setFilesProgress(prev => ({
      ...prev,
      [fileId]: { ...prev[fileId], status: 'waiting_for_accept' }
    }));
  };

  const streamFile = async (fileId: string) => {
    if (sendQueueRef.current.length === 0) return;
    const file = sendQueueRef.current[0];
    if ((file as any)._fileId !== fileId) return;

    sendQueueRef.current.shift();

    setFilesProgress(prev => ({
      ...prev,
      [fileId]: { ...prev[fileId], status: 'transferring' }
    }));

    const dc = dcRef.current!;
    const reader = file.stream().getReader();
    let bytesSent = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      let offset = 0;
      while (offset < value.length) {
        const chunk = value.slice(offset, offset + CHUNK_SIZE);
        
        // Backpressure handling
        while (dc.bufferedAmount > 1024 * 1024) { // 1MB buffer limit
          if (dc.readyState !== 'open') break;
          await new Promise(resolve => {
            const onLow = () => {
              dc.removeEventListener('bufferedamountlow', onLow);
              dc.removeEventListener('close', onClose);
              resolve(null);
            };
            const onClose = () => {
              dc.removeEventListener('bufferedamountlow', onLow);
              dc.removeEventListener('close', onClose);
              resolve(null);
            };
            dc.addEventListener('bufferedamountlow', onLow);
            dc.addEventListener('close', onClose);
          });
        }
        if (dc.readyState !== 'open') break;

        dc.send(chunk);
        bytesSent += chunk.length;
        offset += CHUNK_SIZE;
        
        // Update progress occasionally to avoid too many re-renders
        if (bytesSent % (CHUNK_SIZE * 10) === 0 || bytesSent === file.size) {
           setFilesProgress(prev => ({
             ...prev,
             [fileId]: { ...prev[fileId], bytesTransferred: bytesSent }
           }));
        }
      }
    }

    // Send EOF
    if (dc.readyState === 'open') {
      dc.send(JSON.stringify({ type: 'eof', fileId }));
    }
    setFilesProgress(prev => ({
      ...prev,
      [fileId]: { ...prev[fileId], status: 'complete' }
    }));

    // Proceed to next file
    processSendQueue();
  };

  const sendChatMessage = useCallback((text: string) => {
    const msg: ChatMessage = { id: uuidv4(), senderRole: roleRef.current || 'system', text, timestamp: Date.now() };
    // Prefer the peer-to-peer data channel: it is DTLS-encrypted end to end and
    // never reaches the signaling server. Only fall back to the signaling socket
    // when the peer connection is not usable, so messages are not simply lost.
    if (dcRef.current?.readyState === 'open') {
      try {
        dcRef.current.send(JSON.stringify({ type: 'chat', ...msg }));
      } catch (e) {
        console.error('DC send error', e);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'chat', roomId: roomIdRef.current, payload: msg }));
        }
      }
    } else if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'chat', roomId: roomIdRef.current, payload: msg }));
    }
    setMessages(prev => [...prev, msg]);
  }, []);

  const sendTyping = useCallback(() => {
    if (dcRef.current?.readyState === 'open') {
      try { dcRef.current.send(JSON.stringify({ type: 'typing' })); } catch (e) { console.error('DC send error', e); }
    } else if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'typing', roomId: roomIdRef.current }));
    }
  }, []);

  // Page lifecycle. Backgrounding a tab reliably kills the signalling socket
  // and often wobbles the peer connection; on return, recover straight away
  // instead of sitting on a backoff or waiting for a timeout to expire.
  useEffect(() => {
    const recover = () => {
      if (!shouldReconnectRef.current || !roomIdRef.current) return;

      const ws = wsRef.current;
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        reconnectAttemptsRef.current = 0; // resume immediately, not on a backoff
        clearReconnectTimer();
        connectSocket();
      }

      const pc = pcRef.current;
      if (pc && (pc.connectionState === 'failed' || pc.connectionState === 'disconnected')) {
        void attemptIceRestart();
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') recover();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', recover);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', recover);
    };
  }, []);

  // Drop every timer on unmount so a torn-down hook cannot resurrect itself.
  useEffect(() => () => {
    clearReconnectTimer();
    clearPeerGraceTimer();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  }, []);

  const disconnect = useCallback(() => {
    // An explicit teardown: stop trying to come back.
    shouldReconnectRef.current = false;
    reconnectAttemptsRef.current = 0;
    clearReconnectTimer();
    clearPeerGraceTimer();
    try { sessionStorage.removeItem('td:session'); } catch { /* private mode */ }

    // Tear the call down first, otherwise the camera and microphone stay live
    // after the user backs out of a room.
    callManagerRef.current?.cleanupCall();
    if (wsRef.current) wsRef.current.close();
    if (dcRef.current) dcRef.current.close();
    if (pcRef.current) pcRef.current.close();
    setStatus('idle');
    setSignalingState('idle');
    setRole(null);
    setRoomId('');
    setFilesProgress({});
    setMessages([]);
    setErrorMsg(null);
  }, []);

  return {
    role,
    roomId,
    status,
    signalingState,
    connectionType,
    filesProgress,
    messages,
    errorMsg,
    peerName,
    isPeerTyping,
    initSignaling,
    sendFiles,
    acceptFileOffer,
    declineFileOffer,
    sendChatMessage,
    sendTyping,
    disconnect,
    ...callManager,
    callState,
    callMode,
    localStream,
    remoteStream,
    callQuality,
    isScreenSharing,
    isRecording
  };
}
