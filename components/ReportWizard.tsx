/**
 * ReportWizard.tsx — Wizard 2 bước chọn loại + thời gian báo cáo
 * Bước 1: Chọn loại báo cáo (tháng / quý) + thời gian + trạm
 * Bước 2: Chuyển sang MonthlyReport (preview + export)
 */
import React, { useState, useMemo } from 'react';
import { X, FileBarChart2, Calendar, ChevronRight, BarChart3, TrendingUp } from 'lucide-react';
import { Encounter, Medicine, StationConfig, StationType } from '../types';
import { MonthlyReport, ReportType } from './MonthlyReport';
import { storage } from '../services/storage';
import { STATION_PRESETS } from '../constants';

interface ReportWizardProps {
  encounters: Encounter[];
  medicines: Medicine[];
  stationConfig: StationConfig;
  onClose: () => void;
}

type WizardStep = 'select' | 'preview';

const MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];
const QUARTERS: { value: 1|2|3|4; label: string; months: string }[] = [
  { value: 1, label: 'Quý 1', months: 'Tháng 1 – Tháng 3' },
  { value: 2, label: 'Quý 2', months: 'Tháng 4 – Tháng 6' },
  { value: 3, label: 'Quý 3', months: 'Tháng 7 – Tháng 9' },
  { value: 4, label: 'Quý 4', months: 'Tháng 10 – Tháng 12' },
];

