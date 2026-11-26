// Ravenmoor Digital site Worker. Only these paths reach this code (see wrangler.jsonc);
// pages, images and scripts are served straight from static assets.
//
//   POST /api/lead         enquiry form: save, then Telegram alert and emails      (leads.js)
//   POST /api/e            site tracking: anonymous totals, accepted journeys      (track.js)
//   GET  /api/tg/register  point the Telegram bot at this site, once               (telegram.js)
//   POST /api/tg/hook      Telegram webhook: bot commands and buttons              (telegram.js)
//   GET  /admin            private dashboard, signed in through the bot            (admin.js)
//   GET  /a/*.mp4          video with byte ranges                                  (media.js)
//   PUT  /api/drop/*       TEMPORARY: hand-over point for the globe artwork         (drop.js)
//   GET  /globe/t/*        TEMPORARY: tiles for the globe preview page at /globe/   (globe.js)
//   GET  /offplan/img2/*   the finished off-plan pictures, cut from a pack                (stills.js)
//   cron 08:00 UTC         yesterday's digest to Telegram, old data removed        (telegram.js)
//   cron hourly            reminder for an enquiry left on "new" for two hours      (telegram.js)
//
// Secrets (Cloudflare dashboard -> Worker -> Settings -> Variables and Secrets). All optional:
// a missing one switches that feature off, it never breaks the form.
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID   alerts, bot commands, dashboard sign-in
//   RESEND_API_KEY, FROM_EMAIL             emails (FROM_EMAIL like "Ravenmoor Digital <hello@your-domain>")
//   OWNER_EMAIL                            where the "new lead" email goes
//   COMPANY_LINE                           company name, number and registered office for email footers

import { lead } from './leads.js';
import { collect } from './track.js';
import { tgRegister, tgHook, daily, hourly } from './telegram.js';
import { admin } from './admin.js';
import { media } from './media.js';
import { drop } from './drop.js';
import { globeTile } from './globe.js';
import { still } from './stills.js';
import { json, log, errText } from './util.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === '/api/lead') return await lead(request, env, ctx, url);
      if (path === '/api/e') return await collect(request, env, ctx, url);
      if (path === '/api/tg/register') return await tgRegister(request, env, url);
      if (path === '/api/tg/hook') return await tgHook(request, env, url);
      if (path.startsWith('/api/drop/')) return await drop(request, env, url);
      if (path.startsWith('/api/')) return json({ ok: false, error: 'not_found' }, 404);
      if (path === '/admin' || path.startsWith('/admin/')) return await admin(request, env, ctx, url);
      if (path.startsWith('/a/') && path.endsWith('.mp4')) return await media(request, env, ctx, url);
      if (path.startsWith('/offplan/img2/')) return await still(request, env, ctx, url);
      if (path.startsWith('/globe/t/')) {
        // Tiles are cut out of large packs: keep each finished tile at Cloudflare's edge so the next visitor gets it at once.
        if (request.method !== 'GET') return await globeTile(request, env);
        const cache = caches.default, hit = await cache.match(request);
        if (hit) return hit;
        const res = await globeTile(request, env);
        if (res.status === 200) ctx.waitUntil(cache.put(request, res.clone()));
        return res;
      }
      return env.ASSETS.fetch(request);
    } catch (err) {
      log('error', 'unhandled', { path, error: errText(err) });
      return json({ ok: false, error: 'server' }, 500);
    }
  },

  async scheduled(controller, env, ctx) {
    const job = controller.cron === '0 8 * * *' ? daily : hourly;
    ctx.waitUntil(job(env).catch((err) => log('error', 'cron', { cron: controller.cron, error: errText(err) })));
  },
};
