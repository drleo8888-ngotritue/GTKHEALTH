# Lộ trình tích hợp Server Sync

## Bối cảnh & Mục tiêu

App hiện tại chạy **offline-first** với SQLite local. Mục tiêu là thêm khả năng đồng bộ lên server trung tâm để:
- HUB xem trực tiếp dữ liệu tất cả Spoke (khám bệnh, tồn kho)
- Không cần gửi file `.dat` thủ công nữa
- Vẫn hoạt động bình thường khi mất mạng

## Kiến trúc tổng thể

```
Spoke A ─┐
Spoke B ─┼──→ Server DB ←── Hub (xem/báo cáo trực tiếp)
Spoke C ─┘

Mỗi Spoke:
  [Viết dữ liệu]
       ↓
  SQLite local (luôn ghi trước) — is_synced_server = 0
       ↓
  Thử gửi lên Server ngay (event-based)
       ↓
  Thành công → is_synced_server = 1
  Thất bại   → giữ = 0, background worker retry sau
```

**Pattern sử dụng:** Transactional Outbox Pattern  
**Nguyên tắc:** Offline-first, server là optional — mất mạng app không bị ảnh hưởng

---

## Phase 1 — Chuẩn bị nền ✅ HOÀN THÀNH

> Không đụng logic hiện tại. Hoàn toàn additive.

### Mục tiêu
- Thêm cột tracking sync vào database
- Tạo UI cấu hình server trong Admin
- Lưu config server vào localStorage

### Các thay đổi đã thực thi

#### `db-service.js`
- Thêm migration tự động khi app khởi động:
  ```javascript
  ALTER TABLE encounters ADD COLUMN is_synced_server INTEGER DEFAULT 0
  ALTER TABLE medicines ADD COLUMN is_synced_server INTEGER DEFAULT 0
  ALTER TABLE inventory_logs ADD COLUMN is_synced_server INTEGER DEFAULT 0
  ```
- Dùng try/catch cho từng lệnh → an toàn nếu cột đã tồn tại
- `clinical_events` không cần cột riêng — sẽ được đính kèm trong payload của encounter khi sync

#### `types.ts`
- Thêm interface `ServerSyncConfig`:
  ```typescript
  export interface ServerSyncConfig {
    enabled: boolean;
    serverUrl: string;
    apiKey: string;
    retryIntervalMinutes: number;
  }
  ```

#### `services/storage.ts`
- Thêm key `SERVER_SYNC_CONFIG: 'gvc_server_sync_config'`
- Thêm methods:
  - `getServerSyncConfig()` — default: `{ enabled: false, serverUrl: '', apiKey: '', retryIntervalMinutes: 5 }`
  - `saveServerSyncConfig(config)`

#### `components/Admin.tsx`
- Thêm tab **"Đồng bộ Server"** (màu xanh, icon Server)
- UI gồm:
  - Toggle bật/tắt sync (mặc định tắt)
  - Input Server URL
  - Input API Key (type=password)
  - Dropdown chu kỳ retry: 1/3/5/10/15/30 phút (mặc định 5)
  - Nút "Test kết nối" → gọi `GET /api/ping` với timeout 5s
  - Nút "Lưu cấu hình"
  - Note: medicines chỉ sync 1 chiều Spoke → Server

#### Bổ sung Phase 1 (sau khi làm rõ yêu cầu nhân viên)

**`types.ts`** — Thêm 2 field vào `ServerSyncConfig`:
- `syncEmployeesOnStartup: boolean` (mặc định `true`)
- `employeeSyncIntervalHours: number` (mặc định `1` giờ)

**`services/storage.ts`** — Cập nhật default value

**`db-service.js`** — Thêm hàm `getUnsyncedCount()`:
- Đếm số bản ghi `is_synced_server = 0` trên 3 bảng: encounters, medicines, inventory_logs

**`main.js`** — Thêm IPC handler `db:get-unsynced-count`

**`preload.js`** — Expose `getUnsyncedCount()`

**`components/Admin.tsx`** — Cập nhật tab Đồng bộ Server:
- Panel trạng thái: hiển thị số bản ghi chưa sync (ca khám / giao dịch kho / thuốc-vật tư)
- Toggle "Sync ngay khi khởi động" cho nhân viên
- Dropdown chu kỳ sync nhân viên: 1/2/4/8/12/24 giờ

