import * as THREE from 'https://esm.sh/three@0.161.0';
import { GLTFLoader } from 'https://esm.sh/three@0.161.0/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://esm.sh/three@0.161.0/examples/jsm/controls/OrbitControls.js';

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
  screens: {
    lid: null,
    name: null,
    avatar: null,
  },
  lidClosedQuat: null,
  lidOpenQuat: null,
  lidAnimT: 0,
  spinT: 0,
  sealAnimPlaying: false,
};

// ---------- Three.js scene ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07090d);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(2.8, 1.8, 3.6);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
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
  new THREE.MeshBasicMaterial({ color: 0x0c111b, transparent: true, opacity: 0.55 })
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

// ---------- Load model ----------
const loader = new GLTFLoader();
loader.load('./assets/time_capsule_case_v1.glb', (gltf) => {
  state.gltf = gltf;
  state.root = gltf.scene;
  scene.add(gltf.scene);

  // Ignore embedded animations intentionally (we animate lid in code)
  // Defensive fix: remove invalid onBuild fields that can crash renderer in some exports/browser setups
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
        if (m && m.map) m.map.colorSpace = THREE.SRGBColorSpace;
      });
    }
  });

  // Fit camera/controls target
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  controls.target.copy(center);
  camera.position.set(center.x + size.x * 1.2, center.y + size.y * 0.9, center.z + size.z * 1.8);
  camera.lookAt(center);

  // Find named nodes
  state.capsuleLid = gltf.scene.getObjectByName('capsule_lid') || gltf.scene.getObjectByName('capsule_lid.001');
  state.capsuleBase = gltf.scene.getObjectByName('capsule_base');
  state.screens.lid = gltf.scene.getObjectByName('screen_lid');
  state.screens.name = gltf.scene.getObjectByName('screen_name');
  state.screens.avatar = gltf.scene.getObjectByName('screen_avatar');

  if (state.capsuleLid) {
    state.lidClosedQuat = state.capsuleLid.quaternion.clone();
    // create a target "open" quaternion by rotating around local X (adjust if needed)
    const delta = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI * 0.72, 0, 0));
    state.lidOpenQuat = state.lidClosedQuat.clone().multiply(delta);
    // Start open-ish for presentation
    state.capsuleLid.quaternion.copy(state.lidOpenQuat);
    state.lidAnimT = 1;
  }

  setupScreenPlaceholders();
  updateDynamicTextures();

  ui.sealBtn.disabled = !state.readyProfile;
  resize();
}, undefined, (err) => {
  console.error('GLB load error', err);
  alert('Не вдалося завантажити 3D модель. Перевір, що сайт відкритий через локальний сервер або GitHub Pages.');
});

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
  if (state.screens.lid && state.screens.lid.isMesh) {
    state.screens.lid.material = placeholderMaterial('LID');
  }
  if (state.screens.name && state.screens.name.isMesh) {
    state.screens.name.material = placeholderMaterial('NAME');
  }
  if (state.screens.avatar && state.screens.avatar.isMesh) {
    state.screens.avatar.material = placeholderMaterial('AVATAR');
  }
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
    state.screens.lid.material = new THREE.MeshStandardMaterial({ map: tex, transparent: true, metalness: 0, roughness: 0.35 });
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
    state.screens.name.material = new THREE.MeshStandardMaterial({ map: tex, transparent: true, metalness: 0, roughness: 0.4 });
  }

  // Avatar screen
  if (state.screens.avatar?.isMesh) {
    const avatarUrl = state.avatarDataUrl;
    const img = new Image();
    img.onload = () => {
      const tex = makeCanvasTexture(768, 768, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(12,16,24,0.86)';
        roundRect(ctx, 6, 6, w - 12, h - 12, 56);
        ctx.fill();

        const pad = 48;
        const innerX = pad, innerY = pad, innerW = w - pad * 2, innerH = h - pad * 2;
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
      state.screens.avatar.material = new THREE.MeshStandardMaterial({ map: tex, transparent: true, metalness: 0, roughness: 0.45 });
    };
    if (avatarUrl) img.src = avatarUrl;
  }
}

// ---------- UI logic ----------
function validateIntroForm() {
  const nick = ui.nicknameInput.value.trim();
  const file = ui.avatarInput.files?.[0];
  const fileOk = !!file;
  ui.startBtn.disabled = !(nick.length > 0 && fileOk);
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

  const dataUrl = await fileToDataURL(file);
  state.avatarDataUrl = dataUrl;
  ui.avatarPreview.innerHTML = '';
  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = 'Avatar preview';
  ui.avatarPreview.appendChild(img);
  ui.statusAvatar.textContent = 'OK';
});

ui.introForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const nick = ui.nicknameInput.value.trim();
  if (!nick || !state.avatarDataUrl) return;
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

ui.sealBtn.addEventListener('click', async () => {
  if (!state.readyProfile || state.sealed || state.sealAnimPlaying) return;
  state.sealAnimPlaying = true;
  ui.sealBtn.disabled = true;
  ui.statusSeal.textContent = 'Sealing...';

  // close lid animation + spin using update loop state flags
  animateSealSequence();
});

ui.downloadBtn.addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = renderer.domElement.toDataURL('image/png');
  a.download = `time-capsule-${slugify(state.nickname || 'user')}.png`;
  a.click();
});

function animateSealSequence() {
  const start = performance.now();
  const duration = 2300;

  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    // ease
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    // Close lid first ~70% timeline
    const lidPhase = Math.min(1, eased / 0.72);
    state.lidAnimT = 1 - lidPhase;

    // Spin root around Y while sealing
    state.spinT = Math.sin(Math.min(1, t) * Math.PI) * 0.75;

    if (t < 1) {
      requestAnimationFrame(step);
      return;
    }

    state.lidAnimT = 0;
    state.spinT = 0;
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

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function slugify(v) {
  return String(v).toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'user';
}

// ---------- Render loop ----------
const _qTmp = new THREE.Quaternion();
const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state.capsuleLid && state.lidClosedQuat && state.lidOpenQuat) {
    _qTmp.copy(state.lidClosedQuat).slerp(state.lidOpenQuat, state.lidAnimT);
    state.capsuleLid.quaternion.copy(_qTmp);
  }

  if (state.root) {
    // subtle idle bob before sealing
    if (!state.sealed && !state.sealAnimPlaying) {
      const t = performance.now() * 0.001;
      state.root.rotation.y += dt * 0.18;
      state.root.position.y = Math.sin(t * 1.1) * 0.02;
    } else if (state.sealAnimPlaying) {
      state.root.rotation.y += dt * (1.1 + state.spinT * 2.2);
      state.root.position.y = 0;
    }
  }

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

resize();
tick();
