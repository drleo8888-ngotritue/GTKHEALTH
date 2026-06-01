import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Medicine, StationConfig, StationType, MedicineType, InventoryLog, User } from '../types';
import { storage } from '../services/storage';
import { dataService } from '../services/data-service';
import { AlertTriangle, ChevronDown, ChevronUp, Download, Filter, Package, Plus, Upload, X, Pill, Stethoscope, Truck, Check, Calendar, TrendingUp, Activity, Trash2, RefreshCw, AlertOctagon, FileSpreadsheet, History, FileText, ArrowRight, Clock, Lock, Pencil } from 'lucide-react';
import * as XLSX from 'xlsx';
import { STATION_PRESETS } from '../constants';
import { MedicineUsageReport } from './MedicineUsageReport';
import { ImportFailModal } from './ImportFailModal';
import { PeriodCloseModal } from './PeriodCloseModal';

interface InventoryProps {
  stationConfig: StationConfig;
  refreshTrigger?: number;
  currentUser?: User | null;
}

interface MasterItem {
    id: string; name: string; group: string; unit: string;
    opening: number; import: number; usage: number; transfer: number; other_export: number; closing: number;
    batches: BatchItem[];
}

interface BatchItem {
    id: string; batchNumber: string; expiryDate: string; mfgDate: string;
    opening: number; import: number; usage: number; transfer: number; other_export: number; closing: number;
    realStock: number;
    status: 'OK' | 'EXPIRED' | 'NEAR_EXPIRY';
}

interface AnalyticsItem {
    name: string; group: string; unit: string;
    totalUsage: number; currentStock: number; avgDailyUsage: number;
    daysRemaining: number; predictedStockoutDate: string;
}

const formatDate = (dateStr: string | undefined) => {
    if (!dateStr || dateStr === '---') return '---';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
    } catch { return dateStr; }
};

