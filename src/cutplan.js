// 1-month weight-loss plan: how big a calorie deficit is needed per day / week / month,
// how to split it between eating less and moving more, and a 4-week schedule.
// Basis: ~7.700 kcal per kg of body fat (Wishnofsky; used by NIH/ACSM as a planning rule),
// safe pace 0,5–1 % of body weight per week (ACSM, ISSN), intake never below BMR / 1.200 (nữ) / 1.500 (nam) kcal.
import { round, clamp } from "./ui.js";

export const KCAL_PER_KG = 7700;
export const DAYS = 30;
const STEPS_BASE = { s1: 2500, s2: 4500, s3: 8000, s4: 11000 };

/** Calories burned per 1.000 steps ≈ 0,5 kcal per kg of body weight. */
export const kcalPer1000Steps = (w) => 0.5 * w;

/** Healthy choices for this person: kg in 30 days, with safety level. */
export function cutOptions(a) {
  const w = a.w;
  const perWeek = (pct) => (w * pct) / 100;
  const toMonth = (kgWeek) => (kgWeek * DAYS) / 7;
  const rec = Math.max(0.5, round(toMonth(perWeek(0.75)), 0.5));
  const max = toMonth(perWeek(1));
  const list = [...new Set([1, 1.5, 2, 3, 4, rec])].sort((x, y) => x - y);
  return {
    rec,
    max: round(max, 0.1),
    list: list.map((kg) => {
      const daily = Math.round((kg * KCAL_PER_KG) / DAYS);
      const level = kg <= toMonth(perWeek(0.5)) + 0.01 ? "gentle" : kg <= toMonth(perWeek(0.75)) + 0.26 ? "good" : kg <= max + 0.01 ? "fast" : "danger";
      return { kg, daily, month: Math.round(kg * KCAL_PER_KG), week: daily * 7, level };
    }),
  };
}
export const LEVEL_VN = { gentle: "Nhẹ nhàng", good: "Khuyên dùng", fast: "Nhanh, khó giữ cơ", danger: "Quá nhanh" };

/** Full plan for `kg` lost in 30 days. */
export function cutPlan(p, a, t, kg) {
  const { w, tdee, bmr, male, wMin } = a;
  const floor = Math.max(bmr, male ? 1500 : 1200);
  const daily = (kg * KCAL_PER_KG) / DAYS; // total deficit needed per day
  // At most ~70 % of the deficit from food, never eat below the floor; the rest from moving more.
  const foodMax = Math.max(0, tdee - floor);
  let food = Math.min(daily * 0.7, foodMax, tdee * 0.25);
  let move = daily - food;
  const per1000 = kcalPer1000Steps(w);
  const baseSteps = STEPS_BASE[p.steps] || 4500;
  // Extra steps for the "move" part, max 8.000 extra; anything left goes to cardio sessions.
  let extraSteps = Math.min(8000, Math.round(((move / per1000) * 1000) / 500) * 500);
  const stepKcal = (extraSteps / 1000) * per1000;
  const cardioDay = Math.max(0, move - stepKcal); // kcal/day still missing
  const cardioWeek = Math.round(cardioDay * 7);
  const intake = round(Math.max(floor, tdee - food), 10);
  food = tdee - intake;
  const achievedDaily = food + stepKcal + cardioDay;
  const weekKg = (achievedDaily * 7) / KCAL_PER_KG;
  const endW = w - kg;
  const pctWeek = (weekKg / w) * 100;
  const warn = [];
  if (w - kg < wMin) warn.push(`Sau 1 tháng bạn sẽ dưới mức cân khỏe mạnh (${Math.round(wMin)} kg). Không nên giảm thêm, hãy chọn mục tiêu siết dáng / tăng cơ.`);
  if (pctWeek > 1) warn.push(`Tốc độ ${pctWeek.toFixed(1).replace(".", ",")} % cân nặng mỗi tuần là quá nhanh (khuyến nghị 0,5–1 %): dễ mất cơ, mệt, ăn bù. Nên chọn ${cutOptions(a).rec.toString().replace(".", ",")} kg.`);
  if (intake <= floor + 1 && daily * 0.7 > foodMax) warn.push(`Đã giữ mức ăn tối thiểu ${floor} kcal (không ăn thấp hơn trao đổi chất cơ bản), phần thiếu bù bằng vận động.`);
  const protein = t.protein;
  const weeks = [1, 2, 3, 4].map((n) => ({ n, w: round(w - weekKg * n - (n >= 1 ? 0 : 0), 0.1) }));
  return {
    kg, daily: Math.round(daily), week: Math.round(daily * 7), month: Math.round(kg * KCAL_PER_KG),
    tdee: Math.round(tdee), bmr: Math.round(bmr), floor, intake, food: Math.round(food),
    move: Math.round(stepKcal + cardioDay), stepKcal: Math.round(stepKcal), extraSteps, stepsTarget: round(baseSteps + extraSteps, 500),
    cardioWeek, cardioMin: Math.round(cardioWeek / (w * 0.1)), // ~6 kcal/phút/60 kg đi nhanh/đạp xe vừa (MET ≈ 6)
    protein, endW: round(endW, 0.1), weekKg: round(weekKg, 0.05), pctWeek, weeks, warn,
  };
}