### Kết quả
- App chạy offline hoàn toàn như cũ
- Toggle mặc định TẮT → không gửi gì cả
- Khi server sẵn sàng: điền URL + API Key → Test → Lưu → Bật toggle
- Admin thấy được ngay bao nhiêu bản ghi đang chờ sync

---

## Checklist thống nhất với team Server (Java Spring Boot)

> Cần hoàn thành trước khi bắt đầu Phase 2 + 3. Server viết bằng Spring Boot không có bất lợi kỹ thuật — chỉ cần thống nhất 5 điểm sau.

### 1. Format Timestamp
App đang dùng **Unix milliseconds** (INTEGER trong SQLite):
```json
"start_time": 1744425600000
```
Spring Boot Jackson mặc định serialize thành ISO string. Cần thống nhất → **dùng Unix ms** cho toàn bộ API, tránh phải convert 2 chiều.

```java
// Spring Boot config Jackson dùng Unix ms:
@JsonFormat(shape = JsonFormat.Shape.NUMBER)
private Instant startTime;
```

### 2. Tên field (Naming Convention)
App dùng `snake_case` theo SQLite. Java thường dùng `camelCase`.
Cần thống nhất — đề xuất Spring Boot config Jackson dùng `snake_case`:
```java
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
```
Hoặc thống nhất dùng `camelCase` và app sẽ map khi gửi/nhận.

### 3. CORS
Electron chạy ở origin `file://` — Spring Boot cần cho phép:
```java
@CrossOrigin(origins = "*")
// hoặc cụ thể hơn trong SecurityConfig
```

### 4. Format Response chuẩn
Thống nhất format response để app xử lý nhất quán:
```json
// Thành công
{ "success": true, "data": { ... } }

// Thất bại
{ "success": false, "message": "Mô tả lỗi" }
```

### 5. Pagination
Khi HUB kéo báo cáo tổng hợp, Spring Data thường trả về:
```json
{ "content": [...], "totalElements": 1500, "totalPages": 15 }
```
App cần biết format này để parse đúng. Hoặc thống nhất API không dùng pagination cho các endpoint sync.

---

## Phase 2 — DataService Layer ⏳ LÀM NGAY TRƯỚC PHASE 3

> ⚠️ **Không làm ngay bây giờ.** Không có lợi ích tức thì, trong khi rủi ro refactor là thật (phải test lại toàn bộ workflow khám bệnh và kho). Làm Phase 2 + Phase 3 liền tay khi server gần sẵn sàng.

### Mục tiêu
Tạo tầng trung gian giữa UI và IPC. Components không gọi `window.electron.*` trực tiếp nữa.

### Việc cần làm
- [ ] Tạo `services/data-service.ts` — thin wrapper quanh `window.electron.*`
- [ ] Refactor theo chiều dữ liệu:
  - `Clinical.tsx` — PUSH: `createEncounter`, `updateEncounter` + clinical_events
  - `Inventory.tsx` — PUSH: `importMedicine`, `createInventoryLog`, stock updates
  - `Admin.tsx` — PULL: `protocols`, `symptoms`, `medicines/master`, `employees` (tải về từ server)
  - `Reports.tsx` — ❌ chỉ đọc SQLite local, không cần wrap
- [ ] **Quan trọng:** DataService KHÔNG cache — phải stateless để HUB-SPOKE sync vẫn hoạt động

### Lưu ý kỹ thuật
- `sync-service.js` chạy ở main process, không bị ảnh hưởng
- DataService chỉ ở renderer process
- `data:update` event từ main process vẫn trigger re-fetch bình thường

---

## Phase 3 — Server Sync Logic ⏳ CHỜ SERVER

> Cần server sẵn sàng + API contract được thống nhất trước.

### Mục tiêu
Thêm logic gửi data lên server sau mỗi lần ghi, và retry tự động.

### Việc cần làm
**PUSH — Spoke gửi lên server:**
- [ ] Trong `DataService`, sau mỗi write → gọi thêm HTTP lên server
- [ ] Nếu thành công → `UPDATE ... SET is_synced_server = 1`
- [ ] Nếu thất bại → giữ `= 0`, không crash app
- [ ] Background worker trong `main.js`:
  - `setInterval` theo `retryIntervalMinutes` từ config
  - Quét tất cả `is_synced_server = 0`
  - Gửi lên server theo batch
  - Cập nhật `= 1` khi thành công

