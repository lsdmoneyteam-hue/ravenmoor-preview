// Ravenmoor 3D property explorer, version 2. One engine, three demo buildings (see buildings.js).
// Everything is generated in code from the floor plans: walls, windows, doors, furniture, the setting
// around the building and the light. No model files are downloaded.
// Opening a floor works like an X-ray: everything above fades away in place and is left as a faint outline.
import * as THREE from 'three';
import { OrbitControls } from './lib/OrbitControls.js';
import { mergeGeometries } from './lib/BufferGeometryUtils.js';
import { RoomEnvironment } from './lib/RoomEnvironment.js';
import { RoundedBoxGeometry } from './lib/RoundedBoxGeometry.js';

const COMMUNAL = new Set(['corridor', 'lobby']);
const OUTSIDE = new Set(['balcony', 'terrace']);
const LIVE = new Set(['hall', 'open', 'living', 'kitchen', 'dining']);
const BIG = 1e4;
const rad = d => d * Math.PI / 180;
const ft = m => { const t = m * 3.28084; const f = Math.floor(t); const i = Math.round((t - f) * 12); return i === 12 ? `${f + 1}'0"` : `${f}'${i}"`; };
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rng = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(42);

// ---------- textures drawn in code (made once, shared) ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
const tint = (base, dh, ds, dl) => '#' + new THREE.Color(base).offsetHSL((rng() - .5) * dh, (rng() - .5) * ds, (rng() - .5) * dl).getHexString();
function brickTex(base, mortar = '#b9b2a6') {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = mortar; g.fillRect(0, 0, w, h);
    const bh = 16, bw = 64;
    for (let row = 0; row < h / bh; row++) for (let col = -1; col < w / bw + 1; col++) {
      g.fillStyle = tint(base, .02, .08, .1); g.fillRect(col * bw + (row % 2 ? bw / 2 : 0) + 1.5, row * bh + 1.5, bw - 3, bh - 3);
    }
  });
}
function plankTex(base, n = 8, across = false) {
  return canvasTex(256, 256, (g, w, h) => {
    for (let i = 0; i < n; i++) {
      const s = h / n;
      g.fillStyle = tint(base, .015, .04, .07); if (across) g.fillRect(i * s, 0, s, h); else g.fillRect(0, i * s, w, s);
      g.strokeStyle = 'rgba(40,25,10,.16)'; g.lineWidth = 1;
      for (let k = 0; k < 5; k++) { g.beginPath(); const y = i * s + 3 + rng() * (s - 6); if (across) { g.moveTo(y, 0); g.bezierCurveTo(y + 2, h * .3, y - 2, h * .6, y + 1, h); } else { g.moveTo(0, y); g.bezierCurveTo(w * .3, y + 2, w * .6, y - 2, w, y + 1); } g.stroke(); }
      g.fillStyle = 'rgba(20,12,5,.45)'; if (across) g.fillRect(i * s, 0, 1.5, h); else { g.fillRect(0, i * s, w, 1.5); g.fillRect(((i * 97) % 5) * 51, i * s, 1.5, s); }
    }
  });
}
function tileTex(c1, c2, n = 4, vary = .03) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = c2; g.fillRect(0, 0, w, h);
    const s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = tint(c1, 0, 0, vary); g.fillRect(i * s + 1, j * s + 1, s - 2, s - 2); }
  });
}
function slateTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#23262a'; g.fillRect(0, 0, w, h);
    const s = 32;
    for (let j = 0; j < h / s; j++) for (let i = -1; i < w / s + 1; i++) { g.fillStyle = tint('#3b4046', .02, .03, .06); g.fillRect(i * s + (j % 2 ? s / 2 : 0) + 1, j * s + 2, s - 2, s - 3); }
  });
}
function seamTex(base) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(i * 32, 0, 2, h); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(i * 32 + 2, 0, 2, h); }
  });
}
function grassTex(stripes) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#5c7c40'; g.fillRect(0, 0, w, h);
    if (stripes) { g.fillStyle = '#688a48'; g.fillRect(0, 0, w / 2, h); }
    g.globalAlpha = .5;
    for (let i = 0; i < 9000; i++) { g.fillStyle = tint('#62833f', .04, .1, .1); g.fillRect(rng() * w, rng() * h, 2, 3); }
    g.globalAlpha = 1;
  });
}
function facadeTex(kind) {
  const cols = 8, rows = 16;
  const map = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = kind === 'glass' ? '#39434d' : kind === 'brick' ? '#7d4a38' : '#c2bcb1'; g.fillRect(0, 0, w, h);
    const cw = w / cols, rh = h / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      g.fillStyle = kind === 'glass' ? `rgb(${78 + rng() * 22},${98 + rng() * 22},${118 + rng() * 22})` : '#27303a';
      if (kind === 'glass') g.fillRect(i * cw + .8, j * rh + .8, cw - 1.6, rh - 3); else g.fillRect(i * cw + cw * .2, j * rh + rh * .18, cw * .6, rh * .62);
    }
  });
  const em = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const cw = w / cols, rh = h / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if (rng() < .4) {
      const v = 190 + rng() * 60; g.fillStyle = `rgb(${v},${v * .76},${v * .5})`;
      if (kind === 'glass') g.fillRect(i * cw + 1, j * rh + 1, cw - 2, rh - 3); else g.fillRect(i * cw + cw * .2, j * rh + rh * .18, cw * .6, rh * .62);
    }
  });
  return [map, em];
}
function artTex(seed) {
  return canvasTex(128, 128, (g, w, h) => {
    const pal = [['#e9e2d2', '#c8913a', '#2f4a45', '#1f2326'], ['#dfe5e6', '#5d7f95', '#d9b89a', '#27323a'], ['#efe7df', '#b0624c', '#566b4f', '#e0c37a']][seed % 3];
    g.fillStyle = pal[0]; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) { g.fillStyle = pal[1 + (i % 3)]; g.globalAlpha = .85; g.beginPath(); g.arc(20 + rng() * 88, 20 + rng() * 88, 14 + rng() * 30, 0, 7); g.fill(); }
    g.globalAlpha = 1; g.fillStyle = pal[3]; g.fillRect(0, h * .72, w, 3);
  });
}
function booksTex() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#2a211a'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) { let x = 2; while (x < w - 4) { const bw = 4 + rng() * 7; g.fillStyle = tint(['#8a3b2e', '#2f4a45', '#c8913a', '#d8d2c4', '#3a4a66'][Math.floor(rng() * 5)], .02, .1, .1); const bh = 20 + rng() * 8; g.fillRect(x, r * 32 + 30 - bh, bw - 1, bh); x += bw; } g.fillStyle = '#5a4433'; g.fillRect(0, r * 32 + 30, w, 2); }
  });
}
let TX = null;
function weaveTex(seed = 1) {
  return canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#e9e9e9'; g.fillRect(0, 0, w, h); let s = seed * 9301 + 7; const rn = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { const v = 205 + Math.floor(rn() * 50) - ((x + y) % 4 === 0 ? 14 : 0); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 2, 2); } });
}
function textures() {
  if (TX) return TX;
  const [fmG, feG] = facadeTex('glass'), [fmB, feB] = facadeTex('brick'), [fmS, feS] = facadeTex('stone');
  return TX = {
    brickRed: brickTex('#9a5038'), brickDark: brickTex('#4e4441', '#8c867c'), brickBuff: brickTex('#c0a27c', '#cfc8ba'), brickNb: brickTex('#8c4a35'),
    oak: plankTex('#b9946c'), deck: plankTex('#a88a68', 10), clad: plankTex('#26282b', 12, true),
    tile: tileTex('#dcd8d0', '#bdb8ae', 4), lobby: tileTex('#e2ddd3', '#cfc9be', 2), pave: tileTex('#bdb8ad', '#a39e94', 4, .05), block: tileTex('#9c8f7f', '#7d7266', 8, .08),
    slate: slateTex(), zinc: seamTex('#4a5158'), grass: grassTex(false), lawn: grassTex(true),
    fmG, feG, fmB, feB, fmS, feS, art: [artTex(0), artTex(1), artTex(2)], books: booksTex(),
  };
}

// ---------- geometry helpers ----------
function scaleUV(g, s) { const uv = g.attributes.uv; if (!uv || !s) return g; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / s, uv.getY(i) / s); return g; }
function boxGeo(w, h, d, uvS) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (uvS) { const uv = g.attributes.uv, s = 1 / uvS, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] * s, uv.getY(i) * dims[f][1] * s); } }
  return g;
}
// collects shapes per material, then merges them into one mesh per material
// Props modelled in Blender (3d/props/*.glb): each assembly is a list of { geometry, material name, where every copy sits }.
export const PROPS = {};
export async function loadProps(url) {
  try {
    const buf = await (await fetch(url)).arrayBuffer(), dv = new DataView(buf); if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('not a glb');
    const jl = dv.getUint32(12, true), J = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl))), bin = buf.slice(20 + jl + 8);
    const acc = i => { const a = J.accessors[i], bv = J.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type], C = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType]; return new THREE.BufferAttribute(new C(bin, (bv.byteOffset || 0) + (a.byteOffset || 0), a.count * n), n); };
    const geos = J.meshes.map(m => m.primitives.map(pr => { const g = new THREE.BufferGeometry(); g.setAttribute('position', acc(pr.attributes.POSITION)); g.setAttribute('normal', acc(pr.attributes.NORMAL)); g.setIndex(acc(pr.indices)); return { geo: g, mat: J.materials[pr.material].name }; }));
    const walk = (ni, M, out) => { const n = J.nodes[ni], L = new THREE.Matrix4(); if (n.matrix) L.fromArray(n.matrix); else L.compose(new THREE.Vector3(...(n.translation || [0, 0, 0])), new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(n.scale || [1, 1, 1]))); const W = M.clone().multiply(L);
      if (n.mesh != null) geos[n.mesh].forEach(pr => { let e = out.find(o => o.geo === pr.geo); if (!e) out.push(e = { geo: pr.geo, mat: pr.mat, at: [] }); e.at.push(W); }); (n.children || []).forEach(c => walk(c, W, out)); };
    J.scenes[J.scene || 0].nodes.forEach(ni => { const out = []; walk(ni, new THREE.Matrix4(), out); PROPS[J.nodes[ni].name] = out; });
  } catch (e) { console.warn('props not loaded', e); }
}
class Bucket {
  constructor(mats) { this.mats = mats; this.parts = {}; this.props = []; }
  // place a Blender-built assembly; false if it has not loaded, so the caller can fall back to simple shapes
  prop(name, x, y, z, ry = 0) { if (!PROPS[name]) return false; this.props.push([name, x, y, z, ry]); return true; }
  mat(name) { const m = this.mats[name]; if (!m) throw new Error('no material ' + name); return m; }
  add(name, g) { (this.parts[name] ||= []).push(g); }
  box(mat, w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) {
    if (!(w > 0.001 && h > 0.001 && d > 0.001)) return;
    const g = boxGeo(w, h, d, this.mat(mat).userData.uv);
    if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry);
    g.translate(x, y, z); this.add(mat, g);
  }
  rbox(mat, w, h, d, x, y, z, r = .06) {
    if (!(w > 0.004 && h > 0.004 && d > 0.004)) return;
    this.mat(mat); const g = new RoundedBoxGeometry(w, h, d, 2, Math.max(.001, Math.min(r, w / 2 - .001, h / 2 - .001, d / 2 - .001))); g.translate(x, y, z); this.add(mat, g);
  }
  cyl(mat, r, h, x, y, z, rTop = r, seg = 30) { this.mat(mat); const g = new THREE.CylinderGeometry(rTop, r, h, seg); g.translate(x, y, z); this.add(mat, g); }
  ball(mat, r, x, y, z, sy = 1, detail = 2) { this.mat(mat); const g = new THREE.IcosahedronGeometry(r, detail); g.scale(1, sy, 1); g.translate(x, y, z); this.add(mat, g); }
  geo(mat, g, uv) { if (uv) scaleUV(g, this.mat(mat).userData.uv); else this.mat(mat); this.add(mat, g); }
  build(group, { cast = true, receive = true } = {}) {
    for (const [name, list] of Object.entries(this.parts)) {
      const flat = list.map(x => x.index ? x.toNonIndexed() : x);
      flat.forEach(x => { for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv'].includes(k)) x.deleteAttribute(k); });
      const g = mergeGeometries(flat, false);
      if (!g) throw new Error('could not merge ' + name);
      list.forEach(x => x.dispose());
      const m = this.mats[name], mesh = new THREE.Mesh(g, m);
      mesh.castShadow = cast && !m.transparent && !m.userData.noShadow; mesh.receiveShadow = receive && !m.userData.noShadow;
      group.add(mesh);
    }
    for (const [name, x, y, z, ry] of this.props) { const base = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
      for (const it of PROPS[name]) { const m = this.mats[it.mat === 'downlight' ? 'led' : it.mat]; if (!m) { console.warn('prop material missing', it.mat); continue; }
        const im = new THREE.InstancedMesh(it.geo, m, it.at.length); it.at.forEach((w, i) => im.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(base, w))); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
        im.castShadow = cast && !m.transparent && !m.userData.noShadow; im.receiveShadow = receive && !m.userData.noShadow; group.add(im); } }
    this.parts = {}; this.props = [];
    return group;
  }
}
// a vertical strip (a wall of glass, say) along a line of points
function stripGeo(pts, y0, y1) {
  const pos = [], n = pts.length;
  for (let k = 0; k < n; k++) { const a = pts[k], b = pts[(k + 1) % n]; pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y0, a[1], b[0], y1, b[1], a[0], y1, a[1]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); g.computeVertexNormals(); return g;
}
// rounded rectangle outline with outward normals and distance along it (s runs 0..1)
function roundRect(x0, x1, z0, z1, r, step = .6) {
  const out = []; const push = (x, z, nx, nz) => out.push({ x, z, nx, nz });
  const line = (ax, az, bx, bz, nx, nz) => { const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / step)); for (let i = 0; i < n; i++) push(ax + (bx - ax) * i / n, az + (bz - az) * i / n, nx, nz); };
  const arc = (cx, cz, a0) => { const n = Math.max(3, Math.round(r * Math.PI / 2 / step)); for (let i = 0; i < n; i++) { const a = a0 + (Math.PI / 2) * i / n; push(cx + Math.cos(a) * r, cz + Math.sin(a) * r, Math.cos(a), Math.sin(a)); } };
  line(x0 + r, z0, x1 - r, z0, 0, -1); arc(x1 - r, z0 + r, -Math.PI / 2);
  line(x1, z0 + r, x1, z1 - r, 1, 0); arc(x1 - r, z1 - r, 0);
  line(x1 - r, z1, x0 + r, z1, 0, 1); arc(x0 + r, z1 - r, Math.PI / 2);
  line(x0, z1 - r, x0, z0 + r, -1, 0); arc(x0 + r, z0 + r, Math.PI);
  let L = 0; out.forEach((p, i) => { p.l = L; const q = out[(i + 1) % out.length]; L += Math.hypot(q.x - p.x, q.z - p.z); }); out.forEach(p => { p.s = p.l / L; });
  return out;
}
// A pitched roof over a rectangle. `axis` is the direction of the ridge. Returns the height of the ridge above y.
function gable(B, o) {
  const { axis = 'x', x0, x1, z0, z1, y, pitch = 40, over = .4, verge = .25, roof = 'slate', wall = 'render', ends = [true, true], t = .14, cap = 'ridge' } = o;
  const span = axis === 'x' ? z1 - z0 : x1 - x0, len = axis === 'x' ? x1 - x0 : z1 - z0;
  const ang = rad(pitch), half = span / 2, rise = half * Math.tan(ang), run = half + over, sl = run / Math.cos(ang);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, cy = y + rise - run / 2 * Math.tan(ang) + t / 2;
  const v0 = ends[0] ? verge : 0, v1 = ends[1] ? verge : 0, L = len + v0 + v1, sh = (v1 - v0) / 2;
  if (axis === 'x') {
    B.box(roof, L, t, sl, cx + sh, cy, cz - run / 2, 0, -ang); B.box(roof, L, t, sl, cx + sh, cy, cz + run / 2, 0, ang);
    B.box(cap, L + .02, .1, .28, cx + sh, y + rise + t + .02, cz);
  } else {
    B.box(roof, sl, t, L, cx - run / 2, cy, cz + sh, 0, 0, ang); B.box(roof, sl, t, L, cx + run / 2, cy, cz + sh, 0, 0, -ang);
    B.box(cap, .28, .1, L + .02, cx, y + rise + t + .02, cz + sh);
  }
  const tri = new THREE.Shape([new THREE.Vector2(-half, 0), new THREE.Vector2(half, 0), new THREE.Vector2(0, rise)]);
  ends.forEach((on, i) => {
    if (!on) return;
    const g = new THREE.ExtrudeGeometry(tri, { depth: .3, bevelEnabled: false });
    if (axis === 'x') { g.rotateY(Math.PI / 2); g.translate(i ? x1 - .3 : x0, y, cz); } else g.translate(cx, y, i ? z1 - .3 : z0);
    B.geo(wall, g, true);
  });
  return rise;
}

// ---------- materials ----------
function makeMaterials() {
  const T = textures();
  const S = (color, o = {}) => { const { uv, noShadow, ...rest } = o; const m = new THREE.MeshStandardMaterial({ color, roughness: .85, metalness: 0, ...rest }); m.userData.uv = uv; m.userData.noShadow = noShadow; return m; };
  const E = (color, em) => S(color, { emissive: new THREE.Color(em), emissiveIntensity: 0 });
  const M = {
    slab: S('#d4d0c8'), wave: S('#f4f2ee', { roughness: .55 }), wallInt: S('#f1ede6', { roughness: .95 }), core: S('#8e8b85'),
    brickRed: S('#fff', { map: T.brickRed, uv: 1.6, roughness: .95 }), brickDark: S('#fff', { map: T.brickDark, uv: 1.6, roughness: .95 }), brickBuff: S('#fff', { map: T.brickBuff, uv: 1.6, roughness: .95 }), brickNb: S('#fff', { map: T.brickNb, uv: 1.6, roughness: .95 }),
    render: S('#f0ece3', { roughness: .95 }), clad: S('#fff', { map: T.clad, uv: 1.4, roughness: .8 }), plinth: S('#3a3b3d', { roughness: .9 }), stone: S('#d9d2c3'),
    spandrel: S('#22262b', { roughness: .4, metalness: .5 }), bronze: S('#7a5a3a', { roughness: .35, metalness: .85 }), brass: S('#b08a4a', { roughness: .3, metalness: .9 }),
    frame: S('#1d1f22', { roughness: .45, metalness: .6 }), door: S('#2b4a41', { roughness: .5 }), doorInt: S('#a9865c', { roughness: .5 }), rail: S('#1f2123', { roughness: .4, metalness: .7 }),
    wood: S('#fff', { map: T.oak, uv: 2.2, roughness: .55 }), tile: S('#e6dfd3', { map: T.tile, uv: 2.4, roughness: .3 }), carpet: S('#c9bfae', { roughness: 1 }), corridor: S('#77726a', { roughness: .85 }),
    lobbyFloor: S('#fff', { map: T.lobby, uv: 2.4, roughness: .2 }), deck: S('#fff', { map: T.deck, uv: 1.4, roughness: .8 }),
    sofa: S('#6a715a', { roughness: 1 }), fabric: S('#d6c9b3', { roughness: 1 }), linen: S('#f1ede5', { roughness: 1 }), throw_: S('#b57f63', { roughness: 1 }), curtain: S('#e4ddd0', { roughness: 1 }),
    darkWood: S('#4d3b2d', { roughness: .55 }), oak: S('#b99468', { roughness: .55 }), white: S('#f4f2ed', { roughness: .35 }), black: S('#1c1d1f', { roughness: .4 }),
    worktop: S('#ece8e1', { roughness: .2 }), cabinet: S('#34453f', { roughness: .5 }), rug: S('#b29c84', { roughness: 1 }), rug2: S('#7f8c90', { roughness: 1 }),
    plant: S('#4c6a38', { roughness: 1 }), plant2: S('#6c8a45', { roughness: 1 }), flower: S('#c9788a', { roughness: 1 }), pot: S('#cdbfaa', { roughness: .8 }), soil: S('#3d3229'),
    metal: S('#a3a7ab', { roughness: .25, metalness: .85 }), screen: S('#0e1012', { roughness: .15, metalness: .3 }), mirror: S('#cfd8dc', { roughness: .03, metalness: 1 }),
    art0: S('#fff', { map: T.art[0], roughness: .9 }), art1: S('#fff', { map: T.art[1], roughness: .9 }), art2: S('#fff', { map: T.art[2], roughness: .9 }), books: S('#fff', { map: T.books, uv: 1, roughness: .9 }),
    lampShade: E('#efe6d4', '#ffcf8f'), fire: E('#2a1a10', '#ff7a2a'),
    // the bar and the wine wall (names match the Blender prop library)
    bottle: S('#16241a', { roughness: .1, metalness: .25 }), wineLabel: S('#efe7d6', { roughness: .7 }), foil: S('#5a1620', { roughness: .35, metalness: .6 }), whisky: S('#b5701f', { roughness: .08, metalness: .2 }), gin: S('#9ec3c0', { roughness: .06, transparent: true, opacity: .7 }), frost: S('#e6ecee', { roughness: .4 }),
    led: E('#ffe2b8', '#ffcf8f'), wineBack: E('#cfae84', '#ffb25c'), crystal: S('#eef4f4', { roughness: .03, transparent: true, opacity: .28, depthWrite: false }), steel: S('#c9ccd0', { roughness: .2, metalness: .95 }), lemon: S('#e8b735', { roughness: .5 }), ice: S('#f3f8fa', { roughness: .15 }),
    slate: S('#fff', { map: T.slate, uv: 1.6, roughness: .8 }), zinc: S('#fff', { map: T.zinc, uv: 1.8, roughness: .45, metalness: .5 }), ridge: S('#1e2022', { roughness: .6 }), roofFlat: S('#55585b', { roughness: .95 }),
    ground: S('#c9d4b8', { map: T.grass, uv: 8, roughness: 1 }), lawn: S('#d4dcc0', { map: T.lawn, uv: 3.2, roughness: 1 }), hedge: S('#3f5a30', { roughness: 1 }),
    road: S('#34363a', { roughness: .95 }), pave: S('#fff', { map: T.pave, uv: 3, roughness: .9 }), blockPave: S('#fff', { map: T.block, uv: 1.6, roughness: .9 }), gravel: S('#b6ab98', { roughness: 1 }),
    mark: S('#e9e6df', { roughness: .8, noShadow: true }), trunk: S('#5b4636'),
    car1: S('#2e3a46', { roughness: .3, metalness: .6 }), car2: S('#c9c6c0', { roughness: .3, metalness: .6 }), car3: S('#7a1f22', { roughness: .3, metalness: .6 }),
    boat: S('#21443a', { roughness: .5 }), boatTop: S('#8b2f2a', { roughness: .5 }), lampHead: E('#222222', '#ffcf8a'),
  };
  { const wv = weaveTex(3), wv2 = weaveTex(5); ['sofa', 'fabric', 'linen', 'throw_', 'curtain', 'rug', 'rug2', 'carpet'].forEach((k, i) => { M[k].map = i % 2 ? wv : wv2; M[k].userData.uv = .28; if (k === 'carpet' || k.startsWith('rug')) { M[k].map = weaveTex(7 + i); M[k].map.repeat.set(9, 9); } }); M.downlight = E('#f6efe0', '#ffe2b0'); M.downlight.userData.noShadow = true; M.skirt = S('#f6f3ee', { roughness: .5 }); }
  M.lampHead.userData.noShadow = true; M.lampShade.userData.noShadow = true;
  const glass = (o = {}) => { const m = new THREE.MeshPhysicalMaterial({ color: '#5f7a8c', roughness: .04, metalness: .3, transparent: true, opacity: .42, envMapIntensity: 2.2, depthWrite: false, side: THREE.DoubleSide, ...o }); m.userData.noShadow = true; return m; };
  M.glass = glass(); M.glassLit = glass({ emissive: new THREE.Color('#ffb15e'), emissiveIntensity: 0 }); M.glassRail = glass({ color: '#a9bcc6', opacity: .2, metalness: .1 });
  M.lantern = glass({ color: '#d9c7a4', opacity: .7, emissive: new THREE.Color('#ffc880'), emissiveIntensity: 0 });
  M.pool = new THREE.MeshPhysicalMaterial({ color: '#35b6c8', roughness: .04, metalness: 0, transparent: true, opacity: .6, envMapIntensity: 1.6, depthWrite: false, emissive: new THREE.Color('#1aa6c0'), emissiveIntensity: .12 }); M.pool.userData.noShadow = true;
  M.water = new THREE.MeshPhysicalMaterial({ color: '#2a4650', roughness: .06, metalness: .25, envMapIntensity: 1.3 });
  const fac = (map, em) => S('#d8d8d8', { map, emissiveMap: em, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, roughness: .6 });
  M.nbGlass = fac(T.fmG, T.feG); M.nbBrick = fac(T.fmB, T.feB); M.nbStone = fac(T.fmS, T.feS);
  Object.entries(M).forEach(([k, m]) => { m.name = k; });          // named so an exported scene keeps its material names
  return M;
}
// interior styles: the same rooms in different finishes
const STYLES = {
  oak: { label: 'Warm oak', wood: '#ffffff', sofa: '#6a715a', fabric: '#d6c9b3', throw_: '#b57f63', cabinet: '#34453f', worktop: '#ece8e1', rug: '#b29c84', rug2: '#7f8c90', wallInt: '#f1ede6', carpet: '#c9bfae', oak: '#b99468', darkWood: '#4d3b2d', curtain: '#e4ddd0', linen: '#f1ede5' },
  coast: { label: 'Coastal', wood: '#f3ead8', sofa: '#8fa3b0', fabric: '#f0ece2', throw_: '#39536b', cabinet: '#f2f0ea', worktop: '#dfe3e2', rug: '#d9d4c6', rug2: '#9fb4bd', wallInt: '#f6f5f1', carpet: '#dcd8cc', oak: '#d2b48c', darkWood: '#9c8468', curtain: '#f4f2ea', linen: '#ffffff' },
  luxe: { label: 'Dark luxe', wood: '#8a6a52', sofa: '#33363b', fabric: '#b8a488', throw_: '#b08a4a', cabinet: '#17191b', worktop: '#2b2d30', rug: '#4a4640', rug2: '#5d4a3c', wallInt: '#dcd6cc', carpet: '#6b655c', oak: '#6f4e37', darkWood: '#2a211b', curtain: '#3f3a36', linen: '#e6dfd2' },
};

