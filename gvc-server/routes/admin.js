// Routes quản trị — thêm/sửa employees, master data
const router = require('express').Router();
const db = require('../db');

// POST /api/admin/employees — import danh sách nhân viên
router.post('/employees', async (req, res) => {
  const { employees } = req.body;
  if (!Array.isArray(employees)) {
    return res.status(400).json({ success: false, message: 'employees phải là array' });
  }

  const now = Date.now();
  let count = 0;
  for (const emp of employees) {
    if (!emp.id_nv || !emp.ho_ten) continue;
    await db.run(
      `INSERT OR REPLACE INTO employees (id_nv, ho_ten, bo_phan, source, updated_at) VALUES (?,?,?, 'HUB', ?)`,
      [emp.id_nv, emp.ho_ten, emp.bo_phan || '', now]
    );
    count++;
  }

  res.json({ success: true, message: `Đã cập nhật ${count} nhân viên` });
});

// PUT /api/admin/employees/:id — cập nhật 1 nhân viên
router.put('/employees/:id', async (req, res) => {
  const { bo_phan } = req.body;
  await db.run(
    `UPDATE employees SET bo_phan = ?, updated_at = ? WHERE id_nv = ?`,
    [bo_phan, Date.now(), req.params.id]
  );
  res.json({ success: true });
});

// POST /api/admin/medicines/master — import danh mục thuốc chuẩn
router.post('/medicines/master', async (req, res) => {
  const { medicines } = req.body;
  if (!Array.isArray(medicines)) {
    return res.status(400).json({ success: false, message: 'medicines phải là array' });
  }

  let count = 0;
  for (const med of medicines) {
    if (!med.id || !med.name) continue;
    await db.run(
      `INSERT OR REPLACE INTO medicines_master (id, name, group_name, unit, type) VALUES (?,?,?,?,?)`,
      [med.id, med.name, med.group_name || '', med.unit || '', med.type || 'MEDICINE']
    );
    count++;
  }

  res.json({ success: true, message: `Đã cập nhật ${count} loại thuốc` });
});

// GET /api/admin/stats — thống kê nhanh server
router.get('/stats', async (req, res) => {
  try {
    const [enc, logs, emps, stock] = await Promise.all([
      db.get(`SELECT COUNT(*) as count FROM encounters`),
      db.get(`SELECT COUNT(*) as count FROM inventory_logs`),
      db.get(`SELECT COUNT(*) as count FROM employees`),
      db.get(`SELECT COUNT(DISTINCT station_id) as count FROM medicines_stock`),
    ]);
    res.json({
      success: true,
      data: {
        encounters:    enc?.count    || 0,
        inventory_logs: logs?.count || 0,
        employees:     emps?.count  || 0,
        stations_with_stock: stock?.count || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
