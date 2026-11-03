// Vietnamese food database, daily meal-plan generator and PT-style meal analysis.
// Values per listed portion, from Bảng thành phần thực phẩm Việt Nam (Viện Dinh dưỡng 2017)
// and USDA FoodData Central; restaurant dishes are typical-portion estimates.
import { fold, hm, hmStr, round, seeded, clamp } from "./ui.js";

// [id, name, portion, kcal, protein, carbs, fat, fiber, tags]
// tags: p=protein source, c=carb, v=veg, f=fruit, d=dairy, x=fat/nuts, s=supplement,
//       o=eat-out dish, r=fried/greasy, u=sugary drink/sweet, a=alcohol, w=drink, b=breakfast-friendly, g=vegetarian
const RAW = [
  // Protein (cooked weight)
  ["uc_ga", "Ức gà luộc/nướng", "100g", 165, 31, 0, 3.6, 0, "p"],
  ["dui_ga", "Đùi gà bỏ da", "100g", 175, 24, 0, 8, 0, "p"],
  ["ga_kho_sa", "Gà kho sả", "100g", 210, 22, 4, 12, 0, "p"],
  ["heo_nac", "Thịt heo nạc / thăn luộc", "100g", 145, 22, 0, 6, 0, "p"],
  ["suon_nuong", "Sườn nướng", "100g", 290, 22, 6, 20, 0, "pr"],
  ["ba_chi", "Ba chỉ luộc", "100g", 420, 14, 0, 40, 0, "pr"],
  ["thit_kho_trung", "Thịt kho trứng", "1 phần", 380, 22, 6, 30, 0, "pr"],
  ["bo_nac", "Bò nạc xào/áp chảo", "100g", 190, 26, 2, 9, 0, "p"],
  ["bo_bit_tet", "Bò bít tết", "150g", 330, 38, 0, 19, 0, "p"],
  ["ca_basa", "Cá basa / cá lóc hấp", "100g", 120, 19, 0, 5, 0, "p"],
  ["ca_hoi", "Cá hồi áp chảo", "100g", 208, 20, 0, 13, 0, "p"],
  ["ca_ngu_hop", "Cá ngừ hộp ngâm nước", "100g", 116, 26, 0, 1, 0, "p"],
  ["ca_kho", "Cá kho tộ", "100g", 180, 18, 6, 9, 0, "p"],
  ["tom", "Tôm luộc/hấp", "100g", 99, 24, 0, 0.3, 0, "p"],
  ["muc", "Mực xào", "100g", 160, 16, 8, 7, 0, "p"],
  ["trung", "Trứng gà luộc", "1 quả", 72, 6.3, 0.4, 4.8, 0, "pbg"],
  ["trung_chien", "Trứng chiên", "2 quả", 220, 13, 1, 18, 0, "prg"],
  ["long_trang", "Lòng trắng trứng", "1 quả", 17, 3.6, 0.2, 0, 0, "pg"],
  ["dau_hu", "Đậu hũ non / luộc", "100g", 76, 8, 2, 4.8, 0.3, "pg"],
  ["dau_hu_sot_ca", "Đậu hũ sốt cà", "1 phần", 180, 10, 8, 12, 1, "pg"],
  ["dau_hu_chien", "Đậu hũ chiên", "100g", 270, 17, 9, 20, 1, "prg"],
  ["tempeh", "Đậu nành / tempeh", "100g", 190, 19, 9, 11, 5, "pg"],
  // Carbs
  ["com", "Cơm trắng", "1 chén (150g)", 195, 4, 43, 0.4, 0.6, "cg"],
  ["com_lut", "Cơm gạo lứt", "1 chén (150g)", 165, 4, 34, 1.3, 2.7, "cg"],
  ["khoai_lang", "Khoai lang luộc", "150g", 130, 2.4, 30, 0.2, 4.5, "cbg"],
  ["khoai_tay", "Khoai tây luộc", "150g", 130, 3, 30, 0.2, 3, "cg"],
  ["bun", "Bún tươi", "1 phần (200g)", 220, 3.4, 50, 0.4, 1, "cg"],
  ["yen_mach", "Yến mạch", "40g", 150, 5, 27, 2.7, 4, "cbg"],
  ["banh_mi_nc", "Bánh mì nguyên cám", "1 lát", 80, 4, 14, 1, 2, "cbg"],
  ["banh_mi_trang", "Bánh mì trắng (không nhân)", "1 ổ", 220, 7, 45, 1.5, 2, "cbg"],
  ["mi_goi", "Mì gói", "1 gói", 350, 7, 46, 14, 2, "crg"],
  ["ngo", "Bắp luộc", "1 trái", 150, 5, 32, 2, 4, "cbg"],
  // Vegetables
  ["rau_luoc", "Rau xanh luộc", "1 đĩa (150g)", 40, 3, 6, 0.4, 4, "vg"],
  ["rau_xao", "Rau xào tỏi", "1 đĩa", 120, 4, 8, 8, 4, "vg"],
  ["canh_rau", "Canh rau", "1 bát", 35, 2, 5, 1, 2, "vg"],
  ["canh_chua", "Canh chua cá", "1 bát", 120, 12, 8, 4, 2, "vp"],
  ["salad", "Salad dầu giấm", "1 đĩa", 120, 2, 8, 9, 3, "vg"],
  ["dua_leo", "Dưa leo / cà chua", "200g", 30, 1.5, 7, 0.2, 1.5, "vg"],
  // Fruit
  ["chuoi", "Chuối", "1 quả", 105, 1.3, 27, 0.4, 3, "fbg"],
  ["xoai", "Xoài chín", "100g", 60, 0.8, 15, 0.4, 1.6, "fg"],
  ["dau_tay", "Dâu tây", "100g", 32, 0.7, 8, 0.3, 2, "fg"],
  ["tao", "Táo", "1 quả", 95, 0.5, 25, 0.3, 4, "fg"],
  ["cam", "Cam", "1 quả", 62, 1.2, 15, 0.2, 3, "fg"],
  ["oi", "Ổi", "1 quả", 68, 2.6, 14, 1, 5, "fg"],
  ["thanh_long", "Thanh long", "200g", 120, 2, 26, 0, 6, "fg"],
  ["dua_hau", "Dưa hấu", "300g", 90, 1.8, 23, 0.5, 1, "fg"],
  // Dairy & supplements
  ["sua_kd", "Sữa tươi không đường", "250ml", 150, 8, 12, 8, 0, "dbg"],
  ["sua_id", "Sữa tươi ít đường", "250ml", 180, 8, 18, 8, 0, "dbg"],
  ["sua_dau_nanh", "Sữa đậu nành không đường", "250ml", 100, 8, 5, 5, 1, "dbg"],
  ["sc_hy_lap", "Sữa chua Hy Lạp không đường", "1 hũ (150g)", 130, 15, 6, 4, 0, "dbpg"],
  ["sc_thuong", "Sữa chua có đường", "1 hũ (100g)", 99, 3.5, 14, 3, 0, "dbg"],
  ["whey", "Whey protein", "1 muỗng (30g)", 120, 24, 3, 1.5, 0, "spg"],
  ["creatine", "Creatine", "5g", 0, 0, 0, 0, 0, "sg"],
  // Fats & nuts
  ["dau_an", "Dầu ăn", "1 thìa (10ml)", 90, 0, 0, 10, 0, "xg"],
  ["bo_dau_phong", "Bơ đậu phộng", "1 muỗng (16g)", 95, 4, 3, 8, 1, "xg"],
  ["hat_dieu", "Hạt điều / hạnh nhân", "30g", 170, 5, 8, 14, 2, "xg"],
  ["trai_bo", "Trái bơ", "½ quả", 160, 2, 9, 15, 7, "xfg"],
  // Eat-out dishes
  ["pho_bo", "Phở bò", "1 tô", 450, 25, 55, 12, 1.5, "ob"],
  ["bun_bo", "Bún bò Huế", "1 tô", 550, 28, 60, 20, 2, "o"],
  ["bun_cha", "Bún chả", "1 phần", 600, 25, 70, 22, 2, "o"],
  ["com_tam", "Cơm tấm sườn bì chả", "1 đĩa", 700, 30, 85, 25, 1, "or"],
  ["com_ga_xoi_mo", "Cơm gà xối mỡ", "1 đĩa", 750, 38, 80, 30, 1, "or"],
  ["hu_tieu", "Hủ tiếu", "1 tô", 400, 20, 55, 10, 1, "ob"],
  ["banh_mi_thit", "Bánh mì thịt", "1 ổ", 450, 18, 50, 18, 2, "obr"],
  ["banh_cuon", "Bánh cuốn", "1 phần", 350, 12, 55, 8, 1, "ob"],
  ["xoi_ga", "Xôi gà / xôi mặn", "1 gói", 600, 25, 85, 17, 2, "obr"],
  ["chao_ga", "Cháo gà", "1 tô", 300, 18, 40, 6, 1, "ob"],
  ["goi_cuon", "Gỏi cuốn", "2 cuốn", 180, 10, 28, 3, 1.5, "o"],
  ["mi_quang", "Mì Quảng", "1 tô", 500, 25, 60, 16, 2, "o"],
  ["ga_ran", "Gà rán", "1 miếng", 320, 20, 11, 21, 0, "or"],
  ["khoai_chien", "Khoai tây chiên", "1 phần vừa", 320, 3.4, 41, 15, 3.5, "orc"],
  ["pizza", "Pizza", "1 miếng", 285, 12, 36, 10, 2, "or"],
  ["hamburger", "Hamburger", "1 cái", 500, 25, 40, 25, 2, "or"],
  ["lau", "Lẩu (phần 1 người)", "1 phần", 600, 35, 40, 30, 3, "o"],
  // Drinks & sweets
  ["ca_phe_den", "Cà phê đen không đường", "1 ly", 5, 0.3, 0, 0, 0, "wg"],
  ["ca_phe_sua", "Cà phê sữa đá", "1 ly", 130, 2, 22, 3.5, 0, "wug"],
  ["bac_xiu", "Bạc xỉu", "1 ly", 180, 3, 28, 6, 0, "wug"],
  ["tra_sua", "Trà sữa trân châu", "1 ly M", 400, 3, 70, 12, 0, "wug"],
  ["nuoc_ngot", "Nước ngọt có gas", "1 lon", 140, 0, 39, 0, 0, "wug"],
  ["nuoc_dua", "Nước dừa", "1 trái", 50, 0.5, 12, 0.5, 0, "wg"],
  ["dien_giai", "Nước điện giải (có đường)", "500ml", 120, 0, 30, 0, 0, "wug"],
  ["bia", "Bia", "1 lon 330ml", 145, 1.6, 13, 0, 0, "wa"],
  ["banh_ngot", "Bánh ngọt / bánh kem", "1 miếng", 350, 4, 45, 17, 1, "ug"],
  ["kem", "Kem", "1 cây", 200, 3, 24, 10, 0, "ug"],
];
export const FOODS = RAW.map(([id, n, portion, kcal, p, c, f, fiber, tags]) => ({ id, n, portion, kcal, p, c, f, fiber, tags, s: fold(n) }));
export const foodById = (id) => FOODS.find((f) => f.id === id);
export const has = (food, t) => !!food?.tags?.includes(t);
const tagOf = (it, t) => has(foodById(it.id), t) || String(it.tags || "").includes(t);

