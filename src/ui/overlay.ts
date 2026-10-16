import type Phaser from 'phaser';
import { sfx } from '../audio/sfx';

/** Tiny DOM builder: h('div', { class: 'x', onclick }, child, 'text'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export const svgNS = 'http://www.w3.org/2000/svg';
export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const el = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

let game: Phaser.Game | null = null;
const stack: { el: HTMLElement; close: () => void }[] = [];

export function bindGame(g: Phaser.Game) {
  game = g;
}

export function isModalOpen() {
  return stack.length > 0;
}

function setGameInput(enabled: boolean) {
  if (!game) return;
  if (game.input.keyboard) game.input.keyboard.enabled = enabled;
  // Key-ups are dropped while disabled, so release every key or the hero keeps running.
  for (const scene of game.scene.getScenes(false)) scene.input?.keyboard?.resetKeys();
  window.dispatchEvent(new CustomEvent('hq:modal', { detail: !enabled }));
}

/** Opens a modal dialog. The game stops listening to the keyboard while it is open. */
export function openModal(
  build: (close: () => void) => HTMLElement,
  opts: { onClose?: () => void; label?: string } = {},
): () => void {
  const prevFocus = document.activeElement as HTMLElement | null;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    sfx('close');
    wrapper.remove();
    document.removeEventListener('keydown', onKey, true);
    const i = stack.findIndex((m) => m.el === wrapper);
    if (i >= 0) stack.splice(i, 1);
    if (!stack.length) setGameInput(true);
    prevFocus?.focus?.();
    opts.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (stack[stack.length - 1]?.el !== wrapper) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      trapFocus(e, wrapper);
    }
  };
  const card = build(close);
  const wrapper = h('div', { class: 'hq-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.label ?? '' }, card);
  wrapper.addEventListener('pointerdown', (e) => {
    if (e.target === wrapper) close();
  });
  document.body.append(wrapper);
  document.addEventListener('keydown', onKey, true);
  stack.push({ el: wrapper, close });
  setGameInput(false);
  sfx('open');
  requestAnimationFrame(() => {
    const first = card.querySelector<HTMLElement>('[autofocus]') ?? card.querySelector<HTMLElement>('button, input, select, [tabindex]');
    first?.focus();
  });
  return close;
}

export function closeAllModals() {
  for (const m of [...stack].reverse()) m.close();
}

function trapFocus(e: KeyboardEvent, root: HTMLElement) {
  const items = [...root.querySelectorAll<HTMLElement>('button, input, select, a[href], [tabindex]:not([tabindex="-1"])')].filter(
    (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
  );
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

// ---------- loading ----------

let loadingEl: HTMLElement | null = null;

export function showLoading(message: string) {
  if (!loadingEl) {
    loadingEl = h('div', { class: 'hq-loading', role: 'status', 'aria-live': 'polite' }, h('div', { class: 'box' }, h('div', { class: 'hq-coin' }, '€'), h('div', { class: 'msg' })));
    document.body.append(loadingEl);
    setGameInput(false);
  }
  loadingEl.querySelector('.msg')!.textContent = message;
}

export function hideLoading() {
  loadingEl?.remove();
  loadingEl = null;
  if (!stack.length) setGameInput(true);
}

// ---------- toasts ----------

let toastHost: HTMLElement | null = null;

export function toast(message: string, ms = 2800) {
  if (!toastHost) {
    toastHost = h('div', { class: 'hq-toasts', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  const el = h('div', { class: 'hq-toast' }, message);
  toastHost.append(el);
  setTimeout(() => el.remove(), ms);
}

// ---------- tooltip ----------

let tip: HTMLElement | null = null;

export function showTip(x: number, y: number, content: string) {
  if (!tip) {
    tip = h('div', { class: 'hq-tooltip', role: 'tooltip' });
    document.body.append(tip);
  }
  tip.textContent = content;
  const r = tip.getBoundingClientRect();
  tip.style.left = `${Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2))}px`;
  tip.style.top = `${Math.max(8, y - r.height - 12)}px`;
}

export function hideTip() {
  tip?.remove();
  tip = null;
}
