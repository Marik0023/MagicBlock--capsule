import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.1/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.1/examples/jsm/loaders/GLTFLoader.js";

const ui = {
  introModal: document.getElementById('introModal'),
  introForm: document.getElementById('introForm'),
  nicknameInput: document.getElementById('nicknameInput'),
  avatarInput: document.getElementById('avatarInput'),
  avatarPreview: document.getElementById('avatarPreview'),
  startBtn: document.getElementById('startBtn'),
  profileMini: document.getElementById('profileMini'),
  profileMiniAvatar: document.getElementById('profileMiniAvatar'),
  profileMiniNick: document.getElementById('profileMiniNick'),
  viewer: document.getElementById('viewer'),
  messageInput: document.getElementById('messageInput'),
  charCount: document.getElementById('charCount'),
  sealBtn: document.getElementById('sealBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  sealedOverlay: document.getElementById('sealedOverlay'),
  statusNick: document.getElementById('statusNick'),
  statusAvatar: document.getElementById('statusAvatar'),
  statusText: document.getElementById('statusText'),
  statusSeal: document.getElementById('statusSeal'),
};

const state = {
  readyProfile: false,
  sealed: false,
  nickname: '',
  avatarDataUrl: '',
  message: '',
  gltf: null,
  root: null,

  capsuleLid: null,
  capsuleBase: null,
  capsuleGroup: null,

  lidControl: null,
  lidBone: null,
  lidHinge: null,
  lidBoneOpenQuat: null,
  lidAnimUsesHingeFallback: false,

  screens: {
    lid: null,
    name: null,
    avatar: null,
  },

  lidClosedQuat: null,
  lidOpenQuat: null,
  lidAnimT: 0, // 0=closed, 1=open

  sealAnimPlaying: false,

  rootBaseY: 0,
  rootBaseRotY: 0,
  spinAngle: 0,

  // one-way spin during seal (avoid "туда-сюда")
  sealSpinTargetDelta: 0,
  sealSpinCommitted: false,

  // dynamic screen canvases / effects
  screenFx: {
    lid: null,
    name: null,
    avatar: null,
  },
  avatarImgEl: null,
  avatarImgLoaded: false,
  lastScreenFxDraw: 0,

  // message letter prop (flies into capsule during sealing)
  letterProp: null,
  letterPropVisual: null,
  letterPropReady: false,
  letterPropLoadStarted: false,
};

// ---------- Three.js scene ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07090d);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(2.8, 1.8, 3.6);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
ui.viewer.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.6, 0);
controls.minDistance = 1.8;
controls.maxDistance = 7;
controls.enablePan = false;
controls.maxPolarAngle = Math.PI * 0.52;
controls.minPolarAngle = Math.PI * 0.18;

scene.add(new THREE.AmbientLight(0xffffff, 0.5));

const hemi = new THREE.HemisphereLight(0xb7deff, 0x090d16, 0.75);
scene.add(hemi);

const keyLight = new THREE.DirectionalLight(0xd8eeff, 0.72);
keyLight.position.set(3.8, 4.6, 2.6);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x7f92ff, 0.46);
rimLight.position.set(-4.2, 2.7, -3.8);
scene.add(rimLight);

const accentLightA = new THREE.PointLight(0x74e3ff, 0.28, 14);
accentLightA.position.set(3.1, 1.9, -2.6);
scene.add(accentLightA);

const accentLightB = new THREE.PointLight(0x8a96ff, 0.24, 16);
accentLightB.position.set(-3.2, 2.4, 3.2);
scene.add(accentLightB);

const topSoftLight = new THREE.PointLight(0xddeaff, 0.22, 18);
topSoftLight.position.set(0, 4.2, 0.6);
scene.add(topSoftLight);

const frontFillLight = new THREE.DirectionalLight(0x9fe7ff, 0.2);
frontFillLight.position.set(0.6, 1.6, 4.8);
scene.add(frontFillLight);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(2.6, 64),
  new THREE.MeshBasicMaterial({
    color: 0x0d1422,
    transparent: true,
    opacity: 0.68,
  })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.01;
scene.add(floor);

function resize() {
  const rect = ui.viewer.getBoundingClientRect();
  const w = Math.max(10, rect.width);
  const h = Math.max(10, rect.height);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

if ('ResizeObserver' in window) {
  const viewerResizeObserver = new ResizeObserver(() => resize());
  viewerResizeObserver.observe(ui.viewer);
}

window.addEventListener('load', () => {
  resize();
  setTimeout(resize, 80); // fonts/layout settle pass
});

// ---------- Model helpers ----------
let capsuleBaseMesh = null;
let capsuleLidMesh = null;

function findCapsuleParts(root) {
  capsuleBaseMesh = null;
  capsuleLidMesh = null;

  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const n = (obj.name || '').toLowerCase();
    const p = (obj.parent?.name || '').toLowerCase();

    if (!capsuleBaseMesh && (n.includes('capsule_base') || p.includes('capsule_base'))) {
      capsuleBaseMesh = obj.parent?.name?.toLowerCase().includes('capsule_base') ? obj.parent : obj;
    }

    if (!capsuleLidMesh && (n.includes('capsule_lid') || p.includes('capsule_lid'))) {
      capsuleLidMesh = obj.parent?.name?.toLowerCase().includes('capsule_lid') ? obj.parent : obj;
    }
  });
}

function getCapsuleBounds() {
  const box = new THREE.Box3();
  box.makeEmpty();

  if (state.capsuleBase) box.expandByObject(state.capsuleBase);
  if (state.capsuleLid) box.expandByObject(state.capsuleLid);

  if (box.isEmpty() && state.root) box.expandByObject(state.root);
  return box;
}

function normalizeModelPivotAndGround() {
  if (!state.root) return;

  state.root.updateWorldMatrix(true, true);
  const box = getCapsuleBounds();
  if (box.isEmpty() || !Number.isFinite(box.min.x)) return;

  const center = box.getCenter(new THREE.Vector3());
  const minY = box.min.y;

  // Center X/Z to stop side drift around arbitrary export origin
  state.root.position.x -= center.x;
  state.root.position.z -= center.z;

  // Put lowest point on floor
  state.root.position.y -= minY;

  state.root.updateWorldMatrix(true, true);

  state.rootBaseY = state.root.position.y;
  state.rootBaseRotY = state.root.rotation.y;
}

function fitCameraToCapsule() {
  const targetObj = state.capsuleBase || state.capsuleLid || state.root;
  if (!targetObj) return;

  const box = new THREE.Box3().setFromObject(targetObj);
  if (state.capsuleBase && state.capsuleLid) {
    box.makeEmpty();
    box.expandByObject(state.capsuleBase);
    box.expandByObject(state.capsuleLid);
  }
  if (!Number.isFinite(box.min.x) || box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  controls.target.copy(center);

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = THREE.MathUtils.degToRad(camera.fov || 45);
  let dist = (maxDim * 0.75) / Math.tan(fov / 2);
  dist *= 1.35;

  const dir = new THREE.Vector3(1.25, 0.7, 1.5).normalize();
  camera.position.copy(center).add(dir.multiplyScalar(dist));

  // slight visual bias
  camera.position.y += size.y * 0.05;

  camera.near = Math.max(0.01, dist / 100);
  camera.far = Math.max(100, dist * 20);
  camera.updateProjectionMatrix();

  controls.minDistance = dist * 0.45;
  controls.maxDistance = dist * 2.5;
  controls.update();
}


function cubicBezierVec3(out, p0, p1, p2, p3, t) {
  const x = clamp01(t);
  const k = 1 - x;
  const k2 = k * k;
  const x2 = x * x;

  out.set(0, 0, 0);
  out.addScaledVector(p0, k2 * k);
  out.addScaledVector(p1, 3 * k2 * x);
  out.addScaledVector(p2, 3 * k * x2);
  out.addScaledVector(p3, x2 * x);
  return out;
}

function createFallbackLetterProp() {
  const g = new THREE.Group();
  g.name = 'fallback_letter_prop';

  const paper = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.03, 0.66),
    new THREE.MeshPhysicalMaterial({
      color: 0xf2f7ff,
      roughness: 0.55,
      metalness: 0.05,
      clearcoat: 0.15,
    })
  );

  const fold = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.02, 0.28),
    new THREE.MeshPhysicalMaterial({
      color: 0xe1ecff,
      roughness: 0.58,
      metalness: 0.04,
      transparent: true,
      opacity: 0.95,
    })
  );
  fold.position.set(0, 0.017, 0.12);

  const seal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.02, 24),
    new THREE.MeshPhysicalMaterial({
      color: 0x74e3ff,
      emissive: new THREE.Color(0x2aa8ff),
      emissiveIntensity: 0.55,
      roughness: 0.22,
      metalness: 0.35,
      clearcoat: 0.8,
    })
  );
  seal.rotation.x = Math.PI / 2;
  seal.position.set(0.14, 0.025, 0.05);

  g.add(paper, fold, seal);
  return g;
}

