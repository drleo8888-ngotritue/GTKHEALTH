// Phase 3: HTTP client gọi server API.
// Chạy trong main process — không bao giờ crash app khi server không có mặt.

const https = require('https');
const http  = require('http');

let _syncConfig    = { enabled: false, serverUrl: '', apiKey: '', retryIntervalMinutes: 5 };
let _stationConfig = { id: 'UNKNOWN', name: 'UNKNOWN' };

function setSyncConfig(config)    { _syncConfig    = config; }
function setStationConfig(config) { _stationConfig = config; }
function getSyncConfig()          { return _syncConfig; }

// ---------------------------------------------------------------------------
// Hàm gọi HTTP thô — timeout 10s, không throw, trả về null khi lỗi
// ---------------------------------------------------------------------------
function request(method, urlPath, body = null) {
  if (!_syncConfig.enabled || !_syncConfig.serverUrl) return Promise.resolve(null);

  let url;
  try { url = new URL(urlPath, _syncConfig.serverUrl); }
  catch { return Promise.resolve(null); }

  const lib = url.protocol === 'https:' ? https : http;

  return new Promise((resolve) => {
    const options = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${_syncConfig.apiKey}`,
      },
      timeout: 10000,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try   { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    });

    req.on('error',   () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function ping() {
  const res = await request('GET', '/api/ping');
  return res?.success === true;
}

async function pushEncounters(records) {
  if (!records.length) return null;
  return request('POST', '/api/sync/encounters', {
    station_id:   _stationConfig.id,
    station_name: _stationConfig.name,
    records,
  });
}

async function pushInventoryLogs(records) {
  if (!records.length) return null;
  return request('POST', '/api/sync/inventory-logs', {
    station_id:   _stationConfig.id,
    station_name: _stationConfig.name,
    records,
  });
}

async function pushMedicinesStock(medicines) {
  if (!medicines.length) return null;
  return request('POST', '/api/sync/medicines/stock', {
    station_id:    _stationConfig.id,
    station_name:  _stationConfig.name,
    snapshot_time: Date.now(),
    medicines,
  });
}

async function pullEmployees() {
  const res = await request('GET', '/api/sync/employees');
  return res?.success ? (res.data || []) : null;
}

module.exports = {
  setSyncConfig,
  setStationConfig,
  getSyncConfig,
  ping,
  pushEncounters,
  pushInventoryLogs,
  pushMedicinesStock,
  pullEmployees,
};
