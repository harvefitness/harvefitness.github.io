// Apple Health steps via an iOS Shortcut.
// Websites cannot read HealthKit, so the "DNT Health" shortcut reads today's steps and walking distance.
// Two ways to hand them over:
//  - Cách 3 (recommended): the shortcut writes them to Firestore inbox/{secret key} over REST, without
//    opening Safari; the app reads that inbox whenever it comes back to the screen.
//  - Cách 1/2: the shortcut opens <site>/#health-<steps>-<km> (opens in Safari, not the home-screen app).
import { A, saveLater } from "./state.js";
import { esc, fmt, today, addDays, shortDate, openSheet, toast, bar, ymd } from "./ui.js";
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
/** Create / load the key once at start-up so the "Cập nhật" link can carry it. */
export const ensureInboxKey = () => getInboxKey(true);
const FS = () => `https://firestore.googleapis.com/v1/projects/${cfg.firebase?.projectId || "dnt-harve-fitness"}/databases/(default)/documents`;
/** Collection of today's readings: inbox/{key}/dYYYYMMDD/{steps} (the shortcut creates one empty doc named by the step count). */
const dayId = (d = today()) => "d" + d.replace(/-/g, "");
const fsVal = (v) => (v ? Object.values(v)[0] : undefined);
/** Newest reading the shortcut sent: { steps, km, date, t } or null. Plain REST, no sign-in needed (secret key). */
async function readInbox(key) {
  const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [list, doc] = await Promise.all([get(`${FS()}/inbox/${key}/${dayId()}?pageSize=300`), get(`${FS()}/inbox/${key}`)]);
  const c = [];
  for (const d of list?.documents || []) c.push({ steps: d.name.split("/").pop(), date: today(), t: Date.parse(d.createTime) });
  if (doc?.fields) c.push({ steps: fsVal(doc.fields.steps), km: fsVal(doc.fields.km), date: fsVal(doc.fields.date), t: Date.parse(doc.updateTime) }); // older JSON version
  return c.filter((x) => x.steps != null && x.t).sort((a, b) => b.t - a.t)[0] || null;
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
  ls.set("dnt_health_diag", String(Date.now())); // check what arrived when the app comes back
}
function takeTap() {
  const t = +ls.get("dnt_health_tap") || 0;
  ls.del("dnt_health_tap");
  return Date.now() - t < 15 * 60e3 ? t : 0; // tapped in the last 15 minutes
}

/** Today's reading saved elsewhere (Safari, another phone) → show it without a reload. */
async function refreshToday() {
  try {
    const d = today();
    const s = await S.get("health", d);
    if (s?.steps != null && (s.at || 0) > (A.health[d]?.at || 0)) {
      A.health[d] = s;
      return true;
    }
  } catch {}
  return false;
}
/** Everything that can bring new steps: the shortcut's inbox and the database. */
export async function syncHealth() {
  const [a, b] = await Promise.all([pullInbox(), refreshToday()]);
  return a || b;
}

