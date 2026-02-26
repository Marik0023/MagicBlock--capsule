import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.1/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.1/examples/jsm/loaders/GLTFLoader.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ui = {
  introModal: document.getElementById('introModal'),
  introForm: document.getElementById('introForm'),
  nicknameInput: document.getElementById('nicknameInput'),
  avatarInput: document.getElementById('avatarInput'),
  avatarFileName: document.getElementById('avatarFileName'),
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
  overlayOkBtn: document.getElementById('overlayOkBtn'),
  statusNick: document.getElementById('statusNick'),
  statusAvatar: document.getElementById('statusAvatar'),
  statusText: document.getElementById('statusText'),
  statusSeal: document.getElementById('statusSeal'),
  capsuleFeedList: document.getElementById('capsuleFeedList'),
  capsuleFeedEmpty: document.getElementById('capsuleFeedEmpty'),
  refreshFeedBtn: document.getElementById('refreshFeedBtn'),
};


// === SCREEN TUNER (debug controls for aligning on-model screens) ===
// Values are normalized: x/y are in screen widths/heights (-0.40..0.40).
const screenTuner = {
  name:   { x: 0.00, y: 0.00, scale: 1.00, stretchX: 1.00, stretchY: 1.00, flipX: false, flipY: false },
  avatar: { x: 0.00, y: 0.00, scale: 0.82, stretchX: 1.00, stretchY: 1.00, flipX: false, flipY: false },
  lid:    { x: 0.00, y: 0.00, scale: 1.00, stretchX: 1.00, stretchY: 1.00, flipX: false, flipY: false },
};

function mountScreenTunerUI() {
  // Don't mount twice
  if (document.getElementById('screenTuner')) return;

  const wrap = document.createElement('div');
  wrap.id = 'screenTuner';
  wrap.style.cssText = `
    position:fixed; top:12px; right:12px; z-index:99999;
    width:280px; padding:10px 10px 8px;
    background:rgba(0,0,0,.58); color:#fff;
    font:12px/1.25 system-ui, -apple-system, Segoe UI, Roboto, Arial;
    border:1px solid rgba(255,255,255,.18); border-radius:12px;
    backdrop-filter: blur(8px);
    user-select:none;
  `;

  const row = (label, id, min, max, step, value) => `
    <label style="display:flex; gap:8px; align-items:center; margin:4px 0;">
      <span style="width:46px; opacity:.9;">${label}</span>
      <input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" style="width:100%;">
    </label>
  `;
  const flipRow = (prefix, label) => `
    <div style="display:flex; gap:10px; align-items:center; margin:2px 0 8px;">
      <span style="width:80px; opacity:.9; font-weight:600;">${label}</span>
      <label style="display:flex; gap:6px; align-items:center; opacity:.9;">
        <input id="${prefix}FlipX" type="checkbox"> Flip X
      </label>
      <label style="display:flex; gap:6px; align-items:center; opacity:.9;">
        <input id="${prefix}FlipY" type="checkbox"> Flip Y
      </label>
    </div>
  `;

  wrap.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
      <div style="font-weight:800;">Screen Tuner</div>
      <button id="stHide" style="border:1px solid rgba(255,255,255,.22); background:rgba(255,255,255,.08); color:#fff; border-radius:10px; padding:6px 10px; cursor:pointer;">Hide</button>
    </div>

    <div style="opacity:.92; font-weight:700; margin:6px 0 4px;">screen_name</div>
    ${row('X', 'nX', -0.40, 0.40, 0.005, 0)}
    ${row('Y', 'nY', -0.40, 0.40, 0.005, 0)}
    ${row('Scale', 'nS', 0.20, 2.00, 0.01, 1.00)}
    ${row('StrX', 'nSX', 0.50, 1.80, 0.01, 1.00)}
    ${row('StrY', 'nSY', 0.50, 1.80, 0.01, 1.00)}
    ${flipRow('n', 'Flip')}
    <div id="nVal" style="opacity:.85; margin:2px 0 8px;"></div>

    <div style="opacity:.92; font-weight:700; margin:6px 0 4px;">screen_avatar</div>
    ${row('X', 'aX', -0.40, 0.40, 0.005, 0)}
    ${row('Y', 'aY', -0.40, 0.40, 0.005, 0)}
    ${row('Scale', 'aS', 0.20, 2.00, 0.01, 0.82)}
    ${row('StrX', 'aSX', 0.50, 1.80, 0.01, 1.00)}
    ${row('StrY', 'aSY', 0.50, 1.80, 0.01, 1.00)}
    ${flipRow('a', 'Flip')}
    <div id="aVal" style="opacity:.85; margin:2px 0 8px;"></div>

    <div style="opacity:.92; font-weight:700; margin:6px 0 4px;">screen_lid</div>
    ${row('X', 'lX', -0.40, 0.40, 0.005, 0)}
    ${row('Y', 'lY', -0.40, 0.40, 0.005, 0)}
    ${row('Scale', 'lS', 0.20, 2.00, 0.01, 1.00)}
    ${row('StrX', 'lSX', 0.50, 1.80, 0.01, 1.00)}
    ${row('StrY', 'lSY', 0.50, 1.80, 0.01, 1.00)}
    ${flipRow('l', 'Flip')}
    <div id="lVal" style="opacity:.85; margin:2px 0 10px;"></div>

    <button id="copyTuners" style="
      width:100%; padding:8px 10px; border-radius:10px;
      border:1px solid rgba(255,255,255,.22);
      background:rgba(255,255,255,.08); color:#fff; cursor:pointer;
    ">Copy values</button>

    <div style="opacity:.6; margin-top:8px;">Tip: press <b>T</b> to toggle panel</div>
  `;

  const $ = (id) => wrap.querySelector(`#${id}`);

  const update = () => {
    screenTuner.name.x = parseFloat($('nX').value);
    screenTuner.name.y = parseFloat($('nY').value);
    screenTuner.name.scale = parseFloat($('nS').value);
    screenTuner.name.stretchX = parseFloat($('nSX').value);
    screenTuner.name.stretchY = parseFloat($('nSY').value);
    screenTuner.name.flipX = $('nFlipX').checked;
    screenTuner.name.flipY = $('nFlipY').checked;

    screenTuner.avatar.x = parseFloat($('aX').value);
    screenTuner.avatar.y = parseFloat($('aY').value);
    screenTuner.avatar.scale = parseFloat($('aS').value);
    screenTuner.avatar.stretchX = parseFloat($('aSX').value);
    screenTuner.avatar.stretchY = parseFloat($('aSY').value);
    screenTuner.avatar.flipX = $('aFlipX').checked;
    screenTuner.avatar.flipY = $('aFlipY').checked;

    screenTuner.lid.x = parseFloat($('lX').value);
    screenTuner.lid.y = parseFloat($('lY').value);
    screenTuner.lid.scale = parseFloat($('lS').value);
    screenTuner.lid.stretchX = parseFloat($('lSX').value);
    screenTuner.lid.stretchY = parseFloat($('lSY').value);
    screenTuner.lid.flipX = $('lFlipX').checked;
    screenTuner.lid.flipY = $('lFlipY').checked;

    $('nVal').textContent =
      `x=${screenTuner.name.x.toFixed(3)}  y=${screenTuner.name.y.toFixed(3)}  s=${screenTuner.name.scale.toFixed(2)}  sx=${screenTuner.name.stretchX.toFixed(2)}  sy=${screenTuner.name.stretchY.toFixed(2)}  flipX=${screenTuner.name.flipX}  flipY=${screenTuner.name.flipY}`;
    $('aVal').textContent =
      `x=${screenTuner.avatar.x.toFixed(3)}  y=${screenTuner.avatar.y.toFixed(3)}  s=${screenTuner.avatar.scale.toFixed(2)}  sx=${screenTuner.avatar.stretchX.toFixed(2)}  sy=${screenTuner.avatar.stretchY.toFixed(2)}  flipX=${screenTuner.avatar.flipX}  flipY=${screenTuner.avatar.flipY}`;
    $('lVal').textContent =
      `x=${screenTuner.lid.x.toFixed(3)}  y=${screenTuner.lid.y.toFixed(3)}  s=${screenTuner.lid.scale.toFixed(2)}  sx=${screenTuner.lid.stretchX.toFixed(2)}  sy=${screenTuner.lid.stretchY.toFixed(2)}  flipX=${screenTuner.lid.flipX}  flipY=${screenTuner.lid.flipY}`;

    // Force redraw next frame
    state.lastScreenFxDraw = 0;
  };

  // seed checkbox defaults
  $('nFlipX').checked = screenTuner.name.flipX;
  $('nFlipY').checked = screenTuner.name.flipY;
  $('aFlipX').checked = screenTuner.avatar.flipX;
  $('aFlipY').checked = screenTuner.avatar.flipY;
  $('lFlipX').checked = screenTuner.lid.flipX;
  $('lFlipY').checked = screenTuner.lid.flipY;

  wrap.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', update));
  wrap.querySelectorAll('input[type="checkbox"]').forEach((inp) => inp.addEventListener('change', update));

  $('copyTuners').addEventListener('click', async () => {
    const text =
`screen_name:  x=${screenTuner.name.x.toFixed(3)}, y=${screenTuner.name.y.toFixed(3)}, scale=${screenTuner.name.scale.toFixed(2)}, stretchX=${screenTuner.name.stretchX.toFixed(2)}, stretchY=${screenTuner.name.stretchY.toFixed(2)}, flipX=${screenTuner.name.flipX}, flipY=${screenTuner.name.flipY}
screen_avatar: x=${screenTuner.avatar.x.toFixed(3)}, y=${screenTuner.avatar.y.toFixed(3)}, scale=${screenTuner.avatar.scale.toFixed(2)}, stretchX=${screenTuner.avatar.stretchX.toFixed(2)}, stretchY=${screenTuner.avatar.stretchY.toFixed(2)}, flipX=${screenTuner.avatar.flipX}, flipY=${screenTuner.avatar.flipY}
screen_lid:    x=${screenTuner.lid.x.toFixed(3)}, y=${screenTuner.lid.y.toFixed(3)}, scale=${screenTuner.lid.scale.toFixed(2)}, stretchX=${screenTuner.lid.stretchX.toFixed(2)}, stretchY=${screenTuner.lid.stretchY.toFixed(2)}, flipX=${screenTuner.lid.flipX}, flipY=${screenTuner.lid.flipY}`;
    try { await navigator.clipboard.writeText(text); } catch {}
    console.log(text);
    alert('Copied (also logged in console).');
  });

  $('stHide').addEventListener('click', () => wrap.remove());

  document.body.appendChild(wrap);
  update();
}

document.addEventListener('keydown', (e) => {
  if (e.key && e.key.toLowerCase() === 't') {
    const ex = document.getElementById('screenTuner');
    if (ex) ex.remove();
    else mountScreenTunerUI();
  }
});



const SUPABASE_URL = 'https://dzamfjphmomvkepirxoh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_S05m0mHe9SnvWeoU9MZmVA_qZl-K6Q8';
const CAPSULE_BUCKET = 'capsule-public';
const CAPSULE_PRIVATE_MESSAGES_TABLE = 'capsule_messages_private';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const state = {
  readyProfile: false,
  sealed: false,
  nickname: '',
  avatarDataUrl: '',
  message: '',
  overlayDismissedOnSealed: false,
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

  // one-way spin during seal (avoid back-and-forth wobble)
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
  letterFlightPathCache: null,

  // prevent duplicate public feed inserts in one session
  _feedSavedOnce: false,
  // cached PNG data URL captured immediately after seal animation
  _sealedPngDataUrl: null,
};

