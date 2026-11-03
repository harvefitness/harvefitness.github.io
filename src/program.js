// Personal training program generator.
// Inputs: profile (gym days, sports & their days, level, place, minutes, goal, focus, injuries)
// Output: weekly calendar, sessions with exercises, 12-week phases, coaching notes.
import { SPORTS } from "./calc.js";
import { exName, exCue } from "./exercises.js";
import { WEEK_ORDER, DOW_LONG, daysBetween, today, clamp } from "./ui.js";

// Slot = movement pattern. Options in preference order:
// [id, places (g=gym, h=home dumbbells, b=bodyweight), minLevel 0..2, avoid injuries]
const SLOTS = {
  squat: { vn: "Squat", main: true, legs: true, opts: [["Barbell_Squat", "g", 1, "knee back"], ["Goblet_Squat", "gh", 0, "knee"], ["Leg_Press", "g", 0, ""], ["Box_Squat", "g", 0, ""], ["Bodyweight_Squat", "hb", 0, ""]] },
  hinge: { vn: "Gập hông", main: true, legs: true, opts: [["Romanian_Deadlift", "g", 1, "back"], ["Stiff-Legged_Dumbbell_Deadlift", "gh", 0, "back"], ["Pull_Through", "g", 0, ""], ["Hyperextensions_Back_Extensions", "g", 0, ""], ["Single_Leg_Glute_Bridge", "hb", 0, ""]] },
  glute: { vn: "Mông", main: true, legs: true, opts: [["Barbell_Hip_Thrust", "g", 0, ""], ["Barbell_Glute_Bridge", "g", 0, ""], ["Single_Leg_Glute_Bridge", "hb", 0, ""], ["Butt_Lift_Bridge", "b", 0, ""]] },
  single: { vn: "Một chân", main: true, legs: true, opts: [["Split_Squat_with_Dumbbells", "gh", 0, "knee"], ["Dumbbell_Step_Ups", "gh", 0, ""], ["Dumbbell_Rear_Lunge", "gh", 0, ""], ["Split_Squats", "b", 0, "knee"], ["Bodyweight_Walking_Lunge", "b", 0, "knee"], ["Single_Leg_Glute_Bridge", "b", 0, ""]] },
  quad: { vn: "Đùi trước", legs: true, opts: [["Leg_Extensions", "g", 0, ""], ["Goblet_Squat", "h", 0, "knee"], ["Bodyweight_Walking_Lunge", "b", 0, "knee"], ["Single_Leg_Glute_Bridge", "hb", 0, ""]] },
  ham: { vn: "Đùi sau", legs: true, opts: [["Seated_Leg_Curl", "g", 0, ""], ["Lying_Leg_Curls", "g", 0, ""], ["Ball_Leg_Curl", "hb", 0, ""]] },
  abduct: { vn: "Mông ngoài", legs: true, opts: [["Thigh_Abductor", "g", 0, ""], ["Monster_Walk", "hb", 0, ""], ["Glute_Kickback", "hb", 0, ""]] },
  kickback: { vn: "Đá mông", legs: true, opts: [["One-Legged_Cable_Kickback", "g", 0, ""], ["Glute_Kickback", "hb", 0, ""]] },
  adduct: { vn: "Đùi trong", legs: true, opts: [["Thigh_Adductor", "g", 0, ""], ["Barbell_Side_Split_Squat", "hb", 0, "knee"]] },
  latlunge: { vn: "Di chuyển ngang", legs: true, opts: [["Barbell_Side_Split_Squat", "ghb", 0, "knee"], ["Monster_Walk", "ghb", 0, ""]] },
  calves: { vn: "Bắp chân", legs: true, opts: [["Seated_Calf_Raise", "g", 0, ""], ["Rocking_Standing_Calf_Raise", "ghb", 0, ""]] },
  hpush: { vn: "Đẩy ngang", main: true, opts: [["Barbell_Bench_Press_-_Medium_Grip", "g", 2, "shoulder wrist"], ["Leverage_Chest_Press", "g", 0, ""], ["Dumbbell_Bench_Press", "gh", 0, ""], ["Pushups", "hb", 1, "wrist"], ["Incline_Push-Up", "hb", 0, ""]] },
  incline: { vn: "Ngực trên", main: true, opts: [["Incline_Dumbbell_Press", "gh", 0, ""], ["Leverage_Chest_Press", "g", 0, ""], ["Incline_Push-Up", "hb", 0, ""]] },
  fly: { vn: "Ép ngực", opts: [["Butterfly", "g", 0, "shoulder"], ["Pushups", "hb", 0, "wrist"]] },
  vpush: { vn: "Đẩy vai", main: true, opts: [["Machine_Shoulder_Military_Press", "g", 0, "shoulder"], ["Dumbbell_Shoulder_Press", "gh", 0, "shoulder"], ["Side_Lateral_Raise", "ghb", 0, ""]] },
  vpull: { vn: "Kéo dọc", main: true, opts: [["Pullups", "g", 2, "shoulder"], ["Wide-Grip_Lat_Pulldown", "g", 0, ""], ["Band_Assisted_Pull-Up", "hb", 0, "shoulder"], ["Inverted_Row", "b", 0, ""], ["One-Arm_Dumbbell_Row", "h", 0, ""]] },
  hpull: { vn: "Kéo ngang", main: true, opts: [["Bent_Over_Barbell_Row", "g", 2, "back"], ["Seated_Cable_Rows", "g", 0, ""], ["One-Arm_Dumbbell_Row", "gh", 0, ""], ["Inverted_Row", "b", 0, ""]] },
  lateral: { vn: "Vai giữa", opts: [["Cable_Seated_Lateral_Raise", "g", 1, ""], ["Side_Lateral_Raise", "gh", 0, ""], ["Lateral_Raise_-_With_Bands", "b", 0, ""]] },
  rear: { vn: "Vai sau", opts: [["Face_Pull", "g", 0, ""], ["Reverse_Machine_Flyes", "g", 0, ""], ["Seated_Bent-Over_Rear_Delt_Raise", "hb", 0, ""]] },
  cuff: { vn: "Bảo vệ khớp vai", opts: [["External_Rotation_with_Cable", "g", 0, ""], ["External_Rotation_with_Band", "hb", 0, ""]] },
  biceps: { vn: "Tay trước", opts: [["Dumbbell_Bicep_Curl", "gh", 0, ""], ["Hammer_Curls", "gh", 0, ""]] },
  hammer: { vn: "Cẳng tay", opts: [["Hammer_Curls", "gh", 0, ""]] },
  triceps: { vn: "Tay sau", opts: [["Triceps_Pushdown_-_Rope_Attachment", "g", 0, ""], ["Cable_Rope_Overhead_Triceps_Extension", "g", 0, "shoulder"], ["Bench_Dips", "hb", 0, "shoulder wrist"], ["Pushups", "hb", 0, "wrist"]] },
  wrist: { vn: "Cổ tay", opts: [["Palms-Up_Dumbbell_Wrist_Curl_Over_A_Bench", "gh", 0, ""]] },
  core_ext: { vn: "Core chống võng", opts: [["Plank", "ghb", 0, ""], ["Dead_Bug", "ghb", 0, ""]] },
  core_rot: { vn: "Core chống xoay", opts: [["Pallof_Press", "g", 0, ""], ["Side_Bridge", "ghb", 0, ""], ["Russian_Twist", "hb", 0, "back"]] },
  core_flex: { vn: "Bụng", opts: [["Hanging_Leg_Raise", "g", 1, ""], ["Cable_Crunch", "g", 0, ""], ["Flat_Bench_Lying_Leg_Raise", "ghb", 0, ""], ["Dead_Bug", "ghb", 0, ""]] },
  carry: { vn: "Lực cầm + core", opts: [["Farmers_Walk", "gh", 0, ""]] },
  power_rot: { vn: "Lực xoay", opts: [["Pallof_Press_With_Rotation", "g", 1, "back"], ["Medicine_Ball_Full_Twist", "g", 0, "back"], ["Russian_Twist", "hb", 0, "back"]] },
};

