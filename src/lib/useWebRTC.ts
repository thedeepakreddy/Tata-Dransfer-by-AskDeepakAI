import { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useCallManager } from './useCallManager';

export type Role = 'sender' | 'receiver' | null;
export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'transferring' | 'complete' | 'error' | 'disconnected';
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
  status: 'pending' | 'transferring' | 'complete' | 'error';
  blobUrl?: string;
}

export interface ChatMessage {
  id: string;
  senderRole: Role;
  text?: string;
  fileId?: string;
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
  const [connectionType, setConnectionType] = useState<ConnectionType>('unknown');
  const [filesProgress, setFilesProgress] = useState<Record<string, FileProgress>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [peerName, setPeerName] = useState<string>('');

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
  const recorderHandleRef = useRef<{ stop: () => Promise<Blob> } | null>(null);
  const callManagerRef = useRef<ReturnType<typeof useCallManager> | null>(null);

  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);

  const callManager = useCallManager(
    pcRef, wsRef, dcRef, userNameRef, setMessages, roleRef,
    callState, setCallState, callMode, setCallMode,
    localStream, setLocalStream, remoteStream, setRemoteStream,
    callQuality, setCallQuality, isScreenSharing, setIsScreenSharing,
    isRecording, setIsRecording
  );
  callManagerRef.current = callManager;

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  
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
  const receiveBufferRef = useRef<Record<string, { chunks: ArrayBuffer[], receivedBytes: number, meta: FileMetadata }>>({});

  const getWsUrl = () => {
    return 'wss://tata-dransfer-by-askdeepakai.onrender.com';
  };

  const initSignaling = useCallback((room: string, clientRole: Role) => {
    setStatus('connecting');
    setRole(clientRole);
    setRoomId(room);
    roomIdRef.current = room;
    roleRef.current = clientRole;
    statusRef.current = 'connecting';
    
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', roomId: room }));
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'ready') {
          if (clientRole === 'sender') {
            await startWebRTC();
          }
        } else if (msg.type === 'offer') {
          await handleOffer(msg.payload);
        } else if (msg.type === 'answer') {
          await handleAnswer(msg.payload);
        } else if (msg.type === 'ice-candidate') {
          await handleIceCandidate(msg.payload);
        } else if (msg.type === 'peer-disconnected') {
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
      console.error('WebSocket error:', error);
      setErrorMsg('Signaling server connection error. If you are in a preview iframe, please open the app in a new tab.');
      setStatus('error');
    };

    ws.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason);
      setStatus(prev => prev !== 'error' ? 'disconnected' : prev);
    };
  }, []);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
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
      if (pc.connectionState === 'connected') {
        setStatus('connected');
        checkConnectionType(pc);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setStatus('disconnected');
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        setErrorMsg('Connection failed. Try switching both devices to the same WiFi network.');
        setStatus('error');
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

  const startWebRTC = async () => {
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

  const handleOffer = async (offer: RTCSessionDescriptionInit) => {
    const pc = createPeerConnection();
    
    pc.ondatachannel = (event) => {
      setupDataChannel(event.channel);
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
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
    }
  };

  const handleIceCandidate = async (candidate: RTCIceCandidateInit) => {
    if (pcRef.current) {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('Error adding received ice candidate', e);
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
        } else if (msg.type === 'eof') {
          handleFileEof(msg);
        } else if (msg.type === 'chat') {
          setMessages(prev => [...prev, {
            id: msg.id,
            senderRole: roleRef.current === 'sender' ? 'receiver' : 'sender',
            text: msg.text,
            timestamp: msg.timestamp
          }]);
        } else if (msg.type.startsWith('call-')) {
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
      meta
    };
    setFilesProgress(prev => ({
      ...prev,
      [meta.fileId]: {
        fileId: meta.fileId,
        name: meta.name,
        size: meta.size,
        bytesTransferred: 0,
        status: 'transferring'
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
    // Find the current active file
    const activeFileId = Object.keys(receiveBufferRef.current).find(
      id => receiveBufferRef.current[id].receivedBytes < receiveBufferRef.current[id].meta.size
    );
    
    if (activeFileId) {
      const fileBuffer = receiveBufferRef.current[activeFileId];
      fileBuffer.chunks.push(data);
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

  const handleFileEof = (msg: { type: 'eof', fileId: string }) => {
    const fileBuffer = receiveBufferRef.current[msg.fileId];
    if (fileBuffer) {
      const blob = new Blob(fileBuffer.chunks, { type: fileBuffer.meta.mimeType });
      const url = URL.createObjectURL(blob);
      
      setFilesProgress(prev => ({
        ...prev,
        [msg.fileId]: {
          ...prev[msg.fileId],
          status: 'complete',
          blobUrl: url
        }
      }));

      // Auto download
      const a = document.createElement('a');
      a.href = url;
      a.download = fileBuffer.meta.name;
      a.click();
      
      // Cleanup buffer but keep url for preview if needed
      delete receiveBufferRef.current[msg.fileId];
      
      // Check if all files complete
      if (Object.keys(receiveBufferRef.current).length === 0) {
         setStatus('complete');
      }
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
    const file = sendQueueRef.current.shift()!;
    const fileId = (file as any)._fileId;
    
    const dc = dcRef.current!;
    
    // Send meta
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
      [fileId]: { ...prev[fileId], status: 'transferring' }
    }));

    // Read and send chunks
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
    dc.send(JSON.stringify({ type: 'eof', fileId }));
    setFilesProgress(prev => ({
      ...prev,
      [fileId]: { ...prev[fileId], status: 'complete' }
    }));

    // Proceed to next file
    processSendQueue();
  };

  const sendChatMessage = useCallback((text: string) => {
    const msgId = uuidv4();
    const chatMsg = { type: 'chat', id: msgId, text, timestamp: Date.now() };
    if (dcRef.current?.readyState === 'open') {
      dcRef.current.send(JSON.stringify(chatMsg));
    }
    
    setMessages(prev => [...prev, {
      id: msgId,
      senderRole: roleRef.current,
      text,
      timestamp: chatMsg.timestamp
    }]);
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    if (dcRef.current) dcRef.current.close();
    if (pcRef.current) pcRef.current.close();
    setStatus('idle');
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
    connectionType,
    filesProgress,
    messages,
    errorMsg,
    peerName,
    initSignaling,
    sendFiles,
    sendChatMessage,
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
