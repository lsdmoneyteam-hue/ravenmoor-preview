// TEMPORARY (globe artwork run, November 2026). Remove this file, its route in index.js and the DROP
// binding in wrangler.jsonc when the globe is finished, then delete the KV namespace.
//
//   PUT /api/drop/<name>.jpg   header x-drop-key: <key>   body: a JPEG up to 3 MB. Kept for 6 hours.
//   GET /api/drop/<name>.jpg   the image.
//
// The guide images for the globe are composed where the finished art lives and have to be handed to the
// image generator as files it can fetch. This is that hand-over point. Only the hash of the key is here.

import { json } from './util.js';

const KEY_SHA256 = '71f72e49dabdadbd8a1440cc4a1287faf7481f092c003dbc56a31a4461916fb5';
const MAX_BYTES = 3 * 1024 * 1024;
const KEEP_SECONDS = 6 * 3600;

export async function drop(request, env, url) {
  if (!env.DROP) return json({ ok: false, error: 'off' }, 503);
  const name = url.pathname.slice('/api/drop/'.length);
  if (!/^[A-Za-z0-9_]{1,48}\.jpg$/.test(name)) return json({ ok: false, error: 'name' }, 400);

  if (request.method === 'GET' || request.method === 'HEAD') {
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
  if (!Number.isFinite(declared) || declared < 1000 || declared > MAX_BYTES) return json({ ok: false, error: 'size' }, 413);
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return json({ ok: false, error: 'size' }, 413);
  const head = new Uint8Array(body, 0, 3);
  if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) return json({ ok: false, error: 'type' }, 415);
  await env.DROP.put(name, body, { expirationTtl: KEEP_SECONDS });
  return json({ ok: true, name, bytes: body.byteLength });
}

// Compare hashes, in constant time, so the key itself never has to be stored.
async function keyOk(given) {
  const enc = new TextEncoder();
  const got = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(given)));
  const want = new Uint8Array(KEY_SHA256.match(/../g).map((h) => parseInt(h, 16)));
  return crypto.subtle.timingSafeEqual(got, want);
}
