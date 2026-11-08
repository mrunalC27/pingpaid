import Link from 'next/link';
import type { Metadata } from 'next';
import { NudgeBoard } from './nudge-board';

export const metadata: Metadata = { title: 'Who needs a nudge?' };

export default function NudgePage() {
  return (
    <main className="mx-auto w-full max-w-3xl p-8 font-paypal text-pp-ink">
      <Link href="/" className="text-sm font-semibold text-pp-blue hover:underline">
        ← All pages
      </Link>
      <h1 className="mt-3 text-[28px] font-semibold text-pp-navy">Who needs a nudge?</h1>
      <p className="mt-1 text-pp-muted">
        PingPaid checks your unpaid invoices and writes a friendly reminder for each late one. You read them, change anything, and send.
      </p>
      <NudgeBoard />
    </main>
  );
}
