# API Spec — Goertek Vina Care Server

> Tài liệu này mô tả yêu cầu kỹ thuật phía server để tích hợp với ứng dụng desktop GVC.  
> Ứng dụng viết bằng **Electron + Node.js**. Server team dùng **Java Spring Boot**.  
> Ngày viết: 2026-05-18

---

## 1. Quy ước chung

### 1.1 Timestamp

**Dùng Unix milliseconds (INTEGER) cho toàn bộ API.**

```json
"start_time": 1744425600000
```

App lưu trữ nội bộ bằng `Date.now()` (Unix ms). Nếu server trả về ISO string, app phải convert — dễ xảy ra lỗi múi giờ.

**Spring Boot config:**
```java
@JsonSerialize(using = LongSerializer.class)
private Long startTime;

// Hoặc toàn app dùng:
@Bean
public Jackson2ObjectMapperBuilderCustomizer jsonCustomizer() {
    return builder -> builder.featuresToDisable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    // Bật lại write as timestamps nếu cần:
    // builder.featuresToEnable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
}
```

### 1.2 Tên field (Naming Convention)

**Dùng `snake_case` cho toàn bộ JSON request/response.**

App dùng SQLite với `snake_case` — giữ nhất quán, không cần map 2 chiều.

```java
@Configuration
public class JacksonConfig {
    @Bean
    public ObjectMapper objectMapper() {
        ObjectMapper mapper = new ObjectMapper();
        mapper.setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
        return mapper;
    }
}
```

### 1.3 CORS

**Electron renderer chạy ở origin `file://`**, không phải `localhost`. Spring Boot phải cho phép:

```java
@Configuration
public class CorsConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
            .allowedOrigins("file://", "http://localhost:*")
            .allowedMethods("GET", "POST", "PUT")
            .allowedHeaders("*");
    }
}
```

> ⚠️ Nếu thiếu cấu hình này, mọi request từ app sẽ bị block với lỗi CORS — không hiển thị lỗi rõ ràng, chỉ thấy "Network Error".

### 1.4 Format Response

**Tất cả endpoint trả về cùng một format:**

```json
// Thành công
{
  "success": true,
  "data": { ... }         // object hoặc array
}

// Thành công, không có data
{
  "success": true,
  "message": "Đã nhận 15 bản ghi"
}

// Lỗi
{
  "success": false,
  "message": "Mô tả lỗi bằng tiếng Việt hoặc tiếng Anh"
}
```

HTTP status codes:
- `200` — Thành công
- `400` — Request sai format
- `401` — API Key không hợp lệ
- `500` — Lỗi server

### 1.5 Authentication

**Dùng API Key qua header.**

```
Authorization: Bearer <api_key>
```

App lưu API Key trong localStorage (admin cấu hình trong tab "Đồng bộ Server"). Server validate header này cho mọi endpoint (trừ `/api/ping`).

### 1.6 Pagination

**Không dùng pagination cho các endpoint sync.** App gửi/nhận batch, không cần phân trang.  
*(Có thể thêm pagination ở Phase 4 khi HUB cần kéo báo cáo tổng hợp)*

---

## 2. Endpoints

### 2.1 Health Check

```
GET /api/ping
```

Không cần auth. Dùng để test kết nối trong Admin UI.

**Response:**
```json
{ "success": true, "message": "pong" }
```

---

### 2.2 Sync Ca Khám (Encounters)

```
POST /api/sync/encounters
```

App gửi các ca khám có `is_synced_server = 0`. Gửi theo batch, tối đa 100 bản ghi mỗi lần.

