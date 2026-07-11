import { useState, useRef, useEffect, ChangeEvent, FormEvent } from 'react';
import { useWebRTC, ChatMessage, Role, FileProgress } from '../lib/useWebRTC';
import { formatBytes } from '../lib/utils';
import { Lock, Plus, Send, File as FileIcon, CheckCircle } from 'lucide-react';

interface ChatRoomProps {
  hook: ReturnType<typeof useWebRTC>;
  onBack: () => void;
}

export function ChatRoom({ hook, onBack }: ChatRoomProps) {
  const { messages, filesProgress, sendChatMessage, sendFiles, role, disconnect, status, connectionType } = hook;
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e: FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      sendChatMessage(inputText.trim());
      setInputText('');
    }
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      sendFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDisconnect = () => {
    disconnect();
    onBack();
  };

  return (
    <div className="chat-container">
      {/* Header */}
      <div className="chat-header">
        <button className="header-back" onClick={handleDisconnect} title="Disconnect and Go Back">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div className="chat-title-group">
          <h2 className="title" style={{ margin: 0 }}>Secure Session</h2>
          <div className="chat-subtitle">
            <Lock size={12} className="lock-icon" />
            End-to-End Encrypted &middot; {connectionType === 'local' ? 'Local WiFi ⚡' : 'Relayed 🌐'}
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="chat-messages">
        <div className="chat-welcome">
          <Lock size={32} strokeWidth={1.5} style={{ marginBottom: '12px', color: 'var(--signal)' }} />
          <h3>Connection Established</h3>
          <p>Messages and files are sent directly between devices. No data is stored on any server.</p>
        </div>

        {messages.map((msg: ChatMessage) => {
          const isMe = msg.senderRole === role;
          
          if (msg.fileId) {
            const file = filesProgress[msg.fileId];
            if (!file) return null;
            return (
              <div key={msg.id} className={`chat-bubble-row ${isMe ? 'me' : 'them'}`}>
                <div className={`chat-file-bubble ${isMe ? 'me' : 'them'}`}>
                  <div className="file-info-row">
                    <FileIcon size={24} className="file-icon" />
                    <div className="file-meta">
                      <span className="file-name">{file.name}</span>
                      <span className="file-size">{formatBytes(file.size)}</span>
                    </div>
                  </div>
                  
                  {file.status === 'complete' ? (
                    <div className="file-action">
                       {file.blobUrl ? (
                         <a href={file.blobUrl} download={file.name} className="download-btn">Open File</a>
                       ) : (
                         <span className="check-text"><CheckCircle size={16}/> Sent</span>
                       )}
                    </div>
                  ) : (
                    <div className="chat-progress-wrap">
                      <div className="chat-progress-fill" style={{ width: `${Math.max(5, (file.bytesTransferred / file.size) * 100)}%` }}></div>
                    </div>
                  )}
                </div>
              </div>
            );
          }

          return (
            <div key={msg.id} className={`chat-bubble-row ${isMe ? 'me' : 'them'}`}>
              <div className={`chat-bubble ${isMe ? 'me' : 'them'}`}>
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      {status === 'disconnected' ? (
        <div className="chat-disconnected-bar">
          Peer disconnected. <button onClick={handleDisconnect} className="text-link" style={{display:'inline', margin:0}}>Return Home</button>
        </div>
      ) : (
        <div className="chat-input-area">
          <input 
            type="file" 
            multiple 
            className="hidden" 
            style={{ display: 'none' }}
            ref={fileInputRef}
            onChange={handleFileSelect}
          />
          <button className="chat-attach-btn" type="button" onClick={() => fileInputRef.current?.click()} title="Send files">
            <Plus size={24} />
          </button>
          <form onSubmit={handleSend} className="chat-form">
            <input 
              type="text" 
              className="chat-input"
              placeholder="Type a message..." 
              value={inputText}
              onChange={e => setInputText(e.target.value)}
            />
            <button type="submit" className="chat-send-btn" disabled={!inputText.trim()}>
              <Send size={20} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
