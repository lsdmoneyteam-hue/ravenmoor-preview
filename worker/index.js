// Ravenmoor Digital site Worker.
//   POST /api/lead         enquiry form -> D1, Telegram alert, emails
//   GET  /api/tg/register  point the Telegram bot at this site (run once after adding the token)
//   POST /api/tg/hook      Telegram webhook: tells you your chat ID
//   GET  /a/*.mp4          video with byte ranges (static assets alone answer Range with a full 200)
// Everything else is served straight from static assets and never reaches this code.
//
// Secrets (Cloudflare dashboard -> Worker -> Settings -> Variables and Secrets). All optional:
// a missing one switches that feature off, it never breaks the form.
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID   lead alerts
//   RESEND_API_KEY, FROM_EMAIL             emails (FROM_EMAIL like "Ravenmoor Digital <hello@your-domain>")
//   OWNER_EMAIL                            where the "new lead" email goes
//   COMPANY_LINE                           company name, number and registered office for email footers

import MEDIA from './media.json';

const LIMITS = { name: 80, agency: 120, email: 160, phone: 40, listing: 600, style: 40, ref: 60 };
const MAX_BODY = 8 * 1024;
const PER_EMAIL_PER_HOUR = 3;
const GLOBAL_PER_HOUR = 40;
const MEDIA_CACHE = 'public, max-age=31536000, immutable';
// Control characters and the two Unicode line separators.
const CONTROL = new RegExp('[\\u0000-\\u001F\\u007F\\u2028\\u2029]+', 'g');

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/lead') return await lead(request, env, ctx, url);
      if (url.pathname === '/api/tg/register') return await tgRegister(request, env, url);
      if (url.pathname === '/api/tg/hook') return await tgHook(request, env);
      if (url.pathname.startsWith('/api/')) return json({ ok: false, error: 'not_found' }, 404);
      if (url.pathname.startsWith('/a/') && url.pathname.endsWith('.mp4')) return await media(request, env, ctx, url);
      return env.ASSETS.fetch(request);
    } catch (err) {
      log('error', 'unhandled', { path: url.pathname, error: errText(err) });
      return json({ ok: false, error: 'server' }, 500);
    }
  },
};

/* ---------- enquiry form ---------- */

async function lead(request, env, ctx, url) {
  if (request.method !== 'POST') return json({ ok: false, error: 'method' }, 405, { allow: 'POST' });

  // Only this site's own pages may post here.
  const origin = request.headers.get('origin');
  if (origin && hostOf(origin) !== url.host) return json({ ok: false, error: 'origin' }, 403);
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return json({ ok: false, error: 'type' }, 415);
  }

  const raw = await readCapped(request, MAX_BODY);
  if (raw === null) return json({ ok: false, error: 'too_big' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, error: 'json' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ ok: false, error: 'json' }, 400);

  // Trap field: people never see it, form-filling bots complete it. Answer as if it worked.
  if (clean(body.website, 200)) return json({ ok: true });

  const kind = body.kind === 'plans' ? 'plans' : 'reel';
  const item = {
    kind,
    name: clean(body.name, 400),
    agency: clean(body.agency, 400),
    email: clean(body.email, 400).toLowerCase(),
    phone: clean(body.phone, 400),
    listing: clean(body.listing, 2000),
    style: clean(body.style, 100),
    ref: clean(body.ref, 200).slice(0, LIMITS.ref),
  };
  const bad = validate(item);
  if (bad) return json({ ok: false, error: 'invalid', field: bad }, 422);

  await ensureSchema(env);
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const recent = await env.DB.prepare(
    'SELECT COUNT(*) AS total, SUM(CASE WHEN email = ?1 THEN 1 ELSE 0 END) AS mine FROM leads WHERE created_at > ?2'
  ).bind(item.email, since).first();
  if (recent && Number(recent.mine) >= PER_EMAIL_PER_HOUR) return json({ ok: false, error: 'already' }, 429);
  if (recent && Number(recent.total) >= GLOBAL_PER_HOUR) {
    log('warn', 'lead_flood', { total: Number(recent.total) });
    return json({ ok: false, error: 'busy' }, 429);
  }

  const now = new Date().toISOString();
  const country = (request.cf && typeof request.cf.country === 'string') ? request.cf.country.slice(0, 2) : '';
  const res = await env.DB.prepare(
    'INSERT INTO leads (created_at, kind, name, agency, email, phone, listing, style, ref, country, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)'
  ).bind(now, item.kind, item.name, item.agency, item.email, item.phone, item.listing, item.style, item.ref, country, 'new').run();
  const id = res && res.meta ? res.meta.last_row_id : null;
  log('info', 'lead_saved', { id, kind: item.kind });

  ctx.waitUntil(notify(env, { id, created_at: now, ...item }));
  return json({ ok: true });
}

