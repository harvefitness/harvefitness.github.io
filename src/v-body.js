// Body: assessment (international standards) + measurements & progress charts.
import { A, recompute, aiContext } from "./state.js";
import * as S from "./store.js";
import { assess, GOALS } from "./calc.js";
import * as AI from "./ai.js";
import { physiqueCard } from "./v-learn.js";
import { esc, num, fmt, today, shortDate, parseDate, $, toast, md, daysBetween, addDays } from "./ui.js";
import { cutOptions, cutPlan, LEVEL_VN, KCAL_PER_KG, DAYS } from "./cutplan.js";

const ST_VN = { good: "Tốt", ok: "Ổn", warn: "Lưu ý", bad: "Cần cải thiện" };

function renderAssess(root) {
  const a = A.as, t = A.t, p = A.profile;
  const bt = a.bodyType;
  const goal = GOALS[t.goal];
  const pick = (k) => a.metrics.find((m) => m.key === k);
  const bf = pick("bf"), bmi = pick("bmi");
  let h = `<section class="hero-card body-hero">
    <span class="eyebrow">Đánh giá cơ thể · ${esc(p.name || "")}</span>
    <h2>${esc(bt.vn)}${bt.mixVn ? `<small> pha ${esc(bt.mixVn.split(" (")[0])}</small>` : ""}</h2>
    <p class="muted">${esc(bt.short)}</p>
    <div class="hero-stats">
      <div><b class="num">${fmt(bf.value, 1)}%</b><small>Mỡ · ${esc(bf.cls)}</small></div>
      <div><b class="num">${fmt(bmi.value, 1)}</b><small>BMI · ${esc(bmi.cls)}</small></div>
      <div><b class="num">${fmt(a.lbm, 1)}</b><small>kg khối nạc</small></div>
    </div>
  </section>
  <section class="card targets">
    <div class="row between"><span class="eyebrow">Mục tiêu mỗi ngày · ${esc(goal.vn)}</span></div>
    <div class="macros">
      <div><b class="num">${fmt(t.kcal)}</b><small>kcal ngày tập</small></div>
      <div><b class="num">${fmt(t.restKcal)}</b><small>kcal ngày nghỉ</small></div>
      <div><b class="num">${t.protein}g</b><small>Đạm</small></div>
      <div><b class="num">${t.fat}g</b><small>Béo</small></div>
    </div>
    <ul class="facts">
      <li>Tinh bột: <b class="num">${t.carbs}g</b> ngày tập, <b class="num">${t.restCarbs}g</b> ngày nghỉ. Chất xơ ≥ <b class="num">${t.fiber}g</b>.</li>
      <li>Nước: <b class="num">${fmt(t.waterBase / 1000, 1)} lít</b>, cộng thêm 0,5 lít cho mỗi giờ tập.</li>
      <li>${t.deficit > 20 ? `Thâm hụt ~${fmt(t.deficit)} kcal/ngày → giảm khoảng <b class="num">${fmt(t.weekly, 2)} kg/tuần</b>.` : t.deficit < -20 ? `Dư ~${fmt(-t.deficit)} kcal/ngày → tăng khoảng <b class="num">${fmt(-t.weekly, 2)} kg/tuần</b>.` : "Ăn bằng mức tiêu hao để giữ cân, tập để săn chắc."}</li>
      <li>Mỗi bữa nên có ~<b class="num">${t.perMealProtein}g</b> đạm, chia 3–4 bữa.</li>
    </ul>
    <p class="muted sm">Căn cứ: ISSN (đạm 1,6–2,2 g/kg), tối đa giảm 1% cân nặng mỗi tuần, chất béo ≥ 25% năng lượng, chất xơ 14g/1.000 kcal (USDA).</p>
  </section>
  <h2 class="sec">Chỉ số <em>chi tiết.</em></h2>
  <div class="metrics">${a.metrics
    .map(
      (m) => `<details class="metric ${m.status}">
      <summary><span class="m-l">${esc(m.label)}</span><span class="m-v num">${m.value != null ? fmt(m.value, m.d) + (m.unit ? " " + m.unit : "") : esc(m.text)}</span><span class="badge ${m.status}">${esc(m.cls || ST_VN[m.status])}</span></summary>
      <p>${esc(m.explain)}</p><p class="ref">Chuẩn: ${esc(m.ref)}</p></details>`
    )
    .join("")}</div>
  ${physiqueCard()}
  <section class="card"><span class="eyebrow">Tạng người & cách tập</span><p><b>${esc(bt.vn)}.</b> ${esc(bt.train)}</p>
  <p class="muted sm">Phân loại tạng (somatotype) ước tính từ khung xương, % mỡ, khối cơ và cơ địa bạn khai báo. Đây là mô hình mô tả, không phải số phận: ai cũng có thể thay đổi vóc dáng.</p></section>
  ${AI.AI_READY ? `<section class="card"><span class="eyebrow">PT AI nhận xét tổng thể</span><div id="ai-assess">${p.aiAssess ? md(p.aiAssess) : `<p class="muted">Nhờ PT AI đọc toàn bộ chỉ số và nhận xét như buổi tư vấn đầu tiên.</p>`}</div>
    <button class="ghost block" data-act="ai-assess">${p.aiAssess ? "Nhận xét lại" : "Nhận xét giúp tôi"}</button></section>` : ""}
  <div class="row gap wrap"><a class="ghost" href="#setup">Sửa hồ sơ & thói quen</a><a class="ghost" href="#body-progress">Cập nhật số đo</a></div>`;
  root.innerHTML = h;
}

