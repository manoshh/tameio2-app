#!/usr/bin/env node
// Εφαρμόζει το db/schema.sql στη βάση του DATABASE_URL.
// Το schema είναι γραμμένο με `create ... if not exists`, οπότε είναι idempotent.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Στο Vercel οι μεταβλητές έρχονται από το περιβάλλον· τοπικά από το .env.local.
dotenv.config({ path: path.join(root, '.env.local') });

if (typeof WebSocket === 'undefined') neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  console.error('✖ Λείπει το DATABASE_URL. Βάλε το στο .env.local (δες .env.example).');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const schema = await readFile(path.join(root, 'db', 'schema.sql'), 'utf8');
  // Χωρίς παραμέτρους, ο driver στέλνει το script με το simple query protocol,
  // που εκτελεί όλα τα statements ως ένα implicit transaction.
  await pool.query(schema);

  const { rows } = await pool.query(`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `);
  console.log(`✔ Το schema εφαρμόστηκε. Πίνακες: ${rows.map((r) => r.table_name).join(', ')}`);
} catch (err) {
  console.error('✖ Το migration απέτυχε:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
