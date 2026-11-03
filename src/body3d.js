// Interactive 3D muscle model (three.js). Drag to rotate 360°, pinch/scroll to zoom,
// tap a muscle to select it. Built from smooth primitives so it stays light (no model download).
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const C = { skin: 0x26272a, muscle: 0x6a6c72, hover: 0x9a9da4, on: 0xd4ff3a };

/**
 * Muscle parts: [key, shape, position(x,y,z), scale(x,y,z), rotationZ?]
 * Units ≈ metres, y up, z towards the viewer. Mirrored parts use ±x.
 */
const SYM = (key, shape, x, y, z, sx, sy, sz, rz = 0, rx = 0) => [
  [key, shape, [x, y, z], [sx, sy, sz], rz, rx],
  [key, shape, [-x, y, z], [sx, sy, sz], -rz, rx],
];
const PARTS = [
  // Neck & traps
  ["neck", "sphere", [0, 1.5, 0.0], [0.06, 0.075, 0.055]],
  ["trapezius", "sphere", [0, 1.43, -0.045], [0.16, 0.06, 0.055]],
  ["trapezius", "sphere", [0, 1.31, -0.085], [0.075, 0.14, 0.035]],
  // Chest
  ...SYM("chest", "sphere", 0.075, 1.3, 0.075, 0.1, 0.075, 0.05, 0.12),
  // Shoulders
  ...SYM("front-deltoids", "sphere", 0.205, 1.365, 0.03, 0.06, 0.07, 0.055),
  ...SYM("back-deltoids", "sphere", 0.205, 1.36, -0.035, 0.058, 0.066, 0.05),
  // Abs (six-pack) & obliques
  ...[1.17, 1.085, 1.0].flatMap((y) => SYM("abs", "sphere", 0.036, y, 0.098, 0.034, 0.04, 0.026)),
  ["abs", "sphere", [0, 0.925, 0.085], [0.07, 0.05, 0.035]],
  ...SYM("obliques", "sphere", 0.12, 1.07, 0.045, 0.045, 0.13, 0.07, -0.08),
  // Back
  ...SYM("upper-back", "sphere", 0.105, 1.2, -0.075, 0.085, 0.17, 0.05, -0.18),
  ["upper-back", "sphere", [0, 1.28, -0.095], [0.05, 0.08, 0.025]],
  ...SYM("lower-back", "sphere", 0.035, 1.02, -0.09, 0.035, 0.1, 0.035),
  // Hips & glutes
  ...SYM("gluteal", "sphere", 0.078, 0.875, -0.075, 0.085, 0.09, 0.075),
  ...SYM("abductors", "sphere", 0.158, 0.9, -0.005, 0.04, 0.075, 0.06),
  // Thighs
  ...SYM("quadriceps", "sphere", 0.098, 0.64, 0.035, 0.072, 0.2, 0.07, 0.04),
  ...SYM("hamstring", "sphere", 0.098, 0.645, -0.04, 0.066, 0.19, 0.062, 0.04),
  ...SYM("adductor", "sphere", 0.05, 0.71, 0.0, 0.04, 0.15, 0.05, -0.05),
  ...SYM("knees", "sphere", 0.105, 0.445, 0.02, 0.052, 0.055, 0.05),
  // Lower legs
  ...SYM("calves", "sphere", 0.105, 0.3, -0.03, 0.053, 0.13, 0.058),
  // Arms are built separately (rotated outwards from the shoulder)
];
const ARM = [
  ["biceps", "sphere", [0, -0.14, 0.03], [0.045, 0.11, 0.045]],
  ["triceps", "sphere", [0, -0.13, -0.03], [0.05, 0.125, 0.048]],
  ["forearm", "sphere", [0, -0.41, 0.0], [0.043, 0.13, 0.043]],
];
// Non-selectable body (the "skin" underneath the muscles)
const BASE = [
  ["sphere", [0, 1.625, 0.005], [0.095, 0.115, 0.1]], // head
  ["capsule", [0, 1.14, -0.005], [0.15, 0.2, 0.1]], // torso
  ["sphere", [0, 0.92, -0.005], [0.155, 0.1, 0.105]], // pelvis
  ["capsule", [0.1, 0.62, 0], [0.068, 0.17, 0.068]],
  ["capsule", [-0.1, 0.62, 0], [0.068, 0.17, 0.068]], // thighs
  ["capsule", [0.105, 0.26, 0], [0.042, 0.16, 0.045]],
  ["capsule", [-0.105, 0.26, 0], [0.042, 0.16, 0.045]], // shins
  ["box", [0.105, 0.03, 0.04], [0.055, 0.035, 0.13]],
  ["box", [-0.105, 0.03, 0.04], [0.055, 0.035, 0.13]], // feet
];

