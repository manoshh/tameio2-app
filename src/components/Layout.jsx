import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import SettingsModal from './SettingsModal';

export default function Layout() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-5xl mx-auto px-5 lg:px-6 py-6 lg:py-8">
        {/* Χωρίς λογότυπο/μπάρα πλοήγησης: η πλοήγηση γίνεται μέσα από τις
            κάρτες των οθονών (Ταμείο ⇄ Κλείσιμο). Το γρανάζι εμφανίζεται μέσα
            στο PageHeader κάθε σελίδας, συνευθειακά με τον τίτλο. */}
        <Outlet context={{ openSettings: () => setSettingsOpen(true) }} />
      </div>

      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
