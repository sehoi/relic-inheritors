/**
 * 전투 상태 머신 (ADR-001: 순수 TypeScript, ADR-002: 시드 RNG).
 *
 * 전투는 **순수 함수 상태 머신**이다. `step(state, command)` 이 새 상태와 이벤트 목록을 낳고,
 * 렌더링은 그 이벤트 로그를 재생할 뿐이다. 이 구조에서 얻는 것:
 *
 * - 브라우저 없이 1초에 수천 판을 돌릴 수 있다 → 밸런스 자동 검증 (ADR-005)
 * - 이벤트 로그가 곧 애니메이션 스크립트가 된다 → 연출과 로직이 자동 동기화
 * - 시드를 로그에 남기면 "시드 4821에서 3턴째 크래시" 가 그대로 회귀 테스트가 된다
 */

import { createRng, restoreRng, type Rng } from '../rng/index.js';
import {
  applyDamage,
  resolveDamage,
  type AttackSpec,
  type DamageTuning,
  type Element,
  type ElementAffinity,
} from './damage.js';
import {
  applySkillCost,
  isOverloaded,
  relieveErosion,
  skillBlockReason,
  type ErosionTuning,
  type Skill,
} from './skill.js';
import {
  applyItemEffect,
  consume,
  itemBlockReason,
  type Inventory,
  type Item,
} from './item.js';
import {
  addAilment,
  confusionHits,
  hasAilment,
  incapacitatedBy,
  poisonDamage,
  removeAilment,
  tickAilments,
  type Ailment,
  type AilmentState,
  type AilmentTuning,
} from './status.js';

export type ActorId = string;
export type Side = 'party' | 'enemy';

export interface Stats {
  readonly maxHp: number;
  readonly maxMp: number;
  readonly atk: number;
  readonly def: number;
  readonly mag: number;
  readonly res: number;
  readonly agi: number;
  readonly luk: number;
}

export interface BattleActor {
  readonly id: ActorId;
  readonly name: string;
  readonly side: Side;
  readonly stats: Stats;
  readonly hp: number;
  readonly mp: number;
  /** 침식. 강한 유물 스킬을 쓸수록 쌓인다 (GDD §5.4). 임계 처리는 T-016. */
  readonly erosion: number;
  /** 속성별 피해 배율. 없으면 1.0. 적이 스스로 약점을 선언하는 방식이다 — `damage.ts` 참조. */
  readonly affinity?: ElementAffinity;
  /** 방어 중인가. **다음 자기 턴이 시작될 때 풀린다.** 없으면 false. */
  readonly guarding?: boolean;
  /** 걸려 있는 상태이상. 없으면 빈 목록으로 취급한다. */
  readonly ailments?: readonly AilmentState[];
}

export function isAlive(actor: BattleActor): boolean {
  return actor.hp > 0;
}

export type BattleOutcome = 'ongoing' | 'victory' | 'defeat' | 'fled';

export interface BattleState {
  /** 1부터 시작. 큐가 비면 다음 라운드로 넘어간다. */
  readonly round: number;
  readonly actors: readonly BattleActor[];
  /** 이번 라운드에 아직 행동하지 않은 순서. 맨 앞이 지금 차례다. */
  readonly queue: readonly ActorId[];
  /** RNG 상태. 세이브·로그에 남기면 전투를 그 지점부터 재현할 수 있다. */
  readonly rngState: number;
  readonly outcome: BattleOutcome;
  /** 파티 소지품. 전투 중 소비되며 밖으로도 이어진다 (관리는 M4 거점). */
  readonly inventory: Inventory;
}

/** 기본 공격의 규격. 스킬은 T-016 에서 자체 `AttackSpec` 을 갖는다. */
export const BASIC_ATTACK: AttackSpec = { power: 100, element: 'none', kind: 'physical' };

export type Command =
  | { readonly type: 'pass'; readonly actor: ActorId }
  | { readonly type: 'attack'; readonly actor: ActorId; readonly target: ActorId }
  /** 스킬 객체를 그대로 담는다 — 상태 머신이 콘텐츠 레지스트리를 알 필요가 없다. */
  | {
      readonly type: 'skill';
      readonly actor: ActorId;
      readonly target: ActorId;
      readonly skill: Skill;
    }
  | {
      readonly type: 'item';
      readonly actor: ActorId;
      readonly target: ActorId;
      readonly item: Item;
    }
  | { readonly type: 'guard'; readonly actor: ActorId }
  | { readonly type: 'flee'; readonly actor: ActorId };

