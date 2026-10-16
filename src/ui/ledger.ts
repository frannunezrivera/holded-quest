import {
  agingStrata,
  monthlyStrata,
  overdue,
  sum,
  topContacts,
  totalCash,
  totalCollected,
  totalOwedByClients,
  totalOwedToSuppliers,
  totalPaidOut,
  type AgingKey,
} from '../data/aggregate';
import type { Doc, FinanceSnapshot, Payment, ResourceId, Stratum } from '../data/types';
import { markExplored, state } from '../game/state';
import { fmtDate, locale, money, moneyShort, num, t, type MessageKey } from '../i18n/i18n';
import { h, hideTip, openModal, s, showTip } from './overlay';

export type LedgerTab = 'collected' | 'receivables' | 'payables' | 'paidOut' | 'bank';

const TAB_COLOR: Record<LedgerTab, string> = {
  collected: 'var(--gold-deep)',
  receivables: 'var(--teal)',
  payables: 'var(--rose)',
  paidOut: 'var(--violet)',
  bank: 'var(--gold)',
};

const TAB_RESOURCE: Record<LedgerTab, ResourceId> = {
  collected: 'payments',
  receivables: 'invoices',
  payables: 'purchases',
  paidOut: 'payments',
  bank: 'treasury',
};

const TAB_ZONE: Partial<Record<LedgerTab, string>> = { collected: 'gold', receivables: 'harbor', payables: 'debt' };

const STATUS_FOR_AGING: Record<AgingKey, string> = {
  notDue: 'var(--good)',
  d1_30: 'var(--warning)',
  d31_60: 'var(--serious)',
  d61_90: 'var(--serious)',
  d90plus: 'var(--critical)',
};

const MAX_ROWS = 300;

export function openLedger(tab: LedgerTab = 'collected') {
  const snap = state.snapshot;
  if (!snap) return;
  let current = tab;
  openModal(
    (close) => {
      const body = h('div', { role: 'tabpanel' });
      const tabs: LedgerTab[] = ['collected', 'receivables', 'payables', 'paidOut', 'bank'];
      const tabButtons = tabs.map((id) =>
        h('button', {
          class: 'hq-tab',
          role: 'tab',
          type: 'button',
          'aria-selected': String(id === current),
          onclick: () => select(id),
          onkeydown: (e: KeyboardEvent) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            const i = (tabs.indexOf(current) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
            select(tabs[i]);
            tabButtons[i].focus();
          },
        }, h('span', { class: 'dot', style: { background: TAB_COLOR[id] } }), t(`ledger.tab.${id}` as MessageKey)),
      );
      const select = (id: LedgerTab) => {
        current = id;
        tabButtons.forEach((b, i) => b.setAttribute('aria-selected', String(tabs[i] === id)));
        body.replaceChildren(renderTab(snap, id));
        const zone = TAB_ZONE[id];
        if (zone) markExplored(zone);
      };
      select(current);
      return h('div', { class: 'hq-card' },
        h('header', {},
          h('h2', {}, '📒 ' + t('ledger.title')),
          h('span', { class: 'hq-help' }, `${fmtDate(snap.period.from)} – ${fmtDate(snap.period.to)}`),
          h('button', { class: 'hq-x', type: 'button', 'aria-label': t('ledger.close'), onclick: close }, '×'),
        ),
        h('nav', { class: 'hq-tabs', role: 'tablist' }, ...tabButtons),
        body,
      );
    },
    { label: t('ledger.title'), onClose: hideTip },
  );
}

function kpi(label: string, value: string, sub?: string) {
  return h('div', { class: 'hq-kpi' }, h('div', { class: 'k' }, label), h('div', { class: 'v' }, value), sub ? h('div', { class: 's' }, sub) : null);
}

