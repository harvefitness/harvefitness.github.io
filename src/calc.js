// Body assessment + nutrition targets, using published international formulas.
// Every metric carries the standard it is judged against so the UI can cite it.
import { num, round, clamp, hm } from "./ui.js";

/** Sports / activities with MET values (Compendium of Physical Activities, Ainsworth 2011/2024). */
export const SPORTS = {
  tennis: { vn: "Tennis", met: 7.3, legs: true, racquet: true },
  badminton: { vn: "Cầu lông", met: 5.5, legs: true, racquet: true },
  pickleball: { vn: "Pickleball", met: 4.5, legs: true, racquet: true },
  football: { vn: "Bóng đá", met: 7.0, legs: true },
  basketball: { vn: "Bóng rổ", met: 6.5, legs: true },
  volleyball: { vn: "Bóng chuyền", met: 4.0, legs: true },
  running: { vn: "Chạy bộ", met: 8.3, legs: true },
  cycling: { vn: "Đạp xe", met: 6.8, legs: true },
  swimming: { vn: "Bơi lội", met: 6.0, shoulders: true },
  boxing: { vn: "Boxing / Muay", met: 7.8 },
  dance: { vn: "Nhảy / Zumba", met: 6.5, legs: true },
  hiit: { vn: "HIIT / Cardio lớp", met: 8.0, legs: true },
  yoga: { vn: "Yoga", met: 2.5, mobility: true },
  pilates: { vn: "Pilates", met: 3.0, mobility: true },
};
export const GYM_MET = 5.0;

export const GOALS = {
  cut: { vn: "Giảm mỡ", desc: "Giảm cân, giữ cơ" },
  recomp: { vn: "Giảm mỡ + tăng cơ", desc: "Siết dáng, săn chắc" },
  gain: { vn: "Tăng cơ", desc: "Tăng cơ sạch, ít mỡ" },
  maintain: { vn: "Giữ dáng", desc: "Duy trì, khỏe hơn" },
  bulk: { vn: "Tăng cân", desc: "Dành cho người gầy" },
};

export const JOBS = {
  sit: { vn: "Ngồi nhiều (văn phòng, học)", pal: 1.2 },
  mixed: { vn: "Vừa ngồi vừa đi lại", pal: 1.3 },
  stand: { vn: "Đứng / đi lại nhiều (bán hàng)", pal: 1.4 },
  labor: { vn: "Lao động chân tay", pal: 1.55 },
};
export const STEPS = {
  s1: { vn: "Dưới 3.000 bước", add: 0 },
  s2: { vn: "3.000 – 6.000 bước", add: 0.05 },
  s3: { vn: "6.000 – 10.000 bước", add: 0.1 },
  s4: { vn: "Trên 10.000 bước", add: 0.15 },
};

const log10 = Math.log10;

/** Age in years from profile (age field or birth year). */
export function ageOf(p) {
  return num(p.age) ?? 25;
}

/** Sleep hours between bedtime and wake time ("23:30" → "07:00"). */
export function sleepHours(p) {
  const b = hm(p.bedTime), w = hm(p.wakeTime);
  if (b == null || w == null) return null;
  let d = w - b;
  if (d <= 0) d += 1440;
  return d / 60;
}

/** Hours of structured exercise per week and average kcal/day it burns above rest. */
export function weeklyActivity(p) {
  const kg = num(p.weight) || 60;
  const gymH = (p.gymDays?.length || 0) * ((num(p.gymMinutes) || 60) / 60);
  let kcal = gymH * (GYM_MET - 1) * kg;
  let hours = gymH;
  for (const s of p.sports || []) {
    const sp = SPORTS[s.type];
    if (!sp) continue;
    const h = (s.days?.length || 0) * ((num(s.minutes) || 60) / 60);
    hours += h;
    kcal += h * (sp.met - 1) * kg;
  }
  return { hoursWeek: hours, kcalDay: kcal / 7, kcalWeek: kcal };
}

/**
 * Full assessment. Returns { metrics[], bodyType, energy, ...raw numbers }.
 * status: good | ok | warn | bad
 */
