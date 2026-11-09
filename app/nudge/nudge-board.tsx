'use client';

import { useState } from 'react';

type Tone = 'heads-up' | 'gentle' | 'clear' | 'firm';
type Nudge = {
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  clientEmail: string;
  amount: number;
  currency: string;
  dueDate: string;
  daysOverdue: number;
  tone: Tone;
  subject: string;
  message: string;
  source: 'ai' | 'template';
  lastRemindedDaysAgo: number | null;
};
type Card = Nudge & { selected: boolean; result?: { ok: boolean; skipped?: boolean; error?: string } };

const TONES: Record<Tone, { label: string; style: string }> = {
  'heads-up': { label: 'Heads-up', style: 'bg-pp-highlight text-pp-blue-dark' },
  gentle: { label: 'Gentle', style: 'bg-green-50 text-pp-success' },
  clear: { label: 'Clear', style: 'bg-amber-50 text-pp-warning' },
  firm: { label: 'Firm', style: 'bg-red-50 text-pp-danger' },
};

const button = 'rounded-full bg-pp-blue px-5 py-2 font-semibold text-white hover:bg-pp-blue-dark disabled:opacity-50';
const input = 'rounded-md border border-pp-border bg-pp-surface px-3 py-2 focus:border-pp-blue focus:outline-none';

const ago = (d: number) => (d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'} ago`);

const when = (d: number) =>
  d > 0 ? `${d} day${d === 1 ? '' : 's'} overdue` : d === 0 ? 'due today' : `due in ${-d} day${d === -1 ? '' : 's'}`;

async function call<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Try again.');
  return data as T;
}

export function NudgeBoard() {
  const [windowDays, setWindowDays] = useState(2);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [checked, setChecked] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [includeRecent, setIncludeRecent] = useState(false);
  // Whether the cards on screen were drafted with "include recent" on. The server needs to know when sending.
  const [draftedWithRecent, setDraftedWithRecent] = useState(false);
  const [busy, setBusy] = useState<'check' | 'send' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setBusy('check');
    setError(null);
    try {
      const data = await call<{ checked: number; skippedRecent: number; nudges: Nudge[] }>('/api/nudges/draft', { windowDays, includeRecent });
      setChecked(data.checked);
      setSkipped(data.skippedRecent);
      setDraftedWithRecent(includeRecent);
      setCards(data.nudges.map((n) => ({ ...n, selected: true })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!cards) return;
    const chosen = cards.filter((c) => c.selected && !c.result?.ok);
    setBusy('send');
    setError(null);
    try {
      const { results } = await call<{ results: { invoiceId: string; ok: boolean; skipped?: boolean; error?: string }[] }>('/api/nudges/send', {
        allowRecent: draftedWithRecent,
        items: chosen.map((c) => ({
          invoiceId: c.invoiceId,
          subject: c.subject,
          message: c.message,
          invoiceNumber: c.invoiceNumber,
          clientName: c.clientName,
          tone: c.tone,
        })),
      });
      setCards((prev) => prev && prev.map((c) => ({ ...c, result: results.find((r) => r.invoiceId === c.invoiceId) ?? c.result })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const patch = (id: string, change: Partial<Card>) =>
    setCards((prev) => prev && prev.map((c) => (c.invoiceId === id ? { ...c, ...change } : c)));

  const toSend = cards?.filter((c) => c.selected && !c.result?.ok).length ?? 0;
  const sentCount = cards?.filter((c) => c.result?.ok).length ?? 0;

  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button className={button} disabled={busy !== null} onClick={check}>
          {busy === 'check' ? 'Checking…' : cards ? 'Check again' : 'Check my invoices'}
        </button>
        <label className="flex items-center gap-2 text-sm text-pp-muted">
          Include invoices due within
          <select className={input} value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}>
            {[0, 2, 7, 14].map((d) => (
              <option key={d} value={d}>{d === 0 ? 'today only' : `${d} days`}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-pp-muted">
          <input type="checkbox" className="size-4" checked={includeRecent} onChange={(e) => setIncludeRecent(e.target.checked)} />
          Also show ones I reminded in the last 3 days
        </label>
      </div>

      {error && <p role="alert" className="rounded-md border border-pp-danger bg-white p-3 text-pp-danger">{error}</p>}

      {cards && cards.length === 0 && (
        <p className="rounded-lg border border-pp-border bg-pp-surface p-6">
          Nobody needs a nudge right now. I checked {checked} invoice{checked === 1 ? '' : 's'}.
          {skipped > 0
            ? ` ${skipped} ${skipped === 1 ? 'was' : 'were'} skipped because you reminded ${skipped === 1 ? 'it' : 'them'} in the last 3 days.`
            : ' Try a longer window to see ones that are due soon.'}
        </p>
      )}

      {cards && cards.length > 0 && skipped > 0 && (
        <p className="text-sm text-pp-muted">
          {skipped} more invoice{skipped === 1 ? ' was' : 's were'} skipped because you reminded {skipped === 1 ? 'it' : 'them'} in the last 3 days.
        </p>
      )}

      {cards?.map((c) => (
        <article key={c.invoiceId} className="space-y-3 rounded-lg border border-pp-border bg-pp-surface p-5">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1.5 size-4"
              aria-label={`Send reminder for invoice ${c.invoiceNumber}`}
              checked={c.selected}
              disabled={c.result?.ok}
              onChange={(e) => patch(c.invoiceId, { selected: e.target.checked })}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-pp-navy">{c.clientName}</h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[c.tone].style}`}>{TONES[c.tone].label}</span>
                {c.source === 'template' && <span className="text-xs text-pp-muted">(AI was unavailable, simple template used)</span>}
              </div>
              <p className="text-sm text-pp-muted">
                Invoice {c.invoiceNumber} · {c.amount.toFixed(2)} {c.currency} · due {c.dueDate} ·{' '}
                <span className={c.daysOverdue > 0 ? 'font-semibold text-pp-danger' : ''}>{when(c.daysOverdue)}</span>
              </p>
              {c.lastRemindedDaysAgo !== null && <p className="text-sm text-pp-muted">Last reminded {ago(c.lastRemindedDaysAgo)}</p>}
            </div>
          </div>
          <textarea
            className={`${input} w-full`}
            rows={4}
            aria-label={`Message for ${c.clientName}`}
            value={c.message}
            disabled={c.result?.ok}
            onChange={(e) => patch(c.invoiceId, { message: e.target.value })}
          />
          {c.result?.ok && <p className="text-sm font-semibold text-pp-success">Sent to {c.clientEmail}</p>}
          {c.result && !c.result.ok && (
            <p role="alert" className="text-sm text-pp-danger">{c.result.skipped ? c.result.error : `Could not send: ${c.result.error}`}</p>
          )}
        </article>
      ))}

      {cards && cards.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-pp-muted">{sentCount > 0 ? `${sentCount} sent` : 'Nothing is sent until you click.'}</p>
          <button className={button} disabled={busy !== null || toSend === 0} onClick={send}>
            {busy === 'send' ? 'Sending…' : toSend === 0 && sentCount > 0 ? 'All sent' : `Send ${toSend} reminder${toSend === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
    </div>
  );
}
