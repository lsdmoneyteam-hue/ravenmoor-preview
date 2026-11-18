// Video with byte ranges. Static assets alone answer a Range request with a full 200,
// which breaks video on iPhones, so these paths run through the Worker.
import MEDIA from './media.json';
import { text, log, errText } from './util.js';

const MEDIA_CACHE = 'public, max-age=31536000, immutable';

const warming = new Set();

function edgeCacheOn(env, url) {
  if (env.EDGE_CACHE === 'on') return true;
  if (env.EDGE_CACHE === 'off') return false;
  // The Cache API does nothing on workers.dev or locally, so only use it on the real domain.
  const h = url.hostname;
  return !(h.endsWith('.workers.dev') || h === 'localhost' || h === '127.0.0.1' || h === '[::1]');
}

export async function media(request, env, ctx, url) {
  const method = request.method;
  if (method !== 'GET' && method !== 'HEAD') return text('Method not allowed', 405, { allow: 'GET, HEAD' });
  const key = url.origin + url.pathname;
  const range = request.headers.get('range');
  const useCache = edgeCacheOn(env, url);

  // A copy held at the edge is sliced by Cloudflare itself.
  if (method === 'GET' && range && useCache && /^bytes=\d*-\d*$/.test(range.trim())) {
    try {
      const hit = await caches.default.match(new Request(key, { headers: { range } }));
      if (hit) {
        if (hit.status === 206 && hit.headers.get('content-range')) return hit;
        if (hit.body) await hit.body.cancel();
      }
    } catch (err) {
      log('warn', 'media_cache_match', { error: errText(err) });
    }
  }

  let res = await env.ASSETS.fetch(new Request(key, { method }));
  if (res.status !== 200) return res;
  const headers = new Headers(res.headers);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', MEDIA_CACHE);
  if (method === 'HEAD' || !range) {
    return new Response(method === 'HEAD' ? null : res.body, { status: 200, headers });
  }

  // File size: from the response, else the manifest, else by counting (slow, last resort).
  let size = Number(res.headers.get('content-length'));
  if (!Number.isFinite(size) || size <= 0) size = Number(MEDIA[url.pathname.slice(3)]) || 0;
  if (!size) {
    log('warn', 'media_size_unknown', { path: url.pathname });
    size = await countBytes(res.body);
    res = await env.ASSETS.fetch(new Request(key));
    if (res.status !== 200 || !size) return new Response(res.body, { status: res.status, headers });
  }

  const r = parseRange(range, size);
  if (r === undefined) return new Response(res.body, { status: 200, headers }); // multi-range or not bytes: send it all
  if (r === null) {
    if (res.body) await res.body.cancel();
    return new Response(null, { status: 416, headers: { 'content-range': 'bytes */' + size, 'accept-ranges': 'bytes' } });
  }

  if (useCache && !warming.has(key)) {
    warming.add(key);
    ctx.waitUntil(warm(env, key).finally(() => warming.delete(key)));
  }

  const length = r.end - r.start + 1;
  headers.set('content-range', 'bytes ' + r.start + '-' + r.end + '/' + size);
  headers.set('content-length', String(length));
  const out = new FixedLengthStream(length);
  ctx.waitUntil(slice(res.body, r.start, length).pipeTo(out.writable).catch(() => {}));
  return new Response(out.readable, { status: 206, headers });
}

// undefined: ignore the header. null: cannot be satisfied. Otherwise the inclusive byte span.
function parseRange(value, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!m) return undefined;
  const a = m[1], b = m[2];
  if (a === '' && b === '') return null;
  if (a === '') {
    const n = Number(b);
    if (!n) return null;
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(a);
  if (start >= size) return null;
  let end = b === '' ? size - 1 : Number(b);
  if (end < start) return null;
  if (end >= size) end = size - 1;
  return { start, end };
}

async function countBytes(body) {
  if (!body) return 0;
  const reader = body.getReader();
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return total;
    total += value.byteLength;
  }
}

// Pass through `length` bytes starting at `start` without holding the file in memory.
function slice(body, start, length) {
  const reader = body.getReader();
  let skipped = 0, sent = 0;
  return new ReadableStream({
    async pull(controller) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) { controller.close(); return; }
        let chunk = value;
        if (skipped < start) {
          const need = start - skipped;
          if (chunk.byteLength <= need) { skipped += chunk.byteLength; continue; }
          chunk = chunk.subarray(need);
          skipped = start;
        }
        const left = length - sent;
        if (chunk.byteLength >= left) {
          controller.enqueue(chunk.subarray(0, left));
          sent = length;
          controller.close();
          await reader.cancel();
          return;
        }
        controller.enqueue(chunk);
        sent += chunk.byteLength;
        return;
      }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
}

async function warm(env, key) {
  try {
    const full = await env.ASSETS.fetch(new Request(key));
    if (full.status !== 200) { if (full.body) await full.body.cancel(); return; }
    const headers = new Headers(full.headers);
    headers.set('accept-ranges', 'bytes');
    headers.set('cache-control', MEDIA_CACHE);
    await caches.default.put(new Request(key), new Response(full.body, { status: 200, headers }));
  } catch (err) {
    log('warn', 'media_cache_put', { error: errText(err) });
  }
}
