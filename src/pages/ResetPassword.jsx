import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wallet, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { auth } from '@/api/client';
import { usePasswordAuth } from '@/lib/passwordAuth';

function Shell({ children, subtitle }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-100 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-stone-200 p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-emerald-700 flex items-center justify-center mb-3">
            <Wallet className="text-white" size={26} />
          </div>
          <h1 className="text-2xl font-semibold text-stone-900">Κοινό Ταμείο</h1>
          {subtitle && <p className="text-sm text-stone-500 mt-1">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { refresh } = usePasswordAuth();
  const token = params.get('token') || '';

  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  // Ελέγχουμε το token πριν δείξουμε τη φόρμα, ώστε ο χρήστης να μη
  // συμπληρώσει κωδικό για να ανακαλύψει μετά ότι ο σύνδεσμος έχει λήξει.
  useEffect(() => {
    if (!token) { setChecking(false); return; }
    auth.verifyResetToken(token)
      .then((r) => setValid(r.valid))
      .catch(() => setValid(false))
      .finally(() => setChecking(false));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 4) return toast({ title: 'Ο κωδικός πρέπει να έχει τουλάχιστον 4 χαρακτήρες', variant: 'destructive' });
    if (password !== confirm) return toast({ title: 'Οι κωδικοί δεν ταιριάζουν', variant: 'destructive' });

    setBusy(true);
    try {
      await auth.resetPassword(token, password);
      // Ο server μας συνέδεσε ήδη· ενημερώνουμε το context και μπαίνουμε.
      await refresh();
      toast({ title: 'Ο κωδικός άλλαξε' });
      navigate('/', { replace: true });
    } catch (err) {
      toast({ title: err.message || 'Η επαναφορά απέτυχε', variant: 'destructive' });
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-100">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-emerald-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (!valid) {
    return (
      <Shell subtitle="Επαναφορά κωδικού">
        <div className="flex flex-col items-center text-center gap-3">
          <AlertCircle className="text-amber-500" size={32} />
          <p className="text-sm text-stone-600">
            Ο σύνδεσμος δεν είναι έγκυρος, έληξε ή έχει ήδη χρησιμοποιηθεί.
          </p>
          <Link to="/" className="text-sm text-emerald-700 hover:underline mt-2">
            Επιστροφή στη σύνδεση
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell subtitle="Όρισε νέο κωδικό">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="p">Νέος κωδικός</Label>
          <Input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c">Επιβεβαίωση</Label>
          <Input id="c" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </div>
        <Button type="submit" className="w-full bg-emerald-700 hover:bg-emerald-800" disabled={busy}>
          {busy ? 'Αποθήκευση...' : 'Ορισμός κωδικού'}
        </Button>
      </form>
    </Shell>
  );
}
