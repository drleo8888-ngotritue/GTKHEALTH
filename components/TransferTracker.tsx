import React, { useState, useEffect, useCallback } from 'react';
import { Truck, Check, Clock, PackageCheck, RefreshCw, ChevronDown, ChevronUp, X, AlertTriangle } from 'lucide-react';
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

const STEPS = [
  { key: 'created',  label: 'Đã xuất kho' },
  { key: 'transit',  label: 'Đang vận chuyển' },
  { key: 'received', label: 'Đã nhận' },
];
function stepIndex(status: string) {
  if (status === 'CONFIRMED') return 2;
  if (status === 'ACKNOWLEDGED') return 1;
  return 0;
}

export const TransferTracker: React.FC<Props> = ({ stationConfig, currentUser, refreshTrigger, onReceived }) => {
  const isHub = stationConfig.type === StationType.HUB;
  const [transfers, setTransfers] = useState<any[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  // Modal nhận hàng (Spoke)
  const [receiving, setReceiving] = useState<any | null>(null);
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const el: any = window.electron;
    if (!el) return;
    try {
      if (isHub) {
        const res = await el.getServerTransfers?.(stationConfig.name);
        setTransfers((res?.data || []).filter((t: any) => (Date.now() - (t.created_at || 0)) < 7 * DAY));
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

  const openReceive = (t: any) => {
    const init: Record<string, string> = {};
    (t.medicines || []).forEach((m: any) => { init[m.name] = String(m.qty ?? 0); });
    setQtyMap(init);
    setReceiving(t);
  };

  const confirmReceive = async () => {
    if (!receiving) return;
    const receivedItems = (receiving.medicines || []).map((m: any) => ({
      name: m.name, unit: m.unit, batchNumber: m.batchNumber, group: m.group,
      qty: Math.max(0, parseInt(qtyMap[m.name] ?? '0') || 0),
    }));
    setBusy(true);
    const res = await (window.electron as any).receiveTransfer({
      transfer: receiving, receivedItems,
      actorName: currentUser?.name, actorRole: currentUser?.role,
    });
    setBusy(false);
    if (res?.success) { setReceiving(null); await load(); onReceived?.(); }
    else alert('Không xác nhận được: ' + (res?.message || 'lỗi không rõ'));
  };

  // Có chênh lệch giữa SL chuyển và SL thực nhập đang nhập?
  const hasDiff = receiving && (receiving.medicines || []).some(
    (m: any) => (parseInt(qtyMap[m.name] ?? '0') || 0) !== (Number(m.qty) || 0)
  );

  if (transfers.length === 0 && !receiving) return null;

  return (
    <>
      {transfers.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-orange-200 mb-4 animate-fade-in">
          <button onClick={() => setCollapsed(c => !c)} className="w-full flex items-center justify-between px-4 py-2.5 bg-orange-50 rounded-t-lg">
            <span className="flex items-center gap-2 font-bold text-orange-800 text-sm">
              <Truck size={16} />
              {isHub ? 'Theo dõi điều chuyển / 调拨跟踪' : 'Phiếu điều chuyển đến / 调入单'}
              <span className="bg-orange-500 text-white text-[10px] font-bold rounded-full px-2 py-0.5">{transfers.length}</span>
            </span>
            {collapsed ? <ChevronDown size={16} className="text-orange-700" /> : <ChevronUp size={16} className="text-orange-700" />}
          </button>

          {!collapsed && (
            <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
              {transfers.map(t => {
                const meds = Array.isArray(t.medicines) ? t.medicines : [];
                const idx = stepIndex(t.status);
                return (
                  <div key={t.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="text-sm min-w-0">
                        <span className="font-bold text-gray-800">{isHub ? `→ ${t.target_station}` : `← ${t.source_station}`}</span>
                        <span className="text-gray-500 ml-2">{meds.length} mặt hàng</span>
                        {isHub && t.received_note && t.received_note !== 'Nhận đủ theo phiếu' && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full"><AlertTriangle size={10} />{t.received_note}</span>
                        )}
                      </div>
                      {!isHub && (
                        <button onClick={() => openReceive(t)} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 shrink-0">
                          <PackageCheck size={13} /><span>Xem & nhận<span className="block text-[8px] font-normal opacity-80 leading-none">查看收货</span></span>
                        </button>
                      )}
                    </div>
                    <div className="flex items-center">
                      {STEPS.map((s, i) => {
                        const done = i <= idx;
                        const ts = i === 0 ? t.created_at : i === 1 ? t.acknowledged_at : t.confirmed_at;
                        return (
                          <React.Fragment key={s.key}>
                            <div className="flex flex-col items-center" style={{ minWidth: 60 }}>
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center ${done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                                {done ? <Check size={12} /> : <Clock size={11} />}
                              </div>
                              <span className={`text-[10px] mt-0.5 font-medium ${done ? 'text-green-700' : 'text-gray-400'}`}>{s.label}</span>
                              <span className="text-[9px] text-gray-400">{ts ? fmt(ts) : '—'}</span>
                            </div>
                            {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-1 ${i < idx ? 'bg-green-500' : 'bg-gray-200'}`} />}
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
      )}

      {/* Modal nhận hàng (Spoke): hiện chi tiết thuốc + nhập số thực nhận */}
      {receiving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-green-600 p-4 text-white font-bold flex justify-between items-center">
              <span className="flex items-center gap-2"><PackageCheck /> Nhận điều chuyển từ {receiving.source_station}</span>
              <button onClick={() => setReceiving(null)} className="hover:bg-white/20 p-1 rounded-full"><X size={20} /></button>
            </div>

            <div className="p-3 bg-amber-50 border-b border-amber-100 text-xs text-amber-800">
              Đối chiếu thực tế với phiếu. Nếu nhận <b>khác</b> số lượng chuyển, sửa ô "Thực nhận" cho đúng số thuốc thật sự nhận được.
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 border-b">
                  <tr>
                    <th className="text-left py-2">Thuốc / 药品</th>
                    <th className="text-center py-2 w-16">ĐVT</th>
                    <th className="text-center py-2 w-20">SL chuyển</th>
                    <th className="text-center py-2 w-28">Thực nhận</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(receiving.medicines || []).map((m: any, i: number) => {
                    const recv = parseInt(qtyMap[m.name] ?? '0') || 0;
                    const diff = recv !== (Number(m.qty) || 0);
                    return (
                      <tr key={i} className={diff ? 'bg-amber-50' : ''}>
                        <td className="py-2 font-medium text-gray-800">
                          {m.name}
                          {m.batchNumber && <span className="block text-[10px] text-gray-400 font-mono">Lô: {m.batchNumber}</span>}
                        </td>
                        <td className="text-center text-gray-500">{m.unit || '-'}</td>
                        <td className="text-center font-bold text-gray-600">{m.qty}</td>
                        <td className="text-center">
                          <input
                            type="number" min={0}
                            value={qtyMap[m.name] ?? ''}
                            onChange={e => setQtyMap(prev => ({ ...prev, [m.name]: e.target.value }))}
                            className={`w-20 p-1.5 border-2 rounded text-center font-bold outline-none ${diff ? 'border-amber-400 text-amber-700' : 'border-gray-200 focus:border-green-500'}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t bg-gray-50 flex items-center justify-between gap-3">
              <span className="text-xs">
                {hasDiff
                  ? <span className="text-amber-700 font-bold flex items-center gap-1"><AlertTriangle size={14} /> Có chênh lệch — sẽ ghi nhận để Hub đối chiếu</span>
                  : <span className="text-green-700 font-medium">Khớp với phiếu chuyển</span>}
              </span>
              <div className="flex gap-2">
                <button onClick={() => setReceiving(null)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold text-sm hover:bg-gray-300">Hủy</button>
                <button onClick={confirmReceive} disabled={busy} className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg font-bold text-sm hover:bg-green-700 disabled:opacity-50">
                  {busy ? <RefreshCw size={15} className="animate-spin" /> : <Check size={15} />}
                  Xác nhận nhập kho
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
