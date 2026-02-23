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
let _capsuleGeomMetricCache = null;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function quantile(sortedArr, q) {
  if (!sortedArr || sortedArr.length === 0) return 0;
  const qq = clamp01(q);
  const idx = (sortedArr.length - 1) * qq;
  const i0 = Math.floor(idx);
  const i1 = Math.min(sortedArr.length - 1, i0 + 1);
  const t = idx - i0;
  return sortedArr[i0] * (1 - t) + sortedArr[i1] * t;
}

function collectSampleParts(rootObj, maxPoints = 1200) {
  const meshes = [];
  let totalVerts = 0;

  rootObj?.traverse?.((obj) => {
    if (!obj?.isMesh || !obj.geometry?.attributes?.position) return;
    const pos = obj.geometry.attributes.position;
    if (!pos || pos.count <= 0) return;
    meshes.push(obj);
    totalVerts += pos.count;
  });

  if (!meshes.length || totalVerts <= 0) return [];

  const stride = Math.max(1, Math.ceil(totalVerts / Math.max(1, maxPoints)));
  const parts = [];

  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position;
    const count = pos.count;
    const arr = [];

    for (let i = 0; i < count; i += stride) {
      arr.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }

    if (!arr.length && count > 0) {
      arr.push(pos.getX(0), pos.getY(0), pos.getZ(0));
    }

    parts.push({
      mesh,
      local: new Float32Array(arr),
    });
  }

  return parts;
}

function transformLocalSamplesToWorld(parts, out = []) {
  out.length = 0;

  for (const part of parts || []) {
    const e = part.mesh.matrixWorld.elements;
    const a = part.local;

    for (let i = 0; i < a.length; i += 3) {
      const x = a[i], y = a[i + 1], z = a[i + 2];
      const wx = e[0] * x + e[4] * y + e[8]  * z + e[12];
      const wy = e[1] * x + e[5] * y + e[9]  * z + e[13];
      const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      out.push(wx, wy, wz);
    }
  }

  return out;
}

function buildCapsuleGeomMetricCache() {
  if (!state.capsuleBase || !state.capsuleLid) return null;

  state.root?.updateWorldMatrix(true, true);

  const baseParts = collectSampleParts(state.capsuleBase, 1400);
  const lidParts = collectSampleParts(state.capsuleLid, 1800);
  if (!baseParts.length || !lidParts.length) return null;

  const baseWorld = transformLocalSamplesToWorld(baseParts, []);
  if (!baseWorld.length) return null;

  const ys = [];
  const xs = [];
  const zs = [];
  for (let i = 0; i < baseWorld.length; i += 3) {
    xs.push(baseWorld[i]);
    ys.push(baseWorld[i + 1]);
    zs.push(baseWorld[i + 2]);
  }

  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  zs.sort((a, b) => a - b);

  const xMin = quantile(xs, 0.03);
  const xMax = quantile(xs, 0.97);
  const zMin = quantile(zs, 0.03);
  const zMax = quantile(zs, 0.97);
  const baseSizeX = Math.max(1e-6, xMax - xMin);
  const baseSizeZ = Math.max(1e-6, zMax - zMin);
  const baseSizeY = Math.max(1e-6, quantile(ys, 0.99) - quantile(ys, 0.01));

  // IMPORTANT: use a trimmed top percentile to ignore hinge pegs / small protrusions.
  const rimY = quantile(ys, 0.955);
  const majorAxis = baseSizeX >= baseSizeZ ? 'x' : 'z';

  return {
    baseParts,
    lidParts,
    baseWorld,
    scratchLidWorld: [],
    xMin,
    xMax,
    zMin,
    zMax,
    baseSizeX,
    baseSizeZ,
    baseSizeY,
    rimY,
    majorAxis,
  };
}

function ensureCapsuleGeomMetricCache() {
  if (_capsuleGeomMetricCache) return _capsuleGeomMetricCache;
  _capsuleGeomMetricCache = buildCapsuleGeomMetricCache();
  return _capsuleGeomMetricCache;
}