// Session templates (slot lists, most important first).
const TEMPLATES = {
  FA: { name: "Toàn thân A", lower: true, upper: true, slots: ["squat", "hpush", "hpull", "hinge", "lateral", "core_ext"] },
  FB: { name: "Toàn thân B", lower: true, upper: true, slots: ["hinge", "vpull", "incline", "single", "rear", "core_rot"] },
  FC: { name: "Toàn thân C", lower: true, upper: true, slots: ["glute", "single", "vpush", "hpull", "ham", "core_flex"] },
  UA: { name: "Thân trên A", upper: true, slots: ["hpush", "vpull", "hpull", "vpush", "lateral", "triceps", "biceps"] },
  UB: { name: "Thân trên B", upper: true, slots: ["incline", "hpull", "vpull", "lateral", "rear", "biceps", "triceps"] },
  LA: { name: "Thân dưới A", lower: true, slots: ["squat", "hinge", "single", "ham", "calves", "core_ext"] },
  LB: { name: "Thân dưới B (mông)", lower: true, slots: ["glute", "hinge", "quad", "abduct", "calves", "core_rot"] },
  PU: { name: "Đẩy (ngực, vai, tay sau)", upper: true, slots: ["hpush", "vpush", "incline", "lateral", "triceps", "fly"] },
  PL: { name: "Kéo (lưng, vai sau, tay trước)", upper: true, slots: ["vpull", "hpull", "rear", "biceps", "hammer", "core_flex"] },
  LG: { name: "Chân", lower: true, slots: ["squat", "hinge", "single", "ham", "quad", "calves"] },
};
function splitFor(n, level) {
  if (n <= 1) return ["FA"];
  if (n === 2) return ["FA", "FB"];
  if (n === 3) return level === 0 ? ["FA", "FB", "FC"] : ["UA", "LA", "FC"];
  if (n === 4) return ["UA", "LA", "UB", "LB"];
  if (n === 5) return ["UA", "LA", "PU", "PL", "LB"];
  return ["PU", "PL", "LA", "UB", "LB", "FC"];
}

