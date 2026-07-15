import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <Sidebar open={open} onOpenChange={setOpen} pathname={location.pathname} />
      <div className="lg:pl-64">
        <main className="px-5 py-6 lg:px-10 lg:py-8 max-w-6xl mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}