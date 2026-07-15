#!/usr/bin/env node
// Έλεγχος end-to-end των API handlers ενάντια σε πραγματική βάση.
// Τρέξε με: npm run test:e2e
//
// ⚠ ΚΑΤΑΣΤΡΟΦΙΚΟ: γράφει και σβήνει δεδομένα. Τρέχει ΜΟΝΟ σε άδεια βάση —
// δες το assertSafeToRun() παρακάτω. Μην το στρέψεις ποτέ σε βάση με
// πραγματικά δεδομένα.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env.local') });

const { default: dataHandler } = await import(path.join(root, 'api/data.js'));
const { default: authHandler } = await import(path.join(root, 'api/auth.js'));
const { query } = await import(path.join(root, 'api/_lib/db.js'));

const TEST_PASSWORD = 'test-password-123';
const TEST_DATE = '2026-07-16';
const TEST_TAG = '__e2e__';

// Το φρένο: ο έλεγχος σβήνει τον κωδικό και εγγραφές. Αν η βάση περιέχει
// οτιδήποτε πραγματικό, σταματάμε πριν κάνουμε ζημιά.
async function assertSafeToRun() {
  const { rows } = await query(`
    select
      (select count(*) from ledger_entry where description <> '${TEST_TAG}') as entries,
      (select count(*) from settlement) as settlements,
      (select count(*) from botanicos_settlement) as botanicos
  `);
  const { entries, settlements, botanicos } = rows[0];
  const total = Number(entries) + Number(settlements) + Number(botanicos);
  if (total > 0) {
    console.error('✖ Η βάση περιέχει πραγματικά δεδομένα — ο έλεγχος ΔΕΝ θα τρέξει.');
    console.error(`  εγγραφές: ${entries}, διακανονισμοί: ${settlements}, βοτανικός: ${botanicos}`);
    console.error('  Στρέψε το DATABASE_URL σε άδεια βάση (π.χ. Neon branch) και ξαναδοκίμασε.');
    process.exit(1);
  }
}

let cookie = null;
const results = [];