export function assess(p) {
  const sex = p.sex === "male" ? "male" : "female";
  const male = sex === "male";
  const age = ageOf(p);
  const h = num(p.height) || 160; // cm
  const w = num(p.weight) || 55; // kg
  const hm2 = (h / 100) ** 2;
  const neck = num(p.neck), waist = num(p.waist), hip = num(p.hip), wrist = num(p.wrist);
  const metrics = [];

  // --- BMI (WHO Asia-Pacific / IDI & WPRO 2000 – used by Bộ Y tế VN) ---
  const bmi = w / hm2;
  let bmiCls, bmiSt;
  if (bmi < 18.5) [bmiCls, bmiSt] = ["Thiếu cân", "warn"];
  else if (bmi < 23) [bmiCls, bmiSt] = ["Bình thường", "good"];
  else if (bmi < 25) [bmiCls, bmiSt] = ["Thừa cân", "warn"];
  else if (bmi < 30) [bmiCls, bmiSt] = ["Béo phì độ I", "bad"];
  else [bmiCls, bmiSt] = ["Béo phì độ II", "bad"];
  metrics.push({
    key: "bmi", label: "BMI", value: bmi, d: 1, unit: "", cls: bmiCls, status: bmiSt,
    ref: "WHO châu Á – Thái Bình Dương (IDI/WPRO 2000): bình thường 18,5–22,9",
    explain: "Chỉ số khối cơ thể = cân nặng / chiều cao². Không phân biệt cơ và mỡ, nên cần xem cùng % mỡ.",
  });

  // --- Body fat % ---
  let bf = null, bfMethod = "";
  const measured = num(p.bodyFat);
  if (measured) {
    bf = measured;
    bfMethod = "Số đo từ máy (InBody / cân điện tử)";
  } else if (neck && waist && (male || hip) && waist > neck) {
    // U.S. Navy circumference method (Hodgdon & Beckett 1984), metric form
    bf = male
      ? 495 / (1.0324 - 0.19077 * log10(waist - neck) + 0.15456 * log10(h)) - 450
      : 495 / (1.29579 - 0.35004 * log10(waist + hip - neck) + 0.221 * log10(h)) - 450;
    bfMethod = "Công thức Hải quân Mỹ (U.S. Navy) từ vòng cổ, eo" + (male ? "" : ", mông");
  }
  if (!(bf > 2 && bf < 65)) {
    // Deurenberg 1991 (BMI, age, sex)
    bf = 1.2 * bmi + 0.23 * age - 10.8 * (male ? 1 : 0) - 5.4;
    bfMethod = "Ước tính Deurenberg từ BMI và tuổi (kém chính xác hơn, nên nhập vòng cổ/eo/mông)";
  }
  bf = clamp(bf, 3, 60);
  const ace = male
    ? [[2, "Dưới mức thiết yếu", "bad"], [6, "Mỡ thiết yếu", "warn"], [14, "Vận động viên", "good"], [18, "Thon gọn (fitness)", "good"], [25, "Trung bình", "ok"], [99, "Thừa mỡ", "bad"]]
    : [[10, "Dưới mức thiết yếu", "bad"], [14, "Mỡ thiết yếu", "warn"], [21, "Vận động viên", "good"], [25, "Thon gọn (fitness)", "good"], [32, "Trung bình", "ok"], [99, "Thừa mỡ", "bad"]];
  const bfRow = ace.find((r) => bf < r[0]);
  metrics.push({
    key: "bf", label: "% mỡ cơ thể", value: bf, d: 1, unit: "%", cls: bfRow[1], status: bfRow[2],
    ref: `Phân loại ACE (Hội đồng Thể dục Mỹ). ${male ? "Nam: thon gọn 14–17%, trung bình 18–24%" : "Nữ: thon gọn 21–24%, trung bình 25–31%"}`,
    explain: bfMethod,
  });

  const fatKg = (w * bf) / 100;
  const lbm = w - fatKg;
  metrics.push({
    key: "lbm", label: "Khối nạc (cơ, xương, nước)", value: lbm, d: 1, unit: "kg", cls: `Mỡ: ${round(fatKg, 0.1).toFixed(1).replace(".", ",")} kg`, status: "ok",
    ref: "Khối nạc = cân nặng × (1 − %mỡ)",
    explain: "Mục tiêu khi siết dáng là giữ hoặc tăng khối nạc, chỉ giảm khối mỡ.",
  });

  // --- FFMI (Kouri 1995), normalised to 1.8 m ---
  const ffmi = lbm / hm2 + 6.1 * (1.8 - h / 100);
  const ffT = male ? [[18, "Dưới trung bình", "warn"], [20, "Trung bình", "ok"], [22, "Khá", "good"], [23.5, "Tốt", "good"], [99, "Rất tốt", "good"]]
    : [[14, "Dưới trung bình", "warn"], [16, "Trung bình", "ok"], [17.5, "Khá", "good"], [19, "Tốt", "good"], [99, "Rất tốt", "good"]];
  const ffRow = ffT.find((r) => ffmi < r[0]);
  metrics.push({
    key: "ffmi", label: "FFMI (chỉ số khối cơ)", value: ffmi, d: 1, unit: "", cls: ffRow[1], status: ffRow[2],
    ref: `Kouri et al. 1995. ${male ? "Nam trung bình 18–20" : "Nữ trung bình 14–16"}`,
    explain: "Đo lượng cơ so với chiều cao. Càng cao càng nhiều cơ.",
  });

  // --- Waist metrics ---
  let whr = null, whtr = null;
  if (waist) {
    whtr = waist / h;
    let c, s;
    if (whtr < 0.4) [c, s] = ["Rất gọn", "ok"];
    else if (whtr < 0.5) [c, s] = ["Khỏe mạnh", "good"];
    else if (whtr < 0.6) [c, s] = ["Tăng nguy cơ", "warn"];
    else [c, s] = ["Nguy cơ cao", "bad"];
    metrics.push({
      key: "whtr", label: "Eo / Chiều cao", value: whtr, d: 2, unit: "", cls: c, status: s,
      ref: "NICE 2022 (Anh): 0,40–0,49 khỏe mạnh; ≥ 0,5 tăng nguy cơ",
      explain: "Giữ vòng eo dưới một nửa chiều cao. Là chỉ số dự báo mỡ nội tạng tốt hơn BMI.",
    });
    const cut = male ? 90 : 80;
    metrics.push({
      key: "waist", label: "Vòng eo", value: waist, d: 0, unit: "cm", cls: waist >= cut ? "Vượt ngưỡng" : "Trong ngưỡng", status: waist >= cut ? "warn" : "good",
      ref: `IDF cho người châu Á: ${male ? "nam" : "nữ"} < ${cut} cm`,
      explain: "Đo ngang rốn, thở ra nhẹ, không hóp bụng.",
    });
    if (hip) {
      whr = waist / hip;
      const lim = male ? 0.9 : 0.85;
      let wc, ws;
      if (whr >= lim) [wc, ws] = ["Tăng nguy cơ tim mạch", "bad"];
      else if (!male && whr <= 0.75) [wc, ws] = ["Dáng đồng hồ cát", "good"];
      else [wc, ws] = ["Bình thường", "good"];
      metrics.push({
        key: "whr", label: "Eo / Mông", value: whr, d: 2, unit: "", cls: wc, status: ws,
        ref: `WHO 2008: ${male ? "nam" : "nữ"} < ${String(lim).replace(".", ",")}${male ? "" : ". Thẩm mỹ: ≈ 0,7"}`,
        explain: male ? "Tỉ lệ thấp cho thấy mỡ ít tích ở bụng." : "Tỉ lệ ≈ 0,7 là dáng đồng hồ cát. Giảm eo và tăng cơ mông đều kéo tỉ lệ xuống.",
      });
    }
  }

  // --- Frame size (wrist), Grant 1980 ---
  let frame = null;
  if (wrist) {
    const r = h / wrist;
    frame = male ? (r > 10.4 ? "small" : r >= 9.6 ? "medium" : "large") : r > 11 ? "small" : r >= 10.1 ? "medium" : "large";
    metrics.push({
      key: "frame", label: "Khung xương", value: r, d: 1, unit: "", cls: { small: "Nhỏ", medium: "Trung bình", large: "Lớn" }[frame], status: "ok",
      ref: "Tỉ lệ chiều cao / vòng cổ tay (Grant 1980)",
      explain: "Khung xương ảnh hưởng cân nặng lý tưởng và khả năng tăng cơ.",
    });
  }

  // --- Energy ---
  const mifflin = 10 * w + 6.25 * h - 5 * age + (male ? 5 : -161);
  const katch = 370 + 21.6 * lbm;
  const bmr = measured ? katch : mifflin;
  const job = JOBS[p.job] || JOBS.sit;
  const steps = STEPS[p.steps] || STEPS.s2;
  const pal = job.pal + steps.add;
  const act = weeklyActivity(p);
  const tdee = bmr * pal + act.kcalDay;
  metrics.push({
    key: "bmr", label: "Trao đổi chất cơ bản (BMR)", value: bmr, d: 0, unit: "kcal", cls: measured ? "Katch–McArdle" : "Mifflin–St Jeor", status: "ok",
    ref: measured ? "Katch–McArdle: 370 + 21,6 × khối nạc" : "Mifflin–St Jeor 1990 (khuyến nghị của Hiệp hội Dinh dưỡng Mỹ)",
    explain: "Năng lượng cơ thể đốt khi nằm nghỉ cả ngày.",
  });
  metrics.push({
    key: "tdee", label: "Tổng tiêu hao mỗi ngày (TDEE)", value: tdee, d: 0, unit: "kcal", cls: `Tập ${round(act.hoursWeek, 0.5).toString().replace(".", ",")} giờ/tuần`, status: "ok",
    ref: "BMR × hệ số sinh hoạt (FAO/WHO PAL) + năng lượng tập luyện theo MET (Compendium 2011)",
    explain: `Sinh hoạt: ${job.vn.toLowerCase()}, ${steps.vn.toLowerCase()}. Tập luyện đốt trung bình ${Math.round(act.kcalDay)} kcal/ngày.`,
  });

  // --- Sleep ---
  const sh = sleepHours(p);
  if (sh != null) {
    let c, s;
    if (sh < 6) [c, s] = ["Thiếu ngủ nặng", "bad"];
    else if (sh < 7) [c, s] = ["Hơi thiếu", "warn"];
    else if (sh <= 9) [c, s] = ["Đủ giấc", "good"];
    else [c, s] = ["Ngủ nhiều", "ok"];
    metrics.push({
      key: "sleep", label: "Giấc ngủ", value: sh, d: 1, unit: "giờ", cls: c, status: s,
      ref: "AASM / NSF: người trưởng thành 7–9 giờ mỗi đêm",
      explain: "Ngủ thiếu làm tăng cảm giác đói, giảm phục hồi cơ và giảm hiệu quả giảm mỡ.",
    });
  }

  // --- Healthy weight range (Asian BMI 18,5–22,9) ---
  const wMin = 18.5 * hm2, wMax = 22.9 * hm2;
  const targetBf = male ? 15 : 23;
  const wAtTargetBf = bf > targetBf ? lbm / (1 - targetBf / 100) : null;
  metrics.push({
    key: "ideal", label: "Cân nặng khỏe mạnh", value: null, text: `${Math.round(wMin)}–${Math.round(wMax)} kg`, unit: "", status: w >= wMin && w <= wMax ? "good" : "warn",
    cls: w > wMax ? `Hơn ${Math.round(w - wMax)} kg` : w < wMin ? `Thiếu ${Math.round(wMin - w)} kg` : "Đang trong khoảng",
    ref: "BMI 18,5–22,9 theo chuẩn châu Á",
    explain: wAtTargetBf
      ? `Nếu giữ nguyên khối nạc và giảm mỡ về ${targetBf}%, bạn sẽ nặng khoảng ${Math.round(wAtTargetBf)} kg.`
      : "Mỡ đã ở mức thon gọn, tập trung tăng cơ để dáng săn hơn.",
  });

  const bodyType = somatotype({ male, frame, bmi, bf, ffmi, whtr, gain: p.gainEase });

  return { sex, male, age, h, w, bmi, bf, bfMethod, fatKg, lbm, ffmi, whr, whtr, frame, bmr, pal, tdee, act, sleep: sh, wMin, wMax, wAtTargetBf, metrics, bodyType };
}