const LEVELS = ["Mới tập (< 6 tháng)", "Đã tập 6–24 tháng", "Trên 2 năm"];
export const LEVEL_OPTS = LEVELS;
export const PLACES = { g: "Phòng gym", h: "Ở nhà (có tạ đơn)", b: "Ở nhà (không dụng cụ)" };
export const FOCUS = { glutes: "Mông", waist: "Eo – bụng", legs: "Chân thon", arms: "Tay săn", shoulders: "Vai", chest: "Ngực", back: "Lưng" };
export const INJURIES = { shoulder: "Vai", knee: "Gối", back: "Lưng dưới", wrist: "Cổ tay / khuỷu" };

function pick(slotKey, ctx, used) {
  const slot = SLOTS[slotKey];
  if (!slot) return null;
  const ok = slot.opts.filter(([id, places, lvl, avoid]) => places.includes(ctx.place) && ctx.level >= lvl && !ctx.injuries.some((i) => avoid.includes(i)));
  const fresh = ok.find(([id]) => !used.has(id)) || ok[0];
  if (!fresh) return null;
  used.add(fresh[0]);
  return fresh[0];
}

/** Sets × reps by role and level (ACSM 2009 progression model / Schoenfeld 2017). */
function dose(slotKey, level, phase, id) {
  const s = SLOTS[slotKey];
  const isCore = slotKey.startsWith("core") || slotKey === "carry";
    let sets, reps, rest, rir;
  if (isCore) [sets, reps, rest, rir] = [3, "10–12", "45s", ""];
  else if (s.main) [sets, reps, rest, rir] = [[3, 3, 4][level], ["10–12", "8–10", "6–8"][level], ["90s", "2 phút", "2–3 phút"][level], ["RIR 2–3", "RIR 1–2", "RIR 1–2"][level]];
  else [sets, reps, rest, rir] = [[2, 3, 3][level], ["12–15", "10–15", "10–15"][level], "60s", "RIR 1–2"];
  if (slotKey === "cuff" || slotKey === "wrist") [sets, reps, rest, rir] = [2, "15", "30s", "tạ rất nhẹ"];
  if (id === "Plank") reps = ["20–30 giây", "30–45 giây", "45–60 giây"][level];
  if (id === "Side_Bridge") reps = ["20 giây/bên", "30 giây/bên", "45 giây/bên"][level];
  if (id === "Farmers_Walk") reps = "30–40 m";
  if (/\/chân|\/bên/.test(reps) === false && ["single", "latlunge"].includes(slotKey)) reps += "/chân";
  if (["Dead_Bug", "Pallof_Press", "Pallof_Press_With_Rotation", "Russian_Twist"].includes(id)) reps = "10/bên";
  if (phase === 0) sets = Math.max(2, sets - 1), (rir = s.main ? "RIR 3 – học kỹ thuật" : rir);
  if (phase === 2 && s.main) sets += 1;
  if (phase === 3) sets = Math.max(1, Math.round(sets * 0.6)), (rir = "Deload: tạ −10%");
  return { sets, reps, rest, rir };
}

