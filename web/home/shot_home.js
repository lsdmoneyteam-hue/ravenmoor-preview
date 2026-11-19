// Screenshots of the home page's scroll Earth.
// usage: node shot_home.js OUTDIR W H DPR MOBILE(0|1) 'name|scroll 0..1|weather seconds|pointer x,y|earth or full' ...
// By default the page and the new pictures come from this machine and everything else from the live preview site;
// with LOCAL=0 everything comes from the live site.
const { chromium } = require('playwright'); const fs = require('fs');
const [out, W, H, DPR, MOBILE, ...jobs] = process.argv.slice(2);
const LIVE = 'https://ravenmoor-preview.tight-frost-6ab6.workers.dev';
const HOME = '/home/user/globe/home/', SCROLL = '/home/user/globe/planet/scroll/';
const local = {
  '/globe/t/s_0.webp': [SCROLL + 'narrow4k.webp', 'image/webp'], '/globe/t/s_1.webp': [SCROLL + 'wide8k.webp', 'image/webp'],
  '/globe/t/s_2.webp': [SCROLL + 'wide4k.webp', 'image/webp'], '/globe/t/s_3.jpg': [SCROLL + 'wisp1k.jpg', 'image/jpeg'],
  '/a/19ab3fb20bab.jpg': [HOME + 'a/19ab3fb20bab.jpg', 'image/jpeg'], '/a/fcc8c0c7979f.jpg': [HOME + 'a/fcc8c0c7979f.jpg', 'image/jpeg'] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: +DPR, isMobile: MOBILE === '1', hasTouch: MOBILE === '1', reducedMotion: process.env.REDUCE === '1' ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('rd-loader', '1'); sessionStorage.setItem('rd-intro', '1'); localStorage.setItem('rd-cookie', 'rejected'); } catch (e) {} });
  const pg = await ctx.newPage(); const logs = [], bad = [];
  pg.on('console', m => logs.push(m.type() + ': ' + m.text().slice(0, 300))); pg.on('pageerror', e => logs.push('PAGEERROR ' + String(e).slice(0, 400)));
  pg.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().slice(0, 120)); });
  await pg.route('**/*.mp4', r => r.abort());
  if (process.env.LOCAL !== '0') await pg.route(LIVE + '/**', async r => {
    const u = new URL(r.request().url());
    if (u.pathname === '/' && r.request().resourceType() === 'document') { const resp = await r.fetch(); return r.fulfill({ response: resp, body: fs.readFileSync(HOME + 'index.html', 'utf8') }); }
    const l = local[u.pathname]; if (l) return r.fulfill({ status: 200, contentType: l[1], body: fs.readFileSync(l[0]) });
    return r.continue();
  });
  await pg.goto(LIVE + '/', { waitUntil: 'load', timeout: 90000 });
  await pg.waitForFunction(() => { const c = document.querySelector('canvas.earth'); return c && c.__earth; }, null, { timeout: 60000 });
  let st = null;
  for (let i = 0; i < 160; i++) {
    st = await pg.evaluate(() => { const e = document.querySelector('canvas.earth').__earth; return e.state ? Object.assign({ look: e.look }, e.state()) : { look: e.look }; });
    if (st.look !== 'artwork' || st.failed || (st.art && st.cloud && st.wisp)) break; await sleep(250);
  }
  console.log('state', JSON.stringify(st));
  for (const j of jobs) {
    const [name, frac, wsec, ptr, clip] = j.split('|');
    await pg.evaluate(f => window.scrollTo({ top: f * (document.documentElement.scrollHeight - innerHeight), behavior: 'instant' }), +frac);
    if (wsec !== '' && wsec !== undefined) await pg.evaluate(s => { const e = document.querySelector('canvas.earth').__earth; if (e.weather) e.weather(s); }, +wsec);
    if (ptr) { const [x, y] = ptr.split(',').map(Number); await pg.mouse.move(x, y); }
    await sleep(1800);
    const h = await pg.evaluate(() => document.querySelector('canvas.earth').getBoundingClientRect().height);
    const o = { path: out + '/' + name + '.jpg', type: 'jpeg', quality: +(process.env.Q || 82) };
    if (clip !== 'full') o.clip = { x: 0, y: +H - h, width: +W, height: h };
    await pg.screenshot(o);
    console.log(name, 'scrollY', await pg.evaluate(() => Math.round(scrollY)), 'earth height', Math.round(h), fs.statSync(o.path).size >> 10, 'KB');
  }
  await b.close();
  for (const l of logs.filter(l => !/ReadPixels|three\.js/.test(l)).slice(0, 20)) console.log('LOG', l);
  for (const l of bad.slice(0, 20)) console.log('BAD', l);
})().catch(e => { console.error('ERR', e); process.exit(1); });