const MIN_MESSAGE_CHARS = 10;
const CAPSULE_STORAGE_KEY = 'magicblock_time_capsule_state_v1';

function getTrimmedMessageLength(value = state.message) {
  return Array.from(String(value || '').trim()).length;
}

function canSealCapsule() {
  return !!(state.readyProfile && !state.sealed && !state.sealAnimPlaying && getTrimmedMessageLength() >= MIN_MESSAGE_CHARS);
}

function updateSealButtonState() {
  if (!ui.sealBtn) return;
  ui.sealBtn.disabled = !canSealCapsule();
}

function setSealedOverlayVisible(visible, { showOk = false, blocking = false } = {}) {
  if (!ui.sealedOverlay) return;
  ui.sealedOverlay.classList.toggle('hidden', !visible);
  ui.sealedOverlay.classList.toggle('is-blocking', !!blocking);

  if (ui.overlayOkBtn) {
    ui.overlayOkBtn.classList.toggle('hidden', !showOk);
  }

  // A-04 FIX: move focus into overlay when blocking so keyboard users can't tab behind it
  if (visible && blocking && showOk && ui.overlayOkBtn) {
    setTimeout(() => ui.overlayOkBtn.focus(), 50);
  }
}

function persistCapsuleState() {
  try {
    const payload = {
      nickname: state.nickname || '',
      avatarDataUrl: state.avatarDataUrl || '',
      message: state.message || '',
      readyProfile: !!state.readyProfile,
      sealed: !!state.sealed,
      overlayDismissedOnSealed: !!state.overlayDismissedOnSealed,
      savedAt: Date.now(),
    };

    try {
      localStorage.setItem(CAPSULE_STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      if ((e && e.name === 'QuotaExceededError') || /quota/i.test(String(e))) {
        payload.avatarDataUrl = '';
        localStorage.setItem(CAPSULE_STORAGE_KEY, JSON.stringify(payload));
        showToast('Avatar too large to save locally — you\'ll need to re-upload on next visit.', 'warning');
      } else {
        throw e;
      }
    }
  } catch (err) {
    console.warn('localStorage persist failed', err);
  }
}

function loadPersistedCapsuleState() {
  try {
    const raw = localStorage.getItem(CAPSULE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      nickname: typeof parsed.nickname === 'string' ? parsed.nickname : '',
      avatarDataUrl: typeof parsed.avatarDataUrl === 'string' ? parsed.avatarDataUrl : '',
      message: typeof parsed.message === 'string' ? parsed.message.slice(0, 300) : '',
      readyProfile: !!parsed.readyProfile,
      sealed: !!parsed.sealed,
      overlayDismissedOnSealed: !!parsed.overlayDismissedOnSealed,
    };
  } catch (err) {
    console.warn('localStorage read failed', err);
    return null;
  }
}

function applyPersistedCapsuleState(saved) {
  if (!saved) return;

  if (saved.nickname) {
    state.nickname = saved.nickname;
    ui.nicknameInput.value = saved.nickname;
    ui.statusNick.textContent = saved.nickname;
    ui.profileMiniNick.textContent = saved.nickname;
  }

  if (saved.avatarDataUrl) {
    state.avatarDataUrl = saved.avatarDataUrl;
    prepareAvatarImageForScreens();

    ui.avatarPreview.innerHTML = '';
    const img = document.createElement('img');
    img.src = saved.avatarDataUrl;
    img.alt = 'Avatar preview';
    ui.avatarPreview.appendChild(img);

    ui.profileMiniAvatar.src = saved.avatarDataUrl;
    ui.profileMini.classList.remove('hidden');
    ui.statusAvatar.textContent = 'OK';
  }

  if (saved.readyProfile || (saved.nickname && saved.avatarDataUrl)) {
    state.readyProfile = true;
    ui.introModal.classList.remove('is-open');
    if (saved.avatarDataUrl) {
      ui.profileMini.classList.remove('hidden');
    }
  }

  if (saved.message) {
    state.message = saved.message;
    // Privacy UX: once sealed, keep the text stored but do not show it again in the textarea.
    ui.messageInput.value = saved.sealed ? '' : saved.message;
    if (saved.sealed) {
      ui.messageInput.placeholder = 'Message sealed';
    }
  }

  state.overlayDismissedOnSealed = !!saved.overlayDismissedOnSealed;

  ui.charCount.textContent = `${Array.from(state.message).length} / 300`;
  ui.statusText.textContent = `${Array.from(state.message).length} / 300`;

  if (saved.sealed) {
    state.sealed = true;
    state.sealAnimPlaying = false;
    ui.messageInput.disabled = true;
    ui.downloadBtn.classList.remove('hidden');
    ui.statusSeal.textContent = 'Sealed';
    if (state.overlayDismissedOnSealed) {
      setSealedOverlayVisible(false);
    } else {
      setSealedOverlayVisible(true, { showOk: true, blocking: true });
    }
    state.lidAnimT = 0;
  }

  updateSealButtonState();
  updateDynamicTextures();
}

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
// A-02 FIX: give the canvas an accessible description
renderer.domElement.setAttribute('aria-label', 'Interactive 3D time capsule — drag to rotate');
renderer.domElement.setAttribute('role', 'img');

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
  const desiredMax = Math.max(0.13, Math.min(capSize.x, capSize.z) * 0.355); // slightly larger for better visibility, still safe for lid/walls

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


function getButtonLaunchWorldPoint(baseCenter, baseBox, allSize) {
  const canvasRect = renderer?.domElement?.getBoundingClientRect?.();
  const btnRect = ui.sealBtn?.getBoundingClientRect?.();

  if (!canvasRect || !btnRect || canvasRect.width <= 2 || canvasRect.height <= 2) return null;

  // Button center in page coords (slightly above visual center feels nicer).
  const px = btnRect.left + btnRect.width * 0.50;
  const py = btnRect.top + btnRect.height * 0.45;

  const relX = (px - canvasRect.left) / canvasRect.width;
  const relY = (py - canvasRect.top) / canvasRect.height;

  // If the button lives in the right-side panel (outside the 3D canvas), clamp the X to just outside
  // the right edge while preserving the button's Y line. This avoids "spawning from above".
  let nx = relX * 2 - 1;
  if (relX > 1) nx = 1.10;
  if (relX < 0) nx = -1.10;

  const clampedRelY = THREE.MathUtils.clamp(relY, -0.15, 1.15);
  const ny = -(clampedRelY * 2 - 1);

  const origin = camera.position.clone();
  const rayPoint = new THREE.Vector3(nx, ny, 0.12).unproject(camera);
  const rayDir = rayPoint.sub(origin).normalize();

  const camFwd = new THREE.Vector3();
  camera.getWorldDirection(camFwd);

  const camToCapsule = camera.position.distanceTo(baseCenter);
  const targetDepth = Math.max(0.55, camToCapsule * 0.22);
  const planePoint = origin.clone().addScaledVector(camFwd, targetDepth);

  const denom = rayDir.dot(camFwd);
  if (Math.abs(denom) < 1e-4) return null;

  const t = planePoint.clone().sub(origin).dot(camFwd) / denom;
  if (!Number.isFinite(t) || t <= 0) return null;

  const p = origin.clone().addScaledVector(rayDir, t);

  // Safety bias so the spawned letter doesn't intersect the lid on the first frame.
  p.addScaledVector(camFwd, -Math.max(0.03, allSize.y * 0.05));
  p.y -= Math.max(0.015, allSize.y * 0.02);

  return p;
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

  // Launch from Seal button (side panel) -> visually enters from the right edge of the viewer.
  const fallbackStart = baseCenter.clone().add(new THREE.Vector3(sx * 1.55, sy * 0.48, sz * 0.86));
  const start = getButtonLaunchWorldPoint(baseCenter, baseBox, allSize) || fallbackStart;

  // Safer "side-in" route (right/front of the box) to avoid lid collision.
  // Lid is open mostly on the left side, so we approach from front-right.
  const sideApproach = baseCenter.clone().add(new THREE.Vector3(sx * 0.82, sy * 0.50, sz * 0.40));
  const sideHover = baseCenter.clone().add(new THREE.Vector3(sx * 0.34, sy * 0.60, sz * 0.22));

  // Controls for the first bezier leg (button -> side hover).
  const c1 = start.clone().add(new THREE.Vector3(-sx * 0.28, sy * 0.12, -sz * 0.10));
  const c2 = sideApproach.clone().add(new THREE.Vector3(0, sy * 0.10, 0));

  const rimY = baseBox.max.y;
  const entry = baseCenter.clone().add(new THREE.Vector3(sx * 0.08, 0, sz * 0.06));
  entry.y = rimY + Math.max(0.045, sy * 0.07);

  const innerMid = entry.clone();
  innerMid.y = rimY - Math.max(0.10, baseSize.y * 0.22);

  // Resting position near the bottom, slightly offset so it looks natural.
  const land = baseCenter.clone().add(new THREE.Vector3(sx * 0.03, 0, sz * 0.05));
  land.y = baseBox.min.y + Math.max(0.055, baseSize.y * 0.12);

  return {
    start, c1, c2,
    sideApproach, sideHover,
    entry, innerMid, land,
    baseCenter, allSize, baseBox, baseSize, sx, sy, sz,
  };
}

const _letterTmpA = new THREE.Vector3();
const _letterTmpB = new THREE.Vector3();
const _letterTmpC = new THREE.Vector3();
const _letterQuatTarget = new THREE.Quaternion();
const _letterEulerTarget = new THREE.Euler();


function updateLetterSealFlight(globalT) {
  const prop = state.letterProp;
  if (!prop || !state.letterPropReady) return;

  const path = state.letterFlightPathCache || getLetterFlightPathPoints();
  if (!state.letterFlightPathCache) state.letterFlightPathCache = path;

  // Smooth continuous motion (no hover/settle jitter, no wobble)
  const appearAt = 0.02;
  const sideEnterEnd = 0.44;
  const dropStart = 0.44;
  const landEnd = 0.72;

  const {
    start, c1, c2, sideApproach,
    entry, land, baseBox, baseSize, sx, sy, sz
  } = path;

  const entryTop = new THREE.Vector3(
    entry.x,
    baseBox.max.y + Math.max(0.030, baseSize.y * 0.055),
    entry.z
  );

  // Continuous side-entry curve (button -> side -> above opening)
  const sideCtrl1 = new THREE.Vector3(
    c2.x + sx * 0.06,
    Math.max(c2.y, start.y) + sy * 0.08,
    c2.z + sz * 0.04
  );
  const sideCtrl2 = new THREE.Vector3(
    sideApproach.x + sx * 0.02,
    sideApproach.y + sy * 0.06,
    sideApproach.z + sz * 0.02
  );

  // Straight-ish but smooth fall into the box (no pause over the lid)
  const restPos = new THREE.Vector3(
    land.x + sx * 0.012,
    land.y,
    land.z + sz * 0.020
  );

  const dropCtrl1 = new THREE.Vector3(
    entryTop.x - sx * 0.015,
    entryTop.y - Math.max(0.06, baseSize.y * 0.14),
    entryTop.z - sz * 0.008
  );
  const dropCtrl2 = new THREE.Vector3(
    restPos.x + sx * 0.010,
    restPos.y + Math.max(0.05, baseSize.y * 0.20),
    restPos.z + sz * 0.008
  );

  if (globalT < appearAt) {
    prop.visible = false;
    return;
  }

  prop.visible = true;

  const pos = _letterTmpA;
  const tangent = _letterTmpB.set(0, 0, 1);

  // Stable orientation presets (avoids yaw wrap / slerp flip wobble)
  const qLaunch = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.10, Math.PI * 0.62, -0.03));
  const qEntry  = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.02, Math.PI * 0.56,  0.00));
  const qLand   = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.16, Math.PI * 0.53, 0.00));

  let scaleMul = 0.60;

  // One-way slow rotation layered on top of the base orientation (no wobble / no back-and-forth).
  const motionSpinP = clamp01((Math.min(globalT, landEnd) - appearAt) / Math.max(1e-4, (landEnd - appearAt)));
  const motionSpinE = easeInOutCubic(motionSpinP);
  // Clear, slow one-way rotation in the air (visible but still calm)
  const extraYawRad = THREE.MathUtils.degToRad(760) * motionSpinE; // >= 2 full smooth turns before landing
  const extraRollRad = THREE.MathUtils.degToRad(-14) * motionSpinE;

  function evalCurve(p0, p1, p2, p3, tt, outPos, outTan) {
    const t0 = THREE.MathUtils.clamp(tt, 0, 1);
    const t1 = THREE.MathUtils.clamp(tt + 0.012, 0, 1);
    cubicBezierVec3(outPos, p0, p1, p2, p3, t0);
    const pNext = _letterTmpC;
    cubicBezierVec3(pNext, p0, p1, p2, p3, t1);
    outTan.copy(pNext).sub(outPos);
    if (outTan.lengthSq() < 1e-8) outTan.set(0, -1, 0.01);
    outTan.normalize();
  }

  if (globalT <= sideEnterEnd) {
    const p = clamp01((globalT - appearAt) / Math.max(1e-4, (sideEnterEnd - appearAt)));
    const e = easeInOutCubic(p);

    evalCurve(start, sideCtrl1, sideCtrl2, entryTop, e, pos, tangent);
    scaleMul = 0.58 + e * 0.06;

    // Mostly fixed orientation with gentle interpolation only
    prop.quaternion.slerpQuaternions(qLaunch, qEntry, e);
  } else if (globalT <= landEnd) {
    const p = clamp01((globalT - dropStart) / Math.max(1e-4, (landEnd - dropStart)));
    const e = easeInOutCubic(p);

    evalCurve(entryTop, dropCtrl1, dropCtrl2, restPos, e, pos, tangent);
    scaleMul = 0.64;

    // Smooth one-way rotation while falling (no oscillation)
    prop.quaternion.slerpQuaternions(qEntry, qLand, e);
  } else {
    pos.copy(restPos);
    scaleMul = 0.64;
    prop.quaternion.copy(qLand);
  }

  // Apply a deterministic, smooth one-way spin while the letter travels to the box.
  // Use world-yaw + local-roll so the rotation is clearly visible and never flips.
  const qWorldYaw = _letterQuatTarget;
  qWorldYaw.setFromAxisAngle(new THREE.Vector3(0, 1, 0), extraYawRad);
  prop.quaternion.premultiply(qWorldYaw);
  const qLocalRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), extraRollRad);
  prop.quaternion.multiply(qLocalRoll);

  prop.position.copy(pos);

  // Keep a tiny safety floor inside the box to avoid z-fighting/penetration illusion.
  const minInsideY = baseBox.min.y + Math.max(0.038, baseSize.y * 0.08);
  if (prop.position.y < minInsideY) prop.position.y = minInsideY;

  // Slightly smaller and stable scale (no pulsing)
  prop.scale.setScalar(scaleMul * 0.865);
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
 *  - no X/Z slide (lid should not drift backward)
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
    // Remove loading indicator when model is ready
    const loadingEl = document.getElementById('viewerLoading');
    if (loadingEl) loadingEl.remove();

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
        state.lidAnimT = state.sealed ? 0 : 1; // restore closed lid after refresh if already sealed

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

      state.lidAnimT = state.sealed ? 0 : 1; // restore closed lid after refresh if already sealed
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

    updateSealButtonState();
    resize();
  },
  undefined,
  (err) => {
    console.error('GLB load error', err);
    const viewer = document.getElementById('viewer');
    if (viewer) {
      const errEl = document.createElement('div');
      errEl.className = 'viewer-load-error';
      errEl.innerHTML = '<span>⚠</span><p>3D model failed to load.</p><small>Try refreshing the page.</small>';
      viewer.appendChild(errEl);
    }
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



// ---------- Screen UV auto-calibration (no more manual centering) ----------
// Some exports can have screen_* UVs that cover only part of the texture (or are rotated/mirrored).
// We compute an affine UV->(screen space) transform per screen mesh and apply it to the CanvasTexture,
// so the whole canvas always fits the whole physical screen and stays upright.

function projectOntoPlane(v, n) {
  // v - (v·n) n
  const d = v.dot(n);
  return v.clone().addScaledVector(n, -d);
}

function solve3x3(A, b) {
  // Gaussian elimination for a 3x3 system
  const m = [
    [A[0][0], A[0][1], A[0][2], b[0]],
    [A[1][0], A[1][1], A[1][2], b[1]],
    [A[2][0], A[2][1], A[2][2], b[2]],
  ];

  for (let col = 0; col < 3; col++) {
    // pivot
    let pivot = col;
    for (let r = col + 1; r < 3; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-10) return null;
    if (pivot !== col) {
      const tmp = m[col]; m[col] = m[pivot]; m[pivot] = tmp;
    }

    // normalize row
    const div = m[col][col];
    for (let c = col; c < 4; c++) m[col][c] /= div;

    // eliminate
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = m[r][col];
      for (let c = col; c < 4; c++) m[r][c] -= f * m[col][c];
    }
  }

  return [m[0][3], m[1][3], m[2][3]];
}

