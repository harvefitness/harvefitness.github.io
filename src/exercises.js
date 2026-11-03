// Exercise library: free-exercise-db (public domain, 870+ exercises, 2 photos each)
// plus Vietnamese names and coaching cues for the exercises used in programs.
import { fold } from "./ui.js";

export const MUSCLE_VN = {
  abdominals: "Bụng", abductors: "Hông ngoài", adductors: "Đùi trong", biceps: "Tay trước", calves: "Bắp chân",
  chest: "Ngực", forearms: "Cẳng tay", glutes: "Mông", hamstrings: "Đùi sau", lats: "Xô (lưng rộng)",
  "lower back": "Lưng dưới", "middle back": "Lưng giữa", neck: "Cổ", quadriceps: "Đùi trước", shoulders: "Vai",
  traps: "Cơ thang", triceps: "Tay sau",
};
export const EQUIP_VN = {
  barbell: "Tạ đòn", dumbbell: "Tạ đơn", cable: "Máy cáp", machine: "Máy", "body only": "Không dụng cụ",
  kettlebells: "Tạ ấm", bands: "Dây kháng lực", "medicine ball": "Bóng tạ", "exercise ball": "Bóng tập",
  "foam roll": "Con lăn", "e-z curl bar": "Thanh EZ", other: "Khác",
};
export const CAT_VN = {
  strength: "Sức mạnh", stretching: "Giãn cơ", plyometrics: "Bật nhảy", powerlifting: "Powerlifting",
  "olympic weightlifting": "Cử tạ Olympic", strongman: "Strongman", cardio: "Cardio",
};
export const LEVEL_VN = { beginner: "Cơ bản", intermediate: "Trung cấp", expert: "Nâng cao" };

/** Muscle filter groups shown as chips in the library. */
export const GROUPS = [
  { k: "glutes", vn: "Mông", m: ["glutes", "abductors"] },
  { k: "quads", vn: "Đùi trước", m: ["quadriceps"] },
  { k: "hams", vn: "Đùi sau", m: ["hamstrings", "adductors"] },
  { k: "chest", vn: "Ngực", m: ["chest"] },
  { k: "back", vn: "Lưng", m: ["lats", "middle back", "lower back", "traps"] },
  { k: "shoulders", vn: "Vai", m: ["shoulders"] },
  { k: "arms", vn: "Tay", m: ["biceps", "triceps", "forearms"] },
  { k: "abs", vn: "Bụng", m: ["abdominals"] },
  { k: "calves", vn: "Bắp chân", m: ["calves"] },
  { k: "cardio", vn: "Cardio", cat: ["cardio", "plyometrics"] },
  { k: "stretch", vn: "Giãn cơ", cat: ["stretching"] },
];

/**
 * Curated exercises: id (free-exercise-db) → Vietnamese name + one-line cue.
 * These are what the program generator picks from.
 */
