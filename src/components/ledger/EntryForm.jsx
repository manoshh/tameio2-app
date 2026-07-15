import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';

export default function EntryForm({ module, onAdd }) {
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState('paid_in');
  const [person, setPerson] = useState('manos');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(today);

  const submit = async (e) => {
    e.preventDefault();
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    const signed = direction === 'paid_in' ? val : -val;
    await onAdd({
      module,
      person: module === 'person' ? person : undefined,
      amount: signed,
      description,
      date,
    });
    setAmount('');
    setDescription('');
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
      {module === 'person' && (
        <div className="space-y-1.5">
          <Label>Άτομο</Label>
          <Select value={person} onValueChange={setPerson}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manos">Μάνος</SelectItem>
              <SelectItem value="eirini">Ειρήνη</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Κατεύθυνση</Label>
        <Select value={direction} onValueChange={setDirection}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="paid_in">{module === 'person' ? 'Πλήρωσε κοινό έξοδο με δικά του λεφτά' : 'Πλήρωσε ο Βοτανικός'}</SelectItem>
            <SelectItem value="paid_out">{module === 'person' ? 'Το Ταμείο πλήρωσε προσωπικό του έξοδο' : 'Πλήρωσε το ταμείο'}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Ποσό (€)</Label>
        <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
      </div>
      <div className="space-y-1.5">
        <Label>Ημερομηνία</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
        <Label>Περιγραφή</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Τιμόλογι, ενοίκιο..." />
      </div>
      <div className="sm:col-span-2 lg:col-span-2 flex justify-end">
        <Button type="submit" className="bg-emerald-700 hover:bg-emerald-800"><Plus size={16} className="mr-1" /> Προσθήκη</Button>
      </div>
    </form>
  );
}