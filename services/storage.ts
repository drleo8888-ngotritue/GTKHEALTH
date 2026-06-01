import { StationConfig, User, Encounter, Medicine, Protocol, InventoryLog, StationType, Symptom, Patient, ServerSyncConfig } from '../types';
import { STAFF_LIST, INITIAL_MEDICINES, INITIAL_PROTOCOLS, STATION_PRESETS, INITIAL_SYMPTOMS, DISEASE_GROUPS as DEFAULT_DISEASE_GROUPS, INITIAL_INFECTIOUS_DISEASES } from '../constants';

const DB_KEYS = {
  STATION_CONFIG: 'gvc_station_config',
  USERS: 'gvc_users',
  ENCOUNTERS: 'gvc_encounters',
  MEDICINES: 'gvc_medicines',
  PROTOCOLS: 'gvc_protocols',
  LOGS: 'gvc_inventory_logs',
  KNOWN_STATIONS: 'gvc_known_stations',
  SYMPTOMS: 'gvc_symptoms',
  DISEASE_GROUPS: 'gvc_disease_groups',
  PATIENTS: 'gvc_patients', // Employee Database
  SERVER_SYNC_CONFIG: 'gvc_server_sync_config',
  MEDICINE_ORDER: 'gvc_medicine_order', // Thứ tự cột thuốc trong báo cáo Excel
  INFECTIOUS_DISEASES: 'gvc_infectious_diseases',
};

// Mock Initial Employees (IDs start with 1)
const INITIAL_EMPLOYEES: Patient[] = [
  { id: '100001', name: 'NGUYEN VAN AN', department: 'ASSEMBLY A1' },
  { id: '100002', name: 'TRAN THI BICH', department: 'QA/QC' },
  { id: '100003', name: 'LE VAN CUONG', department: 'WAREHOUSE' },
  { id: '123456', name: 'PHAM THI DUNG', department: 'HR' },
];

class StorageService {
  // Cache in-memory để tránh JSON.parse lại 100k record mỗi lần đọc
  private patientsCache: Patient[] | null = null;

  constructor() {
    this.init();
  }

  private init() {
    if (!localStorage.getItem(DB_KEYS.USERS)) {
      localStorage.setItem(DB_KEYS.USERS, JSON.stringify(STAFF_LIST));
    }
    if (!localStorage.getItem(DB_KEYS.MEDICINES)) {
      localStorage.setItem(DB_KEYS.MEDICINES, JSON.stringify(INITIAL_MEDICINES));
    }
    if (!localStorage.getItem(DB_KEYS.PROTOCOLS)) {
      localStorage.setItem(DB_KEYS.PROTOCOLS, JSON.stringify(INITIAL_PROTOCOLS));
    }
    if (!localStorage.getItem(DB_KEYS.ENCOUNTERS)) {
      localStorage.setItem(DB_KEYS.ENCOUNTERS, JSON.stringify([]));
    }
    if (!localStorage.getItem(DB_KEYS.LOGS)) {
      localStorage.setItem(DB_KEYS.LOGS, JSON.stringify([]));
    }
    if (!localStorage.getItem(DB_KEYS.KNOWN_STATIONS)) {
      localStorage.setItem(DB_KEYS.KNOWN_STATIONS, JSON.stringify(STATION_PRESETS));
    }
    if (!localStorage.getItem(DB_KEYS.SYMPTOMS)) {
      localStorage.setItem(DB_KEYS.SYMPTOMS, JSON.stringify(INITIAL_SYMPTOMS));
    }
    if (!localStorage.getItem(DB_KEYS.PATIENTS)) {
      localStorage.setItem(DB_KEYS.PATIENTS, JSON.stringify(INITIAL_EMPLOYEES));
    }
  }

  // --- Station Configuration ---
  getStationConfig(): StationConfig | null {
    const data = localStorage.getItem(DB_KEYS.STATION_CONFIG);
    return data ? JSON.parse(data) : null;
  }

