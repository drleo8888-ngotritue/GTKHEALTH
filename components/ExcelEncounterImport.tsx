/**
 * ExcelEncounterImport.tsx
 * Wizard nhập bổ sung ca khám từ file Excel.
 * Cấu trúc file Excel:
 *   [Cột Status: x=chuyển viện] | STT | NGÀY THÁNG | Mã NV | Họ tên | Chẩn đoán | Nhóm bệnh | Giờ vào | Giờ ra | Thuốc1 | Thuốc2 | ...
 */
import React, { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload, ChevronRight, CheckCircle, AlertCircle, X,
  FileSpreadsheet, ArrowRight, SkipForward, RefreshCw
} from 'lucide-react';
import { Medicine, EncounterStatus } from '../types';
import { storage } from '../services/storage';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RawRow {
  statusCol: string;
  date: any; // XLSX cell object {t, v, w} hoặc fallback string/number/Date
  patientId: string;
  patientName: string;
  diagnosis: string;
  diseaseGroup: string;
  timeIn: any;
  timeOut: any;
  medicines: Record<string, number>; // excelColName → qty
}

interface MedicineMapping {
  excelName: string;
  dbMedicine: Medicine | null;
  matchStatus: 'exact' | 'suggested' | 'none';
}

interface PreparedEncounter {
  patientId: string;
  patientName: string;
  diagnosis: string;
  diseaseGroup: string;
  startTime: number;
  endTime: number;
  restStartTime?: number;
  status: EncounterStatus;
  prescriptions: { medicineId: string; medicineName: string; quantity: number; unit?: string }[];
  isDuplicate: boolean;
}

