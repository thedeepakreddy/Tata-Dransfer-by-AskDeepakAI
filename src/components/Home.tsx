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
  const [geoInfo, setGeoInfo] = useState<{ip: string, city: string, region: string} | null>(null);
  const [timeStr, setTimeStr] = useState<string>('');

  useEffect(() => {
    QRCode.toDataURL('https://tata-dransfer-by-askdeepakai-1.onrender.com', { 
      width: 200,
      margin: 1,
      color: { dark: '#14181C', light: '#FFFFFF' }
    })
    .then(url => setQrUrl(url))
    .catch(console.error);
    
    // Fetch geo IP
    fetch('https://ipapi.co/json/')
      .then(res => res.json())
      .then(data => {
        if (data && data.ip) {
          setGeoInfo({ ip: data.ip, city: data.city, region: data.region });
        }
      })
      .catch(console.error);

    // Update time clock
    const updateClock = () => {
      setTimeStr(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }));
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="screen active" id="home" style={{ position: 'relative' }}>
      {/* Top right time and IP widget */}
      <div style={{
        position: 'absolute',
        top: '24px',
        right: '24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '11px',
        color: 'var(--muted)',
        background: 'rgba(255, 255, 255, 0.6)',
        backdropFilter: 'blur(10px)',
        padding: '8px 12px',
        borderRadius: '8px',
        border: '1px solid var(--hairline)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        zIndex: 100
      }}>
        <div style={{ color: 'var(--ink)', fontWeight: 600, marginBottom: '2px' }}>{timeStr}</div>
        {geoInfo ? (
          <>
            <div>{geoInfo.ip}</div>
            <div>{geoInfo.city}, {geoInfo.region}</div>
          </>
        ) : (
          <div>Locating...</div>
        )}
      </div>

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
                fontSize: '16px',
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

      <div style={{
        position: 'absolute',
        bottom: '16px',
        left: '0',
        right: '0',
        textAlign: 'center',
        fontSize: '12.5px',
        color: 'var(--muted)',
        fontFamily: 'Inter, sans-serif'
      }}>
        Tata Dransfer &trade; 2026 -- This Website is created and maintained by <a href="https://github.com/thedeepakreddy" target="_blank" rel="noopener noreferrer" style={{ color: 'darkblue', textDecoration: 'none', fontWeight: 600 }}>Deepak Reddy</a>
      </div>
    </section>
  );
}
