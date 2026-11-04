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
const inboxUrl = (key) => `https://firestore.googleapis.com/v1/projects/${cfg.firebase?.projectId || "PROJECT"}/databases/(default)/documents/inbox/${key}`;

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

/** Remember when "Cập nhật từ Apple Health" was tapped: that time is shown on the steps card. */
export function markTap() {
  ls.set("dnt_health_tap", String(Date.now()));
}
function takeTap() {
  const t = +ls.get("dnt_health_tap") || 0;
  ls.del("dnt_health_tap");
  return Date.now() - t < 15 * 60e3 ? t : 0; // tapped in the last 15 minutes
}

/** Read the inbox; save a new reading. Returns true when something changed (re-render home). */
export async function pullInbox() {
  try {
    const key = await getInboxKey();
    if (!key) return false;
    const d = await S.getInbox(key);
    if (!d) return false;
    const tap = takeTap();
    const sig = JSON.stringify([d.date, d.steps, d.km]);
    if (ls.get("dnt_inbox_sig") === sig && !tap) return false;
    ls.set("dnt_inbox_sig", sig);
    const date = normDate(d.date);
    const r = sanitizeReading(parseLocaleNumber(d.steps, "thousands"), parseLocaleNumber(d.km, "decimal"));
    if (!date || r.steps == null) return false;
    const cur = A.health[date];
    if (cur && cur.steps === r.steps && (cur.km ?? null) === r.km) {
      if (!tap || date !== today()) return false;
      cur.at = tap; // same numbers (did not walk): still show the time of this update
      cur.source = "apple";
      saveLater("health", date, () => A.health[date], 0);
      toast(`Đã cập nhật: vẫn ${fmt(r.steps)} bước.`, "good");
      return true;
    }
    saveSteps(date, r.steps, r.km, "apple", `inbox ${d.steps}|${d.km ?? ""}`.slice(0, 120), tap || undefined);
    toast(`Đã nhận ${fmt(r.steps)} bước${r.km ? ` · ${fmt(r.km, 1)} km` : ""} từ Apple Health.`, "good");
    return true;
  } catch (e) {
    console.warn("inbox:", e?.code || e?.message);
    return false;
  }
}

export const SHORTCUT_NAME = "DNT Health";
const JSON_TPL = '{"fields":{"steps":{"stringValue":"SO_BUOC"}}}';
const siteUrl = () => location.href.split("#")[0];
// iOS 26+: "webapp://<site>" opens the home-screen web app (https:// would open Safari, whose storage is separate).
const webappUrl = (hash = "#home") => siteUrl().replace(/^https?:\/\//, "webapp://") + hash;
// Plain run (the shortcut's last action "Mở URL webapp://…#health-<steps>" brings the app back).
export const shortcutRunUrl = () => `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`;


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
  saveSteps(p.date, p.steps, p.km, "apple", p.raw, takeTap() || undefined);
  toast(`Đã nhận ${fmt(p.steps)} bước${p.km ? ` · ${fmt(p.km, 1)} km` : ""} từ Apple Health.`, "good");
}