function prepareLetterPropVisual(rootObj) {
  if (!rootObj) return;

  if (state.letterProp) {
    scene.remove(state.letterProp);
    state.letterProp = null;
    state.letterPropVisual = null;
    state.letterPropReady = false;
  }

  const wrapper = new THREE.Group();
  wrapper.name = 'letterPropWrapper';
  wrapper.visible = false;

  const visual = rootObj;
  visual.name = visual.name || 'letterPropVisual';

  // Normalize materials / shading
  visual.traverse?.((obj) => {
    if (!obj?.isMesh) return;
    obj.castShadow = false;
    obj.receiveShadow = false;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((m) => {
      if (!m) return;
      if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;

      // Preserve textured look, just polish a bit for readability during flight
      if ('metalness' in m) m.metalness = Math.min(0.25, Number(m.metalness ?? 0.1));
      if ('roughness' in m) m.roughness = Math.max(0.28, Number(m.roughness ?? 0.55) * 0.9);
      if ('envMapIntensity' in m) m.envMapIntensity = 1.0;
      m.needsUpdate = true;
    });
  });

  wrapper.add(visual);
  scene.add(wrapper);

  // Recenter visual pivot
  wrapper.updateWorldMatrix(true, true);
  const rawBox = new THREE.Box3().setFromObject(visual);
  if (!rawBox.isEmpty() && Number.isFinite(rawBox.min.x)) {
    const center = rawBox.getCenter(new THREE.Vector3());
    visual.position.sub(center);
  }

  // Scale relative to capsule size (works for arbitrary imported GLB scale)
  wrapper.updateWorldMatrix(true, true);
  const vBox = new THREE.Box3().setFromObject(visual);
  const vSize = vBox.getSize(new THREE.Vector3());
  const maxDim = Math.max(vSize.x, vSize.y, vSize.z, 1e-4);

  const capBox = getCapsuleBounds();
  const capSize = capBox.getSize(new THREE.Vector3());
  const desiredMax = Math.max(0.18, Math.min(capSize.x, capSize.z) * 0.58);

  const s = desiredMax / maxDim;
  visual.scale.multiplyScalar(s);

  // Default orientation: keep neutral (safer for custom models)
  visual.rotation.set(0, 0, 0);

  wrapper.visible = false;

  state.letterProp = wrapper;
  state.letterPropVisual = visual;
  state.letterPropReady = true;
}

function loadLetterPropModel() {
  if (state.letterPropLoadStarted) return;
  state.letterPropLoadStarted = true;

  const onLoaded = (gltf) => {
    try {
      const rootObj = gltf?.scene || gltf;
      prepareLetterPropVisual(rootObj);
      console.info('[letter] letter prop loaded');
    } catch (e) {
      console.warn('[letter] prepare failed, using fallback', e);
      prepareLetterPropVisual(createFallbackLetterProp());
    }
  };

  loader.load(
    './assets/message_letter.glb',
    onLoaded,
    undefined,
    (err) => {
      console.warn('[letter] GLB not loaded, using fallback envelope', err);
      prepareLetterPropVisual(createFallbackLetterProp());
    }
  );
}

function getUiElementWorldPoint(el, depth = null) {
  const viewerRect = ui.viewer?.getBoundingClientRect?.();
  const elRect = el?.getBoundingClientRect?.();

  if (!viewerRect) return camera.position.clone();

  const cx = elRect ? (elRect.left + elRect.width * 0.5) : (viewerRect.left + viewerRect.width * 0.5);
  const cy = elRect ? (elRect.top + elRect.height * 0.5) : (viewerRect.top + viewerRect.height * 0.5);

  const nxRaw = ((cx - viewerRect.left) / Math.max(1, viewerRect.width)) * 2 - 1;
  const nyRaw = -((((cy - viewerRect.top) / Math.max(1, viewerRect.height)) * 2) - 1);

  // Allow a bit outside the viewport so the letter can originate from a UI button near the edge.
  const nx = THREE.MathUtils.clamp(nxRaw, -1.75, 1.75);
  const ny = THREE.MathUtils.clamp(nyRaw, -1.75, 1.75);

  const nearPoint = new THREE.Vector3(nx, ny, -1).unproject(camera);
  const rayDir = nearPoint.sub(camera.position).normalize();

  const dist = depth ?? Math.max(1.0, camera.position.distanceTo(controls.target) * 0.56);
  return camera.position.clone().add(rayDir.multiplyScalar(dist));
}

function getLetterFlightPathPoints() {
  const allBox = getCapsuleBounds();
  const allSize = allBox.getSize(new THREE.Vector3());
  const baseBox = state.capsuleBase
    ? new THREE.Box3().setFromObject(state.capsuleBase)
    : allBox.clone();

  const baseCenter = baseBox.getCenter(new THREE.Vector3());
  const baseSize = baseBox.getSize(new THREE.Vector3());

  const sx = Math.max(baseSize.x, allSize.x, 0.6);
  const sy = Math.max(baseSize.y, allSize.y, 0.6);
  const sz = Math.max(baseSize.z, allSize.z, 0.6);

  const camToTarget = camera.position.distanceTo(controls.target);
  const viewDir = new THREE.Vector3();
  camera.getWorldDirection(viewDir);
  const camRight = new THREE.Vector3().crossVectors(viewDir, camera.up).normalize();
  const camUp = new THREE.Vector3().crossVectors(camRight, viewDir).normalize();

  // Start exactly from the Seal button direction (UI -> 3D world handoff)
  const start = getUiElementWorldPoint(ui.sealBtn, Math.max(0.95, camToTarget * 0.50));
  const launch = start.clone()
    .add(camUp.clone().multiplyScalar(Math.max(0.05, sy * 0.06)))
    .add(viewDir.clone().multiplyScalar(Math.max(0.06, sz * 0.08)));

  const rimY = baseBox.max.y;
  const openingCenter = baseCenter.clone().setY(rimY);

  // Keep a safe, centered entry path so the envelope doesn't scrape the box walls/textures.
  const hover = openingCenter.clone().add(new THREE.Vector3(0, Math.max(0.13, sy * 0.22), 0));
  const align = openingCenter.clone().add(new THREE.Vector3(0, Math.max(0.07, sy * 0.11), 0));
  const drop = openingCenter.clone().add(new THREE.Vector3(0, Math.max(0.028, sy * 0.045), 0));
  const sink = openingCenter.clone().add(new THREE.Vector3(0, -Math.max(0.018, Math.min(0.05, baseSize.y * 0.08)), 0));

  const c1 = launch.clone()
    .add(camRight.clone().multiplyScalar(-Math.max(0.08, sx * 0.20)))
    .add(camUp.clone().multiplyScalar(Math.max(0.06, sy * 0.14)))
    .add(viewDir.clone().multiplyScalar(Math.max(0.08, sz * 0.16)));

  const c2 = hover.clone()
    .add(camRight.clone().multiplyScalar(Math.max(0.04, sx * 0.10)))
    .add(camUp.clone().multiplyScalar(Math.max(0.05, sy * 0.10)))
    .add(new THREE.Vector3(0, 0, Math.max(0.04, sz * 0.08)));

  return {
    start,
    launch,
    c1,
    c2,
    hover,
    align,
    drop,
    sink,
    baseCenter,
    openingCenter,
    allSize,
    rimY,
  };
}

const _letterTmpA = new THREE.Vector3();
const _letterTmpB = new THREE.Vector3();
const _letterTmpC = new THREE.Vector3();

