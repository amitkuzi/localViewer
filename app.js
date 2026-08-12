import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { unzipSync, strFromU8 } from 'fflate';
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
import { parse3MFParts } from './src/threemf.js';

const $ = (id) => document.getElementById(id);
const drop = $('drop'), mdWrap = $('mdWrap'), mdEl = $('md'), mdEdit = $('mdEdit'),
      mdEditToggle = $('mdEditToggle'), mdSaveBtn = $('mdSaveBtn'), mdDirty = $('mdDirty'),
      mdDirSel = $('mdDir'),
      newMdBtn = $('newMdBtn'), threeEl = $('three'),
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
  mdWrap.style.display  = view === 'md'    ? 'flex' : 'none';
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

// ---- Markdown: rendered preview + raw-source edit toggle ----
function renderMarkdown(text, dir) {
  marked.setOptions({ gfm: true, breaks: false });
  const html = DOMPurify.sanitize(marked.parse(text));
  mdEl.innerHTML = html;
  applyTextDirection(mdEl, dir);
}

function renderMdTab(tab) {
  tab.dir = tab.dir || 'auto';
  mdSaveBtn.disabled = false;
  mdDirty.textContent = tab.dirty ? 'unsaved changes' : '';
  mdDirSel.value = tab.dir;
  if (tab.editing) {
    if (document.activeElement !== mdEdit) mdEdit.value = tab.payload.text;
    mdEdit.dir = tab.dir;
    mdEdit.style.display = 'block';
    mdEl.style.display = 'none';
    mdEditToggle.textContent = 'Preview';
  } else {
    mdEdit.style.display = 'none';
    mdEl.style.display = 'block';
    renderMarkdown(tab.payload.text, tab.dir);
    mdEditToggle.textContent = 'Edit';
  }
  show('md');
}

mdDirSel.addEventListener('change', () => {
  const tab = store.active;
  if (!tab || tab.kind !== 'md') return;
  tab.dir = mdDirSel.value;
  renderMdTab(tab);
});

mdEditToggle.addEventListener('click', () => {
  const tab = store.active;
  if (!tab || tab.kind !== 'md') return;
  tab.editing = !tab.editing;
  renderMdTab(tab);
  if (tab.editing) mdEdit.focus();
});

mdEdit.addEventListener('input', () => {
  const tab = store.active;
  if (!tab || tab.kind !== 'md') return;
  tab.payload.text = mdEdit.value;
  tab.dirty = true;
  mdDirty.textContent = 'unsaved changes';
  renderTabBar(tabbar, store, tabBarHandlers);
});

mdEdit.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveActiveMd(); }
});

async function saveActiveMd() {
  const tab = store.active;
  if (!tab || tab.kind !== 'md') return;
  try {
    let handle = tab.payload.handle;
    if (!handle) {
      if (!window.showSaveFilePicker) return downloadMd(tab);
      handle = await window.showSaveFilePicker({
        suggestedName: tab.name || 'untitled.md',
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }]
      });
      tab.payload.handle = handle;
      tab.name = handle.name;
    }
    const writable = await handle.createWritable();
    await writable.write(tab.payload.text);
    await writable.close();
    tab.dirty = false;
    mdDirty.textContent = '';
    renderTabBar(tabbar, store, tabBarHandlers);
    showToast('Saved ' + tab.name);
  } catch (e) {
    if (e.name !== 'AbortError') showToast('Save failed: ' + (e.message || e));
  }
}
mdSaveBtn.addEventListener('click', saveActiveMd);

