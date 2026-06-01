/**
 * PeriodCloseModal.tsx — Chốt kỳ thuốc/vật tư
 *
 * Phase 0: Chọn kỳ (tháng/quý + năm)
 * Phase 1: Nhập kiểm kê thực tế
 * Phase 2: Quyết định xử lý hụt (bổ sung đơn / xác nhận hao hụt)
 * Phase 3a: Kê đơn bổ sung (2 cột) — bắt buộc kê hết mới chốt
 * Phase 3b: Xác nhận hao hụt → chốt luôn
 */
import React, { useState, useMemo, useEffect } from 'react';
import {
  X, ChevronRight, ChevronLeft, Lock, FileEdit,
  AlertTriangle, CheckCircle, User, Calendar, Pill, Search,
  Send, FileDown,
} from 'lucide-react';
import { Medicine, InventoryLog, StationConfig, User as UserType, MedicineType, Role } from '../types';
import { storage } from '../services/storage';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PeriodCloseModalProps {
  medicines: Medicine[];
  logs: InventoryLog[];
  stationConfig: StationConfig;
  currentUser: UserType;
  onClose: () => void;
  onSuccess: () => void; // reload data sau khi chốt
}

type Phase = 'select' | 'count' | 'decision' | 'supplement' | 'confirmLoss' | 'done';
type PeriodType = 'MONTHLY' | 'QUARTERLY';

interface CountRow {
  name: string;
  unit: string;
  appStock: number;
  actualStock: number | ''; // '' = chưa nhập
}

interface DiscrepancyItem {
  name: string;
  unit: string;
  diff: number;    // > 0 = hụt (app > thực)
  remaining: number; // giảm dần khi kê đơn
}

interface SupplementRx {
  medicineName: string;
  quantity: number;
  unit?: string;
}

