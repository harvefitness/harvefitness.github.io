// Build a single, compressed GLB of the superficial muscles grouped into the website's muscle groups.
// Source: Svitylo 3D Anatomy Atlas data 1.2.0 (Z-Anatomy / BodyParts3D, CC BY-SA 4.0).
import fs from "node:fs";
import path from "node:path";
import { NodeIO, Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { quantize, reorder, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

const REL = process.argv[2]; // .../releases/1.2.0
const OUT = process.argv[3];
const LEVEL = process.argv[4] || "economy";
const manifest = JSON.parse(fs.readFileSync(path.join(REL, "manifest.json"), "utf8"));

// Website group → muscle base names (side suffix _l/_r stripped).
const GROUPS = {
  chest: ["clavicular_head_of_pectoralis_major_muscle", "sternocostal_head_of_pectoralis_major_muscle", "abdominal_part_of_pectoralis_major_muscle"],
  "front-deltoids": ["clavicular_part_of_deltoid_muscle", "acromial_part_of_deltoid_muscle"],
  "back-deltoids": ["scapular_spinal_part_of_deltoid_muscle", "infraspinatus_muscle", "teres_minor_muscle"],
  biceps: ["long_head_of_biceps_brachii", "short_head_of_biceps_brachii", "brachialis_muscle"],
  triceps: ["lateral_head_of_triceps_brachii", "long_head_of_triceps_brachii", "medial_head_of_triceps_brachii"],
  forearm: [/brachioradialis/, /flexor_carpi/, /extensor_carpi/, /^extensor_digitorum$/, /extensor_digiti_minimi/, /palmaris_longus/, /pronator_teres/, /flexor_digitorum_superficialis/, /abductor_pollicis_longus/, /extensor_pollicis/],
  abs: ["rectus_abdominis_muscle", /pyramidalis/],
  obliques: ["external_abdominal_oblique_muscle"],
  neck: ["sternocleidomastoid_muscle", /scalene/, /splenius/, /levator_scapulae/, /semispinalis_capitis/],
  trapezius: [/part_of_trapezius_muscle$/],
  "upper-back": ["latissimus_dorsi_muscle", "rhomboid_major_muscle", "rhomboid_minor_muscle", "teres_major_muscle"],
  "lower-back": ["iliocostalis_lumborum_muscle", "iliocostalis_thoracis_muscle", "longissimus_thoracis_muscle", /spinalis_thoracis/],
  gluteal: ["gluteus_maximus_muscle"],
  abductors: ["gluteus_medius_muscle", /tensor_fasciae_latae/],
  adductor: [/^adductor_(longus|brevis|magnus|minimus)$/, "gracilis_muscle", /pectineus/],
  quadriceps: ["rectus_femoris_muscle", "vastus_lateralis_muscle", "vastus_medialis_muscle", "vastus_intermedius_muscle"],
  hamstring: ["long_head_of_biceps_femoris", "short_head_of_biceps_femoris", "semitendinosus_muscle", "semimembranosus_muscle"],
  calves: ["lateral_head_of_gastrocnemius", "medial_head_of_gastrocnemius", "soleus_muscle"],
};
// Not visible from outside or not useful for a fitness figure.
const DROP = /bursa|fascia|sheath|retinacul|aponeuros|ligament|tendon|intercostal|diaphragm|levator_ani|coccygeus|pelvic|perine|sphincter|urethr|larynx|laryng|arytenoid|cricothyroid|thyroarytenoid|vocal|tongue|glossus|palat|pharyn|uvula|tensor_tympani|stapedius|ocul|rectus_(superior|inferior|medialis|lateralis)$|oblique_muscle$|ciliary|tarsal|subcostal|transversus_thoracis|transversus_abdominis|internal_abdominal_oblique|quadratus_lumborum|psoas|iliacus|multifidus|rotatores|semispinalis_(thoracis|cervicis)|interspinal|intertransvers|levatores_costarum|obturator|gemellus|piriformis|quadratus_femoris|popliteus|tibialis_posterior|flexor_hallucis_longus|flexor_digitorum_longus|subscapularis|supraspinatus|pectoralis_minor|serratus_posterior|longus_(colli|capitis)|hyoid|digastric|stylo|mylo|genio|platysma|insertion|origin/;

const groupOf = (base) => {
  for (const [k, list] of Object.entries(GROUPS)) for (const p of list) if (typeof p === "string" ? p === base : p.test(base)) return k;
  return null;
};

// mesh index → { group | "rest" | null }
const meshKey = new Map();
for (const s of manifest.structures) {
  if (s.system !== "muscular" || s.kind !== "structure" || !s.meshes) continue;
  const base = s.id.split(".").pop().replace(/_(l|r)$/, "");
  const g = groupOf(base);
  const key = g || (DROP.test(base) ? null : "rest");
  for (const m of s.meshes) meshKey.set(m, key);
}

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

const buckets = new Map(); // key -> {pos:[], nrm:[], idx:[]}
const bucket = (k) => buckets.get(k) || (buckets.set(k, { pos: [], nrm: [], idx: [] }), buckets.get(k));
let minY = Infinity, maxY = -Infinity;

for (const chunk of manifest.chunks.filter((c) => c.system === "muscular")) {
  const file = path.join(REL, chunk.files[LEVEL].path);
  const doc = await io.read(file);
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const M = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute("POSITION"), N = prim.getAttribute("NORMAL"), ID = prim.getAttribute("_ID"), I = prim.getIndices();
      const n = P.getCount();
      const p = [0, 0, 0], q = [0, 0, 0], id = [0];
      // per-vertex: key + world position/normal
      const vKey = new Array(n), wp = new Float32Array(n * 3), wn = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        P.getElement(i, p);
        const x = M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12];
        const y = M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13];
        const z = M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14];
        wp.set([x, y, z], i * 3);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (N) {
          N.getElement(i, q);
          const nx = M[0] * q[0] + M[4] * q[1] + M[8] * q[2], ny = M[1] * q[0] + M[5] * q[1] + M[9] * q[2], nz = M[2] * q[0] + M[6] * q[1] + M[10] * q[2];
          const l = Math.hypot(nx, ny, nz) || 1;
          wn.set([nx / l, ny / l, nz / l], i * 3);
        }
        ID.getElement(i, id);
        vKey[i] = meshKey.get(Math.round(id[0]) + (id[0] < chunk.meshStart ? chunk.meshStart : 0));
      }
      // split triangles by the key of their first vertex
      const remap = new Map(); // key -> Map(oldIdx -> newIdx)
      const tri = I.getArray();
      for (let t = 0; t < tri.length; t += 3) {
        const k = vKey[tri[t]];
        if (!k) continue;
        const b = bucket(k);
        let r = remap.get(k);
        if (!r) remap.set(k, (r = new Map()));
        for (let j = 0; j < 3; j++) {
          const v = tri[t + j];
          let ni = r.get(v);
          if (ni === undefined) {
            ni = b.pos.length / 3;
            r.set(v, ni);
            b.pos.push(wp[v * 3], wp[v * 3 + 1], wp[v * 3 + 2]);
            b.nrm.push(wn[v * 3], wn[v * 3 + 1], wn[v * 3 + 2]);
          }
          b.idx.push(ni);
        }
      }
    }
  }
}

