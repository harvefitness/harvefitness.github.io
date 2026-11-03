// Onboarding / profile editor: 5 steps.
import { A, recompute } from "./state.js";
import * as S from "./store.js";
import { SPORTS, GOALS, JOBS, STEPS } from "./calc.js";
import { LEVEL_OPTS, PLACES, FOCUS, INJURIES } from "./program.js";
import { esc, num, toast, today, DOW, WEEK_ORDER, $ } from "./ui.js";

const STEPS_UI = ["Cơ bản", "Số đo", "Mục tiêu", "Tập luyện", "Sinh hoạt"];
let step = 0;
let draft = null;

const DEFAULTS = {
  name: "", sex: "", age: "", height: "", weight: "", neck: "", waist: "", hip: "", wrist: "", bodyFat: "",
  goal: "", focus: [], targetWeight: "", gainEase: "normal",
  level: 0, place: "g", gymDays: [], gymMinutes: 60, trainTime: "18:00", sports: [],
  wakeTime: "06:30", bedTime: "23:00", job: "sit", steps: "s2", meals: 3, diet: "normal", supps: [], injuries: [], alcohol: "no", notes: "",
};

export function startSetup() {
  draft = { ...DEFAULTS, ...(A.profile ? structuredClone(A.profile) : {}) };
  if (!draft.name && A.user?.displayName) draft.name = A.user.displayName;
  step = 0;
}

const chips = (key, opts, multi = false) =>
  `<div class="chips wrap" role="group">${Object.entries(opts)
    .map(([v, label]) => {
      const on = multi ? (draft[key] || []).map(String).includes(String(v)) : String(draft[key]) === String(v);
      return `<button type="button" class="chip" data-k="${key}" data-v="${esc(v)}" ${multi ? "data-multi" : ""} aria-pressed="${on}">${esc(label)}</button>`;
    })
    .join("")}</div>`;
const field = (key, label, attrs = "", hint = "") =>
  `<label class="fld"><span>${label}</span><input id="f-${key}" data-k="${key}" value="${esc(draft[key] ?? "")}" ${attrs}>${hint ? `<small>${hint}</small>` : ""}</label>`;
const dayChips = (path, days) =>
  `<div class="days" role="group">${WEEK_ORDER.map((d) => `<button type="button" class="day-chip" data-days="${path}" data-v="${d}" aria-pressed="${(days || []).map(Number).includes(d)}">${DOW[d]}</button>`).join("")}</div>`;

