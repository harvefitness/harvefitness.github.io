# DNT & HARVE FITNESS

Website PT cá nhân online, tối ưu cho điện thoại.

- Đăng nhập Google, dữ liệu mỗi người lưu riêng (Firebase Auth + Firestore)
- Đánh giá cơ thể theo chuẩn quốc tế (BMI châu Á, % mỡ U.S. Navy, WHR/WHtR, FFMI, Mifflin–St Jeor, MET)
- Lộ trình tập 12 tuần riêng từng người, tính cả môn thể thao khác (tennis, chạy bộ, bơi…)
- Thư viện 870+ bài tập có ảnh động ([free-exercise-db](https://github.com/yuhonas/free-exercise-db), public domain)
- Thực đơn món Việt mỗi ngày, nhật ký ăn uống có chấm điểm và nhận xét
- Chat với PT AI (Gemini qua Firebase AI Logic)

**Cài đặt: xem [HUONG-DAN.md](HUONG-DAN.md).**

## Phát triển

```bash
npm install
npm run dev     # build + chạy http://localhost:8080
```

Để trống `apiKey` trong `public/config.js` thì web chạy ở chế độ thử (lưu trên máy, không có AI).

| Thư mục | Nội dung |
| --- | --- |
| `src/calc.js` | Công thức đánh giá cơ thể và mục tiêu dinh dưỡng |
| `src/program.js` | Tạo lộ trình tập |
| `src/food.js` | Bảng thực phẩm Việt, thực đơn, chấm điểm bữa ăn |
| `src/exercises.js` | Thư viện bài tập, tên và mẹo tiếng Việt |
| `src/ai.js` | Gemini (Firebase AI Logic) |
| `src/v-*.js`, `src/main.js` | Giao diện |
| `public/` | HTML, CSS, cấu hình, dữ liệu bài tập |
| `firestore.rules` | Quy tắc bảo mật dữ liệu |
