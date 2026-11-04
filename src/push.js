// Push reminders (Firebase Cloud Messaging web push) + the person's own reminder settings.
// The phone registers here; the "postman" (tools/notify.mjs on GitHub Actions, every 30 min)
// reads users/{uid}/meta/push and sends what src/reminders.js says is due.
import { A } from "./state.js";
import * as S from "./store.js";
import { esc, openSheet, closeSheet, toast, hmStr, today, DOW, WEEK_ORDER } from "./ui.js";
import { KINDS, settingsOf, dayPlan, suggestions, REPEAT, repeatText } from "./reminders.js";

const cfg = window.APP_CONFIG || {};
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
export const pushConfigured = () => (!S.DEMO || cfg.push?.preview === true) && !!cfg.push?.vapidKey; // preview: local UI tests only
export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const MAX_CUSTOM = 20;

let state = null; // { tokens:[], prefs:{}, custom:[], tz }
async function load() {
  if (state) return state;
  state = (await S.get("meta", "push").catch(() => null)) || {};
  state.tokens ||= [];
  state.custom ||= [];
  state.prefs = settingsOf(state);
  delete state.sent;
  return state;
}
export async function pushEnabled() {
  if (!pushConfigured() || !pushSupported() || Notification.permission !== "granted") return false;
  return !!(await load()).tokens?.length;
}

async function getFcmToken() {
  const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
  if (!(await isSupported())) throw Object.assign(new Error("unsupported"), { code: "unsupported" });
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("sw.js"));
  await navigator.serviceWorker.ready;
  return getToken(getMessaging(S.firebaseApp()), { vapidKey: cfg.push.vapidKey, serviceWorkerRegistration: reg });
}

async function save() {
  state.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh";
  state.updatedAt = Date.now();
  await S.set("meta", "push", state);
}
const saveQuiet = () => save().catch(() => toast("Không lưu được, kiểm tra mạng.", "bad"));

/** Ask permission, register this phone, store the token. Must run from a tap. */
export async function enablePush() {
  if (isIOS() && !standalone()) throw Object.assign(new Error("ios-home"), { code: "ios-home" });
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw Object.assign(new Error("denied"), { code: "denied" });
  const token = await getFcmToken();
  await load();
  state.tokens = [...new Set([token, ...(state.tokens || [])])].slice(0, 5); // up to 5 devices
  await save();
  return true;
}
/** Refresh the token silently on start-up (tokens can rotate). */
export async function refreshPush() {
  try {
    if (!(await pushEnabled())) return;
    const token = await getFcmToken();
    if (!state.tokens.includes(token)) {
      state.tokens = [token, ...state.tokens].slice(0, 5);
      await save();
    }
  } catch {}
}

const errText = (e) =>
  ({
    "ios-home": "Trên iPhone, hãy thêm web ra màn hình chính trước (Safari → Chia sẻ → Thêm vào MH chính), rồi mở web từ biểu tượng đó và bật lại.",
    denied: "Bạn đã chặn thông báo. Vào Cài đặt → Thông báo → DNT&HARVE (hoặc cài đặt trình duyệt) để cho phép, rồi thử lại.",
    unsupported: "Trình duyệt này chưa hỗ trợ thông báo. Trên iPhone cần iOS 16.4 trở lên và mở từ màn hình chính.",
  })[e?.code] || "Chưa bật được nhắc nhở: " + (e?.message || e);

const userData = () => ({ profile: A.profile, prog: A.prog, push: state, food: A.food, workouts: A.workouts });
const timeOf = (i) => hmStr(i.min);

/** Short text for when a built-in reminder fires today (or what it depends on). */
function kindWhen(k, plan) {
  const its = plan.items.filter((i) => i.kind === k);
  if (k === "water") return its.length ? `${its.length} mốc: ${its.map(timeOf).join(", ")} · nếu uống chưa đủ` : "";
  if (its.length) return `Hôm nay ${its.map(timeOf).join(", ")}${its[0].when ? " · " + its[0].when : ""}`;
  if (k === "coach" || k === "train" || k === "missed") return "Hôm nay nghỉ, không nhắc";
  if (k === "weigh") return `Mỗi ${DOW[state.prefs.weighDay]}, sau khi thức dậy 10 phút`;
  return "";
}

