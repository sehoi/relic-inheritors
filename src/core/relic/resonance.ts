/**
 * 공명 (GDD §5.2, ADR-004).
 *
 * 파티 전체가 장착한 유물의 **태그 조합**이 조건을 만족하면 파티 단위 효과가 붙는다.
 *
 * **이게 "유물 하나가 조합 공간을 곱으로 늘린다" 는 말의 실체다.** 유물을 추가하면
 * 그 유물이 들어가는 조합만 늘어나는 게 아니라, 성립 가능한 공명의 수가 함께 늘어난다.
 * 루프가 `data/relics.ts` 만 건드려도 게임이 깊어지는 유일한 축이므로 이 구조는 훼손하지 않는다.
 */

import type { Stats } from '../battle/index.js';
import { Problems, createDuplicateGuard } from '../validation/index.js';
import type { Relic, RelicTag } from './index.js';

export interface ResonanceCondition {
  readonly tag: RelicTag;
  /** 파티 전체에서 이 태그가 최소 몇 개 필요한가. */
  readonly count: number;
}

export interface Resonance {
  readonly id: string;
  readonly name: string;
  /** **모든** 조건을 만족해야 발동한다. */
  readonly conditions: readonly ResonanceCondition[];
  /**
   * 파티 전원에게 더해지는 스탯.
   *
   * 효과 종류를 스탯 보정 하나로 시작한다 — 침식 완화·속성 증폭 같은 것은
   * 그걸 소비할 기제가 붙는 T-026 에서 함께 넓힌다. 쓰이지 않는 효과 종류를
   * 미리 만들어 두면 죽은 구조가 된다.
   */
  readonly statMods: Readonly<Partial<Stats>>;
  readonly description: string;
}

/** 장착 유물의 태그를 센다. 한 유물이 여러 태그를 가지면 각각 센다. */
export function countTags(relics: readonly Relic[]): ReadonlyMap<RelicTag, number> {
  const counts = new Map<RelicTag, number>();
  for (const relic of relics) {
    for (const tag of relic.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return counts;
}

export function isResonanceActive(
  resonance: Resonance,
  relics: readonly Relic[],
): boolean {
  const counts = countTags(relics);
  return resonance.conditions.every(
    (condition) => (counts.get(condition.tag) ?? 0) >= condition.count,
  );
}

export function activeResonances(
  catalog: readonly Resonance[],
  relics: readonly Relic[],
): readonly Resonance[] {
  return catalog.filter((resonance) => isResonanceActive(resonance, relics));
}

/** 발동한 공명들의 스탯 보정 합. 파티 전원에게 같은 값이 붙는다. */
export function resonanceStatMods(
  resonances: readonly Resonance[],
): Readonly<Partial<Stats>> {
  const total: { -readonly [K in keyof Stats]?: number } = {};
  for (const resonance of resonances) {
    for (const [key, value] of Object.entries(resonance.statMods) as [keyof Stats, number][]) {
      total[key] = (total[key] ?? 0) + value;
    }
  }
  return total;
}

export function validateResonance(resonance: Resonance): void {
  const problems = Problems.create();
  const at = problems.scope(`"${resonance.id}"`);

  if (resonance.id.trim().length === 0) problems.add('id 가 비어 있습니다.');
  if (resonance.name.trim().length === 0) at.add('name 이 비어 있습니다.');
  if (resonance.description.trim().length === 0) at.add('description 이 비어 있습니다.');

  if (resonance.conditions.length === 0) {
    // 조건이 없으면 항상 발동한다 — 그건 공명이 아니라 그냥 전역 보정이다.
    at.add('conditions 가 비어 있습니다. 조건 없는 공명은 조합 설계에 기여하지 못합니다.');
  }

  const guard = createDuplicateGuard('조건 태그', at);
  for (const condition of resonance.conditions) {
    guard(condition.tag);
    if (!Number.isInteger(condition.count) || condition.count < 1) {
      at.add(`"${condition.tag}" 의 count 는 1 이상의 정수여야 합니다 (받은 값: ${condition.count}).`);
    }
  }

  if (Object.keys(resonance.statMods).length === 0) {
    at.add('statMods 가 비어 있습니다. 아무 효과도 없는 공명은 성립해도 의미가 없습니다.');
  }

  problems.throwIfAny('공명');
}

/**
 * 이 공명을 발동시키려면 태그가 몇 개 더 필요한가. 발동 중이면 빈 목록.
 * 장착 화면(T-029)이 "무엇을 더 끼우면 되는지" 를 보여주는 데 쓴다.
 */
export function missingForResonance(
  resonance: Resonance,
  relics: readonly Relic[],
): readonly ResonanceCondition[] {
  const counts = countTags(relics);
  return resonance.conditions
    .map((condition) => ({
      tag: condition.tag,
      count: condition.count - (counts.get(condition.tag) ?? 0),
    }))
    .filter((remaining) => remaining.count > 0);
}
