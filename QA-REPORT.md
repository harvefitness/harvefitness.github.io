# Báo cáo kiểm thử – DNT & HARVE FITNESS

Ngày kiểm thử: 04/11/2026 · Bản: `main` trên https://harvefitness.github.io
Người kiểm thử: Claude (kiểm thử tự động bằng trình duyệt Chromium/Playwright + kiểm tra API trực tiếp)

## Kết luận

**Sẵn sàng dùng thử cho bạn bè và người quen (beta, vài chục người).** Các chức năng chính chạy ổn trên mọi cỡ màn hình đã thử, dữ liệu được bảo vệ đúng cách. Trước khi quảng bá rộng (hàng trăm người trở lên), cần làm 3 việc ở mục **Việc nên làm trước khi mở rộng**.

## 1. Kiểm thử chức năng (end-to-end)

| Luồng | Kết quả |
| --- | --- |
| Tạo hồ sơ 5 bước → đánh giá cơ thể → lộ trình → thực đơn | ✅ Đạt |
| Ghi buổi tập: chọn tạ 2,5–100 kg, đổi tạ hiệp trên tự đổi hiệp dưới, tick, thêm hiệp chép hiệp cuối | ✅ Đạt |
| Nhớ mức tạ: tuần sau tự điền 20 kg × 12; PT nhắc tăng lên 25 kg; nút Áp dụng | ✅ Đạt |
| Bảng lịch tháng, chuyển tháng, chọn ngày | ✅ Đạt |
| Thư viện 876 bài, tìm kiếm không dấu, ảnh động | ✅ Đạt |
| Mô hình 3D: xoay, phóng to, chạm chọn cơ, 4 góc nhìn | ✅ Đạt |
| Nhật ký ăn: món có sẵn, tự nhập, chụp ảnh / nói (giao diện), chấm điểm | ✅ Đạt |
| Ly nước ở trang chủ và nhật ký đồng bộ | ✅ Đạt |
| Số đo & biểu đồ tiến bộ | ✅ Đạt |
| Bước chân từ Phím tắt iOS (giả lập link `#health-…`), 11 kiểu định dạng số | ✅ Đạt |
| Gemini: chat, ước tính calo từ chữ, nhận diện ảnh không phải đồ ăn | ✅ Đạt (gọi API thật) |

## 2. Kiểm thử logic (tự động)

| Kiểm tra | Kết quả |
| --- | --- |
| Tạo lộ trình cho **864 tổ hợp hồ sơ** (nam/nữ × 3 trình độ × 3 nơi tập × 0–7 ngày gym × môn thể thao × chấn thương) | ✅ 0 lỗi (đã phát hiện và sửa lỗi khi chọn gym 7 ngày) |
| Công thức: BMR Mifflin–St Jeor, % mỡ U.S. Navy (so tính tay) | ✅ Khớp |
| Đọc số bước/km từ iPhone (8.234 / 8,234 / 5,6 / mét / số lỗi thập phân) | ✅ Đạt |

## 3. Giao diện trên nhiều thiết bị

12 trang × 5 cỡ màn hình: Galaxy S9+ (320px), iPhone SE (375px), iPhone 13 (390px), iPhone 15 Pro Max (430px), máy tính (1440px).

| Tiêu chí | Kết quả |
| --- | --- |
| Không tràn ngang, không vỡ bố cục | ✅ 60/60 |
| Không lỗi JavaScript | ✅ 0 lỗi |
| Chế độ tối, chữ tiếng Việt có dấu (font Anton, Be Vietnam Pro) | ✅ Đạt |

## 4. Hiệu năng

| Chỉ số | Trước tối ưu | Sau tối ưu |
| --- | --- | --- |
| Mở trang đầu – mạng 4G (CPU chậm ×4) | 1,7 s | **1,1 s** |
| Mở trang đầu – mạng 3G nhanh | 6,0 s | **3,4 s** |
| JavaScript tải lúc khởi động (nén gzip) | ~280 KB | **~136 KB** |
| Lần mở thứ 2 trở đi | tải lại toàn bộ | gần như tức thì (service worker) |

Đã làm: Firestore Lite thay SDK đầy đủ, SDK Gemini chỉ tải khi dùng AI, mô hình 3D (909 KB) và thư viện bài tập chỉ tải khi mở trang đó, bỏ font thừa, lưu đệm ảnh bài tập.

## 5. Bảo mật

| Kiểm tra | Kết quả |
| --- | --- |
| Đọc dữ liệu người khác khi chưa đăng nhập | ✅ Bị chặn (PERMISSION_DENIED) |
| Ghi/ghi đè dữ liệu khi chưa đăng nhập | ✅ Bị chặn |
| Liệt kê danh sách tài khoản | ✅ Bị chặn (UNAUTHENTICATED) |
| Chèn mã độc (XSS) vào tên, tên món ăn | ✅ Bị vô hiệu, hiện thành chữ thường |
| Quy tắc Firestore: mỗi người chỉ đọc/ghi `users/{uid}` của mình | ✅ Đúng |
| Khóa API Firebase giới hạn theo tên miền | ⚠️ **Chưa** – xem mục dưới |

## 6. Độ ổn định

| Kiểm tra | Kết quả |
| --- | --- |
| Mất mạng khi đang dùng | ✅ Không treo; chấm trạng thái chuyển đỏ, dữ liệu lưu lại khi có mạng |
| Gemini hết lượt / quá tải | ✅ Tự chuyển model khác, báo lỗi rõ ràng |
| Thiết bị không hỗ trợ 3D (WebGL) | ✅ Tự chuyển sang hình 2D |

## 7. Chưa kiểm thử được (cần thử trên điện thoại thật)

- Đăng nhập Google thật trên iPhone/Android (máy kiểm thử không đăng nhập được tài khoản Google).
- 2 tài khoản thật xem có thấy dữ liệu của nhau không (quy tắc đã đúng, nên thử 1 lần với 2 Gmail).
- Chụp ảnh món ăn thật, ghi âm giọng nói thật.
- Phím tắt Apple Health chạy thật (cần sửa phím tắt để lấy **tổng** số bước).

## Việc nên làm trước khi mở rộng

1. **Giới hạn khóa API theo tên miền** (5 phút): Google Cloud Console → APIs & Services → Credentials → khóa "Browser key" → *Application restrictions: Websites* → thêm `https://harvefitness.github.io/*`. Tránh người khác dùng ké lượt Gemini.
2. **Bật App Check** cho Firebase AI Logic (reCAPTCHA): chặn bot gọi Gemini bằng khóa của bạn.
3. **Theo dõi hạn mức miễn phí:** Gemini miễn phí giới hạn số câu hỏi mỗi phút/ngày; Firestore 50.000 lượt đọc/ngày. Đủ cho vài chục người; nhiều hơn nên cân nhắc gói trả theo dùng (rất rẻ với Flash-Lite).

## Giới hạn đã biết

- AI ước tính calo sai số khoảng ±15%; nội dung mang tính tham khảo, không thay thế bác sĩ.
- Chưa có thông báo đẩy (nhắc tập, uống nước).
- Mô hình 3D là mô hình giải phẫu nam (Z-Anatomy), dùng chung cho mọi người.
- Mô hình 3D theo giấy phép CC BY-SA 4.0: luôn giữ dòng ghi nguồn dưới mô hình.
