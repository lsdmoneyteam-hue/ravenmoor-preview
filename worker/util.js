// Small shared helpers.

// Control characters and the two Unicode line separators.
const CONTROL = new RegExp('[\\u0000-\\u001F\\u007F\\u2028\\u2029]+', 'g');

export function json(data, status = 200, extra) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...(extra || {}) },
  });
}

export function text(body, status = 200, extra) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...(extra || {}) },
  });
}

// Read at most `max` bytes of a request body. null means it was larger.
export async function readCapped(request, max) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}

// One line of plain text: no control characters, single spaces, trimmed, capped.
export function clean(value, cap) {
  if (typeof value !== 'string') return '';
  return value.slice(0, cap).replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
}

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function hostOf(origin) {
  try { return new URL(origin).host; } catch { return ''; }
}

export function errText(err) {
  return String((err && err.message) || err).slice(0, 300);
}

export function log(level, msg, data) {
  const line = JSON.stringify({ level, msg, ...(data || {}) });
  if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.log(line);
}

export function hex(buf) {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomHex(bytes) {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(str) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)));
}

// Compare two strings without leaking where they differ.
export async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(a))),
    crypto.subtle.digest('SHA-256', enc.encode(String(b))),
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

// Calendar day in UK time, YYYY-MM-DD. `offsetDays` -1 is yesterday.
const UK_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });
export function ukDay(offsetDays = 0, from = Date.now()) {
  return UK_DAY.format(new Date(from + offsetDays * 86400000));
}

// Only this site's own pages may call the API.
export function sameOrigin(request, url) {
  const origin = request.headers.get('origin');
  return !origin || hostOf(origin) === url.host;
}
