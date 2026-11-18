// Site tracking, in three levels.
//   1. Everyone: anonymous daily totals (table `counts`). No visitor ID, nothing stored in the browser.
//   2. People who press Accept: a random ID kept in their browser, and what that browser did
//      on this site (tables `visitors`, `events`).
//   3. People who send the form: their level 2 history is linked to the enquiry.
// Live view (table `presence`): one short-lived row per open page, keyed by an ID that exists
// only in that page's memory. It is never stored in the browser and is dropped after a few minutes.
// No IP address or user agent is stored at any level.

import { ready } from './db.js';
import { clean, log, errText, readCapped, sameOrigin, ukDay, esc } from './util.js';

const MAX_BODY = 6 * 1024;
const MAX_EVENTS = 40;
const NAME = /^[a-z0-9][a-z0-9:_-]{0,47}$/;
const HEX16 = /^[a-f0-9]{16}$/;
const HEX32 = /^[a-f0-9]{32}$/;
const DEVICES = new Set(['phone', 'tablet', 'desktop']);
const COUNTED = ['visit', 'lead', 'section:', 'click:', 'exit:'];
const LIVE_WINDOW = 90;       // seconds a page counts as "on the site now" after its last signal
const SESSION_GAP = 30 * 60;  // seconds of quiet before a return counts as a new visit

export const SECTION_NAMES = {
  hero: 'the film', proof: 'Why video', how: 'How it works', styles: 'Styles', before: 'Before and after',
  plans: 'Plans to life', presenter: 'Presenter', prices: 'Prices', sample: 'the form', footer: 'the footer',
};

export function sectionName(id) {
  return SECTION_NAMES[id] || id || 'the top';
}

export async function collect(request, env, ctx, url) {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  if (!sameOrigin(request, url)) return new Response(null, { status: 403 });
  const raw = await readCapped(request, MAX_BODY);
  if (!raw) return new Response(null, { status: raw === null ? 413 : 400 });
  let b;
  try { b = JSON.parse(raw); } catch { return new Response(null, { status: 400 }); }
  if (!b || typeof b !== 'object' || !HEX16.test(b.p || '')) return new Response(null, { status: 400 });

  const batch = {
    pid: b.p,
    vid: HEX32.test(b.v || '') ? b.v : '',
    device: DEVICES.has(b.d) ? b.d : '',
    section: NAME.test(b.s || '') ? b.s : '',
    fresh: b.n === 1,
    ref: refHost(b.r, url.hostname),
    events: [],
  };
  if (Array.isArray(b.e)) {
    for (const e of b.e.slice(0, MAX_EVENTS)) {
      if (!Array.isArray(e) || typeof e[0] !== 'string' || !NAME.test(e[0])) continue;
      batch.events.push({ name: e[0], detail: clean(e[1] == null ? '' : String(e[1]), 60) });
    }
  }
  // Answer straight away; the writes finish in the background.
  ctx.waitUntil(store(env, url, batch).catch((err) => log('error', 'track_store', { error: errText(err) })));
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}

function refHost(value, own) {
  if (typeof value !== 'string' || !value) return '';
  const h = value.toLowerCase().replace(/^www\./, '').slice(0, 60);
  if (!/^[a-z0-9.-]+$/.test(h) || h === own.replace(/^www\./, '')) return '';
  return h;
}

