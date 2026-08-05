import type { ActorId, Stats } from '../core/battle/index.js';
import { SLOTS_PER_MEMBER } from '../core/relic/index.js';

/**
 * 파티 명단 (GDD §8).
 *
 * **인원 수의 유일한 출처다.** 그전에는 게임이 2인이고 밸런스 시뮬레이터가 4인이었다 —
 * 두 곳에 따로 적혀 있었기 때문이다. 그 상태에서 잰 조합 불변식은 실제 게임이 아니라
 * 존재하지 않는 편성을 재고 있었다.
 *
 * 능력은 유물에서 나오므로(ADR-004) 여기 있는 것은 **역할의 기울기**뿐이다.
 * 스킬을 들려주지 않는다 — 그건 장착이 정한다.
 */
export interface PartyMemberTemplate {
  readonly id: ActorId;
  readonly name: string;
  /**
   * 기본 성장 곡선에 곱하는 비율. 생략한 항목은 1.
   *
   * 합이 1을 넘지 않게 잡는다 — 한 명이 모든 축에서 나으면 나머지는 자리만 차지한다.
   */
  readonly statScale?: Readonly<Partial<Record<keyof Stats, number>>>;
}

export const ROSTER: readonly PartyMemberTemplate[] = [
  { id: 'vanguard', name: '전위' },
  { id: 'caster', name: '술사', statScale: { mag: 1.3, def: 0.9 } },
];

/** 지금 파티 인원. GDD §8 의 수직 슬라이스 목표는 4명이다 (T-049b). */
export const PARTY_SIZE = ROSTER.length;

/** 파티 전체의 유물 슬롯 수. 조합 공간의 크기가 여기서 나온다. */
export const TOTAL_SLOTS = PARTY_SIZE * SLOTS_PER_MEMBER;
