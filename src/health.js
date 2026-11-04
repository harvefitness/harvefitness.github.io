// Apple Health steps via an iOS Shortcut.
// Websites cannot read HealthKit, so the "DNT Health" shortcut reads today's steps and walking distance.
// Two ways to hand them over:
//  - Cách 3 (recommended): the shortcut writes them to Firestore inbox/{secret key} over REST, without
//    opening Safari; the app reads that inbox whenever it comes back to the screen.
//  - Cách 1/2: the shortcut opens <site>/#health-<steps>-<km> (opens in Safari, not the home-screen app).
import { A, saveLater } from "./state.js";
import { esc, fmt, today, addDays, shortDate, openSheet, toast, bar } from "./ui.js";
import * as S from "./store.js";
import { ls } from "./store.js";

const cfg = window.APP_CONFIG || {};
let inboxKey = null;
/** The person's secret inbox key (created the first time they open the guide). */
async function getInboxKey(create = false) {
  if (S.DEMO) return null;
  if (inboxKey) return inboxKey;
  const m = await S.get("meta", "health").catch(() => null);
  if (m?.inbox) return (inboxKey = m.inbox);
  if (!create) return null;
  const b = crypto.getRandomValues(new Uint8Array(24));
  inboxKey = btoa(String.fromCharCode(...b)).replace(/\+/g, "a").replace(/\//g, "b").replace(/=+$/, ""); // 32 letters/digits
  await S.set("meta", "health", { inbox: inboxKey });
  return inboxKey;
}
const inboxUrl = (key) => `https://firestore.googleapis.com/v1/projects/${cfg.firebase?.projectId || "PROJECT"}/databases/(default)/documents/inbox/${key}?key=${cfg.firebase?.apiKey || "KEY"}`;

/** "2026-11-04", "4/11/2026", "04.11.2026" → "2026-11-04"; missing → today; too old / future → null. */
function normDate(v) {
  const t = today();
  if (v == null || v === "") return t;
  const s = String(v);
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  let d = m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
  if (!d && (m = s.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{4})/))) d = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (!d) return t;
  return d <= t && d >= addDays(t, -3) ? d : null;
}

/** Read the inbox; save a new reading. Returns true when something changed (re-render home). */
export async function pullInbox() {
  try {
    const key = await getInboxKey();
    if (!key) return false;
    const d = await S.getInbox(key);
    if (!d) return false;
    const sig = JSON.stringify([d.date, d.steps, d.km]);
    if (ls.get("dnt_inbox_sig") === sig) return false;
    ls.set("dnt_inbox_sig", sig);
    const date = normDate(d.date);
    const r = sanitizeReading(parseLocaleNumber(d.steps, "thousands"), parseLocaleNumber(d.km, "decimal"));
    if (!date || r.steps == null) return false;
    const cur = A.health[date];
    if (cur && cur.steps === r.steps && (cur.km ?? null) === r.km) return false;
    saveSteps(date, r.steps, r.km, "apple", `inbox ${d.steps}|${d.km ?? ""}`.slice(0, 120));
    toast(`Đã nhận ${fmt(r.steps)} bước${r.km ? ` · ${fmt(r.km, 1)} km` : ""} từ Apple Health.`, "good");
    return true;
  } catch (e) {
    console.warn("inbox:", e?.code || e?.message);
    return false;
  }
}

export const SHORTCUT_NAME = "DNT Health";
export const shortcutRunUrl = () => `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`;
const siteUrl = () => location.href.split("#")[0];


/** "#health-8234-5,6" → { steps, km } or null */
/**
 * Parse a number written in any locale: "8234", "8.234", "8,234", "6,5", "6.549", "1.234,5", "1,234.5".
 * `ambiguous`: how to read a single separator followed by exactly 3 digits ("6.549"):
 * "thousands" (steps) or "decimal" (km).
 */