// The external oblique source mesh includes its aponeurosis, which covers the rectus abdominis.
// Remove oblique (and background) triangles lying in front of the abs so the six-pack is visible.
{
  const abs = buckets.get("abs");
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity;
  for (let i = 0; i < abs.pos.length; i += 3) {
    x0 = Math.min(x0, abs.pos[i]); x1 = Math.max(x1, abs.pos[i]);
    y0 = Math.min(y0, abs.pos[i + 1]); y1 = Math.max(y1, abs.pos[i + 1]);
    z0 = Math.min(z0, abs.pos[i + 2]);
  }
  const zc = (z0 + Math.max(...abs.pos.filter((_, i) => i % 3 === 2))) / 2;
  const front = Math.sign(zc) || 1; // which way the body faces
  for (const k of ["obliques", "rest"]) {
    const b = buckets.get(k);
    const keep = [];
    let removed = 0;
    for (let t = 0; t < b.idx.length; t += 3) {
      let cx = 0, cy = 0, cz = 0;
      for (let j = 0; j < 3; j++) {
        const v = b.idx[t + j] * 3;
        cx += b.pos[v] / 3; cy += b.pos[v + 1] / 3; cz += b.pos[v + 2] / 3;
      }
      const overAbs = cx > x0 + 0.005 && cx < x1 - 0.005 && cy > y0 && cy < y1 && (cz - zc) * front > 0;
      if (overAbs) removed++;
      else keep.push(b.idx[t], b.idx[t + 1], b.idx[t + 2]);
    }
    b.idx = keep;
    console.log(k, "removed over abs:", removed);
  }
}

