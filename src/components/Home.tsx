import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import type { Screen } from '../App';

interface HomeProps {
  onSelectScreen: (screen: Screen) => void;
}

export function Home({ onSelectScreen }: HomeProps) {
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