/** Whey + creatine shakes (from the owner's notes). */
export const SHAKES = [
  { n: "Vanilla latte", add: "150ml cà phê đen nguội + 150ml sữa không đường + đá, lắc đều", items: [["whey", 1], ["sua_kd", 0.6], ["ca_phe_den", 1]] },
  { n: "Chuối vani", add: "1 quả chuối + 250ml sữa không đường, xay", items: [["whey", 1], ["chuoi", 1], ["sua_kd", 1]] },
  { n: "Dâu vani", add: "100g dâu tây + 200ml sữa hoặc nước, xay", items: [["whey", 1], ["dau_tay", 1], ["sua_kd", 0.8]] },
  { n: "Bơ đậu phộng chuối", add: "½ quả chuối + 1 muỗng bơ đậu phộng + 250ml sữa, xay", items: [["whey", 1], ["chuoi", 0.5], ["bo_dau_phong", 1], ["sua_kd", 1]] },
  { n: "Xoài vani", add: "100g xoài chín + 200ml sữa, xay", items: [["whey", 1], ["xoai", 1], ["sua_kd", 0.8]] },
  { n: "Sữa chua Hy Lạp ăn muỗng", add: "150g sữa chua Hy Lạp + trái cây + 1 muỗng yến mạch, trộn", items: [["whey", 1], ["sc_hy_lap", 1], ["dau_tay", 1], ["yen_mach", 0.5]] },
  { n: "Yến mạch qua đêm", add: "40g yến mạch + 150ml sữa để tủ lạnh qua đêm", items: [["whey", 1], ["yen_mach", 1], ["sua_kd", 0.6]] },
];

