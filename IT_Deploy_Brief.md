# Tài liệu Kỹ thuật — Đề xuất Triển khai Hệ thống Y tế Phòng khám
**Đơn vị đề xuất:** [TÊN PHÒNG BAN / ĐƠN VỊ]
**Gửi đến:** Phòng Công nghệ Thông tin — [TÊN CÔNG TY]
**Ngày:** [NGÀY]
**Phiên bản tài liệu:** 1.0

---

## 1. Tổng quan hệ thống

### 1.1 Mục đích
[TÊN HỆ THỐNG] là phần mềm quản lý phòng khám nội bộ, được xây dựng để phục vụ hoạt động khám chữa bệnh, quản lý kho dược, và theo dõi sức khỏe định kỳ (KSK) cho toàn bộ nhân viên công ty.

### 1.2 Đối tượng sử dụng
- Nhân viên y tế tại các trạm khám (bác sĩ, y tá, dược sĩ)
- Quản lý phòng khám tổng hợp (HUB)
- Bộ phận hành chính y tế

### 1.3 Quy mô triển khai
| Thành phần | Số lượng | Vị trí |
|---|---|---|
| Máy trạm khám (SPOKE) | [SỐ LƯỢNG] | [CÁC KHU VỰC / PHÂN XƯỞNG] |
| Máy tổng hợp (HUB) | [SỐ LƯỢNG] | [VỊ TRÍ] |
| Máy chủ trung tâm | 1 | Phòng Server công ty |

---

## 2. Kiến trúc kỹ thuật

### 2.1 Sơ đồ tổng thể