// ---------- walls from the plan ----------
function boundaries(rooms) {
  const k = v => Math.round(v * 1000) / 1000, segs = [];
  const roomAt = (x, z) => rooms.find(q => x > q.x && x < q.x + q.w && z > q.z && z < q.z + q.d) || null;
  for (const axis of ['x', 'z']) {
    const lines = new Set();
    rooms.forEach(q => { if (axis === 'x') { lines.add(k(q.x)); lines.add(k(q.x + q.w)); } else { lines.add(k(q.z)); lines.add(k(q.z + q.d)); } });
    for (const L of lines) {
      const pts = new Set();
      rooms.filter(q => axis === 'x' ? (k(q.x) === L || k(q.x + q.w) === L) : (k(q.z) === L || k(q.z + q.d) === L)).forEach(q => { if (axis === 'x') { pts.add(k(q.z)); pts.add(k(q.z + q.d)); } else { pts.add(k(q.x)); pts.add(k(q.x + q.w)); } });
      const sorted = [...pts].sort((a, b) => a - b); let cur = null;
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i], b = sorted[i + 1], m = (a + b) / 2;
        const A = axis === 'x' ? roomAt(L - .01, m) : roomAt(m, L - .01), B = axis === 'x' ? roomAt(L + .01, m) : roomAt(m, L + .01);
        if (cur && cur.A === A && cur.B === B && Math.abs(cur.b - a) < 1e-3) { cur.b = b; continue; }
        cur = { axis, L, a, b, A, B }; segs.push(cur);
      }
    }
  }
  return segs.filter(s => s.A !== s.B && (s.A || s.B));
}
function classify(s, data, fi) {
  const { A, B } = s, style = data.style;
  if (A && B && data.wallKind) { const k = data.wallKind[[A.id, B.id].sort().join('|')]; if (k) return k; }
  if ((A && A.type === 'core') || (B && B.type === 'core')) return 'none';
  if (A && B && COMMUNAL.has(A.type) && A.type === B.type) return 'none';
  if (A && B && OUTSIDE.has(A.type) && OUTSIDE.has(B.type)) return 'none';
  if (A && B && A.type === 'void' && B.type === 'void') return 'none';
  if (A && B && (A.type === 'void' || B.type === 'void') && !OUTSIDE.has(A.type) && !OUTSIDE.has(B.type)) return 'rail';          // a gallery looking down into the room below
  if (!A || !B) {
    const q = A || B;
    if (OUTSIDE.has(q.type)) return 'rail';
    if (q.type === 'lobby') return 'glassWall';
    if (style === 'glass') return 'curtain';
    if (style === 'house' && fi === 0 && q.type === 'hall' && s.axis === 'z' && s.L < 0) return 'frontDoor';
    if (style === 'house' && fi === 0 && (q.type === 'kitchen' || q.type === 'dining') && s.axis === 'z' && s.L > 0) return 'bifold';
    return 'punched';
  }
  if (OUTSIDE.has(A.type) || OUTSIDE.has(B.type)) { const q = OUTSIDE.has(A.type) ? B : A, o = OUTSIDE.has(A.type) ? A : B; return o.unit && o.unit === q.unit ? 'slider' : style === 'glass' ? 'curtain' : 'punched'; }
  const comm = COMMUNAL.has(A.type) ? A : COMMUNAL.has(B.type) ? B : null;
  if (comm) { const o = comm === A ? B : A; return o.type === 'hall' || COMMUNAL.has(o.type) ? 'entry' : 'solid'; }
  if (A.unit !== B.unit) return 'solid';
  if (A.type === 'hall' && B.type === 'hall') return 'none';
  return A.type === 'hall' || B.type === 'hall' ? 'door' : 'solid';      // every door is off a hall
  if (LIVE.has(A.type) || LIVE.has(B.type)) return 'door';
  if ((A.type === 'bed' && B.type === 'bath') || (B.type === 'bed' && A.type === 'bath')) return 'door';
  return 'solid';
}
function planFloor(fl, data, fi) {
  const rooms = fl.rooms, segs = boundaries(rooms);
  segs.forEach(s => { s.kind = classify(s, data, fi); });
  rooms.forEach(q => {
    if (COMMUNAL.has(q.type) || q.type === 'core' || OUTSIDE.has(q.type)) return;
    const mine = segs.filter(s => (s.A === q || s.B === q) && s.A && s.B);
    if (mine.some(s => ((s.kind === 'door' || s.kind === 'entry') && s.b - s.a >= 1.3) || s.kind === 'slider')) return;
    const cand = mine.filter(s => s.kind === 'solid' && s.A.unit === s.B.unit && !COMMUNAL.has((s.A === q ? s.B : s.A).type) && s.b - s.a >= 1.3).sort((x, y) => (y.b - y.a) - (x.b - x.a))[0];
    if (cand) cand.kind = 'door';
  });
  // one door per room onto the hall: keep the widest wall
  rooms.forEach(q => { if (q.type === 'hall' || !q.unit) return; const ds = segs.filter(s => s.kind === 'door' && (s.A === q || s.B === q) && (s.A === q ? s.B : s.A).type === 'hall').sort((x, y) => (y.b - y.a) - (x.b - x.a)); ds.slice(1).forEach(s => { s.kind = 'solid'; }); });
  rooms.forEach(q => { q.ext = {}; });
  segs.forEach(s => {
    if (s.A && !s.B) s.A.ext[s.axis === 'x' ? 'e' : 's'] = true;
    if (s.B && !s.A) s.B.ext[s.axis === 'x' ? 'w' : 'n'] = true;
    if (s.kind === 'slider') { const q = OUTSIDE.has(s.A.type) ? s.B : s.A; q.ext[s.axis === 'x' ? (q === s.A ? 'e' : 'w') : (q === s.A ? 's' : 'n')] = true; }
    if (s.A && s.B && data.autoDoor && data.autoDoor.includes([s.A.id, s.B.id].sort().join('|'))) s.auto = true;
    if (s.kind === 'door' || s.kind === 'entry') { const t = (data.doorAt && data.doorAt[[s.A.id, s.B.id].sort().join('|')]) ?? (data.style !== 'house' && (s.A.type === 'bed' || s.B.type === 'bed') ? .2 : .5); const dw = Math.min(.95, s.b - s.a - .3); s.dw = dw; s.dc = clamp(s.a + (s.b - s.a) * t, s.a + dw / 2 + .12, s.b - dw / 2 - .12); }
  });
  return segs;
}

const BAYS = ['brickRed', 'brickDark', 'brickBuff', 'brickDark', 'brickRed', 'brickBuff'];
// the outside walls, floor slabs and room partitions of one floor, added to the building's shell
function shellFloor(S, fl, segs, data, fi, plate, lit) {
  const style = data.style, y0 = fi * data.floorH, H = data.floorH - .3;
  const bayOf = x => BAYS[clamp(Math.floor((x - plate.x0) / 6), 0, BAYS.length - 1)];
  fl.rooms.forEach(q => {
    const cx = q.x + q.w / 2, cz = q.z + q.d / 2, out = OUTSIDE.has(q.type);
    if (q.type === 'core') { S.box('core', q.w, data.floorH, q.d, cx, y0 + data.floorH / 2 - .3, cz); return; }
    if (q.type === 'void') return;
    S.box(out ? 'rail' : 'slab', q.w + (out ? 0 : .02), out ? .16 : .3, q.d + (out ? 0 : .02), cx, y0 - (out ? .1 : .15), cz);
    if (out) S.box('deck', q.w - .1, .04, q.d - .1, cx, y0, cz);
    if (out && fi > 0 && q.w * q.d > 12) S.box('slab', q.w, .06, q.d, cx, y0 - .21, cz);          // a pale soffit, so the room under a terrace has a ceiling
  });
  segs.forEach(s => {
    const len = s.b - s.a, mid = (s.a + s.b) / 2, outSign = s.A && !s.B ? 1 : -1, q = s.A || s.B;
    const put = (mat, along, h, thick, at, y, off = 0) => { if (s.axis === 'x') S.box(mat, thick, h, along, s.L + off, y0 + y, at); else S.box(mat, along, h, thick, at, y0 + y, s.L + off); };
    const extMat = at => {
      if (style === 'glass') return 'spandrel';
      if (style === 'brick') return s.axis === 'z' ? bayOf(at) : bayOf(s.L < plate.cx ? plate.x0 + 1 : plate.x1 - 1);
      if (s.axis === 'z' && s.L < plate.cz && at < -1.2) return 'clad';
      if (s.axis === 'z' && s.L > plate.cz && at > -1.2 && fi === 1) return 'clad';
      return 'render';
    };
    // an outside wall piece with its plastered inside face; brick walls change colour from bay to bay
    const xp = (along, h, at, y) => {
      if (!(along > .001 && h > .001)) return;
      if (style === 'brick' && s.axis === 'z') {
        let a = at - along / 2; const b = at + along / 2;
        while (a < b - .001) { const nb = Math.min(b, plate.x0 + (Math.floor((a - plate.x0 + .001) / 6) + 1) * 6); put(bayOf((a + nb) / 2), nb - a, h, .3, (a + nb) / 2, y); a = nb; }
      } else put(extMat(at), along, h, .3, at, y);
      if (style !== 'glass') put('wallInt', along, h, .02, at, y, -outSign * .16);
    };
    const wallWithDoor = (mat, thick) => {
      if (len < 1.3) { put(mat, len, H, thick, mid, H / 2); return; }
      const d0 = s.dc - s.dw / 2, d1 = s.dc + s.dw / 2;
      put(mat, d0 - s.a, H, thick, (s.a + d0) / 2, H / 2); put(mat, s.b - d1, H, thick, (d1 + s.b) / 2, H / 2); put(mat, s.dw, H - 2.1, thick, s.dc, 2.1 + (H - 2.1) / 2);
    };
    switch (s.kind) {
      case 'none': return;
      case 'solid': put('wallInt', len, H, .12, mid, H / 2); return;
      case 'door': wallWithDoor('wallInt', .12); return;
      case 'entry': wallWithDoor('wallInt', .14); if (len >= 1.3) put('door', s.dw, 2.1, .05, s.dc, 1.05); return;
      case 'slider': {
        put('frame', len, .08, .1, mid, H - .04); if (s.auto) { put('frame', .06, H, .1, s.a, H / 2); put('frame', .06, H, .1, s.b, H / 2); return; }          // these doors are separate, so they can slide open
        put('glass', len, H - .1, .03, mid, (H - .1) / 2);
        const n = Math.max(2, Math.round(len / 1.5)); for (let i = 0; i <= n; i++) put('frame', .05, H, .08, s.a + i * len / n, H / 2);
        return;
      }
      case 'rail': {
        if (style === 'brick') { put('rail', len, .05, .06, mid, 1.1); put('rail', len, .04, .04, mid, .08); const n = Math.round(len / .13); for (let i = 0; i <= n; i++) put('rail', .018, 1.05, .018, s.a + i * len / n, .58); }
        else if (q.pool && s.axis === 'z' && s.L > plate.cz) { [[s.a, Math.min(s.b, q.pool[0])], [Math.max(s.a, q.pool[1]), s.b]].forEach(([a, b]) => { if (b - a > .1) { put('glassRail', b - a, 1.05, .02, (a + b) / 2, .55); put('rail', b - a, .04, .06, (a + b) / 2, 1.08); } }); }
        else { put('glassRail', len, 1.05, .02, mid, .55); put('rail', len, .04, .06, mid, 1.08); }
        return;
      }
      case 'glassWall': case 'curtain': {
        const on = s.kind === 'curtain' && q.unit && lit(q.unit), lobby = s.kind === 'glassWall';
        put(on ? 'glassLit' : 'glass', len, H, .03, mid, H / 2);
        const n = Math.max(1, Math.round(len / (lobby ? 3 : 1.5)));
        for (let i = 0; i <= n; i++) put('bronze', lobby ? .1 : .05, H, lobby ? .14 : .26, s.a + i * len / n, H / 2, outSign * .1);
        put('spandrel', len + .02, .3, .1, mid, -.15, outSign * .02);
        return;
      }
      case 'frontDoor': {
        const dw = 1.0, sw = .5, d0 = mid - dw / 2 - sw, d1 = mid + dw / 2 + sw;
        xp(d0 - s.a, H, (s.a + d0) / 2, H / 2); xp(s.b - d1, H, (d1 + s.b) / 2, H / 2); xp(d1 - d0, H - 2.2, mid, 2.2 + (H - 2.2) / 2);
        put('oak', dw, 2.15, .07, mid, 1.08, outSign * .08); put('brass', .03, .5, .05, mid + .36, 1.1, outSign * .14);
        [-1, 1].forEach(g => { put('glassLit', sw - .08, 2.1, .03, mid + g * (dw / 2 + sw / 2), 1.08); put('frame', .05, 2.2, .1, mid + g * (dw / 2 + .01), 1.1); put('frame', .05, 2.2, .1, mid + g * (dw / 2 + sw), 1.1); });
        put('frame', d1 - d0, .06, .1, mid, 2.2); put('plinth', len + .04, .3, .36, mid, -.15);
        return;
      }
      case 'bifold': {
        xp(len, H - 2.35, mid, 2.35 + (H - 2.35) / 2);
        put('glassLit', len - .2, 2.3, .03, mid, 1.15);
        const n = Math.max(3, Math.round(len / .95)); for (let i = 0; i <= n; i++) put('frame', .05, 2.35, .09, s.a + .1 + i * (len - .2) / n, 1.17);
        put('frame', len - .2, .06, .09, mid, 2.32); put('frame', len - .2, .05, .09, mid, .03); put('plinth', len + .04, .3, .36, mid, -.15);
        return;
      }
      case 'punched': {
        const house = style === 'house', small = q.type === 'bath' || q.type === 'utility';
        const sill = small ? 1.3 : house ? .75 : .35, head = house ? 2.15 : 2.42;
        const bays = Math.max(1, Math.round(len / (house ? 2.5 : 2.4))), bw = len / bays, ww = Math.min(small ? .8 : house ? 1.4 : 1.6, bw - .6), on = lit(q.unit);
        if (ww < .5 || (q.type === 'hall' && !house)) { xp(len, H, mid, H / 2); xp(len, .3, mid, -.15); return; }
        xp(len, sill, mid, sill / 2); xp(len, H - head, mid, head + (H - head) / 2);
        for (let i = 0; i < bays; i++) {
          const c = s.a + bw * (i + .5), p0 = c - bw / 2, w0 = (c - ww / 2) - p0, hh = head - sill, cy = sill + hh / 2;
          xp(w0, hh, p0 + w0 / 2, cy); xp(w0, hh, c + ww / 2 + w0 / 2, cy);
          put(on ? 'glassLit' : 'glass', ww, hh, .03, c, cy);
          put('frame', ww, .05, .1, c, sill + .025); put('frame', ww, .05, .1, c, head - .025); put('frame', .05, hh, .1, c - ww / 2 + .025, cy); put('frame', .05, hh, .1, c + ww / 2 - .025, cy);
          if (house) put('frame', .04, hh, .08, c, cy);
          else { [-1, 1].forEach(g => put('frame', .025, hh, .06, c + g * ww / 6, cy)); [1, 2].forEach(g => put('frame', ww, .025, .06, c, sill + hh * g / 3)); put('stone', ww + .3, .14, .34, c, head + .07, outSign * .02); }
          put(house ? 'frame' : 'stone', ww + .16, .06, .4, c, sill - .03, outSign * .05);
        }
        if (fi === 0 && house) put('plinth', len + .04, .3, .36, mid, -.15); else xp(len, .3, mid, -.15);
        return;
      }
    }
  });
}

