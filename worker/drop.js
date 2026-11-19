// TEMPORARY (globe artwork run, November 2026). Remove this file, its route in index.js and the DROP
// binding in wrangler.jsonc when the globe is finished, then delete the KV namespace.
//
//   PUT /api/drop/<name>.jpg   header x-drop-key: <key>   body: a JPEG up to 3 MB. Kept for 6 hours.
//   GET /api/drop/<name>.jpg   the image.
//   PUT /api/drop/<name>.bin   same key. A pack of finished globe tiles, up to 24 MB. Kept for 30 days.
//                              Not readable here: globe.js cuts single tiles out of it for the preview page.
//
// The guide images for the globe are composed where the finished art lives and have to be handed to the
// image generator as files it can fetch. This is that hand-over point, and the way the finished tiles
// reach the preview page. Only the hash of the key is here.

import { json } from './util.js';

const KEY_SHA256 = '71f72e49dabdadbd8a1440cc4a1287faf7481f092c003dbc56a31a4461916fb5';
const KINDS = {
  jpg: { max: 3 * 1024 * 1024, keep: 6 * 3600, magic: [0xff, 0xd8, 0xff], readable: true },
  bin: { max: 24 * 1024 * 1024, keep: 30 * 24 * 3600, magic: [0x52, 0x4d, 0x47, 0x31], readable: false }, // 'RMG1'
};

export async function drop(request, env, url) {
  if (!env.DROP) return json({ ok: false, error: 'off' }, 503);
  const name = url.pathname.slice('/api/drop/'.length);
  const m = /^[A-Za-z0-9_]{1,48}\.(jpg|bin)$/.exec(name);
  if (!m) return json({ ok: false, error: 'name' }, 400);
  const kind = KINDS[m[1]];

  if (request.method === 'GET' || request.method === 'HEAD') {
    if (!kind.readable) return json({ ok: false, error: 'not_found' }, 404);
    const body = await env.DROP.get(name, { type: 'arrayBuffer', cacheTtl: 30 });
    if (!body) return json({ ok: false, error: 'not_found' }, 404);
    return new Response(request.method === 'HEAD' ? null : body, {
      headers: {
        'content-type': 'image/jpeg',
        'content-length': String(body.byteLength),
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  if (request.method !== 'PUT') return json({ ok: false, error: 'method' }, 405, { allow: 'GET, HEAD, PUT' });
  if (!(await keyOk(request.headers.get('x-drop-key') || ''))) return json({ ok: false, error: 'key' }, 403);
  const declared = Number(request.headers.get('content-length'));
  if (!Number.isFinite(declared) || declared < 1000 || declared > kind.max) return json({ ok: false, error: 'size' }, 413);
  const body = await request.arrayBuffer();
  if (body.byteLength > kind.max) return json({ ok: false, error: 'size' }, 413);
  const head = new Uint8Array(body, 0, kind.magic.length);
  if (!kind.magic.every((b, i) => head[i] === b)) return json({ ok: false, error: 'type' }, 415);
  await env.DROP.put(name, body, { expirationTtl: kind.keep });
  return json({ ok: true, name, bytes: body.byteLength });
}

// Compare hashes, in constant time, so the key itself never has to be stored.
async function keyOk(given) {
  const enc = new TextEncoder();
  const got = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(given)));
  const want = new Uint8Array(KEY_SHA256.match(/../g).map((h) => parseInt(h, 16)));
  return crypto.subtle.timingSafeEqual(got, want);
}
