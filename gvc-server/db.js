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
    symptoms TEXT,
    suggested_medicines TEXT,
    note TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS symptoms (
    id TEXT PRIMARY KEY,
    name TEXT,
    group_name TEXT
  )`);

  // Index để query nhanh
  await run(`CREATE INDEX IF NOT EXISTS idx_encounters_station   ON encounters(station_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_encounters_time      ON encounters(start_time)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_inv_logs_station     ON inventory_logs(station_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_inv_logs_time        ON inventory_logs(timestamp)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_stock_station        ON medicines_stock(station_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_events_encounter     ON clinical_events(encounter_id)`);

  console.log('✅ Server DB đã sẵn sàng tại:', path.resolve(DB_PATH));
}

module.exports = { init, run, all, get };
