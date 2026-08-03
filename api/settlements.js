import { transaction } from './_lib/db.js';
import { ENTITIES, deserializeRow, HttpError } from './_lib/entities.js';
import { requireAuth } from './_lib/session.js';
import { round2, sumActive, computeMonthlyClose, applyActualContribution } from '../shared/finance.js';

// Οι λειτουργίες διακανονισμού αγγίζουν 4 πίνακες. Ζουν εδώ, και όχι στο
// /api/data, για δύο λόγους:
//
// 1. Ατομικότητα. Σαν ξεχωριστές κλήσεις, μια αποτυχία στη μέση άφηνε το ταμείο
//    με μισοπερασμένο διακανονισμό — αρχειοθετημένες εγγραφές χωρίς settlement,
//    ή settlement χωρίς ενημερωμένα υπόλοιπα.
// 2. Εμπιστοσύνη. Τα ποσά τα υπολογίζει ο server από τις εγγραφές της βάσης. Ο
//    client στέλνει μόνο το μετρημένο υπόλοιπο· δεν μπορεί να υπαγορεύσει
//    οφειλές, μερίδια ή carry-over.

const LEDGER = ENTITIES.LedgerEntry;

async function loadEntries(client) {
  const { rows } = await client.query('select * from ledger_entry');
  return rows.map((r) => deserializeRow(LEDGER, r));
}

// Το targetReserve είναι απαραίτητο για το κλείσιμο· αν λείπει η γραμμή
// ρυθμίσεων, τη δημιουργούμε με μηδενικό στόχο όπως κάνει και το frontend.
async function loadSettings(client) {
  const { rows } = await client.query('select * from settings order by created_date asc limit 1');
  if (rows[0]) return deserializeRow(ENTITIES.Settings, rows[0]);
  const created = await client.query('insert into settings ("targetReserve") values (0) returning *');
  return deserializeRow(ENTITIES.Settings, created.rows[0]);
}

function archiveEntries(client, ids, settlementId) {
  if (!ids.length) return Promise.resolve();
  return client.query('update ledger_entry set "settlementId" = $1, updated_date = now() where id = any($2::uuid[])', [settlementId, ids]);
}

// Ο μήνας μιας αρχειοθέτησης είναι ο μήνας στον οποίο ανήκουν οι εγγραφές — όχι
// η στιγμή του κλεισίματος. Στη ροή του χρήστη το κλείσιμο γίνεται στις αρχές
// του επόμενου μήνα, οπότε ο τίτλος πρέπει να δείχνει τον προηγούμενο. Τον
// βγάζουμε από την πιο πρόσφατη ημερομηνία εγγραφής (μορφή 'YYYY-MM-DD').
function periodFromEntries(entries, fallback) {
  const dates = entries.map((e) => e.date).filter(Boolean).sort();
  if (!dates.length) return fallback;
  const [year, month] = dates[dates.length - 1].split('-');
  return { month: Number(month), year: Number(year) };
}

async function createBotanicosSettlement(client, { month, year, balanceBefore, timestamp }) {
  const { rows } = await client.query(
    'insert into botanicos_settlement (month, year, "balanceBefore", "timestamp") values ($1, $2, $3, $4) returning *',
    [month, year, balanceBefore, timestamp]
  );
  return deserializeRow(ENTITIES.BotanicosSettlement, rows[0]);
}

async function ensureCloseDraftTable(client) {
  // Αμυντικά και στο runtime, ώστε το deploy να μη μείνει σπασμένο αν η
  // migration τρέξει λίγο αργότερα. Το schema παραμένει η κανονική πηγή.
  await client.query(`create table if not exists close_draft (
    key text primary key check (key = 'current'),
    state jsonb not null,
    revision bigint not null default 1,
    updated_date timestamptz not null default now()
  )`);
  await client.query('alter table close_draft add column if not exists revision bigint not null default 1');
}

async function ensureSettlementOperationId(client) {
  await client.query('alter table settlement add column if not exists "operationId" text');
  await client.query("alter table settlement add column if not exists \"closeDetails\" jsonb not null default '{}'::jsonb");
  await client.query('create unique index if not exists settlement_operation_id_idx on settlement ("operationId") where "operationId" is not null');
}

const MONTH_NAMES = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];

function carryLabel(month, year) {
  return `Μεταφορά από ${MONTH_NAMES[month - 1]} '${String(year).slice(-2)}`;
}

