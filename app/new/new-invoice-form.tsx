'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type Item = { name: string; quantity: number; unitPrice: number };
type Draft = { clientName: string; clientEmail: string; currency: string; dueInDays: number; items: Item[] };

const EXAMPLE = 'Logo design for Rahul Sharma (rahul@example.com), 3 hours at $20 an hour, due in 7 days';
const input = 'w-full rounded-md border border-pp-border bg-pp-surface px-3 py-2 focus:border-pp-blue focus:outline-none';
const button = 'rounded-full bg-pp-blue px-5 py-2 font-semibold text-white hover:bg-pp-blue-dark disabled:opacity-50';

async function call<T>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? 'Something went wrong. Try again.'), { duplicate: data.duplicate === true });
  return data as T;
}

export function NewInvoiceForm() {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<'parse' | 'send' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set when an identical invoice was just sent. The user can still choose to send anyway.
  // It is tied to the draft it was raised for, so editing the invoice hides it.
  const [duplicate, setDuplicate] = useState<{ message: string; draft: Draft } | null>(null);
  const [sent, setSent] = useState<{ id: string; invoiceNumber: string; repeated?: boolean } | null>(null);
  // One key per invoice being sent. A retry or double click reuses it, so PayPal only gets one invoice.
  // Changing the draft gives it a fresh key.
  const attemptKey = useRef<string | null>(null);
  useEffect(() => {
    attemptKey.current = null;
  }, [draft]);

  async function parse() {
    setBusy('parse');
    setError(null);
    try {
      const d = await call<Draft>('/api/invoices/parse', { text });
      setDraft(d.items.length ? d : { ...d, items: [{ name: '', quantity: 1, unitPrice: 0 }] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function send(confirmDuplicate = false) {
    if (!draft) return;
    setBusy('send');
    setError(null);
    setDuplicate(null);
    try {
      attemptKey.current ??= crypto.randomUUID();
      const headers: Record<string, string> = { 'Idempotency-Key': attemptKey.current };
      if (confirmDuplicate) headers['X-Confirm-Duplicate'] = 'yes';
      setSent(await call('/api/invoices', draft, headers));
    } catch (e) {
      if ((e as { duplicate?: boolean }).duplicate) setDuplicate({ message: (e as Error).message, draft });
      else setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const setItem = (i: number, patch: Partial<Item>) =>
    setDraft((d) => d && { ...d, items: d.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) });

  if (sent && draft) {
    return (
      <div className="mt-8 rounded-lg border border-pp-border bg-pp-surface p-6">
        <h2 className="text-xl font-semibold text-pp-success">Invoice {sent.invoiceNumber} sent</h2>
        <p className="mt-1 text-pp-muted">It was sent to {draft.clientEmail} through the PayPal sandbox.</p>
        {sent.repeated && <p className="mt-1 text-sm text-pp-muted">This invoice had already been sent a moment ago, so I did not make a second one.</p>}
        <div className="mt-4 flex gap-3">
          <Link href="/invoices" className={button}>See all invoices</Link>
          <button className="px-3 font-semibold text-pp-blue" onClick={() => { setSent(null); setDraft(null); setText(''); }}>
            Make another
          </button>
        </div>
      </div>
    );
  }

  const total = draft?.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0) ?? 0;

  return (
    <div className="mt-8 space-y-6">
      <section>
        <label htmlFor="note" className="font-semibold">What did you do, and for whom?</label>
        <textarea
          id="note"
          rows={3}
          className={`${input} mt-2`}
          placeholder={EXAMPLE}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-3 flex items-center gap-3">
          <button className={button} disabled={busy !== null || text.trim().length < 5} onClick={parse}>
            {busy === 'parse' ? 'Reading…' : 'Fill in my invoice'}
          </button>
          <button className="text-sm font-semibold text-pp-blue" onClick={() => setText(EXAMPLE)}>Use an example</button>
        </div>
      </section>

      {error && <p role="alert" className="rounded-md border border-pp-danger bg-white p-3 text-pp-danger">{error}</p>}

      {draft && (
        <section className="space-y-4 rounded-lg border border-pp-border bg-pp-surface p-6">
          <h2 className="text-lg font-semibold text-pp-navy">Check the invoice</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold">Client name
              <input className={`${input} mt-1 font-normal`} value={draft.clientName} onChange={(e) => setDraft({ ...draft, clientName: e.target.value })} />
            </label>
            <label className="block text-sm font-semibold">Client email
              <input className={`${input} mt-1 font-normal`} type="email" value={draft.clientEmail} onChange={(e) => setDraft({ ...draft, clientEmail: e.target.value })} />
            </label>
            <label className="block text-sm font-semibold">Due in (days)
              <input className={`${input} mt-1 font-normal`} type="number" min={0} max={365} value={draft.dueInDays} onChange={(e) => setDraft({ ...draft, dueInDays: Number(e.target.value) })} />
            </label>
            <label className="block text-sm font-semibold">Currency
              <input className={`${input} mt-1 font-normal`} maxLength={3} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} />
            </label>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_5rem_6rem] gap-2 text-sm font-semibold text-pp-muted">
              <span>Item</span><span>Qty</span><span>Price</span>
            </div>
            {draft.items.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_5rem_6rem] gap-2">
                <input className={input} aria-label="Item name" value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} />
                <input className={input} aria-label="Quantity" type="number" min={0} step="any" value={it.quantity} onChange={(e) => setItem(i, { quantity: Number(e.target.value) })} />
                <input className={input} aria-label="Price" type="number" min={0} step="any" value={it.unitPrice} onChange={(e) => setItem(i, { unitPrice: Number(e.target.value) })} />
              </div>
            ))}
            <button className="text-sm font-semibold text-pp-blue" onClick={() => setDraft({ ...draft, items: [...draft.items, { name: '', quantity: 1, unitPrice: 0 }] })}>
              + Add item
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-pp-border pt-4">
            <p className="text-lg font-semibold">Total: {total.toFixed(2)} {draft.currency}</p>
            <button className={button} disabled={busy !== null} onClick={() => send()}>
              {busy === 'send' ? 'Sending…' : 'Send invoice'}
            </button>
          </div>
          {duplicate && duplicate.draft === draft && (
            <div role="alert" className="rounded-md border border-pp-warning bg-amber-50 p-4">
              <p className="font-semibold text-pp-warning">{duplicate.message}</p>
              <p className="mt-1 text-sm text-pp-ink">Nothing was sent this time. If you really want a second one, send it anyway.</p>
              <button className={`${button} mt-3`} disabled={busy !== null} onClick={() => send(true)}>Send anyway</button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
