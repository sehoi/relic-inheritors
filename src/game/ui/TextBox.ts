import Phaser from 'phaser';
import type { DialoguePage } from '../../core/dialogue/index.js';

/**
 * 대화 상자.
 *
 * 글자 수로 줄바꿈을 계산하므로(`core/dialogue`) 본문은 반드시 고정폭 폰트를 쓴다.
 * 가변폭 폰트를 쓰면 계산과 실제 렌더링이 어긋나 글자가 상자 밖으로 나간다.
 *
 * 크기 상수(`TEXT_BOX_LAYOUT`)는 core 에 있다 — 이유는 그쪽 주석 참조.
 */
const MARGIN = 8;
const HEIGHT = 68;
const PADDING = 8;

export class TextBox {
  private readonly root: Phaser.GameObjects.Container;
  private readonly speakerText: Phaser.GameObjects.Text;
  private readonly bodyText: Phaser.GameObjects.Text;
  private readonly nextMark: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    const width = scene.scale.width - MARGIN * 2;
    const top = scene.scale.height - HEIGHT - MARGIN;

    const background = scene.add.rectangle(0, 0, width, HEIGHT, 0x0b0c10, 0.94).setOrigin(0, 0);
    background.setStrokeStyle(1, 0x6f7b8a);

    this.speakerText = scene.add.text(PADDING, PADDING - 1, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#c8a15a',
    });

    this.bodyText = scene.add.text(PADDING, PADDING + 14, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#e8e3d3',
      lineSpacing: 4,
    });

    this.nextMark = scene.add
      .text(width - PADDING, HEIGHT - PADDING, '▼', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#6f7b8a',
      })
      .setOrigin(1, 1);

    this.root = scene.add.container(MARGIN, top, [
      background,
      this.speakerText,
      this.bodyText,
      this.nextMark,
    ]);

    // 카메라와 함께 움직이지 않도록 고정한다. UI는 월드가 아니라 화면에 붙어 있다.
    this.root.setScrollFactor(0).setDepth(1000).setVisible(false);

    scene.tweens.add({
      targets: this.nextMark,
      alpha: 0.2,
      duration: 700,
      yoyo: true,
      repeat: -1,
    });
  }

  show(page: DialoguePage, isLast: boolean): void {
    this.speakerText.setText(page.speaker ?? '');
    this.bodyText.setText(page.text);
    // 마지막 쪽에서는 "계속" 대신 "닫기"임을 다른 기호로 알린다.
    this.nextMark.setText(isLast ? '■' : '▼');
    this.root.setVisible(true);
  }

  hide(): void {
    this.root.setVisible(false);
  }
}
