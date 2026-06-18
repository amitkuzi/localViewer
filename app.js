import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const $ = (id) => document.getElementById(id);
const drop = $('drop'), mdEl = $('md'), threeEl = $('three'),
      panel = $('panel'), info = $('info'), err = $('err'),
      kindBadge = $('kindBadge'), picker = $('picker');

let renderer, scene, camera, controls, currentMesh, gridHelper;

// ---- view switching ----
function show(view) {
  drop.style.display    = view === 'drop' ? 'flex' : 'none';
  mdEl.style.display    = view === 'md'   ? 'block': 'none';
  threeEl.style.display = view === '3d'   ? 'block': 'none';
  panel.hidden          = view !== '3d';
  err.style.display     = view === 'err'  ? 'flex' : 'none';
  info.style.display    = view === '3d'   ? 'block': 'none';
}
function showError(msg) { err.textContent = msg; show('err'); }

// ---- file kind detection ----
function detectKind(name) {
  const n = name.toLowerCase();
  if (n.endsWith('.md') || n.endsWith('.markdown') || n.endsWith('.txt')) return 'md';
  if (n.endsWith('.stl')) return 'stl';
  if (n.endsWith('.3mf')) return '3mf';
  return null;
}

// ---- Markdown ----
function renderMarkdown(text) {
  marked.setOptions({ gfm: true, breaks: false });
  const html = DOMPurify.sanitize(marked.parse(text));
  mdEl.innerHTML = html;
  show('md');
}

// ---- three.js scene ----
function ensureThree() {
  if (renderer) return;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101418);

  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
  camera.position.set(120, 100, 140);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  threeEl.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(200, 300, 200); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-200, 100, -100); scene.add(fill);

  gridHelper = new THREE.GridHelper(400, 40, 0x2a313a, 0x1a1f25);
  scene.add(gridHelper);

  const resize = () => {
    const r = threeEl.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(threeEl);
  resize();

  const loop = () => { controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop); };
  loop();

  // panel controls
  $('colorPick').addEventListener('input', (e) => applyColor(e.target.value));
  $('wireToggle').addEventListener('change', (e) => applyWire(e.target.checked));
  $('gridToggle').addEventListener('change', (e) => { gridHelper.visible = e.target.checked; });
  $('fitBtn').addEventListener('click', fitView);
}

function clearModel() {
  if (!currentMesh) return;
  scene.remove(currentMesh);
  currentMesh.traverse?.((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => m.dispose());
    }
  });
  currentMesh = null;
}

function applyColor(hex) {
  if (!currentMesh) return;
  currentMesh.traverse?.((o) => {
    if (o.isMesh && o.material && 'color' in o.material) o.material.color.set(hex);
  });
}
function applyWire(on) {
  if (!currentMesh) return;
  currentMesh.traverse?.((o) => {
    if (o.isMesh && o.material) o.material.wireframe = on;
  });
}

function fitView() {
  if (!currentMesh) return;
  const box = new THREE.Box3().setFromObject(currentMesh);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const fov = camera.fov * (Math.PI / 180);
  const dist = (maxDim / (2 * Math.tan(fov / 2))) * 1.8;
  camera.position.copy(center).add(new THREE.Vector3(dist, dist*0.8, dist));
  controls.target.copy(center);
  camera.near = Math.max(0.1, dist/1000);
  camera.far  = dist * 100;
  camera.updateProjectionMatrix();
  // adjust grid size
  const gridSize = Math.max(maxDim * 2, 50);
  gridHelper.scale.set(gridSize/400, 1, gridSize/400);
  gridHelper.position.y = box.min.y;
  // info
  info.textContent =
    `size  ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm\n` +
    `bbox  min(${box.min.x.toFixed(1)}, ${box.min.y.toFixed(1)}, ${box.min.z.toFixed(1)})`;
}

async function loadSTL(buffer) {
  ensureThree();
  clearModel();
  const geom = new STLLoader().parse(buffer);
  geom.computeVertexNormals();
  geom.computeBoundingBox();
  // center XZ, sit on Y=min
  geom.center();
  const box = new THREE.Box3().setFromBufferAttribute(geom.attributes.position);
  geom.translate(0, -box.min.y, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: $('colorPick').value, metalness: 0.05, roughness: 0.75, flatShading: false
  });
  currentMesh = new THREE.Mesh(geom, mat);
  scene.add(currentMesh);
  show('3d'); fitView();
}

async function load3MF(buffer) {
  ensureThree();
  clearModel();
  const loader = new ThreeMFLoader();
  const obj = loader.parse(buffer);
  // 3MF is Z-up by default; convert to Y-up
  obj.rotation.x = -Math.PI / 2;
  scene.add(obj);
  currentMesh = obj;
  applyColor($('colorPick').value);
  show('3d'); fitView();
}

// ---- entrypoint ----
async function loadFromBlob(name, blob) {
  const kind = detectKind(name);
  kindBadge.textContent = kind ? kind.toUpperCase() : 'unknown';
  if (!kind) return showError(`Unsupported file: ${name}\nSupported: .md, .stl, .3mf`);
  try {
    if (kind === 'md') {
      renderMarkdown(await blob.text());
    } else {
      const buf = await blob.arrayBuffer();
      if (kind === 'stl') await loadSTL(buf);
      else                await load3MF(buf);
    }
    document.title = `${name} — localViewer`;
  } catch (e) {
    console.error(e);
    showError(`Failed to load ${name}\n\n${e.message || e}`);
  }
}

async function loadFromURL(url) {
  const name = url.split(/[?#]/)[0].split('/').pop() || 'remote';
  const res = await fetch(url);
  if (!res.ok) return showError(`Fetch failed: HTTP ${res.status}\n${url}`);
  const blob = await res.blob();
  return loadFromBlob(name, blob);
}

// ---- input handlers ----
picker.addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (f) loadFromBlob(f.name, f);
});

['dragenter','dragover'].forEach(ev =>
  window.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave','drop'].forEach(ev =>
  window.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
window.addEventListener('drop', (e) => {
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFromBlob(f.name, f);
});

// ---- File Handling API: launched from the OS (installed PWA) ----
// When localViewer is installed, Edge/Chrome register it as a handler for
// .md/.stl/.3mf. Opening such a file from Explorer launches the app and
// delivers the file here — no local server, no PowerShell.
if ('launchQueue' in window && 'LaunchParams' in window) {
  launchQueue.setConsumer(async (launchParams) => {
    if (!launchParams.files || !launchParams.files.length) return;
    try {
      const handle = launchParams.files[0];
      const file = await handle.getFile();
      loadFromBlob(file.name, file);
    } catch (e) {
      console.error(e);
      showError('Failed to open the launched file.\n\n' + (e.message || e));
    }
  });
}

// ---- auto-load via ?src= (used by the local PowerShell helper) ----
const params = new URLSearchParams(location.search);
const src = params.get('src');
if (src) loadFromURL(src);