function renderTab(snap: FinanceSnapshot, tab: LedgerTab): HTMLElement {
  const wrap = h('div');
  const cur = snap.currency;
  if (snap.locked.includes(TAB_RESOURCE[tab]) && !(tab === 'collected' && snap.collectedEstimated)) {
    wrap.append(h('p', { class: 'hq-note' }, '🔒 ' + t('ledger.locked', { what: t(`res.${TAB_RESOURCE[tab]}` as MessageKey) })));
    return wrap;
  }

  if (tab === 'collected' || tab === 'paidOut') {
    const list = tab === 'collected' ? snap.collected : snap.paidOut;
    const total = tab === 'collected' ? totalCollected(snap) : totalPaidOut(snap);
    if (tab === 'collected' && snap.collectedEstimated) wrap.append(h('p', { class: 'hq-note' }, t('ledger.estimated')));
    const strata = monthlyStrata(list, snap.period, locale());
    const best = [...strata].sort((a, b) => b.total - a.total)[0];
    wrap.append(
      h('div', { class: 'hq-kpis' },
        kpi(t('ledger.total'), money(total, cur, 0)),
        kpi(t('ledger.count'), num(list.length)),
        kpi('Ø / ' + (locale().startsWith('es') ? 'mes' : 'month'), money(total / Math.max(1, strata.length), cur, 0)),
        best && best.total > 0 ? kpi('🏆 ' + best.label, money(best.total, cur, 0)) : null,
      ),
      h('div', { class: 'hq-grid2' },
        h('div', { class: 'hq-box' }, h('h3', {}, t('ledger.byMonth')), columnChart(strata, TAB_COLOR[tab], cur)),
        h('div', { class: 'hq-box' }, h('h3', {}, t('ledger.top')), contactBars(topContacts(list, (p) => p.amount), TAB_COLOR[tab], cur)),
      ),
      paymentsTable(list, cur),
    );
    return wrap;
  }

  if (tab === 'receivables' || tab === 'payables') {
    const docs = tab === 'receivables' ? snap.owedByClients : snap.owedToSuppliers;
    const total = tab === 'receivables' ? totalOwedByClients(snap) : totalOwedToSuppliers(snap);
    const od = overdue(docs);
    const soon = docs.filter((d) => d.daysToDue !== null && d.daysToDue >= 0 && d.daysToDue <= 7);
    const strata = agingStrata(docs, (k) => t(`aging.${k}` as MessageKey));
    wrap.append(
      h('div', { class: 'hq-kpis' },
        kpi(t('ledger.total'), money(total, cur, 0), t('stat.docs', { n: docs.length })),
        kpi('⚠️ ' + t('ledger.overdue'), money(sum(od, (d) => d.pending), cur, 0), t('stat.docs', { n: od.length })),
        kpi('⏳ ' + t('ledger.dueSoon'), money(sum(soon, (d) => d.pending), cur, 0), t('stat.docs', { n: soon.length })),
      ),
      h('div', { class: 'hq-grid2' },
        h('div', { class: 'hq-box' }, h('h3', {}, t('ledger.byAging')), agingBars(strata, cur)),
        h('div', { class: 'hq-box' }, h('h3', {}, t('ledger.top')), contactBars(topContacts(docs, (d) => d.pending), TAB_COLOR[tab], cur)),
      ),
      docsTable(docs, cur),
    );
    return wrap;
  }

  // bank
  const accounts = snap.accounts ?? [];
  const cash = totalCash(snap) ?? 0;
  wrap.append(
    h('div', { class: 'hq-kpis' }, kpi(t('ledger.total'), money(cash, cur, 0), `${accounts.length} ${t('world.accounts').toLowerCase()}`)),
    h('div', { class: 'hq-box' },
      ...(accounts.length
        ? accounts.map((a) => hbar(`${a.name} · ${a.type}`, a.balance, Math.max(...accounts.map((x) => Math.abs(x.balance)), 1), TAB_COLOR.bank, money(a.balance, a.currency, 0)))
        : [h('div', { class: 'hq-empty' }, t('ledger.empty'))]),
    ),
  );
  return wrap;
}

// ---------------------------------------------------------------- charts