export function totals(items) {
  const t = { kcal: 0, p: 0, c: 0, f: 0, fiber: 0 };
  for (const it of items || []) {
    const q = +it.qty || 1;
    const base = it.id ? foodById(it.id) : null;
    const src = base || it;
    t.kcal += (+src.kcal || 0) * q;
    t.p += (+src.p || 0) * q;
    t.c += (+src.c || 0) * q;
    t.f += (+src.f || 0) * q;
    t.fiber += (+src.fiber || 0) * q;
  }
  return t;
}
export function itemView(it) {
  const base = it.id ? foodById(it.id) : null;
  const q = +it.qty || 1;
  const src = base || it;
  return {
    name: base ? base.n : it.n,
    portion: base ? (q === 1 ? base.portion : `${String(q).replace(".", ",")} × ${base.portion}`) : it.portion || "",
    kcal: (+src.kcal || 0) * q, p: (+src.p || 0) * q, c: (+src.c || 0) * q, f: (+src.f || 0) * q,
    tags: base?.tags || it.tags || "",
  };
}

export const MEAL_SLOTS = { sang: "Bữa sáng", trua: "Bữa trưa", chieu: "Bữa chiều", toi: "Bữa tối", phu: "Bữa phụ" };

// ---------------------------------------------------------------------------
// Meal plan
// ---------------------------------------------------------------------------
const MAIN_PROTEIN = ["uc_ga", "bo_nac", "ca_basa", "tom", "heo_nac", "ca_hoi", "dui_ga", "ca_kho", "muc", "ca_ngu_hop"];
const VEG_PROTEIN = ["dau_hu", "tempeh", "dau_hu_sot_ca", "trung"];
const MAIN_CARB = ["com", "com", "com_lut", "khoai_lang", "bun", "com"];
const VEGS = ["rau_luoc", "canh_rau", "salad", "rau_xao", "canh_chua", "dua_leo"];
const BREAKFAST = [
  [["yen_mach", 1], ["sua_kd", 0.8], ["trung", 2], ["chuoi", 1]],
  [["banh_mi_nc", 2], ["trung", 2], ["dua_leo", 1], ["sua_dau_nanh", 1]],
  [["pho_bo", 1]],
  [["khoai_lang", 1], ["trung", 2], ["sc_hy_lap", 1]],
  [["chao_ga", 1], ["trung", 1]],
  [["banh_cuon", 1], ["sua_dau_nanh", 1]],
];
const SNACKS = [
  [["sc_hy_lap", 1], ["dau_tay", 1]],
  [["chuoi", 1]],
  [["trung", 2], ["tao", 1]],
  [["sc_hy_lap", 1], ["xoai", 1]],
  [["hat_dieu", 1], ["cam", 1]],
  [["sua_dau_nanh", 1], ["oi", 1]],
];

