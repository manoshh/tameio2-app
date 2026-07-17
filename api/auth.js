import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query } from './_lib/db.js';
import { HttpError } from './_lib/entities.js';
import { issueCookie, clearCookie, isAuthenticated, requireAuth } from './_lib/session.js';
import { assertNotLocked, registerFailure, registerSuccess } from './_lib/rateLimit.js';
import { sendEmail, isEmailConfigured, resetEmailTemplate } from './_lib/email.js';

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 4;
const RESET_TTL_MINUTES = 60;

// Η διεύθυνση του συνδέσμου ΔΕΝ προκύπτει από το header Host του αιτήματος:
// θα επέτρεπε σε επιτιθέμενο να στείλει στον ιδιοκτήτη σύνδεσμο που δείχνει
// στον δικό του server και να υποκλέψει το token (Host header injection).
const APP_URL = (process.env.APP_URL || 'https://tameio2-app.vercel.app').replace(/\/$/, '');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Το app_config είναι σκόπιμα εκτός του /api/data whitelist: το hash του κωδικού
// δεν πρέπει να είναι ποτέ αναγνώσιμο από τον client.
async function loadConfig() {
  const { rows } = await query('select * from app_config order by created_date asc limit 1');
  return rows[0] || null;
}

function assertPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Ο κωδικός πρέπει να έχει τουλάχιστον ${MIN_PASSWORD_LENGTH} χαρακτήρες`);
  }
}

const OPERATIONS = {
  async status(req) {
    const config = await loadConfig();
    const authed = isAuthenticated(req);
    return {
      initialized: Boolean(config?.initialized),
      authed,
      // Λέει μόνο ΑΝ η επαναφορά είναι δυνατή, ποτέ σε ποιο email. Χωρίς αυτό, ο
      // σύνδεσμος «ξέχασα τον κωδικό» θα εμφανιζόταν και όταν δεν μπορεί να
      // δουλέψει, στέλνοντας τον χρήστη σε αδιέξοδο.
      canReset: Boolean(config?.recoveryEmail) && isEmailConfigured(),
      // Το ίδιο το email μόνο σε συνδεδεμένο χρήστη.
      ...(authed ? { recoveryEmail: config?.recoveryEmail ?? '' } : {}),
    };
  },

  // Ζητά σύνδεσμο επαναφοράς. Ο χρήστης δεν πληκτρολογεί email — στέλνεται στο
  // αποθηκευμένο, οπότε δεν υπάρχει τρόπος απαρίθμησης διευθύνσεων.
  async requestReset(req) {
    // Ξεχωριστό scope από το login: το να ζητήσεις επαναφορά δεν πρέπει να σε
    // κλειδώνει έξω από τη σύνδεση. Χωρίς όριο όμως, ο καθένας θα μπορούσε να
    // βομβαρδίζει το inbox του ιδιοκτήτη.
    await assertNotLocked(req, 'reset');
    await registerFailure(req, 'reset');

    const config = await loadConfig();
    if (!config?.initialized || !config.recoveryEmail || !isEmailConfigured()) {
      // Απάντηση ίδια με την επιτυχία: δεν αποκαλύπτουμε τι λείπει.
      return { sent: true };
    }

    const token = crypto.randomBytes(32).toString('base64url');
    // Τα προηγούμενα tokens ακυρώνονται: ένα ενεργό κάθε φορά.
    await query('delete from password_reset');
    await query(
      'insert into password_reset ("tokenHash", "expiresAt") values ($1, now() + make_interval(mins => $2))',
      [hashToken(token), RESET_TTL_MINUTES]
    );

    const { subject, html, text } = resetEmailTemplate(`${APP_URL}/reset-password?token=${token}`);
    try {
      await sendEmail({ to: config.recoveryEmail, subject, html, text });
    } catch (err) {
      // Αν η αποστολή απέτυχε, το token δεν πρέπει να μείνει ενεργό.
      await query('delete from password_reset');
      throw err;
    }

    return { sent: true };
  },

  // Ελέγχει αν ένα token είναι ακόμη έγκυρο, ώστε η σελίδα να μην εμφανίσει
  // φόρμα που δεν πρόκειται να δουλέψει.
  async verifyResetToken(req, res, { token }) {
    if (typeof token !== 'string' || !token) return { valid: false };
    const { rows } = await query(
      'select 1 from password_reset where "tokenHash" = $1 and "usedAt" is null and "expiresAt" > now()',
      [hashToken(token)]
    );
    return { valid: rows.length > 0 };
  },

  async resetPassword(req, res, { token, password }) {
    // Scope 'reset': ένας χρήστης που πατάει ξανά έναν ληγμένο σύνδεσμο δεν
    // πρέπει να κλειδώνεται έξω από τη σύνδεση.
    await assertNotLocked(req, 'reset');
    if (typeof token !== 'string' || !token) throw new HttpError(400, 'Μη έγκυρος σύνδεσμος');
    assertPassword(password);

    const config = await loadConfig();
    if (!config?.initialized) throw new HttpError(409, 'Η εφαρμογή δεν έχει ρυθμιστεί');

    // Η σήμανση ως χρησιμοποιημένο γίνεται στο ίδιο statement με τον έλεγχο:
    // δύο ταυτόχρονα αιτήματα με το ίδιο token δεν μπορούν να περάσουν και τα δύο.
    const { rows } = await query(
      `update password_reset set "usedAt" = now()
       where "tokenHash" = $1 and "usedAt" is null and "expiresAt" > now()
       returning id`,
      [hashToken(token)]
    );
    if (!rows[0]) {
      await registerFailure(req, 'reset');
      throw new HttpError(400, 'Ο σύνδεσμος έληξε ή έχει ήδη χρησιμοποιηθεί');
    }

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await query('update app_config set "passwordHash" = $1, updated_date = now() where id = $2', [hash, config.id]);
    await query('delete from password_reset');
    await registerSuccess(req, 'reset');
    // Ο νέος κωδικός καθαρίζει και το κλείδωμα σύνδεσης: αν κάποιος κλειδώθηκε
    // δοκιμάζοντας τον ξεχασμένο κωδικό, δεν έχει νόημα να περιμένει.
    await registerSuccess(req, 'login');

    // Ο χρήστης μόλις απέδειξε πρόσβαση στο email ανάκτησης — τον συνδέουμε.
    res.setHeader('Set-Cookie', issueCookie());
    return { success: true };
  },

  async setup(req, res, { password, recoveryEmail }) {
    const config = await loadConfig();
    // Χωρίς αυτόν τον έλεγχο, οποιοσδήποτε θα μπορούσε να «ξαναστήσει» την
    // εφαρμογή και να ορίσει δικό του κωδικό.
    if (config?.initialized) throw new HttpError(409, 'Η εφαρμογή έχει ήδη ρυθμιστεί');
    assertPassword(password);

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    if (config) {
      await query(
        'update app_config set "passwordHash" = $1, "recoveryEmail" = $2, initialized = true, updated_date = now() where id = $3',
        [hash, recoveryEmail || null, config.id]
      );
    } else {
      await query(
        'insert into app_config ("passwordHash", "recoveryEmail", initialized) values ($1, $2, true)',
        [hash, recoveryEmail || null]
      );
    }
    res.setHeader('Set-Cookie', issueCookie());
    return { initialized: true, authed: true };
  },

  async login(req, res, { password }) {
    // Ο έλεγχος κλειδώματος γίνεται ΠΡΙΝ το bcrypt: αλλιώς ο επιτιθέμενος
    // εξακολουθεί να μας κοστίζει CPU σε κάθε προσπάθεια.
    await assertNotLocked(req);

    const config = await loadConfig();
    if (!config?.initialized) throw new HttpError(409, 'Η εφαρμογή δεν έχει ρυθμιστεί');

    const ok = typeof password === 'string' && (await bcrypt.compare(password, config.passwordHash));
    if (!ok) {
      await registerFailure(req);
      throw new HttpError(401, 'Λάθος κωδικός');
    }

    await registerSuccess(req);
    res.setHeader('Set-Cookie', issueCookie());
    return { authed: true };
  },

  async logout(req, res) {
    res.setHeader('Set-Cookie', clearCookie());
    return { authed: false };
  },

  async updatePassword(req, res, { currentPassword, password, recoveryEmail }) {
    requireAuth(req);
    await assertNotLocked(req);

    const config = await loadConfig();
    if (!config?.initialized) throw new HttpError(409, 'Η εφαρμογή δεν έχει ρυθμιστεί');

    // Ζητάμε τον τρέχοντα κωδικό ακόμη κι αν υπάρχει session: αλλιώς ένα
    // ξεχασμένο ανοιχτό session αρκεί για μόνιμη κατάληψη του λογαριασμού.
    // Μετράει κι αυτό στο rate limiting — είναι κι αυτό έλεγχος κωδικού.
    const ok = typeof currentPassword === 'string' && (await bcrypt.compare(currentPassword, config.passwordHash));
    if (!ok) {
      await registerFailure(req);
      throw new HttpError(401, 'Λάθος τρέχων κωδικός');
    }
    await registerSuccess(req);
    assertPassword(password);

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await query(
      'update app_config set "passwordHash" = $1, "recoveryEmail" = $2, updated_date = now() where id = $3',
      [hash, recoveryEmail ?? config.recoveryEmail, config.id]
    );
    // Εκκρεμείς σύνδεσμοι επαναφοράς ακυρώνονται: μετά από ηθελημένη αλλαγή
    // κωδικού δεν πρέπει να μένει ενεργός τρόπος παράκαμψής του.
    await query('delete from password_reset');
    // Ο νέος κωδικός ακυρώνει το παλιό session αυτού του browser: δίνουμε νέο.
    res.setHeader('Set-Cookie', issueCookie());
    return { success: true };
  },
};

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const { op, args = {} } = req.body || {};
    if (!Object.prototype.hasOwnProperty.call(OPERATIONS, op)) {
      throw new HttpError(400, `Unknown operation: ${op}`);
    }
    return res.status(200).json(await OPERATIONS[op](req, res, args));
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[api/auth]', err);
    return res.status(status).json({ error: status >= 500 ? 'Σφάλμα διακομιστή' : err.message });
  }
}
