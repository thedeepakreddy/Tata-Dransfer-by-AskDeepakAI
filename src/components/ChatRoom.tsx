import React, { useState, useRef, useEffect, ChangeEvent, FormEvent } from 'react';
import { useWebRTC, ChatMessage } from '../lib/useWebRTC';
import { formatBytes } from '../lib/utils';

export function ChatRoom({ hook, onBack }: { hook: ReturnType<typeof useWebRTC>, onBack: () => void }) {
  const { messages, filesProgress, sendChatMessage, sendFiles, role, disconnect, status, connectionType } = hook;
  const [inputText, setInputText] = useState('');
  const [isTrayOpen, setIsTrayOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, filesProgress]);

  const handleSend = () => {
    if (inputText.trim()) {
      sendChatMessage(inputText.trim());
      setInputText('');
    }
  };

  const handleInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 90) + 'px';
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--paper)', backgroundImage: 'radial-gradient(circle at 50% 0%, #F7F8FA 0%, var(--paper) 60%)' }}>
      
      {/* chat header */}
      <div className="chat-header">
        <button className="back-btn" aria-label="Back" onClick={() => { disconnect(); onBack(); }}>←</button>
        <div className="peer-avatar">{hook.peerName ? hook.peerName.substring(0, 2).toUpperCase() : '??'}</div>
        <div className="peer-meta">
          <div className="peer-name">{hook.peerName || 'Unknown user'}</div>
          <div className="peer-status">
            {status === 'disconnected' ? (
              <span style={{ color: '#E11D48' }}>Disconnected</span>
            ) : (
              <>
                <span className="pulse-dot"></span>Connected &middot; {connectionType === 'local' ? 'Local WiFi' : 'Relayed'}
              </>
            )}
          </div>
        </div>
        <button className="header-icon-btn" aria-label="Session info">i</button>
      </div>

      <div className="thread" id="thread">
        <div className="day-divider"><span>Secure Session</span></div>
        <div className="conn-note"><span className="dot"></span>End-to-End Encrypted</div>

        {messages.map((msg: ChatMessage) => {
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
