import Phaser from 'phaser';

/**
 * 얇은 수치 막대.
 *
 * HP·MP·침식이 같은 모양을 쓰되 색만 다르다. 침식은 **찰수록 나쁜** 값이라
 * 호출부에서 비율을 뒤집지 않고 그대로 넘긴다 — 색으로 구분하는 편이 오해가 적다.
 */
export class Gauge {
  private readonly fill: Phaser.GameObjects.Rectangle;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly width: number,
    height: number,
    color: number,
  ) {
    scene.add.rectangle(x, y, width, height, 0x0b0c10).setOrigin(0, 0).setStrokeStyle(1, 0x3a4657);
    this.fill = scene.add.rectangle(x + 1, y + 1, width - 2, height - 2, color).setOrigin(0, 0);
  }

  /** 0~1 비율. 범위를 벗어난 값은 잘라낸다 — 침식이 상한을 넘어도 막대가 삐져나오지 않는다. */
  setRatio(ratio: number): void {
    const clamped = Math.min(Math.max(ratio, 0), 1);
    this.fill.setDisplaySize(Math.max(0, (this.width - 2) * clamped), this.fill.height);
    this.fill.setVisible(clamped > 0);
  }
}