function updateLetterSealFlight(globalT) {
  const prop = state.letterProp;
  if (!prop || !state.letterPropReady) return;

  // Extended cinematic timeline for a smoother, more "alive" flight.
  const appearAt = 0.005;
  const launchEnd = 0.13;
  const arcEnd = 0.40;
  const settleEnd = 0.54;
  const dropEnd = 0.69;
  const sinkEnd = 0.76;

  if (globalT < appearAt || globalT > sinkEnd) {
    prop.visible = false;
    return;
  }

  const path = getLetterFlightPathPoints();
  const { start, launch, c1, c2, hover, align, drop, sink, allSize } = path;
  prop.visible = true;

  let pos = _letterTmpA;
  let tangent = _letterTmpB.set(0, 0, -1);
  let scaleMul = 1;
  let wobbleMul = 1;

  if (globalT <= launchEnd) {
    // Small burst out of the button area (gives a clear "comes from button" feel)
    const p = clamp01((globalT - appearAt) / Math.max(1e-4, (launchEnd - appearAt)));
    const e = easeOutBack(p);
    pos.copy(start).lerp(launch, e);
    tangent.copy(launch).sub(start).normalize();
    scaleMul = 0.72 + 0.15 * easeOutQuint(p);
    wobbleMul = 1.0 - 0.35 * p;
  } else if (globalT <= arcEnd) {
    // Main travel arc from button to above the capsule opening
    const p = clamp01((globalT - launchEnd) / Math.max(1e-4, (arcEnd - launchEnd)));
    const pe = easeInOutSine(p);
    cubicBezierVec3(pos, launch, c1, c2, hover, pe);

    const p2 = Math.min(1, pe + 0.02);
    cubicBezierVec3(_letterTmpC, launch, c1, c2, hover, p2);
    tangent.copy(_letterTmpC).sub(pos).normalize();

    const flutter = (1 - p) * 0.45;
    pos.x += Math.sin(globalT * Math.PI * 12.0) * Math.max(0.006, allSize.x * 0.010) * flutter;
    pos.y += Math.sin(globalT * Math.PI * 9.0 + 0.7) * Math.max(0.004, allSize.y * 0.006) * flutter;
    pos.z += Math.cos(globalT * Math.PI * 10.5) * Math.max(0.005, allSize.z * 0.008) * flutter;

    scaleMul = 0.86 + 0.10 * p;
    wobbleMul = 0.75 - 0.25 * p;
  } else if (globalT <= settleEnd) {
    // Brief settle right above the opening before the drop (more believable / "alive")
    const p = clamp01((globalT - arcEnd) / Math.max(1e-4, (settleEnd - arcEnd)));
    const e = easeOutQuint(p);
    pos.copy(hover).lerp(align, e);

    const settleOsc = (1 - p) * (1 - p);
    pos.y += Math.sin(p * Math.PI * 3.2) * Math.max(0.01, allSize.y * 0.012) * settleOsc;
    pos.x += Math.sin(p * Math.PI * 2.4 + 0.4) * Math.max(0.006, allSize.x * 0.008) * settleOsc;

    tangent.copy(align).sub(hover).normalize();
    scaleMul = 0.96 - p * 0.03;
    wobbleMul = 0.35 * (1 - p);
  } else if (globalT <= dropEnd) {
    // Safe centered drop to avoid scraping the box walls/textures
    const p = clamp01((globalT - settleEnd) / Math.max(1e-4, (dropEnd - settleEnd)));
    const e = easeInOutSine(p);
    pos.copy(align).lerp(drop, e);

    // Tiny damped sway only at the start of the drop (keeps it alive but safe)
    const sway = (1 - p) * (1 - p);
    pos.x += Math.sin(p * Math.PI * 2.0) * Math.max(0.003, allSize.x * 0.0035) * sway;
    pos.z += Math.cos(p * Math.PI * 1.7) * Math.max(0.003, allSize.z * 0.0030) * sway;

    tangent.set(0, -1, 0);
    scaleMul = 0.93 - p * 0.07;
    wobbleMul = 0.08 * (1 - p);
  } else {
    // Final sink straight down the center; hide shortly after entry to avoid visible clipping.
    const p = clamp01((globalT - dropEnd) / Math.max(1e-4, (sinkEnd - dropEnd)));
    const e = easeInOutCubic(p);
    pos.copy(drop).lerp(sink, e);
    tangent.set(0, -1, 0);
    scaleMul = 0.86 - p * 0.20;
    wobbleMul = 0;

    // Disappear a touch before fully inside to avoid texture intersection artifacts.
    if (p > 0.86) {
      prop.visible = false;
      return;
    }
  }

  prop.position.copy(pos);

  // Orient along motion + subtle banking/flutter. During drop, keep a slimmer edge-first pose.
  const yaw = Math.atan2(tangent.x, tangent.z);
  const flatLen = Math.max(1e-4, Math.hypot(tangent.x, tangent.z));
  const pitch = -Math.atan2(tangent.y, flatLen);

  const dropBlend = clamp01((globalT - settleEnd) / Math.max(1e-4, (sinkEnd - settleEnd)));
  const edgeRoll = THREE.MathUtils.lerp(-0.18, -0.05, dropBlend);
  const flutterRoll = Math.sin(globalT * Math.PI * 7.0) * 0.05 * wobbleMul;
  const flutterPitch = Math.sin(globalT * Math.PI * 8.8 + 0.35) * 0.03 * wobbleMul;

  prop.rotation.set(
    pitch + 0.12 + flutterPitch,
    yaw + Math.PI * 0.5,
    edgeRoll + flutterRoll
  );

  prop.scale.setScalar(scaleMul);
}

// ---------- Lid auto-solver helpers (main fix) ----------
function getRawClipAxisDelta(openQuat, closedQuat) {
  if (!openQuat || !closedQuat) return new THREE.Vector3(0, 0, -1);

  const qDelta = openQuat.clone().invert().multiply(closedQuat.clone().normalize());
  const w = THREE.MathUtils.clamp(qDelta.w, -1, 1);
  const angle = 2 * Math.acos(w);
  const s = Math.sqrt(Math.max(0, 1 - w * w));

  if (!Number.isFinite(angle) || s < 1e-5) return new THREE.Vector3(0, 0, -1);

  return new THREE.Vector3(qDelta.x / s, qDelta.y / s, qDelta.z / s).normalize();
}

function snapDominantAxis(axis) {
  const a = axis.clone().normalize();
  const ax = Math.abs(a.x);
  const ay = Math.abs(a.y);
  const az = Math.abs(a.z);

  if (ax >= ay && ax >= az) return new THREE.Vector3(Math.sign(a.x) || 1, 0, 0);
  if (ay >= ax && ay >= az) return new THREE.Vector3(0, Math.sign(a.y) || 1, 0);
  return new THREE.Vector3(0, 0, Math.sign(a.z) || 1);
}

function computeBoxesForCapsule() {
  if (!state.capsuleBase || !state.capsuleLid) return null;

  state.root?.updateWorldMatrix(true, true);

  const baseBox = new THREE.Box3().setFromObject(state.capsuleBase);
  const lidBox = new THREE.Box3().setFromObject(state.capsuleLid);

  if (baseBox.isEmpty() || lidBox.isEmpty()) return null;
  return { baseBox, lidBox };
}

/**
 * Finds the best synthetic "closed" quaternion for Bone_00 by geometry scoring.
 * Goal:
 *  - no X/Z slide ("кришка їде назад")
 *  - minimal Y gap to base (more closed)
 */
