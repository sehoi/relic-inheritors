/**
 * 유물 조합 훑기 (GDD §5.5, ADR-005).
 *
 * **불변식 1·2·4 는 "조합" 이 단위다.** 유물 하나짜리 승률은 아무것도 말해주지 않는다 —
 * 지배 전략은 조합에서 나오고, 사장된 유물도 "좋은 조합에 끼지 못한다" 로만 드러난다.
 *
 * 조합의 단위를 **파티 전체가 지닌 유물 집합**으로 잡는다. 누가 어느 슬롯에 끼는지가 아니라
 * 무엇을 지녔는지가 공명(GDD §5.2)을 정하고, 공명이 조합 설계의 축이기 때문이다.
 * 슬롯 배치까지 구별하면 공간이 몇 배로 커지는데, 늘어난 만큼의 정보는 나오지 않는다.
 *
 * 여기는 판정하지 않는다. 조합을 만들고 세기만 한다.
 */

import type { RelicId } from './index.js';

/** 파티 전체가 지닌 유물 집합. **id 오름차순으로 고정한다** — 같은 조합이 두 번 세어지면 안 된다. */
export interface RelicBuild {
  readonly id: string;
  readonly relics: readonly RelicId[];
}

function makeBuild(relics: readonly RelicId[]): RelicBuild {
  const sorted = [...relics].sort();
  return { id: sorted.join('+'), relics: sorted };
}

/**
 * 크기 1~`maxSize` 인 모든 부분집합.
 *
 * 빈 조합은 만들지 않는다 — 유물이 없으면 기본 공격만 남고, 그건 조합이 아니라 대조군이다.
 */
export function enumerateBuilds(
  relicIds: readonly RelicId[],
  maxSize: number,
): readonly RelicBuild[] {
  if (maxSize < 1) {
    throw new RangeError(`maxSize 는 1 이상이어야 합니다 (받은 값: ${maxSize}).`);
  }

  const builds: RelicBuild[] = [];
  const unique = [...new Set(relicIds)].sort();

  const walk = (start: number, picked: RelicId[]): void => {
    if (picked.length > 0) builds.push(makeBuild(picked));
    if (picked.length === maxSize) return;

    for (let i = start; i < unique.length; i += 1) {
      picked.push(unique[i] as RelicId);
      walk(i + 1, picked);
      picked.pop();
    }
  };

  walk(0, []);
  return builds;
}

/** 크기가 정확히 `size` 인 조합만. */
export function exactBuilds(
  relicIds: readonly RelicId[],
  size: number,
): readonly RelicBuild[] {
  if (size < 1) throw new RangeError(`size 는 1 이상이어야 합니다 (받은 값: ${size}).`);
  return enumerateBuilds(relicIds, size).filter((build) => build.relics.length === size);
}

/**
 * 무엇을 재야 하는가 — **선택이 성립하는 조합 크기.**
 *
 * 두 가지를 함께 만족해야 한다.
 *
 * 1. **슬롯을 채운다.** 슬롯이 남는 조합은 플레이어가 고르지 않는다. 그걸 섞어 재면
 *    "많이 낄수록 이긴다" 가 격차로 잡히는데, 그건 지배 전략이 아니다 (ADR-013).
 * 2. **적어도 하나는 빼고 낀다.** 가진 것을 전부 낄 수 있으면 고를 것이 없다 —
 *    조합이 하나뿐이라 순위도 채택률도 존재하지 않는다.
 *
 * 그래서 `min(슬롯, 가진 수 - 1)` 이다.
 */
export function choiceBuildSize(ownedCount: number, slots: number): number {
  if (ownedCount < 2) {
    throw new RangeError(`유물이 ${ownedCount}개면 고를 것이 없습니다. 2개 이상이어야 합니다.`);
  }
  if (slots < 1) throw new RangeError(`슬롯은 1 이상이어야 합니다 (받은 값: ${slots}).`);
  return Math.min(slots, ownedCount - 1);
}

/**
 * 조합이 너무 많을 때 **고르게 솎아낸다.**
 *
 * 앞에서 자르면 크기가 작은 조합만 남는다(열거 순서상). 일정 간격으로 뽑으면 크기 분포가 유지된다.
 * 무작위로 뽑지 않는 이유는 재현성이다 (ADR-002) — 같은 입력에 같은 표본이 나와야
 * 테스트가 어제와 오늘 다른 말을 하지 않는다.
 */
