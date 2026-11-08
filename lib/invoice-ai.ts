import { generateJson } from './gemini';

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
  let parsed: Partial<InvoiceDraft>;
  try {
    parsed = await generateJson<Partial<InvoiceDraft>>(INSTRUCTIONS, text, SCHEMA, { temperature: 0 });
  } catch (e) {
    throw new InvoiceParseError(e instanceof Error ? e.message : 'The AI service failed.');
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
