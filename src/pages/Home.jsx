import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Leaf, CalendarCheck, Target } from 'lucide-react';
import { listAllEntries, listSettlements, getSettings, fmt, fmtDate } from '@/lib/api';
import { sumActive } from '@/lib/finance';
import PageHeader from '@/components/PageHeader';

export default function Home() {
  const [entries, setEntries] = useState([]);
  const [settings, setSettings] = useState(null);
  const [settlements, setSettlements] = useState([]);

  useEffect(() => {
    (async () => {
      const [e, s, st] = await Promise.all([listAllEntries(), getSettings(), listSettlements()]);
      setEntries(e); setSettings(s); setSettlements(st);
    })();
  }, []);

  const manos = sumActive(entries, (e) => e.person === 'manos');
  const eirini = sumActive(entries, (e) => e.person === 'eirini');
  const botanicos = sumActive(entries, (e) => e.module === 'botanicos');
  const recent = entries.slice(0, 6);

  return (
    <div>
      <PageHeader title="Κοινό Ταμείο" subtitle="Μάνος & Ειρήνη — στόχος & διακανονισμός" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat icon={Users} label="Χρωστάει το ταμείο ↔ Μάνος" negativeLabel="Χρωστάει ο Μάνος στο ταμείο" value={manos} />
        <Stat icon={Users} label="Χρωστάει το ταμείο ↔ Ειρήνη" negativeLabel="Χρωστάει η Ειρήνη στο ταμείο" value={eirini} />
        <Stat icon={Leaf} label="Χρωστάει το ταμείο ↔ Βοτανικός" negativeLabel="Χρωστάει ο Βοτανικός στο ταμείο" value={botanicos} />
        <Stat icon={Target} label="Στόχος-απόθεμα" value={settings?.targetReserve || 0} muted />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-stone-200">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Πρόσφατες εγγραφές</h3>
              <Link to="/ledger/person" className="text-sm text-emerald-700 hover:underline">Όλες</Link>
            </div>
            {recent.length === 0 ? (
              <p className="text-sm text-stone-400 py-6 text-center">Καμία εγγραφή ακόμη.</p>
            ) : (
              <div className="space-y-2">
                {recent.map((e) => (
                  <div key={e.id} className="flex justify-between text-sm py-1.5 border-b border-stone-100 last:border-0">
                    <span className="text-stone-600 truncate">{e.description || '—'} · {fmtDate(e.date)}</span>
                    <span className={`tabular-nums font-medium ${e.amount >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{fmt(e.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-stone-200">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Τελευταία κλεισίματα</h3>
              <Link to="/settlements" className="text-sm text-emerald-700 hover:underline">Ιστορικό</Link>
            </div>
            {settlements.length === 0 ? (
              <p className="text-sm text-stone-400 py-6 text-center">Κανένα κλείσιμο ακόμη.</p>
            ) : (
              <div className="space-y-2">
                {settlements.slice(0, 4).map((s) => (
                  <div key={s.id} className="flex justify-between text-sm py-1.5 border-b border-stone-100 last:border-0">
                    <span className="text-stone-600">{s.month}/{s.year}</span>
                    <span className="tabular-nums text-stone-500">νέο υπόλοιπο {fmt(s.enteredBalance)}</span>
                  </div>
                ))}
              </div>
            )}
            <Link to="/monthly-close" className="mt-4 inline-flex items-center gap-2 text-sm text-emerald-700 hover:underline">
              <CalendarCheck size={16} /> Νέο κλείσιμο μήνα
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, negativeLabel, value, muted }) {
  const negative = !muted && value < 0;
  const positive = !muted && value > 0;
  return (
    <Card className="border-stone-200">
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 text-stone-400 mb-1">
          <Icon size={15} />
          <span className="text-xs">{negative ? negativeLabel : label}</span>
        </div>
        <div className={`text-xl font-semibold tabular-nums ${muted ? 'text-stone-700' : negative ? 'text-rose-600' : positive ? 'text-emerald-700' : 'text-stone-900'}`}>{fmt(negative ? -value : value)}</div>
      </CardContent>
    </Card>
  );
}