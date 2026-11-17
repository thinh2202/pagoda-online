# Chùa Từ Quang (pagoda-online)

Web chùa tiếng Việt: công phu, thắp hương, kinh tụng, công đức, sổ cầu an.

## Cách chạy trang web

### Cách 1 (Dễ nhất):
Nhấp đúp chuột vào file **`chay-web.bat`** (hoặc `start.bat`) trong thư mục dự án. Trình duyệt web sẽ tự động mở trang web tại `http://localhost:5173`.

### Cách 2 (Terminal PowerShell / Command Prompt):
```bash
npm.cmd run dev
```
*(Trên Windows PowerShell, dùng `npm.cmd run dev` để tránh lỗi chặn script của PowerShell)*

### Build sản phẩm tĩnh (Production):
```bash
npm.cmd run build
```
Thư mục xuất ra nằm trong `dist/`.

### Quản lý tài khoản

Tài khoản quản trị dùng để quản lý thành viên: khôi phục tài khoản, hạn chế tương tác theo thời hạn hoặc ban vĩnh viễn. Mặc định, tên đăng nhập quản trị là `adminthinh`; có thể đổi bằng biến môi trường `PAGODA_ADMIN_USERNAME`.

Để tạo tài khoản này lần đầu, hãy đặt `PAGODA_ADMIN_SETUP_KEY` thành một chuỗi ngẫu nhiên dài ít nhất 32 ký tự trong môi trường máy chủ, rồi nhập khóa đó vào trường “Mã thiết lập admin” khi đăng ký. Không đặt khóa trong mã nguồn hoặc chia sẻ khóa qua chat. Người dùng đăng ký thông thường để trống trường này.

Ví dụ trong PowerShell (chỉ áp dụng cho cửa sổ hiện tại):

```powershell
$env:PAGODA_ADMIN_SETUP_KEY = '<chuỗi ngẫu nhiên dài ít nhất 32 ký tự>'
npm.cmd run dev
```

### Xác minh email và đặt lại mật khẩu

Tài khoản đăng ký mới cần xác minh email trước khi đăng nhập. Tài khoản cũ vẫn dùng được; chủ tài khoản có thể đăng nhập, vào trang **Tài khoản**, thêm email khôi phục và xác minh email đó. Khi quên mật khẩu, người dùng nhận mã qua email để tự đặt mật khẩu mới; quản trị viên không thể xem mật khẩu cũ.

Để bật gửi email Gmail:

1. Bật xác minh 2 bước cho tài khoản Google gửi thư và tạo **Mật khẩu ứng dụng**. Không dùng mật khẩu Gmail thông thường.
2. Sao chép `.env.example` thành `.env`, rồi điền `PAGODA_EMAIL_USER`, `PAGODA_EMAIL_APP_PASSWORD` và `PAGODA_EMAIL_CODE_SECRET`. Khóa `PAGODA_EMAIL_CODE_SECRET` phải là chuỗi ngẫu nhiên dài ít nhất 32 ký tự.
3. Giữ `.env` riêng tư; tệp này đã được thêm vào `.gitignore`. Không gửi mật khẩu ứng dụng hoặc khóa bảo vệ mã email trong chat.
4. Khởi động lại máy chủ sau khi lưu cấu hình.

Tạo khóa ngẫu nhiên an toàn bằng PowerShell:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Mã xác minh có hiệu lực 10 phút và được giới hạn số lần nhập sai. Khi chưa cấu hình Gmail, chức năng đăng ký/xác minh/đặt lại mật khẩu sẽ báo lỗi thay vì giả vờ gửi email thành công.

### Trang công đức

Trang **Công đức** hiển thị mã QR trong `public/dana-qr.png` và có các phần riêng để chuyển khoản, ghi nhận phát tâm, và xem sổ công đức. Có thể thay ảnh trong thư mục `public/` bằng mã QR khác. Các bản ghi hiển thị công khai là nội dung do người gửi tự khai, không phải xác nhận giao dịch từ ngân hàng.

Các khoản ghi nhận gắn với tài khoản đăng nhập được cộng dồn để hiển thị cấp bậc phát tâm: Sen Đồng từ 100.000 đ, Sen Bạc từ 500.000 đ, và Sen Vàng từ 1.000.000 đ. Khoản ghi nhận khi chưa đăng nhập không được cộng vào tài khoản. Cấp bậc chỉ dựa trên số tiền người dùng tự khai, chưa được ngân hàng xác minh và không đại diện cho cấp bậc tu hành.

### Cấp độ tham gia thiền online

Trang **Ngồi thiền** cộng dồn thời gian theo tài khoản đăng nhập, chỉ khi trang đang hiển thị ở trình duyệt. Các mốc là Tập sự (1 giờ), Tinh tấn (10 giờ), và An trú (50 giờ); người dùng được thông báo khi đạt cấp mới. Quản trị viên có thể xem thời gian của các tài khoản trong trang **Tài khoản**; danh sách này không hiển thị công khai. Thời gian trực tuyến chỉ phản ánh hoạt động trên trang, không đánh giá hay xác nhận mức độ tu hành.