interface Props {
  onClose: () => void;
  onSuccess: (count: number) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FIXED_COL_KEYWORDS: Record<string, string[]> = {
  status:      ['trạng thái', 'trang thai', 'status', 'loại', 'loai'],
  stt:         ['stt', 'số thứ tự', 'so thu tu', '#'],
  date:        ['ngày', 'ngay', 'ngày tháng', 'date', '日期'],
  patientId:   ['mã nv', 'manv', '工号', 'mã nhân viên', 'employee id', 'ma nv', 'id'],
  patientName: ['họ tên', 'ho ten', '姓名', 'họ và tên', 'tên', 'name'],
  diagnosis:   ['chẩn đoán', 'chan doan', 'diagnosis', 'chẩn đoán bệnh', '诊断'],
  diseaseGroup:['nhóm bệnh', 'nhom benh', 'phân loại', 'phan loai', 'khoa', '科别', 'bệnh'],
  timeIn:      ['giờ vào', 'gio vao', 'vào', 'check in', '进入时间', 'giờ đến'],
  timeOut:     ['giờ ra', 'gio ra', 'ra', 'check out', '离开时间', 'giờ về'],
};

function normalizeStr(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function matchCol(header: string, keywords: string[]): boolean {
  const n = normalizeStr(header);
  return keywords.some(k => n === normalizeStr(k) || n.includes(normalizeStr(k)));
}

// Đọc ngày trực tiếp từ cell object — đáng tin cậy hơn sheet_to_json
function parseCellDate(cell: any): Date | null {
  if (!cell || cell.v === undefined || cell.v === null || cell.v === '') return null;

  // Type 'd': XLSX đã convert sang JS Date (cellDates: true)
  if (cell.t === 'd' && cell.v instanceof Date) {
    if (isNaN(cell.v.getTime())) return null;
    return new Date(cell.v.getUTCFullYear(), cell.v.getUTCMonth(), cell.v.getUTCDate());
  }

  // Type 'n': số nguyên — Excel serial, PHẢI trong khoảng hợp lý (2000–2040)
  // Serial 36526 = 2000-01-01, Serial 51544 = 2041-01-19
  if ((cell.t === 'n' || typeof cell.v === 'number') && typeof cell.v === 'number') {
    const n = Math.floor(cell.v); // bỏ phần fraction (time)
    if (n >= 36526 && n <= 54787) { // 2000–2050
      const d = new Date((n - 25569) * 86400000);
      if (!isNaN(d.getTime())) return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    // Nếu số nằm ngoài range → không phải date, bỏ qua
    return null;
  }

  // Type 's': string — thử parse từ chuỗi
  const raw = (cell.t === 's' || typeof cell.v === 'string') ? cell.v : (cell.w || '');
  const candidates = [String(raw).trim(), String(cell.w || '').trim()].filter(Boolean);

  for (const s of candidates) {
    // dd/MM/yyyy hoặc d/M/yyyy (định dạng Việt Nam)
    const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m1) {
      const day = parseInt(m1[1]), month = parseInt(m1[2]), year = parseInt(m1[3]);
      // Kiểm tra sanity: năm hợp lý và tháng/ngày hợp lệ
      if (year >= 2000 && year <= 2040 && month >= 1 && month <= 12 && day >= 1 && day <= 31)
        return new Date(year, month - 1, day);
    }
    // yyyy-MM-dd (ISO)
    const m2 = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (m2) {
      const year = parseInt(m2[1]), month = parseInt(m2[2]), day = parseInt(m2[3]);
      if (year >= 2000 && year <= 2040 && month >= 1 && month <= 12 && day >= 1 && day <= 31)
        return new Date(year, month - 1, day);
    }
  }
  return null;
}

// Đọc giờ trực tiếp từ cell object
function parseCellTime(cell: any, baseDate: Date): number {
  if (!cell || cell.v === undefined || cell.v === null || cell.v === '') return baseDate.getTime();

  // Type 'd': JS Date với UTC hours/minutes
  if (cell.t === 'd' && cell.v instanceof Date) {
    const d = new Date(baseDate);
    d.setHours(cell.v.getUTCHours(), cell.v.getUTCMinutes(), 0, 0);
    return d.getTime();
  }

  // Type 'n': fraction of day (0.0–1.0) — có thể kèm date phần (như 46130.333)
  if ((cell.t === 'n' || typeof cell.v === 'number') && typeof cell.v === 'number') {
    const fraction = cell.v % 1; // chỉ lấy phần thập phân (time part)
    const totalMin = Math.round(fraction * 24 * 60);
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    const d = new Date(baseDate);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  }

  // Type 's': string "HH:MM"
  const s = String(cell.w || cell.v || '').trim();
  const match = s.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    const d = new Date(baseDate);
    d.setHours(parseInt(match[1]), parseInt(match[2]), 0, 0);
    return d.getTime();
  }
  return baseDate.getTime();
}

// Giữ lại để tương thích (dùng trong handleNext2)
function parseExcelDate(val: string | number | Date): Date | null {
  return parseCellDate({ t: val instanceof Date ? 'd' : typeof val === 'number' ? 'n' : 's', v: val, w: '' });
}

function parseTime(val: string | number | Date, baseDate: Date): number {
  return parseCellTime({ t: val instanceof Date ? 'd' : typeof val === 'number' ? 'n' : 's', v: val, w: '' }, baseDate);
}

function isSkippableRow(patientId: string): boolean {
  if (!patientId) return true;
  const s = patientId.toString().trim();
  if (!s || s === '' || s === '#N/A' || s === '#REF!' || s === '#VALUE!' || s === '#ERROR!') return true;
  // Excel formula errors
  if (s.startsWith('#')) return true;
  return false;
}

function findBestMatch(excelName: string, dbMeds: Medicine[]): MedicineMapping {
  const norm = normalizeStr(excelName);
  const exact = dbMeds.find(m => normalizeStr(m.name) === norm);
  if (exact) return { excelName, dbMedicine: exact, matchStatus: 'exact' };
  const suggested = dbMeds.find(m => {
    const dn = normalizeStr(m.name);
    return dn.includes(norm) || norm.includes(dn);
  });
  if (suggested) return { excelName, dbMedicine: suggested, matchStatus: 'suggested' };
  return { excelName, dbMedicine: null, matchStatus: 'none' };
}

function isSameDay(ts: number, date: Date): boolean {
  const d = new Date(ts);
  return d.getFullYear() === date.getFullYear()
    && d.getMonth() === date.getMonth()
    && d.getDate() === date.getDate();
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const ExcelEncounterImport: React.FC<Props> = ({ onClose, onSuccess }) => {
  const [stationName, setStationName] = React.useState('Unknown');
  const [stationId, setStationId] = React.useState('unknown');
  const [dbMedicines, setDbMedicines] = React.useState<Medicine[]>([]);
  const [existingEncounters, setExistingEncounters] = React.useState<{ patientId: string; startTime: number }[]>([]);

  React.useEffect(() => {
    const cfg = storage.getStationConfig();
    if (cfg) { setStationName(cfg.name || 'Unknown'); setStationId(cfg.id || 'unknown'); }
    window.electron?.getInventory?.('ALL').then((meds: Medicine[]) => setDbMedicines(meds || []));
    window.electron?.getAllEncounters?.().then((encs: any[]) =>
      setExistingEncounters((encs || []).map((e: any) => ({ patientId: e.patientId, startTime: e.startTime })))
    );
  }, []);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [filename, setFilename] = useState('');
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);

  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [excelMedCols, setExcelMedCols] = useState<string[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);

  const [mappings, setMappings] = useState<MedicineMapping[]>([]);
  const [ambiguous, setAmbiguous] = useState<MedicineMapping[]>([]);
  const [orderSyncState, setOrderSyncState] = useState<'idle' | 'prompt' | 'synced' | 'skipped'>('idle');
  const [pendingOrder, setPendingOrder] = useState<string[]>([]);
  const [addInventoryState, setAddInventoryState] = useState<'idle' | 'adding' | 'done'>('idle');

  const [deductInventory, setDeductInventory] = useState<boolean | null>(null);
  const [prepared, setPrepared] = useState<PreparedEncounter[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; count: number; message: string } | null>(null);

  // ── Step 1: Parse sheet ─────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target!.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array', cellDates: false });
      setWorkbook(wb);
      setSheets(wb.SheetNames);
      setFilename(file.name);
      setSelectedSheet(wb.SheetNames[0]);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const parseSheet = useCallback((sheetName: string) => {
    if (!workbook) return;
    const ws = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rows.length) return;

    // Find header row: row that has ≥3 of our known keywords
    let headerRowIdx = -1;
    let colMap: Record<string, number> = {};
    let medStartCol = -1;

    for (let ri = 0; ri < Math.min(rows.length, 15); ri++) {
      const row = rows[ri].map((c: any) => (c ?? '').toString());
      let hits = 0;
      const tmp: Record<string, number> = {};
      row.forEach((cell, ci) => {
        for (const [field, kws] of Object.entries(FIXED_COL_KEYWORDS)) {
          if (!tmp[field] && matchCol(cell, kws)) { tmp[field] = ci; hits++; }
        }
      });
      if (hits >= 3 && tmp.patientId !== undefined) {
        headerRowIdx = ri;
        colMap = tmp;
        // Medicine cols = everything after timeOut (or timeIn if no timeOut)
        const lastFixed = Math.max(
          colMap.timeOut ?? -1,
          colMap.timeIn ?? -1,
          colMap.diseaseGroup ?? -1,
          colMap.diagnosis ?? -1
        );
        medStartCol = lastFixed + 1;
        break;
      }
    }

    if (headerRowIdx === -1) {
      alert('Không tìm thấy dòng tiêu đề. Hãy đảm bảo file có cột Mã NV, Họ tên, Giờ vào, Giờ ra.');
      return;
    }

    const headerRow = rows[headerRowIdx].map((c: any) => (c ?? '').toString().trim());
    const medCols: string[] = [];
    for (let ci = medStartCol; ci < headerRow.length; ci++) {
      const h = headerRow[ci];
      if (h) medCols.push(h);
    }

    // Parse data rows
    const parsed: RawRow[] = [];
    let skipped = 0;
    for (let ri = headerRowIdx + 1; ri < rows.length; ri++) {
      const row = rows[ri];
      const pid = (row[colMap.patientId] ?? '').toString().trim();
      if (isSkippableRow(pid)) { skipped++; continue; }

      const medQtys: Record<string, number> = {};
      medCols.forEach((medName, i) => {
        const qty = parseFloat((row[medStartCol + i] ?? '').toString()) || 0;
        if (qty > 0) medQtys[medName] = qty;
      });

      // Đọc cell trực tiếp cho date/time để có đủ type+value+formatted string
      const getCell = (c: number) => c >= 0 ? ws[XLSX.utils.encode_cell({ r: ri, c })] : undefined;

      parsed.push({
        statusCol:   (row[colMap.status ?? -1] ?? '').toString().trim(),
        date:        getCell(colMap.date ?? -1) ?? row[colMap.date ?? -1] ?? '',
        patientId:   pid,
        patientName: (row[colMap.patientName ?? -1] ?? '').toString().trim(),
        diagnosis:   (row[colMap.diagnosis ?? -1] ?? '').toString().trim(),
        diseaseGroup:(row[colMap.diseaseGroup ?? -1] ?? '').toString().trim(),
        timeIn:      getCell(colMap.timeIn ?? -1) ?? row[colMap.timeIn ?? -1] ?? '',
        timeOut:     getCell(colMap.timeOut ?? -1) ?? row[colMap.timeOut ?? -1] ?? '',
        medicines:   medQtys,
      });
    }

    setRawRows(parsed);
    setExcelMedCols(medCols);
    setSkippedCount(skipped);
  }, [workbook]);