**Request Body:**
```json
{
  "station_id": "SPOKE_E1",
  "station_name": "Trạm Y tế E1",
  "records": [
    {
      "id": "enc_1744425600000abc",
      "patient_id": "100001",
      "patient_name": "NGUYEN VAN AN",
      "department": "ASSEMBLY A1",
      "station_name": "Trạm Y tế E1",
      "symptoms": ["Đau đầu", "Sốt"],
      "status": "COMPLETED",
      "start_time": 1744425600000,
      "end_time": 1744429200000,
      "diagnosis": "Cảm cúm thông thường",
      "disease_group": "Hô hấp",
      "prescriptions": [
        {
          "medicine_name": "Panadol Extra",
          "quantity": 4,
          "unit": "Viên",
          "note": "Uống sau ăn"
        }
      ],
      "had_rest_at_room": 0,
      "is_supplementary": 0,
      "clinical_events": [
        {
          "id": "evt_1744425600123",
          "action_type": "CHECK_IN",
          "actor_name": "Kiosk/System",
          "details": "Đăng ký khám. Triệu chứng: Đau đầu, Sốt",
          "timestamp": 1744425600000
        },
        {
          "id": "evt_1744429200456",
          "action_type": "UPDATE",
          "actor_name": "BS. Nguyen Thi Lan",
          "details": "CĐ: Cảm cúm thông thường | Trạng thái -> COMPLETED",
          "timestamp": 1744429200000
        }
      ]
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Đã nhận 1 ca khám",
  "received_ids": ["enc_1744425600000abc"]
}
```

> `received_ids` — App dùng danh sách này để cập nhật `is_synced_server = 1` chỉ cho các bản ghi được xác nhận.

---

### 2.3 Sync Lịch Sử Kho (Inventory Logs)

```
POST /api/sync/inventory-logs
```

App gửi các giao dịch kho có `is_synced_server = 0`.

> ⚠️ Đây là lần đầu tiên inventory_logs được đồng bộ (hệ thống file sync cũ không sync kho).

**Request Body:**
```json
{
  "station_id": "SPOKE_E1",
  "station_name": "Trạm Y tế E1",
  "records": [
    {
      "id": "log_1744425600000xyz",
      "type": "IMPORT",
      "source": "WAREHOUSE",
      "target": "Trạm Y tế E1",
      "items": [
        {
          "name": "Panadol Extra",
          "batch": "LOT2025-001",
          "qty": 100
        }
      ],
      "timestamp": 1744425600000,
      "note": "Nhập từ kho trung tâm",
      "actor_name": "Nguyen Van Admin",
      "actor_role": "ADMIN"
    }
  ]
}
```

`type` có thể là: `IMPORT`, `EXPORT`, `DISPENSE`, `RESTORE`, `ADJUST`

**Response:**
```json
{
  "success": true,
  "message": "Đã nhận 1 giao dịch kho",
  "received_ids": ["log_1744425600000xyz"]
}
```

---

### 2.4 Sync Tồn Kho Thực Tế

```
POST /api/sync/medicines/stock
```

App gửi snapshot tồn kho hiện tại của trạm. **Server chỉ lưu để HUB xem, không ghi đè ngược lại.**

**Request Body:**
```json
{
  "station_id": "SPOKE_E1",
  "station_name": "Trạm Y tế E1",
  "snapshot_time": 1744425600000,
  "medicines": [
    {
      "id": "MED_001_LOT001",
      "name": "Panadol Extra",
      "group_name": "Hạ sốt giảm đau",
      "unit": "Viên",
      "stock": 87,
      "batch_number": "LOT2025-001",
      "expiry_date": "2027-06-30",
      "type": "MEDICINE"
    }
  ]
}
```

**Response:**
```json
{ "success": true, "message": "Đã cập nhật tồn kho trạm SPOKE_E1" }
```

---

### 2.5 Tải Danh Sách Nhân Viên

```
GET /api/sync/employees
```