/** Somatotype estimate (Heath–Carter concept) from frame, fat, muscle and self-report. */
function somatotype({ male, frame, bmi, bf, ffmi, whtr, gain }) {
  const s = { ecto: 0, meso: 0, endo: 0 };
  if (frame === "small") s.ecto += 2;
  if (frame === "medium") s.meso += 1;
  if (frame === "large") s.endo += 1, s.meso += 1;
  if (bmi < 19) s.ecto += 2;
  else if (bmi < 20.5) s.ecto += 1;
  if (bmi >= 25) s.endo += 1;
  const hiBf = male ? 22 : 30, loBf = male ? 14 : 21;
  if (bf >= hiBf) s.endo += 2;
  else if (bf < loBf) s.ecto += 1, s.meso += 1;
  else s.meso += 1;
  if (ffmi >= (male ? 20 : 16)) s.meso += 2;
  if (whtr && whtr >= 0.5) s.endo += 1;
  if (gain === "hard") s.ecto += 2;
  if (gain === "easy") s.endo += 2;
  if (gain === "normal") s.meso += 1;
  const sorted = Object.entries(s).sort((a, b) => b[1] - a[1]);
  const main = sorted[0][0];
  const mix = sorted[0][1] - sorted[1][1] <= 1 ? sorted[1][0] : null;
  const INFO = {
    ecto: { vn: "Ectomorph (tạng gầy)", short: "Gầy, xương nhỏ, khó tăng cân", train: "Ưu tiên bài compound nặng, nghỉ giữa hiệp dài hơn, hạn chế cardio dài. Ăn dư calo nhẹ, nhiều tinh bột quanh giờ tập." },
    meso: { vn: "Mesomorph (tạng cơ)", short: "Vai/hông cân đối, dễ lên cơ", train: "Đáp ứng tốt với tập tạ. Kết hợp sức mạnh và thể tích, giữ ăn uống cân bằng là đủ." },
    endo: { vn: "Endomorph (tạng dễ tích mỡ)", short: "Khung lớn, dễ tích mỡ vùng bụng/hông", train: "Ưu tiên giữ đủ đạm, dồn tinh bột vào bữa quanh giờ tập. Tăng bước chân hằng ngày và thêm cardio nhẹ 2–3 buổi/tuần." },
  };
  return { main, mix, scores: s, ...INFO[main], mixVn: mix ? INFO[mix].vn : null };
}

