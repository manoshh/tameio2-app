// Ενιαία πηγή για ονόματα, λεκτικά οφειλής και χρώματα των μερών του ταμείου.
//
// Τα λεκτικά ήταν γραμμένα με το χέρι σε έξι σημεία και είχαν αποκλίνει μεταξύ
// τους. Ζουν εδώ ώστε να αλλάζουν μία φορά και να συμφωνούν παντού.
//
// Οι κλάσεις Tailwind γράφονται ΟΛΟΚΛΗΡΕΣ επίτηδες: το Tailwind σαρώνει τον
// κώδικα στατικά και δεν βλέπει κλάσεις που συντίθενται δυναμικά.

const REGISTRY = {
  manos: {
    key: 'manos',
    name: 'Μάνος',
    subject: 'Ο Μάνος',      // ονομαστική, ως υποκείμενο
    indirect: 'στον Μάνο',   // «Το Ταμείο χρωστάει ___»
    tag: 'bg-sky-100 text-sky-800 border-sky-200 hover:bg-sky-100',
    card: 'bg-sky-50 border-sky-200',
    accent: 'text-sky-600',
  },
  eirini: {
    key: 'eirini',
    name: 'Ειρήνη',
    subject: 'Η Ειρήνη',
    indirect: 'στην Ειρήνη',
    tag: 'bg-violet-100 text-violet-800 border-violet-200 hover:bg-violet-100',
    card: 'bg-violet-50 border-violet-200',
    accent: 'text-violet-600',
  },
  botanicos: {
    key: 'botanicos',
    name: 'Βοτανικός',
    subject: 'Ο Βοτανικός',
    indirect: 'στον Βοτανικό',
    tag: 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100',
    card: 'bg-amber-50 border-amber-200',
    accent: 'text-amber-600',
  },
};

export function partyInfo(key) {
  return REGISTRY[key] || null;
}

/**
 * Λεκτικό και χρώμα για ένα υπόλοιπο.
 *
 * Πρόσημα: value > 0 → το Ταμείο χρωστάει στο άτομο.
 *          value < 0 → το άτομο χρωστάει στο Ταμείο.
 */
export function owedInfo(key, value) {
  const party = REGISTRY[key];
  const v = value || 0;
  const negative = v < 0;
  const positive = v > 0;

  return {
    party,
    negative,
    positive,
    label: negative
      ? `${party.subject} χρωστάει στο Ταμείο`
      : positive
        ? `Το Ταμείο χρωστάει ${party.indirect}`
        : `Καμία οφειλή — ${party.name}`,
    amount: negative ? -v : v,
    colorClass: negative ? 'text-rose-600' : positive ? 'text-emerald-700' : 'text-stone-700',
  };
}

/**
 * Οι επιλογές του πεδίου «Κατεύθυνση», με το ίδιο λεκτικό που βλέπεις στις
 * κάρτες: διαλέγεις προς ποια μεριά πάει η οφειλή, όχι κάποια αφηρημένη ενέργεια.
 */
export function directionOptions(key) {
  const party = REGISTRY[key];
  return [
    { value: 'paid_in', label: `Το Ταμείο χρωστάει ${party.indirect}` },
    { value: 'paid_out', label: `${party.subject} χρωστάει στο Ταμείο` },
  ];
}
