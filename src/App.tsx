/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Home } from './components/Home';
import { Sender } from './components/Sender';
import { Receiver } from './components/Receiver';

export type Screen = 'home' | 'sender' | 'receiver';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [userName, setUserName] = useState<string>('');
  const [timeStr, setTimeStr] = useState<string>('');
  const [showLoader, setShowLoader] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowLoader(false), 4000);
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
          <div className="loader-text">AskDeepak<span>AI</span></div>
        </div>
      )}
      <div className="app-container">
      <div className="titlebar">
        <a href="https://askdeepakai-datascientist.onrender.com/" target="_blank" rel="noopener noreferrer" className="url-pill" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span>AskDeepakAI</span>
        </a>
      </div>
      <div className="statusbar"><span>{timeStr || '9:41'}</span><span>TATA DRANSFER</span></div>

      <div className="canvas">
        {screen === 'home' && <Home onSelectScreen={setScreen} userName={userName} onUserNameChange={setUserName} />}
        {screen === 'sender' && <Sender onBack={() => setScreen('home')} userName={userName} />}
        {screen === 'receiver' && <Receiver onBack={() => {
          window.history.replaceState({}, '', window.location.pathname);
          setScreen('home');
        }} userName={userName} />}
      </div>
    </>
  );
}
