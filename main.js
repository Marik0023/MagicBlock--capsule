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
  sealedViewBtn: document.getElementById('sealedViewBtn'),
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
  rootBaseRotX: 0,
  rootBaseRotY: 0,
  rootBaseRotZ: 0,
  spinAngle: 0,
  sealProgress: 0,
  screenSurfaces: null,
  screenAnimTime: 0,
  lastScreenPaintAt: 0,
  avatarImg: null,
  avatarImgSrc: '',
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
renderer.toneMappingExposure = 1.02;
ui.viewer.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.6, 0);
controls.minDistance = 1.8;
controls.maxDistance = 7;
controls.enablePan = false;
controls.maxPolarAngle = Math.PI * 0.52;
controls.minPolarAngle = Math.PI * 0.18;

scene.add(new THREE.AmbientLight(0xeaf2ff, 0.68));
const hemiLight = new THREE.HemisphereLight(0x9dd6ff, 0x0a0d14, 0.55);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xbfe7ff, 0.95);
keyLight.position.set(3, 4, 2);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x7f8fff, 0.52);
rimLight.position.set(-3, 2, -3);
scene.add(rimLight);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(2.6, 64),
  new THREE.MeshBasicMaterial({
    color: 0x0c111b,
    transparent: true,
    opacity: 0.55,
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
  state.rootBaseRotX = state.root.rotation.x;
  state.rootBaseRotY = state.root.rotation.y;
  state.rootBaseRotZ = state.root.rotation.z;
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
  './assets/time_capsule_case_v1.glb',
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

    // Re-center pivot + ground alignment after lid pose is initialized
    normalizeModelPivotAndGround();

    // Camera framing after final pose/pivot
    fitCameraToCapsule();

    setupScreenPlaceholders();
    updateDynamicTextures();

    ui.sealBtn.disabled = !state.readyProfile;
    resize();
  },
  undefined,
  (err) => {
    console.error('GLB load error', err);
    alert('Failed to load the 3D model. Make sure the site is opened through a local server or GitHub Pages.');
  }
);

// ---------- Dynamic textures ----------
function makeCanvasTexture(width, height, painter) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  painter(ctx, width, height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
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
    state.screens.lid.material = placeholderMaterial('LID');
  }
  if (state.screens.name?.isMesh) {
    state.screens.name.material = placeholderMaterial('NAME');
  }
  if (state.screens.avatar?.isMesh) {
    state.screens.avatar.material = placeholderMaterial('AVATAR');
  }
}


function setDynamicScreenMaterial(mesh, material) {
  if (!mesh?.isMesh || !material) return;
  const prev = mesh.userData.__dynamicScreenMaterial;
  if (prev && prev !== material) {
    if (prev.map) prev.map.dispose?.();
    prev.dispose?.();
  }
  mesh.material = material;
  mesh.userData.__dynamicScreenMaterial = material;
}

function createDisplayMaterial(width, height, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  try {
    tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy?.() || 1);
  } catch {}

  const mat = new THREE.MeshPhysicalMaterial({
    map: tex,
    transparent: true,
    metalness: 0.02,
    roughness: 0.16,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
    transmission: 0.0,
    ior: 1.45,
    emissive: new THREE.Color(opts.emissive || 0x07131d),
    emissiveIntensity: opts.emissiveIntensity ?? 0.42,
  });

  return { canvas, ctx, tex, mat };
}

function ensureDisplaySurfaces() {
  if (!state.screenSurfaces) state.screenSurfaces = {};

  if (!state.screenSurfaces.lid && state.screens.lid?.isMesh) {
    const s = createDisplayMaterial(1024, 512, { emissive: 0x0a1721, emissiveIntensity: 0.52 });
    state.screenSurfaces.lid = s;
    setDynamicScreenMaterial(state.screens.lid, s.mat);
  }
  if (!state.screenSurfaces.name && state.screens.name?.isMesh) {
    const s = createDisplayMaterial(1024, 384, { emissive: 0x09131b, emissiveIntensity: 0.48 });
    state.screenSurfaces.name = s;
    setDynamicScreenMaterial(state.screens.name, s.mat);
  }
  if (!state.screenSurfaces.avatar && state.screens.avatar?.isMesh) {
    const s = createDisplayMaterial(768, 768, { emissive: 0x09131a, emissiveIntensity: 0.45 });
    state.screenSurfaces.avatar = s;
    setDynamicScreenMaterial(state.screens.avatar, s.mat);
  }
}

