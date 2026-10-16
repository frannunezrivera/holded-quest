import Phaser from 'phaser';
import { sfx } from '../../audio/sfx';
import { overdue, sum, totalCash, totalCollected, totalOwedByClients, totalOwedToSuppliers } from '../../data/aggregate';
import { loadSettings, saveSettings } from '../../data/store';
import { fmtDate, moneyShort, t, type MessageKey } from '../../i18n/i18n';
import { openLedger, type LedgerTab } from '../../ui/ledger';
import { openSettings } from '../../ui/settings';
import { levelInfo, type AchievementId, type Progress } from '../progress';
import { state } from '../state';
import { H, W, text } from '../ui';

/** Always-on overlay above the world: money stats, level, streak and quick buttons. */
export class Hud extends Phaser.Scene {
  private xpBar!: Phaser.GameObjects.Graphics;
  private levelText!: Phaser.GameObjects.Text;
  private streakText!: Phaser.GameObjects.Text;
  private muteText!: Phaser.GameObjects.Text;
  private lastLevel = 1;
  private toastY = 150;

  constructor() {
    super('Hud');
  }

  create() {
    const s = state.snapshot;
    if (!s) return;
    this.toastY = 150;
    const cur = s.currency;
    const cash = totalCash(s);
    const odClients = sum(overdue(s.owedByClients), (d) => d.pending);
    const odSuppliers = sum(overdue(s.owedToSuppliers), (d) => d.pending);
    const chips: { icon: string; label: string; value: string; sub?: string; tab: LedgerTab; color: string; locked: boolean }[] = [
      { icon: 'coin-sm', label: t('stat.collected'), value: moneyShort(totalCollected(s), cur), tab: 'collected', color: '#FFE45C', locked: s.locked.includes('payments') && !s.collectedEstimated },
      { icon: 'safe', label: t('stat.cash'), value: cash === null ? '🔒' : moneyShort(cash, cur), tab: 'bank', color: '#FFFFFF', locked: cash === null },
      { icon: 'balloon-blue', label: t('stat.owedByClients'), value: moneyShort(totalOwedByClients(s), cur), sub: odClients > 0 ? `⚠ ${moneyShort(odClients, cur)}` : undefined, tab: 'receivables', color: '#9CF6EA', locked: s.locked.includes('invoices') },
      { icon: 'plane-red', label: t('stat.owedToSuppliers'), value: moneyShort(totalOwedToSuppliers(s), cur), sub: odSuppliers > 0 ? `⚠ ${moneyShort(odSuppliers, cur)}` : undefined, tab: 'payables', color: '#FF9AA6', locked: s.locked.includes('purchases') },
    ];
    let x = 0;
    const row = this.add.container(24, 0);
    for (const c of chips) {
      const cont = this.add.container(x, 22);
      row.add(cont);
      const icon = this.add.image(46, 46, c.icon);
      icon.setScale(Math.min(56 / icon.width, 56 / icon.height));
      const label = text(this, 90, 26, c.label, 20, '#CFC7EF', { stroke: null, shadow: false, origin: [0, 0.5], weight: 500 });
      const value = text(this, 90, 58, c.locked ? '🔒' : c.value, 32, c.color, { strokeThickness: 5, origin: [0, 0.5], weight: 700 });
      const sub = c.sub && !c.locked ? text(this, 90 + value.width + 6, 60, c.sub, 18, '#FF9AA6', { stroke: null, shadow: false, origin: [0, 0.5], weight: 600 }) : null;
      // Width follows the content so long localized amounts never overlap.
      const w = Math.max(230, 90 + value.width + (sub ? sub.width + 10 : 0) + 18, 90 + label.width + 18);
      const g = this.add.graphics();
      g.fillStyle(0x0d0820, 0.35);
      g.fillRoundedRect(0, 6, w, 92, 26);
      g.fillStyle(0x241a45, 0.88);
      g.fillRoundedRect(0, 0, w, 92, 26);
      g.lineStyle(3, 0xffffff, 0.14);
      g.strokeRoundedRect(0, 0, w, 92, 26);
      cont.add([g, icon, label, value]);
      if (sub) cont.add(sub);
      const hit = this.add.zone(w / 2, 46, w, 92).setInteractive({ useHandCursor: true });
      cont.add(hit);
      hit.on('pointerover', () => this.tweens.add({ targets: cont, y: 18, duration: 120 }));
      hit.on('pointerout', () => this.tweens.add({ targets: cont, y: 22, duration: 120 }));
      hit.on('pointerdown', () => {
        sfx('select');
        openLedger(c.tab);
      });
      x += w + 14;
    }
    // Never run into the level panel on the right.
    const room = W - 600 - 24;
    if (x - 14 > room) row.setScale(room / (x - 14));

    // Period + company
    const periodLabel = `${s.companyName} · ${fmtDate(s.period.from)} – ${fmtDate(s.period.to)}`;
    text(this, 28, 136, periodLabel, 20, '#FFFFFF', { origin: [0, 0.5], strokeThickness: 4 }).setAlpha(0.9);
    if (s.source === 'demo') {
      const demo = text(this, 28, 168, '🎮 ' + t('world.demo'), 20, '#FFE45C', { origin: [0, 0.5], strokeThickness: 4 });
      this.tweens.add({ targets: demo, alpha: 0.5, duration: 900, yoyo: true, repeat: -1 });
    }

    // Level & XP (right side), then quick buttons
    const rx = W - 24;
    const levelBg = this.add.graphics();
    levelBg.fillStyle(0x241a45, 0.88);
    levelBg.fillRoundedRect(rx - 570, 22, 300, 92, 26);
    this.add.image(rx - 525, 68, 'star').setScale(1.05);
    this.levelText = text(this, rx - 525, 70, '1', 24, '#3A2400', { stroke: null, shadow: false, weight: 700 });
    this.xpBar = this.add.graphics();
    this.streakText = text(this, rx - 480, 46, '', 22, '#FFFFFF', { origin: [0, 0.5], strokeThickness: 4 });

    const btn = (bx: number, label: string, onClick: () => void) => {
      const g = this.add.graphics();
      g.fillStyle(0x241a45, 0.88);
      g.fillRoundedRect(bx - 38, 30, 76, 76, 24);
      const tx = text(this, bx, 68, label, 34, '#FFFFFF', { stroke: null });
      const zone = this.add.zone(bx, 68, 76, 76).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        sfx('select');
        onClick();
      });
      zone.on('pointerover', () => tx.setScale(1.15));
      zone.on('pointerout', () => tx.setScale(1));
      return tx;
    };
    this.muteText = btn(rx - 216, loadSettings().muted ? '🔇' : '🔊', () => this.toggleMute());
    btn(rx - 130, '📒', () => openLedger('collected'));
    btn(rx - 44, '⚙️', () => openSettings());

    this.lastLevel = levelInfo(state.progress.xp).level;
    this.renderProgress(state.progress);

    const hint = text(this, W / 2, H - 40, t('world.hint'), 24, '#FFFFFF', { strokeThickness: 5 });
    this.tweens.add({ targets: hint, alpha: 0, delay: 9000, duration: 1500 });

    const onProgress = (p: Progress) => this.renderProgress(p);
    const onAch = (id: AchievementId) => this.achievementToast(id);
    const onMute = () => this.toggleMute();
    const onSettings = () => this.muteText.setText(loadSettings().muted ? '🔇' : '🔊');
    window.addEventListener('hq:settings', onSettings);
    state.events.on('progress', onProgress);
    state.events.on('achievement', onAch);
    this.scene.get('World')?.events.on('toggle-mute', onMute);
    this.events.once('shutdown', () => {
      window.removeEventListener('hq:settings', onSettings);
      state.events.off('progress', onProgress);
      state.events.off('achievement', onAch);
      this.scene.get('World')?.events.off('toggle-mute', onMute);
    });
  }

  private toggleMute() {
    const muted = !loadSettings().muted;
    saveSettings({ muted });
    this.muteText.setText(muted ? '🔇' : '🔊');
    if (!muted) sfx('select');
  }

  private renderProgress(p: Progress) {
    const lv = levelInfo(p.xp);
    this.levelText.setText(String(lv.level));
    this.streakText.setText(`🔥 ${t(p.streak.count === 1 ? 'hud.streak.one' : 'hud.streak', { n: p.streak.count })}`);
    const rx = W - 24;
    const g = this.xpBar;
    g.clear();
    const x0 = rx - 480;
    const w = 190;
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(x0, 76, w, 20, 10);
    g.fillStyle(0xffd54a, 1);
    g.fillRoundedRect(x0, 76, Math.max(20, (w * lv.into) / lv.span), 20, 10);
    if (lv.level > this.lastLevel) {
      this.lastLevel = lv.level;
      sfx('levelUp');
      this.toast('⭐ ' + t('results.levelup', { n: lv.level }), '#FFE45C');
    }
  }

  private achievementToast(id: AchievementId) {
    sfx('fanfare');
    this.toast('🏆 ' + t(`ach.${id}` as MessageKey), '#FFFFFF', t('results.unlocked'));
  }

  private toast(title: string, color: string, sub?: string) {
    const y = this.toastY;
    this.toastY += 110;
    const c = this.add.container(W + 400, y);
    const g = this.add.graphics();
    g.fillStyle(0x2a2056, 0.96);
    g.fillRoundedRect(-380, 0, 380, 96, 28);
    g.lineStyle(4, 0xffd54a, 1);
    g.strokeRoundedRect(-380, 0, 380, 96, 28);
    c.add(g);
    if (sub) c.add(text(this, -190, 28, sub, 18, '#CFC7EF', { stroke: null }));
    c.add(text(this, -190, sub ? 62 : 48, title, 26, color, { strokeThickness: 5, weight: 700, wrap: 350 }));
    this.tweens.add({ targets: c, x: W - 24, duration: 450, ease: 'Back.out' });
    this.tweens.add({
      targets: c,
      x: W + 420,
      delay: 3600,
      duration: 350,
      ease: 'Back.in',
      onComplete: () => {
        c.destroy();
        this.toastY = Math.max(150, this.toastY - 110);
      },
    });
  }
}
