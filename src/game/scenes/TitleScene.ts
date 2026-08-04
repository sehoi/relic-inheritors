import Phaser from 'phaser';
import { markScene } from '../sceneMarker.js';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('title');
  }

  create(): void {
    markScene('title');

    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2 - 32, 'RELIC INHERITORS', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#e8e3d3',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 4, 'the glyphs remember what we forgot', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#6f7b8a',
      })
      .setOrigin(0.5);

    const prompt = this.add
      .text(width / 2, height - 64, 'PRESS ENTER', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#c8a15a',
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: prompt,
      alpha: 0.25,
      duration: 900,
      yoyo: true,
      repeat: -1,
    });

    this.input.keyboard?.once('keydown-ENTER', () => {
      this.scene.start('overworld');
    });
  }
}
