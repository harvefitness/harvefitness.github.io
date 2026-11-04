// Reminder schedule for one person and one day. Pure functions: used by the website (to show
// "today's reminders" and the settings) and by tools/notify.mjs (the GitHub Actions "postman").
// Every time comes from the person's own profile (wake / bed / training time, gym days, sports,
// supplements, goal) and their 12-week program, so each person gets their own schedule.
import { assess, targets, waterFor, SPORTS } from "./calc.js";
import { buildProgram, planFor, trainingHours, phaseOf } from "./program.js";
import { totals } from "./food.js";
import { hm, hmStr, addDays, daysBetween, DOW } from "./ui.js";

/** Built-in reminders. `opt` = one setting the person can change. */
export const KINDS = {
  coach: { t: "PT nhắc buổi tập", d: "Sáng ngày tập: buổi gì, bài nào nên tăng tạ / tăng số lần", def: true },
  train: { t: "Trước giờ tập", d: "Trước giờ tập gym / chơi thể thao", def: true, opt: { key: "trainLead", label: "Nhắc trước", values: [15, 30, 45, 60, 90], unit: "phút" } },
  water: { t: "Uống nước", d: "Khi uống chưa đủ so với giờ trong ngày", def: true, opt: { key: "waterEvery", label: "Kiểm tra mỗi", values: [2, 3, 4], unit: "tiếng" } },
  meals: { t: "Ghi bữa ăn & đạm", d: "Trưa chưa ghi bữa nào; tối còn thiếu đạm", def: true },
  missed: { t: "Chưa tập", d: "Buổi tối nếu buổi tập hôm nay chưa xong", def: true },
  sleep: { t: "Đi ngủ", d: "Trước giờ ngủ: tắt màn hình, giãn cơ", def: false, opt: { key: "sleepLead", label: "Nhắc trước", values: [15, 30, 45, 60], unit: "phút" } },
  weigh: { t: "Cân buổi sáng", d: "1 sáng mỗi tuần, cân trước khi ăn để theo dõi tiến độ", def: false, opt: { key: "weighDay", label: "Vào", values: [1, 2, 3, 4, 5, 6, 0], names: DOW } },
};
export const DEFAULTS = { ...Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.def])), trainLead: 30, waterEvery: 3, sleepLead: 30, weighDay: 1 };
export const settingsOf = (push) => ({ ...DEFAULTS, ...(push?.prefs || {}) });