function syncAvatarImageCache() {
  if (!state.avatarDataUrl) return;
  if (state.avatarImgSrc === state.avatarDataUrl && state.avatarImg) return;
  state.avatarImgSrc = state.avatarDataUrl;
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    state.avatarImg = img;
    state.lastScreenPaintAt = 0;
    updateDynamicTextures(true);
  };
  img.src = state.avatarDataUrl;
}

function drawDisplayGlassBase(ctx, w, h, t, {
  radius = 34,
  accent = '#67d9ff',
  accent2 = '#8e9eff',
  bgTop = 'rgba(7,12,18,0.95)',
  bgBottom = 'rgba(3,7,12,0.92)',
} = {}) {
  ctx.clearRect(0, 0, w, h);

  // outer shell
  const outerGrad = ctx.createLinearGradient(0, 0, 0, h);
  outerGrad.addColorStop(0, 'rgba(235,246,255,0.10)');
  outerGrad.addColorStop(0.1, 'rgba(255,255,255,0.03)');
  outerGrad.addColorStop(1, 'rgba(0,0,0,0.15)');
  ctx.fillStyle = outerGrad;
  roundRect(ctx, 2, 2, w - 4, h - 4, radius + 6);
  ctx.fill();

  // inner glass panel
  const gx = 8, gy = 8, gw = w - 16, gh = h - 16;
  const glassGrad = ctx.createLinearGradient(0, gy, 0, gy + gh);
  glassGrad.addColorStop(0, bgTop);
  glassGrad.addColorStop(1, bgBottom);
  ctx.fillStyle = glassGrad;
  roundRect(ctx, gx, gy, gw, gh, radius);
  ctx.fill();

  // subtle grid
  ctx.save();
  roundRect(ctx, gx, gy, gw, gh, radius);
  ctx.clip();
  ctx.strokeStyle = 'rgba(110,170,210,0.07)';
  ctx.lineWidth = 1;
  const grid = 28;
  for (let x = gx + 0.5; x < gx + gw; x += grid) {
    ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy + gh); ctx.stroke();
  }
  for (let y = gy + 0.5; y < gy + gh; y += grid) {
    ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx + gw, y); ctx.stroke();
  }

  // scanlines
  for (let y = gy; y < gy + gh; y += 4) {
    ctx.fillStyle = (y / 4) % 2 ? 'rgba(255,255,255,0.012)' : 'rgba(130,190,255,0.015)';
    ctx.fillRect(gx, y, gw, 1);
  }

  // animated sweep glare
  const sweepX = gx - gw * 0.35 + (gw * 1.7) * (0.5 + 0.5 * Math.sin(t * 0.85));
  const sweep = ctx.createLinearGradient(sweepX, gy, sweepX + gw * 0.28, gy + gh);
  sweep.addColorStop(0, 'rgba(255,255,255,0)');
  sweep.addColorStop(0.45, 'rgba(255,255,255,0.02)');
  sweep.addColorStop(0.52, 'rgba(175,232,255,0.14)');
  sweep.addColorStop(0.6, 'rgba(255,255,255,0.04)');
  sweep.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sweep;
  ctx.fillRect(gx, gy, gw, gh);

  // corner accents
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  roundRect(ctx, gx, gy, gw, gh, radius);
  ctx.stroke();

  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.2;
  const c = 18;
  [[gx+10,gy+10,1,1],[gx+gw-10,gy+10,-1,1],[gx+10,gy+gh-10,1,-1],[gx+gw-10,gy+gh-10,-1,-1]].forEach(([cx,cy,sx,sy])=>{
    ctx.beginPath(); ctx.moveTo(cx,cy+sy*c*0.65); ctx.lineTo(cx,cy); ctx.lineTo(cx+sx*c,cy); ctx.stroke();
  });

  // top accent line
  const line = ctx.createLinearGradient(gx, gy, gx+gw, gy);
  line.addColorStop(0, accent);
  line.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  line.addColorStop(1, accent2);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = line;
  ctx.fillRect(gx + 18, gy + 10, gw - 36, 2);
  ctx.globalAlpha = 1;

  ctx.restore();
  return { x: gx, y: gy, w: gw, h: gh };
}