function computeScreenUvCalibration(mesh) {
  if (!mesh?.isMesh || !mesh.geometry?.attributes?.uv || !mesh.geometry.attributes.position) return null;

  const geo = mesh.geometry;
  const pos = geo.attributes.position.array;
  const uv = geo.attributes.uv.array;
  const count = Math.min(geo.attributes.position.count, geo.attributes.uv.count);

  // Sample step to keep it fast
  const maxSamples = 1200;
  const step = Math.max(1, Math.floor(count / maxSamples));

  // Try to get a valid normal from 3 non-collinear points
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const normalLocal = new THREE.Vector3();
  let okNormal = false;

  for (let i = 0; i < count - 2; i += step) {
    const i0 = i;
    const i1 = Math.min(count - 1, i + step);
    const i2 = Math.min(count - 1, i + step * 2);

    p0.set(pos[i0 * 3], pos[i0 * 3 + 1], pos[i0 * 3 + 2]);
    p1.set(pos[i1 * 3], pos[i1 * 3 + 1], pos[i1 * 3 + 2]);
    p2.set(pos[i2 * 3], pos[i2 * 3 + 1], pos[i2 * 3 + 2]);

    const v1 = p1.clone().sub(p0);
    const v2 = p2.clone().sub(p0);
    normalLocal.copy(v1.cross(v2));
    if (normalLocal.lengthSq() > 1e-10) { okNormal = true; break; }
  }

  if (!okNormal) return null;

  normalLocal.normalize();
  const normalWorld = normalLocal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)).normalize();

  const worldUp = new THREE.Vector3(0, 1, 0);
  const worldForward = new THREE.Vector3(0, 0, 1);

  const meshWorldQuat = new THREE.Quaternion();
  mesh.getWorldQuaternion(meshWorldQuat);
  const localUpWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(meshWorldQuat);
  const localRightWorld = new THREE.Vector3(1, 0, 0).applyQuaternion(meshWorldQuat);

  const meshCenter = new THREE.Vector3();
  new THREE.Box3().setFromObject(mesh).getCenter(meshCenter);

  const camAway = new THREE.Vector3().subVectors(meshCenter, camera.position); // away from camera

  const candidates = [
    projectOntoPlane(worldUp, normalWorld),
    projectOntoPlane(localUpWorld, normalWorld),
    projectOntoPlane(camAway, normalWorld),
    projectOntoPlane(worldForward, normalWorld),
  ];

  let upDir = null;
  for (const c of candidates) {
    if (c.lengthSq() > 1e-8) { upDir = c.normalize(); break; }
  }
  if (!upDir) return null;

  // right = up x normal (in plane)
  let rightDir = upDir.clone().cross(normalWorld);
  if (rightDir.lengthSq() < 1e-10) rightDir = normalWorld.clone().cross(upDir);
  rightDir.normalize();

  // Align "right" with the mesh local right as much as possible (stabilizes mirrored exports)
  if (rightDir.dot(localRightWorld) < 0) rightDir.multiplyScalar(-1);

  const downDir = upDir.clone().multiplyScalar(-1);

  // First pass: min/max in right/down coordinates
  let minW = Infinity, maxW = -Infinity, minH = Infinity, maxH = -Infinity;
  const tmpWorld = new THREE.Vector3();
  for (let i = 0; i < count; i += step) {
    tmpWorld.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(mesh.matrixWorld);
    const wCoord = tmpWorld.dot(rightDir);
    const hCoord = tmpWorld.dot(downDir);
    if (wCoord < minW) minW = wCoord;
    if (wCoord > maxW) maxW = wCoord;
    if (hCoord < minH) minH = hCoord;
    if (hCoord > maxH) maxH = hCoord;
  }

  const rangeW = maxW - minW;
  const rangeH = maxH - minH;
  if (rangeW < 1e-8 || rangeH < 1e-8) return null;

  // Second pass: least squares for u and v as affine functions of (w,h,1)
  let Sww = 0, Shh = 0, Swh = 0, Sw = 0, Sh = 0, N = 0;
  let Suw = 0, Suh = 0, Su = 0;
  let Svw = 0, Svh = 0, Sv = 0;

  for (let i = 0; i < count; i += step) {
    tmpWorld.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(mesh.matrixWorld);

    const w = (tmpWorld.dot(rightDir) - minW) / rangeW;
    const h = (tmpWorld.dot(downDir) - minH) / rangeH;

    const u = uv[i * 2];
    const v = uv[i * 2 + 1];

    Sww += w * w;
    Shh += h * h;
    Swh += w * h;
    Sw += w;
    Sh += h;
    N += 1;

    Suw += w * u;
    Suh += h * u;
    Su += u;

    Svw += w * v;
    Svh += h * v;
    Sv += v;
  }

  const A = [
    [Sww, Swh, Sw],
    [Swh, Shh, Sh],
    [Sw,  Sh,  N],
  ];

  const coefU = solve3x3(A, [Suw, Suh, Su]); // u = p*w + q*h + r
  const coefV = solve3x3(A, [Svw, Svh, Sv]); // v = s*w + t*h + u0

  // Fallback: UV bounds normalization only
  const boundsFallback = () => {
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (let i = 0; i < count; i += step) {
      const uu = uv[i * 2], vv = uv[i * 2 + 1];
      if (uu < minU) minU = uu;
      if (uu > maxU) maxU = uu;
      if (vv < minV) minV = vv;
      if (vv > maxV) maxV = vv;
    }
    const du = (maxU - minU) || 1;
    const dv = (maxV - minV) || 1;
    const mat = new THREE.Matrix3();
    mat.set(
      1 / du, 0, -minU / du,
      0, 1 / dv, -minV / dv,
      0, 0, 1
    );
    return mat;
  };

  if (!coefU || !coefV) return boundsFallback();

  const p = coefU[0], q = coefU[1], r = coefU[2];
  const s = coefV[0], t = coefV[1], u0 = coefV[2];

  const det = p * t - q * s;
  if (Math.abs(det) < 1e-10) return boundsFallback();

  const inv11 = t / det;
  const inv12 = -q / det;
  const inv21 = -s / det;
  const inv22 = p / det;

  const c1 = -(inv11 * r + inv12 * u0);
  const c2 = -(inv21 * r + inv22 * u0);

  const mat = new THREE.Matrix3();
  mat.set(
    inv11, inv12, c1,
    inv21, inv22, c2,
    0,    0,    1
  );
  return mat;
}