export function parseLocaleNumber(raw, ambiguous = "decimal") {
  let s = String(raw ?? "").replace(/[^\d.,]/g, "");
  if (!/\d/.test(s)) return null;
  const dots = (s.match(/\./g) || []).length, commas = (s.match(/,/g) || []).length;
  if (dots && commas) {
    const dec = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    s = s.split(dec === "." ? "," : ".").join("").replace(dec, ".");
  } else if (dots + commas > 1) {
    s = s.replace(/[.,]/g, ""); // several of the same separator → thousands
  } else if (dots + commas === 1) {
    const [i, f] = s.split(/[.,]/);
    s = f.length === 3 && ambiguous === "thousands" && i.length <= 3 ? i + f : `${i}.${f}`;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Keep only plausible daily values: ≤ 150.000 steps, ≤ 150 km (metres are converted). */
export function sanitizeReading(steps, km) {
  if (steps == null || steps < 0 || steps > 150000) steps = null;
  if (km != null) {
    const maxKm = steps ? Math.min(150, steps * 0.0025 + 1) : 150; // stride ≤ 2,5 m
    if (km > 150) km = km / 1000; // sent in metres
    // Still absurd → float noise from the shortcut (e.g. "6548999999999,4" = 6.549 km): scale down until plausible.
    if (km > 150) for (let i = 0; km > maxKm && i < 16; i++) km /= 10;
    if (km > 150 || km > maxKm || km < 0) km = null;
  }
  return { steps: steps != null ? Math.round(steps) : null, km: km != null ? Math.round(km * 100) / 100 : null };
}

/** "#health-8234-5,6" → { steps, km, raw } or null */
export function parseHealthHash(hash = location.hash) {
  let raw;
  try {
    raw = decodeURIComponent(hash);
  } catch {
    raw = hash;
  }
  const m = raw.match(/^#\/?health[-/]([^-/]+)(?:[-/]([^-/]+))?/i);
  if (!m) return null;
  const r = sanitizeReading(parseLocaleNumber(m[1], "thousands"), parseLocaleNumber(m[2], "decimal"));
  if (r.steps == null) return null;
  return { ...r, raw: raw.slice(0, 120) };
}

/** Remember an incoming reading until the person is signed in. */
export function stashIncoming() {
  const h = parseHealthHash();
  if (!h) return false;
  ls.set("dnt_health_pending", JSON.stringify({ ...h, date: today() }));
  history.replaceState(null, "", siteUrl() + "#home");
  return true;
}

/** Save a stashed reading (call after profile is loaded). */
export function applyPending() {
  let p;
  try {
    p = JSON.parse(ls.get("dnt_health_pending") || "null");
  } catch {}
  if (!p) return;
  ls.del("dnt_health_pending");
  saveSteps(p.date, p.steps, p.km, "apple", p.raw);
  toast(`Đã nhận ${fmt(p.steps)} bước${p.km ? ` · ${fmt(p.km, 1)} km` : ""} từ Apple Health.`, "good");
}

export function saveSteps(date, steps, km, source = "manual", raw = "") {
  A.health[date] = { date, steps, km: km ?? null, source, at: Date.now(), ...(raw ? { raw } : {}) };
  saveLater("health", date, () => A.health[date], 0);
}

export const stepGoal = () => (["cut", "recomp"].includes(A.profile?.goal) ? 10000 : 8000);
/** Rough kcal burned by walking: ~0.5 kcal per kg per 1.000 steps. */
export const stepKcal = (steps) => Math.round((steps / 1000) * 0.5 * (+A.profile?.weight || 60));

export function stepsCard() {
  const d = today();
  const stored = A.health[d];
  const h = stored ? { ...stored, km: sanitizeReading(stored.steps, stored.km).km } : null;
  const goal = stepGoal();
  const steps = h?.steps || 0;
  const week = Array.from({ length: 7 }, (_, i) => addDays(d, i - 6)).map((x) => ({ d: x, s: A.health[x]?.steps || 0 }));
  const max = Math.max(goal, ...week.map((w) => w.s));
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return `<section class="card steps-card">
    <div class="row between"><span class="eyebrow">Bước chân hôm nay</span>${h?.at ? `<span class="muted sm">${h.source === "apple" ? "Apple Health" : "Nhập tay"} · ${new Date(h.at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>` : ""}</div>
    <div class="steps-row"><b class="steps-big">${fmt(steps)}</b><span class="muted">/ ${fmt(goal)} bước${h?.km ? ` · ${fmt(h.km, 1)} km` : ""}${steps ? ` · ~${fmt(stepKcal(steps))} kcal` : ""}</span></div>
    ${bar((steps / goal) * 100)}
    <div class="spark" aria-label="Bước chân 7 ngày">${week.map((w) => `<span title="${shortDate(w.d)}: ${fmt(w.s)} bước" style="--h:${Math.max(4, (w.s / max) * 100)}%" class="${w.s >= goal ? "hit" : ""}${w.d === d ? " now" : ""}"></span>`).join("")}</div>
    <div class="row gap wrap">
      ${isIOS ? `<a class="primary sm" href="${shortcutRunUrl()}" data-act="health-run">Cập nhật từ Apple Health</a>` : ""}
      <button class="ghost sm" data-act="health-manual">Nhập tay</button>
      ${isIOS ? `<button class="link" data-act="health-guide">Cách kết nối</button>` : ""}
    </div>
  </section>`;
}

export function openManual(after) {
  const d = today();
  const body = openSheet(`<h2>Nhập <em>bước chân.</em></h2>
    <form id="hm" class="grid2">
      <label class="fld"><span>Số bước hôm nay</span><input id="hm-s" inputmode="numeric" value="${esc(A.health[d]?.steps ?? "")}"></label>
      <label class="fld"><span>Quãng đường (km)</span><input id="hm-k" inputmode="decimal" value="${esc(A.health[d]?.km ?? "")}"></label>
      <button class="primary block full" type="submit">Lưu</button>
    </form>`);
  body.querySelector("#hm").onsubmit = (e) => {
    e.preventDefault();
    const s = parseLocaleNumber(body.querySelector("#hm-s").value, "thousands");
    if (s == null) return toast("Nhập số bước.", "bad");
    const r = sanitizeReading(s, parseLocaleNumber(body.querySelector("#hm-k").value, "decimal"));
    if (r.steps == null) return toast("Số bước không hợp lệ.", "bad");
    saveSteps(d, r.steps, r.km, "manual");
    body.closest(".sheet-wrap").querySelector("[data-close]").click();
    toast("Đã lưu bước chân.", "good");
    after?.();
  };
}

export async function openGuide() {
  const url = `${siteUrl()}#health-`;
  const key = await getInboxKey(true).catch(() => null);
  const api = key ? inboxUrl(key) : "";
  const desc3 = `Tìm TẤT CẢ mẫu sức khỏe loại Số bước có ngày bắt đầu là hôm nay (không giới hạn số lượng), Tính toán thống kê TỔNG, làm tròn thành số nguyên. Tìm TẤT CẢ mẫu loại Quãng đường đi bộ + chạy của hôm nay, tính TỔNG, đổi sang km, làm tròn 2 chữ số thập phân. Lấy Ngày hiện tại, định dạng tùy chỉnh yyyy-MM-dd. Sau đó dùng tác vụ Nhận nội dung của URL với URL: ${api} , Phương thức PATCH, Tiêu đề: Content-Type = application/json và Referer = https://harvefitness.github.io/ , Nội dung yêu cầu JSON có 1 khóa "fields" là Từ điển gồm 3 khóa: "steps" là Từ điển có khóa "stringValue" = tổng số bước (dạng Văn bản); "km" là Từ điển có khóa "stringValue" = tổng km (dạng Văn bản); "date" là Từ điển có khóa "stringValue" = ngày đã định dạng (dạng Văn bản). KHÔNG mở URL, KHÔNG mở Safari. Cuối cùng Hiển thị thông báo: Đã gửi [tổng số bước] bước lên HARVE Fitness.`;
  const desc = `Tìm TẤT CẢ mẫu sức khỏe loại Số bước có ngày bắt đầu là hôm nay (không giới hạn số lượng), rồi Tính toán thống kê: TỔNG, làm tròn thành số nguyên không có dấu phân cách. Tìm TẤT CẢ mẫu loại Quãng đường đi bộ + chạy của hôm nay, tính TỔNG, đổi sang km, làm tròn 1 chữ số thập phân. Sau đó mở URL: ${url}[tổng số bước]-[tổng km]`;
  const body = openSheet(`<h2>Kết nối <em>Apple Health.</em></h2>
    <p class="muted">Làm 1 lần trên <b>iPhone</b> (không phải Mac, vì số bước nằm trong app Sức khỏe của iPhone). Phím tắt đọc số bước và quãng đường hôm nay rồi gửi cho website. Không cần cài thêm app.</p>
    <div class="seg full"><button class="seg-b" data-way="3" aria-pressed="true">Cách 3 ⭐</button><button class="seg-b" data-way="2" aria-pressed="false">Cách 2</button><button class="seg-b" data-way="1" aria-pressed="false">Cách 1</button></div>

    <section class="way" data-way-body="3">
      <h3>Cách 3: <em>Không mở Safari</em> (khuyên dùng)</h3>
      <p class="muted sm">Phím tắt gửi số bước thẳng lên máy chủ của web, không mở Safari. Khi bạn quay lại <b>HARVE Fitness</b> trên màn hình chính, số bước tự hiện. Đoạn mô tả có <b>mã riêng của bạn</b>, đừng gửi cho người khác.</p>
      ${key ? `<ol class="guide">
        <li>Mở app <b>Phím tắt</b> → nếu đã có phím tắt <b>${SHORTCUT_NAME}</b> cũ: bấm giữ → <b>Xóa</b>.</li>
        <li>Bấm <b>+</b> → bấm ô <b>"Mô tả phím tắt"</b> → dán đoạn mô tả bên dưới (nút <b>Sao chép mô tả</b>) → bấm <b>↵</b>.</li>
        <li>Đổi tên phím tắt thành đúng <b class="hl">${SHORTCUT_NAME}</b>.</li>
        <li>Bấm ▶ chạy thử. Cho phép đọc <b>Số bước</b>, <b>Quãng đường</b> và chọn <b>Luôn cho phép</b> kết nối tới <b>firestore.googleapis.com</b>. Thấy thông báo <b>"Đã gửi … bước"</b> là được.</li>
        <li>Mở <b>HARVE Fitness</b> từ màn hình chính: web báo <b>"Đã nhận … bước"</b>.</li>
      </ol>
      <div class="desc-box">${esc(desc3)}</div>
      <button class="primary block" data-copy="desc3">Sao chép mô tả</button>
      <div class="note">Bấm <b>Cập nhật từ Apple Health</b> trong web: iPhone mở app Phím tắt chạy xong, bấm <b>◀ HARVE Fitness</b> ở góc trên bên trái để quay lại web (iPhone không cho phím tắt tự mở lại web trên màn hình chính). Muốn khỏi bấm: làm <b>Tự động hóa</b> bên dưới, phím tắt chạy ngầm, mở web là có số mới.</div>
      <div class="note">Nếu chạy thử báo lỗi: bấm <b>Sửa</b>, kiểm tra tác vụ <b>Nhận nội dung của URL</b>: Phương thức <b>PATCH</b>, nội dung <b>JSON</b> có <code>fields → steps → stringValue</code>, <code>fields → km → stringValue</code>, <code>fields → date → stringValue</code>.</div>` : `<div class="note">Cần đăng nhập để tạo mã riêng.</div>`}
    </section>

    <section class="way" data-way-body="1" hidden>
      <h3>Cách 1: <em>Tạo từng tác vụ</em></h3>
      <p class="muted sm">Dùng khi app Phím tắt có màn hình "Thêm tác vụ" (iOS cũ hơn, hoặc bấm <b>Sửa</b> ở iOS mới).</p>
      <ol class="guide">
        <li>Mở app <b>Phím tắt (Shortcuts)</b> → bấm <b>+</b> ở góc phải → đặt tên phím tắt là <b class="hl">${SHORTCUT_NAME}</b> (đúng chữ hoa, có dấu cách).</li>
        <li><b>Thêm tác vụ</b> → tìm <b>"Tìm mẫu sức khỏe"</b> (Find Health Samples) → bấm vào chữ <b>Loại</b> chọn <b>Số bước (Steps)</b> → thêm bộ lọc <b>Ngày bắt đầu · là hôm nay</b> (Start Date · is today).</li>
        <li>Thêm tác vụ <b>"Tính toán thống kê"</b> (Calculate Statistics) → chọn <b>Tổng (Sum)</b>.</li>
        <li>Thêm tác vụ <b>"Làm tròn số"</b> (Round Number).</li>
        <li>Thêm tác vụ <b>"URL"</b>, gõ: <code>${esc(url)}</code> rồi chèn biến <b>Số đã làm tròn</b> (Rounded Number) vào ngay sau dấu gạch cuối.</li>
        <li>Thêm tác vụ <b>"Mở URL"</b> (Open URLs).</li>
        <li>Bấm ▶ chạy thử. Lần đầu iPhone hỏi quyền đọc Sức khỏe, chọn <b>Cho phép</b>. Website sẽ mở và báo "Đã nhận … bước".</li>
      </ol>
      <div class="note">Muốn có cả số km: lặp lại bước 2–3 với loại <b>Quãng đường đi bộ + chạy</b> (Walking + Running Distance), rồi ở bước 5 thêm dấu <b>-</b> và biến số km phía sau. Ví dụ: <code>…#health-8234-5,6</code></div>
      <button class="primary block" data-copy="url">Sao chép link cho bước 5</button>
    </section>

    <section class="way" data-way-body="2" hidden>
      <h3>Cách 2: <em>Gõ mô tả (iOS mới)</em></h3>
      <p class="muted sm">Dùng khi bấm <b>+</b> trong app Phím tắt hiện câu hỏi <b>"Bạn muốn phím tắt thực hiện tác vụ gì?"</b> và ô <b>Mô tả phím tắt</b>.</p>
      <ol class="guide">
        <li>Mở app <b>Phím tắt</b> trên iPhone → bấm <b>+</b>.</li>
        <li>Bấm vào ô <b>"Mô tả phím tắt"</b>, dán đoạn mô tả bên dưới (bấm nút <b>Sao chép mô tả</b>) → bấm <b>↵</b>.</li>
        <li>Đặt tên: bấm vào tên <b>"Phím tắt mới ˅"</b> ở trên cùng → <b>Đổi tên</b> → gõ đúng <b class="hl">${SHORTCUT_NAME}</b>.</li>
        <li>Bấm chạy thử. Lần đầu iPhone hỏi quyền đọc Sức khỏe: <b>Cho phép</b> cả <b>Số bước</b> và <b>Quãng đường đi bộ + chạy</b>.</li>
        <li>Safari mở website và báo <b>"Đã nhận … bước · … km từ Apple Health"</b> là xong.</li>
      </ol>
      <div class="desc-box">${esc(desc)}</div>
      <button class="primary block" data-copy="desc">Sao chép mô tả</button>
      <div class="note">Nếu chạy thử không ra: bấm <b>Sửa</b> (góc trên bên phải) để xem các bước iPhone đã tạo, kiểm tra tác vụ <b>Mở URL</b> có dạng <code>…#health-</code> rồi đến số bước, dấu <b>-</b>, số km. Hoặc dùng Cách 1.</div>
    </section>

    <div class="note">Tự động: app Phím tắt → tab <b>Tự động hóa</b> → <b>+</b> → <b>Thời gian trong ngày</b> (vd 12:00, 18:00, 22:00, mỗi mốc 1 tự động hóa) → chọn <b>Chạy ngay</b> → chọn phím tắt <b>${SHORTCUT_NAME}</b>. Với Cách 3, phím tắt chạy ngầm, không mở gì.</div>`);
  body.addEventListener("click", async (e) => {
    const w = e.target.closest("[data-way]");
    if (w) {
      body.querySelectorAll("[data-way]").forEach((b) => b.setAttribute("aria-pressed", b === w));
      body.querySelectorAll("[data-way-body]").forEach((s) => (s.hidden = s.dataset.wayBody !== w.dataset.way));
      return;
    }
    const c = e.target.closest("[data-copy]");
    if (!c) return;
    const text = c.dataset.copy === "url" ? url : c.dataset.copy === "desc3" ? desc3 : desc;
    try {
      await navigator.clipboard.writeText(text);
      c.textContent = "Đã sao chép ✓";
    } catch {
      toast("Không sao chép được, hãy bấm giữ vào đoạn chữ để chọn và sao chép.", "bad");
    }
  });
}

export function stepsContext() {
  const d = today();
  const t = A.health[d], y = A.health[addDays(d, -1)];
  const week = Array.from({ length: 7 }, (_, i) => A.health[addDays(d, -i)]?.steps).filter((x) => x != null);
  const avg = week.length ? Math.round(week.reduce((a, b) => a + b, 0) / week.length) : null;
  return `- Bước chân (Apple Health/nhập tay): hôm nay ${t ? t.steps + " bước" + (t.km ? `, ${t.km} km` : "") : "chưa có"}; hôm qua ${y ? y.steps : "chưa có"}; trung bình 7 ngày ${avg ?? "chưa có"}. Mục tiêu ${stepGoal()} bước.`;
}
