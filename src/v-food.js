// Nutrition: daily meal plan + food log with PT analysis.
import { A, saveLater, loadDay, isTrainingDay, waterGoalCups, aiContext } from "./state.js";
import { FOODS, foodById, totals, itemView, mealPlan, analyzeDay, grade, MEAL_SLOTS } from "./food.js";
import { planFor } from "./program.js";
import * as AI from "./ai.js";
import { compressImage, canRecord, startRecording, micErrorText } from "./snap.js";
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
    <div class="cups">${Array.from({ length: Math.max(cups, log.water || 0) }, (_, i) => `<button class="cup" data-act="water" data-i="${i}" aria-pressed="${i < (log.water || 0)}" aria-label="Cốc ${i + 1}"></button>`).join("")}</div>
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
const NUTRI_SYS = "Bạn là chuyên gia dinh dưỡng thể thao Việt Nam. Dùng Bảng thành phần thực phẩm Việt Nam (Viện Dinh dưỡng) và USDA. Ước lượng thực tế, không làm tròn quá thô. Chỉ trả về JSON hợp lệ.";
const NUTRI_FMT = `Trả về JSON đúng dạng:
{"transcript":"(chỉ khi có ghi âm) câu người dùng nói","items":[{"n":"tên món tiếng Việt","portion":"khẩu phần ước lượng, vd 1 đĩa ~350g","kcal":số,"p":gam đạm,"c":gam tinh bột,"f":gam chất béo,"tags":"r nếu chiên/xào nhiều dầu/nhiều mỡ; u nếu đồ ngọt/nước có đường; a nếu rượu bia; v nếu là rau"}],"note":"1–2 câu nhận xét kiểu PT về bữa này, tiếng Việt"}
Mỗi món/đồ uống một dòng. Không nhận ra đồ ăn thì "items": [].`;

