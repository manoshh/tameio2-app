import React from 'react';
import { Menu } from 'lucide-react';

export default function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-stone-900">{title}</h1>
        {subtitle && <p className="text-stone-500 mt-1 text-sm">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function MobileMenuButton({ onClick }) {
  return (
    <button className="lg:hidden mb-4 text-stone-600" onClick={onClick}>
      <Menu size={24} />
    </button>
  );
}