import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle, ArrowRight, Check, X, Stethoscope, UserPlus, Search, Trash2, ClipboardList, FileSpreadsheet } from 'lucide-react';
import { Encounter, EncounterStatus, Protocol, Medicine, Patient, User } from '../types';
import { storage } from '../services/storage';
import { dataService } from '../services/data-service';
import { HealthTimeline } from './HealthTimeline';
import { ExcelEncounterImport } from './ExcelEncounterImport';

// --- 1. Interface nhận refreshTrigger & onDataChange ---
interface ClinicalProps {
  stationId: string;
  stationName: string;
  refreshTrigger?: number; // Tín hiệu reload TỪ App
  onDataChange?: () => void; // Hàm báo hiệu thay đổi LÊN App (để reload Inventory)
  currentUser: User | null; 
}

// Interface cho thuốc đã gom nhóm (Để hiển thị trong Clinical)
interface GroupedMedicineForClinical {
    id: string;      // ID đại diện 
    name: string;    // Tên thuốc (Generic Name)
    totalStock: number; // Tổng tồn kho
    unit: string;
    group: string;
}


const ISOLATION_OPTIONS = [
  'Không cần cách ly',
  'Cách ly tại chỗ (y tế trạm)',
  'Cách ly y tế tập trung',
  'Nhập viện điều trị'
];

