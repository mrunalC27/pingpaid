// Stops the same invoice from being created twice. Every "Send invoice" click carries an attempt key.
// If the same key comes in again (a double click, a retry after a slow network, a second tab),
// we hand back the invoice we already made instead of making another one. If the invoice was created
// but the email step failed, a retry just finishes the email step.
//
// Attempts are remembered in .data/invoice-attempts.json for a week. If that file cannot be written,
// protection still works while the server stays running.

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createInvoiceDraft, sendInvoice, type NewInvoice } from './paypal';

type Attempt = { id: string; invoiceNumber: string; sent: boolean; hash: string; at: string };
export type InvoiceResult = { id: string; invoiceNumber: string; /** True when this invoice had already been sent by an earlier click. */ repeated: boolean };

const FILE = path.join(process.cwd(), '.data', 'invoice-attempts.json');
const KEEP_MS = 7 * 86_400_000;
/** An identical invoice sent again within this long gets a warning first. */
const DUPLICATE_WINDOW_MS = 10 * 60_000;

/** Thrown when an identical invoice was sent a few minutes ago and the user has not confirmed. */
export class DuplicateInvoiceError extends Error {
  constructor(public invoiceNumber: string, public minutesAgo: number) {
    super(`You already sent an identical invoice (${invoiceNumber}) ${minutesAgo === 0 ? 'less than a minute' : `${minutesAgo} minute${minutesAgo === 1 ? '' : 's'}`} ago.`);
  }
}

export const isValidAttemptKey = (key: unknown): key is string => typeof key === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(key);

// Used when the file is unavailable, and as the fast path.
const memory = new Map<string, Attempt>();
const inflight = new Map<string, Promise<InvoiceResult>>();
let queue: Promise<unknown> = Promise.resolve();

const hashOf = (input: NewInvoice) => createHash('sha256').update(JSON.stringify(input)).digest('hex');

async function readAll(): Promise<Record<string, Attempt>> {
  try {
    const data = JSON.parse(await fs.readFile(FILE, 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function remember(key: string, attempt: Attempt): Promise<void> {
  memory.set(key, attempt);
  const job = queue.then(async () => {
    try {
      const all = await readAll();
      all[key] = attempt;
      for (const [k, v] of Object.entries(all)) if (Date.now() - Date.parse(v.at) > KEEP_MS) delete all[k];
      await fs.mkdir(path.dirname(FILE), { recursive: true });
      const tmp = `${FILE}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(all, null, 2));
      await fs.rename(tmp, FILE);
    } catch (e) {
      console.error('[invoice-attempts] could not save:', String(e));
    }
  });
  queue = job;
  return job;
}

async function run(key: string, input: NewInvoice, confirmDuplicate: boolean): Promise<InvoiceResult> {
  const hash = hashOf(input);
  let attempt: Attempt | undefined = memory.get(key) ?? (await readAll())[key];
  // Same key but the invoice was edited since: treat it as a new invoice.
  if (attempt && attempt.hash !== hash) attempt = undefined;
  if (attempt?.sent) return { id: attempt.id, invoiceNumber: attempt.invoiceNumber, repeated: true };

  if (!attempt) {
    if (!confirmDuplicate) {
      const recent = Object.entries({ ...(await readAll()), ...Object.fromEntries(memory) }).find(
        ([k, a]) => k !== key && a.sent && a.hash === hash && Date.now() - Date.parse(a.at) < DUPLICATE_WINDOW_MS,
      );
      if (recent) throw new DuplicateInvoiceError(recent[1].invoiceNumber, Math.floor((Date.now() - Date.parse(recent[1].at)) / 60_000));
    }
    const draft = await createInvoiceDraft(input);
    attempt = { ...draft, sent: false, hash, at: new Date().toISOString() };
    await remember(key, attempt);
  }
  await sendInvoice(attempt.id);
  await remember(key, { ...attempt, sent: true });
  return { id: attempt.id, invoiceNumber: attempt.invoiceNumber, repeated: false };
}

/** Creates and sends the invoice, at most once per attempt key. */
export function createInvoiceOnce(key: string, input: NewInvoice, confirmDuplicate = false): Promise<InvoiceResult> {
  const running = inflight.get(key);
  if (running) return running;
  const job = run(key, input, confirmDuplicate).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}
