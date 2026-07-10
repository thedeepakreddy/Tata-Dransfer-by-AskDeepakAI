import type { Screen } from '../App';

interface HomeProps {
  onSelectScreen: (screen: Screen) => void;
}

export function Home({ onSelectScreen }: HomeProps) {
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
          </div>
        </div>
      </div>
    </section>
  );
}
