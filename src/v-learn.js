// Knowledge pages: interactive muscle map (tap a muscle to learn about it) and
// calorie-burning activities personalised to the person's weight, goal and injuries.
import { A } from "./state.js";
import { BODY_MAP } from "./body-map-data.js";
import { MUSCLES, ANATOMY_SOURCES, ACTIVITIES, physiquesFor } from "./anatomy.js";
import { SPORTS } from "./calc.js";
import { exName, imgUrl, loadLibrary, libById } from "./exercises.js";
import { esc, fmt, $, $$, openSheet } from "./ui.js";

let side = "front";
let selected = null;

const svgSide = (key) =>
  `<svg viewBox="0 0 100 200" class="bodysvg" role="img" aria-label="Cơ thể mặt ${key === "front" ? "trước" : "sau"}">
    ${BODY_MAP[key]
      .map(([m, polys]) => polys.map((pts) => `<polygon points="${pts}" data-m="${m}" class="mz${m === "head" ? " head" : ""}${selected && MUSCLES[m] === MUSCLES[selected] ? " on" : ""}"/>`).join(""))
      .join("")}
  </svg>`;

let viewer = null;
const webglOK = () => {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
};

export function renderMuscles(root) {
  viewer?.dispose();
  viewer = null;
  const names = [...new Set([...BODY_MAP.front, ...BODY_MAP.back].map(([m]) => m).filter((m) => MUSCLES[m] && !m.includes("soleus")))];
  const use3d = webglOK();
  const views = [["front", "Trước"], ["right", "Phải"], ["back", "Sau"], ["left", "Trái"]];
  const stage3d = `<div class="stage3d" id="stage3d"><div class="loading3d">Đang tải mô hình 3D…</div></div>
    <div class="view-btns">${views.map(([k, v]) => `<button class="chip" data-view="${k}">${v}</button>`).join("")}<button class="chip" data-view="spin" aria-pressed="true">Tự xoay</button></div>`;
  const stage2d = `<div class="stage" id="stage"><div class="flipper ${side === "back" ? "back" : ""}" id="flipper">
      <div class="face front">${svgSide("front")}<span class="face-tag">Mặt trước</span></div>
      <div class="face backface">${svgSide("back")}<span class="face-tag">Mặt sau</span></div></div></div>
    <button class="ghost sm" data-act="flip">↻ Xoay</button>`;
  root.innerHTML = `<section class="card body3d-card">
      <span class="eyebrow">Giải phẫu cơ thể${use3d ? " · 3D" : ""}</span>
      <h2>Chạm vào <em>nhóm cơ.</em></h2>
      <p class="muted sm">${use3d ? "Kéo để xoay 360°, chụm 2 ngón để phóng to. Chạm vào một nhóm cơ để xem tên, chức năng, bài tập và cách giãn cơ." : "Chạm vào một vùng để xem chi tiết. Bấm Xoay để xem mặt sau."}</p>
      ${use3d ? stage3d : stage2d}
      <p class="sel-name" id="m-name">${selected ? esc(MUSCLES[selected].vn) : "Chưa chọn nhóm cơ"}</p>
    </section>
    <h2 class="sec">Tất cả <em>nhóm cơ.</em></h2>
    <div class="chips wrap">${names.map((m) => `<button class="chip" data-m="${m}" aria-pressed="${selected === m}">${esc(MUSCLES[m].vn)}</button>`).join("")}</div>
    <section class="card"><span class="eyebrow">Nguồn tham khảo</span><ul class="src">${ANATOMY_SOURCES.map(([t, u]) => `<li><a href="${u}" target="_blank" rel="noopener">${esc(t)} ↗</a></li>`).join("")}</ul>
    <p class="muted sm">Mô hình minh họa vị trí các nhóm cơ chính, không theo đúng tỉ lệ giải phẫu. Nội dung dành cho người tập phổ thông, không thay thế chẩn đoán y khoa.</p></section>`;

  const choose = (k, fromModel) => {
    selected = k;
    $("#m-name", root).textContent = MUSCLES[k].vn;
    $$(".chip[data-m]", root).forEach((c) => c.setAttribute("aria-pressed", c.dataset.m === k));
    $$(".mz", root).forEach((p) => p.classList.toggle("on", MUSCLES[p.dataset.m] === MUSCLES[k]));
    if (!fromModel) viewer?.select(k);
    showMuscle(k);
  };

  if (use3d) {
    import("./body3d.js")
      .then(({ mountBody3D }) => {
        const st = $("#stage3d", root);
        if (!st || !st.isConnected) return;
        st.innerHTML = "";
        viewer = mountBody3D(st, { onSelect: (k) => choose(k, true) });
        if (selected) viewer.select(selected, { face: false });
      })
      .catch((e) => {
        console.error(e);
        const st = $("#stage3d", root);
        if (st) st.innerHTML = `<div class="loading3d">Không tải được mô hình 3D. Kiểm tra mạng rồi mở lại trang.</div>`;
      });
  }

  // 2D fallback: swipe or tap "Xoay" to flip front/back.
  const stage = $("#stage", root);
  const flipper = $("#flipper", root);
  const flip = () => {
    side = side === "front" ? "back" : "front";
    flipper?.classList.toggle("back", side === "back");
  };
  if (stage) {
    let x0 = null;
    stage.onpointerdown = (e) => (x0 = e.clientX);
    stage.onpointerup = (e) => {
      if (x0 != null && Math.abs(e.clientX - x0) > 40) flip();
      x0 = null;
    };
  }
  root.onclick = (e) => {
    if (e.target.closest("[data-act=flip]")) return flip();
    const v = e.target.closest("[data-view]");
    if (v && viewer) {
      $$("[data-view]", root).forEach((b) => b.setAttribute("aria-pressed", b === v));
      return v.dataset.view === "spin" ? viewer.spin(true) : viewer.view(v.dataset.view);
    }
    const t = e.target.closest("[data-m]");
    if (!t || !MUSCLES[t.dataset.m]) return;
    choose(t.dataset.m, false);
  };
}