function stepHtml() {
  const d = draft;
  switch (step) {
    case 0:
      return `<h2>Bạn là ai?</h2>
      ${field("name", "Tên gọi", 'autocomplete="nickname" placeholder="VD: Tâm"')}
      <div class="fld"><span>Giới tính sinh học</span>${chips("sex", { female: "Nữ", male: "Nam" })}<small>Dùng cho công thức tính trao đổi chất và % mỡ.</small></div>
      <div class="grid3">
        ${field("age", "Tuổi", 'inputmode="numeric" placeholder="24"')}
        ${field("height", "Cao (cm)", 'inputmode="decimal" placeholder="170"')}
        ${field("weight", "Nặng (kg)", 'inputmode="decimal" placeholder="68"')}
      </div>`;
    case 1:
      return `<h2>Số đo cơ thể</h2>
      <p class="muted">Đo bằng thước dây mềm, buổi sáng trước khi ăn. Càng đủ số đo, kết quả % mỡ càng chính xác (công thức U.S. Navy).</p>
      <div class="grid2">
        ${field("neck", "Vòng cổ (cm)", 'inputmode="decimal" placeholder="32"', "Ngay dưới yết hầu")}
        ${field("waist", "Vòng eo (cm)", 'inputmode="decimal" placeholder="70"', "Ngang rốn, thở ra nhẹ")}
        ${field("hip", "Vòng mông (cm)", 'inputmode="decimal" placeholder="92"', "Chỗ nở nhất")}
        ${field("wrist", "Cổ tay (cm)", 'inputmode="decimal" placeholder="15"', "Ngay trên xương cổ tay")}
      </div>
      ${field("bodyFat", "% mỡ từ máy InBody (nếu có)", 'inputmode="decimal" placeholder="Bỏ trống nếu không có"')}`;
    case 2:
      return `<h2>Mục tiêu</h2>
      <div class="cards">${Object.entries(GOALS)
        .map(([k, g]) => `<button type="button" class="opt" data-k="goal" data-v="${k}" aria-pressed="${d.goal === k}"><b>${g.vn}</b><small>${g.desc}</small></button>`)
        .join("")}</div>
      <div class="fld"><span>Vùng muốn ưu tiên (chọn nhiều)</span>${chips("focus", FOCUS, true)}</div>
      ${field("targetWeight", "Cân nặng mong muốn (kg, không bắt buộc)", 'inputmode="decimal"')}
      <div class="fld"><span>Cơ địa của bạn</span>${chips("gainEase", { hard: "Khó tăng cân", normal: "Bình thường", easy: "Dễ tăng cân / tích mỡ" })}</div>`;
    case 3:
      return `<h2>Tập luyện</h2>
      <div class="fld"><span>Kinh nghiệm tập gym</span>${chips("level", Object.fromEntries(LEVEL_OPTS.map((l, i) => [i, l])))}</div>
      <div class="fld"><span>Tập ở đâu</span>${chips("place", PLACES)}</div>
      <div class="fld"><span>Những ngày tập gym</span>${dayChips("gymDays", d.gymDays)}</div>
      <div class="grid2">
        <label class="fld"><span>Mỗi buổi</span><select id="f-gymMinutes" data-k="gymMinutes">${[30, 45, 60, 75, 90].map((m) => `<option value="${m}" ${+d.gymMinutes === m ? "selected" : ""}>${m} phút</option>`).join("")}</select></label>
        ${field("trainTime", "Giờ thường tập", 'type="time"')}
      </div>
      <div class="fld"><span>Môn thể thao khác</span>
        <div class="sports">${(d.sports || [])
          .map(
            (s, i) => `<div class="sport-row">
            <div class="row"><select data-sport="${i}" data-sk="type" aria-label="Môn">${Object.entries(SPORTS).map(([k, v]) => `<option value="${k}" ${s.type === k ? "selected" : ""}>${v.vn}</option>`).join("")}</select>
            <select data-sport="${i}" data-sk="minutes" aria-label="Thời lượng">${[30, 45, 60, 90, 120].map((m) => `<option value="${m}" ${+s.minutes === m ? "selected" : ""}>${m} phút</option>`).join("")}</select>
            <button type="button" class="icon-btn" data-sport-del="${i}" aria-label="Xóa môn">✕</button></div>
            ${dayChips("sport:" + i, s.days)}</div>`
          )
          .join("")}</div>
        <button type="button" class="ghost" data-act="add-sport">+ Thêm môn (tennis, chạy bộ, bơi…)</button>
      </div>`;
    case 4:
      return `<h2>Sinh hoạt</h2>
      <div class="grid2">${field("wakeTime", "Giờ thức dậy", 'type="time"')}${field("bedTime", "Giờ đi ngủ", 'type="time"')}</div>
      <div class="fld"><span>Công việc hằng ngày</span>${chips("job", Object.fromEntries(Object.entries(JOBS).map(([k, v]) => [k, v.vn])))}</div>
      <div class="fld"><span>Số bước đi bộ mỗi ngày (ngoài giờ tập)</span>${chips("steps", Object.fromEntries(Object.entries(STEPS).map(([k, v]) => [k, v.vn])))}</div>
      <div class="fld"><span>Số bữa ăn mỗi ngày</span>${chips("meals", { 2: "2 bữa", 3: "3 bữa", 4: "4 bữa", 5: "5 bữa" })}</div>
      <div class="fld"><span>Chế độ ăn</span>${chips("diet", { normal: "Ăn bình thường", veg: "Ăn chay" })}</div>
      <div class="fld"><span>Đang dùng</span>${chips("supps", { whey: "Whey protein", creatine: "Creatine" }, true)}</div>
      <div class="fld"><span>Rượu bia</span>${chips("alcohol", { no: "Không", some: "Thỉnh thoảng", often: "Thường xuyên" })}</div>
      <div class="fld"><span>Chấn thương / hay đau</span>${chips("injuries", INJURIES, true)}</div>
      <label class="fld"><span>Ghi chú thêm cho PT (bệnh nền, món không ăn…)</span><textarea id="f-notes" data-k="notes" rows="2">${esc(d.notes)}</textarea></label>`;
  }
}

