// App shell: sign-in, routing, home dashboard and the AI coach chat.
import * as S from "./store.js";
import { A, recompute, loadRecent, aiContext, isTrainingDay, waterGoalCups, saveLater } from "./state.js";
import { startSetup, renderSetup } from "./v-setup.js";
import { renderTrain, dayStatus, setTrainDate } from "./v-train.js";
import { renderFood, snapBar, quickSnap } from "./v-food.js";
import { renderBody } from "./v-body.js";
import { SPORTS, GOALS } from "./calc.js";
import { planFor, phaseOf } from "./program.js";
import { totals, mealPlan, itemView } from "./food.js";
import * as AI from "./ai.js";
import { esc, fmt, today, addDays, niceDate, mondayOf, DOW, WEEK_ORDER, hm, $, toast, md, bar, closeSheet } from "./ui.js";

const app = document.getElementById("app");
const NAV = [
  ["home", "Hôm nay", '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'],
  ["train", "Tập luyện", '<path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"/>'],
  ["food", "Ăn uống", '<path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8M7 7h4M17 3c-2 2-2 6 0 8v10"/>'],
  ["body", "Cơ thể", '<circle cx="12" cy="5" r="2.5"/><path d="M5 9h14M12 9v6M12 15l-4 6M12 15l4 6"/>'],
  ["chat", "Hỏi PT", '<path d="M4 5h16v11H9l-5 4z"/>'],
];

function shell() {
  app.innerHTML = `<header class="top">
      <a class="brand" href="#home" aria-label="Trang chủ"><span class="logo">DNT<i>&amp;</i>HARVE</span><small>FITNESS</small></a>
      <div class="row gap">
        <span id="sync" class="sync" data-s="saved" title="Đã lưu"></span>
        <button class="avatar" id="me" aria-label="Tài khoản">${A.user?.photoURL ? `<img src="${esc(A.user.photoURL)}" alt="" referrerpolicy="no-referrer">` : esc((A.profile?.name || A.user?.displayName || "?").slice(0, 1).toUpperCase())}</button>
      </div>
    </header>
    ${S.DEMO ? `<div class="demo-bar">Chế độ thử: dữ liệu chỉ lưu trên máy này, chưa có AI. Điền Firebase vào config.js để chạy thật.</div>` : ""}
    <main id="view"></main>
    <nav class="bottom" aria-label="Điều hướng">${NAV.map(([k, l, icon]) => `<a href="#${k}" data-nav="${k}"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span>${l}</span></a>`).join("")}</nav>`;
  $("#me").onclick = () => {
    const menu = document.createElement("div");
    menu.className = "menu";
    menu.innerHTML = `<p><b>${esc(A.user?.displayName || A.profile?.name || "")}</b><br><small class="muted">${esc(A.user?.email || "")}</small></p>
      <a href="#setup">Sửa hồ sơ & thói quen</a><a href="#body">Đánh giá cơ thể</a><button id="logout">Đăng xuất</button>`;
    document.body.appendChild(menu);
    const close = (e) => {
      if (!menu.contains(e.target) || e.target.closest("a")) {
        menu.remove();
        removeEventListener("click", close, true);
      }
    };
    setTimeout(() => addEventListener("click", close, true));
    $("#logout", menu).onclick = () => S.signOut();
  };
}

const TICKER = ["Sức mạnh", "Thể lực", "Dẻo dai", "Dinh dưỡng", "Phục hồi", "Kỷ luật"].map((t) => `<span>${t}</span>`).join("");

