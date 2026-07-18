import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Settings as SettingsIcon } from 'lucide-react';
import SettingsModal from './SettingsModal';

export default function Layout() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-5xl mx-auto px-5 lg:px-6 py-6 lg:py-8">
        {/* Χωρίς λογότυπο/μπάρα πλοήγησης: η πλοήγηση γίνεται μέσα από τις
            κάρτες των οθονών (Ταμείο ⇄ Κλείσιμο). Μόνο το γρανάζι μένει εδώ. */}
        <div className="flex justify-end mb-4">
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
