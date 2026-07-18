#!/usr/bin/env node
// Έλεγχος end-to-end των API handlers ενάντια σε πραγματική Postgres.
// Τρέξε με: npm run test:e2e
//
// Οι έλεγχοι γράφουν και σβήνουν δεδομένα, οπότε τρέχουν σε ΔΙΚΟ ΤΟΥΣ schema
// (`e2e_test`) μέσα στην ίδια βάση: το schema φτιάχνεται στην αρχή, καταστρέφεται
// στο τέλος, και τα πραγματικά δεδομένα στο `public` δεν αγγίζονται ποτέ.
//
// Το φρένο του assertSafeToRun() παραμένει ως δεύτερη γραμμή άμυνας, για την
// περίπτωση που το DB_SCHEMA δεν εφαρμοστεί για οποιονδήποτε λόγο.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env.local') });

const TEST_SCHEMA = 'e2e_test';
process.env.DB_SCHEMA = TEST_SCHEMA;
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'e2e-secret-that-is-long-enough-000000';

// Το schema πρέπει να υπάρχει ΠΡΙΝ φορτωθεί το db.js (το pool συνδέεται με
// search_path που δείχνει εκεί).
{
  const { Pool, neonConfig } = await import('@neondatabase/serverless');
  const ws = (await import('ws')).default;
  if (typeof WebSocket === 'undefined') neonConfig.webSocketConstructor = ws;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  await admin.query(`drop schema if exists ${TEST_SCHEMA} cascade`);
  await admin.query(`create schema ${TEST_SCHEMA}`);
  await admin.end();
}

const { default: dataHandler } = await import(path.join(root, 'api/data.js'));
const { default: authHandler } = await import(path.join(root, 'api/auth.js'));
const { default: settlementsHandler } = await import(path.join(root, 'api/settlements.js'));
const { query } = await import(path.join(root, 'api/_lib/db.js'));
const { round2 } = await import(path.join(root, 'shared/finance.js'));

const TEST_PASSWORD = 'test-password-123';
const TEST_DATE = '2026-07-16';
const TEST_TAG = '__e2e__';

// Δεύτερη γραμμή άμυνας: αν για οποιονδήποτε λόγο δεν βρισκόμαστε στο schema των
// ελέγχων, σταματάμε πριν αγγίξουμε πραγματικά δεδομένα.
async function assertSafeToRun() {
  const { rows } = await query('select current_schema() as schema');
  if (rows[0].schema !== TEST_SCHEMA) {
    console.error(`✖ Οι έλεγχοι τρέχουν στο schema "${rows[0].schema}" αντί για "${TEST_SCHEMA}".`);
    console.error('  Σταματώ: δεν γράφω ποτέ σε πραγματικά δεδομένα.');
    process.exit(1);
  }
}

// Το schema των ελέγχων ξεκινά άδειο: του εφαρμόζουμε το ίδιο db/schema.sql με
// την παραγωγή, ώστε να ελέγχουμε το πραγματικό schema και όχι ένα αντίγραφο.
async function createTables() {
  const sql = await readFile(path.join(root, 'db', 'schema.sql'), 'utf8');
  await query(sql);
}