  const handleNext1 = () => {
    parseSheet(selectedSheet);

    // Build medicine mappings
    const allMappings: MedicineMapping[] = excelMedCols.map(n => findBestMatch(n, dbMedicines));
    // Rebuild after parseSheet sets excelMedCols (will be called again after state update)
    setMappings(allMappings);
    const amb = allMappings.filter(m => m.matchStatus === 'suggested');
    setAmbiguous(amb);
    setStep(2);
  };

  // After parseSheet runs and sets excelMedCols, recompute mappings before step 2
  const handleGoToStep2 = () => {
    parseSheet(selectedSheet);
    // Mappings computed in useEffect after rawRows update → use callback approach
    setStep(2);
  };

  // Recompute when rawRows changes (triggered by parseSheet)
  React.useEffect(() => {
    if (rawRows.length === 0) return;
    const allMappings: MedicineMapping[] = excelMedCols.map(n => findBestMatch(n, dbMedicines));
    setMappings(allMappings);
    setAmbiguous(allMappings.filter(m => m.matchStatus === 'suggested'));

    // So sánh thứ tự thuốc với thứ tự đã lưu (không ghi đè nếu đã sync)
    const newOrder = [...new Set(
      allMappings.filter(m => m.dbMedicine !== null).map(m => m.dbMedicine!.name)
    )];
    if (newOrder.length > 0) {
      const savedOrder = storage.getMedicineOrder();
      if (JSON.stringify(savedOrder) !== JSON.stringify(newOrder)) {
        setPendingOrder(newOrder);
        setOrderSyncState(prev => prev === 'synced' ? 'synced' : 'prompt');
      } else {
        setOrderSyncState(prev => prev === 'synced' ? 'synced' : 'idle');
      }
    }
  }, [rawRows, excelMedCols, dbMedicines]);

