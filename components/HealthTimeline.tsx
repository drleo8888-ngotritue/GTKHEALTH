import React, { useState, useEffect } from 'react';
import { X, Activity, Calendar, ChevronDown, ChevronUp, Stethoscope } from 'lucide-react';
import { HealthCheckup, Encounter, EncounterStatus } from '../types';

interface Props {
  patientId: string;
  patientName: string;
  department?: string;
  /** 'full' = KSK + khám bệnh (Admin). 'encounters-only' = chỉ khám bệnh (Clinical) */
  mode?: 'full' | 'encounters-only';
  onClose: () => void;
}

// --- Nhãn trạng thái ---
const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  COMPLETED_WORK:     { label: 'Về làm việc',        color: 'bg-green-100 text-green-700' },
  COMPLETED_TRANSFER: { label: 'Chuyển viện',         color: 'bg-red-100 text-red-700' },
  REST_30:            { label: 'Nghỉ ngơi tại trạm',  color: 'bg-yellow-100 text-yellow-700' },
  MONITOR:            { label: 'Theo dõi',             color: 'bg-blue-100 text-blue-700' },
  IN_PROGRESS:        { label: 'Đang khám',            color: 'bg-gray-100 text-gray-600' },
  WAITING:            { label: 'Chờ khám',             color: 'bg-gray-100 text-gray-600' },
};

function getStatusBadge(status: string) {
  const s = STATUS_LABEL[status] || { label: status, color: 'bg-gray-100 text-gray-600' };
  return <span className={`text-xs font-bold px-2 py-0.5 rounded ${s.color}`}>{s.label}</span>;
}

function formatDate(ts: number) {
  const d = new Date(ts);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

// --- Lọc key meta (mã NV, tên, ngày sinh, địa điểm, ...) khỏi exam_details ---
const _normLabel = (s: string) =>
  String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s\-_()\[\]]/g, '');

const META_LABEL_PATTERNS = [
  'code','manv','mathe','maso','idnv','employeeid','工号','姓名','sothebhyt',
  'hoten','tennv','hotennv','tenninh','tenin','hovaten','hovatennhanvien','fullname',
  'ngaysinh','dob','namsinh','ngayky','gioitinh','tuoi','age',
  'diadiem','diadiemkham','noikham','diachinoi',
  'stt','tt',
  'ketluan','kl','tuvan','ghichu','nhanxet',
];

function isMetaLabel(key: string): boolean {
  const n = _normLabel(key);
  return META_LABEL_PATTERNS.some(p => {
    const pn = _normLabel(p);
    return n === pn || (pn.length >= 4 && n.startsWith(pn));
  });
}

// --- Card KSK hàng năm ---
function CheckupCard({ checkup }: { checkup: HealthCheckup }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = checkup.examDetails && Object.keys(checkup.examDetails).length > 0;

  // Phát hiện cấu trúc nested (đa tầng) hay flat
  const isGrouped = hasDetails &&
    Object.values(checkup.examDetails).some(
      v => v !== null && typeof v === 'object' && !Array.isArray(v)
    );

  const totalCount = hasDetails
    ? isGrouped
      ? Object.values(checkup.examDetails).reduce(
          (s: number, g: any) => s + (typeof g === 'object' && g ? Object.keys(g).length : 1), 0
        )
      : Object.entries(checkup.examDetails).filter(([k]) => !isMetaLabel(k)).length
    : 0;

  return (
    <div className="border border-green-200 bg-green-50 rounded-lg p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1">
          <div className="mt-0.5 w-8 h-8 rounded-full bg-green-600 flex items-center justify-center shrink-0">
            <Activity size={16} className="text-white" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-green-800">
              Khám sức khỏe định kỳ {checkup.checkupMonth ? `(${checkup.checkupMonth})` : ''}
            </div>
            {checkup.healthClass && (
              <span className="inline-block mt-1 bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded">
                Loại {checkup.healthClass.replace(/^lo[aạ]i\s+/i, '')}
              </span>
            )}
            {checkup.healthConclusion && (
              <div className="text-xs text-green-700 mt-1">
                <span className="font-semibold">Kết luận SK:</span> {checkup.healthConclusion}
              </div>
            )}
            {checkup.diseaseConclusion && (
              <div className="text-xs text-green-700 mt-1">
                <span className="font-semibold">Bệnh lý:</span> {checkup.diseaseConclusion}
              </div>
            )}
            {checkup.consultation && (
              <div className="text-xs text-green-700 mt-1">
                <span className="font-semibold">Tư vấn:</span> {checkup.consultation}
              </div>
            )}
          </div>
        </div>
        {hasDetails && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="shrink-0 flex items-center gap-1 text-xs text-green-700 hover:text-green-900 font-bold px-2 py-1 rounded hover:bg-green-100 whitespace-nowrap"
          >
            {expanded
              ? <><ChevronUp size={14}/> Ẩn</>
              : <><ChevronDown size={14}/> {totalCount} chỉ số</>}
          </button>
        )}
      </div>

      {expanded && hasDetails && (
        <div className="mt-3 border-t border-green-200 pt-3 space-y-2">
          {isGrouped
            ? /* ── Hiển thị theo nhóm ── */
              Object.entries(checkup.examDetails).map(([groupName, items]) => (
                <ExamGroup key={groupName} title={groupName} items={items as Record<string, any>}/>
              ))
            : /* ── Hiển thị phẳng (file cũ không có nhóm) ── */
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {Object.entries(checkup.examDetails)
                  .filter(([k]) => !isMetaLabel(k))
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs border-b border-green-100 py-1">
                      <span className="text-green-800 font-medium truncate pr-2">{k}</span>
                      <span className="text-green-900 font-bold shrink-0">{String(v ?? '')}</span>
                    </div>
                  ))}
              </div>
          }
        </div>
      )}
    </div>
  );
}