/**
 * 이벤트 로그는 곧 애니메이션 스크립트다 (T-020 이 이걸 재생한다).
 * 그래서 "무슨 일이 일어났는가" 를 연출에 필요한 만큼 담되, 상태 자체는 담지 않는다.
 */
export type BattleEvent =
  | { readonly type: 'roundStart'; readonly round: number }
  | { readonly type: 'turnStart'; readonly actor: ActorId }
  | { readonly type: 'turnEnd'; readonly actor: ActorId }
  | {
      readonly type: 'damage';
      readonly source: ActorId;
      readonly target: ActorId;
      readonly amount: number;
      readonly critical: boolean;
      readonly element: Element;
      /** 1 보다 크면 약점, 작으면 저항. 연출을 바꾸는 근거다. */
      readonly elementMod: number;
    }
  | { readonly type: 'heal'; readonly target: ActorId; readonly amount: number }
  | { readonly type: 'skillUsed'; readonly actor: ActorId; readonly skill: string }
  | {
      readonly type: 'itemUsed';
      readonly actor: ActorId;
      readonly target: ActorId;
      readonly item: string;
    }
  | { readonly type: 'revive'; readonly actor: ActorId }
  /** 침식이 한계를 넘어 제어를 잃었다. 뒤따르는 damage 의 대상은 아군일 수도 있다. */
  | { readonly type: 'overload'; readonly actor: ActorId }
  | { readonly type: 'erosion'; readonly actor: ActorId; readonly value: number }
  | {
      readonly type: 'ailmentApplied';
      readonly actor: ActorId;
      readonly kind: Ailment;
      readonly turns: number;
    }
  | { readonly type: 'ailmentEnded'; readonly actor: ActorId; readonly kind: Ailment }
  /** 상태이상으로 이번 턴을 잃었다. */
  | { readonly type: 'ailmentBlocked'; readonly actor: ActorId; readonly kind: Ailment }
  | {
      readonly type: 'ailmentDamage';
      readonly actor: ActorId;
      readonly kind: Ailment;
      readonly amount: number;
    }
  /** 혼란으로 대상이 뒤바뀌었다. 원래 대상이 아니라는 걸 연출로 알려야 한다. */
  | { readonly type: 'confused'; readonly actor: ActorId; readonly target: ActorId }
  | { readonly type: 'guard'; readonly actor: ActorId }
  | { readonly type: 'flee'; readonly actor: ActorId; readonly success: boolean }
  | { readonly type: 'death'; readonly actor: ActorId }
  | { readonly type: 'battleEnd'; readonly outcome: Exclude<BattleOutcome, 'ongoing'> }
  | { readonly type: 'message'; readonly text: string };

export interface StepResult {
  readonly state: BattleState;
  readonly events: readonly BattleEvent[];
}

export interface TurnOrderTuning {
  /**
   * 민첩 정렬에 섞는 흔들림 폭 (0이면 순수 민첩순).
   *
   * 흔들림이 없으면 같은 편성에서 턴 순서가 영원히 고정돼 전투가 기계적으로 느껴진다.
   * 반대로 너무 크면 민첩 스탯에 투자할 이유가 사라진다.
   */
  readonly jitter: number;
}

export interface FleeTuning {
  readonly baseChance: number;
  /** 민첩 차 1당 성공률 증감 */
  readonly agiFactor: number;
  readonly minChance: number;
  /** 100%로 두지 않는다 — 도망이 항상 통하면 모든 전투가 선택 사항이 된다. */
  readonly maxChance: number;
}

export interface BattleTuning {
  readonly turnOrder: TurnOrderTuning;
  readonly damage: DamageTuning;
  readonly flee: FleeTuning;
  readonly erosion: ErosionTuning;
  readonly ailment: AilmentTuning;
}

/**
 * 라운드 시작 시 행동 순서를 정한다.
 *
 * 죽은 액터는 빠진다. 동점은 id 순으로 끊어 **어떤 경우에도 순서가 결정적**이게 한다 —
 * 정렬이 불안정하면 같은 시드로도 다른 전개가 나와 재현이 깨진다.
 */