const formatDateTime = (ts: number) => {
    const d = new Date(ts);
    const p2 = (n: number) => String(n).padStart(2, '0');
    return `${p2(d.getDate())}/${p2(d.getMonth()+1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

export const Inventory: React.FC<InventoryProps> = ({ stationConfig, refreshTrigger, currentUser }) => {
  // --- STATE QUẢN LÝ DỮ LIỆU ---
  const [medicines, setMedicines] = useState<Medicine[]>([]); 
  const [logs, setLogs] = useState<InventoryLog[]>([]); 
  const [isLoading, setIsLoading] = useState(false);
  
  // --- STATE GIAO DIỆN ---
  const [activeTab, setActiveTab] = useState<'flow' | 'analysis' | 'history'>('flow'); 
  const [inventoryType, setInventoryType] = useState<MedicineType>('MEDICINE');
  const [filterStation, setFilterStation] = useState<string>('ALL');
  
  // --- STATE THỜI GIAN ---
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState<string>(firstDay.toISOString().slice(0,10));
  const [endDate, setEndDate] = useState<string>(today.toISOString().slice(0,10));

  // --- STATE MỞ RỘNG BẢNG ---
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});

  // --- STATE MODAL ---
  const [showImportModal, setShowImportModal] = useState(false);
  const [showImportFail, setShowImportFail] = useState(false);
  const [showDisposeModal, setShowDisposeModal] = useState(false); 
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);

  // --- STATE FORM & LOGIC ---
  const [newItem, setNewItem] = useState<Partial<Medicine>>({ type: 'MEDICINE', stock: 0, group: '' });
  const [transferCart, setTransferCart] = useState<{med: Medicine, qty: number}[]>([]); 
  const [targetStation, setTargetStation] = useState<string>(''); 
  const [disposeReason, setDisposeReason] = useState<string>('EXPIRED'); 
  const [incomingTransfer, setIncomingTransfer] = useState<any>(null); 
  const [verifiedItems, setVerifiedItems] = useState<any[]>([]); 
  const [isSetupMode, setIsSetupMode] = useState(false);
  
  const syncFileInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [showMedicineReport, setShowMedicineReport] = useState(false);
  const [showPeriodClose, setShowPeriodClose] = useState(false);

  // Batch edit/delete
  const [editingBatch, setEditingBatch] = useState<Medicine | null>(null);
  const [editBatchData, setEditBatchData] = useState<Partial<Medicine>>({});
  const isPrivileged = currentUser?.role === 'ADMIN' || currentUser?.role === 'MODERATOR';

  // Chỉ cho phép chốt kỳ trong 2 ngày cuối tháng hoặc 2 ngày đầu tháng kế
  const canClosePeriod = (() => {
    const today   = new Date();
    const day     = today.getDate();
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    return day >= lastDay - 1 || day <= 2;
  })();

  const [knownStations, setKnownStations] = useState<{name: string, type: string}[]>(() => storage.getKnownStations());

  const isMedicine = inventoryType === 'MEDICINE';
  const typeLabel = isMedicine ? 'thuốc' : 'vật tư';

  // --- INIT DATA ---
  const availableNames = useMemo(() => {
      return Array.from(new Set(medicines.filter(m => (m.type || 'MEDICINE') === inventoryType).map(m => m.name))).sort();
  }, [medicines, inventoryType]);

  const availableGroups = useMemo(() => {
      return Array.from(new Set(medicines.filter(m => (m.type || 'MEDICINE') === inventoryType).map(m => m.group || m.group_name).filter(Boolean))).sort();
  }, [medicines, inventoryType]);

  useEffect(() => {
    loadData();
    const stations = storage.getKnownStations();
    if(stations.length > 0) setKnownStations(stations);
  }, [stationConfig.name]);

  useEffect(() => {
      loadData(); 
      setNewItem(prev => ({ ...prev, type: inventoryType, group: '' }));
  }, [inventoryType]);

  useEffect(() => {
      if (refreshTrigger && refreshTrigger > 0) {
          console.log("⚡ Inventory refreshing...");
          loadData();
      }
  }, [refreshTrigger]);

  const loadData = async () => {
    setIsLoading(true);
    if ((window as any).electron) {
        try {
            const list = await dataService.getInventory(stationConfig.name);
            if (list) setMedicines(list);
            const transactionLogs = await dataService.getInventoryLogs();
            if (transactionLogs) setLogs(transactionLogs);
        } catch (error) { console.error("DB Error:", error); }
    } else {
        setMedicines(storage.getMedicines());
    }
    setIsLoading(false);
  };

  const toggleRow = (id: string) => {
    setExpandedRows(prev => ({...prev, [id]: !prev[id]}));
  };
  const toggleHistory = (id: string) => {
    setExpandedHistory(prev => ({...prev, [id]: !prev[id]}));
  };

  const cleanBatches = useMemo(() => {
      const map = new Map<string, Medicine>();
      medicines.forEach(m => {
          if ((m.type || 'MEDICINE') !== inventoryType) return;
          const key = `${m.name}_${m.batchNumber}_${m.expiryDate}`;
          if (map.has(key)) {
              const existing = map.get(key)!;
              existing.stock += m.stock;
          } else {
              map.set(key, { ...m });
          }
      });
      return Array.from(map.values()).filter(m => m.stock > 0).sort((a,b) => a.name.localeCompare(b.name));
  }, [medicines, inventoryType]);

  // 🔥 TÍNH TOÁN BÁO CÁO (STRICT MODE & FALLBACK) 🔥
  const calculateFlowData = (typeOverride?: MedicineType): MasterItem[] => {
      const startTs = new Date(startDate).setHours(0,0,0,0);
      const endTs = new Date(endDate).setHours(23,59,59,999);
      const result: MasterItem[] = [];
      const filterType = typeOverride || inventoryType;

      const uniqueNames = Array.from(new Set(medicines.filter(m => (m.type || 'MEDICINE') === filterType).map(m => m.name)));

      uniqueNames.forEach(name => {
          const relatedMeds = medicines.filter(m => m.name === name);
          const masterInfo = relatedMeds.find(m => m.batchNumber === 'DANH_MUC_GOC') || relatedMeds[0];

          const masterItem: MasterItem = {
              id: masterInfo.id, name: masterInfo.name, group: masterInfo.group || masterInfo.group_name || '', unit: masterInfo.unit,
              opening: 0, import: 0, usage: 0, transfer: 0, other_export: 0, closing: 0, batches: []
          };

          const batchMap: Record<string, Medicine[]> = {};
          relatedMeds.forEach(m => {
              if (m.batchNumber === 'DANH_MUC_GOC' && m.stock <= 0) return;
              if (!batchMap[m.batchNumber]) batchMap[m.batchNumber] = [];
              batchMap[m.batchNumber].push(m);
          });

          Object.keys(batchMap).forEach(batchNum => {
              const duplicates = batchMap[batchNum];
              const representative = duplicates[0]; 
              const currentRealStock = duplicates.reduce((sum, item) => sum + item.stock, 0);

              let op = 0, im = 0, use = 0, trans = 0, other = 0;

              logs.forEach(log => {
                  const isSource = log.source === stationConfig.name;
                  const isTarget = log.target === stationConfig.name;
                  if (!isSource && !isTarget) return;

                  const itemInLog = log.items?.find((i: any) => 
                       duplicates.some(d => d.id === i.medId) || (i.name === name && i.batch === batchNum)
                  );
                  
                  if (!itemInLog) return;
                  const qty = parseInt(itemInLog.qty || itemInLog.quantity || 0);

                  // 1. SETUP TỒN ĐẦU KỲ -> Luôn cộng vào Tồn đầu
                  if (log.type === 'IMPORT_INIT' && isTarget) { 
                      op += qty; 
                      return; 
                  }

                  if (log.timestamp < startTs) {
                      if ((log.type.includes('IMPORT') || log.type === 'TRANSFER_IN') && isTarget) op += qty;
                      else if (isSource) op -= qty;
                  } else if (log.timestamp >= startTs && log.timestamp <= endTs) {
                      if (isTarget) {
                          if (log.type.includes('IMPORT') || log.type === 'TRANSFER_IN') im += qty;
                      } else if (isSource) {
                          // 🔥 PHÂN LOẠI CỨNG (STRICT)
                          if (log.type === 'EXPORT_USE') use += qty; 
                          else if (log.type === 'TRANSFER_OUT') trans += qty; 
                          else if (['EXPORT_DESTROY', 'EXPORT_OTHER', 'EXPORT_ADJUST'].includes(log.type)) other += qty;
                      }
                  }
              });

              let cl = op + im - use - trans - other;

              // 2. FALLBACK: Nếu tính lệch thực tế -> Điều chỉnh vào Tồn đầu
              if (cl !== currentRealStock) {
                  const diff = currentRealStock - cl;
                  op += diff; 
                  cl = currentRealStock;
              }

              let status: any = 'OK';
              if (representative.expiryDate && representative.expiryDate !== '---') {
                  const diff = new Date(representative.expiryDate).getTime() - Date.now();
                  if (diff < 0) status = 'EXPIRED'; else if (diff < 90 * 86400000) status = 'NEAR_EXPIRY';
              }

              if (op !== 0 || im !== 0 || use !== 0 || trans !== 0 || other !== 0 || cl !== 0 || currentRealStock > 0) {
                  masterItem.batches.push({
                      id: representative.id, batchNumber: batchNum, expiryDate: representative.expiryDate, mfgDate: representative.mfgDate || '',
                      opening: op, import: im, usage: use, transfer: trans, other_export: other, closing: cl,
                      realStock: currentRealStock, 
                      status
                  });
                  masterItem.opening += op; masterItem.import += im; masterItem.usage += use; 
                  masterItem.transfer += trans; masterItem.other_export += other; masterItem.closing += cl;
              }
          });
          
          if (masterItem.batches.length > 0) result.push(masterItem);
      });
      return result.sort((a, b) => (a.group || 'ZZZ').localeCompare(b.group || 'ZZZ') || a.name.localeCompare(b.name));
  };

  const flowData = calculateFlowData();

  // 🔥 [FIX QUAN TRỌNG] LỌC LOG NHẬT KÝ CHUẨN XÁC 🔥
  // E4 (Source) sẽ KHÔNG thấy log TRANSFER_IN của A6 (Target)
  const historyData = useMemo(() => {
      const myName = stationConfig.name;

      const rawLogs = logs.filter(l => {
          // Lọc theo thời gian
          const ts = l.timestamp;
          const startTs = new Date(startDate).setHours(0,0,0,0);
          const endTs = new Date(endDate).setHours(23,59,59,999);
          if (ts < startTs || ts > endTs) return false;

          // 1. Nếu là log XUẤT CHUYỂN: Chỉ hiện nếu mình là người GỬI
          if (l.type === 'TRANSFER_OUT') {
              return l.source === myName;
          }
          
          // 2. Nếu là log NHẬP CHUYỂN: Chỉ hiện nếu mình là người NHẬN
          if (l.type === 'TRANSFER_IN') {
              return l.target === myName;
          }

          // 3. Các log nội bộ khác (Nhập kho, Kê đơn, Hủy...): 
          // Chỉ cần dính đến trạm mình (source hoặc target) là hiện
          return l.source === myName || l.target === myName;

      }).sort((a,b) => b.timestamp - a.timestamp);

      // Gom nhóm log cùng lúc
      const grouped: { id: string, timestamp: number, type: string, note: string, source: string, target: string, items: any[], actorName?: string, actorRole?: string }[] = [];
      rawLogs.forEach(log => {
          const existing = grouped.find(g => Math.abs(g.timestamp - log.timestamp) < 1000 && g.type === log.type && g.source === log.source && g.target === log.target);
          if (existing) {
              if (log.items) existing.items.push(...log.items);
          } else {
              grouped.push({
                  id: log.id, timestamp: log.timestamp, type: log.type, note: log.note,
                  source: log.source, target: log.target, items: log.items ? [...log.items] : [],
                  actorName: log.actorName, actorRole: log.actorRole,
              });
          }
      });
      return grouped;
  }, [logs, startDate, endDate, stationConfig.name]);

  const calculateAnalysisData = (): AnalyticsItem[] => {
      return flowData.map(item => {
          const totalOut = item.usage + item.transfer;
          const daysInPeriod = Math.max(1, (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 3600 * 24));
          const avgDaily = totalOut / daysInPeriod;
          let daysRemaining = 9999;
          let predictedDate = 'N/A';
          if (avgDaily > 0 && item.closing > 0) {
              daysRemaining = item.closing / avgDaily;
              const d = new Date(); d.setDate(d.getDate() + daysRemaining);
              predictedDate = formatDate(d.toISOString());
          }
          return { name: item.name, group: item.group, unit: item.unit, totalUsage: totalOut, currentStock: item.closing, avgDailyUsage: avgDaily, daysRemaining, predictedStockoutDate: predictedDate };
      }).sort((a,b) => a.daysRemaining - b.daysRemaining);
  };
  const analysisData = calculateAnalysisData();

  // --- BATCH EDIT/DELETE ---
  const handleEditBatch = (batch: Medicine) => {
    setEditingBatch(batch);
    setEditBatchData({ name: batch.name, group: batch.group || batch.group_name, unit: batch.unit, batchNumber: batch.batchNumber, expiryDate: batch.expiryDate, mfgDate: batch.mfgDate, type: batch.type });
  };

  const handleSaveBatch = async () => {
    if (!editingBatch || !(window as any).electron) return;
    await dataService.updateMedicineBatch(editingBatch.id, editBatchData);
    setEditingBatch(null);
    await loadData();
  };

  const handleDeleteBatch = async (batch: Medicine) => {
    if (batch.stock > 0) { alert('Không thể xóa lô còn tồn kho. Hãy xuất hết hàng trước.'); return; }
    if (!confirm(`Xóa lô "${batch.batchNumber}" của "${batch.name}"?`)) return;
    if (!(window as any).electron) return;
    await dataService.deleteMedicine(batch.id);
    await dataService.createInventoryLog({
      id: crypto.randomUUID(), type: 'EXPORT_DESTROY',
      source: stationConfig.name, target: 'DELETE',
      timestamp: Date.now(), note: `Xóa lô: ${batch.name} - ${batch.batchNumber}`,
      items: [{ name: batch.name, qty: 0, batch: batch.batchNumber }],
      actorName: currentUser?.name, actorRole: currentUser?.role,
    });
    await loadData();
  };

  // --- ACTIONS ---
  const handleDisposeAction = async () => {
      if (isLoading) return;
      if (transferCart.length === 0) { alert(`Chưa chọn ${typeLabel}!`); return; }
      
      setIsLoading(true);
      try {
          if ((window as any).electron) {
              const logId = crypto.randomUUID();
              let logType = 'EXPORT_OTHER';
              let notePrefix = 'Xuất khác';
              
              switch(disposeReason) {
                  case 'EXPIRED': logType = 'EXPORT_DESTROY'; notePrefix = 'Hủy (Hết hạn)'; break;
                  case 'DAMAGED': logType = 'EXPORT_DESTROY'; notePrefix = 'Hủy (Hỏng/Vỡ)'; break;
                  case 'LOST': logType = 'EXPORT_ADJUST'; notePrefix = 'Cân bằng (Thất thoát)'; break;
                  case 'INTERNAL': logType = 'EXPORT_USE'; notePrefix = 'Dùng nội bộ'; break;
              }

              for (const item of transferCart) {
                  await dataService.importMedicine({ ...item.med, stock: -item.qty, skipLog: true }, stationConfig.name);
              }

              await dataService.createInventoryLog({
                  id: logId, type: logType, source: stationConfig.name, target: disposeReason,
                  timestamp: Date.now(), note: `${notePrefix}: ${transferCart.length} mặt hàng`,
                  items: transferCart.map(i => ({ name: i.med.name, qty: i.qty, batch: i.med.batchNumber, medId: i.med.id })),
                  actorName: currentUser?.name, actorRole: currentUser?.role,
              });
              
              alert(`✅ Đã thực hiện: ${notePrefix}`);
              setShowDisposeModal(false); setTransferCart([]); await loadData();
          }
      } catch (e) { console.error(e); } 
      finally { setIsLoading(false); }
  };

  const handleTransferAction = async () => {
      if (isLoading) return;
      if (!targetStation) { alert("Chưa chọn trạm nhận!"); return; }
      if (transferCart.length === 0) { alert(`Chưa chọn ${typeLabel}!`); return; }

      setIsLoading(true);
      try {
          if ((window as any).electron) {
              for (const item of transferCart) {
                  await dataService.importMedicine({ ...item.med, stock: -item.qty, skipLog: true }, stationConfig.name);
              }
              const logId = crypto.randomUUID();
              const transferId = crypto.randomUUID();
              const transferData = { type: 'TRANSFER', id: transferId, source: stationConfig.name, target: targetStation, date: Date.now(), items: transferCart.map(i => ({...i.med, stock: i.qty})) };
              const blob = new Blob([JSON.stringify(transferData)], { type: "application/json" });
              const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `DIEU_CHUYEN_${targetStation}.dat`; 
              document.body.appendChild(link); link.click();
              
              await dataService.createInventoryLog({
                  id: logId, type: 'TRANSFER_OUT', source: stationConfig.name, target: targetStation, timestamp: Date.now(),
                  note: `Xuất điều chuyển: ${targetStation}`,
                  items: transferCart.map(i => ({ name: i.med.name, qty: i.qty, batch: i.med.batchNumber })),
                  actorName: currentUser?.name, actorRole: currentUser?.role,
              });
              alert(`✅ Đã xuất điều chuyển! File .dat đã được tải xuống.`);
              setShowTransferModal(false); setTransferCart([]); setTargetStation(''); await loadData();
          }
      } catch(e) { console.error(e); }
      finally { setIsLoading(false); }
  };

  const handleSingleImport = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isLoading) return;
      if (!(window as any).electron) return;
      if (!newItem.group) { alert(`Vui lòng nhập nhóm ${typeLabel}!`); return; }
      
      setIsLoading(true);
      try {
          const newId = crypto.randomUUID();
          await dataService.importMedicine({ ...newItem, id: newId, type: inventoryType, skipLog: false, actorName: currentUser?.name, actorRole: currentUser?.role }, stationConfig.name);
          alert("✅ Nhập kho thành công!"); 
          setShowImportModal(false); setNewItem({ type: inventoryType, stock: 0, group: '' }); await loadData();
      } catch(e) { console.error(e); }
      finally { setIsLoading(false); }
  };

  const downloadInventoryTemplate = () => {
      const thuocRows = [
          ['Tên thuốc', 'Số lượng', 'Nhóm', 'ĐVT', 'Số lô', 'Hạn dùng', 'Ngày SX'],
          ['Paracetamol 500mg', 200, 'Hạ sốt giảm đau', 'Viên', 'LOT-001', '2026-12-31', '2024-01-15'],
          ['Amoxicillin 500mg',  50, 'Kháng sinh',       'Viên', 'LOT-002', '2026-06-30', '2024-02-01'],
          ['Vitamin C 1000mg',  100, 'Vitamin',           'Viên', 'LOT-003', '2027-03-31', '2024-03-01'],
      ];
      const vatTuRows = [
          ['Tên vật tư', 'Số lượng', 'Nhóm', 'ĐVT', 'Số lô', 'Hạn dùng', 'Ngày SX'],
          ['Bơm tiêm 5ml',   500, 'Dụng cụ tiêm', 'Cái',  'VT-001', '2027-12-31', '2024-01-01'],
          ['Găng tay y tế',  200, 'Phòng hộ',      'Đôi',  'VT-002', '2027-12-31', '2024-01-15'],
      ];
      const hdRows = [
          ['CỘT BẮT BUỘC', '', 'MÔ TẢ'],
          ['"Tên thuốc" hoặc "Tên vật tư"', '', 'Phải có dữ liệu, không để trống'],
          [''],
          ['CỘT TÙY CHỌN', '', ''],
          ['Số lượng', '', 'Số nguyên. Mặc định: 0'],
          ['Nhóm', '', 'Phân loại. Mặc định: "Khác"'],
          ['ĐVT', '', 'Đơn vị tính (Viên, Chai...). Mặc định: "Đơn vị"'],
          ['Số lô', '', 'Mặc định: "LÔ_MỚI"'],
          ['Hạn dùng', '', 'Định dạng YYYY-MM-DD. Mặc định: 2030-12-31'],
          ['Ngày SX', '', 'Định dạng YYYY-MM-DD. Có thể để trống'],
          [''],
          ['LƯU Ý: Hàng đầu PHẢI là tiêu đề. Dùng Sheet 1. Không gộp ô.'],
      ];
      const colWidths = [{ wch: 30 }, { wch: 12 }, { wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      const wsThuoc = XLSX.utils.aoa_to_sheet(thuocRows); wsThuoc['!cols'] = colWidths;
      const wsVatTu = XLSX.utils.aoa_to_sheet(vatTuRows); wsVatTu['!cols'] = colWidths;
      const wsHD    = XLSX.utils.aoa_to_sheet(hdRows);    wsHD['!cols']    = [{ wch: 40 }, { wch: 5 }, { wch: 60 }];
      XLSX.utils.book_append_sheet(wb, wsThuoc, 'Thuốc');
      XLSX.utils.book_append_sheet(wb, wsVatTu, 'Vật tư');
      XLSX.utils.book_append_sheet(wb, wsHD,    'Hướng dẫn');
      XLSX.writeFile(wb, 'template_nhap_kho.xlsx');
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]; if(!file) return;
      if (isLoading) return;

      // Hàm chuyển Excel date serial number → "YYYY-MM-DD"
      const excelDateToStr = (val: any): string => {
          if (!val) return '2030-12-31';
          if (typeof val === 'number') {
              // Excel serial: ngày 1 = 1900-01-01 (có bug năm 1900 nên offset là 25569 từ epoch)
              const d = new Date(Math.round((val - 25569) * 86400 * 1000));
              if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
          }
          if (typeof val === 'string' && val.trim()) return val.trim();
          return '2030-12-31';
      };

      // Normalize row key: trim + lowercase để so sánh không phân biệt hoa/thường và khoảng trắng
      const getCol = (row: any, ...keys: string[]): any => {
          const normalized: Record<string, any> = {};
          for (const k of Object.keys(row)) normalized[k.trim().toLowerCase()] = row[k];
          for (const k of keys) {
              const v = normalized[k.trim().toLowerCase()];
              if (v !== undefined && v !== null && v !== '') return v;
          }
          return undefined;
      };

      setIsLoading(true);
      const reader = new FileReader();
      reader.onload = async (evt) => {
          const bstr = evt.target?.result;
          // cellDates:false để nhận raw serial number, xử lý tay cho chính xác
          const wb = XLSX.read(bstr, { type: 'binary', cellDates: false });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(ws, { defval: '' });

          let count = 0;
          const logItems: any[] = [];

          if ((window as any).electron) {
              for (const row: any of data) {
                  const name = String(getCol(row, 'Tên thuốc', 'Tên vật tư', 'Name', 'ten thuoc', 'ten vat tu', 'name') || '').trim();
                  if (!name) continue;

                  const qtyRaw = getCol(row, 'Số lượng', 'Stock', 'so luong', 'SL');
                  const qty = parseInt(String(qtyRaw)) || 0;
                  const batch = String(getCol(row, 'Số lô', 'Batch', 'so lo', 'Lô') || 'LÔ_MỚI').trim();
                  const newId = crypto.randomUUID();

                  await dataService.importMedicine({
                      id: newId,
                      name,
                      group: String(getCol(row, 'Nhóm', 'Group', 'nhom', 'Nhóm thuốc') || 'Khác').trim(),
                      unit: String(getCol(row, 'ĐVT', 'Unit', 'dvt', 'Đơn vị tính') || 'Đơn vị').trim(),
                      stock: qty,
                      batchNumber: batch,
                      expiryDate: excelDateToStr(getCol(row, 'Hạn dùng', 'Expiry', 'han dung', 'Hạn sử dụng', 'HSD')),
                      mfgDate: excelDateToStr(getCol(row, 'Ngày SX', 'Ngày sản xuất', 'ngay sx', 'NSX')) || '',
                      type: inventoryType, skipLog: true
                  }, stationConfig.name);

                  if (qty > 0) logItems.push({ name, qty, batch, medId: newId });
                  count++;
              }

              if (count === 0) {
                  setIsLoading(false);
                  setShowImportFail(true);
                  return;
              }

              if (logItems.length > 0) {
                  const logType = isSetupMode ? 'IMPORT_INIT' : 'IMPORT';
                  const logNote = isSetupMode ? `Setup Tồn Đầu: ${count} mặt hàng` : `Nhập Excel: ${count} mặt hàng`;
                  await dataService.createInventoryLog({
                      id: crypto.randomUUID(), type: logType,
                      source: 'EXCEL', target: stationConfig.name, timestamp: Date.now(),
                      note: logNote, items: logItems,
                      actorName: currentUser?.name, actorRole: currentUser?.role,
                  });
              }
              alert(`✅ Đã nhập ${count} mục từ Excel!`);
              await loadData(); setShowImportModal(false); setIsSetupMode(false);
          }
          setIsLoading(false);
      };
      reader.readAsBinaryString(file);
  };

  // Nhận file điều chuyển từ E4 (chỉ dùng cho Spoke)
  const handleSyncFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
     const file = event.target.files?.[0]; if (!file) return;
     const reader = new FileReader();
     reader.onload = async (e) => {
         const content = e.target?.result as string;
         try {
             const data = JSON.parse(content);
             if (data.type === 'TRANSFER') {
                 const targetName = (data.target || '').trim().toUpperCase();
                 const myName = (stationConfig.name || '').trim().toUpperCase();
                 const sourceName = (data.source || '').trim().toUpperCase();

                 if (targetName !== myName) {
                     alert(`⛔ SAI ĐỊA CHỈ!\nGói này gửi cho trạm [${data.target}].\nBạn đang ở trạm [${stationConfig.name}].`);
                     if(syncFileInputRef.current) syncFileInputRef.current.value = '';
                     return;
                 }
                 if (sourceName === myName) {
                     alert(`⛔ LỖI LOGIC!\nBạn không thể tự nhập gói hàng do chính mình (${stationConfig.name}) xuất ra.`);
                     if(syncFileInputRef.current) syncFileInputRef.current.value = '';
                     return;
                 }
                 if (data.id && (window as any).electron) {
                     const already = await (window as any).electron.checkFileImported(data.id);
                     if (already) {
                         alert(`⚠️ FILE ĐÃ NHẬP!\nPhiếu điều chuyển này đã được nhập vào kho trước đó.\nKhông thể nhập lại.`);
                         if(syncFileInputRef.current) syncFileInputRef.current.value = '';
                         return;
                     }
                 }
                 setVerifiedItems((data.items || []).map((i: any) => ({ ...i, realStock: i.stock })));
                 setIncomingTransfer(data);
                 setShowVerifyModal(true);
             } else {
                 alert('❌ File không đúng định dạng điều chuyển.');
             }
         } catch { alert('❌ File không hợp lệ.'); }
         if (syncFileInputRef.current) syncFileInputRef.current.value = '';
     };
     reader.readAsText(file);
  };

  const confirmImportTransfer = async () => {
      if (!(window as any).electron) return;
      if (isLoading) return;
      
      setIsLoading(true);
      try {
          let count = 0;
          const logItems: any[] = [];
          for (const item of verifiedItems) {
              if (item.realStock > 0) {
                  const newId = crypto.randomUUID();
                  await dataService.importMedicine({ id: newId, name: item.name, group: item.group || 'Khác', unit: item.unit, stock: item.realStock, batchNumber: item.batchNumber, expiryDate: item.expiryDate, mfgDate: item.mfgDate, type: item.type || 'MEDICINE', skipLog: true }, stationConfig.name); 
                  count++;
                  logItems.push({ name: item.name, qty: item.realStock, batch: item.batchNumber, medId: newId });
              }
          }
          if (incomingTransfer && count > 0) {
              // Ghi log TRANSFER_IN tại trạm nhận
              await dataService.createInventoryLog({ id: crypto.randomUUID(), type: 'TRANSFER_IN', source: incomingTransfer.source || 'Unknown', target: stationConfig.name, timestamp: Date.now(), note: `Nhập kho từ phiếu điều chuyển`, items: logItems, actorName: currentUser?.name, actorRole: currentUser?.role });
              // Đánh dấu file đã nhập để chống nhập lại
              if (incomingTransfer.id) {
                  await (window as any).electron.markFileImported({ fileId: incomingTransfer.id, type: 'TRANSFER', source: incomingTransfer.source, target: stationConfig.name, importedAt: Date.now() });
              }
          }
          alert(`✅ Đã nhập kho ${count} mặt hàng!`); setShowVerifyModal(false); setVerifiedItems([]); setIncomingTransfer(null); await loadData();
      } catch(e) { console.error(e); }
      finally { setIsLoading(false); }
  };

  const buildSheetData = (data: MasterItem[], label: string) => {
    const rows: any[] = [];
    let stt = 1;
    data.forEach(master => {
        rows.push({ 'STT': stt++, [`Tên ${label}`]: master.name, 'Nhóm': master.group, 'ĐVT': master.unit, 'Số lô': '', 'Hạn SD': '', 'Ngày nhập': '', 'Tồn đầu': master.opening, 'Nhập': master.import, 'Sử dụng': master.usage, 'Chuyển trạm': master.transfer, 'Hủy/Khác': master.other_export, 'Tồn cuối': master.closing, 'Ghi chú': '' });
        master.batches.forEach(batch => {
            rows.push({ 'STT': '', [`Tên ${label}`]: '', 'Nhóm': '', 'ĐVT': '', 'Số lô': batch.batchNumber, 'Hạn SD': formatDate(batch.expiryDate), 'Ngày nhập': formatDate(batch.mfgDate), 'Tồn đầu': batch.opening, 'Nhập': batch.import, 'Sử dụng': batch.usage, 'Chuyển trạm': batch.transfer, 'Hủy/Khác': batch.other_export, 'Tồn cuối': batch.closing, 'Ghi chú': batch.status === 'EXPIRED' ? 'Hết hạn' : (batch.status === 'NEAR_EXPIRY' ? 'Cận hạn' : '') });
        });
    });
    return rows;
  };

  const handleExportXLSX = () => {
    const medicineData = calculateFlowData('MEDICINE');
    const supplyData = calculateFlowData('SUPPLY');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildSheetData(medicineData, 'thuốc')), 'Thuốc');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildSheetData(supplyData, 'vật tư')), 'Vật tư');
    XLSX.writeFile(wb, `BaoCao_Kho_${stationConfig.name}.xlsx`);
  };

  const addToCart = (med: Medicine) => { if (!transferCart.find(i => i.med.id === med.id)) setTransferCart([...transferCart, { med, qty: 1 }]); };

  // --- RENDER UI (FULL WIDTH & GOERTEK COLORS) ---
  return (
    <div className="h-full flex flex-col relative font-sans text-gray-800">
       <input type="file" ref={syncFileInputRef} onChange={handleSyncFileUpload} className="hidden" accept=".dat,.json,.txt"/>
       <input type="file" ref={excelInputRef} onChange={handleExcelImport} className="hidden" accept=".xlsx,.xls"/>

       {/* Báo cáo sử dụng thuốc/vật tư */}
       {showMedicineReport && (
         <MedicineUsageReport
           medicines={medicines}
           logs={logs}
           stationConfig={stationConfig}
           onClose={() => setShowMedicineReport(false)}
         />
       )}

       {/* Chốt kỳ */}
       {showPeriodClose && (
         <PeriodCloseModal
           medicines={medicines}
           logs={logs}
           stationConfig={stationConfig}
           currentUser={currentUser ?? null}
           onClose={() => setShowPeriodClose(false)}
           onSuccess={() => { setShowPeriodClose(false); loadData(); }}
         />
       )}

       {/* Import Fail Modal */}
       {showImportFail && (
           <ImportFailModal
               message='Không tìm thấy dữ liệu hợp lệ. Cột "Tên thuốc" (hoặc "Tên vật tư") phải có dữ liệu.'
               onDownloadTemplate={() => { downloadInventoryTemplate(); }}
               onClose={() => setShowImportFail(false)}
           />
       )}

       {/* --- TOP CONTROL BAR --- */}
       {activeTab !== 'history' && (
           <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center animate-fade-in">
                {/* 1. Bộ lọc (Trái) */}
                <div className="lg:col-span-3 flex gap-3">
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button onClick={() => setInventoryType('MEDICINE')} className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${inventoryType === 'MEDICINE' ? 'bg-green-600 text-white shadow' : 'text-gray-500 hover:text-gray-800'}`}><Pill className="inline mr-2" size={16}/>Dược<span className="block text-[9px] font-normal opacity-80 leading-tight">药品</span></button>
                        <button onClick={() => setInventoryType('SUPPLY')} className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${inventoryType === 'SUPPLY' ? 'bg-blue-600 text-white shadow' : 'text-gray-500 hover:text-gray-800'}`}><Stethoscope className="inline mr-2" size={16}/>Vật tư<span className="block text-[9px] font-normal opacity-80 leading-tight">耗材</span></button>
                    </div>
                    {stationConfig.type === StationType.HUB && (
                        <select className="bg-gray-50 border border-gray-200 text-sm font-bold rounded-lg p-2 outline-none focus:ring-2 focus:ring-green-500" value={filterStation} onChange={(e) => setFilterStation(e.target.value)}><option value="ALL">Tất cả trạm / 所有站点</option>{knownStations.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}</select>
                    )}
                </div>

                {/* 2. Thời gian (Giữa) */}
                <div className="lg:col-span-4 flex justify-center">
                    <div className="flex items-center bg-gray-50 px-4 py-2 rounded-lg border border-gray-200">
                        <Calendar size={18} className="text-gray-500 mr-3"/>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-sm font-bold text-gray-700 outline-none"/>
                        <ArrowRight size={14} className="mx-3 text-gray-400"/>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-sm font-bold text-gray-700 outline-none"/>
                    </div>
                </div>

                {/* 3. Thao tác (Phải) */}
                <div className="lg:col-span-5 flex justify-end gap-2">
                    {stationConfig.type !== StationType.HUB && <button disabled={isLoading} onClick={() => syncFileInputRef.current?.click()} className="flex items-center px-3 py-2 bg-purple-600 text-white rounded-lg font-bold text-sm hover:bg-purple-700 shadow-md disabled:opacity-50 transition-transform active:scale-95"><Download size={16} className="mr-2 shrink-0"/><span>Nhận điều chuyển<span className="block text-[9px] font-normal opacity-80 leading-tight">接收调拨</span></span></button>}
                    {stationConfig.type === StationType.HUB && <button disabled={isLoading} onClick={() => setShowTransferModal(true)} className="flex items-center px-3 py-2 bg-orange-500 text-white rounded-lg font-bold text-sm hover:bg-orange-600 shadow-md disabled:opacity-50 transition-transform active:scale-95"><Truck size={16} className="mr-2 shrink-0"/><span>Xuất trạm<span className="block text-[9px] font-normal opacity-80 leading-tight">调出站点</span></span></button>}
                    <button disabled={isLoading} onClick={() => setShowDisposeModal(true)} className="flex items-center px-3 py-2 bg-red-600 text-white rounded-lg font-bold text-sm hover:bg-red-700 shadow-md disabled:opacity-50 transition-transform active:scale-95"><Trash2 size={16} className="mr-2 shrink-0"/><span>Hủy/Khác<span className="block text-[9px] font-normal opacity-80 leading-tight">销毁/其他</span></span></button>
                    <button disabled={isLoading} onClick={() => setShowImportModal(true)} className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg font-bold text-sm hover:bg-green-700 shadow-md disabled:opacity-50 transition-transform active:scale-95"><Plus size={16} className="mr-2 shrink-0"/><span>Nhập kho<span className="block text-[9px] font-normal opacity-80 leading-tight">入库</span></span></button>
                    
                    <div className="w-px h-8 bg-gray-300 mx-1"></div>
                    
                    <button onClick={() => loadData()} className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"><RefreshCw size={20} className={isLoading ? 'animate-spin' : ''}/></button>
                    <button onClick={() => setShowMedicineReport(true)} className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-sm font-bold border border-green-200"><FileSpreadsheet size={16}/><span>Báo cáo<span className="block text-[9px] font-normal opacity-80 leading-tight">报告</span></span></button>
                    <div className="relative group">
                      <button
                        onClick={() => canClosePeriod && setShowPeriodClose(true)}
                        disabled={!canClosePeriod}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold shadow-md transition-colors ${
                          canClosePeriod
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                        }`}
                      >
                        <Lock size={16}/><span>Chốt kỳ<span className="block text-[9px] font-normal opacity-80 leading-tight">结算周期</span></span>
                      </button>
                      {!canClosePeriod && (
                        <div className="absolute bottom-full right-0 mb-2 w-56 bg-gray-800 text-white text-xs rounded-lg px-3 py-2 hidden group-hover:block z-50 shadow-xl">
                          Chỉ chốt kỳ 2 ngày cuối/đầu tháng<br/><span className="opacity-70">仅月末或月初2天可结算</span>
                          <div className="absolute top-full right-4 border-4 border-transparent border-t-gray-800"></div>
                        </div>
                      )}
                    </div>
                </div>
           </div>
       )}

       {/* --- TABLE CONTENT --- */}
       <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex-1 flex flex-col">
          <div className="flex border-b border-gray-200 bg-gray-50">
             <button onClick={() => setActiveTab('flow')} className={`px-6 py-4 text-sm font-bold border-b-2 flex items-center transition-colors ${activeTab === 'flow' ? 'text-green-700 border-green-600 bg-white' : 'text-gray-500 border-transparent hover:text-gray-800'}`}><Package className="mr-2" size={18}/><span>BÁO CÁO KHO<span className="block text-[9px] font-normal opacity-70 leading-tight">库存报告</span></span></button>
             <button onClick={() => setActiveTab('analysis')} className={`px-6 py-4 text-sm font-bold border-b-2 flex items-center transition-colors ${activeTab === 'analysis' ? 'text-blue-700 border-blue-600 bg-white' : 'text-gray-500 border-transparent hover:text-gray-800'}`}><Activity className="mr-2" size={18}/><span>PHÂN TÍCH<span className="block text-[9px] font-normal opacity-70 leading-tight">库存分析</span></span></button>
             <button onClick={() => setActiveTab('history')} className={`px-6 py-4 text-sm font-bold border-b-2 flex items-center transition-colors ${activeTab === 'history' ? 'text-purple-700 border-purple-600 bg-white' : 'text-gray-500 border-transparent hover:text-gray-800'}`}><History className="mr-2" size={18}/><span>NHẬT KÝ<span className="block text-[9px] font-normal opacity-70 leading-tight">交易记录</span></span></button>
          </div>
          
          <div className="flex-1 overflow-auto bg-white">
             {activeTab === 'flow' && (
                <table className="w-full text-left border-collapse text-sm">
                    <thead className="bg-gray-50 sticky top-0 z-10 text-gray-700 font-bold border-b border-gray-200">
                        <tr><th className="p-4 w-12"></th><th className="p-4">Tên {typeLabel}<span className="block text-[9px] font-normal opacity-60">药品/耗材</span></th><th className="p-4">Nhóm<span className="block text-[9px] font-normal opacity-60">分类</span></th><th className="p-4 text-right border-l">Tồn đầu<span className="block text-[9px] font-normal opacity-60">期初</span></th><th className="p-4 text-right border-l text-green-600">Nhập<span className="block text-[9px] font-normal opacity-60">入库</span></th><th className="p-4 text-right border-l text-purple-600">Kê đơn<span className="block text-[9px] font-normal opacity-60">处方</span></th><th className="p-4 text-right border-l text-orange-600">Điều chuyển<span className="block text-[9px] font-normal opacity-60">调拨</span></th><th className="p-4 text-right border-l text-red-600">Hủy/Khác<span className="block text-[9px] font-normal opacity-60">销毁</span></th><th className="p-4 text-right border-l font-bold bg-gray-50">Tồn cuối<span className="block text-[9px] font-normal opacity-60">期末</span></th><th className="p-4 text-center">ĐVT<span className="block text-[9px] font-normal opacity-60">单位</span></th><th className="p-4 text-center">Chi tiết<span className="block text-[9px] font-normal opacity-60">详情</span></th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {flowData.length === 0 && <tr><td colSpan={11} className="p-12 text-center text-gray-400 italic">Kho trống hoặc chưa có dữ liệu / 库存为空或无数据</td></tr>}
                        {flowData.map((m, idx) => (
                            <React.Fragment key={idx}>
                                <tr className={`hover:bg-green-50/50 cursor-pointer transition-colors ${expandedRows[m.name] ? 'bg-green-50' : ''}`} onClick={() => toggleRow(m.name)}>
                                    <td className="p-4 text-gray-400 text-center">{expandedRows[m.name] ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</td>
                                    <td className="p-4 font-bold text-gray-800">{m.name}</td><td className="p-4 text-gray-500">{m.group}</td>
                                    <td className="p-4 text-right border-l font-medium text-gray-500">{m.opening}</td><td className="p-4 text-right border-l font-bold text-green-600">{m.import > 0 ? `+${m.import}` : '-'}</td><td className="p-4 text-right border-l font-bold text-purple-600">{m.usage > 0 ? `-${m.usage}` : '-'}</td><td className="p-4 text-right border-l font-bold text-orange-600">{m.transfer > 0 ? `-${m.transfer}` : '-'}</td><td className="p-4 text-right border-l font-bold text-red-600">{m.other_export > 0 ? `-${m.other_export}` : '-'}</td><td className="p-4 text-right border-l font-bold text-blue-700 bg-gray-50">{m.closing}</td>
                                    <td className="p-4 text-center text-gray-500">{m.unit}</td><td className="p-4 text-center text-xs text-gray-400">{m.batches.length} lô</td>
                                </tr>
                                {expandedRows[m.name] && m.batches.length > 0 && (
                                    <tr className="bg-gray-50/50 border-b border-gray-200">
                                        <td colSpan={11} className="p-4 pl-12 pr-4 py-4">
                                            <table className="w-full text-xs bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                                                <thead className="bg-gray-100 font-bold text-gray-600"><tr><th className="p-2 text-left">Số lô / 批号</th><th className="p-2 text-left">Hạn dùng / 效期</th><th className="p-2 text-right">Tồn đầu / 期初</th><th className="p-2 text-right">Nhập / 入库</th><th className="p-2 text-right">Kê đơn / 处方</th><th className="p-2 text-right">Chuyển / 调拨</th><th className="p-2 text-right">Hủy/Khác / 销毁</th><th className="p-2 text-right">Tồn cuối / 期末</th><th className="p-2 text-center">Trạng thái / 状态</th>{isPrivileged && <th className="p-2 text-center">Thao tác / 操作</th>}</tr></thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {m.batches.map((b, bIdx) => {
                                                        const med = medicines.find(x => x.id === b.id);
                                                        return editingBatch?.id === b.id ? (
                                                            <tr key={bIdx} className="bg-yellow-50">
                                                                <td className="p-2"><input className="border rounded px-1 py-0.5 text-xs w-24" value={editBatchData.batchNumber || ''} onChange={e => setEditBatchData(p => ({...p, batchNumber: e.target.value}))}/></td>
                                                                <td className="p-2"><input type="date" className="border rounded px-1 py-0.5 text-xs" value={editBatchData.expiryDate || ''} onChange={e => setEditBatchData(p => ({...p, expiryDate: e.target.value}))}/></td>
                                                                <td colSpan={6}></td>
                                                                <td className="p-2 text-center">
                                                                    <div className="flex gap-1 justify-center">
                                                                        <button onClick={handleSaveBatch} className="bg-green-600 text-white px-2 py-0.5 rounded text-xs font-bold">Lưu / 保存</button>
                                                                        <button onClick={() => setEditingBatch(null)} className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded text-xs">Hủy / 取消</button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ) : (
                                                        <tr key={bIdx} className="hover:bg-gray-50 transition-colors">
                                                            <td className="p-3 font-mono text-blue-600 font-medium">{b.batchNumber}</td><td className="p-3">{formatDate(b.expiryDate)}</td><td className="p-3 text-right text-gray-500">{b.opening}</td><td className="p-3 text-right font-medium">{b.import}</td><td className="p-3 text-right font-medium">{b.usage}</td><td className="p-3 text-right font-medium">{b.transfer}</td><td className="p-3 text-right text-red-500">{b.other_export}</td><td className="p-3 text-right font-bold text-gray-800">{b.closing}</td>
                                                            <td className="p-3 text-center">{b.status === 'EXPIRED' ? <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold">HẾT HẠN<span className="block text-[9px] font-normal">已过期</span></span> : b.status === 'NEAR_EXPIRY' ? <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded font-bold">CẬN HẠN<span className="block text-[9px] font-normal">临期</span></span> : <span className="text-green-600 font-bold">OK</span>}</td>
                                                            {isPrivileged && (
                                                                <td className="p-2 text-center">
                                                                    <div className="flex gap-1 justify-center">
                                                                        <button onClick={() => med && handleEditBatch(med)} className="bg-yellow-50 text-yellow-700 hover:bg-yellow-100 p-1 rounded" title="Sửa"><Pencil size={13}/></button>
                                                                        <button onClick={() => med && handleDeleteBatch(med)} disabled={b.closing > 0} className="bg-red-50 text-red-600 hover:bg-red-100 p-1 rounded disabled:opacity-30" title={b.closing > 0 ? 'Còn tồn kho' : 'Xóa'}><Trash2 size={13}/></button>
                                                                    </div>
                                                                </td>
                                                            )}
                                                        </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
             )}

             {activeTab === 'analysis' && (
                <div className="p-8">
                     <h4 className="text-xl font-bold text-gray-800 mb-6 flex items-center"><TrendingUp className="mr-3 text-blue-600"/> Phân tích & Dự báo tồn kho / 库存分析与预测</h4>
                     <div className="rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                         <table className="w-full text-left">
                            <thead className="bg-blue-50 text-sm font-bold text-blue-800 uppercase tracking-wide"><tr><th className="p-4">Tên {typeLabel}<span className="block text-[9px] font-normal opacity-60 normal-case">药品/耗材</span></th><th className="p-4">Nhóm<span className="block text-[9px] font-normal opacity-60 normal-case">分类</span></th><th className="p-4 text-right">Tổng Xuất<span className="block text-[9px] font-normal opacity-60 normal-case">总出库</span></th><th className="p-4 text-right">TB ngày<span className="block text-[9px] font-normal opacity-60 normal-case">日均</span></th><th className="p-4 text-right">Tồn hiện tại<span className="block text-[9px] font-normal opacity-60 normal-case">当前库存</span></th><th className="p-4 text-center">Còn lại (ngày)<span className="block text-[9px] font-normal opacity-60 normal-case">剩余天数</span></th><th className="p-4 text-center">Dự kiến hết<span className="block text-[9px] font-normal opacity-60 normal-case">预计耗尽</span></th></tr></thead>
                            <tbody className="divide-y divide-gray-100">
                                {analysisData.map((item, idx) => (
                                    <tr key={idx} className={`hover:bg-gray-50 transition-colors ${item.daysRemaining < 30 ? 'bg-red-50/50' : ''}`}>
                                        <td className="p-4 font-bold text-gray-700">{item.name}</td><td className="p-4 text-gray-500">{item.group}</td><td className="p-4 text-right font-medium">{item.totalUsage}</td><td className="p-4 text-right text-gray-500">{item.avgDailyUsage.toFixed(1)}</td><td className="p-4 text-right font-bold text-blue-600">{item.currentStock}</td>
                                        <td className="p-4 text-center font-bold">{item.daysRemaining > 365 ? '> 1 năm' : Math.floor(item.daysRemaining)}</td>
                                        <td className="p-4 text-center text-red-600 font-bold">{item.predictedStockoutDate}</td>
                                    </tr>
                                ))}
                            </tbody>
                         </table>
                     </div>
                </div>
             )}

             {activeTab === 'history' && (
                 <div className="p-0">
                     <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center sticky top-0 z-20 shadow-sm">
                         <div className="text-sm font-bold text-gray-600 flex items-center"><Clock size={18} className="mr-2 text-purple-600"/>Lịch sử giao dịch / 交易记录: <span className="ml-2 text-gray-900 bg-white px-2 py-0.5 rounded border border-gray-200 shadow-sm font-mono">{formatDate(startDate)} ➝ {formatDate(endDate)}</span></div>
                     </div>
                     <table className="w-full text-left border-collapse text-sm">
                         <thead className="bg-gray-100 sticky top-14 z-10 text-gray-700 font-bold shadow-sm">
                             <tr><th className="p-4 w-12"></th><th className="p-4 w-48">Thời gian<span className="block text-[9px] font-normal opacity-60">时间</span></th><th className="p-4 w-40">Loại GD<span className="block text-[9px] font-normal opacity-60">类型</span></th><th className="p-4">Diễn giải<span className="block text-[9px] font-normal opacity-60">说明</span></th><th className="p-4 text-right">Số lượng<span className="block text-[9px] font-normal opacity-60">数量</span></th></tr>
                         </thead>
                         <tbody className="divide-y divide-gray-100">
                             {logs.length === 0 && <tr><td colSpan={5} className="p-16 text-center text-gray-400 italic">Chưa có lịch sử giao dịch / 暂无交易记录</td></tr>}
                             {historyData.map((log: any) => {
                                 let badgeClass = "bg-gray-100 text-gray-600"; let typeName = log.type;
                                 if (log.type.includes("IMPORT_INIT")) { badgeClass = "bg-blue-100 text-blue-700"; typeName = "SETUP ĐẦU KỲ / 初始建库"; }
                                 else if (log.type.includes("IMPORT")) { badgeClass = "bg-green-100 text-green-700"; typeName = "NHẬP KHO / 入库"; }
                                 else if (log.type === "EXPORT_USE") { badgeClass = "bg-purple-100 text-purple-700"; typeName = "KÊ ĐƠN / 处方"; }
                                 else if (log.type === "TRANSFER_OUT") { badgeClass = "bg-orange-100 text-orange-700"; typeName = "XUẤT CHUYỂN / 调出"; }
                                 else if (log.type === "TRANSFER_IN") { badgeClass = "bg-blue-600 text-white"; typeName = "NHẬP CHUYỂN / 调入"; }
                                 else if (log.type.includes("DESTROY") || log.type.includes("OTHER")) { badgeClass = "bg-red-100 text-red-700"; typeName = "HỦY/KHÁC / 销毁"; }
                                 return (
                                     <React.Fragment key={log.id}>
                                         <tr className={`hover:bg-purple-50/30 cursor-pointer transition-colors border-b border-gray-100 ${expandedHistory[log.id] ? 'bg-purple-50/50' : ''}`} onClick={() => toggleHistory(log.id)}>
                                             <td className="p-4 text-gray-400 text-center">{expandedHistory[log.id] ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</td>
                                             <td className="p-4 font-mono text-gray-600 font-medium">{formatDateTime(log.timestamp)}</td>
                                             <td className="p-4"><span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${badgeClass}`}>{typeName}</span></td>
                                             <td className="p-4 font-medium text-gray-800">
                                                 <div>{log.note}</div>
                                                 {log.actorName && <div className="text-xs text-gray-400 mt-0.5">{log.actorName} · {log.actorRole}</div>}
                                             </td>
                                             <td className="p-4 text-right font-bold text-gray-700">{log.items.length} mặt hàng</td>
                                         </tr>
                                         {expandedHistory[log.id] && (
                                             <tr className="bg-gray-50 border-b border-gray-200">
                                                 <td colSpan={5} className="p-4 pl-16 py-6">
                                                     <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm max-w-4xl">
                                                         <table className="w-full text-xs">
                                                             <thead className="bg-gray-100 font-bold text-gray-600 uppercase tracking-wide"><tr><th className="p-3 text-left">Tên hàng hóa / 商品名</th><th className="p-3 text-center">Số lô / 批号</th><th className="p-3 text-right">Số lượng / 数量</th></tr></thead>
                                                             <tbody className="divide-y divide-gray-100">
                                                                 {log.items.map((item: any, i: number) => {
                                                                     const isDeleted = !medicines.some(m => m.name === item.name);
                                                                     return (
                                                                     <tr key={i} className="hover:bg-gray-50">
                                                                         <td className="p-3 font-bold text-gray-700 flex items-center gap-2">{item.name}{isDeleted && <span className="bg-gray-200 text-gray-500 text-[10px] px-1.5 py-0.5 rounded font-bold">Đã xóa / 已删除</span>}</td>
                                                                         <td className="p-3 text-center font-mono text-gray-500">{item.batch || '---'}</td>
                                                                         <td className="p-3 text-right font-bold text-green-600 text-sm">{item.qty || item.quantity}</td>
                                                                     </tr>
                                                                     );
                                                                 })}
                                                             </tbody>
                                                         </table>
                                                     </div>
                                                 </td>
                                             </tr>
                                         )}
                                     </React.Fragment>
                                 );
                             })}
                         </tbody>
                     </table>
                 </div>
             )}
          </div>
       </div>

       {showVerifyModal && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
               <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                   <div className="p-5 bg-purple-700 text-white font-bold flex justify-between items-center rounded-t-xl">
                       <span className="flex items-center text-lg"><Check className="mr-2"/> XÁC NHẬN NHẬP KHO<span className="block text-xs font-normal opacity-80">确认入库</span></span>
                       <button onClick={() => setShowVerifyModal(false)} className="hover:bg-purple-600 p-1 rounded-full"><X/></button>
                   </div>
                   <div className="p-4 bg-purple-50 border-b border-purple-100 flex items-center gap-3">
                       <Package className="text-purple-600" size={24}/>
                       <div>
                           <p className="text-purple-900 font-bold text-sm">GÓI HÀNG TỪ / 来自: {incomingTransfer?.source}</p>
                           <p className="text-xs text-purple-600">Vui lòng kiểm tra số lượng thực nhận trước khi nhập kho. / 请核实实收数量后入库。</p>
                       </div>
                   </div>
                   <div className="flex-1 overflow-auto p-0">
                       <table className="w-full text-left text-sm border-collapse">
                           <thead className="bg-gray-100 text-gray-600 font-bold sticky top-0 shadow-sm z-10"><tr><th className="p-3 border-b pl-6">Tên / 名称</th><th className="p-3 border-b text-center">Lô / 批号</th><th className="p-3 border-b text-center">Gửi / 发送</th><th className="p-3 border-b text-center bg-green-50 w-32">Thực nhận / 实收</th></tr></thead>
                           <tbody>
                               {verifiedItems.map((item, idx) => (
                                   <tr key={idx} className="border-b hover:bg-gray-50 transition-colors">
                                       <td className="p-3 pl-6 font-bold text-gray-800">{item.name}</td>
                                       <td className="p-3 text-center font-mono text-gray-500 bg-gray-50/50">{item.batchNumber}</td>
                                       <td className="p-3 text-center font-bold text-gray-400">{item.stock}</td>
                                       <td className="p-2 text-center bg-green-50">
                                           <input type="number" className="w-full text-center border-2 border-green-200 rounded-lg font-bold text-green-700 focus:border-green-500 outline-none p-1.5 bg-white shadow-sm" value={item.realStock} onChange={e => { const n = [...verifiedItems]; n[idx].realStock = parseInt(e.target.value)||0; setVerifiedItems(n); }}/>
                                       </td>
                                   </tr>
                               ))}
                           </tbody>
                       </table>
                   </div>
                   <div className="p-5 border-t bg-gray-50 flex justify-end gap-3">
                       <button onClick={() => setShowVerifyModal(false)} className="px-5 py-2.5 text-gray-600 font-bold hover:bg-gray-200 rounded-lg transition-colors">Hủy bỏ / 取消</button>
                       <button disabled={isLoading} onClick={confirmImportTransfer} className="px-6 py-2.5 bg-green-600 text-white font-bold rounded-lg flex items-center hover:bg-green-700 shadow-lg disabled:opacity-50 transition-transform active:scale-95"><Check className="mr-2"/><span>NHẬP KHO NGAY<span className="block text-[9px] font-normal opacity-80 leading-tight">立即入库</span></span></button>
                   </div>
               </div>
           </div>
       )}

       {(showTransferModal || showDisposeModal) && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
               <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden">
                   <div className={`p-5 text-white font-bold flex justify-between items-center rounded-t-xl ${showTransferModal ? 'bg-orange-500' : 'bg-red-600'}`}>
                       <span className="flex items-center text-xl">{showTransferModal ? <><Truck className="mr-3"/><span>XUẤT ĐIỀU CHUYỂN<span className="block text-xs font-normal opacity-80">调拨出库</span></span></> : <><Trash2 className="mr-3"/><span>XUẤT HỦY / KHÁC<span className="block text-xs font-normal opacity-80">销毁出库</span></span></>}</span>
                       <button onClick={() => { setShowTransferModal(false); setShowDisposeModal(false); }} className="hover:bg-white/20 p-1 rounded-full"><X size={20}/></button>
                   </div>
                   
                   {showTransferModal && (
                       <div className="p-6 bg-orange-50 border-b border-orange-100 flex items-center gap-4">
                           <span className="font-bold text-orange-800 whitespace-nowrap">Đến trạm / 目标站:</span>
                           <select className="flex-1 p-3 rounded-lg border border-orange-200 font-bold text-gray-700 focus:ring-2 focus:ring-orange-400 outline-none bg-white shadow-sm" value={targetStation} onChange={e => setTargetStation(e.target.value)}>
                               <option value="">-- Chọn trạm nhận --</option>{knownStations.filter(s => s.name !== stationConfig.name).map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                           </select>
                       </div>
                   )}
                   {showDisposeModal && (
                        <div className="p-6 bg-red-50 border-b border-red-100 flex items-center gap-4">
                            <span className="font-bold text-red-700 flex items-center whitespace-nowrap"><AlertOctagon size={20} className="mr-2"/> Lý do xuất / 出库原因:</span>
                            <select className="flex-1 p-3 rounded-lg border border-red-200 font-bold text-gray-700 focus:ring-2 focus:ring-red-400 outline-none bg-white shadow-sm" value={disposeReason} onChange={e => setDisposeReason(e.target.value)}>
                                <option value="EXPIRED">⛔ Hết hạn sử dụng (Expired)</option>
                                <option value="DAMAGED">💔 Hỏng / Vỡ (Damaged)</option>
                                <option value="LOST">📉 Thất thoát / Kiểm kê (Lost)</option>
                                <option value="INTERNAL">🏢 Sử dụng nội bộ (Internal Use)</option>
                            </select>
                        </div>
                   )}

                   <div className="flex-1 flex overflow-hidden">
                       <div className="w-1/2 border-r border-gray-200 p-0 flex flex-col bg-gray-50/50">
                           <div className="p-3 bg-white border-b border-gray-200 font-bold text-gray-500 uppercase text-xs tracking-wider sticky top-0 z-10 pl-6">Danh sách trong kho / 库存列表</div>
                           <div className="flex-1 overflow-y-auto p-4 space-y-2">
                               {cleanBatches.map(m => (
                                   <div key={m.id} className="flex justify-between items-center p-4 bg-white border border-gray-200 rounded-lg hover:border-green-500 hover:shadow-md cursor-pointer transition-all mb-2 group" onClick={() => { if(!transferCart.find(i=>i.med.id===m.id)) setTransferCart([...transferCart, {med: m, qty: 1}]) }}>
                                       <div><div className="font-bold text-gray-800 text-sm">{m.name}</div><div className="text-xs text-gray-500 mt-1 flex items-center gap-2"><span className="bg-gray-100 px-1.5 py-0.5 rounded font-mono border border-gray-200">Lô: {m.batchNumber}</span> <span className="font-bold text-green-600">Tồn: {m.stock}</span></div></div>
                                       <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-green-600 group-hover:text-white transition-colors"><Plus size={18}/></div>
                                   </div>
                               ))}
                           </div>
                       </div>
                       <div className="w-1/2 flex flex-col bg-white">
                           <div className="p-3 bg-gray-100 border-b border-gray-200 font-bold text-gray-600 uppercase text-xs tracking-wider sticky top-0 flex justify-between px-6 z-10"><span>Danh sách xuất / 出库清单</span><span className="bg-gray-300 text-white px-2 rounded-full text-xs font-bold">{transferCart.length}</span></div>
                           <div className="flex-1 overflow-y-auto p-4 space-y-3">
                               {transferCart.length === 0 && <div className="h-full flex flex-col items-center justify-center text-gray-300 italic"><Package size={64} className="mb-4 opacity-20"/><p>Chưa chọn mặt hàng nào / 未选择任何商品</p></div>}
                               {transferCart.map((item, idx) => (
                                   <div key={idx} className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 flex justify-between items-center hover:bg-gray-50 transition-colors">
                                           <div className="flex-1"><div className="font-bold text-gray-800 text-sm">{item.med.name}</div><div className="text-xs text-gray-500 font-mono mt-0.5">{item.med.batchNumber}</div></div>
                                           <div className="flex items-center gap-3">
                                               <input type="number" min="1" max={item.med.stock} value={item.qty} className="w-20 p-2 border-2 border-gray-200 rounded-lg font-bold text-center focus:border-blue-500 outline-none text-gray-700" onChange={e => { let val = parseInt(e.target.value)||0; if(val > item.med.stock) val = item.med.stock; setTransferCart(prev => prev.map(p => p.med.id === item.med.id ? {...p, qty: val} : p)); }}/>
                                               <button onClick={() => setTransferCart(prev => prev.filter(p => p.med.id !== item.med.id))} className="text-gray-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors"><Trash2 size={18}/></button>
                                           </div>
                                   </div>
                               ))}
                           </div>
                           <div className="p-4 border-t border-gray-200 bg-gray-50">
                               <button disabled={isLoading || transferCart.length===0 || (showTransferModal && !targetStation)} onClick={showTransferModal ? handleTransferAction : handleDisposeAction} className={`w-full py-4 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-transform active:scale-95 flex justify-center items-center text-lg ${showTransferModal ? 'bg-orange-500 hover:bg-orange-600' : 'bg-red-600 hover:bg-red-700'}`}>
                                   {isLoading ? <RefreshCw className="animate-spin mr-3"/> : (showTransferModal ? <><FileSpreadsheet className="mr-3"/><span>XUẤT FILE .DAT<span className="block text-xs font-normal opacity-80">导出文件</span></span></> : <><Trash2 className="mr-3"/><span>XÁC NHẬN XUẤT<span className="block text-xs font-normal opacity-80">确认出库</span></span></>)}
                               </button>
                           </div>
                       </div>
                   </div>
               </div>
           </div>
       )}

       {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-scale-in">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                  <div className="bg-green-600 p-4 text-white font-bold flex justify-between items-center">
                      <span className="flex items-center text-lg"><Plus className="mr-2"/><span>{medicines.some(m => m.name === newItem.name) ? 'Nhập thêm lô mới' : `Khai báo ${typeLabel} mới`}<span className="block text-xs font-normal opacity-80">{medicines.some(m => m.name === newItem.name) ? '新增批次' : '新建药品/耗材'}</span></span></span>
                      <button onClick={() => setShowImportModal(false)} className="hover:bg-white/20 p-1 rounded-full"><X size={20}/></button>
                  </div>
                  
                  <div className="p-4 bg-yellow-50 border-b border-yellow-100 flex items-center justify-between px-6">
                      <label className="flex items-center cursor-pointer select-none w-full group">
                          <div className="relative mr-3">
                              <input type="checkbox" checked={isSetupMode} onChange={e => setIsSetupMode(e.target.checked)} className="sr-only"/>
                              <div className={`block w-12 h-7 rounded-full transition-colors ${isSetupMode ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                              <div className={`absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform ${isSetupMode ? 'transform translate-x-5' : ''}`}></div>
                          </div>
                          <div className="flex flex-col">
                              <span className="font-bold text-gray-800 text-sm">Chế độ Setup Tồn Đầu / 初始建库模式</span>
                              <span className="text-[10px] text-gray-500">Chỉ dùng khai báo lần đầu / 仅首次建库使用</span>
                          </div>
                      </label>
                  </div>

                  <div className="p-5 border-b border-gray-100">
                      <button disabled={isLoading} onClick={() => excelInputRef.current?.click()} className="flex items-center w-full justify-center px-4 py-3 bg-white border-2 border-dashed border-gray-300 text-gray-600 rounded-xl font-bold hover:bg-green-50 hover:text-green-700 hover:border-green-500 transition-all disabled:opacity-50 text-sm">
                          <FileSpreadsheet className="mr-2 shrink-0" size={20}/><span>Chọn file Excel để nhập nhanh<span className="block text-[9px] font-normal opacity-70 leading-tight">选择Excel文件批量导入</span></span>
                      </button>
                  </div>

                  <form onSubmit={handleSingleImport} className="p-6 space-y-5">
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tên {typeLabel}</label>
                          <input list="med-suggestions" required className="border border-gray-300 p-2.5 rounded-lg w-full font-bold text-gray-800 focus:ring-2 focus:ring-green-500 outline-none shadow-sm" value={newItem.name||''} onChange={e => { const val = e.target.value; const match = medicines.find(m => m.name === val); setNewItem({ ...newItem, name: val, group: match?.group || match?.group_name || newItem.group || '', unit: match?.unit || newItem.unit || '' }); }} placeholder={`Gõ tên ${typeLabel}...`} />
                          <datalist id="med-suggestions">{availableNames.map(n => <option key={n} value={n}/>)}</datalist>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nhóm</label>
                              <input list="group-suggestions" placeholder="VD: Kháng sinh" required className={`border border-gray-300 p-2.5 rounded-lg w-full focus:ring-2 focus:ring-green-500 outline-none shadow-sm ${medicines.some(m => m.name === newItem.name) ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'}`} readOnly={medicines.some(m => m.name === newItem.name)} value={newItem.group||''} onChange={e => setNewItem({...newItem, group: e.target.value})}/>
                              <datalist id="group-suggestions">{availableGroups.map(g => <option key={g} value={g}/>)}</datalist>
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Đơn vị</label>
                              <input placeholder="VD: Viên" required className={`border border-gray-300 p-2.5 rounded-lg w-full focus:ring-2 focus:ring-green-500 outline-none shadow-sm ${medicines.some(m => m.name === newItem.name) ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'}`} readOnly={medicines.some(m => m.name === newItem.name)} value={newItem.unit||''} onChange={e => setNewItem({...newItem, unit: e.target.value})}/>
                          </div>
                      </div>

                      <div className="pt-4 grid grid-cols-2 gap-4 border-t border-gray-100">
                          <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Số lượng</label><input type="number" required placeholder="0" className="border border-gray-300 p-3 rounded-lg w-full font-bold text-green-600 text-xl focus:ring-2 focus:ring-green-500 outline-none shadow-sm" onChange={e => setNewItem({...newItem, stock: Number(e.target.value)})} /></div>
                          <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Số lô</label><input required placeholder="LOT123" className="border border-gray-300 p-3 rounded-lg w-full uppercase font-mono focus:ring-2 focus:ring-green-500 outline-none shadow-sm" onChange={e => setNewItem({...newItem, batchNumber: e.target.value})} /></div>
                          <div className="col-span-2"><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Hạn dùng</label><input type="date" required className="border border-gray-300 p-3 rounded-lg w-full focus:ring-2 focus:ring-green-500 outline-none cursor-pointer shadow-sm text-gray-700" onChange={e => setNewItem({...newItem, expiryDate: e.target.value})} /></div>
                      </div>
                      
                      <button disabled={isLoading} type="submit" className="w-full py-4 bg-green-600 text-white font-bold rounded-xl mt-4 hover:bg-green-700 shadow-lg disabled:opacity-50 transition-transform active:scale-95 text-lg">
                          {isLoading ? <RefreshCw className="animate-spin mx-auto"/> : <span>LƯU & NHẬP KHO<span className="block text-xs font-normal opacity-80">保存并入库</span></span>}
                      </button>
                  </form>
              </div>
          </div>
       )}
    </div>
  );
};