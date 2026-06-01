// Phase 2: Thin wrapper around window.electron IPC calls.
// Phase 3 will add server push inside each write method.

function ipc() {
  return (window as any).electron as typeof window.electron;
}

export const dataService = {

  // --- ENCOUNTERS (WRITE) ---
  createEncounter(data: any): Promise<string> {
    return ipc().createEncounter(data);
  },
  updateEncounter(data: any): Promise<boolean> {
    return ipc().updateEncounter(data);
  },
  deleteEncounter(id: string): Promise<boolean> {
    return ipc().deleteEncounter(id);
  },

  // --- ENCOUNTERS (READ) ---
  getEncounters(): Promise<any[]> {
    return ipc().getEncounters();
  },
  getAllEncounters(): Promise<any[]> {
    return ipc().getAllEncounters();
  },

  // --- INVENTORY (WRITE) ---
  importMedicine(data: any, stationName: string): Promise<any> {
    return ipc().importMedicine(data, stationName);
  },
  createInventoryLog(logData: any): Promise<any> {
    return ipc().createInventoryLog(logData);
  },
  updateMedicineBatch(id: string, data: any): Promise<any> {
    return ipc().updateMedicineBatch(id, data);
  },
  deleteMedicine(id: string): Promise<any> {
    return ipc().deleteMedicine(id);
  },

  // --- INVENTORY (READ) ---
  getInventory(stationName: string): Promise<any[]> {
    return ipc().getInventory(stationName);
  },
  getInventoryLogs(): Promise<any[]> {
    return ipc().getInventoryLogs();
  },
};
