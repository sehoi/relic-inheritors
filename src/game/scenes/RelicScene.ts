import Phaser from 'phaser';
import type { ActorId } from '../../core/battle/index.js';
import {
  SLOTS_PER_MEMBER,
  equip,
  equipBlockReason,
  lockedActives,
  slotsOf,
  unequip,
} from '../../core/relic/index.js';
import { isResonanceActive, missingForResonance } from '../../core/relic/resonance.js';
import { ALL_RESONANCES } from '../../data/resonances.js';
import { relic } from '../../data/relics.js';
import { CHARACTER_SHEET, portraitOf } from '../../data/characters.js';
import {
  currentResonances,
  getLoadout,
  ownedRelics,
  partyMembers,
  relicRanks,
  setLoadout,
} from '../partyStore.js';
import { markRelicScreen, markScene } from '../domState.js';
import { RELIC_KEYS, hintLine } from '../../data/keys.js';
import { windowedLines, type ScrollWindow } from '../../core/ui/scroll.js';
import { bindSceneKeys, type BoundKeys } from '../keys.js';
import type { OverworldEntry } from './OverworldScene.js';

/**
 * 유물 장착 화면 (GDD §6.4, T-029).
 *
 * **조합 설계가 이 게임의 중심이므로 조합이 보여야 한다.** 능력은 유물에서 나오고(ADR-004),
 * 태그 조합이 공명을 만든다(GDD §5.2). 그 판정이 화면에 없으면 플레이어는 조합을
 * 머릿속으로만 계산해야 하고, 그건 아무도 하지 않는다.
 *
 * 그래서 **아직 성립하지 않은 공명과 무엇이 모자란지도 함께 띄운다.** 성립한 것만 보여주면
 * 조합을 우연히 발견해야 하는데, 이 게임에서 그건 핵심 시스템을 숨기는 일이다.
 *
 * 판정은 전부 core 가 한다. 여기서는 입력을 의도로 바꾸고 결과를 글자로 옮긴다.
 */

const LINE = 11;
const PANEL = 0x0b0c10;
const BORDER = 0x6f7b8a;

/** 목록 패널(높이 78) 에 들어가는 줄 수. 이보다 길면 창을 넘긴다. */
const PANEL_ROWS = 6;

/** 얼굴이 서는 자리. 슬롯 글자 오른쪽, 더 있음 표시 왼쪽. */
const PORTRAIT_X = 166;

interface MoreMarkers {
  readonly up: Phaser.GameObjects.Text;
  readonly down: Phaser.GameObjects.Text;
}

const ELEMENT_NAMES: Readonly<Record<string, string>> = {
  fire: '불',
  water: '물',
  thunder: '번개',
  earth: '흙',
  none: '무',
};

const STAT_NAMES: Readonly<Record<string, string>> = {
  maxHp: 'HP',
  maxMp: 'MP',
  atk: 'ATK',
  def: 'DEF',
  mag: 'MAG',
  res: 'RES',
  agi: 'AGI',
  luk: 'LUK',
};

/** 커서가 가리키는 슬롯 하나. 파티원과 슬롯 번호를 함께 들고 다닌다. */
interface SlotRef {
  readonly actorId: ActorId;
  readonly name: string;
  readonly slot: number;
}

export interface RelicEntry {
  /** 닫을 때 돌아갈 곳. 없으면 시작 맵으로 돌아간다. */
  readonly returnTo?: OverworldEntry;
}

export class RelicScene extends Phaser.Scene {
  private returnTo: OverworldEntry | undefined;

  /** 왼쪽(슬롯) 과 오른쪽(지닌 유물) 중 어디를 조작 중인가. */
  private focus: 'slots' | 'relics' = 'slots';
  private slotIndex = 0;
  private relicIndex = 0;

  private slotRefs: readonly SlotRef[] = [];
  private owned: readonly string[] = [];

  private slotText!: Phaser.GameObjects.Text;
  private relicText!: Phaser.GameObjects.Text;
  private detailText!: Phaser.GameObjects.Text;
  private resonanceText!: Phaser.GameObjects.Text;
  private noticeText!: Phaser.GameObjects.Text;
  private slotCursor!: Phaser.GameObjects.Text;
  private relicCursor!: Phaser.GameObjects.Text;
  private slotMore!: MoreMarkers;
  private relicMore!: MoreMarkers;
  private readonly portraits = new Map<ActorId, Phaser.GameObjects.Image>();

