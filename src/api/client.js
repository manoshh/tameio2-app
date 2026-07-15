// Data client προς το Neon, μέσω των serverless functions στο /api.
//
// Η αυθεντικοποίηση γίνεται με httpOnly cookie, οπότε δεν χρειάζεται χειρισμός
// token εδώ — αρκεί το `credentials: 'same-origin'`.

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function rpc(endpoint, body) {
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Δεν υπάρχει σύνδεση με τον διακομιστή');
  }

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, payload?.error || `Το αίτημα απέτυχε (${res.status})`);
  }
  return payload;
}

const call = (entity, op, args) => rpc('/api/data', { entity, op, args });

function entityClient(entity) {
  return {
    list: (sort, limit) => call(entity, 'list', { sort, limit }),
    filter: (where, sort, limit) => call(entity, 'filter', { where, sort, limit }),
    get: (id) => call(entity, 'get', { id }),
    create: (data) => call(entity, 'create', { data }),
    bulkCreate: (items) => call(entity, 'bulkCreate', { items }),
    update: (id, data) => call(entity, 'update', { id, data }),
    bulkUpdate: (items) => call(entity, 'bulkUpdate', { items }),
    delete: (id) => call(entity, 'delete', { id }),
    deleteMany: (where) => call(entity, 'deleteMany', { where }),
  };
}

const cache = new Map();

export const db = {
  entities: new Proxy({}, {
    get(_target, entity) {
      if (typeof entity !== 'string') return undefined;
      if (!cache.has(entity)) cache.set(entity, entityClient(entity));
      return cache.get(entity);
    },
  }),
};

// Οι διακανονισμοί δεν περνούν από το generic entity API: ο server τους εκτελεί
// ως μία ατομική πράξη και υπολογίζει ο ίδιος τα ποσά.
export const settlements = {
  close: (enteredBalance) => rpc('/api/settlements', { op: 'close', args: { enteredBalance } }),
  undoClose: () => rpc('/api/settlements', { op: 'undoClose' }),
  botanicosSettle: () => rpc('/api/settlements', { op: 'botanicosSettle' }),
  undoBotanicos: () => rpc('/api/settlements', { op: 'undoBotanicos' }),
};

export const auth = {
  status: () => rpc('/api/auth', { op: 'status' }),
  setup: (password, recoveryEmail) => rpc('/api/auth', { op: 'setup', args: { password, recoveryEmail } }),
  login: (password) => rpc('/api/auth', { op: 'login', args: { password } }),
  logout: () => rpc('/api/auth', { op: 'logout' }),
  updatePassword: (currentPassword, password, recoveryEmail) =>
    rpc('/api/auth', { op: 'updatePassword', args: { currentPassword, password, recoveryEmail } }),
};

export default db;