  setStationConfig(config: StationConfig) {
    localStorage.setItem(DB_KEYS.STATION_CONFIG, JSON.stringify(config));
  }

  resetStationConfig() {
    localStorage.removeItem(DB_KEYS.STATION_CONFIG);
  }

  // --- Known Stations ---
  getKnownStations(): {name: string, type: string}[] {
    return JSON.parse(localStorage.getItem(DB_KEYS.KNOWN_STATIONS) || '[]');
  }

  addKnownStation(station: {name: string, type: string}) {
    const stations = this.getKnownStations();
    if (stations.some(s => s.name === station.name)) return; // tránh trùng
    stations.push(station);
    localStorage.setItem(DB_KEYS.KNOWN_STATIONS, JSON.stringify(stations));
  }

  removeKnownStation(name: string) {
    let stations = this.getKnownStations();
    stations = stations.filter(s => s.name !== name);
    localStorage.setItem(DB_KEYS.KNOWN_STATIONS, JSON.stringify(stations));
  }

  // --- Users (System Staff) ---
  getUsers(): User[] {
    return JSON.parse(localStorage.getItem(DB_KEYS.USERS) || '[]');
  }

  // --- Patient/Employee Database ---
  // Cache tránh JSON.parse lại toàn bộ 100k records mỗi lần đọc
  clearPatientsCache() {
    this.patientsCache = null;
  }

  getPatients(): Patient[] {
    if (this.patientsCache) return this.patientsCache;
    this.patientsCache = JSON.parse(localStorage.getItem(DB_KEYS.PATIENTS) || '[]');
    return this.patientsCache!;
  }

  getPatientCount(): number {
    return this.getPatients().length;
  }

