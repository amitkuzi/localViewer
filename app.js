import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { load as parseYaml } from 'js-yaml';
import { fileMeta, basename } from './src/format.js';
import { renderFileMeta } from './src/header.js';
import { TabStore } from './src/tabs.js';
import { renderTabBar } from './src/tabbar.js';
import { renderYamlValue, setAllOpen } from './src/yamlview.js';
import { detectDelimiter, parseCSV, renderCsvTable, columnCount } from './src/csvview.js';
import { applyTextDirection } from './src/mdview.js';

const $ = (id) => document.getElementById(id);
const drop = $('drop'), mdEl = $('md'), threeEl = $('three'),
      panel = $('panel'), info = $('info'), err = $('err'),
      kindBadge = $('kindBadge'), picker = $('picker'),
      fileInfo = $('fileInfo'), fileName = $('fileName'), filePath = $('filePath'),
      openFolderBtn = $('openFolderBtn'), tabbar = $('tabbar'),
      yamlEl = $('yaml'), yamlTree = $('yamlTree'),
      csvEl = $('csv'), csvTable = $('csvTable'), csvInfo = $('csvInfo'), csvHeaderToggle = $('csvHeaderToggle'),
      imageEl = $('image'), imgEl = $('imgEl'), imgInfo = $('imgInfo');

// The folder of the file currently shown, for "Open folder".
let activeFolder = '';

// One tab per open document. Switching tabs re-renders from the cached payload.
const store = new TabStore();

let renderer, scene, camera, controls, currentMesh, gridHelper;

// ---- view switching ----
function show(view) {
  drop.style.display    = view === 'drop'  ? 'flex' : 'none';
  mdEl.style.display    = view === 'md'    ? 'block': 'none';
  yamlEl.style.display  = view === 'yaml'  ? 'flex' : 'none';
  csvEl.style.display   = view === 'csv'   ? 'flex' : 'none';
  imageEl.style.display = view === 'image' ? 'flex' : 'none';
  threeEl.style.display = view === '3d'    ? 'block': 'none';
  panel.hidden          = view !== '3d';
  err.style.display     = view === 'err'   ? 'flex' : 'none';
  info.style.display    = view === '3d'    ? 'block': 'none';
}
function showError(msg) { err.textContent = msg; show('err'); }

// ---- YAML ----
function renderYamlDoc(text) {
  let value;
  try {
    value = parseYaml(text);
  } catch (e) {
    return showError('Invalid YAML\n\n' + (e.message || e));
  }
  renderYamlValue(yamlTree, value);
  show('yaml');
}
$('yExpand').addEventListener('click', () => setAllOpen(yamlTree, true));
$('yCollapse').addEventListener('click', () => setAllOpen(yamlTree, false));

// ---- CSV ----
let csvRows = []; // parsed rows of the currently active CSV tab

function renderCsvView() {
  renderCsvTable(csvTable, csvRows, { headerRow: csvHeaderToggle.checked });
  const cols = columnCount(csvRows);
  const dataRows = csvHeaderToggle.checked ? Math.max(csvRows.length - 1, 0) : csvRows.length;
  csvInfo.textContent = `${dataRows} rows × ${cols} cols`;
}
csvHeaderToggle.addEventListener('change', renderCsvView);

function renderCsvDoc(text) {
  csvRows = parseCSV(text, detectDelimiter(text));
  renderCsvView();
  show('csv');
}

// ---- header: file name / path + "open folder" ----
function setActiveFileMeta(meta) {
  activeFolder = renderFileMeta(
    { fileInfo, fileName, filePath, openFolderBtn }, meta);
}

// True when served by the local PowerShell helper (loopback origin), which can
// actually open Explorer for us via its /__open-folder endpoint.
const onHelper = ['127.0.0.1', 'localhost'].includes(location.hostname);

async function openContainingFolder() {
  // Best case: the Windows helper reveals the file in Explorer.
  if (onHelper) {
    try {
      const res = await fetch('/__open-folder', { method: 'POST' });
      if (res.ok) { showToast('Revealed the file in Explorer.'); return; }
    } catch { /* fall through to clipboard */ }
  }
  // Otherwise we can only work with whatever path we were given.
  if (activeFolder) {
    try {
      await navigator.clipboard.writeText(activeFolder);
      showToast('Folder path copied to clipboard:\n' + activeFolder);
    } catch {
      showToast('Containing folder:\n' + activeFolder);
    }
    return;
  }
  showToast('Browsers hide local file paths from the file picker.\n'
    + 'Right-click the file → Open with → localViewer to enable Explorer integration.', 9000);
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
  applyTextDirection(mdEl);
  show('md');
}

