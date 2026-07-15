import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

import { listSettlements, listAllEntries, getSettings, fmt, monthLabel } from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Undo2 } from 'lucide-react';
import { db } from '@/api/client';

export default function Settlements() {
  const { toast } = useToast();
  const [settlements, setSettlements] = useState([]);
  const [busy, setBusy] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);

  const load = async () => {
    const s = await listSettlements();
    setSettlements(s);
  };
  useEffect(() => { load(); }, []);

  const undoLatest = async () => {
    setUndoOpen(false);
    setBusy(true);
    try {
      const [all, st, settings] = await Promise.all([listAllEntries(), listSettlements(), getSettings()]);
      const latest = st[0];
      if (!latest) throw new Error('no settlement');

      await db.entities.LedgerEntry.deleteMany({ carryOverSettlementId: latest.id });
      const archived = all.filter((e) => e.settlementId === latest.id);
      if (archived.length) await db.entities.LedgerEntry.bulkUpdate(archived.map((e) => ({ id: e.id, settlementId: '' })));
      await db.entities.Settings.update(settings.id, { manosOwed: latest.manosOwedBefore, eiriniOwed: latest.eiriniOwedBefore });
      await db.entities.Settlement.delete(latest.id);

      toast({ title: 'Το κλείσιμο αναιρέθηκε' });
      await load();
    } catch (err) {
      toast({ title: 'Σφάλμα αναίρεσης', description: String(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Κλεισίματα μήνα"
        subtitle="Ιστορικό με αναίρεση του πιο πρόσφατου"
        action={settlements.length > 0 && (
          <Button variant="outline" className="text-emerald-700 border-emerald-200 hover:bg-emerald-50" disabled={busy} onClick={() => setUndoOpen(true)}>
            <Undo2 size={16} className="mr-1" /> Αναίρεση τελευταίου
          </Button>
        )}
      />
      {settlements.length === 0 ? (
        <Card className="border-stone-200"><CardContent className="py-10 text-center text-stone-400 text-sm">Δεν υπάρχουν κλεισίματα.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {settlements.map((s, i) => (
            <Card key={s.id} className={`border-stone-200 ${i === 0 ? 'ring-1 ring-emerald-200' : ''}`}>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold text-stone-900">{monthLabel(s.month, s.year)}</div>
                  {i === 0 && <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">πρόσφατο</span>}
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                  <Field label="Πραγματικό υπόλοιπο" value={fmt(s.enteredBalance)} />
                  <Field label="Στόχος" value={fmt(s.targetReserve)} />
                  <Field label="Προσθήκη" value={fmt(s.refillAmount)} />
                  <Field label="Μερίδιο/άτομο" value={fmt(s.shareEach)} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">
                  <PersonBlock name="Μάνος" before={s.manosOwedBefore} after={s.manosOwedAfter} offset={s.manosOffset} contribution={s.manosContribution} />
                  <PersonBlock name="Ειρήνη" before={s.eiriniOwedBefore} after={s.eiriniOwedAfter} offset={s.eiriniOffset} contribution={s.eiriniContribution} />
                </div>
                <div className="text-xs text-stone-400 mt-3">Βοτανικός (πριν): {fmt(s.botanicosBalanceBefore)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={undoOpen}
        onOpenChange={setUndoOpen}
        title="Αναίρεση τελευταίου κλεισίματος;"
        description="Οι εγγραφές carry-over θα διαγραφούν, οι αρχειοθετημένες θα επανέλθουν ως ενεργές και τα υπόλοιπα θα επαναφερθούν."
        confirmText="Αναίρεση"
        destructive
        onConfirm={undoLatest}
      />
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-xs text-stone-400">{label}</div>
      <div className="tabular-nums font-medium text-stone-800">{value}</div>
    </div>
  );
}

function PersonBlock({ name, before, after, offset, contribution }) {
  return (
    <div className="bg-stone-50 rounded-lg p-3">
      <div className="font-medium text-stone-800 mb-2 text-sm">{name}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-stone-500">
        <span>Πριν</span><span className="text-right tabular-nums text-stone-700">{fmt(before)}</span>
        <span>Offset</span><span className="text-right tabular-nums text-stone-700">{fmt(offset)}</span>
        <span>Συνεισφορά</span><span className="text-right tabular-nums text-stone-700">{fmt(contribution)}</span>
        <span>Μετά</span><span className="text-right tabular-nums font-semibold text-stone-900">{fmt(after)}</span>
      </div>
    </div>
  );
}