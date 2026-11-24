// Ravenmoor 3D property explorer. One engine, three demo buildings (see buildings.js).
// Everything is generated in code from the floor plans: walls, windows, doors, furniture, the setting
// around the building and the light. No model files are downloaded.
import * as THREE from 'three';
import { OrbitControls } from './lib/OrbitControls.js';
import { mergeGeometries } from './lib/BufferGeometryUtils.js';
import { RoomEnvironment } from './lib/RoomEnvironment.js';

const COMMUNAL = new Set(['corridor', 'lobby']);
const OUTSIDE = new Set(['balcony', 'terrace']);
const LIVE = new Set(['hall', 'open', 'living', 'kitchen', 'dining']);
const ft = m => { const t = m * 3.28084; const f = Math.floor(t); const i = Math.round((t - f) * 12); return i === 12 ? `${f + 1}'0"` : `${f}'${i}"`; };
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------- textures drawn in code ----------
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
const rng = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(42);
function brickTex(base) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#b9b2a6'; g.fillRect(0, 0, w, h);
    const bh = 16, bw = 64;
    for (let row = 0; row < h / bh; row++) for (let col = -1; col < w / bw + 1; col++) {
      const x = col * bw + (row % 2 ? bw / 2 : 0);
      const c = new THREE.Color(base).offsetHSL((rng() - .5) * .02, (rng() - .5) * .08, (rng() - .5) * .09);
      g.fillStyle = '#' + c.getHexString(); g.fillRect(x + 1.5, row * bh + 1.5, bw - 3, bh - 3);
    }
  });
}
function woodTex() {
  return canvasTex(256, 256, (g, w, h) => {
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Color('#b48b63').offsetHSL((rng() - .5) * .02, 0, (rng() - .5) * .08);
      g.fillStyle = '#' + c.getHexString(); g.fillRect(0, i * 32, w, 32);
      g.strokeStyle = 'rgba(60,40,20,.25)'; g.lineWidth = 1;
      for (let k = 0; k < 6; k++) { g.beginPath(); const y = i * 32 + 4 + rng() * 24; g.moveTo(0, y); g.bezierCurveTo(w * .3, y + 3, w * .6, y - 3, w, y + 1); g.stroke(); }
      g.fillStyle = 'rgba(40,25,10,.5)'; g.fillRect(0, i * 32, w, 1.5); g.fillRect(((i * 97) % 5) * 51, i * 32, 1.5, 32);
    }
  });
}
function tileTex(c1, c2, n = 4) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = c2; g.fillRect(0, 0, w, h);
    const s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const c = new THREE.Color(c1).offsetHSL(0, 0, (rng() - .5) * .03);
      g.fillStyle = '#' + c.getHexString(); g.fillRect(i * s + 1, j * s + 1, s - 2, s - 2);
    }
  });
}
function grassTex() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#56743a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const c = new THREE.Color('#5a7a3c').offsetHSL((rng() - .5) * .04, (rng() - .5) * .1, (rng() - .5) * .12);
      g.fillStyle = '#' + c.getHexString(); g.fillRect(rng() * w, rng() * h, 2, 3);
    }
  });
}
function facadeTex(kind) {
  // a grid of windows; returns [colour map, night-lights map]
  const cols = 8, rows = 16;
  const map = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = kind === 'glass' ? '#4c5864' : kind === 'brick' ? '#7d4a38' : '#b9b4ab'; g.fillRect(0, 0, w, h);
    const cw = w / cols, rh = h / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      g.fillStyle = kind === 'glass' ? `rgba(${92 + rng() * 22},${112 + rng() * 22},${132 + rng() * 20},1)` : '#2a3038';
      if (kind === 'glass') g.fillRect(i * cw + .5, j * rh + .5, cw - 1, rh - 1.5);
      else g.fillRect(i * cw + cw * .22, j * rh + rh * .2, cw * .56, rh * .6);
    }
  });
  const em = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const cw = w / cols, rh = h / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if (rng() < .42) {
      const warm = 200 + rng() * 55;
      g.fillStyle = `rgb(${warm},${warm * .78},${warm * .52})`;
      if (kind === 'glass') g.fillRect(i * cw + 1, j * rh + 1, cw - 2, rh - 3);
      else g.fillRect(i * cw + cw * .22, j * rh + rh * .2, cw * .56, rh * .6);
    }
  });
  return [map, em];
}

// box UVs in metres, so textures keep their scale whatever the box size
function boxGeo(w, h, d, uvScale) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (uvScale) {
    const uv = g.attributes.uv, s = 1 / uvScale;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] * s, uv.getY(i) * dims[f][1] * s);
    }
  }
  return g;
}

// collects boxes per material, then merges them into one mesh per material
class Bucket {
  constructor(mats) { this.mats = mats; this.parts = {}; }
  box(mat, w, h, d, x, y, z, ry = 0, rx = 0) {
    if (w <= 0.001 || h <= 0.001 || d <= 0.001) return;
    const m = this.mats[mat]; if (!m) throw new Error('material ' + mat);
    const g = boxGeo(w, h, d, m.userData.uv);
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    (this.parts[mat] ||= []).push(g);
  }
  geo(mat, g) { (this.parts[mat] ||= []).push(g); }
  build(group, { cast = true, receive = true } = {}) {
    for (const [mat, list] of Object.entries(this.parts)) {
      const g = mergeGeometries(list.map(x => x.index ? x.toNonIndexed() : x), false);
      list.forEach(x => x.dispose());
      const mesh = new THREE.Mesh(g, this.mats[mat]);
      const m = this.mats[mat];
      mesh.castShadow = cast && !m.transparent && !m.userData.noShadow;
      mesh.receiveShadow = receive;
      mesh.userData.mat = mat;
      group.add(mesh);
    }
    this.parts = {};
    return group;
  }
}

// ---------- materials ----------
function makeMaterials(style) {
  const S = (color, o = {}) => {
    const { uv, noShadow, ...rest } = o;
    const m = new THREE.MeshStandardMaterial({ color, roughness: .85, metalness: 0, ...rest });
    m.userData.uv = uv; m.userData.noShadow = noShadow; return m;
  };
  const brick = brickTex(style === 'house' ? '#a8664a' : '#8c4a35');
  const wood = woodTex();
  const M = {
    slab: S('#d4d0c8'), slabEdge: S('#e7e3dc', { roughness: .7 }),
    wallInt: S('#efebe4', { roughness: .9 }), core: S('#8e8b85'),
    brick: S('#ffffff', { map: brick, uv: 1.6, roughness: .95 }),
    render: S('#ece6da', { roughness: .95 }), stone: S('#d9d2c3'),
    spandrel: S('#2a2f35', { roughness: .4, metalness: .5 }),
    frame: S('#2b2f33', { roughness: .45, metalness: .6 }),
    frameW: S('#f2f0ea', { roughness: .5 }),
    door: S('#26433a', { roughness: .5 }),
    rail: S('#3a3d40', { roughness: .4, metalness: .7 }),
    wood: S('#ffffff', { map: wood, uv: 2.2, roughness: .6 }),
    tile: S('#ffffff', { map: tileTex('#dcd8d0', '#bdb8ae', 4), uv: 2.4, roughness: .35 }),
    carpet: S('#c4b9a8', { roughness: 1 }), corridor: S('#8f8a82', { roughness: .8 }),
    lobbyFloor: S('#ffffff', { map: tileTex('#e2ddd3', '#cfc9be', 2), uv: 2.4, roughness: .25 }),
    deck: S('#ffffff', { map: wood, uv: 1.4, roughness: .8, color: '#a88c6c' }),
    sofa: S('#5f6650', { roughness: 1 }), fabric: S('#cdbfa8', { roughness: 1 }),
    linen: S('#efebe3', { roughness: 1 }), throw_: S('#b0826a', { roughness: 1 }),
    darkWood: S('#5a4433', { roughness: .6 }), oak: S('#b7936b', { roughness: .6 }),
    white: S('#f3f1ec', { roughness: .4 }), black: S('#202224', { roughness: .4 }),
    worktop: S('#e9e5de', { roughness: .25 }), cabinet: S('#3b4b45', { roughness: .5 }),
    rug: S('#a8927a', { roughness: 1 }), rug2: S('#7d8a8f', { roughness: 1 }),
    plant: S('#4e6b38', { roughness: 1 }), pot: S('#c9bba6', { roughness: .8 }),
    metal: S('#9a9ea2', { roughness: .3, metalness: .8 }), screen: S('#111316', { roughness: .2, metalness: .3 }),
    roof: S('#3f4144', { roughness: .9 }), tileRoof: S('#ffffff', { map: tileTex('#4a4440', '#3a3532', 6), uv: 1.2, roughness: .9 }),
    ground: S('#c9d4b8', { map: grassTex(), uv: 8, roughness: 1 }),
    road: S('#3c3d40', { roughness: .95 }), pave: S('#b2aea5', { roughness: .9 }), gravel: S('#b6ab98', { roughness: 1 }),
    mark: S('#e9e6df', { roughness: .8, noShadow: true }),
    trunk: S('#5b4636'), car1: S('#2e3a46', { roughness: .3, metalness: .6 }), car2: S('#c9c6c0', { roughness: .3, metalness: .6 }),
    car3: S('#7a1f22', { roughness: .3, metalness: .6 }), boat: S('#21443a', { roughness: .5 }), boatTop: S('#8b2f2a', { roughness: .5 }),
    lampHead: S('#222', { emissive: new THREE.Color('#ffcf8a'), emissiveIntensity: 0, noShadow: true }),
  };
  const glass = (o = {}) => new THREE.MeshPhysicalMaterial({
    color: '#6f8798', roughness: .04, metalness: .25, transparent: true, opacity: .42, envMapIntensity: 2.2,
    depthWrite: false, side: THREE.DoubleSide, ...o,
  });
  M.glass = glass(); M.glass.userData.noShadow = true;
  M.glassLit = glass({ emissive: new THREE.Color('#ffb15e'), emissiveIntensity: 0 }); M.glassLit.userData.noShadow = true;
  M.glassRail = glass({ opacity: .22 }); M.glassRail.userData.noShadow = true;
  M.water = new THREE.MeshPhysicalMaterial({ color: '#2d4a55', roughness: .08, metalness: .2, envMapIntensity: 1.2 });
  const [fmapG, femG] = facadeTex('glass'), [fmapB, femB] = facadeTex('brick'), [fmapS, femS] = facadeTex('stone');
  const fac = (map, em) => { const m = S('#d8d8d8', { map, emissiveMap: em, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, roughness: .6 }); return m; };
  M.nbGlass = fac(fmapG, femG); M.nbBrick = fac(fmapB, femB); M.nbStone = fac(fmapS, femS);
  return M;
}

