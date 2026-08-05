/**
 * 전투 상태 머신 (ADR-001: 순수 TypeScript, ADR-002: 시드 RNG).
 *
 * 전투는 **순수 함수 상태 머신**이다. `step(state, command)` 이 새 상태와 이벤트 목록을 낳고,
 * 렌더링은 그 이벤트 로그를 재생할 뿐이다. 이 구조에서 얻는 것:
 *
 * - 브라우저 없이 1초에 수천 판을 돌릴 수 있다 → 밸런스 자동 검증 (ADR-005)
 * - 이벤트 로그가 곧 애니메이션 스크립트가 된다 → 연출과 로직이 자동 동기화
 * - 시드를 로그에 남기면 "시드 4821에서 3턴째 크래시" 가 그대로 회귀 테스트가 된다
 *
 * T-013 범위는 골격까지다. 데미지는 T-014, 커맨드는 T-015 에서 붙인다.
 */

import { createRng, restoreRng, type Rng } from '../rng/index.js';
import type { Element, ElementAffinity } from './damage.js';

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
}

export function isAlive(actor: BattleActor): boolean {
  return actor.hp > 0;
}

export type BattleOutcome = 'ongoing' | 'victory' | 'defeat';

export interface BattleState {
  /** 1부터 시작. 큐가 비면 다음 라운드로 넘어간다. */
  readonly round: number;
  readonly actors: readonly BattleActor[];
  /** 이번 라운드에 아직 행동하지 않은 순서. 맨 앞이 지금 차례다. */
  readonly queue: readonly ActorId[];
  /** RNG 상태. 세이브·로그에 남기면 전투를 그 지점부터 재현할 수 있다. */
  readonly rngState: number;
  readonly outcome: BattleOutcome;
}

/** 지금은 턴 넘기기만 있다. 공격·방어·도망은 T-015, 스킬·아이템은 T-016. */
export type Command = { readonly type: 'pass'; readonly actor: ActorId };

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
  tuning: TurnOrderTuning,
): BattleState {
  if (actors.length === 0) {
    throw new RangeError('전투에 참가자가 없습니다.');
  }

  const rng = createRng(seed);
  const queue = buildQueue(actors, rng, tuning);

  return {
    round: 1,
    actors,
    queue,
    rngState: rng.getState(),
    outcome: battleOutcome(actors),
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

/**
 * 한 명의 행동을 처리하고 턴을 넘긴다.
 *
 * 커맨드의 `actor` 가 지금 차례와 다르면 던진다. UI 와 상태가 어긋난 채로 진행하면
 * 엉뚱한 액터가 행동하고, 그 원인을 나중에 추적하기 어렵다.
 */
export function step(
  state: BattleState,
  command: Command,
  tuning: TurnOrderTuning,
): StepResult {
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

  // T-014 이후 여기서 커맨드의 실제 효과가 처리된다.
  events.push({ type: 'turnEnd', actor: acting.id });

  // 죽은 액터는 남은 순서에서도 빠진다.
  const alive = new Set(state.actors.filter(isAlive).map((a) => a.id));
  let queue = state.queue.slice(1).filter((id) => alive.has(id));
  let round = state.round;
  let rngState = state.rngState;

  const outcome = battleOutcome(state.actors);

  if (outcome === 'ongoing' && queue.length === 0) {
    const rng = restoreRng(state.rngState);
    queue = buildQueue(state.actors, rng, tuning);
    rngState = rng.getState();
    round += 1;
    events.push({ type: 'roundStart', round });
  }

  if (outcome !== 'ongoing') {
    events.push({ type: 'battleEnd', outcome });
  }

  return {
    state: { round, actors: state.actors, queue, rngState, outcome },
    events,
  };
}