function autoSolveClosedLidQuat({
  boneNode,
  openQuat,
  clipClosedQuat = null,
  angleMinDeg = 30,
  angleMaxDeg = 78,
  angleStepDeg = 1,
}) {
  if (!boneNode || !openQuat || !state.capsuleBase || !state.capsuleLid) return null;

  const originalQuat = boneNode.quaternion.clone();

  const rawAxis = getRawClipAxisDelta(openQuat, clipClosedQuat || openQuat);
  const dominantAxis = snapDominantAxis(rawAxis);

  const axisCandidates = [
    dominantAxis.clone(),
    dominantAxis.clone().negate(),
    rawAxis.clone().normalize(),
    rawAxis.clone().negate().normalize(),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
  ];

  // de-duplicate exact/near axes
  const uniqueAxes = [];
  for (const a of axisCandidates) {
    if (!a || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.z)) continue;
    const n = a.clone().normalize();

    let dup = false;
    for (const u of uniqueAxes) {
      if (n.distanceTo(u) < 1e-6) {
        dup = true;
        break;
      }
    }
    if (!dup) uniqueAxes.push(n);
  }

  const orders = ['post', 'pre']; // post=open*delta, pre=delta*open
  let best = null;

  const tmpCenterL = new THREE.Vector3();
  const tmpCenterB = new THREE.Vector3();

  for (const axis of uniqueAxes) {
    for (const order of orders) {
      for (let deg = angleMinDeg; deg <= angleMaxDeg; deg += angleStepDeg) {
        const delta = new THREE.Quaternion().setFromAxisAngle(
          axis,
          THREE.MathUtils.degToRad(deg)
        );

        let qCandidate;
        if (order === 'post') {
          qCandidate = openQuat.clone().multiply(delta).normalize();
        } else {
          qCandidate = delta.clone().multiply(openQuat).normalize();
        }

        boneNode.quaternion.copy(qCandidate);
        state.root?.updateWorldMatrix(true, true);

        const boxes = computeBoxesForCapsule();
        if (!boxes) continue;

        const { baseBox, lidBox } = boxes;
        baseBox.getCenter(tmpCenterB);
        lidBox.getCenter(tmpCenterL);

        // Main issue: lid drifting in X/Z when closing
        const dx = tmpCenterL.x - tmpCenterB.x;
        const dz = tmpCenterL.z - tmpCenterB.z;
        const horizontalOffset2 = dx * dx + dz * dz;

        // Contact / fit score (lid should approach base top)
        const yGap = Math.abs(lidBox.min.y - baseBox.max.y);

        // Soft prior (avoid weird extremes)
        const closeAngleFromOpen = openQuat.angleTo(qCandidate);
        const targetCloseRad = THREE.MathUtils.degToRad(48);

        let score = 0;
        score += horizontalOffset2 * 250;                      // strongest priority
        score += yGap * yGap * 180;                            // close fit
        score += Math.abs(closeAngleFromOpen - targetCloseRad) * 3.5; // soft prior

        // Penalize clearly too-high lid
        if (lidBox.min.y > baseBox.max.y + 0.08) score += 25;

        // Penalize lid that overshoots too deep into base a lot (geometry mismatch)
        if (lidBox.min.y < baseBox.max.y - 0.12) score += 15;

        if (!best || score < best.score) {
          best = {
            score,
            q: qCandidate.clone(),
            axis: axis.clone(),
            deg,
            order,
            dx,
            dz,
            yGap,
          };
        }
      }
    }
  }

  // restore original for safety
  boneNode.quaternion.copy(originalQuat);
  state.root?.updateWorldMatrix(true, true);

  if (best) {
    console.info(
      '[lid:autoSolve]',
      'deg=', best.deg,
      'order=', best.order,
      'axis=', best.axis.toArray().map(v => v.toFixed(3)).join(','),
      'dx=', best.dx.toFixed(4),
      'dz=', best.dz.toFixed(4),
      'yGap=', best.yGap.toFixed(4),
      'score=', best.score.toFixed(4)
    );
    return best.q;
  }

  return null;
}

// ---------- Load model ----------
const loader = new GLTFLoader();

loader.load(
  './assets/time_capsule_case_v2.glb',
  (gltf) => {
    state.gltf = gltf;
    state.root = gltf.scene;
    scene.add(gltf.scene);

    // Defensive material cleanup for some exports
    gltf.scene.traverse((obj) => {
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => {
          if (m && 'onBuild' in m && typeof m.onBuild !== 'function') {
            try { delete m.onBuild; } catch (e) { m.onBuild = undefined; }
          }
        });
      }

      if (!obj.isMesh) return;

      obj.castShadow = false;
      obj.receiveShadow = false;

      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => {
          if (m?.map) m.map.colorSpace = THREE.SRGBColorSpace;
        });
      }
    });

    findCapsuleParts(gltf.scene);

    // Named nodes from export
    const lidMeshNode = gltf.scene.getObjectByName('capsule_lid');
    const lidHingeNode = gltf.scene.getObjectByName('capsule_lid.001');
    const lidBoneNode = gltf.scene.getObjectByName('Bone_00');

    // Visual lid branch / actual control nodes
    state.capsuleLid = lidMeshNode || lidHingeNode || capsuleLidMesh || null;
    state.lidBone = lidBoneNode || null;
    state.lidHinge = lidHingeNode || null;
    state.lidControl = state.lidBone || state.lidHinge || lidMeshNode || null;
    state.capsuleBase = gltf.scene.getObjectByName('capsule_base') || capsuleBaseMesh || null;

    // Optional grouping (debug/useful later)
    state.capsuleGroup = new THREE.Group();
    if (state.capsuleBase) state.capsuleGroup.add(state.capsuleBase.clone(false));
    if (state.capsuleLid) state.capsuleGroup.add(state.capsuleLid.clone(false));

    // Screens
    state.screens.lid = gltf.scene.getObjectByName('screen_lid');
    state.screens.name = gltf.scene.getObjectByName('screen_name');
    state.screens.avatar = gltf.scene.getObjectByName('screen_avatar');

    // Lid pose setup
    if (state.lidBone || state.lidControl) {
      const boneNode = state.lidBone || state.lidControl;

      const clips = Array.isArray(gltf.animations) ? gltf.animations : [];

      // v2 model path (no baked animations): animate the real lid node directly.
      // If the model has no Bone_00 and no clips, capsule_lid local quaternion is the open pose,
      // and identity quaternion is the clean closed pose (fixed pivot in DCC).
      if (!state.lidBone && lidMeshNode && clips.length === 0) {
        state.lidAnimUsesHingeFallback = false;
        state.lidControl = lidMeshNode;
        state.lidOpenQuat = lidMeshNode.quaternion.clone().normalize();
        state.lidClosedQuat = new THREE.Quaternion(); // identity = closed (for v2 export)
        state.lidAnimT = 1; // start open

        console.info('[lid] v2 direct lid animation: open -> identity on capsule_lid');
      } else {

      const getBoneQuatTrack = (clip) => {
        if (!clip || !Array.isArray(clip.tracks)) return null;
        return (
          clip.tracks.find((t) =>
            typeof t?.name === 'string' &&
            t.name.endsWith('.quaternion') &&
            t.name.includes('Bone_00') &&
            !!t?.values &&
            t.values.length >= 4
          ) || null
        );
      };

      const qFromTrackIndex = (track, index) => {
        const v = track?.values;
        if (!v || v.length < 4) return null;

        const maxIndex = Math.floor(v.length / 4) - 1;
        const idx = Math.max(0, Math.min(maxIndex, Math.floor(index)));
        const i = idx * 4;
        return new THREE.Quaternion(v[i], v[i + 1], v[i + 2], v[i + 3]).normalize();
      };

      const openClip =
        clips.find((c) => /ArmatureAction$/.test(c.name || '')) ||
        clips.find((c) => !(c.name || '').includes('Action.00')) ||
        clips[0];

      const motionClip =
        clips.find((c) => (c.name || '').includes('Action.001')) ||
        clips.find((c) => (c.name || '').includes('Action.002')) ||
        clips[0];

      const openTrack = getBoneQuatTrack(openClip);
      const motionTrack = getBoneQuatTrack(motionClip);

      const openFromClip = qFromTrackIndex(openTrack, (openTrack?.values?.length || 0) / 4 - 1);
      const openFromMotionLast = qFromTrackIndex(motionTrack, (motionTrack?.values?.length || 0) / 4 - 1);
      const closedFromMotionFirst = qFromTrackIndex(motionTrack, 0);

      state.lidBoneOpenQuat = openFromClip || openFromMotionLast || boneNode.quaternion.clone();
      boneNode.quaternion.copy(state.lidBoneOpenQuat);

      let closedQuat = closedFromMotionFirst || null;
      const clipDeltaRad = closedQuat ? state.lidBoneOpenQuat.angleTo(closedQuat) : 0;
      const clipDeltaDeg = THREE.MathUtils.radToDeg(clipDeltaRad);
      const clipIsUsable = !!closedQuat && clipDeltaDeg >= 20 && clipDeltaDeg <= 160;

      if (clipIsUsable) {
        // Great: use real GLB close pose
        state.lidAnimUsesHingeFallback = false;
        state.lidControl = boneNode;
        state.lidOpenQuat = state.lidBoneOpenQuat.clone();
        state.lidClosedQuat = closedQuat.normalize();

        console.info('[lid] Using GLB close pose on Bone_00. clipDeltaDeg=', clipDeltaDeg.toFixed(2));
      } else {
        // Main fix: auto-solve closed pose (instead of guessing synthCloseDeg only)
        state.lidAnimUsesHingeFallback = false;
        state.lidControl = boneNode;
        state.lidOpenQuat = state.lidBoneOpenQuat.clone();

        const autoClosed = autoSolveClosedLidQuat({
          boneNode,
          openQuat: state.lidOpenQuat,
          clipClosedQuat: closedQuat || null,
          angleMinDeg: 30,
          angleMaxDeg: 78,
          angleStepDeg: 1,
        });

        if (autoClosed) {
          state.lidClosedQuat = autoClosed.clone().normalize();
          console.info('[lid] Using auto-solved synthetic close on Bone_00');
        } else {
          // Fallback-of-fallback
          const rawAxis = getRawClipAxisDelta(state.lidOpenQuat, closedQuat || state.lidOpenQuat);
          const hingeAxisLocal = snapDominantAxis(rawAxis);
          const synthCloseDeg = 48;

          const deltaClose = new THREE.Quaternion().setFromAxisAngle(
            hingeAxisLocal,
            THREE.MathUtils.degToRad(synthCloseDeg)
          );

          // Try both orders and choose less drift
          const qA = state.lidOpenQuat.clone().multiply(deltaClose).normalize();
          const qB = deltaClose.clone().multiply(state.lidOpenQuat).normalize();

          const original = boneNode.quaternion.clone();

          boneNode.quaternion.copy(qA);
          state.root?.updateWorldMatrix(true, true);
          let driftA = Infinity;
          {
            const boxes = computeBoxesForCapsule();
            if (boxes) {
              const bc = boxes.baseBox.getCenter(new THREE.Vector3());
              const lc = boxes.lidBox.getCenter(new THREE.Vector3());
              const dx = lc.x - bc.x;
              const dz = lc.z - bc.z;
              driftA = dx * dx + dz * dz;
            }
          }

          boneNode.quaternion.copy(qB);
          state.root?.updateWorldMatrix(true, true);
          let driftB = Infinity;
          {
            const boxes = computeBoxesForCapsule();
            if (boxes) {
              const bc = boxes.baseBox.getCenter(new THREE.Vector3());
              const lc = boxes.lidBox.getCenter(new THREE.Vector3());
              const dx = lc.x - bc.x;
              const dz = lc.z - bc.z;
              driftB = dx * dx + dz * dz;
            }
          }

          boneNode.quaternion.copy(original);
          state.root?.updateWorldMatrix(true, true);

          state.lidClosedQuat = (driftA <= driftB ? qA : qB);
          console.warn(
            '[lid] autoSolve failed, using static fallback synthCloseDeg=',
            synthCloseDeg,
            'axis=',
            hingeAxisLocal.toArray(),
            'order=',
            driftA <= driftB ? 'post' : 'pre'
          );
        }
      }

      state.lidAnimT = 1; // start open
      }
    }

    // Re-center pivot + ground alignment after lid pose is initialized
    normalizeModelPivotAndGround();

    // Camera framing after final pose/pivot
    fitCameraToCapsule();

    // Make capsule look more metallic / futuristic
    enhanceCapsuleAppearance();

    // Optional 3D letter/envelope prop for the seal cinematic
    loadLetterPropModel();

    setupScreenPlaceholders();
    updateDynamicTextures();

    ui.sealBtn.disabled = !state.readyProfile;
    resize();
  },
  undefined,
  (err) => {
    console.error('GLB load error', err);
    alert('Не вдалося завантажити 3D модель. Перевір, що сайт відкритий через локальний сервер або GitHub Pages.');
  }
);


