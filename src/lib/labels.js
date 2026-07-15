// Centralised "who owes whom" wording for owed balances.
// value > 0  -> treasury owes the person/botanicos
// value < 0  -> person/botanics owes the treasury
export function owedInfo(name, value) {
  const v = value || 0;
  const negative = v < 0;
  const positive = v > 0;
  const article = name === 'Ειρήνη' ? 'η' : 'ο';
  return {
    negative,
    positive,
    label: negative
      ? `Χρωστάει ${article} ${name} στο ταμείο`
      : `Χρωστάει το ταμείο ↔ ${name}`,
    amount: negative ? -v : v,
    colorClass: negative ? 'text-rose-600' : positive ? 'text-emerald-700' : 'text-stone-700',
  };
}