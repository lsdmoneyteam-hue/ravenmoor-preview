// Telegram: alerts to the owner, the bot's commands, and the daily digest.
// Only the chat whose ID is in TELEGRAM_CHAT_ID can run commands or press buttons.

import { ready } from './db.js';
import { text, esc, log, errText, readCapped, sha256Hex, sameSecret, ukDay } from './util.js';
import { dayStats, statsFor, lastDays, liveNow, journey, journeyLine, sectionName, prune } from './track.js';
import { createLogin } from './admin.js';

const STATUSES = { new: 'New', contacted: 'Contacted', won: 'Won', lost: 'Lost' };

export function telegramReady(env) {
  return !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
}

export async function tg(env, method, payload) {
  const base = env.TELEGRAM_API || 'https://api.telegram.org';
  const res = await fetch(base + '/bot' + env.TELEGRAM_BOT_TOKEN + '/' + method, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  return { ok: res.ok && !!(data && data.ok), status: res.status, data };
}

// Send the owner a message. Returns 1 sent, 0 failed, null not set up.
export async function sendOwner(env, html, extra) {
  if (!telegramReady(env)) return null;
  const r = await tg(env, 'sendMessage', {
    chat_id: env.TELEGRAM_CHAT_ID,
    text: html.slice(0, 3900),
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(extra || {}),
  });
  if (!r.ok) { log('error', 'telegram_send', { status: r.status }); return 0; }
  return 1;
}

/* ---------- lead alert ---------- */

export function leadText(item, journeyText) {
  const what = item.kind === 'plans' ? 'Plans to life quote' : 'Free sample reel';
  const lines = [
    '\u{1F7E2} <b>New lead' + (item.id != null ? ' #' + item.id : '') + '</b>: ' + esc(item.name) + ', ' + esc(item.agency),
    what + (item.style ? ' · style: ' + esc(item.style) : ''),
    (item.kind === 'plans' ? 'Reference: ' : 'Listing: ') + esc(item.listing),
    'Email: ' + esc(item.email),
    'Phone: ' + esc(item.phone),
  ];
  if (item.ref) lines.push('Personal link: ' + esc(item.ref));
  if (journeyText) lines.push('Before sending: ' + esc(journeyText));
  return lines.join('\n');
}

export async function sendLeadAlert(env, item, journeyText) {
  const extra = item.id != null
    ? { reply_markup: { inline_keyboard: [[{ text: 'Mark contacted', callback_data: 'c:' + item.id }]] } }
    : undefined;
  return sendOwner(env, leadText(item, journeyText), extra);
}

/* ---------- set-up ---------- */

async function hookSecret(env) {
  return sha256Hex('ravenmoor-hook:' + env.TELEGRAM_BOT_TOKEN);
}

export async function tgRegister(request, env, url) {
  if (request.method !== 'GET') return text('Method not allowed', 405, { allow: 'GET' });
  if (!env.TELEGRAM_BOT_TOKEN) return text('Add the TELEGRAM_BOT_TOKEN secret in Cloudflare first, then open this page again.', 503);
  const r = await tg(env, 'setWebhook', {
    url: url.origin + '/api/tg/hook',
    secret_token: await hookSecret(env),
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  });
  if (!r.ok) {
    log('error', 'tg_register_failed', { status: r.status });
    return text('Telegram refused the request. Check the bot token is right.', 502);
  }
  return text('Done. Your bot is linked to ' + url.host + '. Now open the bot in Telegram and send it any message.', 200);
}

/* ---------- webhook ---------- */

export async function tgHook(request, env, url) {
  if (request.method !== 'POST') return text('Method not allowed', 405, { allow: 'POST' });
  if (!env.TELEGRAM_BOT_TOKEN) return text('Not set up', 503);
  const given = request.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!(await sameSecret(given, await hookSecret(env)))) return text('Forbidden', 403);

  const raw = await readCapped(request, 64 * 1024);
  let update = null;
  try { update = raw ? JSON.parse(raw) : null; } catch { /* ignore */ }
  try {
    if (update && update.callback_query) await onButton(env, update.callback_query);
    else if (update && update.message) await onMessage(env, url, update.message);
  } catch (err) {
    log('error', 'tg_hook', { error: errText(err) });
  }
  return text('ok', 200); // always 200, or Telegram keeps resending the update
}

