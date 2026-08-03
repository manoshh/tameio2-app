// Εφάπαξ, idempotent διόρθωση του πρώτου κλεισίματος (Ιούλιος 2026).
// Ομαδοποιεί τις 4 ενεργές εγγραφές Βοτανικού στη μεταφορά των 43 € και
// συμπληρώνει το πραγματικό ιστορικό εξόφλησης που καταγράφηκε στο UI.
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

if (typeof WebSocket === 'undefined') neonConfig.webSocketConstructor = ws;
if (!process.env.DATABASE_URL) throw new Error('Λείπει το DATABASE_URL');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

const settlementId = '45a753b3-8f81-4e20-9f33-dfa3ad517974';
const sourceEntryIds = [
  '6341e931-5ec1-44b7-99dc-96b1ba84661e',
  '7523d417-8079-4344-b467-29e1cd25f4ca',
  '47140e06-9309-4f98-b42b-2a5a17bfb516',
  '3c81c10b-a995-435c-99ff-892a4a9b1f49',
];
const closeDetails = {
  personActions: { manos: 'ok', eirini: 'ok' },
  initialDue: { manos: 873, eirini: 928 },
  depositHistory: {
    manos: [{ amount: 500, remaining: 373 }, { amount: 373, remaining: 0 }],
    eirini: [{ amount: 928, remaining: 0 }],
  },
  botanicos: { action: 'postpone', balance: -43 },
};

try {
  await client.query('begin');
  await client.query('alter table settlement add column if not exists "closeDetails" jsonb not null default \'{}\'::jsonb');

  const settlement = await client.query(
    'select id, month, year, "botanicosBalanceBefore", "timestamp" from settlement where id = $1 for update',
    [settlementId]
  );
  if (!settlement.rows[0] || settlement.rows[0].month !== 7 || settlement.rows[0].year !== 2026
      || Number(settlement.rows[0].botanicosBalanceBefore) !== -43) {
    throw new Error('Δεν βρέθηκε το αναμενόμενο κλείσιμο Ιουλίου 2026');
  }

  const existingCarry = await client.query(
    `select id from ledger_entry
     where module = 'botanicos' and "settlementId" = ''
       and "carryOverSettlementId" <> '' and description = $1`,
    ["Μεταφορά από Ιούλιος '26"]
  );

  if (!existingCarry.rows.length) {
    const sources = await client.query(
      `select id, amount from ledger_entry
       where id = any($1::uuid[]) and module = 'botanicos' and "settlementId" = ''
       for update`,
      [sourceEntryIds]
    );
    const total = sources.rows.reduce((sum, row) => sum + Number(row.amount), 0);
    if (sources.rows.length !== sourceEntryIds.length || total !== -43) {
      throw new Error('Οι ενεργές εγγραφές Βοτανικού δεν συμφωνούν με την αναμενόμενη μεταφορά των 43 €');
    }

    const archive = await client.query(
      `insert into botanicos_settlement (month, year, "balanceBefore", "timestamp")
       values (7, 2026, -43, $1) returning id`,
      [settlement.rows[0].timestamp]
    );
    await client.query(
      'update ledger_entry set "settlementId" = $1, updated_date = now() where id = any($2::uuid[])',
      [archive.rows[0].id, sourceEntryIds]
    );
    await client.query(
      `insert into ledger_entry (module, amount, description, date, "settlementId", "carryOverSettlementId")
       values ('botanicos', -43, $1, $2, '', $3)`,
      ["Μεταφορά από Ιούλιος '26", settlement.rows[0].timestamp.toISOString().slice(0, 10), archive.rows[0].id]
    );
  }

  await client.query('update settlement set "closeDetails" = $1::jsonb, updated_date = now() where id = $2', [JSON.stringify(closeDetails), settlementId]);
  await client.query('commit');
  console.log(existingCarry.rows.length ? '✓ Το report ενημερώθηκε· η μεταφορά ήταν ήδη ομαδοποιημένη.' : '✓ Ο Ιούλιος ενημερώθηκε και τα 43 € ομαδοποιήθηκαν.');
} catch (error) {
  await client.query('rollback');
  console.error(`✖ ${error.message}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
