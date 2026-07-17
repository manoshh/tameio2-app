import React from 'react';
import PageHeader from '@/components/PageHeader';
import MonthlyClose from '@/pages/MonthlyClose';

export default function Close() {
  return (
    <div>
      <PageHeader title="Κλείσιμο μήνα" subtitle="Μέτρα το κουτί — η εφαρμογή βγάζει τι βάζει ο καθένας" />
      <MonthlyClose />
      <p className="text-xs text-stone-400 mt-6">
        Μετά το κλείσιμο, οι εγγραφές αρχειοθετούνται. Δες το αρχείο κάθε προσώπου στο «Ταμείο».
      </p>
    </div>
  );
}