/**
 * Build a meal schedule for a date from the person's routine.
 * opts: { training: bool, trainTime: "20:00", seedSalt }
 */
export function mealPlan(p, t, { date, training, trainTime, salt = "" }) {
  const rnd = seeded(`${date}|${salt}`);
  const pickR = (arr) => arr[Math.floor(rnd() * arr.length)];
  const veg = p.diet === "veg";
  const wake = hm(p.wakeTime) ?? 420;
  let bed = hm(p.bedTime) ?? 1380;
  if (bed <= wake) bed += 1440; // sleeping after midnight
  const awake = bed - wake || 960;
  const meals = clamp(+p.meals || 3, 2, 5);
  const usesWhey = (p.supps || []).includes("whey");
  const usesCreatine = (p.supps || []).includes("creatine");
  const kcal = training ? t.kcal : t.restKcal;
  let train = training ? hm(trainTime || p.trainTime) : null;
  if (train != null && train < wake) train += 1440;

  // Slots: [label, time, share]
  const slots = [];
  if (meals === 2) {
    if (usesWhey) slots.push(["Thức dậy – ly whey", wake + 10, 0.2, "shake"]);
    const m1 = wake + Math.round(awake * 0.25);
    slots.push(["Bữa 1", m1, usesWhey ? 0.37 : 0.45, "main"]);
    if (train != null) slots.push(["Trước tập (nếu đói)", train - 60, 0.06, "pre"]);
    else slots.push(["Bữa phụ", wake + Math.round(awake * 0.55), 0.1, "snack"]);
    slots.push(["Bữa 2" + (train != null ? " (sau tập)" : ""), train != null ? train + 90 : wake + Math.round(awake * 0.75), 0, "main"]);
  } else {
    const lunch = wake + Math.round(awake * 0.35);
    // Evening training → dinner becomes the post-workout meal; snack/shake before training.
    const evening = train != null && train > lunch + 90;
    const trainEnd = train != null ? train + (+p.gymMinutes || 60) : null;
    slots.push(["Bữa sáng", wake + 30, 0.25, "breakfast"]);
    slots.push(["Bữa trưa", lunch, 0.32, "main"]);
    const gap = evening ? train - 60 : wake + Math.round(awake * 0.55);
    if (usesWhey) slots.push([evening ? "Ly whey (trước tập 1 tiếng)" : "Ly whey (bữa phụ)", Math.max(lunch + 120, gap - 15), 0.15, "shake"]);
    else if (meals >= 4 || evening) slots.push([evening ? "Trước tập" : "Bữa phụ", Math.max(lunch + 120, gap), 0.1, evening ? "pre" : "snack"]);
    const dinnerT = evening ? Math.min(trainEnd + 45, bed - 60) : wake + Math.round(awake * 0.72);
    slots.push(["Bữa tối" + (evening ? " (sau tập)" : ""), dinnerT, 0, "main"]);
    if (meals >= 5) slots.push(["Bữa phụ tối", bed - 120, 0.08, "snack"]);
  }
  // The last main meal takes whatever share is left.
  const lastMain = [...slots].reverse().find((x) => x[3] === "main");
  lastMain[2] = 0;
  lastMain[2] = Math.max(0.2, 1 - slots.reduce((s, x) => s + x[2], 0));
  slots.sort((a, b) => a[1] - b[1]);

  const out = [];
  let mainIdx = 0;
  const usedProtein = new Set();
  for (const [label, time, share, kind] of slots) {
    const target = { kcal: kcal * share, p: t.protein * share };
    let items = [];
    let note = "";
    if (kind === "shake") {
      const s = pickR(SHAKES);
      items = s.items.map(([id, qty]) => ({ id, qty }));
      if (usesCreatine) items.push({ id: "creatine", qty: 1 });
      note = `${s.n}: ${s.add}${usesCreatine ? ", thêm 3–5g creatine lúc sắp uống" : ""}.`;
    } else if (kind === "pre") {
      items = [{ id: pickR(["chuoi", "chuoi", "xoai", "khoai_lang"]), qty: 1 }];
      note = "Tinh bột nhanh, dễ tiêu để có sức tập. Không đói thì bỏ qua.";
    } else if (kind === "snack") {
      items = pickR(SNACKS).map(([id, qty]) => ({ id, qty }));
    } else if (kind === "breakfast") {
      items = pickR(BREAKFAST).map(([id, qty]) => ({ id, qty }));
      if (veg) items = items.filter((i) => tagOf(i, "g"));
      fitCarbs(items, target);
    } else {
      // main meal: protein + carb + veg, scaled to target
      const pool = (veg ? VEG_PROTEIN : MAIN_PROTEIN).filter((x) => !usedProtein.has(x));
      const prot = pool[Math.floor(rnd() * pool.length)] || "trung";
      usedProtein.add(prot);
      const carb = pickR(MAIN_CARB);
      const v1 = pickR(VEGS);
      items = [{ id: prot, qty: 1 }, { id: carb, qty: 1 }, { id: v1, qty: 1 }];
      if (!veg && mainIdx === 0 && t.protein > 90) items.push({ id: "trung", qty: 2 });
      // scale protein
      const pf = foodById(prot);
      const restP = totals(items.slice(1)).p;
      const needP = Math.max(target.p - restP, pf.p * 0.8);
      items[0].qty = clamp(round(needP / pf.p, 0.5), 1, 2.5);
      fitCarbs(items, target, 1);
      if (training && /sau tập/.test(label)) note = "Bữa sau tập: đủ đạm (≥ 30g) và tinh bột để phục hồi cơ.";
      mainIdx++;
    }
    const tt = totals(items);
    out.push({ label, time: hmStr(time), kind, items, note, target, ...tt });
  }
  const day = totals(out.flatMap((m) => m.items));
  return { meals: out, day, kcal, training };
}

