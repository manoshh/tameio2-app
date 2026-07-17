import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { directionOptions } from '@/lib/labels';

export default function EntryForm({ module, onAdd }) {
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState('paid_in');
  const [person, setPerson] = useState('manos');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(today);
  const [touched, setTouched] = useState(false);

  const isPerson = module === 'person';
  // Οι επιλογές κατεύθυνσης ακολουθούν το επιλεγμένο άτομο, με το ίδιο λεκτικό
  // που εμφανίζεται και στις κάρτες υπολοίπων.
  const options = directionOptions(isPerson ? person : 'botanicos');

  const val = parseFloat(amount);
  const amountValid = Boolean(val) && val > 0;
  const descriptionValid = description.trim().length > 0;

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (!amountValid || !descriptionValid) return;

    await onAdd({
      module,
      person: isPerson ? person : undefined,
      amount: direction === 'paid_in' ? val : -val,
      description: description.trim(),
      date,
    });
    setAmount('');
    setDescription('');
    setTouched(false);
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
      {isPerson && (
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
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Ποσό (€)</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          aria-invalid={touched && !amountValid}
          className={touched && !amountValid ? 'border-rose-400 focus-visible:ring-rose-400' : undefined}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Ημερομηνία</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
        <Label>
          Περιγραφή <span className="text-rose-500">*</span>
        </Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Τιμολόγιο, ενοίκιο..."
          aria-invalid={touched && !descriptionValid}
          className={touched && !descriptionValid ? 'border-rose-400 focus-visible:ring-rose-400' : undefined}
        />
        {touched && !descriptionValid && (
          <p className="text-xs text-rose-600">Η περιγραφή είναι υποχρεωτική.</p>
        )}
      </div>
      <div className="sm:col-span-2 lg:col-span-2 flex justify-end sm:items-end sm:h-full">
        <Button type="submit" className="bg-emerald-700 hover:bg-emerald-800">
          <Plus size={16} className="mr-1" /> Προσθήκη
        </Button>
      </div>
    </form>
  );
}
