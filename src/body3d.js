// Interactive 3D anatomical muscle model (three.js).
// Model: Z-Anatomy (based on BodyParts3D, © The Database Center for Life Science), CC BY-SA 4.0,
// via Svitylo 3D Anatomy Atlas data 1.2.0; superficial muscles grouped and compressed for this site.
// Drag to rotate 360°, pinch/scroll to zoom, tap a muscle group to select it.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

const C = { rest: 0x8d8f94, muscle: 0xb9bbc0, hover: 0xd9dbe0, on: 0xe2572f };
export const MODEL_CREDIT = "Mô hình 3D: Z-Anatomy (dựa trên BodyParts3D, © DBCLS), CC BY-SA 4.0";

export async function mountBody3D(container, { onSelect } = {}) {
  const w = container.clientWidth || 320, h = container.clientHeight || 480;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, w / h, 0.05, 20);

  // Studio lighting: soft key, cool fill, back light for muscle contours.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1d24, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(1.5, 2.5, 2.5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc8d4ff, 0.8);
  fill.position.set(-2, 1.2, 1.5);
  scene.add(fill);
  const backL = new THREE.DirectionalLight(0xffffff, 1.6);
  backL.position.set(-1, 2.2, -2.5);
  scene.add(backL);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(new URL("models/muscles.glb", document.baseURI).href);
  const model = gltf.scene;
  const muscles = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    const k = o.name;
    o.material = new THREE.MeshStandardMaterial({
      color: k === "rest" ? C.rest : C.muscle,
      roughness: 0.55,
      metalness: 0.05,
      emissive: 0x000000,
    });
    if (k !== "rest") {
      o.userData.key = k;
      muscles.push(o);
    }
  });
  // Smooth mannequin head & neck (face muscles were removed from the model on purpose).
  const neckMesh = muscles.find((m) => m.userData.key === "neck");
  if (neckMesh) {
    const nb = new THREE.Box3().setFromObject(neckMesh);
    const nc = nb.getCenter(new THREE.Vector3());
    const top = nb.max.y;
    const skin = new THREE.MeshStandardMaterial({ color: 0xc4c6ca, roughness: 0.28, metalness: 0.05 });
    // Display-mannequin head: one smooth egg, wide at the crown and tapering to a soft chin,
    // tilted slightly with the face forward. Faceless. The neck muscles below stay visible.
    const prof = [];
    for (let i = 0; i <= 48; i++) {
      const y = -1 + (2 * i) / 48; // chin (-1) → crown (+1)
      const r = Math.sqrt(Math.max(0, 1 - y * y)) * (0.78 + 0.22 * y) * (y < -0.55 ? 1 - (-0.55 - y) * 0.35 : 1);
      prof.push(new THREE.Vector2(Math.max(r, 0.0001), y));
    }
    const egg = new THREE.LatheGeometry(prof, 64);
    egg.computeVertexNormals();
    const head = new THREE.Mesh(egg, skin);
    head.scale.set(0.072, 0.112, 0.088);
    head.rotation.x = -0.22; // chin forward, crown back
    head.position.set(0, top + 0.062, nc.z + 0.016);
    model.add(head);
  }
  // Center the figure on the floor and face the camera.
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;
  scene.add(model);
  const height = box.max.y - box.min.y;
  const target = new THREE.Vector3(0, height * 0.52, 0);
  const dist = height * 2.05;
  camera.position.set(0, height * 0.58, dist);

  // Floor disc
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.38, 48), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.002;
  scene.add(disc);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = height * 0.7;
  controls.maxDistance = height * 2.6;
  controls.minPolarAngle = Math.PI * 0.2;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.4;
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
      m.material.emissive.setHex(on ? 0x3a0e00 : 0x000000);
    }
  };
  const pick = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    // First muscle group under the finger; a thin background muscle lying just on top
    // (within 2.5 cm) does not block the group below it.
    const hits = ray.intersectObject(model, true);
    if (!hits.length) return null;
    const first = hits[0].distance;
    const hit = hits.find((h) => h.object.userData.key && h.distance - first < 0.025);
    return hit?.object.userData.key || null;
  };
  const el = renderer.domElement;
  el.style.touchAction = "none";
  el.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY }));
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

  // ---- render loop ----
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

  const lookFrom = (ang) => {
    controls.autoRotate = false;
    const d = camera.position.distanceTo(controls.target);
    camera.position.set(Math.sin(ang) * d, target.y + height * 0.06, Math.cos(ang) * d);
    controls.update();
  };
  return {
    select(k, { face = true } = {}) {
      selected = k;
      paint();
      if (!face) return;
      const m = muscles.find((x) => x.userData.key === k);
      if (!m) return;
      const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
      lookFrom(c.z < -0.01 ? Math.PI : 0);
    },
    view(side) {
      lookFrom({ front: 0, right: Math.PI / 2, back: Math.PI, left: -Math.PI / 2 }[side] ?? 0);
    },
    spin(on) {
      controls.autoRotate = on;
    },
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      model.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
      renderer.dispose();
      el.remove();
    },
  };
}
