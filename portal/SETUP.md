# Hướng dẫn cài đặt Employee Portal

## Yêu cầu
- Node.js v18+ cài trên máy Hub (E4)
- File `local_data.db` của ứng dụng chính đang hoạt động
- Tài khoản Google để lấy Gemini API Key (miễn phí)

---

## Bước 1 — Lấy Gemini API Key (miễn phí)

1. Truy cập: https://aistudio.google.com/apikey
2. Nhấn **Create API Key** → Chọn project hoặc tạo mới
3. Sao chép API key — dán vào file `.env` ở bước sau

---

## Bước 2 — Cài đặt portal

```bash
# Trên máy Hub (E4), mở terminal tại thư mục portal
cd portal
npm install
```

---

## Bước 3 — Cấu hình file .env

```bash
# Sao chép file mẫu
copy .env.example .env
```

Mở file `.env` và điền:

```env
# Đường dẫn đến local_data.db (xem trong ứng dụng chính: Admin → Thông tin hệ thống)
DB_PATH=C:\Users\<TÊN_USER>\AppData\Roaming\GoertekVinaCare Smart Medical\local_data.db

PORT=4000
JWT_SECRET=<chuỗi ngẫu nhiên dài 32+ ký tự, ví dụ dùng: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
GEMINI_API_KEY=<API key từ bước 1>
DEFAULT_PASSWORD=Goertek@2024
COMPANY_NAME=Goertek Vina
```

---

## Bước 4 — Chạy portal

```bash
# Chạy thủ công (test)
npm start

# Mở trình duyệt: http://localhost:4000
```

---

## Bước 5 — Truy cập từ Internet (Cloudflare Tunnel)

### Cài Cloudflare Tunnel (1 lần duy nhất)
```bash
# Tải cloudflared tại: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
# Sau đó chạy:
cloudflared tunnel --url http://localhost:4000
```

Cloudflare sẽ cấp một URL dạng `https://xxx-xxx-xxx.trycloudflare.com` — chia sẻ URL này cho nhân viên.

> **Lưu ý:** URL thay đổi mỗi lần khởi động với lệnh trên. Để URL cố định,
> cần đăng ký tài khoản Cloudflare miễn phí và tạo Named Tunnel.
> Xem hướng dẫn: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/

---

## Bước 6 — Tự động khởi động cùng máy (Windows)

### Dùng Task Scheduler
1. Mở **Task Scheduler** → **Create Basic Task**
2. Trigger: **At startup**
3. Action: **Start a program**
   - Program: `node`
   - Arguments: `server.js`
   - Start in: `D:\APP ĐANG LÀM\goertekvinacare-smart-medical\portal`
4. Tick **Run whether user is logged on or not**

---

## Cách nhân viên đăng nhập lần đầu

1. Truy cập URL được cung cấp
2. Nhập **Mã nhân viên** (ví dụ: `GV001234`)
3. Nhập mật khẩu mặc định: `Goertek@2024`
4. Hệ thống yêu cầu **đổi mật khẩu ngay** — mật khẩu mới tối thiểu 8 ký tự
5. Sau đó có thể xem kết quả KSK và chat với AI

> Mã nhân viên phải có trong hệ thống y tế (đã từng khám hoặc có kết quả KSK).
> Nhân viên chưa có lịch sử y tế sẽ không đăng nhập được.

---

## Quyền riêng tư & Bảo mật

- Tên thật, số điện thoại, số CCCD **KHÔNG BAO GIỜ** được gửi lên Gemini AI
- Chỉ các chỉ số y tế ẩn danh (huyết áp, phân loại sức khỏe, triệu chứng) được dùng làm ngữ cảnh cho AI
- Dữ liệu truyền qua Cloudflare được mã hóa HTTPS
- Token JWT hết hạn sau 8 giờ — nhân viên cần đăng nhập lại
