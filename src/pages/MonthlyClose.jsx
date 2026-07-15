import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

import { listAllEntries, getSettings, fmt } from '@/lib/api';
import { round2, sumActive, computeMonthlyClose } from '@/lib/finance';
import { owedInfo } from '@/lib/labels';
import PageHeader from '@/components/PageHeader';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { db } from '@/api/client';

export default function MonthlyClose() {
  const { toast } = useToast();
  const [settings, setSettings] = useState(null);
  const [entries, setEntries] = useState([]);
  const [entered, setEntered] = useState('');
  const [busy, setBusy] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const [e, s] = await Promise.all([listAllEntries(), getSettings()]);
      setEntries(e); setSettings(s);
    })();
  }, []);

  const manosOwed = sumActive(entries, (e) => e.person === 'manos' && e.module === 'person');
  const eiriniOwed = sumActive(entries, (e) => e.person === 'eirini' && e.module === 'person');
  const botanicosBal = sumActive(entries, (e) => e.module === 'botanicos');

  const enteredNum = parseFloat(entered) || 0;
  const effectiveBalance = round2(enteredNum - botanicosBal);
  const manosBefore = owedInfo('Μάνος', manosOwed);
  const eiriniBefore = owedInfo('Ειρήνη', eiriniOwed);
  const calc = settings ? computeMonthlyClose(settings.targetReserve, effectiveBalance, manosOwed, eiriniOwed) : null;

  const run = async () => {
    setSettleOpen(false);
    setBusy(true);
    try {
      const now = new Date();

      // 1) Botanicos settlement (after the bank transfer)
      if (botanicosBal !== 0) {
        const bs = await db.entities.BotanicosSettlement.create({
          month: now.getMonth() + 1, year: now.getFullYear(),
          balanceBefore: botanicosBal, timestamp: now.toISOString(),
        });
        const activeBot = entries.filter((e) => e.module === 'botanicos' && !e.settlementId);
        if (activeBot.length) await db.entities.LedgerEntry.bulkUpdate(activeBot.map((e) => ({ id: e.id, settlementId: bs.id })));
      }

      // 2) Person settlement snapshot (post-transfer effective balance)
      const settlement = await db.entities.Settlement.create({
        month: now.getMonth() + 1, year: now.getFullYear(),
        enteredBalance: calc.enteredBalance, targetReserve: calc.targetReserve,
        refillAmount: calc.refillAmount, shareEach: calc.shareEach,
        manosOwedBefore: calc.manos.owedBefore, manosOwedAfter: calc.manos.owedAfter,
        manosOffset: calc.manos.offset, manosContribution: calc.manos.contribution,
        eiriniOwedBefore: calc.eirini.owedBefore, eiriniOwedAfter: calc.eirini.owedAfter,
        eiriniOffset: calc.eirini.offset, eiriniContribution: calc.eirini.contribution,
        botanicosBalanceBefore: botanicosBal, timestamp: now.toISOString(),
      });

      const activePerson = entries.filter((e) => e.module === 'person' && !e.settlementId);
      if (activePerson.length) {
        await db.entities.LedgerEntry.bulkUpdate(activePerson.map((e) => ({ id: e.id, settlementId: settlement.id })));
      }

      const today = now.toISOString().slice(0, 10);
      const carryOvers = [];
      if (calc.manos.owedAfter !== 0) carryOvers.push({ module: 'person', person: 'manos', amount: calc.manos.owedAfter, description: 'Υπόλοιπο από προηγ. μήνα', date: today, settlementId: '', carryOverSettlementId: settlement.id });
      if (calc.eirini.owedAfter !== 0) carryOvers.push({ module: 'person', person: 'eirini', amount: calc.eirini.owedAfter, description: 'Υπόλοιπο από προηγ. μήνα', date: today, settlementId: '', carryOverSettlementId: settlement.id });
      if (carryOvers.length) await db.entities.LedgerEntry.bulkCreate(carryOvers);

      await db.entities.Settings.update(settings.id, { manosOwed: calc.manos.owedAfter, eiriniOwed: calc.eirini.owedAfter, botanicosBalance: 0 });

      toast({ title: 'Το κλείσιμο ολοκληρώθηκε' });
      const [e2, s2] = await Promise.all([listAllEntries(), getSettings()]);
      setEntries(e2); setSettings(s2);
      setEntered('');
    } catch (err) {
      toast({ title: 'Σφάλμα κλεισίματος', description: String(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (!settings || !calc) return <div className="py-10 text-center text-stone-400">Φόρτωση...</div>;

  return (
    <div>
      <PageHeader title="Κλείσιμο μήνα" subtitle="Διακανονισμός ατόμων με τον ακριβή τύπο" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-stone-200">
          <CardHeader><CardTitle className="text-base">Είσοδος</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Πραγματικό μετρημένο υπόλοιπο (€)</Label>
              <Input type="number" step="0.01" value={entered} onChange={(e) => setEntered(e.target.value)} placeholder="0.00" />
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
            <Row label="Προσθήκη (refill = στόχος − υπόλοιπο)" value={fmt(calc.refillAmount)} strong />
            <Row label="Μερίδιο ανά άτομο" value={fmt(calc.shareEach)} strong />
            {botanicosBal !== 0 && (
              <div className="text-xs text-stone-400">Διακανονισμός Βοτανικού {fmt(botanicosBal)} · υπόλοιπο μετά μεταφορά: {fmt(effectiveBalance)}</div>
            )}
            <div className="pt-3 border-t border-stone-100 space-y-3">
              <PersonResult name="Μάνος" r={calc.manos} />
              <PersonResult name="Ειρήνη" r={calc.eirini} />
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
            <DialogTitle>Διακανονισμός Βοτανικού</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-stone-700">
            <p>{botanicosBal > 0 ? `Το Ταμείο χρωστάει ${fmt(botanicosBal)} στον Βοτανικό.` : botanicosBal < 0 ? `Ο Βοτανικός χρωστάει ${fmt(-botanicosBal)} στο Ταμείο.` : 'Δεν υπάρχει υπόλοιπο Βοτανικού.'}</p>
            <p>Κάντε την τραπεζική μεταφορά και μετά πατήστε επιβεβαίωση.</p>
            <div className="bg-stone-50 rounded-lg p-3">
              <div className="text-xs text-stone-500 mb-1">Νέο πραγματικό μετρημένο υπόλοιπο (μετά τη μεταφορά)</div>
              <div className="text-lg font-semibold tabular-nums text-stone-900">{fmt(effectiveBalance)}</div>
            </div>
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

function PersonResult({ name, r }) {
  const after = owedInfo(name, r.owedAfter);
  return (
    <div className="bg-stone-50 rounded-lg p-3">
      <div className="font-medium text-stone-800 mb-1.5">{name}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-stone-500">
        <span>Offset</span><span className="text-right tabular-nums text-stone-700">{fmt(r.offset)}</span>
        <span>Συνεισφορά μετρητά</span><span className="text-right tabular-nums text-stone-700">{fmt(r.contribution)}</span>
        <span>{after.label} (μετά)</span><span className={`text-right tabular-nums font-semibold ${after.colorClass}`}>{fmt(after.amount)}</span>
      </div>
    </div>
  );
}