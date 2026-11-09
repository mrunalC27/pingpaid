// A small history of every reminder PingPaid has sent, saved in .data/reminder-log.json.
// It lets the nudge page skip invoices you already reminded recently, so a client never
// gets the same nag two days in a row. If the file cannot be read or written, PingPaid
// carries on without it (reminders still work, they just are not remembered).

import { promises as fs } from 'node:fs';
import path from 'node:path';

export type ReminderEntry = {
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  tone: string;
  subject: string;
  message: string;
  /** ISO timestamp of when the reminder was sent. */
  sentAt: string;
};

/** Do not remind the same invoice again for this many days (unless the user asks to). */
export const COOLDOWN_DAYS = 3;

const DAY_MS = 86_400_000;
const FILE = path.join(process.cwd(), '.data', 'reminder-log.json');

// Writes go one at a time, so two requests at once cannot overwrite each other.
let queue: Promise<unknown> = Promise.resolve();

export async function readLog(): Promise<ReminderEntry[]> {
  try {
    const data = JSON.parse(await fs.readFile(FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function appendLog(entries: ReminderEntry[]): Promise<void> {
  if (entries.length === 0) return Promise.resolve();
  const job = queue.then(async () => {
    try {
      const all = await readLog();
      all.push(...entries);
      await fs.mkdir(path.dirname(FILE), { recursive: true });
      const tmp = `${FILE}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(all, null, 2));
      await fs.rename(tmp, FILE);
    } catch (e) {
      console.error('[reminder-log] could not save:', String(e));
    }
  });
  queue = job;
  return job;
}

/** Most recent send time for each invoice. */
export function lastSentByInvoice(log: ReminderEntry[]): Map<string, string> {
  const last = new Map<string, string>();
  for (const e of log) {
    const prev = last.get(e.invoiceId);
    if (!prev || Date.parse(e.sentAt) > Date.parse(prev)) last.set(e.invoiceId, e.sentAt);
  }
  return last;
}

/** Whole days since an ISO timestamp. Zero means today. */
export const daysSince = (iso: string, now: Date) => Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / DAY_MS));
