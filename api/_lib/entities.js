// Καταγραφή των οντοτήτων που εκτίθενται μέσω του /api/data endpoint.
//
// Είναι σκόπιμα whitelist: τα ονόματα πινάκων και στηλών δεν μπορούν να γίνουν
// παραμετροποιημένα placeholders στην SQL, οπότε ό,τι φτάνει από τον client
// ελέγχεται εδώ πριν μπει σε query. Ό,τι δεν είναι στη λίστα, απορρίπτεται.

const AUDIT_COLUMNS = ['id', 'created_date', 'updated_date'];

export const ENTITIES = {
  Settings: {
    table: 'settings',
    columns: ['targetReserve', 'manosOwed', 'eiriniOwed', 'botanicosBalance'],
    numeric: ['targetReserve', 'manosOwed', 'eiriniOwed', 'botanicosBalance'],
    defaultSort: '-created_date',
  },
  LedgerEntry: {
    table: 'ledger_entry',
    columns: ['module', 'person', 'amount', 'description', 'date', 'settlementId', 'carryOverSettlementId'],
    numeric: ['amount'],
    defaultSort: '-date',
  },
  Settlement: {
    table: 'settlement',
    columns: [
      'month', 'year', 'enteredBalance', 'targetReserve', 'refillAmount', 'shareEach',
      'manosOwedBefore', 'manosOwedAfter', 'manosOffset', 'manosContribution',
      'eiriniOwedBefore', 'eiriniOwedAfter', 'eiriniOffset', 'eiriniContribution',
      'botanicosBalanceBefore', 'timestamp',
    ],
    numeric: [
      'month', 'year', 'enteredBalance', 'targetReserve', 'refillAmount', 'shareEach',
      'manosOwedBefore', 'manosOwedAfter', 'manosOffset', 'manosContribution',
      'eiriniOwedBefore', 'eiriniOwedAfter', 'eiriniOffset', 'eiriniContribution',
      'botanicosBalanceBefore',
    ],
    defaultSort: '-timestamp',
  },
  BotanicosSettlement: {
    table: 'botanicos_settlement',
    columns: ['month', 'year', 'balanceBefore', 'timestamp'],
    numeric: ['month', 'year', 'balanceBefore'],
    defaultSort: '-timestamp',
  },
};

export function getEntity(name) {
  if (!Object.prototype.hasOwnProperty.call(ENTITIES, name)) {
    throw new HttpError(400, `Unknown entity: ${name}`);
  }
  return ENTITIES[name];
}

export function assertColumn(entity, column) {
  if (!entity.columns.includes(column) && !AUDIT_COLUMNS.includes(column)) {
    throw new HttpError(400, `Unknown field "${column}" on ${entity.table}`);
  }
  return column;
}

// Το SDK δεχόταν sort strings της μορφής '-date' (φθίνουσα) ή 'date' (αύξουσα).
export function parseSort(entity, sort) {
  const raw = sort || entity.defaultSort;
  const desc = raw.startsWith('-');
  const column = assertColumn(entity, desc ? raw.slice(1) : raw);
  return `"${column}" ${desc ? 'desc' : 'asc'}`;
}

// Η Postgres επιστρέφει numeric ως string· η εφαρμογή κάνει αριθμητική πάνω
// σε αυτά τα πεδία, οπότε πρέπει να γυρίσουν πίσω σε JS numbers.
export function deserializeRow(entity, row) {
  if (!row) return row;
  const out = { ...row };
  for (const field of entity.numeric) {
    if (out[field] !== null && out[field] !== undefined) out[field] = Number(out[field]);
  }
  return out;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
