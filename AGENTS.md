# AGENTS.md

## Project Context

Εφαρμογή κοινού ταμείου σε React + Vite, με backend serverless functions στο
Vercel και βάση Neon (Postgres). Δες το `README.md` για setup και deploy.

Το stack είναι αυτό και μόνο αυτό: μην προσθέτεις BaaS SDKs ή hosted backends.

## Key Files

- `src/lib/finance.js`: η λογική υπολογισμών του ταμείου. Καθαρές συναρτήσεις,
  χωρίς I/O. Άλλαξέ την μόνο αν αλλάζει ο ίδιος ο κανόνας υπολογισμού.
- `src/api/client.js`: ο μόνος τρόπος με τον οποίο το frontend μιλάει στο backend.
- `api/_lib/entities.js`: whitelist πινάκων/στηλών. Νέο πεδίο σε οντότητα σημαίνει
  αλλαγή **και** εδώ **και** στο `db/schema.sql`.
- `db/schema.sql`: το schema. Idempotent — γράψε `create ... if not exists`.

## Working Notes

- Ο client εκθέτει ένα generic entity API (`db.entities.X.list(...)`). Αν το
  αλλάξεις, ενημέρωσε όλα τα call sites μαζί.
- Τα ποσά είναι `numeric(12,2)` στη βάση και επιστρέφονται ως string από την
  Postgres — το `deserializeRow` τα γυρίζει σε number. Νέο αριθμητικό πεδίο πρέπει
  να μπει στη λίστα `numeric` της οντότητας, αλλιώς θα σπάσει η αριθμητική.
- Οι στήλες είναι camelCase και **quoted** στην Postgres. Πάντα `"settlementId"`.
- Μυστικά μόνο σε `.env.local` / Vercel env vars. Ποτέ στο git.
- Πριν κλείσεις μια αλλαγή: `npm run lint` και `npm run build`.
- Μετά από κάθε αλλαγή, ενημέρωσε το `history.md` και κάνε commit + push.