function computeSeamMetricsFromSamples() {
  const cache = ensureCapsuleGeomMetricCache();
  if (!cache) return null;

  state.root?.updateWorldMatrix(true, true);
  const lidWorld = transformLocalSamplesToWorld(cache.lidParts, cache.scratchLidWorld);
  if (!lidWorld.length) return null;

  const pad = Math.max(cache.baseSizeX, cache.baseSizeZ) * 0.035;
  const edgeBand = Math.max(0.01, Math.min(cache.baseSizeX, cache.baseSizeZ) * 0.16);
  const x0 = cache.xMin - pad;
  const x1 = cache.xMax + pad;
  const z0 = cache.zMin - pad;
  const z1 = cache.zMax + pad;

  const bins = 10;
  const binCounts = new Array(bins).fill(0);
  const binGapSums = new Array(bins).fill(0);
  const yVals = [];

  const useX = cache.majorAxis === 'x';
  const axisMin = useX ? cache.xMin : cache.zMin;
  const axisMax = useX ? cache.xMax : cache.zMax;
  const axisSpan = Math.max(1e-6, axisMax - axisMin);

  for (let i = 0; i < lidWorld.length; i += 3) {
    const x = lidWorld[i];
    const y = lidWorld[i + 1];
    const z = lidWorld[i + 2];

    if (x < x0 || x > x1 || z < z0 || z > z1) continue;

    // Focus on the perimeter ring (the actual seam), not the whole AABB footprint.
    const dEdge = Math.min(
      Math.abs(x - cache.xMin),
      Math.abs(cache.xMax - x),
      Math.abs(z - cache.zMin),
      Math.abs(cache.zMax - z)
    );
    if (dEdge > edgeBand) continue;

    yVals.push(y);

    const axisVal = useX ? x : z;
    const t = clamp01((axisVal - axisMin) / axisSpan);
    const bi = Math.min(bins - 1, Math.floor(t * bins));
    binCounts[bi] += 1;
    binGapSums[bi] += (y - cache.rimY);
  }

  if (yVals.length < 12) return null;

  yVals.sort((a, b) => a - b);
  const seamY = quantile(yVals, 0.22); // ignore low outliers like hinges/pegs
  const seamLift = Math.max(0, seamY - cache.rimY);
  const seamPenetration = Math.max(0, cache.rimY - seamY);

  let coveredBins = 0;
  let meanGap = 0;
  const gapMeans = [];
  for (let i = 0; i < bins; i++) {
    if (binCounts[i] > 0) {
      coveredBins += 1;
      const g = binGapSums[i] / binCounts[i];
      gapMeans.push(g);
      meanGap += g;
    }
  }
  const coverage = coveredBins / bins;
  meanGap = gapMeans.length ? meanGap / gapMeans.length : 0;
  let gapSpread = 0;
  if (gapMeans.length) {
    for (const g of gapMeans) gapSpread += (g - meanGap) * (g - meanGap);
    gapSpread = Math.sqrt(gapSpread / gapMeans.length);
  }

  return {
    seamY,
    rimY: cache.rimY,
    seamLift,
    seamPenetration,
    coverage,
    gapSpread,
    pointCount: yVals.length,
  };
}

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

        // NOTE: lid center *must* move when a hinged lid closes, so scoring by center X/Z drift
        // (the previous approach) incorrectly preferred half-open poses and caused the “slide back” look.
        const dx = tmpCenterL.x - tmpCenterB.x;
        const dz = tmpCenterL.z - tmpCenterB.z;

        // BBox is kept only as a rough fallback signal.
        // The primary score now comes from seam metrics sampled from real geometry vertices
        // (trimmed perimeter ring), so hinge pegs / AABB inflation don't prematurely stop closure.
        const baseSizeX = Math.max(1e-6, baseBox.max.x - baseBox.min.x);
        const baseSizeZ = Math.max(1e-6, baseBox.max.z - baseBox.min.z);
        const lidSizeX = Math.max(1e-6, lidBox.max.x - lidBox.min.x);
        const lidSizeZ = Math.max(1e-6, lidBox.max.z - lidBox.min.z);
        const xSpanErr = Math.abs(lidSizeX / baseSizeX - 1);
        const zSpanErr = Math.abs(lidSizeZ / baseSizeZ - 1);

        const overlapX = Math.max(0, Math.min(baseBox.max.x, lidBox.max.x) - Math.max(baseBox.min.x, lidBox.min.x));
        const overlapZ = Math.max(0, Math.min(baseBox.max.z, lidBox.max.z) - Math.max(baseBox.min.z, lidBox.min.z));
        const overlapArea = overlapX * overlapZ;
        const baseArea = Math.max(1e-6, baseSizeX * baseSizeZ);
        const lidArea = Math.max(1e-6, lidSizeX * lidSizeZ);
        const overlapBaseRatio = overlapArea / baseArea;
        const overlapLidRatio = overlapArea / lidArea;

        const seam = computeSeamMetricsFromSamples();
        const seamLift = seam ? seam.seamLift : Math.max(0, lidBox.min.y - baseBox.max.y);
        const seamPenetration = seam ? seam.seamPenetration : Math.max(0, baseBox.max.y - lidBox.min.y);
        const seamCoverage = seam ? seam.coverage : Math.min(overlapBaseRatio, overlapLidRatio);
        const seamSpread = seam ? seam.gapSpread : 0;
        const yGap = seam ? Math.abs(seam.seamY - seam.rimY) : Math.abs(lidBox.min.y - baseBox.max.y);

        // Soft prior (avoid weird extremes), but much weaker than actual geometric fit.
        const closeAngleFromOpen = openQuat.angleTo(qCandidate);
        const targetCloseRad = THREE.MathUtils.degToRad(56);

        let score = 0;
        score += seamLift * seamLift * 18000;                                // seam still floating above rim
        score += seamPenetration * seamPenetration * 9000;                    // seam pushed too deep into base
        score += Math.max(0, 0.72 - seamCoverage) ** 2 * 2200;                // seam should cover perimeter along the long edge
        score += seamSpread * seamSpread * 1400;                               // avoid one-side early contact / uneven gap

        // Weak bbox fallback only (no longer primary objective)
        score += (xSpanErr * xSpanErr + zSpanErr * zSpanErr) * 80;
        score += Math.max(0, 0.72 - overlapBaseRatio) ** 2 * 70;
        score += Math.max(0, 0.72 - overlapLidRatio) ** 2 * 70;

        score += Math.abs(closeAngleFromOpen - targetCloseRad) * 0.6;         // weak prior only
        score += (dx * dx + dz * dz) * 1.2;                                    // tiny tie-break only

        // Strong penalty if seam metric couldn't be computed (bad candidate / not enough ring points)
        if (!seam) score += 120;

        // Penalize clearly too-high lid even by bbox (sanity fallback)
        if (lidBox.min.y > baseBox.max.y + 0.10) score += 12;

        // Penalize extreme overshoot
        if (lidBox.min.y < baseBox.max.y - 0.18) score += 10;

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
            seamCoverage,
            seamSpread,
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
      'seamCoverage=', (best.seamCoverage ?? 0).toFixed(3),
      'seamSpread=', (best.seamSpread ?? 0).toFixed(4),
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

    // reset geometry metric cache (depends on actual loaded meshes)
    _capsuleGeomMetricCache = null;

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

      // Geometry validation: some exports have a frame that is not truly closed.
      // Use seam-based sampling first (trimmed perimeter ring), and keep bbox checks only as weak fallback.
      let clipLooksClosedGeom = false;
      if (closedQuat) {
        const prevQuat = boneNode.quaternion.clone();
        boneNode.quaternion.copy(closedQuat.clone().normalize());
        state.root?.updateWorldMatrix(true, true);

        const seam = computeSeamMetricsFromSamples();
        let weakBboxOk = false;
        const boxes = computeBoxesForCapsule();
        if (boxes) {
          const { baseBox, lidBox } = boxes;
          const baseSizeX = Math.max(1e-6, baseBox.max.x - baseBox.min.x);
          const baseSizeZ = Math.max(1e-6, baseBox.max.z - baseBox.min.z);
          const lidSizeX = Math.max(1e-6, lidBox.max.x - lidBox.min.x);
          const lidSizeZ = Math.max(1e-6, lidBox.max.z - lidBox.min.z);
          const xSpanErr = Math.abs(lidSizeX / baseSizeX - 1);
          const zSpanErr = Math.abs(lidSizeZ / baseSizeZ - 1);
          const overlapX = Math.max(0, Math.min(baseBox.max.x, lidBox.max.x) - Math.max(baseBox.min.x, lidBox.min.x));
          const overlapZ = Math.max(0, Math.min(baseBox.max.z, lidBox.max.z) - Math.max(baseBox.min.z, lidBox.min.z));
          const overlapArea = overlapX * overlapZ;
          const baseArea = Math.max(1e-6, baseSizeX * baseSizeZ);
          const lidArea = Math.max(1e-6, lidSizeX * lidSizeZ);
          const overlapBaseRatio = overlapArea / baseArea;
          const overlapLidRatio = overlapArea / lidArea;
          weakBboxOk = (
            xSpanErr <= 0.20 &&
            zSpanErr <= 0.20 &&
            overlapBaseRatio >= 0.62 &&
            overlapLidRatio >= 0.62
          );
        }

        clipLooksClosedGeom = !!(
          seam &&
          seam.seamLift <= 0.035 &&
          seam.seamPenetration <= 0.06 &&
          seam.coverage >= 0.45 &&
          seam.gapSpread <= 0.07 &&
          weakBboxOk
        );

        boneNode.quaternion.copy(prevQuat);
        state.root?.updateWorldMatrix(true, true);
      }

      const clipIsUsable = (
        !!closedQuat &&
        clipDeltaDeg >= 1.5 &&
        clipDeltaDeg <= 160 &&
        clipLooksClosedGeom
      );

      if (clipIsUsable) {
        // Great: use real GLB close pose
        state.lidAnimUsesHingeFallback = false;
        state.lidControl = boneNode;
        state.lidOpenQuat = state.lidBoneOpenQuat.clone();
        state.lidClosedQuat = closedQuat.normalize();

        console.info('[lid] Using GLB close pose on Bone_00. clipDeltaDeg=', clipDeltaDeg.toFixed(2));
      } else {
        if (closedQuat) {
          const seamDbg = computeSeamMetricsFromSamples();
          console.warn('[lid] Rejected GLB close pose (geometry validation failed). clipDeltaDeg=', clipDeltaDeg.toFixed(2), 'seam=', seamDbg);
        }
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
