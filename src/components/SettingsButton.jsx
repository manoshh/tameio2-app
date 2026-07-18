import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { Settings as SettingsIcon } from 'lucide-react';

export default function SettingsButton() {
  const { openSettings } = useOutletContext();
  return (
    <button
      type="button"
      onClick={openSettings}
      aria-label="Ρυθμίσεις"
      className="p-2 -mr-2 rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800 transition-colors shrink-0"
    >
      <SettingsIcon size={19} />
    </button>
  );
}
