import { Pool, neonConfig, types } from '@neondatabase/serverless';
import ws from 'ws';

// Ο Pool του Neon μιλάει WebSockets· σε Node runtime πρέπει να του δώσουμε implementation.
if (typeof WebSocket === 'undefined') neonConfig.webSocketConstructor = ws;

// Οι στήλες τύπου `date` (OID 1082) είναι ημερολογιακές ημερομηνίες χωρίς ώρα.
// Ο driver by default τις κάνει JS Date στην τοπική ζώνη, οπότε οποιαδήποτε
// μετατροπή σε UTC τις μετακινεί μια μέρα πίσω για ζώνες ανατολικά του
// Γκρίνουιτς (π.χ. Ελλάδα). Τις κρατάμε ως string 'YYYY-MM-DD' αυτούσιες.
types.setTypeParser(1082, (value) => value);

if (!process.env.DATABASE_URL) {
  throw new Error('Λείπει το DATABASE_URL. Δες το .env.example.');
}

// Ένα pool ανά serverless instance, όχι ανά request.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export function query(text, params) {
  return pool.query(text, params);
}

// Οι λειτουργίες που αγγίζουν πολλούς πίνακες (π.χ. το μηνιαίο κλείσιμο) πρέπει
// να είναι ατομικές — αλλιώς μια αποτυχία στη μέση αφήνει το ταμείο ασυνεπές.
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}
