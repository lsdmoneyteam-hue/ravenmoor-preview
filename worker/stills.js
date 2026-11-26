// The finished off-plan pictures (photoreal stills made from the 3D model frames) are served at /offplan/img2/<name>.webp
// from Ravenmoor's own Cloudflare storage (the KV store bound as STILLS).
// Filling the store is a one-off: the pictures were made in Ravenmoor's Higgsfield account and packed there into one plain
// .tar file. The first time a picture is asked for and the store is empty, the pack is fetched once and every picture in it
// is saved to STILLS. From then on everything comes from Cloudflare and the pack is never fetched again.
// If anything goes wrong, or a name is not in the store, the earlier picture from /offplan/img/ is served instead.

const PACK = 'https://d2ol7oe51mr4n9.cloudfront.net/user_3KYm4CUx2KmRR6KYMbDFJRWRKcU/d5ba50ea-2484-4953-b03f-8692da4c2ba2.tar';
const PACK_MAX = 40 * 1024 * 1024;          // the pack is 12 MB; never read more than this into memory
const LONG = 'public, max-age=31536000, immutable';

// A tar file is a row of 512-byte headers (name at 0, size in octal at 124), each followed by its file padded to 512.
function cut(pack, want) {
  const b = new Uint8Array(pack), dec = new TextDecoder(), out = [];          // want === null: return every picture
  for (let at = 0; at + 512 <= b.length;) {
    let end = at; while (end < at + 100 && b[end] !== 0) end++;
    if (end === at) break;          // the empty block that ends a tar
    const name = dec.decode(b.subarray(at, end));
    const size = parseInt(dec.decode(b.subarray(at + 124, at + 136)).replace(/\0/g, '').trim() || '0', 8);
    if (!Number.isFinite(size) || size < 0 || at + 512 + size > b.length) break;
    if (want === null) { if (/^[a-z0-9-]{1,40}\.webp$/.test(name) && size > 12) out.push([name, pack.slice(at + 512, at + 512 + size)]); }
    else if (name === want) return pack.slice(at + 512, at + 512 + size);
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return want === null ? out : null;
}

const isWebp = (buf) => { if (!buf || buf.byteLength <= 12) return false; const h = new Uint8Array(buf, 0, 12); return h[0] === 0x52 && h[1] === 0x49 && h[8] === 0x57 && h[9] === 0x45; };   // 'RIFF....WEBP'

export async function still(request, env, ctx, url) {
  const m = /^\/offplan\/img2\/([a-z0-9-]{1,40})\.webp$/.exec(url.pathname);
  const earlier = () => env.ASSETS.fetch(new Request(new URL(m ? `/offplan/img/${m[1]}.webp` : '/offplan/img/none.webp', url), { method: request.method }));
  if (!m || !env.STILLS || (request.method !== 'GET' && request.method !== 'HEAD')) return earlier();
  const cache = caches.default, key = new Request(url.origin + url.pathname);
  const hit = await cache.match(key);
  if (hit) return request.method === 'HEAD' ? new Response(null, hit) : hit;
  try {
    const name = m[1] + '.webp';
    let pic = await env.STILLS.get(name, { type: 'arrayBuffer' });
    if (!pic && !(await env.STILLS.get('__filled_v1'))) {
      // one-off: bring the pack into Cloudflare
      const res = await fetch(PACK);
      if (!res.ok || Number(res.headers.get('content-length') || 0) > PACK_MAX) return earlier();
      const all = cut(await res.arrayBuffer(), null).filter(([, buf]) => isWebp(buf));
      if (!all.length) return earlier();
      const found = all.find(([n]) => n === name); pic = found ? found[1] : null;
      ctx.waitUntil((async () => { for (const [n, buf] of all) await env.STILLS.put(n, buf); await env.STILLS.put('__filled_v1', String(all.length)); })());
    }
    if (!isWebp(pic)) return earlier();
    const out = new Response(pic, { headers: { 'content-type': 'image/webp', 'content-length': String(pic.byteLength), 'cache-control': LONG, 'x-content-type-options': 'nosniff' } });
    ctx.waitUntil(cache.put(key, out.clone()));
    return request.method === 'HEAD' ? new Response(null, out) : out;
  } catch (err) {
    return earlier();
  }
}