// ---------------------------------------------------------------- Login
function renderLogin(reason) {
  app.innerHTML = `<div class="login">
    <div class="login-top"><span class="brand"><span class="logo">DNT<i>&amp;</i>HARVE</span><small>FITNESS</small></span></div>
    <div class="login-hero">
      <span class="eyebrow">PT cá nhân online</span>
      <h1>Tập chăm.<br>Ăn đúng.<br>Hồi phục.<br><em>Lặp lại.</em></h1>
      <p>Đánh giá cơ thể theo chuẩn quốc tế, lộ trình tập và thực đơn riêng cho bạn, có PT AI kèm mỗi ngày.</p>
      <div class="login-stats">
        <div><b>870+</b><small>Bài tập</small></div>
        <div><b>12 tuần</b><small>Lộ trình</small></div>
        <div><b>24/7</b><small>PT AI</small></div>
      </div>
    </div>
    ${reason === "not_allowed" ? `<p class="err">Tài khoản Google này chưa được mời. Nhờ chủ website thêm email của bạn.</p>` : ""}
    <button class="google" id="signin"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>${S.DEMO ? "Vào chế độ thử" : "Đăng nhập bằng Google"}</button>
    <div class="ticker" aria-hidden="true"><div>${TICKER}${TICKER}</div></div>
    <div class="lanes">
      <div class="lane"><span class="ic"><svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg></span><h3>Đánh giá chuẩn quốc tế</h3><p>BMI châu Á, % mỡ U.S. Navy, eo/mông WHO, năng lượng Mifflin–St Jeor, đạm theo ISSN.</p></div>
      <div class="lane lime"><span class="ic"><svg viewBox="0 0 24 24"><path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"/></svg></span><h3>Lộ trình riêng 12 tuần</h3><p>Theo lịch của bạn, tính cả tennis, chạy bộ, bơi. Thư viện 870+ bài có ảnh động.</p></div>
      <div class="lane"><span class="ic"><svg viewBox="0 0 24 24"><path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8M7 7h4M17 3c-2 2-2 6 0 8v10"/></svg></span><h3>Thực đơn & PT AI</h3><p>Thực đơn món Việt mỗi ngày, nhật ký ăn có chấm điểm, hỏi PT AI bất cứ lúc nào.</p></div>
    </div>
    <p class="muted sm">Dữ liệu mỗi người lưu riêng, chỉ chính bạn xem được. Nội dung mang tính tham khảo, không thay thế tư vấn của bác sĩ.</p>
  </div>`;
  $("#signin").onclick = async () => {
    try {
      await S.signIn();
    } catch (e) {
      console.error(e);
      toast(e.code === "auth/unauthorized-domain" ? "Tên miền chưa được thêm vào Firebase Authentication (xem HUONG-DAN.md)." : "Không đăng nhập được: " + (e.code || e.message), "bad");
    }
  };
}

