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

// Το DB_SCHEMA χρησιμοποιείται ΜΟΝΟ από το `npm run test:e2e`, ώστε οι έλεγχοι
// να τρέχουν σε απομονωμένο schema της ίδιας βάσης και να μην αγγίζουν ποτέ τα
// πραγματικά δεδομένα. Στην παραγωγή δεν ορίζεται και ισχύει το public.
// Το search_path απαιτεί unpooled σύνδεση — ο pooler του Neon το απορρίπτει.
const schema = process.env.DB_SCHEMA;
const connectionString = schema
  ? process.env.DATABASE_URL.replace('-pooler.', '.')
  : process.env.DATABASE_URL;

// Ένα pool ανά serverless instance, όχι ανά request.
const pool = new Pool({
  connectionString,
  ...(schema ? { options: `-c search_path=${schema}` } : {}),
});

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
