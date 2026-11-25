// Off-plan development page. One template for any development: a tower, a block of flats or a single house.
// Plans and homes come from /3d/buildings.js, words and pictures from content.js, and the 3D model opens on tap.
import * as BUILD from '/3d/buildings.js?v=21';
import { CONTENT } from './content.js?v=8';

const OUT = new Set(['balcony', 'terrace']), SHARED = new Set(['corridor', 'lobby', 'core']);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const sqft = m => Math.round(m * 10.764);

export function mount(key) {
  const C = CONTENT[key], D = BUILD[C.model](), img = n => `/offplan/img/${C.model}-${n}.webp`;
  const units = Object.values(D.units), avail = units.filter(u => u.status === 'Available'), price = u => +u.price.replace(/[^0-9]/g, '');
  document.documentElement.dataset.theme = C.theme;
  const root = document.getElementById('dev');
  const three = (q = '') => `/3d/${C.model}/?embed=1${q}`;

  root.innerHTML = `
  <div class="gate" data-gate>
    <p class="gate-dev">${esc(C.developer)}</p>
    <button type="button" class="gate-door" data-enter aria-label="Enter ${esc(D.name)}"><svg viewBox="0 0 60 90" aria-hidden="true"><path d="M4 88V34a26 26 0 0 1 52 0v54z"/><path d="M30 8v80M4 44h52M4 60h52M4 76h52" class="thin"/></svg><span>Enter</span></button>
    <p class="gate-name">${esc(D.name)}</p>
  </div>
  <header class="bar"><a class="bar-name" href="#top">${esc(D.name)}</a><nav><a href="#homes">${D.single ? 'The house' : 'Residences'}</a><a href="#inside">Inside</a><a href="#model">3D</a><a class="bar-cta" href="#talk">Enquire</a></nav></header>

  <section class="story" id="top" data-story>
    <div class="story-pin">
      <picture class="story-poster"><source media="(max-width: 700px)" srcset="${img('hero-tall')}"><img src="${img('hero')}" alt="${esc(D.name)} at dusk" fetchpriority="high"></picture>
      <iframe class="story-frame" title="${esc(D.name)} being built as you scroll" tabindex="-1" aria-hidden="true"></iframe>
      <div class="story-shade"></div>
      <div class="story-mist" data-mist></div>
      <div class="cap cap-title" data-cap="-1,.08"><p class="kicker">${esc(D.place)}</p><h1>${esc(D.name)}</h1><p class="cue">Scroll <span class="build">build 21</span></p></div>
      <div class="cap cap-rise" data-cap=".13,.4"><p class="rise" data-rise></p><dl class="numbers">${C.numbers.slice(0, 3).map(([n, l]) => `<div><dt>${esc(l)}</dt><dd>${esc(n)}</dd></div>`).join('')}</dl></div>
      <div class="cap cap-line" data-cap=".44,.57"><p>${esc(C.tagline)}</p></div>
      <div class="cap cap-line" data-cap=".61,.74"><p class="kicker">${esc(C.film[0])}</p><p>${esc(C.film[1])}</p></div>
      <div class="cap cap-line" data-cap=".79,.91"><p>${esc(C.film[2])}</p></div>
      ${(C.filmMore || []).map(([a, b, t]) => `<div class="cap cap-line" data-fix="1" data-cap="${a},${b}"><p>${esc(t)}</p></div>`).join('')}
      ${C.film[4] ? `<div class="cap cap-line" data-fix="1" data-cap=".91,.97"><p>${esc(C.film[4])}</p></div>` : ''}
      <div class="cap cap-end" ${C.film[4] ? 'data-fix="1" data-cap=".992,2"' : 'data-cap=".95,2"'}><p class="kicker">${esc(D.place)}</p><h2>${esc(C.film[3])}</h2>
        <div class="row"><a class="btn" href="#homes">${D.single ? 'Explore the house' : 'Explore residences'}</a><button class="btn ghost" type="button" data-open3d>Open the 3D model</button></div>
        <div class="tod" role="group" aria-label="Time of day">${[['Morning', 8], ['Day', 13], ['Sunset', 19.2], ['Night', 21.5]].map(([t, h]) => `<button type="button" data-tod="${h}">${t}</button>`).join('')}</div></div>
      <button type="button" class="viewer-x story-back" data-untake hidden>Back to ${D.single ? 'the house' : 'the building'}</button>
      <div class="pickcard" data-pickcard hidden></div><div class="picktip" data-picktip hidden></div>
      <div class="story-bar"><i data-bar></i></div>
    </div>
  </section>

  <section class="intro"><p>${esc(C.intro)}</p>
    <dl class="numbers">${C.numbers.map(([n, l]) => `<div><dt>${esc(l)}</dt><dd>${esc(n)}</dd></div>`).join('')}</dl></section>

  <section class="place" id="place">
    <img src="${img('place')}" alt="${esc(D.name)} and its surroundings from the air" loading="lazy">
    <div class="place-text"><h2>${esc(C.place.title)}</h2><p>${esc(C.place.text)}</p>
      <ul class="facts">${C.place.facts.map(([a, b]) => `<li><strong>${esc(a)}</strong><span>${esc(b)}</span></li>`).join('')}</ul></div>
  </section>

  <section class="homes" id="homes" style="--homes-bg:url(${img('night')})">
    <div class="homes-head"><h2>${D.single ? 'Explore the house' : 'Explore residences'}</h2><p data-homes-sub></p></div>
    <div class="homes-body"><div class="stack" data-stack></div><div class="stage" data-stage></div></div>
  </section>

  ${C.feature ? `<section class="pent" id="inside">
    <div class="pent-hero"><img src="${img(C.feature.shots[0][0])}" alt="${esc(C.feature.shots[0][1])}" loading="lazy">
      <div class="pent-text"><p class="kicker">${esc(C.feature.kicker)}</p><h2>${esc(C.feature.title)}</h2><p class="lede">${esc(C.feature.line)}</p>
        <dl class="numbers">${C.feature.facts.map(([n, l]) => `<div><dt>${esc(l)}</dt><dd>${esc(n)}</dd></div>`).join('')}</dl>
        <div class="row"><button class="btn" type="button" data-pentwalk>Step inside the penthouse</button><button class="btn ghost" type="button" data-pentplan>See its plan</button></div></div></div>
    <div class="reel" tabindex="0" aria-label="${esc(C.feature.title)} in pictures">${C.feature.shots.slice(1).map(([n, t, d]) => `<figure><img src="${img(n)}" alt="${esc(t)}" loading="lazy"><figcaption><strong>${esc(t)}</strong><span>${esc(d)}</span></figcaption></figure>`).join('')}</div>
  </section>` : `  <section class="inside" id="inside">
    <h2>Step inside</h2><p class="sub">${D.single ? 'Four rooms, as they will be lived in.' : 'Four views of a home here, as it will be lived in.'}</p>
    <div class="arches">${C.rooms.map(([t, n, d], i) => `<button type="button" class="arch" data-room="${i}"><span class="arch-img"><img src="${img(n)}" alt="" loading="lazy"></span><strong>${esc(t)}</strong><span>${esc(d)}</span></button>`).join('')}</div>
  </section>`}

  <section class="amen" id="life">
    <div class="amen-list"><h2>${esc(C.amenTitle)}</h2><ol>${C.amenities.map(([t, n, d], i) => `<li><button type="button" data-amen="${i}" class="${i ? '' : 'on'}"><strong>${esc(t)}</strong><span>${esc(d)}</span></button></li>`).join('')}</ol></div>
    <div class="amen-img"><img data-amen-img src="${img(C.amenities[0][1])}" alt="${esc(C.amenities[0][0])}" loading="lazy"></div>
  </section>

  <section class="spec"><h2>Considered, all the way through</h2><dl>${C.spec.map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join('')}</dl></section>

  <section class="model" id="model">
    <img src="${img('night')}" alt="" loading="lazy">
    <div class="model-text"><h2>Walk round it before it’s built</h2><p>See inside any floor, step into the rooms and watch the light move through the day.</p><button class="btn" type="button" data-open3d>Tap to open the 3D model</button></div>
  </section>

  <section class="talk" id="talk">
    <h2>Let’s talk about ${esc(D.name)}</h2>
    <p class="sub">${D.single ? 'Arrange a viewing of the plans, or ask us anything.' : `${avail.length} of ${units.length} homes are available, from ${'£' + Math.min(...avail.map(price)).toLocaleString('en-GB')}.`}</p>
    <form data-form novalidate><label>Name<input name="name" autocomplete="name" required></label><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Which home?<input name="home" data-home-field placeholder="${D.single ? D.name : 'Any, or a home number'}"></label>
      <button class="btn" type="submit">Request a call</button><p class="form-note" data-form-note role="status"></p></form>
  </section>
  <footer class="foot"><p>${esc(D.name)} is a fictional development, made to show what Ravenmoor builds for developers. The pictures are stills from the 3D model.</p><p><a href="/offplan/">All developments</a> · <a href="/">Ravenmoor Digital</a></p></footer>

  <div class="viewer" data-viewer hidden role="dialog" aria-modal="true" aria-label="3D model of ${esc(D.name)}"><button type="button" class="viewer-x" data-close3d>Close 3D</button><iframe title="3D model of ${esc(D.name)}" allow="fullscreen"></iframe></div>
  <div class="light" data-light hidden role="dialog" aria-modal="true"><img alt=""><div class="light-text"><h3></h3><p></p><div class="row"><button class="btn" type="button" data-light3d>Walk this room in 3D</button><button class="btn ghost" type="button" data-lightx>Close</button></div></div></div>`;

  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];

  // ---------- the gate ----------
  const gate = $('[data-gate]');
  const enter = () => { gate.classList.add('open'); document.body.classList.remove('gated'); setTimeout(() => gate.remove(), 1200); try { sessionStorage.setItem('gate-' + key, '1'); } catch (e) { /* private mode */ } };
  let seen = false; try { seen = sessionStorage.getItem('gate-' + key) === '1'; } catch (e) { /* private mode */ }
  if (seen || location.hash) gate.remove(); else { document.body.classList.add('gated'); $('[data-enter]').addEventListener('click', enter); }

  // ---------- the 3D viewer ----------
  const viewer = $('[data-viewer]'), frame = viewer.querySelector('iframe');
  const open3d = (q = '') => { if (story.classList.contains('taken')) untake(); const sf = root.querySelector('.story-frame'); if (sf && sf.src && !sf.src.endsWith('about:blank')) { sf.dataset.src = sf.src; sf.src = 'about:blank'; root.querySelector('[data-story]').classList.remove('live'); } frame.src = three(q); viewer.hidden = false; document.body.classList.add('locked'); viewer.querySelector('button').focus(); };
  const close3d = () => { const sf = root.querySelector('.story-frame'); if (sf && sf.dataset.src) { sf.src = sf.dataset.src; delete sf.dataset.src; } viewer.hidden = true; frame.src = 'about:blank'; document.body.classList.remove('locked'); };
  $$('[data-open3d]').forEach(b => b.addEventListener('click', () => open3d()));
  $('[data-close3d]').addEventListener('click', close3d);

  // ---------- the opening: scrolling flies the camera in and builds the development ----------
  const story = $('[data-story]'), sframe = story.querySelector('iframe'), fs = C.filmScale || 1, caps = [...story.querySelectorAll('[data-cap]')].map(el => { const [a, b] = el.dataset.cap.split(',').map(Number); return el.dataset.fix ? [el, a, b] : [el, a * fs, b >= 2 ? b : b * fs]; });
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches, sbar = story.querySelector('[data-bar]'), rise = story.querySelector('[data-rise]'), mist = story.querySelector('[data-mist]');
  const levels = D.single ? ['Foundations', 'Ground floor', 'First floor', 'Roof'] : null, nF = D.floors.length;
  let sp = -1, live = false;
  const post = (p, jump) => { if (live) sframe.contentWindow.postMessage({ rv: 'story', p, jump }, location.origin); };
  const paint = () => {
    const r = story.getBoundingClientRect(), p = calm ? 1 : Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
    if (p === sp) return; sp = p; post(p); sbar.style.transform = `scaleX(${p})`; mist.style.opacity = Math.max(0, 1 - p / .2);
    caps.forEach(([el, a, b]) => { const o = Math.min(1, Math.max(0, Math.min((p - a) / .05, (b - p) / .05))); el.style.opacity = o; el.style.transform = `translateY(${(1 - o) * (p < a + .05 ? 26 : -26)}px)`; el.classList.toggle('on', o > .5); });
    let k = Math.min(1, Math.max(0, (p / fs - .1) / .32)); k = k * k * (3 - 2 * k);
    rise.textContent = levels ? levels[Math.min(3, Math.floor(k * 4))] : k >= 1 ? 'Topped out' : `Level ${Math.min(nF - 1, Math.floor(k * nF))} of ${nF - 1}`;
  };
  if (calm) story.classList.add('calm'); else { sframe.src = `/3d/${C.model}/?story=1&embed=1`; addEventListener('scroll', () => requestAnimationFrame(paint), { passive: true }); addEventListener('resize', paint); }
  addEventListener('message', e => { if (e.origin === location.origin && e.source === sframe.contentWindow && e.data && e.data.rv === 'ready') { live = true; story.classList.add('live'); post(Math.max(0, sp), true); } });
  paint();
  story.querySelectorAll('[data-tod]').forEach(b => b.addEventListener('click', () => { if (live) sframe.contentWindow.postMessage({ rv: 'time', h: +b.dataset.tod }, location.origin); story.querySelectorAll('[data-tod]').forEach(x => x.classList.toggle('on', x === b)); }));
  // tap a balcony or a level at any point in the scroll
  const pin = story.querySelector('.story-pin'), pcard = story.querySelector('[data-pickcard]'), ptip = story.querySelector('[data-picktip]'); let pn = 0, ptype = 'mouse', pxy = [0, 0], pt = 0;
  const ask = (e, click) => { if (!live) return; const r = pin.getBoundingClientRect(); pxy = [e.clientX - r.left, e.clientY - r.top]; sframe.contentWindow.postMessage({ rv: 'point', n: ++pn, click, x: pxy[0] / r.width, y: pxy[1] / r.height }, location.origin); };
  // hand the scroll scene over to the model: no second viewer, no loading screen
  const back = story.querySelector('[data-untake]');
  const take = (msg, q) => { if (!live) return open3d(q); story.classList.add('taken'); document.body.classList.add('locked'); back.hidden = false; sframe.contentWindow.postMessage({ rv: 'enter', ...msg }, location.origin); sframe.removeAttribute('aria-hidden'); sframe.focus(); };
  const untake = () => { story.classList.remove('taken'); document.body.classList.remove('locked'); back.hidden = true; sframe.setAttribute('aria-hidden', 'true'); if (live) sframe.contentWindow.postMessage({ rv: 'leave' }, location.origin); };
  back.addEventListener('click', untake); addEventListener('keydown', e => { if (e.key === 'Escape' && story.classList.contains('taken') && document.activeElement !== sframe) untake(); });
  const toPlan = fn => { fn(); stage.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' }); };
  const hideCard = () => { pcard.hidden = true; if (live) sframe.contentWindow.postMessage({ rv: 'floor', i: -1 }, location.origin); };
  const card = h => {
    const u = h.unit, line = u ? `${h.beds} bedroom${h.beds > 1 ? 's' : ''} · ${h.area} m² · ${h.status === 'Available' ? h.price : h.status}` : h.single ? '' : h.avail ? `${h.avail} home${h.avail > 1 ? 's' : ''} available` : 'Shared spaces';
    pcard.innerHTML = `<button type="button" class="pick-x" aria-label="Close">×</button><p class="kicker">${esc(h.single ? D.place : h.label + (h.tag ? ' · ' + h.tag : ''))}</p><h3>${esc(u ? h.name : h.single ? D.name : h.label)}</h3><p>${esc(line)}</p><div class="row"><button class="btn" type="button" data-go>${u ? 'Go to this home' : h.single ? 'See inside' : 'See inside this level'}</button>${h.single ? '' : '<button class="btn ghost" type="button" data-plan>Floor plan</button>'}</div>`;
    pcard.hidden = false; pcard.querySelector('.pick-x').onclick = hideCard;
    pcard.querySelector('[data-go]').onclick = () => { hideCard(); take(u ? { unit: u } : { floor: h.floor }, u ? '&unit=' + encodeURIComponent(u) : h.single ? '' : '&floor=' + h.floor); };
    const pl = pcard.querySelector('[data-plan]'); if (pl) pl.onclick = () => { hideCard(); toPlan(() => u ? showUnit(u) : showLevel(h.floor)); };
  };
  // (the scroll is a film: homes are chosen in the 3D model, not here)
  const rail = story.querySelector('[data-rail]');
  if (rail) { rail.addEventListener('click', e => { const b = e.target.closest('[data-lv]'); if (!b) return; hideCard(); take({ floor: +b.dataset.lv }, '&floor=' + b.dataset.lv); });
    rail.addEventListener('pointerover', e => { const b = e.target.closest('[data-lv]'); if (b && live && e.pointerType === 'mouse' && pcard.hidden) sframe.contentWindow.postMessage({ rv: 'floor', i: +b.dataset.lv }, location.origin); }); }

  // ---------- floor plans drawn from the same data as the 3D model ----------
  const bounds = rooms => { const x0 = Math.min(...rooms.map(r => r.x)), x1 = Math.max(...rooms.map(r => r.x + r.w)), z0 = Math.min(...rooms.map(r => r.z)), z1 = Math.max(...rooms.map(r => r.z + r.d)); return { x0, z0, w: x1 - x0, d: z1 - z0 }; };
  function levelPlan(fi, hot) {
    const fl = D.floors[fi], b = bounds(fl.rooms), pad = 1.2;
    const fs = D.single ? b.w / 30 : Math.max(.7, Math.min(1.1, b.w / 30));
    const groups = {}; fl.rooms.forEach(r => { const k = D.single ? r.id : (r.unit || '_shared'); (groups[k] ||= []).push(r); });
    let s = `<svg class="plan level" viewBox="${b.x0 - pad} ${b.z0 - pad} ${b.w + pad * 2} ${b.d + pad * 2}" role="img" aria-label="Plan of ${esc(fl.label)}">`;
    for (let x = Math.ceil(b.x0 - pad); x < b.x0 + b.w + pad; x += 3) s += `<path class="grid" d="M${x} ${b.z0 - pad}V${b.z0 + b.d + pad}"/>`;
    for (const [k, rs] of Object.entries(groups)) {
      if (k === '_shared') { s += rs.map(r => `<rect class="shared ${r.type}" x="${r.x}" y="${r.z}" width="${r.w}" height="${r.d}"/>`).join(''); continue; }
      const u = D.single ? null : D.units[k], bb = bounds(rs.filter(r => !OUT.has(r.type))), label = D.single ? rs[0].name : k;
      s += `<g class="unit ${u ? 'st-' + u.status : ''} ${hot === k ? 'hot' : ''}" data-pick="${esc(k)}" tabindex="0" role="button" aria-label="${esc(D.single ? rs[0].name : u.name + ', ' + u.beds + ' bedrooms, ' + (u.status === 'Available' ? u.price : u.status))}">`
        + rs.map(r => `<rect class="${OUT.has(r.type) ? 'out' : ''}" x="${r.x}" y="${r.z}" width="${r.w}" height="${r.d}"/>`).join('')
        + (bb.w > 2.4 ? `<text style="font-size:${fs}px" x="${bb.x0 + bb.w / 2}" y="${bb.z0 + bb.d / 2 + fs * .35}">${esc(label.length > 14 ? label.split(' ')[0] : label)}</text>` : '') + `</g>`;
    }
    return s + `<g class="north" transform="translate(${b.x0 + b.w + pad - .9} ${b.z0 - pad + 1.5})"><path d="M0 -.9L.35 .3H-.35Z"/><text y="1.1">N</text></g></svg>`;
  }
  const TONE = { open: 'a', living: 'a', kitchen: 'a', dining: 'a', bed: 'b', bath: 'c', utility: 'c', hall: 'd', study: 'b', balcony: 'o', terrace: 'o' };
  function unitPlan(fi, id) {
    const rs = D.floors[fi].rooms.filter(r => r.unit === id), b = bounds(rs), pad = .8;
    return `<svg class="plan flat" viewBox="${b.x0 - pad} ${b.z0 - pad} ${b.w + pad * 2} ${b.d + pad * 2}" role="img" aria-label="Floor plan">`
      + rs.map(r => `<rect class="t-${TONE[r.type] || 'd'}" x="${r.x}" y="${r.z}" width="${r.w}" height="${r.d}"/>`).join('')
      + rs.filter(r => r.w > 1.9 && r.d > 1.4).map(r => { const n = r.name.replace(', kitchen and dining', ' / kitchen').replace('Utility and storage', 'Store'); return `<text x="${r.x + r.w / 2}" y="${r.z + r.d / 2 - .05}">${esc(n)}</text><text class="dim" x="${r.x + r.w / 2}" y="${r.z + r.d / 2 + .5}">${r.w.toFixed(1)} × ${r.d.toFixed(1)} m</text>`; }).join('')
      + `<g class="north" transform="translate(${b.x0 + b.w + pad - .6} ${b.z0 - pad + 1.1})"><path d="M0 -.7L.28 .25H-.28Z"/><text y=".85">N</text></g></svg>`;
  }

  // ---------- explore: building → level → home ----------
  const stack = $('[data-stack]'), stage = $('[data-stage]'), sub = $('[data-homes-sub]');
  const perFloor = D.floors.map((fl, i) => units.filter(u => u.floor === i));
  {
    const n = D.floors.length, bh = D.single ? 26 : Math.max(9, Math.min(22, 330 / n)), gap = 2, W = 120, top = D.style === 'glass' ? 22 : 34, H = top + n * (bh + gap) + 6;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Choose a level">`;
    if (D.style === 'glass') s += `<rect class="crown" x="38" y="4" width="44" height="16"/>`;
    else if (D.style === 'brick') s += [0, 1, 4, 5].map(b => `<path class="crown" d="M${12 + b * 16} ${top - 1}l8 -14l8 14z"/>`).join('') + `<rect class="crown" x="44" y="${top - 6}" width="32" height="5"/>`;
    else s += `<path class="crown" d="M14 ${top - 1}L60 6l46 ${top - 7}z"/>`;
    for (let i = n - 1; i >= 0; i--) {
      const y = top + (n - 1 - i) * (bh + gap), w = D.style === 'glass' ? 76 + 12 * Math.sin(i * .55) + 6 * Math.sin(i * 1.3) : D.single ? 88 : 96, a = perFloor[i].filter(u => u.status === 'Available').length;
      s += `<g class="lvl ${!D.single && !perFloor[i].length ? 'shared' : ''} ${!D.single && perFloor[i].length && !a ? 'none' : ''}" data-level="${i}" tabindex="0" role="button" aria-label="${esc(D.floors[i].label)}${perFloor[i].length ? ', ' + a + ' available' : ''}"><rect x="${(W - w) / 2}" y="${y}" width="${w}" height="${bh}" rx="1.5"/><text x="${W / 2}" y="${y + bh / 2 + 3}">${esc(D.floors[i].short)}</text></g>`;
    }
    stack.innerHTML = s + '</svg>';
  }
  const act = (node, fn) => { node.addEventListener('click', fn); node.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); } }); };
  const mark = i => $$('[data-level]').forEach(g => g.classList.toggle('on', +g.dataset.level === i));
  function showBuilding() {
    mark(-1); sub.textContent = D.single ? 'Choose a floor to see its rooms.' : 'Choose a level to see the homes on it.';
    const beds = [...new Set(units.map(u => u.beds))].sort();
    stage.innerHTML = D.single ? `<div class="stage-card"><h3>${esc(D.name)}</h3><p class="price">${esc(D.units.house.price)}</p><p>${D.units.house.beds} bedrooms · ${D.units.house.baths} bathrooms · ${D.units.house.area} m² (${sqft(D.units.house.area)} sq ft)</p><ul class="ticks">${D.units.house.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul><div class="row"><button class="btn" type="button" data-go="0">Ground floor</button><button class="btn ghost" type="button" data-go="1">First floor</button></div></div>`
      : `<div class="stage-card"><h3>${avail.length} homes available</h3><table class="types"><thead><tr><th>Type</th><th>Size</th><th>Available</th><th>From</th></tr></thead><tbody>${beds.map(b => { const us = units.filter(u => u.beds === b), av = us.filter(u => u.status === 'Available'); return `<tr><td>${b} bedroom</td><td>${Math.min(...us.map(u => u.area)) === Math.max(...us.map(u => u.area)) ? Math.min(...us.map(u => u.area)) : Math.min(...us.map(u => u.area)) + '–' + Math.max(...us.map(u => u.area))} m²</td><td>${av.length} of ${us.length}</td><td>${av.length ? '£' + Math.min(...av.map(price)).toLocaleString('en-GB') : '—'}</td></tr>`; }).join('')}</tbody></table><p class="small">Tap a level on the building to see its plan.</p></div>`;
    stage.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => showLevel(+b.dataset.go)));
  }
  function showLevel(i) {
    mark(i); const fl = D.floors[i], us = perFloor[i];
    sub.textContent = D.single ? 'Tap a room to see it.' : us.length ? 'Tap a home on the plan.' : 'This floor is shared by all residents.';
    stage.innerHTML = `<div class="stage-level"><div class="crumbs"><button type="button" data-back>${D.single ? 'The house' : 'Back to building'}</button></div><h3>${esc(fl.label)}${fl.tag ? ' · ' + esc(fl.tag) : ''}</h3>
      <div class="plan-wrap dark">${levelPlan(i)}</div>
      ${D.single ? `<ul class="unit-list">${fl.rooms.filter(r => r.w * r.d > 3).map(r => `<li><button type="button" data-pick="${esc(r.id)}"><span>${esc(r.name)}</span><span>${r.w.toFixed(1)} × ${r.d.toFixed(1)} m</span></button></li>`).join('')}</ul>`
        : us.length ? `<ul class="unit-list">${us.map(u => `<li><button type="button" data-pick="${esc(u.id)}"><span>${esc(u.id)}</span><span>${u.beds} bed · ${u.area} m²</span><span class="tag st-${u.status}">${u.status === 'Available' ? esc(u.price) : u.status}</span></button></li>`).join('')}</ul><p class="key"><i class="st-Available"></i>Available<i class="st-Reserved"></i>Reserved<i class="st-Sold"></i>Sold</p>` : `<p>Entrance lobby, concierge, residents’ lounge and lifts.</p>`}
      <div class="row"><button class="btn ghost" type="button" data-3dfloor>See this floor in 3D</button></div></div>`;
    stage.querySelector('[data-back]').addEventListener('click', showBuilding);
    stage.querySelectorAll('[data-pick]').forEach(g => act(g, () => D.single ? showRoom(i, g.dataset.pick) : showUnit(g.dataset.pick)));
    stage.querySelector('[data-3dfloor]').addEventListener('click', () => open3d('&floor=' + i));
  }
  function showUnit(id) {
    const u = D.units[id], fi = u.floor; mark(fi); sub.textContent = '';
    stage.innerHTML = `<div class="stage-unit"><div class="crumbs"><button type="button" data-back>Back to ${esc(D.floors[fi].label.toLowerCase())}</button></div>
      <div class="unit-grid"><div class="unit-info"><p class="kicker">${esc(D.floors[fi].label)} · ${esc(u.aspect.split(',')[0])}</p><h3>${esc(u.name)}</h3>
        <p class="price">${u.status === 'Sold' ? 'Sold' : esc(u.price)} <span class="tag st-${u.status}">${u.status}</span></p>
        <dl class="mini"><div><dt>Bedrooms</dt><dd>${u.beds}</dd></div><div><dt>Bathrooms</dt><dd>${u.baths}</dd></div><div><dt>Size</dt><dd>${u.area} m²<small>${sqft(u.area)} sq ft</small></dd></div></dl>
        <ul class="ticks">${u.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
        <div class="keyplan">${levelPlan(fi, id)}</div>
        <div class="row"><button class="btn" type="button" data-v3d>View in 3D</button><button class="btn ghost" type="button" data-walk>Step inside</button><a class="btn ghost" href="#talk" data-enq>Enquire</a></div></div>
      <div class="plan-wrap paper">${unitPlan(fi, id)}</div></div></div>`;
    stage.querySelector('[data-back]').addEventListener('click', () => showLevel(fi));
    stage.querySelector('[data-v3d]').addEventListener('click', () => open3d('&unit=' + encodeURIComponent(id)));
    stage.querySelector('[data-walk]').addEventListener('click', () => open3d('&unit=' + encodeURIComponent(id) + '&walk=1'));
    stage.querySelector('[data-enq]').addEventListener('click', () => { $('[data-home-field]').value = u.name; });
    stage.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function showRoom(fi, id) {
    const r = D.floors[fi].rooms.find(q => q.id === id), note = D.notes && D.notes[id];
    stage.querySelector('.room-note')?.remove();
    stage.querySelector('.plan-wrap').after(el(`<div class="room-note"><h4>${esc(r.name)}</h4><p>${r.w.toFixed(1)} × ${r.d.toFixed(1)} m${note ? '. ' + esc(note) : ''}</p></div>`));
    stage.querySelectorAll('.unit').forEach(g => g.classList.toggle('hot', g.dataset.pick === id));
  }
  $$('[data-level]').forEach(g => act(g, () => showLevel(+g.dataset.level)));
  showBuilding();

  // ---------- rooms and amenities ----------
  if (C.feature) { $('[data-pentwalk]').addEventListener('click', () => open3d('&unit=' + encodeURIComponent(C.feature.unit) + '&walk=1&time=18.5')); $('[data-pentplan]').addEventListener('click', () => { showUnit(C.feature.unit); stage.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); }
  const light = $('[data-light]');
  $$('[data-room]').forEach(b => b.addEventListener('click', () => { const [t, n, d] = C.rooms[+b.dataset.room]; light.querySelector('img').src = img(n); light.querySelector('img').alt = t; light.querySelector('h3').textContent = t; light.querySelector('p').textContent = d; light.hidden = false; document.body.classList.add('locked'); light.querySelector('[data-lightx]').focus(); }));
  const closeLight = () => { light.hidden = true; document.body.classList.remove('locked'); };
  light.querySelector('[data-lightx]').addEventListener('click', closeLight); light.addEventListener('click', e => { if (e.target === light) closeLight(); });
  light.querySelector('[data-light3d]').addEventListener('click', () => { closeLight(); open3d(D.single ? '' : '&unit=' + encodeURIComponent(C.sample.unit) + '&walk=1'); });
  const amenImg = $('[data-amen-img]');
  $$('[data-amen]').forEach(b => { const pick = () => { const [t, n] = C.amenities[+b.dataset.amen]; $$('[data-amen]').forEach(x => x.classList.toggle('on', x === b)); amenImg.src = img(n); amenImg.alt = t; }; b.addEventListener('click', pick); b.addEventListener('mouseenter', pick); b.addEventListener('focus', pick); });
  addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (!viewer.hidden) close3d(); else if (!light.hidden) closeLight(); });

  // ---------- enquiry (demo: nothing is sent) ----------
  $('[data-form]').addEventListener('submit', e => { e.preventDefault(); const f = e.target, note = $('[data-form-note]'); if (!f.name.value.trim() || !/.+@.+\..+/.test(f.email.value)) { note.textContent = 'Add your name and an email address so we can reply.'; return; } note.textContent = `Thanks, ${f.name.value.trim().split(' ')[0]}. This is a demo, so nothing was sent. On a live site the sales team gets this at once, with the home you looked at.`; f.reset(); });

  // header appears once you leave the hero
  const bar = $('.bar'); new IntersectionObserver(([en]) => bar.classList.toggle('show', !en.isIntersecting), { rootMargin: '-80px 0px 0px 0px' }).observe($('.story'));
  window.__dev = { showLevel, showUnit, open3d, enter };
}
