// --- ENUMS (DANH MỤC CỐ ĐỊNH) ---
export enum Role {
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',
  STAFF = 'STAFF'
}

export enum StationType {
  HUB = 'HUB',
  SPOKE = 'SPOKE'
}

export enum EncounterStatus {
  WAITING = 'WAITING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED_WORK = 'COMPLETED_WORK',     // Về làm việc
  COMPLETED_TRANSFER = 'COMPLETED_TRANSFER', // Chuyển viện
  REST_30 = 'REST_30',                   // Nghỉ ngơi tại trạm
  MONITOR = 'MONITOR'                    // Theo dõi
}

export type MedicineType = 'MEDICINE' | 'SUPPLY';

// --- DATABASE MODELS (CẤU TRÚC DỮ LIỆU) ---

// 1. User & Cấu hình trạm
export interface User {
  id: string;
  name: string;
  role: Role;
  canPrescribe: boolean;
}

export interface StationConfig {
  id: string;
  name: string;
  type: StationType;
  isConfigured: boolean;
  email?: string; // Mới thêm để phục vụ sync
}

// 2. Bệnh nhân
export interface Patient {
  id: string; // Mã nhân viên
  name: string;
  department: string;
}

// 3. Thuốc & Vật tư (Cập nhật khớp với SQLite)
export interface Medicine {
  id: string;
  name: string;
  group: string;        // Tên nhóm dùng ở Frontend
  group_name?: string;  // Tên nhóm trong Database (SQLite)
  unit: string;
  stock: number;
  mfgDate?: string;     // Ngày sản xuất
  expiryDate: string;   // Hạn sử dụng
  batchNumber: string;  // Số lô
  type?: MedicineType;  // Phân loại
  station?: string;     // Trạm đang giữ thuốc này
}

// 4. Lịch sử kho (Log) - CẤU TRÚC MỚI (Hỗ trợ mảng items)
export interface InventoryLog {
  id: string;
  timestamp: number; // Thay cho 'date' cũ
  type: 'IMPORT_SUPPLIER' | 'IMPORT_HUB' | 'EXPORT_SPOKE' | 'EXPORT_USE' | 'EXPORT_DESTROY' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'TRANSFER' | 'IMPORT';
  source: string;    // Nơi gửi (Thay cho 'from')
  target: string;    // Nơi nhận (Thay cho 'to')
  note?: string;
  
  // Danh sách các mặt hàng trong lần giao dịch này
  items: Array<{
    id?: string;
    name: string;
    qty: number;
    batch?: string;
    receivedQty?: number; // Dùng khi kiểm hàng nhập kho
  }>; 
}

// 5. Phiếu khám bệnh (Encounter)
export interface Encounter {
  id: string;
  patientId: string;
  patientName: string;
  department: string;
  symptoms: string[];
  startTime: number;
  restStartTime?: number;
  endTime?: number;
  status: EncounterStatus;
  
  diagnosis?: string;
  diseaseGroup?: string;
  instruction?: string; // Y lệnh / Hướng dẫn thêm
  
  // Danh sách thuốc kê đơn
  prescriptions: {
    medicineId: string;
    medicineName: string;
    quantity: number;
    unit?: string;      // Thêm đơn vị để hiển thị cho rõ
    usage?: string;     // Cách dùng (Sáng/Trưa/Chiều)
  }[];
  
  notes?: string;
  stationId: string;
  stationName: string;
  is_synced?: number; // 0 hoặc 1 (SQLite column)
}

// --- CONSTANTS INTERFACES ---
export interface Symptom {
  id: string;
  vi: string;
  cn: string;
  icon: string;
}

export interface Protocol {
  id: string;
  name: string;
  diagnosis: string;
  diseaseGroup: string;
  medicines: {
    medicineId: string;
    quantity: number;
  }[];
  isApproved: boolean;
}

// --- GLOBAL WINDOW (CẦU NỐI REACT <-> ELECTRON) ---
// Cập nhật đầy đủ các hàm có trong preload.js
declare global {
  interface Window {
    electron: {
      // IPC Core
      ipcRenderer: {
        invoke: (channel: string, ...args: any[]) => Promise<any>;
        send: (channel: string, ...args: any[]) => void;
        on: (channel: string, func: (...args: any[]) => void) => (() => void);
        once: (channel: string, func: (...args: any[]) => void) => void;
      };

      // Sync Service
      triggerSendSync: () => Promise<{ success: boolean; message: string; counts?: any }>;
      triggerFetchSync: () => Promise<{ success: boolean; message: string }>;
      importManualData: (content: string) => Promise<any>;

      // Database: Encounter Methods
      createEncounter: (data: Encounter) => Promise<string>; // Trả về ID
      updateEncounter: (data: Partial<Encounter>) => Promise<boolean>;
      getEncounters: () => Promise<Encounter[]>;
      getAllEncounters: () => Promise<Encounter[]>;
      getClinicalEvents: (encounterId: string) => Promise<any[]>;

      // Database: Inventory Methods
      getInventory: (stationName?: string) => Promise<Medicine[]>;
      getInventoryLogs: () => Promise<InventoryLog[]>;
      importMedicine: (data: any, stationName: string) => Promise<boolean>;
      createInventoryLog: (logData: any) => Promise<boolean>;
      
      // Helper
      getKnownStations: () => Promise<any[]>;
      
      // Real-time Listeners
      onDataUpdate: (callback: (data: any) => void) => void;
      removeDataUpdateListener: () => void;

      // Server sync
      syncNow: () => Promise<any>;
      getUnsyncedCount: () => Promise<any>;
      updateServerSyncConfig: (config: any) => Promise<any>;
      updateServerStationConfig: (s: any) => Promise<any>;
      pullEmployees: () => Promise<any>;
      onServerSyncTime: (callback: (time: string) => void) => void;
      removeServerSyncTimeListener: () => void;
      deleteEncounter: (id: string) => Promise<any>;
      queryServerEncounters: (params: any) => Promise<any>;
      pushProtocolsToServer: (protocols: any[]) => Promise<any>;
      onSpokeProtocolsUpdate: (callback: (data: any) => void) => void;
      removeSpokeProtocolsListener: () => void;

      // Sync Progress Modal
      getPushStatus: () => Promise<any[]>;
      syncWithProgress: (options?: { pushEncounters?: boolean; pushInventoryLogs?: boolean }) => Promise<any>;
      onSyncProgress: (callback: (data: any) => void) => void;
      removeSyncProgressListener: () => void;

      [key: string]: any;
    };
  }
}