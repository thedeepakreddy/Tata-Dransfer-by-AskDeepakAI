import { useState, useEffect, useRef, ChangeEvent } from 'react';
import QRCode from 'qrcode';
import { useWebRTC, FileProgress } from '../lib/useWebRTC';
import { ArrowLeft, Wifi, File as FileIcon, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { formatBytes } from '../lib/utils';
import { v4 as uuidv4 } from 'uuid';

interface SenderProps {
  onBack: () => void;
}

export function Sender({ onBack }: SenderProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { initSignaling, roomId, status, sendFiles, filesProgress, errorMsg, connectionType, disconnect } = useWebRTC();

  useEffect(() => {
    // Generate room id and init signaling when sender mounts
    const newRoomId = uuidv4().substring(0, 6).toUpperCase();
    initSignaling(newRoomId, 'sender');
    
    return () => disconnect();
  }, [initSignaling, disconnect]);

  useEffect(() => {
    if (roomId && status === 'connecting') {
      // Need to include signaling server URL or just assume relative based on window.location in the receiver
      const wsUrl = window.location.origin; // Assuming same host
      const payload = JSON.stringify({ roomId, wsUrl });
      QRCode.toDataURL(payload, { 
        width: 300,
        margin: 2,
        color: { dark: '#111827', light: '#FFFFFF' }
      })
      .then(url => setQrCodeUrl(url))
      .catch(err => console.error(err));
    }
  }, [roomId, status]);

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      sendFiles(Array.from(e.target.files));
    }
  };

  const isConnected = status === 'connected' || status === 'transferring' || status === 'complete';
  const hasFiles = Object.keys(filesProgress).length > 0;

  return (
    <div className="flex flex-col min-h-screen p-6 max-w-lg mx-auto w-full">
      <header className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-200 transition-colors">
          <ArrowLeft className="w-6 h-6 text-gray-700" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 flex-1">Send Files</h1>
        
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

      {!isConnected && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mb-8 flex flex-col items-center">
            {qrCodeUrl ? (
              <img src={qrCodeUrl} alt="QR Code" className="w-64 h-64 rounded-xl" />
            ) : (
              <div className="w-64 h-64 bg-gray-100 animate-pulse rounded-xl" />
            )}
            <p className="mt-6 text-center text-gray-500 font-medium">
              Ask the receiver to scan this QR code
            </p>
            <div className="mt-2 text-sm text-gray-400">
              Code: <span className="font-mono text-gray-800 tracking-widest">{roomId}</span>
            </div>
          </div>
        </div>
      )}

      {isConnected && (
        <div className="flex-1 flex flex-col">
          <div className="mb-6">
            <input 
              type="file" 
              multiple 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileSelect}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm active:scale-[0.99] transition-all"
            >
              Select Files to Send
            </button>
          </div>

          {hasFiles && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">
              <h2 className="font-semibold text-gray-900 border-b border-gray-100 pb-2">Transfers</h2>
              <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
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
                        {file.status === 'pending' && <span className="text-xs font-medium text-gray-400">Pending</span>}
                        {file.status === 'transferring' && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}
                        {file.status === 'complete' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
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