function computeFrontGlassUvBounds(mesh) {
  // Many GLB exports merge the screen glass, frame and side walls into one mesh.
  // If we normalize by the *global* UV bounds, the actual front glass gets only a sub-rectangle of the canvas (cropped UI).
  // Here we detect the dominant front-facing plane by face normals and compute UV bounds only for that plane.
  const geo = mesh?.geometry;
  const posAttr = geo?.attributes?.position;
  const uvAttr = geo?.attributes?.uv;
  if (!geo || !posAttr || !uvAttr) return null;

  const pos = posAttr.array;
  const uv = uvAttr.array;
  const idx = geo.index ? geo.index.array : null;
  const triCount = idx ? Math.floor(idx.length / 3) : Math.floor(posAttr.count / 3);
  if (triCount < 1) return null;

  // Cache per-geometry to avoid repeated work
  const cacheKey = '__frontGlassUvBounds';
  if (mesh.userData?.[cacheKey]) return mesh.userData[cacheKey];

  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const seed = new THREE.Vector3(0, 0, 1);

  let bestArea2 = -1;

  const getVid = (t, k) => idx ? idx[t * 3 + k] : (t * 3 + k);

  // Pass 1: pick a seed normal from the largest-area triangle
  for (let t = 0; t < triCount; t++) {
    const ia = getVid(t, 0), ib = getVid(t, 1), ic = getVid(t, 2);
    a.set(pos[ia * 3], pos[ia * 3 + 1], pos[ia * 3 + 2]);
    b.set(pos[ib * 3], pos[ib * 3 + 1], pos[ib * 3 + 2]);
    c.set(pos[ic * 3], pos[ic * 3 + 1], pos[ic * 3 + 2]);

    n.copy(b).sub(a).cross(c.clone().sub(a));
    const area2 = n.length(); // proportional to area (2x)
    if (area2 > bestArea2 && area2 > 1e-12) {
      bestArea2 = area2;
      seed.copy(n).normalize();
    }
  }

  if (bestArea2 < 1e-12) return null;

  // Pass 2: compute dominant plane normal (area-weighted, hemisphere-aligned)
  const avg = new THREE.Vector3(0, 0, 0);
  for (let t = 0; t < triCount; t++) {
    const ia = getVid(t, 0), ib = getVid(t, 1), ic = getVid(t, 2);
    a.set(pos[ia * 3], pos[ia * 3 + 1], pos[ia * 3 + 2]);
    b.set(pos[ib * 3], pos[ib * 3 + 1], pos[ib * 3 + 2]);
    c.set(pos[ic * 3], pos[ic * 3 + 1], pos[ic * 3 + 2]);

    n.copy(b).sub(a).cross(c.clone().sub(a));
    const area2 = n.length();
    if (area2 < 1e-12) continue;

    n.normalize();
    if (n.dot(seed) < 0) n.multiplyScalar(-1);
    avg.addScaledVector(n, area2);
  }

  if (avg.lengthSq() < 1e-12) return null;
  avg.normalize();

  const cos15 = Math.cos(THREE.MathUtils.degToRad(15));
  const cos25 = Math.cos(THREE.MathUtils.degToRad(25));

  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  let selected = 0;

  const accumulate = (t, cosThresh) => {
    const ia = getVid(t, 0), ib = getVid(t, 1), ic = getVid(t, 2);
    a.set(pos[ia * 3], pos[ia * 3 + 1], pos[ia * 3 + 2]);
    b.set(pos[ib * 3], pos[ib * 3 + 1], pos[ib * 3 + 2]);
    c.set(pos[ic * 3], pos[ic * 3 + 1], pos[ic * 3 + 2]);

    n.copy(b).sub(a).cross(c.clone().sub(a));
    const area2 = n.length();
    if (area2 < 1e-12) return false;

    n.normalize();
    if (n.dot(seed) < 0) n.multiplyScalar(-1);
    const cos = n.dot(avg);
    if (cos < cosThresh) return false;

    // include UVs for this face
    const vids = [ia, ib, ic];
    for (let j = 0; j < 3; j++) {
      const vId = vids[j];
      const u = uv[vId * 2];
      const v = uv[vId * 2 + 1];
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    selected++;
    return true;
  };

  // Try with 15°, fallback to 25° if too few faces selected.
  for (let t = 0; t < triCount; t++) accumulate(t, cos15);
  if (selected < Math.max(6, triCount * 0.05)) {
    minU = Infinity; maxU = -Infinity; minV = Infinity; maxV = -Infinity;
    selected = 0;
    for (let t = 0; t < triCount; t++) accumulate(t, cos25);
  }

  if (!isFinite(minU) || !isFinite(minV) || (maxU - minU) < 1e-8 || (maxV - minV) < 1e-8) return null;

  const result = { minU, maxU, minV, maxV };
  mesh.userData[cacheKey] = result;
  return result;
}

function calibrateScreenTextureForMesh(mesh, tex, kind = 'side') {
  if (!mesh?.isMesh || !tex) return;
  const geo = mesh.geometry;
  const uva = geo?.attributes?.uv?.array;
  const uvCount = geo?.attributes?.uv?.count || 0;
  if (!uva || uvCount < 3) return;

  const cacheKey = `__screenTexMatrix_${kind}`;
  if (!mesh.userData[cacheKey]) {
    // 1) UV bounds normalization: map the *front glass* UV region -> [0..1]
// (the mesh can include frame/sides/backfaces; using global UV bounds crops the UI)
const fb = computeFrontGlassUvBounds(mesh);
let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;

if (fb) {
  ({ minU, maxU, minV, maxV } = fb);
} else {
  for (let i = 0; i < uvCount; i++) {
    const u = uva[i * 2];
    const v = uva[i * 2 + 1];
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
}

const du = (maxU - minU) || 1;
const dv = (maxV - minV) || 1;

    const bounds = new THREE.Matrix3();
    bounds.set(
      1 / du, 0, -minU / du,
      0, 1 / dv, -minV / dv,
      0, 0, 1
    );

    // 2) Orientation fix (this GLB has rotated screens; lid also mirrored).
    const T = (tx, ty) => {
      const m = new THREE.Matrix3();
      m.set(1, 0, tx, 0, 1, ty, 0, 0, 1);
      return m;
    };
    const R = (rad) => {
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      const m = new THREE.Matrix3();
      m.set(c, -s, 0, s, c, 0, 0, 0, 1);
      return m;
    };
    const rotAround = (rad, cx = 0.5, cy = 0.5) => T(cx, cy).multiply(R(rad)).multiply(T(-cx, -cy));

    let orient;
    if (kind === 'lid') {
      // Lid: +90° and flip Y to keep text upright on this export
      const flipY = new THREE.Matrix3();
      flipY.set(1, 0, 0, 0, -1, 1, 0, 0, 1);
      orient = flipY.multiply(rotAround(Math.PI / 2));
    } else if (kind === 'name') {
      // screen_name is landscape in this model — do NOT rotate it.
      orient = rotAround(0);
    } else {
      // screen_avatar / other side screens: -90° (standard for this export)
      orient = rotAround(-Math.PI / 2);
    }

    // Optional user-controlled UV flips (debug tuner)
    const t = (kind === 'lid') ? screenTuner.lid : (kind === 'name') ? screenTuner.name : (kind === 'avatar') ? screenTuner.avatar : null;
    if (t?.flipX) {
      const fx = new THREE.Matrix3();
      fx.set(-1, 0, 1,  0, 1, 0,  0, 0, 1);
      orient = fx.multiply(orient);
    }
    if (t?.flipY) {
      const fy = new THREE.Matrix3();
      fy.set(1, 0, 0,  0, -1, 1,  0, 0, 1);
      orient = fy.multiply(orient);
    }

    // Final: orient * bounds
    mesh.userData[cacheKey] = orient.multiply(bounds);
  }

  tex.flipY = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.matrixAutoUpdate = false;
  tex.matrix.copy(mesh.userData[cacheKey]);
  tex.needsUpdate = true;
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

function createScreenMaterial(tex, emissiveHex = 0xffffff, emissiveIntensity = 1.0) {
  // IMPORTANT: If we use only `map`, the screen UI gets multiplied by scene lighting and can look black.
  // Use emissiveMap so the UI is self-lit, while keeping a subtle physical "glass" feel.
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0x0b0f18),
    map: null,
    transparent: true,
    opacity: 1,
    metalness: 0.02,
    roughness: 0.38,
    clearcoat: 0.85,
    clearcoatRoughness: 0.22,
    emissive: new THREE.Color(emissiveHex),
    emissiveMap: tex,
    emissiveIntensity,
  });
  mat.toneMapped = false;
  return mat;
}

