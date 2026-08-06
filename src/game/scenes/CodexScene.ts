import Phaser from 'phaser';
import { buildCodex, type CodexEntry } from '../../core/relic/codex.js';
import { windowedLines } from '../../core/ui/scroll.js';
import { rankOfRelic } from '../../core/relic/attunement.js';
import { CODEX_KEYS, hintLine } from '../../data/keys.js';
import { ATTUNEMENT, RELICS } from '../../data/relics.js';
import { getAttunement, ownedRelics } from '../partyStore.js';
import { markCodex, markScene } from '../domState.js';
import { bindSceneKeys, type BoundKeys } from '../keys.js';
import type { OverworldEntry } from './OverworldScene.js';

/**
 * 유물 도감 (T-058, GDD §5.4).
 *
 * 장착 화면은 *지금 가진 것*으로 무엇을 할지 묻고, 도감은 *무엇이 있는지*에 답한다.
 * 능력이 유물에서 오는 게임에서(ADR-004) 아직 못 만난 유물이 몇인지 모르면
 * 유적에 더 내려갈 이유가 숫자로 잡히지 않는다.
 *
 * **못 본 유물은 자리만 두고 가린다.** 전부 펼치면 도감이 아니라 설정집이고,
 * 자리까지 없으면 몇 개가 남았는지 알 수 없다. 판정은 `core/relic/codex` 가 한다 —
 * 여기서는 고르고 그린다.
 */

const LINE = 11;
const PANEL = 0x0b0c10;
const BORDER = 0x6f7b8a;

/** 목록 패널에 들어가는 줄 수. 유물이 늘면 창을 넘긴다. */
const LIST_ROWS = 18;

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

export interface CodexEntryParams {
  readonly returnTo?: OverworldEntry;
}

export class CodexScene extends Phaser.Scene {
  private returnTo: OverworldEntry | undefined;
  private index = 0;
  private entries: readonly CodexEntry[] = [];

  private listText!: Phaser.GameObjects.Text;
  private cursor!: Phaser.GameObjects.Text;
  private moreUp!: Phaser.GameObjects.Text;
  private moreDown!: Phaser.GameObjects.Text;
  private detailText!: Phaser.GameObjects.Text;
  private loreText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private keys: BoundKeys = {};

  constructor() {
    super('codex');
  }

  init(entry?: CodexEntryParams): void {
    this.returnTo = entry?.returnTo;
  }

  create(): void {
    markScene('codex');
    this.index = 0;

    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x10131b).setOrigin(0, 0);
    this.add.text(8, 5, '유물 도감', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#c8a15a',
    });
    this.add
      .text(472, 6, hintLine(CODEX_KEYS), {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#6f7b8a',
      })
      .setOrigin(1, 0);

    // 진행률은 도감의 목적 그 자체다 — 몇 개가 남았는지가 유적에 내려갈 이유가 된다.
    this.progressText = this.add.text(80, 7, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#d8b46a',
    });

    this.listText = this.panel(8, 22, 168, 232, '유물');
    this.detailText = this.panel(184, 22, 288, 150, '내용');
    this.loreText = this.panel(184, 180, 288, 74, '기록');
    this.loreText.setWordWrapWidth(258);

    this.cursor = this.add.text(0, 0, '>', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#c8a15a',
    });
    this.moreUp = this.more(170, 24);
    this.moreDown = this.more(170, 244);

    this.bindKeys();
    this.render();
  }

  /** 제목 붙은 상자 하나. 안쪽 텍스트를 돌려준다. */
  private panel(
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
  ): Phaser.GameObjects.Text {
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

  private more(x: number, y: number): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, '', { fontFamily: 'monospace', fontSize: '8px', color: '#c8a15a' })
      .setOrigin(1, 0);
  }

  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (keyboard === null) return;
    this.keys = bindSceneKeys(keyboard, CODEX_KEYS);
  }

  private pressed(name: string): boolean {
    return (this.keys[name] ?? []).some((key) => Phaser.Input.Keyboard.JustDown(key));
  }

  override update(): void {
    if (this.pressed('cancel')) {
      this.scene.start('overworld', this.returnTo ?? {});
      return;
    }

    const step = this.pressed('down') ? 1 : this.pressed('up') ? -1 : 0;
    if (step === 0 || this.entries.length === 0) return;

    this.index = (this.index + step + this.entries.length) % this.entries.length;
    this.render();
  }

  // ── 표현 ────────────────────────────────────────────────────────────────

  private render(): void {
    const codex = buildCodex(RELICS, ownedRelics());
    this.entries = codex.entries;

    this.progressText.setText(`${codex.found} / ${codex.total}`);

    const list = windowedLines(
      codex.entries.map((entry) =>
        entry.relic === undefined
          ? '???'
          : `${entry.relic.name}  ${entry.relic.tier}등급 ${ELEMENT_NAMES[entry.relic.element] ?? entry.relic.element}`,
      ),
      this.index,
      LIST_ROWS,
    );
    this.listText.setText(list.lines.join('\n'));

    this.moreUp.setText(list.window.more.before ? '▲' : '');
    this.moreDown.setText(list.window.more.after ? '▼' : '');
    this.cursor.setPosition(14, 34 + (this.index - list.window.start) * LINE);

    const chosen = this.entries[this.index];
    this.detailText.setText(chosen === undefined ? '' : this.describe(chosen));
    this.loreText.setText(chosen?.relic?.lore ?? '');

    markCodex({
      relic: chosen?.id ?? 'none',
      found: codex.found,
      total: codex.total,
      hidden: chosen?.found !== true,
    });
  }

  /** 아직 못 본 유물은 무엇 하나 말하지 않는다. 등급조차 힌트가 된다. */
  private describe(entry: CodexEntry): string {
    const item = entry.relic;
    if (item === undefined) return '아직 만나지 못했다.\n\n유적 어딘가에 남아 있다.';

    const rank = rankOfRelic(getAttunement(), item.id, ATTUNEMENT);
    const mods = Object.entries(item.statMods ?? {})
      .map(([key, value]) => `${STAT_NAMES[key] ?? key}${value >= 0 ? '+' : ''}${value}`)
      .join(' ');

    const actives = item.actives.map((active) =>
      // 잠긴 스킬도 보여준다. 무엇이 기다리는지 알아야 계속 쓸 이유가 된다 (GDD §5.3).
      active.unlockRank > rank
        ? `${active.skill.name} — ${active.unlockRank}단계에 열린다`
        : `${active.skill.name}(MP${active.skill.mpCost})`,
    );

    return [
      `${item.name}  ${item.tier}등급 · ${ELEMENT_NAMES[item.element] ?? item.element}`,
      `태그 ${item.tags.join(' ')}   침식 x${item.erosionFactor}`,
      mods === '' ? '스탯 보정 없음' : mods,
      `숙련 ${rank}단계`,
      '',
      ...actives,
    ].join('\n');
  }
}