export function thinBuilds(
  builds: readonly RelicBuild[],
  limit: number,
): readonly RelicBuild[] {
  if (limit < 1) throw new RangeError(`limit 은 1 이상이어야 합니다 (받은 값: ${limit}).`);
  if (builds.length <= limit) return builds;

  const step = builds.length / limit;
  return Array.from({ length: limit }, (_, i) => builds[Math.floor(i * step)] as RelicBuild);
}

/**
 * 크기가 같은 조합끼리 묶는다.
 *
 * **불변식 1·2 는 크기가 같은 조합끼리만 비교해야 한다.** 유물 1개짜리와 3개짜리를 한 줄에
 * 세우면 "많이 낄수록 이긴다" 가 1위와 꼴찌의 차이로 잡히는데, 그건 지배 전략이 아니라
 * 슬롯이 남는다는 뜻이다. 실측에서 이 차이가 26.7%p 였고, 전부 조합 크기 때문이었다.
 *
 * 같은 크기끼리 비교하면 질문이 "몇 개를 끼느냐" 가 아니라 **"무엇을 끼느냐"** 가 된다.
 */
export function groupBySize<T extends { readonly build: RelicBuild }>(
  entries: readonly T[],
): ReadonlyMap<number, readonly T[]> {
  const groups = new Map<number, T[]>();
  for (const entry of entries) {
    const size = entry.build.relics.length;
    const bucket = groups.get(size);
    if (bucket === undefined) groups.set(size, [entry]);
    else bucket.push(entry);
  }
  // 크기 오름차순으로 고정한다. 순회 순서가 흔들리면 실패 메시지도 흔들린다.
  return new Map([...groups].sort(([a], [b]) => a - b));
}

/**
 * 승률 순위 사이의 격차 (불변식 1).
 *
 * 1위와 N위의 차이가 크면 **지배 전략이 있다**는 뜻이다. 조합이 N개보다 적으면
 * 꼴찌와 비교한다 — 조합이 적을 때 격차가 0으로 보이는 것이 더 위험한 거짓말이다.
 */
export function rankSpread(winRates: readonly number[], rank: number): number {
  if (winRates.length === 0) throw new RangeError('승률이 하나도 없습니다.');

  const sorted = [...winRates].sort((a, b) => b - a);
  const top = sorted[0] as number;
  const nth = sorted[Math.min(rank, sorted.length) - 1] as number;
  return top - nth;
}

/** 승률이 이 구간에 드는 조합의 비율 (불변식 2). 구간 밖으로 몰리면 조합에 의미가 없다. */
export function shareInBand(
  winRates: readonly number[],
  low: number,
  high: number,
): number {
  if (winRates.length === 0) return 0;
  return winRates.filter((rate) => rate >= low && rate <= high).length / winRates.length;
}

/**
 * 유물별 채택률 (불변식 4).
 *
 * **"좋은 조합" 안에서만 센다.** 모든 조합에서 세면 채택률은 조합 열거 방식이 정하는 상수가
 * 되어버려 아무것도 말하지 못한다. 좋은 조합에 한 번도 못 끼는 유물이 사장된 유물이다.
 */
export function adoptionRates(
  goodBuilds: readonly RelicBuild[],
  relicIds: readonly RelicId[],
): ReadonlyMap<RelicId, number> {
  const rates = new Map<RelicId, number>();
  for (const relicId of relicIds) {
    if (goodBuilds.length === 0) {
      rates.set(relicId, 0);
      continue;
    }
    const used = goodBuilds.filter((build) => build.relics.includes(relicId)).length;
    rates.set(relicId, used / goodBuilds.length);
  }
  return rates;
}

/** 승률 상위 `ratio` 만큼의 조합. 최소 하나는 남긴다. */
export function topBuilds<T extends { readonly build: RelicBuild; readonly winRate: number }>(
  entries: readonly T[],
  ratio: number,
): readonly RelicBuild[] {
  if (ratio <= 0 || ratio > 1) {
    throw new RangeError(`ratio 는 0 초과 1 이하여야 합니다 (받은 값: ${ratio}).`);
  }
  const count = Math.max(1, Math.round(entries.length * ratio));
  return [...entries]
    .sort((a, b) => b.winRate - a.winRate || (a.build.id < b.build.id ? -1 : 1))
    .slice(0, count)
    .map((entry) => entry.build);
}