/** Settings sheet: enable, built-in reminders that follow the program, own reminders, ideas. */
export async function openPushSettings(after) {
  if (!pushConfigured()) return toast("Nhắc nhở chưa được cài đặt trên website.", "bad");
  await load();
  const on = await pushEnabled();
  const pr = state.prefs;
  const plan = dayPlan(userData(), today());
  const p = A.profile || {};
  const ideas = suggestions(p, A.prog).filter((s) => !state.custom.some((c) => c.sid === s.sid || c.title === s.title));
  const optSel = (k, o) =>
    `<select class="push-opt" data-opt="${o.key}" aria-label="${esc(o.label)}">${o.values
      .map((v) => `<option value="${v}" ${+pr[o.key] === v ? "selected" : ""}>${esc(o.label)} ${o.names ? o.names[v] : v + " " + o.unit}</option>`)
      .join("")}</select>`;
  const body = openSheet(`<span class="eyebrow">Thông báo trên điện thoại</span>
    <h2>Nhắc <em>nhở.</em></h2>
    ${isIOS() && !standalone() ? `<div class="note">iPhone chỉ nhận thông báo khi bạn <b>thêm web ra màn hình chính</b> (Safari → nút Chia sẻ → <b>Thêm vào MH chính</b>) và mở web từ biểu tượng đó.</div>` : ""}
    ${on ? `<p class="muted">Điện thoại này đang nhận nhắc nhở. Giờ nhắc tính theo giờ dậy <b>${esc(p.wakeTime || "")}</b>, giờ tập <b>${esc(p.trainTime || "")}</b>, giờ ngủ <b>${esc(p.bedTime || "")}</b> và lộ trình của bạn. <a href="#setup" data-close>Sửa giờ trong hồ sơ</a>.</p>` : `<p class="muted">Nhận nhắc giờ tập, uống nước, ghi bữa ăn ngay trên màn hình khóa. Không nhắc trong giờ ngủ.</p><button class="primary block" id="push-on">Bật nhắc nhở</button>`}

    <h3 class="push-h">Theo lộ trình của bạn</h3>
    <div class="push-list">${Object.entries(KINDS)
      .map(([k, v]) => {
        const w = kindWhen(k, plan);
        return `<div class="push-row"><label class="push-main" for="pk-${k}"><b>${esc(v.t)}</b><small>${esc(v.d)}</small>${w ? `<small class="push-when">${esc(w)}</small>` : ""}</label>
          <input type="checkbox" id="pk-${k}" data-pk="${k}" ${pr[k] ? "checked" : ""}>
          ${v.opt && pr[k] ? `<div class="push-sub">${optSel(k, v.opt)}</div>` : ""}</div>`;
      })
      .join("")}</div>

    <h3 class="push-h">Nhắc nhở riêng của bạn</h3>
    ${state.custom.length
      ? `<div class="push-list">${state.custom
          .map((c) => `<div class="push-row"><button class="push-main push-edit" data-edit="${esc(c.id)}"><b>${esc(c.title)}</b><small><span class="num">${esc(c.time)}</span> · ${esc(repeatText(c))}${c.body ? " · " + esc(c.body) : ""}</small><small class="push-when">Chạm để sửa</small></button><input type="checkbox" data-cid="${esc(c.id)}" ${c.on !== false ? "checked" : ""} aria-label="Bật / tắt"></div>`)
          .join("")}</div>`
      : `<p class="muted small">Chưa có. Tự thêm nhắc nhở của riêng bạn (uống thuốc, giãn cơ, chuẩn bị đồ tập…), hoặc chọn gợi ý bên dưới.</p>`}
    <button class="ghost block" id="push-add">+ Thêm nhắc nhở</button>

    ${ideas.length ? `<h3 class="push-h">Gợi ý cho bạn</h3><p class="muted small">Dựa trên mục tiêu, môn thể thao, thực phẩm bổ sung và thói quen trong hồ sơ. Chạm để thêm, chỉnh giờ trước khi lưu.</p>
    <div class="chips wrap push-ideas">${ideas.map((s, i) => `<button class="chip" data-idea="${i}">${esc(s.title)} · ${esc(s.time)}</button>`).join("")}</div>` : ""}

    ${plan.items.length ? `<h3 class="push-h">Hôm nay sẽ nhắc</h3><ol class="push-today">${plan.items
      .map((i) => `<li><span class="num">${timeOf(i)}</span><span>${esc(i.title)}${i.when ? `<small> · ${esc(i.when)}</small>` : ""}</span></li>`)
      .join("")}</ol><p class="muted small">Máy chủ kiểm tra 30 phút 1 lần, nên nhắc có thể đến trễ vài phút đến 30 phút.</p>` : ""}
    ${on ? `<button class="ghost block" id="push-test">Gửi thử 1 thông báo</button>` : ""}`);

  const reopen = () => openPushSettings(after);
  body.addEventListener("change", async (e) => {
    const k = e.target.dataset.pk;
    const opt = e.target.dataset.opt;
    const cid = e.target.dataset.cid;
    if (k) {
      pr[k] = e.target.checked;
      await saveQuiet();
      if (KINDS[k].opt) reopen();
    } else if (opt) {
      pr[opt] = +e.target.value;
      await saveQuiet();
      reopen();
    } else if (cid) {
      const c = state.custom.find((x) => x.id === cid);
      if (c) c.on = e.target.checked;
      await saveQuiet();
    }
    after?.();
  });
  body.addEventListener("click", (e) => {
    const ed = e.target.closest("[data-edit]");
    if (ed) return editCustom(state.custom.find((c) => c.id === ed.dataset.edit), reopen, after);
    const idea = e.target.closest("[data-idea]");
    if (idea) return editCustom({ ...ideas[+idea.dataset.idea], id: null }, reopen, after);
  });
  body.querySelector("#push-add").onclick = () => {
    if (state.custom.length >= MAX_CUSTOM) return toast(`Tối đa ${MAX_CUSTOM} nhắc nhở riêng.`, "bad");
    editCustom({ title: "", body: "", time: hmStr(new Date().getHours() * 60 + 60), repeat: "daily", days: [] }, reopen, after);
  };
  body.querySelector("#push-on")?.addEventListener("click", async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    b.textContent = "Đang bật…";
    try {
      await enablePush();
      toast("Đã bật nhắc nhở trên điện thoại này.", "good");
      after?.();
      reopen();
    } catch (err) {
      b.disabled = false;
      b.textContent = "Bật nhắc nhở";
      toast(errText(err), "bad");
    }
  });
  body.querySelector("#push-test")?.addEventListener("click", async () => {
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification("DNT & HARVE FITNESS", { body: `Chào ${A.profile?.name || "bạn"}! Nhắc nhở đang hoạt động 💪`, icon: "icon-192.png", badge: "icon-192.png", data: { url: "./#home" } });
  });
}

