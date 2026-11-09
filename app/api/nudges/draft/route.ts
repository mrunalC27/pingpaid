import { draftNudges } from '@/lib/nudges';
import { PayPalApiError } from '@/lib/paypal';

// Looks at all invoices and writes a reminder for each one that is late or nearly due. Sends nothing.
export async function POST(request: Request) {
  let windowDays = 2;
  let includeRecent = false;
  try {
    const body = await request.json();
    if (Number.isInteger(body?.windowDays) && body.windowDays >= 0 && body.windowDays <= 60) windowDays = body.windowDays;
    includeRecent = body?.includeRecent === true;
  } catch {
    // No body: use the default.
  }

  try {
    return Response.json(await draftNudges(windowDays, { includeRecent }));
  } catch (e) {
    console.error('[nudges] draft failed', String(e));
    const message = e instanceof PayPalApiError ? `PayPal said no (${e.status}). ${e.message.slice(0, 300)}` : 'Could not check your invoices.';
    return Response.json({ error: message }, { status: 502 });
  }
}
