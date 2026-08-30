import Phaser from 'phaser';
import { MENU_KEYS, OVERWORLD_KEYS, hintLine, keyName } from '../../data/keys.js';
import { coinCount, partyProgress } from '../partyStore.js';
import { elapsedMs, formatPlaytime } from '../playtime.js';
import { markMenu, markScene } from '../domState.js';
import { bindSceneKeys, type BoundKeys } from '../keys.js';
import { getTouchControls } from '../ui/TouchControls.js';
import type { OverworldEntry } from './OverworldScene.js';
import type { SavedLocation } from '../../core/save/index.js';
import type { SceneKey } from '../domState.js';

/**
 * 메뉴 (T-060).
 *
 * **화면마다 단축키를 하나씩 늘리는 것은 한계가 있다.** R·F·C·H 넷까지 왔는데 화면이
 * 더 생기면 외울 것만 늘어난다. 여기서 전부 갈 수 있으면 단축키를 몰라도 막히지 않는다.
 *
 * 단축키는 그대로 둔다 — **아는 사람을 위한 지름길**이고, 없애면 익힌 손이 헛돈다.
 * 그래서 각 항목 옆에 그 지름길을 적어둔다. 메뉴를 쓰다 보면 저절로 외워진다.
 */

const LINE = 18;
const ROW_X = 40;

interface MenuItem {
  readonly label: string;
  /** `close` 는 탐색으로 돌아간다. `help` 는 돌아가면서 안내를 펼친다. */
  readonly scene: SceneKey | 'close' | 'help';
  /** 이 화면으로 가는 지름길. 메뉴가 단축키를 가르치는 자리가 된다. */
  readonly shortcut: string | undefined;
  /**
   * 세이브 화면의 모드 (T-064).
   *
   * **반드시 적는다.** 안 넘기면 `SaveScene` 이 기본값 `load` 를 쓰는데, 그래서
   * 메뉴의 "저장" 이 불러오기 화면을 열고 있었다 — 화면이 비슷하게 생겨서 눈에도 안 띈다.
   */
  readonly mode?: 'save' | 'load';
}

const ITEMS: readonly MenuItem[] = [
  { label: '인물', scene: 'status', shortcut: undefined },
  { label: '유물 장착', scene: 'relic', shortcut: OVERWORLD_KEYS.relic.keys[0] },
  { label: '유물 도감', scene: 'codex', shortcut: OVERWORLD_KEYS.codex.keys[0] },
  { label: '저장', scene: 'save', shortcut: OVERWORLD_KEYS.save.keys[0], mode: 'save' },
  // 불러오기는 단축키가 없다 — 탐색 중에 실수로 누르면 지금까지의 진행이 날아간다.
  { label: '이어하기', scene: 'save', shortcut: undefined, mode: 'load' },
  { label: '조작 안내', scene: 'help', shortcut: OVERWORLD_KEYS.help.keys[0] },
  { label: '돌아가기', scene: 'close', shortcut: undefined },
];

export interface MenuEntry {
  readonly returnTo?: OverworldEntry;
}

export class MenuScene extends Phaser.Scene {
  private returnTo: OverworldEntry | undefined;
  private index = 0;

  private rows: Phaser.GameObjects.Text[] = [];
  private cursor!: Phaser.GameObjects.Text;
  private keys: BoundKeys = {};

  constructor() {
    super('menu');
  }

  init(entry?: MenuEntry): void {
    this.returnTo = entry?.returnTo;
  }

  create(): void {
    markScene('menu');
    this.index = 0;

    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x10131b).setOrigin(0, 0);
    this.add.text(8, 6, '메뉴', { fontFamily: 'monospace', fontSize: '13px', color: '#c8a15a' });
    this.add
      .text(472, 8, hintLine(MENU_KEYS), {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#6f7b8a',
      })
      .setOrigin(1, 0);