/** Add / edit one of the person's own reminders. */
function editCustom(c, back, after) {
  const isNew = !c.id;
  const d = { title: "", body: "", time: "08:00", repeat: "daily", days: [], ...c };
  const body = openSheet(`<span class="eyebrow">Nhắc nhở riêng</span>
    <h2>${isNew ? "Thêm" : "Sửa"} <em>nhắc nhở.</em></h2>
    <form id="cf" class="stack">
      <label class="fld"><span>Nội dung nhắc</span><input id="cf-title" maxlength="60" required placeholder="Ví dụ: Uống vitamin D" value="${esc(d.title)}"></label>
      <label class="fld"><span>Ghi chú <small>(không bắt buộc)</small></span><input id="cf-body" maxlength="140" placeholder="Ví dụ: 1 viên sau bữa sáng" value="${esc(d.body)}"></label>
      <div class="grid2">
        <label class="fld"><span>Giờ</span><input id="cf-time" type="time" required value="${esc(d.time)}"></label>
        <label class="fld"><span>Lặp lại</span><select id="cf-rep">${Object.entries(REPEAT)
          .map(([k, v]) => `<option value="${k}" ${d.repeat === k ? "selected" : ""}>${v}</option>`)
          .join("")}</select></label>
      </div>
      <div class="chips wrap" id="cf-days" ${d.repeat === "days" ? "" : "hidden"}>${WEEK_ORDER.map((x) => `<button type="button" class="chip" data-day="${x}" aria-pressed="${d.days.includes(x)}">${DOW[x]}</button>`).join("")}</div>
      <p class="muted small" id="cf-hint"></p>
      <button class="primary block" type="submit">Lưu</button>
      ${isNew ? "" : `<button class="ghost block danger" type="button" id="cf-del">Xóa nhắc nhở này</button>`}
      <button class="ghost block" type="button" id="cf-back">Quay lại</button>
    </form>`);
  const rep = body.querySelector("#cf-rep");
  const hint = () => {
    const r = rep.value;
    body.querySelector("#cf-days").hidden = r !== "days";
    const gym = (A.profile?.gymDays || []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((x) => DOW[x]).join(", ");
    body.querySelector("#cf-hint").textContent = r === "gym" ? `Theo lịch tập của bạn: ${gym || "chưa chọn ngày tập"}.` : r === "train" ? "Những ngày có tập gym hoặc chơi thể thao trong lộ trình." : r === "rest" ? "Những ngày không tập gym, không chơi thể thao." : "";
  };
  hint();
  rep.onchange = hint;
  body.querySelector("#cf-days").onclick = (e) => {
    const b = e.target.closest("[data-day]");
    if (b) b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true");
  };
  body.querySelector("#cf-back").onclick = back;
  body.querySelector("#cf-del")?.addEventListener("click", async () => {
    state.custom = state.custom.filter((x) => x.id !== d.id);
    await saveQuiet();
    toast("Đã xóa nhắc nhở.");
    after?.();
    back();
  });
  body.querySelector("#cf").onsubmit = async (e) => {
    e.preventDefault();
    const days = [...body.querySelectorAll("[data-day][aria-pressed=true]")].map((b) => +b.dataset.day);
    const v = {
      id: d.id || Math.random().toString(36).slice(2, 9),
      title: body.querySelector("#cf-title").value.trim(),
      body: body.querySelector("#cf-body").value.trim(),
      time: body.querySelector("#cf-time").value,
      repeat: rep.value,
      days: rep.value === "days" ? days : [],
      on: d.on !== false,
      ...(d.sid ? { sid: d.sid } : {}),
    };
    if (!v.title || !v.time) return toast("Điền nội dung và giờ nhắc.", "bad");
    if (v.repeat === "days" && !days.length) return toast("Chọn ít nhất 1 thứ trong tuần.", "bad");
    const i = state.custom.findIndex((x) => x.id === v.id);
    if (i >= 0) state.custom[i] = v;
    else state.custom.push(v);
    await saveQuiet();
    toast(isNew ? "Đã thêm nhắc nhở." : "Đã lưu.", "good");
    after?.();
    back();
  };
}

/** Home card: a nudge to turn reminders on, or the next reminders of today. */
export async function pushCard() {
  if (!pushConfigured() || !pushSupported()) return "";
  if (!(await pushEnabled()))
    return `<section class="card push-card"><div><span class="eyebrow">Nhắc nhở</span><p>Nhận nhắc giờ tập, uống nước, ghi bữa ăn trên màn hình khóa.</p></div><button class="primary sm" data-act="push-open">Bật</button></section>`;
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const plan = dayPlan(userData(), today());
  const wakeShift = (m) => (m < plan.wake && m + 1440 <= plan.bed ? m + 1440 : m);
  const next = plan.items.filter((i) => i.min >= wakeShift(now) && i.ok).slice(0, 3);
  return `<section class="card push-card on"><div class="row between"><span class="eyebrow">Nhắc nhở hôm nay</span><button class="ghost sm" data-act="push-open">Chỉnh</button></div>
    ${next.length ? `<ul class="push-next">${next.map((i) => `<li><span class="num">${timeOf(i)}</span><span>${esc(i.title)}</span></li>`).join("")}</ul>` : `<p>Hết nhắc nhở cho hôm nay. Ngủ ngon 😴</p>`}</section>`;
}
