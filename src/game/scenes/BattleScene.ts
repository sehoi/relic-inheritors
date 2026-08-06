import Phaser from 'phaser';
import {
  createBattle,
  currentActor,
  isAlive,
  step,
  validTargets,
  type ActorId,
  type BattleActor,
  type BattleEvent,
  type BattleState,
  type Command,
} from '../../core/battle/index.js';
import { chooseCommand } from '../../core/battle/ai.js';
import { itemBlockReason, type Item } from '../../core/battle/item.js';
import { erosionThreshold, skillBlockReason, type Skill } from '../../core/battle/skill.js';
import { createRng } from '../../core/rng/index.js';
import { BATTLE_TUNING, VICTORY_RECOVERY, describeAilments } from '../../data/battle.js';
import { ruinEncounter, mobTile, type Encounter } from '../../data/encounters.js';
import { CHARACTER_SHEET, portraitOf } from '../../data/characters.js';
import { item as itemById } from '../../data/items.js';
import { markBattle, markPartyPanel, markScene, type BattlePhase } from '../domState.js';
import {
  getInventory,
  partyForBattle,
  partySkills,
  recordSkillUses,
  resetParty,
  saveInventory,
  saveParty,
  settleVictory,
} from '../partyStore.js';
import { expForEnemy } from '../../core/progress/level.js';
import { COIN_REWARD, EXP_REWARD } from '../../data/progression.js';
import { Gauge } from '../ui/Gauge.js';
import { BATTLE_KEYS } from '../../data/keys.js';
import { bindSceneKeys, type BoundKeys } from '../keys.js';
import type { OverworldEntry } from './OverworldScene.js';

/** 이벤트 하나를 보여주는 시간. 너무 빠르면 무슨 일이 있었는지 읽을 수 없다. */
const EVENT_DELAY = 260;

/** 파티 패널의 자리. 화면이 270px 이므로 아래로 더 늘릴 수 없다 — 인원은 여기서 나눈다. */
const PANEL_TOP = 158;
const PANEL_HEIGHT = 104;
const PANEL_PAD = 6;

export interface BattleEntry {
  readonly encounter?: Encounter;
  readonly seed?: number;
  /** 전투가 끝나면 돌아갈 곳. 없으면 타이틀로 나간다 (개발용 직접 진입). */
  readonly returnTo?: OverworldEntry;
}

interface PendingAction {
  readonly kind: 'attack' | 'skill' | 'item';
  readonly skill?: Skill;
  readonly item?: Item;
}

/**
 * 전투 화면.
 *
 * **판정은 하나도 하지 않는다.** 커맨드를 만들어 `core/battle` 에 넘기고,
 * 돌아온 이벤트 로그를 순서대로 재생할 뿐이다. 이 분리 덕분에 같은 전투를
 * 시뮬레이터가 브라우저 없이 수백 번 돌릴 수 있다 (ADR-005).
 */
export class BattleScene extends Phaser.Scene {
  private encounter!: Encounter;
  private state!: BattleState;
  private returnTo: OverworldEntry | undefined;

  /** 이번 전투에서 스킬을 몇 번 썼는가. 전투가 끝나면 유물 숙련도로 환산된다. */
  private skillUses: Record<string, number> = {};
  private phase: BattlePhase = 'command';
  private pending: PendingAction | undefined;
  private menuIndex = 0;
  private targets: readonly BattleActor[] = [];

  private enemyViews = new Map<ActorId, Phaser.GameObjects.Image>();
  private enemyLabels = new Map<ActorId, Phaser.GameObjects.Text>();
  private partyGauges = new Map<ActorId, { hp: Gauge; mp: Gauge; erosion: Gauge }>();
  private partyLabels = new Map<ActorId, Phaser.GameObjects.Text>();
  private partyAilments = new Map<ActorId, Phaser.GameObjects.Text>();
  private enemyGauges = new Map<ActorId, Gauge>();
  private enemyAilments = new Map<ActorId, Phaser.GameObjects.Text>();
  private menuText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private cursor!: Phaser.GameObjects.Text;

