// Apple Health steps via an iOS Shortcut.
// Websites cannot read HealthKit, so the "DNT Health" shortcut reads today's steps and
// walking distance, then opens  <site>/#health-<steps>-<km>  ; this module saves that.
import { A, saveLater } from "./state.js";
import { esc, fmt, today, addDays, shortDate, openSheet, toast, bar } from "./ui.js";
import { ls } from "./store.js";

export const SHORTCUT_NAME = "DNT Health";
export const shortcutRunUrl = () => `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`;
const siteUrl = () => location.href.split("#")[0];

const toNum = (s) => {
  const n = parseFloat(String(s || "").replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** "#health-8234-5,6" → { steps, km } or null */
export function parseHealthHash(hash = location.hash) {
  const m = decodeURIComponent(hash).match(/^#\/?health[-/]([^-/]+)(?:[-/]([^-/]+))?/i);
  if (!m) return null;
  const digits = String(m[1]).split(/[.,](?=\d{1,2}$)/)[0].replace(/\D/g, ""); // drop separators / decimals
  const steps = digits ? +digits : null;
  if (steps == null) return null;
  let km = toNum(m[2]);
  if (km != null && km > 200) km = km / 1000; // shortcut sent metres
  return { steps: Math.round(steps), km: km != null ? Math.round(km * 100) / 100 : null };
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
  saveSteps(p.date, p.steps, p.km, "apple");
  toast(`Đã nhận ${fmt(p.steps)} bước${p.km ? ` · ${fmt(p.km, 1)} km` : ""} từ Apple Health.`, "good");
}

export function saveSteps(date, steps, km, source = "manual") {
  A.health[date] = { date, steps, km: km ?? A.health[date]?.km ?? null, source, at: Date.now() };
  saveLater("health", date, () => A.health[date], 0);
}

export const stepGoal = () => (["cut", "recomp"].includes(A.profile?.goal) ? 10000 : 8000);
/** Rough kcal burned by walking: ~0.5 kcal per kg per 1.000 steps. */
export const stepKcal = (steps) => Math.round((steps / 1000) * 0.5 * (+A.profile?.weight || 60));

export function stepsCard() {
  const d = today();
  const h = A.health[d];
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
    const s = toNum(body.querySelector("#hm-s").value);
    if (s == null) return toast("Nhập số bước.", "bad");
    saveSteps(d, Math.round(s), toNum(body.querySelector("#hm-k").value), "manual");
    body.closest(".sheet-wrap").querySelector("[data-close]").click();
    toast("Đã lưu bước chân.", "good");
    after?.();
  };
}

export function openGuide() {
  const url = `${siteUrl()}#health-`;
  openSheet(`<h2>Kết nối <em>Apple Health.</em></h2>
    <p class="muted">Làm 1 lần, khoảng 3 phút. Phím tắt đọc số bước và quãng đường hôm nay trong app Sức khỏe, rồi mở website kèm số liệu. Không cần cài thêm app.</p>
    <ol class="guide">
      <li>Mở app <b>Phím tắt (Shortcuts)</b> → bấm <b>+</b> ở góc phải → đặt tên phím tắt là <b class="hl">${SHORTCUT_NAME}</b> (đúng chữ hoa, có dấu cách).</li>
      <li><b>Thêm tác vụ</b> → tìm <b>"Tìm mẫu sức khỏe"</b> (Find Health Samples) → bấm vào chữ <b>Loại</b> chọn <b>Số bước (Steps)</b> → thêm bộ lọc <b>Ngày bắt đầu · là hôm nay</b> (Start Date · is today).</li>
      <li>Thêm tác vụ <b>"Tính toán thống kê"</b> (Calculate Statistics) → chọn <b>Tổng (Sum)</b>.</li>
      <li>Thêm tác vụ <b>"Làm tròn số"</b> (Round Number).</li>
      <li>Thêm tác vụ <b>"URL"</b>, gõ: <code class="copy">${esc(url)}</code> rồi chèn biến <b>Số đã làm tròn</b> (Rounded Number) vào ngay sau dấu gạch cuối.</li>
      <li>Thêm tác vụ <b>"Mở URL"</b> (Open URLs).</li>
      <li>Bấm ▶ chạy thử. Lần đầu iPhone hỏi quyền đọc Sức khỏe, chọn <b>Cho phép</b>. Website sẽ mở và báo "Đã nhận … bước".</li>
    </ol>
    <div class="note">Muốn có cả số km: lặp lại bước 2–3 với loại <b>Quãng đường đi bộ + chạy</b> (Walking + Running Distance), rồi ở bước 5 thêm dấu <b>-</b> và biến số km phía sau. Ví dụ: <code>…#health-8234-5,6</code></div>
    <div class="note">Tự động mỗi tối: app Phím tắt → tab <b>Tự động hóa</b> → <b>+</b> → <b>Thời gian trong ngày</b> (vd 21:00) → chọn <b>Chạy ngay</b> → chọn phím tắt <b>${SHORTCUT_NAME}</b>.</div>
    <button class="primary block" id="copy-url">Sao chép link cho bước 5</button>`);
  document.getElementById("copy-url").onclick = async (e) => {
    try {
      await navigator.clipboard.writeText(url);
      e.target.textContent = "Đã sao chép";
    } catch {
      toast(url);
    }
  };
}

export function stepsContext() {
  const d = today();
  const t = A.health[d], y = A.health[addDays(d, -1)];
  const week = Array.from({ length: 7 }, (_, i) => A.health[addDays(d, -i)]?.steps).filter((x) => x != null);
  const avg = week.length ? Math.round(week.reduce((a, b) => a + b, 0) / week.length) : null;
  return `- Bước chân (Apple Health/nhập tay): hôm nay ${t ? t.steps + " bước" + (t.km ? `, ${t.km} km` : "") : "chưa có"}; hôm qua ${y ? y.steps : "chưa có"}; trung bình 7 ngày ${avg ?? "chưa có"}. Mục tiêu ${stepGoal()} bước.`;
}
