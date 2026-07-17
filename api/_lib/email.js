import { HttpError } from './entities.js';

// Αποστολή email μέσω Resend (HTTP API — χωρίς SDK, ένα fetch αρκεί).
//
// Χωρίς επαληθευμένο domain, το Resend επιτρέπει αποστολή μόνο προς το email
// που κατέχει τον λογαριασμό, με αποστολέα onboarding@resend.dev. Αυτό αρκεί
// εδώ: υπάρχει ένα και μόνο email ανάκτησης. Για αποστολή σε άλλον παραλήπτη,
// επαλήθευσε domain στο Resend και όρισε το EMAIL_FROM.
const DEFAULT_FROM = 'Κοινό Ταμείο <onboarding@resend.dev>';

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail({ to, subject, html, text }) {
  if (!isEmailConfigured()) {
    throw new HttpError(503, 'Η αποστολή email δεν έχει ρυθμιστεί');
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || DEFAULT_FROM,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // Το σφάλμα του Resend μπορεί να περιέχει τη διεύθυνση του παραλήπτη —
    // μένει στα logs, δεν επιστρέφεται στον client.
    console.error('[resend]', res.status, detail);
    throw new HttpError(502, 'Η αποστολή του email απέτυχε');
  }

  return res.json();
}

export function resetEmailTemplate(link) {
  const text = [
    'Ζητήθηκε επαναφορά του κωδικού για το Κοινό Ταμείο.',
    '',
    `Άνοιξε αυτόν τον σύνδεσμο για να ορίσεις νέο κωδικό: ${link}`,
    '',
    'Ο σύνδεσμος λήγει σε 1 ώρα και μπορεί να χρησιμοποιηθεί μία φορά.',
    'Αν δεν το ζήτησες εσύ, αγνόησε αυτό το μήνυμα — ο κωδικός δεν αλλάζει.',
  ].join('\n');

  const html = `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1c1917">
      <h2 style="margin:0 0 4px;font-size:20px">Κοινό Ταμείο</h2>
      <p style="margin:0 0 24px;color:#78716c;font-size:14px">Επαναφορά κωδικού</p>
      <p style="font-size:15px;line-height:1.6">Ζητήθηκε επαναφορά του κωδικού. Πάτησε το κουμπί για να ορίσεις νέον:</p>
      <p style="margin:24px 0">
        <a href="${link}" style="display:inline-block;background:#047857;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px">Ορισμός νέου κωδικού</a>
      </p>
      <p style="font-size:13px;color:#78716c;line-height:1.6">
        Ο σύνδεσμος λήγει σε <strong>1 ώρα</strong> και μπορεί να χρησιμοποιηθεί μία φορά.<br>
        Αν δεν το ζήτησες εσύ, αγνόησε αυτό το μήνυμα — ο κωδικός δεν αλλάζει.
      </p>
      <p style="font-size:12px;color:#a8a29e;word-break:break-all;margin-top:24px;padding-top:16px;border-top:1px solid #e7e5e4">
        Αν το κουμπί δεν δουλεύει, αντίγραψε αυτόν τον σύνδεσμο:<br>${link}
      </p>
    </div>
  `.trim();

  return { subject: 'Επαναφορά κωδικού — Κοινό Ταμείο', html, text };
}
