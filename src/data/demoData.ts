import { addDays, daysBetween } from './parse';
import type { HoldedAccountV2, HoldedBankMovementV2, HoldedDocV2, HoldedPaymentV2, Period, RawFinanceData } from './types';

/** Small seeded PRNG so the demo company is the same on every load. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_COMPANY = 'Estudio Nube S.L.';

const CLIENTS = [
  'Panadería La Espiga', 'Hotel Mirador', 'Bodegas Valle Alto', 'Clínica Sonrisas', 'Talleres Rueda',
  'Librería Papel', 'Café Origen', 'Gimnasio Fénix', 'Inmobiliaria Faro', 'Academia Delta',
  'Floristería Lirio', 'Ópticas Visión', 'Restaurante Brasa', 'Agencia Viajes Sol', 'Moda Hilo',
  'Farmacia Central', 'Cervecera Lúpulo', 'Estudio Yoga Prana', 'Constructora Roca', 'Tienda Bici Ya',
];

const SUPPLIERS = [
  'Amazon Web Services', 'Iberdrola', 'Movistar', 'Oficinas Coworking Hub', 'Gestoría Martínez',
  'Adobe', 'Seguros Atlas', 'Papelería Folio', 'Mensajería Rayo', 'Google Workspace',
  'Imprenta Tinta', 'Freelance Diseño Ana', 'Hosting Nubeweb', 'Renting Coches Vía',
];

const fmt = (n: number) => n.toFixed(2);

/** Generates Holded-v2-shaped raw data for a lively but healthy small company. */
export function generateDemoRaw(today: string, period: Period, seed = 20261015): RawFinanceData {
  const rnd = mulberry32(seed);
  const pick = <T>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];
  const amount = (min: number, max: number) => Math.round((min + rnd() ** 2.2 * (max - min)) * 100) / 100;

  // Collections and supplier payments over the period, with a little seasonality.
  const payments: HoldedPaymentV2[] = [];
  const span = Math.max(1, daysBetween(period.from, period.to));
  const nIn = Math.round(span / 2.6);
  for (let i = 0; i < nIn; i++) {
    const date = addDays(period.from, Math.floor(rnd() * (span + 1)));
    const season = 1 + 0.35 * Math.sin((+date.slice(5, 7) / 12) * Math.PI * 2);
    payments.push({
      id: `demo-pin-${i}`,
      contact_name: pick(CLIENTS),
      amount: fmt(amount(90, 9800) * season),
      date,
      document_type: 'invoice',
      document_id: `demo-inv-paid-${i}`,
      description: `F26${String(1000 + i).padStart(4, '0')}`,
    });
  }
  const nOut = Math.round(span / 4.2);
  for (let i = 0; i < nOut; i++) {
    payments.push({
      id: `demo-pout-${i}`,
      contact_name: pick(SUPPLIERS),
      amount: fmt(amount(25, 3200)),
      date: addDays(period.from, Math.floor(rnd() * (span + 1))),
      document_type: 'purchase',
      document_id: `demo-pur-paid-${i}`,
      description: '',
    });
  }

  const outstanding = (kind: 'inv' | 'pur', n: number, names: readonly string[], min: number, max: number): HoldedDocV2[] =>
    Array.from({ length: n }, (_, i) => {
      // Spread due dates from ~130 days overdue to ~45 days in the future.
      const dueOffset = Math.round(-130 + rnd() * 175);
      const due = addDays(today, dueOffset);
      const date = addDays(due, -30);
      const total = amount(min, max);
      const partial = rnd() < 0.2;
      const paid = partial ? Math.round(total * (0.2 + rnd() * 0.5) * 100) / 100 : 0;
      return {
        id: `demo-${kind}-${i}`,
        document_number: kind === 'inv' ? `F26${String(2000 + i).padStart(4, '0')}` : `C-${String(300 + i)}`,
        contact_name: pick(names),
        date,
        due_date: due,
        total: fmt(total),
        currency: 'eur',
        status: partial ? 'partial' : 'pending',
        approval_status: 'approved',
        payments_total: fmt(paid),
        payments_pending: fmt(total - paid),
      };
    });

  const accounts: HoldedAccountV2[] = [
    { id: 'demo-bank-1', name: 'BBVA Empresa', type: 'bank', currency: 'eur', balance: fmt(amount(18000, 42000)) },
    { id: 'demo-bank-2', name: 'Caixa Ahorro', type: 'bank', currency: 'eur', balance: fmt(amount(6000, 15000)) },
    { id: 'demo-card', name: 'Stripe', type: 'gateway', currency: 'eur', balance: fmt(amount(400, 3200)) },
  ];

  return {
    outstandingInvoices: outstanding('inv', 16, CLIENTS, 180, 7400),
    outstandingPurchases: outstanding('pur', 14, SUPPLIERS, 40, 2900),
    payments,
    periodInvoices: null,
    accounts,
  };
}

