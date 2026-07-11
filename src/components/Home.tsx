import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import type { Screen } from '../App';

interface HomeProps {
  onSelectScreen: (screen: Screen) => void;
  userName: string;
  onUserNameChange: (name: string) => void;
}

export function Home({ onSelectScreen, userName, onUserNameChange }: HomeProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL('https://tata-dransfer-by-askdeepakai-1.onrender.com', { 
      width: 200,
      margin: 1,
      color: { dark: '#14181C', light: '#FFFFFF' }
    })
    .then(url => setQrUrl(url))
    .catch(console.error);
  }, []);

  return (
    <section className="screen active" id="home">
      <div className="home-grid">
        <div>
          <p className="eyebrow">Local · No cloud · No signup</p>
          <h1 className="brand" style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
            Tata Dransfer 
            <span style={{ fontSize: '0.55em', fontWeight: '500', color: 'var(--muted)' }}>
              by <a href="https://askdeepakai-datascientist.onrender.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#4169E1', textDecoration: 'none' }}>AskDeepakAI</a>
            </span>
          </h1>
          <p className="sub">Send files device to device over WiFi. Nothing is ever stored on a server.</p>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginBottom: '8px' }}>Your Name (Optional)</label>
            <input 
              type="text" 
              placeholder="e.g. James M." 
              value={userName}
              onChange={(e) => onUserNameChange(e.target.value)}
              style={{
                width: '100%',
                maxWidth: '280px',
                padding: '10px 14px',
                borderRadius: '12px',
                border: '1px solid var(--hairline)',
                background: 'var(--surface)',
                fontFamily: 'Inter, sans-serif',
                fontSize: '14px',
                outline: 'none'
              }}
            />
          </div>
          <div className="role-buttons">
            <button className="role-btn primary" onClick={() => onSelectScreen('sender')}>
              <div><div className="label">Send</div><div className="hint">Pick files from this device</div></div>
              <span className="arrow">→</span>
            </button>
            <button className="role-btn" onClick={() => onSelectScreen('receiver')}>
              <div><div className="label">Scan</div><div className="hint">Receive from a nearby device</div></div>
              <span className="arrow">→</span>
            </button>
          </div>
          <div className="foot-note"><span className="dot"></span>Files travel directly over WiFi, never through the internet</div>
        </div>
        <div className="ring-stage">
          <div className="ring"></div><div className="ring"></div><div className="ring"></div>
          <div className="qr-core">
            {qrUrl ? (
              <img src={qrUrl} alt="App Link QR" style={{ width: '148px', height: '148px', borderRadius: '12px' }} />
            ) : (
              <div style={{ width: '148px', height: '148px', borderRadius: '12px', background: 'white' }}></div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
