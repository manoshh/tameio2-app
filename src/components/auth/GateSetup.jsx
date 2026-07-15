import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wallet } from 'lucide-react';
import { usePasswordAuth } from '@/lib/passwordAuth';
import { useToast } from '@/components/ui/use-toast';

export default function GateSetup() {
  const { setup } = usePasswordAuth();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 8) return toast({ title: 'Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες', variant: 'destructive' });
    if (password !== confirm) return toast({ title: 'Οι κωδικοί δεν ταιριάζουν', variant: 'destructive' });
    setBusy(true);
    try {
      await setup(password, email);
      toast({ title: 'Η εφαρμογή ρυθμίστηκε' });
    } catch (err) {
      toast({ title: err.message || 'Πρόβλημα ρύθμισης', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-100 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-stone-200 p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-emerald-700 flex items-center justify-center mb-3">
            <Wallet className="text-white" size={26} />
          </div>
          <h1 className="text-2xl font-semibold text-stone-900">Κοινό Ταμείο</h1>
          <p className="text-sm text-stone-500 mt-1">Πρώτη ρύθμιση — όρισε τον κοινό κωδικό</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="p">Κωδικός</Label>
            <Input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c">Επιβεβαίωση</Label>
            <Input id="c" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e">Email ανάκτησης (προαιρετικό)</Label>
            <Input id="e" type="email" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <p className="text-xs text-stone-400">Αποθηκεύεται για μελλοντική χρήση στην ανάκτηση κωδικού.</p>
          </div>
          <Button type="submit" className="w-full bg-emerald-700 hover:bg-emerald-800" disabled={busy}>Ολοκλήρωση</Button>
        </form>
      </div>
    </div>
  );
}