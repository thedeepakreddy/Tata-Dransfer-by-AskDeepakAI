import { useState, useEffect, FormEvent, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useWebRTC, FileProgress } from '../lib/useWebRTC';
import { formatBytes } from '../lib/utils';

import { ChatRoom } from './ChatRoom';

interface ReceiverProps {
  onBack: () => void;
  userName: string;
}

export function Receiver({ onBack, userName }: ReceiverProps) {
  const [cameraMode, setCameraMode] = useState<'environment'|'user'>('environment');
  const scannerRef = useRef<any>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [showManual, setShowManual] = useState(false);
  
  const hook = useWebRTC(userName);
  const { initSignaling, roomId, status, filesProgress, errorMsg, connectionType, disconnect } = hook;

  useEffect(() => {
    if (status !== 'idle') return;

    // Check for deep link auto-join
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl) {
      initSignaling(roomFromUrl, 'receiver');
      return;
    }

    const html5QrCode = new Html5Qrcode("qr-reader");
    scannerRef.current = html5QrCode;

    const onScanSuccess = (decodedText: string) => {
      try {
        if (decodedText.startsWith('http')) {
          const url = new URL(decodedText);
          const room = url.searchParams.get('room');
          if (room) {
            html5QrCode.stop().catch(console.error);
            initSignaling(room, 'receiver');
            return;
          }
        }

        const data = JSON.parse(decodedText);
        if (data.roomId) {
          html5QrCode.stop().catch(console.error);
          initSignaling(data.roomId, 'receiver');
        } else {
           setScanError('Invalid QR code format');
        }
      } catch (e) {
        setScanError('Invalid QR code format');
      }
    };

    html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      onScanSuccess,
      () => {}
    ).catch(err => {
      html5QrCode.start(
        { facingMode: "user" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        onScanSuccess,
        () => {}
      ).catch(err2 => {
        setScanError('Camera initialization failed. Please allow camera access.');
      });
    });

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [initSignaling, status]);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  const handleManualJoin = (e: FormEvent) => {
    e.preventDefault();
    if (manualCode.length >= 6) {
      initSignaling(manualCode.toUpperCase(), 'receiver');
    }
  };

  const isConnected = status === 'connected' || status === 'transferring' || status === 'complete' || status === 'disconnected';

  if (isConnected) {
    return <ChatRoom hook={hook} onBack={onBack} />;
  }

  return (
    <section className="screen active" id="scan">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
        <button className="header-back" onClick={onBack}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <h2 className="title" style={{ margin: 0, marginLeft: '8px' }}>Point a camera at the code</h2>
      </div>
      <p className="desc" style={{ marginLeft: '40px' }}>Open Tata Dransfer on your phone and tap Scan — connects in about a second.</p>

      {errorMsg && (
        <div style={{ padding: '16px', background: '#FEF2F2', color: '#991B1B', borderRadius: '16px', marginBottom: '24px', fontSize: '14px' }}>
          {errorMsg}
        </div>
      )}
      {scanError && !isConnected && !errorMsg && (
        <div style={{ padding: '16px', background: '#FFF7ED', color: '#C2410C', borderRadius: '16px', marginBottom: '24px', fontSize: '14px' }}>
          {scanError}
        </div>
      )}

      <div className="work-grid">
        <div>
          <p className="desc desktop-only" style={{ marginBottom: '14px' }}>No camera handy? Type the 6-character code shown on the sender's screen instead.</p>
          <button className="text-link" style={{ textAlign: 'left', margin: 0 }} onClick={() => setShowManual(!showManual)}>
            Enter code manually
          </button>
          
          <div className={`manual-entry ${showManual ? 'open' : ''}`} style={{ marginLeft: 0 }}>
            <form onSubmit={handleManualJoin}>
              <input 
                type="text" 
                maxLength={6} 
                placeholder="A3F9K2" 
                aria-label="Manual pairing code"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
              />
              <button type="submit" className="primary-btn" disabled={manualCode.length < 6}>Connect</button>
            </form>
          </div>
        </div>
        
        <div className="panel">
          {!isConnected && status === 'idle' && (
            <div className="ring-stage" style={{ zIndex: 1 }}>
              <div className="ring"></div><div className="ring"></div><div className="ring"></div>
              <div className="scan-frame">
                <div id="qr-reader" style={{ width: '100%', height: '100%' }}></div>
                <div className="corner tl"></div><div className="corner tr"></div>
                <div className="corner bl"></div><div className="corner br"></div>
              </div>
            </div>
          )}
          <div className="status-line">
            <span className="pulse-dot"></span>
            <span>
              {status === 'connecting' ? 'Connecting to sender...' : 
               isConnected ? 'Connected, waiting for files...' : 
               'Searching for a code…'}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
