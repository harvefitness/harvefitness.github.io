// Training: today's session logging, the full roadmap, and the exercise library.
import { A, saveLater, loadDay, aiContext } from "./state.js";
import * as S from "./store.js";
import { SPORTS } from "./calc.js";
import { planFor, PHASES, phaseOf } from "./program.js";
import { loadLibrary, searchLib, GROUPS, EQUIP_VN, MUSCLE_VN, CAT_VN, LEVEL_VN, imgUrl, libById, exName, exCue } from "./exercises.js";
import * as AI from "./ai.js";
import { renderMuscles, renderBurn } from "./v-learn.js";
import { esc, num, fmt, today, addDays, niceDate, shortDate, DOW, DOW_LONG, WEEK_ORDER, mondayOf, $, $$, openSheet, closeSheet, toast, md, bar } from "./ui.js";

let curDate = today();
let libQ = "", libGroup = "", libEquip = "", libLimit = 40;

export function setTrainDate(d) {
  curDate = d;
}

// ---------------------------------------------------------------- helpers
function getW(date) {
  return (A.workouts[date] ||= { date, sets: {}, completed: false, sports: {} });
}
function sessionKeyFor(date) {
  const w = A.workouts[date];
  if (w?.sessionKey !== undefined) return w.sessionKey; // "" = chosen rest
  return planFor(A.prog, date).find((i) => i.kind === "gym")?.key || "";
}
// ---------------------------------------------------------------- weights memory & progression
export const KG_STEPS = Array.from({ length: 40 }, (_, i) => (i + 1) * 2.5); // 2,5 → 100 kg
const LOWER = new Set(["squat", "hinge", "glute", "single", "quad", "ham", "calves", "latlunge"]);

/** "8–10" → [8, 10]; "12/chân" → [12, 12]; "30–45 giây" → [30, 45] (timed). */
export function repRange(reps) {
  const n = String(reps).match(/\d+/g)?.map(Number) || [];
  return { lo: n[0] ?? 0, hi: n[1] ?? n[0] ?? 0, timed: /giây|phút|m\b/.test(reps) };
}
/** Most recent earlier session that logged this exercise. */
function prevSession(date, id) {
  const ds = Object.keys(A.workouts).filter((d) => d < date).sort().reverse();
  for (const d of ds) {
    const arr = (A.workouts[d].sets?.[id] || []).filter((s) => s.done);
    if (arr.length) return { d, sets: arr };
  }
  return null;
}
/** Remembered weight/reps: saved memory first, then the last logged session. */
function memoryOf(date, id) {
  const m = A.loads[id];
  if (m && (m.kg !== "" || m.reps !== "")) return m;
  const p = prevSession(date, id);
  return p ? { kg: p.sets.at(-1).kg, reps: p.sets.at(-1).reps } : null;
}
function remember(id, s, date) {
  if (num(s.kg) == null && num(s.reps) == null) return;
  A.loads[id] = { kg: s.kg ?? "", reps: s.reps ?? "", at: date };
  saveLater("meta", "loads", () => ({ byEx: A.loads }), 1500);
}

/**
 * Double-progression coach (ACSM 2009 / NSCA): all sets at the top of the rep range → add weight;
 * below the bottom twice → hold or lighten. Returns { kind, text, kg? } or null.
 */
export function coachTip(date, ex) {
  const ph = phaseOf(A.profile.programStart, date);
  const r = repRange(ex.reps);
  const prev = prevSession(date, ex.id);
  if (!prev) return null;
  const kg = Math.max(0, ...prev.sets.map((s) => num(s.kg) || 0));
  const reps = prev.sets.map((s) => num(s.reps)).filter((x) => x != null);
  if (!reps.length) return null;
  const minReps = Math.min(...reps);
  if (ph.idx === 3 && kg) {
    const down = Math.max(2.5, Math.round((kg * 0.9) / 2.5) * 2.5);
    return { kind: "deload", kg: down, text: `Tuần giảm tải: hạ tạ còn ${fmt(down, 1)} kg, tập nhẹ nhàng để cơ phục hồi.` };
  }
  if (r.timed) {
    return minReps >= r.hi
      ? { kind: "up", text: `Lần trước giữ đủ ${r.hi} giây mọi hiệp. Hôm nay tăng thêm 10–15 giây.` }
      : null;
  }
  if (minReps >= r.hi && prev.sets.length >= Math.min(ex.sets, 2)) {
    if (!kg) return { kind: "up", text: `Lần trước làm đủ ${r.hi} lần mọi hiệp không tạ. Hôm nay thêm tạ 2,5–5 kg hoặc làm chậm hơn (hạ 3 giây).` };
    const inc = LOWER.has(ex.slot) && kg >= 20 ? 5 : 2.5;
    const next = Math.min(100, kg + inc);
    return { kind: "up", kg: next, text: `Lần trước bạn làm đủ ${r.hi} lần mọi hiệp với ${fmt(kg, 1)} kg. Hôm nay tăng lên ${fmt(next, 1)} kg.` };
  }
  // Two sessions in a row below the range → lighten.
  const older = prevSession(prev.d, ex.id);
  const olderMin = older ? Math.min(...older.sets.map((s) => num(s.reps)).filter((x) => x != null)) : Infinity;
  if (minReps < r.lo && olderMin < r.lo && kg > 2.5) {
    const down = kg - 2.5;
    return { kind: "down", kg: down, text: `2 buổi liền chưa đạt ${r.lo} lần. Giảm còn ${fmt(down, 1)} kg để giữ kỹ thuật chuẩn, sau đó tăng lại.` };
  }
  if (minReps < r.lo) return { kind: "hold", text: `Lần trước chưa đạt ${r.lo} lần ở mọi hiệp. Giữ ${kg ? fmt(kg, 1) + " kg" : "mức này"}, cố thêm 1–2 lần mỗi hiệp.` };
  return { kind: "hold", text: `Giữ ${kg ? fmt(kg, 1) + " kg" : "mức này"}, cố thêm 1 lần mỗi hiệp. Đạt ${r.hi} lần mọi hiệp là tăng tạ.` };
}

