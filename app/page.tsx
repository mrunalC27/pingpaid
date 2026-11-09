import Link from 'next/link';
import { connection } from 'next/server';
import { countNudges } from '@/lib/nudges';

const actions = [
  { href: '/new', title: 'New invoice', text: 'Type one sentence. AI fills in the invoice and PayPal sends it.' },
  { href: '/nudge', title: 'Who needs a nudge?', text: 'See who is late and send friendly, AI-written reminders.' },
  { href: '/dashboard', title: 'Dashboard', text: 'Who owes you, how late they are, and what has come in.' },
];

// One page per PayPal endpoint the demo calls, each in app/(endpoints).
const endpoints = [
  { href: '/products', label: 'Catalog products', detail: 'GET /v1/catalogs/products' },
  { href: '/plans', label: 'Billing plans', detail: 'GET /v1/billing/plans' },
  { href: '/invoices', label: 'Invoices', detail: 'GET /v2/invoicing/invoices' },
  { href: '/transactions', label: 'Transactions', detail: 'GET /v1/reporting/transactions' },
  { href: '/balances', label: 'Balances', detail: 'GET /v1/reporting/balances' },
];

function PageLink({ href, label, detail }: { href: string; label: string; detail: string }) {
  return (
    <li>
      <Link href={href} className="flex items-baseline justify-between gap-4 py-3 hover:text-pp-blue">
        <span className="font-semibold">{label} →</span>
        <code className="text-sm text-pp-muted">{detail}</code>
      </Link>
    </li>
  );
}

export default async function Home() {
  // Live PayPal data. If PayPal is unreachable, the page still loads, just without the count.
  await connection();
  let nudgeCount: number | null = null;
  try {
    nudgeCount = await countNudges();
  } catch (e) {
    console.error('[home] could not count nudges:', String(e));
  }

  return (
    <main className="mx-auto w-full max-w-3xl p-8 pt-16 font-paypal text-pp-ink sm:p-16">
      <h1 className="text-4xl font-bold tracking-tight text-pp-navy">
        Ping<span className="text-pp-blue">Paid</span>
      </h1>
      <p className="mt-3 text-lg text-pp-muted">
        Send an invoice in one sentence. Get paid without the awkward chasing.
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-3">
        {actions.map((a) => (
          <li key={a.href}>
            <Link
              href={a.href}
              className="flex h-full flex-col rounded-lg border border-pp-border bg-pp-surface p-5 hover:border-pp-blue"
            >
              <span className="font-semibold text-pp-navy">{a.title} →</span>
              <span className="mt-2 text-sm text-pp-muted">{a.text}</span>
              {a.href === '/nudge' && nudgeCount !== null && (
                <span
                  className={`mt-3 w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    nudgeCount > 0 ? 'bg-amber-50 text-pp-warning' : 'bg-green-50 text-pp-success'
                  }`}
                >
                  {nudgeCount > 0 ? `${nudgeCount} need${nudgeCount === 1 ? 's' : ''} a nudge` : 'All caught up'}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-pp-muted">Runs on the PayPal sandbox, so no real money moves.</p>

      <h2 className="mt-12 text-sm font-semibold uppercase tracking-wider text-pp-muted">Under the hood: raw PayPal data</h2>
      <ul className="mt-2 divide-y divide-pp-border border-y border-pp-border">
        {endpoints.map((page) => (
          <PageLink key={page.href} {...page} />
        ))}
      </ul>
    </main>
  );
}