// ---------------------------------------------------------------- Home
function renderHome(root) {
  const p = A.profile, d = today();
  const items = planFor(A.prog, d);
  const ph = phaseOf(p.programStart);
  const log = A.food[d];
  const eaten = totals(Object.values(log?.meals || {}).flat());
  const training = isTrainingDay(d);
  const kcalT = training ? A.t.kcal : A.t.restKcal;
  const pct = Math.min(1, eaten.kcal / kcalT);
  const C = 2 * Math.PI * 42;
  const plan = mealPlan(p, A.t, { date: d, training, trainTime: p.trainTime });
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const next = plan.meals.find((m) => hm(m.time) >= now - 30) || plan.meals[0];
  const mon = mondayOf(d);
  const lastW = Object.entries(A.body).filter(([, v]) => v.weight).sort().at(-1);
  const firstW = Object.entries(A.body).filter(([, v]) => v.weight).sort()[0];
  const hour = new Date().getHours();
  const hi = hour < 11 ? "Chào buổi sáng" : hour < 14 ? "Chào buổi trưa" : hour < 18 ? "Chào buổi chiều" : "Chào buổi tối";
  root.innerHTML = `<section class="greet">
      <span class="eyebrow">${niceDate(d)} · Tuần ${ph.week}/12 · ${esc(ph.name)}</span>
      <h1>${hi},<br><em>${esc((p.name || "bạn").trim().split(/\s+/).pop())}.</em></h1>
    </section>
    <div class="ticker" aria-hidden="true"><div>${TICKER}${TICKER}</div></div>
    <section class="card today-card">
      <span class="eyebrow">Hôm nay</span>
      ${items
        .map((it) =>
          it.kind === "gym"
            ? `<div class="today-item"><div><h3>${esc(it.name)}</h3><small class="muted">${A.prog.sessions[it.key].exercises.length} bài · ${p.gymMinutes} phút${p.trainTime ? " · " + p.trainTime : ""}</small></div><a class="primary sm" href="#train-today" data-today>Bắt đầu</a></div>`
            : it.kind === "sport"
            ? `<div class="today-item"><div><h3>${esc(it.name)}</h3><small class="muted">${it.minutes} phút · uống đủ nước, mang điện giải</small></div><span class="pill">Thể thao</span></div>`
            : `<div class="today-item"><div><h3>Ngày nghỉ</h3><small class="muted">Đi bộ nhẹ, giãn cơ, ngủ đủ giấc</small></div></div>`
        )
        .join("")}
    </section>
    ${snapBar()}
    <section class="card eat">
      <div class="ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" class="ring-bg"/><circle cx="50" cy="50" r="42" class="ring-fg" stroke-dasharray="${(pct * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 50 50)"/></svg>
        <div><b class="num">${fmt(eaten.kcal)}</b><small>/ ${fmt(kcalT)} kcal</small></div></div>
      <div class="eat-r">
        <div class="mbar"><div class="row between"><span>Đạm</span><span class="num">${fmt(eaten.p)}/${A.t.protein}g</span></div>${bar((eaten.p / A.t.protein) * 100)}</div>
        <div class="mbar"><div class="row between"><span>Nước</span><span class="num">${log?.water || 0}/${waterGoalCups(d)} cốc</span></div>${bar(((log?.water || 0) / waterGoalCups(d)) * 100, "chrome")}</div>
        <div class="row gap"><a class="ghost sm" href="#food-log">Nhật ký</a><button class="ghost sm" data-act="cup">+1 cốc nước</button></div>
      </div>
    </section>
    ${next ? `<section class="card"><div class="row between"><span class="eyebrow">Bữa tiếp theo · ${next.time}</span><a class="link" href="#food-plan">Cả ngày</a></div>
      <h3>${esc(next.label)}</h3><p class="muted">${next.items.filter((it) => it.id !== "creatine").map((it) => esc(foodName(it))).join(" · ")}</p></section>` : ""}
    <section class="card"><span class="eyebrow">Tuần này</span>
      <div class="week mini">${WEEK_ORDER.map((dw, i) => {
        const date = addDays(mon, i);
        return `<a class="wday" href="#train-today" data-date="${date}" data-st="${dayStatus(date)}" ${date === d ? "data-today" : ""}><span class="dw">${DOW[dw]}</span><i class="dot"></i></a>`;
      }).join("")}</div>
    </section>
    <section class="card stats">
      <a href="#body"><small>Cân nặng</small><b class="num">${fmt(lastW ? +lastW[1].weight : +p.weight, 1)}</b><span class="num ${lastW && firstW && lastW[1].weight - firstW[1].weight < 0 ? "good-t" : ""}">${lastW && firstW && lastW[0] !== firstW[0] ? (lastW[1].weight - firstW[1].weight > 0 ? "+" : "") + fmt(lastW[1].weight - firstW[1].weight, 1) + " kg" : "kg"}</span></a>
      <a href="#body"><small>% mỡ</small><b class="num">${fmt(A.as.bf, 1)}</b><span>${esc(A.as.metrics.find((m) => m.key === "bf").cls)}</span></a>
      <a href="#body"><small>Mục tiêu</small><b class="txt">${esc(GOALS[A.t.goal].vn)}</b><span class="num">${fmt(A.t.kcal)} kcal</span></a>
    </section>
    <section class="quick"><span class="eyebrow">Hỏi nhanh PT</span>
      <div class="chips wrap">${["Hôm nay mình nên ăn gì trước buổi tập?", "Đau mỏi cơ sau tập thì làm gì?", "Làm sao để giảm mỡ bụng nhanh hơn?", "Mình có nên uống creatine không?"].map((q) => `<a class="chip" href="#chat" data-ask="${esc(q)}">${esc(q)}</a>`).join("")}</div>
    </section>`;
  root.onclick = (e) => {
    const ask = e.target.closest("[data-ask]");
    if (ask) sessionStorage.setItem("chat_ask", ask.dataset.ask);
    const wd = e.target.closest("[data-date]");
    if (wd) setTrainDate(wd.dataset.date);
    if (e.target.closest("[data-today]")) setTrainDate(today());
    const snap = e.target.closest("[data-act=snap-photo], [data-act=snap-voice]");
    if (snap) return quickSnap(snap.dataset.act === "snap-photo" ? "photo" : "voice", d, () => renderHome(root));
    if (e.target.closest("[data-act=cup]")) {
      const l = (A.food[d] ||= { date: d, meals: {}, water: 0 });
      l.water = (l.water || 0) + 1;
      saveLater("food", d, () => A.food[d], 400);
      toast(`Đã uống ${l.water} cốc nước.`, "good");
      renderHome(root);
    }
  };
}
const foodName = (it) => {
  const v = itemView(it);
  return `${v.name} (${v.portion})`;
};

