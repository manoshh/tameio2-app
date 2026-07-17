import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ChevronRight, Undo2 } from 'lucide-react';

import { listSettlements, listBotanicosSettlements, fmt, fmtDate, monthLabel } from '@/lib/api';
import { owedInfo } from '@/lib/labels';
import { settlements as settlementsApi } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import MonthlyClose from '@/pages/MonthlyClose';

export default function Close() {
  const { toast } = useToast();
  const [personList, setPersonList] = useState([]);
  const [botanicosList, setBotanicosList] = useState([]);
  const [undo, setUndo] = useState(null); // 'person' | 'botanicos' | null
  const [busy, setBusy] = useState(false);

  const loadHistory = useCallback(async () => {
    const [p, b] = await Promise.all([listSettlements(), listBotanicosSettlements()]);
    setPersonList(p);
    setBotanicosList(b);
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const doUndo = async () => {
    const kind = undo;
    setUndo(null);
    setBusy(true);
    try {
      if (kind === 'person') await settlementsApi.undoClose();
      else await settlementsApi.undoBotanicos();
      toast({ title: 'Η αναίρεση ολοκληρώθηκε' });
      await loadHistory();
    } catch (err) {
      toast({ title: 'Σφάλμα αναίρεσης', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <PageHeader title="Κλείσιμο μήνα" subtitle="Μέτρα το κουτί — η εφαρμογή βγάζει τι βάζει ο καθένας" />
        <MonthlyClose onClosed={loadHistory} />
      </div>

      <HistorySection
        title="Κλεισίματα μήνα"
        items={personList}
        emptyText="Δεν υπάρχουν κλεισίματα."
        canUndo={personList.length > 0}
        busy={busy}
        onUndo={() => setUndo('person')}
        renderSummary={(s) => `νέο υπόλοιπο ${fmt(s.enteredBalance)}`}
        renderDetail={(s) => <PersonDetail s={s} />}
      />

      <HistorySection
        title="Διακανονισμοί Βοτανικού"
        items={botanicosList}
        emptyText="Δεν υπάρχουν διακανονισμοί."
        canUndo={botanicosList.length > 0}
        busy={busy}
        onUndo={() => setUndo('botanicos')}
        renderSummary={(s) => `υπόλοιπο πριν ${fmt(s.balanceBefore)}`}
        renderDetail={(s) => (
          <div className="flex justify-between">
            <span className="text-stone-500">Ημερομηνία</span>
            <span className="tabular-nums text-stone-700">{fmtDate(s.timestamp)}</span>
          </div>
        )}
      />

      <ConfirmDialog
        open={!!undo}
        onOpenChange={(o) => !o && setUndo(null)}
        title="Αναίρεση τελευταίου;"
        description="Οι εγγραφές θα επανέλθουν ως ενεργές και τα υπόλοιπα θα επαναφερθούν."
        confirmText="Αναίρεση"
        destructive
        onConfirm={doUndo}
      />
    </div>
  );
}

function HistorySection({ title, items, emptyText, canUndo, busy, onUndo, renderSummary, renderDetail }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
        {canUndo && (
          <Button variant="outline" size="sm" className="text-emerald-700 border-emerald-200 hover:bg-emerald-50" disabled={busy} onClick={onUndo}>
            <Undo2 size={16} className="mr-1" /> Αναίρεση τελευταίου
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <Card className="border-stone-200"><CardContent className="py-8 text-center text-stone-400 text-sm">{emptyText}</CardContent></Card>
      ) : (
        <Card className="border-stone-200">
          <CardContent className="py-1">
            {items.map((s, i) => (
              <HistoryRow
                key={s.id}
                recent={i === 0}
                title={monthLabel(s.month, s.year)}
                summary={renderSummary(s)}
                detail={renderDetail(s)}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function HistoryRow({ recent, title, summary, detail }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-stone-100 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 py-3.5 text-left"
      >
        <ChevronRight size={16} className={`text-stone-400 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="font-medium text-stone-900">{title}</span>
        {recent && <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">πρόσφατο</span>}
        <span className="flex-1" />
        <span className="text-sm text-stone-500 tabular-nums">{summary}</span>
      </button>
      {open && (
        <div className="pb-4 pl-7 pr-1 text-sm space-y-1.5">{detail}</div>
      )}
    </div>
  );
}

function PersonDetail({ s }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="text-xs text-stone-500 space-y-1 lg:col-span-2">
        <Line label="Μετρημένο · στόχος" value={`${fmt(s.enteredBalance)} · ${fmt(s.targetReserve)}`} />
        <Line label="Λείπουν · μερίδιο" value={`${fmt(s.refillAmount)} · ${fmt(s.shareEach)}`} />
        <Line label="Βοτανικός (πριν)" value={fmt(s.botanicosBalanceBefore)} />
      </div>
      <PersonBox party="manos" before={s.manosOwedBefore} after={s.manosOwedAfter} contribution={s.manosContribution} />
      <PersonBox party="eirini" before={s.eiriniOwedBefore} after={s.eiriniOwedAfter} contribution={s.eiriniContribution} />
    </div>
  );
}

function PersonBox({ party, before, after, contribution }) {
  const info = owedInfo(party, after);
  return (
    <div className={`rounded-lg border p-3 ${info.party.card}`}>
      <div className="font-medium text-stone-800 mb-1.5 text-sm">{info.party.name}</div>
      <div className="text-xs text-stone-600 space-y-1">
        <Line label="Πριν" value={fmt(before)} />
        <Line label="Κατέθεσε" value={fmt(contribution)} />
        <Line label={info.label} value={fmt(info.amount)} strong />
      </div>
    </div>
  );
}

function Line({ label, value, strong }) {
  return (
    <div className="flex justify-between">
      <span className="text-stone-500">{label}</span>
      <span className={`tabular-nums ${strong ? 'font-semibold text-stone-900' : 'text-stone-700'}`}>{value}</span>
    </div>
  );
}
