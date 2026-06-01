import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, Sector } from 'recharts';
import { storage } from '../services/storage';
import { Download, FileText, Activity, X, Calendar, RefreshCw, Plus, Search, Trash2, Upload, Clock, User as UserIcon, CheckCircle, AlertCircle, FileBarChart2 } from 'lucide-react';
import { Encounter, EncounterStatus, StationConfig, StationType, Medicine, User } from '../types';
// STATION_PRESETS không còn dùng trực tiếp – dùng dynamic từ storage
import * as XLSX from 'xlsx';
import { ReportWizard } from './ReportWizard';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF0000'];

interface ReportsProps {
  stationConfig: StationConfig;
  currentUser: User | null;
  refreshTrigger?: number;
}

// Interface cho Timeline
interface ClinicalEvent {
    id: string;
    action_type: string;
    actor_name: string;
    details: string;
    timestamp: number;
}

const getStatusLabel = (status: string) => {
    switch(status) {
        case EncounterStatus.COMPLETED_WORK: return 'Về làm việc / 返回工作';
        case EncounterStatus.COMPLETED_TRANSFER: return 'Chuyển viện / 转院';
        case EncounterStatus.REST_30: return 'Nghỉ 30 phút / 休息30分钟';
        case EncounterStatus.MONITOR: return 'Theo dõi / 观察';
        case EncounterStatus.IN_PROGRESS: return 'Đang khám / 就诊中';
        case EncounterStatus.WAITING: return 'Đang chờ / 等待中';
        default: return status;
    }
};

const _p2 = (n: number) => String(n).padStart(2, '0');
const fmtDT = (ts: number) => {
  const d = new Date(ts);
  return `${_p2(d.getDate())}/${_p2(d.getMonth()+1)}/${d.getFullYear()} ${_p2(d.getHours())}:${_p2(d.getMinutes())}`;
};
const fmtTime = (ts: number) => { const d = new Date(ts); return `${_p2(d.getHours())}:${_p2(d.getMinutes())}`; };

const TimeInput = ({ value, onChange, className = '' }: { value: string, onChange: (v: string) => void, className?: string }) => {
  const [h, m] = value.split(':');
  return (
    <div className={`flex items-center justify-center bg-white border border-gray-200 rounded px-1.5 py-1 text-xs text-gray-700 transition-colors hover:border-gray-300 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400 ${className}`}>
      <select value={h} onChange={e => onChange(`${e.target.value}:${m}`)} className="bg-transparent outline-none appearance-none cursor-pointer text-center font-mono hover:bg-gray-100 rounded focus:bg-blue-50 w-[20px]">
        {Array.from({length: 24}, (_, i) => <option key={i} value={String(i).padStart(2, '0')}>{String(i).padStart(2, '0')}</option>)}
      </select>
      <span className="text-gray-400 font-bold mx-0.5">:</span>
      <select value={m} onChange={e => onChange(`${h}:${e.target.value}`)} className="bg-transparent outline-none appearance-none cursor-pointer text-center font-mono hover:bg-gray-100 rounded focus:bg-blue-50 w-[20px]">
        {Array.from({length: 60}, (_, i) => <option key={i} value={String(i).padStart(2, '0')}>{String(i).padStart(2, '0')}</option>)}
      </select>
    </div>
  );
};