// ---- Images (SVG + raster) ----
// A lightweight pan/zoom viewer: the <img> is transformed with scale+translate;
// wheel zooms toward the cursor, drag pans, and Fit/100% reset the view.
const imgView = { scale: 1, tx: 0, ty: 0, natW: 0, natH: 0 };

function applyImgTransform() {
  imgEl.style.transform =
    `translate(${imgView.tx}px, ${imgView.ty}px) scale(${imgView.scale})`;
}

function updateImgInfo() {
  const pct = Math.round(imgView.scale * 100);
  imgInfo.textContent = imgView.natW
    ? `${imgView.natW} × ${imgView.natH}px · ${pct}%`
    : `${pct}%`;
}

// Centre the image in the viewport at a given scale.
function centreImg(scale) {
  const r = imageEl.getBoundingClientRect();
  imgView.scale = scale;
  imgView.tx = (r.width  - imgView.natW * scale) / 2;
  imgView.ty = (r.height - imgView.natH * scale) / 2;
  applyImgTransform();
  updateImgInfo();
}

// Scale so the whole image fits, but never enlarge past 100%.
function fitImg() {
  const r = imageEl.getBoundingClientRect();
  if (!imgView.natW || !r.width) return;
  const s = Math.min(r.width / imgView.natW, r.height / imgView.natH, 1);
  centreImg(s);
}

// Zoom by `factor` keeping the point (cx,cy) — in viewport coords — fixed.
function zoomImgAt(factor, cx, cy) {
  const r = imageEl.getBoundingClientRect();
  const px = cx - r.left, py = cy - r.top;
  const next = Math.min(Math.max(imgView.scale * factor, 0.05), 40);
  const k = next / imgView.scale;
  imgView.tx = px - (px - imgView.tx) * k;
  imgView.ty = py - (py - imgView.ty) * k;
  imgView.scale = next;
  applyImgTransform();
  updateImgInfo();
}

function centreZoom(factor) {
  const r = imageEl.getBoundingClientRect();
  zoomImgAt(factor, r.left + r.width / 2, r.top + r.height / 2);
}

function renderImage(url) {
  imgView.scale = 1; imgView.tx = 0; imgView.ty = 0;
  imgEl.onload = () => {
    // SVGs may report 0 natural size when they lack intrinsic dimensions.
    imgView.natW = imgEl.naturalWidth  || imgEl.width  || 300;
    imgView.natH = imgEl.naturalHeight || imgEl.height || 300;
    fitImg();
  };
  imgEl.onerror = () => showError('Could not decode this image.');
  imgEl.src = url;
  show('image');
}

// --- image view controls (bound once) ---
$('imgZoomIn').addEventListener('click',  () => centreZoom(1.25));
$('imgZoomOut').addEventListener('click', () => centreZoom(1 / 1.25));
$('imgFit').addEventListener('click', fitImg);
$('imgActual').addEventListener('click', () => centreImg(1));
$('imgBg').addEventListener('change', (e) => {
  imageEl.classList.remove('bg-dark', 'bg-check', 'bg-light');
  imageEl.classList.add(e.target.value);
});
imageEl.classList.add('bg-dark');

imageEl.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomImgAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
}, { passive: false });

let imgDrag = null;
imageEl.addEventListener('pointerdown', (e) => {
  imgDrag = { x: e.clientX, y: e.clientY, tx: imgView.tx, ty: imgView.ty };
  imageEl.setPointerCapture(e.pointerId);
  imageEl.classList.add('dragging');
});
imageEl.addEventListener('pointermove', (e) => {
  if (!imgDrag) return;
  imgView.tx = imgDrag.tx + (e.clientX - imgDrag.x);
  imgView.ty = imgDrag.ty + (e.clientY - imgDrag.y);
  applyImgTransform();
});
const endImgDrag = () => { imgDrag = null; imageEl.classList.remove('dragging'); };
imageEl.addEventListener('pointerup', endImgDrag);
imageEl.addEventListener('pointercancel', endImgDrag);

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