// ---------- furniture and finishes (built the first time a floor is opened) ----------
const FINISH = ['wood', 'tile', 'carpet', 'corridor', 'lobbyFloor', 'doorInt', 'skirt', 'downlight'];
function innerFloor(B, fl, segs, data, fi) {
  const Hc = data.floorH - .3, house = data.style === 'house';
  fl.rooms.forEach(q => {
    if (q.type === 'core' || q.type === 'void' || OUTSIDE.has(q.type)) return;
    const fin = q.type === 'bath' || q.type === 'utility' ? 'tile' : q.type === 'bed' ? 'carpet' : q.type === 'corridor' ? 'corridor' : q.type === 'lobby' ? 'lobbyFloor' : 'wood';
    B.box(fin, q.w - .02, .02, q.d - .02, q.x + q.w / 2, .01, q.z + q.d / 2);
  });
  // lift doors on the core, facing the shared corridor, the lobby or (in a whole-floor home) the gallery
  { const core = fl.rooms.find(r => r.type === 'core'), near = (a, b) => Math.abs(a - b) < .05;
    if (core && !house) for (const t of ['corridor', 'lobby', 'hall']) {
      const q = fl.rooms.find(r => r.type === t && ((near(r.z, core.z + core.d) || near(r.z + r.d, core.z)) && Math.min(r.x + r.w, core.x + core.w) - Math.max(r.x, core.x) > 2.6));
      if (!q) continue;
      const south = near(q.z, core.z + core.d), zw = south ? core.z + core.d : core.z, g = south ? 1 : -1, cx = (Math.max(q.x, core.x) + Math.min(q.x + q.w, core.x + core.w)) / 2;
      [-.75, .75].forEach(o => { B.box('black', 1.16, 2.24, .05, cx + o, 1.12, zw + g * .05); B.box('metal', .5, 2.12, .03, cx + o - .255, 1.06, zw + g * .085); B.box('metal', .5, 2.12, .03, cx + o + .255, 1.06, zw + g * .085); B.box('led', .3, .05, .02, cx + o, 2.33, zw + g * .05); });
      B.box('brass', .09, .22, .02, cx, 1.15, zw + g * .05);
      break; } }
  // doors standing open in their doorways
  segs.forEach(s => {
    if (s.kind !== 'door' || s.b - s.a < 1.3) return;
    const hinge = s.dc - s.dw / 2 + .02, w = s.dw - .06;
    const into = s.B.type === 'hall' && s.A.type !== 'hall' ? -1 : 1, at = s.L + into * (w / 2 + .06);       // the door swings into the room, not the hall
    if (s.axis === 'x') B.box('doorInt', w, 2.05, .04, at, 1.03, hinge); else B.box('doorInt', .04, 2.05, w, hinge, 1.03, at);
  });
  segs.forEach(s => {
    if (!s.A || !s.B || !['solid', 'door', 'entry'].includes(s.kind)) return;
    const runs = s.kind === 'solid' || s.b - s.a < 1.3 ? [[s.a, s.b]] : [[s.a, s.dc - s.dw / 2 - .05], [s.dc + s.dw / 2 + .05, s.b]];
    [-1, 1].forEach(side => { const R = side < 0 ? s.A : s.B; if (R.type === 'core') return; runs.forEach(([a, b]) => { if (b - a < .08) return; const off = s.L + side * .075; if (s.axis === 'x') B.box('skirt', .016, .1, b - a, off, .05, (a + b) / 2); else B.box('skirt', b - a, .1, .016, (a + b) / 2, .05, off); }); });
    if (s.kind !== 'solid' && s.b - s.a >= 1.3) { const j = (c, w, h, y) => { if (s.axis === 'x') B.box('skirt', .17, h, w, s.L, y, c); else B.box('skirt', w, h, .17, c, y, s.L); }; j(s.dc - s.dw / 2 - .03, .06, 2.14, 1.07); j(s.dc + s.dw / 2 + .03, .06, 2.14, 1.07); j(s.dc, s.dw + .12, .06, 2.13); }
  });
  const HcOf = q => q.tall ? data.floorH * 2 - .3 : Hc;
  fl.rooms.forEach(q => { if (q.type === 'core' || q.type === 'void' || OUTSIDE.has(q.type) || q.w * q.d < 2.2) return; const Hc = HcOf(q); const nx = Math.max(1, Math.round(q.w / 1.7)), nz = Math.max(1, Math.round(q.d / 1.7)); for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) B.cyl('downlight', .055, .012, q.x + q.w * (i + .5) / nx, Hc - .008, q.z + q.d * (k + .5) / nz, .055, 16); });
  fl.rooms.forEach(q => furnishBest(q, B, segs, fl.rooms, { Hc: HcOf(q), house, glass: data.style === 'glass', fi }));
}
// Records what furnish() would draw, so a layout can be checked before it is built.
class Rec {
  constructor() { this.calls = []; }
  put(fn, args, x0, x1, z0, z1, y0, y1) { this.calls.push({ fn, args, x0, x1, z0, z1, y0, y1 }); }
  box(m, w, h, d, x, y, z, ...r) { this.put('box', [m, w, h, d, x, y, z, ...r], x - w / 2, x + w / 2, z - d / 2, z + d / 2, y - h / 2, y + h / 2); }
  rbox(m, w, h, d, x, y, z, r) { this.put('rbox', [m, w, h, d, x, y, z, r], x - w / 2, x + w / 2, z - d / 2, z + d / 2, y - h / 2, y + h / 2); }
  cyl(m, r, h, x, y, z, rt) { this.put('cyl', [m, r, h, x, y, z, rt], x - r, x + r, z - r, z + r, y - h / 2, y + h / 2); }
  ball(m, r, x, y, z, sy = 1) { this.put('ball', [m, r, x, y, z, sy], x - r, x + r, z - r, z + r, y - r * sy, y + r * sy); }
  prop(name, x, y, z, ry = 0, fw = .1, fd = .1, fh = .1) { if (!PROPS[name]) return false; this.put('prop', [name, x, y, z, ry], x - fw / 2, x + fw / 2, z - fd / 2, z + fd / 2, y, y + fh); return true; }
}
// the floor a door needs kept clear on this room's side of it: [x0, x1, z0, z1]
function doorZones(q, segs) {
  const out = [];
  segs.forEach(s => {
    if (s.A !== q && s.B !== q) return; let a, b, depth = 1.1;
    if (s.kind === 'door' || s.kind === 'entry') { a = s.dc - s.dw / 2 - .15; b = s.dc + s.dw / 2 + .15; }
    else if (s.kind === 'frontDoor' || s.kind === 'slider' || s.kind === 'bifold') { const m = (s.a + s.b) / 2, hw = Math.min(.7, (s.b - s.a) / 2); a = m - hw; b = m + hw; depth = .85; }
    else return;
    const d0 = s.A === q ? s.L - depth : s.L, d1 = s.A === q ? s.L : s.L + depth;
    out.push(s.axis === 'x' ? [d0, d1, a, b] : [a, b, d0, d1]);
  });
  return out;
}
const overlap = (c, z) => Math.max(0, Math.min(c.x1, z[1]) - Math.max(c.x0, z[0])) * Math.max(0, Math.min(c.z1, z[3]) - Math.max(c.z0, z[2]));
const SOLVE = new Set(['open', 'living', 'kitchen', 'dining', 'bed', 'bath', 'study', 'utility', 'hall']);
// Try the room turned and mirrored, and build the first layout that leaves every door clear and stays inside the walls.
function furnishBest(q, B, segs, rooms, o) {
  const glassZ = []; segs.forEach(g => { if ((g.A === q) === (g.B === q) || (g.A && g.B && !OUTSIDE.has((g.A === q ? g.B : g.A).type))) return; if (g.A && g.B && g.kind !== 'slider') return; const d0 = g.A === q ? g.L - .55 : g.L, d1 = g.A === q ? g.L : g.L + .55; glassZ.push(g.axis === 'x' ? [d0, d1, g.a, g.b] : [g.a, g.b, d0, d1]); });
  const SOFT = new Set(['curtain', 'plant', 'plant2', 'pot', 'flower']);
  const fixed = !SOLVE.has(q.type) || q.tall || q.look === 'kd' || q.look === 'dress' || q.look === 'spa' || q.look === 'suite' || q.look === 'guest' || q.look === 'ensuite' || (o.house && o.fi === 0 && q.type === 'hall'), zones = fixed ? [] : doorZones(q, segs);
  const tries = fixed ? [{}] : [{}, { swap: 1 }, { flip: 1 }, { flip: 1, swap: 1 }, { face: 'n' }, { face: 'n', flip: 1 }, { face: 's' }, { face: 's', flip: 1 }, { face: 'e' }, { face: 'e', flip: 1 }, { face: 'w' }, { face: 'w', flip: 1 }];
  const real = c => !((c.y1 - c.y0 < .05 && c.y0 < .1) || c.y0 > 2.0);          // not a rug, not something on the ceiling
  if (!fixed && q.type === 'bed') tries.push(...tries.flatMap(t => [{ ...t, bs: -1 }, { ...t, bs: 1 }]));          // then the same again with the bed slid along its wall, clear of a door
  let best = null;
  for (const t of tries) {
    const R = new Rec(); furnish(q, R, rooms, { ...o, ...t, zones }); let bad = 0;
    R.calls.forEach(c => { if (!real(c)) return; zones.forEach(z => { bad += overlap(c, z); }); if (c.y1 > .7 && !SOFT.has(c.args[0])) glassZ.forEach(z => { bad += 6 * overlap(c, z); }); bad += 3 * (Math.max(0, q.x - c.x0 - .03) + Math.max(0, c.x1 - q.x - q.w - .03) + Math.max(0, q.z - c.z0 - .03) + Math.max(0, c.z1 - q.z - q.d - .03)); });
    if (!best || bad < best.bad - 1e-6) best = { R, bad, t }; if (bad < .01) break;
  }
  q.fit = 0; best.R.calls.forEach(c => { if (real(c)) zones.forEach(z => { q.fit += overlap(c, z); }); }); q.solids = []; q.all = [];
  best.R.calls.forEach(c => {
    if (real(c) && (zones.some(z => overlap(c, z) > .02) || c.x0 < q.x - .06 || c.x1 > q.x + q.w + .06 || c.z0 < q.z - .06 || c.z1 > q.z + q.d + .06)) return;   // last resort: leave the piece out
    B[c.fn](...c.args);
    if ((q.pool || q.blocks) && !q.solids.length) { [q.pool, ...(q.blocks || [])].filter(Boolean).forEach(b => { q.solids.push(b); q.all.push(b); }); }
    if (real(c) && c.y0 < 1.1 && c.y1 - c.y0 >= .12 && c.y1 > .3) { q.all.push([c.x0, c.x1, c.z0, c.z1]); if (c.y1 > .5 && (c.x1 - c.x0) * (c.z1 - c.z0) >= .5) q.solids.push([c.x0, c.x1, c.z0, c.z1]); }      // you can brush past chairs and lamps, not through tables, beds and units
  });
}
function furnish(q, B, rooms, o) {
  const data_floorH = (q.tall ? (o.Hc + .3) / 2 : o.Hc + .3);
  const { x, z, w, d, type } = q, { Hc, house, glass, fi } = o, y = .02, e = q.ext || {};
  const win = o.face || (e.s ? 's' : e.n ? 'n' : e.e ? 'e' : e.w ? 'w' : 'n'), alongX = win === 'n' || win === 's';
  const U = alongX ? w : d, V = alongX ? d : w;         // U runs along the window wall, V runs back into the room
  const to = (u, v) => (o.flip && (u = U - u), 0) || win === 'n' ? [x + u, z + v] : win === 's' ? [x + w - u, z + d - v] : win === 'w' ? [x + v, z + d - u] : [x + w - v, z + u];
  const box = (mat, bu, bh, bv, u, yy, v) => { const [wx, wz] = to(u, v); if (alongX) B.box(mat, bu, bh, bv, wx, y + yy, wz); else B.box(mat, bv, bh, bu, wx, y + yy, wz); };
  const rbox = (mat, bu, bh, bv, u, yy, v, r) => { const [wx, wz] = to(u, v); if (alongX) B.rbox(mat, bu, bh, bv, wx, y + yy, wz, r); else B.rbox(mat, bv, bh, bu, wx, y + yy, wz, r); };
  const cyl = (mat, r, h, u, yy, v, rt) => { const [wx, wz] = to(u, v); B.cyl(mat, r, h, wx, y + yy, wz, rt); };
  const ball = (mat, r, u, yy, v, sy) => { const [wx, wz] = to(u, v); B.ball(mat, r, wx, y + yy, wz, sy); };
  const plant = (u, v, s = 1) => { cyl('pot', .2 * s, .42 * s, u, .21 * s, v, .25 * s); ball('plant', .36 * s, u, .8 * s, v, 1.25); ball('plant2', .24 * s, u + .14 * s, 1.12 * s, v - .06, 1.2); ball('plant', .2 * s, u - .15 * s, 1.0 * s, v + .1, 1.3); };
  const pendant = (u, v, drop = .5, r = .15) => { drop = Math.min(drop, .55); box('black', .012, drop, .012, u, Hc - drop / 2, v); cyl('lampShade', r, .22, u, Hc - drop - .1, v, r * .55); };
  const floorLamp = (u, v) => { cyl('black', .14, .03, u, .015, v); box('black', .02, 1.5, .02, u, .75, v); cyl('lampShade', .2, .3, u, 1.6, v, .14); };
  const an = n => 'art' + (Math.abs(Math.floor(n)) % 3);
  const art = (side, v, wdt = 1.1, h = .8, n = 0) => { const u = side ? U - .03 : .03; box('black', .03, h + .06, wdt + .06, u, 1.55, v); box(an(n), .035, h, wdt, side ? u - .004 : u + .004, 1.55, v); };
  const artBack = (u, wdt = 1.1, h = .8, n = 0) => { box('black', wdt + .06, h + .06, .03, u, 1.6, V - .03); box(an(n), wdt, h, .035, u, 1.6, V - .034); };
  const curtains = () => { if (glass || !e[win]) return; rbox('curtain', .34, Hc - .12, .1, .22, (Hc - .12) / 2, .1, .04); rbox('curtain', .34, Hc - .12, .1, U - .22, (Hc - .12) / 2, .1, .04); box('black', U - .1, .025, .025, U / 2, Hc - .07, .1); };
  const beams = () => { if (!house || fi !== 0) return; for (let v = .7; v < V; v += 1.15) box('oak', U - .04, .16, .12, U / 2, Hc - .08, v); };
  // sofa against a side wall (side 0 = one end of the window wall, 1 = the other), running back into the room
  const sofa = (side, v, len) => {
    const s = side ? -1 : 1, u0 = side ? U - .08 : .08;
    rbox('sofa', .92, .4, len, u0 + s * .46, .22, v, .09); rbox('sofa', .24, .52, len, u0 + s * .12, .6, v, .09);
    rbox('sofa', .9, .26, .22, u0 + s * .45, .52, v - len / 2 + .11, .08); rbox('sofa', .9, .26, .22, u0 + s * .45, .52, v + len / 2 - .11, .08);
    rbox('fabric', .14, .36, .42, u0 + s * .3, .62, v - len / 4, .06); rbox('throw_', .14, .36, .42, u0 + s * .3, .62, v + len / 4, .06); rbox('linen', .14, .32, .38, u0 + s * .33, .6, v, .06);
  };
  const chair = (u, v, mat = 'fabric', bu = 0, bv = 0) => { rbox(mat, .44, .08, .44, u, .46, v, .03); if (bu || bv) rbox(mat, bu ? .05 : .42, .42, bv ? .05 : .42, u + bu * .2, .74, v + bv * .2, .02); box('darkWood', .04, .44, .04, u - .18, .22, v - .18); box('darkWood', .04, .44, .04, u + .18, .22, v - .18); box('darkWood', .04, .44, .04, u - .18, .22, v + .18); box('darkWood', .04, .44, .04, u + .18, .22, v + .18); };
  const roundTable = (u, v, r, seats) => { cyl('oak', r, .04, u, .75, v); cyl('black', .05, .72, u, .37, v); cyl('black', r * .45, .02, u, .01, v); for (let i = 0; i < seats; i++) { const a = i / seats * Math.PI * 2 + .4; const cx = Math.cos(a), cz = Math.sin(a); chair(u + cx * (r + .25), v + cz * (r + .25), 'fabric', Math.abs(cx) > Math.abs(cz) ? Math.sign(cx) : 0, Math.abs(cx) > Math.abs(cz) ? 0 : Math.sign(cz)); } pendant(u, v, .85, .24); };
  const longTable = (u, v, len, seats) => { rbox('oak', len, .05, .95, u, .75, v, .02); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box('darkWood', .07, .72, .07, u + a * (len / 2 - .12), .36, v + b * .36)); const n = seats / 2; for (let i = 0; i < n; i++) { const cu = u - len / 2 + len * (i + .5) / n; chair(cu, v - .72, 'fabric', 0, -1); chair(cu, v + .72, 'fabric', 0, 1); } pendant(u - len / 4, v, .9, .16); pendant(u + len / 4, v, .9, .16); };
  // a kitchen run along the back wall between two points, with a tall block at one end
  const kitchen = (uA, uB) => {
    const len = uB - uA; if (len < 1.2) return;
    const tall = len > 2.6 ? .65 : 0, la = uA + tall, ll = uB - la, lc = (la + uB) / 2;
    if (tall) box('cabinet', tall, 2.15, .62, uA + tall / 2, 1.08, V - .32);
    box('cabinet', ll, .88, .6, lc, .44, V - .31); box('worktop', ll + .02, .04, .64, lc, .9, V - .33); box('worktop', ll, .5, .02, lc, 1.17, V - .02);
    box('cabinet', ll, .62, .34, lc, 1.9, V - .18); box('black', .6, .012, .5, lc + ll * .22, .925, V - .33); box('metal', .5, .012, .4, lc - ll * .22, .925, V - .33);
    [[-.14, -.11], [.14, -.11], [-.14, .11], [.14, .11]].forEach(([a, b]) => cyl('metal', .075, .006, lc + ll * .22 + a, .934, V - .33 + b));          // hob rings
    cyl('metal', .018, .3, lc - ll * .22, 1.07, V - .1); box('metal', .02, .02, .2, lc - ll * .22, 1.21, V - .2);                                    // tap
    box('metal', .7, .06, .46, lc + ll * .22, 1.56, V - .25);                                                                                            // extractor
    for (let u = la + .3; u < uB - .2; u += .6) { box('brass', .16, .014, .014, u, .78, V - .625); box('brass', .16, .014, .014, u, 1.64, V - .36); box('black', .006, .86, .004, u - .3, .44, V - .612); }
  };
  const island = (u, v, len) => { box('cabinet', len, .88, .9, u, .44, v); rbox('worktop', len + .12, .05, 1.04, u, .905, v, .02); const n = Math.max(2, Math.floor(len / .65)); for (let i = 0; i < n; i++) { const su = u - len / 2 + len * (i + .5) / n; cyl('fabric', .17, .06, su, .68, v - .78); cyl('black', .02, .66, su, .33, v - .78); cyl('black', .15, .02, su, .01, v - .78); pendant(su, v, .8, .13); } };
  // the longest stretch of wall, at depth v, that no door needs kept clear
  const freeRun = (v, lo = .06, hi = U - .06) => { let best = [lo, lo], a = null; for (let u = lo; u <= hi + 1e-6; u += .05) { const [wx, wz] = to(u, v), hit = (o.zones || []).some(z => wx > z[0] && wx < z[1] && wz > z[2] && wz < z[3]); if (!hit && a === null) a = u; if ((hit || u + .05 > hi) && a !== null) { const b = hit ? u - .05 : u; if (b - a > best[1] - best[0]) best = [a, b]; a = null; } } return best; };
  switch (type) {
    case 'open': {
      if (q.tall) {          // the great room: six metres high, glass to the south and west
        const H2 = Hc; o.flip = !o.flip;          // measured from the west wall
        // stone chimney the full height of the room, fire on the lounge side, at the opening to the dining room
        box('stone', .7, H2, 3.4, U - .45, H2 / 2, 3.4); box('black', .06, .5, 2.4, U - .83, .75, 3.4); box('fire', .02, .2, 2.1, U - .86, .7, 3.4); box('glass', .01, .42, 2.3, U - .87, .75, 3.4); box('screen', .05, 1.0, 1.8, U - .83, 2.1, 3.4);
        // a deep U of sofas round a pair of stone tables
        rbox('rug', 5.6, .014, 4.6, U - 4.3, .007, 3.4, .005);
        rbox('sofa', 1.05, .42, 3.6, U - 6.3, .23, 3.4, .1); rbox('sofa', .28, .5, 3.6, U - 6.7, .6, 3.4, .09);
        rbox('sofa', 3.0, .42, 1.05, U - 4.3, .23, 1.45, .1); rbox('sofa', 3.0, .5, .28, U - 4.3, .6, 1.06, .09); rbox('fabric', .95, .42, .95, U - 3.4, .23, 5.3, .12); rbox('fabric', .95, .42, .95, U - 4.9, .23, 5.3, .12);
        [[-5.9, 2.4], [-5.9, 4.4], [-5.0, 1.5], [-3.6, 1.5]].forEach(([a, b], i) => rbox(i % 2 ? 'throw_' : 'linen', .42, .36, .42, U + a, .62, b, .08));
        cyl('stone', .65, .3, U - 4.6, .17, 3.1); cyl('stone', .45, .24, U - 3.6, .14, 3.9); box('books', .3, .06, .22, U - 4.6, .35, 3.1); cyl('pot', .06, .2, U - 3.6, .36, 3.9, .04); ball('flower', .12, U - 3.6, .52, 3.9, 1.1);
        // a chandelier dropping through the height of the room
        for (let k = 0; k < 14; k++) { const a = k * 2.4, rr = .25 + (k % 5) * .22, dr = 1.2 + (k * .37 % 2.6); box('black', .01, dr, .01, U - 4.3 + Math.cos(a) * rr, H2 - dr / 2, 3.4 + Math.sin(a) * rr); ball('lampShade', .11, U - 4.3 + Math.cos(a) * rr, H2 - dr - .08, 3.4 + Math.sin(a) * rr, 1); }
        // a grand piano in the glass corner
        rbox('black', 1.5, .3, 2.1, 2.0, .82, 2.0, .3); box('black', 1.4, .03, 1.9, 2.05, 1.25, 2.0, 0, 0); box('black', .06, .7, .06, 1.45, .35, 1.2); box('black', .06, .7, .06, 2.55, .35, 1.2); box('black', .06, .7, .06, 2.0, .35, 2.9); box('white', 1.2, .03, .16, 2.0, .7, .9); rbox('fabric', .7, .1, .4, 2.0, .48, .45, .04); box('black', .05, .46, .05, 1.72, .23, .45); box('black', .05, .46, .05, 2.28, .23, .45);
        plant(.6, .6, 1.6); plant(U - 1.2, .7, 1.4);
        // nothing crowds the sofas: a console behind them, a glass wine wall on the back wall, and open floor through to the kitchen
        rbox('darkWood', 2.6, .8, .42, U - 4.3, .4, 6.05, .02); { const [cx, cz] = to(U - 4.3, 6.05); if (!B.prop('Console', cx, y + .8, cz)) { cyl('lampShade', .16, .34, U - 5.2, 1.0, 6.05, .1); cyl('brass', .03, .2, U - 5.2, .86, 6.05); cyl('pot', .1, .3, U - 3.5, .95, 6.05, .07); ball('flower', .16, U - 3.5, 1.22, 6.05, 1.1); } }
        { const [cx, cz] = to(9.8, V - .3); if (!B.prop('WineWall', cx, y, cz, 0, 3.2, .5, 2.6)) { box('glass', 3.2, 2.6, .5, 9.8, 1.3, V - .3); for (let k = 0; k < 5; k++) box('darkWood', 3.1, .04, .42, 9.8, .35 + k * .5, V - .3); } }
        // floating oak stair up to the roof, against the back wall; its foot is 2 m in from the glass so you can walk round to it
        { const n = 18, rise = (data_floorH) / n; for (let k = 0; k < n; k++) { const su = 2.2 + k * .29, sy = rise * (k + 1); box('oak', .3, .06, 1.4, su, sy, V - .75); box('glassRail', .29, 1.0, .02, su, sy + .53, V - 1.47); box('brass', .3, .03, .04, su, sy + 1.05, V - 1.47); } }
        return;
      }
      // where the hall door comes in on the back wall, so the kitchen leaves it clear
      const hall = rooms.find(r => r.unit === q.unit && r.type === 'hall');
      let kA = .06, kB = U - .06;
      if (hall && alongX && !o.face && !o.flip && o.legacy) { const a = win === 'n' ? hall.x - x : x + w - hall.x - hall.w, b = a + hall.w; if (a > U - b) kB = a - .1; else kA = b + .1; }
      { const f = freeRun(V - .5); kA = f[0] + (f[0] > .1 ? .08 : 0); kB = f[1] - (f[1] < U - .1 ? .08 : 0); }
      const big = U > 8, kMax = big ? 4.6 : 3.6;
      if (kB - kA > kMax) { if (kA < .1) kB = kA + kMax; else kA = kB - kMax; }
      kitchen(kA, kB);
      const kc = (kA + kB) / 2, sl = Math.min(2.3, V * .42), lv = Math.min(2.0, V * .36);
      // a big room is three places: kitchen with an island at one end, a long table in the middle, the sofas at the far end behind a media wall
      const side = (big ? (kc > U / 2 ? 0 : 1) : (kc > U / 2 ? 1 : 0)) ^ (o.swap && !big ? 1 : 0), Lw = big ? 4.4 : U, lc = side ? U - Lw / 2 : Lw / 2, tvU = big ? (side ? U - Lw : Lw) : (side ? .22 : U - .22), dir = side ? 1 : -1;
      if ((V > 5.6 || (big && V > 4.7)) && kB - kA > 2.4) island(kc, V - 2.0, Math.min(big ? 2.6 : 2, kB - kA - .6));
      rbox('rug', Math.min(Lw - 1.2, 2.8), .012, 2.4, lc, .006, lv, .005);
      sofa(side, lv, sl); cyl('oak', .42, .04, lc, .36, lv); cyl('black', .03, .34, lc, .18, lv); box('books', .26, .05, .19, lc - .1, .405, lv + .08); cyl('pot', .05, .16, lc + .16, .46, lv - .1, .035); ball('plant2', .09, lc + .16, .6, lv - .1, 1.2);
      if (big) { box('wallInt', .14, Hc, 2.6, tvU, Hc / 2, lv); rbox('darkWood', .4, .42, 1.9, tvU + dir * .28, .23, lv, .02); box('screen', .05, .75, 1.4, tvU + dir * .1, 1.3, lv); rbox('sofa', 1.7, .4, .85, lc, .22, lv + 1.75, .09); rbox('sofa', 1.7, .5, .22, lc, .58, lv + 2.1, .09); }
      else { rbox('darkWood', .4, .42, 1.7, tvU, .23, lv, .02); box('screen', .05, .7, 1.25, side ? .06 : U - .06, 1.25, lv); }
      art(side, lv, 1.3, .8, x + z + fi); floorLamp(side ? U - .4 : .4, lv + sl / 2 + .4); plant(side ? U - .45 : .45, .45);
      if (big) { longTable(side ? U - Lw - 1.7 : Lw + 1.7, 1.4, 2.4, 6); plant(side ? .5 : U - .5, .5, 1.3); }
      else if (V > 4.4) roundTable(side ? U * .32 : U * .68, Math.min(V - 2.2, lv + 2.4), .5, 4);
      curtains();
      return;
    }
    case 'living': {
      if (q.look === 'cinema') {          // screen on the solid back wall, two tiers of recliners facing it
        box('black', U - 1.2, 2.3, .06, U / 2, 1.45, V - .08); box('screen', U - 1.8, 1.9, .03, U / 2, 1.45, V - .13); box('darkWood', U - .4, .3, 2.4, U / 2, .15, 2.4); rbox('rug2', U - 1.4, .014, 2.2, U / 2, .007, V - 2.0, .005);
        for (let r = 0; r < 2; r++) for (let k = 0, nk = U < 8 ? 3 : 4; k < nk; k++) { const cu = U / 2 - (nk - 1) * .85 + k * 1.7, cv = V - 3.4 - r * 2.1, up = r * .3; rbox('sofa', 1.2, .45, 1.2, cu, .25 + up, cv, .12); rbox('sofa', 1.2, .7, .3, cu, .7 + up, cv - .55, .1); rbox('sofa', .2, .3, 1.1, cu - .62, .55 + up, cv, .06); rbox('sofa', .2, .3, 1.1, cu + .62, .55 + up, cv, .06); }
        return;
      }
      if (q.look === 'spa') {          // roof spa: changing lockers by the door, two rain showers and a glass-fronted sauna along the pool side, a cold plunge, loungers and a screened massage table at the city glass
        // laid out from the lift door (far end) with the loungers and massage table on the city glass: mirror both axes
        const fb = (n, w, h, d, u, y, v) => box(n, w, h, d, U - u, y, V - v), frb = (n, w, h, d, u, y, v, r) => rbox(n, w, h, d, U - u, y, V - v, r), fc = (n, r, h, u, y, v, e) => cyl(n, r, h, U - u, y, V - v, e), fp = (u, v, k) => plant(U - u, V - v, k);
        [.75, V - .75].forEach(v => { fb('oak', .5, 2.2, 1.2, .25, 1.1, v); fb('black', .004, 2.1, .02, .51, 1.1, v); });
        frb('oak', .45, .45, 1.2, 1.0, .23, .85, .02); frb('fabric', .45, .06, 1.2, 1.0, .48, .85, .02);
        // two walk-in rain showers: stone back and sides, clear glass front, a bench of towels between them and the sauna
        fb('stone', 2.4, 2.3, .12, 3.3, 1.15, V - .06); fb('stone', .12, 2.3, 1.4, 2.1, 1.15, V - .7); fb('stone', .1, 2.3, 1.4, 3.3, 1.15, V - .7); fb('stone', .12, 2.3, 1.4, 4.5, 1.15, V - .7);
        fb('glass', 2.2, 2.0, .02, 3.3, 1.0, V - 1.4); fb('stone', 2.36, .04, 1.3, 3.3, .02, V - .7);
        [2.7, 3.9].forEach(u => { fb('brass', .03, .5, .03, u, 2.05, V - .3); fc('brass', .14, .02, u, 2.18, V - .55); });
        // sauna cabin: cedar walls, glass front facing the room, two tiers of benches inside
        const su = 6.1; fb('oak', 2.4, 2.2, .1, su, 1.1, V - .05); fb('oak', .1, 2.2, 1.6, su - 1.2, 1.1, V - .8); fb('oak', .1, 2.2, 1.6, su + 1.2, 1.1, V - .8); fb('oak', 2.4, .1, 1.6, su, 2.2, V - .8);
        fb('glass', 2.3, 2.1, .02, su, 1.05, V - 1.6); fb('darkWood', 2.2, .06, .55, su, .45, V - .35); fb('darkWood', 2.2, .06, .5, su, .9, V - .6); fb('black', .5, .4, .4, su + .8, .2, V - 1.2);
        // cold plunge in stone, steps of clear floor all round
        frb('stone', 1.7, .75, 1.0, 8.85, .375, V - 1.45, .06); fb('pool', 1.5, .02, .8, 8.85, .7, V - 1.45);
        // two loungers at the glass, a massage table behind a slatted oak screen at the far end
        [2.9, 4.4].forEach(u => { frb('fabric', .75, .3, 1.9, u, .2, 1.25, .06); frb('fabric', .75, .4, .5, u, .45, .5, .06); });
        fc('stone', .25, .45, 3.65, .23, 1.4);
        for (let k = 0; k < 9; k++) fb('oak', .05, 2.0, .05, 7.1, 1.0, .35 + k * .19);
        frb('oak', 1.9, .7, .7, 8.7, .35, 1.4, .03); frb('fabric', 1.9, .08, .7, 8.7, .74, 1.4, .03); frb('fabric', .45, .1, .3, 9.45, .82, 1.4, .04);
        fc('oak', .2, .5, 8.5, .25, 2.2); fp(U - .5, V - .5, 1.4); fp(U - .5, .5, 1.3);
        frb('rug2', 2.2, .012, 1.4, 8.7, .006, 1.4, .005);
        return;
      }
      if (q.look === 'bar') {          // sky lounge: a long bar, sofas facing the view, a telescope at the glass
        box('darkWood', 4.6, 1.08, .7, U / 2, .54, V - 1.3); rbox('worktop', 4.8, .06, .85, U / 2, 1.11, V - 1.3, .02); box('mirror', 4.4, 1.4, .03, U / 2, 1.7, V - .05); for (let k = 0; k < 3; k++) box('glass', 4.2, .02, .26, U / 2, 1.25 + k * .4, V - .2);
        for (let k = 0; k < 6; k++) { const su = U / 2 - 2 + k * .8; cyl('fabric', .18, .07, su, .76, V - 2.1); cyl('brass', .02, .74, su, .37, V - 2.1); cyl('brass', .16, .02, su, .01, V - 2.1); pendant(su, V - 1.3, .55, .1); }
        rbox('rug', 6, .014, 3.2, U / 2, .007, 2.6, .005); rbox('sofa', 3.2, .42, 1.0, U / 2, .23, 3.8, .1); rbox('sofa', 3.2, .5, .26, U / 2, .6, 4.2, .09); rbox('fabric', 1.0, .42, 1.0, U / 2 - 2.6, .23, 2.4, .12); rbox('fabric', 1.0, .42, 1.0, U / 2 + 2.6, .23, 2.4, .12); cyl('stone', .6, .3, U / 2, .17, 2.4);
        box('black', .03, 1.3, .03, 1.2, .65, .9); box('black', .03, 1.3, .03, 1.5, .65, 1.2); box('black', .03, 1.3, .03, .9, .65, 1.2); cyl('brass', .07, .9, 1.2, 1.42, 1.0, .05); plant(U - .8, .8, 1.5);
        return;
      }
      rbox('rug', Math.min(U - 1.4, 2.8), .012, Math.min(V - 1.2, 3), U / 2, .006, V / 2, .005);
      sofa(1, V / 2, Math.min(2.5, V - 1.6)); rbox('sofa', .9, .42, .85, U / 2, .23, V - .8, .09); rbox('sofa', .9, .5, .22, U / 2, .58, V - .42, .09);
      cyl('oak', .5, .05, U / 2, .38, V / 2); cyl('black', .03, .36, U / 2, .18, V / 2);
      // chimney breast with a wood burner, TV above and bookshelves either side
      box('wallInt', .32, Hc, 1.9, .16, Hc / 2, V / 2); box('black', .06, .62, .9, .33, .5, V / 2); box('fire', .02, .22, .46, .36, .36, V / 2); box('glass', .01, .44, .7, .37, .48, V / 2); box('oak', .2, .08, 1.7, .4, 1.15, V / 2); box('screen', .04, .62, 1.1, .34, 1.75, V / 2);
      if (V > 4.6) { box('books', .3, 1.9, .8, .17, .95, V / 2 - 1.45); box('books', .3, 1.9, .8, .17, .95, V / 2 + 1.45); }
      art(1, V / 2, 1.5, .9, 1); floorLamp(U - .4, V - .5); plant(U - .5, .5, 1.1); curtains(); beams();
      return;
    }
    case 'kitchen': { kitchen(.06, U - .06); island(U / 2, Math.max(1.5, V - 2.3), Math.min(2.4, U - 1.8)); plant(.4, .4, .9); beams(); return; }
    case 'dining': {
      if (q.look === 'kd') {          // kitchen along the back wall with a long island; the table by the glass, well clear of both
        kitchen(.9, 7.9); box('cabinet', 4.6, .9, 1.15, 4.4, .45, V - 2.5); rbox('worktop', 4.8, .06, 1.3, 4.4, .93, V - 2.5, .02);
        for (let k = 0; k < 5; k++) { const su = 2.6 + k * .9; cyl('fabric', .18, .07, su, .7, V - 3.5); cyl('brass', .02, .68, su, .34, V - 3.5); cyl('brass', .16, .02, su, .01, V - 3.5); }
        for (let k = 0; k < 3; k++) pendant(3.1 + k * 1.3, V - 2.5, .55, .16);
        rbox('rug', 6.2, .014, 3.2, U / 2 - .6, .007, 2.1, .005); longTable(U / 2 - .6, 2.1, 4.4, 12); [-1.4, 0, 1.4].forEach(k => pendant(U / 2 - .6 + k, 2.1, .55, .2)); plant(.7, .7, 1.4); plant(U - .8, .8, 1.3);
        return;
      }
      if (U > 6 && V > 6) { rbox('rug', 6, .014, 3.4, U / 2, .007, V / 2, .005); longTable(U / 2, V / 2, 4.4, 12); [-1.4, 0, 1.4].forEach(k => pendant(U / 2 + k, V / 2, .55, .2)); rbox('darkWood', 3.2, .8, .45, U / 2, .4, V - .26, .02); artBack(U / 2, 2.4, 1.2, 1); plant(.6, .6, 1.4); return; } longTable(U / 2, V / 2, Math.min(2.2, U - 1), U < 3.4 ? 4 : 6); beams(); return; }
    case 'bed': {
      const bedAt = (side, vc, bw, bl = 2.1) => { const hu = side ? U : 0, g = side ? -1 : 1, cu = hu + g * (.14 + bl / 2);          // headboard on a side wall
        rbox('fabric', .12, 1.15, bw + .3, hu + g * .07, .62, vc, .05); rbox('darkWood', bl + .06, .28, bw + .12, cu, .16, vc, .04); rbox('linen', bl - .08, .24, bw, cu, .42, vc, .08); rbox('throw_', .7, .1, bw + .04, hu + g * (.14 + bl - .5), .52, vc, .04);
        [-1, 1].forEach(k => { rbox('white', .36, .16, .6, hu + g * .45, .6, vc + k * bw / 4, .07); const sv = vc + k * (bw / 2 + .38); rbox('oak', .4, .5, .46, hu + g * .27, .25, sv, .02); cyl('brass', .07, .02, hu + g * .27, .51, sv); box('brass', .015, .26, .015, hu + g * .27, .64, sv); cyl('lampShade', .12, .16, hu + g * .27, .82, sv, .08); });
        rbox('fabric', .42, .42, bw * .8, hu + g * (.14 + bl + .42), .22, vc, .06); rbox('rug2', bl + 1.3, .012, bw + 1.7, hu + g * (bl / 2 + .7), .006, vc, .005); };
      const wardU = (u0, u1, back) => { const L = u1 - u0, wv = back ? V - .31 : .31, fv = back ? V - .604 : .604; box('white', L, 2.3, .58, (u0 + u1) / 2, 1.15, wv); const n = Math.round(L / .55); for (let k = 1; k < n; k++) box('black', .006, 2.25, .006, u0 + k * L / n, 1.15, fv); for (let k = 0; k < n; k++) box('brass', .014, .3, .014, u0 + (k + (k % 2 ? .12 : .88)) * L / n, 1.1, back ? fv - .012 : fv + .012); };
      const wardV = (v0, v1, side) => { const L = v1 - v0, wu = side ? U - .31 : .31, fu = side ? U - .604 : .604; box('white', .58, 2.3, L, wu, 1.15, (v0 + v1) / 2); const n = Math.round(L / .55); for (let k = 1; k < n; k++) box('black', .006, 2.25, .006, fu, 1.15, v0 + k * L / n); for (let k = 0; k < n; k++) box('brass', .014, .3, .014, side ? fu - .012 : fu + .012, 1.1, v0 + (k + (k % 2 ? .12 : .88)) * L / n); };
      if (q.look === 'suite') {          // principal bedroom: bed on the solid east wall looking at the glass, a wall of wardrobes on the hall wall, two chairs in the glass corner
        box('darkWood', .06, 1.7, 3.8, U - .04, 1.0, 2.5); box('led', .02, .02, 3.8, U - .06, 1.87, 2.5); bedAt(1, 2.5, 2.1, 2.2);
        wardU(3.0, U - .08, 1);
        rbox('fabric', .9, .42, .9, 1.4, .23, 1.5, .14); rbox('fabric', .9, .5, .2, 1.4, .58, 1.1, .08); rbox('fabric', .9, .42, .9, 3.0, .23, 1.5, .14); rbox('fabric', .9, .5, .2, 3.0, .58, 1.1, .08); cyl('stone', .32, .5, 2.2, .25, 1.6); rbox('rug', 3.4, .012, 2.4, 2.2, .006, 1.55, .005); cyl('brass', .012, 1.5, .7, .75, .75); cyl('lampShade', .15, .22, .7, 1.55, .75, .1);
        plant(U - .6, 6.6, 1.4); plant(.7, 4.6, 1.3);
        return;
      }
      if (q.look === 'guest') {          // guest bedroom: bed on the solid west wall, wardrobes along the east wall clear of the en-suite door, a dressing table on the hall wall, a chair by the glass
        bedAt(0, 4.0, 1.8);
        wardV(2.4, 6.25, 1);
        rbox('oak', 1.5, .78, .45, 3.9, .39, V - .26, .02); box('mirror', .9, 1.0, .02, 3.9, 1.5, V - .03); rbox('fabric', .45, .42, .45, 3.9, .22, V - .95, .1);
        rbox('fabric', .8, .4, .8, 1.5, .22, 1.25, .12); rbox('fabric', .8, .5, .18, 1.5, .6, .9, .08); cyl('oak', .2, .5, 2.35, .25, 1.15); floorLamp(.6, .7); plant(3.6, .7, 1.2);
        return;
      }
      const bw = U > 6 ? 2.1 : U > 3.3 ? 1.65 : 1.4, bl = U > 6 ? 2.2 : 2.05, bu = U / 2 + (o.bs || 0) * Math.max(0, (U - bw - 1.5) / 2), bv = V - bl / 2 - .12;
      rbox('darkWood', bw + .12, .28, bl + .06, bu, .16, bv, .04); rbox('linen', bw, .24, bl - .08, bu, .42, bv, .08); rbox('throw_', bw + .04, .1, .7, bu, .52, bv - bl / 2 + .5, .04);
      rbox('fabric', bw + .2, 1.05, .12, bu, .6, V - .07, .05); rbox('white', .6, .16, .36, bu - bw / 4, .6, V - .42, .07); rbox('white', .6, .16, .36, bu + bw / 4, .6, V - .42, .07);
      [-1, 1].forEach(g => { if (U > bw + 1.3) { const su = bu + g * (bw / 2 + .36); rbox('oak', .46, .5, .4, su, .25, V - .27, .02); cyl('brass', .07, .02, su, .51, V - .27); box('brass', .015, .26, .015, su, .64, V - .27); cyl('lampShade', .12, .16, su, .82, V - .27, .08); } });
      rbox('rug2', bw + 1, .012, 1.5, bu, .006, bv - bl / 2 + .1, .005); artBack(bu, 1.2, .6, x * 3 + fi);
      if (V > 4.2 && U > 2.9 && !(U > 6 && V > 6)) { const wl = Math.min(2, V - 2.9); box('white', .58, 2.25, wl, .31, 1.125, .5 + wl / 2); for (let k = 1; k < wl / .5 - .5; k++) box('black', .004, 2.2, .006, .602, 1.125, .5 + k * .5); box('brass', .014, .3, .014, .615, 1.1, .5 + wl / 2 - .06); box('brass', .014, .3, .014, .615, 1.1, .5 + wl / 2 + .06); }
      else if (V > 3.5 && U > 2.9 && !(U > 6 && V > 6)) { const wl = Math.min(1.5, V - 2.75); box('white', .58, 2.25, wl, .31, 1.125, .45 + wl / 2); box('black', .004, 2.2, .006, .602, 1.125, .45 + wl / 2); box('brass', .014, .3, .014, .615, 1.1, .45 + wl / 2 - .06); box('brass', .014, .3, .014, .615, 1.1, .45 + wl / 2 + .06); }
      else if (U > 4.2 && V > 2.6 && !(U > 6 && V > 6)) {          // a room turned side-on: wardrobes on the solid end wall, beside the door, never on the glass
        const glassAt = uu => { const [px, pz] = to(uu, V / 2); return (e.n && Math.abs(pz - z) < .2) || (e.s && Math.abs(pz - z - d) < .2) || (e.w && Math.abs(px - x) < .2) || (e.e && Math.abs(px - x - w) < .2); };
        const ends = [0, 1].filter(sd => !glassAt(sd ? U - .05 : .05)); let done = false;
        for (const L of [1.8, 1.4, 1.0]) for (const sd of ends) for (const v0 of [.06, V - L - .06]) { if (done || L > V - .9) continue;
          const a = to(sd ? U - .62 : .02, v0), b = to(sd ? U - .02 : .62, v0 + L), r = { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) };
          if ((o.zones || []).some(zn => overlap(r, zn) > .02)) continue; wardV(v0, v0 + L, sd); done = true; }
      }
      // the other side wall: a low dresser with a mirror and flowers
      if (U > 3.4 && V > 3.9 && !(U > 6 && V > 6)) { const dl = Math.min(1.3, V - 2.9), dv = .55 + dl / 2; rbox('oak', .45, .78, dl, U - .26, .39, dv, .02); box('brass', .01, .02, dl - .2, U - .49, .55, dv); box('mirror', .02, .7, dl * .6, U - .04, 1.45, dv); cyl('pot', .07, .18, U - .26, .87, dv - dl * .25, .05); ball('flower', .1, U - .26, 1.04, dv - dl * .25, 1.1); box('books', .2, .05, .26, U - .26, .805, dv + dl * .25); }
      // a reading chair by the window in a wider room
      if (U > 4.3 && !(U > 6 && V > 6)) { rbox('fabric', .75, .4, .75, U - 1.35, .22, 1.05, .12); rbox('fabric', .75, .5, .18, U - 1.35, .6, .72, .08); cyl('oak', .2, .5, U - 2.05, .25, .95); cyl('brass', .012, 1.45, U - .75, .725, .6); cyl('lampShade', .14, .2, U - .75, 1.5, .6, .09); }
      if (V > 4.4) rbox('fabric', bw * .8, .42, .4, bu, .22, bv - bl / 2 - .32, .06);
      if (U > 6 && V > 6) { rbox('darkWood', 4.8, 1.7, .06, bu, 1.0, V - .04, .01); box('led', 4.8, .02, .02, bu, 1.87, V - .06); rbox('rug', 4.8, .012, 3.6, bu, .004, bv - .9, .005); plant(bu - 3.0, V - .6, 1.5); plant(bu + 3.0, V - .6, 1.5);
        rbox('fabric', .9, .42, .9, 1.4, .23, 1.5, .14); rbox('fabric', .9, .5, .2, 1.4, .58, 1.1, .08); rbox('fabric', .9, .42, .9, 3.0, .23, 1.5, .14); rbox('fabric', .9, .5, .2, 3.0, .58, 1.1, .08); cyl('stone', .32, .5, 2.2, .25, 1.6); plant(U - .7, .7, 1.4); rbox('rug', 3.4, .012, 2.4, 2.2, .006, 1.55, .005); cyl('brass', .012, 1.5, .7, .75, .75); cyl('lampShade', .15, .22, .7, 1.55, .75, .1);
        }
      curtains();
      return;
    }
    case 'bath': {
      if (q.look === 'ensuite') {          // en-suite shower room: door on the west wall by the window, WC and vanity along the east wall, a full-width walk-in shower across the far end
        box('white', U - .04, .05, 1.2, U / 2, .03, V - .6); box('glass', 1.55, 2.05, .02, U - .78, 1.03, V - 1.2); box('metal', .25, .02, .25, U / 2 + .3, Hc - .12, V - .6); cyl('brass', .015, 1.1, U - .08, 1.3, V - .6);
        rbox('oak', .46, .5, 1.2, U - .25, .55, 2.0, .02); rbox('stone', .5, .05, 1.24, U - .25, .83, 2.0, .02); rbox('white', .34, .05, .5, U - .25, .875, 2.0, .04); cyl('brass', .014, .2, U - .08, .96, 2.0); box('mirror', .02, 1.0, 1.0, U - .03, 1.6, 2.0);
        rbox('white', .58, .4, .38, U - .31, .2, .7, .08); box('brass', .02, 1.0, .5, .04, 1.2, 2.1); rbox('linen', .03, .5, .44, .07, 1.0, 2.1, .01); rbox('rug2', .6, .012, .9, 1.55, .006, 2.0, .005);
        return;
      }
      if (U * V > 18) {          // a principal bathroom: tub by the window on a stone plinth, double vanity on the back wall, walk-in shower at one end
        rbox('stone', 2.4, .06, 1.35, U / 2, .03, 1.15, .02); rbox('white', 1.8, .58, .85, U / 2, .35, 1.15, .3); cyl('brass', .02, .95, U / 2 + 1.05, .475, 1.15); rbox('oak', .4, .45, .4, U / 2 - 1.45, .23, 1.15, .04); rbox('linen', .32, .08, .3, U / 2 - 1.45, .5, 1.15, .02);
        const vl = Math.min(2.6, U - 2.4); rbox('oak', vl, .5, .5, U / 2, .55, V - .28, .02); rbox('stone', vl + .04, .06, .52, U / 2, .83, V - .28, .02);
        [-1, 1].forEach(g => { rbox('white', .5, .05, .34, U / 2 + g * vl / 4, .875, V - .28, .04); cyl('brass', .014, .2, U / 2 + g * vl / 4, .96, V - .1); box('mirror', .8, 1.0, .02, U / 2 + g * vl / 4, 1.6, V - .03); });
        box('glass', .02, 2.1, 1.5, 1.4, 1.05, V - .8); box('stone', 1.3, .04, 1.5, .7, .03, V - .8); box('metal', .25, .02, .25, .7, Hc - .12, V - .8);
        rbox('white', .38, .4, .58, U - .3, .2, V - 1.7, .08); rbox('rug2', 1.8, .012, .7, U / 2, .006, V - .95, .005); plant(U - .5, .6, 1.0); box('metal', .02, .02, .6, U - .05, 1.1, 2.0); rbox('throw_', .03, .55, .5, U - .07, .85, 2.0, .01);
        return;
      }
      if (U * V < 5.6) {          // a shower room: everything along the wall opposite the door
        box('glass', .02, 2, .9, .96, 1, V - .47); box('white', .9, .04, .9, .5, .025, V - .47); box('metal', .22, .02, .22, .5, Hc - .12, V - .5);
        if (U > 2.1) { rbox('oak', .6, .5, .42, U / 2 + .22, .5, V - .24, .02); rbox('white', .64, .06, .44, U / 2 + .22, .78, V - .24, .02); box('mirror', .56, .8, .02, U / 2 + .22, 1.45, V - .03); }
        rbox('white', .38, .4, .56, U - .28, .2, V - .32, .08); if (U > 1.6 && V > 1.9) rbox('rug2', Math.min(.8, U - .8), .012, .5, U / 2, .006, V - 1.3, .005);
        return;
      }
      if (U >= 1.75 && V >= 1.9) { rbox('white', Math.min(1.7, U - .12), .56, .76, Math.min(1.7, U - .12) / 2 + .06, .29, V - .42, .12); box('metal', .03, .3, .03, .25, .72, V - .42); }
      else if (V > 1.6) { box('glass', .9, 2, .02, U / 2, 1, V - .95); box('metal', .25, .02, .25, U / 2, Hc - .1, V - .45); }
      rbox('oak', Math.min(.8, U - .3), .5, .44, U - .46, .5, .26, .02); rbox('white', Math.min(.84, U - .26), .06, .46, U - .46, .78, .26, .02); box('mirror', Math.min(.7, U - .4), .8, .02, U - .46, 1.45, .03); cyl('metal', .014, .16, U - .46, .9, .12); box('metal', .016, .016, .12, U - .46, .97, .18); box('metal', .5, .02, .02, Math.max(.4, U * .28), 1.2, .05); rbox('linen', .44, .5, .03, Math.max(.4, U * .28), .96, .07, .01);
      if (U > 1.5) rbox('white', .38, .4, .58, Math.max(.3, U * .28), .2, .36, .08);
      if (V > 2.2) { rbox('rug2', .8, .012, .5, U - .46, .006, .82, .005); rbox('throw_', .44, .2, .03, Math.max(.4, U * .28), 1.08, .075, .01); }
      return;
    }
    case 'study': {
      rbox('oak', Math.min(1.6, U - .5), .04, .7, U / 2, .74, .55, .01); box('black', .04, .72, .6, U / 2 - .7, .36, .55); box('black', .04, .72, .6, U / 2 + .7, .36, .55);
      box('screen', .72, .42, .03, U / 2, 1.06, .36); rbox('fabric', .5, .1, .5, U / 2, .48, 1.2, .04); rbox('fabric', .5, .5, .08, U / 2, .8, 1.45, .04); cyl('black', .03, .44, U / 2, .22, 1.2); cyl('black', .26, .03, U / 2, .015, 1.2);
      box('books', Math.min(2.4, U - .4), Math.min(2.0, Hc - .3), .32, U / 2, 1.0, V - .17); plant(.4, V - .7, .8);
      return;
    }
    case 'utility': {
      if (q.look === 'dress') {          // dressing room between the bedroom (west door) and the bathroom (north door, west end): oak wardrobes in a U round the other three sides, a stone island, a long mirror by the bedroom door
        const run = (L, cu, cv, alongU) => { box('oak', alongU ? L : .6, 2.4, alongU ? .6 : L, cu, 1.2, cv); const n = Math.round(L / .6); for (let k = 1; k < n; k++) alongU ? box('black', .005, 2.3, .62, cu - L / 2 + k * L / n, 1.2, cv) : box('black', .62, 2.3, .005, cu, 1.2, cv - L / 2 + k * L / n); };
        run(U - .2, U / 2, V - .31, 1); run(2.8, 3.0, .31, 1); run(V - 1.22, U - .31, V / 2, 0); box('led', U - .2, .02, .02, U / 2, 2.42, V - .31); box('led', 2.8, .02, .02, 3.0, 2.42, .31);
        rbox('stone', 1.6, .9, .6, 2.7, .45, V / 2, .02); box('brass', 1.5, .02, .02, 2.7, .7, V / 2 - .31); rbox('rug2', 2.4, .012, 1.3, 2.7, .006, V / 2, .005);
        box('mirror', .03, 1.9, .8, .03, 1.1, 2.4); pendant(2.3, V / 2, .45, .14); pendant(3.1, V / 2, .45, .14);
        return;
      }
      if (U > 1.1 && V > 1) { const L = Math.min(U - .12, 1.9); box('white', L, .88, .6, L / 2 + .06, .44, V - .32); box('worktop', L + .02, .04, .62, L / 2 + .06, .9, V - .32); box('white', L, .6, .34, L / 2 + .06, 1.9, V - .19); } return; }
    case 'hall': {
      if (house && fi === 0) {       // staircase up one wall, console table and mirror by the door
        const n = 11, run = .26, rise = (Hc + .3) / n, sx = U - .5;
        for (let i = 0; i < n; i++) { const v = V - .5 - i * run; box('white', .9, rise * (i + 1), run, sx, rise * (i + 1) / 2, v); box('oak', .92, .035, run + .02, sx, rise * (i + 1), v); }
        box('glassRail', .02, 1.0, n * run, sx - .46, Hc * .62, V - .5 - (n - 1) * run / 2);
        rbox('oak', .34, .8, 1.0, .2, .4, 1.5, .02); box('mirror', .02, .9, .7, .03, 1.5, 1.5); plant(.35, 2.5, .8); rbox('rug', 1.0, .012, 2.0, .9, .006, 1.7, .005);
      } else if (U > 1.5 && V > 1.5) { rbox('oak', Math.min(.9, U - .5), .8, .32, U / 2, .4, V - .18, .02); box('mirror', Math.min(.7, U - .6), .8, .02, U / 2, 1.5, V - .02); }
      // a long hall gets a runner and a line of pendants
      if (!(house && fi === 0) && Math.max(U, V) > 5 && Math.min(U, V) > 1.2) { const lu = U >= V, L = lu ? U : V, Wd = lu ? V : U, rw = Math.min(1.2, Wd - .7);
        if (lu) rbox('rug', L - 1.4, .012, rw, U / 2, .006, V / 2, .005); else rbox('rug', rw, .012, L - 1.4, U / 2, .006, V / 2, .005);
        for (let k = 0, n = Math.max(2, Math.round(L / 3.2)); k < n; k++) { const t = (k + .5) / n * L; pendant(lu ? t : U / 2, lu ? V / 2 : t, .35, .12); } }
      return;
    }
    case 'balcony': case 'terrace': {
      rbox('darkWood', .6, .4, .6, U * .3, .2, V / 2, .05); rbox('fabric', .52, .1, .52, U * .3, .44, V / 2, .04); rbox('darkWood', .6, .4, .6, U * .3 + 1.1, .2, V / 2, .05); rbox('fabric', .52, .1, .52, U * .3 + 1.1, .44, V / 2, .04);
      cyl('black', .25, .03, U * .3 + .55, .46, V / 2); cyl('black', .02, .45, U * .3 + .55, .23, V / 2);
      if (U > 3) { rbox('pot', .9, .4, .34, U - .65, .2, V - .22, .03); ball('plant', .3, U - .85, .56, V - .22, 1); ball('flower', .22, U - .5, .6, V - .22, 1); ball('plant2', .24, U - .66, .62, V - .2, 1.1); }
      return;
    }
    case 'lobby': {
      if (w * d > 60) {
        rbox('oak', 3.2, 1.05, .8, U / 2, .53, V * .32, .04); rbox('worktop', 3.3, .05, .9, U / 2, 1.08, V * .32, .02);
        rbox('rug', 5.4, .012, 4.2, U / 2, .006, V * .7, .005); cyl('stone', .7, .34, U / 2, .17, V * .7); cyl('stone', .4, .28, U / 2 + .95, .14, V * .7 + .35); box('books', .32, .05, .24, U / 2 - .1, .365, V * .7); cyl('pot', .07, .2, U / 2 + .25, .44, V * .7 - .15, .05); ball('flower', .13, U / 2 + .25, .63, V * .7 - .15, 1.1);
        [-1, 1].forEach(g => { const sv = V * .7 + g * 1.5; rbox('sofa', 2.6, .42, .95, U / 2, .23, sv, .1); rbox('sofa', 2.6, .5, .26, U / 2, .6, sv + g * .4, .09); rbox('linen', .42, .36, .42, U / 2 - .8, .62, sv + g * .1, .08); rbox('throw_', .42, .36, .42, U / 2 + .8, .62, sv + g * .1, .08);
          const cu = U / 2 + g * 2.25; rbox('fabric', .85, .42, .85, cu, .23, V * .7, .12); rbox('fabric', .2, .5, .85, cu + g * .34, .6, V * .7, .08); });
        cyl('lampShade', .13, .3, U / 2 - 1.2, 1.25, V * .32, .1); cyl('brass', .02, .12, U / 2 - 1.2, 1.14, V * .32);
        plant(1.4, 1, 1.5); plant(U - 1.4, 1, 1.5); plant(1.2, V - 1, 1.3); [-.6, 0, .6].forEach((o2, i) => pendant(U / 2 + o2 * 1.4, V * .32, .7 + (i % 2) * .3, .2));
      } else { rbox('metal', 1.6, .9, .5, U / 2, .45, V - .3, .03); plant(.7, .7, 1.3); pendant(U / 2, V / 2, .7, .22); }
      return;
    }
    case 'corridor': { rbox('rug', U - .6, .012, V - .7, U / 2, .006, V / 2, .005); { const lu = U >= V, L = lu ? U : V; for (let k = 0, n = Math.max(2, Math.round(L / 3.5)); k < n; k++) { const t = (k + .5) / n * L; pendant(lu ? t : U / 2, lu ? V / 2 : t, .3, .13); } if (lu) { plant(.55, V / 2, 1.1); plant(U - .55, V / 2, 1.1); } else { plant(U / 2, .55, 1.1); plant(U / 2, V - .55, 1.1); } } return; }
  }
}

