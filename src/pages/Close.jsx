import React from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';
import SettingsButton from '@/components/SettingsButton';
import MonthlyClose from '@/pages/MonthlyClose';

export default function Close() {
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader
        title="Κλείσιμο μήνα"
        subtitle="Δες το υπόλοιπο της Πειραιώς — η εφαρμογή υπολογίζει τι πρέπει να βάλει ο καθένας"
        onBack={() => navigate('/')}
        action={<SettingsButton />}
      />
      <MonthlyClose />
      <p className="text-xs text-stone-400 mt-6">
        Μετά το κλείσιμο, οι εγγραφές αρχειοθετούνται. Δες το αρχείο κάθε προσώπου στο «Ταμείο».
      </p>
    </div>
  );
}
