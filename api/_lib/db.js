import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Ο Pool του Neon μιλάει WebSockets· σε Node runtime πρέπει να του δώσουμε implementation.
if (typeof WebSocket === 'undefined') neonConfig.webSocketConstructor = ws;

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
