/**
 * KskReport.tsx — Báo cáo kết quả KSKĐ (Step 3 sau import)
 * Hiển thị: giới tính, phân loại SK, top 5 bệnh lý + xuất PDF
 */
import React, { useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import { Download, Users, AlertTriangle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KskReportRow {
  gender?:             string;
  health_class?:       string;
  disease_conclusion?: string;
}

interface Props {
  rows:          KskReportRow[];
  year:          number;
  filename:      string;
  onClose:       () => void;
  hideFooter?:   boolean;
  onExportPdf?:  () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const normStr = (s?: string) =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');

function isNam(g?: string): boolean {
  const n = normStr(g);
  return n === 'nam' || n === 'm' || n === 'male' || n === '0' || n === 'nam(male)';
}
function isNu(g?: string): boolean {
  const n = normStr(g);
  return n === 'nu' || n === 'f' || n === 'female' || n === '1' || n === 'nu(female)';
}

function normalizeClass(cls?: string): string {
  if (!cls || !cls.trim()) return 'Chưa phân loại';
  const n = normStr(cls);
  if (n.includes('iv') || n === '4') return 'Loại IV';
  if (n.includes('iii') || n === '3') return 'Loại III';
  if (n.includes('ii') || n === '2') return 'Loại II';
  if (n.includes('i') || n === '1') return 'Loại I';
  return cls.trim();
}

function isNormal(d: string): boolean {
  const n = normStr(d);
  return !n || n === 'binhthuong' || n === 'khong' || n === 'khongcobenh'
    || n === 'khongphathinh' || n === 'khongcobenly' || n === '-' || n === '0';
}

const CLASS_COLORS: Record<string, string> = {
  'Loại I':          '#16a34a',
  'Loại II':         '#2563eb',
  'Loại III':        '#d97706',
  'Loại IV':         '#dc2626',
  'Chưa phân loại':  '#9ca3af',
};
const GENDER_COLORS = ['#3b82f6', '#ec4899', '#9ca3af'];
const BAR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

// ─── Custom label cho Pie ─────────────────────────────────────────────────────

const renderPieLabel = ({ cx, cy, midAngle, outerRadius, percent, name }: any) => {
  if (percent < 0.04) return null;
  const RAD = Math.PI / 180;
  const r = outerRadius + 22;
  const x = cx + r * Math.cos(-midAngle * RAD);
  const y = cy + r * Math.sin(-midAngle * RAD);
  return (
    <text x={x} y={y} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central"
      style={{ fontSize: 11, fill: '#374151', fontWeight: 600 }}>
      {name} {(percent * 100).toFixed(1)}%
    </text>
  );
};

// ─── Excel Export ─────────────────────────────────────────────────────────────

function exportExcel(rows: KskReportRow[], year: number, filename: string) {
  const total = rows.length;
  const pct = (n: number) => total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '0%';

  // Gender counts — bỏ null/rỗng ra khỏi "Khác"
  let maleCount = 0, femaleCount = 0, otherGender = 0, unknownGender = 0;
  rows.forEach(r => {
    const g = (r.gender ?? '').trim();
    if (!g) { unknownGender++; return; }
    if (isNam(r.gender)) maleCount++;
    else if (isNu(r.gender)) femaleCount++;
    else otherGender++;
  });
  const otherCount = otherGender;
  const knownGender = maleCount + femaleCount + otherCount;
  const pctG = (n: number) => knownGender > 0 ? `${((n / knownGender) * 100).toFixed(1)}%` : '—';

  // Health class counts
  const classMap: Record<string, number> = {};
  rows.forEach(r => { const c = normalizeClass(r.health_class); classMap[c] = (classMap[c] || 0) + 1; });
  const ORDER = ['Loại I', 'Loại II', 'Loại III', 'Loại IV', 'Chưa phân loại'];
  const classData = Object.entries(classMap)
    .sort((a, b) => (ORDER.indexOf(a[0]) + 99) % 99 - (ORDER.indexOf(b[0]) + 99) % 99);

  // Top 5 diseases
  const diseaseMap: Record<string, number> = {};
  rows.forEach(r => {
    if (!r.disease_conclusion) return;
    r.disease_conclusion.split(/[,;、\/\n]/).forEach(part => {
      const d = part.trim();
      if (d && !isNormal(d)) diseaseMap[d] = (diseaseMap[d] || 0) + 1;
    });
  });
  const top5 = Object.entries(diseaseMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const sheetData: any[][] = [
    [`BÁO CÁO KẾT QUẢ KHÁM SỨC KHỎE ĐỊNH KỲ NĂM ${year}`],
    [`Nguồn file: ${filename}`],
    [],
    // KPI
    ['TỔNG QUAN'],
    ['Chỉ tiêu', 'Số lượng', 'Tỷ lệ'],
    ['Tổng số người khám', total, '100%'],
    ['Nam', maleCount, pctG(maleCount)],
    ['Nữ', femaleCount, pctG(femaleCount)],
    ...(otherCount > 0 ? [['Giới tính khác', otherCount, pctG(otherCount)]] : []),
    ...(unknownGender > 0 ? [['Chưa có TT giới tính', unknownGender, pct(unknownGender)]] : []),
    ['Có bệnh lý', rows.filter(r => r.disease_conclusion && !isNormal(r.disease_conclusion)).length,
      pct(rows.filter(r => r.disease_conclusion && !isNormal(r.disease_conclusion)).length)],
    [],
    // Health class
    ['PHÂN LOẠI SỨC KHỎE'],
    ['Phân loại', 'Số lượng', 'Tỷ lệ'],
    ...classData.map(([name, count]) => [name, count, pct(count)]),
    [],
    // Top 5 diseases
    ...(top5.length > 0 ? [
      [`TOP ${top5.length} BỆNH LÝ PHỔ BIẾN`],
      ['Bệnh lý', 'Số lượng', 'Tỷ lệ'],
      ...top5.map(([name, count]) => [name, count, pct(count)]),
    ] : []),
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  // Column widths
  ws['!cols'] = [{ wch: 45 }, { wch: 12 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Báo cáo KSKĐ');
  const safeYear = String(year);
  XLSX.writeFile(wb, `BaoCao_KSKD_${safeYear}.xlsx`);
}

// ─── Component ────────────────────────────────────────────────────────────────

export const KskReport: React.FC<Props> = ({ rows, year, filename, onClose, hideFooter, onExportPdf }) => {
  const total = rows.length;
  const pct = (n: number) => total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '0%';

  // Giới tính — tách rõ: null/rỗng = chưa nhập (không phải "Khác")
  const { maleCount, femaleCount, otherCount, unknownGender } = useMemo(() => {
    let m = 0, f = 0, o = 0, u = 0;
    rows.forEach(r => {
      const g = (r.gender ?? '').trim();
      if (!g) { u++; return; }           // null / rỗng → chưa có thông tin
      if (isNam(r.gender)) m++;
      else if (isNu(r.gender)) f++;
      else o++;                           // có giá trị nhưng không nhận dạng được
    });
    return { maleCount: m, femaleCount: f, otherCount: o, unknownGender: u };
  }, [rows]);

  // Chỉ vẽ pie với những người có thông tin giới tính
  const genderData = useMemo(() =>
    [
      { name: 'Nam', value: maleCount },
      { name: 'Nữ', value: femaleCount },
      ...(otherCount > 0 ? [{ name: 'Khác', value: otherCount }] : []),
    ].filter(d => d.value > 0),
  [maleCount, femaleCount, otherCount]);

  // Phân loại SK
  const classData = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach(r => { const c = normalizeClass(r.health_class); map[c] = (map[c] || 0) + 1; });
    const ORDER = ['Loại I', 'Loại II', 'Loại III', 'Loại IV', 'Chưa phân loại'];
    return Object.entries(map)
      .sort((a, b) => (ORDER.indexOf(a[0]) + 99) % 99 - (ORDER.indexOf(b[0]) + 99) % 99)
      .map(([name, value]) => ({ name, value }));
  }, [rows]);

  // Bệnh lý
  const diseaseCount = rows.filter(r => r.disease_conclusion && !isNormal(r.disease_conclusion)).length;

  const top5 = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach(r => {
      if (!r.disease_conclusion) return;
      r.disease_conclusion.split(/[,;、\/\n]/).forEach(part => {
        const d = part.trim();
        if (d && !isNormal(d)) map[d] = (map[d] || 0) + 1;
      });
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, value], i) => ({ name, value, color: BAR_COLORS[i] }));
  }, [rows]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Scrollable report body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50">

        {/* Title */}
        <div className="bg-white rounded-2xl border p-5 text-center">
          <h1 className="text-xl font-black text-gray-800 uppercase tracking-wide">
            Báo cáo kết quả khám sức khỏe định kỳ
          </h1>
          <p className="text-medical-green font-bold text-lg mt-1">Năm {year}</p>
          <p className="text-xs text-gray-400 mt-0.5">{filename}</p>
        </div>

        {/* KPI cards */}
        {(() => {
          // % giới tính tính trên số người có dữ liệu giới tính
          const knownGender = maleCount + femaleCount + otherCount;
          const pctGender = (n: number) => knownGender > 0 ? `${((n / knownGender) * 100).toFixed(1)}%` : '—';
          return (
            <div className="grid grid-cols-4 gap-4">
              {[
                { icon: <Users size={22}/>, label: 'Tổng số người khám', value: total, sub: '100%', bg: 'bg-slate-100', text: 'text-slate-800' },
                { icon: <span className="text-lg font-black">♂</span>, label: 'Nam', value: maleCount, sub: pctGender(maleCount), bg: 'bg-blue-50', text: 'text-blue-800' },
                { icon: <span className="text-lg font-black">♀</span>, label: 'Nữ', value: femaleCount, sub: pctGender(femaleCount), bg: 'bg-pink-50', text: 'text-pink-800' },
                { icon: <AlertTriangle size={20}/>, label: 'Có bệnh lý', value: diseaseCount, sub: pct(diseaseCount), bg: 'bg-orange-50', text: 'text-orange-800' },
              ].map(k => (
                <div key={k.label} className={`rounded-xl p-4 ${k.bg} ${k.text} flex items-start gap-3`}>
                  <div className="mt-1 opacity-70">{k.icon}</div>
                  <div>
                    <div className="text-3xl font-black">{k.value.toLocaleString()}</div>
                    <div className="text-xs font-semibold opacity-60 mt-0.5">{k.label}</div>
                    <div className="text-sm font-bold">{k.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
        {/* Cảnh báo khi thiếu dữ liệu giới tính */}
        {unknownGender > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-800 flex items-center gap-2">
            <AlertTriangle size={14} className="shrink-0 text-amber-500"/>
            <span>
              <strong>{unknownGender.toLocaleString()} người</strong> chưa có thông tin giới tính (chiếm {pct(unknownGender)}) — không tính vào biểu đồ giới tính.
              {unknownGender > total * 0.1 && ' Hãy bổ sung cột "Giới tính" khi nhập lại file KSK.'}
            </span>
          </div>
        )}

        {/* Charts row */}
        <div className="grid grid-cols-2 gap-5">

          {/* Gender pie */}
          <div className="bg-white rounded-xl border p-4">
            <h3 className="font-bold text-gray-700 mb-2 text-center text-sm uppercase tracking-wide">
              Giới tính
              {unknownGender > 0 && (
                <span className="ml-2 text-[10px] font-normal text-amber-600 normal-case">
                  ({(maleCount + femaleCount + otherCount).toLocaleString()}/{total.toLocaleString()} người có dữ liệu)
                </span>
              )}
            </h3>
            {genderData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={genderData} dataKey="value" cx="50%" cy="50%" outerRadius={75}
                      labelLine label={renderPieLabel}>
                      {genderData.map((_, i) => <Cell key={i} fill={GENDER_COLORS[i]}/>)}
                    </Pie>
                    <Tooltip formatter={(v: any) => [`${v} người`]}/>
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-5 mt-1">
                  {(() => {
                    const known = maleCount + femaleCount + otherCount;
                    const pg = (n: number) => known > 0 ? `${((n / known) * 100).toFixed(1)}%` : '0%';
                    return genderData.map((d, i) => (
                      <span key={d.name} className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                        <span className="w-3 h-3 rounded-full" style={{ background: GENDER_COLORS[i] }}/>
                        {d.name}: <strong>{d.value}</strong> ({pg(d.value)})
                      </span>
                    ));
                  })()}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-slate-400 text-sm">
                Chưa có thông tin giới tính
              </div>
            )}
          </div>

          {/* Health class pie */}
          <div className="bg-white rounded-xl border p-4">
            <h3 className="font-bold text-gray-700 mb-2 text-center text-sm uppercase tracking-wide">Phân loại sức khỏe</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={classData} dataKey="value" cx="50%" cy="50%" outerRadius={75}
                  labelLine label={renderPieLabel}>
                  {classData.map(d => <Cell key={d.name} fill={CLASS_COLORS[d.name] ?? '#9ca3af'}/>)}
                </Pie>
                <Tooltip formatter={(v: any) => [`${v} người`]}/>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-3 mt-1">
              {classData.map(d => (
                <span key={d.name} className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                  <span className="w-3 h-3 rounded-full" style={{ background: CLASS_COLORS[d.name] ?? '#9ca3af' }}/>
                  {d.name}: <strong>{d.value}</strong>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Top 5 diseases */}
        {top5.length > 0 && (
          <div className="bg-white rounded-xl border p-4">
            <h3 className="font-bold text-gray-700 mb-3 text-sm uppercase tracking-wide">
              Top {top5.length} bệnh lý phổ biến
            </h3>
            <ResponsiveContainer width="100%" height={top5.length * 48 + 20}>
              <BarChart data={top5} layout="vertical" margin={{ left: 8, right: 80, top: 4, bottom: 4 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false}/>
                <YAxis type="category" dataKey="name" width={220} tick={{ fontSize: 12 }} tickLine={false}/>
                <Tooltip formatter={(v: any) => [`${v} người`]}/>
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {top5.map((d, i) => <Cell key={i} fill={d.color}/>)}
                  <LabelList dataKey="value" position="right"
                    formatter={(v: any) => `${v} (${pct(v)})`}
                    style={{ fontSize: 11, fill: '#374151', fontWeight: 600 }}/>
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Class detail table */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Phân loại SK</th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Số lượng</th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Tỷ lệ</th>
                <th className="px-4 py-2.5 font-semibold text-slate-600 w-44">Biểu đồ cột</th>
              </tr>
            </thead>
            <tbody>
              {classData.map((d, i) => (
                <tr key={d.name} className={i % 2 ? 'bg-slate-50' : ''}>
                  <td className="px-4 py-2 flex items-center gap-2 font-medium">
                    <span className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: CLASS_COLORS[d.name] ?? '#9ca3af' }}/>
                    {d.name}
                  </td>
                  <td className="px-4 py-2 text-right font-bold">{d.value}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{pct(d.value)}</td>
                  <td className="px-4 py-2">
                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${((d.value / total) * 100).toFixed(1)}%`, background: CLASS_COLORS[d.name] ?? '#9ca3af' }}/>
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-100 font-bold border-t">
                <td className="px-4 py-2">Tổng cộng</td>
                <td className="px-4 py-2 text-right">{total}</td>
                <td className="px-4 py-2 text-right">100%</td>
                <td/>
              </tr>
            </tbody>
          </table>
        </div>

      </div>

      {/* Footer */}
      {!hideFooter && (
        <div className="flex justify-between items-center px-6 py-4 bg-slate-50 border-t shrink-0">
          <button onClick={onClose}
            className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-200 transition">
            Đóng
          </button>
          <div className="flex gap-2">
            {onExportPdf && (
              <button onClick={onExportPdf}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-sm transition">
                <Download size={16}/> Xuất PDF
              </button>
            )}
            <button onClick={() => exportExcel(rows, year, filename)}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm shadow-sm transition">
              <Download size={16}/> Xuất Excel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
