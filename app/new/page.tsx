import Link from 'next/link';
import type { Metadata } from 'next';
import { NewInvoiceForm } from './new-invoice-form';

export const metadata: Metadata = { title: 'New invoice' };

export default function NewInvoicePage() {
  return (
    <main className="mx-auto w-full max-w-2xl p-8 font-paypal text-pp-ink">
      <Link href="/" className="text-sm font-semibold text-pp-blue hover:underline">
        ← All pages
      </Link>
      <h1 className="mt-3 text-[28px] font-semibold text-pp-navy">New invoice</h1>
      <p className="mt-1 text-pp-muted">Describe the work in one sentence. AI fills in the invoice, you check it, then it is sent.</p>
      <NewInvoiceForm />
    </main>
  );
}