**PULL — Tất cả trạm tải về từ server:**
- [ ] Sync nhân viên khi app khởi động (ưu tiên cao nhất — ảnh hưởng Kiosk)
- [ ] Logic merge nhân viên: chỉ cập nhật `bo_phan` nếu khác, không xóa local
- [ ] Sync nhân viên theo chu kỳ (cùng interval)
- [ ] Nút "Sync ngay" trong Admin tab Đồng bộ Server
- [ ] Sync protocols, symptoms, medicines master theo chu kỳ (ưu tiên thấp hơn)

### Luồng dữ liệu

```
SPOKE → Server (PUSH):
  - encounters + clinical_events   (mỗi lần kết thúc khám)
  - inventory_logs                 (mỗi lần giao dịch kho)
  - medicines.stock                (tồn kho thực tế, read-only trên server)

Server → TẤT CẢ TRẠM - SPOKE + HUB (PULL):
  - employees (danh sách nhân viên động) ← QUAN TRỌNG, thay đổi hàng ngày
  - protocols                      (phác đồ chuẩn HUB phê duyệt)
  - symptoms                       (danh mục triệu chứng chuẩn)
  - medicines (MASTER_DATA)        (danh mục thuốc chuẩn)

HUB đọc từ Server:
  - Tất cả encounters của mọi SPOKE → báo cáo tổng hợp
  - Tất cả inventory_logs          → phân tích xuất nhập kho
  - Tồn kho thực tế từng trạm      → cảnh báo thiếu thuốc
```

> **Lưu ý quan trọng:** `inventory_logs` hiện tại **không được sync** qua file `.dat` (trường `transactions` trong sync-service.js đang để rỗng). Server là lần đầu tiên inventory_logs được đồng bộ đầy đủ.

### API contract cần thống nhất với team server
```
POST /api/sync/encounters         — gửi ca khám (kèm clinical_events)
POST /api/sync/inventory-logs     — gửi lịch sử xuất nhập kho
POST /api/sync/medicines/stock    — gửi tồn kho thực tế (read-only trên server)
GET  /api/sync/protocols          — tải phác đồ chuẩn mới nhất
GET  /api/sync/symptoms           — tải danh mục triệu chứng
GET  /api/sync/medicines/master   — tải danh mục thuốc chuẩn
GET  /api/sync/employees          — tải danh sách nhân viên mới nhất
GET  /api/sync/protocols          — tải phác đồ chuẩn mới nhất
GET  /api/sync/symptoms           — tải danh mục triệu chứng
GET  /api/sync/medicines/master   — tải danh mục thuốc chuẩn
GET  /api/ping                    — kiểm tra kết nối
```

### Quy tắc đồng bộ danh sách nhân viên

**Đặc điểm:**
- Server là nguồn sự thật duy nhất cho danh sách nhân viên
- `id_nv`  → **bất biến**, không bao giờ thay đổi
- `ho_ten` và  `bo_phan` → **có thể thay đổi** hàng ngày (chuyển bộ phận, luân chuyển)
- Áp dụng cho **tất cả trạm**: mọi Spoke và HUB đều phải sync

**Logic merge tại client:**
```
Khi nhận danh sách từ server:
  Với mỗi nhân viên trong danh sách server:
    → Tìm trong localStorage theo id_nv
    → Nếu chưa có   → thêm mới
    → Nếu đã có     → chỉ cập nhật bo_phan nếu khác
    → id_nv, ho_ten → KHÔNG ghi đè dù server trả về gì
  Nhân viên chỉ có ở local mà không có trên server → giữ nguyên (offline safety)
```

**Thời điểm sync nhân viên:**
1. Khi app khởi động (nếu server được cấu hình và bật)
2. Theo chu kỳ retry (cùng interval với data sync)
3. Nút "Sync ngay" trong Admin tab Đồng bộ Server

**Ảnh hưởng nếu không sync được:**
- App dùng danh sách local cũ → vẫn hoạt động bình thường
- Nhân viên mới chưa có trong local → Kiosk không nhận ra → hiển thị thông báo "Mã thẻ chưa có trong hệ thống"
- **Quan trọng:** Đây là lý do sync nhân viên phải được ưu tiên cao hơn sync data khác

