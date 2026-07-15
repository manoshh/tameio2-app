import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, Wallet } from 'lucide-react';
import Sidebar from './Sidebar';

export default function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Κλείσιμο σε κάθε αλλαγή σελίδας: το συρτάρι δεν πρέπει να μείνει ανοιχτό
  // πάνω από το νέο περιεχόμενο (π.χ. με το back του browser).
  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <Sidebar open={open} onOpenChange={setOpen} pathname={location.pathname} />
      <div className="lg:pl-64">
        {/* Μόνο σε στενή οθόνη — από lg και πάνω το sidebar είναι μόνιμα ορατό.
            Ζει εδώ και όχι στις σελίδες, ώστε καμία να μη μείνει χωρίς μενού. */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-4 bg-white/90 backdrop-blur border-b border-stone-200">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Άνοιγμα μενού"
            aria-expanded={open}
            className="-ml-2 p-2 rounded-lg text-stone-600 hover:bg-stone-100 transition-colors"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-emerald-700 flex items-center justify-center">
              <Wallet className="text-white" size={15} />
            </div>
            <span className="font-semibold tracking-tight text-sm">Κοινό Ταμείο</span>
          </div>
        </header>

        <main className="px-5 py-6 lg:px-10 lg:py-8 max-w-6xl mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