interface SupplementEntry {
  patientId: string;
  patientName: string;
  department: string;
  diagnosis: string;
  diseaseGroup: string;
  prescriptionDate: string; // YYYY-MM-DD
  prescriptions: SupplementRx[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDateRange(type: PeriodType, ref: number, year: number): [number, number] {
  if (type === 'MONTHLY') {
    return [
      new Date(year, ref - 1, 1).setHours(0, 0, 0, 0),
      new Date(year, ref, 0).setHours(23, 59, 59, 999),
    ];
  }
  const sm = (ref - 1) * 3 + 1;
  const em = ref * 3;
  return [
    new Date(year, sm - 1, 1).setHours(0, 0, 0, 0),
    new Date(year, em, 0).setHours(23, 59, 59, 999),
  ];
}

function calcAppStock(
  medName: string, stationName: string,
  medicines: Medicine[], logs: InventoryLog[],
  startTs: number, endTs: number
): number {
  // Tồn cuối kỳ = stock thực trong DB (đã được fallback-calibrated)
  // Đây là cách đơn giản nhất và nhất quán với logic hiện tại
  return medicines
    .filter(m => m.name === medName && (m.station === stationName || m.station === 'Unknown'))
    .reduce((sum, m) => sum + m.stock, 0);
}

const QUARTERS = [
  { value: 1 as const, label: 'Quý 1', months: 'T1–T3' },
  { value: 2 as const, label: 'Quý 2', months: 'T4–T6' },
  { value: 3 as const, label: 'Quý 3', months: 'T7–T9' },
  { value: 4 as const, label: 'Quý 4', months: 'T10–T12' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export const PeriodCloseModal: React.FC<PeriodCloseModalProps> = (props) => {
  const { medicines, logs, stationConfig, currentUser, onClose, onSuccess } = props;

  const now = new Date();
  const [phase,           setPhase]           = useState<Phase>('select');
  const [periodType,      setPeriodType]      = useState<PeriodType>('MONTHLY');
  const [periodRef,       setPeriodRef]       = useState<number>(now.getMonth() + 1);
  const [periodYear,      setPeriodYear]      = useState<number>(now.getFullYear());
  const [medType,         setMedType]         = useState<MedicineType>('MEDICINE');
  const [countRows,       setCountRows]       = useState<CountRow[]>([]);
  const [discrepancies,   setDiscrepancies]   = useState<DiscrepancyItem[]>([]);
  const [isSaving,        setIsSaving]        = useState(false);
  const [isSendingReport, setIsSendingReport] = useState(false);
  const [reportSent,      setReportSent]      = useState(false);

  // Phase 3a: supplement state
  const [supplement, setSupplement] = useState<SupplementEntry>({
    patientId: '', patientName: '', department: '',
    diagnosis: '', diseaseGroup: '',
    prescriptionDate: now.toISOString().slice(0, 10),
    prescriptions: [],
  });
  const [patientSearch,   setPatientSearch]   = useState('');
  const [patientResults,  setPatientResults]  = useState<any[]>([]);
  const [savedEntries,    setSavedEntries]    = useState<SupplementEntry[]>([]);

  const periodLabel = periodType === 'MONTHLY'
    ? `Tháng ${String(periodRef).padStart(2,'0')}/${periodYear}`
    : `Quý ${periodRef}/${periodYear}`;

  // Remaining discrepancies (live update)
  const remaining = useMemo<DiscrepancyItem[]>(() => {
    return discrepancies.map(d => {
      const prescribed = savedEntries
        .flatMap(e => e.prescriptions)
        .filter(rx => rx.medicineName === d.name)
        .reduce((s, rx) => s + rx.quantity, 0);
      return { ...d, remaining: Math.max(0, d.diff - prescribed) };
    });
  }, [discrepancies, savedEntries]);

  const allCovered = remaining.every(d => d.remaining === 0);

  // ── Bước: Sang phase count ──
  const goToCount = () => {
    const filtered = medicines.filter(m =>
      (m.type || 'MEDICINE') === medType &&
      m.batchNumber !== 'DANH_MUC_GOC' &&
      (m.station === stationConfig.name || m.station === 'Unknown')
    );
    const nameMap = new Map<string, { unit: string; stock: number }>();
    filtered.forEach(m => {
      const cur = nameMap.get(m.name);
      nameMap.set(m.name, {
        unit: m.unit,
        stock: (cur?.stock ?? 0) + m.stock,
      });
    });
    const rows: CountRow[] = Array.from(nameMap.entries())
      .map(([name, { unit, stock }]) => ({ name, unit, appStock: stock, actualStock: '' }))
      .sort((a, b) => a.name.localeCompare(b.name));
    setCountRows(rows);
    setPhase('count');
  };

  // ── Bước: Sang phase decision ──
  const goToDecision = () => {
    const diffs: DiscrepancyItem[] = countRows
      .filter(r => r.actualStock !== '' && (r.appStock - Number(r.actualStock)) > 0)
      .map(r => ({
        name: r.name,
        unit: r.unit,
        diff: r.appStock - Number(r.actualStock),
        remaining: r.appStock - Number(r.actualStock),
      }));
    setDiscrepancies(diffs);
    if (diffs.length === 0) {
      // Không có hụt → chốt luôn
      handleClose([]);
    } else {
      setPhase('decision');
    }
  };

  // ── Tìm bệnh nhân ──
  useEffect(() => {
    if (patientSearch.length < 2) { setPatientResults([]); return; }
    const results = storage.searchPatients(patientSearch, 10);
    setPatientResults(results);
  }, [patientSearch]);

  // ── Thêm thuốc vào đơn supplement ──
  const addRxToSupplement = (name: string, unit: string) => {
    setSupplement(prev => {
      const existing = prev.prescriptions.find(r => r.medicineName === name);
      if (existing) return prev;
      return { ...prev, prescriptions: [...prev.prescriptions, { medicineName: name, quantity: 1, unit }] };
    });
  };

  const updateRxQty = (name: string, qty: number) => {
    setSupplement(prev => ({
      ...prev,
      prescriptions: prev.prescriptions.map(r =>
        r.medicineName === name ? { ...r, quantity: Math.max(1, qty) } : r
      ),
    }));
  };

  const removeRx = (name: string) => {
    setSupplement(prev => ({ ...prev, prescriptions: prev.prescriptions.filter(r => r.medicineName !== name) }));
  };

  // ── Lưu 1 đơn bổ sung ──
  const saveSupplement = async () => {
    if (!supplement.patientId || supplement.prescriptions.length === 0) {
      alert('Vui lòng chọn bệnh nhân và kê ít nhất 1 thuốc.');
      return;
    }
    setIsSaving(true);
    try {
      const id = crypto.randomUUID();
      const data = {
        id, ...supplement,
        stationName: stationConfig.name,
        stationId: stationConfig.id,
        symptoms: [],
        prescriptionDate: new Date(supplement.prescriptionDate).getTime(),
      };
      if ((window as any).electron) {
        await (window as any).electron.createSupplementaryEncounter(data);
      }
      setSavedEntries(prev => [...prev, { ...supplement }]);
      setSupplement(prev => ({
        ...prev,
        patientId: '', patientName: '', department: '',
        diagnosis: '', diseaseGroup: '', prescriptions: [],
      }));
      setPatientSearch('');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Chốt kỳ ──
  const handleClose = async (adjustments: { name: string; qty: number }[]) => {
    setIsSaving(true);
    try {
      const snapshot = countRows.map(r => ({
        name: r.name, unit: r.unit,
        appStock: r.appStock,
        actualStock: r.actualStock === '' ? r.appStock : Number(r.actualStock),
      }));
      const data = {
        id: crypto.randomUUID(),
        station: stationConfig.name,
        periodType, periodYear, periodRef,
        closedBy: currentUser.name,
        snapshot, adjustments,
      };
      if ((window as any).electron) {
        await (window as any).electron.closePeriod(data);
      }
      setPhase('done');
      onSuccess();
    } finally {
      setIsSaving(false);
    }
  };

  // ── Xuất báo cáo thuốc tháng gửi về E4 ──
  const handleExportReport = async () => {
    setIsSendingReport(true);
    try {
      // Tính usage từ logs trong kỳ
      const [startTs, endTs] = getDateRange(periodType, periodRef, periodYear);
      const usageMap: Record<string, number> = {};
      const importMap: Record<string, number> = {};

      for (const log of logs) {
        if (log.timestamp < startTs || log.timestamp > endTs) continue;
        for (const item of log.items) {
          const qty = item.qty ?? 0;
          if (log.type === 'EXPORT_USE') {
            usageMap[item.name] = (usageMap[item.name] || 0) + qty;
          }
          if (log.type.startsWith('IMPORT')) {
            importMap[item.name] = (importMap[item.name] || 0) + qty;
          }
        }
      }

      // Tổng hợp theo countRows (đã có tồn cuối thực tế)
      const items = countRows.map(r => {
        const closingActual = r.actualStock === '' ? r.appStock : Number(r.actualStock);
        const used    = usageMap[r.name] || 0;
        const imported = importMap[r.name] || 0;
        const opening = closingActual + used - imported;
        const med = medicines.find(m => m.name === r.name);
        return {
          name: r.name,
          unit: r.unit,
          group: med?.group || '',
          opening: Math.max(0, opening),
          import: imported,
          usage: used,
          closing: closingActual,
        };
      });

      if ((window as any).electron) {
        const result = await (window as any).electron.exportMedicineReport({
          stationName: stationConfig.name,
          periodType,
          periodMonth: periodRef,
          periodYear,
          items,
        });
        if (result.success) setReportSent(true);
        else alert(`Lỗi: ${result.message}`);
      }
    } finally {
      setIsSendingReport(false);
    }
  };

  // ─── Render theo phase ────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/80 p-4">
      <div className={`bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col
        ${phase === 'supplement' ? 'w-full max-w-5xl h-[90vh]' : 'w-full max-w-2xl'}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-800 text-white shrink-0">
          <div className="flex items-center gap-2">
            <Lock size={20} className="text-yellow-300"/>
            <div>
              <p className="font-bold text-base">Chốt kỳ kho dược / 结算药房周期</p>
              {phase !== 'select' && <p className="text-xs text-slate-300">{periodLabel} — Trạm {stationConfig.name}</p>}
            </div>
          </div>
          {phase !== 'done' && (
            <button onClick={onClose} className="hover:bg-slate-700 p-1.5 rounded-lg transition"><X size={18}/></button>
          )}
        </div>

        {/* ── Phase: select ── */}
        {phase === 'select' && (
          <div className="p-6 space-y-5">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Loại hàng hoá / 货品类型</p>
              <div className="flex gap-2">
                {(['MEDICINE','SUPPLY'] as MedicineType[]).map(t => (
                  <button key={t} onClick={() => setMedType(t)}
                    className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                      medType === t ? 'border-green-500 bg-green-50 text-green-800' : 'border-slate-200 text-slate-500'
                    }`}>{t === 'MEDICINE' ? <span>Thuốc<span className="block text-[9px] font-normal opacity-70 leading-tight">药品</span></span> : <span>Vật tư y tế<span className="block text-[9px] font-normal opacity-70 leading-tight">医用耗材</span></span>}</button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Loại kỳ / 周期类型</p>
              <div className="flex gap-2">
                {(['MONTHLY','QUARTERLY'] as PeriodType[]).map(t => (
                  <button key={t} onClick={() => {
                    setPeriodType(t);
                    setPeriodRef(t === 'MONTHLY' ? now.getMonth()+1 : Math.ceil((now.getMonth()+1)/3));
                  }}
                    className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                      periodType === t ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-500'
                    }`}>{t === 'MONTHLY' ? <span>Theo tháng<span className="block text-[9px] font-normal opacity-70 leading-tight">按月</span></span> : <span>Theo quý<span className="block text-[9px] font-normal opacity-70 leading-tight">按季度</span></span>}</button>
                ))}
              </div>
            </div>

            {periodType === 'MONTHLY' ? (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-slate-500 block mb-1">Tháng / 月份</label>
                  <select value={periodRef} onChange={e => setPeriodRef(Number(e.target.value))}
                    className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:border-blue-400 bg-white">
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>Tháng {m}</option>)}
                  </select>
                </div>
                <div className="w-28">
                  <label className="text-xs text-slate-500 block mb-1">Năm / 年份</label>
                  <input type="number" value={periodYear} min={2020} max={2099}
                    onChange={e => setPeriodYear(Number(e.target.value))}
                    className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:border-blue-400"/>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {QUARTERS.map(q => (
                    <button key={q.value} onClick={() => setPeriodRef(q.value)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        periodRef === q.value ? 'border-blue-500 bg-blue-50' : 'border-slate-200'
                      }`}>
                      <span className={`font-bold text-sm block ${periodRef === q.value ? 'text-blue-800' : 'text-slate-700'}`}>{q.label}</span>
                      <span className="text-xs text-slate-400">{q.months}</span>
                    </button>
                  ))}
                </div>
                <div className="w-28">
                  <label className="text-xs text-slate-500 block mb-1">Năm</label>
                  <input type="number" value={periodYear} min={2020} max={2099}
                    onChange={e => setPeriodYear(Number(e.target.value))}
                    className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold"/>
                </div>
              </div>
            )}

            <button onClick={goToCount}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-bold px-5 py-3 rounded-xl transition shadow-md text-sm">
              <span>Bắt đầu kiểm kê<span className="block text-[9px] font-normal opacity-80 leading-tight">开始盘点</span></span> <ChevronRight size={18}/>
            </button>
          </div>
        )}