// ---------- extras that make each building its own design ----------
// Halden Tower: a white balcony wraps every floor and curves in and out, differently on each floor.
const waveOff = (s, i) => { const a = Math.sin(s * Math.PI * 4 + i * .36), b = Math.sin(s * Math.PI * 8 - i * .23 + 1.3), c = Math.sin(s * Math.PI * 2 + i * .15 + 2.0); return .45 + 3.6 * Math.pow(clamp(.5 + .5 * (.6 * a + .25 * b + .15 * c), 0, 1), 1.5); };
function wavePts(base, i, inset = 0, scale = 1) { return base.map(p => { const o = waveOff(p.s, i) * scale - inset; return [p.x + p.nx * o, p.z + p.nz * o]; }); }
function towerExtras(S, data, plate) {
  const base = roundRect(plate.x0, plate.x1, plate.z0, plate.z1, 1.6, .55), n = data.floors.length;
  for (let i = 1; i <= n; i++) {
    if (i === n && data.floors[n - 1].rooms.some(q => OUTSIDE.has(q.type))) continue;          // a roof terrace has its own roof
    const top = i === n, sc = top ? 1.15 : 1, pts = wavePts(base, i, 0, sc), y = i * data.floorH + (top ? .2 : 0);
    const sh = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
    if (!top) sh.holes.push(new THREE.Path([[plate.x0 + .2, plate.z0 + .2], [plate.x1 - .2, plate.z0 + .2], [plate.x1 - .2, plate.z1 - .2], [plate.x0 + .2, plate.z1 - .2]].map(p => new THREE.Vector2(p[0], p[1]))));
    const g = new THREE.ExtrudeGeometry(sh, { depth: top ? .6 : .42, bevelEnabled: false, curveSegments: 1 }); g.rotateX(Math.PI / 2); g.translate(0, y, 0); S.geo('wave', g);
    if (!(i === n - 1 && data.floors[n - 1].rooms.some(q => q.pool))) S.geo('glassRail', stripGeo(wavePts(base, i, .08, sc), y, y + 1.1));          // the roof terrace has its own balustrade
  }
  for (let k = 0; k < base.length; k += 9) { const p = base[k]; S.cyl('bronze', .16, data.floorH, p.x + p.nx * .9, data.floorH / 2 - .3, p.z + p.nz * .9); }
  return base;
}
function towerRoof(R, data, plate, y) {
  const top = data.floors[data.floors.length - 1], yT = y - data.floorH;
  // a thin white roof floating over the enclosed rooms, with a deep overhang
  top.rooms.forEach(q => { if (OUTSIDE.has(q.type)) return; R.box('wave', q.w + 1.6, .32, q.d + 1.6, q.x + q.w / 2, y - .1, q.z + q.d / 2); });
  const deck = top.rooms.find(q => q.pool);
  if (deck) {
    const [x0, x1, z0] = deck.pool, z1 = plate.z1 + 3.8, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0, hT = 1.25;
    // glass tank: the outer half hangs past the edge of the tower, with a glass floor you can see the street through
    R.box('glass', w, .1, d, cx, yT + .05, cz); R.box('pool', w - .16, hT - .22, d - .16, cx, yT + .1 + (hT - .22) / 2, cz);
    R.box('glass', w, hT, .08, cx, yT + hT / 2, z0); R.box('glass', w, hT, .08, cx, yT + hT / 2, z1); R.box('glass', .08, hT, d, x0, yT + hT / 2, cz); R.box('glass', .08, hT, d, x1, yT + hT / 2, cz);
    R.box('metal', w + .1, .05, .1, cx, yT + hT, z0); R.box('metal', w + .1, .05, .1, cx, yT + hT, z1); R.box('metal', .1, .05, d, x0, yT + hT, cz); R.box('metal', .1, .05, d, x1, yT + hT, cz);
    for (let x = x0 + .6; x < x1; x += (w - 1.2) / 4) { R.box('bronze', .16, .5, z1 - plate.z1 + 1.2, x, yT - .32, (z1 + plate.z1) / 2 - .6); }
    // raised sun deck behind it, steps up, loungers
    R.box('deck', w + 1.2, hT - .04, 2.2, cx - .6, yT + (hT - .04) / 2, z0 - 1.1); for (let k = 0; k < 4; k++) R.box('deck', .34, hT * (k + 1) / 5, 2.2, x0 - 1.37 - k * .34, yT + hT * (k + 1) / 10, z0 - 1.1);
    for (let k = 0; k < 4; k++) { const lx = x0 + 1.2 + k * (w - 2.4) / 3; R.rbox('white', .7, .1, 1.9, lx, yT + hT + .22, z0 - 1.15, .04); R.rbox('fabric', .62, .08, 1.3, lx, yT + hT + .31, z0 - .9, .03); R.rbox('fabric', .62, .08, .6, lx, yT + hT + .42, z0 - 1.82, .03); }
    for (let k = 0; k < 4; k++) { const lx = x0 + 1.2 + k * (w - 2.4) / 3; R.rbox(k % 2 ? 'throw_' : 'linen', .5, .03, .7, lx, yT + hT + .37, z0 - .7, .01); if (k % 2 === 0) { R.cyl('metal', .03, 2.3, lx + .75, yT + hT + 1.15, z0 - 1.6); R.cyl('fabric', 1.25, .5, lx + .75, yT + hT + 2.45, z0 - 1.6, .05, 24); } }
    for (let k = 0; k < 6; k++) { R.cyl('downlight', .09, .02, x0 + .9 + k * (w - 1.8) / 5, yT + .12, z0 + 1.2, .09, 12); R.cyl('downlight', .09, .02, x0 + .9 + k * (w - 1.8) / 5, yT + .12, z1 - 1.2, .09, 12); }          // lights under the water
    { const px = x0 - 4.9, pz2 = plate.z1 - 1.3; R.rbox('pot', 1.2, .7, 1.2, px, yT + .35, pz2, .05); R.ball('plant', .8, px, yT + 1.5, pz2, 1.2, 2); R.ball('plant2', .5, px + .4, yT + 2.1, pz2 + .2, 1.1, 2); }
  }
  if (deck && deck.bar) {
    const [b0, b1] = deck.bar, bc = (b0 + b1) / 2, bw = b1 - b0, bz = deck.z;          // against the glass of the landing, facing the pool
    if (!R.prop('BarBack', bc, yT, bz + .2)) { R.box('darkWood', bw, 2.5, .34, bc, yT + 1.25, bz + .2); for (let k = 0; k < 4; k++) { R.box('downlight', bw - .3, .02, .3, bc, yT + .95 + k * .42, bz + .22); for (let x = b0 + .35; x < b1 - .2; x += .28) R.cyl(k % 2 ? 'glass' : 'brass', .045, .26, x, yT + 1.1 + k * .42, bz + .3, .03, 10); } }
    R.prop('BarCounter', bc, yT + 1.135, bz + 1.15);
    R.box('stone', bw, 1.06, .7, bc, yT + .53, bz + 1.15); R.rbox('worktop', bw + .3, .07, .9, bc, yT + 1.1, bz + 1.15, .02); R.box('downlight', bw, .03, .03, bc, yT + .12, bz + 1.52); R.box('brass', bw, .04, .06, bc, yT + .3, bz + 1.56);
    for (let x = b0 + .6; x < b1 - .3; x += .95) { R.cyl('fabric', .19, .08, x, yT + .8, bz + 1.95); R.cyl('brass', .022, .76, x, yT + .38, bz + 1.95); R.cyl('brass', .17, .02, x, yT + .01, bz + 1.95); }
    R.box('wave', bw + 1.2, .14, 2.9, bc, yT + 2.75, bz + 1.2); for (let x = b0 + .8; x < b1 - .4; x += 1.3) { R.box('black', .012, .7, .012, x, yT + 2.33, bz + 1.15); R.cyl('lampShade', .13, .2, x, yT + 1.9, bz + 1.15, .07); }
    [b0 - .25, b1 + .25].forEach(x => { R.box('bronze', .12, 2.7, .12, x, yT + 1.35, bz + 2.5); });
  }
  const gd = top.rooms.find(q => q.id && q.id.endsWith('-garden'));
  if (gd) {
    const gx = gd.x + gd.w / 2, gz = gd.z + gd.d / 2;
    R.cyl('stone', 1.1, .45, gx - 1.5, yT + .22, gz + 1.5, 1.1, 28); R.cyl('black', .8, .06, gx - 1.5, yT + .46, gz + 1.5, .8, 24); R.cyl('fire', .45, .12, gx - 1.5, yT + .52, gz + 1.5, .2, 12);
    [[0, -2.6, 3.6, .9], [-2.6, 0, .9, 3.6], [2.6, 0, .9, 3.0]].forEach(([dx, dz, sw, sdp]) => { R.rbox('fabric', sw, .42, sdp, gx - 1.5 + dx, yT + .25, gz + 1.5 + dz, .1); R.rbox('fabric', dx ? .25 : sw, .5, dx ? sdp : .25, gx - 1.5 + dx * 1.13, yT + .62, gz + 1.5 + dz * 1.13, .08); });
    for (let k = 0; k < 4; k++) { const tx = gd.x + 1.6 + k * (gd.w - 3.2) / 3, tz = gd.z + 1.5; R.rbox('pot', 1.3, .8, 1.3, tx, yT + .4, tz, .05); R.cyl('trunk', .09, 1.6, tx, yT + 1.6, tz); R.ball('plant', 1.0, tx, yT + 2.9, tz, 1.1, 2); R.ball('plant2', .7, tx + .4, yT + 3.3, tz + .2, 1, 2); }
    R.box('cabinet', 3.2, .9, .7, gd.x + 2.2, yT + .45, gd.z + gd.d - 1.2); R.box('worktop', 3.3, .05, .8, gd.x + 2.2, yT + .92, gd.z + gd.d - 1.2); R.box('black', .7, .02, .5, gd.x + 2.6, yT + .95, gd.z + gd.d - 1.2);
    for (let k = 0; k <= 5; k++) R.box('oak', .14, .16, 4.4, gd.x + .9 + k * .65, yT + 2.75, gd.z + gd.d - 2.2); [[.7, -.2], [4.4, -.2], [.7, -4.2], [4.4, -4.2]].forEach(([a, b]) => R.box('oak', .16, 2.7, .16, gd.x + a, yT + 1.35, gd.z + gd.d + b));
  }
}
function blockRoof(R, data, plate, y) {
  for (let b = 0; b < 6; b++) {
    if (b === 2 || b === 3) continue;
    const x0 = plate.x0 + b * 6, x1 = x0 + 6;
    R.box('slab', 6, .3, plate.d, x0 + 3, y - .15, plate.cz);
    gable(R, { axis: 'z', x0, x1, z0: plate.z0, z1: plate.z1, y, pitch: 48, over: 0, verge: 0, roof: 'zinc', wall: BAYS[b] });
    [plate.z0, plate.z1].forEach(zz => { R.box('glassLit', 1.1, 1.3, .06, x0 + 3, y + 1.15, zz); R.box('frame', 1.2, .06, .12, x0 + 3, y + 1.82, zz); R.box('frame', 1.2, .06, .12, x0 + 3, y + .48, zz); R.box('frame', .05, 1.34, .12, x0 + 3, y + 1.15, zz); R.box('frame', .06, 1.34, .12, x0 + 2.42, y + 1.15, zz); R.box('frame', .06, 1.34, .12, x0 + 3.58, y + 1.15, zz); });
  }
  // roof garden over the two middle bays
  const gx0 = plate.x0 + 12, gc = gx0 + 6;
  R.box('slab', 12, .3, plate.d, gc, y - .15, plate.cz); R.box('deck', 11.4, .06, plate.d - 1, gc, y + .03, plate.cz);
  [plate.z0, plate.z1].forEach((zz, k) => { const z = zz + (k ? -.15 : .15); R.box(BAYS[2], 6, 1.1, .3, gx0 + 3, y + .55, z); R.box(BAYS[3], 6, 1.1, .3, gx0 + 9, y + .55, z); R.box('stone', 12, .08, .4, gc, y + 1.14, z); });
  for (let i = 0; i < 5; i++) { const x = gx0 + 1.4 + i * 2.3; R.rbox('pot', 1.5, .6, .8, x, y + .36, plate.z0 + 1.2, .04); R.ball('plant', .55, x - .3, y + 1, plate.z0 + 1.2, 1, 2); R.ball('flower', .35, x + .35, y + .95, plate.z0 + 1.2, 1, 2); R.ball('plant2', .4, x, y + 1.15, plate.z0 + 1.1, 1.1, 2); }
  const pz = plate.cz + 3; [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => R.box('oak', .16, 2.5, .16, gc + a * 3.6, y + 1.3, pz + b * 2)); for (let i = 0; i < 10; i++) R.box('oak', .08, .16, 4.6, gc - 3.6 + i * .8, y + 2.6, pz);
  R.box('oak', 7.6, .18, .12, gc, y + 2.48, pz - 2); R.box('oak', 7.6, .18, .12, gc, y + 2.48, pz + 2);
  R.rbox('oak', 2.6, .06, 1, gc, y + .8, pz, .02); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => R.box('black', .05, .72, .05, gc + a * 1.2, y + .4, pz + b * .4));
  for (let i = 0; i < 3; i++) { R.rbox('fabric', .5, .45, .5, gc - .9 + i * .9, y + .28, pz - .85, .06); R.rbox('fabric', .5, .45, .5, gc - .9 + i * .9, y + .28, pz + .85, .06); }
  R.rbox('sofa', 2.4, .45, .9, gc, y + .28, plate.z1 - 2, .1); R.rbox('sofa', 2.4, .5, .25, gc, y + .65, plate.z1 - 1.6, .1);
  R.box('core', 3.4, 2.6, 3, gx0 + 2.2, y + 1.3, plate.z0 + 4.6); R.box('door', .9, 2.1, .06, gx0 + 2.6, y + 1.05, plate.z0 + 6.12);
}
// Ashcombe House: a slate roof with a timber-clad gable to the street and a glazed gable to the garden
function houseRoof(R, data, plate, y) {
  const { x0, x1, z0, z1, cz } = plate;
  R.box('slab', plate.w + .1, .25, plate.d + .1, plate.cx, y - .12, cz);
  const rise = gable(R, { axis: 'x', x0, x1, z0, z1, y, pitch: 42, over: .45, roof: 'slate', wall: 'render' });
  gable(R, { axis: 'z', x0: -6, x1: -1.2, z0, z1: cz, y, pitch: 52, over: .3, roof: 'slate', wall: 'clad', ends: [true, false] });
  const gx0 = -1.2, gx1 = 6, half = (gx1 - gx0) / 2, gc = (gx0 + gx1) / 2, gr = half * Math.tan(rad(40));
  gable(R, { axis: 'z', x0: gx0, x1: gx1, z0: cz, z1, y, pitch: 40, over: .3, roof: 'slate', wall: 'glassLit', ends: [false, true] });
  for (let i = -3; i <= 3; i++) { const dx = i * half / 4, h = gr * (1 - Math.abs(dx) / half); R.box('frame', .07, h, .34, gc + dx, y + h / 2, z1 - .15); }
  R.box('frame', gx1 - gx0, .12, .36, gc, y + .06, z1 - .15);
  [[-1, 1], [1, -1]].forEach(([s, rz]) => R.box('frame', half / Math.cos(rad(40)) + .2, .14, .4, gc + s * half / 2, y + gr / 2, z1 - .15, 0, 0, rz * rad(40)));
  // chimney and solar panels
  R.box('render', .8, rise + 1.2, .8, x0 + .7, y + (rise + 1.2) / 2, cz + .9); R.box('stone', .95, .1, .95, x0 + .7, y + rise + 1.25, cz + .9); R.cyl('plinth', .16, .4, x0 + .7, y + rise + 1.5, cz + .9);
  for (let i = 0; i < 3; i++) R.box('screen', 1.0, .04, 1.7, x0 + 2.1 + i * 1.08, y + rise - 2.2 * Math.tan(rad(42)) + .2, cz + 2.2, 0, rad(42));
  return rise;
}
function houseExtras(S, plate) {
  // oak porch over the front door, pergola over the garden terrace, lights by the doors, EV charger
  const z0 = plate.z0, z1 = plate.z1, px = .1;
  [-1, 1].forEach(a => { S.box('oak', .16, 2.6, .16, px + a * 1.25, 1.0, z0 - 1.5); S.box('oak', .16, .18, 1.6, px + a * 1.25, 2.38, z0 - .75); }); S.box('oak', 2.9, .18, .16, px, 2.38, z0 - 1.5);
  gable(S, { axis: 'z', x0: px - 1.55, x1: px + 1.55, z0: z0 - 1.75, z1: z0, y: 2.47, pitch: 38, over: .12, verge: 0, roof: 'slate', wall: 'oak', ends: [true, false], t: .09 });
  S.box('stone', 3.2, .12, 1.9, px, -.24, z0 - .9);
  const tx0 = -1.2, tx1 = 6, tz = z1 + 3.2, tc = (tx0 + tx1) / 2;
  [tx0 + .2, tc, tx1 - .2].forEach(x => S.box('oak', .18, 2.6, .18, x, 1.0, tz)); S.box('oak', tx1 - tx0 + .4, .2, .16, tc, 2.4, tz); S.box('oak', tx1 - tx0 + .4, .2, .16, tc, 2.4, z1 + .12);
  for (let x = tx0 + .2; x <= tx1 - .1; x += .6) S.box('oak', .07, .16, 3.4, x, 2.58, z1 + 1.65);
  [[-.95, z0 - .2], [1.15, z0 - .2], [-1.6, z1 + .2], [6.3, z1 + .2]].forEach(([x, z]) => { S.box('black', .12, .26, .1, x, 1.9, z); S.box('lampHead', .08, .14, .12, x, 1.84, z + (z < 0 ? -.03 : .03)); });
  S.box('white', .3, .45, .14, plate.x1 - .9, 1.1, z0 - .2);
}

