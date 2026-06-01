import React, { useState, useEffect } from 'react';
import { User, Role, Protocol, StationType, Medicine, Symptom, Patient } from '../types';
import { storage } from '../services/storage';
import { Check, X, Trash2, Plus, Building2, FileText, Lock, AlertTriangle, Activity, Users, Upload, Search } from 'lucide-react';
import { INITIAL_MEDICINES, DISEASE_GROUPS } from '../constants';
import * as XLSX from 'xlsx';

interface AdminProps {
  currentUser: User;
}

const AVAILABLE_ICONS = [
  'Frown', 'CircleDot', 'Thermometer', 'Wind', 'Bandage', 'BatteryLow', 'Activity', 'Zap', 'CloudRain'
];

export const Admin: React.FC<AdminProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'protocols' | 'stations' | 'symptoms' | 'employees'>('protocols');
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [stations, setStations] = useState<{name: string, type: string}[]>([]);
  
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [uniqueMeds, setUniqueMeds] = useState<Medicine[]>([]); // Unique (để dropdown)

  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [employees, setEmployees] = useState<Patient[]>([]);
  const [empSearch, setEmpSearch] = useState('');
  
  // New Protocol Form State
  const [showProtoForm, setShowProtoForm] = useState(false);
  const [newProtoName, setNewProtoName] = useState('');
  const [newProtoDiag, setNewProtoDiag] = useState('');
  const [newProtoGroup, setNewProtoGroup] = useState('');
  
  const [newProtoMeds, setNewProtoMeds] = useState<{medicineId: string, medicineName: string, quantity: number, unit?: string}[]>([]);
  const [selectedMedId, setSelectedMedId] = useState('');
  const [selectedMedQty, setSelectedMedQty] = useState(1);

  // New Station Form State
  const [newStationName, setNewStationName] = useState('');
  const [newStationType, setNewStationType] = useState('SPOKE');

  // New Symptom Form State
  const [showSymForm, setShowSymForm] = useState(false);
  const [newSymVi, setNewSymVi] = useState('');
  const [newSymCn, setNewSymCn] = useState('');
  const [newSymIcon, setNewSymIcon] = useState('Activity');

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ show: false, title: '', message: '', onConfirm: () => {} });

  useEffect(() => {
    loadData();
  }, []);

  // 🔥 [UPDATE] Load Data: Lấy thuốc từ kho thật & FIX LỖI LỌC
  const loadData = async () => {
    setProtocols(storage.getProtocols());
    setStations(storage.getKnownStations());
    setSymptoms(storage.getSymptoms());
    setEmployees(storage.getPatients());

    // Load Inventory from DB (Async)
    let loadedMeds: Medicine[] = [];
    if (window.electron) {
        try {
            // Lấy toàn bộ thuốc (bao gồm cả Master Data)
            const dbMeds = await window.electron.getInventory('ALL');
            loadedMeds = dbMeds || [];
        } catch (e) { console.error("Admin Load Inventory Error", e); }
    } else {
        loadedMeds = storage.getMedicines();
    }
    setMedicines(loadedMeds);

    // 🔥 GOM NHÓM UNIQUE NAME (ĐÃ SỬA LOGIC)
    const uniqueMap = new Map();
    loadedMeds.forEach(m => {
        // [FIX]: KHÔNG ĐƯỢC RETURN Ở ĐÂY. Ta CẦN lấy danh mục gốc.
        // if (m.batchNumber === 'DANH_MUC_GOC') return;  <-- XÓA DÒNG NÀY ĐI
        
        const key = m.name.trim(); // Key là tên thuốc
        
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, m);
        } else {
            // Nếu trùng tên, ưu tiên giữ lại dòng là 'DANH_MUC_GOC' (nếu có) vì nó chuẩn nhất
            if (m.batchNumber === 'DANH_MUC_GOC') {
                uniqueMap.set(key, m);
            }
        }
    });
    setUniqueMeds(Array.from(uniqueMap.values()).sort((a,b) => a.name.localeCompare(b.name)));
  };

  const isStationAdmin = currentUser.role === Role.ADMIN || currentUser.role === Role.MODERATOR;

  const showConfirm = (title: string, message: string, action: () => void) => {
    setConfirmModal({
        show: true,
        title,
        message,
        onConfirm: () => {
            action();
            setConfirmModal(prev => ({ ...prev, show: false }));
        }
    });
  };

  // --- Protocol Logic ---
  const handleApproveProtocol = (p: Protocol) => {
    const updated = { ...p, isApproved: true };
    storage.saveProtocol(updated);
    loadData();
  };

  const handleDeleteProtocol = (id: string) => {
    showConfirm('Xóa phác đồ / 删除协议', 'Bạn có chắc chắn muốn xóa phác đồ này? / 确定要删除此协议吗?', () => {
        storage.deleteProtocol(id);
        loadData();
    });
  };

  // 🔥 [UPDATE] Add Med Logic
  const handleAddMedToProto = () => {
      if (!selectedMedId) return;
      
      const medInfo = uniqueMeds.find(m => m.id === selectedMedId);
      if (!medInfo) return;

      const existing = newProtoMeds.find(m => m.medicineName === medInfo.name);
      
      if (existing) {
          setNewProtoMeds(newProtoMeds.map(m => m.medicineName === medInfo.name ? { ...m, quantity: selectedMedQty } : m));
      } else {
          setNewProtoMeds([...newProtoMeds, { 
              medicineId: medInfo.id, 
              medicineName: medInfo.name, 
              quantity: selectedMedQty,
              unit: medInfo.unit
          }]);
      }
      setSelectedMedId('');
      setSelectedMedQty(1);
  };

  const handleRemoveMedFromProto = (name: string) => {
      setNewProtoMeds(newProtoMeds.filter(m => m.medicineName !== name));
  };

  const handleCreateProtocol = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProtoGroup) {
        alert("Vui lòng chọn nhóm bệnh / 请选择疾病组");
        return;
    }
    const newP: Protocol = {
        id: crypto.randomUUID(),
        name: newProtoName,
        diagnosis: newProtoDiag,
        diseaseGroup: newProtoGroup,
        medicines: newProtoMeds, 
        isApproved: true
    };
    storage.saveProtocol(newP);
    setShowProtoForm(false);
    setNewProtoName(''); setNewProtoDiag(''); setNewProtoGroup(''); setNewProtoMeds([]);
    loadData();
  };

  // --- Station Logic ---
  const handleAddStation = () => {
    if (!newStationName) return;
    storage.addKnownStation({ name: newStationName, type: newStationType });
    setNewStationName('');
    loadData();
  };

  const handleDeleteStation = (name: string) => {
    showConfirm('Xóa trạm / 删除站点', `Bạn có chắc chắn muốn xóa trạm / 确定要删除站点 ${name}?`, () => {
        storage.removeKnownStation(name);
        loadData();
    });
  };

  // --- Symptom Logic ---
  const handleCreateSymptom = (e: React.FormEvent) => {
    e.preventDefault();
    const newSym: Symptom = {
      id: crypto.randomUUID(),
      vi: newSymVi,
      cn: newSymCn,
      icon: newSymIcon
    };
    storage.saveSymptom(newSym);
    setShowSymForm(false);
    setNewSymVi(''); setNewSymCn(''); setNewSymIcon('Activity');
    loadData();
  };

  const handleDeleteSymptom = (id: string) => {
    showConfirm('Xóa triệu chứng', 'Bạn có chắc chắn muốn xóa triệu chứng này?', () => {
      storage.deleteSymptom(id);
      loadData();
    });
  };

  // --- Employee Logic ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws);

          const importedPatients: Patient[] = [];
          data.forEach((row: any) => {
              const id = row['id_nv'] ? String(row['id_nv']).trim() : '';
              const name = row['ho_ten'] ? String(row['ho_ten']).trim() : '';
              const dept = row['bp'] ? String(row['bp']).trim() : '';

              if (id && name) {
                  importedPatients.push({ id, name, department: dept });
              }
          });

          if (importedPatients.length > 0) {
              storage.importPatients(importedPatients);
              loadData();
              alert(`Đã cập nhật ${importedPatients.length} nhân viên thành công!`);
          } else {
              alert("Không tìm thấy dữ liệu hợp lệ (id_nv, ho_ten, bp).");
          }
      };
      reader.readAsBinaryString(file);
  };

  const filteredEmployees = employees.filter(e => 
      e.id.toLowerCase().includes(empSearch.toLowerCase()) ||
      e.name.toLowerCase().includes(empSearch.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col gap-6 relative">
        {/* Custom Confirmation Modal */}
        {confirmModal.show && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-xl">
                <div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full animate-in fade-in zoom-in duration-200">
                    <div className="flex flex-col items-center text-center mb-4">
                        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 mb-3">
                            <AlertTriangle size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-gray-800">{confirmModal.title}</h3>
                        <p className="text-gray-600 mt-1">{confirmModal.message}</p>
                    </div>
                    <div className="flex gap-3">
                        <button 
                            onClick={() => setConfirmModal(prev => ({...prev, show: false}))}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
                        >
                            Hủy / 取消
                        </button>
                        <button 
                            onClick={confirmModal.onConfirm}
                            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700"
                        >
                            Xóa / 删除
                        </button>
                    </div>
                </div>
            </div>
        )}

        <div className="flex space-x-4 border-b pb-4 overflow-x-auto">
            <button 
                onClick={() => setActiveTab('protocols')}
                className={`flex items-center px-6 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${activeTab === 'protocols' ? 'bg-medical-green text-white shadow-lg' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
            >
                <FileText className="mr-2" size={20}/> Quản lý Phác đồ
            </button>
            <button 
                onClick={() => setActiveTab('employees')}
                className={`flex items-center px-6 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${activeTab === 'employees' ? 'bg-medical-green text-white shadow-lg' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
            >
                <Users className="mr-2" size={20}/> Quản lý Nhân viên
            </button>
            <button 
                onClick={() => setActiveTab('symptoms')}
                className={`flex items-center px-6 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${activeTab === 'symptoms' ? 'bg-medical-green text-white shadow-lg' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
            >
                <Activity className="mr-2" size={20}/> Quản lý Triệu chứng
            </button>
            <button 
                onClick={() => setActiveTab('stations')}
                disabled={!isStationAdmin}
                className={`flex items-center px-6 py-3 rounded-lg font-bold whitespace-nowrap transition-all ${activeTab === 'stations' ? 'bg-medical-green text-white shadow-lg' : 'bg-white text-gray-600 hover:bg-gray-100'} ${!isStationAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <Building2 className="mr-2" size={20}/> Quản lý Trạm
                {!isStationAdmin && <Lock size={14} className="ml-2"/>}
            </button>
        </div>

        <div className="flex-1 bg-white rounded-xl shadow-sm p-6 overflow-hidden flex flex-col">
            {activeTab === 'protocols' && (
                <>
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-gray-800">Danh sách Phác đồ / 协议列表</h3>
                        <button onClick={() => setShowProtoForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center hover:bg-blue-700">
                            <Plus size={18} className="mr-2"/> Tạo mới / 新建
                        </button>
                    </div>

                    {showProtoForm && (
                        <form onSubmit={handleCreateProtocol} className="mb-6 bg-gray-50 p-4 rounded-lg border">
                            <h4 className="font-bold text-gray-700 mb-4 border-b pb-2">Thông tin phác đồ / 协议信息</h4>
                            <div className="grid grid-cols-3 gap-4 mb-4">
                                <input placeholder="Tên phác đồ / 协议名称" required className="p-2 border rounded" value={newProtoName} onChange={e => setNewProtoName(e.target.value)} />
                                <input placeholder="Chẩn đoán mặc định / 默认诊断" required className="p-2 border rounded" value={newProtoDiag} onChange={e => setNewProtoDiag(e.target.value)} />
                                <select 
                                    className="p-2 border rounded" 
                                    value={newProtoGroup} 
                                    onChange={e => setNewProtoGroup(e.target.value)}
                                    required
                                >
                                    <option value="">-- Chọn nhóm bệnh / 选择疾病组 --</option>
                                    {DISEASE_GROUPS.map(g => (
                                        <option key={g} value={g}>{g}</option>
                                    ))}
                                </select>
                            </div>
                            
                            <h4 className="font-bold text-gray-700 mb-2 mt-4 text-sm">Thêm thuốc vào phác đồ / 添加药物</h4>
                            <div className="flex gap-2 mb-4 bg-white p-2 rounded border">
                                <select 
                                    className="flex-1 border p-2 rounded"
                                    value={selectedMedId}
                                    onChange={e => setSelectedMedId(e.target.value)}
                                >
                                    <option value="">-- Chọn thuốc / 选择药物 --</option>
                                    {uniqueMeds.map(m => (
                                        <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                                    ))}
                                </select>
                                <input 
                                    type="number" 
                                    min="1" 
                                    className="w-20 border p-2 rounded"
                                    value={selectedMedQty}
                                    onChange={e => setSelectedMedQty(parseInt(e.target.value))}
                                />
                                <button type="button" onClick={handleAddMedToProto} className="bg-green-600 text-white px-3 rounded font-bold">
                                    {newProtoMeds.find(m => m.medicineId === selectedMedId) ? "Cập nhật / 更新" : "Thêm / 添加"}
                                </button>
                            </div>

                            {newProtoMeds.length > 0 && (
                                <div className="mb-4">
                                    <ul className="space-y-2">
                                        {newProtoMeds.map((pm, idx) => {
                                            const mName = medicines.find(m => m.id === pm.medicineId)?.name || pm.medicineName || pm.medicineId;
                                            return (
                                                <li key={idx} className="flex justify-between items-center bg-white border p-2 rounded-lg text-sm">
                                                    <span>{mName} (SL: {pm.quantity})</span>
                                                    <button type="button" onClick={() => handleRemoveMedFromProto(pm.medicineName)} className="text-red-500 hover:text-red-700">
                                                        <X size={16} />
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            )}

                            <div className="flex justify-end gap-2 mt-4 border-t pt-4">
                                <button type="button" onClick={() => setShowProtoForm(false)} className="px-3 py-2 text-gray-500">Hủy / 取消</button>
                                <button type="submit" className="bg-medical-green text-white px-4 py-2 rounded font-bold">Lưu Phác đồ / 保存协议</button>
                            </div>
                        </form>
                    )}

                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-100 text-gray-600">
                                    <th className="p-3">Tên / 名称</th>
                                    <th className="p-3">Chẩn đoán / 诊断</th>
                                    <th className="p-3">Nhóm bệnh / 组</th>
                                    <th className="p-3">Thuốc / 药物</th>
                                    <th className="p-3">Trạng thái / 状态</th>
                                    <th className="p-3 text-right">Hành động / 操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {protocols.map(p => (
                                    <tr key={p.id} className="border-b hover:bg-gray-50">
                                        <td className="p-3 font-bold">{p.name}</td>
                                        <td className="p-3">{p.diagnosis}</td>
                                        <td className="p-3 text-sm">{p.diseaseGroup}</td>
                                        <td className="p-3 text-sm text-gray-500">
                                            {p.medicines.length} loại thuốc
                                        </td>
                                        <td className="p-3">
                                            <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">Đã duyệt / 已批准</span>
                                        </td>
                                        <td className="p-3 flex justify-end gap-2">
                                            <button onClick={() => handleDeleteProtocol(p.id)} className="text-red-600 bg-red-50 p-2 rounded hover:bg-red-100" title="Xóa">
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* STATION, SYMPTOM, EMPLOYEE TABS KEPT AS IS */}
            {activeTab === 'stations' && isStationAdmin && (
                <>
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-gray-800">Cấu hình Danh sách Trạm / 站点配置</h3>
                    </div>

                    <div className="mb-6 flex gap-4 bg-gray-50 p-4 rounded-lg">
                        <input 
                            placeholder="Tên trạm mới / 新站点 (VD: Spoke X9)" 
                            className="flex-1 p-2 border rounded"
                            value={newStationName}
                            onChange={e => setNewStationName(e.target.value)}
                        />
                        <select 
                            className="p-2 border rounded"
                            value={newStationType}
                            onChange={e => setNewStationType(e.target.value)}
                        >
                            <option value="SPOKE">SPOKE</option>
                            <option value="HUB">HUB</option>
                        </select>
                        <button onClick={handleAddStation} className="bg-medical-green text-white px-4 py-2 rounded font-bold hover:bg-green-600">
                            Thêm / 添加
                        </button>
                    </div>

                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-100 text-gray-600">
                                    <th className="p-3">Tên Trạm / 站点名称</th>
                                    <th className="p-3">Loại / 类型</th>
                                    <th className="p-3 text-right">Hành động / 操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stations.map((s, idx) => (
                                    <tr key={idx} className="border-b hover:bg-gray-50">
                                        <td className="p-3 font-bold">{s.name}</td>
                                        <td className="p-3">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${s.type === 'HUB' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {s.type}
                                            </span>
                                        </td>
                                        <td className="p-3 text-right">
                                            <button onClick={() => handleDeleteStation(s.name)} className="text-red-500 hover:text-red-700">
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {activeTab === 'symptoms' && (
              <>
                 <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-gray-800">Quản lý Danh mục Triệu chứng / 症状管理</h3>
                    <button onClick={() => setShowSymForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center hover:bg-blue-700">
                       <Plus size={18} className="mr-2"/> Thêm triệu chứng / 添加
                    </button>
                 </div>

                 {showSymForm && (
                   <form onSubmit={handleCreateSymptom} className="mb-6 bg-gray-50 p-4 rounded-lg border">
                      <div className="grid grid-cols-3 gap-4 mb-4">
                         <input placeholder="Tiếng Việt (Ví dụ: Đau đầu)" required className="p-2 border rounded" value={newSymVi} onChange={e => setNewSymVi(e.target.value)} />
                         <input placeholder="Tiếng Trung (Ví dụ: 头痛)" required className="p-2 border rounded" value={newSymCn} onChange={e => setNewSymCn(e.target.value)} />
                         <select 
                           className="p-2 border rounded"
                           value={newSymIcon}
                           onChange={e => setNewSymIcon(e.target.value)}
                         >
                            {AVAILABLE_ICONS.map(icon => (
                              <option key={icon} value={icon}>{icon}</option>
                            ))}
                         </select>
                      </div>
                      <div className="flex justify-end gap-2">
                         <button type="button" onClick={() => setShowSymForm(false)} className="px-3 py-2 text-gray-500">Hủy / 取消</button>
                         <button type="submit" className="bg-medical-green text-white px-4 py-2 rounded font-bold">Lưu / 保存</button>
                      </div>
                   </form>
                 )}

                 <div className="flex-1 overflow-auto grid grid-cols-2 md:grid-cols-4 gap-4">
                    {symptoms.map(s => (
                       <div key={s.id} className="border rounded-xl p-4 flex flex-col items-center bg-white shadow-sm relative group">
                          <button onClick={() => handleDeleteSymptom(s.id)} className="absolute top-2 right-2 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                             <Trash2 size={18} />
                          </button>
                          <div className="text-gray-600 mb-2 font-mono text-xs">{s.icon}</div>
                          <div className="font-bold text-lg">{s.vi}</div>
                          <div className="text-sm text-gray-500">{s.cn}</div>
                       </div>
                    ))}
                 </div>
              </>
            )}

            {activeTab === 'employees' && (
                <>
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-gray-800">Quản lý Dữ liệu Nhân viên / 员工数据管理</h3>
                        <div className="flex gap-2">
                            <label className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold flex items-center hover:bg-green-700 cursor-pointer">
                                <Upload size={18} className="mr-2"/> Import Excel (id_nv, ho_ten, bp)
                                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
                            </label>
                        </div>
                    </div>

                    <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4 text-sm text-blue-800">
                        <p className="font-bold">Cơ chế tự động / 自动机制:</p>
                        <ul className="list-disc pl-5 mt-1 space-y-1">
                            <li>Nhập file Excel sẽ cập nhật tên/bộ phận nếu ID đã tồn tại. / Excel导入将更新现有ID的信息。</li>
                            <li>Nếu ID chưa có, hệ thống sẽ thêm mới. / 如果ID不存在，系统将添加新记录。</li>
                            <li>Dữ liệu cũ không có trong file Excel vẫn được giữ nguyên. / Excel中没有的旧数据将被保留。</li>
                        </ul>
                    </div>

                    <div className="flex items-center mb-4 bg-gray-100 p-2 rounded-lg">
                        <Search size={20} className="text-gray-500 ml-2" />
                        <input 
                            placeholder="Tìm kiếm nhân viên (ID, Tên) / 搜索员工..." 
                            className="bg-transparent border-none focus:ring-0 p-2 flex-1"
                            value={empSearch}
                            onChange={e => setEmpSearch(e.target.value)}
                        />
                    </div>

                    <div className="flex-1 overflow-auto border rounded-lg">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-100 sticky top-0">
                                <tr>
                                    <th className="p-3">ID NV / 员工ID</th>
                                    <th className="p-3">Họ và Tên / 姓名</th>
                                    <th className="p-3">Bộ phận / 部门</th>
                                    <th className="p-3 text-right">Trạng thái / 状态</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredEmployees.map(e => (
                                    <tr key={e.id} className="hover:bg-gray-50">
                                        <td className="p-3 font-mono font-bold text-gray-700">{e.id}</td>
                                        <td className="p-3 font-bold">{e.name}</td>
                                        <td className="p-3 text-gray-600">{e.department}</td>
                                        <td className="p-3 text-right">
                                            <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">Active</span>
                                        </td>
                                    </tr>
                                ))}
                                {filteredEmployees.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="p-6 text-center text-gray-400">Không tìm thấy dữ liệu / 无数据</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    </div>
  );
};