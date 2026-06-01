/**
 * MedicineUsageReport.tsx
 * - Spoke/Hub đơn trạm: xuất báo cáo từ medicines + logs
 * - Hub tổng hợp: thêm scope selector — E4 / Từng trạm / Tổng hệ thống
 *   (dữ liệu Spoke lấy từ spoke_medicine_reports đã nhập)
 */
import React, { useState, useEffect } from 'react';
import { X, FileSpreadsheet, Calendar, TrendingUp, Download, Building2, Layers } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Medicine, InventoryLog, StationConfig, MedicineType, StationType } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MedicineUsageReportProps {
  medicines: Medicine[];
  logs: InventoryLog[];
  stationConfig: StationConfig;
  onClose: () => void;
}

type PeriodType = 'monthly' | 'quarterly';
type Scope = 'self' | 'each' | 'total';

interface FlowRow {
  name: string;
  unit: string;
  group?: string;
  tonDau:  number;
  nhap:    number;
  xuat:    number;
  suDung:  number;
  tonCuoi: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDateRange(period: PeriodType, month: number, quarter: 1|2|3|4, year: number): [number, number] {
  if (period === 'monthly') {
    return [
      new Date(year, month - 1, 1).setHours(0, 0, 0, 0),
      new Date(year, month,     0).setHours(23, 59, 59, 999),
    ];
  }
  const sm = (quarter - 1) * 3 + 1;
  const em = quarter * 3;
  return [
    new Date(year, sm - 1, 1).setHours(0, 0, 0, 0),
    new Date(year, em,     0).setHours(23, 59, 59, 999),
  ];
}

function calculateFlow(
  medicines: Medicine[], logs: InventoryLog[],
  stationName: string, medType: MedicineType,
  startTs: number, endTs: number
): FlowRow[] {
  const uniqueNames = Array.from(
    new Set(medicines.filter(m => (m.type || 'MEDICINE') === medType).map(m => m.name))
  );
  const result: FlowRow[] = [];

  for (const name of uniqueNames) {
    const relatedMeds = medicines.filter(m => m.name === name);
    const masterInfo  = relatedMeds.find(m => m.batchNumber === 'DANH_MUC_GOC') || relatedMeds[0];
    const batchMap: Record<string, Medicine[]> = {};
    relatedMeds.forEach(m => {
      if (m.batchNumber === 'DANH_MUC_GOC' && m.stock <= 0) return;
      if (!batchMap[m.batchNumber]) batchMap[m.batchNumber] = [];
      batchMap[m.batchNumber].push(m);
    });

    let totalOp = 0, totalIm = 0, totalUse = 0, totalTrans = 0, totalOther = 0, totalCl = 0;

    for (const batchNum of Object.keys(batchMap)) {
      const duplicates = batchMap[batchNum];
      const currentRealStock = duplicates.reduce((s, m) => s + m.stock, 0);
      let op = 0, im = 0, use = 0, trans = 0, other = 0;

      for (const log of logs) {
        const isSource = log.source === stationName;
        const isTarget = log.target === stationName;
        if (!isSource && !isTarget) continue;
        const item = log.items?.find((i: any) =>
          duplicates.some(d => d.id === i.medId) || (i.name === name && i.batch === batchNum)
        );
        if (!item) continue;
        const qty = parseInt(String(item.qty ?? 0)) || 0;
        if (!qty) continue;

        if ((log.type as string) === 'IMPORT_INIT' && isTarget) { op += qty; continue; }
        if (log.timestamp < startTs) {
          if ((log.type.includes('IMPORT') || log.type === 'TRANSFER_IN') && isTarget) op += qty;
          else if (isSource) op -= qty;
        } else if (log.timestamp <= endTs) {
          if (isTarget && (log.type.includes('IMPORT') || log.type === 'TRANSFER_IN')) im += qty;
          else if (isSource) {
            if (log.type === 'EXPORT_USE') use += qty;
            else if (log.type === 'TRANSFER_OUT') trans += qty;
            else if (['EXPORT_DESTROY','EXPORT_OTHER','EXPORT_ADJUST'].includes(log.type)) other += qty;
          }
        }
      }

      let cl = op + im - use - trans - other;
      if (cl !== currentRealStock && (op + im + use + trans + other + currentRealStock > 0)) {
        op += currentRealStock - cl; cl = currentRealStock;
      }
      totalOp += op; totalIm += im; totalUse += use;
      totalTrans += trans; totalOther += other; totalCl += cl;
    }

    if (totalOp + totalIm + totalUse + totalTrans + totalOther + totalCl > 0) {
      result.push({
        name: masterInfo.name, unit: masterInfo.unit,
        group: masterInfo.group || masterInfo.group_name || '',
        tonDau: totalOp, nhap: totalIm,
        xuat: totalTrans + totalOther, suDung: totalUse, tonCuoi: totalCl,
      });
    }
  }

  return result.sort((a, b) => (a.group || '').localeCompare(b.group || '') || a.name.localeCompare(b.name));
}

/** Chuyển dữ liệu từ spoke_medicine_reports sang FlowRow[] */
function spokeItemsToFlowRows(items: any[]): FlowRow[] {
  return items.map(i => ({
    name: i.name, unit: i.unit, group: i.group || '',
    tonDau: i.opening ?? 0, nhap: i.import ?? 0,
    xuat: 0, suDung: i.usage ?? 0, tonCuoi: i.closing ?? 0,
  })).sort((a, b) => (a.group || '').localeCompare(b.group || '') || a.name.localeCompare(b.name));
}

/** Gộp nhiều FlowRow[] thành 1, cộng dồn theo tên */
function mergeFlowRows(allRows: FlowRow[][]): FlowRow[] {
  const map = new Map<string, FlowRow>();
  for (const rows of allRows) {
    for (const r of rows) {
      const existing = map.get(r.name);
      if (existing) {
        existing.tonDau  += r.tonDau;
        existing.nhap    += r.nhap;
        existing.xuat    += r.xuat;
        existing.suDung  += r.suDung;
        existing.tonCuoi += r.tonCuoi;
      } else {
        map.set(r.name, { ...r });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => (a.group || '').localeCompare(b.group || '') || a.name.localeCompare(b.name));
}

// ─── XLSX builder ─────────────────────────────────────────────────────────────

const THIN = { style: 'thin', color: { rgb: '000000' } };
const ALL_BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN };
const YELLOW_FILL = { patternType: 'solid', fgColor: { rgb: 'FFFF00' } };

function buildSheet(rows: FlowRow[], stationLabel: string, medType: MedicineType, periodLabel: string) {
  const typeLabel = medType === 'MEDICINE' ? 'THUỐC' : 'VẬT TƯ Y TẾ';
  const title = `BÁO CÁO SỬ DỤNG ${typeLabel} ${periodLabel.toUpperCase()} — ${stationLabel.toUpperCase()}`;
  const headers = ['STT', 'Tên ' + (medType === 'MEDICINE' ? 'thuốc' : 'vật tư'), 'Đơn vị',
    'Tồn đầu kỳ', 'Nhập trong kỳ', 'Xuất trong kỳ', 'Sử dụng trong kỳ', 'Tồn cuối kỳ'];
  const NCOLS = headers.length;
  const dataRows = rows.map((r, idx) => [idx + 1, r.name, r.unit, r.tonDau, r.nhap, r.xuat, r.suDung, r.tonCuoi]);
  const aoa: any[][] = [[title], headers, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: NCOLS - 1 } }];