// ---------- walls from the plan ----------
// Finds every boundary between two rooms (or a room and the outside) and decides what it is:
// exterior wall with windows, glazed doors, railing, interior wall with or without a doorway.
function boundaries(rooms) {
  const k = v => Math.round(v * 1000) / 1000;
  const segs = [];
  const roomAt = (x, z) => rooms.find(q => x > q.x && x < q.x + q.w && z > q.z && z < q.z + q.d) || null;
  for (const axis of ['x', 'z']) {
    const lines = new Set();
    rooms.forEach(q => { if (axis === 'x') { lines.add(k(q.x)); lines.add(k(q.x + q.w)); } else { lines.add(k(q.z)); lines.add(k(q.z + q.d)); } });
    for (const L of lines) {
      const touch = rooms.filter(q => axis === 'x' ? (k(q.x) === L || k(q.x + q.w) === L) : (k(q.z) === L || k(q.z + q.d) === L));
      const pts = new Set();
      touch.forEach(q => { if (axis === 'x') { pts.add(k(q.z)); pts.add(k(q.z + q.d)); } else { pts.add(k(q.x)); pts.add(k(q.x + q.w)); } });
      const sorted = [...pts].sort((a, b) => a - b);
      let cur = null;
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i], b = sorted[i + 1], m = (a + b) / 2;
        const A = axis === 'x' ? roomAt(L - .01, m) : roomAt(m, L - .01);
        const B = axis === 'x' ? roomAt(L + .01, m) : roomAt(m, L + .01);
        if (cur && cur.A === A && cur.B === B && Math.abs(cur.b - a) < 1e-3) { cur.b = b; continue; }
        cur = { axis, L, a, b, A, B };
        segs.push(cur);
      }
    }
  }
  return segs.filter(s => s.A !== s.B && (s.A || s.B));
}

function classify(s, style, fi) {
  const { A, B } = s;
  if ((A && A.type === 'core') || (B && B.type === 'core')) return 'none';
  if (A && B && COMMUNAL.has(A.type) && COMMUNAL.has(B.type) && A.type === B.type) return 'none';
  if (!A || !B) {
    const q = A || B;
    if (OUTSIDE.has(q.type)) return 'rail';
    if (q.type === 'lobby') return 'glassWall';
    if (style === 'glass') return 'curtain';
    if (style === 'house' && fi === 0 && q.type === 'hall' && s.axis === 'z' && s.L < 0) return 'frontDoor';
    if (style === 'house' && fi === 0 && (q.type === 'kitchen' || q.type === 'dining') && s.axis === 'z' && s.L > 0) return 'bifold';
    return 'punched';
  }
  if (OUTSIDE.has(A.type) || OUTSIDE.has(B.type)) {
    const q = OUTSIDE.has(A.type) ? B : A, o = OUTSIDE.has(A.type) ? A : B;
    if (o.unit && o.unit === q.unit) return 'slider';
    return style === 'glass' ? 'curtain' : 'punched';
  }
  const comm = COMMUNAL.has(A.type) ? A : COMMUNAL.has(B.type) ? B : null;
  if (comm) { const o = comm === A ? B : A; return o.type === 'hall' || COMMUNAL.has(o.type) ? 'door' : 'solid'; }
  if (A.unit !== B.unit) return 'solid';
  if (LIVE.has(A.type) || LIVE.has(B.type)) return 'door';
  if ((A.type === 'bed' && B.type === 'bath') || (B.type === 'bed' && A.type === 'bath')) return 'door';
  return 'solid';
}

function buildFloor(fl, opt, M) {
  const { style, floorH } = opt;
  const H = floorH - (style === 'house' ? 0.25 : 0.3);
  const shell = new Bucket(M), inner = new Bucket(M);
  const rooms = fl.rooms;
  const segs = boundaries(rooms);
  segs.forEach(s => { s.kind = classify(s, style, opt.fi); });
  // make sure every room can be reached: a room with no doorway gets one on its longest shared wall
  rooms.forEach(q => {
    if (COMMUNAL.has(q.type) || q.type === 'core' || OUTSIDE.has(q.type)) return;
    const mine = segs.filter(s => (s.A === q || s.B === q) && s.A && s.B);
    if (mine.some(s => s.kind === 'door' || s.kind === 'slider')) return;
    const cand = mine.filter(s => s.kind === 'solid' && s.A.unit === s.B.unit && !COMMUNAL.has((s.A === q ? s.B : s.A).type)).sort((x, y) => (y.b - y.a) - (x.b - x.a))[0];
    if (cand) cand.kind = 'door';
  });
  // exterior sides of each room (so furniture faces the windows)
  rooms.forEach(q => { q.ext = {}; });
  segs.forEach(s => {
    if (s.A && !s.B) s.A.ext[s.axis === 'x' ? 'e' : 's'] = true;
    if (s.B && !s.A) s.B.ext[s.axis === 'x' ? 'w' : 'n'] = true;
    if (s.kind === 'slider') { const q = OUTSIDE.has(s.A.type) ? s.B : s.A; q.ext[s.axis === 'x' ? (q === s.A ? 'e' : 'w') : (q === s.A ? 's' : 'n')] = true; }
  });

  // slabs and floor finishes
  rooms.forEach(q => {
    const cx = q.x + q.w / 2, cz = q.z + q.d / 2;
    const outside = OUTSIDE.has(q.type);
    if (q.type === 'core') {
      shell.box('core', q.w, H + .3, q.d, cx, (H + .3) / 2 - .3, cz);
      return;
    }
    shell.box(style === 'glass' ? 'slabEdge' : 'slab', q.w + (outside ? 0 : .02), outside ? .22 : .3, q.d + (outside ? 0 : .02), cx, outside ? -.11 : -.15, cz);
    const fin = outside ? 'deck' : q.type === 'bath' || q.type === 'utility' ? 'tile' : q.type === 'bed' ? 'carpet' : q.type === 'corridor' ? 'corridor' : q.type === 'lobby' ? 'lobbyFloor' : 'wood';
    inner.box(fin, q.w - .02, .02, q.d - .02, cx, .01, cz);
  });

  const ext = style === 'brick' ? 'brick' : style === 'house' ? 'brick' : 'spandrel';
  segs.forEach(s => {
    const len = s.b - s.a, mid = (s.a + s.b) / 2;
    const put = (bucket, mat, along, h, thick, at, y, off = 0) => {
      // a box lying along the segment: `along` metres long, centred `at` along the line
      if (s.axis === 'x') bucket.box(mat, thick, h, along, s.L + off, y, at);
      else bucket.box(mat, along, h, thick, at, y, s.L + off);
    };
    const outSign = s.A && !s.B ? 1 : -1; // which way is outside, for exterior walls
    const xp = (along, h, at, y) => {             // exterior wall piece plus its plastered inside face
      put(shell, ext, along, h, .3, at, y);
      if (style !== 'glass') put(shell, 'wallInt', along, h, .02, at, y, -outSign * .16);
    };
    switch (s.kind) {
      case 'none': return;
      case 'solid': put(inner, 'wallInt', len, H, .12, mid, H / 2); return;
      case 'door': {
        if (len < 1.3) { return; }
        const dw = Math.min(.95, len - .3), d0 = mid - dw / 2, d1 = mid + dw / 2;
        put(inner, 'wallInt', d0 - s.a, H, .12, (s.a + d0) / 2, H / 2);
        put(inner, 'wallInt', s.b - d1, H, .12, (d1 + s.b) / 2, H / 2);
        put(inner, 'wallInt', dw, H - 2.1, .12, mid, 2.1 + (H - 2.1) / 2);
        return;
      }
      case 'slider': {
        put(shell, 'frame', len, .08, .1, mid, H - .04);
        put(shell, 'glass', len, H - .1, .03, mid, (H - .1) / 2);
        for (let x = s.a; x <= s.b + 1e-3; x += len / Math.max(2, Math.round(len / 1.5))) put(shell, 'frame', .05, H, .08, x, H / 2);
        return;
      }
      case 'rail': {
        put(shell, 'glassRail', len, 1.05, .02, mid, .55, outSign * -.05);
        put(shell, 'rail', len, .04, .06, mid, 1.08, outSign * -.05);
        return;
      }
      case 'glassWall': case 'curtain': {
        const lit = s.kind === 'curtain' && (s.A || s.B).unit && opt.lit(((s.A || s.B).unit));
        put(shell, lit ? 'glassLit' : 'glass', len, H, .03, mid, H / 2);
        const n = Math.max(1, Math.round(len / 1.5));
        for (let i = 0; i <= n; i++) put(shell, 'frame', .06, H, .14, s.a + i * len / n, H / 2, outSign * .04);
        if (style === 'glass') put(shell, 'slabEdge', len + .02, .3, .32, mid, -.15, outSign * .05);
        return;
      }
      case 'frontDoor': {
        const dw = 1.1, d0 = mid - dw / 2, d1 = mid + dw / 2;
        xp(d0 - s.a, H, (s.a + d0) / 2, H / 2);
        xp(s.b - d1, H, (d1 + s.b) / 2, H / 2);
        xp(dw, H - 2.15, mid, 2.15 + (H - 2.15) / 2);
        put(shell, 'door', dw - .08, 2.1, .06, mid, 1.05, outSign * .1);
        put(shell, 'metal', .03, .3, .05, mid + .35, 1.05, outSign * .15);
        put(shell, 'stone', dw + .4, .12, .5, mid, -.05, outSign * .3);
        return;
      }
      case 'bifold': {
        xp(len, H - 2.3, mid, 2.3 + (H - 2.3) / 2);
        put(shell, 'glass', len - .2, 2.25, .03, mid, 1.13);
        const n = Math.max(3, Math.round(len / .9));
        for (let i = 0; i <= n; i++) put(shell, 'frame', .05, 2.3, .08, s.a + .1 + i * (len - .2) / n, 1.15);
        put(shell, 'frame', len - .2, .06, .08, mid, 2.27);
        return;
      }
      case 'punched': {
        const q = s.A || s.B;
        const house = style === 'house';
        const sill = q.type === 'bath' || q.type === 'utility' ? 1.45 : house ? .9 : .5;
        const head = house ? 2.1 : 2.35;
        const bays = Math.max(1, Math.round(len / (house ? 2.6 : 2.4)));
        const bw = len / bays;
        const ww = Math.min(house ? 1.3 : 1.5, bw - .6);
        const lit = opt.lit(q.unit);
        if (ww < .5 || q.type === 'hall' && !house) { xp(len, H, mid, H / 2); if (style !== 'glass') put(shell, 'slab', len, .3, .3, mid, -.15); return; }
        xp(len, sill, mid, sill / 2);
        xp(len, H - head, mid, head + (H - head) / 2);
        for (let i = 0; i < bays; i++) {
          const c = s.a + bw * (i + .5);
          const pier0 = i === 0 ? s.a : c - bw / 2, w0 = (c - ww / 2) - pier0;
          xp(w0, head - sill, pier0 + w0 / 2, sill + (head - sill) / 2);
          put(shell, lit ? 'glassLit' : 'glass', ww, head - sill, .03, c, sill + (head - sill) / 2);
          put(shell, house ? 'frameW' : 'frame', ww, .06, .12, c, sill + .03);
          put(shell, house ? 'frameW' : 'frame', ww, .06, .12, c, head - .03);
          put(shell, house ? 'frameW' : 'frame', .05, head - sill, .1, c, sill + (head - sill) / 2);
          put(shell, 'stone', ww + .2, .08, .42, c, sill - .04, outSign * .06);
          if (i === bays - 1) { const p1 = c + ww / 2, w1 = s.b - p1; xp(w1, head - sill, p1 + w1 / 2, sill + (head - sill) / 2); }
        }
        if (style !== 'glass') put(shell, style === 'house' ? 'brick' : 'stone', len + .02, .3, .32, mid, -.15);
        return;
      }
    }
  });

  rooms.forEach(q => furnish(q, inner, style));
  const g = new THREE.Group();
  const gs = shell.build(new THREE.Group()); gs.name = 'shell';
  const gi = inner.build(new THREE.Group()); gi.name = 'inner';
  g.add(gs, gi);
  g.userData = { shell: gs, inner: gi, H };
  return g;
}