/**
 * Daily targets. ISSN position stands (protein 1,6–2,2 g/kg; fat ≥ 20–25% kcal),
 * deficit capped at 1% body weight / week.
 */
export function targets(p, a) {
  const goal = GOALS[p.goal] ? p.goal : "recomp";
  const { w, wMax, male, tdee, bmr, bf } = a;
  // Reference weight: for overweight people protein is based on an adjusted weight.
  const refW = w > wMax ? wMax + 0.25 * (w - wMax) : w;
  let kcal = tdee;
  let deficit = 0;
  if (goal === "cut") {
    deficit = clamp(tdee * 0.2, 300, 750);
    deficit = Math.min(deficit, (0.01 * w * 7700) / 7);
    if (+p.cutPlan?.food > 0) deficit = +p.cutPlan.food; // the 1-month plan the person chose (food part of the deficit)
  } else if (goal === "recomp") deficit = bf > (male ? 20 : 28) ? tdee * 0.15 : tdee * 0.08;
  else if (goal === "gain") deficit = -clamp(tdee * 0.1, 200, 350);
  else if (goal === "bulk") deficit = -clamp(tdee * 0.15, 300, 500);
  kcal = tdee - deficit;
  const floor = Math.max(bmr, male ? 1500 : 1200);
  if (kcal < floor) kcal = floor;
  kcal = round(kcal, 10);
  const pPerKg = { cut: 2.0, recomp: 2.0, gain: 1.8, maintain: 1.6, bulk: 1.8 }[goal];
  const protein = round(refW * pPerKg, 5);
  const fat = round(Math.max((kcal * 0.25) / 9, refW * 0.7), 5);
  const carbs = round(Math.max((kcal - protein * 4 - fat * 9) / 4, 50), 5);
  // Rest days: ~20% fewer carbs.
  const restCarbs = round(carbs * 0.8, 5);
  const restKcal = round(kcal - (carbs - restCarbs) * 4, 10);
  const fiber = round((kcal / 1000) * 14, 1);
  const waterBase = round(w * 35, 50); // ml
  const weekly = ((tdee - kcal) * 7) / 7700; // kg / week (+ = loss)
  const perMealProtein = round(refW * 0.4, 5); // ISSN: 0,25–0,4 g/kg per meal
  return { goal, kcal, protein, fat, carbs, restKcal, restCarbs, fiber, waterBase, weekly, refW, perMealProtein, deficit: tdee - kcal };
}

/** Water (ml) for a given day: base + 500 ml per hour of training/sport. */
export function waterFor(t, hoursTraining) {
  return round(t.waterBase + hoursTraining * 500, 250);
}
