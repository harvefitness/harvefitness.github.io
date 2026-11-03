// Shared app state + derived data + context for the AI coach.
import * as S from "./store.js";
import { stepsContext } from "./health.js";
import { physiquesFor } from "./anatomy.js";
import { assess, targets, SPORTS, GOALS, waterFor } from "./calc.js";
import { buildProgram, planFor, trainingHours, phaseOf } from "./program.js";
import { totals } from "./food.js";
import { today, addDays, mondayOf, fmt, DOW_LONG } from "./ui.js";

export const A = {
  user: null,
  profile: null,
  as: null, // assessment
  t: null, // targets
  prog: null, // program
  workouts: {}, // date -> workout log
  food: {}, // date -> food log
  body: {}, // date -> measurement
  health: {}, // date -> { steps, km } from Apple Health / manual
  loaded: new Set(),
};

export function recompute() {
  if (!A.profile) return;
  A.as = assess(A.profile);
  A.t = targets(A.profile, A.as);
  A.prog = buildProgram(A.profile, A.as);
}

export const isTrainingDay = (date) => planFor(A.prog, date).some((i) => i.kind !== "rest");
export const waterGoalCups = (date) => Math.round(waterFor(A.t, trainingHours(A.prog, A.profile, date)) / 250);

/** Load (once) workouts & food logs for the last ~5 weeks, and all measurements. */
export async function loadRecent() {
  const from = addDays(mondayOf(today()), -35);
  const to = addDays(today(), 14);
  // Each part loads on its own: one failing never blocks the others.
  const parts = [["workouts", () => S.range("workouts", from, to)], ["food", () => S.range("food", from, to)], ["body", () => S.latest("body", 120)], ["health", () => S.range("health", from, to)]];
  const res = await Promise.allSettled(parts.map(([, f]) => f()));
  const failed = [];
  res.forEach((r, i) => {
    const key = parts[i][0];
    if (r.status === "fulfilled") Object.assign(A[key], r.value);
    else {
      console.error("Load", key, r.reason);
      failed.push(`${key}: ${r.reason?.code || r.reason?.message || r.reason}`);
    }
  });
  if (failed.length) throw Object.assign(new Error(failed.join("; ")), { partial: true });
}

export async function loadDay(col, date) {
  const key = col + date;
  if (A.loaded.has(key) || A[col === "workouts" ? "workouts" : "food"][date]) return;
  A.loaded.add(key);
  const d = await S.get(col, date);
  if (d) A[col === "workouts" ? "workouts" : "food"][date] = d;
}

// Debounced writes, one per document.
const timers = new Map();
let pending = 0;
export function saveLater(col, id, getData, delay = 600) {
  clearTimeout(timers.get(col + id));
  setSync("saving");
  timers.set(
    col + id,
    setTimeout(async () => {
      timers.delete(col + id);
      pending++;
      try {
        const data = getData();
        if (data) await S.set(col, id, data);
        else await S.del(col, id);
        pending--;
        if (!pending && !timers.size) setSync("saved");
      } catch (e) {
        pending--;
        console.error(e);
        setSync("error");
      }
    }, delay)
  );
}
function setSync(s) {
  const el = document.getElementById("sync");
  if (!el) return;
  el.dataset.s = s;
  el.title = { saving: "Đang lưu…", saved: "Đã lưu", error: "Lưu lỗi, kiểm tra mạng" }[s];
}