// ---------------------------------------------------------------- on-demand extras

/** Bank statement lines for the demo accounts, from `from` to `today`, with a believable rhythm. */
export function generateDemoMovements(from: string, today: string, seed = 77): Record<string, HoldedBankMovementV2[]> {
  const rnd = mulberry32(seed);
  const span = Math.max(1, daysBetween(from, today));
  const out: Record<string, HoldedBankMovementV2[]> = { 'demo-bank-1': [], 'demo-bank-2': [], 'demo-card': [] };
  let id = 0;
  const push = (acc: string, date: string, amount: number, description: string) =>
    out[acc].push({ id: `demo-mv-${id++}`, value_date: date, amount: amount.toFixed(2), description });
  for (let d = 0; d <= span; d++) {
    const date = addDays(from, d);
    const day = +date.slice(8, 10);
    const month = +date.slice(5, 7);
    // Client payments land a few times a week, bigger at month end.
    // Tuned so a month nets roughly +1.5k: the river wobbles with payroll and VAT but trends up.
    if (rnd() < 0.25) push('demo-bank-1', date, Math.round((300 + rnd() ** 1.8 * 4200) * (day > 24 ? 1.4 : 1)), `Cobro ${CLIENTS[Math.floor(rnd() * CLIENTS.length)]}`);
    if (rnd() < 0.18) push('demo-card', date, Math.round(60 + rnd() * 700), 'Liquidación Stripe');
    if (day === 28) push('demo-bank-1', date, -Math.round(7800 + rnd() * 900), 'Nóminas');
    if (day === 1) push('demo-bank-1', date, -1450, 'Alquiler oficina');
    if (day === 5) push('demo-bank-2', date, -Math.round(180 + rnd() * 90), 'Seguros Atlas');
    if (day === 20 && [1, 4, 7, 10].includes(month)) push('demo-bank-1', date, -Math.round(3800 + rnd() * 2400), 'AEAT · IVA trimestral (303)');
    if (rnd() < 0.22) push('demo-bank-1', date, -Math.round(30 + rnd() ** 2 * 1600), `Pago ${SUPPLIERS[Math.floor(rnd() * SUPPLIERS.length)]}`);
    if (day === 15 && rnd() < 0.5) push('demo-bank-2', date, Math.round(1500 + rnd() * 2500), 'Traspaso desde BBVA');
    if (day === 15 && rnd() < 0.5) push('demo-bank-1', date, -Math.round(1500 + rnd() * 2500), 'Traspaso a Caixa');
  }
  return out;
}

/** Sales and purchase invoices (with VAT) issued during a quarter. */
export function generateDemoQuarterDocs(from: string, to: string, today: string, seed = 303): { invoices: HoldedDocV2[]; purchases: HoldedDocV2[] } {
  const rnd = mulberry32(seed);
  const last = to < today ? to : today;
  const span = Math.max(0, daysBetween(from, last));
  const doc = (kind: 'inv' | 'pur', i: number, names: readonly string[], min: number, max: number, rates: number[]): HoldedDocV2 => {
    const base = Math.round((min + rnd() ** 1.7 * (max - min)) * 100) / 100;
    const rate = rates[Math.floor(rnd() * rates.length)];
    const tax = Math.round(base * rate) / 100;
    return {
      id: `demo-q-${kind}-${i}`,
      document_number: kind === 'inv' ? `F26${String(3000 + i)}` : `C-${String(700 + i)}`,
      contact_name: names[Math.floor(rnd() * names.length)],
      date: addDays(from, Math.floor(rnd() * (span + 1))),
      subtotal: fmt(base),
      tax: fmt(tax),
      total: fmt(base + tax),
      status: rnd() < 0.7 ? 'completed' : 'pending',
      approval_status: 'approved',
    };
  };
  const nInv = Math.max(4, Math.round((span / 92) * 24));
  const nPur = Math.max(3, Math.round((span / 92) * 18));
  return {
    invoices: Array.from({ length: nInv }, (_, i) => doc('inv', i, CLIENTS, 250, 6800, [21])),
    purchases: Array.from({ length: nPur }, (_, i) => doc('pur', i, SUPPLIERS, 30, 2400, [21, 21, 21, 10])),
  };
}
