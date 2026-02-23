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
ui.viewer.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.6, 0);
controls.minDistance = 1.8;
controls.maxDistance = 7;
controls.enablePan = false;
controls.maxPolarAngle = Math.PI * 0.52;
controls.minPolarAngle = Math.PI * 0.18;

scene.add(new THREE.AmbientLight(0xffffff, 0.55));

const keyLight = new THREE.DirectionalLight(0xbfe7ff, 1.1);
keyLight.position.set(3, 4, 2);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x6f7cff, 0.6);
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
      // IMPORTANT: this model's authored close pose is only ~11° away from the open pose.
      // The previous 20° threshold wrongly rejected a valid GLB close frame and forced
      // the synthetic auto-solver (30-78°), which caused lid drift / incomplete closure.
      const clipIsUsable = !!closedQuat && clipDeltaDeg >= 1.5 && clipDeltaDeg <= 160;

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
          // Keep fallback search wide enough for other exports, but include small angles too.
          // This particular capsule closes around ~11° in Bone_00 local rotation.
          angleMinDeg: 2,
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
    alert('Не вдалося завантажити 3D модель. Перевір, що сайт відкритий через локальний сервер або GitHub Pages.');
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

function updateDynamicTextures() {
  // LID screen (brand)
  if (state.screens.lid?.isMesh) {
    const tex = makeCanvasTexture(1024, 512, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = 'rgba(8,12,18,0.65)';
      roundRect(ctx, 6, 6, w - 12, h - 12, 40);
      ctx.fill();

      ctx.strokeStyle = 'rgba(90,199,255,0.45)';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.fillStyle = '#cfe8ff';
      ctx.textAlign = 'center';
      ctx.font = '700 44px Inter';
      ctx.fillText('TIME CAPSULE', w / 2, h / 2 - 30);

      ctx.font = '600 26px Inter';
      ctx.fillStyle = 'rgba(207,232,255,0.75)';
      ctx.fillText('TGE EDITION', w / 2, h / 2 + 18);
    });

    state.screens.lid.material = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      metalness: 0,
      roughness: 0.35,
    });
  }

  // Name screen
  if (state.screens.name?.isMesh) {
    const nick = (state.nickname || 'PLAYER').slice(0, 24);

    const tex = makeCanvasTexture(1024, 384, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = 'rgba(12,16,24,0.86)';
      roundRect(ctx, 4, 4, w - 8, h - 8, 36);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 3;
      ctx.stroke();

      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#dff3ff');
      grad.addColorStop(1, '#9db3ff');

      ctx.fillStyle = grad;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      let size = 92;
      if (nick.length > 14) size = 72;
      if (nick.length > 18) size = 58;

      ctx.font = `800 ${size}px Inter`;
      ctx.fillText(nick, w / 2, h / 2 + 4);
    });

    state.screens.name.material = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      metalness: 0,
      roughness: 0.4,
    });
  }

  // Avatar screen
  if (state.screens.avatar?.isMesh) {
    const avatarUrl = state.avatarDataUrl;
    if (!avatarUrl) return;

    const img = new Image();
    img.onload = () => {
      const tex = makeCanvasTexture(768, 768, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);

        ctx.fillStyle = 'rgba(12,16,24,0.86)';
        roundRect(ctx, 6, 6, w - 12, h - 12, 56);
        ctx.fill();

        const pad = 48;
        const innerX = pad;
        const innerY = pad;
        const innerW = w - pad * 2;
        const innerH = h - pad * 2;

        roundRect(ctx, innerX, innerY, innerW, innerH, 44);
        ctx.save();
        ctx.clip();

        const scale = Math.max(innerW / img.width, innerH / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        const dx = innerX + (innerW - dw) / 2;
        const dy = innerY + (innerH - dh) / 2;
        ctx.drawImage(img, dx, dy, dw, dh);

        ctx.restore();

        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 3;
        roundRect(ctx, innerX, innerY, innerW, innerH, 44);
        ctx.stroke();
      });

      state.screens.avatar.material = new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        metalness: 0,
        roughness: 0.45,
      });
    };

    img.src = avatarUrl;
  }
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
  const duration = 2300;

  function step(now) {
    const t = Math.min(1, (now - start) / duration);

    // cubic easeInOut
    const eased = t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;

    // Lid closes during ~72% of timeline
    const lidPhase = Math.min(1, eased / 0.72);
    state.lidAnimT = 1 - lidPhase;

    // Stable absolute spin angle (no rotation accumulation drift)
    state.spinAngle = Math.sin(t * Math.PI) * 0.75;

    if (t < 1) {
      requestAnimationFrame(step);
      return;
    }

    // Final snap
    state.lidAnimT = 0;
    state.spinAngle = 0;
    state.sealed = true;
    state.sealAnimPlaying = false;

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

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

resize();
tick();
