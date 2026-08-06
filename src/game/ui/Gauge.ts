import Phaser from 'phaser';

/**
 * 얇은 수치 막대.
 *
 * HP·MP·침식이 같은 모양을 쓰되 색만 다르다. 침식은 **찰수록 나쁜** 값이라
 * 호출부에서 비율을 뒤집지 않고 그대로 넘긴다 — 색으로 구분하는 편이 오해가 적다.
 */
export class Gauge {
  private readonly frame: Phaser.GameObjects.Rectangle;
  private readonly fill: Phaser.GameObjects.Rectangle;
  private hidden = false;
  private ratio = 1;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly width: number,
    height: number,
    color: number,
  ) {
    this.frame = scene.add
      .rectangle(x, y, width, height, 0x0b0c10)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3a4657);
    this.fill = scene.add.rectangle(x + 1, y + 1, width - 2, height - 2, color).setOrigin(0, 0);
  }

  /** 쓰러진 적의 막대는 통째로 감춘다. 빈 막대만 남으면 아직 있는 것처럼 보인다. */
  setVisible(visible: boolean): void {
    this.hidden = !visible;
    this.apply();
  }

  /** 0~1 비율. 범위를 벗어난 값은 잘라낸다 — 침식이 상한을 넘어도 막대가 삐져나오지 않는다. */
  setRatio(ratio: number): void {
    this.ratio = Math.min(Math.max(ratio, 0), 1);
    this.apply();
  }

  /**
   * 두 값을 한곳에서 반영한다.
   *
   * 각자 `fill.setVisible` 을 부르면 **부르는 순서가 결과를 바꾼다** — 감춘 뒤 비율을
   * 넣으면 다시 나타나고, 반대면 안 나타난다. 상태를 들고 있다가 함께 적용하면 그 함정이 없다.
   */
  private apply(): void {
    this.frame.setVisible(!this.hidden);
    this.fill.setDisplaySize(Math.max(0, (this.width - 2) * this.ratio), this.fill.height);
    this.fill.setVisible(!this.hidden && this.ratio > 0);
  }
}