function ensureScreenFxPack(key, width, height) {
  if (state.screenFx[key]) return state.screenFx[key];
  const pack = makeCanvasPack(width, height);

  // Screen textures are calibrated per-mesh (UV + orientation) when applied.
  // This prevents "cropped / off-center" screens even if the GLB UVs use only a sub-rectangle.
  pack.tex.flipY = false; // match glTF convention used by this project
  pack.tex.wrapS = THREE.ClampToEdgeWrapping;
  pack.tex.wrapT = THREE.ClampToEdgeWrapping;

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
    inset = 6,
  } = opts;

  const ix = Math.max(0, inset | 0);
  const x0 = ix;
  const y0 = ix;
  const ww = Math.max(1, w - ix * 2);
  const hh = Math.max(1, h - ix * 2);

  ctx.clearRect(0, 0, w, h);

  // Base fill to avoid black/transparent edges when using rounded rects
  ctx.fillStyle = inner;
  ctx.fillRect(0, 0, w, h);

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, inner);
  bg.addColorStop(0.55, 'rgba(12,18,26,0.92)');
  bg.addColorStop(1, 'rgba(9,13,20,0.9)');
  ctx.fillStyle = bg;
  roundRect(ctx, x0, y0, ww, hh, radius);
  ctx.fill();

  if (glow > 0) {
    const rg = ctx.createRadialGradient(w * 0.2, h * 0.25, 20, w * 0.35, h * 0.45, Math.max(w, h));
    rg.addColorStop(0, accentA);
    rg.addColorStop(0.45, accentB);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = glow;
    roundRect(ctx, x0, y0, ww, hh, radius);
    ctx.fillStyle = rg;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (border > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = border;
    roundRect(ctx, x0, y0, ww, hh, radius);
    ctx.stroke();
  }

  // Subtle glass shine (optional)
  const clipInset = ix + 2;
  const cx = clipInset;
  const cy = clipInset;
  const cw = Math.max(1, w - clipInset * 2);
  const ch = Math.max(1, h - clipInset * 2);

  ctx.save();
  roundRect(ctx, cx, cy, cw, ch, Math.max(0, radius - 2));
  ctx.clip();
  const shine = ctx.createLinearGradient(0, 0, 0, h * 0.48);
  shine.addColorStop(0, 'rgba(255,255,255,0.16)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, w, h * 0.5);
  ctx.restore();
}

function drawTabletBezelChrome(ctx, w, h, time = 0, opts = {}) {
  const {
    radius = 34,
    outerPad = 2,
    innerPad = 10,
    bezelTint = 'rgba(170,210,255,0.16)',
    edgeTint = 'rgba(120,220,255,0.32)',
    cornerTint = 'rgba(184,234,255,0.46)',
    sideButtons = true,
    topTabs = true,
    bottomDock = true,
    leftButtons = 3,
    rightButtons = 3,
  } = opts;

  // Outer metallic bezel ring
  const metal = ctx.createLinearGradient(0, 0, w, h);
  metal.addColorStop(0, 'rgba(46,60,80,0.36)');
  metal.addColorStop(0.18, 'rgba(18,24,34,0.40)');
  metal.addColorStop(0.52, bezelTint);
  metal.addColorStop(0.84, 'rgba(22,28,40,0.38)');
  metal.addColorStop(1, 'rgba(56,78,106,0.24)');
  ctx.fillStyle = metal;
  roundRect(ctx, outerPad, outerPad, w - outerPad * 2, h - outerPad * 2, radius + 4);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 2;
  roundRect(ctx, outerPad + 1, outerPad + 1, w - (outerPad + 1) * 2, h - (outerPad + 1) * 2, radius + 3);
  ctx.stroke();

  // Inner neon rim
  const rimG = ctx.createLinearGradient(0, 0, w, 0);
  rimG.addColorStop(0, 'rgba(116,228,255,0.14)');
  rimG.addColorStop(0.35, edgeTint);
  rimG.addColorStop(0.7, 'rgba(131,151,255,0.24)');
  rimG.addColorStop(1, 'rgba(116,228,255,0.14)');
  ctx.strokeStyle = rimG;
  ctx.lineWidth = 1.6;
  roundRect(ctx, innerPad, innerPad, w - innerPad * 2, h - innerPad * 2, Math.max(8, radius - 8));
  ctx.stroke();

  // Micro scan grid clipped to screen body (under content, subtle)
  ctx.save();
  roundRect(ctx, innerPad + 2, innerPad + 2, w - (innerPad + 2) * 2, h - (innerPad + 2) * 2, Math.max(6, radius - 10));
  ctx.clip();
  ctx.strokeStyle = 'rgba(120,210,255,0.035)';
  ctx.lineWidth = 1;
  for (let y = innerPad + 18; y < h - innerPad - 8; y += 22) {
    ctx.beginPath();
    ctx.moveTo(innerPad + 8, y + ((time * 8) % 6));
    ctx.lineTo(w - innerPad - 8, y + ((time * 8) % 6));
    ctx.stroke();
  }
  ctx.restore();

  // Corner bracket accents (tablet / sci-fi look)
  ctx.strokeStyle = cornerTint;
  ctx.lineWidth = 3;
  const c = Math.max(18, Math.min(w, h) * 0.06);
  const x1 = innerPad + 8, y1 = innerPad + 8;
  const x2 = w - innerPad - 8, y2 = h - innerPad - 8;
  const corners = [
    [x1, y1, 1, 1],
    [x2, y1, -1, 1],
    [x1, y2, 1, -1],
    [x2, y2, -1, -1],
  ];
  for (const [cx, cy, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * c, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + sy * c);
    ctx.stroke();
  }

  // Decorative top tabs
  if (topTabs) {
    const tabY = innerPad + 4;
    const tabW = Math.max(44, w * 0.12);
    const gap = 10;
    const startX = w - innerPad - tabW * 2 - gap - 20;
    for (let i = 0; i < 2; i++) {
      const x = startX + i * (tabW + gap);
      const tg = ctx.createLinearGradient(x, tabY, x + tabW, tabY);
      tg.addColorStop(0, 'rgba(111,228,255,0.12)');
      tg.addColorStop(1, 'rgba(123,134,255,0.18)');
      ctx.fillStyle = tg;
      roundRect(ctx, x, tabY, tabW, 12, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(173,235,255,0.18)';
      ctx.lineWidth = 1;
      roundRect(ctx, x, tabY, tabW, 12, 6);
      ctx.stroke();
    }
  }

  // Side button rails (buttons)
  const drawRail = (side = 'left', count = 3) => {
    if (count <= 0) return;
    const railW = Math.max(12, Math.min(18, w * 0.02));
    const railH = h * 0.58;
    const rx = side === 'left' ? innerPad + 4 : w - innerPad - 4 - railW;
    const ry = (h - railH) * 0.5;
    const rg = ctx.createLinearGradient(rx, ry, rx + railW, ry);
    rg.addColorStop(0, 'rgba(255,255,255,0.04)');
    rg.addColorStop(0.5, 'rgba(122,146,170,0.12)');
    rg.addColorStop(1, 'rgba(0,0,0,0.10)');
    ctx.fillStyle = rg;
    roundRect(ctx, rx, ry, railW, railH, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(170,220,255,0.14)';
    ctx.lineWidth = 1;
    roundRect(ctx, rx, ry, railW, railH, 8);
    ctx.stroke();

    const btnGap = railH / (count + 1);
    for (let i = 0; i < count; i++) {
      const cy = ry + btnGap * (i + 1);
      const bx = rx + railW * 0.5;
      const pulse = 0.45 + 0.35 * Math.sin(time * 2.1 + i * 0.9 + (side === 'left' ? 0.4 : 1.2));
      ctx.fillStyle = `rgba(12,18,28,0.90)`;
      ctx.beginPath();
      ctx.arc(bx, cy, railW * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(150,230,255,${(0.15 + pulse * 0.45).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(bx, cy, railW * 0.28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(111,235,255,${(0.12 + pulse * 0.38).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(bx, cy, railW * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  if (sideButtons) {
    drawRail('left', leftButtons);
    drawRail('right', rightButtons);
  }

  // Bottom dock bar (more "tablet" hardware frame)
  if (bottomDock) {
    const dockW = w * 0.34;
    const dockH = 16;
    const dockX = w * 0.5 - dockW * 0.5;
    const dockY = h - innerPad - dockH - 3;
    const dg = ctx.createLinearGradient(dockX, dockY, dockX + dockW, dockY);
    dg.addColorStop(0, 'rgba(123,134,255,0.10)');
    dg.addColorStop(0.5, 'rgba(111,228,255,0.24)');
    dg.addColorStop(1, 'rgba(123,134,255,0.10)');
    ctx.fillStyle = dg;
    roundRect(ctx, dockX, dockY, dockW, dockH, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,240,255,0.12)';
    ctx.lineWidth = 1;
    roundRect(ctx, dockX, dockY, dockW, dockH, 7);
    ctx.stroke();

    const segW = dockW / 5;
    for (let i = 1; i < 5; i++) {
      ctx.strokeStyle = 'rgba(160,220,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(dockX + i * segW, dockY + 2);
      ctx.lineTo(dockX + i * segW, dockY + dockH - 2);
      ctx.stroke();
    }
  }
}

function drawUiPill(ctx, x, y, w, h, label, opts = {}) {
  const {
    active = false,
    accent = 'rgba(111,228,255,0.22)',
    border = 'rgba(172,232,255,0.22)',
    text = 'rgba(208,232,255,0.72)',
    align = 'center',
    font = '700 12px Inter, sans-serif',
  } = opts;

  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, active ? accent : 'rgba(255,255,255,0.03)');
  g.addColorStop(1, active ? 'rgba(123,134,255,0.15)' : 'rgba(255,255,255,0.01)');
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, Math.min(h / 2, 8));
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, Math.min(h / 2, 8));
  ctx.stroke();

  ctx.font = font;
  ctx.fillStyle = text;
  ctx.textBaseline = 'middle';
  ctx.textAlign = align;
  const tx = align === 'left' ? x + 8 : align === 'right' ? x + w - 8 : x + w / 2;
  ctx.fillText(label, tx, y + h / 2 + 0.5);
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
  // Clean screen: no extra bezel/borders/buttons (hardware frame is already in the 3D model)
  drawScreenGlassBg(ctx, w, h, {
    radius: 0,
    border: 0,
    glow: 0.16,
    inset: 0,
    accentA: 'rgba(111,228,255,0.40)',
    accentB: 'rgba(123,134,255,0.22)',
    inner: 'rgba(7,11,17,0.96)',
  });

  // Apply tuner transform (move/scale UI inside lid screen)
  const ldx = (screenTuner.lid.x || 0) * w;
  const ldy = (screenTuner.lid.y || 0) * h;
  const lsc = (screenTuner.lid.scale || 1);
  ctx.save();
  ctx.translate(w * 0.5 + ldx, h * 0.5 + ldy);
  const lsx = (screenTuner.lid.stretchX || 1);
  const lsy = (screenTuner.lid.stretchY || 1);
  ctx.scale(lsc * lsx, lsc * lsy);
  ctx.translate(-w * 0.5, -h * 0.5);


  const closeP = 1 - clamp01(state.lidAnimT);
  const sealP = state.sealAnimPlaying ? easeOutCubic(closeP) : (state.sealed ? 1 : 0);

  // Main lock glyph
  drawLockGlyph(ctx, w * 0.5, h * 0.46, h * 0.68, sealP);

  const status = state.sealed ? 'SEALED' : (state.sealAnimPlaying ? 'LOCKING…' : 'READY');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const titleGrad = ctx.createLinearGradient(w * 0.25, 0, w * 0.75, 0);
  if (state.sealed) {
    titleGrad.addColorStop(0, '#d7f2ff');
    titleGrad.addColorStop(1, '#8ad5ff');
  } else {
    titleGrad.addColorStop(0, '#c8ffea');
    titleGrad.addColorStop(1, '#83ffd0');
  }

  ctx.shadowColor = 'rgba(118,220,255,0.30)';
  ctx.shadowBlur = 16;
  ctx.fillStyle = titleGrad;
  ctx.font = '800 64px Inter, sans-serif';
  ctx.fillText(status, w / 2, h * 0.70);

  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(211,233,255,0.66)';
  ctx.font = '600 22px Inter, sans-serif';
  ctx.fillText('TGE CAPSULE SECURITY', w / 2, h * 0.82);

  // Centered progress bar
  const barW = w * 0.56;
  const barH = 26;
  const barX = (w - barW) / 2;
  const barY = h * 0.87;

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(ctx, barX, barY, barW, barH, 13);
  ctx.fill();

  const fillP = state.sealed ? 1 : (state.sealAnimPlaying ? easeOutCubic(closeP) : 0.22 + Math.sin(time * 2.3) * 0.04);
  const fillGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
  fillGrad.addColorStop(0, state.sealed ? 'rgba(120,214,255,0.95)' : 'rgba(111,255,203,0.95)');
  fillGrad.addColorStop(1, 'rgba(125,136,255,0.9)');
  ctx.fillStyle = fillGrad;
  roundRect(ctx, barX + 2, barY + 2, Math.max(10, (barW - 4) * clamp01(fillP)), barH - 4, 11);
  ctx.fill();

  // Light sweep
  const sweepX = ((time * 220) % (barW + 160)) - 80;
  ctx.save();
  roundRect(ctx, barX + 2, barY + 2, barW - 4, barH - 4, 11);
  ctx.clip();
  const sweep = ctx.createLinearGradient(barX + sweepX - 50, barY, barX + sweepX + 50, barY);
  sweep.addColorStop(0, 'rgba(255,255,255,0)');
  sweep.addColorStop(0.5, 'rgba(255,255,255,0.32)');
  sweep.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sweep;
  ctx.fillRect(barX, barY, barW, barH);
  ctx.restore();
  ctx.restore();
}


function drawNameScreenCanvas(ctx, w, h, time) {
  const nick = (state.nickname || 'PLAYER').slice(0, 24);

  // Clean screen: no extra bezel/borders/buttons
  drawScreenGlassBg(ctx, w, h, {
    radius: 0,
    border: 0,
    glow: 0.12,
    inset: 0,
    accentA: 'rgba(130,220,255,0.22)',
    accentB: 'rgba(123,134,255,0.16)',
    inner: 'rgba(10,14,22,0.96)',
  });

  // Subtle scan lines
  ctx.save();
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < 9; i++) {
    const yy = ((time * 46 + i * 34) % (h + 90)) - 45;
    const g = ctx.createLinearGradient(0, yy, 0, yy + 20);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(120,210,255,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, yy, w, 20);
  }
  ctx.restore();

  // Centered nickname (auto-size)
  let size = 92;
  if (nick.length > 14) size = 72;
  if (nick.length > 18) size = 58;

  const pulse = 0.98 + Math.sin(time * 3.4) * 0.02;
  const nameGrad = ctx.createLinearGradient(0, 0, w, 0);
  nameGrad.addColorStop(0, '#e8f8ff');
  nameGrad.addColorStop(0.45, '#b8eeff');
  nameGrad.addColorStop(1, '#9aaeff');

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(118,220,255,0.28)';
  ctx.shadowBlur = 16;
  ctx.fillStyle = nameGrad;
  ctx.font = `800 ${Math.round(size * pulse * (screenTuner.name.scale || 1))}px Inter, sans-serif`;
  const nx = w * 0.5 + (screenTuner.name.x || 0) * w;
  const ny = h * 0.5 + (screenTuner.name.y || 0) * h;
  // subtle outline to keep text readable
  const nsx = (screenTuner.name.stretchX || 1);
  const nsy = (screenTuner.name.stretchY || 1);
  ctx.save();
  ctx.translate(nx, ny);
  ctx.scale(nsx, nsy);
  ctx.translate(-nx, -ny);
  ctx.lineWidth = Math.max(4, Math.round((Math.round(size * pulse) / 20)));
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.strokeText(nick, nx, ny);
  ctx.fillText(nick, nx, ny);
  ctx.restore();

  ctx.shadowBlur = 0;
}


function drawAvatarScreenCanvas(ctx, w, h, time) {
  // Clean screen: no extra bezel/borders/buttons
  drawScreenGlassBg(ctx, w, h, {
    radius: 0,
    border: 0,
    glow: 0.12,
    inset: 0,
    accentA: 'rgba(111,228,255,0.18)',
    accentB: 'rgba(123,134,255,0.12)',
    inner: 'rgba(10,14,22,0.96)',
  });

  const innerX = 0;
  const innerY = 0;
  const innerW = w;
  const innerH = h;

  ctx.save();
  ctx.beginPath();
  ctx.rect(innerX, innerY, innerW, innerH);
  ctx.clip();

  const img = state.avatarImgEl;
  if (img && state.avatarImgLoaded) {
    const floatX = Math.sin(time * 1.6) * 3;
    const floatY = Math.cos(time * 1.9) * 2;

    // 1) Fill background with a blurred "cover" (no empty bars)
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.filter = 'blur(18px)';
    const coverScale = Math.max(innerW / img.width, innerH / img.height);
    const cW = img.width * coverScale;
    const cH = img.height * coverScale;
    const cX = innerX + (innerW - cW) / 2;
    const cY = innerY + (innerH - cH) / 2;
    ctx.drawImage(img, cX, cY, cW, cH);
    ctx.restore();

    // 2) Darken a bit for readability
    const bg = ctx.createLinearGradient(innerX, innerY, innerX + innerW, innerY + innerH);
    bg.addColorStop(0, 'rgba(0,0,0,0.20)');
    bg.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = bg;
    ctx.fillRect(innerX, innerY, innerW, innerH);

    // 3) Foreground avatar "contain" (NO cropping) — always centered
    const containScale = Math.min(innerW / img.width, innerH / img.height)
      * 0.82 * (screenTuner.avatar.scale || 1)
      * (1.0 + Math.sin(time * 1.4) * 0.004);
    const asx = (screenTuner.avatar.stretchX || 1);
    const asy = (screenTuner.avatar.stretchY || 1);
    const dW = img.width * containScale * asx;
    const dH = img.height * containScale * asy;
    const dX = innerX + (innerW - dW) / 2 + floatX + (screenTuner.avatar.x || 0) * innerW;
    const dY = innerY + (innerH - dH) / 2 + floatY + (screenTuner.avatar.y || 0) * innerH - innerH * 0.10;
    ctx.drawImage(img, dX, dY, dW, dH);
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

  // Sweep line (subtle)
  const sweepY = ((time * 180) % (innerH + 160)) - 80;
  const sg = ctx.createLinearGradient(0, innerY + sweepY - 40, 0, innerY + sweepY + 40);
  sg.addColorStop(0, 'rgba(255,255,255,0)');
  sg.addColorStop(0.5, 'rgba(170,232,255,0.12)');
  sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(innerX, innerY, innerW, innerH);

  ctx.restore();
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
    const lidMat = state.screens.lid.material;
    if (!(lidMat && (lidMat.emissiveMap === pack.tex || lidMat.map === pack.tex))) {
      state.screens.lid.material = createScreenMaterial(pack.tex, 0xffffff, 1.15);
    }
    calibrateScreenTextureForMesh(state.screens.lid, pack.tex, 'lid');
    state.screens.lid.material.emissiveIntensity = state.sealed ? 1.25 : 1.05;
  }

  if (state.screens.name?.isMesh) {
    const pack = ensureScreenFxPack('name', 1024, 384);
    drawNameScreenCanvas(pack.ctx, pack.width, pack.height, now);
    pack.tex.needsUpdate = true;
    const nameMat = state.screens.name.material;
    if (!(nameMat && (nameMat.emissiveMap === pack.tex || nameMat.map === pack.tex))) {
      state.screens.name.material = createScreenMaterial(pack.tex, 0xffffff, 1.0);
    }
    calibrateScreenTextureForMesh(state.screens.name, pack.tex, 'name');
    state.screens.name.material.emissiveIntensity = 1.0 + Math.sin(now * 3.7) * 0.08;
  }

  if (state.screens.avatar?.isMesh) {
    const pack = ensureScreenFxPack('avatar', 768, 768);
    drawAvatarScreenCanvas(pack.ctx, pack.width, pack.height, now);
    pack.tex.needsUpdate = true;
    const avMat = state.screens.avatar.material;
    if (!(avMat && (avMat.emissiveMap === pack.tex || avMat.map === pack.tex))) {
      state.screens.avatar.material = createScreenMaterial(pack.tex, 0xffffff, 0.95);
    }
    calibrateScreenTextureForMesh(state.screens.avatar, pack.tex, 'avatar');
    state.screens.avatar.material.emissiveIntensity = 0.95 + Math.sin(now * 3.1 + 0.8) * 0.06;
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
function makeCanvasTexture(width, height, painter) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  painter(ctx, width, height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
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

  // IMPORTANT: screens must be readable even in dark lighting + ACES tonemapping.
  // Drive the UI through emissiveMap (self-lit), not only through `map`.
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: tex,
    emissiveIntensity: 1.0,
    transparent: true,
    opacity: 1,
    metalness: 0.0,
    roughness: 0.55,
  });
  mat.toneMapped = false;
  return mat;
}

function setupScreenPlaceholders() {
  if (state.screens.lid?.isMesh) {
    state.screens.lid.material = placeholderMaterial('LOCK');
    if (state.screens.lid.material?.map) calibrateScreenTextureForMesh(state.screens.lid, state.screens.lid.material.map, 'lid');
  }
  if (state.screens.name?.isMesh) {
    state.screens.name.material = placeholderMaterial('NAME');
    if (state.screens.name.material?.map) calibrateScreenTextureForMesh(state.screens.name, state.screens.name.material.map, 'side');
  }
  if (state.screens.avatar?.isMesh) {
    state.screens.avatar.material = placeholderMaterial('AVATAR');
    if (state.screens.avatar.material?.map) calibrateScreenTextureForMesh(state.screens.avatar, state.screens.avatar.material.map, 'side');
  }
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
  const hasAvatar = !!file || !!state.avatarDataUrl;
  ui.startBtn.disabled = !(nick.length > 0 && hasAvatar);
}

function updateAvatarFileNameLabel() {
  const file = ui.avatarInput.files?.[0];
  if (ui.avatarFileName) ui.avatarFileName.textContent = file ? file.name : 'No file selected';
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


function dataUrlToBlob(dataUrl) {
  const str = String(dataUrl || '');
  const parts = str.split(',');
  if (parts.length < 2) throw new Error('Invalid data URL');
  const meta = parts[0];
  const base64 = parts.slice(1).join(',');
  const match = meta.match(/data:(.*?);base64/i);
  const mime = match?.[1] || 'application/octet-stream';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}


function hashStringToSeed(input = '') {
  const str = String(input || 'magicblock');
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRand(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load export image'));
    img.src = dataUrl;
  });
}

function drawImageCover(ctx, img, x, y, w, h) {
  const iw = Math.max(1, img.naturalWidth || img.width || 1);
  const ih = Math.max(1, img.naturalHeight || img.height || 1);
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawImageContain(ctx, img, x, y, w, h) {
  const iw = Math.max(1, img.naturalWidth || img.width || 1);
  const ih = Math.max(1, img.naturalHeight || img.height || 1);
  const scale = Math.min(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
  return { dx, dy, dw, dh };
}

function trimTransparentImageToCanvas(img, alphaThreshold = 8) {
  const iw = Math.max(1, img.naturalWidth || img.width || 1);
  const ih = Math.max(1, img.naturalHeight || img.height || 1);
  const src = document.createElement('canvas');
  src.width = iw;
  src.height = ih;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  if (!sctx) return img;
  sctx.drawImage(img, 0, 0, iw, ih);

  let data;
  try {
    data = sctx.getImageData(0, 0, iw, ih).data;
  } catch {
    return img;
  }

  let minX = iw, minY = ih, maxX = -1, maxY = -1;
  for (let y = 0; y < ih; y++) {
    for (let x = 0; x < iw; x++) {
      const a = data[(y * iw + x) * 4 + 3];
      if (a > alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return img;

  const pad = Math.max(8, Math.round(Math.min(iw, ih) * 0.02));
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(iw - 1, maxX + pad);
  maxY = Math.min(ih - 1, maxY + pad);

  const tw = Math.max(1, maxX - minX + 1);
  const th = Math.max(1, maxY - minY + 1);
  // If almost full image is opaque, keep original (avoids unnecessary crop on fallback captures)
  if (tw > iw * 0.94 && th > ih * 0.94) return img;

  const out = document.createElement('canvas');
  out.width = tw;
  out.height = th;
  const octx = out.getContext('2d');
  if (!octx) return img;
  octx.drawImage(src, minX, minY, tw, th, 0, 0, tw, th);
  return out;
}

function drawSpaceBackground(ctx, width, height, seedText = '') {
  const rand = seededRand(hashStringToSeed(seedText));

  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, '#02050f');
  bg.addColorStop(0.45, '#060b1d');
  bg.addColorStop(1, '#03060d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Nebula glows
  for (let i = 0; i < 9; i++) {
    const x = rand() * width;
    const y = rand() * height * 0.8;
    const r = (0.12 + rand() * 0.2) * Math.min(width, height);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const hue = [205, 220, 245, 265][Math.floor(rand() * 4)];
    const alpha = 0.08 + rand() * 0.1;
    g.addColorStop(0, `hsla(${hue}, 95%, 70%, ${alpha})`);
    g.addColorStop(0.45, `hsla(${hue}, 90%, 50%, ${alpha * 0.45})`);
    g.addColorStop(1, `hsla(${hue}, 90%, 20%, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dense stars
  for (let i = 0; i < 260; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const size = rand() < 0.92 ? rand() * 1.8 + 0.25 : rand() * 3 + 1.2;
    const a = 0.35 + rand() * 0.65;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
    ctx.fill();

    if (size > 2.0) {
      ctx.strokeStyle = `rgba(170,210,255,${a * 0.45})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - size * 1.4, y);
      ctx.lineTo(x + size * 1.4, y);
      ctx.moveTo(x, y - size * 1.4);
      ctx.lineTo(x, y + size * 1.4);
      ctx.stroke();
    }
  }

  // Planet/arc glow (bottom-left like a horizon)
  const px = width * 0.22;
  const py = height * 1.03;
  const pr = Math.min(width, height) * 0.34;
  const planetGlow = ctx.createRadialGradient(px, py - pr * 0.55, 0, px, py - pr * 0.55, pr * 1.25);
  planetGlow.addColorStop(0, 'rgba(94,162,255,0.28)');
  planetGlow.addColorStop(0.35, 'rgba(70,110,230,0.18)');
  planetGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = planetGlow;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#050913';
  ctx.beginPath();
  ctx.arc(px, py, pr, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();

  // subtle vignette
  const vig = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.25, width / 2, height / 2, Math.max(width, height) * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);
}

function drawPaperNoise(ctx, x, y, w, h, seedText = '') {
  const rand = seededRand(hashStringToSeed(`paper:${seedText}`));
  ctx.save();
  ctx.globalAlpha = 0.055;
  for (let i = 0; i < 1700; i++) {
    const px = x + rand() * w;
    const py = y + rand() * h;
    const s = rand() * 1.1 + 0.25;
    const shade = 180 + Math.floor(rand() * 55);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(px, py, s, s);
  }
  ctx.restore();
}

function captureCapsuleTransparentDataUrl() {
  const prevBg = scene.background;
  const prevFloorVisible = typeof floor !== 'undefined' && floor ? floor.visible : true;

  try {
    scene.background = null;
    if (typeof floor !== 'undefined' && floor) floor.visible = false;
    renderDynamicScreens?.(true);
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  } finally {
    scene.background = prevBg;
    if (typeof floor !== 'undefined' && floor) floor.visible = prevFloorVisible;
    renderer.render(scene, camera);
  }
}

async function buildPolaroidCapsuleImageDataUrl() {
  const capsuleDataUrl = captureCapsuleTransparentDataUrl() || state._sealedPngDataUrl || renderer.domElement.toDataURL('image/png');
  const capsuleImgRaw = await loadImageFromDataUrl(capsuleDataUrl);
  const capsuleImg = trimTransparentImageToCanvas(capsuleImgRaw);

  const W = 1600;
  const H = 1200;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas export not available');

  drawSpaceBackground(ctx, W, H, state.nickname || 'magicblock');

  ctx.save();
  // Place a tilted Polaroid in the center
  const rot = -0.055;
  ctx.translate(W * 0.53, H * 0.5);
  ctx.rotate(rot);

  const polW = 760;
  const polH = 920;
  const x = -polW / 2;
  const y = -polH / 2;

  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 16;
  ctx.shadowOffsetX = -4;
  ctx.fillStyle = '#f7f4ee';
  ctx.fillRect(x, y, polW, polH);

  ctx.shadowColor = 'transparent';
  drawPaperNoise(ctx, x, y, polW, polH, state.nickname || 'user');

  // Inner photo window (square-ish)
  const padX = 56;
  const padTop = 54;
  const padBottom = 206;
  const innerX = x + padX;
  const innerY = y + padTop;
  const innerW = polW - padX * 2;
  const innerH = polH - padTop - padBottom;

  ctx.save();
  ctx.beginPath();
  ctx.rect(innerX, innerY, innerW, innerH);
  ctx.clip();

  // Add dedicated cosmic background INSIDE the polaroid photo window (so no empty/flat areas behind the box)
  const innerBg = document.createElement('canvas');
  innerBg.width = Math.max(1, Math.floor(innerW));
  innerBg.height = Math.max(1, Math.floor(innerH));
  const innerBgCtx = innerBg.getContext('2d');
  if (innerBgCtx) {
    drawSpaceBackground(innerBgCtx, innerBg.width, innerBg.height, `${state.nickname || 'user'}-inner`);

    // extra nebula/glow behind the capsule
    const cx = innerBg.width * 0.52;
    const cy = innerBg.height * 0.55;
    const glow = innerBgCtx.createRadialGradient(cx, cy, 10, cx, cy, innerBg.width * 0.42);
    glow.addColorStop(0, 'rgba(115,185,255,0.20)');
    glow.addColorStop(0.55, 'rgba(98,110,255,0.12)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    innerBgCtx.fillStyle = glow;
    innerBgCtx.fillRect(0, 0, innerBg.width, innerBg.height);

    // dark horizon/platform at bottom for depth
    innerBgCtx.fillStyle = 'rgba(3,8,18,0.9)';
    innerBgCtx.beginPath();
    innerBgCtx.ellipse(innerBg.width * 0.5, innerBg.height * 1.02, innerBg.width * 0.62, innerBg.height * 0.27, 0, Math.PI, Math.PI * 2);
    innerBgCtx.fill();
  }
  ctx.drawImage(innerBg, innerX, innerY, innerW, innerH);

  // dark vignette plate for subject grounding (behind capsule)
  const plate = ctx.createRadialGradient(innerX + innerW * 0.5, innerY + innerH * 0.72, 10, innerX + innerW * 0.5, innerY + innerH * 0.74, innerW * 0.48);
  plate.addColorStop(0, 'rgba(7,14,28,0.78)');
  plate.addColorStop(0.65, 'rgba(6,10,20,0.38)');
  plate.addColorStop(1, 'rgba(6,10,20,0)');
  ctx.fillStyle = plate;
  ctx.fillRect(innerX, innerY, innerW, innerH);

  // draw capsule render over the cosmic inner background with contain (keeps visible backdrop)
  const placed = drawImageContain(ctx, capsuleImg, innerX + innerW * 0.11, innerY + innerH * 0.06, innerW * 0.78, innerH * 0.80);

  // soft drop shadow/glow under capsule to blend with bg
  const shadowY = placed.dy + placed.dh * 0.86;
  const shadow = ctx.createRadialGradient(placed.dx + placed.dw * 0.5, shadowY, 5, placed.dx + placed.dw * 0.5, shadowY, placed.dw * 0.42);
  shadow.addColorStop(0, 'rgba(0,0,0,0.34)');
  shadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadow;
  ctx.fillRect(innerX, innerY, innerW, innerH);

  // subtle photo vignette
  const photoVig = ctx.createRadialGradient(innerX + innerW / 2, innerY + innerH / 2, innerW * 0.2, innerX + innerW / 2, innerY + innerH / 2, innerW * 0.85);
  photoVig.addColorStop(0, 'rgba(255,255,255,0)');
  photoVig.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = photoVig;
  ctx.fillRect(innerX, innerY, innerW, innerH);
  ctx.restore();

  // White border line around photo window
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 2;
  ctx.strokeRect(innerX, innerY, innerW, innerH);

  // Handwritten text in the free space (EN, per request)
  ctx.fillStyle = '#24438a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(36,67,138,0.20)';
  ctx.shadowBlur = 4;
  ctx.font = '700 42px "Marker Felt", "Bradley Hand", "Comic Sans MS", cursive';
  ctx.fillText('My MagicBlock time capsule', 0, y + polH - 132);
  ctx.font = '700 46px "Marker Felt", "Bradley Hand", "Comic Sans MS", cursive';
  ctx.fillText('sealed until TGE!', 0, y + polH - 76);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Optional tiny typed nickname in corner (helps identify user exports)
  if (state.nickname) {
    ctx.fillStyle = 'rgba(15,23,42,0.55)';
    ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`@${String(state.nickname).slice(0, 22)}`, x + 18, y + 22);
  }

  ctx.restore();

  return canvas.toDataURL('image/png');
}

async function downloadSealedPolaroidImage() {
  const dataUrl = await buildPolaroidCapsuleImageDataUrl();
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `time-capsule-${slugify(state.nickname || 'user')}-polaroid.png`;
  a.click();
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatFeedDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

async function uploadBlobToPublicBucket(path, blob, contentType = 'application/octet-stream') {
  const { error } = await supabase.storage.from(CAPSULE_BUCKET).upload(path, blob, {
    contentType,
    upsert: false,
    cacheControl: '3600',
  });
  if (error) throw error;

  const { data } = supabase.storage.from(CAPSULE_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Failed to get public URL');
  return data.publicUrl;
}

function renderCapsuleFeed(items = []) {
  if (!ui.capsuleFeedList || !ui.capsuleFeedEmpty) return;

  if (!Array.isArray(items) || items.length === 0) {
    ui.capsuleFeedList.innerHTML = '';
    ui.capsuleFeedEmpty.classList.remove('hidden');
    return;
  }

  ui.capsuleFeedEmpty.classList.add('hidden');
  ui.capsuleFeedList.innerHTML = items.map((row) => `
    <div class="feed-row">
      <img class="feed-avatar" src="${escapeHtml(row.avatar_url || '')}" alt="avatar of ${escapeHtml(row.nickname || 'user')}" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2244%22 height=%2244%22 viewBox=%220 0 44 44%22%3E%3Crect width=%2244%22 height=%2244%22 rx=%2222%22 fill=%22%23182030%22/%3E%3Ccircle cx=%2222%22 cy=%2218%22 r=%228%22 fill=%22%23334466%22/%3E%3Cellipse cx=%2222%22 cy=%2236%22 rx=%2213%22 ry=%228%22 fill=%22%23334466%22/%3E%3C/svg%3E'" />
      <div class="feed-nick" title="${escapeHtml(row.nickname || '')}">${escapeHtml(row.nickname || 'Unknown')}</div>
      <img class="feed-box" src="${escapeHtml(row.box_thumb_url || '')}" alt="sealed capsule thumbnail" loading="lazy" onerror="this.style.opacity='0.3'" />
      <div class="feed-date">${escapeHtml(formatFeedDate(row.sealed_at || row.created_at))}</div>
    </div>
  `).join('');
}

async function loadCapsuleFeed() {
  if (!ui.capsuleFeedList || !ui.capsuleFeedEmpty) return;

  if (ui.refreshFeedBtn) ui.refreshFeedBtn.disabled = true;
  try {
    const { data, error } = await supabase
      .from('capsule_feed')
      .select('id, nickname, avatar_url, box_thumb_url, sealed_at, created_at')
      .order('sealed_at', { ascending: false })
      .limit(12);

    if (error) throw error;
    renderCapsuleFeed(data || []);
  } catch (err) {
    console.error('[capsule_feed] load failed', err);
    renderCapsuleFeed([]);
  } finally {
    if (ui.refreshFeedBtn) ui.refreshFeedBtn.disabled = false;
  }
}

function showToast(message, type = 'info') {
  const existing = document.getElementById('toastNotification');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toastNotification';
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('toast-visible'));
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

async function saveCapsuleFeedEntry() {
  if (!state.readyProfile || !state.sealed) return;
  if (!state.avatarDataUrl || !state.nickname) return;
  if (state._feedSavedOnce) return;

  const messageText = String(state.message || '').trim();
  if (!messageText) {
    console.warn('[capsule] message is empty, skipping save');
    return;
  }

  state._feedSavedOnce = true;

  let publicFeedSaved = false;
  let insertedCapsuleId = null;

  try {
    const avatarBlob = dataUrlToBlob(state.avatarDataUrl);
    const boxPngDataUrl = renderer.domElement.toDataURL('image/png');
    const boxBlob = dataUrlToBlob(boxPngDataUrl);

    const nickSlug = slugify(state.nickname);
    const stamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);

    const avatarExt = avatarBlob.type.includes('png') ? 'png' : avatarBlob.type.includes('webp') ? 'webp' : 'jpg';
    const avatarPath = `avatars/${nickSlug}-${stamp}-${rand}.${avatarExt}`;
    const boxPath = `boxes/${nickSlug}-${stamp}-${rand}.png`;

    const [avatarUrl, boxThumbUrl] = await Promise.all([
      uploadBlobToPublicBucket(avatarPath, avatarBlob, avatarBlob.type || 'image/jpeg'),
      uploadBlobToPublicBucket(boxPath, boxBlob, 'image/png'),
    ]);

    const payload = {
      nickname: String(state.nickname || '').trim().slice(0, 24),
      avatar_url: avatarUrl,
      box_thumb_url: boxThumbUrl,
      message_length: Math.max(0, Math.min(300, Array.from(messageText).length)),
      sealed_at: new Date().toISOString(),
    };

    // Insert public feed row and request generated id back so we can link the private letter.
    const { data: insertedFeedRows, error: publicInsertError } = await supabase
      .from('capsule_feed')
      .insert(payload)
      .select('id')
      .limit(1);

    if (publicInsertError) throw publicInsertError;

    insertedCapsuleId = insertedFeedRows?.[0]?.id ?? null;
    publicFeedSaved = true;

    if (!insertedCapsuleId) {
      throw new Error('capsule_feed insert succeeded but no id was returned. Make sure capsule_feed has an id column and SELECT is allowed by RLS.');
    }

    // Save the actual letter text privately (not shown in public feed).
    const privatePayload = {
      capsule_id: insertedCapsuleId,
      message_text: messageText.slice(0, 5000),
    };

    const { error: privateInsertError } = await supabase
      .from(CAPSULE_PRIVATE_MESSAGES_TABLE)
      .insert(privatePayload);

    if (privateInsertError) {
      console.error('[capsule_private] save failed', privateInsertError);
      showToast('Capsule was saved to public feed, but private letter text was NOT saved. Check Supabase table/RLS.', 'warning');
    }

    await loadCapsuleFeed();
  } catch (err) {
    // Avoid duplicate public entries on retry if public insert already succeeded but private insert failed later.
    if (!publicFeedSaved) {
      state._feedSavedOnce = false;
      showToast('Could not save to the public feed. Tap Refresh to retry.', 'error');
    }

    console.error('[capsule_feed] save failed', err, { publicFeedSaved, insertedCapsuleId });
  }
}

ui.nicknameInput.addEventListener('input', () => {
  validateIntroForm();
  ui.statusNick.textContent = ui.nicknameInput.value.trim() || '—';
});

ui.avatarInput.addEventListener('change', async () => {
  validateIntroForm();
  updateAvatarFileNameLabel();

  const file = ui.avatarInput.files?.[0];
  if (!file) return;

  const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!allowed.includes(file.type)) {
    alert('Only PNG / JPG / WEBP files are allowed');
    ui.avatarInput.value = '';
    updateAvatarFileNameLabel();
    validateIntroForm();
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert('File is too large. Maximum size is 5MB');
    ui.avatarInput.value = '';
    updateAvatarFileNameLabel();
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
    persistCapsuleState();
    validateIntroForm();
  } catch (err) {
    console.error('Avatar read error', err);
    alert('Failed to read the avatar file');
  }
});

ui.introForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const nick = ui.nicknameInput.value.trim();
  const pickedFile = ui.avatarInput.files?.[0] || null;

  if (!nick || (!state.avatarDataUrl && !pickedFile)) {
    alert('Enter a nickname and upload an avatar 🫡');
    return;
  }

  if (!state.avatarDataUrl && pickedFile) {
    try {
      const typeOk = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(pickedFile.type);
      if (!typeOk) {
        alert('Avatar must be PNG / JPG / WEBP');
        return;
      }
      if (pickedFile.size > 5 * 1024 * 1024) {
        alert('File is too large (max 5MB)');
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
      persistCapsuleState();
    } catch (err) {
      console.error('Avatar fallback read error', err);
      alert('Failed to read the avatar file. Try another PNG / JPG / WEBP file');
      return;
    }
  }

  state.nickname = nick;
  state.readyProfile = true;

  ui.profileMiniNick.textContent = nick;
  ui.profileMiniAvatar.src = state.avatarDataUrl;
  ui.profileMini.classList.remove('hidden');

  ui.introModal.classList.remove('is-open');

  ui.statusNick.textContent = nick;
  ui.statusAvatar.textContent = 'OK';

  persistCapsuleState();
  updateSealButtonState();
  updateDynamicTextures();
});

ui.messageInput.addEventListener('input', () => {
  state.message = ui.messageInput.value;
  const len = Array.from(state.message).length;
  ui.charCount.textContent = `${len} / 300`;
  ui.statusText.textContent = `${len} / 300`;
  persistCapsuleState();
  updateSealButtonState();
});

updateAvatarFileNameLabel();
applyPersistedCapsuleState(loadPersistedCapsuleState());
validateIntroForm();
updateSealButtonState();

ui.refreshFeedBtn?.addEventListener('click', loadCapsuleFeed);
loadCapsuleFeed();

ui.sealBtn.addEventListener('click', () => {
  if (!state.readyProfile || state.sealed || state.sealAnimPlaying) return;

  if (getTrimmedMessageLength() < MIN_MESSAGE_CHARS) {
    alert(`Message must be at least ${MIN_MESSAGE_CHARS} characters`);
    ui.messageInput.focus();
    updateSealButtonState();
    return;
  }

  setSealedOverlayVisible(false);
  state.sealAnimPlaying = true;
  state.overlayDismissedOnSealed = false;
  // Hide the message in the textarea immediately after sealing starts, but keep it in state/localStorage.
  ui.messageInput.value = '';
  ui.messageInput.placeholder = 'Message sealed';
  ui.messageInput.disabled = true;
  updateSealButtonState();
  ui.statusSeal.textContent = 'Sealing...';

  animateSealSequence();
});

ui.downloadBtn.addEventListener('click', async () => {
  try {
    await downloadSealedPolaroidImage();
  } catch (err) {
    console.warn('Polaroid export failed, falling back to raw PNG', err);
    const a = document.createElement('a');
    a.href = state._sealedPngDataUrl || renderer.domElement.toDataURL('image/png');
    a.download = `time-capsule-${slugify(state.nickname || 'user')}.png`;
    a.click();
    showToast('Polaroid export failed — downloaded standard PNG instead.', 'warning');
  }
});

ui.overlayOkBtn?.addEventListener('click', () => {
  state.overlayDismissedOnSealed = true;
  setSealedOverlayVisible(false);
  controls.enabled = true;
  persistCapsuleState();
});

// ---------- Seal animation ----------
function animateSealSequence() {
  const start = performance.now();
  const duration = state.letterPropReady ? 8600 : 4000;

  // Keep final pose the same as before, but add a full 360° spin on top.
  const finalPoseDelta = 0; // stop facing front after full 360 spin
  state.sealSpinTargetDelta = Math.PI * 2 + finalPoseDelta;
  state.sealSpinCommitted = false;

  // Prevent user camera drag from visually "breaking" the cinematic sealing motion.
  controls.enabled = false;
  state.letterFlightPathCache = state.letterPropReady ? getLetterFlightPathPoints() : null;

  function step(now) {
    const t = clamp01((now - start) / duration);

    // 1) Letter cinematic
    if (state.letterPropReady) {
      updateLetterSealFlight(t);
    }

    // 2) Lid closes later, and a bit longer/smoother while the box is rotating
    const lidStart = state.letterPropReady ? 0.76 : 0.00;
    const lidEnd = state.letterPropReady ? 0.95 : 0.88;
    const lidPhase = clamp01((t - lidStart) / Math.max(1e-4, (lidEnd - lidStart)));
    state.lidAnimT = 1 - easeInOutCubic(lidPhase);

    // 3) Spin starts during the lid close and continues longer (no late fast snap)
    const spinStart = state.letterPropReady ? 0.78 : 0.05;
    const spinEnd = state.letterPropReady ? 0.995 : 0.92;
    const spinPhase = clamp01((t - spinStart) / Math.max(1e-4, (spinEnd - spinStart)));
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
    state.letterFlightPathCache = null;

    state.sealed = true;
    state.sealAnimPlaying = false;
    state.overlayDismissedOnSealed = false;
    // Cache the PNG immediately after sealing so download is reliable regardless of GL state later
    state._sealedPngDataUrl = renderer.domElement.toDataURL('image/png');

    controls.enabled = true;
    ui.statusSeal.textContent = 'Sealed';
    setSealedOverlayVisible(true, { showOk: true, blocking: true });
    ui.downloadBtn.classList.remove('hidden');
    ui.messageInput.disabled = true;
    ui.messageInput.value = '';
    ui.messageInput.placeholder = 'Message sealed';

    persistCapsuleState();
    updateSealButtonState();
    updateDynamicTextures();
    saveCapsuleFeedEntry();
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
      state.screens.name.material.emissiveIntensity = 1.0 + Math.sin(tNow * 2.8) * 0.08;
    }
    if (state.screens.avatar?.material) {
      state.screens.avatar.material.emissiveIntensity = 0.95 + Math.sin(tNow * 2.3 + 0.7) * 0.06;
    }
  }

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

mountScreenTunerUI();
resize();
tick();
