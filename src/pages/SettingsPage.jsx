import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { getSettings } from '@/lib/api';
import { round2 } from '@/lib/finance';
import { usePasswordAuth } from '@/lib/passwordAuth';
import PageHeader from '@/components/PageHeader';
import { db } from '@/api/client';

export default function SettingsPage() {
  const { toast } = useToast();
  const { recoveryEmail, updatePassword } = usePasswordAuth();
  const [settings, setSettings] = useState(null);
  const [reserve, setReserve] = useState('');
  const [currentPwd, setCurrentPwd] = useState('');
  const [pwd, setPwd] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setSettings(s);
      setReserve(String(s.targetReserve ?? ''));
    })();
  }, []);

  useEffect(() => {
    if (recoveryEmail) setEmail(recoveryEmail);
  }, [recoveryEmail]);

  const saveReserve = async () => {
    setBusy(true);
    try {
      const updated = await getSettings();
      const s = await db.entities.Settings.update(updated.id, { targetReserve: round2(parseFloat(reserve) || 0) });
      setSettings(s);
      toast({ title: 'Ο στόχος αποθηκεύτηκε' });
    } catch (err) {
      toast({ title: err.message || 'Η αποθήκευση απέτυχε', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const savePassword = async () => {
    if (pwd.length < 8) return toast({ title: 'Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες', variant: 'destructive' });
    setBusy(true);
    try {
      await updatePassword(currentPwd, pwd, email);
      setPwd('');
      setCurrentPwd('');
      toast({ title: 'Ο κωδικός ενημερώθηκε' });
    } catch (err) {
      toast({ title: err.message || 'Η ενημέρωση απέτυχε', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Ρυθμίσεις" subtitle="Στόχος-απόθεμα, κωδικός & email ανάκτησης" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-stone-200">
          <CardHeader><CardTitle className="text-base">Στόχος-απόθεμα</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Ποσό στόχου (€)</Label>
              <Input type="number" step="0.01" value={reserve} onChange={(e) => setReserve(e.target.value)} />
            </div>
            <Button className="bg-emerald-700 hover:bg-emerald-800" disabled={busy} onClick={saveReserve}>Αποθήκευση</Button>
          </CardContent>
        </Card>

        <Card className="border-stone-200">
          <CardHeader><CardTitle className="text-base">Κωδικός & email ανάκτησης</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Τρέχων κωδικός</Label>
              <Input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="space-y-1.5">
              <Label>Νέος κωδικός</Label>
              <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="new-password" placeholder="Τουλάχιστον 8 χαρακτήρες" />
            </div>
            <div className="space-y-1.5">
              <Label>Email ανάκτησης</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button className="bg-emerald-700 hover:bg-emerald-800" disabled={busy || !pwd || !currentPwd} onClick={savePassword}>Ενημέρωση κωδικού</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}