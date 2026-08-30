import Phaser from 'phaser';
import type { BattleActor, Stats } from '../../core/battle/index.js';
import { erosionThreshold } from '../../core/battle/skill.js';
import { equippedBy, slotsOf } from '../../core/relic/index.js';
import { CHARACTER_SHEET, portraitOf } from '../../data/characters.js';
import { BATTLE_TUNING, describeAilments } from '../../data/battle.js';
import { STATUS_KEYS, hintLine } from '../../data/keys.js';
import { relic } from '../../data/relics.js';
import { getLoadout, partyForBattle, partyMembers, partyProgress } from '../partyStore.js';
import { markScene, markStatus } from '../domState.js';
import { bindSceneKeys, type BoundKeys } from '../keys.js';
import { getTouchControls } from '../ui/TouchControls.js';
import type { OverworldEntry } from './OverworldScene.js';

/**
 * 인물 정보 (T-061).
 *
 * **유물이 나를 얼마나 바꿨는지 보여주는 것이 이 화면의 요점이다.** 능력이 유물에서
 * 오는 게임에서(ADR-004) 스탯만 늘어놓으면 그 값이 어디서 왔는지 알 수 없다.
 * 그래서 기본값과 보정된 값을 나란히 두고, 차이를 따로 적는다.
 *
 * 장착 화면은 "무엇을 낄까" 를 묻고 여기는 "낀 결과 나는 무엇이 되었나" 에 답한다.
 */

const LINE = 11;
const PANEL = 0x0b0c10;
const BORDER = 0x6f7b8a;

const STAT_ROWS: readonly (readonly [keyof Stats, string])[] = [
  ['maxHp', 'HP'],
  ['maxMp', 'MP'],
  ['atk', '공격'],
  ['def', '방어'],
  ['mag', '마력'],
  ['res', '저항'],
  ['agi', '민첩'],
  ['luk', '행운'],
];

export interface StatusEntry {
  readonly returnTo?: OverworldEntry;
}

export class StatusScene extends Phaser.Scene {
  private returnTo: OverworldEntry | undefined;
  private index = 0;
  private members: readonly BattleActor[] = [];
  private base: readonly BattleActor[] = [];

  private nameTexts: Phaser.GameObjects.Text[] = [];
  private cursor!: Phaser.GameObjects.Text;
  private portrait!: Phaser.GameObjects.Image;
  private statText!: Phaser.GameObjects.Text;
  private vitalText!: Phaser.GameObjects.Text;
  private relicText!: Phaser.GameObjects.Text;
  private keys: BoundKeys = {};

  constructor() {
    super('status');
  }

  init(entry?: StatusEntry): void {
    this.returnTo = entry?.returnTo;
  }

  create(): void {
    markScene('status');
    this.index = 0;
    // 유물 보정을 얹은 것과 얹지 않은 것. 나란히 놓아야 차이가 드러난다.
    this.members = partyForBattle();
    this.base = partyMembers();

    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x10131b).setOrigin(0, 0);
    this.add.text(8, 5, '인물', { fontFamily: 'monospace', fontSize: '12px', color: '#c8a15a' });
    this.add
      .text(472, 6, hintLine(STATUS_KEYS), {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#6f7b8a',
      })
      .setOrigin(1, 0);

    // 파티는 넷이라 창 넘김이 필요 없다. 다섯이 되면 `core/ui/scroll` 을 끼운다.
    this.panelBox(8, 22, 120, 74, '파티');
    this.nameTexts = this.members.map((member, i) =>
      this.add.text(28, 34 + i * LINE, member.name, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#e8e3d3',
      }),
    );
    this.cursor = this.add.text(16, 34, '>', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#c8a15a',
    });
    this.portrait = this.add.image(108, 78, CHARACTER_SHEET.key, 0).setOrigin(0.5, 1);

    this.vitalText = this.panel(8, 104, 120, 60, '지금');
    this.statText = this.panel(136, 22, 160, 232, '능력치');
    this.relicText = this.panel(304, 22, 168, 232, '장착 유물');

    this.bindKeys();
    this.render();
  }

  private panelBox(x: number, y: number, width: number, height: number, title: string): void {
    this.add.rectangle(x, y, width, height, PANEL).setOrigin(0, 0).setStrokeStyle(1, BORDER);
    this.add.text(x + 6, y - 1, title, {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: '#c8a15a',
    });
  }

  private panel(
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
  ): Phaser.GameObjects.Text {
    this.panelBox(x, y, width, height, title);
    return this.add.text(x + 10, y + 12, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#e8e3d3',
      lineSpacing: 2,
    });
  }

  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (keyboard === null) return;
    this.keys = bindSceneKeys(keyboard, STATUS_KEYS);
    getTouchControls().setKeys(STATUS_KEYS);
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
    if (step === 0 || this.members.length === 0) return;

    this.index = (this.index + step + this.members.length) % this.members.length;
    this.render();
  }

  private render(): void {
    const member = this.members[this.index];
    const base = this.base[this.index];
    if (member === undefined || base === undefined) return;

    this.cursor.setY(34 + this.index * LINE);
    this.nameTexts.forEach((text, i) =>
      text.setColor(i === this.index ? '#c8a15a' : '#e8e3d3'),
    );
    this.portrait.setFrame(portraitOf(member.id));

    const progress = partyProgress();
    const threshold = erosionThreshold(member, BATTLE_TUNING.erosion);
    const ailments = describeAilments(member.ailments ?? []);
    this.vitalText.setText(
      [
        `Lv ${progress.level}`,
        `HP ${member.hp} / ${member.stats.maxHp}`,
        `MP ${member.mp} / ${member.stats.maxMp}`,
        `침식 ${member.erosion} / ${threshold}`,
        ailments === '' ? '' : ailments,
      ].join('\n'),
    );

    /**
     * 기본값 → 보정된 값, 그리고 차이.
     *
     * **차이를 따로 적는 것이 이 화면의 이유다.** 보정된 값만 보면 그 숫자가 타고난
     * 것인지 유물이 준 것인지 알 수 없고, 그러면 유물을 바꿀 근거가 생기지 않는다.
     */
    this.statText.setText(
      STAT_ROWS.map(([key, label]) => {
        const from = base.stats[key];
        const to = member.stats[key];
        const delta = to - from;
        const mark = delta === 0 ? '' : `  ${delta > 0 ? '+' : ''}${delta}`;
        return `${label.padEnd(3)} ${String(to).padStart(4)}${mark}`;
      }).join('\n'),
    );

    const equipped = equippedBy(getLoadout(), member.id).map((id) => relic(id));
    const empty = slotsOf(getLoadout(), member.id).filter((slot) => slot === null).length;
    this.relicText.setText(
      [
        ...equipped.map((entry) => `${entry.name}\n  ${entry.tier}등급  침식 x${entry.erosionFactor}`),
        ...Array.from({ length: empty }, () => '(빈 슬롯)'),
      ].join('\n'),
    );

    markStatus(member.id, member.stats.maxHp - base.stats.maxHp);
  }
}