export const REPEAT = { daily: "Mỗi ngày", gym: "Ngày tập gym", train: "Ngày tập & thể thao", rest: "Ngày nghỉ", days: "Chọn thứ" };
export function repeatText(c) {
  if (c.repeat !== "days") return REPEAT[c.repeat] || REPEAT.daily;
  const d = [...(c.days || [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  return d.length === 7 ? REPEAT.daily : d.length ? d.map((x) => DOW[x]).join(", ") : "Chưa chọn thứ";
}

const num = (v) => (v === "" || v == null || isNaN(+v) ? null : +v);
const fmtKg = (k) => String(k).replace(".", ",");
const repRange = (reps) => {
  const n = String(reps).match(/\d+/g)?.map(Number) || [];
  return { lo: n[0] ?? 0, hi: n[1] ?? n[0] ?? 0, timed: /giây|phút/.test(reps) };
};
const LOWER = new Set(["squat", "hinge", "glute", "single", "quad", "ham", "calves", "latlunge"]);

/** Exercises of a session that should go up today (same double-progression rule as the website). */
export function progressionUps(session, workouts, date) {
  const ups = [];
  for (const ex of session.exercises) {
    const r = repRange(ex.reps);
    if (r.timed) continue;
    const prev = Object.keys(workouts || {})
      .filter((d) => d < date)
      .sort()
      .reverse()
      .map((d) => (workouts[d].sets?.[ex.id] || []).filter((s) => s.done))
      .find((a) => a.length);
    if (!prev) continue;
    const reps = prev.map((s) => num(s.reps)).filter((x) => x != null);
    if (!reps.length || Math.min(...reps) < r.hi) continue;
    const kg = Math.max(0, ...prev.map((s) => num(s.kg) || 0));
    const inc = LOWER.has(ex.slot) && kg >= 20 ? 5 : 2.5;
    ups.push(kg ? `${ex.vn} → ${fmtKg(Math.min(100, kg + inc))} kg` : `${ex.vn} (thêm tạ hoặc thêm lần)`);
  }
  return ups;
}

function dayInfo(user, date) {
  const p = user.profile;
  const a = assess(p);
  const tg = targets(p, a);
  const prog = user.prog || buildProgram(p, a);
  const items = planFor(prog, date);
  const w = user.workouts?.[date];
  const gymKey = w?.sessionKey !== undefined ? w.sessionKey : items.find((i) => i.kind === "gym")?.key;
  const session = gymKey ? prog.sessions[gymKey] : null;
  const sport = items.find((i) => i.kind === "sport") || null;
  return { p, tg, prog, items, w, session, sport };
}

function repeatMatch(c, dw, info) {
  switch (c.repeat) {
    case "gym": return !!info.session;
    case "train": return !!(info.session || info.sport);
    case "rest": return !info.session && !info.sport;
    case "days": return (c.days || []).includes(dw);
    default: return true;
  }
}

/**
 * Every reminder planned for `date`, sorted by time.
 * user = { profile, push:{prefs, custom}, food:{date:log}, workouts:{date:log}, prog? }
 * Item: { key, kind, min, title, body, url, ok (condition true right now), when (condition text), custom }
 * `min` = minutes since midnight of `date` (may be > 1440 for after-midnight times before bedtime).
 */
export function dayPlan(user, date) {
  const p = user.profile;
  if (!p?.weight || !p?.height) return { items: [], wake: 420, bed: 1380 };
  const s = settingsOf(user.push);
  const wake = hm(p.wakeTime) ?? 420;
  let bed = hm(p.bedTime) ?? 1380;
  if (bed <= wake) bed += 1440;
  const info = dayInfo(user, date);
  const { tg, prog, w, session, sport } = info;
  const dw = new Date(date + "T00:00").getDay();
  let train = hm(!session && sport?.time ? sport.time : p.trainTime) ?? 1080;
  if (train < wake) train += 1440;
  const log = user.food?.[date] || { meals: {}, water: 0 };
  const eaten = totals(Object.values(log.meals || {}).flat());
  const cupsGoal = Math.round(waterFor(tg, trainingHours(prog, p, date)) / 250);
  const cups = +log.water || 0;
  const doneAny = Object.values(w?.sets || {}).some((a) => a.some((x) => x.done));
  const out = [];
  const add = (kind, key, min, title, body, url = "./#home", ok = true, when = "") => out.push({ kind, key, min, title, body, url, ok, when, custom: false });

  // 1. Morning: today's session (+ what to increase, + new phase of the 12-week program)
  if (session || sport) {
    const start = p.programStart || date;
    const ph = phaseOf(start, date);
    const newWeek = date > start && daysBetween(start, date) % 7 === 0;
    const lead = newWeek ? `Bắt đầu tuần ${ph.week}/12 · ${ph.short}. ` : "";
    if (session) {
      const ups = progressionUps(session, user.workouts, date);
      add("coach", "coach", wake + 30, `Hôm nay: ${session.name} 💪`, lead + (ups.length ? `PT nhắc tăng tạ: ${ups.slice(0, 3).join(", ")}.` : `${session.exercises.length} bài, khoảng ${p.gymMinutes || 60} phút lúc ${hmStr(train)}.`), "./#train-today");
    } else {
      add("coach", "coach", wake + 30, `Hôm nay chơi ${sport.name} 🎾`, lead + "Ăn nhẹ trước 1–2 tiếng, mang đủ nước. Hôm nay không tập tạ, khởi động kỹ cổ chân, gối, vai.", "./#train-today");
    }
  }
  // 2. Before training / sport
  if (session || sport) {
    const name = session ? session.name : sport.name;
    add("train", "train", train - s.trainLead, `Còn ${s.trainLead} phút nữa tới giờ ${session ? "tập" : "chơi"} ${name}`, "Uống 300–500 ml nước. Đói thì ăn 1 quả chuối. Khởi động 8 phút trước khi vào bài.", "./#train-today", !w?.completed, "nếu chưa tập xong");
  }
  // 3. Water checkpoints
  const every = Math.max(1, +s.waterEvery || 3) * 60;
  for (let cp = wake + every, i = 0; cp <= bed - 60; cp += every, i++) {
    const expected = Math.floor((cupsGoal * (cp - wake)) / (bed - wake));
    add("water", `water${i}`, cp, "Uống nước nào 💧", `Bạn mới uống ${cups}/${cupsGoal} cốc. Uống thêm 1 cốc 250 ml rồi chạm vào ly trên web nhé.`, "./#home", cups < expected - 1, "nếu uống chưa đủ");
  }
  // 4. Meals
  const anything = Object.values(log.meals || {}).some((a) => a?.length);
  add("meals", "meals0", wake + 360, "Bạn chưa ghi bữa ăn nào hôm nay", "Chụp ảnh hoặc nói món ăn, PT sẽ tính calo và chấm điểm cho bạn 📷", "./#food-log", !anything, "nếu chưa ghi bữa nào");
  const miss = Math.round(tg.protein - eaten.p);
  add("meals", "meals1", bed - 180, `Còn thiếu khoảng ${Math.max(miss, 0)}g đạm hôm nay`, miss >= 40 ? "Gợi ý: 150g ức gà luộc (~46g) hoặc 1 ly whey + 1 hũ sữa chua Hy Lạp." : "Gợi ý: 1 hũ sữa chua Hy Lạp (~15g) hoặc 2 quả trứng (~12g).", "./#food-log", anything && miss > 20, "nếu còn thiếu đạm");
  // 5. Planned gym session not done
  if (session) add("missed", "missed", Math.max(train + 150, bed - 240), `Bạn chưa tập ${session.name} hôm nay`, "Chỉ 20 phút cũng tốt hơn bỏ buổi. Hoặc dời sang mai trong lịch tập.", "./#train-today", !w?.completed && !doneAny, "nếu chưa tập");
  // 6. Bedtime
  add("sleep", "sleep", bed - s.sleepLead, "Chuẩn bị đi ngủ 😴", `Còn ${s.sleepLead} phút nữa là ${hmStr(bed)}. Tắt màn hình, giãn cơ 5 phút. Ngủ đủ 7–9 tiếng giúp giữ cơ và bớt thèm ăn.`);
  // 7. Weekly weigh-in
  if (dw === +s.weighDay) add("weigh", "weigh", wake + 10, "Cân buổi sáng ⚖️", "Cân sau khi đi vệ sinh, trước khi ăn uống. Ghi vào mục Cơ thể để PT theo dõi tiến độ.", "./#body");

  const items = out.filter((i) => s[i.kind]);
  // 8. The person's own reminders
  for (const c of user.push?.custom || []) {
    if (c.on === false || !c.time || !repeatMatch(c, dw, info)) continue;
    const m = hm(c.time);
    items.push({ kind: "custom", key: `c-${c.id}`, min: m < wake && m + 1440 <= bed ? m + 1440 : m, title: c.title || "Nhắc nhở", body: c.body || "", url: "./#home", ok: true, when: "", custom: true });
  }
  items.sort((a, b) => a.min - b.min);
  return { items, wake, bed, cupsGoal, session, sport, train };
}

/** Local date + minutes since midnight in a time zone. */
export function localNow(tz, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((x) => [x.type, x.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, min: (+parts.hour % 24) * 60 + +parts.minute };
}

/**
 * What to send now. GitHub runs this every ~30 min (sometimes late), so each reminder has a
 * 60-minute window; `push.sent[date][key]` stops repeats. Built-in reminders stay quiet while the
 * person sleeps; their own reminders go out at the time they chose.
 */
export function dueReminders(user, now = new Date()) {
  const p = user.profile;
  if (!p?.weight || !p?.height) return [];
  const { date, min } = localNow(user.push?.tz, now);
  const sent = (d) => user.push?.sent?.[d] || {};
  const wake = hm(p.wakeTime) ?? 420;
  let bed = hm(p.bedTime) ?? 1380;
  if (bed <= wake) bed += 1440;
  // After midnight but before bedtime still belongs to "yesterday".
  const late = min < wake && min + 1440 < bed;
  const planDate = late ? addDays(date, -1) : date;
  const t = late ? min + 1440 : min;
  const awake = t >= wake && t <= bed - 20;
  const plan = dayPlan(user, planDate);
  const out = [];
  for (const i of plan.items) {
    if (i.custom || !awake || !i.ok || sent(planDate)[i.key]) continue;
    if (t >= i.min && t < i.min + (i.kind === "missed" ? 90 : 60)) out.push({ ...i, date: planDate });
  }
  const own = planDate === date ? plan : dayPlan(user, date);
  for (const i of own.items) {
    if (!i.custom || sent(date)[i.key]) continue;
    const m = i.min % 1440;
    if (min >= m && min < m + 60) out.push({ ...i, date });
  }
  return out;
}

/** Ideas for the person's own reminders, built from their profile and program. */
export function suggestions(p, prog) {
  if (!p) return [];
  const wake = hm(p.wakeTime) ?? 420;
  let bed = hm(p.bedTime) ?? 1380;
  if (bed <= wake) bed += 1440;
  const train = hm(p.trainTime) ?? 1080;
  const gymMin = +p.gymMinutes || 60;
  const out = [];
  const add = (id, title, body, time, repeat, days) => out.push({ sid: id, title, body, time: hmStr(time), repeat, days: days || [] });
  const supps = p.supps || [];
  if (supps.includes("creatine")) add("creatine", "Uống creatine 5g 💊", "Pha với nước hoặc sữa. Uống mỗi ngày, kể cả ngày nghỉ.", wake + 45, "daily");
  if (supps.includes("whey")) add("whey", "Uống 1 ly whey sau tập 🥤", "Trong 1–2 tiếng sau tập: 1 muỗng whey (~25g đạm).", train + gymMin + 15, "gym");
  if (["gain", "bulk", "recomp"].includes(p.goal)) add("pre", "Ăn bữa nhỏ trước tập 🍌", "1 quả chuối + 1 hộp sữa chua, hoặc 1 lát bánh mì + trứng.", train - 90, "gym");
  if (["cut", "recomp", "maintain"].includes(p.goal)) add("walk", "Đi bộ 15 phút sau bữa tối 🚶", "Giúp hạ đường huyết sau ăn và đốt thêm ~60 kcal.", bed - 210, "daily");
  for (const sp of p.sports || []) {
    const S = SPORTS[sp.type];
    if (!S || !sp.days?.length) continue;
    const t = hm(sp.time) ?? train;
    add(`sport-${sp.type}`, `Chuẩn bị đồ ${S.vn}`, "Giày, quần áo, nước, khăn. Ăn nhẹ trước 1–2 tiếng.", t - 120, "days", sp.days);
  }
  if (p.gymDays?.length) add("stretch", "Giãn cơ 10 phút 🧘", "Giãn đùi sau, hông, ngực, vai. Giúp bớt đau mỏi và ngủ ngon.", bed - 60, "gym");
  if (p.job === "sit") add("stand", "Đứng dậy vận động 3 phút", "Ngồi lâu làm cứng hông và giảm đốt năng lượng. Đứng, vươn vai, đi lại.", wake + 300, "days", [1, 2, 3, 4, 5]);
  add("photo", "Chụp ảnh tiến độ 📸", "Cùng góc, cùng ánh sáng, mỗi tuần 1 lần. Nhìn ảnh dễ thấy thay đổi hơn nhìn cân.", wake + 20, "days", [0]);
  add("prep", "Chuẩn bị đồ ăn cho mai 🍱", "Luộc sẵn ức gà / trứng, cắt rau, chia hộp. Có đồ sẵn thì dễ ăn đúng.", bed - 150, "days", [0, 3]);
  return out;
}
