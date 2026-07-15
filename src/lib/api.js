
import { round2 } from './finance';
import { db } from '@/api/client';

export async function getSettings() {
  const items = await db.entities.Settings.list('-created_date', 10);
  if (items[0]) return items[0];
  return await db.entities.Settings.create({
    targetReserve: 0,
    manosOwed: 0,
    eiriniOwed: 0,
    botanicosBalance: 0,
  });
}

export async function listEntries(module) {
  return await db.entities.LedgerEntry.filter({ module }, '-date', 500);
}

export async function listAllEntries() {
  return await db.entities.LedgerEntry.list('-date', 500);
}

export async function listSettlements() {
  return await db.entities.Settlement.list('-timestamp', 100);
}

export async function listBotanicosSettlements() {
  return await db.entities.BotanicosSettlement.list('-timestamp', 100);
}

export function fmt(n) {
  return new Intl.NumberFormat('el-GR', {
    style: 'currency',
    currency: 'EUR',
  }).format(round2(n || 0));
}

export function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('el-GR');
}

export function monthLabel(m, y) {
  const names = ['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος','Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'];
  return `${names[(m - 1) % 12] || ''} ${y}`;
}