```
┌─────────────────────────────────────────────────────────────┐
│                     MẠNG NỘI BỘ (LAN)                       │
│                                                             │
│  [SPOKE 1]      [SPOKE 2]      [SPOKE N]      [HUB]        │
│  Trạm khám      Trạm khám      Trạm khám      Tổng hợp     │
│  SQLite local   SQLite local   SQLite local   SQLite local  │
│       │              │              │              │         │
│       └──────────────┴──────────────┴──────────┘           │
│                              │                              │
│                    ┌─────────▼─────────┐                    │
│                    │  SERVER TRUNG TÂM  │                    │
│                    │  Node.js + SQLite  │                    │
│                    │  Port: [PORT]      │                    │
│                    └─────────┬─────────┘                    │
│                              │                              │
│                    ┌─────────▼─────────┐                    │
│                    │   HỆ THỐNG HR     │                    │
│                    │  [TÊN PHẦN MỀM]   │                    │
│                    │  (Read-only)       │                    │
│                    └───────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Công nghệ sử dụng
| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Giao diện người dùng | Electron + React | Ứng dụng desktop, chạy offline |
| Backend server | Node.js | Chạy như một Windows Service / Linux daemon |
| Database local (mỗi máy) | SQLite | Tự động tạo, không cần cài thêm |
| Database server | SQLite | Nhẹ, phù hợp quy mô nội bộ |
| Mã hóa dữ liệu truyền | AES-256 | Áp dụng cho mọi dữ liệu đồng bộ |
| Giao thức kết nối | HTTP (REST API) | Hoạt động hoàn toàn trong LAN nội bộ |

### 2.3 Cơ chế hoạt động
**Hiện tại — Offline độc lập:** Hệ thống đang vận hành ổn định theo mô hình offline. Mỗi máy trạm lưu dữ liệu cục bộ, đồng bộ thủ công qua file mã hóa khi cần tổng hợp. Dữ liệu y tế hiện chưa được lưu tập trung trên hạ tầng công ty.

**Mục tiêu triển khai lần này:** Kết nối toàn bộ các máy trạm vào một máy chủ trung tâm đặt tại công ty, để dữ liệu khám bệnh, kho dược và KSK được lưu trữ tập trung, có thể tra cứu và báo cáo theo thời gian thực thay vì tổng hợp thủ công như hiện tại.

**Sau khi triển khai — Tự động đồng bộ (Push-Pull):** Định kỳ [X] phút một lần, mỗi máy trạm tự động đẩy dữ liệu mới lên server và kéo dữ liệu từ các trạm khác về. Nếu mạng gián đoạn, máy trạm tiếp tục hoạt động bình thường và tự đồng bộ lại khi mạng được khôi phục — không làm gián đoạn công việc khám bệnh.

**Tích hợp HR (Read-only):** Hệ thống chỉ ĐỌC thông tin nhân viên từ HR để tra cứu khi tạo hồ sơ khám bệnh. Không ghi, không sửa, không xóa bất kỳ dữ liệu nào trong hệ thống HR.

---

## 3. Yêu cầu hạ tầng tối thiểu

### 3.1 Máy chủ (Server)
| Thông số | Yêu cầu tối thiểu | Khuyến nghị |
|---|---|---|
| RAM | 8 GB trống (sau các service hiện có) | 16 GB trống |
| CPU | 2 nhân trống | 4 nhân trống |
| Disk | 50 GB trống | 100 GB trống |
| Hệ điều hành | Windows Server 2019+ hoặc Ubuntu 20.04 LTS+ | Ubuntu 22.04 LTS |
| Runtime | Node.js v18 trở lên | Node.js v20 LTS |
| Port cần mở | 1 port nội bộ (đề xuất: 3001) | — |

### 3.2 Máy trạm (SPOKE / HUB)
| Thông số | Yêu cầu |
|---|---|
| Hệ điều hành | Windows 10 trở lên |
| RAM | 4 GB trở lên |
| Disk | 500 MB trống cho ứng dụng + dữ liệu |
| Mạng | Kết nối LAN đến server trung tâm |

### 3.3 Mạng
- Tất cả máy trạm cần kết nối được đến IP server trung tâm qua port đã cấp
- Không yêu cầu kết nối Internet
- Băng thông tối thiểu: 1 Mbps LAN (thực tế dữ liệu y tế rất nhỏ)

---

## 4. Tích hợp với hệ thống HR hiện có

### 4.1 Mục đích tích hợp
Khi nhân viên đến khám, bác sĩ nhập mã nhân viên hoặc tên → hệ thống tự tra cứu thông tin cá nhân từ HR (họ tên, phòng ban, giới tính, ngày sinh) → điền tự động vào hồ sơ khám.

### 4.2 Nguyên tắc tích hợp
- **Chỉ đọc (Read-only):** Hệ thống y tế không ghi bất kỳ dữ liệu nào vào HR
- **Cache cục bộ:** Dữ liệu nhân viên được lưu cache tại server trung tâm, đồng bộ định kỳ — không phụ thuộc HR online liên tục
- **Dữ liệu cần lấy:** Mã NV, Họ tên, Phòng ban, Giới tính, Ngày sinh, Trạng thái làm việc

### 4.3 Phương thức tích hợp (theo thứ tự ưu tiên)
| Phương thức | Điều kiện áp dụng | Độ phức tạp |
|---|---|---|
| REST API của HR | HR có sẵn API | Thấp |
| Đọc database HR (read-only) | HR cho phép kết nối DB | Trung bình |
| File Excel/CSV tự động | HR có thể export định kỳ | Trung bình |
| Export thủ công định kỳ | Không có cách nào khác | Cao (phụ thuộc người) |

---

## 5. Phương án triển khai — IT chọn phương án phù hợp

Chúng tôi đã chuẩn bị sẵn **3 gói triển khai** tương ứng với 3 môi trường server khác nhau. Phòng IT chỉ cần xác nhận phương án phù hợp, chúng tôi sẽ cung cấp đúng gói cài đặt kèm tài liệu hướng dẫn chi tiết.

### Phương án A — Tiêu chuẩn (khuyến nghị)
Chạy backend như một Windows Service (trên Windows) hoặc systemd service (trên Linux). Tự động khởi động lại khi server restart, không cần giám sát thủ công.
**Điều kiện:** Máy chủ đã cài hoặc cho phép cài Node.js v18+.
**Chúng tôi cung cấp:** Gói cài đặt + script tự động + hướng dẫn từng bước.

### Phương án B — Docker
Toàn bộ backend được đóng gói trong Docker container, **cô lập hoàn toàn** với môi trường server hiện có. Không ảnh hưởng đến bất kỳ hệ thống nào đang chạy. Dễ cập nhật và rollback.
**Điều kiện:** Máy chủ đã có Docker Engine.
**Chúng tôi cung cấp:** Docker image + file `docker-compose.yml` + 1 lệnh duy nhất để chạy.

### Phương án C — Portable (không cần cài đặt gì thêm)
Backend được đóng gói thành **1 file thực thi duy nhất** (.exe trên Windows), không cần cài Node.js, không cần quyền admin, không thay đổi gì trên hệ thống.
**Điều kiện:** Không có yêu cầu đặc biệt.
**Chúng tôi cung cấp:** File .exe + hướng dẫn cấu hình tự khởi động cùng Windows.
**Lưu ý:** Phương án này phù hợp môi trường có hạn chế quyền cài đặt. Khuyến nghị kết hợp với Windows Task Scheduler để tự khởi động.

---

## 6. Chúng tôi cần IT hỗ trợ 4 việc

```
1. Cấp IP tĩnh (hoặc xác nhận IP hiện có) của máy chủ sẽ dùng để deploy.

