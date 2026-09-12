/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Home } from './components/Home';
import { Sender } from './components/Sender';
import { Receiver } from './components/Receiver';

export type Screen = 'home' | 'sender' | 'receiver';

const AUTHOR_URL = 'https://askdeepakai-datascientist.onrender.com/';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [userName, setUserName] = useState<string>('');
  const [timeStr, setTimeStr] = useState<string>('');
  const [showLoader, setShowLoader] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowLoader(false), 1900);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const updateClock = () => {
      setTimeStr(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('room')) {
      setScreen('receiver');
    }
  }, []);

  return (
    <>
      {showLoader && (
        <div className="loader-screen">
          <div className="loader-text">
            AskDeepak<span>AI</span>
          </div>
        </div>
      )}

      <div className="app-container">
        {/* Desktop top bar */}
        <header className="titlebar">
          <div className="mark">
            <span className="glyph">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
              </svg>
            </span>
            Tata Dransfer
          </div>

          <a
            href={AUTHOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="url-pill"
            style={{ textDecoration: 'none' }}
          >
            <span>AskDeepakAI</span>
          </a>
        </header>

        {/* Mobile status bar */}
        <div className="statusbar">
          <span>{timeStr || '9:41'}</span>
          <span className="brandlet">
            <i />
            TATA DRANSFER
          </span>
        </div>

        <div className="canvas">
          {screen === 'home' && (
            <Home onSelectScreen={setScreen} userName={userName} onUserNameChange={setUserName} />
          )}
          {screen === 'sender' && <Sender onBack={() => setScreen('home')} userName={userName} />}
          {screen === 'receiver' && (
            <Receiver
              onBack={() => {
                window.history.replaceState({}, '', window.location.pathname);
                setScreen('home');
              }}
              userName={userName}
            />
          )}
        </div>
      </div>
    </>
  );
}