// ---------- the setting ----------
function trees(scene, spots, M) {
  const n = spots.length; if (!n) return;
  const trunkG = new THREE.CylinderGeometry(.1, .18, 1, 7); trunkG.translate(0, .5, 0);
  const crownG = mergeGeometries([[0, 0, 0, 1], [.55, .25, .2, .7], [-.5, .15, -.3, .75], [.1, .55, -.2, .7], [-.15, -.1, .55, .7]].map(([x, y, z, r]) => { const g = new THREE.IcosahedronGeometry(r, 2); g.translate(x, y, z); return g; }));
  const trunk = new THREE.InstancedMesh(trunkG, M.trunk, n), crown = new THREE.InstancedMesh(crownG, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }), n);
  const m = new THREE.Matrix4(), c = new THREE.Color(), Q = new THREE.Quaternion();
  spots.forEach(([x, z, s = 1], i) => {
    const h = (3.4 + rng() * 2.6) * s, r = (1.5 + rng() * .8) * s;
    m.compose(new THREE.Vector3(x, -.3, z), Q.identity(), new THREE.Vector3(s, h * .62, s)); trunk.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(x, h * .78, z), Q.setFromEuler(new THREE.Euler(0, rng() * 6, 0)), new THREE.Vector3(r, r * (.85 + rng() * .3), r)); crown.setMatrixAt(i, m);
    crown.setColorAt(i, c.set('#4f6e34').offsetHSL((rng() - .5) * .06, (rng() - .5) * .12, (rng() - .5) * .1));
  });
  [trunk, crown].forEach(o => { o.castShadow = true; o.receiveShadow = true; scene.add(o); });
}
function car(B, x, z, ry, mat) {
  const c = Math.cos(ry), s = Math.sin(ry), at = (u, v) => [x + u * c + v * s, z - u * s + v * c];
  const body = new RoundedBoxGeometry(4.3, .62, 1.8, 2, .18); body.rotateY(ry); body.translate(x, .25, z); B.geo(mat, body);
  const p = at(-.15, 0), cab = new RoundedBoxGeometry(2.4, .6, 1.62, 2, .22); cab.rotateY(ry); cab.translate(p[0], .82, p[1]); B.geo('screen', cab);
  [[1.3, .85], [1.3, -.85], [-1.3, .85], [-1.3, -.85]].forEach(([u, v]) => { const q = at(u, v), w = new THREE.CylinderGeometry(.33, .33, .24, 14); w.rotateX(Math.PI / 2); w.rotateY(ry); w.translate(q[0], .03, q[1]); B.geo('black', w); });
}
const lamp = (B, x, z) => { B.cyl('rail', .07, 5, x, 2.2, z, .05); B.box('rail', .9, .06, .1, x + .4, 4.7, z); B.box('lampHead', .5, .06, .22, x + .65, 4.65, z); };
function tower2(B, x, z, w, d, h, mat, split = .7) { B.box(mat, w, h * split, d, x, h * split / 2 - .3, z); B.box(mat, w * .78, h * (1 - split), d * .78, x + w * .06, h * split + h * (1 - split) / 2 - .3, z - d * .05); B.box('roofFlat', w + .3, .5, d + .3, x, h * split - .1, z); B.box('roofFlat', w * .78 + .3, .5, d * .78 + .3, x + w * .06, h - .1, z - d * .05); B.box('core', w * .3, 2.5, d * .3, x + w * .06, h + 1.2, z); }
function site(scene, data, M, plate) {
  const B = new Bucket(M), W = plate.w, D = plate.d, big = 2600, tr = [];
  if (data.site.kind === 'city') {
    B.box('ground', big, .1, big, 0, -.4, 0);
    B.box('pave', W + 34, .12, D + 40, 0, -.3, 2);
    B.box('road', 14, .1, 320, -W / 2 - 24, -.32, 0); B.box('road', 14, .1, 320, W / 2 + 24, -.32, 0); B.box('road', 320, .1, 14, 0, -.32, -D / 2 - 25);
    for (let i = -150; i < 150; i += 8) { B.box('mark', .2, .02, 3, -W / 2 - 24, -.26, i); B.box('mark', .2, .02, 3, W / 2 + 24, -.26, i); B.box('mark', 3, .02, .2, i, -.26, -D / 2 - 25); }
    // reflecting pool, benches and planters in the plaza
    B.box('stone', 20.6, .5, 6.6, 0, -.2, D / 2 + 11); const wg = new THREE.PlaneGeometry(20, 6); wg.rotateX(-Math.PI / 2); wg.translate(0, .06, D / 2 + 11); scene.add(new THREE.Mesh(wg, M.water));
    [-14, 14].forEach(x => { B.rbox('stone', 5, .5, 2.2, x, -.05, D / 2 + 11, .06); B.ball('plant', 1.1, x, 1.2, D / 2 + 11, .8, 2); B.ball('flower', .6, x + 1.2, .7, D / 2 + 11.2, .8, 2); B.ball('plant2', .7, x - 1.3, .8, D / 2 + 10.8, .9, 2); });
    [-7, 0, 7].forEach(x => { B.rbox('oak', 2.4, .1, .6, x, .2, D / 2 + 16.4, .03); B.box('stone', .3, .45, .6, x - .9, -.05, D / 2 + 16.4); B.box('stone', .3, .45, .6, x + .9, -.05, D / 2 + 16.4); });
    for (let i = 0; i < 46; i++) tr.push([(rng() - .5) * 150, D / 2 + 30 + rng() * 80, .9 + rng() * .6]);
    for (let i = -W / 2 - 10; i <= W / 2 + 10; i += 7) tr.push([i, -D / 2 - 13, .8], [i, D / 2 + 20.5, .85]);
    for (let z = -D / 2 - 6; z <= D / 2 + 16; z += 8) tr.push([-W / 2 - 13, z, .8], [W / 2 + 13, z, .8]);
    B.box('pave', 4, .02, 90, 0, -.28, D / 2 + 65);
    [[-78, -55, 26, 22, 70, 'nbGlass'], [-70, 14, 22, 28, 40, 'nbStone'], [70, -52, 24, 22, 54, 'nbGlass'], [78, 18, 24, 26, 32, 'nbStone'], [0, -86, 44, 22, 46, 'nbStone'], [-124, -24, 30, 30, 26, 'nbStone'], [124, -34, 28, 30, 62, 'nbGlass'],
      [-44, -124, 28, 28, 92, 'nbGlass'], [60, -124, 30, 26, 38, 'nbStone'], [150, 62, 30, 30, 28, 'nbStone'], [-160, 74, 30, 30, 36, 'nbGlass'], [-140, -120, 34, 30, 50, 'nbStone'], [150, -130, 30, 30, 76, 'nbGlass']].forEach(b => tower2(B, ...b));
    for (let i = -120; i < 140; i += 24) { lamp(B, -W / 2 - 16.2, i); lamp(B, W / 2 + 16.2, i); }
    car(B, -W / 2 - 21, -20, Math.PI / 2, 'car1'); car(B, W / 2 + 27, 8, -Math.PI / 2, 'car2'); car(B, 14, -D / 2 - 22, 0, 'car3'); car(B, -30, -D / 2 - 28, Math.PI, 'car2');
  } else if (data.site.kind === 'canal') {
    const c0 = D / 2 + 9.4, c1 = D / 2 + 23;
    B.box('ground', big, .1, big / 2 + c0, 0, -.4, (c0 - big / 2) / 2); B.box('ground', big, .1, big / 2 - c1, 0, -.4, (c1 + big / 2) / 2); B.box('stone', 320, 1.2, 14, 0, -1.6, D / 2 + 16.2);
    B.box('blockPave', W + 12, .12, D + 10, 0, -.3, 1); B.box('road', 320, .1, 9, 0, -.32, -D / 2 - 11); for (let i = -150; i < 150; i += 8) B.box('mark', 3, .02, .2, i, -.26, -D / 2 - 11);
    B.box('pave', 320, .12, 3.4, 0, -.3, -D / 2 - 4.8); B.box('pave', 320, .12, 4.4, 0, -.3, D / 2 + 7); B.box('stone', 320, .55, .5, 0, -.2, D / 2 + 9.3); B.box('stone', 320, .55, .5, 0, -.2, D / 2 + 23.1);
    const wg = new THREE.PlaneGeometry(320, 13.4); wg.rotateX(-Math.PI / 2); wg.translate(0, -.75, D / 2 + 16.2); scene.add(Object.assign(new THREE.Mesh(wg, M.water), { receiveShadow: true }));
    [[-22, 'boat', 'boatTop'], [24, 'boatTop', 'boat'], [70, 'car1', 'boat']].forEach(([bx, a, b]) => { B.rbox(a, 20, .9, 2.1, bx, -.45, D / 2 + 11.6, .3); B.rbox(b, 14, 1, 1.9, bx + 1, .45, D / 2 + 11.6, .12); B.rbox('roofFlat', 14.2, .08, 2, bx + 1, .98, D / 2 + 11.6, .03); for (let i = 0; i < 5; i++) B.box('glassLit', 1.1, .4, 1.94, bx - 4 + i * 2.5, .55, D / 2 + 11.6); B.ball('flower', .25, bx + 6.5, 1.15, D / 2 + 11.6, 1); B.ball('plant', .3, bx - 4, 1.2, D / 2 + 11.4, 1); });
    for (let i = -110; i <= 110; i += 7.5) tr.push([i + rng() * 3, D / 2 + 28 + rng() * 16, .9 + rng() * .5]); for (let i = -62; i <= 62; i += 8) tr.push([i, -D / 2 - 4.6, .65]);
    for (let i = -W / 2; i <= W / 2; i += 9) { B.rbox('oak', 2, .1, .5, i, .15, D / 2 + 8.2, .03); B.box('black', .08, .4, .5, i - .8, -.08, D / 2 + 8.2); B.box('black', .08, .4, .5, i + .8, -.08, D / 2 + 8.2); }
    // other wharf buildings along the canal and terraces over the road
    const wh = (x, z, w, d, h, mat, n) => { B.box(mat, w, h, d, x, h / 2 - .3, z); for (let k = 0; k < n; k++) gable(B, { axis: 'z', x0: x - w / 2 + k * w / n, x1: x - w / 2 + (k + 1) * w / n, z0: z - d / 2, z1: z + d / 2, y: h - .3, pitch: 45, over: 0, verge: 0, roof: 'zinc', wall: 'brickNb' }); };
    wh(-W / 2 - 24, 0, 24, D, 12, 'nbBrick', 4); wh(W / 2 + 22, 0, 18, D, 15, 'nbBrick', 3); wh(-W / 2 - 62, 0, 30, D, 9, 'nbStone', 5); wh(W / 2 + 58, 0, 30, D, 12, 'nbBrick', 5);
    for (let i = -96; i <= 96; i += 16) wh(i, -D / 2 - 26, 15, 10, 8 + (Math.abs(i / 16) % 2) * 3, 'nbBrick', 2);
    for (let i = -90; i < 100; i += 22) { lamp(B, i, -D / 2 - 6.2); lamp(B, i + 11, D / 2 + 5.4); }
    car(B, -8, -D / 2 - 9, 0, 'car1'); car(B, 12, -D / 2 - 9, 0, 'car2'); car(B, 30, -D / 2 - 13, Math.PI, 'car3');
  } else {
    B.box('ground', big, .1, big, 0, -.4, 0);
    const z0 = plate.z0, z1 = plate.z1, x0 = plate.x0, x1 = plate.x1;
    B.box('road', 320, .1, 8, 0, -.32, z0 - 16); B.box('pave', 320, .12, 2.4, 0, -.3, z0 - 10.6);
    B.box('lawn', W + 9, .06, 8.6, 0, -.32, z0 - 5); B.box('blockPave', 6, .1, 9.4, x1 - 2.6, -.3, z0 - 4.7); B.box('pave', 1.5, .1, 8, .1, -.3, z0 - 5.4);
    B.box('lawn', W + 9, .06, 30, 0, -.32, z1 + 15); B.box('pave', W + 5, .1, 4.4, 0, -.3, z1 + 2.2);
    B.rbox('hedge', .9, 1.3, 9, x0 - 4.2, .3, z0 - 5, .25); B.rbox('hedge', W - 2, 1.1, .9, x0 + (W - 8) / 2 - .3, .2, z0 - 9.2, .25);
    B.box('clad', .1, 1.9, 34, x0 - 4.6, .6, z1 + 13); B.box('clad', .1, 1.9, 34, x1 + 4.6, .6, z1 + 13); B.box('clad', W + 9.2, 1.9, .1, 0, .6, z1 + 30);
    for (let i = 0; i < 9; i++) { const zz = z1 + 6 + i * 2.6; B.ball(i % 2 ? 'flower' : 'plant2', .5, x0 - 3.8, .15, zz, .8, 2); B.ball('plant', .6, x1 + 3.9, .2, zz + 1, .9, 2); }
    B.box('soil', 1.2, .08, 24, x0 - 3.8, -.28, z1 + 17); B.box('soil', 1.2, .08, 24, x1 + 3.9, -.28, z1 + 17);
    // garden furniture, a garden room at the end, stepping stones
    const tz = z1 + 2.2; B.rbox('oak', 2.6, .06, 1.1, 2.4, .46, tz, .02); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => B.box('black', .05, .72, .05, 2.4 + a * 1.2, .08, tz + b * .45));
    for (let i = 0; i < 3; i++) { B.rbox('fabric', .5, .45, .5, 1.5 + i * .9, -.02, tz - .9, .06); B.rbox('fabric', .5, .45, .5, 1.5 + i * .9, -.02, tz + .9, .06); }
    B.rbox('sofa', 2.2, .4, .85, -4, -.05, tz + .4, .1); B.rbox('sofa', 2.2, .45, .24, -4, .3, tz + .74, .1); B.cyl('black', .45, .32, -4, -.1, tz - .8);
    B.box('clad', 5, 2.5, 3.4, 0, .95, z1 + 27); B.box('roofFlat', 5.6, .16, 4, 0, 2.28, z1 + 26.9); B.box('glassLit', 3, 2, .04, -.6, .75, z1 + 25.28); B.box('oak', 5.4, .1, 1.4, 0, -.22, z1 + 24.6);
    for (let i = 0; i < 9; i++) B.cyl('stone', .32, .05, -1.2 + Math.sin(i * .9) * .5, -.27, z1 + 5.4 + i * 2.1);
    car(B, x1 - 2.6, z0 - 4.6, Math.PI / 2, 'car1');
    for (let i = 0; i < 7; i++) tr.push([(rng() - .5) * (W + 4), z1 + 15 + rng() * 9, .7 + rng() * .4]); tr.push([x0 - 2, z0 - 6, .6], [x0 + 1.5, z0 - 7.4, .5]);
    for (let i = -70; i <= 70; i += 9) tr.push([i, z0 - 24, .85]);
    lamp(B, -16, z0 - 10.8); lamp(B, 16, z0 - 10.8);
    [[-21, 0, 'render', 'brickRed'], [21, .6, 'brickRed', 'render'], [-42, .3, 'brickRed', 'brickRed'], [42, 0, 'render', 'render']].forEach(([x, dz, wall, gw]) => { B.box(wall, 11, 5.6, 8.6, x, 2.5, dz); gable(B, { axis: 'x', x0: x - 5.5, x1: x + 5.5, z0: dz - 4.3, z1: dz + 4.3, y: 5.3, pitch: 40, roof: 'slate', wall }); gable(B, { axis: 'z', x0: x - 5.5, x1: x - 1, z0: dz - 4.3, z1: dz, y: 5.3, pitch: 48, over: .2, roof: 'slate', wall: gw, ends: [true, false] }); for (let i = 0; i < 3; i++) { B.box('glassLit', 1.2, 1.2, .05, x - 3.4 + i * 3.2, 1.2, dz - 4.32); B.box('glass', 1.2, 1.2, .05, x - 3.4 + i * 3.2, 3.9, dz - 4.32); } });
  }
  B.build(scene);
  trees(scene, tr, M);
}

// ---------- sky ----------
// A ring of far-off city (or wooded hills) on the horizon, so the view from a window ends in something.
function skylineTex(city, lights) {
  const t = canvasTex(4096, 256, (g, w, h) => {
    let sd = city ? 77 : 191; const rn = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    g.clearRect(0, 0, w, h);
    if (lights) { if (!city) return; for (let x = 0; x < w;) { const bw = 10 + rn() * 34, cl = .5 + .5 * Math.sin(x / w * Math.PI * 10 + 1), bh = 18 + rn() * 60 + cl * cl * rn() * 120; for (let yy = h - bh + 4; yy < h - 6; yy += 5) for (let xx = x + 2; xx < x + bw - 2; xx += 4) if (rn() < .22) { g.fillStyle = rn() < .8 ? 'rgba(255,214,150,.9)' : 'rgba(210,230,255,.8)'; g.fillRect(xx, yy, 2, 2); } x += bw + rn() * 6; } return; }
    const hill = (base, amp, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 8) g.lineTo(x, h - base - amp * (.5 + .5 * Math.sin(x / w * Math.PI * 6 + amp)) - amp * .4 * Math.sin(x / w * Math.PI * 22 + 2)); g.lineTo(w, h); g.fill(); };
    hill(city ? 26 : 46, city ? 22 : 46, 'rgba(120,134,150,.55)'); hill(city ? 12 : 26, city ? 12 : 30, 'rgba(96,112,124,.75)');
    if (city) { sd = 77; for (let x = 0; x < w;) { const bw = 10 + rn() * 34, cl = .5 + .5 * Math.sin(x / w * Math.PI * 10 + 1), bh = 18 + rn() * 60 + cl * cl * rn() * 120; g.fillStyle = `rgba(${78 + rn() * 26},${90 + rn() * 26},${106 + rn() * 26},.92)`; g.fillRect(x, h - bh, bw, bh); x += bw + rn() * 6; } }
    else for (let x = 0; x < w; x += 5 + rn() * 9) { const r = 6 + rn() * 12; g.fillStyle = `rgba(${52 + rn() * 20},${74 + rn() * 24},${56 + rn() * 16},.95)`; g.beginPath(); g.arc(x, h - 6 - rn() * 16, r, 0, 7); g.fill(); }
    g.fillStyle = city ? 'rgba(86,98,112,.95)' : 'rgba(58,80,60,.97)'; g.fillRect(0, h - 8, w, 8);
  });
  t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
function makeSky() {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sun: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color() }, night: { value: 0 }, cloud: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top, hor, sunCol, sun, cloud; uniform float night; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); float a = h(vec3(i,1.0)), b = h(vec3(i+vec2(1,0),1.0)), c = h(vec3(i+vec2(0,1),1.0)), d = h(vec3(i+vec2(1,1),1.0)); return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * n2(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
      void main(){ float y = max(vP.y, 0.0); vec3 c = mix(hor, top, pow(y, 0.5));
        float s = max(dot(vP, normalize(sun)), 0.0); c += sunCol * (pow(s, 700.0) * 5.0 + pow(s, 10.0) * 0.4);
        if (vP.y > 0.02) { vec2 q = vP.xz / (vP.y + 0.18) * 1.1; float cl = smoothstep(0.52, 0.82, fbm(q + 3.0)) * smoothstep(0.02, 0.22, vP.y); c = mix(c, cloud + sunCol * 0.25 * pow(s, 3.0), cl * 0.75); }
        if (vP.y < 0.0) c = hor * 0.75;
        c += vec3(step(0.9975, h(floor(vP * 420.0))) * night * smoothstep(0.05, 0.3, vP.y));
        gl_FragColor = vec4(c, 1.0); }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), m);
}

