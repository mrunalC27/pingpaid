# PingPaid

**Send an invoice in one sentence. Get paid without the awkward chasing.**

PingPaid is a small invoicing helper for freelancers, built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com). It runs on the PayPal sandbox, so no real money moves.

Freelancers lose time in two places: filling in invoice forms, and politely chasing the clients who pay late. PingPaid handles both:

1. **New invoice.** Type something like *"Logo design for Rahul Sharma (rahul@example.com), 3 hours at $20 an hour, due in 7 days"*. AI turns it into a draft invoice. You check it, change anything, and PayPal creates and sends the real (sandbox) invoice.
2. **Who needs a nudge?** PingPaid looks at every unpaid invoice and finds the ones that are late or due soon. AI writes a reminder for each client, with a tone that matches how late it is. You read them, edit them, and approve. PayPal sends the reminders.
3. **Dashboard.** An [AG Studio](https://www.ag-grid.com/studio/) dashboard shows who owes you, how late they are, what you have invoiced and what has come in.

Nothing is ever sent without a click from you.

## How AI is used

| Where | What the AI does | Model |
|---|---|---|
| New invoice | Reads one plain sentence and returns structured invoice details (client, email, items, quantities, prices, due date). It is told never to invent an email or an amount. You review the result before anything is created. | Google Gemini, structured JSON output |
| Who needs a nudge? | Writes one short reminder per late invoice. The tone follows the lateness: *heads-up* (not late yet), *gentle* (1 to 3 days), *clear* (4 to 14 days), *firm* (over 14 days). It never threatens or mentions fees. | Google Gemini, structured JSON output |

Gemini is sometimes overloaded, so [`lib/gemini.ts`](lib/gemini.ts) retries, then tries backup models. If every model fails, the nudge page falls back to a plain template and says so on the card.

Parts of this project were written with the help of Claude, an AI coding assistant.

## What uses PayPal

All calls go through [`lib/paypal.ts`](lib/paypal.ts), with plain `fetch` and no SDK:

- `POST /v2/invoicing/generate-next-invoice-number`, `POST /v2/invoicing/invoices` and `POST /v2/invoicing/invoices/{id}/send` create and send an invoice.
- `POST /v2/invoicing/invoices/{id}/remind` sends a reminder with the approved message.
- `GET /v2/invoicing/invoices` (and per-invoice details) feed the nudge finder and the dashboard.
- The starter's endpoint pages also read products, plans, transactions and balances.

## Run it locally

You need Node.js 20.9 or later, and a free PayPal sandbox app.

1. **PayPal sandbox app.** In the [PayPal developer dashboard](https://developer.paypal.com/dashboard/applications/sandbox) (make sure Sandbox is selected), create an app and tick **Transaction search** under Features. Copy its Client ID and Secret.
2. **Gemini key.** Create an API key in [Google AI Studio](https://aistudio.google.com).
3. **Install and configure.**

   ```bash
   npm install
   cp env.example .env.local     # on Windows: copy env.example .env.local
   ```

   Fill in `.env.local`:

   | Variable | Needed | What it is |
   |---|---|---|
   | `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET` | yes | Your PayPal sandbox app credentials |
   | `GEMINI_API_KEY` | yes | Your Gemini key |
   | `GEMINI_MODEL` | no | First model to try. Defaults to `gemini-3.8-flash` |
   | `GEMINI_FALLBACK_MODELS` | no | Comma-separated backup models, used when the first is overloaded or gone |
   | `AG_STUDIO` | no | AG Studio licence key. Without it the dashboard works and shows a trial watermark |

4. **Start it.**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). If Next.js fails to start on Windows with a message about Turbopack and native bindings, run `npm run dev -- --webpack` instead.

Model names change over time. If you get a "model is no longer available" error, set `GEMINI_MODEL` to a current one. Google AI Studio shows which models your key can use.

### Try it

1. Open **New invoice**, click **Use an example**, then **Fill in my invoice**, then **Send invoice**. Make a few with different due dates.
2. Open **Who needs a nudge?** and click **Check my invoices**. Use the dropdown to include invoices due within 7 or 14 days. Edit a message and send it.
3. Open **Dashboard** to see who owes you. To see paid invoices, record a payment on an invoice in the sandbox invoicing dashboard.

Invoices that are not yet late only appear in the nudge list if they are due within the chosen window. To see the "gentle", "clear" and "firm" tones, use invoices with past due dates (they become late as days pass).

## Project layout

```
app/new/                 New invoice page: sentence in, editable draft, send
app/nudge/               "Who needs a nudge?" page
app/api/invoices/        Parse a sentence (AI) and create + send an invoice
app/api/nudges/          Draft reminders (AI) and send the approved ones
app/dashboard/           The AG Studio dashboard (report in studio/initial-report.ts)
lib/gemini.ts            Gemini calls with retries and backup models
lib/invoice-ai.ts        Sentence to invoice draft
lib/nudges.ts            Who is late, which tone, AI-written messages
lib/paypal.ts            All PayPal API calls
lib/dashboard-data.ts    Turns PayPal invoices into the dashboard's tables
app/(endpoints)/         Raw PayPal data pages, one AG Grid per endpoint
```

## Limits

- Sandbox only. Emails go to sandbox inboxes, not real ones.
- Reminders are sent when you click, not on a schedule. A real version would check daily in the background.
- The dashboard shows `$` for every amount and does not convert currencies. Invoices in other currencies are separated by the currency switch.
- Saved dashboard edits live in your browser's local storage.

## Credits

Started from PayPal's [AG Grid and AG Studio hackathon starter](https://github.com/paypaldev/hackathon-paypal-ag-grid-boilerplate), which provides the PayPal data pages and the dashboard shell. The invoice creation, AI features, nudge page, and the PingPaid dashboard report were built on top of it for this hackathon.

## License

MIT. See [LICENSE](LICENSE).
