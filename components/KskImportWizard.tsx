/**
 * KskImportWizard.tsx
 * Wizard nhập file Excel KSKĐ — hỗ trợ header 2 tầng (nhóm + chỉ số).
 * Tầng 1 (merged cells): nhóm lớn → "Khám thể trạng", "Khám lâm sàng", "Phân tích máu"...
 * Tầng 2 (cột con): chỉ số cụ thể → "Chiều cao", "Cân nặng", "BMI"...
 * exam_details được lưu nested: { "Khám thể trạng": { "Chiều cao": 165, ... } }
 */
import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Upload, CheckCircle, AlertCircle, X, ChevronRight, RotateCcw, FileSpreadsheet, Layers, Eye } from 'lucide-react';
import { KskReport, type KskReportRow } from './KskReport';
import { storage } from '../services/storage';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedFile {
  filename:     string;
  headers:      string[];    // tên cột tầng 2 (chỉ số)
  colGroups:    string[];    // nhóm tầng 1 cho mỗi cột ('' nếu không có nhóm)
  hasGroups:    boolean;     // có phát hiện header 2 tầng không
  groupSummary: { name: string; count: number }[]; // tóm tắt các nhóm
  dataRows:     any[][];     // dòng dữ liệu
  headerRowIdx: number;      // vị trí dòng chỉ số (1-based, để hiển thị)
}

interface ColMapping {
  idCol:          string;
  nameCol:        string;
  classCol:       string;
  diseaseCol:     string;
  monthCol:       string;
  conclusionCol:  string;
  adviceCol:      string;
  genderCol:      string;
}

interface Props {
  year:      number;
  onSuccess: (count: number, filename: string) => void;
  onCancel:  () => void;
}

// ─── Pattern lists ────────────────────────────────────────────────────────────

