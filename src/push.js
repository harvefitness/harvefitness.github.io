// Push reminders (Firebase Cloud Messaging web push).
// The phone registers here; the "postman" (tools/notify.mjs on GitHub Actions, every 30 min)
// reads users/{uid}/meta/push and sends the reminders that are due.
import { A } from "./state.js";
import * as S from "./store.js";
import { esc, openSheet, closeSheet, toast } from "./ui.js";

const cfg = window.APP_CONFIG || {};
export const PUSH_KINDS = {
  train: ["Giờ tập", "30 phút trước giờ tập / chơi thể thao"],
  coach: ["PT nhắc tăng tạ", "Sáng ngày tập: bài nào nên tăng tạ, tăng số lần"],
  water: ["Uống nước", "Khi uống chưa đủ theo giờ trong ngày"],
  meals: ["Ghi bữa ăn", "Khi chưa ghi bữa nào, và tổng kết đạm buổi tối"],
  missed: ["Chưa tập", "Buổi tối nếu buổi tập hôm nay chưa xong"],
};

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
export const pushConfigured = () => !S.DEMO && !!cfg.push?.vapidKey;
export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

let state = null; // { tokens:[], prefs:{}, tz }
async function load() {
  if (state) return state;
  state = (await S.get("meta", "push").catch(() => null)) || { tokens: [], prefs: {} };
  state.prefs = { train: true, coach: true, water: true, meals: true, missed: true, ...(state.prefs || {}) };
  return state;
}
export async function pushEnabled() {
  if (!pushConfigured() || !pushSupported() || Notification.permission !== "granted") return false;
  return !!(await load()).tokens?.length;
}

async function getFcmToken() {
  const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
  if (!(await isSupported())) throw Object.assign(new Error("unsupported"), { code: "unsupported" });
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("sw.js"));
  await navigator.serviceWorker.ready;
  return getToken(getMessaging(S.firebaseApp()), { vapidKey: cfg.push.vapidKey, serviceWorkerRegistration: reg });
}

async function save() {
  state.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh";
  state.updatedAt = Date.now();
  await S.set("meta", "push", state);
}

/** Ask permission, register this phone, store the token. Must run from a tap. */
export async function enablePush() {
  if (isIOS() && !standalone()) throw Object.assign(new Error("ios-home"), { code: "ios-home" });
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw Object.assign(new Error("denied"), { code: "denied" });
  const token = await getFcmToken();
  await load();
  state.tokens = [...new Set([token, ...(state.tokens || [])])].slice(0, 5); // up to 5 devices
  await save();
  return true;
}
/** Refresh the token silently on start-up (tokens can rotate). */
export async function refreshPush() {
  try {
    if (!(await pushEnabled())) return;
    const token = await getFcmToken();
    if (!state.tokens.includes(token)) {
      state.tokens = [token, ...state.tokens].slice(0, 5);
      await save();
    }
  } catch {}
}

const errText = (e) =>
  ({
    "ios-home": "Trên iPhone, hãy thêm web ra màn hình chính trước (Safari → Chia sẻ → Thêm vào MH chính), rồi mở web từ biểu tượng đó và bật lại.",
    denied: "Bạn đã chặn thông báo. Vào Cài đặt → Thông báo → DNT&HARVE (hoặc cài đặt trình duyệt) để cho phép, rồi thử lại.",
    unsupported: "Trình duyệt này chưa hỗ trợ thông báo. Trên iPhone cần iOS 16.4 trở lên và mở từ màn hình chính.",
  })[e?.code] || "Chưa bật được nhắc nhở: " + (e?.message || e);

/** Settings sheet: enable + choose reminder kinds. */
export async function openPushSettings(after) {
  if (!pushConfigured()) return toast("Nhắc nhở chưa được cài đặt trên website.", "bad");
  await load();
  const on = await pushEnabled();
  const body = openSheet(`<span class="eyebrow">Thông báo trên điện thoại</span>
    <h2>Nhắc <em>nhở.</em></h2>
    <p class="muted">${on ? "Điện thoại này đang nhận nhắc nhở. Chọn loại bạn muốn nhận:" : "Nhận nhắc giờ tập, uống nước, ghi bữa ăn ngay trên màn hình khóa. Không nhắc trong giờ ngủ, mỗi loại tối đa 1 lần mỗi mốc."}</p>
    ${isIOS() && !standalone() ? `<div class="note">iPhone chỉ nhận thông báo khi bạn <b>thêm web ra màn hình chính</b> (Safari → nút Chia sẻ → <b>Thêm vào MH chính</b>) và mở web từ biểu tượng đó.</div>` : ""}
    <div class="push-list">${Object.entries(PUSH_KINDS)
      .map(([k, [t, d]]) => `<label class="push-row"><span><b>${esc(t)}</b><small>${esc(d)}</small></span><input type="checkbox" id="pk-${k}" data-pk="${k}" ${state.prefs[k] ? "checked" : ""}></label>`)
      .join("")}</div>
    ${on ? `<button class="ghost block" id="push-test">Gửi thử 1 thông báo</button>` : `<button class="primary block" id="push-on">Bật nhắc nhở</button>`}`);
  body.addEventListener("change", async (e) => {
    const k = e.target.dataset.pk;
    if (!k) return;
    state.prefs[k] = e.target.checked;
    await save().catch(() => toast("Không lưu được, kiểm tra mạng.", "bad"));
  });
  body.querySelector("#push-on")?.addEventListener("click", async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    b.textContent = "Đang bật…";
    try {
      await enablePush();
      toast("Đã bật nhắc nhở trên điện thoại này.", "good");
      closeSheet();
      after?.();
    } catch (err) {
      b.disabled = false;
      b.textContent = "Bật nhắc nhở";
      toast(errText(err), "bad");
    }
  });
  body.querySelector("#push-test")?.addEventListener("click", async () => {
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification("DNT & HARVE FITNESS", { body: `Chào ${A.profile?.name || "bạn"}! Nhắc nhở đang hoạt động 💪`, icon: "icon-192.png", badge: "icon-192.png", data: { url: "./#home" } });
  });
}

/** Small card for the home page when reminders are not on yet. */
export async function pushCard() {
  if (!pushConfigured() || !pushSupported()) return "";
  if (await pushEnabled()) return "";
  return `<section class="card push-card"><div><span class="eyebrow">Nhắc nhở</span><p>Nhận nhắc giờ tập, uống nước, ghi bữa ăn trên màn hình khóa.</p></div><button class="primary sm" data-act="push-open">Bật</button></section>`;
}