// Face & skull muscles look unsettling on a fitness figure: drop everything above the neck
// (the site draws a smooth mannequin head instead).
{
  // Head boundary from the sternocleidomastoid (mastoid attachment) only.
  const scm = [];
  for (const s of manifest.structures) if (/sternocleidomastoid_muscle_(l|r)$/.test(s.id)) scm.push(...s.meshes);
  const neck = buckets.get("neck");
  let top = 1.575, zMid = 0;
  { let zs = 0, n = 0; for (let i = 0; i < neck.pos.length; i += 3) { zs += neck.pos[i + 2]; n++; } zMid = zs / n; }
  const cut = top - 0.035;
  const isHead = (cy, cz) => cy > cut || (cy > 1.47 && cz - zMid > 0.045); // skull, or face in front of the neck
  for (const [k, b] of buckets) {
    if (k === "trapezius") continue;
    const keep = [];
    let removed = 0;
    for (let t = 0; t < b.idx.length; t += 3) {
      const cy = (b.pos[b.idx[t] * 3 + 1] + b.pos[b.idx[t + 1] * 3 + 1] + b.pos[b.idx[t + 2] * 3 + 1]) / 3;
      const cz = (b.pos[b.idx[t] * 3 + 2] + b.pos[b.idx[t + 1] * 3 + 2] + b.pos[b.idx[t + 2] * 3 + 2]) / 3;
      if (isHead(cy, cz)) removed++;
      else keep.push(b.idx[t], b.idx[t + 1], b.idx[t + 2]);
    }
    b.idx = keep;
    if (removed) console.log(k, "removed above neck:", removed);
  }
  // trapezius: keep only below the skull base
  const tr = buckets.get("trapezius"), keep = [];
  for (let t = 0; t < tr.idx.length; t += 3) {
    const cy = (tr.pos[tr.idx[t] * 3 + 1] + tr.pos[tr.idx[t + 1] * 3 + 1] + tr.pos[tr.idx[t + 2] * 3 + 1]) / 3;
    if (cy <= top - 0.01) keep.push(tr.idx[t], tr.idx[t + 1], tr.idx[t + 2]);
  }
  tr.idx = keep;
  console.log("neck top y =", top.toFixed(3));
}

// Output document
const out = new Document();
const buf = out.createBuffer();
const scene = out.createScene("muscles");
for (const [k, b] of buckets) {
  // Over-detailed meshes (e.g. the external oblique source) are simplified to ~12k triangles.
  if (b.idx.length / 3 > 15000) {
    // weld duplicate vertices (same position) so the simplifier can collapse edges
    const map = new Map(), pos = [], nrm = [], remapV = new Uint32Array(b.pos.length / 3);
    for (let v = 0; v < b.pos.length / 3; v++) {
      const key = `${Math.round(b.pos[v * 3] * 1e4)},${Math.round(b.pos[v * 3 + 1] * 1e4)},${Math.round(b.pos[v * 3 + 2] * 1e4)}`;
      let ni = map.get(key);
      if (ni === undefined) {
        ni = pos.length / 3;
        map.set(key, ni);
        pos.push(b.pos[v * 3], b.pos[v * 3 + 1], b.pos[v * 3 + 2]);
        nrm.push(b.nrm[v * 3], b.nrm[v * 3 + 1], b.nrm[v * 3 + 2]);
      }
      remapV[v] = ni;
    }
    b.idx = b.idx.map((i) => remapV[i]);
    b.pos = pos;
    b.nrm = nrm;
    const target = 12000 * 3;
    const [simp] = MeshoptSimplifier.simplify(new Uint32Array(b.idx), new Float32Array(b.pos), 3, target, 0.01);
    console.log(k, "simplified", b.idx.length / 3, "→", simp.length / 3);
    b.idx = Array.from(simp);
  }
  const pos = out.createAccessor().setType("VEC3").setArray(new Float32Array(b.pos)).setBuffer(buf);
  const nrm = out.createAccessor().setType("VEC3").setArray(new Float32Array(b.nrm)).setBuffer(buf);
  const idx = out.createAccessor().setType("SCALAR").setArray(new Uint32Array(b.idx)).setBuffer(buf);
  const mat = out.createMaterial(k).setBaseColorFactor([0.55, 0.55, 0.57, 1]).setRoughnessFactor(0.6);
  const prim = out.createPrimitive().setAttribute("POSITION", pos).setAttribute("NORMAL", nrm).setIndices(idx).setMaterial(mat);
  const mesh = out.createMesh(k).addPrimitive(prim);
  scene.addChild(out.createNode(k).setMesh(mesh));
  console.log(k.padEnd(16), "verts", String(b.pos.length / 3).padStart(7), "tris", b.idx.length / 3);
}
await out.transform(weld(), reorder({ encoder: MeshoptEncoder }), quantize());
out.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(OUT, out);
console.log("y range", minY.toFixed(3), maxY.toFixed(3), "→", OUT, (fs.statSync(OUT).size / 1024).toFixed(0), "KB");
