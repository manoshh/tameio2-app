import React from 'react';
import LedgerModule from '@/components/ledger/LedgerModule';
import PageHeader from '@/components/PageHeader';

export default function PersonLedger() {
  return (
    <div>
      <PageHeader title="Ταμείο Ατόμων" subtitle="Κοινές εγγραφές Μάνου & Ειρήνης" />
      <LedgerModule module="person" />
    </div>
  );
}