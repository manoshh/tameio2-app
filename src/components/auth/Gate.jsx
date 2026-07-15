import React from 'react';
import { Outlet } from 'react-router-dom';
import { usePasswordAuth } from '@/lib/passwordAuth';
import GateLogin from './GateLogin';
import GateSetup from './GateSetup';

export default function Gate() {
  const { authed, loading, initialized } = usePasswordAuth();

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-stone-50">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-emerald-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (!initialized) return <GateSetup />;
  if (!authed) return <GateLogin />;
  return <Outlet />;
}