// ---------------------------------------------------------------- Chat
let chatMsgs = null;
let chatBusy = false;
async function renderChat(root) {
  if (!chatMsgs) chatMsgs = (await S.get("chat", "main"))?.messages || [];
  const prefill = sessionStorage.getItem("chat_prefill") || "";
  sessionStorage.removeItem("chat_prefill");
  root.innerHTML = `<div class="chat">
    <div class="chat-log" id="chat-log" aria-live="polite">
      <div class="msg model"><p>Chào ${esc(A.profile.name || "bạn")}! Mình là PT AI của DNT & HARVE FITNESS. Mình đã đọc hồ sơ, chỉ số cơ thể, lộ trình và nhật ký ăn của bạn. Cứ hỏi mình về tập luyện, ăn uống, thực phẩm bổ sung nhé.</p></div>
      ${chatMsgs.map((m) => `<div class="msg ${m.role}">${m.role === "model" ? md(m.text) : `<p>${esc(m.text)}</p>`}</div>`).join("")}
    </div>
    ${!chatMsgs.length ? `<div class="chips wrap sugg">${["Lên giúp mình thực đơn ngày mai", "Bài nào giúp mông to và tròn hơn?", "Mình nên tập gì vào ngày chơi tennis?", "Tối nay ăn ngoài thì chọn món gì?"].map((q) => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>` : ""}
    <form class="chat-in" id="chat-form">
      <textarea id="chat-text" rows="1" placeholder="${AI.AI_READY ? "Hỏi PT về tập luyện, ăn uống…" : "Cần kết nối Firebase để chat"}" ${AI.AI_READY ? "" : "disabled"} aria-label="Câu hỏi">${esc(prefill)}</textarea>
      <button class="send" type="submit" aria-label="Gửi" ${AI.AI_READY ? "" : "disabled"}><svg viewBox="0 0 24 24"><path d="M4 12l16-8-6 16-2-6z"/></svg></button>
    </form>
    ${chatMsgs.length ? `<button class="link center" id="chat-clear">Xóa cuộc trò chuyện</button>` : ""}
  </div>`;
  const log = $("#chat-log", root);
  const ta = $("#chat-text", root);
  const scroll = () => scrollTo({ top: document.body.scrollHeight });
  scroll();
  ta.oninput = () => {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
  };
  ta.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !matchMedia("(pointer:coarse)").matches) {
      e.preventDefault();
      $("#chat-form", root).requestSubmit();
    }
  };
  const send = async (text) => {
    if (!text || chatBusy) return;
    chatBusy = true;
    $(".sugg", root)?.remove();
    const history = chatMsgs.slice(-20);
    log.insertAdjacentHTML("beforeend", `<div class="msg user"><p>${esc(text)}</p></div><div class="msg model typing"><p>Đang soạn câu trả lời…</p></div>`);
    const out = log.lastElementChild;
    scroll();
    try {
      const answer = await AI.chat(history, text, AI.PT_SYSTEM + "\n\n" + aiContext(), (full) => {
        out.classList.remove("typing");
        out.innerHTML = md(full);
        scroll();
      });
      chatMsgs.push({ role: "user", text }, { role: "model", text: answer });
      chatMsgs = chatMsgs.slice(-40);
      S.set("chat", "main", { messages: chatMsgs }).catch(() => {});
    } catch (e) {
      console.error(e);
      out.classList.remove("typing");
      out.classList.add("error");
      out.innerHTML = `<p>${esc(AI.friendlyError(e))}</p>`;
    }
    chatBusy = false;
  };
  $("#chat-form", root).onsubmit = (e) => {
    e.preventDefault();
    const t = ta.value.trim();
    ta.value = "";
    ta.style.height = "auto";
    send(t);
  };
  root.onclick = async (e) => {
    const q = e.target.closest("[data-q]");
    if (q) send(q.dataset.q);
    if (e.target.id === "chat-clear") {
      chatMsgs = [];
      await S.set("chat", "main", { messages: [] });
      renderChat(root);
    }
  };
  const ask = sessionStorage.getItem("chat_ask");
  if (ask && AI.AI_READY) {
    sessionStorage.removeItem("chat_ask");
    send(ask);
  }
}

