// DNT & HARVE FITNESS – reminder "postman".
// Runs every 30 minutes on GitHub Actions (.github/workflows/notify.yml). For every user who turned
// reminders on (users/{uid}/meta/push), works out what is due in their local time and sends it with
// Firebase Cloud Messaging. Each reminder is sent at most once per day. Nothing is sent while they sleep.
//
// Needs the secret FIREBASE_SERVICE_ACCOUNT (the service-account JSON from Firebase).
// Test without Firebase:  node tools/notify.mjs --selftest

// The website's own modules expect a browser; give them the few globals they touch.
globalThis.addEventListener ??= () => {};
globalThis.window ??= { APP_CONFIG: {} };

const { assess, targets, waterFor } = await import("../src/calc.js");
const { buildProgram, planFor, trainingHours } = await import("../src/program.js");
const { totals } = await import("../src/food.js");

const hm = (s) => {
  if (!s) return null;
  const [h, m] = String(s).split(":").map(Number);
  return h * 60 + (m || 0);
};
const num = (v) => (v === "" || v == null || isNaN(+v) ? null : +v);
const fmtKg = (k) => String(k).replace(".", ",");

/** Local date + minutes-since-midnight in a time zone. */
export function localNow(tz, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, min: +parts.hour * 60 + +parts.minute };
}

const repRange = (reps) => {
  const n = String(reps).match(/\d+/g)?.map(Number) || [];
  return { lo: n[0] ?? 0, hi: n[1] ?? n[0] ?? 0, timed: /giây|phút/.test(reps) };
};
const LOWER = new Set(["squat", "hinge", "glute", "single", "quad", "ham", "calves", "latlunge"]);

