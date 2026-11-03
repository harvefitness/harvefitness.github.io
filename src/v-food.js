// Nutrition: daily meal plan + food log with PT analysis.
import { A, saveLater, loadDay, isTrainingDay, waterGoalCups, aiContext } from "./state.js";
import { FOODS, foodById, totals, itemView, mealPlan, analyzeDay, grade, MEAL_SLOTS } from "./food.js";
import { planFor } from "./program.js";
import * as AI from "./ai.js";
import { esc, num, fmt, fold, today, addDays, niceDate, hm, $, $$, openSheet, closeSheet, toast, md, bar, clamp } from "./ui.js";

let planDate = today();
let logDate = today();
const salts = {};

function getLog(date) {
  return (A.food[date] ||= { date, meals: {}, water: 0 });
}
function slotForTime(t) {
  const m = hm(t);
  if (m < 630) return "sang";
  if (m < 900) return "trua";
  if (m < 1110) return "chieu";
  return "toi";
}

// ---------------------------------------------------------------- Plan
function renderPlan(root) {
  const date = planDate;
  const training = isTrainingDay(date);
  const gym = planFor(A.prog, date).find((i) => i.kind === "gym");
  const sport = planFor(A.prog, date).find((i) => i.kind === "sport");
  const trainTime = gym ? A.profile.trainTime : sport?.time || A.profile.trainTime;
  const plan = mealPlan(A.profile, A.t, { date, training, trainTime, salt: salts[date] || "" });
  const t = A.t;
  const tgtKcal = training ? t.kcal : t.restKcal;
  let h = `<div class="row between">
    <div class="seg">${[[today(), "Hôm nay"], [addDays(today(), 1), "Ngày mai"]].map(([d, l]) => `<button class="seg-b" data-act="pdate" data-d="${d}" aria-pressed="${d === date}">${l}</button>`).join("")}</div>
    <span class="pill ${training ? "accent" : ""}">${training ? "Ngày tập" : "Ngày nghỉ"}</span>
  </div>
  <section class="card macro-card">
    <div class="row between"><span class="eyebrow">Mục tiêu ${niceDate(date)}</span><span class="num muted sm">Nước ${(waterGoalCups(date) * 0.25).toFixed(2).replace(/0$/, "").replace(".", ",")} lít</span></div>
    <div class="macros">
      <div><b class="num">${fmt(tgtKcal)}</b><small>kcal</small></div>
      <div><b class="num">${t.protein}g</b><small>Đạm</small></div>
      <div><b class="num">${training ? t.carbs : t.restCarbs}g</b><small>Tinh bột</small></div>
      <div><b class="num">${t.fat}g</b><small>Béo</small></div>
    </div>
    <p class="muted sm">Thực đơn gợi ý: ${fmt(plan.day.kcal)} kcal · đạm ${fmt(plan.day.p)}g · tinh bột ${fmt(plan.day.c)}g · béo ${fmt(plan.day.f)}g</p>
  </section>`;
  for (const [i, m] of plan.meals.entries()) {
    h += `<article class="card meal">
      <div class="row between"><div><span class="eyebrow num">${m.time}</span><h3>${esc(m.label)}</h3></div>
      <span class="num muted sm">${fmt(m.kcal)} kcal · ${fmt(m.p)}g đạm</span></div>
      <ul class="food-list">${m.items.map((it) => {
        const v = itemView(it);
        return `<li><span>${esc(v.name)}</span><span class="muted num">${esc(v.portion)}</span></li>`;
      }).join("")}</ul>
      ${m.note ? `<p class="note">${esc(m.note)}</p>` : ""}
      <button class="ghost sm" data-act="ate" data-i="${i}">Đã ăn bữa này → ghi nhật ký</button>
    </article>`;
  }
  h += `<div class="row gap wrap"><button class="ghost" data-act="reroll">Đổi thực đơn khác</button>
    <a class="ghost" href="#chat" data-prefill="Gợi ý giúp mình thực đơn hôm nay theo món mình thích: ">Nhờ PT AI soạn theo món mình thích</a></div>
    <p class="muted sm">Khẩu phần thịt/cá tính theo trọng lượng đã nấu chín. 100g ≈ 1 lòng bàn tay. Đổi món cùng nhóm (gà ↔ cá ↔ tôm ↔ bò nạc) thoải mái.</p>`;
  root.innerHTML = h;
  root._plan = plan;
}

