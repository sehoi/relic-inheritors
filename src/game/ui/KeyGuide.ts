import Phaser from 'phaser';
import { KEY_GUIDE, guideRows, keyName } from '../../data/keys.js';

/**
 * 조작 안내 (T-055).
 *
 * **내용을 여기에 적지 않는다.** `data/keys.ts` 의 배치를 읽어 그린다 — 안내를 손으로
 * 적어두면 키를 옮긴 사람이 안내까지 고칠 이유가 없어 언젠가 거짓말이 된다.
 *
 * 열고 닫는다. 늘 띄워두기에는 차지하는 자리가 크고, 조작은 한 번 익히면 다시 볼 일이
 * 드물다. 대신 **닫혀 있을 때도 여는 방법만은 화면에 남는다** (`LocationBanner`).
 *
 * **두 열로 나눈다.** 화면이 480x270 인데 여섯 화면의 조작을 한 줄씩 세우면 26줄이라
 * 아래쪽 절반이 화면 밖으로 잘린다. 잘린 안내는 없는 것보다 나쁘다 — 거기까지가
 * 전부라고 읽히기 때문이다.
 */
const LINE = 11;
const PADDING = 8;
// 가장 긴 라벨('저장 · 불러오기')이 키 열을 침범하지 않을 만큼.
const LABEL_WIDTH = 90;
const COLUMN_WIDTH = 210;
const FONT = '9px';

const HEADING_COLOR = '#c8a15a';
const LABEL_COLOR = '#e8e3d3';
const KEY_COLOR = '#9fb3c8';

interface Line {
  readonly label: string;
  readonly keys: string;
  readonly heading: boolean;
}

/** 섹션을 줄 목록으로 편다. 섹션 제목도 한 줄을 차지한다. */
function sections(): readonly (readonly Line[])[] {
  return KEY_GUIDE.map((section) => [
    { label: section.scene, keys: '', heading: true },
    ...guideRows(section.keys).map((row) => ({
      label: row.label,
      keys: row.keys.map(keyName).join(' '),
      heading: false,
    })),
  ]);
}

/**
 * 섹션 단위로 두 열에 나눈다.
 *
 * 줄 단위로 자르면 제목과 내용이 갈라져 "전투" 아래가 비고 다음 열이 항목부터 시작한다.
 */
function columns(): readonly (readonly Line[])[] {
  const all = sections();
  const total = all.reduce((sum, section) => sum + section.length, 0);
  const left: Line[] = [];
  const right: Line[] = [];

  for (const section of all) {
    if (left.length < total / 2) left.push(...section);
    else right.push(...section);
  }
  return [left, right];
}

export class KeyGuide {
  private readonly container: Phaser.GameObjects.Container;
  private open = false;

  constructor(scene: Phaser.Scene) {
    const laidOut = columns();
    const rows = Math.max(...laidOut.map((column) => column.length));
    const height = PADDING * 2 + rows * LINE;
    const width = PADDING * 2 + COLUMN_WIDTH * laidOut.length;

    const children: Phaser.GameObjects.GameObject[] = [
      scene.add
        .rectangle(0, 0, width, height, 0x0b0c10, 0.97)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x6f7b8a),
    ];

    laidOut.forEach((column, index) => {
      const x = PADDING + index * COLUMN_WIDTH;
      column.forEach((line, row) => {
        const y = PADDING + row * LINE;
        children.push(
          scene.add.text(x, y, line.heading ? `— ${line.label} —` : line.label, {
            fontFamily: 'monospace',
            fontSize: FONT,
            color: line.heading ? HEADING_COLOR : LABEL_COLOR,
          }),
        );
        if (!line.heading) {
          children.push(
            scene.add.text(x + LABEL_WIDTH, y, line.keys, {
              fontFamily: 'monospace',
              fontSize: FONT,
              color: KEY_COLOR,
            }),
          );
        }
      });
    });

    const camera = scene.cameras.main;
    this.container = scene.add
      .container(
        Math.round((camera.width - width) / 2),
        Math.round((camera.height - height) / 2),
        children,
      )
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);
  }

  toggle(): boolean {
    this.open = !this.open;
    this.container.setVisible(this.open);
    return this.open;
  }

  get isOpen(): boolean {
    return this.open;
  }
}
