import { sendInvoiceReminder } from '@/lib/paypal';

type Item = { invoiceId: string; subject: string; message: string };

// Sends the reminders the user approved. One failure does not stop the rest.
export async function POST(request: Request) {
  let items: Item[];
  try {
    ({ items } = await request.json());
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

  const results = await Promise.all(
    items.map(async (i) => {
      try {
        await sendInvoiceReminder(i.invoiceId, i.subject.trim(), i.message.trim());
        return { invoiceId: i.invoiceId, ok: true as const };
      } catch (e) {
        console.error('[nudges] send failed', i.invoiceId, String(e));
        return { invoiceId: i.invoiceId, ok: false as const, error: String(e).slice(0, 300) };
      }
    }),
  );
  return Response.json({ results });
}
