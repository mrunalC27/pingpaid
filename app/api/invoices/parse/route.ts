import { InvoiceParseError, parseInvoiceText } from '@/lib/invoice-ai';

// Step 1 of the "new invoice" flow: plain sentence in, structured draft out. Nothing is sent to PayPal here.
export async function POST(request: Request) {
  let text: unknown;
  try {
    ({ text } = await request.json());
  } catch {
    return Response.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }
  if (typeof text !== 'string' || text.trim().length < 5 || text.length > 1000) {
    return Response.json({ error: 'Write a short note about the work, for example: Logo for Rahul, 3 hours at $20.' }, { status: 400 });
  }

  try {
    return Response.json(await parseInvoiceText(text.trim()));
  } catch (e) {
    console.error('[parse]', String(e));
    const message = e instanceof InvoiceParseError ? e.message : 'Something went wrong reading that note.';
    return Response.json({ error: message }, { status: 502 });
  }
}