const ID_PATTERNS = [
  'code', 'ma nv', 'manv', 'id nv', 'id_nv', 'ma the', 'employee id', 'ma nhan vien',
  '工号', 'so the', 'ma so nv', 'msnv', 'so nhan vien', 'ma cb', 'so hieu',
  'ma bhxh', 'so bhxh', 'ma bao hiem', 'the bh', 'id',
];
const NAME_PATTERNS = [
  'ten (in)', 'ho ten', 'hoten', 'ten nv', 'ho va ten', 'full name', '姓名',
  'ten nhan vien', 'ho ten nv', 'ten', 'nguoi kham', 'ho va ten nv',
];
const CLASS_PATTERNS = [
  'phan loai', 'loai sk', 'ket luan sk', 'kl sk', 'suc khoe loai', 'health class',
  'xep loai', 'xep hang sk', 'hang suc khoe', 'loai suc khoe', 'ket qua ksk',
  'phan hang', 'xep hang', 'loai ksk',
];
const DISEASE_PATTERNS = [
  'ket luan benh', 'benh ly', 'kl benh', 'benh tat', 'ket luan benh ly',
  'chan doan benh', 'chuan doan', 'benh chinh', 'benh man tinh',
];
const MONTH_PATTERNS = [
  'thang kham', 'thang ksk', 'dot kham', 'ky kham', 'lan kham', 'thang ky',
];
const CONCLUSION_PATTERNS = [
  'ket luan sk', 'ket luan suc khoe', 'kl sk', 'ket luan chung', 'kl chung',
  'ket qua kham', 'ket luan tong hop',
];
const ADVICE_PATTERNS = [
  'tu van', 'tuvan', 'huong dan', 'khuyen nghi', 'chi dan', 'tu van suc khoe',
];
const GENDER_PATTERNS = [
  'gioi tinh', 'phai', 'gender', 'sex', '性别', 'gioitinh',
];
// Cột sẽ bị bỏ qua hoàn toàn (không vào exam_details)
const SKIP_PATTERNS = [
  'stt', 'tt', 'ngay kham', 'dia diem', 'sinh', 'gioi tinh', '性别', 'tuoi', 'age',
  'tu van', 'tuvan', 'ghi chu', 'ghichu', 'nhan xet', 'nhanxet',
  'ket luan chung', 'ket luan tong', 'kl chung',
  'don vi', 'phong ban', 'bo phan', 'chuyen mon', 'chuc vu', 'chuc danh',
  'ngay sinh', 'nam sinh', 'que quan', 'dia chi', 'cmnd', 'cccd',
  'ngay', 'nam', 'thang kham',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const norm = (s: any): string =>
  String(s ?? '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');

const matchAny = (cell: any, patterns: string[]): boolean =>
  patterns.some(p => norm(cell).includes(norm(p)));

function findBestCol(headers: string[], patterns: string[]): string {
  return headers.find(h => matchAny(h, patterns)) ?? '';
}

// ─── Core parser ──────────────────────────────────────────────────────────────

export function parseExcelFile(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const allRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (allRows.length === 0) { reject(new Error('File không có dữ liệu.')); return; }

        // ── Bước 1: Tìm dòng chỉ số (tầng 2) ──
        let headerRowIdx = -1;
        let headers: string[] = [];

        // Đếm số ô có nội dung text (không phải số) trong 1 dòng
        const countText = (row: any[]) =>
          row.filter((c: any) => { const s = String(c ?? '').trim(); return s.length > 1 && isNaN(+s); }).length;

        for (let i = 0; i < Math.min(allRows.length, 25); i++) {
          if (allRows[i].some((cell: any) => matchAny(cell, ID_PATTERNS))) {
            const nextRow = allRows[i + 1] || [];
            // Nếu dòng tiếp theo có NHIỀU text hơn → dòng hiện tại là group row (merged cells),
            // dòng tiếp theo mới là header thật.
            // (Merged cell trong XLSX: ô CODE/姓名 ở dòng 2 sẽ rỗng, không match ID_PATTERNS)
            if (countText(nextRow) > countText(allRows[i])) {
              headerRowIdx = i + 1;
              const groupRow = allRows[i]; // raw, chưa propagate
              let last = '';
              headers = nextRow.map((cell: any, colIdx: number) => {
                const subV = String(cell ?? '').trim();
                if (subV) { last = subV; return subV; }

                // Sub-header rỗng → xem group row tại ĐÚNG cột đó (raw, không propagate)
                // Nếu group row có giá trị → đây là ô merge dọc standalone (Phân loại, Kết luận, Tư vấn...)
                //   HOẶC là meta-column (CODE, 姓名…) → đều dùng làm tên cột
                // Nếu group row rỗng → đây là ô nằm trong nhóm ngang → propagate từ cột trước
                const rawGroupV = String(groupRow[colIdx] ?? '').trim();
                if (rawGroupV) { last = rawGroupV; return rawGroupV; }

                return last;
              });
            } else {
              headerRowIdx = i;
              let last = '';
              headers = allRows[i].map((cell: any) => {
                const v = String(cell ?? '').trim();
                if (v) last = v;
                return v || last;
              });
            }
            break;
          }
        }

        // Heuristic fallback: dòng có nhiều text nhất
        if (headerRowIdx === -1) {
          let max = 0;
          for (let i = 0; i < Math.min(allRows.length, 25); i++) {
            const cnt = allRows[i].filter((c: any) => typeof c === 'string' && c.trim().length > 1).length;
            if (cnt > max) { max = cnt; headerRowIdx = i; }
          }
          if (headerRowIdx >= 0)
            headers = allRows[headerRowIdx].map((c: any) => String(c ?? '').trim());
        }

        if (headerRowIdx === -1) { reject(new Error('Không tìm được dòng tiêu đề.')); return; }

        // ── Bước 2: Tìm dòng nhóm (tầng 1) — dòng liền trên headerRow ──
        let colGroups: string[] = new Array(headers.length).fill('');
        let hasGroups = false;
        let groupSummary: { name: string; count: number }[] = [];

        if (headerRowIdx > 0) {
          const potRow = allRows[headerRowIdx - 1];
          // Lan truyền tên nhóm qua các ô trống (merged)
          let cur = '';
          const propagated: string[] = [];
          for (let i = 0; i < Math.max(headers.length, potRow.length); i++) {
            const v = String(potRow[i] ?? '').trim();
            if (v) cur = v;
            propagated.push(cur);
          }

          // Chỉ coi là dòng nhóm nếu có ít nhất 1 nhóm thực sự
          // (khác với ID/Name/Skip patterns → không phải dòng dữ liệu)
          const realGroupCells = propagated.filter((g, i) =>
            g &&
            g !== headers[i] &&
            !matchAny(g, [...ID_PATTERNS, ...NAME_PATTERNS, ...SKIP_PATTERNS, ...CLASS_PATTERNS, ...DISEASE_PATTERNS])
          );

          if (realGroupCells.length > 0) {
            colGroups = propagated.slice(0, headers.length);
            while (colGroups.length < headers.length) colGroups.push(cur);
            hasGroups = true;

            // Tóm tắt nhóm
            const countMap: Record<string, number> = {};
            colGroups.forEach((g, i) => {
              if (g && !matchAny(headers[i], [...ID_PATTERNS, ...NAME_PATTERNS, ...SKIP_PATTERNS])) {
                countMap[g] = (countMap[g] || 0) + 1;
              }
            });
            groupSummary = Object.entries(countMap).map(([name, count]) => ({ name, count }));
          }
        }

        // ── Bước 3: Lọc dữ liệu ──
        const dataRows = allRows.slice(headerRowIdx + 1)
          .filter(row => row.some((c: any) => c !== '' && c !== null && c !== undefined));

        resolve({
          filename: file.name,
          headers,
          colGroups,
          hasGroups,
          groupSummary,
          dataRows,
          headerRowIdx: headerRowIdx + 1,
        });
      } catch (err: any) {
        reject(new Error('Lỗi đọc file: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Không thể đọc file.'));
    reader.readAsBinaryString(file);
  });
}