async function showMuscle(key) {
  const m = MUSCLES[key];
  await loadLibrary();
  const exCard = (id) => {
    const x = libById(id);
    return `<button class="mini-ex" data-ex="${id}"><img src="${imgUrl(id, 0)}" alt="" loading="lazy"><span>${esc(exName(id) || x?.n || id)}</span></button>`;
  };
  const body = openSheet(`<span class="eyebrow">${esc(m.group)}</span>
    <h2>${esc(m.vn)}</h2>
    <p class="latin">${esc(m.latin)}</p>
    <p>${esc(m.area)}</p>
    <div class="kv"><b>Gồm</b><ul>${m.parts.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>
    <div class="kv"><b>Chức năng</b><ul>${m.fn.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>
    <div class="kv"><b>Dùng khi</b><p>${esc(m.life)}</p></div>
    <h3>Bài tập <em>gợi ý</em></h3>
    <div class="mini-grid">${m.ex.map(exCard).join("")}</div>
    ${m.st?.length ? `<h3>Giãn <em>cơ</em></h3><div class="mini-grid">${m.st.map(exCard).join("")}</div>` : ""}
    <div class="cue"><b>Mẹo của PT:</b><ul>${m.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>
    <div class="note"><b>Lưu ý chấn thương:</b> ${esc(m.issues)}</div>`, { wide: true });
  body.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-ex]");
    if (!b) return;
    const { showExercise } = await import("./v-train.js");
    showExercise(b.dataset.ex);
  });
}