// ---------- main ----------
export function run(data, root) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, touch = matchMedia('(pointer: coarse)').matches;
  const canvas = root.querySelector('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.75 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
  const camera = new THREE.PerspectiveCamera(40, 1, .1, 5000);
  const M = makeMaterials(), Ms = makeMaterials();          // M: the building (can be X-rayed). Ms: everything around it.
  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), BIG), clipUp = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BIG);
  Object.values(M).forEach(m => { m.clippingPlanes = [clip]; m.clipShadows = true; });
  let dirty = true, idleAt = performance.now(), last = performance.now(), furnished = true;
  const poke = () => { idleAt = performance.now(); dirty = true; };

  const litSet = new Set(); Object.keys(data.units).forEach((id, i) => { if (((i * 2654435761) >>> 0) % 100 < 66) litSet.add(id); }); if (data.single) litSet.add('house');
  const lit = u => !!u && litSet.has(u);
  const nF = data.floors.length, topY = nF * data.floorH, Hw = data.floorH - .3;
  const plate = (() => { const R = data.floors[nF - 1].rooms.filter(q => !OUTSIDE.has(q.type)); const x0 = Math.min(...R.map(q => q.x)), x1 = Math.max(...R.map(q => q.x + q.w)), z0 = Math.min(...R.map(q => q.z)), z1 = Math.max(...R.map(q => q.z + q.d)); return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 }; })();

  // the building: one shell for all floors, a roof, and interiors that are built when a floor is opened
  const building = new THREE.Group(); scene.add(building);
  const plans = data.floors.map((fl, i) => planFloor(fl, data, i));
  const S = new Bucket(M); data.floors.forEach((fl, i) => shellFloor(S, fl, plans[i], data, i, plate, lit));
  let waveBase = null, roofH = 4;
  if (data.style === 'glass') waveBase = towerExtras(S, data, plate);
  if (data.style === 'house') houseExtras(S, plate);
  S.build(building);
  const roofG = new THREE.Group(); building.add(roofG);
  { const R = new Bucket(M); if (data.roof === 'crown') { towerRoof(R, data, plate, topY); roofH = 2; } else if (data.roof === 'gables') { blockRoof(R, data, plate, topY); roofH = 5; } else roofH = houseRoof(R, data, plate, topY) + 2.5; R.build(roofG); }
  const autoDoors = [];
  plans.forEach((segs, fi) => segs.forEach(sg => { if (!sg.auto) return; const len = sg.b - sg.a, Hd = data.floorH - .42, mk = () => { const m = new THREE.Mesh(new THREE.BoxGeometry(sg.axis === 'x' ? .04 : len / 2, Hd, sg.axis === 'x' ? len / 2 : .04), M.glass); building.add(m); return m; }; autoDoors.push({ sg, fi, len, Hd, a: mk(), b: mk(), open: -1 }); }));
  function doorsTick(dt) { autoDoors.forEach(d => { const sg = d.sg, y = d.fi * data.floorH, mid = (sg.a + sg.b) / 2, cx = sg.axis === 'x' ? sg.L : mid, cz = sg.axis === 'x' ? mid : sg.L, p = camera.position;
    const want = Math.hypot(p.x - cx, p.z - cz) + Math.abs(p.y - y - 1.5) * 2 < (st ? 11 : 4.4) ? 1 : 0;      // in the film the doors are already open by the top of the stair if (d.open < 0) d.open = want; else if (Math.abs(want - d.open) > .002) { d.open += (want - d.open) * Math.min(1, dt * 2.6); dirty = true; } else if (d.open === d.o2) return; d.o2 = d.open;
    const off = d.len / 4 + d.open * d.len * .47; [[d.a, -off], [d.b, off]].forEach(([m, o]) => { if (sg.axis === 'x') m.position.set(sg.L, y + d.Hd / 2, mid + o); else m.position.set(mid + o, y + d.Hd / 2, sg.L); }); }); }
  const inner = data.floors.map(() => null);
  function ensureInner(i) { if (inner[i]) return inner[i]; const B = new Bucket(M); innerFloor(B, data.floors[i], plans[i], data, i); const g = B.build(new THREE.Group()); g.position.y = i * data.floorH; g.visible = false; building.add(g); inner[i] = g; return g; }
  function showInner(list) { inner.forEach((g, i) => { if (g) g.visible = list.includes(i); }); list.forEach(i => { const g = ensureInner(i); g.visible = true; g.children.forEach(m => { m.visible = furnished || FINISH.some(k => m.material === M[k]); }); }); dirty = true; }

  // the X-ray outline of everything above the open floor
  const ghost = new THREE.Group(); scene.add(ghost);
  {
    const pos = [], ring = (pts, y) => pts.forEach((p, k) => { const q = pts[(k + 1) % pts.length]; pos.push(p[0], y, p[1], q[0], y, q[1]); });
    const rect = [[plate.x0, plate.z0], [plate.x1, plate.z0], [plate.x1, plate.z1], [plate.x0, plate.z1]];
    for (let i = 1; i <= nF; i++) { ring(rect, i * data.floorH - .3); if (waveBase) ring(wavePts(waveBase, i), i * data.floorH); }
    const step = data.single ? 3 : 6; for (let x = plate.x0; x <= plate.x1 + .01; x += step) [plate.z0, plate.z1].forEach(z => pos.push(x, 0, z, x, topY, z)); for (let z = plate.z0 + step; z < plate.z1; z += step) [plate.x0, plate.x1].forEach(x => pos.push(x, 0, z, x, topY, z));
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const lm = new THREE.LineBasicMaterial({ color: '#9fc4e8', transparent: true, opacity: .34, depthWrite: false, clippingPlanes: [clipUp] });
    ghost.add(new THREE.LineSegments(lg, lm));
    roofG.children.forEach(m => { if (!m.material.transparent) ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 28), lm)); });
    ghost.visible = false;
  }
  const scan = new THREE.Mesh(new THREE.RingGeometry(.985, 1, 4, 1, Math.PI / 4), new THREE.MeshBasicMaterial({ color: '#9fd0ff', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  scan.rotation.x = -Math.PI / 2; scan.scale.set((plate.w + 8) * .7071, (plate.d + 8) * .7071, 1); scan.position.set(plate.cx, 0, plate.cz); scan.visible = false; scene.add(scan);

  site(scene, data, Ms, plate);

  // light
  const sky = makeSky(); scene.add(sky);
  const hemi = new THREE.HemisphereLight('#dfe8f2', '#6b6152', .5); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 3); sun.castShadow = true; scene.add(sun, sun.target);
  const Rfull = Math.max(plate.w, plate.d, topY) * (data.single ? 2.4 : 1.25) + 10; let R = Rfull;
  const sm = sun.shadow; sm.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048); sm.bias = -.0004; sm.normalBias = .03;
  scene.fog = new THREE.Fog('#c9d3dc', 240, 1300);
  const cityish = data.style !== 'house', ringGeo = new THREE.CylinderGeometry(1250, 1250, 300, 96, 1, true);
  const horizon = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: skylineTex(cityish, false), transparent: true, side: THREE.BackSide, fog: false, depthWrite: false })); horizon.position.y = 84; horizon.scale.y = .58; scene.add(horizon);
  const horizonLit = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: skylineTex(cityish, true), transparent: true, side: THREE.BackSide, fog: false, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); horizonLit.position.y = 84; horizonLit.scale.set(.999, .58, .999); scene.add(horizonLit);
  if (cityish) {          // the rest of the city, out to the haze: one instanced mesh
    const N = 420, im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), Ms.nbStone, N), o = new THREE.Object3D(); let sd = 5; const rn = () => (sd = (sd * 16807) % 2147483647) / 2147483647; let n = 0;
    for (let gx = -11; gx <= 11 && n < N; gx++) for (let gz = -11; gz <= 11 && n < N; gz++) { const x = gx * 78 + (rn() - .5) * 30, z = gz * 78 + (rn() - .5) * 30, r = Math.hypot(x, z); if (r < 215 || r > 900 || rn() < .28) continue; if (data.style === 'brick' && z > 20 && z < 46) continue; const w = 16 + rn() * 30, d = 16 + rn() * 30, hh = (8 + rn() * 26) * (rn() < .12 ? 2.4 : 1); o.position.set(x, hh / 2 - .3, z); o.scale.set(w, hh, d); o.rotation.y = rn() < .5 ? 0 : Math.PI / 2; o.updateMatrix(); im.setMatrixAt(n++, o.matrix); }
    im.count = n; im.castShadow = false; im.receiveShadow = false; scene.add(im);
  }
  const roomLights = []; for (let i = 0; i < 10; i++) { const l = new THREE.PointLight('#ffd8a8', 0, 9, 1.6); l.visible = false; l.userData.base = 0; scene.add(l); roomLights.push(l); }

  const ui = {}, $ = s => root.querySelector(s);
  let hour = data.startHour, night = 0, focusY = topY * .35;
  function setTime(h) {
    hour = h;
    const t = (h - 6) / 14, elev = 52 * Math.sin(Math.PI * clamp(t, -.25, 1.25)), az = rad(90 + 180 * t), e = rad(Math.max(elev, -8));
    const dir = new THREE.Vector3(Math.cos(e) * Math.sin(az), Math.sin(e), -Math.cos(e) * Math.cos(az));   // x east, -z north
    night = smooth(2, -6, elev);
    const dusk = smooth(22, 1, elev) * (1 - night), center = new THREE.Vector3(plate.cx, focusY, plate.cz), far = Math.max(R, 30) * 2.5;
    sun.position.copy(center).addScaledVector(dir, far); sun.target.position.copy(center);
    const sc = new THREE.Color('#fff4e6').lerp(new THREE.Color('#ff9a4d'), dusk);
    if (elev > 0) { sun.color.copy(sc); sun.intensity = 4.2 * smooth(0, 6, elev) + .2 * night; }
    else { sun.color.set('#8aa2c8'); sun.intensity = .35 * night; sun.position.copy(center).add(new THREE.Vector3(-.3, 1, .4).normalize().multiplyScalar(far)); }
    hemi.intensity = .18 + .42 * (1 - night); hemi.color.set(night > .5 ? '#4a5a78' : '#dfe8f2'); hemi.groundColor.set(night > .5 ? '#1a1a1e' : '#6b6152');
    scene.environmentIntensity = .12 + .5 * (1 - night);
    const top = new THREE.Color('#3a6fb5').lerp(new THREE.Color('#2b3c63'), dusk).lerp(new THREE.Color('#05070d'), night);
    const hor = new THREE.Color('#cddbe6').lerp(new THREE.Color('#f2a76b'), dusk).lerp(new THREE.Color('#121722'), night);
    const u = sky.material.uniforms; u.top.value.copy(top); u.hor.value.copy(hor); u.sun.value.copy(dir); u.sunCol.value.copy(sc).multiplyScalar(1 - night); u.night.value = night;
    u.cloud.value.set('#ffffff').lerp(new THREE.Color('#f6c9a4'), dusk).lerp(new THREE.Color('#1a1f2b'), night);
    scene.fog.color.copy(hor); horizon.material.color.copy(hor).lerp(new THREE.Color(night > .5 ? '#0c1018' : '#ffffff'), night > .5 ? .5 : .12); horizon.material.opacity = .8; horizonLit.material.opacity = night; renderer.toneMappingExposure = 1 - .15 * night;
    [M, Ms].forEach(K => { K.glassLit.emissiveIntensity = night * 1.1; K.glass.opacity = .4 + .2 * night; K.lantern.emissiveIntensity = .15 + night * 1.6; K.lampHead.emissiveIntensity = night * 4; K.downlight.emissiveIntensity = .5 + night * 2.4; K.led.emissiveIntensity = 1.1 + night * 1.6; K.wineBack.emissiveIntensity = .75 + night * .7; K.pool.emissiveIntensity = .12 + night * 1.5; K.lampShade.emissiveIntensity = .25 + night * 1.6; K.fire.emissiveIntensity = .9 + night * .6; [K.nbGlass, K.nbBrick, K.nbStone].forEach(m => { m.emissiveIntensity = night * .75; }); });
    roomLights.forEach(l => { l.intensity = l.userData.base * (.35 + 2.2 * night); });
    if (ui.time) ui.time.textContent = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
    dirty = true;
  }
  function shadowBox(r) { R = r; Object.assign(sm.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: Math.max(r, 30) * 6 }); sm.camera.updateProjectionMatrix(); setTime(hour); }

  // picking volumes: one per floor, one per room
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  const floorPick = data.floors.map((fl, i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(plate.w + .6, data.floorH, plate.d + .6), pickMat); m.position.set(plate.cx, i * data.floorH + data.floorH / 2 - .3, plate.cz); m.userData.floor = i; building.add(m); return m; });
  const roomPick = data.floors.map((fl, i) => fl.rooms.filter(q => q.type !== 'core' && q.type !== 'void' && !COMMUNAL.has(q.type)).map(q => { const m = new THREE.Mesh(new THREE.BoxGeometry(q.w, .2, q.d), pickMat); m.position.set(q.x + q.w / 2, i * data.floorH + .1, q.z + q.d / 2); m.userData.room = q; m.userData.floor = i; building.add(m); return m; }));

  // availability colours and selection highlights
  const STATUS = { Available: '#c8913a', Reserved: '#a7a29a', Sold: '#8a3a32' };
  const overlay = new THREE.Group(); building.add(overlay); const unitVolumes = [];
  Object.values(data.units).forEach(u => {
    if (data.single) return;
    const rs = data.floors[u.floor].rooms.filter(q => q.unit === u.id && !OUTSIDE.has(q.type));
    const x0 = Math.min(...rs.map(q => q.x)), x1 = Math.max(...rs.map(q => q.x + q.w)), z0 = Math.min(...rs.map(q => q.z)), z1 = Math.max(...rs.map(q => q.z + q.d));
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 - .3, data.floorH - .7, z1 - z0 - .3), new THREE.MeshBasicMaterial({ color: STATUS[u.status], transparent: true, opacity: .55, depthWrite: false }));
    m.position.set((x0 + x1) / 2, u.floor * data.floorH + (data.floorH - .7) / 2 + .05, (z0 + z1) / 2); m.userData.unit = u; m.visible = false; overlay.add(m); unitVolumes.push(m);
  });
  const selMat = new THREE.MeshBasicMaterial({ color: '#c8913a', transparent: true, opacity: .3, depthWrite: false }), hoverMat = new THREE.MeshBasicMaterial({ color: '#ede8df', transparent: true, opacity: .16, depthWrite: false });
  const selGroup = new THREE.Group(), hoverGroup = new THREE.Group(); building.add(selGroup, hoverGroup);
  function paint(group, mat, floor, rooms, tall) { group.clear(); rooms.forEach(q => { const m = new THREE.Mesh(new THREE.BoxGeometry(q.w - .04, tall ? data.floorH - .4 : .03, q.d - .04), mat); m.position.set(q.x + q.w / 2, tall ? (data.floorH - .4) / 2 - .2 : .06, q.z + q.d / 2); group.add(m); }); group.position.y = floor * data.floorH; }

  // ---------- UI ----------
  ui.time = $('[data-time]'); ui.slider = $('[data-slider]'); ui.floors = $('[data-floors]'); ui.card = $('[data-card]'); ui.hint = $('[data-hint]'); ui.walk = $('[data-walkbar]'); ui.plan = $('[data-plan]');
  ui.avail = $('[data-avail]'); ui.tabs = $('[data-tabs]'); ui.modal = $('[data-modal]'); ui.loader = $('[data-loader]'); ui.compass = $('[data-compass] i'); ui.answer = $('[data-answer]');
  ui.slider.value = hour; ui.slider.addEventListener('input', () => { setTime(+ui.slider.value); poke(); });
  const status = {}; Object.values(data.units).forEach(u => { (status[u.floor] ||= { Available: 0, Reserved: 0, Sold: 0 })[u.status]++; });
  data.floors.map((fl, i) => i).reverse().forEach(i => {
    const fl = data.floors[i], b = document.createElement('button'), st = status[i]; b.type = 'button'; b.dataset.floor = i;
    b.innerHTML = `<span class="fn">${fl.short}</span><span class="fl">${fl.label}${st && !data.single ? `<em>${fl.tag ? fl.tag + ' · ' : ''}${st.Available} available</em>` : ''}</span>`;
    b.addEventListener('click', () => { openFloor(+b.dataset.floor); poke(); }); ui.floors.appendChild(b);
  });
  const allBtn = document.createElement('button'); allBtn.type = 'button'; allBtn.className = 'whole'; allBtn.textContent = data.single ? 'Whole house' : 'Whole building';
  allBtn.addEventListener('click', () => { closeFloors(); poke(); }); ui.floors.prepend(allBtn);
  if (ui.avail) ui.avail.addEventListener('change', () => { showAvail(ui.avail.checked); poke(); });
  function showAvail(on) { unitVolumes.forEach(m => { m.visible = !!on && (openIdx < 0 || m.userData.unit.floor === openIdx); }); root.classList.toggle('avail-on', !!on); dirty = true; }

  // ---------- camera ----------
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = .08; controls.maxPolarAngle = Math.PI * .49; controls.minDistance = data.single ? 6 : 12; controls.maxDistance = data.single ? 80 : Math.max(240, topY * 3.2); controls.screenSpacePanning = false;
  let fly = null;
  function flyTo(pos, target, dur = 1.1, fov, then) { if (reduce) dur = .01; fly = { then, p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), f0: camera.fov, f1: fov || camera.fov, s: performance.now(), d: dur * 1000 }; dirty = true; }
  // Fly from exactly where the camera is now, swinging round the building instead of cutting through it.
  // `more` carries on past `pos` (for example in through a window); `looks` are what to look at along the way.
  function flyArc(pos, target, dur, fov, then, more = [], looks = []) {
    if (reduce) dur = .01; const a = camera.position, cx = plate.cx, cz = plate.cz, n = 7, P = [];
    const a0 = Math.atan2(a.x - cx, a.z - cz), r0 = Math.hypot(a.x - cx, a.z - cz), r1 = Math.hypot(pos.x - cx, pos.z - cz); let da = Math.atan2(pos.x - cx, pos.z - cz) - a0; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; if (r1 < 3) da = 0;
    for (let i = 0; i <= n; i++) { const k = i / n, e = k * k * (3 - 2 * k), ang = a0 + da * e, r = r0 + (r1 - r0) * e; P.push(new THREE.Vector3(cx + Math.sin(ang) * r, a.y + (pos.y - a.y) * e, cz + Math.cos(ang) * r)); }
    P[n].copy(pos); P.push(...more);
    fly = { curve: new THREE.CatmullRomCurve3(P, false, 'centripetal'), tcurve: new THREE.CatmullRomCurve3([controls.target.clone(), target.clone(), ...looks.length ? looks : [target.clone()]], false, 'centripetal'), p1: P[P.length - 1].clone(), t1: (looks[looks.length - 1] || target).clone(), f0: camera.fov, f1: fov || camera.fov, s: performance.now(), d: dur * 1000, then };
    dirty = true;
  }
  const floorView = i => { const y = i * data.floorH, dist = data.single ? 15 : Math.max(plate.w, plate.d) * 1.15 + 6; return [new THREE.Vector3(plate.cx + dist * .35, y + dist * .95, plate.cz + dist * .62), new THREE.Vector3(plate.cx, y, plate.cz)]; };
  const overviewPos = () => { const h = Math.max(topY, 8), dist = data.single ? 30 : Math.max(plate.w, h) * 1.75 + 20; return [new THREE.Vector3(plate.cx + dist * .62, h * (data.single ? .75 : .62) + dist * .26, plate.cz + dist * .82), new THREE.Vector3(plate.cx, h * .42, plate.cz)]; };
  const [p0, t0] = overviewPos(); camera.position.copy(p0).multiplyScalar(1.35); controls.target.copy(t0);

  // ---------- X-ray: opening a floor ----------
  let openIdx = -1, selUnit = null, selRoom = null, cut = BIG, cutTo = BIG, cutEnd = BIG, scanA = 0;
  function setCut(y) {
    if (y >= BIG) { if (cut > BIG / 2) return; cutTo = topY + roofH + 1; cutEnd = BIG; }
    else { if (cut > BIG / 2) cut = topY + roofH + 1; cutTo = y; cutEnd = y; }
    ghost.visible = true; dirty = true;
  }
  function openFloor(i, fly_ = true) {
    if (walk) exitWalk(false);
    openIdx = i; selUnit = null; selRoom = null; selGroup.clear(); hoverGroup.clear();
    showInner([i]); setCut(i * data.floorH + Hw + .02); focusY = i * data.floorH; shadowBox(Math.max(plate.w, plate.d) * .75 + 4);
    root.classList.add('floor-open'); [...ui.floors.querySelectorAll('button')].forEach(b => b.classList.toggle('on', +b.dataset.floor === i)); allBtn.classList.remove('on');
    showAvail(ui.avail && ui.avail.checked);
    if (fly_) { const [p, t] = floorView(i); if (fly_ === 'arc') flyArc(p, t, 2.6, 40); else flyTo(p, t, 1.2, 40); }
    hint(data.single ? 'Tap a room to see it, then stand inside.' : 'Tap a flat to see the details.');
    showCard(data.single ? houseCard() : floorCard(i));
  }
  function closeFloors(flyBack = true) {
    if (walk) exitWalk(false);
    openIdx = -1; selUnit = null; selRoom = null; selGroup.clear(); hoverGroup.clear(); setCut(BIG); focusY = topY * .35; shadowBox(Rfull);
    root.classList.remove('floor-open'); [...ui.floors.querySelectorAll('button')].forEach(b => b.classList.remove('on')); allBtn.classList.add('on');
    showAvail(ui.avail && ui.avail.checked);
    if (flyBack) { const [p, t] = overviewPos(); flyTo(p, t, 1.2, 40); hint(data.single ? 'Tap the house to see inside.' : 'Tap a floor to see inside it.'); }
    showCard(data.single ? houseCard() : buildingCard());
  }

  // ---------- cards ----------
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cardToggle = ui.card.querySelector('.cardtoggle'); cardToggle?.addEventListener('click', () => ui.card.classList.toggle('min'));
  function showCard(html) { ui.card.innerHTML = html; if (cardToggle) ui.card.prepend(cardToggle); ui.card.classList.remove('min'); ui.card.classList.add('show'); wireCard(); }
  const gbp = n => '£' + n.toLocaleString('en-GB'), num = u => +u.price.replace(/[^0-9]/g, '');
  function buildingCard() {
    const all = Object.values(data.units), av = all.filter(u => u.status === 'Available'), prices = av.map(num).sort((a, b) => a - b);
    return `<p class="eyebrow">${esc(data.place)}</p><h2>${esc(data.name)}</h2><p>${esc(data.blurb)}</p>
      <dl class="facts"><div><dt>Homes</dt><dd>${all.length}</dd></div><div><dt>Available</dt><dd>${av.length}</dd></div><div><dt>From</dt><dd>${prices.length ? gbp(prices[0]) : '—'}</dd></div></dl>
      <p class="small">Pick a floor, or tap the building, to see inside.</p><div class="row"><button class="btn" data-act="book">Book a viewing</button></div>`;
  }
  function floorCard(i) {
    const fl = data.floors[i], st = status[i];
    if (!st) return `<p class="eyebrow">${esc(data.name)}</p><h2>${esc(fl.label)}</h2><p>Residents’ entrance, concierge, lounge and lifts.</p><div class="row"><button class="btn ghost" data-act="all">Whole building</button></div>`;
    const ids = Object.values(data.units).filter(u => u.floor === i);
    return `<p class="eyebrow">${esc(data.name)}</p><h2>${esc(fl.label)}</h2><p>${st.Available} of ${ids.length} homes available on this floor.</p>
      <ul class="units">${ids.map(u => `<li><button data-unit="${esc(u.id)}"><span>${esc(u.id)}</span><span>${u.beds} bed · ${u.area} m²</span><span class="st st-${u.status}">${u.status === 'Available' ? esc(u.price) : u.status}</span></button></li>`).join('')}</ul>`;
  }
  function unitCard(u) {
    const rs = data.floors[u.floor].rooms.filter(q => q.unit === u.id);
    return `<p class="eyebrow">${esc(data.name)} · ${esc(data.floors[u.floor].label)}</p><h2>${esc(u.name)}</h2>
      <p class="price">${u.status === 'Sold' ? 'Sold' : esc(u.price)} <span class="st st-${u.status}">${u.status}</span></p>
      <p>${u.beds} bedroom${u.beds > 1 ? 's' : ''} · ${u.baths} bathroom${u.baths > 1 ? 's' : ''} · ${u.area} m² (${Math.round(u.area * 10.764)} sq ft)</p><p class="small">${esc(u.aspect)}</p>
      <ul class="feat">${u.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
      <details><summary>Room sizes</summary><ul class="rooms">${rs.filter(q => q.type !== 'utility' || q.w * q.d > 3).map(q => `<li><span>${esc(q.name)}</span><span>${q.w.toFixed(1)} × ${q.d.toFixed(1)} m</span></li>`).join('')}</ul></details>
      <div class="row"><button class="btn" data-act="walk">Step inside</button><button class="btn ghost" data-act="book">Book a viewing</button></div><button class="link" data-act="floor">Back to ${esc(data.floors[u.floor].label)}</button>`;
  }
  function houseCard() {
    const u = data.units.house;
    return `<p class="eyebrow">${esc(data.place)}</p><h2>${esc(data.name)}</h2><p class="price">${esc(u.price)} <span class="st st-${u.status}">For sale</span></p>
      <p>${u.beds} bedrooms · ${u.baths} bathrooms · ${u.area} m² (${Math.round(u.area * 10.764)} sq ft)</p><p class="small">${esc(u.aspect)}</p>
      <ul class="feat">${u.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul><div class="row"><button class="btn" data-act="walk">Walk inside</button><button class="btn ghost" data-act="book">Book a viewing</button></div>`;
  }
  function roomCard(q, fi) {
    const note = data.notes && data.notes[q.id];
    return `<p class="eyebrow">${esc(data.name)} · ${esc(data.floors[fi].label)}</p><h2>${esc(q.name)}</h2><p>${q.w.toFixed(1)} m × ${q.d.toFixed(1)} m (${ft(q.w)} × ${ft(q.d)})</p>${note ? `<p class="small">${esc(note)}</p>` : ''}
      <div class="row"><button class="btn" data-act="stand">Stand in this room</button><button class="btn ghost" data-act="book">Book a viewing</button></div><button class="link" data-act="house">Back to the house</button>`;
  }
  const mainRoom = (fi, unit) => data.floors[fi].rooms.find(r => r.unit === unit && r.type === 'open') || data.floors[fi].rooms.find(r => r.unit === unit && r.type === 'hall') || data.floors[fi].rooms.find(r => r.unit === unit);
  function wireCard() {
    ui.card.querySelectorAll('[data-unit]').forEach(b => b.addEventListener('click', () => { selectUnit(data.units[b.dataset.unit]); poke(); }));
    ui.card.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.act;
      if (a === 'book') openModal(); if (a === 'all') closeFloors();
      if (a === 'floor' && selUnit) openFloor(selUnit.floor, true);
      if (a === 'walk') { if (data.single) enterWalk(0, data.floors[0].rooms.find(r => r.id === 'kitchen') || mainRoom(0, 'house')); else if (selUnit) enterWalk(selUnit.floor, mainRoom(selUnit.floor, selUnit.id)); }
      if (a === 'stand' && selRoom) enterWalk(selRoom.floor, selRoom.q);
      if (a === 'house') { selUnit = null; selRoom = null; selGroup.clear(); showCard(houseCard()); }
      poke();
    }));
  }
  function selectUnit(u) {
    if (walk) exitWalk(false);
    if (openIdx !== u.floor) openFloor(u.floor, false);
    selUnit = u; selRoom = null;
    const rs = data.floors[u.floor].rooms.filter(q => q.unit === u.id); paint(selGroup, selMat, u.floor, rs); showCard(unitCard(u));
    const x0 = Math.min(...rs.map(q => q.x)), x1 = Math.max(...rs.map(q => q.x + q.w)), z0 = Math.min(...rs.map(q => q.z)), z1 = Math.max(...rs.map(q => q.z + q.d));
    const c = new THREE.Vector3((x0 + x1) / 2, u.floor * data.floorH, (z0 + z1) / 2), out = c.z > plate.cz ? 1 : -1;
    flyTo(new THREE.Vector3(c.x + 4, c.y + 15, c.z + out * 11), c, 1, 40); hint(touch ? 'Tap the flat again to step inside.' : 'Click the flat again to step inside.');
  }
  function selectRoom(q, fi) { if (openIdx !== fi) openFloor(fi, false); selRoom = { q, floor: fi }; selUnit = null; paint(selGroup, selMat, fi, [q]); showCard(roomCard(q, fi)); }

  // ---------- walking inside ----------
  let walk = null; const look = { yaw: 0, pitch: 0 }, keys = {};
  const walkFov = () => camera.aspect >= 1.25 ? 80 : Math.min(102, 2 * Math.atan(Math.tan(.75) / Math.max(camera.aspect, .4)) * 180 / Math.PI);
  const faceWindow = q => { const e = q.ext || {}; return e.s ? 0 : e.n ? Math.PI : e.e ? Math.PI / 2 : e.w ? -Math.PI / 2 : 0; };
  const joy = { x: 0, y: 0 }, pad = document.createElement('div'); pad.className = 'joy'; pad.innerHTML = '<i></i>'; pad.setAttribute('aria-label', 'Walk'); root.append(pad);
  { let id = null; const knob = pad.firstChild, set = ev => { const r = pad.getBoundingClientRect(), R = r.width / 2; let x = (ev.clientX - r.left - R) / R, y = (ev.clientY - r.top - R) / R; const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; } joy.x = x; joy.y = y; knob.style.transform = `translate(${x * R * .55}px, ${y * R * .55}px)`; };
    pad.addEventListener('pointerdown', ev => { id = ev.pointerId; pad.setPointerCapture(id); set(ev); ev.preventDefault(); });
    pad.addEventListener('pointermove', ev => { if (ev.pointerId === id) set(ev); });
    const end = ev => { if (ev.pointerId !== id) return; id = null; joy.x = joy.y = 0; knob.style.transform = ''; }; pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end); }
  // ambient occlusion for the rooms: loaded the first time someone steps inside
  let ao = null, aoOff = false, aoLoading = false;
  async function loadAO() {
    if (ao || aoOff || aoLoading) return; aoLoading = true;
    try {
      const [{ EffectComposer }, { RenderPass }, { GTAOPass }, { OutputPass }] = await Promise.all([import('./lib/pp/EffectComposer.js'), import('./lib/pp/RenderPass.js'), import('./lib/pp/GTAOPass.js'), import('./lib/pp/OutputPass.js')]);
      const r = root.getBoundingClientRect(), pr = Math.min(renderer.getPixelRatio(), touch ? 1.25 : 1.5), w = Math.round(r.width * pr), h = Math.round(r.height * pr);
      const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(w, h, { samples: touch ? 2 : 4, type: THREE.HalfFloatType }));
      composer.setPixelRatio(1); composer.setSize(w, h); composer.addPass(new RenderPass(scene, camera));
      const g = new GTAOPass(scene, camera, w, h); g.blendIntensity = 1; g.updateGtaoMaterial({ radius: .55, distanceExponent: 1.4, thickness: 1.2, scale: 1.15, samples: touch ? 8 : 14, screenSpaceRadius: false }); g.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      composer.addPass(g); composer.addPass(new OutputPass()); ao = { composer, slow: 0, pr }; dirty = true;
    } catch (e) { console.warn('ambient occlusion unavailable', e); aoOff = true; }
    aoLoading = false;
  }
  const EYE = 1.52, okRoom = r => (data.single || (walk && r.unit === walk.unit)) && r.type !== 'core' && r.type !== 'void' && !COMMUNAL.has(r.type);
  const gaps = fi => plans[fi].filter(g => g.A && g.B && okRoom(g.A) && okRoom(g.B) && ['door', 'slider', 'bifold', 'none'].includes(g.kind) && (g.kind !== 'door' || g.b - g.a >= 1.3)).map(g => g.kind === 'door' ? { g, a: g.dc - g.dw / 2 + .09, b: g.dc + g.dw / 2 - .09, c: g.dc } : { g, a: g.a + .3, b: g.b - .3, c: (g.a + g.b) / 2 }).filter(o => o.b > o.a);
  const hitsSolid = (r, x, z, pad = .12, all) => ((all ? r.all : r.solids) || []).some(b => x > b[0] - pad && x < b[1] + pad && z > b[2] - pad && z < b[3] + pad);
  // the room you would be standing in at (x, z), or null if that is inside a wall or a piece of furniture
  function standAt(x, z, fi, pad = .12) {
    const m = .28;
    for (const r of data.floors[fi].rooms) { if (!okRoom(r)) continue; if (x > r.x + m && x < r.x + r.w - m && z > r.z + m && z < r.z + r.d - m) return hitsSolid(r, x, z, pad) ? null : r; }
    for (const o of gaps(fi)) { const al = o.g.axis === 'x' ? z : x, ac = o.g.axis === 'x' ? x : z; if (al > o.a && al < o.b && Math.abs(ac - o.g.L) <= m + .02) return ac < o.g.L ? o.g.A : o.g.B; }
    return null;
  }
  // a good place to stand in a room: clear of furniture and walls, back from the window so you see the room
  function standPoint(q, fi) {
    if (q.stand) return q.stand; ensureInner(fi);
    const yaw = faceWindow(q), fx = Math.sin(yaw), fz = Math.cos(yaw); let best = null, bs = -1e9;
    for (let x = q.x + .35; x <= q.x + q.w - .35 + 1e-6; x += .2) for (let z = q.z + .35; z <= q.z + q.d - .35 + 1e-6; z += .2) {
      if (hitsSolid(q, x, z, .25, true)) continue;
      let clear = Math.min(x - q.x, q.x + q.w - x, z - q.z, q.z + q.d - z, 1.2);
      (q.all || []).forEach(b => { clear = Math.min(clear, Math.hypot(Math.max(b[0] - x, 0, x - b[1]), Math.max(b[2] - z, 0, z - b[3])) + .1); });
      const back = -((x - q.x - q.w / 2) * fx + (z - q.z - q.d / 2) * fz) / Math.max(q.w, q.d);     // 0.5 = right at the back
      const sc = Math.min(clear, 1.1) * 1.7 + back * .6; if (sc > bs) { bs = sc; best = [x, z]; }
    }
    best ||= [q.x + q.w / 2, q.z + q.d / 2];
    return (q.stand = new THREE.Vector3(best[0], fi * data.floorH + EYE, best[1]));
  }
  // the doors to walk through to get from one room to another on the same floor
  function route(fi, from, to) {
    if (from === to) return []; const G = gaps(fi), prev = new Map([[from, null]]), todo = [from];
    while (todo.length) { const r = todo.shift(); if (r === to) break; G.forEach(o => { const n = o.g.A === r ? o.g.B : o.g.B === r ? o.g.A : null; if (n && !prev.has(n)) { prev.set(n, [r, o]); todo.push(n); } }); }
    if (!prev.has(to)) return null; const out = []; for (let r = to; prev.get(r); r = prev.get(r)[0]) out.unshift(prev.get(r));
    const y = fi * data.floorH + EYE, pts = [];
    out.forEach(([r, o]) => { const side = o.g.A === r ? -1 : 1, at = k => o.g.axis === 'x' ? new THREE.Vector3(o.g.L + side * k, y, o.c) : new THREE.Vector3(o.c, y, o.g.L + side * k); pts.push(at(.55), at(-.55)); });
    return pts;
  }
  const angTo = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
  function enterWalk(fi, q, arrive) {
    if (!q) return;
    walk = { floor: fi, unit: q.unit, room: q, pos: null, to: null, path: null, turn: null }; loadAO();
    openIdx = fi; showInner(data.single ? data.floors.map((f, i) => i) : [fi]); cut = cutTo = cutEnd = BIG; clip.constant = BIG; clipUp.constant = -BIG; ghost.visible = false; scan.visible = false;
    if (OUTSIDE.has(q.type)) { const r = data.floors[fi].rooms.find(r => r.unit === q.unit && (r.type === 'open' || r.type === 'living')); if (r) { q = r; walk.room = r; } }
    walk.pos = standPoint(q, fi).clone();
    let inYaw = null, wc = null, f = null;
    if (arrive) {          // come to rest just inside the glass, facing into the room
      const yaw = faceWindow(q); f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)); const side = new THREE.Vector3(f.z, 0, -f.x), half = Math.abs(f.x) > .5 ? q.w / 2 : q.d / 2;
      wc = new THREE.Vector3(q.x + q.w / 2, fi * data.floorH + EYE, q.z + q.d / 2).addScaledVector(f, half); inYaw = yaw + Math.PI;
      search: for (const d of [1.3, 1.7, 2.1, .9]) for (const l of [0, .6, -.6, 1.2, -1.2, 1.8, -1.8]) { const c = wc.clone().addScaledVector(f, -d).addScaledVector(side, l); if (standAt(c.x, c.z, fi, .3) === q) { walk.pos = c; break search; } }
    }
    focusY = fi * data.floorH; shadowBox(Math.max(plate.w, plate.d) * .75 + 4);
    showAvail(false); if (ui.avail) ui.avail.checked = false; selGroup.clear(); hoverGroup.clear();
    controls.enabled = false; root.classList.add('walking'); reframe();
    look.yaw = arrive ? inYaw : faceWindow(q); look.pitch = -.05; fly = null;
    if (arrive) {
      const out = wc.clone().addScaledVector(f, 10); out.y += 1.4; const near = wc.clone().addScaledVector(f, 2.2); near.y += .15; const inside = walk.pos.clone().addScaledVector(f, -5); inside.y -= .25;
      flyArc(out, wc, 4.4, walkFov(), null, [near, walk.pos.clone()], [wc.clone().addScaledVector(f, -2), inside]);
    } else flyTo(walk.pos, walk.pos.clone().add(new THREE.Vector3(Math.sin(look.yaw), 0, Math.cos(look.yaw))), 1.3, walkFov());
    setRoomLights(fi, q.unit); drawPlan(); ui.walk.querySelector('[data-where]').textContent = q.name;
    hint(touch ? 'Use the pad to walk. Drag to look around.' : 'Drag to look around. Click the floor or the plan to walk there, or use W A S D.');
    ui.card.classList.remove('show');
    { let td = ui.walk.querySelector('.tod'); if (!td) { td = document.createElement('div'); td.className = 'wf tod'; const row = ui.walk.querySelector('.row'); row.parentNode.insertBefore(td, row); [['Morning', 8], ['Day', 13], ['Sunset', 19.2], ['Night', 21.5]].forEach(([t, h]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.addEventListener('click', () => { if (ui.slider) ui.slider.value = h; setTime(h); td.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); poke(); }); td.append(b); }); } }
    if (!data.single) { const fs = data.floors.map((f, i) => f.rooms.some(r => okRoom(r) && r.type === 'hall') ? i : -1).filter(i => i >= 0); let wf = ui.walk.querySelector('.wf:not(.tod)'); if (!wf) { wf = document.createElement('div'); wf.className = 'wf'; const row = ui.walk.querySelector('.row'); row.parentNode.insertBefore(wf, row); } wf.innerHTML = '';
      if (fs.length > 1) fs.forEach(i => { const b = document.createElement('button'); b.type = 'button'; b.dataset.wfloor = i; b.textContent = data.floors[i].label; b.classList.toggle('on', i === walk.floor); b.addEventListener('click', () => { if (i !== walk.floor) moveTo(data.floors[i].rooms.find(r => okRoom(r) && r.type === 'hall'), i); poke(); }); wf.append(b); }); }
  }
  function exitWalk(back = true) {
    if (!walk) return;
    const fi = walk.floor, u = walk.unit; walk = null; openIdx = -1; controls.enabled = true; root.classList.remove('walking'); roomLights.forEach(l => { l.visible = false; }); reframe();
    if (back) { if (!data.single && u && data.units[u]) selectUnit(data.units[u]); else openFloor(fi, true); }
  }
  function setRoomLights(fi, unit) {
    const rs = data.floors[fi].rooms.filter(q => (data.single || q.unit === unit) && !OUTSIDE.has(q.type) && q.type !== 'core' && q.w * q.d > 2.5).slice(0, roomLights.length);
    roomLights.forEach((l, i) => { const q = rs[i]; l.visible = !!q; if (!q) return; l.position.set(q.x + q.w / 2, fi * data.floorH + data.floorH - .75, q.z + q.d / 2); l.userData.base = Math.min(6, q.w * q.d * .35); l.distance = Math.max(q.w, q.d) * 1.4; l.intensity = l.userData.base * (.35 + 2.2 * night); });
  }
  function moveTo(q, fi, point) {
    if (!walk) return; if (fly) { camera.position.copy(fly.p1); fly = null; }
    const here = camera.position.clone(), cur = standAt(here.x, here.z, walk.floor, -1) || walk.room; let pts = [];
    if (fi !== walk.floor) {          // up or down the stairs: through the hall on each floor
      const h0 = data.floors[walk.floor].rooms.find(r => r.type === 'hall') || cur, h1 = data.floors[fi].rooms.find(r => r.type === 'hall') || q;
      pts = [...(route(walk.floor, cur, h0) || []), standPoint(h0, walk.floor).clone()]; walk.floor = fi; setRoomLights(fi, walk.unit); focusY = fi * data.floorH; setTime(hour);
      pts.push(standPoint(h1, fi).clone(), ...(route(fi, h1, q) || []));
    } else pts = route(fi, cur, q) || [];
    const y = fi * data.floorH + EYE, end = point && standAt(point.x, point.z, fi) === q ? new THREE.Vector3(point.x, y, point.z) : standPoint(q, fi).clone();
    pts.push(end); walk.room = q; walk.path = pts; walk.to = end; walk.turn = null;
    ui.walk.querySelector('[data-where]').textContent = q.name; drawPlan(); dirty = true;
  }
  function drawPlan() {
    const c = ui.plan, g = c.getContext('2d'); if (!walk) return;
    const rs = data.floors[walk.floor].rooms.filter(q => data.single || q.unit === walk.unit);
    const x0 = Math.min(...rs.map(q => q.x)), x1 = Math.max(...rs.map(q => q.x + q.w)), z0 = Math.min(...rs.map(q => q.z)), z1 = Math.max(...rs.map(q => q.z + q.d));
    const W = c.width = c.clientWidth * devicePixelRatio, H = c.height = c.clientHeight * devicePixelRatio, s = Math.min((W - 16) / (x1 - x0), (H - 16) / (z1 - z0)), ox = (W - s * (x1 - x0)) / 2, oz = (H - s * (z1 - z0)) / 2;
    c._map = { s, ox, oz, x0, z0, rs }; g.clearRect(0, 0, W, H);
    rs.forEach(q => { g.fillStyle = walk.room === q ? 'rgba(200,145,58,.55)' : OUTSIDE.has(q.type) ? 'rgba(237,232,223,.08)' : 'rgba(237,232,223,.16)'; g.strokeStyle = 'rgba(237,232,223,.7)'; g.lineWidth = devicePixelRatio; const X = ox + (q.x - x0) * s, Z = oz + (q.z - z0) * s; g.fillRect(X, Z, q.w * s, q.d * s); g.strokeRect(X, Z, q.w * s, q.d * s); });
    const p = camera.position, px = ox + (p.x - x0) * s, pz = oz + (p.z - z0) * s;
    g.fillStyle = '#ede8df'; g.beginPath(); g.arc(px, pz, 4 * devicePixelRatio, 0, 7); g.fill(); g.strokeStyle = '#ede8df'; g.beginPath(); g.moveTo(px, pz); g.lineTo(px + Math.sin(look.yaw) * 1.2 * s, pz + Math.cos(look.yaw) * 1.2 * s); g.stroke();
    ui.walk.querySelectorAll('.wf:not(.tod) [data-wfloor], [data-wfloor]').forEach(b => b.classList.toggle('on', +b.dataset.wfloor === walk.floor));
  }
  ui.plan.addEventListener('click', ev => {
    const c = ui.plan, m = c._map; if (!m || !walk) return;
    const r = c.getBoundingClientRect(), x = m.x0 + ((ev.clientX - r.left) * devicePixelRatio - m.ox) / m.s, z = m.z0 + ((ev.clientY - r.top) * devicePixelRatio - m.oz) / m.s;
    const q = m.rs.find(q => x > q.x && x < q.x + q.w && z > q.z && z < q.z + q.d); if (q && q.w * q.d > 1.5) moveTo(q, walk.floor); poke();
  });
  ui.walk.querySelector('[data-exit]').addEventListener('click', () => { exitWalk(true); poke(); });
  ui.walk.querySelectorAll('[data-wfloor]').forEach(b => b.addEventListener('click', () => { const fi = +b.dataset.wfloor; if (fi !== walk.floor) moveTo(data.floors[fi].rooms.find(r => r.type === 'hall') || data.floors[fi].rooms[0], fi); poke(); }));
  ui.walk.querySelector('[data-book]')?.addEventListener('click', openModal);

  // ---------- pointer ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null, lastMove = 0;
  function pick(ev, list) { const r = canvas.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.intersectObjects(list, false)[0]; }
  canvas.addEventListener('pointerdown', ev => { if (walk) walk.turn = null; down = { x: ev.clientX, y: ev.clientY, t: performance.now(), yaw: look.yaw, pitch: look.pitch }; if (walk) canvas.setPointerCapture(ev.pointerId); closePops(); poke(); });
  canvas.addEventListener('pointermove', ev => {
    if (walk && down) { look.yaw = down.yaw - (ev.clientX - down.x) * .005; look.pitch = clamp(down.pitch - (ev.clientY - down.y) * .004, -1.1, 1.1); dirty = true; drawPlan(); return; }
    if (touch || walk) return; const now = performance.now(); if (now - lastMove < 40) return; lastMove = now; hoverAt(ev);
  });
  canvas.addEventListener('pointerup', ev => { const d = down; down = null; if (!d) return; if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 6 || performance.now() - d.t > 500) return; clickAt(ev); poke(); });
  canvas.addEventListener('pointerleave', () => { hoverGroup.clear(); canvas.style.cursor = ''; tip(); dirty = true; });
  const tipEl = $('[data-tip]');
  function tip(ev, text) { if (!ev || !text) { tipEl.hidden = true; return; } tipEl.hidden = false; tipEl.textContent = text; const r = root.getBoundingClientRect(); tipEl.style.transform = `translate(${ev.clientX - r.left + 14}px, ${ev.clientY - r.top + 14}px)`; }
  function hoverAt(ev) {
    hoverGroup.clear(); let cur = '';
    if (openIdx < 0) { const h = pick(ev, floorPick); if (h) { const i = h.object.userData.floor, fl = data.floors[i]; paint(hoverGroup, hoverMat, i, [{ x: plate.x0 - .3, z: plate.z0 - .3, w: plate.w + .6, d: plate.d + .6 }], true); cur = 'pointer'; tip(ev, data.single ? 'See inside' : fl.label + (status[i] ? ` · ${status[i].Available} available` : '')); } else tip(); }
    else { const h = pick(ev, roomPick[openIdx]); if (h) { const q = h.object.userData.room, rs = data.single ? [q] : data.floors[openIdx].rooms.filter(r => r.unit === q.unit); paint(hoverGroup, hoverMat, openIdx, rs); cur = 'pointer'; tip(ev, data.single ? q.name : `${q.unit} · ${data.units[q.unit].beds} bed · ${data.units[q.unit].status === 'Available' ? data.units[q.unit].price : data.units[q.unit].status}`); } else tip(); }
    canvas.style.cursor = cur; dirty = true;
  }
  function clickAt(ev) {
    if (walk) { const h = pick(ev, roomPick[walk.floor]); if (h) { const q = h.object.userData.room; if (okRoom(q)) moveTo(q, walk.floor, h.point); } return; }
    if (openIdx < 0) { const h = pick(ev, floorPick); if (h) openFloor(data.single ? 0 : h.object.userData.floor); return; }
    const h = pick(ev, roomPick[openIdx]); if (!h) return; const q = h.object.userData.room;
    if (data.single) { if (selRoom && selRoom.q === q) enterWalk(openIdx, q); else selectRoom(q, openIdx); } else if (q.unit) { if (selUnit && selUnit.id === q.unit) enterWalk(openIdx, q); else selectUnit(data.units[q.unit]); }
  }
  addEventListener('keydown', ev => {
    if (ev.target && ev.target.tagName === 'INPUT') return;
    if (ev.key === 'Escape') { if (ui.modal && !ui.modal.hidden) return closeModal(); if (closePops()) return; if (walk) return exitWalk(true); if (openIdx >= 0) return closeFloors(); }
    if (walk) keys[ev.key.toLowerCase()] = true;
  });
  addEventListener('keyup', ev => { keys[ev.key.toLowerCase()] = false; });

  // views
  function view(v) {
    ui.tabs.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.view === v));
    if (v === 'homes') return closeFloors();
    closeFloors(false);
    const k = data.site.kind;
    if (v === 'roof') flyTo(new THREE.Vector3(plate.cx - 10, topY + 9, plate.cz + 24), new THREE.Vector3(plate.cx, topY + .5, plate.cz), 1.3, 45);
    if (v === 'street') flyTo(k === 'suburb' ? new THREE.Vector3(plate.cx - 9, 1.7, plate.z0 - 15) : k === 'canal' ? new THREE.Vector3(plate.cx + plate.w * .62, 1.7, plate.z1 + 7.4) : new THREE.Vector3(plate.cx + plate.w * .7, 1.7, plate.z1 + 30), new THREE.Vector3(plate.cx, Math.min(topY * .45, 16), plate.cz), 1.4, 55);
    if (v === 'sky') flyTo(new THREE.Vector3(plate.cx - 170, topY * 1.5 + 40, plate.cz + 200), new THREE.Vector3(plate.cx, topY * .5, plate.cz), 1.4, 40);
    if (v === 'garden') flyTo(new THREE.Vector3(plate.cx + 7, 1.7, plate.z1 + 19), new THREE.Vector3(plate.cx, 3, plate.cz), 1.4, 55);
  }
  ui.tabs?.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { view(b.dataset.view); poke(); }));

  // ---------- style and ask ----------
  function setStyle(key) { const st = STYLES[key]; if (!st) return; Object.entries(st).forEach(([k, v]) => { if (M[k] && k !== 'label') M[k].color.set(v); }); root.querySelectorAll('[data-style]').forEach(b => b.classList.toggle('on', b.dataset.style === key)); dirty = true; }
  root.querySelectorAll('[data-style]').forEach(b => b.addEventListener('click', () => { setStyle(b.dataset.style); poke(); }));
  const furnBox = $('[data-furnished]'); furnBox?.addEventListener('change', () => { furnished = furnBox.checked; showInner(inner.map((g, i) => g && g.visible ? i : -1).filter(i => i >= 0)); poke(); });
  function closePops(except) { let any = false; root.querySelectorAll('[data-pop]').forEach(p => { if (p.dataset.pop !== except && !p.hidden) { p.hidden = true; any = true; } }); root.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === except)); return any; }
  root.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => { const p = $(`[data-pop="${b.dataset.tool}"]`), open = p.hidden; closePops(open ? b.dataset.tool : null); p.hidden = !open; if (open && b.dataset.tool === 'ask' && !touch) p.querySelector('input').focus(); }));
  const TIMES = [['sunrise', 6.6], ['dawn', 6.4], ['morning', 9], ['midday', 12.5], ['noon', 12.5], ['lunch', 12.5], ['afternoon', 15], ['golden', 18.7], ['sunset', 19.2], ['dusk', 19.7], ['evening', 20.2], ['night', 22], ['lights on', 21.5]];
  const WORDS = [['kitchen', ['kitchen', 'open']], ['living', ['living', 'open']], ['lounge', ['living', 'open']], ['family', ['living']], ['dining', ['dining', 'open']], ['bedroom', ['bed']], ['bathroom', ['bath']], ['study', ['study']], ['office', ['study']], ['balcony', ['balcony']], ['hall', ['hall']], ['upstairs', ['bed']]];
  function ask(text) {
    const t = ' ' + text.toLowerCase().replace(/[?.!,’']/g, ' ').replace(/\s+/g, ' ') + ' ', has = (...w) => w.some(x => t.includes(x)), out = [];
    const all = Object.values(data.units), avail = all.filter(u => u.status === 'Available');
    const tm = TIMES.find(([w]) => t.includes(w)), m = t.match(/ (\d{1,2})(?:[:.](\d\d))? ?(am|pm) /);
    let h = tm ? tm[1] : null; if (m) h = (+m[1] % 12) + (m[3] === 'pm' ? 12 : 0) + (m[2] ? +m[2] / 60 : 0);
    if (h != null) { h = clamp(h, 5, 23); ui.slider.value = h; setTime(h); out.push(`Here it is at ${ui.time.textContent}. ${night > .5 ? 'The lights are on.' : h > 17.5 ? 'The sun is low in the west.' : h < 10 ? 'The sun is in the east.' : 'The sun is high in the south.'}`); }
    const bedM = t.match(/ (\d|one|two|three|four)[ -]?bed/), beds = bedM ? ({ one: 1, two: 2, three: 3, four: 4 }[bedM[1]] || +bedM[1]) : null;
    if (!data.single && (has('cheapest', 'lowest', 'penthouse', 'top floor', 'highest', 'biggest', 'largest') || (beds && !has('how many')))) {
      let pool = avail.filter(u => !beds || u.beds === beds); if (has('penthouse')) pool = pool.filter(u => /Penthouse/.test(u.name));
      const u = has('top floor', 'highest') ? pool.sort((a, b) => b.floor - a.floor || num(a) - num(b))[0] : has('biggest', 'largest') ? pool.sort((a, b) => b.area - a.area)[0] : pool.sort((a, b) => num(a) - num(b))[0];
      if (u) { selectUnit(u); out.push(`${u.name} on ${data.floors[u.floor].label.toLowerCase()}: ${u.beds} bed, ${u.area} m², ${u.price}.`); } else out.push('Nothing like that is available right now.');
    } else if (!data.single && has('available', 'what s left', 'whats left', 'how many')) {
      if (ui.avail) { ui.avail.checked = true; showAvail(true); }
      const by = [1, 2, 3].map(b => [b, avail.filter(u => u.beds === b).length]).filter(x => x[1]);
      out.push(`${avail.length} of ${all.length} homes are available: ${by.map(([b, n]) => `${n} with ${b} bedroom${b > 1 ? 's' : ''}`).join(', ')}. They are shown in amber.`);
    }
    if (has('take me', 'show me the', 'go to', 'walk', 'step inside', 'stand in', 'see the')) {
      if (has('roof') && ui.tabs.querySelector('[data-view="roof"]')) { view('roof'); out.push('This is the roof garden, shared by everyone in the building.'); }
      else if (has('garden') && ui.tabs.querySelector('[data-view="garden"]')) { view('garden'); out.push(data.spec.garden || 'This is the garden.'); }
      else if (has('street', 'outside', 'front', 'canal')) { view('street'); out.push('Here it is from outside.'); }
      else {
        const w = WORDS.find(([k]) => t.includes(k)), mid = [...avail].sort((a, b) => num(a) - num(b))[Math.floor(avail.length / 2)] || all[0];
        const unit = data.single ? 'house' : walk ? walk.unit : selUnit ? selUnit.id : mid.id, fi0 = data.single ? 0 : data.units[unit].floor;
        const tryFloors = data.single ? (has('upstairs', 'bedroom', 'bathroom') ? [1, 0] : [0, 1]) : [fi0];
        let found = null; for (const fi of tryFloors) { const q = data.floors[fi].rooms.find(r => (data.single || r.unit === unit) && (w ? w[1].includes(r.type) && (w[0] !== 'family' || /Family/.test(r.name)) : (r.type === 'open' || r.id === 'kitchen'))); if (q) { found = [fi, q]; break; } }
        if (found) { if (walk && (data.single || walk.unit === unit)) moveTo(found[1], found[0]); else enterWalk(found[0], found[1]); out.push(`You are in the ${found[1].name.toLowerCase()}${data.single ? '' : ' of ' + data.units[unit].name}. ${(data.notes && data.notes[found[1].id]) || 'Drag to look around.'}`); }
        else out.push('I couldn’t find that room here.');
      }
    }
    if (has('made of', 'material', 'built', 'brick', ' walls ', ' roof ') && !has('roof garden', 'take me')) out.push(data.spec.materials);
    if (has('finish', 'flooring', 'worktop', ' spec ')) out.push(data.spec.finishes);
    if (has('nearby', 'near ', 'station', 'school', 'shop', 'train', 'commute', 'location')) out.push(data.spec.nearby);
    if (has('energy', 'epc', 'heating', 'bills', 'solar', 'heat pump')) out.push(data.spec.energy);
    if (has('parking', ' car ', 'garage', ' ev ', 'bike')) out.push(data.spec.parking);
    if (has('garden') && data.spec.garden && !out.length) out.push(data.spec.garden);
    const cur = data.single ? data.units.house : selUnit;
    if (has('how much', 'price', 'cost', 'afford') && !out.length) out.push(cur ? `${cur.name} is ${cur.price}.` : `Prices start at ${gbp(Math.min(...avail.map(num)))}. The most expensive home available is ${gbp(Math.max(...avail.map(num)))}.`);
    if (has('how big', 'size', 'square', 'sq ft', 'sqft') && !out.length) out.push(cur ? `${cur.name} is ${cur.area} m² (${Math.round(cur.area * 10.764)} sq ft) with ${cur.beds} bedrooms.` : `Homes here run from ${Math.min(...all.map(u => u.area))} to ${Math.max(...all.map(u => u.area))} m².`);
    if (has('facing', 'which way', 'sunlight', 'sunny', ' south', ' north') && !out.length) out.push((cur ? cur.aspect + '. ' : 'Homes at the back face south. ') + 'Drag the sun slider to see where the light falls through the day.');
    if (has('book', 'viewing', 'visit', 'appointment')) { openModal(); out.push('Opening the booking form.'); }
    const sk = has('coastal') ? 'coast' : has('dark luxe', 'luxe') ? 'luxe' : has('warm oak') ? 'oak' : null; if (sk) { setStyle(sk); out.push(`Switched the interior to ${STYLES[sk].label}.`); }
    if (!out.length) out.push('Try asking about the time of day, a room, the price, what it’s made of, or what’s nearby.');
    ui.answer.textContent = out.join(' '); poke();
    return out.join(' ');
  }
  const askForm = $('[data-askform]'); askForm?.addEventListener('submit', ev => { ev.preventDefault(); const inp = askForm.querySelector('input'); if (inp.value.trim()) ask(inp.value); inp.select(); });
  const chips = $('[data-chips]'); (data.asks || []).forEach(a => { const b = document.createElement('button'); b.type = 'button'; b.textContent = a; b.addEventListener('click', () => { askForm.querySelector('input').value = a; ask(a); }); chips.appendChild(b); });

  // booking (demo)
  function openModal() { ui.modal.hidden = false; ui.modal.querySelector('button, a').focus(); }
  function closeModal() { ui.modal.hidden = true; }
  ui.modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal)); ui.modal.addEventListener('click', ev => { if (ev.target === ui.modal) closeModal(); });
  let hintT = 0; function hint(t) { ui.hint.textContent = t; ui.hint.classList.add('show'); clearTimeout(hintT); hintT = setTimeout(() => ui.hint.classList.remove('show'), 5200); }

  // ---------- loop ----------
  controls.addEventListener('change', () => { dirty = true; }); controls.addEventListener('start', poke);
  // on phones the details sheet covers the lower part of the screen, so the view is shifted up
  // ---------- story mode: the page scrolls, the building assembles ----------
  let st = null;
  const sstep = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
  // The film the scroll plays: empty plot, the building rises, up the front, onto the terrace, through the glass,
  // across the main room and out to the view. This is also the shot plan for the generated film.
  const KP = [0, .1, .22, .4, .52, .62, .7, .78, .84, .9, 1];
  function storyOn() {
    const h = Math.max(topY + roofH, 9), s = Math.max(h, Math.max(plate.w, plate.d) * 1.15), cx = plate.cx, cz = plate.cz, v = (x, y, z) => new THREE.Vector3(x, y, z);
    const F = data.story || {}, fi = F.floor ?? 0, q = data.floors[fi].rooms.find(r => r.id === F.room) || data.floors[fi].rooms.find(r => r.type === 'open' || r.type === 'kitchen' || r.type === 'living');
    ensureInner(fi); const yaw = faceWindow(q), f = v(Math.sin(yaw), 0, Math.cos(yaw)), sd = v(f.z, 0, -f.x), alongX = Math.abs(f.z) > .5, len = alongX ? q.w : q.d, dep = alongX ? q.d : q.w, yF = fi * data.floorH, eye = yF + EYE;
    const wc = v(q.x + q.w / 2, eye, q.z + q.d / 2).addScaledVector(f, dep / 2), at = (out, along, up = 0) => wc.clone().addScaledVector(f, out).addScaledVector(sd, along).setY(eye + up), g = Math.max(0, len / 2 - 1.6);
    const A = at(-1.5, g), B = at(-Math.min(dep * .5, 2.6), len > 8 ? -g * .2 : g * .1), C = at(-1.5, -g * .62), W = len > 8 ? at(-Math.min(dep - 1.1, 3.9), len / 2 - 4.4) : A.clone().lerp(B, .5);      // W: round the back of the media wall
    const P = [v(cx + s * .2, h + s * 3.6, cz + s * .9), v(cx + s * 1.2, h * .6 + s * 1.9, cz + s * 2.2), v(cx + s * 1.9, h * .45 + s * .7, cz + s * 1.5), v(cx + s * .9, h * .75 + s * .25, cz + s * 2),
      v(cx, 0, cz).addScaledVector(f, plate.d / 2 + s * .95).addScaledVector(sd, s * .3).setY(yF + 7), at(11, g * .6, 1.7), at(2.6, g, .25), A, W, B, C];
    const T = [v(cx, 0, cz), v(cx, h * .1, cz), v(cx, h * .3, cz), v(cx, h * .5, cz), v(cx, Math.max(2, yF - 3), cz), wc.clone(), at(-3, g * .5, -.1), at(-2.4, -g, -.15), at(-2.6, -g, -.2), at(-dep + .8, -g * .85, -.25), C.clone().addScaledVector(f, 60).setY(eye - 4)];
    // where there is a pool on the roof, the film carries on: up through the height of the room, out onto the terrace, and ends over the water
    const pd = data.floors[nF - 1].rooms.find(r => r.pool); let sc = pd && fi < nF - 1 ? .8 : 1, K = KP.map(k => k * sc), outAt = sc;
    if (q.tall && pd) {
      // in through the glass panning left to the city, across to the piano, turn to take in the room, up the stair,
      // out through the doors, look left, then a long pan right across the pool to the city at night
      sc = .62; P.length = 7; T.length = 7; K = KP.slice(0, 7).map(k => k * sc); const yT = (nF - 1) * data.floorH, Y = yF, [px0, px1, pz0] = pd.pool, x0 = q.x, z1 = q.z + q.d, zb = q.z;
      const add = (k, p, t) => { K.push(k); P.push(v(...p)); T.push(v(...t)); };
      P[6] = v(x0 + 9, eye + .15, z1 + 2.4); T[6] = v(x0 + 4, eye + .2, z1 - 3);
      // one unbroken pan to the left: piano, the city through the corner glass, round across the living room to the stair
      const aim = (p, deg, up = 0, dist = 18) => [p[0] + Math.cos(deg * Math.PI / 180) * dist, p[1] + up, p[2] + Math.sin(deg * Math.PI / 180) * dist];          // 0 = east, 90 = south, 180 = west
      const A0 = [x0 + 9, eye, z1 - 1.6], F0 = [x0 + 1.3, eye, zb + 2.4], on = t => [A0[0] + (F0[0] - A0[0]) * t, eye, A0[2] + (F0[2] - A0[2]) * t];
      add(.50, on(0), [x0 + 2, Y + 1.0, z1 - 2.0]);                 // in through the glass, eyes on the piano
      add(.55, on(.2), aim(on(.2), 150, .2));                       // past it, out over the city to the south-west
      add(.60, on(.42), aim(on(.42), 105, .3));                     // the south glass
      add(.66, on(.68), aim(on(.68), 50, .6));                      // coming round
      add(.72, on(1), aim(on(1), 8, 1.6));                          // across the living room: sofas, fire, chandelier
      add(.76, [x0 + 4.7, Y + 2.6, zb + 1.0], aim([x0 + 4.7, Y + 2.6, zb + 1.0], 2, 1.2));          // on the stair
      add(.81, [x0 + 8.1, yT + 1.55, zb + .75], aim([x0 + 8.1, yT + 1.55, zb + .75], 0, -.1));     // the landing
      const bar = pd.bar ? [(pd.bar[0] + pd.bar[1]) / 2, yT + 1.3, pd.z + .9] : aim([x0 + 13.3, yT + 1.6, zb + .85], -42, 0), hT = 1.25, pz = pd.pool[2], pcx = (px0 + px1) / 2;
      const O1 = [x0 + 13.4, yT + 1.6, zb + .85], O2 = [px0 - .4, yT + 1.65, pd.z + 5.4], S0 = [px0 - 2.9, yT + 1.7, pz - 1.1], S1 = [px0 + .9, yT + hT + 1.62, pz - 1.1], E = [pcx - 1.5, yT + hT + 1.7, pz - .45];
      add(.86, O1, bar);                                            // through the doors as they slide open, looking left at the bar
      add(.895, O2, [bar[0] + 1.5, bar[1], bar[2]]);                // hold on it
      add(.94, [O2[0] - .5, O2[1], O2[2] + .2], [pcx, yT + 1.3, pz + 2.5]);          // stay by the bar and turn right: the pool and the city beyond it
      add(.972, [px0 - 2.8, yT + hT + 2.9, pz - 2.0], [pcx + 1.6, yT + .2, plate.z1 + 2]);          // rise
      add(1, [px0 - 3.6, yT + hT + 4.6, pz - 2.6], [pcx + 2.5, yT - 1.5, plate.z1 + 5]);          // then up and back on a wide lens: half the pool hangs out past the edge of the tower
      outAt = .82;
    } else
    if (sc < 1 && !(q.tall && pd)) { const yT = (nF - 1) * data.floorH, [px0, px1, pz0] = pd.pool, mx = q.x + q.w / 2, mz = q.z + q.d / 2;
      // to the foot of the stair, up it, across the terrace, and out over the pool
      const sz = q.z + .65, s0 = q.x + .7, s1 = q.x + .7 + 18 * .29;
      P.push(v(s0 - .1, eye, sz + 1.5), v(s1 - .4, yT + 1.55, sz + .9), v(pd.x + 1.6, yT + 1.75, pd.z + 2.6), v(px0 - 1.2, yT + 2.7, pz0 + .6));
      T.push(v(s1, yF + 3.4, sz), v(pd.x + 3, yT + 1.5, pd.z + 3), v((px0 + px1) / 2, yT + 1, pz0 + 2), v(px1 - 1, yT + .2, plate.z1 + 3.4)); K.push(.85, .9, .95, 1); }
    const pc = new THREE.CatmullRomCurve3(P, false, 'centripetal'), tc = new THREE.CatmullRomCurve3(T, false, 'centripetal');
    const u = p => { let i = 0; while (i < K.length - 2 && p > K[i + 1]) i++; return (i + clamp((p - K[i]) / (K[i + 1] - K[i]), 0, 1)) / (K.length - 1); };
    st = { p: 0, to: 0, h, hr: -1, fi, q, inside: false, sc, outAt, pos: { getPoint: p => pc.getPoint(u(p)) }, tgt: { getPoint: p => tc.getPoint(u(p)) } };
    fly = null; controls.enabled = false; root.classList.add('story'); camera.fov = 40; reframe(); storyAt(0);
  }
  const storyFov = (p0, sc = (st || stHold || { sc: 1 }).sc, oa = (st || stHold || {}).outAt ?? sc) => { const p = Math.min(1, p0 / sc), f = camera.aspect < 1 ? 58 : 40, ext = f + 14 * (1 - sstep(0, .4, p)), inn = ext + (walkFov() * .88 - ext) * sstep(.64, .8, p); return inn + (f + 14 - inn) * sstep(oa + .02, oa + .1, p0) + (sc < .7 ? 16 * sstep(.975, 1, p0) : 0); };
  function storyAt(p) {
    camera.position.copy(st.pos.getPoint(p)); controls.target.copy(st.tgt.getPoint(p)); camera.lookAt(controls.target);
    const fov = storyFov(p); if (Math.abs(fov - camera.fov) > .05) { camera.fov = fov; camera.updateProjectionMatrix(); }
    const p0 = p; p = Math.min(1, p / st.sc);
    const b = sstep(.1, .42, p);
    if (b >= 1) { cut = cutTo = cutEnd = BIG; clip.constant = BIG; clipUp.constant = -BIG; ghost.visible = false; scan.visible = false; }
    else { cut = cutTo = cutEnd = .15 + (st.h + .6) * b; clip.constant = cut; clipUp.constant = -cut; ghost.visible = p > .04; scan.visible = b > 0; scan.position.y = cut; scan.material.opacity = .9; }
    if (p > .44 && !st.inside) { st.inside = true; showInner(data.single ? data.floors.map((x, i) => i) : [st.fi]); const sv = walk; walk = { unit: st.q.unit }; setRoomLights(st.fi, st.q.unit); walk = sv; }
    const HK = data.story && data.story.hours; let hr;
    if (HK) { let i = 0; while (i < HK.length - 2 && p0 > HK[i + 1][0]) i++; const a = HK[i], b = HK[i + 1]; hr = Math.round((a[1] + (b[1] - a[1]) * sstep(a[0], b[0], p0)) * 8) / 8 % 24; }      // a full day and night go by over the film
    else hr = Math.round((data.startHour + (18.5 - data.startHour) * sstep(.36, .66, p) + 2.1 * sstep(Math.max(st.sc + .06, st.outAt - .12), 1, p0) * (st.sc < 1 ? 1 : 0)) * 8) / 8; if (st.lock != null && p0 < .96) st.lock = null; const hrU = st.lock != null ? st.lock : hr; if (hrU !== st.hr) { const hr = hrU; st.hr = hr; if (ui.slider) ui.slider.value = hr; setTime(hr); }
    dirty = true;
  }
  // the page asks what is under the pointer; a floor that isn't built yet can't be picked
  function storyPoint(x, y) {
    ndc.set(x * 2 - 1, 1 - y * 2); ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(floorPick, false).find(h => h.point.y < cut + .05); hoverGroup.clear(); dirty = true; if (!h) return null;
    const i = data.single ? 0 : h.object.userData.floor, fl = data.floors[i], out = { floor: i, label: fl.label, tag: fl.tag || '', single: !!data.single, avail: status[i] ? status[i].Available : 0 };
    const us = fl.rooms.filter(q => q.unit && !OUTSIDE.has(q.type)), px = h.point.x, pz = h.point.z; let best = null, bd = 1e9;
    us.forEach(q => { const d = Math.hypot(Math.max(q.x - px, 0, px - q.x - q.w), Math.max(q.z - pz, 0, pz - q.z - q.d)); if (d < bd) { bd = d; best = q; } });
    if (best && !data.single) {
      const rs = us.filter(q => q.unit === best.unit), x0 = Math.min(...rs.map(q => q.x)), x1 = Math.max(...rs.map(q => q.x + q.w)), z0 = Math.min(...rs.map(q => q.z)), z1 = Math.max(...rs.map(q => q.z + q.d)), u = data.units[best.unit];
      paint(hoverGroup, storyMat, i, [{ x: x0 - .6, z: z0 - .6, w: x1 - x0 + 1.2, d: z1 - z0 + 1.2 }], true);
      Object.assign(out, { unit: u.id, name: u.name, beds: u.beds, area: u.area, price: u.price, status: u.status });
    } else paint(hoverGroup, storyMat, i, [{ x: plate.x0 - .5, z: plate.z0 - .5, w: plate.w + 1, d: plate.d + 1 }], true);
    return out;
  }
  // the page hands the scene over: fly from wherever the scroll left the camera to the balcony, then walk in
  let stHold = null;
  function storyEnter(m) {
    if (!st) return; stHold = st; st = null; hoverGroup.clear(); root.classList.remove('story'); root.classList.add('taken'); controls.enabled = true;
    cut = cutTo = cutEnd = BIG; clip.constant = BIG; clipUp.constant = -BIG; ghost.visible = false; scan.visible = false; reframe();
    const u = m.unit && data.units[m.unit];
    if (u) { const fi = u.floor, rs = data.floors[fi].rooms.filter(q => q.unit === u.id), liv = rs.find(q => q.type === 'open' || q.type === 'living') || rs[0]; selUnit = null; enterWalk(fi, liv, true); }
    else openFloor(data.single ? 0 : m.floor, 'arc');
  }
  function storyLeave() {
    if (!stHold) return; const h = stHold; stHold = null; if (walk) exitWalk(false); closeFloors(false); closePops(); ui.card.classList.remove('show');
    root.classList.remove('taken'); root.classList.add('story'); controls.enabled = false; reframe();
    flyArc(h.pos.getPoint(h.p), h.tgt.getPoint(h.p), 2.4, storyFov(h.p, h.sc, h.outAt), () => { st = h; h.hr = -1; storyAt(h.p); });
  }
  const storyMat = new THREE.MeshBasicMaterial({ color: '#f1c56b', transparent: true, opacity: .42, depthWrite: false });
  addEventListener('message', e => {
    if (e.origin !== location.origin || !e.data) return; const m = e.data;
    if (m.rv === 'story') { if (!st) storyOn(); st.to = clamp(+m.p || 0, 0, 1); if (m.jump || reduce) st.p = st.to - 1e-4; }
    if (m.rv === 'point' && st) { const hit = storyPoint(m.x, m.y); parent.postMessage({ rv: 'pointed', n: m.n, click: !!m.click, hit }, location.origin); if (hit && m.click) setTimeout(() => ensureInner(hit.floor), 30); }      // get the rooms ready while the card is up, so the flight starts at once
    if (m.rv === 'time' && st) { st.lock = +m.h; storyAt(st.p); }
    if (m.rv === 'enter') storyEnter(m);
    if (m.rv === 'leave') storyLeave();
    if (m.rv === 'floor' && st) { hoverGroup.clear(); if (m.i >= 0 && m.i * data.floorH < cut) paint(hoverGroup, storyMat, m.i, [{ x: plate.x0 - .5, z: plate.z0 - .5, w: plate.w + 1, d: plate.d + 1 }], true); dirty = true; }
  });
  let offK = 0, offT = 0; const bootAt = performance.now();
  function applyOff(r = root.getBoundingClientRect()) { if (offK > .002) camera.setViewOffset(r.width, r.height * (1 + .3 * offK), 0, r.height * .3 * offK, r.width, r.height); else camera.clearViewOffset(); camera.updateProjectionMatrix(); dirty = true; }
  function reframe(r = root.getBoundingClientRect()) { offT = r.width < 760 && !walk && !root.classList.contains('story') ? 1 : 0; if (performance.now() - bootAt < 2500 || reduce) offK = offT; applyOff(r); }
  function resize() { const r = root.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; if (ao) ao.composer.setSize(Math.round(r.width * ao.pr), Math.round(r.height * ao.pr)); if (walk && !fly) camera.fov = walkFov(); reframe(r); if (walk) drawPlan(); }
  new ResizeObserver(resize).observe(root); resize();
  shadowBox(Rfull);
  const fwd = new THREE.Vector3(), cdir = new THREE.Vector3();
  function tick(now, sim) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (document.hidden && !sim) return requestAnimationFrame(tick);
    // the X-ray sweep
    if (cut < BIG / 2) {
      const d = cutTo - cut;
      if (Math.abs(d) > .02) { cut += d * Math.min(1, dt * (reduce ? 60 : 4.2)) + Math.sign(d) * dt * 2; if ((cutTo - cut) * d < 0) cut = cutTo; dirty = true; }
      else { cut = cutTo; if (cutEnd >= BIG) { cut = BIG; ghost.visible = false; dirty = true; } }
      clip.constant = cut; clipUp.constant = -cut;
      const moving = cut < BIG / 2 && Math.abs(cutTo - cut) > .05; scanA += ((moving ? 1 : 0) - scanA) * Math.min(1, dt * 5); scan.visible = cut < BIG / 2 && scanA > .02; scan.position.y = Math.min(cut, topY + roofH); scan.material.opacity = scanA * .9; if (scan.visible) dirty = true;
    }
    doorsTick(dt);
    if (Math.abs(offT - offK) > .002) { offK += (offT - offK) * Math.min(1, dt * 3); if (Math.abs(offT - offK) <= .002) offK = offT; applyOff(); }
    if (st) { const d = st.to - st.p; if (Math.abs(d) > 2e-5) { st.p = Math.abs(d) < 4e-4 ? st.to : st.p + d * Math.min(1, dt * 5.5); storyAt(st.p); } }
    else if (fly) {
      const t = clamp((now - fly.s) / fly.d, 0, 1), k = ease(t);
      if (fly.curve) { camera.position.copy(fly.curve.getPoint(k)); controls.target.copy(fly.tcurve.getPoint(k)); } else { camera.position.lerpVectors(fly.p0, fly.p1, k); controls.target.lerpVectors(fly.t0, fly.t1, k); }
      if (fly.f1 !== fly.f0) { camera.fov = fly.f0 + (fly.f1 - fly.f0) * k; camera.updateProjectionMatrix(); }
      camera.lookAt(controls.target); if (t >= 1) { const then = fly.then; fly = null; if (then) then(); } dirty = true;
    } else if (walk) {
      const p = camera.position;
      if (walk.path) {
        let rem = (reduce ? 60 : 2.5) * dt;
        while (rem > 0 && walk.path.length) { const t = walk.path[0], dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z, d = Math.hypot(dx, dy, dz); if (d <= rem) { p.copy(t); rem -= d; walk.path.shift(); } else { p.x += dx / d * rem; p.y += dy / d * rem; p.z += dz / d * rem; rem = 0; if (!down && Math.hypot(dx, dz) > .3) { look.yaw += angTo(Math.atan2(dx, dz), look.yaw) * Math.min(1, dt * 5); look.pitch += (-.05 - look.pitch) * Math.min(1, dt * 3); } } }
        if (!walk.path.length) { walk.path = null; walk.to = null; if ((walk.room.ext || {}) && Object.keys(walk.room.ext || {}).length) walk.turn = faceWindow(walk.room); }
        dirty = true; drawPlan();
      } else if (walk.turn !== null && !down) { const d = angTo(walk.turn, look.yaw); if (Math.abs(d) < .01) walk.turn = null; else { look.yaw += d * Math.min(1, dt * 2.6); dirty = true; drawPlan(); } }
      const sp = 2.2 * dt; fwd.set(Math.sin(look.yaw), 0, Math.cos(look.yaw)); let mx = 0, mz = 0;
      if (keys.w || keys.arrowup) { mx += fwd.x * sp; mz += fwd.z * sp; } if (keys.s || keys.arrowdown) { mx -= fwd.x * sp; mz -= fwd.z * sp; }
      if (keys.a || keys.arrowleft) { mx += fwd.z * sp; mz -= fwd.x * sp; } if (keys.d || keys.arrowright) { mx -= fwd.z * sp; mz += fwd.x * sp; }
      if (joy.x || joy.y) { mx += (-joy.y * fwd.x - joy.x * fwd.z) * sp; mz += (-joy.y * fwd.z + joy.x * fwd.x) * sp; if (walk.path) { walk.path = null; walk.to = null; } }
      if ((mx || mz) && !walk.path) {
        walk.turn = null; const tryGo = (ax, az) => { if (Math.abs(ax) + Math.abs(az) < sp * .25) return false; const r = standAt(p.x + ax, p.z + az, walk.floor); if (!r) return false; p.x += ax; p.z += az; if (r !== walk.room) { walk.room = r; ui.walk.querySelector('[data-where]').textContent = r.name; } return true; };
        let went = tryGo(mx, mz) || tryGo(mx, 0) || tryGo(0, mz);
        if (!went) for (const o of gaps(walk.floor)) {          // pushing at a wall beside a door: ease sideways into the doorway
          const ax = o.g.axis === 'x', al = ax ? p.z : p.x, ac = ax ? p.x : p.z, push = ax ? mx : mz;
          if (Math.abs(ac - o.g.L) > 1.3 || (o.g.L - ac) * push <= 0 || al < o.a - 1.6 || al > o.b + 1.6) continue;
          const step = clamp(clamp(al, o.a + .06, o.b - .06) - al, -sp * 1.2, sp * 1.2);
          if (Math.abs(step) > 1e-4 ? tryGo(ax ? 0 : step, ax ? step : 0) : tryGo(ax ? Math.sign(push) * sp : 0, ax ? 0 : Math.sign(push) * sp)) { went = true; break; }
        }
        if (went) { drawPlan(); dirty = true; }
      }
      camera.lookAt(camera.position.x + Math.sin(look.yaw) * Math.cos(look.pitch), camera.position.y + Math.sin(look.pitch), camera.position.z + Math.cos(look.yaw) * Math.cos(look.pitch));
    } else {
      controls.autoRotate = !reduce && openIdx < 0 && now - idleAt > 7000; controls.autoRotateSpeed = .35;
      if (controls.update() || controls.autoRotate) dirty = true;
    }
    if (sim) { dirty = true; return; }
    if (dirty && walk && ao && !fly) { const t0 = performance.now(); ao.composer.render(); dirty = false; const ms = performance.now() - t0 + dt * 1000; ao.slow = ms > 55 ? ao.slow + 1 : Math.max(0, ao.slow - 1); if (ao.slow > 40) { ao = null; aoOff = true; } }      // soft shading where surfaces meet; dropped if the device can't keep up
    if (dirty) { if (ui.compass) { camera.getWorldDirection(cdir); ui.compass.style.transform = `rotate(${-Math.atan2(cdir.x, -cdir.z)}rad)`; } renderer.render(scene, camera); dirty = false; }
    requestAnimationFrame(tick);
  }
  showCard(data.single ? houseCard() : buildingCard()); allBtn.classList.add('on'); setStyle('oak');
  requestAnimationFrame(t => { last = t; ui.loader && ui.loader.classList.add('done'); if (new URLSearchParams(location.search).has('story')) { storyOn(); parent !== window && parent.postMessage({ rv: 'ready' }, location.origin); } else flyTo(p0, t0, 2.2); hint(data.single ? 'Tap the house to see inside.' : 'Tap a floor to see inside it.'); tick(t); });

  window.__rv = { frame: p => { if (!st) return false; st.to = st.p = p; storyAt(p); autoDoors.forEach(d => { d.open = -1; }); dirty = true; return true; }, openFloor, closeFloors, ask, setStyle, view, rooms: (fi, unit) => data.floors[fi].rooms.filter(q => !unit || q.unit === unit).map(q => [q.id, q.type]), turn: (a, pitch = -.04) => { look.yaw = faceWindow(walk.room) + a; look.pitch = pitch; dirty = true; }, fov: f => { camera.fov = f; camera.updateProjectionMatrix(); dirty = true; }, eye: (p, t, f = 68) => { fly = null; if (walk) walk.to = null; camera.position.set(...p); const d = new THREE.Vector3(t[0] - p[0], t[1] - p[1], t[2] - p[2]).normalize(); look.yaw = Math.atan2(d.x, d.z); look.pitch = Math.asin(d.y); camera.fov = f; camera.updateProjectionMatrix(); dirty = true; }, selectUnit: id => selectUnit(data.units[id]), enterWalk: (fi, id) => enterWalk(fi, data.floors[fi].rooms.find(q => q.id === id)), setTime: h => { ui.slider.value = h; setTime(h); }, look: (yaw, pitch = 0) => { look.yaw = yaw; look.pitch = pitch; dirty = true; }, cam: (p, t) => { fly = null; camera.position.set(...p); controls.target.set(...t); camera.lookAt(controls.target); dirty = true; }, info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries }), story: p => { if (!st) storyOn(); st.to = st.p = p; storyAt(p); }, storyEnter, storyLeave, inside: (fi, id) => { enterWalk(fi, data.floors[fi].rooms.find(q => q.id === id), true); if (fly) { camera.position.copy(fly.p1); fly = null; } camera.fov = walkFov(); camera.updateProjectionMatrix(); dirty = true; }, sim: n => { for (let i = 0; i < n; i++) tick(last + 50, true); }, reach: () => data.floors.flatMap((f, fi) => { const out = []; const units = data.single ? [undefined] : [...new Set(f.rooms.filter(q => q.unit).map(q => q.unit))]; units.forEach(u => { const save = walk; walk = { unit: u }; const rs = f.rooms.filter(okRoom), start = rs.find(q => q.type === 'hall') || rs[0]; if (start) rs.forEach(q => { if (q !== start && route(fi, start, q) === null) out.push([fi, q.id]); }); walk = save; }); return out; }), go: id => moveTo(data.floors[walk.floor].rooms.find(q => q.id === id), walk.floor), walkInfo: () => walk && { room: walk.room.id, pos: camera.position.toArray().map(v => +v.toFixed(2)), moving: !!walk.path }, key: (k, on) => { keys[k] = on; }, audit: () => data.floors.flatMap((f, i) => { ensureInner(i); return f.rooms.filter(q => q.fit > .01).map(q => [i, q.id, q.type, +q.fit.toFixed(2)]); }), settled: () => !fly && !(walk && walk.to) && (cut > BIG / 2 || Math.abs(cutTo - cut) < .03) };
}
