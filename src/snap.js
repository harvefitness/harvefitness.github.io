// Food capture helpers: photo → compressed JPEG (base64), voice → recorded audio (base64).
// Both are sent straight to Gemini, which identifies the dishes and estimates nutrition.

/** Downscale a photo to ≤ maxSide px and return { base64, mimeType, url } (JPEG). */
export function compressImage(file, maxSide = 1024, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const dataUrl = c.toDataURL("image/jpeg", quality);
      resolve({ base64: dataUrl.split(",")[1], mimeType: "image/jpeg", url: dataUrl });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Không đọc được ảnh. Thử chụp lại hoặc chọn ảnh JPG/PNG."));
    };
    img.src = url;
  });
}

export const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

/**
 * Start recording from the microphone. Returns { stop(): Promise<{base64, mimeType, seconds}>, cancel() }.
 * Auto-stops after maxSeconds.
 */
export async function startRecording({ maxSeconds = 45, onTick } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const pref = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac", "audio/ogg"];
  const type = pref.find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
  const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const t0 = Date.now();
  rec.start(250);
  const tick = setInterval(() => {
    const s = Math.floor((Date.now() - t0) / 1000);
    onTick?.(s);
    if (s >= maxSeconds && rec.state === "recording") rec.stop();
  }, 250);
  let done;
  const finished = new Promise((r) => (done = r));
  rec.onstop = () => {
    clearInterval(tick);
    stream.getTracks().forEach((t) => t.stop());
    done();
  };
  return {
    async stop() {
      if (rec.state === "recording") rec.stop();
      await finished;
      const blob = new Blob(chunks, { type: rec.mimeType || type || "audio/webm" });
      const base64 = await blobToBase64(blob);
      return { base64, mimeType: (blob.type || "audio/webm").split(";")[0], seconds: (Date.now() - t0) / 1000 };
    },
    cancel() {
      if (rec.state === "recording") rec.stop();
    },
  };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export function micErrorText(e) {
  const n = e?.name || "";
  if (n === "NotAllowedError" || n === "SecurityError") return "Bạn chưa cho phép dùng micro. Vào Cài đặt trình duyệt → cho phép Micro cho trang này rồi thử lại.";
  if (n === "NotFoundError") return "Không tìm thấy micro trên thiết bị.";
  return "Không ghi âm được: " + (e?.message || n);
}
