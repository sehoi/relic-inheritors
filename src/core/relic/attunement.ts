/**
 * 각인 성장 (GDD §5.3).
 *
 * **육성 대상이 캐릭터가 아니라 유물이다.** 숙련도는 유물에 귀속되므로
 * 착용자를 바꿔 끼워도 유지된다 — 이게 "계승" 이라는 제목의 의미이자,
 * 후반에 새 파티원이 합류해도 기존 자산이 죽지 않게 하는 장치다.
 *
 * 캐릭터 레벨은 스탯 성장만 담당하고, 능력의 성장은 이쪽이 맡는다.
 */

import { Problems } from '../validation/index.js';
import type { RelicId } from './index.js';

export interface AttunementTuning {
  /** 유물의 스킬을 한 번 쓸 때 얻는 숙련도. */
  readonly perUse: number;
  /**
   * 단계별 누적 임계. `thresholds[n]` 이상이면 n 단계다.
   * 첫 값은 0 이어야 한다 — 아무것도 안 해도 0단계이기 때문이다.
   */
  readonly thresholds: readonly number[];
}

/** 유물별 누적 숙련도. 전투 밖으로 이어지고 세이브에 담긴다 (M4). */
export type Attunement = Readonly<Record<RelicId, number>>;

export function experienceOf(attunement: Attunement, relicId: RelicId): number {
  return attunement[relicId] ?? 0;
}

/** 누적 숙련도에 해당하는 단계. */
export function rankOf(experience: number, tuning: AttunementTuning): number {
  let rank = 0;
  tuning.thresholds.forEach((threshold, index) => {
    if (experience >= threshold) rank = index;
  });
  return rank;
}

export function maxRank(tuning: AttunementTuning): number {
  return tuning.thresholds.length - 1;
}

export function rankOfRelic(
  attunement: Attunement,
  relicId: RelicId,
  tuning: AttunementTuning,
): number {
  return rankOf(experienceOf(attunement, relicId), tuning);
}

/** 다음 단계까지 남은 숙련도. 최고 단계면 `undefined`. */
export function toNextRank(
  experience: number,
  tuning: AttunementTuning,
): number | undefined {
  const rank = rankOf(experience, tuning);
  const next = tuning.thresholds[rank + 1];
  return next === undefined ? undefined : next - experience;
}

/**
 * 숙련도를 더한다.
 *
 * **끼운 사람이 아니라 유물에 쌓인다.** 그래서 인자가 액터가 아니라 유물 id 다 —
 * 이 시그니처 자체가 GDD §5.3 의 설계를 강제한다.
 */
export function gainAttunement(
  attunement: Attunement,
  relicId: RelicId,
  uses: number,
  tuning: AttunementTuning,
): Attunement {
  if (uses < 0) {
    throw new RangeError(`사용 횟수는 음수일 수 없습니다 (받은 값: ${uses}).`);
  }
  if (uses === 0) return attunement;

  return { ...attunement, [relicId]: experienceOf(attunement, relicId) + uses * tuning.perUse };
}

/** 여러 유물의 사용 횟수를 한 번에 반영한다. */
export function gainAll(
  attunement: Attunement,
  uses: Readonly<Record<RelicId, number>>,
  tuning: AttunementTuning,
): Attunement {
  return Object.entries(uses).reduce(
    (acc, [relicId, count]) => gainAttunement(acc, relicId, count, tuning),
    attunement,
  );
}

export function validateAttunementTuning(tuning: AttunementTuning): void {
  const problems = Problems.create();

  if (tuning.perUse <= 0) problems.add(`perUse 는 양수여야 합니다 (받은 값: ${tuning.perUse}).`);
  if (tuning.thresholds.length === 0) {
    problems.add('thresholds 가 비어 있습니다.');
  } else if (tuning.thresholds[0] !== 0) {
    problems.add('thresholds 의 첫 값은 0 이어야 합니다 (아무것도 안 해도 0단계다).');
  }

  for (let i = 1; i < tuning.thresholds.length; i += 1) {
    const previous = tuning.thresholds[i - 1] as number;
    const current = tuning.thresholds[i] as number;
    if (current <= previous) {
      problems.add(`thresholds 는 오름차순이어야 합니다: [${i - 1}]=${previous}, [${i}]=${current}`);
    }
  }

  problems.throwIfAny('각인 성장 설정');
}
