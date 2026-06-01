import React, { useState, useEffect } from 'react';
import { StationConfig, StationType } from '../types';
import { Upload, Download, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface SyncControlProps {
  stationConfig: StationConfig;
}

type StatusMsg = { type: 'success' | 'error' | 'warn'; text: string } | null;

export const SyncControl: React.FC<SyncControlProps> = ({ stationConfig }) => {
  const [isBusy, setIsBusy] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<StatusMsg>(null);

  useEffect(() => {
    const saved = localStorage.getItem('gvc_last_sync_time');
    if (saved) setLastSynced(saved);
  }, []);

  const setStatus = (type: 'success' | 'error' | 'warn', text: string) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 6000);
  };

  const markSyncTime = () => {
    const d = new Date(); const now = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    setLastSynced(now);
    localStorage.setItem('gvc_last_sync_time', now);
  };

  // SPOKE: Xuất file báo cáo lâm sàng
  const handleExportClinical = async () => {
    if (isBusy || !window.electron) return;
    setIsBusy(true);
    setStatusMsg(null);
    try {
      const result = await window.electron.exportClinicalData(stationConfig.name);
      if (result.success) {
        markSyncTime();
        setStatus('success', `Đã xuất ${result.count} ca khám.`);
      } else {
        setStatus(result.message?.includes('hủy') ? 'warn' : 'error', result.message || 'Lỗi xuất file');
      }
    } catch (e: any) {
      setStatus('error', e.message || 'Lỗi hệ thống');
    } finally {
      setIsBusy(false);
    }
  };

  // HUB: Nhập thông minh — tự nhận diện CLINICAL_REPORT hay MEDICINE_REPORT
  const handleSmartImport = async () => {
    if (isBusy || !window.electron) return;
    setIsBusy(true);
    setStatusMsg(null);
    try {
      const result = await window.electron.smartImport();
      if (result.success) {
        markSyncTime();
        if (result.fileType === 'CLINICAL_REPORT') {
          setStatus('success', `Nhập xong ${result.count} ca từ trạm ${result.sourceStation}.`);
        } else if (result.fileType === 'MEDICINE_REPORT') {
          setStatus('success', `Đã nhập báo cáo thuốc của ${result.sourceStation} T${result.periodMonth}/${result.periodYear}.`);
        } else {
          setStatus('success', result.message);
        }
      } else if (result.duplicate) {
        setStatus('warn', result.message || 'File đã được nhập trước đó!');
      } else {
        setStatus(result.message?.includes('hủy') ? 'warn' : 'error', result.message || 'Lỗi nhập file');
      }
    } catch (e: any) {
      setStatus('error', e.message || 'Lỗi hệ thống');
    } finally {
      setIsBusy(false);
    }
  };

  const isHub = stationConfig.type === StationType.HUB;

  return (
    <div className="flex items-center gap-3">
      {statusMsg && (
        <div className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${
          statusMsg.type === 'success' ? 'bg-green-100 text-green-700' :
          statusMsg.type === 'warn'    ? 'bg-yellow-100 text-yellow-700' :
                                         'bg-red-100 text-red-700'
        }`}>
          {statusMsg.type === 'success' ? <CheckCircle size={12}/> : <AlertCircle size={12}/>}
          {statusMsg.text}
        </div>
      )}

      <div className="text-right hidden md:block">
        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Đồng bộ cuối / 最后同步</p>
        <p className="text-xs font-mono font-bold text-gray-600">{lastSynced || '--:--'}</p>
      </div>

      <button
        onClick={isHub ? handleSmartImport : handleExportClinical}
        disabled={isBusy}
        title={isHub ? 'Nhập file báo cáo từ Spoke (tự nhận diện loại)' : 'Xuất file báo cáo lâm sàng gửi HUB'}
        className={`flex items-center px-4 py-2 rounded-xl font-bold shadow-sm transition-all active:scale-95 disabled:opacity-60 disabled:cursor-wait ${
          isHub ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-medical-green hover:bg-green-700 text-white'
        }`}
      >
        {isBusy ? <RefreshCw size={18} className="animate-spin mr-2"/> :
          isHub ? <Download size={18} className="mr-2"/> : <Upload size={18} className="mr-2"/>
        }
        <span className="text-sm">{isHub ? <span>Nhập BC<span className="block text-[9px] font-normal opacity-80 leading-tight">导入报告</span></span> : <span>Xuất BC<span className="block text-[9px] font-normal opacity-80 leading-tight">导出报告</span></span>}</span>
      </button>
    </div>
  );
};
