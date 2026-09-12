import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import type { Screen } from '../App';

interface HomeProps {
  onSelectScreen: (screen: Screen) => void;
  userName: string;
  onUserNameChange: (name: string) => void;
}

const APP_URL = 'https://tata-dransfer-by-askdeepakai-1.onrender.com';

/* ---------- icons ---------- */
const I = {
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 5 6v5.5c0 4.3 2.9 8.3 7 9.5 4.1-1.2 7-5.2 7-9.5V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  bolt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </svg>
  ),
  cloudOff: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18" />
      <path d="M17.5 18H7a4 4 0 0 1-.7-7.94" />
      <path d="M8.6 5.6A5.5 5.5 0 0 1 18 9.5v.5h.5a3.5 3.5 0 0 1 2.6 5.8" />
    </svg>
  ),
  layers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </svg>
  ),
  laptop: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M2 20h20" />
    </svg>
  ),
  phone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="2" width="12" height="20" rx="3" />
      <path d="M11 18.5h2" />
    </svg>
  ),
};

export function Home({ onSelectScreen, userName, onUserNameChange }: HomeProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [timeStr, setTimeStr] = useState<string>('');

  useEffect(() => {
    QRCode.toDataURL(APP_URL, {
      width: 400,
      margin: 1,
      color: { dark: '#08090D', light: '#FFFFFF' },
    })
      .then(setQrUrl)
      .catch(console.error);
  }, []);

  useEffect(() => {
    const tick = () =>
      setTimeStr(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
      );
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="screen active" id="home" style={{ position: 'relative' }}>
      <div className="hero-clock">{timeStr}</div>

      <div className="home-grid">
        {/* ---------------- copy ---------------- */}
        <div className="hero-copy">
          <p className="eyebrow">
            <i />
            No cloud · No signup · Encrypted
          </p>

          <h1 className="brand">
            Send anything,
            <br />
            <em>device to device.</em>
          </h1>

          <p className="sub">
            Files move straight from your device to theirs over a direct peer-to-peer link.
            On the same Wi-Fi it is instant. Nothing is ever stored on a server, and chats
            are end-to-end encrypted.
          </p>

          <div style={{ marginBottom: 24 }}>
            <label className="field-label" htmlFor="display-name">
              Your name <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              id="display-name"
              className="field-input"
              type="text"
              placeholder="e.g. Deepak R."
              value={userName}
              onChange={(e) => onUserNameChange(e.target.value)}
            />
          </div>

          <div className="role-buttons">
            <button className="role-btn primary" onClick={() => onSelectScreen('sender')}>
              <div>
                <div className="label">Send files</div>
                <div className="hint">Pick from this device</div>
              </div>
              <span className="arrow">→</span>
            </button>
            <button className="role-btn" onClick={() => onSelectScreen('receiver')}>
              <div>
                <div className="label">Receive</div>
                <div className="hint">Scan a code to join</div>
              </div>
              <span className="arrow">→</span>
            </button>
          </div>

          <p className="assurance">
            {I.shield}
            <span>
              Same Wi-Fi means bytes never leave your network. Across networks they travel
              over an encrypted direct link.
            </span>
          </p>
        </div>

        {/* ---------------- transfer visual ---------------- */}
        <div className="hero-visual">
          <div className="orb-glow" />

          <div className="ring-stage">
            <div className="ring" />
            <div className="ring" />
            <div className="ring" />

            <div className="orbit">
              <span className="packet t" />
              <span className="packet r" />
            </div>
            <div className="orbit outer">
              <span className="packet t" />
              <span className="packet b" />
            </div>

            <div className="qr-core">
              {qrUrl ? (
                <img src={qrUrl} alt={`QR code linking to ${APP_URL}`} />
              ) : (
                <div style={{ width: 168, height: 168, borderRadius: 10, background: '#F1F2F4' }} />
              )}
            </div>
          </div>

          <div className="node node-a">
            <span className="ic">{I.laptop}</span>
            <span className="tx">
              <b>This device</b>
              <s>READY</s>
            </span>
          </div>

          <div className="node node-b">
            <span className="ic">{I.phone}</span>
            <span className="tx">
              <b>Any device</b>
              <s>SCAN TO PAIR</s>
            </span>
          </div>
        </div>
      </div>

      {/* ---------------- stats ---------------- */}
      <div className="stat-strip">
        <div className="stat">
          <b>
            <em>100 GB</em>
          </b>
          <span>Max file size</span>
        </div>
        <div className="stat">
          <b>
            <em>0</em>
          </b>
          <span>Files kept on our servers</span>
        </div>
        <div className="stat">
          <b>
            <em>~1s</em>
          </b>
          <span>To pair two devices</span>
        </div>
      </div>

      {/* ---------------- features ---------------- */}
      <div className="feature-grid">
        <div className="feature">
          <div className="ic">{I.bolt}</div>
          <h3>Direct peer-to-peer</h3>
          <p>A WebRTC data channel opens straight between the two devices — no upload, no download queue.</p>
        </div>
        <div className="feature">
          <div className="ic">{I.cloudOff}</div>
          <h3>Nothing is stored</h3>
          <p>The server only introduces the two peers. It never sees a single byte of your files.</p>
        </div>
        <div className="feature">
          <div className="ic">{I.layers}</div>
          <h3>Streams to disk</h3>
          <p>Files are written straight to disk as they arrive, so a 100 GB transfer never fills memory.</p>
        </div>
        <div className="feature">
          <div className="ic">{I.shield}</div>
          <h3>Encrypted end to end</h3>
          <p>Every message and file is encrypted in transit by WebRTC's built-in DTLS layer.</p>
        </div>
      </div>

      <footer className="site-foot">
        <span>Tata Dransfer™ 2026</span>
        <span>
          Designed, built and maintained by{' '}
          <a href="https://github.com/thedeepakreddy" target="_blank" rel="noopener noreferrer">
            Deepak Reddy
          </a>
        </span>
      </footer>
    </section>
  );
}
