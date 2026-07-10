import { useState, useEffect, FormEvent } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useWebRTC, FileProgress } from '../lib/useWebRTC';
import { ArrowLeft, Wifi, File as FileIcon, CheckCircle2, Loader2, AlertCircle, Download } from 'lucide-react';
import { formatBytes } from '../lib/utils';

interface ReceiverProps {
  onBack: () => void;
}

export function Receiver({ onBack }: ReceiverProps) {
  const [scanError, setScanError] = useState<string | null>(null);
  const { initSignaling, roomId, status, filesProgress, errorMsg, connectionType, disconnect } = useWebRTC();
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    // Only init scanner if we haven't connected yet
    if (status !== 'idle') return;

    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      /* verbose= */ false
    );

    scanner.render(
      (decodedText) => {
        try {
          const data = JSON.parse(decodedText);
          if (data.roomId) {
            scanner.clear();
            initSignaling(data.roomId, 'receiver');
          } else {
             setScanError('Invalid QR code format');
          }
        } catch (e) {
          setScanError('Invalid QR code format');
        }
      },
      (errorMessage) => {
        // quiet fail on scan errors
      }
    );

    return () => {
      scanner.clear().catch(e => console.error("Error clearing scanner", e));
    };
  }, [initSignaling, status]);

  // Clean up WebRTC on unmount
  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  const handleManualJoin = (e: FormEvent) => {
    e.preventDefault();
    if (manualCode.length >= 6) {
      initSignaling(manualCode.toUpperCase(), 'receiver');
    }
  };

  const isConnected = status === 'connected' || status === 'transferring' || status === 'complete';

  return (
    <div className="flex flex-col min-h-screen p-6 max-w-lg mx-auto w-full">
      <header className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-200 transition-colors">
          <ArrowLeft className="w-6 h-6 text-gray-700" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 flex-1">Receive Files</h1>
        
        {isConnected && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
            <Wifi className="w-4 h-4" />
            <span>{connectionType === 'local' ? 'Local WiFi ⚡' : 'Relayed 🌐'}</span>
          </div>
        )}
      </header>

      {errorMsg && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <p className="text-sm">{errorMsg}</p>
        </div>
      )}

      {scanError && !isConnected && !errorMsg && (
        <div className="mb-6 p-4 bg-orange-50 text-orange-700 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <p className="text-sm">{scanError}</p>
        </div>
      )}

      {!isConnected && status === 'idle' && (
        <div className="flex flex-col gap-6">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
             <div id="qr-reader" className="w-full border-none"></div>
          </div>
          
          <div className="text-center">
            <span className="text-sm text-gray-500 font-medium px-4 bg-gray-50 relative top-3">OR ENTER CODE</span>
            <hr className="border-gray-200" />
          </div>

          <form onSubmit={handleManualJoin} className="flex gap-2">
            <input
              type="text"
              placeholder="6-digit code"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl uppercase tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={6}
            />
            <button
              type="submit"
              disabled={manualCode.length < 6}
              className="px-6 py-3 bg-gray-900 text-white font-medium rounded-xl disabled:opacity-50"
            >
              Join
            </button>
          </form>
        </div>
      )}

      {status === 'connecting' && (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-4">
           <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
           <p className="font-medium">Connecting to sender...</p>
        </div>
      )}

      {isConnected && (
        <div className="flex-1 flex flex-col">
          {Object.keys(filesProgress).length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-4">
              <div className="p-4 bg-gray-100 rounded-full">
                <Download className="w-8 h-8 text-gray-400" />
              </div>
              <p className="font-medium">Waiting for sender to select files...</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">
              <h2 className="font-semibold text-gray-900 border-b border-gray-100 pb-2">Received Files</h2>
              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                {(Object.values(filesProgress) as FileProgress[]).map((file) => (
                  <div key={file.fileId} className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                        <FileIcon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                        <p className="text-xs text-gray-500">
                          {formatBytes(file.bytesTransferred)} / {formatBytes(file.size)}
                        </p>
                      </div>
                      <div>
                        {file.status === 'pending' && <span className="text-xs font-medium text-gray-400">Waiting</span>}
                        {file.status === 'transferring' && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}
                        {file.status === 'complete' && (
                          <a 
                            href={file.blobUrl} 
                            download={file.name}
                            className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                          >
                            <Download className="w-4 h-4" />
                            Save
                          </a>
                        )}
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${file.status === 'complete' ? 'bg-green-500' : 'bg-blue-500'}`}
                        style={{ width: `${Math.max(0, Math.min(100, (file.bytesTransferred / file.size) * 100))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
