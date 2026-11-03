// ============================================================================
//  DNT & HARVE FITNESS – cấu hình
//  Dán cấu hình Firebase của bạn vào đây (xem HUONG-DAN.md, bước 2).
//  Để trống apiKey thì website chạy ở "chế độ thử" (lưu trên máy, không có AI).
// ============================================================================
window.APP_CONFIG = {
  firebase: {
    apiKey: "AIzaSyDagWi4QFWk0a2uapwCPiwxgjNKXie8Oyo",
    authDomain: "dnt-harve-fitness.firebaseapp.com",
    projectId: "dnt-harve-fitness",
    storageBucket: "dnt-harve-fitness.firebasestorage.app",
    messagingSenderId: "632325348206",
    appId: "1:632325348206:web:114bffbc7b3f7f0ecfff7f",
  },

  // Model Gemini, thử lần lượt từ trái sang phải.
  geminiModels: ["gemini-3.5-flash", "gemini-3.5-flash-lite"],

  // Chỉ cho các email này đăng nhập. Để trống [] = ai có tài khoản Google cũng vào được
  // (dữ liệu vẫn riêng từng người). VD: ["ban@gmail.com", "banbe@gmail.com"]
  allowedEmails: [],

  // Nguồn ảnh bài tập (free-exercise-db, public domain)
  exerciseImageBase: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/",
};
