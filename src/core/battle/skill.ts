/**
 * 스킬과 침식 (GDD §5.4, ADR-001).
 *
 * **침식이 이 게임의 리스크 축이다.** 강한 유물 스킬일수록 침식이 많이 쌓이고,
 * 임계에 닿으면 폭주해 한 턴을 잃고 아군까지 때린다. 이게 없으면
 * "가장 센 스킬만 계속 쓰면 된다" 가 정답이 되어 조합 설계가 무의미해진다.
 *
 * 침식은 전투가 끝나도 남는다. 거점의 정화소에서 씻어내는 것이 M4 범위다.
 */

import type { AttackSpec } from './damage.js';
import type { BattleActor } from './index.js';
import type { Ailment } from './status.js';

export interface Skill {
  readonly id: string;
  readonly name: string;
  readonly mpCost: number;
  /** 사용 시 쌓이는 침식. 위력이 높을수록 크게 잡는다. */
  readonly erosion: number;
  readonly attack: AttackSpec;
  /** 명중 시 상태이상을 건다. 지속 턴을 생략하면 기본값을 쓴다. */
  readonly inflict?: {
    readonly kind: Ailment;
    readonly chance: number;
    readonly turns?: number;
  };
}

/** 상태이상 하나가 위력 몇에 해당하는가. 침식을 매길 때 쓴다. */
export type AilmentValue = Readonly<Record<Ailment, number>>;

/**
 * 실효 위력 — **위력에 상태이상의 값어치를 더한 것.**
 *
 * 침식을 순수 위력에만 비례시키면 상태이상 스킬이 침식당 값어치가 가장 높아진다.
 * 침묵은 상대의 스킬을 통째로 봉인하는데 위력은 낮게 잡히기 때문이다 — 그러면
 * "가장 싸고 센 것만 계속 쓴다" 가 정답이 되어 조합 설계가 무의미해진다 (GDD §5.4).
 *
 * 확률을 곱하는 이유는 35% 로 거는 침묵과 100% 로 거는 침묵이 같은 값어치일 수 없어서다.
 */
export function effectivePower(skill: Skill, values: AilmentValue): number {
  if (skill.inflict === undefined) return skill.attack.power;
  return skill.attack.power + values[skill.inflict.kind] * skill.inflict.chance;
}

export interface ErosionTuning {
  /** 임계의 고정분. 저레벨에서 임계가 지나치게 낮아지는 것을 막는다. */
  readonly base: number;
  /**
   * 최대 MP 1당 임계 증가분.
   *
   * **임계를 고정값으로 두면 후반에 자멸한다** (ADR-010). MP 풀이 커질수록 시전 횟수가
   * 늘고 침식도 비례해 쌓이는데, 임계만 그대로면 레벨이 오를수록 폭주가 급증한다.
   * 실측에서 보스전 승률이 Lv5 99% → Lv40 37% 로 무너졌다.
   */
  readonly perMaxMp: number;
  /**
   * 폭주 후 남는 침식의 비율.
   *
   * 0으로 두지 않는다 — 폭주가 침식을 완전히 씻어내면 "일부러 폭주시키고 다시 시작"이
   * 최적 전략이 된다. 일부만 해소되어야 거점 정화소에 갈 이유가 생긴다.
   */
  readonly reliefRatio: number;
  /** 상한 배수. 임계의 이 배까지만 쌓인다. */
  readonly maxMultiplier: number;
}

/** 이 액터가 폭주하는 침식 수치. 최대 MP 가 클수록 높다. */
export function erosionThreshold(actor: BattleActor, tuning: ErosionTuning): number {
  return tuning.base + actor.stats.maxMp * tuning.perMaxMp;
}

export function erosionCap(actor: BattleActor, tuning: ErosionTuning): number {
  return erosionThreshold(actor, tuning) * tuning.maxMultiplier;
}

export function isOverloaded(actor: BattleActor, tuning: ErosionTuning): boolean {
  return actor.erosion >= erosionThreshold(actor, tuning);
}

/**
 * 스킬을 쓸 수 없는 이유. 쓸 수 있으면 `undefined`.
 *
 * 불리언이 아니라 이유를 돌려주는 이유는, UI 가 "왜 회색인지" 를 보여줘야 하고
 * AI 도 같은 판단을 재사용하기 때문이다.
 */
export function skillBlockReason(
  actor: BattleActor,
  skill: Skill,
  tuning: ErosionTuning,
): string | undefined {
  if (isOverloaded(actor, tuning)) return '침식이 한계에 달해 유물이 봉인되었다';
  if (actor.mp < skill.mpCost) return `MP가 부족하다 (${actor.mp}/${skill.mpCost})`;
  return undefined;
}

export function canUseSkill(
  actor: BattleActor,
  skill: Skill,
  tuning: ErosionTuning,
): boolean {
  return skillBlockReason(actor, skill, tuning) === undefined;
}

/** MP 를 소비하고 침식을 쌓은 새 액터. 사용 가능 여부는 호출 전에 확인해야 한다. */
export function applySkillCost(
  actor: BattleActor,
  skill: Skill,
  tuning: ErosionTuning,
): BattleActor {
  return {
    ...actor,
    mp: Math.max(0, actor.mp - skill.mpCost),
    erosion: Math.min(erosionCap(actor, tuning), actor.erosion + skill.erosion),
  };
}

/** 폭주가 끝난 뒤 침식을 일부 해소한다. */
export function relieveErosion(actor: BattleActor, tuning: ErosionTuning): BattleActor {
  return { ...actor, erosion: Math.floor(actor.erosion * tuning.reliefRatio) };
}
