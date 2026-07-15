# Κοινό Ταμείο

Εφαρμογή διαχείρισης κοινού ταμείου (Μάνος & Ειρήνη): εγγραφές εσόδων/εξόδων,
μηνιαίο κλείσιμο με αυτόματο υπολογισμό συνεισφορών, και ξεχωριστό module για Βοτανικό.

Ξεκίνησε στο Base44 και μεταφέρθηκε σε δικό της stack.

## Stack

| Κομμάτι  | Τεχνολογία |
| -------- | ---------- |
| Frontend | React 18 + Vite + Tailwind + shadcn/ui |
| Backend  | Vercel Serverless Functions (`/api`) |
| Database | Neon (Postgres) |
| Hosting  | Vercel |

## Δομή

```
api/            Serverless functions
  data.js       Όλες οι λειτουργίες δεδομένων (list/filter/create/update/delete)
  auth.js       Σύνδεση με κοινό κωδικό
  _lib/         Σύνδεση βάσης, session, whitelist οντοτήτων
db/schema.sql   Το schema της βάσης
scripts/        Βοηθητικά scripts (migrate)
src/
  api/client.js Ο client που μιλάει στο /api
  lib/finance.js Η λογική υπολογισμών (καθαρή, χωρίς I/O)
  pages/        Οι σελίδες
```

## Τοπική εκτέλεση

1. Εγκατάσταση:

   ```bash
   npm install
   ```

2. Ρύθμιση μεταβλητών — αντίγραψε το `.env.example` σε `.env.local` και συμπλήρωσε:

   ```bash
   cp .env.example .env.local
   ```

   - `DATABASE_URL`: το pooled connection string από το Neon dashboard.
   - `SESSION_SECRET`: φτιάξ' το με `openssl rand -base64 32`.

3. Δημιουργία των πινάκων:

   ```bash
   npm run db:migrate
   ```

4. Εκτέλεση — χρειάζονται **δύο** διεργασίες, γιατί οι serverless functions τρέχουν
   ξεχωριστά από τον Vite dev server:

   ```bash
   npm run dev:api   # Vercel functions στο :3000
   npm run dev       # Vite στο :5173, κάνει proxy το /api στο :3000
   ```

   Άνοιξε το URL που τυπώνει το Vite. Την πρώτη φορά θα σου ζητήσει να ορίσεις
   τον κοινό κωδικό.

## Deploy

Το κάθε push στο `main` κάνει αυτόματο deploy μέσω Vercel.

Στις ρυθμίσεις του project στο Vercel πρέπει να υπάρχουν τα `DATABASE_URL` και
`SESSION_SECRET` ως Environment Variables (Production + Preview).

## Έλεγχοι

```bash
npm run lint
npm run build
```

## Σημειώσεις

- Ο κωδικός αποθηκεύεται **μόνο** ως bcrypt hash. Δεν υπάρχει τρόπος ανάκτησής του
  — μόνο αλλαγή μέσω Ρυθμίσεων (με τον τρέχοντα κωδικό) ή reset στη βάση.
- Το `db/schema.sql` είναι idempotent (`create table if not exists`), οπότε το
  `npm run db:migrate` τρέχει με ασφάλεια πολλές φορές.
