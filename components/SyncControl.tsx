import React, { useState, useEffect } from 'react';
import { CheckCircle2, WifiOff, RefreshCw } from 'lucide-react';

interface ProgressUpdate {
  totalProcessed: number;
  totalToSync: number;
  done: boolean;
}

const LS_KEY = 'gvc_last_server_sync_time';

export const SyncControl: React.FC = () => {
  const [isSyncing, setIsSyncing]   = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [syncError, setSyncError]   = useState(false);
  const [progress, setProgress]     = useState<{ processed: number; total: number } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) setLastSynced(saved);
    if (!window.electron) return;

    window.electron.onServerSyncTime?.((time: string) => {
      setLastSynced(time);
      setSyncError(false);
      localStorage.setItem(LS_KEY, time);
    });

    window.electron.onSyncProgress?.((data: ProgressUpdate) => {
      setProgress({ processed: data.totalProcessed, total: data.totalToSync });
      if (data.done) {
        setIsSyncing(false);
        const t = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLastSynced(t);
        setSyncError(false);
        localStorage.setItem(LS_KEY, t);
      } else {
        setIsSyncing(true);
      }
    });

    return () => {
      window.electron.removeServerSyncTimeListener?.();
      window.electron.removeSyncProgressListener?.();
    };
  }, []);

  const syncPct = progress && progress.total > 0
    ? Math.round((progress.processed / progress.total) * 100)
    : 0;

  return (
    <div className="flex items-center gap-3">
      {/* Mini progress bar — visible in navbar while sync runs from Admin page */}
      {isSyncing && progress && progress.total > 0 && (
        <div className="hidden md:flex flex-col gap-0.5 min-w-[90px]">
          <div className="flex justify-between items-center text-[10px] font-mono text-blue-500">
            <span className="animate-pulse">Đang sync</span>
            <span>{progress.processed}/{progress.total}</span>
          </div>
          <div className="bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-blue-400 rounded-full transition-all duration-300"
              style={{ width: `${syncPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Status chip */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 text-xs text-gray-600">
        {isSyncing
          ? <RefreshCw size={13} className="animate-spin text-blue-500" />
          : syncError
            ? <WifiOff size={13} className="text-red-500" />
            : <CheckCircle2 size={13} className="text-green-500" />
        }
        <span className="font-mono font-medium">{lastSynced || '--:--'}</span>
      </div>
    </div>
  );
};
