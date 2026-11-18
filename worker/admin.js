// Private dashboard at /admin.
// There is no password. The owner sends /dashboard to the Telegram bot and gets a link that
// works once and lasts 15 minutes; opening it sets a signed cookie for 7 days.
// The signing key is derived from the bot token, so there is no extra secret to manage.

import PAGE from './admin.html';
import { ready } from './db.js';
import { json, text, hex, randomHex, sha256Hex, sameSecret, sameOrigin, readCapped, ukDay } from './util.js';
import { statsFor, lastDays, liveNow, journey, journeyLine } from './track.js';

const COOKIE = 'rm_admin';
const SESSION_DAYS = 7;
const LOGIN_MINUTES = 15;
const STATUS = new Set(['new', 'contacted', 'won', 'lost']);

const NO_INDEX = { 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' };

export async function createLogin(env) {
  await ready(env);
  const token = randomHex(32);
  const expires = Math.floor(Date.now() / 1000) + LOGIN_MINUTES * 60;
  await env.DB.prepare('INSERT INTO logins (hash, expires) VALUES (?1, ?2)').bind(await sha256Hex(token), expires).run();
  return token;
}

async function sign(env, value) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ravenmoor-admin:' + env.TELEGRAM_BOT_TOKEN));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

async function signedIn(request, env) {
  if (!env.TELEGRAM_BOT_TOKEN) return false;
  const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=(\\d{1,12})\\.([a-f0-9]{64})(?:;|$)').exec(request.headers.get('cookie') || '');
  if (!m) return false;
  if (Number(m[1]) < Math.floor(Date.now() / 1000)) return false;
  return sameSecret(m[2], await sign(env, m[1]));
}

function cookie(url, value, maxAge) {
  return COOKIE + '=' + value + '; Path=/admin; Max-Age=' + maxAge + '; HttpOnly; SameSite=Lax' + (url.protocol === 'https:' ? '; Secure' : '');
}

function page(body, status = 200, extra) {
  const nonce = randomHex(16);
  return new Response(body.replaceAll('__NONCE__', nonce), {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'nonce-" + nonce + "'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      ...NO_INDEX,
      ...(extra || {}),
    },
  });
}

const SIGNED_OUT = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ravenmoor dashboard</title>' +
  '<style nonce="__NONCE__">body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0E0F11;color:#EDE8DF;font:17px/1.55 system-ui,sans-serif}main{max-width:26rem;padding:24px}h1{font-size:22px;margin:0 0 12px}p{margin:0 0 10px;color:rgba(237,232,223,.74)}code{color:#EDE8DF}</style></head>' +
  '<body><main><h1>Ravenmoor dashboard</h1><p>__MSG__</p><p>Send <code>/dashboard</code> to your Telegram bot and open the link it replies with.</p></main></body></html>';

export async function admin(request, env, ctx, url) {
  const path = url.pathname.replace(/\/+$/, '') || '/admin';
  if (!env.TELEGRAM_BOT_TOKEN) return page(SIGNED_OUT.replace('__MSG__', 'The dashboard switches on once the Telegram bot is set up.'), 503);

  if (path === '/admin/login') return login(request, env, url);
  if (path === '/admin/logout') {
    return new Response(null, { status: 302, headers: { location: '/admin', 'set-cookie': cookie(url, 'x', 0), ...NO_INDEX } });
  }

  const ok = await signedIn(request, env);
  if (path === '/admin') {
    if (request.method !== 'GET') return text('Method not allowed', 405, { allow: 'GET' });
    return ok ? page(PAGE) : page(SIGNED_OUT.replace('__MSG__', 'You are signed out.'), 401);
  }
  if (!ok) return json({ ok: false, error: 'signed_out' }, 401, NO_INDEX);

  await ready(env);
  if (path === '/admin/api/summary' && request.method === 'GET') return json(await summary(env), 200, NO_INDEX);
  if (path === '/admin/api/lead' && request.method === 'GET') return leadView(env, url);
  if (path === '/admin/api/status' && request.method === 'POST') return setStatus(request, env, url);
  return json({ ok: false, error: 'not_found' }, 404, NO_INDEX);
}

