declare const __APP_VERSION__: string;

export interface ServerSyncConfig {
  enabled: boolean;
  serverUrl: string;
  apiKey: string;
  retryIntervalMinutes: number;
  syncEmployeesOnStartup: boolean;
  employeeSyncIntervalHours: number;
}

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
  gender?: string; // Bổ sung từ file KSK
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
  actorName?: string;
  actorRole?: string;

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
  is_synced?: number;       // 0 hoặc 1 (SQLite column)
  isSupplementary?: number; // 1 = đơn kê bổ sung cuối kỳ
  prescriptionDate?: number; // Ngày kê thực tế (có thể khác startTime)
}

// 6. Kết quả khám sức khỏe định kỳ hàng năm
export interface HealthCheckup {
  id: string;
  employeeId: string;
  year: number;
  checkupMonth?: string;
  healthClass?: string;
  healthConclusion?: string;
  diseaseConclusion?: string;
  consultation?: string;
  examDetails: Record<string, any>;
  createdAt: number;
}

export interface PatientTimeline {
  encounters: Encounter[];
  checkups: HealthCheckup[];
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
    medicineName?: string;
    unit?: string;
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
      deleteEncounter: (id: string) => Promise<any>;

      // File Export/Import (Spoke <-> Hub)
      exportClinicalData: (stationName: string) => Promise<{ success: boolean; count?: number; message?: string }>;
      importClinicalData: () => Promise<any>;
      exportMedicineFile: (stationName: string) => Promise<any>;
      importMedicineFile: (stationName: string) => Promise<any>;
      checkFileImported: (fileId: string) => Promise<boolean>;
      markFileImported: (data: any) => Promise<any>;

      // Kiosk
      openKiosk: () => Promise<{ status: string }>;

      // Misc Sync & Data
      getUnsyncedCount:          () => Promise<{ encounters: number; medicines: number; inventoryLogs: number }>;
      updateServerSyncConfig:    (config: ServerSyncConfig) => Promise<{ success: boolean }>;
      updateServerStationConfig: (s: { id: string; name: string }) => Promise<{ success: boolean }>;
      syncNow:                   () => Promise<{ success: boolean; unsyncedCount?: any }>;
      pullEmployees:             () => Promise<{ success: boolean; data: { id_nv: string; ho_ten: string; bo_phan: string }[] }>;
      resetData: (type: string) => Promise<any>;

      // Database: Inventory Methods
      getInventory: (stationName?: string) => Promise<Medicine[]>;
      getAllInventoryByStation: () => Promise<Medicine[]>;
      createSupplementaryEncounter: (data: any) => Promise<string | null>;
      closePeriod: (data: any) => Promise<boolean>;
      getClosedPeriods: (station: string) => Promise<any[]>;
      exportMedicineReport: (data: { stationName: string; periodType: string; periodMonth: number; periodYear: number; items: any[] }) => Promise<{ success: boolean; message: string }>;
      importMedicineReport: () => Promise<{ success: boolean; duplicate?: boolean; sourceStation?: string; periodMonth?: number; periodYear?: number; message: string }>;
      getSpokeReportStatus: (periodMonth: number, periodYear: number) => Promise<{ station: string; importedAt: number }[]>;
      getSpokeReportData: (periodMonth: number, periodYear: number) => Promise<{ station: string; importedAt: number; items: any[] }[]>;
      smartImport: () => Promise<{ success: boolean; fileType?: string; duplicate?: boolean; sourceStation?: string; periodMonth?: number; periodYear?: number; count?: number; message: string }>;
      getInventoryLogs: () => Promise<InventoryLog[]>;
      importMedicine: (data: any, stationName: string) => Promise<boolean>;
      createInventoryLog: (logData: any) => Promise<boolean>;
      deleteMedicine: (id: string) => Promise<{ success: boolean }>;
      updateMedicineBatch: (id: string, data: any) => Promise<{ success: boolean }>;
      
      // Helper
      getKnownStations: () => Promise<any[]>;
      
      // Health Checkup
      importHealthCheckups: (rows: any[], year: number) => Promise<{ success: boolean; count?: number; message?: string }>;
      getPatientTimeline: (patientId: string) => Promise<PatientTimeline>;
      getKskReport: (year: number, month?: string) => Promise<{
        rows: { gender?: string; health_class?: string; disease_conclusion?: string; checkup_month?: string }[];
        months: string[];
        departments: string[];
      }>;

      // Real-time Listeners
      onDataUpdate: (callback: (data: any) => void) => void;
      removeDataUpdateListener: () => void;

      // Excel Import
      importEncountersFromExcel: (encounters: any[], deductInventory: boolean) => Promise<{ success: boolean; count: number; message?: string }>;

      // App Update
      applyUpdate: () => Promise<{ success: boolean; canceled?: boolean; message?: string }>;
      getVersion: () => Promise<string>;
    };
  }
}