function isOwner(env, chatId) {
  return !!env.TELEGRAM_CHAT_ID && String(env.TELEGRAM_CHAT_ID) === String(chatId);
}

async function onMessage(env, url, msg) {
  if (!msg.chat || msg.chat.type !== 'private') return;
  const chatId = msg.chat.id;
  const reply = (html, extra) => tg(env, 'sendMessage', { chat_id: chatId, text: html.slice(0, 3900), parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...(extra || {}) });

  if (!isOwner(env, chatId)) {
    // Anyone can message a bot. All a stranger learns is their own chat ID.
    await reply('Your chat ID is <code>' + esc(String(chatId)) + '</code>\nAdd it in Cloudflare as the secret TELEGRAM_CHAT_ID and enquiries will arrive here.');
    return;
  }

  await ready(env);
  const words = String(msg.text || '').trim().split(/\s+/);
  const cmd = (words[0] || '').toLowerCase().replace(/@.*$/, '');
  switch (cmd) {
    case '/today': return void (await reply(statsText('Today so far', await dayStats(env, ukDay(0)))));
    case '/yesterday': return void (await reply(statsText('Yesterday', await dayStats(env, ukDay(-1)))));
    case '/week': return void (await reply(await weekText(env)));
    case '/live': return void (await reply(liveText(await liveNow(env))));
    case '/hot': return void (await reply(await hotText(env)));
    case '/leads': return void (await reply(await leadsText(env)));
    case '/lead': return void (await reply(...(await leadDetail(env, words[1]))));
    case '/dashboard': {
      const token = await createLogin(env);
      return void (await reply('Your dashboard link. It works once and lasts 15 minutes:\n' + url.origin + '/admin/login?t=' + token));
    }
    default:
      return void (await reply(
        'This chat is linked. New enquiries arrive here.\n\n' +
        '/today  visits, reel plays and leads so far today\n' +
        '/yesterday  the same for yesterday\n' +
        '/week  the last 7 days\n' +
        '/live  who is on the site now\n' +
        '/hot  warm visitors who have not sent the form\n' +
        '/leads  the last 5 enquiries\n' +
        '/lead 12  one enquiry in full\n' +
        '/dashboard  a login link for the dashboard'
      ));
  }
}

async function onButton(env, q) {
  const chatId = q.message && q.message.chat && q.message.chat.id;
  if (!isOwner(env, chatId)) {
    await tg(env, 'answerCallbackQuery', { callback_query_id: q.id });
    return;
  }
  const m = /^c:(\d{1,9})$/.exec(q.data || '');
  if (!m) { await tg(env, 'answerCallbackQuery', { callback_query_id: q.id }); return; }
  await ready(env);
  await env.DB.prepare("UPDATE leads SET status = 'contacted' WHERE id = ?1 AND status = 'new'").bind(Number(m[1])).run();
  await tg(env, 'answerCallbackQuery', { callback_query_id: q.id, text: 'Marked contacted' });
  await tg(env, 'editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: q.message.message_id,
    reply_markup: { inline_keyboard: [[{ text: '✅ Contacted', callback_data: 'noop' }]] },
  });
}

/* ---------- message text ---------- */

function statsText(title, s) {
  const lines = ['\u{1F4CA} <b>' + esc(title) + '</b>: ' + s.visits + plural(s.visits, ' visit') + ', ' + s.plays + plural(s.plays, ' reel play') + ', ' + s.leads + plural(s.leads, ' lead')];
  if (s.reels.length) lines.push('Most watched: ' + s.reels.slice(0, 3).map((r) => esc(r.id) + ' (' + r.n + ')').join(', '));
  if (s.exits.length) lines.push('Most people left at: ' + esc(sectionName(s.exits[0].id)));
  if (s.refs.length) lines.push('Came from: ' + s.refs.slice(0, 3).map((r) => esc(r.id) + ' (' + r.n + ')').join(', '));
  if (s.form_starts) lines.push('Started the form: ' + s.form_starts);
  return lines.join('\n');
}