/** After "Cập nhật": if nothing arrived, explain exactly which part of the shortcut failed. */
let diagRunning = false;
export async function diagnoseReturn(rerender) {
  const tap = +ls.get("dnt_health_diag") || 0;
  if (!tap || Date.now() - tap > 10 * 60e3 || diagRunning) return;
  diagRunning = true;
  try {
    await diagnose(tap, rerender);
  } finally {
    diagRunning = false;
  }
}
async function diagnose(tap, rerender) {
  await new Promise((r) => setTimeout(r, 3500)); // the #health link / inbox may arrive a moment later
  if (+ls.get("dnt_health_diag") !== tap) return;
  if (await syncHealth()) rerender?.();
  let seen = null;
  try {
    seen = JSON.parse(ls.get("dnt_health_seen") || "null");
  } catch {}
  const opened = seen && seen.at >= tap;
  const h = A.health[today()];
  ls.del("dnt_health_diag");
  // Received ✓ — unless the shortcut reopened the app with a link that had no number in it.
  if (h && (h.at || 0) >= tap - 5000 && !(opened && !seen.ok)) return;
  let srv = null;
  try {
    const key = await getInboxKey();
    srv = key ? await readInbox(key) : null;
  } catch {}
  const srvSteps = srv ? parseLocaleNumber(srv.steps, "thousands") : null;
  const body = openSheet(`<h2>Chưa nhận được <em>số bước.</em></h2>
    <p class="muted">Web đã kiểm tra 2 đường phím tắt gửi số bước về:</p>
    <div class="diag"><b>${opened ? "⚠️" : "✗"} Mở lại app kèm số bước</b><p>${
      opened
        ? `Phím tắt có mở lại app nhưng <b>không kèm số bước</b> (nhận được: <code>${esc(seen.raw)}</code>). Trong tác vụ <b>Mở URL</b>, ngay sau dấu <b>-</b> cuối phải có biến <b>Số đã làm tròn</b>.`
        : `Phím tắt <b>không mở lại app</b> kèm số bước. Kiểm tra: tên phím tắt đúng <b>${SHORTCUT_NAME}</b>; tác vụ cuối là <b>Mở URL</b> với địa chỉ bắt đầu bằng <code>webapp://</code> (không phải https://); iPhone đã lên iOS 26.`
    }</p></div>
    <div class="diag"><b>${srvSteps != null ? "⚠️" : "✗"} Gửi lên máy chủ</b><p>${
      srvSteps != null
        ? `Máy chủ đang có <b>${fmt(srvSteps)} bước</b> nhưng không phải lần vừa bấm. Kiểm tra tác vụ <b>Lấy nội dung của URL</b> (xem Cách kết nối).`
        : `Máy chủ <b>chưa nhận được</b> số bước nào. Tác vụ <b>Lấy nội dung của URL</b> phải là: địa chỉ ở nút 1 + biến <b>Đầu vào phím tắt</b> + <code>?documentId=</code> + biến <b>Số được làm tròn</b>, Phương thức <b>POST</b>, không có Nội dung yêu cầu.`
    }</p></div>
    <p class="muted sm">Cũng kiểm tra tác vụ <b>Tính</b> phải là <b>Tổng</b>, không phải Trung bình. Chụp màn hình này cùng phím tắt (bấm Sửa) gửi người quản lý web nếu vẫn chưa được.</p>
    <button class="primary block" data-act="diag-guide">Xem cách kết nối</button>
    <button class="ghost block" data-act="diag-manual">Nhập tay số bước</button>`);
  body.querySelector("[data-act=diag-guide]").onclick = () => openGuide();
  body.querySelector("[data-act=diag-manual]").onclick = () => openManual(rerender);
}

/** Read the inbox; save a new reading. Returns true when something changed (re-render home). */
export async function pullInbox() {
  try {
    const key = await getInboxKey();
    if (!key) return false;
    const d = await readInbox(key);
    if (!d) return false;
    const tap = takeTap();
    const last = +ls.get("dnt_inbox_t") || 0;
    const fresh = d.t > last;
    if (!fresh && !tap) return false;
    if (fresh) ls.set("dnt_inbox_t", String(d.t));
    const date = normDate(d.date ?? ymd(new Date(d.t)));
    const r = sanitizeReading(parseLocaleNumber(d.steps, "thousands"), parseLocaleNumber(d.km, "decimal"));
    if (!date || r.steps == null) return false;
    const cur = A.health[date];
    if (cur && cur.steps === r.steps) {
      if (!tap || date !== today()) return false;
      cur.at = tap; // same number (did not walk): still show the time of this update
      cur.source = "apple";
      saveLater("health", date, () => A.health[date], 0);
      toast(`Đã cập nhật: vẫn ${fmt(r.steps)} bước.`, "good");
      return true;
    }
    if (!fresh) return false;
    saveSteps(date, r.steps, r.km ?? cur?.km ?? null, "apple", `inbox ${d.steps}`.slice(0, 120), tap || d.t);
    toast(`Đã nhận ${fmt(r.steps)} bước từ Apple Health.`, "good");
    return true;
  } catch (e) {
    console.warn("inbox:", e?.code || e?.message);
    return false;
  }
}

export const SHORTCUT_NAME = "DNT Health";
const siteUrl = () => location.href.split("#")[0];
// iOS 26+: "webapp://<site>" opens the home-screen web app (https:// would open Safari, whose storage is separate).
const webappUrl = (hash = "#home") => siteUrl().replace(/^https?:\/\//, "webapp://") + hash;
// Plain run (the shortcut's last action "Mở URL webapp://…#health-<steps>" brings the app back).
// The same shortcut works for everyone: the person's inbox key goes in as the shortcut's input.
export const shortcutRunUrl = () => `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}${inboxKey ? `&input=text&text=${inboxKey}/${dayId()}` : ""}`;


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
  if (/^#\/?health/i.test(location.hash)) ls.set("dnt_health_seen", JSON.stringify({ at: Date.now(), raw: decodeURIComponent(location.hash).slice(0, 80), ok: !!h }));
  if (!h) {
    if (/^#\/?health/i.test(location.hash)) history.replaceState(null, "", siteUrl() + "#home");
    return false;
  }
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

export const stepGoal = () => (A.profile?.goal === "cut" && A.profile?.cutPlan?.steps) || (["cut", "recomp"].includes(A.profile?.goal) ? 10000 : 8000);
/** Rough kcal burned by walking: ~0.5 kcal per kg per 1.000 steps. */
export const stepKcal = (steps) => Math.round((steps / 1000) * 0.5 * (+A.profile?.weight || 60));

/** Distance from steps when Apple Health did not send km: stride ≈ 41,4 % of height. */
const estKm = (steps) => (steps * (+A.profile?.height || 165) * 0.414) / 100000;

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
    <div class="steps-row"><b class="steps-big">${fmt(steps)}</b><span class="muted">/ ${fmt(goal)} bước${h?.km ? ` · ${fmt(h.km, 1)} km` : steps ? ` · ≈${fmt(estKm(steps), 1)} km` : ""}${steps ? ` · ~${fmt(stepKcal(steps))} kcal` : ""}</span></div>
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
  const key = await ensureInboxKey().catch(() => null);
  const apiBase = `${FS()}/inbox/`; // + "Đầu vào phím tắt" + "?documentId=" + "Số được làm tròn"
  const openUrl = webappUrl("#health-"); // + "Số được làm tròn"
  const link = cfg.shortcutLink || "";
  const desc2 = `Tạo phím tắt có đúng 5 tác vụ theo thứ tự, không thêm tác vụ nào khác (không tạo Văn bản, không tạo Từ điển): 1) Tìm mẫu sức khỏe loại Số bước, ngày bắt đầu là hôm nay, tắt giới hạn. 2) Tính toán thống kê TỔNG (không phải trung bình) của các mẫu đó. 3) Làm tròn số thành số nguyên. 4) Lấy nội dung của URL, phương thức POST, không có tiêu đề và không có nội dung yêu cầu, URL là: ${apiBase}[Đầu vào phím tắt]?documentId=[Số được làm tròn] . 5) Mở URL: ${openUrl}[Số được làm tròn]`;
  const flow = `<div class="note"><b>Cách dùng:</b> bấm <b>Cập nhật từ Apple Health</b> → iPhone chuyển sang Phím tắt, chạy 1–2 giây → tự mở lại <b>HARVE Fitness</b> với số bước mới. Lần đầu iPhone hỏi quyền: <b>Cho phép</b> Sức khỏe, <b>Luôn cho phép</b> kết nối, <b>Mở</b> HARVE Fitness.</div>`;
  const B = (n) => `<b class="badge">${n}</b>`;
  const steps5 = `<ol class="guide">
        <li><b>Tìm mẫu sức khỏe</b> → <b>Loại</b>: <b>Steps / Số bước</b> → <b>Ngày bắt đầu</b>: <b>hôm nay</b> → <b>Giới hạn</b>: tắt.</li>
        <li><b>Tính toán thống kê</b> → chạm <b>Trung bình</b> đổi thành <b>Tổng</b>.</li>
        <li><b>Làm tròn số</b> → <b>Số nguyên</b>.</li>
        <li><b>Lấy nội dung của URL</b> → chạm ô địa chỉ, ghép đúng 4 phần liền nhau:
          <br>${B(1)} dán nút <b>1</b> → ${B(2)} chọn biến <b>Đầu vào phím tắt</b> → ${B(3)} dán nút <b>2</b> (<code>?documentId=</code>) → ${B(4)} chọn biến <b>Số được làm tròn</b>.
          <br>Chạm <b>›</b> → <b>Phương thức</b>: <b>POST</b>. Không thêm Tiêu đề, không thêm Nội dung yêu cầu.</li>
        <li><b>Mở URL</b> → dán nút <b>3</b> → ngay sau dấu <b>-</b> cuối, chọn biến <b>Số được làm tròn</b>.</li>
      </ol>`;
  const copies = `<button class="ghost block" data-copy="api">1 · Sao chép địa chỉ gửi</button>
      <button class="ghost block" data-copy="doc">2 · Sao chép ?documentId=</button>
      <button class="ghost block" data-copy="open">3 · Sao chép địa chỉ mở app</button>`;
  const finish = `<li>Đặt tên phím tắt đúng <b class="hl">${SHORTCUT_NAME}</b> (chạm tên ở trên cùng → Đổi tên).</li>
        <li>Quay lại HARVE Fitness, bấm <b>Cập nhật từ Apple Health</b>. Lần đầu: <b>Cho phép</b> Sức khỏe, <b>Luôn cho phép</b> kết nối, <b>Mở</b> HARVE Fitness. Thấy số bước là xong.</li>`;
  const body = openSheet(`<h2>Kết nối <em>Apple Health.</em></h2>
    <p class="muted">Web không tự đọc được app Sức khỏe, nên cần phím tắt <b class="hl">${SHORTCUT_NAME}</b> trên iPhone. Làm 1 lần. Sau đó chỉ cần bấm <b>Cập nhật từ Apple Health</b> → iPhone chạy phím tắt 1–2 giây → tự mở lại app với số bước, km, kcal và giờ cập nhật.</p>
    ${link ? `<a class="primary block" href="${esc(link)}" target="_blank" rel="noopener">Thêm phím tắt ${SHORTCUT_NAME} (1 chạm, nhanh nhất)</a><p class="muted sm">Bấm nút trên → <b>Thêm phím tắt</b> là xong, không cần làm 2 cách bên dưới. Đã có ${SHORTCUT_NAME} cũ thì xóa trước.</p>` : ""}
    <div class="seg full"><button class="seg-b" data-way="ai" aria-pressed="true">Có Apple Intelligence</button><button class="seg-b" data-way="manual" aria-pressed="false">Không có</button></div>
    <p class="muted sm">Cách biết: bấm <b>+</b> trong app Phím tắt. Có ô <b>"Mô tả phím tắt"</b> → máy có Apple Intelligence (iPhone 15 Pro trở lên, iOS 26). Chỉ thấy <b>"Thêm các tác vụ ở bên dưới"</b> → máy không có.</p>

    <section class="way" data-way-body="ai">
      <h3>Cách 1: <em>Máy có Apple Intelligence</em></h3>
      <ol class="guide">
        <li>Bấm <b>Sao chép mô tả</b> ở dưới.</li>
        <li>App <b>Phím tắt</b> → <b>+</b> → chạm ô <b>Mô tả phím tắt</b> → dán → bấm <b>↵</b>. Chờ iPhone tạo xong.</li>
        <li><b>Kiểm tra lại</b> (AI hay làm sai): bấm vào phím tắt, so với 5 tác vụ ở mục "Kiểm tra" bên dưới. Đặc biệt: <b>Tính</b> phải là <b>Tổng</b>; <b>Lấy nội dung của URL</b> phải là <b>POST</b> và <b>không có tác vụ Văn bản chứa chữ "fields"</b>. Sai chỗ nào sửa theo Cách 2.</li>
        ${finish}
      </ol>
      <div class="desc-box">${esc(desc2)}</div>
      <button class="primary block" data-copy="desc">Sao chép mô tả</button>
      <details class="way-adv"><summary>Kiểm tra: phím tắt đúng phải có 5 tác vụ này</summary>${steps5}${copies}</details>
    </section>

    <section class="way" data-way-body="manual" hidden>
      <h3>Cách 2: <em>Máy không có Apple Intelligence</em></h3>
      <p class="muted sm">App <b>Phím tắt</b> → <b>+</b>. Gõ tên tác vụ vào ô <b>Tìm kiếm</b>, chạm để thêm, theo thứ tự:</p>
      ${steps5}
      ${copies}
      <ol class="guide" start="6">${finish}</ol>
    </section>

    <div class="note"><b>Đã có phím tắt cũ có tác vụ Văn bản chứa "fields"?</b> Xóa tác vụ <b>Văn bản</b> đó; trong <b>Lấy nội dung của URL</b>, sau biến <b>Đầu vào phím tắt</b> thêm nút <b>2</b> và biến <b>Số được làm tròn</b>; Phương thức <b>POST</b>; xóa Nội dung yêu cầu.</div>
    <button class="ghost block" data-act="inbox-check">Kiểm tra: máy chủ đã nhận số bước chưa?</button>
    <div class="note"><b>Không tự mở lại app?</b> Cần iOS 26 trở lên. Máy cũ hơn: chạy xong bấm <b>◀ HARVE Fitness</b> ở góc trên bên trái, số bước vẫn được cập nhật.</div>
    <p class="muted sm">Bấm ▶ trong app Phím tắt sẽ không có mã riêng; luôn thử bằng nút Cập nhật trên web. Chia sẻ cho mọi người: bấm giữ ${SHORTCUT_NAME} → Chia sẻ → Sao chép liên kết iCloud → gửi người quản lý web.</p>`);
  body.addEventListener("click", async (e) => {
    const w = e.target.closest("[data-way]");
    if (w) {
      body.querySelectorAll("[data-way]").forEach((x) => x.setAttribute("aria-pressed", x === w));
      body.querySelectorAll("[data-way-body]").forEach((x) => (x.hidden = x.dataset.wayBody !== w.dataset.way));
      return;
    }
    if (e.target.closest("[data-act=inbox-check]")) {
      try {
        const d = key ? await readInbox(key) : null;
        const n = d ? parseLocaleNumber(d.steps, "thousands") : null;
        toast(n != null ? `Máy chủ đã nhận: ${fmt(n)} bước. Phím tắt chạy đúng ✓` : "Máy chủ chưa nhận được số bước nào. Bấm Cập nhật từ Apple Health rồi kiểm tra lại.", n != null ? "good" : "bad");
      } catch (err) {
        toast("Không kiểm tra được: " + (err?.code || err?.message), "bad");
      }
      return;
    }
    const c = e.target.closest("[data-copy]");
    if (!c) return;
    const text = { api: apiBase, doc: "?documentId=", open: openUrl, desc: desc2 }[c.dataset.copy];
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
