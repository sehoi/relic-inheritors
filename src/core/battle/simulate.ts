/**
 * 헤드리스 전투 시뮬레이터 (ADR-005).
 *
 * 전투가 순수 상태 머신이라(ADR-001) 브라우저 없이 수천 판을 돌릴 수 있다.
 * **이게 자율 루프가 밸런스를 사람 없이 판정하는 유일한 수단이다** — GDD §5.5 의 불변식은
 * 전부 여기서 측정된다.
 *
 * 시뮬레이터 자체는 판정하지 않는다. 숫자만 낸다. 합격·불합격은 `tests/balance/` 가 정한다.
 */

import { createRng, type Rng } from '../rng/index.js';
import { chooseCommand, type AiProfile } from './ai.js';
import {
  createBattle,
  currentActor,
  isAlive,
  step,
  type ActorId,
  type BattleActor,
  type BattleOutcome,
  type BattleTuning,
} from './index.js';

export interface SimSetup {
  readonly actors: readonly BattleActor[];
  /** 액터별 AI. 파티도 AI 가 둔다 — 측정에는 사람의 판단보다 재현성이 중요하다. */
  readonly profiles: Readonly<Record<ActorId, AiProfile>>;
}

/** 무한 전투를 끊는다. 양쪽이 계속 방어만 하면 영원히 끝나지 않는다. */
export const DEFAULT_MAX_TURNS = 400;

export type SimOutcome = BattleOutcome | 'timeout';

export interface BattleReport {
  readonly outcome: SimOutcome;
  readonly rounds: number;
  readonly turns: number;
  /** 종료 시점의 파티 HP 총합 비율 (0~1) */
  readonly partyHpRatio: number;
  readonly overloads: number;
  /** 관통 하한에 걸린 타격 수. 방어 스택이 실제로 무적을 만드는지 보는 지표. */
  readonly minimumHits: number;
}

function partyHpRatio(actors: readonly BattleActor[]): number {
  const party = actors.filter((a) => a.side === 'party');
  const max = party.reduce((sum, a) => sum + a.stats.maxHp, 0);
  if (max === 0) return 0;
  return party.reduce((sum, a) => sum + a.hp, 0) / max;
}

/**
 * 한 판을 끝까지 돌린다.
 *
 * AI 용 난수는 전투용과 **분리한다.** 같은 스트림을 쓰면 AI 선택이 전투의 변동폭을 밀어내
 * 같은 시드에서도 전개가 달라진다.
 */
export function simulateBattle(
  setup: SimSetup,
  seed: number,
  tuning: BattleTuning,
  maxTurns: number = DEFAULT_MAX_TURNS,
): BattleReport {
  let state = createBattle(setup.actors, seed, tuning);
  const aiRng: Rng = createRng(seed ^ 0x9e37_79b9);

  let turns = 0;
  let overloads = 0;
  let minimumHits = 0;

  while (state.outcome === 'ongoing' && turns < maxTurns) {
    const acting = currentActor(state);
    if (acting === undefined) break;

    const profile = setup.profiles[acting.id];
    if (profile === undefined) {
      throw new Error(
        `"${acting.id}" 의 AI 프로필이 없습니다. 등록된 것: ${Object.keys(setup.profiles).join(', ')}`,
      );
    }

    const command = chooseCommand(state, acting.id, profile, aiRng, tuning);
    const result = step(state, command, tuning);
    state = result.state;
    turns += 1;

    for (const event of result.events) {
      if (event.type === 'overload') overloads += 1;
      if (event.type === 'damage' && event.amount <= tuning.damage.minDamage) minimumHits += 1;
    }
  }

  const outcome: SimOutcome = state.outcome === 'ongoing' ? 'timeout' : state.outcome;

  return {
    outcome,
    rounds: state.round,
    turns,
    partyHpRatio: partyHpRatio(state.actors),
    overloads,
    minimumHits,
  };
}

export interface SimSummary {
  readonly trials: number;
  readonly victories: number;
  readonly defeats: number;
  readonly fled: number;
  readonly timeouts: number;
  readonly winRate: number;
  readonly avgRounds: number;
  readonly avgTurns: number;
  readonly avgPartyHpRatio: number;
  readonly totalOverloads: number;
  readonly totalMinimumHits: number;
}

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;

/** 여러 시드로 반복해 통계를 낸다. 시드 목록을 받으므로 결과는 완전히 재현 가능하다. */
export function simulateMany(
  setup: SimSetup,
  seeds: readonly number[],
  tuning: BattleTuning,
  maxTurns: number = DEFAULT_MAX_TURNS,
): SimSummary {
  if (seeds.length === 0) {
    throw new RangeError('시드가 하나도 없습니다.');
  }

  const reports = seeds.map((seed) => simulateBattle(setup, seed, tuning, maxTurns));
  const count = (outcome: SimOutcome): number =>
    reports.filter((r) => r.outcome === outcome).length;

  const victories = count('victory');

  return {
    trials: reports.length,
    victories,
    defeats: count('defeat'),
    fled: count('fled'),
    timeouts: count('timeout'),
    winRate: victories / reports.length,
    avgRounds: mean(reports.map((r) => r.rounds)),
    avgTurns: mean(reports.map((r) => r.turns)),
    avgPartyHpRatio: mean(reports.map((r) => r.partyHpRatio)),
    totalOverloads: reports.reduce((sum, r) => sum + r.overloads, 0),
    totalMinimumHits: reports.reduce((sum, r) => sum + r.minimumHits, 0),
  };
}

/** 연속된 시드 목록. 테스트와 CLI 가 같은 표본을 쓰도록 한 곳에서 만든다. */
export function seedRange(start: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => start + i);
}

export const aliveCount = (actors: readonly BattleActor[], side: BattleActor['side']): number =>
  actors.filter((a) => a.side === side && isAlive(a)).length;