  const totalRows = aoa.length;
  for (let r = 0; r < totalRows; r++) {
    for (let c = 0; c < NCOLS; c++) {
      const ref = (c < 26 ? String.fromCharCode(65 + c) : 'A' + String.fromCharCode(65 + c - 26)) + (r + 1);
      if (!ws[ref]) ws[ref] = { v: '', t: 's' };
      if (r === 0) {
        ws[ref].s = { font: { bold: true, name: 'Times New Roman', sz: 13 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
      } else if (r === 1) {
        ws[ref].s = { font: { bold: true, name: 'Times New Roman', sz: 10 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: ALL_BORDERS, ...(c === 7 ? { fill: YELLOW_FILL } : {}) };
      } else {
        ws[ref].s = { font: { name: 'Times New Roman', sz: 10 }, alignment: c === 1 ? { horizontal: 'left', vertical: 'center', wrapText: true } : { horizontal: 'center', vertical: 'center' }, border: ALL_BORDERS, ...(c === 7 ? { fill: YELLOW_FILL } : {}) };
      }
    }
  }
  ws['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 8 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 16 }, { wch: 13 }];
  ws['!rows'] = [{ hpt: 36 }, { hpt: 40 }];
  return ws;
}

function exportExcel(
  scope: Scope,
  selfRows: FlowRow[],
  spokeMap: Record<string, FlowRow[]>,
  selfStation: string,
  medType: MedicineType,
  periodLabel: string,
) {
  const safeLabel = periodLabel.replace('/', '-');
  const wb = XLSX.utils.book_new();

  if (scope === 'self') {
    if (selfRows.length === 0) { alert(`Không có dữ liệu cho ${periodLabel}.`); return; }
    const ws = buildSheet(selfRows, selfStation, medType, periodLabel);
    XLSX.utils.book_append_sheet(wb, ws, selfStation);
    XLSX.writeFile(wb, `BaoCao_${medType === 'MEDICINE' ? 'Thuoc' : 'VatTu'}_${selfStation}_${safeLabel}.xlsx`, { cellStyles: true });
    return;
  }

  if (scope === 'each') {
    // Sheet riêng cho E4 + mỗi Spoke
    const allEntries: [string, FlowRow[]][] = [[selfStation, selfRows], ...Object.entries(spokeMap)];
    let hasData = false;
    for (const [station, rows] of allEntries) {
      if (rows.length === 0) continue;
      hasData = true;
      const ws = buildSheet(rows, station, medType, periodLabel);
      XLSX.utils.book_append_sheet(wb, ws, station.substring(0, 31));
    }
    if (!hasData) { alert(`Không có dữ liệu báo cáo cho ${periodLabel}.`); return; }
    XLSX.writeFile(wb, `BaoCao_${medType === 'MEDICINE' ? 'Thuoc' : 'VatTu'}_ToanHe_TungTram_${safeLabel}.xlsx`, { cellStyles: true });
    return;
  }

  if (scope === 'total') {
    const allRowArrays = [selfRows, ...Object.values(spokeMap)];
    const merged = mergeFlowRows(allRowArrays);
    if (merged.length === 0) { alert(`Không có dữ liệu báo cáo cho ${periodLabel}.`); return; }
    const ws = buildSheet(merged, 'TOÀN HỆ THỐNG', medType, periodLabel);
    XLSX.utils.book_append_sheet(wb, ws, 'Tổng');
    XLSX.writeFile(wb, `BaoCao_${medType === 'MEDICINE' ? 'Thuoc' : 'VatTu'}_TongHopHeThong_${safeLabel}.xlsx`, { cellStyles: true });
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

const MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];
const QUARTERS: { value: 1|2|3|4; label: string; months: string }[] = [
  { value: 1, label: 'Quý 1', months: 'T1 – T3' },
  { value: 2, label: 'Quý 2', months: 'T4 – T6' },
  { value: 3, label: 'Quý 3', months: 'T7 – T9' },
  { value: 4, label: 'Quý 4', months: 'T10 – T12' },
];

export const MedicineUsageReport: React.FC<MedicineUsageReportProps> = (props) => {
  const { medicines, logs, stationConfig, onClose } = props;
  const isHub = stationConfig.type === StationType.HUB;
  const now = new Date();

  const [period,          setPeriod]          = useState<PeriodType>('monthly');
  const [selectedMonth,   setSelectedMonth]   = useState<number>(now.getMonth() + 1);
  const [selectedQuarter, setSelectedQuarter] = useState<1|2|3|4>(Math.ceil((now.getMonth()+1)/3) as 1|2|3|4);
  const [selectedYear,    setSelectedYear]    = useState<number>(now.getFullYear());
  const [medType,         setMedType]         = useState<MedicineType>('MEDICINE');
  const [scope,           setScope]           = useState<Scope>('self');

  // Dữ liệu Spoke từ spoke_medicine_reports (chỉ dùng khi Hub + scope != self + monthly)
  const [spokeData,       setSpokeData]       = useState<{ station: string; items: any[] }[]>([]);
  const [isLoadingSpoke,  setIsLoadingSpoke]  = useState(false);

  const periodLabel = period === 'monthly'
    ? `Tháng ${String(selectedMonth).padStart(2,'0')}/${selectedYear}`
    : `Quý ${selectedQuarter}/${selectedYear}`;

  // Fetch spoke data khi Hub chọn scope != self và period = monthly
  useEffect(() => {
    if (!isHub || scope === 'self' || period !== 'monthly') {
      setSpokeData([]);
      return;
    }
    setIsLoadingSpoke(true);
    (async () => {
      try {
        if (window.electron) {
          const data = await window.electron.getSpokeReportData(selectedMonth, selectedYear);
          setSpokeData(data || []);
        }
      } catch { setSpokeData([]); }
      finally { setIsLoadingSpoke(false); }
    })();
  }, [isHub, scope, selectedMonth, selectedYear, period]);

  const handleExport = () => {
    const [startTs, endTs] = getDateRange(period, selectedMonth, selectedQuarter, selectedYear);
    const selfRows = calculateFlow(medicines, logs, stationConfig.name, medType, startTs, endTs);

    // Map Spoke data → FlowRow[]
    const spokeMap: Record<string, FlowRow[]> = {};
    for (const s of spokeData) {
      spokeMap[s.station] = spokeItemsToFlowRows(s.items);
    }

    exportExcel(scope, selfRows, spokeMap, stationConfig.name, medType, periodLabel);
  };

  const scopeOptions: { value: Scope; label: string; icon: React.ReactNode; desc: string }[] = [
    { value: 'self',  label: stationConfig.name,   icon: <Building2 size={16}/>,  desc: 'Chỉ trạm này'       },
    { value: 'each',  label: 'Từng trạm',          icon: <FileSpreadsheet size={16}/>, desc: 'Sheet riêng mỗi trạm' },
    { value: 'total', label: 'Tổng hệ thống',      icon: <Layers size={16}/>,     desc: 'Gộp tất cả'         },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-green-800 text-white">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={20} className="text-green-300"/>
            <div>
              <p className="font-bold text-base">Báo cáo sử dụng thuốc / vật tư</p>
              <p className="text-xs text-green-300">Trạm: {stationConfig.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="hover:bg-green-700 p-1.5 rounded-lg transition">
            <X size={18}/>
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* Loại hàng hoá */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Loại hàng hoá</p>
            <div className="flex gap-2">
              {(['MEDICINE', 'SUPPLY'] as MedicineType[]).map(t => (
                <button key={t} onClick={() => setMedType(t)}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                    medType === t
                      ? t === 'MEDICINE' ? 'border-green-500 bg-green-50 text-green-800' : 'border-blue-500 bg-blue-50 text-blue-800'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {t === 'MEDICINE' ? 'Thuốc' : 'Vật tư y tế'}
                </button>
              ))}
            </div>
          </div>

          {/* Loại kỳ */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Loại báo cáo</p>
            <div className="flex gap-2">
              <button onClick={() => setPeriod('monthly')}
                className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  period === 'monthly' ? 'border-green-500 bg-green-50 text-green-800' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}>
                <Calendar size={16}/> Báo cáo tháng
              </button>
              <button onClick={() => setPeriod('quarterly')}
                className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  period === 'quarterly' ? 'border-purple-500 bg-purple-50 text-purple-800' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}>
                <TrendingUp size={16}/> Báo cáo quý
              </button>
            </div>
          </div>

          {/* Thời gian */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Thời gian</p>
            {period === 'monthly' && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-slate-500 block mb-1">Tháng</label>
                  <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
                    className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:border-green-400 bg-white">
                    {MONTHS.map(m => <option key={m} value={m}>Tháng {m}</option>)}
                  </select>
                </div>
                <div className="w-28">
                  <label className="text-xs text-slate-500 block mb-1">Năm</label>
                  <input type="number" value={selectedYear} min={2020} max={2099}
                    onChange={e => setSelectedYear(Number(e.target.value))}
                    className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:border-green-400"/>
                </div>
              </div>
            )}
            {period === 'quarterly' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {QUARTERS.map(q => (
                    <button key={q.value} onClick={() => setSelectedQuarter(q.value)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        selectedQuarter === q.value ? 'border-purple-500 bg-purple-50' : 'border-slate-200 hover:border-slate-300'
                      }`}>
                      <span className={`font-bold text-sm block ${selectedQuarter === q.value ? 'text-purple-800' : 'text-slate-700'}`}>{q.label}</span>
                      <span className="text-xs text-slate-400">{q.months}</span>
                    </button>
                  ))}
                </div>
                <div className="w-28">
                  <label className="text-xs text-slate-500 block mb-1">Năm</label>
                  <input type="number" value={selectedYear} min={2020} max={2099}
                    onChange={e => setSelectedYear(Number(e.target.value))}
                    className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:border-purple-400"/>
                </div>
              </div>
            )}
          </div>

          {/* Phạm vi (chỉ Hub, chỉ monthly) */}
          {isHub && period === 'monthly' && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Phạm vi báo cáo</p>
              <div className="grid grid-cols-3 gap-2">
                {scopeOptions.map(opt => (
                  <button key={opt.value} onClick={() => setScope(opt.value)}
                    className={`flex flex-col items-center py-2.5 px-2 rounded-xl border-2 text-xs font-bold transition-all gap-1 ${
                      scope === opt.value
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}>
                    {opt.icon}
                    <span>{opt.label}</span>
                    <span className="font-normal text-[10px] opacity-70">{opt.desc}</span>
                  </button>
                ))}
              </div>

              {/* Trạng thái dữ liệu Spoke */}
              {scope !== 'self' && (
                <div className="mt-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                  {isLoadingSpoke ? (
                    <span>Đang tải dữ liệu Spoke...</span>
                  ) : spokeData.length === 0 ? (
                    <span className="text-amber-600">⚠️ Chưa có báo cáo thuốc từ Spoke nào cho tháng {selectedMonth}/{selectedYear}. Nhập file BC từ Spoke trước.</span>
                  ) : (
                    <span className="text-green-700">✓ Đã có báo cáo: {spokeData.map(s => s.station).join(', ')}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Nút xuất */}
          <button onClick={handleExport} disabled={isLoadingSpoke}
            className="w-full flex items-center justify-center gap-2 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white font-bold px-5 py-3 rounded-xl transition shadow-md text-sm">
            <Download size={18}/>
            {scope === 'each'  ? `Xuất Excel — Từng trạm — ${periodLabel}` :
             scope === 'total' ? `Xuất Excel — Tổng hệ thống — ${periodLabel}` :
                                 `Xuất Excel — ${periodLabel}`}
          </button>

        </div>
      </div>
    </div>
  );
};
