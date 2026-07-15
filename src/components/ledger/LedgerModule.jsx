import React, { useState, useEffect, useCallback } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { listEntries, getSettings, fmt } from '@/lib/api';
import { round2, sumActive } from '@/lib/finance';
import EntryForm from './EntryForm';
import EntryList from './EntryList';
import ConfirmDialog from '@/components/ConfirmDialog';
import { RotateCcw } from 'lucide-react';
import { db } from '@/api/client';

export default function LedgerModule({ module }) {
  const { toast } = useToast();
  const [entries, setEntries] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [zeroOpen, setZeroOpen] = useState(false);

  const isPerson = module === 'person';

  const load = useCallback(async () => {
    setLoading(true);
    const [ents, st] = await Promise.all([listEntries(module), getSettings()]);
    setEntries(ents);
    setSettings(st);
    setLoading(false);
  }, [module]);

  useEffect(() => { load(); }, [load]);

  const manosOwed = sumActive(entries, (e) => e.person === 'manos');
  const eiriniOwed = sumActive(entries, (e) => e.person === 'eirini');
  const botanicosBal = sumActive(entries, () => true);
  const active = entries.filter((e) => !e.settlementId);

  const addEntry = async (data) => {
    await db.entities.LedgerEntry.create({ ...data, settlementId: '', carryOverSettlementId: '' });
    if (isPerson) {
      const field = data.person === 'manos' ? 'manosOwed' : 'eiriniOwed';
      await db.entities.Settings.update(settings.id, { [field]: round2((settings[field] || 0) + data.amount) });
    } else {
      await db.entities.Settings.update(settings.id, { botanicosBalance: round2((settings.botanicosBalance || 0) + data.amount) });
    }
    toast({ title: 'Η εγγραφή προστέθηκε' });
    await load();
  };

  const confirmDelete = async () => {
    const entry = pendingDelete;
    setPendingDelete(null);
    if (!entry || entry.settlementId) return;
    if (isPerson) {
      const field = entry.person === 'manos' ? 'manosOwed' : 'eiriniOwed';
      await db.entities.Settings.update(settings.id, { [field]: round2((settings[field] || 0) - entry.amount) });
    } else {
      await db.entities.Settings.update(settings.id, { botanicosBalance: round2((settings.botanicosBalance || 0) - entry.amount) });
    }
    await db.entities.LedgerEntry.delete(entry.id);
    toast({ title: 'Η εγγραφή διαγράφηκε' });
    await load();
  };

  const zeroOut = async () => {
    setZeroOpen(false);
    await db.entities.LedgerEntry.deleteMany({ module, settlementId: '' });
    if (isPerson) {
      await db.entities.Settings.update(settings.id, { manosOwed: 0, eiriniOwed: 0 });
    } else {
      await db.entities.Settings.update(settings.id, { botanicosBalance: 0 });
    }
    toast({ title: 'Το υπόλοιπο μηδενίστηκε' });
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {isPerson ? (
          <>
            <BalanceCard label="Χρωστάει το ταμείο ↔ Μάνος" negativeLabel="Χρωστάει ο Μάνος στο ταμείο" value={manosOwed} />
            <BalanceCard label="Χρωστάει το ταμείο ↔ Ειρήνη" negativeLabel="Χρωστάει η Ειρήνη στο ταμείο" value={eiriniOwed} />
            <BalanceCard label="Στόχος-απόθεμα" value={settings?.targetReserve || 0} muted />
          </>
        ) : (
          <>
            <BalanceCard label="Χρωστάει το ταμείο ↔ Βοτανικός" negativeLabel="Χρωστάει ο Βοτανικός στο ταμείο" value={botanicosBal} />
            <BalanceCard label="Στόχος-απόθεμα" value={settings?.targetReserve || 0} muted />
          </>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Νέα εγγραφή</CardTitle></CardHeader>
        <CardContent><EntryForm module={module} onAdd={addEntry} /></CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Ενεργές εγγραφές ({active.length})</CardTitle>
          <Button variant="outline" size="sm" className="text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => setZeroOpen(true)}>
            <RotateCcw size={14} className="mr-1" /> Μηδενισμός
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? <div className="py-10 text-center text-stone-400 text-sm">Φόρτωση...</div> : <EntryList entries={active} showPerson={isPerson} onDelete={setPendingDelete} />}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Διαγραφή εγγραφής;"
        description="Η επίδραση της εγγραφής στο υπόλοιπο θα αναιρεθεί."
        confirmText="Διαγραφή"
        destructive
        onConfirm={confirmDelete}
      />
      <ConfirmDialog
        open={zeroOpen}
        onOpenChange={setZeroOpen}
        title="Μηδενισμός υπολοίπου;"
        description="Θα διαγραφούν όλες οι ενεργές εγγραφές και το υπόλοιπο θα μηδενιστεί."
        confirmText="Μηδενισμός"
        destructive
        onConfirm={zeroOut}
      />
    </div>
  );
}

function BalanceCard({ label, negativeLabel, value, muted }) {
  const negative = !muted && value < 0;
  const positive = !muted && value > 0;
  const shown = negative ? -value : value;
  return (
    <Card className="border-stone-200">
      <CardContent className="pt-5">
        <div className="text-xs text-stone-500 mb-1">{negative ? negativeLabel : label}</div>
        <div className={`text-2xl font-semibold tabular-nums ${muted ? 'text-stone-700' : negative ? 'text-rose-600' : positive ? 'text-emerald-700' : 'text-stone-700'}`}>
          {fmt(shown)}
        </div>
      </CardContent>
    </Card>
  );
}