import Phaser from 'phaser';
import { markScene } from '../domState.js';
import { joinMember, resetParty } from '../partyStore.js';
import { joinFullPartyIfRequested } from '../devFlags.js';
import { resetClock, startClock } from '../playtime.js';
import { browserStorage, readAllSlots } from '../save/storage.js';
import type { SaveEntry } from './SaveScene.js';
import type { OverworldEntry } from './OverworldScene.js';

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
      // 파티를 비웠으니 개발용 플래그를 다시 적용한다 (`devFlags`).
      joinFullPartyIfRequested(joinMember);
      resetClock();
      startClock(Date.now());
      /**
       * **빈 값을 명시해서 넘긴다.**
       *
       * 인자를 생략하면 Phaser 가 그 씬에 마지막으로 넘긴 데이터를 그대로 남겨둔다.
       * 그래서 전멸 → 타이틀 → 새로 시작 을 하면 **죽은 자리에서 다시 시작했다** —
       * 파티는 새것인데 위치만 지난 회차의 것이었다.
       */
      this.scene.start('overworld', {} satisfies OverworldEntry);
    });
  }
}