// ---------------------------------------------------------------- Log
function renderLog(root) {
  const date = logDate;
  const log = A.food[date] || { meals: {}, water: 0 };
  const training = isTrainingDay(date);
  const an = analyzeDay(log, A.t, { training, p: A.profile });
  const g = grade(an.score);
  const cups = waterGoalCups(date);
  const bars = [
    ["Calo", an.tot.kcal, an.target.kcal, "kcal"],
    ["Đạm", an.tot.p, an.target.p, "g"],
    ["Tinh bột", an.tot.c, an.target.c, "g"],
    ["Béo", an.tot.f, an.target.f, "g"],
  ];
  let h = `<div class="row between">
    <div class="datenav"><button class="icon-btn" data-act="lprev" aria-label="Ngày trước">‹</button><b>${date === today() ? "Hôm nay · " : ""}${niceDate(date)}</b><button class="icon-btn" data-act="lnext" aria-label="Ngày sau">›</button></div>
    <span class="pill ${training ? "accent" : ""}">${training ? "Ngày tập" : "Ngày nghỉ"}</span>
  </div>
  <section class="card analysis">
    <div class="score-row">
      <div class="score ${g.k}"><b class="num">${an.score ?? "–"}</b><small>/100</small></div>
      <div><span class="eyebrow">PT đánh giá</span><h3>${g.t}</h3></div>
    </div>
    <div class="mbars">${bars.map(([l, v, tg, u]) => `<div class="mbar ${v > tg * 1.12 ? "over" : ""}"><div class="row between"><span>${l}</span><span class="num">${fmt(v)} / ${fmt(tg)} ${u}</span></div>${bar(tg ? (v / tg) * 100 : 0)}</div>`).join("")}</div>
    ${an.findings.length ? `<ul class="findings">${an.findings.map((f) => `<li class="${f.kind}">${esc(f.text)}</li>`).join("")}</ul>` : `<p class="muted">Ghi món ăn bên dưới, PT sẽ chấm điểm và nhận xét ngay.</p>`}
    ${an.fixes.length && date === today() ? `<div class="fixes"><b>Ăn thêm để đủ hôm nay:</b><ul>${an.fixes.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></div>` : ""}
    ${log.aiReview ? `<div class="ai-box"><span class="eyebrow">Nhận xét chi tiết của PT AI</span>${md(log.aiReview)}</div>` : ""}
    ${AI.AI_READY && an.score != null ? `<button class="ghost block" data-act="ai-review">${log.aiReview ? "Phân tích lại với PT AI" : "Nhờ PT AI phân tích chi tiết"}</button>` : ""}
  </section>
  <section class="card water">
    <div class="row between"><span class="eyebrow">Nước · ${log.water || 0}/${cups} cốc 250ml</span></div>
    <div class="cups">${Array.from({ length: cups }, (_, i) => `<button class="cup" data-act="water" data-i="${i}" aria-pressed="${i < (log.water || 0)}" aria-label="Cốc ${i + 1}"></button>`).join("")}</div>
  </section>`;
  for (const [k, label] of Object.entries(MEAL_SLOTS)) {
    const items = log.meals?.[k] || [];
    const tt = totals(items);
    h += `<section class="card meal">
      <div class="row between"><h3>${label}</h3>${items.length ? `<span class="num muted sm">${fmt(tt.kcal)} kcal · ${fmt(tt.p)}g đạm</span>` : ""}</div>
      ${items.length ? `<ul class="food-list edit">${items.map((it, i) => {
        const v = itemView(it);
        return `<li><span>${esc(v.name)}<small class="muted"> ${esc(v.portion)}</small></span><span class="num muted">${fmt(v.kcal)}</span><button class="x" data-act="del" data-slot="${k}" data-i="${i}" aria-label="Xóa ${esc(v.name)}">✕</button></li>`;
      }).join("")}</ul>` : ""}
      <button class="link" data-act="add" data-slot="${k}">+ Thêm món</button>
    </section>`;
  }
  root.innerHTML = h;
}

// ---------------------------------------------------------------- Add-food sheet
function openAdd(slot, onDone) {
  let mode = "list", q = "", qty = {}, aiItems = null;
  const body = openSheet(`<h2>Thêm vào ${MEAL_SLOTS[slot].toLowerCase()}</h2>
    <div class="seg full">${[["list", "Món có sẵn"], ["ai", "Mô tả bằng lời (AI)"], ["manual", "Tự nhập"]].map(([k, v]) => `<button class="seg-b" data-m="${k}">${v}</button>`).join("")}</div>
    <div id="add-body"></div>`, { wide: true });
  const draw = () => {
    $$(".seg-b", body).forEach((b) => b.setAttribute("aria-pressed", b.dataset.m === mode));
    const ab = $("#add-body", body);
    if (mode === "list") {
      const f = fold(q);
      const res = FOODS.filter((x) => !f || x.s.includes(f)).slice(0, 60);
      ab.innerHTML = `<input id="food-q" type="search" placeholder="Tìm: cơm, ức gà, phở, trà sữa…" value="${esc(q)}" autocomplete="off" aria-label="Tìm món">
        <ul class="pick">${res.map((x) => `<li><div><b>${esc(x.n)}</b><small class="muted num">${esc(x.portion)} · ${x.kcal} kcal · ${x.p}g đạm</small></div>
          <div class="stepper"><button data-q="${x.id}" data-d="-0.5" aria-label="Bớt">−</button><span class="num">${qty[x.id] || 0}</span><button data-q="${x.id}" data-d="0.5" aria-label="Thêm">+</button></div></li>`).join("")}</ul>
        <button class="primary block sticky" data-act="add-list" ${Object.values(qty).some((v) => v > 0) ? "" : "disabled"}>Thêm ${Object.values(qty).filter((v) => v > 0).length || ""} món</button>`;
      const inp = $("#food-q", ab);
      inp.oninput = () => {
        q = inp.value;
        const pos = inp.selectionStart;
        draw();
        const n = $("#food-q", body);
        n.focus();
        n.setSelectionRange(pos, pos);
      };
    } else if (mode === "ai") {
      ab.innerHTML = AI.AI_READY
        ? `<label class="fld"><span>Bạn đã ăn gì? Ghi càng rõ càng tốt.</span><textarea id="ai-text" rows="3" placeholder="VD: 1 đĩa cơm tấm sườn bì chả, 1 ly trà đá, nửa quả xoài"></textarea></label>
          <button class="primary block" data-act="ai-est">Ước tính calo & dinh dưỡng</button>
          <div id="ai-res">${aiItems ? aiList(aiItems) : ""}</div>`
        : `<p class="muted">Tính năng AI cần kết nối Firebase (xem HUONG-DAN.md).</p>`;
    } else {
      ab.innerHTML = `<form id="man" class="grid2">
        <label class="fld full"><span>Tên món</span><input id="m-n" required placeholder="VD: Bánh tráng trộn"></label>
        <label class="fld"><span>Calo (kcal)</span><input id="m-k" inputmode="numeric" required></label>
        <label class="fld"><span>Đạm (g)</span><input id="m-p" inputmode="decimal"></label>
        <label class="fld"><span>Tinh bột (g)</span><input id="m-c" inputmode="decimal"></label>
        <label class="fld"><span>Béo (g)</span><input id="m-f" inputmode="decimal"></label>
        <button class="primary block full" type="submit">Thêm món</button></form>`;
      $("#man", ab).onsubmit = (e) => {
        e.preventDefault();
        const n = $("#m-n", ab).value.trim(), k = num($("#m-k", ab).value);
        if (!n || k == null) return toast("Nhập tên món và số calo.", "bad");
        onDone([{ n, kcal: k, p: num($("#m-p", ab).value) || 0, c: num($("#m-c", ab).value) || 0, f: num($("#m-f", ab).value) || 0, qty: 1 }]);
        closeSheet();
      };
    }
  };
  const aiList = (items) => `<ul class="pick ai">${items.map((x, i) => `<li><div><b>${esc(x.n)}</b><small class="muted num">${esc(x.portion || "")} · ${Math.round(x.kcal)} kcal · ${Math.round(x.p)}g đạm · ${Math.round(x.c)}g tinh bột · ${Math.round(x.f)}g béo</small></div><button class="x" data-ai-del="${i}" aria-label="Bỏ">✕</button></li>`).join("")}</ul>
    <button class="primary block" data-act="add-ai">Thêm ${items.length} món</button><p class="muted sm">AI ước tính theo khẩu phần phổ biến. Sai lệch ±15%.</p>`;
  body.addEventListener("click", async (e) => {
    const m = e.target.closest("[data-m]");
    if (m) {
      mode = m.dataset.m;
      return draw();
    }
    const st = e.target.closest("[data-q]");
    if (st) {
      qty[st.dataset.q] = clamp((qty[st.dataset.q] || 0) + +st.dataset.d, 0, 10);
      return draw();
    }
    const del = e.target.closest("[data-ai-del]");
    if (del) {
      aiItems.splice(+del.dataset.aiDel, 1);
      return draw();
    }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "add-list") {
      onDone(Object.entries(qty).filter(([, v]) => v > 0).map(([id, v]) => ({ id, qty: v })));
      closeSheet();
    }
    if (b.dataset.act === "add-ai") {
      onDone(aiItems.map((x) => ({ ...x, qty: 1, ai: true })));
      closeSheet();
    }
    if (b.dataset.act === "ai-est") {
      const text = $("#ai-text", body).value.trim();
      if (!text) return toast("Mô tả món bạn đã ăn.", "bad");
      b.disabled = true;
      b.textContent = "Đang ước tính…";
      try {
        const res = await AI.askJSON(
          `Ước tính dinh dưỡng cho bữa ăn sau (món Việt Nam, khẩu phần phổ biến ở Việt Nam nếu không ghi rõ): "${text}".
Trả về JSON dạng {"items":[{"n":"tên món tiếng Việt","portion":"khẩu phần","kcal":số,"p":gam đạm,"c":gam tinh bột,"f":gam béo,"tags":"chuỗi ký tự: r nếu chiên/nhiều mỡ, u nếu đồ ngọt/nước có đường, a nếu rượu bia, v nếu là rau"}]}. Mỗi món một dòng.`,
          "Bạn là chuyên gia dinh dưỡng Việt Nam. Dùng Bảng thành phần thực phẩm Việt Nam và USDA. Chỉ trả về JSON."
        );
        aiItems = (res.items || res || []).filter((x) => x && x.n).map((x) => ({ n: String(x.n), portion: String(x.portion || ""), kcal: +x.kcal || 0, p: +x.p || 0, c: +x.c || 0, f: +x.f || 0, tags: String(x.tags || "") }));
        if (!aiItems.length) throw new Error("Không nhận ra món ăn");
        draw();
      } catch (err) {
        b.disabled = false;
        b.textContent = "Thử lại";
        toast(AI.friendlyError(err), "bad");
      }
    }
  });
  draw();
}

