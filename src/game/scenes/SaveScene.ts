import Phaser from 'phaser';
import type { KnownIds, SavedLocation } from '../../core/save/index.js';
import { ITEMS } from '../../data/items.js';
import { MAP_IDS, MAP_NAMES, type MapId } from '../../data/maps.js';
import { RELICS } from '../../data/relics.js';
import { zonesForMap } from '../../data/zones.js';
import { zoneAt } from '../../core/world/zone.js';
import { captureSave, restoreSave } from '../partyStore.js';
import { elapsedMs, formatPlaytime, setElapsed } from '../playtime.js';
import {
  SLOT_COUNT,
  browserStorage,
  clearSlot,
  readAllSlots,
  writeSlot,
  type SlotState,
} from '../save/storage.js';
import { markSaveScreen, markScene } from '../domState.js';
import { SAVE_KEYS, hintLine } from '../../data/keys.js';
import { bindSceneKeys, type BoundKeys } from '../keys.js';
import type { OverworldEntry } from './OverworldScene.js';

/**
 * 세이브 슬롯 화면 (GDD §6.5, T-038).
 *
 * 저장과 불러오기가 **같은 화면**이다. 슬롯 목록을 두 번 만들 이유가 없고,
 * 저장하러 들어와서 "아, 저건 지우자" 가 되는 흐름이 자연스럽다.
 *
 * **깨진 슬롯을 감추지 않는다.** 빈 슬롯처럼 보이면 플레이어는 세이브가 사라졌다고 생각한다.
 * 덮어쓰기 전에 "여기 뭔가 있었는데 못 읽는다" 를 알려주는 편이 정직하다.
 */

const LINE = 26;

export interface SaveEntry {
  /** `save` 는 탐색 중, `load` 는 타이틀에서. 돌아갈 곳이 다르다. */
  readonly mode: 'save' | 'load';
  readonly returnTo?: OverworldEntry;
  /** 저장할 위치. `save` 모드에서 필수다. */
  readonly location?: SavedLocation;
}

function knownIds(): KnownIds {
  return { relics: Object.keys(RELICS), maps: [...MAP_IDS], items: Object.keys(ITEMS) };
}

export class SaveScene extends Phaser.Scene {
  private mode: 'save' | 'load' = 'load';
  private returnTo: OverworldEntry | undefined;
  private location: SavedLocation | undefined;

  private slots: readonly SlotState[] = [];
  private index = 0;

  private slotTexts: Phaser.GameObjects.Text[] = [];
  private noticeText!: Phaser.GameObjects.Text;
  private cursor!: Phaser.GameObjects.Text;
  private keys: BoundKeys = {};

  constructor() {
    super('save');
  }

  init(entry?: SaveEntry): void {
    this.mode = entry?.mode ?? 'load';
    this.returnTo = entry?.returnTo;
    this.location = entry?.location;
  }

