/**
 * 데미지 해석 (ADR-009).
 *
 * ```
 * raw    = 공격스탯 * power / 100
 * base   = max(raw * PIERCE, raw - 방어스탯 * DEF_FACTOR, MIN)
 * damage = round(base * variance * elementMod * critMod)
 * ```
 *
 * **`PIERCE` 관통 하한이 이 공식의 핵심이다.** 순수 감산형은 방어를 슬롯당 +2~6만 쌓아도
 * 받는 피해가 1로 고정돼 무적이 된다. 유물 8슬롯이 스탯을 보정하는 설계(ADR-004)에서
 * 그 수치는 평범한 값이라, 지배 전략이 구조적으로 발생한다.
 * 관통 하한은 방어의 상한을 묶으면서 전투 길이는 그대로 유지한다.
 *
 * 모든 상수는 `src/data/battle.ts` 에 있다 (CLAUDE.md 규칙 6).
 */

import type { Rng } from '../rng/index.js';
import type { BattleActor } from './index.js';

export const ELEMENTS = ['fire', 'water', 'thunder', 'earth', 'none'] as const;
export type Element = (typeof ELEMENTS)[number];

/**
 * 속성 상성을 5x5 고정표가 아니라 **액터별 내성**으로 둔다.
 *
 * 고정표는 "불은 흙에 강하다" 같은 관계를 전역으로 못박는다. 이 게임의 재미는
 * 적마다 다른 약점을 찾아 유물 조합을 맞추는 데 있으므로, 적이 스스로 약점을
 * 선언하는 편이 콘텐츠 설계 자유도가 높다.
 */
export type ElementAffinity = Readonly<Partial<Record<Element, number>>>;

export type AttackKind = 'physical' | 'magical';

export interface AttackSpec {
  /** 100 이 기본 공격. 스킬 위력은 이 값으로 표현한다. */
  readonly power: number;
  readonly element: Element;
  readonly kind: AttackKind;
}

export interface DamageTuning {
  /** 방어를 아무리 쌓아도 원 공격력의 이 비율은 관통한다 (ADR-009) */
  readonly pierce: number;
  readonly defFactor: number;
  readonly varianceMin: number;
  readonly varianceMax: number;
  readonly critMultiplier: number;
  readonly critBaseChance: number;
  /** 행운 1당 치명타 확률 증가분 */
  readonly critLukFactor: number;
  readonly critMaxChance: number;
  /** 방어 중인 대상이 받는 피해 배율 */
  readonly guardMultiplier: number;
  readonly minDamage: number;
}

export interface DamageResult {
  readonly amount: number;
  readonly critical: boolean;
  readonly elementMod: number;
  /** 관통 하한에 걸렸는가. 밸런스 검증(GDD §5.5)이 이 값을 본다. */
  readonly pierced: boolean;
  readonly guarded: boolean;
}

export function affinityOf(actor: BattleActor, element: Element): number {
  return actor.affinity?.[element] ?? 1;
}

export function critChanceOf(actor: BattleActor, tuning: DamageTuning): number {
  const raw = tuning.critBaseChance + actor.stats.luk * tuning.critLukFactor;
  return Math.min(Math.max(raw, 0), tuning.critMaxChance);
}

/**
 * 한 번의 공격이 주는 피해를 계산한다.
 *
 * RNG 소비 순서는 **변동폭 → 치명타** 로 고정한다. 순서가 바뀌면 같은 시드로도
 * 다른 결과가 나와 재현이 깨진다 (ADR-002).
 */
export function resolveDamage(
  attacker: BattleActor,
  defender: BattleActor,
  attack: AttackSpec,
  rng: Rng,
  tuning: DamageTuning,
): DamageResult {
  if (attack.power <= 0) {
    throw new RangeError(`공격 위력은 양수여야 합니다 (받은 값: ${attack.power}).`);
  }

  const offense = attack.kind === 'physical' ? attacker.stats.atk : attacker.stats.mag;
  const defense = attack.kind === 'physical' ? defender.stats.def : defender.stats.res;

  const raw = (offense * attack.power) / 100;
  const mitigated = raw - defense * tuning.defFactor;
  const floor = raw * tuning.pierce;

  const pierced = mitigated < floor;
  const base = Math.max(floor, mitigated, tuning.minDamage);

  const variance =
    tuning.varianceMin + rng.next() * (tuning.varianceMax - tuning.varianceMin);
  const critical = rng.chance(critChanceOf(attacker, tuning));
  const elementMod = affinityOf(defender, attack.element);
  const critMod = critical ? tuning.critMultiplier : 1;

  // 방어는 관통 하한 **뒤에** 곱해진다. 하한은 "방어력으로 막을 수 없는 몫"이지
  // "방어 커맨드로도 못 줄이는 몫"이 아니다 — 방어를 고르는 선택에는 값이 있어야 한다.
  const guarded = defender.guarding === true;
  const guardMod = guarded ? tuning.guardMultiplier : 1;

  const amount = Math.max(
    tuning.minDamage,
    Math.round(base * variance * elementMod * critMod * guardMod),
  );

  return { amount, critical, elementMod, pierced, guarded };
}

/** HP 를 깎은 새 액터를 돌려준다. 0 미만으로 내려가지 않는다. */
export function applyDamage(actor: BattleActor, amount: number): BattleActor {
  if (amount < 0) {
    throw new RangeError(`피해량은 음수일 수 없습니다 (받은 값: ${amount}). 회복은 applyHeal 을 쓰세요.`);
  }
  return { ...actor, hp: Math.max(0, actor.hp - amount) };
}

/** HP 를 회복한 새 액터를 돌려준다. 최대치를 넘지 않으며, 쓰러진 액터는 살리지 못한다. */
export function applyHeal(actor: BattleActor, amount: number): BattleActor {
  if (amount < 0) {
    throw new RangeError(`회복량은 음수일 수 없습니다 (받은 값: ${amount}).`);
  }
  // 부활은 별도 처리다. 회복 아이템이 쓰러진 동료를 조용히 일으키면 부활의 의미가 사라진다.
  if (actor.hp <= 0) return actor;
  return { ...actor, hp: Math.min(actor.stats.maxHp, actor.hp + amount) };
}
