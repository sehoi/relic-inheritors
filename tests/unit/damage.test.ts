import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng/index.js';
import type { BattleActor } from '../../src/core/battle/index.js';
import {
  applyDamage,
  applyHeal,
  critChanceOf,
  resolveDamage,
  type AttackSpec,
  type DamageTuning,
  type ElementAffinity,
} from '../../src/core/battle/damage.js';

/** 변동폭과 치명타를 끈 결정론 설정. 공식 자체를 검사할 때 쓴다. */
const FLAT: DamageTuning = {
  pierce: 0.2,
  defFactor: 0.5,
  varianceMin: 1,
  varianceMax: 1,
  critMultiplier: 1.5,
  critBaseChance: 0,
  critLukFactor: 0,
  critMaxChance: 0.5,
  guardMultiplier: 0.5,
  minDamage: 1,
};

const actor = (
  overrides: Partial<BattleActor['stats']> = {},
  affinity?: ElementAffinity,
): BattleActor => ({
  id: 'a',
  name: 'a',
  side: 'party',
  stats: { maxHp: 100, maxMp: 20, atk: 40, def: 20, mag: 30, res: 15, agi: 10, luk: 0, ...overrides },
  hp: 100,
  mp: 20,
  erosion: 0,
  ...(affinity === undefined ? {} : { affinity }),
});

const BASIC: AttackSpec = { power: 100, element: 'none', kind: 'physical' };
const rng = (): ReturnType<typeof createRng> => createRng(1);

describe('resolveDamage — 기본 공식', () => {
  it('감산 결과를 그대로 준다', () => {
    // raw 40, 방어 20*0.5=10 => 30
    const result = resolveDamage(actor(), actor({ def: 20 }), BASIC, rng(), FLAT);
    expect(result.amount).toBe(30);
    expect(result.pierced).toBe(false);
  });

  it('위력이 배율로 작용한다', () => {
    // raw 80, -10 => 70
    const skill: AttackSpec = { ...BASIC, power: 200 };
    expect(resolveDamage(actor(), actor(), skill, rng(), FLAT).amount).toBe(70);
  });

  it('물리는 ATK/DEF, 마법은 MAG/RES 를 쓴다', () => {
    const magic: AttackSpec = { ...BASIC, kind: 'magical' };
    // raw 30(mag), 방어 15*0.5=7.5 => 22.5 => 반올림 23
    expect(resolveDamage(actor(), actor(), magic, rng(), FLAT).amount).toBe(23);
  });

  it('위력이 0 이하면 던진다', () => {
    expect(() => resolveDamage(actor(), actor(), { ...BASIC, power: 0 }, rng(), FLAT)).toThrow(
      RangeError,
    );
  });
});

describe('관통 하한 — ADR-009 의 핵심', () => {
  it('방어를 아무리 쌓아도 원 공격력의 pierce 비율은 들어간다', () => {
    // raw 40, pierce 0.2 => 하한 8
    for (const def of [100, 500, 10_000]) {
      const result = resolveDamage(actor(), actor({ def }), BASIC, rng(), FLAT);
      expect(result.amount, `DEF ${def}`).toBe(8);
      expect(result.pierced, `DEF ${def}`).toBe(true);
    }
  });

  it('방어 스택으로 무적이 되지 않는다 (순수 감산형이었다면 1이 됐을 구간)', () => {
    const attacker = actor({ atk: 42 });
    const tank = actor({ def: 200 });

    const withPierce = resolveDamage(attacker, tank, BASIC, rng(), FLAT).amount;
    const pureSubtractive = Math.max(1, 42 - 200 * 0.5);

    expect(pureSubtractive).toBe(1); // 순수 감산형은 여기서 무적
    expect(withPierce).toBeGreaterThan(pureSubtractive);
    expect(withPierce).toBe(Math.round(42 * 0.2));
  });

  it('하한이 최소 피해보다 작아도 최소 피해는 보장된다', () => {
    // raw 1, 하한 0.2 => minDamage 1 이 이긴다
    const weak = actor({ atk: 1 });
    expect(resolveDamage(weak, actor({ def: 999 }), BASIC, rng(), FLAT).amount).toBe(1);
  });

  it('감산 결과가 하한보다 크면 pierced 가 아니다', () => {
    expect(resolveDamage(actor(), actor({ def: 0 }), BASIC, rng(), FLAT).pierced).toBe(false);
  });
});

describe('속성 내성', () => {
  it('약점이면 늘고 저항이면 준다', () => {
    const fire: AttackSpec = { ...BASIC, element: 'fire' };
    const weak = resolveDamage(actor(), actor({}, { fire: 1.5 }), fire, rng(), FLAT);
    const resist = resolveDamage(actor(), actor({}, { fire: 0.5 }), fire, rng(), FLAT);

    expect(weak.amount).toBe(45);
    expect(weak.elementMod).toBe(1.5);
    expect(resist.amount).toBe(15);
  });

  it('선언되지 않은 속성은 1.0 이다', () => {
    const water: AttackSpec = { ...BASIC, element: 'water' };
    const result = resolveDamage(actor(), actor({}, { fire: 2 }), water, rng(), FLAT);
    expect(result.elementMod).toBe(1);
    expect(result.amount).toBe(30);
  });

  it('내성 0 이어도 최소 피해는 남는다', () => {
    const fire: AttackSpec = { ...BASIC, element: 'fire' };
    expect(resolveDamage(actor(), actor({}, { fire: 0 }), fire, rng(), FLAT).amount).toBe(1);
  });
});