  create(): void {
    markScene('save');
    this.index = 0;

    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x10131b).setOrigin(0, 0);
    this.add.text(8, 6, this.mode === 'save' ? '저장' : '이어하기', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#c8a15a',
    });
    this.add
      .text(472, 8, hintLine(SAVE_KEYS), {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#6f7b8a',
      })
      .setOrigin(1, 0);

    this.add
      .rectangle(8, 28, 464, LINE * SLOT_COUNT + 12, 0x0b0c10)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x6f7b8a);

    // 슬롯마다 별도의 Text 를 정해진 y 에 둔다. 한 덩어리로 그리면 줄 수가 슬롯마다 달라져
    // (`ok` 는 두 줄, `empty` 는 한 줄) 커서가 어긋난다.
    this.slotTexts = Array.from({ length: SLOT_COUNT }, (_, index) =>
      this.add.text(28, 36 + index * LINE, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#e8e3d3',
        lineSpacing: 3,
      }),
    );

    this.cursor = this.add.text(16, 36, '>', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#c8a15a',
    });

    this.noticeText = this.add.text(8, 40 + LINE * SLOT_COUNT + 12, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#d08a6a',
      wordWrap: { width: 464 },
    });

    this.bindKeys();
    this.refresh();

    if (browserStorage() === undefined) {
      this.notice('이 브라우저에서는 저장할 수 없다 (사생활 보호 모드이거나 저장소가 꺼져 있다)');
    }
  }

  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (keyboard === null) return;
    this.keys = bindSceneKeys(keyboard, SAVE_KEYS);
  }

  private pressed(...names: readonly string[]): boolean {
    return names.some((name) =>
      (this.keys[name] ?? []).some((key) => Phaser.Input.Keyboard.JustDown(key)),
    );
  }

  override update(): void {
    if (this.pressed('cancel')) {
      this.close();
      return;
    }
    if (this.pressed('down')) {
      this.index = (this.index + 1) % SLOT_COUNT;
      this.refresh();
      return;
    }
    if (this.pressed('up')) {
      this.index = (this.index - 1 + SLOT_COUNT) % SLOT_COUNT;
      this.refresh();
      return;
    }
    if (this.pressed('erase')) {
      this.erase();
      return;
    }
    if (this.pressed('confirm')) this.activate();
  }

  private activate(): void {
    return this.mode === 'save' ? this.saveHere() : this.loadHere();
  }

  private saveHere(): void {
    if (this.location === undefined) {
      this.notice('저장할 위치를 알 수 없다');
      return;
    }

    const now = Date.now();
    const save = captureSave(this.location, { savedAt: now, playtimeMs: elapsedMs(now) });
    const result = writeSlot(this.index, save, browserStorage());

    if (!result.ok) {
      this.notice(`저장하지 못했다: ${result.reason}`);
      return;
    }

    this.notice(`${this.index + 1}번 슬롯에 저장했다`);
    this.refresh();
  }

  /**
   * 불러오기.
   *
   * 검증은 `readSlot` 이 이미 했다 — 여기 도달한 세이브는 스키마도 참조도 통과한 것이다.
   * 깨진 슬롯은 애초에 `kind: 'ok'` 가 아니다.
   */
  private loadHere(): void {
    const slot = this.slots[this.index];
    if (slot === undefined || slot.kind !== 'ok') {
      this.notice(slot?.kind === 'broken' ? '이 슬롯은 읽을 수 없다' : '빈 슬롯이다');
      return;
    }

    const save = slot.save;
    restoreSave(save);
    setElapsed(save.playtimeMs, Date.now());

    this.scene.start('overworld', {
      mapId: save.location.mapId as MapId,
      arrival: {
        position: { x: save.location.x, y: save.location.y },
        facing: save.location.facing,
      },
    } satisfies OverworldEntry);
  }

  private erase(): void {
    const slot = this.slots[this.index];
    if (slot === undefined || slot.kind === 'empty') return;

    clearSlot(this.index, browserStorage());
    this.notice(`${this.index + 1}번 슬롯을 지웠다`);
    this.refresh();
  }

  private close(): void {
    if (this.mode === 'save') {
      this.scene.start('overworld', this.returnTo ?? {});
    } else {
      this.scene.start('title');
    }
  }

  private notice(text: string): void {
    this.noticeText.setText(text);
  }

  // ── 표현 ────────────────────────────────────────────────────────────────

  private refresh(): void {
    this.slots = readAllSlots(browserStorage(), knownIds());

    this.slots.forEach((slot, index) => {
      this.slotTexts[index]?.setText(`${index + 1}  ${describeSlot(slot)}`);
    });
    this.cursor.setY(36 + this.index * LINE);

    markSaveScreen({
      mode: this.mode,
      slot: this.index,
      states: this.slots.map((slot) => slot.kind),
    });
  }
}

/** 슬롯 한 줄. 어디까지 갔고 얼마나 했는지가 슬롯을 고르는 근거다. */
function describeSlot(slot: SlotState): string {
  if (slot.kind === 'empty') return '(비어 있음)';
  if (slot.kind === 'broken') return `(읽을 수 없음 — ${slot.reason})`;

  const { location, playtimeMs, savedAt } = slot.save;
  const mapName = MAP_NAMES[location.mapId as MapId] ?? location.mapId;
  const zone = zoneAt(zonesForMap(location.mapId as MapId), location.x, location.y);
  const where = zone === undefined ? mapName : `${mapName} · ${zone.name}`;

  return `${where}\n   ${formatStamp(savedAt)}   플레이 ${formatPlaytime(playtimeMs)}`;
}

/** `08-05 21:58`. 연도는 슬롯을 고르는 데 도움이 안 된다. */
function formatStamp(epochMs: number): string {
  const at = new Date(epochMs);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
