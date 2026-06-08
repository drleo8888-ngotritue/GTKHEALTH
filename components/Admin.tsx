import React, { useState, useEffect } from 'react';
import { User, Role, Protocol, StationType, Medicine, Symptom, Patient, ServerSyncConfig } from '../types';
import { storage } from '../services/storage';
import { Check, X, Trash2, Plus, Building2, FileText, Lock, AlertTriangle, Activity, Users, Upload, Search, ClipboardList, RefreshCw, PackageOpen, Tag, ShieldAlert, Server, Wifi, WifiOff, FileSpreadsheet, Pencil } from 'lucide-react';
import { INITIAL_MEDICINES, STAFF_LIST } from '../constants';
import * as XLSX from 'xlsx';
import { HealthTimeline } from './HealthTimeline';
import { ImportFailModal } from './ImportFailModal';
import { KskImportWizard } from './KskImportWizard';
import { KskReportModal } from './KskReportModal';

interface AdminProps {
  currentUser: User;
}

const AVAILABLE_ICONS = [
  'Frown', 'CircleDot', 'Thermometer', 'Wind', 'Bandage', 'BatteryLow', 'Activity', 'Zap', 'CloudRain'
];

export const Admin: React.FC<AdminProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'protocols' | 'stations' | 'symptoms' | 'diseaseGroups' | 'infectiousDiseases' | 'employees' | 'update' | 'reset' | 'serverSync' | 'accounts' | null>(null);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [stations, setStations] = useState<{name: string, type: string}[]>([]);
  
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [uniqueMeds, setUniqueMeds] = useState<Medicine[]>([]); // Unique (để dropdown)

  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  // Không load toàn bộ employees lên state – chỉ search khi cần
  const [empSearch, setEmpSearch] = useState('');
  const [empResults, setEmpResults] = useState<Patient[]>([]);
  const [empTotal, setEmpTotal] = useState<number | null>(null);
  const [empLoading, setEmpLoading] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Patient | null>(null);
  const [editEmpName, setEditEmpName] = useState('');
  const [editEmpDept, setEditEmpDept] = useState('');

  // Health Timeline Modal
  const [timelinePatient, setTimelinePatient] = useState<Patient | null>(null);

  // KSK Upload & Report
  const [kskYear, setKskYear] = useState<number>(new Date().getFullYear());
  const [showKskWizard, setShowKskWizard] = useState(false);
  const [showKskReport, setShowKskReport] = useState(false);


  // Import Fail Modal
  const [importFail, setImportFail] = useState<{ type: 'employee' | 'ksk'; message: string } | null>(null);

  // Update state
  const [updateStatus, setUpdateStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ type: 'idle' });
  
  // New Protocol Form State
  const [showProtoForm, setShowProtoForm] = useState(false);
  const [editingProtoId, setEditingProtoId] = useState<string | null>(null);
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

  // Disease Groups State
  const [diseaseGroups, setDiseaseGroups] = useState<string[]>([]);
  const [showDgForm, setShowDgForm] = useState(false);
  const [newDgName, setNewDgName] = useState('');
  const [editingDg, setEditingDg] = useState<string | null>(null);
  const [editDgName, setEditDgName] = useState('');

  // Infectious Diseases State
  const [infectiousDiseases, setInfectiousDiseases] = useState<Record<'A' | 'B' | 'C', string[]>>(() => storage.getInfectiousDiseases());
  const [activeInfGroup, setActiveInfGroup] = useState<'A' | 'B' | 'C'>('A');
  const [newInfDisease, setNewInfDisease] = useState('');

  // Reset Modal State
  const [resetModal, setResetModal] = useState<{
    show: boolean;
    title: string;
    description: string;
    action: () => Promise<void>;
  } | null>(null);
  const [resetInput, setResetInput] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetResult, setResetResult] = useState<{ success: boolean; message: string } | null>(null);

  // Server Sync Config State
  const [syncConfig, setSyncConfig] = useState<ServerSyncConfig>({ enabled: false, serverUrl: '', apiKey: '', retryIntervalMinutes: 5, syncEmployeesOnStartup: true, employeeSyncIntervalHours: 1 });
  const [unsyncedCount, setUnsyncedCount] = useState<{ encounters: number; medicines: number; inventoryLogs: number } | null>(null);
  const [syncTestStatus, setSyncTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [syncTestMessage, setSyncTestMessage] = useState('');
  const [syncSaved, setSyncSaved] = useState(false);

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

  // Debounced search employees – chỉ chạy khi user nhập >= 2 ký tự
  useEffect(() => {
    const q = empSearch.trim();
    if (q.length < 2) {
      setEmpResults([]);
      return;
    }
    setEmpLoading(true);
    const timer = setTimeout(() => {
      const results = storage.searchPatients(q, 100);
      setEmpResults(results);
      // Lấy tổng số lần đầu tiên (cache đã warm sau searchPatients)
      if (empTotal === null) setEmpTotal(storage.getPatientCount());
      setEmpLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [empSearch]);

  // 🔥 [UPDATE] Load Data: Lấy thuốc từ kho thật & FIX LỖI LỌC
  const loadData = async () => {
    setProtocols(storage.getProtocols());
    setStations(storage.getKnownStations());
    setSymptoms(storage.getSymptoms());
    setDiseaseGroups(storage.getDiseaseGroups());
    setSyncConfig(storage.getServerSyncConfig());
    if (window.electron?.getUnsyncedCount) {
      window.electron.getUnsyncedCount().then(setUnsyncedCount);
    }
    // KHÔNG load employees ở đây – dùng lazy search (tránh lag 100k records)

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

  const handleEditProtocol = (p: Protocol) => {
      setEditingProtoId(p.id);
      setNewProtoName(p.name);
      setNewProtoDiag(p.diagnosis);
      setNewProtoGroup(p.diseaseGroup);
      
      const loadedMeds = p.medicines.map(pm => {
          const mInfo = uniqueMeds.find(m => m.id === pm.medicineId);
          return {
              medicineId: pm.medicineId,
              medicineName: mInfo?.name || pm.medicineId,
              quantity: pm.quantity,
              unit: mInfo?.unit || ''
          };
      });
      setNewProtoMeds(loadedMeds);
      setShowProtoForm(true);
      
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCreateProtocol = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProtoGroup) {
        alert("Vui lòng chọn nhóm bệnh / 请选择疾病组");
        return;
    }
    const newP: Protocol = {
        id: editingProtoId || crypto.randomUUID(),
        name: newProtoName,
        diagnosis: newProtoDiag,
        diseaseGroup: newProtoGroup,
        medicines: newProtoMeds.map(m => ({ medicineId: m.medicineId, medicineName: m.medicineName, quantity: m.quantity, unit: m.unit })),
        isApproved: true
    };
    storage.saveProtocol(newP);
    setShowProtoForm(false);
    setEditingProtoId(null);
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
    showConfirm('Xóa triệu chứng / 删除症状', 'Bạn có chắc chắn muốn xóa triệu chứng này? / 确定要删除此症状吗?', () => {
      storage.deleteSymptom(id);
      loadData();
    });
  };

  // --- Disease Group Logic ---
  const handleCreateDiseaseGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDgName.trim()) return;
    storage.saveDiseaseGroup(newDgName.trim());
    setShowDgForm(false);
    setNewDgName('');
    loadData();
  };

  const handleDeleteDiseaseGroup = (group: string) => {
    showConfirm('Xóa nhóm bệnh / 删除疾病组', `Bạn có chắc chắn muốn xóa nhóm "${group}"? / 确定要删除疾病组吗?`, () => {
      storage.deleteDiseaseGroup(group);
      loadData();
    });
  };

  const handleStartEditDg = (group: string) => {
    setEditingDg(group);
    setEditDgName(group);
    setShowDgForm(false);
  };

  const handleSaveEditDg = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = editDgName.trim();
    if (!trimmed || trimmed === editingDg) { setEditingDg(null); return; }
    if (diseaseGroups.includes(trimmed)) {
      alert('Tên nhóm bệnh đã tồn tại / 疾病组名称已存在');
      return;
    }
    const oldName = editingDg!;
    // Cập nhật localStorage (và fallback encounters)
    storage.renameDiseaseGroup(oldName, trimmed);
    // Cập nhật encounters trong Electron/SQLite nếu có
    if (window.electron) {
      const all = await window.electron.getAllEncounters();
      const toUpdate = all.filter(enc => enc.diseaseGroup === oldName);
      await Promise.all(toUpdate.map(enc =>
        window.electron.updateEncounter({ ...enc, diseaseGroup: trimmed })
      ));
    }
    setEditingDg(null);
    loadData();
  };

  // --- Template generators ---
  const downloadEmployeeTemplate = () => {
      const rows = [
          ['id_nv', 'ho_ten', 'bp'],
          ['GTK001', 'NGUYỄN VĂN A', 'Sản xuất'],
          ['GTK002', 'TRẦN THỊ B', 'Kho vận'],
          ['GTK003', 'LÊ VĂN C', 'Hành chính'],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 22 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'DS_NhanVien');
      XLSX.writeFile(wb, 'template_danh_sach_nhan_vien.xlsx');
  };

  const downloadKskTemplate = () => {
      const rows = [
          ['Mã NV', 'Họ và tên', 'Bộ phận', 'Kết luận SK', 'Kết luận bệnh', 'Huyết áp (mmHg)', 'Nhịp tim (lần/ph)', 'Chiều cao (cm)', 'Cân nặng (kg)', 'BMI', 'Thị lực mắt P', 'Thị lực mắt T'],
          ['GTK001', 'NGUYỄN VĂN A', 'Sản xuất', 'Loại I', 'Không có bệnh lý', '120/80', '72', '170', '65', '22.5', '10/10', '10/10'],
          ['GTK002', 'TRẦN THỊ B', 'Kho vận', 'Loại II', 'Cận thị, thừa cân', '130/85', '78', '158', '70', '28.0', '6/10', '8/10'],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 28 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 16 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `KSK_${kskYear}`);
      XLSX.writeFile(wb, `template_KSK_${kskYear}.xlsx`);
  };

  // --- Employee Logic ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';

      const reader = new FileReader();
      reader.onload = (evt) => {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(ws);

          const importedPatients: Patient[] = [];
          data.forEach((row: any) => {
              const id = row['id_nv'] ? String(row['id_nv']).trim() : '';
              const name = row['ho_ten'] ? String(row['ho_ten']).trim() : '';
              const dept = row['bp'] ? String(row['bp']).trim() : '';
              if (id && name) importedPatients.push({ id, name, department: dept });
          });

          if (importedPatients.length > 0) {
              const existingMap = new Map(storage.getPatients().map((p: Patient) => [p.id, p]));
              let newCount = 0, updatedCount = 0;
              importedPatients.forEach(p => {
                  if (!existingMap.has(p.id)) newCount++;
                  else {
                      const ex = existingMap.get(p.id)!;
                      if (ex.name !== p.name || ex.department !== p.department) updatedCount++;
                  }
              });
              storage.importPatients(importedPatients);
              setEmpTotal(storage.getPatientCount());
              setEmpResults([]);
              setEmpSearch('');
              alert(`✅ Hoàn tất nhập danh sách nhân viên!\n• ${newCount} nhân viên mới thêm\n• ${updatedCount} nhân viên cập nhật\n• ${importedPatients.length - newCount - updatedCount} không thay đổi`);
          } else {
              setImportFail({
                  type: 'employee',
                  message: 'Không tìm thấy dữ liệu hợp lệ. File cần có 3 cột: "id_nv", "ho_ten", "bp".'
              });
          }
      };
      reader.readAsBinaryString(file);
  };


  const handleApplyUpdate = async () => {
    if (!window.electron) return;
    setUpdateStatus({ type: 'loading' });
    const result = await window.electron.applyUpdate();
    if (result.canceled) {
      setUpdateStatus({ type: 'idle' });
    } else if (result.success) {
      setUpdateStatus({ type: 'success', message: 'Đang áp dụng cập nhật và khởi động lại...' });
    } else {
      setUpdateStatus({ type: 'error', message: result.message || 'Lỗi không xác định' });
    }
  };

  const handleSaveSyncConfig = () => {
    storage.saveServerSyncConfig(syncConfig);
    // Đẩy config xuống main process để background worker dùng
    window.electron?.updateServerSyncConfig(syncConfig);
    setSyncSaved(true);
    setTimeout(() => setSyncSaved(false), 2000);
  };

  const handleSyncNow = async () => {
    if (!window.electron?.syncNow) return;
    setSyncTestStatus('loading');
    setSyncTestMessage('Đang đồng bộ...');
    try {
      const res = await window.electron.syncNow();
      if (res.success) {
        setSyncTestStatus('success');
        setSyncTestMessage('Đồng bộ thành công!');
        if (res.unsyncedCount) setUnsyncedCount(res.unsyncedCount);
      } else {
        setSyncTestStatus('error');
        setSyncTestMessage('Đồng bộ thất bại, kiểm tra lại kết nối.');
      }
    } catch {
      setSyncTestStatus('error');
      setSyncTestMessage('Lỗi kết nối server.');
    }
  };

  const handleTestConnection = async () => {
    if (!syncConfig.serverUrl) return;
    setSyncTestStatus('loading');
    setSyncTestMessage('');
    try {
      const res = await fetch(`${syncConfig.serverUrl.replace(/\/$/, '')}/api/ping`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${syncConfig.apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        setSyncTestStatus('success');
        setSyncTestMessage('Kết nối thành công!');
      } else {
        setSyncTestStatus('error');
        setSyncTestMessage(`Server trả về lỗi: ${res.status} ${res.statusText}`);
      }
    } catch (err: any) {
      setSyncTestStatus('error');
      setSyncTestMessage(err.name === 'TimeoutError' ? 'Timeout — Server không phản hồi sau 5 giây' : `Không thể kết nối: ${err.message}`);
    }
  };

  const handleEditEmp = (emp: Patient) => {
    setEditingEmp(emp);
    setEditEmpName(emp.name);
    setEditEmpDept(emp.department);
  };

  const handleSaveEmp = () => {
    if (!editingEmp) return;
    const updated: Patient = { ...editingEmp, name: editEmpName.trim(), department: editEmpDept.trim() };
    storage.savePatient(updated);
    setEmpResults(prev => prev.map(e => e.id === updated.id ? updated : e));
    setEditingEmp(null);
  };

  const handleDeleteEmp = (emp: Patient) => {
    showConfirm(
      'Xóa nhân viên / 删除员工',
      `Xóa "${emp.name}" (${emp.id}) khỏi hệ thống? / 从系统中删除此员工? 操作不可撤销。`,
      () => {
        storage.deletePatient(emp.id);
        setEmpResults(prev => prev.filter(e => e.id !== emp.id));
        setEmpTotal(prev => prev !== null ? prev - 1 : prev);
      }
    );
  };

  // empResults thay cho filteredEmployees – được tính qua debounced search

  const openResetModal = (title: string, description: string, action: () => Promise<void>) => {
    setResetInput('');
    setResetResult(null);
    setResetModal({ show: true, title, description, action });
  };

  const handleConfirmReset = async () => {
    if (!resetModal || resetInput !== 'reset') return;
    setResetLoading(true);
    setResetResult(null);
    try {
      await resetModal.action();
      setResetResult({ success: true, message: 'Đã xóa dữ liệu thành công!' });
      setResetInput('');
    } catch (err: any) {
      setResetResult({ success: false, message: err.message || 'Lỗi không xác định' });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-6 relative">
        {/* KSK Report Modal */}
        {showKskReport && (
            <KskReportModal onClose={() => setShowKskReport(false)}/>
        )}

        {/* KSK Import Wizard */}
        {showKskWizard && (
            <KskImportWizard
                year={kskYear}
                onSuccess={(count, filename) => {
                    setShowKskWizard(false);
                    alert(`✅ Đã import ${count} kết quả KSKĐ năm ${kskYear} từ file "${filename}" thành công!`);
                }}
                onCancel={() => setShowKskWizard(false)}
            />
        )}
        {/* Import Fail Modal */}
        {importFail && (
            <ImportFailModal
                message={importFail.message}
                onDownloadTemplate={() => {
                    if (importFail.type === 'employee') downloadEmployeeTemplate();
                    else downloadKskTemplate();
                }}
                onClose={() => setImportFail(null)}
            />
        )}

        {/* Health Timeline Modal */}
        {timelinePatient && (
            <HealthTimeline
                patientId={timelinePatient.id}
                patientName={timelinePatient.name}
                department={timelinePatient.department}
                mode="full"
                onClose={() => setTimelinePatient(null)}
            />
        )}

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

        {/* Grid chọn chức năng — hiện khi chưa chọn tab nào */}
        {activeTab === null && (
            <div className="grid grid-cols-4 gap-4">
                {[
                    { id: 'protocols',     icon: FileText,    label: 'Quản lý Phác đồ',      sub: '协议管理',    color: 'green',  disabled: false },
                    { id: 'employees',     icon: Users,       label: 'Quản lý Nhân viên',     sub: '员工管理',    color: 'green',  disabled: false },
                    { id: 'symptoms',      icon: Activity,    label: 'Quản lý Triệu chứng',   sub: '症状管理',    color: 'green',  disabled: false },
                    { id: 'diseaseGroups',       icon: Tag,         label: 'Quản lý Nhóm bệnh',         sub: '疾病组管理',  color: 'green',  disabled: false },
                    { id: 'infectiousDiseases',  icon: Tag,         label: '🦠 Bệnh truyền nhiễm A/B/C', sub: '传染病管理',  color: 'green',  disabled: false },
                    { id: 'stations',      icon: Building2,   label: 'Quản lý Trạm',          sub: '站点管理',    color: 'green',  disabled: !isStationAdmin, lock: true },
                    { id: 'update',        icon: PackageOpen, label: 'Cập nhật ứng dụng',     sub: '应用更新',    color: 'green',  disabled: false },
                    { id: 'serverSync',    icon: Server,      label: 'Đồng bộ Server',        sub: '服务器同步',  color: 'blue',   disabled: false },
                    { id: 'accounts',      icon: Lock,        label: 'Tài khoản nhân viên',   sub: '员工账户',    color: 'blue',   disabled: !isStationAdmin, lock: true },
                    { id: 'reset',         icon: ShieldAlert, label: 'Reset dữ liệu',         sub: '重置数据',    color: 'red',    disabled: false },
                ].map(item => {
                    const Icon = item.icon;
                    const colorMap: Record<string, string> = {
                        green: 'border-green-200 hover:border-green-400 hover:bg-green-50 text-green-700',
                        blue:  'border-blue-200  hover:border-blue-400  hover:bg-blue-50  text-blue-700',
                        red:   'border-red-200   hover:border-red-400   hover:bg-red-50   text-red-700',
                    };
                    const iconBg: Record<string, string> = {
                        green: 'bg-green-100 text-green-600',
                        blue:  'bg-blue-100 text-blue-600',
                        red:   'bg-red-100 text-red-600',
                    };
                    return (
                        <button
                            key={item.id}
                            disabled={item.disabled}
                            onClick={() => !item.disabled && setActiveTab(item.id as any)}
                            className={`flex flex-col items-center gap-3 p-6 bg-white border-2 rounded-xl shadow-sm transition-all ${item.disabled ? 'opacity-40 cursor-not-allowed border-gray-200 text-gray-400' : colorMap[item.color]}`}
                        >
                            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${item.disabled ? 'bg-gray-100 text-gray-400' : iconBg[item.color]}`}>
                                <Icon size={28}/>
                            </div>
                            <div className="text-center">
                                <div className="font-bold text-sm leading-tight flex items-center justify-center gap-1">
                                    {item.label}
                                    {item.lock && !isStationAdmin && <Lock size={12}/>}
                                </div>
                                <div className="text-xs text-gray-400 mt-0.5">{item.sub}</div>
                            </div>
                        </button>
                    );
                })}
            </div>
        )}

        {/* Nút quay lại khi đang trong 1 chức năng */}
        {activeTab !== null && (
            <div className="flex items-center gap-2 mb-2">
                <button
                    onClick={() => setActiveTab(null as any)}
                    className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-all"
                >
                    ← Quay lại / 返回
                </button>
            </div>
        )}

        {activeTab !== null && <div className="flex-1 bg-white rounded-xl shadow-sm p-6 overflow-hidden flex flex-col">
            {activeTab === 'protocols' && (
                <>
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-gray-800">Danh sách Phác đồ / 协议列表</h3>
                        <button onClick={() => { setEditingProtoId(null); setNewProtoName(''); setNewProtoDiag(''); setNewProtoGroup(''); setNewProtoMeds([]); setShowProtoForm(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center hover:bg-blue-700">
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
                                    {diseaseGroups.map(g => (
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
                                <button type="button" onClick={() => { setShowProtoForm(false); setEditingProtoId(null); setNewProtoName(''); setNewProtoDiag(''); setNewProtoGroup(''); setNewProtoMeds([]); }} className="px-3 py-2 text-gray-500">Hủy / 取消</button>
                                <button type="submit" className="bg-medical-green text-white px-4 py-2 rounded font-bold">
                                    {editingProtoId ? "Cập nhật / 更新协议" : "Lưu Phác đồ / 保存协议"}
                                </button>
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
                                            <button onClick={() => handleEditProtocol(p)} className="text-blue-600 bg-blue-50 p-2 rounded hover:bg-blue-100" title="Sửa">
                                                <Pencil size={18} />
                                            </button>
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

            {activeTab === 'diseaseGroups' && (
              <>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-gray-800">Quản lý Nhóm bệnh / 疾病组管理</h3>
                  <button onClick={() => setShowDgForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center hover:bg-blue-700">
                    <Plus size={18} className="mr-2 shrink-0"/><span>Thêm nhóm bệnh<span className="block text-[9px] font-normal opacity-80 leading-tight">添加疾病组</span></span>
                  </button>
                </div>

                {showDgForm && (
                  <form onSubmit={handleCreateDiseaseGroup} className="mb-6 bg-gray-50 p-4 rounded-lg border">
                    <div className="flex gap-4 mb-4">
                      <input
                        placeholder="Tên nhóm bệnh (VD: Sản phụ khoa / 产科妇科)"
                        required
                        className="flex-1 p-2 border rounded"
                        value={newDgName}
                        onChange={e => setNewDgName(e.target.value)}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => { setShowDgForm(false); setNewDgName(''); }} className="px-3 py-2 text-gray-500">Hủy / 取消</button>
                      <button type="submit" className="bg-medical-green text-white px-4 py-2 rounded font-bold">Lưu / 保存</button>
                    </div>
                  </form>
                )}

                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="p-3 font-bold text-gray-700">STT</th>
                        <th className="p-3 font-bold text-gray-700">Tên nhóm bệnh / 疾病组名称</th>
                        <th className="p-3 w-24"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {diseaseGroups.map((g, idx) => (
                        <tr key={g} className="border-t hover:bg-gray-50">
                          <td className="p-3 text-gray-500 text-sm">{idx + 1}</td>
                          {editingDg === g ? (
                            <td className="p-2" colSpan={2}>
                              <form onSubmit={handleSaveEditDg} className="flex items-center gap-2">
                                <input
                                  autoFocus
                                  className="flex-1 border rounded px-2 py-1 text-sm"
                                  value={editDgName}
                                  onChange={e => setEditDgName(e.target.value)}
                                />
                                <button type="submit" className="text-green-600 hover:text-green-800 transition-colors" title="Lưu / 保存">
                                  <Check size={18}/>
                                </button>
                                <button type="button" onClick={() => setEditingDg(null)} className="text-gray-400 hover:text-gray-600 transition-colors" title="Hủy / 取消">
                                  <X size={18}/>
                                </button>
                              </form>
                            </td>
                          ) : (
                            <>
                              <td className="p-3 font-medium">{g}</td>
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <button onClick={() => handleStartEditDg(g)} className="text-blue-400 hover:text-blue-600 transition-colors" title="Sửa / 编辑">
                                    <Pencil size={16}/>
                                  </button>
                                  <button onClick={() => handleDeleteDiseaseGroup(g)} className="text-red-400 hover:text-red-600 transition-colors" title="Xóa / 删除">
                                    <Trash2 size={18}/>
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {activeTab === 'infectiousDiseases' && (
              <>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-gray-800">🦠 Bệnh truyền nhiễm A/B/C / 传染病管理</h3>
                </div>

                {/* Group tabs */}
                <div className="flex gap-2 mb-6">
                  {(['A', 'B', 'C'] as const).map(g => (
                    <button
                      key={g}
                      onClick={() => { setActiveInfGroup(g); setNewInfDisease(''); }}
                      className={`px-6 py-2 rounded-lg font-bold border-2 transition-all ${
                        activeInfGroup === g
                          ? g === 'A' ? 'bg-red-500 border-red-600 text-white'
                            : g === 'B' ? 'bg-orange-500 border-orange-600 text-white'
                            : 'bg-yellow-500 border-yellow-600 text-white'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
                      }`}
                    >
                      <span>Nhóm {g} <span className="text-[10px] font-normal opacity-80">{g === 'A' ? '甲类' : g === 'B' ? '乙类' : '丙类'}</span></span>
                      <span className="ml-2 text-xs opacity-75">({infectiousDiseases[g].length} bệnh)</span>
                    </button>
                  ))}
                </div>

                {/* Add form */}
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    const name = newInfDisease.trim();
                    if (!name) return;
                    storage.addInfectiousDisease(activeInfGroup, name);
                    setInfectiousDiseases(storage.getInfectiousDiseases());
                    setNewInfDisease('');
                  }}
                  className="flex gap-3 mb-6"
                >
                  <input
                    className="flex-1 p-2 border-2 rounded-lg focus:border-red-400 outline-none"
                    placeholder={`Tên bệnh mới thuộc Nhóm ${activeInfGroup}...`}
                    value={newInfDisease}
                    onChange={e => setNewInfDisease(e.target.value)}
                  />
                  <button
                    type="submit"
                    className={`px-5 py-2 rounded-lg font-bold text-white ${
                      activeInfGroup === 'A' ? 'bg-red-500 hover:bg-red-600'
                        : activeInfGroup === 'B' ? 'bg-orange-500 hover:bg-orange-600'
                        : 'bg-yellow-500 hover:bg-yellow-600'
                    }`}
                  >
                    <Plus size={18}/>
                  </button>
                </form>

                {/* Disease list */}
                <div className="flex-1 overflow-auto">
                  <div className="flex flex-wrap gap-2">
                    {infectiousDiseases[activeInfGroup].map(d => (
                      <div
                        key={d}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border font-medium text-sm ${
                          activeInfGroup === 'A' ? 'bg-red-50 border-red-200 text-red-800'
                            : activeInfGroup === 'B' ? 'bg-orange-50 border-orange-200 text-orange-800'
                            : 'bg-yellow-50 border-yellow-200 text-yellow-800'
                        }`}
                      >
                        {d}
                        <button
                          onClick={() => {
                            storage.removeInfectiousDisease(activeInfGroup, d);
                            setInfectiousDiseases(storage.getInfectiousDiseases());
                          }}
                          className="text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <X size={14}/>
                        </button>
                      </div>
                    ))}
                  </div>
                  {infectiousDiseases[activeInfGroup].length === 0 && (
                    <p className="text-gray-400 italic text-center py-8">Chưa có bệnh nào trong Nhóm {activeInfGroup} / 暂无疾病记录</p>
                  )}
                </div>
              </>
            )}

            {activeTab === 'employees' && (
                <>
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h3 className="text-xl font-bold text-gray-800">Quản lý Dữ liệu Nhân viên / 员工数据管理</h3>
                            {empTotal !== null && (
                                <p className="text-sm text-gray-500 mt-0.5">
                                    Tổng cộng: <strong>{empTotal.toLocaleString('vi-VN')}</strong> nhân viên trong hệ thống
                                </p>
                            )}
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            {/* Upload danh sách nhân viên */}
                            <label className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold flex items-center hover:bg-green-700 cursor-pointer">
                                <Upload size={18} className="mr-2 shrink-0"/><span>Import DS Nhân viên<span className="block text-[9px] font-normal opacity-80 leading-tight">导入员工名单</span></span>
                                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
                            </label>
                            {/* Xem báo cáo KSK tổng hợp */}
                            <button
                                onClick={() => setShowKskReport(true)}
                                className="bg-purple-600 text-white px-3 py-2 rounded-lg font-bold flex items-center hover:bg-purple-700 text-sm">
                                <FileText size={15} className="mr-1.5 shrink-0"/><span>Báo cáo KSK<span className="block text-[9px] font-normal opacity-80 leading-tight">体检报告</span></span>
                            </button>
                            {/* Upload kết quả KSK — mở wizard */}
                            <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-lg px-2">
                                <span className="text-xs text-blue-700 font-bold whitespace-nowrap">KSK năm:</span>
                                <input
                                    type="number"
                                    value={kskYear}
                                    onChange={e => setKskYear(Number(e.target.value))}
                                    className="w-16 text-sm text-center border-none bg-transparent focus:ring-0 font-bold text-blue-800"
                                    min={2020} max={2099}
                                />
                                <button
                                    onClick={() => setShowKskWizard(true)}
                                    className="bg-blue-600 text-white px-3 py-1.5 rounded font-bold flex items-center hover:bg-blue-700 cursor-pointer text-sm">
                                    <Upload size={14} className="mr-1 shrink-0"/><span>Upload KSK<span className="block text-[9px] font-normal opacity-80 leading-tight">上传体检数据</span></span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-amber-50 border-l-4 border-amber-400 p-3 mb-4 text-sm text-amber-800 rounded-r">
                        <p className="font-bold mb-1">⚡ Chế độ tìm kiếm nhanh – dữ liệu lớn</p>
                        <p>Nhập <strong>tối thiểu 2 ký tự</strong> (mã NV hoặc tên) để tìm kiếm. Hệ thống sẽ hiển thị tối đa 100 kết quả phù hợp nhất.</p>
                    </div>

                    <div className="flex items-center mb-4 bg-gray-100 p-2 rounded-lg">
                        <Search size={20} className="text-gray-500 ml-2" />
                        <input
                            placeholder="Nhập mã NV hoặc tên để tìm kiếm (tối thiểu 2 ký tự) / 输入ID或姓名搜索..."
                            className="bg-transparent border-none focus:ring-0 p-2 flex-1"
                            value={empSearch}
                            onChange={e => setEmpSearch(e.target.value)}
                        />
                        {empLoading && <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mr-2"/>}
                        {empSearch.length >= 2 && !empLoading && (
                            <span className="text-xs text-gray-500 mr-2 whitespace-nowrap">
                                {empResults.length >= 100 ? '100+ kết quả' : `${empResults.length} kết quả`}
                            </span>
                        )}
                    </div>

                    <div className="flex-1 overflow-auto border rounded-lg">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-100 sticky top-0">
                                <tr>
                                    <th className="p-3">ID NV / 员工ID</th>
                                    <th className="p-3">Họ và Tên / 姓名</th>
                                    <th className="p-3">Bộ phận / 部门</th>
                                    <th className="p-3 text-right">Thao tác / 操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {empResults.map((e, idx) => (
                                    editingEmp?.id === e.id ? (
                                        <tr key={`${e.id}-edit`} className="bg-yellow-50">
                                            <td className="p-3 font-mono font-bold text-gray-700">{e.id}</td>
                                            <td className="p-3">
                                                <input value={editEmpName} onChange={ev => setEditEmpName(ev.target.value)} className="border rounded px-2 py-1 text-sm w-full" />
                                            </td>
                                            <td className="p-3">
                                                <input value={editEmpDept} onChange={ev => setEditEmpDept(ev.target.value)} className="border rounded px-2 py-1 text-sm w-full" />
                                            </td>
                                            <td className="p-3 text-right">
                                                <div className="flex items-center gap-1 justify-end">
                                                    <button onClick={handleSaveEmp} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-700 flex items-center gap-1"><Check size={13}/> Lưu / 保存</button>
                                                    <button onClick={() => setEditingEmp(null)} className="bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-300 flex items-center gap-1"><X size={13}/> Hủy / 取消</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                    <tr key={`${e.id}-${idx}`} className="hover:bg-gray-50">
                                        <td className="p-3 font-mono font-bold text-gray-700">{e.id}</td>
                                        <td className="p-3 font-bold">{e.name}</td>
                                        <td className="p-3 text-gray-600">{e.department}</td>
                                        <td className="p-3 text-right">
                                            <div className="flex items-center gap-1 justify-end">
                                                <button
                                                    onClick={() => setTimelinePatient(e)}
                                                    className="flex items-center gap-1 bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                                                >
                                                    <ClipboardList size={14} className="shrink-0"/><span>Lịch sử SK<span className="block text-[9px] font-normal opacity-70 leading-tight">健康记录</span></span>
                                                </button>
                                                {isStationAdmin && (
                                                    <>
                                                        <button onClick={() => handleEditEmp(e)} className="bg-yellow-50 text-yellow-700 hover:bg-yellow-100 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors" title="Sửa">
                                                            <Pencil size={14}/>
                                                        </button>
                                                        <button onClick={() => handleDeleteEmp(e)} className="bg-red-50 text-red-600 hover:bg-red-100 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors" title="Xóa">
                                                            <Trash2 size={14}/>
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    )
                                ))}
                                {empSearch.length < 2 && (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center text-gray-400">
                                            <Search size={32} className="mx-auto mb-2 opacity-30"/>
                                            Nhập mã nhân viên hoặc tên để tìm kiếm / 输入员工ID或姓名进行搜索
                                        </td>
                                    </tr>
                                )}
                                {empSearch.length >= 2 && !empLoading && empResults.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="p-6 text-center text-gray-400">Không tìm thấy / 未找到</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {activeTab === 'update' && (
                <div className="flex flex-col items-center justify-center flex-1 gap-6 py-8">
                    <div className="w-full max-w-md">
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <PackageOpen size={32} className="text-blue-600"/>
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 mb-1">Cập nhật ứng dụng / 应用更新</h3>
                            <p className="text-sm text-gray-500">Áp dụng file patch (.zip) từ bộ phận kỹ thuật</p>
                        </div>

                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-800 space-y-1">
                            <p className="font-bold">Hướng dẫn:</p>
                            <p>1. Nhận file <span className="font-mono bg-blue-100 px-1 rounded">patch-vX.Y.Z-DATE.zip</span> từ kỹ thuật</p>
                            <p>2. Bấm nút bên dưới → chọn file .zip</p>
                            <p>3. App sẽ tự động khởi động lại sau khi áp dụng</p>
                        </div>

                        {updateStatus.type === 'error' && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start gap-3">
                                <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5"/>
                                <div>
                                    <p className="font-bold text-red-700 text-sm">Cập nhật thất bại</p>
                                    <p className="text-red-600 text-xs mt-1">{updateStatus.message}</p>
                                </div>
                            </div>
                        )}

                        {updateStatus.type === 'success' && (
                            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 flex items-center gap-3">
                                <Check size={18} className="text-green-600"/>
                                <p className="text-green-700 text-sm font-bold">{updateStatus.message}</p>
                            </div>
                        )}

                        <button
                            onClick={handleApplyUpdate}
                            disabled={updateStatus.type === 'loading' || updateStatus.type === 'success' || !window.electron}
                            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 text-white rounded-xl font-bold text-base hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                        >
                            {updateStatus.type === 'loading'
                                ? <><RefreshCw size={20} className="animate-spin"/> Đang xử lý... / 处理中...</>
                                : <><Upload size={20} className="shrink-0"/><span>Chọn file cập nhật (.zip)<span className="block text-[9px] font-normal opacity-80 leading-tight">选择更新文件</span></span></>
                            }
                        </button>

                        {!window.electron && (
                            <p className="text-center text-xs text-gray-400 mt-3">Chức năng này chỉ khả dụng trên Electron App</p>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'serverSync' && (
                <div className="flex flex-col gap-5 overflow-y-auto max-w-2xl">
                    <div className="flex items-center gap-3 mb-1">
                        <Server size={24} className="text-blue-600"/>
                        <div>
                            <h3 className="text-xl font-bold text-gray-800">Đồng bộ Server / 服务器同步</h3>
                            <p className="text-sm text-gray-500">Dữ liệu vẫn lưu offline. Server chỉ nhận thêm khi được bật.</p>
                        </div>
                    </div>

                    {/* Trạng thái chưa sync */}
                    {unsyncedCount && (
                        <div className={`rounded-xl p-4 border flex items-center gap-4 ${
                            (unsyncedCount.encounters + unsyncedCount.medicines + unsyncedCount.inventoryLogs) > 0
                            ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'
                        }`}>
                            <div className="flex-1">
                                <p className="font-bold text-sm text-gray-700 mb-1">Trạng thái đồng bộ / 同步状态</p>
                                <div className="flex gap-4 text-sm">
                                    <span className={unsyncedCount.encounters > 0 ? 'text-amber-700 font-bold' : 'text-green-600'}>
                                        Ca khám / 就诊: {unsyncedCount.encounters} chưa sync
                                    </span>
                                    <span className={unsyncedCount.inventoryLogs > 0 ? 'text-amber-700 font-bold' : 'text-green-600'}>
                                        Giao dịch kho / 库存: {unsyncedCount.inventoryLogs} chưa sync
                                    </span>
                                    <span className={unsyncedCount.medicines > 0 ? 'text-amber-700 font-bold' : 'text-green-600'}>
                                        Thuốc/vật tư / 药品耗材: {unsyncedCount.medicines} chưa sync
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => window.electron?.getUnsyncedCount().then(setUnsyncedCount)}
                                className="text-gray-400 hover:text-gray-600"
                                title="Làm mới"
                            >
                                <RefreshCw size={16}/>
                            </button>
                        </div>
                    )}

                    {/* Toggle bật/tắt */}
                    <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl p-4">
                        <div>
                            <p className="font-bold text-gray-700">Kích hoạt đồng bộ / 启用同步</p>
                            <p className="text-sm text-gray-500">Bật để tự động gửi dữ liệu lên server khi có kết nối</p>
                        </div>
                        <button
                            onClick={() => setSyncConfig(c => ({ ...c, enabled: !c.enabled }))}
                            className={`relative w-14 h-7 rounded-full transition-colors ${syncConfig.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                        >
                            <span className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${syncConfig.enabled ? 'translate-x-8' : 'translate-x-1'}`}/>
                        </button>
                    </div>

                    {/* Server URL */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Server URL</label>
                        <input
                            type="text"
                            value={syncConfig.serverUrl}
                            onChange={e => setSyncConfig(c => ({ ...c, serverUrl: e.target.value }))}
                            placeholder="https://server.company.com"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                    </div>

                    {/* API Key */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">API Key / Token</label>
                        <input
                            type="password"
                            value={syncConfig.apiKey}
                            onChange={e => setSyncConfig(c => ({ ...c, apiKey: e.target.value }))}
                            placeholder="••••••••••••••••"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                    </div>

                    {/* Chu kỳ retry */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">
                            Chu kỳ đồng bộ lại (phút)
                            <span className="ml-2 text-gray-400 font-normal">— quét và gửi lại các bản ghi chưa sync</span>
                        </label>
                        <select
                            value={syncConfig.retryIntervalMinutes}
                            onChange={e => setSyncConfig(c => ({ ...c, retryIntervalMinutes: Number(e.target.value) }))}
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                        >
                            {[1, 3, 5, 10, 15, 30].map(v => (
                                <option key={v} value={v}>{v} phút</option>
                            ))}
                        </select>
                    </div>

                    {/* Sync nhân viên */}
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
                        <p className="font-bold text-sm text-gray-700">Đồng bộ danh sách nhân viên / 同步员工名单</p>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Sync ngay khi khởi động app / 启动时同步</p>
                                <p className="text-xs text-gray-400">Đảm bảo Kiosk nhận ra nhân viên mới</p>
                            </div>
                            <button
                                onClick={() => setSyncConfig(c => ({ ...c, syncEmployeesOnStartup: !c.syncEmployeesOnStartup }))}
                                className={`relative w-14 h-7 rounded-full transition-colors ${syncConfig.syncEmployeesOnStartup ? 'bg-blue-600' : 'bg-gray-300'}`}
                            >
                                <span className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${syncConfig.syncEmployeesOnStartup ? 'translate-x-8' : 'translate-x-1'}`}/>
                            </button>
                        </div>
                        <div className="flex items-center gap-3">
                            <label className="text-sm text-gray-600 whitespace-nowrap">Chu kỳ sync nhân viên / 员工同步周期:</label>
                            <select
                                value={syncConfig.employeeSyncIntervalHours}
                                onChange={e => setSyncConfig(c => ({ ...c, employeeSyncIntervalHours: Number(e.target.value) }))}
                                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                            >
                                {[1, 2, 4, 8, 12, 24].map(v => (
                                    <option key={v} value={v}>{v} giờ</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Test kết nối */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleTestConnection}
                            disabled={!syncConfig.serverUrl || syncTestStatus === 'loading'}
                            className="flex items-center gap-2 px-4 py-2 border border-blue-500 text-blue-600 rounded-lg font-bold hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {syncTestStatus === 'loading'
                                ? <><RefreshCw size={16} className="animate-spin"/> Đang kiểm tra / 检测中...</>
                                : <><Wifi size={16} className="shrink-0"/><span>Test kết nối<span className="block text-[9px] font-normal opacity-80 leading-tight">测试连接</span></span></>
                            }
                        </button>
                        {syncTestStatus === 'success' && (
                            <span className="flex items-center gap-1 text-sm text-green-600 font-medium">
                                <Check size={16}/> {syncTestMessage}
                            </span>
                        )}
                        {syncTestStatus === 'error' && (
                            <span className="flex items-center gap-1 text-sm text-red-600 font-medium">
                                <WifiOff size={16}/> {syncTestMessage}
                            </span>
                        )}
                    </div>

                    {/* Lưu cấu hình */}
                    <div className="flex gap-2">
                        <button
                            onClick={handleSaveSyncConfig}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all"
                        >
                            {syncSaved ? <><Check size={18}/> Đã lưu! / 已保存</> : <><Check size={18} className="shrink-0"/><span>Lưu cấu hình<span className="block text-[9px] font-normal opacity-80 leading-tight">保存配置</span></span></>}
                        </button>
                        {syncConfig.enabled && (
                            <button
                                onClick={handleSyncNow}
                                disabled={syncTestStatus === 'loading'}
                                className="px-4 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all disabled:opacity-50 text-sm"
                                title="Đồng bộ ngay"
                            >
                                {syncTestStatus === 'loading' ? '...' : 'Sync ngay'}
                            </button>
                        )}
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
                        <p className="font-bold mb-1">Lưu ý:</p>
                        <ul className="list-disc list-inside space-y-1 text-blue-600">
                            <li>App vẫn hoạt động bình thường khi tắt sync hoặc mất mạng</li>
                            <li>Dữ liệu chưa sync sẽ được tự động gửi lại theo chu kỳ đã cài</li>
                            <li>Medicine chỉ đồng bộ 1 chiều: Spoke → Server (không chỉnh sửa từ server)</li>
                        </ul>
                    </div>
                </div>
            )}

            {activeTab === 'accounts' && (
                <div className="overflow-y-auto">
                    <div className="flex items-center gap-3 mb-6">
                        <Lock size={24} className="text-blue-600"/>
                        <div>
                            <h3 className="text-xl font-bold text-gray-800">Tài khoản nhân viên y tế / 员工账户</h3>
                            <p className="text-sm text-gray-500">Mật khẩu mặc định = MNV. Reset để khôi phục mặc định. / 默认密码 = 员工编号</p>
                        </div>
                    </div>
                    <div className="space-y-2">
                        {STAFF_LIST.map(u => {
                            const hasCustom = !!storage.getUserPasswordHash(u.id);
                            return (
                                <div key={u.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold text-sm">{u.name.charAt(0)}</div>
                                        <div>
                                            <p className="font-semibold text-gray-800 text-sm">{u.name}</p>
                                            <p className="text-xs text-gray-500">MNV: {u.mnv} · {u.role}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${hasCustom ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                                            {hasCustom ? '🔒 Đã đổi MK' : '🔑 Mặc định'}
                                        </span>
                                        {hasCustom && (
                                            <button
                                                onClick={() => {
                                                    if (window.confirm(`Reset mật khẩu của "${u.name}" về MNV (${u.mnv})?`)) {
                                                        storage.resetUserPassword(u.id);
                                                        loadData();
                                                    }
                                                }}
                                                className="text-xs px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 font-medium transition"
                                            >
                                                Reset về MNV
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {activeTab === 'reset' && (
                <div className="flex flex-col gap-4 overflow-y-auto">
                    <div className="flex items-center gap-3 mb-2">
                        <ShieldAlert size={24} className="text-red-600"/>
                        <div>
                            <h3 className="text-xl font-bold text-red-700">Reset dữ liệu / 数据重置</h3>
                            <p className="text-sm text-gray-500">Các thao tác này không thể hoàn tác. Cần gõ <span className="font-mono font-bold text-red-600">reset</span> để xác nhận.</p>
                        </div>
                    </div>

                    {[
                        {
                            title: 'Danh mục thuốc + lịch sử kho thuốc',
                            desc: 'Xóa toàn bộ dữ liệu thuốc (tất cả lô, tồn kho) và lịch sử xuất nhập kho. Dữ liệu khám bệnh không bị ảnh hưởng.',
                            action: async () => {
                                const r = await window.electron.resetData('MEDICINE');
                                if (!r.success) throw new Error(r.message);
                            }
                        },
                        {
                            title: 'Danh mục vật tư + lịch sử kho vật tư',
                            desc: 'Xóa toàn bộ dữ liệu vật tư (tất cả lô, tồn kho) và lịch sử xuất nhập kho. Dữ liệu khám bệnh không bị ảnh hưởng.',
                            action: async () => {
                                const r = await window.electron.resetData('SUPPLY');
                                if (!r.success) throw new Error(r.message);
                            }
                        },
                        {
                            title: 'Danh sách nhân viên',
                            desc: 'Xóa toàn bộ danh sách nhân viên trong hệ thống. Dữ liệu khám bệnh và kho không bị ảnh hưởng.',
                            action: async () => {
                                localStorage.removeItem('gvc_patients');
                                storage.clearPatientsCache();
                            }
                        },
                        {
                            title: '⚠️ Toàn bộ dữ liệu',
                            desc: 'Xóa TẤT CẢ: thuốc, vật tư, nhân viên, lịch sử kho, lịch sử khám bệnh. App trở về trạng thái ban đầu.',
                            action: async () => {
                                const r = await window.electron.resetData('ALL');
                                if (!r.success) throw new Error(r.message);
                                localStorage.removeItem('gvc_patients');
                                storage.clearPatientsCache();
                            }
                        },
                    ].map((item, i) => (
                        <div key={i} className={`border rounded-xl p-5 flex items-center justify-between gap-4 ${i === 3 ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'}`}>
                            <div>
                                <p className={`font-bold ${i === 3 ? 'text-red-700' : 'text-gray-800'}`}>{item.title}</p>
                                <p className="text-sm text-gray-500 mt-1">{item.desc}</p>
                            </div>
                            <button
                                onClick={() => openResetModal(item.title, item.desc, item.action)}
                                className="shrink-0 flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-all"
                            >
                                <Trash2 size={16} className="shrink-0"/><span>Xóa<span className="block text-[9px] font-normal opacity-80 leading-tight">删除</span></span>
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>}

        {/* Reset Confirmation Modal */}
        {resetModal?.show && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <ShieldAlert size={28} className="text-red-600 shrink-0"/>
                        <h3 className="text-lg font-bold text-red-700">{resetModal.title}</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-5">{resetModal.description}</p>

                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-5">
                        <p className="text-sm text-red-700 font-medium mb-2">
                            Gõ <span className="font-mono font-bold">reset</span> vào ô bên dưới để xác nhận:
                        </p>
                        <input
                            type="text"
                            value={resetInput}
                            onChange={e => setResetInput(e.target.value)}
                            placeholder="Nhập: reset"
                            className="w-full border border-red-300 rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                            autoFocus
                        />
                    </div>

                    {resetResult && (
                        <div className={`rounded-lg p-3 mb-4 text-sm font-medium flex items-center gap-2 ${resetResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            {resetResult.success ? <Check size={16}/> : <X size={16}/>}
                            {resetResult.message}
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button
                            onClick={() => { setResetModal(null); setResetResult(null); }}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-bold text-gray-600 hover:bg-gray-50"
                            disabled={resetLoading}
                        >
                            Hủy / 取消
                        </button>
                        <button
                            onClick={handleConfirmReset}
                            disabled={resetInput !== 'reset' || resetLoading}
                            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {resetLoading ? <><RefreshCw size={16} className="animate-spin"/> Đang xóa / 删除中...</> : <><Trash2 size={16} className="shrink-0"/><span>Xác nhận xóa<span className="block text-[9px] font-normal opacity-80 leading-tight">确认删除</span></span></>}
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};