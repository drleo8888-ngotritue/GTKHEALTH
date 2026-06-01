
const SyncService = require('./sync-service');

/**
 * Registers all IPC handlers for the application.
 * Call this function in your main.js: require('./ipc-handlers').registerIpcHandlers(ipcMain);
 * @param {Electron.IpcMain} ipcMain 
 */
function registerIpcHandlers(ipcMain) {
  
  // Channel: sync:trigger-send (Used by Spoke Stations)
  ipcMain.handle('sync:trigger-send', async (event, stationId) => {
    try {
      console.log(`[IPC] Received sync:trigger-send from ${stationId}`);
      const result = await SyncService.performSync(stationId);
      return result;
    } catch (error) {
      console.error('[IPC] Sync Error:', error);
      return { success: false, message: error.message };
    }
  });

  // Channel: sync:trigger-fetch (Used by Hub Stations)
  ipcMain.handle('sync:trigger-fetch', async (event) => {
    console.log('[IPC] Received sync:trigger-fetch');
    // Placeholder for future IMAP/POP3 logic
    // Simulate a delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { success: true, message: "Fetch feature coming soon (IMAP Integration Pending)" };
  });
}

module.exports = { registerIpcHandlers };