---

## Phase 4 — HUB đọc từ Server ⏳ CHỜ PHASE 3 ỔN ĐỊNH

### Mục tiêu
HUB không cần import `.dat` nữa — đọc trực tiếp từ server DB.

### Việc cần làm
- [ ] HUB gọi API server thay vì đọc SQLite local (trong DataService)
- [ ] Báo cáo tổng hợp toàn công ty từ 1 nguồn duy nhất
- [ ] Kiểm tra phân quyền: Spoke chỉ xem data của mình, HUB xem tất cả

---

## Phase 5 — Dọn dẹp ⏳ CHỜ PHASE 4 ỔN ĐỊNH (2-4 TUẦN)

### Mục tiêu
Xóa toàn bộ hệ thống HUB-SPOKE file sync cũ.

### Việc cần làm
- [ ] Xóa `sync-service.js`
- [ ] Xóa IPC handlers: `sync:export-clinical`, `sync:import-clinical`, `sync:export-medicine`, `sync:import-medicine`
- [ ] Xóa `preload.js` methods tương ứng
- [ ] Xóa UI nút Xuất/Nhập file trong các component
- [ ] Xóa cột `is_synced` cũ (HUB-SPOKE) khỏi `encounters`
- [ ] Xóa `check-file-imported`, `mark-file-imported` IPC

---

## Hướng dẫn Deploy gvc-server lên Windows Server 2019

### Yêu cầu
- Remote vào máy chủ được (IT đã bàn giao)
- Node.js đã cài (tải tại nodejs.org, cài next-next-finish)
- PM2: `npm install -g pm2` + `npm install -g pm2-windows-startup`

### Bước 1 — Copy code lên máy chủ
Copy toàn bộ thư mục `gvc-server/` vào `C:\gvc-server\` trên máy chủ.

### Bước 2 — Đặt API Key
Mở `C:\gvc-server\.env`, sửa dòng:
```
API_KEY=GVC@Goertek2025!xK9mN3pL   ← đặt chuỗi bất kỳ, khó đoán
PORT=3500
DB_PATH=./gvc_server.db
```
> API Key là chuỗi tự đặt — xác thực request từ app, không cần IT cấp.  
> Sau đó điền đúng key này vào **Admin UI → tab Đồng bộ Server → ô API Key** trên từng trạm.

### Bước 3 — Mở firewall port 3500
Chạy PowerShell **với quyền Administrator** trên máy chủ:
```powershell
New-NetFirewallRule -DisplayName "GVC Server 3500" -Direction Inbound -Protocol TCP -LocalPort 3500 -Action Allow
```

### Bước 4 — Cài dependencies và chạy
```powershell
cd C:\gvc-server
npm install
node server.js   # test thử, Ctrl+C để dừng
```
Thấy `✅ GVC Server đang chạy tại http://0.0.0.0:3500` là OK.

### Bước 5 — Chạy nền bằng PM2 (tự restart khi reboot)
```powershell
pm2 start server.js --name gvc-server
pm2 save
pm2-startup install
```

### Kiểm tra sau deploy
```powershell
# Trên bất kỳ máy nào trong LAN:
curl http://<IP_MÁY_CHỦ>:3500/api/ping
# Kết quả OK: {"success":true,"message":"pong"}
```

### Lưu ý
- File database tự tạo tại `C:\gvc-server\gvc_server.db` lần đầu chạy
- Backup định kỳ file `gvc_server.db` là backup toàn bộ dữ liệu server
- IP máy chủ phải là IP tĩnh (nhờ IT set nếu chưa có)

---

## Ghi chú chung

| Hạng mục | Quyết định |
|---|---|
| Offline khi mất mạng | ✅ Luôn hoạt động — SQLite là source of truth |
| medicines sync | 1 chiều Spoke → Server. Server read-only |
| clinical_events | Đính kèm trong payload encounter, không có cột riêng |
| Conflict resolution | Không cần — ID dùng UUID, không trùng |
| Auth | API Key / Bearer Token, lưu localStorage |
| HUB-SPOKE file sync | Giữ song song đến khi Phase 4 ổn định |
