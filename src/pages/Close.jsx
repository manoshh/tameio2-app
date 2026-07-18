import React from 'react';
import PageHeader from '@/components/PageHeader';
import MonthlyClose from '@/pages/MonthlyClose';

export default function Close() {
  return (
    <div>
      <PageHeader title="Κλείσιμο μήνα" subtitle="Δες το υπόλοιπο της Πειραιώς — η εφαρμογή υπολογίζει τι πρέπει να βάλει ο καθένας" />
      <MonthlyClose />
      <p className="text-xs text-stone-400 mt-6">
        Μετά το κλείσιμο, οι εγγραφές αρχειοθετούνται. Δες το αρχείο κάθε προσώπου στο «Ταμείο».
      </p>
    </div>
  );
}