  // Tìm kiếm có giới hạn kết quả – dùng cho UI tránh render 100k rows
  searchPatients(query: string, limit = 100): Patient[] {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const all = this.getPatients();
    const results: Patient[] = [];
    for (const p of all) {
      if (p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)) {
        results.push(p);
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  findPatient(id: string): Patient | undefined {
    return this.getPatients().find(p => p.id === id);
  }

  // Bổ sung gender cho các nhân viên đã có trong DS, từ dữ liệu KSK
  // Chỉ cập nhật nếu nhân viên tồn tại VÀ chưa có gender
  updatePatientGenders(updates: { id: string; gender: string }[]) {
    if (updates.length === 0) return;
    const patients = this.getPatients();
    let changed = false;
    const updateMap = new Map(updates.map(u => [u.id, u.gender]));
    for (const p of patients) {
      if (!p.gender && updateMap.has(p.id)) {
        p.gender = updateMap.get(p.id);
        changed = true;
      }
    }
    if (changed) {
      this.patientsCache = patients;
      localStorage.setItem(DB_KEYS.PATIENTS, JSON.stringify(patients));
    }
  }

  savePatient(patient: Patient) {
    const patients = this.getPatients(); // Lấy từ cache
    const index = patients.findIndex(p => p.id === patient.id);
    if (index !== -1) {
      patients[index] = patient;
    } else {
      patients.push(patient);
    }
    // Cập nhật cache trực tiếp (không cần re-parse)
    this.patientsCache = patients;
    localStorage.setItem(DB_KEYS.PATIENTS, JSON.stringify(patients));
  }

  deletePatient(id: string) {
    const patients = this.getPatients().filter(p => p.id !== id);
    this.patientsCache = patients;
    localStorage.setItem(DB_KEYS.PATIENTS, JSON.stringify(patients));
  }

  importPatients(newPatients: Patient[]) {
    const currentPatients = this.getPatients();
    const patientMap = new Map(currentPatients.map(p => [p.id, p]));
    newPatients.forEach(p => patientMap.set(p.id, p));
    const merged = Array.from(patientMap.values());
    this.patientsCache = merged;
    localStorage.setItem(DB_KEYS.PATIENTS, JSON.stringify(merged));
  }

  // Merge nhân viên từ server: chỉ thêm mới hoặc cập nhật bo_phan (department).
  // id và tên KHÔNG bao giờ bị ghi đè — offline safety.
  mergeFromServer(serverEmployees: { id_nv: string; ho_ten: string; bo_phan: string }[]) {
    const current = this.getPatients();
    const map = new Map(current.map(p => [p.id, p]));
    for (const emp of serverEmployees) {
      const existing = map.get(emp.id_nv);
      if (existing) {
        if (existing.department !== emp.bo_phan) {
          map.set(emp.id_nv, { ...existing, department: emp.bo_phan });
        }
      } else {
        map.set(emp.id_nv, { id: emp.id_nv, name: emp.ho_ten, department: emp.bo_phan });
      }
    }
    const merged = Array.from(map.values());
    this.patientsCache = merged;
    localStorage.setItem(DB_KEYS.PATIENTS, JSON.stringify(merged));
    return merged.length;
  }

  // --- Encounters ---
  getEncounters(): Encounter[] {
    return JSON.parse(localStorage.getItem(DB_KEYS.ENCOUNTERS) || '[]');
  }

  addEncounter(encounter: Encounter) {
    const list = this.getEncounters();
    list.push(encounter);
    localStorage.setItem(DB_KEYS.ENCOUNTERS, JSON.stringify(list));
  }

  updateEncounter(updated: Encounter) {
    const list = this.getEncounters();
    const index = list.findIndex(e => e.id === updated.id);
    if (index !== -1) {
      list[index] = updated;
      localStorage.setItem(DB_KEYS.ENCOUNTERS, JSON.stringify(list));
    }
  }

  // --- Medicines ---
  getMedicines(): Medicine[] {
    return JSON.parse(localStorage.getItem(DB_KEYS.MEDICINES) || '[]');
  }

  updateStock(medicineId: string, quantityChange: number, logData: Omit<InventoryLog, 'id' | 'timestamp' | 'items'>) {
    const medicines = this.getMedicines();
    const medicine = medicines.find(m => m.id === medicineId);
    
    if (medicine) {
      medicine.stock += quantityChange;
      localStorage.setItem(DB_KEYS.MEDICINES, JSON.stringify(medicines));

      // Add log
      const logs = JSON.parse(localStorage.getItem(DB_KEYS.LOGS) || '[]');
      const newLog: InventoryLog = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        items: [{
          id: medicine.id,
          name: medicine.name,
          qty: Math.abs(quantityChange)
        }],
        ...logData
      };
      logs.push(newLog);
      localStorage.setItem(DB_KEYS.LOGS, JSON.stringify(logs));
    }
  }

  addMedicine(newMedicine: Medicine) {
    const medicines = this.getMedicines();
    medicines.push(newMedicine);
    localStorage.setItem(DB_KEYS.MEDICINES, JSON.stringify(medicines));
  }

  // --- Protocols ---
  getProtocols(): Protocol[] {
    return JSON.parse(localStorage.getItem(DB_KEYS.PROTOCOLS) || '[]');
  }

  saveProtocol(protocol: Protocol) {
    const list = this.getProtocols();
    const index = list.findIndex(p => p.id === protocol.id);
    if (index !== -1) {
      list[index] = protocol;
    } else {
      list.push(protocol);
    }
    localStorage.setItem(DB_KEYS.PROTOCOLS, JSON.stringify(list));
  }

  deleteProtocol(id: string) {
    let list = this.getProtocols();
    list = list.filter(p => p.id !== id);
    localStorage.setItem(DB_KEYS.PROTOCOLS, JSON.stringify(list));
  }

  // --- Symptoms ---
  getSymptoms(): Symptom[] {
    return JSON.parse(localStorage.getItem(DB_KEYS.SYMPTOMS) || '[]');
  }

  saveSymptom(symptom: Symptom) {
    const list = this.getSymptoms();
    const index = list.findIndex(s => s.id === symptom.id);
    if (index !== -1) {
        list[index] = symptom;
    } else {
        list.push(symptom);
    }
    localStorage.setItem(DB_KEYS.SYMPTOMS, JSON.stringify(list));
  }

  deleteSymptom(id: string) {
    let list = this.getSymptoms();
    list = list.filter(s => s.id !== id);
    localStorage.setItem(DB_KEYS.SYMPTOMS, JSON.stringify(list));
  }

  // --- Disease Groups ---
  getDiseaseGroups(): string[] {
    const stored = localStorage.getItem(DB_KEYS.DISEASE_GROUPS);
    if (!stored) return [...DEFAULT_DISEASE_GROUPS];
    return JSON.parse(stored);
  }

  saveDiseaseGroup(group: string) {
    const list = this.getDiseaseGroups();
    if (!list.includes(group)) {
      list.push(group);
      localStorage.setItem(DB_KEYS.DISEASE_GROUPS, JSON.stringify(list));
    }
  }

  deleteDiseaseGroup(group: string) {
    const list = this.getDiseaseGroups().filter(g => g !== group);
    localStorage.setItem(DB_KEYS.DISEASE_GROUPS, JSON.stringify(list));
  }

  renameDiseaseGroup(oldName: string, newName: string) {
    const list = this.getDiseaseGroups().map(g => g === oldName ? newName : g);
    localStorage.setItem(DB_KEYS.DISEASE_GROUPS, JSON.stringify(list));
    // Cập nhật encounters trong localStorage (fallback mode không có Electron)
    const encounters = this.getEncounters().map(e =>
      e.diseaseGroup === oldName ? { ...e, diseaseGroup: newName } : e
    );
    localStorage.setItem(DB_KEYS.ENCOUNTERS, JSON.stringify(encounters));
  }

  saveDiseaseGroups(groups: string[]) {
    localStorage.setItem(DB_KEYS.DISEASE_GROUPS, JSON.stringify(groups));
  }

  // --- Server Sync Config ---
  getServerSyncConfig(): ServerSyncConfig {
    const stored = localStorage.getItem(DB_KEYS.SERVER_SYNC_CONFIG);
    if (!stored) return { enabled: false, serverUrl: '', apiKey: '', retryIntervalMinutes: 5, syncEmployeesOnStartup: true, employeeSyncIntervalHours: 1 };
    return JSON.parse(stored);
  }

  saveServerSyncConfig(config: ServerSyncConfig) {
    localStorage.setItem(DB_KEYS.SERVER_SYNC_CONFIG, JSON.stringify(config));
  }

  // --- Medicine Column Order (for Excel export) ---
  getMedicineOrder(): string[] {
    const stored = localStorage.getItem(DB_KEYS.MEDICINE_ORDER);
    return stored ? JSON.parse(stored) : [];
  }

  saveMedicineOrder(order: string[]) {
    localStorage.setItem(DB_KEYS.MEDICINE_ORDER, JSON.stringify(order));
  }

  // --- Infectious Diseases (A/B/C) ---
  getInfectiousDiseases(): Record<'A' | 'B' | 'C', string[]> {
    const stored = localStorage.getItem(DB_KEYS.INFECTIOUS_DISEASES);
    if (!stored) return { ...INITIAL_INFECTIOUS_DISEASES };
    return JSON.parse(stored);
  }

  saveInfectiousDiseases(data: Record<'A' | 'B' | 'C', string[]>) {
    localStorage.setItem(DB_KEYS.INFECTIOUS_DISEASES, JSON.stringify(data));
  }

  addInfectiousDisease(group: 'A' | 'B' | 'C', name: string) {
    const data = this.getInfectiousDiseases();
    if (!data[group].includes(name)) {
      data[group].push(name);
      this.saveInfectiousDiseases(data);
    }
  }

  removeInfectiousDisease(group: 'A' | 'B' | 'C', name: string) {
    const data = this.getInfectiousDiseases();
    data[group] = data[group].filter(d => d !== name);
    this.saveInfectiousDiseases(data);
  }
}

export const storage = new StorageService();