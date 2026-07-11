import { useState, useEffect, useRef, ChangeEvent } from 'react';
import QRCode from 'qrcode';
import { useWebRTC, FileProgress } from '../lib/useWebRTC';
import { formatBytes } from '../lib/utils';
import { v4 as uuidv4 } from 'uuid';

import { ChatRoom } from './ChatRoom';

interface SenderProps {
  onBack: () => void;
}

export function Sender({ onBack }: SenderProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [showQrCode, setShowQrCode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const hook = useWebRTC();
  const { initSignaling, roomId, status, sendFiles, filesProgress, errorMsg, connectionType, disconnect } = hook;

  useEffect(() => {
    const newRoomId = uuidv4().substring(0, 6).toUpperCase();
    initSignaling(newRoomId, 'sender');
    return () => disconnect();
  }, [initSignaling, disconnect]);

  useEffect(() => {
    if (roomId) {
      const deepLinkUrl = `${window.location.origin}/?room=${roomId}`;
      QRCode.toDataURL(deepLinkUrl, { 
        width: 300,
        margin: 2,
        color: { dark: '#14181C', light: '#FFFFFF' }
      })
      .then(url => setQrCodeUrl(url))
      .catch(console.error);
    }
  }, [roomId]);

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      sendFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const isConnected = status === 'connected' || status === 'transferring' || status === 'complete' || status === 'disconnected';
  const hasFiles = Object.keys(filesProgress).length > 0;

  if (isConnected && showQrCode) {
    return <ChatRoom hook={hook} onBack={onBack} />;
  }

  return (
    <section className="screen active" id="send">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
        <button className="header-back" onClick={onBack}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <h2 className="title" style={{ margin: 0, marginLeft: '8px' }}>Choose what to send</h2>
      </div>
      <p className="desc" style={{ marginLeft: '40px' }}>Photos, videos, music, PDFs, or documents.</p>

      {errorMsg && (
        <div style={{ padding: '16px', background: '#FEF2F2', color: '#991B1B', borderRadius: '16px', marginBottom: '24px', fontSize: '14px' }}>
          {errorMsg}
        </div>
      )}

      <div className="work-grid">
        <div>
          <input 
            type="file" 
            multiple 
            className="hidden" 
            style={{ display: 'none' }}
            ref={fileInputRef}
            onChange={handleFileSelect}
          />
          <button className="picker-btn" onClick={() => fileInputRef.current?.click()}>
            + Add files
          </button>
          
          <div id="fileList">
            {(Object.values(filesProgress) as FileProgress[]).map((file) => (
              <div key={file.fileId} className="file-chip">
                <div className="meta">
                  <span className="name">{file.name}</span>
                  <span className="size">{formatBytes(file.size)}</span>
                </div>
                {file.status === 'pending' && <div className="progress-wrap"><div className="progress-fill" style={{ width: '0%' }}></div></div>}
                {file.status === 'transferring' && (
                  <div className="progress-wrap">
                    <div className="progress-fill" style={{ width: `${Math.max(5, (file.bytesTransferred / file.size) * 100)}%` }}></div>
                  </div>
                )}
                {file.status === 'complete' && <span className="check">✓</span>}
              </div>
            ))}
          </div>

          {!isConnected && (
            <button 
              className="primary-btn" 
              onClick={() => setShowQrCode(true)} 
              disabled={!hasFiles || showQrCode}
            >
              Show code to receiver
            </button>
          )}
        </div>

        <div className="panel" style={{ display: (showQrCode || isConnected) ? 'block' : 'none' }}>
          {!isConnected && (
            <div className="ring-stage small">
              <div className="ring"></div><div className="ring"></div><div className="ring"></div>
              <div className="qr-core">
                {qrCodeUrl ? (
                  <img src={qrCodeUrl} alt="QR Code" />
                ) : (
                  <svg viewBox="0 0 100 100" fill="none">
                    <rect x="8" y="8" width="26" height="26" rx="3" stroke="#F1F2F4" strokeWidth="6"/>
                    <rect x="66" y="8" width="26" height="26" rx="3" stroke="#F1F2F4" strokeWidth="6"/>
                    <rect x="8" y="66" width="26" height="26" rx="3" stroke="#F1F2F4" strokeWidth="6"/>
                    <rect x="17" y="17" width="8" height="8" fill="#F1F2F4"/>
                    <rect x="75" y="17" width="8" height="8" fill="#F1F2F4"/>
                    <rect x="17" y="75" width="8" height="8" fill="#F1F2F4"/>
                    <rect x="46" y="8" width="6" height="6" fill="#F1F2F4"/>
                    <rect x="46" y="24" width="6" height="6" fill="#F1F2F4"/>
                    <rect x="60" y="46" width="6" height="6" fill="#F1F2F4"/>
                    <rect x="76" y="46" width="6" height="6" fill="#F1F2F4"/>
                    <rect x="46" y="60" width="6" height="6" fill="#F1F2F4"/>
                    <rect x="46" y="76" width="6" height="6" fill="#F1F2F4"/>
                    <rect x="30" y="46" width="6" height="6" fill="#F1F2F4"/>
                    <rect x="46" y="46" width="6" height="6" fill="#F1F2F4"/>
                  </svg>
                )}
              </div>
            </div>
          )}
          
          <div className="status-line">
            {!isConnected && <span className="pulse-dot"></span>}
            <span>
              {status === 'connecting' ? 'Waiting for scan…' : 
               isConnected ? `Connected · ${connectionType === 'local' ? 'Local WiFi ⚡' : 'Relayed 🌐'}` : 
               'Disconnected'}
            </span>
          </div>
          
          {!isConnected && (
            <p className="panel-label">Scan with the receiving device<br/><br/>Code: <strong style={{color: 'var(--ink)'}}>{roomId}</strong></p>
          )}
        </div>
      </div>
    </section>
  );
}