export function mountBody3D(container, { onSelect } = {}) {
  const w = container.clientWidth || 320, h = container.clientHeight || 480;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, w / h, 0.05, 20);
  camera.position.set(0.9, 1.15, 3.1);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x202020, 1.3));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2, 3, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd4ff3a, 0.35);
  rim.position.set(-2.5, 2, -3);
  scene.add(rim);
  const back = new THREE.DirectionalLight(0xffffff, 1.2);
  back.position.set(-1.5, 2.5, -3);
  scene.add(back);

  const body = new THREE.Group();
  scene.add(body);

  const geo = {
    sphere: new THREE.SphereGeometry(1, 32, 24),
    box: new THREE.BoxGeometry(2, 2, 2, 2, 2, 2),
    capsule: new THREE.CapsuleGeometry(1, 1.2, 8, 24),
  };
  const skinMat = new THREE.MeshStandardMaterial({ color: C.skin, roughness: 0.75, metalness: 0.05 });
  const muscles = [];
  const mkMuscle = (k) => new THREE.MeshStandardMaterial({ color: C.muscle, roughness: 0.45, metalness: 0.1, emissive: 0x000000 });

  const add = (parent, keyName, shape, pos, scale, rz = 0, rx = 0) => {
    const m = new THREE.Mesh(geo[shape], keyName ? mkMuscle(keyName) : skinMat);
    m.position.set(...pos);
    m.scale.set(...scale);
    m.rotation.z = rz;
    m.rotation.x = rx;
    if (shape === "box") m.geometry = new THREE.BoxGeometry(2, 2, 2);
    if (keyName) {
      m.userData.key = keyName;
      muscles.push(m);
    }
    parent.add(m);
    return m;
  };
  BASE.forEach(([s, p, sc]) => add(body, null, s, p, sc));
  PARTS.forEach(([k, s, p, sc, rz, rx]) => add(body, k, s, p, sc, rz, rx));
  // Arms hang from the shoulders, angled slightly outwards.
  for (const side of [1, -1]) {
    const arm = new THREE.Group();
    arm.position.set(0.215 * side, 1.34, 0);
    arm.rotation.z = 0.13 * side;
    body.add(arm);
    add(arm, null, "capsule", [0, -0.14, 0], [0.042, 0.12, 0.042]); // upper arm
    add(arm, null, "capsule", [0, -0.41, 0], [0.035, 0.12, 0.035]); // forearm
    add(arm, null, "sphere", [0, -0.6, 0.005], [0.035, 0.055, 0.022]); // hand
    ARM.forEach(([k, s, p, sc]) => add(arm, k, s, p, sc));
  }
  // Rounded boxes look softer: give abs a slight bevel feel via scale.
  // Floor shadow disc
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.42, 48), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.002;
  scene.add(disc);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.452, 64), new THREE.MeshBasicMaterial({ color: C.on, transparent: true, opacity: 0.6 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.003;
  scene.add(ring);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.95, 0);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.6;
  controls.maxDistance = 4.2;
  controls.minPolarAngle = Math.PI * 0.18;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.6;
  controls.addEventListener("start", () => (controls.autoRotate = false));
  controls.update();

  // ---- picking ----
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let selected = null, hovered = null, down = null;
  const paint = () => {
    for (const m of muscles) {
      const on = m.userData.key === selected;
      const hv = !on && m.userData.key === hovered;
      m.material.color.setHex(on ? C.on : hv ? C.hover : C.muscle);
      m.material.emissive.setHex(on ? 0x2a3300 : 0x000000);
    }
  };
  const pick = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    return ray.intersectObjects(muscles, false)[0]?.object.userData.key || null;
  };
  const el = renderer.domElement;
  el.style.touchAction = "none";
  el.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY, t: Date.now() }));
  el.addEventListener("pointerup", (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 8) return;
    const k = pick(e);
    if (!k) return;
    selected = k;
    paint();
    onSelect?.(k);
  });
  el.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || down) return;
    const k = pick(e);
    if (k !== hovered) {
      hovered = k;
      el.style.cursor = k ? "pointer" : "grab";
      paint();
    }
  });

  // ---- render loop (paused when off-screen) ----
  let raf = 0, alive = true;
  const loop = () => {
    if (!alive) return;
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  loop();
  const ro = new ResizeObserver(() => {
    const W = container.clientWidth, H = container.clientHeight;
    if (!W || !H) return;
    renderer.setSize(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  });
  ro.observe(container);

  return {
    select(k, { face = true } = {}) {
      selected = k;
      paint();
      if (!face) return;
      // Turn the model so the selected muscle faces the viewer.
      const m = muscles.find((x) => x.userData.key === k);
      if (!m) return;
      const back = m.getWorldPosition(new THREE.Vector3()).z < 0;
      controls.autoRotate = false;
      const dist = camera.position.distanceTo(controls.target);
      const ang = back ? Math.PI : 0;
      camera.position.set(Math.sin(ang) * dist * 0.95 + 0.3, 1.15, Math.cos(ang) * dist * 0.95);
      controls.update();
    },
    view(side) {
      controls.autoRotate = false;
      const dist = camera.position.distanceTo(controls.target);
      const ang = side === "back" ? Math.PI : side === "left" ? -Math.PI / 2 : side === "right" ? Math.PI / 2 : 0;
      camera.position.set(Math.sin(ang) * dist, 1.15, Math.cos(ang) * dist);
      controls.update();
    },
    spin(on) {
      controls.autoRotate = on;
    },
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.remove();
    },
  };
}
