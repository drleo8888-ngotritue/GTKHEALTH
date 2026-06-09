import React, { useState, useEffect } from 'react';
import { StationConfig } from '../types';
import { RefreshCw, CheckCircle2, WifiOff } from 'lucide-react';

interface SyncControlProps {
  stationConfig: StationConfig;
}

const LS_KEY = 'gvc_last_server_sync_time';

export const SyncControl: React.FC<SyncControlProps> = ({ stationConfig }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [syncError, setSyncError] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) setLastSynced(saved);

    if (!window.electron) return;
    window.electron.onServerSyncTime((time: string) => {
      setLastSynced(time);
      setSyncError(false);
      localStorage.setItem(LS_KEY, time);
    });
    return () => window.electron.removeServerSyncTimeListener?.();
  }, []);

  const handleSyncNow = async () => {
    if (isSyncing || !window.electron) return;
    setIsSyncing(true);
    setSyncError(false);
    try {
      await window.electron.syncNow();
    } catch {
      setSyncError(true);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="text-right hidden md:block">
        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Đồng bộ cuối / 最后同步</p>
        <p className={`text-xs font-mono font-bold ${syncError ? 'text-red-500' : 'text-gray-600'}`}>
          {lastSynced || '--:--'}
        </p>
      </div>

      <button
        onClick={handleSyncNow}
        disabled={isSyncing}
        title="Đồng bộ lên máy chủ ngay"
        className="flex items-center px-3 py-2 rounded-xl font-bold shadow-sm transition-all active:scale-95 disabled:opacity-60 disabled:cursor-wait bg-green-600 hover:bg-green-700 text-white"
      >
        {isSyncing
          ? <RefreshCw size={16} className="animate-spin mr-1.5" />
          : syncError
            ? <WifiOff size={16} className="mr-1.5" />
            : <CheckCircle2 size={16} className="mr-1.5" />
        }
        <span className="text-sm">
          Sync
          <span className="block text-[9px] font-normal opacity-80 leading-tight">同步</span>
        </span>
      </button>
    </div>
  );
};