  private keys: BoundKeys = {};

  constructor() {
    super('battle');
  }

  init(entry?: BattleEntry): void {
    this.returnTo = entry?.returnTo;
    // 개발용 직접 진입(`?scene=battle`)에서도 유물에서 스킬이 나오게 한다.
    this.encounter =
      entry?.encounter ??
      ruinEncounter(8, {
        party: partyForBattle(),
        partySkills: partySkills(),
        inventory: getInventory(),
      });
    this.state = createBattle(
      this.encounter.actors,
      entry?.seed ?? 1,
      BATTLE_TUNING,
      this.encounter.inventory,
    );
  }

  create(): void {
    markScene('battle');

    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x10131b).setOrigin(0, 0);
    this.buildEnemies();
    this.buildPartyPanel();

    this.messageText = this.add
      .text(this.scale.width / 2, 132, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#e8e3d3',
        align: 'center',
      })
      .setOrigin(0.5, 0);

    this.add.rectangle(332, 168, 140, 94, 0x0b0c10).setOrigin(0, 0).setStrokeStyle(1, 0x6f7b8a);
    this.menuText = this.add.text(346, 176, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#e8e3d3',
      lineSpacing: 3,
    });
    this.cursor = this.add.text(336, 176, '>', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#c8a15a',
    });

    this.bindKeys();
    this.beginTurn();
  }

  // ── 화면 구성 ───────────────────────────────────────────────────────────

  private buildEnemies(): void {
    const enemies = this.state.actors.filter((a) => a.side === 'enemy');
    const gap = this.scale.width / (enemies.length + 1);

    // 적이 몇이든 폭 안에서 나눠 갖는다. 막대가 이름보다 넓으면 서로 붙어 읽히지 않는다.
    const barWidth = Math.min(64, Math.floor(gap) - 12);

    enemies.forEach((enemy, i) => {
      const x = gap * (i + 1);
      const view = this.add.image(x, 62, 'tiles-dungeon', mobTile(enemy.id)).setScale(2);
      this.enemyViews.set(enemy.id, view);
      this.enemyLabels.set(
        enemy.id,
        this.add
          .text(x, 82, enemy.name, {
            fontFamily: 'monospace',
            fontSize: '9px',
            color: '#9aa7b8',
          })
          .setOrigin(0.5, 0),
      );

      /**
       * 적의 HP 와 상태이상 (T-059).
       *
       * **없으면 누구를 칠지 고를 근거가 없다.** 거의 죽은 적을 마무리할지 온전한 적을
       * 칠지가 대상 선택의 전부인데, 예전에는 이름만 떠 있어 전부 같아 보였다.
       * 상태이상도 마찬가지다 — 독을 묻히는 스킬과 그냥 약한 스킬이 구분되지 않았다.
       *
       * **숫자가 아니라 막대다.** 적의 정확한 HP 는 이 게임이 답할 문제가 아니고,
       * 필요한 것은 "얼마나 남았나" 뿐이다.
       */
      this.enemyGauges.set(enemy.id, new Gauge(this, x - barWidth / 2, 94, barWidth, 5, 0xb0304a));
      this.enemyAilments.set(
        enemy.id,
        this.add
          .text(x, 102, '', {
            fontFamily: 'monospace',
            fontSize: '8px',
            color: '#c8a15a',
          })
          .setOrigin(0.5, 0),
      );
    });
  }

  /**
   * 파티 상태 패널.
   *
   * **한 사람당 42px 로 잡혀 있었다.** 파티가 둘이던 시절의 값이라 넷이 되자 셋째부터
   * 화면(270px) 밖으로 나갔다 — 뒤의 두 사람은 HP 도 침식도 볼 수 없었다.
   * 인원에 맞춰 줄이는 대신 **인원으로 나눈다.** 다섯이 되어도 잘리지 않는다.
   */
  private buildPartyPanel(): void {
    const party = this.state.actors.filter((a) => a.side === 'party');
    this.add.rectangle(8, PANEL_TOP, 316, PANEL_HEIGHT, 0x0b0c10)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x6f7b8a);

    const row = Math.floor((PANEL_HEIGHT - PANEL_PAD * 2) / Math.max(1, party.length));

    party.forEach((member, i) => {
      const top = PANEL_TOP + PANEL_PAD + i * row;

      // 전투는 프론트뷰다 (GDD §6.2). 이름만 있으면 누가 누구인지 이름표로만 알게 되는데,
      // 유물을 누구에게 줄지 고르는 게임에서 그건 부족하다.
      this.add.image(22, top + 8, CHARACTER_SHEET.key, portraitOf(member.id));

      this.partyLabels.set(
        member.id,
        this.add.text(36, top, member.name, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#e8e3d3',
        }),
      );

      this.partyGauges.set(member.id, {
        hp: new Gauge(this, 108, top + 1, 84, 6, 0xb0304a),
        mp: new Gauge(this, 108, top + 9, 84, 4, 0x4a72b0),
        // 침식은 찰수록 나쁘다. 붉은 보라로 다른 축임을 알린다.
        erosion: new Gauge(this, 222, top + 1, 90, 6, 0x8a4ab0),
      });

      // 막대 색만으로는 무엇인지 알 수 없다. 좁은 자리라 두 글자로 줄인다.
      for (const [label, offsetY, color] of [
        ['HP', 0, '#b0304a'],
        ['MP', 8, '#4a72b0'],
      ] as const) {
        this.add
          .text(104, top + offsetY, label, {
            fontFamily: 'monospace',
            fontSize: '8px',
            color,
          })
          .setOrigin(1, 0);
      }

      this.add
        .text(218, top, 'ER', { fontFamily: 'monospace', fontSize: '8px', color: '#8a4ab0' })
        .setOrigin(1, 0);

      // 침묵이 걸린 줄 모르면 스킬 메뉴가 왜 막혔는지 알 수 없다.
      this.partyAilments.set(
        member.id,
        this.add.text(36, top + 10, '', {
          fontFamily: 'monospace',
          fontSize: '8px',
          color: '#c8a15a',
        }),
      );
    });

    markPartyPanel(party.length, PANEL_TOP + PANEL_PAD + party.length * row);
    this.refreshPanel();
  }

  private refreshPanel(): void {
    for (const [id, gauges] of this.partyGauges) {
      const actor = this.state.actors.find((a) => a.id === id);
      if (actor === undefined) continue;

      gauges.hp.setRatio(actor.hp / actor.stats.maxHp);
      gauges.mp.setRatio(actor.stats.maxMp === 0 ? 0 : actor.mp / actor.stats.maxMp);
      gauges.erosion.setRatio(actor.erosion / erosionThreshold(actor, BATTLE_TUNING.erosion));

      const label = this.partyLabels.get(id);
      label?.setColor(isAlive(actor) ? '#e8e3d3' : '#6f7b8a');
      // 파티도 무엇에 걸렸는지 보여야 한다. 침묵이 걸린 줄 모르면 스킬 메뉴가 왜 막혔는지 알 수 없다.
      this.partyAilments.get(id)?.setText(describeAilments(actor.ailments ?? []));
    }

    for (const [id, view] of this.enemyViews) {
      const actor = this.state.actors.find((a) => a.id === id);
      const alive = actor !== undefined && isAlive(actor);
      view.setVisible(alive);
      // 이름표도 함께 감춘다. 사라진 적의 이름만 남아 있으면 아직 있는 것처럼 보인다.
      this.enemyLabels.get(id)?.setVisible(alive);
      this.enemyAilments.get(id)?.setVisible(alive);
      this.enemyAilments.get(id)?.setText(alive ? describeAilments(actor.ailments ?? []) : '');

      const gauge = this.enemyGauges.get(id);
      if (gauge !== undefined) {
        gauge.setVisible(alive);
        if (actor !== undefined) gauge.setRatio(actor.hp / actor.stats.maxHp);
      }
    }
  }

  // ── 턴 진행 ─────────────────────────────────────────────────────────────

  private beginTurn(): void {
    if (this.state.outcome !== 'ongoing') {
      this.finish();
      return;
    }

    const acting = currentActor(this.state);
    if (acting === undefined) {
      this.finish();
      return;
    }

    if (acting.side === 'enemy') {
      this.setPhase('playing');
      this.time.delayedCall(EVENT_DELAY, () => this.runEnemyTurn(acting.id));
      return;
    }

    this.pending = undefined;
    this.menuIndex = 0;
    this.setPhase('command');
    this.message(`${acting.name}의 차례`);
    this.renderMenu();
  }

  private runEnemyTurn(actorId: ActorId): void {
    const profile = this.encounter.profiles[actorId];
    if (profile === undefined) {
      this.apply({ type: 'pass', actor: actorId });
      return;
    }
    // AI 용 난수를 전투 상태와 분리한다 — 같은 스트림을 쓰면 재현이 흔들린다.
    const rng = createRng(this.state.rngState ^ 0x5bf0_3635);
    this.apply(chooseCommand(this.state, actorId, profile, rng, BATTLE_TUNING));
  }

  private apply(command: Command): void {
    const result = step(this.state, command, BATTLE_TUNING);
    this.state = result.state;
    this.setPhase('playing');
    this.playEvents([...result.events]);
  }

  /** 이벤트를 하나씩 보여준다. 한꺼번에 반영하면 무슨 일이 있었는지 알 수 없다. */
  private playEvents(queue: BattleEvent[]): void {
    const event = queue.shift();
    if (event === undefined) {
      this.refreshPanel();
      this.beginTurn();
      return;
    }

    const text = this.describe(event);
    if (text !== undefined) this.message(text);
    if (event.type === 'damage') this.popDamage(event.target, event.amount, event.critical);
    if (event.type === 'skillUsed') {
      this.skillUses[event.skill] = (this.skillUses[event.skill] ?? 0) + 1;
    }

    this.refreshPanel();
    this.time.delayedCall(text === undefined ? 0 : EVENT_DELAY, () => this.playEvents(queue));
  }

  private describe(event: BattleEvent): string | undefined {
    const name = (id: ActorId): string =>
      this.state.actors.find((a) => a.id === id)?.name ?? id;

    switch (event.type) {
      case 'damage': {
        const mark = event.elementMod > 1 ? ' 약점!' : event.elementMod < 1 ? ' 저항…' : '';
        return `${name(event.target)}에게 ${event.amount}${event.critical ? ' 치명타!' : ''}${mark}`;
      }
      case 'heal':
        return `${name(event.target)} HP +${event.amount}`;
      case 'death':
        return `${name(event.actor)} 쓰러짐`;
      case 'revive':
        return `${name(event.actor)} 되살아남`;
      case 'guard':
        return `${name(event.actor)} 방어 태세`;
      case 'skillUsed':
        return `${name(event.actor)}: ${event.skill}`;
      case 'itemUsed':
        return `${name(event.actor)} → ${event.item}`;
      case 'overload':
        return `${name(event.actor)} 침식 폭주!`;
      case 'ailmentApplied':
        return `${name(event.actor)} ${event.kind}`;
      case 'ailmentBlocked':
        return `${name(event.actor)} 움직이지 못한다`;
      case 'ailmentDamage':
        return `${name(event.actor)} ${event.kind} ${event.amount}`;
      case 'flee':
        return event.success ? '도망쳤다!' : '도망칠 수 없었다';
      case 'battleEnd':
        return event.outcome === 'victory' ? '승리!' : event.outcome === 'fled' ? '이탈' : '전멸…';
      default:
        return undefined;
    }
  }

  private popDamage(targetId: ActorId, amount: number, critical: boolean): void {
    const view = this.enemyViews.get(targetId);
    const x = view?.x ?? 100;
    const y = view?.y ?? 190;

    const popup = this.add
      .text(x, y, String(amount), {
        fontFamily: 'monospace',
        fontSize: critical ? '15px' : '12px',
        color: critical ? '#f2d16b' : '#e8e3d3',
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: popup,
      y: y - 18,
      alpha: 0,
      duration: 520,
      onComplete: () => popup.destroy(),
    });
  }

  private finish(): void {
    this.setPhase('over', this.state.outcome);
    this.renderMenu();

    // 살아남았으면 HP·MP·침식·소지품이 전투 밖으로 이어진다 (GDD §5.4).
    if (this.state.outcome === 'defeat') {
      this.message('전멸…');
      resetParty();
      return;
    }

    if (this.state.outcome !== 'victory') {
      // 도망친 전투도 상태는 이어진다. 다만 보상은 없다.
      saveParty(this.state.actors);
      saveInventory(this.state.inventory);
      recordSkillUses(this.skillUses);
      this.message('이탈');
      return;
    }

    this.message(this.settleWin());
  }

  /**
   * 이긴 뒤의 정산. 화면에 띄울 문구를 돌려준다 (T-044, T-046).
   *
   * **도망친 전투는 보상을 주지 않는다.** 주면 도망이 안전한 벌이가 되고,
   * 그러면 조합을 고민할 이유가 사라진다.
   *
   * 실제 처리는 `partyStore.settleVictory` 한 곳에 있다 — 밸런스 시뮬레이터가 같은 길을
   * 지나야 게임과 같은 것을 잰다.
   */
  private settleWin(): string {
    const defeated = this.state.actors.filter(
      (actor) => actor.side === 'enemy' && !isAlive(actor),
    ).length;
    const gained = defeated * expForEnemy(this.encounter.level, EXP_REWARD);
    const coins = defeated * expForEnemy(this.encounter.level, COIN_REWARD);

    const result = settleVictory(
      this.state.actors,
      this.state.inventory,
      this.skillUses,
      defeated,
      gained,
      VICTORY_RECOVERY,
      coins,
    );

    const parts = [`승리!  경험치 +${gained}`];
    if (result.coinsGained > 0) parts.push(`은편 +${result.coinsGained}`);
    if (result.mpRecovered > 0) parts.push(`MP +${result.mpRecovered}`);
    if (result.levelledTo !== undefined) {
      parts.push(`레벨 ${result.levelledTo}!  기운을 되찾았다`);
    }
    return parts.join('   ');
  }

  /** 전투가 끝난 뒤 나갈 곳. 전멸이면 타이틀, 아니면 왔던 자리로 돌아간다. */
  private leaveBattle(): void {
    if (this.state.outcome === 'defeat' || this.returnTo === undefined) {
      this.scene.start('title');
      return;
    }
    this.scene.start('overworld', this.returnTo);
  }

  // ── 메뉴 ────────────────────────────────────────────────────────────────

  private menuEntries(): readonly string[] {
    const acting = currentActor(this.state);

    switch (this.phase) {
      case 'command':
        return ['공격', '스킬', '아이템', '방어', '도망'];
      case 'skill':
        return this.skillsOf(acting).map((s) => `${s.name} (${s.mpCost})`);
      case 'item':
        return this.itemEntries().map(([entry, count]) => `${entry.name} x${count}`);
      case 'target':
        return this.targets.map((t) => t.name);
      default:
        return [];
    }
  }

  private skillsOf(actor: BattleActor | undefined): readonly Skill[] {
    if (actor === undefined) return [];
    return this.encounter.partySkills[actor.id] ?? [];
  }

  private itemEntries(): readonly (readonly [Item, number])[] {
    return Object.entries(this.state.inventory)
      .filter(([, count]) => count > 0)
      .map(([id, count]) => [itemById(id), count] as const);
  }

  private renderMenu(): void {
    const entries = this.menuEntries();
    this.menuText.setText(entries.join('\n'));
    this.cursor.setVisible(entries.length > 0 && this.phase !== 'playing' && this.phase !== 'over');
    this.cursor.setY(176 + this.menuIndex * 14);
  }

  private setPhase(phase: BattlePhase, outcome?: string): void {
    this.phase = phase;
    markBattle(phase, outcome);
  }

  private message(text: string): void {
    this.messageText.setText(text);
  }

  // ── 입력 ────────────────────────────────────────────────────────────────

  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (keyboard === null) {
      this.keys = {};
      return;
    }
    this.keys = bindSceneKeys(keyboard, BATTLE_KEYS);
  }

  private pressed(name: string): boolean {
    return (this.keys[name] ?? []).some((key) => Phaser.Input.Keyboard.JustDown(key));
  }

  override update(): void {
    if (this.phase === 'playing') return;

    if (this.phase === 'over') {
      if (this.pressed('confirm')) this.leaveBattle();
      return;
    }

    const entries = this.menuEntries();
    if (entries.length === 0) {
      // 고를 것이 없으면(스킬도 아이템도 없음) 커맨드로 돌아간다.
      if (this.phase !== 'command') this.backToCommand();
      return;
    }

    if (this.pressed('up')) {
      this.menuIndex = (this.menuIndex + entries.length - 1) % entries.length;
      this.renderMenu();
    }
    if (this.pressed('down')) {
      this.menuIndex = (this.menuIndex + 1) % entries.length;
      this.renderMenu();
    }
    if (this.pressed('cancel') && this.phase !== 'command') this.backToCommand();
    if (this.pressed('confirm')) this.confirm();
  }

  private backToCommand(): void {
    this.pending = undefined;
    this.menuIndex = 0;
    this.setPhase('command');
    this.renderMenu();
  }

  private confirm(): void {
    const acting = currentActor(this.state);
    if (acting === undefined) return;

    switch (this.phase) {
      case 'command':
        this.chooseCommandEntry(acting);
        break;

      case 'skill': {
        const chosen = this.skillsOf(acting)[this.menuIndex];
        if (chosen === undefined) return;
        const blocked = skillBlockReason(acting, chosen, BATTLE_TUNING.erosion);
        if (blocked !== undefined) {
          this.message(blocked);
          return;
        }
        this.pending = { kind: 'skill', skill: chosen };
        this.enterTargeting(validTargets(this.state, acting.id));
        break;
      }

      case 'item': {
        const entry = this.itemEntries()[this.menuIndex];
        if (entry === undefined) return;
        this.pending = { kind: 'item', item: entry[0] };
        this.enterTargeting(this.state.actors.filter((a) => a.side === 'party'));
        break;
      }

      case 'target':
        this.commitTarget(acting);
        break;

      default:
        break;
    }
  }

  private chooseCommandEntry(acting: BattleActor): void {
    switch (this.menuIndex) {
      case 0:
        this.pending = { kind: 'attack' };
        this.enterTargeting(validTargets(this.state, acting.id));
        break;
      case 1:
        this.menuIndex = 0;
        this.setPhase('skill');
        this.renderMenu();
        break;
      case 2:
        this.menuIndex = 0;
        this.setPhase('item');
        this.renderMenu();
        break;
      case 3:
        this.apply({ type: 'guard', actor: acting.id });
        break;
      case 4:
        this.apply({ type: 'flee', actor: acting.id });
        break;
      default:
        break;
    }
  }

  private enterTargeting(targets: readonly BattleActor[]): void {
    if (targets.length === 0) {
      this.backToCommand();
      return;
    }
    this.targets = targets;
    this.menuIndex = 0;
    this.setPhase('target');
    this.renderMenu();
  }

  private commitTarget(acting: BattleActor): void {
    const target = this.targets[this.menuIndex];
    const action = this.pending;
    if (target === undefined || action === undefined) return;

    if (action.kind === 'attack') {
      this.apply({ type: 'attack', actor: acting.id, target: target.id });
      return;
    }
    if (action.kind === 'skill' && action.skill !== undefined) {
      this.apply({ type: 'skill', actor: acting.id, target: target.id, skill: action.skill });
      return;
    }
    if (action.kind === 'item' && action.item !== undefined) {
      const blocked = itemBlockReason(this.state.inventory, action.item, target);
      if (blocked !== undefined) {
        this.message(blocked);
        return;
      }
      this.apply({ type: 'item', actor: acting.id, target: target.id, item: action.item });
    }
  }
}
