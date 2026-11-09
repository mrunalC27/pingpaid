// "Who needs a nudge?": finds unpaid invoices that are late or nearly due, and has AI write a
// friendly reminder for each one, with a tone that matches how late it is.

import { generateJson } from './gemini';
import { amountOf, listInvoices, type Invoice, type InvoiceStatus } from './paypal';
import { COOLDOWN_DAYS, daysSince, lastSentByInvoice, readLog } from './reminder-log';

export type Tone = 'heads-up' | 'gentle' | 'clear' | 'firm';

export type Nudge = {
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  clientEmail: string;
  amount: number;
  currency: string;
  dueDate: string;
  /** Days past the due date. Zero or negative means not late yet. */
  daysOverdue: number;
  tone: Tone;
  subject: string;
  message: string;
  /** 'ai' when Gemini wrote the message, 'template' when it was unavailable. */
  source: 'ai' | 'template';
  /** Whole days since PingPaid last reminded this invoice, or null if it never has. */
  lastRemindedDaysAgo: number | null;
};

const UNPAID = new Set<InvoiceStatus>(['SENT', 'UNPAID', 'PAYMENT_PENDING', 'PARTIALLY_PAID']);
const DAY_MS = 86_400_000;

export const toneFor = (daysOverdue: number): Tone =>
  daysOverdue <= 0 ? 'heads-up' : daysOverdue <= 3 ? 'gentle' : daysOverdue <= 14 ? 'clear' : 'firm';

const money = (n: number, currency: string) => `${n.toFixed(2)} ${currency}`;

const dueText = (daysOverdue: number) =>
  daysOverdue > 0 ? `${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue` : daysOverdue === 0 ? 'due today' : `due in ${-daysOverdue} day${daysOverdue === -1 ? '' : 's'}`;

type Candidate = Omit<Nudge, 'subject' | 'message' | 'source' | 'lastRemindedDaysAgo'>;

