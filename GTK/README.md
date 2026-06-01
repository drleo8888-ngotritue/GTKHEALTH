# GoertekVinaCare Smart Medical

> **Hệ thống Quản lý Y tế Thông minh** dành cho phòng khám y tế nội bộ khu công nghiệp
> **智能医疗管理系统** — Ứng dụng Desktop đa trạm, offline-first, đồng bộ qua Email

---

## Mục lục

1. [Tổng quan hệ thống](#1-tổng-quan-hệ-thống)
2. [Kiến trúc kỹ thuật](#2-kiến-trúc-kỹ-thuật)
3. [Topology mạng lưới trạm (HUB–SPOKE)](#3-topology-mạng-lưới-trạm-hubspoke)
4. [Cấu trúc thư mục dự án](#4-cấu-trúc-thư-mục-dự-án)
5. [Technology Stack](#5-technology-stack)
6. [Mô hình dữ liệu (Data Models)](#6-mô-hình-dữ-liệu-data-models)
7. [Luồng hoạt động chính](#7-luồng-hoạt-động-chính)
8. [Các Module chức năng](#8-các-module-chức-năng)
9. [Cơ chế đồng bộ dữ liệu (Email Sync)](#9-cơ-chế-đồng-bộ-dữ-liệu-email-sync)
10. [Phân quyền người dùng](#10-phân-quyền-người-dùng)
11. [Hướng dẫn cài đặt & khởi chạy](#11-hướng-dẫn-cài-đặt--khởi-chạy)
12. [Cấu hình trạm lần đầu (Station Setup)](#12-cấu-hình-trạm-lần-đầu-station-setup)
13. [Cơ sở dữ liệu SQLite](#13-cơ-sở-dữ-liệu-sqlite)
14. [Danh mục thuốc & vật tư mặc định](#14-danh-mục-thuốc--vật-tư-mặc-định)
15. [Giao thức bảo mật](#15-giao-thức-bảo-mật)

---

## 1. Tổng quan hệ thống

**GoertekVinaCare Smart Medical** là ứng dụng desktop (Electron) quản lý toàn bộ hoạt động y tế nội bộ cho nhà máy GoertekVina. Hệ thống hỗ trợ **song ngữ Việt–Trung** và được thiết kế để vận hành **offline-first** tại nhiều phòng y tế (trạm) phân tán trong khuôn viên nhà máy, với khả năng đồng bộ dữ liệu về trung tâm qua Email mã hóa.

### Đối tượng sử dụng

| Đối tượng | Vai trò |
|---|---|
| **Nhân viên y tế (Y tá / Bác sĩ)** | Tiếp nhận, khám và kê đơn thuốc |
| **Quản lý trạm (Moderator)** | Giám sát kho, theo dõi báo cáo |
| **Quản trị viên (Admin)** | Cấu hình hệ thống, quản lý phác đồ |
| **Nhân viên nhà máy (Employee)** | Tự khai báo triệu chứng qua Kiosk |

### Bối cảnh nghiệp vụ

- Nhà máy có nhiều phòng y tế (A6, C6, D4…) và 1 phòng trung tâm (E4 — HUB)
- Mỗi phòng là một **Spoke** độc lập, hoạt động không cần internet
- Cuối ca, mỗi Spoke gửi dữ liệu về HUB qua email mã hóa để tổng hợp báo cáo

---

## 2. Kiến trúc kỹ thuật

```
┌────────────────────────────────────────────────────────────────┐
│                     ELECTRON MAIN PROCESS                       │
│  ┌──────────────┐   ┌─────────────────┐   ┌─────────────────┐ │
│  │   main.js    │   │   db-service.js  │   │ sync-service.js │ │
│  │ (App Entry,  │◄──│ (SQLite CRUD,    │   │ (Email SMTP/    │ │
│  │  IPC Router) │   │  FEFO algorithm) │   │  IMAP + AES)    │ │
│  └──────┬───────┘   └─────────────────┘   └─────────────────┘ │
│         │ IPC (invoke/handle)                                    │
└─────────┼──────────────────────────────────────────────────────┘
          │ contextBridge (preload.js)
┌─────────┼──────────────────────────────────────────────────────┐
│         ▼       ELECTRON RENDERER PROCESS (React + Vite)        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                      App.tsx (Router)                     │  │
│  │   Route "/"        →  MainApp (Login → Layout → Tabs)    │  │
│  │   Route "/kiosk"   →  StandaloneKioskWrapper             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│   ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌────────┐ ┌──────┐ │
│   │  Kiosk   │ │ Clinical │ │ Inventory │ │Reports │ │Admin │ │
│   │(Self Svc)│ │(Exam Rm) │ │ (Pharmacy)│ │(Stats) │ │(Conf)│ │
│   └──────────┘ └──────────┘ └───────────┘ └────────┘ └──────┘ │
└────────────────────────────────────────────────────────────────┘
```

### Luồng IPC (Inter-Process Communication)

Giao tiếp giữa Renderer (React) và Main Process (Node.js) được thực hiện qua `window.electron` — một bridge được expose bởi `preload.js` theo cơ chế `contextBridge` của Electron. Tất cả các thao tác với Database và Email đều đi qua IPC channel.

---

## 3. Topology mạng lưới trạm (HUB–SPOKE)

```
                    ┌─────────────────────┐
                    │     E4 (HUB)         │
                    │  Phòng Y tế Trung tâm│
                    │  • Tổng hợp dữ liệu  │
                    │  • Nhận email từ Spoke│
                    │  • Báo cáo toàn nhà  │
                    └──────────┬──────────┘
                               │  Email Sync (AES-256)
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
     │   A6 (SPOKE) │ │   D4 (SPOKE) │ │   C6 (SPOKE) │
     │  Phòng y tế  │ │  Phòng y tế  │ │  Phòng y tế  │
     │  A6           │ │  D4           │ │  C6           │
     │  (Offline)    │ │  (Offline)    │ │  (Offline)    │
     └──────────────┘ └──────────────┘ └──────────────┘
```

| Loại trạm | Chức năng | Mô tả |
|---|---|---|
| **HUB (E4)** | Tổng hợp | Nhận email từ tất cả Spoke, xem báo cáo toàn công ty, phân bổ thuốc |
| **SPOKE (A6, D4, C6…)** | Vệ tinh | Hoạt động độc lập, gửi báo cáo về HUB cuối ca |

---

## 4. Cấu trúc thư mục dự án

```
goertekvinacare-smart-medical/
├── main.js                # Electron Main Process — khởi tạo app, cửa sổ, IPC handlers
├── preload.js             # Context Bridge — expose API an toàn cho Renderer
├── db-service.js          # Tầng truy cập SQLite — CRUD, FEFO, seed data
├── sync-service.js        # Đồng bộ Email — SMTP gửi, IMAP nhận, mã hóa AES-256
├── ipc-handlers.js        # (Tham chiếu) Các handler IPC bổ sung
│
├── App.tsx                # Root React component — HashRouter, routes
├── index.tsx              # React entry point
├── index.html             # HTML shell
├── types.ts               # TypeScript type definitions & interfaces
├── constants.ts           # Danh sách nhân sự, trạm, nhóm bệnh, phác đồ mẫu
│
├── components/
│   ├── Layout.tsx         # Navigation bar, user header, tab switcher
│   ├── Kiosk.tsx          # Màn hình tự phục vụ (quẹt thẻ + khai báo triệu chứng)
│   ├── Clinical.tsx       # Phòng khám — danh sách chờ, kê đơn, chẩn đoán
│   ├── Inventory.tsx      # Quản lý kho dược — nhập/xuất/chuyển kho, analytics
│   ├── Reports.tsx        # Báo cáo thống kê — biểu đồ, xuất Excel, timeline
│   ├── Admin.tsx          # Quản trị — phác đồ, nhân viên, triệu chứng, trạm
│   ├── RestMonitor.tsx    # Monitor nghỉ ngơi — cảnh báo quá 30 phút
│   └── SyncControl.tsx    # Điều khiển đồng bộ email thủ công
│
├── services/
│   └── storage.ts         # LocalStorage service — fallback khi không có Electron
│
├── hooks/                 # Custom React hooks
├── tailwind.config.js     # Tailwind CSS config (màu medical-green)
├── vite.config.ts         # Vite build config
├── tsconfig.json
└── package.json
```

---

## 5. Technology Stack

| Tầng | Công nghệ | Phiên bản | Mục đích |
|---|---|---|---|
| **Desktop Shell** | Electron | 40.x | App desktop đa nền tảng |
| **Frontend** | React | 19.x | UI framework |
| **Build Tool** | Vite | 6.x | Dev server + production build |
| **Language** | TypeScript | 5.8 | Type safety |
| **Styling** | Tailwind CSS | 3.x | Utility-first CSS |
| **Routing** | React Router DOM | 7.x | Hash-based routing |
| **Charts** | Recharts | 3.x | Biểu đồ thống kê |
| **Icons** | Lucide React | 0.562 | Icon library |
| **Database** | SQLite3 | 5.x | Local database (offline-first) |
| **Email Send** | Nodemailer | 6.x | SMTP gửi dữ liệu |
| **Email Receive** | IMAP-Simple | 5.x | IMAP đọc email đến |
| **Email Parse** | Mailparser | 3.x | Parse email attachment |
| **Excel Export** | SheetJS (xlsx) | 0.18 | Xuất báo cáo .xlsx |
| **Encryption** | Node.js crypto | built-in | AES-256-CBC mã hóa sync data |

---

## 6. Mô hình dữ liệu (Data Models)

### 6.1 User (Nhân viên y tế)

```typescript
interface User {
  id: string;
  name: string;
  role: Role;           // ADMIN | MODERATOR | STAFF
  canPrescribe: boolean;
}
```

### 6.2 StationConfig (Cấu hình trạm)

```typescript
interface StationConfig {
  id: string;
  name: string;         // "E4" | "A6" | "D4" | "C6"
  type: StationType;    // HUB | SPOKE
  isConfigured: boolean;
  email?: string;       // Email nhận dữ liệu sync
}
```

### 6.3 Patient (Nhân viên — bệnh nhân)

```typescript
interface Patient {
  id: string;           // Mã nhân viên (Employee ID)
  name: string;
  department: string;   // Bộ phận / 部门
}
```

### 6.4 Encounter (Phiếu khám)

```typescript
interface Encounter {
  id: string;
  patientId: string;
  patientName: string;
  department: string;
  symptoms: string[];
  startTime: number;          // Unix timestamp
  restStartTime?: number;     // Bắt đầu nghỉ ngơi
  endTime?: number;
  status: EncounterStatus;
  diagnosis?: string;
  diseaseGroup?: string;
  instruction?: string;       // Y lệnh thêm
  prescriptions: Prescription[];
  notes?: string;
  stationId: string;
  stationName: string;
  is_synced?: number;         // 0 = chưa đồng bộ, 1 = đã đồng bộ
}
```

**Trạng thái Encounter (EncounterStatus):**

| Trạng thái | Ý nghĩa |
|---|---|
| `WAITING` | Đang chờ khám |
| `IN_PROGRESS` | Đang được khám |
| `COMPLETED_WORK` | Hoàn thành — về làm việc |
| `COMPLETED_TRANSFER` | Chuyển viện / bệnh viện |
| `REST_30` | Nghỉ ngơi tại trạm |
| `MONITOR` | Theo dõi tại trạm |

### 6.5 Medicine (Thuốc & Vật tư y tế)

```typescript
interface Medicine {
  id: string;
  name: string;
  group: string;          // Nhóm thuốc
  unit: string;           // Đơn vị: Viên, Gói, Tuyp...
  stock: number;          // Tồn kho hiện tại
  mfgDate?: string;       // Ngày sản xuất
  expiryDate: string;     // Hạn sử dụng
  batchNumber: string;    // Số lô (batch)
  type?: MedicineType;    // 'MEDICINE' | 'SUPPLY'
  station?: string;       // Trạm đang giữ thuốc
}
```

### 6.6 InventoryLog (Lịch sử kho)

```typescript
interface InventoryLog {
  id: string;
  timestamp: number;
  type: 'IMPORT_SUPPLIER' | 'IMPORT_HUB' | 'EXPORT_SPOKE'
      | 'EXPORT_USE' | 'EXPORT_DESTROY' | 'TRANSFER_IN'
      | 'TRANSFER_OUT' | 'TRANSFER' | 'IMPORT';
  source: string;       // Nơi gửi
  target: string;       // Nơi nhận
  note?: string;
  items: Array<{
    id?: string;
    name: string;
    qty: number;
    batch?: string;
    receivedQty?: number;
  }>;
}
```

### 6.7 Protocol (Phác đồ điều trị mẫu)

```typescript
interface Protocol {
  id: string;
  name: string;
  diagnosis: string;
  diseaseGroup: string;
  medicines: { medicineId: string; quantity: number; }[];
  isApproved: boolean;
}
```

---

## 7. Luồng hoạt động chính

### 7.1 Luồng tự phục vụ tại Kiosk

```
Nhân viên đến phòng y tế
        │
        ▼
[Kiosk Screen - Step 1]
Quẹt thẻ RFID / Nhập mã nhân viên
(Input ẩn auto-focus hứng dữ liệu barcode scanner)
        │
        ▼ (Tìm trong Local Storage / SQLite)
        │
        ├──[Không tìm thấy]──► Màn hình lỗi (auto reset 5s)
        │
        └──[Tìm thấy]──────────────────────────────────┐
                                                        ▼
                                              [Kiosk Screen - Step 2]
                                              Chọn triệu chứng
                                              (Touch screen grid, song ngữ)
                                                        │
                                                        ▼
                                              [Kiosk Screen - Step 3]
                                              Đăng ký thành công!
                                              (Auto reset 3s)
                                                        │
                                                        ▼
                                            Encounter được tạo trong DB
                                            (Status: WAITING)
                                            Real-time broadcast → Clinical tab
```

### 7.2 Luồng khám bệnh tại Clinical

```
[Clinical Tab]
Danh sách hàng chờ (auto-reload 5s + real-time IPC)
        │
        ▼
Y tá click chọn bệnh nhân
→ Encounter status → IN_PROGRESS
        │
        ▼
[Workspace]
• Nhập chẩn đoán (tự do)
• Chọn nhóm bệnh (dropdown)
• Kê thuốc:
  - Tìm kiếm tên thuốc (fuzzy search, normalize case)
  - Áp phác đồ mẫu (auto-fill + kiểm tra tồn kho)
  - Số lượng bị chặn nếu vượt quá tồn kho (FEFO)
        │
        ▼
[Kết thúc khám — 3 nút action]
┌─────────────────────────────────────────┐
│ • Về làm việc  → COMPLETED_WORK         │
│ • Nghỉ ngơi    → REST_30                │
│                  (Monitor cảnh báo 30p) │
│ • Chuyển viện  → COMPLETED_TRANSFER     │
└─────────────────────────────────────────┘
        │
        ▼
Kho thuốc tự động trừ (FEFO algorithm)
Encounter lưu vào SQLite, is_synced = 0
```

### 7.3 Luồng đồng bộ dữ liệu

```
[SPOKE]                              [HUB — E4]
Y tá nhấn "Gửi BC"                   Admin nhấn "Fetch từ Email"
        │                                    │
        ▼                                    ▼
Lấy tất cả Encounter                 Kết nối IMAP Gmail
chưa sync (is_synced=0)              Tìm email chủ đề "[Y TẾ]"
        │                                    │
        ▼                                    ▼
Mã hóa AES-256-CBC                   Tải file đính kèm .dat
→ File .dat tạm thời                 Giải mã AES-256-CBC
        │                                    │
        ▼                                    ▼
Gửi Email SMTP Gmail                 importSyncedData() vào SQLite
Với .dat đính kèm                    (skip duplicate bằng ID)
        │                                    │
        ▼                                    ▼
Đánh dấu is_synced=1                 Broadcast real-time update
                                     đến tất cả cửa sổ đang mở
```

---

## 8. Các Module chức năng

### 8.1 Kiosk — Màn hình tự phục vụ

**Mục đích:** Nhân viên tự đăng ký khám, không cần nhân viên y tế hỗ trợ.

**Tính năng chính:**
- Hỗ trợ **quẹt thẻ RFID** (input ẩn auto-focus) và **nhập mã thủ công** (bàn phím số virtual)
- Giao diện cảm ứng tối ưu cho màn hình lớn (touch-friendly button 96px height)
- Chọn đa triệu chứng từ danh mục động (có thể cấu hình qua Admin)
- Tự động reset sau 3s (thành công) hoặc 5s (lỗi) với progress bar countdown
- Chạy trong **cửa sổ Electron riêng biệt** (route `/kiosk`), không cần đăng nhập
- Chữ **song ngữ Việt–Trung** trên toàn bộ màn hình

### 8.2 Clinical — Phòng khám

**Mục đích:** Giao diện làm việc chính của nhân viên y tế khi khám bệnh.

**Tính năng chính:**

| Khu vực | Chức năng |
|---|---|
| **Cột trái (25%)** | Danh sách hàng chờ real-time, thêm bệnh nhân thủ công, badge thời gian chờ (cảnh báo > 15 phút) |
| **Cột giữa (55%)** | Workspace khám: thông tin bệnh nhân, chẩn đoán, kê thuốc với tìm kiếm fuzzy |
| **Cột phải (20%)** | Phác đồ điều trị mẫu có thể áp dụng 1-click |

**Logic kê thuốc thông minh:**
- Tìm kiếm thuốc theo tên (normalize: uppercase, trim, collapse spaces)
- Hiển thị tồn kho thực tế (gom nhóm theo tên, tổng hợp từ nhiều lô)
- Chặn kê quá số lượng tồn kho
- Hiển thị cảnh báo `HẾT HÀNG` với màu đỏ
- Khi áp phác đồ: tự động điều chỉnh số lượng về mức tồn kho nếu phác đồ vượt quá

### 8.3 Inventory — Quản lý kho dược

**Mục đích:** Quản lý toàn bộ thuốc và vật tư y tế theo lô, hạn sử dụng.

**Tính năng chính:**

**Tab Tổng quan kho (Stock Overview):**
- Bảng master data gom nhóm thuốc theo tên (cộng dồn các lô)
- Tồn kho đầu kỳ / nhập / xuất dùng / chuyển kho / tồn cuối kỳ
- Mở rộng xem chi tiết từng lô (batch level)
- Màu sắc cảnh báo: `EXPIRED` (đỏ), `NEAR_EXPIRY` (vàng — < 30 ngày), `OK` (xanh)

**Tab Nhập kho (Import):**
- Nhập từ nhà cung cấp (HUB) hoặc từ trạm khác
- Form nhập: tên thuốc, nhóm, đơn vị, số lô, ngày SX, hạn dùng, số lượng
- Xuất Excel template file cho HUB phân phối về Spoke

**Tab Chuyển kho (Transfer):**
- Chuyển thuốc từ HUB xuống Spoke hoặc giữa các Spoke
- Tạo file `.dat` mã hóa để chuyển bằng USB (air-gap transfer)
- Nhập file transfer nhận được để cập nhật kho

**Tab Phân tích (Analytics):**
- Tốc độ tiêu thụ trung bình theo ngày
- Dự báo ngày hết hàng (Days Remaining)
- Predictive stockout date

**Tab Lịch sử (History):**
- Toàn bộ log xuất/nhập/chuyển kho theo thời gian
- Filter theo loại giao dịch

**Thuật toán FEFO (First Expired, First Out):**
Khi xuất thuốc, hệ thống tự động trừ kho theo thứ tự lô sắp hết hạn trước.

### 8.4 Reports — Báo cáo thống kê

**Mục đích:** Xem tổng hợp và xuất báo cáo lượt khám.

**Tính năng chính:**

- **Filter theo khoảng ngày** (date range picker)
- **Filter theo trạm** (HUB xem được tất cả Spoke)
- **KPI summary cards:**
  - Tổng lượt khám / 总诊次
  - Số ca chuyển viện / 转院
  - Số ca nghỉ tại phòng / 休息
- **Biểu đồ Donut** cơ cấu bệnh tật theo nhóm bệnh (Recharts PieChart)
- **Bảng chi tiết** — click vào hàng mở modal hồ sơ bệnh án đầy đủ
- **Modal hồ sơ bệnh án:**
  - Thông tin tổng hợp thuốc đã dùng
  - **Timeline diễn biến** (audit log từng lượt tác động có actor + timestamp)
  - Thêm y lệnh và kê thuốc bổ sung cho ca đang mở
- **Xuất Excel (Pivot format):** Mỗi thuốc là 1 cột, mỗi bệnh nhân là 1 hàng
- **Gửi báo cáo:** Trigger email sync thủ công
- **Nhập file thủ công:** Import file `.dat` hoặc `.json` từ USB

### 8.5 Admin — Quản trị hệ thống

**Mục đích:** Cấu hình các danh mục dùng chung trong hệ thống.

**4 Tab quản lý:**

**Tab Phác đồ điều trị:**
- Xem danh sách phác đồ đã duyệt
- Tạo phác đồ mới: tên, chẩn đoán mặc định, nhóm bệnh, danh sách thuốc + số lượng
- Xóa phác đồ (yêu cầu xác nhận)

**Tab Nhân viên:**
- Xem toàn bộ danh sách nhân viên đã đăng ký
- Import hàng loạt từ file Excel (cột: `id_nv`, `ho_ten`, `bp`)
- Cơ chế upsert: cập nhật nếu ID tồn tại, thêm mới nếu chưa có
- Tìm kiếm theo ID hoặc tên

**Tab Triệu chứng:**
- Quản lý danh mục triệu chứng hiển thị trên Kiosk
- Mỗi triệu chứng có: tên Việt, tên Trung, icon (Lucide icon name)
- Thêm / xóa triệu chứng realtime

**Tab Trạm (Admin/Moderator only):**
- Quản lý danh sách trạm trong hệ thống
- Thêm trạm mới: tên + loại (HUB/SPOKE)
- Tab bị lock với nhân viên STAFF thường

### 8.6 RestMonitor — Giám sát nghỉ ngơi

**Mục đích:** Cảnh báo tự động khi bệnh nhân nghỉ quá 30 phút.

- Chạy ngầm, poll mỗi **10 giây**
- Phát hiện tất cả Encounter có status `REST_30` hoặc `MONITOR` có `restStartTime` > 30 phút
- Hiển thị **floating notification** góc dưới phải màu đỏ với animation bounce
- Nút "Đã biết / 收到" dismiss alert và tự động set status → `COMPLETED_WORK`

---

## 9. Cơ chế đồng bộ dữ liệu (Email Sync)

### Kiến trúc Email Sync

```
SPOKE Machine                                    HUB Machine (E4)
─────────────                                    ────────────────
[DB SQLite]                                      [DB SQLite]
    │                                                 ▲
    │ getUnsyncedData()                               │ importSyncedData()
    ▼                                                 │
[JSON payload]                                   [JSON payload]
    │                                                 │
    │ encryptData (AES-256-CBC)                       │ decryptData (AES-256-CBC)
    ▼                                                 │
[Encrypted .dat file]                            [.dat attachment]
    │                                                 │
    │ SMTP (Gmail)                                    │ IMAP (Gmail INBOX)
    └──────────────────────────────────────────────────►
                         Email
                  Subject: "[Y TẾ] Dữ liệu..."
                  Attachment: SYNC_DATA_<timestamp>.dat
```

### Mã hóa dữ liệu

- **Thuật toán:** AES-256-CBC
- **Key derivation:** `crypto.scryptSync('vnp-secret-key-2025', 'salt', 32)`
- **IV:** Fixed 16-byte zero buffer (để đơn giản hóa, đủ an toàn cho môi trường nội bộ)
- **Payload:** JSON stringify toàn bộ Encounters chưa sync

### Email Configuration

- **Provider:** Gmail (SMTP port 465 / IMAP port 993)
- **Search criteria:** Email chưa đọc (`UNSEEN`) + tiêu đề chứa `[Y TẾ]`
- **Sau khi đọc:** Email được đánh dấu đã đọc (`markSeen: true`) để tránh import trùng lặp
- **Duplicate prevention:** Dùng Encounter ID làm unique key khi import

### Chuyển kho qua USB (Air-gap Transfer)

Cho môi trường không có mạng, thuốc có thể được chuyển bằng file `.dat` qua USB:
1. HUB tạo file transfer → lưu `.dat` mã hóa
2. Copy file qua USB sang Spoke
3. Spoke import file → tự động cập nhật kho

---

## 10. Phân quyền người dùng

| Chức năng | STAFF | MODERATOR | ADMIN |
|---|---|---|---|
| Xem hàng chờ khám | ✅ | ✅ | ✅ |
| Kê đơn thuốc | ✅ | ✅ | ✅ |
| Xem kho thuốc | ✅ | ✅ | ✅ |
| Nhập kho | ✅ | ✅ | ✅ |
| Xem báo cáo | ✅ | ✅ | ✅ |
| Quản lý phác đồ | ✅ | ✅ | ✅ |
| Quản lý nhân viên | ✅ | ✅ | ✅ |
| Quản lý triệu chứng | ✅ | ✅ | ✅ |
| **Quản lý trạm** | ❌ | ✅ | ✅ |
| **Reset cấu hình trạm** | ❌ | ❌ | ✅ (password) |

**Password reset trạm:** `abc123` hoặc `abc1234` (yêu cầu xác nhận 2 bước)

---

## 11. Hướng dẫn cài đặt & khởi chạy

### Yêu cầu hệ thống

- **OS:** Windows 10/11 (64-bit)
- **Node.js:** >= 18.x
- **RAM:** >= 4GB
- **Storage:** >= 500MB (cho Node modules + SQLite DB)

### Cài đặt

```bash
# 1. Clone / copy thư mục dự án

# 2. Cài dependencies
npm install

# 3. Chạy chế độ Development (Vite dev server + Electron)
npm run dev        # Khởi động Vite dev server (port 3000)
npm start          # Khởi động Electron (trong terminal khác)

# 4. Build production
npm run build      # Build React → dist/
npm start          # Chạy Electron với file build
```

### Cấu hình Email Sync

Chỉnh sửa file `sync-service.js`:

```javascript
const EMAIL_CONFIG = {
    user: 'your-email@gmail.com',
    password: 'your-app-password',  // Google App Password (2FA)
    host: 'imap.gmail.com',
    port: 993,
    tls: true
};
```

> **Lưu ý:** Phải bật "Less secure app access" hoặc tạo **App Password** trong Google Account nếu dùng 2FA.

---

## 12. Cấu hình trạm lần đầu (Station Setup)

Lần đầu mở app trên máy tính mới:

1. **Màn hình Setup** hiện ra → Chọn loại trạm (E4/A6/D4/C6)
2. Nhấn **Lưu cấu hình** → Máy bị "ghim" với cấu hình này
3. **Màn hình Login** → Chọn nhân viên y tế từ danh sách → Đăng nhập

> **Quan trọng:** Mỗi máy tính chỉ cần setup 1 lần. Cấu hình lưu trong `localStorage`. Để reset: click icon khóa ở góc trên phải màn hình Login → nhập password → xác nhận.

### Mở màn hình Kiosk độc lập

Từ Layout chính (HUB/SPOKE), dùng nút mở Kiosk để spawn cửa sổ Electron thứ 2 chạy route `/kiosk`. Cửa sổ này:
- Không yêu cầu đăng nhập
- Kết nối chung database SQLite với cửa sổ chính
- Phù hợp kết nối màn hình cảm ứng thứ 2

---

## 13. Cơ sở dữ liệu SQLite

**Vị trí file:** `%APPDATA%\goertekvinacare-smart-medical\local_data.db` (Windows)

### Bảng dữ liệu

| Bảng | Mô tả |
|---|---|
| `encounters` | Phiếu khám bệnh |
| `encounter_prescriptions` | Chi tiết đơn thuốc (1 encounter → nhiều dòng) |
| `clinical_events` | Audit log từng hành động khám (timeline) |
| `medicines` | Kho thuốc theo lô |
| `inventory_logs` | Lịch sử xuất/nhập/chuyển kho |
| `file_import_history` | Track file `.dat` đã import (tránh duplicate) |

### Thuật toán FEFO

Khi trừ kho sau khi kê đơn, hệ thống chạy query ưu tiên lô có `expiry_date` sớm nhất:

```sql
SELECT * FROM medicines
WHERE name = ? AND station = ? AND stock > 0
ORDER BY expiry_date ASC
```

Trừ dần từng lô cho đến khi đủ số lượng kê đơn.

---

## 14. Danh mục thuốc & vật tư mặc định

Hệ thống được khởi tạo với **36 loại thuốc** chia theo nhóm:

| Nhóm | Thuốc |
|---|---|
| **Hạ sốt giảm đau** | Panadol Extra 500mg, Efferalgan 500mg, Panadol cảm cúm, Codacmin |
| **Thuốc Ho** | Eugica, Methorphan, Siro Bảo thanh |
| **Thuốc Dạ dày** | Yumangel, Omeprazol 20mg |
| **Rối loạn tiêu hóa** | Biolac, Flamipio Loperamid |
| **Thuốc tiêu hóa khác** | Nospa, Trà gừng, Oracortia |
| **Thuốc mắt** | Natricloru 0.9% 10ml, Dexalevo |
| **Thuốc bôi ngoài** | Tomax, Gentrisone, Acyclovir, Panthenol, Yoosun rau má |
| **Cao dán** | Salonpas, Salonship, Bạch hổ hoạt lạc cao, Phật linh |
| **Chống viêm dị ứng** | Thylmedi 16mg, Loratadine 10mg, Alphachoay, Naphazolin |
| **Thuốc bổ** | Oresol, Bổ máu Fevit, Hoạt huyết, Sủi tăng lực, Thymo Immusta |
| **Kháng sinh** | Amoxicyclin 500mg, Augcixine 1g |

Dữ liệu mặc định có `stock = 0` và `batchNumber = 'DANH_MUC_GOC'`. Đây là danh mục tham chiếu để tạo phác đồ và kê đơn. Tồn kho thực tế được cộng dồn khi nhập kho theo lô.

---

## 15. Giao thức bảo mật

| Điểm bảo mật | Cơ chế |
|---|---|
| **Cấu hình trạm** | Locked sau khi setup, cần password để reset |
| **Đăng nhập** | Danh sách nhân viên hard-coded (không dùng username/password) |
| **Dữ liệu đồng bộ** | Mã hóa AES-256-CBC trước khi gửi qua email |
| **Email attachment** | File `.dat` — không thể đọc nếu không có key |
| **IPC Electron** | `contextIsolation: true`, `nodeIntegration: false` |
| **Context Bridge** | Chỉ expose các hàm cần thiết, không expose Node.js trực tiếp |
| **SQLite** | Lưu local, không expose qua network |

---

## Nhóm nhóm bệnh hỗ trợ

```
Hô hấp / 呼吸科          Tiêu hóa / 消化科         Cơ xương khớp / 肌肉骨骼科
Thần kinh / 神经科         Tim mạch / 心脏科          Da liễu / 皮肤科
Tai Mũi Họng / 耳鼻喉科   Răng Hàm Mặt / 口腔科     Mắt / 眼科
Ngoại khoa / 外科/创伤     Nội khoa khác / 其他内科  Khác / 其他
```

---

<div align="center">

**GoertekVinaCare Smart Medical**
*Hệ thống Y tế Thông minh — Goertek Vina*
Version 1.0 · Electron + React + SQLite · 2025

</div>
