const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('./config');

const PORTAL_DB_PATH = path.join(__dirname, 'portal.db');
let SQL = null; // initialized once at startup

// Gọi một lần trong server.js trước khi app.listen()
async function init() {
  SQL = await initSqlJs({
    locateFile: file => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file),
  });

  // Tạo portal.db + bảng portal_users nếu chưa có
  const db = _openPortalDB();
  db.run(`
    CREATE TABLE IF NOT EXISTS portal_users (
      employee_id   TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      must_change   INTEGER DEFAULT 1,
      created_at    TEXT NOT NULL,
      last_login    TEXT
    )
  `);
  _savePortalDB(db);
}

// --- Internal helpers ---

// Mở local_data.db dạng snapshot (read-only safe, không lock file)
function _openHealthDB() {
  const buf = fs.readFileSync(config.DB_PATH);
  return new SQL.Database(buf);
}

function _openPortalDB() {
  if (fs.existsSync(PORTAL_DB_PATH)) {
    return new SQL.Database(fs.readFileSync(PORTAL_DB_PATH));
  }
  return new SQL.Database(); // DB mới rỗng
}

function _savePortalDB(db) {
  try {
    fs.writeFileSync(PORTAL_DB_PATH, Buffer.from(db.export()));
  } finally {
    db.close();
  }
}

function _all(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function _get(db, sql, params = []) {
  return _all(db, sql, params)[0] || null;
}

// --- Public API (sync sau khi init()) ---

function employeeExists(employeeId) {
  const db = _openHealthDB();
  const r1 = _get(db, 'SELECT 1 FROM health_checkups WHERE employee_id = ? LIMIT 1', [employeeId]);
  const r2 = _get(db, 'SELECT 1 FROM encounters WHERE patient_id = ? LIMIT 1', [employeeId]);
  db.close();
  return !!(r1 || r2);
}

function getUser(employeeId) {
  const db = _openPortalDB();
  const user = _get(db, 'SELECT * FROM portal_users WHERE employee_id = ?', [employeeId]);
  db.close();
  return user;
}

function ensureUser(employeeId) {
  const existing = getUser(employeeId);
  if (!existing) {
    const hash = bcrypt.hashSync(config.DEFAULT_PASSWORD, 10);
    const db = _openPortalDB();
    db.run(
      'INSERT INTO portal_users (employee_id, password_hash, must_change, created_at) VALUES (?, ?, 1, ?)',
      [employeeId, hash, new Date().toISOString()]
    );
    _savePortalDB(db);
  }
  return getUser(employeeId);
}

function updatePassword(employeeId, newHash) {
  const db = _openPortalDB();
  db.run('UPDATE portal_users SET password_hash = ?, must_change = 0 WHERE employee_id = ?', [newHash, employeeId]);
  _savePortalDB(db);
}

function recordLogin(employeeId) {
  const db = _openPortalDB();
  db.run('UPDATE portal_users SET last_login = ? WHERE employee_id = ?', [new Date().toISOString(), employeeId]);
  _savePortalDB(db);
}

function getCheckups(employeeId) {
  const db = _openHealthDB();
  const rows = _all(db, `
    SELECT year, checkup_month, health_class, health_conclusion,
           disease_conclusion, exam_details, consultation, gender
    FROM health_checkups WHERE employee_id = ?
    ORDER BY year DESC, checkup_month DESC
  `, [employeeId]);
  db.close();
  return rows;
}

function getRecentEncounters(employeeId, limitMonths = 6) {
  const since = Date.now() - limitMonths * 30 * 24 * 60 * 60 * 1000;
  const db = _openHealthDB();
  const rows = _all(db, `
    SELECT start_time, symptoms, diagnosis, disease_group, prescriptions, status
    FROM encounters
    WHERE patient_id = ? AND start_time >= ? AND status != 'CANCELLED'
    ORDER BY start_time DESC LIMIT 20
  `, [employeeId, since]);
  db.close();
  return rows;
}

module.exports = {
  init,
  employeeExists,
  getUser,
  ensureUser,
  updatePassword,
  recordLogin,
  getCheckups,
  getRecentEncounters,
};
