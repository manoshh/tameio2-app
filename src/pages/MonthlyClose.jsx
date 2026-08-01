import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

import { listAllEntries, getSettings, fmt } from '@/lib/api';
import { round2, sumActive, computeMonthlyClose, applyActualContribution } from '@shared/finance';
import { owedInfo } from '@/lib/labels';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { settlements } from '@/api/client';

const PENDING_CLOSE_KEY = 'tameio.pendingClose';

function readPendingClose() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_CLOSE_KEY) || 'null');
  } catch {
    localStorage.removeItem(PENDING_CLOSE_KEY);
    return null;
  }
}

export default function MonthlyClose({ onClosed }) {
  const pending = useMemo(readPendingClose, []);
  const { toast } = useToast();
  const [settings, setSettings] = useState(null);
  const [entries, setEntries] = useState([]);
  const [entered, setEntered] = useState(pending?.entered || '');
  const [paid, setPaid] = useState(pending?.paid || { manos: 0, eirini: 0 });
  const [depositInput, setDepositInput] = useState(pending?.depositInput || { manos: '0', eirini: '0' });
  const [busy, setBusy] = useState(false);
  const [settleOpen, setSettleOpen] = useState(Boolean(pending?.open));
  const [botanicosAction, setBotanicosAction] = useState(pending?.botanicosAction || null);
  const [personAction, setPersonAction] = useState(pending?.personAction || { manos: null, eirini: null });

  const reload = async () => {
    const [e, s] = await Promise.all([listAllEntries(), getSettings()]);
    setEntries(e); setSettings(s);
  };

  useEffect(() => { reload(); }, []);

  const manosOwed = sumActive(entries, (e) => e.person === 'manos' && e.module === 'person');
  const eiriniOwed = sumActive(entries, (e) => e.person === 'eirini' && e.module === 'person');
  const botanicosBal = sumActive(entries, (e) => e.module === 'botanicos');

  const enteredNum = parseFloat(entered) || 0;
  const effectiveBalance = round2(enteredNum - botanicosBal);
  const manosBefore = owedInfo('manos', manosOwed);
  const eiriniBefore = owedInfo('eirini', eiriniOwed);
  const botanicosInfo = owedInfo('botanicos', botanicosBal);

  const calc = useMemo(
    () => (settings ? computeMonthlyClose(settings.targetReserve, effectiveBalance, manosOwed, eiriniOwed) : null),
    [settings, effectiveBalance, manosOwed, eiriniOwed]
  );

  // Η οφειλόμενη συνεισφορά δεν μηδενίζεται. Μόνο το πεδίο νέας
  // κατάθεσης ξεκινά από 0. Κάθε OK αφαιρεί το ποσό από το υπόλοιπο.
  const suggestedManos = calc?.manos.contribution;
  const suggestedEirini = calc?.eirini.contribution;
  useEffect(() => {
    if (suggestedManos === undefined) return;
    if (settleOpen) return;
    setPaid({ manos: 0, eirini: 0 });
    setDepositInput({ manos: '0', eirini: '0' });
    setPersonAction({ manos: null, eirini: null });
    setBotanicosAction(null);
  }, [suggestedManos, suggestedEirini, settleOpen]);

  useEffect(() => {
    if (!settleOpen) return;
    localStorage.setItem(PENDING_CLOSE_KEY, JSON.stringify({
      open: true, entered, paid, depositInput, botanicosAction, personAction,
    }));
  }, [settleOpen, entered, paid, depositInput, botanicosAction, personAction]);

  // Ό,τι κατατίθεται διαφορετικά από το υπολογισμένο μεταφέρεται στον επόμενο μήνα.
  const actual = paid;
  const final = calc && {
    manos: applyActualContribution(calc.manos, actual.manos),
    eirini: applyActualContribution(calc.eirini, actual.eirini),
  };

  const applyDeposit = (party) => {
    const amount = round2(parseFloat(depositInput[party]) || 0);
    const remaining = round2(Math.max(calc[party].contribution - paid[party], 0));
    if (amount < 0 || amount > remaining) {
      toast({ title: 'Μη έγκυρο ποσό', description: `Μπορείς να καταχωρίσεις έως ${fmt(remaining)}.`, variant: 'destructive' });
      return;
    }
    const nextPaid = round2(paid[party] + amount);
    const settled = round2(calc[party].contribution - nextPaid) === 0;
    setPaid((p) => ({ ...p, [party]: nextPaid }));
    setDepositInput((p) => ({ ...p, [party]: '0' }));
    setPersonAction((p) => ({ ...p, [party]: settled ? 'ok' : null }));
  };

  const run = async () => {
    setBusy(true);
    try {
      // Ο server ξαναϋπολογίζει τα πάντα από τις εγγραφές· εδώ στέλνουμε μόνο
      // μετρημένα γεγονότα: το υπόλοιπο και πόσα κατέθεσε πράγματι ο καθένας.
      await settlements.close(enteredNum, actual, botanicosAction || 'settled');
      localStorage.removeItem(PENDING_CLOSE_KEY);
      setSettleOpen(false);
      toast({ title: 'Το κλείσιμο ολοκληρώθηκε' });
      await reload();
      setEntered('');
      onClosed?.();
    } catch (err) {
      toast({ title: 'Σφάλμα κλεισίματος', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const cancelClose = () => {
    localStorage.removeItem(PENDING_CLOSE_KEY);
    setSettleOpen(false);
    setPaid({ manos: 0, eirini: 0 });
    setDepositInput({ manos: '0', eirini: '0' });
    setPersonAction({ manos: null, eirini: null });
    setBotanicosAction(null);
  };

  if (!settings || !calc) return <div className="py-10 text-center text-stone-400">Φόρτωση...</div>;

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-stone-200">
          <CardHeader><CardTitle className="text-base">Είσοδος</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Τρέχον υπόλοιπο Πειραιώς</Label>
              <Input type="number" step="0.01" value={entered} onChange={(e) => setEntered(e.target.value)} placeholder="0.00" autoFocus />
              <p className="text-xs text-stone-400">Το υπόλοιπο του λογαριασμού Πειραιώς αυτή τη στιγμή.</p>
            </div>

            {/* Η αλυσίδα από το μετρημένο ώς το «λείπουν». Χωρίς αυτήν, το τελικό
                νούμερο δεν εξηγείται: το μετρημένο ΔΕΝ είναι η πραγματική θέση
                του ταμείου όσο εκκρεμούν οφειλές. */}
            <div className="text-sm space-y-1.5 pt-3 border-t border-stone-100">
              <Row label="Τρέχον υπόλοιπο Πειραιώς" value={fmt(enteredNum)} />

              {botanicosBal !== 0 && (
                <Adjustment
                  label={botanicosInfo.negative ? 'Ο Βοτανικός χρωστάει στο Ταμείο (θα προστεθούν)' : 'Το Ταμείο χρωστάει στον Βοτανικό (θα αφαιρεθούν)'}
                  delta={-botanicosBal}
                />
              )}
              {manosOwed !== 0 && <Adjustment label={manosBefore.label} delta={-manosOwed} />}
              {eiriniOwed !== 0 && <Adjustment label={eiriniBefore.label} delta={-eiriniOwed} />}

              <div className="pt-1.5 border-t border-stone-200">
                <Row label="Πραγματικό υπόλοιπο" value={fmt(calc.enteredBalance)} strong />
              </div>
              <Row label="Στόχος-απόθεμα" value={fmt(settings.targetReserve)} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-stone-200">
          <CardHeader><CardTitle className="text-base">Υπολογισμός</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Λείπουν (στόχος − πραγματικό)" value={fmt(calc.refillAmount)} strong />
            <Row label="Μερίδιο ανά άτομο" value={fmt(calc.shareEach)} strong />
            <div className="pt-3 border-t border-stone-100 space-y-3">
              <PersonResult
                party="manos"
                computed={calc.manos}
              />
              <PersonResult
                party="eirini"
                computed={calc.eirini}
              />
            </div>
            <Button className="w-full mt-3 bg-emerald-700 hover:bg-emerald-800" disabled={busy || !entered} onClick={() => setSettleOpen(true)}>
              {busy ? 'Επεξεργασία...' : 'Κλείσιμο & αρχειοθέτηση'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={settleOpen} onOpenChange={() => {}}>
        <DialogContent hideClose onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Επιβεβαίωση κλεισίματος</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-stone-700">
            {botanicosBal !== 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-1">
                <p className="font-medium text-amber-900">
                  {botanicosInfo.label}: {fmt(botanicosInfo.amount)}
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button type="button" size="sm" variant={botanicosAction === 'postpone' ? 'default' : 'outline'} onClick={() => setBotanicosAction('postpone')}>Postpone</Button>
                  <Button type="button" size="sm" variant={botanicosAction === 'settled' ? 'default' : 'outline'} onClick={() => setBotanicosAction('settled')}>Τακτοποιήθηκε</Button>
                </div>
              </div>
            )}
            <div className="bg-stone-50 rounded-lg p-3 space-y-3">
              {['manos', 'eirini'].map((party) => (
                <DepositDecision
                  key={party}
                  party={party}
                  due={calc[party].contribution}
                  paid={paid[party]}
                  value={depositInput[party]}
                  action={personAction[party]}
                  onChange={(value) => setDepositInput((p) => ({ ...p, [party]: value }))}
                  onClear={() => {
                    setPaid((p) => ({ ...p, [party]: 0 }));
                    setDepositInput((p) => ({ ...p, [party]: '0' }));
                    setPersonAction((p) => ({ ...p, [party]: null }));
                  }}
                  onOk={() => applyDeposit(party)}
                  onPostpone={() => setPersonAction((p) => ({ ...p, [party]: 'postpone' }))}
                />
              ))}
              <div className="pt-2 border-t border-stone-200">
                <SummaryRow label="Τραπεζικό υπόλοιπο μετά" value={fmt(round2(enteredNum + (botanicosAction === 'settled' ? -botanicosBal : 0) + actual.manos + actual.eirini))} strong />
              </div>
            </div>
            {(final.manos.owedAfter !== 0 || final.eirini.owedAfter !== 0) && (
              <div className="text-xs text-stone-500 space-y-1">
                <p className="font-medium text-stone-600">Μεταφέρονται στον επόμενο μήνα:</p>
                {final.manos.owedAfter !== 0 && <CarryLine party="manos" value={final.manos.owedAfter} />}
                {final.eirini.owedAfter !== 0 && <CarryLine party="eirini" value={final.eirini.owedAfter} />}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelClose}>Cancel</Button>
            <Button className="bg-emerald-700 hover:bg-emerald-800" disabled={busy || (botanicosBal !== 0 && !botanicosAction) || !personAction.manos || !personAction.eirini} onClick={run}>Επιβεβαίωση</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className="flex justify-between">
      <span className="text-stone-500">{label}</span>
      <span className={`tabular-nums ${strong ? 'font-semibold text-stone-900' : 'text-stone-700'}`}>{value}</span>
    </div>
  );
}

// Γραμμή προσαρμογής: δείχνει ΠΟΣΟ και ΠΡΟΣ ΤΑ ΠΟΥ κινεί το υπόλοιπο μια
// εκκρεμής οφειλή, με ρητό πρόσημο ώστε η αλυσίδα να διαβάζεται σαν πρόσθεση.
function Adjustment({ label, delta }) {
  const positive = delta > 0;
  return (
    <div className="flex justify-between gap-3">
      <span className="text-stone-500 leading-tight">{label}</span>
      <span className={`tabular-nums whitespace-nowrap ${positive ? 'text-emerald-700' : 'text-rose-600'}`}>
        {positive ? '+' : '−'}{fmt(Math.abs(delta))}
      </span>
    </div>
  );
}

function SummaryRow({ label, value, strong }) {
  return (
    <div className="flex justify-between">
      <span className={strong ? 'font-medium text-stone-800' : 'text-stone-600'}>{label}</span>
      <span className={`tabular-nums ${strong ? 'font-semibold text-stone-900' : 'text-stone-700'}`}>{value}</span>
    </div>
  );
}

function CarryLine({ party, value }) {
  const info = owedInfo(party, value);
  return (
    <div className="flex justify-between">
      <span>{info.label}</span>
      <span className={`tabular-nums font-medium ${info.colorClass}`}>{fmt(info.amount)}</span>
    </div>
  );
}

function DepositDecision({ party, due, paid, value, action, onChange, onClear, onOk, onPostpone }) {
  const info = owedInfo(party, 0);
  const remaining = round2(Math.max(due - paid, 0));
  const enteredAmount = round2(parseFloat(value) || 0);
  const settlesExactly = remaining > 0 && enteredAmount === remaining;
  return (
    <div className="space-y-2 border-b border-stone-200 pb-3 last:border-0">
      <div className="flex justify-between gap-3">
        <Label>{info.party.subject} κατέθεσε</Label>
        <span className="text-xs text-stone-500">Αρχικό: {fmt(due)}</span>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input type="number" step="0.01" min="0" value={value} onChange={(e) => onChange(e.target.value)} className="bg-white tabular-nums" />
        <Button type="button" size="sm" variant="outline" onClick={onClear}>Clear</Button>
        <Button type="button" size="sm" variant={action === 'ok' ? 'default' : 'outline'} onClick={onOk}>{settlesExactly || action === 'ok' ? 'Τακτοποιήθηκε' : 'OK'}</Button>
        <Button type="button" size="sm" variant={action === 'postpone' ? 'default' : 'outline'} onClick={onPostpone}>Postpone</Button>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-stone-500">{action === 'postpone' ? 'Μεταφέρεται' : 'Υπόλοιπο'}</span>
        <span className="font-semibold tabular-nums text-stone-800">{fmt(remaining)}</span>
      </div>
    </div>
  );
}

function PersonResult({ party, computed }) {
  const info = owedInfo(party, 0);

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${info.party.card}`}>
      <div className="flex items-center justify-between">
        <span className="font-medium text-stone-800">{info.party.name}</span>
        {computed.offset !== 0 && (
          <span className="text-xs text-stone-500">συμψηφισμός {fmt(computed.offset)}</span>
        )}
      </div>

      <div className="flex justify-between text-sm pt-1 border-t border-stone-200">
        <span className="text-stone-500">Καταθέτει</span>
        <span className="tabular-nums font-semibold text-stone-900">{fmt(computed.contribution)}</span>
      </div>
    </div>
  );
}
