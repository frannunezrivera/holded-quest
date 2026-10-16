import Phaser from 'phaser';
import { boot, goToWorld } from '../../app';
import { createTextures } from '../art/textures';

export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    createTextures(this);
    void boot().then((ready) => {
      if (ready) goToWorld();
      else this.scene.start('Title');
    });
  }
}