function validate(v) {
  if (v.name.length < 1 || v.name.length > LIMITS.name) return 'name';
  if (v.agency.length < 1 || v.agency.length > LIMITS.agency) return 'agency';
  if (v.email.length > LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) return 'email';
  const digits = v.phone.replace(/\D/g, '');
  if (v.phone.length > LIMITS.phone || digits.length < 7 || digits.length > 15 || !/^[0-9+()\-.\s]+$/.test(v.phone)) return 'phone';
  if (v.listing.length < 2 || v.listing.length > LIMITS.listing) return 'listing';
  if (v.kind === 'reel') {
    let u;
    try { u = new URL(v.listing); } catch { return 'listing'; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'listing';
  }
  if (v.style && !/^[a-z0-9-]{1,40}$/.test(v.style)) return 'style';
  return '';
}

let schemaReady = null;
function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch([
      env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, agency TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, listing TEXT NOT NULL, style TEXT NOT NULL DEFAULT '', ref TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'new', tg_ok INTEGER, mail_ok INTEGER)"
      ),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS leads_created ON leads (created_at)'),
    ]).catch((err) => { schemaReady = null; throw err; });
  }
  return schemaReady;
}

/* ---------- alerts ---------- */

async function notify(env, item) {
  const [tg, mail] = await Promise.all([
    sendTelegram(env, item).catch((err) => { log('error', 'telegram_failed', { id: item.id, error: errText(err) }); return 0; }),
    sendEmails(env, item).catch((err) => { log('error', 'email_failed', { id: item.id, error: errText(err) }); return 0; }),
  ]);
  if (item.id == null) return;
  try {
    await env.DB.prepare('UPDATE leads SET tg_ok = ?1, mail_ok = ?2 WHERE id = ?3').bind(tg, mail, item.id).run();
  } catch (err) {
    log('error', 'lead_flag_failed', { id: item.id, error: errText(err) });
  }
}

// Returns 1 sent, 0 failed, null not set up.
async function sendTelegram(env, item) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return null;
  const what = item.kind === 'plans' ? 'Plans to life quote' : 'Free sample reel';
  const lines = [
    '\u{1F7E2} <b>New lead' + (item.id != null ? ' #' + item.id : '') + '</b>: ' + esc(item.name) + ', ' + esc(item.agency),
    what + (item.style ? ' · style: ' + esc(item.style) : ''),
    (item.kind === 'plans' ? 'Reference: ' : 'Listing: ') + esc(item.listing),
    'Email: ' + esc(item.email),
    'Phone: ' + esc(item.phone),
  ];
  if (item.ref) lines.push('Personal link: ' + esc(item.ref));
  const r = await tg(env, 'sendMessage', {
    chat_id: env.TELEGRAM_CHAT_ID,
    text: lines.join('\n'),
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });
  if (!r.ok) throw new Error('telegram ' + r.status);
  return 1;
}

async function tg(env, method, payload) {
  const res = await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/' + method, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  return { ok: res.ok && !!(data && data.ok), status: res.status, data };
}

async function sendEmails(env, item) {
  if (!env.RESEND_API_KEY || !env.FROM_EMAIL) return null;
  const first = item.name.split(/\s+/)[0];
  const foot = '\n\nRavenmoor Digital' + (env.COMPANY_LINE ? '\n' + env.COMPANY_LINE : '');
  const thanks = item.kind === 'plans'
    ? "We've got your details and will look at the scheme. We'll come back to you with a quote."
    : "We've got your listing. Within 48 hours you'll have a few reels of it to compare, and one of us will then call to talk you through them.";
  const jobs = [
    resend(env, {
      to: item.email,
      subject: item.kind === 'plans' ? 'Your quote request' : 'Your sample reel request',
      text: 'Hello ' + first + ',\n\n' + thanks + '\n\nIf anything changes, reply to this email.' + foot,
    }),
  ];
  if (env.OWNER_EMAIL) {
    jobs.push(resend(env, {
      to: env.OWNER_EMAIL,
      reply_to: item.email,
      subject: 'New lead' + (item.id != null ? ' #' + item.id : '') + ': ' + item.name + ', ' + item.agency,
      text: [
        item.kind === 'plans' ? 'Plans to life quote' : 'Free sample reel',
        'Name: ' + item.name,
        (item.kind === 'plans' ? 'Company: ' : 'Agency: ') + item.agency,
        'Email: ' + item.email,
        'Phone: ' + item.phone,
        (item.kind === 'plans' ? 'Reference: ' : 'Listing: ') + item.listing,
        'Style: ' + (item.style || 'you choose'),
        item.ref ? 'Personal link: ' + item.ref : '',
        'Sent: ' + item.created_at,
      ].filter(Boolean).join('\n'),
    }));
  }
  const results = await Promise.all(jobs);
  return results.every(Boolean) ? 1 : 0;
}

