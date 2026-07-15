import { query, transaction } from './_lib/db.js';
import { getEntity, assertColumn, parseSort, deserializeRow, HttpError } from './_lib/entities.js';
import { requireAuth } from './_lib/session.js';

const MAX_LIMIT = 1000;

function buildWhere(entity, where, startIndex = 1) {
  const keys = Object.keys(where || {});
  if (!keys.length) return { clause: '', params: [] };
  const params = [];
  const parts = keys.map((key, i) => {
    assertColumn(entity, key);
    params.push(where[key]);
    return `"${key}" = $${startIndex + i}`;
  });
  return { clause: ` where ${parts.join(' and ')}`, params };
}

function pickColumns(entity, data) {
  // Αγνοούμε ό,τι δεν ανήκει στην οντότητα (π.χ. id, created_date από round-trip
  // ενός row) αντί να σκάσουμε — ο client συχνά στέλνει πίσω ολόκληρο object.
  const entries = Object.entries(data || {}).filter(([k]) => entity.columns.includes(k));
  if (!entries.length) throw new HttpError(400, 'Καμία έγκυρη στήλη προς εγγραφή');
  return entries;
}

async function list(entity, { sort, limit }) {
  const capped = Math.min(Number(limit) || 100, MAX_LIMIT);
  const { rows } = await query(
    `select * from ${entity.table} order by ${parseSort(entity, sort)} limit $1`,
    [capped]
  );
  return rows.map((r) => deserializeRow(entity, r));
}

async function filter(entity, { where, sort, limit }) {
  const capped = Math.min(Number(limit) || 100, MAX_LIMIT);
  const { clause, params } = buildWhere(entity, where);
  const { rows } = await query(
    `select * from ${entity.table}${clause} order by ${parseSort(entity, sort)} limit $${params.length + 1}`,
    [...params, capped]
  );
  return rows.map((r) => deserializeRow(entity, r));
}

async function get(entity, { id }) {
  const { rows } = await query(`select * from ${entity.table} where id = $1`, [id]);
  return rows[0] ? deserializeRow(entity, rows[0]) : null;
}

async function create(entity, { data }) {
  const entries = pickColumns(entity, data);
  const cols = entries.map(([k]) => `"${k}"`).join(', ');
  const placeholders = entries.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await query(
    `insert into ${entity.table} (${cols}) values (${placeholders}) returning *`,
    entries.map(([, v]) => v)
  );
  return deserializeRow(entity, rows[0]);
}

async function bulkCreate(entity, { items }) {
  if (!Array.isArray(items) || !items.length) return [];
  return transaction(async (client) => {
    const out = [];
    for (const item of items) {
      const entries = pickColumns(entity, item);
      const cols = entries.map(([k]) => `"${k}"`).join(', ');
      const placeholders = entries.map((_, i) => `$${i + 1}`).join(', ');
      const { rows } = await client.query(
        `insert into ${entity.table} (${cols}) values (${placeholders}) returning *`,
        entries.map(([, v]) => v)
      );
      out.push(deserializeRow(entity, rows[0]));
    }
    return out;
  });
}

async function update(entity, { id, data }) {
  const entries = pickColumns(entity, data);
  const sets = entries.map(([k], i) => `"${k}" = $${i + 2}`).join(', ');
  const { rows } = await query(
    `update ${entity.table} set ${sets}, updated_date = now() where id = $1 returning *`,
    [id, ...entries.map(([, v]) => v)]
  );
  if (!rows[0]) throw new HttpError(404, `${entity.table} ${id} δεν βρέθηκε`);
  return deserializeRow(entity, rows[0]);
}

async function bulkUpdate(entity, { items }) {
  if (!Array.isArray(items) || !items.length) return [];
  return transaction(async (client) => {
    const out = [];
    for (const { id, ...data } of items) {
      const entries = pickColumns(entity, data);
      const sets = entries.map(([k], i) => `"${k}" = $${i + 2}`).join(', ');
      const { rows } = await client.query(
        `update ${entity.table} set ${sets}, updated_date = now() where id = $1 returning *`,
        [id, ...entries.map(([, v]) => v)]
      );
      if (rows[0]) out.push(deserializeRow(entity, rows[0]));
    }
    return out;
  });
}

async function remove(entity, { id }) {
  await query(`delete from ${entity.table} where id = $1`, [id]);
  return { success: true };
}

async function deleteMany(entity, { where }) {
  const { clause, params } = buildWhere(entity, where);
  if (!clause) throw new HttpError(400, 'Το deleteMany απαιτεί φίλτρο');
  const { rowCount } = await query(`delete from ${entity.table}${clause}`, params);
  return { success: true, deleted: rowCount };
}

const OPERATIONS = { list, filter, get, create, bulkCreate, update, bulkUpdate, delete: remove, deleteMany };

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    requireAuth(req);

    const { entity: entityName, op, args = {} } = req.body || {};
    if (!Object.prototype.hasOwnProperty.call(OPERATIONS, op)) {
      throw new HttpError(400, `Unknown operation: ${op}`);
    }
    const entity = getEntity(entityName);
    return res.status(200).json(await OPERATIONS[op](entity, args));
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[api/data]', err);
    // Τα 5xx δεν επιστρέφουν λεπτομέρειες — μπορεί να περιέχουν SQL ή connection details.
    return res.status(status).json({ error: status >= 500 ? 'Σφάλμα διακομιστή' : err.message });
  }
}
