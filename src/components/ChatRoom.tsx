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

/* ---------- icons ---------- */
const svg = (d: string, extra?: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
    {extra}
  </svg>
);

const Ico = {
  back: svg('m15 18-6-6 6-6'),
  send: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.2 15 12 3.4 13.8Z" />
    </svg>
  ),
  image: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="8.8" cy="9.6" r="1.6" />
      <path d="m4 16.5 4.4-4a2 2 0 0 1 2.7 0L20 20" />
    </svg>
  ),
  video: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
      <path d="m15.5 10.4 6-3.2v9.6l-6-3.2" />
    </svg>
  ),
  audio: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l10-2v13" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </svg>
  ),
  doc: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
    </svg>
  ),
  mic: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
    </svg>
  ),
  cam: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
      <path d="m15.5 10.4 6-3.2v9.6l-6-3.2" />
    </svg>
  ),
  screen: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="4" width="19" height="13" rx="2.5" />
      <path d="M8.5 21h7" />
    </svg>
  ),
  record: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.5 12a8 8 0 0 1-11.6 7.1L3.5 20.5l1.4-5.4A8 8 0 1 1 20.5 12Z" />
    </svg>
  ),
  hangup: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
};

type FileKind = 'img' | 'vid' | 'aud' | 'doc';
const FILE_ICON: Record<FileKind, React.ReactNode> = {
  img: Ico.image,
  vid: Ico.video,
  aud: Ico.audio,
  doc: Ico.doc,
};