function openAdd(slot, onDone, { start } = {}) {
  let mode = AI.AI_READY ? "ai" : "list", q = "", qty = {};
  let aiItems = null, aiNote = "", photo = null, text = "", rec = null, busy = false;
  const body = openSheet(`<h2>Thêm vào ${MEAL_SLOTS[slot].toLowerCase()}</h2>
    <div class="seg full">${[["ai", "Chụp · Nói"], ["list", "Có sẵn"], ["manual", "Tự nhập"]].map(([k, v]) => `<button class="seg-b" data-m="${k}">${v}</button>`).join("")}</div>
    <input type="file" id="snap-file" accept="image/*" hidden>
    <div id="add-body"></div>`, { wide: true, onClose: () => rec?.cancel() });
  const fileInput = $("#snap-file", body);

  const resultHtml = () => {
    if (!aiItems) return "";
    if (!aiItems.length) return `<div class="empty">${esc(aiNote || "AI không nhận ra món ăn.")} Thử chụp gần hơn, đủ sáng, hoặc gõ thêm mô tả.</div>`;
    const tot = aiItems.reduce((t, x) => ({ kcal: t.kcal + x.kcal * x.qty, p: t.p + x.p * x.qty, c: t.c + x.c * x.qty, f: t.f + x.f * x.qty }), { kcal: 0, p: 0, c: 0, f: 0 });
    return `<div class="macros">
        <div><b>${fmt(tot.kcal)}</b><small>kcal</small></div><div><b>${fmt(tot.p)}g</b><small>Đạm</small></div>
        <div><b>${fmt(tot.c)}g</b><small>Tinh bột</small></div><div><b>${fmt(tot.f)}g</b><small>Béo</small></div></div>
      ${aiNote ? `<p class="note">${esc(aiNote)}</p>` : ""}
      <ul class="pick ai">${aiItems.map((x, i) => `<li><div><b>${esc(x.n)}</b><small class="muted num">${esc(x.portion || "")} · ${fmt(x.kcal * x.qty)} kcal · đạm ${fmt(x.p * x.qty)}g · tinh bột ${fmt(x.c * x.qty)}g · béo ${fmt(x.f * x.qty)}g</small></div>
        <div class="stepper"><button data-aq="${i}" data-d="-0.5" aria-label="Bớt">−</button><span class="num">${String(x.qty).replace(".", ",")}</span><button data-aq="${i}" data-d="0.5" aria-label="Thêm">+</button></div></li>`).join("")}</ul>
      <p class="muted sm">Ăn nửa phần thì bấm − để còn 0,5. Bấm − về 0 để bỏ món. AI ước tính có thể lệch khoảng ±15%.</p>
      <button class="primary block sticky" data-act="add-ai" ${aiItems.some((x) => x.qty > 0) ? "" : "disabled"}>Thêm ${aiItems.filter((x) => x.qty > 0).length} món vào nhật ký</button>`;
  };

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
      if (!AI.AI_READY) {
        ab.innerHTML = `<p class="muted">Tính năng AI cần kết nối Firebase.</p>`;
        return;
      }
      ab.innerHTML = `<div class="snap">
          <button class="snap-btn" data-act="photo" ${busy ? "disabled" : ""}><svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg><b>Chụp ảnh món</b><small>hoặc chọn ảnh có sẵn</small></button>
          <button class="snap-btn ${rec ? "rec" : ""}" data-act="voice" ${busy && !rec ? "disabled" : ""}><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg><b id="rec-label">${rec ? "Đang nghe… bấm để xong" : "Nói món ăn"}</b><small id="rec-time">${rec ? "0 giây" : "VD: “trưa ăn 1 tô phở bò”"}</small></button>
        </div>
        ${photo ? `<div class="snap-photo"><img src="${photo.url}" alt="Ảnh món ăn"><button class="x" data-act="photo-del" aria-label="Bỏ ảnh">✕</button></div>` : ""}
        <label class="fld"><span>${photo ? "Ghi chú thêm (không bắt buộc)" : "Hoặc gõ món đã ăn"}</span><textarea id="ai-text" rows="2" placeholder="${photo ? "VD: ăn hết nửa đĩa, cơm ít, không ăn da gà" : "VD: 1 đĩa cơm tấm sườn bì chả, 1 ly trà đá"}">${esc(text)}</textarea></label>
        ${busy ? `<div class="ai-wait"><i></i><span>${busy}</span></div>` : `<button class="primary block" data-act="ai-est" ${photo || text.trim() ? "" : "disabled"}>Phân tích calo & dinh dưỡng</button>`}
        <div id="ai-res">${resultHtml()}</div>`;
      const ta = $("#ai-text", ab);
      ta.oninput = () => {
        text = ta.value;
        const btn = $("[data-act=ai-est]", ab);
        if (btn) btn.disabled = !(photo || text.trim());
      };
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

  // ---- AI analysis (photo and/or text and/or audio) ----
  const analyze = async (audio) => {
    busy = audio ? "AI đang nghe và tính calo…" : photo ? "AI đang xem ảnh và tính calo…" : "AI đang tính calo…";
    aiItems = null;
    draw();
    const parts = [];
    if (photo) parts.push(`Ảnh dưới đây là bữa ăn của người dùng (món Việt Nam là chính). Nhận diện từng món/đồ uống, ước lượng khẩu phần dựa trên kích thước đĩa, bát, đũa, muỗng trong ảnh.`, { inlineData: { mimeType: photo.mimeType, data: photo.base64 } });
    if (audio) parts.push(`Đoạn ghi âm dưới đây là người dùng nói bằng tiếng Việt họ đã ăn/uống gì. Chép lại câu nói vào "transcript" rồi ước tính từng món (khẩu phần phổ biến ở Việt Nam nếu không nói rõ).`, { inlineData: { mimeType: audio.mimeType, data: audio.base64 } });
    if (text.trim()) parts.push(`${photo || audio ? "Ghi chú thêm của người dùng" : "Người dùng mô tả bữa ăn"}: "${text.trim()}"`);
    parts.push(NUTRI_FMT);
    try {
      const res = await AI.askJSON(parts, NUTRI_SYS);
      aiItems = (res.items || []).filter((x) => x && x.n).map((x) => ({ n: String(x.n), portion: String(x.portion || ""), kcal: +x.kcal || 0, p: +x.p || 0, c: +x.c || 0, f: +x.f || 0, tags: String(x.tags || ""), qty: 1 }));
      aiNote = String(res.note || "");
      if (audio && res.transcript && !text.trim()) text = String(res.transcript);
    } catch (err) {
      toast(AI.friendlyError(err), "bad");
    }
    busy = false;
    draw();
    $("#ai-res", body)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  fileInput.onchange = async () => {
    const f = fileInput.files?.[0];
    fileInput.value = "";
    if (!f) return;
    try {
      photo = await compressImage(f);
      analyze();
    } catch (err) {
      toast(err.message, "bad");
    }
  };

  const toggleVoice = async () => {
    if (rec) {
      const r = rec;
      rec = null;
      try {
        const audio = await r.stop();
        if (audio.seconds < 1) {
          toast("Ghi âm quá ngắn, bấm giữ lâu hơn rồi nói nhé.", "bad");
          return draw();
        }
        analyze(audio);
      } catch (err) {
        toast(micErrorText(err), "bad");
        draw();
      }
      return;
    }
    if (!canRecord()) return toast("Trình duyệt này chưa hỗ trợ ghi âm. Hãy gõ món ăn vào ô bên dưới.", "bad");
    try {
      rec = await startRecording({
        onTick: (s) => {
          const t = $("#rec-time", body);
          if (t) t.textContent = `${s} giây · tối đa 45 giây`;
          if (s >= 45 && rec) toggleVoice();
        },
      });
      if (navigator.vibrate) navigator.vibrate(20);
      draw();
    } catch (err) {
      rec = null;
      toast(micErrorText(err), "bad");
      draw();
    }
  };

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
    const aq = e.target.closest("[data-aq]");
    if (aq) {
      const it = aiItems[+aq.dataset.aq];
      it.qty = clamp(it.qty + +aq.dataset.d, 0, 10);
      $("#ai-res", body).innerHTML = resultHtml();
      return;
    }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "photo") fileInput.click();
    if (act === "photo-del") {
      photo = null;
      return draw();
    }
    if (act === "voice") toggleVoice();
    if (act === "ai-est") analyze();
    if (act === "add-list") {
      onDone(Object.entries(qty).filter(([, v]) => v > 0).map(([id, v]) => ({ id, qty: v })));
      closeSheet();
    }
    if (act === "add-ai") {
      onDone(aiItems.filter((x) => x.qty > 0).map((x) => ({ ...x, ai: true })));
      closeSheet();
    }
  });
  draw();
  // Opened from the quick "photo" / "voice" buttons: start right away (same tap gesture).
  if (start === "photo" && mode === "ai") fileInput.click();
  if (start === "voice" && mode === "ai") toggleVoice();
}