// ---------- furniture ----------
function furnish(q, B, style) {
  const { x, z, w, d, type } = q;
  const cx = x + w / 2, cz = z + d / 2;
  const y = .02;
  // orientation: "front" is the side with windows. We work in a local frame where the window is at -v.
  const e = q.ext || {};
  const win = e.n ? 'n' : e.s ? 's' : e.e ? 'e' : e.w ? 'w' : 'n';
  const alongX = win === 'n' || win === 's';
  const U = alongX ? w : d, V = alongX ? d : w;        // U across the window, V away from it
  const to = (u, v) => {                                // local (u across, v from window) -> world
    if (win === 'n') return [x + u, z + v];
    if (win === 's') return [x + w - u, z + d - v];
    if (win === 'w') return [x + v, z + d - u];
    return [x + w - v, z + u];
  };
  const box = (mat, bu, bh, bv, u, yy, v) => { const [wx, wz] = to(u, v); if (alongX) B.box(mat, bu, bh, bv, wx, y + yy, wz); else B.box(mat, bv, bh, bu, wx, y + yy, wz); };
  const ball = (mat, r, u, yy, v, sy = 1) => { const [wx, wz] = to(u, v); const g = new THREE.IcosahedronGeometry(r, 1); g.scale(1, sy, 1); g.deleteAttribute('uv'); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); g.translate(wx, y + yy, wz); B.geo(mat, g); };
  const cyl = (mat, r, h, u, yy, v) => { const [wx, wz] = to(u, v); const g = new THREE.CylinderGeometry(r, r * .8, h, 12); g.translate(wx, y + yy, wz); B.geo(mat, g); };
  const plant = (u, v, s = 1) => { cyl('pot', .2 * s, .4 * s, u, .2 * s, v); ball('plant', .34 * s, u, .72 * s, v, 1.25); ball('plant', .22 * s, u + .12 * s, 1.02 * s, v - .05, 1.2); };
  const sofa = (u, v, len) => {
    box('sofa', len, .42, .9, u, .21, v); box('sofa', len, .45, .22, u, .55, v + .34);
    box('sofa', .22, .25, .9, u - len / 2 + .11, .55, v); box('sofa', .22, .25, .9, u + len / 2 - .11, .55, v);
    box('fabric', .45, .35, .12, u - len / 4, .58, v + .2); box('throw_', .45, .35, .12, u + len / 4, .58, v + .2);
  };
  const table = (u, v, tw, td, seats) => {
    box('oak', tw, .04, td, u, .74, v);
    box('darkWood', .06, .72, .06, u - tw / 2 + .1, .36, v - td / 2 + .1); box('darkWood', .06, .72, .06, u + tw / 2 - .1, .36, v - td / 2 + .1);
    box('darkWood', .06, .72, .06, u - tw / 2 + .1, .36, v + td / 2 - .1); box('darkWood', .06, .72, .06, u + tw / 2 - .1, .36, v + td / 2 - .1);
    const n = Math.floor(seats / 2);
    for (let i = 0; i < n; i++) {
      const cu = u - tw / 2 + tw * (i + .5) / n;
      box('fabric', .45, .45, .45, cu, .23, v - td / 2 - .3); box('fabric', .45, .4, .06, cu, .65, v - td / 2 - .5);
      box('fabric', .45, .45, .45, cu, .23, v + td / 2 + .3); box('fabric', .45, .4, .06, cu, .65, v + td / 2 + .5);
    }
  };
  switch (type) {
    case 'open': case 'living': case 'kitchen': case 'dining': {
      const kitchen = type === 'open' || type === 'kitchen';
      const living = type !== 'kitchen' && type !== 'dining';
      // kitchen runs along the back wall (far from the window)
      if (kitchen) {
        const kl = Math.min(U - .6, type === 'kitchen' ? U - .6 : Math.max(2.4, U * .7));
        const ku = U / 2;
        box('cabinet', kl, .88, .62, ku, .44, V - .31); box('worktop', kl + .02, .04, .64, ku, .9, V - .32);
        box('cabinet', kl * .55, .7, .35, ku, 1.85, V - .18); box('metal', .6, .02, .5, ku - kl * .25, .93, V - .32);
        box('black', .6, .02, .5, ku + kl * .25, .93, V - .32);
        if (V > 4.2 && U > 3.2) { box('cabinet', Math.min(2.2, U - 1.6), .88, .9, ku, .44, V - 2); box('worktop', Math.min(2.2, U - 1.6) + .1, .04, 1, ku, .9, V - 2); for (let i = -1; i <= 1; i++) box('black', .38, .7, .38, ku + i * .6, .35, V - 2.75); }
      }
      if (type === 'dining' || (type === 'open' && V > 4)) table(U / 2, type === 'dining' ? V / 2 : V * .5, Math.min(1.8, U - 1.6), .9, U > 3.6 ? 6 : 4);
      if (living) {
        const sv = type === 'open' ? Math.min(V * .28, 1.7) : V * .55;
        box('rug', Math.min(U - .8, 2.6), .01, 1.8, U / 2, .005, sv);
        sofa(U / 2, sv + .55, Math.min(2.4, U - 1));
        box('oak', 1.1, .35, .6, U / 2, .18, sv - .45);
        if (type === 'living') { box('darkWood', Math.min(1.8, U - 1), .5, .4, U / 2, .25, .25); box('screen', 1.3, .75, .05, U / 2, .95, .25); }
        plant(.4, .4); plant(U - .4, .4, .8);
      }
      return;
    }
    case 'bed': {
      const bw = U > 3.2 ? 1.6 : 1.4, bl = 2.05, bu = U / 2, bv = Math.min(V - bl / 2 - .1, V * .62);
      box('darkWood', bw + .1, .3, bl, bu, .15, bv); box('linen', bw, .25, bl - .1, bu, .42, bv);
      box('throw_', bw + .05, .06, .6, bu, .57, bv - bl / 2 + .55);
      box('fabric', bw + .2, 1.1, .1, bu, .55, bv + bl / 2); box('white', .5, .2, .14, bu - .4, .62, bv + bl / 2 - .2); box('white', .5, .2, .14, bu + .4, .62, bv + bl / 2 - .2);
      [-1, 1].forEach(sg => { if (U > bw + 1.2) box('oak', .45, .5, .4, bu + sg * (bw / 2 + .35), .25, bv + bl / 2 - .25); });
      if (V > 4 && U > bw + 1.9) box('white', .6, 2.2, Math.min(2, V - 2.4), .32, 1.1, V * .4);
      box('rug2', bw + .8, .01, 1.2, bu, .005, bv - bl / 2 - .2);
      return;
    }
    case 'bath': {
      if (U >= 1.7) { box('white', Math.min(1.7, U - .1), .55, .75, Math.min(1.7, U - .1) / 2 + .05, .28, V - .4); }
      else box('glass', .9, 2, .02, U / 2, 1, V - .95);
      box('white', .5, .15, .4, U - .35, .82, .3); box('oak', .5, .55, .4, U - .35, .45, .3);
      box('white', .38, .4, .55, Math.max(.3, U * .3), .2, .35);
      return;
    }
    case 'study': {
      box('oak', Math.min(1.6, U - .4), .04, .7, U / 2, .74, .5); box('darkWood', .06, .72, .6, U / 2 - .7, .36, .5); box('darkWood', .06, .72, .6, U / 2 + .7, .36, .5);
      box('screen', .7, .42, .04, U / 2, 1.05, .75); box('black', .55, .9, .55, U / 2, .45, 1.2);
      box('darkWood', Math.min(2.4, U - .4), 2.1, .35, U / 2, 1.05, V - .2);
      return;
    }
    case 'utility': {
      if (U > 1 && V > 1) { box('white', .6, .85, .6, .4, .43, V - .35); box('white', .6, .85, .6, 1.05 > U ? .4 : 1.05, .43, V - .35); box('worktop', Math.min(U - .1, 1.4), .04, .62, Math.min(U - .1, 1.4) / 2 + .05, .88, V - .35); }
      return;
    }
    case 'hall': { if (U > 1.6 && V > 1.6) { box('oak', .9, .8, .35, U / 2, .4, V - .2); plant(U - .35, V - .35, .7); } return; }
    case 'balcony': case 'terrace': {
      box('darkWood', .6, .45, .6, U * .3, .23, V / 2); box('darkWood', .6, .45, .6, U * .3 + .9, .23, V / 2); box('metal', .5, .02, .5, U * .3 + .45, .55, V / 2);
      if (U > 3) plant(U - .5, V / 2, .9);
      return;
    }
    case 'lobby': {
      if (w * d > 60) {
        box('oak', 3, 1.05, .8, U / 2, .53, V * .35); box('worktop', 3.1, .05, .9, U / 2, 1.08, V * .35);
        sofa(U * .25, V * .7, 2.4); sofa(U * .75, V * .7, 2.4); plant(1, 1, 1.4); plant(U - 1, 1, 1.4); plant(1, V - 1, 1.2);
        box('rug', 4, .01, 3, U / 2, .005, V * .7);
      } else { box('metal', 1.6, .9, .5, U / 2, .45, V - .3); plant(.6, .6, 1.2); }
      return;
    }
  }
}

