import React, { useState, useEffect, useRef } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { storage } from '../services/storage';
// [FIX 1] Đổi tên User thành UserIcon để tránh trùng kiểu dữ liệu
import { Download, FileText, Activity, X, Calendar, RefreshCw, Plus, Search, Trash2, Save, Upload, Clock, User as UserIcon } from 'lucide-react';
// [FIX 2] Thêm User vào import type
import { Encounter, EncounterStatus, StationConfig, StationType, Medicine, User } from '../types';
import { STATION_PRESETS } from '../constants';
import * as XLSX from 'xlsx';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF0000'];

interface ReportsProps {
  stationConfig: StationConfig;
  currentUser: User | null; 
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

export const Reports: React.FC<ReportsProps> = ({ stationConfig, currentUser }) => {
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
  
  const [filterStation, setFilterStation] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(1);
    return date.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    loadData();
  }, []);

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

  const handleSendReport = async () => {
    if (!window.electron) return;
    setSyncLoading(true);
    setSyncStatus('Đang gửi...');
    try {
      const result = await window.electron.triggerSendSync();
      if (result.success) {
        setSyncStatus('✅ Gửi thành công!');
        setTimeout(() => setSyncStatus(''), 3000);
      } else {
        setSyncStatus(`❌ Lỗi: ${result.message}`);
      }
    } catch (e) {
      setSyncStatus('❌ Lỗi kết nối');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!window.electron) return;

    setSyncStatus('Đang đọc file...');
    setSyncLoading(true);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      if (content) {
        try {
          const result = await window.electron.importManualData(content);
          if (result.success) {
            setSyncStatus(`✅ Nhập xong ${result.count} ca!`);
            setTimeout(() => setSyncStatus(''), 3000);
            loadData(); 
          } else {
            setSyncStatus(`❌ Lỗi: ${result.message}`);
          }
        } catch (err) {
          setSyncStatus('❌ Lỗi xử lý file');
        }
      }
      setSyncLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = ''; 
    };
    reader.readAsText(file);
  };

  const triggerImport = () => {
    fileInputRef.current?.click();
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

  const stationFiltered = (stationConfig.type === StationType.HUB)
    ? (filterStation === 'ALL' ? encounters : encounters.filter(e => e.stationName === filterStation))
    : encounters.filter(e => e.stationName === stationConfig.name);

  const periodFiltered = stationFiltered.filter(e => {
      const eDate = new Date(e.startTime).toISOString().slice(0, 10);
      return eDate >= startDate && eDate <= endDate;
  });

  const totalExams = periodFiltered.length;
  const totalTransfers = periodFiltered.filter(e => e.status === EncounterStatus.COMPLETED_TRANSFER).length;
  const totalResting = periodFiltered.filter(e => e.status === EncounterStatus.REST_30 || e.status === EncounterStatus.MONITOR).length;

  const diseaseMap: Record<string, number> = {};
  periodFiltered.forEach(e => {
    const group = e.diseaseGroup || 'Chưa phân loại';
    diseaseMap[group] = (diseaseMap[group] || 0) + 1;
  });
  const pieData = Object.keys(diseaseMap).map(key => ({ name: key, value: diseaseMap[key] }));
  if (pieData.length === 0) pieData.push({ name: 'Chưa có dữ liệu', value: 1 });

  const filteredMedicines = medicines.filter(m => m.name.toLowerCase().includes(medSearch.toLowerCase()));

  // 👇 [NÂNG CẤP] Hàm xuất Excel theo dạng ma trận thuốc (Pivot)
  const handleExportExcel = () => {
    // 1. Lấy danh sách tên thuốc duy nhất hiện có trong kho làm tiêu đề cột
    const allMedicineNames = medicines.map(m => m.name);

    // 2. Chuẩn bị dữ liệu hàng
    const data = periodFiltered.map((e, idx) => {
        const row: any = {
            'STT': idx + 1,
            'ID': e.patientId,
            'Họ và tên': e.patientName,
            'Giờ vào': new Date(e.startTime).toLocaleString(),
            'Giờ ra': e.endTime ? new Date(e.endTime).toLocaleString() : '-',
            'Chẩn đoán': e.diagnosis || '-',
            'Nhóm bệnh': e.diseaseGroup || '-',
            'Trạng thái cuối': getStatusLabel(e.status)
        };

        // 3. Với mỗi thuốc trong kho, kiểm tra xem bệnh nhân có dùng không
        allMedicineNames.forEach(medName => {
            const usedMed = e.prescriptions?.find(p => p.medicineName === medName);
            row[medName] = usedMed ? usedMed.quantity : ""; // Điền số lượng hoặc để trống
        });

        return row;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    
    // Tự động chỉnh độ rộng cột
    const wscols = [
        {wch: 5}, {wch: 15}, {wch: 25}, {wch: 22}, {wch: 22}, {wch: 30}, {wch: 20}, {wch: 25}
    ];
    allMedicineNames.forEach(() => wscols.push({wch: 15}));
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Báo cáo chi tiết");
    XLSX.writeFile(wb, `Bao_cao_SmartMedical_${startDate}_den_${endDate}.xlsx`);
  };

  return (
    <div className="flex flex-col h-full gap-4 relative">
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
                                 <div><span className="text-gray-400 block">Giờ vào:</span> <strong>{new Date(selectedEncounter.startTime).toLocaleString()}</strong></div>
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
                                                        <div className="text-xs text-orange-600 font-medium italic">Sẽ trừ thêm vào kho</div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <input type="number" value={rx.qty} min={1} onChange={(e) => updateRxQty(rx.medId, parseInt(e.target.value))} className="w-16 p-1 border-2 rounded text-center font-bold"/>
                                                        <button onClick={() => removeMedFromRx(rx.medId)} className="text-red-500 hover:bg-red-100 p-1 rounded"><Trash2 size={20}/></button>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                        {editPrescriptions.length === 0 && <div className="text-center text-gray-400 text-sm italic border-2 border-dashed p-4 rounded-lg">Chưa chọn thuốc cho lượt này</div>}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="border-t pt-4">
                                <h4 className="font-bold text-gray-700 mb-4 uppercase text-sm">Tổng hợp thuốc đã dùng</h4>
                                <div className="bg-gray-50 p-4 rounded-xl border">
                                    <ul className="space-y-3">
                                        {selectedEncounter.prescriptions?.map((p, idx) => (
                                            <li key={idx} className="flex justify-between border-b border-gray-200 pb-2">
                                                <span className="font-bold text-gray-800">{p.medicineName}</span> 
                                                <span className="bg-medical-green text-white px-3 py-0.5 rounded-full text-xs font-bold">SL: {p.quantity}</span>
                                            </li>
                                        ))}
                                        {(!selectedEncounter.prescriptions || selectedEncounter.prescriptions.length === 0) && <li className="text-gray-400 italic">Không sử dụng thuốc</li>}
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
                                                <Clock size={12} className="mr-1"/> {new Date(evt.timestamp).toLocaleString()}
                                            </span>
                                            <span className="text-[10px] bg-gray-200 px-2 py-0.5 rounded text-gray-600 font-bold flex items-center">
                                                <UserIcon size={10} className="mr-1"/> {evt.actor_name}
                                            </span>
                                        </div>
                                        <div className="bg-white p-3 rounded-lg border shadow-sm border-l-4 border-l-blue-400">
                                            <div className="font-bold text-sm text-gray-800 mb-1">
                                                {evt.action_type === 'CHECK_IN' ? '➡️ Tiếp nhận' : '📝 Y lệnh & Cập nhật'}
                                            </div>
                                            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                                                {evt.details}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )) : (
                                <div className="text-center text-gray-400 italic py-10">Chưa có dữ liệu lịch sử</div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-gray-100 border-t flex justify-end gap-3">
                    {isEditing ? (
                        <>
                            <button onClick={() => handleUpdateStatus(EncounterStatus.REST_30)} className="px-6 py-2 bg-yellow-500 text-white rounded-lg font-bold hover:bg-yellow-600 shadow-sm">Lưu & Cho nghỉ 30p</button>
                            <button onClick={() => handleUpdateStatus(EncounterStatus.COMPLETED_WORK)} className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-sm">Hoàn thành & Về làm việc</button>
                            <button onClick={() => handleUpdateStatus(EncounterStatus.COMPLETED_TRANSFER)} className="px-6 py-2 bg-gray-600 text-white rounded-lg font-bold hover:bg-gray-700 shadow-sm">Chuyển viện</button>
                        </>
                    ) : (
                        <button onClick={closeModal} className="px-8 py-2 bg-gray-300 text-gray-700 rounded-lg font-bold hover:bg-gray-400">Đóng</button>
                    )}
                </div>
            </div>
         </div>
       )}

       <div className="h-1/4 min-h-[220px] flex gap-4">
           <div className="w-1/3 bg-white p-4 rounded-xl shadow-sm flex flex-col justify-between">
               <div className="flex justify-between items-start border-b pb-2">
                   <h3 className="font-bold text-gray-700 flex items-center text-sm uppercase"><Activity className="mr-2 text-medical-green" /> Tổng quan / 概览</h3>
                   <div className="flex flex-col items-end gap-1">
                       <div className="flex gap-2">
                           {stationConfig.type === StationType.HUB && (
                               <>
                                   <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".dat,.json,.txt"/>
                                   <button onClick={triggerImport} disabled={syncLoading} className="flex items-center text-xs px-2 py-1 rounded text-gray-700 bg-gray-200 hover:bg-gray-300 font-bold transition-all">
                                       <Upload size={12} className="mr-1"/> Nhập File
                                   </button>
                               </>
                           )}
                           <button onClick={handleSendReport} disabled={syncLoading} className={`flex items-center text-xs px-2 py-1 rounded text-white font-bold transition-all ${syncLoading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
                               <RefreshCw size={12} className={`mr-1 ${syncLoading ? 'animate-spin' : ''}`} /> {syncLoading ? 'Xử lý...' : 'Gửi BC'}
                           </button>
                       </div>
                       <span className="text-[10px] font-bold text-green-600">{syncStatus}</span>
                   </div>
               </div>
               <div className="flex gap-2 text-sm items-center bg-gray-50 p-2 rounded">
                   <Calendar size={16} className="text-gray-500"/>
                   <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent border rounded px-1 w-full"/>
                   <span>-</span>
                   <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent border rounded px-1 w-full"/>
               </div>
               <div className="grid grid-cols-2 gap-4 mt-2">
                   <div className="bg-blue-50 p-2 rounded text-center"><span className="block text-2xl font-bold text-blue-700">{totalExams}</span><span className="text-xs text-gray-600">Lượt khám / 总诊次</span></div>
                   <div className="bg-orange-50 p-2 rounded text-center"><span className="block text-2xl font-bold text-orange-700">{totalTransfers}</span><span className="text-xs text-gray-600">Chuyển viện / 转院</span></div>
                   <div className="col-span-2 bg-yellow-50 p-2 rounded text-center flex justify-between px-6 items-center"><span className="text-xs text-gray-600 font-bold">Nghỉ tại phòng / 休息</span><span className="text-2xl font-bold text-yellow-700">{totalResting}</span></div>
               </div>
           </div>

           <div className="flex-1 bg-white p-4 rounded-xl shadow-sm flex flex-col">
               <div className="flex justify-between items-center mb-2">
                   <h3 className="font-bold text-gray-700 text-sm uppercase">Cơ cấu bệnh tật / 疾病结构</h3>
                   {stationConfig.type === StationType.HUB && (
                       <select className="bg-gray-100 border-none text-xs font-bold rounded p-1" value={filterStation} onChange={(e) => setFilterStation(e.target.value)}>
                           <option value="ALL">All Stations</option>
                           {STATION_PRESETS.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                       </select>
                   )}
               </div>
               <div className="flex-1 min-h-0 flex items-center">
                   <ResponsiveContainer width="100%" height="100%">
                       <PieChart>
                           <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={80} paddingAngle={5} dataKey="value">
                               {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                           </Pie>
                           <Tooltip />
                           <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{fontSize: '12px'}}/>
                       </PieChart>
                   </ResponsiveContainer>
               </div>
           </div>
       </div>

       <div className="flex-1 bg-white rounded-xl shadow-sm flex flex-col overflow-hidden">
          <div className="flex justify-between items-center p-4 border-b bg-gray-50">
              <h3 className="text-lg font-bold text-gray-800">Danh sách chi tiết / 详细列表</h3>
              <div className="flex gap-2">
                <button onClick={loadData} disabled={isLoading} className={`p-2 text-gray-500 hover:bg-gray-200 rounded-lg transition ${isLoading ? 'animate-spin' : ''}`}><RefreshCw size={20}/></button>
                <button onClick={handleExportExcel} className="flex items-center text-sm bg-green-100 text-green-800 px-4 py-2 rounded-lg hover:bg-green-200 transition font-bold shadow-sm"><Download size={16} className="mr-2"/> Xuất Excel</button>
              </div>
          </div>
          <div className="flex-1 overflow-auto">
             <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-gray-100 text-gray-600 sticky top-0 z-10 shadow-sm">
                   <tr>
                      <th className="p-3">STT</th><th className="p-3">ID</th><th className="p-3">Tên / 姓名</th><th className="p-3">Giờ vào / 入站</th><th className="p-3">Chẩn đoán / 诊断</th><th className="p-3">Nhóm bệnh / 疾病组</th><th className="p-3">Giờ ra / 出站</th><th className="p-3">Trạng thái / 状态</th><th className="p-3">Trạm</th>
                   </tr>
                </thead>
                <tbody className="divide-y">
                   {periodFiltered.map((e, idx) => (
                      <tr key={e.id} onClick={() => handleRowClick(e)} className="hover:bg-blue-50 cursor-pointer transition-colors">
                         <td className="p-3 text-gray-500">{idx + 1}</td>
                         <td className="p-3 font-mono font-bold text-gray-600">{e.patientId}</td>
                         <td className="p-3 font-medium text-blue-600 hover:underline">{e.patientName}</td>
                         <td className="p-3 text-gray-600">{new Date(e.startTime).toLocaleString()}</td>
                         <td className="p-3 text-gray-800 truncate max-w-[150px]" title={e.diagnosis}>{e.diagnosis || '-'}</td>
                         <td className="p-3 text-gray-600">{e.diseaseGroup || '-'}</td>
                         <td className="p-3 text-gray-600">{e.endTime ? new Date(e.endTime).toLocaleString() : '-'}</td>
                         <td className="p-3">
                             <span className={`px-2 py-1 rounded text-xs font-bold ${e.status === EncounterStatus.REST_30 ? 'bg-yellow-100 text-yellow-800' : e.status.includes('COMPLETED') ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-800'}`}>
                                 {getStatusLabel(e.status)}
                             </span>
                         </td>
                         <td className="p-3 text-xs font-bold text-gray-500">{e.stationName}</td>
                      </tr>
                   ))}
                   {periodFiltered.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-gray-400">Không có dữ liệu</td></tr>}
                </tbody>
             </table>
          </div>
       </div>
    </div>
  );
};