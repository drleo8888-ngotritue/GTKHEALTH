/**
 * KskReportModal.tsx
 * Modal xem báo cáo tổng hợp KSKĐ theo năm — chọn đợt khám, hiển thị y hệt Step 3
 */
import React, { useState } from 'react';
import { X, Search, FileBarChart2, CalendarDays } from 'lucide-react';
import { KskReport, type KskReportRow } from './KskReport';

interface Props {
  onClose: () => void;
}

export const KskReportModal: React.FC<Props> = ({ onClose }) => {
  const [year, setYear]           = useState(new Date().getFullYear());
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  // Sau khi load: danh sách đợt và toàn bộ rows theo đợt
  const [months, setMonths]       = useState<string[]>([]);   // ['03/2026', '06/2026', ...]
  const [allRows, setAllRows]     = useState<(KskReportRow & { checkup_month?: string })[]>([]);
  const [selMonth, setSelMonth]   = useState<string>('__all__'); // '__all__' = tổng hợp

  // Rows hiển thị theo đợt đang chọn
  const displayRows: KskReportRow[] = selMonth === '__all__'
    ? allRows
    : allRows.filter(r => (r as any).checkup_month === selMonth);

  const loadReport = async () => {
    if (!window.electron) { setError('Chỉ chạy được trên app desktop.'); return; }
    setLoading(true); setError(''); setAllRows([]); setMonths([]); setSelMonth('__all__');
    try {
      const res = await window.electron.getKskReport(year);
      if (res.rows.length === 0) {
        setError(`Không có dữ liệu KSK năm ${year}. Hãy nhập file KSK trước.`);
      } else {
        setAllRows(res.rows as any);
        setMonths(res.months);
        // Nếu chỉ có 1 đợt, tự động chọn đợt đó
        setSelMonth(res.months.length === 1 ? res.months[0] : '__all__');
      }
    } catch (e: any) {
      setError('Lỗi: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const hasData = displayRows.length > 0;

  // Label hiển thị trong KskReport
  const filenameLabel = selMonth === '__all__'
    ? `Tổng hợp ${months.length} đợt khám năm ${year}`
    : `Đợt khám ${selMonth}`;

  return (
    <>
      {/* Print CSS */}
      <style>{`
        @media print {
          body > * { visibility: hidden; }
          #ksk-report-standalone, #ksk-report-standalone * { visibility: visible; }
          #ksk-report-standalone { position: fixed; inset: 0; overflow: auto; background: white; z-index: 9999; }
          .no-print { display: none !important; }
          @page { size: A4 landscape; margin: 0.8cm; }
        }
      `}</style>

      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className={`bg-white rounded-2xl shadow-2xl w-full max-h-[92vh] flex flex-col overflow-hidden transition-all ${hasData ? 'max-w-5xl' : 'max-w-lg'}`}>

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 bg-blue-700 text-white shrink-0 no-print">
            <div className="flex items-center gap-3">
              <FileBarChart2 size={20}/>
              <div>
                <h2 className="text-lg font-bold">Báo cáo tổng hợp Khám sức khỏe định kỳ</h2>
                <p className="text-xs text-blue-200">Chọn năm → chọn đợt khám → xem báo cáo</p>
              </div>
            </div>
            <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-full"><X size={20}/></button>
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap items-end gap-3 px-6 py-4 bg-blue-50 border-b shrink-0 no-print">
            {/* Năm */}
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Năm khám</label>
              <input
                type="number" value={year}
                onChange={e => { setYear(Number(e.target.value)); setAllRows([]); setMonths([]); setSelMonth('__all__'); }}
                onKeyDown={e => e.key === 'Enter' && loadReport()}
                min={2020} max={2099}
                className="w-24 border rounded-lg px-3 py-1.5 text-sm font-bold text-center focus:ring-2 ring-blue-400 focus:outline-none"
              />
            </div>

            {/* Dropdown đợt khám — hiện ngay sau khi có dữ liệu */}
            {months.length > 0 && (
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1 flex items-center gap-1">
                  <CalendarDays size={12}/> Đợt khám
                </label>
                <select
                  value={selMonth}
                  onChange={e => setSelMonth(e.target.value)}
                  className="border rounded-lg px-3 py-1.5 text-sm font-semibold focus:ring-2 ring-blue-400 focus:outline-none bg-white min-w-[180px]"
                >
                  <option value="__all__">Tổng hợp tất cả ({allRows.length} người)</option>
                  {months.map(m => {
                    const cnt = allRows.filter((r: any) => r.checkup_month === m).length;
                    return <option key={m} value={m}>Đợt {m} — {cnt} người</option>;
                  })}
                </select>
              </div>
            )}

            <button
              onClick={loadReport} disabled={loading}
              className="flex items-center gap-2 px-5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-bold text-sm transition"
            >
              {loading
                ? <><span className="animate-spin inline-block text-base">⟳</span> Đang tải...</>
                : <><Search size={14}/> {allRows.length > 0 ? 'Tải lại' : 'Xem báo cáo'}</>}
            </button>
          </div>

          {/* Body */}
          {!hasData && (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-10">
              {error
                ? <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm w-full max-w-sm text-center">{error}</div>
                : <>
                    <FileBarChart2 size={48} className="mb-3 opacity-20"/>
                    <p className="font-semibold">Chọn năm rồi bấm <strong>"Xem báo cáo"</strong></p>
                    <p className="text-xs mt-1 opacity-70">Hệ thống sẽ tự phát hiện số đợt khám trong năm</p>
                  </>
              }
            </div>
          )}

          {hasData && (
            <div className="flex-1 flex flex-col min-h-0" id="ksk-report-standalone">
              <KskReport
                rows={displayRows}
                year={year}
                filename={filenameLabel}
                onClose={onClose}
                onExportPdf={() => window.print()}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
};
