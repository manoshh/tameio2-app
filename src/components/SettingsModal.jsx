import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { LogOut } from 'lucide-react';
import { getSettings } from '@/lib/api';
import { round2 } from '@shared/finance';
import { usePasswordAuth } from '@/lib/passwordAuth';
import { db } from '@/api/client';

export default function SettingsModal({ open, onOpenChange }) {
  const { toast } = useToast();
  const { recoveryEmail, updatePassword, logout } = usePasswordAuth();
  const [reserve, setReserve] = useState('');
  const [currentPwd, setCurrentPwd] = useState('');
  const [pwd, setPwd] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    getSettings().then((s) => setReserve(String(s.targetReserve ?? '')));
  }, [open]);

  useEffect(() => {
    if (recoveryEmail) setEmail(recoveryEmail);
  }, [recoveryEmail]);

  const saveReserve = async () => {
    setBusy(true);
    try {
      const s = await getSettings();
      await db.entities.Settings.update(s.id, { targetReserve: round2(parseFloat(reserve) || 0) });
      toast({ title: 'Ο στόχος αποθηκεύτηκε' });
    } catch (err) {
      toast({ title: err.message || 'Η αποθήκευση απέτυχε', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const savePassword = async () => {
    if (pwd.length < 4) return toast({ title: 'Ο κωδικός πρέπει να έχει τουλάχιστον 4 χαρακτήρες', variant: 'destructive' });
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ρυθμίσεις</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-1">
          <div className="space-y-2">
            <Label>Στόχος-απόθεμα (€)</Label>
            <div className="flex gap-2">
              <Input type="number" step="0.01" value={reserve} onChange={(e) => setReserve(e.target.value)} />
              <Button className="bg-emerald-700 hover:bg-emerald-800 shrink-0" disabled={busy} onClick={saveReserve}>Αποθήκευση</Button>
            </div>
          </div>

          <div className="space-y-3 border-t border-stone-200 pt-5">
            <div className="text-sm font-medium text-stone-700">Κωδικός και email ανάκτησης</div>
            <div className="space-y-1.5">
              <Label>Τρέχων κωδικός</Label>
              <Input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="space-y-1.5">
              <Label>Νέος κωδικός</Label>
              <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="new-password" placeholder="Τουλάχιστον 4 χαρακτήρες" />
            </div>
            <div className="space-y-1.5">
              <Label>Email ανάκτησης</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button className="w-full bg-emerald-700 hover:bg-emerald-800" disabled={busy || !pwd || !currentPwd} onClick={savePassword}>
              Ενημέρωση κωδικού
            </Button>
          </div>

          <div className="border-t border-stone-200 pt-4">
            <Button variant="ghost" className="w-full text-stone-600" onClick={() => logout()}>
              <LogOut size={16} className="mr-2" /> Έξοδος
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
