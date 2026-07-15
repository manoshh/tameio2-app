import { query } from './db.js';
import { HttpError } from './entities.js';

// Rate limiting για το login.
//
// Το bcrypt από μόνο του δεν αρκεί: το κόστος του (~250ms) το πληρώνει ο server,
// όχι ο επιτιθέμενος, και το Vercel κλιμακώνει τις functions παράλληλα. Με
// 4ψήφιο κωδικό οι 10.000 συνδυασμοί εξαντλούνται σε δευτερόλεπτα.
//
// Το όριο είναι ανά IP και όχι καθολικό, γιατί ένα καθολικό κλείδωμα θα επέτρεπε
// σε οποιονδήποτε να κλειδώνει έξω τους ιδιοκτήτες με 5 λάθος προσπάθειες.
// Πίσω από αυτό υπάρχει καθολικό δίχτυ, για την περίπτωση που κάποιος εναλλάσσει
// IP: εκεί το κλείδωμα των ιδιοκτητών είναι το σωστό τίμημα, γιατί σημαίνει ότι
// βρισκόμαστε όντως υπό επίθεση.

const MAX_PER_IP = 5;
const MAX_GLOBAL = 20;
const LOCK_MINUTES = 15;
const WINDOW_MINUTES = 15;
const GLOBAL_KEY = '__global__';

// Στο Vercel η x-forwarded-for τίθεται από τον proxy και περιέχει πρώτη την
// πραγματική IP του πελάτη.
export function clientKey(req) {
  const realIp = req.headers['x-real-ip'];
  if (realIp) return String(realIp).trim().slice(0, 100);
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim().slice(0, 100);
  return 'unknown';
}

export async function assertNotLocked(req) {
  const { rows } = await query(
    'select "lockedUntil" from login_attempt where key = any($1::text[]) and "lockedUntil" > now() order by "lockedUntil" desc limit 1',
    [[clientKey(req), GLOBAL_KEY]]
  );
  if (!rows[0]) return;
  const minutes = Math.max(1, Math.ceil((new Date(rows[0].lockedUntil) - Date.now()) / 60000));
  throw new HttpError(429, `Πολλές αποτυχημένες προσπάθειες. Δοκίμασε ξανά σε ${minutes} λεπτά.`);
}

async function bump(key, max) {
  // Ο μετρητής μηδενίζεται αν η προηγούμενη αποτυχία είναι εκτός παραθύρου, ώστε
  // λίγες σκόρπιες αποτυχίες σε βάθος χρόνου να μη συσσωρεύονται σε κλείδωμα.
  const { rows } = await query(
    `insert into login_attempt (key, "failedAttempts") values ($1, 1)
     on conflict (key) do update set
       "failedAttempts" = case
         when login_attempt.updated_date < now() - make_interval(mins => $2) then 1
         else login_attempt."failedAttempts" + 1
       end,
       updated_date = now()
     returning "failedAttempts"`,
    [key, WINDOW_MINUTES]
  );

  if (rows[0].failedAttempts >= max) {
    await query(
      'update login_attempt set "failedAttempts" = 0, "lockedUntil" = now() + make_interval(mins => $1), updated_date = now() where key = $2',
      [LOCK_MINUTES, key]
    );
  }
}

export async function registerFailure(req) {
  await bump(clientKey(req), MAX_PER_IP);
  await bump(GLOBAL_KEY, MAX_GLOBAL);
}

export async function registerSuccess(req) {
  // Μόνο η IP που πέτυχε καθαρίζει. Ο καθολικός μετρητής μένει: μια επιτυχημένη
  // σύνδεση δεν σημαίνει ότι σταμάτησε η επίθεση από αλλού.
  await query('delete from login_attempt where key = $1', [clientKey(req)]);
  await query(
    `delete from login_attempt
     where key <> $1 and updated_date < now() - interval '1 day'
       and ("lockedUntil" is null or "lockedUntil" < now())`,
    [GLOBAL_KEY]
  );
}
