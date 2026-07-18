import React from 'react';
import { ArrowLeft } from 'lucide-react';

export default function PageHeader({ title, subtitle, action, onBack }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="flex items-start gap-2.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Πίσω"
            className="mt-0.5 -ml-1.5 p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800 transition-colors shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <div>
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-stone-900">{title}</h1>
          {subtitle && <p className="text-stone-500 mt-1 text-sm">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}