  private keys: BoundKeys = {};

  constructor() {
    super('relic');
  }

  init(entry?: RelicEntry): void {
    this.returnTo = entry?.returnTo;
  }

  create(): void {
    markScene('relic');

    this.focus = 'slots';
    this.slotIndex = 0;
    this.relicIndex = 0;
    this.owned = ownedRelics();
    this.slotRefs = partyMembers().flatMap((member) =>
      Array.from({ length: SLOTS_PER_MEMBER }, (_, slot) => ({
        actorId: member.id,
        name: member.name,
        slot,
      })),
    );

    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x10131b).setOrigin(0, 0);
    this.add.text(8, 5, '유물 장착', { fontFamily: 'monospace', fontSize: '12px', color: '#c8a15a' });
    this.add
      .text(472, 6, hintLine(RELIC_KEYS), {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#6f7b8a',
      })
      .setOrigin(1, 0);

    this.slotText = this.panel(8, 22, 176, 78, '파티');
    this.relicText = this.panel(192, 22, 280, 78, '지닌 유물');
    this.detailText = this.panel(8, 106, 464, 68, '고른 유물');
    this.resonanceText = this.panel(8, 180, 464, 76, '공명');

    this.slotCursor = this.marker();
    this.relicCursor = this.marker();
    // 패널 안쪽 위아래 모서리. 목록 글자와 겹치지 않는 자리다.
    this.slotMore = { up: this.moreMarker(180, 24), down: this.moreMarker(180, 91) };
    this.relicMore = { up: this.moreMarker(468, 24), down: this.moreMarker(468, 91) };

    this.noticeText = this.add.text(8, 260, '', {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: '#d08a6a',
    });