function setsOf(date, ex) {
  const arr = A.workouts[date]?.sets?.[ex.id];
  if (arr?.length) return arr;
  // Not logged yet: prefill with the remembered weight & reps so the person only has to tick.
  const mem = memoryOf(date, ex.id);
  const kg = mem?.kg ?? "";
  const reps = mem?.reps || String(repRange(ex.reps).lo || "");
  return Array.from({ length: ex.sets }, () => ({ kg, reps, done: false }));
}
function ensureSets(date, ex) {
  const w = getW(date);
  if (!w.sets[ex.id]?.length) w.sets[ex.id] = setsOf(date, ex).map((s) => ({ ...s }));
  return w.sets[ex.id];
}
function lastTime(date, id) {
  const ds = Object.keys(A.workouts).filter((d) => d < date).sort().reverse();
  for (const d of ds) {
    const arr = A.workouts[d].sets?.[id];
    const ok = (arr || []).filter((s) => num(s.kg) != null || num(s.reps) != null);
    if (!ok.length) continue;
    const best = ok.reduce((a, b) => ((num(b.kg) || 0) > (num(a.kg) || 0) ? b : a));
    return { d, txt: `${num(best.kg) != null ? fmt(num(best.kg), 1) + "kg" : ""}${num(best.reps) != null ? " × " + best.reps : ""}` };
  }
  return null;
}
export function dayStatus(date) {
  if (A.profile?.programStart && date < A.profile.programStart && !A.workouts[date]) return "rest"; // before the program began
  const items = planFor(A.prog, date);
  const w = A.workouts[date];
  if (!items.some((i) => i.kind !== "rest") && !w?.sessionKey) return "rest";
  if (w?.completed) return "done";
  const any = w && (Object.values(w.sets || {}).some((a) => a.some((s) => s.done)) || Object.values(w.sports || {}).some(Boolean));
  if (any) return "partial";
  return date < today() ? "missed" : "planned";
}
const thumb = (id, cls = "") => `<img class="thumb ${cls}" loading="lazy" src="${imgUrl(id, 0)}" alt="" onerror="this.style.visibility='hidden'">`;