async function store(env, url, b) {
  await ready(env);
  const db = env.DB;
  const now = Date.now();
  const nowS = Math.floor(now / 1000);
  const iso = new Date(now).toISOString();
  const day = ukDay(0, now);
  const stmts = [];

  // Level 1: anonymous totals.
  const tally = new Map();
  const bump = (k) => tally.set(k, (tally.get(k) || 0) + 1);
  if (b.fresh) {
    bump('visit');
    if (b.device) bump('device:' + b.device);
    bump('ref:' + (b.ref || 'direct'));
  }
  for (const e of b.events) {
    if (COUNTED.some((p) => (p.endsWith(':') ? e.name.startsWith(p) : e.name === p))) bump(e.name);
  }
  for (const [key, n] of tally) {
    stmts.push(db.prepare('INSERT INTO counts (day, key, n) VALUES (?1, ?2, ?3) ON CONFLICT(day, key) DO UPDATE SET n = n + excluded.n').bind(day, key.slice(0, 80), n));
  }

  // Live view.
  stmts.push(db.prepare(
    "INSERT INTO presence (pid, vid, seen, section, device) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(pid) DO UPDATE SET vid = excluded.vid, seen = excluded.seen, section = CASE WHEN excluded.section = '' THEN presence.section ELSE excluded.section END"
  ).bind(b.pid, b.vid, nowS, b.section, b.device));
  if (Math.random() < 0.05) stmts.push(db.prepare('DELETE FROM presence WHERE seen < ?1').bind(nowS - 600));

  // Level 2: only for a browser that accepted.
  if (b.vid) {
    const cutoff = new Date(now - SESSION_GAP * 1000).toISOString();
    stmts.push(db.prepare(
      'INSERT INTO visitors (vid, first_seen, last_seen, visits, device, ref) VALUES (?1, ?2, ?2, 1, ?3, ?4) ' +
      'ON CONFLICT(vid) DO UPDATE SET visits = visits + (CASE WHEN ?5 = 1 AND last_seen < ?6 THEN 1 ELSE 0 END), last_seen = ?2'
    ).bind(b.vid, iso, b.device, b.ref, b.fresh ? 1 : 0, cutoff));
    for (const e of b.events) {
      stmts.push(db.prepare('INSERT INTO events (ts, vid, sid, name, detail) VALUES (?1, ?2, ?3, ?4, ?5)').bind(iso, b.vid, b.pid, e.name, e.detail));
    }
  }
  await db.batch(stmts);

  if (b.vid && b.events.some((e) => e.name === 'section:prices' || e.name === 'dwell:prices' || e.name.startsWith('click:style-card:'))) {
    await maybeHot(env, b, day);
  }
}

/* ---------- journeys ---------- */

// What one accepted browser has done in the last 14 days.
export async function journey(env, vid) {
  if (!HEX32.test(vid || '')) return null;
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const [v, agg, cards] = await env.DB.batch([
    env.DB.prepare('SELECT visits, first_seen, last_seen, device, ref, hot_day, lead_id FROM visitors WHERE vid = ?1').bind(vid),
    env.DB.prepare(
      "SELECT SUM(CASE WHEN name = 'section:prices' THEN 1 ELSE 0 END) AS prices, " +
      "SUM(CASE WHEN name = 'dwell:prices' THEN CAST(detail AS INTEGER) ELSE 0 END) AS price_secs, " +
      "SUM(CASE WHEN name = 'click:form-start' THEN 1 ELSE 0 END) AS started " +
      'FROM events WHERE vid = ?1 AND ts > ?2'
    ).bind(vid, since),
    env.DB.prepare("SELECT DISTINCT substr(name, 18) AS id FROM events WHERE vid = ?1 AND ts > ?2 AND name LIKE 'click:style-card:%' LIMIT 12").bind(vid, since),
  ]);
  const row = v.results[0];
  if (!row) return null;
  const a = agg.results[0] || {};
  return {
    visits: Number(row.visits) || 1,
    first_seen: row.first_seen,
    last_seen: row.last_seen,
    device: row.device,
    ref: row.ref,
    hot_day: row.hot_day,
    lead_id: row.lead_id,
    reels: cards.results.map((r) => r.id),
    reached_prices: Number(a.prices) > 0,
    price_secs: Math.min(Number(a.price_secs) || 0, 3600),
    started_form: Number(a.started) > 0,
  };
}

// One plain sentence for an alert.
export function journeyLine(j) {
  if (!j) return '';
  const parts = [];
  parts.push(j.visits > 1 ? 'visit ' + j.visits : 'first visit');
  if (j.reels.length) parts.push('opened ' + j.reels.length + (j.reels.length === 1 ? ' reel' : ' reels') + ' (' + j.reels.slice(0, 4).join(', ') + ')');
  if (j.price_secs >= 5) parts.push(j.price_secs + 's on prices');
  else if (j.reached_prices) parts.push('looked at prices');
  return parts.join(', ');
}