  // ── Step 2: Thêm thuốc mới vào kho ─────────────────────────────────────────

  const handleAddToInventory = async () => {
    setAddInventoryState('adding');
    const noneMeds = mappings.filter(m => m.matchStatus === 'none').map(m => m.excelName);
    const newMeds: Medicine[] = [];

    for (const excelName of noneMeds) {
      const id = `MED_EXCEL_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const medData = {
        id,
        name: excelName.trim(),
        group: 'Chưa phân loại',
        unit: 'Viên',
        stock: 0,
        batchNumber: '---',
        expiryDate: '---',
        mfgDate: '',
        type: 'MEDICINE',
      };
      await window.electron.importMedicine(medData, stationName);
      newMeds.push({
        id,
        name: excelName.trim(),
        group: 'Chưa phân loại',
        group_name: 'Chưa phân loại',
        unit: 'Viên',
        stock: 0,
        batchNumber: '---',
        expiryDate: '---',
      });
    }

    // Cập nhật dbMedicines → trigger recompute mappings
    const updatedMeds = [...dbMedicines, ...newMeds];
    setDbMedicines(updatedMeds);

    // Tính và lưu thứ tự cột ngay (bao gồm thuốc mới)
    const updatedMappings = excelMedCols.map(n => findBestMatch(n, updatedMeds));
    const newOrder = [...new Set(
      updatedMappings.filter(m => m.dbMedicine !== null).map(m => m.dbMedicine!.name)
    )];
    storage.saveMedicineOrder(newOrder);
    setOrderSyncState('synced');
    setAddInventoryState('done');
  };

  // ── Step 2: Mapping ambiguous medicines ─────────────────────────────────────

  const handleMappingChange = (excelName: string, med: Medicine | null) => {
    setMappings(prev => prev.map(m =>
      m.excelName === excelName ? { ...m, dbMedicine: med } : m
    ));
    setAmbiguous(prev => prev.map(m =>
      m.excelName === excelName ? { ...m, dbMedicine: med } : m
    ));
  };

  const handleNext2 = () => {
    // Build prepared encounters
    const finalMap: Record<string, Medicine | null> = {};
    mappings.forEach(m => { finalMap[m.excelName] = m.dbMedicine; });

    const preps: PreparedEncounter[] = rawRows.map(row => {
      const baseDate = parseCellDate(row.date) ?? new Date();
      const startTime = parseCellTime(row.timeIn, baseDate);
      const rawEndTime = parseCellTime(row.timeOut, baseDate);
      const sameTime = Math.abs(rawEndTime - startTime) < 60000; // <1 min = same
      const endTime = rawEndTime;
      const restStartTime = !sameTime ? startTime : undefined;

      const status: EncounterStatus =
        row.statusCol.toLowerCase().trim() === 'x'
          ? EncounterStatus.COMPLETED_TRANSFER
          : EncounterStatus.COMPLETED_WORK;

      const prescriptions = Object.entries(row.medicines)
        .filter(([name]) => finalMap[name] !== null && finalMap[name] !== undefined)
        .map(([name, qty]) => {
          const med = finalMap[name]!;
          return { medicineId: med.id, medicineName: med.name, quantity: qty, unit: med.unit };
        });

      // Dedup check: same patientId + same day
      const isDuplicate = existingEncounters.some(e =>
        e.patientId === row.patientId && isSameDay(e.startTime, baseDate)
      );

      return {
        patientId: row.patientId,
        patientName: row.patientName,
        diagnosis: row.diagnosis,
        diseaseGroup: row.diseaseGroup,
        startTime,
        endTime,
        restStartTime,
        status,
        prescriptions,
        isDuplicate,
      };
    });

    setPrepared(preps);
    setStep(3);
  };

  // ── Step 3: Preview ─────────────────────────────────────────────────────────

  const handleImport = async () => {
    setImporting(true);
    const toImport = prepared.filter(p => !p.isDuplicate);

    // Auto-add patients not yet in directory (silently, department rỗng — sẽ cập nhật qua import DS NV hàng tháng)
    const existingIds = new Set(storage.getPatients().map((p: any) => p.id));
    const newPatients = [...new Map(
      toImport
        .filter(p => !existingIds.has(p.patientId))
        .map(p => [p.patientId, { id: p.patientId, name: p.patientName, department: '' }])
    ).values()];
    if (newPatients.length > 0) storage.importPatients(newPatients);

    try {
      const result = await window.electron.importEncountersFromExcel(
        toImport.map(p => ({ ...p, stationName, stationId })),
        deductInventory === true
      );
      setImportResult(result);
      setStep(4);
      if (result.success) onSuccess(result.count);
    } catch (err: any) {
      setImportResult({ success: false, count: 0, message: err.message });
      setStep(4);
    } finally {
      setImporting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const dupCount = prepared.filter(p => p.isDuplicate).length;
  const validCount = prepared.filter(p => !p.isDuplicate).length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="text-emerald-600" size={22} />
            <h2 className="font-semibold text-gray-800">Nhập bổ sung ca khám từ Excel</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 px-5 pt-4 pb-2 text-sm">
          {[
            { n: 1, label: 'Chọn file / 选择文件' },
            { n: 2, label: 'Mapping thuốc / 药品匹配' },
            { n: 3, label: 'Xem trước / 预览' },
            { n: 4, label: 'Kết quả / 结果' },
          ].map((s, i) => (
            <React.Fragment key={s.n}>
              <div className={`flex items-center gap-1.5 ${step >= s.n ? 'text-emerald-600 font-medium' : 'text-gray-400'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                  ${step > s.n ? 'bg-emerald-500 text-white' : step === s.n ? 'bg-emerald-100 text-emerald-700 border border-emerald-400' : 'bg-gray-100 text-gray-400'}`}>
                  {step > s.n ? <CheckCircle size={14} /> : s.n}
                </span>
                <span>{s.label}</span>
              </div>
              {i < 3 && <ArrowRight size={14} className="text-gray-300 flex-shrink-0" />}
            </React.Fragment>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <div className="space-y-5">
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-10 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-colors"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                onClick={() => { const inp = document.createElement('input'); inp.type='file'; inp.accept='.xlsx,.xls'; inp.onchange=(e:any)=>handleFile(e.target.files[0]); inp.click(); }}
              >
                <Upload size={36} className="mx-auto text-gray-400 mb-3" />
                <p className="text-gray-600 font-medium">Kéo thả hoặc click để chọn file Excel</p>
                <p className="text-gray-400 text-sm mt-1">.xlsx / .xls</p>
              </div>

              {filename && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
                  <p className="text-sm font-medium text-emerald-800">📄 {filename}</p>
                  {sheets.length > 1 && (
                    <div>
                      <label className="text-sm text-gray-600 mb-1 block">Chọn sheet:</label>
                      <select
                        value={selectedSheet}
                        onChange={e => setSelectedSheet(e.target.value)}
                        className="border rounded px-3 py-1.5 text-sm w-full"
                      >
                        {sheets.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 space-y-1">
                <p className="font-medium">Cấu trúc file Excel cần có:</p>
                <p>• Cột đầu: Trạng thái (để trống = về làm việc, <strong>x</strong> = chuyển viện)</p>
                <p>• Các cột: STT | Ngày | Mã NV | Họ tên | Chẩn đoán | Nhóm bệnh | Giờ vào | Giờ ra</p>
                <p>• Các cột tiếp theo: tên từng loại thuốc, giá trị = số lượng</p>
                <p>• Dòng #N/A hoặc Mã NV trống sẽ tự động bỏ qua</p>
              </div>
            </div>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 flex gap-4">
                <span>✅ {rawRows.length} bệnh nhân hợp lệ</span>
                <span>⏭️ {skippedCount} dòng bỏ qua</span>
                <span>💊 {excelMedCols.length} loại thuốc trong file</span>
              </div>

              {/* Confirmation: deduct inventory or not */}
              {deductInventory === null && (
                <div className="border-2 border-blue-300 bg-blue-50 rounded-xl p-5 space-y-4">
                  <div>
                    <p className="font-semibold text-blue-900 text-base">Bạn muốn xử lý thuốc trong file này như thế nào?</p>
                    <p className="text-sm text-blue-700 mt-1">Thuốc sẽ được ghi nhận vào hồ sơ bệnh nhân trong cả hai trường hợp.</p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => setDeductInventory(true)}
                      className="flex items-start gap-3 p-4 bg-white border-2 border-emerald-400 rounded-lg hover:bg-emerald-50 transition text-left group"
                    >
                      <span className="text-2xl">✅</span>
                      <div>
                        <p className="font-semibold text-emerald-800 group-hover:text-emerald-900">Có — nhập thuốc vào kho</p>
                        <p className="text-xs text-emerald-600 mt-0.5">Trừ số lượng thuốc tương ứng khỏi kho. Dùng khi chưa nhập kho cho đợt này.</p>
                      </div>
                    </button>
                    <button
                      onClick={() => setDeductInventory(false)}
                      className="flex items-start gap-3 p-4 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition text-left group"
                    >
                      <span className="text-2xl">📋</span>
                      <div>
                        <p className="font-semibold text-gray-800 group-hover:text-gray-900">Không — chỉ ghi nhận, không trừ kho</p>
                        <p className="text-xs text-gray-500 mt-0.5">Thuốc đã được trừ kho trước đó. Chỉ lưu thông tin sử dụng của bệnh nhân.</p>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {deductInventory !== null && (
                <div className={`flex items-center justify-between rounded-lg px-4 py-2.5 text-sm ${deductInventory ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-gray-100 border border-gray-200 text-gray-700'}`}>
                  <span>{deductInventory ? '✅ Có nhập thuốc — sẽ trừ kho sau khi nhập' : '📋 Không nhập thuốc — chỉ ghi nhận hồ sơ'}</span>
                  <button onClick={() => setDeductInventory(null)} className="text-xs underline opacity-60 hover:opacity-100 ml-3">Đổi lại</button>
                </div>
              )}

              {deductInventory !== null && <>
              {orderSyncState === 'prompt' && (
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex items-start gap-3">
                  <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-800">Thứ tự thuốc trong file này khác với cấu hình báo cáo hiện tại</p>
                    <p className="text-xs text-amber-600 mt-1 truncate">Thứ tự mới: {pendingOrder.join(' → ')}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0 mt-0.5">
                    <button
                      onClick={() => { storage.saveMedicineOrder(pendingOrder); setOrderSyncState('synced'); }}
                      className="text-xs px-3 py-1.5 bg-amber-500 text-white rounded font-medium hover:bg-amber-600 transition"
                    >
                      Đồng bộ
                    </button>
                    <button
                      onClick={() => setOrderSyncState('skipped')}
                      className="text-xs px-3 py-1.5 border border-amber-300 text-amber-700 rounded hover:bg-amber-100 transition"
                    >
                      Bỏ qua
                    </button>
                  </div>
                </div>
              )}
              {orderSyncState === 'synced' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2 text-sm text-emerald-700">
                  <CheckCircle size={15} /> Đã lưu thứ tự thuốc mới. Báo cáo Excel sẽ dùng thứ tự này.
                </div>
              )}

              {ambiguous.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle size={40} className="mx-auto text-emerald-500 mb-2" />
                  <p className="font-medium">Tất cả tên thuốc khớp chính xác!</p>
                  <p className="text-sm">Không cần điều chỉnh mapping.</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    Có <strong>{ambiguous.length}</strong> tên thuốc tương tự nhưng không khớp chính xác. Xác nhận hoặc điều chỉnh:
                  </p>
                  <div className="space-y-2">
                    {ambiguous.map(m => (
                      <div key={m.excelName} className="flex items-center gap-3 border rounded-lg p-3 bg-white">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700 truncate">{m.excelName}</p>
                          <p className="text-xs text-gray-400">Tên trong Excel</p>
                        </div>
                        <ArrowRight size={16} className="text-gray-300 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <select
                            className="border rounded px-2 py-1 text-sm w-full"
                            value={mappings.find(mp => mp.excelName === m.excelName)?.dbMedicine?.id ?? ''}
                            onChange={e => {
                              const med = dbMedicines.find(d => d.id === e.target.value) ?? null;
                              handleMappingChange(m.excelName, med);
                            }}
                          >
                            <option value="">⛔ Bỏ qua</option>
                            {dbMedicines
                              .filter((d, i, arr) => arr.findIndex(x => x.name === d.name) === i)
                              .sort((a, b) => a.name.localeCompare(b.name))
                              .map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                              ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Exact matches info */}
              {mappings.filter(m => m.matchStatus === 'exact').length > 0 && (
                <details className="text-sm text-gray-500 mt-2">
                  <summary className="cursor-pointer hover:text-gray-700">
                    {mappings.filter(m => m.matchStatus === 'exact').length} thuốc khớp chính xác (không cần xử lý)
                  </summary>
                  <ul className="mt-1 ml-4 space-y-0.5">
                    {mappings.filter(m => m.matchStatus === 'exact').map(m => (
                      <li key={m.excelName}>✅ {m.excelName}</li>
                    ))}
                  </ul>
                </details>
              )}
              {mappings.filter(m => m.matchStatus === 'none').length > 0 && addInventoryState !== 'done' && (
                <div className="bg-orange-50 border border-orange-300 rounded-lg p-3">
                  <p className="text-sm font-semibold text-orange-800 mb-2">
                    ⚠️ Phát hiện {mappings.filter(m => m.matchStatus === 'none').length} thuốc chưa có trong kho:
                  </p>
                  <ul className="text-sm text-orange-700 ml-3 mb-3 space-y-0.5">
                    {mappings.filter(m => m.matchStatus === 'none').map(m => (
                      <li key={m.excelName}>• {m.excelName}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-orange-600 mb-3">
                    Bạn có muốn thêm các thuốc này vào Kho không? (Hạn dùng, số lô có thể bổ sung sau tại Inventory)
                  </p>
                  {addInventoryState === 'idle' && (
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddToInventory}
                        className="text-xs px-3 py-1.5 bg-orange-500 text-white rounded font-medium hover:bg-orange-600 transition"
                      >
                        Có, thêm vào kho thuốc
                      </button>
                      <button
                        onClick={() => setAddInventoryState('done')}
                        className="text-xs px-3 py-1.5 border border-orange-300 text-orange-700 rounded hover:bg-orange-100 transition"
                      >
                        Bỏ qua
                      </button>
                    </div>
                  )}
                  {addInventoryState === 'adding' && (
                    <div className="flex items-center gap-2 text-xs text-orange-600">
                      <RefreshCw size={13} className="animate-spin" /> Đang thêm vào kho...
                    </div>
                  )}
                </div>
              )}
              {addInventoryState === 'done' && mappings.filter(m => m.matchStatus === 'none').length > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2 text-sm text-emerald-700">
                  <CheckCircle size={15} /> Đã thêm thuốc mới vào kho và cập nhật thứ tự cột báo cáo.
                </div>
              )}
              </>}
            </div>
          )}

          {/* ── STEP 3 ── */}
          {step === 3 && (
            <div className="space-y-4">
              {(() => {
                const now = Date.now();
                const TWO_YEARS = 2 * 365.25 * 24 * 60 * 60 * 1000;
                const badRows = prepared.filter(p => Math.abs(p.startTime - now) > TWO_YEARS);
                if (badRows.length === 0) return null;
                return (
                  <div className="bg-red-50 border border-red-400 rounded-lg p-3">
                    <p className="text-sm font-bold text-red-800 flex items-center gap-1.5">
                      <AlertCircle size={16}/> Phát hiện {badRows.length} dòng có ngày không hợp lệ!
                    </p>
                    <p className="text-xs text-red-600 mt-1 mb-2">
                      Ngày khám cách ngày thực tế quá xa — có thể do định dạng ô ngày trong Excel chưa đúng.
                    </p>
                    <ul className="text-xs text-red-500 ml-2 space-y-0.5 max-h-28 overflow-y-auto">
                      {badRows.map((p, i) => (
                        <li key={i}>• {p.patientName || p.patientId}: <strong>{(() => { const d = new Date(p.startTime); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; })()}</strong></li>
                      ))}
                    </ul>
                    <p className="text-xs text-red-700 font-semibold mt-2">
                      Hãy quay lại và kiểm tra cột ngày trong file Excel trước khi nhập.
                    </p>
                  </div>
                );
              })()}

              <div className="flex gap-4 text-sm">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 flex-1 text-center">
                  <p className="text-2xl font-bold text-emerald-700">{validCount}</p>
                  <p className="text-emerald-600">Sẽ được nhập</p>
                </div>
                {dupCount > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex-1 text-center">
                    <p className="text-2xl font-bold text-amber-700">{dupCount}</p>
                    <p className="text-amber-600">Trùng lặp (bỏ qua)</p>
                  </div>
                )}
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 text-gray-600">Mã NV / 工号</th>
                      <th className="text-left px-3 py-2 text-gray-600">Họ tên / 姓名</th>
                      <th className="text-left px-3 py-2 text-gray-600">Ngày / 日期</th>
                      <th className="text-left px-3 py-2 text-gray-600">Chẩn đoán / 诊断</th>
                      <th className="text-left px-3 py-2 text-gray-600">Trạng thái / 状态</th>
                      <th className="text-left px-3 py-2 text-gray-600">Thuốc / 药品</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {prepared.map((p, i) => (
                      <tr key={i} className={p.isDuplicate ? 'bg-amber-50 opacity-60' : ''}>
                        <td className="px-3 py-2 font-mono">{p.patientId}</td>
                        <td className="px-3 py-2">{p.patientName}</td>
                        <td className="px-3 py-2">{(() => { const d = new Date(p.startTime); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; })()}</td>
                        <td className="px-3 py-2 max-w-[140px] truncate">{p.diagnosis}</td>
                        <td className="px-3 py-2">
                          {p.isDuplicate ? (
                            <span className="text-amber-600 font-medium">⚠ Trùng</span>
                          ) : p.status === EncounterStatus.COMPLETED_TRANSFER ? (
                            <span className="text-purple-600">Chuyển viện</span>
                          ) : (
                            <span className="text-emerald-600">Về làm việc</span>
                          )}
                        </td>
                        <td className="px-3 py-2">{p.prescriptions.length} loại</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── STEP 4 ── */}
          {step === 4 && importResult && (
            <div className="text-center py-10 space-y-4">
              {importResult.success ? (
                <>
                  <CheckCircle size={52} className="mx-auto text-emerald-500" />
                  <p className="text-xl font-semibold text-gray-800">Nhập thành công!</p>
                  <p className="text-gray-500">Đã thêm <strong>{importResult.count}</strong> ca khám vào hệ thống.</p>
                </>
              ) : (
                <>
                  <AlertCircle size={52} className="mx-auto text-red-400" />
                  <p className="text-xl font-semibold text-gray-800">Có lỗi xảy ra</p>
                  <p className="text-red-500 text-sm">{importResult.message}</p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            {step === 4 ? 'Đóng / 关闭' : 'Hủy / 取消'}
          </button>

          <div className="flex gap-3">
            {step === 2 && (
              <button onClick={() => setStep(1)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100">
                Quay lại / 返回
              </button>
            )}
            {step === 3 && (
              <button onClick={() => setStep(2)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100">
                Quay lại / 返回
              </button>
            )}

            {step === 1 && (
              <button
                onClick={handleGoToStep2}
                disabled={!filename || !workbook}
                className="px-5 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-2"
              >
                Tiếp theo / 下一步 <ChevronRight size={16} />
              </button>
            )}
            {step === 2 && deductInventory !== null && (
              <button
                onClick={handleNext2}
                disabled={rawRows.length === 0}
                className="px-5 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-2"
              >
                Xem trước / 预览 <ChevronRight size={16} />
              </button>
            )}
            {step === 3 && (
              <button
                onClick={handleImport}
                disabled={importing || validCount === 0}
                className="px-5 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-2"
              >
                {importing ? <><RefreshCw size={15} className="animate-spin" /> Đang nhập... / 导入中</> : <><span>Nhập {validCount} ca khám<span className="block text-[9px] font-normal opacity-80 leading-tight">导入 {validCount} 条就诊记录</span></span></>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
