/**
 * Tạo file template Excel cho nhập kho thuốc/vật tư
 * Chạy: node scripts/gen-template.js
 */
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const outputDir = path.join(__dirname, '../templates');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// ──────────────────────────────────────────
// SHEET 1: Danh mục THUỐC
// ──────────────────────────────────────────
const thuocRows = [
    // Hàng tiêu đề (phải khớp chính xác với code)
    ['Tên thuốc', 'Số lượng', 'Nhóm', 'ĐVT', 'Số lô', 'Hạn dùng', 'Ngày SX'],
    // Ví dụ dữ liệu
    ['Paracetamol 500mg',    200, 'Hạ sốt giảm đau',  'Viên',  'LOT-2401', '2026-12-31', '2024-01-15'],
    ['Amoxicillin 500mg',     50, 'Kháng sinh',        'Viên',  'LOT-2402', '2026-06-30', '2024-02-01'],
    ['Vitamin C 1000mg',     100, 'Vitamin',            'Viên',  'LOT-2403', '2027-03-31', '2024-03-01'],
    ['Omeprazol 20mg',        60, 'Tiêu hóa',          'Viên',  'LOT-2404', '2026-09-30', '2024-01-20'],
    ['NaCl 0.9% 500ml',      30, 'Dịch truyền',       'Chai',  'LOT-2405', '2026-12-31', '2024-01-10'],
    ['Ibuprofen 400mg',       80, 'Hạ sốt giảm đau',  'Viên',  'LOT-2406', '2026-08-31', '2024-02-15'],
    ['Cetirizine 10mg',       40, 'Chống dị ứng',     'Viên',  'LOT-2407', '2027-01-31', '2024-03-10'],
    ['Metformin 500mg',       90, 'Tiểu đường',        'Viên',  'LOT-2408', '2026-11-30', '2024-01-05'],
    ['Atorvastatin 10mg',     45, 'Tim mạch',          'Viên',  'LOT-2409', '2027-02-28', '2024-02-20'],
    ['Losartan 50mg',         55, 'Tim mạch',          'Viên',  'LOT-2410', '2026-10-31', '2024-01-25'],
];

// ──────────────────────────────────────────
// SHEET 2: Danh mục VẬT TƯ Y TẾ
// ──────────────────────────────────────────
const vatTuRows = [
    ['Tên vật tư', 'Số lượng', 'Nhóm', 'ĐVT', 'Số lô', 'Hạn dùng', 'Ngày SX'],
    ['Bơm tiêm 5ml',            500, 'Dụng cụ tiêm',      'Cái',  'VT-2401', '2027-12-31', '2024-01-01'],
    ['Bông gòn vô khuẩn 500g',   20, 'Băng bó',           'Túi',  'VT-2402', '2027-06-30', '2024-02-01'],
    ['Găng tay y tế (M)',        200, 'Phòng hộ',          'Đôi',  'VT-2403', '2027-12-31', '2024-01-15'],
    ['Kim lấy thuốc 18G',        100, 'Dụng cụ tiêm',     'Cái',  'VT-2404', '2027-09-30', '2024-03-01'],
    ['Cồn sát khuẩn 70° 500ml',  10, 'Vệ sinh tiêu độc', 'Chai', 'VT-2405', '2026-12-31', '2024-01-20'],
    ['Băng dính y tế',           50, 'Băng bó',           'Cuộn', 'VT-2406', '2027-03-31', '2024-02-10'],
    ['Khẩu trang y tế 3 lớp',   300, 'Phòng hộ',          'Cái',  'VT-2407', '2027-12-31', '2024-01-05'],
    ['Huyết áp kế điện tử',       2, 'Thiết bị đo lường', 'Cái',  'VT-2408', '2030-12-31', '2023-12-01'],
    ['Nhiệt kế điện tử',          5, 'Thiết bị đo lường', 'Cái',  'VT-2409', '2030-12-31', '2023-11-01'],
];

// ──────────────────────────────────────────
// SHEET 3: Hướng dẫn
// ──────────────────────────────────────────
const hdRows = [
    ['HƯỚNG DẪN SỬ DỤNG FILE TEMPLATE'],
    [''],
    ['CỘT BẮT BUỘC', '', 'MÔ TẢ'],
    ['Tên thuốc / Tên vật tư', '', 'Tên đầy đủ của thuốc hoặc vật tư. PHẢI có dữ liệu, không để trống.'],
    [''],
    ['CỘT TÙY CHỌN (có thể để trống, hệ thống tự điền mặc định)', '', ''],
    ['Số lượng', '', 'Số nguyên dương. Mặc định: 0'],
    ['Nhóm', '', 'Phân loại. Mặc định: "Khác"'],
    ['ĐVT', '', 'Đơn vị tính (Viên, Chai, Lọ...). Mặc định: "Đơn vị"'],
    ['Số lô', '', 'Số hiệu lô sản xuất. Mặc định: "LÔ_MỚI"'],
    ['Hạn dùng', '', 'Định dạng YYYY-MM-DD (vd: 2026-12-31). Mặc định: 2030-12-31'],
    ['Ngày SX', '', 'Định dạng YYYY-MM-DD (vd: 2024-01-01). Có thể để trống.'],
    [''],
    ['LƯU Ý QUAN TRỌNG', '', ''],
    ['1. Sheet đầu tiên trong file sẽ được đọc. Đặt dữ liệu ở Sheet 1.'],
    ['2. Hàng đầu tiên PHẢI là tiêu đề cột.'],
    ['3. Ngày tháng: nhập dạng TEXT (YYYY-MM-DD), KHÔNG dùng định dạng Date của Excel.'],
    ['4. Tên cột phân biệt hoa/thường. Dùng đúng tên như trong template.'],
    ['5. Không gộp ô (merge cells) ở hàng tiêu đề.'],
    ['6. Khi nhập vật tư y tế: chọn "Vật tư" trong ứng dụng trước khi import.'],
];

// ──────────────────────────────────────────
// Tạo workbook
// ──────────────────────────────────────────
const wb = XLSX.utils.book_new();

const wsThuoc = XLSX.utils.aoa_to_sheet(thuocRows);
const wsVatTu = XLSX.utils.aoa_to_sheet(vatTuRows);
const wsHD    = XLSX.utils.aoa_to_sheet(hdRows);

// Set column widths
const colWidths = [{ wch: 30 }, { wch: 12 }, { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
wsThuoc['!cols'] = colWidths;
wsVatTu['!cols'] = colWidths;
wsHD['!cols']    = [{ wch: 45 }, { wch: 5 }, { wch: 70 }];

XLSX.utils.book_append_sheet(wb, wsThuoc, 'Thuốc');
XLSX.utils.book_append_sheet(wb, wsVatTu, 'Vật tư');
XLSX.utils.book_append_sheet(wb, wsHD,    'Hướng dẫn');

const outFile = path.join(outputDir, 'template_nhap_kho.xlsx');
XLSX.writeFile(wb, outFile);
console.log('✅ Template tạo xong:', outFile);
