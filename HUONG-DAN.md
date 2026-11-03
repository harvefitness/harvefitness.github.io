# Hướng dẫn đưa DNT & HARVE FITNESS lên mạng

Tổng thời gian khoảng 20–30 phút, **hoàn toàn miễn phí**. Bạn chỉ cần một tài khoản Google và một tài khoản GitHub.

| Dịch vụ | Dùng để | Chi phí |
| --- | --- | --- |
| GitHub Pages | Chứa website, cho link `https://ngletam123.github.io/dnt-harve-fitness-provip/` | Miễn phí |
| Firebase Authentication | Đăng nhập bằng Google | Miễn phí |
| Cloud Firestore | Lưu dữ liệu riêng từng người | Miễn phí đến 50.000 lượt đọc/ngày |
| Firebase AI Logic (Gemini) | Chat PT AI, ước tính calo, nhận xét bữa ăn | Miễn phí (có giới hạn số câu hỏi mỗi phút/ngày) |

---

## Bước 1: Tạo kho GitHub

1. Vào <https://github.com/new>.
2. **Repository name**: `dnt-harve-fitness`. Chọn **Public** (GitHub Pages miễn phí cần Public).
3. Không tích thêm gì, bấm **Create repository**.
4. Gửi cho Claude tên kho, dạng `tên-github/dnt-harve-fitness`. Claude sẽ đẩy code lên giúp bạn.
5. Trong kho vừa tạo: **Settings → Pages → Build and deployment → Source** chọn **GitHub Actions**.

> Dữ liệu người dùng **không** nằm trong kho này, mà nằm trong Firebase và được bảo vệ bằng đăng nhập. Kho Public chỉ chứa code giao diện.

## Bước 2: Tạo dự án Firebase

1. Vào <https://console.firebase.google.com> và đăng nhập bằng Gmail của bạn.
2. Bấm **Create a project** (Tạo dự án), đặt tên `dnt-harve-fitness`. Google Analytics có thể tắt. Bấm **Create**.
3. Ở trang tổng quan dự án, bấm biểu tượng **Web `</>`** để thêm ứng dụng web. Đặt tên `web`, **không** tích Firebase Hosting, rồi bấm **Register app**.
4. Firebase hiện một đoạn `const firebaseConfig = { apiKey: "...", authDomain: "...", ... }`. **Copy cả đoạn đó gửi cho Claude**, hoặc tự dán từng giá trị vào file `public/config.js`.

> Đoạn cấu hình này **không phải mật khẩu**. Nó được thiết kế để nằm công khai trong website. Dữ liệu được bảo vệ bởi quy tắc ở Bước 4.

## Bước 3: Bật đăng nhập Google

1. Menu trái chọn **Build → Authentication**, rồi bấm **Get started**.
2. Tab **Sign-in method** → chọn **Google** → bật **Enable** → chọn email hỗ trợ (Gmail của bạn) → **Save**.
3. Tab **Settings → Authorized domains** → **Add domain** → nhập `ngletam123.github.io` → **Add**.

## Bước 4: Tạo cơ sở dữ liệu

1. Menu trái chọn **Build → Firestore Database**, rồi bấm **Create database**.
2. **Location**: chọn `asia-southeast1 (Singapore)` cho nhanh ở Việt Nam. Bấm **Next**.
3. Chọn **Start in production mode** → **Create**.
4. Sang tab **Rules**, xóa hết nội dung cũ, dán đoạn dưới đây rồi bấm **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

Quy tắc này nghĩa là mỗi người chỉ đọc và ghi được dữ liệu của chính mình. Bạn bè không xem được của nhau, kể cả bạn.

## Bước 5: Bật Gemini (PT AI)

1. Menu trái tìm mục **AI Logic** (thường nằm trong nhóm **AI** hoặc **Build**). Bấm **Get started**.
2. Chọn **Gemini Developer API** (gói miễn phí, không cần thẻ thanh toán) → làm theo các bước để bật API.
3. Không cần tạo hay copy API key: Firebase tự quản lý key, website không chứa key nào.

## Bước 6: Mở website

Sau khi Claude đẩy code lên (hoặc bạn sửa `public/config.js` trên GitHub), đợi 1–2 phút để GitHub tự build. Kiểm tra ở tab **Actions** trong kho (dấu ✓ xanh là xong). Rồi mở:

```
https://ngletam123.github.io/dnt-harve-fitness-provip/
```

**Thêm vào màn hình chính như app:**
- iPhone: mở bằng **Safari** → nút **Chia sẻ** → **Thêm vào MH chính**.
- Android: mở bằng **Chrome** → menu **⋮** → **Thêm vào màn hình chính**.

---

## Chỉ cho bạn bè được mời đăng nhập (không bắt buộc)

Mặc định ai có tài khoản Google cũng đăng nhập được, nhưng mỗi người chỉ thấy dữ liệu của mình. Muốn giới hạn người dùng thì sửa `public/config.js`:

```js
allowedEmails: ["ban@gmail.com", "banthan@gmail.com"],
```

## Gặp lỗi?

| Hiện tượng | Cách sửa |
| --- | --- |
| Bấm đăng nhập báo "Tên miền chưa được thêm…" | Làm lại Bước 3, mục 3 (Authorized domains). |
| Đăng nhập xong báo "Không tải được dữ liệu" | Chưa tạo Firestore hoặc chưa dán Rules (Bước 4). |
| Chat báo "Chưa bật Firebase AI Logic" | Làm Bước 5. |
| Chat báo "hết lượt miễn phí" | Gemini miễn phí giới hạn số câu hỏi mỗi phút. Đợi 1 phút rồi hỏi lại. |
| Chat báo lỗi model không tồn tại | Google đổi tên model. Sửa `geminiModels` trong `public/config.js` (xem tên mới ở trang AI Logic). |
| Trang trắng sau khi sửa config | Kiểm tra dấu phẩy, dấu ngoặc kép trong `public/config.js`. |
| Ảnh bài tập không hiện | Kiểm tra mạng. Ảnh tải từ GitHub (free-exercise-db). |

## Giới hạn miễn phí cần biết

- **Firestore**: 50.000 lượt đọc, 20.000 lượt ghi mỗi ngày, 1 GB dữ liệu. Thừa cho vài chục người dùng.
- **Gemini Developer API (miễn phí)**: giới hạn số câu hỏi mỗi phút và mỗi ngày theo từng model. Google có thể thay đổi mức này. Nếu nhóm dùng nhiều, có thể nâng lên gói Blaze (trả theo dùng) trong Firebase.
- **Lưu ý**: ở gói miễn phí, Google có thể dùng nội dung câu hỏi gửi Gemini để cải thiện sản phẩm. Đừng nhập thông tin nhạy cảm vào chat.

---

## Lấy số bước từ app Sức khỏe (iPhone)

Website không đọc trực tiếp được app Sức khỏe (Apple chỉ cho app cài từ App Store đọc). Cách làm: tạo một **Phím tắt** tên `DNT Health`. Phím tắt đọc số bước và quãng đường hôm nay, rồi mở `https://ngletam123.github.io/DNT-HARVE-FITNESS-PROVIP/#health-<số bước>-<km>`. Website nhận số liệu và lưu vào tài khoản.

Hướng dẫn từng bước có ngay trong web: **Trang chủ → thẻ "Bước chân hôm nay" → Cách kết nối**. Sau khi tạo phím tắt, nút **Cập nhật từ Apple Health** sẽ tự chạy phím tắt đó.
