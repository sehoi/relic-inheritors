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
  /** 파티 전원에게 더해지는 스탯. */
  readonly statMods: Readonly<Partial<Stats>>;
  /**
   * 파티 전원의 스킬 침식량에 곱해지는 배수 (T-026). 생략하면 1(완화 없음).
   *
   * 유물 계수가 침식을 **올리는** 축이라면 이쪽은 **내리는** 축이다. 둘이 같이 있어야
   * "센 유물을 끼되 완화 조합으로 감당한다" 는 빌드가 성립한다 — 그게 없으면
   * 침식은 그냥 강한 유물에 붙은 벌점일 뿐이다.
   *
   * 속성 증폭은 아직 넣지 않는다. 데미지 파이프라인에 소비 기제가 없어 죽은 구조가 된다.
   */
  readonly erosionRelief?: number;
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

/**
 * 발동한 공명들의 침식 완화 배수. 여럿이면 곱한다.
 *
 * 더하지 않고 곱하는 이유는 완화가 **0 이하로 내려가지 않게** 하기 위해서다.
 * 덧셈이면 완화 공명 몇 개로 침식을 음수까지 밀어낼 수 있다.
 */
export function resonanceErosionRelief(resonances: readonly Resonance[]): number {
  return resonances.reduce((product, resonance) => product * (resonance.erosionRelief ?? 1), 1);
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

  if (resonance.erosionRelief !== undefined) {
    // 1을 넘으면 완화가 아니라 가중이다. 그런 공명이 필요해지면 별도 항목으로 나눈다 —
    // 한 필드가 양방향이면 "완화 배수" 라는 이름이 거짓말이 된다.
    if (!(resonance.erosionRelief > 0) || resonance.erosionRelief > 1) {
      at.add(`erosionRelief 는 0 초과 1 이하여야 합니다 (받은 값: ${resonance.erosionRelief}).`);
    }
  }

  if (Object.keys(resonance.statMods).length === 0 && resonance.erosionRelief === undefined) {
    at.add('아무 효과도 없습니다. statMods 나 erosionRelief 중 하나는 있어야 합니다.');
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
