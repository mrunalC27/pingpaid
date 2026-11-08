// The built-in "PingPaid" report: who owes you money, and what you have collected, as
// AG Studio report state. Field ids ('invoices.paidAmount') refer to the data sources in ./data.ts.

import type { AgPageState, AgReportState, AgWidgetLayoutState } from 'ag-studio';

// --- Helpers ----------------------------------------------------------------------

// Position on the canvas grid, in tracks: 24 columns wide, rows of studioCanvasRowHeight.
const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState => ({
  xTrack,
  yTrack,
  xSpan,
  ySpan,
});
const title = (text: string) => ({ title: { enabled: true, text } });
const sum = (id: string) => ({ id, aggregation: 'sum' as const });
const avg = (id: string) => ({ id, aggregation: 'avg' as const });
const countd = (id: string) => ({ id, aggregation: 'countd' as const });

// Same stack as --pp-font in app/globals.css.
const PAYPAL_FONT = '"PayPal Open", "Helvetica Neue", Helvetica, Arial, sans-serif';

const typography = (fontSize: number, fontWeight: 'normal' | 'bold' = 'normal') => ({
  fontFamily: PAYPAL_FONT,
  fontSize,
  fontWeight,
  fontStyle: 'normal' as const,
});

// A KPI tile, styled the same everywhere: bold title, large value, optional sparkline along `sparklineX`.
const kpi = (text: string, value: { id: string; aggregation?: 'sum' | 'avg' | 'countd' }, sparklineX?: string) => ({
  type: 'value' as const,
  dataMapping: {
    value: [value],
    ...(sparklineX && { sparklineX: [{ id: sparklineX }] }),
  },
  format: {
    title: { enabled: true, text, typography: typography(14, 'bold') },
    caption: { enabled: true, text: '', typography: typography(0) },
    style: { typography: typography(22) },
  },
});

// --- Pages ------------------------------------------------------------------------

// Invoice money isn't converted between currencies, so both pages are driven by a single-select
// currency switch, starting on USD (see each page's filter below).
const currencySwitch = {
  type: 'button-filter' as const,
  dataMapping: { value: [{ id: 'invoices.currency' }] },
  format: {
    ...title('Currency'),
    style: {
      selection: { type: 'single' as const },
      dimensions: { height: 28, minWidth: 48 },
    },
  },
};

const usdOnly = {
  field: { id: 'invoices.currency' },
  model: { operator: 'isIn' as const, value: ['USD'] },
  filterWidgetId: 'currency',
};

// Page 1: who owes you money right now, most urgent first.
const owed: AgPageState = {
  id: 'owed',
  widgets: {
    currency: currencySwitch,
    'kpi-outstanding': kpi('You are owed', sum('invoices.outstanding')),
    'kpi-overdue': kpi('Overdue', sum('invoices.overdueAmount')),
    'kpi-open': kpi('Unpaid invoices', countd('invoices.id')),
    'overdue-share': {
      type: 'radial-gauge',
      dataMapping: { value: [{ id: 'overdueShare' }] },
      format: {
        ...title('Overdue share'),
        style: {
          label: { typography: typography(24) },
          secondaryLabel: { enabled: true, text: 'of what you are owed is late' },
          scaleLabel: { min: 0, max: 1, typography: typography(11) },
        },
      },
    },
    'by-customer': {
      type: 'column-chart-stacked',
      dataMapping: {
        categoryKey: [{ id: 'customers.name' }],
        valueKey: [sum('invoices.outstanding')],
        legendKey: [{ id: 'invoices.agingBucket' }],
      },
      format: {
        ...title('Who owes you, and how late they are'),
        style: { theme: { common: { legend: { enabled: true } } } },
      },
    },
    'unpaid-invoices': {
      type: 'grid',
      dataMapping: {
        cols: [
          { id: 'invoices.number' },
          { id: 'customers.name' },
          { id: 'customers.email' },
          { id: 'invoices.dueDate' },
          { id: 'invoices.daysOverdue' },
          sum('invoices.outstanding'),
        ],
      },
      sort: [
        { field: { id: 'invoices.daysOverdue' }, direction: 'desc' },
        { field: { id: 'invoices.dueDate' }, direction: 'asc' },
      ],
      format: title('Unpaid invoices, most urgent first'),
    },
  },
  widgetLayout: {
    'kpi-outstanding': at(0, 0, 6, 7),
    'kpi-overdue': at(6, 0, 6, 7),
    'kpi-open': at(12, 0, 6, 7),
    currency: at(18, 0, 6, 7),
    'by-customer': at(0, 7, 16, 18),
    'overdue-share': at(16, 7, 8, 18),
    'unpaid-invoices': at(0, 25, 24, 20),
  },
  filter: {
    page: [usdOnly, { field: { id: 'invoices.isReceivable' }, model: { operator: 'isTrue' } }],
  },
};

// Page 2: what has been billed and what has come in.
const collected: AgPageState = {
  id: 'collected',
  widgets: {
    currency: currencySwitch,
    'kpi-invoiced': kpi('Invoiced', sum('invoices.issuedAmount')),
    'kpi-collected': kpi('Collected', sum('invoices.paidAmount')),
    'kpi-days': kpi('Avg days to get paid', avg('invoices.daysToPay')),
    'collection-rate': {
      type: 'radial-gauge',
      dataMapping: { value: [{ id: 'collectionRate' }] },
      format: {
        ...title('Collection rate'),
        style: {
          scaleLabel: { min: 0, max: 1 },
          label: { typography: typography(24, 'bold') },
          secondaryLabel: { enabled: true, text: 'of invoiced money received', typography: typography(12) },
        },
      },
    },
    'billed-vs-collected': {
      type: 'combo-chart-grouped-column-line',
      dataMapping: {
        categoryKey: [{ id: 'calendar::month' }],
        valueKey: [sum('invoices.issuedAmount'), sum('invoices.paidAmount')],
        secondaryValueKey: [{ id: 'collectionRate' }],
      },
      format: {
        ...title('Invoiced and paid, by month'),
        style: { theme: { common: { legend: { enabled: true } } } },
      },
    },
    'all-invoices': {
      type: 'grid',
      dataMapping: {
        cols: [
          { id: 'invoices.number' },
          { id: 'customers.name' },
          { id: 'invoices.status' },
          { id: 'invoices.invoiceDate' },
          { id: 'invoices.dueDate' },
          sum('invoices.total'),
          sum('invoices.paidAmount'),
        ],
      },
      sort: [{ field: { id: 'invoices.invoiceDate' }, direction: 'desc' }],
      format: title('All invoices'),
    },
  },
  widgetLayout: {
    'kpi-invoiced': at(0, 0, 6, 7),
    'kpi-collected': at(6, 0, 6, 7),
    'kpi-days': at(12, 0, 6, 7),
    currency: at(18, 0, 6, 7),
    'billed-vs-collected': at(0, 7, 16, 16),
    'collection-rate': at(16, 7, 8, 16),
    'all-invoices': at(0, 23, 24, 20),
  },
  filter: { page: [usdOnly] },
};

// The report opens on its first page.
export const dashboardReport: AgReportState = {
  selectedPageId: owed.id,
  pages: [owed, collected],
};
