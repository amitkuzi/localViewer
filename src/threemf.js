// Geometry reader for 3MF, including the production extension.
//
// three.js's ThreeMFLoader ignores `p:path`: it merges every `.model` part in
// the archive into one flat object-id map and resolves `<component>` ids
// against the *containing* part. Slicer projects (Bambu Studio, OrcaSlicer,
// PrusaSlicer) split objects into 3D/Objects/*.model whose ids restart at 1,
// so those files either render the wrong mesh (id collision between parts) or
// throw on the first cross-part component — which is why some .3mf files
// showed nothing at all.
//
// The viewer repaints every mesh with the picked colour anyway, so materials
// and textures are dropped here: the result is one flat triangle soup in 3MF's
// own millimetre, Z-up space.

const PROD_NS = 'http://schemas.microsoft.com/3dmanufacturing/production/2015/06';
const MAX_DEPTH = 12; // guards against components referencing each other in a cycle

// A 3MF transform is 12 numbers in row-vector order — three basis rows then
// the translation row, i.e. p' = p * M + t.
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

function readTransform(el) {
  const raw = el.getAttribute('transform');
  if (!raw) return IDENTITY;
  const n = raw.trim().split(/\s+/).map(Number);
  return n.length === 12 && n.every(Number.isFinite) ? n : IDENTITY;
}

// Compose so that `a` is applied first, then `b`.
function multiply(a, b) {
  const out = new Array(12);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]
                     + (r === 3 ? b[9 + c] : 0);
    }
  }
  return out;
}

// querySelectorAll, not getElementsByTagName: the latter returns a *live*
// collection, and indexing one in a loop is quadratic on the vertex lists of a
// real model (jsdom took minutes on a file the browser draws instantly).
const tags = (el, name) => el.querySelectorAll(name);
const normalize = (path) => String(path).replace(/^\/+/, '');

// A mesh referenced by N build items is parsed once and instanced N times.
const meshCache = new WeakMap();

function readMesh(mesh) {
  let data = meshCache.get(mesh);
  if (data) return data;

  const vertexNodes = tags(mesh, 'vertex');
  const count = vertexNodes.length;
  const verts = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const v = vertexNodes[i];
    verts[i * 3]     = +v.getAttribute('x');
    verts[i * 3 + 1] = +v.getAttribute('y');
    verts[i * 3 + 2] = +v.getAttribute('z');
  }

  const triangleNodes = tags(mesh, 'triangle');
  const idx = [];
  for (let i = 0; i < triangleNodes.length; i++) {
    const t = triangleNodes[i];
    const a = +t.getAttribute('v1'), b = +t.getAttribute('v2'), c = +t.getAttribute('v3');
    // Drop triangles with out-of-range indices rather than failing the file.
    if (![a, b, c].every(k => Number.isInteger(k) && k >= 0 && k < count)) continue;
    idx.push(a, b, c);
  }

  data = { verts, idx: new Uint32Array(idx) };
  meshCache.set(mesh, data);
  return data;
}

function appendMesh(mesh, m, chunks) {
  const { verts, idx } = readMesh(mesh);
  if (!idx.length) return;
  const out = new Float32Array(idx.length * 3);
  for (let i = 0; i < idx.length; i++) {
    const p = idx[i] * 3;
    const x = verts[p], y = verts[p + 1], z = verts[p + 2];
    out[i * 3]     = x * m[0] + y * m[3] + z * m[6] + m[9];
    out[i * 3 + 1] = x * m[1] + y * m[4] + z * m[7] + m[10];
    out[i * 3 + 2] = x * m[2] + y * m[5] + z * m[8] + m[11];
  }
  chunks.push(out);
}

// Emit the triangles of one object, following `<component>` references into
// whichever model part `p:path` names.
function emit(index, path, objectId, matrix, chunks, depth) {
  if (depth > MAX_DEPTH) return;
  const part = index.get(path);
  const object = part && part.objects.get(objectId);
  if (!object) return; // dangling reference — skip it, still draw the rest

  const mesh = object.querySelector('mesh');
  if (mesh) return appendMesh(mesh, matrix, chunks);

  for (const component of tags(object, 'component')) {
    const target = component.getAttributeNS(PROD_NS, 'path') || component.getAttribute('p:path');
    emit(index, target ? normalize(target) : path,
         component.getAttribute('objectid'),
         multiply(readTransform(component), matrix), chunks, depth + 1);
  }
}

// `parts`: { <zip entry name>: <XML text> } for every *.model in the archive.
function indexParts(parts) {
  const index = new Map();
  for (const [name, text] of Object.entries(parts)) {
    if (!/\.model$/i.test(name)) continue;
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) continue;
    const objects = new Map();
    for (const obj of tags(doc, 'object')) {
      const id = obj.getAttribute('id');
      if (id !== null) objects.set(id, obj);
    }
    const build = doc.querySelector('build');
    index.set(normalize(name), { objects, items: build ? tags(build, 'item') : [] });
  }
  return index;
}

// The root part is the one carrying the build plate; satellite parts hold an
// empty <build/>. Cheaper and more forgiving than walking _rels/.rels.
function pickRoot(index) {
  const withItems = [...index].filter(([, part]) => part.items.length);
  if (!withItems.length) return null;
  const preferred = withItems.find(([path]) => /^3D\/3dmodel\.model$/i.test(path));
  return (preferred || withItems[0])[0];
}

/**
 * @param {Record<string, string>} parts  zip entry name -> XML text
 * @returns {Float32Array} non-indexed triangle positions, mm, Z-up
 */
export function parse3MFParts(parts) {
  const index = indexParts(parts);
  const rootPath = pickRoot(index);
  const chunks = [];

  if (rootPath) {
    for (const item of index.get(rootPath).items) {
      emit(index, rootPath, item.getAttribute('objectid'), readTransform(item), chunks, 0);
    }
  } else {
    // No build items anywhere (hand-written or truncated file): show every mesh
    // we can find rather than an empty viewport.
    for (const [path, part] of index) {
      for (const id of part.objects.keys()) emit(index, path, id, IDENTITY, chunks, 0);
    }
  }

  const positions = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { positions.set(c, at); at += c.length; }
  return positions;
}
