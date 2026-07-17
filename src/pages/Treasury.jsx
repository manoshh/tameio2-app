import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { listAllEntries, listSettlements, listBotanicosSettlements, getSettings, fmt, fmtDate, monthLabel } from '@/lib/api';
import { sumActive, round2 } from '@shared/finance';
import { owedInfo } from '@/lib/labels';
import { db, settlements as settlementsApi } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import EntryForm from '@/components/ledger/EntryForm';
import EntryList from '@/components/ledger/EntryList';
import ConfirmDialog from '@/components/ConfirmDialog';
import { RotateCcw, Archive, ChevronRight, Undo2 } from 'lucide-react';

const PARTIES = ['manos', 'eirini', 'botanicos'];

export default function Treasury() {
  const { toast } = useToast();
  const [entries, setEntries] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [botanicosSettlements, setBotanicosSettlements] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState('manos');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [zeroOpen, setZeroOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [ents, st, ps, bs] = await Promise.all([
      listAllEntries(), getSettings(), listSettlements(), listBotanicosSettlements(),
    ]);
    setEntries(ents);
    setSettings(st);
    setSettlements(ps);
    setBotanicosSettlements(bs);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const balances = {
    manos: sumActive(entries, (e) => e.person === 'manos' && e.module === 'person'),
    eirini: sumActive(entries, (e) => e.person === 'eirini' && e.module === 'person'),
    botanicos: sumActive(entries, (e) => e.module === 'botanicos'),
  };

  const isPerson = selected !== 'botanicos';
  const selectedName = owedInfo(selected, 0).party.name;

  const visibleEntries = entries.filter((e) =>
    !e.settlementId && (isPerson ? (e.module === 'person' && e.person === selected) : e.module === 'botanicos')
  );

  // Αρχείο του επιλεγμένου: κάθε αρχειοθέτηση με τις εγγραφές που ομαδοποίησε.
  const archiveList = (isPerson ? settlements : botanicosSettlements).map((s) => {
    const grouped = entries.filter((e) =>
      e.settlementId === s.id && (isPerson ? (e.module === 'person' && e.person === selected) : e.module === 'botanicos')
    );
    return { settlement: s, entries: grouped, total: round2(grouped.reduce((sum, e) => sum + (e.amount || 0), 0)) };
  });

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

  const runSettle = async (fn) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (err) {
      toast({ title: 'Σφάλμα', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const settleBotanicos = () => { setSettleOpen(false); runSettle(async () => {
    await settlementsApi.botanicosSettle();
    toast({ title: 'Ο διακανονισμός Βοτανικού ολοκληρώθηκε' });
  }); };

  const undoLatest = () => { setUndoOpen(false); runSettle(async () => {
    if (isPerson) await settlementsApi.undoClose();
    else await settlementsApi.undoBotanicos();
    toast({ title: 'Η αναίρεση ολοκληρώθηκε' });
  }); };

  if (loading || !settings) return <div className="py-10 text-center text-stone-400 text-sm">Φόρτωση...</div>;

  return (
    <div>
      <PageHeader title="Ταμείο" subtitle="Υπόλοιπα, εγγραφές και αρχείο ανά πρόσωπο" />

      {/* 4 κάρτες: 2×2 σε mobile, 4 σε σειρά σε desktop. Οι τρεις πρώτες
          επιλέγονται — η επιλεγμένη ορίζει τι φαίνεται από κάτω. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
        {PARTIES.map((key) => (
          <SelectableCard key={key} party={key} value={balances[key]} active={selected === key} onSelect={() => setSelected(key)} />
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
          <EntryForm key={selected} module={isPerson ? 'person' : 'botanicos'} person={isPerson ? selected : undefined} onAdd={addEntry} />
        </CardContent>
      </Card>

      <Card className="mb-6">
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

      <Card>
        <CardHeader><CardTitle className="text-base">Αρχείο — {selectedName}</CardTitle></CardHeader>
        <CardContent className="py-1">
          {archiveList.length === 0 ? (
            <div className="text-center py-8 text-stone-400 text-sm">Καμία αρχειοθέτηση ακόμη.</div>
          ) : (
            archiveList.map((a, i) => (
              <ArchiveRow
                key={a.settlement.id}
                party={selected}
                a={a}
                recent={i === 0}
                busy={busy}
                onUndo={() => setUndoOpen(true)}
              />
            ))
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Διαγραφή εγγραφής;"
        description="Η επίδραση της εγγραφής στο υπόλοιπο θα αναιρεθεί."
        confirmText="Διαγραφή" destructive onConfirm={confirmDelete}
      />
      <ConfirmDialog
        open={zeroOpen}
        onOpenChange={setZeroOpen}
        title={`Μηδενισμός — ${selectedName};`}
        description="Θα διαγραφούν όλες οι ενεργές εγγραφές αυτού του υπολοίπου."
        confirmText="Μηδενισμός" destructive onConfirm={zeroOut}
      />
      <ConfirmDialog
        open={settleOpen}
        onOpenChange={setSettleOpen}
        title="Διακανονισμός Βοτανικού;"
        description="Οι ενεργές εγγραφές Βοτανικού θα αρχειοθετηθούν σε μία εγγραφή αρχείου και το υπόλοιπο θα μηδενιστεί."
        confirmText="Διακανονισμός" onConfirm={settleBotanicos}
      />
      <ConfirmDialog
        open={undoOpen}
        onOpenChange={setUndoOpen}
        title="Αναίρεση τελευταίας αρχειοθέτησης;"
        description={isPerson
          ? 'Θα αναιρεθεί το τελευταίο κλείσιμο μήνα: οι εγγραφές επανέρχονται ως ενεργές (για Μάνο και Ειρήνη) και τα carry-over διαγράφονται.'
          : 'Οι εγγραφές Βοτανικού θα επανέλθουν ως ενεργές.'}
        confirmText="Αναίρεση" destructive onConfirm={undoLatest}
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

function ArchiveRow({ party, a, recent, busy, onUndo }) {
  const [open, setOpen] = useState(false);
  const { settlement: s, entries: grouped, total } = a;
  const isPerson = party !== 'botanicos';
  const contribution = isPerson ? s[`${party}Contribution`] : undefined;
  const owedAfter = isPerson ? s[`${party}OwedAfter`] : undefined;

  return (
    <div className="border-b border-stone-100 last:border-0">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex-1 flex items-center gap-3 py-3.5 text-left min-w-0">
          <ChevronRight size={16} className={`text-stone-400 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
          <span className="font-medium text-stone-900">{monthLabel(s.month, s.year)}</span>
          {recent && <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">πρόσφατο</span>}
          <span className="flex-1" />
          <span className="text-sm text-stone-500 tabular-nums whitespace-nowrap">{grouped.length} εγγρ. · {fmt(total)}</span>
        </button>
        {recent && (
          <Button variant="ghost" size="sm" className="text-stone-400 hover:text-rose-600 shrink-0" disabled={busy} onClick={onUndo} aria-label="Αναίρεση">
            <Undo2 size={15} />
          </Button>
        )}
      </div>

      {open && (
        <div className="pb-4 pl-7 pr-1 text-sm">
          {grouped.length === 0 ? (
            <div className="text-stone-400 text-xs py-2">Καμία εγγραφή σε αυτή την αρχειοθέτηση.</div>
          ) : (
            <div className="divide-y divide-stone-100">
              {grouped.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-stone-600 truncate">{e.description || 'Χωρίς περιγραφή'}</span>
                  <span className="text-xs text-stone-400 tabular-nums shrink-0">{fmtDate(e.date)}</span>
                  <span className={`tabular-nums shrink-0 ${e.amount >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{fmt(e.amount)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between pt-2 mt-1 border-t border-stone-200 font-medium">
            <span className="text-stone-700">Σύνολο εγγραφών</span>
            <span className="tabular-nums text-stone-900">{fmt(total)}</span>
          </div>
          {isPerson && (
            <div className="mt-2 space-y-1 text-xs text-stone-500">
              <div className="flex justify-between"><span>Κατέθεσε στο κλείσιμο</span><span className="tabular-nums text-stone-700">{fmt(contribution)}</span></div>
              <div className="flex justify-between"><span>Έμεινε (carry-over)</span><span className="tabular-nums text-stone-700">{fmt(owedAfter)}</span></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
