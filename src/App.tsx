/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Home } from './components/Home';
import { Sender } from './components/Sender';
import { Receiver } from './components/Receiver';

export type Screen = 'home' | 'sender' | 'receiver';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-blue-100">
      {screen === 'home' && <Home onSelectScreen={setScreen} />}
      {screen === 'sender' && <Sender onBack={() => setScreen('home')} />}
      {screen === 'receiver' && <Receiver onBack={() => setScreen('home')} />}
    </div>
  );
}
