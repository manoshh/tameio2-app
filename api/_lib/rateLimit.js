import { query } from './db.js';
import { HttpError } from './entities.js';

// Rate limiting για τις λειτουργίες αυθεντικοποίησης.
//
// Το bcrypt από μόνο του δεν αρκεί: το κόστος του (~250ms) το πληρώνει ο server,
// όχι ο επιτιθέμενος, και το Vercel κλιμακώνει τις functions παράλληλα. Με
// 4ψήφιο κωδικό οι 10.000 συνδυασμοί εξαντλούνται σε δευτερόλεπτα.
//
// Το όριο είναι ανά IP και όχι καθολικό, γιατί ένα καθολικό κλείδωμα θα επέτρεπε
// σε οποιονδήποτε να κλειδώνει έξω τους ιδιοκτήτες. Πίσω από αυτό υπάρχει
// καθολικό δίχτυ, για την περίπτωση που κάποιος εναλλάσσει IP: εκεί το κλείδωμα
// των ιδιοκτητών είναι το σωστό τίμημα, γιατί σημαίνει επίθεση σε εξέλιξη.
//
// Τα scopes είναι ανεξάρτητα: το να ζητήσεις επαναφορά κωδικού δεν πρέπει να σε
// κλειδώνει έξω από το login, και το αντίστροφο.

const SCOPES = {
  // Δοκιμές κωδικού: αυστηρό όριο, είναι η επίθεση brute force.
  login: { maxPerKey: 5, maxGlobal: 20, lockMinutes: 15, windowMinutes: 15 },
  // Επαναφορά κωδικού: προστασία από βομβαρδισμό του inbox. Δεν χρειάζεται
  // αυστηρότητα brute force — το token είναι 256 bits. Πιο ανεκτικό όριο, ώστε
  // ένας μπερδεμένος χρήστης που ξαναζητά σύνδεσμο να μην κλειδώνεται.
  reset: { maxPerKey: 5, maxGlobal: 15, lockMinutes: 15, windowMinutes: 60 },
};

const GLOBAL = '__global__';

// Στο Vercel η x-forwarded-for τίθεται από τον proxy και περιέχει πρώτη την
// πραγματική IP του πελάτη.
export function clientIp(req) {
  const realIp = req.headers['x-real-ip'];
  if (realIp) return String(realIp).trim().slice(0, 100);
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim().slice(0, 100);
  return 'unknown';
}

const keyFor = (scope, id) => `${scope}:${id}`;

export async function assertNotLocked(req, scope = 'login') {
  const { rows } = await query(
    'select "lockedUntil" from login_attempt where key = any($1::text[]) and "lockedUntil" > now() order by "lockedUntil" desc limit 1',
    [[keyFor(scope, clientIp(req)), keyFor(scope, GLOBAL)]]
  );
  if (!rows[0]) return;
  const minutes = Math.max(1, Math.ceil((new Date(rows[0].lockedUntil) - Date.now()) / 60000));
  const what = scope === 'reset' ? 'αιτήματα επαναφοράς' : 'αποτυχημένες προσπάθειες';
  throw new HttpError(429, `Πολλά ${what}. Δοκίμασε ξανά σε ${minutes} λεπτά.`);
}

async function bump(key, { maxPerKey, maxGlobal, lockMinutes, windowMinutes }, isGlobal) {
  // Ο μετρητής μηδενίζεται αν η προηγούμενη καταγραφή είναι εκτός παραθύρου, ώστε
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
    [key, windowMinutes]
  );

  if (rows[0].failedAttempts >= (isGlobal ? maxGlobal : maxPerKey)) {
    await query(
      'update login_attempt set "failedAttempts" = 0, "lockedUntil" = now() + make_interval(mins => $1), updated_date = now() where key = $2',
      [lockMinutes, key]
    );
  }
}

export async function registerFailure(req, scope = 'login') {
  const config = SCOPES[scope];
  await bump(keyFor(scope, clientIp(req)), config, false);
  await bump(keyFor(scope, GLOBAL), config, true);
}

export async function registerSuccess(req, scope = 'login') {
  // Μόνο η IP που πέτυχε καθαρίζει, και μόνο στο δικό της scope. Ο καθολικός
  // μετρητής μένει: μια επιτυχημένη σύνδεση δεν σημαίνει ότι σταμάτησε η
  // επίθεση από αλλού.
  await query('delete from login_attempt where key = $1', [keyFor(scope, clientIp(req))]);
  await query(
    `delete from login_attempt
     where key not like '%:__global__' and updated_date < now() - interval '1 day'
       and ("lockedUntil" is null or "lockedUntil" < now())`
  );
}
