import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle, ArrowRight, Check, X, Stethoscope, UserPlus, Search } from 'lucide-react';
import { Encounter, EncounterStatus, Protocol, Medicine, Patient, User } from '../types';
import { storage } from '../services/storage';
import { DISEASE_GROUPS } from '../constants';

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

export const Clinical: React.FC<ClinicalProps> = ({ stationId, stationName, refreshTrigger, onDataChange, currentUser }) => {
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]); // Dữ liệu thô từ DB
  const [groupedMedicines, setGroupedMedicines] = useState<GroupedMedicineForClinical[]>([]); // Dữ liệu đã gom nhóm
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);

  // Manual Entry State
  const [manualId, setManualId] = useState('');
  
  // New Employee Modal State
  const [showNewEmpModal, setShowNewEmpModal] = useState(false);
  const [newEmpId, setNewEmpId] = useState('');
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpDept, setNewEmpDept] = useState('');

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
    const interval = setInterval(loadData, 5000); // Polling dự phòng 5s
    return () => clearInterval(interval);
  }, []);

  // --- 2. Lắng nghe sự kiện Real-time ---
  useEffect(() => {
      if (refreshTrigger && refreshTrigger > 0) {
          console.log("⚡ [Clinical] Tự động tải lại danh sách (Real-time trigger)!");
          loadData();
      }
  }, [refreshTrigger]);

  // --- 3. Hàm tải dữ liệu ---
  const loadData = async () => {
    if (window.electron) {
        try {
            const dbEncounters = await window.electron.getEncounters();
            
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
            const dbMedicines = await window.electron.getInventory(stationName);
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

  const waitingList = encounters.filter(e => e.status === EncounterStatus.WAITING || e.status === EncounterStatus.IN_PROGRESS);
  const activeEncounter = encounters.find(e => e.id === selectedEncounterId);

  // --- Handle Manual Add ---
  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualId.trim()) return;
    
    try {
        const id = manualId.trim().toUpperCase();

        let existing: Patient | undefined;
        try {
             existing = storage.findPatient ? storage.findPatient(id) : undefined;
        } catch (err) {}
        
        let patientData: Patient | null = existing || null;

        if (id.startsWith('1') && !patientData) {
             patientData = { id, name: 'NHAN VIEN MO PHONG', department: 'PRODUCTION' };
             try { if(storage.savePatient) storage.savePatient(patientData); } catch {}
        }

        if (patientData && !id.startsWith('2')) {
            await createEncounterForPatient(patientData); 
            setManualId('');
        } else {
            setNewEmpId(id);
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
      if (!newEmpName || !newEmpDept) return;

      const newPatient: Patient = {
          id: newEmpId,
          name: newEmpName.toUpperCase(),
          department: newEmpDept.toUpperCase()
      };

      try { if(storage.savePatient) storage.savePatient(newPatient); } catch {}
      
      createEncounterForPatient(newPatient);
      setShowNewEmpModal(false);
      setManualId('');
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
            await window.electron.createEncounter(newEncounter);
        } else {
            storage.addEncounter(newEncounter);
        }
        await loadData();
    } catch (error) {
        console.error("CRITICAL ERROR:", error);
        alert("❌ Lỗi Database: Không thể tạo phiếu khám!");
    }
  };

  const handleSelectEncounter = (id: string) => {
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
          window.electron.updateEncounter({ 
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

  const finishEncounter = async (status: EncounterStatus) => {
    if (!activeEncounter) return;

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
            await window.electron.updateEncounter(updated);
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
       {/* New Employee Modal */}
       {showNewEmpModal && (
           <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4 rounded-xl">
               <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-md">
                   <div className="flex items-center text-yellow-600 mb-4">
                       <AlertTriangle size={32} className="mr-3"/>
                       <h3 className="text-xl font-bold">Nhân viên mới / 新员工</h3>
                   </div>
                   <p className="mb-4 text-gray-600">
                       Mã nhân viên <strong>{newEmpId}</strong> chưa có trong hệ thống. Vui lòng nhập thông tin để tiếp tục.
                   </p>
                   <form onSubmit={handleSaveNewEmployee} className="space-y-4">
                       <div>
                           <label className="block text-sm font-bold text-gray-700">Họ và Tên / 姓名</label>
                           <input 
                               required 
                               className="w-full border p-2 rounded uppercase" 
                               value={newEmpName}
                               onChange={e => setNewEmpName(e.target.value)}
                           />
                       </div>
                       <div>
                           <label className="block text-sm font-bold text-gray-700">Bộ phận / 部门</label>
                           <input 
                               required 
                               className="w-full border p-2 rounded uppercase" 
                               value={newEmpDept}
                               onChange={e => setNewEmpDept(e.target.value)}
                           />
                       </div>
                       <div className="flex justify-end gap-2 pt-2">
                           <button 
                               type="button" 
                               onClick={() => setShowNewEmpModal(false)}
                               className="px-4 py-2 text-gray-500 font-bold"
                           >
                               Hủy / 取消
                           </button>
                           <button 
                               type="submit" 
                               className="px-4 py-2 bg-medical-green text-white rounded font-bold hover:bg-green-600"
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
            <form onSubmit={handleManualAdd} className="flex gap-2">
                <input 
                    type="text" 
                    value={manualId}
                    onChange={(e) => setManualId(e.target.value.toUpperCase())}
                    placeholder="Nhập mã thẻ / 输入ID..."
                    className="flex-1 border p-2 rounded uppercase font-mono text-sm"
                />
                <button type="submit" className="bg-medical-green text-white px-3 py-2 rounded font-bold hover:bg-green-600">
                    +
                </button>
            </form>
        </div>

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
                    className={`p-4 rounded-lg border cursor-pointer hover:bg-blue-50 transition-colors ${selectedEncounterId === e.id ? 'border-medical-green ring-1 ring-medical-green bg-green-50' : 'border-gray-200'}`}
                >
                    <div className="flex justify-between items-start">
                    <span className="font-bold text-lg text-gray-800">{e.patientName}</span>
                    <span className={`text-xs font-bold px-2 py-1 rounded ${isLate ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                        {waitTime}m
                    </span>
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
                <h3 className="text-xl font-bold text-medical-green">{activeEncounter.patientName}</h3>
                <p className="text-sm text-gray-600">{activeEncounter.patientId} - {activeEncounter.department}</p>
                <div className="text-sm text-red-600 mt-1 font-medium">Triệu chứng / 症状: {Array.isArray(activeEncounter.symptoms) ? activeEncounter.symptoms.map((s:any) => typeof s === 'string' ? s : s.vi).join(', ') : ''}</div>
                <div className="text-xs text-gray-400 mt-1 text-right italic">
                    Bác sĩ: {currentUser ? currentUser.name : '...'}
                </div>
            </div>

            <div className="flex-1 p-6 overflow-y-auto">
                <div className="grid grid-cols-2 gap-6 mb-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Chẩn đoán / 诊断</label>
                        <textarea 
                            className="w-full p-3 border rounded-lg h-24"
                            value={diagnosis}
                            onChange={e => setDiagnosis(e.target.value)}
                            placeholder="Nhập chẩn đoán / 输入诊断..."
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Nhóm bệnh / 疾病组</label>
                        <select 
                            className="w-full p-3 border rounded-lg h-12 bg-white"
                            value={diseaseGroup}
                            onChange={e => setDiseaseGroup(e.target.value)}
                        >
                            <option value="">-- Chọn nhóm bệnh / 选择组 --</option>
                            {DISEASE_GROUPS.map(g => (
                                <option key={g} value={g}>{g}</option>
                            ))}
                        </select>
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
                <p className="p-4 text-center text-gray-400 text-sm">Chưa có phác đồ mẫu</p>
            )}
        </div>
      </div>
    </div>
  );
};