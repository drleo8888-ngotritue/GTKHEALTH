import React, { useState, useEffect, useMemo } from 'react';
import { User, StationConfig, StationType } from '../types';
import { Users, ClipboardList, Package, AlertTriangle, Activity, Clock, Calendar, Stethoscope, Pill, BarChart3, UserPlus, X, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell, CartesianGrid } from 'recharts';

interface DashboardProps {
  currentUser: User;
  stationConfig: StationConfig;
  onTabChange: (tab: string) => void;
  refreshTrigger?: number;
}

interface KpiData {
  patientsToday: number;
  prescriptionsToday: number;
  totalStock: number;
  expiryAlerts: number;
}

interface ExpiryMedicine {
  name: string;
  batchNumber: string;
  expiryDate: string;
  stock: number;
  station: string;
  diff: number;
}

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Chào buổi sáng / 早上好';
  if (h < 18) return 'Chào buổi chiều / 下午好';
  return 'Chào buổi tối / 晚上好';
};

const getRoleLabel = (role: string) => {
  if (role === 'ADMIN') return 'Quản trị viên / 管理员';
  if (role === 'MODERATOR') return 'Điều phối viên / 协调员';
  return 'Nhân viên y tế / 医护人员';
};

// Ca làm việc: 20:00 hôm trước → 20:00 hôm nay
// Encounter từ 20:00 trở đi thuộc ca của ngày HÔM SAU
const toShiftDay = (ts: number): string => {
  const d = new Date(ts);
  if (d.getHours() >= 20) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const todayShiftKey = (): string => toShiftDay(Date.now());

const getShiftToday = (): Date => {
  const now = new Date();
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (now.getHours() >= 20) d.setDate(d.getDate() + 1);
  return d;
};

const getShiftRangeString = (d: Date) => {
  const prev = new Date(d);
  prev.setDate(d.getDate() - 1);
  const fmt = (date: Date) => `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
  return `Ca: 20:00 ${fmt(prev)} - 19:59 ${fmt(d)}`;
};

const getDayOfWeek = (d: Date) => {
  const days = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
  return days[d.getDay()];
};

const computeWeekData = (encounters: any[], offset: number) => {
  const shiftToday = getShiftToday();
  const dow = shiftToday.getDay(); // 0=CN
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  const monday = new Date(shiftToday);
  monday.setDate(shiftToday.getDate() - daysFromMon + offset * 7);

  const today = todayShiftKey();
  const shortLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

  const data = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const dayEncs = encounters.filter(e => e.startTime && toShiftDay(e.startTime) === key);
    const count = dayEncs.length;
    const transferCount = dayEncs.filter(e => e.status === 'COMPLETED_TRANSFER').length;
    const restCount = dayEncs.filter(e => e.status === 'REST_30' || e.status === 'MONITOR' || e.hadRestAtRoom).length;
    return {
      label: shortLabels[i],
      count,
      transfers: transferCount > 0 ? transferCount : null,
      rests: restCount > 0 ? restCount : null,
      isToday: key === today,
      isCurrent: false,
      tooltip: `${getDayOfWeek(day)}, ${String(day.getDate()).padStart(2, '0')}/${String(day.getMonth() + 1).padStart(2, '0')}/${day.getFullYear()}`,
      tooltipSub: getShiftRangeString(day),
    };
  });

  const end = new Date(monday);
  end.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return { data, periodLabel: `${fmt(monday)} – ${fmt(end)}/${end.getFullYear()}` };
};

const computeMonthData = (encounters: any[], offset: number) => {
  const shiftToday = getShiftToday();
  const base = new Date(shiftToday.getFullYear(), shiftToday.getMonth() + offset, 1);
  const year = base.getFullYear();
  const month = base.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayShiftKey();

  const data = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    const day = new Date(year, month, d);
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayEncs = encounters.filter(e => e.startTime && toShiftDay(e.startTime) === key);
    const count = dayEncs.length;
    const transferCount = dayEncs.filter(e => e.status === 'COMPLETED_TRANSFER').length;
    const restCount = dayEncs.filter(e => e.status === 'REST_30' || e.status === 'MONITOR' || e.hadRestAtRoom).length;
    const isMonday = day.getDay() === 1;
    return {
      label: isMonday ? String(d) : '',
      day: d,
      count,
      transfers: transferCount > 0 ? transferCount : null,
      rests: restCount > 0 ? restCount : null,
      isToday: key === today,
      isCurrent: false,
      tooltip: `${getDayOfWeek(day)}, ${String(d).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`,
      tooltipSub: getShiftRangeString(day),
    };
  });

  return { data, periodLabel: `Tháng ${month + 1}/${year}` };
};

const computeYearData = (encounters: any[], offset: number) => {
  const shiftToday = getShiftToday();
  const year = shiftToday.getFullYear() + offset;
  const curMonth = shiftToday.getMonth();

  const data = Array.from({ length: 12 }, (_, i) => {
    const monthPrefix = `${year}-${String(i + 1).padStart(2, '0')}`;
    const monthEncs = encounters.filter(e => {
      if (!e.startTime) return false;
      const key = toShiftDay(e.startTime);
      return key.startsWith(monthPrefix);
    });
    const count = monthEncs.length;
    const transferCount = monthEncs.filter(e => e.status === 'COMPLETED_TRANSFER').length;
    const restCount = monthEncs.filter(e => e.status === 'REST_30' || e.status === 'MONITOR' || e.hadRestAtRoom).length;
    return {
      label: `T${i + 1}`,
      count,
      transfers: transferCount > 0 ? transferCount : null,
      rests: restCount > 0 ? restCount : null,
      isToday: false,
      isCurrent: offset === 0 && i === curMonth,
      tooltip: `Tháng ${i + 1}/${year}`,
      tooltipSub: `Tổng hợp ca trong tháng ${i + 1}`,
    };
  });

  return { data, periodLabel: `Năm ${year}` };
};

const TrendTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const transfers = d.transfers ?? 0;
  const rests = d.rests ?? 0;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm min-w-[155px]">
      <div className="text-gray-700 text-xs font-bold">{d.tooltip}</div>
      {d.tooltipSub && <div className="text-gray-500 text-[10px] mb-1.5">{d.tooltipSub}</div>}
      {!d.tooltipSub && <div className="mb-1.5"></div>}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-green-500"></div>
          <span className="text-gray-500 text-xs">Vào khám / 就诊</span>
        </div>
        <span className="font-bold text-green-700">{d.count}</span>
      </div>
      <div className="flex items-center justify-between gap-3 mt-0.5">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
          <span className="text-gray-500 text-xs">Chuyển viện / 转院</span>
        </div>
        <span className={`font-bold ${transfers > 0 ? 'text-red-600' : 'text-gray-300'}`}>{transfers}</span>
      </div>
      <div className="flex items-center justify-between gap-3 mt-0.5">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-orange-400"></div>
          <span className="text-gray-500 text-xs">Nằm nghỉ PYT / 休息</span>
        </div>
        <span className={`font-bold ${rests > 0 ? 'text-orange-500' : 'text-gray-300'}`}>{rests}</span>
      </div>
    </div>
  );
};

export const Dashboard: React.FC<DashboardProps> = ({ currentUser, stationConfig, onTabChange, refreshTrigger }) => {
  const [kpi, setKpi] = useState<KpiData>({ patientsToday: 0, prescriptionsToday: 0, totalStock: 0, expiryAlerts: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showExpiryModal, setShowExpiryModal] = useState(false);
  const [expiryMedicines, setExpiryMedicines] = useState<ExpiryMedicine[]>([]);
  const [allMedicinesForModal, setAllMedicinesForModal] = useState<any[]>([]);
  const [allEncounters, setAllEncounters] = useState<any[]>([]);

  // Trend chart state
  const [trendMode, setTrendMode] = useState<'week' | 'month' | 'year'>('week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [yearOffset, setYearOffset] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadData();
  }, [stationConfig.name, refreshTrigger]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      if ((window as any).electron) {
        const medicines = await (window as any).electron.getInventory(stationConfig.name);

        const totalStock = medicines
          ? medicines.reduce((sum: number, m: any) => sum + (m.stock || 0), 0)
          : 0;

        const alertMeds: ExpiryMedicine[] = medicines
          ? medicines.filter((m: any) => {
              if (!m.expiryDate || m.expiryDate === '---') return false;
              if ((m.stock || 0) <= 0) return false;
              const diff = new Date(m.expiryDate).getTime() - Date.now();
              return diff < 90 * 86400000;
            }).map((m: any) => ({
              name: m.name,
              batchNumber: m.batchNumber || '---',
              expiryDate: m.expiryDate,
              stock: m.stock || 0,
              station: m.station || stationConfig.name,
              diff: new Date(m.expiryDate).getTime() - Date.now(),
            }))
          : [];
        setExpiryMedicines(alertMeds);
        setAllMedicinesForModal(medicines || []);
        const expiryAlerts = alertMeds.length;

        let patientsToday = 0;
        let prescriptionsToday = 0;
        try {
          let encounters: any[] = [];
          if (stationConfig.type === StationType.HUB && (window as any).electron.queryServerEncounters) {
            // Hub đọc thẳng từ server — 90 ngày gần nhất (đủ cho trend chart + KPI hôm nay)
            const from = Date.now() - 90 * 24 * 60 * 60 * 1000;
            const res = await (window as any).electron.queryServerEncounters({ from });
            encounters = res?.data || [];
          } else {
            encounters = await (window as any).electron.getAllEncounters();
          }
          setAllEncounters(encounters);

          if (encounters) {
            // Dùng cùng logic toShiftDay với trend chart để KPI luôn khớp
            const todayKey = todayShiftKey();
            const todayList = encounters.filter((e: any) =>
              e.startTime && toShiftDay(e.startTime) === todayKey
            );
            patientsToday = todayList.length;
            prescriptionsToday = todayList.filter((e: any) => {
              const rx = typeof e.prescriptions === 'string'
                ? JSON.parse(e.prescriptions || '[]')
                : (e.prescriptions || []);
              return rx.length > 0;
            }).length;
          }
        } catch { /* ignore */ }

        setKpi({ patientsToday, prescriptionsToday, totalStock, expiryAlerts });
      }
    } catch (e) {
      console.error('Dashboard load error:', e);
    }
    setIsLoading(false);
  };

  // ── Trend chart computed data ──
  const currentOffset = trendMode === 'week' ? weekOffset : trendMode === 'month' ? monthOffset : yearOffset;

  const handlePrev = () => {
    if (trendMode === 'week') setWeekOffset(o => o - 1);
    else if (trendMode === 'month') setMonthOffset(o => o - 1);
    else setYearOffset(o => o - 1);
  };

  const handleNext = () => {
    if (trendMode === 'week') setWeekOffset(o => o + 1);
    else if (trendMode === 'month') setMonthOffset(o => o + 1);
    else setYearOffset(o => o + 1);
  };

  const handleSetMode = (mode: 'week' | 'month' | 'year') => {
    setTrendMode(mode);
    setWeekOffset(0);
    setMonthOffset(0);
    setYearOffset(0);
  };

  const { data: chartData, periodLabel } = useMemo(() => {
    if (trendMode === 'week') return computeWeekData(allEncounters, weekOffset);
    if (trendMode === 'month') return computeMonthData(allEncounters, monthOffset);
    return computeYearData(allEncounters, yearOffset);
  }, [allEncounters, trendMode, weekOffset, monthOffset, yearOffset]);

  const avg = useMemo(() => {
    if (!chartData.length) return 0;
    const nonZero = chartData.filter((d: any) => d.count > 0);
    if (!nonZero.length) return 0;
    return nonZero.reduce((s: number, d: any) => s + d.count, 0) / nonZero.length;
  }, [chartData]);

  // ── KPI cards ──
  const kpiCards = [
    { title: 'Bệnh nhân hôm nay', titleZh: '今日就诊', value: kpi.patientsToday, suffix: 'ca khám', icon: Users, bg: 'bg-green-50', iconColor: 'text-green-600', valueColor: 'text-green-700' },
    { title: 'Kê đơn hôm nay', titleZh: '今日处方', value: kpi.prescriptionsToday, suffix: 'đơn thuốc', icon: ClipboardList, bg: 'bg-blue-50', iconColor: 'text-blue-600', valueColor: 'text-blue-700' },
    { title: 'Tổng tồn kho', titleZh: '库存总量', value: kpi.totalStock, suffix: 'đơn vị', icon: Package, bg: 'bg-purple-50', iconColor: 'text-purple-600', valueColor: 'text-purple-700' },
    { title: 'Cảnh báo hạn dùng', titleZh: '效期预警', value: kpi.expiryAlerts, suffix: 'mặt hàng', icon: AlertTriangle, bg: kpi.expiryAlerts > 0 ? 'bg-red-50' : 'bg-gray-50', iconColor: kpi.expiryAlerts > 0 ? 'text-red-500' : 'text-gray-400', valueColor: kpi.expiryAlerts > 0 ? 'text-red-600' : 'text-gray-500' },
  ];

  const quickLinks = [
    { tab: 'clinical', label: 'Lâm sàng / 临床', sub: '接诊与检查', icon: Stethoscope, border: 'border-green-200 hover:bg-green-50 hover:border-green-400' },
    { tab: 'inventory', label: 'Kho dược / 药房', sub: '药品与医疗耗材', icon: Pill, border: 'border-blue-200 hover:bg-blue-50 hover:border-blue-400' },
    { tab: 'reports', label: 'Báo cáo / 报告', sub: '统计与分析', icon: BarChart3, border: 'border-purple-200 hover:bg-purple-50 hover:border-purple-400' },
    { tab: 'kiosk', label: 'Kiosk / 挂号屏', sub: '接待屏幕', icon: UserPlus, border: 'border-orange-200 hover:bg-orange-50 hover:border-orange-400' },
  ];

  return (
    <div className="h-full overflow-auto space-y-5">

      {/* ── HERO BANNER ── */}
      <div className="relative bg-gradient-to-br from-green-600 via-green-500 to-emerald-400 rounded-2xl p-7 overflow-hidden shadow-lg">
        <div className="absolute -top-10 -right-10 w-52 h-52 bg-white/10 rounded-full pointer-events-none"></div>
        <div className="absolute -bottom-14 -right-6 w-72 h-72 bg-white/5 rounded-full pointer-events-none"></div>
        <div className="absolute top-6 right-36 w-14 h-14 bg-white/10 rounded-full pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div>
            <p className="text-green-100 text-xs font-bold uppercase tracking-widest mb-1.5">
              {getGreeting()} 👋
            </p>
            <h2 className="text-white text-3xl font-extrabold leading-tight mb-2">
              {currentUser.name}
            </h2>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full">
                {getRoleLabel(currentUser.role)}
              </span>
              <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full">
                Trạm {stationConfig.name} · {stationConfig.type}
              </span>
            </div>
          </div>

          <div className="bg-white/20 backdrop-blur-sm rounded-2xl px-6 py-4 text-white shrink-0">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={16} className="text-green-100" />
              <span className="text-3xl font-mono font-bold tracking-tight">
                {String(currentTime.getHours()).padStart(2,'0')}:{String(currentTime.getMinutes()).padStart(2,'0')}
              </span>
            </div>
            <div className="flex items-center gap-2 text-green-100 text-xs">
              <Calendar size={13} />
              <span>
                {['Chủ nhật','Thứ hai','Thứ ba','Thứ tư','Thứ năm','Thứ sáu','Thứ bảy'][currentTime.getDay()]}, {String(currentTime.getDate()).padStart(2,'0')}/{String(currentTime.getMonth()+1).padStart(2,'0')}/{currentTime.getFullYear()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI CARDS ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map((card, idx) => {
          const isExpiry = idx === 3;
          return (
            <div
              key={idx}
              onClick={isExpiry && kpi.expiryAlerts > 0 ? () => setShowExpiryModal(true) : undefined}
              className={`bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow${isExpiry && kpi.expiryAlerts > 0 ? ' cursor-pointer ring-1 ring-red-200 hover:ring-red-400' : ''}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-11 h-11 ${card.bg} rounded-xl flex items-center justify-center`}>
                  <card.icon size={22} className={card.iconColor} />
                </div>
                {isLoading && (
                  <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin mt-1"></div>
                )}
              </div>
              <div className={`text-4xl font-extrabold ${card.valueColor} mb-1 tabular-nums`}>
                {isLoading ? <span className="text-2xl text-gray-300">...</span> : card.value.toLocaleString('vi-VN')}
              </div>
              <div className="text-sm font-semibold text-gray-700">{card.title}</div>
              <div className="text-[10px] text-gray-400 leading-tight">{card.titleZh}</div>
              <div className="text-xs text-gray-400 mt-0.5">{isExpiry && kpi.expiryAlerts > 0 ? 'Nhấn để xem / 点击查看' : card.suffix}</div>
            </div>
          );
        })}
      </div>

      {/* ── TREND BAND ── */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        {/* Header: title + toggle */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <TrendingUp size={15} className="text-green-600" /> Xu hướng bệnh nhân / 就诊趋势
          </h3>
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {(['week', 'month', 'year'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => handleSetMode(mode)}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                  trendMode === mode
                    ? 'bg-white text-green-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {mode === 'week' ? <span>Tuần<br/><span className="text-[9px] opacity-70 font-normal">本周</span></span> : mode === 'month' ? <span>Tháng<br/><span className="text-[9px] opacity-70 font-normal">本月</span></span> : <span>Năm<br/><span className="text-[9px] opacity-70 font-normal">年度</span></span>}
              </button>
            ))}
          </div>
        </div>

        {/* Navigation + period label */}
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={handlePrev}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-gray-700">{periodLabel}</span>
          {/* Ẩn nút → khi đang ở kỳ hiện tại (không có dữ liệu tương lai) */}
          <button
            onClick={handleNext}
            className={`p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors ${currentOffset >= 0 ? 'invisible' : ''}`}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs mb-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-gray-500">
            <div className="w-3 h-3 rounded-sm bg-green-400"></div>
            <span>Vào khám / 就诊</span>
          </div>
          <div className="flex items-center gap-1.5 text-red-500">
            <div className="w-5 border-t-2 border-red-500"></div>
            <div className="w-2 h-2 rounded-full bg-red-500 -ml-2"></div>
            <span>Chuyển viện / 转院</span>
          </div>
          <div className="flex items-center gap-1.5 text-orange-500">
            <div className="w-5 border-t-2 border-dashed border-orange-400"></div>
            <div className="w-2 h-2 rounded-full bg-orange-400 -ml-2"></div>
            <span>Nằm nghỉ PYT / 休息</span>
          </div>
          {avg > 0 && (
            <div className="flex items-center gap-1.5 text-amber-600 ml-auto">
              <div className="w-6 border-t-2 border-dashed border-amber-400"></div>
              <span>TB / 均: <span className="font-bold">{avg.toFixed(1)}</span>/{trendMode === 'year' ? 'tháng/月' : 'ngày/日'}</span>
            </div>
          )}
        </div>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart
            data={chartData}
            margin={{ top: 5, right: 28, left: -10, bottom: 0 }}
            barCategoryGap={trendMode === 'month' ? '8%' : '20%'}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: trendMode === 'month' ? 9 : 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              allowDecimals={false}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              allowDecimals={false}
              tick={{ fontSize: 10, fill: '#d1d5db' }}
              axisLine={false}
              tickLine={false}
              width={20}
            />
            <Tooltip content={<TrendTooltip />} cursor={{ fill: '#f0fdf4' }} />
            {avg > 0 && (
              <ReferenceLine
                yAxisId="left"
                y={avg}
                stroke="#f59e0b"
                strokeDasharray="4 2"
                strokeWidth={1.5}
              />
            )}
            <Bar yAxisId="left" dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={trendMode === 'month' ? 12 : 44}>
              {chartData.map((entry: any, i: number) => (
                <Cell
                  key={i}
                  fill={
                    entry.isToday || entry.isCurrent
                      ? '#16a34a'
                      : currentOffset < 0
                        ? '#86efac'
                        : '#4ade80'
                  }
                />
              ))}
            </Bar>
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="transfers"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ fill: '#ef4444', r: 4, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: '#ef4444', strokeWidth: 0 }}
              connectNulls={false}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="rests"
              stroke="#f97316"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={{ fill: '#f97316', r: 4, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: '#f97316', strokeWidth: 0 }}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── EXPIRY ALERT MODAL ── */}
      {showExpiryModal && (() => {
        const expired = expiryMedicines.filter(m => m.diff < 0);
        const nearExpiry = expiryMedicines.filter(m => m.diff >= 0 && m.diff < 90 * 86400000);
        const alertNames = new Set(expiryMedicines.map(m => m.name + '_' + m.batchNumber));
        const lowStock: ExpiryMedicine[] = allMedicinesForModal
          .filter((m: any) => m.stock > 0 && m.stock < 10 && !alertNames.has(m.name + '_' + (m.batchNumber || '')))
          .map((m: any) => ({ name: m.name, batchNumber: m.batchNumber || '---', expiryDate: m.expiryDate || '---', stock: m.stock, station: m.station || stationConfig.name, diff: 0 }));
        const formatExp = (d: string) => {
          if (!d || d === '---') return '---';
          try { const dt = new Date(d); return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`; } catch { return d; }
        };
        const Section = ({ title, color, items, showExpiry = true }: { title: string; color: string; items: ExpiryMedicine[]; showExpiry?: boolean }) => items.length === 0 ? null : (
          <div className="mb-5">
            <div className={`text-xs font-bold uppercase tracking-wider mb-2 ${color}`}>{title} ({items.length})</div>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-400 border-b"><th className="text-left pb-1">Tên thuốc / 药名</th><th className="text-left pb-1">Lô / 批号</th>{showExpiry && <th className="text-left pb-1">Hạn dùng / 效期</th>}<th className="text-right pb-1">Tồn / 库存</th><th className="text-left pb-1 pl-2">Trạm / 站点</th></tr></thead>
              <tbody>
                {items.map((m, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-1.5 font-medium">{m.name}</td>
                    <td className="py-1.5 text-gray-500 font-mono text-xs">{m.batchNumber}</td>
                    {showExpiry && <td className="py-1.5">{formatExp(m.expiryDate)}</td>}
                    <td className="py-1.5 text-right font-mono font-bold">{m.stock}</td>
                    <td className="py-1.5 pl-2 text-gray-500 text-xs">{m.station}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowExpiryModal(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={20} className="text-red-500" />
                  <h2 className="text-lg font-bold text-gray-800">Cảnh báo hạn dùng & tồn kho / 效期与库存预警</h2>
                </div>
                <button onClick={() => setShowExpiryModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>
              <div className="overflow-auto p-5">
                <Section title="Đã hết hạn / 已过期" color="text-red-600" items={expired} />
                <Section title="Cận hạn (90 ngày) / 临期(90天)" color="text-orange-500" items={nearExpiry} />
                <Section title="Sắp hết hàng (tồn < 10) / 库存不足" color="text-yellow-600" items={lowStock} showExpiry={false} />
                {expired.length === 0 && nearExpiry.length === 0 && lowStock.length === 0 && (
                  <p className="text-gray-400 text-center py-8">Không có cảnh báo / 无预警</p>
                )}
              </div>
              <div className="p-4 border-t bg-gray-50 rounded-b-2xl">
                <button onClick={() => { setShowExpiryModal(false); onTabChange('inventory'); }} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700">Đến kho dược / 进入药房 →</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── QUICK ACCESS ── */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Activity size={15} className="text-green-600" /> Truy cập nhanh / 快速访问
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quickLinks.map((item) => (
            <button
              key={item.tab}
              onClick={() => onTabChange(item.tab)}
              className={`border-2 ${item.border} rounded-xl p-4 cursor-pointer transition-all text-left group`}
            >
              <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <item.icon size={18} className="text-gray-600" />
              </div>
              <div className="font-bold text-gray-800 text-sm">{item.label}</div>
              <div className="text-xs text-gray-500 mt-0.5 leading-snug">{item.sub}</div>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
};
