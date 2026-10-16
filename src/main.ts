import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './ui/styles.css';
import Phaser from 'phaser';
import * as app from './app';
import { music } from './audio/music';
import { initApp } from './app';
import { unlockAudio } from './audio/sfx';
import { loadSettings } from './data/store';
import { BalloonCatch } from './game/scenes/BalloonCatch';
import { BossVat } from './game/scenes/BossVat';
import { CashRiver } from './game/scenes/CashRiver';
import { Boot } from './game/scenes/Boot';
import { DebtDodge } from './game/scenes/DebtDodge';
import { Hud } from './game/scenes/Hud';
import { Pause } from './game/scenes/Pause';
import { Results } from './game/scenes/Results';
import { Title } from './game/scenes/Title';
import { VaultRush } from './game/scenes/VaultRush';
import { World } from './game/scenes/World';
import { state } from './game/state';
import { H, W } from './game/ui';
import { t } from './i18n/i18n';
import { bindGame, h } from './ui/overlay';

async function start() {
  document.documentElement.lang = loadSettings().lang;
  // Canvas text and textures are drawn with Fredoka, so wait for it before booting.
  await Promise.allSettled(['500 32px Fredoka', '600 32px Fredoka', '700 32px Fredoka'].map((f) => document.fonts.load(f)));

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: W,
    height: H,
    backgroundColor: '#120c26',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 2300 }, debug: false } },
    audio: { noAudio: true },
    input: { activePointers: 3 },
    scene: [Boot, Title, World, Hud, VaultRush, DebtDodge, BalloonCatch, CashRiver, BossVat, Results, Pause],
  });
  document.body.append(h('div', { class: 'hq-rotate', role: 'note' }, h('span', { class: 'icon', 'aria-hidden': 'true' }, '📱'), t('ui.rotate')));
  bindGame(game);
  initApp(game);
  for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) window.addEventListener(ev, unlockAudio, { passive: true });
  if (import.meta.env.DEV) Object.assign(window, { __hq: game, __hqDebug: { state, app, music } });
}

void start();
