import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { fileMeta } from './src/format.js';
import { renderFileMeta } from './src/header.js';
import { TabStore } from './src/tabs.js';
import { renderTabBar } from './src/tabbar.js';

const $ = (id) => document.getElementById(id);
const drop = $('drop'), mdEl = $('md'), threeEl = $('three'),
      panel = $('panel'), info = $('info'), err = $('err'),
      kindBadge = $('kindBadge'), picker = $('picker'),
      fileInfo = $('fileInfo'), fileName = $('fileName'), filePath = $('filePath'),
      openFolderBtn = $('openFolderBtn'), tabbar = $('tabbar');

// The folder of the file currently shown, for "Open folder".
let activeFolder = '';

// One tab per open document. Switching tabs re-renders from the cached payload.
const store = new TabStore();

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

// ---- header: file name / path + "open folder" ----
function setActiveFileMeta(meta) {
  activeFolder = renderFileMeta(
    { fileInfo, fileName, filePath, openFolderBtn }, meta);
}

async function openContainingFolder() {
  if (!activeFolder) {
    showToast('No folder path is available — sandboxed browsers hide local file paths.');
    return;
  }
  try {
    await navigator.clipboard.writeText(activeFolder);
    showToast('Folder path copied to clipboard:\n' + activeFolder);
  } catch {
    showToast('Containing folder:\n' + activeFolder);
  }
}
openFolderBtn.addEventListener('click', openContainingFolder);

// Bridge to the install toast defined in index.html (falls back to console).
function showToast(msg, ms) {
  if (typeof window.showToast === 'function') return window.showToast(msg, ms);
  console.log(msg);
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

// ---- tabs: render the active document, redraw the tab strip ----
function renderActive() {
  const tab = store.active;
  if (!tab) {
    kindBadge.textContent = 'no file';
    setActiveFileMeta(null);
    show('drop');
    return;
  }
  kindBadge.textContent = tab.kind.toUpperCase();
  setActiveFileMeta(tab.meta);
  if (tab.kind === 'md') renderMarkdown(tab.payload.text);
  else if (tab.kind === 'stl') loadSTL(tab.payload.buffer);
  else if (tab.kind === '3mf') load3MF(tab.payload.buffer);
}

store.subscribe(() => {
  renderTabBar(tabbar, store, {
    onActivate: (id) => store.activate(id),
    onClose:    (id) => store.close(id)
  });
  renderActive();
});

// ---- entrypoint ----
// `source` is the most informative locator we have (full URL, ?path=, or just
// the file name) and drives the header path display + "Open folder".
async function loadFromBlob(name, blob, source) {
  const meta = fileMeta(name, source);
  if (!meta.kind) {
    kindBadge.textContent = 'unknown';
    return showError(`Unsupported file: ${name}\nSupported: .md, .yaml, .stl, .3mf`);
  }
  try {
    const payload = meta.kind === 'md'
      ? { text: await blob.text() }
      : { buffer: await blob.arrayBuffer() };
    store.open({ name, source: meta.source, kind: meta.kind, meta, payload });
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
  return loadFromBlob(name, blob, url);
}

function loadFiles(files) {
  for (const f of files) loadFromBlob(f.name, f);
}

// ---- input handlers ----
picker.addEventListener('change', (e) => {
  if (e.target.files?.length) loadFiles(e.target.files);
  e.target.value = ''; // allow re-opening the same file
});

['dragenter','dragover'].forEach(ev =>
  window.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave','drop'].forEach(ev =>
  window.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
window.addEventListener('drop', (e) => {
  if (e.dataTransfer?.files?.length) loadFiles(e.dataTransfer.files);
});

// ---- File Handling API: launched from the OS (installed PWA) ----
// When localViewer is installed, Edge/Chrome register it as a handler for
// .md/.stl/.3mf. Opening such a file from Explorer launches the app and
// delivers the file here — no local server, no PowerShell.
if ('launchQueue' in window && 'LaunchParams' in window) {
  launchQueue.setConsumer(async (launchParams) => {
    if (!launchParams.files || !launchParams.files.length) return;
    try {
      for (const handle of launchParams.files) {
        const file = await handle.getFile();
        await loadFromBlob(file.name, file);
      }
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
