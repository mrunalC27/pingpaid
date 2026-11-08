// Turns one plain sentence ("Logo for Rahul, 3 hours at $20, due in 7 days") into a structured
// invoice draft, using Gemini. Server-side only: the API key is read from the environment.

export type DraftItem = { name: string; quantity: number; unitPrice: number };

export type InvoiceDraft = {
  clientName: string;
  clientEmail: string;
  currency: string;
  dueInDays: number;
  items: DraftItem[];
};

// Change the model with GEMINI_MODEL in .env.local if this one is not available for your key.
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const INSTRUCTIONS = `You turn a freelancer's short note into invoice details.
Rules:
- clientName: the person or company being billed. Empty string if not stated.
- clientEmail: only if an email address is written in the note. Never invent one. Empty string otherwise.
- currency: a 3-letter code such as USD, EUR or INR. Use USD if the note does not say.
- dueInDays: days until payment is due. Use 7 if not stated.
- items: one entry per thing being charged. name = short description of the work.
  If the note gives hours and an hourly rate, quantity = the hours and unitPrice = the rate.
  Otherwise quantity = 1 and unitPrice = the amount.
- Never guess amounts that are not in the note. If there is no amount, return an empty items list.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    clientName: { type: 'STRING' },
    clientEmail: { type: 'STRING' },
    currency: { type: 'STRING' },
    dueInDays: { type: 'INTEGER' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          quantity: { type: 'NUMBER' },
          unitPrice: { type: 'NUMBER' },
        },
        required: ['name', 'quantity', 'unitPrice'],
      },
    },
  },
  required: ['clientName', 'clientEmail', 'currency', 'dueInDays', 'items'],
};

export class InvoiceParseError extends Error {}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function parseInvoiceText(text: string): Promise<InvoiceDraft> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new InvoiceParseError('GEMINI_API_KEY is not set (see .env.local).');

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0 },
    }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new InvoiceParseError(`The AI service returned ${res.status}. ${detail}`);
  }

  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';

  let parsed: Partial<InvoiceDraft>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvoiceParseError('The AI answer was not readable. Try rewording the note.');
  }

  const items = (parsed.items ?? [])
    .map((i) => ({ name: String(i.name ?? '').trim(), quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) }))
    .filter((i) => i.name && i.quantity > 0 && i.unitPrice >= 0)
    .map((i) => ({ ...i, quantity: round2(i.quantity), unitPrice: round2(i.unitPrice) }));

  return {
    clientName: String(parsed.clientName ?? '').trim(),
    clientEmail: String(parsed.clientEmail ?? '').trim(),
    currency: /^[A-Za-z]{3}$/.test(parsed.currency ?? '') ? String(parsed.currency).toUpperCase() : 'USD',
    dueInDays: Number.isInteger(parsed.dueInDays) && Number(parsed.dueInDays) >= 0 ? Number(parsed.dueInDays) : 7,
    items,
  };
}