export const ReportWizard: React.FC<ReportWizardProps> = ({
  encounters, medicines, stationConfig, onClose
}) => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear  = now.getFullYear();
  const currentQuarter = Math.ceil(currentMonth / 3) as 1|2|3|4;

  const [step, setStep] = useState<WizardStep>('select');
  const [reportType,       setReportType]       = useState<ReportType>('monthly');
  const [selectedMonth,    setSelectedMonth]    = useState<number>(currentMonth);
  const [selectedQuarter,  setSelectedQuarter]  = useState<1|2|3|4>(currentQuarter);
  const [selectedYear,     setSelectedYear]     = useState<number>(currentYear);
  const [filterStation,    setFilterStation]    = useState<string>('ALL');

  // Lấy danh sách trạm: ưu tiên từ storage, fallback STATION_PRESETS
  const knownStations = useMemo(() => {
    const fromStorage = storage.getKnownStations().map((s: any) => s.name).filter(Boolean);
    if (fromStorage.length > 0) return fromStorage as string[];
    return STATION_PRESETS.map(p => p.name);
  }, []);

  // Đếm nhanh số lượt khám theo kỳ đang chọn (để hiện preview nhỏ)
  const previewCount = useMemo(() => {
    const stationOk = (e: Encounter) =>
      stationConfig.type !== StationType.HUB
        ? e.stationName === stationConfig.name
        : filterStation === 'ALL' || e.stationName === filterStation;

    const months = reportType === 'monthly'
      ? [selectedMonth]
      : [(selectedQuarter - 1) * 3 + 1, (selectedQuarter - 1) * 3 + 2, selectedQuarter * 3];

    return encounters.filter(e => {
      const d = new Date(e.startTime);
      return stationOk(e) && d.getFullYear() === selectedYear && months.includes(d.getMonth() + 1);
    }).length;
  }, [encounters, reportType, selectedMonth, selectedQuarter, selectedYear, filterStation, stationConfig]);

  // ── Bước 2: chuyển sang preview ──
  if (step === 'preview') {
    return (
      <MonthlyReport
        encounters={encounters}
        medicines={medicines}
        stationConfig={stationConfig}
        onClose={onClose}
        onBack={() => setStep('select')}
        reportType={reportType}
        selectedMonth={selectedMonth}
        selectedQuarter={selectedQuarter}
        selectedYear={selectedYear}
        filterStation={filterStation}
      />
    );
  }

  // ── Bước 1: Chọn loại & thời gian ──
  const periodLabel = reportType === 'monthly'
    ? `Tháng ${String(selectedMonth).padStart(2,'0')}/${selectedYear}`
    : `Quý ${selectedQuarter}/${selectedYear}`;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-900/80 items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-800 text-white">
          <div className="flex items-center gap-2">
            <FileBarChart2 size={20} className="text-blue-300"/>
            <span className="font-bold text-base">Xuất báo cáo</span>
          </div>
          <button onClick={onClose} className="hover:bg-slate-700 p-1.5 rounded-lg transition">
            <X size={18}/>
          </button>
        </div>

        <div className="p-6 space-y-6">

          {/* ── Chọn loại báo cáo ── */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Loại báo cáo
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setReportType('monthly')}
                className={`flex flex-col items-start p-4 rounded-xl border-2 transition-all text-left ${
                  reportType === 'monthly'
                    ? 'border-blue-500 bg-blue-50 text-blue-800'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                }`}
              >
                <Calendar size={22} className={reportType === 'monthly' ? 'text-blue-600 mb-2' : 'text-slate-400 mb-2'}/>
                <span className="font-bold text-sm">Báo cáo tháng</span>
                <span className="text-xs opacity-70 mt-0.5">Thống kê theo từng tháng</span>
              </button>

              <button
                onClick={() => setReportType('quarterly')}
                className={`flex flex-col items-start p-4 rounded-xl border-2 transition-all text-left ${
                  reportType === 'quarterly'
                    ? 'border-purple-500 bg-purple-50 text-purple-800'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                }`}
              >
                <TrendingUp size={22} className={reportType === 'quarterly' ? 'text-purple-600 mb-2' : 'text-slate-400 mb-2'}/>
                <span className="font-bold text-sm">Báo cáo quý</span>
                <span className="text-xs opacity-70 mt-0.5">Tổng hợp 3 tháng liền kề</span>
              </button>
            </div>
          </div>

          {/* ── Chọn thời gian ── */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Thời gian
            </p>

            {reportType === 'monthly' && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-slate-500 block mb-1">Tháng</label>
                  <select
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(Number(e.target.value))}
                    className="w-full border-2 border-slate-200 rounded-lg px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-blue-400 bg-white"
                  >
                    {MONTHS.map(m => (
                      <option key={m} value={m}>Tháng {m}</option>
                    ))}
                  </select>
                </div>
                <div className="w-28">
                  <label className="text-xs text-slate-500 block mb-1">Năm</label>
                  <input
                    type="number"
                    value={selectedYear}
                    min={2020} max={2099}
                    onChange={e => setSelectedYear(Number(e.target.value))}
                    className="w-full border-2 border-slate-200 rounded-lg px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>
            )}

            {reportType === 'quarterly' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {QUARTERS.map(q => (
                    <button
                      key={q.value}
                      onClick={() => setSelectedQuarter(q.value)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        selectedQuarter === q.value
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className={`font-bold text-sm block ${selectedQuarter === q.value ? 'text-purple-800' : 'text-slate-700'}`}>
                        {q.label}
                      </span>
                      <span className="text-xs text-slate-400">{q.months}</span>
                    </button>
                  ))}
                </div>
                <div className="w-28">
                  <label className="text-xs text-slate-500 block mb-1">Năm</label>
                  <input
                    type="number"
                    value={selectedYear}
                    min={2020} max={2099}
                    onChange={e => setSelectedYear(Number(e.target.value))}
                    className="w-full border-2 border-slate-200 rounded-lg px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-purple-400"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Lọc trạm (chỉ HUB) ── */}
          {stationConfig.type === StationType.HUB && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                Phạm vi trạm
              </p>
              <div className="flex flex-wrap gap-2">
                {/* Nút "Tất cả" */}
                <button
                  onClick={() => setFilterStation('ALL')}
                  className={`px-4 py-2 rounded-lg border-2 text-sm font-bold transition-all ${
                    filterStation === 'ALL'
                      ? 'border-blue-500 bg-blue-500 text-white shadow-sm'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 bg-white'
                  }`}
                >
                  Tất cả
                </button>
                {/* Nút từng trạm */}
                {knownStations.map(s => (
                  <button
                    key={s}
                    onClick={() => setFilterStation(s)}
                    className={`px-4 py-2 rounded-lg border-2 text-sm font-bold transition-all ${
                      filterStation === s
                        ? 'border-blue-500 bg-blue-500 text-white shadow-sm'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 bg-white'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Preview count + nút tiếp theo ── */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <BarChart3 size={16} className="text-slate-400"/>
              <span>
                <strong className="text-slate-800 text-base">{previewCount}</strong> lượt khám trong {periodLabel}
              </span>
            </div>
            <button
              onClick={() => setStep('preview')}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl transition shadow-md"
            >
              Xem báo cáo <ChevronRight size={18}/>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