// ---------------------------------------------------------------- Quick photo / voice capture
export const snapBar = () =>
  AI.AI_READY
    ? `<div class="quick-snap">
    <button class="primary" data-act="snap-photo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Chụp món</button>
    <button class="primary" data-act="snap-voice"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>Nói món</button>
  </div>`
    : "";

/** Open the AI capture sheet (photo or voice) for a date; must be called from a tap. */
export function quickSnap(kind, date = today(), after) {
  const now = new Date();
  const slot = date === today() ? slotForTime(`${now.getHours()}:${now.getMinutes()}`) : "phu";
  openAdd(
    slot,
    (items) => {
      const log = getLog(date);
      (log.meals[slot] ||= []).push(...items);
      delete log.aiReview;
      saveLater("food", date, () => A.food[date], 300);
      toast(`Đã thêm ${items.length} món vào ${MEAL_SLOTS[slot].toLowerCase()}.`, "good");
      after?.();
    },
    { start: kind }
  );
}

// ---------------------------------------------------------------- Router entry
export async function renderFood(root, sub) {
  sub = ["plan", "log"].includes(sub) ? sub : "plan";
  root.dataset.sub = sub;
  if (!root.querySelector(".subtabs") || root.dataset.drawn !== sub) {
    root.dataset.drawn = sub;
    root.innerHTML = `<nav class="subtabs">${[["plan", "Thực đơn gợi ý"], ["log", "Nhật ký ăn uống"]].map(([k, v]) => `<a href="#food-${k}" ${k === sub ? 'aria-current="page"' : ""}>${v}</a>`).join("")}</nav>${snapBar()}<div id="food-body"></div>`;
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
    if (a === "snap-photo" || a === "snap-voice") {
      const d = root.dataset.sub === "log" ? logDate : today();
      quickSnap(a === "snap-photo" ? "photo" : "voice", d, () => {
        logDate = d;
        location.hash = "#food-log";
        redraw();
      });
      return;
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