// ---------------------------------------------------------------- Today
function renderToday(root) {
  const date = curDate;
  const key = sessionKeyFor(date);
  const sess = A.prog.sessions[key];
  const items = planFor(A.prog, date);
  const w = A.workouts[date];
  let total = 0, done = 0;
  sess?.exercises.forEach((ex) => {
    const a = setsOf(date, ex);
    total += a.length;
    done += a.filter((s) => s.done).length;
  });
  const ph = phaseOf(A.profile.programStart, date);
  let h = `<div class="row between">
    <div class="datenav"><button class="icon-btn" data-act="prev" aria-label="Ngày trước">‹</button>
    <button class="date-btn" data-act="cal" aria-label="Mở lịch">${date === today() ? "Hôm nay · " : ""}${niceDate(date)} <span aria-hidden="true">▾</span></button>
    <button class="icon-btn" data-act="next" aria-label="Ngày sau">›</button></div>
    ${date !== today() ? `<button class="ghost sm" data-act="today">Hôm nay</button>` : ""}
  </div>
  <div class="chips scroll" role="group" aria-label="Chọn buổi">
    ${A.prog.keys.map((k) => `<button class="chip" data-act="sess" data-k="${k}" aria-pressed="${k === key}">${esc(A.prog.sessions[k].name)}</button>`).join("")}
    <button class="chip" data-act="sess" data-k="" aria-pressed="${!key}">Nghỉ gym</button>
  </div>`;

  // Sports planned today
  for (const it of items.filter((i) => i.kind === "sport")) {
    const on = !!w?.sports?.[it.type];
    h += `<article class="card sport">
      <div class="row between"><div><span class="eyebrow">Thể thao</span><h3>${esc(it.name)} · ${it.minutes} phút</h3></div>
      <button class="tick big" data-act="sport" data-t="${it.type}" aria-pressed="${on}" aria-label="Đã chơi ${esc(it.name)}">✓</button></div>
      <ul class="tips">${sportTips(it.type).map((t) => `<li>${t}</li>`).join("")}</ul></article>`;
  }

  if (!sess) {
    if (!items.some((i) => i.kind === "sport"))
      h += `<div class="card rest"><span class="eyebrow">Ngày nghỉ</span><h3>Phục hồi</h3><p class="muted">Đi bộ nhẹ 6.000–8.000 bước, giãn cơ 10 phút, ngủ đủ 7–9 tiếng. Cơ phát triển trong lúc nghỉ.</p></div>`;
    return (root.innerHTML = h);
  }

  h += `<section class="hero-card">
    <span class="eyebrow">Tuần ${ph.week}/12 · ${esc(ph.name)}</span>
    <h2>${esc(sess.name)}</h2>
    <div class="meta"><span>${sess.exercises.length} bài</span><span class="num">${done}/${total} hiệp</span>${w?.completed ? `<span class="good-t">Đã hoàn thành</span>` : ""}</div>
    ${bar(total ? (done / total) * 100 : 0)}
  </section>
  <details class="card warm"><summary><b>Khởi động · 8 phút</b></summary><ul class="mini-list">${A.prog.warm.map((x) => `<li data-ex="${x.id}">${thumb(x.id, "s")}<span>${esc(x.vn)}</span></li>`).join("")}</ul></details>`;

  // PT reminder for today: which exercises should go up in weight.
  const tips = sess.exercises.map((ex) => [ex, coachTip(date, ex)]).filter(([, t]) => t);
  const ups = tips.filter(([, t]) => t.kind === "up");
  if (tips.length)
    h += `<section class="card coach-sum"><span class="eyebrow">PT nhắc hôm nay</span>
      <p>${ups.length ? `<b>${ups.length} bài nên tăng tạ/số lần:</b> ${ups.map(([ex]) => esc(ex.vn)).join(", ")}.` : "Giữ mức tạ như buổi trước và cố thêm 1 lần mỗi hiệp."}${tips.some(([, t]) => t.kind === "down") ? " Có bài nên giảm nhẹ tạ để giữ kỹ thuật." : ""}</p></section>`;
  const kgOpts = (v) => {
    const n = num(v);
    const list = n != null && n > 0 && !KG_STEPS.includes(n) ? [...KG_STEPS, n].sort((a, b) => a - b) : KG_STEPS;
    return `<option value="" ${n == null || n === 0 ? "selected" : ""}>Không tạ</option>${list.map((k) => `<option value="${k}" ${n === k ? "selected" : ""}>${fmt(k, 1)} kg</option>`).join("")}`;
  };
  sess.exercises.forEach((ex, n) => {
    const arr = setsOf(date, ex);
    const all = arr.every((s) => s.done);
    const lt = lastTime(date, ex.id);
    const tip = coachTip(date, ex);
    h += `<article class="ex${all ? " done" : ""}">
      <div class="ex-head" data-ex="${ex.id}" role="button" tabindex="0" aria-label="Xem hướng dẫn ${esc(ex.vn)}">
        ${thumb(ex.id)}
        <div class="ex-t"><span class="eyebrow">${n + 1} · ${esc(ex.slotVn)}</span><h3>${esc(ex.vn)}</h3>
        <span class="rx num">${ex.sets} × ${esc(ex.reps)} · nghỉ ${esc(ex.rest)}${ex.rir ? " · " + esc(ex.rir) : ""}</span>
        ${lt ? `<span class="last">Lần trước ${esc(lt.txt)}</span>` : ""}</div>
      </div>
      ${tip ? `<div class="tip ${tip.kind}"><span>${esc(tip.text)}</span>${tip.kg != null && !all ? `<button class="tip-apply" data-act="apply" data-ex="${ex.id}" data-kg="${tip.kg}">Áp dụng</button>` : ""}</div>` : ""}
      <div class="sets"><div class="set head"><span></span><span>Khối lượng</span><span>Số lần</span><span>Xong</span></div>${arr
        .map(
          (s, i) => `<div class="set"><span class="n">${i + 1}</span>
          <select id="kg-${ex.id}-${i}" data-ex="${ex.id}" data-i="${i}" data-f="kg" aria-label="Hiệp ${i + 1}: khối lượng">${kgOpts(s.kg)}</select>
          <input id="rp-${ex.id}-${i}" inputmode="numeric" placeholder="${esc(ex.reps)}" value="${esc(s.reps)}" data-ex="${ex.id}" data-i="${i}" data-f="reps" aria-label="Hiệp ${i + 1}: số lần">
          <button class="tick" data-act="tick" data-ex="${ex.id}" data-i="${i}" aria-pressed="${!!s.done}" aria-label="Xong hiệp ${i + 1}">✓</button></div>`
        )
        .join("")}</div>
      <button class="link" data-act="addset" data-ex="${ex.id}">+ Thêm hiệp</button>
    </article>`;
  });
  if (A.prog.cardio?.extra && (A.profile.goal === "cut" || A.profile.goal === "recomp")) h += `<div class="card"><span class="eyebrow">Cardio cuối buổi</span><p>${esc(A.prog.cardio.text)}</p></div>`;
  h += `<details class="card warm"><summary><b>Giãn cơ · 5 phút</b></summary><ul class="mini-list">${A.prog.cool(sess).map((id) => `<li data-ex="${id}">${thumb(id, "s")}<span>${esc(exName(id))}</span></li>`).join("")}</ul></details>
  <button class="primary block" data-act="complete" aria-pressed="${!!w?.completed}">${w?.completed ? "Đã hoàn thành buổi tập ✓" : "Hoàn thành buổi tập"}</button>
  ${w?.aiReview ? `<div class="ai-box"><span class="eyebrow">PT AI đánh giá buổi tập</span>${md(w.aiReview)}</div>` : ""}
  ${AI.AI_READY && done > 0 ? `<button class="ghost block" data-act="ai-session">${w?.aiReview ? "Đánh giá lại với PT AI" : "Nhờ PT AI đánh giá buổi tập"}</button>` : ""}
  <p class="muted sm">Tăng tiến: khi làm đủ số lần cao nhất ở mọi hiệp với kỹ thuật chuẩn, buổi sau tăng tạ (chân +2,5–5 kg, tay +2,5 kg). Hệ thống nhớ mức tạ của bạn, buổi sau chỉ cần tick.</p>`;
  root.innerHTML = h;
}

