// Ghi nhật ký mọi lệnh tới server thành file CSV theo ngày (mở được bằng Excel).
// Mỗi dòng: Thời gian | Trạm | IP | Lệnh (tiếng người) | Chi tiết | Kết quả | ms
// CSV vì append từng dòng an toàn & nhanh; .xlsx phải đọc-ghi-lại cả file (dễ hỏng).
const fs   = require('fs');
const path = require('path');

const LOG_DIR = process.env.AUDIT_DIR || path.join(__dirname, 'logs');
const HEADER  = 'Thời gian,Trạm,IP,Lệnh,Chi tiết,Kết quả,ms\n';

// Không ghi mấy lệnh "ồn ào" vô nghĩa (health-check chạy liên tục)
const SKIP = [{ method: 'GET', re: /^\/api\/ping/ }];

function two(n) { return String(n).padStart(2, '0'); }
function fmtTime(d) {
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ` +
         `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}
function dayFile(d) {
  return path.join(LOG_DIR, `audit-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}.csv`);
}

// Bọc 1 ô CSV: luôn nháy kép, escape " -> "" → an toàn với dấu phẩy/xuống dòng
function cell(v) {
  const s = (v === undefined || v === null) ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  let ip = (xff ? String(xff).split(',')[0] : '') || req.socket?.remoteAddress || '';
  return ip.replace(/^::ffff:/, '').trim();
}

// Suy ra "lệnh tiếng người" + chi tiết từ method/path/body
function describe(req) {
  const p = req.path;
  const b = req.body || {};
  const q = req.query || {};
  const n = (x) => Array.isArray(x) ? x.length : 0;

  // POST — các lệnh ghi dữ liệu
  if (req.method === 'POST') {
    if (p === '/api/sync/encounters')        return { label: 'Đẩy ca khám lên server',       detail: `${n(b.records)} ca` };
    if (p === '/api/sync/inventory-logs')    return { label: 'Đẩy giao dịch kho',             detail: `${n(b.logs)} log` };
    if (p === '/api/sync/medicines/stock')   return { label: 'Đẩy tồn kho',                   detail: `${n(b.medicines)} mục` };
    if (p === '/api/sync/medicine-report')   return { label: 'Đẩy báo cáo thuốc tháng',       detail: `Kỳ ${b.period_month}/${b.period_year} · ${n(b.data)} mục` };
    if (p === '/api/sync/check-exists')      return { label: 'Kiểm tra ca đã tồn tại',        detail: `${n(b.ids)} id` };
    if (p === '/api/admin/employees')        return { label: 'Đẩy danh sách nhân viên',       detail: `${n(b.employees)} NV` };
    if (/^\/api\/hub\/encounters\/.+\/delete$/.test(p)) {
      const id = p.split('/')[4];
      return { label: '⚠️ GỠ ca khỏi hệ thống', detail: `ca ${id} · do ${b.actor || '?'} · lý do: ${b.reason || '-'}` };
    }
    if (p === '/api/hub/transfers')          return { label: 'Tạo phiếu điều chuyển thuốc',   detail: `${b.source_station || '?'} → ${b.target_station || '?'} · ${n(b.medicines)} mục` };
    if (p === '/api/hub/protocols')          return { label: 'Đẩy phác đồ điều trị',          detail: `${n(b.protocols)} phác đồ` };
    if (/^\/api\/spoke\/transfers\/.+\/confirm$/.test(p)) {
      return { label: 'Xác nhận đã nhận phiếu chuyển', detail: `phiếu ${p.split('/')[4]}` };
    }
  }

  // PUT
  if (req.method === 'PUT' && /^\/api\/admin\/employees\/.+/.test(p)) {
    return { label: 'Sửa thông tin nhân viên', detail: `NV ${p.split('/')[4]}` };
  }

  // GET — các lệnh đọc
  if (req.method === 'GET') {
    const range = (q.from || q.to) ? ` · kỳ ${q.from || '?'}→${q.to || '?'}` : '';
    if (p === '/api/sync/employees')         return { label: 'Kéo danh sách nhân viên về',    detail: '' };
    if (p === '/api/hub/encounters')         return { label: 'Xem danh sách ca khám',         detail: `${q.station_name ? 'trạm ' + q.station_name : 'tất cả trạm'}${range}` };
    if (/^\/api\/hub\/encounters\/.+\/events$/.test(p)) return { label: 'Xem diễn biến 1 ca', detail: `ca ${p.split('/')[4]}` };
    if (p === '/api/hub/summary')            return { label: 'Xem tổng hợp KPI',              detail: `${q.station_name ? 'trạm ' + q.station_name : 'tất cả'}${range}` };
    if (p === '/api/hub/inventory/stock')    return { label: 'Xem tồn kho tổng hợp',          detail: q.station_id || 'tất cả' };
    if (/^\/api\/hub\/medicine-reports/.test(p)) return { label: 'Xem trạng thái báo cáo thuốc', detail: '' };
    if (p === '/api/hub/transfers')          return { label: 'Xem danh sách phiếu chuyển',    detail: '' };
    if (p === '/api/spoke/transfers/pending')return { label: 'Hỏi phiếu chuyển đang chờ',     detail: q.station_name || '' };
    if (p === '/api/spoke/protocols')        return { label: 'Kéo phác đồ về',                detail: '' };
  }

  // Mặc định: chưa đặt nhãn → ghi thô để vẫn truy được
  return { label: `${req.method} ${p}`, detail: '' };
}

function resultText(status) {
  if (status >= 200 && status < 300) return 'OK';
  if (status === 401) return 'Sai API key (401)';
  if (status === 404) return 'Không tồn tại (404)';
  return `Lỗi (${status})`;
}

// Middleware: ghi log khi response kết thúc (để có cả mã trạng thái + thời lượng)
function auditMiddleware(req, res, next) {
  if (SKIP.some(s => s.method === req.method && s.re.test(req.path))) return next();

  const start = Date.now();
  res.on('finish', () => {
    try {
      const d = new Date();
      const { label, detail } = describe(req);
      let hdrStation = req.headers['x-station-name'] || '';
      try { hdrStation = decodeURIComponent(hdrStation); } catch (_) {}
      const station = hdrStation || req.body?.station_name || req.body?.station || '(không rõ)';
      const row = [
        cell(fmtTime(d)),
        cell(station),
        cell(clientIp(req)),
        cell(label),
        cell(detail),
        cell(resultText(res.statusCode)),
        cell(Date.now() - start),
      ].join(',') + '\n';

      const file = dayFile(d);
      if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
      if (!fs.existsSync(file)) fs.writeFileSync(file, '﻿' + HEADER); // BOM để Excel đọc UTF-8
      fs.appendFileSync(file, row);
    } catch (_) { /* ghi log không bao giờ được làm hỏng request */ }
  });

  next();
}

module.exports = { auditMiddleware };
