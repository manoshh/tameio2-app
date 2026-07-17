import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wallet, Mail } from 'lucide-react';
import { usePasswordAuth } from '@/lib/passwordAuth';
import { useToast } from '@/components/ui/use-toast';
import { auth } from '@/api/client';

export default function GateLogin() {
  const { login, canReset } = usePasswordAuth();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(password);
    } catch (err) {
      toast({ title: err.message || 'Σφάλμα σύνδεσης', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const requestReset = async () => {
    setSending(true);
    try {
      await auth.requestReset();
      setSent(true);
    } catch (err) {
      toast({ title: err.message || 'Η αποστολή απέτυχε', variant: 'destructive' });
    } finally {
      setSending(false);
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
          <p className="text-sm text-stone-500 mt-1">Μάνος & Ειρήνη</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="p">Κωδικός</Label>
            <Input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </div>
          <Button type="submit" className="w-full bg-emerald-700 hover:bg-emerald-800" disabled={busy}>
            {busy ? 'Είσοδος...' : 'Είσοδος'}
          </Button>
        </form>

        {/* Εμφανίζεται μόνο αν η επαναφορά μπορεί όντως να δουλέψει: υπάρχει
            email ανάκτησης και έχει ρυθμιστεί αποστολή. */}
        {canReset && (
          sent ? (
            <p className="mt-4 text-center text-sm text-stone-500 leading-relaxed">
              Αν υπάρχει email ανάκτησης, στάλθηκε σύνδεσμος επαναφοράς.
              <br />
              <span className="text-stone-400 text-xs">Ο σύνδεσμος λήγει σε 1 ώρα.</span>
            </p>
          ) : (
            <button
              type="button"
              onClick={requestReset}
              disabled={sending}
              className="w-full mt-4 flex items-center justify-center gap-2 text-sm text-stone-500 hover:text-emerald-700 transition-colors disabled:opacity-50"
            >
              <Mail size={14} /> {sending ? 'Αποστολή...' : 'Ξέχασα τον κωδικό'}
            </button>
          )
        )}
      </div>
    </div>
  );
}