// ---------------------------------------------------------------- Router entry
export async function renderFood(root, sub) {
  sub = ["plan", "log"].includes(sub) ? sub : "plan";
  root.dataset.sub = sub;
  if (!root.querySelector(".subtabs") || root.dataset.drawn !== sub) {
    root.dataset.drawn = sub;
    root.innerHTML = `<nav class="subtabs">${[["plan", "Thực đơn gợi ý"], ["log", "Nhật ký ăn uống"]].map(([k, v]) => `<a href="#food-${k}" ${k === sub ? 'aria-current="page"' : ""}>${v}</a>`).join("")}</nav><div id="food-body"></div>`;
  }
  const body = $("#food-body", root);
  if (sub === "plan") renderPlan(body);
  else {
    await loadDay("food", logDate);
    renderLog(body);
  }
  if (root._bound) return;
  root._bound = true;
  const save = (d) => saveLater("food", d, () => A.food[d], 300);
  root.addEventListener("click", async (e) => {
    const pre = e.target.closest("[data-prefill]");
    if (pre) sessionStorage.setItem("chat_prefill", pre.dataset.prefill);
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const a = b.dataset.act;
    const redraw = () => renderFood(root, root.dataset.sub);
    if (a === "pdate") {
      planDate = b.dataset.d;
      return redraw();
    }
    if (a === "reroll") {
      salts[planDate] = String(Math.random());
      return redraw();
    }
    if (a === "ate") {
      const m = $("#food-body", root)._plan.meals[+b.dataset.i];
      const slot = slotForTime(m.time);
      await loadDay("food", planDate);
      const log = getLog(planDate);
      (log.meals[slot] ||= []).push(...m.items.filter((x) => x.id !== "creatine").map((x) => ({ ...x })));
      save(planDate);
      toast(`Đã ghi vào ${MEAL_SLOTS[slot].toLowerCase()} ${planDate === today() ? "hôm nay" : niceDate(planDate)}.`, "good");
      return;
    }
    if (a === "lprev" || a === "lnext") {
      logDate = addDays(logDate, a === "lprev" ? -1 : 1);
      return redraw();
    }
    if (a === "water") {
      const log = getLog(logDate);
      const i = +b.dataset.i;
      log.water = (log.water || 0) === i + 1 ? i : i + 1;
      save(logDate);
      return redraw();
    }
    if (a === "del") {
      const log = getLog(logDate);
      log.meals[b.dataset.slot].splice(+b.dataset.i, 1);
      delete log.aiReview;
      save(logDate);
      return redraw();
    }
    if (a === "add") {
      const slot = b.dataset.slot;
      const d = logDate;
      openAdd(slot, (items) => {
        const log = getLog(d);
        (log.meals[slot] ||= []).push(...items);
        delete log.aiReview;
        save(d);
        toast(`Đã thêm ${items.length} món.`, "good");
        redraw();
      });
      return;
    }
    if (a === "ai-review") {
      const d = logDate;
      const log = getLog(d);
      b.disabled = true;
      b.textContent = "PT AI đang phân tích…";
      const lines = Object.entries(log.meals || {})
        .filter(([, v]) => v?.length)
        .map(([k, v]) => `${MEAL_SLOTS[k]}: ${v.map((it) => { const x = itemView(it); return `${x.name} (${x.portion}, ${Math.round(x.kcal)} kcal, ${Math.round(x.p)}g đạm, ${Math.round(x.c)}g tinh bột, ${Math.round(x.f)}g béo)`; }).join("; ")}`);
      const an = analyzeDay(log, A.t, { training: isTrainingDay(d), p: A.profile });
      try {
        const txt = await AI.ask(
          `Phân tích nhật ký ăn ngày ${d} (${isTrainingDay(d) ? "ngày tập" : "ngày nghỉ"}) như một PT:
${lines.join("\n")}
Tổng: ${Math.round(an.tot.kcal)} kcal, đạm ${Math.round(an.tot.p)}g, tinh bột ${Math.round(an.tot.c)}g, béo ${Math.round(an.tot.f)}g. Mục tiêu: ${an.target.kcal} kcal, đạm ${an.target.p}g, tinh bột ${an.target.c}g, béo ${an.target.f}g. Nước: ${log.water || 0} cốc.
Viết: 1) Đánh giá chung (1–2 câu), 2) Điểm tốt, 3) Cần sửa (cụ thể từng bữa), 4) Gợi ý thay thế món cụ thể cho lần sau, 5) ${d === today() ? "Nên ăn gì thêm cho phần còn lại của hôm nay" : "Lưu ý cho ngày mai"}.`,
          AI.PT_SYSTEM + "\n\n" + aiContext()
        );
        log.aiReview = txt;
        save(d);
        redraw();
      } catch (err) {
        b.disabled = false;
        b.textContent = "Thử lại";
        toast(AI.friendlyError(err), "bad");
      }
    }
  });
}
