import React from 'react';
import LedgerModule from '@/components/ledger/LedgerModule';
import PageHeader from '@/components/PageHeader';

export default function BotanicosLedger() {
  return (
    <div>
      <PageHeader title="Ταμείο Βοτανικού" subtitle="Ενιαίο υπόλοιπο, ξεχωριστός διακανονισμός" />
      <LedgerModule module="botanicos" />
    </div>
  );
}