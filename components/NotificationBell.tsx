import React, { useState, useEffect, useRef } from 'react';
import { Bell, Clock, User2, X, PackageCheck, ClipboardList, Truck } from 'lucide-react';
import { EncounterStatus, StationConfig } from '../types';
import { storage } from '../services/storage';

type NotificationType =
  | 'WAITING_LONG'
  | 'REST_OVERTIME'
  | 'MONITOR_OVERTIME'
  | 'PERIOD_CLOSE_DUE'
  | 'SPOKE_REPORT_MISSING'
  | 'TRANSFER_RECEIVED'    // Spoke: đã nhận thuốc điều chuyển từ Hub
  | 'TRANSFER_CONFIRMED';  // Hub: trạm nhận đã xác nhận nhận thuốc

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  subtitle: string;
  detail: string;
  navTab: string;            // tab cần nhảy tới khi bấm
  focusId?: string;          // id ca khám cần chọn (clinical)
  navAction?: string;        // hành động phụ tại tab đích (vd 'periodClose')
}

interface Props {
  stationConfig: StationConfig;
  onNavigate?: (tab: string, intent?: { focusId?: string; action?: string }) => void;
}

// Màu sắc theo loại thông báo
const typeStyle: Record<NotificationType, { bg: string; iconBg: string; iconColor: string; text: string }> = {
  WAITING_LONG:         { bg: 'bg-blue-50',   iconBg: 'bg-blue-100',   iconColor: 'text-blue-600',   text: 'text-blue-600'   },
  REST_OVERTIME:        { bg: 'bg-amber-50',  iconBg: 'bg-amber-100',  iconColor: 'text-amber-600',  text: 'text-amber-600'  },
  MONITOR_OVERTIME:     { bg: 'bg-amber-50',  iconBg: 'bg-amber-100',  iconColor: 'text-amber-600',  text: 'text-amber-600'  },
  PERIOD_CLOSE_DUE:     { bg: 'bg-indigo-50', iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600', text: 'text-indigo-600' },
  SPOKE_REPORT_MISSING: { bg: 'bg-rose-50',   iconBg: 'bg-rose-100',   iconColor: 'text-rose-600',   text: 'text-rose-600'   },
  TRANSFER_RECEIVED:    { bg: 'bg-emerald-50',iconBg: 'bg-emerald-100',iconColor: 'text-emerald-600',text: 'text-emerald-600'},
  TRANSFER_CONFIRMED:   { bg: 'bg-teal-50',   iconBg: 'bg-teal-100',   iconColor: 'text-teal-600',   text: 'text-teal-600'   },
};

const TypeIcon: React.FC<{ type: NotificationType }> = ({ type }) => {
  if (type === 'WAITING_LONG') return <User2 size={14} />;
  if (type === 'PERIOD_CLOSE_DUE') return <PackageCheck size={14} />;
  if (type === 'SPOKE_REPORT_MISSING') return <ClipboardList size={14} />;
  if (type === 'TRANSFER_RECEIVED' || type === 'TRANSFER_CONFIRMED') return <Truck size={14} />;
  return <Clock size={14} />;
};

export const NotificationBell: React.FC<Props> = ({ stationConfig, onNavigate }) => {
  const stationName = stationConfig.name;
  const isHub = stationConfig.type === 'HUB';

  // Lấy danh sách Spoke động từ storage (đồng bộ với cấu hình thực tế)
  const spokeStations = storage.getKnownStations()
    .filter(s => s.type === 'SPOKE')
    .map(s => s.name);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dismissedRef = useRef<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const result: Notification[] = [];

        // ── 1. Kiểm tra bệnh nhân chờ / nghỉ ──────────────────────────────
        if (window.electron) {
          const encounters: any[] = await window.electron.getEncounters();
          const now = Date.now();

          for (const e of encounters) {
            if (e.status === EncounterStatus.WAITING) {
              const mins = Math.floor((now - e.startTime) / 60000);
              if (mins >= 60) {
                result.push({
                  id: `W_${e.id}`,
                  type: 'WAITING_LONG',
                  title: e.patientName,
                  subtitle: e.department,
                  detail: `Chờ khám ${mins} phút / 等待${mins}分钟`,
                  navTab: 'clinical',
                  focusId: e.id,
                });
              }
            }

            if (
              (e.status === EncounterStatus.REST_30 || e.status === EncounterStatus.MONITOR) &&
              e.restStartTime
            ) {
              const mins = Math.floor((now - e.restStartTime) / 60000);
              if (mins >= 30) {
                result.push({
                  id: `R_${e.id}`,
                  type: e.status === EncounterStatus.MONITOR ? 'MONITOR_OVERTIME' : 'REST_OVERTIME',
                  title: e.patientName,
                  subtitle: e.department,
                  detail:
                    e.status === EncounterStatus.MONITOR
                      ? `Theo dõi ${mins} phút / 监测中`
                      : `Nghỉ quá giờ: ${mins} phút / 休息超时`,
                  navTab: 'clinical',
                  focusId: e.id,
                });
              }
            }
          }
        }

        // ── 2. Nhắc chốt kho: bắt đầu từ 2 ngày cuối tháng, hiện đến khi chốt ──
        const today = new Date();
        const day   = today.getDate();
        const month = today.getMonth() + 1;
        const year  = today.getFullYear();

        if (window.electron) {
          const periods: any[] = await window.electron.getClosedPeriods(stationName);

          // Xây danh sách các tháng cần kiểm tra:
          // - Tháng hiện tại nếu đang trong 2 ngày cuối
          // - Các tháng trước (tối đa 3 tháng) nếu chưa được chốt
          const monthsToCheck: { m: number; y: number }[] = [];

          const lastDay = new Date(year, month, 0).getDate();
          if (day >= lastDay - 1) {
            monthsToCheck.push({ m: month, y: year });
          }
          for (let i = 1; i <= 3; i++) {
            let m = month - i; let y = year;
            if (m <= 0) { m += 12; y--; }
            monthsToCheck.push({ m, y });
          }

          for (const { m: checkMonth, y: checkYear } of monthsToCheck) {
            const alreadyClosed = periods.some(
              p => p.periodType === 'MONTHLY' && p.periodYear === checkYear && p.periodRef === checkMonth
            );
            if (!alreadyClosed) {
              const isCurrentMonth = checkMonth === month && checkYear === year;
              const daysLeft = isCurrentMonth ? lastDay - day : 0;
              const isOverdue = !isCurrentMonth;

              result.push({
                id: `PERIOD_${checkYear}_${checkMonth}`,
                type: 'PERIOD_CLOSE_DUE',
                title: `Chốt kho tháng ${checkMonth}/${checkYear}`,
                subtitle: isOverdue
                  ? `Quá hạn — chưa chốt tháng ${checkMonth}/${checkYear}!`
                  : daysLeft === 0
                    ? 'Hôm nay là ngày cuối tháng!'
                    : `Còn ${daysLeft} ngày cuối tháng`,
                detail: (isOverdue || daysLeft === 0)
                  ? '🔴 Khẩn! — Vào Kho dược → Chốt kỳ'
                  : '🟡 Nhắc nhở — Vào Kho dược → Chốt kỳ',
                navTab: 'inventory',
                navAction: 'periodClose',
              });
              break; // Chỉ hiện 1 thông báo cho kỳ chưa chốt gần nhất
            }
          }
        }

        // ── 3. Hub: Ngày 1-5 — kiểm tra Spoke nào chưa gửi báo cáo thuốc ──
        if (isHub && day >= 1 && day <= 5 && window.electron) {
          // Kỳ cần kiểm tra = tháng trước
          let reportMonth = month - 1;
          let reportYear  = year;
          if (reportMonth === 0) { reportMonth = 12; reportYear = year - 1; }

          const submitted: { station: string }[] = await window.electron.getSpokeReportStatus(reportMonth, reportYear);
          const submittedSet = new Set(submitted.map(s => s.station));

          const missing = spokeStations.filter(s => !submittedSet.has(s));
          const done    = spokeStations.filter(s =>  submittedSet.has(s));

          if (missing.length > 0) {
            result.push({
              id: `SPOKE_REPORT_${reportYear}_${reportMonth}`,
              type: 'SPOKE_REPORT_MISSING',
              title: `Báo cáo thuốc T${reportMonth}/${reportYear}`,
              subtitle: done.length > 0
                ? `Đã gửi: ${done.join(', ')}`
                : 'Chưa có trạm nào gửi',
              detail: `Chưa gửi: ${missing.join(', ')} — nhắc nhở các trạm`,
              navTab: 'reports',
            });
          }
        }

        // ── 4. Điều chuyển thuốc (trong 24h gần nhất) ──────────────────────
        const DAY = 24 * 60 * 60 * 1000;
        const now2 = Date.now();

        // Spoke: đã NHẬN thuốc điều chuyển (đọc log TRANSFER_IN local)
        if (!isHub && window.electron?.getInventoryLogs) {
          const logs: any[] = await window.electron.getInventoryLogs();
          (logs || [])
            .filter(l => l.type === 'TRANSFER_IN' && (now2 - (l.timestamp || 0)) < DAY)
            .forEach(l => {
              const items = Array.isArray(l.items) ? l.items : [];
              result.push({
                id: `TRIN_${l.id}`,
                type: 'TRANSFER_RECEIVED',
                title: `Đã nhận điều chuyển từ ${l.source || '?'}`,
                subtitle: `${items.length} mặt hàng / 已收到调拨`,
                detail: items.slice(0, 3).map((it: any) => `${it.name} (${it.qty})`).join(', ') + (items.length > 3 ? '…' : ''),
                navTab: 'inventory',
              });
            });
        }

        // Hub: trạm nhận ĐÃ XÁC NHẬN nhận thuốc mình chuyển đi
        if (isHub && (window.electron as any)?.getServerTransfers) {
          const res = await (window.electron as any).getServerTransfers(stationName);
          ((res?.data) || [])
            .filter((t: any) => t.status === 'CONFIRMED' && (now2 - (t.confirmed_at || 0)) < DAY)
            .forEach((t: any) => {
              const meds = Array.isArray(t.medicines) ? t.medicines : [];
              result.push({
                id: `TROUT_${t.id}`,
                type: 'TRANSFER_CONFIRMED',
                title: `${t.target_station} đã nhận thuốc`,
                subtitle: `${meds.length} mặt hàng / 已确认收货`,
                detail: `Xác nhận lúc ${new Date(t.confirmed_at).toLocaleString('vi-VN')}`,
                navTab: 'inventory',
              });
            });
        }

        setNotifications(result.filter(n => !dismissedRef.current.has(n.id)));
      } catch {
        // Không crash app nếu lỗi fetch
      }
    };

    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [stationName, isHub]);

  // Đóng panel khi click ngoài
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const dismiss = (id: string) => {
    dismissedRef.current.add(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const dismissAll = () => {
    notifications.forEach(n => dismissedRef.current.add(n.id));
    setNotifications([]);
    setIsOpen(false);
  };

  const count = notifications.length;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setIsOpen(o => !o)}
        title="Thông báo / 通知"
        className={`relative p-2 rounded-lg transition-colors ${
          count > 0
            ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
            : 'text-gray-400 hover:bg-gray-100'
        }`}
      >
        <Bell size={20} />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-11 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
            <span className="font-bold text-sm text-gray-700 flex items-center gap-1.5">
              <Bell size={14} />
              Thông báo / 通知
              {count > 0 && (
                <span className="bg-red-100 text-red-600 text-[10px] font-bold px-1.5 rounded-full">
                  {count}
                </span>
              )}
            </span>
            {count > 0 && (
              <button
                onClick={dismissAll}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                Xóa tất cả / 全部清除
              </button>
            )}
          </div>

          {/* Danh sách */}
          {notifications.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">
              <Bell size={28} className="mx-auto mb-2 opacity-20" />
              Không có thông báo mới / 暂无新通知
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
              {notifications.map(n => {
                const s = typeStyle[n.type];
                return (
                  <div key={n.id} className={`px-4 py-3 flex items-start gap-3 ${s.bg}`}>
                    {/* Icon + Nội dung: bấm để nhảy tới đúng chỗ phát sinh */}
                    <button
                      type="button"
                      onClick={() => { onNavigate?.(n.navTab, { focusId: n.focusId, action: n.navAction }); setIsOpen(false); }}
                      className="flex items-start gap-3 flex-1 min-w-0 text-left cursor-pointer group"
                      title="Bấm để mở / 点击打开"
                    >
                      <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${s.iconBg} ${s.iconColor}`}>
                        <TypeIcon type={n.type} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate group-hover:underline">{n.title}</p>
                        <p className="text-xs text-gray-500 truncate">{n.subtitle}</p>
                        <p className={`text-xs font-medium mt-0.5 ${s.text}`}>{n.detail}</p>
                      </div>
                    </button>

                    {/* Dismiss */}
                    <button
                      onClick={() => dismiss(n.id)}
                      className="text-gray-300 hover:text-gray-500 shrink-0 mt-0.5 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