function drawLockIcon(ctx, x, y, size, { locked = false, pulse = 0 }) {
  ctx.save();
  ctx.translate(x, y);
  const bodyW = size * 0.7;
  const bodyH = size * 0.5;
  const shackleW = size * 0.5;
  const shackleH = size * 0.42;
  const openOffset = locked ? 0 : size * 0.16;
  const glowAlpha = locked ? 0.16 : 0.22 + pulse * 0.08;

  ctx.shadowColor = locked ? 'rgba(102,224,163,0.55)' : 'rgba(90,199,255,0.65)';
  ctx.shadowBlur = 18 + pulse * 8;

  // shackle
  ctx.strokeStyle = locked ? 'rgba(146,255,200,0.95)' : 'rgba(127,212,255,0.95)';
  ctx.lineWidth = Math.max(3, size * 0.08);
  ctx.beginPath();
  const shX = -shackleW / 2 + openOffset;
  ctx.moveTo(shX, -bodyH * 0.2);
  ctx.quadraticCurveTo(0 + openOffset, -bodyH * 0.75 - shackleH * 0.1, shX + shackleW, -bodyH * 0.2);
  ctx.stroke();

  // body glow
  ctx.shadowBlur = 0;
  const grad = ctx.createLinearGradient(-bodyW/2, 0, bodyW/2, bodyH);
  grad.addColorStop(0, locked ? 'rgba(26,60,44,0.88)' : 'rgba(12,36,52,0.88)');
  grad.addColorStop(1, locked ? 'rgba(14,30,22,0.95)' : 'rgba(7,18,28,0.95)');
  ctx.fillStyle = grad;
  roundRect(ctx, -bodyW/2, -bodyH/2, bodyW, bodyH, size*0.12);
  ctx.fill();

  ctx.strokeStyle = locked ? `rgba(146,255,200,${0.75 + glowAlpha})` : `rgba(123,214,255,${0.78 + glowAlpha})`;
  ctx.lineWidth = 2;
  roundRect(ctx, -bodyW/2, -bodyH/2, bodyW, bodyH, size*0.12);
  ctx.stroke();

  // key hole / center dot
  ctx.fillStyle = locked ? 'rgba(172,255,214,0.95)' : 'rgba(196,239,255,0.92)';
  ctx.beginPath();
  ctx.arc(0, -bodyH * 0.04, size * 0.055, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.85;
  ctx.fillRect(-size*0.02, 0, size*0.04, size*0.13);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawTinyTelemetry(ctx, x, y, w, t, colorA = '#62d6ff') {
  ctx.save();
  ctx.translate(x, y);
  for (let i = 0; i < 8; i++) {
    const val = 0.25 + 0.75 * Math.abs(Math.sin(t * 1.4 + i * 0.65));
    ctx.fillStyle = `rgba(${i%2?120:98}, ${i%2?223:214}, 255, ${0.14 + val * 0.35})`;
    ctx.fillRect(i * (w / 8), 0, (w / 8) - 4, 8 + val * 14);
  }
  ctx.restore();
}

function paintLidDisplay(surface, t) {
  const { ctx, canvas, tex } = surface;
  const w = canvas.width, h = canvas.height;
  const panel = drawDisplayGlassBase(ctx, w, h, t, { radius: 38, accent: '#5ed6ff', accent2: '#8f98ff' });

  const cx = w * 0.17;
  const cy = h * 0.53;
  const lockingPulse = state.sealAnimPlaying ? Math.abs(Math.sin(t * 9.5)) : Math.abs(Math.sin(t * 2.5));
  const locked = !!state.sealed || (state.sealAnimPlaying && state.sealProgress > 0.72);
  drawLockIcon(ctx, cx, cy, 108, { locked, pulse: lockingPulse });

  const mode = state.sealAnimPlaying ? 'LOCKING SEQUENCE' : (state.sealed ? 'CAPSULE SEALED' : 'CAPSULE OPEN');
  const sub = state.sealAnimPlaying
    ? `${Math.round((state.sealProgress || 0) * 100)}% · SECURE LINK`
    : (state.sealed ? 'TGE TIMELOCK ACTIVE' : 'WAITING FOR SEAL COMMAND');

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(215,239,255,0.98)';
  ctx.font = '700 44px Inter';
  ctx.fillText(mode, w * 0.29, h * 0.43);

  ctx.fillStyle = state.sealed ? 'rgba(162,255,206,0.95)' : 'rgba(112,223,255,0.9)';
  ctx.font = '600 24px Inter';
  ctx.fillText(sub, w * 0.29, h * 0.53);

  // telemetry rows
  ctx.fillStyle = 'rgba(198,234,255,0.7)';
  ctx.font = '600 18px Inter';
  ctx.fillText('LOCK STATUS', w * 0.29, h * 0.69);
  ctx.fillText('ACCESS', w * 0.29, h * 0.78);
  ctx.fillStyle = state.sealed ? 'rgba(162,255,206,0.95)' : 'rgba(112,223,255,0.92)';
  ctx.fillText(state.sealed ? 'SEALED' : (state.sealAnimPlaying ? 'TRANSITION' : 'OPEN'), w * 0.53, h * 0.69);
  ctx.fillText(state.readyProfile ? 'AUTHORIZED' : 'PENDING PROFILE', w * 0.53, h * 0.78);

  const barX = panel.x + panel.w - 220;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(ctx, barX, panel.y + 44, 166, 14, 7); ctx.fill();
  const p = state.sealed ? 1 : (state.sealAnimPlaying ? state.sealProgress : 0.08);
  const barGrad = ctx.createLinearGradient(barX, 0, barX + 166, 0);
  barGrad.addColorStop(0, '#59d2ff'); barGrad.addColorStop(1, state.sealed ? '#7bffbf' : '#9ea5ff');
  ctx.fillStyle = barGrad;
  roundRect(ctx, barX, panel.y + 44, 166 * p, 14, 7); ctx.fill();

  // blinking status dot
  const blinkOn = Math.sin(t * (state.sealAnimPlaying ? 12 : 4)) > -0.15;
  ctx.fillStyle = blinkOn ? (state.sealed ? 'rgba(130,255,182,0.95)' : 'rgba(90,210,255,0.95)') : 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.arc(w - 48, 44, 7, 0, Math.PI * 2); ctx.fill();

  tex.needsUpdate = true;
}

function paintNameDisplay(surface, t) {
  const { ctx, canvas, tex } = surface;
  const w = canvas.width, h = canvas.height;
  drawDisplayGlassBase(ctx, w, h, t, { radius: 30, accent: '#6be1ff', accent2: '#8f9eff' });

  const nick = (state.nickname || 'PLAYER').slice(0, 24);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = 'rgba(151,218,255,0.85)';
  ctx.font = '700 20px Inter';
  ctx.fillText('USER IDENT', 34, 42);

  ctx.fillStyle = 'rgba(210,241,255,0.95)';
  let size = 90;
  if (nick.length > 14) size = 70;
  if (nick.length > 18) size = 56;
  ctx.font = `800 ${size}px Inter`;

  const g = ctx.createLinearGradient(32, h*0.45, w-32, h*0.45);
  g.addColorStop(0, '#effaff');
  g.addColorStop(0.55, '#bde7ff');
  g.addColorStop(1, '#a3aeff');
  ctx.fillStyle = g;
  ctx.fillText(nick, 34, h * 0.56);

  // lower telemetry line
  ctx.fillStyle = 'rgba(192,224,245,0.7)';
  ctx.font = '600 18px Inter';
  const status = state.sealed ? 'Status: Sealed' : (state.sealAnimPlaying ? 'Status: Locking' : 'Status: Ready');
  ctx.fillText(status, 34, h - 42);

  drawTinyTelemetry(ctx, w - 250, h - 64, 220, t);

  tex.needsUpdate = true;
}

function paintAvatarDisplay(surface, t) {
  const { ctx, canvas, tex } = surface;
  const w = canvas.width, h = canvas.height;
  const panel = drawDisplayGlassBase(ctx, w, h, t, { radius: 46, accent: '#5ee0ff', accent2: '#8da4ff' });

  // header strip
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  roundRect(ctx, panel.x + 20, panel.y + 20, panel.w - 40, 46, 14); ctx.fill();
  ctx.fillStyle = 'rgba(212,242,255,0.88)';
  ctx.font = '700 20px Inter';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('AVATAR FEED', panel.x + 34, panel.y + 44);

  const pulse = 0.5 + 0.5 * Math.sin(t * 2.1);
  ctx.fillStyle = `rgba(124,227,255,${0.35 + pulse * 0.3})`;
  ctx.beginPath(); ctx.arc(panel.x + panel.w - 36, panel.y + 44, 6, 0, Math.PI * 2); ctx.fill();

  const innerPad = 56;
  const ix = innerPad, iy = innerPad + 24, iw = w - innerPad * 2, ih = h - innerPad * 2 - 18;
  roundRect(ctx, ix, iy, iw, ih, 38);
  ctx.save();
  ctx.clip();

  syncAvatarImageCache();
  if (state.avatarImg && state.avatarImg.complete) {
    const img = state.avatarImg;
    const scale = Math.max(iw / img.width, ih / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = ix + (iw - dw) / 2;
    const dy = iy + (ih - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);

    // holographic tint & sweep
    const holo = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih);
    holo.addColorStop(0, 'rgba(78,165,255,0.09)');
    holo.addColorStop(0.5, 'rgba(126,255,246,0.06)');
    holo.addColorStop(1, 'rgba(166,141,255,0.10)');
    ctx.fillStyle = holo; ctx.fillRect(ix, iy, iw, ih);

    const sweepY = iy - 40 + ((ih + 80) * ((Math.sin(t * 0.95) + 1) / 2));
    const sgrad = ctx.createLinearGradient(ix, sweepY - 26, ix, sweepY + 26);
    sgrad.addColorStop(0, 'rgba(255,255,255,0)');
    sgrad.addColorStop(0.45, 'rgba(161,232,255,0.0)');
    sgrad.addColorStop(0.5, 'rgba(161,232,255,0.17)');
    sgrad.addColorStop(0.55, 'rgba(255,255,255,0.02)');
    sgrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sgrad; ctx.fillRect(ix, iy, iw, ih);
  } else {
    const ph = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih);
    ph.addColorStop(0, 'rgba(18,24,34,0.95)');
    ph.addColorStop(1, 'rgba(8,14,22,0.95)');
    ctx.fillStyle = ph; ctx.fillRect(ix, iy, iw, ih);
    ctx.fillStyle = 'rgba(192,224,242,0.65)';
    ctx.font = '700 34px Inter';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NO AVATAR', ix + iw / 2, iy + ih / 2);
  }

  // faint HUD circles
  ctx.strokeStyle = 'rgba(132,222,255,0.12)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(ix + iw * 0.82, iy + ih * 0.2, 36 + i * 18, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();

  ctx.strokeStyle = 'rgba(220,243,255,0.18)';
  ctx.lineWidth = 3;
  roundRect(ctx, ix, iy, iw, ih, 38);
  ctx.stroke();

  tex.needsUpdate = true;
}

function updateDynamicTextures(force = false) {
  const nowMs = performance.now();
  const t = nowMs * 0.001;
  state.screenAnimTime = t;

  if (!force) {
    const minGap = (state.sealAnimPlaying || state.sealed) ? 70 : 150;
    if (nowMs - (state.lastScreenPaintAt || 0) < minGap) return;
  }

  ensureDisplaySurfaces();
  if (state.screenSurfaces?.lid) paintLidDisplay(state.screenSurfaces.lid, t);
  if (state.screenSurfaces?.name) paintNameDisplay(state.screenSurfaces.name, t);
  if (state.screenSurfaces?.avatar) paintAvatarDisplay(state.screenSurfaces.avatar, t);
  state.lastScreenPaintAt = nowMs;
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
    alert('Only PNG/JPG/WEBP files are allowed.');
    ui.avatarInput.value = '';
    validateIntroForm();
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert('File is too large. Maximum size is 5MB.');
    ui.avatarInput.value = '';
    validateIntroForm();
    return;
  }

  try {
    const dataUrl = await fileToDataURL(file);
    state.avatarDataUrl = dataUrl;

    ui.avatarPreview.innerHTML = '';
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = 'Avatar preview';
    ui.avatarPreview.appendChild(img);

    ui.statusAvatar.textContent = 'OK';
  } catch (err) {
    console.error('Avatar read error', err);
    alert('Could not read the avatar file.');
  }
});