function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function easeInOutCubic(t) {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function easeOutCubic(t) {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

function easeInOutSine(t) {
  const x = clamp01(t);
  return -(Math.cos(Math.PI * x) - 1) / 2;
}

function easeOutQuint(t) {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 5);
}

function easeOutBack(t) {
  const x = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function applyTextureOrientation(tex, kind = 'default') {
  if (!tex) return tex;

  // IMPORTANT: canvases applied to GLTF meshes must use flipY=false (same as glTF textures),
  // otherwise text/icons appear upside-down on screen_* meshes.
  tex.flipY = false;

  tex.center.set(0.5, 0.5);
  tex.rotation = -Math.PI / 2; // GLB screens in this model are UV-rotated 90deg
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1, 1);
  tex.offset.set(0, 0);

  // Lid screen UV in this GLB is mirrored relative to side screens.
  // IMPORTANT: negative repeat requires RepeatWrapping (with Clamp it can sample edge color -> blank screen on some GPUs).
  if (kind === 'lid') {
    // Lid screen UV is opposite to the side screens in this GLB.
    // Use +90deg (instead of the shared -90deg) + Y mirror to keep the lid display upright.
    tex.rotation = Math.PI / 2;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.y = -1;
    tex.offset.y = 1;
  }

  tex.needsUpdate = true;
  return tex;
}

function makeCanvasPack(width, height, painter) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1);

  if (typeof painter === 'function') painter(ctx, width, height, 0);

  tex.needsUpdate = true;
  return { canvas, ctx, tex, width, height };
}

function createScreenMaterial(tex, emissiveHex = 0x0a1320, emissiveIntensity = 0.55) {
  return new THREE.MeshPhysicalMaterial({
    map: tex,
    transparent: true,
    opacity: 1,
    metalness: 0.06,
    roughness: 0.28,
    clearcoat: 0.75,
    clearcoatRoughness: 0.22,
    emissive: new THREE.Color(emissiveHex),
    emissiveIntensity,
  });
}

function ensureScreenFxPack(key, width, height) {
  if (state.screenFx[key]) return state.screenFx[key];
  const pack = makeCanvasPack(width, height);
  applyTextureOrientation(pack.tex, key);
  state.screenFx[key] = pack;
  return pack;
}

