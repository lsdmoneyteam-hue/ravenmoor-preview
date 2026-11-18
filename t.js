/* Ravenmoor site statistics.
   Everyone: anonymous counts only. Nothing is stored in the browser and no ID is sent
   that outlives this page.
   If you pressed Accept: a random ID is kept in this browser (localStorage "rd-vid") so
   visits can be joined up.
   Opted out on the Cookies page, or your browser sends Global Privacy Control: nothing is sent. */
(function () {
  'use strict';
  var W = window, D = document, N = navigator;
  function get(k) { try { return W.localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { W.localStorage.setItem(k, v); } catch (e) {} }
  function del(k) { try { W.localStorage.removeItem(k); } catch (e) {} }

  if (get('rd-stats') === 'off' || N.globalPrivacyControl) { del('rd-vid'); return; }
  if (!W.crypto || !W.crypto.getRandomValues || !W.JSON) return;

  function hex(n) {
    var a = new Uint8Array(n), s = '';
    W.crypto.getRandomValues(a);
    for (var i = 0; i < n; i++) s += ('0' + a[i].toString(16)).slice(-2);
    return s;
  }

  var URL_ = '/api/e';
  var pid = hex(8);            // lives in memory only, new on every page load
  var queue = [], first = true, cur = '', curSince = Date.now(), seen = {}, exited = false;
  var started = Date.now(), lastSend = 0;

  function vid() {
    if (get('rd-cookie') !== 'accepted') return '';
    var v = get('rd-vid');
    if (!/^[a-f0-9]{32}$/.test(v || '')) { v = hex(16); set('rd-vid', v); }
    return v;
  }

  function device() {
    var coarse = W.matchMedia && W.matchMedia('(pointer: coarse)').matches;
    var w = Math.min(W.innerWidth || 0, (W.screen && W.screen.width) || 9999);
    return coarse ? (w < 760 ? 'phone' : 'tablet') : 'desktop';
  }

  function refHost() {
    try { var h = new URL(D.referrer).hostname; return h === W.location.hostname ? '' : h; } catch (e) { return ''; }
  }

  function ev(name, detail) {
    name = String(name).toLowerCase().replace(/[^a-z0-9:_-]/g, '-').slice(0, 48);
    if (!/^[a-z0-9]/.test(name)) return;
    queue.push(detail == null ? [name] : [name, String(detail).slice(0, 60)]);
    if (queue.length >= 20) send(false);
  }

  function send(leaving) {
    if (!queue.length && !first && !leaving && Date.now() - lastSend < 19000) return;
    var body = { p: pid, d: device(), s: cur, e: queue };
    var v = vid();
    if (v) body.v = v;
    if (first) { body.n = 1; body.r = refHost(); first = false; }
    queue = [];
    lastSend = Date.now();
    var data = JSON.stringify(body);
    try {
      if (leaving && N.sendBeacon) { N.sendBeacon(URL_, new Blob([data], { type: 'application/json' })); return; }
      W.fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body: data, keepalive: true, credentials: 'omit' }).catch(function () {});
    } catch (e) {}
  }

  /* Which section is in the middle of the screen, and for how long. */
  function leaveSection() {
    var secs = Math.round((Date.now() - curSince) / 1000);
    if (cur && secs >= 3) ev('dwell:' + cur, Math.min(secs, 1800));
    curSince = Date.now();
  }
  function enter(id) {
    if (id === cur) return;
    leaveSection();
    cur = id;
    if (!seen[id]) { seen[id] = 1; ev('section:' + id); }
  }

  var MAP = [
    ['hero', 'section[aria-label="The Ravenmoor film"]'], ['proof', 'section.proof'], ['how', 'section[aria-label="How it works"]'],
    ['styles', '#styles'], ['before', 'section[aria-labelledby="ba-h"]'], ['plans', '#plans'], ['presenter', '#presenter'],
    ['prices', '#prices'], ['sample', '#sample'], ['footer', 'footer.ftr']
  ];
  function watch() {
    if (!('IntersectionObserver' in W)) return true;
    if (!D.querySelector('#sample')) return false;      // the page has not rendered yet
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) if (entries[i].isIntersecting) enter(entries[i].target.getAttribute('data-rd-sec'));
    }, { rootMargin: '-49% 0px -49% 0px', threshold: 0 });
    for (var i = 0; i < MAP.length; i++) {
      var el = D.querySelector(MAP[i][1]);
      if (el) { el.setAttribute('data-rd-sec', MAP[i][0]); io.observe(el); }
    }
    return true;
  }
  var tries = 0;
  (function wait() { if (!watch() && ++tries < 60) W.setTimeout(wait, 500); })();

  /* Clicks on anything the page marked with data-track. */
  D.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-track]') : null;
    if (!t) return;
    var name = t.getAttribute('data-track') || '';
    if (!name || name.indexOf('{{') === 0) return;
    if (name === 'cookie-reject') del('rd-vid');
    ev('click:' + name);
    if (name === 'cookie-accept') W.setTimeout(function () { send(false); }, 400);
  }, true);

  /* The page fires this once an enquiry has been saved. */
  W.addEventListener('rd:lead', function () { ev('lead'); send(false); });

  /* Sending: soon after anything happens, and a quiet signal every 20s while the tab is in view. */
  W.setInterval(function () {
    if (D.hidden || Date.now() - started > 30 * 60000) return;
    if (queue.length || Date.now() - lastSend >= 19000) send(false);
  }, 5000);

  function bye(final) {
    leaveSection();
    if (final && !exited) { exited = true; ev('exit:' + (cur || 'hero')); }
    send(true);
  }
  D.addEventListener('visibilitychange', function () { if (D.hidden) bye(false); else curSince = Date.now(); });
  W.addEventListener('pagehide', function () { bye(true); });

  enter('hero');
  W.setTimeout(function () { send(false); }, 1200);
})();