export function ChatRoom({ hook, onBack }: { hook: ReturnType<typeof useWebRTC>, onBack: () => void }) {
  const { messages, filesProgress, sendChatMessage, sendFiles, role, disconnect, status, connectionType } = hook;
  const [inputText, setInputText] = useState('');
  const [isTrayOpen, setIsTrayOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const [isChatMinimized, setIsChatMinimized] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const recorderHandleRef = useRef<{ stop: () => Promise<Blob> } | null>(null);

  useRingtone(hook.callState === 'ringing' || hook.callState === 'incoming');

  useEffect(() => {
    if (hook.callState === 'idle' || hook.callState === 'ended' || hook.callState === 'rejected') {
      setIsChatMinimized(false);
    }
  }, [hook.callState]);

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
      // A recording belongs to the device that made it, so it is saved straight
      // to disk rather than pushed across the transfer channel.
      const rec = hook.packageRecordingForChat?.(blob);
      if (rec) {
        const a = document.createElement('a');
        a.href = rec.objectUrl;
        a.download = rec.filename;
        a.click();
        // Give the browser time to start the download before releasing the URL.
        setTimeout(() => URL.revokeObjectURL(rec.objectUrl), 60_000);
      }
      return;
    }

    recorderHandleRef.current =
      hook.startRecording?.({
        localVideoEl: localVideoRef.current,
        remoteVideoEl: remoteVideoRef.current,
      }) ?? null;
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, filesProgress]);

  const handleSend = () => {
    if (inputText.trim()) {
      sendChatMessage(inputText.trim());
      setInputText('');
      // the textarea auto-grows as you type; collapse it back to one row
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
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
    <div className="chat-room-container">
      
      {/* chat header */}
      <div className="chat-header">
        <button className="back-btn" aria-label="Back" onClick={() => { disconnect(); onBack(); }}>{Ico.back}</button>
        <div className="peer-avatar">{hook.peerName ? hook.peerName.substring(0, 2).toUpperCase() : '??'}</div>
        <div className="peer-meta">
          <div className="peer-name">{hook.peerName || 'Unknown user'}</div>
          <div className="peer-status">
            {status === 'disconnected' ? (
              <span style={{ color: 'var(--bad)' }}>Disconnected &middot; Code: {hook.roomId}</span>
            ) : status === 'reconnecting' ? (
              <span className="status-reconnecting"><span className="pulse-dot warn"></span>Reconnecting&hellip;</span>
            ) : (
              <><span className="pulse-dot"></span>Connected &middot; {connectionType === 'local' ? 'Local WiFi' : 'Relayed'}</>
            )}
          </div>
        </div>
        <div className="header-actions">
          <button className="header-icon-btn" onClick={() => hook.startCall?.('audio')} aria-label="Audio call">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5c0-.6.4-1 1-1h3l2 5-2 1.3a9 9 0 0 0 5.7 5.7L15 14l5 2v3c0 .6-.4 1-1 1A15 15 0 0 1 4 5Z"/>
            </svg>
          </button>
          <button className="header-icon-btn" onClick={() => hook.startCall?.('video')} aria-label="Video call">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="6" width="12" height="12" rx="2.5"/>
              <path d="M15 10.2 21 7v10l-6-3.2"/>
            </svg>
          </button>
        </div>
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
              {Ico.mic}
              <span className="ctrl-label">Mute</span>
            </button>
            <button className={`ctrl-btn ${hook.localStream?.getVideoTracks()[0]?.enabled === false ? 'muted' : ''}`} onClick={() => hook.toggleCamera?.()}>
              {Ico.cam}
              <span className="ctrl-label">Camera</span>
            </button>
            <button className={`ctrl-btn ${hook.isScreenSharing ? 'active' : ''}`} onClick={() => hook.isScreenSharing ? hook.stopScreenShare?.() : hook.startScreenShare?.()}>
              {Ico.screen}
              <span className="ctrl-label">Share</span>
            </button>
            <button className={`ctrl-btn ${hook.isRecording ? 'recording' : ''}`} onClick={handleRecordToggle}>
              {Ico.record}
              <span className="ctrl-label">Record</span>
            </button>
            <button className="ctrl-btn" onClick={() => setIsChatMinimized(true)}>
              {Ico.chat}
              <span className="ctrl-label">Chat</span>
            </button>
            <button className="ctrl-btn end" aria-label="End call" onClick={() => hook.endCall?.()}>
              {Ico.hangup}
            </button>
          </div>
        </div>
      )}

      {(hook.callState !== 'idle' && hook.callState !== 'incoming' && hook.callState !== 'ended' && hook.callState !== 'rejected' && isChatMinimized) && (
         <button className="return-call-btn" onClick={() => setIsChatMinimized(false)}>
           Return to call
         </button>
      )}

      <div className="thread" id="thread">
        <div className="day-divider"><span>Secure Session</span></div>
        <div className="conn-note"><span className="dot"></span>End-to-End Encrypted</div>

        {messages.map((msg: ChatMessage) => {
          if (msg.isSystemMessage) {
            return (
              <div key={msg.id} className="sys-note">{msg.text}</div>
            );
          }

          const isMe = msg.senderRole === role;
          const rowClass = `row ${isMe ? 'out' : 'in'}`;
          const timeString = new Date(msg.timestamp).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});

          if (msg.fileId) {
            const file = filesProgress[msg.fileId];
            if (!file) return null;
            const isSender = msg.senderRole === role;

            let kind: FileKind = 'doc';
            if (file.name.match(/\.(jpg|jpeg|png|gif|webp|heic|avif|svg)$/i)) kind = 'img';
            else if (file.name.match(/\.(mp4|mov|webm|mkv|avi)$/i)) kind = 'vid';
            else if (file.name.match(/\.(mp3|wav|m4a|flac|ogg|aac)$/i)) kind = 'aud';

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
                  }} style={{ cursor: file.status === 'complete' && file.blobUrl ? 'pointer' : 'default' }}>
                    <div className="file-icon">{FILE_ICON[kind]}</div>
                    <div className="file-info">
                      <div className="file-name">{file.name}</div>
                      <div className="file-sub">
                        {formatBytes(file.size)} &middot; {
                          file.status === 'complete' ? (isSender ? 'sent' : 'received') :
                          file.status === 'waiting_for_accept' ? 'pending acceptance' :
                          file.status === 'declined' ? 'declined' :
                          `${isSender ? 'sending' : 'receiving'} — ${Math.round(pct)}%`
                        }
                      </div>
                    </div>
                    {file.status === 'complete' ? (
                      <div className="file-check">✓</div>
                    ) : file.status === 'declined' ? (
                      <div className="file-check">✕</div>
                    ) : file.status !== 'waiting_for_accept' ? (
                      <div className="file-progress-ring">
                        <svg viewBox="0 0 26 26">
                          <circle className="ring-track" cx="13" cy="13" r="11"></circle>
                          <circle className="ring-fill" cx="13" cy="13" r="11" strokeDasharray="69.1" strokeDashoffset={dashOffset}></circle>
                        </svg>
                      </div>
                    ) : null}
                  </div>
                  {file.status === 'waiting_for_accept' && !isSender && (
                    <div className="offer-actions">
                      <button
                        className="offer-btn accept"
                        onClick={() => hook.acceptFileOffer && hook.acceptFileOffer(file.fileId)}
                      >
                        Accept
                      </button>
                      <button
                        className="offer-btn decline"
                        onClick={() => hook.declineFileOffer && hook.declineFileOffer(file.fileId)}
                      >
                        Decline
                      </button>
                    </div>
                  )}
                  <div className="msg-time">{file.status === 'complete' || file.status === 'declined' ? timeString : 'Transferring…'}</div>
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
          <button type="button" className="attach-option" onClick={() => triggerFileSelect('image/*')}><div className="ic">{Ico.image}</div><span>Photos</span></button>
          <button type="button" className="attach-option" onClick={() => triggerFileSelect('video/*')}><div className="ic">{Ico.video}</div><span>Videos</span></button>
          <button type="button" className="attach-option" onClick={() => triggerFileSelect('.pdf,.doc,.docx,.txt')}><div className="ic">{Ico.doc}</div><span>Files</span></button>
          <button type="button" className="attach-option" onClick={() => triggerFileSelect('audio/*')}><div className="ic">{Ico.audio}</div><span>Audio</span></button>
        </div>
        <div className="composer-row">
          <button type="button" className={`plus-btn ${isTrayOpen ? 'open' : ''}`} onClick={() => setIsTrayOpen(!isTrayOpen)}>+</button>
          <div className="input-wrap">
            <textarea
              ref={textareaRef}
              className="msg-input"
              rows={1}
              placeholder="Message" 
              value={inputText}
              onChange={handleInput}
              onKeyDown={onKeyDown}
            />
          </div>
          <button type="button" className="send-btn" aria-label="Send message" disabled={!inputText.trim()} onClick={handleSend}>{Ico.send}</button>
        </div>
      </div>
    </div>
  );
}