// --------------------------------------------------------------- Progress
function chart(title, series, unit) {
  const pts = series.flatMap((s) => s.pts);
  if (pts.length < 2) return "";
  const W = 360, H = 190, L = 36, R = 12, T = 12, B = 24;
  const xs = [...new Set(pts.map((p) => p.d))].sort();
  const t0 = parseDate(xs[0]).getTime(), t1 = parseDate(xs.at(-1)).getTime();
  let lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v));
  const pad = Math.max((hi - lo) * 0.15, 1);
  lo = Math.floor(lo - pad);
  hi = Math.ceil(hi + pad);
  const X = (d) => L + (t1 === t0 ? 0.5 : (parseDate(d).getTime() - t0) / (t1 - t0)) * (W - L - R);
  const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const step = Math.max(1, Math.ceil((hi - lo) / 4));
  let g = "";
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step)
    g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" class="axis">${v}</text>`;
  g += `<text x="${L}" y="${H - 6}" class="axis">${shortDate(xs[0])}</text><text x="${W - R}" y="${H - 6}" text-anchor="end" class="axis">${shortDate(xs.at(-1))}</text>`;
  for (const s of series) {
    if (!s.pts.length) continue;
    const d = s.pts.map((p, i) => `${i ? "L" : "M"}${X(p.d).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(" ");
    if (s.area && s.pts.length > 1) g += `<path d="${d} L${X(s.pts.at(-1).d).toFixed(1)} ${H - B} L${X(s.pts[0].d).toFixed(1)} ${H - B} Z" style="fill:${s.color}" opacity=".12"/>`;
    g += `<path d="${d}" fill="none" style="stroke:${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    s.pts.forEach((p, i) => {
      const last = i === s.pts.length - 1;
      g += `<circle cx="${X(p.d)}" cy="${Y(p.v)}" r="${last ? 4.5 : 2.5}" style="fill:${last ? s.color : "var(--surface)"};stroke:${s.color}" stroke-width="2"><title>${shortDate(p.d)}: ${fmt(p.v, 1)} ${unit}</title></circle>`;
    });
  }
  const legend = series.length > 1 ? `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join("")}</div>` : "";
  return `<div class="card chart"><h3>${title}</h3>${legend}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">${g}</svg></div>`;
}

