#!/usr/bin/env node
// Εφαρμόζει το db/schema.sql στη βάση του DATABASE_URL.
// Το schema είναι γραμμένο με `create table if not exists`, οπότε είναι idempotent.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (!process.env.DATABASE_URL) {
  console.error('✖ Λείπει το DATABASE_URL. Βάλε το στο .env.local (δες .env.example).');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const schema = await readFile(path.join(root, 'db', 'schema.sql'), 'utf8');

try {
  // Το schema περιέχει πολλαπλά statements· το neon http driver δέχεται ένα
  // multi-statement string μέσω transaction όταν το σπάσουμε σε queries.
  const statements = schema
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter((s) => s && !s.split('\n').every((line) => line.trim().startsWith('--')));

  for (const statement of statements) {
    await sql.query(statement);
  }
  console.log(`✔ Το schema εφαρμόστηκε (${statements.length} statements).`);
} catch (err) {
  console.error('✖ Το migration απέτυχε:', err.message);
  process.exit(1);
}
