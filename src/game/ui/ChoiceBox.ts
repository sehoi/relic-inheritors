import Phaser from 'phaser';

/**
 * 고르는 창 (T-042, T-048).
 *
 * **대화는 읽는 것이고 이건 고르는 것이다.** 그래서 `TextBox` 와 나눴다 — 대화 스크립트에
 * 선택지를 넣으면 스키마가 커지는데, 정작 필요한 곳은 "값을 치를까" 와 "여기서 다시
 * 시작할까" 처럼 **대사가 아니라 갈림길**인 자리들이다.
 *
 * 두 곳이 같은 것을 쓴다:
 * - 여관·상점에서 **묻지 않고 값을 치르던 것** (T-048)
 * - 전멸했을 때 **타이틀로 튕기던 것** (T-042)
 */
const MARGIN = 8;
const PADDING = 8;
const LINE = 15;

export class ChoiceBox {
  private readonly root: Phaser.GameObjects.Container;
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly promptText: Phaser.GameObjects.Text;
  private readonly optionTexts: Phaser.GameObjects.Text[];
  private readonly cursor: Phaser.GameObjects.Text;

  private options: readonly string[] = [];
  private index = 0;
  private resolve: ((index: number) => void) | undefined;

  /** 한 번에 보여줄 수 있는 선택지 수. 지금 쓰는 곳은 전부 둘이다. */
  private static readonly MAX = 3;

  constructor(scene: Phaser.Scene) {
    const width = scene.scale.width - MARGIN * 2;
    const height = PADDING * 2 + 16 + LINE * ChoiceBox.MAX;
    const top = scene.scale.height - height - MARGIN;

    this.background = scene.add
      .rectangle(0, 0, width, height, 0x0b0c10, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x6f7b8a);

    this.promptText = scene.add.text(PADDING, PADDING, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#e8e3d3',
    });

    this.optionTexts = Array.from({ length: ChoiceBox.MAX }, (_, i) =>
      scene.add.text(PADDING + 18, PADDING + 20 + i * LINE, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#e8e3d3',
      }),
    );

    this.cursor = scene.add.text(PADDING + 4, PADDING + 20, '>', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#c8a15a',
    });

    this.root = scene.add
      .container(MARGIN, top, [this.background, this.promptText, ...this.optionTexts, this.cursor])
      .setScrollFactor(0)
      .setDepth(1100)
      .setVisible(false);
  }

  get isOpen(): boolean {
    return this.resolve !== undefined;
  }

  /**
   * 묻는다. 고른 항목의 번호로 이어진다.
   *
   * **닫는 방법을 항상 준다** — 취소는 마지막 항목으로 본다. 되돌릴 수 없는 일을
   * 묻는 창인데 빠져나갈 길이 없으면 그건 확인이 아니라 강요다.
   */
  ask(prompt: string, options: readonly string[], onPick: (index: number) => void): void {
    this.options = options.slice(0, ChoiceBox.MAX);
    this.index = 0;
    this.resolve = onPick;

    this.promptText.setText(prompt);
    this.optionTexts.forEach((text, i) => text.setText(this.options[i] ?? ''));
    this.root.setVisible(true);
    this.render();
  }

  /** 씬의 `update` 에서 부른다. 골랐으면 `true` — 그 프레임의 다른 입력은 무시해야 한다. */
  handle(input: {
    readonly up: boolean;
    readonly down: boolean;
    readonly confirm: boolean;
    readonly cancel: boolean;
  }): boolean {
    if (this.resolve === undefined) return false;

    if (input.cancel) {
      this.pick(this.options.length - 1);
      return true;
    }
    if (input.confirm) {
      this.pick(this.index);
      return true;
    }

    const step = input.down ? 1 : input.up ? -1 : 0;
    if (step !== 0 && this.options.length > 0) {
      this.index = (this.index + step + this.options.length) % this.options.length;
      this.render();
    }
    return true;
  }

  private pick(index: number): void {
    const onPick = this.resolve;
    // **먼저 닫고 부른다.** 콜백이 씬을 바꿀 수 있는데 그때 창이 남아 있으면 다음 화면에 얹힌다.
    this.resolve = undefined;
    this.root.setVisible(false);
    onPick?.(Math.max(0, index));
  }

  private render(): void {
    this.cursor.setY(PADDING + 20 + this.index * LINE);
    this.optionTexts.forEach((text, i) =>
      text.setColor(i === this.index ? '#c8a15a' : '#e8e3d3'),
    );
  }
}