function drawScreenGlassBg(ctx, w, h, opts = {}) {
  const {
    radius = 34,
    border = 3,
    glow = 0.18,
    accentA = 'rgba(133,245,255,0.35)',
    accentB = 'rgba(123,134,255,0.20)',
    inner = 'rgba(8,12,18,0.86)',
  } = opts;

  ctx.clearRect(0, 0, w, h);

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, inner);
  bg.addColorStop(0.55, 'rgba(12,18,26,0.92)');
  bg.addColorStop(1, 'rgba(9,13,20,0.9)');
  ctx.fillStyle = bg;
  roundRect(ctx, 6, 6, w - 12, h - 12, radius);
  ctx.fill();

  if (glow > 0) {
    const rg = ctx.createRadialGradient(w * 0.2, h * 0.25, 20, w * 0.35, h * 0.45, Math.max(w, h));
    rg.addColorStop(0, accentA);
    rg.addColorStop(0.45, accentB);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = glow;
    roundRect(ctx, 6, 6, w - 12, h - 12, radius);
    ctx.fillStyle = rg;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = border;
  roundRect(ctx, 6, 6, w - 12, h - 12, radius);
  ctx.stroke();

  ctx.save();
  roundRect(ctx, 8, 8, w - 16, h - 16, radius - 2);
  ctx.clip();
  const shine = ctx.createLinearGradient(0, 0, 0, h * 0.48);
  shine.addColorStop(0, 'rgba(255,255,255,0.22)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, w, h * 0.5);
  ctx.restore();
}

function drawLockGlyph(ctx, x, y, size, progressClosed) {
  const p = clamp01(progressClosed);
  const bodyW = size * 0.78;
  const bodyH = size * 0.62;
  const bodyX = x - bodyW / 2;
  const bodyY = y + size * 0.06;

  const shackleW = size * 0.52;
  const shackleH = size * 0.46;
  const shackleY = y - size * 0.06;
  const openAngle = THREE.MathUtils.degToRad(-42) * (1 - p);
  const lift = (1 - p) * size * 0.06;

  ctx.save();
  ctx.lineWidth = size * 0.08;
  ctx.lineCap = 'round';
  ctx.strokeStyle = p < 0.5 ? 'rgba(111,255,203,0.95)' : 'rgba(170,220,255,0.95)';
  ctx.translate(x, shackleY - lift);
  ctx.rotate(openAngle);
  ctx.beginPath();
  ctx.moveTo(-shackleW / 2, shackleH / 2);
  ctx.quadraticCurveTo(-shackleW / 2, -shackleH / 2, 0, -shackleH / 2);
  ctx.quadraticCurveTo(shackleW / 2, -shackleH / 2, shackleW / 2, shackleH / 2);
  ctx.stroke();
  ctx.restore();

  const bodyGrad = ctx.createLinearGradient(bodyX, bodyY, bodyX + bodyW, bodyY + bodyH);
  bodyGrad.addColorStop(0, p < 0.5 ? 'rgba(20,54,45,0.95)' : 'rgba(16,38,62,0.95)');
  bodyGrad.addColorStop(1, p < 0.5 ? 'rgba(13,31,26,0.95)' : 'rgba(9,24,42,0.95)');
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, bodyX, bodyY, bodyW, bodyH, size * 0.12);
  ctx.fill();

  ctx.strokeStyle = p < 0.5 ? 'rgba(111,255,203,0.45)' : 'rgba(139,211,255,0.5)';
  ctx.lineWidth = size * 0.04;
  roundRect(ctx, bodyX, bodyY, bodyW, bodyH, size * 0.12);
  ctx.stroke();

  ctx.fillStyle = 'rgba(210,246,255,0.9)';
  ctx.beginPath();
  ctx.arc(x, bodyY + bodyH * 0.42, size * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x - size * 0.03, bodyY + bodyH * 0.42, size * 0.06, size * 0.15);
}

function drawLidScreenCanvas(ctx, w, h, time) {
  // LID SCREEN FIX: current lid UVs display text mirrored horizontally,
  // so we pre-flip the canvas once here to make the final screen readable.
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);

  drawScreenGlassBg(ctx, w, h, {
    radius: 44,
    border: 4,
    glow: 0.26,
    accentA: 'rgba(111,228,255,0.48)',
    accentB: 'rgba(123,134,255,0.28)',
    inner: 'rgba(7,11,17,0.92)',
  });

  const closeP = 1 - clamp01(state.lidAnimT);
  const sealP = state.sealAnimPlaying ? closeP : (state.sealed ? 1 : 0);
  const x = w * 0.22;
  const y = h * 0.5;
  drawLockGlyph(ctx, x, y, h * 0.55, sealP);

  const status = state.sealed ? 'SEALED' : (state.sealAnimPlaying ? 'LOCKING…' : 'UNLOCKED');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  const titleGrad = ctx.createLinearGradient(w * 0.36, 0, w * 0.92, 0);
  if (state.sealed) {
    titleGrad.addColorStop(0, '#d7f2ff');
    titleGrad.addColorStop(1, '#8ad5ff');
  } else {
    titleGrad.addColorStop(0, '#c8ffea');
    titleGrad.addColorStop(1, '#83ffd0');
  }
  ctx.fillStyle = titleGrad;
  ctx.font = '800 60px Inter, sans-serif';
  ctx.fillText(status, w * 0.36, h * 0.42);

  ctx.font = '600 24px Inter, sans-serif';
  ctx.fillStyle = 'rgba(211,233,255,0.72)';
  ctx.fillText('TGE CAPSULE SECURITY', w * 0.36, h * 0.62);

  const barX = w * 0.36, barY = h * 0.73, barW = w * 0.5, barH = 26;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(ctx, barX, barY, barW, barH, 13);
  ctx.fill();

  const fillP = state.sealed ? 1 : (state.sealAnimPlaying ? easeOutCubic(closeP) : 0.18 + Math.sin(time * 2.3) * 0.03);
  const fillGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
  fillGrad.addColorStop(0, state.sealed ? 'rgba(120,214,255,0.95)' : 'rgba(111,255,203,0.95)');
  fillGrad.addColorStop(1, 'rgba(125,136,255,0.9)');
  ctx.fillStyle = fillGrad;
  roundRect(ctx, barX + 2, barY + 2, Math.max(10, (barW - 4) * clamp01(fillP)), barH - 4, 11);
  ctx.fill();

  const sweepX = ((time * 180) % (barW + 120)) - 60;
  ctx.save();
  roundRect(ctx, barX + 2, barY + 2, barW - 4, barH - 4, 11);
  ctx.clip();
  const sweep = ctx.createLinearGradient(barX + sweepX - 40, barY, barX + sweepX + 40, barY);
  sweep.addColorStop(0, 'rgba(255,255,255,0)');
  sweep.addColorStop(0.5, 'rgba(255,255,255,0.38)');
  sweep.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sweep;
  ctx.fillRect(barX, barY, barW, barH);
  ctx.restore();

  // restore pre-flip wrapper
  ctx.restore();
}

function drawNameScreenCanvas(ctx, w, h, time) {
  const nick = (state.nickname || 'PLAYER').slice(0, 24);

  drawScreenGlassBg(ctx, w, h, {
    radius: 36,
    border: 3,
    glow: 0.16,
    accentA: 'rgba(130,220,255,0.3)',
    accentB: 'rgba(123,134,255,0.2)',
    inner: 'rgba(10,14,22,0.92)',
  });

  ctx.save();
  roundRect(ctx, 8, 8, w - 16, h - 16, 32);
  ctx.clip();

  for (let i = 0; i < 9; i++) {
    const yy = ((time * 42 + i * 40) % (h + 80)) - 40;
    const g = ctx.createLinearGradient(0, yy, 0, yy + 24);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(120,210,255,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, yy, w, 24);
  }

  const sweepX = ((time * 240) % (w + 240)) - 120;
  const sweep = ctx.createLinearGradient(sweepX - 100, 0, sweepX + 100, 0);
  sweep.addColorStop(0, 'rgba(255,255,255,0)');
  sweep.addColorStop(0.5, 'rgba(170,235,255,0.18)');
  sweep.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sweep;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let size = 92;
  if (nick.length > 14) size = 72;
  if (nick.length > 18) size = 58;

  const pulse = 0.92 + Math.sin(time * 3.8) * 0.04;
  const nameGrad = ctx.createLinearGradient(0, 0, w, 0);
  nameGrad.addColorStop(0, '#e8f8ff');
  nameGrad.addColorStop(0.45, '#b8eeff');
  nameGrad.addColorStop(1, '#9aaeff');

  ctx.shadowColor = 'rgba(118,220,255,0.35)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = nameGrad;
  ctx.font = `800 ${Math.round(size * pulse)}px Inter, sans-serif`;
  ctx.fillText(nick, w / 2, h * 0.54);

  ctx.shadowBlur = 0;
  ctx.font = '600 18px Inter, sans-serif';
  ctx.fillStyle = 'rgba(197,221,255,0.56)';
  ctx.fillText('IDENTITY LINKED', w / 2, h * 0.2);
}