/** Unpaid invoices that are overdue or due within `windowDays`, most late first. */
export function pickCandidates(invoices: Invoice[], today: string, windowDays: number): Candidate[] {
  const candidates: Candidate[] = [];
  for (const inv of invoices) {
    const dueDate = inv.detail.payment_term?.due_date;
    if (!UNPAID.has(inv.status) || !dueDate) continue;
    const daysOverdue = Math.round((Date.parse(today) - Date.parse(dueDate)) / DAY_MS);
    if (daysOverdue < -windowDays) continue;
    const info = inv.primary_recipients?.[0]?.billing_info;
    candidates.push({
      invoiceId: inv.id,
      invoiceNumber: inv.detail.invoice_number,
      clientName: info?.name?.full_name ?? info?.email_address ?? 'there',
      clientEmail: info?.email_address ?? '',
      amount: amountOf(inv.due_amount ?? inv.amount),
      currency: inv.detail.currency_code,
      dueDate,
      daysOverdue,
      tone: toneFor(daysOverdue),
    });
  }
  return candidates.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

const subjectFor = (c: Candidate) =>
  c.daysOverdue > 0
    ? `Invoice ${c.invoiceNumber} is ${dueText(c.daysOverdue)}`
    : `Friendly reminder: invoice ${c.invoiceNumber} is ${dueText(c.daysOverdue)}`;

// Used only when the AI is unavailable, so the feature still works.
function templateFor(c: Candidate): string {
  const first = c.clientName.split(' ')[0];
  const what = `invoice ${c.invoiceNumber} for ${money(c.amount, c.currency)} (due ${c.dueDate})`;
  switch (c.tone) {
    case 'heads-up':
      return `Hi ${first}, a quick heads-up that ${what} is coming up. No action needed if it's already on its way. Thank you!`;
    case 'gentle':
      return `Hi ${first}, just a gentle nudge: ${what} looks like it slipped through. If you've already paid, please ignore this. Thank you!`;
    case 'clear':
      return `Hi ${first}, ${what} is now ${dueText(c.daysOverdue)}. Could you let me know when I can expect the payment? Thank you.`;
    case 'firm':
      return `Hi ${first}, ${what} is now ${dueText(c.daysOverdue)}. Please arrange payment as soon as you can, or reply with the date you will pay. Thank you.`;
  }
}

const INSTRUCTIONS = `You write short payment reminders that a freelancer sends to a client about an unpaid invoice.
Write one message per invoice. Rules:
- Start with "Hi <first name>,". Plain text only. No subject line, no signature, no markdown, no emojis.
- 2 to 4 sentences. Warm and human. Never threaten, never mention fees, lawyers or collections.
- Mention the invoice number, the amount with currency, and the due date.
- Match the tone:
  heads-up: not late yet. Friendly note that it is coming up. No pressure.
  gentle: 1 to 3 days late. Assume they simply forgot. Light and kind.
  clear: 4 to 14 days late. Friendly but direct. Ask when they expect to pay.
  firm: more than 14 days late. Polite but serious. Say it is well overdue and ask them to pay or reply with a payment date.
- Do not invent payment links, bank details or dates that are not given.
Return one entry per invoice, using the same invoiceId you were given.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    messages: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { invoiceId: { type: 'STRING' }, message: { type: 'STRING' } },
        required: ['invoiceId', 'message'],
      },
    },
  },
  required: ['messages'],
};

async function writeMessages(candidates: Candidate[]): Promise<Map<string, string>> {
  const facts = candidates.map((c) => ({
    invoiceId: c.invoiceId,
    clientName: c.clientName,
    invoiceNumber: c.invoiceNumber,
    amount: money(c.amount, c.currency),
    dueDate: c.dueDate,
    status: dueText(c.daysOverdue),
    tone: c.tone,
  }));
  const { messages } = await generateJson<{ messages: { invoiceId: string; message: string }[] }>(
    INSTRUCTIONS,
    JSON.stringify(facts),
    SCHEMA,
  );
  const known = new Set(candidates.map((c) => c.invoiceId));
  return new Map(
    (messages ?? [])
      .filter((m) => known.has(m.invoiceId) && typeof m.message === 'string' && m.message.trim())
      .map((m) => [m.invoiceId, m.message.trim().slice(0, 1500)]),
  );
}

/**
 * Looks at every invoice and returns a ready-to-send reminder for each one that needs it.
 * Invoices reminded in the last COOLDOWN_DAYS days are left out (and counted in `skippedRecent`)
 * unless `includeRecent` is true.
 */
export async function draftNudges(
  windowDays: number,
  { includeRecent = false, now = new Date() }: { includeRecent?: boolean; now?: Date } = {},
): Promise<{ checked: number; skippedRecent: number; nudges: Nudge[] }> {
  const invoices = await listInvoices();
  const all = pickCandidates(invoices, now.toISOString().slice(0, 10), windowDays);

  const lastSent = lastSentByInvoice(await readLog());
  const ago = (id: string) => {
    const sentAt = lastSent.get(id);
    return sentAt ? daysSince(sentAt, now) : null;
  };
  const candidates = includeRecent ? all : all.filter((c) => (ago(c.invoiceId) ?? Infinity) >= COOLDOWN_DAYS);
  const skippedRecent = all.length - candidates.length;
  if (candidates.length === 0) return { checked: invoices.length, skippedRecent, nudges: [] };

  let written = new Map<string, string>();
  try {
    written = await writeMessages(candidates);
  } catch (e) {
    console.error('[nudges] AI unavailable, using templates:', String(e));
  }

  return {
    checked: invoices.length,
    skippedRecent,
    nudges: candidates.map((c) => {
      const ai = written.get(c.invoiceId);
      return {
        ...c,
        subject: subjectFor(c),
        message: ai ?? templateFor(c),
        source: ai ? 'ai' : 'template',
        lastRemindedDaysAgo: ago(c.invoiceId),
      };
    }),
  };
}