export function saveSteps(date, steps, km, source = "manual", raw = "", at = Date.now()) {
  A.health[date] = { date, steps, km: km ?? null, source, at, ...(raw ? { raw } : {}) };
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
  const key = await getInboxKey(true).catch(() => null);
  const api = key ? inboxUrl(key) : "";
  const openUrl = webappUrl("#health-"); // + the steps variable
  const desc2 = `Tìm TẤT CẢ mẫu sức khỏe loại Số bước có ngày bắt đầu là hôm nay, tắt giới hạn số lượng. Tính toán thống kê TỔNG (không phải trung bình) của các mẫu đó, rồi Làm tròn số thành số nguyên. Tạo tác vụ Văn bản có đúng nội dung: {"fields":{"steps":{"stringValue":"[số đã làm tròn]"}}} . Sau đó dùng tác vụ Nhận nội dung của URL với URL: ${api} , Phương thức PATCH, Nội dung yêu cầu là Tệp = tác vụ Văn bản ở trên. Cuối cùng Mở URL: ${openUrl}[số đã làm tròn]`;
  const S1 = "<b>1</b>", S2 = "<b>2</b>", S3 = "<b>3</b>";
  const body = openSheet(`<h2>Kết nối <em>Apple Health.</em></h2>
    <p class="muted">Web không tự đọc được app Sức khỏe, nên cần 1 phím tắt nhỏ trên <b>iPhone</b>. Làm 1 lần, khoảng 5 phút. Phím tắt gửi số bước lên web rồi mở lại app <b>HARVE Fitness</b> trên màn hình chính, không qua Safari.</p>
    ${key ? `<div class="seg full"><button class="seg-b" data-way="1" aria-pressed="true">Cách 1 ⭐</button><button class="seg-b" data-way="2" aria-pressed="false">Cách 2</button></div>

    <section class="way" data-way-body="1">
      <h3>Cách 1: <em>Thêm từng tác vụ</em></h3>
      <p class="muted sm">Dùng được trên mọi iPhone. Mở app <b>Phím tắt</b> → bấm <b>+</b> → đổi tên thành <b class="hl">${SHORTCUT_NAME}</b>. Gõ tên từng tác vụ vào ô <b>Tìm kiếm tác vụ</b>, chạm để thêm, lần lượt từ trên xuống:</p>
      <ol class="guide">
        <li><b>Tìm mẫu sức khỏe</b> → chạm <b>Loại</b> chọn <b>Số bước</b> (Steps) → <b>Ngày bắt đầu</b> chọn <b>hôm nay</b> → <b>Giới hạn</b>: tắt.</li>
        <li><b>Tính toán thống kê</b> → chạm chữ <b>Trung bình</b>, đổi thành <b>Tổng</b>. <small class="muted">(Để Trung bình là số bước bị sai.)</small></li>
        <li><b>Làm tròn số</b> → để <b>Số nguyên</b>.</li>
        <li><b>Văn bản</b> → dán nội dung ở nút ${S1} → bấm đúp chữ <code>SO_BUOC</code> → chọn biến <b>Số đã làm tròn</b> ở thanh trên bàn phím để thay vào.</li>
        <li><b>Nhận nội dung của URL</b> → chạm <b>URL</b>, dán địa chỉ ở nút ${S2} → chạm <b>›</b> mở rộng → <b>Phương thức</b>: <b>PATCH</b> → <b>Nội dung yêu cầu</b>: <b>Tệp</b> → chạm ô Tệp, chọn biến <b>Văn bản</b>.</li>
        <li><b>Mở URL</b> → chạm <b>URL</b>, dán địa chỉ ở nút ${S3} → ngay sau dấu <b>-</b> cuối, chọn biến <b>Số đã làm tròn</b>.</li>
        <li>Bấm <b>▶</b> chạy thử. iPhone hỏi quyền thì chọn <b>Cho phép</b>. App HARVE Fitness mở lên và báo <b>"Đã nhận … bước"</b> là xong.</li>
      </ol>
      <button class="primary block" data-copy="json">1 · Sao chép nội dung Văn bản</button>
      <button class="primary block" data-copy="api">2 · Sao chép địa chỉ gửi</button>
      <button class="primary block" data-copy="open">3 · Sao chép địa chỉ mở app</button>
      <div class="note"><b>Đã có phím tắt cũ?</b> Mở nó, bấm <b>Sửa</b>: đổi <b>Trung bình</b> → <b>Tổng</b>; xóa các tác vụ <b>URL</b>, <b>Mở URL</b>, <b>Dừng và tạo đầu ra</b> (bấm ⓧ); rồi thêm bước 4, 5, 6 ở trên.</div>
    </section>

    <section class="way" data-way-body="2" hidden>
      <h3>Cách 2: <em>Gõ mô tả</em></h3>
      <p class="muted sm">Dùng khi bấm <b>+</b> trong app Phím tắt có ô <b>Mô tả phím tắt</b> (máy có Apple Intelligence).</p>
      <ol class="guide">
        <li>Bấm <b>Sao chép mô tả</b> ở dưới.</li>
        <li>App <b>Phím tắt</b> → <b>+</b> → dán vào ô <b>Mô tả phím tắt</b> → <b>↵</b>.</li>
        <li>Đổi tên thành <b class="hl">${SHORTCUT_NAME}</b> → bấm <b>▶</b> chạy thử.</li>
        <li>Không ra: bấm <b>Sửa</b> và so với 6 tác vụ của Cách 1.</li>
      </ol>
      <div class="desc-box">${esc(desc2)}</div>
      <button class="primary block" data-copy="desc">Sao chép mô tả</button>
    </section>

    <p class="muted sm">Mã trong địa chỉ gửi là của riêng bạn, đừng gửi cho người khác.</p>
    <button class="ghost block" data-act="inbox-check">Kiểm tra: máy chủ đã nhận số bước chưa?</button>
    <div class="note"><b>Dùng hằng ngày:</b> bấm <b>Cập nhật từ Apple Health</b> trên web → phím tắt chạy → app tự mở lại với số mới. Giờ cạnh chữ Apple Health là giờ bạn bấm.</div>
    <div class="note"><b>Không tự mở lại app?</b> iPhone cần iOS 26 trở lên. Máy cũ hơn: chạy xong bấm <b>◀ HARVE Fitness</b> ở góc trên bên trái, số bước vẫn được cập nhật.</div>
    <div class="note"><b>Tự động, khỏi bấm:</b> Phím tắt → tab <b>Tự động hóa</b> → <b>+</b> → <b>Thời gian trong ngày</b> (vd 12:00, 18:00, 22:00) → <b>Chạy ngay</b> → chọn <b>${SHORTCUT_NAME}</b>.</div>` : `<div class="note">Cần đăng nhập để tạo mã riêng của bạn.</div>`}`);
  body.addEventListener("click", async (e) => {
    const w = e.target.closest("[data-way]");
    if (w) {
      body.querySelectorAll("[data-way]").forEach((b) => b.setAttribute("aria-pressed", b === w));
      body.querySelectorAll("[data-way-body]").forEach((s) => (s.hidden = s.dataset.wayBody !== w.dataset.way));
      return;
    }
    if (e.target.closest("[data-act=inbox-check]")) {
      try {
        const d = await S.getInbox(key);
        const n = d ? parseLocaleNumber(d.steps, "thousands") : null;
        toast(n != null ? `Máy chủ đã nhận: ${fmt(n)} bước. Phím tắt chạy đúng ✓` : "Máy chủ chưa nhận được số bước nào. Kiểm tra lại bước 4 và 5.", n != null ? "good" : "bad");
      } catch (err) {
        toast("Không kiểm tra được: " + (err?.code || err?.message), "bad");
      }
      return;
    }
    const c = e.target.closest("[data-copy]");
    if (!c) return;
    const text = { json: JSON_TPL, api, open: openUrl, desc: desc2 }[c.dataset.copy];
    try {
      await navigator.clipboard.writeText(text);
      c.innerHTML = "Đã sao chép ✓";
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