function drawAvatarScreenCanvas(ctx, w, h, time) {
  drawScreenGlassBg(ctx, w, h, {
    radius: 56,
    border: 3,
    glow: 0.2,
    accentA: 'rgba(111,228,255,0.26)',
    accentB: 'rgba(123,134,255,0.18)',
    inner: 'rgba(10,14,22,0.94)',
  });

  const pad = 48;
  const innerX = pad;
  const innerY = pad;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  const borderPulse = 0.65 + Math.sin(time * 4.5) * 0.18;
  ctx.strokeStyle = `rgba(140,220,255,${(0.16 + borderPulse * 0.28).toFixed(3)})`;
  ctx.lineWidth = 4;
  roundRect(ctx, innerX, innerY, innerW, innerH, 44);
  ctx.stroke();

  roundRect(ctx, innerX, innerY, innerW, innerH, 44);
  ctx.save();
  ctx.clip();

  const img = state.avatarImgEl;
  if (img && state.avatarImgLoaded) {
    const floatX = Math.sin(time * 1.6) * 7;
    const floatY = Math.cos(time * 1.9) * 6;
    const scale = Math.max(innerW / img.width, innerH / img.height) * (1.03 + Math.sin(time * 1.4) * 0.01);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = innerX + (innerW - dw) / 2 + floatX;
    const dy = innerY + (innerH - dh) / 2 + floatY;
    ctx.drawImage(img, dx, dy, dw, dh);
  } else {
    const ph = ctx.createLinearGradient(innerX, innerY, innerX + innerW, innerY + innerH);
    ph.addColorStop(0, 'rgba(28,38,56,0.95)');
    ph.addColorStop(1, 'rgba(14,20,30,0.95)');
    ctx.fillStyle = ph;
    ctx.fillRect(innerX, innerY, innerW, innerH);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 30px Inter, sans-serif';
    ctx.fillStyle = 'rgba(200,220,255,0.7)';
    ctx.fillText('AVATAR', w / 2, h / 2);
  }

  const sweepY = ((time * 180) % (innerH + 160)) - 80;
  const sg = ctx.createLinearGradient(0, innerY + sweepY - 40, 0, innerY + sweepY + 40);
  sg.addColorStop(0, 'rgba(255,255,255,0)');
  sg.addColorStop(0.5, 'rgba(170,232,255,0.16)');
  sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(innerX, innerY, innerW, innerH);
  ctx.restore();

  ctx.strokeStyle = 'rgba(165,236,255,0.55)';
  ctx.lineWidth = 5;
  const c = 26;
  const corners = [
    [innerX + 10, innerY + 10, 1, 1],
    [innerX + innerW - 10, innerY + 10, -1, 1],
    [innerX + 10, innerY + innerH - 10, 1, -1],
    [innerX + innerW - 10, innerY + innerH - 10, -1, -1],
  ];
  for (const [cx, cy, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + sy * c);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + sx * c, cy);
    ctx.stroke();
  }
}

function renderDynamicScreens(force = false) {
  const hasAny = state.screens.lid || state.screens.name || state.screens.avatar;
  if (!hasAny) return;

  const now = performance.now() * 0.001;
  if (!force && (now - state.lastScreenFxDraw) < (1 / 30)) return;
  state.lastScreenFxDraw = now;

  if (state.screens.lid?.isMesh) {
    const pack = ensureScreenFxPack('lid', 1024, 512);
    drawLidScreenCanvas(pack.ctx, pack.width, pack.height, now);
    pack.tex.needsUpdate = true;
    if (!(state.screens.lid.material && state.screens.lid.material.map === pack.tex)) {
      state.screens.lid.material = createScreenMaterial(pack.tex, 0x071a19, 0.75);
    }
    state.screens.lid.material.emissiveIntensity = state.sealed ? 0.9 : 0.72;
  }

  if (state.screens.name?.isMesh) {
    const pack = ensureScreenFxPack('name', 1024, 384);
    drawNameScreenCanvas(pack.ctx, pack.width, pack.height, now);
    pack.tex.needsUpdate = true;
    if (!(state.screens.name.material && state.screens.name.material.map === pack.tex)) {
      state.screens.name.material = createScreenMaterial(pack.tex, 0x0a1220, 0.65);
    }
    state.screens.name.material.emissiveIntensity = 0.58 + Math.sin(now * 3.7) * 0.06;
  }

  if (state.screens.avatar?.isMesh) {
    const pack = ensureScreenFxPack('avatar', 768, 768);
    drawAvatarScreenCanvas(pack.ctx, pack.width, pack.height, now);
    pack.tex.needsUpdate = true;
    if (!(state.screens.avatar.material && state.screens.avatar.material.map === pack.tex)) {
      state.screens.avatar.material = createScreenMaterial(pack.tex, 0x091523, 0.62);
    }
    state.screens.avatar.material.emissiveIntensity = 0.55 + Math.sin(now * 3.1 + 0.8) * 0.05;
  }
}

function prepareAvatarImageForScreens() {
  if (!state.avatarDataUrl) {
    state.avatarImgEl = null;
    state.avatarImgLoaded = false;
    return;
  }
  const img = new Image();
  img.onload = () => {
    state.avatarImgEl = img;
    state.avatarImgLoaded = true;
    renderDynamicScreens(true);
  };
  img.onerror = () => {
    state.avatarImgEl = null;
    state.avatarImgLoaded = false;
  };
  img.src = state.avatarDataUrl;
}

function makeEdgeGlowForMesh(mesh) {
  if (!mesh?.isMesh || !mesh.geometry) return;
  if (mesh.userData.__edgeGlowAdded) return;
  mesh.userData.__edgeGlowAdded = true;
  try {
    const edgeGeo = new THREE.EdgesGeometry(mesh.geometry, 34);
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x84d8ff,
      transparent: true,
      opacity: 0.22,
    });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    edges.name = `${mesh.name || 'mesh'}__edgeglow`;
    edges.renderOrder = 3;
    mesh.add(edges);
  } catch (e) {
    console.warn('edge glow failed for mesh', mesh.name, e);
  }
}

function enhanceCapsuleAppearance() {
  const roots = [state.capsuleBase, state.capsuleLid].filter(Boolean);
  const seen = new Set();

  roots.forEach((rootObj) => {
    rootObj.traverse((obj) => {
      if (!obj?.isMesh || seen.has(obj)) return;
      seen.add(obj);

      const n = (obj.name || '').toLowerCase();
      if (n.includes('screen_')) return;

      const orig = obj.material;
      if (!orig) return;
      const mats = Array.isArray(orig) ? orig : [orig];
      const converted = mats.map((m) => {
        if (!m || m.userData?.__enhancedCapsuleMat) return m;
        const hasTexture = !!m.map;
        const baseColor = m.color ? m.color.clone() : new THREE.Color(0xffffff);
        const luminance = (baseColor.r + baseColor.g + baseColor.b) / 3;
        const isDarkDecal = hasTexture && luminance < 0.2;

        if (isDarkDecal) {
          const mm = m.clone();
          if ('roughness' in mm) mm.roughness = 0.65;
          if ('metalness' in mm) mm.metalness = 0.02;
          mm.userData.__enhancedCapsuleMat = true;
          return mm;
        }

        const pm = new THREE.MeshPhysicalMaterial({
          color: baseColor,
          map: m.map || null,
          normalMap: m.normalMap || null,
          roughnessMap: m.roughnessMap || null,
          metalnessMap: m.metalnessMap || null,
          aoMap: m.aoMap || null,
          emissiveMap: m.emissiveMap || null,
          transparent: !!m.transparent,
          opacity: m.opacity ?? 1,
          side: m.side ?? THREE.FrontSide,
          depthWrite: m.depthWrite ?? true,
          depthTest: m.depthTest ?? true,
          metalness: hasTexture ? 0.58 : 0.78,
          roughness: hasTexture ? 0.38 : 0.24,
          clearcoat: 0.75,
          clearcoatRoughness: 0.18,
          sheen: 0.2,
          sheenColor: new THREE.Color(0x8fd4ff),
          emissive: new THREE.Color(0x050a12),
          emissiveIntensity: 0.12,
        });

        if (pm.map) pm.map.colorSpace = THREE.SRGBColorSpace;
        pm.userData.__enhancedCapsuleMat = true;
        return pm;
      });

      obj.material = Array.isArray(orig) ? converted : converted[0];
      if (!n.includes('plane')) makeEdgeGlowForMesh(obj);
    });
  });
}

// ---------- Dynamic textures ----------
function makeCanvasTexture(width, height, painter, kind = 'default') {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  painter(ctx, width, height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  applyTextureOrientation(tex, kind);
  tex.needsUpdate = true;
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function placeholderMaterial(label) {
  const tex = makeCanvasTexture(1024, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, 8, 8, w - 16, h - 16, 40);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '600 44px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, w / 2, h / 2);
  });

  return new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    opacity: 0.9,
    metalness: 0,
    roughness: 0.45,
    emissive: new THREE.Color(0x111827),
    emissiveIntensity: 0.3,
  });
}