/** Exercises of today's session that should go up (same rule as the website's PT tip). */
function progressionUps(session, workouts, date) {
  const ups = [];
  for (const ex of session.exercises) {
    const r = repRange(ex.reps);
    if (r.timed) continue;
    const prev = Object.keys(workouts)
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

/**
 * What to send now for one user. Pure function (easy to test).
 * user = { profile, push:{prefs,sent,tz}, food:{date:log}, workouts:{date:log} }
 * Returns [{ key, title, body, url }].
 */
export function dueReminders(user, now = new Date()) {
  const p = user.profile;
  if (!p?.weight || !p?.height) return [];
  const prefs = { train: true, coach: true, water: true, meals: true, missed: true, ...(user.push?.prefs || {}) };
  const { date, min } = localNow(user.push?.tz, now);
  const sent = user.push?.sent?.[date] || {};
  const wake = hm(p.wakeTime) ?? 420;
  let bed = hm(p.bedTime) ?? 1380;
  if (bed <= wake) bed += 1440;
  let t = min < wake && min + 1440 < bed ? min + 1440 : min; // after midnight but before bedtime
  if (t < wake || t > bed - 20) return []; // sleeping
  // GitHub cron can run late, so each window is 60 min; "sent" flags stop repeats.
  const at = (target, width = 60) => t >= target && t < target + width;

  const a = assess(p);
  const tg = targets(p, a);
  const prog = buildProgram(p, a);
  const items = planFor(prog, date);
  const w = user.workouts?.[date];
  const gymKey = w?.sessionKey !== undefined ? w.sessionKey : items.find((i) => i.kind === "gym")?.key;
  const session = gymKey ? prog.sessions[gymKey] : null;
  const sport = items.find((i) => i.kind === "sport");
  let train = hm(p.trainTime) ?? 1080;
  if (train < wake) train += 1440;
  const log = user.food?.[date] || { meals: {}, water: 0 };
  const eaten = totals(Object.values(log.meals || {}).flat());
  const cupsGoal = Math.round(waterFor(tg, trainingHours(prog, p, date)) / 250);
  const out = [];
  const add = (key, title, body, url = "./#home") => !sent[key] && out.push({ key, title, body, url });

  // 1. Morning of a training day: today's session + what to increase
  if (prefs.coach && session && at(wake + 30, 60)) {
    const ups = progressionUps(session, user.workouts || {}, date);
    add("coach", `Hôm nay: ${session.name} 💪`, ups.length ? `PT nhắc tăng tạ: ${ups.slice(0, 3).join(", ")}.` : `${session.exercises.length} bài, khoảng ${p.gymMinutes || 60} phút. Mở web để xem bài tập.`, "./#train-today");
  }
  // 2. 30 minutes before training / sport
  if (prefs.train && (session || sport) && !w?.completed && at(train - 30)) {
    const name = session ? session.name : sport.name;
    add("train", `Còn 30 phút nữa tới giờ ${session ? "tập" : "chơi"} ${name}`, "Uống 300–500 ml nước. Đói thì ăn 1 quả chuối. Khởi động 8 phút trước khi vào bài.", "./#train-today");
  }
  // 3. Water checkpoints every 3 hours
  if (prefs.water) {
    for (const [i, h] of [3, 6, 9, 12].entries()) {
      const cp = wake + h * 60;
      if (cp > bed - 60 || !at(cp)) continue;
      const expected = Math.floor((cupsGoal * (cp - wake)) / (bed - wake));
      const cups = +log.water || 0;
      if (cups < expected - 1) add(`water${i}`, "Uống nước nào 💧", `Bạn mới uống ${cups}/${cupsGoal} cốc. Uống thêm 1 cốc 250 ml rồi chạm vào ly trên web nhé.`);
    }
  }
  // 4. Meals: nothing logged by mid-day; protein check in the evening
  if (prefs.meals) {
    const anything = Object.values(log.meals || {}).some((a) => a?.length);
    if (!anything && at(wake + 6 * 60)) add("meals0", "Bạn chưa ghi bữa ăn nào hôm nay", "Chụp ảnh hoặc nói món ăn, PT sẽ tính calo và chấm điểm cho bạn 📷", "./#food-log");
    const miss = Math.round(tg.protein - eaten.p);
    if (anything && miss > 20 && at(bed - 180)) add("meals1", `Còn thiếu khoảng ${miss}g đạm hôm nay`, miss >= 40 ? "Gợi ý: 150g ức gà luộc (~46g) hoặc 1 ly whey + 1 hũ sữa chua Hy Lạp." : "Gợi ý: 1 hũ sữa chua Hy Lạp (~15g) hoặc 2 quả trứng (~12g).", "./#food-log");
  }
  // 5. Planned gym session not done by the evening
  if (prefs.missed && session && !w?.completed && t >= train + 150 && at(Math.max(train + 150, bed - 240), 90)) {
    const any = Object.values(w?.sets || {}).some((a) => a.some((s) => s.done));
    if (!any) add("missed", `Bạn chưa tập ${session.name} hôm nay`, "Chỉ 20 phút cũng tốt hơn bỏ buổi. Hoặc dời sang mai trong lịch tập.", "./#train-today");
  }
  return out;
}

// ---------------------------------------------------------------- self test (no Firebase)
if (process.argv.includes("--selftest")) {
  const profile = { sex: "male", age: 24, height: 170, weight: 68, goal: "recomp", level: 0, place: "g", gymDays: [1, 3, 5], gymMinutes: 60, trainTime: "20:00", sports: [{ type: "tennis", days: [2, 6], minutes: 60 }], wakeTime: "07:00", bedTime: "23:30", job: "sit", steps: "s2", meals: 3, programStart: "2026-11-02" };
  // Wednesday 2026-11-04 (gym day) in Vietnam = UTC+7
  const vn = (h, m = 0) => new Date(Date.UTC(2026, 10, 4, h - 7, m));
  const workouts = { "2026-11-02": { sessionKey: "FA", completed: true, sets: {} } };
  const prog = buildProgram(profile, assess(profile));
  const sess = prog.sessions[planFor(prog, "2026-11-04").find((i) => i.kind === "gym").key];
  workouts["2026-10-28"] = { sets: { [sess.exercises[0].id]: [{ kg: "20", reps: "12", done: true }, { kg: "20", reps: "12", done: true }] } };
  const user = { profile, push: { tz: "Asia/Ho_Chi_Minh" }, food: { "2026-11-04": { meals: {}, water: 1 } }, workouts };
  for (const [h, m] of [[3, 0], [7, 30], [10, 0], [13, 0], [16, 0], [19, 30], [20, 0], [22, 30], [23, 45]]) {
    const r = dueReminders(user, vn(h, m));
    console.log(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, r.length ? r.map((x) => `[${x.key}] ${x.title} — ${x.body}`).join("\n       ") : "(không nhắc)");
  }
  process.exit(0);
}

// ---------------------------------------------------------------- real run
const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!sa) {
  console.log("Chưa có secret FIREBASE_SERVICE_ACCOUNT – bỏ qua (chưa bật nhắc nhở).");
  process.exit(0);
}
const { initializeApp, cert } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");
const { getMessaging } = await import("firebase-admin/messaging");
initializeApp({ credential: cert(JSON.parse(sa)) });
const db = getFirestore();
const messaging = getMessaging();

const users = await db.collection("users").get();
let sentCount = 0, checked = 0;
for (const u of users.docs) {
  const pushRef = u.ref.collection("meta").doc("push");
  const sentRef = u.ref.collection("meta").doc("pushSent"); // kept apart: the website rewrites meta/push
  const push = (await pushRef.get()).data();
  if (!push?.tokens?.length) continue;
  push.sent = (await sentRef.get()).data()?.sent || {};
  checked++;
  const profile = u.data().profile;
  const { date } = localNow(push.tz);
  const from = new Date(Date.parse(date) - 35 * 864e5).toISOString().slice(0, 10);
  const [food, workouts] = await Promise.all([
    u.ref.collection("food").doc(date).get(),
    u.ref.collection("workouts").where("__name__", ">=", u.ref.collection("workouts").doc(from)).get(),
  ]);
  const wk = {};
  workouts.forEach((d) => (wk[d.id] = d.data()));
  const due = dueReminders({ profile, push, food: { [date]: food.data() }, workouts: wk });
  if (!due.length) continue;
  const sentToday = { ...(push.sent?.[date] || {}) };
  let tokens = push.tokens;
  for (const r of due) {
    const res = await messaging.sendEachForMulticast({
      tokens,
      data: { title: r.title, body: r.body, url: r.url, tag: `${r.key}-${date}` },
      webpush: { headers: { Urgency: "high", TTL: "5400" } },
    });
    const dead = res.responses.map((x, i) => (!x.success && /not-registered|invalid-registration|invalid-argument/.test(x.error?.code || "") ? tokens[i] : null)).filter(Boolean);
    if (dead.length) tokens = tokens.filter((t) => !dead.includes(t));
    sentToday[r.key] = true;
    sentCount += res.successCount;
    console.log(u.id.slice(0, 6), r.key, `ok ${res.successCount}/${res.responses.length}`);
  }
  await sentRef.set({ sent: { [date]: sentToday } }); // only today is kept
  if (tokens.length !== push.tokens.length) await pushRef.set({ tokens }, { merge: true });
}
console.log(`Đã kiểm tra ${checked} người bật nhắc nhở, gửi ${sentCount} thông báo.`);
