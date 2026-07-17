export const round2 = (x) => Math.round(((x || 0) + Number.EPSILON) * 100) / 100;
export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

export function isActive(e) {
  return !e.settlementId;
}

export function sumActive(entries, predicate = () => true) {
  return round2(
    entries
      .filter((e) => isActive(e) && predicate(e))
      .reduce((s, e) => s + (e.amount || 0), 0)
  );
}

/**
 * Κλείσιμο μήνα.
 *
 * ── Πρόσημα ─────────────────────────────────────────────────────────────
 * owed > 0  →  το ταμείο χρωστάει στο άτομο (έβαλε δικά του σε κοινό έξοδο)
 * owed < 0  →  το άτομο χρωστάει στο ταμείο (το ταμείο πλήρωσε δικό του έξοδο)
 *
 * ── Ο κανόνας ───────────────────────────────────────────────────────────
 * Στον στόχο καταλήγει η ΠΡΑΓΜΑΤΙΚΗ θέση του ταμείου — τα μετρητά μείον ό,τι
 * χρωστάει — όχι τα σκέτα μετρητά. Γι' αυτό τα χρέη αφαιρούνται ΠΡΙΝ βγει το
 * μερίδιο· αλλιώς μετράνε δύο φορές:
 *
 *   πραγματικό υπόλοιπο = μετρημένο − (σύνολο όσων χρωστάει το ταμείο)
 *   λείπουν             = στόχος − πραγματικό υπόλοιπο
 *   μερίδιο             = λείπουν / 2
 *   ο καθένας βάζει     = μερίδιο − ό,τι του χρωστάει το ταμείο
 *
 * Π.χ. μετρημένο 7500, στόχος 8000, Μάνος χρωστάει 22, Ειρήνη 5:
 *   πραγματικό = 7500 − (−27) = 7527 · λείπουν 473 · μερίδιο 236,50
 *   Μάνος 258,50 · Ειρήνη 241,50 → μπαίνουν 500 → κουτί 8000 ✓
 *
 * ── Άνω όριο του offset ─────────────────────────────────────────────────
 * Κανείς δεν βγάζει μετρητά επειδή το ταμείο του χρωστάει: αν το πιστωτικό
 * ξεπερνά το μερίδιο, χρησιμοποιείται μόνο όσο χρειάζεται και το υπόλοιπο
 * μεταφέρεται στον επόμενο μήνα.
 */
export function computeMonthlyClose(targetReserve, enteredBalance, manosOwedBefore, eiriniOwedBefore) {
  const target = round2(targetReserve);
  const counted = round2(enteredBalance);
  const manosBefore = round2(manosOwedBefore);
  const eiriniBefore = round2(eiriniOwedBefore);

  const netOwed = round2(manosBefore + eiriniBefore);
  const realBalance = round2(counted - netOwed);
  const refillAmount = round2(target - realBalance);
  const shareEach = round2(refillAmount / 2);

  const calcPerson = (owedBefore) => {
    // Το πολύ όσο το μερίδιο. Το `max(shareEach, 0)` αφορά την περίπτωση που το
    // κουτί είναι ήδη πάνω από τον στόχο (μερίδιο < 0): τότε επιστρέφονται
    // μετρητά, αντί να δημιουργηθεί πιστωτικό από το πουθενά.
    const offset = round2(Math.min(owedBefore, Math.max(shareEach, 0)));
    const contribution = round2(shareEach - offset);
    const owedAfter = round2(owedBefore - offset);
    return { owedBefore, offset, contribution, owedAfter };
  };

  return {
    targetReserve: target,
    // Καταγράφεται το πραγματικό υπόλοιπο — αυτό συγκρίνεται με τον στόχο.
    enteredBalance: realBalance,
    countedBalance: counted,
    refillAmount,
    shareEach,
    manos: calcPerson(manosBefore),
    eirini: calcPerson(eiriniBefore),
  };
}

/**
 * Εφαρμόζει το ποσό που ΠΡΑΓΜΑΤΙΚΑ κατατέθηκε, όταν διαφέρει από το
 * υπολογισμένο — στρογγυλοποίηση (258,50 → 260) ή αδυναμία πληρωμής.
 *
 * Η διαφορά γίνεται υπόλοιπο για τον επόμενο μήνα:
 *   βάζει παραπάνω → το ταμείο του χρωστάει τη διαφορά (πίστωση)
 *   βάζει λιγότερα → αυτός χρωστάει τη διαφορά (χρέος)
 *
 * Το ισοζύγιο κλείνει πάντα: ό,τι δεν μπαίνει σε μετρητά γίνεται χρέος, οπότε
 * η πραγματική θέση του ταμείου πέφτει στον στόχο όσα κι αν βάλει ο καθένας.
 */
export function applyActualContribution(person, actualContribution) {
  const paid = round2(actualContribution);
  const difference = round2(paid - person.contribution);
  return {
    ...person,
    contribution: paid,
    owedAfter: round2(person.owedAfter + difference),
  };
}