// ---------------------------------------------------------------- Router
let lastRoute = "";
async function route() {
  if (!A.user) return;
  const [page = "home", sub = ""] = (location.hash.slice(1).replace(/^\//, "") || "home").split(/[/-]/);
  if (!A.profile && page !== "setup") {
    location.hash = "#setup";
    return;
  }
  closeSheet();
  if (!$("#view")) shell();
  const view = $("#view");
  const key = page + "/" + sub;
  document.querySelectorAll("[data-nav]").forEach((a) => (a.dataset.nav === page ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  document.body.dataset.page = page;
  const av = $("#me");
  if (av && !av.querySelector("img") && A.profile?.name) av.textContent = A.profile.name.trim().slice(0, 1).toUpperCase();
  // fresh root per page so event listeners never pile up
  let root = view.firstElementChild;
  if (!root || root.dataset.page !== page) {
    view.innerHTML = "";
    root = document.createElement("div");
    root.dataset.page = page;
    root.className = "page";
    view.appendChild(root);
  }
  if (key !== lastRoute) scrollTo(0, 0);
  lastRoute = key;
  try {
    if (page === "setup") {
      if (root.dataset.started !== "1") startSetup(), (root.dataset.started = "1");
      renderSetup(root);
    } else if (page === "train") await renderTrain(root, sub);
    else if (page === "food") await renderFood(root, sub);
    else if (page === "body") renderBody(root, sub);
    else if (page === "chat") await renderChat(root);
    else renderHome(root);
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="card"><h3>Có lỗi khi hiển thị trang</h3><p class="muted">${esc(e.message)}</p><a class="ghost" href="#home">Về trang chính</a></div>`;
  }
}
addEventListener("hashchange", route);

// ---------------------------------------------------------------- Boot
app.innerHTML = `<div class="splash"><span class="logo xl">DNT<i>&amp;</i>HARVE</span><span class="tag">FITNESS</span></div>`;
S.initStore(async (user, reason) => {
  A.user = user;
  if (!user) return renderLogin(reason);
  try {
    A.profile = await S.getProfile();
    if (A.profile) {
      recompute();
      await loadRecent();
    }
  } catch (e) {
    console.error(e);
    toast("Không tải được dữ liệu. Kiểm tra mạng.", "bad");
  }
  shell();
  if (!A.profile) location.hash = "#setup";
  route();
});
