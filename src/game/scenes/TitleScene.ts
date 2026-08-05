import Phaser from 'phaser';
import { markScene } from '../domState.js';
import { resetParty } from '../partyStore.js';
import { resetClock, startClock } from '../playtime.js';
import { browserStorage, readAllSlots } from '../save/storage.js';
import type { SaveEntry } from './SaveScene.js';

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

    // 이어할 세이브가 있을 때만 안내한다. 없는데 띄우면 눌러보고 빈 화면을 만난다.
    const resumable = readAllSlots(browserStorage()).some((slot) => slot.kind === 'ok');
    if (resumable) {
      this.add
        .text(width / 2, height - 44, 'C — 이어하기', {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#7fc98a',
        })
        .setOrigin(0.5);

      this.input.keyboard?.once('keydown-C', () => {
        this.scene.start('save', { mode: 'load' } satisfies SaveEntry);
      });
    }

    this.input.keyboard?.once('keydown-ENTER', () => {
      // 새로 시작한다. 이전 회차의 상태가 남아 있으면 새 게임이 아니다.
      resetParty();
      resetClock();
      startClock(Date.now());
      this.scene.start('overworld');
    });
  }
}
