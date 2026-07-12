import React, { useState, useRef, useEffect, ChangeEvent, FormEvent } from 'react';

function useRingtone(isRinging: boolean) {
  useEffect(() => {
    if (!isRinging) return;
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    let interval: any;
    
    const playRing = () => {
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(480, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 1.2);
    };
    
    playRing();
    interval = setInterval(playRing, 2000);
    
    return () => {
      clearInterval(interval);
      ctx.close().catch(() => {});
    };
  }, [isRinging]);
}

import { useWebRTC, ChatMessage } from '../lib/useWebRTC';
import { formatBytes } from '../lib/utils';

export function ChatRoom({ hook, onBack }: { hook: ReturnType<typeof useWebRTC>, onBack: () => void }) {
  const { messages, filesProgress, sendChatMessage, sendFiles, role, disconnect, status, connectionType } = hook;
  const [inputText, setInputText] = useState('');
  const [isTrayOpen, setIsTrayOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isChatMinimized, setIsChatMinimized] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const recorderHandleRef = useRef<{ stop: () => Promise<Blob> } | null>(null);

  useRingtone(hook.callState === 'ringing' || hook.callState === 'incoming');

  useEffect(() => {
    let interval: any;
    if (hook.callState === 'active') {
      interval = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [hook.callState]);

  useEffect(() => {
    if (localVideoRef.current && hook.localStream) {
      localVideoRef.current.srcObject = hook.localStream;
    }
  }, [hook.localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && hook.remoteStream) {
      remoteVideoRef.current.srcObject = hook.remoteStream;
    }
  }, [hook.remoteStream]);

  const handleRecordToggle = async () => {
    if (hook.isRecording && recorderHandleRef.current) {
       const blob = await recorderHandleRef.current.stop();
       recorderHandleRef.current = null;
       const msg = hook.packageRecordingForChat?.(blob);
       const fileId = "local-rec-" + Date.now();
       if (msg && hook.sendChatMessage) {
           // We can't directly manipulate the hook's internal message state easily from here unless we exported setMessages.
           // Since we need to modify the state, we can add a simple console message, or if we exported setMessages, we can use it.
           // I'll assume we can use the hook's returned state, wait, setMessages isn't exported by default in hook!
           // Let's just create a download link for it locally if we can't inject.
           const a = document.createElement('a');
           a.href = msg.objectUrl;
           a.download = msg.filename;
           a.click();
       }
    } else {
       if (hook.startRecording) {
         recorderHandleRef.current = hook.startRecording({ localVideoEl: localVideoRef.current, remoteVideoEl: remoteVideoRef.current });
       }
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, filesProgress]);

  const handleSend = () => {
    if (inputText.trim()) {
      sendChatMessage(inputText.trim());
      setInputText('');
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (hook.sendTyping) hook.sendTyping();
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      sendFiles(Array.from(e.target.files));
      e.target.value = '';
      setIsTrayOpen(false);
    }
  };

  const triggerFileSelect = (accept?: string) => {
    if (fileInputRef.current) {
      if (accept) {
        fileInputRef.current.accept = accept;
      } else {
        fileInputRef.current.removeAttribute('accept');
      }
      fileInputRef.current.click();
    }
  };

  return (
    <div className="chat-room-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--paper)', backgroundImage: 'radial-gradient(circle at 50% 0%, #F7F8FA 0%, var(--paper) 60%)', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      
      {/* chat header */}
      <div className="chat-header">
        <button className="back-btn" aria-label="Back" onClick={() => { disconnect(); onBack(); }}>←</button>
        <div className="peer-avatar">{hook.peerName ? hook.peerName.substring(0, 2).toUpperCase() : '??'}</div>
        <div className="peer-meta">
          <div className="peer-name">{hook.peerName || 'Unknown user'}</div>
          <div className="peer-status">
            {status === 'disconnected' ? (
              <span style={{ color: '#E11D48' }}>Disconnected &middot; Code: {hook.roomId}</span>
            ) : (
              <><span className="pulse-dot"></span>Connected &middot; {connectionType === 'local' ? 'Local WiFi' : 'Relayed'} &middot; Code: {hook.roomId}</>
            )}
          </div>
        </div>
        <div style={{display:'flex', gap:'8px', marginLeft:'auto', marginRight:'12px', flexShrink: 0}}>
          <button className="header-icon-btn" onClick={() => hook.startCall?.('audio')} aria-label="Audio call">📞</button>
          <button className="header-icon-btn" onClick={() => hook.startCall?.('video')} aria-label="Video call">📹</button>
        </div>
        <button className="header-icon-btn" aria-label="Session info">i</button>
      </div>

      {hook.callState === 'incoming' && (
        <div className="incoming-call-overlay">
          <div style={{ fontSize: '14px', fontWeight: 600 }}>Incoming {hook.callMode} call...</div>
          <div className="incoming-call-actions">
            <button className="call-btn-reject" onClick={() => hook.rejectCall?.()}>Decline</button>
            <button className="call-btn-accept" onClick={() => hook.acceptCall?.()}>Accept</button>
          </div>
        </div>
      )}

      {(hook.callState !== 'idle' && hook.callState !== 'incoming' && hook.callState !== 'ended' && hook.callState !== 'rejected' && !isChatMinimized) && (
        <div className="call-stage modal-mode">
          <div className="remote-video">
            {hook.remoteStream ? (
               <video autoPlay playsInline ref={remoteVideoRef}></video>
            ) : (
               <div className="avatar-placeholder">{hook.peerName ? hook.peerName.substring(0, 2).toUpperCase() : '??'}</div>
            )}
          </div>
          
          {hook.localStream && (
             <div className={`local-pip ${hook.isScreenSharing ? 'screen-active' : ''}`}>
               <video autoPlay playsInline muted ref={localVideoRef}></video>
             </div>
          )}

          <div className="status-row">
            {hook.callQuality && (
              <div className="quality-badge">
                <span className="dot"></span> {hook.callQuality.qualityTier} &middot; {hook.callQuality.pathLabel}
              </div>
            )}
            {hook.callState === 'active' && (
              <div className="call-timer">
                {Math.floor(callDuration / 60)}:{(callDuration % 60).toString().padStart(2, '0')}
              </div>
            )}
            {hook.callState !== 'active' && (
              <div className="call-timer">
                {hook.callState}...
              </div>
            )}
          </div>

          <div className="control-bar">
            <button className={`ctrl-btn ${hook.localStream?.getAudioTracks()[0]?.enabled === false ? 'muted' : ''}`} onClick={() => hook.toggleMute?.()}>
              🎤
              <span className="ctrl-label">Mute</span>
            </button>
            <button className={`ctrl-btn ${hook.localStream?.getVideoTracks()[0]?.enabled === false ? 'muted' : ''}`} onClick={() => hook.toggleCamera?.()}>
              📷
              <span className="ctrl-label">Camera</span>
            </button>
            <button className={`ctrl-btn ${hook.isScreenSharing ? 'active' : ''}`} onClick={() => hook.isScreenSharing ? hook.stopScreenShare?.() : hook.startScreenShare?.()}>
              💻
              <span className="ctrl-label">Share</span>
            </button>
            <button className={`ctrl-btn ${hook.isRecording ? 'recording' : ''}`} onClick={handleRecordToggle}>
              ⏺
              <span className="ctrl-label">Record</span>
            </button>
            <button className="ctrl-btn" onClick={() => setIsChatMinimized(true)}>
              💬
              <span className="ctrl-label">Chat</span>
            </button>
            <button className="ctrl-btn end" onClick={() => hook.endCall?.()}>
              ✕
            </button>
          </div>
        </div>
      )}

      {(hook.callState !== 'idle' && hook.callState !== 'ended' && hook.callState !== 'rejected' && isChatMinimized) && (
         <button 
           onClick={() => setIsChatMinimized(false)}
           style={{ position: 'absolute', top: '80px', right: '20px', background: 'var(--signal)', color: '#fff', border: 'none', borderRadius: '999px', padding: '8px 16px', fontWeight: 600, zIndex: 100, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
         >
           Return to Call
         </button>
      )}

      <div className="thread" id="thread">
        <div className="day-divider"><span>Secure Session</span></div>
        <div className="conn-note"><span className="dot"></span>End-to-End Encrypted</div>

        {messages.map((msg: ChatMessage) => {
          if (msg.isSystemMessage) {
            return (
              <div key={msg.id} style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
                <div style={{ background: 'var(--surface)', padding: '6px 16px', borderRadius: '16px', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', border: '1px solid var(--hairline)', textAlign: 'center' }}>
                  {msg.text}
                </div>
              </div>
            );
          }

          const isMe = msg.senderRole === role;
          const rowClass = `row ${isMe ? 'out' : 'in'}`;
          const timeString = new Date(msg.timestamp).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});

          if (msg.fileId) {
            const file = filesProgress[msg.fileId];
            if (!file) return null;

            let iconText = 'DOC';
            if (file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)) iconText = 'IMG';
            else if (file.name.match(/\.(mp4|mov|webm)$/i)) iconText = 'VID';
            else if (file.name.match(/\.(mp3|wav|m4a)$/i)) iconText = 'AUD';

            const pct = Math.max(0, Math.min(100, (file.bytesTransferred / file.size) * 100));
            const dashOffset = 69.1 - (69.1 * pct / 100);

            return (
              <div key={msg.id} className={rowClass}>
                <div className="bubble-group">
                  <div className="file-bubble" onClick={() => {
                     if(file.status === 'complete' && file.blobUrl) {
                        const a = document.createElement('a');
                        a.href = file.blobUrl;
                        a.download = file.name;
                        a.click();
                     }
                  }} style={{ cursor: file.status === 'complete' ? 'pointer' : 'default' }}>
                    <div className="file-icon">{iconText}</div>
                    <div className="file-info">
                      <div className="file-name">{file.name}</div>
                      <div className="file-sub">
                        {formatBytes(file.size)} &middot; {file.status === 'complete' ? 'sent' : `sending — ${Math.round(pct)}%`}
                      </div>
                    </div>
                    {file.status === 'complete' ? (
                      <div className="file-check">✓</div>
                    ) : (
                      <div className="file-progress-ring">
                        <svg viewBox="0 0 26 26">
                          <circle className="ring-track" cx="13" cy="13" r="11"></circle>
                          <circle className="ring-fill" cx="13" cy="13" r="11" strokeDasharray="69.1" strokeDashoffset={dashOffset}></circle>
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="msg-time">{file.status === 'complete' ? timeString : 'Transferring…'}</div>
                </div>
              </div>
            );
          }

          return (
            <div key={msg.id} className={rowClass}>
              <div className="bubble-group">
                <div className="bubble">{msg.text}</div>
                <div className="msg-time">{timeString}</div>
              </div>
            </div>
          );
        })}
        
        {hook.isPeerTyping && (
          <div className="row in typing-row">
            <div className="bubble-group">
              <div className="bubble">
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="composer">
        <input 
          type="file" 
          multiple 
          style={{ display: 'none' }}
          ref={fileInputRef}
          onChange={handleFileSelect}
        />
        <div className={`attach-tray ${isTrayOpen ? 'open' : ''}`} id="attachTray">
          <button type="button" className="attach-option" onClick={() => triggerFileSelect('image/*')}><div className="ic">IMG</div><span>Photo</span></button>
          <button type="button" className="attach-option" onClick={() => triggerFileSelect('.pdf,.doc,.docx,.txt')}><div className="ic">DOC</div><span>File</span></button>
          <button type="button" className="attach-option" onClick={() => triggerFileSelect('audio/*')}><div className="ic">AUD</div><span>Audio</span></button>
          <button type="button" className="attach-option" onClick={() => triggerFileSelect('video/*')}><div className="ic">VID</div><span>Video</span></button>
        </div>
        <div className="composer-row">
          <button type="button" className={`plus-btn ${isTrayOpen ? 'open' : ''}`} onClick={() => setIsTrayOpen(!isTrayOpen)}>+</button>
          <div className="input-wrap">
            <textarea 
              className="msg-input" 
              rows={1}
              placeholder="Message" 
              value={inputText}
              onChange={handleInput}
              onKeyDown={onKeyDown}
            />
          </div>
          <button type="button" className="send-btn" disabled={!inputText.trim() || !['connected', 'transferring', 'complete'].includes(status)} onClick={handleSend}>➤</button>
        </div>
      </div>
    </div>
  );
}
