import bcrypt from 'bcryptjs';
import { query } from './_lib/db.js';
import { HttpError } from './_lib/entities.js';
import { issueCookie, clearCookie, isAuthenticated, requireAuth } from './_lib/session.js';

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 4;

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
      // Το recoveryEmail δίνεται μόνο σε συνδεδεμένο χρήστη — ένας ανώνυμος
      // επισκέπτης δεν έχει λόγο να μαθαίνει το email του ιδιοκτήτη.
      ...(authed ? { recoveryEmail: config?.recoveryEmail ?? '' } : {}),
    };
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
    const config = await loadConfig();
    if (!config?.initialized) throw new HttpError(409, 'Η εφαρμογή δεν έχει ρυθμιστεί');

    const ok = typeof password === 'string' && (await bcrypt.compare(password, config.passwordHash));
    if (!ok) throw new HttpError(401, 'Λάθος κωδικός');

    res.setHeader('Set-Cookie', issueCookie());
    return { authed: true };
  },

  async logout(req, res) {
    res.setHeader('Set-Cookie', clearCookie());
    return { authed: false };
  },

  async updatePassword(req, res, { currentPassword, password, recoveryEmail }) {
    requireAuth(req);
    const config = await loadConfig();
    if (!config?.initialized) throw new HttpError(409, 'Η εφαρμογή δεν έχει ρυθμιστεί');

    // Ζητάμε τον τρέχοντα κωδικό ακόμη κι αν υπάρχει session: αλλιώς ένα
    // ξεχασμένο ανοιχτό session αρκεί για μόνιμη κατάληψη του λογαριασμού.
    const ok = typeof currentPassword === 'string' && (await bcrypt.compare(currentPassword, config.passwordHash));
    if (!ok) throw new HttpError(401, 'Λάθος τρέχων κωδικός');
    assertPassword(password);

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await query(
      'update app_config set "passwordHash" = $1, "recoveryEmail" = $2, updated_date = now() where id = $3',
      [hash, recoveryEmail ?? config.recoveryEmail, config.id]
    );
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
