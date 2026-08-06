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
   * **올린 만큼 내린다.** 한 명이 모든 축에서 나으면 나머지는 자리만 차지하고,
   * 그러면 "누구에게 어떤 유물을" 이라는 질문이 사라진다.
   */
  readonly statScale?: Readonly<Partial<Record<keyof Stats, number>>>;
  /** 처음부터 함께인가. 아니면 유적에서 만난다 (`data/npcs.ts` 의 `joinsAs`). */
  readonly startsInParty?: boolean;
}

/**
 * 넷 다 역할이 다르다 (GDD §8 — 2명 시작 → 4명).
 *
 * 능력은 유물에서 오므로(ADR-004) 여기 차이는 **스탯의 기울기**뿐이다. 그 기울기가
 * "이 유물을 누구에게" 를 정하는 근거가 된다 — 마법 유물을 전위에게 주면 아깝다.
 */
export const ROSTER: readonly PartyMemberTemplate[] = [
  { id: 'vanguard', name: '전위', startsInParty: true },
  { id: 'caster', name: '술사', statScale: { mag: 1.3, def: 0.9 }, startsInParty: true },
  // 버티는 쪽. 느린 대신 두껍다 — 침식이 빠른 유물을 맡길 자리다.
  { id: 'warden', name: '파수', statScale: { maxHp: 1.2, def: 1.25, agi: 0.8, mag: 0.85 } },
  // 먼저 움직이는 쪽. 얇은 대신 빠르고 운이 좋다 — 치명타와 선제가 값어치를 만든다.
  { id: 'seeker', name: '탐구자', statScale: { agi: 1.3, luk: 1.4, maxHp: 0.85, def: 0.9 } },
];

/** 처음부터 함께인 구성원. */
export const STARTING_MEMBERS: readonly ActorId[] = ROSTER.filter(
  (member) => member.startsInParty === true,
).map((member) => member.id);

/**
 * 파티가 다 모였을 때의 인원.
 *
 * 슬롯 수와 조합 공간이 여기서 나온다 — **조합 설계는 다 모인 상태를 기준으로 재야 한다.**
 * 도중 인원으로 재면 게임이 도달하는 폭을 영영 못 본다.
 * (소모전 쪽은 반대로 실제 진행 중인 인원으로 잰다 — `attrition.test.ts` 참조.)
 */
export const PARTY_SIZE = ROSTER.length;

/** 파티 전체의 유물 슬롯 수. 조합 공간의 크기가 여기서 나온다. */
export const TOTAL_SLOTS = PARTY_SIZE * SLOTS_PER_MEMBER;
