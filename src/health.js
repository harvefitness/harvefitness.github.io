// Apple Health steps via an iOS Shortcut.
// Websites cannot read HealthKit, so the "DNT Health" shortcut reads today's steps and
// walking distance, then opens  <site>/#health-<steps>-<km>  ; this module saves that.
import { A, saveLater } from "./state.js";
import { esc, fmt, today, addDays, shortDate, openSheet, toast, bar } from "./ui.js";
import { ls } from "./store.js";

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
    if (km > 150) km = km / 1000; // sent in metres
    const maxKm = steps ? steps * 0.0025 + 1 : 150; // stride ≤ 2,5 m
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
    ${h?.source === "apple" && h.raw ? `<p class="raw">Phím tắt gửi: <code>${esc(h.raw)}</code></p>` : ""}
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

export function openGuide() {
  const url = `${siteUrl()}#health-`;
  const desc = `Lấy tổng số bước chân hôm nay trong app Sức khỏe và làm tròn thành số nguyên. Lấy tổng quãng đường đi bộ và chạy hôm nay trong app Sức khỏe, tính bằng km, làm tròn 1 chữ số thập phân. Sau đó mở URL: ${url}[số bước]-[số km]`;
  const body = openSheet(`<h2>Kết nối <em>Apple Health.</em></h2>
    <p class="muted">Làm 1 lần trên <b>iPhone</b> (không phải Mac, vì số bước nằm trong app Sức khỏe của iPhone). Phím tắt đọc số bước và quãng đường hôm nay, rồi mở website kèm số liệu. Không cần cài thêm app. Chọn 1 trong 2 cách.</p>
    <div class="seg full"><button class="seg-b" data-way="1" aria-pressed="false">Cách 1 · Từng bước</button><button class="seg-b" data-way="2" aria-pressed="true">Cách 2 · Gõ mô tả</button></div>

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

    <section class="way" data-way-body="2">
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

    <div class="note">Tự động mỗi tối: app Phím tắt → tab <b>Tự động hóa</b> → <b>+</b> → <b>Thời gian trong ngày</b> (vd 21:00) → chọn <b>Chạy ngay</b> → chọn phím tắt <b>${SHORTCUT_NAME}</b>.</div>`);
  body.addEventListener("click", async (e) => {
    const w = e.target.closest("[data-way]");
    if (w) {
      body.querySelectorAll("[data-way]").forEach((b) => b.setAttribute("aria-pressed", b === w));
      body.querySelectorAll("[data-way-body]").forEach((s) => (s.hidden = s.dataset.wayBody !== w.dataset.way));
      return;
    }
    const c = e.target.closest("[data-copy]");
    if (!c) return;
    const text = c.dataset.copy === "url" ? url : desc;
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