2. Cấp hoặc chỉ định một port còn trống trên máy chủ đó.
   (Chúng tôi đề xuất port 3001 — nếu đã dùng, bất kỳ port nào trống đều được.)

3. Mở kết nối nội bộ từ các máy trạm đến máy chủ qua port đã chọn.
   (Chỉ trong phạm vi LAN nội bộ, không mở ra Internet.)

4. Cung cấp đầu mối liên hệ kỹ thuật để phối hợp trong quá trình cài đặt.
```

---

## 7. Chúng tôi cần HR hỗ trợ 1 việc

Để hệ thống tự động tra cứu thông tin nhân viên khi tạo hồ sơ khám bệnh, chúng tôi cần được cung cấp **một trong các hình thức sau** (HR chọn hình thức phù hợp nhất):

```
Hình thức 1 — API (nếu hệ thống HR đã có sẵn)
  Cung cấp địa chỉ API + thông tin xác thực (token/key) để truy vấn
  danh sách nhân viên. Chúng tôi chỉ đọc, không ghi bất kỳ dữ liệu nào.

Hình thức 2 — File Excel/CSV định kỳ
  HR xuất file danh sách nhân viên (tối thiểu: Mã NV, Họ tên, Phòng ban,
  Giới tính, Ngày sinh) theo định kỳ hàng tuần hoặc khi có thay đổi.
  Chúng tôi cung cấp sẵn template chuẩn để HR điền vào.

Hình thức 3 — Bàn giao một lần
  Nếu danh sách nhân viên ít thay đổi, HR có thể cung cấp file một lần
  và cập nhật khi cần. Đội y tế tự nhập bổ sung trong trường hợp có
  nhân viên mới hoặc chuyển bộ phận.
```

---

## 8. Cam kết kỹ thuật

- Hệ thống y tế **không can thiệp** vào bất kỳ hệ thống hiện có nào
- Chỉ đọc dữ liệu nhân viên từ HR — **không ghi, không sửa, không xóa**
- Toàn bộ dữ liệu lưu trữ và truyền tải đều được **mã hóa**
- Có thể **gỡ bỏ hoàn toàn** mà không để lại ảnh hưởng trên server
- Mọi thao tác trên hạ tầng công ty đều được **thông báo và xác nhận với IT trước**

---

*Tài liệu này được chuẩn bị nhằm hỗ trợ phòng IT đánh giá và phê duyệt triển khai.*
*Mọi thắc mắc kỹ thuật xin liên hệ: [TÊN LIÊN HỆ] — [EMAIL / SĐT]*
