import { StationConfig, User, Encounter, Medicine, Protocol, InventoryLog, StationType, Symptom, Patient } from '../types';
import { STAFF_LIST, INITIAL_MEDICINES, INITIAL_PROTOCOLS, STATION_PRESETS, INITIAL_SYMPTOMS } from '../constants';

const DB_KEYS = {
  STATION_CONFIG: 'gvc_station_config',
  USERS: 'gvc_users',
  ENCOUNTERS: 'gvc_encounters',
  MEDICINES: 'gvc_medicines',
  PROTOCOLS: 'gvc_protocols',
  LOGS: 'gvc_inventory_logs',
  KNOWN_STATIONS: 'gvc_known_stations',
  SYMPTOMS: 'gvc_symptoms',
  PATIENTS: 'gvc_patients', // Employee Database
};

// Mock Initial Employees (IDs start with 1)
const INITIAL_EMPLOYEES: Patient[] = [
  { id: '100001', name: 'NGUYEN VAN AN', department: 'ASSEMBLY A1' },
  { id: '100002', name: 'TRAN THI BICH', department: 'QA/QC' },
  { id: '100003', name: 'LE VAN CUONG', department: 'WAREHOUSE' },
  { id: '123456', name: 'PHAM THI DUNG', department: 'HR' },
];

class StorageService {
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

  // --- Patient/Employee Database (New) ---
  getPatients(): Patient[] {
    return JSON.parse(localStorage.getItem(DB_KEYS.PATIENTS) || '[]');
  }

  findPatient(id: string): Patient | undefined {
    const patients = this.getPatients();
    return patients.find(p => p.id === id);
  }

  savePatient(patient: Patient) {
    const patients = this.getPatients();
    const index = patients.findIndex(p => p.id === patient.id);
    if (index !== -1) {
      patients[index] = patient; // Update
    } else {
      patients.push(patient); // Create
    }
    localStorage.setItem(DB_KEYS.PATIENTS, JSON.stringify(patients));
  }

  importPatients(newPatients: Patient[]) {
    const currentPatients = this.getPatients();
    const patientMap = new Map(currentPatients.map(p => [p.id, p]));

    newPatients.forEach(p => {
      // Upsert: If exists, update name/dept. If new, add.
      patientMap.set(p.id, p);
    });

    localStorage.setItem(DB_KEYS.PATIENTS, JSON.stringify(Array.from(patientMap.values())));
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

  updateStock(medicineId: string, quantityChange: number, logData: Omit<InventoryLog, 'id' | 'date' | 'medicineName'>) {
    const medicines = this.getMedicines();
    const medicine = medicines.find(m => m.id === medicineId);
    
    if (medicine) {
      medicine.stock += quantityChange;
      localStorage.setItem(DB_KEYS.MEDICINES, JSON.stringify(medicines));

      // Add log
      const logs = JSON.parse(localStorage.getItem(DB_KEYS.LOGS) || '[]');
      const newLog: InventoryLog = {
        id: crypto.randomUUID(),
        date: Date.now(),
        medicineName: medicine.name,
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
}

export const storage = new StorageService();