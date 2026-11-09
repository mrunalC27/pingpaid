import { COOLDOWN_DAYS, appendLog, daysSince, lastSentByInvoice, readLog, type ReminderEntry } from '@/lib/reminder-log';
import { sendInvoiceReminder } from '@/lib/paypal';

type Item = { invoiceId: string; subject: string; message: string; invoiceNumber?: string; clientName?: string; tone?: string };

const short = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

// Sends the reminders the user approved. One failure does not stop the rest.
// An invoice reminded in the last few days is skipped, unless the page said "allowRecent".
export async function POST(request: Request) {
  let items: Item[];
  let allowRecent = false;
  try {
    const body = await request.json();
    items = body.items;
    allowRecent = body.allowRecent === true;
  } catch {
    return Response.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
    return Response.json({ error: 'Pick between 1 and 20 reminders to send.' }, { status: 400 });
  }
  const bad = items.find(
    (i) =>
      !/^INV2-[A-Za-z0-9-]+$/.test(i?.invoiceId ?? '') ||
      !i.subject?.trim() ||
      !i.message?.trim() ||
      i.subject.length > 200 ||
      i.message.length > 4000,
  );
  if (bad) return Response.json({ error: 'One of the reminders is missing a message or is too long.' }, { status: 400 });

  const now = new Date();
  const lastSent = lastSentByInvoice(await readLog());

  const results = await Promise.all(
    items.map(async (i) => {
      const sentAt = lastSent.get(i.invoiceId);
      const ago = sentAt ? daysSince(sentAt, now) : null;
      if (!allowRecent && ago !== null && ago < COOLDOWN_DAYS) {
        const when = ago === 0 ? 'today' : `${ago} day${ago === 1 ? '' : 's'} ago`;
        return { invoiceId: i.invoiceId, ok: false as const, skipped: true as const, error: `Already reminded ${when}, so I skipped it.` };
      }
      try {
        await sendInvoiceReminder(i.invoiceId, i.subject.trim(), i.message.trim());
        return { invoiceId: i.invoiceId, ok: true as const };
      } catch (e) {
        console.error('[nudges] send failed', i.invoiceId, String(e));
        return { invoiceId: i.invoiceId, ok: false as const, error: String(e).slice(0, 300) };
      }
    }),
  );

  const sentOk = new Set(results.filter((r) => r.ok).map((r) => r.invoiceId));
  const entries: ReminderEntry[] = items
    .filter((i) => sentOk.has(i.invoiceId))
    .map((i) => ({
      invoiceId: i.invoiceId,
      invoiceNumber: short(i.invoiceNumber, 60),
      clientName: short(i.clientName, 120),
      tone: short(i.tone, 20),
      subject: i.subject.trim(),
      message: i.message.trim(),
      sentAt: now.toISOString(),
    }));
  await appendLog(entries);

  return Response.json({ results });
}