function buildQueue(
  actors: readonly BattleActor[],
  rng: Rng,
  tuning: TurnOrderTuning,
): ActorId[] {
  return actors
    .filter(isAlive)
    .map((actor) => ({
      id: actor.id,
      score: actor.stats.agi * (1 + rng.next() * tuning.jitter),
    }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
    .map((entry) => entry.id);
}

export function battleOutcome(actors: readonly BattleActor[]): BattleOutcome {
  const partyAlive = actors.some((a) => a.side === 'party' && isAlive(a));
  const enemyAlive = actors.some((a) => a.side === 'enemy' && isAlive(a));

  // 양쪽이 동시에 전멸하면 패배로 본다. 살아남지 못했다면 이긴 것이 아니다.
  if (!partyAlive) return 'defeat';
  if (!enemyAlive) return 'victory';
  return 'ongoing';
}

export function createBattle(
  actors: readonly BattleActor[],
  seed: number,
  tuning: BattleTuning,
  inventory: Inventory = {},
): BattleState {
  if (actors.length === 0) {
    throw new RangeError('전투에 참가자가 없습니다.');
  }

  const rng = createRng(seed);
  const queue = buildQueue(actors, rng, tuning.turnOrder);

  return {
    round: 1,
    actors,
    queue,
    rngState: rng.getState(),
    outcome: battleOutcome(actors),
    inventory,
  };
}

export function actorById(state: BattleState, id: ActorId): BattleActor {
  const actor = state.actors.find((a) => a.id === id);
  if (actor === undefined) {
    throw new Error(
      `전투에 "${id}" 가 없습니다. 참가자: ${state.actors.map((a) => a.id).join(', ')}`,
    );
  }
  return actor;
}

/** 지금 차례인 액터. 전투가 끝났으면 undefined. */
export function currentActor(state: BattleState): BattleActor | undefined {
  const id = state.queue[0];
  return id === undefined ? undefined : actorById(state, id);
}

/** 공격 대상이 될 수 있는 상대편 생존자. UI 의 대상 커서와 AI 가 같이 쓴다. */
export function validTargets(state: BattleState, actorId: ActorId): readonly BattleActor[] {
  const actor = actorById(state, actorId);
  return state.actors.filter((other) => other.side !== actor.side && isAlive(other));
}

/**
 * 도망 성공률. 민첩이 높을수록 잘 도망친다.
 *
 * 상한을 100%로 두지 않는다 — 도망이 항상 통하면 모든 전투가 선택 사항이 되고,
 * 유물 조합을 고민할 이유가 사라진다.
 */
export function fleeChance(
  state: BattleState,
  actorId: ActorId,
  tuning: FleeTuning,
): number {
  const actor = actorById(state, actorId);
  const foes = state.actors.filter((a) => a.side !== actor.side && isAlive(a));
  const avgFoeAgi =
    foes.length === 0 ? 0 : foes.reduce((sum, a) => sum + a.stats.agi, 0) / foes.length;

  const raw = tuning.baseChance + (actor.stats.agi - avgFoeAgi) * tuning.agiFactor;
  return Math.min(Math.max(raw, tuning.minChance), tuning.maxChance);
}

function replaceActor(
  actors: readonly BattleActor[],
  updated: BattleActor,
): readonly BattleActor[] {
  return actors.map((a) => (a.id === updated.id ? updated : a));
}

/**
 * 한 명의 행동을 처리하고 턴을 넘긴다.
 *
 * 커맨드의 `actor` 가 지금 차례와 다르면 던진다. UI 와 상태가 어긋난 채로 진행하면
 * 엉뚱한 액터가 행동하고, 그 원인을 나중에 추적하기 어렵다.
 */
export function step(state: BattleState, command: Command, tuning: BattleTuning): StepResult {
  if (state.outcome !== 'ongoing') {
    throw new Error(`이미 끝난 전투입니다 (${state.outcome}).`);
  }

  const acting = currentActor(state);
  if (acting === undefined) {
    throw new Error('행동할 액터가 없습니다. 큐가 비어 있는 상태로 step 이 호출됐습니다.');
  }
  if (command.actor !== acting.id) {
    throw new Error(`지금 차례는 "${acting.id}" 인데 "${command.actor}" 의 커맨드가 들어왔습니다.`);
  }

  const events: BattleEvent[] = [{ type: 'turnStart', actor: acting.id }];
  const rng = restoreRng(state.rngState);

  // 방어는 다음 자기 턴이 시작될 때 풀린다.
  let actors = replaceActor(state.actors, { ...acting, guarding: false });
  let inventory = state.inventory;
  let fled = false;

  /** 한 대상에게 피해를 입히고 이벤트를 쌓는다. 공격·스킬·폭주가 공유한다. */
  const strike = (target: BattleActor, attack: AttackSpec): BattleActor => {
    const result = resolveDamage(acting, target, attack, rng, tuning.damage);
    let hurt = applyDamage(target, result.amount);

    // 수면은 피격하면 깨어난다. 자고 있는 상대를 때려 굳히는 전략을 막는다.
    const woke = hasAilment(hurt, 'sleep');
    if (woke) hurt = removeAilment(hurt, 'sleep');

    actors = replaceActor(actors, hurt);

    events.push({
      type: 'damage',
      source: acting.id,
      target: target.id,
      amount: result.amount,
      critical: result.critical,
      element: attack.element,
      elementMod: result.elementMod,
    });
    if (woke) events.push({ type: 'ailmentEnded', actor: hurt.id, kind: 'sleep' });
    if (!isAlive(hurt)) events.push({ type: 'death', actor: hurt.id });

    return hurt;
  };

  /** 혼란이면 대상이 무작위로 바뀐다. 플레이어가 고른 대상은 그와 별개로 검증한다. */
  const resolveTarget = (intended: ActorId): BattleActor => {
    const chosen = livingTarget(intended);
    if (!confusionHits(acting, rng, tuning.ailment)) return chosen;

    const candidates = actors.filter((a) => a.id !== acting.id && isAlive(a));
    if (candidates.length === 0) return chosen;

    const scrambled = rng.pick(candidates);
    events.push({ type: 'confused', actor: acting.id, target: scrambled.id });
    return scrambled;
  };

  const livingTarget = (id: ActorId): BattleActor => {
    const target = actors.find((a) => a.id === id);
    if (target === undefined) throw new Error(`대상 "${id}" 가 전투에 없습니다.`);
    if (!isAlive(target)) throw new Error(`대상 "${id}" 는 이미 쓰러졌습니다.`);
    return target;
  };

  // ── 폭주 ────────────────────────────────────────────────────────────────
  // 침식이 한계를 넘으면 커맨드가 무시되고 아무나 후려친다 (GDD §5.4).
  // 커맨드 검증보다 **먼저** 확인한다 — 제어를 잃은 상태에서 무엇을 고르든 의미가 없다.
  if (isOverloaded(acting, tuning.erosion)) {
    events.push({ type: 'overload', actor: acting.id });

    const candidates = actors.filter((a) => a.id !== acting.id && isAlive(a));
    if (candidates.length > 0) strike(rng.pick(candidates), BASIC_ATTACK);

    const relieved = relieveErosion(
      actors.find((a) => a.id === acting.id) as BattleActor,
      tuning.erosion,
    );
    actors = replaceActor(actors, relieved);
    events.push({ type: 'erosion', actor: acting.id, value: relieved.erosion });

    return finishTurn(state, actors, events, rng, tuning, false, inventory);
  }

  // ── 행동 불가 ───────────────────────────────────────────────────────────
  // 수면·마비. 폭주 다음, 커맨드 처리 앞이다 — 우선순위는 GDD §6.2 참조.
  const blockedBy = incapacitatedBy(acting, rng, tuning.ailment);
  if (blockedBy !== undefined) {
    events.push({ type: 'ailmentBlocked', actor: acting.id, kind: blockedBy });
    return finishTurn(state, actors, events, rng, tuning, false, inventory);
  }

  switch (command.type) {
    case 'pass':
      break;

    case 'guard': {
      actors = replaceActor(actors, { ...acting, guarding: true });
      events.push({ type: 'guard', actor: acting.id });
      break;
    }

    case 'item': {
      // 부활 아이템은 쓰러진 대상을 노리므로 `livingTarget` 을 쓰지 않는다.
      const target = actors.find((a) => a.id === command.target);
      if (target === undefined) {
        throw new Error(`대상 "${command.target}" 가 전투에 없습니다.`);
      }

      const blocked = itemBlockReason(inventory, command.item, target);
      if (blocked !== undefined) {
        throw new Error(`"${command.item.name}" 을(를) 쓸 수 없습니다: ${blocked}`);
      }

      const outcome = applyItemEffect(target, command.item);
      actors = replaceActor(actors, outcome.actor);
      inventory = consume(inventory, command.item.id);

      events.push({
        type: 'itemUsed',
        actor: acting.id,
        target: target.id,
        item: command.item.id,
      });
      if (outcome.revived) events.push({ type: 'revive', actor: target.id });
      if (outcome.healed > 0) {
        events.push({ type: 'heal', target: target.id, amount: outcome.healed });
      }
      for (const kind of outcome.cured) {
        events.push({ type: 'ailmentEnded', actor: target.id, kind });
      }
      if (outcome.cleansed > 0) {
        events.push({ type: 'erosion', actor: target.id, value: outcome.actor.erosion });
      }
      break;
    }

    case 'attack': {
      strike(resolveTarget(command.target), BASIC_ATTACK);
      break;
    }

    case 'skill': {
      // 자원 검사를 먼저 한다. 쓸 수 없는 스킬이 상태를 반쯤 바꿔놓고 실패하면 안 된다.
      if (hasAilment(acting, 'silence')) {
        throw new Error(`"${command.skill.name}" 를 쓸 수 없습니다: 침묵으로 유물이 잠겼다`);
      }
      const blocked = skillBlockReason(acting, command.skill, tuning.erosion);
      if (blocked !== undefined) {
        throw new Error(`"${command.skill.name}" 를 쓸 수 없습니다: ${blocked}`);
      }

      const paid = applySkillCost(acting, command.skill, tuning.erosion);
      actors = replaceActor(actors, paid);

      events.push({ type: 'skillUsed', actor: acting.id, skill: command.skill.id });
      const struck = strike(resolveTarget(command.target), command.skill.attack);
      events.push({ type: 'erosion', actor: acting.id, value: paid.erosion });

      const inflict = command.skill.inflict;
      // 쓰러진 대상에게 상태이상을 거는 것은 의미가 없다.
      if (inflict !== undefined && isAlive(struck) && rng.chance(inflict.chance)) {
        const turns = inflict.turns ?? tuning.ailment.defaultTurns[inflict.kind];
        actors = replaceActor(actors, addAilment(struck, inflict.kind, turns));
        events.push({
          type: 'ailmentApplied',
          actor: struck.id,
          kind: inflict.kind,
          turns,
        });
      }
      break;
    }

    case 'flee': {
      // 적의 도망은 지원하지 않는다. 몬스터가 달아나는 연출이 필요해지면 별도 커맨드로 만든다.
      if (acting.side !== 'party') {
        throw new Error('도망은 파티만 할 수 있습니다.');
      }
      const success = rng.chance(fleeChance(state, acting.id, tuning.flee));
      fled = success;
      events.push({ type: 'flee', actor: acting.id, success });
      break;
    }
  }

  return finishTurn(state, actors, events, rng, tuning, fled, inventory);
}

/** 턴을 닫고 큐·라운드·승패를 정리한다. 정상 행동과 폭주가 공유한다. */
function finishTurn(
  state: BattleState,
  actorsIn: readonly BattleActor[],
  events: BattleEvent[],
  rng: Rng,
  tuning: BattleTuning,
  fled: boolean,
  inventory: Inventory,
): StepResult {
  const actingId = state.queue[0] as ActorId;
  let actors = actorsIn;

  // ── 턴 종료 시 상태이상 처리 ────────────────────────────────────────────
  // 독 피해를 먼저, 지속 턴 감소를 나중에. 순서를 뒤집으면 마지막 턴에 독이 한 번 덜 들어간다.
  const acting = actors.find((a) => a.id === actingId);
  if (acting !== undefined && isAlive(acting)) {
    let updated = acting;

    if (hasAilment(updated, 'poison')) {
      const amount = poisonDamage(updated, tuning.ailment);
      updated = applyDamage(updated, amount);
      events.push({ type: 'ailmentDamage', actor: actingId, kind: 'poison', amount });
      if (!isAlive(updated)) events.push({ type: 'death', actor: actingId });
    }

    const ticked = tickAilments(updated);
    for (const kind of ticked.expired) {
      events.push({ type: 'ailmentEnded', actor: actingId, kind });
    }
    actors = replaceActor(actors, ticked.actor);
  }

  events.push({ type: 'turnEnd', actor: actingId });

  // 죽은 액터는 남은 순서에서도 빠진다.
  const alive = new Set(actors.filter(isAlive).map((a) => a.id));
  let queue = state.queue.slice(1).filter((id) => alive.has(id));
  let round = state.round;

  const outcome: BattleOutcome = fled ? 'fled' : battleOutcome(actors);

  if (outcome === 'ongoing' && queue.length === 0) {
    queue = buildQueue(actors, rng, tuning.turnOrder);
    round += 1;
    events.push({ type: 'roundStart', round });
  }

  if (outcome !== 'ongoing') {
    events.push({ type: 'battleEnd', outcome });
  }

  return {
    state: { round, actors, queue, rngState: rng.getState(), outcome, inventory },
    events,
  };
}
