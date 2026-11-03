// Gemini through Firebase AI Logic (Gemini Developer API, free Spark plan).
// The API key stays inside Firebase; nothing secret ships in the website.
import { DEMO, firebaseApp } from "./store.js";

// The Firebase AI SDK is loaded only when the person first uses an AI feature (keeps start-up light).
let sdk = null;
const loadSdk = () => (sdk ||= import("firebase/ai"));

const cfg = window.APP_CONFIG || {};
// Each model has its own free quota: when one is busy or out of quota we try the next.
const MODELS = cfg.geminiModels?.length ? cfg.geminiModels : ["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.5-flash"];
let ai = null;
let working = null; // first model that answered

export const AI_READY = !DEMO;

async function getAi() {
  const { getAI, GoogleAIBackend } = await loadSdk();
  if (!ai) ai = getAI(firebaseApp(), { backend: new GoogleAIBackend() });
  return ai;
}

export function friendlyError(e) {
  const m = String(e?.message || e);
  console.error("Gemini error:", e);
  if (/\b429\b|RESOURCE_EXHAUSTED|quota/i.test(m)) return "Tất cả model Gemini miễn phí đang hết lượt trong phút này. Đợi khoảng 1 phút rồi hỏi lại nhé.";
  if (/\b50[03]\b|overloaded|high demand|UNAVAILABLE/i.test(m)) return "Máy chủ Gemini đang quá tải. Thử lại sau ít giây nhé.";
  if (/api-not-enabled|not been used|disabled/i.test(m) || e?.code === "api-not-enabled") return "Chưa bật Firebase AI Logic trong Firebase Console (xem HUONG-DAN.md, bước 5).";
  if (/fetch|network|Failed to fetch/i.test(m)) return "Mất kết nối mạng. Kiểm tra mạng rồi thử lại.";
  if (/safety|blocked/i.test(m)) return "Câu hỏi bị bộ lọc an toàn của Gemini chặn. Thử hỏi cách khác.";
  return "Gemini đang lỗi: " + m.slice(0, 160);
}

// Errors worth retrying on another model: missing model, out of quota, overloaded.
const tryNext = (e) => /\b(404|429|500|503)\b|not found|is not supported|unknown model|invalid model|RESOURCE_EXHAUSTED|quota|overloaded|high demand|UNAVAILABLE/i.test(String(e?.message || e));

async function withModel(fn, params) {
  if (DEMO) throw new Error("demo");
  const list = working ? [working, ...MODELS.filter((m) => m !== working)] : MODELS;
  let last;
  for (const name of list) {
    try {
      const { getGenerativeModel } = await loadSdk();
      const model = getGenerativeModel(await getAi(), { model: name, ...params });
      const r = await fn(model);
      working = name;
      return r;
    } catch (e) {
      last = e;
      console.warn(`Gemini ${name} lỗi, thử model khác:`, e?.message);
      if (!tryNext(e)) throw e;
    }
  }
  throw last;
}

/**
 * Chat with streaming. history: [{role:'user'|'model', text}]
 * onText(fullTextSoFar) is called as chunks arrive. Returns the final text.
 */
export async function chat(history, message, system, onText) {
  return withModel(async (model) => {
    const session = model.startChat({
      history: history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    });
    const res = await session.sendMessageStream(message);
    let full = "";
    for await (const chunk of res.stream) {
      try {
        full += chunk.text();
      } catch {}
      onText?.(full);
    }
    return full;
  }, { systemInstruction: system, generationConfig: { temperature: 0.6, maxOutputTokens: 1600 } });
}

/** One-shot text answer. */
export async function ask(prompt, system) {
  return withModel(async (model) => (await model.generateContent(prompt)).response.text(), {
    systemInstruction: system,
    generationConfig: { temperature: 0.5, maxOutputTokens: 1600 },
  });
}

/** One-shot JSON answer (parsed). `prompt` may be a string or an array of parts (text / inlineData). */
export async function askJSON(prompt, system) {
  const text = await withModel(async (model) => (await model.generateContent(prompt)).response.text(), {
    systemInstruction: system,
    generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
  });
  const s = text.replace(/^```(?:json)?\s*|\s*```$/g, "");
  return JSON.parse(s);
}

export const PT_SYSTEM = `Bạn là huấn luyện viên cá nhân (PT) và chuyên gia dinh dưỡng thể thao của DNT & HARVE FITNESS.
- Luôn trả lời bằng tiếng Việt, xưng "mình" và gọi người dùng là "bạn", giọng thân thiện, ngắn gọn, đi thẳng vào việc cần làm.
- Dựa trên hồ sơ, đánh giá cơ thể, mục tiêu, lộ trình và nhật ký ăn của người dùng (ở phần NGỮ CẢNH) để cá nhân hóa câu trả lời. Dùng số liệu cụ thể (gram, kcal, hiệp × lần, phút).
- Căn cứ theo khuyến nghị quốc tế: ACSM, ISSN, WHO, NSCA. Không bịa nghiên cứu.
- Món ăn ưu tiên đồ Việt dễ mua.
- Không chẩn đoán bệnh. Nếu có đau nhói, chóng mặt, bệnh nền, mang thai, rối loạn ăn uống: khuyên gặp bác sĩ.
- Dùng gạch đầu dòng khi liệt kê, tối đa khoảng 200 chữ trừ khi được hỏi chi tiết.`;