async function maybeHot(env, b, day) {
  const j = await journey(env, b.vid);
  if (!j || j.lead_id || j.hot_day === day) return;
  const hot = (j.visits >= 2 && j.reached_prices) || (j.reels.length >= 2 && j.price_secs >= 20);
  if (!hot) return;
  // Claim today's alert first so two requests cannot both send it.
  const claim = await env.DB.prepare("UPDATE visitors SET hot_day = ?1 WHERE vid = ?2 AND hot_day <> ?1").bind(day, b.vid).run();
  if (!claim.meta || !claim.meta.changes) return;
  const { sendOwner } = await import('./telegram.js');
  const lines = [
    '\u{1F525} <b>Hot visitor</b> (accepted tracking)',
    esc(cap(journeyLine(j))) + '.',
    'On ' + esc(sectionName(b.section)) + ' now' + (j.started_form ? '. Has started the form.' : ". Hasn't started the form."),
  ];
  await sendOwner(env, lines.join('\n'));
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/* ---------- numbers for the digest, the bot and the dashboard ---------- */

// Totals for a list of UK days (newest first), from two queries however many days are asked for.
export async function statsFor(env, dayList) {
  const oldest = dayList[dayList.length - 1];
  const [c, l] = await env.DB.batch([
    env.DB.prepare('SELECT day, key, n FROM counts WHERE day >= ?1 AND day <= ?2').bind(oldest, dayList[0]),
    env.DB.prepare('SELECT created_at FROM leads WHERE created_at >= ?1').bind(ukDayBounds(oldest)[0]),
  ]);
  const perDay = new Map(dayList.map((d) => [d, new Map()]));
  for (const r of c.results) {
    const m = perDay.get(r.day);
    if (m) m.set(r.key, Number(r.n));
  }
  const leadCount = new Map();
  for (const r of l.results) {
    const d = ukDay(0, Date.parse(r.created_at));
    leadCount.set(d, (leadCount.get(d) || 0) + 1);
  }
  return dayList.map((day) => {
    const m = perDay.get(day);
    const top = (prefix) => [...m].filter(([k]) => k.startsWith(prefix)).map(([k, n]) => ({ id: k.slice(prefix.length), n })).sort((x, y) => y.n - x.n);
    const reels = top('click:style-card:');
    return {
      day,
      visits: m.get('visit') || 0,
      plays: reels.reduce((sum, r) => sum + r.n, 0),
      leads: leadCount.get(day) || 0,
      form_starts: m.get('click:form-start') || 0,
      reels,
      exits: top('exit:'),
      refs: top('ref:'),
      devices: top('device:'),
      reached: top('section:'),
    };
  });
}

export async function dayStats(env, day) {
  return (await statsFor(env, [day]))[0];
}

export function lastDays(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(ukDay(-i));
  return out;
}

// The UTC instants that bound one UK calendar day.
export function ukDayBounds(day) {
  const start = ukMidnight(day);
  const next = new Date(Date.parse(day + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
  return [start.toISOString(), ukMidnight(next).toISOString()];
}

function ukMidnight(day) {
  // UK time is UTC or UTC+1, so local midnight is 00:00 or 23:00 UTC the day before.
  const utc = Date.parse(day + 'T00:00:00Z');
  return new Date(ukDay(0, utc - 3600000) === day ? utc - 3600000 : utc);
}

export async function liveNow(env) {
  const since = Math.floor(Date.now() / 1000) - LIVE_WINDOW;
  const r = await env.DB.prepare(
    'SELECT p.pid, p.vid, p.seen, p.section, p.device, v.visits, v.lead_id FROM presence p LEFT JOIN visitors v ON v.vid = p.vid AND p.vid <> \'\' WHERE p.seen >= ?1 ORDER BY p.seen DESC LIMIT 60'
  ).bind(since).all();
  const now = Math.floor(Date.now() / 1000);
  const people = r.results.map((x) => ({
    who: x.vid ? 'Visitor ' + x.vid.slice(0, 4) : 'Anonymous',
    known: !!x.vid,
    vid: x.vid || '',
    section: x.section,
    device: x.device,
    ago: Math.max(0, now - Number(x.seen)),
    visits: x.vid ? Number(x.visits) || 1 : null,
    lead_id: x.lead_id || null,
  }));
  const by = {};
  for (const p of people) by[p.section || 'hero'] = (by[p.section || 'hero'] || 0) + 1;
  return { total: people.length, by_section: by, people };
}

// Enforce the retention the privacy page promises. Runs from the daily cron.
export async function prune(env) {
  const now = Date.now();
  const iso = (days) => new Date(now - days * 86400000).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM leads WHERE created_at < ?1').bind(iso(730)),
    env.DB.prepare('DELETE FROM events WHERE ts < ?1').bind(iso(90)),
    env.DB.prepare('DELETE FROM visitors WHERE last_seen < ?1 AND (lead_id IS NULL OR lead_id NOT IN (SELECT id FROM leads))').bind(iso(90)),
    env.DB.prepare('DELETE FROM presence WHERE seen < ?1').bind(Math.floor(now / 1000) - 600),
    env.DB.prepare('DELETE FROM logins WHERE expires < ?1').bind(Math.floor(now / 1000)),
  ]);
}