function normalizeDepositHistory(raw, contribution, paid) {
  const amounts = Array.isArray(raw) ? raw.map((item) => Number(item?.amount)) : [];
  if (amounts.some((amount) => !Number.isFinite(amount) || amount <= 0)) throw new HttpError(400, 'Μη έγκυρο ιστορικό καταθέσεων');
  if (!amounts.length && paid > 0) amounts.push(paid); // Συμβατότητα με παλιό client/draft.
  const total = round2(amounts.reduce((sum, amount) => sum + amount, 0));
  if (total !== round2(paid)) throw new HttpError(400, 'Το ιστορικό δεν συμφωνεί με το σύνολο των καταθέσεων');
  let running = round2(contribution);
  return amounts.map((amount) => {
    running = round2(running - amount);
    return { amount: round2(amount), remaining: Math.max(running, 0) };
  });
}

const OPERATIONS = {
  async getCloseDraft() {
    return transaction(async (client) => {
      await ensureCloseDraftTable(client);
      const { rows } = await client.query("select state, revision, updated_date from close_draft where key = 'current'");
      return { draft: rows[0]?.state || null, revision: Number(rows[0]?.revision || 0), updatedAt: rows[0]?.updated_date || null };
    });
  },

  async saveCloseDraft({ state, expectedRevision = 0 }) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new HttpError(400, 'Μη έγκυρο πρόχειρο κλείσιμο');
    const serialized = JSON.stringify(state);
    if (serialized.length > 10000) throw new HttpError(400, 'Το πρόχειρο κλείσιμο είναι πολύ μεγάλο');
    return transaction(async (client) => {
      await ensureCloseDraftTable(client);
      const { rows } = await client.query("select revision from close_draft where key = 'current' for update");
      const currentRevision = Number(rows[0]?.revision || 0);
      if (Number(expectedRevision) !== currentRevision) {
        throw new HttpError(409, 'Το κλείσιμο άλλαξε από άλλη συσκευή');
      }
      const nextRevision = currentRevision + 1;
      await client.query(
        `insert into close_draft (key, state, revision) values ('current', $1::jsonb, $2)
         on conflict (key) do update set state = excluded.state, revision = excluded.revision, updated_date = now()`,
        [serialized, nextRevision]
      );
      return { saved: true, revision: nextRevision };
    });
  },

  async cancelCloseDraft() {
    return transaction(async (client) => {
      await ensureCloseDraftTable(client);
      await client.query("delete from close_draft where key = 'current'");
      return { cancelled: true };
    });
  },

  // Κλείσιμο μήνα.
  //
  // Ο client στέλνει μόνο μετρημένα γεγονότα: το υπόλοιπο του κουτιού και πόσα
  // κατέθεσε πράγματι ο καθένας. Ποτέ υπολογισμένα ποσά — αυτά τα βγάζει ο
  // server από τις εγγραφές της βάσης.
  async close({ enteredBalance, contributions, botanicosAction = 'settled', personActions, depositHistory, operationId }) {
    const entered = Number(enteredBalance);
    if (!Number.isFinite(entered)) throw new HttpError(400, 'Μη έγκυρο υπόλοιπο');
    if (!['settled', 'postpone'].includes(botanicosAction)) {
      throw new HttpError(400, 'Μη έγκυρη επιλογή για τον Βοτανικό');
    }

    // Προαιρετικά· αν λείπουν, ισχύουν τα υπολογισμένα ποσά.
    const paid = {};
    for (const person of ['manos', 'eirini']) {
      const value = contributions?.[person];
      if (value === undefined || value === null || value === '') continue;
      const num = Number(value);
      if (!Number.isFinite(num)) throw new HttpError(400, `Μη έγκυρο ποσό κατάθεσης για ${person}`);
      paid[person] = num;
    }

    return transaction(async (client) => {
      await ensureSettlementOperationId(client);
      if (operationId) {
        const { rows: existing } = await client.query('select * from settlement where "operationId" = $1', [operationId]);
        if (existing[0]) return { settlement: deserializeRow(ENTITIES.Settlement, existing[0]), duplicate: true };
      }
      const settings = await loadSettings(client);
      const entries = await loadEntries(client);

      // Τα οφειλόμενα προκύπτουν από τις ενεργές εγγραφές, όχι από ό,τι έστειλε
      // ο client — ίδιος κανόνας με το preview του UI.
      const botanicosBalance = sumActive(entries, (e) => e.module === 'botanicos');
      const manosOwed = sumActive(entries, (e) => e.person === 'manos' && e.module === 'person');
      const eiriniOwed = sumActive(entries, (e) => e.person === 'eirini' && e.module === 'person');

      const effectiveBalance = round2(entered - botanicosBalance);
      const computed = computeMonthlyClose(settings.targetReserve, effectiveBalance, manosOwed, eiriniOwed);

      // Ό,τι κατατέθηκε διαφορετικά από το υπολογισμένο γίνεται υπόλοιπο για τον
      // επόμενο μήνα — προς τις δύο κατευθύνσεις.
      const calc = {
        ...computed,
        manos: paid.manos !== undefined ? applyActualContribution(computed.manos, paid.manos) : computed.manos,
        eirini: paid.eirini !== undefined ? applyActualContribution(computed.eirini, paid.eirini) : computed.eirini,
      };

      const actions = {};
      const reportHistory = {};
      for (const person of ['manos', 'eirini']) {
        const action = personActions?.[person];
        if (action !== undefined && !['ok', 'postpone'].includes(action)) throw new HttpError(400, `Μη έγκυρη επιλογή για ${person}`);
        if (action === 'ok' && round2(paid[person] ?? computed[person].contribution) !== round2(computed[person].contribution)) {
          throw new HttpError(400, `Η οφειλή του ${person} δεν έχει τακτοποιηθεί πλήρως`);
        }
        actions[person] = action || (calc[person].owedAfter === 0 ? 'ok' : 'postpone');
        reportHistory[person] = normalizeDepositHistory(
          depositHistory?.[person], computed[person].contribution, calc[person].contribution
        );
      }

      const now = new Date();
      const timestamp = now.toISOString();
      const fallback = { month: now.getMonth() + 1, year: now.getFullYear() };

      const activeBotanicos = entries.filter((e) => e.module === 'botanicos' && !e.settlementId);
      const activePerson = entries.filter((e) => e.module === 'person' && !e.settlementId);
      const period = periodFromEntries(activePerson, fallback);
      const { month, year } = period;

      // 1) Ομαδοποίηση Βοτανικού. Στο postpone οι παλιές εγγραφές μπαίνουν
      // στο αρχείο και μένει μία νέα συγκεντρωτική ενεργή εγγραφή.
      if (botanicosBalance !== 0) {
        const bp = periodFromEntries(activeBotanicos, fallback);
        const bs = await createBotanicosSettlement(client, { month: bp.month, year: bp.year, balanceBefore: botanicosBalance, timestamp });
        await archiveEntries(client, activeBotanicos.map((e) => e.id), bs.id);
        if (botanicosAction === 'postpone') {
          await client.query(
            `insert into ledger_entry (module, amount, description, date, "settlementId", "carryOverSettlementId")
             values ('botanicos', $1, $2, $3, '', $4)`,
            [botanicosBalance, carryLabel(bp.month, bp.year), timestamp.slice(0, 10), bs.id]
          );
        }
      }

      const closeDetails = {
        personActions: actions,
        initialDue: {
          manos: computed.manos.contribution,
          eirini: computed.eirini.contribution,
        },
        depositHistory: reportHistory,
        botanicos: { action: botanicosAction, balance: botanicosBalance },
      };

      // 2) Στιγμιότυπο διακανονισμού ατόμων
      const { rows } = await client.query(
        `insert into settlement (
           month, year, "closeDetails", "operationId", "enteredBalance", "targetReserve", "refillAmount", "shareEach",
           "manosOwedBefore", "manosOwedAfter", "manosOffset", "manosContribution",
           "eiriniOwedBefore", "eiriniOwedAfter", "eiriniOffset", "eiriniContribution",
           "botanicosBalanceBefore", "timestamp"
         ) values ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) returning *`,
        [
          month, year, JSON.stringify(closeDetails), operationId || null, calc.enteredBalance, calc.targetReserve, calc.refillAmount, calc.shareEach,
          calc.manos.owedBefore, calc.manos.owedAfter, calc.manos.offset, calc.manos.contribution,
          calc.eirini.owedBefore, calc.eirini.owedAfter, calc.eirini.offset, calc.eirini.contribution,
          botanicosBalance, timestamp,
        ]
      );
      const settlement = deserializeRow(ENTITIES.Settlement, rows[0]);

      // 3) Αρχειοθέτηση των ενεργών εγγραφών ατόμων
      await archiveEntries(client, activePerson.map((e) => e.id), settlement.id);

      // 4) Ό,τι μένει ανοιχτό γίνεται ενεργή εγγραφή για τον επόμενο μήνα —
      //    είτε πίστωση (κατέθεσε παραπάνω) είτε χρέος (κατέθεσε λιγότερα).
      const today = timestamp.slice(0, 10);
      for (const [person, result] of [['manos', calc.manos], ['eirini', calc.eirini]]) {
        if (result.owedAfter === 0) continue;
        const label = carryLabel(month, year);
        await client.query(
          `insert into ledger_entry (module, person, amount, description, date, "settlementId", "carryOverSettlementId")
           values ('person', $1, $2, $3, $4, '', $5)`,
          [person, result.owedAfter, label, today, settlement.id]
        );
      }

      // Το κλείσιμο και η διαγραφή του προχείρου είναι μία ατομική πράξη.
      await ensureCloseDraftTable(client);
      await client.query("delete from close_draft where key = 'current'");

      // Τα νέα υπόλοιπα δεν χρειάζεται να αποθηκευτούν: προκύπτουν από τις
      // εγγραφές — οι παλιές αρχειοθετήθηκαν, τα carry-over είναι ό,τι μένει.
      return { settlement, calc };
    });
  },

  // Αναίρεση κλεισίματος ατόμων.
  //
  // Ένα settlement είναι κοινό για Μάνο και Ειρήνη. Από το αρχείο κάθε προσώπου
  // η αναίρεση αφορά ΜΟΝΟ αυτό το πρόσωπο: επαναφέρουμε τις δικές του εγγραφές
  // και σβήνουμε τα δικά του carry-over, αφήνοντας άθικτο ό,τι αφορά τον άλλον.
  // Το settlement διαγράφεται μόνο όταν πια δεν το δείχνει καμία εγγραφή.
  //
  // Χωρίς όρισμα (π.χ. από παλιά ροή/δοκιμές) αναιρεί ολόκληρο το πιο πρόσφατο.
  // Δεν αγγίζει τον διακανονισμό Βοτανικού — αυτός αναιρείται ξεχωριστά.
  async undoClose({ settlementId, person } = {}) {
    return transaction(async (client) => {
      let target = settlementId;
      if (!target) {
        const { rows } = await client.query('select id from settlement order by "timestamp" desc limit 1');
        if (!rows[0]) throw new HttpError(404, 'Δεν υπάρχει κλείσιμο προς αναίρεση');
        target = rows[0].id;
      } else {
        const { rows } = await client.query('select id from settlement where id = $1', [target]);
        if (!rows[0]) throw new HttpError(404, 'Δεν υπάρχει κλείσιμο προς αναίρεση');
      }

      const persons = person ? [person] : ['manos', 'eirini'];

      // Σβήνουμε τα carry-over και επαναφέρουμε τις αρχειοθετημένες ως ενεργές
      // — μόνο για τα ζητούμενα άτομα. Τα υπόλοιπα επανέρχονται μόνα τους.
      await client.query(
        'delete from ledger_entry where "carryOverSettlementId" = $1 and person = any($2::text[])',
        [target, persons]
      );
      await client.query(
        'update ledger_entry set "settlementId" = \'\', updated_date = now() where "settlementId" = $1 and person = any($2::text[])',
        [target, persons]
      );

      // Το settlement κρατά τα δεδομένα του άλλου προσώπου· το διαγράφουμε μόνο
      // όταν πια καμία εγγραφή (αρχειοθετημένη ή carry-over) δεν το δείχνει.
      const { rows: remaining } = await client.query(
        'select 1 from ledger_entry where "settlementId" = $1 or "carryOverSettlementId" = $1 limit 1',
        [target]
      );
      if (!remaining[0]) {
        await client.query('delete from settlement where id = $1', [target]);
      }

      return { undone: target, person: person || null };
    });
  },

  async botanicosSettle() {
    return transaction(async (client) => {
      const entries = await loadEntries(client);
      const active = entries.filter((e) => e.module === 'botanicos' && !e.settlementId);
      const balanceBefore = sumActive(entries, (e) => e.module === 'botanicos');

      const now = new Date();
      const period = periodFromEntries(active, { month: now.getMonth() + 1, year: now.getFullYear() });
      const bs = await createBotanicosSettlement(client, {
        month: period.month, year: period.year, balanceBefore, timestamp: now.toISOString(),
      });

      // Η αρχειοθέτηση των εγγραφών μηδενίζει από μόνη της το υπόλοιπο.
      await archiveEntries(client, active.map((e) => e.id), bs.id);

      return { settlement: bs };
    });
  },

  async undoBotanicos() {
    return transaction(async (client) => {
      const { rows } = await client.query('select * from botanicos_settlement order by "timestamp" desc limit 1');
      if (!rows[0]) throw new HttpError(404, 'Δεν υπάρχει διακανονισμός προς αναίρεση');
      const latest = deserializeRow(ENTITIES.BotanicosSettlement, rows[0]);

      await client.query('delete from ledger_entry where "carryOverSettlementId" = $1', [latest.id]);
      await client.query('update ledger_entry set "settlementId" = \'\', updated_date = now() where "settlementId" = $1', [latest.id]);
      await client.query('delete from botanicos_settlement where id = $1', [latest.id]);

      return { undone: latest.id };
    });
  },
};

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    requireAuth(req);

    const { op, args = {} } = req.body || {};
    if (!Object.prototype.hasOwnProperty.call(OPERATIONS, op)) {
      throw new HttpError(400, `Unknown operation: ${op}`);
    }
    return res.status(200).json(await OPERATIONS[op](args));
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[api/settlements]', err);
    return res.status(status).json({ error: status >= 500 ? 'Σφάλμα διακομιστή' : err.message });
  }
}
