const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || './gvc_server.db';
let db = null;

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function init() {
  db = new sqlite3.Database(DB_PATH);
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA synchronous = NORMAL');

  await run(`CREATE TABLE IF NOT EXISTS encounters (
    id TEXT PRIMARY KEY,
    patient_id TEXT,
    patient_name TEXT,
    department TEXT,
    station_id TEXT,
    station_name TEXT,
    symptoms TEXT,
    status TEXT,
    start_time INTEGER,
    end_time INTEGER,
    diagnosis TEXT,
    disease_group TEXT,
    prescriptions TEXT,
    had_rest_at_room INTEGER DEFAULT 0,
    is_supplementary INTEGER DEFAULT 0,
    received_at INTEGER
  )`);
  // Migrate: soft-delete (chỉ Hub gỡ ca rác) — giữ bản ghi để audit, ẩn khỏi mọi view
  const encMigrations = [
    `ALTER TABLE encounters ADD COLUMN deleted_at INTEGER`,
    `ALTER TABLE encounters ADD COLUMN deleted_by TEXT`,
    `ALTER TABLE encounters ADD COLUMN delete_reason TEXT`,
  ];
  for (const sql of encMigrations) { try { await run(sql); } catch (_) {} }

  await run(`CREATE TABLE IF NOT EXISTS clinical_events (
    id TEXT PRIMARY KEY,
    encounter_id TEXT,
    action_type TEXT,
    actor_name TEXT,
    details TEXT,
    timestamp INTEGER
  )`);

  await run(`CREATE TABLE IF NOT EXISTS inventory_logs (
    id TEXT PRIMARY KEY,
    type TEXT,
    source TEXT,
    target TEXT,
    items TEXT,
    timestamp INTEGER,
    note TEXT,
    actor_name TEXT,
    actor_role TEXT,
    station_id TEXT,
    station_name TEXT,
    received_at INTEGER
  )`);

  await run(`CREATE TABLE IF NOT EXISTS medicines_stock (
    id TEXT PRIMARY KEY,
    station_id TEXT,
    station_name TEXT,
    name TEXT,
    group_name TEXT,
    unit TEXT,
    stock INTEGER DEFAULT 0,
    batch_number TEXT,
    expiry_date TEXT,
    type TEXT,
    snapshot_time INTEGER
  )`);

  await run(`CREATE TABLE IF NOT EXISTS employees (
    id_nv TEXT PRIMARY KEY,
    ho_ten TEXT NOT NULL,
    bo_phan TEXT,
    updated_at INTEGER
  )`);
  // Migrate: phân biệt NV do Hub import chính thức ('HUB') vs Spoke bổ sung từ ca khám ('SPOKE')
  const empMigrations = [
    `ALTER TABLE employees ADD COLUMN source TEXT DEFAULT 'HUB'`,
    `ALTER TABLE employees ADD COLUMN created_station TEXT`,
  ];
  for (const sql of empMigrations) { try { await run(sql); } catch (_) {} }

  await run(`CREATE TABLE IF NOT EXISTS medicines_master (
    id TEXT PRIMARY KEY,
    name TEXT,
    group_name TEXT,
    unit TEXT,
    type TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS protocols (
    id TEXT PRIMARY KEY,
    name TEXT,
    diagnosis TEXT DEFAULT '',
    disease_group TEXT DEFAULT '',
    medicines TEXT DEFAULT '[]',
    is_approved INTEGER DEFAULT 1,
    updated_at INTEGER,
    symptoms TEXT,
    suggested_medicines TEXT,
    note TEXT
  )`);
  // Migrate DB cũ: thêm cột mới nếu chưa có (ALTER TABLE IF NOT EXISTS không tồn tại trong SQLite)
  const protoMigrations = [
    `ALTER TABLE protocols ADD COLUMN diagnosis TEXT DEFAULT ''`,
    `ALTER TABLE protocols ADD COLUMN disease_group TEXT DEFAULT ''`,
    `ALTER TABLE protocols ADD COLUMN medicines TEXT DEFAULT '[]'`,
    `ALTER TABLE protocols ADD COLUMN is_approved INTEGER DEFAULT 1`,
    `ALTER TABLE protocols ADD COLUMN updated_at INTEGER`,
  ];
  for (const sql of protoMigrations) { try { await run(sql); } catch (_) {} }

  await run(`CREATE TABLE IF NOT EXISTS symptoms (
    id TEXT PRIMARY KEY,
    name TEXT,
    group_name TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS spoke_medicine_reports (
    id TEXT PRIMARY KEY,
    station TEXT NOT NULL,
    period_type TEXT NOT NULL,
    period_month INTEGER NOT NULL,
    period_year INTEGER NOT NULL,
    data TEXT,
    submitted_at INTEGER
  )`);

  await run(`CREATE TABLE IF NOT EXISTS pending_transfers (
    id TEXT PRIMARY KEY,
    source_station TEXT NOT NULL,
    target_station TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    created_by TEXT,
    status TEXT DEFAULT 'PENDING',
    medicines TEXT,
    note TEXT,
    confirmed_at INTEGER
  )`);
  // Migrate: mốc "trạm nhận đã tiếp nhận phiếu (đang vận chuyển)" — giữa PENDING và CONFIRMED
  try { await run(`ALTER TABLE pending_transfers ADD COLUMN acknowledged_at INTEGER`); } catch (_) {}
  // Ghi chú thực nhận (chênh lệch SL chuyển vs thực nhận) — để Hub thấy
  try { await run(`ALTER TABLE pending_transfers ADD COLUMN received_note TEXT`); } catch (_) {}


  // Index để query nhanh
  await run(`CREATE INDEX IF NOT EXISTS idx_encounters_station   ON encounters(station_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_encounters_time      ON encounters(start_time)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_inv_logs_station     ON inventory_logs(station_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_inv_logs_time        ON inventory_logs(timestamp)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_stock_station        ON medicines_stock(station_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_events_encounter     ON clinical_events(encounter_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_med_reports_period   ON spoke_medicine_reports(period_month, period_year)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_transfers_target     ON pending_transfers(target_station, status)`);

  console.log('✅ Server DB đã sẵn sàng tại:', path.resolve(DB_PATH));
}

module.exports = { init, run, all, get };
