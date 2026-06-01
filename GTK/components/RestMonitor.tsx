import React, { useEffect, useState } from 'react';
import { AlertOctagon } from 'lucide-react';
import { storage } from '../services/storage';
import { Encounter, EncounterStatus } from '../types';

export const RestMonitor: React.FC = () => {
  const [alerts, setAlerts] = useState<Encounter[]>([]);

  useEffect(() => {
    const checkRestTimes = () => {
      const encounters = storage.getEncounters();
      const now = Date.now();
      const overdue = encounters.filter(e => {
        if ((e.status === EncounterStatus.REST_30 || e.status === EncounterStatus.MONITOR) && e.restStartTime) {
          // 30 minutes in milliseconds
          return (now - e.restStartTime) >= (30 * 60 * 1000); 
        }
        return false;
      });
      setAlerts(overdue);
    };

    const interval = setInterval(checkRestTimes, 10000); // Check every 10s
    return () => clearInterval(interval);
  }, []);

  const dismissAlert = (id: string) => {
    const enc = storage.getEncounters().find(e => e.id === id);
    if (enc) {
      enc.status = EncounterStatus.COMPLETED_WORK; // Assume return to work after alert handled
      storage.updateEncounter(enc);
      setAlerts(prev => prev.filter(a => a.id !== id));
    }
  };

  if (alerts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {alerts.map(alert => (
        <div key={alert.id} className="bg-red-600 text-white p-4 rounded-xl shadow-2xl flex items-center animate-bounce">
           <AlertOctagon size={32} className="mr-3" />
           <div>
             <h4 className="font-bold text-lg">CẢNH BÁO NGHỈ QUÁ GIỜ! / 休息超时!</h4>
             <p className="text-sm opacity-90">{alert.patientName} - {alert.department}</p>
             {/* SỬA LỖI Ở DÒNG NÀY: Thay > bằng &gt; */}
             <p className="text-xs">&gt; 30 phút / 分钟</p>
           </div>
           <button 
             onClick={() => dismissAlert(alert.id)}
             className="ml-4 bg-white text-red-600 px-4 py-2 rounded-lg font-bold hover:bg-red-50"
           >
             Đã biết / 收到 (Confirm)
           </button>
        </div>
      ))}
    </div>
  );
};