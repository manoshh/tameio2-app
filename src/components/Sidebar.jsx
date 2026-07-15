import React from 'react';
import { Link } from 'react-router-dom';
import { Wallet, Users, Leaf, CalendarCheck, History, Archive, Settings as SettingsIcon, LogOut, X } from 'lucide-react';
import { usePasswordAuth } from '@/lib/passwordAuth';

const NAV = [
  { to: '/', label: 'Ταμείο', icon: Wallet },
  { to: '/ledger/person', label: 'Άτομα', icon: Users },
  { to: '/ledger/botanicos', label: 'Βοτανικός', icon: Leaf },
  { to: '/monthly-close', label: 'Κλείσιμο μήνα', icon: CalendarCheck },
  { to: '/settlements', label: 'Κλεισίματα', icon: History },
  { to: '/botanicos-settlements', label: 'Διακανονισμοί', icon: Archive },
  { to: '/settings', label: 'Ρυθμίσεις', icon: SettingsIcon },
];

export default function Sidebar({ open, onOpenChange, pathname }) {
  const { logout } = usePasswordAuth();

  const content = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 h-16 border-b border-stone-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-700 flex items-center justify-center">
            <Wallet className="text-white" size={18} />
          </div>
          <span className="font-semibold tracking-tight">Κοινό Ταμείο</span>
        </div>
        <button className="lg:hidden text-stone-400" onClick={() => onOpenChange(false)}>
          <X size={20} />
        </button>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              onClick={() => onOpenChange(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active ? 'bg-emerald-700 text-white' : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-4 border-t border-stone-200">
        <button onClick={logout} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-stone-600 hover:bg-stone-100 w-full">
          <LogOut size={18} /> Έξοδος
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:flex lg:flex-col fixed inset-y-0 left-0 w-64 bg-white border-r border-stone-200 z-30">
        {content}
      </aside>
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-stone-900/40" onClick={() => onOpenChange(false)} />
          <div className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">{content}</div>
        </div>
      )}
    </>
  );
}