export const EX = {
  // Lower body
  Barbell_Squat: ["Squat tạ đòn", "Chân rộng bằng vai, xuống tới khi đùi song song sàn, gối đi theo mũi chân, lưng thẳng."],
  Goblet_Squat: ["Goblet squat (ôm tạ đơn)", "Ôm tạ trước ngực, ngồi xuống giữa hai chân, ngực mở, gót không nhấc."],
  Bodyweight_Squat: ["Squat không tạ", "Đẩy hông ra sau như ngồi ghế, gối theo mũi chân, đứng lên siết mông."],
  Box_Squat: ["Box squat (ngồi chạm ghế)", "Ngồi chạm nhẹ ghế rồi đứng lên. Kiểm soát độ sâu, nhẹ cho gối."],
  Leg_Press: ["Đạp đùi máy (leg press)", "Lưng dán đệm, hạ tới khi gối ~90°, không khóa cứng gối khi đẩy. Đặt chân cao để ăn mông hơn."],
  Romanian_Deadlift: ["Romanian deadlift (RDL)", "Gối hơi chùng, đẩy hông ra sau, tạ trượt sát đùi, căng đùi sau thì đứng lên siết mông."],
  "Stiff-Legged_Dumbbell_Deadlift": ["RDL tạ đơn", "Như RDL: đẩy hông ra sau, lưng thẳng, tạ đi sát chân."],
  Barbell_Deadlift: ["Deadlift tạ đòn", "Thanh sát ống quyển, lưng thẳng, đẩy sàn bằng chân rồi mở hông."],
  Hyperextensions_Back_Extensions: ["Gập lưng ghế 45°", "Gập ở hông, không ưỡn quá ở đỉnh. Siết mông để nâng người."],
  Pull_Through: ["Cable pull-through", "Quay lưng vào máy cáp thấp, gập hông như deadlift, siết mông đẩy hông tới."],
  Barbell_Hip_Thrust: ["Hip thrust tạ đòn", "Lưng trên tựa ghế, thu cằm, đẩy hông lên tới khi thân song song sàn, siết mông 1 giây."],
  Barbell_Glute_Bridge: ["Glute bridge tạ đòn", "Nằm sàn, tạ trên hông, đẩy gót nâng hông, siết mông ở đỉnh."],
  Single_Leg_Glute_Bridge: ["Glute bridge 1 chân", "Đẩy bằng gót chân trụ, hông giữ ngang, không xoay."],
  Butt_Lift_Bridge: ["Glute bridge (nâng hông)", "Nằm ngửa, gối gập, đẩy gót nâng hông, siết mông 1–2 giây."],
  Split_Squat_with_Dumbbells: ["Split squat / Bulgarian tạ đơn", "Chân sau gác ghế (Bulgarian) hoặc đặt sàn. Người hơi đổ trước để ăn mông."],
  Split_Squats: ["Split squat không tạ", "Một chân trước một chân sau, hạ thẳng xuống, gối sau gần chạm sàn."],
  Dumbbell_Lunges: ["Lunge tạ đơn", "Bước dài về trước, gối trước không đổ vào trong, đạp gót đứng lên."],
  Dumbbell_Rear_Lunge: ["Lunge lùi tạ đơn", "Bước lùi ra sau, nhẹ cho gối hơn lunge tới."],
  Bodyweight_Walking_Lunge: ["Walking lunge", "Bước liên tục về trước, thân thẳng, gối sau gần chạm sàn."],
  Dumbbell_Step_Ups: ["Step-up tạ đơn", "Đặt cả bàn chân lên bục, đạp gót đứng lên, không bật bằng chân dưới."],
  Barbell_Side_Split_Squat: ["Lunge ngang (side lunge)", "Bước rộng sang ngang, ngồi về một bên, chân kia thẳng. Tốt cho di chuyển ngang khi chơi tennis/cầu lông."],
  Leg_Extensions: ["Đá đùi máy", "Đá thẳng chân, giữ 1 giây ở đỉnh, hạ chậm."],
  Seated_Leg_Curl: ["Móc đùi ngồi", "Kéo gót về dưới ghế, hạ chậm 2–3 giây."],
  Lying_Leg_Curls: ["Móc đùi nằm", "Hông dán đệm, kéo gót về mông, hạ chậm."],
  Ball_Leg_Curl: ["Móc đùi với bóng", "Nằm ngửa, gót trên bóng, nâng hông rồi kéo bóng về."],
  Thigh_Abductor: ["Máy dạng hông (abduction)", "Người đổ nhẹ về trước để ăn mông trên, giữ 1 giây ở biên độ ngoài."],
  Thigh_Adductor: ["Máy khép đùi", "Khép chậm, kiểm soát. Giúp ổn định gối và háng."],
  Monster_Walk: ["Monster walk (dây kháng lực)", "Dây quanh gối/cổ chân, hơi ngồi xuống, bước chéo về trước giữ căng dây."],
  "One-Legged_Cable_Kickback": ["Đá mông với cáp", "Đá chân chéo ra sau, giữ lưng yên, không vung người."],
  Glute_Kickback: ["Đá mông quỳ 4 điểm", "Quỳ 4 điểm, đá gót lên trần, lưng không võng."],
  Seated_Calf_Raise: ["Nhón bắp chân ngồi", "Nhón cao hết cỡ, giữ 1 giây, hạ sâu."],
  Rocking_Standing_Calf_Raise: ["Nhón bắp chân đứng", "Đứng mép bậc, nhón lên hết cỡ, hạ gót sâu."],
  // Push
  Leverage_Chest_Press: ["Đẩy ngực máy", "Tay cầm ngang giữa ngực, lưng dán đệm, đẩy ra không khóa khuỷu, thu về chậm."],
  Dumbbell_Bench_Press: ["Đẩy ngực tạ đơn", "Bả vai khép, khuỷu chếch ~45°, hạ tạ ngang ngực rồi đẩy lên."],
  "Barbell_Bench_Press_-_Medium_Grip": ["Đẩy ngực tạ đòn", "Bả vai khép, chân đạp sàn, hạ thanh chạm giữa ngực."],
  Incline_Dumbbell_Press: ["Đẩy ngực dốc lên tạ đơn", "Ghế dốc 30°, đẩy tạ lên trên vai, ngực trên làm việc."],
  Pushups: ["Hít đất", "Tay rộng hơn vai, người thẳng một đường, khuỷu chếch ~45°."],
  "Incline_Push-Up": ["Hít đất tay cao", "Tay đặt lên ghế/bục cho dễ hơn. Giữ thân thẳng."],
  Butterfly: ["Ép ngực máy (pec deck)", "Khép tay trước ngực, giữ 1 giây, mở ra chậm."],
  Machine_Shoulder_Military_Press: ["Đẩy vai máy", "Lưng dán đệm, đẩy lên không khóa khuỷu."],
  Dumbbell_Shoulder_Press: ["Đẩy vai tạ đơn", "Siết bụng, không ưỡn lưng dưới, đẩy tạ lên trên đầu."],
  Side_Lateral_Raise: ["Nâng tạ ngang (vai giữa)", "Tạ nhẹ, nâng ngang vai, khuỷu hơi cong, hạ chậm 2 giây."],
  Cable_Seated_Lateral_Raise: ["Nâng ngang với cáp", "Lực căng đều suốt biên độ, nâng ngang vai."],
  "Lateral_Raise_-_With_Bands": ["Nâng ngang với dây", "Đạp dây dưới chân, nâng tay ngang vai."],
  "Triceps_Pushdown_-_Rope_Attachment": ["Đẩy cáp tay sau (dây thừng)", "Khuỷu ép sát người, đẩy xuống và tách dây ở cuối."],
  Cable_Rope_Overhead_Triceps_Extension: ["Duỗi tay sau qua đầu (cáp)", "Khuỷu hướng lên, duỗi thẳng tay về trước."],
  Bench_Dips: ["Chống ghế tay sau", "Hạ người tới khuỷu ~90°, vai không nhô về trước."],
  // Pull
  "Wide-Grip_Lat_Pulldown": ["Kéo xô (lat pulldown)", "Ưỡn ngực, kéo thanh xuống ngực trên, khuỷu hướng xuống sàn, thả lên chậm."],
  "Close-Grip_Front_Lat_Pulldown": ["Kéo xô tay hẹp", "Kéo về ngực, khép bả vai."],
  "Band_Assisted_Pull-Up": ["Hít xà có dây hỗ trợ", "Dây kháng lực dưới gối, kéo cằm qua xà, hạ chậm."],
  Pullups: ["Hít xà", "Kéo ngực về phía xà, không đung đưa."],
  Seated_Cable_Rows: ["Kéo cáp ngồi (seated row)", "Lưng thẳng, kéo tay cầm về bụng, khép bả vai, duỗi về chậm."],
  "One-Arm_Dumbbell_Row": ["Kéo tạ đơn 1 tay", "Tay và gối tựa ghế, kéo tạ về hông, khuỷu sát người."],
  Bent_Over_Barbell_Row: ["Kéo tạ đòn gập người", "Gập người ~45°, lưng thẳng, kéo thanh về bụng."],
  Inverted_Row: ["Inverted row (kéo người dưới xà)", "Nằm dưới xà thấp, người thẳng, kéo ngực lên chạm xà."],
  Face_Pull: ["Face pull", "Dây thừng ở cáp cao ngang mặt, tạ nhẹ, kéo về mặt và tách tay sang hai tai."],
  Reverse_Machine_Flyes: ["Ép vai sau máy", "Mở tay ra sau, bả vai khép, tạ nhẹ."],
  "Seated_Bent-Over_Rear_Delt_Raise": ["Nâng vai sau tạ đơn", "Ngồi gập người, nâng tạ sang ngang, vai sau làm việc."],
  External_Rotation_with_Cable: ["Xoay ngoài vai với cáp", "Khuỷu ép sát hông, xoay cẳng tay ra ngoài. Tạ rất nhẹ, bảo vệ khớp vai."],
  External_Rotation_with_Band: ["Xoay ngoài vai với dây", "Khuỷu ép sát hông, xoay tay ra ngoài chậm."],
  Dumbbell_Bicep_Curl: ["Cuốn tạ đơn tay trước", "Khuỷu cố định, cuốn lên, hạ chậm."],
  Hammer_Curls: ["Hammer curl", "Lòng bàn tay hướng vào nhau. Tốt cho cẳng tay và lực cầm vợt."],
  // Core
  Plank: ["Plank", "Khuỷu dưới vai, đầu–lưng–mông–gót thẳng một đường, siết bụng và mông."],
  Dead_Bug: ["Dead bug", "Nằm ngửa, ép lưng dưới sát sàn, duỗi tay và chân đối diện, đổi bên."],
  Pallof_Press: ["Pallof press (chống xoay)", "Đứng ngang máy cáp, đẩy tay thẳng ra trước, không cho thân xoay. Rất tốt cho tennis."],
  Pallof_Press_With_Rotation: ["Pallof press có xoay", "Xoay thân có kiểm soát. Tập lực xoay cho cú đánh."],
  Russian_Twist: ["Russian twist", "Ngồi nghiêng người ra sau, xoay thân sang hai bên."],
  Side_Bridge: ["Side plank", "Chống 1 khuỷu, hông cao, người thẳng."],
  Cable_Crunch: ["Gập bụng với cáp", "Quỳ, kéo dây về trán, cuộn cột sống xuống."],
  Hanging_Leg_Raise: ["Treo xà nâng chân", "Cuộn hông lên, không đung đưa."],
  Flat_Bench_Lying_Leg_Raise: ["Nằm ghế nâng chân", "Lưng dưới sát ghế, nâng chân lên, hạ chậm."],
  Crunches: ["Gập bụng", "Cuộn vai lên khỏi sàn, không kéo cổ."],
  Mountain_Climbers: ["Mountain climber", "Chống tay, kéo gối về ngực luân phiên nhanh."],
  Farmers_Walk: ["Farmer walk (xách tạ đi)", "Xách tạ nặng hai tay, đi thẳng người. Tăng lực cầm và core."],
  "Palms-Up_Dumbbell_Wrist_Curl_Over_A_Bench": ["Cuốn cổ tay", "Cẳng tay tựa ghế, cuốn cổ tay lên. Giúp phòng đau khuỷu tennis."],
  Medicine_Ball_Full_Twist: ["Xoay thân với bóng tạ", "Xoay toàn thân từ hông, tập lực xoay cho cú đánh."],
  Lateral_Bound: ["Bật ngang (lateral bound)", "Bật sang ngang trên 1 chân, tiếp đất êm. Tăng tốc độ di chuyển ngang."],
  // Cardio
  Walking_Treadmill: ["Đi bộ dốc máy chạy", "Dốc 8–12%, 4,5–5,5 km/h, không vịn tay."],
  Jogging_Treadmill: ["Chạy chậm máy chạy", "Nhịp nói chuyện được (vùng 2)."],
  Bicycling_Stationary: ["Đạp xe tại chỗ", "Nhịp vừa, nói chuyện được."],
  Elliptical_Trainer: ["Máy elip", "Nhẹ cho khớp gối."],
  Rowing_Stationary: ["Máy chèo thuyền", "Đạp chân trước, kéo tay sau."],
  Stairmaster: ["Máy leo cầu thang", "Đứng thẳng, không tì tay. Ăn mông tốt."],
  Rope_Jumping: ["Nhảy dây", "Bật nhẹ trên mũi chân."],
  // Mobility / stretching
  Worlds_Greatest_Stretch: ["World's greatest stretch", "Khởi động toàn thân: lunge + xoay ngực."],
  Cat_Stretch: ["Cat–cow", "Cong và võng lưng chậm theo nhịp thở."],
  Round_The_World_Shoulder_Stretch: ["Xoay vai khởi động", "Xoay vai biên độ lớn, chậm."],
  Kneeling_Hip_Flexor: ["Giãn gập hông (quỳ)", "Quỳ một gối, đẩy hông tới, siết mông bên quỳ."],
  "90_90_Hamstring": ["Giãn đùi sau 90/90", "Nằm ngửa, đùi vuông góc, duỗi cẳng chân lên."],
  Chest_And_Front_Of_Shoulder_Stretch: ["Giãn ngực và vai trước", "Tay tựa khung cửa, xoay người ra."],
  Kneeling_Forearm_Stretch: ["Giãn cẳng tay", "Quỳ, đặt lòng bàn tay úp/ngửa xuống sàn, ngả nhẹ ra sau."],
  Quad_Stretch: ["Giãn đùi trước", "Kéo gót về mông, gối khép."],
  Calf_Stretch_Hands_Against_Wall: ["Giãn bắp chân", "Tay chống tường, chân sau thẳng, gót dán sàn."],
  Childs_Pose: ["Child's pose", "Ngồi trên gót, vươn tay về trước, thả lỏng lưng."],
};