describe('치명타', () => {
  const ALWAYS_CRIT: DamageTuning = { ...FLAT, critBaseChance: 1 };

  it('배율만큼 곱해진다', () => {
    const result = resolveDamage(actor(), actor(), BASIC, rng(), ALWAYS_CRIT);
    expect(result.critical).toBe(true);
    expect(result.amount).toBe(45); // 30 * 1.5
  });

  it('행운이 확률을 올리되 상한에 걸린다', () => {
    const tuning: DamageTuning = { ...FLAT, critBaseChance: 0.05, critLukFactor: 0.002, critMaxChance: 0.5 };
    expect(critChanceOf(actor({ luk: 0 }), tuning)).toBeCloseTo(0.05, 5);
    expect(critChanceOf(actor({ luk: 25 }), tuning)).toBeCloseTo(0.1, 5);
    expect(critChanceOf(actor({ luk: 9999 }), tuning)).toBe(0.5);
  });

  it('대략 기대한 빈도로 발생한다', () => {
    const tuning: DamageTuning = { ...FLAT, critBaseChance: 0.25 };
    const shared = createRng(2024);
    let crits = 0;
    const trials = 4000;
    for (let i = 0; i < trials; i += 1) {
      if (resolveDamage(actor(), actor(), BASIC, shared, tuning).critical) crits += 1;
    }
    expect(crits / trials).toBeCloseTo(0.25, 1);
  });
});

describe('방어', () => {
  const guarding: BattleActor = { ...actor(), guarding: true };

  it('배율만큼 피해가 줄어든다', () => {
    const result = resolveDamage(actor(), guarding, BASIC, rng(), FLAT);
    expect(result.guarded).toBe(true);
    expect(result.amount).toBe(15); // 30 * 0.5
  });

  it('관통 하한 뒤에 곱해진다 — 방어를 고르는 선택에는 값이 있어야 한다', () => {
    // raw 40, 하한 8. 방어 중이면 4 가 되어야 한다.
    const tank: BattleActor = { ...actor({ def: 10_000 }), guarding: true };
    expect(resolveDamage(actor(), tank, BASIC, rng(), FLAT).amount).toBe(4);
  });

  it('방어 중이 아니면 배율이 적용되지 않는다', () => {
    expect(resolveDamage(actor(), actor(), BASIC, rng(), FLAT).guarded).toBe(false);
  });
});

describe('변동폭과 결정론', () => {
  const VARIED: DamageTuning = { ...FLAT, varianceMin: 0.9, varianceMax: 1.1 };

  it('같은 시드는 같은 결과를 낳는다 (ADR-002)', () => {
    const a = createRng(4821);
    const b = createRng(4821);
    const runs = 20;
    const first = Array.from({ length: runs }, () => resolveDamage(actor(), actor(), BASIC, a, VARIED).amount);
    const second = Array.from({ length: runs }, () => resolveDamage(actor(), actor(), BASIC, b, VARIED).amount);
    expect(first).toEqual(second);
  });

  it('변동폭 안에 머문다', () => {
    const shared = createRng(7);
    for (let i = 0; i < 500; i += 1) {
      const amount = resolveDamage(actor(), actor(), BASIC, shared, VARIED).amount;
      expect(amount).toBeGreaterThanOrEqual(Math.round(30 * 0.9));
      expect(amount).toBeLessThanOrEqual(Math.round(30 * 1.1));
    }
  });
});

describe('applyDamage / applyHeal', () => {
  it('HP 를 깎되 0 밑으로 내려가지 않는다', () => {
    expect(applyDamage(actor(), 30).hp).toBe(70);
    expect(applyDamage(actor(), 999).hp).toBe(0);
  });

  it('회복은 최대치를 넘지 않는다', () => {
    const hurt: BattleActor = { ...actor(), hp: 40 };
    expect(applyHeal(hurt, 30).hp).toBe(70);
    expect(applyHeal(hurt, 999).hp).toBe(100);
  });

  it('쓰러진 액터를 회복으로 일으키지 못한다 (부활은 별개다)', () => {
    const down: BattleActor = { ...actor(), hp: 0 };
    expect(applyHeal(down, 50).hp).toBe(0);
  });

  it('음수를 거부한다', () => {
    expect(() => applyDamage(actor(), -1)).toThrow(RangeError);
    expect(() => applyHeal(actor(), -1)).toThrow(RangeError);
  });

  it('원본을 변경하지 않는다', () => {
    const original = actor();
    applyDamage(original, 10);
    expect(original.hp).toBe(100);
  });
});