function setupScreenPlaceholders() {
  if (state.screens.lid?.isMesh) {
    state.screens.lid.material = placeholderMaterial('LOCK');
  }
  if (state.screens.name?.isMesh) {
    state.screens.name.material = placeholderMaterial('NAME');
  }
  if (state.screens.avatar?.isMesh) {
    state.screens.avatar.material = placeholderMaterial('AVATAR');
  }

  ['lid','name','avatar'].forEach((k) => {
    const m = state.screens[k]?.material;
    if (m?.map) applyTextureOrientation(m.map, k);
  });
}

function updateDynamicTextures() {
  if (state.avatarDataUrl && (!state.avatarImgEl || !state.avatarImgLoaded)) {
    prepareAvatarImageForScreens();
  }
  renderDynamicScreens(true);
}

// ---------- UI logic ----------
function validateIntroForm() {
  const nick = ui.nicknameInput.value.trim();
  const file = ui.avatarInput.files?.[0];
  ui.startBtn.disabled = !(nick.length > 0 && !!file);
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function slugify(v) {
  return String(v)
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'user';
}

ui.nicknameInput.addEventListener('input', () => {
  validateIntroForm();
  ui.statusNick.textContent = ui.nicknameInput.value.trim() || '—';
});

ui.avatarInput.addEventListener('change', async () => {
  validateIntroForm();

  const file = ui.avatarInput.files?.[0];
  if (!file) return;

  const allowed = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowed.includes(file.type)) {
    alert('Дозволені тільки PNG/JPG/WEBP');
    ui.avatarInput.value = '';
    validateIntroForm();
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert('Файл завеликий. Максимум 5MB');
    ui.avatarInput.value = '';
    validateIntroForm();
    return;
  }

  try {
    const dataUrl = await fileToDataURL(file);
    state.avatarDataUrl = dataUrl;
    prepareAvatarImageForScreens();

    ui.avatarPreview.innerHTML = '';
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = 'Avatar preview';
    ui.avatarPreview.appendChild(img);

    ui.statusAvatar.textContent = 'OK';
  } catch (err) {
    console.error('Avatar read error', err);
    alert('Не вдалося прочитати аватар');
  }
});

ui.introForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const nick = ui.nicknameInput.value.trim();
  const pickedFile = ui.avatarInput.files?.[0] || null;

  if (!nick || (!state.avatarDataUrl && !pickedFile)) {
    alert('Введи нік і додай аватар 🫡');
    return;
  }

  if (!state.avatarDataUrl && pickedFile) {
    try {
      const typeOk = ['image/png', 'image/jpeg', 'image/webp'].includes(pickedFile.type);
      if (!typeOk) {
        alert('Аватар має бути PNG / JPG / WEBP');
        return;
      }
      if (pickedFile.size > 5 * 1024 * 1024) {
        alert('Файл завеликий (макс 5MB)');
        return;
      }

      const dataUrl = await fileToDataURL(pickedFile);
      state.avatarDataUrl = dataUrl;
      prepareAvatarImageForScreens();

      ui.avatarPreview.innerHTML = '';
      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = 'Avatar preview';
      ui.avatarPreview.appendChild(img);

      ui.statusAvatar.textContent = 'OK';
    } catch (err) {
      console.error('Avatar fallback read error', err);
      alert('Не вдалося прочитати аватар. Спробуй інший PNG/JPG/WebP');
      return;
    }
  }

  state.nickname = nick;
  state.readyProfile = true;

  ui.profileMiniNick.textContent = nick;
  ui.profileMiniAvatar.src = state.avatarDataUrl;
  ui.profileMini.classList.remove('hidden');

  ui.introModal.classList.remove('is-open');
  ui.sealBtn.disabled = false;

  ui.statusNick.textContent = nick;
  ui.statusAvatar.textContent = 'OK';

  updateDynamicTextures();
});

ui.messageInput.addEventListener('input', () => {
  state.message = ui.messageInput.value;
  ui.charCount.textContent = `${state.message.length} / 300`;
  ui.statusText.textContent = `${state.message.length} / 300`;
});

ui.sealBtn.addEventListener('click', () => {
  if (!state.readyProfile || state.sealed || state.sealAnimPlaying) return;

  state.sealAnimPlaying = true;
  ui.sealBtn.disabled = true;
  ui.statusSeal.textContent = 'Sealing...';

  animateSealSequence();
});

ui.downloadBtn.addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = renderer.domElement.toDataURL('image/png');
  a.download = `time-capsule-${slugify(state.nickname || 'user')}.png`;
  a.click();
});

// ---------- Seal animation ----------
function animateSealSequence() {
  const start = performance.now();
  const duration = state.letterPropReady ? 7000 : 3800; // smoother, longer cinematic when letter flight is enabled

  // Keep final pose the same as before, but add a full 360° spin on top.
  const finalPoseDelta = 0; // stop facing front after full 360 spin
  state.sealSpinTargetDelta = Math.PI * 2 + finalPoseDelta;
  state.sealSpinCommitted = false;

  // Prevent user camera drag from visually "breaking" the cinematic sealing motion.
  controls.enabled = false;

  function step(now) {
    const t = clamp01((now - start) / duration);

    // 1) Letter appears from the right and drops into the capsule before the lid closes
    if (state.letterPropReady) {
      updateLetterSealFlight(t);
    }

    // 2) Lid closes after the letter has entered
    const lidStart = state.letterPropReady ? 0.58 : 0.00;
    const lidEnd = state.letterPropReady ? 0.97 : 0.84;
    const lidPhase = clamp01((t - lidStart) / Math.max(1e-4, (lidEnd - lidStart)));
    state.lidAnimT = 1 - easeInOutCubic(lidPhase);

    // 3) Spin starts slightly after lid motion begins (cinematic feel)
    const spinStart = state.letterPropReady ? 0.64 : 0.02;
    const spinPhase = clamp01((t - spinStart) / Math.max(1e-4, (1 - spinStart)));
    state.spinAngle = state.sealSpinTargetDelta * easeInOutCubic(spinPhase);

    renderDynamicScreens();

    if (t < 1) {
      requestAnimationFrame(step);
      return;
    }

    // Finalize state
    state.lidAnimT = 0;
    state.rootBaseRotY += state.sealSpinTargetDelta;
    state.spinAngle = 0;

    if (state.letterProp) {
      state.letterProp.visible = false;
      state.letterProp.scale.setScalar(1);
    }

    state.sealed = true;
    state.sealAnimPlaying = false;

    controls.enabled = true;
    ui.statusSeal.textContent = 'Sealed';
    ui.sealedOverlay.classList.remove('hidden');
    ui.downloadBtn.classList.remove('hidden');
    ui.messageInput.disabled = true;

    updateDynamicTextures();
  }

  requestAnimationFrame(step);
}

// ---------- Render loop ----------
const clock = new THREE.Clock();
const _qTmp = new THREE.Quaternion();

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);

  // 1) Reset lid bone to exported open pose every frame
  //    then apply interpolated lid quaternion to the selected control.
  if (state.lidBone && state.lidBoneOpenQuat) {
    state.lidBone.quaternion.copy(state.lidBoneOpenQuat);
  }

  if (state.lidControl && state.lidClosedQuat && state.lidOpenQuat) {
    _qTmp.copy(state.lidClosedQuat).slerp(state.lidOpenQuat, state.lidAnimT);
    state.lidControl.quaternion.copy(_qTmp);
  }

  // 2) Keep root fixed in place and only apply absolute spin offset during seal
  if (state.root) {
    state.root.position.y = state.rootBaseY;

    if (state.sealAnimPlaying) {
      state.root.rotation.y = state.rootBaseRotY + state.spinAngle;
    } else {
      state.root.rotation.y = state.rootBaseRotY;
    }
  }

  // Dynamic electronic screens (lock/name/avatar)
  if (state.readyProfile || state.sealAnimPlaying || state.sealed) {
    renderDynamicScreens();
  }

  // Gentle idle pulse while box is open
  const tNow = clock.elapsedTime;
  if (!state.sealAnimPlaying && !state.sealed) {
    if (state.screens.name?.material) {
      state.screens.name.material.emissiveIntensity = 0.58 + Math.sin(tNow * 2.8) * 0.05;
    }
    if (state.screens.avatar?.material) {
      state.screens.avatar.material.emissiveIntensity = 0.56 + Math.sin(tNow * 2.3 + 0.7) * 0.05;
    }
  }

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

resize();
tick();