/** Text summary of the person for the AI coach. */
export function aiContext(extra = "") {
  const p = A.profile, a = A.as, t = A.t, prog = A.prog;
  if (!p) return "";
  const d = today();
  const sports = (p.sports || []).filter((s) => SPORTS[s.type]).map((s) => `${SPORTS[s.type].vn} ${s.days.length} buổi/tuần × ${s.minutes || 60} phút (${s.days.map((x) => DOW_LONG[x]).join(", ")})`);
  const metrics = a.metrics.filter((m) => m.value != null).map((m) => `${m.label}: ${fmt(m.value, m.d)}${m.unit ? " " + m.unit : ""} (${m.cls})`);
  const week = prog.week.map((w) => `${w.dayVn}: ${w.items.map((i) => i.name).join(" + ")}`).join("; ");
  const todayPlan = planFor(prog, d).map((i) => (i.kind === "gym" ? `${i.name}: ${prog.sessions[i.key].exercises.map((e) => `${e.vn} ${e.sets}×${e.reps}`).join(", ")}` : i.name)).join(" | ");
  const log = A.food[d];
  const eaten = log ? totals(Object.values(log.meals || {}).flat()) : null;
  const weights = Object.entries(A.body).sort().slice(-6).map(([k, v]) => `${k}: ${v.weight ?? "?"}kg${v.waist ? ", eo " + v.waist : ""}`);
  const ph = phaseOf(p.programStart);
  return `NGỮ CẢNH NGƯỜI DÙNG (hôm nay ${d}, ${DOW_LONG[new Date().getDay()]}):
- Tên: ${p.name || "?"}; ${p.sex === "male" ? "Nam" : "Nữ"}, ${p.age} tuổi, cao ${p.height} cm, nặng ${p.weight} kg. Vòng cổ ${p.neck || "?"}, eo ${p.waist || "?"}, mông ${p.hip || "?"}, cổ tay ${p.wrist || "?"} cm.
- Mục tiêu: ${GOALS[p.goal]?.vn || p.goal}. Dáng mong muốn: ${physiquesFor(p.sex)[p.physique]?.vn || "chưa chọn"}. Ưu tiên vùng: ${(p.focus || []).join(", ") || "không"}. Cân nặng mong muốn: ${p.targetWeight || "chưa đặt"}.
- Kinh nghiệm gym: ${["mới tập", "6–24 tháng", "trên 2 năm"][+p.level || 0]}; tập ở: ${{ g: "phòng gym", h: "nhà có tạ đơn", b: "nhà không dụng cụ" }[p.place || "g"]}; gym ${(p.gymDays || []).length} buổi/tuần × ${p.gymMinutes || 60} phút lúc ${p.trainTime || "?"}.
- Môn thể thao khác: ${sports.join("; ") || "không"}.
- Sinh hoạt: dậy ${p.wakeTime || "?"}, ngủ ${p.bedTime || "?"} (${a.sleep ? a.sleep.toFixed(1) + " giờ" : "?"}), ${p.meals || 3} bữa/ngày, công việc: ${p.job}, bước chân: ${p.steps}, rượu bia: ${p.alcohol || "không"}, ăn chay: ${p.diet === "veg" ? "có" : "không"}. Thực phẩm bổ sung: ${(p.supps || []).join(", ") || "không"}. Chấn thương: ${(p.injuries || []).join(", ") || "không"}. Ghi chú: ${p.notes || "-"}.
- Đánh giá: ${metrics.join("; ")}. Tạng người: ${a.bodyType.vn}${a.bodyType.mixVn ? " pha " + a.bodyType.mixVn : ""}.
- Mục tiêu dinh dưỡng: ngày tập ${t.kcal} kcal, ngày nghỉ ${t.restKcal} kcal; đạm ${t.protein}g, béo ${t.fat}g, tinh bột ${t.carbs}g (ngày nghỉ ${t.restCarbs}g), xơ ${t.fiber}g, nước ~${(t.waterBase / 1000).toFixed(1)} lít + 0,5 lít mỗi giờ tập. Dự kiến thay đổi ${t.weekly > 0 ? "−" : "+"}${Math.abs(t.weekly).toFixed(2)} kg/tuần.
- Lộ trình: tuần ${ph.week}/12 (giai đoạn "${ph.name}"). Lịch tuần: ${week}.
- Hôm nay: ${todayPlan || "nghỉ"}.
${stepsContext()}
- Đã ăn hôm nay: ${eaten ? `${Math.round(eaten.kcal)} kcal, đạm ${Math.round(eaten.p)}g, tinh bột ${Math.round(eaten.c)}g, béo ${Math.round(eaten.f)}g` : "chưa ghi"}.
- Cân nặng gần đây: ${weights.join("; ") || "chưa có"}.
${extra}`;
}