function mockRes() {
  const res = { headers: {}, statusCode: null, body: null };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

async function call(handler, body, { withCookie = true } = {}) {
  const req = { method: 'POST', body, headers: withCookie && cookie ? { cookie } : {} };
  const res = mockRes();
  await handler(req, res);
  const setCookie = res.headers['Set-Cookie'];
  if (setCookie) cookie = setCookie.split(';')[0];
  return res;
}

function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? '✔' : '✖'} ${name}${detail && !cond ? ` — ${detail}` : ''}`);
}

const data = (body) => call(dataHandler, body);
const auth = (body, o) => call(authHandler, body, o);
const entry = (over = {}) => ({
  module: 'person', person: 'manos', amount: 12.34, description: TEST_TAG,
  date: TEST_DATE, settlementId: '', carryOverSettlementId: '', ...over,
});

await assertSafeToRun();
await query('delete from app_config');

// ── Auth ───────────────────────────────────────────────────────────────
const anon = await data({ entity: 'Settings', op: 'list', args: {} });
check('Ανώνυμο αίτημα δεδομένων απορρίπτεται με 401', anon.statusCode === 401, `πήρε ${anon.statusCode}`);

const status0 = await auth({ op: 'status' });
check('Το status δουλεύει χωρίς σύνδεση', status0.statusCode === 200);
check('Το status δεν διαρρέει recoveryEmail σε ανώνυμο', !('recoveryEmail' in (status0.body || {})));
check('Καθαρή βάση αναφέρεται ως μη-initialized', status0.body.initialized === false);

const short = await auth({ op: 'setup', args: { password: 'abc' } });
check('Απορρίπτεται κοντός κωδικός στο setup', short.statusCode === 400, `πήρε ${short.statusCode}`);

const setup = await auth({ op: 'setup', args: { password: TEST_PASSWORD, recoveryEmail: 'a@b.gr' } });
check('Το setup πετυχαίνει και δίνει session', setup.statusCode === 200 && !!cookie);

const reSetup = await auth({ op: 'setup', args: { password: 'attacker' } });
check('Δεύτερο setup απορρίπτεται (δεν γίνεται κατάληψη)', reSetup.statusCode === 409, `πήρε ${reSetup.statusCode}`);

const badLogin = await auth({ op: 'login', args: { password: 'λάθος' } }, { withCookie: false });
check('Λάθος κωδικός απορρίπτεται με 401', badLogin.statusCode === 401, `πήρε ${badLogin.statusCode}`);

const goodLogin = await auth({ op: 'login', args: { password: TEST_PASSWORD } }, { withCookie: false });
check('Σωστός κωδικός συνδέει', goodLogin.statusCode === 200);

const authedStatus = await auth({ op: 'status' });
check('Το status δίνει recoveryEmail σε συνδεδεμένο', authedStatus.body?.recoveryEmail === 'a@b.gr');

const wrongCurrent = await auth({ op: 'updatePassword', args: { currentPassword: 'λάθος', password: 'νέος-κωδικός-123' } });
check('Αλλαγή κωδικού με λάθος τρέχοντα απορρίπτεται', wrongCurrent.statusCode === 401, `πήρε ${wrongCurrent.statusCode}`);

const okChange = await auth({ op: 'updatePassword', args: { currentPassword: TEST_PASSWORD, password: 'νέος-κωδικός-123' } });
check('Αλλαγή κωδικού με σωστό τρέχοντα πετυχαίνει', okChange.statusCode === 200);

const loginNew = await auth({ op: 'login', args: { password: 'νέος-κωδικός-123' } }, { withCookie: false });
check('Ο νέος κωδικός δουλεύει', loginNew.statusCode === 200);

const forgedReq = { method: 'POST', body: { entity: 'Settings', op: 'list', args: {} }, headers: { cookie: 'tameio_session=9999999999999.πλαστό' } };
const forgedRes = mockRes();
await dataHandler(forgedReq, forgedRes);
check('Πλαστό cookie απορρίπτεται', forgedRes.statusCode === 401, `πήρε ${forgedRes.statusCode}`);

// ── Whitelist / injection ──────────────────────────────────────────────
const badEntity = await data({ entity: 'app_config', op: 'list', args: {} });
check('Το app_config δεν είναι προσβάσιμο μέσω data API', badEntity.statusCode === 400, `πήρε ${badEntity.statusCode}`);

const badSort = await data({ entity: 'LedgerEntry', op: 'list', args: { sort: '-id; drop table ledger_entry' } });
check('Κακόβουλο sort απορρίπτεται', badSort.statusCode === 400, `πήρε ${badSort.statusCode}`);

const badFilter = await data({ entity: 'LedgerEntry', op: 'filter', args: { where: { 'x"; drop table ledger_entry; --': 1 } } });
check('Κακόβουλο filter key απορρίπτεται', badFilter.statusCode === 400, `πήρε ${badFilter.statusCode}`);

// ── CRUD + τύποι ───────────────────────────────────────────────────────
const created = await data({ entity: 'LedgerEntry', op: 'create', args: { data: entry() } });
check('Δημιουργία εγγραφής', created.statusCode === 200 && !!created.body?.id, JSON.stringify(created.body));
const entryId = created.body?.id;

check('Το amount επιστρέφεται ως number', typeof created.body?.amount === 'number', `τύπος: ${typeof created.body?.amount}`);
check('Το amount έχει σωστή τιμή', created.body?.amount === 12.34, `τιμή: ${created.body?.amount}`);
// Regression: ο driver γύριζε τη date σε Date τοπικής ζώνης και η μετατροπή σε
// UTC την έριχνε μια μέρα πίσω — και ξαναγραφόταν χαλασμένη στο επόμενο update.
check('Η date δεν μετακινείται λόγω ζώνης ώρας', created.body?.date === TEST_DATE, `τιμή: ${created.body?.date}`);
check('Το camelCase settlementId διατηρείται', 'settlementId' in (created.body || {}));

const violation = await data({ entity: 'LedgerEntry', op: 'create', args: { data: { module: 'person', amount: 5, date: TEST_DATE } } });
check('Εγγραφή person χωρίς πρόσωπο απορρίπτεται (constraint)', violation.statusCode >= 400, `πήρε ${violation.statusCode}`);

const filtered = await data({ entity: 'LedgerEntry', op: 'filter', args: { where: { module: 'person', settlementId: '' }, sort: '-date', limit: 10 } });
check('Filter σε camelCase στήλη', filtered.statusCode === 200 && Array.isArray(filtered.body));

const updated = await data({ entity: 'LedgerEntry', op: 'update', args: { id: entryId, data: { amount: 99.99 } } });
check('Ενημέρωση εγγραφής', updated.body?.amount === 99.99, `τιμή: ${updated.body?.amount}`);

// Οι σελίδες στέλνουν πίσω ολόκληρο το row· δεν πρέπει να σκάει στα id/created_date
const roundTrip = await data({ entity: 'LedgerEntry', op: 'update', args: { id: entryId, data: { ...updated.body, amount: 5.5 } } });
check('Update με ολόκληρο row (αγνοεί id/created_date)', roundTrip.body?.amount === 5.5);
check('Η date επιβιώνει του round-trip', roundTrip.body?.date === TEST_DATE, `τιμή: ${roundTrip.body?.date}`);

const bulk = await data({ entity: 'LedgerEntry', op: 'bulkCreate', args: { items: [
  entry({ module: 'botanicos', person: null, amount: 10 }),
  entry({ module: 'botanicos', person: null, amount: 20 }),
] } });
check('bulkCreate', bulk.statusCode === 200 && bulk.body?.length === 2, JSON.stringify(bulk.body));

const bulkUpd = await data({ entity: 'LedgerEntry', op: 'bulkUpdate', args: {
  items: (bulk.body || []).map((e) => ({ id: e.id, settlementId: 'test-settlement' })),
} });
check('bulkUpdate', bulkUpd.body?.length === 2 && bulkUpd.body[0].settlementId === 'test-settlement');

// ── Ατομικότητα ────────────────────────────────────────────────────────
const before = (await data({ entity: 'LedgerEntry', op: 'list', args: { limit: 1000 } })).body.length;
const badBulk = await data({ entity: 'LedgerEntry', op: 'bulkCreate', args: { items: [
  entry({ module: 'botanicos', person: null, amount: 1 }),
  entry({ module: 'ΑΚΥΡΟ', amount: 2 }),  // παραβιάζει το check constraint
] } });
const after = (await data({ entity: 'LedgerEntry', op: 'list', args: { limit: 1000 } })).body.length;
check('Αποτυχία στη μέση bulkCreate κάνει rollback και τα δύο', badBulk.statusCode >= 400 && before === after,
  `πριν ${before}, μετά ${after}`);

// ── Settings ───────────────────────────────────────────────────────────
const setCreate = await data({ entity: 'Settings', op: 'create', args: { data: { targetReserve: 1500, manosOwed: 0, eiriniOwed: 0, botanicosBalance: 0 } } });
check('Δημιουργία Settings', setCreate.statusCode === 200);
check('Τα ποσά Settings είναι numbers', typeof setCreate.body?.targetReserve === 'number');

const noFilter = await data({ entity: 'LedgerEntry', op: 'deleteMany', args: { where: {} } });
check('deleteMany χωρίς φίλτρο απορρίπτεται (όχι μαζική διαγραφή)', noFilter.statusCode === 400, `πήρε ${noFilter.statusCode}`);

// ── Καθαρισμός ─────────────────────────────────────────────────────────
await data({ entity: 'LedgerEntry', op: 'deleteMany', args: { where: { description: TEST_TAG } } });
await data({ entity: 'Settings', op: 'delete', args: { id: setCreate.body?.id } });
await query('delete from app_config');

const leftover = await query(`
  select
    (select count(*) from ledger_entry) as entries,
    (select count(*) from settings) as settings,
    (select count(*) from app_config) as config
`);
const l = leftover.rows[0];
check('Η βάση επανήλθε καθαρή', Number(l.entries) + Number(l.settings) + Number(l.config) === 0,
  `εγγραφές ${l.entries}, settings ${l.settings}, config ${l.config}`);

// ── Σύνοψη ─────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} πέρασαν`);
if (failed.length) {
  console.log('ΑΠΕΤΥΧΑΝ:');
  failed.forEach((f) => console.log(`  ✖ ${f.name}${f.detail ? ` — ${f.detail}` : ''}`));
}
process.exit(failed.length ? 1 : 0);
