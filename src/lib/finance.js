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
 * Monthly close formula (spec):
 * 1. refillAmount = targetReserve - enteredBalance
 * 2. shareEach = refillAmount / 2
 * 3. per person: offset = clamp(owedBefore, -shareEach, +shareEach) only if shareEach > 0 else 0
 *    contribution = shareEach - offset ; owedAfter = owedBefore - offset
 * 4. all rounded to 2 decimals
 */
export function computeMonthlyClose(targetReserve, enteredBalance, manosOwedBefore, eiriniOwedBefore) {
  const refillAmount = round2(targetReserve - enteredBalance);
  const shareEach = round2(refillAmount / 2);

  const calcPerson = (owedBefore) => {
    const ob = round2(owedBefore);
    let offset = 0;
    if (shareEach > 0) offset = round2(clamp(ob, -shareEach, shareEach));
    const contribution = round2(shareEach - offset);
    const owedAfter = round2(ob - offset);
    return { owedBefore: ob, offset, contribution, owedAfter };
  };

  return {
    targetReserve: round2(targetReserve),
    enteredBalance: round2(enteredBalance),
    refillAmount,
    shareEach,
    manos: calcPerson(manosOwedBefore),
    eirini: calcPerson(eiriniOwedBefore),
  };
}