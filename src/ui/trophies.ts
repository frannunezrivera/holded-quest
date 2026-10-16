import { ACHIEVEMENTS, levelInfo } from '../game/progress';
import { state } from '../game/state';
import { money, t, type MessageKey } from '../i18n/i18n';
import { h, openModal } from './overlay';

export function openTrophies() {
  openModal(
    (close) => {
      const p = state.progress;
      const lv = levelInfo(p.xp);
      const snap = state.snapshot;
      const cur = snap?.currency ?? 'EUR';
      const ach = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' } },
        ...ACHIEVEMENTS.map((id) => {
          const got = p.achievements.includes(id);
          return h('div', { class: 'hq-kpi', style: { opacity: got ? '1' : '0.55', borderColor: got ? 'var(--gold)' : undefined } },
            h('div', { class: 'v', style: { fontSize: '20px' } }, (got ? '⭐ ' : '🔒 ') + t(`ach.${id}` as MessageKey)),
            h('div', { class: 's' }, t(`ach.${id}.d` as MessageKey)),
          );
        }),
      );
      const bests = h('div', { class: 'hq-kpis' },
        kpi('🏦 ' + t('trophy.vault'), `${p.bests.vault.toLocaleString()} pts`, money(p.totalSecured, cur, 0)),
        kpi('✈️ ' + t('trophy.dodge'), `${p.bests.dodge.toFixed(1)} s`),
        kpi('🎈 ' + t('trophy.balloon'), money(p.bests.balloon, cur, 0)),
        kpi('⭐ ' + t('hud.level', { n: lv.level }), `${p.xp} XP`, `${lv.into}/${lv.span}`),
        kpi('🔥 ' + t('trophy.streak'), t('hud.streak', { n: p.streak.count })),
      );
      const bank = snap?.accounts
        ? h('div', { class: 'hq-kpis' }, ...snap.accounts.map((a) => kpi(`${a.name}`, money(a.balance, a.currency, 0), a.type)))
        : h('p', { class: 'hq-note' }, '🔒 ' + t('trophy.noBank'));
      return h('div', { class: 'hq-card' },
        h('header', {}, h('h2', {}, '🏆 ' + t('trophy.title')), h('button', { class: 'hq-x', type: 'button', 'aria-label': t('ledger.close'), onclick: close }, '×')),
        h('h3', {}, t('trophy.bests')),
        bests,
        h('h3', {}, `${t('trophy.achievements')} · ${p.achievements.length}/${ACHIEVEMENTS.length}`),
        ach,
        h('h3', { style: { marginTop: '18px' } }, t('trophy.bank')),
        bank,
      );
    },
    { label: t('trophy.title') },
  );
}

function kpi(label: string, value: string, sub?: string) {
  return h('div', { class: 'hq-kpi' }, h('div', { class: 'k' }, label), h('div', { class: 'v' }, value), sub ? h('div', { class: 's' }, sub) : null);
}