/** Single-series column chart with a per-bar hover tooltip. */
function columnChart(strata: Stratum[], color: string, cur: string): SVGSVGElement {
  const W = 520;
  const H = 170;
  const padB = 24;
  const padT = 14;
  const max = Math.max(1, ...strata.map((x) => x.total));
  const gap = 2;
  const bw = (W - gap * (strata.length - 1)) / strata.length;
  const svg = s('svg', { class: 'hq-chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('ledger.byMonth') });
  svg.append(s('line', { x1: 0, x2: W, y1: H - padB + 0.5, y2: H - padB + 0.5, stroke: 'rgba(255,255,255,0.18)', 'stroke-width': 1 }));
  const bestIdx = strata.reduce((bi, x, i) => (x.total > strata[bi].total ? i : bi), 0);
  strata.forEach((st, i) => {
    const x = i * (bw + gap);
    const bh = (st.total / max) * (H - padB - padT);
    const y = H - padB - bh;
    const r = Math.min(4, bw / 2, bh);
    // Rounded top, square baseline.
    const d = bh > 0
      ? `M${x},${H - padB} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + bw - r},${y} Q${x + bw},${y} ${x + bw},${y + r} L${x + bw},${H - padB} Z`
      : '';
    if (d) svg.append(s('path', { class: 'bar', d, fill: color }));
    const hit = s('rect', { class: 'hit', x, y: padT, width: bw, height: H - padB - padT, fill: 'transparent' });
    const tip = `${st.label}: ${money(st.total, cur, 0)} · ${st.count}`;
    hit.addEventListener('pointermove', (e) => showTip(e.clientX, e.clientY, tip));
    hit.addEventListener('pointerleave', hideTip);
    svg.append(hit);
    if (strata.length <= 12 || i % 2 === 0) {
      const label = s('text', { x: x + bw / 2, y: H - 6, 'text-anchor': 'middle' });
      label.textContent = st.label.replace(/\.$/, '');
      svg.append(label);
    }
    if (i === bestIdx && st.total > 0) {
      const v = s('text', { x: x + bw / 2, y: Math.max(10, y - 4), 'text-anchor': 'middle', style: 'fill:#fff;font-weight:600' });
      v.textContent = moneyShort(st.total, cur);
      svg.append(v);
    }
  });
  return svg;
}

function hbar(name: string, value: number, max: number, color: string, label: string) {
  const pct = Math.max(0, Math.min(100, (Math.abs(value) / max) * 100));
  return h('div', { class: 'hq-hbar' },
    h('span', { class: 'name', title: name }, name),
    h('span', { class: 'track' }, h('span', { class: 'fill', style: { display: 'block', width: `${pct}%`, background: color } })),
    h('span', { class: 'val' }, label),
  );
}

function contactBars(top: { name: string; total: number; count: number }[], color: string, cur: string) {
  if (!top.length) return h('div', { class: 'hq-empty' }, t('ledger.empty'));
  const max = Math.max(...top.map((x) => x.total), 1);
  return h('div', {}, ...top.map((c) => hbar(c.name, c.total, max, color, moneyShort(c.total, cur))));
}

function agingBars(strata: Stratum[], cur: string) {
  const max = Math.max(...strata.map((x) => x.total), 1);
  return h('div', {}, ...strata.map((st) => hbar(`${st.label} (${st.count})`, st.total, max, STATUS_FOR_AGING[st.key as AgingKey], moneyShort(st.total, cur))));
}

// ---------------------------------------------------------------- tables

function dueCell(d: Doc) {
  if (d.daysOverdue > 0) {
    const cls = d.daysOverdue > 90 ? 'critical' : d.daysOverdue > 30 ? 'serious' : 'warning';
    return h('span', { class: `hq-pill ${cls}` }, t('ledger.daysOverdue', { n: d.daysOverdue }));
  }
  if (d.daysToDue === 0) return h('span', { class: 'hq-pill warning' }, t('ledger.dueToday'));
  if (d.daysToDue !== null && d.daysToDue <= 7) return h('span', { class: 'hq-pill warning' }, t('ledger.dueIn', { n: d.daysToDue }));
  return h('span', { class: 'hq-pill good' }, fmtDate(d.dueDate));
}

type Filter = 'all' | 'overdue' | 'soon' | 'partial';

function docsTable(docs: Doc[], cur: string) {
  let filter: Filter = 'all';
  let query = '';
  let sortKey: 'number' | 'contact' | 'date' | 'due' | 'total' | 'pending' = 'due';
  let asc = false;
  const tbody = h('tbody');
  const render = () => {
    const q = query.trim().toLowerCase();
    let rows = docs.filter((d) => {
      if (filter === 'overdue' && d.daysOverdue <= 0) return false;
      if (filter === 'soon' && !(d.daysToDue !== null && d.daysToDue >= 0 && d.daysToDue <= 7)) return false;
      if (filter === 'partial' && d.status !== 'partial') return false;
      return !q || d.contact.toLowerCase().includes(q) || d.number.toLowerCase().includes(q);
    });
    const val = (d: Doc): string | number =>
      sortKey === 'number' ? d.number : sortKey === 'contact' ? d.contact.toLowerCase() : sortKey === 'date' ? d.date : sortKey === 'due' ? d.daysOverdue - (d.daysToDue ?? 0) / 1000 : sortKey === 'total' ? d.total : d.pending;
    rows = [...rows].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * (asc ? 1 : -1));
    const shown = rows.slice(0, MAX_ROWS);
    tbody.replaceChildren(
      ...(shown.length
        ? shown.flatMap((d) => {
            const detail = h('tr', { class: 'detail', hidden: true },
              h('td', { colspan: 6 },
                `${d.number} · ${d.contact} · ${fmtDate(d.date)} → ${fmtDate(d.dueDate)} · ${t('ledger.col.amount')}: ${money(d.total, d.currency)} · ✓ ${money(d.paid, d.currency)} · ${t('ledger.col.pending')}: ${money(d.pending, d.currency)} · ${d.status === 'partial' ? t('ledger.partial') : t('ledger.pending')}`,
              ),
            );
            const row = h('tr', { class: 'row', tabindex: 0, onclick: () => (detail.hidden = !detail.hidden), onkeydown: (e: KeyboardEvent) => e.key === 'Enter' && (detail.hidden = !detail.hidden) },
              h('td', {}, d.number),
              h('td', { class: 'contact', title: d.contact }, d.contact),
              h('td', {}, fmtDate(d.date)),
              h('td', {}, dueCell(d)),
              h('td', { class: 'num' }, money(d.total, d.currency, 2)),
              h('td', { class: 'num' }, h('strong', {}, money(d.pending, d.currency, 2))),
            );
            return [row, detail];
          })
        : [h('tr', {}, h('td', { colspan: 6, class: 'hq-empty' }, t('ledger.empty')))]),
      ...(rows.length > MAX_ROWS ? [h('tr', {}, h('td', { colspan: 6, class: 'hq-empty' }, t('ledger.more', { n: rows.length - MAX_ROWS })))] : []),
    );
  };
  const chips: [Filter, MessageKey][] = [['all', 'ledger.filter.all'], ['overdue', 'ledger.filter.overdue'], ['soon', 'ledger.filter.soon'], ['partial', 'ledger.filter.partial']];
  const chipEls = chips.map(([f, label]) =>
    h('button', { class: 'hq-chip', type: 'button', 'aria-pressed': String(f === filter), onclick: () => { filter = f; chipEls.forEach((c, i) => c.setAttribute('aria-pressed', String(chips[i][0] === f))); render(); } }, t(label)),
  );
  const th = (key: typeof sortKey, label: MessageKey, numCol = false) =>
    h('th', { class: numCol ? 'num' : '', scope: 'col', onclick: () => { asc = sortKey === key ? !asc : false; sortKey = key; render(); } }, t(label));
  render();
  void cur;
  return h('div', {},
    h('div', { class: 'hq-tools' }, h('input', { class: 'hq-input', type: 'search', placeholder: t('ledger.search'), 'aria-label': t('ledger.search'), oninput: (e: Event) => { query = (e.target as HTMLInputElement).value; render(); } }), ...chipEls),
    h('div', { class: 'hq-table-wrap' },
      h('table', { class: 'hq-table' },
        h('thead', {}, h('tr', {}, th('number', 'ledger.col.number'), th('contact', 'ledger.col.contact'), th('date', 'ledger.col.date'), th('due', 'ledger.col.due'), th('total', 'ledger.col.amount', true), th('pending', 'ledger.col.pending', true))),
        tbody,
      ),
    ),
  );
}

function paymentsTable(list: Payment[], cur: string) {
  let query = '';
  let sortKey: 'date' | 'contact' | 'amount' = 'date';
  let asc = false;
  const tbody = h('tbody');
  const render = () => {
    const q = query.trim().toLowerCase();
    const val = (p: Payment): string | number => (sortKey === 'date' ? p.date : sortKey === 'contact' ? p.contact.toLowerCase() : p.amount);
    const rows = list
      .filter((p) => !q || p.contact.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
      .sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * (asc ? 1 : -1));
    tbody.replaceChildren(
      ...(rows.length
        ? rows.slice(0, MAX_ROWS).map((p) =>
            h('tr', {},
              h('td', {}, fmtDate(p.date)),
              h('td', { class: 'contact', title: p.contact }, p.contact),
              h('td', { class: 'contact' }, p.description || p.documentType || ''),
              h('td', { class: 'num' }, h('strong', {}, money(p.amount, cur, 2))),
            ),
          )
        : [h('tr', {}, h('td', { colspan: 4, class: 'hq-empty' }, t('ledger.empty')))]),
      ...(rows.length > MAX_ROWS ? [h('tr', {}, h('td', { colspan: 4, class: 'hq-empty' }, t('ledger.more', { n: rows.length - MAX_ROWS })))] : []),
    );
  };
  const th = (key: typeof sortKey, label: MessageKey, numCol = false) =>
    h('th', { class: numCol ? 'num' : '', scope: 'col', onclick: () => { asc = sortKey === key ? !asc : false; sortKey = key; render(); } }, t(label));
  render();
  return h('div', {},
    h('div', { class: 'hq-tools' }, h('input', { class: 'hq-input', type: 'search', placeholder: t('ledger.search'), 'aria-label': t('ledger.search'), oninput: (e: Event) => { query = (e.target as HTMLInputElement).value; render(); } })),
    h('div', { class: 'hq-table-wrap' },
      h('table', { class: 'hq-table' },
        h('thead', {}, h('tr', {}, th('date', 'ledger.col.date'), th('contact', 'ledger.col.contact'), h('th', {}, t('ledger.col.desc')), th('amount', 'ledger.col.amount', true))),
        tbody,
      ),
    ),
  );
}