async function resend(env, msg) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.FROM_EMAIL, to: [msg.to], subject: msg.subject, text: msg.text, reply_to: msg.reply_to }),
  });
  if (!res.ok) log('error', 'resend_rejected', { status: res.status });
  if (res.body) await res.body.cancel();
  return res.ok;
}

/* ---------- Telegram set-up ---------- */

async function hookSecret(env) {
  const data = new TextEncoder().encode('ravenmoor-hook:' + env.TELEGRAM_BOT_TOKEN);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function tgRegister(request, env, url) {
  if (request.method !== 'GET') return text('Method not allowed', 405, { allow: 'GET' });
  if (!env.TELEGRAM_BOT_TOKEN) return text('Add the TELEGRAM_BOT_TOKEN secret in Cloudflare first, then open this page again.', 503);
  const r = await tg(env, 'setWebhook', {
    url: url.origin + '/api/tg/hook',
    secret_token: await hookSecret(env),
    allowed_updates: ['message'],
    drop_pending_updates: true,
  });
  if (!r.ok) {
    log('error', 'tg_register_failed', { status: r.status });
    return text('Telegram refused the request. Check the bot token is right.', 502);
  }
  return text('Done. Your bot is linked to ' + url.host + '. Now open the bot in Telegram and send it any message.', 200);
}

async function tgHook(request, env) {
  if (request.method !== 'POST') return text('Method not allowed', 405, { allow: 'POST' });
  if (!env.TELEGRAM_BOT_TOKEN) return text('Not set up', 503);
  const given = request.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!(await sameSecret(given, await hookSecret(env)))) return text('Forbidden', 403);

  const raw = await readCapped(request, 64 * 1024);
  let update = null;
  try { update = raw ? JSON.parse(raw) : null; } catch { /* ignore */ }
  const msg = update && update.message;
  if (msg && msg.chat && msg.chat.type === 'private') {
    const id = String(msg.chat.id);
    const reply = env.TELEGRAM_CHAT_ID && String(env.TELEGRAM_CHAT_ID) === id
      ? 'This chat is linked. New enquiries from the website will arrive here.'
      : 'Your chat ID is <code>' + esc(id) + '</code>\nAdd it in Cloudflare as the secret TELEGRAM_CHAT_ID and enquiries will arrive here.';
    const r = await tg(env, 'sendMessage', { chat_id: msg.chat.id, text: reply, parse_mode: 'HTML' });
    if (!r.ok) log('error', 'tg_reply_failed', { status: r.status });
  }
  return text('ok', 200);
}

async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

/* ---------- video with byte ranges ---------- */

const warming = new Set();

function edgeCacheOn(env, url) {
  if (env.EDGE_CACHE === 'on') return true;
  if (env.EDGE_CACHE === 'off') return false;
  // The Cache API does nothing on workers.dev or locally, so only use it on the real domain.
  const h = url.hostname;
  return !(h.endsWith('.workers.dev') || h === 'localhost' || h === '127.0.0.1' || h === '[::1]');
}

async function media(request, env, ctx, url) {
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

/* ---------- helpers ---------- */

function json(data, status = 200, extra) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...(extra || {}) },
  });
}

function text(body, status = 200, extra) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...(extra || {}) },
  });
}

// Read at most `max` bytes of a request body. null means it was larger.
async function readCapped(request, max) {
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
function clean(value, cap) {
  if (typeof value !== 'string') return '';
  return value.slice(0, cap).replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function hostOf(origin) {
  try { return new URL(origin).host; } catch { return ''; }
}

function errText(err) {
  return String((err && err.message) || err).slice(0, 300);
}

function log(level, msg, data) {
  const line = JSON.stringify({ level, msg, ...(data || {}) });
  if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.log(line);
}