function validate() {
  const d = draft;
  if (step === 0) {
    if (!d.sex) return "Chọn giới tính.";
    if (!(num(d.age) >= 12 && num(d.age) <= 90)) return "Nhập tuổi từ 12 đến 90.";
    if (!(num(d.height) >= 120 && num(d.height) <= 230)) return "Nhập chiều cao bằng cm, ví dụ 165.";
    if (!(num(d.weight) >= 30 && num(d.weight) <= 250)) return "Nhập cân nặng bằng kg, ví dụ 55.";
  }
  if (step === 2 && !d.goal) return "Chọn một mục tiêu.";
  if (step === 3 && !d.gymDays.length && !d.sports.length) return "Chọn ít nhất 1 ngày tập gym hoặc thêm 1 môn thể thao.";
  return "";
}

export function renderSetup(root) {
  const first = !A.profile;
  root.innerHTML = `<div class="setup">
    <div class="steps">${STEPS_UI.map((s, i) => `<span class="${i === step ? "on" : i < step ? "done" : ""}">${s}</span>`).join("")}</div>
    <form id="setup-form" novalidate>${stepHtml()}
      <p class="err" id="setup-err" role="alert"></p>
      <div class="row between nav-btns">
        ${step > 0 ? `<button type="button" class="ghost" data-act="back">Quay lại</button>` : first ? "<span></span>" : `<a class="ghost" href="#/body">Hủy</a>`}
        <button type="submit" class="primary">${step < STEPS_UI.length - 1 ? "Tiếp tục" : first ? "Xem đánh giá của tôi" : "Lưu và tính lại"}</button>
      </div>
    </form></div>`;
  const form = $("#setup-form", root);
  form.oninput = (e) => {
    const k = e.target.dataset.k;
    if (k) draft[k] = e.target.value;
    const si = e.target.dataset.sport;
    if (si != null) draft.sports[+si][e.target.dataset.sk] = e.target.value;
  };
  form.onchange = form.oninput;
  form.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.k && b.dataset.v != null) {
      const k = b.dataset.k, v = b.dataset.v;
      if (b.hasAttribute("data-multi")) {
        const arr = (draft[k] || []).map(String);
        draft[k] = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
      } else draft[k] = k === "level" || k === "meals" ? +v : v;
      return renderSetup(root);
    }
    if (b.dataset.days) {
      const v = +b.dataset.v;
      const path = b.dataset.days;
      const target = path === "gymDays" ? draft : draft.sports[+path.split(":")[1]];
      const key = path === "gymDays" ? "gymDays" : "days";
      const arr = (target[key] || []).map(Number);
      target[key] = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
      return renderSetup(root);
    }
    if (b.dataset.act === "add-sport") {
      draft.sports.push({ type: "tennis", days: [], minutes: 60 });
      return renderSetup(root);
    }
    if (b.dataset.sportDel != null) {
      draft.sports.splice(+b.dataset.sportDel, 1);
      return renderSetup(root);
    }
    if (b.dataset.act === "back") {
      step--;
      return renderSetup(root);
    }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = validate();
    $("#setup-err", root).textContent = err;
    if (err) return;
    if (step < STEPS_UI.length - 1) {
      step++;
      renderSetup(root);
      scrollTo(0, 0);
      return;
    }
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    btn.textContent = "Đang tính…";
    const p = { ...draft };
    for (const k of ["age", "height", "weight", "neck", "waist", "hip", "wrist", "bodyFat", "targetWeight"]) p[k] = num(p[k]) ?? "";
    p.gymMinutes = +p.gymMinutes || 60;
    p.sports = (p.sports || []).filter((s) => s.days?.length).map((s) => ({ type: s.type, minutes: +s.minutes || 60, days: s.days.map(Number) }));
    p.gymDays = p.gymDays.map(Number);
    if (!p.programStart) p.programStart = today();
    try {
      await S.saveProfile(p);
      // keep a measurement record for progress charts
      const m = { date: today() };
      for (const k of ["weight", "neck", "waist", "hip", "wrist", "bodyFat"]) if (p[k] !== "") m[k] = p[k];
      const prev = A.body[today()] || {};
      A.body[today()] = { ...prev, ...m };
      await S.set("body", today(), A.body[today()]);
      A.profile = p;
      recompute();
      toast(first ? "Đã tạo hồ sơ. Đây là đánh giá của bạn." : "Đã lưu hồ sơ và tính lại lộ trình.", "good");
      location.hash = "#/body";
    } catch (e2) {
      console.error(e2);
      btn.disabled = false;
      btn.textContent = "Thử lưu lại";
      $("#setup-err", root).textContent = "Không lưu được. Kiểm tra mạng rồi thử lại.";
    }
  };
}
