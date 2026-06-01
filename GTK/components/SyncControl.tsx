
import React, { useState, useEffect } from 'react';
import { StationConfig, StationType } from '../types';
import { CloudUpload, CloudDownload, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

interface SyncControlProps {
  stationConfig: StationConfig;
}

export const SyncControl: React.FC<SyncControlProps> = ({ stationConfig }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const savedTime = localStorage.getItem('gvc_last_sync_time');
    if (savedTime) setLastSynced(savedTime);
  }, []);

  const handleSync = async () => {
    if (isSyncing) return;
    
    setIsSyncing(true);
    setStatusMsg(null);

    try {
      // Check if running in Electron
      if (!window.electron) {
        throw new Error("Electron API not available (Browser Mode)");
      }

      let result;
      if (stationConfig.type === StationType.SPOKE) {
        // Spoke Logic: Send Data
        result = await window.electron.triggerSendSync(stationConfig.name);
      } else {
        // Hub Logic: Fetch Data
        result = await window.electron.triggerFetchSync();
      }

      if (result.success) {
        const now = new Date().toLocaleTimeString();
        setLastSynced(now);
        localStorage.setItem('gvc_last_sync_time', now);
        
        let msg = result.message;
        if (result.counts) {
           msg = `Đã gửi: ${result.counts.encounters} Khám, ${result.counts.transactions} Kho`;
        }
        setStatusMsg({ type: 'success', text: msg });
      } else {
        setStatusMsg({ type: 'error', text: result.message || "Lỗi đồng bộ" });
      }

    } catch (error: any) {
      console.error(error);
      setStatusMsg({ type: 'error', text: error.message || "Lỗi kết nối" });
    } finally {
      setIsSyncing(false);
      
      // Clear status message after 5 seconds
      setTimeout(() => {
          if (statusMsg?.type === 'success') setStatusMsg(null);
      }, 5000);
    }
  };

  const isHub = stationConfig.type === StationType.HUB;

  return (
    <div className="flex items-center gap-3">
      {statusMsg && (
         <div className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center animate-in fade-in slide-in-from-right-5 ${
             statusMsg.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
         }`}>
             {statusMsg.type === 'success' ? <CheckCircle size={12} className="mr-1"/> : <AlertCircle size={12} className="mr-1"/>}
             {statusMsg.text}
         </div>
      )}

      <div className="text-right hidden md:block">
         <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Lần đồng bộ cuối / 上次同步</p>
         <p className="text-xs font-mono font-bold text-gray-600">{lastSynced || '--:--'}</p>
      </div>

      <button
        onClick={handleSync}
        disabled={isSyncing}
        className={`flex items-center px-4 py-2 rounded-xl font-bold shadow-sm transition-all active:scale-95 disabled:opacity-70 disabled:cursor-wait ${
            isHub 
            ? 'bg-blue-600 hover:bg-blue-700 text-white' 
            : 'bg-medical-green hover:bg-green-700 text-white'
        }`}
      >
        {isSyncing ? (
            <RefreshCw size={18} className="animate-spin mr-2" />
        ) : isHub ? (
            <CloudDownload size={18} className="mr-2" />
        ) : (
            <CloudUpload size={18} className="mr-2" />
        )}
        
        <span className="text-sm">
            {isSyncing 
             ? (isHub ? 'Đang tải...' : 'Đang gửi...') 
             : (isHub ? 'Cập nhật' : 'Gửi báo cáo')
            }
        </span>
      </button>
    </div>
  );
};