export const Clinical: React.FC<ClinicalProps> = ({ stationId, stationName, refreshTrigger, onDataChange, currentUser }) => {
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]); // Dữ liệu thô từ DB
  const [groupedMedicines, setGroupedMedicines] = useState<GroupedMedicineForClinical[]>([]); // Dữ liệu đã gom nhóm
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);

  // Health History Modal
  const [historyPatient, setHistoryPatient] = useState<{ id: string; name: string; department: string } | null>(null);
  const [showExcelImport, setShowExcelImport] = useState(false);

  // Manual Entry State
  const [manualId, setManualId] = useState('');
  const [isContractor, setIsContractor] = useState(false);

  // New Employee Modal State
  const [showNewEmpModal, setShowNewEmpModal] = useState(false);
  const [newEmpId, setNewEmpId] = useState('');
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpDept, setNewEmpDept] = useState('');

  // Disease Groups
  const [diseaseGroupList, setDiseaseGroupList] = useState<string[]>([]);

  // Infectious Disease State
  const [isInfectiousMode, setIsInfectiousMode] = useState(false);
  const [infectiousGroup, setInfectiousGroup] = useState<'A' | 'B' | 'C'>('B');
  const [selectedDisease, setSelectedDisease] = useState('');
  const [isolationLevel, setIsolationLevel] = useState('Không cần cách ly');
  const [infectiousDiseases, setInfectiousDiseases] = useState<Record<'A' | 'B' | 'C', string[]>>(() => storage.getInfectiousDiseases());

  // Encounter State
  const [diagnosis, setDiagnosis] = useState('');
  const [diseaseGroup, setDiseaseGroup] = useState('');
  const [prescriptions, setPrescriptions] = useState<{medName: string, qty: number, unit?: string}[]>([]); 
  
  // Medicine Search State
  const [medSearch, setMedSearch] = useState('');
  const [showMedResults, setShowMedResults] = useState(false);

  // --- Khởi tạo & Polling ---
  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      // Bỏ qua 1 chu kỳ nếu user đang nhập liệu – tránh re-render làm đóng băng input
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      loadData();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // --- 2. Lắng nghe sự kiện Real-time ---
  useEffect(() => {
      if (refreshTrigger && refreshTrigger > 0) {
          console.log("⚡ [Clinical] Tự động tải lại danh sách (Real-time trigger)!");
          loadData();
      }
  }, [refreshTrigger]);

  // Auto-fill chẩn đoán khi chọn bệnh truyền nhiễm
  useEffect(() => {
    if (!isInfectiousMode) return;
    if (selectedDisease) {
      setDiagnosis(`${selectedDisease} - Nhóm ${infectiousGroup} - ${isolationLevel}`);
    } else {
      setDiagnosis('');
    }
    setDiseaseGroup('Bệnh truyền nhiễm');
  }, [isInfectiousMode, infectiousGroup, selectedDisease, isolationLevel]);

  // --- 3. Hàm tải dữ liệu ---
  const loadData = async () => {
    if (window.electron) {
        try {
            const dbEncounters = await dataService.getEncounters();
            
            const myPatients = dbEncounters.filter((e: any) => {
                const sName = e.stationName || e.station_name || 'Unknown';
                const status = (e.status || '').toUpperCase();
                
                const isStatusOk = status === 'WAITING' || status === 'IN_PROGRESS';
                const isStationOk = sName === stationName || sName === 'Unknown'; // Lấy cả BN chưa gán trạm

                return isStatusOk && isStationOk;
            });
            
            setEncounters(myPatients);

            // Load thuốc và GOM NHÓM ngay tại đây
            // Lấy tồn kho của trạm hiện tại
            const dbMedicines = await dataService.getInventory(stationName);
            setMedicines(dbMedicines || []); 
            processGroupedMedicines(dbMedicines || []);

        } catch (e) {
            console.error("Failed to load encounters from DB", e);
        }
    } else {
        setEncounters(storage.getEncounters());
        const localMeds = storage.getMedicines();
        setMedicines(localMeds);
        processGroupedMedicines(localMeds);
    }
    
    const allProtocols = storage.getProtocols ? storage.getProtocols() : [];
    setProtocols(allProtocols.filter(p => p.isApproved));
    setDiseaseGroupList(storage.getDiseaseGroups());
    setInfectiousDiseases(storage.getInfectiousDiseases());
  };

  // 🔥 [NEW] HÀM CHUẨN HÓA TÊN THUỐC 🔥
  const normalizeName = (name: string) => {
      if (!name) return '';
      // Trim: Bỏ khoảng trắng đầu đuôi
      // UpperCase: Chuyển hết thành hoa
      // Replace: Thay thế nhiều khoảng trắng liên tiếp thành 1 khoảng trắng
      return name.trim().toUpperCase().replace(/\s+/g, ' '); 
  };

  // 🔥 HÀM GOM NHÓM THUỐC & TÍNH TỒN KHO 🔥
  const processGroupedMedicines = (rawMeds: Medicine[]) => {
      const groups: Record<string, GroupedMedicineForClinical> = {};

      rawMeds.forEach(m => {
          // Bỏ qua danh mục gốc khi tính tồn kho thực tế để kê đơn
          // (Trừ khi người dùng lỡ nhập số lượng vào danh mục gốc thì vẫn lấy)
          if (m.batchNumber === 'DANH_MUC_GOC' && m.stock <= 0) return;

          // Sử dụng tên đã chuẩn hóa làm Key để gom nhóm
          const key = normalizeName(m.name);
          
          if (!groups[key]) {
              groups[key] = {
                  id: m.id,
                  name: m.name, // Giữ lại tên gốc hiển thị (lần đầu gặp)
                  totalStock: 0,
                  unit: m.unit,
                  group: m.group || m.group_name || ''
              };
          }
          // Cộng dồn tồn kho
          groups[key].totalStock += m.stock;
      });

      setGroupedMedicines(Object.values(groups));
  };

  const waitingList = encounters
    .filter(e => e.status === EncounterStatus.WAITING || e.status === EncounterStatus.IN_PROGRESS)
    .sort((a, b) => a.startTime - b.startTime);
  const activeEncounter = encounters.find(e => e.id === selectedEncounterId);

  // --- Handle Manual Add ---
  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const inputVal = manualId.trim().toUpperCase();
    if (!inputVal) return;

    // Luồng NHÀ THẦU: mỗi lần vào khám tạo ID riêng để phân biệt
    if (isContractor) {
        setNewEmpId('NT_' + Date.now());
        setNewEmpName(inputVal); // Pre-fill tên từ ô input
        setNewEmpDept('');
        setShowNewEmpModal(true);
        return;
    }

    // Luồng nhân viên: inputVal là MÃ THẺ
    try {
        const existing = storage.findPatient ? storage.findPatient(inputVal) : undefined;
        if (existing) {
            await createEncounterForPatient(existing);
            setManualId('');
        } else {
            setNewEmpId(inputVal);
            setNewEmpName('');
            setNewEmpDept('');
            setShowNewEmpModal(true);
        }
    } catch (error) {
        console.error("Lỗi thêm bệnh nhân:", error);
        alert("Có lỗi khi thêm bệnh nhân. Hãy kiểm tra lại Database!");
    }
  };

  const handleSaveNewEmployee = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newEmpName.trim() || !newEmpDept.trim()) return;

      const newPatient: Patient = {
          id: newEmpId, // 'NHÀ THẦU' cho nhà thầu, mã thẻ cho nhân viên
          name: newEmpName.trim().toUpperCase(),
          department: newEmpDept.trim().toUpperCase()
      };

      try { if(storage.savePatient) storage.savePatient(newPatient); } catch {}

      createEncounterForPatient(newPatient);
      setShowNewEmpModal(false);
      setManualId('');
      setIsContractor(false);
  };

  const createEncounterForPatient = async (patient: Patient) => {
    const newEncounter: Encounter = {
        id: crypto.randomUUID(),
        patientId: patient.id,
        patientName: patient.name,
        department: patient.department,
        symptoms: ['Khai báo tại bàn khám'],
        startTime: Date.now(),
        status: EncounterStatus.WAITING,
        prescriptions: [],
        stationId: stationId,
        stationName: stationName || 'Unknown Station' 
    };

    try {
        if (window.electron) {
            await dataService.createEncounter(newEncounter);
        } else {
            storage.addEncounter(newEncounter);
        }
        await loadData();
    } catch (error) {
        console.error("CRITICAL ERROR:", error);
        alert("❌ Lỗi Database: Không thể tạo phiếu khám!");
    }
  };

  const handleToggleInfectious = () => {
    const next = !isInfectiousMode;
    setIsInfectiousMode(next);
    if (!next) {
      setDiagnosis('');
      setDiseaseGroup('');
      setSelectedDisease('');
    }
  };

  const handleSelectEncounter = (id: string) => {
    setIsInfectiousMode(false);
    setSelectedDisease('');
    setInfectiousGroup('B');
    setIsolationLevel('Không cần cách ly');
    setSelectedEncounterId(id);
    const enc = encounters.find(e => e.id === id);
    if (enc) {
      setDiagnosis(enc.diagnosis || '');
      setDiseaseGroup(enc.diseaseGroup || '');
      
      const currentPrescriptions = enc.prescriptions || [];
      setPrescriptions(currentPrescriptions.map((p: any) => ({ 
          medName: p.medicineName, 
          qty: p.quantity,
          unit: p.unit
      })));
      
      if (enc.status === EncounterStatus.WAITING && window.electron) {
          dataService.updateEncounter({
              ...enc,
              status: EncounterStatus.IN_PROGRESS,
              actorName: currentUser ? currentUser.name : 'Unknown Doctor'
          }).catch(console.error);

          setEncounters(prev => prev.map(e => e.id === id ? { ...e, status: EncounterStatus.IN_PROGRESS } : e));
      }
    }
  };

  // 🔥 [UPDATE] Áp dụng phác đồ + KIỂM TRA TỒN KHO & CHUẨN HÓA TÊN 🔥
  const applyProtocol = (p: Protocol) => {
    setDiagnosis(p.diagnosis);
    setDiseaseGroup(p.diseaseGroup);
    
    const newRx = p.medicines.map(pm => {
        const normalizedProtocolName = normalizeName(pm.medicineName);

        // 1. Tìm chính xác theo tên chuẩn hóa
        let stockInfo = groupedMedicines.find(g => normalizeName(g.name) === normalizedProtocolName);
        
        // 2. Nếu không thấy, tìm tương đối (chứa tên) - Giải quyết vụ "Salonpas" vs "Salonpas Gel"
        if (!stockInfo) {
            stockInfo = groupedMedicines.find(g => {
                const normG = normalizeName(g.name);
                return normG.includes(normalizedProtocolName) || normalizedProtocolName.includes(normG);
            });
        }

        const currentStock = stockInfo ? stockInfo.totalStock : 0;
        // Nếu tìm thấy thuốc trong kho thì dùng tên trong kho, nếu không dùng tên trong phác đồ
        const finalName = stockInfo ? stockInfo.name : pm.medicineName; 

        // 🔥 LOGIC AN TOÀN: Không cho kê quá số tồn
        const safeQty = Math.min(pm.quantity, currentStock);

        return {
            medName: finalName, 
            qty: safeQty,             
            unit: stockInfo?.unit || pm.unit || ''
        };
    });
    setPrescriptions(newRx);
  };

  // 🔥 [UPDATE] Cập nhật số lượng + CHẶN VƯỢT QUÁ TỒN (Dùng tên chuẩn hóa) 🔥
  const updateRxQty = (medName: string, qty: number) => {
    // Tìm max stock từ Grouped List bằng tên chuẩn hóa
    const normalizedRxName = normalizeName(medName);
    const group = groupedMedicines.find(g => normalizeName(g.name) === normalizedRxName);
    const maxStock = group ? group.totalStock : 0;
    
    let safeQty = qty;
    if (safeQty > maxStock) {
        safeQty = maxStock;
    }
    if (safeQty < 0) safeQty = 0;
    
    setPrescriptions(prev => prev.map(p => p.medName === medName ? { ...p, qty: safeQty } : p));
  };

  // 🔥 [UPDATE] Thêm thuốc lẻ + CHẶN NẾU HẾT HÀNG 🔥
  const addMedToRx = (med: GroupedMedicineForClinical) => {
    if (med.totalStock <= 0) {
        alert(`❌ Thuốc "${med.name}" đã hết hàng trong kho!`);
        return;
    }

    // Check trùng tên (chuẩn hóa)
    const exists = prescriptions.some(p => normalizeName(p.medName) === normalizeName(med.name));

    if (!exists) {
        setPrescriptions([...prescriptions, { medName: med.name, qty: 1, unit: med.unit }]);
    }
    setMedSearch('');
    setShowMedResults(false);
  };

  const removeMedFromRx = (medName: string) => {
    setPrescriptions(prev => prev.filter(p => p.medName !== medName));
  };

  const handleDeleteEncounter = async (encounterId: string, patientName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Xóa phiếu của "${patientName}"?\nHành động này không thể hoàn tác.`)) return;
    if (window.electron) {
        await dataService.deleteEncounter(encounterId);
    } else {
        storage.deleteEncounter?.(encounterId);
    }
    if (selectedEncounterId === encounterId) {
        setSelectedEncounterId(null);
        setDiagnosis('');
        setPrescriptions([]);
    }
    await loadData();
  };

  const finishEncounter = async (status: EncounterStatus) => {
    if (!activeEncounter) return;

    if (!diagnosis.trim()) {
      alert('⚠️ Vui lòng nhập Chẩn đoán trước khi kết thúc khám!\n请先填写诊断内容！');
      return;
    }
    if (!diseaseGroup) {
      alert('⚠️ Vui lòng chọn Nhóm bệnh trước khi kết thúc khám!\n请先选择疾病分组！');
      return;
    }

    // 🔥 Lọc bỏ những thuốc có số lượng = 0 trước khi lưu
    const validPrescriptions = prescriptions
        .filter(p => p.qty > 0)
        .map(p => ({ 
            medicineName: p.medName,
            quantity: p.qty,
            unit: p.unit
        }));

    const updated: Encounter = {
      ...activeEncounter,
      diagnosis,
      diseaseGroup,
      status: status,
      endTime: Date.now(),
      actorName: currentUser ? currentUser.name : 'Unknown Doctor',
      prescriptions: validPrescriptions
    };

    if (status === EncounterStatus.REST_30 || status === EncounterStatus.MONITOR) {
      updated.restStartTime = Date.now();
    }

    try {
        if (window.electron) {
            await dataService.updateEncounter(updated);
        } else {
            storage.updateEncounter(updated);
        }
        
        if (onDataChange) {
            console.log("🔔 Clinical: Saved successfully, triggering global refresh...");
            onDataChange();
        }

        setSelectedEncounterId(null);
        setDiagnosis('');
        setPrescriptions([]);
        loadData();
    } catch (e) {
        alert("Lỗi khi lưu bệnh án. Kiểm tra lại Backend.");
    }
  };

  // Tìm kiếm thuốc trong dropdown cũng dùng normalizeName
  const filteredGroupedMedicines = groupedMedicines.filter(m => 
    normalizeName(m.name).includes(normalizeName(medSearch)) || 
    (m.group && normalizeName(m.group).includes(normalizeName(medSearch)))
  );

  return (
    <div className="flex h-full gap-4 relative">
       {/* Excel Encounter Import */}
       {showExcelImport && (
           <ExcelEncounterImport
               onClose={() => setShowExcelImport(false)}
               onSuccess={(count) => {
                   setShowExcelImport(false);
                   alert(`✅ Đã nhập bổ sung ${count} ca khám thành công!`);
                   loadEncounters();
               }}
           />
       )}
       {/* Health History Modal */}
       {historyPatient && (
           <HealthTimeline
               patientId={historyPatient.id}
               patientName={historyPatient.name}
               department={historyPatient.department}
               mode="encounters-only"
               onClose={() => setHistoryPatient(null)}
           />
       )}

       {/* New Employee / Contractor Modal */}
       {showNewEmpModal && (
           <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4 rounded-xl">
               <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-md">
                   {isContractor ? (
                       <div className="flex items-center text-orange-600 mb-4">
                           <AlertTriangle size={32} className="mr-3"/>
                           <div>
                               <h3 className="text-xl font-bold">Nhà thầu / 外包人员</h3>
                               <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-bold">NHÀ THẦU</span>
                           </div>
                       </div>
                   ) : (
                       <div className="flex items-center text-yellow-600 mb-4">
                           <AlertTriangle size={32} className="mr-3"/>
                           <div>
                               <h3 className="text-xl font-bold">Nhân viên mới / 新员工</h3>
                               <p className="text-sm text-gray-500">Mã: <strong>{newEmpId}</strong> chưa có trong hệ thống</p>
                           </div>
                       </div>
                   )}
                   <form onSubmit={handleSaveNewEmployee} className="space-y-4">
                       <div>
                           <label className="block text-sm font-bold text-gray-700">
                               {isContractor ? 'Tên / 姓名' : 'Họ và Tên / 姓名'}
                           </label>
                           <input
                               required
                               autoFocus
                               className="w-full border p-2 rounded uppercase"
                               value={newEmpName}
                               onChange={e => setNewEmpName(e.target.value)}
                               placeholder={isContractor ? 'Nhập họ tên đầy đủ...' : ''}
                           />
                       </div>
                       <div>
                           <label className="block text-sm font-bold text-gray-700">
                               {isContractor ? 'Đơn vị làm việc / 工作单位' : 'Bộ phận / 部门'}
                           </label>
                           <input
                               required
                               className="w-full border p-2 rounded uppercase"
                               value={newEmpDept}
                               onChange={e => setNewEmpDept(e.target.value)}
                               placeholder={isContractor ? 'Tên công ty / đơn vị...' : ''}
                           />
                       </div>
                       <div className="flex justify-end gap-2 pt-2">
                           <button
                               type="button"
                               onClick={() => { setShowNewEmpModal(false); setIsContractor(false); }}
                               className="px-4 py-2 text-gray-500 font-bold"
                           >
                               Hủy / 取消
                           </button>
                           <button
                               type="submit"
                               className={`px-4 py-2 text-white rounded font-bold ${isContractor ? 'bg-orange-500 hover:bg-orange-600' : 'bg-medical-green hover:bg-green-600'}`}
                           >
                               Lưu & Tiếp tục / 保存
                           </button>
                       </div>
                   </form>
               </div>
           </div>
       )}

      {/* COLUMN 1: Queue & Manual Entry (25%) */}
      <div className="w-1/4 flex flex-col gap-4">
        {/* Manual Entry Box */}
        <div className="bg-white p-4 rounded-xl shadow-sm">
            <h3 className="font-bold text-gray-700 mb-2 flex items-center">
                <UserPlus size={18} className="mr-2"/> Thêm bệnh nhân / 添加病人
            </h3>
            {/* Toggle NHÀ THẦU */}
            <label className={`flex items-center gap-2 mb-2 cursor-pointer select-none text-sm font-bold px-2 py-1 rounded transition-colors ${isContractor ? 'bg-orange-100 text-orange-700' : 'text-gray-500 hover:bg-gray-50'}`}>
                <input
                    type="checkbox"
                    checked={isContractor}
                    onChange={e => { setIsContractor(e.target.checked); setManualId(''); }}
                    className="w-4 h-4 accent-orange-500"
                />
                NHÀ THẦU / 外包人员
            </label>
            <form onSubmit={handleManualAdd} className="flex gap-2">
                <input
                    type="text"
                    value={manualId}
                    onChange={(e) => setManualId(e.target.value.toUpperCase())}
                    placeholder={isContractor ? "Nhập tên nhà thầu / 输入姓名..." : "Nhập mã thẻ / 输入ID..."}
                    className={`flex-1 border p-2 rounded font-mono text-sm ${isContractor ? 'border-orange-300 bg-orange-50 uppercase' : 'uppercase'}`}
                />
                <button type="submit" className="bg-medical-green text-white px-3 py-2 rounded font-bold hover:bg-green-600">
                    +
                </button>
            </form>
        </div>

        {/* Nhập bổ sung từ Excel */}
        <button
            onClick={() => setShowExcelImport(true)}
            className="w-full flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
        >
            <FileSpreadsheet size={16}/><span>Nhập bổ sung từ Excel<span className="block text-[9px] font-normal opacity-70 leading-tight">从Excel补充导入</span></span>
        </button>

        {/* Queue List */}
        <div className="bg-white rounded-xl shadow-sm flex flex-col flex-1 overflow-hidden">
            <div className="p-4 bg-gray-100 border-b font-bold text-gray-700 flex justify-between items-center">
            <span>Hàng chờ / 排队</span>
            <span className="bg-medical-green text-white px-2 py-0.5 rounded-full text-xs">{waitingList.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {waitingList.map(e => {
                const waitTime = Math.floor((Date.now() - e.startTime) / 60000);
                const isLate = waitTime > 15;
                return (
                <div
                    key={e.id}
                    onClick={() => handleSelectEncounter(e.id)}
                    className={`p-4 rounded-lg border cursor-pointer hover:bg-blue-50 transition-colors group ${selectedEncounterId === e.id ? 'border-medical-green ring-1 ring-medical-green bg-green-50' : 'border-gray-200'}`}
                >
                    <div className="flex justify-between items-start">
                    <span className="font-bold text-lg text-gray-800 truncate flex-1 mr-1">{e.patientName}</span>
                    <div className="flex items-center gap-1 shrink-0">
                        <span className={`text-xs font-bold px-2 py-1 rounded ${isLate ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                            {waitTime}m
                        </span>
                        <button
                            onClick={(ev) => handleDeleteEncounter(e.id, e.patientName, ev)}
                            title="Xóa phiếu / 删除"
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-100"
                        >
                            <Trash2 size={14}/>
                        </button>
                    </div>
                    </div>
                    <div className="text-sm text-gray-500 mt-1">{e.department}</div>
                    <div className="flex flex-wrap gap-1 mt-2">
                    {(e.symptoms || []).map((s:any, i:number) => (
                        <span key={i} className="text-xs bg-gray-100 text-gray-600 px-1 rounded">{typeof s === 'string' ? s : s.vi}</span>
                    ))}
                    </div>
                </div>
                );
            })}
            {waitingList.length === 0 && (
                <div className="p-8 text-center text-gray-400">
                Không có bệnh nhân / 无病人
                </div>
            )}
            </div>
        </div>
      </div>

      {/* COLUMN 2: Workspace (Diagnosis + Meds) (55%) */}
      <div className="flex-1 bg-white rounded-xl shadow-sm flex flex-col overflow-hidden">
        {activeEncounter ? (
          <div className="flex flex-col h-full">
            {/* Patient Info Header */}
            <div className="p-4 border-b bg-green-50">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                        <h3 className="text-xl font-bold text-medical-green">{activeEncounter.patientName}</h3>
                        <p className="text-sm text-gray-600">{activeEncounter.patientId} - {activeEncounter.department}</p>
                        <div className="text-sm text-red-600 mt-1 font-medium">Triệu chứng / 症状: {Array.isArray(activeEncounter.symptoms) ? activeEncounter.symptoms.map((s:any) => typeof s === 'string' ? s : s.vi).join(', ') : ''}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                        <button
                            onClick={() => setHistoryPatient({
                                id: activeEncounter.patientId,
                                name: activeEncounter.patientName,
                                department: activeEncounter.department
                            })}
                            className="flex items-center gap-1 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                        >
                            <ClipboardList size={14} className="shrink-0"/><span>Lịch sử khám<span className="block text-[9px] font-normal opacity-70 leading-tight">查看就诊记录</span></span>
                        </button>
                        <div className="text-xs text-gray-400 italic">
                            Bác sĩ: {currentUser ? currentUser.name : '...'}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 p-6 overflow-y-auto">
                {/* Toggle bệnh truyền nhiễm */}
                <div className="flex items-center gap-3 mb-4">
                  <button
                    onClick={handleToggleInfectious}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all border-2 ${
                      isInfectiousMode
                        ? 'bg-red-500 border-red-600 text-white shadow-md'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-red-300 hover:text-red-600'
                    }`}
                  >
                    🦠 Bệnh truyền nhiễm / 传染病
                  </button>
                  {isInfectiousMode && (
                    <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-1 rounded">
                      Nhóm {infectiousGroup} — Khai báo bắt buộc / 强制申报
                    </span>
                  )}
                </div>

                {/* Panel bệnh truyền nhiễm */}
                {isInfectiousMode && (
                  <div className="mb-6 bg-red-50 border-2 border-red-200 rounded-xl p-4 space-y-4">
                    <div>
                      <div className="text-xs font-bold text-gray-500 uppercase mb-2">Phân loại nhóm / 分类</div>
                      <div className="flex gap-2">
                        {(['A', 'B', 'C'] as const).map(g => (
                          <button
                            key={g}
                            onClick={() => { setInfectiousGroup(g); setSelectedDisease(''); }}
                            className={`flex-1 py-2 rounded-lg font-bold text-sm border-2 transition-all ${
                              infectiousGroup === g
                                ? g === 'A' ? 'bg-red-500 border-red-600 text-white'
                                  : g === 'B' ? 'bg-orange-500 border-orange-600 text-white'
                                  : 'bg-yellow-500 border-yellow-600 text-white'
                                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
                            }`}
                          >
                            <span>Nhóm {g}<span className="block text-[9px] font-normal opacity-80 leading-tight">{g === 'A' ? '甲类' : g === 'B' ? '乙类' : '丙类'}</span></span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-500 uppercase mb-2">Chọn bệnh / 选择疾病</div>
                      <div className="flex flex-wrap gap-1.5">
                        {infectiousDiseases[infectiousGroup].map(d => (
                          <button
                            key={d}
                            onClick={() => setSelectedDisease(d)}
                            className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                              selectedDisease === d
                                ? 'bg-red-500 border-red-500 text-white'
                                : 'bg-white border-gray-300 text-gray-600 hover:border-red-300 hover:text-red-600'
                            }`}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-500 uppercase mb-2">Hình thức cách ly / 隔离方式</div>
                      <select
                        value={isolationLevel}
                        onChange={e => setIsolationLevel(e.target.value)}
                        className="w-full p-2.5 border-2 rounded-lg bg-white font-medium text-sm focus:border-red-400 outline-none"
                      >
                        {ISOLATION_OPTIONS.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-6 mb-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">
                          Chẩn đoán / 诊断
                          <span className="text-red-500 ml-0.5">*</span>
                          {isInfectiousMode && <span className="ml-1 text-xs text-red-500 font-normal">(tự động điền)</span>}
                        </label>
                        <textarea
                            className={`w-full p-3 border rounded-lg h-24 ${isInfectiousMode ? 'bg-red-50 border-red-200 text-red-800' : (!diagnosis.trim() ? 'border-red-300 bg-red-50/30' : '')}`}
                            value={diagnosis}
                            onChange={e => { if (!isInfectiousMode) setDiagnosis(e.target.value); }}
                            readOnly={isInfectiousMode}
                            placeholder="Nhập chẩn đoán / 输入诊断..."
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">
                          Nhóm bệnh / 疾病组
                          <span className="text-red-500 ml-0.5">*</span>
                          {isInfectiousMode && <span className="ml-1 text-xs text-red-500 font-normal">(tự động điền)</span>}
                        </label>
                        {isInfectiousMode ? (
                          <div className="w-full p-3 h-12 border-2 border-red-200 bg-red-50 rounded-lg flex items-center">
                            <span className="font-bold text-red-700">🦠 Bệnh truyền nhiễm</span>
                          </div>
                        ) : (
                          <select
                              className={`w-full p-3 border rounded-lg h-12 bg-white ${!diseaseGroup ? 'border-red-300 bg-red-50/30' : ''}`}
                              value={diseaseGroup}
                              onChange={e => setDiseaseGroup(e.target.value)}
                          >
                              <option value="">-- Chọn nhóm bệnh / 选择组 --</option>
                              {diseaseGroupList.map(g => (
                                  <option key={g} value={g}>{g}</option>
                              ))}
                          </select>
                        )}
                    </div>
                </div>

                <div className="mb-4">
                    <label className="block text-sm font-bold text-gray-700 mb-2">Kê thuốc / 开药</label>
                    <div className="relative mb-4">
                        <div className="flex items-center border rounded-lg bg-gray-50 focus-within:ring-2 ring-medical-green">
                            <Search className="ml-3 text-gray-400" size={20}/>
                            <input 
                                type="text"
                                className="w-full p-3 bg-transparent outline-none"
                                placeholder="Gõ tên thuốc để tìm / 搜索药物..."
                                value={medSearch}
                                onChange={e => { setMedSearch(e.target.value); setShowMedResults(true); }}
                                onFocus={() => setShowMedResults(true)}
                            />
                        </div>
                        {showMedResults && medSearch && (
                            <div className="absolute z-10 w-full bg-white shadow-xl border rounded-lg mt-1 max-h-60 overflow-y-auto">
                                {filteredGroupedMedicines.map(m => (
                                    <div 
                                        key={m.name}
                                        className={`p-3 border-b flex justify-between ${m.totalStock <= 0 ? 'bg-gray-100 cursor-not-allowed' : 'hover:bg-green-50 cursor-pointer'}`}
                                        onClick={() => m.totalStock > 0 && addMedToRx(m)}
                                    >
                                        <span className={`font-bold ${m.totalStock <= 0 ? 'text-gray-400' : ''}`}>{m.name}</span>
                                        <span className={m.totalStock <= 0 ? 'text-red-500 font-bold' : (m.totalStock < 10 ? 'text-orange-500' : 'text-gray-500')}>
                                            {m.totalStock <= 0 ? 'HẾT HÀNG' : `Tồn: ${m.totalStock} ${m.unit}`}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="space-y-3">
                        {prescriptions.map((rx, idx) => {
                            // Tìm lại thông tin tồn kho
                            const normalizedRxMedName = normalizeName(rx.medName);
                            
                            // Sử dụng tên chuẩn hóa để tìm
                            const medGroup = groupedMedicines.find(g => normalizeName(g.name) === normalizedRxMedName);
                            
                            const stock = medGroup ? medGroup.totalStock : 0;
                            const isMissing = !medGroup || stock <= 0;

                            return (
                                <div key={idx} className={`flex items-center justify-between p-3 border rounded-lg shadow-sm ${isMissing ? 'bg-red-50 border-red-300' : 'bg-white'}`}>
                                    <div className="flex-1">
                                        <div className={`font-bold ${isMissing ? 'text-red-700' : 'text-gray-800'}`}>{rx.medName}</div>
                                        <div className={`text-xs ${isMissing ? 'text-red-500 font-bold' : 'text-gray-500'}`}>
                                            {stock <= 0 ? 'HẾT HÀNG / OUT OF STOCK' : `Kho / 库存: ${stock} ${rx.unit}`}
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-3">
                                        <input 
                                            type="number"
                                            min="0"
                                            max={stock}
                                            value={rx.qty}
                                            onChange={(e) => updateRxQty(rx.medName, parseInt(e.target.value) || 0)}
                                            className={`w-20 p-2 text-center border rounded font-bold text-lg ${rx.qty === 0 ? 'text-red-600 border-red-500 bg-red-50' : ''}`}
                                        />
                                        <button onClick={() => removeMedFromRx(rx.medName)} className="text-red-400 hover:text-red-600 bg-red-50 p-2 rounded-lg">
                                            <X size={20} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                        {prescriptions.length === 0 && (
                            <div className="text-center p-6 border-2 border-dashed rounded-lg text-gray-400">
                                Chưa có thuốc trong đơn / 处方中没有药物
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="p-4 border-t bg-gray-50 grid grid-cols-3 gap-3">
                <button onClick={() => finishEncounter(EncounterStatus.REST_30)} className="bg-yellow-500 hover:bg-yellow-600 text-white p-3 rounded-lg font-bold flex justify-center items-center">
                    <Clock className="mr-2" size={20}/> Nghỉ ngơi / 休息
                </button>
                <button onClick={() => finishEncounter(EncounterStatus.COMPLETED_WORK)} className="bg-medical-green hover:bg-green-700 text-white p-3 rounded-lg font-bold flex justify-center items-center">
                    <Check className="mr-2" size={20}/> Về làm việc / 返回工作
                </button>
                <button onClick={() => finishEncounter(EncounterStatus.COMPLETED_TRANSFER)} className="bg-gray-500 hover:bg-gray-600 text-white p-3 rounded-lg font-bold flex justify-center items-center">
                    <ArrowRight className="mr-2" size={20}/> Chuyển viện / 转院
                </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <Stethoscope size={64} className="mb-4 text-gray-200" />
            <p className="text-xl">Chọn bệnh nhân để khám / 选择病人</p>
          </div>
        )}
      </div>

      {/* COLUMN 3: Protocols (20%) */}
      <div className="w-1/5 bg-white rounded-xl shadow-sm flex flex-col overflow-hidden">
        <div className="p-4 bg-gray-100 border-b font-bold text-gray-700">
            Phác đồ mẫu / 协议 (Protocols)
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {protocols.map(p => (
                <button 
                    key={p.id}
                    onClick={() => activeEncounter && applyProtocol(p)}
                    disabled={!activeEncounter}
                    className="w-full text-left p-4 rounded-lg border hover:bg-green-50 hover:border-medical-green transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                    <div className="font-bold text-gray-800 group-hover:text-medical-green">{p.name}</div>
                    <div className="text-xs text-gray-500 mt-1">{p.diseaseGroup}</div>
                    <div className="text-xs text-gray-400 mt-1 truncate">{p.medicines.length} loại thuốc / 药</div>
                </button>
            ))}
            {protocols.length === 0 && (
                <p className="p-4 text-center text-gray-400 text-sm">Chưa có phác đồ mẫu / 暂无协议模板</p>
            )}
        </div>
      </div>
    </div>
  );
};