async function login(request, env, url) {
  if (request.method !== 'GET') return text('Method not allowed', 405, { allow: 'GET' });
  const token = url.searchParams.get('t') || '';
  const fail = () => page(SIGNED_OUT.replace('__MSG__', 'That link has expired or was already used.'), 401);
  if (!/^[a-f0-9]{64}$/.test(token)) return fail();
  await ready(env);
  const now = Math.floor(Date.now() / 1000);
  // Deleting the row is what "uses" the link, so it can only work once.
  const used = await env.DB.prepare('DELETE FROM logins WHERE hash = ?1 AND expires >= ?2').bind(await sha256Hex(token), now).run();
  if (!used.meta || !used.meta.changes) return fail();
  const exp = String(now + SESSION_DAYS * 86400);
  return new Response(null, {
    status: 302,
    headers: { location: '/admin', 'set-cookie': cookie(url, exp + '.' + (await sign(env, exp)), SESSION_DAYS * 86400), ...NO_INDEX },
  });
}

async function summary(env) {
  const full = await statsFor(env, lastDays(14));
  const days = full.map((s) => ({ day: s.day, visits: s.visits, plays: s.plays, leads: s.leads, form_starts: s.form_starts }));
  const week = { reels: new Map(), exits: new Map(), refs: new Map(), devices: new Map() };
  for (const s of full.slice(0, 7)) {
    for (const k of Object.keys(week)) for (const r of s[k]) week[k].set(r.id, (week[k].get(r.id) || 0) + r.n);
  }
  const top = (m, n) => [...m].map(([id, c]) => ({ id, n: c })).sort((a, b) => b.n - a.n).slice(0, n);
  const [leads, hot] = await env.DB.batch([
    env.DB.prepare('SELECT id, created_at, kind, name, agency, email, phone, listing, style, ref, status, tg_ok, mail_ok, vid FROM leads ORDER BY id DESC LIMIT 60'),
    env.DB.prepare('SELECT vid, visits, last_seen FROM visitors WHERE hot_day >= ?1 AND lead_id IS NULL ORDER BY last_seen DESC LIMIT 10').bind(ukDay(-7)),
  ]);
  const warm = [];
  for (const v of hot.results) warm.push({ who: 'Visitor ' + v.vid.slice(0, 4), last_seen: v.last_seen, journey: journeyLine(await journey(env, v.vid)) });
  return {
    ok: true,
    now: new Date().toISOString(),
    live: await liveNow(env),
    today: days[0],
    days,
    week: { reels: top(week.reels, 10), exits: top(week.exits, 8), refs: top(week.refs, 8), devices: top(week.devices, 3) },
    leads: leads.results.map((l) => ({ ...l, vid: undefined, tracked: !!l.vid })),
    warm,
  };
}

async function leadView(env, url) {
  const id = Number(url.searchParams.get('id'));
  if (!Number.isInteger(id) || id < 1) return json({ ok: false, error: 'invalid' }, 400, NO_INDEX);
  const l = await env.DB.prepare('SELECT * FROM leads WHERE id = ?1').bind(id).first();
  if (!l) return json({ ok: false, error: 'not_found' }, 404, NO_INDEX);
  let j = null, events = [];
  if (l.vid) {
    j = await journey(env, l.vid);
    const r = await env.DB.prepare('SELECT ts, name, detail FROM events WHERE vid = ?1 ORDER BY id DESC LIMIT 120').bind(l.vid).all();
    events = r.results;
  }
  return json({ ok: true, lead: { ...l, vid: undefined }, journey: j, journey_line: journeyLine(j), events }, 200, NO_INDEX);
}

async function setStatus(request, env, url) {
  // A form on another site cannot set this header or pass the origin check.
  if (!sameOrigin(request, url) || request.headers.get('x-rm') !== '1') return json({ ok: false, error: 'origin' }, 403, NO_INDEX);
  const raw = await readCapped(request, 1024);
  let b = null;
  try { b = raw ? JSON.parse(raw) : null; } catch { /* ignore */ }
  const id = b && Number(b.id);
  if (!b || !Number.isInteger(id) || id < 1 || !STATUS.has(b.status)) return json({ ok: false, error: 'invalid' }, 400, NO_INDEX);
  const r = await env.DB.prepare('UPDATE leads SET status = ?1 WHERE id = ?2').bind(b.status, id).run();
  return json({ ok: !!(r.meta && r.meta.changes) }, 200, NO_INDEX);
}
