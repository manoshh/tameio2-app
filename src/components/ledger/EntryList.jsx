import React from 'react';
import { Trash2 } from 'lucide-react';
import { fmt, fmtDate } from '@/lib/api';
import { Badge } from '@/components/ui/badge';

export default function EntryList({ entries, showPerson, onDelete }) {
  if (entries.length === 0) {
    return <div className="text-center py-10 text-stone-400 text-sm">Δεν υπάρχουν ενεργές εγγραφές.</div>;
  }
  return (
    <div className="divide-y divide-stone-100">
      {entries.map((e) => {
        const positive = e.amount >= 0;
        return (
          <div key={e.id} className="flex items-center gap-3 py-3">
            <div className={`w-2 h-10 rounded-full ${positive ? 'bg-emerald-500' : 'bg-rose-400'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-stone-800 truncate">{e.description || 'Χωρίς περιγραφή'}</span>
                {showPerson && (
                  <Badge variant="outline" className="text-xs">{e.person === 'manos' ? 'Μάνος' : 'Ειρήνη'}</Badge>
                )}
                {e.carryOverSettlementId && (
                  <Badge className="text-xs bg-amber-100 text-amber-800 hover:bg-amber-100">carry-over</Badge>
                )}
              </div>
              <div className="text-xs text-stone-400">{fmtDate(e.date)}</div>
            </div>
            <div className={`font-semibold tabular-nums ${positive ? 'text-emerald-700' : 'text-rose-600'}`}>
              {positive ? '+' : ''}{fmt(e.amount)}
            </div>
            <button onClick={() => onDelete(e)} className="text-stone-300 hover:text-rose-500 transition-colors p-1">
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}