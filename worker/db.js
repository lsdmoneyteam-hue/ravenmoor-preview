// Database set-up. Each step runs once, in order; the step number is kept in `meta`.
// To change the schema, add a new step at the end. Never edit an old one.

const STEPS = [
  // 1: enquiries
  [
    "CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, agency TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, listing TEXT NOT NULL, style TEXT NOT NULL DEFAULT '', ref TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'new', tg_ok INTEGER, mail_ok INTEGER)",
    'CREATE INDEX IF NOT EXISTS leads_created ON leads (created_at)',
  ],
  // 2: tracking and the dashboard
  [
    'ALTER TABLE leads ADD COLUMN vid TEXT',
    // Anonymous totals. No visitor in here, only how many times something happened that day.
    'CREATE TABLE IF NOT EXISTS counts (day TEXT NOT NULL, key TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, key))',
    // People who pressed Accept: one row per browser, and what it did.
    "CREATE TABLE IF NOT EXISTS visitors (vid TEXT PRIMARY KEY, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, visits INTEGER NOT NULL DEFAULT 1, device TEXT NOT NULL DEFAULT '', ref TEXT NOT NULL DEFAULT '', hot_day TEXT NOT NULL DEFAULT '', lead_id INTEGER)",
    "CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, vid TEXT NOT NULL, sid TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '')",
    'CREATE INDEX IF NOT EXISTS events_vid ON events (vid, ts)',
    'CREATE INDEX IF NOT EXISTS events_ts ON events (ts)',
    // Who is on the site right now. Rows are dropped a few minutes after the page goes quiet.
    "CREATE TABLE IF NOT EXISTS presence (pid TEXT PRIMARY KEY, vid TEXT NOT NULL DEFAULT '', seen INTEGER NOT NULL, section TEXT NOT NULL DEFAULT '', device TEXT NOT NULL DEFAULT '')",
    'CREATE INDEX IF NOT EXISTS presence_seen ON presence (seen)',
    // One-time dashboard login links (only a hash of the token is kept).
    'CREATE TABLE IF NOT EXISTS logins (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL)',
  ],
];

let readyPromise = null;

// Resolves once the schema is current. Cheap after the first call in an isolate.
export function ready(env) {
  if (!readyPromise) {
    readyPromise = migrate(env).catch((err) => { readyPromise = null; throw err; });
  }
  return readyPromise;
}

async function migrate(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)').run();
  const row = await env.DB.prepare("SELECT v FROM meta WHERE k = 'schema'").first();
  let at = row ? Number(row.v) || 0 : 0;
  while (at < STEPS.length) {
    const next = at + 1;
    const batch = STEPS[at].map((sql) => env.DB.prepare(sql));
    batch.push(env.DB.prepare("INSERT INTO meta (k, v) VALUES ('schema', ?1) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(String(next)));
    await env.DB.batch(batch); // one transaction: a step lands whole or not at all
    at = next;
  }
}
