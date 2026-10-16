import Phaser from 'phaser';
import { goToTitle, goToWorld } from '../../app';
import { t } from '../../i18n/i18n';
import { openLedger } from '../../ui/ledger';
import { openSettings } from '../../ui/settings';
import { Button, ButtonGroup, H, W, panel, text } from '../ui';

/** Pause overlay for the world and the minigames. */
export class Pause extends Phaser.Scene {
  private from = 'World';

  constructor() {
    super('Pause');
  }

  init(data: { from?: string }) {
    this.from = data.from ?? 'World';
  }

  create() {
    this.scene.bringToTop();
    const inWorld = this.from === 'World';
    this.add.rectangle(W / 2, H / 2, W, H, 0x0d0820, 0.6).setInteractive();
    const ph = inWorld ? 640 : 480;
    panel(this, W / 2, H / 2, 640, ph);
    text(this, W / 2, H / 2 - ph / 2 + 70, '⏸ ' + t('pause.title'), 56, '#FFE45C', { strokeThickness: 9, weight: 700 });
    const resume = () => {
      this.scene.stop();
      this.scene.resume(this.from);
    };
    let y = H / 2 - ph / 2 + 180;
    const buttons: Button[] = [];
    const add = (label: string, fn: () => void, color = 0x7c4dff) => {
      buttons.push(new Button(this, W / 2, y, label, fn, { w: 460, h: 84, color }));
      y += 104;
    };
    add('▶ ' + t('pause.resume'), resume, 0xf5b700);
    if (inWorld) {
      add('📒 ' + t('pause.ledger'), () => openLedger('collected'), 0x2ec4b6);
      add('⚙️ ' + t('pause.settings'), () => openSettings());
      add('🏠 ' + t('pause.title.screen'), () => goToTitle(), 0x4b3d80);
    } else {
      add('🗺️ ' + t('pause.quit'), () => goToWorld(), 0x4b3d80);
    }
    buttons[0].label.setColor('#3A2400').setStroke('#FFF3B0', 0);
    new ButtonGroup(this, buttons).focus(0);
    this.input.keyboard?.on('keydown-ESC', resume);
    this.input.keyboard?.on('keydown-P', resume);
  }
}
