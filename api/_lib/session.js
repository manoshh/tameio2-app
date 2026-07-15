import crypto from 'node:crypto';
import { HttpError } from './entities.js';

const COOKIE_NAME = 'tameio_session';
const SESSION_DAYS = 180;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error('Λείπει έγκυρο SESSION_SECRET (τουλάχιστον 32 χαρακτήρες). Δες το .env.example.');
  }
  return value;
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

// Το session είναι stateless: "<λήξη>.<υπογραφή>". Δεν κρατάμε τίποτα στη βάση,
// και χωρίς το SESSION_SECRET δεν πλαστογραφείται.
export function issueCookie() {
  const expiresAt = Date.now() + SESSION_DAYS * 86400000;
  const token = `${expiresAt}.${sign(String(expiresAt))}`;
  const maxAge = SESSION_DAYS * 86400;
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function readCookie(req) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE_NAME) return rest.join('=');
  }
  return null;
}

export function isAuthenticated(req) {
  const token = readCookie(req);
  if (!token) return false;

  const [expiresAt, signature] = token.split('.');
  if (!expiresAt || !signature) return false;
  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) < Date.now()) return false;

  const expected = sign(expiresAt);
  // Σύγκριση σταθερού χρόνου — η απλή === διαρρέει πληροφορία μέσω timing.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function requireAuth(req) {
  if (!isAuthenticated(req)) throw new HttpError(401, 'Απαιτείται σύνδεση');
}