async function dropTestSchema() {
  await query(`drop schema if exists ${TEST_SCHEMA} cascade`);
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

async function call(handler, body, { withCookie = true, ip = '10.0.0.1' } = {}) {
  const headers = { 'x-real-ip': ip };
  if (withCookie && cookie) headers.cookie = cookie;
  const req = { method: 'POST', body, headers };
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
const settle = (body) => call(settlementsHandler, body);
const entry = (over = {}) => ({
  module: 'person', person: 'manos', amount: 12.34, description: TEST_TAG,
  date: TEST_DATE, settlementId: '', carryOverSettlementId: '', ...over,
});

await assertSafeToRun();
await createTables();

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

// ── Rate limiting ──────────────────────────────────────────────────────
const CURRENT_PASSWORD = 'νέος-κωδικός-123';
const ATTACKER_IP = '203.0.113.9';
const OWNER_IP = '198.51.100.5';
const login = (password, ip) => auth({ op: 'login', args: { password } }, { withCookie: false, ip });

await query('delete from login_attempt');
for (let i = 0; i < 5; i++) await login('λάθος', ATTACKER_IP);

// Ακόμη και με σωστό κωδικό, η κλειδωμένη IP απορρίπτεται.
const locked = await login(CURRENT_PASSWORD, ATTACKER_IP);
check('Μετά από 5 αποτυχίες η IP κλειδώνεται με 429', locked.statusCode === 429, `πήρε ${locked.statusCode}`);
check('Το μήνυμα κλειδώματος λέει πόσα λεπτά μένουν', /λεπτ/.test(locked.body?.error || ''), locked.body?.error);

// Το πιο σημαντικό: ο επιτιθέμενος ΔΕΝ κλειδώνει έξω τους ιδιοκτήτες.
const otherIp = await login(CURRENT_PASSWORD, OWNER_IP);
check('Άλλη IP δεν επηρεάζεται (δεν γίνεται lockout του ιδιοκτήτη)', otherIp.statusCode === 200, `πήρε ${otherIp.statusCode}`);

await query('delete from login_attempt');
await login('λάθος', OWNER_IP);
await login('λάθος', OWNER_IP);
await login(CURRENT_PASSWORD, OWNER_IP);
const afterSuccess = await query('select * from login_attempt where key = $1', [`login:${OWNER_IP}`]);
check('Η επιτυχής σύνδεση μηδενίζει τον μετρητή', afterSuccess.rows.length === 0, `έμειναν ${afterSuccess.rows.length}`);

// Σκόρπιες αποτυχίες σε βάθος χρόνου δεν πρέπει να συσσωρεύονται σε κλείδωμα.
await query('delete from login_attempt');
await query(`insert into login_attempt (key, "failedAttempts", updated_date) values ($1, 4, now() - interval '20 minutes')`, [`login:${OWNER_IP}`]);
await login('λάθος', OWNER_IP);
const windowed = await query('select "failedAttempts", "lockedUntil" from login_attempt where key = $1', [`login:${OWNER_IP}`]);
check('Αποτυχίες εκτός παραθύρου 15 λεπτών δεν συσσωρεύονται',
  windowed.rows[0]?.failedAttempts === 1 && !windowed.rows[0]?.lockedUntil, JSON.stringify(windowed.rows[0]));

// Το καθολικό δίχτυ πιάνει και IP που δεν έχει ξαναδοκιμάσει ποτέ.
await query('delete from login_attempt');
await query(`insert into login_attempt (key, "failedAttempts", "lockedUntil") values ('login:__global__', 0, now() + interval '15 minutes')`);
const globalLocked = await login(CURRENT_PASSWORD, '192.0.2.77');
check('Το καθολικό δίχτυ κλειδώνει ακόμη και άγνωστη IP', globalLocked.statusCode === 429, `πήρε ${globalLocked.statusCode}`);

await query('delete from login_attempt');
const recovered = await login(CURRENT_PASSWORD, ATTACKER_IP);
check('Με τη λήξη του κλειδώματος η σύνδεση ξαναδουλεύει', recovered.statusCode === 200, `πήρε ${recovered.statusCode}`);

// ── Επαναφορά κωδικού ──────────────────────────────────────────────────
// Δεν στέλνουμε αληθινά email: υποκλέπτουμε το fetch προς το Resend και
// κρατάμε το σώμα του αιτήματος, ώστε να ελέγξουμε και το περιεχόμενο.
const sentEmails = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('api.resend.com')) {
    sentEmails.push(JSON.parse(opts.body));
    return new Response(JSON.stringify({ id: 'test' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return realFetch(url, opts);
};
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 'test_key';

await query('delete from login_attempt');
await query('delete from password_reset');
const RESET_IP = '198.51.100.77';
const resetReq = (ip = RESET_IP) => auth({ op: 'requestReset' }, { withCookie: false, ip });

const statusReset = await auth({ op: 'status' }, { withCookie: false });
check('Το status λέει ότι η επαναφορά είναι δυνατή', statusReset.body?.canReset === true, JSON.stringify(statusReset.body));
check('Το status δεν αποκαλύπτει το email σε ανώνυμο', !('recoveryEmail' in (statusReset.body || {})));

const req1 = await resetReq();
check('Το αίτημα επαναφοράς πετυχαίνει', req1.statusCode === 200 && req1.body?.sent === true, JSON.stringify(req1.body));
check('Στάλθηκε ακριβώς ένα email', sentEmails.length === 1, `στάλθηκαν ${sentEmails.length}`);
check('Το email πήγε στο σωστό παραλήπτη', sentEmails[0]?.to?.[0] === 'a@b.gr', JSON.stringify(sentEmails[0]?.to));

const link = sentEmails[0]?.text?.match(/https?:\/\/\S+/)?.[0] || '';
const resetToken = new URL(link).searchParams.get('token');
check('Το email περιέχει σύνδεσμο με token', Boolean(resetToken) && resetToken.length > 20, link);
check('Ο σύνδεσμος δείχνει σε σταθερό domain, όχι στο Host header', link.startsWith('https://tameio2-app.vercel.app/reset-password'), link);
check('Το email ΔΕΝ περιέχει τον κωδικό', !sentEmails[0]?.text?.includes(CURRENT_PASSWORD) && !sentEmails[0]?.html?.includes(CURRENT_PASSWORD));

const storedRaw = await query('select "tokenHash" from password_reset');
check('Στη βάση αποθηκεύεται hash, όχι το ίδιο το token',
  storedRaw.rows[0]?.tokenHash !== resetToken && storedRaw.rows[0]?.tokenHash?.length === 64,
  storedRaw.rows[0]?.tokenHash);

const verifyOk = await auth({ op: 'verifyResetToken', args: { token: resetToken } }, { withCookie: false });
check('Το έγκυρο token επαληθεύεται', verifyOk.body?.valid === true);
const verifyBad = await auth({ op: 'verifyResetToken', args: { token: 'σκουπίδι' } }, { withCookie: false });
check('Άκυρο token απορρίπτεται στην επαλήθευση', verifyBad.body?.valid === false);

// Νέο αίτημα ακυρώνει το προηγούμενο token — ένα ενεργό κάθε φορά.
await resetReq();
const oldTokenVerify = await auth({ op: 'verifyResetToken', args: { token: resetToken } }, { withCookie: false });
check('Νέο αίτημα ακυρώνει το προηγούμενο token', oldTokenVerify.body?.valid === false);
const token2 = new URL(sentEmails[1].text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');

const shortPw = await auth({ op: 'resetPassword', args: { token: token2, password: 'ab' } }, { withCookie: false });
check('Η επαναφορά απορρίπτει κοντό κωδικό', shortPw.statusCode === 400, `πήρε ${shortPw.statusCode}`);

const RESET_PASSWORD = 'reset-κωδικός-9';
const doReset = await auth({ op: 'resetPassword', args: { token: token2, password: RESET_PASSWORD } }, { withCookie: false });
check('Η επαναφορά πετυχαίνει', doReset.statusCode === 200, JSON.stringify(doReset.body));
check('Η επαναφορά συνδέει τον χρήστη', Boolean(doReset.headers['Set-Cookie']));

const reuse = await auth({ op: 'resetPassword', args: { token: token2, password: 'άλλος-κωδικός' } }, { withCookie: false });
check('Το token δεν ξαναχρησιμοποιείται', reuse.statusCode === 400, `πήρε ${reuse.statusCode}`);

const loginNewPw = await login(RESET_PASSWORD, RESET_IP);
check('Ο νέος κωδικός δουλεύει μετά την επαναφορά', loginNewPw.statusCode === 200, `πήρε ${loginNewPw.statusCode}`);
const loginOldPw = await login(CURRENT_PASSWORD, RESET_IP);
check('Ο παλιός κωδικός δεν δουλεύει πια', loginOldPw.statusCode === 401, `πήρε ${loginOldPw.statusCode}`);

// Ληγμένο token
await query('delete from password_reset');
await resetReq();
const token3 = new URL(sentEmails[sentEmails.length - 1].text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');
await query(`update password_reset set "expiresAt" = now() - interval '1 minute'`);
const expired = await auth({ op: 'resetPassword', args: { token: token3, password: 'κάτι-νέο-123' } }, { withCookie: false });
check('Ληγμένο token απορρίπτεται', expired.statusCode === 400, `πήρε ${expired.statusCode}`);

// Το rate limit της επαναφοράς ΔΕΝ πρέπει να κλειδώνει το login.
await query('delete from login_attempt');
await query('delete from password_reset');
const FLOOD_IP = '203.0.113.55';
for (let i = 0; i < 6; i++) await resetReq(FLOOD_IP);
const flooded = await resetReq(FLOOD_IP);
check('Πολλά αιτήματα επαναφοράς κλειδώνονται (anti inbox-bombing)', flooded.statusCode === 429, `πήρε ${flooded.statusCode}`);
const loginStillOk = await login(RESET_PASSWORD, FLOOD_IP);
check('Το κλείδωμα επαναφοράς ΔΕΝ κλειδώνει το login', loginStillOk.statusCode === 200, `πήρε ${loginStillOk.statusCode}`);

// Επαναφορά της κατάστασης για τους επόμενους ελέγχους.
globalThis.fetch = realFetch;
await query('delete from login_attempt');
await query('delete from password_reset');
await auth({ op: 'login', args: { password: RESET_PASSWORD } }, { withCookie: false });
await auth({ op: 'updatePassword', args: { currentPassword: RESET_PASSWORD, password: CURRENT_PASSWORD, recoveryEmail: 'a@b.gr' } });

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
const setCreate = await data({ entity: 'Settings', op: 'create', args: { data: { targetReserve: 1500 } } });
check('Δημιουργία Settings', setCreate.statusCode === 200);
check('Τα ποσά Settings είναι numbers', typeof setCreate.body?.targetReserve === 'number');

const noFilter = await data({ entity: 'LedgerEntry', op: 'deleteMany', args: { where: {} } });
check('deleteMany χωρίς φίλτρο απορρίπτεται (όχι μαζική διαγραφή)', noFilter.statusCode === 400, `πήρε ${noFilter.statusCode}`);

// ── Μηνιαίο κλείσιμο ───────────────────────────────────────────────────
// Σενάριο με αριθμούς υπολογισμένους στο χέρι, κατά τον κανόνα του χρήστη:
//   στόχος 1000 | μετρημένο 500 | ταμείο χρωστάει: Μάνο 100, Ειρήνη 50 | Βοτανικός 30
//   μετά τη μεταφορά Βοτανικού: 500 - 30           = 470
//   πραγματικό υπόλοιπο:        470 - (100 + 50)   = 320
//   λείπουν:                    1000 - 320         = 680
//   μερίδιο:                    680 / 2            = 340
//   Μάνος:  340 - 100 = 240 · Ειρήνη: 340 - 50 = 290 → μπαίνουν 530 → κουτί 1000 ✓
await query('delete from ledger_entry');
await query('delete from settings');
await data({ entity: 'Settings', op: 'create', args: { data: { targetReserve: 1000 } } });
await data({ entity: 'LedgerEntry', op: 'bulkCreate', args: { items: [
  entry({ person: 'manos', amount: 100 }),
  entry({ person: 'eirini', amount: 50 }),
  entry({ module: 'botanicos', person: null, amount: 30 }),
] } });

// Ο client στέλνει και σκουπίδια μαζί: ο server πρέπει να τα αγνοήσει εντελώς
// και να ξαναϋπολογίσει τα πάντα από τη βάση.
const closed = await settle({ op: 'close', args: {
  enteredBalance: 500,
  shareEach: 999999, refillAmount: 999999, manosOwedAfter: -50000, targetReserve: 1,
} });
check('Το κλείσιμο πετυχαίνει', closed.statusCode === 200, JSON.stringify(closed.body));

const s = closed.body?.settlement;
check('Τα χρέη αφαιρούνται ΠΡΙΝ τον υπολογισμό (πραγματικό 320)', s?.enteredBalance === 320, `πήρε ${s?.enteredBalance}`);
check('refillAmount υπολογίστηκε στον server (680)', s?.refillAmount === 680, `πήρε ${s?.refillAmount}`);
check('shareEach υπολογίστηκε στον server (340)', s?.shareEach === 340, `πήρε ${s?.shareEach}`);
check('Αγνοήθηκε το targetReserve του client (1000)', s?.targetReserve === 1000, `πήρε ${s?.targetReserve}`);
check('Μάνος: offset 100', s?.manosOffset === 100, `πήρε ${s?.manosOffset}`);
check('Μάνος: συνεισφορά 240', s?.manosContribution === 240, `πήρε ${s?.manosContribution}`);
check('Αγνοήθηκε το manosOwedAfter του client (0)', s?.manosOwedAfter === 0, `πήρε ${s?.manosOwedAfter}`);
check('Ειρήνη: συνεισφορά 290', s?.eiriniContribution === 290, `πήρε ${s?.eiriniContribution}`);
check('Καταγράφηκε το υπόλοιπο Βοτανικού (30)', s?.botanicosBalanceBefore === 30, `πήρε ${s?.botanicosBalanceBefore}`);
// Ο πυρήνας του κανόνα: το κουτί πέφτει ΑΚΡΙΒΩΣ στον στόχο.
check('Το κουτί καταλήγει ακριβώς στον στόχο (1000)',
  round2(470 + s?.manosContribution + s?.eiriniContribution) === 1000,
  `πήρε ${round2(470 + s?.manosContribution + s?.eiriniContribution)}`);

const afterClose = (await data({ entity: 'LedgerEntry', op: 'list', args: { limit: 100 } })).body;
check('Όλες οι εγγραφές αρχειοθετήθηκαν', afterClose.every((e) => e.settlementId !== ''), JSON.stringify(afterClose.map((e) => e.settlementId)));
check('Δεν δημιουργήθηκαν carry-over (μηδενικά υπόλοιπα)', afterClose.length === 3, `βρέθηκαν ${afterClose.length}`);

const botList = (await data({ entity: 'BotanicosSettlement', op: 'list', args: {} })).body;
check('Δημιουργήθηκε και διακανονισμός Βοτανικού', botList.length === 1, `βρέθηκαν ${botList.length}`);

// Τα υπόλοιπα δεν αποθηκεύονται πουθενά — προκύπτουν από τις ενεργές εγγραφές.
// Μετά το κλείσιμο δεν έμεινε καμία ενεργή, άρα μηδενίζονται από μόνα τους.
const activeAfterClose = afterClose.filter((e) => e.settlementId === '');
check('Τα υπόλοιπα μηδενίστηκαν (καμία ενεργή εγγραφή)', activeAfterClose.length === 0, `έμειναν ${activeAfterClose.length}`);

const settingsAfter = (await data({ entity: 'Settings', op: 'list', args: {} })).body[0];
check('Οι ρυθμίσεις κρατούν μόνο το targetReserve', settingsAfter?.targetReserve === 1000 && !('manosOwed' in settingsAfter), JSON.stringify(settingsAfter));

// ── Αναίρεση κλεισίματος ───────────────────────────────────────────────
const undone = await settle({ op: 'undoClose' });
check('Η αναίρεση πετυχαίνει', undone.statusCode === 200, JSON.stringify(undone.body));

const afterUndo = (await data({ entity: 'LedgerEntry', op: 'list', args: { limit: 100 } })).body;
const personActive = afterUndo.filter((e) => e.module === 'person' && e.settlementId === '');
check('Οι εγγραφές ατόμων επανήλθαν ως ενεργές', personActive.length === 2, `βρέθηκαν ${personActive.length}`);
check('Ο διακανονισμός διαγράφηκε', (await data({ entity: 'Settlement', op: 'list', args: {} })).body.length === 0);

// Η αναίρεση δεν «επαναφέρει» αποθηκευμένα υπόλοιπα: επαναφέροντας τις εγγραφές
// ως ενεργές, τα υπόλοιπα επανέρχονται από μόνα τους. Αυτό ελέγχουμε.
const manosAfterUndo = personActive
  .filter((e) => e.person === 'manos')
  .reduce((s, e) => s + e.amount, 0);
check('Το υπόλοιπο του Μάνου επανήλθε στο 100 (από τις εγγραφές)', manosAfterUndo === 100, `πήρε ${manosAfterUndo}`);

// ── Αναίρεση ανά πρόσωπο ───────────────────────────────────────────────
// Ένα settlement είναι κοινό· η αναίρεση από το αρχείο ενός προσώπου πρέπει να
// επαναφέρει ΜΟΝΟ τις δικές του εγγραφές και να αφήνει άθικτο τον άλλον. Το
// settlement διαγράφεται μόνο όταν αδειάσουν και τα δύο.
await query('delete from ledger_entry');
await query('delete from settlement');
await data({ entity: 'LedgerEntry', op: 'bulkCreate', args: { items: [
  entry({ person: 'manos', amount: 100 }),
  entry({ person: 'eirini', amount: 60 }),
] } });
const perClose = await settle({ op: 'close', args: { enteredBalance: 500 } });
const perId = perClose.body?.settlement?.id;
check('Κλείσιμο για αναίρεση ανά πρόσωπο', perClose.statusCode === 200 && !!perId, JSON.stringify(perClose.body));

const perUndoM = await settle({ op: 'undoClose', args: { settlementId: perId, person: 'manos' } });
check('Αναίρεση μόνο του Μάνου πετυχαίνει', perUndoM.statusCode === 200, JSON.stringify(perUndoM.body));
const afterPerM = (await data({ entity: 'LedgerEntry', op: 'list', args: { limit: 100 } })).body;
check('Οι εγγραφές του Μάνου επανήλθαν ενεργές',
  afterPerM.some((e) => e.person === 'manos' && e.module === 'person' && e.settlementId === ''),
  JSON.stringify(afterPerM.map((e) => [e.person, e.settlementId])));
check('Οι εγγραφές της Ειρήνης ΠΑΡΑΜΕΝΟΥΝ αρχειοθετημένες',
  afterPerM.filter((e) => e.person === 'eirini' && e.module === 'person').every((e) => e.settlementId === perId),
  JSON.stringify(afterPerM.filter((e) => e.person === 'eirini').map((e) => e.settlementId)));
check('Το κοινό settlement δεν διαγράφηκε (μένει η Ειρήνη)',
  (await data({ entity: 'Settlement', op: 'list', args: {} })).body.length === 1);

const perUndoE = await settle({ op: 'undoClose', args: { settlementId: perId, person: 'eirini' } });
check('Αναίρεση και της Ειρήνης πετυχαίνει', perUndoE.statusCode === 200, JSON.stringify(perUndoE.body));
check('Με άδειο settlement, αυτό διαγράφεται',
  (await data({ entity: 'Settlement', op: 'list', args: {} })).body.length === 0);
await query('delete from ledger_entry');

// ── Πιστωτικό μεγαλύτερο από το μερίδιο ────────────────────────────────
// Το σενάριο που όρισε ο χρήστης: κανείς δεν βγάζει μετρητά· ό,τι περισσεύει
// μεταφέρεται.
//   στόχος 1000 | μετρημένο 990 | ταμείο χρωστάει στον Μάνο 100
//   πραγματικό = 990 - 100 = 890 · λείπουν 110 · μερίδιο 55
//   Μάνος: offset 55 (όχι 100) → βάζει 0, του μένουν 45 πιστωτικό
//   Ειρήνη: βάζει 55
//   μετρητά 990 + 55 = 1045 · ΠΡΑΓΜΑΤΙΚΗ θέση 1045 - 45 = 1000 ✓
await query('delete from ledger_entry');
await data({ entity: 'LedgerEntry', op: 'create', args: { data: entry({ person: 'manos', amount: 100 }) } });
const close2 = await settle({ op: 'close', args: { enteredBalance: 990 } });
check('2ο κλείσιμο πετυχαίνει', close2.statusCode === 200, JSON.stringify(close2.body));
const s2 = close2.body?.settlement;
check('Το offset δεν ξεπερνά το μερίδιο (55, όχι 100)', s2?.manosOffset === 55, `πήρε ${s2?.manosOffset}`);
check('Μάνος δεν βγάζει μετρητά (βάζει 0)', s2?.manosContribution === 0, `πήρε ${s2?.manosContribution}`);
check('Μάνος: μένει πιστωτικό 45', s2?.manosOwedAfter === 45, `πήρε ${s2?.manosOwedAfter}`);
check('Ειρήνη βάζει 55', s2?.eiriniContribution === 55, `πήρε ${s2?.eiriniContribution}`);
check('Η ΠΡΑΓΜΑΤΙΚΗ θέση πέφτει στον στόχο (1045 - 45 = 1000)',
  round2(990 + s2?.manosContribution + s2?.eiriniContribution - s2?.manosOwedAfter) === 1000,
  `πήρε ${round2(990 + s2?.manosContribution + s2?.eiriniContribution - s2?.manosOwedAfter)}`);

const carry = (await data({ entity: 'LedgerEntry', op: 'filter', args: { where: { carryOverSettlementId: s2?.id } } })).body;
check('Δημιουργήθηκε εγγραφή μεταφοράς', carry.length === 1, `βρέθηκαν ${carry.length}`);
check('Η μεταφορά έχει ποσό 45 και είναι ενεργή', carry[0]?.amount === 45 && carry[0]?.settlementId === '', JSON.stringify(carry[0]));
check('Η μεταφορά περιγράφεται ως πίστωση', /Πίστωση/.test(carry[0]?.description || ''), carry[0]?.description);

const undo2 = await settle({ op: 'undoClose' });
check('Η αναίρεση σβήνει τη μεταφορά', undo2.statusCode === 200 &&
  (await data({ entity: 'LedgerEntry', op: 'list', args: { limit: 100 } })).body.length === 1);

// ── Χειροκίνητο ποσό κατάθεσης ─────────────────────────────────────────
// στόχος 1000, μετρημένο 500, Μάνος χρωστάει 100 (amount -100)
//   πραγματικό = 500 + 100 = 600 · λείπουν 400 · μερίδιο 200
//   Μάνος: 200 + 100 = 300 · Ειρήνη: 200
await query('delete from ledger_entry');
await data({ entity: 'LedgerEntry', op: 'create', args: { data: entry({ person: 'manos', amount: -100 }) } });

// (α) Καταθέτει ΠΑΡΑΠΑΝΩ (στρογγυλοποίηση 300 → 320): πίστωση 20.
const over = await settle({ op: 'close', args: { enteredBalance: 500, contributions: { manos: 320, eirini: 200 } } });
check('Κατάθεση μεγαλύτερη από το υπολογισμένο γίνεται δεκτή', over.statusCode === 200, JSON.stringify(over.body));
check('Καταγράφηκε το πραγματικό ποσό (320)', over.body?.settlement?.manosContribution === 320, `πήρε ${over.body?.settlement?.manosContribution}`);
check('Η διαφορά έγινε πίστωση (+20)', over.body?.settlement?.manosOwedAfter === 20, `πήρε ${over.body?.settlement?.manosOwedAfter}`);
const overCarry = (await data({ entity: 'LedgerEntry', op: 'filter', args: { where: { carryOverSettlementId: over.body?.settlement?.id } } })).body;
check('Η πίστωση έγινε ξεχωριστή εγγραφή (+20)', overCarry.length === 1 && overCarry[0]?.amount === 20, JSON.stringify(overCarry));
await settle({ op: 'undoClose' });

// (β) Καταθέτει ΛΙΓΟΤΕΡΑ (δεν έχει να πληρώσει): χρέος για τον επόμενο μήνα.
const under = await settle({ op: 'close', args: { enteredBalance: 500, contributions: { manos: 0, eirini: 200 } } });
check('Κατάθεση 0 γίνεται δεκτή (δεν έχει να πληρώσει)', under.statusCode === 200, JSON.stringify(under.body));
check('Όλο το ποσό έγινε χρέος (-300)', under.body?.settlement?.manosOwedAfter === -300, `πήρε ${under.body?.settlement?.manosOwedAfter}`);
const underCarry = (await data({ entity: 'LedgerEntry', op: 'filter', args: { where: { carryOverSettlementId: under.body?.settlement?.id } } })).body;
check('Το χρέος έγινε ξεχωριστή εγγραφή (-300)', underCarry.length === 1 && underCarry[0]?.amount === -300, JSON.stringify(underCarry));
check('Το χρέος περιγράφεται ως οφειλή', /Οφειλή/.test(underCarry[0]?.description || ''), underCarry[0]?.description);
// Το ισοζύγιο κλείνει όσα κι αν κατατεθούν: μετρητά 500+0+200=700, χρέος 300 → 1000.
check('Η ΠΡΑΓΜΑΤΙΚΗ θέση πέφτει στον στόχο ακόμη και με μηδενική κατάθεση',
  round2(500 + 0 + 200 - under.body?.settlement?.manosOwedAfter) === 1000,
  `πήρε ${round2(500 + 0 + 200 - under.body?.settlement?.manosOwedAfter)}`);
await settle({ op: 'undoClose' });

// ── Διακανονισμός Βοτανικού μεμονωμένα ─────────────────────────────────
await query('delete from ledger_entry');
await data({ entity: 'LedgerEntry', op: 'create', args: { data: entry({ module: 'botanicos', person: null, amount: 42 }) } });
const bsettle = await settle({ op: 'botanicosSettle' });
check('Διακανονισμός Βοτανικού', bsettle.statusCode === 200 && bsettle.body?.settlement?.balanceBefore === 42, JSON.stringify(bsettle.body));

const bundo = await settle({ op: 'undoBotanicos' });
const botAfter = (await data({ entity: 'LedgerEntry', op: 'list', args: { limit: 100 } })).body;
check('Αναίρεση Βοτανικού επαναφέρει την εγγραφή', bundo.statusCode === 200 && botAfter[0]?.settlementId === '');

// ── Μήνας αρχειοθέτησης από τις εγγραφές, όχι από το «τώρα» ─────────────
// Ο χρήστης κλείνει στις αρχές του επόμενου μήνα· ο τίτλος πρέπει να δείχνει
// τον μήνα των εγγραφών (εδώ: Μάρτιος 2025), όχι τον τρέχοντα.
await query('delete from ledger_entry');
await query('delete from settlement');
await query('delete from botanicos_settlement');
await data({ entity: 'LedgerEntry', op: 'bulkCreate', args: { items: [
  entry({ person: 'manos', amount: 40, date: '2025-03-10' }),
  entry({ module: 'botanicos', person: null, amount: 15, date: '2025-03-12' }),
] } });
const periodClose = await settle({ op: 'close', args: { enteredBalance: 500 } });
check('Ο μήνας του κλεισίματος βγαίνει από τις εγγραφές (Μάρτιος 2025)',
  periodClose.body?.settlement?.month === 3 && periodClose.body?.settlement?.year === 2025,
  `πήρε ${periodClose.body?.settlement?.month}/${periodClose.body?.settlement?.year}`);
const periodBot = (await data({ entity: 'BotanicosSettlement', op: 'list', args: {} })).body[0];
check('Ο διακανονισμός Βοτανικού παίρνει κι αυτός τον μήνα των εγγραφών',
  periodBot?.month === 3 && periodBot?.year === 2025, `πήρε ${periodBot?.month}/${periodBot?.year}`);
await settle({ op: 'undoClose' });
await settle({ op: 'undoBotanicos' });
await query('delete from ledger_entry');

const emptyUndo = await settle({ op: 'undoClose' });
check('Αναίρεση χωρίς κλείσιμο απορρίπτεται καθαρά', emptyUndo.statusCode === 404, `πήρε ${emptyUndo.statusCode}`);

const anonSettle = { method: 'POST', body: { op: 'close', args: { enteredBalance: 1 } }, headers: {} };
const anonSettleRes = mockRes();
await settlementsHandler(anonSettle, anonSettleRes);
check('Ανώνυμο κλείσιμο απορρίπτεται με 401', anonSettleRes.statusCode === 401, `πήρε ${anonSettleRes.statusCode}`);

await query('delete from ledger_entry');
await query('delete from botanicos_settlement');
await query('delete from settlement');
await query('delete from settings');

// ── Καθαρισμός ─────────────────────────────────────────────────────────
// Ολόκληρο το schema των ελέγχων εξαφανίζεται· τα πραγματικά δεδομένα στο
// `public` δεν αγγίχθηκαν ποτέ.
await dropTestSchema();

// ── Σύνοψη ─────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} πέρασαν`);
if (failed.length) {
  console.log('ΑΠΕΤΥΧΑΝ:');
  failed.forEach((f) => console.log(`  ✖ ${f.name}${f.detail ? ` — ${f.detail}` : ''}`));
}
process.exit(failed.length ? 1 : 0);
