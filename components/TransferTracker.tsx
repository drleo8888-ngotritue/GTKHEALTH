import React, { useState, useEffect, useCallback } from 'react';
import { Truck, Check, Clock, PackageCheck, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { StationConfig, StationType, User } from '../types';

interface Props {
  stationConfig: StationConfig;
  currentUser?: User | null;
  refreshTrigger?: number;
  onReceived?: () => void; // reload kho sau khi xác nhận nhận
}

const DAY = 24 * 60 * 60 * 1000;

const fmt = (ts?: number) => {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// 3 mốc vòng đời phiếu điều chuyển (Stock Transfer Order)
const STEPS = [
  { key: 'created',  label: 'Đã xuất kho',     sub: '已出库' },
  { key: 'transit',  label: 'Đang vận chuyển', sub: '运输中' },
  { key: 'received', label: 'Đã nhận đủ',      sub: '已入库' },
];
function stepIndex(status: string) {
  if (status === 'CONFIRMED') return 2;      // đã nhận đủ
  if (status === 'ACKNOWLEDGED') return 1;   // đang vận chuyển
  return 0;                                  // PENDING — vừa xuất kho
}

export const TransferTracker: React.FC<Props> = ({ stationConfig, currentUser, refreshTrigger, onReceived }) => {
  const isHub = stationConfig.type === StationType.HUB;
  const [transfers, setTransfers] = useState<any[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const load = useCallback(async () => {
    const el: any = window.electron;
    if (!el) return;
    try {
      if (isHub) {
        const res = await el.getServerTransfers?.(stationConfig.name);
        const list = (res?.data || []).filter((t: any) => (Date.now() - (t.created_at || 0)) < 7 * DAY);
        setTransfers(list);
      } else {
        const res = await el.listIncomingTransfers?.();
        setTransfers(res?.data || []);
      }
    } catch { /* im lặng */ }
  }, [isHub, stationConfig.name]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load, refreshTrigger]);

  const handleReceive = async (t: any) => {
    const meds = Array.isArray(t.medicines) ? t.medicines : [];
    if (!window.confirm(
      `Xác nhận ĐÃ NHẬN ĐỦ ${meds.length} mặt hàng từ ${t.source_station}?\n` +
      `Kho của trạm sẽ được cộng thêm số lượng tương ứng.`
    )) return;
    setBusyId(t.id);
    const res = await (window.electron as any).receiveTransfer({ transfer: t, actorName: currentUser?.name, actorRole: currentUser?.role });
    setBusyId(null);
    if (res?.success) { await load(); onReceived?.(); }
    else alert('Không xác nhận được: ' + (res?.message || 'lỗi không rõ'));
  };

  if (transfers.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-orange-200 mb-4 animate-fade-in">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-orange-50 rounded-t-lg"
      >
        <span className="flex items-center gap-2 font-bold text-orange-800 text-sm">
          <Truck size={16} />
          {isHub ? 'Theo dõi điều chuyển / 调拨跟踪' : 'Phiếu điều chuyển đến / 调入单'}
          <span className="bg-orange-500 text-white text-[10px] font-bold rounded-full px-2 py-0.5">{transfers.length}</span>
        </span>
        {collapsed ? <ChevronDown size={16} className="text-orange-700" /> : <ChevronUp size={16} className="text-orange-700" />}
      </button>

      {!collapsed && (
        <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
          {transfers.map(t => {
            const meds = Array.isArray(t.medicines) ? t.medicines : [];
            const idx = stepIndex(t.status);
            return (
              <div key={t.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="text-sm">
                    <span className="font-bold text-gray-800">
                      {isHub ? `→ ${t.target_station}` : `← ${t.source_station}`}
                    </span>
                    <span className="text-gray-500 ml-2">{meds.length} mặt hàng</span>
                  </div>
                  {/* Spoke: nút xác nhận khi đã nhận hàng vật lý */}
                  {!isHub && (
                    <button
                      onClick={() => handleReceive(t)}
                      disabled={busyId === t.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 disabled:opacity-50 shrink-0"
                    >
                      {busyId === t.id ? <RefreshCw size={13} className="animate-spin" /> : <PackageCheck size={13} />}
                      <span>Đã nhận đủ<span className="block text-[8px] font-normal opacity-80 leading-none">确认收货</span></span>
                    </button>
                  )}
                </div>

                {/* Stepper 3 mốc */}
                <div className="flex items-center">
                  {STEPS.map((s, i) => {
                    const done = i <= idx;
                    const ts = i === 0 ? t.created_at : i === 1 ? t.acknowledged_at : t.confirmed_at;
                    return (
                      <React.Fragment key={s.key}>
                        <div className="flex flex-col items-center" style={{ minWidth: 64 }}>
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center ${done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                            {done ? <Check size={12} /> : <Clock size={11} />}
                          </div>
                          <span className={`text-[10px] mt-0.5 font-medium ${done ? 'text-green-700' : 'text-gray-400'}`}>{s.label}</span>
                          <span className="text-[9px] text-gray-400">{ts ? fmt(ts) : '—'}</span>
                        </div>
                        {i < STEPS.length - 1 && (
                          <div className={`flex-1 h-0.5 mx-1 ${i < idx ? 'bg-green-500' : 'bg-gray-200'}`} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