// ---------- the setting ----------
function trees(scene, spots, M) {
  const n = spots.length; if (!n) return;
  const trunkG = new THREE.CylinderGeometry(.12, .2, 1, 6); trunkG.translate(0, .5, 0);
  const crownG = new THREE.IcosahedronGeometry(1, 1);
  const trunk = new THREE.InstancedMesh(trunkG, M.trunk, n);
  const crown = new THREE.InstancedMesh(crownG, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }), n);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  spots.forEach(([x, z, s = 1], i) => {
    const h = (3 + rng() * 2.5) * s;
    m.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(s, h * .55, s)); trunk.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(x, h * .7, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * 6, 0)), new THREE.Vector3(1.6 * s + rng(), h * .48, 1.6 * s + rng())); crown.setMatrixAt(i, m);
    crown.setColorAt(i, c.set('#4d6b33').offsetHSL((rng() - .5) * .05, (rng() - .5) * .1, (rng() - .5) * .1));
  });
  [trunk, crown].forEach(o => { o.castShadow = true; o.receiveShadow = true; scene.add(o); });
}
function car(B, x, z, ry, mat) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const at = (u, v) => [x + u * c + v * s, z - u * s + v * c];
  let p = at(0, 0); B.box(mat, 4.3, .7, 1.8, p[0], .55, p[1], ry);
  p = at(-.2, 0); B.box(mat, 2.3, .55, 1.6, p[0], 1.15, p[1], ry);
  p = at(-.2, 0); B.box('glass', 2.32, .4, 1.62, p[0], 1.18, p[1], ry);
  [[1.3, .85], [1.3, -.85], [-1.3, .85], [-1.3, -.85]].forEach(([u, v]) => { const q = at(u, v); B.box('black', .65, .65, .25, q[0], .33, q[1], ry); });
}
function lamp(B, x, z) { B.box('rail', .12, 5, .12, x, 2.5, z); B.box('lampHead', .5, .15, .3, x, 5, z); }
function neighbour(B, x, z, w, d, h, mat) { B.box(mat, w, h, d, x, h / 2, z); B.box('roof', w + .2, .4, d + .2, x, h + .2, z); }

function site(scene, data, M, extent) {
  const B = new Bucket(M);
  const [W, D] = data.size;
  const big = 2600;
  if (data.site.kind === 'canal') { const cz0 = D / 2 + 9.4, cz1 = D / 2 + 23; B.box('ground', big, .1, big / 2 + cz0, 0, -.4, (cz0 - big / 2) / 2); B.box('ground', big, .1, big / 2 - cz1, 0, -.4, (cz1 + big / 2) / 2); B.box('stone', 300, 1.2, 14, 0, -1.6, D / 2 + 16.2); }
  else B.box('ground', big, .1, big, 0, -.4, 0);
  const tr = [];
  if (data.site.kind === 'city') {
    B.box('pave', W + 24, .12, D + 30, 0, -.3, 1);
    // roads on all four sides
    B.box('road', 14, .1, 300, -W / 2 - 19, -.32, 0); B.box('road', 14, .1, 300, W / 2 + 19, -.32, 0);
    B.box('road', 300, .1, 14, 0, -.32, -D / 2 - 19);
    for (let i = -140; i < 140; i += 8) { B.box('mark', .2, .02, 3, -W / 2 - 19, -.26, i); B.box('mark', .2, .02, 3, W / 2 + 19, -.26, i); B.box('mark', 3, .02, .2, i, -.26, -D / 2 - 19); }
    // park to the south
    for (let i = 0; i < 40; i++) tr.push([(rng() - .5) * 120, D / 2 + 22 + rng() * 70, .9 + rng() * .5]);
    for (let i = -W / 2 - 6; i <= W / 2 + 6; i += 6) { tr.push([i, -D / 2 - 9, .8]); }
    B.box('pave', 3, .02, 80, 0, -.28, D / 2 + 55);
    // other towers around
    const blocks = [[-70, -50, 26, 22, 64, 'nbGlass'], [-62, 10, 20, 26, 38, 'nbStone'], [62, -48, 24, 20, 48, 'nbGlass'], [70, 14, 22, 24, 30, 'nbStone'],
      [0, -78, 40, 20, 42, 'nbStone'], [-110, -20, 30, 30, 22, 'nbStone'], [112, -30, 26, 30, 56, 'nbGlass'], [-40, -110, 26, 26, 80, 'nbGlass'], [55, -112, 30, 24, 34, 'nbStone'], [140, 60, 30, 30, 26, 'nbStone'], [-150, 70, 30, 30, 34, 'nbGlass']];
    blocks.forEach(b => neighbour(B, ...b));
    for (let i = -120; i < 140; i += 24) { lamp(B, -W / 2 - 11, i); lamp(B, W / 2 + 11, i); }
    car(B, -W / 2 - 16, -20, 0, 'car1'); car(B, W / 2 + 22, 8, Math.PI, 'car2'); car(B, 10, -D / 2 - 16, Math.PI / 2, 'car3');
  } else if (data.site.kind === 'canal') {
    B.box('pave', W + 10, .12, D + 8, 0, -.3, 0);
    B.box('road', 300, .1, 10, 0, -.32, -D / 2 - 12);
    for (let i = -140; i < 140; i += 8) B.box('mark', 3, .02, .2, i, -.26, -D / 2 - 12);
    B.box('pave', 300, .12, 4, 0, -.3, -D / 2 - 5);
    B.box('pave', 300, .12, 5, 0, -.3, D / 2 + 6.5); // towpath
    B.box('stone', 300, .5, .4, 0, -.25, D / 2 + 9.2);
    const wg = new THREE.PlaneGeometry(300, 14); wg.rotateX(-Math.PI / 2); wg.translate(0, -.75, D / 2 + 16.2);
    scene.add(Object.assign(new THREE.Mesh(wg, M.water), { receiveShadow: true }));
    B.box('stone', 300, .5, .4, 0, -.25, D / 2 + 23.2);
    B.box('ground', 300, .1, 30, 0, -.3, D / 2 + 38);
    // narrowboats
    [[-20, 'boat'], [26, 'boat']].forEach(([bx], i) => { B.box(i ? 'boatTop' : 'boat', 20, .9, 2.1, bx, -.5, D / 2 + 11.6); B.box(i ? 'boat' : 'boatTop', 14, 1, 1.9, bx + 1, .45, D / 2 + 11.6); B.box('roof', 14.2, .08, 2, bx + 1, .98, D / 2 + 11.6); });
    for (let i = -100; i <= 100; i += 7) tr.push([i + rng() * 3, D / 2 + 28 + rng() * 14, .9 + rng() * .4]);
    for (let i = -60; i <= 60; i += 9) tr.push([i, -D / 2 - 4, .7]);
    // terraced houses over the road
    for (let i = -90; i <= 90; i += 15) neighbour(B, i, -D / 2 - 30, 14, 10, 9 + (i % 2 ? 3 : 0), 'nbBrick');
    neighbour(B, -W / 2 - 22, 0, 16, D, 14, 'nbBrick'); neighbour(B, W / 2 + 22, 0, 16, D, 17, 'nbStone');
    for (let i = -90; i < 100; i += 22) { lamp(B, i, -D / 2 - 6.5); lamp(B, i + 11, D / 2 + 8.5); }
    car(B, -8, -D / 2 - 9, Math.PI / 2, 'car1'); car(B, 12, -D / 2 - 9, Math.PI / 2, 'car2'); car(B, 30, -D / 2 - 15, -Math.PI / 2, 'car3');
  } else {
    // suburb: front drive, back garden, neighbours
    B.box('road', 300, .1, 8, 0, -.32, -D / 2 - 14);
    B.box('pave', 300, .12, 2.5, 0, -.3, -D / 2 - 8.7);
    B.box('gravel', 6, .1, 8.5, W / 2 - 3.2, -.3, -D / 2 - 3.8);
    B.box('pave', 1.6, .1, 6, -.1, -.3, -D / 2 - 3);
    B.box('stone', W + 4, .1, 4, 0, -.3, D / 2 + 2.4); // patio
    B.box('darkWood', .1, 1.8, 30, -W / 2 - 4, .6, D / 2 + 12); B.box('darkWood', .1, 1.8, 30, W / 2 + 4, .6, D / 2 + 12); B.box('darkWood', W + 8, 1.8, .1, 0, .6, D / 2 + 27);
    B.box('wood', 3.2, .05, 2.6, -W / 2 + 1, .05, D / 2 + 2.4);
    B.box('darkWood', 1.8, .75, .9, -W / 2 + 1, .4, D / 2 + 2.4);
    car(B, W / 2 - 3.2, -D / 2 - 4.5, Math.PI / 2, 'car1');
    for (let i = 0; i < 9; i++) tr.push([(rng() - .5) * (W + 4), D / 2 + 14 + rng() * 12, .8 + rng() * .4]);
    tr.push([-W / 2 - 1, -D / 2 - 5, .7], [-W / 2 - 1.5, -D / 2 - 9.5, .6]);
    for (let i = -60; i <= 60; i += 8) tr.push([i, -D / 2 - 22, .8]);
    lamp(B, -6, -D / 2 - 9.5); lamp(B, 22, -D / 2 - 9.5);
  }
  B.build(scene);
  trees(scene, tr, M);
}

function nbHouse(scene, M, x, z, flip) {
  const B = new Bucket(M), w = 10, d = 8.5;
  B.box('brick', w, 5.4, d, x, 2.7, z);
  for (let i = 0; i < 3; i++) { B.box('glass', 1.2, 1.2, .05, x - 3 + i * 3, 1.5, z - d / 2 - .02); B.box('glass', 1.2, 1.2, .05, x - 3 + i * 3, 4, z - d / 2 - .02); }
  const g = new THREE.Group(); B.build(g); scene.add(g);
  scene.add(gableRoof(M, x, z, w, d, 5.4, .35));
}