let editDate = null;
function renderProgress(root) {
  const rows = Object.entries(A.body).map(([d, v]) => ({ ...v, date: d })).sort((a, b) => (a.date < b.date ? -1 : 1));
  const d0 = editDate || today();
  const cur = A.body[d0] || {};
  const p = A.profile;
  const ser = (f) => rows.filter((r) => num(r[f]) != null).map((r) => ({ d: r.date, v: num(r[f]) }));
  const bfSer = rows
    .filter((r) => num(r.weight) != null)
    .map((r) => ({ d: r.date, v: assess({ ...p, ...Object.fromEntries(Object.entries(r).filter(([, v]) => v !== "" && v != null)) }).bf }));
  let h = `<form class="card" id="mform">
    <div class="row between"><span class="eyebrow">Ghi số đo</span><input type="date" id="m-date" value="${d0}" max="${today()}" aria-label="Ngày đo"></div>
    <div class="grid3">
      ${[["weight", "Cân nặng (kg)"], ["waist", "Eo (cm)"], ["hip", "Mông (cm)"], ["chest", "Ngực (cm)"], ["thigh", "Đùi (cm)"], ["arm", "Bắp tay (cm)"]]
        .map(([k, l]) => `<label class="fld"><span>${l}</span><input id="m-${k}" inputmode="decimal" value="${esc(cur[k] ?? "")}" placeholder="${esc(p[k] ?? "")}"></label>`)
        .join("")}
    </div>
    <label class="fld"><span>% mỡ từ máy (nếu có)</span><input id="m-bodyFat" inputmode="decimal" value="${esc(cur.bodyFat ?? "")}"></label>
    <button class="primary block" type="submit">${A.body[d0] ? "Cập nhật số đo" : "Lưu số đo"}</button>
    <p class="muted sm">Cân buổi sáng sau khi đi vệ sinh, trước khi ăn. Đo 1 lần/tuần cùng giờ. Cân nặng dao động 0,5–1 kg mỗi ngày là bình thường, hãy xem xu hướng.</p>
  </form>`;
  if (rows.length < 2) h += `<div class="empty">Từ lần đo thứ hai sẽ có biểu đồ tiến bộ.</div>`;
  else {
    h += chart("Cân nặng (kg)", [{ name: "Cân nặng", color: "var(--accent)", area: true, pts: ser("weight") }], "kg");
    h += chart("% mỡ ước tính", [{ name: "% mỡ", color: "var(--chrome)", area: true, pts: bfSer }], "%");
    h += chart("Số đo (cm)", [{ name: "Eo", color: "var(--accent)", pts: ser("waist") }, { name: "Mông", color: "var(--chrome)", pts: ser("hip") }, { name: "Ngực", color: "var(--warn)", pts: ser("chest") }, { name: "Đùi", color: "var(--muted)", pts: ser("thigh") }].filter((s) => s.pts.length), "cm");
  }
  if (rows.length)
    h += `<div class="tbl-wrap"><table><thead><tr><th>Ngày</th><th>Kg</th><th>Eo</th><th>Mông</th><th>% mỡ</th><th></th></tr></thead><tbody>${rows
      .slice()
      .reverse()
      .map((r) => {
        const bf = bfSer.find((x) => x.d === r.date)?.v;
        return `<tr><td>${shortDate(r.date)}/${r.date.slice(2, 4)}</td><td>${fmt(num(r.weight), 1)}</td><td>${fmt(num(r.waist), 1)}</td><td>${fmt(num(r.hip), 1)}</td><td>${fmt(bf, 1)}</td><td><button class="x" data-del="${r.date}" aria-label="Xóa">✕</button></td></tr>`;
      })
      .join("")}</tbody></table></div>`;
  root.innerHTML = h;
}

