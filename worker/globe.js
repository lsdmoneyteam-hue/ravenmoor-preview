// TEMPORARY (globe preview, November 2026). The finished globe tiles sit in the DROP store as packs
// (put there through drop.js). This cuts one tile out of its pack for the preview page at /globe/.
// For the real site the tiles should live in proper file storage; then this file, its route in index.js
// and the "/globe/t/*" line in wrangler.jsonc go, together with drop.js and the DROP store.
//
//   GET /globe/t/<face>/<level>/<x>_<y>.jpg   one 576 px tile
//   GET /globe/t/wisp.jpg                     the fine cloud picture (pack g1_x_wisp, slot 0)
//   GET /globe/t/s_<n>.webp or .jpg           the home page's scroll Earth, cut from the same artwork (pack g1_x_s<n>, slot 0):
//                                             0 upright phones, 1 wide screens, 2 wide screens at half size, 3 cloud wisps
//   anything else under /globe/t/             a static file (tiles.json, clouds.jpg)
//
// Pack layout: 'RMG1', count (u32), count x (offset u32, length u32), then the JPEGs. Length 0 = no tile.
//   g1_b_f<face>                levels 0, 1, 2 of a face (1 + 4 + 16 tiles)
//   g1_c_f<face>_<qx>_<qy>      level 3, a quarter of a face (4 x 4 tiles)
//   g1_s_f<face>_<i>_<j>        one section: level 4 (2 x 2), then level 5 (4 x 4)

import { text } from './util.js';

const TILE = /^\/globe\/t\/([0-5])\/([0-5])\/(\d{1,2})_(\d{1,2})\.jpg$/;
const SCROLL = /^\/globe\/t\/s_([0-3])\.(?:webp|jpg)$/;
const MAGIC = 0x524d4731;

export async function globeTile(request, env) {
  const url = new URL(request.url);
  const wisp = url.pathname === '/globe/t/wisp.jpg';
  const scroll = SCROLL.exec(url.pathname);
  const m = TILE.exec(url.pathname);
  if (!m && !wisp && !scroll) return env.ASSETS.fetch(request);
  if (request.method !== 'GET' && request.method !== 'HEAD') return text('Method not allowed', 405, { allow: 'GET, HEAD' });
  if (!env.DROP) return text('Not found', 404);

  let key, slot;
  if (wisp) {
    key = 'g1_x_wisp.bin';
    slot = 0;
  } else if (scroll) {
    key = `g1_x_s${scroll[1]}.bin`;
    slot = 0;
  } else {
    const f = Number(m[1]), z = Number(m[2]), x = Number(m[3]), y = Number(m[4]), n = 1 << z;
    if (x >= n || y >= n) return text('Not found', 404);
    if (z <= 2) {
      key = `g1_b_f${f}.bin`;
      slot = [0, 1, 5][z] + y * n + x;
    } else if (z === 3) {
      key = `g1_c_f${f}_${x >> 2}_${y >> 2}.bin`;
      slot = (y & 3) * 4 + (x & 3);
    } else {
      const k = z - 3; // a section is 2 tiles across at level 4, 4 at level 5; sections count up from the bottom
      key = `g1_s_f${f}_${x >> k}_${7 - (y >> k)}.bin`;
      slot = z === 4 ? (y & 1) * 2 + (x & 1) : 4 + (y & 3) * 4 + (x & 3);
    }
  }

  // A short cache time on purpose: a pack asked for before it was uploaded would otherwise stay "missing" for an hour.
  const pack = await env.DROP.get(key, { type: 'arrayBuffer', cacheTtl: 300 });
  if (!pack || pack.byteLength < 8) return text('Not found', 404);
  const view = new DataView(pack);
  if (view.getUint32(0) !== MAGIC || slot >= view.getUint32(4, true)) return text('Not found', 404);
  const at = view.getUint32(8 + slot * 8, true), size = view.getUint32(12 + slot * 8, true);
  if (!size || at + size > pack.byteLength) return text('Not found', 404);

  // The picture says what it is in its own first bytes: 'RIFF....WEBP' or a JPEG.
  const head = new Uint8Array(pack, at, Math.min(12, size));
  const webp = head.length === 12 && head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 && head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50;

  return new Response(request.method === 'HEAD' ? null : pack.slice(at, at + size), {
    headers: {
      'content-type': webp ? 'image/webp' : 'image/jpeg',
      'content-length': String(size),
      // The pages add ?v=<version>, so a picture can be kept for a long time.
      'cache-control': 'public, max-age=604800, immutable',
      'x-robots-tag': 'noindex',
      'x-content-type-options': 'nosniff',
    },
  });
}
