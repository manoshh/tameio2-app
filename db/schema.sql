-- Κοινό Ταμείο — Neon Postgres schema
-- Εκτελείται με: npm run db:migrate

create extension if not exists pgcrypto;

-- Ρυθμίσεις πρόσβασης (ένας κοινός κωδικός για την εφαρμογή).
-- Ο κωδικός αποθηκεύεται ΜΟΝΟ ως bcrypt hash — ποτέ σε plaintext.
create table if not exists app_config (
  id            uuid primary key default gen_random_uuid(),
  "passwordHash" text not null,
  "recoveryEmail" text,
  initialized   boolean not null default false,
  created_date  timestamptz not null default now(),
  updated_date  timestamptz not null default now()
);

-- Σύνδεσμοι επαναφοράς κωδικού.
-- Αποθηκεύεται μόνο το hash του token: αν διαρρεύσει η βάση, τα ενεργά tokens
-- δεν είναι εξαργυρώσιμα — ίδια λογική με τον κωδικό.
create table if not exists password_reset (
  id          uuid primary key default gen_random_uuid(),
  "tokenHash" text not null unique,
  "expiresAt" timestamptz not null,
  "usedAt"    timestamptz,
  created_date timestamptz not null default now()
);

create index if not exists password_reset_expires_idx on password_reset ("expiresAt");

-- Μετρητής αποτυχημένων προσπαθειών σύνδεσης, για rate limiting.
-- key = η IP του επισκέπτη, ή '__global__' για το καθολικό δίχτυ ασφαλείας.
create table if not exists login_attempt (
  key              text primary key,
  "failedAttempts" integer not null default 0,
  "lockedUntil"    timestamptz,
  updated_date     timestamptz not null default now()
);

create index if not exists login_attempt_updated_idx on login_attempt (updated_date);

create table if not exists settings (
  id                 uuid primary key default gen_random_uuid(),
  "targetReserve"    numeric(12,2) not null default 0,
  "manosOwed"        numeric(12,2) not null default 0,
  "eiriniOwed"       numeric(12,2) not null default 0,
  "botanicosBalance" numeric(12,2) not null default 0,
  created_date       timestamptz not null default now(),
  updated_date       timestamptz not null default now()
);

create table if not exists settlement (
  id                      uuid primary key default gen_random_uuid(),
  month                   integer not null check (month between 1 and 12),
  year                    integer not null,
  "enteredBalance"        numeric(12,2) not null default 0,
  "targetReserve"         numeric(12,2) not null default 0,
  "refillAmount"          numeric(12,2) not null default 0,
  "shareEach"             numeric(12,2) not null default 0,
  "manosOwedBefore"       numeric(12,2) not null default 0,
  "manosOwedAfter"        numeric(12,2) not null default 0,
  "manosOffset"           numeric(12,2) not null default 0,
  "manosContribution"     numeric(12,2) not null default 0,
  "eiriniOwedBefore"      numeric(12,2) not null default 0,
  "eiriniOwedAfter"       numeric(12,2) not null default 0,
  "eiriniOffset"          numeric(12,2) not null default 0,
  "eiriniContribution"    numeric(12,2) not null default 0,
  "botanicosBalanceBefore" numeric(12,2) not null default 0,
  "timestamp"             timestamptz not null default now(),
  created_date            timestamptz not null default now(),
  updated_date            timestamptz not null default now()
);

create table if not exists botanicos_settlement (
  id              uuid primary key default gen_random_uuid(),
  month           integer not null check (month between 1 and 12),
  year            integer not null,
  "balanceBefore" numeric(12,2) not null default 0,
  "timestamp"     timestamptz not null default now(),
  created_date    timestamptz not null default now(),
  updated_date    timestamptz not null default now()
);

-- Εγγραφές ταμείου. settlementId = '' σημαίνει "ενεργή" (μη διακανονισμένη) εγγραφή.
create table if not exists ledger_entry (
  id                      uuid primary key default gen_random_uuid(),
  module                  text not null check (module in ('person', 'botanicos')),
  person                  text check (person in ('manos', 'eirini')),
  amount                  numeric(12,2) not null,
  description             text not null default '',
  "date"                  date not null,
  "settlementId"          text not null default '',
  "carryOverSettlementId" text not null default '',
  created_date            timestamptz not null default now(),
  updated_date            timestamptz not null default now(),
  -- εγγραφή τύπου 'person' πρέπει να έχει πρόσωπο, 'botanicos' όχι
  constraint person_required_for_person_module
    check ((module = 'person' and person is not null) or (module = 'botanicos'))
);

create index if not exists ledger_entry_module_idx        on ledger_entry (module);
create index if not exists ledger_entry_settlement_idx    on ledger_entry ("settlementId");
create index if not exists ledger_entry_carryover_idx     on ledger_entry ("carryOverSettlementId");
create index if not exists ledger_entry_date_idx          on ledger_entry ("date" desc);
create index if not exists settlement_timestamp_idx       on settlement ("timestamp" desc);
create index if not exists botanicos_settlement_ts_idx    on botanicos_settlement ("timestamp" desc);