ui.introForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const nick = ui.nicknameInput.value.trim();
  const pickedFile = ui.avatarInput.files?.[0] || null;

  if (!nick || (!state.avatarDataUrl && !pickedFile)) {
    alert('Enter a nickname and add an avatar 🫡');
    return;
  }

  if (!state.avatarDataUrl && pickedFile) {
    try {
      const typeOk = ['image/png', 'image/jpeg', 'image/webp'].includes(pickedFile.type);
      if (!typeOk) {
        alert('Avatar must be PNG / JPG / WEBP.');
        return;
      }
      if (pickedFile.size > 5 * 1024 * 1024) {
        alert('File is too large (max 5MB).');
        return;
      }

      const dataUrl = await fileToDataURL(pickedFile);
      state.avatarDataUrl = dataUrl;

      ui.avatarPreview.innerHTML = '';
      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = 'Avatar preview';
      ui.avatarPreview.appendChild(img);

      ui.statusAvatar.textContent = 'OK';
    } catch (err) {
      console.error('Avatar fallback read error', err);
      alert('Could not read the avatar. Try another PNG/JPG/WEBP file.');
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

ui.sealedViewBtn?.addEventListener('click', () => {
  ui.sealedOverlay.classList.add('hidden');
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
  const duration = 2600;
  state.sealProgress = 0;
  updateDynamicTextures(true);

  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    state.sealProgress = t;

    // cubic easeInOut
    const eased = t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;

    // Lid closes during ~72% of timeline
    const lidPhase = Math.min(1, eased / 0.72);
    state.lidAnimT = 1 - lidPhase;

    // Stable absolute spin angle (no rotation accumulation drift)
    state.spinAngle = Math.sin(t * Math.PI) * 0.75;

    updateDynamicTextures();

    if (t < 1) {
      requestAnimationFrame(step);
      return;
    }

    // Final snap
    state.lidAnimT = 0;
    state.spinAngle = 0;
    state.sealed = true;
    state.sealAnimPlaying = false;
    state.sealProgress = 1;

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
    const tSec = clock.elapsedTime;

    if (state.sealAnimPlaying) {
      state.root.position.y = state.rootBaseY;
      state.root.rotation.x = state.rootBaseRotX;
      state.root.rotation.z = state.rootBaseRotZ;
      state.root.rotation.y = state.rootBaseRotY + state.spinAngle;
    } else if (state.sealed) {
      const bob = Math.sin(tSec * 0.95) * 0.012;
      const yaw = Math.sin(tSec * 0.55) * 0.028;
      const roll = Math.sin(tSec * 0.9 + 0.8) * 0.010;
      const pitch = Math.sin(tSec * 0.7 + 1.2) * 0.005;
      state.root.position.y = state.rootBaseY + bob;
      state.root.rotation.x = state.rootBaseRotX + pitch;
      state.root.rotation.y = state.rootBaseRotY + yaw;
      state.root.rotation.z = state.rootBaseRotZ + roll;
    } else {
      state.root.position.y = state.rootBaseY;
      state.root.rotation.x = state.rootBaseRotX;
      state.root.rotation.y = state.rootBaseRotY;
      state.root.rotation.z = state.rootBaseRotZ;
    }
  }

  if (state.readyProfile || state.sealAnimPlaying || state.sealed) {
    updateDynamicTextures();
  }

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

resize();
tick();