function gableRoof(M, cx, cz, w, d, y, over = .4) {
  const g = new THREE.Group();
  const half = d / 2 + over, rise = half * Math.tan(THREE.MathUtils.degToRad(38));
  const slope = Math.hypot(half, rise);
  const ang = Math.atan2(rise, half);
  const B = new Bucket(M);
  B.box('tileRoof', w + over * 2, .16, slope, cx, y + rise / 2, cz - half / 2, 0, -ang);
  B.box('tileRoof', w + over * 2, .16, slope, cx, y + rise / 2, cz + half / 2, 0, ang);
  B.box('roof', w + over * 2 + .04, .14, .3, cx, y + rise + .03, cz);
  // gable ends
  const shape = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise * (d / 2) / half)]);
  [-1, 1].forEach(sg => {
    const eg = new THREE.ExtrudeGeometry(shape, { depth: .3, bevelEnabled: false });
    eg.rotateY(Math.PI / 2); eg.translate(cx + sg * (w / 2) - .15, y, cz);
    const uv = eg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.6, uv.getY(i) / 1.6);
    B.geo('brick', eg);
  });
  B.box('brick', .7, 2, .7, cx + w * .3, y + rise * .7, cz + 1);
  B.build(g);
  return g;
}

// ---------- sky ----------
function makeSky() {
  const g = new THREE.SphereGeometry(1500, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sun: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color() }, night: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top, hor, sunCol, sun; uniform float night; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      void main(){ float y = max(vP.y, 0.0); vec3 c = mix(hor, top, pow(y, 0.55));
        float s = max(dot(vP, normalize(sun)), 0.0); c += sunCol * (pow(s, 600.0) * 4.0 + pow(s, 8.0) * 0.35);
        if (vP.y < 0.0) c = hor * 0.7;
        vec3 q = floor(vP * 420.0); float st = step(0.9975, h(q)) * night * smoothstep(0.05, 0.3, vP.y);
        c += vec3(st);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  return new THREE.Mesh(g, m);
}

// ---------- main ----------
export function run(data, root) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = matchMedia('(pointer: coarse)').matches;
  const canvas = root.querySelector('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.75 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture;
  const camera = new THREE.PerspectiveCamera(40, 1, .1, 4000);
  const M = makeMaterials(data.style);

  // which homes have their lights on tonight (stable per unit)
  const litSet = new Set();
  Object.keys(data.units).forEach((id, i) => { if (((i * 2654435761) >>> 0) % 100 < 68) litSet.add(id); });
  const opt = { style: data.style, floorH: data.floorH, lit: u => !!u && litSet.has(u) };

  // build the floors
  const building = new THREE.Group(); scene.add(building);
  const floors = data.floors.map((fl, i) => {
    const g = buildFloor(fl, { ...opt, fi: i }, M);
    g.position.y = i * data.floorH;
    g.userData.index = i; g.userData.lift = 0; g.userData.liftTo = 0;
    building.add(g);
    return g;
  });
  const topY = data.floors.length * data.floorH;
  const plate = (() => { const R = data.floors[data.floors.length - 1].rooms.filter(q => !OUTSIDE.has(q.type)); const x0 = Math.min(...R.map(q => q.x)), x1 = Math.max(...R.map(q => q.x + q.w)), z0 = Math.min(...R.map(q => q.z)), z1 = Math.max(...R.map(q => q.z + q.d)); return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 }; })();

  // roof
  const roof = new THREE.Group(); roof.position.y = topY; building.add(roof); roof.userData.lift = 0; roof.userData.liftTo = 0;
  {
    const B = new Bucket(M);
    const { cx, cz, w, d } = plate;
    if (data.roof === 'gable') {
      B.box('slab', w + .1, .25, d + .1, cx, -.12, cz);
      B.build(roof);
      roof.add(gableRoof(M, cx, cz, w + .3, d + .3, 0, .45));
    } else {
      B.box(data.style === 'glass' ? 'slabEdge' : 'slab', w + .1, .4, d + .1, cx, -.1, cz);
      const pmat = data.style === 'glass' ? 'glass' : 'brick';
      const ph = 1.1;
      B.box(pmat, w + .1, ph, .25, cx, ph / 2, plate.z0); B.box(pmat, w + .1, ph, .25, cx, ph / 2, plate.z1);
      B.box(pmat, .25, ph, d, plate.x0, ph / 2, cz); B.box(pmat, .25, ph, d, plate.x1, ph / 2, cz);
      if (data.roof === 'crown') {
        B.box('core', 10, 4, 8, cx, 2.1, plate.z0 + 5);
        for (let i = 0; i <= 20; i++) { const x = plate.x0 + i * w / 20; B.box('frame', .15, 7, .6, x, 3.5, plate.z0 - .2); B.box('frame', .15, 7, .6, x, 3.5, plate.z1 + .2); }
        for (let i = 0; i <= 12; i++) { const z = plate.z0 + i * d / 12; B.box('frame', .6, 7, .15, plate.x0 - .2, 3.5, z); B.box('frame', .6, 7, .15, plate.x1 + .2, 3.5, z); }
        B.box('frame', w + 1, .3, .8, cx, 7, plate.z0 - .2); B.box('frame', w + 1, .3, .8, cx, 7, plate.z1 + .2);
      } else if (data.roof === 'garden') {
        B.box('deck', w - 4, .06, d - 4, cx, .04, cz);
        for (let i = 0; i < 6; i++) { const x = plate.x0 + 4 + i * (w - 8) / 5; B.box('pot', 1.6, .6, 1.6, x, .3, plate.z0 + 2); B.box('plant', 1.4, .9, 1.4, x, 1, plate.z0 + 2); }
        B.box('darkWood', 8, .1, 4, cx + 6, 2.6, cz + 2); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => B.box('darkWood', .15, 2.6, .15, cx + 6 + a * 3.9, 1.3, cz + 2 + b * 1.9));
        for (let i = 0; i < 4; i++) { B.box('fabric', .7, .3, 1.9, cx - 8 + i * 1.6, .2, cz + 3); }
        B.box('oak', 2.2, .05, 1, cx + 6, .76, cz + 2); B.box('core', 4, 3, 5, plate.x0 + 18, 1.5, plate.z0 + 4.6);
      }
      B.build(roof);
    }
  }

  // shared setting
  site(scene, data, M);
  if (data.site.kind === 'suburb') { nbHouse(scene, M, -18, -1, false); nbHouse(scene, M, 18, 0, true); }

  // light
  const sky = makeSky(); scene.add(sky);
  const hemi = new THREE.HemisphereLight('#dfe8f2', '#6b6152', .5); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 3); sun.castShadow = true; scene.add(sun, sun.target);
  const R = Math.max(plate.w, plate.d, topY) * (data.single ? 2.2 : 1.25) + 10;
  const sm = sun.shadow; sm.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048);
  Object.assign(sm.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: R * 6 }); sm.camera.updateProjectionMatrix(); sm.bias = -.0004; sm.normalBias = .03;
  scene.fog = new THREE.Fog('#c9d3dc', 220, 1200);
  const roomLights = [];
  for (let i = 0; i < 10; i++) { const l = new THREE.PointLight('#ffd8a8', 0, 9, 1.6); l.visible = false; l.userData.base = 0; scene.add(l); roomLights.push(l); }

  let hour = data.startHour, night = 0;
  function setTime(h) {
    hour = h;
    const t = (h - 6) / 14;                                  // 0 at sunrise, 1 at sunset
    const elev = 52 * Math.sin(Math.PI * clamp(t, -.25, 1.25));
    const az = THREE.MathUtils.degToRad(90 + 180 * t);       // east → south → west
    const e = THREE.MathUtils.degToRad(Math.max(elev, -8));
    // x is east, -z is north, so the sun in the south sits at +z
    const dir = new THREE.Vector3(Math.cos(e) * Math.sin(az), Math.sin(e), -Math.cos(e) * Math.cos(az));
    night = smooth(2, -6, elev);
    const dusk = smooth(22, 1, elev) * (1 - night);
    const center = new THREE.Vector3(plate.cx, topY * .35, plate.cz);
    sun.position.copy(center).addScaledVector(dir, R * 2.5); sun.target.position.copy(center);
    const sc = new THREE.Color('#fff4e6').lerp(new THREE.Color('#ff9a4d'), dusk);
    // after dark the same light stands in for the moon: dim and blue, from high up
    if (elev > 0) { sun.color.copy(sc); sun.intensity = 4.2 * smooth(0, 6, elev) + .2 * night; }
    else { sun.color.set('#8aa2c8'); sun.intensity = .35 * night; sun.position.copy(center).add(new THREE.Vector3(-.3, 1, .4).normalize().multiplyScalar(R * 2.5)); }
    hemi.intensity = .18 + .42 * (1 - night); hemi.color.set(night > .5 ? '#4a5a78' : '#dfe8f2');
    hemi.groundColor.set(night > .5 ? '#1a1a1e' : '#6b6152');
    scene.environmentIntensity = .12 + .5 * (1 - night);
    const top = new THREE.Color('#3f74b8').lerp(new THREE.Color('#2b3c63'), dusk).lerp(new THREE.Color('#05070d'), night);
    const hor = new THREE.Color('#cddbe6').lerp(new THREE.Color('#f2a76b'), dusk).lerp(new THREE.Color('#121722'), night);
    const u = sky.material.uniforms; u.top.value.copy(top); u.hor.value.copy(hor); u.sun.value.copy(dir); u.sunCol.value.copy(sc).multiplyScalar(1 - night); u.night.value = night;
    scene.fog.color.copy(hor);
    renderer.toneMappingExposure = 1 - .15 * night;
    M.glassLit.emissiveIntensity = night * 1.1;
    M.glass.opacity = .3 + .25 * night;
    [M.nbGlass, M.nbBrick, M.nbStone].forEach(m => m.emissiveIntensity = night * .75);
    M.lampHead.emissiveIntensity = night * 4;
    roomLights.forEach(l => { l.intensity = l.userData.base * (.35 + 2.2 * night); });
    ui.time && (ui.time.textContent = label(h));
    dirty = true;
  }
  const label = h => { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); const s = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; return s; };

  // picking volumes: one per floor, one per room
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  const floorPick = floors.map((g, i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(plate.w + .6, data.floorH, plate.d + .6), pickMat); m.position.set(plate.cx, data.floorH / 2 - .3, plate.cz); m.userData.floor = i; g.add(m); return m; });
  const roomPick = floors.map((g, i) => data.floors[i].rooms.filter(q => q.type !== 'core' && !COMMUNAL.has(q.type)).map(q => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(q.w, .2, q.d), pickMat); m.position.set(q.x + q.w / 2, .1, q.z + q.d / 2); m.userData.room = q; m.userData.floor = i; g.add(m); return m;
  }));

  // highlight overlays: availability colours and the selected home
  const STATUS = { Available: '#c8913a', Reserved: '#a7a29a', Sold: '#8a3a32' };
  const overlay = new THREE.Group(); building.add(overlay);
  const unitVolumes = [];
  Object.values(data.units).forEach(u => {
    if (data.single) return;
    const rs = data.floors[u.floor].rooms.filter(q => q.unit === u.id && !OUTSIDE.has(q.type));
    const x0 = Math.min(...rs.map(q => q.x)), x1 = Math.max(...rs.map(q => q.x + q.w)), z0 = Math.min(...rs.map(q => q.z)), z1 = Math.max(...rs.map(q => q.z + q.d));
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 - .3, data.floorH - .7, z1 - z0 - .3), new THREE.MeshBasicMaterial({ color: STATUS[u.status], transparent: true, opacity: .55, depthWrite: false }));
    m.position.set((x0 + x1) / 2, u.floor * data.floorH + (data.floorH - .7) / 2 + .05, (z0 + z1) / 2);
    m.userData.unit = u; m.visible = false; overlay.add(m); unitVolumes.push(m);
  });
  const selMat = new THREE.MeshBasicMaterial({ color: '#c8913a', transparent: true, opacity: .32, depthWrite: false });
  const hoverMat = new THREE.MeshBasicMaterial({ color: '#ede8df', transparent: true, opacity: .16, depthWrite: false });
  const selGroup = new THREE.Group(), hoverGroup = new THREE.Group();
  building.add(selGroup, hoverGroup);
  function paint(group, mat, floor, rooms) {
    group.clear();
    rooms.forEach(q => { const m = new THREE.Mesh(new THREE.BoxGeometry(q.w - .04, .03, q.d - .04), mat); m.position.set(q.x + q.w / 2, .06, q.z + q.d / 2); group.add(m); });
    group.userData.floor = floor;
  }

  // ---------- UI ----------
  const ui = {};
  const $ = s => root.querySelector(s);
  ui.time = $('[data-time]'); ui.slider = $('[data-slider]'); ui.floors = $('[data-floors]'); ui.card = $('[data-card]');
  ui.hint = $('[data-hint]'); ui.walk = $('[data-walkbar]'); ui.plan = $('[data-plan]'); ui.avail = $('[data-avail]'); ui.tabs = $('[data-tabs]');
  ui.modal = $('[data-modal]'); ui.loader = $('[data-loader]');
  ui.slider.value = hour; ui.slider.addEventListener('input', () => { setTime(+ui.slider.value); poke(); });

  // floor list (top floor first)
  const status = {};
  Object.values(data.units).forEach(u => { (status[u.floor] ||= { Available: 0, Reserved: 0, Sold: 0 })[u.status]++; });
  data.floors.map((fl, i) => i).reverse().forEach(i => {
    const fl = data.floors[i];
    const b = document.createElement('button'); b.type = 'button'; b.dataset.floor = i;
    const st = status[i];
    b.innerHTML = `<span class="fn">${fl.short}</span><span class="fl">${fl.label}${st && !data.single ? `<em>${fl.tag ? fl.tag + ' · ' : ''}${st.Available} available</em>` : ''}</span>`;
    b.addEventListener('click', () => { openFloor(+b.dataset.floor); poke(); });
    ui.floors.appendChild(b);
  });
  const allBtn = document.createElement('button'); allBtn.type = 'button'; allBtn.className = 'whole'; allBtn.textContent = data.single ? 'Whole house' : 'Whole building';
  allBtn.addEventListener('click', () => { closeFloors(); poke(); }); ui.floors.prepend(allBtn);

  if (ui.avail) ui.avail.addEventListener('change', () => { showAvail(ui.avail.checked); poke(); });
  function showAvail(on) {
    unitVolumes.forEach(m => { m.visible = on && (openIdx < 0 || m.userData.unit.floor === openIdx); });
    root.classList.toggle('avail-on', on); dirty = true;
  }

  // ---------- camera moves ----------
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = .08;
  controls.maxPolarAngle = Math.PI * .49; controls.minDistance = data.single ? 6 : 12; controls.maxDistance = data.single ? 70 : Math.max(220, topY * 3.2);
  controls.screenSpacePanning = false;
  let fly = null;
  function flyTo(pos, target, dur = 1.1, fov) {
    if (reduce) dur = .01;
    fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), f0: camera.fov, f1: fov || camera.fov, s: performance.now(), d: dur * 1000 };
    dirty = true;
  }
  const overviewPos = () => {
    const h = Math.max(topY, 8), dist = data.single ? 26 : Math.max(plate.w, h) * 1.75 + 20;
    return [new THREE.Vector3(plate.cx + dist * .62, h * (data.single ? .9 : .7) + dist * .28, plate.cz + dist * .82), new THREE.Vector3(plate.cx, h * .42, plate.cz)];
  };
  const [p0, t0] = overviewPos();
  camera.position.copy(p0).multiplyScalar(1.35); controls.target.copy(t0);

  // ---------- opening floors ----------
  let openIdx = -1, selUnit = null, selRoom = null;
  const liftDist = data.single ? 5.5 : Math.max(10, data.floorH * 4);
  function setLifts(idx) {
    floors.forEach((g, i) => { g.userData.liftTo = idx >= 0 && i > idx ? liftDist : 0; });
    roof.userData.liftTo = idx >= 0 ? liftDist : 0;
    floors.forEach((g, i) => { g.userData.inner.visible = data.single || i === idx || (walk && i === walk.floor); });
    dirty = true;
  }
  function openFloor(i, fly_ = true) {
    if (walk) exitWalk(false);
    openIdx = i; setLifts(i);
    selUnit = null; selRoom = null; selGroup.clear(); hoverGroup.clear();
    root.classList.add('floor-open');
    [...ui.floors.querySelectorAll('button')].forEach(b => b.classList.toggle('on', +b.dataset.floor === i));
    allBtn.classList.remove('on');
    showAvail(ui.avail && ui.avail.checked);
    const y = i * data.floorH;
    if (fly_) {
      const span = Math.max(plate.w, plate.d);
      const dist = data.single ? 15 : span * 1.15 + 6;
      flyTo(new THREE.Vector3(plate.cx + dist * .35, y + dist * .95, plate.cz + dist * .62), new THREE.Vector3(plate.cx, y, plate.cz), 1.2);
    }
    hint(data.single ? 'Tap a room to see it, then stand inside.' : 'Tap a flat to see the details.');
    showCard(data.single ? houseCard() : floorCard(i));
  }
  function closeFloors() {
    if (walk) exitWalk(false);
    openIdx = -1; setLifts(-1); selUnit = null; selRoom = null; selGroup.clear(); hoverGroup.clear();
    root.classList.remove('floor-open');
    [...ui.floors.querySelectorAll('button')].forEach(b => b.classList.remove('on')); allBtn.classList.add('on');
    showAvail(ui.avail && ui.avail.checked);
    const [p, t] = overviewPos(); flyTo(p, t, 1.2, 40);
    showCard(data.single ? houseCard() : buildingCard());
    hint(data.single ? 'Tap the house to look inside.' : 'Tap a floor of the building to open it.');
  }

  // ---------- cards ----------
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cardToggle = ui.card.querySelector('.cardtoggle');
  cardToggle?.addEventListener('click', () => ui.card.classList.toggle('min'));
  function showCard(html) { ui.card.innerHTML = html; if (cardToggle) ui.card.prepend(cardToggle); ui.card.classList.remove('min'); ui.card.classList.add('show'); wireCard(); }
  function buildingCard() {
    const all = Object.values(data.units), av = all.filter(u => u.status === 'Available');
    const prices = av.map(u => +u.price.replace(/[^0-9]/g, '')).sort((a, b) => a - b);
    return `<p class="eyebrow">${esc(data.place)}</p><h2>${esc(data.name)}</h2><p>${esc(data.blurb)}</p>
      <dl class="facts"><div><dt>Homes</dt><dd>${all.length}</dd></div><div><dt>Available</dt><dd>${av.length}</dd></div><div><dt>From</dt><dd>${prices.length ? '£' + prices[0].toLocaleString('en-GB') : '—'}</dd></div></dl>
      <p class="small">Pick a floor on the left, or tap the building.</p>
      <div class="row"><button class="btn" data-act="book">Book a viewing</button></div>`;
  }
  function floorCard(i) {
    const fl = data.floors[i], st = status[i];
    if (!st) return `<p class="eyebrow">${esc(data.name)}</p><h2>${esc(fl.label)}</h2><p>${esc((fl.rooms.find(q => q.type === 'lobby') || {}).name || 'Shared floor')}. Residents’ entrance, concierge and lifts.</p><div class="row"><button class="btn ghost" data-act="all">Whole building</button></div>`;
    const ids = Object.values(data.units).filter(u => u.floor === i);
    return `<p class="eyebrow">${esc(data.name)}</p><h2>${esc(fl.label)}</h2><p>${st.Available} of ${ids.length} homes available on this floor.</p>
      <ul class="units">${ids.map(u => `<li><button data-unit="${esc(u.id)}"><span>${esc(u.id)}</span><span>${u.beds} bed · ${u.area} m²</span><span class="st st-${u.status}">${u.status === 'Available' ? esc(u.price) : u.status}</span></button></li>`).join('')}</ul>`;
  }
  function unitCard(u) {
    const rs = data.floors[u.floor].rooms.filter(q => q.unit === u.id);
    return `<p class="eyebrow">${esc(data.name)} · ${esc(data.floors[u.floor].label)}</p><h2>${esc(u.name)}</h2>
      <p class="price">${u.status === 'Sold' ? 'Sold' : esc(u.price)} <span class="st st-${u.status}">${u.status}</span></p>
      <p>${u.beds} bedroom${u.beds > 1 ? 's' : ''} · ${u.baths} bathroom${u.baths > 1 ? 's' : ''} · ${u.area} m² (${Math.round(u.area * 10.764)} sq ft)</p>
      <p class="small">${esc(u.aspect)}</p>
      <ul class="feat">${u.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
      <details><summary>Room sizes</summary><ul class="rooms">${rs.filter(q => q.type !== 'utility' || q.w * q.d > 3).map(q => `<li><span>${esc(q.name)}</span><span>${q.w.toFixed(1)} × ${q.d.toFixed(1)} m</span></li>`).join('')}</ul></details>
      <div class="row"><button class="btn" data-act="walk">Step inside</button><button class="btn ghost" data-act="book">Book a viewing</button></div>
      <button class="link" data-act="floor">Back to ${esc(data.floors[u.floor].label)}</button>`;
  }
  function houseCard() {
    const u = data.units.house;
    return `<p class="eyebrow">${esc(data.place)}</p><h2>${esc(data.name)}</h2><p class="price">${esc(u.price)} <span class="st st-${u.status}">For sale</span></p>
      <p>${u.beds} bedrooms · ${u.baths} bathrooms · ${u.area} m² (${Math.round(u.area * 10.764)} sq ft)</p><p class="small">${esc(u.aspect)}</p>
      <ul class="feat">${u.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
      <div class="row"><button class="btn" data-act="walk">Walk inside</button><button class="btn ghost" data-act="book">Book a viewing</button></div>`;
  }
  function roomCard(q, fi) {
    const note = data.notes && data.notes[q.id];
    return `<p class="eyebrow">${esc(data.name)} · ${esc(data.floors[fi].label)}</p><h2>${esc(q.name)}</h2>
      <p>${q.w.toFixed(1)} m × ${q.d.toFixed(1)} m (${ft(q.w)} × ${ft(q.d)})</p>${note ? `<p class="small">${esc(note)}</p>` : ''}
      <div class="row"><button class="btn" data-act="stand">Stand in this room</button><button class="btn ghost" data-act="book">Book a viewing</button></div>
      <button class="link" data-act="house">Back to the house</button>`;
  }
  function wireCard() {
    ui.card.querySelectorAll('[data-unit]').forEach(b => b.addEventListener('click', () => { selectUnit(data.units[b.dataset.unit]); poke(); }));
    ui.card.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.act;
      if (a === 'book') openModal();
      if (a === 'all') closeFloors();
      if (a === 'floor' && selUnit) openFloor(selUnit.floor, false), selectNone();
      if (a === 'walk') { if (data.single) { const q = data.floors[0].rooms.find(r => r.type === 'hall'); enterWalk(0, q); } else if (selUnit) { const q = data.floors[selUnit.floor].rooms.find(r => r.unit === selUnit.id && r.type === 'open'); enterWalk(selUnit.floor, q); } }
      if (a === 'stand' && selRoom) enterWalk(selRoom.floor, selRoom.q);
      if (a === 'house') { selectNone(); showCard(houseCard()); }
      poke();
    }));
  }
  function selectNone() { selUnit = null; selRoom = null; selGroup.clear(); dirty = true; }
  function selectUnit(u) {
    if (openIdx !== u.floor) openFloor(u.floor, true);
    selUnit = u; selRoom = null;
    const rs = data.floors[u.floor].rooms.filter(q => q.unit === u.id);
    paint(selGroup, selMat, u.floor, rs); selGroup.position.y = u.floor * data.floorH;
    showCard(unitCard(u));
    const x0 = Math.min(...rs.map(q => q.x)), x1 = Math.max(...rs.map(q => q.x + q.w)), z0 = Math.min(...rs.map(q => q.z)), z1 = Math.max(...rs.map(q => q.z + q.d));
    const c = new THREE.Vector3((x0 + x1) / 2, u.floor * data.floorH, (z0 + z1) / 2);
    const out = c.z > plate.cz ? 1 : -1;
    flyTo(new THREE.Vector3(c.x + 4, c.y + 14, c.z + out * 11), c, 1);
    hint('Step inside to look around the flat.');
  }
  function selectRoom(q, fi) {
    if (openIdx !== fi) openFloor(fi, false);
    selRoom = { q, floor: fi }; selUnit = null;
    paint(selGroup, selMat, fi, [q]); selGroup.position.y = fi * data.floorH;
    showCard(roomCard(q, fi));
  }

  // ---------- walking inside ----------
  let walk = null; const look = { yaw: 0, pitch: 0 };
  function roomCentre(q, fi) { return new THREE.Vector3(q.x + q.w / 2, fi * data.floorH + 1.62, q.z + q.d / 2); }
  function faceWindow(q) { const e = q.ext || {}; return e.s ? 0 : e.n ? Math.PI : e.e ? Math.PI / 2 : e.w ? -Math.PI / 2 : 0; }
  function enterWalk(fi, q) {
    if (!q) return;
    walk = { floor: fi, unit: q.unit, room: q, pos: roomCentre(q, fi), to: null };
    openIdx = fi; setLifts(-1); floors.forEach((g, i) => g.userData.inner.visible = data.single || i === fi);
    showAvail(false); if (ui.avail) ui.avail.checked = false;
    selGroup.clear(); hoverGroup.clear();
    controls.enabled = false; root.classList.add('walking'); frame();
    // start a little back from the centre, looking at the window wall
    look.yaw = faceWindow(q); look.pitch = -.08;
    const back = new THREE.Vector3(-Math.sin(look.yaw), 0, -Math.cos(look.yaw)).multiplyScalar(Math.min(q.w, q.d) * .3);
    walk.pos.add(back);
    fly = null; flyTo(walk.pos, walk.pos.clone().add(new THREE.Vector3(Math.sin(look.yaw), 0, Math.cos(look.yaw))), 1.3, 72);
    walk.entering = true;
    setRoomLights(fi, q.unit);
    drawPlan();
    ui.walk.querySelector('[data-where]').textContent = q.name;
    hint(touch ? 'Drag to look around. Tap a room on the plan to move.' : 'Drag to look around. Tap the floor or the plan to move, or use W A S D.');
    ui.card.classList.remove('show');
  }
  function exitWalk(back = true) {
    if (!walk) return;
    const fi = walk.floor, u = walk.unit; walk = null;
    controls.enabled = true; root.classList.remove('walking');
    roomLights.forEach(l => { l.visible = false; });
    camera.fov = 40; frame();
    if (back) {
      if (!data.single && u && data.units[u]) { openFloor(fi, true); selectUnit(data.units[u]); }
      else { openFloor(fi, true); }
    }
  }
  function setRoomLights(fi, unit) {
    const rs = data.floors[fi].rooms.filter(q => (data.single || q.unit === unit) && !OUTSIDE.has(q.type) && q.type !== 'core' && q.w * q.d > 2.5).slice(0, roomLights.length);
    roomLights.forEach((l, i) => {
      const q = rs[i]; l.visible = !!q; if (!q) return;
      l.position.set(q.x + q.w / 2, fi * data.floorH + data.floorH - .7, q.z + q.d / 2); l.userData.base = Math.min(6, q.w * q.d * .35); l.distance = Math.max(q.w, q.d) * 1.4;
      l.intensity = l.userData.base * (.35 + 2.2 * night);
    });
  }
  function moveTo(q, fi) {
    if (!walk) return;
    if (fi !== walk.floor) { walk.floor = fi; setLifts(-1); floors.forEach((g, i) => g.userData.inner.visible = data.single || i === fi); setRoomLights(fi, walk.unit); }
    walk.room = q; walk.to = roomCentre(q, fi); walk.from = camera.position.clone(); walk.t = performance.now();
    ui.walk.querySelector('[data-where]').textContent = q.name; drawPlan(); dirty = true;
  }
  function drawPlan() {
    const c = ui.plan, g = c.getContext('2d'); if (!walk) return;
    const rs = data.floors[walk.floor].rooms.filter(q => data.single || q.unit === walk.unit);
    const x0 = Math.min(...rs.map(q => q.x)), x1 = Math.max(...rs.map(q => q.x + q.w)), z0 = Math.min(...rs.map(q => q.z)), z1 = Math.max(...rs.map(q => q.z + q.d));
    const W = c.width = c.clientWidth * devicePixelRatio, H = c.height = c.clientHeight * devicePixelRatio;
    const s = Math.min((W - 16) / (x1 - x0), (H - 16) / (z1 - z0)), ox = (W - s * (x1 - x0)) / 2, oz = (H - s * (z1 - z0)) / 2;
    c._map = { s, ox, oz, x0, z0, rs };
    g.clearRect(0, 0, W, H);
    rs.forEach(q => {
      const on = walk.room === q;
      g.fillStyle = on ? 'rgba(200,145,58,.55)' : OUTSIDE.has(q.type) ? 'rgba(237,232,223,.08)' : 'rgba(237,232,223,.16)';
      g.strokeStyle = 'rgba(237,232,223,.7)'; g.lineWidth = devicePixelRatio;
      const X = ox + (q.x - x0) * s, Z = oz + (q.z - z0) * s;
      g.fillRect(X, Z, q.w * s, q.d * s); g.strokeRect(X, Z, q.w * s, q.d * s);
    });
    const p = camera.position;
    g.fillStyle = '#ede8df'; g.beginPath(); g.arc(ox + (p.x - x0) * s, oz + (p.z - z0) * s, 4 * devicePixelRatio, 0, 7); g.fill();
    g.strokeStyle = '#ede8df'; g.beginPath(); g.moveTo(ox + (p.x - x0) * s, oz + (p.z - z0) * s); g.lineTo(ox + (p.x - x0 + Math.sin(look.yaw) * 1.2) * s, oz + (p.z - z0 + Math.cos(look.yaw) * 1.2) * s); g.stroke();
    if (data.single) ui.walk.querySelectorAll('[data-wfloor]').forEach(b => b.classList.toggle('on', +b.dataset.wfloor === walk.floor));
  }
  ui.plan.addEventListener('click', ev => {
    const c = ui.plan, m = c._map; if (!m || !walk) return;
    const r = c.getBoundingClientRect(), X = (ev.clientX - r.left) * devicePixelRatio, Z = (ev.clientY - r.top) * devicePixelRatio;
    const x = m.x0 + (X - m.ox) / m.s, z = m.z0 + (Z - m.oz) / m.s;
    const q = m.rs.find(q => x > q.x && x < q.x + q.w && z > q.z && z < q.z + q.d);
    if (q && q.w * q.d > 1.5) moveTo(q, walk.floor); poke();
  });
  ui.walk.querySelector('[data-exit]').addEventListener('click', () => { exitWalk(true); poke(); });
  ui.walk.querySelectorAll('[data-wfloor]').forEach(b => b.addEventListener('click', () => {
    const fi = +b.dataset.wfloor; const q = data.floors[fi].rooms.find(r => r.type === 'hall') || data.floors[fi].rooms[0];
    moveTo(q, fi); poke();
  }));
  ui.walk.querySelector('[data-book]')?.addEventListener('click', openModal);

  // ---------- pointer ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null, lastMove = 0;
  function pick(ev, list) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(list, false)[0];
  }
  canvas.addEventListener('pointerdown', ev => {
    down = { x: ev.clientX, y: ev.clientY, t: performance.now(), yaw: look.yaw, pitch: look.pitch };
    if (walk) canvas.setPointerCapture(ev.pointerId);
    poke();
  });
  canvas.addEventListener('pointermove', ev => {
    if (walk && down) {
      look.yaw = down.yaw - (ev.clientX - down.x) * .005; look.pitch = clamp(down.pitch - (ev.clientY - down.y) * .004, -1.1, 1.1);
      dirty = true; drawPlan(); return;
    }
    if (touch || walk) return;
    const now = performance.now(); if (now - lastMove < 40) return; lastMove = now;
    hoverAt(ev);
  });
  canvas.addEventListener('pointerup', ev => {
    const d = down; down = null; if (!d) return;
    if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 6 || performance.now() - d.t > 500) return;
    clickAt(ev); poke();
  });
  canvas.addEventListener('pointerleave', () => { hoverGroup.clear(); canvas.style.cursor = ''; dirty = true; });
  function hoverAt(ev) {
    hoverGroup.clear(); let cur = '';
    if (openIdx < 0) {
      const h = pick(ev, floorPick);
      if (h) { const i = h.object.userData.floor; const fl = data.floors[i]; paint(hoverGroup, hoverMat, i, fl.rooms.filter(q => q.type !== 'core')); hoverGroup.position.y = i * data.floorH + floors[i].userData.lift; cur = 'pointer'; tip(ev, fl.label + (status[i] ? ` · ${status[i].Available} available` : '')); }
      else tip();
    } else {
      const h = pick(ev, roomPick[openIdx]);
      if (h) {
        const q = h.object.userData.room;
        const rs = data.single ? [q] : data.floors[openIdx].rooms.filter(r => r.unit === q.unit);
        paint(hoverGroup, hoverMat, openIdx, rs); hoverGroup.position.y = openIdx * data.floorH; cur = 'pointer';
        tip(ev, data.single ? q.name : `${q.unit} · ${data.units[q.unit].beds} bed · ${data.units[q.unit].status === 'Available' ? data.units[q.unit].price : data.units[q.unit].status}`);
      } else tip();
    }
    canvas.style.cursor = cur; dirty = true;
  }
  const tipEl = $('[data-tip]');
  function tip(ev, text) { if (!ev || !text) { tipEl.hidden = true; return; } tipEl.hidden = false; tipEl.textContent = text; const r = root.getBoundingClientRect(); tipEl.style.transform = `translate(${ev.clientX - r.left + 14}px, ${ev.clientY - r.top + 14}px)`; }
  function clickAt(ev) {
    if (walk) {
      const h = pick(ev, roomPick[walk.floor]);
      if (h) { const q = h.object.userData.room; if (data.single || q.unit === walk.unit) moveTo(q, walk.floor); }
      return;
    }
    if (openIdx < 0) { const h = pick(ev, floorPick); if (h) openFloor(data.single ? (data.floors.length - 1) : h.object.userData.floor); return; }
    const h = pick(ev, roomPick[openIdx]);
    if (!h) return;
    const q = h.object.userData.room;
    if (data.single) selectRoom(q, openIdx); else if (q.unit) selectUnit(data.units[q.unit]);
  }
  addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { if (ui.modal && !ui.modal.hidden) return closeModal(); if (walk) return exitWalk(true); if (openIdx >= 0) return closeFloors(); }
    if (walk) keys[ev.key.toLowerCase()] = true;
  });
  addEventListener('keyup', ev => { keys[ev.key.toLowerCase()] = false; });
  const keys = {};

  // tabs: camera viewpoints
  ui.tabs?.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.view; ui.tabs.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    if (walk) exitWalk(false);
    if (v === 'homes') closeFloors();
    if (v === 'roof') { openIdx = -1; setLifts(-1); showCard(buildingCard()); flyTo(new THREE.Vector3(plate.cx - 22, topY + 18, plate.cz + 26), new THREE.Vector3(plate.cx, topY, plate.cz), 1.3, 40); }
    if (v === 'street') { openIdx = -1; setLifts(-1); const s = data.site.kind === 'canal' ? 1 : data.site.kind === 'city' ? 1 : -1; flyTo(new THREE.Vector3(plate.cx + plate.w * .55, 1.7, plate.cz + s * (plate.d / 2 + (data.site.kind === 'canal' ? 6.5 : data.site.kind === 'suburb' ? 9 : 24))), new THREE.Vector3(plate.cx, Math.min(topY * .45, 14), plate.cz), 1.4, 55); }
    if (v === 'sky') { openIdx = -1; setLifts(-1); flyTo(new THREE.Vector3(plate.cx - 160, topY * 1.6 + 40, plate.cz + 190), new THREE.Vector3(plate.cx, topY * .5, plate.cz), 1.4, 40); }
    if (v === 'garden') { openIdx = -1; setLifts(-1); flyTo(new THREE.Vector3(plate.cx + 4, 1.7, plate.cz + plate.d / 2 + 17), new THREE.Vector3(plate.cx, 3, plate.cz), 1.4, 55); }
    poke();
  }));

  // booking modal (demo)
  function openModal() { ui.modal.hidden = false; ui.modal.querySelector('button, a').focus(); }
  function closeModal() { ui.modal.hidden = true; }
  ui.modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal));
  ui.modal.addEventListener('click', ev => { if (ev.target === ui.modal) closeModal(); });

  let hintT = 0;
  function hint(t) { ui.hint.textContent = t; ui.hint.classList.add('show'); clearTimeout(hintT); hintT = setTimeout(() => ui.hint.classList.remove('show'), 5200); }

  // ---------- loop ----------
  let dirty = true, idleAt = performance.now(), last = performance.now();
  function poke() { idleAt = performance.now(); dirty = true; }
  controls.addEventListener('change', () => { dirty = true; });
  controls.addEventListener('start', poke);
  function resize() {
    const r = root.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height;
    frame(r);
    dirty = true;
    if (walk) drawPlan();
  }
  // on phones the details sheet covers the lower half, so the view is shifted to centre things higher up
  function frame(r = root.getBoundingClientRect()) {
    if (r.width < 760 && !walk) camera.setViewOffset(r.width, r.height * 1.3, 0, r.height * .3, r.width, r.height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(root); resize();
  setTime(hour);
  const fwd = new THREE.Vector3();
  function tick(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (document.hidden) return requestAnimationFrame(tick);
    // floors lifting
    [...floors, roof].forEach(g => {
      const u = g.userData; const diff = u.liftTo - u.lift;
      if (Math.abs(diff) > .005) { u.lift += diff * Math.min(1, dt * (reduce ? 60 : 5)); g.position.y = (g === roof ? topY : u.index * data.floorH) + u.lift; dirty = true; }
    });
    if (fly) {
      const t = clamp((now - fly.s) / fly.d, 0, 1), k = ease(t);
      camera.position.lerpVectors(fly.p0, fly.p1, k); controls.target.lerpVectors(fly.t0, fly.t1, k);
      if (fly.f1 !== fly.f0) { camera.fov = fly.f0 + (fly.f1 - fly.f0) * k; camera.updateProjectionMatrix(); }
      if (!walk) camera.lookAt(controls.target);
      else { camera.lookAt(controls.target); }
      if (t >= 1) { fly = null; if (walk) walk.entering = false; }
      dirty = true;
    } else if (walk) {
      if (walk.to) {
        const t = clamp((now - walk.t) / (reduce ? 1 : 900), 0, 1);
        camera.position.lerpVectors(walk.from, walk.to, ease(t)); if (t >= 1) walk.to = null; dirty = true; drawPlan();
      }
      const sp = 2.4 * dt; fwd.set(Math.sin(look.yaw), 0, Math.cos(look.yaw));
      let mv = 0;
      if (keys.w || keys.arrowup) { camera.position.addScaledVector(fwd, sp); mv = 1; }
      if (keys.s || keys.arrowdown) { camera.position.addScaledVector(fwd, -sp); mv = 1; }
      if (keys.a || keys.arrowleft) { camera.position.add(new THREE.Vector3(fwd.z, 0, -fwd.x).multiplyScalar(sp)); mv = 1; }
      if (keys.d || keys.arrowright) { camera.position.add(new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(sp)); mv = 1; }
      if (mv) {
        const p = camera.position; p.x = clamp(p.x, plate.x0 + .3, plate.x1 - .3); p.z = clamp(p.z, plate.z0 - 1.2, plate.z1 + 1.2);
        const q = data.floors[walk.floor].rooms.find(r => p.x > r.x && p.x < r.x + r.w && p.z > r.z && p.z < r.z + r.d);
        if (q && q !== walk.room && (data.single || q.unit === walk.unit)) { walk.room = q; ui.walk.querySelector('[data-where]').textContent = q.name; }
        drawPlan(); dirty = true;
      }
      const dir = new THREE.Vector3(Math.sin(look.yaw) * Math.cos(look.pitch), Math.sin(look.pitch), Math.cos(look.yaw) * Math.cos(look.pitch));
      camera.lookAt(camera.position.clone().add(dir));
    } else {
      controls.autoRotate = !reduce && openIdx < 0 && now - idleAt > 7000;
      controls.autoRotateSpeed = .35;
      if (controls.update()) dirty = true;
      if (controls.autoRotate) dirty = true;
    }
    if (dirty) { renderer.render(scene, camera); dirty = false; }
    requestAnimationFrame(tick);
  }
  // first view: fly in from far away
  setLifts(-1);
  showCard(data.single ? houseCard() : buildingCard());
  allBtn.classList.add('on');
  requestAnimationFrame(t => { last = t; ui.loader && ui.loader.classList.add('done'); flyTo(p0, t0, 2.2); hint(data.single ? 'Tap the house to look inside.' : 'Tap a floor of the building to open it.'); tick(t); });

  // test handle
  window.__rv = { openFloor, closeFloors, selectUnit: id => selectUnit(data.units[id]), enterWalk: (fi, id) => enterWalk(fi, data.floors[fi].rooms.find(q => q.id === id)), setTime: h => { ui.slider.value = h; setTime(h); }, view: v => ui.tabs.querySelector(`[data-view="${v}"]`).click(), info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries }), settled: () => !fly && !(walk && walk.to) && [...floors, roof].every(g => Math.abs(g.userData.liftTo - g.userData.lift) < .01) };
}