export const exName = (id) => EX[id]?.[0];
export const exCue = (id) => EX[id]?.[1];

let LIB = null;
let LIB_PROMISE = null;
/** Load the full library (≈ 870 exercises) once. */
export function loadLibrary() {
  if (LIB) return Promise.resolve(LIB);
  if (!LIB_PROMISE)
    LIB_PROMISE = fetch("data/exercises.json")
      .then((r) => r.json())
      .then((arr) => {
        LIB = arr.map((x) => ({
          ...x,
          vn: EX[x.id]?.[0] || "",
          s: fold(`${x.n} ${EX[x.id]?.[0] || ""} ${x.pm.map((m) => MUSCLE_VN[m]).join(" ")} ${EQUIP_VN[x.e] || ""} ${x.id}`),
        }));
        return LIB;
      });
  return LIB_PROMISE;
}
export const libById = (id) => LIB?.find((x) => x.id === id);

export function imgUrl(id, i = 0) {
  const base = window.APP_CONFIG?.exerciseImageBase || "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";
  return `${base}${encodeURIComponent(id)}/${i}.jpg`;
}

/** Search + filter. */
export function searchLib(q, group, equip) {
  if (!LIB) return [];
  const f = fold(q).trim().split(/\s+/).filter(Boolean);
  const g = GROUPS.find((x) => x.k === group);
  let res = LIB.filter((x) => {
    if (g?.m && !x.pm.some((m) => g.m.includes(m))) return false;
    if (g?.cat && !g.cat.includes(x.c)) return false;
    if (equip && x.e !== equip) return false;
    return f.every((t) => x.s.includes(t));
  });
  // Curated (Vietnamese) exercises and beginner-friendly ones first.
  res.sort((a, b) => (b.vn ? 2 : 0) - (a.vn ? 2 : 0) + (a.l === "beginner" ? -0.5 : 0) - (b.l === "beginner" ? -0.5 : 0) || a.n.localeCompare(b.n));
  return res;
}
