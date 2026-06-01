/**
 * MonthlyReport.tsx — Report Preview (Step 3 của ReportWizard)
 * Nhận props từ wizard: reportType, selectedMonth/Quarter, selectedYear, filterStation
 * Cột trái: bật/tắt & cấu hình từng khối nội dung
 * Cột phải: preview báo cáo thực tế → in/PDF
 */
import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LabelList,
} from 'recharts';
import { Printer, ChevronLeft, Settings2, ToggleLeft, ToggleRight, Download } from 'lucide-react';
import { Encounter, EncounterStatus, StationConfig, StationType, Medicine } from '../types';
import * as XLSX from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Section {
  id: string;
  label: string;
  enabled: boolean;
}

export type ReportType = 'monthly' | 'quarterly';

export interface MonthlyReportProps {
  encounters: Encounter[];
  medicines: Medicine[];
  stationConfig: StationConfig;
  onClose: () => void;
  onBack: () => void;
  // Từ wizard
  reportType: ReportType;
  selectedMonth: number;
  selectedQuarter: 1 | 2 | 3 | 4;
  selectedYear: number;
  filterStation: string;
}

const CHART_COLORS = ['#1e40af', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'];
const PIE_COLORS   = ['#1e40af', '#3b82f6', '#60a5fa', '#f59e0b', '#10b981', '#ef4444'];

function pad2(n: number) { return String(n).padStart(2, '0'); }

interface MonthData {
  month: number;
  label: string;
  total: number;
  groups: [string, number][];
}

// Tháng trong quý
function quarterMonths(q: 1|2|3|4): number[] {
  return [1, 2, 3].map(i => (q - 1) * 3 + i);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const MonthlyReport: React.FC<MonthlyReportProps> = ({
  encounters, medicines, stationConfig, onClose, onBack,
  reportType, selectedMonth, selectedQuarter, selectedYear, filterStation,
}) => {

  // ── Section toggles ──
  const [sections, setSections] = useState<Section[]>([
    { id: 'kpi',             label: 'Thẻ KPI tổng quan',                    enabled: true  },
    { id: 'chart_trend',     label: 'Biểu đồ xu hướng',                     enabled: true  },
    { id: 'chart_pie',       label: 'Biểu đồ cơ cấu bệnh tật',             enabled: true  },
    { id: 'chart_bar_disease', label: 'Biểu đồ mặt bệnh (cột)',             enabled: true  },
    { id: 'checkup',         label: 'Tiến độ Khám sức khỏe',               enabled: true  },
    { id: 'disease_table',   label: 'Bảng thống kê nhóm bệnh',             enabled: true  },
    { id: 'quarterly_breakdown', label: 'So sánh theo tháng (báo cáo quý)', enabled: true  },
    { id: 'top_meds',        label: 'Thuốc sử dụng nhiều nhất',             enabled: false },
    { id: 'transfers',       label: 'Danh sách ca chuyển tuyến',            enabled: true  },
    { id: 'detail_list',     label: 'Danh sách ca khám chi tiết',           enabled: false },
    { id: 'nhanxet',         label: 'Nhận xét tổng hợp',                    enabled: true  },
    { id: 'kiennghi',        label: 'Kiến nghị',                            enabled: false },
    { id: 'signature',       label: 'Phần ký xác nhận',                     enabled: true  },
  ]);

  const toggle = (id: string) =>
    setSections(s => s.map(sec => sec.id === id ? { ...sec, enabled: !sec.enabled } : sec));
  const has = (id: string) => sections.find(s => s.id === id)?.enabled ?? false;

  // ── KPI manual inputs ──
  const [accidents,   setAccidents]   = useState(0);
  const [budgetPct,   setBudgetPct]   = useState(85);

  // ── Checkup manual inputs ──
  const [chkPeriodic, setChkPeriodic] = useState(95);
  const [chkEntry,    setChkEntry]    = useState(98);
  const [chkWork,     setChkWork]     = useState(93);

  // ── Custom text ──
  const [nhanxet,  setNhanxet]  = useState('');
  const [kiennghi, setKiennghi] = useState('');

  // ── Signature ──
  const [preparedBy,  setPreparedBy]  = useState('');
  const [approvedBy,  setApprovedBy]  = useState('');

  // ── Detail list: top N ──
  const [detailTopN, setDetailTopN] = useState(20);

  // ─── Computed data ──────────────────────────────────────────────────────────

  // Lọc theo trạm
  const stationFiltered = useMemo(() => {
    if (stationConfig.type === StationType.HUB) {
      return filterStation === 'ALL' ? encounters : encounters.filter(e => e.stationName === filterStation);
    }
    return encounters.filter(e => e.stationName === stationConfig.name);
  }, [encounters, filterStation, stationConfig]);

  // Lọc theo kỳ (tháng hoặc quý)
  const periodEncounters = useMemo(() => {
    const months = reportType === 'monthly'
      ? [selectedMonth]
      : quarterMonths(selectedQuarter);

    return stationFiltered
      .filter(e => {
        const d = new Date(e.startTime);
        return d.getFullYear() === selectedYear && months.includes(d.getMonth() + 1);
      })
      .sort((a, b) => a.startTime - b.startTime);
  }, [stationFiltered, reportType, selectedMonth, selectedQuarter, selectedYear]);

  const totalExams     = periodEncounters.length;
  const totalTransfers = periodEncounters.filter(e => e.status === EncounterStatus.COMPLETED_TRANSFER).length;
  const totalWork      = periodEncounters.filter(e => e.status === EncounterStatus.COMPLETED_WORK).length;
  const totalRest      = periodEncounters.filter(e => e.status === EncounterStatus.REST_30 || e.status === EncounterStatus.MONITOR).length;

  // Disease map
  const diseaseMap = useMemo(() => {
    const map: Record<string, number> = {};
    periodEncounters.forEach(e => {
      const g = e.diseaseGroup || 'Chưa phân loại';
      map[g] = (map[g] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [periodEncounters]);

  // Breakdown theo từng tháng trong quý (chỉ dùng khi reportType === 'quarterly')
  const quarterlyMonthData = useMemo(() => {
    if (reportType !== 'quarterly') return [];
    return quarterMonths(selectedQuarter).map((m: number) => {
      const mEncs = stationFiltered.filter((e: Encounter) => {
        const d = new Date(e.startTime);
        return d.getFullYear() === selectedYear && d.getMonth() + 1 === m;
      });
      const map: Record<string, number> = {};
      mEncs.forEach((e: Encounter) => {
        const g = e.diseaseGroup || 'Chưa phân loại';
        map[g] = (map[g] || 0) + 1;
      });
      return {
        month: m,
        label: `Tháng ${m}`,
        total: mEncs.length,
        groups: Object.entries(map).sort((a, b) => b[1] - a[1]) as [string, number][],
      };
    });
  }, [stationFiltered, reportType, selectedQuarter, selectedYear]);

  // Danh sách tất cả nhóm bệnh xuất hiện trong quý (sắp theo tổng giảm dần)
  const allGroupsInQuarter = useMemo(() => {
    const set = new Set<string>();
    quarterlyMonthData.forEach((md: MonthData) => md.groups.forEach(([g]) => set.add(g)));
    return Array.from(set).sort((a: string, b: string) => {
      const totalA = quarterlyMonthData.reduce((s: number, md: MonthData) => s + (md.groups.find(([g]) => g === a)?.[1] ?? 0), 0);
      const totalB = quarterlyMonthData.reduce((s: number, md: MonthData) => s + (md.groups.find(([g]) => g === b)?.[1] ?? 0), 0);
      return totalB - totalA;
    });
  }, [quarterlyMonthData]);

  // Data cho grouped bar chart quarterly
  const quarterlyChartData = useMemo(() => {
    return allGroupsInQuarter.map((group: string) => {
      const row: Record<string, any> = { name: group.split('/')[0].trim() };
      quarterlyMonthData.forEach((md: MonthData) => {
        row[md.label] = md.groups.find(([g]) => g === group)?.[1] ?? 0;
      });
      return row;
    });
  }, [allGroupsInQuarter, quarterlyMonthData]);

  const top3Groups = diseaseMap.slice(0, 3).map(([name]) => name);

  // Trend chart: theo tuần (tháng) hoặc theo tháng (quý)
  const trendData = useMemo(() => {
    if (reportType === 'monthly') {
      // Chia theo tuần
      const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
      const weeks = [
        { label: 'Tuần 1', start: 1,  end: 7 },
        { label: 'Tuần 2', start: 8,  end: 14 },
        { label: 'Tuần 3', start: 15, end: 21 },
        { label: 'Tuần 4', start: 22, end: daysInMonth },
      ];
      return weeks.map(({ label, start, end }) => {
        const wEncs = periodEncounters.filter(e => {
          const day = new Date(e.startTime).getDate();
          return day >= start && day <= end;
        });
        const row: Record<string, any> = { label };
        top3Groups.forEach(name => {
          row[name] = wEncs.filter(e => (e.diseaseGroup || 'Chưa phân loại') === name).length;
        });
        if (diseaseMap.length > 3)
          row['Khác'] = wEncs.filter(e => !top3Groups.includes(e.diseaseGroup || 'Chưa phân loại')).length;
        return row;
      });
    } else {
      // Chia theo tháng trong quý
      return quarterMonths(selectedQuarter).map(m => {
        const mEncs = periodEncounters.filter(e => new Date(e.startTime).getMonth() + 1 === m);
        const row: Record<string, any> = { label: `Tháng ${m}` };
        top3Groups.forEach(name => {
          row[name] = mEncs.filter(e => (e.diseaseGroup || 'Chưa phân loại') === name).length;
        });
        if (diseaseMap.length > 3)
          row['Khác'] = mEncs.filter(e => !top3Groups.includes(e.diseaseGroup || 'Chưa phân loại')).length;
        return row;
      });
    }
  }, [periodEncounters, reportType, selectedMonth, selectedQuarter, selectedYear, top3Groups, diseaseMap]);

  const chartBars = [
    ...top3Groups.map((name, i) => ({ key: name, color: CHART_COLORS[i] })),
    ...(diseaseMap.length > 3 ? [{ key: 'Khác', color: CHART_COLORS[3] }] : []),
  ];

  // Pie data
  const pieData = useMemo(() => {
    const top5 = diseaseMap.slice(0, 5);
    const other = diseaseMap.slice(5).reduce((s, [, v]) => s + v, 0);
    const data = top5.map(([name, value]) => ({ name, value }));
    if (other > 0) data.push({ name: 'Khác', value: other });
    return data.length > 0 ? data : [{ name: 'Chưa có dữ liệu', value: 1 }];
  }, [diseaseMap]);

  // Pareto data
  const paretoData = useMemo(() => {
    return diseaseMap.map(([name, count]: [string, number]) => ({
      name: name.split('/')[0].trim(),
      count,
      pct: totalExams > 0 ? parseFloat((count / totalExams * 100).toFixed(1)) : 0,
    }));
  }, [diseaseMap, totalExams]);

  // Top medicines
  const topMeds = useMemo(() => {
    const map: Record<string, number> = {};
    periodEncounters.forEach(e => {
      e.prescriptions?.forEach(p => {
        map[p.medicineName] = (map[p.medicineName] || 0) + p.quantity;
      });
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [periodEncounters]);

  const transferList = periodEncounters.filter(e => e.status === EncounterStatus.COMPLETED_TRANSFER);
  const detailList   = periodEncounters.slice(0, detailTopN);

  // ── Labels ──
  const periodLabel = reportType === 'monthly'
    ? `Tháng ${pad2(selectedMonth)}/${selectedYear}`
    : `Quý ${selectedQuarter}/${selectedYear} (T${(selectedQuarter-1)*3+1}–T${selectedQuarter*3})`;

  const reportTitle    = reportType === 'monthly'
    ? `BÁO CÁO Y TẾ THÁNG ${pad2(selectedMonth)} NĂM ${selectedYear}`
    : `BÁO CÁO Y TẾ QUÝ ${selectedQuarter} NĂM ${selectedYear}`;

  const reportSubtitle = reportType === 'monthly'
    ? `Báo cáo tổng hợp số liệu Phòng Y Tế — Tháng ${pad2(selectedMonth)}/${selectedYear}`
    : `Báo cáo tổng hợp số liệu Phòng Y Tế — Quý ${selectedQuarter}/${selectedYear}`;

  const printDate    = (() => { const d = new Date(); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; })();
  const stationLabel = stationConfig.type === StationType.HUB && filterStation === 'ALL'
    ? 'Tất cả các trạm' : `Trạm ${filterStation === 'ALL' ? stationConfig.name : filterStation}`;

  // ── Xuất Excel bảng theo dõi ─────────────────────────────────────────────────
  const handleExportTheoDoiExcel = () => {
    if (periodEncounters.length === 0) {
      alert(`Không có dữ liệu trong ${periodLabel}!`);
      return;
    }
    const visitCount: Record<string, number> = {};
    periodEncounters.forEach(e => {
      visitCount[e.patientId] = (visitCount[e.patientId] || 0) + 1;
    });

    const headers = [
      'STT', 'Ngày tháng', 'Mã NV', 'Họ tên', 'Bộ phận',
      'Triệu chứng ban đầu', 'Nhóm bệnh', 'Khu', 'Ghi chú', 'Số lần vào y tế'
    ];

    const dataRows = periodEncounters.map((e: Encounter, idx: number) => {
      const d = new Date(e.startTime);
      return [
        idx + 1,
        `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`,
        e.patientId,
        e.patientName,
        e.department,
        (e.symptoms || []).join(', '),
        e.diseaseGroup || '',
        e.stationName,
        e.notes || '',
        visitCount[e.patientId] || 1,
      ];
    });

    const titleText = reportType === 'monthly'
      ? `BẢNG THEO DÕI CBNV CÔNG TY GOERTEK VINA SỬ DỤNG PHÒNG Y TẾ THÁNG ${pad2(selectedMonth)}/${selectedYear}`
      : `BẢNG THEO DÕI CBNV CÔNG TY GOERTEK VINA SỬ DỤNG PHÒNG Y TẾ QUÝ ${selectedQuarter}/${selectedYear}`;

    const aoa: any[][] = [[titleText], [], headers, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];
    ws['!cols'] = [
      { wch: 5 }, { wch: 13 }, { wch: 13 }, { wch: 26 }, { wch: 22 },
      { wch: 32 }, { wch: 24 }, { wch: 8 }, { wch: 22 }, { wch: 16 },
    ];

    const fileName = reportType === 'monthly'
      ? `Bang_theo_doi_thang_${pad2(selectedMonth)}_${selectedYear}.xlsx`
      : `Bang_theo_doi_quy${selectedQuarter}_${selectedYear}.xlsx`;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bảng theo dõi');
    XLSX.writeFile(wb, fileName);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @media print {
          #mr-sidebar, #mr-topbar { display: none !important; }
          #mr-preview {
            position: fixed; inset: 0; overflow: visible;
            padding: 0; margin: 0; background: white;
          }
          #mr-preview-inner { box-shadow: none !important; }
          @page { size: A4 landscape; margin: 1cm; }
        }
      `}</style>

      <div className="fixed inset-0 z-[60] flex flex-col bg-slate-100">

        {/* ── Top bar ── */}
        <div id="mr-topbar" className="flex items-center justify-between px-5 py-2.5 bg-slate-900 text-white shrink-0 gap-3">
          <div className="flex items-center gap-3">
            <button onClick={onBack}
              className="flex items-center gap-1.5 text-sm bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg transition">
              <ChevronLeft size={15}/> Quay lại
            </button>
            <div className="flex flex-col leading-tight">
              <span className="font-bold text-base tracking-wide">{periodLabel}</span>
              <span className="text-slate-400 text-xs">{stationLabel}</span>
            </div>
            <span className="text-slate-400 text-sm">|</span>
            <span className="text-slate-300 text-sm">
              <span className="font-bold text-white">{totalExams}</span> lượt khám
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleExportTheoDoiExcel}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg font-bold text-sm transition shadow-lg">
              <Download size={16}/> Xuất Excel bảng theo dõi
            </button>
            <button onClick={() => window.print()}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-5 py-2 rounded-lg font-bold text-sm transition shadow-lg">
              <Printer size={16}/> In / Xuất PDF
            </button>
          </div>
        </div>

        {/* ── Body: Sidebar + Preview ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── LEFT SIDEBAR ── */}
          <div id="mr-sidebar"
            className="w-72 shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden shadow-md">
            <div className="px-4 py-3 bg-slate-800 text-white flex items-center gap-2">
              <Settings2 size={16}/>
              <span className="font-bold text-sm uppercase tracking-wide">Cấu hình báo cáo</span>
            </div>

            <div className="flex-1 overflow-y-auto">

              {/* Các khối nội dung */}
              <SideSection label="Khối nội dung" defaultOpen>
                <div className="space-y-1">
                  {sections.map(sec => (
                    <div key={sec.id}
                      className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-50 group cursor-pointer"
                      onClick={() => toggle(sec.id)}>
                      <span className={`text-sm transition-colors ${sec.enabled ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>
                        {sec.label}
                      </span>
                      {sec.enabled
                        ? <ToggleRight size={22} className="text-blue-600 shrink-0"/>
                        : <ToggleLeft  size={22} className="text-slate-300 shrink-0"/>
                      }
                    </div>
                  ))}
                </div>
              </SideSection>

              {/* Config: KPI */}
              {has('kpi') && (
                <SideSection label="Cấu hình KPI">
                  <div className="space-y-3">
                    <NumInput label="Tai nạn lao động" value={accidents} min={0} onChange={setAccidents}/>
                    <NumInput label="Ngân sách thuốc (%)" value={budgetPct} min={0} max={100} onChange={setBudgetPct}/>
                  </div>
                </SideSection>
              )}

              {/* Config: Checkup */}
              {has('checkup') && (
                <SideSection label="Cấu hình KSKĐ (%)">
                  <div className="space-y-3">
                    <NumInput label="KSKĐ định kỳ (%)" value={chkPeriodic} min={0} max={100} onChange={setChkPeriodic}/>
                    <NumInput label="Khám đầu vào (%)"  value={chkEntry}   min={0} max={100} onChange={setChkEntry}/>
                    <NumInput label="Khám cấp phép LĐ (%)" value={chkWork} min={0} max={100} onChange={setChkWork}/>
                  </div>
                </SideSection>
              )}

              {/* Config: Detail list */}
              {has('detail_list') && (
                <SideSection label="Danh sách chi tiết">
                  <NumInput label="Hiển thị tối đa (ca)" value={detailTopN} min={5} max={500} onChange={setDetailTopN}/>
                  <p className="text-xs text-slate-400 mt-1">Tổng trong kỳ: {totalExams} ca</p>
                </SideSection>
              )}

              {/* Config: Nhận xét */}
              {has('nhanxet') && (
                <SideSection label="Nội dung nhận xét">
                  <textarea
                    value={nhanxet}
                    onChange={e => setNhanxet(e.target.value)}
                    placeholder="Nhập nhận xét tổng hợp..."
                    rows={4}
                    className="w-full text-xs border rounded px-2 py-2 focus:outline-none focus:ring-1 ring-blue-400 resize-y"/>
                </SideSection>
              )}

              {/* Config: Kiến nghị */}
              {has('kiennghi') && (
                <SideSection label="Nội dung kiến nghị">
                  <textarea
                    value={kiennghi}
                    onChange={e => setKiennghi(e.target.value)}
                    placeholder="Nhập kiến nghị, đề xuất..."
                    rows={4}
                    className="w-full text-xs border rounded px-2 py-2 focus:outline-none focus:ring-1 ring-blue-400 resize-y"/>
                </SideSection>
              )}

              {/* Config: Signature */}
              {has('signature') && (
                <SideSection label="Chữ ký">
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-slate-500 font-semibold uppercase">Người lập báo cáo</label>
                      <input value={preparedBy} onChange={e => setPreparedBy(e.target.value)}
                        placeholder="Họ và tên"
                        className="mt-1 w-full text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-1 ring-blue-400"/>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 font-semibold uppercase">Trưởng phòng phê duyệt</label>
                      <input value={approvedBy} onChange={e => setApprovedBy(e.target.value)}
                        placeholder="Họ và tên"
                        className="mt-1 w-full text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-1 ring-blue-400"/>
                    </div>
                  </div>
                </SideSection>
              )}

            </div>
          </div>

          {/* ── RIGHT: Preview ── */}
          <div id="mr-preview" className="flex-1 overflow-auto bg-slate-200 p-6 print:p-0 print:bg-white print:overflow-visible">
            <div id="mr-preview-inner"
              className="max-w-[1050px] mx-auto space-y-5 bg-white rounded-xl shadow-lg p-8 print:shadow-none print:rounded-none print:p-0 print:max-w-none">

              {/* ─── Header ─── */}
              <div className="border-l-4 border-blue-700 pl-5 pb-4 border-b border-slate-100 flex justify-between items-start">
                <div>
                  <p className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold mb-1">
                    CÔNG TY GOERTEK VINA — PHÒNG Y TẾ — {stationLabel.toUpperCase()}
                  </p>
                  <h1 className="text-[22px] font-extrabold text-slate-800 leading-tight">{reportTitle}</h1>
                  <p className="text-sm text-slate-500 mt-1">{reportSubtitle}</p>
                </div>
                <div className="text-right text-xs text-slate-400 shrink-0 ml-4 mt-1">
                  <p>Ngày in: <strong>{printDate}</strong></p>
                </div>
              </div>

              {/* ─── KPI ─── */}
              {has('kpi') && (
                <div className="grid grid-cols-4 gap-4">
                  <PreviewKpi icon="🩺" color="blue" label="Tổng lượt khám"
                    value={totalExams} sub={`Hoàn thành: ${totalWork} | Nghỉ: ${totalRest}`}/>
                  <PreviewKpi icon="🛡️" color={accidents === 0 ? 'green' : 'red'} label="Tai nạn lao động"
                    value={accidents} sub="Mục tiêu 0 ca/kỳ"/>
                  <PreviewKpi icon="🚑" color="orange" label="Ca chuyển tuyến"
                    value={totalTransfers} sub={totalTransfers === 0 ? 'Không có ca' : `${totalTransfers} ca`}/>
                  <PreviewKpi icon="💊" color="purple" label="Ngân sách Thuốc/Vật tư"
                    value={`${budgetPct}%`} sub="Ngân sách kỳ báo cáo"/>
                </div>
              )}

              {/* ─── Charts row ─── */}
              {(has('chart_trend') || has('chart_pie') || has('checkup')) && (
                <div className={`grid gap-4 ${
                  [has('chart_trend'), has('chart_pie'), has('checkup')].filter(Boolean).length === 1
                    ? 'grid-cols-1' : 'grid-cols-3'
                }`}>
                  {has('chart_trend') && (
                    <div className={`bg-white border border-slate-100 rounded-xl p-4 ${
                      !has('chart_pie') && !has('checkup') ? '' : 'col-span-2'
                    }`}>
                      <h3 className="text-sm font-bold text-slate-700 mb-3">
                        {reportType === 'monthly' ? 'Xu hướng các nhóm bệnh theo tuần' : 'So sánh nhóm bệnh theo tháng trong quý'}
                      </h3>
                      {totalExams === 0 ? (
                        <div className="h-52 flex items-center justify-center text-slate-400 text-sm italic">
                          Không có dữ liệu trong {periodLabel}
                        </div>
                      ) : (
                        <div style={{ height: 210 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={trendData} margin={{ top: 4, right: 8, bottom: 4, left: -10 }}>
                              <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0"/>
                              <XAxis dataKey="label" tick={{ fontSize: 11 }}/>
                              <YAxis allowDecimals={false} tick={{ fontSize: 11 }}/>
                              <Tooltip/>
                              <Legend wrapperStyle={{ fontSize: 11 }}/>
                              {chartBars.map(b => (
                                <Bar key={b.key} dataKey={b.key} fill={b.color} radius={[3,3,0,0]} maxBarSize={28}/>
                              ))}
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  )}

                  {has('chart_pie') && (
                    <PieSection pieData={pieData} totalExams={totalExams} periodLabel={periodLabel}/>
                  )}

                  {has('checkup') && (
                    <div className="bg-white border border-slate-100 rounded-xl p-4 flex flex-col">
                      <h3 className="text-sm font-bold text-slate-700 mb-4">Tiến độ Khám sức khỏe</h3>
                      <div className="flex flex-col gap-5 flex-1 justify-center">
                        <PrvProgressBar label="KSKĐ định kỳ"      value={chkPeriodic} color="#1e40af"/>
                        <PrvProgressBar label="Khám đầu vào"      value={chkEntry}    color="#3b82f6"/>
                        <PrvProgressBar label="Khám cấp phép LĐ"  value={chkWork}     color="#60a5fa"/>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ─── Biểu đồ mặt bệnh ─── */}
              {has('chart_bar_disease') && (
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2.5 border-b">
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                      BÁO CÁO MẶT BỆNH PHÒNG Y TẾ — {periodLabel.toUpperCase()}
                    </h3>
                  </div>
                  {paretoData.length === 0 || totalExams === 0 ? (
                    <p className="text-slate-400 italic text-sm p-4">Không có dữ liệu</p>
                  ) : (
                    <div className="p-4" style={{ height: 340 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={paretoData} margin={{ top: 24, right: 20, bottom: 70, left: 10 }}>
                          <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={false}/>
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 10, fill: '#475569' }}
                            angle={-35}
                            textAnchor="end"
                            interval={0}
                          />
                          <YAxis
                            tickFormatter={(v: any) => `${v}%`}
                            tick={{ fontSize: 10, fill: '#475569' }}
                            domain={[0, 'auto']}
                          />
                          <Tooltip
                            formatter={(value: any, _name: any, entry: any) =>
                              [`${value}%  (${entry?.payload?.count ?? ''} ca)`, 'Tỉ lệ lượt khám']
                            }
                          />
                          <Bar dataKey="pct" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={48}>
                            <LabelList
                              dataKey="pct"
                              position="top"
                              formatter={(v: any) => `${v}%`}
                              style={{ fontSize: 9, fill: '#1e40af', fontWeight: 700 }}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}

              {/* ─── Disease table ─── */}
              {has('disease_table') && (
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2.5 border-b">
                    <h3 className="text-sm font-bold text-slate-700">Thống kê nhóm bệnh</h3>
                  </div>
                  {diseaseMap.length === 0 ? (
                    <p className="text-slate-400 italic text-sm p-4">Không có dữ liệu</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100">
                        <tr>
                          {['STT','Nhóm bệnh','Số ca','Tỉ lệ',''].map(h => (
                            <th key={h} className={`py-2 px-3 text-xs font-semibold text-slate-600 ${h === 'STT' ? 'w-10' : h === '' ? 'w-1/3' : ''} ${h === 'Số ca' || h === 'Tỉ lệ' ? 'text-center' : 'text-left'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {diseaseMap.map(([name, count], idx) => {
                          const pct = totalExams > 0 ? Math.round(count / totalExams * 100) : 0;
                          return (
                            <tr key={name} className={idx % 2 === 0 ? '' : 'bg-slate-50'}>
                              <td className="py-1.5 px-3 text-slate-400 text-xs">{idx+1}</td>
                              <td className="py-1.5 px-3 font-medium text-slate-800">{name}</td>
                              <td className="py-1.5 px-3 text-center font-bold text-blue-700">{count}</td>
                              <td className="py-1.5 px-3 text-center text-slate-500">{pct}%</td>
                              <td className="py-1.5 px-3">
                                <div className="w-full bg-slate-200 rounded-full h-2">
                                  <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[Math.min(idx,4)] }}/>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 font-bold">
                          <td colSpan={2} className="py-2 px-3 text-slate-700">Tổng cộng</td>
                          <td className="py-2 px-3 text-center text-blue-800 text-base">{totalExams}</td>
                          <td className="py-2 px-3 text-center">100%</td>
                          <td/>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              )}

              {/* ─── Quarterly: So sánh nhóm bệnh theo tháng ─── */}
              {has('quarterly_breakdown') && reportType === 'quarterly' && (
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2.5 border-b">
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                      SO SÁNH MẶT BỆNH THEO THÁNG — QUÝ {selectedQuarter}/{selectedYear}
                    </h3>
                  </div>

                  {quarterlyMonthData.every((md: MonthData) => md.total === 0) ? (
                    <p className="text-slate-400 italic text-sm p-4">Không có dữ liệu trong quý này</p>
                  ) : (
                    <>
                      {/* Biểu đồ grouped bar */}
                      <div className="p-4" style={{ height: 320 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={quarterlyChartData} margin={{ top: 20, right: 20, bottom: 60, left: 10 }}>
                            <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={false}/>
                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#475569' }} angle={-35} textAnchor="end" interval={0}/>
                            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#475569' }}/>
                            <Tooltip/>
                            <Legend wrapperStyle={{ fontSize: 11 }}/>
                            {quarterlyMonthData.map((md: MonthData, i: number) => (
                              <Bar key={md.label} dataKey={md.label} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[3,3,0,0]} maxBarSize={32}/>
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Bảng chi tiết: nhóm bệnh × tháng */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border-t border-slate-100">
                          <thead className="bg-slate-100">
                            <tr>
                              <th className="py-2 px-3 text-left text-xs font-semibold text-slate-600">Nhóm bệnh</th>
                              {quarterlyMonthData.map((md: MonthData) => (
                                <th key={md.label} className="py-2 px-3 text-center text-xs font-semibold text-slate-600">
                                  {md.label}<br/><span className="font-normal text-slate-400">({md.total} ca)</span>
                                </th>
                              ))}
                              <th className="py-2 px-3 text-center text-xs font-semibold text-blue-700">Tổng quý</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allGroupsInQuarter.map((group: string, idx: number) => {
                              const monthCounts = quarterlyMonthData.map((md: MonthData) =>
                                md.groups.find(([g]) => g === group)?.[1] ?? 0
                              );
                              const total = monthCounts.reduce((s: number, v: number) => s + v, 0);
                              const pct = totalExams > 0 ? Math.round(total / totalExams * 100) : 0;
                              return (
                                <tr key={group} className={idx % 2 === 0 ? '' : 'bg-slate-50'}>
                                  <td className="py-1.5 px-3 font-medium text-slate-800 text-xs">{group}</td>
                                  {monthCounts.map((cnt: number, mi: number) => {
                                    const mTotal = quarterlyMonthData[mi].total;
                                    const mPct = mTotal > 0 ? Math.round(cnt / mTotal * 100) : 0;
                                    return (
                                      <td key={mi} className="py-1.5 px-3 text-center text-xs">
                                        {cnt > 0 ? (
                                          <span className="font-bold text-slate-700">{cnt}</span>
                                        ) : (
                                          <span className="text-slate-300">—</span>
                                        )}
                                        {cnt > 0 && <span className="text-slate-400 ml-1">({mPct}%)</span>}
                                      </td>
                                    );
                                  })}
                                  <td className="py-1.5 px-3 text-center text-xs">
                                    <span className="font-bold text-blue-700">{total}</span>
                                    <span className="text-slate-400 ml-1">({pct}%)</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-slate-200 font-bold bg-slate-50">
                              <td className="py-2 px-3 text-slate-700 text-xs">Tổng cộng</td>
                              {quarterlyMonthData.map((md: MonthData) => (
                                <td key={md.label} className="py-2 px-3 text-center text-xs text-blue-800">{md.total} ca</td>
                              ))}
                              <td className="py-2 px-3 text-center text-xs text-blue-800">{totalExams} ca</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ─── Top medicines ─── */}
              {has('top_meds') && (
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2.5 border-b">
                    <h3 className="text-sm font-bold text-slate-700">Thuốc sử dụng nhiều nhất</h3>
                  </div>
                  {topMeds.length === 0 ? (
                    <p className="text-slate-400 italic text-sm p-4">Không có dữ liệu</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="py-2 px-3 text-left text-xs font-semibold text-slate-600 w-10">STT</th>
                          <th className="py-2 px-3 text-left text-xs font-semibold text-slate-600">Tên thuốc</th>
                          <th className="py-2 px-3 text-center text-xs font-semibold text-slate-600">Tổng SL</th>
                          <th className="py-2 px-3 w-1/3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {topMeds.map(([name, qty], idx) => {
                          const maxQty = topMeds[0]?.[1] ?? 1;
                          const pct = Math.round(qty / maxQty * 100);
                          return (
                            <tr key={name} className={idx % 2 === 0 ? '' : 'bg-slate-50'}>
                              <td className="py-1.5 px-3 text-slate-400 text-xs">{idx+1}</td>
                              <td className="py-1.5 px-3 font-medium text-slate-800">{name}</td>
                              <td className="py-1.5 px-3 text-center font-bold text-green-700">{qty}</td>
                              <td className="py-1.5 px-3">
                                <div className="w-full bg-slate-200 rounded-full h-2">
                                  <div className="h-2 rounded-full bg-green-500" style={{ width: `${pct}%` }}/>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* ─── Transfer list ─── */}
              {has('transfers') && transferList.length > 0 && (
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2.5 border-b">
                    <h3 className="text-sm font-bold text-slate-700">Danh sách ca chuyển tuyến ({transferList.length} ca)</h3>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        {['STT','Mã NV','Họ và tên','Bộ phận','Chẩn đoán','Ngày chuyển','Trạm'].map(h => (
                          <th key={h} className="py-2 px-3 text-left text-xs font-semibold text-slate-600">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {transferList.map((e, idx) => (
                        <tr key={e.id} className={idx % 2 === 0 ? '' : 'bg-slate-50'}>
                          <td className="py-1.5 px-3 text-slate-400 text-xs">{idx+1}</td>
                          <td className="py-1.5 px-3 font-mono text-xs">{e.patientId}</td>
                          <td className="py-1.5 px-3 font-medium">{e.patientName}</td>
                          <td className="py-1.5 px-3 text-slate-600">{e.department}</td>
                          <td className="py-1.5 px-3 text-slate-700">{e.diagnosis || '—'}</td>
                          <td className="py-1.5 px-3 text-slate-600">{(() => { const d = new Date(e.endTime || e.startTime); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; })()}</td>
                          <td className="py-1.5 px-3 text-slate-600">{e.stationName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {has('transfers') && transferList.length === 0 && (
                <div className="border border-slate-100 rounded-xl p-4 text-center text-slate-400 text-sm italic">
                  Không có ca chuyển tuyến trong {periodLabel}
                </div>
              )}

              {/* ─── Detail list ─── */}
              {has('detail_list') && (
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2.5 border-b">
                    <h3 className="text-sm font-bold text-slate-700">
                      Danh sách ca khám (hiển thị {Math.min(detailTopN, totalExams)}/{totalExams} ca)
                    </h3>
                  </div>
                  {detailList.length === 0 ? (
                    <p className="text-slate-400 italic text-sm p-4">Không có dữ liệu</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100">
                        <tr>
                          {['STT','Ngày','Mã NV','Họ và tên','Chẩn đoán','Nhóm bệnh','Trạng thái','Trạm'].map(h => (
                            <th key={h} className="py-2 px-2 text-left font-semibold text-slate-600">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {detailList.map((e, idx) => (
                          <tr key={e.id} className={idx % 2 === 0 ? '' : 'bg-slate-50'}>
                            <td className="py-1 px-2 text-slate-400">{idx+1}</td>
                            <td className="py-1 px-2">{(() => { const d = new Date(e.startTime); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; })()}</td>
                            <td className="py-1 px-2 font-mono">{e.patientId}</td>
                            <td className="py-1 px-2 font-medium">{e.patientName}</td>
                            <td className="py-1 px-2 text-slate-600">{e.diagnosis || '—'}</td>
                            <td className="py-1 px-2 text-slate-600">{e.diseaseGroup || '—'}</td>
                            <td className="py-1 px-2">{statusShort(e.status)}</td>
                            <td className="py-1 px-2 text-slate-500">{e.stationName}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* ─── Nhận xét ─── */}
              {has('nhanxet') && (
                <div className="border border-slate-100 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-slate-700 mb-2">Nhận xét tổng hợp</h3>
                  {nhanxet
                    ? <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{nhanxet}</p>
                    : <p className="text-slate-400 italic text-sm">Chưa có nội dung nhận xét (nhập ở cột trái)</p>
                  }
                </div>
              )}

              {/* ─── Kiến nghị ─── */}
              {has('kiennghi') && (
                <div className="border border-slate-100 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-slate-700 mb-2">Kiến nghị</h3>
                  {kiennghi
                    ? <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{kiennghi}</p>
                    : <p className="text-slate-400 italic text-sm">Chưa có nội dung kiến nghị (nhập ở cột trái)</p>
                  }
                </div>
              )}

              {/* ─── Signature ─── */}
              {has('signature') && (
                <div className="border-t border-slate-200 pt-6 mt-2">
                  <div className="grid grid-cols-3 gap-6 text-center text-sm">
                    <div>
                      <p className="font-semibold text-slate-600">Người lập báo cáo</p>
                      <p className="text-xs text-slate-400 mt-0.5 italic">(Ký và ghi rõ họ tên)</p>
                      <div className="h-14 border-b border-slate-300 mt-4 mb-2"/>
                      {preparedBy && <p className="font-bold text-slate-800">{preparedBy}</p>}
                    </div>
                    <div className="flex flex-col items-center justify-center text-xs text-slate-400 gap-1">
                      <img src="./inapp.png" alt="GoertekVina Smart Medical" className="h-7 object-contain opacity-70" />
                      <p className="italic">Báo cáo tạo tự động từ hệ thống</p>
                      <p className="mt-0.5">{printDate}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-600">Trưởng phòng Y tế phê duyệt</p>
                      <p className="text-xs text-slate-400 mt-0.5 italic">(Ký và ghi rõ họ tên)</p>
                      <div className="h-14 border-b border-slate-300 mt-4 mb-2"/>
                      {approvedBy && <p className="font-bold text-slate-800">{approvedBy}</p>}
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>

        </div>
      </div>
    </>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function statusShort(status: string) {
  switch (status) {
    case EncounterStatus.COMPLETED_WORK:     return 'Về làm việc';
    case EncounterStatus.COMPLETED_TRANSFER: return 'Chuyển viện';
    case EncounterStatus.REST_30:            return 'Nghỉ 30p';
    case EncounterStatus.MONITOR:            return 'Theo dõi';
    case EncounterStatus.IN_PROGRESS:        return 'Đang khám';
    case EncounterStatus.WAITING:            return 'Chờ';
    default: return status;
  }
}

function SideSection({ label, children, defaultOpen = false }: {
  label: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-100">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-slate-600 uppercase tracking-wide hover:bg-slate-50 transition">
        <span>{label}</span>
        <span className={`text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}

function NumInput({ label, value, min, max, onChange }: {
  label: string; value: number; min?: number; max?: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-xs text-slate-500 font-semibold uppercase block mb-1">{label}</label>
      <input
        type="number" value={value} min={min} max={max}
        onChange={e => {
          const n = parseInt(e.target.value);
          if (!isNaN(n)) onChange(max !== undefined ? Math.min(max, Math.max(min ?? 0, n)) : Math.max(min ?? 0, n));
        }}
        className="w-full text-sm border rounded px-2 py-1.5 focus:outline-none focus:ring-1 ring-blue-400 font-bold"/>
    </div>
  );
}

const COLOR_MAP: Record<string, { bg: string; text: string }> = {
  blue:   { bg: 'bg-blue-50',   text: 'text-blue-700' },
  green:  { bg: 'bg-green-50',  text: 'text-green-700' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700' },
  red:    { bg: 'bg-red-50',    text: 'text-red-700' },
};
function PreviewKpi({ icon, color, label, value, sub }: {
  icon: string; color: string; label: string; value: number | string; sub: string;
}) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.blue;
  return (
    <div className="border border-slate-100 rounded-xl p-4 flex items-center gap-3">
      <div className={`w-11 h-11 rounded-full flex items-center justify-center text-xl shrink-0 ${c.bg}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide truncate">{label}</p>
        <p className={`text-xl font-extrabold ${c.text}`}>{value}</p>
        <p className="text-[10px] text-slate-400 truncate">{sub}</p>
      </div>
    </div>
  );
}

function PrvProgressBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs font-medium text-slate-700">{label}</span>
        <span className="text-xs font-bold" style={{ color }}>{value}%</span>
      </div>
      <div className="w-full bg-slate-200 rounded-full h-2.5">
        <div className="h-2.5 rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }}/>
      </div>
    </div>
  );
}

function PieSection({ pieData, totalExams, periodLabel }: {
  pieData: { name: string; value: number }[];
  totalExams: number;
  periodLabel: string;
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-xl p-4">
      <h3 className="text-sm font-bold text-slate-700 mb-3">Cơ cấu bệnh tật</h3>
      {totalExams === 0 ? (
        <div className="h-52 flex items-center justify-center text-slate-400 text-sm italic">
          Không có dữ liệu trong {periodLabel}
        </div>
      ) : (
        <div style={{ height: 210 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={80}
                paddingAngle={3} dataKey="value">
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]}/>)}
              </Pie>
              <Tooltip formatter={(v: number) => [`${v} ca`, 'Số ca']}/>
              <Legend wrapperStyle={{ fontSize: 10 }}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
