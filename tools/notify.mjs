// DNT & HARVE FITNESS – reminder "postman".
// Runs every 30 minutes on GitHub Actions (.github/workflows/notify.yml). For every user who turned
// reminders on (users/{uid}/meta/push), works out what is due in their local time (src/reminders.js,
// the same schedule the website shows) and sends it with Firebase Cloud Messaging.
//
// Needs the secret FIREBASE_SERVICE_ACCOUNT (the service-account JSON from Firebase).
// Test without Firebase:   node tools/notify.mjs --selftest
// Send one test message:   node tools/notify.mjs --test   (phones that turned reminders on in the last 48 h)
import crypto from "node:crypto";

// The website's modules expect a browser; give them the few globals they touch.
globalThis.addEventListener ??= () => {};
globalThis.window ??= { APP_CONFIG: {} };

const { dueReminders, dayPlan, localNow } = await import("../src/reminders.js");
const { buildProgram, planFor } = await import("../src/program.js");
const { assess } = await import("../src/calc.js");
const { addDays, hmStr } = await import("../src/ui.js");

// ---------------------------------------------------------------- self test (no Firebase)
if (process.argv.includes("--selftest")) {
  const profile = { name: "Tâm", sex: "male", age: 24, height: 170, weight: 68, goal: "recomp", level: 0, place: "g", gymDays: [1, 3, 5], gymMinutes: 60, trainTime: "20:00", sports: [{ type: "tennis", days: [2, 6], minutes: 60 }], wakeTime: "07:00", bedTime: "23:30", job: "sit", steps: "s2", meals: 3, supps: ["creatine"], programStart: "2026-11-02" };
  // Wednesday 2026-11-04 (gym day) in Vietnam = UTC+7
  const vn = (h, m = 0, day = 4) => new Date(Date.UTC(2026, 10, day, h - 7, m));
  const workouts = { "2026-11-02": { sessionKey: "FA", completed: true, sets: {} } };
  const prog = buildProgram(profile, assess(profile));
  const sess = prog.sessions[planFor(prog, "2026-11-04").find((i) => i.kind === "gym").key];
  workouts["2026-10-28"] = { sets: { [sess.exercises[0].id]: [{ kg: "20", reps: "12", done: true }, { kg: "20", reps: "12", done: true }] } };
  const push = { tz: "Asia/Ho_Chi_Minh", prefs: { sleep: true, weigh: true, weighDay: 3, trainLead: 45 }, custom: [{ id: "a1", title: "Uống creatine 5g", time: "07:45", repeat: "daily" }, { id: "a2", title: "Gọi mẹ", time: "00:10", repeat: "days", days: [4] }], sent: {} };
  const user = { profile, push, food: { "2026-11-04": { meals: {}, water: 1 } }, workouts };
  console.log("Lịch hôm nay:", dayPlan(user, "2026-11-04").items.map((i) => `${hmStr(i.min)} ${i.key}`).join(" · "));
  const times = [[3, 0], [7, 10], [7, 50], [10, 0], [13, 0], [16, 0], [19, 15], [19, 45], [22, 30], [23, 10], [23, 45], [24, 20]];
  for (const [h, m] of times) {
    const at = h >= 24 ? vn(h - 24, m, 5) : vn(h, m);
    const r = dueReminders(user, at);
    for (const x of r) (push.sent[x.date] ||= {})[x.key] = true; // like the real run
    console.log(`${String(h % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`, r.length ? r.map((x) => `[${x.key}] ${x.title} — ${x.body}`).join("\n       ") : "(không nhắc)");
  }
  process.exit(0);
}

// ---------------------------------------------------------------- real run
const TEST = process.argv.includes("--test");
const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.log("Chưa có secret FIREBASE_SERVICE_ACCOUNT – bỏ qua (chưa bật nhắc nhở).");
  process.exit(TEST ? 1 : 0);
}
const sa = JSON.parse(raw);