// 12-week periodisation (linear → overload → deload & re-test).
export const PHASES = [
  { w: [1, 2], short: "Làm quen", name: "Làm quen", vn: "Học đúng kỹ thuật, tạ nhẹ, mỗi bài ít hơn 1 hiệp. Cơ sẽ mỏi nhiều ở tuần đầu, là bình thường." },
  { w: [3, 7], short: "Nền tảng", name: "Nền tảng", vn: "Tăng tiến kép: đủ số rep cao nhất ở mọi hiệp thì buổi sau tăng tạ (chân +2,5–5 kg, tay +1–2 kg)." },
  { w: [8, 11], short: "Tăng cường", name: "Tăng cường", vn: "Thêm 1 hiệp cho bài chính, tập gần giới hạn (còn 1–2 rep). Ngủ đủ để phục hồi." },
  { w: [12, 12], short: "Đo lại", name: "Giảm tải & đo lại", vn: "Giảm 40% số hiệp, tạ −10%. Cuối tuần cân đo lại để làm lộ trình chu kỳ mới." },
];
export function phaseOf(startDate, date = today()) {
  const d = Math.max(0, daysBetween(startDate || date, date));
  const week = (Math.floor(d / 7) % 12) + 1;
  const cycle = Math.floor(d / 84) + 1;
  const idx = PHASES.findIndex((p) => week >= p.w[0] && week <= p.w[1]);
  return { week, cycle, idx, ...PHASES[idx] };
}

/** Assign sessions to gym days, minimising conflicts with leg-heavy sports. */
function arrange(sessionKeys, gymDays, sportDays) {
  const legSport = new Set();
  for (const [d, list] of Object.entries(sportDays)) if (list.some((s) => SPORTS[s]?.legs)) legSport.add(+d);
  const days = WEEK_ORDER.filter((d) => gymDays.includes(d));
  let best = null, bestScore = -1e9;
  const perm = (arr, k = 0) => {
    if (k === arr.length) {
      let score = 0;
      arr.forEach((key, i) => {
        const d = days[i];
        const t = TEMPLATES[key];
        const next = (d + 1) % 7, prev = (d + 6) % 7;
        if (t.lower) {
          if (legSport.has(next)) score -= 3;
          if (legSport.has(prev)) score -= 2;
          if (legSport.has(d)) score -= 1;
        }
        // same-type sessions on consecutive days
        const j = days.indexOf(next);
        if (j >= 0) {
          const u = TEMPLATES[arr[j]];
          if ((t.lower && u.lower && !t.upper) || (t.upper && u.upper && !t.lower)) score -= 2;
        }
        score -= i * 0.01 * sessionKeys.indexOf(key); // keep natural order on ties
      });
      if (score > bestScore) (bestScore = score), (best = arr.slice());
      return;
    }
    for (let i = k; i < arr.length; i++) {
      [arr[k], arr[i]] = [arr[i], arr[k]];
      perm(arr, k + 1);
      [arr[k], arr[i]] = [arr[i], arr[k]];
    }
  };
  perm(sessionKeys.slice());
  const map = {};
  days.forEach((d, i) => (map[d] = best[i]));
  return map;
}

