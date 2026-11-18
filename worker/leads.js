// The enquiry form: check it, save it, then alert and email in the background.

import { ready } from './db.js';
import { json, clean, hostOf, readCapped, log, errText } from './util.js';
import { journey, journeyLine } from './track.js';
import { sendLeadAlert } from './telegram.js';

const LIMITS = { name: 80, agency: 120, email: 160, phone: 40, listing: 600, style: 40, ref: 60 };
const MAX_BODY = 8 * 1024;
const PER_EMAIL_PER_HOUR = 3;
const GLOBAL_PER_HOUR = 40;

export async function lead(request, env, ctx, url) {
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
    // Present only when this browser accepted tracking; links the enquiry to its history.
    vid: typeof body.vid === 'string' && /^[a-f0-9]{32}$/.test(body.vid) ? body.vid : '',
  };
  const bad = validate(item);
  if (bad) return json({ ok: false, error: 'invalid', field: bad }, 422);

  await ready(env);
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
    'INSERT INTO leads (created_at, kind, name, agency, email, phone, listing, style, ref, country, status, vid) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)'
  ).bind(now, item.kind, item.name, item.agency, item.email, item.phone, item.listing, item.style, item.ref, country, 'new', item.vid || null).run();
  const id = res && res.meta ? res.meta.last_row_id : null;
  log('info', 'lead_saved', { id, kind: item.kind });
  if (item.vid && id != null) {
    await env.DB.prepare('UPDATE visitors SET lead_id = ?1 WHERE vid = ?2').bind(id, item.vid).run();
  }

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

async function notify(env, item) {
  let line = '';
  if (item.vid) {
    try { line = journeyLine(await journey(env, item.vid)); } catch (err) { log('warn', 'journey_failed', { id: item.id, error: errText(err) }); }
  }
  const [tg, mail] = await Promise.all([
    sendLeadAlert(env, item, line).catch((err) => { log('error', 'telegram_failed', { id: item.id, error: errText(err) }); return 0; }),
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
