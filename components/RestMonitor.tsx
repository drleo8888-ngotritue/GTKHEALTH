import React, { useEffect, useState, useRef } from 'react';
import { AlertOctagon, X } from 'lucide-react';
import { EncounterStatus } from '../types';

export const RestMonitor: React.FC = () => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const dismissedRef = useRef<Set<string>>(new Set());
  const notifiedOsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Electron: Notification permission tự động là 'granted', không cần hỏi
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const checkRestTimes = async () => {
      if (!window.electron) return;

      let encounters: any[] = [];
      try {
        encounters = await window.electron.getEncounters();
      } catch {
        return;
      }

      const now = Date.now();
      const overdue = encounters.filter(e => {
        if (dismissedRef.current.has(e.id)) return false;
        if (
          (e.status === EncounterStatus.REST_30 || e.status === EncounterStatus.MONITOR) &&
          e.restStartTime
        ) {
          return (now - e.restStartTime) >= 30 * 60 * 1000;
        }
        return false;
      });

      // Gửi Windows toast notification cho người mới phát hiện lần đầu
      for (const enc of overdue) {
        if (!notifiedOsRef.current.has(enc.id)) {
          notifiedOsRef.current.add(enc.id);
          const mins = Math.floor((now - enc.restStartTime) / 60000);
          if ('Notification' in window) {
            new Notification('⏰ Nghỉ quá giờ!', {
              body: `${enc.patientName} — đã nghỉ ${mins} phút`,
              tag: `rest_${enc.id}`,
            });
          }
        }
      }

      setAlerts(overdue);
    };

    checkRestTimes();
    const interval = setInterval(checkRestTimes, 10000);
    return () => clearInterval(interval);
  }, []);

  const dismissAlert = (id: string) => {
    dismissedRef.current.add(id);
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  if (alerts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs">
      {alerts.map(alert => {
        const mins = Math.floor((Date.now() - alert.restStartTime) / 60000);
        const isMonitor = alert.status === EncounterStatus.MONITOR;
        return (
          <div
            key={alert.id}
            className="bg-red-600 text-white rounded-xl shadow-2xl flex items-start gap-3 p-4 animate-bounce"
          >
            <AlertOctagon size={26} className="shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm leading-tight">
                {isMonitor ? 'THEO DÕI QUÁ GIỜ!' : 'NGHỈ QUÁ GIỜ!'} / {isMonitor ? '监测超时' : '休息超时'}
              </p>
              <p className="text-sm opacity-90 truncate mt-0.5">{alert.patientName}</p>
              <p className="text-xs opacity-75">{alert.department} — {mins} phút / 分钟</p>
            </div>
            <button
              onClick={() => dismissAlert(alert.id)}
              title="Đã biết / 收到"
              className="shrink-0 bg-white/20 hover:bg-white/30 rounded-lg p-1.5 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
