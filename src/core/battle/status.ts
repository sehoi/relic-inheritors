/**
 * 상태이상 (GDD §6.2, ADR-001).
 *
 * 다섯 가지가 서로 다른 방식으로 **커맨드 선택을 제약한다** — 그게 상태이상의 요점이다.
 * 피해만 주는 이상은 그냥 약한 공격이지 상태이상이 아니다.
 *
 * | 이상 | 제약 |
 * |---|---|
 * | 독 (poison) | 없음. 턴 종료마다 최대 HP 비율로 깎인다 |
 * | 마비 (paralysis) | 확률적으로 턴을 잃는다 |
 * | 수면 (sleep) | 행동 불가. **피격하면 깨어난다** |
 * | 침묵 (silence) | 스킬 봉인. 기본 공격은 된다 |
 * | 혼란 (confusion) | 확률적으로 대상이 무작위로 바뀐다 (아군 포함) |
 */

import type { Rng } from '../rng/index.js';
import type { BattleActor } from './index.js';

export const AILMENTS = ['poison', 'paralysis', 'sleep', 'silence', 'confusion'] as const;
export type Ailment = (typeof AILMENTS)[number];

export interface AilmentState {
  readonly kind: Ailment;
  /** 남은 턴. 자기 턴이 끝날 때마다 1 줄어든다. */
  readonly turns: number;
}

export interface AilmentTuning {
  /** 독 피해 = 최대 HP × 이 비율 */
  readonly poisonPercent: number;
  /** 마비로 턴을 잃을 확률 */
  readonly paralysisSkipChance: number;
  /** 혼란으로 대상이 뒤바뀔 확률 */
  readonly confusionChance: number;
  /** 이상별 기본 지속 턴 */
  readonly defaultTurns: Readonly<Record<Ailment, number>>;
}

export function ailmentsOf(actor: BattleActor): readonly AilmentState[] {
  return actor.ailments ?? [];
}

export function hasAilment(actor: BattleActor, kind: Ailment): boolean {
  return ailmentsOf(actor).some((a) => a.kind === kind);
}

/**
 * 상태이상을 건다.
 *
 * **이미 걸려 있으면 지속 턴을 더 긴 쪽으로 갱신할 뿐 누적하지 않는다.**
 * 누적을 허용하면 같은 이상을 반복해서 걸어 사실상 영구 봉인이 가능해지고,
 * 그 순간 "수면 걸고 때리기" 가 지배 전략이 된다.
 */
export function addAilment(actor: BattleActor, kind: Ailment, turns: number): BattleActor {
  if (turns <= 0) {
    throw new RangeError(`지속 턴은 양수여야 합니다 (받은 값: ${turns}).`);
  }

  const existing = ailmentsOf(actor);
  const current = existing.find((a) => a.kind === kind);

  const next: readonly AilmentState[] =
    current === undefined
      ? [...existing, { kind, turns }]
      : existing.map((a) => (a.kind === kind ? { kind, turns: Math.max(a.turns, turns) } : a));

  return { ...actor, ailments: next };
}

export function removeAilment(actor: BattleActor, kind: Ailment): BattleActor {
  return { ...actor, ailments: ailmentsOf(actor).filter((a) => a.kind !== kind) };
}

export function clearAilments(actor: BattleActor): BattleActor {
  return { ...actor, ailments: [] };
}

/** 자기 턴이 끝날 때 지속 턴을 깎는다. 0이 된 이상은 사라진다. */
export function tickAilments(actor: BattleActor): {
  readonly actor: BattleActor;
  readonly expired: readonly Ailment[];
} {
  const ticked = ailmentsOf(actor).map((a) => ({ kind: a.kind, turns: a.turns - 1 }));
  const alive = ticked.filter((a) => a.turns > 0);
  const expired = ticked.filter((a) => a.turns <= 0).map((a) => a.kind);

  return { actor: { ...actor, ailments: alive }, expired };
}

export function poisonDamage(actor: BattleActor, tuning: AilmentTuning): number {
  // 최소 1은 깎는다. 비율이 아무리 작아도 독이 아무 일도 안 하면 이상이 아니다.
  return Math.max(1, Math.floor(actor.stats.maxHp * tuning.poisonPercent));
}

/**
 * 이번 턴에 행동할 수 없게 만드는 이상. 행동할 수 있으면 `undefined`.
 *
 * 수면이 마비보다 먼저다 — 수면은 확정이고 마비는 확률이라, 순서를 뒤집으면
 * 잠든 액터가 마비 판정에 RNG를 소비해 재현이 흔들린다.
 */
export function incapacitatedBy(
  actor: BattleActor,
  rng: Rng,
  tuning: AilmentTuning,
): Ailment | undefined {
  if (hasAilment(actor, 'sleep')) return 'sleep';
  if (hasAilment(actor, 'paralysis') && rng.chance(tuning.paralysisSkipChance)) {
    return 'paralysis';
  }
  return undefined;
}

/** 혼란으로 대상이 뒤바뀌는가. */
export function confusionHits(actor: BattleActor, rng: Rng, tuning: AilmentTuning): boolean {
  return hasAilment(actor, 'confusion') && rng.chance(tuning.confusionChance);
}