/** Scale the carb item (index ci) so the meal hits its kcal target. */
function fitCarbs(items, target, ci) {
  const idx = ci ?? items.findIndex((i) => tagOf(i, "c"));
  if (idx < 0) return;
  const cf = foodById(items[idx].id);
  const others = totals(items.filter((_, i) => i !== idx)).kcal;
  items[idx].qty = clamp(round((target.kcal - others) / cf.kcal, 0.5), 0.5, 2.5);
}

// ---------------------------------------------------------------------------
// Analysis – rule-based PT review of a day's log
// ---------------------------------------------------------------------------
export function analyzeDay(log, t, { training, p }) {
  const meals = log?.meals || {};
  const all = Object.values(meals).flat();
  const tot = totals(all);
  const target = { kcal: training ? t.kcal : t.restKcal, p: t.protein, c: training ? t.carbs : t.restCarbs, f: t.fat, fiber: t.fiber };
  const findings = [];
  let score = 100;
  const add = (kind, text, pts = 0) => {
    findings.push({ kind, text });
    score -= pts;
  };
  if (!all.length) return { tot, target, score: null, findings: [], perMeal: [], fixes: [] };

  const pct = (a, b) => (b ? a / b : 0);
  const kp = pct(tot.kcal, target.kcal);
  if (kp < 0.8) add("warn", `Mới ăn ${Math.round(kp * 100)}% calo mục tiêu (thiếu khoảng ${Math.round(target.kcal - tot.kcal)} kcal). Ăn quá ít sẽ mất cơ và dễ ăn bù.`, 10);
  else if (kp > 1.12) add("bad", `Vượt ${Math.round(tot.kcal - target.kcal)} kcal so với mục tiêu. ${t.goal === "cut" || t.goal === "recomp" ? "Phần dư này làm chậm tiến độ giảm mỡ." : ""}`, 15);
  else add("good", "Tổng calo nằm trong mục tiêu.");

  const pp = pct(tot.p, target.p);
  if (pp >= 0.9) add("good", `Đạm đạt ${Math.round(tot.p)}g / ${target.p}g. Tốt để giữ và tăng cơ.`);
  else add(pp < 0.7 ? "bad" : "warn", `Đạm mới ${Math.round(tot.p)}g / ${target.p}g, còn thiếu ${Math.round(target.p - tot.p)}g.`, pp < 0.7 ? 20 : 10);

  const fp = pct(tot.f, target.f);
  if (fp > 1.25) add("warn", `Chất béo ${Math.round(tot.f)}g, vượt ${Math.round((fp - 1) * 100)}% mục tiêu. Thường do đồ chiên, xối mỡ, da gà hoặc ba chỉ.`, 10);
  const cp = pct(tot.c, target.c);
  if (training && cp < 0.65) add("warn", `Ngày tập mà tinh bột chỉ ${Math.round(tot.c)}g / ${target.c}g. Thiếu tinh bột dễ tụt sức và tập kém.`, 8);
  if (!training && cp > 1.2) add("warn", "Ngày nghỉ nhưng ăn nhiều tinh bột. Có thể bớt 1 chén cơm.", 5);

  // Protein distribution (ISSN: ≥ 0,25–0,4 g/kg per meal, every 3–4 h)
  const perMeal = Object.entries(meals)
    .filter(([, v]) => v?.length)
    .map(([k, v]) => ({ k, ...totals(v) }));
  const goodMeals = perMeal.filter((m) => m.p >= Math.max(20, t.perMealProtein * 0.75)).length;
  if (perMeal.length >= 2 && goodMeals < 2) add("warn", `Chỉ ${goodMeals} bữa có từ 20–25g đạm trở lên. Nên chia đạm đều 3–4 bữa, mỗi bữa ~${t.perMealProtein}g.`, 6);

  const vegCount = all.filter((i) => tagOf(i, "v") || /rau|salad|canh|cải|bông cải|dưa leo/i.test(i.n || "")).length;
  if (tot.fiber < target.fiber * 0.5 && vegCount < 2) add("warn", `Ít rau và chất xơ (khoảng ${Math.round(tot.fiber)}g / ${target.fiber}g). Thêm 1–2 đĩa rau mỗi bữa chính.`, 8);
  else if (vegCount >= 2) add("good", "Có đủ rau xanh.");

  const fried = all.filter((i) => tagOf(i, "r") || /chiên|rán|xối mỡ|quay|ba chỉ/i.test(i.n || ""));
  if (fried.length) add("warn", `Có món nhiều dầu mỡ: ${[...new Set(fried.map((i) => itemView(i).name))].join(", ")}. Đổi sang luộc, hấp, nướng hoặc bỏ da.`, 6 * Math.min(fried.length, 2));
  const sugary = all.filter((i) => tagOf(i, "u") || /trà sữa|nước ngọt|bánh ngọt|kem|sữa đặc/i.test(i.n || ""));
  if (sugary.length) add("warn", `Đồ ngọt hoặc nước có đường: ${[...new Set(sugary.map((i) => itemView(i).name))].join(", ")}. Đây là calo rỗng, dễ gây thèm ăn.`, 6);
  const alcohol = all.filter((i) => tagOf(i, "a") || /bia|rượu|vang|cocktail/i.test(i.n || ""));
  if (alcohol.length) add("bad", "Có rượu bia. Cồn làm giảm tổng hợp cơ tới 24–37% sau tập và làm chậm đốt mỡ.", 10);
  if (training && meals.toi?.length) {
    const post = totals(meals.toi);
    if (post.p < 25) add("warn", "Bữa sau tập nên có ít nhất 25–30g đạm để phục hồi cơ.", 5);
  }
  const water = +log.water || 0;
  const waterTarget = Math.round((t.waterBase + (training ? 500 : 0)) / 250);
  if (water && water < waterTarget * 0.7) add("warn", `Mới uống ${water}/${waterTarget} cốc nước.`, 4);

  // Fixes for the rest of the day
  const fixes = [];
  const missP = target.p - tot.p;
  const missK = target.kcal - tot.kcal;
  if (missP > 15) {
    if ((p.supps || []).includes("whey") && missP >= 20) fixes.push(`1 ly whey (+24g đạm, ~120 kcal)`);
    if (missP > 30) fixes.push(`150g ức gà luộc (+46g đạm, ~250 kcal)`);
    fixes.push(`1 hũ sữa chua Hy Lạp (+15g đạm, ~130 kcal)`);
  }
  if (missK > 250 && missP <= 15) fixes.push(`1 chén cơm hoặc 1 củ khoai lang (+~200 kcal tinh bột)`);
  if (missK > 150 && missK <= 250) fixes.push(`1 quả chuối (+105 kcal)`);

  score = clamp(Math.round(score), 0, 100);
  return { tot, target, score, findings, perMeal, fixes };
}

export function grade(score) {
  if (score == null) return { t: "Chưa có dữ liệu", k: "" };
  if (score >= 85) return { t: "Rất tốt", k: "good" };
  if (score >= 70) return { t: "Khá", k: "ok" };
  if (score >= 50) return { t: "Cần cải thiện", k: "warn" };
  return { t: "Chưa ổn", k: "bad" };
}