// ---------------------------------------------------------------- Month calendar
const MONTHS_VN = ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"];
export function openCalendar(current, onPick) {
  let y = +current.slice(0, 4), m = +current.slice(5, 7) - 1;
  const body = openSheet(`<div id="cal"></div>`);
  const draw = () => {
    const first = new Date(y, m, 1);
    const days = new Date(y, m + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // Monday first
    const ds = (d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    let done = 0, planned = 0, missed = 0;
    let cells = "";
    for (let i = 0; i < lead; i++) cells += `<span></span>`;
    for (let d = 1; d <= days; d++) {
      const date = ds(d);
      const items = planFor(A.prog, date);
      const st = dayStatus(date);
      if (st === "done") done++;
      if (st === "missed") missed++;
      if (st !== "rest") planned++;
      const label = items.filter((i) => i.kind !== "rest").map((i) => (i.kind === "gym" ? "Gym" : i.name)).join("+");
      cells += `<button class="cal-d" data-d="${date}" data-st="${st}" ${date === today() ? "data-today" : ""} ${date === current ? 'aria-current="date"' : ""}>
        <b class="num">${d}</b><i class="dot"></i><small>${esc(label)}</small></button>`;
    }
    $("#cal", body).innerHTML = `<div class="cal-head">
        <button class="icon-btn" data-mv="-1" aria-label="Tháng trước">‹</button>
        <h2>${MONTHS_VN[m]} <em>${y}</em></h2>
        <button class="icon-btn" data-mv="1" aria-label="Tháng sau">›</button></div>
      <div class="cal-stats"><div><b class="num">${done}</b><small>Đã tập</small></div><div><b class="num">${planned}</b><small>Ngày có lịch</small></div><div><b class="num">${missed}</b><small>Bỏ lỡ</small></div></div>
      <div class="cal-grid">${["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => `<span class="cal-w">${d}</span>`).join("")}${cells}</div>
      <div class="legend"><span><i class="lg done"></i>Xong</span><span><i class="lg partial"></i>Dở</span><span><i class="lg missed"></i>Bỏ lỡ</span><span><i class="lg planned"></i>Sắp tới</span></div>
      <button class="ghost block" data-pick="${today()}">Về hôm nay</button>`;
  };
  // Load the logs of the month being viewed (only recent weeks are loaded at start).
  const load = async () => {
    const from = `${y}-${String(m + 1).padStart(2, "0")}-01`, to = `${y}-${String(m + 1).padStart(2, "0")}-31`;
    try {
      Object.assign(A.workouts, await S.range("workouts", from, to));
    } catch {}
    if (body.isConnected) draw();
  };
  body.addEventListener("click", (e) => {
    const mv = e.target.closest("[data-mv]");
    if (mv) {
      m += +mv.dataset.mv;
      if (m < 0) (m = 11), y--;
      if (m > 11) (m = 0), y++;
      draw();
      load();
      return;
    }
    const d = e.target.closest("[data-d], [data-pick]");
    if (!d) return;
    closeSheet();
    onPick(d.dataset.d || d.dataset.pick);
  });
  draw();
  load();
}

function sportTips(type) {
  const s = SPORTS[type] || {};
  const t = ["Uống ~500 ml nước 1–2 tiếng trước, nhấp nước mỗi 15–20 phút; ra nhiều mồ hôi thì thêm điện giải.", "Khởi động động 5–10 phút trước khi chơi, giãn cơ sau khi chơi."];
  if (s.racquet) t.push("Không uống whey trong lúc chơi (dễ đầy bụng). Sau khi chơi 1–2 tiếng ăn bữa có đạm và tinh bột.", "Khuỷu hoặc cổ tay đau nhói thì nghỉ, chườm lạnh 15 phút.");
  if (type === "running") t.push("Tăng quãng đường tối đa 10%/tuần để tránh chấn thương.");
  if (type === "swimming") t.push("Khởi động vai kỹ, sau bơi giãn ngực và lưng.");
  return t;
}

// ---------------------------------------------------------------- Plan
function renderPlan(root) {
  const p = A.prog;
  const ph = phaseOf(A.profile.programStart);
  const mon = mondayOf(today());
  let h = `<section class="card">
    <span class="eyebrow">Chu kỳ ${ph.cycle} · bắt đầu ${shortDate(A.profile.programStart)}</span>
    <h2>Lộ trình <em>12 tuần.</em></h2>
    <div class="phases">${PHASES.map((x, i) => `<div class="phase ${i === ph.idx ? "on" : i < ph.idx ? "past" : ""}" style="flex:${x.w[1] - x.w[0] + 1}"><b>${x.short}</b><small>T${x.w[0]}${x.w[1] !== x.w[0] ? "–" + x.w[1] : ""}</small></div>`).join("")}</div>
    <p class="phase-note"><b>Tuần ${ph.week}: ${esc(ph.name)}.</b> ${esc(ph.vn)}</p>
  </section>
  <h2 class="sec">Lịch <em>tuần này.</em></h2>
  <div class="week">${WEEK_ORDER.map((d, i) => {
    const date = addDays(mon, i);
    const items = planFor(p, date);
    const st = dayStatus(date);
    return `<button class="wday" data-date="${date}" data-st="${st}" ${date === today() ? "data-today" : ""}>
      <span class="dw">${DOW[d]}</span><span class="dn num">${+date.slice(8)}</span><i class="dot"></i>
      <span class="ds">${items.map((it) => (it.kind === "gym" ? "Gym" : it.kind === "sport" ? esc(it.name) : "Nghỉ")).join(" + ")}</span></button>`;
  }).join("")}</div>
  <div class="legend"><span><i class="lg done"></i>Xong</span><span><i class="lg partial"></i>Dở</span><span><i class="lg missed"></i>Bỏ lỡ</span><span><i class="lg planned"></i>Sắp tới</span></div>
  <h2 class="sec">Một tuần <em>của bạn.</em></h2>
  <div class="sched">${WEEK_ORDER.map((d, i) => {
    const date = addDays(mon, i);
    return planFor(p, date)
      .map((it) => {
        const s = it.kind === "gym" ? p.sessions[it.key] : null;
        const focus = s ? [...new Set(s.exercises.slice(0, 3).map((e) => e.slotVn.toLowerCase()))].join(" + ") : it.kind === "sport" ? "Thể thao" : "Đi bộ nhẹ, giãn cơ";
        const min = it.kind === "gym" ? (+A.profile.gymMinutes || 60) : it.kind === "sport" ? it.minutes : 0;
        return `<a class="sched-row ${date === today() ? "today" : ""}" href="#train-today" data-date="${date}"><span class="d">${DOW[d]}</span><span class="s">${esc(it.name)}<small>${esc(focus)}</small></span><span class="m">${min ? min + " phút" : "Nghỉ"}</span></a>`;
      })
      .join("");
  }).join("")}</div>
  <h2 class="sec">Các <em>buổi tập.</em></h2>`;
  for (const k of p.keys) {
    const s = p.sessions[k];
    const days = p.week.filter((w) => w.items.some((i) => i.key === k)).map((w) => DOW_LONG[w.d]);
    h += `<details class="card session" ${k === p.keys[0] ? "open" : ""}><summary><div><b>${esc(s.name)}</b><small>${days.join(", ")} · ${s.exercises.length} bài</small></div></summary>
      <ol class="plan-list">${s.exercises.map((e) => `<li data-ex="${e.id}">${thumb(e.id, "s")}<div><b>${esc(e.vn)}</b><small class="num">${e.sets} × ${esc(e.reps)} · nghỉ ${esc(e.rest)}</small></div></li>`).join("")}</ol></details>`;
  }
  h += `<section class="card"><span class="eyebrow">Cardio & vận động</span><p>${esc(p.cardio.text)}</p></section>
  <section class="card notes"><span class="eyebrow">Ghi chú của PT</span><ul>${p.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></section>
  <button class="ghost block" data-act="restart">Bắt đầu chu kỳ mới từ hôm nay</button>`;
  root.innerHTML = h;
}

// ---------------------------------------------------------------- Library
async function renderLibrary(root) {
  if (!$("#lib-q", root)) {
    root.innerHTML = `<div class="lib-top">
      <input id="lib-q" type="search" placeholder="Tìm bài: mông, squat, vai, tạ đơn…" value="${esc(libQ)}" autocomplete="off" aria-label="Tìm bài tập">
      <select id="lib-eq" aria-label="Dụng cụ"><option value="">Mọi dụng cụ</option>${Object.entries(EQUIP_VN).map(([k, v]) => `<option value="${k}" ${libEquip === k ? "selected" : ""}>${v}</option>`).join("")}</select>
    </div>
    <div class="chips scroll" id="lib-groups">${GROUPS.map((g) => `<button class="chip" data-g="${g.k}" aria-pressed="${libGroup === g.k}">${g.vn}</button>`).join("")}</div>
    <p class="muted sm" id="lib-count">Đang tải thư viện…</p>
    <div class="lib-grid" id="lib-grid"></div>`;
    $("#lib-q", root).oninput = (e) => {
      libQ = e.target.value;
      libLimit = 40;
      drawLib(root);
    };
    $("#lib-eq", root).onchange = (e) => {
      libEquip = e.target.value;
      libLimit = 40;
      drawLib(root);
    };
  }
  await loadLibrary();
  drawLib(root);
}
function drawLib(root) {
  const res = searchLib(libQ, libGroup, libEquip);
  $$("#lib-groups .chip", root).forEach((c) => c.setAttribute("aria-pressed", c.dataset.g === libGroup));
  $("#lib-count", root).textContent = `${res.length} bài tập${libQ || libGroup || libEquip ? " phù hợp" : ""}. Bấm vào bài để xem ảnh động và cách tập.`;
  $("#lib-grid", root).innerHTML =
    res
      .slice(0, libLimit)
      .map(
        (x) => `<button class="lib-card" data-ex="${x.id}">
        <span class="img-wrap">${thumb(x.id)}</span>
        <span class="lc-t"><b>${esc(x.vn || x.n)}</b>${x.vn ? `<small>${esc(x.n)}</small>` : ""}<small class="tags">${x.pm.map((m) => MUSCLE_VN[m]).join(", ")} · ${EQUIP_VN[x.e] || "Khác"}</small></span>
      </button>`
      )
      .join("") + (res.length > libLimit ? `<button class="ghost block" data-act="more">Xem thêm ${Math.min(40, res.length - libLimit)} bài</button>` : "");
}

/** Exercise detail sheet with 2-frame animation. */
export async function showExercise(id) {
  await loadLibrary();
  const x = libById(id) || { id, n: id.replace(/_/g, " "), pm: [], sm: [], i: [], k: 2 };
  const vn = exName(id), cue = exCue(id);
  const body = openSheet(
    `<div class="ex-anim" aria-label="Ảnh động bài tập"><img id="anim-a" src="${imgUrl(id, 0)}" alt="${esc(vn || x.n)} – tư thế 1"><img id="anim-b" src="${imgUrl(id, 1)}" alt="${esc(vn || x.n)} – tư thế 2"></div>
    <h2>${esc(vn || x.n)}</h2>${vn ? `<p class="muted">${esc(x.n)}</p>` : ""}
    <div class="chips wrap static">${x.pm.map((m) => `<span class="chip on">${MUSCLE_VN[m]}</span>`).join("")}${x.sm.map((m) => `<span class="chip">${MUSCLE_VN[m]}</span>`).join("")}</div>
    <p class="muted sm">${EQUIP_VN[x.e] || "Khác"} · ${LEVEL_VN[x.l] || ""} · ${CAT_VN[x.c] || ""}</p>
    ${cue ? `<div class="cue"><b>Mẹo của PT:</b> ${esc(cue)}</div>` : ""}
    <div id="ex-vn"></div>
    ${x.i?.length ? `<details class="en"><summary>Hướng dẫn gốc (tiếng Anh)</summary><ol>${x.i.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></details>` : ""}
    <div class="row wrap gap">
      ${AI.AI_READY ? `<button class="primary" id="ex-ai">Hướng dẫn tiếng Việt chi tiết (AI)</button>` : ""}
      <a class="ghost" href="https://www.youtube.com/results?search_query=${encodeURIComponent(x.n + " proper form")}" target="_blank" rel="noopener">Xem video mẫu ↗</a>
    </div>`,
    { onClose: () => clearInterval(timer) }
  );
  let f = 0;
  const b = $("#anim-b", body);
  const timer = setInterval(() => {
    f ^= 1;
    b.style.opacity = f;
  }, 900);
  const cached = S.ls.get("tr_" + id);
  if (cached) $("#ex-vn", body).innerHTML = `<div class="ai-box">${md(cached)}</div>`;
  $("#ex-ai", body)?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Đang soạn hướng dẫn…";
    try {
      const txt = await AI.ask(
        `Viết hướng dẫn tập bài "${x.n}"${vn ? ` (${vn})` : ""} bằng tiếng Việt cho người tập gym: 1) Chuẩn bị, 2) Các bước thực hiện (3–5 bước), 3) Lỗi hay gặp (2–3 ý), 4) Cơ chính. Dựa trên hướng dẫn gốc: ${x.i.join(" ")}`,
        AI.PT_SYSTEM
      );
      S.ls.set("tr_" + id, txt);
      $("#ex-vn", body).innerHTML = `<div class="ai-box">${md(txt)}</div>`;
      btn.remove();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Thử lại";
      toast(AI.friendlyError(err), "bad");
    }
  });
}

// ---------------------------------------------------------------- Router entry
export async function renderTrain(root, sub) {
  sub = ["today", "plan", "burn", "muscles", "library"].includes(sub) ? sub : "today";
  if (!root.querySelector(".subtabs") || root.dataset.sub !== sub) {
    root.dataset.sub = sub;
    root.innerHTML = `<nav class="subtabs">${[["today", "Buổi tập"], ["plan", "Lộ trình"], ["library", "Bài tập"], ["muscles", "Nhóm cơ"], ["burn", "Gợi ý"]].map(([k, v]) => `<a href="#train-${k}" ${k === sub ? 'aria-current="page"' : ""}>${v}</a>`).join("")}</nav><div id="train-body"></div>`;
  }
  const body = $("#train-body", root);
  if (sub === "today") {
    await loadDay("workouts", curDate);
    renderToday(body);
  } else if (sub === "plan") renderPlan(body);
  else if (sub === "burn") renderBurn(body);
  else if (sub === "muscles") renderMuscles(body);
  else await renderLibrary(body);

  if (root._bound) return;
  root._bound = true;
  const onEdit = async (e) => {
    const t = e.target;
    if (!t.dataset.f) return;
    const ex = A.prog.sessions[sessionKeyFor(curDate)]?.exercises.find((x) => x.id === t.dataset.ex);
    if (!ex) return;
    const arr = ensureSets(curDate, ex);
    const i = +t.dataset.i, v = t.value.trim();
    const old = arr[i][t.dataset.f];
    if (old === v) return;
    arr[i][t.dataset.f] = v;
    // Changing the weight carries over to the following sets not done yet (e.g. moving up a plate).
    if (t.dataset.f === "kg") {
      for (let j = i + 1; j < arr.length; j++) if (!arr[j].done && arr[j].kg === old) arr[j].kg = v;
      remember(ex.id, arr[i], curDate);
      saveLater("workouts", curDate, () => A.workouts[curDate], 400);
      const y = scrollY;
      await renderTrain(root, root.dataset.sub);
      scrollTo(0, y);
      return;
    }
    saveLater("workouts", curDate, () => A.workouts[curDate], 900);
  };
  root.addEventListener("input", onEdit);
  root.addEventListener("change", onEdit);
  root.addEventListener("click", async (e) => {
    const exEl = e.target.closest("[data-ex]:not(input):not(button.tick):not([data-act])");
    if (exEl && !e.target.closest("input")) return showExercise(exEl.dataset.ex);
    const g = e.target.closest("[data-g]");
    if (g) {
      libGroup = libGroup === g.dataset.g ? "" : g.dataset.g;
      libLimit = 40;
      return drawLib(root);
    }
    const day = e.target.closest(".wday, .sched-row");
    if (day) {
      curDate = day.dataset.date;
      location.hash = "#train-today";
      return;
    }
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const a = b.dataset.act, date = curDate, sub = root.dataset.sub;
    const rerender = () => renderTrain(root, sub);
    if (a === "more") {
      libLimit += 40;
      return drawLib(root);
    }
    if (a === "prev" || a === "next" || a === "today") {
      curDate = a === "today" ? today() : addDays(date, a === "prev" ? -1 : 1);
      return rerender();
    }
    if (a === "cal") {
      return openCalendar(date, (d) => {
        curDate = d;
        rerender();
      });
    }
    if (a === "sess") {
      const w = getW(date);
      w.sessionKey = b.dataset.k;
      w.completed = false;
      saveLater("workouts", date, () => A.workouts[date], 0);
      return rerender();
    }
    if (a === "sport") {
      const w = getW(date);
      w.sports = { ...(w.sports || {}), [b.dataset.t]: !w.sports?.[b.dataset.t] };
      saveLater("workouts", date, () => A.workouts[date], 200);
      return rerender();
    }
    if (a === "tick" || a === "addset") {
      const ex = A.prog.sessions[sessionKeyFor(date)].exercises.find((x) => x.id === b.dataset.ex);
      const arr = ensureSets(date, ex);
      if (a === "tick") {
        const i = +b.dataset.i, s = arr[i];
        s.done = !s.done;
        if (s.done && i > 0) {
          if (!s.kg) s.kg = arr[i - 1].kg;
          if (!s.reps) s.reps = arr[i - 1].reps;
        }
        if (s.done) remember(ex.id, s, date);
        if (s.done && navigator.vibrate) navigator.vibrate(15);
      } else arr.push({ kg: arr.at(-1)?.kg ?? "", reps: arr.at(-1)?.reps ?? "", done: false }); // copy the last set
      saveLater("workouts", date, () => A.workouts[date], 300);
      const y = scrollY;
      await rerender();
      scrollTo(0, y);
      return;
    }
    if (a === "complete") {
      const w = getW(date);
      w.completed = !w.completed;
      w.sessionKey ??= sessionKeyFor(date);
      saveLater("workouts", date, () => A.workouts[date], 0);
      if (w.completed) toast("Tuyệt vời! Đã ghi nhận buổi tập.", "good");
      return rerender();
    }
    if (a === "apply") {
      const ex = A.prog.sessions[sessionKeyFor(date)].exercises.find((x) => x.id === b.dataset.ex);
      const arr = ensureSets(date, ex);
      arr.forEach((s) => !s.done && (s.kg = b.dataset.kg));
      remember(ex.id, arr[0], date);
      saveLater("workouts", date, () => A.workouts[date], 300);
      toast(`Đã đặt ${fmt(+b.dataset.kg, 1)} kg cho ${ex.vn}.`, "good");
      const y = scrollY;
      await rerender();
      scrollTo(0, y);
      return;
    }
    if (a === "ai-session") {
      const sess = A.prog.sessions[sessionKeyFor(date)];
      const w = getW(date);
      b.disabled = true;
      b.textContent = "PT AI đang xem buổi tập…";
      const lines = sess.exercises.map((ex) => {
        const now = (w.sets?.[ex.id] || []).filter((s) => s.done).map((s) => `${num(s.kg) ? s.kg + "kg" : "không tạ"}×${s.reps || "?"}`).join(", ") || "chưa tập";
        const prev = prevSession(date, ex.id);
        const before = prev ? prev.sets.map((s) => `${num(s.kg) ? s.kg + "kg" : "không tạ"}×${s.reps || "?"}`).join(", ") + ` (${prev.d})` : "chưa có";
        return `- ${ex.vn} (mục tiêu ${ex.sets}×${ex.reps}, ${ex.rir || ""}): hôm nay ${now}; lần trước ${before}`;
      });
      const ph = phaseOf(A.profile.programStart, date);
      try {
        const txt = await AI.ask(
          `Đánh giá buổi tập "${sess.name}" ngày ${date} (tuần ${ph.week}/12, giai đoạn ${ph.name}) theo nguyên tắc tăng tiến kép:
${lines.join("\n")}
Viết ngắn: 1) Nhận xét chung (1–2 câu), 2) Bài nào buổi sau nên TĂNG tạ hoặc số lần (ghi rõ kg mới, bước 2,5 kg), bài nào GIỮ, bài nào GIẢM, 3) 1 lưu ý kỹ thuật hoặc phục hồi.`,
          AI.PT_SYSTEM + "\n\n" + aiContext()
        );
        w.aiReview = txt;
        saveLater("workouts", date, () => A.workouts[date], 0);
        return rerender();
      } catch (err) {
        b.disabled = false;
        b.textContent = "Thử lại";
        toast(AI.friendlyError(err), "bad");
      }
      return;
    }
    if (a === "restart") {
      if (b.dataset.armed) {
        A.profile.programStart = today();
        await S.saveProfile(A.profile);
        toast("Đã bắt đầu chu kỳ 12 tuần mới.", "good");
        return rerender();
      }
      b.dataset.armed = "1";
      b.textContent = "Bấm lần nữa để xác nhận";
      setTimeout(() => {
        if (b.isConnected) {
          delete b.dataset.armed;
          b.textContent = "Bắt đầu chu kỳ mới từ hôm nay";
        }
      }, 3500);
    }
  });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches(".ex-head")) showExercise(e.target.dataset.ex);
  });
}