    this.drawPortraits();
    this.bindKeys();
    this.render();
  }

  /** 제목 붙은 상자 하나. 안쪽 텍스트를 돌려준다. */
  private panel(x: number, y: number, width: number, height: number, title: string): Phaser.GameObjects.Text {
    this.add.rectangle(x, y, width, height, PANEL).setOrigin(0, 0).setStrokeStyle(1, BORDER);
    this.add.text(x + 6, y - 1, title, {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: '#c8a15a',
    });
    return this.add.text(x + 16, y + 12, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#e8e3d3',
      lineSpacing: 1,
    });
  }

  private marker(): Phaser.GameObjects.Text {
    return this.add.text(0, 0, '>', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#c8a15a',
    });
  }

  /** 창 밖에 더 있음을 알리는 표시. 패널 오른쪽 위아래 모서리에 하나씩 붙는다. */
  private moreMarker(x: number, y: number): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, '', { fontFamily: 'monospace', fontSize: '8px', color: '#c8a15a' })
      .setOrigin(1, 0);
  }

  /**
   * 위아래로 더 있는지를 알린다.
   *
   * **이게 없으면 잘린 목록이 짧은 목록으로 읽힌다** — 유물이 여섯 개뿐이라고 믿게 된다.
   */
  private markMore(pair: MoreMarkers, window: ScrollWindow): void {
    pair.up.setText(window.more.before ? '▲ 위로 더' : '');
    pair.down.setText(window.more.after ? '▼ 아래로 더' : '');
  }

  /**
   * 슬롯 목록 옆에 얼굴을 세워둔다. 누구의 슬롯인지 이름만으로는 눈에 안 들어온다.
   *
   * **창이 넘어가므로 자리를 고정할 수 없다.** 예전에는 파티원 순서대로 고정 y 에 놓았는데,
   * 목록이 여덟 줄이 되어 창을 넘기기 시작하자 얼굴만 제자리에 남아 엉뚱한 줄을 가리켰다.
   * `render` 가 창에 맞춰 다시 놓는다.
   */
  private drawPortraits(): void {
    for (const member of partyMembers()) {
      this.portraits.set(
        member.id,
        this.add
          .image(0, 0, CHARACTER_SHEET.key, portraitOf(member.id))
          .setOrigin(1, 0.5)
          .setVisible(false),
      );
    }
  }

  /** 창 안에 그 사람의 첫 슬롯이 보일 때만, 그 줄 옆에 얼굴을 놓는다. */
  private placePortraits(window: ScrollWindow): void {
    for (const [id, image] of this.portraits) {
      const first = this.slotRefs.findIndex((ref) => ref.actorId === id);
      const visible = first >= window.start && first < window.end;
      image.setVisible(visible);
      if (visible) image.setPosition(PORTRAIT_X, 40 + (first - window.start) * LINE);
    }
  }

  // ── 조작 ────────────────────────────────────────────────────────────────

  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (keyboard === null) return;

    this.keys = bindSceneKeys(keyboard, RELIC_KEYS);
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

    if (this.pressed('left')) {
      this.focus = 'slots';
      this.render();
      return;
    }
    if (this.pressed('right')) {
      this.focus = 'relics';
      this.render();
      return;
    }

    const step = this.pressed('down') ? 1 : this.pressed('up') ? -1 : 0;
    if (step !== 0) {
      this.move(step);
      return;
    }

    if (this.pressed('confirm')) this.activate();
  }

  private move(step: number): void {
    if (this.focus === 'slots') {
      const count = this.slotRefs.length;
      this.slotIndex = (this.slotIndex + step + count) % count;
    } else {
      const count = this.owned.length;
      if (count === 0) return;
      this.relicIndex = (this.relicIndex + step + count) % count;
    }
    this.render();
  }

  /**
   * 슬롯 칸에서는 빼고, 유물 칸에서는 끼운다.
   *
   * 끼울 수 없으면 **사유를 그대로 띄운다.** core 가 이미 문자열로 돌려주므로(ADR-004 주변 규약)
   * 여기서 다시 판단하지 않는다 — 판정이 두 곳에 있으면 반드시 어긋난다.
   */
  private activate(): void {
    const target = this.slotRefs[this.slotIndex];
    if (target === undefined) return;

    if (this.focus === 'slots') {
      this.notice('');
      setLoadout(unequip(getLoadout(), target.actorId, target.slot));
      this.render();
      return;
    }

    const relicId = this.owned[this.relicIndex];
    if (relicId === undefined) return;

    const blocked = equipBlockReason(getLoadout(), target.actorId, target.slot, relicId, this.owned);
    if (blocked !== undefined) {
      this.notice(blocked);
      return;
    }

    this.notice('');
    setLoadout(equip(getLoadout(), target.actorId, target.slot, relicId, this.owned));
    this.render();
  }

  private notice(text: string): void {
    this.noticeText.setText(text);
  }

  private close(): void {
    this.scene.start('overworld', this.returnTo ?? {});
  }

  // ── 표현 ────────────────────────────────────────────────────────────────

  private render(): void {
    const loadout = getLoadout();

    // **두 목록 다 패널보다 길다.** 파티가 넷이면 슬롯이 여덟이고 유물은 열두 종인데
    // 패널에는 여섯 줄이 들어간다. 창을 넘겨 보여주고, 잘렸다는 사실을 화살표로 알린다 —
    // 표시가 없으면 잘린 목록이 짧은 목록으로 읽힌다.
    const slots = windowedLines(
      this.slotRefs.map((ref) => {
        const equipped = slotsOf(loadout, ref.actorId)[ref.slot] ?? null;
        const label = equipped === null ? '(비어 있음)' : relic(equipped).name;
        return `${ref.name} ${ref.slot + 1}  ${label}`;
      }),
      this.slotIndex,
      PANEL_ROWS,
    );
    this.slotText.setText(slots.lines.join('\n'));

    const holders = new Map(
      this.slotRefs
        .map((ref) => [slotsOf(loadout, ref.actorId)[ref.slot] ?? null, ref.name] as const)
        .filter((pair): pair is readonly [string, string] => pair[0] !== null),
    );

    const relics = windowedLines(
      this.owned.map((id) => {
        const entry = relic(id);
        const holder = holders.get(id);
        const where = holder === undefined ? '' : `  — ${holder}`;
        return `${entry.name}  ${entry.tier}등급 ${ELEMENT_NAMES[entry.element] ?? entry.element}${where}`;
      }),
      this.relicIndex,
      PANEL_ROWS,
    );
    this.relicText.setText(relics.lines.join('\n'));

    this.markMore(this.slotMore, slots.window);
    this.markMore(this.relicMore, relics.window);
    this.placePortraits(slots.window);

    // 커서는 **창 안에서의 자리**를 가리킨다. 목록 전체 인덱스로 두면 창이 넘어간 뒤
    // 커서만 패널 밖으로 걸어 나간다.
    this.slotCursor
      .setPosition(14, 34 + (this.slotIndex - slots.window.start) * LINE)
      .setVisible(this.focus === 'slots');
    this.relicCursor
      .setPosition(198, 34 + (this.relicIndex - relics.window.start) * LINE)
      .setVisible(this.focus === 'relics');

    this.renderDetail();
    this.renderResonances();

    markRelicScreen({
      focus: this.focus,
      slot: `${this.slotRefs[this.slotIndex]?.actorId ?? '?'}:${this.slotIndex % SLOTS_PER_MEMBER}`,
      relic: this.owned[this.relicIndex] ?? 'none',
      resonances: currentResonances().map((entry) => entry.id),
    });
  }

  /** 고른 유물의 속내. 등급·태그·보정·액티브·침식 계수·기록을 한 자리에 모은다. */
  private renderDetail(): void {
    const relicId = this.owned[this.relicIndex];
    if (relicId === undefined) {
      this.detailText.setText('지닌 유물이 없다.');
      return;
    }

    const entry = relic(relicId);
    const rank = relicRanks()[relicId] ?? 0;

    const mods = Object.entries(entry.statMods)
      .map(([key, value]) => `${STAT_NAMES[key] ?? key}${value >= 0 ? '+' : ''}${value}`)
      .join(' ');

    const open = entry.actives
      .filter((active) => active.unlockRank <= rank)
      .map((active) => `${active.skill.name}(MP${active.skill.mpCost})`)
      .join(' ');

    const locked = lockedActives(entry, rank)
      .map((active) => `${active.skill.name}(${active.unlockRank}단계)`)
      .join(' ');

    this.detailText.setText(
      [
        `${entry.name}  ${entry.tier}등급 · ${ELEMENT_NAMES[entry.element] ?? entry.element} · [${entry.tags.join(' ')}]  침식 x${entry.erosionFactor}`,
        `${mods === '' ? '보정 없음' : mods}   숙련 ${rank}단계`,
        `${open}${locked === '' ? '' : `   잠김: ${locked}`}`,
        entry.lore,
      ].join('\n'),
    );
  }

  /**
   * 공명 현황.
   *
   * **아직 성립하지 않은 것도 무엇이 모자란지와 함께 띄운다.** 성립한 것만 보여주면
   * 조합을 우연히 발견해야 하고, 그건 핵심 시스템을 숨기는 일이다 (GDD §6.4).
   */
  private renderResonances(): void {
    const equipped = currentResonances();
    const active = new Set(equipped.map((entry) => entry.id));
    const worn = [...new Set(Object.values(getLoadout()).flat())]
      .filter((id): id is string => id !== null)
      .map((id) => relic(id));

    const lines = ALL_RESONANCES.map((resonance) => {
      const on = isResonanceActive(resonance, worn) && active.has(resonance.id);
      if (on) {
        const mods = Object.entries(resonance.statMods)
          .map(([key, value]) => `${STAT_NAMES[key] ?? key}${value >= 0 ? '+' : ''}${value}`)
          .join(' ');
        const relief =
          resonance.erosionRelief === undefined ? '' : ` 침식x${resonance.erosionRelief}`;
        return `● ${resonance.name}  ${mods}${relief}`;
      }

      const missing = missingForResonance(resonance, worn)
        .map((condition) => `${condition.tag} ${condition.count}개`)
        .join(', ');
      return `○ ${resonance.name}  ${missing} 더 필요`;
    });

    this.resonanceText.setText(lines.join('\n'));
  }
}
