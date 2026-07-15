import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

import { listBotanicosSettlements, listAllEntries, getSettings, fmt, monthLabel, fmtDate } from '@/lib/api';
import { sumActive } from '@/lib/finance';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Archive, Undo2 } from 'lucide-react';
import { db } from '@/api/client';

export default function BotanicosSettlements() {
  const { toast } = useToast();
  const [settlements, setSettlements] = useState([]);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [busy, setBusy] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);

  const load = async () => {
    const [s, entries] = await Promise.all([listBotanicosSettlements(), listAllEntries()]);
    setSettlements(s);
    setCurrentBalance(sumActive(entries, (e) => e.module === 'botanicos'));
  };
  useEffect(() => { load(); }, []);

  const settle = async () => {
    setSettleOpen(false);
    setBusy(true);
    try {
      const [entries, settings] = await Promise.all([listAllEntries(), getSettings()]);
      const balanceBefore = sumActive(entries, (e) => e.module === 'botanicos');
      const active = entries.filter((e) => e.module === 'botanicos' && !e.settlementId);
      const now = new Date();
      const bs = await db.entities.BotanicosSettlement.create({
        month: now.getMonth() + 1, year: now.getFullYear(), balanceBefore, timestamp: now.toISOString(),
      });
      if (active.length) await db.entities.LedgerEntry.bulkUpdate(active.map((e) => ({ id: e.id, settlementId: bs.id })));
      await db.entities.Settings.update(settings.id, { botanicosBalance: 0 });
      toast({ title: 'Ο διακανονισμός Βοτανικού ολοκληρώθηκε' });
      await load();
    } catch (err) {
      toast({ title: 'Σφάλμα', description: String(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const undoLatest = async () => {
    setUndoOpen(false);
    setBusy(true);
    try {
      const [all, list, settings] = await Promise.all([listAllEntries(), listBotanicosSettlements(), getSettings()]);
      const latest = list[0];
      if (!latest) throw new Error('no settlement');
      const archived = all.filter((e) => e.settlementId === latest.id);
      if (archived.length) await db.entities.LedgerEntry.bulkUpdate(archived.map((e) => ({ id: e.id, settlementId: '' })));
      await db.entities.Settings.update(settings.id, { botanicosBalance: latest.balanceBefore });
      await db.entities.BotanicosSettlement.delete(latest.id);
      toast({ title: 'Ο διακανονισμός αναιρέθηκε' });
      await load();
    } catch (err) {
      toast({ title: 'Σφάλμα', description: String(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Διακανονισμός Βοτανικού"
        subtitle="Ξεχωριστός, μη-χρηματικός τύπος κλεισίματος"
        action={
          <Button className="bg-emerald-700 hover:bg-emerald-800" disabled={busy} onClick={() => setSettleOpen(true)}>
            <Archive size={16} className="mr-1" /> Νέος διακανονισμός
          </Button>
        }
      />
      <Card className="border-stone-200 mb-6">
        <CardContent className="pt-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-stone-500">Τρέχον υπόλοιπο Βοτανικού</div>
            <div className="text-2xl font-semibold tabular-nums text-stone-900">{fmt(currentBalance)}</div>
          </div>
          {settlements.length > 0 && (
            <Button variant="outline" className="text-emerald-700 border-emerald-200 hover:bg-emerald-50" disabled={busy} onClick={() => setUndoOpen(true)}>
              <Undo2 size={16} className="mr-1" /> Αναίρεση τελευταίου
            </Button>
          )}
        </CardContent>
      </Card>

      {settlements.length === 0 ? (
        <Card className="border-stone-200"><CardContent className="py-10 text-center text-stone-400 text-sm">Δεν υπάρχουν διακανονισμοί.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {settlements.map((s, i) => (
            <Card key={s.id} className={`border-stone-200 ${i === 0 ? 'ring-1 ring-emerald-200' : ''}`}>
              <CardContent className="pt-5 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-stone-900">{monthLabel(s.month, s.year)}</div>
                  <div className="text-xs text-stone-400 mt-0.5">{fmtDate(s.timestamp)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-stone-500">Υπόλοιπο πριν</div>
                  <div className="text-lg font-semibold tabular-nums text-stone-900">{fmt(s.balanceBefore)}</div>
                </div>
                {i === 0 && <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">πρόσφατο</span>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={settleOpen}
        onOpenChange={setSettleOpen}
        title="Διακανονισμός Βοτανικού;"
        description="Όλες οι ενεργές εγγραφές θα αρχειοθετηθούν και το υπόλοιπο θα μηδενιστεί."
        confirmText="Διακανονισμός"
        onConfirm={settle}
      />
      <ConfirmDialog
        open={undoOpen}
        onOpenChange={setUndoOpen}
        title="Αναίρεση διακανονισμού;"
        description="Οι εγγραφές θα επανέλθουν ως ενεργές και το υπόλοιπο θα επαναφερθεί στο balanceBefore."
        confirmText="Αναίρεση"
        destructive
        onConfirm={undoLatest}
      />
    </div>
  );
}