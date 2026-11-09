import { createInvoiceOnce, DuplicateInvoiceError, isValidAttemptKey } from '@/lib/invoice-attempts';
import { PayPalApiError, type NewInvoice } from '@/lib/paypal';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Step 2: the user has checked the draft, so create the invoice in the PayPal sandbox and send it.
// The page sends an "Idempotency-Key" with every click, so the same click twice makes one invoice.
export async function POST(request: Request) {
  const key = request.headers.get('Idempotency-Key');
  if (!isValidAttemptKey(key)) return Response.json({ error: 'Missing or invalid Idempotency-Key header.' }, { status: 400 });

  let body: NewInvoice;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  // Check everything again here: the browser can send anything.
  const problem =
    !body.clientName?.trim() ? 'Add the client name.'
    : !EMAIL.test(body.clientEmail ?? '') ? 'Add a valid client email.'
    : !/^[A-Z]{3}$/.test(body.currency ?? '') ? 'Currency must be a 3-letter code like USD.'
    : !Number.isInteger(body.dueInDays) || body.dueInDays < 0 || body.dueInDays > 365 ? 'Due days must be between 0 and 365.'
    : !Array.isArray(body.items) || body.items.length === 0 || body.items.length > 20 ? 'Add at least one item.'
    : body.items.some((i) => !i.name?.trim() || !(i.quantity > 0) || !(i.unitPrice >= 0)) ? 'Each item needs a name, a quantity above 0 and a price.'
    : undefined;
  if (problem) return Response.json({ error: problem }, { status: 400 });

  try {
    return Response.json(await createInvoiceOnce(key, body, request.headers.get('X-Confirm-Duplicate') === 'yes'));
  } catch (e) {
    if (e instanceof DuplicateInvoiceError) return Response.json({ error: e.message, duplicate: true }, { status: 409 });
    console.error('[invoice] create/send failed', String(e));
    const message = e instanceof PayPalApiError ? `PayPal said no (${e.status}). ${e.message.slice(0, 400)}` : 'Could not create the invoice.';
    return Response.json({ error: message }, { status: 502 });
  }
}
