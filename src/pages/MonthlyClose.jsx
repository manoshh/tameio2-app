import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

import { listAllEntries, getSettings, fmt } from '@/lib/api';
import { round2, sumActive, computeMonthlyClose, applyActualContribution } from '@shared/finance';
import { owedInfo } from '@/lib/labels';
import PageHeader from '@/components/PageHeader';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { settlements } from '@/api/client';

export default function MonthlyClose() {
  const { toast } = useToast();
  const [settings, setSettings] = useState(null);
  const [entries, setEntries] = useState([]);
  const [entered, setEntered] = useState('');
  const [paid, setPaid] = useState({ manos: '', eirini: '' });
  const [busy, setBusy] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);

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
  const manosBefore = owedInfo('Μάνος', manosOwed);
  const eiriniBefore = owedInfo('Ειρήνη', eiriniOwed);

  const calc = useMemo(
    () => (settings ? computeMonthlyClose(settings.targetReserve, effectiveBalance, manosOwed, eiriniOwed) : null),
    [settings, effectiveBalance, manosOwed, eiriniOwed]
  );

  // Τα πεδία κατάθεσης προσυμπληρώνονται με το υπολογισμένο ποσό, και
  // ξαναγεμίζουν όποτε αυτό αλλάζει (π.χ. διορθώνεις το μετρημένο υπόλοιπο).
  const suggestedManos = calc?.manos.contribution;
  const suggestedEirini = calc?.eirini.contribution;
  useEffect(() => {
    if (suggestedManos === undefined) return;
    setPaid({ manos: String(suggestedManos), eirini: String(suggestedEirini) });
  }, [suggestedManos, suggestedEirini]);

  // Ό,τι κατατίθεται διαφορετικά από το υπολογισμένο μεταφέρεται στον επόμενο μήνα.
  const actual = {
    manos: paid.manos === '' ? (suggestedManos ?? 0) : (parseFloat(paid.manos) || 0),
    eirini: paid.eirini === '' ? (suggestedEirini ?? 0) : (parseFloat(paid.eirini) || 0),
  };
  const final = calc && {
    manos: applyActualContribution(calc.manos, actual.manos),
    eirini: applyActualContribution(calc.eirini, actual.eirini),
  };

  const run = async () => {
    setSettleOpen(false);
    setBusy(true);
    try {
      // Ο server ξαναϋπολογίζει τα πάντα από τις εγγραφές· εδώ στέλνουμε μόνο
      // μετρημένα γεγονότα: το υπόλοιπο και πόσα κατέθεσε πράγματι ο καθένας.
      await settlements.close(enteredNum, actual);
      toast({ title: 'Το κλείσιμο ολοκληρώθηκε' });
      await reload();
      setEntered('');
    } catch (err) {
      toast({ title: 'Σφάλμα κλεισίματος', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (!settings || !calc) return <div className="py-10 text-center text-stone-400">Φόρτωση...</div>;

  return (
    <div>
      <PageHeader title="Κλείσιμο μήνα" subtitle="Μέτρα το κουτί — η εφαρμογή βγάζει τι βάζει ο καθένας" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-stone-200">
          <CardHeader><CardTitle className="text-base">Είσοδος</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Πραγματικό μετρημένο υπόλοιπο (€)</Label>
              <Input type="number" step="0.01" value={entered} onChange={(e) => setEntered(e.target.value)} placeholder="0.00" autoFocus />
            </div>
            <div className="text-sm text-stone-500 space-y-1 pt-2 border-t border-stone-100">
              <Row label="Στόχος-απόθεμα" value={fmt(settings.targetReserve)} />
              <Row label={`${manosBefore.label} (πριν)`} value={fmt(manosBefore.amount)} />
              <Row label={`${eiriniBefore.label} (πριν)`} value={fmt(eiriniBefore.amount)} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-stone-200">
          <CardHeader><CardTitle className="text-base">Υπολογισμός</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {/* Το «πραγματικό υπόλοιπο» είναι το μετρημένο μείον ό,τι χρωστάει το
                ταμείο — αυτό συγκρίνεται με τον στόχο, όχι τα σκέτα μετρητά. */}
            {enteredNum !== 0 && calc.enteredBalance !== enteredNum && (
              <Row label="Πραγματικό υπόλοιπο (μείον οφειλές)" value={fmt(calc.enteredBalance)} />
            )}
            <Row label="Λείπουν (στόχος − πραγματικό)" value={fmt(calc.refillAmount)} strong />
            <Row label="Μερίδιο ανά άτομο" value={fmt(calc.shareEach)} strong />
            {botanicosBal !== 0 && (
              <div className="text-xs text-stone-400">Διακανονισμός Βοτανικού {fmt(botanicosBal)} · υπόλοιπο μετά μεταφορά: {fmt(effectiveBalance)}</div>
            )}
            <div className="pt-3 border-t border-stone-100 space-y-3">
              <PersonResult
                name="Μάνος"
                computed={calc.manos}
                result={final.manos}
                value={paid.manos}
                onChange={(v) => setPaid((p) => ({ ...p, manos: v }))}
              />
              <PersonResult
                name="Ειρήνη"
                computed={calc.eirini}
                result={final.eirini}
                value={paid.eirini}
                onChange={(v) => setPaid((p) => ({ ...p, eirini: v }))}
              />
            </div>
            <Button className="w-full mt-3 bg-emerald-700 hover:bg-emerald-800" disabled={busy || !entered} onClick={() => setSettleOpen(true)}>
              {busy ? 'Επεξεργασία...' : 'Κλείσιμο & αρχειοθέτηση'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={settleOpen} onOpenChange={setSettleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Επιβεβαίωση κλεισίματος</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-stone-700">
            {botanicosBal !== 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
                <p className="font-medium text-amber-900">
                  {botanicosBal > 0
                    ? `Το Ταμείο χρωστάει ${fmt(botanicosBal)} στον Βοτανικό.`
                    : `Ο Βοτανικός χρωστάει ${fmt(-botanicosBal)} στο Ταμείο.`}
                </p>
                <p className="text-amber-800 text-xs">Κάνε πρώτα την τραπεζική μεταφορά και μετά επιβεβαίωσε.</p>
              </div>
            )}
            <div className="bg-stone-50 rounded-lg p-3 space-y-2">
              <SummaryRow label="Μάνος καταθέτει" value={fmt(actual.manos)} />
              <SummaryRow label="Ειρήνη καταθέτει" value={fmt(actual.eirini)} />
              <div className="pt-2 border-t border-stone-200">
                <SummaryRow label="Το κουτί γίνεται" value={fmt(round2(effectiveBalance + actual.manos + actual.eirini))} strong />
              </div>
            </div>
            {(final.manos.owedAfter !== 0 || final.eirini.owedAfter !== 0) && (
              <div className="text-xs text-stone-500 space-y-1">
                <p className="font-medium text-stone-600">Μεταφέρονται στον επόμενο μήνα:</p>
                {final.manos.owedAfter !== 0 && <CarryLine name="Μάνος" value={final.manos.owedAfter} />}
                {final.eirini.owedAfter !== 0 && <CarryLine name="Ειρήνη" value={final.eirini.owedAfter} />}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettleOpen(false)}>Άκυρο</Button>
            <Button className="bg-emerald-700 hover:bg-emerald-800" disabled={busy} onClick={run}>Επιβεβαίωση</Button>
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

function SummaryRow({ label, value, strong }) {
  return (
    <div className="flex justify-between">
      <span className={strong ? 'font-medium text-stone-800' : 'text-stone-600'}>{label}</span>
      <span className={`tabular-nums ${strong ? 'font-semibold text-stone-900' : 'text-stone-700'}`}>{value}</span>
    </div>
  );
}

function CarryLine({ name, value }) {
  const info = owedInfo(name, value);
  return (
    <div className="flex justify-between">
      <span>{info.label}</span>
      <span className={`tabular-nums font-medium ${info.colorClass}`}>{fmt(info.amount)}</span>
    </div>
  );
}

function PersonResult({ name, computed, result, value, onChange }) {
  const after = owedInfo(name, result.owedAfter);
  const diff = round2(result.contribution - computed.contribution);

  return (
    <div className="bg-stone-50 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-stone-800">{name}</span>
        {computed.offset !== 0 && (
          <span className="text-xs text-stone-400">συμψηφισμός {fmt(computed.offset)}</span>
        )}
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-stone-500">Καταθέτει (€)</Label>
        <Input
          type="number"
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-white tabular-nums"
        />
        {diff !== 0 && (
          <p className="text-xs text-stone-400">
            Υπολογισμένο: {fmt(computed.contribution)} · {diff > 0 ? 'παραπάνω' : 'λιγότερα'} κατά {fmt(Math.abs(diff))}
          </p>
        )}
      </div>

      <div className="flex justify-between text-xs pt-1 border-t border-stone-200">
        <span className="text-stone-500">{after.label} (μετά)</span>
        <span className={`tabular-nums font-semibold ${after.colorClass}`}>{fmt(after.amount)}</span>
      </div>
    </div>
  );
}
