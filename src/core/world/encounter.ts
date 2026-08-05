/**
 * 랜덤 인카운터 (GDD §6.1, ADR-001).
 *
 * 걸음 수를 세다가 정해진 수에 닿으면 전투가 벌어진다.
 *
 * **매 걸음마다 확률을 굴리지 않는다.** 확률 방식은 운이 나쁘면 두 걸음 만에 두 번 싸우고,
 * 운이 좋으면 한 층을 그냥 지나간다. 걸음 수 카운터는 "최소 N걸음은 안전하고,
 * 최대 M걸음 안에 반드시 한 번" 을 보장해 탐색의 리듬을 예측 가능하게 만든다.
 */

import type { Rng } from '../rng/index.js';

export interface EncounterTuning {
  /** 이 걸음 수 전에는 절대 발생하지 않는다. 전투 직후 바로 또 싸우는 것을 막는다. */
  readonly minSteps: number;
  /** 이 걸음 수 안에는 반드시 발생한다. */
  readonly maxSteps: number;
}

export interface EncounterCounter {
  readonly steps: number;
  /** 이번에 몇 걸음째에 발생할지. 전투마다 다시 뽑는다. */
  readonly threshold: number;
}

export function startCounter(rng: Rng, tuning: EncounterTuning): EncounterCounter {
  if (tuning.minSteps < 1 || tuning.maxSteps < tuning.minSteps) {
    throw new RangeError(
      `인카운터 걸음 범위가 잘못됐습니다: ${tuning.minSteps}~${tuning.maxSteps}`,
    );
  }
  return { steps: 0, threshold: rng.int(tuning.minSteps, tuning.maxSteps) };
}

export interface StepOutcome {
  readonly counter: EncounterCounter;
  readonly triggered: boolean;
}

/** 한 걸음 나아간다. 임계에 닿으면 발생하고, 카운터는 호출부가 다시 뽑아야 한다. */
export function advanceCounter(counter: EncounterCounter): StepOutcome {
  const steps = counter.steps + 1;
  return { counter: { ...counter, steps }, triggered: steps >= counter.threshold };
}

/** 가중치 표에서 하나 고른다. 지역별 인카운터 구성이 이 위에 얹힌다. */
export interface WeightedEntry<T> {
  readonly weight: number;
  readonly value: T;
}

export function pickWeighted<T>(entries: readonly WeightedEntry<T>[], rng: Rng): T {
  const usable = entries.filter((entry) => entry.weight > 0);
  if (usable.length === 0) {
    throw new RangeError('가중치가 양수인 항목이 없습니다.');
  }

  const total = usable.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng.next() * total;

  for (const entry of usable) {
    roll -= entry.weight;
    if (roll < 0) return entry.value;
  }
  // 부동소수 오차 대비.
  return (usable[usable.length - 1] as WeightedEntry<T>).value;
}
