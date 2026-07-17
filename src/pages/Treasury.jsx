import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { listAllEntries, getSettings, fmt } from '@/lib/api';
import { sumActive } from '@shared/finance';
import { owedInfo } from '@/lib/labels';
import { db, settlements as settlementsApi } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import EntryForm from '@/components/ledger/EntryForm';
import EntryList from '@/components/ledger/EntryList';
import ConfirmDialog from '@/components/ConfirmDialog';
import { RotateCcw, Archive } from 'lucide-react';

const PARTIES = ['manos', 'eirini', 'botanicos'];

export default function Treasury() {
  const { toast } = useToast();
  const [entries, setEntries] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState('manos');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [zeroOpen, setZeroOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [ents, st] = await Promise.all([listAllEntries(), getSettings()]);
    setEntries(ents);
    setSettings(st);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const balances = {
    manos: sumActive(entries, (e) => e.person === 'manos' && e.module === 'person'),
    eirini: sumActive(entries, (e) => e.person === 'eirini' && e.module === 'person'),
    botanicos: sumActive(entries, (e) => e.module === 'botanicos'),
  };

  const isPerson = selected !== 'botanicos';
  const visibleEntries = entries.filter((e) =>
    !e.settlementId && (isPerson ? (e.module === 'person' && e.person === selected) : e.module === 'botanicos')
  );

  const addEntry = async (data) => {
    await db.entities.LedgerEntry.create({ ...data, settlementId: '', carryOverSettlementId: '' });
    toast({ title: 'Η εγγραφή προστέθηκε' });
    await load();
  };

  const confirmDelete = async () => {
    const entry = pendingDelete;
    setPendingDelete(null);
    if (!entry || entry.settlementId) return;
    await db.entities.LedgerEntry.delete(entry.id);
    toast({ title: 'Η εγγραφή διαγράφηκε' });
    await load();
  };

  const zeroOut = async () => {
    setZeroOpen(false);
    const where = isPerson
      ? { module: 'person', person: selected, settlementId: '' }
      : { module: 'botanicos', settlementId: '' };
    await db.entities.LedgerEntry.deleteMany(where);
    toast({ title: 'Οι εγγραφές διαγράφηκαν' });
    await load();
  };

  const settleBotanicos = async () => {
    setSettleOpen(false);
    setBusy(true);
    try {
      await settlementsApi.botanicosSettle();
      toast({ title: 'Ο διακανονισμός Βοτανικού ολοκληρώθηκε' });
      await load();
    } catch (err) {
      toast({ title: 'Σφάλμα', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (loading || !settings) return <div className="py-10 text-center text-stone-400 text-sm">Φόρτωση...</div>;

  const selectedName = owedInfo(selected, 0).party.name;

  return (
    <div>
      <PageHeader title="Ταμείο" subtitle="Υπόλοιπα, εγγραφές και διακανονισμός Βοτανικού" />

      {/* 4 κάρτες: 2×2 σε mobile, 4 σε σειρά σε desktop. Οι τρεις πρώτες
          επιλέγονται — η επιλεγμένη ορίζει τι φαίνεται από κάτω. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
        {PARTIES.map((key) => (
          <SelectableCard
            key={key}
            party={key}
            value={balances[key]}
            active={selected === key}
            onSelect={() => setSelected(key)}
          />
        ))}
        <Card className="border-stone-200">
          <CardContent className="pt-5">
            <div className="text-xs text-stone-500 mb-1">Στόχος-απόθεμα</div>
            <div className="text-2xl font-semibold tabular-nums text-stone-700">{fmt(settings.targetReserve)}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Νέα εγγραφή — {selectedName}</CardTitle></CardHeader>
        <CardContent>
          <EntryForm
            key={selected}
            module={isPerson ? 'person' : 'botanicos'}
            person={isPerson ? selected : undefined}
            onAdd={addEntry}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Ενεργές εγγραφές — {selectedName} ({visibleEntries.length})</CardTitle>
          <div className="flex gap-2">
            {!isPerson && balances.botanicos !== 0 && (
              <Button variant="outline" size="sm" className="text-emerald-700 border-emerald-200 hover:bg-emerald-50" disabled={busy} onClick={() => setSettleOpen(true)}>
                <Archive size={14} className="mr-1" /> Διακανονισμός
              </Button>
            )}
            {visibleEntries.length > 0 && (
              <Button variant="outline" size="sm" className="text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => setZeroOpen(true)}>
                <RotateCcw size={14} className="mr-1" /> Μηδενισμός
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <EntryList entries={visibleEntries} showPerson={isPerson} onDelete={setPendingDelete} />
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
        title={`Μηδενισμός — ${selectedName};`}
        description="Θα διαγραφούν όλες οι ενεργές εγγραφές αυτού του υπολοίπου."
        confirmText="Μηδενισμός"
        destructive
        onConfirm={zeroOut}
      />
      <ConfirmDialog
        open={settleOpen}
        onOpenChange={setSettleOpen}
        title="Διακανονισμός Βοτανικού;"
        description="Όλες οι ενεργές εγγραφές Βοτανικού θα αρχειοθετηθούν και το υπόλοιπο θα μηδενιστεί."
        confirmText="Διακανονισμός"
        onConfirm={settleBotanicos}
      />
    </div>
  );
}

function SelectableCard({ party, value, active, onSelect }) {
  const info = owedInfo(party, value);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`text-left rounded-xl p-4 border transition-all ${info.party.card} ${
        active ? `ring-2 ring-offset-1 ${info.party.ring}` : 'opacity-80 hover:opacity-100'
      }`}
    >
      <div className={`text-xs mb-1 leading-tight ${info.party.accent}`}>{info.label}</div>
      <div className={`text-xl lg:text-2xl font-semibold tabular-nums ${info.colorClass}`}>{fmt(info.amount)}</div>
    </button>
  );
}