// --- Nhóm chỉ số (1 đầu mục lớn) ---
function ExamGroup({ title, items }: { title: string; items: Record<string, any> }) {
  const [open, setOpen] = useState(true);
  const entries = Object.entries(items);
  return (
    <div className="rounded-lg border border-green-200 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-1.5 bg-green-100 hover:bg-green-200 transition text-left"
      >
        <span className="text-xs font-bold text-green-800">{title}</span>
        <span className="flex items-center gap-1 text-[10px] text-green-600 font-semibold shrink-0">
          {entries.length} chỉ số
          {open ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
        </span>
      </button>
      {open && (
        <div className="grid grid-cols-3 gap-x-2 gap-y-0 px-3 py-2 bg-white">
          {entries.map(([k, v]) => (
            <div key={k} className="flex flex-col py-1 border-b border-slate-50">
              <span className="text-[10px] text-slate-500 leading-tight">{k}</span>
              <span className="text-xs font-bold text-slate-800 mt-0.5 truncate" title={String(v ?? '')}>{String(v ?? '') || '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Item khám bệnh thường ---
function EncounterItem({ encounter }: { encounter: Encounter }) {
  const meds = encounter.prescriptions || [];
  return (
    <div className="flex items-start gap-2">
      <div className="mt-1 w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
        <Stethoscope size={14} className="text-blue-600" />
      </div>
      <div className="flex-1 border border-gray-200 rounded-lg p-3 bg-white">
        <div className="flex items-center justify-between flex-wrap gap-1">
          <span className="text-sm font-bold text-gray-700">
            {formatDate(encounter.startTime)} — {encounter.stationName || 'Phòng Y tế'}
          </span>
          {getStatusBadge(encounter.status)}
        </div>
        {encounter.diagnosis && (
          <div className="text-sm text-gray-600 mt-1">
            <span className="font-semibold">Chẩn đoán:</span> {encounter.diagnosis}
          </div>
        )}
        {meds.length > 0 && (
          <div className="text-xs text-gray-500 mt-1">
            Thuốc: {meds.map((m: any) => `${m.medicineName} x${m.quantity}`).join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Component chính ---
export const HealthTimeline: React.FC<Props> = ({ patientId, patientName, department, mode = 'full', onClose }) => {
  const [loading, setLoading] = useState(true);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [checkups, setCheckups] = useState<HealthCheckup[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (window.electron) {
          const data = await window.electron.getPatientTimeline(patientId);
          setEncounters(data.encounters || []);
          setCheckups(data.checkups || []);
        }
      } catch (e) {
        console.error('Lỗi load timeline:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [patientId]);

  // Gom theo năm
  const allYears: number[] = [];
  if (mode === 'full') {
    checkups.forEach(c => { if (!allYears.includes(c.year)) allYears.push(c.year); });
  }
  encounters.forEach(e => {
    const y = new Date(e.startTime).getFullYear();
    if (!allYears.includes(y)) allYears.push(y);
  });
  allYears.sort((a, b) => b - a); // Mới nhất trước

  const checkupByYear = new Map(checkups.map(c => [c.year, c]));
  const encountersByYear = new Map<number, Encounter[]>();
  encounters.forEach(e => {
    const y = new Date(e.startTime).getFullYear();
    if (!encountersByYear.has(y)) encountersByYear.set(y, []);
    encountersByYear.get(y)!.push(e);
  });

  const isEmpty = allYears.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b">
          <div>
            <h2 className="text-xl font-bold text-gray-800">
              {mode === 'full' ? 'Hồ sơ sức khỏe' : 'Lịch sử khám'}
            </h2>
            <p className="text-medical-green font-bold text-lg">{patientName}</p>
            {department && <p className="text-sm text-gray-500">{patientId} · {department}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          >
            <X size={22} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <div className="w-8 h-8 border-4 border-gray-200 border-t-medical-green rounded-full animate-spin mb-3" />
              Đang tải dữ liệu...
            </div>
          )}

          {!loading && isEmpty && (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <Calendar size={40} className="mb-3 opacity-30" />
              <p>Chưa có dữ liệu y tế nào được ghi nhận</p>
            </div>
          )}

          {!loading && !isEmpty && (
            <div className="space-y-8">
              {allYears.map(year => {
                const checkup = checkupByYear.get(year);
                const encs = (encountersByYear.get(year) || []).slice().reverse(); // Mới nhất trước
                return (
                  <div key={year}>
                    {/* Tiêu đề năm */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-px flex-1 bg-gray-200" />
                      <span className="text-sm font-black text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                        Năm {year}
                      </span>
                      <div className="h-px flex-1 bg-gray-200" />
                    </div>

                    <div className="space-y-3">
                      {/* KSK hàng năm (chỉ mode full) */}
                      {mode === 'full' && checkup && (
                        <CheckupCard checkup={checkup} />
                      )}

                      {/* Các lần khám bệnh trong năm */}
                      {encs.map(enc => (
                        <EncounterItem key={enc.id} encounter={enc} />
                      ))}

                      {/* Năm có KSK nhưng không có lần khám nào */}
                      {mode === 'full' && checkup && encs.length === 0 && (
                        <p className="text-xs text-gray-400 text-center py-1">
                          Không có lần khám tại phòng y tế trong năm này
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t text-right">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
