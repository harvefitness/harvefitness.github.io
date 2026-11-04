// Small DOM / format helpers shared by every view.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Vietnamese number format: 1.234,5 */
export function fmt(n, d = 0) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  return n.toLocaleString("vi-VN", { maximumFractionDigits: d, minimumFractionDigits: 0 });
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const round = (v, step = 1) => Math.round(v / step) * step;

/** Strip Vietnamese diacritics for search. */
export function fold(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

// ---------- Dates (local time, YYYY-MM-DD) ----------
const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
/** Colour theme by sex: women get hot pink, everyone else electric lime. Remembered for the next start. */
export function applyTheme(sex) {
  const pink = sex === "female";
  document.documentElement.dataset.theme = pink ? "pink" : "lime";
  try {
    localStorage.setItem("dnt_theme", pink ? "pink" : "lime");
  } catch {}
}
export const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
export const DOW_LONG = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // T2 → CN
export const dow = (s) => parseDate(s).getDay();
export function niceDate(s) {
  const d = parseDate(s);
  return `${DOW[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}`;
}
export function shortDate(s) {
  const d = parseDate(s);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}
export function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}
export function mondayOf(s) {
  const d = parseDate(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
}
/** "13:30" -> minutes since midnight */
export function hm(s) {
  if (!s) return null;
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}
export function hmStr(min) {
  min = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

/** Deterministic pseudo-random from a string seed (for rotating meal ideas). */
export function seeded(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// ---------- Toast / sheet ----------
let toastTimer;
export function toast(msg, kind = "") {
  let el = $("#toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.dataset.kind = kind;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

/** Bottom sheet. Returns the content element; close with closeSheet(). */
export function openSheet(html, { onClose, wide } = {}) {
  closeSheet();
  const wrap = document.createElement("div");
  wrap.className = "sheet-wrap";
  wrap.innerHTML = `<div class="sheet-bg" data-close></div><div class="sheet${wide ? " wide" : ""}" role="dialog" aria-modal="true"><button class="sheet-x" data-close aria-label="Đóng">✕</button><div class="sheet-body">${html}</div></div>`;
  document.body.appendChild(wrap);
  document.body.classList.add("no-scroll");
  wrap.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) closeSheet();
  });
  wrap._onClose = onClose;
  requestAnimationFrame(() => wrap.classList.add("open"));
  return $(".sheet-body", wrap);
}
export function closeSheet() {
  const w = $(".sheet-wrap");
  if (!w) return;
  w._onClose?.();
  w.remove();
  document.body.classList.remove("no-scroll");
}
addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSheet();
});

/** Simple progress bar markup. */
export function bar(pct, cls = "") {
  return `<div class="bar ${cls}"><i style="width:${clamp(pct, 0, 100).toFixed(1)}%"></i></div>`;
}

/** Tiny markdown → HTML for AI answers (bold, lists, line breaks, headings). */
export function md(text) {
  const lines = esc(text).split(/\n/);
  let html = "";
  let inList = false;
  for (let raw of lines) {
    let l = raw.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|\s)\*(?!\s)(.+?)\*(?=\s|$)/g, "$1<i>$2</i>");
    const li = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (li) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${li[1]}</li>`;
      continue;
    }
    if (inList) {
      html += "</ul>";
      inList = false;
    }
    const h = l.match(/^#{1,4}\s+(.*)$/);
    if (h) html += `<p class="md-h">${h[1]}</p>`;
    else if (l.trim()) html += `<p>${l}</p>`;
  }
  if (inList) html += "</ul>";
  return html;
}