// ---------------------------------------------------------------- Calorie burn
let burnFilter = "all";
export function renderBurn(root) {
  const p = A.profile;
  const kg = +p.weight || 60;
  const injured = (p.injuries || []).some((i) => ["knee", "back"].includes(i));
  const doing = new Set((p.sports || []).map((s) => s.type));
  const sportKey = { tennis: "tennis", badminton: "badminton", pickleball: "pickleball", football: "football", basketball: "basketball", running: "jog", cycling: "cycle", swimming: "swim", boxing: "boxing", dance: "dance", hiit: "hiit", yoga: "yoga", pilates: "pilates" };
  const doingK = new Set([...doing].map((s) => sportKey[s]).filter(Boolean));
  const kcal = (met, min) => Math.round((met - 1) * kg * (min / 60)); // above resting
  let list = ACTIVITIES.map((a) => ({ ...a, k30: kcal(a.met, 30), k60: kcal(a.met, 60), doing: doingK.has(a.k) }));
  list.sort((a, b) => b.k30 - a.k30);
  // Suggestions: not already doing, joint-friendly if injured, varied.
  const pool = list.filter((a) => !a.doing && (!injured || ["none", "low"].includes(a.impact)) && a.met >= 5);
  const sugg = [pool.find((a) => a.impact === "none"), pool.find((a) => ["badminton", "tennis", "dance", "boxing", "football"].includes(a.k)), pool.find((a) => ["incline", "walk", "stairs"].includes(a.k))].filter(Boolean);
  const weekExtra = sugg.slice(0, 2).reduce((s, a) => s + kcal(a.met, 30) * 2, 0);
  const goalCut = ["cut", "recomp"].includes(p.goal);
  if (burnFilter === "joint") list = list.filter((a) => ["none", "low"].includes(a.impact));
  if (burnFilter === "doing") list = list.filter((a) => a.doing);
  const IMPACT = { none: "Không tải khớp", low: "Nhẹ cho khớp", mid: "Trung bình", high: "Tải khớp cao" };
  root.innerHTML = `<section class="card lime">
      <span class="eyebrow">Gợi ý cho bạn · ${fmt(kg)} kg</span>
      <h2>Đốt thêm <em class="ink">${fmt(weekExtra)} kcal</em>/tuần</h2>
      <p>Thêm ${sugg.slice(0, 2).map((a) => `<b>2 buổi ${esc(a.vn.toLowerCase())}</b>`).join(" và ")} × 30 phút mỗi tuần${goalCut ? ` ≈ giảm thêm <b>${fmt((weekExtra * 4.3) / 7700, 1)} kg mỡ/tháng</b> nếu giữ nguyên ăn uống` : ""}.${injured ? " Đã ưu tiên môn nhẹ cho gối/lưng." : ""}</p>
    </section>
    <div class="burn-sugg">${sugg.map((a) => `<div class="lane"><h3>${esc(a.vn)}</h3><p><b class="num">${fmt(a.k30)}</b> kcal / 30 phút</p><p class="sm">${esc(a.note)}</p></div>`).join("")}</div>
    <h2 class="sec">Bảng <em>đốt calo.</em></h2>
    <p class="muted sm">Calo đốt thêm so với ngồi yên, tính theo cân nặng của bạn: (MET − 1) × ${fmt(kg)} kg × giờ. MET theo Compendium of Physical Activities.</p>
    <div class="chips wrap">${[["all", "Tất cả"], ["joint", "Nhẹ cho khớp"], ["doing", "Bạn đang chơi"]].map(([k, v]) => `<button class="chip" data-bf="${k}" aria-pressed="${burnFilter === k}">${v}</button>`).join("")}</div>
    <div class="burn-list">${list.length ? list.map((a) => `<div class="burn-row${a.doing ? " doing" : ""}">
        <div><b>${esc(a.vn)}</b>${a.doing ? ` <span class="pill accent">Đang chơi</span>` : ""}<small>${IMPACT[a.impact]} · MET ${String(a.met).replace(".", ",")}</small></div>
        <div class="kc"><b class="num">${fmt(a.k30)}</b><small>kcal/30′</small></div>
        <div class="kc"><b class="num">${fmt(a.k60)}</b><small>kcal/60′</small></div>
      </div>`).join("") : `<div class="empty">Chưa có môn nào trong mục này.</div>`}</div>
    <section class="card notes"><span class="eyebrow">Ghi nhớ</span><ul>
      <li>Đốt mỡ chủ yếu nhờ ăn thâm hụt calo; vận động giúp tăng thâm hụt và giữ tim mạch khỏe. 1 kg mỡ ≈ 7.700 kcal.</li>
      <li>WHO khuyến nghị 150–300 phút vận động vừa hoặc 75–150 phút cường độ cao mỗi tuần, cộng 2 buổi tập sức mạnh.</li>
      <li>Môn yêu thích, làm đều được, luôn hiệu quả hơn môn đốt nhiều nhưng bỏ dở.</li>
    </ul></section>`;
  root.onclick = (e) => {
    const f = e.target.closest("[data-bf]");
    if (f) {
      burnFilter = f.dataset.bf;
      renderBurn(root);
    }
  };
}

/** Physique card for the assessment page. */
export function physiqueCard() {
  const p = A.profile, a = A.as;
  const ph = physiquesFor(p.sex)[p.physique];
  if (!ph) return `<section class="card"><span class="eyebrow">Dáng mong muốn</span><p class="muted">Chưa chọn dáng mong muốn. Vào <a href="#setup">Sửa hồ sơ</a> → bước Mục tiêu để chọn (thon gọn, săn chắc, đồng hồ cát…).</p></section>`;
  const [lo, hi] = ph.bf;
  const cur = a.bf;
  const lbm = a.lbm;
  const wAt = (bf) => lbm / (1 - bf / 100);
  let status, detail;
  if (cur > hi) {
    const loseKg = a.w - wAt(hi);
    const weeks = Math.ceil(loseKg / (a.w * 0.0075));
    status = `Cần giảm khoảng ${fmt(loseKg, 1)} kg mỡ`;
    detail = `Giữ nguyên khối nạc ${fmt(lbm, 1)} kg và giảm mỡ về ${hi}% → nặng khoảng ${fmt(wAt(hi), 1)} kg. Với tốc độ an toàn 0,5–1% cân nặng/tuần mất khoảng ${weeks}–${Math.ceil(weeks * 1.4)} tuần.`;
  } else if (cur < lo) {
    status = "Mỡ đã thấp hơn mức của dáng này";
    detail = `Tập trung tăng cơ, có thể ăn dư nhẹ. % mỡ khỏe mạnh cho dáng này là ${lo}–${hi}%.`;
  } else {
    status = "Mỡ đã đạt mức của dáng này";
    detail = "Tập trung tăng cơ ở các vùng ưu tiên để có đường nét rõ hơn.";
  }
  const pct = Math.max(0, Math.min(100, ((45 - cur) / (45 - hi)) * 100));
  return `<section class="card">
    <span class="eyebrow">Dáng mong muốn</span>
    <h3>${esc(ph.vn)}</h3>
    <p class="muted sm">${esc(ph.desc)}</p>
    <div class="row between"><span>% mỡ hiện tại <b class="num">${fmt(cur, 1)}%</b></span><span>Mục tiêu <b class="num hl">${lo}–${hi}%</b></span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <p><b>${esc(status)}.</b> ${esc(detail)}</p>
    <p class="note">${esc(ph.note)}</p>
  </section>`;
}