        {/* ── Phase: count ── */}
        {phase === 'count' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="px-6 py-3 bg-blue-50 border-b border-blue-100">
              <p className="text-sm text-blue-700 font-medium">Nhập số lượng <strong>thực tế</strong> đếm được. Để trống = khớp với app.</p>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="p-3 text-left font-bold text-slate-600">{medType === 'MEDICINE' ? 'Tên thuốc / 药品名' : 'Tên vật tư / 耗材名'}</th>
                    <th className="p-3 text-center font-bold text-slate-600">ĐVT / 单位</th>
                    <th className="p-3 text-right font-bold text-slate-600">Tồn app / 系统库存</th>
                    <th className="p-3 text-right font-bold text-slate-600">Tồn thực tế / 实际库存</th>
                    <th className="p-3 text-right font-bold text-slate-600">Chênh lệch / 差异</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {countRows.map((row, idx) => {
                    const actual = row.actualStock === '' ? row.appStock : Number(row.actualStock);
                    const diff = row.appStock - actual;
                    return (
                      <tr key={row.name} className="hover:bg-slate-50">
                        <td className="p-3 font-medium text-slate-800">{row.name}</td>
                        <td className="p-3 text-center text-slate-500">{row.unit}</td>
                        <td className="p-3 text-right font-mono text-slate-700">{row.appStock}</td>
                        <td className="p-3 text-right">
                          <input
                            type="number" min={0}
                            value={row.actualStock}
                            placeholder={String(row.appStock)}
                            onChange={e => {
                              const v = e.target.value === '' ? '' : Math.max(0, Number(e.target.value));
                              setCountRows(prev => prev.map((r,i) => i===idx ? {...r, actualStock: v} : r));
                            }}
                            className="w-24 text-right border-2 border-slate-200 rounded-lg px-2 py-1 font-mono focus:outline-none focus:border-blue-400"
                          />
                        </td>
                        <td className={`p-3 text-right font-bold font-mono ${
                          diff > 0 ? 'text-red-600' : diff < 0 ? 'text-green-600' : 'text-slate-400'
                        }`}>
                          {diff > 0 ? `−${diff}` : diff < 0 ? `+${Math.abs(diff)}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between items-center px-6 py-4 border-t border-slate-200 shrink-0">
              <button onClick={() => setPhase('select')} className="flex items-center gap-1 text-slate-500 hover:text-slate-700 text-sm font-bold">
                <ChevronLeft size={16}/> Quay lại / 返回
              </button>
              <button onClick={goToDecision}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-bold px-5 py-2.5 rounded-xl transition text-sm">
                Tiếp tục / 继续 <ChevronRight size={18}/>
              </button>
            </div>
          </div>
        )}

        {/* ── Phase: decision ── */}
        {phase === 'decision' && (
          <div className="p-6 space-y-5">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="font-bold text-red-800 mb-3 flex items-center gap-2">
                <AlertTriangle size={18}/> Phát hiện {discrepancies.length} loại {medType === 'MEDICINE' ? 'thuốc' : 'vật tư'} bị hụt:
              </p>
              <div className="space-y-1.5">
                {discrepancies.map(d => (
                  <div key={d.name} className="flex justify-between text-sm">
                    <span className="text-red-700 font-medium">{d.name}</span>
                    <span className="text-red-800 font-bold font-mono">−{d.diff} {d.unit}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-slate-700 font-medium text-center text-sm">
              Có {medType === 'MEDICINE' ? 'thuốc' : 'vật tư'} đã phát nhưng <strong>chưa kê đơn</strong> không?
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setPhase('supplement')}
                className="flex flex-col items-center p-4 rounded-xl border-2 border-green-400 bg-green-50 hover:bg-green-100 transition">
                <FileEdit size={28} className="text-green-700 mb-1"/>
                <span className="font-bold text-green-800 text-sm">Có — Bổ sung đơn / 是 — 补录处方</span>
                <span className="text-xs text-green-600 mt-0.5">Kê đơn cho BN chưa được ghi nhận / 为未记录病人补开处方</span>
              </button>
              <button onClick={() => setPhase('confirmLoss')}
                className="flex flex-col items-center p-4 rounded-xl border-2 border-red-300 bg-red-50 hover:bg-red-100 transition">
                <AlertTriangle size={28} className="text-red-600 mb-1"/>
                <span className="font-bold text-red-700 text-sm">Không — Xác nhận hao hụt / 否 — 确认损耗</span>
                <span className="text-xs text-red-500 mt-0.5">Ghi nhận mất mát, hỏng hóc... / 记录损失、破损</span>
              </button>
            </div>

            <button onClick={() => setPhase('count')} className="w-full text-slate-400 hover:text-slate-600 text-sm font-bold py-2">
              ← Quay lại sửa kiểm kê / 返回修改盘点
            </button>
          </div>
        )}

        {/* ── Phase: supplement ── */}
        {phase === 'supplement' && (
          <div className="flex flex-1 overflow-hidden">

            {/* Cột trái: kê đơn */}
            <div className="flex-1 flex flex-col border-r border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-green-50 border-b border-green-100 shrink-0">
                <p className="text-sm font-bold text-green-800">Kê đơn bổ sung</p>
                <p className="text-xs text-green-600">Nhập từng bệnh nhân đã nhận {medType === 'MEDICINE' ? 'thuốc' : 'vật tư'}</p>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-3">

                {/* Tìm bệnh nhân */}
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-2.5 text-slate-400"/>
                  <input value={patientSearch} onChange={e => setPatientSearch(e.target.value)}
                    placeholder="Tìm mã NV hoặc tên bệnh nhân..."
                    className="w-full pl-9 pr-3 py-2 border-2 border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-400"/>
                  {patientResults.length > 0 && (
                    <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-auto">
                      {patientResults.map((p: any) => (
                        <button key={p.id} onClick={() => {
                          setSupplement(prev => ({...prev, patientId: p.id, patientName: p.name, department: p.department || ''}));
                          setPatientSearch('');
                          setPatientResults([]);
                        }} className="w-full text-left px-3 py-2 hover:bg-green-50 text-sm">
                          <span className="font-bold text-slate-800">{p.id}</span>
                          <span className="text-slate-600 ml-2">{p.name}</span>
                          <span className="text-slate-400 text-xs ml-2">{p.department}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {supplement.patientName && (
                  <div className="bg-green-50 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                    <User size={14} className="text-green-700"/>
                    <span className="font-bold text-green-800">{supplement.patientId}</span>
                    <span className="text-green-700">{supplement.patientName}</span>
                    <span className="text-green-600 text-xs">{supplement.department}</span>
                  </div>
                )}

                {/* Ngày kê */}
                <div>
                  <label className="text-xs text-slate-500 block mb-1 flex items-center gap-1">
                    <Calendar size={12}/> Ngày kê đơn thực tế
                  </label>
                  <input type="date" value={supplement.prescriptionDate}
                    onChange={e => setSupplement(prev => ({...prev, prescriptionDate: e.target.value}))}
                    className="w-full border-2 border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"/>
                </div>

                {/* Chẩn đoán */}
                <input value={supplement.diagnosis}
                  onChange={e => setSupplement(prev => ({...prev, diagnosis: e.target.value}))}
                  placeholder="Chẩn đoán..."
                  className="w-full border-2 border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"/>

                {/* Danh sách đơn thuốc đang kê */}
                {supplement.prescriptions.length > 0 && (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600">Đơn đang kê</div>
                    {supplement.prescriptions.map(rx => (
                      <div key={rx.medicineName} className="flex items-center gap-2 px-3 py-2 border-t border-slate-100">
                        <Pill size={14} className="text-green-600 shrink-0"/>
                        <span className="flex-1 text-sm font-medium">{rx.medicineName}</span>
                        <input type="number" min={1} value={rx.quantity}
                          onChange={e => updateRxQty(rx.medicineName, Number(e.target.value))}
                          className="w-16 text-right border border-slate-200 rounded px-2 py-0.5 text-sm"/>
                        <span className="text-xs text-slate-400">{rx.unit}</span>
                        <button onClick={() => removeRx(rx.medicineName)} className="text-red-400 hover:text-red-600"><X size={14}/></button>
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={saveSupplement} disabled={isSaving}
                  className="w-full py-2.5 bg-green-700 hover:bg-green-800 text-white font-bold rounded-xl text-sm transition disabled:opacity-50">
                  {isSaving ? 'Đang lưu...' : 'Lưu đơn này'}
                </button>

                {/* Đơn đã lưu */}
                {savedEntries.length > 0 && (
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs font-bold text-slate-500 mb-2">Đã kê {savedEntries.length} đơn:</p>
                    {savedEntries.map((e, i) => (
                      <div key={i} className="text-xs text-slate-600 py-0.5">
                        {e.prescriptionDate} — <strong>{e.patientName}</strong>: {e.prescriptions.map(r => `${r.medicineName} ×${r.quantity}`).join(', ')}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Cột phải: tracker hụt */}
            <div className="w-72 flex flex-col overflow-hidden bg-slate-50">
              <div className="px-4 py-3 bg-yellow-50 border-b border-yellow-100 shrink-0">
                <p className="text-sm font-bold text-yellow-800">Thuốc cần bổ sung đơn</p>
                <p className="text-xs text-yellow-600">Kê hết → mới được chốt</p>
              </div>
              <div className="flex-1 overflow-auto p-3 space-y-2">
                {remaining.map(d => (
                  <div key={d.name}
                    onClick={() => d.remaining > 0 && addRxToSupplement(d.name, d.unit)}
                    className={`p-3 rounded-xl border-2 cursor-pointer transition ${
                      d.remaining === 0
                        ? 'border-green-300 bg-green-50 opacity-60'
                        : 'border-red-300 bg-white hover:border-red-400'
                    }`}>
                    <div className="flex justify-between items-start">
                      <span className="text-sm font-bold text-slate-800 leading-tight">{d.name}</span>
                      {d.remaining === 0
                        ? <CheckCircle size={16} className="text-green-600 shrink-0 mt-0.5"/>
                        : <span className="text-red-600 font-bold text-sm font-mono shrink-0">−{d.remaining}</span>
                      }
                    </div>
                    <span className="text-xs text-slate-500">{d.unit}</span>
                    {d.remaining > 0 && <span className="text-xs text-blue-500 block mt-1">↑ Click để thêm vào đơn</span>}
                  </div>
                ))}
              </div>
              <div className="px-4 py-4 border-t border-slate-200 shrink-0">
                <button
                  disabled={!allCovered || isSaving}
                  onClick={() => handleClose([])}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition flex items-center justify-center gap-2">
                  <Lock size={16}/>
                  {allCovered ? `Chốt ${periodLabel}` : `Còn ${remaining.filter(d=>d.remaining>0).length} loại chưa đủ`}
                </button>
              </div>
            </div>

          </div>
        )}

        {/* ── Phase: confirmLoss ── */}
        {phase === 'confirmLoss' && (
          <div className="p-6 space-y-5">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="font-bold text-amber-800 mb-2">Xác nhận ghi nhận hao hụt / mất mát:</p>
              <div className="space-y-1.5">
                {discrepancies.map(d => (
                  <div key={d.name} className="flex justify-between text-sm">
                    <span className="text-amber-700 font-medium">{d.name}</span>
                    <span className="text-amber-800 font-bold font-mono">−{d.diff} {d.unit}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-sm text-slate-600 text-center">
              Hệ thống sẽ tạo bút toán <strong>EXPORT_ADJUST</strong> cho các mặt hàng trên và chốt kỳ.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setPhase('decision')}
                className="flex-1 py-2.5 border-2 border-slate-200 text-slate-600 font-bold rounded-xl text-sm hover:border-slate-300 transition">
                ← Quay lại / 返回
              </button>
              <button disabled={isSaving}
                onClick={() => handleClose(discrepancies.map(d => ({ name: d.name, qty: d.diff })))}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm transition disabled:opacity-50">
                {isSaving ? 'Đang xử lý... / 处理中' : <span>Xác nhận & Chốt<span className="block text-[9px] font-normal opacity-80 leading-tight">确认并结算</span></span>}
              </button>
            </div>
          </div>
        )}

        {/* ── Phase: done ── */}
        {phase === 'done' && (
          <div className="p-8 flex flex-col items-center gap-4">
            <CheckCircle size={56} className="text-green-500"/>
            <p className="text-xl font-bold text-slate-800">Đã chốt {periodLabel}</p>
            <p className="text-sm text-slate-500">Số liệu kho đã được khoá cho kỳ này.</p>

            {/* Prompt gửi báo cáo về E4 (chỉ hiện với Spoke) */}
            {stationConfig.type !== 'HUB' && (
              <div className={`w-full max-w-sm rounded-xl border-2 p-4 text-center transition-all ${
                reportSent ? 'border-green-300 bg-green-50' : 'border-indigo-200 bg-indigo-50'
              }`}>
                {reportSent ? (
                  <>
                    <CheckCircle size={24} className="mx-auto mb-1 text-green-600"/>
                    <p className="text-sm font-bold text-green-800">Đã xuất file báo cáo thuốc!</p>
                    <p className="text-xs text-green-600 mt-0.5">Gửi file .dat về E4 qua Zalo / USB.</p>
                  </>
                ) : (
                  <>
                    <Send size={22} className="mx-auto mb-2 text-indigo-600"/>
                    <p className="text-sm font-bold text-indigo-800 mb-1">
                      Gửi bảng kê thuốc tháng về E4? / 发送月度药品报表?
                    </p>
                    <p className="text-xs text-indigo-600 mb-3">
                      Xuất file .dat để gửi Zalo / USB về E4 tổng hợp toàn hệ thống.
                    </p>
                    <button
                      onClick={handleExportReport}
                      disabled={isSendingReport}
                      className="flex items-center gap-2 mx-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-sm transition disabled:opacity-50"
                    >
                      <FileDown size={16} className="shrink-0"/>
                      {isSendingReport ? 'Đang xuất... / 导出中' : <span>Xuất file báo cáo<span className="block text-[9px] font-normal opacity-80 leading-tight">导出报告文件</span></span>}
                    </button>
                  </>
                )}
              </div>
            )}

            <button onClick={onClose}
              className="mt-1 px-8 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition text-sm">
              Đóng / 关闭
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
