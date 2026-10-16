import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { burst } from './fx';

export interface HeroInput {
  left: boolean;
  right: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
}

const RUN_SPEED = 470;
const JUMP_VELOCITY = 1060;
const COYOTE = 0.1;
const BUFFER = 0.13;

/** Pip the piggy bank: platformer movement with coyote time, jump buffering and juice. */
export class Hero {
  readonly sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  /** World x the hero walks to after a click; null when steering with the keyboard. */
  target: number | null = null;
  frozen = false;
  private coyote = 0;
  private buffer = 0;
  private wasOnGround = false;
  private frameTimer = 0;
  private frame = 0;
  private blinkIn = 3;
  private autoJump = false;
  private lastFallSpeed = 0;
  private mood: string | null = null;

  constructor(private readonly scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.physics.add.sprite(x, y, 'pig').setDepth(50);
    this.sprite.body.setSize(60, 64).setOffset(26, 34);
    this.sprite.setCollideWorldBounds(true);
    this.sprite.setMaxVelocity(RUN_SPEED, 1500);
  }

  get body() {
    return this.sprite.body;
  }

  get onGround() {
    return this.body.blocked.down || this.body.touching.down;
  }

  /** Temporary face, e.g. happy after a summit. */
  setMood(texture: string | null, ms = 800) {
    this.mood = texture;
    if (texture) this.scene.time.delayedCall(ms, () => (this.mood = null));
  }

  update(dt: number, input: HeroInput) {
    const body = this.body;
    const onGround = this.onGround;
    if (this.frozen) {
      body.setAccelerationX(0);
      body.setDragX(3600);
      this.animate(dt, onGround);
      this.wasOnGround = onGround;
      return;
    }

    this.coyote = onGround ? COYOTE : this.coyote - dt;
    this.buffer = input.jumpPressed ? BUFFER : this.buffer - dt;

    let dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0) this.target = null;
    if (dir === 0 && this.target !== null) {
      const dx = this.target - this.sprite.x;
      if (Math.abs(dx) > 14) dir = Math.sign(dx);
      else this.target = null;
      // Climb automatically when a step blocks the path.
      if (this.target !== null && onGround && ((dir > 0 && body.blocked.right) || (dir < 0 && body.blocked.left))) {
        this.buffer = BUFFER;
        this.autoJump = true;
      }
    }

    if (dir !== 0) {
      const turning = Math.sign(body.velocity.x) !== dir && Math.abs(body.velocity.x) > 40;
      body.setAccelerationX(dir * (onGround ? 4200 : 2600) * (turning ? 1.8 : 1));
      this.sprite.setFlipX(dir < 0);
    } else {
      body.setAccelerationX(0);
      body.setDragX(onGround ? 4000 : 900);
    }

    let jumped = false;
    if (this.buffer > 0 && this.coyote > 0) {
      jumped = true;
      body.setVelocityY(-JUMP_VELOCITY);
      this.buffer = 0;
      this.coyote = 0;
      sfx('jump', { pitch: 0.95 + Math.random() * 0.1 });
      this.squash(0.82, 1.22);
      this.dust(4);
    }
    // Variable jump height: releasing early caps the upward speed.
    if (!jumped && !input.jumpHeld && !this.autoJump && body.velocity.y < -560) body.setVelocityY(-560);
    if (onGround && !jumped) this.autoJump = false;

    if (!onGround) this.lastFallSpeed = body.velocity.y;
    if (onGround && !this.wasOnGround && this.lastFallSpeed > 350) {
      const k = Math.min(1, this.lastFallSpeed / 1200);
      this.squash(1 + 0.3 * k, 1 - 0.25 * k);
      this.dust(6 + Math.round(6 * k));
      sfx('land', { volume: 0.5 + k * 0.5 });
    }
    this.wasOnGround = onGround;
    this.animate(dt, onGround);
  }

  private animate(dt: number, onGround: boolean) {
    const speed = Math.abs(this.body.velocity.x);
    if (this.mood) {
      this.sprite.setTexture(this.mood);
      return;
    }
    if (!onGround) {
      this.sprite.setTexture(this.body.velocity.y < 0 ? 'pig-walk1' : 'pig-walk2');
      return;
    }
    if (speed > 40) {
      this.frameTimer += dt * (0.6 + speed / RUN_SPEED);
      if (this.frameTimer > 0.11) {
        this.frameTimer = 0;
        this.frame = (this.frame + 1) % 2;
        if (this.frame === 0) sfx('step', { volume: 0.6 });
        if (Math.random() < 0.25) this.dust(1);
      }
      this.sprite.setTexture(this.frame ? 'pig-walk1' : 'pig-walk2');
      this.sprite.setAngle(Math.sin(this.scene.time.now / 60) * 3);
      return;
    }
    this.sprite.setAngle(0);
    this.blinkIn -= dt;
    if (this.blinkIn < 0) {
      this.sprite.setTexture('pig-blink');
      if (this.blinkIn < -0.13) this.blinkIn = 2 + Math.random() * 3;
    } else this.sprite.setTexture('pig');
  }

  squash(sx: number, sy: number) {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setScale(sx, sy);
    this.scene.tweens.add({ targets: this.sprite, scaleX: 1, scaleY: 1, duration: 260, ease: 'Back.out' });
  }

  dust(n: number) {
    burst(this.scene, this.sprite.x, this.body.bottom - 2, 'dot', {
      count: n,
      tint: 0xe8d5b5,
      speed: [40, 140],
      angle: [190, 350],
      scale: [0.9, 0],
      lifespan: 450,
      gravityY: -60,
      depth: 49,
    });
  }
}
