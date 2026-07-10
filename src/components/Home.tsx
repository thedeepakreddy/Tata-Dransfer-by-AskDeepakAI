import { Send, Scan } from 'lucide-react';
import type { Screen } from '../App';

interface HomeProps {
  onSelectScreen: (screen: Screen) => void;
}

export function Home({ onSelectScreen }: HomeProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 max-w-md mx-auto w-full">
      <div className="text-center mb-12 animate-fade-in">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 mb-2">QuickShare</h1>
        <p className="text-gray-500">Peer-to-peer file transfer</p>
      </div>
      
      <div className="flex flex-col gap-4 w-full">
        <button 
          onClick={() => onSelectScreen('sender')}
          className="group relative flex flex-col items-center justify-center gap-3 p-8 bg-blue-600 text-white rounded-2xl shadow-lg hover:bg-blue-700 active:scale-[0.98] transition-all"
        >
          <div className="bg-white/20 p-4 rounded-full group-hover:scale-110 transition-transform">
            <Send className="w-8 h-8" />
          </div>
          <div className="text-xl font-semibold">Send Files</div>
        </button>

        <button 
          onClick={() => onSelectScreen('receiver')}
          className="group relative flex flex-col items-center justify-center gap-3 p-8 bg-white border-2 border-gray-200 text-gray-800 rounded-2xl shadow-sm hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98] transition-all"
        >
          <div className="bg-gray-100 p-4 rounded-full group-hover:scale-110 transition-transform">
            <Scan className="w-8 h-8" />
          </div>
          <div className="text-xl font-semibold">Scan to Receive</div>
        </button>
      </div>
      
      <div className="mt-12 text-sm text-gray-400 text-center px-4">
        Files are transferred directly over your local WiFi network. No internet upload required.
      </div>
    </div>
  );
}
