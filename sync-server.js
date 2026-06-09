// Phase 3: HTTP client gọi server API.
// Chạy trong main process — không bao giờ crash app khi server không có mặt.

const https = require('https');
const http  = require('http');

let _syncConfig    = { enabled: false, serverUrl: '', apiKey: '', retryIntervalMinutes: 5 };
let _stationConfig = { id: 'UNKNOWN', name: 'UNKNOWN' };

function setSyncConfig(config)    { _syncConfig    = config; }
function setStationConfig(config) { _stationConfig = config; }
function getSyncConfig()          { return _syncConfig; }
function getStationName()         { return _stationConfig.name; }

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

// Spoke push báo cáo thuốc tháng lên server
async function pushMedicineReport({ station, periodType, periodMonth, periodYear, items }) {
  return request('POST', '/api/sync/medicine-report', {
    station, period_type: periodType, period_month: periodMonth, period_year: periodYear, data: items,
  });
}

// Hub kéo trạng thái báo cáo (trạm nào đã nộp)
async function pullHubReportStatus(periodMonth, periodYear) {
  const res = await request('GET', `/api/hub/medicine-reports?period_month=${periodMonth}&period_year=${periodYear}`);
  return res?.success ? (res.data || []) : null;
}

// Hub kéo dữ liệu báo cáo đầy đủ
async function pullHubReportData(periodMonth, periodYear) {
  const res = await request('GET', `/api/hub/medicine-reports/data?period_month=${periodMonth}&period_year=${periodYear}`);
  return res?.success ? (res.data || []) : null;
}

// Hub kéo danh sách ca khám từ server
async function pullHubEncounters(from, to, stationId) {
  const params = new URLSearchParams();
  if (from) params.set('from', String(from));
  if (to)   params.set('to', String(to));
  if (stationId) params.set('station_id', stationId);
  const res = await request('GET', `/api/hub/encounters?${params}`);
  return res?.success ? (res.data || []) : null;
}

// Hub kéo tồn kho tổng hợp từ server
async function pullHubStock(stationId) {
  const qs = stationId ? `?station_id=${encodeURIComponent(stationId)}` : '';
  const res = await request('GET', `/api/hub/inventory/stock${qs}`);
  return res?.success ? (res.data || []) : null;
}

// Hub tạo phiếu điều chuyển thuốc
async function createTransfer({ id, sourceStation, targetStation, createdBy, medicines, note }) {
  return request('POST', '/api/hub/transfers', {
    id, source_station: sourceStation, target_station: targetStation,
    created_by: createdBy, medicines, note,
  });
}

// Hub xem danh sách phiếu đã tạo
async function getHubTransfers(sourceStation) {
  const qs = sourceStation ? `?source_station=${encodeURIComponent(sourceStation)}` : '';
  const res = await request('GET', `/api/hub/transfers${qs}`);
  return res?.success ? (res.data || []) : null;
}

// Spoke hỏi server có phiếu điều chuyển nào chờ không
async function pullPendingTransfers(stationName) {
  const res = await request('GET', `/api/spoke/transfers/pending?station_name=${encodeURIComponent(stationName)}`);
  return res?.success ? (res.data || []) : null;
}

// Spoke xác nhận đã nhận phiếu
async function confirmTransfer(transferId) {
  return request('POST', `/api/spoke/transfers/${transferId}/confirm`, {});
}

// Hub đẩy phác đồ lên server
async function pushProtocols(protocols) {
  if (!protocols.length) return null;
  return request('POST', '/api/hub/protocols', { protocols });
}

// Spoke kéo phác đồ từ server
async function pullProtocols() {
  const res = await request('GET', '/api/spoke/protocols');
  return res?.success ? (res.data || []) : null;
}

module.exports = {
  setSyncConfig,
  setStationConfig,
  getSyncConfig,
  getStationName,
  ping,
  pushEncounters,
  pushInventoryLogs,
  pushMedicinesStock,
  pullEmployees,
  pushMedicineReport,
  pullHubReportStatus,
  pullHubReportData,
  pullHubEncounters,
  pullHubStock,
  createTransfer,
  getHubTransfers,
  pullPendingTransfers,
  confirmTransfer,
  pushProtocols,
  pullProtocols,
};