let cutPick = null;
const kgTxt = (x) => fmt(x, x % 1 ? 1 : 0);
function renderCut(root) {
  const a = A.as, t = A.t, p = A.profile;
  const opts = cutOptions(a);
  const active = p.goal === "cut" && p.cutPlan?.kg ? p.cutPlan : null;
  const kg = cutPick ?? active?.kg ?? opts.rec;
  const c = cutPlan(p, a, t, kg);
  const day = active ? Math.min(DAYS, daysBetween(active.start, today()) + 1) : 0;
  const lastW = Object.keys(A.body).sort().reverse().map((d) => A.body[d].weight).find((x) => x != null) ?? p.weight;
  const planW = active ? active.startW - (active.kg * Math.min(day, DAYS)) / DAYS : null;
  root.innerHTML = `<section class="hero-card cut-hero">
      <span class="eyebrow">Lộ trình 30 ngày</span>
      <h2>Giảm <em>${kgTxt(kg)} kg.</em></h2>
      <p class="muted">Bạn đang ${fmt(a.w, 1)} kg, mỗi ngày tiêu hao khoảng <b>${fmt(c.tdee)} kcal</b> (TDEE). Muốn giảm cân phải ăn ít hơn mức này, tức là <b>thâm hụt calo</b>. Cứ thâm hụt khoảng <b>${fmt(KCAL_PER_KG)} kcal</b> thì giảm 1 kg mỡ.</p>
    </section>
    ${active ? `<section class="card cut-active"><span class="eyebrow">Đang theo lộ trình · ngày ${day}/${DAYS}</span>
      <div class="cut-big3"><div><small>Bắt đầu</small><b class="num">${fmt(active.startW, 1)}</b><span>kg</span></div><div><small>Theo kế hoạch</small><b class="num">${fmt(planW, 1)}</b><span>kg</span></div><div><small>Hiện tại</small><b class="num">${fmt(lastW, 1)}</b><span>kg</span></div></div>
      <p class="muted sm">${lastW <= planW + 0.3 ? "Đúng tiến độ 👍 Giữ nguyên." : "Đang chậm hơn kế hoạch. Kiểm tra lại nhật ký ăn, hoặc thêm 2.000 bước mỗi ngày."} Cân buổi sáng và ghi ở tab Số đo để theo dõi.</p>
      ${day >= DAYS ? `<div class="note">Đã đủ 30 ngày! Đo lại eo, cân, chụp ảnh. Nên ăn ở mức duy trì 1 tuần (≈ ${fmt(c.tdee)} kcal) trước khi bắt đầu tháng tiếp theo.</div>` : ""}
      <button class="ghost sm" data-act="cut-stop">Dừng lộ trình</button></section>` : ""}

    <section class="card"><span class="eyebrow">Muốn giảm bao nhiêu trong 1 tháng?</span>
      <div class="chips wrap">${opts.list.map((o) => `<button class="chip ${o.kg === kg ? "on" : ""}" data-cutkg="${o.kg}">${kgTxt(o.kg)} kg${o.kg === opts.rec ? " ⭐" : ""}</button>`).join("")}</div>
      <div class="table-wrap"><table class="cut-table"><thead><tr><th>Giảm</th><th>Thâm hụt / ngày</th><th>/ tháng</th><th>Mức</th></tr></thead><tbody>
      ${opts.list.map((o) => `<tr class="${o.kg === kg ? "on" : ""} lv-${o.level}"><td><b>${kgTxt(o.kg)} kg</b></td><td class="num">${fmt(o.daily)} kcal</td><td class="num">${fmt(o.month)}</td><td>${LEVEL_VN[o.level]}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="muted sm">⭐ Khuyên dùng cho bạn: giảm 0,5–1 % cân nặng mỗi tuần (ACSM) để giữ cơ và không bị ăn bù. Tối đa an toàn với bạn ≈ ${fmt(opts.max, 1)} kg / tháng.</p>
    </section>

    <section class="card"><span class="eyebrow">Để giảm ${kgTxt(kg)} kg, mỗi ngày bạn cần</span>
      <div class="cut-big3">
        <div><small>Thâm hụt</small><b class="num">${fmt(c.daily)}</b><span>kcal / ngày</span></div>
        <div><small>Ăn tối đa</small><b class="num">${fmt(c.intake)}</b><span>kcal / ngày</span></div>
        <div><small>Đi bộ</small><b class="num">${fmt(c.stepsTarget)}</b><span>bước / ngày</span></div>
      </div>
      <ul class="cut-list">
        <li><b>Ăn bớt ${fmt(c.food)} kcal</b> so với mức tiêu hao (${fmt(c.tdee)} → ${fmt(c.intake)} kcal). Không ăn dưới ${fmt(c.floor)} kcal.</li>
        <li><b>Vận động thêm ~${fmt(c.move)} kcal</b>: đi thêm ${fmt(c.extraSteps)} bước mỗi ngày (≈ ${fmt(c.stepKcal)} kcal)${c.cardioWeek > 0 ? ` và cardio ${fmt(c.cardioMin)} phút / tuần (đạp xe, đi nhanh, bơi… ≈ ${fmt(c.cardioWeek)} kcal)` : ""}.</li>
        <li><b>Đạm ${c.protein} g / ngày</b> để giữ cơ khi ăn ít. Vẫn tập tạ đủ buổi theo lộ trình.</li>
        <li>Tổng: thâm hụt ${fmt(c.week)} kcal / tuần, ${fmt(c.month)} kcal / tháng → cuối tháng khoảng <b>${fmt(c.endW, 1)} kg</b>.</li>
      </ul>
      ${c.warn.map((x) => `<div class="note warn">${esc(x)}</div>`).join("")}
    </section>

    <section class="card"><span class="eyebrow">Lịch 4 tuần</span>
      <ol class="cut-weeks">
        <li><b>Tuần 1 · Làm quen</b> <span class="num muted">~${fmt(c.weeks[0].w, 1)} kg</span><p>Ăn ${fmt(c.intake)} kcal, ghi đủ mọi bữa trong Nhật ký ăn. Đi ${fmt(c.stepsTarget)} bước. Cân sáng 3 lần/tuần. Tuần đầu cân thường giảm nhanh hơn do mất nước, là bình thường.</p></li>
        <li><b>Tuần 2 · Ổn định</b> <span class="num muted">~${fmt(c.weeks[1].w, 1)} kg</span><p>Giữ nguyên mức ăn. ${c.cardioWeek > 0 ? `Thêm cardio ${fmt(Math.ceil(c.cardioMin / 3))} phút × 3 buổi.` : "Thêm 1 buổi đi bộ nhanh 30 phút cuối tuần."} Ngủ 7–9 tiếng để bớt thèm ăn.</p></li>
        <li><b>Tuần 3 · Điều chỉnh</b> <span class="num muted">~${fmt(c.weeks[2].w, 1)} kg</span><p>So cân trung bình tuần 3 với tuần 2: giảm dưới ${fmt(c.weekKg * 0.5, 1)} kg → bớt 100 kcal hoặc thêm 2.000 bước. Giảm hơn ${fmt(a.w * 0.01, 1)} kg → ăn thêm 100 kcal.</p></li>
        <li><b>Tuần 4 · Đánh giá</b> <span class="num muted">~${fmt(c.endW, 1)} kg</span><p>Đo eo, cân, chụp ảnh so với ngày đầu. Sau đó ăn ở mức duy trì (${fmt(c.tdee)} kcal) 5–7 ngày rồi mới bắt đầu tháng mới.</p></li>
      </ol>
      ${active && active.kg === kg ? "" : `<button class="primary block" data-act="cut-apply">Áp dụng lộ trình ${kgTxt(kg)} kg</button><p class="muted sm">Áp dụng sẽ đổi mục tiêu của bạn sang <b>Giảm mỡ</b>, mục tiêu calo trong Ăn uống thành ${fmt(c.intake)} kcal và mục tiêu bước chân thành ${fmt(c.stepsTarget)}.</p>`}
    </section>
    <p class="muted sm">Cách tính: 1 kg mỡ ≈ 7.700 kcal; TDEE theo Mifflin–St Jeor × mức vận động; tốc độ an toàn 0,5–1 %/tuần (ACSM, ISSN); đi bộ ≈ 0,5 kcal/kg/1.000 bước. Có bệnh nền, đang mang thai hoặc cho con bú: hỏi bác sĩ trước khi ăn thâm hụt.</p>`;
}

export function renderBody(root, sub) {
  sub = ["assess", "cut", "progress"].includes(sub) ? sub : "assess";
  root.innerHTML = `<nav class="subtabs">${[["assess", "Đánh giá"], ["cut", "Giảm cân"], ["progress", "Số đo"]].map(([k, v]) => `<a href="#body-${k}" ${k === sub ? 'aria-current="page"' : ""}>${v}</a>`).join("")}</nav><div id="body-body"></div>`;
  const body = $("#body-body", root);
  sub === "assess" ? renderAssess(body) : sub === "cut" ? renderCut(body) : renderProgress(body);
  root.onchange = (e) => {
    if (e.target.id === "m-date") {
      editDate = e.target.value || today();
      renderProgress(body);
    }
  };
  root.onsubmit = async (e) => {
    if (e.target.id !== "mform") return;
    e.preventDefault();
    const d = $("#m-date", root).value || today();
    const rec = { ...(A.body[d] || {}), date: d };
    for (const k of ["weight", "waist", "hip", "chest", "thigh", "arm", "bodyFat"]) {
      const v = num($("#m-" + k, root).value);
      if (v != null) rec[k] = v;
      else delete rec[k];
    }
    if (Object.keys(rec).length < 2) return toast("Nhập ít nhất 1 số đo.", "bad");
    A.body[d] = rec;
    await S.set("body", d, rec);
    // Newest measurement updates the profile, so targets and program follow.
    const newest = Object.keys(A.body).sort().at(-1);
    if (d === newest) {
      for (const k of ["weight", "waist", "hip", "neck", "bodyFat"]) if (rec[k] != null) A.profile[k] = rec[k];
      await S.saveProfile(A.profile);
      recompute();
    }
    toast("Đã lưu số đo. Mục tiêu dinh dưỡng đã được tính lại.", "good");
    renderProgress(body);
  };
  root.onclick = async (e) => {
    const ck = e.target.closest("[data-cutkg]");
    if (ck) {
      cutPick = +ck.dataset.cutkg;
      return renderCut(body);
    }
    if (e.target.closest("[data-act=cut-apply]")) {
      const kg = cutPick ?? cutOptions(A.as).rec;
      const c = cutPlan(A.profile, A.as, A.t, kg);
      A.profile.goal = "cut";
      A.profile.cutPlan = { kg, start: today(), startW: A.as.w, food: c.food, steps: c.stepsTarget, intake: c.intake };
      await S.saveProfile(A.profile);
      recompute();
      cutPick = null;
      toast(`Đã áp dụng: ăn ${fmt(c.intake)} kcal, đi ${fmt(c.stepsTarget)} bước mỗi ngày trong 30 ngày.`, "good");
      return renderCut(body);
    }
    if (e.target.closest("[data-act=cut-stop]")) {
      delete A.profile.cutPlan;
      await S.saveProfile(A.profile);
      recompute();
      toast("Đã dừng lộ trình giảm cân. Mục tiêu vẫn là Giảm mỡ, có thể đổi trong hồ sơ.");
      return renderCut(body);
    }
    const del = e.target.closest("[data-del]");
    if (del) {
      if (!del.dataset.armed) {
        del.dataset.armed = "1";
        del.textContent = "Xóa?";
        setTimeout(() => del.isConnected && ((del.textContent = "✕"), delete del.dataset.armed), 3000);
        return;
      }
      delete A.body[del.dataset.del];
      await S.del("body", del.dataset.del);
      return renderProgress(body);
    }
    const b = e.target.closest("[data-act=ai-assess]");
    if (b) {
      b.disabled = true;
      b.textContent = "PT AI đang đọc chỉ số…";
      try {
        const txt = await AI.ask(
          "Hãy nhận xét như buổi tư vấn đầu tiên với PT: 1) Tóm tắt tình trạng cơ thể (dựa trên chỉ số), 2) 3 điểm ưu tiên cần cải thiện, 3) Kỳ vọng thực tế sau 4 tuần và 12 tuần, 4) 3 thói quen nên bắt đầu ngay từ ngày mai. Ngắn gọn, cụ thể.",
          AI.PT_SYSTEM + "\n\n" + aiContext()
        );
        A.profile.aiAssess = txt;
        await S.saveProfile(A.profile);
        $("#ai-assess", root).innerHTML = md(txt);
        b.disabled = false;
        b.textContent = "Nhận xét lại";
      } catch (err) {
        b.disabled = false;
        b.textContent = "Thử lại";
        toast(AI.friendlyError(err), "bad");
      }
    }
  };
}