// Google access token signed with the service-account key (no extra library needed).
let cached = null;
async function accessToken() {
  if (cached && cached.exp > Date.now() + 60e3) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const sig = crypto.sign("RSA-SHA256", Buffer.from(unsigned), sa.private_key).toString("base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Không lấy được quyền gửi: ${j.error} ${j.error_description || ""}`);
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

/** Send to every token; returns { ok, dead[] } (dead = phones that removed the app / turned it off). */
async function send(tokens, data) {
  let ok = 0;
  const dead = [];
  for (const token of tokens) {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
      body: JSON.stringify({ message: { token, data, webpush: { headers: { Urgency: "high", TTL: "5400" } } } }),
    });
    if (r.ok) {
      ok++;
      continue;
    }
    const e = await r.json().catch(() => ({}));
    const code = e.error?.details?.find((d) => d.errorCode)?.errorCode || e.error?.status || r.status;
    console.log("  lỗi gửi:", code, e.error?.message || "");
    if (["UNREGISTERED", "NOT_FOUND"].includes(code) || (code === "INVALID_ARGUMENT" && /token/i.test(e.error?.message || ""))) dead.push(token);
  }
  return { ok, dead };
}

const { initializeApp, cert } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const users = await db.collection("users").get();
let sentCount = 0;
let checked = 0;
for (const u of users.docs) {
  const pushRef = u.ref.collection("meta").doc("push");
  const sentRef = u.ref.collection("meta").doc("pushSent"); // kept apart: the website rewrites meta/push
  const push = (await pushRef.get()).data();
  if (!push?.tokens?.length) continue;
  checked++;
  const profile = u.data().profile;

  if (TEST) {
    if (Date.now() - (push.updatedAt || 0) > 48 * 3600e3) continue;
    const r = await send(push.tokens, { title: "DNT & HARVE FITNESS 💪", body: `Chào ${profile?.name || "bạn"}! Nhắc nhở đã chạy. Từ giờ PT sẽ nhắc bạn giờ tập, uống nước và ghi bữa ăn.`, url: "./#home", tag: "test" });
    sentCount += r.ok;
    console.log(u.id.slice(0, 6), "test", `ok ${r.ok}/${push.tokens.length}`);
    continue;
  }

  push.sent = (await sentRef.get()).data()?.sent || {};
  const { date } = localNow(push.tz);
  const yesterday = addDays(date, -1);
  const from = addDays(date, -35);
  const [f0, f1, workouts] = await Promise.all([
    u.ref.collection("food").doc(date).get(),
    u.ref.collection("food").doc(yesterday).get(),
    u.ref.collection("workouts").where("__name__", ">=", u.ref.collection("workouts").doc(from)).get(),
  ]);
  const wk = {};
  workouts.forEach((d) => (wk[d.id] = d.data()));
  const due = dueReminders({ profile, push, food: { [date]: f0.data(), [yesterday]: f1.data() }, workouts: wk });
  if (!due.length) continue;
  let tokens = push.tokens;
  const sent = Object.fromEntries(Object.entries(push.sent).filter(([d]) => d >= yesterday)); // keep 2 days
  for (const r of due) {
    const res = await send(tokens, { title: r.title, body: r.body, url: r.url, tag: `${r.key}-${r.date}` });
    if (res.dead.length) tokens = tokens.filter((t) => !res.dead.includes(t));
    (sent[r.date] ||= {})[r.key] = true;
    sentCount += res.ok;
    console.log(u.id.slice(0, 6), r.key, `ok ${res.ok}/${push.tokens.length}`);
    if (!tokens.length) break;
  }
  await sentRef.set({ sent });
  if (tokens.length !== push.tokens.length) await pushRef.set({ tokens }, { merge: true });
}
console.log(`Đã kiểm tra ${checked} người bật nhắc nhở, gửi ${sentCount} thông báo.`);
if (TEST && !sentCount) process.exit(1); // make a failed test visible as a red run
