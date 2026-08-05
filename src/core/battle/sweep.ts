/**
 * 여러 편성을 같은 시드로 훑는다 (ADR-005).
 *
 * `simulateMany` 는 편성 하나를 여러 시드로 돌린다. 이건 그 위에 한 겹을 더 얹어
 * **편성끼리 비교**할 수 있게 한다 — 유물 조합 불변식(GDD §5.5)이 필요로 하는 모양이다.
 *
 * 무엇을 훑는지는 모른다. 조합이든 튜닝값이든 호출부가 정한다.
 * **모든 항목에 같은 시드 목록을 쓴다** — 다른 시드로 재면 무엇 때문에 차이가 났는지 알 수 없다.
 */

import { simulateMany, type SimSetup, type SimSummary } from './simulate.js';
import type { BattleTuning } from './index.js';

export interface SweepEntry<T> {
  readonly item: T;
  readonly summary: SimSummary;
}

export function sweep<T>(
  items: readonly T[],
  toSetup: (item: T) => SimSetup,
  seeds: readonly number[],
  tuning: BattleTuning,
  maxTurns?: number,
): readonly SweepEntry<T>[] {
  if (items.length === 0) throw new RangeError('훑을 항목이 하나도 없습니다.');
  return items.map((item) => ({
    item,
    summary: simulateMany(toSetup(item), seeds, tuning, maxTurns),
  }));
}