function plural(n, word) {
  return word + (n === 1 ? '' : 's');
}

async function weekText(env) {
  const days = await statsFor(env, lastDays(7));
  const rows = days.map((d) => d.day.slice(5) + '  ' + String(d.visits).padStart(4) + ' visits  ' + String(d.plays).padStart(3) + ' plays  ' + String(d.leads).padStart(2) + ' leads');
  return '\u{1F4C5} <b>Last 7 days</b>\n<pre>' + esc(rows.join('\n')) + '</pre>';
}

function liveText(live) {
  if (!live.total) return 'Nobody is on the site right now.';
  const by = Object.entries(live.by_section).sort((a, b) => b[1] - a[1]).map(([k, n]) => n + ' on ' + esc(sectionName(k)));
  const known = live.people.filter((p) => p.known).slice(0, 8).map((p) => esc(p.who) + ': ' + esc(sectionName(p.section)) + (p.visits > 1 ? ', visit ' + p.visits : '') + (p.lead_id ? ', lead #' + p.lead_id : ''));
  return '\u{1F7E2} <b>' + live.total + ' on the site now</b>\n' + by.join(', ') + (known.length ? '\n\nAccepted tracking:\n' + known.join('\n') : '');
}

async function hotText(env) {
  const since = ukDay(-7);
  const r = await env.DB.prepare("SELECT vid, visits, last_seen FROM visitors WHERE hot_day >= ?1 AND lead_id IS NULL ORDER BY last_seen DESC LIMIT 8").bind(since).all();
  if (!r.results.length) return 'No warm visitors in the last 7 days.';
  const lines = [];
  for (const v of r.results) {
    const j = await journey(env, v.vid);
    lines.push('Visitor ' + esc(v.vid.slice(0, 4)) + ': ' + esc(journeyLine(j)) + '. Last seen ' + esc(when(v.last_seen)));
  }
  return '\u{1F525} <b>Warm visitors, no form yet</b>\n' + lines.join('\n');
}

async function leadsText(env) {
  const r = await env.DB.prepare('SELECT id, created_at, name, agency, kind, status FROM leads ORDER BY id DESC LIMIT 5').all();
  if (!r.results.length) return 'No enquiries yet.';
  return '<b>Last enquiries</b>\n' + r.results.map((l) => '#' + l.id + ' ' + esc(l.name) + ', ' + esc(l.agency) + ' · ' + esc(STATUSES[l.status] || l.status) + ' · ' + esc(when(l.created_at))).join('\n') + '\n\nSend /lead and a number for the full details.';
}

async function leadDetail(env, idText) {
  const id = Number(idText);
  if (!Number.isInteger(id) || id < 1) return ['Send it like this: /lead 12'];
  const l = await env.DB.prepare('SELECT * FROM leads WHERE id = ?1').bind(id).first();
  if (!l) return ['There is no enquiry #' + id + '.'];
  const j = l.vid ? journeyLine(await journey(env, l.vid)) : '';
  const body = leadText(l, j).replace('\u{1F7E2} <b>New lead', '<b>Lead') + '\nStatus: ' + esc(STATUSES[l.status] || l.status) + ' · sent ' + esc(when(l.created_at));
  const extra = l.status === 'new' ? { reply_markup: { inline_keyboard: [[{ text: 'Mark contacted', callback_data: 'c:' + l.id }]] } } : undefined;
  return [body, extra];
}

const WHEN = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
function when(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? WHEN.format(new Date(t)) : String(iso);
}

/* ---------- daily cron ---------- */

export async function daily(env) {
  await ready(env);
  await prune(env).catch((err) => log('error', 'prune', { error: errText(err) }));
  if (!telegramReady(env)) return;
  const s = await dayStats(env, ukDay(-1));
  const waiting = await env.DB.prepare("SELECT COUNT(*) AS n FROM leads WHERE status = 'new'").first();
  let msg = statsText('Yesterday', s);
  const n = Number(waiting && waiting.n) || 0;
  if (n) msg += '\n\n' + n + (n === 1 ? ' enquiry is' : ' enquiries are') + ' still marked new. Send /leads to see them.';
  await sendOwner(env, msg);
}
