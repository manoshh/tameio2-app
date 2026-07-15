# AGENTS.md

## Project Context

Εφαρμογή κοινού ταμείου, αρχικά φτιαγμένη στο Base44 και μεταφερμένη σε
Neon (Postgres) + Vercel. Δες το `README.md` για setup και deploy.

Το Base44 δεν χρησιμοποιείται πλέον — μην προσθέτεις εξαρτήσεις ή αναφορές σε αυτό.

## Key Files

- `src/lib/finance.js`: η λογική υπολογισμών του ταμείου. Καθαρές συναρτήσεις,
  χωρίς I/O. Άλλαξέ την μόνο αν αλλάζει ο ίδιος ο κανόνας υπολογισμού.
- `src/api/client.js`: ο μόνος τρόπος με τον οποίο το frontend μιλάει στο backend.
- `api/_lib/entities.js`: whitelist πινάκων/στηλών. Νέο πεδίο σε οντότητα σημαίνει
  αλλαγή **και** εδώ **και** στο `db/schema.sql`.
- `db/schema.sql`: το schema. Idempotent — γράψε `create ... if not exists`.

## Working Notes

- Το frontend διατηρεί σκόπιμα το API σχήμα του παλιού SDK (`db.entities.X.list(...)`).
  Αν αλλάξεις τον client, κράτα την υπογραφή ή ενημέρωσε όλα τα call sites μαζί.
- Τα ποσά είναι `numeric(12,2)` στη βάση και επιστρέφονται ως string από την
  Postgres — το `deserializeRow` τα γυρίζει σε number. Νέο αριθμητικό πεδίο πρέπει
  να μπει στη λίστα `numeric` της οντότητας, αλλιώς θα σπάσει η αριθμητική.
- Οι στήλες είναι camelCase και **quoted** στην Postgres. Πάντα `"settlementId"`.
- Μυστικά μόνο σε `.env.local` / Vercel env vars. Ποτέ στο git.
- Πριν κλείσεις μια αλλαγή: `npm run lint` και `npm run build`.
- Μετά από κάθε αλλαγή, ενημέρωσε το `history.md` και κάνε commit + push.
