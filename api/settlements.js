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

async function createBotanicosSettlement(client, { month, year, balanceBefore, timestamp }) {
  const { rows } = await client.query(
    'insert into botanicos_settlement (month, year, "balanceBefore", "timestamp") values ($1, $2, $3, $4) returning *',
    [month, year, balanceBefore, timestamp]
  );
  return deserializeRow(ENTITIES.BotanicosSettlement, rows[0]);
}

const OPERATIONS = {
  // Κλείσιμο μήνα.
  //
  // Ο client στέλνει μόνο μετρημένα γεγονότα: το υπόλοιπο του κουτιού και πόσα
  // κατέθεσε πράγματι ο καθένας. Ποτέ υπολογισμένα ποσά — αυτά τα βγάζει ο
  // server από τις εγγραφές της βάσης.
  async close({ enteredBalance, contributions }) {
    const entered = Number(enteredBalance);
    if (!Number.isFinite(entered)) throw new HttpError(400, 'Μη έγκυρο υπόλοιπο');

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

      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      const timestamp = now.toISOString();

      // 1) Διακανονισμός Βοτανικού (μετά την τραπεζική μεταφορά)
      if (botanicosBalance !== 0) {
        const bs = await createBotanicosSettlement(client, { month, year, balanceBefore: botanicosBalance, timestamp });
        const activeBotanicos = entries.filter((e) => e.module === 'botanicos' && !e.settlementId);
        await archiveEntries(client, activeBotanicos.map((e) => e.id), bs.id);
      }

      // 2) Στιγμιότυπο διακανονισμού ατόμων
      const { rows } = await client.query(
        `insert into settlement (
           month, year, "enteredBalance", "targetReserve", "refillAmount", "shareEach",
           "manosOwedBefore", "manosOwedAfter", "manosOffset", "manosContribution",
           "eiriniOwedBefore", "eiriniOwedAfter", "eiriniOffset", "eiriniContribution",
           "botanicosBalanceBefore", "timestamp"
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning *`,
        [
          month, year, calc.enteredBalance, calc.targetReserve, calc.refillAmount, calc.shareEach,
          calc.manos.owedBefore, calc.manos.owedAfter, calc.manos.offset, calc.manos.contribution,
          calc.eirini.owedBefore, calc.eirini.owedAfter, calc.eirini.offset, calc.eirini.contribution,
          botanicosBalance, timestamp,
        ]
      );
      const settlement = deserializeRow(ENTITIES.Settlement, rows[0]);

      // 3) Αρχειοθέτηση των ενεργών εγγραφών ατόμων
      const activePerson = entries.filter((e) => e.module === 'person' && !e.settlementId);
      await archiveEntries(client, activePerson.map((e) => e.id), settlement.id);

      // 4) Ό,τι μένει ανοιχτό γίνεται ενεργή εγγραφή για τον επόμενο μήνα —
      //    είτε πίστωση (κατέθεσε παραπάνω) είτε χρέος (κατέθεσε λιγότερα).
      const today = timestamp.slice(0, 10);
      for (const [person, result] of [['manos', calc.manos], ['eirini', calc.eirini]]) {
        if (result.owedAfter === 0) continue;
        const label = result.owedAfter > 0
          ? `Πίστωση από κλείσιμο ${month}/${year}`
          : `Οφειλή από κλείσιμο ${month}/${year}`;
        await client.query(
          `insert into ledger_entry (module, person, amount, description, date, "settlementId", "carryOverSettlementId")
           values ('person', $1, $2, $3, $4, '', $5)`,
          [person, result.owedAfter, label, today, settlement.id]
        );
      }

      // Τα νέα υπόλοιπα δεν χρειάζεται να αποθηκευτούν: προκύπτουν από τις
      // εγγραφές — οι παλιές αρχειοθετήθηκαν, τα carry-over είναι ό,τι μένει.
      return { settlement, calc };
    });
  },

  // Αναίρεση του πιο πρόσφατου κλεισίματος ατόμων.
  // Δεν αναιρεί τον διακανονισμό Βοτανικού — αυτός είναι ξεχωριστή εγγραφή και
  // αναιρείται από τη δική του σελίδα, όπως ίσχυε και πριν.
  async undoClose() {
    return transaction(async (client) => {
      const { rows } = await client.query('select * from settlement order by "timestamp" desc limit 1');
      if (!rows[0]) throw new HttpError(404, 'Δεν υπάρχει κλείσιμο προς αναίρεση');
      const latest = deserializeRow(ENTITIES.Settlement, rows[0]);

      // Σβήνουμε τα carry-over και επαναφέρουμε τις αρχειοθετημένες ως ενεργές:
      // τα υπόλοιπα επανέρχονται μόνα τους, αφού προκύπτουν από τις εγγραφές.
      await client.query('delete from ledger_entry where "carryOverSettlementId" = $1', [latest.id]);
      await client.query('update ledger_entry set "settlementId" = \'\', updated_date = now() where "settlementId" = $1', [latest.id]);
      await client.query('delete from settlement where id = $1', [latest.id]);

      return { undone: latest.id };
    });
  },

  async botanicosSettle() {
    return transaction(async (client) => {
      const entries = await loadEntries(client);
      const balanceBefore = sumActive(entries, (e) => e.module === 'botanicos');

      const now = new Date();
      const bs = await createBotanicosSettlement(client, {
        month: now.getMonth() + 1, year: now.getFullYear(), balanceBefore, timestamp: now.toISOString(),
      });

      // Η αρχειοθέτηση των εγγραφών μηδενίζει από μόνη της το υπόλοιπο.
      const active = entries.filter((e) => e.module === 'botanicos' && !e.settlementId);
      await archiveEntries(client, active.map((e) => e.id), bs.id);

      return { settlement: bs };
    });
  },

  async undoBotanicos() {
    return transaction(async (client) => {
      const { rows } = await client.query('select * from botanicos_settlement order by "timestamp" desc limit 1');
      if (!rows[0]) throw new HttpError(404, 'Δεν υπάρχει διακανονισμός προς αναίρεση');
      const latest = deserializeRow(ENTITIES.BotanicosSettlement, rows[0]);

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