    this.add
      .rectangle(24, 30, 216, LINE * ITEMS.length + 16, 0x0b0c10)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x6f7b8a);

    this.rows = ITEMS.map((item, i) => {
      const y = 40 + i * LINE;
      if (item.shortcut !== undefined) {
        this.add
          .text(224, y + 2, keyName(item.shortcut), {
            fontFamily: 'monospace',
            fontSize: '9px',
            color: '#6f7b8a',
          })
          .setOrigin(1, 0);
      }
      return this.add.text(ROW_X, y, item.label, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#e8e3d3',
      });
    });

    this.cursor = this.add.text(28, 40, '>', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#c8a15a',
    });

    // 여정의 요약. 메뉴를 여는 이유의 절반은 "지금 어디까지 왔나" 를 보는 것이다.
    this.summary();

    this.bindKeys();
    this.render();
  }

  private summary(): void {
    const progress = partyProgress();
    this.add
      .rectangle(256, 30, 216, LINE * ITEMS.length + 16, 0x0b0c10)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x6f7b8a);

    const lines = [
      `레벨    ${progress.level}`,
      `경험치  ${progress.into}${progress.need === undefined ? ' (최고)' : ` / ${progress.need}`}`,
      `은편    ${coinCount()}`,
      `플레이  ${formatPlaytime(elapsedMs(Date.now()))}`,
    ];
    this.add.text(272, 40, lines.join('\n'), {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#e8e3d3',
      lineSpacing: 7,
    });
  }

  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (keyboard === null) return;
    this.keys = bindSceneKeys(keyboard, MENU_KEYS);
    getTouchControls().setKeys(MENU_KEYS);
  }

  private pressed(name: string): boolean {
    return (this.keys[name] ?? []).some((key) => Phaser.Input.Keyboard.JustDown(key));
  }

  override update(): void {
    if (this.pressed('cancel')) {
      this.close();
      return;
    }

    const step = this.pressed('down') ? 1 : this.pressed('up') ? -1 : 0;
    if (step !== 0) {
      this.index = (this.index + step + ITEMS.length) % ITEMS.length;
      this.render();
      return;
    }

    if (this.pressed('confirm')) this.activate();
  }

  private activate(): void {
    const item = ITEMS[this.index];
    if (item === undefined) return;

    if (item.scene === 'close') {
      this.close();
      return;
    }

    // 조작 안내는 씬이 아니라 탐색 화면의 겹침이다. 돌아가면서 펼쳐달라고 넘긴다.
    if (item.scene === 'help') {
      this.scene.start('overworld', { ...this.returnTo, openHelp: true } satisfies OverworldEntry);
      return;
    }

    // 어느 화면이든 돌아올 곳을 그대로 넘긴다. 메뉴를 거쳤다고 제자리를 잃으면 안 된다.
    // 저장 화면은 모드까지 넘긴다 — 생략하면 저장하러 들어가서 불러오기 화면을 만난다.
    this.scene.start(item.scene, {
      returnTo: this.returnTo,
      ...(item.mode === undefined ? {} : { mode: item.mode, location: this.location() }),
    });
  }

  /**
   * 저장할 자리.
   *
   * **돌아갈 곳이 곧 지금 서 있는 곳이다.** 위치를 따로 들고 다니면 둘이 어긋날 수 있는데,
   * 메뉴는 걸음을 멈춘 자리에서만 열리므로 하나로 충분하다.
   */
  private location(): SavedLocation | undefined {
    const mapId = this.returnTo?.mapId;
    const arrival = this.returnTo?.arrival;
    if (mapId === undefined || arrival === undefined) return undefined;

    return { mapId, x: arrival.position.x, y: arrival.position.y, facing: arrival.facing };
  }

  private close(): void {
    this.scene.start('overworld', this.returnTo ?? {});
  }

  private render(): void {
    this.cursor.setY(40 + this.index * LINE);
    this.rows.forEach((row, i) => row.setColor(i === this.index ? '#c8a15a' : '#e8e3d3'));
    markMenu(ITEMS[this.index]?.label ?? 'none');
  }
}