// ---- STEP (via occt-import-js: WASM OpenCascade, tessellates B-rep to meshes) ----
// Loaded as a classic script in index.html, which defines the global factory
// `occtimportjs`. Instantiating the WASM module is expensive, so it's done
// once, lazily, on first use rather than at page load.
let occtPromise = null;
function ensureOcct() {
  if (!occtPromise) {
    if (typeof window.occtimportjs !== 'function') {
      return Promise.reject(new Error('STEP importer failed to load (occt-import-js script missing).'));
    }
    occtPromise = window.occtimportjs();
  }
  return occtPromise;
}

async function loadSTEP(buffer) {
  ensureThree();
  clearModel();
  try {
    const occt = await ensureOcct();
    const result = occt.ReadStepFile(new Uint8Array(buffer), null);
    if (!result.success || !result.meshes.length) {
      return showError('Could not parse this STEP file (unsupported or corrupt).');
    }
    const group = new THREE.Group();
    for (const mesh of result.meshes) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3));
      if (mesh.attributes.normal) {
        geom.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3));
      } else {
        geom.computeVertexNormals();
      }
      geom.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.index.array), 1));
      const mat = new THREE.MeshStandardMaterial({ metalness: 0.05, roughness: 0.75 });
      group.add(new THREE.Mesh(geom, mat));
    }
    // STEP (like 3MF) is Z-up by convention in CAD tools; convert to Y-up.
    group.rotation.x = -Math.PI / 2;
    scene.add(group);
    currentMesh = group;
    applyColor($('colorPick').value);
    show('3d'); fitView();
  } catch (e) {
    console.error(e);
    showError('Failed to load STEP file.\n\n' + (e.message || e));
  }
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
  else if (tab.kind === 'yaml') renderYamlDoc(tab.payload.text);
  else if (tab.kind === 'csv') renderCsvDoc(tab.payload.text);
  else if (tab.kind === 'image') renderImage(tab.payload.url);
  else if (tab.kind === 'stl') loadSTL(tab.payload.buffer);
  else if (tab.kind === '3mf') load3MF(tab.payload.buffer);
  else if (tab.kind === 'step') loadSTEP(tab.payload.buffer);
}

// Free the blob URL backing an image tab so closing/refreshing it doesn't leak.
function revokeTabURL(id) {
  const tab = store.tabs.find(t => t.id === id);
  if (tab?.kind === 'image' && tab.payload?.url) URL.revokeObjectURL(tab.payload.url);
}

store.subscribe(() => {
  renderTabBar(tabbar, store, {
    onActivate: (id) => store.activate(id),
    onClose:    (id) => { revokeTabURL(id); store.close(id); }
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
    return showError(`Unsupported file: ${name}\nSupported: .md, .yaml, .csv, .stl, .3mf, .step, .stp, .svg, images`);
  }
  try {
    let payload;
    if (meta.kind === 'md' || meta.kind === 'yaml' || meta.kind === 'csv') payload = { text: await blob.text() };
    else if (meta.kind === 'image') payload = { url: URL.createObjectURL(blob) };
    else payload = { buffer: await blob.arrayBuffer() };
    // Re-opening the same source replaces the tab's payload; free the old
    // object URL first so we don't leak blobs.
    const prior = store.tabs.find(t => t.source === meta.source);
    if (prior) revokeTabURL(prior.id);
    store.open({ name, source: meta.source, kind: meta.kind, meta, payload });
  } catch (e) {
    console.error(e);
    showError(`Failed to load ${name}\n\n${e.message || e}`);
  }
}

// `sourceOverride` is the real on-disk path when the Windows helper passes
// ?path=; it drives the header path display and "Open folder".
async function loadFromURL(url, sourceOverride) {
  const name = (sourceOverride ? basename(sourceOverride) : url.split(/[?#]/)[0].split('/').pop())
    || 'remote';
  const res = await fetch(url);
  if (!res.ok) return showError(`Fetch failed: HTTP ${res.status}\n${url}`);
  const blob = await res.blob();
  return loadFromBlob(name, blob, sourceOverride || url);
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
// ?path= carries the real on-disk path so the header can show it and the
// "Open folder" button can reveal the file in Explorer.
const params = new URLSearchParams(location.search);
const src = params.get('src');
const path = params.get('path');
if (src) loadFromURL(src, path || undefined);
