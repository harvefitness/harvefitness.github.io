// Training: today's session logging, the full roadmap, and the exercise library.
import { A, saveLater, loadDay } from "./state.js";
import * as S from "./store.js";
import { SPORTS } from "./calc.js";
import { planFor, PHASES, phaseOf } from "./program.js";
import { loadLibrary, searchLib, GROUPS, EQUIP_VN, MUSCLE_VN, CAT_VN, LEVEL_VN, imgUrl, libById, exName, exCue } from "./exercises.js";
import * as AI from "./ai.js";
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
function setsOf(date, ex) {
  const arr = A.workouts[date]?.sets?.[ex.id];
  if (arr?.length) return arr;
  return Array.from({ length: ex.sets }, () => ({ kg: "", reps: "", done: false }));
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
    <b>${date === today() ? "Hôm nay · " : ""}${niceDate(date)}</b>
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

  sess.exercises.forEach((ex, n) => {
    const arr = setsOf(date, ex);
    const all = arr.every((s) => s.done);
    const lt = lastTime(date, ex.id);
    h += `<article class="ex${all ? " done" : ""}">
      <div class="ex-head" data-ex="${ex.id}" role="button" tabindex="0" aria-label="Xem hướng dẫn ${esc(ex.vn)}">
        ${thumb(ex.id)}
        <div class="ex-t"><span class="eyebrow">${n + 1} · ${esc(ex.slotVn)}</span><h3>${esc(ex.vn)}</h3>
        <span class="rx num">${ex.sets} × ${esc(ex.reps)} · nghỉ ${esc(ex.rest)}${ex.rir ? " · " + esc(ex.rir) : ""}</span>
        ${lt ? `<span class="last">Lần trước ${esc(lt.txt)}</span>` : ""}</div>
      </div>
      <div class="sets">${arr
        .map(
          (s, i) => `<div class="set"><span class="n">${i + 1}</span>
          <input id="kg-${ex.id}-${i}" inputmode="decimal" placeholder="kg" value="${esc(s.kg)}" data-ex="${ex.id}" data-i="${i}" data-f="kg" aria-label="Hiệp ${i + 1}: kg">
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
  <p class="muted sm">Tăng tiến: khi làm đủ số lần cao nhất ở mọi hiệp với kỹ thuật chuẩn, buổi sau tăng tạ (chân +2,5–5 kg, tay +1–2 kg).</p>`;
  root.innerHTML = h;
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
    <h2>Lộ trình 12 tuần</h2>
    <div class="phases">${PHASES.map((x, i) => `<div class="phase ${i === ph.idx ? "on" : i < ph.idx ? "past" : ""}" style="flex:${x.w[1] - x.w[0] + 1}"><b>${x.short}</b><small>T${x.w[0]}${x.w[1] !== x.w[0] ? "–" + x.w[1] : ""}</small></div>`).join("")}</div>
    <p class="phase-note"><b>Tuần ${ph.week}: ${esc(ph.name)}.</b> ${esc(ph.vn)}</p>
  </section>
  <h3 class="sec">Lịch tuần này</h3>
  <div class="week">${WEEK_ORDER.map((d, i) => {
    const date = addDays(mon, i);
    const items = planFor(p, date);
    const st = dayStatus(date);
    return `<button class="wday" data-date="${date}" data-st="${st}" ${date === today() ? "data-today" : ""}>
      <span class="dw">${DOW[d]}</span><span class="dn num">${+date.slice(8)}</span><i class="dot"></i>
      <span class="ds">${items.map((it) => (it.kind === "gym" ? "Gym" : it.kind === "sport" ? esc(it.name) : "Nghỉ")).join(" + ")}</span></button>`;
  }).join("")}</div>
  <div class="legend"><span><i class="lg done"></i>Xong</span><span><i class="lg partial"></i>Dở</span><span><i class="lg missed"></i>Bỏ lỡ</span><span><i class="lg planned"></i>Sắp tới</span></div>
  <h3 class="sec">Các buổi tập</h3>`;
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
  sub = ["today", "plan", "library"].includes(sub) ? sub : "today";
  if (!root.querySelector(".subtabs") || root.dataset.sub !== sub) {
    root.dataset.sub = sub;
    root.innerHTML = `<nav class="subtabs">${[["today", "Buổi tập"], ["plan", "Lộ trình"], ["library", "Thư viện bài tập"]].map(([k, v]) => `<a href="#train-${k}" ${k === sub ? 'aria-current="page"' : ""}>${v}</a>`).join("")}</nav><div id="train-body"></div>`;
  }
  const body = $("#train-body", root);
  if (sub === "today") {
    await loadDay("workouts", curDate);
    renderToday(body);
  } else if (sub === "plan") renderPlan(body);
  else await renderLibrary(body);

  if (root._bound) return;
  root._bound = true;
  root.addEventListener("input", (e) => {
    const t = e.target;
    if (!t.dataset.f) return;
    const ex = A.prog.sessions[sessionKeyFor(curDate)]?.exercises.find((x) => x.id === t.dataset.ex);
    if (!ex) return;
    ensureSets(curDate, ex)[+t.dataset.i][t.dataset.f] = t.value.trim();
    saveLater("workouts", curDate, () => A.workouts[curDate], 900);
  });
  root.addEventListener("click", async (e) => {
    const exEl = e.target.closest("[data-ex]:not(input):not(button.tick):not([data-act])");
    if (exEl && !e.target.closest("input")) return showExercise(exEl.dataset.ex);
    const g = e.target.closest("[data-g]");
    if (g) {
      libGroup = libGroup === g.dataset.g ? "" : g.dataset.g;
      libLimit = 40;
      return drawLib(root);
    }
    const day = e.target.closest(".wday");
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
        if (s.done && navigator.vibrate) navigator.vibrate(15);
      } else arr.push({ kg: arr.at(-1)?.kg || "", reps: "", done: false });
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