/** Build the whole program from a profile + assessment. */
export function buildProgram(p, a) {
  const level = clamp(+p.level || 0, 0, 2);
  const place = p.place || "g";
  const injuries = p.injuries || [];
  const focus = p.focus || [];
  const female = p.sex !== "male";
  const gymDays = (p.gymDays || []).map(Number);
  const sports = (p.sports || []).filter((s) => SPORTS[s.type] && s.days?.length);
  const sportDays = {};
  for (const s of sports) for (const d of s.days) (sportDays[d] ||= []).push(s.type);
  const racquet = sports.some((s) => SPORTS[s.type].racquet);
  const swim = sports.some((s) => s.type === "swimming");
  const runner = sports.some((s) => ["running", "football", "basketball"].includes(s.type));
  const legSportCount = sports.filter((s) => SPORTS[s.type].legs).reduce((n, s) => n + s.days.length, 0);
  const minutes = +p.gymMinutes || 60;
  const maxEx = clamp(Math.round((minutes - 12) / 7), 4, 9);
  const ph = phaseOf(p.programStart);
  const notes = [];

  const keys = splitFor(gymDays.length, level);
  const ctx = { level, place, injuries };
  const sessions = {};
  for (const key of keys) {
    const t = TEMPLATES[key];
    let slots = t.slots.slice();
    const add = (s, front = false) => {
      if (slots.includes(s)) return;
      front ? slots.splice(1, 0, s) : slots.push(s);
    };
    // Focus areas
    const glutesFocus = focus.includes("glutes") || (female && !focus.length);
    if (t.lower && glutesFocus) {
      if (!slots.includes("glute")) slots.splice(t.upper ? 1 : 0, 0, "glute");
      add("abduct");
      if (!t.upper) add("kickback");
    }
    if (focus.includes("waist")) add("core_rot"), add("carry");
    if (focus.includes("arms") && t.upper) add("biceps"), add("triceps");
    if (focus.includes("shoulders") && t.upper) add("lateral", true);
    if (focus.includes("chest") && t.upper) add("incline");
    if (focus.includes("back") && t.upper) add("hpull"), add("rear");
    if (focus.includes("legs") && t.lower) add("single"), add("abduct");
    // Sports
    if (racquet) {
      if (t.upper) add("rear", true), add("cuff");
      if (t.lower) add("latlunge");
      if (key === keys[0]) add("power_rot");
      if (key === keys[keys.length - 1]) add("wrist");
      if (sports.find((s) => SPORTS[s.type].racquet).days.length >= 3) slots = slots.filter((s) => s !== "vpush" || !t.upper || slots.includes("lateral"));
    }
    if (swim && t.upper) add("cuff"), add("rear");
    if (runner && t.lower) add("single"), add("calves"), add("adduct");
    if (injuries.includes("shoulder")) slots = slots.filter((s) => s !== "vpush"), t.upper && add("cuff");
    // Many leg-heavy sport sessions → trim leg volume in full-body days.
    if (legSportCount >= 3 && t.lower && t.upper) slots = slots.filter((s) => !["quad", "calves"].includes(s));
    // Keep core last, then trim to the time budget (main lifts first).
    const core = slots.filter((s) => s.startsWith("core") || s === "carry");
    let body = slots.filter((s) => !core.includes(s));
    const room = maxEx - Math.min(core.length, 1);
    body = body.slice(0, Math.max(3, room));
    slots = [...body, ...core].slice(0, maxEx);
    const used = new Set();
    const exercises = slots
      .map((s) => {
        const id = pick(s, ctx, used);
        if (!id) return null;
        return { slot: s, slotVn: SLOTS[s].vn, id, vn: exName(id), cue: exCue(id), ...dose(s, level, ph.idx, id) };
      })
      .filter(Boolean);
    sessions[key] = { key, name: t.name, lower: !!t.lower, upper: !!t.upper, exercises };
  }

  // Warm-up & cool-down
  const warm = [
    { id: place === "g" ? "Bicycling_Stationary" : "Rope_Jumping", vn: place === "g" ? "Đạp xe / đi bộ dốc 5 phút" : "Nhảy dây / chạy tại chỗ 3–5 phút" },
    { id: "Worlds_Greatest_Stretch", vn: "World's greatest stretch, 5 lần mỗi bên" },
    { id: "Round_The_World_Shoulder_Stretch", vn: "Xoay vai, mở ngực 1 phút" },
  ];
  const cool = (s) =>
    [s.lower && "Kneeling_Hip_Flexor", s.lower && "90_90_Hamstring", s.upper && "Chest_And_Front_Of_Shoulder_Stretch", racquet && "Kneeling_Forearm_Stretch", "Childs_Pose"].filter(Boolean).slice(0, 4);

  // Cardio prescription
  let cardio = null;
  const sportH = sports.reduce((n, s) => n + s.days.length * ((+s.minutes || 60) / 60), 0);
  if (p.goal === "cut" || p.goal === "recomp") {
    cardio = sportH >= 2
      ? { text: `Các buổi ${sports.map((s) => SPORTS[s.type].vn.toLowerCase()).join(", ")} đã là cardio. Thêm đi bộ 8.000–10.000 bước mỗi ngày, không cần cardio riêng.`, extra: false }
      : { text: "Cuối 2 buổi gym: đi bộ dốc 20–25 phút (dốc 8–12%, 5 km/h). Mỗi ngày đi 8.000–10.000 bước.", extra: true };
  } else if (p.goal === "gain" || p.goal === "bulk") {
    cardio = { text: "Cardio nhẹ 1–2 buổi × 20 phút/tuần cho tim mạch, không hơn để giữ calo cho tăng cơ.", extra: false };
  } else cardio = { text: "Đi bộ 7.000–10.000 bước/ngày. Có thể thêm 1–2 buổi cardio 20–30 phút.", extra: false };

  // Weekly calendar
  const map = arrange(keys, gymDays, sportDays);
  const week = WEEK_ORDER.map((d) => {
    const items = [];
    if (map[d]) items.push({ kind: "gym", key: map[d], name: sessions[map[d]].name });
    for (const s of sports) if (s.days.includes(d)) items.push({ kind: "sport", type: s.type, name: SPORTS[s.type].vn, minutes: +s.minutes || 60, time: s.time || "" });
    if (!items.length) items.push({ kind: "rest", name: "Nghỉ / vận động nhẹ" });
    return { d, dayVn: DOW_LONG[d], items };
  });

  // Coaching notes
  const total = gymDays.length + sports.reduce((n, s) => n + s.days.length, 0);
  if (racquet)
    notes.push(
      "Bạn chơi môn vợt nên giáo án thêm face pull và xoay ngoài vai để bảo vệ khớp vai, thêm Pallof press để tăng lực xoay thân, lunge ngang cho di chuyển ngang, và cuốn cổ tay để phòng đau khuỷu tay (tennis elbow).",
      "Bài chân nặng được xếp cách buổi vợt ít nhất 1 ngày nếu lịch cho phép. Hôm sau buổi vợt mà vai, cẳng tay còn mỏi thì không đẩy tạ qua đầu, giảm tạ bài tay."
    );
  if (runner) notes.push("Bạn chạy/đá bóng nên giáo án có thêm bài một chân, bắp chân và đùi trong để giảm nguy cơ chấn thương gối, cổ chân.");
  if (swim) notes.push("Bơi dùng vai nhiều, nên giáo án giảm đẩy qua đầu và thêm bài vai sau, xoay ngoài vai.");
  if (total >= 6) notes.push(`Bạn vận động ${total} buổi/tuần. Giữ ít nhất 1 ngày nghỉ hoàn toàn và ngủ 7–9 tiếng, nếu không cơ sẽ không kịp phục hồi.`);
  if (a.sleep && a.sleep < 7) notes.push(`Bạn đang ngủ khoảng ${a.sleep.toFixed(1).replace(".", ",")} tiếng. Thiếu ngủ làm giảm sức mạnh và tăng cảm giác thèm ăn. Hãy cố ngủ đủ 7 tiếng trước khi tăng khối lượng tập.`);
  if (injuries.length) notes.push(`Đã loại các bài dễ gây đau cho: ${injuries.map((i) => INJURIES[i]).join(", ")}. Đau nhói (khác với mỏi cơ) thì dừng bài đó ngay.`);
  if (a.bodyType) notes.push(`Tạng người ${a.bodyType.vn}: ${a.bodyType.train}`);
  if (level === 0) notes.push("Người mới: chọn mức tạ sao cho hết hiệp vẫn còn sức làm thêm 2–3 lần (RIR 2–3). Quay video form từ bên hông để tự kiểm tra.");

  return { level, place, keys, sessions, week, map, warm, cool, cardio, notes, phase: ph, maxEx, sports };
}

/** What is planned for a date: list of calendar items. */
export function planFor(program, date) {
  const d = new Date(date + "T00:00").getDay();
  return program.week.find((w) => w.d === d)?.items || [];
}

/** Hours of training on a date (for water / carbs). */
export function trainingHours(program, p, date) {
  return planFor(program, date).reduce((h, it) => h + (it.kind === "gym" ? (+p.gymMinutes || 60) / 60 : it.kind === "sport" ? it.minutes / 60 : 0), 0);
}