export const Reports: React.FC<ReportsProps> = ({ stationConfig, currentUser, refreshTrigger }) => {
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]); 
  
  // Modal State
  const [selectedEncounter, setSelectedEncounter] = useState<Encounter | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false); 
  
  // State lưu dòng thời gian sự kiện
  const [timeline, setTimeline] = useState<ClinicalEvent[]>([]);

  // Edit State
  const [editPrescriptions, setEditPrescriptions] = useState<{medId: string, qty: number}[]>([]);
  const [instruction, setInstruction] = useState(''); // Ô nhập y lệnh/hướng dẫn mới
  const [medSearch, setMedSearch] = useState('');
  const [showMedResults, setShowMedResults] = useState(false);
  
  const [showReportWizard, setShowReportWizard] = useState(false);
  const [filterStation, setFilterStation] = useState<string>('ALL');
  const [knownStations, setKnownStations] = useState<{name: string, type: string}[]>(() => storage.getKnownStations());
  const [isLoading, setIsLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error' | 'warn'; text: string } | null>(null);

  // Filter cho danh sách chi tiết
  const [detailFilter, setDetailFilter] = useState<{ type: 'disease'; group: string } | { type: 'transfer' } | { type: 'resting' } | { type: 'resting_now' } | null>(null);
  const [activeTopTab, setActiveTopTab] = useState<'overview' | 'disease' | 'infectious'>('overview');

  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(1);
    return date.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });

  useEffect(() => {
    loadData();
    setKnownStations(storage.getKnownStations());
  }, [refreshTrigger]);

  const loadData = async () => {
    setIsLoading(true);
    if (window.electron) {
        try {
            const data = await window.electron.getAllEncounters();
            setEncounters(data);
            const medList = await window.electron.getInventory(stationConfig.name);
            setMedicines(medList || []);
        } catch (e) {
            console.error("Lỗi tải dữ liệu:", e);
        }
    } else {
        setEncounters(storage.getEncounters());
        setMedicines(storage.getMedicines());
    }
    setIsLoading(false);
  };

  const setStatus = (type: 'success' | 'error' | 'warn', text: string) => {
    setSyncStatus({ type, text });
    setTimeout(() => setSyncStatus(null), 5000);
  };

  // HUB: Nhập file báo cáo lâm sàng (mở dialog từ main process)
  const handleImportClinical = async () => {
    if (!window.electron) return;
    setSyncLoading(true);
    setSyncStatus(null);
    try {
      const result = await window.electron.importClinicalData();
      if (result.success) {
        setStatus('success', `Nhập xong ${result.count} ca từ trạm ${result.sourceStation}.`);
        loadData();
      } else if (result.duplicate) {
        setStatus('warn', result.message || 'File đã được nhập trước đó!');
      } else {
        setStatus(result.message?.includes('hủy') ? 'warn' : 'error', result.message || 'Lỗi nhập file');
      }
    } catch (e: any) {
      setStatus('error', e.message || 'Lỗi kết nối');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleRowClick = async (e: Encounter) => {
    setSelectedEncounter(e);
    
    if (window.electron && window.electron.getClinicalEvents) {
        try {
            const events = await window.electron.getClinicalEvents(e.id);
            setTimeline(events || []);
        } catch (err) {
            console.error("Lỗi lấy timeline:", err);
            setTimeline([]);
        }
    } else {
        setTimeline([]); 
    }

    const isOpen = e.status === EncounterStatus.REST_30 || e.status === EncounterStatus.MONITOR || e.status === EncounterStatus.IN_PROGRESS;
    setIsEditing(isOpen);
    
    setEditPrescriptions([]);
    setInstruction('');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedEncounter(null);
    setEditPrescriptions([]);
    setInstruction('');
    setMedSearch('');
    setTimeline([]);
  };

  const addMedToRx = (medId: string) => {
    if (!editPrescriptions.find(p => p.medId === medId)) {
        setEditPrescriptions([...editPrescriptions, { medId, qty: 1 }]);
    }
    setMedSearch('');
    setShowMedResults(false);
  };

  const removeMedFromRx = (medId: string) => {
    setEditPrescriptions(prev => prev.filter(p => p.medId !== medId));
  };

  const updateRxQty = (medId: string, qty: number) => {
      setEditPrescriptions(prev => prev.map(p => p.medId === medId ? { ...p, qty } : p));
  };

  const handleDeleteEncounter = async (encounterId: string, patientName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Xóa phiếu của "${patientName}"?\nHành động này không thể hoàn tác.`)) return;
    if (window.electron) {
        await window.electron.deleteEncounter(encounterId);
    }
    if (selectedEncounter?.id === encounterId) closeModal();
    loadData();
  };

  const handleUpdateStatus = async (newStatus: EncounterStatus) => {
      if (!selectedEncounter) return;
      
      const updatedData: any = {
          ...selectedEncounter,
          status: newStatus,
          endTime: Date.now(),
          actorName: currentUser ? currentUser.name : 'Unknown Doctor',
          instruction: instruction, 
          prescriptions: editPrescriptions.map(p => {
              const m = medicines.find(med => med.id === p.medId);
              return { 
                  medicineId: p.medId, 
                  medicineName: m?.name || 'Unknown',
                  quantity: p.qty 
              };
          })
      };

      if (window.electron) {
          await window.electron.updateEncounter(updatedData);
      } else {
          storage.updateEncounter(updatedData);
      }
      closeModal();
      loadData();
  };

  const isPrivileged = currentUser?.role === 'ADMIN' || currentUser?.role === 'MODERATOR';

  const stationFiltered = (stationConfig.type === StationType.HUB)
    ? (filterStation === 'ALL' ? encounters : encounters.filter(e => e.stationName === filterStation))
    : encounters.filter(e => e.stationName === stationConfig.name);

  // Staff không thấy đơn bổ sung cuối kỳ; Admin/Mod thấy tất cả
  const visibleEncounters = isPrivileged
    ? stationFiltered
    : stationFiltered.filter(e => !e.isSupplementary);

  const periodStart = new Date(`${startDate}T${startTime}:00`).getTime();
  const periodEnd   = new Date(`${endDate}T${endTime}:59`).getTime();
  const periodFiltered = visibleEncounters
    .filter(e => e.startTime >= periodStart && e.startTime <= periodEnd)
    .sort((a, b) => a.startTime - b.startTime);

  const totalExams = periodFiltered.length;
  const totalTransfers = periodFiltered.filter(e => e.status === EncounterStatus.COMPLETED_TRANSFER).length;
  // Tổng từng nghỉ (dù sau đó đã về làm việc)
  const totalEverRested = periodFiltered.filter((e: any) => e.hadRestAtRoom).length;
  // Hiện đang nghỉ tại phòng
  const totalCurrentlyResting = periodFiltered.filter(e => e.status === EncounterStatus.REST_30 || e.status === EncounterStatus.MONITOR).length;

  const parseInfectiousDiag = (diagnosis: string = '') => {
    const parts = diagnosis.split(' - ');
    return {
      disease: parts[0] || '-',
      group: parts[1]?.replace('Nhóm ', '') || '?',
      isolation: parts.slice(2).join(' - ') || '-'
    };
  };
  const infectiousEncounters = periodFiltered.filter(e => e.diseaseGroup === 'Bệnh truyền nhiễm');
  const infByGroup = { A: 0, B: 0, C: 0 };
  infectiousEncounters.forEach(e => {
    const g = parseInfectiousDiag(e.diagnosis).group;
    if (g === 'A') infByGroup.A++;
    else if (g === 'B') infByGroup.B++;
    else if (g === 'C') infByGroup.C++;
  });

  const diseaseMap: Record<string, number> = {};
  periodFiltered.forEach(e => {
    const group = e.diseaseGroup || 'Chưa phân loại';
    diseaseMap[group] = (diseaseMap[group] || 0) + 1;
  });
  const total = periodFiltered.length;
  const sorted = Object.entries(diseaseMap).sort((a, b) => b[1] - a[1]);
  const top5 = sorted.slice(0, 5);
  const otherCount = sorted.slice(5).reduce((sum, [, v]) => sum + v, 0);
  let pieData: { name: string; value: number }[] = top5.map(([name, value]) => ({ name, value }));
  if (otherCount > 0) pieData.push({ name: 'Khác / 其他', value: otherCount });
  if (pieData.length === 0) pieData.push({ name: 'Chưa có dữ liệu', value: 1 });

  const [tablePage, setTablePage] = React.useState(0);
  React.useEffect(() => { setTablePage(0); }, [detailFilter, startDate, endDate, startTime, endTime]);

  // Danh sách hiển thị theo bộ lọc chi tiết — mới nhất trên cùng
  const fullDisplayList = (activeTopTab === 'infectious'
    ? infectiousEncounters
    : detailFilter === null
      ? periodFiltered
      : detailFilter.type === 'transfer'
        ? periodFiltered.filter(e => e.status === EncounterStatus.COMPLETED_TRANSFER)
        : detailFilter.type === 'resting'
          ? periodFiltered.filter((e: any) => e.hadRestAtRoom)
        : detailFilter.type === 'resting_now'
          ? periodFiltered.filter(e => e.status === EncounterStatus.REST_30 || e.status === EncounterStatus.MONITOR)
          : periodFiltered.filter(e => {
              if (detailFilter.group === 'Khác / 其他') {
                const top5Names = top5.map(([name]) => name);
                return !top5Names.includes(e.diseaseGroup || 'Chưa phân loại');
              }
              return (e.diseaseGroup || 'Chưa phân loại') === detailFilter.group;
            })
  ).slice().reverse();

  const PAGE_SIZE = 50;
  const totalPages = Math.ceil(fullDisplayList.length / PAGE_SIZE);
  const displayList = fullDisplayList.slice(tablePage * PAGE_SIZE, (tablePage + 1) * PAGE_SIZE);

  const detailFilterLabel = detailFilter === null ? null
    : detailFilter.type === 'transfer' ? 'Chuyển viện / 转院'
    : detailFilter.group;

  const filteredMedicines = medicines.filter(m => m.name.toLowerCase().includes(medSearch.toLowerCase()));

  // 👇 [NÂNG CẤP] Hàm xuất Excel theo dạng ma trận thuốc (Pivot)
  const handleExportExcel = () => {
    // 1. Lấy danh sách tên thuốc — dùng đúng thứ tự đã lưu từ file Excel import
    // Nếu chưa có saved order → fallback về toàn bộ inventory
    const savedOrder = storage.getMedicineOrder();
    const allFromInventory = medicines.map(m => m.name);
    const allMedicineNames = savedOrder.length > 0
      ? savedOrder.filter(name => allFromInventory.includes(name))
      : allFromInventory;

    // 2. Chuẩn bị dữ liệu hàng
    const data = periodFiltered.map((e, idx) => {
        const startDate = new Date(e.startTime);
        const endDate = e.endTime ? new Date(e.endTime) : null;
        const row: any = {
            'STT': idx + 1,
            'Ngày vào khám': `${String(startDate.getDate()).padStart(2,'0')}/${String(startDate.getMonth()+1).padStart(2,'0')}/${startDate.getFullYear()}`,
            'Mã NV': e.patientId,
            'Họ và tên': e.patientName,
            'Chẩn đoán': e.diagnosis || '-',
            'Nhóm bệnh': e.diseaseGroup || '-',
            'Giờ vào': fmtTime(e.startTime),
            'Giờ ra': e.endTime ? fmtTime(e.endTime) : '-',
        };

        // 3. Với mỗi thuốc trong kho, kiểm tra xem bệnh nhân có dùng không
        allMedicineNames.forEach(medName => {
            const usedMed = e.prescriptions?.find(p => p.medicineName === medName);
            row[medName] = usedMed ? usedMed.quantity : "";
        });

        return row;
    });

    const ws = XLSX.utils.json_to_sheet(data);

    // Tự động chỉnh độ rộng cột
    const wscols = [
        {wch: 5}, {wch: 14}, {wch: 12}, {wch: 25}, {wch: 30}, {wch: 22}, {wch: 10}, {wch: 10}
    ];
    allMedicineNames.forEach(() => wscols.push({wch: 15}));
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Báo cáo chi tiết");
    XLSX.writeFile(wb, `Bao_cao_SmartMedical_${startDate}_den_${endDate}.xlsx`);
  };

  return (
    <div className="flex flex-col h-full gap-4 relative">
       {showReportWizard && (
         <ReportWizard
           encounters={encounters}
           medicines={medicines}
           stationConfig={stationConfig}
           onClose={() => setShowReportWizard(false)}
         />
       )}
       {showModal && selectedEncounter && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[95vh]">
                
                <div className={`p-4 flex justify-between items-center text-white ${isEditing ? 'bg-orange-500' : 'bg-medical-green'}`}>
                    <div>
                        <h2 className="text-xl font-bold uppercase flex items-center">
                            <FileText className="mr-2"/> 
                            {isEditing ? 'THÊM Y LỆNH & ĐIỀU TRỊ / 增加医嘱和治疗' : 'HỒ SƠ BỆNH ÁN / 病历'}
                        </h2>
                        <p className="text-sm opacity-90">{selectedEncounter.patientName} - {selectedEncounter.patientId}</p>
                    </div>
                    <button onClick={closeModal} className="hover:bg-white/20 p-2 rounded-full transition"><X size={24}/></button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    <div className="w-1/2 p-6 overflow-y-auto border-r bg-white">
                        <div className="bg-gray-50 p-4 rounded-lg border mb-6">
                            <div className="grid grid-cols-2 gap-4 text-sm text-gray-700">
                                 <div><span className="text-gray-400 block">Giờ vào:</span> <strong>{fmtDT(selectedEncounter.startTime)}</strong></div>
                                 <div><span className="text-gray-400 block">Trạm:</span> <strong>{selectedEncounter.stationName}</strong></div>
                                 <div className="col-span-2"><span className="text-gray-400 block">Triệu chứng:</span> <div className="font-bold text-red-600">{selectedEncounter.symptoms.join(', ')}</div></div>
                            </div>
                        </div>
                        
                        {isEditing ? (
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2 uppercase">Y lệnh / Hướng dẫn điều trị mới (医嘱)</label>
                                    <textarea 
                                        className="w-full p-3 border-2 rounded-lg h-24 focus:border-orange-500 outline-none transition-all"
                                        placeholder="Nhập hướng dẫn điều trị lượt này..."
                                        value={instruction}
                                        onChange={e => setInstruction(e.target.value)}
                                    />
                                </div>

                                <div>
                                    <h4 className="font-bold text-gray-700 mb-2 flex items-center uppercase text-sm"><Plus size={16} className="mr-1"/> Kê thêm thuốc (追加药物)</h4>
                                    <div className="relative mb-4">
                                        <div className="flex items-center border-2 rounded-lg px-3 py-2 bg-white focus-within:ring-2 ring-orange-500">
                                            <Search size={18} className="text-gray-400 mr-2"/>
                                            <input className="flex-1 outline-none" placeholder="Tìm tên thuốc muốn cho thêm..." value={medSearch} onChange={e => { setMedSearch(e.target.value); setShowMedResults(true); }}/>
                                        </div>
                                        {showMedResults && medSearch && (
                                            <div className="absolute z-10 w-full bg-white shadow-xl border rounded mt-1 max-h-40 overflow-y-auto">
                                                    {filteredMedicines.map(m => (
                                                        <div key={m.id} className="p-3 hover:bg-blue-50 cursor-pointer border-b" onClick={() => addMedToRx(m.id)}>
                                                            <div className="font-bold">{m.name}</div>
                                                            <div className="text-xs text-gray-500">Kho hiện tại: {m.stock} {m.unit}</div>
                                                        </div>
                                                    ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        {editPrescriptions.map(rx => {
                                            const m = medicines.find(med => med.id === rx.medId);
                                            return (
                                                <div key={rx.medId} className="flex justify-between items-center bg-orange-50 p-3 rounded-lg border border-orange-200">
                                                    <div>
                                                        <div className="font-bold text-gray-800">{m?.name || "Unknown"}</div>
                                                        <div className="text-xs text-orange-600 font-medium italic">Sẽ trừ thêm vào kho / 将扣减库存</div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <input type="number" value={rx.qty} min={1} onChange={(e) => updateRxQty(rx.medId, parseInt(e.target.value))} className="w-16 p-1 border-2 rounded text-center font-bold"/>
                                                        <button onClick={() => removeMedFromRx(rx.medId)} className="text-red-500 hover:bg-red-100 p-1 rounded"><Trash2 size={20}/></button>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                        {editPrescriptions.length === 0 && <div className="text-center text-gray-400 text-sm italic border-2 border-dashed p-4 rounded-lg">Chưa chọn thuốc cho lượt này / 未选择本次用药</div>}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="border-t pt-4">
                                <h4 className="font-bold text-gray-700 mb-4 uppercase text-sm">Tổng hợp thuốc đã dùng / 用药汇总</h4>
                                <div className="bg-gray-50 p-4 rounded-xl border">
                                    <ul className="space-y-3">
                                        {selectedEncounter.prescriptions?.map((p, idx) => (
                                            <li key={idx} className="flex justify-between border-b border-gray-200 pb-2">
                                                <span className="font-bold text-gray-800">{p.medicineName}</span> 
                                                <span className="bg-medical-green text-white px-3 py-0.5 rounded-full text-xs font-bold">SL: {p.quantity}</span>
                                            </li>
                                        ))}
                                        {(!selectedEncounter.prescriptions || selectedEncounter.prescriptions.length === 0) && <li className="text-gray-400 italic">Không sử dụng thuốc / 未使用药物</li>}
                                    </ul>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="w-1/2 p-6 overflow-y-auto bg-gray-50/50">
                        <h4 className="font-bold text-gray-700 mb-4 flex items-center border-b pb-2 uppercase text-sm">
                            <Activity size={18} className="mr-2 text-blue-600"/> Nhật ký diễn biến chi tiết / 过程记录
                        </h4>
                        <div className="space-y-6 relative ml-2 before:absolute before:left-[7px] before:top-2 before:bottom-0 before:w-0.5 before:bg-gray-200">
                            {timeline.length > 0 ? timeline.map((evt, idx) => (
                                <div key={idx} className="relative pl-8">
                                    <div className={`absolute left-0 top-1 w-4 h-4 rounded-full border-2 border-white shadow-sm ${evt.action_type === 'CHECK_IN' ? 'bg-green-500' : 'bg-blue-500'}`}></div>
                                    <div className="flex flex-col">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-xs font-bold text-gray-500 flex items-center">
                                                <Clock size={12} className="mr-1"/> {fmtDT(evt.timestamp)}
                                            </span>
                                            <span className="text-[10px] bg-gray-200 px-2 py-0.5 rounded text-gray-600 font-bold flex items-center">
                                                <UserIcon size={10} className="mr-1"/> {evt.actor_name}
                                            </span>
                                        </div>
                                        <div className="bg-white p-3 rounded-lg border shadow-sm border-l-4 border-l-blue-400">
                                            <div className="font-bold text-sm text-gray-800 mb-1">
                                                {evt.action_type === 'CHECK_IN' ? '➡️ Tiếp nhận / 接诊' : '📝 Y lệnh & Cập nhật / 医嘱更新'}
                                            </div>
                                            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                                                {evt.details}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )) : (
                                <div className="text-center text-gray-400 italic py-10">Chưa có dữ liệu lịch sử / 暂无历史记录</div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-gray-100 border-t flex justify-end gap-3">
                    {isEditing ? (
                        <>
                            <button onClick={() => handleUpdateStatus(EncounterStatus.REST_30)} className="px-6 py-2 bg-yellow-500 text-white rounded-lg font-bold hover:bg-yellow-600 shadow-sm"><span>Lưu & Cho nghỉ 30p<span className="block text-[9px] font-normal opacity-80 leading-tight">保存并休息30分</span></span></button>
                            <button onClick={() => handleUpdateStatus(EncounterStatus.COMPLETED_WORK)} className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-sm"><span>Hoàn thành & Về làm việc<span className="block text-[9px] font-normal opacity-80 leading-tight">完成并返岗</span></span></button>
                            <button onClick={() => handleUpdateStatus(EncounterStatus.COMPLETED_TRANSFER)} className="px-6 py-2 bg-gray-600 text-white rounded-lg font-bold hover:bg-gray-700 shadow-sm"><span>Chuyển viện<span className="block text-[9px] font-normal opacity-80 leading-tight">转院</span></span></button>
                        </>
                    ) : (
                        <button onClick={closeModal} className="px-8 py-2 bg-gray-300 text-gray-700 rounded-lg font-bold hover:bg-gray-400"><span>Đóng<span className="block text-[9px] font-normal opacity-80 leading-tight">关闭</span></span></button>
                    )}
                </div>
            </div>
         </div>
       )}

       {/* ── TOP SECTION: Tab layout ── */}
       <div className="bg-white rounded-xl shadow-sm flex flex-col" style={{ height: '200px', minHeight: '200px', flexShrink: 0 }}>
         {/* Tab bar + date picker + buttons */}
         <div className="flex items-center gap-3 px-4 pt-2 pb-0 border-b shrink-0 flex-wrap">
           <div className="flex gap-1">
             <button onClick={() => setActiveTopTab('overview')} className={`px-3 py-1.5 rounded-t-lg text-xs font-bold transition border-b-2 ${activeTopTab === 'overview' ? 'border-green-500 text-green-700 bg-green-50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Tổng quan<span className="block text-[9px] font-normal opacity-70 leading-tight">总览</span></button>
             <button onClick={() => setActiveTopTab('disease')} className={`px-3 py-1.5 rounded-t-lg text-xs font-bold transition border-b-2 ${activeTopTab === 'disease' ? 'border-blue-500 text-blue-700 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Cơ cấu bệnh tật<span className="block text-[9px] font-normal opacity-70 leading-tight">疾病分布</span></button>
             <button onClick={() => setActiveTopTab('infectious')} className={`px-3 py-1.5 rounded-t-lg text-xs font-bold transition border-b-2 flex items-center gap-1 ${activeTopTab === 'infectious' ? 'border-red-500 text-red-700 bg-red-50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
               <span>🦠 Bệnh truyền nhiễm<span className="block text-[9px] font-normal opacity-70 leading-tight">传染病</span></span>
               {infectiousEncounters.length > 0 && <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full">{infectiousEncounters.length}</span>}
             </button>
           </div>
           <div className="flex items-center gap-1.5 text-xs ml-auto flex-wrap">
             <Calendar size={13} className="text-gray-400 shrink-0"/>
             <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border rounded px-1.5 py-1 text-xs"/>
             <TimeInput value={startTime} onChange={setStartTime} />
             <span className="text-gray-400">→</span>
             <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border rounded px-1.5 py-1 text-xs"/>
             <TimeInput value={endTime} onChange={setEndTime} />
             {stationConfig.type === StationType.HUB && (
               <button onClick={handleImportClinical} disabled={syncLoading} className={`flex items-center text-xs px-2 py-1 rounded text-white font-bold ml-2 ${syncLoading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
                 {syncLoading ? <RefreshCw size={11} className="mr-1 animate-spin"/> : <Upload size={11} className="mr-1"/>}
                 {syncLoading ? 'Đang xử lý...' : <span>Nhập BC<span className="block text-[9px] font-normal opacity-80 leading-tight">导入</span></span>}
               </button>
             )}
             {syncStatus && (
               <span className={`text-[10px] font-bold flex items-center gap-0.5 ${syncStatus.type === 'success' ? 'text-green-600' : syncStatus.type === 'warn' ? 'text-yellow-600' : 'text-red-600'}`}>
                 {syncStatus.type === 'success' ? <CheckCircle size={10}/> : <AlertCircle size={10}/>}
                 {syncStatus.text}
               </span>
             )}
           </div>
         </div>

         {/* Tab content */}
         <div className="flex-1 min-h-0 overflow-hidden">
           {activeTopTab === 'overview' ? (
             <div className="h-full flex items-stretch gap-3 px-4 py-3">
               <div className="flex-1 bg-blue-50 rounded-xl flex flex-col items-center justify-center">
                 <span className="text-3xl font-bold text-blue-700">{totalExams}</span>
                 <span className="text-xs text-gray-500 mt-1">Lượt khám</span>
                 <span className="text-[10px] text-blue-400 mt-0.5">就诊人数</span>
               </div>
               <div
                 onClick={() => setDetailFilter(prev => prev?.type === 'transfer' ? null : { type: 'transfer' })}
                 className={`flex-1 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all hover:ring-2 hover:ring-orange-400 ${detailFilter?.type === 'transfer' ? 'bg-orange-200 ring-2 ring-orange-500' : 'bg-orange-50'}`}
               >
                 <span className="text-3xl font-bold text-orange-700">{totalTransfers}</span>
                 <span className="text-xs text-gray-500 mt-1">Chuyển viện / 转院</span>
                 <span className="text-[10px] text-orange-400 mt-0.5">nhấn để lọc / 点击筛选</span>
               </div>
               <div
                 onClick={() => setDetailFilter(prev => prev?.type === 'resting' ? null : { type: 'resting' })}
                 className={`flex-1 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all hover:ring-2 hover:ring-yellow-400 ${detailFilter?.type === 'resting' ? 'bg-yellow-200 ring-2 ring-yellow-500' : 'bg-yellow-50'}`}
               >
                 <span className="text-3xl font-bold text-yellow-700">{totalEverRested}</span>
                 <span className="text-xs text-gray-500 mt-1">Tổng đã nghỉ phòng / 累计休息</span>
                 <span className="text-[10px] text-yellow-400 mt-0.5">nhấn để lọc / 点击筛选</span>
               </div>
               <div
                 onClick={() => setDetailFilter(prev => prev?.type === 'resting_now' ? null : { type: 'resting_now' })}
                 className={`flex-1 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all hover:ring-2 hover:ring-amber-400 ${detailFilter?.type === 'resting_now' ? 'bg-amber-200 ring-2 ring-amber-500' : 'bg-amber-50'}`}
               >
                 <span className="text-3xl font-bold text-amber-700">{totalCurrentlyResting}</span>
                 <span className="text-xs text-gray-500 mt-1">Đang nghỉ tại phòng / 当前休息</span>
                 <span className="text-[10px] text-amber-400 mt-0.5">nhấn để lọc / 点击筛选</span>
               </div>
             </div>
           ) : activeTopTab === 'infectious' ? (
             <div className="h-full flex items-stretch gap-3 px-4 py-3">
               <div className="flex-1 bg-red-50 border border-red-200 rounded-xl flex flex-col items-center justify-center">
                 <span className="text-3xl font-bold text-red-700">{infectiousEncounters.length}</span>
                 <span className="text-xs text-gray-500 mt-1">Tổng ca BTN / 传染病总计</span>
               </div>
               <div className="flex-1 bg-red-100 rounded-xl flex flex-col items-center justify-center">
                 <span className="text-3xl font-bold text-red-800">{infByGroup.A}</span>
                 <span className="text-xs text-gray-500 mt-1">Nhóm A / 甲类</span>
                 <span className="text-[10px] text-red-600 font-bold mt-0.5">Đặc biệt nguy hiểm / 特别危险</span>
               </div>
               <div className="flex-1 bg-orange-100 rounded-xl flex flex-col items-center justify-center">
                 <span className="text-3xl font-bold text-orange-700">{infByGroup.B}</span>
                 <span className="text-xs text-gray-500 mt-1">Nhóm B / 乙类</span>
                 <span className="text-[10px] text-orange-500 font-bold mt-0.5">Nguy hiểm / 危险</span>
               </div>
               <div className="flex-1 bg-yellow-100 rounded-xl flex flex-col items-center justify-center">
                 <span className="text-3xl font-bold text-yellow-700">{infByGroup.C}</span>
                 <span className="text-xs text-gray-500 mt-1">Nhóm C / 丙类</span>
                 <span className="text-[10px] text-yellow-600 font-bold mt-0.5">Ít nguy hiểm / 较低风险</span>
               </div>
             </div>
           ) : (
             <div className="h-full flex min-h-0">
               <div className="w-[35%] min-h-0">
                 <ResponsiveContainer width="100%" height="100%">
                   <PieChart>
                     <Pie data={pieData} cx="50%" cy="50%" innerRadius={38} outerRadius={70} paddingAngle={3} dataKey="value" cursor="pointer"
                       onClick={(data) => { const group = data.name as string; setDetailFilter(prev => prev?.type === 'disease' && prev.group === group ? null : { type: 'disease', group }); }}>
                       {pieData.map((entry, index) => (
                         <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]}
                           opacity={detailFilter?.type === 'disease' && detailFilter.group !== entry.name ? 0.35 : 1}
                           stroke={detailFilter?.type === 'disease' && detailFilter.group === entry.name ? '#1a1a1a' : 'none'} strokeWidth={2}/>
                       ))}
                     </Pie>
                     <Tooltip formatter={(value: number) => [`${value} ca (${total > 0 ? Math.round(value / total * 100) : 0}%)`, 'Số ca']}/>
                   </PieChart>
                 </ResponsiveContainer>
               </div>
               <div className="flex-1 flex flex-col justify-center gap-1 px-2 py-2 overflow-y-auto">
                 {pieData.map((entry, index) => {
                   const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0;
                   const isActive = detailFilter?.type === 'disease' && detailFilter.group === entry.name;
                   return (
                     <button key={entry.name} onClick={() => setDetailFilter(prev => prev?.type === 'disease' && prev.group === entry.name ? null : { type: 'disease', group: entry.name })}
                       className={`flex items-center gap-2 text-left w-full rounded px-2 py-0.5 transition-all text-xs ${isActive ? 'bg-gray-100 ring-1 ring-gray-300' : 'hover:bg-gray-50'}`}>
                       <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                       <span className="font-medium text-gray-700 truncate flex-1">{entry.name}</span>
                       <span className="font-bold text-gray-500 shrink-0">{entry.value} ca</span>
                       <span className="font-bold shrink-0 w-8 text-right" style={{ color: COLORS[index % COLORS.length] }}>{pct}%</span>
                     </button>
                   );
                 })}
               </div>
               {stationConfig.type === StationType.HUB && (
                 <div className="w-[180px] flex flex-col items-center justify-center gap-2 px-3 border-l border-gray-100">
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Lọc trạm / 站点筛选</p>
                   <select className="w-full bg-gray-50 border border-gray-200 text-xs font-bold rounded-lg px-2 py-2 text-center focus:outline-none focus:ring-2 focus:ring-green-400 cursor-pointer"
                     value={filterStation} onChange={(e) => setFilterStation(e.target.value)}>
                     <option value="ALL">🏢 Tất cả trạm / 所有站点</option>
                     {knownStations.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                   </select>
                 </div>
               )}
             </div>
           )}
         </div>
       </div>

       <div className="flex-1 bg-white rounded-xl shadow-sm flex flex-col overflow-hidden">
          <div className="flex justify-between items-center p-4 border-b bg-gray-50">
              <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold text-gray-800">Danh sách chi tiết / 详细列表</h3>
                  {detailFilterLabel && (
                      <div className="flex items-center gap-2 bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full">
                          <span>Lọc: {detailFilterLabel} ({displayList.length} ca)</span>
                          <button
                              onClick={() => setDetailFilter(null)}
                              title="Xóa bộ lọc"
                              className="hover:bg-blue-200 rounded-full p-0.5 transition"
                          >
                              <X size={12}/>
                          </button>
                      </div>
                  )}
              </div>
              <div className="flex gap-2">
                {detailFilter !== null && (
                    <button
                        onClick={() => setDetailFilter(null)}
                        className="flex items-center text-sm bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200 transition font-bold shadow-sm"
                    >
                        <X size={14} className="mr-1"/><span>Xóa bộ lọc<span className="block text-[9px] font-normal opacity-80 leading-tight">清除筛选</span></span>
                    </button>
                )}
                <button onClick={loadData} disabled={isLoading} className={`p-2 text-gray-500 hover:bg-gray-200 rounded-lg transition ${isLoading ? 'animate-spin' : ''}`}><RefreshCw size={20}/></button>
                <button onClick={handleExportExcel} className="flex items-center text-sm bg-green-100 text-green-800 px-4 py-2 rounded-lg hover:bg-green-200 transition font-bold shadow-sm"><Download size={16} className="mr-2 shrink-0"/><span>Xuất Excel<span className="block text-[9px] font-normal opacity-80 leading-tight">导出Excel</span></span></button>
                <button onClick={() => setShowReportWizard(true)} className="flex items-center text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition font-bold shadow-sm"><FileBarChart2 size={16} className="mr-2 shrink-0"/><span>Xuất báo cáo<span className="block text-[9px] font-normal opacity-80 leading-tight">导出报告</span></span></button>
              </div>
          </div>
          <div className="flex-1 overflow-auto">
             <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-gray-100 text-gray-500 sticky top-0 z-10 shadow-sm">
                   <tr>
                      <th className="py-2 px-2 font-semibold">#</th>
                      <th className="py-2 px-2 font-semibold">Mã NV / 工号</th>
                      <th className="py-2 px-2 font-semibold">Họ tên / 姓名</th>
                      <th className="py-2 px-2 font-semibold">Giờ vào / 入站</th>
                      <th className="py-2 px-2 font-semibold">Chẩn đoán / 诊断</th>
                      <th className="py-2 px-2 font-semibold">Nhóm bệnh / 疾病组</th>
                      <th className="py-2 px-2 font-semibold">Giờ ra / 出站</th>
                      <th className="py-2 px-2 font-semibold">Trạng thái / 状态</th>
                      <th className="py-2 px-2 font-semibold">Trạm</th>
                      <th className="py-2 px-2 w-8"></th>
                   </tr>
                </thead>
                <tbody className="divide-y">
                   {displayList.map((e, idx) => {
                      const fmtTime = (ts: number) => {
                        const d = new Date(ts);
                        const hh = String(d.getHours()).padStart(2,'0');
                        const mm = String(d.getMinutes()).padStart(2,'0');
                        const dd = String(d.getDate()).padStart(2,'0');
                        const mo = String(d.getMonth()+1).padStart(2,'0');
                        return `${dd}/${mo} ${hh}:${mm}`;
                      };
                      const statusShort = (s: string) => {
                        if (s === EncounterStatus.COMPLETED_TRANSFER) return { label: 'Chuyển viện / 转院', cls: 'bg-orange-100 text-orange-700' };
                        if (s === EncounterStatus.REST_30) return { label: 'Nghỉ phòng / 休息', cls: 'bg-yellow-100 text-yellow-700' };
                        if (s === EncounterStatus.MONITOR) return { label: 'Theo dõi / 观察', cls: 'bg-purple-100 text-purple-700' };
                        if (s === EncounterStatus.IN_PROGRESS) return { label: 'Đang khám / 就诊中', cls: 'bg-blue-100 text-blue-700' };
                        return { label: 'Về làm việc / 返岗', cls: 'bg-gray-100 text-gray-600' };
                      };
                      const st = statusShort(e.status);
                      return (
                      <tr key={e.id} onClick={() => handleRowClick(e)} className={`cursor-pointer transition-colors group ${e.isSupplementary ? 'bg-amber-50 hover:bg-amber-100 border-l-4 border-amber-400' : 'hover:bg-blue-50'}`}>
                         <td className="py-1.5 px-2 text-gray-400">{tablePage * PAGE_SIZE + idx + 1}</td>
                         <td className="py-1.5 px-2 font-mono font-bold text-gray-600">{e.patientId}</td>
                         <td className="py-1.5 px-2 font-medium text-blue-600 whitespace-nowrap">
                           {e.patientName}
                           {e.isSupplementary ? <span className="ml-1.5 text-[9px] bg-amber-200 text-amber-800 px-1 py-0.5 rounded font-bold">BS</span> : null}
                         </td>
                         <td className="py-1.5 px-2 text-gray-600 whitespace-nowrap">{fmtTime(e.startTime)}</td>
                         <td className="py-1.5 px-2 text-gray-800 truncate max-w-[140px]" title={e.diagnosis}>{e.diagnosis || '-'}</td>
                         <td className="py-1.5 px-2 text-gray-500 truncate max-w-[120px]">{e.diseaseGroup || '-'}</td>
                         <td className="py-1.5 px-2 text-gray-600 whitespace-nowrap">{e.endTime ? fmtTime(e.endTime) : '-'}</td>
                         <td className="py-1.5 px-2">
                           <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${st.cls}`}>{st.label}</span>
                         </td>
                         <td className="py-1.5 px-2 text-gray-400 whitespace-nowrap">{e.stationName}</td>
                         <td className="py-1.5 px-2" onClick={ev => ev.stopPropagation()}>
                           <button onClick={(ev) => handleDeleteEncounter(e.id, e.patientName, ev)} title="Xóa"
                             className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-100">
                             <Trash2 size={13}/>
                           </button>
                         </td>
                      </tr>
                      );
                   })}
                   {displayList.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-gray-400">Không có dữ liệu</td></tr>}
                </tbody>
             </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t bg-gray-50 text-sm text-gray-600">
              <span>{tablePage * PAGE_SIZE + 1}–{Math.min((tablePage + 1) * PAGE_SIZE, fullDisplayList.length)} / {fullDisplayList.length} ca</span>
              <div className="flex gap-1">
                <button disabled={tablePage === 0} onClick={() => setTablePage(0)} className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-gray-200">«</button>
                <button disabled={tablePage === 0} onClick={() => setTablePage(p => p - 1)} className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-gray-200">‹</button>
                <span className="px-3 py-1 font-medium">Trang {tablePage + 1}/{totalPages}</span>
                <button disabled={tablePage >= totalPages - 1} onClick={() => setTablePage(p => p + 1)} className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-gray-200">›</button>
                <button disabled={tablePage >= totalPages - 1} onClick={() => setTablePage(totalPages - 1)} className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-gray-200">»</button>
              </div>
            </div>
          )}
       </div>
    </div>
  );
};