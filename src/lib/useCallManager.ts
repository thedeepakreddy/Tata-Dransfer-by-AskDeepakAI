import { useState, useRef, useCallback, useEffect } from 'react';
import type { CallMode, CallState, CallQuality, ChatMessage, Role } from './useWebRTC';
import { v4 as uuidv4 } from 'uuid';

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

const BITRATE_720P = 2_500_000;
const BITRATE_480P = 1_200_000;
const AUDIO_BITRATE = 64_000;

export function useCallManager(
  pcRef: React.MutableRefObject<RTCPeerConnection | null>,
  wsRef: React.MutableRefObject<WebSocket | null>,
  dcRef: React.MutableRefObject<RTCDataChannel | null>,
  userNameRef: React.MutableRefObject<string>,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  roleRef: React.MutableRefObject<Role>,
  callState: CallState,
  setCallState: React.Dispatch<React.SetStateAction<CallState>>,
  callMode: CallMode,
  setCallMode: React.Dispatch<React.SetStateAction<CallMode>>,
  localStream: MediaStream | null,
  setLocalStream: React.Dispatch<React.SetStateAction<MediaStream | null>>,
  remoteStream: MediaStream | null,
  setRemoteStream: React.Dispatch<React.SetStateAction<MediaStream | null>>,
  callQuality: CallQuality | null,
  setCallQuality: React.Dispatch<React.SetStateAction<CallQuality | null>>,
  isScreenSharing: boolean,
  setIsScreenSharing: React.Dispatch<React.SetStateAction<boolean>>,
  isRecording: boolean,
  setIsRecording: React.Dispatch<React.SetStateAction<boolean>>
) {

  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const qualityMonitorHandleRef = useRef<NodeJS.Timeout | null>(null);
  const activeResolutionTierRef = useRef<'720p'|'480p'>('720p');
  const isCallerRef = useRef(false);
  const callStartTimeRef = useRef<number>(0);

  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);

  const sendCallSignal = useCallback((type: string, payload: any = {}) => {
    if (dcRef.current?.readyState === 'open') {
      console.log('Sending call signal:', type, payload);
      dcRef.current.send(JSON.stringify({ type, ...payload }));
    } else {
      console.log('Cannot send call signal, data channel not open');
    }
  }, [dcRef]);

  const startLocalMedia = useCallback(async (mode: CallMode) => {
    if (mode === 'audio') {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      setLocalStream(stream);
      return stream;
    } else {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: VIDEO_CONSTRAINTS_HD,
        });
        activeResolutionTierRef.current = '720p';
      } catch (err: any) {
        if (err.name === 'OverconstrainedError' || err.name === 'NotReadableError') {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: VIDEO_CONSTRAINTS_FALLBACK,
          });
          activeResolutionTierRef.current = '480p';
        } else {
          throw err;
        }
      }
      setLocalStream(stream);
      return stream;
    }
  }, [setLocalStream]);

  const configureVideoSender = useCallback((sender: RTCRtpSender) => {
    const params = sender.getParameters();
    if (!params.encodings) params.encodings = [{}];
    params.encodings[0].maxBitrate = activeResolutionTierRef.current === '720p' ? BITRATE_720P : BITRATE_480P;
    // @ts-ignore
    params.degradationPreference = 'maintain-resolution';
    sender.setParameters(params).catch(() => {});

    if (pcRef.current) {
      const transceiver = pcRef.current.getTransceivers().find(t => t.sender === sender);
      if (transceiver && transceiver.setCodecPreferences && window.RTCRtpSender?.getCapabilities) {
        const caps = RTCRtpSender.getCapabilities('video');
        if (caps) {
          const h264 = caps.codecs.filter(c => c.mimeType === 'video/H264');
          const others = caps.codecs.filter(c => c.mimeType !== 'video/H264');
          if (h264.length) transceiver.setCodecPreferences([...h264, ...others]);
        }
      }
    }
  }, [pcRef]);

  const configureAudioSender = useCallback((sender: RTCRtpSender) => {
    const params = sender.getParameters();
    if (!params.encodings) params.encodings = [{}];
    params.encodings[0].maxBitrate = AUDIO_BITRATE;
    sender.setParameters(params).catch(() => {});
  }, []);

  const attachMediaToConnection = useCallback((stream: MediaStream) => {
    if (!pcRef.current) return;
    stream.getTracks().forEach(track => {
      const sender = pcRef.current!.addTrack(track, stream);
      if (track.kind === 'video') configureVideoSender(sender);
      if (track.kind === 'audio') configureAudioSender(sender);
    });
  }, [pcRef, configureVideoSender, configureAudioSender]);

  const getConnectionQuality = useCallback(async () => {
    if (!pcRef.current) return null;
    const stats = await pcRef.current.getStats();
    let candidatePair: any = null;
    let inboundVideo: any = null;

    stats.forEach((report) => {
      if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
        candidatePair = report;
      }
      if (report.type === 'inbound-rtp' && report.kind === 'video') {
        inboundVideo = report;
      }
    });

    let pathLabel = 'Connecting…';
    if (candidatePair) {
      const localCandidate = stats.get(candidatePair.localCandidateId);
      pathLabel = localCandidate?.candidateType === 'host' ? 'Local WiFi ⚡' : 'Relayed 🌐';
    }

    let qualityTier = 'Low';
    if (inboundVideo) {
      const height = inboundVideo.frameHeight || 0;
      const lost = inboundVideo.packetsLost || 0;
      const received = inboundVideo.packetsReceived || 1;
      const lossRate = lost / (lost + received);

      if (height >= 720 && lossRate < 0.02) qualityTier = 'HD';
      else if (height >= 480 && lossRate < 0.05) qualityTier = 'Standard';
      else qualityTier = 'Low';
    } else {
      qualityTier = 'Voice';
    }

    return { qualityTier, pathLabel };
  }, [pcRef]);

  const stopQualityMonitor = useCallback(() => {
    if (qualityMonitorHandleRef.current) {
      clearInterval(qualityMonitorHandleRef.current);
      qualityMonitorHandleRef.current = null;
    }
  }, []);

  const startQualityMonitor = useCallback(() => {
    if (qualityMonitorHandleRef.current) return;
    qualityMonitorHandleRef.current = setInterval(async () => {
      const quality = await getConnectionQuality();
      if (quality) setCallQuality(quality);
    }, 2000);
  }, [getConnectionQuality, setCallQuality]);

  const cleanupCall = useCallback(() => {
    stopQualityMonitor();
    setIsScreenSharing(false);
    setIsRecording(false);
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    if (cameraTrackRef.current) {
      cameraTrackRef.current.stop();
      cameraTrackRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.getSenders().forEach(sender => {
        if (sender.track) pcRef.current!.removeTrack(sender);
      });
    }
    setRemoteStream(null);
    setCallMode(null);
  }, [pcRef, stopQualityMonitor, setIsScreenSharing, setIsRecording, setLocalStream, setRemoteStream, setCallMode]);

  // Use a ref for callMode since it's accessed in the callback
  const callModeRef = useRef<CallMode>(null);
  useEffect(() => { callModeRef.current = callMode; }, [callMode]);

  const logCall = useCallback((reason: 'ended' | 'missed' | 'rejected') => {
    let text = '';
    const modeStr = callModeRef.current === 'video' ? 'Video call' : 'Voice call';
    if (reason === 'missed') {
      text = `Missed ${callModeRef.current === 'video' ? 'video' : 'voice'} call`;
    } else if (reason === 'rejected') {
      text = `${modeStr} declined`;
    } else {
      if (callStartTimeRef.current > 0) {
        const durationSeconds = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
        const mins = Math.floor(durationSeconds / 60);
        const secs = durationSeconds % 60;
        const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        text = `${modeStr} ended (${durationStr})`;
      } else {
        text = `${modeStr} ended`;
      }
    }
    
    setMessages(prev => [...prev, {
      id: uuidv4(),
      senderRole: 'system',
      text,
      isSystemMessage: true,
      timestamp: Date.now()
    }]);
    callStartTimeRef.current = 0;
  }, [setMessages]);

  const handleCallMessage = useCallback((msg: any) => {
    switch (msg.type) {
      case 'call-request':
        setCallMode(msg.mode);
        isCallerRef.current = false;
        setCallState('incoming');
        break;

      case 'call-accept':
        startLocalMedia(callModeRef.current).then(async (stream) => {
          attachMediaToConnection(stream);
          if (pcRef.current && wsRef.current) {
            const offer = await pcRef.current.createOffer();
            await pcRef.current.setLocalDescription(offer);
            
            // Re-negotiate via websocket just like normal setup
            // QuickShare signaling server handles this because when we send 'offer', the server relays it.
            // Wait, we need to pass the roomId! The existing handleOffer expects a roomId, but useCallManager doesn't have it.
            // Let's pass roomId to useCallManager or just send it if it's stored in ws state?
            // Actually, we can send it via DataChannel instead!
            sendCallSignal('call-offer', { sdp: offer });
          }
          setCallState('connecting');
        });
        break;
        
      case 'call-offer':
        // Handling renegotiation over data channel
        if (pcRef.current) {
          pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp)).then(async () => {
            const answer = await pcRef.current!.createAnswer();
            await pcRef.current!.setLocalDescription(answer);
            sendCallSignal('call-answer', { sdp: answer });
          });
        }
        break;
        
      case 'call-answer':
        if (pcRef.current) {
          pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        }
        break;

      case 'call-reject':
        logCall('rejected');
        setCallState('rejected');
        cleanupCall();
        setTimeout(() => setCallState('idle'), 2000);
        break;

      case 'call-end':
        logCall('ended');
        setCallState('ended');
        cleanupCall();
        setTimeout(() => setCallState('idle'), 2000);
        break;
    }
  }, [startLocalMedia, attachMediaToConnection, cleanupCall, pcRef, wsRef, setCallMode, setCallState, sendCallSignal]);

  const startCall = useCallback((mode: CallMode) => {
    setCallMode(mode);
    isCallerRef.current = true;
    sendCallSignal('call-request', { mode });
    setCallState('ringing');
  }, [sendCallSignal, setCallMode, setCallState]);

  const acceptCall = useCallback(async () => {
    const stream = await startLocalMedia(callModeRef.current);
    attachMediaToConnection(stream);
    sendCallSignal('call-accept');
    setCallState('connecting');
  }, [startLocalMedia, attachMediaToConnection, sendCallSignal, setCallState]);

  const rejectCall = useCallback(() => {
    logCall('rejected');
    sendCallSignal('call-reject');
    setCallMode(null);
    setCallState('idle');
  }, [sendCallSignal, setCallMode, setCallState, logCall]);

  const endCall = useCallback(() => {
    logCall('ended');
    sendCallSignal('call-end');
    cleanupCall();
    setCallState('ended');
    setTimeout(() => setCallState('idle'), 2000);
  }, [sendCallSignal, cleanupCall, setCallState, logCall]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return false;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) audioTrack.enabled = !audioTrack.enabled;
    return audioTrack ? !audioTrack.enabled : false;
  }, []);

  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return false;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) videoTrack.enabled = !videoTrack.enabled;
    return videoTrack ? !videoTrack.enabled : false;
  }, []);

  const startScreenShare = useCallback(async () => {
    if (!pcRef.current) return;
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
      const screenTrack = screenStream.getVideoTracks()[0];

      const videoSender = pcRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
      if (!videoSender) return;

      cameraTrackRef.current = videoSender.track;
      await videoSender.replaceTrack(screenTrack);
      screenTrack.contentHint = 'detail';

      setIsScreenSharing(true);
      setLocalStream(screenStream);

      screenTrack.onended = () => stopScreenShare();
    } catch (e) {
      console.error('Screen share error', e);
    }
  }, [pcRef, setIsScreenSharing, setLocalStream]);

  const stopScreenShare = useCallback(async () => {
    if (!isScreenSharing || !pcRef.current) return;
    const videoSender = pcRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
    if (videoSender && cameraTrackRef.current) {
      await videoSender.replaceTrack(cameraTrackRef.current);
    }
    setIsScreenSharing(false);
    if (localStreamRef.current) setLocalStream(localStreamRef.current);
  }, [isScreenSharing, pcRef, setIsScreenSharing, setLocalStream]);

  const attachTrackHandler = useCallback(() => {
    if (!pcRef.current) return;
    pcRef.current.ontrack = (event) => {
      setRemoteStream(prev => {
        const newStream = new MediaStream();
        if (prev) {
          prev.getTracks().forEach(t => newStream.addTrack(t));
        }
        const incomingTracks = event.streams && event.streams[0] ? event.streams[0].getTracks() : [event.track];
        incomingTracks.forEach(t => {
          if (!newStream.getTracks().find(nt => nt.id === t.id)) {
            newStream.addTrack(t);
          }
        });
        return newStream;
      });
        if (callStartTimeRef.current === 0) {
          callStartTimeRef.current = Date.now();
        }
        setCallState('active');
        startQualityMonitor();
    };
  }, [pcRef, setRemoteStream, setCallState, startQualityMonitor]);

  const startRecording = useCallback(({ localVideoEl, remoteVideoEl }: { localVideoEl: HTMLVideoElement | null, remoteVideoEl: HTMLVideoElement | null }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    let drawing = true;
    function drawFrame() {
      if (!drawing) return;
      if (ctx) {
        ctx.fillStyle = '#14181C';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (remoteVideoEl && remoteVideoEl.readyState >= 2) {
          ctx.drawImage(remoteVideoEl, 0, 0, canvas.width, canvas.height);
        }
        if (localVideoEl && localVideoEl.readyState >= 2) {
          const pipW = 240, pipH = 135;
          ctx.drawImage(localVideoEl, canvas.width - pipW - 16, canvas.height - pipH - 16, pipW, pipH);
        }
      }
      requestAnimationFrame(drawFrame);
    }
    drawFrame();

    // @ts-ignore
    const canvasStream = canvas.captureStream(30);
    const audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();
    
    if (localStreamRef.current?.getAudioTracks().length) {
      audioCtx.createMediaStreamSource(new MediaStream(localStreamRef.current.getAudioTracks())).connect(dest);
    }
    if (remoteStream?.getAudioTracks().length) {
      audioCtx.createMediaStreamSource(new MediaStream(remoteStream.getAudioTracks())).connect(dest);
    }

    const mixedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);

    const chunks: BlobPart[] = [];
    // @ts-ignore
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm';
    const recorder = new MediaRecorder(mixedStream, { mimeType, videoBitsPerSecond: 2_000_000 });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.start(1000);

    setIsRecording(true);

    return {
      stop: () => new Promise<Blob>((resolve) => {
        drawing = false;
        recorder.onstop = () => {
          audioCtx.close();
          setIsRecording(false);
          resolve(new Blob(chunks, { type: 'video/webm' }));
        };
        recorder.stop();
      }),
    };
  }, [remoteStream, setIsRecording]);

  const packageRecordingForChat = useCallback((blob: Blob) => {
    const filename = `call-recording-${Date.now()}.webm`;
    return {
      type: 'local-recording',
      filename,
      blob,
      objectUrl: URL.createObjectURL(blob),
      sizeBytes: blob.size,
      timestamp: Date.now(),
    };
  }, []);

  return {
    handleCallMessage,
    attachTrackHandler,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    startRecording,
    packageRecordingForChat,
  };
}