// ─── Xử lý giá trị tháng (có thể là Excel date serial) ───────────────────────

function parseMonthValue(raw: any): string {
  if (raw === '' || raw === null || raw === undefined) return '';
  // Nếu là số nguyên lớn → Excel date serial → chuyển sang "MM/YYYY"
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 200) {
    try {
      const date = new Date((raw - 25569) * 86400 * 1000);
      if (!isNaN(date.getTime())) {
        return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
      }
    } catch { /* ignore */ }
    return ''; // số không hợp lệ → bỏ qua
  }
  return String(raw).trim();
}

// ─── Build import rows ────────────────────────────────────────────────────────

export function buildImportRows(parsed: ParsedFile, mapping: ColMapping, excludedCols: Set<string> = new Set()) {
  const { headers, colGroups, hasGroups, dataRows } = parsed;

  const idIdx         = headers.indexOf(mapping.idCol);
  const nameIdx       = mapping.nameCol       ? headers.indexOf(mapping.nameCol)       : -1;
  const classIdx      = mapping.classCol      ? headers.indexOf(mapping.classCol)      : -1;
  const diseaseIdx    = mapping.diseaseCol    ? headers.indexOf(mapping.diseaseCol)    : -1;
  const monthIdx      = mapping.monthCol      ? headers.indexOf(mapping.monthCol)      : -1;
  const conclusionIdx = mapping.conclusionCol ? headers.indexOf(mapping.conclusionCol) : -1;
  const adviceIdx     = mapping.adviceCol     ? headers.indexOf(mapping.adviceCol)     : -1;
  const genderIdx     = mapping.genderCol     ? headers.indexOf(mapping.genderCol)     : -1;

  const metaIdxSet = new Set([idIdx, nameIdx, classIdx, diseaseIdx, monthIdx, conclusionIdx, adviceIdx, genderIdx].filter(i => i >= 0));
  headers.forEach((h, i) => { if (matchAny(h, SKIP_PATTERNS)) metaIdxSet.add(i); });
  // Các cột người dùng chọn ẩn
  headers.forEach((h, i) => { if (excludedCols.has(h)) metaIdxSet.add(i); });

  return dataRows
    .map(row => {
      const empId = String(row[idIdx] ?? '').trim().toUpperCase();
      if (!empId || empId.length < 2) return null;

      let examDetails: Record<string, any>;

      if (hasGroups) {
        // Nested: { "Khám thể trạng": { "Chiều cao": 165, ... } }
        const grouped: Record<string, Record<string, any>> = {};
        headers.forEach((h, i) => {
          if (metaIdxSet.has(i) || !h) return;
          const val = row[i];
          if (val === '' || val === null || val === undefined) return;
          const group = colGroups[i] || 'Khác';
          if (!grouped[group]) grouped[group] = {};
          grouped[group][h] = val;
        });
        examDetails = grouped;
      } else {
        // Flat: { "Chiều cao": 165, ... }
        const flat: Record<string, any> = {};
        headers.forEach((h, i) => {
          if (!metaIdxSet.has(i) && h) {
            const val = row[i];
            if (val !== '' && val !== null && val !== undefined) flat[h] = val;
          }
        });
        examDetails = flat;
      }

      return {
        employee_id:        empId,
        patient_name:       nameIdx       >= 0 ? String(row[nameIdx]       ?? '').trim() : '',
        health_class:       classIdx      >= 0 ? String(row[classIdx]      ?? '').trim() : '',
        health_conclusion:  conclusionIdx >= 0 ? String(row[conclusionIdx] ?? '').trim() : '',
        disease_conclusion: diseaseIdx    >= 0 ? String(row[diseaseIdx]    ?? '').trim() : '',
        consultation:       adviceIdx     >= 0 ? String(row[adviceIdx]     ?? '').trim() : '',
        checkup_month:      monthIdx      >= 0 ? parseMonthValue(row[monthIdx]) : '',
        gender:             genderIdx     >= 0 ? String(row[genderIdx]     ?? '').trim() : '',
        exam_details:       examDetails,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

// ─── Component ────────────────────────────────────────────────────────────────

type Step = 'upload' | 'mapping' | 'report';

export const KskImportWizard: React.FC<Props> = ({ year, onSuccess, onCancel }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step,         setStep]         = useState<Step>('upload');
  const [parsed,       setParsed]       = useState<ParsedFile | null>(null);
  const [mapping,      setMapping]      = useState<ColMapping>({ idCol: '', nameCol: '', classCol: '', diseaseCol: '', monthCol: '', conclusionCol: '', adviceCol: '', genderCol: '' });
  const [excludedCols, setExcludedCols] = useState<Set<string>>(new Set());
  const [error,        setError]        = useState<string | null>(null);
  const [importing,    setImporting]    = useState(false);
  const [reportRows,   setReportRows]   = useState<KskReportRow[]>([]);
  const [importCount,  setImportCount]  = useState(0);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setError(null);
    try {
      const result = await parseExcelFile(file);
      setParsed(result);
      setMapping({
        idCol:         findBestCol(result.headers, ID_PATTERNS),
        nameCol:       findBestCol(result.headers, NAME_PATTERNS),
        classCol:      findBestCol(result.headers, CLASS_PATTERNS),
        diseaseCol:    findBestCol(result.headers, DISEASE_PATTERNS),
        monthCol:      findBestCol(result.headers, MONTH_PATTERNS),
        conclusionCol: findBestCol(result.headers, CONCLUSION_PATTERNS),
        adviceCol:     findBestCol(result.headers, ADVICE_PATTERNS),
        genderCol:     findBestCol(result.headers, GENDER_PATTERNS),
      });
      setExcludedCols(new Set());
      setStep('mapping');
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ── Tải bản mẫu Excel ──────────────────────────────────────────────────────
  const downloadTemplate = () => {
    const rows = [
      ['Mã NV', 'Họ và tên', 'Bộ phận', 'Kết luận SK', 'Kết luận bệnh', 'Huyết áp (mmHg)', 'Nhịp tim (lần/ph)', 'Chiều cao (cm)', 'Cân nặng (kg)', 'BMI', 'Thị lực mắt P', 'Thị lực mắt T'],
      ['GTK001', 'NGUYỄN VĂN A', 'Sản xuất', 'Loại I',  'Không có bệnh lý',   '120/80', '72', '170', '65', '22.5', '10/10', '10/10'],
      ['GTK002', 'TRẦN THỊ B',   'Kho vận',  'Loại II', 'Cận thị, thừa cân', '130/85', '78', '158', '70', '28.0', '6/10',  '8/10'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 28 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `KSK_${year}`);
    XLSX.writeFile(wb, `template_KSK_${year}.xlsx`);
  };

  const handleImport = async () => {
    if (!parsed || !mapping.idCol) return;
    if (!window.electron) { setError('Chỉ dùng được trên app desktop.'); return; }
    setImporting(true);
    setError(null);
    try {
      const rows = buildImportRows(parsed, mapping, excludedCols);
      if (rows.length === 0) { setError('Không có dòng hợp lệ — kiểm tra cột Mã NV.'); setImporting(false); return; }
      const result = await window.electron.importHealthCheckups(rows, year);
      if (result.success) {
        // Bổ sung gender vào danh sách nhân viên (localStorage) từ dữ liệu KSK
        const genderUpdates = rows
          .filter(r => r.employee_id && r.gender)
          .map(r => ({ id: r.employee_id, gender: r.gender as string }));
        storage.updatePatientGenders(genderUpdates);

        // Lưu data cho báo cáo rồi chuyển sang Step 3
        setReportRows(rows.map(r => ({
          gender:             r.gender,
          health_class:       r.health_class,
          disease_conclusion: r.disease_conclusion,
        })));
        setImportCount(result.count ?? rows.length);
        setStep('report');
      } else {
        setError(result.message || 'Lỗi từ Database.');
      }
    } catch (err: any) {
      setError('Lỗi: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const previewRows  = parsed ? buildImportRows(parsed, mapping, excludedCols).slice(0, 5) : [];
  const canImport    = !!mapping.idCol && previewRows.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className={`bg-white rounded-2xl shadow-2xl w-full max-h-[90vh] flex flex-col overflow-hidden transition-all ${step === 'report' ? 'max-w-5xl' : 'max-w-3xl'}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-blue-700 text-white shrink-0">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <FileSpreadsheet size={20}/> Nhập kết quả KSKĐ năm {year}
            </h2>
            <p className="text-xs text-blue-200 mt-0.5">Tự động nhận diện cấu trúc file — hỗ trợ header đa tầng</p>
          </div>
          <button onClick={onCancel} className="hover:bg-white/20 p-2 rounded-full"><X size={20}/></button>
        </div>

        {/* Steps */}
        <div className="flex items-center gap-1 px-6 py-2.5 bg-blue-50 border-b shrink-0">
          {[{ key: 'upload', label: '1. Chọn file' }, { key: 'mapping', label: '2. Xác nhận cột' }, { key: 'report', label: '3. Báo cáo' }].map((s, i) => (
            <React.Fragment key={s.key}>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${step === s.key ? 'bg-blue-700 text-white' : (step === 'report' || (step === 'mapping' && i === 0)) ? 'text-blue-600' : 'text-slate-400'}`}>
                {s.label}
              </span>
              {i < 2 && <ChevronRight size={13} className="text-slate-400"/>}
            </React.Fragment>
          ))}
        </div>

        {/* Step 3: Report — chiếm toàn bộ phần body, render trước để không bị đẩy */}
        {step === 'report' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Success banner */}
            <div className="flex items-center gap-3 px-6 py-3 bg-green-50 border-b border-green-200 shrink-0">
              <CheckCircle size={18} className="text-green-600 shrink-0"/>
              <span className="text-sm text-green-800 font-semibold">
                Đã import thành công <strong>{importCount}</strong> nhân viên từ <strong>{parsed?.filename}</strong>
              </span>
            </div>
            <KskReport
              rows={reportRows}
              year={year}
              filename={parsed?.filename ?? ''}
              onClose={() => onSuccess(importCount, parsed?.filename ?? '')}
            />
          </div>
        )}

        {/* Steps 1 & 2 body */}
        {step !== 'report' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-blue-300 rounded-xl p-10 flex flex-col items-center gap-4 cursor-pointer hover:bg-blue-50 transition"
                onClick={() => fileInputRef.current?.click()}>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange}/>
                <Upload size={40} className="text-blue-400"/>
                <div className="text-center">
                  <p className="font-bold text-slate-700">Nhấn để chọn file Excel (.xlsx / .xls)</p>
                  <p className="text-sm text-slate-400 mt-1">Tự nhận diện header đơn tầng và đa tầng (merged cells)</p>
                </div>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={downloadTemplate}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-300 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <FileSpreadsheet size={16} />
                  Tải bản mẫu Excel / 下载模板
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Mapping */}
          {step === 'mapping' && parsed && (
            <>
              {/* File info */}
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle size={18} className="text-green-600 mt-0.5 shrink-0"/>
                  <div className="flex-1 text-sm">
                    <p className="font-bold text-green-800">{parsed.filename}</p>
                    <p className="text-green-700 mt-0.5">
                      Header ở dòng <strong>{parsed.headerRowIdx}</strong> —&nbsp;
                      <strong>{parsed.dataRows.length}</strong> nhân viên —&nbsp;
                      <strong>{parsed.headers.filter(h => h).length}</strong> cột
                    </p>
                    {/* Group summary */}
                    {parsed.hasGroups && parsed.groupSummary.length > 0 && (
                      <div className="mt-2 flex items-start gap-2">
                        <Layers size={14} className="text-blue-600 mt-0.5 shrink-0"/>
                        <div>
                          <span className="font-bold text-blue-700">Phát hiện {parsed.groupSummary.length} nhóm chỉ số: </span>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {parsed.groupSummary.map(g => (
                              <span key={g.name} className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                                {g.name} <span className="opacity-60">({g.count})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    {!parsed.hasGroups && (
                      <p className="text-slate-500 text-xs mt-1">Header đơn tầng — các chỉ số sẽ được lưu dạng phẳng</p>
                    )}
                  </div>
                  <button onClick={() => { setParsed(null); setStep('upload'); setError(null); }}
                    className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 shrink-0">
                    <RotateCcw size={12}/> Đổi file
                  </button>
                </div>
              </div>

              {/* Column mapping */}
              <div>
                <h3 className="font-bold text-slate-700 mb-2 text-sm uppercase tracking-wide">Ánh xạ cột thông tin chính</h3>
                <div className="grid grid-cols-2 gap-3">
                  <MappingRow label="Mã nhân viên" required hint="CODE, Mã NV, 工号..."
                    value={mapping.idCol} headers={parsed.headers}
                    onChange={v => setMapping(m => ({ ...m, idCol: v }))}/>
                  <MappingRow label="Họ và tên" hint="TÊN (in), Họ tên..."
                    value={mapping.nameCol} headers={parsed.headers}
                    onChange={v => setMapping(m => ({ ...m, nameCol: v }))}/>
                  <MappingRow label="Phân loại sức khỏe" hint="Phân loại, Loại SK, Xếp loại..."
                    value={mapping.classCol} headers={parsed.headers}
                    onChange={v => setMapping(m => ({ ...m, classCol: v }))}/>
                  <MappingRow label="Kết luận bệnh lý" hint="Kết luận bệnh, Bệnh lý..."
                    value={mapping.diseaseCol} headers={parsed.headers}
                    onChange={v => setMapping(m => ({ ...m, diseaseCol: v }))}/>
                  <MappingRow label="Tháng / Đợt khám" hint="Tháng khám, Đợt khám, Kỳ khám..."
                    value={mapping.monthCol} headers={parsed.headers}
                    onChange={v => setMapping(m => ({ ...m, monthCol: v }))}/>
                  <MappingRow label="Kết luận sức khỏe" hint="Kết luận SK, Kết luận chung..."
                    value={mapping.conclusionCol} headers={parsed.headers}
                    onChange={v => setMapping(m => ({ ...m, conclusionCol: v }))}/>
                  <MappingRow label="Tư vấn" hint="Tư vấn, Hướng dẫn, Khuyến nghị..."
                    value={mapping.adviceCol} headers={parsed.headers}
                    onChange={v => setMapping(m => ({ ...m, adviceCol: v }))}/>
                  <MappingRow label="Giới tính" hint="Giới tính, Phái, Gender..."
                    value={mapping.genderCol} headers={parsed.headers}
                    onChange={v => setMapping(m => ({ ...m, genderCol: v }))}/>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  {parsed.hasGroups
                    ? '✦ Các chỉ số sẽ được lưu theo nhóm (cấu trúc đa tầng) — hiển thị đẹp trong hồ sơ sức khỏe'
                    : '✦ Tất cả cột còn lại sẽ được lưu vào chi tiết kết quả xét nghiệm'}
                </p>
              </div>

              {/* Chọn cột chỉ số hiển thị */}
              {canImport && (() => {
                const metaSet = new Set([mapping.idCol, mapping.nameCol, mapping.classCol, mapping.diseaseCol, mapping.monthCol, mapping.conclusionCol, mapping.adviceCol].filter(Boolean));
                const examCols = parsed.headers.filter(h => h && !metaSet.has(h) && !matchAny(h, SKIP_PATTERNS));
                if (examCols.length === 0) return null;
                const allVisible = examCols.every(h => !excludedCols.has(h));
                return (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide flex items-center gap-2">
                        <Eye size={14}/> Chỉ số hiển thị trong hồ sơ
                      </h3>
                      <button onClick={() => setExcludedCols(allVisible ? new Set(examCols) : new Set())}
                        className="text-xs text-blue-600 hover:underline">
                        {allVisible ? 'Ẩn tất cả' : 'Hiện tất cả'}
                      </button>
                    </div>
                    <div className="border rounded-xl overflow-hidden">
                      <div className="grid grid-cols-3 gap-0 max-h-48 overflow-y-auto">
                        {examCols.map(col => {
                          const hidden = excludedCols.has(col);
                          return (
                            <label key={col} className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer border-b border-r border-slate-100 hover:bg-slate-50 ${hidden ? 'opacity-40' : ''}`}>
                              <input type="checkbox" checked={!hidden}
                                onChange={e => {
                                  const next = new Set(excludedCols);
                                  e.target.checked ? next.delete(col) : next.add(col);
                                  setExcludedCols(next);
                                }}
                                className="accent-blue-600 shrink-0"/>
                              <span className="text-xs truncate" title={col}>{col}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {examCols.length - excludedCols.size}/{examCols.length} chỉ số được lưu
                    </p>
                  </div>
                );
              })()}

              {/* Preview */}
              {canImport && (
                <div>
                  <h3 className="font-bold text-slate-700 mb-2 text-sm uppercase tracking-wide">
                    Xem trước ({Math.min(5, previewRows.length)}/{parsed.dataRows.length} dòng)
                  </h3>
                  <div className="overflow-x-auto border rounded-xl">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Mã NV</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Họ tên</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Phân loại SK</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Kết luận bệnh</th>
                          <th className="px-3 py-2 text-center font-semibold text-slate-600">Chỉ số lâm sàng</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => {
                          const examCount = parsed.hasGroups
                            ? Object.values(row.exam_details).reduce((s: number, g: any) => s + (typeof g === 'object' ? Object.keys(g).length : 1), 0)
                            : Object.keys(row.exam_details).length;
                          const groupCount = parsed.hasGroups ? Object.keys(row.exam_details).length : 0;
                          return (
                            <tr key={i} className={i % 2 === 0 ? '' : 'bg-slate-50'}>
                              <td className="px-3 py-1.5 font-mono font-bold text-blue-700">{row.employee_id}</td>
                              <td className="px-3 py-1.5 font-medium">{row.patient_name || <span className="text-slate-300">—</span>}</td>
                              <td className="px-3 py-1.5">
                                {row.health_class
                                  ? <span className="bg-green-100 text-green-800 font-bold px-2 py-0.5 rounded">{row.health_class}</span>
                                  : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-3 py-1.5 text-slate-600 max-w-[160px] truncate">
                                {row.disease_conclusion || <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-3 py-1.5 text-center text-slate-500">
                                {parsed.hasGroups
                                  ? <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-semibold">{groupCount} nhóm / {examCount} chỉ số</span>
                                  : <span>{examCount} chỉ số</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {!canImport && !error && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-800 flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0"/>
                  Vui lòng chọn cột <strong>Mã nhân viên</strong> để tiếp tục.
                </div>
              )}
            </>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5"/>
              <span>{error}</span>
            </div>
          )}
        </div>
        )} {/* end step !== 'report' */}

        {/* Footer — ẩn khi ở bước report (KskReport tự có footer) */}
        {step !== 'report' && (
          <div className="flex justify-between items-center px-6 py-4 bg-slate-50 border-t shrink-0">
            <button onClick={onCancel} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-200 transition">
              Huỷ
            </button>
            {step === 'mapping' && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">
                  Sẽ import <strong className="text-slate-700">{parsed?.dataRows.length ?? 0}</strong> nhân viên vào năm <strong className="text-slate-700">{year}</strong>
                </span>
                <button onClick={handleImport} disabled={!canImport || importing}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition shadow-sm
                    ${canImport && !importing ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
                  {importing ? <><span className="animate-spin inline-block">⟳</span> Đang nhập...</> : <><CheckCircle size={16}/> Xác nhận Import</>}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── MappingRow ───────────────────────────────────────────────────────────────

function MappingRow({ label, required, hint, value, headers, onChange }: {
  label: string; required?: boolean; hint: string;
  value: string; headers: string[]; onChange: (v: string) => void;
}) {
  return (
    <div className={`rounded-xl border p-3 ${required && !value ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-bold text-slate-700">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {value && <button onClick={() => onChange('')} className="text-slate-400 hover:text-slate-600"><X size={12}/></button>}
      </div>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full text-sm border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 ring-blue-400">
        <option value="">— Không dùng —</option>
        {headers.filter(h => h.trim()).map((h, i) => <option key={i} value={h}>{h}</option>)}
      </select>
      <p className="text-[10px] text-slate-400 mt-1">Gợi ý: {hint}</p>
    </div>
  );
}