// Browsers without the File System Access API (no showSaveFilePicker) fall
// back to a plain download — the user re-saves it over the original by hand.
function downloadMd(tab) {
  const blob = new Blob([tab.payload.text], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = tab.name || 'untitled.md';
  a.click();
  URL.revokeObjectURL(url);
  tab.dirty = false;
  mdDirty.textContent = '';
  renderTabBar(tabbar, store, tabBarHandlers);
}

let untitledSeq = 0;
function newMdFile() {
  const name = 'untitled.md';
  const source = `untitled-${++untitledSeq}`;
  store.open({
    name, source, kind: 'md', meta: fileMeta(name, source),
    payload: { text: '', handle: null }, editing: true
  });
}
newMdBtn.addEventListener('click', newMdFile);

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

// `data` is an ArrayBuffer (binary STL) or a string (ASCII STL, e.g. what the
// OpenSCAD compiler hands us). `zUp` rotates Z-up sources into the Y-up scene.
async function loadSTL(data, zUp = false) {
  ensureThree();
  clearModel();
  showGeometry(new STLLoader().parse(data), zUp);
}

// Center a geometry, sit it on the grid and display it. `zUp` rotates Z-up
// sources (3MF, OpenSCAD) into the Y-up scene.
function showGeometry(geom, zUp = false) {
  if (zUp) geom.rotateX(-Math.PI / 2);
  geom.computeVertexNormals();
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

// three's ThreeMFLoader can't follow the production extension's cross-part
// `p:path` references, which is how every slicer saves multi-object/multi-plate
// projects — see src/threemf.js.
async function load3MF(buffer) {
  ensureThree();
  clearModel();
  try {
    const zip = unzipSync(new Uint8Array(buffer), { filter: (f) => /\.model$/i.test(f.name) });
    const parts = {};
    for (const [name, bytes] of Object.entries(zip)) parts[name] = strFromU8(bytes);
    const positions = parse3MFParts(parts);
    if (!positions.length) return showError('No mesh geometry found in this 3MF file.');
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    showGeometry(geom, true); // 3MF is Z-up
  } catch (e) {
    console.error(e);
    showError('Failed to load 3MF file.\n\n' + (e.message || e));
  }
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

// ---- OpenSCAD (.scad, compiled in the browser by openscad-wasm) ----
// The engine is ~14 MB, so it's imported lazily on first use — same deal as the
// STEP importer above. It compiles the source to ASCII STL, which the STL path
// already knows how to draw.
// ponytail: no include<>/use<> resolution — the WASM filesystem only holds the
// one file we write. Mount the sibling files if multi-file projects show up.
let scadPromise = null;
let scadLog = [];
function ensureScad() {
  if (!scadPromise) {
    scadPromise = import('openscad-wasm')
      .then(m => m.createOpenSCAD({ printErr: (t) => scadLog.push(t) }));
  }
  return scadPromise;
}

async function loadSCAD(text) {
  showToast('Compiling OpenSCAD… the first run downloads the ~14 MB engine.', 20000);
  try {
    const scad = await ensureScad();
    scadLog = [];
    const stl = await scad.renderToStl(text);
    await loadSTL(stl, true); // OpenSCAD is Z-up
  } catch (e) {
    console.error(e);
    showError('OpenSCAD could not compile this file.\n\n'
      + (scadLog.join('\n') || e.message || e));
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
  if (tab.kind === 'md') renderMdTab(tab);
  else if (tab.kind === 'yaml') renderYamlDoc(tab.payload.text);
  else if (tab.kind === 'csv') renderCsvDoc(tab.payload.text);
  else if (tab.kind === 'image') renderImage(tab.payload.url);
  else if (tab.kind === 'stl') loadSTL(tab.payload.buffer);
  else if (tab.kind === '3mf') load3MF(tab.payload.buffer);
  else if (tab.kind === 'step') loadSTEP(tab.payload.buffer);
  else if (tab.kind === 'scad') loadSCAD(tab.payload.text);
}

// Free the blob URL backing an image tab so closing/refreshing it doesn't leak.
function revokeTabURL(id) {
  const tab = store.tabs.find(t => t.id === id);
  if (tab?.kind === 'image' && tab.payload?.url) URL.revokeObjectURL(tab.payload.url);
}

const tabBarHandlers = {
  onActivate: (id) => store.activate(id),
  onClose: (id) => {
    const tab = store.tabs.find(t => t.id === id);
    if (tab?.dirty && !confirm(`Discard unsaved changes to "${tab.name}"?`)) return;
    revokeTabURL(id);
    store.close(id);
  }
};

store.subscribe(() => {
  renderTabBar(tabbar, store, tabBarHandlers);
  renderActive();
});

// ---- entrypoint ----
// `source` is the most informative locator we have (full URL, ?path=, or just
// the file name) and drives the header path display + "Open folder".
async function loadFromBlob(name, blob, source, handle) {
  const meta = fileMeta(name, source);
  if (!meta.kind) {
    kindBadge.textContent = 'unknown';
    return showError(`Unsupported file: ${name}\nSupported: .md, .yaml, .csv, .stl, .3mf, .step, .stp, .scad, .svg, images`);
  }
  try {
    let payload;
    if (['md', 'yaml', 'csv', 'scad'].includes(meta.kind)) payload = { text: await blob.text() };
    else if (meta.kind === 'image') payload = { url: URL.createObjectURL(blob) };
    else payload = { buffer: await blob.arrayBuffer() };
    // A FileSystemFileHandle (only available when launched via the OS file
    // handler) lets the md editor write straight back to disk on Save.
    if (handle && meta.kind === 'md') payload.handle = handle;
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
        await loadFromBlob(file.name, file, undefined, handle);
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
