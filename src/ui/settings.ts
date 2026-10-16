import { changeLanguage, changePeriod, connectHolded, errorMessage, playDemo, refreshData, goToTitle } from '../app';
import { clearExtras } from '../data/extras';
import { testKey } from '../data/service';
import { forgetApiKey, loadApiKey, loadSettings, saveCachedSnapshot, saveSettings } from '../data/store';
import type { PeriodId } from '../data/types';
import { state } from '../game/state';
import { fmtRelative, t } from '../i18n/i18n';
import { unlockAudio } from '../audio/sfx';
import { h, openModal } from './overlay';

export function openSettings(opts: { focusKey?: boolean } = {}) {
  unlockAudio();
  openModal(
    (close) => {
      const s = loadSettings();
      const existingKey = loadApiKey() ?? '';

      // ---- connection ----
      const status = h('p', { class: 'hq-status', role: 'status', 'aria-live': 'polite' });
      const setStatus = (msg: string, kind: 'ok' | 'err' | '' = '') => {
        status.textContent = msg;
        status.className = `hq-status ${kind}`;
      };
      const keyInput = h('input', {
        class: 'hq-input',
        id: 'hq-key',
        type: 'password',
        autocomplete: 'off',
        spellcheck: 'false',
        placeholder: t('settings.key.placeholder'),
        value: existingKey,
        autofocus: opts.focusKey ? true : undefined,
      });
      const showBtn = h('button', { class: 'hq-btn ghost', type: 'button', 'aria-label': 'show key', onclick: () => (keyInput.type = keyInput.type === 'password' ? 'text' : 'password') }, '👁');
      const remember = h('input', { type: 'checkbox', checked: s.rememberKey });
      const busy = (b: boolean) => card.querySelectorAll<HTMLButtonElement>('.hq-btn').forEach((x) => (x.disabled = b));

      const testBtn = h('button', {
        class: 'hq-btn teal',
        type: 'button',
        onclick: async () => {
          if (!keyInput.value.trim()) return setStatus(t('settings.err.empty'), 'err');
          busy(true);
          setStatus('…');
          try {
            await testKey(keyInput.value.trim());
            setStatus(t('settings.ok'), 'ok');
          } catch (err) {
            setStatus(errorMessage(err), 'err');
          } finally {
            busy(false);
          }
        },
      }, t('settings.test'));

      const saveBtn = h('button', {
        class: 'hq-btn gold',
        type: 'button',
        onclick: async () => {
          if (!keyInput.value.trim()) return setStatus(t('settings.err.empty'), 'err');
          busy(true);
          try {
            close();
            await connectHolded(keyInput.value, remember.checked);
          } catch (err) {
            openSettings({ focusKey: true });
            // The new dialog shows the reason.
            setTimeout(() => {
              const st = document.querySelector<HTMLElement>('.hq-modal .hq-status');
              if (st) {
                st.textContent = errorMessage(err);
                st.className = 'hq-status err';
              }
            }, 50);
          }
        },
      }, t('settings.save'));

      const forgetBtn = existingKey
        ? h('button', {
            class: 'hq-btn danger',
            type: 'button',
            onclick: async () => {
              forgetApiKey();
              keyInput.value = '';
              // Real financial data must not outlive the key that downloaded it.
              await saveCachedSnapshot(null);
              await clearExtras();
              if (state.snapshot?.source === 'holded') state.snapshot = null;
              saveSettings({ mode: s.mode === 'holded' ? null : s.mode });
              setStatus('🔒');
              if (s.mode === 'holded') {
                close();
                goToTitle();
              }
            },
          }, t('settings.forget'))
        : null;

      const rl = s.lastRateLimit;
      const quota =
        rl && rl.remaining !== null
          ? h('p', { class: 'hq-help' }, t('settings.quota', { n: rl.remaining, window: rl.window?.startsWith('min') ? t('settings.quota.minute') : t('settings.quota.month') }))
          : null;
      const snap = state.snapshot;
      const freshness = snap
        ? h('div', { class: 'hq-row', style: { marginTop: '12px' } },
            h('span', { class: 'hq-help' }, `${snap.source === 'demo' ? t('settings.modeDemo') : t('settings.modeHolded')} ${t('settings.updated', { when: fmtRelative(snap.fetchedAt) })}`),
            h('button', { class: 'hq-btn ghost', type: 'button', onclick: async () => { close(); await refreshData(); } }, '↻ ' + t('settings.refresh')),
          )
        : null;

      const connection = h('section', { class: 'hq-section' },
        h('h3', {}, '🔑 ' + t('settings.connection')),
        h('div', { class: 'hq-field' },
          h('label', { for: 'hq-key' }, t('settings.key')),
          h('div', { class: 'hq-row', style: { flexWrap: 'nowrap' } }, keyInput, showBtn),
          h('p', { class: 'hq-help' }, t('settings.key.help')),
        ),
        h('label', { class: 'hq-check' }, remember, t('settings.remember')),
        h('div', { class: 'hq-row', style: { marginTop: '16px' } }, saveBtn, testBtn, forgetBtn),
        status,
        quota,
        freshness,
        h('p', { class: 'hq-help', style: { marginTop: '8px' } }, '🛡️ ' + t('settings.privacy')),
      );

      // ---- preferences ----
      const year = new Date().getFullYear();
      const periods: [PeriodId, string][] = [
        ['thisYear', t('settings.period.thisYear')],
        ['last12', t('settings.period.last12')],
        [`y${year - 1}`, t('settings.period.year', { y: year - 1 })],
        [`y${year - 2}`, t('settings.period.year', { y: year - 2 })],
      ];
      const periodSelect = h('select', { class: 'hq-select', id: 'hq-period', onchange: async () => { close(); await changePeriod(periodSelect.value as PeriodId); } },
        ...periods.map(([id, label]) => h('option', { value: id, selected: s.period === id }, label)),
      );

      const langSeg = h('div', { class: 'hq-seg', role: 'group', 'aria-label': t('settings.language') },
        ...(['es', 'en'] as const).map((l) =>
          h('button', { type: 'button', 'aria-pressed': String(s.lang === l), onclick: () => { close(); changeLanguage(l); openSettings(); } }, l === 'es' ? 'Español' : 'English'),
        ),
      );

      const volume = h('input', {
        type: 'range', min: '0', max: '1', step: '0.05', value: String(s.volume), 'aria-label': t('settings.volume'),
        oninput: () => saveSettings({ volume: Number(volume.value) }),
      });
      const music = h('input', { type: 'checkbox', checked: s.musicOn, onchange: () => saveSettings({ musicOn: music.checked }) });
      const mute = h('input', { type: 'checkbox', checked: s.muted, onchange: () => saveSettings({ muted: mute.checked }) });

      const prefs = h('section', { class: 'hq-section' },
        h('div', { class: 'hq-field' }, h('label', { for: 'hq-period' }, '📅 ' + t('settings.period')), periodSelect),
        h('div', { class: 'hq-field' }, h('span', { class: 'hq-label' }, '🌍 ' + t('settings.language')), langSeg),
        h('div', { class: 'hq-field' },
          h('span', { class: 'hq-label' }, '🔊 ' + t('settings.audio')),
          h('div', { class: 'hq-row' }, h('span', { class: 'hq-help' }, t('settings.volume')), volume),
          h('div', { class: 'hq-row' }, h('label', { class: 'hq-check' }, music, t('settings.music')), h('label', { class: 'hq-check' }, mute, t('settings.mute'))),
        ),
        h('div', { class: 'hq-row' }, h('button', { class: 'hq-btn ghost', type: 'button', onclick: () => { close(); playDemo(); } }, '🎮 ' + t('settings.demo'))),
      );

      const card = h('div', { class: 'hq-card narrow' },
        h('header', {}, h('h2', {}, '⚙️ ' + t('settings.title')), h('button', { class: 'hq-x', type: 'button', 'aria-label': t('settings.close'), onclick: close }, '×')),
        connection,
        prefs,
      );
      return card;
    },
    { label: t('settings.title') },
  );
}