**Quan trọng nhất** — ảnh hưởng trực tiếp đến Kiosk (nhân viên mới không quét được thẻ nếu chưa sync).

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id_nv": "100001",
      "ho_ten": "NGUYEN VAN AN",
      "bo_phan": "ASSEMBLY A1"
    },
    {
      "id_nv": "100002",
      "ho_ten": "TRAN THI BICH",
      "bo_phan": "QA/QC"
    }
  ]
}
```

**Quy tắc merge phía client (app tự xử lý):**
- `id_nv` + `ho_ten` → bất biến, không ghi đè
- `bo_phan` → cập nhật nếu khác (nhân viên chuyển bộ phận)
- Nhân viên chỉ có local → giữ nguyên (offline safety)

**Khi nào sync:**
1. Khi app khởi động (nếu sync được bật)
2. Theo chu kỳ cấu hình (mặc định 1 giờ)
3. Khi admin nhấn "Sync ngay"

---

### 2.6 Tải Danh Mục Thuốc Chuẩn

```
GET /api/sync/medicines/master
```

HUB phê duyệt danh mục — các Spoke tải về để đồng nhất tên thuốc.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "MED_001",
      "name": "Panadol Extra",
      "group_name": "Hạ sốt giảm đau",
      "unit": "Viên",
      "type": "MEDICINE"
    }
  ]
}
```

---

### 2.7 Tải Phác Đồ Điều Trị

```
GET /api/sync/protocols
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "proto_001",
      "name": "Cảm cúm thông thường",
      "symptoms": ["Sốt", "Ho", "Chảy nước mũi"],
      "suggested_medicines": ["Panadol Extra", "Methorphan"],
      "note": "Uống nhiều nước, nghỉ ngơi"
    }
  ]
}
```

---

### 2.8 Tải Danh Mục Triệu Chứng

```
GET /api/sync/symptoms
```

**Response:**
```json
{
  "success": true,
  "data": [
    { "id": "sym_001", "name": "Đau đầu", "group": "Thần kinh" },
    { "id": "sym_002", "name": "Sốt", "group": "Toàn thân" }
  ]
}
```

---

## 3. Luồng sync từ App

```
Khi app khởi động:
  1. GET /api/ping (timeout 5s) → nếu fail, bỏ qua, chạy offline
  2. GET /api/sync/employees   → merge vào SQLite local
  3. GET /api/sync/medicines/master → cập nhật danh mục
  (3 & 4 chạy background, không block UI)

Sau mỗi ca khám kết thúc (status = COMPLETED):
  → POST /api/sync/encounters (gửi ngay 1 bản ghi)
  → Nếu thành công: UPDATE is_synced_server = 1
  → Nếu thất bại: giữ = 0, retry theo interval

Background worker (mỗi N phút, N cấu hình bởi Admin):
  → Quét encounters WHERE is_synced_server = 0 → gửi batch
  → Quét inventory_logs WHERE is_synced_server = 0 → gửi batch
  → POST /api/sync/medicines/stock (snapshot tồn kho)
```

---

## 4. Câu hỏi cần xác nhận từ team Server

| # | Câu hỏi | Đề xuất từ App |
|---|---|---|
| 1 | Timestamp dùng Unix ms hay ISO string? | **Unix ms** |
| 2 | Field name dùng `snake_case` hay `camelCase`? | **snake_case** |
| 3 | CORS — cho phép origin `file://` không? | **Cần cho phép** |
| 4 | Format response dùng `{ success, data }` không? | **Đề xuất dùng** |
| 5 | API Key lưu ở đâu trên server, rotate thế nào? | Team server quyết định |
| 6 | Server có sẵn endpoint `/api/ping` không? | **Cần có** |
| 7 | `received_ids` trong response có khả thi không? | Nếu không thì trả `count` cũng được |

---

## 5. Không cần làm (phạm vi Phase 2+3)

- Pagination — chỉ cần khi Phase 4 (HUB kéo báo cáo tổng hợp)
- Webhook / push từ server về app — app tự poll theo interval
- Conflict resolution — ID dùng chuỗi ngẫu nhiên unique, không trùng
- DELETE endpoint — app không xóa data trên server
