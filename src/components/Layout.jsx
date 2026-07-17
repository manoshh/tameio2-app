import React, { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Wallet, Settings as SettingsIcon } from 'lucide-react';
import SettingsModal from './SettingsModal';

const TABS = [
  { to: '/', label: 'Ταμείο' },
  { to: '/close', label: 'Κλείσιμο' },
];

export default function Layout() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-5xl mx-auto px-5 lg:px-6 py-6 lg:py-8">
        {/* Η πλοήγηση κάθεται μέσα στο περιεχόμενο, ευθυγραμμισμένη με τις
            κάρτες — όχι σε μπάρα πλήρους πλάτους στην κορυφή. */}
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-stone-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-emerald-700 flex items-center justify-center">
              <Wallet className="text-white" size={15} />
            </div>
            <span className="font-semibold tracking-tight text-sm hidden sm:inline">Κοινό Ταμείο</span>
          </div>

          <nav className="flex items-center gap-1 ml-1">
            {TABS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? 'bg-emerald-700 text-white' : 'text-stone-600 hover:bg-stone-100'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="flex-1" />

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Ρυθμίσεις"
            className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800 transition-colors"
          >
            <SettingsIcon size={19} />
          </button>
        </div>

        <Outlet />
      </div>

      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
